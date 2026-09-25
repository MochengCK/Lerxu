package com.lerxu.android.browser

import android.animation.ValueAnimator
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
import android.graphics.RectF
import android.net.Uri
import android.net.http.SslError
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.view.ContextThemeWrapper
import android.view.MotionEvent
import android.widget.FrameLayout
import android.view.PixelCopy
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
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
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.ProfileStore
import androidx.webkit.ScriptHandler
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import okhttp3.Call
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.lerxu.android.R
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlin.math.abs
import kotlin.math.roundToInt
import java.io.ByteArrayInputStream
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

        /** 跟手停顿多久才判定"滚完了"（毫秒）：太短会在慢速拖动里不停地吸附。 */
        private const val DOCK_SETTLE_DELAY_MS = 110L

        /**
         * 原生播放器开着期间，多久把页面那一层（视频元素）重新按下去一次（毫秒）。
         *
         * 站点播放器会自己重试播放、有的还会把 `display` 改回来重建那块合成面 ——
         * 只按一次的话，页面那个画面会自己长回来、声音也会跟着起来。一次心跳就是
         * 主文档上一次 `evaluateJavascript`，代价可以忽略。
         */
        private const val PAGE_MUTE_INTERVAL_MS = 1000L

        /**
         * 从"量到过、后来又丢了"到切兜底形态的时限（毫秒）。
         *
         * 比下面那个**长得多**：量到过说明这一页确实有个能跟的播放器，位置多半只是
         * 转屏/切集那一下短暂断掉，等等看比立刻摆一块整宽贴顶的东西强。
         */
        private const val PLAYER_RECT_WAIT_MS_LOST = 4000L

        /**
         * **从没量到过**到切兜底形态的时限（毫秒）。
         *
         * 这种页面基本是"压根没有可跟的 `<video>`"（用户从「本页资源」手点一路流、
         * 而页面上没有视频元素）：兜底形态（顶部一块 16:9）就是唯一能看的形态，
         * 等太久等于开播后几秒钟什么都没有。
         */
        private const val PLAYER_RECT_WAIT_MS_NONE = 1500L

        /**
         * 页面报上来的矩形多久之内算"新鲜"（毫秒）。
         *
         * 页面在起播那一拍**先报位置、再通知我们接管**（见 PageVideoDetector 的 onPlay：
         * 两条都从同一个 JS 桥线程依次进来，顺序不变），所以接管那一刻手里就该有位置。
         * 用"新鲜度"而不是无条件信任：上一次播放留下的旧矩形（页面可能已经滚过）
         * 不该被当成这一路的起点。
         */
        private const val PLAYER_RECT_FRESH_MS = 2000L

        /**
         * 页面报"位置丢了"之后等多久才真清掉（毫秒）。
         *
         * 转屏 / 切清晰度 / 切集时站点会把播放器重建一下，中间那一瞬元素是断开的 ——
         * 立刻清掉就会出现"全屏转回来播放器不见了"。这段时间里报回新位置就作废。
         */
        private const val PLAYER_RECT_GONE_GRACE_MS = 900L

        /** 首页色板的 token 个数（bg/panel/border/text/muted/primary，与 browser-home.html 同序）。 */
        private const val HOME_COLOR_TOKENS = 6

        /**
         * 影视模式取页面内容的四拍（ms）。
         *
         * 与主题注入同一套思路（见 `onPageStarted`）：页面 DOM 是**异步渲染**的，
         * 进影视模式的那一刻往往一个卡片都还没有，按几拍取、谁先拿到内容谁算数。
         */
        private val MOVIE_EXTRACT_DELAYS_MS = listOf(0L, 400L, 1200L, 2500L, 4000L, 6500L)

        /** 最后一拍之后再等这么久才收尾（让这一拍的回调真正回来，见 `finishMovieExtract`）。 */
        private const val MOVIE_EXTRACT_SETTLE_MS = 900L

        /**
         * 钉住影视模式后，连着几页都取不到内容（页面自己也没报视频）就自动退出。
         *
         * 分类页 / 列表页没有 `<video>`，进来只能靠提取；提取不到就是"这一页我们没东西可给"
         * ——继续把人关在一个空壳里不如放回网页（这是"不被困住"的那条出路之一）。
         */
        private const val MOVIE_PIN_FAIL_LIMIT = 3

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

        /** 浏览历史（全局，与标签页无关）：首页面板的"历史记录"就来自它。 */
        private const val PREF_BROWSE_HISTORY = "browse_history"

        /** 每页自建访问栈的深度上限：够回退到"上一层"，又不至于无限长。 */
        private const val MAX_VISITED = 40

        /** 首页搜索页最多列几行（列表本身可滚动，超出的一行行滚出来，不再被裁半行）：
         *  键盘弹起后可用高度只有几百 px，所以这里给的是"一次渲染多少"，
         *  不是"最多能看到多少" —— 空输入时只有"最近访问"，可以多给几行。 */
        private const val HOME_SUGGEST_LIMIT = 10
        private const val HOME_HISTORY_RECENT = 6
        private const val HOME_SEARCH_RECENT = 5

        /**
         * 历史查看页（"查看更多"那一层）最多列几条：正常删下来的搜索项不会到这个量级，
         * 给一个够宽的上限就行 —— 要的是"面板里那 5 条之外的全都能看到"。
         */
        private const val HOME_SEARCH_ALL = 120

        /**
         * 必应深浅色 cookie（`SRCHHPGUSR`）要写的入口。
         *
         * 两个域都得写：搜索走 `www.bing.com`（会 302 到 `cn.bing.com`），
         * 而 cookie 是按域存的 —— 只写一个，落到另一个域上就白写了。
         */
        private val BING_COOKIE_URLS = listOf(
            "https://www.bing.com/",
            "https://cn.bing.com/"
        )

        /** 联想词防抖：连着打字的中间态不发请求，停下来再看建议。
         *  取 150ms：防抖只是为"别把中间态发出去"，而每次请求要付一个完整 RTT，
         *  这个值太大就成了纯粹的白等（原来 220ms，配上冷启动要 600ms+ 才见词）。 */
        private const val SUGGEST_DEBOUNCE_MS = 150L
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
         * 网页**自己的底色**（`0xRRGGBB`，-1 = 量不出来 / 画布透明）。
         *
         * 顶部那一截系统栏跟着它走（见 [DockBridge.bg]）：深色网页不能再顶着一条
         * 应用底色的带子。跟着标签页存 —— 切页要立刻换成那一页的颜色。
         */
        var pageBgArgb by mutableStateOf(-1)
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
         * 页面工具的文档起始脚本句柄（广告隐藏 + 视频控件，见 `installPageToolsDocStart`）。
         * 与 [themeDocStart] 一样是"先撤再挂"式的更新。
         */
        internal var toolsDocStart: ScriptHandler? = null

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

        /**
         * 这一次首页**是"过路"来的**，别把它当成历史里的根（见 [loadHome] 的 keepHistory）。
         *
         * 正常路径下首页是根：加载完就把 WebView 的前后退列表清掉，返回键在首页上置灰
         * （用户点名要的）。但从网页里点地址栏跳进搜索页时不一样 —— 用户只是去搜个词，
         * 刚才那页还得在。清掉就真回不去了，所以这一路留着历史。
         *
         * 只对**这一次**加载有效：首页加载完即消费掉，此后回到首页（如收藏夹里点首页、
         * 搜索结果再退回首页）照旧恢复成"根"。
         */
        internal var homeKeepHistory = false
    }

    private val main = Handler(Looper.getMainLooper())
    private val json = Json { ignoreUnknownKeys = true }
    private var nextTabId = 1L

    /**
     * 坞吸附补间用的动画器。
     *
     * 补间**放在控制器里跑**而不是交给界面：进度是"从当前值出发"的连续量，
     * 界面自己补间就得把结果再同步回控制器，跟手时一旦从补到一半的位置接上
     * 就会跳一下 —— 一份状态两处写必然打架。
     *
     * 这里用平台的 [ValueAnimator]，**不要**换成 `androidx.compose.animation.core.animate`。
     * 那个函数内部走 `withFrameNanos`，而 `withFrameNanos` 要求 `CoroutineContext`
     * 里带 `MonotonicFrameClock` —— 只有 Compose 自己发的 `AndroidUiDispatcher` 才带；
     * 控制器自建的 `CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)`
     * **不带**，于是补间一启动就抛
     * `IllegalStateException: A MonotonicFrameClock is not available in this CoroutineContext`，
     * 主线程未捕获异常 → 直接闪退。用户的现象正是"网页滚动停住就闪退"：
     * 跟手期间不跑补间（不崩），一停手进度停在半路 → 触发吸附 → 崩。
     *
     * ValueAnimator 是纯平台 API（Choreographer 驱动、跟随刷新率），不依赖 Compose
     * 环境，还自带系统的动画时长缩放（关掉动画的设备上直接落终态）。
     */
    private var settleAnimator: ValueAnimator? = null

    /** 跟手停顿到判定"滚完了"的定时器（每次新位移都重排，见 [scheduleSettle]）。 */
    private val settleTask = Runnable { settleDockNow(expand = false) }

    /** 屏幕密度：网页上报的是 CSS px，换算成设备 px 才能和拖动那一档共用 travel。 */
    private val density = context.resources.displayMetrics.density

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

    /**
     * 这个标签页是不是**无痕窗口**里的那一套。
     *
     * 不能只看 [incognitoMode]（那是"当前窗口"的状态）：[rebuildWebViewsForTheme]
     * 会把**两套**标签页一起重建，那一刻若按当前窗口判，被寄存在后台的另一套就会
     * 挂错 profile —— 无痕标签跑到默认 profile 上（cookie / 缓存与普通窗口共享，
     * 而且会落盘），普通标签被塞进无痕 profile（退出无痕时把登录态一起删掉）。
     */
    private fun isIncognitoTab(tab: Tab): Boolean = when {
        tab in parkedIncognitoTabs -> true
        tab in parkedNormalTabs -> false
        else -> incognitoMode
    }

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
     * 首页搜索页（搜索建议 + 历史）是否展开（界面同步）。
     *
     * **打开**的条件是底部地址栏聚焦且当前正是自家首页；但**关闭**与聚焦无关 ——
     * 按住列表向下拖只收起输入框（[HomeBridge.collapseInput]），搜索页要留着，
     * 由左上角返回键（[HomeBridge.exitSearch]）或导航 / 离开浏览器页来收场。
     * 界面也用它决定「返回下载器」按钮让不让位。
     */
    var homePanelsOpen by mutableStateOf(false)
        internal set

    /**
     * 搜索页里的**历史查看页**（"查看更多"点开的那一层）是否在场。
     *
     * 与 [homePanelsOpen] 是一层套一层的关系：面板本身还开着，只是内容换成
     * **只有搜索历史**、条数也不受面板那几条的限制。退出这一层回普通搜索界面，
     * 再退才离开搜索页。任何"离开搜索页"的路径（收起面板、开始输入、清空历史）
     * 都把它一起收回，免得下次聚焦进来先看到上一趟的那一页。
     */
    var homeHistoryView by mutableStateOf(false)
        internal set

    /**
     * 面板要避开的底部高度（**CSS px**，界面下发）：坞本身 + 聚焦时多出来的前缀条。
     * 面板贴底的那几条要是被坞压住，用户点不到也就等于不存在。
     *
     * 单位是 CSS px 而不是设备像素：首页页面里的 `1px` 就是 1dp（WebView 的
     * devicePixelRatio = 屏幕密度，且初始缩放为 1）。界面量到的是 dp，直接下发；
     * 早先误把 `roundToPx()` 的设备像素当 CSS px 发下来，让位量被放大了一个密度
     * 倍数 —— 面板底边被顶到半屏以上，底部留下一大片空白（用户点名）。
     */
    var homePanelBottomCss: Int = 0

    /** 地址栏当前输入（面板里的历史按它过滤）。 */
    private var homeQuery: String = ""

    /** 浏览历史：全局一份，最近在前。落盘见 [persistHistory]。 */
    private var history: List<HistoryEntry> = emptyList()

    /** 这一次拿到的联想词（引擎给的）；空 = 还没发请求或这次没结果。 */
    private var homeSuggestions: List<String> = emptyList()

    /** 在飞的联想词请求：输入一变就取消，免得慢响应盖掉新结果。 */
    private var pendingSuggest: Call? = null

    /** 联想词请求的序号：只有"最后一次输入"的结果才作数。 */
    private var suggestSeq = 0

    /** 防抖用的钩子（[main] 上 postDelayed / removeCallbacks 复用同一个实例）。 */
    private var suggestTick: Runnable = Runnable { }

    /**
     * 「请收起地址栏的焦点与键盘」信号（只增计数）。
     *
     * 面板里点了建议 / 历史之后，网页已经接管了这次导航，但地址栏的焦点仍在、
     * 键盘也不收，框里还留着上一串输入 —— 界面看到计数变化就清焦点。
     */
    var addressBlurTick by mutableStateOf(0)
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

    /**
     * 坞是不是"当下就在场上"：停在浏览器页、而且完整可见（界面同步）。
     *
     * 不成立时网页滚动一律不接管 —— 页面自己的自动滚动（轮播、直播流列表、
     * 自动翻页的资讯流）照样会发 `scroll` 事件，坞这时要么不在屏幕上（标签网格
     * 盖着）、要么正在切换到按钮形态，跟着它收起来纯属莫名其妙。
     */
    var dockEngaged: Boolean = false

    /**
     * 坞是否已经收起（界面用它做"点一下恢复"这类离散判断）。
     *
     * 由进度推导而来，**不另存一份**：两份状态必然打架。
     */
    val dockCollapsed: Boolean
        get() = dockProgress >= DockFollow.SNAP_AT

    /**
     * 底部坞的**收起进度** 0..1：0 = 完整展开，1 = 收紧成只剩链接输入框的小胶囊。
     *
     * 它是坞收起/展开的**唯一真相**，界面每一帧只读它。三条写入来源：
     * - 网页滚动（[DockBridge.scroll]）：把 `scrollY/scrollTop` 的**逐帧增量**换算成
     *   进度增量 —— 就是用户要的"跟手"（网页向下滚收、向上滚展）；
     * - 在坞上纵向拖动（界面里的 pointerInput）：同一套语义，拖动距离换算成进度；
     * - 吸附（[settleDockNow]）：跟手停下后按"过没过一半"补间到 0 / 1。
     *
     * 方向认的是**网页滚动方向**，不是手指方向（用户点名）：手指上滑 = 内容上移
     * = 网页向下滚 = 收起。这两个方向天然相反，绑错就会变成"手指一上滑坞反而展开"。
     */
    var dockProgress by mutableFloatStateOf(0f)
        private set

    /**
     * 跟手速度（进度/秒，EMA 平滑）：吸附的初速与 fling 判据都用它。
     *
     * 单位与 [DockFollow.springValue] 的初速同口径（1 = 一整段行程）。
     * 只在跟手（网页滚动 / 坞上拖动）期间累积，吸附开始即清零。
     */
    private var dockVelocity = 0f

    /** 上一次跟手采样的时刻（uptimeMillis；0 = 还没有采样）。 */
    private var dockFollowAt = 0L

    /**
     * 跟手推进收起进度。[deltaPx] > 0 = **网页向下滚**（内容往上走、继续看下面的）
     * → 收起；< 0 = 网页向上滚 → 展开。[travelPx] = 从全展滚到全收需要多少像素。
     *
     * [settleAfterIdle] = 停顿一段就自动吸附（网页滚动走它：滚动事件停了就等于滚完了）。
     * 在坞上拖动时给 false —— 手指还按着，中间的停顿不代表结束，等抬手再
     * [settleDock]（否则按住不动一会儿，坞会自己吸走）。
     *
     * 换算规则本身在 [DockFollow] 里（纯函数，单测钉着方向与吸附阈值）。
     */
    fun followDock(deltaPx: Float, travelPx: Float, settleAfterIdle: Boolean = true) {
        if (travelPx <= 0f || deltaPx == 0f) return
        // 跟手期间不做补间：把正在跑的吸附补间掐掉，进度直接跟着手指走
        cancelSettleAnimation()
        // 跟手速度（进度/秒，EMA 平滑）：吸附的初速与 fling 判据都用它。
        // 事件间隔不匀（逐帧 / 成批），瞬时值直接当速度会抖，先过一层平滑；
        // 单次间隔夹到 120ms —— 网页卡一下再回传一次大增量，不该被算成"飞快"
        val now = android.os.SystemClock.uptimeMillis()
        if (dockFollowAt > 0L) {
            val dt = (now - dockFollowAt).coerceIn(1L, 120L)
            val instant = (deltaPx / travelPx) / (dt / 1000f)
            dockVelocity = DockFollow.smoothVelocity(dockVelocity, instant)
        }
        dockFollowAt = now
        dockProgress = DockFollow.advance(dockProgress, deltaPx, travelPx)
        if (settleAfterIdle) scheduleSettle()
    }

    /** 跟手停下（或坞上松手）后吸附：过半就收进去，不到一半就展回来。 */
    fun settleDock() = settleDockNow(expand = false)

    /** 立刻回到展开态（导航 / 聚焦 / 回首页 / 点胶囊都走它）。 */
    fun expandDock() = settleDockNow(expand = true)

    /** 跟手停顿多久才判定"滚完了"（毫秒）：太短会在慢速拖动里不停地吸附。 */
    private fun scheduleSettle() {
        main.removeCallbacks(settleTask)
        main.postDelayed(settleTask, DOCK_SETTLE_DELAY_MS)
    }

    private fun cancelSettleAnimation() {
        settleAnimator?.let {
            it.removeAllUpdateListeners()
            it.cancel()
        }
        settleAnimator = null
    }

    private fun settleDockNow(expand: Boolean) {
        main.removeCallbacks(settleTask)
        val from = dockProgress
        // 吸附用的速度是**停手那一刻按时间衰减过的**残值：停手判定有 110ms 延迟，
        // 拿全速去吸附会让坞越冲越远。命令式展开（导航 / 聚焦 / 点胶囊）不带速度，
        // 从当前位置平平地吸回 0
        val idle = if (dockFollowAt > 0L) {
            android.os.SystemClock.uptimeMillis() - dockFollowAt
        } else {
            Long.MAX_VALUE
        }
        val v0 = if (expand) 0f else DockFollow.decayVelocity(dockVelocity, idle)
        val target = if (expand) 0f else DockFollow.settleTarget(from, v0)
        cancelSettleAnimation()
        dockVelocity = 0f
        dockFollowAt = 0L
        // 已经到位就直接落定：不起动画，也**不留下一个"正在跑"的错觉**
        if (from == target && kotlin.math.abs(v0) < 0.05f) {
            dockProgress = target
            return
        }
        // 带初速的临界阻尼弹簧（解析解逐帧求值）：跟手怎么停的、吸附就怎么接上 ——
        // 上一版是固定 220ms 的 tween，快甩之后速度被硬生生归零，读起来就是
        // "甩完它自己慢慢挪"（用户点名的跟手不跟手）。ValueAnimator 只走时间，
        // 位移按 DockFollow.springValue 解出来；写入时夹 0..1（进度是饱和量，
        // 允许数学上的一次轻微过冲，但不许把宽度算成负数）
        val durationMs = DockFollow.springDurationMs(from, target, v0)
        settleAnimator = ValueAnimator.ofFloat(0f, durationMs / 1000f).apply {
            duration = durationMs
            interpolator = android.view.animation.LinearInterpolator()
            addUpdateListener {
                val t = it.animatedValue as Float
                dockProgress = DockFollow.springValue(from, target, v0, t).coerceIn(0f, 1f)
            }
            start()
        }
    }

    /**
     * 地址栏是否处于聚焦态（界面每帧同步，见 [setDockInputFocused]）。
     *
     * 聚焦期间**不许进收起态**：输入法还压着、用户正在输入，坞却缩成小胶囊，
     * 读起来就是"样式错乱"（用户点名）。所以这条入口在 [DockBridge.scroll] 里
     * 也要堵住 —— 网页滚动回传是唯一能从"背后"改这个状态的东西。
     */
    var dockInputFocused: Boolean = false
        private set

    /**
     * 同步"地址栏是否聚焦"，并据此决定**网页能不能抢焦点**。
     *
     * WebView 是 focusable-in-touch-mode 的：被点中就把焦点从坞里的输入框抢走，
     * 输入框一失焦，键盘随之关掉。**快速连点输入框就会踩到** —— 键盘一弹出坞就
     * 跟着抬高，第二下往往落在网页上，于是"键盘刚出现就被关闭"（用户点名）。
     *
     * 地址栏聚焦期间网页不需要抢焦点：那会儿显示的是我们自己的搜索页，页面里没有
     * 输入框。触摸事件照常送达（列表的点击、下拉收起都还在），只是不再改焦点。
     * 失焦后立刻恢复 —— 网页表单的输入法照常。
     */
    fun setDockInputFocused(focused: Boolean) {
        if (dockInputFocused == focused) return
        dockInputFocused = focused
        tabs.forEach { tab -> tab.webView?.let { setWebTouchFocusable(it, !focused) } }
    }

    private fun setWebTouchFocusable(view: WebView, focusable: Boolean) {
        runCatching {
            view.isFocusable = focusable
            view.isFocusableInTouchMode = focusable
        }
    }

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

    /**
     * 这个标签页是不是**自家首页**。
     *
     * 不只看 `isHomePage`：它由 `onPageStarted` / 恢复时写入，某些路径（新建标签后
     * 紧接着用手势）还没落值 —— 地址已经是首页的话也算，免得漏判成普通网页
     *（与 BrowserScreen 里首页那张标签卡的判据一致）。
     */
    private fun isHomeTab(tab: Tab): Boolean =
        tab.isHomePage || tab.url.startsWith(HOME_URL)

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
            // 必应这类"深浅色写在 cookie 里、由服务端渲染"的站点要提前对齐（见
            // syncBingSchemeCookie）：cookie 变了，下次请求就是它自己的深色页
            syncBingSchemeCookie()
            // 深浅色在 WebView 创建时定死（见 themedContext）：全部重建重载。
            // 主题开关不在浏览器页，这些页面都在后台，重建对用户不可见；
            // 再回到浏览器时站点已按新主题**重新渲染**（用它自己的深色模式）
            rebuildWebViewsForTheme()
            if (active.isHomePage) refreshHomeConfig(active)
        }

    /**
     * 让必应**用它自己的深色模式**，而不是被我们的兜底层盖住。
     *
     * 必应的深浅色是**服务端按 cookie 渲染**的：`SRCHHPGUSR` 里的 `PREFCOL`
     * （1 = 深色，0 = 浅色，由它自己的脚本按"系统偏好"写入）与 `THEME`
     * （2 = 跟随系统；0/1 = 用户在必应里显式选的浅/深）。
     * 首访没有这个 cookie 时，服务端先返回浅色页，等它的脚本跑起来再写 cookie
     * 并重渲染 —— 那两三秒里我们的兜底深色会盖上去，而那套配色本来就不是为
     * 必应画的（用户点名："它作为有深色模式，应该优先启用它的深色模式"）。
     *
     * 这里**提前替它把偏好写好**：进入必应前 cookie 已经是"深色"，服务端首帧
     * 就返回深色页，兜底层因此根本不会触发（页面量出来本来就是深的）。
     *
     * 只补 `PREFCOL`；`THEME` 仅在缺失时补成 2（跟随系统）—— 用户在必应里显式
     * 选过深浅就尊重他的选择，不动。写的是它自己的 cookie 格式，键名与取值都
     * 取自它的脚本（`sj_cook.set("SRCHHPGUSR","PREFCOL",…)`）。
     */
    private fun syncBingSchemeCookie() {
        val want = if (homeDark) "1" else "0"
        val manager = CookieManager.getInstance()
        BING_COOKIE_URLS.forEach { url ->
            val existing = runCatching { manager.getCookie(url) }.getOrNull().orEmpty()
            runCatching { manager.setCookie(url, bingSchemeCookie(existing, want)) }
        }
    }

    /**
     * 把 `SRCHHPGUSR` 改写成"跟随应用主题"的样子：保留它原有的其它子项
     * （语言、区域、字号…），只换 `PREFCOL`，必要时补 `THEME=2`。
     */
    private fun bingSchemeCookie(existing: String, want: String): String {
        val prefix = "SRCHHPGUSR="
        val at = existing.indexOf(prefix)
        val raw = if (at >= 0) {
            existing.substring(at + prefix.length).substringBefore(';').trim()
        } else {
            ""
        }
        val parts = raw.split('&').map { it.trim() }.filter { it.isNotEmpty() }.toMutableList()
        var hasPref = false
        var hasTheme = false
        parts.forEachIndexed { i, part ->
            when {
                part.startsWith("PREFCOL=") -> {
                    parts[i] = "PREFCOL=$want"
                    hasPref = true
                }
                part.startsWith("THEME=") -> hasTheme = true
            }
        }
        if (!hasPref) parts += "PREFCOL=$want"
        if (!hasTheme) parts += "THEME=2"
        return prefix + parts.joinToString("&")
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
        // 浏览历史同样跨启动保留：首页面板的"历史记录"要有东西可显示
        history = BrowseHistory.decode(prefs.getString(PREF_BROWSE_HISTORY, null))
        // 启动时对齐一次必应的深浅色 cookie（homeDark 的 setter 只在**变化**时跑，
        // 应用本来就是浅色时它不会触发 —— 那种情况下也要把偏好摆正）
        syncBingSchemeCookie()
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
     * 点输入框进入编辑时应显示的"原始内容"。
     *
     * - 当前页是**搜索结果页**（地址里带着某个引擎的查询参数）→ 用户当时搜的那串词
     *  （用户点名：搜索后点输入框，应该显示搜索使用的原始内容，而不是结果页地址）；
     * - 其余（输入网址 / 点链接来的页面）→ 该页地址的简写（见 [TabNaming.subtitle]）。
     *
     * 引擎按 [SearchEngines.all] **逐个试**（参数名从各自 searchUrl 里认）：用户搜完
     * 之后切过引擎也认得出来。搜索结果页里点了链接跳到新页面时，新地址不带查询参数，
     * 自然回落到该页 URL —— 不用另存一份"来源标记"（用户点名的那条规则）。
     */
    val addressEditText: String
        get() = currentSearchQuery ?: TabNaming.subtitle(currentUrl)

    /**
     * 当前页若是**搜索结果页**、用户当时搜的那串词；普通页为 null。
     *
     * 展示态也用它：结果页的页面标题通常自带引擎名（"天气 - Bing"），直接摆出来
     * 就成了"网页名 + 引擎名"（用户点名不要）—— 搜索词才是这一页该有的"名字"。
     */
    val currentSearchQuery: String?
        get() {
            val url = currentUrl
            if (url.isBlank()) return null
            return BrowseHistory.searchQueryOf(url, SearchEngines.all)?.takeIf { it.isNotBlank() }
        }

    /**
     * 网页里贴底整宽的弹窗高度（px≈dp，0 = 没有）：坞据此**抬到它上面**，
     * 而不是把弹窗上移（那会在下方留一条空隙）。
     */
    val bottomOverlayPx: Int get() = active.bottomOverlayPx

    /** 整屏覆盖的弹窗：坞滑走让开（全屏弹窗的底部按钮不该被坞盖住）。 */
    val bottomOverlayAll: Boolean get() = active.bottomOverlayAll

    /**
     * 当前页报上来的网页底色（`0xRRGGBB`，-1 = 量不出来）：顶部那一截系统栏
     * 用它当底色（见 [DockBridge.bg] 与 `BrowserScreen` 里的 `stripColor`）。
     */
    val pageBackgroundArgb: Int get() = active.pageBgArgb

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
        // 影视模式盖的是**整屏**、状态也是"台前这一屏"的：切走就得退出，否则它会盖到
        // 新标签页的网页上。退出**不拉黑这一站**（见 [leaveMovieModeForTabSwitch]），
        // 切回来时重新探一次：还成立就自动回影视模式
        val leavingMovie = movieMode
        if (leavingMovie) leaveMovieModeForTabSwitch(active)
        // 不在切换瞬间抓旧页的缩略图：PixelCopy 是异步的，等它执行时窗口里
        // 已经换成新页（抓出来会是**别的页**）。缩略图靠"页面稳定时持续维持"，
        // 旧页离开时手里那张就是它最后一次稳定可见的样子
        activeId = id
        syncActiveView()
        persistTabs()
        if (leavingMovie) restartMovieProbe(active)
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

    /**
     * 正在飞的抓取数：共用缓冲只在**没有别人在抓**时才敢用（见 [captureThumbnail]）。
     *
     * 多个抓取同时写同一张缓冲，先回来的那张读到的是后一帧 —— 卡片上就是一张
     * 撕裂 / 串页的图。这个计数只要不为 0，新的抓取就自己新开一张。
     */
    private var capturesInFlight = 0

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
        // 独占缓冲：**任何**另一个抓取在飞时都得新开一张 —— 两个 PixelCopy 同时往
        // 同一张图上写，先回来的那张读到的是后一帧（缩略图撕裂 / 串页）。空闲时才
        // 复用缓存的那张，省掉一次几 MB 的分配
        val exclusive = ownBuffer || capturesInFlight > 0
        val buffer = if (exclusive) {
            Bitmap.createBitmap(view.width, srcBottom - srcTop, Bitmap.Config.ARGB_8888)
        } else {
            thumbBuffer(view.width, srcBottom - srcTop)
        }
        capturesInFlight++
        val src = Rect(loc[0], srcTop, loc[0] + view.width, srcBottom)
        try {
            PixelCopy.request(window, src, buffer, { result ->
                // 抓取是异步的：回来时网格可能已经开了，这一帧已经不代表网页，丢掉。
                // **只有 openTabs 那一抓例外**：它发起时页面还在，PixelCopy 取的就是
                // 紧接着的那一帧 —— 网格即便已经开起来，这一张依然是用户刚才看到的
                // 画面。丢掉的话卡片只能沿用上一次存下的旧图（加载完 / 滚动停后补的
                // 那张），滚动过、键盘开合过就会跟原画面对不上（用户点名）
                capturesInFlight--
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
            capturesInFlight--
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
        // 承载播放器的那一页被关掉了：播放器跟着走（位置与声音都留不住）
        if (tab.id == playerFrameTab) nativePlayStop = true
        // 关掉的正是影视模式盖着的那一页：模式与提取出来的内容一起走（那一页都没了）
        val closingMovie = movieMode && tab.id == activeId
        if (closingMovie) leaveMovieModeForTabSwitch(tab)
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
            // 影视模式刚被上面那一句收掉：接手的这一页如果是影视页，让它自己重新举手
            if (closingMovie) restartMovieProbe(active)
        }
        persistTabs()
    }

    fun closeTabs() {
        // 作废可能还挂着的"抓帧后再开网格"（用户已经在关了）
        openTabsToken++
        tabsOpen = false
        gridFollow = -1f
    }

    /**
     * 标签网格的**跟手进度**（0..1）：手指按住链接输入框往上拖时由手势逐帧写进来，
     * 而不是等抬手后播一段固定动画（用户点名："应该做成跟手的……而不是固定的动画"）。
     *
     * 负值 = **没在跟手**，这时进度交回给 [tabsOpen] 的补间（开/关都是那一条）。
     * 与坞的 `dockProgress` 同一套做法：跟手期间只有一个真相（这个值），抬手才吸附。
     */
    var gridFollow by mutableFloatStateOf(-1f)
        private set

    /** 正在跟手拖标签页。 */
    val gridFollowing: Boolean get() = gridFollow >= 0f

    /**
     * 手指刚压上链接输入框、还没拖出位移：把"要开网格"这件事先立起来。
     *
     * 为什么不是直接调 [openTabs]：那一个要先抓一帧缩略图、抓到才置 `tabsOpen` ——
     * 跟手期间进度是手指说了算的，不能等它。这里把缩略图**先抓起来**（跟手过程中卡片上
     * 要有画面）、并把目标态立成"开"，进度则由手指逐帧推。
     */
    fun beginGridDrag() {
        if (tabsOpen || gridFollow >= 0f) return
        tabsOpen = true
        val tab = active
        val view = tab.webView
        if (view != null && view.visibility == View.VISIBLE && view.width > 0 && view.height > 0) {
            captureThumbnail(tab, onDone = {}, ownBuffer = true, authoritative = true)
        }
        gridFollow = 0f
    }

    /**
     * 跟手推网格进度：[deltaPx] 是手指的**纵向位移**（屏幕坐标，往下为正），
     * [travelPx] 是从"全关"拖到"全开"要走多少。手指往上（deltaPx < 0）→ 进度变大。
     * 第一次调用会顺带 [beginGridDrag]（抓缩略图 + 立目标态）。
     */
    fun followGrid(deltaPx: Float, travelPx: Float) {
        if (travelPx <= 0f || deltaPx == 0f) return
        if (gridFollow < 0f) beginGridDrag()
        val from = if (gridFollow < 0f) 0f else gridFollow
        gridFollow = (from - deltaPx / travelPx).coerceIn(0f, 1f)
    }

    /**
     * 抬手：按进度过半决定开还是关，并把进度交回给补间（从**当前进度**接着走，
     * 不会先跳回 0 或 1）。
     */
    fun settleGrid() {
        val p = gridFollow
        if (p < 0f) return
        gridFollow = -1f
        if (p >= DockFollow.SNAP_AT) {
            // 缩略图在 beginGridDrag 里已经抓过，这里只把目标态钉住
            tabsOpen = true
        } else {
            closeTabs()
        }
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
        // 原生播放器贴着页面里那个 <video>：换页 / 换标签之后这一页重新可见，
        // 位置得立刻重报一次校正 —— 但**先把上一份矩形摆回去**：切回来的第一帧
        // 就要在正确的位置上，不能等页面回话（那几十毫秒里播放器没位置可摆，
        // 页面里那个播放器就露出来了，用户点名）。
        // 切走时**不清**矩形（也不清缓存）：它属于承载播放器的那一页，切回来还要用；
        // 它不画只是因为 playerOnScreen 要求"宿主标签页在台前"（声音继续，跟浏览器
        // 把播放页切到后台一样）。
        if (playerFrameTab >= 0L) {
            if (activeId == playerFrameTab) {
                if (playerFrame == null) playerFrame = lastFrames[activeId]
                if (playerFrame == null) armRectFallback()
                runCatching { currentView.evaluateJavascript(FORCE_PAGE_RECT_JS, null) }
            }
            publishPlayerFrame()
        }
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
                        // 下拉刷新只认真正的网页：自家首页永远"滚到顶"，再按旧判据
                        // 放行，用户在首页（含搜索页的列表）随手往下一拖就会弹出
                        // 刷新动画 —— 而首页压根没有"重新加载"这回事（用户点名）
                        dy > slop && abs(dy) > abs(dx) * 1.5f && !loading &&
                            !isHomeTab(active) && (active.webView?.scrollY ?: 0) <= 0 -> 3
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
        // 与普通窗口互不影响，退出时把 profile 一删就干净了。必须在加载内容之前设置。
        // 判据用**该标签页的归属**而不是当前窗口（见 isIncognitoTab）
        val incognito = isIncognitoTab(tab)
        if (incognito && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
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
            cacheMode = if (incognito) WebSettings.LOAD_NO_CACHE else WebSettings.LOAD_DEFAULT
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
        installPageToolsDocStart(tab, view)
        view.addJavascriptInterface(HomeBridge(tab), "LerxuHome")
        view.addJavascriptInterface(JsBridge(tab), "LerxuSniffer")
        // 贴底整宽弹窗的状态（坞据此决定"抬到它上面"还是"自己让开"）
        view.addJavascriptInterface(DockBridge(tab), "LerxuDock")
        // 网页视频起播的通知：据此把这一路交给 App 自己的播放器
        view.addJavascriptInterface(PageVideoBridge(tab), "LerxuPageVideo")
        // 那个 <video> 的位置：原生播放器据此贴在网页里原来的位置上
        view.addJavascriptInterface(VideoRectBridge(tab), "LerxuVideoRect")
        // 影视模式的探测回传：这一页有没有像样的视频元素（见 MovieMode）
        view.addJavascriptInterface(MovieBridge(tab), "LerxuMovie")
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
        // 建的时候可能地址栏正聚焦着（比如"聚焦 → 顺手开新标签"）：新网页要跟着
        // 当前的焦点策略走，否则它会抢焦点把键盘顶掉
        setWebTouchFocusable(view, !dockInputFocused)
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

    /**
     * 页面工具（广告隐藏样式 + 自家视频控件）的**文档起始脚本**：`setOf("*")` ——
     * **每一个 frame 都注入**，包括跨域 iframe。
     *
     * 为什么必须这样：影视站（苹果 CMS 那类）的播放器几乎都住在一个 iframe 里
     *（自家 `/static/player/xxx.html`，或是第三方解析页），广告位也常整块塞在
     * iframe 里。主框架的 `evaluateJavascript` 进不去别的文档 —— 只注主框架的话，
     * 表现就是"广告照旧、播放器还是原样控件"（用户点名）。
     *
     * 与主题一样是**先撤再挂**：广告开关一改，之后加载的文档就拿到新的那份；
     * 已经在页面里的那些帧由 [injectAdBlock] 走主框架那条路当场补 / 撤，
     * 子帧要等下次加载（不为了一个开关把用户正在看的播放器刷新掉）。
     */
    private fun installPageToolsDocStart(tab: Tab, view: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        runCatching {
            tab.toolsDocStart?.remove()
            tab.toolsDocStart = WebViewCompat.addDocumentStartJavaScript(
                view,
                AdBlocker.injectJs(adBlockEnabled) + PageVideoDetector.INJECT_JS +
                NavAutoHide.INJECT_JS + MovieMode.INJECT_JS,
                setOf("*")
            )
        }
    }

    /** 回收一个标签页的 WebView（关闭标签 / 渲染进程死亡）。 */
    private fun releaseTab(tab: Tab) {
        clearPullRefresh(tab)
        forgetFrame(tab.id)
        runCatching {
            val view = tab.webView ?: return@runCatching
            (view.parent as? ViewGroup)?.removeView(view)
            tab.themeDocStart?.remove()
            tab.themeDocStart = null
            tab.toolsDocStart?.remove()
            tab.toolsDocStart = null
            view.removeJavascriptInterface("LerxuSniffer")
            view.removeJavascriptInterface("LerxuHome")
            view.removeJavascriptInterface("LerxuDock")
            view.removeJavascriptInterface("LerxuMovie")
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
        tab.pageBgArgb = -1
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
            // 自动拦截广告：**只拦子资源**（主框架永不拦 —— 拦错一下就是白屏）。
            // 这里是两层里的"网络层"：广告域的请求连响应体都不给，脚本拿不到东西
            // 自然也画不出来（见 AdBlocker）。同一 URL 的主框架请求照常放行
            if (adBlockEnabled && !request.isForMainFrame && AdBlocker.isAdUrl(url)) {
                return blockedResponse(url)
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

        /**
         * 广告请求的回应。
         *
         * **图片**回一枚 1×1 透明 GIF：回 204 / 空体的话，内联在正文里的广告图
         * 会显示成"碎图"图标（拦广告反而拦出一堆破图）。其余回 **204 + 空体 +
         * 禁缓存** —— 不能返回 `null`（那就是放行），也不能回 404（部分脚本会据此
         * 重试）；204 是"成功但没有内容"，最安静。禁缓存是必须的：这条 URL 一旦
         * 进了 WebView 缓存，关掉拦截后它还会被命中。
         */
        private fun blockedResponse(url: String): WebResourceResponse {
            val noStore = mapOf("Cache-Control" to "no-store", "Pragma" to "no-cache")
            return if (AdBlocker.looksLikeImage(url)) {
                WebResourceResponse("image/gif", null, ByteArrayInputStream(AdBlocker.BLANK_GIF))
            } else {
                WebResourceResponse(
                    "text/plain",
                    "utf-8",
                    204,
                    "No Content",
                    noStore,
                    ByteArrayInputStream(ByteArray(0))
                )
            }
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            val tab = tabOf(view) ?: return
            // 原生播放器是"这一页那个播放器"的替身：这一页换掉了，它的位置与去留都要重算
            if (tab.id == playerFrameTab) onHostPageNavigated(tab)
            tab.loading = true
            tab.progress = 0
            tab.loadError = null
            // 上一页那层"贴底整宽弹窗"随导航作废：不清的话新页面一进来就被顶起来
            tab.bottomOverlayPx = 0
            tab.bottomOverlayAll = false
            // 换页了坞也回展开态：跟手收起可能停在半路（滑到一半点了链接），
            // 而新页面是从顶部开始的 —— 留着半收的坞读起来就是"卡住了"。
            // 只认**当前标签页**的导航：后台标签加载完不该把坞弹开
            if (tab.id == activeId) expandDock()
            // 「本页资源」只该显示**当前这一页**的：上一页嗅到的留在列表里，读起来
            // 像一份历史记录（用户点名）。换页即清空，顺带把大小探测的去重表也清掉
            //（新页面重新嗅到同一个地址时，还要再问一次长度）。
            if (tab.sniffed.isNotEmpty()) tab.sniffed.clear()
            probedSizes.clear()
            // 影视模式跟着**这一页**走，但"从我们自己的影视页里点出去"要留在模式里
            //（见 [openInMovieMode]）：同 host、且不是回自家首页时才钉住 —— 分类页 /
            // 列表页本来就没有 `<video>`，再走一遍判据必然落空。
            // 跨站 / 回首页 / 手动敲地址照旧退出，新页面按同一套判据重新决定。
            // `movieModeOffHosts`（用户手动关过的站）也一并清掉：那份记忆只用来挡住
            // "关掉之后同一页上立刻又被自动打开"，**不该跨导航生效** —— 否则这一站就
            // 再也进不去了，只能重启 App。换了页 / 重新加载就是新的一次判定。
            val newHost = TabNaming.host(url.orEmpty())
            val keepPinned = movieMode && moviePinHost != null && newHost.isNotEmpty() &&
                newHost == moviePinHost && !url.orEmpty().startsWith(HOME_URL)
            if (keepPinned) {
                // 这一页的内容要重新提取（提取结果与标签页的地址对得上才算数）
                clearMoviePageData()
                movieExtracting = true
            } else {
                movieMode = false
                moviePinHost = null
                clearMoviePageData()
            }
            movieVideoSeen = false
            movieModeOffHosts.clear()
            // 任何一次开始加载都意味着旧页面上的输入状态作废。
            // 面板只在自家首页有意义，导航一开就收起（联想词请求也一起放掉）
            closeHomePanels()
            // 导航已经真正开始：提交窗口结束（地址与 isSearchPage 此刻更新）
            navSubmitting = false
            if (!url.isNullOrEmpty()) {
                tab.url = url
                tab.referer = url
                // 自家首页按地址前缀判定（主题走注入，URL 上不再带参数）
                tab.isHomePage = url.startsWith(HOME_URL)
                // 首页没有注入脚本、报不上底色：不带这一笔，它就会一直沿用
                // **上一页**的颜色（从深色站回首页，顶上留着一条深色带子）。
                // 清成"没有" = 顶部那一截退回应用底色，正好是首页自己的底色
                if (tab.isHomePage) tab.pageBgArgb = -1
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
            if (tab.isHomePage) {
                refreshHomeConfig(tab)
                // 首页刚加载完（可能是"地址栏已聚焦时打开首页"这一路径）：
                // 面板内容补推一次，否则要等用户再敲一个字才出来
                pushHomePanels()
                // 顺手把联想词端点的连接热起来（见 warmUpSuggest）：从"首页就绪"
                // 到"用户敲下第一个字"之间还有一段空档，正好用来走 DNS / TCP / TLS
                if (tab.id == activeId) warmUpSuggest()
            } else {
                injectSniffer(view)
                applyWebTheme(tab)
                // 页面加载完成 = 判据里的"视频元素"与"视频流"两个信号这时多半都到齐了，
                // 评估一次影视模式（该开就开）
                val hadMovieMode = movieMode
                evaluateMovieMode(tab)
                // 模式本来就开着（同站钉住时的正常换页）：这一页的内容也要重新取一份 ——
                // 上面那次评估管的是"要不要开"，这里管"开了之后读什么"
                if (hadMovieMode && tab.id == activeId) scheduleMovieExtract(tab)
            }
            // 首页是这一页的**根**：把它变成历史里的第一项 —— 清掉 WebView 自己的
            // 前后退列表，自建栈也只留首页。否则退回首页后返回键还是亮的，
            // 又能"向前跳"回刚才那页（用户点名："回退到首页后按钮还是可点击状态"）。
            //
            // 例外是 `homeKeepHistory`（从网页点地址栏"过路"进搜索页）：这一次首页不算根，
            // 历史留着 —— 清掉的话用户正看的那页就没了，返回键一按直接退出浏览器。
            //
            // 标志位只在**首页**这一支兑现。早先写在两支之外，于是"网页还在加载时点
            // 地址栏"这条路径会踩到竞态：首页的响应还没发出，上一页的 onPageFinished
            // 先到，把标志抹成 false —— 首页照样按"根"处理，logo 又从中部飞上来（用户点名）。
            if (tab.isHomePage) {
                // 过路那一趟的地址上带着 `?s=1`（见 [loadHome]）：落库、历史栈都该用
                // 干净的常量 —— 留着参数的话，下次从历史栈回退到首页，页面会照着
                // `?s=` 把自己当成"搜索页"渲染（logo 贴顶却没有面板，随即又滑回中部）
                tab.url = HOME_URL
                for (i in tab.visited.indices) {
                    if (tab.visited[i].startsWith(HOME_URL)) tab.visited[i] = HOME_URL
                }
                if (!tab.homeKeepHistory) {
                    runCatching { view.clearHistory() }
                    tab.visited.clear()
                    tab.visited += HOME_URL
                }
                tab.homeKeepHistory = false
            } else if (tab.pendingHistoryClear) {
                // 用自建栈回退后落的这一页：清掉 WebView 自己的历史，
                // 下一次后退才会继续走自建栈（否则 WebView 会把刚才那页当成"前进"）
                tab.pendingHistoryClear = false
                runCatching { view.clearHistory() }
            }
            // 记一条浏览历史（自家页面与无痕窗口都不记，见 rememberVisit）
            rememberVisit(tab)
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
                // 影视模式里换"页"（SPA 换个视频 / 换个分类，页面不重新加载）：内容重取一份。
                // onPageFinished 不会再来，这是这类换页唯一的取数时机
                if (movieMode && tab.id == activeId) {
                    clearMoviePageData()
                    scheduleMovieExtract(tab)
                }
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

    /** 全屏容器（挂在 decorView 上盖住整屏）与进全屏前的屏幕方向，退出时还原。 */
    private var fullscreenHost: FrameLayout? = null

    /**
     * 框架递过来的全屏回调。**必须留着**：我们自己撤全屏时（比如要让位给 App 的
     * 原生播放器）得用它告诉 WebView"那层已经收起来了"，否则页面里的
     * `document.fullscreenElement` 一直挂着，站点播放器不会把全屏时的内联样式还原。
     */
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    private var fullscreenPrevOrientation: Int =
        android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED

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

        /**
         * 网页视频全屏：**必须实现这两个回调**，否则页面的全屏请求就是"什么都不发生"
         *（用户点名"视频无法全屏"）。`<video>` 的原生全屏键、站点播放器自己的全屏键、
         * 以及我们注入控件的那枚放大键（`requestFullscreen`），在 WebView 里最终都
         * 走到这里。
         *
         * 做法是最朴素也最稳的一种：把框架递过来的这个 View 挂进一层黑底容器，
         * 容器加到 **Activity 的 decorView** 上（盖住整个界面，包括我们的坞与顶带子），
         * 同时切横屏 + 藏系统栏；退出时逐样还原。**不改页面里任何东西** ——
         * 全屏的仍是页面自己的播放器（我们注入的控件带也在它的子树里，一起进来）。
         */
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            // 已经有一层在屏上（连点两下全屏键），或者 App 的原生播放器正开着：
            // 这一次请求直接顶回去即可
            if (fullscreenHost != null || nativePlayerActive) {
                callback.onCustomViewHidden()
                return
            }
            val activity = context as? Activity ?: return
            val decor = activity.window?.decorView as? ViewGroup ?: return
            val host = FrameLayout(context).apply {
                setBackgroundColor(android.graphics.Color.BLACK)
                // 抢到焦点才收得到返回键：全屏时用返回键**退出全屏**，
                // 而不是让下面的网页去"后退一页"（那会让全屏页整个换掉）
                isFocusable = true
                isFocusableInTouchMode = true
                setOnKeyListener { _, keyCode, event ->
                    if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                        hideFullscreen()
                        true
                    } else {
                        false
                    }
                }
                addView(view, FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ))
            }
            decor.addView(host, FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ))
            fullscreenHost = host
            fullscreenCallback = callback
            fullscreenPrevOrientation = activity.requestedOrientation
            // 横屏：竖屏看横视频是"两边两条黑边"，放大键的意义就没了
            runCatching {
                activity.requestedOrientation =
                    android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            }
            runCatching {
                WindowCompat.getInsetsController(activity.window, decor).apply {
                    hide(WindowInsetsCompat.Type.systemBars())
                    systemBarsBehavior =
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            }
            host.requestFocus()
        }

        override fun onHideCustomView() {
            hideFullscreen()
        }
    }

    /** 退出全屏：撤容器、还方向、把系统栏亮回来（与 [onShowCustomView] 一一对应）。 */
    private fun hideFullscreen() {
        val host = fullscreenHost ?: return
        fullscreenHost = null
        runCatching { (host.parent as? ViewGroup)?.removeView(host) }
        // 告诉 WebView 那层已经收起来：页面那边的 `fullscreenchange` 才会触发，
        // 站点播放器才会还原成内联的样式（不调的话它会一直以为自己在全屏）
        val callback = fullscreenCallback
        fullscreenCallback = null
        runCatching { callback?.onCustomViewHidden() }
        val activity = context as? Activity ?: return
        val decor = activity.window?.decorView
        // 方向：**还回进全屏前那个值**，不要一律回 UNSPECIFIED —— 那会把
        // "用户本来锁了竖屏"这件事也一起抹掉
        runCatching { activity.requestedOrientation = fullscreenPrevOrientation }
        runCatching {
            if (decor != null) {
                WindowCompat.getInsetsController(activity.window, decor)
                    .show(WindowInsetsCompat.Type.systemBars())
            }
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

    /**
     * 首页桥：搜索页里点了什么（属于某一个标签页）。
     *
     * 三条出路：
     * - 联想词是「要搜的词」（交给当前引擎拼 URL）；历史记录是「要去的地址」
     *   （原样打开）。分开而不是共用一条：联想词可能恰好是个域名（`looksLikeUrl`
     *   会把它当地址），而历史地址不该再被当成搜索词推理一遍。
     * - 标签页里**按住列表向下拖**只是要收起底部输入框（[collapseInput]），
     *   既不跳转也不退出搜索页。
     * - 左上角返回键退出搜索页（[exitSearch]），回下载器是另一回事。
     */
    inner class HomeBridge internal constructor(private val tab: Tab) {
        @JavascriptInterface
        fun search(text: String) {
            main.post {
                BrowserUrl.toUrl(text, engine)?.let {
                    navSubmitting = true
                    addressBlurTick++
                    viewOf(tab).loadUrl(it)
                }
            }
        }

        @JavascriptInterface
        fun open(url: String) {
            main.post {
                val target = url.trim()
                if (target.isEmpty()) return@post
                navSubmitting = true
                addressBlurTick++
                viewOf(tab).loadUrl(target)
            }
        }

        /**
         * 收起底部输入框（键盘与焦点），但**不动搜索页** ——
         * 界面收到 [addressBlurTick] 变化就清焦点；面板由 [homePanelsOpen] 单独管，
         * 所以这里不会顺手把它关掉（用户要的就是"收起输入框、留在搜索页"）。
         */
        @JavascriptInterface
        fun collapseInput() {
            main.post { addressBlurTick++ }
        }

        /**
         * 左上角返回键：退出搜索页。
         *
         * 退到哪儿取决于这一趟搜索页是**怎么来的**（用户点名要区分）：
         * - 从网页点地址栏"过路"来的（首页不算根、历史还留着）：**退回刚才那一页**；
         * - 以首页为根的那一趟（加载完就把历史清空了）：回"只有品牌的首页"。
         *
         * 判据就是可退性本身 —— 根那一趟 `clearHistory()` 已经执行过，退不动。
         * 把用户从网页带进来、返回时却丢在只有品牌的首页上，读起来就是"我那页没了"。
         */
        @JavascriptInterface
        fun exitSearch() {
            main.post {
                val view = tab.webView
                val fromWebPage = tab.isHomePage && view != null &&
                    (view.canGoBack() || tab.visited.size >= 2)
                addressBlurTick++
                closeHomePanels()
                if (fromWebPage) goBack()
            }
        }

        /** 「最近访问」标题右侧的"全部清除"：清空浏览记录（普通窗口才记，这里照清不误）。 */
        @JavascriptInterface
        fun clearRecent() {
            main.post { clearBrowseHistory() }
        }

        /** 「搜索历史」标题右侧的"全部清除"：只抹掉搜索项，用户逛过的网页保留。 */
        @JavascriptInterface
        fun clearSearches() {
            main.post { clearSearchHistory() }
        }

        /**
         * 搜索历史分组末尾那枚"查看更多"：换到**历史查看页**（只列搜索历史、
         * 条数放全部）。面板不动，页面侧自己把那一屏形变过去（见 [openHomeHistory]）。
         */
        @JavascriptInterface
        fun moreSearches() {
            main.post { openHomeHistory() }
        }

        /** 历史查看页里的返回：退**这一层**，回普通搜索界面（再按一次才退出搜索页）。 */
        @JavascriptInterface
        fun exitHistory() {
            main.post { closeHomeHistory() }
        }
    }

    /**
     * 网页里开始播放视频时，App 要接管的那一条（界面据此打开原生播放器）。
     *
     * 界面消费完必须调 [clearNativePlayRequest] —— 它是个"一次性请求"，
     * 留着会让下一次起播被误判成"已经在接管"。
     */
    var nativePlayRequest by mutableStateOf<SniffedResource?>(null)
        private set

    fun clearNativePlayRequest() {
        nativePlayRequest = null
    }

    /**
     * App 的**原生播放器**此刻是否开着（由 AppScreen 维护）。用途见 [setNativePlayerActive]：
     * 只用来把网页那边的全屏请求顶回去（`onShowCustomView`）。
     */
    private var nativePlayerActive = false

    /**
     * 原生播放器此刻**贴在页面哪里**：页面里那个 `<video>` 的矩形，屏幕坐标、单位 dp
     * （**带小数** —— 页面报的是小数 CSS px，取整会在滚动时留下 1px 台阶，乘上屏幕
     * 密度就是几个设备像素的"抖动"）。
     *
     * 由 [VideoRectBridge] 从页面持续报上来（见 PageVideoDetector 的位置回传），跟着
     * 网页一起滚动、一起变尺寸 —— 用户点名"它就应该跟网页自带的播放器一样"。
     * null = 那个元素没了 / 还没量到：这时**什么都不画**（播放器本来就是那一页里
     * 那个播放器的替身，位置都没了就说明这一页已经没有它该待的地方）。
     */
    var playerFrame by mutableStateOf<RectF?>(null)
        private set

    /**
     * 页面报上来的位置**已经是"吸附之后"的那一条**（见 PageVideoDetector 的 `playerTop`）：
     * 视频上沿越过站点顶栏露出来的那一条就钉在它下面，顶栏收起来就贴视口顶。
     *
     * 为什么规则在页面里算、而不是原生侧拼：早先原生侧拿"网页内容顶 + 顶栏高度"两处数字
     * 相加，两个数各有各的量化与来源（顶栏高度、状态栏内边距、进度条那一截），对不齐时
     * 顶上就裂出一道缝、网页内容从缝里透出来（用户点名）。现在位置只有**一个来源**。
     */

    /** 这个矩形属于哪个标签页（-1 = 播放器没开）。 */
    private var playerFrameTab = -1L

    /**
     * 每个标签页**最后一次**报上来的矩形（dp、屏幕坐标、**带小数**）与它的时间戳。
     *
     * 为什么要按标签页存一份、而不是只留"当前这一个"：播放器是**窗口级**覆盖层，
     * 它不属于某一棵 Compose 树，切标签时 Compose 那边不会给它任何过渡 —— 手里
     * 没有矩形的那几十毫秒里它只能"不画"，页面里那个播放器就露出来了。存一份
     * 再切回来时**第一帧**就摆到位（顺带让页面重报一次校正）。
     */
    private val lastFrames = HashMap<Long, RectF>()
    private val lastFrameAt = HashMap<Long, Long>()

    /**
     * 取[PLAYER_RECT_FRESH_MS]之内报上来的那个矩形（"起播那一拍刚报的"）。
     *
     * 用户点名的"一开始没有定位，过一会才定位"就是这里没有它：老实现接管时先把
     * 矩形清掉、再去让页面重报，中间要等一次"注入脚本 → 页面回话"的往返。
     */
    private fun freshFrame(tabId: Long): RectF? {
        val rect = lastFrames[tabId] ?: return null
        val at = lastFrameAt[tabId] ?: return null
        if (SystemClock.uptimeMillis() - at > PLAYER_RECT_FRESH_MS) return null
        return rect
    }

    /** 某个标签页的位置作废（页面导航走了 / 标签关掉了）。 */
    private fun forgetFrame(tabId: Long) {
        lastFrames.remove(tabId)
        lastFrameAt.remove(tabId)
    }

    /**
     * 页面**报不上位置**（跨域 iframe 里的播放器量不到）时的兜底开关：等一小会儿还是
     * 没有矩形，就退回"顶部一块 16:9"的老形态 —— 什么都不画会让用户以为没播起来。
     */
    var playerRectFallback by mutableStateOf(false)
        private set

    /** 兜底开关的复查令牌（每次重新计时换一个，旧的作废）。 */
    private var rectFallbackToken = 0

    /** 播放器此刻该不该画：宿主标签页在台前，而且有位置可画（量到的，或者超时兜底）。 */
    val playerOnScreen: Boolean
        get() = playerFrameTab == activeId && (playerFrame != null || playerRectFallback)

    /**
     * 位置变化时的**直连出口**（覆盖层在装上时挂进来）。
     *
     * 为什么不能只靠 [playerFrame] 这个 Compose 状态：状态写下去还要等一次重组 + 一次
     * `LaunchedEffect` 才轮到摆位置，滚动时就是"慢半拍"（用户报的"滚动时轻微偏移"）。
     * 这里页面每次报位置都当场回调一次，路径上只剩一次主线程跳转。
     */
    var frameSink: ((frame: RectF?, visible: Boolean) -> Unit)? = null

    /**
     * 标签网格展开进度（0..1）：由 `BrowserScreen` 每帧写进来（原生播放器是窗口级
     * 覆盖层，读不到 Compose 状态）。播放器据此**跟当前网页一起缩进卡片**，
     * 帧循环也靠它判断"这一段还要不要每帧唤醒"。
     */
    var pageGridProgress: Float = 0f

    /**
     * 网格形变那一帧，播放器**该落在哪儿**（窗口坐标 px）与页面**可见窗口**（用来裁剪）。
     *
     * 由 `BrowserScreen` 每帧算好写进来 —— 用的就是网页形变那一套映射（覆盖式缩放 +
     * 窗口裁剪，见那边 `graphicsLayer` 里的注释），所以网页缩到哪儿、缩成多大，
     * 播放器都跟它严丝合缝，**不会比网页里那块大一圈**，也不会把视频画到卡片外面。
     * null = 没在形变（正常按 [playerFrame] 摆）。
     */
    var pageGridMorph: Rect? = null
    var pageGridClip: Rect? = null

    /**
     * 整页此刻的不透明度（1 = 全亮）—— 网格展开到最后、卡片淡入时，网页自己会淡出，
     * 播放器必须**跟着同一个值**淡，否则网页还在、播放器先没了，页面里那个播放器
     * 就露出来了（用户点名："标签在收集时，原生播放器会消失，导致露出网页自带播放器"）。
     */
    var pageGridAlpha: Float = 1f

    /*
     * ── 关于"逐帧跟手"：这里**故意没有任何原生补偿** ──
     *
     * 曾经有一版是这样的：页面只在 `scroll` 事件上报位置，原生这边每帧读 WebView 的
     * `scrollY`，把差值补给播放器，好让它"更跟手"。结果用户报的是**上下滑它会抖**：
     * 页面报的是它渲染那一刻的位置，而原生读到的是另一路（成批同步的）滚动量 ——
     * 两边都在动播放器，谁多算一点就是来回摆一帧，"越跟越抖"。
     *
     * 现在的口径是**只有一个真相**：位置全部由页面报（`PageVideoDetector` 里滚动期间
     * 一路 rAF **按帧**报，见那边的 `schedule()`），原生侧收到就摆、收不到就保持
     * —— 不猜、不补、不推算。所以这里没有 Choreographer 帧循环。
     */

    /**
     * 位置变化：状态 + 直连出口一起走（覆盖层没挂上时只更新状态）。
     *
     * 两处会调它：页面报位置的那条路（[VideoRectBridge]）、以及网格形变期间
     * `BrowserScreen` 每帧写好落点之后 —— 后者是**同一帧**把新落点交给覆盖层
     * （写值的 SideEffect 跑在绘制遍历里，覆盖层随后就按新位置摆），
     * 不然形变会比网页慢一帧。
     */
    fun publishPlayerFrame() {
        frameSink?.invoke(playerFrame, playerOnScreen)
    }

    /**
     * "位置丢了"的复查令牌。
     *
     * 页面在转屏 / 切清晰度时会把播放器重建一下，中间那一瞬量不到元素 —— 早先立刻
     * 清掉位置，播放器就"全屏转回来不见了"。现在给它一点时间：这段时间内报回新位置
     * 就作废这次复查。
     */
    private var rectGoneToken = 0

    private fun onRectGone(tabId: Long) {
        val token = ++rectGoneToken
        main.postDelayed({
            if (token != rectGoneToken) return@postDelayed
            playerFrame = null
            forgetFrame(tabId)
            publishPlayerFrame()
        }, PLAYER_RECT_GONE_GRACE_MS)
    }

    /**
     * 承载播放器的那一页**已经走了**（导航走了 / 标签页被关）：界面据此关掉播放器。
     *
     * 一次性请求（用完由界面调 [clearNativePlayStop]）：不留着，否则下一次打开播放器
     * 会被上一次的残留立刻关掉。
     */
    var nativePlayStop by mutableStateOf(false)
        private set

    fun clearNativePlayStop() {
        nativePlayStop = false
    }

    // ─── 影视模式（见 [MovieMode]） ───

    /**
     * 影视模式开着：网页被自家的影视页整屏盖住（见 `MovieScreen`）。
     *
     * 它是**全局一个**（不是每标签页一个）：影视模式是"当前这一屏在看什么"的状态，
     * 而屏幕上永远只有一张标签页在台前；换页 / 换标签会把它复位（见 onPageStarted），
     * 新页面按同一套判据重新决定要不要开。
     */
    var movieMode by mutableStateOf(false)
        private set

    /**
     * 页面脚本报上来的"这一页有没有像样的视频元素"（见 [MovieMode.INJECT_JS]）。
     *
     * 它是判据里 `hasPlayerVideo` 的**唯一来源**：页面侧从脚本安装那一刻起就低频复检，
     * 所以它一直是当下的真值，不是"进过影视模式"的残留。
     */
    private var movieVideoSeen = false

    /** 页面脚本报上来的 `document.title`（影视页标题，见 [moviePageTitle]）。 */
    private var movieTitle = ""

    /**
     * **用户手动关过**影视模式的 host（内存记忆，不落盘）。
     *
     * 为什么必须有它：影视模式是自动开启的，用户点"关闭影视模式"之后页面条件依然
     * 成立（脚本心跳每 2s 还会再报一次），下一次评估会立刻又把它打开 —— 读起来就是
     * "按钮坏了 / 点了没反应"。
     *
     * 但它**只挡到下一次导航为止**（见 `onPageStarted` 里的 `clear()`）：它是用来
     * 压住"同一页上关掉又立刻弹回来"的，不是"这一站永久拉黑"。跨导航一直生效的话，
     * 用户关掉之后就再也进不去了（第一版没有手动入口），只能重启 App。
     */
    private val movieModeOffHosts = mutableSetOf<String>()

    /**
     * 已知是影视站的 host：**进过一次影视模式就记住**（见 [evaluateMovieMode]）。
     *
     * 有了它，同一站的首页 / 详情页 / 搜索页也直接用我们的 UI —— 那几种页面本来就没有
     * `<video>` 也没有流，只按原判据永远进不来（用户口径："详情页也应该用我们的 UI，包括首页"）。
     */
    private val movieSiteHosts = mutableSetOf<String>()

    /** 影视页标题：页面脚本报的那一份优先，空则退回 WebView 标题。 */
    val moviePageTitle: String get() = movieTitle.ifBlank { pageTitle }

    /**
     * 影视页的"外壳"：**从网页 DOM 只读提取**（见 [MoviePageExtractor]），由我们重建。
     *
     * 三份数据（站点分类导航 / 内容卡片 / 推荐区块）都是"台前这一屏"的状态，与
     * [movieMode] 同寿命：换页、退出模式、换标签页都会清掉（见 [clearMoviePageData]）。
     */
    var movieNav by mutableStateOf<List<MoviePageExtractor.MovieNavItem>>(emptyList())
        private set

    /** 主内容卡片：封面 + 名称 + 清晰度（名称压在封面左下角，见 `MovieScreen`）。 */
    var movieCards by mutableStateOf<List<MoviePageExtractor.MovieCard>>(emptyList())
        private set

    /** 站点的推荐区块（猜你喜欢 / 相关推荐）。 */
    var movieSections by mutableStateOf<List<MoviePageExtractor.MovieSection>>(emptyList())
        private set

    /**
     * 站点的评论区（昵称 / 正文 / 时间 / 头像）。
     *
     * 用户口径：**网页有评论区就显示评论区**，只是把它的样式换成我们自己的（早期那版
     * "由推荐区取代"已作废）。这里只读"谁说了什么"，样式全在 `MovieScreen` 里。
     */
    var movieComments by mutableStateOf<List<MoviePageExtractor.MovieComment>>(emptyList())
        private set

    /** 主内容墙**自己的名字**（站点给的那一行，如「相关推荐」）；空则见 [movieBlockTitle]。 */
    private var movieMainTitle = ""

    /** 评论区自己的标题（如「评论」）；空则界面退回默认文案。 */
    var movieCommentTitle by mutableStateOf("")
        private set

    /** 站点搜索表单的提交地址与关键词参数名（都空 = 这一页没找到，界面不显示搜索框）。 */
    private var movieSearchAction = ""
    private var movieSearchParam = ""

    /** 站点搜索框的占位文字（有就用它当提示语，比我们自己的文案更贴站点）。 */
    var movieSearchHint by mutableStateOf("")
        private set

    /** 站内搜索能不能用（界面据此决定显不显示顶栏那个搜索框）。 */
    val movieSearchReady: Boolean
        get() = movieSearchAction.isNotEmpty() && movieSearchParam.isNotEmpty()

    /**
     * 站内搜索：**用站点自己的**搜索表单拼地址（表单的 action + 参数名 + 关键词，见
     * [MoviePageExtractor] 里的 `searchOf`）。
     *
     * 走 [openInMovieMode] 那条路（同 host 钉住），所以搜完还是我们这一屏，而不是掉回网页。
     */
    fun searchInMovieMode(query: String) {
        val q = query.trim()
        if (q.isEmpty() || !movieSearchReady) return
        val sep = if (movieSearchAction.contains('?')) '&' else '?'
        openInMovieMode(movieSearchAction + sep + movieSearchParam + "=" + Uri.encode(q))
    }

    /**
     * 主内容墙左上角那一行板块名（用户口径：每个内容板块左上角都要显示板块名）。
     *
     * 站点自己给了名字就用它；没给就退回**当前页面对应的那个分类名**（分类页就是
     * 「电影」「连续剧」这一档）—— 站点不给板块名的页面基本都是分类页 / 列表页，
     * 而那种页面该显示的正是这个分类名。
     */
    val movieBlockTitle: String
        get() {
            if (movieMainTitle.isNotEmpty()) return movieMainTitle
            val cur = urlPath(active.url)
            // 站点没给名字就退回**当前分类名**；连分类都对不上就**空着**（界面不画这一行）
            // —— 拿页面标题顶上去读起来就是"标题被渲染成了别的文字"（用户点名过）
            return movieNav.firstOrNull { urlPath(it.url) == cur }?.text.orEmpty()
        }

    /**
     * 影视页里那块 16:9 占位的**真实矩形**（窗口坐标，单位 dp）：由 `MovieScreen` 量出来喂进来。
     *
     * 为什么不让播放器那边自己算：算式原本有两个输入（内容区顶、我们顶栏的高度）分散在
     * 两处，只要有一处没跟上（顶栏高度变了、上面多了一层内边距），播放器就会**压住顶栏**、
     * 或者在它和占位之间裂出一条空白（用户点名过这两个）。量真东西不会错。
     */
    var movieStageRect by mutableStateOf<RectF?>(null)
        internal set

    /** 正在取数：界面显示加载态（已经有内容了就只在后台更新）。 */
    var movieExtracting by mutableStateOf(false)
        private set

    /** 取完了但一无所获：界面显示空态（连着 [MOVIE_PIN_FAIL_LIMIT] 页空还会自动退出，见 [finishMovieExtract]）。 */
    var movieExtractFailed by mutableStateOf(false)
        private set

    /** 封面图过防盗链要带的来源页（见 [CoverImageLoader]）：就是这一页的地址。 */
    val movieReferer: String get() = active.url

    /** 封面图过防盗链要带的 UA：与网页同一条（同 [buildHeaders] 的口径）。 */
    val movieUserAgent: String
        get() = runCatching { active.webView?.settings?.userAgentString }.getOrNull().orEmpty()

    /** 取数的竞态令箭：每次重新调度 +1，在飞的旧回调据此作废。 */
    private var movieExtractToken = 0

    /** 钉住时记住的 host（见 [openInMovieMode]）；null = 没钉住（模式是判据自己开的）。 */
    private var moviePinHost: String? = null

    /** 钉住之后连着几页取不到内容（见 [MOVIE_PIN_FAIL_LIMIT]）。 */
    private var moviePinFailCount = 0

    /**
     * 评估"这一页该不该自动进影视模式"，该进就进。
     *
     * 两个时机调它：页面加载完成（onPageFinished）与嗅探结果更新（offer 末尾）——
     * 判据里的两个信号（视频元素、视频流）谁后到都不确定，只挂一处就会漏开。
     * 第三个时机是桥回传（[MovieBridge.video]）：页面侧探到视频元素时立刻评一次。
     */
    private fun evaluateMovieMode(tab: Tab) {
        // 只对台前这一页评估：后台标签加载完 / 嗅到流不该把台前这一屏换掉
        if (tab.id != activeId) return
        if (movieMode) return
        val host = TabNaming.host(tab.url)
        if (host.isNotEmpty() && host in movieModeOffHosts) return
        // 已知影视站（这一站进过一次影视模式）就不必再要求"有视频 + 有流"：
        // 首页 / 详情页 / 搜索页本来就没有视频（用户口径："详情页也应该用我们的 UI，包括首页"）
        val knownSite = host.isNotEmpty() && host in movieSiteHosts
        if (!knownSite && !looksLikeMoviePage(movieVideoSeen, tab.sniffed, tab.isHomePage)) return
        if (host.isNotEmpty()) movieSiteHosts += host
        movieMode = true
        val view = tab.webView ?: return
        runCatching { view.evaluateJavascript(MOVIE_START_JS, null) }
        scheduleMovieExtract(tab)
    }

    /**
     * 取页面内容的调度：先注入一次提取脚本（幂等，见 [MoviePageExtractor]），再按六拍取数。
     *
     * 六拍一直取到 **6.5 秒**（[MOVIE_EXTRACT_DELAYS_MS]）：影视站的内容大多是脚本渲染的，
     * 切换内容（换集 / 点进详情页）时那一段 DOM 往往**晚于 2.5 秒**才出来 —— 以前只取到
     * 2.5 秒，于是新页面动不动就判成"这一页没有可显示的内容"（用户点名："切换到其他内容时
     * 总是遇到"）。宁可多等几秒，也不要给出一个错的空态。
     *
     * 每一拍都带着令牌与"台前这一页"的判据回主线程（见 [extractOnce]），迟到的旧回调
     * 自然作废；最后一拍之后再等一小会儿收尾（见 [finishMovieExtract]）。
     */
    private fun scheduleMovieExtract(tab: Tab) {
        val token = ++movieExtractToken
        movieExtracting = true
        movieExtractFailed = false
        runCatching { tab.webView?.evaluateJavascript(MoviePageExtractor.INJECT_JS, null) }
        for (delay in MOVIE_EXTRACT_DELAYS_MS) {
            main.postDelayed({
                if (token != movieExtractToken || !movieMode || tab.id != activeId) return@postDelayed
                extractOnce(tab, token)
            }, delay)
        }
        main.postDelayed({
            if (token != movieExtractToken || !movieMode || tab.id != activeId) return@postDelayed
            finishMovieExtract()
        }, MOVIE_EXTRACT_DELAYS_MS.last() + MOVIE_EXTRACT_SETTLE_MS)
    }

    /** 取一次（脚本现算，见 [MoviePageExtractor.INJECT_JS]）。 */
    private fun extractOnce(tab: Tab, token: Int) {
        val view = tab.webView ?: return
        runCatching {
            view.evaluateJavascript(MoviePageExtractor.EXTRACT_CALL_JS) { result ->
                main.post {
                    if (token != movieExtractToken || !movieMode || tab.id != activeId) return@post
                    val raw = decodeJsString(result) ?: return@post
                    val data = MoviePageExtractor.parse(raw, tab.url) ?: return@post
                    // 回调可能晚于导航返回：读到的地址与标签页当下的地址不是同一页就作废
                    if (urlPath(data.url) != urlPath(tab.url)) return@post
                    applyMoviePageData(data)
                }
            }
        }
    }

    /**
     * `evaluateJavascript` 的返回值是**一层 JSON 字符串**（我们的脚本又 stringify 了一层）。
     *
     * 解出来才是要解析的那份 JSON；脚本没装上 / 页面把那个函数清掉了会回 `null` 字面量。
     */
    private fun decodeJsString(result: String?): String? {
        if (result.isNullOrBlank() || result == "null") return null
        return runCatching { json.decodeFromString<String>(result) }.getOrNull()
    }

    /**
     * 收下一份提取结果。
     *
     * 覆盖规则是"**更丰富才覆盖**"：四拍的结果先后到，后到的常常是更完整的那一份
     * （首拍时 DOM 还没渲染出来），但偶尔也会反过来（脚本重算出更少的内容）——
     * 不能让用户眼看着卡片墙缩水。导航单独比大小（子页可能**没有**导航，不能把它抹掉）。
     */
    private fun applyMoviePageData(data: MoviePageExtractor.MoviePageData) {
        // **一份一份比**，不比总和：总和比法会让"卡片多、没区块"的那一拍把后面"卡片少、
        // 有猜你喜欢"的那一拍整份压掉 —— 用户侧就是"明明有猜你喜欢，影视模式里却没有"
        //（实测第一拍容易从整文档兜底捞到一大堆卡，richness 虚高）。
        if (data.cards.size > movieCards.size) movieCards = data.cards
        if (data.sections.sumOf { it.cards.size } > movieSections.sumOf { it.cards.size }) {
            movieSections = data.sections
        }
        if (data.comments.size > movieComments.size) movieComments = data.comments
        if (movieCards.isNotEmpty() || movieSections.isNotEmpty() || movieComments.isNotEmpty()) {
            movieExtractFailed = false
        }
        // 板块名 / 评论区标题单独补：它们是"有没有"的问题，跟卡片数量无关，
        // 拿"更丰富才覆盖"去比会把先到的那一份名字丢掉
        if (data.mainTitle.isNotEmpty() && movieMainTitle.isEmpty()) movieMainTitle = data.mainTitle
        if (data.commentTitle.isNotEmpty() && movieCommentTitle.isEmpty()) {
            movieCommentTitle = data.commentTitle
        }
        // 搜索表单同样单独补：它是"有没有"的问题，跟这一拍的卡片数量无关
        if (data.searchAction.isNotEmpty() && movieSearchAction.isEmpty()) {
            movieSearchAction = data.searchAction
            movieSearchParam = data.searchParam
        }
        if (data.searchHint.isNotEmpty() && movieSearchHint.isEmpty()) movieSearchHint = data.searchHint
        if (data.nav.size > movieNav.size) movieNav = data.nav
    }

    /**
     * 一轮取数的收尾：一无所获就进空态。
     *
     * 钉住期间连着 [MOVIE_PIN_FAIL_LIMIT] 页都空、页面自己也没报视频元素，就判定
     * "这一页我们没东西可给"并退出影视模式 —— 用户是从我们的界面点进来的，不能把人
     * 关在一个空壳里（其余出口：顶栏的关闭、空态的「查看原网页」、返回键）。
     */
    private fun finishMovieExtract() {
        movieExtracting = false
        if (movieCards.isNotEmpty() || movieSections.isNotEmpty()) {
            moviePinFailCount = 0
            return
        }
        movieExtractFailed = true
        if (moviePinHost == null || movieVideoSeen) return
        moviePinFailCount++
        if (moviePinFailCount >= MOVIE_PIN_FAIL_LIMIT) closeMovieMode()
    }

    /** 清掉这一页提取出来的内容（换页 / 退出模式 / 换标签页）。 */
    private fun clearMoviePageData() {
        if (movieNav.isNotEmpty()) movieNav = emptyList()
        if (movieCards.isNotEmpty()) movieCards = emptyList()
        if (movieSections.isNotEmpty()) movieSections = emptyList()
        if (movieComments.isNotEmpty()) movieComments = emptyList()
        if (movieMainTitle.isNotEmpty()) movieMainTitle = ""
        if (movieCommentTitle.isNotEmpty()) movieCommentTitle = ""
        if (movieSearchAction.isNotEmpty()) movieSearchAction = ""
        if (movieSearchParam.isNotEmpty()) movieSearchParam = ""
        if (movieSearchHint.isNotEmpty()) movieSearchHint = ""
        movieExtracting = false
        movieExtractFailed = false
    }

    /**
     * 片名清洗：页面标题通常带站点后缀（`片名_立即播放 - 站点名`），这里只留下片名。
     *
     * 只切**明确的分隔**（`_`、`|`、`｜`、以及两侧带空格的连字符）—— 片名自己就可能带
     * 连字符（`Spider-Man`），按单个 `-` 切会把片名切坏。
     */
    private fun cleanMovieTitle(raw: String): String {
        var s = raw.replace(Regex("[\\u200B-\\u200D\\uFEFF]"), "").replace(Regex("\\s+"), " ").trim()
        for (sep in listOf("_", "|", "｜", " - ", " – ", " — ")) {
            val i = s.indexOf(sep)
            if (i > 0) s = s.substring(0, i).trim()
        }
        return if (s.length > 60) s.substring(0, 60) else s
    }

    /**
     * 从我们的界面点出去：**留在影视模式里**（记下 host 钉住，见 `onPageStarted`）。
     *
     * 站点的分类页 / 列表页本来就没有 `<video>` 也没有视频流，重新走一遍判据必然落空 ——
     * 钉住就是"我们替它回答了这个问题"。跨 host 或回自家首页照旧退出（用户口径）。
     */
    fun openInMovieMode(url: String) {
        if (url.isBlank()) return
        moviePinHost = TabNaming.host(url).takeIf { it.isNotEmpty() }
        viewOf(active).loadUrl(url)
    }

    /**
     * 从我们的影视页"回网页去起播"：退出影视模式，但**不拉黑这一站**。
     *
     * 为什么必须有这条路：影视站很多页面的起播**必须由用户在站点自己的播放器上点一下**
     * （详情页、以及"换了内容之后"的播放页都是这样），而我们这一屏把网页整个盖住了 ——
     * 不给出口，用户就只能一直看着"还没识别到可播放的影视资源"（用户点名："必须首次进入
     * 网页，原生播放器才能播放内容"）。回网页点一下起播之后，判据（视频元素 + 视频流）
     * 成立时会自动回到影视模式：这里走的是 [leaveMovieModeForTabSwitch] 那条"退出不拉黑"
     * 的路，再补一次 [restartMovieProbe] 让页面重新举手。
     */
    fun playInPage() {
        if (!movieMode) return
        val tab = active
        leaveMovieModeForTabSwitch(tab)
        restartMovieProbe(tab)
    }

    /**
     * 这一站像不像影视站（界面据此决定显不显示"影视模式"那枚入口）。
     *
     * 判据与自动进模式那套同源，另加"已经取到过影视内容"这一条：用户手动关掉影视模式之后，
     * 这一页的嗅探结果与提取结果都还在，入口不该跟着消失 —— 否则关掉就再也开不回来
     *（用户口径：默认开，关掉之后也要能再开）。
     */
    val movieSiteDetected: Boolean
        get() = movieMode || movieVideoSeen || movieNav.isNotEmpty() ||
            movieCards.isNotEmpty() || sniffed.any { it.kind == SniffKind.VIDEO }

    /**
     * 手动进影视模式（输入框里那枚入口，见 [movieSiteDetected]）。
     *
     * 与自动那条路只差一处：先把这一站的"手动关过"记忆清掉 —— 用户主动点进来，
     * 就不该再被上一次的关闭挡住。之后同 [openInMovieMode] 一样钉住 host，站内跳转也留在模式里。
     */
    fun enableMovieMode() {
        if (movieMode) return
        val tab = active
        movieModeOffHosts.remove(TabNaming.host(tab.url))
        moviePinHost = TabNaming.host(tab.url).takeIf { it.isNotEmpty() }
        movieMode = true
        clearMoviePageData()
        movieExtracting = true
        runCatching { tab.webView?.evaluateJavascript(MOVIE_START_JS, null) }
        scheduleMovieExtract(tab)
    }

    /**
     * 台前这一屏换了主人（切标签 / 关掉正在看的标签）：影视模式**退出，但不拉黑这一站**。
     *
     * 与用户手动关闭（[closeMovieMode]，会记 host 压住自动重开）不同：这里只是
     * "它盖的是整屏、不能盖到别的标签页上"，切回来时重新探一次（见 [restartMovieProbe]），
     * 判据还成立就自动回来。
     */
    private fun leaveMovieModeForTabSwitch(tab: Tab) {
        movieMode = false
        movieVideoSeen = false
        clearMoviePageData()
        moviePinHost = null
        runCatching { tab.webView?.evaluateJavascript(MOVIE_STOP_JS, null) }
    }

    /**
     * 让某个标签页的页面**重新举一次手**（切到它台前时调）。
     *
     * `__lerxuMovieStop` 会把页面侧"探到过什么"的标记清成 null，紧接着的
     * `__lerxuMovieStart` 于是必然上报一次 —— 判据（视频元素 + 嗅探到的流）这时成立
     * 就自动回到影视模式（见 [MovieBridge.video]）。少了这一下，切走再切回来就再也
     * 回不去了：页面那套心跳只在"有 / 没有"翻面时才过桥。
     */
    private fun restartMovieProbe(tab: Tab) {
        if (tab.isHomePage) return
        val view = tab.webView ?: return
        runCatching {
            view.evaluateJavascript(MOVIE_STOP_JS, null)
            view.evaluateJavascript(MOVIE_START_JS, null)
        }
    }

    /**
     * 关闭影视模式：网页 UI（**包括视频播放器**）变回原来的样子。
     *
     * 页面侧要做的只有"撤掉那个复检定时器"（见 [MovieMode.INJECT_JS]）——
     * 影视模式全程没写过页面，所以这一步之后网页和进入前逐字节一致。
     */
    fun closeMovieMode() {
        if (!movieMode) return
        movieMode = false
        // 页面侧的心跳停了，这个信号也就没有来源了：复位成"未知"，别留成陈旧的真值
        movieVideoSeen = false
        // 在飞的取数一并作废，提取出来的那一份也丢掉（退出后它没有任何用处）
        movieExtractToken++
        clearMoviePageData()
        moviePinHost = null
        moviePinFailCount = 0
        val tab = active
        tab.webView?.let { view ->
            runCatching { view.evaluateJavascript(MOVIE_STOP_JS, null) }
        }
        // 记下这个 host（理由见 [movieModeOffHosts]）：不记的话下一次评估会立刻又开
        TabNaming.host(tab.url).takeIf { it.isNotEmpty() }?.let { movieModeOffHosts += it }
    }

    /** 进影视模式：让页面侧把复检心跳挂上（幂等，脚本自己带守卫）。 */
    private val MOVIE_START_JS =
        "(function(){try{window.__lerxuMovieStart&&window.__lerxuMovieStart();}catch(e){}})();"

    /** 退出影视模式：撤掉页面侧的复检心跳并复位标记。 */
    private val MOVIE_STOP_JS =
        "(function(){try{window.__lerxuMovieStop&&window.__lerxuMovieStop();}catch(e){}})();"

    /** JS 桥：影视模式的探测回传（见 [MovieMode.INJECT_JS]）。 */
    inner class MovieBridge internal constructor(private val tab: Tab) {
        @JavascriptInterface
        fun video(has: Int, title: String) {
            main.post {
                movieVideoSeen = has == 1
                movieTitle = title
                evaluateMovieMode(tab)
            }
        }
    }

    /**
     * 播放器开着期间**反复**按住页面那一层的心跳（见 [PAGE_MUTE_INTERVAL_MS]）。
     *
     * 实体在 PageVideoDetector 里（`__lerxuHideVideos`）：`<video>` 自己不画 + 它外面那圈
     * 壳（站点自己的控制条 / 海报）跟着隐掉，顺手把位置重报一次（清掉"值没变就不发"
     * 的门槛 —— WebView 自己的位移只有重报才拿得到）。站点会重试 `play()`、有的还会把
     * `visibility` 改回来，所以不能只按一次。
     */
    private val HIDE_PAGE_VIDEO_JS =
        "(function(){try{window.__lerxuHideVideos&&window.__lerxuHideVideos();}catch(e){}})();"

    /** 退出原生播放器：把上面隐掉的那些元素原样还回去。 */
    private val SHOW_PAGE_VIDEO_JS =
        "(function(){try{window.__lerxuShowVideos&&window.__lerxuShowVideos();}catch(e){}})();"

    /** 起播那一刻开始跟位置（见 PageVideoDetector 的位置回传）。 */
    private val START_PAGE_RECT_JS =
        "(function(){try{window.__lerxuStartRect&&window.__lerxuStartRect();}catch(e){}})();"

    /** 关掉播放器：停止回传，页面那边的手监听 / 定时器一并撤掉。 */
    private val STOP_PAGE_RECT_JS =
        "(function(){try{window.__lerxuStopRect&&window.__lerxuStopRect();}catch(e){}})();"

    /**
     * 换页 / 换标签之后强制重报一次位置：页面这一层重新可见，矩形可能整片都变了，
     * 而"值没变就不发"的门槛会把这一帧挡掉 —— 先清掉它再报。
     */
    private val FORCE_PAGE_RECT_JS =
        "(function(){try{window.__lerxuRectKey=null;" +
            "window.__lerxuStartRect&&window.__lerxuStartRect();}catch(e){}})();"

    /**
     * 播放器开着期间**反复**按住页面那一层的心跳。
     *
     * 站点播放器自己会重试：`play()` 被拒之后往往几百毫秒再试一次，一些站还会把
     * `visibility` 改回来重建那块合成面 —— 只按一次的话，画面会自己"长回来"，
     * 声音也会跟着起来（两路声音）。1 秒一次的成本就是主文档上一次
     * `evaluateJavascript`，可以忽略；停了就什么都不做（见 [setNativePlayerActive]）。
     */
    private var pageMutePoll: Runnable? = null

    /**
     * 把一个可重复执行的注入脚本挂成心跳（先立刻跑一次，再每 [PAGE_MUTE_INTERVAL_MS]
     * 跑一次；换新的心跳先把旧的撤掉）。
     */
    private fun startPageMute(view: WebView) {
        stopPageMute()
        val task = object : Runnable {
            override fun run() {
                runCatching { view.evaluateJavascript(HIDE_PAGE_VIDEO_JS, null) }
                if (pageMutePoll === this) main.postDelayed(this, PAGE_MUTE_INTERVAL_MS)
            }
        }
        pageMutePoll = task
        main.post(task)
    }

    private fun stopPageMute() {
        pageMutePoll?.let { main.removeCallbacks(it) }
        pageMutePoll = null
    }

    /**
     * App 的原生播放器此刻是否开着（由 AppScreen 维护）。
     *
     * 开着的时候要做的只有两件事：把网页那边的全屏请求顶回去（见 [browserChromeClient]
     * 的 `onShowCustomView` —— 影视站的播放按钮基本都在 `play()` 的同一拍里
     * `requestFullscreen()`，漏过去就会有一层黑底容器盖在播放器上面），以及**只把
     * 页面那一路视频按住**。网页本身（其它内容、滚动、点击）**一律不动** —— 窗口态的
     * 播放器只是浮在网页上的一小块，用户点名的口径是"应该只是替换播放器，不应该影响
     * 该网页其他内容的正常显示"。
     */
    fun setNativePlayerActive(active: Boolean) {
        nativePlayerActive = active
        val view = this.active.webView
        if (active) {
            // 出现得比我们早的那一层（用户先全屏、再从"本页资源"里点播放）也一并撤掉
            hideFullscreen()
            // 这一路属于当前这个标签页：位置也跟着它走。
            // **接管这一刻手里就该有位置**（页面在通知之前已经报过，见 [freshFrame]），
            // 于是播放器从第一帧就摆在正确的位置上 —— 没有"先兜底、过一会才定位"那一段。
            playerFrameTab = activeId
            playerFrame = freshFrame(activeId)
            playerRectFallback = false
            publishPlayerFrame()
            if (playerFrame == null) armRectFallback()
            // 只按住页面那一路的视频（暂停 + 不再绘制，见 HIDE_PAGE_VIDEO_JS）+ 心跳复检
            if (view != null) startPageMute(view)
            // 让页面把那个 <video> 的位置报上来（"本页资源"手动起播那条路径没有 notify 过；
            // 已经有位置时这一步只是校正基线）
            if (view != null) runCatching { view.evaluateJavascript(START_PAGE_RECT_JS, null) }
        } else {
            stopPageMute()
            playerFrameTab = -1L
            playerFrame = null
            playerRectFallback = false
            lastFrames.clear()
            lastFrameAt.clear()
            pageGridProgress = 0f
            pageGridMorph = null
            pageGridClip = null
            pageGridAlpha = 1f
            publishPlayerFrame()
            if (view != null) {
                runCatching { view.evaluateJavascript(SHOW_PAGE_VIDEO_JS, null) }
                runCatching { view.evaluateJavascript(STOP_PAGE_RECT_JS, null) }
            }
        }
    }

    /**
     * 给"页面报位置"这件事起一个计时：到点还没矩形就开兜底形态（顶部一块 16:9）。
     * 每次重新计时换一个令牌，旧的作废 —— 否则换页/换标签之后旧的那次会把兜底又掀回来。
     *
     * 时限看"这一页量到过没有"：量到过（缓存里有）说明位置只是暂时断了，多等一会；
     * 从没量到过说明压根没有可跟的播放器，早点摆出兜底形态给用户看到画面。
     */
    private fun armRectFallback() {
        val token = ++rectFallbackToken
        val wait = if (lastFrames.containsKey(activeId)) {
            PLAYER_RECT_WAIT_MS_LOST
        } else {
            PLAYER_RECT_WAIT_MS_NONE
        }
        main.postDelayed({
            if (token != rectFallbackToken) return@postDelayed
            if (playerFrameTab < 0L || playerFrame != null) return@postDelayed
            playerRectFallback = true
            // 兜底形态也要"当场"通知覆盖层（页面上一个位置都报不上来时，这条是唯一一次机会）
            publishPlayerFrame()
        }, wait)
    }

    /**
     * 承载播放器的那一页开始导航（或那个 WebView 被换掉）：位置先作废（别让播放器
     * 用上一页的矩形挂在新页面上），再给新页面一点时间 —— 新页面里又起播并接管
     * （`nativePlayRequest`）或者报了新位置，就留着；两样都没有，说明这次是"用户
     * 真的走了"，关掉播放器（声音也一起停）。
     *
     * 为什么不是立刻关：站点自己也会导航（点播放 → 跳到 /play/xxx 那种），
     * 立刻关会把刚起播的这一路自己掐死。
     */
    private fun onHostPageNavigated(tab: Tab) {
        playerFrame = null
        playerRectFallback = false
        forgetFrame(tab.id)
        publishPlayerFrame()
        // **换页就立刻停掉我们自己的播放器**：这一页换了，上一页那一路流就不该再占着屏幕
        //（用户点名："在搜索页面还会显示原生的播放器"）。以前这里等一拍、并且"新页面报来了
        // 播放器位置就不停"—— 搜索结果页里只要有任何一个视频元素报位置，这一停就被取消，
        // 于是上一路的画面留在搜索页上不走。
        nativePlayStop = true
    }

    /**
     * JS 桥：页面里那个 `<video>` 的位置（见 PageVideoDetector 的位置回传）。
     *
     * 页面侧做了"值没变就不发"的去重，所以这里不必再判重。
     *
     * 取数一律 `doubleOrNull`：页面报的是**一位小数**的 CSS px（滚动时整数位置会产生
     * 1px 台阶），拿 `intOrNull` 去接会**整条丢掉**（非整数的 JSON 数字解析不出 Int，
     * 于是每一帧的位置都被拒收）。
     */
    inner class VideoRectBridge internal constructor(private val tab: Tab) {
        @JavascriptInterface
        fun rect(payload: String) {
            main.post {
                val parsed = runCatching { json.parseToJsonElement(payload) as? JsonObject }
                    .getOrNull() ?: return@post
                if ((parsed["gone"] as? JsonPrimitive)?.booleanOrNull == true) {
                    if (tab.id == playerFrameTab) {
                        // 别立刻清：转屏 / 切清晰度时页面会短暂重建播放器，给它一点时间
                        onRectGone(tab.id)
                    } else {
                        forgetFrame(tab.id)
                    }
                    return@post
                }
                rectGoneToken++
                val x = (parsed["x"] as? JsonPrimitive)?.doubleOrNull ?: return@post
                val y = (parsed["y"] as? JsonPrimitive)?.doubleOrNull ?: return@post
                val w = (parsed["w"] as? JsonPrimitive)?.doubleOrNull ?: return@post
                val h = (parsed["h"] as? JsonPrimitive)?.doubleOrNull ?: return@post
                val view = tab.webView ?: return@post
                // 页面里的 1px 就是 1dp（WebView 初始缩放 1、devicePixelRatio = 屏幕
                // 密度）；WebView 自己在窗口里的那点位移是设备像素，按密度折成 dp 加上去
                val loc = IntArray(2)
                view.getLocationInWindow(loc)
                val density = view.resources.displayMetrics.density
                val left = (loc[0] / density + x).toFloat()
                val top = (loc[1] / density + y).toFloat()
                val rect = RectF(left, top, left + w.toFloat(), top + h.toFloat())
                // 每个标签页都记一份：不在台前的那一页也要记 —— 切回来时**第一帧**
                // 就得摆在正确的位置上（见 [freshFrame]），不能等它重报
                lastFrames[tab.id] = rect
                lastFrameAt[tab.id] = SystemClock.uptimeMillis()
                if (tab.id != playerFrameTab) return@post
                playerRectFallback = false
                playerFrame = rect
                // 直连出口：滚动时不经过 Compose 状态与重组，当场把位置交出去
                //（滚动期间页面**按帧**报位置，所以这里不需要任何原生侧的滚动补偿）
                publishPlayerFrame()
            }
        }
    }

    /** 起播后等嗅探结果的轮询（见 [onPageVideoPlayed]）。 */
    private var playPoll: Runnable? = null

    /** 从嗅探结果里挑一条"最像这一路"的：优先视频，其次任意一条。 */
    private fun pickPlayable(tab: Tab): SniffedResource? =
        tab.sniffed.firstOrNull { it.kind == SniffKind.VIDEO }
            ?: tab.sniffed.firstOrNull()

    /**
     * 页面报"开始播视频了"：挑一条最像"这一路"的嗅探结果交给原生播放器。
     *
     * 挑不到不能马上放弃 —— 播放页的 m3u8 大多是**点了播放之后**才去拉的，而 `play`
     * 事件先到，于是"当时还没有可播地址"。早先这里直接 return，结果就是"仍然在用
     * 网页自己那套播放器"（用户点名）。改成短时间轮询等它出现；真的等不到才放手，
     * 那时用户再点一次播放就是网页自己播（脚本里的闸门已关，不会再抢）。
     */
    private fun onPageVideoPlayed(tab: Tab) {
        if (nativePlayRequest != null) return
        if (tab.id != activeId) return
        // **先把网页那一层全屏撤掉**，再交给 App 的播放器。
        // 影视站的播放按钮几乎都在 `play()` 的同时 `requestFullscreen()`，那段会走到
        // [onShowCustomView]：往 decorView 上盖一层黑底容器，而它盖在 Activity 的
        // content **之上** —— 我们的播放器被压在后面看不见，用户看到的就是"自动进了
        // 全屏、而且还是站点自己那套控件"（用户点名的问题）。这里两路都撤：
        // JS 那路让页面自己退出 DOM 全屏（页面播放器才会把内联样式还原），
        // [hideFullscreen] 那路兜住"页面不配合"的情况。
        tab.webView?.evaluateJavascript(
            "(function(){try{var d=document;" +
                "if(d.fullscreenElement||d.webkitFullscreenElement){" +
                "(d.exitFullscreen||d.webkitExitFullscreen).call(d);}}catch(e){}})();",
            null
        )
        hideFullscreen()

        pickPlayable(tab)?.let {
            nativePlayRequest = it
            return
        }

        playPoll?.let { main.removeCallbacks(it) }
        var tries = 0
        val task = object : Runnable {
            override fun run() {
                if (nativePlayRequest != null || tab.id != activeId) return
                val pick = pickPlayable(tab)
                if (pick != null) {
                    nativePlayRequest = pick
                } else if (++tries < 15) {
                    main.postDelayed(this, 200)
                }
            }
        }
        playPoll = task
        main.postDelayed(task, 200)
    }

    /** JS 桥：网页视频起播的通知（见 [PageVideoDetector]）。 */
    inner class PageVideoBridge internal constructor(private val tab: Tab) {
        @JavascriptInterface
        fun played() {
            main.post { onPageVideoPlayed(tab) }
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
         * 网页**实际底色**（`0xRRGGBB`，-1 = 量不出来）：页面侧的注入脚本
         *（[WebThemeEngine.BG_REPORT_JS]）量一次报一次，只在颜色真变了时才过桥。
         *
         * 顶部那一截系统栏跟着它走 —— 原来固定用应用底色，深色网页顶上就顶着
         * 一条浅色带子。页面自己的深浅开关、SPA 路由换肤都会再报一次，所以那条
         * 带子是**实时**跟着网页变的。
         */
        @JavascriptInterface
        fun bg(color: Int) {
            main.post { tab.pageBgArgb = color }
        }

        /**
         * 网页滚动增量（正 = 网页向下滚），**逐帧**从页面的 `scroll` 事件回传。
         *
         * 走页面事件而不是 `View.setOnScrollChangeListener`：后者在 Chromium
         * WebView 上是成批同步的，坞要等滚动停下来才让位（用户点名的 bug）。
         * 而且这里要的是**每一帧的位移量**（跟手只有页面自己的 scroll 事件给得出）。
         *
         * 传增量而不是"该收还是该展"的单比特：收起是**跟手**的 —— 滚多少收多少、
         * 反向滚就展回来，停下再按"过没过一半"吸附。传一个布尔就只能整段跳，
         * 那正是用户点名的"立刻触发收起动画"。
         *
         * 方向不必在这里判：`scrollY/scrollTop` 的增减**就是网页的滚动方向**
         *（网页向下滚 = 增量为正 = 收起），页面上报的正负号直接照用。
         *
         * 顶部面板展开期间不接管（那时候坞本来就不该收）；**地址栏聚焦期间也不接管**
         * —— 输入法还压着、正在输入，坞不该缩成胶囊（用户点名：取消聚焦的同时向下
         * 滚动会闪出收起态）。这一下不接管，收起动作就留给失焦之后的下一次滚动。
         */
        @JavascriptInterface
        fun scroll(dy: Int) {
            main.post {
                // 该不该接管由这几条状态决定（都由界面同步过来 / 本来就是控制器状态）：
                // 传统方案不收；面板展开时收起来会把用户正在选的东西顶出屏幕；
                // 地址栏聚焦期间正在输入、搜索页开着时那是"正在搜索"的界面 —— 都不该缩；
                // 坞不在这张页面上（标签网格盖着、停在任务页）时，页面自己的
                // 自动滚动（轮播、直播流列表）也会发 scroll 事件，同样不许它收坞
                if (!dockModern || !dockEngaged || dockPanelsOpen ||
                    dockInputFocused || homePanelsOpen
                ) {
                    return@post
                }
                followDock(dy.toFloat(), DockFollow.SCROLL_TRAVEL_DP * density)
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
            evaluateMovieMode(tab)
            return
        }
        tab.sniffed.add(0, item)
        // 大小多半是 0（响应头没给 Content-Length）：补一次探测
        probeSize(tab, item)
        // 嗅探结果更新 = 判据里的"视频流"这一半到齐了：评估一次影视模式
        evaluateMovieMode(tab)
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

    /**
     * 交给**原生播放器**的请求头（Referer / UA / Cookie）。
     *
     * 与下载那条路同源（见 [buildHeaders]）：影视站的流几乎都校验防盗链，少一个
     * `Referer` 就是 403。这里刻意**滤掉来源标识那个自定义头** —— 它是给我们自己
     * 的下载器看的，丢给 CDN 只会多一分被拒的可能。
     */
    fun playbackHeaders(url: String): Map<String, String> {
        val tab = active
        val ua = runCatching { tab.webView?.settings?.userAgentString }.getOrNull()
        return buildHeaders(tab, url, ua)
            .mapNotNull { line ->
                val i = line.indexOf(':')
                if (i <= 0) null else line.substring(0, i).trim() to line.substring(i + 1).trim()
            }
            .filter { it.first.lowercase() != "x-lerxu-source" }
            .toMap()
    }

    /** `Content-Disposition: attachment; filename="x.zip"` → `x.zip`. */
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

    /**
     * 加载我们自己的首页；[focus] = 要求首页脚本把焦点放进居中输入框。
     *
     * [keepHistory] = 首页是**从网页里点地址栏"过路"过来的搜索页**（用户点名的那条路径）：
     * 不要把历史清成"首页是根"，否则用户刚才看的那一页直接没了 —— 返回键再点就是退出浏览器。
     * 这一路首页压进历史栈，系统返回键 / 左滑返回都能退回刚才那页；清历史留给下一次
     * 真正以首页为根的加载（见 [Tab.homeKeepHistory]）。
     */
    fun loadHome(focus: Boolean = false, keepHistory: Boolean = false) {
        val tab = active
        tab.pendingHomeFocus = focus
        tab.homeKeepHistory = keepHistory
        tab.homeRequested = true
        // 主题 / 语言 / 聚焦不进 URL：由 shouldInterceptRequest 注入进 HTML 本体。
        //
        // 但"过路"那一趟（从网页点地址栏进搜索页）要**在地址上带个标记**，两个用处：
        // ① 页面自己就能看到（`?s=1`），据此让 logo 首帧就落在顶部，不依赖响应体；
        // ② 换个缓存 key —— WebView 会把 shouldInterceptRequest 的响应收进自己的缓存，
        //    同一个 URL 再次加载可能拿到上一次那份 HTML（里面 search 是 false）。
        //
        // 用**固定值**而不是递增序号：地址稳定，历史栈里不会堆出一串"同一个首页"；
        // 响应已经带 no-store，不需要每次击穿。加载完 [onPageFinished] 会把它还原成
        // 干净的 [HOME_URL]（否则从历史栈回退时页面会把自己误判成搜索页）。
        val url = if (keepHistory) HOME_URL + "?s=1" else HOME_URL
        viewOf(tab).loadUrl(url)
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
            append("\"focus\":").append(if (tab.pendingHomeFocus) "true" else "false").append(',')
            // 这一趟是"从网页点地址栏过路进搜索页"（见 [Tab.homeKeepHistory]）：
            // 页面据此让 logo 与面板**首帧就在终态** —— 用户是从网页跳过来的，
            // 没有"首页品牌飞入"这个语境，再放一遍居中→顶部的位移就是多余的动画（用户点名）
            append("\"search\":").append(if (tab.homeKeepHistory) "true" else "false").append('}')
        }
        tab.pendingHomeFocus = false
        val html = template
            .replace("/*__LERXU_BOOT__*/null", boot)
            .replace("/*__LERXU_THEME__*/", homeThemeCss())
        // **不许缓存**：这份 HTML 里带着"这一次加载"的状态（主题色板、聚焦、是不是
        // 从网页过路进搜索页）。被 WebView 收进缓存后，下一次同 URL 加载会拿到上一次
        // 的旧状态 —— 主题换了不生效、logo 又演一遍飞入（用户点名）。
        return WebResourceResponse("text/html", "utf-8", html.byteInputStream()).apply {
            setResponseHeaders(
                mutableMapOf(
                    "Cache-Control" to "no-store, no-cache, must-revalidate",
                    "Pragma" to "no-cache"
                )
            )
        }
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

    // ─── 首页的「搜索建议 + 历史」面板 ───

    /**
     * 首页搜索页展开 / 收起（[open] = true 由「地址栏聚焦」触发）。
     *
     * 搜索页只有自家首页有 —— 别的页面输入框归网站自己管（必应 / Google 自带下拉）。
     * 传 false 只在"确实要退出搜索页"时用（返回键、离开浏览器页）；**失焦不传 false**，
     * 否则"按住向下拖收起输入框"会把搜索页一起关掉。
     */
    fun setHomePanels(open: Boolean) {
        val show = open && active.isHomePage
        val was = homePanelsOpen
        homePanelsOpen = show
        if (!show) {
            cancelSuggest()
            if (!was) return
        }
        // 展开时把当前输入重新算一遍：可能是"先聚焦、后敲字"两条路径先后到达
        if (show && homeQuery.isNotEmpty()) requestSuggest(homeQuery)
        // 刚展开：把联想词连接热一次（覆盖"在首页停留很久、连接已被回收"与"换过引擎"）
        if (show && !was) warmUpSuggest()
        pushHomePanels()
    }

    /** 地址栏输入变化（界面下发）。面板没开时不算 —— 那串输入跟首页没关系。 */
    fun setHomeQuery(text: String) {
        if (homeQuery == text) return
        homeQuery = text
        if (!homePanelsOpen || !active.isHomePage) return
        // 一开始打字就退出历史查看页：那一层是"只看历史"的静态一屏，
        // 用户在输入的是**新的一搜**，建议与命中的历史才该在场（与"全部清除"
        // 在有输入时让位同一条规则）
        if (text.isNotBlank()) homeHistoryView = false
        requestSuggest(text)
        pushHomePanels()
    }

    /**
     * 打开历史查看页（面板里的"查看更多"）。
     *
     * 面板**不变**，只是内容换成只列搜索历史：最近访问与搜索建议两组收起、
     * 搜索历史放全部条数。页面侧那一屏的形变（字标淡出、标题淡入、两组收放）
     * 由它自己走补间，这里只负责换数据。
     */
    fun openHomeHistory() {
        if (homeHistoryView || !homePanelsOpen || !active.isHomePage) return
        homeHistoryView = true
        pushHomePanels()
    }

    /** 退出历史查看页（页面左上角返回键 / 系统返回）：回到普通搜索界面。 */
    fun closeHomeHistory() {
        if (!homeHistoryView) return
        homeHistoryView = false
        pushHomePanels()
    }

    /**
     * 面板要避开的底部高度（**CSS px**，界面下发）：网页底边到坞顶的实测距离。
     * 变了就重推一次。
     */
    fun setHomePanelBottom(cssPx: Int) {
        if (homePanelBottomCss == cssPx) return
        homePanelBottomCss = cssPx
        if (homePanelsOpen) pushHomePanels()
    }

    /** 收起面板（导航开始时、离开浏览器页时由界面调用）。 */
    fun closeHomePanels() {
        cancelSuggest()
        if (!homePanelsOpen && homeQuery.isEmpty()) return
        homePanelsOpen = false
        // 历史查看页是搜索页里的一层：搜索页收了，这一层跟着走（见 homeHistoryView）
        homeHistoryView = false
        homeQuery = ""
        pushHomePanels()
    }

    private fun cancelSuggest() {
        main.removeCallbacks(suggestTick)
        pendingSuggest?.cancel()
        pendingSuggest = null
        suggestSeq++
        homeSuggestions = emptyList()
    }

    /**
     * 预热联想词端点的连接（见 [SuggestClient.warmUp]）。
     *
     * 一次搜索会话里的第一条联想请求要付整段冷启动：实测 DNS + TCP + TLS 约 350ms，
     * 比请求本身（热连接下约 130ms）还久 —— 用户读到的就是"联想词出来得慢"。
     * 这两个时机各叫一次，都是"用户接下来很可能要搜"：
     *
     *  · 首页加载完（进浏览器 / 从结果页退回首页）：到用户点地址栏、等键盘、
     *    敲下第一个字通常还有几百毫秒到几秒，这段空档正好把往返跑掉；
     *  · 面板展开（地址栏刚聚焦）：补一次，覆盖"在首页停留很久、池里的连接已被
     *    回收"以及"中途换过引擎"这两种情况。
     *
     * 用 HEAD：连接建好就立刻还回池子，不会占着让第一条真实请求另开一条冷连接。
     * 预热结果一律丢弃，失败也不提示（它只是优化，不是功能）。
     */
    private fun warmUpSuggest() {
        val url = Suggestions.warmUpUrl(engine) ?: return
        SuggestClient.warmUp(url)
    }

    /**
     * 取联想词：**防抖 + 序号**双保险。
     *
     * 防抖是为了别把中间态发出去（联想词是"停下来才看"的东西）；
     * 序号是为了让先发后到的慢响应作废 —— 否则面板上会挂着上一串输入的词。
     */
    private fun requestSuggest(raw: String) {
        main.removeCallbacks(suggestTick)
        pendingSuggest?.cancel()
        pendingSuggest = null
        val query = raw.trim()
        suggestSeq++
        val seq = suggestSeq
        if (query.isEmpty()) {
            homeSuggestions = emptyList()
            return
        }
        val url = Suggestions.url(engine, query) ?: run {
            homeSuggestions = emptyList()
            return
        }
        suggestTick = Runnable {
            pendingSuggest = SuggestClient.fetch(url) { list ->
                main.post {
                    if (seq != suggestSeq) return@post
                    homeSuggestions = list.take(HOME_SUGGEST_LIMIT)
                    pushHomePanels()
                }
            }
        }
        main.postDelayed(suggestTick, SUGGEST_DEBOUNCE_MS)
    }

    /**
     * 把面板内容推给首页脚本。
     *
     * 整份 JSON 在 Kotlin 侧拼好（转义见 [jsonString]），页面只负责渲染 ——
     * 数据形状只有一处真相，页面改样式不会把字段名改歪。
     */
    private fun pushHomePanels() {
        val tab = active
        if (!tab.isHomePage) return
        val view = tab.webView ?: return
        if (!homePanelsOpen) {
            runCatching {
                view.evaluateJavascript(
                    "window.LerxuHomePanels && window.LerxuHomePanels({open:false})",
                    null
                )
            }
            return
        }
        // 两组各管一件事（用户点名）：
        // - recent：**页面** —— 最近访问过、或命中当前输入的那些页；
        // - searches：**搜索历史** —— 从记录里认出来的关键词（去重、最近在前）。
        //   这一组**没输入时也要给**：它固定显示在"最近访问"下方。
        //
        // 历史查看页只要搜索历史这一组：另外两组给空数组，页面侧它们自己收起来
        //（0fr 补间），搜索历史则放到全部条数 —— "查看更多"看到的就是**全部**搜索历史
        val inHistoryView = homeHistoryView
        val recentRows = if (inHistoryView) {
            emptyList()
        } else {
            BrowseHistory.query(history, homeQuery, HOME_HISTORY_RECENT)
        }
        val searchWords = BrowseHistory.searchQueries(
            history, SearchEngines.all, homeQuery,
            if (inHistoryView) HOME_SEARCH_ALL else HOME_SEARCH_RECENT
        )
        val payload = buildString {
            append("{\"open\":true,")
            append("\"query\":\"").append(jsonString(homeQuery)).append("\",")
            append("\"bottom\":").append(homePanelBottomCss).append(',')
            append("\"histView\":").append(inHistoryView).append(',')
            append("\"suggestions\":[")
            if (!inHistoryView) {
                homeSuggestions.forEachIndexed { i, s ->
                    if (i > 0) append(',')
                    append('"').append(jsonString(s)).append('"')
                }
            }
            append("],\"recent\":[")
            appendHistoryRows(recentRows)
            append("],\"searches\":[")
            searchWords.forEachIndexed { i, w ->
                if (i > 0) append(',')
                append('"').append(jsonString(w)).append('"')
            }
            append("]}")
        }
        runCatching {
            view.evaluateJavascript(
                "window.LerxuHomePanels && window.LerxuHomePanels($payload)",
                null
            )
        }
    }

    /**
     * 面板里一条历史记录的 JSON。
     *
     * 三个字段各管一件事：`title` 是**名称**（取不到标题时 [BrowseHistory.displayTitle]
     * 已经退回域名），负责让人认出是哪一页；`subtitle` 是**处理过的地址**，负责确认来源；
     * `url` 只用于跳转，不直接显示。
     *
     * `subtitle` 与标签卡同一个口径（[TabNaming.subtitle]：去协议、去开头的 `www.`、
     * 去末尾斜杠，本地页面给空串），再砍掉查询串与锚点 —— 那两段是噪声，
     * "确认来源"只要站点与路径就够，留着还会把一行挤成省略号
     */
    private fun StringBuilder.appendHistoryRows(rows: List<HistoryEntry>) {
        rows.forEachIndexed { i, e ->
            if (i > 0) append(',')
            append("{\"url\":\"").append(jsonString(e.url)).append("\",\"title\":\"")
            append(jsonString(BrowseHistory.displayTitle(e))).append("\",\"subtitle\":\"")
            append(jsonString(panelSubtitle(e.url))).append("\"}")
        }
    }

    /** 面板副标题：处理过的地址，且只留"站点 + 路径"（见 [appendHistoryRows]）。 */
    private fun panelSubtitle(url: String): String =
        TabNaming.subtitle(url).substringBefore('?').substringBefore('#')

    /**
     * 拼进 JS 字符串字面量：反斜杠、引号、换行与行分隔符都必须转义。
     * （标题是从网页里取来的，什么都可能有。）
     */
    private fun jsonString(s: String): String = buildString(s.length + 8) {
        s.forEach { c ->
            when (c) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                '\u2028' -> append("\\u2028")
                '\u2029' -> append("\\u2029")
                else -> if (c < ' ') append("\\u%04x".format(c.code)) else append(c)
            }
        }
    }

    // ─── 浏览历史 ───

    /**
     * 记一条浏览历史。
     *
     * 三处都不记：无痕窗口（见 [enterIncognito] 那一套口径）、自家内部页、
     * 以及拿不到地址的情况。同一地址重复访问只是置顶，不新增。
     */
    private fun rememberVisit(tab: Tab) {
        if (incognitoMode) return
        if (!BrowseHistory.isRecordable(tab.url)) return
        val next = BrowseHistory.record(history, tab.url, tab.title, System.currentTimeMillis())
        if (next === history) return
        history = next
        persistHistory()
    }

    private fun persistHistory() {
        prefs.edit().putString(PREF_BROWSE_HISTORY, BrowseHistory.encode(history)).apply()
    }

    /** 清空浏览记录（搜索页「最近访问」整组的数据源）。 */
    fun clearBrowseHistory() {
        if (history.isEmpty()) return
        history = emptyList()
        persistHistory()
        pushHomePanels()
    }

    /** 清掉记录里的搜索项（搜索页「搜索历史」那一组），普通浏览记录保留。 */
    fun clearSearchHistory() {
        val next = BrowseHistory.clearSearches(history, SearchEngines.all)
        if (next.size == history.size) return
        history = next
        persistHistory()
        // 历史清空了，历史查看页也就没有内容可看：退回普通搜索界面
        //（否则留在一屏空白上，还得用户自己按返回）
        homeHistoryView = false
        pushHomePanels()
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
    /**
     * 自动拦截广告（设置页下发，默认开，见 [AdBlocker]）。
     *
     * 两层一起生效：**网络层**在 [shouldInterceptRequest] 里拦广告域的请求
     * （后台线程读，所以是 `@Volatile`）；**元素层**是页面里那层隐藏样式。
     * 切换时**当场**给所有已打开的页面补 / 撤样式 —— 用户拨完开关切回页面
     * 就该看到效果，而不是等下一次刷新。
     */
    @Volatile
    var adBlockEnabled: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            main.post {
                tabs.forEach { tab ->
                    val view = tab.webView ?: return@forEach
                    injectAdBlock(view)
                    // 起始脚本也要换一份：**子帧里的广告位靠它**，换完下次加载的
                    // 文档（含 iframe）就是新状态
                    installPageToolsDocStart(tab, view)
                }
            }
        }

    /** 把广告隐藏样式（或它的撤销）注进某个 WebView。脚本幂等，重复调用只是改写样式内容。 */
    private fun injectAdBlock(view: WebView) {
        runCatching { view.evaluateJavascript(AdBlocker.injectJs(adBlockEnabled), null) }
    }

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
        val payload = WebThemeEngine.RUNTIME_JS + WebThemeEngine.BG_REPORT_JS +
            // 广告拦截的元素层搭这趟车：注入时机与主题一致
            //（加载早期连环重试 + 加载完成 + SPA 路由 + 主题切换），脚本自身幂等。
            // 注：网页里的视频控件**不再注入**了 —— 那条路受制于 WebView 的合成方式
            //（原生全屏只合成视频画面，DOM 覆盖层不参与），控件怎么改都唤不出来。
            // 现在改成把嗅探到的流交给 App 自己的播放器（见 PlayerScreen）
            AdBlocker.injectJs(adBlockEnabled) + PageVideoDetector.INJECT_JS +
                NavAutoHide.INJECT_JS + MovieMode.INJECT_JS +
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
            // 坞因此跟着滚动量实时收起/展开 —— 不再走 View 那套成批同步的回调。
            // 挂在 document 的**捕获**阶段：滚动事件不冒泡，但捕获路径能拿到 ——
            // 页面把内容装在内部滚动容器里（`#app{overflow:auto}`、弹层自己的滚动区）
            // 时 window 上根本收不到，只挂 window 的话那些页面坞压根不收起。
            // 每个滚动源各自记上次位置（换源时不会因为起点不同被误判成反向）。
            //
            // 过桥的是**整数像素增量**（不是方向）：原生那边拿它推进收起进度，
            // 滚多少收多少。亚像素滚动（有些页面每帧只挪 0.4px）不能因为取整被丢掉，
            // 所以先在页面侧攒够 1px 再报 —— 攒出来的那个整数带上正负号，方向与大小都在。
            "if(!window.__lerxuDockScrollOn){window.__lerxuDockScrollOn=true;var acc=0;" +
            "document.addEventListener('scroll',function(e){" +
            "if(window.__lerxuDockAvoidOff)return;" +
            "var t=e.target||document;" +
            "var y=(t===document||t===window)?(window.scrollY||0):(t.scrollTop||0);" +
            "var prev=t.__lerxuScrollTop;if(prev===undefined){t.__lerxuScrollTop=y;return;}" +
            "t.__lerxuScrollTop=y;acc+=y-prev;" +
            "var st=acc>0?Math.floor(acc):Math.ceil(acc);if(!st)return;acc-=st;" +
            "try{if(typeof LerxuDock!=='undefined'&&LerxuDock)LerxuDock.scroll(st);}catch(e2){}" +
            "},true);}" +
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
        // 坞吸附补间停了：动画器还持有控制器引用（update 监听每帧写状态），收干净再放
        main.removeCallbacks(settleTask)
        cancelSettleAnimation()
        // **两套都要收**：寄存在后台的那一套（进过无痕就会留下）也是活着的 WebView，
        // 只收当前这套的话它们既不 destroy、也一直被 parked*Tabs 引用着 —— 旋转屏幕 /
        // 退出应用时就是几份没释放的 native 资源（还有各自的主题脚本句柄）
        (tabs + parkedNormalTabs + parkedIncognitoTabs).toList().forEach { releaseTab(it) }
        tabs.clear()
        parkedNormalTabs.clear()
        parkedIncognitoTabs.clear()
        tabsOpen = false
    }
}

/** 取 JSON 字符串字段（缺失 / null 都返回空串）。 */
private fun JsonObject.string(key: String): String {
    val value = this[key] as? JsonPrimitive ?: return ""
    if (value is JsonNull) return ""
    return value.content
}
