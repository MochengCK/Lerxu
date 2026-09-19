package com.lerxu.android.browser

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import android.net.http.SslError
import android.os.Handler
import android.os.Looper
import android.view.ContextThemeWrapper
import android.view.MotionEvent
import android.view.PixelCopy
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.FrameLayout
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.net.HttpURLConnection
import java.net.URI
import androidx.webkit.ProfileStore
import androidx.webkit.ScriptHandler
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.lerxu.android.R
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlin.math.abs
import kotlin.math.roundToInt
import java.io.File

/** 一次「交给下载引擎」的请求：URL + 建议文件名 + 逐任务请求头。 */
data class DownloadHandoff(
    val url: String,
    val fileName: String = "",
    val headers: List<String> = emptyList(),
    val fromPage: String = ""
)

/**
 * 内置浏览器的持有者：管理多个标签页。
 *
 * 为什么单独抽一个类：切换页面（任务/浏览器/设置）会销毁 Compose 的
 * AndroidView，但 WebView 本身要活下来，否则每次回浏览器都要重新加载。
 * 这里把 WebView、页面状态与嗅探结果放在 Compose 之外持有，切页只是
 * 重新挂载；标签页之间同理 —— 切换标签只是换一个已存在的 WebView。
 *
 * 每个标签页有**各自的** WebView 与页面状态（地址、标题、加载进度、
 * 前进历史、嗅探结果），所以切标签不会串台。
 *
 * 采集与拦截三条通道（与桌面扩展同口径）：
 * 1. 注入脚本 [VideoSniffer.INJECT_JS] —— 拿得到 MIME 与体积（XHR / fetch / 媒体元素）；
 * 2. `shouldInterceptRequest` —— 拿不到响应头，但能覆盖脚本看不到的请求；
 * 3. `DownloadListener` 与 `shouldOverrideUrlLoading` —— 明确的下载链接与
 *    `magnet:` 之类的协议，直接转交引擎。
 */
