package com.lerxu.android.ui.screen

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.RectF
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import kotlin.math.abs
import kotlin.math.roundToInt
import androidx.compose.material.icons.filled.Search
import androidx.compose.ui.graphics.SolidColor
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.SideEffect
import com.lerxu.android.browser.BrowserController
import com.lerxu.android.browser.DockFollow
import com.lerxu.android.browser.DownloadHandoff
import com.lerxu.android.browser.SearchEngine
import com.lerxu.android.browser.SearchEngineDetector
import com.lerxu.android.browser.SearchEngines
import com.lerxu.android.browser.SniffedResource
import com.lerxu.android.ui.player.NativePlayerOverlay
import com.lerxu.android.engine.EngineManager
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Tab
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScaffoldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.zIndex
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.boundsInParent
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.foundation.Canvas
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.material.icons.filled.Tab
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.layout.imePadding
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.TextStyle
import com.lerxu.android.R
import com.lerxu.android.data.EngineRepository
import com.lerxu.android.model.TaskInfo
import com.lerxu.android.ui.RoundedProgressBar
import com.lerxu.android.ui.TaskViewModel
import com.lerxu.android.ui.UpdateNoticeCard
import com.lerxu.android.ui.formatBytes
import com.lerxu.android.ui.formatDuration
import com.lerxu.android.ui.formatFinishedTime
import com.lerxu.android.ui.formatSpeed
import com.lerxu.android.ui.statusColor
import com.lerxu.android.update.UpdateManager
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScreen(
    viewModel: TaskViewModel,
    initialIntentData: String? = null,
    /** 外部链接的序号：同一个地址连着进来两次也要各处理一次（见下面的 LaunchedEffect）。 */
    intentTick: Int = 0,
    themePref: String = "system",
    onThemeChange: (String) -> Unit = {}
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    // 窗口根 View 与密度：首页面板要按"像素"算让位高度（网页里的 CSS px ≈ dp），
    // 需要窗口的实际高度来换算
    val rootView = androidx.compose.ui.platform.LocalView.current
    val density = LocalDensity.current
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var showAddTask by remember { mutableStateOf(false) }
    var selectedTaskGid by remember { mutableStateOf<String?>(null) }
    // "待选择文件"任务点击 → 重开文件选择弹窗（区别于普通详情）
    var selectionTaskGid by remember { mutableStateOf<String?>(null) }
    var currentScope by remember { mutableStateOf("all") }
    var selectionMode by remember { mutableStateOf(false) }
    val selectedGids = remember { mutableStateListOf<String>() }
    // 控制栏删除确认态：栏内向上扩展为确认内容，不另弹窗
    var deleteConfirming by remember { mutableStateOf(false) }
    // 任务列表底部预留：普通 0 / 编辑模式 62 / 确认态控制栏更高，平滑过渡
    val listBottomExtra by animateDpAsState(
        targetValue = when {
            deleteConfirming -> 236.dp
            selectionMode -> 62.dp
            // 悬浮坞的高度 + 留白：最后一条任务不能被它压住（坞不占布局高度）
            else -> 62.dp
        },
        animationSpec = tween(220, easing = FastOutSlowInEasing),
        label = "listBottomExtra"
    )
    // 底部导航：任务 / 浏览器 / 设置。浏览器是一等页面，随时可切走再切回
    // （WebView 由 BrowserController 在 Compose 之外持有，切页不重载）。
    // **首次落地页**由「默认入口」决定（引导里选、设置里改）：`rememberSaveable`
    // 只在首次组装时取这个初值 —— 转屏 / 换语言不会把用户从他正在看的页面踢走。
    var page by rememberSaveable {
        mutableStateOf(StartPagePrefs.toAppPage(StartPagePrefs.read(context)))
    }
    // 搜索引擎：首次进入按当前网络自动挑一次，之后一律以用户选择为准
    var searchEngineKey by remember { mutableStateOf(SearchEngineDetector.currentKey(context)) }
    val searchEngine = remember(searchEngineKey) { SearchEngines.byKey(searchEngineKey) }
    val snackbarHostState = remember { SnackbarHostState() }
    val uiScope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val auto = SearchEngineDetector.ensureInitialized(context)
        if (auto != searchEngineKey) searchEngineKey = auto
    }

    /** 交给下载引擎（嗅探条目与下载链接共用）；回执走底部提示条。 */
    fun submitDownload(handoff: DownloadHandoff) {
        uiScope.launch {
            val gid = viewModel.addBrowserDownload(
                uri = handoff.url,
                dir = EngineManager.getDownloadDirSafe(),
                out = handoff.fileName,
                headers = handoff.headers
            )
            val ok = !gid.isNullOrBlank()
            val result = snackbarHostState.showSnackbar(
                message = context.getString(
                    if (ok) R.string.browser_download_sent else R.string.browser_download_failed
                ),
                actionLabel = if (ok) context.getString(R.string.browser_view_tasks) else null,
                // 带 actionLabel 时 showSnackbar 的默认时长是 **Indefinite**：
                // 提示会一直挂在屏幕上，非得点一下"查看任务"才消失（用户点名）。
                // 这里明确给 Short 自动收起，并补一个关闭按钮 —— 想手动关也有路
                withDismissAction = true,
                duration = SnackbarDuration.Short
            )
            if (result == SnackbarResult.ActionPerformed) page = AppPage.Tasks
        }
    }

    // 浏览器回调发生在 Compose 之外，用 ref 把最新闭包递进去
    val submitRef = remember { mutableStateOf<(DownloadHandoff) -> Unit>({}) }
    val browserController = remember {
        BrowserController(context) { handoff -> submitRef.value(handoff) }
    }
    SideEffect { submitRef.value = { submitDownload(it) } }

    // WebView 只在页面真正离开时（Activity 销毁）释放
    DisposableEffect(Unit) {
        onDispose { browserController.onDestroy() }
    }

    // 不在任务页时，系统返回键先回任务页
    BackHandler(enabled = page != AppPage.Tasks) { page = AppPage.Tasks }

    // 底部坞里的地址栏：文本与焦点状态（坞在页面之外常驻，状态也放这里）
    var addressInput by remember { mutableStateOf("") }
    var addressFocused by remember { mutableStateOf(false) }
    // 这一次聚焦是否已经为"点输入框从网页跳搜索页"动过页面（跳一次就够，见下面那个效果）
    var jumpedFromWeb by remember { mutableStateOf(false) }
    // 框里那串字是不是「从网页带过来的当前地址」（不是用户要搜的词）。
    // 只用来决定面板要不要拿它当过滤词，见下面推给首页的 query。
    // **只在用户真的改了字**（onAddressChange）时才解除 —— 不跟着失焦解除：
    // 按住列表向下拖只会收起输入框、面板还开着，这时它仍然是"带过来的地址"
    var addressCarried by remember { mutableStateOf(false) }
    // 坞的浏览器专有设置（长按标签按钮展开的面板）：界面方案 + 液态玻璃，持久化。
    // 界面方案默认**现代**（悬浮渐变 + 滚动收起）；用户在设置面板切回传统后记住选择
    var dockModern by remember {
        mutableStateOf(
            context.getSharedPreferences("lerxu_prefs", android.content.Context.MODE_PRIVATE)
                .getBoolean("dock_modern", true)
        )
    }
    fun setDockModern(value: Boolean) {
        dockModern = value
        context.getSharedPreferences("lerxu_prefs", android.content.Context.MODE_PRIVATE)
            .edit().putBoolean("dock_modern", value).apply()
    }
    // 自动拦截广告：**默认开**（用户点名）。持久化，改了下发给控制器立即生效 ——
    // 同一个开关同时管"拦请求"与"藏广告位"（见 AdBlocker）
    var adBlock by remember {
        mutableStateOf(
            context.getSharedPreferences("lerxu_prefs", android.content.Context.MODE_PRIVATE)
                .getBoolean("ad_block", true)
        )
    }
    fun setAdBlock(value: Boolean) {
        adBlock = value
        context.getSharedPreferences("lerxu_prefs", android.content.Context.MODE_PRIVATE)
            .edit().putBoolean("ad_block", value).apply()
    }
    val dockUiScope = rememberCoroutineScope()
    // 底部嗅探面板是否展开（只在浏览器页有效）
    var sniffOpen by remember { mutableStateOf(false) }
    // 原生播放器当前在播的那条资源（null = 没在播）。点「本页资源」里的一条就设它，
    // 播放页盖在整个界面之上（见文件末尾）
    var playing by remember { mutableStateOf<SniffedResource?>(null) }

    // 网页里**开始播视频** → App 接管：直接开原生播放器（见 PageVideoDetector）。
    // 这是"换成我们的播放器"那条路的主入口 —— 用户不必先点「本页资源」。
    // 请求是一次性的，消费完立刻清掉，否则下一次起播会被误判成"已在接管"
    LaunchedEffect(browserController.nativePlayRequest) {
        browserController.nativePlayRequest?.let { item ->
            playing = item
            sniffOpen = false
            browserController.clearNativePlayRequest()
        }
    }
    val addressFocusRequester = remember { FocusRequester() }
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val focusManager = androidx.compose.ui.platform.LocalFocusManager.current
    val isDarkTheme = when (themePref) {
        "dark" -> true
        "light" -> false
        else -> androidx.compose.foundation.isSystemInDarkTheme()
    }

    // 地址栏跟随页面；正在输入时不打断。首页在**搜索页收起后**才清空 ——
    // 搜索页还开着时（比如按住列表向下拖把输入框收起来了）要留着那串字，
    // 不然列表按输入过滤、框里却空了
    //
    // 框里显示的是**处理过的地址**，不是原始 URL（用户点名）：去掉协议、去掉开头的
    // `www.`、去掉末尾斜杠 —— 与标签卡副标题同一套规则（见 TabNaming.subtitle）。
    // 坞里输入框只有那么宽，原始链接一长就被截掉尾巴，读不出"这是哪个站"。
    // 它仍然是一条能开回来的地址：按回车时 BrowserUrl.toUrl 会把裸域名补回 `https://`
    //（这两条必须一直成立，BrowserRulesTest 里有对拍）
    LaunchedEffect(
        browserController.currentUrl,
        browserController.isHomePage,
        addressFocused,
        browserController.homePanelsOpen
    ) {
        if (!addressFocused && !browserController.homePanelsOpen) {
            addressInput = if (browserController.isHomePage) {
                ""
            } else {
                // "原始内容"：搜索来的显示搜索词、导航来的显示页面地址（见控制器
                // addressEditText）—— 展示态看到的是网页名，这串字是点开编辑时用的
                browserController.addressEditText
            }
        }
    }

    // 底部地址栏聚焦 = 进入「搜索页」（搜索建议 + 历史）。
    // **浏览网页时点输入框也一样**（用户点名）：先把自家首页载进当前标签。
    // 这一趟首页是"过路"的（keepHistory）—— 不清历史，用户正看的那页留着，
    // 系统返回键 / 左滑返回都能退回它，不丢上下文。
    // 首页载完 `isHomePage` 翻真，本效果会再跑一次，那时才真正把面板推下去。
    // **只在聚焦时打开** —— 搜索页的关闭归左上角返回键 / 导航 / 离开浏览器页管，
    // 否则"按住列表向下拖收起输入框"会连带把搜索页关掉（用户要的是留着）
    LaunchedEffect(browserController.isHomePage, addressFocused) {
        if (!addressFocused) {
            // 松手就复位：下一次聚焦又是全新一次"进搜索页"
            jumpedFromWeb = false
            return@LaunchedEffect
        }
        if (!browserController.isHomePage && !jumpedFromWeb) {
            // 标记**这一次聚焦已经跳过了**：返回上一页时 `isHomePage` 会翻假，
            // 本效果跟着重跑 —— 不设这道闸就会立刻又被弹回搜索页，用户再也退不出去
            jumpedFromWeb = true
            // 框里那串字**留着**（用户点名）：在网页上点一下地址栏，手上这页的地址
            // 应该还摆在那儿等着被改，而不是先被清空。
            //
            // 它同时被标成"带过来的" —— 面板此时**不拿它当输入去过滤**（见下面推
            // query 那一段）：否则"最近访问""搜索历史"被这串地址一筛就只剩它自己，
            // 用户要的"搜索页"就空掉了。用户动了字才算数
            addressCarried = true
            // 框里那串字换成"原始内容"：**搜索来的显示搜索词**（用户点名：在搜索结果页
            // 点输入框，要看到自己搜的那串内容）、导航来的显示这页的地址简写。
            // 这里**直接覆盖**（不再只在空的时候填）：搜索后框里本来摆着结果页的 URL，
            // 不换的话点开还是那串搜索结果地址，用户根本认不出自己在搜什么。
            // 顺带兜住"页面加载完之前就点了输入框"那一下空档
            addressInput = browserController.addressEditText
            browserController.loadHome(keepHistory = true)
        }
        browserController.setHomePanels(true)
    }
    // 离开搜索页（返回上一页 / 点了建议去结果页）就把输入框收起来：
    // 焦点留着的话键盘会压在新页面上，而且要再想搜一次就得先手点一次空白处收键盘
    LaunchedEffect(browserController.isHomePage) {
        if (!browserController.isHomePage) {
            // 面板只属于自家首页，离开就一起收掉。这一步不是多余的：后退若命中
            // WebView 的后退缓存，`onPageStarted` 可能根本不触发，收尾只剩这里
            browserController.closeHomePanels()
            if (addressFocused) {
                addressFocused = false
                focusManager.clearFocus()
                keyboard?.hide()
            }
        }
    }
    // 框里的输入推给首页当过滤词。**从网页带过来的那串地址不算输入** ——
    // 它只是"手上这页的地址"，拿去过滤只会把两条列表筛空（用户要的是搜索建议 + 历史）。
    // `addressCarried` 也当 key：它是在同一帧里由上面那个效果翻真的，
    // 不当 key 就得指望效果之间的执行顺序，写进来才是确定的一遍
    LaunchedEffect(addressInput, addressFocused, addressCarried) {
        if (addressFocused) {
            browserController.setHomeQuery(if (addressCarried) "" else addressInput)
        }
    }
    // 面板里点了建议 / 历史：网页已经接管这次导航，地址栏该收起来了
    //（不然键盘一直压着新页面，框里还留着上一串输入）
    LaunchedEffect(browserController.addressBlurTick) {
        if (browserController.addressBlurTick > 0) {
            addressFocused = false
            focusManager.clearFocus()
            keyboard?.hide()
        }
    }

    // 用户**手动**收起系统输入法（返回键 / 返回手势）时，输入框本身还持着焦点 ——
    // 于是输入框下方那条「常用前缀」一直挂在那里，得再点一次空背景才收（用户点名）。
    // 这里把"输入法正在收起"直接当成一次「收起输入框」：清焦点，前缀条与让位的
    // 左右按钮随之回位，与拖拽收起（HomeBridge.collapseInput）同一条语义。
    //
    // 判据是"**变矮**"而不是"归零"：`ime` 内边距是跟着键盘动画逐帧变的，等它回到 0
    // 已经是动画末尾 —— 前缀条要再等两三百毫秒才动，读起来就是"延迟一会才消失"。
    // 一发现明显矮于刚才的高度就动手，收起动作与键盘同步。
    //
    // 用 0.5 这个比例而不是"任意下降"：键盘弹出过程本身可能有小幅回弹，切到
    // 单手键盘也会矮掉一截 —— 挑一个"只可能是收起"的落差（矮到不足一半）才不会被误判。
    // 收起动画走到一半就命中，前缀条与键盘同步收回，不再"延迟一会才消失"
    //
    // 比例之外还要看**方向**：只有"键盘正在长高时"到过的高度才算证据（见下面 peak）。
    // 少了这一条，快速连点输入框会把上一轮键盘的收尾动画误判成"用户收起键盘"，
    // 刚弹出来的键盘立刻又被关掉（用户点名）
    //
    // `WindowInsets.ime` 是 @Composable 取值，进不了 snapshotFlow 的 lambda，
    // 所以每帧先在组合里量出来、装进 rememberUpdatedState 供那个常驻协程读
    val imeBottomNow = androidx.compose.runtime.rememberUpdatedState(
        WindowInsets.ime.asPaddingValues().calculateBottomPadding().value
    )
    LaunchedEffect(Unit) {
        // `peak` = "键盘确实打开过"的证据高度，**只在键盘正在长高时记录**；
        // `last` = 上一帧的高度，用来判方向
        var peak = 0f
        var last = -1f
        snapshotFlow { addressFocused to imeBottomNow.value }.collect { (focused, h) ->
            if (!focused) {
                peak = 0f
                last = -1f
                return@collect
            }
            // 只在"键盘正在长高"时记峰值。**快速连点就会踩到这里**：上一次键盘还在
            // 收起动画里（h 从高位往下走）时又点了一下输入框，若把那种高度记成峰值，
            // 等这轮收尾动画走到一半就会被判成"用户在收起键盘" —— 于是刚弹出来的
            // 键盘立刻被清焦点关掉（用户点名的现象）。往下走的高度只说明"上一轮还没收完"，
            // 不是"键盘已经打开"，不该作数
            if (h > last) peak = h
            last = h
            // 从"明显打开过"的高度掉到不足一半：这才是用户把键盘收起来了。
            // 与键盘同步动手，不等它归零（归零已是动画末尾，前缀条要晚两三百毫秒才收）
            if (peak > 0f && h < peak * 0.5f) {
                peak = 0f
                last = -1f
                addressFocused = false
                focusManager.clearFocus()
            }
        }
    }

    // 首页脚本要用的引擎 / 主题 / 语言（含 WebView 底色），以及标签点选的回调，
    // 每次重组同步一次 —— 值没变时控制器内部不会重复推送
    val themeBackgroundArgb = MaterialTheme.colorScheme.background.toArgb()
    // 首页色板：把应用主题色按 browser-home.html 的 CSS 变量顺序注入页面，
    // 让搜索首页跟随应用主题（含自定义主色 / 动态取色），不再是固定配色
    val homeColors = with(MaterialTheme.colorScheme) {
        listOf(background, surfaceContainerHigh, outlineVariant, onSurface, onSurfaceVariant, primary)
            .joinToString(",") { "#%06X".format(it.toArgb() and 0xFFFFFF) }
    }
    SideEffect {
        browserController.engine = searchEngine
        browserController.homeDark = isDarkTheme
        browserController.themeBackground = themeBackgroundArgb
        browserController.homeColors = homeColors
        browserController.homeLang = if (java.util.Locale.getDefault().language == "en") "en" else "zh"
        browserController.dockModern = dockModern
        browserController.adBlockEnabled = adBlock
        // 聚焦态同步给控制器：网页滚动回传要据此闭嘴（见 DockBridge.scroll），
        // 同时把网页的"触摸抢焦点"关掉 —— 否则快速连点时第二下落在网页上，
        // 焦点被抢走、键盘刚弹出来就被关掉（见 setDockInputFocused）
        browserController.setDockInputFocused(addressFocused)
        // 关掉最后一个标签页 = 退出浏览器
        browserController.onAllTabsClosed = { page = AppPage.Tasks }
    }

    // 离开浏览器页就解除收起态：回到任务页/设置页时坞必须完整。
    // 同时把"坞在不在场上"关掉 —— 设置页压根不渲染坞，而这个标记是网页那边
    // 决定要不要跟手收起的依据（网页即使没显示也可能在自动滚动）
    LaunchedEffect(page) {
        browserController.dockEngaged = page == AppPage.Browser
        if (page != AppPage.Browser) browserController.expandDock()
    }

    // 「本页资源」弹窗依附当前标签页，并且依赖那枚资源按钮当锚点：
    // 离开浏览器页、换标签、或地址栏被聚焦（按钮随之让位）时都收起
    LaunchedEffect(page, browserController.activeId, addressFocused) {
        if (page != AppPage.Browser || addressFocused) sniffOpen = false
    }

    // 本页一条资源都没有时（还没嗅到 / 换页被清空 / 用户点了清空）：弹窗自己收起来。
    // 没有内容还留一块空面板、还占着按钮位，没有意义（用户点名）
    LaunchedEffect(browserController.activeId, browserController.sniffed.size) {
        if (browserController.sniffed.isEmpty()) sniffOpen = false
    }

    // 离开浏览器页时清掉地址栏聚焦态：坞换成按钮形态后不再有失焦回调，
    // 这个状态得手动归位，否则回来时「返回下载器」与侧按钮都起不来
    LaunchedEffect(page) {
        if (page != AppPage.Browser) {
            addressFocused = false
            // 首页面板是"聚焦才有"的东西，离开浏览器就一起收掉
            browserController.closeHomePanels()
        }
    }

    // 进浏览器页：**开一张新标签**（不落在上次恢复出来、没有历史的那一页上，
    // 否则"返回"根本退不了 —— 用户点名），再把首页备好。**不自动聚焦地址栏、
    // 不弹键盘**：用户大多接着看网页，凭空弹键盘会挡掉大半屏（用户点名）。
    // 开新标签每次进程只做一次，且当前就是空白页/首页时会复用（见控制器）。
    LaunchedEffect(page) {
        if (page == AppPage.Browser) {
            browserController.openNewTabOnBrowserEntry()
            browserController.ensureHomeLoaded()
        }
    }
    // 排序方式：持久化到偏好，格式 "<字段>_<方向>"，如 "finished_at_desc"；旧版本 key 自动回退默认
    var sortBy by remember {
        val validKeys = listOf("finished_at", "remaining", "speed", "size")
            .flatMap { listOf("${it}_asc", "${it}_desc") }.toSet()
        val stored = context.getSharedPreferences("lerxu_prefs", android.content.Context.MODE_PRIVATE)
            .getString("sort_order", null)
        mutableStateOf(if (stored != null && stored in validKeys) stored else "finished_at_desc")
    }
    var pendingDeleteGids by remember { mutableStateOf<List<String>?>(null) }
    var searchQuery by remember { mutableStateOf("") }

    // 应用内更新提示：UpdateManager 发现新版本时发到 availableUpdate，
    // 这里以底部悬浮卡片展示（系统通知同时保留，互为补充）
    val availableUpdate by UpdateManager.availableUpdate.collectAsStateWithLifecycle()
    val updateDownloadState by UpdateManager.downloadState.collectAsStateWithLifecycle()

    // 列表按所选方式排序；完成时间未知（0）的任务始终沉底
    val displayTasks = remember(state.tasks, sortBy, searchQuery) {
        val (field, ascending) = sortBy.split("_asc", "_desc").let { parts ->
            parts[0] to sortBy.endsWith("_asc")
        }
        val key: (TaskInfo) -> Long = when (field) {
            "finished_at" -> { t -> t.finishedAt }
            "remaining" -> { t -> t.remainingSeconds.let { if (it < 0) Long.MAX_VALUE else it } }
            "speed" -> { t -> t.downloadSpeed }
            "size" -> { t -> t.totalLength }
            else -> { t -> t.finishedAt }
        }
        val sorted = if (ascending) {
            state.tasks.sortedBy(key)
        } else {
            state.tasks.sortedByDescending(key)
        }
        // 实时搜索：每输入一个字符即按任务名过滤（不区分大小写）
        val searched = if (searchQuery.isBlank()) sorted
        else sorted.filter { it.fileName.contains(searchQuery.trim(), ignoreCase = true) }
        if (field == "finished_at") {
            // finishedAt == 0 表示未知完成时间，无论升降序都排到最后
            searched.partition { it.finishedAt > 0 }.let { (known, unknown) -> known + unknown }
        } else searched
    }

    // 处理外部 Intent 带来的链接：**先分清是哪种链接**（用户点名）。
    //  · 下载链接（magnet / ed2k / 迅雷 / 扩展名在白名单里）→ 交给下载器（预填添加任务）
    //  · 网页链接 → 直接用浏览器打开（新标签），不再一律弹"添加任务"对话框
    //
    // key 里带上 [intentTick]：应用已经活着时从别的 App 分享进来，地址可能与上一次
    // 完全相同 —— 只按值做 key 的话那次分享不会重启这个副作用，读起来就是"没反应"
    LaunchedEffect(initialIntentData, intentTick) {
        val data = initialIntentData?.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        if (com.lerxu.android.browser.VideoSniffer.isDownloadLink(data)) {
            if (state.connected) showAddTask = true
        } else {
            browserController.openExternal(data)
            page = AppPage.Browser
        }
    }

    // 坞：设置页不渲染。
    // 另外两种"要让位"的情况：浏览器页展开标签网格（网格要盖满整屏）、
    // 任务页进入编辑模式（底部那条选择控制栏在坞下面，现在是悬浮层会压住它）
    val dockPresent = page != AppPage.Settings
    val dockOpaque = !(page == AppPage.Browser && browserController.tabsOpen) &&
        !(page == AppPage.Tasks && (selectionMode || deleteConfirming))

    /**
     * 顶栏的**实测高度**（含它自带的状态栏内边距）。
     *
     * 顶栏只在非浏览器页存在，但这个值必须**跨页面切换保持住**：Scaffold 的
     * contentPadding 是按"当前有没有顶栏"算的 —— 顶栏一消失就缩回系统栏高度，
     * 正在滑出的那一侧会被连带跳一下。记住实测值，切换期间两边的上边距都不再变。
     *（浏览器页那个"居中的 logo 来回跳"就是同一根因的另一半，见下面 windowTopInset。）
     */
    var topBarInset by remember { mutableStateOf(0.dp) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = {
            // 坞是悬浮的：提示条要抬到它上面，别被压住
            SnackbarHost(
                snackbarHostState,
                modifier = Modifier.padding(
                    bottom = if (dockPresent && dockOpaque) 64.dp else 0.dp
                )
            )
        },
        topBar = {
            // 浏览器页自带地址栏，不共用顶栏
            if (page != AppPage.Browser) {
                // 量一次高度记下来（见 topBarInset 的说明）：顶栏消失之后任务 /
                // 设置页仍要用这个值，不能让 contentPadding 缩回去
                val density = LocalDensity.current
                Box(
                    modifier = Modifier.onGloballyPositioned { coords ->
                        val h = with(density) { coords.size.height.toDp() }
                        if (h > 0.dp) topBarInset = h
                    }
                ) {
                    LerxuTopBar(
                        state = state,
                        connected = state.connected,
                        page = page,
                        onOpenSettings = {
                            // 进设置前退出编辑模式，避免残留选中状态
                            selectionMode = false
                            selectedGids.clear()
                            page = AppPage.Settings
                        },
                        onBackToTasks = { page = AppPage.Tasks },
                        sortBy = sortBy,
                        onSelectSort = { key ->
                            sortBy = key
                            context.getSharedPreferences("lerxu_prefs", android.content.Context.MODE_PRIVATE)
                                .edit().putString("sort_order", key).apply()
                        },
                        onAddTask = { showAddTask = true }
                    )
                }
            }
        },
    ) { padding ->
        // 内容一直铺到屏幕底：底部不预留空间，坞与渐变是悬浮在内容之上的
        Box(modifier = Modifier.fillMaxSize()) {
        val navBottom = WindowInsets.navigationBars.asPaddingValues()
            .calculateBottomPadding()
        /**
         * 浏览器页的网页上边距 = **系统栏（状态栏）那一截**，且必须与"当前在哪一页"无关。
         *
         * 不能读 Scaffold 的 contentPadding：它是按"当前有没有顶栏"算的 —— 顶栏一消失
         * 就从"顶栏高度"缩回系统栏高度。正在滑出的浏览器页读到的就是缩回后的值，
         * WebView 的顶边被推下去 64dp、高度同时变矮，首页里居中的 logo 于是猛地一跳
         *（用户点名："返回下载器时 logo 来回跳"）。这里直接读 Scaffold 在**没有顶栏时**
         * 用的那套内边距，页面切换期间恒定不变。
         */
        val windowTopInset = ScaffoldDefaults.contentWindowInsets
            .asPaddingValues().calculateTopPadding()
        /**
         * 任务 / 设置页反过来要的是**顶栏高度**，同样得是个定值：否则切去浏览器时
         * 顶栏消失，正在滑出的任务列表会整体往上一跳（同一个根因的另一半）。
         * 顶栏还没量到（首帧）才退回 Scaffold 的当前值。
         */
        val topInsetWithBar = if (topBarInset > 0.dp) topBarInset else padding.calculateTopPadding()
        // 页面切换的位移量：**在可组合作用域里先算好**（transitionSpec 那个 lambda
        // 不是可组合上下文，读不了 LocalDensity）。
        //
        // 取**坞的高度 + 它的下边留白**，而不是"1/4 屏"：坞就在底部、锚点是它，
        // 位移量跟坞对齐，读起来才是"整页从控制栏里长出来 / 收回到控制栏里"。
        // 位移一大（1/4 屏 ≈ 200px）就变成两块内容互相推，跟坞自身那条
        // 34% → 100% 的形变脱节，反而不连贯。
        val pageSlideDist = with(LocalDensity.current) { (DOCK_HEIGHT + 10.dp).roundToPx() }
        AnimatedContent(
            targetState = page,
            // 容器**不给顶部内边距**：让出状态栏这件事由各个页面自己带 ——
            // 浏览器页内部只让网页内容让位、标签网格照样铺到顶；任务页 / 设置页
            // 在各自分支里加。写在容器上的话，page 一切换这个值就瞬间跳变，
            // 正在滑出 / 滑入的内容会被连带闪跳一下（用户点名的"来回跳"）。
            modifier = Modifier.fillMaxSize(),
            transitionSpec = {
                if (targetState == AppPage.Browser || initialState == AppPage.Browser) {
                    // 下载器 ⇄ 浏览器：**进出两页共用一套动画、一条时间线**，
                    // 形变原点锚在**底部中央**（坞那枚浏览器按钮所在的位置）——
                    // 进来的一页从下方 `pageSlideDist` 处升起来 + 从 0.96 放大 + 淡入，
                    // 出去的一页沉回控制栏 + 收回成 0.94 + 淡出。
                    //
                    // 时间线跟坞的形变**完全一致**（340ms + FastOutSlowIn）：坞那条
                    // 34% → 100% 的胶囊长成整条控制栏，和整页的升起来是同一个动作，
                    // 谁也不会"先出现、后到位"（用户点名：控制栏都出来了，链接输入框
                    // 才开始动 —— 那一条的根因在 DockAddressContent 的宽度推导，
                    // 这里把两边的时长对齐，剩下的交给同一条曲线收尾）。
                    //
                    // 关键：位移与缩放**必须同向**（都在"往上长 / 往下收"）——
                    // 若滑入向上而缩放缩小，用户会看到内容先缩再走，产生两次位移错觉。
                    // 两个方向因此共用同一套（不再按 goingToBrowser 分叉）：
                    // 对坞来说"进"和"出"本来就是同一个动作的正反播放。
                    val slideSpec = tween<IntOffset>(340, easing = FastOutSlowInEasing)
                    val scaleSpec = tween<Float>(340, easing = FastOutSlowInEasing)
                    val fadeSpec = tween<Float>(240, easing = FastOutSlowInEasing)
                    val origin = TransformOrigin(0.5f, 1f)

                    (
                        // 进场：从控制栏里升起来（下方 +d → 0），同时放大 + 淡入
                        slideInVertically(slideSpec) { pageSlideDist } +
                            scaleIn(scaleSpec, initialScale = 0.96f, transformOrigin = origin) +
                            fadeIn(fadeSpec)
                        ) togetherWith (
                        // 出场：沉回控制栏（0 → 下方 +d），同时收小 + 淡出
                        slideOutVertically(slideSpec) { pageSlideDist } +
                            scaleOut(scaleSpec, targetScale = 0.94f, transformOrigin = origin) +
                            fadeOut(fadeSpec)
                        )
                } else {
                    // 任务 ↔ 设置：小幅交叉滑动 + 淡入淡出，方向感保留但幅度收敛
                    val dir = if (targetState.ordinal > initialState.ordinal) 1 else -1
                    (slideInHorizontally(tween(260, easing = FastOutSlowInEasing)) { dir * it / 8 } +
                        fadeIn(tween(220))) togetherWith
                        (slideOutHorizontally(tween(260, easing = FastOutSlowInEasing)) { -dir * it / 8 } +
                            fadeOut(tween(200)))
                }
            },
            label = "appPageSwitch"
        ) { current ->
            when (current) {
                AppPage.Browser -> BrowserScreen(
                    controller = browserController,
                    onExitBrowser = { page = AppPage.Tasks },
                    onHandoff = { handoff -> submitDownload(handoff) },
                    // 网页底边：现代模式铺到屏幕底（这个值用不到），传统模式**正好落在
                    // 控制栏上沿** —— 控制栏自己是贴底的一整条（高 `TRADITIONAL_DOCK_HEIGHT`
                    // + 导航条那一截），网页再多留 10dp 只会在两者之间露出一条空白底色
                    //（用户：可显示范围有点少、控制栏上方有一条缝隙）
                    bottomInset = navBottom + if (dockModern) {
                        DOCK_HEIGHT + 10.dp
                    } else {
                        TRADITIONAL_DOCK_HEIGHT
                    },
                    modern = dockModern,
                    topInset = windowTopInset,
                    // 影视模式：识别到影视内容后自动开（见 MovieMode），这一页改用自家
                    // 的影视页整屏呈现；点列表里的一条就走 App 自己的播放器
                    movieMode = browserController.movieMode,
                    onPlayMovie = { item -> playing = item }
                )

                AppPage.Settings -> Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = topInsetWithBar)
                ) {
                    SettingsScreen(
                        viewModel = viewModel,
                        engineVersion = state.engineVersion,
                        themePref = themePref,
                        onThemeChange = onThemeChange,
                        searchEngineKey = searchEngineKey,
                        onSearchEngineChange = { key -> searchEngineKey = key },
                        adBlock = adBlock,
                        onAdBlockChange = { setAdBlock(it) }
                    )
                }

                AppPage.Tasks -> Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = topInsetWithBar)
                ) {
                // 搜索展开状态：用于"点击任意处收起"遮罩与返回键处理
                var searchExpanded by remember { mutableStateOf(false) }
                // 搜索框焦点状态：决定点空白是收键盘还是收搜索框、✕ 是清空还是关闭
                var searchFocused by remember { mutableStateOf(false) }
                val searchFocusManager = androidx.compose.ui.platform.LocalFocusManager.current
            if (state.connected) {
                ScopeFilterRow(
                    currentScope = currentScope,
                    counts = state.scopeCounts,
                    searchQuery = searchQuery,
                    onSearchQueryChange = { searchQuery = it },
                    onSelect = {
                        currentScope = it
                        viewModel.setScope(it)
                    },
                    expanded = searchExpanded,
                    onExpand = { searchExpanded = true },
                    onCollapse = {
                        searchExpanded = false
                        searchQuery = ""
                    },
                    searchFocused = searchFocused,
                    onSearchFocusChange = { searchFocused = it }
                )
            }

            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    state.error != null && !state.connected -> {
                        EngineErrorScreen(
                            error = state.error!!,
                            onRetry = { viewModel.clearErrorAndRetry() }
                        )
                    }
                    state.tasks.isEmpty() && !state.loading -> {
                        EmptyState()
                    }
                    else -> {
                        val navBottom = WindowInsets.navigationBars.asPaddingValues()
                        TaskList(
                            tasks = displayTasks,
                            selectionMode = selectionMode,
                            selectedGids = selectedGids,
                            onTaskClick = { gid ->
                                val t = state.tasks.find { it.gid == gid }
                                if (t?.awaitingSelection == true) selectionTaskGid = gid
                                else selectedTaskGid = gid
                            },
                            onToggleStatus = { gid ->
                                state.tasks.find { it.gid == gid }?.let { task ->
                                    when (task.status) {
                                        "complete", "seeding" -> openTaskFile(context, task)
                                        "active", "waiting", "seeding" -> viewModel.pauseTask(gid)
                                        "paused" -> viewModel.resumeTask(gid)
                                    }
                                }
                            },
                            onToggleSelect = { gid ->
                                if (selectedGids.contains(gid)) selectedGids.remove(gid)
                                else selectedGids.add(gid)
                            },
                            onDeleteTask = { gid -> pendingDeleteGids = listOf(gid) },
                            onEnterSelection = { gid ->
                                selectionMode = true
                                selectedGids.add(gid)
                            },
                            bottomPadding = navBottom.calculateBottomPadding() + 12.dp +
                                listBottomExtra
                        )
                    }
                }

                // 编辑模式：底部向上滑入的圆角悬浮控制栏
                Box(modifier = Modifier.align(Alignment.BottomCenter)) {
                    SelectionBarOverlay(
                        visible = selectionMode,
                        count = selectedGids.size,
                        allSelected = state.tasks.isNotEmpty() && selectedGids.size >= state.tasks.size,
                        confirming = deleteConfirming,
                        onClose = {
                            selectionMode = false
                            selectedGids.clear()
                            deleteConfirming = false
                        },
                        onToggleSelectAll = {
                            if (state.tasks.isNotEmpty() && selectedGids.size >= state.tasks.size) {
                                selectedGids.clear()
                            } else {
                                selectedGids.clear()
                                selectedGids.addAll(state.tasks.map { it.gid })
                            }
                        },
                        // 删除：不弹窗，控制栏自身向上扩展为确认内容
                        onRequestConfirm = {
                            if (selectedGids.isNotEmpty()) deleteConfirming = true
                        },
                        onCancelConfirm = { deleteConfirming = false },
                        onConfirmDelete = { deleteFiles ->
                            selectedGids.toList().forEach { viewModel.removeTask(it, deleteFiles) }
                            deleteConfirming = false
                            selectionMode = false
                            selectedGids.clear()
                        }
                    )
                }

                // 搜索展开时的内容区拦截层：
                // - 无内容：点击任意处收起搜索框
                // - 有内容且焦点在搜索框（键盘开着）：点击空白只收起键盘，保留搜索
                // - 有内容且焦点已移开：不拦截，正常点击任务列表
                if (searchExpanded && (searchQuery.isEmpty() || searchFocused)) {
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .zIndex(3f)
                            .pointerInput(Unit) {
                                detectTapGestures {
                                    if (searchQuery.isEmpty()) {
                                        searchExpanded = false
                                        searchQuery = ""
                                    } else {
                                        searchFocusManager.clearFocus()
                                    }
                                }
                            }
                    )
                }
            }
                }
            }
        }

            // ── 底部底色：盖住坞所在的整条位置 ──
            // 下载器页（任务页）：渐变淡出，让内容自然过渡到坞的位置
            // 浏览器页：传统模式纯色底（与页面浑然一体）；
            // **现代模式是半透明阴影** —— 全程不落到 100% 不透明，
            // 网页内容始终能从底部透出来，读起来是一层投影而不是色块
            // 网页里有"贴底整宽弹窗"时，坞会抬到它上面（见 BrowserDock 的 overlayLift），
            // 而这条底部渐变是压在坞身后的：让它跟着淡掉，别把人家整条弹窗压暗 ——
            // 整屏覆盖型（overlayAll）更要把这一条收干净
            val overlayPresent = dockModern &&
                (browserController.bottomOverlayPx > 0 || browserController.bottomOverlayAll)
            val dockScrim by animateFloatAsState(
                targetValue = if (dockPresent && dockOpaque && !overlayPresent) 1f else 0f,
                animationSpec = tween(220, easing = FastOutSlowInEasing),
                label = "dockScrim"
            )
            val onBrowserPage = page == AppPage.Browser
            // 传统模式的浏览器工具栏自己是**贴边、贴底、不透明**的整条，不需要再垫一条
            // 底色（垫了反而会在工具栏上方多出一条色带，压住网页内容）
            val dockedBar = onBrowserPage && !dockModern
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(if (dockedBar) 0.dp else navBottom + DOCK_BOTTOM_BAND)
                    .alpha(dockScrim)
                    .then(
                        when {
                            onBrowserPage && !dockModern ->
                                Modifier.background(MaterialTheme.colorScheme.background)
                            onBrowserPage && dockModern -> Modifier.background(
                                Brush.verticalGradient(
                                    0f to Color.Transparent,
                                    0.55f to MaterialTheme.colorScheme.background.copy(alpha = 0.45f),
                                    1f to MaterialTheme.colorScheme.background.copy(alpha = 0.75f)
                                )
                            )
                            else -> Modifier.background(
                                Brush.verticalGradient(
                                    0f to Color.Transparent,
                                    0.45f to MaterialTheme.colorScheme.background.copy(alpha = 0.85f),
                                    1f to MaterialTheme.colorScheme.background
                                )
                            )
                        }
                    )
            )

            // ── 底部坞 + 本页资源弹窗 ──
            // 弹窗**浮在坞的上方**（排在坞之前），坞原地不动 —— 上一版是"面板在坞
            // 下方、把坞顶上去"的底部抽屉，用户改成局部弹窗后这条路不再需要
            if (dockPresent) {
                val shelfOpen = page == AppPage.Browser && sniffOpen && dockOpaque
                // 坞始终让出导航条：它一直是贴底的那一层（弹窗不再占用底部）
                val dockBottom = navBottom + 4.dp
                // 键盘**只在地址栏聚焦时**把坞顶起来：网页里的输入框、首页搜索框
                // 弹出的输入法不该连带把控制栏抬走。
                // 这里刻意**不加动画**：WindowInsets.ime 本身就跟着输入法逐帧变化，
                // 再叠一层补间只会让坞慢半拍地"追"键盘。
                val imeBottom = WindowInsets.ime.asPaddingValues().calculateBottomPadding()
                val imeLift = if (addressFocused) {
                    (imeBottom - navBottom).coerceAtLeast(0.dp)
                } else {
                    0.dp
                }
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(bottom = imeLift)
                ) {
                    // 返回下载器：纯文字 + 图标，浮在控制栏上方。
                    // **严格限定只在自家首页出现** —— 之前用"排除搜索结果页"
                    // 的写法，任何没匹配上的网页（重定向、换域名）都会漏出来
                    // 一个返回按钮，语义也不清；其余页面的退出走系统返回键。
                    // 首页内再让位给：地址栏聚焦（此时首页会切成建议 / 历史视图）、
                    // 提交后导航未开始、标签网格展开。
                    val backToShow = page == AppPage.Browser && dockOpaque &&
                        browserController.isHomePage &&
                        !addressFocused && !browserController.homePanelsOpen &&
                        !browserController.navSubmitting &&
                        !browserController.tabsOpen
                    AnimatedVisibility(
                        visible = backToShow,
                        enter = fadeIn(tween(260)) + slideInVertically(tween(260)) { it / 2 },
                        exit = fadeOut(tween(200)) + slideOutVertically(tween(200)) { it / 2 }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { page = AppPage.Tasks }
                                .padding(vertical = 7.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Download,
                                contentDescription = null,
                                modifier = Modifier.size(15.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                stringResource(R.string.browser_back_downloader),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    // 「本页资源」弹窗**排在坞之前**：这一列是贴底对齐的，面板因此长在
                    // 坞的上方，坞原地不动（用户点名：不再把控制栏顶上去）。
                    // 它自己那套"从资源按钮向上移动放大 / 收起缩回按钮"的动效在 SniffPopup 内
                    SniffPopup(
                        open = shelfOpen,
                        items = browserController.sniffed,
                        onPlay = { item ->
                            // 交给 App 自己的播放器（见 PlayerScreen）：控件、全屏、
                            // 手势都归我们，不再受 WebView 怎么合成页面的影响
                            playing = item
                            sniffOpen = false
                        },
                        onDownload = { item ->
                            browserController.handoff(item)
                            browserController.dismiss(item.url)
                        },
                        onDismissItem = { item -> browserController.dismiss(item.url) },
                        onClear = { browserController.clearSniffed() }
                    )
                    BrowserDock(
                        mode = if (page == AppPage.Browser) DockMode.Address else DockMode.Launch,
                        visible = dockOpaque,
                        addressFocused = addressFocused,
                        modern = dockModern,
                        onModernChange = ::setDockModern,
                        onBounds = {
                            // 坞悬浮在网页之上：抓标签页缩略图时这一段要排掉
                            //（不排，卡片上会烙一条控制栏），见 captureThumbnail
                            browserController.dockOcclusionTopPx = it.top.roundToInt()
                            // 首页面板的底部让位 = **网页可视底边到坞顶**的距离，
                            // 两端都实测：坞顶会随聚焦、展开引擎框、键盘抬起而变，
                            // 所以量出来而不是写死常量。
                            //
                            // 网页底边按"首页那一档"算（见 BrowserScreen 的
                            // webBottomInset）：首页的输入框在坞里、页面内没有输入框，
                            // 网页**不为输入法缩高** —— 键盘抬起时坞自己上移，网页底边
                            // 没动，再减一次键盘高度会把整条列表顶到半屏以上。
                            // 单位：这里算出来的是 dp，而首页页面里的 1px 就是 1dp
                            //（WebView 初始缩放为 1、devicePixelRatio = 屏幕密度），
                            // 所以直接下发，不要再 roundToPx（那是设备像素，会放大
                            // 一个密度倍数，同样把列表顶飞）。
                            if (it.height > 0f) {
                                val winHeight = with(density) { rootView.height.toDp() }
                                val dockTop = with(density) { it.top.toDp() }
                                val pageBottomInset = if (dockModern) {
                                    0.dp
                                } else {
                                    navBottom + TRADITIONAL_DOCK_HEIGHT
                                }
                                val reserve = (winHeight - pageBottomInset - dockTop)
                                    .coerceAtLeast(0.dp)
                                browserController.setHomePanelBottom(reserve.value.roundToInt())
                            }
                        },
                        onAddressCopied = {
                            dockUiScope.launch {
                                snackbarHostState.showSnackbar(
                                    context.getString(R.string.browser_link_copied)
                                )
                            }
                        },
                        controller = browserController,
                        addressValue = addressInput,
                        onAddressChange = {
                            // 来自输入框的回传 = 用户改了字（或双击清空），
                            // "带过来的地址"这个身份到此为止，它现在是真输入了
                            addressCarried = false
                            addressInput = it
                        },
                        onAddressFocusChange = { addressFocused = it },
                        focusRequester = addressFocusRequester,
                        bottomPadding = dockBottom,
                        sniffOpen = shelfOpen,
                        // 影视模式入口：检测到影视站才出现（本页资源那枚按钮已按用户要求移除）。
                        // **进和出都走它**（用户口径）：不在模式里 → 进；在模式里 → 退（斜杠）
                        movieSite = browserController.movieSiteDetected,
                        movieMode = browserController.movieMode,
                        onMovieMode = {
                            if (browserController.movieMode) {
                                browserController.closeMovieMode()
                            } else {
                                browserController.enableMovieMode()
                            }
                        },
                        onLaunch = { page = AppPage.Browser },
                        // 长按返回键 = 直接回下载器（退出浏览器）；标签页留着，再进还在
                        onExitBrowser = { page = AppPage.Tasks },
                        onTabs = {
                            sniffOpen = false
                            browserController.openTabs()
                        },
                        onOpenSettings = {
                            sniffOpen = false
                            page = AppPage.Settings
                        },
                        onSniff = { sniffOpen = !sniffOpen },
                        onEnginePick = { key ->
                            SearchEngineDetector.setEngine(context, key, pinned = true)
                            searchEngineKey = key
                            // 若正停在旧引擎的搜索结果页：带同样的关键词换新引擎重搜
                            browserController.pickEngine(key)
                        }
                    )
                }
            }
        }
    }

    // 添加任务对话框
    if (showAddTask) {
        AddTaskDialog(
            viewModel = viewModel,
            initialUrl = initialIntentData,
            onDismiss = { showAddTask = false }
        )
    }

    // "待选择文件"任务：点击重开文件选择弹窗
    if (selectionTaskGid != null) {
        TaskFileSelectionSheet(
            gid = selectionTaskGid!!,
            viewModel = viewModel,
            onDismiss = { selectionTaskGid = null }
        )
    }

    // 任务详情：从实时状态取任务，进度随引擎刷新
    if (selectedTaskGid != null && !selectionMode) {
        val task = state.tasks.find { it.gid == selectedTaskGid }
            ?: viewModel.getTaskByGid(selectedTaskGid!!)
        if (task != null) {
            TaskDetailSheet(
                task = task,
                viewModel = viewModel,
                onDismiss = { selectedTaskGid = null },
                onDeleteRequest = {
                    pendingDeleteGids = listOf(task.gid)
                    selectedTaskGid = null
                }
            )
        } else {
            // 任务已被删除，自动关闭详情
            selectedTaskGid = null
        }
    }

    // 删除任务二次确认（单个/批量共用）
    val deleteTargets = pendingDeleteGids
    if (deleteTargets != null) {
        DeleteConfirmDialog(
            count = deleteTargets.size,
            onConfirm = { deleteFiles ->
                deleteTargets.forEach { viewModel.removeTask(it, deleteFiles) }
                pendingDeleteGids = null
            },
            onDismiss = { pendingDeleteGids = null }
        )
    }

    // ── 原生播放器：贴在网页里那个播放器的位置上 ──
    // 它**不在这棵 Compose 树里**：一块加在 decorView 上的原生覆盖层（见
    // NativePlayerOverlay，跟网页全屏视频用的那套一模一样）。这里只负责三件事：
    // 开/关、把页面报回来的位置喂给它、以及随界面一起退场。
    // 请求头按当前标签页的 Referer / UA / Cookie 拼（影视站的流几乎都校验防盗链）
    //
    // 开着的时候还要让网页那边"别再全屏"：影视站的播放按钮常在 `play()` 的同一拍里
    // `requestFullscreen()`，那次请求晚到一步就会盖住我们的播放器（见
    // BrowserController.setNativePlayerActive）
    LaunchedEffect(playing != null) {
        browserController.setNativePlayerActive(playing != null)
    }
    val playerOverlay = remember {
        (context as? android.app.Activity)?.let { act ->
            NativePlayerOverlay(act) { playing = null }
        }
    }
    LaunchedEffect(playerOverlay, playing) {
        val overlay = playerOverlay ?: return@LaunchedEffect
        val item = playing
        if (item == null) {
            overlay.close(notify = false)
        } else {
            overlay.open(
                url = item.url,
                title = item.title.ifBlank { item.pageUrl },
                headers = browserController.playbackHeaders(item.url)
            )
        }
    }
    /**
     * 影视模式下播放器该落在哪儿用的两个数：**内容区顶**（状态栏那一截之下）与屏幕宽。
     *
     * 起点与 `BrowserScreen` 的 `topInset` **同源**（两处都是
     * `ScaffoldDefaults.contentWindowInsets` 的顶内边距）—— 影视页那块 16:9 占位就贴在
     * 这个起点上，播放器按同一个数落下来才盖得住它。
     */
    val movieTopInsetDp = ScaffoldDefaults.contentWindowInsets
        .asPaddingValues().calculateTopPadding().value
    val movieWidthDp = LocalConfiguration.current.screenWidthDp.toFloat()

    /**
     * 影视模式下的播放器落点：**我们自己的那一块**（整宽 16:9、在影视页顶栏之下）。
     *
     * 原生播放器是按"网页里那个 `<video>` 的矩形"摆位的，而影视模式把网页整个盖住了
     * —— 那块矩形在我们这一屏后面，播放器会摆到看不见的地方。所以影视模式开着且正在
     * 播放时，推给覆盖层的 frame 换成我们自己的位置。
     *
     * **必须与 `MovieScreen` 顶部那块占位 Box 同源**（起点、高度都出自 MovieScreen.kt
     * 里那两个算式）。两边一旦对不齐，播放器就盖不住那块占位、底下会露出一条黑边。
     * 返回 null = 不接管（照旧用网页报上来的矩形）。
     */
    fun movieFrame(): RectF? {
        if (!browserController.movieMode) return null
        // 影视模式自己保证有落点（那一块 16:9 占位），所以只要这一屏真有东西在放就接管：
        // 我们的播放器（[playing]）与**网页自己那个播放器**（`playerOnScreen`，页面起播时
        // 自动接管的那一路）都算。以前只认前者 —— 页面自己起播时播放器就照着网页里那块
        // 矩形摆，正好压住我们的顶栏、还在它和内容之间留出一条空白（用户点名）。
        if (playing == null && !browserController.playerOnScreen) return null
        // 落点以 **MovieScreen 量出来的真实矩形**为准（见 `movieStageRect`）：原先两边各算
        // 一遍，只要有一处没跟上（顶栏高度变了、上面多了一层内边距）就会错位。量真东西不会错。
        browserController.movieStageRect?.let { return RectF(it) }
        // 还没量到（首帧）：退回算式 —— 起点在影视页顶栏之下、高度整宽 16:9
        val top = movieStageTopDp(movieTopInsetDp)
        return RectF(0f, top, movieWidthDp, top + movieStageHeightDp(movieWidthDp))
    }

    /**
     * 把播放器此刻该有的状态推给覆盖层。
     *
     * [browserPage] = 现在停在浏览器页。**必须把它一起算进去**：覆盖层是挂在 `decorView`
     * 上的一层，不属于任何 Compose 页面 —— 光看"宿主标签页在台前"判断不出用户已经回
     * 下载器 / 去设置页了，播放器就会一直悬浮在别的页面上（用户点名："返回到下载页或者
     * 切换到设置页，原生视频容器它还不会消失，还是悬浮的"）。
     */
    fun pushPlayerState(browserPage: Boolean) {
        playerOverlay?.update(
            frame = movieFrame() ?: browserController.playerFrame,
            // 影视模式下"真有东西在放"才显示：我们的播放器（[playing]）或网页自己那个
            // 播放器（`playerOnScreen`）。**不能只因为"在影视模式里"就显示** —— 那样换页
            //（比如用我们的站内搜索换了内容）之后，播放器会照着上一份矩形停在上一路的画面上
            // 不走（用户点名："站内搜索内容后，原生播放器还在"）。
            visible = browserPage && (browserController.playerOnScreen || playing != null),
            morph = browserController.pageGridMorph,
            target = browserController.pageGridClip,
            alpha = browserController.pageGridAlpha,
            gridProgress = browserController.pageGridProgress
        )
    }
    // 位置走**直连**（页面每报一次位置就当场摆）：不经过 Compose 状态与重组，
    // 滚动时不会慢半拍 —— 用户点名"滚动的时候有轻微偏移"就是这个半拍
    DisposableEffect(playerOverlay) {
        browserController.frameSink = { frame, visible ->
            playerOverlay?.update(
                // 影视模式下网页报上来的位置没有意义（那块矩形被我们盖住了）：
                // 换成我们自己的落点，两处推送必须同源（见 [movieFrame]）
                frame = movieFrame() ?: frame,
                visible = page == AppPage.Browser &&
                    (visible || playing != null),
                morph = browserController.pageGridMorph,
                target = browserController.pageGridClip,
                alpha = browserController.pageGridAlpha,
                gridProgress = browserController.pageGridProgress
            )
        }
        // 挂上时先把当前状态摆一次（播放器可能已经开着、位置也早就报上来了）
        pushPlayerState(page == AppPage.Browser)
        onDispose {
            browserController.frameSink = null
            playerOverlay?.release()
        }
    }
    // 切 App 页面时**立刻**重推一次：位置是网页主动报上来的，切页面这一下不一定有新位置，
    // 不重推就会停在上一页的状态（播放器留在屏幕上不消失）
    LaunchedEffect(page) { pushPlayerState(page == AppPage.Browser) }
    // 播放区那块矩形变了（转屏、顶栏高度变化）也要重推一次：位置是**推**给覆盖层的，
    // 没人推它就停在上一份上 —— 那正是"播放器压住顶栏 / 和内容之间裂出一条空白"的来源
    LaunchedEffect(browserController.movieStageRect) {
        pushPlayerState(page == AppPage.Browser)
    }

    // 承载播放器的那一页走了（导航走了 / 标签页被关）：播放器跟着结束
    LaunchedEffect(browserController.nativePlayStop) {
        if (browserController.nativePlayStop) {
            playing = null
            browserController.clearNativePlayStop()
        }
    }

    // 发现新版本：底部悬浮卡片（圆角、四周留白不贴边）。
    // 点击「立即更新」→ 按钮原地变为进度条（下载 APK）→ 完成后调起系统安装器。
    val pendingUpdate = availableUpdate
    if (pendingUpdate != null) {
        UpdateNoticeCard(
            update = pendingUpdate,
            downloadState = updateDownloadState,
            onUpdate = { UpdateManager.downloadAndInstall(context) },
            onDismiss = { UpdateManager.dismiss() }
        )
    }
}

