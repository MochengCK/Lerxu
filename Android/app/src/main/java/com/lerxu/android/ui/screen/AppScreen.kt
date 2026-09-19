package com.lerxu.android.ui.screen

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
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
import androidx.compose.ui.platform.LocalDensity
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
import com.lerxu.android.browser.DownloadHandoff
import com.lerxu.android.browser.SearchEngine
import com.lerxu.android.browser.SearchEngineDetector
import com.lerxu.android.browser.SearchEngines
import com.lerxu.android.engine.EngineManager
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
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
import androidx.compose.material3.MaterialTheme
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
    themePref: String = "system",
    onThemeChange: (String) -> Unit = {}
) {
    val context = androidx.compose.ui.platform.LocalContext.current
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
    val dockUiScope = rememberCoroutineScope()
    // 底部嗅探面板是否展开（只在浏览器页有效）
    var sniffOpen by remember { mutableStateOf(false) }
    val addressFocusRequester = remember { FocusRequester() }
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val isDarkTheme = when (themePref) {
        "dark" -> true
        "light" -> false
        else -> androidx.compose.foundation.isSystemInDarkTheme()
    }

    // 地址栏跟随页面；正在输入时不打断（首首页则留空，显示占位提示）
    LaunchedEffect(browserController.currentUrl, browserController.isHomePage, addressFocused) {
        if (!addressFocused) {
            addressInput = if (browserController.isHomePage) "" else browserController.currentUrl
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
        // 关掉最后一个标签页 = 退出浏览器
        browserController.onAllTabsClosed = { page = AppPage.Tasks }
    }

    // 离开浏览器页就解除收起态：回到任务页/设置页时坞必须完整
    LaunchedEffect(page) {
        if (page != AppPage.Browser) browserController.dockCollapsed = false
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
        if (page != AppPage.Browser) addressFocused = false
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
    LaunchedEffect(initialIntentData) {
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
                    topInset = windowTopInset
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
                        onSearchEngineChange = { key -> searchEngineKey = key }
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
                    // 首页内再让位给：地址栏 / 首页搜索框聚焦、提交后导航未开始、
                    // 标签网格展开。
                    val backToShow = page == AppPage.Browser && dockOpaque &&
                        browserController.isHomePage &&
                        !addressFocused && !browserController.homeInputFocused &&
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
                        },
                        onAddressCopied = {
                            dockUiScope.launch {
                                snackbarHostState.showSnackbar(
                                    context.getString(R.string.browser_link_copied)
                                )
                            }
                        },
                        controller = browserController,
                        engineName = searchEngine.name,
                        addressValue = addressInput,
                        onAddressChange = { addressInput = it },
                        onAddressFocusChange = { addressFocused = it },
                        focusRequester = addressFocusRequester,
                        bottomPadding = dockBottom,
                        sniffOpen = shelfOpen,
                        onLaunch = { page = AppPage.Browser },
                        // 长按返回键 = 直接回下载器（退出浏览器）；标签页留着，再进还在
                        onExitBrowser = { page = AppPage.Tasks },
                        onTabs = {
                            sniffOpen = false
                            browserController.openTabs()
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
    corner: Dp,
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
    // 圆角跟着高度与模式收：传统模式传入 0（方角整条），胶囊那一档下正好是半圆的圆头
    val radius = minOf(corner.toPx(), h / 2f)
    val path = Path().apply {
        addRoundRect(RoundRect(rect, CornerRadius(radius.coerceAtLeast(0f))))
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
    engineName: String,
    addressValue: String,
    onAddressChange: (String) -> Unit,
    onAddressFocusChange: (Boolean) -> Unit,
    focusRequester: FocusRequester,
    bottomPadding: Dp,
    sniffOpen: Boolean,
    onLaunch: () -> Unit,
    /** 长按左侧返回键：直接回下载器（退出浏览器）。 */
    onExitBrowser: () -> Unit,
    onTabs: () -> Unit,
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
    // 收起态单一真相在控制器：网页下滑（BrowserController 滚动监听）与坞上拖动
    // 都写它，界面只读它做动画。顶部面板（设置/引擎选择）展开时不进入收起态。
    val panelsOpen = settingsOpen || enginePickerOpen
    LaunchedEffect(panelsOpen) { controller.dockPanelsOpen = panelsOpen }
    val collapsed = modern && address && controller.dockCollapsed && !panelsOpen

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
        }
    }
    LaunchedEffect(modern, address, visible) {
        if (!modern || !address || !visible) controller.dockCollapsed = false
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
    LaunchedEffect(collapsed, overlayPx, modern, address, navBottom) {
        controller.updateDockAvoid(
            padPx = if (!address) 0 else (if (collapsed) 68 else 88) + overlayPx,
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
    // 收起形态进度：材质轮廓据此从整块收缩到收起态胶囊的尺寸
    val collapseMorph by animateFloatAsState(
        targetValue = if (collapsed) 1f else 0f,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockCollapseMorph"
    )
    // 浏览器按钮形态整体下沉一点：更贴底部（按钮无背景，位移不会带动控制栏）
    val launchDrop by animateDpAsState(
        targetValue = if (address) 0.dp else 6.dp,
        animationSpec = tween(340, easing = FastOutSlowInEasing),
        label = "dockLaunchDrop"
    )
    // 收起态轻微下沉：贴向底缘一点，但不压到导航条（用户：再向下一点点 6 → 10dp）
    val collapseDrop by animateDpAsState(
        targetValue = if (collapsed) 10.dp else 0.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockCollapseDrop"
    )

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
    val dockSidePad by animateDpAsState(
        targetValue = if (docked) 0.dp else 16.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockSidePad"
    )
    val dockTopPad by animateDpAsState(
        targetValue = if (docked) 0.dp else 6.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockTopPad"
    )
    val dockCorner by animateDpAsState(
        targetValue = if (docked) 0.dp else DOCK_CORNER,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockCorner"
    )
    // 传统模式：导航条那一截由工具栏自己垫（背景同色、内容不进去），
    // 所以外层不再留 bottomPadding、也不做"抬到弹窗上面"那套（传统模式网页本来就预留了底边）
    val dockBottomPad = if (docked) 0.dp else bottomPadding + overlayLift
    val dockNavStrip = if (docked) navBottom else 0.dp
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
                                corner = dockCorner,
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
                    // 现代模式：在坞上纵向拖动 = 收起 / 恢复（跟手不跟动画，
                    // 越过阈值整段切换，剩下的位移交给形变动画收尾）
                    .pointerInput(modern, address) {
                        if (!modern || !address) return@pointerInput
                        var acc = 0f
                        val trigger = 56.dp.toPx()
                        detectVerticalDragGestures(
                            onDragStart = { acc = 0f },
                            onDragEnd = { acc = 0f },
                            onDragCancel = { acc = 0f }
                        ) { _, dragAmount ->
                            acc += dragAmount
                            if (acc > trigger) controller.dockCollapsed = true
                            else if (acc < -trigger) controller.dockCollapsed = false
                        }
                    }
                    // 收起态下点坞任意处恢复完整形态
                    .clickable(enabled = collapsed) { controller.dockCollapsed = false },
                // 传统模式是方角整条（dockCorner = 0），现代模式是 23dp 圆角胶囊
                shape = RoundedCornerShape(dockCorner),
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
                                    engineName = engineName,
                                    value = addressValue,
                                    onValueChange = onAddressChange,
                                    onFocusChange = { focused ->
                                        // 一开始打字就把选择框收起来，让位给输入
                                        if (focused) enginePickerOpen = false
                                        onAddressFocusChange(focused)
                                    },
                                    focusRequester = focusRequester,
                                    sniffOpen = sniffOpen,
                                    onTabs = onTabs,
                                    onSniff = onSniff,
                                    onEngineIcon = {
                                        // 收起态下先恢复完整控制栏，再谈引擎选择
                                        if (controller.dockCollapsed) {
                                            controller.dockCollapsed = false
                                        } else {
                                            enginePickerOpen = !enginePickerOpen
                                            if (enginePickerOpen) settingsOpen = false
                                        }
                                    },
                                    pickerOpen = enginePickerOpen,
                                    panelOpen = panelsOpen,
                                    collapsed = collapsed,
                                    onTabsLongPress = {
                                        settingsOpen = !settingsOpen
                                        if (settingsOpen) enginePickerOpen = false
                                    },
                                    onCopied = onAddressCopied,
                                    onCollapsedRestore = { controller.dockCollapsed = false },
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
    engineName: String,
    value: String,
    onValueChange: (String) -> Unit,
    onFocusChange: (Boolean) -> Unit,
    focusRequester: FocusRequester,
    sniffOpen: Boolean,
    onTabs: () -> Unit,
    onSniff: () -> Unit,
    onEngineIcon: () -> Unit,
    pickerOpen: Boolean,
    /** 引擎选择框 / 设置面板是否占着坞的上半截（两者都与前缀条互斥）。 */
    panelOpen: Boolean,
    collapsed: Boolean,
    onTabsLongPress: () -> Unit,
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
    // 聚焦状态本地也持有一份：左右按钮要为输入框让位（宽度动画收起到 0）
    var focused by remember { mutableStateOf(false) }
    val chromeHidden = focused || pickerOpen || collapsed
    val sideButtonWidth by animateDpAsState(
        targetValue = if (chromeHidden) 0.dp else 38.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "dockSideBtnWidth"
    )
    val sideButtonAlpha by animateFloatAsState(
        targetValue = if (chromeHidden) 0f else 1f,
        animationSpec = tween(200, easing = FastOutSlowInEasing),
        label = "dockSideBtnAlpha"
    )
    // 输入框高度：正常 38dp，收起态缩成细胶囊。**不再因为引擎选择框而长高** ——
    // 选择框长在坞的上半截，输入框自己保持原高、只把宽度放开
    val surfaceHeight by animateDpAsState(
        targetValue = if (collapsed) COLLAPSED_PILL_HEIGHT else 38.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "addressHeight"
    )
    // 聚焦时输入框下方长出的前缀条（与坞长高共用一条时间线）。
    // **面板开着就不长**：坞没有为它留高度（见 BrowserDock 的 prefixExtra），
    // 硬要长出来会把地址行挤扁
    val prefixHeight by animateDpAsState(
        targetValue = if (focused && !panelOpen) DOCK_PREFIX_HEIGHT else 0.dp,
        animationSpec = tween(280, easing = FastOutSlowInEasing),
        label = "addressPrefixHeight"
    )
    // 选中（聚焦或展开选择框）后圆角与控制栏对齐：控制栏是 46dp 高、
    // 23dp 圆角的胶囊，输入框要长成同一个胶囊形状，不能还是原来的小圆角
    val surfaceCorner by animateDpAsState(
        targetValue = if (chromeHidden) DOCK_CORNER else 16.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "addressCorner"
    )
    // 左右内边距：**聚焦 / 选择框展开 / 收起**这三档统一 —— 它们都是"左右按钮让位、
    // 输入框吃满宽度"的状态，边距必须一致，否则聚焦时左右各多出 2dp（用户：聚焦后
    // 左右流出的间距应该和引擎选择框展开时一致）。传统模式是贴边工具栏，给 6dp 呼吸位。
    val rowPad = when {
        docked -> 6.dp
        chromeHidden -> 2.dp
        else -> 4.dp
    }
    val rowPadStart = rowPad
    val rowPadEnd = rowPad
    // 嗅探入口的占位宽（宽度与透明度都走动画）。
    // 它住在**输入框内部**、刷新按钮右侧（用户点名：不再额外占一个位置）。
    // 宽度恒为 30dp —— 就是一枚**标准圆形**图标钮，与刷新按钮同档；
    // 有没有资源靠图标的着色区分（有内容染主色），不再用数字把圆撑成胶囊
    val sniffCount = controller.sniffed.size
    val sniffPresent = (sniffCount > 0 || sniffOpen) && !chromeHidden
    val sniffWidth by animateDpAsState(
        targetValue = if (sniffPresent) 30.dp else 0.dp,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "sniffBtnWidth"
    )
    val sniffAlpha by animateFloatAsState(
        targetValue = if (sniffPresent) 1f else 0f,
        animationSpec = tween(260, easing = FastOutSlowInEasing),
        label = "sniffBtnAlpha"
    )
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
            val nameText = controller.pageTitle.ifBlank {
                com.lerxu.android.browser.TabNaming.host(controller.currentUrl)
            }
            // 收起进度：0 = 展开（吃满整条控制栏），1 = 收起成小胶囊
            val collapseProgress by animateFloatAsState(
                targetValue = if (collapsed) 1f else 0f,
                animationSpec = tween(300, easing = FastOutSlowInEasing),
                label = "addressCollapseProgress"
            )
            // 输入框宽度**不再自己补间**，而是直接由当前实测宽推出来。
            //
            // 这里是"控制栏都出来了、链接输入框才开始动"（用户点名的不同步）的根因：
            // 容器正在形变（34% → 100%，340ms），`available` 每一帧都在变；再给宽度
            // 套一层 300ms 的 animateDpAsState，它每帧都在追一个还在移动的目标 ——
            // 容器 340ms 长完，输入框还要再追约 300ms 才到位，读起来就是"控制栏出现
            // 之后输入框才动"。直接推就没有第二次补间：输入框贴着容器走，同一帧起跑。
            //
            // 两侧按钮让出的宽度取它们**自己的动画值**（同一个值驱动按钮与
            // 输入框，两边严丝合缝、不会互相追）。只有"收起成胶囊"这一档是补间出来的
            // （collapseProgress）：收起时容器宽度不变，展开时它恒为 0，两者不打架。
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
            val maxPill = (available - sideTake - 10.dp).coerceAtLeast(0.dp)
            // 收起态按网页名估宽，同样不能超过当下能给的最大宽度（否则一样被裁）
            val collapsedWidth = collapsedPillWidth(nameText).coerceAtMost(maxPill)
            val pillWidth = (maxPill.value +
                (collapsedWidth.value - maxPill.value) * collapseProgress).dp
            // 收起时内容整体换成网页名：与 URL 交叉淡入
            val nameAlpha by animateFloatAsState(
                targetValue = if (collapsed) 1f else 0f,
                animationSpec = tween(180, easing = FastOutSlowInEasing),
                label = "collapsedNameAlpha"
            )
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
        // 最左侧：**始终是后退**，没有历史可退时置灰。
        // 它不再兼职"退出浏览器"（同一个位置换图标换动作太容易误解）——
        // 但**长按**它可以直接回下载器的（用户点名要的手势），退出也还可以走系统返回键
        // 或标签页网格左上角那个写明「下载页」的按钮。
        // 聚焦时宽度动画到 0，把位置整个让给输入框。
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
                // 当前搜索引擎的徽标：点开引擎选择框（**控制栏**向上长高一截）。
                // 选择框开着期间徽标底**常亮**，给出「现在是选择态」的锚点；
                // 收起态整个图标让位（宽度动画到 0），胶囊里只留网页名。
                val iconHalo by animateColorAsState(
                    targetValue = if (pickerOpen) colorScheme.primaryContainer else Color.Transparent,
                    animationSpec = tween(200, easing = FastOutSlowInEasing),
                    label = "engineIconHalo"
                )
                val engineIconWidth by animateDpAsState(
                    targetValue = if (collapsed) 0.dp else 34.dp,
                    animationSpec = tween(260, easing = FastOutSlowInEasing),
                    label = "engineIconWidth"
                )
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
                                    .clickable(onClick = onEngineIcon),
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
                        // key 用 `collapsed`（不是地址文本）：key 一变这个块会被**重启**，
                        // 正在处理的那一次点击就被取消了 —— 页面加载中地址文本一直在变，
                        // 用文本当 key 会让"加载时点输入框"时灵时不灵（用户点名的"有时
                        // 点不动"）。collapsed 才是这个手势真正依赖的状态
                        .pointerInput(collapsed) {
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
                                val up = withTimeoutOrNull(longMs) {
                                    var released: androidx.compose.ui.input.pointer.PointerInputChange? = null
                                    while (released == null) {
                                        val event = awaitPointerEvent(PointerEventPass.Initial)
                                        event.changes.forEach { it.consume() }
                                        val change = event.changes.firstOrNull() ?: continue
                                        if (!change.pressed) released = change
                                    }
                                    released
                                }
                                if (up == null) {
                                    // 没到超时没抬手 = 长按：复制
                                    if (fieldState.text.isNotBlank()) {
                                        clipboard.setText(
                                            androidx.compose.ui.text.AnnotatedString(fieldState.text.toString())
                                        )
                                        onCopied()
                                    }
                                    while (true) {
                                        val event = awaitPointerEvent(PointerEventPass.Initial)
                                        event.changes.forEach { it.consume() }
                                        if (event.changes.none { it.pressed }) break
                                    }
                                } else {
                                    // 收起态：单击 = 恢复完整控制栏（不聚焦、不弹键盘）；
                                    // 展开态：抬手即聚焦 + 弹键盘（不等双击判定）
                                    if (collapsed) {
                                        onCollapsedRestore()
                                    } else {
                                        // 点哪儿光标就落到哪儿：用文本布局把触点反查成偏移
                                        textLayout?.let { layout ->
                                            val offset = layout.getOffsetForPosition(up.position)
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
                                // 块被重组/换 key 取消：原样抛出，别当成错误吞掉
                                throw e
                            } catch (t: Throwable) {
                                // 单次手势出错：吞掉这一次，下一轮 awaitEachGesture 照常接管
                                // —— 不这么做的话输入框会永久失去点击能力
                            }
                        }
                ) {
                    if (collapsed) {
                        // 收起态不显示完整链接，只报**网页名**（点它是恢复展开，
                        // 不需要编辑态）；没有标题时退到域名
                        Text(
                            text = controller.pageTitle.ifBlank {
                                com.lerxu.android.browser.TabNaming.host(controller.currentUrl)
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        if (fieldState.text.isEmpty()) {
                            Text(
                                stringResource(R.string.browser_address_hint, engineName),
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
                            fontSize = MaterialTheme.typography.bodySmall.fontSize
                        ),
                        cursorBrush = SolidColor(colorScheme.primary),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Uri,
                            imeAction = ImeAction.Go
                        ),
                        onKeyboardAction = androidx.compose.foundation.text.input.KeyboardActionHandler {
                            // 输入法回发的任何提交动作都走同一条路：加载 + 收键盘 + 失焦
                            controller.load(fieldState.text.toString(), controller.engine)
                            keyboard?.hide()
                            focusManager.clearFocus()
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focusRequester)
                            .graphicsLayer { alpha = 1f - nameAlpha }
                            .onFocusChanged {
                                focused = it.isFocused
                                onFocusChange(it.isFocused)
                            }
                    )
                    // 收起态：胶囊中央显示网页名，URL 同步淡出（同一枚胶囊内切换内容）
                    if (nameAlpha > 0.01f) {
                        Text(
                            text = nameText,
                            style = MaterialTheme.typography.bodySmall,
                            color = colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center,
                            modifier = Modifier
                                .fillMaxWidth()
                                .graphicsLayer { alpha = nameAlpha }
                        )
                    }
                    }
                }
                // 刷新 / 停止：收在输入框右侧；收起态下同样让位（宽度动画到 0）
                val refreshWidth by animateDpAsState(
                    targetValue = if (collapsed) 0.dp else 30.dp,
                    animationSpec = tween(260, easing = FastOutSlowInEasing),
                    label = "refreshBtnWidth"
                )
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
                    // ── 资源嗅探入口：住在输入框**内部**、刷新按钮右侧 ──
                    //
                    // 用户点名：不再额外占一个位置，融进输入框右端的按钮区，
                    // 而且就该是**一枚标准圆形**（不再用数字把圆撑成胶囊）。
                    // 于是它和刷新按钮排成一组：同 28dp 高、同 30dp 槽位、同圆形。
                    // 有资源时把图标染成主色/反白，靠颜色说明状态；具体数量在弹窗里看。
                    if (sniffWidth > 0.dp) {
                        val sniffFilled = sniffOpen
                        Box(
                            modifier = Modifier
                                .size(sniffWidth)
                                .graphicsLayer { alpha = sniffAlpha },
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (sniffFilled) colorScheme.primary
                                        else colorScheme.surfaceContainerHighest
                                    )
                                    .clickable { onSniff() },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    // 语义图标：这一页里能下载的媒体 / 文件
                                    imageVector = Icons.Default.FileDownload,
                                    contentDescription = stringResource(R.string.browser_sniff_title),
                                    modifier = Modifier.size(15.dp),
                                    tint = when {
                                        sniffFilled -> colorScheme.onPrimary
                                        sniffCount > 0 -> colorScheme.primary
                                        else -> colorScheme.onSurfaceVariant
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
        // 最右：标签页入口。数量**融在图标里**（卡片内居中），不再挂角标。
        if (sideButtonWidth > 0.dp) {
            Box(
                modifier = Modifier
                    .size(sideButtonWidth)
                    .graphicsLayer { alpha = sideButtonAlpha }
            ) {
                // 点按开标签网格；**长按展开坞内设置面板**（界面方案 / 液态玻璃）
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape)
                        .combinedClickable(onClick = onTabs, onLongClick = onTabsLongPress),
                    contentAlignment = Alignment.Center
                ) {
                    TabStackIcon(count = controller.tabCount)
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
                            .clickable { onValueChange(value + prefix) }
                            .padding(horizontal = 2.dp, vertical = 2.dp)
                    )
                }
            }
        }
    }
}

/**
 * 标签页入口图标：**叠放卡片**造型，数量直接排在前面那张卡片里 ——
 * 不再在右上角挂角标（数字与图标本是一体，读起来更干净）。
 * 数字常驻：单标签也显示「1」。
 */
@Composable
private fun TabStackIcon(count: Int) {
    val tint = androidx.compose.material3.LocalContentColor.current
    Box(contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.size(21.dp)) {
            val stroke = 1.7.dp.toPx()
            val corner = 3.2.dp.toPx()
            // 后卡：只露出上、左两条边（前面被主卡让出的空位挡住的效果）
            drawLine(
                color = tint,
                start = Offset(3.6.dp.toPx(), 1.6.dp.toPx()),
                end = Offset(11.5.dp.toPx(), 1.6.dp.toPx()),
                strokeWidth = stroke,
                cap = StrokeCap.Round
            )
            drawLine(
                color = tint,
                start = Offset(1.6.dp.toPx(), 3.6.dp.toPx()),
                end = Offset(1.6.dp.toPx(), 11.5.dp.toPx()),
                strokeWidth = stroke,
                cap = StrokeCap.Round
            )
            // 前卡：数字就住在它里面
            drawRoundRect(
                color = tint,
                topLeft = Offset(4.8.dp.toPx(), 4.8.dp.toPx()),
                size = Size(14.4.dp.toPx(), 14.4.dp.toPx()),
                cornerRadius = CornerRadius(corner),
                style = Stroke(width = stroke)
            )
        }
        // 数字常驻：单标签也显示「1」，入口含义更完整（点它是打开全部标签页）
        Text(
            if (count > 99) "99+" else count.coerceAtLeast(1).toString(),
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            color = tint,
            maxLines = 1,
            // 前卡中心比画布中心偏右下：数字跟着挪，保证"在卡片正中"
            modifier = Modifier.padding(start = 2.6.dp, top = 2.6.dp)
        )
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