class BrowserController(
    private val context: Context,
    private val onDownloadRequest: (DownloadHandoff) -> Unit
) {

    companion object {
        /**
     * 无痕会话的有效时长（毫秒）。
     *
     * **不能是 0**：0 在 `IncognitoAuthChecker.isAuthExpired` 里等价于"已过期"，
     * 于是刚认证完就被判过期、立刻退回普通窗口 —— 这正是"认证后进不去无痕"的原因。
     */
    const val INCOCOGNICO_AUTH_DURATION: Long = 30L * 60L * 1000L

        /** 缩略图相对网页视口的缩放比（卡片用不到原尺寸；0.4 下每张约 0.8MB）。 */
        private const val THUMB_SCALE = 0.4f

        /** 我们自己的浏览器首页（本地资源，不依赖任何外部站点）。 */
        const val HOME_URL = "file:///android_asset/browser-home.html"

        /**
         * 单次会话里最多问多少次资源大小（[probeSize]）。
         *
         * 长视频页面的分片可能是上百个，每个都发一次请求既慢又费流量；列表里
         * 前几十条拿到真实大小就够用了，剩下的继续显示"大小未知"。
         */
        private const val MAX_SIZE_PROBES = 40

        /**
         * 标签页上限。每个标签页都持有一个 WebView（各自一份渲染器状态），
         * 不做无上限堆叠 —— 在低内存机器上堆太多会被系统直接杀掉进程。
         */
        const val MAX_TABS = 8

        /** Chromium 的 net::ERR_ABORTED：上一次导航被新导航取代，不是真失败。 */
        private const val ERROR_ABORTED = -3

        /** 首页色板的 token 个数（bg/panel/border/text/muted/primary，与 browser-home.html 同序）。 */
        private const val HOME_COLOR_TOKENS = 6

        /**
         * 无痕窗口专用的 WebView profile 名（cookie / 站点数据 / 缓存自成一份）。
         *
         * 它在**应用启动时**被整个删掉（见 init）：无痕会话不跨进程，进程一结束
         * 就该清干净；而**普通窗口那份（默认 profile）分毫不受影响** ——
         * 这是"两个窗口互不影响"的底座。切换普通/无痕时不删，否则切回来的
         * 标签页全掉登录态。
         */
        private const val INCOGNITO_PROFILE = "lerxu_incognito"

        /**
         * 上次退出时（**普通窗口**）开着的标签页与当前活动下标。
         *
         * 存 URL 与**标题**（标题让重启后的卡片立刻有字可读），缩略图另存文件
         *（见 [persistThumbnails]）。无痕窗口一律不存，进无痕时连旧的也一起清掉
         *（见 [persistTabs]）。
         */
        private const val PREF_TABS = "tabs_restore"
        private const val PREF_TAB_ACTIVE = "tabs_restore_active"

        /** 与 [PREF_TABS] **逐行对应**的标题串（空标题是空行，不能过滤掉）。 */
        private const val PREF_TAB_TITLES = "tabs_restore_titles"

        /** 与 [PREF_TABS] **逐行对应**的"每页访问地址栈"（自建历史，见 [Tab.visited]）。 */
        private const val PREF_TAB_HISTORY = "tabs_restore_history"

        /** 每页自建访问栈的深度上限：够回退到"上一层"，又不至于无限长。 */
        private const val MAX_VISITED = 40
    }

    /**
     * 一个标签页。
     *
     * WebView 懒创建（第一次真正要显示时再建），[generation] 在渲染进程被
     * 杀后递增，界面据 key 换用新实例。
     */
    class Tab internal constructor(val id: Long) {

        /** 本标签页的 WebView（未创建 / 渲染进程死后为 null）。 */
        var webView: WebView? = null
            internal set

        /** 转交引擎时作为 `Referer` 的页面地址。 */
        internal var referer: String = ""
        internal var pendingHomeFocus = false

        /**
         * 是否已经为本标签页请求过首页。
         *
         * 不能用「WebView 是否为 null」来判断"还没加载过"：AndroidView 的
         * factory 会先建出一个空白 WebView，之后就再没人会去开首页了。
         */
        internal var homeRequested = false

        var url by mutableStateOf("")
            internal set
        var title by mutableStateOf("")
            internal set
        var loading by mutableStateOf(false)
            internal set
        var progress by mutableStateOf(0)
            internal set
        var loadError by mutableStateOf<String?>(null)
            internal set
        var canGoBack by mutableStateOf(false)
            internal set
        var canGoForward by mutableStateOf(false)
            internal set
        var isHomePage by mutableStateOf(false)
            internal set
        var generation by mutableStateOf(0)
            internal set

        /**
         * 下拉刷新已触发、这一页还在加载。
         *
         * 界面据此让顶部的刷新指示器**持续旋转到加载结束** —— 少了它，松手
         * 那一刻指示器就只剩收回动作，「正在刷新」在界面上没有落点。
         *
         * 放在标签页上（不是控制器上）：每个标签页各刷各的，切页不会串。
         */
        var pullRefreshing by mutableStateOf(false)
            internal set

        /** 下拉刷新的看门狗（页面迟迟不回调 `onPageFinished` 时的兜底）。 */
        internal var pullWatchdog: Runnable? = null

        /**
         * 卡片缩略图：这一页最后一次**在台前**时的画面快照。
         *
         * 只在页面可见时抓（打开网格抓当前页、切走前抓旧页）—— 隐藏的
         * WebView 本来就画不出内容，与其软件绘制一张灰板子，不如让界面
         * 回退到图标 + 标题的占位样式。
         */
        var thumbnail by mutableStateOf<Bitmap?>(null)
            internal set

        /**
         * 这张缩略图是对着**哪一页**抓的。
         *
         * 缩略图只在页面加载完成那一刻抓一次（那时是页面顶部、画面也刚画上去），
         * 之后翻页会重新抓；**同一次加载里不再覆盖** —— 否则用户往下滚了多远，
         * 卡片里就跟到多远（用户点名：「网页向下滑动后，它在标签页里就跟着向下滑动，
         * 导致内容没有显示」）。
         */
        internal var thumbUrl: String? = null

        /** 上次写进磁盘的那张图（引用比较即可，避免每次落盘都重新编码 JPEG）。 */
        internal var savedThumb: Bitmap? = null

        /** 本标签页嗅探到的资源（最新的在最前）。 */
        val sniffed = mutableStateListOf<SniffedResource>()

        /**
         * 网页里那层**贴底、整宽**的弹窗（cookie 条、底部操作条、半屏登录罩）的高度
         *（CSS px，与 dp 同数值），0 = 没有。
         *
         * 这类元素**不上移**：它是"铺满整宽、贴着屏底"的一条，抬起来必定在下方
         * 露出一条空隙（用户点名：「像那种全覆盖向上移动，就会导致底部空出来空间」）。
         * 换成让**坞**抬到它上面去：网页不动、弹窗完整可见、坞也还在。
         */
        var bottomOverlayPx by mutableStateOf(0)
            internal set

        /** 整屏覆盖的弹窗（登录罩 / 全屏弹窗）：坞干脆让开（滑走藏起来）。 */
        var bottomOverlayAll by mutableStateOf(false)
            internal set

        /**
         * 从上次会话恢复出来的标签页：**第一次摆到台前时才真正加载**。
         *
         * 启动时同时开 7、8 个 WebView 又慢又吃内存（低端机直接被杀），所以恢复出来的
         * 标签页只记住地址，等用户第一次切到它时再交给 WebView（见 [syncActiveView]）。
         */
        internal var pendingUrl: String? = null

        /** 文档起始脚本句柄（主题切换时先撤再挂，保证新文档拿到新值）。 */
        internal var themeDocStart: ScriptHandler? = null

        /**
         * 这一页的**访问地址栈**（自建历史，最新的在最后）。
         *
         * WebView 的前后退列表**不跨进程**：重启后恢复出来的页面 `canGoBack()`
         * 恒为 false，"回退到上一层"无从谈起（用户点名「回退不了」）。这份栈由
         * `doUpdateVisitedHistory` 维护、跟标签页一起落盘；WebView 自己退不动
         * 时（见 [goBack]）用它兜底。
         */
        val visited = mutableListOf<String>()

        /** 用自建栈回退后，等新页加载完把它自己的历史清掉（见 [goBack] / onPageFinished）。 */
        internal var pendingHistoryClear = false
    }

    private val main = Handler(Looper.getMainLooper())
    private val json = Json { ignoreUnknownKeys = true }
    private var nextTabId = 1L

    /** 上次会话的标签页只恢复一次（见 [restoreTabs]；声明必须在 init 之前）。 */
    private var tabsRestored = false

    /**
     * 所有标签页 WebView 的宿主容器（Compose 只挂它一次）。
     *
     * 为什么不让 Compose 直接挂 WebView：那样切标签就得把 WebView 从一棵
     * 视图树上摘下来再挂到另一棵，反复 detach/attach 一个 WebView 是崩溃与
     * 白屏的高发点。这里改成 **一个容器装所有页、用可见性切换当前页**：
     * 切标签只是把某一页设为 VISIBLE、其余 GONE，视图树始终不动。
     *
     * 容器同时负责识别滑动手势（见 [SwipeHost]）：Compose 的 pointerInput
     * 收不到被 WebView 子视图消费的触摸，拦截只能做在 ViewGroup 这一层。
     */
    private val viewHost = SwipeHost(context)

    /** 应用偏好（目前只用来记"上次会话停在无痕窗口里"，见下面的 init）。 */
    private val prefs by lazy {
        context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
    }

    /** 所有标签页；不变量：任何时候都至少有一个。 */
    val tabs = mutableStateListOf<Tab>()

    /**
     * **每个窗口模式各一个寄存槽**（无痕 ⇄ 普通切换时对调）。
     *
     * 两个槽是必须的：只留一个的话，"进无痕"这一步刚把普通那套存进去、
     * 紧接着的"恢复"就会把同一套又放回来（等于没换，无痕里还显示普通标签
     * —— 用户点名的 bug）。
     *
     * 寄存 = 连 WebView 一起留在宿主里、只是不可见 —— 切回去时页面状态原样，
     * 不重载（见 [parkCurrentTabs] / [restoreParkedTabs]）。
     */
    private var parkedNormalTabs: MutableList<Tab> = mutableListOf()
    private var parkedNormalActiveId = 0L
    private var parkedIncognitoTabs: MutableList<Tab> = mutableListOf()
    private var parkedIncognitoActiveId = 0L

    init {
        /**
         * 无痕会话**不跨进程**：它只在内存里活着（标签页 + WebView），真正
         * "退出应用"后就该没了。磁盘上还可能留着它那份 profile（cookie /
         * 站点数据 / 缓存）—— 启动时删掉即是清干净，而普通窗口那份
         *（默认 profile）分毫不受影响。崩溃 / 被回收走的是同一条路。
         */
        deleteIncognitoProfile()
    }

    var activeId by mutableStateOf(0L)
        private set

    /** 标签页网格是否展开（界面据此隐藏底部坞、把网页缩小）。 */
    var tabsOpen by mutableStateOf(false)
        private set

    /** 横向滑动导航的方向（None = 当前没在手势里）。 */
    enum class SwipeNav { None, Forward, Back }

    /**
     * 滑动手势的进行状态（界面据此画提示动画）。
     * 进度都是 0..1，到 1 表示达到触发阈值；抬手后归零，动画端负责回落。
     */
    var swipeNav by mutableStateOf(SwipeNav.None)
        internal set
    var swipeNavProgress by mutableStateOf(0f)
        internal set
    var pullProgress by mutableStateOf(0f)
        internal set

    /** 当前页是否正在下拉刷新（界面据此让顶部指示器一直转）。 */
    val pullRefreshing: Boolean get() = active.pullRefreshing

    /**
     * 首页居中搜索框是否聚焦（页面里的 focus/blur 经 JS 桥回传）。
     * 界面用它决定「返回下载器」按钮让不让位：聚焦时它该消失。
     */
    var homeInputFocused by mutableStateOf(false)
        internal set

    /**
     * 「已提交、导航还没开始」的窗口：按下回车到 onPageStarted 之间，
     * 旧页面地址还在（可能是首页），不补这个状态返回按钮会闪出来。
     */
    var navSubmitting by mutableStateOf(false)
        internal set

    /**
     * 现代模式（界面同步）：开启后网页滚动会收起底部坞 ——
     * 下滑（看更多内容）收成只剩链接输入框并缩小，上滑恢复。
     */
    var dockModern: Boolean = false

    /**
     * 避让脚本的启停状态（`null` = 还没下发过）。
     *
     * 注入的脚本是**跟着页面活着**的：页面里那段 IIFE 一旦跑起来，它的
     * `MutationObserver` 就会一直盯着 DOM 把"贴底整宽弹窗"报上来。所以
     * **切回传统模式时必须主动把它停掉**，否则传统模式的工具栏会按现代模式
     * 的规则让位（用户点名：传统浏览器触发了底部全覆盖弹窗的避让）；
     * 反过来切回现代时，已经加载过的页面也要补一次注入。
     */
    private var dockAvoidOn: Boolean? = null

    /** 最近一次下发的让位带（px）：新页面注入时直接带上，别用脚本里的默认值。 */
    private var dockAvoidPad = 88

    /**
     * 系统手势条那一截的高度（dp ≈ 页面里的 CSS px，界面下发）。
     *
     * 现代模式网页铺到屏幕底，网页自己的**贴底整宽底部导航**会有一截落在小横条
     * 区域里（点不到、也被系统手势抢）。脚本按这个值给那种元素补一段
     * `padding-bottom`：内容抬到小横条之上，背景仍然贴到屏幕底 —— 不会在下方
     * 露出应用底色（割裂感）。
     */
    private var gesturePad = 0

    /**
     * 坞顶部面板（设置 / 引擎选择）是否展开（界面同步）：
     * 面板开着时暂停"滚动收起"，否则向上长出的面板会被收进屏幕，
     * 用户正在选的东西凭空消失。
     */
    var dockPanelsOpen: Boolean = false

    /** 坞是否处于收起态（网页滚动 / 在坞上拖动都会改它，界面跟随动画）。 */
    var dockCollapsed by mutableStateOf(false)
        internal set

    /** 当前是否为无痕模式 */
    var incognitoMode by mutableStateOf(false)
        internal set
    
    /** 无痕模式的最后认证时间戳（毫秒），用于判断是否需要重新认证 */
    internal var incognitoLastAuthTime by mutableStateOf(0L)
        internal set

    /** 无痕模式的有效时长（毫秒） - 默认为 0，即每次退出或重启都需重新认证 */

    /** 地址是否命中某个引擎的搜索结果页（host 后缀 + 路径一致）。 */
    private fun urlMatchesEngine(url: String, se: SearchEngine): Boolean {
        if (url.isBlank()) return false
        val target = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        val engineUrl = runCatching {
            Uri.parse(se.searchUrl.replace("%s", ""))
        }.getOrNull() ?: return false
        val host = target.host ?: return false
        val engineHost = engineUrl.host ?: return false
        return (host == engineHost || host.endsWith(engineHost.substringAfter('.'))) &&
            target.path == engineUrl.path
    }

    /** 从结果页地址里按该引擎的查询参数名抠出关键词。 */
    private fun searchQueryOf(url: String, se: SearchEngine): String? {
        val param = runCatching {
            Uri.parse(se.searchUrl.replace("%s", "")).query
        }.getOrNull()?.substringBefore('=')?.takeIf { it.isNotEmpty() } ?: return null
        return runCatching { Uri.parse(url).getQueryParameter(param) }.getOrNull()
    }

    /**
     * 换引擎。若当前正停在**旧引擎**的搜索结果页上，就带着同样的关键词
     * 切到新引擎重新搜一次 —— 用户已经搜过也要立刻换成新引擎的结果。
     */
    fun pickEngine(key: String) {
        val previous = engine
        val next = SearchEngines.byKey(key)
        engine = next
        if (previous.key == next.key) return
        val tab = active
        if (tab.isHomePage || !urlMatchesEngine(tab.url, previous)) return
        val query = searchQueryOf(tab.url, previous)?.takeIf { it.isNotBlank() } ?: return
        navSubmitting = true
        viewOf(tab).loadUrl(next.searchUrl.replace("%s", BrowserUrl.encodeQuery(query)))
    }

    /**
     * 进入无痕窗口。
     *
     * **两个窗口互不影响**（用户点名：普通窗口的数据要持久、无痕只是临时的）：
     *
     * - 普通那套标签页连 WebView 一起**原样寄存**（不释放、不重载、不清数据），
     *   缩略图与落盘记录都保持不动；
     * - 无痕这边从一张干净的首页开始，标签页只在内存里（[persistTabs] 全程跳过）；
     * - 数据隔离靠**独立 profile**（见 [createWebView]）：无痕的 cookie / 站点
     *   数据 / 缓存自成一份，退出时把 profile 一删就干净 —— 不再去动公共存储
     *   （以前那版会把普通窗口的登录态一起清掉，正是这一版要修的问题）。
     */
    fun enterIncognito() {
        if (incognitoMode) return
        // 先把普通模式的标签页落盘 —— 那一份是"持久化窗口"的真相，之后再切
        // 回来（或重启）都按它恢复
        persistTabs()
        // **两套标签页对调**：普通那套连 WebView 一起原样寄存到它自己的槽里
        //（不释放、不清数据），无痕那套从**它自己的槽**里取
        parkCurrentTabs(incognitoSlot = false)
        incognitoMode = true
        incognitoLastAuthTime = System.currentTimeMillis()
        // 无痕那套还在（上次退出无痕时寄存的）就原样放回 —— 切到普通再切回来，
        // 无痕里的标签页与页面状态都还在；第一次进才开一张新首页
        if (!restoreParkedTabs(incognitoSlot = true)) openFreshHomeTab()
    }

    /**
     * 退出无痕窗口。
     *
     * 无痕这套**同样寄存**（不释放）：只有**退出应用**才会真正消失 ——
     * 用户点名"切回普通再切回来不该丢"。它从不落盘（[persistTabs] 全程跳过），
     * 进程一结束就没了；磁盘上的 profile 也在下次启动时删掉（见 init）。
     * 普通那套原样放回，两个窗口互不影响。
     */
    fun exitIncognito() {
        if (!incognitoMode) return
        // 无痕那套寄存回**它自己的槽**；普通那套从普通槽取回
        parkCurrentTabs(incognitoSlot = true)
        incognitoMode = false
        incognitoLastAuthTime = 0L
        tabsOpen = false
        restoreParkedTabs(incognitoSlot = false)
    }

    /**
     * 把当前这套标签页寄存起来（无痕 ⇄ 普通对调时用）。
     *
     * **只摘出来、不销毁**：WebView 还留在宿主容器里（只是全部设为不可见），
     * 切回来时页面状态原样，不重载。[incognitoSlot] 指明存进哪个槽。
     */
    private fun parkCurrentTabs(incognitoSlot: Boolean) {
        tabs.forEach { it.webView?.visibility = View.GONE }
        if (incognitoSlot) {
            parkedIncognitoTabs = tabs.toMutableList()
            parkedIncognitoActiveId = activeId
        } else {
            parkedNormalTabs = tabs.toMutableList()
            parkedNormalActiveId = activeId
        }
        tabs.clear()
        activeId = 0L
    }

    /** 把 [incognitoSlot] 那套放回来；该槽是空的就返回 false（调用方自己开新页）。 */
    private fun restoreParkedTabs(incognitoSlot: Boolean): Boolean {
        val back = if (incognitoSlot) parkedIncognitoTabs else parkedNormalTabs
        val remembered = if (incognitoSlot) parkedIncognitoActiveId else parkedNormalActiveId
        if (incognitoSlot) {
            parkedIncognitoTabs = mutableListOf()
            parkedIncognitoActiveId = 0L
        } else {
            parkedNormalTabs = mutableListOf()
            parkedNormalActiveId = 0L
        }
        if (back.isEmpty()) return false
        tabs.clear()
        tabs.addAll(back)
        activeId = if (back.any { it.id == remembered }) remembered else back.first().id
        syncActiveView()
        return true
    }

    /** 无痕窗口的起点：一张干净的首页标签页。 */
    private fun openFreshHomeTab() {
        val tab = Tab(nextTabId++)
        tabs += tab
        activeId = tab.id
        loadHome(focus = false)
        syncActiveView()
    }

    /**
     * 删掉无痕用的那个 WebView profile。
     *
     * 无痕的 cookie / 站点数据 / 缓存都在这个独立 profile 里（见 [createWebView]），
     * 整个删掉就是"清干净"，而**普通窗口那份 profile 分毫不受影响**。
     */
    private fun deleteIncognitoProfile() {
        runCatching {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
                ProfileStore.getInstance().deleteProfile(INCOGNITO_PROFILE)
            }
        }
    }

    /** 关掉最后一个标签页时的回调：界面据此退回任务页。 */
    var onAllTabsClosed: () -> Unit = {}

    /**
     * 搜索/地址解析用的引擎。
     *
     * 选择入口在底部坞的引擎选择框（界面持久化后同步到这里），
     * 本地首页不再有引擎标签。
     */
    var engine: SearchEngine = SearchEngines.byKey(null)

    /**
     * WebView 的底色（当前主题的页面底色）。
     *
     * 页面加载完成前、以及页面没画满的地方都会露出它 —— 不设的话是白的，
     * 深色主题下每次开新页面都会闪一下白。
     */
    var themeBackground: Int = android.graphics.Color.WHITE
        set(value) {
            if (field == value) return
            field = value
            viewHost.setBackgroundColor(value)
            tabs.forEach { it.webView?.setBackgroundColor(value) }
        }

    /**
     * 首页外观与语言（界面同步；变化时推给已加载的首页，不用重载）。
     *
     * 同时决定外部网页的「算法变暗」：WebView 在**创建时**按此刻的明暗
     * 定下 uiMode —— 深色主题下浅色站点被渲染成深色。已开着的标签页
     * 不会中途翻转，新标签页与重建后的页面跟随新主题。
     */
    var homeDark: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            // 深浅色在 WebView 创建时定死（见 themedContext）：全部重建重载。
            // 主题开关不在浏览器页，这些页面都在后台，重建对用户不可见；
            // 再回到浏览器时站点已按新主题**重新渲染**（用它自己的深色模式）
            rebuildWebViewsForTheme()
            if (active.isHomePage) refreshHomeConfig(active)
        }

    /**
     * 主题切换后重建各标签页的 WebView。
     *
     * 站点的 prefers-color-scheme 取自 WebView 创建时的壳主题（isLightTheme），
     * 已存在的 WebView 无论如何都换不过去 —— 只靠注入改色会把站点自己的
     * 深色模式盖掉（用户要的正是站点自己的那套）。重建 + 重载当前地址是最
     * 干净的做法；back/forward 历史迁不走，代价是这一页的历史栈清空。
     */
    private fun rebuildWebViewsForTheme() {
        var rebuilt = false
        // 两套都重建（含寄存在后台的另一套）：否则在无痕里切主题后，
        // 换回普通窗口看到的还是旧主题的页面
        (tabs + parkedNormalTabs + parkedIncognitoTabs).forEach { tab ->
            val old = tab.webView ?: return@forEach
            val url = tab.url.ifBlank { HOME_URL }
            rebuilt = true
            tab.webView = null
            runCatching {
                (old.parent as? ViewGroup)?.removeView(old)
                old.removeJavascriptInterface("LerxuSniffer")
                old.removeJavascriptInterface("LerxuHome")
                old.removeJavascriptInterface("LerxuDock")
                old.stopLoading()
                old.destroy()
            }
            tab.loading = false
            tab.progress = 0
            tab.loadError = null
            tab.canGoBack = false
            tab.canGoForward = false
            val fresh = viewOf(tab)
            if (url.startsWith(HOME_URL)) tab.homeRequested = true
            runCatching { fresh.loadUrl(url) }
            tab.url = url
        }
        if (rebuilt) syncActiveView()
    }

    var homeLang: String = "zh"
        set(value) {
            if (field == value) return
            field = value
            if (active.isHomePage) refreshHomeConfig(active)
        }

    /**
     * 首页色板：应用当前主题的十六进制色（#RRGGBB），按 browser-home.html
     * CSS 变量的固定顺序逗号分隔（bg/panel/border/text/muted/primary）。
     * 随主题切换重新下发，页面不重载。
     */
    var homeColors: String = ""
        set(value) {
            if (field == value) return
            field = value
            if (active.isHomePage) refreshHomeConfig(active)
        }

    init {
        viewHost.setBackgroundColor(themeBackground)
        val first = Tab(nextTabId++)
        tabs += first
        activeId = first.id
        // 普通窗口的标签页是**持久**的：把上次退出时的标签页还原成"待加载"状态
        //（只有活动那个会在第一次进浏览器时真的加载，见 syncActiveView）
        restoreTabs()
    }

    // ─── 标签页的持久化 ───

    /**
     * 把当前标签页落盘（普通窗口才有意义）。
     *
     * 存三样：URL 行、与之**逐行对应**的标题行、活动下标，外加每格的缩略图文件。
     * **无痕窗口不存**，而且进无痕时把旧的也清掉（[enterIncognito]）—— 否则下次启动
     * 会把无痕期间访问过的页面恢复到普通窗口里，那就不是无痕了。
     *
     * 只剩一个空白页 / 一个自家首页时视为"什么都没开"，记录与缩略图一起清掉。
     */
    fun persistTabs() {
        if (incognitoMode) return
        val urls = tabs.map { it.url }
        val titles = tabs.map { it.title }
        val activeIndex = TabPersistence.activeIndexOf(urls, tabs.indexOfFirst { it.id == activeId })
        if (TabPersistence.isTrivial(urls)) {
            prefs.edit().remove(PREF_TABS).remove(PREF_TAB_ACTIVE).remove(PREF_TAB_TITLES).apply()
            clearThumbnails()
            return
        }
        val (urlText, titleText) = TabPersistence.encode(urls, titles)
        // 与落盘列表**同序**的那批标签页（空白页不落盘，缩略图 / 访问栈都跟着它的下标走）
        val kept = tabs.filter { it.url.isNotBlank() }.take(MAX_TABS)
        prefs.edit()
            .putString(PREF_TABS, urlText)
            .putString(PREF_TAB_TITLES, titleText)
            // 自建访问栈：重启后"回退到上一层"靠它（WebView 的历史不跨进程）
            .putString(
                PREF_TAB_HISTORY,
                TabPersistence.encodeHistory(kept.map { it.visited.toList() })
            )
            .putInt(PREF_TAB_ACTIVE, activeIndex.coerceAtLeast(0))
            .apply()
        persistThumbnails(kept)
    }

    /** 缩略图文件目录（`filesDir/tab-thumbs/<下标>.jpg`）。 */
    private val thumbDir: File get() = File(context.filesDir, "tab-thumbs")

    /**
     * 卡片缩略图跟着标签页落盘。
     *
     * 用户点名过「重启后标签页里的标签是一片空白，必须点进去才重新显示」：恢复出来的
     * 标签页是**待加载**状态，没有页面就没有快照，卡片只剩一块空面板。所以把每格的
     * 小图（几十 KB，0.4 缩放）一起存下来，重启后卡片与退出前一致。
     *
     * 只有**换过图**（引用不同）的格子才重新编码；多余的文件删掉。
     */
    private fun persistThumbnails(kept: List<Tab>) {
        runCatching {
            val dir = thumbDir
            if (!dir.exists() && !dir.mkdirs()) return
            kept.forEachIndexed { index, tab ->
                if (tab.thumbnail == null) {
                    tab.savedThumb = null
                    File(dir, "$index.jpg").delete()
                    return@forEachIndexed
                }
                if (tab.savedThumb === tab.thumbnail) return@forEachIndexed
                File(dir, "$index.jpg").outputStream().use { out ->
                    tab.thumbnail?.compress(Bitmap.CompressFormat.JPEG, 72, out)
                }
                tab.savedThumb = tab.thumbnail
            }
            // 标签变少了：越界的那些格子留下来只会在下次恢复时张冠李戴
            dir.listFiles()?.forEach { file ->
                val n = file.nameWithoutExtension.toIntOrNull() ?: return@forEach
                if (n >= kept.size) file.delete()
            }
        }
    }

    /** 读回某一格的缩略图（没有 / 解不出来都是 null）。 */
    private fun restoreThumbnail(index: Int): Bitmap? = runCatching {
        val file = File(thumbDir, "$index.jpg")
        if (file.exists()) BitmapFactory.decodeFile(file.absolutePath) else null
    }.getOrNull()

    private fun clearThumbnails() {
        runCatching { thumbDir.listFiles()?.forEach { it.delete() } }
    }

    /**
     * 还原上次的标签页（普通窗口）。**只创建标签页、不加载** ——
     * 启动时同时开 7、8 个 WebView 又慢又吃内存，加载留给 [syncActiveView]
     * 在标签页第一次摆到台前时做。
     *
     * 标题与缩略图一起还原：卡片立刻就是"上次看到的样子"，而不是一块空面板。
     */
    private fun restoreTabs() {
        if (tabsRestored) return
        tabsRestored = true
        val saved = TabPersistence.decode(prefs.getString(PREF_TABS, null))
        if (saved.isEmpty()) return
        val titles = TabPersistence.decodeTitles(prefs.getString(PREF_TAB_TITLES, null))
        val histories = TabPersistence.decodeHistory(prefs.getString(PREF_TAB_HISTORY, null))
        val activeIndex = prefs.getInt(PREF_TAB_ACTIVE, 0).coerceIn(0, saved.size - 1)
        runCatching {
            tabs.toList().forEach { releaseTab(it) }
            tabs.clear()
            saved.take(MAX_TABS).forEachIndexed { index, url ->
                val tab = Tab(nextTabId++)
                tab.url = url
                tab.isHomePage = url.startsWith(HOME_URL)
                tab.pendingUrl = url
                tab.title = titles.getOrElse(index) { "" }
                // 自建访问栈：整条链都在，回退因此能跨重启工作；
                // 旧版本落的盘没有这份记录时，至少把当前地址放进去
                tab.visited += histories.getOrElse(index) { emptyList() }
                if (tab.visited.lastOrNull() != url) tab.visited += url
                tab.thumbnail = restoreThumbnail(index)
                // 与磁盘上那张是同一张：别在第一次落盘时白编码一遍
                tab.savedThumb = tab.thumbnail
                tabs += tab
            }
            activeId = tabs[activeIndex.coerceIn(0, tabs.size - 1)].id
        }
    }

    // ─── 活动标签页的便捷读取（界面大多只关心当前这一页） ───

    val active: Tab
        get() = tabs.firstOrNull { it.id == activeId } ?: tabs[0]

    val tabCount: Int get() = tabs.size

    val sniffed: List<SniffedResource> get() = active.sniffed
    val currentUrl: String get() = active.url
    val pageTitle: String get() = active.title
    val loading: Boolean get() = active.loading
    val progress: Int get() = active.progress
    val canGoBack: Boolean get() = active.canGoBack
    val canGoForward: Boolean get() = active.canGoForward
    val loadError: String? get() = active.loadError
    val isHomePage: Boolean get() = active.isHomePage

    /**
     * 网页里贴底整宽的弹窗高度（px≈dp，0 = 没有）：坞据此**抬到它上面**，
     * 而不是把弹窗上移（那会在下方留一条空隙）。
     */
    val bottomOverlayPx: Int get() = active.bottomOverlayPx

    /** 整屏覆盖的弹窗：坞滑走让开（全屏弹窗的底部按钮不该被坞盖住）。 */
    val bottomOverlayAll: Boolean get() = active.bottomOverlayAll

    /** 这一页还是空白（从没加载过任何东西，也没失败过）。 */
    val isBlankTab: Boolean
        get() = active.url.isBlank() && active.loadError == null

    /** 活动标签页的 WebView（未创建就现建）。 */
    val webView: WebView get() = viewOf(active)

    // ─── 标签页管理 ───

    /**
     * 新建标签页并切过去，同时打开自家首页。
     *
     * 这里显式加载而不是等界面来补：新标签页的 WebView 会先被 AndroidView
     * 创建出来，之后就过了「空标签页」的判定，没人再会去加载首页。
     */
    fun newTab(): Tab? {
        if (tabs.size >= MAX_TABS) return null
        val tab = Tab(nextTabId++)
        tabs += tab
        activeId = tab.id
        loadHome(focus = false)
        syncActiveView()
        persistTabs()
        return tab
    }

    /**
     * 外部跳进来的**网页**链接（系统分享 / 别的 App 的 ACTION_VIEW）。
     *
     * 新开一个标签页加载，而不是顶掉用户正在看的那一页 —— 浏览器的常规做法。
     * 当前页还是空白 / 自家首页时直接用它，不白白多开一格；标签数到顶（[newTab]
     * 返回 null）就退回当前页加载。
     */
    fun openExternal(url: String) {
        val current = active
        if (current.url.isBlank() || current.isHomePage) {
            viewOf(current).loadUrl(url)
            return
        }
        newTab()
        viewOf(active).loadUrl(url)
    }

    /**
     * 切换标签页。
     *
     * 一页的缩略图就是它最后一次**稳定可见**时的那一屏（滚动停止 / 加载完成后
     * 补，见 [scheduleThumbnailRefresh]）—— 不是页面开头，也不会是别的页。
     */
    fun selectTab(id: Long) {
        if (id == activeId || tabs.none { it.id == id }) return
        // 不在切换瞬间抓旧页的缩略图：PixelCopy 是异步的，等它执行时窗口里
        // 已经换成新页（抓出来会是**别的页**）。缩略图靠"页面稳定时持续维持"，
        // 旧页离开时手里那张就是它最后一次稳定可见的样子
        activeId = id
        syncActiveView()
        persistTabs()
    }

    /** 展开网格时"先抓帧、后形变"的令牌：期间被关掉（或又点了一次）就作废。 */
    private var openTabsToken = 0

    /**
     * 进入浏览器页时的入口行为：**开一张新标签**，而不是落在上次恢复出来的
     * 那一页上。
     *
     * 恢复出来的页面是直接 `loadUrl` 出来的，**没有历史** —— 点返回自然
     * "退不了"（用户点名：「每次点返回都回退不了，它是不是没有记录要回退的网页」
     * ＋「每次进入浏览器应该都开一个新标签，而不是使用原有的」）。新标签从
     * 自家首页起，之后浏览的每一层都有历史，返回就正常了；**原有的标签页
     * 一张不丢**，都在网格里随时切回去。
     *
     * 每次进程只做一次（界面在每次切到浏览器页时都会调它）：否则"下载器 ⇄
     * 浏览器"来回切会攒出一堆空标签。当前标签如果本来就是没动过的空白页 /
     * 首页，也直接复用。
     */
    fun openNewTabOnBrowserEntry() {
        if (browserEntryOpened) return
        browserEntryOpened = true
        val tab = active
        val untouched = tab.url.isBlank() || (tab.isHomePage && !tab.canGoBack)
        if (untouched || tabs.size >= MAX_TABS) return
        newTab()
    }

    /** 本次进程是否已经做过"进浏览器开新标签"（见 [openNewTabOnBrowserEntry]）。 */
    private var browserEntryOpened = false

    /**
     * 展开标签页网格。
     *
     * **先把当前这一屏抓下来，抓完再开始形变**：卡片上的预览与整页落位时的
     * 画面因此严格同源（同一几何、同一时刻），交接处不会"跳一下、放大一下"。
     * 光靠"持续维持的那张"（加载完成 / 滚动停止后补）不够 —— 键盘开合、
     * 布局变化都会让旧图的画幅与当前不一致，落位那一下就会对不上。
     * 抓取是异步的（PixelCopy），150ms 超时兜底：抓不到也照样开网格。
     */
    fun openTabs() {
        if (tabsOpen) return
        val token = ++openTabsToken
        // 取消可能还挂着的"滚动补抓"：它晚于网格出现时只会抓到网格自己
        main.removeCallbacks(thumbRefreshTask)
        val tab = active
        val view = tab.webView
        if (view == null || view.visibility != View.VISIBLE || view.width == 0 || view.height == 0) {
            tabsOpen = true
            return
        }
        captureThumbnail(
            tab,
            onDone = { if (token == openTabsToken) tabsOpen = true },
            ownBuffer = true,
            authoritative = true
        )
        main.postDelayed({ if (token == openTabsToken) tabsOpen = true }, 150)
    }

    /**
     * 坞在窗口坐标里的顶边（px）：坞**悬浮在网页之上**，这一段是界面不是网页，
     * 抓缩略图时必须排掉（不排，卡片上会烙一条控制栏）。由界面在坞的位置变化
     * 时写入；普通字段，不参与重组。
     */
    internal var dockOcclusionTopPx: Int = 0

    /** PixelCopy 抓取缓冲：按尺寸复用，避免每次抓都分配一块 MB 级位图。 */
    private var thumbBuffer: Bitmap? = null

    private var thumbRefreshTabId = 0L
    private val thumbRefreshTask = Runnable {
        tabs.firstOrNull { it.id == thumbRefreshTabId }?.let { captureThumbnail(it) }
    }

    /** 滚动停止约 180ms 后补一张缩略图（去抖：滚动中抓到的也是半截画面）。 */
    private fun scheduleThumbnailRefresh(tab: Tab) {
        thumbRefreshTabId = tab.id
        main.removeCallbacks(thumbRefreshTask)
        main.postDelayed(thumbRefreshTask, 180)
    }

    /**
     * 标签页缩略图：从**窗口的硬件 surface** 上读一帧真实渲染像素（[PixelCopy]）。
     *
     * 为什么换掉软件画布 `view.draw(canvas)`：它拿不到硬件合成的内容（视频、
     * Canvas/WebGL、跨进程 iframe 一律空白），页面刚可见时还常画出一张纯色板子
     * —— 卡片只能退回"图标 + 标题"占位，读起来就是"缩略图老是错的"。PixelCopy
     * 读的就是屏幕上那一帧：所见即所得，整页形变落位时与卡片像素一致。
     *
     * 三条约束：
     * - **异步**：回调在主线程写状态（`tab.thumbnail` 是 Compose 状态，卡片自己
     *   刷新），交互路径零阻塞；
     * - **只读"干净带"**：顶部避开状态栏、底部避开导航条与悬浮的坞；排掉的两条
     *   用相邻行补齐 —— 主体不拉伸，整页比例与网页一致；
     * - 纯色 / 失败一律**保留上一张**，绝不把空白存进卡片。
     *
     * 采集时机都挑"页面稳定可见"的时刻（加载完成后、滚动停止去抖后，见
     * [scheduleThumbnailRefresh]）；打开网格 / 切标签这些**动画时刻不现抓** ——
     * 那时候窗口里已经是形变中 / 已经换页的画面。
     */
    private fun captureThumbnail(
        tab: Tab,
        onlyIfMissing: Boolean = false,
        onDone: (() -> Unit)? = null,
        ownBuffer: Boolean = false,
        /**
         * 这一抓是「开网格那一刻的实时画面」（见 [openTabs]）：结果**必须落库**，
         * 不能因为网格已经开起来就被丢掉 —— 详见下面 PixelCopy 回调里的说明。
         */
        authoritative: Boolean = false
    ) {
        val view = tab.webView
        if (view == null || view.visibility != View.VISIBLE || view.width == 0 || view.height == 0) {
            onDone?.invoke()
            return
        }
        if (onlyIfMissing && tab.thumbnail != null && tab.thumbUrl == tab.url) {
            onDone?.invoke()
            return
        }
        // 网格已经开着（或正在形变）：窗口里已经不是网页了 —— 抓到的是网格本身，
        // 存下去预览就"乱掉"（用户报的 bug）
        if (tabsOpen) {
            onDone?.invoke()
            return
        }
        val window = findActivity()?.window
        if (window == null) {
            captureThumbnailSoftware(tab, onDone)
            return
        }
        val loc = IntArray(2)
        view.getLocationInWindow(loc)
        val viewBottom = loc[1] + view.height
        // 只排掉坞：坞（连同它下面那条渐变带）画在网页之上、属于本窗口的内容，
        // PixelCopy 会一起读出来 —— 不排，卡片上就烙一条控制栏。系统状态栏 /
        // 导航条是**别的窗口**，不在本窗口的 surface 里，不用管。
        var srcBottom = viewBottom
        val dockTop = dockOcclusionTopPx
        if (dockTop in (loc[1] + view.height / 4)..srcBottom) srcBottom = dockTop
        val srcTop = loc[1]
        // 干净带至少要占到一半高度：数据异常（坞的行号明显不对）时宁可不抓
        if (srcBottom - srcTop < view.height / 2) {
            captureThumbnailSoftware(tab, onDone)
            return
        }
        // 独占缓冲：开网格前的那一抓可能与"滚动补抓"同时在飞，共用一个缓冲
        // 会让两个抓取互相写、拼出一张撕裂的图（用户报的"预览乱掉"）
        val buffer = if (ownBuffer) {
            Bitmap.createBitmap(view.width, srcBottom - srcTop, Bitmap.Config.ARGB_8888)
        } else {
            thumbBuffer(view.width, srcBottom - srcTop)
        }
        val src = Rect(loc[0], srcTop, loc[0] + view.width, srcBottom)
        try {
            PixelCopy.request(window, src, buffer, { result ->
                // 抓取是异步的：回来时网格可能已经开了，这一帧已经不代表网页，丢掉。
                // **只有 openTabs 那一抓例外**：它发起时页面还在，PixelCopy 取的就是
                // 紧接着的那一帧 —— 网格即便已经开起来，这一张依然是用户刚才看到的
                // 画面。丢掉的话卡片只能沿用上一次存下的旧图（加载完 / 滚动停后补的
                // 那张），滚动过、键盘开合过就会跟原画面对不上（用户点名）
                if (tabsOpen && !authoritative) {
                    onDone?.invoke()
                } else if (result == PixelCopy.SUCCESS) {
                    val shot = buildThumbnail(
                        buffer, view.width, view.height,
                        0, viewBottom - srcBottom
                    )
                    // 硬件这一抓是空的（页面刚合成 / 一片纯色）：改用**软件绘制再抓
                    // 一次** —— `view.draw` 画的就是当前画面，仍是实时的；
                    // 直接 applyThumbnail 会保留上一张旧图，那正是"跟原画面不一样"
                    if (authoritative && isUniform(shot)) {
                        captureThumbnailSoftware(tab, onDone)
                    } else {
                        applyThumbnail(tab, shot)
                        onDone?.invoke()
                    }
                } else {
                    captureThumbnailSoftware(tab, onDone)
                }
            }, main)
        } catch (t: Throwable) {
            // 窗口还没画出来 / 设备限制：退回软件绘制，别把异常抛进交互路径
            captureThumbnailSoftware(tab, onDone)
        }
    }

    private fun thumbBuffer(w: Int, h: Int): Bitmap {
        val cur = thumbBuffer
        if (cur != null && cur.width == w && cur.height == h) return cur
        return Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { thumbBuffer = it }
    }

    /**
     * 采集到的像素带 → 卡片尺寸的缩略图：主体按比例缩放，上下被排掉的缺口用
     * **紧邻的那一行**补齐（不拉伸主体，整页比例与网页一致，形变落位才无缝）。
     */
    private fun buildThumbnail(
        src: Bitmap,
        viewW: Int,
        viewH: Int,
        topGap: Int,
        bottomGap: Int
    ): Bitmap {
        val tw = (viewW * THUMB_SCALE).roundToInt().coerceAtLeast(1)
        val th = (viewH * THUMB_SCALE).roundToInt().coerceAtLeast(1)
        val shot = Bitmap.createBitmap(tw, th, Bitmap.Config.RGB_565)
        val top = (topGap * THUMB_SCALE).roundToInt().coerceIn(0, th - 1)
        val bottom = (th - (bottomGap * THUMB_SCALE).roundToInt()).coerceIn(top + 1, th)
        Canvas(shot).drawBitmap(src, null, Rect(0, top, tw, bottom), Paint(Paint.FILTER_BITMAP_FLAG))
        val row = IntArray(tw)
        if (top > 0) {
            shot.getPixels(row, 0, tw, 0, top, tw, 1)
            for (y in 0 until top) shot.setPixels(row, 0, tw, 0, y, tw, 1)
        }
        if (bottom < th) {
            // 底部缺口（坞占掉的那一段）用**紧邻的那一行平铺**补齐：这一条在卡片上
            // 本来就压着标题渐变，一条柔和的延伸色带最不突兀。（镜像会把文字整个
            // 翻过来 —— 那正是"缩略图跟实际画面不一致"的来源之一）
            shot.getPixels(row, 0, tw, 0, bottom - 1, tw, 1)
            for (y in bottom until th) shot.setPixels(row, 0, tw, 0, y, tw, 1)
        }
        return shot
    }

    /** 纯色 / 空白一律不落库：保留上一张，没有旧的才退回"图标 + 标题"占位样式。 */
    private fun applyThumbnail(tab: Tab, shot: Bitmap) {
        if (!isUniform(shot)) {
            tab.thumbnail = shot
            tab.thumbUrl = tab.url
        } else if (tab.thumbUrl != tab.url) {
            tab.thumbnail = null
            tab.thumbUrl = null
        }
    }

    /**
     * 软件绘制兜底：PixelCopy 不可用（拿不到窗口 / 设备限制）时才走。拿不到硬件
     * 合成的内容，但至少保证"冷启动也有一张"。
     */
    private fun captureThumbnailSoftware(tab: Tab, onDone: (() -> Unit)? = null) {
        val view = tab.webView
        if (view == null || view.visibility != View.VISIBLE || view.width == 0 || view.height == 0) {
            onDone?.invoke()
            return
        }
        runCatching {
            val bitmap = Bitmap.createBitmap(
                (view.width * THUMB_SCALE).roundToInt().coerceAtLeast(1),
                (view.height * THUMB_SCALE).roundToInt().coerceAtLeast(1),
                Bitmap.Config.RGB_565
            )
            val canvas = Canvas(bitmap)
            canvas.scale(THUMB_SCALE, THUMB_SCALE)
            view.draw(canvas)
            applyThumbnail(tab, bitmap)
        }
        onDone?.invoke()
    }

    /** 从 Context 里剥出宿主 Activity（PixelCopy 要它的 Window）。 */
    private fun findActivity(): Activity? {
        var ctx: Context? = context
        while (ctx != null) {
            if (ctx is Activity) return ctx
            ctx = (ctx as? ContextWrapper)?.baseContext
        }
        return null
    }

    /**
     * 抽样判断这张快照是不是"一片纯色"。
     *
     * 16×16 个采样点、每点允许一点通道差（RGB_565 量化 + 抗锯齿）—— 全是同一个颜色
     * 就当作空白。正常页面（哪怕底色纯白）总有文字或图片，一定会在某个采样点上不同。
     */
    private fun isUniform(bitmap: Bitmap): Boolean {
        val w = bitmap.width
        val h = bitmap.height
        if (w < 2 || h < 2) return true
        val first = bitmap.getPixel(w / 2, h / 2)
        for (i in 0 until 16) {
            for (j in 0 until 16) {
                val p = bitmap.getPixel((w - 1) * i / 15, (h - 1) * j / 15)
                if (abs((p and 0xFF) - (first and 0xFF)) > 8) return false
                if (abs(((p shr 8) and 0xFF) - ((first shr 8) and 0xFF)) > 12) return false
                if (abs(((p shr 16) and 0xFF) - ((first shr 16) and 0xFF)) > 8) return false
            }
        }
        return true
    }

    /**
     * 关闭标签页。
     *
     * - 关掉的是当前页 → 切到右边相邻的（没有则左边）；
     * - 关掉最后一个 → 通知界面退回任务页，并留一个空白标签备用，
     *   保证「至少一个标签页」这个不变量成立。
     */
    fun closeTab(id: Long) {
        val index = tabs.indexOfFirst { it.id == id }
        if (index < 0) return
        val tab = tabs[index]
        releaseTab(tab)
        tabs.removeAt(index)

        if (tabs.isEmpty()) {
            tabsOpen = false
            activeId = 0L
            onAllTabsClosed()
            val fresh = Tab(nextTabId++)
            tabs += fresh
            activeId = fresh.id
            syncActiveView()
            persistTabs()
            return
        }
        if (activeId == id) {
            val next = tabs.getOrNull(index) ?: tabs.last()
            activeId = next.id
            syncActiveView()
        }
        persistTabs()
    }

    fun closeTabs() {
        // 作废可能还挂着的"抓帧后再开网格"（用户已经在关了）
        openTabsToken++
        tabsOpen = false
    }

    /**
     * 供 AndroidView 挂载：返回**容器**本身（只挂这一次，之后不再摘挂）。
     * 换页面时容器可能还挂在那个已被丢弃的 Compose 节点上，先摘一下。
     */
    fun takeHost(): FrameLayout {
        (viewHost.parent as? ViewGroup)?.removeView(viewHost)
        syncActiveView()
        return viewHost
    }

    /**
     * 把当前标签页摆到台前：所有页都留在容器里，只有当前页 VISIBLE。
     * 界面在切标签 / 重建 WebView 后调用一次。
     */
    fun syncActiveView() {
        // 现建也没关系：创建是幂等的，而且必须保证"当前页一定有 WebView"，
        // 否则第一帧容器里全是 GONE，看起来就是白屏
        val currentView = viewOf(active)
        // 从上次会话恢复出来的标签页：**第一次摆到台前时才加载**（见 restoreTabs）。
        // 卡片上先显示上次存下来的标题与快照，加载完再由页面自己覆盖。
        active.pendingUrl?.let { url ->
            active.pendingUrl = null
            active.homeRequested = url.startsWith(HOME_URL)
            // 恢复出来的这一页**从零开始记历史**：先清掉此时可能已有的条目
            //（空白页 / 万一先加载过的首页），否则一按回退就退到自家首页，
            // 而不是"退无可退"（用户点名）
            runCatching { currentView.clearHistory() }
            runCatching { currentView.loadUrl(url) }
        }
        tabs.forEach { tab ->
            val view = tab.webView ?: return@forEach
            if (view.parent !== viewHost) {
                (view.parent as? ViewGroup)?.removeView(view)
                viewHost.addView(view)
            }
            view.visibility = if (view === currentView) View.VISIBLE else View.GONE
        }
        // 摆到台前的这一刻顺手核对一次可退/可进：恢复出来的页面、切标签前后
        // 都不会因为状态过期把返回键错误地置灰（返回机制的那一份真相始终来自 WebView）
        syncNavState(active, currentView)
    }

    /**
     * 带滑动手势识别的容器。
     *
     * 规则（与用户的直觉一致、按手指方向读）：
     * - **从左向右滑 = 后退**（有后退历史才可触发）、**从右向左滑 = 前进**（有前进历史才可触发）；
     * - 页面已滚到顶时**向下拉**超过阈值 = 重新加载当前页；
     * - 滑动全程把进度写回控制器，界面据此画边缘箭头 / 顶部刷新提示。
     *
     * 拦截只发生在「方向明确且动作可用」时，不满足条件的触摸原样留给网页。
     */
    private inner class SwipeHost(ctx: Context) : FrameLayout(ctx) {

        private val slop = ViewConfiguration.get(ctx).scaledTouchSlop.toFloat()
        private var downX = 0f
        private var downY = 0f

        /** 0=未定, 1=本串触摸不归手势管, 2=横向导航, 3=下拉刷新 */
        private var tracking = 0

        init {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        private fun navRange() = (width * 0.30f).coerceAtLeast(1f)
        private fun pullRange() = resources.displayMetrics.density * 96f

        /**
         * 导航手势的**起手边缘区**宽度。
         *
         * 横滑导航只认从屏幕边缘起手的那一下（与系统返回手势同一套直觉）：
         * 网页里的横向滑动（轮播图、图片查看器、卡片侧滑）几乎都从屏幕中间开始，
         * 之前一律被当成"后退"抢走 —— 用户点名过「网页里有东西要右滑时，
         * 右滑会触发后退」。中间起手的横滑现在原样留给网页。
         */
        private fun edgeZone() = resources.displayMetrics.density * 24f

        override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = ev.x
                    downY = ev.y
                    tracking = 0
                }
                MotionEvent.ACTION_MOVE -> if (tracking == 0) {
                    // 网格展开时网页不在台前，别抢网格的滚动
                    if (tabsOpen) return false
                    val dx = ev.x - downX
                    val dy = ev.y - downY
                    tracking = when {
                        abs(dx) > slop && abs(dx) > abs(dy) * 1.5f -> {
                            val edge = edgeZone()
                            val fromEdge =
                                if (dx > 0) downX <= edge else downX >= width - edge
                            when {
                                fromEdge && dx > 0 && active.canGoBack -> 2
                                fromEdge && dx < 0 && active.canGoForward -> 2
                                else -> 1
                            }
                        }
                        dy > slop && abs(dy) > abs(dx) * 1.5f && !loading &&
                            (active.webView?.scrollY ?: 0) <= 0 -> 3
                        else -> 0
                    }
                }
            }
            return tracking == 2 || tracking == 3
        }

        override fun onTouchEvent(ev: MotionEvent): Boolean {
            if (tracking != 2 && tracking != 3) return false
            when (ev.actionMasked) {
                MotionEvent.ACTION_MOVE -> track(ev)
                MotionEvent.ACTION_UP -> { finish(ev); tracking = 0 }
                MotionEvent.ACTION_CANCEL -> { releaseHints(); tracking = 0 }
            }
            return true
        }

        private fun track(ev: MotionEvent) {
            if (tracking == 2) {
                val dx = ev.x - downX
                swipeNav = if (dx >= 0) SwipeNav.Back else SwipeNav.Forward
                swipeNavProgress = (abs(dx) / navRange()).coerceIn(0f, 1f)
            } else {
                val dy = ev.y - downY
                pullProgress = ((dy - slop) / pullRange()).coerceIn(0f, 1f)
            }
        }

        private fun finish(ev: MotionEvent) {
            track(ev)
            when (tracking) {
                2 -> if (swipeNavProgress >= 1f) {
                    when (swipeNav) {
                        SwipeNav.Forward -> goForward()
                        SwipeNav.Back -> goBack()
                        else -> Unit
                    }
                }
                3 -> if (pullProgress >= 1f) startPullRefresh()
            }
            releaseHints()
        }

        private fun releaseHints() {
            swipeNav = SwipeNav.None
            swipeNavProgress = 0f
            pullProgress = 0f
        }
    }

    // ─── 构建 ───

    private fun viewOf(tab: Tab): WebView = tab.webView ?: createWebView(tab).also { tab.webView = it }

    /**
     * WebView 的壳上下文：站点的深浅色偏好由**创建时传入上下文的主题
     * `isLightTheme`** 决定（targetSdk 33+ 走这条路径，不看 uiMode）——
     * 应用主题本身是固定浅色的，不换壳的话站点永远拿到浅色偏好，
     * 也就永远不会启用它自己的深色模式（这是「网页不跟随深色」的根因）。
     *
     * 这里两个都钉上：
     * - 主题换成深/浅壳主题 → isLightTheme 正确（新路径）；
     * - Configuration 的 uiMode 位 → 老版本 WebView 与其它按 uiMode 判定的场景。
     *
     * 注意：深浅色在**创建时**定死，已存在的 WebView 换不过去 ——
     * 主题切换时要重建（见 [rebuildWebViewsForTheme]）。
     */
    private fun themedContext(): Context {
        val base = context.resources.configuration
        val night = if (homeDark) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
        val configCtx = context.createConfigurationContext(
            Configuration(base).apply {
                uiMode = (base.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or night
            }
        )
        val theme = if (homeDark) R.style.Theme_Lerxu_Browser_Dark else R.style.Theme_Lerxu_Browser
        return ContextThemeWrapper(configCtx, theme)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(tab: Tab): WebView {
        // 壳上下文（深浅主题 + 明暗 uiMode）在**创建时**定下站点的
        // prefers-color-scheme —— 站点因此启用它自己的深色模式
        val view = WebView(themedContext())
        // 无痕窗口挂到**独立 profile** 上（cookie / 站点数据 / 缓存自成一份）：
        // 与普通窗口互不影响，退出时把 profile 一删就干净了。必须在加载内容之前设置
        if (incognitoMode && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            runCatching {
                WebViewCompat.setProfile(view, INCOGNITO_PROFILE)
                ProfileStore.getInstance().getOrCreateProfile(INCOGNITO_PROFILE)
                    .cookieManager.setAcceptCookie(true)
            }
        }
        view.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        // 页面画出来之前露出的就是它：跟随主题，避免深色下闪白
        view.setBackgroundColor(themeBackground)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            // 无痕期间**不走磁盘缓存**：这样停留期间不会往磁盘上写新痕迹
            //（Cookie / DOM 存储没法按模式隔离，靠进出各清一次 + 启动兜底，见 init）
            cacheMode = if (incognitoMode) WebSettings.LOAD_NO_CACHE else WebSettings.LOAD_DEFAULT
            // 关闭多窗口：target=_blank 之类的链接就地加载，
            // 否则 WebView 会请求我们开新窗口，点了没反应。
            setSupportMultipleWindows(false)
            // 算法变暗：深色主题下把只做了浅色的站点整体渲染成深色；
            // 支持 prefers-color-scheme 的站点（必应 / Google 等）直接拿到深色版页面
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(this, true)
            }
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)
        // 文档起始脚本：在任何页面脚本之前把 prefers-color-scheme 对齐到
        // 应用主题 —— 站点自己的深浅色逻辑原样跑，不靠我们改颜色
        installThemeDocStart(tab, view)
        view.addJavascriptInterface(HomeBridge(tab), "LerxuHome")
        view.addJavascriptInterface(JsBridge(tab), "LerxuSniffer")
        // 贴底整宽弹窗的状态（坞据此决定"抬到它上面"还是"自己让开"）
        view.addJavascriptInterface(DockBridge(tab), "LerxuDock")
        view.webViewClient = browserClient
        view.webChromeClient = browserChromeClient
        // 现代模式的收起/展开**不再挂在这里**：`View.setOnScrollChangeListener` 在
        // Chromium WebView 上不是逐帧回调（容器视图的滚动位移成批同步），一次滑动
        // 往往要等停下来才把整段位移报过来 —— 表现就是"要等滚动结束坞才让位"
        //（用户点名）。改由页面自己的 `scroll` 事件逐帧回传（见 injectDockAvoid
        // 里的滚动监听 + DockBridge.scroll），那是跟手指同一帧的。
        view.setDownloadListener(
            DownloadListener { url, userAgent, contentDisposition, _, _ ->
                onDownload(tab, url, userAgent, contentDisposition)
            }
        )
        // 缩略图的刷新触发：滚动停下来补一张（去抖 180ms）。这里用**原生**滚动
        // 回调，而不是上面页面里那条逐帧的 scroll 桥 —— 那条只在"坞让位"开启时
        // 才注入（传统方案下根本没有），缩略图不该跟着坞的方案走。成批同步对
        // 缩略图无所谓：反正要等停下来才抓。
        view.setOnScrollChangeListener { _, _, _, _, _ ->
            if (tab.id == activeId) scheduleThumbnailRefresh(tab)
        }
        return view
    }

    /** 文档起始脚本的安装/更新（主题变化时先撤再挂，之后加载的文档才会拿到新值）。 */
    private fun installThemeDocStart(tab: Tab, view: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        runCatching {
            tab.themeDocStart?.remove()
            tab.themeDocStart = WebViewCompat.addDocumentStartJavaScript(
                view,
                WebThemeEngine.docStartJs(homeDark),
                setOf("*")
            )
        }
    }

    /** 回收一个标签页的 WebView（关闭标签 / 渲染进程死亡）。 */
    private fun releaseTab(tab: Tab) {
        clearPullRefresh(tab)
        runCatching {
            val view = tab.webView ?: return@runCatching
            (view.parent as? ViewGroup)?.removeView(view)
            tab.themeDocStart?.remove()
            tab.themeDocStart = null
            view.removeJavascriptInterface("LerxuSniffer")
            view.removeJavascriptInterface("LerxuHome")
            view.removeJavascriptInterface("LerxuDock")
            view.stopLoading()
            view.destroy()
        }
        tab.webView = null
        tab.sniffed.clear()
        tab.thumbnail = null
        tab.thumbUrl = null
        tab.savedThumb = null
        tab.url = ""
        tab.title = ""
        tab.referer = ""
        tab.pendingHomeFocus = false
        tab.homeRequested = false
        tab.loadError = null
        tab.loading = false
        tab.progress = 0
        tab.canGoBack = false
        tab.canGoForward = false
        tab.isHomePage = false
    }

    /** 找到某个 WebView 属于哪个标签页（回调只给 WebView，不给标签页）。 */
    private fun tabOf(view: WebView): Tab? = tabs.firstOrNull { it.webView === view }

    /** WebView 自己能处理的协议；其余按「拉起外部 App」的第三方协议看待。 */
    private val internalSchemes = setOf("http", "https", "about", "data", "file", "blob", "filesystem")

    private fun isExternalScheme(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        return scheme !in internalSchemes
    }

    /** 第三方协议交给系统拉起对应 App；没有 App 处理时静默忽略，停在原页面。 */
    private fun openExternalScheme(uri: Uri) {
        runCatching {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

    // ─── 页面回调 ───

    private val browserClient = object : WebViewClient() {

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest
        ): Boolean {
            val tab = tabOf(view) ?: return false
            val url = request.url.toString()
            // 明确的下载链接 / 下载协议：拦下来交给引擎，不在页面里打开
            if (VideoSniffer.isDownloadLink(url)) {
                handoffUrl(tab, url, fileName = "")
                return true
            }
            // 应用唤醒协议（bilibili://、weixin:// 之类的非 http 主框架跳转）：
            // 交给系统拉起对应 App。不拦的话 WebView 只会报
            // net::ERR_UNKNOWN_URL_SCHEME，看起来像"页面加载失败"。
            if (request.isForMainFrame && isExternalScheme(request.url)) {
                openExternalScheme(request.url)
                return true
            }
            return false
        }

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
        ): WebResourceResponse? {
            val tab = tabOf(view) ?: return null
            val url = request.url.toString()
            // 自家首页：不发原始资源，把主题色板与启动配置**注入进 HTML** 再返回。
            // 颜色在首次绘制前就写进样式里，不存在「先白一下再变肤」的窗口。
            if (url.startsWith(HOME_URL)) {
                serveHome(tab)?.let { return it }
            }
            // 这里只有 URL（拿不到响应头），够按扩展名 / 分发域名规则初筛。
            // 回调在后台线程，交回主线程再改状态。
            main.post {
                if (!tab.isHomePage && VideoSniffer.isMedia(url)) {
                    offer(tab, url, mime = "", size = 0)
                }
            }
            return null
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            val tab = tabOf(view) ?: return
            tab.loading = true
            tab.progress = 0
            tab.loadError = null
            // 上一页那层"贴底整宽弹窗"随导航作废：不清的话新页面一进来就被顶起来
            tab.bottomOverlayPx = 0
            tab.bottomOverlayAll = false
            // 「本页资源」只该显示**当前这一页**的：上一页嗅到的留在列表里，读起来
            // 像一份历史记录（用户点名）。换页即清空，顺带把大小探测的去重表也清掉
            //（新页面重新嗅到同一个地址时，还要再问一次长度）。
            if (tab.sniffed.isNotEmpty()) tab.sniffed.clear()
            probedSizes.clear()
            // 任何一次开始加载都意味着旧的首页聚焦状态作废
            homeInputFocused = false
            // 导航已经真正开始：提交窗口结束（地址与 isSearchPage 此刻更新）
            navSubmitting = false
            if (!url.isNullOrEmpty()) {
                tab.url = url
                tab.referer = url
                // 自家首页按地址前缀判定（主题走注入，URL 上不再带参数）
                tab.isHomePage = url.startsWith(HOME_URL)
            }
            syncNavState(tab, view)
            // **尽早**把主题样式注进去：等 onPageFinished 才注入的话，页面会先按
            // 自己的浅色画一帧再翻黑（割裂感来源）。这里从加载一开始就连环重试，
            // 文档一可用就套上（脚本幂等，重复执行只是刷新样式内容）。
            if (!tab.isHomePage) {
                for (delay in listOf(0L, 120L, 320L, 700L, 1300L)) {
                    main.postDelayed({
                        if (tabOf(view) === tab && !tab.isHomePage) applyWebTheme(tab)
                    }, delay)
                }
            }
        }

        override fun onPageFinished(view: WebView, url: String?) {
            val tab = tabOf(view) ?: return
            tab.loading = false
            tab.progress = 100
            // 这一页加载完了：下拉刷新的旋转到此为止
            clearPullRefresh(tab)
            if (!url.isNullOrEmpty()) tab.url = url
            tab.title = view.title.orEmpty()
            // 自家首页不嗅探（它是本地页面），改为把引擎/主题下发给它；
            // 外部页面（必应 / Google 等）每次加载完强制对齐应用主题
            if (tab.isHomePage) refreshHomeConfig(tab) else {
                injectSniffer(view)
                applyWebTheme(tab)
            }
            // 首页是这一页的**根**：把它变成历史里的第一项 —— 清掉 WebView 自己的
            // 前后退列表，自建栈也只留首页。否则退回首页后返回键还是亮的，
            // 又能"向前跳"回刚才那页（用户点名："回退到首页后按钮还是可点击状态"）。
            if (tab.isHomePage) {
                runCatching { view.clearHistory() }
                tab.visited.clear()
                tab.visited += HOME_URL
            } else if (tab.pendingHistoryClear) {
                // 用自建栈回退后落的这一页：清掉 WebView 自己的历史，
                // 下一次后退才会继续走自建栈（否则 WebView 会把刚才那页当成"前进"）
                tab.pendingHistoryClear = false
                runCatching { view.clearHistory() }
            }
            syncNavState(tab, view)
            // 页面加载完成后补一张卡片缩略图。等 500ms 是因为 onPageFinished
            // 那一帧常常还没真正画上去（抓到的会是一张纯色板子 → 被 isUniform
            // 丢掉，保留上一张）。之后滚动停止还会继续补，见 scheduleThumbnailRefresh
            main.postDelayed({
                if (tabOf(view) === tab) captureThumbnail(tab)
            }, 500)
            // 地址 / 标题定了：顺手把标签页状态落盘（普通窗口的标签页要能撑过重启）
            persistTabs()
        }

        /**
         * 主文档加载失败：记下原因（子资源失败不打扰用户，`isForMainFrame`
         * 之外一律忽略），界面据此显示可读的提示而不是一片空白。
         *
         * 两类**不算失败**的情况要滤掉，否则正常页面会被误报：
         * - `ERR_ABORTED`：上一次导航被重定向 / 新导航取代；
         * - 错误回调迟到：失败地址已经不是当前页（新页面已开始加载）。
         */
        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            if (!request.isForMainFrame) return
            if (error.errorCode == ERROR_ABORTED) return
            val tab = tabOf(view) ?: return
            val failed = request.url.toString().substringBefore('#')
            val current = view.url.orEmpty().substringBefore('#')
            val tabUrl = tab.url.substringBefore('#')
            if (failed != current && failed != tabUrl) return
            tab.loading = false
            clearPullRefresh(tab)
            tab.loadError = error.description?.toString()?.takeIf { it.isNotBlank() }
                ?: "错误代码 ${error.errorCode}"
        }

        /**
         * 证书校验失败：默认实现只 cancel，且**不会**回调 `onReceivedError` ——
         * 结果是白屏一张、连重试入口都没有，正是用户要的失败页漏掉的一类。
         * 这里照旧取消加载（不做任何"继续访问"的放行），只把原因报给界面。
         */
        override fun onReceivedSslError(
            view: WebView,
            handler: SslErrorHandler,
            error: SslError
        ) {
            handler.cancel()
            val tab = tabOf(view) ?: return
            tab.loading = false
            clearPullRefresh(tab)
            tab.loadError = context.getString(R.string.browser_error_ssl, error.primaryError)
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            val tab = tabOf(view) ?: return
            val previous = tab.url
            if (!url.isNullOrEmpty()) tab.url = url
            // SPA 换"页"（pushState 型站点：**B 站换视频**、视频站换集）**不会触发
            // onPageStarted**，于是上一个视频的资源一直留在列表里，读起来像历史记录
            //（用户点名）。判据用**路径**：只有真换了页面路径才算换页 —— 只动查询串 /
            // 锚点的历史变化（播放器切画质、站内埋点）不该把用户刚看到的列表清空。
            if (!isReload && !url.isNullOrEmpty() && urlPath(previous) != urlPath(url)) {
                if (tab.sniffed.isNotEmpty()) tab.sniffed.clear()
                probedSizes.clear()
            }
            // 自建访问栈：每次历史变化都记一笔（后退 = 回到栈里的上一项，
            // 于是把栈顶弹掉；其余的新地址入栈）。WebView 的列表不跨进程，
            // 重启后"回退到上一层"就靠这份栈（见 goBack）。
            if (!isReload && !url.isNullOrEmpty()) {
                val stack = tab.visited
                when {
                    stack.isEmpty() -> stack += url
                    stack.last() == url -> Unit
                    stack.size >= 2 && stack[stack.size - 2] == url ->
                        stack.removeAt(stack.size - 1)
                    else -> {
                        stack += url
                        while (stack.size > MAX_VISITED) stack.removeAt(0)
                    }
                }
            }
            syncNavState(tab, view)
            // 页面内路由跳转（pushState 型 SPA，如 B 站）不会触发 onPageStarted：
            // 新视图可能是浅色，这里补一次主题注入（脚本幂等，已决策则沿用原决策）
            if (!tab.isHomePage && url != null && !url.startsWith(HOME_URL)) {
                applyWebTheme(tab)
                // 路由变了 = 画面变了：等新视图画上去后补一张缩略图
                // （SPA 不会触发 onPageFinished，不补的话卡片会一直停在旧视图）
                main.postDelayed({
                    if (tabOf(view) === tab) captureThumbnail(tab)
                }, 500)
            }
        }

        /**
         * 渲染进程被杀（内存压力）：返回 true 保住 App，同时把这一页的
         * WebView 丢掉重建（不自动重载，避免死循环）。
         */
        override fun onRenderProcessGone(
            view: WebView,
            detail: RenderProcessGoneDetail?
        ): Boolean {
            val tab = tabOf(view) ?: return true
            main.post { recreateTab(tab) }
            return true
        }
    }

    private val browserChromeClient = object : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            val tab = tabOf(view) ?: return
            tab.progress = newProgress
            tab.loading = newProgress < 100
        }

        override fun onReceivedTitle(view: WebView, title: String?) {
            val tab = tabOf(view) ?: return
            tab.title = title.orEmpty()
        }
    }

    /** 渲染进程更换：丢掉旧实例并重建（状态重置为空白页）。 */
    private fun recreateTab(tab: Tab) {
        releaseTab(tab)
        tab.generation += 1
        syncActiveView()
    }

    /** 浏览器判定的「这是个下载」：交给引擎。 */
    private fun onDownload(
        tab: Tab,
        url: String?,
        userAgent: String?,
        contentDisposition: String?
    ) {
        if (url.isNullOrBlank()) return
        val name = fileNameFromDisposition(contentDisposition)
            .ifEmpty { VideoSniffer.fileNameFromUrl(url) }
        onDownloadRequest(
            DownloadHandoff(
                url = url,
                fileName = name,
                headers = buildHeaders(tab, url, userAgent),
                fromPage = tab.referer
            )
        )
    }

    // ─── 嗅探结果 ───

    /** 首页桥：居中输入框的提交与聚焦状态（属于某一个标签页）。 */
    inner class HomeBridge internal constructor(private val tab: Tab) {
        @JavascriptInterface
        fun search(text: String) {
            main.post {
                BrowserUrl.toUrl(text, engine)?.let {
                    navSubmitting = true
                    viewOf(tab).loadUrl(it)
                }
            }
        }

        @JavascriptInterface
        fun searchFocus(focused: Boolean) {
            main.post { homeInputFocused = focused }
        }
    }

    /** JS 桥：注入脚本回传 url / mime / size（后台线程回调，切回主线程再动 Compose 状态）。 */
    inner class JsBridge internal constructor(private val tab: Tab) {
        @JavascriptInterface
        fun push(payload: String) {
            val parsed = runCatching { json.parseToJsonElement(payload) as? JsonObject }.getOrNull()
                ?: return
            val url = parsed.string("url")
            if (url.isEmpty()) return
            val mime = parsed.string("mime")
            val size = (parsed["size"] as? JsonPrimitive)?.longOrNull ?: 0L
            val page = parsed.string("page")
            main.post { offer(tab, url, mime, size, page) }
        }
    }

    /**
     * JS 桥：网页里"贴底整宽弹窗"的状态回传（见 [injectDockAvoid]）。
     *
     * 桥只在**值变了**的时候被调用（JS 侧缓存了上一次的 key），所以这里不必去重。
     */
    inner class DockBridge internal constructor(private val tab: Tab) {
        @JavascriptInterface
        fun report(payload: String) {
            val parsed = runCatching { json.parseToJsonElement(payload) as? JsonObject }.getOrNull()
                ?: return
            val h = (parsed["h"] as? JsonPrimitive)?.intOrNull ?: 0
            val all = (parsed["all"] as? JsonPrimitive)?.booleanOrNull ?: false
            main.post {
                tab.bottomOverlayPx = h.coerceIn(0, 400)
                tab.bottomOverlayAll = all
            }
        }

        /**
         * 页面滚动方向（1 = 下滑，0 = 上滑），**逐帧**从页面的 `scroll` 事件回传。
         *
         * 走页面事件而不是 `View.setOnScrollChangeListener`：后者在 Chromium
         * WebView 上是成批同步的，坞要等滚动停下来才让位（用户点名的 bug）。
         * 顶部面板展开期间不接管（那时候坞本来就不该收）。
         */
        @JavascriptInterface
        fun scroll(down: Int) {
            main.post {
                if (!dockModern || dockPanelsOpen) return@post
                dockCollapsed = down > 0
            }
        }
    }

    /**
     * URL 的**路径**部分（去掉查询串与锚点，也去掉协议与主机）。
     *
     * 判断"是不是换了一页"用它：SPA 的 pushState 常常只动查询串，那不算换页。
     */
    private fun urlPath(url: String): String =
        url.substringBefore('#').substringBefore('?').substringAfter("://", url)

    /** 主线程：按规则收下并去重入列（结果挂在它所属的标签页上）。 */
    private fun offer(tab: Tab, url: String, mime: String, size: Long, page: String = "") {
        if (!VideoSniffer.isMedia(url, mime, size)) return
        val item = SniffedResource(
            url = url,
            kind = VideoSniffer.classify(url, mime),
            extension = VideoSniffer.extensionOf(url)
                .ifEmpty { VideoSniffer.extensionFromMime(mime).orEmpty() },
            mime = mime,
            size = size,
            quality = VideoSniffer.qualityHint(url),
            pageUrl = page.ifEmpty { tab.referer },
            title = tab.title
        )
        val existing = tab.sniffed.indexOfFirst { it.dedupKey == item.dedupKey }
        if (existing >= 0) {
            if (item.size > tab.sniffed[existing].size) tab.sniffed[existing] = item
            return
        }
        tab.sniffed.add(0, item)
        // 大小多半是 0（响应头没给 Content-Length）：补一次探测
        probeSize(tab, item)
    }

    // ─── 资源大小兜底探测 ───

    /** 已经问过长度的地址（同一条只问一次）。 */
    private val probedSizes =
        java.util.Collections.synchronizedSet(mutableSetOf<String>())

    /**
     * 资源大小**兜底探测**。
     *
     * 响应头里没有 `Content-Length` 是常态：流媒体走分片、播放器直连
     * `<video src>`、站点只发 chunked —— 于是列表里整片"大小未知"（用户点名）。
     * 这里补一次请求问真实长度。
     *
     * 几个要点：
     *  · 带上同源 Cookie 与 Referer：B 站这类 CDN 少了 referer 直接 403；
     *  · HEAD 被拒（不少 CDN 就回 405/403）时退回"只取 0 字节"的 GET，
     *    读响应头 `Content-Range: bytes 0-0/总长` 的斜杠后段；
     *  · 后台线程发出，回来在**主线程**就地替换那一条（列表可能已被清空 / 删除，
     *    找不到就丢弃 —— 状态只能从主线程改）；
     *  · 同一地址只探一次、总量封顶，免得长视频页面上百个分片把请求打满。
     */
    private fun probeSize(tab: Tab, item: SniffedResource) {
        if (item.size > 0) return
        if (probedSizes.size >= MAX_SIZE_PROBES) return
        if (!probedSizes.add(item.dedupKey)) return
        val referer = item.pageUrl.ifEmpty { tab.referer }
        // UA 只能在主线程读（WebView 的规矩），先取好带进后台
        val ua = runCatching { tab.webView?.settings?.userAgentString }.getOrNull()
            ?.takeIf { it.isNotBlank() }
            ?: System.getProperty("http.agent").orEmpty()
        Thread {
            val length = runCatching { fetchContentLength(item.url, referer, ua) }.getOrDefault(0L)
            if (length <= 0L) return@Thread
            main.post {
                val list = tab.sniffed
                val idx = list.indexOfFirst { it.dedupKey == item.dedupKey }
                if (idx >= 0) list[idx] = list[idx].copy(size = length)
            }
        }.apply { isDaemon = true }.start()
    }

    /** 问一次真实长度：HEAD 优先，被拒就退回只取 0 字节的 GET。 */
    private fun fetchContentLength(url: String, referer: String, ua: String): Long {
        requestLength(url, referer, ua, range = false).let { if (it > 0L) return it }
        return requestLength(url, referer, ua, range = true)
    }

    private fun requestLength(url: String, referer: String, ua: String, range: Boolean): Long {
        val conn = (URI(url).toURL().openConnection() as HttpURLConnection).apply {
            requestMethod = if (range) "GET" else "HEAD"
            connectTimeout = 6000
            readTimeout = 6000
            instanceFollowRedirects = true
            if (ua.isNotEmpty()) setRequestProperty("User-Agent", ua)
            if (referer.isNotEmpty()) setRequestProperty("Referer", referer)
            runCatching { CookieManager.getInstance().getCookie(url) }.getOrNull()
                ?.takeIf { it.isNotEmpty() }
                ?.let { setRequestProperty("Cookie", it) }
            if (range) setRequestProperty("Range", "bytes=0-0")
        }
        return try {
            val code = conn.responseCode
            when {
                code != 200 && code != 206 -> 0L
                range -> conn.getHeaderField("Content-Range")
                    ?.substringAfter('/', "")
                    ?.trim()?.toLongOrNull() ?: 0L
                else -> conn.contentLengthLong.takeIf { it > 0L } ?: 0L
            }
        } catch (t: Throwable) {
            0L
        } finally {
            runCatching { conn.disconnect() }
        }
    }

    // ─── 转交 ───

    /**
     * 用户点嗅探列表里的条目。
     *
     * 交给引擎的文件名**优先用视频名**（列表里显示的就是它）：`index-1.m4s` 这种
     * 名字下到本地没人认得出是什么（用户点名）。地址里的文件名只作兜底。
     */
    fun handoff(item: SniffedResource) {
        handoffUrl(active, item.url, sniffFileName(item), item.pageUrl)
    }

    /** 下载文件名：视频名 + 扩展名；名字不可用时退回地址里的文件名。 */
    private fun sniffFileName(item: SniffedResource): String {
        val base = sanitizeFileName(item.title)
        if (base.isEmpty()) return VideoSniffer.fileNameFromUrl(item.url)
        return if (item.extension.isEmpty()) base else "$base.${item.extension}"
    }

    /**
     * 把标题收拾成能当文件名的样子。
     *
     * 视频标题常带 `/`、`:`、`|` 这类字符，直接拿去当文件名会被当成路径分隔符
     * （轻则建错目录，重则抛异常），所以统一换成空格并压掉多余空白；长度也封一下，
     * 免得撞上文件系统的单段上限。
     */
    private fun sanitizeFileName(name: String): String =
        name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(80)

    private fun handoffUrl(tab: Tab, url: String, fileName: String, page: String = tab.referer) {
        onDownloadRequest(
            DownloadHandoff(
                url = url,
                fileName = fileName,
                headers = buildHeaders(tab, url, null),
                fromPage = page
            )
        )
    }

    fun dismiss(url: String) {
        val list = active.sniffed
        val idx = list.indexOfFirst { it.dedupKey == VideoSniffer.normalizeForDedup(url) }
        if (idx >= 0) list.removeAt(idx)
    }

    fun clearSniffed() = active.sniffed.clear()

    /**
     * 组装逐任务请求头。
     *
     * 只带「页面上下文」这一类：来源标识、UA、Referer、Cookie。
     * **绝不带 `Origin`**：浏览器对跨域 GET 本就不发它，伪造 Origin
     * 是与目标不同源的典型特征，会被对端直接拒绝。
     */
    private fun buildHeaders(tab: Tab, url: String, userAgent: String?): List<String> {
        val headers = mutableListOf<String>()
        headers += "X-Lerxu-Source: AndroidBrowser"
        val ua = userAgent?.takeIf { it.isNotBlank() }
            ?: tab.webView?.settings?.userAgentString
        if (!ua.isNullOrBlank()) headers += "User-Agent: $ua"
        val page = tab.referer
        if (page.isNotBlank() && !page.startsWith("about:")) headers += "Referer: $page"
        val cookie = runCatching { CookieManager.getInstance().getCookie(url) }.getOrNull()
        if (!cookie.isNullOrBlank()) headers += "Cookie: $cookie"
        return headers
    }

    /** `Content-Disposition: attachment; filename="x.zip"` → `x.zip`。 */
    private fun fileNameFromDisposition(contentDisposition: String?): String {
        val raw = contentDisposition ?: return ""
        Regex("filename\\*=UTF-8''([^;]+)", RegexOption.IGNORE_CASE).find(raw)?.let {
            return runCatching { Uri.decode(it.groupValues[1].trim()) }.getOrDefault("")
        }
        Regex("filename=\"?([^\";]+)\"?", RegexOption.IGNORE_CASE).find(raw)?.let {
            return it.groupValues[1].trim()
        }
        return ""
    }

    // ─── 导航 ───

    /** 加载我们自己的首页；[focus] = 要求首页脚本把焦点放进居中输入框。 */
    fun loadHome(focus: Boolean = false) {
        val tab = active
        tab.pendingHomeFocus = focus
        tab.homeRequested = true
        // 主题 / 语言 / 聚焦不进 URL：由 shouldInterceptRequest 注入进 HTML 本体
        viewOf(tab).loadUrl(HOME_URL)
    }

    /** 首页 HTML 模板（读一次缓存住；注入是纯字符串替换，不重复读资源）。 */
    private var homeTemplateCache: String? = null

    /**
     * 把首页 HTML 连同主题一起产出来（后台线程调用）。
     *
     * 两处占位符：启动配置（BOOT JSON）与主题色板（CSS token 块）。
     * 任何一步失败都返回 null —— 退回原始资源加载，页面仍有兜底配色，
     * 总比以前靠 JS 桥补色、首帧必然闪一下的写法可靠。
     */
    private fun serveHome(tab: Tab): WebResourceResponse? {
        val template = homeTemplateCache ?: runCatching {
            context.assets.open("browser-home.html").use {
                it.readBytes().toString(Charsets.UTF_8)
            }
        }.getOrNull() ?: return null
        homeTemplateCache = template
        val boot = buildString {
            append("{\"lang\":\"").append(homeLang).append("\",")
            append("\"dark\":").append(if (homeDark) "true" else "false").append(',')
            append("\"colors\":\"").append(homeColors).append("\",")
            append("\"focus\":").append(if (tab.pendingHomeFocus) "true" else "false").append('}')
        }
        tab.pendingHomeFocus = false
        val html = template
            .replace("/*__LERXU_BOOT__*/null", boot)
            .replace("/*__LERXU_THEME__*/", homeThemeCss())
        return WebResourceResponse("text/html", "utf-8", html.byteInputStream())
    }

    /**
     * 当前主题的一套色板同时写进 `:root` 与 `html.dark` —— 两类的 token
     * 值完全相同，明暗类名判定就算出错颜色也照样跟随应用主题。
     * 色板还没同步到（不足 6 个 token）时返回空串，用模板自带的兜底配色。
     */
    private fun homeThemeCss(): String {
        val tokens = homeColors.split(',').map { it.trim() }
        if (tokens.size < HOME_COLOR_TOKENS) return ""
        val names = listOf("--bg", "--panel", "--border", "--text", "--muted", "--primary")
        val decl = buildString {
            append("color-scheme:").append(if (homeDark) "dark" else "light").append(';')
            names.forEachIndexed { i, name -> append(name).append(':').append(tokens[i]).append(';') }
        }
        return ":root{$decl} html.dark{$decl}"
    }

    /**
     * 活动标签页若还是空白（从没加载过任何页面），就打开自家首页。
     * 界面在进入浏览器时调用 —— 避免用户看到一片空白。
     */
    fun ensureHomeLoaded(focus: Boolean = false) {
        val tab = active
        if (tab.homeRequested) return
        if (tab.url.isBlank() && tab.loadError == null) loadHome(focus)
    }

    /** 把当前主题 / 语言下发给首页脚本（首页每次加载完都会调用一次）。 */
    private fun refreshHomeConfig(tab: Tab) {
        val payload = buildString {
            append("{\"dark\":").append(if (homeDark) "true" else "false").append(',')
            append("\"lang\":\"").append(homeLang).append("\",")
            append("\"colors\":\"").append(homeColors).append("\",")
            append("\"focus\":").append(if (tab.pendingHomeFocus) "true" else "false").append('}')
        }
        tab.pendingHomeFocus = false
        runCatching {
            tab.webView?.evaluateJavascript(
                "window.LerxuHomeInit && window.LerxuHomeInit($payload)",
                null
            )
        }
    }

    /** 地址栏提交：按当前引擎把输入解析成 URL 并加载。 */
    fun load(input: String, engine: SearchEngine) {
        BrowserUrl.toUrl(input, engine)?.let {
            navSubmitting = true
            viewOf(active).loadUrl(it)
        }
    }

    fun loadUrl(url: String) = viewOf(active).loadUrl(url)

    fun reload() {
        active.webView?.reload()
    }

    /**
     * 下拉刷新的触发：先标记「刷新中」（指示器转起来）再重载。
     *
     * 顺序不能反 —— 先 reload 的话，`onPageStarted` 会抢在标记之前跑到界面，
     * 出现一帧「既不转、也没有任何刷新迹象」的空档。
     *
     * 同时挂一个看门狗：页面迟迟不回调 `onPageFinished`（例如被系统掐掉渲染进程）
     * 时别让指示器一直转下去。正常路径会提前把它撤掉。
     */
    private fun startPullRefresh() {
        val tab = active
        tab.pullRefreshing = true
        reload()
        tab.pullWatchdog?.let { main.removeCallbacks(it) }
        val watchdog = Runnable { clearPullRefresh(tab) }
        tab.pullWatchdog = watchdog
        main.postDelayed(watchdog, 20_000L)
    }

    /** 结束某一页的下拉刷新（加载结束 / 手动停止 / 看门狗兜底）。 */
    private fun clearPullRefresh(tab: Tab) {
        tab.pullWatchdog?.let { main.removeCallbacks(it) }
        tab.pullWatchdog = null
        tab.pullRefreshing = false
    }

    fun stopLoading() {
        clearPullRefresh(active)
        active.webView?.stopLoading()
    }

    /**
     * 后退一页（重做后的语义）：**只走网页历史**。
     *
     * 坞的返回键、系统返回、右滑手势都走这一条 —— 有上一页就退，没有就
     * 什么都不做，**任何情况下都不"回首页"**。
     *
     * 为什么把"回首页"彻底拿掉：恢复出来的标签页没有历史，历史到头时回首页
     * 会把首页压成新的历史项，再点又退回来，首页 ⇄ 记录页 可以无限循环
     *（用户点名）；现在首页由"进浏览器开新标签"负责，返回键不再兼职它。
     *
     * 退完立刻刷新可退 / 可进：坞上那枚按钮的灰亮同帧跟上，不用等下一页
     * 的 onPageStarted（那中间按钮会先闪一下灰）。
     */
    fun goBack() {
        val tab = active
        val view = tab.webView ?: return
        if (view.canGoBack()) {
            // 首选 WebView 自己的后退：完整还原上一页（含页内状态、滚动位置）
            view.goBack()
            syncNavState(tab, view)
            return
        }
        // WebView 自己退不动了（典型：重启后恢复出来的这一页 —— 前后退列表不跨
        // 进程）：用自建访问地址栈退回上一层，加载完把它自己的历史清掉，
        // 免得下一次后退又"向前跳"回刚才那页
        val stack = tab.visited
        if (stack.size < 2) return
        stack.removeAt(stack.size - 1)
        tab.pendingHistoryClear = true
        runCatching { view.loadUrl(stack.last()) }
        syncNavState(tab, view)
    }

    /** 前进一页（左滑手势与将来的前进入口用）。同样只走网页历史。 */
    fun goForward() {
        val tab = active
        val view = tab.webView ?: return
        if (!view.canGoForward()) return
        view.goForward()
        syncNavState(tab, view)
    }

    private fun syncNavState(tab: Tab, view: WebView) {
        // 可退 = WebView 自己有历史，或者自建访问栈里还有上一层
        //（重启后恢复出来的页面就是后者 —— 只看 WebView 会把返回键错误地置灰）
        tab.canGoBack = view.canGoBack() || tab.visited.size >= 2
        tab.canGoForward = view.canGoForward()
    }

    /** 注入采集脚本（每次页面加载完注入一次；脚本自身有幂等保护）。 */
    private fun injectSniffer(view: WebView) {
        runCatching { view.evaluateJavascript(VideoSniffer.INJECT_JS, null) }
    }

    /**
     * 把应用主题应用到外部网页：交给 [WebThemeEngine] —— 优先让网页启用
     * **它自己的**深色/浅色模式（站点官方调色板 / prefers-color-scheme），
     * 页面没跟上时才落我们的兜底覆盖；媒体内容（视频/图片/canvas）
     * 一律排除在主题化之外（不再用整页 filter 反色）。
     *
     * 调用时机：加载早期连环重试（首帧就对）、加载完成、SPA 路由变化
     *（doUpdateVisitedHistory）、主题切换（homeDark setter）。
     * 脚本幂等：重复调用只是更新同一个 style 节点，不闪也不抖。
     */
    private fun applyWebTheme(tab: Tab) {
        val view = tab.webView ?: return
        if (tab.isHomePage) return
        val host = runCatching { Uri.parse(tab.url).host }.getOrNull().orEmpty()
        val theme = WebThemeEngine.css(host, homeDark, WebThemeEngine.safeTokens(homeColors))
        val payload = WebThemeEngine.RUNTIME_JS +
            "window.__lerxuTheme.set(\"" + jsString(theme.native) + "\",\"" +
            jsString(theme.fallback) + "\"," + homeDark + ");"
        runCatching { view.evaluateJavascript(payload, null) }
        injectDockAvoid(view)
    }

    private fun jsString(s: String): String =
        s.replace("\\", "\\\\").replace("\"", "\\\"")

    /**
     * 现代模式：网页铺到屏幕底，底部**固定**元素会被坞挡住。Compose 侧动不了
     * 网页里的东西，注入一段脚本分两种策略处理：
     *
     * **① 悬浮元素**（宽度不到整宽、或底边离屏底有距离：cookie 小条、B 站那种
     * 圆角悬浮按钮）→ 整体**上移**。它们本来就飘着，往上挪没有任何违和感。
     *
     * **② 贴底且整宽的元素**（全宽操作条、半屏弹窗、登录罩）→ **绝不上移**。
     * 这种元素是"铺满整宽、贴着屏底"的，抬起来必定在下方空出一条缝（用户点名的
     * 问题）。矮的那一档（网页自己的**底部导航**）改成**向上延伸**：补一段
     * `padding-bottom` 把手势条那一截垫进它自己的背景里，内容抬到小横条之上、
     * 背景仍然贴到屏幕底，下方不会露出应用底色；同时把它**报给原生**
     *（[bottomOverlayPx] / [bottomOverlayAll]），由坞自己让位：矮的抬到它上面去，
     * 从**底部升起来**的整屏弹层干脆滑走藏起来。
     *
     * **顶部整屏层**（顶部导航面板、它那层遮罩 —— 常见写法 `top:44px;bottom:0`，
     * 从导航条下沿铺到屏幕底）不算"底部元素"：这种层在场时坞**原地不动**。它一开
     * 坞就让位是用户点名的问题（B 站顶栏），而且那一刻页面自己的底部导航多半也被
     * 它盖着，抬上去毫无意义。分界看**"面"在哪一头**：上沿落在屏幕顶部 20% 以内
     * 算顶部层，落在其下才是从底部升起的弹层。
     *
     * 判定不看"谁的 z-index 高"，而是用 `elementFromPoint` 问一句"这里最上面是谁" ——
     * 透明外壳、pointer-events:none 的全屏 wrapper 会被这一句筛掉（那些站点的
     * 骨架元素到处都是，按尺寸/层级判定必然误伤）。
     *
     * 上移那一路的实现细节（都踩过）：
     * - 判定带 = `window.__lerxuDockPad`（坞的实时占位高度，界面在收起/展开时
     *   通过 [updateDockAvoid] 改它并**立即重跑**，按钮跟着坞实时让位）；
     * - 用 `translateY` 位移而不是改 `bottom` —— 悬浮按钮常常是 top/transform
     *   定位，改 bottom 根本不动它；已位移过的元素保留原始 transform，
     *   重算时按"原始底边"求差量，能来回调整而不是一次性推开；
     * - 自身与祖先打标记防层层推移；异步插入的条去抖复检。
     */
    private fun injectDockAvoid(view: WebView) {
        // 启停以 `dockAvoidOn` 为准（界面按方案下发）；还没下发过时（首帧竞态）
        // 退回读方案设置 —— 漏注入的页面要等下次导航才会补上
        if (!(dockAvoidOn ?: dockModern)) return
        val js = "window.__lerxuDockPad=$dockAvoidPad;window.__lerxuGesture=$gesturePad;" +
            "(function(){" +
            "if(window.__lerxuDockAvoidApply)return;" +
            // 上一次被停过（切到传统模式）：这次是重新启用的，把停止标记清掉
            "window.__lerxuDockAvoidOff=false;" +
            // 状态变了才过桥（每帧都 push 会把主线程刷爆）
            "function report(h,all){" +
            "if(window.__lerxuDockAvoidOff)return;" +
            "var key=h+'|'+all;" +
            "if(window.__lerxuDockReport===key)return;" +
            "window.__lerxuDockReport=key;" +
            "try{if(typeof LerxuDock!=='undefined'&&LerxuDock)LerxuDock.report('{\\\"h\\\":'+h+',\\\"all\\\":'+all+'}');}catch(e){}" +
            "}" +
            // 祖先是否已经被处理过（上移过 / 为手势条垫过内边距）：
            // 被处理过的后代不再自己动 —— 否则外层那条底部导航垫高之后，
            // 里层会从"贴底"变成"悬浮"，被上移脚本再顶一次（一路往上飘）
            "function ancMarked(el){" +
            "var p=el.parentElement;" +
            "while(p&&p!==document.body){" +
            "if(p.dataset&&(parseFloat(p.dataset.lerxuShift||'')>0||" +
            "p.dataset.lerxuPadded==='1'))return true;" +
            "p=p.parentElement;}" +
            "return false;}" +
            "function apply(){" +
            // 停过就别再算了：注入时挂的 setTimeout 与观察器可能在停之后才轮到
            "if(window.__lerxuDockAvoidOff)return;" +
            "var pad=window.__lerxuDockPad||88;" +
            // 手势条那一截（dp ≈ CSS px）：贴底整宽的底部导航要把它垫进自己的背景里
            "var g=window.__lerxuGesture||0;" +
            "var vw=window.innerWidth;" +
            "var vh=window.innerHeight;" +
            "var els=document.querySelectorAll('body *');" +
            "var fullH=0,coverAll=false,topModal=false;" +
            "for(var i=0;i<els.length;i++){var el=els[i];var cs;" +
            "try{cs=getComputedStyle(el);}catch(e){continue;}" +
            "if(cs.position!=='fixed')continue;" +
            "if(cs.display==='none'||cs.visibility==='hidden')continue;" +
            "if(parseFloat(cs.opacity||'1')<0.15)continue;" +
            "var r=el.getBoundingClientRect();" +
            "if(r.width<2||r.height<2)continue;" +
            // 贴底 + 整宽 → **绝不上移**（抬起来必定在下方空出一条缝）
            "if(r.bottom>=vh-2&&r.width>=vw*0.9){" +
            "var top=document.elementFromPoint(vw*0.5,Math.min(vh-2,r.top+r.height*0.5));" +
            "if(!top||!el.contains(top))continue;" +
            "var bgc=cs.backgroundColor||'';" +
            "var vis=(bgc&&bgc!=='rgba(0, 0, 0, 0)'&&bgc!=='transparent')||" +
            "(cs.backdropFilter&&cs.backdropFilter!=='none');" +
            // "自己带面"的判定（纯色 / 毛玻璃 / 渐变）：只有这样的元素才适合垫内边距
            "var solid=vis||(cs.backgroundImage&&cs.backgroundImage!=='none');" +
            "if(r.height>vh*0.45){" +
            "var c=document.elementFromPoint(vw*0.5,vh*0.5);" +
            "if(c&&el.contains(c)&&vis){" +
            // 过半屏的整宽层看**它的"面"在哪一头**：上沿落在屏幕顶部 20% 以内
            // 的是**顶部整屏层** —— 顶部导航面板、它那层遮罩（常见写法是
            // `top:44px;bottom:0`，从导航条下沿一路铺到屏幕底，所以"贴顶"是
            // 贴导航条下沿而不是 y=0，早先只判 `top<=2` 漏的就是这种）。
            // 这种层在场时坞**原地不动**（用户点名的 B 站：顶栏一开控制栏就让位）：
            // 页面自己的底部导航这一刻多半也被它盖着，抬上去没有意义。
            //
            // 但**光看矩形分不出两者**：从底部升起的"整屏弹层"（登录罩 / 半屏
            // 卡片拉满）矩形也是"贴顶 + 铺到底"。再看一眼它是**挂在哪个边上**：
            // 顶部面板自己把上沿钉在一个正值上（`top:44px`），而底部弹层
            // 上沿是 `auto`（只钉 bottom）或就是 0 —— 后者要把坞**收走**
            //（用户点名：底部全覆盖弹窗弹出后控制栏要让位）
            "var anchoredTop=cs.top;" +
            "var topPanel=anchoredTop!=='auto'&&anchoredTop!=='0px'&&" +
            "anchoredTop!=='0'&&parseFloat(anchoredTop)>0;" +
            "if(r.top<=vh*0.2&&topPanel)topModal=true;else coverAll=true;" +
            "}" +
            "}else{" +
            // 矮的贴底整宽条（网页自己的底部导航）：让它**向上延伸**而不是上移 ——
            // 补一段 padding-bottom，把手势条那一截垫进它自己的背景里。内容
            //（图标/文字）因此抬到小横条之上，而它仍然贴到屏幕底，下方不会露出
            // 应用底色（用户点名的"割裂感"）。
            // 透明外壳**不垫**：垫了只是把它里面那条导航顶上去，下方反而露缝。
            "var pb=parseFloat(cs.paddingBottom||'0')||0;" +
            "if(g>0&&solid&&pb<g-0.5&&!ancMarked(el)&&el.dataset.lerxuPadNo!=='1'){" +
            "var h0=r.height;var saved=el.style.paddingBottom;" +
            "el.style.paddingBottom=g+'px';" +
            // 高度被写死（box-sizing:border-box + 固定高）时垫内边距只会压扁内容，
            // 那不算"向上延伸"：量一下没长高就原样还原，并打上"试过没用"的标记 ——
            // 否则每次复检都会再写一次内边距，样式变更又触发复检，白白空转
            "if(el.getBoundingClientRect().height<=h0+0.5){el.style.paddingBottom=saved;" +
            "el.dataset.lerxuPadNo='1';}" +
            "else{el.dataset.lerxuPadded='1';" +
            "if(el.dataset.lerxuPadBase===undefined)el.dataset.lerxuPadBase=saved;}" +
            "}" +
            "var rh=el.getBoundingClientRect().height;" +
            "if(rh>fullH)fullH=rh;" +
            "}" +
            "continue;}" +
            "if(r.height>vh*0.45)continue;" +
            "var shifted=parseFloat(el.dataset&&el.dataset.lerxuShift||'')||0;" +
            // 原始底边间距：首次测得后缓存。位移过程中 rect 在动，
            // 每次都从当前 rect 反推会在动画中途算错目标、来回抖
            "var origGap;" +
            "if(el.dataset&&el.dataset.lerxuOrigGap!==undefined){origGap=parseFloat(el.dataset.lerxuOrigGap);}" +
            "else{origGap=vh-r.bottom-shifted;}" +
            "if(origGap<-pad||origGap>pad+40)continue;" +
            "var need=pad-origGap;" +
            // 祖先已经被处理过（或被上移过）：这个元素跟着祖先走，自己不动
            "if(ancMarked(el))continue;" +
            "if(need<=0){" +
            "if(shifted>0){el.style.transition='transform 300ms cubic-bezier(.22,.61,.36,1)';" +
            "el.style.transform=el.dataset.lerxuBase||'';" +
            "el.dataset.lerxuShift='0';}continue;}" +
            "if(Math.abs(need-shifted)<2)continue;" +
            "if(el.dataset.lerxuBase===undefined){" +
            "el.dataset.lerxuBase=cs.transform&&cs.transform!=='none'?cs.transform:'';" +
            "el.dataset.lerxuOrigGap=String(origGap);}" +
            // 丝滑移动：给 transform 挂过渡（300ms，与坞的形变同一节奏），
            // 收起 / 展开时按钮跟着滑动而不是瞬移
            "el.style.transition='transform 300ms cubic-bezier(.22,.61,.36,1)';" +
            "var base=el.dataset.lerxuBase||'';" +
            "el.style.transform=(base?base+' ':'')+'translateY(-'+need+'px)';" +
            "el.dataset.lerxuShift=String(need);" +
            "}" +
            // 顶部整屏层在场：坞原地不动 —— 既不上抬（页面自己的底栏这时被它盖着），
            // 也不滑走（那是"从底部升起来的整屏弹层"才有的待遇）
            "report(topModal?0:Math.round(fullH),topModal?false:coverAll);" +
            "};" +
            "window.__lerxuDockAvoidApply=apply;" +
            "apply();" +
            "if(!window.__lerxuDockAvoid){" +
            "window.__lerxuDockAvoid=true;" +
            "setTimeout(apply,1200);setTimeout(apply,3000);" +
            // 观察 DOM：**新插入的节点立刻复检**（80ms）—— 底部条/弹窗刚出现的那一下
            // 坞要马上让位，等 400ms 才抬就是用户说的"过一会才让位"。换 class/style 的
            // 那一类仍然去抖 400ms（那多半是我们自己写入引发的，立刻复检会自激）；
            // 两条定时器**分开**：页面连续插节点（信息流）时，快的那条照常按 80ms
            // 节流复检，不会因为慢的那条一直被推迟而完全不跑
            "var tf,ts;try{var mo=new MutationObserver(function(ms){var add=false;" +
            "for(var i=0;i<ms.length;i++){" +
            "if(ms[i].type==='childList'&&ms[i].addedNodes&&ms[i].addedNodes.length){add=true;break;}}" +
            "clearTimeout(ts);ts=setTimeout(apply,400);" +
            "if(add){clearTimeout(tf);tf=setTimeout(apply,80);}" +
            "});mo.observe(document.body,{childList:true,subtree:true,attributes:true," +
            "attributeFilter:['class','style','hidden']});window.__lerxuDockAvoidObs=mo;}catch(e){" +
            "}" +
            // 弹层多半是**滑上来**的：插入时还在屏外，靠 CSS 过渡/动画就位 ——
            // 插入那一下它还没贴底，光靠 80ms 复检抓不到。监听过渡/动画**结束**，
            // 那一帧它才真正就位，坞这时让位就不会"过一会"。
            // 两道廉价筛选，避免滚动中满页入场动画把整页扫描带起来：
            // ① 是我们自己写的位移 / 内边距就跳过（否则自激）；
            // ② 目标得落在**底部那一带**（离屏底 160px 内）才值得复检 —— 只读它
            //   一个 rect，不做全页遍历
            "if(!window.__lerxuDockTendOn){window.__lerxuDockTendOn=true;" +
            "var q;var onEnd=function(e){if(window.__lerxuDockAvoidOff)return;" +
            "var t=e.target;if(!t||t.nodeType!==1||!t.getBoundingClientRect)return;" +
            "if(t.dataset&&(t.dataset.lerxuPadded||t.dataset.lerxuShift))return;" +
            "var r;try{r=t.getBoundingClientRect();}catch(e2){return;}" +
            "if(r.bottom<window.innerHeight-160)return;" +
            "clearTimeout(q);q=setTimeout(apply,60);};" +
            "document.addEventListener('transitionend',onEnd,true);" +
            "document.addEventListener('animationend',onEnd,true);}" +
            // 滚动方向：页面自己的 `scroll` 事件是**逐帧**的（跟手指同一帧），
            // 坞因此实时让位/复位 —— 不再走 View 那套成批同步的回调。
            // 挂在 document 的**捕获**阶段：滚动事件不冒泡，但捕获路径能拿到 ——
            // 页面把内容装在内部滚动容器里（`#app{overflow:auto}`、弹层自己的滚动区）
            // 时 window 上根本收不到，只挂 window 的话那些页面坞压根不收起。
            // 每个滚动源各自记上次位置（换源时不会因为起点不同被误判成反向）。
            // 只在**方向翻转**时过桥：同一个方向连续滚动不必每帧喊一次，
            // 原生那边收到的是"现在该收还是该展"的单比特状态
            "if(!window.__lerxuDockScrollOn){window.__lerxuDockScrollOn=true;var dir=-1,acc=0;" +
            "document.addEventListener('scroll',function(e){" +
            "if(window.__lerxuDockAvoidOff)return;" +
            "var t=e.target||document;" +
            "var y=(t===document||t===window)?(window.scrollY||0):(t.scrollTop||0);" +
            "var prev=t.__lerxuScrollTop;if(prev===undefined)prev=y;" +
            "t.__lerxuScrollTop=y;var d=y-prev;if(!d)return;" +
            // 判方向按**累计位移**：慢速拖动每帧只挪一两像素，按单次事件判会一直
            // 不达阈值 —— 那种滚动坞就不收了（用户要的是实时）。方向一翻转就把
            // 累计量清零重新计，来回抖也不会乱
            "if((d>0&&acc<0)||(d<0&&acc>0))acc=0;" +
            "acc+=d;" +
            "if(acc>8||acc<-8){var nd=acc>0?1:0;acc=0;" +
            "if(nd!==dir){dir=nd;" +
            "try{if(typeof LerxuDock!=='undefined'&&LerxuDock)LerxuDock.scroll(nd);}catch(e2){}}" +
            "}},true);}" +
            "}" +
            "})();"
        runCatching { view.evaluateJavascript(js, null) }
    }

    /**
     * 停掉避让脚本并把已经位移过的元素复位（切到传统界面方案时下发）。
     *
     * 为什么必须显式停：脚本是页面级的，导航不会把它清掉 —— 传统模式的网页
     * 本来就预留了底边（见 `bottomInset`），压根不需要避让；留着观察器只会
     * 把弹窗一路报上来，让传统工具栏按现代的规则抬起来/藏起来（用户点名）。
     */
    private fun stopDockAvoid(view: WebView) {
        val js = "(function(){" +
            "window.__lerxuDockAvoidOff=true;" +
            "if(window.__lerxuDockAvoidObs){" +
            "try{window.__lerxuDockAvoidObs.disconnect();}catch(e){}" +
            "window.__lerxuDockAvoidObs=null;}" +
            "window.__lerxuDockAvoidApply=null;" +
            "window.__lerxuDockAvoid=false;" +
            "window.__lerxuDockReport=null;" +
            "try{var els=document.querySelectorAll('body *');" +
            "for(var i=0;i<els.length;i++){var el=els[i];" +
            "if(el.dataset&&parseFloat(el.dataset.lerxuShift||'')>0){" +
            "el.style.transition='transform 300ms cubic-bezier(.22,.61,.36,1)';" +
            "el.style.transform=el.dataset.lerxuBase||'';" +
            "el.dataset.lerxuShift='0';}" +
            // 为手势条补的那段 padding 也要还回去：传统模式网页本来就留了底边，
            // 留着它只会把底部导航凭空撑高一截
            "if(el.dataset&&el.dataset.lerxuPadBase!==undefined){" +
            "el.style.paddingBottom=el.dataset.lerxuPadBase;" +
            "delete el.dataset.lerxuPadBase;}" +
            "if(el.dataset&&el.dataset.lerxuPadded!==undefined){" +
            "delete el.dataset.lerxuPadded;}" +
            "if(el.dataset&&el.dataset.lerxuPadNo!==undefined){" +
            "delete el.dataset.lerxuPadNo;}}}" +
            "catch(e){}" +
            "})();"
        runCatching { view.evaluateJavascript(js, null) }
    }

    /**
     * 坞收起 / 展开时实时调整网页底部固定元素的让位距离
     *（收起只剩一枚小胶囊：68；展开是整条控制栏：88；坞被抬到整宽弹窗上面时再叠加
     * 那段高度，悬浮元素才不会正好落在抬起来的坞下面），立即重跑。
     *
     * [gesturePx] = 系统手势条那一截（dp ≈ CSS px）：贴底整宽的底部导航按它向上延伸。
     * [enabled] = 现代界面方案。两个方向都要处理：
     * - 关（传统）：停脚本 + 复位位移 + 把旧上报值作废 —— 传统工具栏永不避让；
     * - 开（现代）：给已经加载过的页面**补一次注入**（否则要等下次导航才生效）。
     */
    fun updateDockAvoid(padPx: Int, enabled: Boolean, gesturePx: Int) {
        dockAvoidPad = padPx
        gesturePad = gesturePx
        val changed = dockAvoidOn != enabled
        dockAvoidOn = enabled
        if (changed) {
            // 方案刚变：上一套方案算出来的弹窗高度/覆盖状态作废，别让坞照旧让位
            tabs.forEach { tab ->
                tab.bottomOverlayPx = 0
                tab.bottomOverlayAll = false
            }
        }
        tabs.forEach { tab ->
            val view = tab.webView ?: return@forEach
            if (!enabled) {
                stopDockAvoid(view)
                return@forEach
            }
            if (changed) injectDockAvoid(view)
            runCatching {
                view.evaluateJavascript(
                    "window.__lerxuDockPad=$padPx;" +
                        "window.__lerxuGesture=$gesturePx;" +
                        "window.__lerxuDockAvoidApply&&window.__lerxuDockAvoidApply();",
                    null
                )
            }
        }
    }

    fun onDestroy() {
        tabs.toList().forEach { releaseTab(it) }
        tabs.clear()
        tabsOpen = false
    }
}

/** 取 JSON 字符串字段（缺失 / null 都返回空串）。 */
private fun JsonObject.string(key: String): String {
    val value = this[key] as? JsonPrimitive ?: return ""
    if (value is JsonNull) return ""
    return value.content
}