// ─── 底部坞：任务页是浏览器按钮，进浏览器后原地变成控制栏 ───

/** 底部坞的两种形态。 */
private enum class DockMode { Launch, Address }

/** 坞的高度：两种形态共用一个高度，形变时不会上下跳。 */
private val DOCK_HEIGHT = 46.dp

/**
 * 传统模式的工具栏高度：比悬浮坞高一档（46 → 52dp）。
 *
 * 传统浏览器底部控制栏（Chrome 底部栏那种）本来就比"悬浮胶囊"厚实，
 * 46dp 满宽铺开会显得扁；52dp 下 38dp 的地址框上下各留 7dp，读起来是一条工具栏。
 */
private val TRADITIONAL_DOCK_HEIGHT = 52.dp

/** 坞的圆角。 */
private val DOCK_CORNER = 23.dp

/** 收起态胶囊的高度：坞容器材质收缩的终点尺寸（用户要求再小一档：34 → 30dp）。 */
private val COLLAPSED_PILL_HEIGHT = 30.dp

/** 收起态胶囊宽度：按网页名估宽（中文更宽），+26dp 是两侧内容内边距。 */
private fun collapsedPillWidth(nameText: String): Dp =
    (nameText.fold(0f) { acc, c -> acc + if (c.code > 0x2E7F) 12.5f else 6.8f }.dp + 26.dp)
        .coerceAtMost(220.dp)

/**
 * 网页底部固定元素的让位带分几档下发。
 *
 * 跟手收起时这条带子每帧都在变，而下发给网页是跨进程的 `evaluateJavascript`，
 * 每帧一次太贵；而且页面侧收到之后要**遍历整页**（`querySelectorAll('body *')`）
 * 才能算出谁该让位 —— 那个开销不能压在滚动的那几帧上。
 * 所以量化成这几档，档与档之间由网页自己的 300ms 过渡补平。
 */
private const val DOCK_AVOID_STEPS = 3f

/** 两个 dp 之间按进度取值（收起进度是 0..1 的连续量，尺寸都靠它推出来）。 */
private fun lerpDp(from: Dp, to: Dp, t: Float): Dp =
    (from.value + (to.value - from.value) * t.coerceIn(0f, 1f)).dp

/**
 * 坞容器的材质层：整块面板的填充都在这里画，Surface 自身透明。
 *
 * [morph] 从 0 → 1 时，轮廓从整块容器**收缩到收起态胶囊的尺寸**并同步淡出；
 * 展开时反向长回来 —— 材质自己会收缩/淡走/长回，和坞的形变同一条时间线，
 * 消除此前"背景瞬间消失 + 瞬间出现"的割裂感。圆角取容器圆角与**当前高度的一半**
 * 的较小值：收到胶囊那一档时自动变成正圆的胶囊，不会因为半径过大被裁成方角。
 */
private fun Modifier.dockSurfaceMaterial(
    morph: Float,
    amount: Float,
    cornerTop: Dp,
    cornerBottom: Dp,
    targetWidth: Dp,
    base: Color,
): Modifier = drawWithCache {
    val m = morph.coerceIn(0f, 1f)
    val a = amount.coerceIn(0f, 1f)
    val fullW = size.width
    val fullH = size.height
    val w = fullW + (targetWidth.toPx().coerceAtMost(fullW) - fullW) * m
    val h = fullH + (COLLAPSED_PILL_HEIGHT.toPx().coerceAtMost(fullH) - fullH) * m
    val rect = Rect(Offset((fullW - w) / 2f, (fullH - h) / 2f), Size(w, h))
    // 上下两排圆角**分开给**：传统模式两排都是 0（方角整条），聚焦态是"上圆下方"
    //（贴边那张形态），平时是四角同圆的悬浮胶囊。上限仍按 h/2 收 —— 胶囊那一档
    // 下正好是半圆的圆头
    val rTop = minOf(cornerTop.toPx(), h / 2f).coerceAtLeast(0f)
    val rBottom = minOf(cornerBottom.toPx(), h / 2f).coerceAtLeast(0f)
    val path = Path().apply {
        addRoundRect(
            RoundRect(
                rect,
                CornerRadius(rTop), CornerRadius(rTop),
                CornerRadius(rBottom), CornerRadius(rBottom)
            )
        )
    }
    onDrawBehind {
        drawPath(path, base.copy(alpha = a * (1f - m)))
    }
}

/** 底部那条实心底的高度（不含导航条）：要盖住坞所在的整条位置。 */
private val DOCK_BOTTOM_BAND = 62.dp

/** 浏览器按钮形态的宽度占比（比输入框窄，但明显比"刚好包住文字"要长）。 */
private const val DOCK_LAUNCH_WIDTH = 0.58f

/**
 * 底部常驻的坞（**悬浮**在内容之上，不占布局高度）。
 *
 * 「浏览器按钮 → 控制栏」是**同一个容器在连续变形**：宽窄、底色、内容各走
 * 各自的动画但共用一条时间线，所以看起来是它自己长成了控制栏，而不是一个
 * 控件换成另一个控件。
 *
 * 它挂在页面之外，不随页面切换重建；[visible] 为 false（展开标签网格、
 * 任务页进入编辑模式）时**向下滑走**并淡出，让位给网格 / 底部控制栏。
 */
@Composable
private fun BrowserDock(
    mode: DockMode,
    visible: Boolean,
    addressFocused: Boolean,
    modern: Boolean,
    onModernChange: (Boolean) -> Unit,
    onBounds: (Rect) -> Unit,
    onAddressCopied: () -> Unit,
    controller: BrowserController,
    addressValue: String,
    onAddressChange: (String) -> Unit,
    onAddressFocusChange: (Boolean) -> Unit,
    focusRequester: FocusRequester,
    bottomPadding: Dp,
    sniffOpen: Boolean,
    /** 影视模式入口的三个入参：检测到影视站才显示、开着时实心、点了手动进模式。 */
    movieSite: Boolean,
    movieMode: Boolean,
    onMovieMode: () -> Unit,
    onLaunch: () -> Unit,
    /** 长按左侧返回键：直接回下载器（退出浏览器）。 */
    onExitBrowser: () -> Unit,
    onTabs: () -> Unit,
    /** 「更多功能」弹窗里的"设置"：切到设置页（这个状态在 AppScreen 手里）。 */
    onOpenSettings: () -> Unit,
    onSniff: () -> Unit,
    onEnginePick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme
    val address = mode == DockMode.Address

    // 引擎选择框：点地址行左侧的引擎图标展开，坞向上长高（地址行钉在底部）
    var enginePickerOpen by remember { mutableStateOf(false) }
    // 长按标签按钮展开的设置面板：同样向上长（与引擎选择框互斥）
    var settingsOpen by remember { mutableStateOf(false) }
    // 「更多功能」弹窗（用户点名：右侧那枚标签按钮换成"更多"，点开就是它）。
    // **不再是坞里长出来的一块**，而是与播放器设置同款的独立弹窗 —— 与另外两个
    // 面板互斥，同一条"向上长出来"的位置只站一个人
    var moreOpen by remember { mutableStateOf(false) }
    // 顶部面板（设置/引擎选择）展开期间不进入收起态：向上长出的面板会被收进屏幕，
    // 用户正在选的东西凭空消失；更多功能虽是弹窗，开着时也一并让坞别收起
    val panelsOpen = settingsOpen || enginePickerOpen || moreOpen
    LaunchedEffect(panelsOpen) { controller.dockPanelsOpen = panelsOpen }
    // 收起进度：**单一真相在控制器**（网页滚动逐帧写、坞上拖动写、停下后吸附），
    // 界面只读它、不自己补间 —— 补间会去"追"一个还在动的目标，跟手立刻慢半拍。
    // 各种"不该收起"的场合也不在这里拦（拦了就是一帧硬切，反而跳），
    // 都由下面的 LaunchedEffect 调 expandDock() 让进度**自己补间回 0**
    val collapse = controller.dockProgress
    // 搜索页开着时输入框**始终是展开态**（哪怕键盘已收、焦点已不在）：那是"正在搜索"
    // 的界面，输入框缩成小胶囊会读成"已经退出搜索"（用户点名）。所以收起态在
    // 搜索页里不成立 —— 它由左上角返回键 / 导航来收场。
    val searchOpen = controller.homePanelsOpen

    /**
     * 网页里那层**贴底整宽**的弹窗（全宽操作条 / 半屏弹窗 / 登录罩）。
     *
     * 这种元素由注入脚本判定后**不再上移**（抬起来必定在下方留一条空隙 —— 用户
     * 点名的问题），改成让坞自己让位：
     * - 矮的（宽度整宽、贴底、高度不过半屏）→ 坞整体**抬到它上面**去；
     * - 整屏覆盖的 → 坞**滑走藏起来**，别去盖人家的按钮（见下面的 progress）。
     *
     * **只在现代模式生效**：传统模式的网页本来就预留了底边（见 `bottomInset`），
     * 工具栏贴底不透明、不需要让位。这一层的判定不能只看上报值 —— 脚本是跟着
     * 页面活的，从现代切回传统后它还会把弹窗报上来（用户点名：传统浏览器触发了
     * 底部全覆盖弹窗的避让）。控制器里那份上报值在切方案时已作废（见
     * `BrowserController.updateDockAvoid`），这里再按方案兜一道。
     */
    val overlayPx = if (modern) controller.bottomOverlayPx else 0
    val overlayAll = if (modern) controller.bottomOverlayAll else false
    // 抬多少：让坞的**底边正好落在弹窗上沿**。坞本身已经离屏底 `bottomPadding`
    //（导航条 + 4dp），所以只需补上差额；矮于这段间距的弹窗不用抬
    val overlayLift by animateDpAsState(
        targetValue = when {
            overlayAll -> 0.dp
            else -> (overlayPx - bottomPadding.value).coerceAtLeast(0f).dp
        },
        animationSpec = tween(260, easing = FastOutSlowInEasing),
        label = "dockOverlayLift"
    )
    LaunchedEffect(mode, visible) {
        if (!visible || mode != DockMode.Address) {
            enginePickerOpen = false
            settingsOpen = false
            // 离开地址形态时一并收起更多功能弹窗：它是盖住整屏的独立弹窗，
            // 留在场上会挡住切换后的界面
            moreOpen = false
        }
    }
    // 传统方案 / 浏览器按钮形态 / 坞不在场 / 搜索页开着：这几种场合收起态都不成立。
    // 同时把"坞在不在场上"同步给控制器 —— 只靠界面拦是不够的：跟手是网页那边
    // **主动**推上来的，页面自己的自动滚动也会推（见 dockEngaged）
    LaunchedEffect(modern, address, visible, searchOpen) {
        controller.dockEngaged = address && visible
        if (!modern || !address || !visible || searchOpen) controller.expandDock()
    }
    // 聚焦的那一刻把收起态归位：网页里上一次滑动留下的进度若不抹掉，等会儿
    // 一失焦就会**凭空**缩成胶囊（收起动作该由下一次滑动决定）。
    // 地址栏聚焦期间输入法还压着、正在输入，坞缩成小胶囊会读成"样式错乱"
    LaunchedEffect(addressFocused) {
        if (addressFocused) controller.expandDock()
    }
    // 回到自家首页（含系统返回手势从网页退回）也要归位：首页没有"滚动让位"的语义，
    // 退回来时坞还缩着一枚胶囊就不对了（用户点名）。只在 isHomePage **变化**时归位，
    // 所以不影响"在首页把坞拖下去"这个手势
    LaunchedEffect(controller.isHomePage) {
        if (controller.isHomePage) controller.expandDock()
    }
    // 系统手势条那一截（导航条 inset）：现代模式网页铺到屏幕底，网页自己的
    // 贴底底部导航会有一截落进小横条区域 —— 下发给脚本让它向上延伸
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    // 坞收起 / 展开时，网页里的底部固定按钮**实时**跟着让位
    //（收起只剩一枚小胶囊：68px；展开是整条控制栏：88px）。
    // 收起那一档不能再按"整条控制栏"的量算 —— 胶囊又矮又靠下，让位带跟着收一点，
    // 否则悬浮按钮离胶囊太远（用户点名：收起状态下上移的距离要少一点）。
    // 坞被抬到整宽弹窗上面时再叠加那段高度：否则悬浮按钮正好落在抬起来的坞下面。
    // `enabled` = 现代方案：传统模式**要主动把脚本停掉**，不能只下发 0 ——
    // 网页本来就预留了底边，可脚本（含它的 MutationObserver）是跟着页面活的，
    // 留着它传统工具栏仍会按弹窗让位/藏起来（用户点名的 bug）。
    // !address 那档（坞还是"浏览器按钮"形态）保持脚本活着、让位带给 0：
    // 不然进了地址形态还得等下一次注入。
    //
    // **跟手时这个量每帧都在变，但下发给网页是跨进程的 evaluateJavascript** ——
    // 每帧发一次太贵（每个标签页都要发）。所以量化成 DOCK_AVOID_STEPS 档，
    // 只在跨档时下发；网页那边对位移本身挂了 300ms 过渡，档与档之间是平滑补上的
    val avoidStep = (collapse * DOCK_AVOID_STEPS).roundToInt()
    LaunchedEffect(avoidStep, overlayPx, modern, address, navBottom) {
        controller.updateDockAvoid(
            padPx = if (!address) 0 else
                (88f - 20f * avoidStep / DOCK_AVOID_STEPS).roundToInt() + overlayPx,
            enabled = modern,
            gesturePx = navBottom.value.toInt()
        )
    }
    val pickerHeight by animateDpAsState(
        targetValue = if (enginePickerOpen) ENGINE_PICKER_HEIGHT else 0.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "enginePickerHeight"
    )
    val settingsHeight by animateDpAsState(
        targetValue = if (settingsOpen) DOCK_SETTINGS_HEIGHT else 0.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockSettingsHeight"
    )
    // 聚焦时向下长出「常用前缀」条：坞整体跟着长高（地址行上移、前缀条占住原来的位置）。
    // **面板（引擎选择框 / 设置面板）展开时不再为它留高度** —— 那 28dp 是给前缀条的，
    // 面板一开前缀条就收了（连着看两处条件，见 DockAddressContent 的 panelOpen），
    // 继续留着高度只会变成地址行下方的一段空白（用户：输入框离底部间距有点大）
    val prefixExtra by animateDpAsState(
        targetValue = if (address && addressFocused && !panelsOpen) DOCK_PREFIX_HEIGHT else 0.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockPrefixExtra"
    )

    // 三条同源的过渡：宽度、底色、内容 —— 合成一次形变
    val morphSpec = tween<Float>(340, easing = FastOutSlowInEasing)
    val widthFraction by animateFloatAsState(
        targetValue = if (address) 1f else DOCK_LAUNCH_WIDTH,
        animationSpec = morphSpec,
        label = "dockWidth"
    )
    // 控制栏形态：靠**色板明暗差**表达悬浮层级（不带描边、不带阴影）。
    // 浅色主题要往**更灰**的方向压一档：白色底的控制栏跟大量白色网页
    // 糊在一起（用户点名"容易跟背景融为一体"），压到近浅灰才分得开；
    // 深色主题的 surfaceContainerHighest 与页面底色差得足够多，保持不变。
    val lightTheme = colorScheme.background.luminance() > 0.5f
    val solidColor = if (lightTheme) {
        lerp(colorScheme.surfaceContainerHighest, Color.Black, 0.08f)
    } else {
        colorScheme.surfaceContainerHighest
    }
    // 坞本体：传统/现代都是纯色不透明。填充由**常驻绘制层**承担
    //（见 dockSurfaceMaterial）：材质不再条件式挂载 —— 收起/展开时整块材质向胶囊
    // 收缩/长回、同时淡出/淡入，和坞的形变共用一条 300ms 时间线，
    // 不再是"瞬间消失 + 瞬间出现"
    val progress by animateFloatAsState(
        // 整屏覆盖的弹窗（登录罩）在场时干脆让开：全屏弹窗的底部按钮不该被坞盖住
        targetValue = if (visible && !overlayAll) 1f else 0f,
        animationSpec = tween(260, easing = FastOutSlowInEasing),
        label = "dockVisibility"
    )
    // 材质整体显隐：地址形态才有填充（进出地址形态时平滑过渡）。
    // 时长跟 `morphSpec`（宽度形变）与整页切换的 340ms **对齐** —— 这三样是同一个
    // 动作的三个部分（胶囊变宽 / 底料浮现 / 整页升起来），谁短谁就会"先到位"。
    val materialAmount by animateFloatAsState(
        targetValue = if (address) 1f else 0f,
        animationSpec = tween(340, easing = FastOutSlowInEasing),
        label = "dockMaterialAmount"
    )
    // 收起形态进度：材质轮廓据此从整块收缩到收起态胶囊的尺寸。
    // **就是跟手进度本身**（不再套一层补间）—— 补间会让材质去追一个还在动的目标，
    // 观感正是用户点名的"跟手不跟手"
    val collapseMorph = collapse
    // 浏览器按钮形态整体下沉一点：更贴底部（按钮无背景，位移不会带动控制栏）
    val launchDrop by animateDpAsState(
        targetValue = if (address) 0.dp else 6.dp,
        animationSpec = tween(340, easing = FastOutSlowInEasing),
        label = "dockLaunchDrop"
    )
    // 收起态轻微下沉：贴向底缘一点，但不压到导航条（用户：再向下一点点 6 → 10dp）。
    // 同样**跟手**：收缩到几成就下沉几成，停下时由吸附补齐最后一段
    val collapseDrop = (10f * collapse).dp

    /**
     * 传统模式（非现代）的浏览器控制栏：**贴边、贴底、方角的一整条工具栏** ——
     * 就是传统浏览器底部那条形态。
     *
     * 现代模式是"悬浮的一块玻璃"，传统模式则应该像网页的一部分：16dp 外边距、
     * 6dp 顶部留空、23dp 圆角、悬浮 4dp 这些悬浮特征**全部归零**，换成
     * ① 满宽贴边、② 底边贴住屏幕底（导航条那一截用同色垫出来，不是露底色）、
     * ③ 方角 + 顶部一条发丝分割线。这些量都走动画，切换模式时是连续形变。
     */
    val docked = address && !modern
    // 聚焦态（现代模式）：坞**左右贴边、下面两个角变直角**，上面两个角保持圆角 ——
    // 读起来是从底部升起来的一层，而不是一枚悬浮胶囊（用户点名）。
    //
    // 只动左右与圆角，**不动底部留白**：坞与键盘之间那一截（导航条那点高度）留着，
    // 免得键盘没弹出时坞一头扎到屏幕最底、盖住小横条
    val flush = address && modern && addressFocused
    val dockSidePadBase by animateDpAsState(
        // 与网页上的坞**同一档**（用户点名：搜索页的坞左右间距要和网页上一致）：
        // 16dp；聚焦贴边那一档是 0。
        //
        // **搜索界面不在这里分叉**（用户点名）：面板展开那一屏里，坞本身还是首页
        // 那一枚（16dp 外边距、下圆角、悬浮在导航条之上），换的只是**坞里面那枚
        // 链接输入框的左右**（见 DockAddressContent 的 rowPad / pillFlushPad）——
        // 整条坞跟着贴边的话，进搜索页会看到控制栏横跳一整档
        targetValue = if (docked || flush) 0.dp else 16.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockSidePad"
    )
    // 收起态左右再收到 4dp（用户点名：收起状态下输入框两侧的间距还要减少）。
    // **跟手直算、不套补间** —— 与其它跟手量同源，补间会让它慢半拍；
    // 用 lerpDp 按进度插值，两档（首页 8 / 其它页 16）都平滑地往 4dp 收
    val dockSidePad = if (docked || flush) {
        dockSidePadBase
    } else {
        lerpDp(dockSidePadBase, 4.dp, collapse)
    }
    val dockTopPad by animateDpAsState(
        targetValue = if (docked) 0.dp else 6.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockTopPad"
    )
    // 上面两个角：传统模式 0（方角整条），其余是悬浮胶囊的 23dp
    val dockCorner by animateDpAsState(
        targetValue = if (docked) 0.dp else DOCK_CORNER,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockCorner"
    )
    // 下面两个角：聚焦态也收成直角（与"贴边"配套，见 flush）
    val dockCornerBottom by animateDpAsState(
        targetValue = if (docked || flush) 0.dp else DOCK_CORNER,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockCornerBottom"
    )
    // 传统模式：导航条那一截由工具栏自己垫（背景同色、内容不进去），
    // 所以外层不再留 bottomPadding、也不做"抬到弹窗上面"那套（传统模式网页本来就预留了底边）
    // 聚焦展开时坞也**贴到屏幕底**（与左右贴边配套 —— 用户点名：聚焦后它和底部的
    // 系统组件之间不应该有间距）。导航条那一截改由坞内部垫出来（同传统模式），
    // 内容与系统横条仍然互不侵犯。
    //
    // 两段都**走补间**、与左右/圆角同一条 300ms 时间线：之前是布尔直算，聚焦那一下
    // 底边"啪"地贴到底（用户点名：底部延展是直接跳的，应该有动画）
    val dockBottomPad by animateDpAsState(
        targetValue = if (docked || flush) 0.dp else bottomPadding + overlayLift,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockBottomPad"
    )
    val dockNavStrip by animateDpAsState(
        targetValue = if (docked || flush) navBottom else 0.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockNavStrip"
    )
    // 顶部那条发丝分割线的厚度（也要算进高度里，内容区高度才稳定）
    val dockDivider = if (docked) 1.dp else 0.dp
    // 传统工具栏更厚实一档；高度也走动画，切换模式时是连续长高而不是跳变
    val dockBarHeight by animateDpAsState(
        targetValue = if (docked) TRADITIONAL_DOCK_HEIGHT else DOCK_HEIGHT,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockBarHeight"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(
                start = dockSidePad,
                end = dockSidePad,
                top = dockTopPad,
                bottom = dockBottomPad
            ),
        contentAlignment = Alignment.Center
    ) {
        // progress 到 0 就整个撤掉：不可见时不再抢触摸事件
        if (progress > 0f) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth(widthFraction)
                    .height(
                        dockBarHeight + pickerHeight + settingsHeight + prefixExtra +
                            dockNavStrip + dockDivider
                    )
                    // 位移/透明度层放在材质**外面**（链上更靠前）：材质画在这一层里，
                    // 坞滑走/淡出时和它一起动 —— 此前材质挂在层外，
                    // 滑走时只有内容在动、材质留在原地
                    .graphicsLayer {
                        alpha = progress
                        // 向下滑走（滑出自身高度之外），不是原地缩小
                        translationY = (1f - progress) * 96.dp.toPx() +
                            launchDrop.toPx() + collapseDrop.toPx()
                    }
                    .then(
                        if (materialAmount > 0f) {
                            Modifier.dockSurfaceMaterial(
                                morph = collapseMorph,
                                amount = materialAmount,
                                cornerTop = dockCorner,
                                cornerBottom = dockCornerBottom,
                                targetWidth = collapsedPillWidth(
                                    controller.pageTitle.ifBlank {
                                        com.lerxu.android.browser.TabNaming.host(controller.currentUrl)
                                    }
                                ),
                                base = solidColor
                            )
                        } else {
                            Modifier
                        }
                    )
                    // 坞自己的窗口坐标：抓标签页缩略图时要排掉这一段（见 captureThumbnail）
                    .onGloballyPositioned { onBounds(it.boundsInWindow()) }
                    // 现代模式：在坞上纵向拖动 = 收起 / 恢复。**同样是跟手的** ——
                    // 往下拖它跟着缩、往上拖跟着长，松手按"过没过一半"吸附
                    //（与网页滚动那一路共用同一套进度与同一个判据）。
                    // 搜索页开着时这段手势整个不挂：那时输入框必须留在展开态；
                    // 地址栏聚焦期间同理 —— 正在输入，不该顺手把坞拖成胶囊
                    .pointerInput(modern, address, searchOpen, addressFocused) {
                        if (!modern || !address || searchOpen || addressFocused) return@pointerInput
                        // 往下拖满这一段 = 从全展到全收（与网页滚动那一档是两个输入，
                        // 常量都放在 DockFollow 里）
                        val travel = DockFollow.DRAG_TRAVEL_DP.dp.toPx()
                        detectVerticalDragGestures(
                            onDragEnd = { controller.settleDock() },
                            onDragCancel = { controller.settleDock() }
                        ) { _, dragAmount ->
                            // 指尖**还按着**：中间的停顿不算"停手"，吸附留到抬手那一下
                            controller.followDock(dragAmount, travel, settleAfterIdle = false)
                        }
                    }
                    // 收起态下点坞任意处恢复完整形态
                    .clickable(enabled = collapse >= DockFollow.SNAP_AT) {
                        controller.expandDock()
                    },
                // 传统模式是方角整条（两排都是 0）、现代模式是 23dp 圆角胶囊；
                // 聚焦态**上圆下方**（左右已贴边，下面两个角收成直角）
                shape = RoundedCornerShape(
                    topStart = dockCorner,
                    topEnd = dockCorner,
                    bottomEnd = dockCornerBottom,
                    bottomStart = dockCornerBottom
                ),
                // 填充全部由 dockSurfaceMaterial 绘制（含收起时的收缩淡出）
                color = Color.Transparent,
                // 极细描边由材质层自带，这里不再叠一层
                border = null,
                shadowElevation = 0.dp,
                tonalElevation = 0.dp
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    // 传统模式：顶部一条发丝分割线，把工具栏和网页分开（传统底部栏的标配）
                    if (dockDivider > 0.dp) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(dockDivider)
                                .background(colorScheme.outlineVariant)
                        )
                    }
                    // 设置面板占据长出来的上半截（地址行仍钉在下面）。
                    // **不加底色、不画分隔线**：长出来的这一截和下方控制栏是同一块
                    // （用户点名要"一体"），底色由坞的材质统一铺满，分隔线会把它切成两块
                    if (settingsHeight > 0.dp) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(settingsHeight)
                                .clipToBounds()
                                .graphicsLayer {
                                    alpha = (settingsHeight / DOCK_SETTINGS_HEIGHT).coerceIn(0f, 1f)
                                }
                        ) {
                            DockSettingsPanel(
                                modifier = Modifier.weight(1f),
                                modern = modern,
                                onModern = onModernChange
                            )
                        }
                    }
                    // 引擎选择框：也占据长出来的上半截（与设置面板同构、二者互斥）。
                    // 长出来的这一截属于**控制栏**，地址行仍钉在下面 ——
                    // 上一版是链接输入框自己向上长（高到把坞的背景整个盖住），
                    // 读起来像"输入框变成了选择框"，而该长高的是控制栏（用户点名）
                    if (pickerHeight > 0.dp) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(pickerHeight)
                                .clipToBounds()
                                .graphicsLayer {
                                    alpha = (pickerHeight / ENGINE_PICKER_HEIGHT).coerceIn(0f, 1f)
                                }
                        ) {
                            Box(modifier = Modifier.weight(1f)) {
                                EnginePicker(
                                    currentKey = controller.engine.key,
                                    onPick = { key ->
                                        onEnginePick(key)
                                        enginePickerOpen = false
                                    }
                                )
                            }
                        }
                    }
                    Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
                        AnimatedContent(
                            targetState = mode,
                            transitionSpec = {
                                // 只做交叉淡入淡出：容器本身在连续变形，内容再各自缩放会抖
                                fadeIn(tween(220)) togetherWith fadeOut(tween(160))
                            },
                            label = "dockMode"
                        ) { current ->
                            when (current) {
                                DockMode.Launch -> DockLaunchContent(onLaunch)
                                DockMode.Address -> DockAddressContent(
                                    controller = controller,
                                    value = addressValue,
                                    onValueChange = onAddressChange,
                                    onFocusChange = { focused ->
                                        // 一开始打字就把选择框收起来，让位给输入
                                        if (focused) enginePickerOpen = false
                                        onAddressFocusChange(focused)
                                    },
                                    focusRequester = focusRequester,
                                    sniffOpen = sniffOpen,
                                    onSniff = onSniff,
                                    movieSite = movieSite,
                                    movieMode = movieMode,
                                    onMovieMode = onMovieMode,
                                    onEngineIcon = {
                                        // 收起态下先恢复完整控制栏，再谈引擎选择
                                        if (controller.dockCollapsed) {
                                            controller.expandDock()
                                        } else {
                                            enginePickerOpen = !enginePickerOpen
                                            if (enginePickerOpen) settingsOpen = false
                                        }
                                    },
                                    pickerOpen = enginePickerOpen,
                                    panelOpen = panelsOpen,
                                    searchOpen = searchOpen,
                                    flush = flush,
                                    collapse = collapse,
                                    onTabsLongPress = {
                                        settingsOpen = !settingsOpen
                                        if (settingsOpen) {
                                            enginePickerOpen = false
                                            moreOpen = false
                                        }
                                    },
                                    onMore = {
                                        moreOpen = !moreOpen
                                        if (moreOpen) {
                                            enginePickerOpen = false
                                            settingsOpen = false
                                        }
                                    },
                                    onCopied = onAddressCopied,
                                    onCollapsedRestore = { controller.expandDock() },
                                    onExitBrowser = onExitBrowser,
                                    docked = docked
                                )
                            }
                        }
                    }
                    // 传统模式：底边一直贴到屏幕底 —— 导航条那一截用同色垫出来，
                    // 内容不进这一带（所以看着是一条"落到底"的工具栏，而不是悬浮块）
                    if (dockNavStrip > 0.dp) {
                        Spacer(Modifier.height(dockNavStrip))
                    }
                }
            }
        }
    }

    // 「更多功能」独立弹窗（用户点名：不再从坞里向上长出来，改成与播放器设置同款的
    // 底部弹窗）。关闭由弹窗自己负责（滑动/点遮罩走 onDismiss，每一行点击后也先收起）
    if (moreOpen) {
        DockMoreSheet(
            tabCount = controller.tabCount,
            onDismiss = { moreOpen = false },
            onTabs = { moreOpen = false; onTabs() },
            onNewTab = { moreOpen = false; controller.newTab() },
            onHome = { moreOpen = false; controller.loadHome() },
            onDownloads = { moreOpen = false; onExitBrowser() },
            onSettings = { moreOpen = false; onOpenSettings() }
        )
    }
}

/** 任务页形态：一个居中的浏览器按钮（不是输入框），占满坞的高度与宽度。 */
@Composable
private fun DockLaunchContent(onOpen: () -> Unit) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxSize()
            .clickable(onClick = onOpen),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Default.Language,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = colorScheme.onSurface
        )
        Spacer(Modifier.width(9.dp))
        Text(
            stringResource(R.string.tab_browser),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = colorScheme.onSurface
        )
    }
}

/** 引擎选择框展开时坞长出多高（一行两个引擎）。 */
private val ENGINE_PICKER_HEIGHT = 66.dp

/** 长按标签按钮展开的设置面板高度（界面方案 + 液态玻璃两行）。 */
private val DOCK_SETTINGS_HEIGHT = 84.dp

/**
 * 按住链接输入框往上拖：手指移出这么多（dp）才开始**跟手**推网格。
 *
 * 只是"起手死区"（防点一下时的手指抖动把网格带出来），不是触发阈值 —— 越过它之后
 * 网格进度就完全跟着手指走（用户点名："应该做成跟手的……而不是固定的动画"）。
 * 比点击容差略大一点：现在**不等长按**就能起手，抖动余地要留够。
 */
private val TAB_DRAG_SLOP = 10.dp

/**
 * 从"网格全关"拖到"全开"要走多少：**屏高的这个比例**（不是固定 dp）。
 *
 * 为什么按屏高而不是给个固定值：网格是**全屏**的形态切换，行程给短了就会"刚拖一点
 * 就整块开"（用户点名："目前我刚就拖一点，就自动进入标签模式"）。按屏高走，手指走
 * 多少、网格就跟着长多少，抬手时"过没过一半"也才有意义 —— 与坞那条（收起只是缩一小截，
 * 所以行程 72dp）不同，它换掉的是整屏。
 */
private const val TAB_DRAG_TRAVEL_RATIO = 0.42f

/** 聚焦时输入框向下长出的「常用前缀」条高度。 */
private val DOCK_PREFIX_HEIGHT = 28.dp

/** 地址栏常用前缀：点一下直接追加到输入里，省得翻键盘符号。 */
private val ADDRESS_PREFIXES = listOf("https://", "http://", "www.", ".com", ".cn")

/** 各引擎的品牌色（徽标底色），取自各家标志的主色。 */
private val ENGINE_BRAND_COLORS = mapOf(
    SearchEngines.KEY_GOOGLE to Color(0xFF4285F4),
    SearchEngines.KEY_BING to Color(0xFF008373)
)

/**
 * 引擎真实图标：官方站点的 128px 高清图（构建期取回、白底已抠除、随 APK 内置）。
 * 不依赖运行时网络，目录里没登记的引擎回退为品牌色圆底 + 首字母。
 */
private val ENGINE_ICON_RES = mapOf(
    SearchEngines.KEY_BING to R.drawable.engine_bing,
    SearchEngines.KEY_GOOGLE to R.drawable.engine_google
)

@Composable
private fun EngineIcon(key: String, size: Dp) {
    val icon = ENGINE_ICON_RES[key]
    if (icon != null) {
        Image(
            painter = painterResource(icon),
            contentDescription = SearchEngines.byKey(key).name,
            modifier = Modifier.size(size)
        )
    } else {
        // 回退徽标：品牌色圆底 + 引擎名首字母（不内置商标图）
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(ENGINE_BRAND_COLORS[key] ?: MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Text(
                SearchEngines.byKey(key).name.trim().take(1).uppercase(),
                color = Color.White,
                fontSize = (size.value * 0.58f).sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

/**
 * 引擎选择框：直接遍历 SearchEngines 目录（单一来源，不存在清单漂移），
 * 居中一行；当前引擎高亮。点选即持久化并收起。
 */
@Composable
private fun EnginePicker(currentKey: String, onPick: (String) -> Unit) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 10.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SearchEngines.all.forEach { engine ->
            val selected = engine.key == currentKey
            Column(
                modifier = Modifier
                    .width(96.dp)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        if (selected) colorScheme.primaryContainer else Color.Transparent
                    )
                    .clickable { onPick(engine.key) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                EngineIcon(key = engine.key, size = 26.dp)
                Spacer(Modifier.height(3.dp))
                Text(
                    engine.name,
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = if (selected) colorScheme.onPrimaryContainer
                    else colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * 坞内设置面板（长按标签按钮展开）：浏览器页专有设置。
 * 界面方案（传统 / 现代）。改动即时生效并持久化。
 */
@Composable
private fun DockSettingsPanel(
    modern: Boolean,
    onModern: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                stringResource(R.string.browser_dock_style),
                style = MaterialTheme.typography.bodySmall,
                color = colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                DockSegChip(
                    label = stringResource(R.string.browser_dock_style_classic),
                    selected = !modern,
                    onClick = { onModern(false) }
                )
                DockSegChip(
                    label = stringResource(R.string.browser_dock_style_modern),
                    selected = modern,
                    onClick = { onModern(true) }
                )
            }
        }
    }
}

/**
 * 「更多功能」弹窗（用户点名：底部功能栏右侧那枚标签按钮换成"更多"，点开就是这一屏）。
 *
 * **独立弹窗，样式照播放器设置弹窗来**（用户点名）：同一个 [ModalBottomSheet]，同一套
 * 标题字号与内边距。不再从坞里向上长出来 —— 那块"长高"的地方只留给坞自己的设置面板
 * （见 BrowserDock）。
 *
 * 只放动作，不放开关：标签页／新建标签／主页／下载页／设置。标签页入口从坞上挪到
 * 这里之后，进标签页还剩两条路：这个弹窗，以及**按住链接输入框往上拖**。
 *
 * 五个动作排成**图标宫格**：原先的竖排列表每行只挂一枚 ">"，五个动作摊满一屏很空、
 * 也不够一眼扫完；换成"图标居中在上、名称在下"的等距排布后，图标本身就是最快的识别锚点。
 * 宫格用普通 [Row] 而不是 LazyVerticalGrid —— 弹窗里再嵌一层可滚动网格会和底部弹窗自己的
 * 下拉收起抢手势，五个固定项也不值得为它引入懒加载。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DockMoreSheet(
    tabCount: Int,
    onTabs: () -> Unit,
    onNewTab: () -> Unit,
    onHome: () -> Unit,
    onDownloads: () -> Unit,
    onSettings: () -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                // 与播放器设置弹窗同一套内边距（底面留厚一点，避开手势条）
                .padding(start = 20.dp, end = 20.dp, bottom = 24.dp)
        ) {
            Text(
                stringResource(R.string.browser_dock_more),
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )
            Spacer(Modifier.height(18.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                // 等距铺开：两侧留白与项间留白一致，整排看起来才是"一个宫格"而不是挤在一起
                horizontalArrangement = Arrangement.SpaceEvenly,
                // 图标统一顶对齐：标签页那项名下多一行数量小字、整项更高，
                // 若按居中对齐，它的图标会被压低、和旁边四项错开一格
                verticalAlignment = Alignment.Top
            ) {
                DockMoreItem(Icons.Rounded.Tab, stringResource(R.string.browser_dock_more_tabs), tabCount.toString(), onTabs)
                DockMoreItem(Icons.Rounded.Add, stringResource(R.string.browser_dock_more_new_tab), null, onNewTab)
                DockMoreItem(Icons.Rounded.Home, stringResource(R.string.browser_dock_more_home), null, onHome)
                DockMoreItem(Icons.Rounded.Download, stringResource(R.string.browser_dock_more_downloads), null, onDownloads)
                DockMoreItem(Icons.Rounded.Settings, stringResource(R.string.browser_dock_more_settings), null, onSettings)
            }
        }
    }
}

/**
 * 宫格里的一项：图标居中在上、名称在下。
 *
 * [badge] 不为空时（目前只有"标签页"用）把数量**画进图标**（右上角一枚小圆标）——
 * 用户点名："标签页图标应该重新设计一下，应该让文字融入图标，而不是单独显示在下方"。
 * 用 Material 的 [BadgedBox] 而不是自己在名称下面再排一行字：数量是"这枚图标自己的
 * 状态"，挂在图标上才读得出归属；摊在下方既拉高整项、又会让人以为它是第二行名称。
 *
 * 命中区撑到 56dp 见方 —— 宫格把横向空间摊开之后每项都比原来的一整行窄得多，沿用列表那套
 * 高度会让相邻项挨得太近、很容易误触；56dp 是 Material 建议的最小可点尺寸，保证每项好按。
 * 图标颜色取 [LocalContentColor] 而不是写死，深浅色主题与弹窗自身的内容色都能自动跟上。
 */
@Composable
private fun DockMoreItem(
    icon: ImageVector,
    label: String,
    badge: String?,
    onClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .widthIn(min = 56.dp)
            .heightIn(min = 56.dp)
            .pointerInput(Unit) { detectTapGestures { onClick() } },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        BadgedBox(
            badge = {
                if (badge != null) {
                    Badge(containerColor = MaterialTheme.colorScheme.primary) {
                        Text(badge)
                    }
                }
            }
        ) {
            Icon(
                icon,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = LocalContentColor.current
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(label, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

/** 界面方案的分段选择小胶囊。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DockSegChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) colorScheme.primaryContainer else Color.Transparent,
        contentColor = if (selected) colorScheme.onPrimaryContainer else colorScheme.onSurfaceVariant,
        border = if (selected) null else BorderStroke(1.dp, colorScheme.outlineVariant)
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
        )
    }
}

/**
 * 浏览器页形态：回退 / 链接输入框 / 资源嗅探 / 标签页。
 *
 * 从左到右：**最左侧是回退**（已经退到头时置灰）、中间是链接输入框（刷新与停止
 * 收在输入框右侧，不占外面的按钮位）、随后是嗅探圆点（圆点里是资源数量）、
 * 最右是标签页入口（图标里带数量）。
 *
 * 输入框**只会沿横向变化**：左右按钮让位时宽度长开、收起态缩成小胶囊；
 * 纵向长高的永远是**外面的控制栏**（引擎选择框 / 设置面板 / 前缀条都长在坞里，
 * 见 BrowserDock），输入框自己的高度只在收起态缩一档。
 *
 * 容器用面板色（见 BrowserDock），与页面底色区分但不投影、不描边。
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DockAddressContent(
    controller: BrowserController,
    value: String,
    onValueChange: (String) -> Unit,
    onFocusChange: (Boolean) -> Unit,
    focusRequester: FocusRequester,
    sniffOpen: Boolean,
    onSniff: () -> Unit,
    /** 这一站像不像影视站（见 `movieSiteDetected`）：是才在输入框里显示影视模式入口。 */
    movieSite: Boolean,
    /** 影视模式是否开着（开着时那枚入口是实心的）。 */
    movieMode: Boolean,
    /** 点那枚入口 = 手动进影视模式（默认自动开，手动关掉之后从这里再开回来）。 */
    onMovieMode: () -> Unit,
    onEngineIcon: () -> Unit,
    pickerOpen: Boolean,
    /** 引擎选择框 / 设置面板是否占着坞的上半截（两者都与前缀条互斥）。 */
    panelOpen: Boolean,
    /** 首页搜索页是否开着：开着时输入框保持**展开态**（左右按钮让位），哪怕已失焦。 */
    searchOpen: Boolean,
    /**
     * 聚焦态：坞已经**贴到屏幕左右边**（见 BrowserDock 的 flush）。此时内容不能跟着
     * 一起贴边，得自己让出呼吸位 —— 否则文字离屏幕边只有 2dp。
     */
    flush: Boolean,
    /**
     * 收起进度 0..1：**跟手**量 —— 网页滚多少就收多少，停下后由控制器吸附到 0 / 1。
     *
     * 这一档**不再是布尔**：宽度、高度、圆角、两侧按钮与图标、URL 与网页名的交叉
     * 淡入淡出**全部由它连续推出来**，所以观感是"整条控制栏在跟着手指缩"，
     * 而不是"到某一档就整块换成另一个形态"（用户点名）。
     */
    collapse: Float,
    onTabsLongPress: () -> Unit,
    /** 「更多功能」按钮：点开坞里向上长出来的功能面板（长按仍是设置面板）。 */
    onMore: () -> Unit,
    onCopied: () -> Unit,
    onCollapsedRestore: () -> Unit,
    /** 长按返回键：直接回下载器（退出浏览器）。 */
    onExitBrowser: () -> Unit,
    /** 传统模式：贴边整条的工具栏，内边距与横向放开量都按它调（见 BrowserDock）。 */
    docked: Boolean
) {
    val colorScheme = MaterialTheme.colorScheme
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val focusManager = androidx.compose.ui.platform.LocalFocusManager.current
    val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current
    val canGoBack = controller.canGoBack
    // 文本与光标由这份受控状态托管：触摸被手势层接管后输入框自己收不到点击，
    // 光标位置只能拿文本布局反查来设
    val fieldState = remember { androidx.compose.foundation.text.input.TextFieldState(value) }
    var textLayout by remember { mutableStateOf<TextLayoutResult?>(null) }
    // 布局回调签名是 (Density, () -> TextLayoutResult?)：单独声明避免解析歧义
    val captureLayout: (androidx.compose.ui.unit.Density, (() -> TextLayoutResult?)) -> Unit =
        { _, get -> textLayout = get() }
    val latestOnValueChange by androidx.compose.runtime.rememberUpdatedState(onValueChange)
    // 外部改写（URL 同步 / 点前缀追加 / 双击清空）同步进状态（打字回传两边一致，不重置光标）
    run {
        val external = value
        if (fieldState.text.toString() != external) {
            fieldState.setTextAndPlaceCursorAtEnd(external)
        }
    }
    // 状态里的输入回传给上层
    LaunchedEffect(fieldState) {
        snapshotFlow { fieldState.text.toString() }
            .collect { latestOnValueChange(it) }
    }
    // 聚焦状态本地也持有一份：它现在只推**形态**（圆角长成胶囊），不再让图标让位
    var focused by remember { mutableStateOf(false) }
    // 长按之后"往上拖进标签页"的两个量（dp → px 只算一次，手势块里直接用）：
    // 起手死区 + 从全关拖到全开的行程（行程按屏高取比例，见 TAB_DRAG_TRAVEL_RATIO）
    val tabDragSlopPx = with(LocalDensity.current) { TAB_DRAG_SLOP.toPx() }
    val screenHeightDp = LocalConfiguration.current.screenHeightDp
    val tabDragTravelPx = with(LocalDensity.current) {
        (screenHeightDp * TAB_DRAG_TRAVEL_RATIO).dp.toPx()
    }
    /**
     * "选中态"（聚焦 / 引擎选择框展开 / 搜索页）0..1：**只推形态** ——
     * 输入框圆角长成与控制栏同档的胶囊。
     *
     * 它**不驱动输入框内部图标的让位**：用户点名"链接输入框展开后，里边的
     * 引擎选择图标和刷新按钮不见了，它们应该仍然存在" —— 那几枚只跟收起进度。
     * 而坞**两端**的外部按钮（回退 / 标签）该让位，由下面的 edgeLift 推。
     */
    val selectedLift by animateFloatAsState(
        targetValue = if (focused || pickerOpen || searchOpen) 1f else 0f,
        animationSpec = tween(260, easing = FastOutSlowInEasing),
        label = "addressSelectedLift"
    )
    /**
     * 编辑态（聚焦）0..1：展示层（网页名）与编辑层（原始内容）的交叉淡入。
     *
     * 展示态一律显示**网页名** —— 与收起态同一个读法（用户点名：输入框改为只显示
     * 网页名 + 右侧搜索引擎）；点开编辑才换成"原始内容"：搜索来的显示搜索词、
     * 导航来的显示页面地址（见 controller.addressEditText）。
     */
    val editLift by animateFloatAsState(
        targetValue = if (focused) 1f else 0f,
        animationSpec = tween(180, easing = FastOutSlowInEasing),
        label = "addressEditLift"
    )
    /**
     * 输入框"展开"（聚焦 / 引擎选择框 / 搜索页）推的**两端外部按钮**让位 0..1。
     *
     * 与 selectedLift 的区别：selectedLift 只推输入框自己的圆角；这一档推的是
     * 坞两端的外部按钮（左侧回退、右侧标签）—— 输入框展开后它们该整个让出整行
     *（用户点名：展开后不该还显示着左侧的回退按钮和右侧的标签按钮）。
     *
     * 输入框**内部**的引擎徽标 / 刷新 / 嗅探不跟它走：那几枚此前被用户点名
     * "必须留着"，只跟跟手的收起进度（见 hide）。
     */
    val edgeLift by animateFloatAsState(
        targetValue = if (focused || pickerOpen || searchOpen) 1f else 0f,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "addressEdgeLift"
    )
    /**
     * 输入框**内部**元素的让位程度 0..1：只由跟手的收起进度驱动。
     *
     * 引擎徽标、刷新键、嗅探键的宽度与透明度由它推，所以收起过程里它们是
     * **跟着一起缩**的，而不是到某一档才整块消失。
     */
    val hide = collapse.coerceIn(0f, 1f)
    /**
     * 坞**两端外部按钮**（回退 / 标签）的让位程度：跟手收起与"输入框展开"
     * 取较大者 —— 两条来源各自独立，任一条成立都该让位。
     */
    val edgeHide = maxOf(hide, edgeLift)
    // 收起判定（点它是恢复展开、胶囊里只报网页名）：与吸附用**同一个阈值**
    val collapsedNow = collapse >= DockFollow.SNAP_AT
    val sideButtonWidth = (38f * (1f - edgeHide)).dp
    // 淡得比缩得快一档：缩小到一半时图标已经看不见了，不会出现"压扁的图标"
    val sideButtonAlpha = (1f - edgeHide * 2f).coerceIn(0f, 1f)
    // 输入框高度：正常 38dp，收起态缩成细胶囊 —— **跟手**（38 ⇄ 30 连续）
    val surfaceHeight = lerpDp(38.dp, COLLAPSED_PILL_HEIGHT, collapse)
    // 聚焦时输入框下方长出的前缀条（与坞长高共用一条时间线）。
    // **面板开着就不长**：坞没有为它留高度（见 BrowserDock 的 prefixExtra），
    // 硬要长出来会把地址行挤扁
    val prefixHeight by animateDpAsState(
        targetValue = if (focused && !panelOpen) DOCK_PREFIX_HEIGHT else 0.dp,
        animationSpec = tween(280, easing = FastOutSlowInEasing),
        label = "addressPrefixHeight"
    )
    // 选中（聚焦或展开选择框）后圆角与控制栏对齐：控制栏是 46dp 高、
    // 23dp 圆角的胶囊，输入框要长成同一个胶囊形状，不能还是原来的小圆角。
    // **取"选中"与"收起"的较大值**：这两条各自独立（选中不再推让位，收起与选中
    // 无关），只跟 hide 的话聚焦态会掉回 16dp 的小圆角，读起来不像"从底部升起来的
    // 一层"（用户之前按这个读法定过）
    val surfaceCorner = lerpDp(16.dp, DOCK_CORNER, maxOf(hide, selectedLift))
    // 左右内边距：**聚焦 / 选择框展开 / 收起**这三档统一 —— 它们都是"左右按钮让位、
    // 输入框吃满宽度"的状态，边距必须一致，否则聚焦时左右各多出 2dp（用户：聚焦后
    // 左右流出的间距应该和引擎选择框展开时一致）。传统模式与聚焦贴边那档给 6dp 呼吸位。
    //
    // **必须走动画**：这个值就是"输入框可用宽度"的输入（见下面 BoxWithConstraints 里的
    // available），跳变会让输入框长度在一帧里突然变长/变短 —— 用户点名的"点一下输入框
    // 长度会突然跳一下"。补间之后，它是跟着坞一起**向左右展开**的
    val rowPad by animateDpAsState(
        targetValue = when {
            // 聚焦展开：坞已经贴到屏幕边，输入框跟着吃满宽度，只留 2dp 呼吸位
            //（用户："展开后，左右间距再减少一点点，就一点点" —— 上一轮是 3dp，
            // 这一轮再收 1dp；与下面 pillFlushPad 的一半相加 = 离屏幕边 4dp）
            flush -> 2.dp
            // 传统模式那一整条工具栏：内边距与聚焦档本来就是同一个 6dp
            docked -> 6.dp
            // 搜索界面（首页面板展开、还没聚焦）：**坞还是首页那一枚**（外边距
            // 16dp 由 dockSidePad 管），这里只管坞**里面**这枚输入框 —— 它的
            // 左右按聚焦档收边，所以用户在两种状态下读到的输入框留白一致，
            // 点进去不会横跳（用户点名）
            searchOpen -> 2.dp
            hide >= 0.5f -> 2.dp
            else -> 4.dp
        },
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "addressRowPad"
    )
    val rowPadStart = rowPad
    val rowPadEnd = rowPad
    // 嗅探入口的占位宽（宽度与透明度都走动画）。
    // 它住在**输入框内部**、刷新按钮右侧（用户点名：不再额外占一个位置）。
    // 宽度恒为 30dp —— 就是一枚**标准圆形**图标钮，与刷新按钮同档；
    // 有没有资源靠图标的着色区分（有内容染主色），不再用数字把圆撑成胶囊。
    // **收起过半就不再挂**：这时它已经缩得只剩零头，留着只会变成一枚
    // 画在圆外面的"隐形按钮"（点击判定跟着 28dp 的圆心走，比看到的宽）
    val sniffCount = controller.sniffed.size
    val sniffShown = (sniffCount > 0 || sniffOpen) && hide < 0.5f
    val sniffSlot by animateFloatAsState(
        targetValue = if (sniffShown) 1f else 0f,
        animationSpec = tween(260, easing = FastOutSlowInEasing),
        label = "sniffBtnSlot"
    )
    val sniffWidth = (30f * sniffSlot * (1f - hide)).dp
    val sniffAlpha = sniffSlot * (1f - hide)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = rowPadStart, end = rowPadEnd)
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            val available = maxWidth
            // 收起态宽度按网页名估算、展开态占满剩余空间：**同一个宽度值在动画**，
            // 因此观感是一枚胶囊在连续缩放，而不是两个组件切换
            // 展示层的内容：网页名（没标题退域名）。**自家首页给空状态提示** ——
            // 首页本来就没有名字，但输入框也不该是全空（用户点名：应该显示提示）
            val homeHint = stringResource(R.string.browser_address_hint)
            // 搜索结果页的"名字"就是**搜索词**：结果页的页面标题自带引擎名
            //（"天气 - Bing"），直接摆出来就是"网页名 + 引擎名"（用户点名不要）
            val searchWord = controller.currentSearchQuery
            // 用户在框里敲过、还没提交的内容：**收起 / 失焦之后也要看得见**
            //（用户点名：搜索页输入的内容在输入框收起后消失了）。判据必须带上
            // "与原始内容不同" —— 只看非空的话，普通页面浏览时框里本来就摆着
            // 地址，会把网页名顶掉
            val typed = fieldState.text.toString()
            val hasUserInput = typed.isNotEmpty() && typed != controller.addressEditText
            val nameText = when {
                hasUserInput -> typed
                controller.isHomePage -> homeHint
                else -> searchWord ?: controller.pageTitle.ifBlank {
                    com.lerxu.android.browser.TabNaming.host(controller.currentUrl)
                }
            }
            // 提示是次级信息，用次级色（与编辑层里那句提示同色）；网页名/搜索词/
            // 用户输入的内容用正文色
            val nameColor = if (controller.isHomePage && !hasUserInput) {
                colorScheme.onSurfaceVariant
            } else {
                colorScheme.onSurface
            }
            // 展开态的对齐：搜索后（结果页）居中，搜索页 / 普通页居左；
            // 用户输入的内容按编辑习惯居左。
            //
            // **收起态的"居中"不在这里切**：对齐是离散值，切过去那一帧必然横跳
            //（用户点名"过渡时会突然跳到居中"）—— 收起态由下面**独立的一层**做
            // 居中，两层按收起进度交叉淡入，位置变化被淡入淡出掩护掉
            val nameAlignOpen = if (!hasUserInput && !controller.isHomePage && searchWord != null) {
                TextAlign.Center
            } else {
                TextAlign.Start
            }
            // 居中档的水平补偿：文字区**左侧 = 输入行左内边距 + 引擎徽标**
            //（8 + 34·(1−hide)），右侧 = 右内边距 + 刷新 + 嗅探
            //（2 + 30·(1−hide) + 嗅探宽）。两侧不等宽，直接在文字区里居中 =
            // 相对胶囊中心偏左或偏右，且随嗅探显隐漂移 —— 用户点名"输入的内容
            // 还是会左右偏移"。偏移量就是 (左 − 右)/2，反号抵消。
            // **两端的 8 / 2 必须算进来**：漏掉它们补偿就会差 3dp 左右，看着还在偏
            val nameShift = if (nameAlignOpen == TextAlign.Center) {
                (-((8f + 34f * (1f - hide)) -
                    (2f + 30f * (1f - hide) + sniffWidth.value)) / 2f).dp
            } else {
                0.dp
            }
            // 收起层的水平补偿：收起态引擎 / 刷新 / 嗅探都让位，只剩输入行两端
            // 内边距的差（左 8 / 右 2）
            val nameShiftCollapsed = (-((8f - 2f) / 2f)).dp
            // 手势闭包要读**最新**的补偿值：pointerInput 的 key 是 collapsedNow，
            // 补偿值变化时块不会重启，直接捕获会一直用旧值（点击落点反查就会错）
            val latestNameShift by rememberUpdatedState(nameShift)
            // 收起进度直接用传入的跟手进度（0 = 吃满整条控制栏，1 = 收起成小胶囊）：
            // **不再套一层补间** —— 补间会让宽度去追一个还在动的目标（跟手就慢半拍），
            // 而吸附那一段补间已经在控制器里做完了
            // 输入框宽度**不再自己补间**，而是直接由当前实测宽推出来。
            //
            // 这里是"控制栏都出来了、链接输入框才开始动"（用户点名的不同步）的根因：
            // 容器正在形变（34% → 100%，340ms），`available` 每一帧都在变；再给宽度
            // 套一层 300ms 的 animateDpAsState，它每帧都在追一个还在移动的目标 ——
            // 容器 340ms 长完，输入框还要再追约 300ms 才到位，读起来就是"控制栏出现
            // 之后输入框才动"。直接推就没有第二次补间：输入框贴着容器走，同一帧起跑。
            //
            // 两侧按钮让出的宽度取**同一个量**（同一条 `hide` 驱动按钮与输入框，
            // 两边严丝合缝、不会互相追）。收起成胶囊那一档也是同一个量推的：
            // 收起时容器宽度不变，展开时它恒为 0，两者不打架。
            //
            // 嗅探按钮已经挪进胶囊内部（刷新按钮右侧），所以**不再从整行里让位** ——
            // 它只挤占输入框内部的文字宽度（那里本来就是 weight(1f)）。
            val sideTake = sideButtonWidth * 2
            // 输入框能占的**最大**宽度 = 整行减去两侧按钮与留白。
            //
            // 这里**不能再兜一个 120dp 的下限**（原来有）：容器还在形变时它只有 58% 宽
            // （≈190dp），而"两侧按钮 76 + 下限 120"已经 196dp —— 撑不下就
            // 溢出整行，多出来的部分被 Surface 按圆角裁掉，右侧那颗按钮先遭殃：
            // 读起来就是"展开期间右侧被遮住"（用户点名）。按钮那一侧内容更多，
            // 所以裁掉的观感偏在右边。
            //
            // 让输入框**只吃当下真正给得出的宽度**：容器长多宽、它就多宽，永远不溢出。
            // 留白取 `pillFlushPad`：左右各一半 + 容器自身的 rowPad —— 两档（聚焦 /
            // 引擎选择框展开）共用这一个值，所以两边的间距天然一致
            //（这两档的 rowPad 也相同，见上面的 rowPad）
            //
            // 聚焦展开时这一档**再收一点**（6dp → 4dp，用户："展开后左右间距再减少
            // 一点点，就一点点"）：加上 rowPad 的 2dp，离屏幕边总共 4dp。
            // 搜索界面取同一档（用户点名：坞里那枚输入框的左右留白与聚焦一致；
            // 坞本身的外边距仍走首页那一档，见 dockSidePad）
            // 必须走补间 —— 它直接进可用宽度算式，跳变会让输入框在一帧里突然变长/变短
            val pillFlushPad by animateDpAsState(
                targetValue = if (flush || searchOpen) 4.dp else 6.dp,
                animationSpec = tween(300, easing = FastOutSlowInEasing),
                label = "addressPillFlushPad"
            )
            val maxPill = (available - sideTake - pillFlushPad).coerceAtLeast(0.dp)
            // 收起态按网页名估宽，同样不能超过当下能给的最大宽度（否则一样被裁）
            // 收起态胶囊宽度**按实际内容自适应**（用户点名：收起时该跟着内容长短走，
            // 不是固定长度）—— 长网页名 / 你输入的内容会让胶囊变长，短就短；
            // 上限是坞内当下真正给得出的宽度
            val collapsedWidth = collapsedPillWidth(nameText).coerceAtMost(maxPill)
            val pillWidth = (maxPill.value +
                (collapsedWidth.value - maxPill.value) * collapse).dp
            // 内容交叉淡入：展示态 = 网页名（收起态与展开态同一个读法），
            // 编辑态（聚焦）= 原始内容（搜索词 / 地址）—— 两层由 editLift 交接。
            // **不再由收起进度推**：收起态显示的就是网页名，两者没有交接可言；
            // 会换层的只有"有没有在编辑"
            val editAlpha = editLift
            val nameAlpha = 1f - editLift
            // 名字的**连续位移**（用户点名"就要无缝过渡"）：对齐固定居左，需要居中的
            // 两档（展开时的结果页、收起后的胶囊）都用水平偏移推出来 ——
            // 偏移量按收起进度线性插值，所以文字是**滑**过去的：既不切换对齐（那会跳），
            // 也不淡出重生（那有空档）。
            //
            // "居中要滑多远" = (文字区宽 − 实测文字宽)/2。文字区是**胶囊内部**留给
            // 文字的那一段：胶囊内宽 − 左右内边距(8/2) − 引擎徽标 − 刷新 − 嗅探。
            // 这里**不能用整行宽**（above 的 available，之前就是用错了它）：它比文字区
            // 宽出一大截 —— 展开档会偏出去小半屏，收起档那一截甚至宽过整枚胶囊，
            // 位移直接把文字推出可视范围（用户点名"展开也不居中，收起后直接滑出"）。
            // 两个档位的文字区宽**各算各的**：展开档三颗按钮都在（hide=0），
            // 收起档它们收到 0、胶囊也收成"刚好包住文字"的窄条
            val nameAreaOpen = (maxPill - 10.dp - 34.dp - 30.dp - (30f * sniffSlot).dp)
                .coerceAtLeast(0.dp)
            val nameAreaCollapsed = (collapsedWidth - 10.dp).coerceAtLeast(0.dp)
            // 文字宽**在组合期量**（TextMeasurer）。不能用 onTextLayout 量：那是
            // 布局阶段的回调，写 state 要等下一帧才生效 —— 中间那一帧文字宽按 0 算，
            // 位移就成了"半个文字区"，文字先不居中、再被甩出去（用户点名）。
            // 约束给展开档的文字区宽（两档里更宽的那个）：超长文字量出来就是它，
            // 位移自然为 0（本就占满）；收起档的窄胶囊是"包着这段文字"算出来的，
            // 不会把文字再截短
            val nameMeasurer = rememberTextMeasurer()
            val nameDensity = LocalDensity.current
            // 文本样式在 @Composable 上下文里先取出来：measure 的 lambda 不是组合上下文，
            // 里面不能再碰 MaterialTheme（那是 @Composable 属性）
            val nameStyle = MaterialTheme.typography.bodySmall
            val nameAreaPx = with(nameDensity) { nameAreaOpen.roundToPx() }
            // 与渲染用的 Text 同一套排版参数（maxLines=1 + 省略号），量到多宽就渲染多宽。
            // 密度与样式也进 key：字体档位一变（系统字号 / 主题），量出来的宽就得重算
            val nameWidthDp = remember(nameText, nameAreaPx, nameStyle, nameDensity) {
                with(nameDensity) {
                    nameMeasurer.measure(
                        text = AnnotatedString(nameText),
                        style = nameStyle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        constraints = Constraints(maxWidth = nameAreaPx)
                    ).size.width.toDp()
                }
            }
            val travelOpen = ((nameAreaOpen - nameWidthDp) / 2f).coerceAtLeast(0.dp)
            val travelCollapsed = ((nameAreaCollapsed - nameWidthDp) / 2f).coerceAtLeast(0.dp)
            // 展开档居左时不推位移（nameShift 只在结果页那档非零，它补偿的是
            // 文字区两侧不对称的内边距 —— 把"文字区居中"改写成"胶囊居中"）
            val openOffset = if (nameAlignOpen == TextAlign.Center) travelOpen + nameShift else 0.dp
            val collapsedOffset = travelCollapsed + nameShiftCollapsed
            val nameSlide = lerpDp(openOffset, collapsedOffset, collapse)
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
        // 最左侧：**始终是后退**，没有历史可退时置灰。
        // 它不再兼职"退出浏览器"（同一个位置换图标换动作太容易误解）——
        // 但**长按**它可以直接回下载器的（用户点名要的手势），退出也还可以走系统返回键
        // 或标签页网格左上角那个写明「下载页」的按钮。
        // 输入框展开（聚焦 / 选择框 / 搜索页）或跟手收起时宽度动画到 0，
        // 把位置整个让给输入框（两条来源见 edgeHide）。
        if (sideButtonWidth > 0.dp) {
            val backEnabled = canGoBack || !controller.isHomePage
            Box(
                modifier = Modifier
                    .size(sideButtonWidth)
                    .graphicsLayer { alpha = sideButtonAlpha }
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        // 单击 = 后退（只走网页历史，没有上一页就什么都不做）；
                        // 长按 = 退出浏览器。用 combinedClickable 而不是 IconButton：
                        // IconButton 没有长按。
                        .clip(CircleShape)
                        .combinedClickable(
                            enabled = backEnabled,
                            onClick = { controller.goBack() },
                            onLongClick = onExitBrowser
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.browser_back),
                        modifier = Modifier.size(18.dp),
                        tint = if (backEnabled) androidx.compose.material3.LocalContentColor.current
                        else colorScheme.onSurface.copy(alpha = 0.38f)
                    )
                }
            }
        }
        // 输入条底色：它经常**单独悬浮在网页上**（现代模式收起态，坞的底已经隐去），
        // 近白底遇到白底网页就糊成一片（用户点名）。浅色主题用比坞再深一档的灰
        // —— 既读作"坞里挖出来的输入区"，单独浮在白色网页上也分得开；
        // 深色主题沿用 surface（本来就比坞深，同一读法）。
        val pillColor = if (colorScheme.background.luminance() > 0.5f) {
            lerp(colorScheme.surfaceContainerHighest, Color.Black, 0.16f)
        } else {
            colorScheme.surface
        }
        Surface(
            modifier = Modifier
                .width(pillWidth)
                .height(surfaceHeight),
            shape = RoundedCornerShape(surfaceCorner),
            color = pillColor
        ) {
            // 收起 / 展开共用**同一棵结构**：尺寸（宽高圆角）由动画连续变化，
            // 文字内容交叉淡入（URL ⇄ 网页名），不存在"两个组件交替"的割裂
            Column(modifier = Modifier.fillMaxSize()) {
                // 引擎选择框**不在这里**：它长在坞的上半截（控制栏向上扩展，
                // 见 BrowserDock）。输入框自己保持原高，只把宽度放开。
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        // 收起态整条输入行随胶囊一起收窄（30dp）
                        .height(surfaceHeight)
                        .padding(start = 8.dp, end = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                // 当前搜索引擎的徽标：**在输入框最左侧**（用户确认过位置 —— 放到右侧
                // 试过一版，读起来不对）。点开引擎选择框（**控制栏**向上长高一截）。
                // 选择框开着期间徽标底**常亮**，给出「现在是选择态」的锚点；
                // 收起时整个图标跟着进度让位（宽度连续收到 0），胶囊里只留网页名
                val iconHalo by animateColorAsState(
                    targetValue = if (pickerOpen) colorScheme.primaryContainer else Color.Transparent,
                    animationSpec = tween(200, easing = FastOutSlowInEasing),
                    label = "engineIconHalo"
                )
                val engineIconWidth = (34f * (1f - hide)).dp
                if (engineIconWidth > 0.dp) {
                    Box(
                        modifier = Modifier
                            .width(engineIconWidth)
                            .clipToBounds()
                            .graphicsLayer {
                                alpha = (engineIconWidth / 34.dp).coerceIn(0f, 1f)
                            }
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .background(iconHalo, CircleShape)
                                    // 缩到只剩零头时别再吃点击（圆本身还是 28dp，
                                    // 点击判定比看到的宽得多）
                                    .clickable(enabled = hide < 0.4f, onClick = onEngineIcon),
                                contentAlignment = Alignment.Center
                            ) {
                                EngineIcon(key = controller.engine.key, size = 20.dp)
                            }
                            Spacer(Modifier.width(6.dp))
                        }
                    }
                }
                // 输入区的手势由这层接管（在 Initial pass 先于 BasicTextField 观察并吞掉，
                // 否则长按会被输入框解释成"聚焦/选词"，根本轮不到复制）：
                // 单击 = **立即**聚焦并弹键盘（不等双击判定，杜绝"过一会才响应"）；
                // 双击 = 清空当前内容；长按 = 复制整条链接（Snackbar 回执）
                Box(
                    modifier = Modifier
                        .weight(1f)
                        // key 用**跟手进度的离散档**（不是地址文本）：key 一变这个块会被
                        // **重启**，正在处理的那一次点击就被取消了 —— 页面加载中地址文本
                        // 一直在变，用文本当 key 会让"加载时点输入框"时灵时不灵（用户点名的
                        // "有时点不动"）；而用连续的进度当 key 则每帧都重启，手势根本活不过
                        // 一帧。收起与否才是这个手势真正依赖的状态
                        .pointerInput(collapsedNow) {
                            val longMs = android.view.ViewConfiguration.getLongPressTimeout().toLong()
                            val doubleMs = android.view.ViewConfiguration.getDoubleTapTimeout().toLong()
                            // **整个手势循环必须兜住异常**：pointerInput 的块一旦抛出去，
                            // 这个块就被彻底终止、不会再被调用 —— 表现就是"输入框从此
                            // 点不动了"（用户点名的"有时会变成无法点击"）。
                            // 取消异常必须原样抛出（吞掉它会让协程带着已取消的状态空转）
                            try {
                            awaitEachGesture {
                                val down = awaitFirstDown(requireUnconsumed = false)
                                down.consume()
                                // 这个手势有**三种结局**，谁先到算谁：
                                // 1. 手指往上移过起手死区 → **立刻**跟手推网格。不等长按：
                                //    要按住 500ms 才动，读起来就是"固定阈值、不跟手"
                                //   （用户点名："它并不跟手，还是固定阀值"）；
                                // 2. 一直不动、等到长按超时 → 长按态：原地抬手 = 复制完整链接；
                                // 3. 没到长按就抬手 → 点一下（收起态恢复 / 展开态聚焦）。
                                //
                                // 跟手的做法与坞那一路同一套（见 DockFollow）：这里只把手指的
                                // **纵向增量**逐帧交给控制器，进度由控制器累加并夹在 0..1；
                                // 抬手那一下才由它按"过没过一半"吸附。
                                var dragging = false
                                var longPressed = false
                                var lastY = down.position.y
                                val longPressAt = down.uptimeMillis + longMs
                                var released = false
                                // 抬手那一点：点一下的"点哪儿光标落哪儿"要用它
                                var releasePos = down.position
                                while (!released) {
                                    // 还没进跟手、也还没到长按：这一段**带超时地等**，
                                // 超时就转成长按态；已经进跟手/长按之后就一直等事件
                                    val remaining =
                                        longPressAt - android.os.SystemClock.uptimeMillis()
                                    val event = if (!dragging && !longPressed && remaining > 0L) {
                                        withTimeoutOrNull(remaining) {
                                            awaitPointerEvent(PointerEventPass.Initial)
                                        } ?: run {
                                            longPressed = true
                                            null
                                        }
                                    } else {
                                        awaitPointerEvent(PointerEventPass.Initial)
                                    }
                                    if (event == null) continue
                                    event.changes.forEach { it.consume() }
                                    val change = event.changes.firstOrNull() ?: continue
                                    if (!change.pressed) {
                                        releasePos = change.position
                                        released = true
                                        break
                                    }
                                    val dy = change.position.y - lastY
                                    lastY = change.position.y
                                    if (!dragging &&
                                        change.position.y - down.position.y < -tabDragSlopPx
                                    ) {
                                        dragging = true
                                    }
                                    if (dragging) controller.followGrid(dy, tabDragTravelPx)
                                }
                                if (dragging) {
                                    // 抬手吸附：过半就开，没过半收回（从当前进度接着补间）
                                    controller.settleGrid()
                                } else if (longPressed) {
                                    // 原地长按抬手 = 复制**完整链接**
                                    // 展示态框里显示的是网页名、编辑层摆的是搜索词或
                                    // 去掉协议的简写，照抄过去都不是一条能打开的地址。
                                    // "用户改过没有"拿**原始内容**（addressEditText）当基准：
                                    // 没动过就复制当前页的真实 URL；真改过（比如改成新
                                    // 网址要访问）才复制他改出来的内容
                                    val shown = fieldState.text.toString()
                                    val real = controller.currentUrl
                                    val copy = if (shown.isNotBlank() &&
                                        shown == controller.addressEditText
                                    ) real else shown
                                    if (copy.isNotBlank()) {
                                        clipboard.setText(
                                            androidx.compose.ui.text.AnnotatedString(copy)
                                        )
                                        onCopied()
                                    }
                                } else {
                                    // 收起态：单击 = 恢复完整控制栏（不聚焦、不弹键盘）；
                                    // 展开态：抬手即聚焦 + 弹键盘（不等双击判定）
                                    if (collapsedNow) {
                                        onCollapsedRestore()
                                    } else {
                                        // 点哪儿光标就落到哪儿：用文本布局把触点反查成偏移。
                                        // 编辑层带着水平补偿（offset），触点要先减去它才落
                                        // 到正确的字符上（不减的话居中的那档会点错位置）
                                        textLayout?.let { layout ->
                                            val shiftPx = latestNameShift.toPx()
                                            val offset = layout.getOffsetForPosition(
                                                releasePos - Offset(shiftPx, 0f)
                                            )
                                            fieldState.edit { selection = TextRange(offset) }
                                        }
                                        // requestFocus 在"还没挂到可聚焦节点上"时会抛
                                        // IllegalStateException（典型触发：坞正在形态切换、
                                        // 同一个 FocusRequester 短暂挂了两份）—— 不让它
                                        // 把整个手势块带走
                                        runCatching { focusRequester.requestFocus() }
                                        runCatching { keyboard?.show() }
                                        val second = withTimeoutOrNull(doubleMs) {
                                            awaitFirstDown(
                                                requireUnconsumed = false,
                                                pass = PointerEventPass.Initial
                                            )
                                        }
                                        if (second != null) {
                                            second.consume()
                                            if (fieldState.text.isNotEmpty()) onValueChange("")
                                            while (true) {
                                                val event = awaitPointerEvent(PointerEventPass.Initial)
                                                event.changes.forEach { it.consume() }
                                                if (event.changes.none { it.pressed }) break
                                            }
                                        }
                                    }
                                }
                            }
                            } catch (e: kotlinx.coroutines.CancellationException) {
                                // 块被重组/换 key 取消：原样抛出，别当成错误吞掉。
                                // 但**先把手上的跟手收尾**：不然网格会卡在"跟着手指的那一档"
                                // 再也不动（跟手进度是我们自己拿着的，取消不会替我们吸附）
                                controller.settleGrid()
                                throw e
                            } catch (t: Throwable) {
                                // 单次手势出错：吞掉这一次，下一轮 awaitEachGesture 照常接管
                                // —— 不这么做的话输入框会永久失去点击能力。同样要收尾跟手
                                controller.settleGrid()
                            }
                        }
                ) {
                    // 编辑态的主角：链接输入框（点开编辑才出现 —— 展示态看到的是
                    // 网页名）。淡入与网页名的淡出是同一根进度推的，不会出现
                    // "字先换、层再动"的两段式。
                    //
                    // 对齐与水平补偿和**展示层用同一套**：结果页那档编辑时也居中、
                    // 走同一个 nameShift —— 两层不一致的话，点开/收起会让文字从
                    // 中间横跳到左边（用户点名"输入的内容会左右偏移"）
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .offset(x = nameShift)
                            .graphicsLayer { alpha = editAlpha }
                    ) {
                        if (fieldState.text.isEmpty()) {
                            Text(
                                stringResource(R.string.browser_address_hint),
                                style = MaterialTheme.typography.bodySmall,
                                color = colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        BasicTextField(
                        state = fieldState,
                        onTextLayout = captureLayout,
                        lineLimits = androidx.compose.foundation.text.input.TextFieldLineLimits.SingleLine,
                        textStyle = TextStyle(
                            color = colorScheme.onSurface,
                            fontSize = MaterialTheme.typography.bodySmall.fontSize,
                            // 与展开态的名字层同一套对齐（结果页居中、其余居左）——
                            // 见编辑层 Box 上的说明
                            textAlign = nameAlignOpen
                        ),
                        cursorBrush = SolidColor(colorScheme.primary),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Uri,
                            imeAction = ImeAction.Go
                        ),
                        onKeyboardAction = androidx.compose.foundation.text.input.KeyboardActionHandler {
                            // 输入法回发的任何提交动作都走同一条路：加载 + 收键盘 + 失焦
                            //
                            // 框里的显示值是**去掉协议的简写**（见上面的 TabNaming.subtitle）。
                            // 用户没动过这串字、直接敲回车时不能拿简写去解析 —— 裸域名会被
                            // 补成 `https://`（原本 http 的站被升级）、`www.` 与末尾斜杠也
                            // 回不来。显示态与当前页一致就走真实地址，其余照常解析
                            val typed = fieldState.text.toString()
                            val real = controller.currentUrl
                            if (typed.isNotBlank() &&
                                typed == com.lerxu.android.browser.TabNaming.subtitle(real)
                            ) {
                                controller.loadUrl(real)
                            } else {
                                controller.load(typed, controller.engine)
                            }
                            keyboard?.hide()
                            focusManager.clearFocus()
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focusRequester)
                            .onFocusChanged {
                                focused = it.isFocused
                                onFocusChange(it.isFocused)
                            }
                    )
                    }
                    // 展示态的主角：网页名（收起态与展开态都显示它 —— 用户点名
                    // "输入框改为只显示网页名称"）。**与上面那层同处一枚胶囊、
                    // 同时在场**，各自带透明度交叉淡入，而不是两个组件交替
                    //（用户点名过"不要两个组件来回换"）；没有标题时退到域名
                    // 名字层：**单层 + 连续位移**（见上面 nameSlide）。基准对齐恒为居左，
                    // 居中的那两档都由位移推出来，所以展开 ⇄ 收起是滑动，无跳变也无空档。
                    // 位移量里的文字宽在组合期量（TextMeasurer），不靠布局回调
                    if (nameAlpha > 0.01f && nameText.isNotEmpty()) {
                        Text(
                            text = nameText,
                            style = MaterialTheme.typography.bodySmall,
                            color = nameColor,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Start,
                            modifier = Modifier
                                .fillMaxWidth()
                                .offset(x = nameSlide)
                                .graphicsLayer { alpha = nameAlpha }
                        )
                    }
                }
                // 刷新 / 停止：收在输入框右侧；收起时跟着进度让位（宽度连续收到 0）
                val refreshWidth = (30f * (1f - hide)).dp
                if (refreshWidth > 0.dp) {
                    Box(
                        modifier = Modifier
                            .size(refreshWidth)
                            .graphicsLayer {
                                alpha = (refreshWidth / 30.dp).coerceIn(0f, 1f)
                            }
                    ) {
                        IconButton(
                            onClick = {
                                if (controller.loading) controller.stopLoading() else controller.reload()
                            },
                            modifier = Modifier.fillMaxSize()
                        ) {
                            if (controller.loading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(13.dp),
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(
                                    Icons.Default.Refresh,
                                    contentDescription = stringResource(R.string.refresh),
                                    modifier = Modifier.size(16.dp),
                                    tint = colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
                    // ── 影视模式入口：住在输入框**内部**、刷新按钮右侧 ──
                    //
                    // 用户口径：
                    // - 原来这一格是「本页资源」按钮，移除它、把影视模式入口放进来；
                    // - **不带背景**：只画图标 / 斜杠，底色交给坞本身；
                    // - 不在影视模式时是**胶片图标**（点了进），在影视模式时是**一条斜杠**（点了退）。
                    if (movieSite && sniffWidth > 0.dp) {
                        Box(
                            modifier = Modifier
                                .size(sniffWidth)
                                // 跟着收回来的槽位会把 28dp 的圆切掉一截：裁掉而不是
                                // 让圆溢出到槽位外面（与引擎徽标同一处理）
                                .clipToBounds()
                                .graphicsLayer { alpha = sniffAlpha },
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    // 缩到零头时别再吃点击（判定区比看到的大）
                                    .clickable(enabled = hide < 0.4f) { onMovieMode() },
                                contentAlignment = Alignment.Center
                            ) {
                                if (movieMode) {
                                    // 在影视模式里：**胶片图标 + 一道斜杠**（用户口径：斜杠表示点了退出）。
                                    // 图标压暗一点，斜杠才读得出来是"划掉"而不是图标本身的花纹
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = Icons.Default.Movie,
                                            contentDescription = stringResource(R.string.movie_mode),
                                            modifier = Modifier.size(17.dp),
                                            tint = colorScheme.primary.copy(alpha = 0.45f)
                                        )
                                        Box(
                                            Modifier
                                                .rotate(-45f)
                                                .width(2.dp)
                                                .height(20.dp)
                                                .background(
                                                    colorScheme.primary,
                                                    RoundedCornerShape(1.dp)
                                                )
                                        )
                                    }
                                } else {
                                    Icon(
                                        imageVector = Icons.Default.Movie,
                                        contentDescription = stringResource(R.string.movie_mode),
                                        modifier = Modifier.size(17.dp),
                                        tint = colorScheme.primary
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        // 最右：**更多功能**（用户点名：原来是标签页入口，换成它）。
        // 标签页并没有消失 —— 它挪进了这个弹窗，外加"新建标签 / 主页 / 下载页 / 设置"；
        // 另外**按住链接输入框往上拖**也能直接进标签页（见输入区那段手势）
        if (sideButtonWidth > 0.dp) {
            Box(
                modifier = Modifier
                    .size(sideButtonWidth)
                    .graphicsLayer { alpha = sideButtonAlpha }
            ) {
                // 点按开「更多功能」弹窗；**长按仍是坞内设置面板**（界面方案）
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape)
                        .combinedClickable(onClick = onMore, onLongClick = onTabsLongPress),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Rounded.MoreHoriz,
                        contentDescription = stringResource(R.string.browser_dock_more),
                        modifier = Modifier.size(22.dp),
                        tint = colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        }
        }
        // 聚焦时由**容器**向下长出的常用前缀条：纯文字、统一间距，
        // 点一下追加到当前输入末尾（输入框本身不长高，长高的是外面的坞）
        if (prefixHeight > 0.dp) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(prefixHeight)
                    .clipToBounds()
                    .graphicsLayer {
                        alpha = (prefixHeight / DOCK_PREFIX_HEIGHT).coerceIn(0f, 1f)
                    },
                horizontalArrangement = Arrangement.spacedBy(26.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically
            ) {
                ADDRESS_PREFIXES.forEach { prefix ->
                    Text(
                        prefix,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            // 追加用的是**输入框里此刻的文本**，不是外面那份受控值：
                            // 后者是异步回传过来的，刚敲完字立刻点前缀时可能还滞后一帧，
                            // 用它会把刚敲进去的字符回退掉
                            .clickable { onValueChange(fieldState.text.toString() + prefix) }
                            .padding(horizontal = 2.dp, vertical = 2.dp)
                    )
                }
            }
        }
    }
}

// ─── 顶栏：左上角速度信息，右上角添加 ───

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LerxuTopBar(
    state: EngineRepository.UiState,
    connected: Boolean,
    page: AppPage,
    onOpenSettings: () -> Unit,
    onBackToTasks: () -> Unit,
    sortBy: String,
    onSelectSort: (String) -> Unit,
    onAddTask: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    // 任务页显示速度信息与排序/添加入口；设置页显示标题。
    // 浏览器页不共用这条顶栏（它有地址栏），故不在此处理。
    val inSettings = page == AppPage.Settings
    val tasksActive = page == AppPage.Tasks
    TopAppBar(
        // 左侧不放入口：浏览器入口在底部坞，返回按钮在右侧（设置页那一格）
        navigationIcon = { Spacer(Modifier.width(0.dp)) },
        title = {
            // 标题随页面切换交叉滑动：速度信息 ↔ "设置"，无跳变
            AnimatedContent(
                targetState = inSettings,
                transitionSpec = {
                    val dir = if (targetState) 1 else -1
                    (slideInHorizontally(tween(280, easing = FastOutSlowInEasing)) { dir * it / 3 } +
                        fadeIn(tween(280))) togetherWith
                        (slideOutHorizontally(tween(200, easing = FastOutSlowInEasing)) { -dir * it / 3 } +
                        fadeOut(tween(180)))
                },
                label = "topBarTitle"
            ) { inSettings ->
                when {
                    inSettings -> {
                        Text(stringResource(R.string.settings))
                    }
                    connected -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.ArrowDownward,
                                    contentDescription = stringResource(R.string.download_speed),
                                    modifier = Modifier.size(15.dp),
                                    tint = colorScheme.primary
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    formatSpeed(state.globalStat.downloadSpeed),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = colorScheme.onSurface
                                )
                            }
                            Spacer(Modifier.width(16.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.ArrowUpward,
                                    contentDescription = stringResource(R.string.upload_speed),
                                    modifier = Modifier.size(15.dp),
                                    tint = colorScheme.tertiary
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    formatSpeed(state.globalStat.uploadSpeed),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = colorScheme.onSurface
                                )
                            }
                        }
                    }
                }
            }
        },
        actions = {
            // 单一进度驱动整条按钮带右移两格（排序+添加的槽位宽度）：
            // 返回按钮终点与旧布局右对齐后的位置一致，但全程连续插值无跳变；
            // 排序/添加按钮同带速跟随右移并淡出。
            val actionsProgress by animateFloatAsState(
                targetValue = if (tasksActive) 0f else 1f,
                animationSpec = tween(240, easing = FastOutSlowInEasing),
                label = "topBarActionsProgress"
            )
            // 设置入口 / 返回：始终占最右这一格，进入设置页时齿轮原地变成返回箭头。
            // 排序与添加往右滑走（两格），这一格顺势滑到最右 —— 一个进度值驱动，
            // 全程连续插值，所以不会有"按钮换位置"的跳变。
            IconButton(
                onClick = { if (inSettings) onBackToTasks() else onOpenSettings() },
                enabled = inSettings || tasksActive,
                modifier = Modifier.graphicsLayer {
                    translationX = size.width * 2f * actionsProgress
                }
            ) {
                val iconProgress by animateFloatAsState(
                    targetValue = if (inSettings) 1f else 0f,
                    animationSpec = tween(320, easing = FastOutSlowInEasing),
                    label = "settingsIconProgress"
                )
                val backDesc = stringResource(R.string.back)
                val settingsDesc = stringResource(R.string.settings)
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clipToBounds()
                        .semantics {
                            contentDescription = if (inSettings) backDesc else settingsDesc
                        }
                ) {
                    // 齿轮：进度 0 → 1 时向右滑出一格（超出部分被裁掉）
                    Icon(
                        Icons.Default.Settings,
                        contentDescription = null,
                        modifier = Modifier.graphicsLayer {
                            translationX = size.width * iconProgress
                        }
                    )
                    // 返回箭头：进度 0 → 1 时从左侧一格滑入就位
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = null,
                        modifier = Modifier.graphicsLayer {
                            translationX = size.width * (iconProgress - 1f)
                        }
                    )
                }
            }
            // 排序/添加按钮：槽位固定不移除，随按钮带同速右移并淡出，
            // 全程 graphicsLayer 连续插值；淡出后禁用点击。
            // 排序按钮：仅主页显示；进设置时随带右移淡出。
            // 点击弹出锚定在按钮右下方的局部菜单（与桌面端同源：点同项切方向，点新字段默认升序）
            Box(
                modifier = Modifier.graphicsLayer {
                    translationX = size.width * 2f * actionsProgress
                    alpha = 1f - actionsProgress
                }
            ) {
                var sortMenuExpanded by remember { mutableStateOf(false) }
                Box {
                    IconButton(
                        onClick = { sortMenuExpanded = true },
                        enabled = connected && tasksActive
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = stringResource(R.string.sort))
                    }
                    DropdownMenu(
                        expanded = sortMenuExpanded,
                        onDismissRequest = { sortMenuExpanded = false },
                        offset = DpOffset(0.dp, 2.dp),
                        shape = RoundedCornerShape(16.dp),
                        containerColor = colorScheme.surfaceContainerHigh,
                        shadowElevation = 8.dp
                    ) {
                        sortOptions().forEach { option ->
                            val fieldSelected = sortBy.startsWith("${option.key}_")
                            val ascending = sortBy == "${option.key}_asc"
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        stringResource(option.label),
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = if (fieldSelected) FontWeight.SemiBold else FontWeight.Normal,
                                        color = if (fieldSelected) colorScheme.primary else colorScheme.onSurface
                                    )
                                },
                                trailingIcon = {
                                    // 与桌面端一致：仅选中项右侧显示方向三角
                                    if (fieldSelected) {
                                        Icon(
                                            if (ascending) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                                            contentDescription = null,
                                            tint = colorScheme.primary,
                                            modifier = Modifier.size(15.dp)
                                        )
                                    }
                                },
                                onClick = {
                                    // 点同一项 → 切换方向；点新字段 → 默认升序（与桌面端交互一致）
                                    onSelectSort(if (fieldSelected) "${option.key}_${if (ascending) "desc" else "asc"}" else "${option.key}_asc")
                                    sortMenuExpanded = false
                                }
                            )
                        }
                    }
                }
            }
            // 添加按钮：仅主页显示；进设置时向右淡出。
            Box(
                modifier = Modifier.graphicsLayer {
                    translationX = size.width * 2f * actionsProgress
                    alpha = 1f - actionsProgress
                }
            ) {
                IconButton(onClick = onAddTask, enabled = connected && tasksActive) {
                    Icon(Icons.Default.Add, contentDescription = stringResource(R.string.add_task))
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.background
        )
    )
}

// ─── 编辑模式：底部悬浮控制栏 ───

@Composable
private fun SelectionBarOverlay(
    visible: Boolean,
    count: Int,
    allSelected: Boolean,
    confirming: Boolean,
    onClose: () -> Unit,
    onToggleSelectAll: () -> Unit,
    onRequestConfirm: () -> Unit,
    onCancelConfirm: () -> Unit,
    onConfirmDelete: (deleteFiles: Boolean) -> Unit
) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(
            initialOffsetY = { it },
            animationSpec = tween(260, easing = FastOutSlowInEasing)
        ) + fadeIn(),
        exit = slideOutVertically(
            targetOffsetY = { it },
            animationSpec = tween(220, easing = FastOutSlowInEasing)
        ) + fadeOut()
    ) {
        SelectionBar(
            count = count,
            allSelected = allSelected,
            confirming = confirming,
            onClose = onClose,
            onToggleSelectAll = onToggleSelectAll,
            onRequestConfirm = onRequestConfirm,
            onCancelConfirm = onCancelConfirm,
            onConfirmDelete = onConfirmDelete
        )
    }
}

@Composable
private fun SelectionBar(
    count: Int,
    allSelected: Boolean,
    confirming: Boolean,
    onClose: () -> Unit,
    onToggleSelectAll: () -> Unit,
    onRequestConfirm: () -> Unit,
    onCancelConfirm: () -> Unit,
    onConfirmDelete: (deleteFiles: Boolean) -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        color = colorScheme.surfaceContainerHigh,
        contentColor = colorScheme.onSurface,
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 10.dp,
        tonalElevation = 2.dp,
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .fillMaxWidth()
    ) {
        // 双态内容交叉切换：普通态 ⇄ 删除确认态（面板高度平滑扩展/收缩）
        AnimatedContent(
            targetState = confirming,
            transitionSpec = {
                (fadeIn(animationSpec = tween(220, easing = FastOutSlowInEasing)) togetherWith
                    fadeOut(animationSpec = tween(160)))
                    .using(SizeTransform(clip = false))
            },
            label = "selectionBarState"
        ) { confirm ->
            if (confirm) {
                ConfirmDeleteContent(count, onConfirmDelete, onCancelConfirm)
            } else {
                SelectionBarNormalContent(
                    count = count,
                    allSelected = allSelected,
                    onClose = onClose,
                    onToggleSelectAll = onToggleSelectAll,
                    onDelete = onRequestConfirm
                )
            }
        }
    }
}

// ─── 控制栏普通态：全选 + 已选数量 + 删除入口 + 退出编辑 ───

@Composable
private fun SelectionBarNormalContent(
    count: Int,
    allSelected: Boolean,
    onClose: () -> Unit,
    onToggleSelectAll: () -> Unit,
    onDelete: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier.padding(start = 18.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 勾选图标 = 全选/取消全选切换按钮
        Icon(
            if (allSelected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
            contentDescription = stringResource(if (allSelected) R.string.select_none else R.string.select_all),
            modifier = Modifier
                .size(22.dp)
                .clickable { onToggleSelectAll() },
            tint = if (allSelected) colorScheme.primary else colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.width(8.dp))
        Text(
            stringResource(R.string.selected_count, count),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f)
        )
        TextButton(
            onClick = onDelete,
            enabled = count > 0,
            colors = ButtonDefaults.textButtonColors(
                contentColor = colorScheme.error,
                disabledContentColor = colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
            )
        ) {
            Text(stringResource(R.string.delete), fontWeight = FontWeight.SemiBold)
        }
        IconButton(onClick = onClose) {
            Icon(Icons.Default.Close, contentDescription = stringResource(R.string.exit_edit_mode))
        }
    }
}

// ─── 控制栏删除确认态：栏内展开确认内容，不另弹窗 ───

@Composable
private fun ConfirmDeleteContent(
    count: Int,
    onConfirmDelete: (deleteFiles: Boolean) -> Unit,
    onCancel: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    var deleteFiles by remember { mutableStateOf(false) }

    Column(Modifier.padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 14.dp)) {
        Text(
            text = if (count > 1) stringResource(R.string.delete_multiple_tasks, count)
            else stringResource(R.string.delete_one_task),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = if (deleteFiles) stringResource(R.string.delete_with_files_msg)
            else stringResource(R.string.delete_record_only_msg),
            style = MaterialTheme.typography.bodySmall,
            color = colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(4.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { deleteFiles = !deleteFiles },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(
                checked = deleteFiles,
                onCheckedChange = { deleteFiles = it },
                colors = CheckboxDefaults.colors(checkedColor = colorScheme.primary)
            )
            Spacer(Modifier.width(4.dp))
            Text(
                stringResource(R.string.delete_local_files),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth()) {
            Button(
                onClick = onCancel,
                modifier = Modifier
                    .weight(1f)
                    .height(46.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colorScheme.surfaceContainerHighest,
                    contentColor = colorScheme.onSurface
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
            ) {
                Text(stringResource(R.string.cancel), fontWeight = FontWeight.Medium)
            }
            Spacer(Modifier.width(10.dp))
            Button(
                onClick = { onConfirmDelete(deleteFiles) },
                modifier = Modifier
                    .weight(1f)
                    .height(46.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colorScheme.error,
                    contentColor = colorScheme.onError
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
            ) {
                Text(stringResource(R.string.delete), fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

// ─── 设置页右滑返回：跟手位移，松手过阈值滑出、否则弹回 ───

@Composable
private fun SwipeBackBox(onBack: () -> Unit, content: @Composable () -> Unit) {
    val scope = rememberCoroutineScope()
    val offsetX = remember { Animatable(0f) }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer { translationX = offsetX.value }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        val w = size.width.toFloat()
                        scope.launch {
                            if (offsetX.value > w * 0.3f) {
                                // 越过阈值：滑出屏幕后返回（滑出态保留到退出动画结束，页面不回跳）
                                offsetX.animateTo(w, tween(240, easing = FastOutSlowInEasing))
                                onBack()
                            } else {
                                offsetX.animateTo(0f, tween(260, easing = FastOutSlowInEasing))
                            }
                        }
                    },
                    onDragCancel = {
                        scope.launch {
                            offsetX.animateTo(0f, tween(260, easing = FastOutSlowInEasing))
                        }
                    }
                ) { change, dragAmount ->
                    change.consume()
                    scope.launch {
                        offsetX.snapTo((offsetX.value + dragAmount).coerceAtLeast(0f))
                    }
                }
            }
    ) {
        content()
    }
}

// ─── 状态筛选 ───

private data class Scope(val key: String, val label: String)

/**
 * 分类行 + 搜索入口（同一组件）。
 * progress: 0 = 收起（仅圆形搜索图标，分类占满其余空间），
 * 1 = 完全展开（搜索框占满整行，分类淡出并被覆盖）。
 * 点击图标 → tween 丝滑展开至整行。
 */
@Composable
private fun ScopeFilterRow(
    currentScope: String,
    counts: Map<String, Int>,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onSelect: (String) -> Unit,
    expanded: Boolean,
    onExpand: () -> Unit,
    onCollapse: () -> Unit,
    searchFocused: Boolean,
    onSearchFocusChange: (Boolean) -> Unit
) {
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val progress = remember { Animatable(0f) }
    val focusRequester = remember { FocusRequester() }

    // 外部展开状态驱动动画：展开后自动聚焦输入框
    LaunchedEffect(expanded) {
        if (expanded) {
            progress.animateTo(1f, tween(300, easing = FastOutSlowInEasing))
            focusRequester.requestFocus()
        } else {
            focusManager.clearFocus()
            progress.animateTo(0f, tween(280, easing = FastOutSlowInEasing))
        }
    }

    // 键盘返回键：搜索展开时先收起搜索
    BackHandler(enabled = expanded) { onCollapse() }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(32.dp)
    ) {
        val fullWidth = maxWidth
        // 搜索框宽度：28dp(圆形图标，与分类 chip 实际渲染高度一致) ↔ 整行宽度（完全展开）
        val searchWidth = 28.dp + (fullWidth - 28.dp) * progress.value

        val scopes = listOf(
            Scope("all", stringResource(R.string.scope_all)),
            Scope("active", stringResource(R.string.scope_active)),
            Scope("seeding", stringResource(R.string.scope_seeding)),
            Scope("waiting", stringResource(R.string.scope_waiting)),
            Scope("paused", stringResource(R.string.scope_paused)),
            Scope("stopped", stringResource(R.string.scope_stopped))
        )

        // 分类列表：与搜索同处一个组件，随展开淡出、位置让行。
        //
        // 选中态是**一整块滑动的背景**（用户：切换分类后背景要有丝滑无缝的动画）：
        // chip 自己不带底色，底色由 Row 的 drawBehind 按"选中格此刻的矩形"画出来 ——
        // 换分类 = **同一块背景平移 + 变宽**，不是两个 chip 各自淡入淡出。
        // 矩形记在 Row 的**内容坐标**里：横向滚动时内容坐标不变，所以它天然跟着走，
        // 不需要补偿滚动量（用 root 坐标的话滚动时背景会"追"着跑）。
        val scopeBounds = remember { mutableStateMapOf<String, Rect>() }
        val pillRect = scopeBounds[currentScope]
        val pillColor = MaterialTheme.colorScheme.primaryContainer
        val pillLeft by animateFloatAsState(
            targetValue = pillRect?.left ?: 0f,
            animationSpec = tween(300, easing = FastOutSlowInEasing),
            label = "scopePillLeft"
        )
        val pillWidth by animateFloatAsState(
            targetValue = pillRect?.width ?: 0f,
            animationSpec = tween(300, easing = FastOutSlowInEasing),
            label = "scopePillWidth"
        )
        val pillHeight by animateFloatAsState(
            targetValue = pillRect?.height ?: 0f,
            animationSpec = tween(300, easing = FastOutSlowInEasing),
            label = "scopePillHeight"
        )
        // 首帧还没量到矩形：先不画（量到后 200ms 淡入），不然会从左上角"窜"过去
        val pillAlpha by animateFloatAsState(
            targetValue = if (pillRect == null) 0f else 1f,
            animationSpec = tween(200, easing = FastOutSlowInEasing),
            label = "scopePillAlpha"
        )

        Row(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = (1f - progress.value * 1.6f).coerceIn(0f, 1f) }
                .padding(start = searchWidth + 8.dp)
                .pointerInput(progress.value) {
                    // 展开后分类已被覆盖，拦截误触
                    if (progress.value > 0.5f) detectTapGestures { }
                }
                // 放在 horizontalScroll **之后**：这样它画在内容坐标系里，跟着一起滚
                .horizontalScroll(rememberScrollState())
                .drawBehind {
                    if (pillWidth <= 0.5f) return@drawBehind
                    drawRoundRect(
                        color = pillColor,
                        topLeft = Offset(pillLeft, (size.height - pillHeight) / 2f),
                        size = Size(pillWidth, pillHeight),
                        cornerRadius = CornerRadius(pillHeight / 2f),
                        alpha = pillAlpha
                    )
                },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            scopes.forEach { scope ->
                ScopeChip(
                    label = scope.label,
                    count = counts[scope.key] ?: 0,
                    selected = currentScope == scope.key,
                    onClick = { onSelect(scope.key) },
                    onBounds = { rect -> scopeBounds[scope.key] = rect }
                )
            }
        }

        // 搜索框（上层）：宽度随 progress 从圆形图标过渡到整行。
        // 高度 28dp 与分类 chip 一致（[ScopeChip] 就是 28dp），居中对齐
        Box(
            modifier = Modifier
                .width(searchWidth)
                .height(28.dp)
                .align(Alignment.CenterStart)
                .zIndex(1f)
        ) {
            SearchField(
                progress = progress.value,
                query = searchQuery,
                onQueryChange = onSearchQueryChange,
                // 唯一按钮：有内容时清空，无内容时收起
                onClear = { onSearchQueryChange("") },
                onClose = onCollapse,
                onExpand = onExpand,
                focusRequester = focusRequester,
                onFocusChange = onSearchFocusChange
            )
        }
    }
}

/**
 * 分类 chip：**自己不带底色** —— 底色是整行共享的那一块滑动指示器（见 [ScopeFilterRow]）。
 * 它只负责文字与数字，并把自己当前的矩形报到内容坐标里。
 *
 * 文字/数字的颜色跟着指示器一起过渡（[animateColorAsState]）：背景还在滑过去的路上时，
 * 颜色已经在对的路上，收尾不会"啪"地跳一下。
 */
@Composable
private fun ScopeChip(
    label: String,
    count: Int,
    selected: Boolean,
    onClick: () -> Unit,
    onBounds: (Rect) -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val labelColor by animateColorAsState(
        targetValue = if (selected) colorScheme.onPrimaryContainer else colorScheme.onSurfaceVariant,
        animationSpec = tween(220, easing = FastOutSlowInEasing),
        label = "scopeLabelColor"
    )
    val countColor by animateColorAsState(
        targetValue = if (selected) {
            colorScheme.onPrimaryContainer.copy(alpha = 0.65f)
        } else {
            colorScheme.onSurfaceVariant
        },
        animationSpec = tween(220, easing = FastOutSlowInEasing),
        label = "scopeCountColor"
    )
    Row(
        modifier = Modifier
            .height(28.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .onGloballyPositioned { coords ->
                // boundsInParent = Row 的**内容坐标**（不含横向滚动位移），
                // 所以指示器天然跟着内容滚，不用补偿
                onBounds(coords.boundsInParent())
            }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = labelColor)
        Spacer(Modifier.width(4.dp))
        Text("$count", style = MaterialTheme.typography.labelMedium, color = countColor)
    }
}

// ─── 搜索框：progress 0 = 圆形图标，1 = 完整搜索框 ───

@Composable
private fun SearchField(
    progress: Float,
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit,
    onClose: () -> Unit,
    onExpand: () -> Unit,
    focusRequester: FocusRequester,
    onFocusChange: (Boolean) -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val searchInteraction = remember { MutableInteractionSource() }
    val isFocused by searchInteraction.collectIsFocusedAsState()

    // 焦点变化上报给上层：决定遮罩行为与 ✕ 按钮行为
    LaunchedEffect(isFocused) { onFocusChange(isFocused) }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(16.dp))
            .background(colorScheme.surfaceContainerLow)
    ) {
        // 展开态：搜索框内容随进度渐显
        Row(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = ((progress - 0.5f) / 0.5f).coerceIn(0f, 1f) },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = null,
                modifier = Modifier
                    .padding(start = 10.dp)
                    .size(15.dp),
                tint = colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.width(6.dp))
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = colorScheme.onSurface),
                cursorBrush = SolidColor(colorScheme.primary),
                interactionSource = searchInteraction,
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(focusRequester),
                decorationBox = { inner ->
                    Box {
                        if (query.isEmpty()) {
                            Text(
                                stringResource(R.string.search_hint),
                                style = MaterialTheme.typography.bodyMedium,
                                color = colorScheme.onSurfaceVariant
                            )
                        }
                        inner()
                    }
                }
            )
            // 移除文本按钮：仅有内容时显示，点击清空搜索词
            if (query.isNotEmpty()) {
                IconButton(
                    onClick = { if (isFocused) onClear() else onClose() },
                    modifier = Modifier.size(28.dp).padding(end = 2.dp)
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(R.string.close),
                        modifier = Modifier.size(16.dp),
                        tint = colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        // 收起态：与分类 chip 同尺寸的圆形搜索按钮，点击向右展开
        Box(
            modifier = Modifier
                .size(28.dp)
                .align(Alignment.CenterStart)
                .graphicsLayer { alpha = (1f - progress * 2f).coerceIn(0f, 1f) }
                .clip(CircleShape)
                .background(colorScheme.surfaceContainerLow)
                .clickable(enabled = progress < 0.3f, onClick = onExpand),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = stringResource(R.string.search),
                tint = colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

// ─── 任务列表 ───

@Composable
private fun TaskList(
    tasks: List<TaskInfo>,
    selectionMode: Boolean,
    selectedGids: List<String>,
    onTaskClick: (String) -> Unit,
    onToggleStatus: (String) -> Unit,
    onToggleSelect: (String) -> Unit,
    onEnterSelection: (String) -> Unit,
    onDeleteTask: (String) -> Unit,
    bottomPadding: Dp
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 0.dp, end = 0.dp, top = 4.dp, bottom = bottomPadding
        )
    ) {
        itemsIndexed(tasks, key = { _, it -> it.gid }) { index, task ->
            SwipeActionCard(
                task = task,
                enabled = !selectionMode,
                onToggleStatus = { onToggleStatus(task.gid) },
                onDelete = { onDeleteTask(task.gid) },
                modifier = Modifier.animateItem()
            ) {
                TaskCard(
                    task = task,
                    selectionMode = selectionMode,
                    selected = selectedGids.contains(task.gid),
                    onClick = { onTaskClick(task.gid) },
                    onToggleStatus = { onToggleStatus(task.gid) },
                    onToggleSelect = { onToggleSelect(task.gid) },
                    onEnterSelection = { onEnterSelection(task.gid) }
                )
            }
            // 任务之间的划分横杠，左右留空间
            if (index < tasks.lastIndex) {
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    color = MaterialTheme.colorScheme.outlineVariant,
                    thickness = 0.5.dp
                )
            }
        }
    }
}

/**
 * 任务卡片左滑操作容器：
 * 向左滑动卡片，右侧操作按钮（暂停/恢复、删除）随滑动进度渐显；
 * 中途松手未过阈值自动弹回；点击按钮执行动作并自动归位。
 */
@Composable
private fun SwipeActionCard(
    task: TaskInfo,
    enabled: Boolean,
    onToggleStatus: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val offsetX = remember { Animatable(0f) }
    // 打开位：两个操作按钮的宽度（暂停/恢复 46 + 间距 8 + 删除 46 + 右缘 14）
    val openWidthPx = with(density) { 114.dp.toPx() }
    val canPause = task.status == "active" || task.status == "waiting" || task.status == "seeding"
    val isPaused = task.status == "paused"

    // 拖动被禁用（进入编辑模式）时，打开中的卡片自动归位
    LaunchedEffect(enabled) {
        if (!enabled && offsetX.value != 0f) {
            offsetX.animateTo(0f, tween(240, easing = FastOutSlowInEasing))
        }
    }

    Box(modifier = modifier.fillMaxWidth()) {
        // 背景操作按钮层（右对齐）：随滑动进度渐显 + 轻微右移入场
        val progress = (-offsetX.value / openWidthPx).coerceIn(0f, 1f)
        Row(
            modifier = Modifier
                .matchParentSize()
                .graphicsLayer {
                    alpha = progress
                    translationX = (1f - progress) * 36f
                },
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 暂停 / 恢复
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(if (canPause) colorScheme.primary else colorScheme.surfaceContainerHighest)
                    .clickable(enabled = canPause || isPaused) {
                        if (canPause || isPaused) {
                            onToggleStatus()
                            scope.launch {
                                offsetX.animateTo(0f, tween(220, easing = FastOutSlowInEasing))
                            }
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (canPause) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = stringResource(if (canPause) R.string.pause else R.string.resume),
                    tint = if (canPause) colorScheme.onPrimary else colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(19.dp)
                )
            }
            Spacer(Modifier.width(8.dp))
            // 删除（点击后卡片归位并弹出删除确认）
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(colorScheme.error)
                    .clickable {
                        onDelete()
                        scope.launch {
                            offsetX.animateTo(0f, tween(220, easing = FastOutSlowInEasing))
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = stringResource(R.string.delete),
                    tint = colorScheme.onError,
                    modifier = Modifier.size(19.dp)
                )
            }
            Spacer(Modifier.width(14.dp))
        }

        // 前景卡片：跟随手指水平位移
        Box(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), 0) }
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    detectHorizontalDragGestures(
                        onDragStart = { scope.launch { offsetX.stop() } },
                        onHorizontalDrag = { change, dragAmount ->
                            change.consume()
                            val target = (offsetX.value + dragAmount).coerceIn(-openWidthPx, 0f)
                            scope.launch { offsetX.snapTo(target) }
                        },
                        onDragEnd = {
                            scope.launch {
                                if (offsetX.value < -openWidthPx * 0.5f) {
                                    offsetX.animateTo(-openWidthPx, tween(220, easing = FastOutSlowInEasing))
                                } else {
                                    offsetX.animateTo(0f, tween(240, easing = FastOutSlowInEasing))
                                }
                            }
                        },
                        onDragCancel = {
                            scope.launch {
                                offsetX.animateTo(0f, tween(240, easing = FastOutSlowInEasing))
                            }
                        }
                    )
                }
        ) {
            content()
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TaskCard(
    task: TaskInfo,
    selectionMode: Boolean,
    selected: Boolean,
    onClick: () -> Unit,
    onToggleStatus: () -> Unit,
    onToggleSelect: () -> Unit,
    onEnterSelection: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val statusColor = Color(statusColor(task.status))
    val colorScheme = MaterialTheme.colorScheme
    val isActive = task.status == "active"
    val isError = task.status == "error"
    val interactionSource = remember { MutableInteractionSource() }

    // 选中态仅用卡片背景表达，布局零变化（高度恒定）
    val selectionBackground by animateColorAsState(
        targetValue = if (selected) colorScheme.primary.copy(alpha = 0.12f) else Color.Transparent,
        animationSpec = tween(180, easing = FastOutSlowInEasing),
        label = "selectionBackground"
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(selectionBackground)
            .combinedClickable(
                interactionSource = interactionSource,
                indication = LocalIndication.current,
                onClick = {
                    if (selectionMode) onToggleSelect() else onClick()
                },
                onDoubleClick = {
                    if (!selectionMode) onToggleStatus()
                },
                onLongClick = {
                    if (selectionMode) onToggleSelect() else onEnterSelection()
                }
            )
            .padding(horizontal = 16.dp, vertical = 9.dp)
    ) {
        // 标题行（编辑模式不插入任何元素，卡片高度不变）
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = task.fileName,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(Modifier.height(7.dp))

        // 连接中（active 但尚无速度、无进度）：滑动小段加载动画；
        // 与服务器建立连接后（速度>0 或有进度）自动消失，显示真实进度。
        // 磁力解析中（总大小未知）同样播放该动画。
        val indeterminate = task.status == "active" && task.downloadSpeed <= 0L &&
            task.completedLength <= 0L &&
            task.status != "complete" && task.status != "error"
        RoundedProgressBar(
            progress = task.progress,
            color = statusColor,
            // 轨道与任务详情页一致：状态色 18% 淡底（错误=淡红）；0% 时靠 fillMaxWidth 完整显示
            trackColor = statusColor.copy(alpha = 0.18f),
            height = 5.dp,
            indeterminate = indeterminate
        )

        Spacer(Modifier.height(6.dp))

        // 底部信息行：左下角「已下载/总大小 ｜ 百分比」，右下角速度与剩余/完成/错误时间
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "${formatBytes(task.completedLength)} / ${formatBytes(task.totalLength)}",
                style = MaterialTheme.typography.labelSmall,
                color = colorScheme.onSurfaceVariant,
                maxLines = 1
            )
            Spacer(Modifier.width(7.dp))
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(13.dp)
                    .background(colorScheme.outlineVariant)
            )
            Spacer(Modifier.width(7.dp))
            Text(
                text = "${task.percent}%",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = when {
                    isError -> colorScheme.error
                    isActive -> colorScheme.primary
                    else -> colorScheme.onSurfaceVariant
                }
            )
            Spacer(Modifier.weight(1f))
            when {
                task.status == "active" -> {
                    if (task.downloadSpeed > 0) {
                        Text(
                            formatSpeed(task.downloadSpeed),
                            style = MaterialTheme.typography.labelSmall,
                            color = colorScheme.primary
                        )
                        if (task.remainingSeconds > 0) Spacer(Modifier.width(8.dp))
                    } else {
                        // 尚未与服务器建立连接：明确提示连接中，而非空白
                        Text(
                            stringResource(R.string.connecting),
                            style = MaterialTheme.typography.labelSmall,
                            color = colorScheme.onSurfaceVariant
                        )
                    }
                    if (task.remainingSeconds > 0) {
                        Text(
                            formatDuration(task.remainingSeconds),
                            style = MaterialTheme.typography.labelSmall,
                            color = colorScheme.onSurfaceVariant
                        )
                    }
                }
                task.status == "seeding" -> {
                    Text(
                        stringResource(R.string.status_seeding),
                        style = MaterialTheme.typography.labelSmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                task.status == "paused" -> {
                    Text(
                        stringResource(R.string.status_paused),
                        style = MaterialTheme.typography.labelSmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                task.status == "complete" && task.finishedAt > 0 -> {
                    Text(
                        stringResource(R.string.completed_at, formatFinishedTime(context, task.finishedAt)),
                        style = MaterialTheme.typography.labelSmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
                task.status == "error" && task.finishedAt > 0 -> {
                    Text(
                        stringResource(R.string.error_at, formatFinishedTime(context, task.finishedAt)),
                        style = MaterialTheme.typography.labelSmall,
                        color = colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

// ─── 错误 ───

@Composable
private fun EngineErrorScreen(error: String, onRetry: () -> Unit) {
    var retrying by remember { mutableStateOf(false) }
    val colorScheme = MaterialTheme.colorScheme

    Box(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(CircleShape)
                    .background(colorScheme.errorContainer.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.ErrorOutline,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    tint = colorScheme.error
                )
            }
            Spacer(Modifier.height(18.dp))
            Text(
                stringResource(R.string.engine_start_failed),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(10.dp))
            Surface(
                color = colorScheme.errorContainer.copy(alpha = 0.4f),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    error,
                    style = MaterialTheme.typography.bodySmall,
                    color = colorScheme.onErrorContainer,
                    modifier = Modifier.padding(14.dp),
                    textAlign = TextAlign.Center
                )
            }
            Spacer(Modifier.height(22.dp))
            Button(
                onClick = {
                    retrying = true
                    onRetry()
                },
                enabled = !retrying,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                if (retrying) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.retry), fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

// ─── 空状态：复用桌面端图片 ───

@Composable
private fun EmptyState() {
    val colorScheme = MaterialTheme.colorScheme
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(
                painter = painterResource(R.drawable.no_task),
                contentDescription = null,
                modifier = Modifier.size(190.dp)
            )
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.no_tasks),
                style = MaterialTheme.typography.titleSmall,
                color = colorScheme.onSurfaceVariant
            )
        }
    }
}

// ─── 打开已下载的文件 ───

private fun openTaskFile(context: android.content.Context, task: com.lerxu.android.model.TaskInfo) {
    try {
        // 路径解析：优先 files[0]（引擎会话新任务均有）；
        // 回退「目录 + 任务名」——旧版本引擎会话恢复的任务 files 可能为空。
        // 回退结果是目录（多文件 BT 种子名 = 数据目录）时，取目录内最大的
        // 常规文件打开，避免只会弹"无法确定位置"。
        var filePath = task.filePath
        if (filePath.isEmpty() && task.fileName.isNotBlank() && task.dir.isNotBlank()) {
            filePath = java.io.File(task.dir, task.fileName).absolutePath
        }
        if (filePath.isEmpty()) {
            android.widget.Toast.makeText(context, context.getString(R.string.toast_file_location_unknown), android.widget.Toast.LENGTH_SHORT).show()
            return
        }
        var file = java.io.File(filePath)
        if (file.isDirectory) {
            val inner = file.listFiles()
                ?.filter { it.isFile }
                ?.maxByOrNull { it.length() }
            if (inner != null && inner.exists()) {
                file = inner
            } else {
                android.widget.Toast.makeText(context, context.getString(R.string.toast_is_directory), android.widget.Toast.LENGTH_SHORT).show()
                return
            }
        }
        if (!file.exists()) {
            android.widget.Toast.makeText(context, context.getString(R.string.toast_file_not_exist), android.widget.Toast.LENGTH_SHORT).show()
            return
        }
        val uri = androidx.core.content.FileProvider.getUriForFile(
            context, "${context.packageName}.fileprovider", file
        )
        val mime = context.contentResolver.getType(uri)
            ?: android.webkit.MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(file.extension.lowercase())
            ?: "application/octet-stream"
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        android.widget.Toast.makeText(
            context, context.getString(R.string.toast_no_app_to_open), android.widget.Toast.LENGTH_SHORT
        ).show()
    } catch (e: Exception) {
        android.widget.Toast.makeText(
            context, context.getString(R.string.toast_open_failed, e.message ?: ""), android.widget.Toast.LENGTH_SHORT
        ).show()
    }
}
