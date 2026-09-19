package com.lerxu.android.ui.screen

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import kotlin.math.roundToInt
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.fragment.app.FragmentActivity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.compose.ui.viewinterop.AndroidView
import com.lerxu.android.R
import com.lerxu.android.browser.BrowserController
import com.lerxu.android.browser.DownloadHandoff
import com.lerxu.android.browser.PullRefreshGlyph
import com.lerxu.android.browser.TabNaming
import com.lerxu.android.util.PasswordAuthHelper
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.sign
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.ui.graphics.ImageBitmap

/** 标签卡片的宽高比与圆角：普通标签页与「新建标签」用同一套，尺寸完全一致。 */
private val TAB_CARD_RATIO = 0.68f
private val TAB_CARD_CORNER = 18.dp

/**
 * 滑动关闭的判定：拖过卡片宽度的这个比例，或甩动速度超过 [SWIPE_CLOSE_VELOCITY]
 *（px/s）就关。两个条件是"或" —— 慢慢拖够远、或快速一甩都能关掉，不用拖到底。
 */
private const val SWIPE_CLOSE_RATIO = 0.34f
private const val SWIPE_CLOSE_VELOCITY = 1200f

/**
 * 网格顶部那枚窗口模式滑块占头部宽度的比例。
 *
 * 它"始终占满顶部的空间"就是因为没给宽度（内部 `Row(fillMaxSize)` 会撑满）——
 * 现在钉死成一条居中的短条，左右留下大间距；文字保持正常字号。
 */
private const val WINDOW_SWITCH_WIDTH = 0.52f

/**
 * 网格的排版常量（列数 / 内边距 / 间距 / 头部高度）。
 *
 * 这几条**同时**被两处读：网格自己（`TabGrid` 的 LazyVerticalGrid 参数）与
 * 整页形变的锚点计算（[gridCardRect]）。卡片在网格里的位置因此可以**直接算出来**
 * —— 不再依赖「逐张卡片上报自己的位置」那种回调：回调要等布局完成才有值，
 * 拿到之前形变只能退化成「原地缩小」，看起来就是没有无缝动画。
 */
private const val TAB_GRID_COLUMNS = 2
private val TAB_GRID_PAD_H = 16.dp
private val TAB_GRID_PAD_TOP = 6.dp
private val TAB_GRID_GAP = 12.dp

/**
 * 顶部浮条（窗口模式滑块 + 关闭按钮那一行）：**圆角悬浮、不贴边**，
 * 高度写死是为了让锚点算式（[gridCardRect]）成立。
 */
private val TAB_GRID_HEADER = 58.dp
private val TAB_GRID_HEADER_GAP = 8.dp
private val TAB_GRID_HEADER_SIDE = 12.dp

/**
 * 网格里第 [index] 张卡片的矩形（页面局部坐标）。
 *
 * 卡片的横坐标完全由常量推出（等宽两列）；纵坐标以**第一个可见卡片**为基准
 * 按行距外推 —— 这样网格滚动过也能算准，且不需要额外测量。
 * 网格自己铺满是含顶部浮条那一带的，[firstVisibleRowOffsetY] 里已经带了
 * contentPadding，所以算式**不再另加头部高度**（加了就会整体偏下）。
 */
private fun Density.gridCardRect(
    index: Int,
    gridWidth: Float,
    firstVisibleRow: Int,
    firstVisibleRowOffsetY: Float
): Rect {
    val padH = TAB_GRID_PAD_H.toPx()
    val gap = TAB_GRID_GAP.toPx()
    val cellW = ((gridWidth - padH * 2f - gap * (TAB_GRID_COLUMNS - 1)) / TAB_GRID_COLUMNS)
        .coerceAtLeast(1f)
    val cellH = cellW / TAB_CARD_RATIO
    val row = index / TAB_GRID_COLUMNS
    val col = index % TAB_GRID_COLUMNS
    val left = padH + col * (cellW + gap)
    val top = firstVisibleRowOffsetY + (row - firstVisibleRow) * (cellH + gap)
    return Rect(left, top, left + cellW, top + cellH)
}

/**
 * 整页 ⇄ 卡片形变用的裁剪形状：窗口与半径逐帧更新（半路圆角、落位正圆角）。
 * **每帧新建**（见调用处）—— 复用实例会让图形层以为形状没变，轮廓不再重算。
 *
 * 注意裁剪发生在缩放**之前**：圆角半径是"局部坐标"里的值，屏幕上看到的
 * 半径 = 局部半径 × 缩放比 —— 调用方负责把局部半径先除以缩放比。
 */
private class MorphClipShape : Shape {
    var window: Rect = Rect.Zero
    var radius: Float = 0f

    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline =
        Outline.Rounded(RoundRect(window, CornerRadius(radius)))
}

/**
 * 内置浏览器页。
 *
 * 这一页**只有内容**：地址栏、回退、标签页入口与资源嗅探入口都住在底部
 * 那条常驻的坞里（见 AppScreen 的 BrowserDock），坞是**悬浮**在内容之上的
 * —— 界面始终传入 [bottomInset] > 0，内容（含网页）收在坞上方，
 * 底部不会被控制栏遮住。
 *
 * WebView 由 [BrowserController] 在 Compose 之外持有（每个标签页一个）：
 * 离开这一页只是把它从界面上摘下来，回来重新挂载，页面不会重载。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowserScreen(
    controller: BrowserController,
    onExitBrowser: () -> Unit,
    onHandoff: (DownloadHandoff) -> Unit,
    bottomInset: Dp = 0.dp,
    modern: Boolean = false,
    /** 顶部系统信息栏的高度：**只有网页内容**要让出它，标签网格铺到顶。 */
    topInset: Dp = 0.dp
) {
    // 返回键优先级：网格开着 → 收网格；页面可后退 → 退网页；否则交给外层（回任务页）
    BackHandler(enabled = controller.tabsOpen) { controller.closeTabs() }
    BackHandler(enabled = !controller.tabsOpen && controller.canGoBack) { controller.goBack() }

    val gridProgress by animateFloatAsState(
        targetValue = if (controller.tabsOpen) 1f else 0f,
        animationSpec = tween(380, easing = FastOutSlowInEasing),
        label = "tabGrid"
    )

    // 首页 ⇄ 普通页面：底部留白丝滑过渡，不会跳变
    val animatedBottomInset by animateDpAsState(
        targetValue = bottomInset,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "browserBottomInset"
    )

    // 网页里的输入框弹出输入法时，WebView 要跟着键盘缩进：Chromium 只有在
    // **自身可视高度变化**时才会把聚焦的输入框滚动到键盘之上（edge-to-edge
    // 下 adjustResize 不生效，只能自己让出 IME 的高度）
    val imeBottom = WindowInsets.ime.asPaddingValues().calculateBottomPadding()
    // 现代模式：网页**一直铺到屏幕底**，坞与底部阴影悬浮在其上（Chrome 同款）。
    // 不铺到底的话，阴影带后面垫的是应用纯色底，"半透明"根本透不出内容，
    // 看上去就还是一块实心色板 —— 阴影要成立，必须先让内容穿到它身后。
    val webBottomInset = when {
        imeBottom > animatedBottomInset -> imeBottom
        modern -> 0.dp
        else -> animatedBottomInset
    }

    // 自家加载动画的显隐：**等 260ms 才显形** —— 秒开的页面（缓存命中、站内跳转）
    // 根本不闪这一下，真在等的页面才看得到
    var showPageLoading by remember { mutableStateOf(false) }
    // 失败页在场时，底下压着的是 Chromium 自带的错误页（不是"上一页"）：
    // 这一跳再等 260ms 才盖，等于把那张原始错误页又露一次（用户点名要自家失败页）。
    // 所以只要是从失败页重新发起加载，就**立刻**盖上加载动画
    var coverAtOnce by remember { mutableStateOf(false) }
    LaunchedEffect(controller.loadError) {
        if (controller.loadError != null) coverAtOnce = true
    }
    LaunchedEffect(controller.loading, controller.activeId, controller.active.generation) {
        if (controller.loading) {
            if (coverAtOnce) {
                showPageLoading = true
            } else {
                delay(260)
                if (controller.loading) showPageLoading = true
            }
            coverAtOnce = false
        } else {
            showPageLoading = false
        }
    }

    val context = LocalContext.current

    /**
     * 切窗口模式。
     *
     * 切到无痕要先过认证：**指纹 / 面容，或锁屏密码**（[PasswordAuthHelper] 已允许
     * 设备密码，取消不会放行）。退出无痕不需要认证，直接生效并清痕。
     */
    fun switchWindowMode(incognito: Boolean) {
        if (!incognito) {
            controller.exitIncognito()
            return
        }
        if (controller.incognitoMode) return
        val activity = context.findFragmentActivity()
        if (activity == null) {
            // 理论上不会发生（宿主就是 MainActivity）；兜底不卡住用户
            controller.enterIncognito()
            return
        }
        PasswordAuthHelper.showPasswordDialog(
            activity = activity,
            onSuccess = { controller.enterIncognito() },
            onError = { message ->
                android.widget.Toast.makeText(
                    context,
                    context.getString(R.string.browser_auth_failed, message),
                    android.widget.Toast.LENGTH_SHORT
                ).show()
            },
            onCanceled = { /* 取消：保持普通窗口 */ }
        )
    }

    // 容器内的页切换（切标签 / 渲染进程被重建）后，把当前页摆到台前。
    // 所有标签页的 WebView 都常驻同一个容器里，切页只是改可见性 ——
    // 不再把 WebView 从视图树上摘下来再挂上去（那是崩溃与白屏的高发点）。
    LaunchedEffect(controller.activeId, controller.active.generation, controller.tabs.size) {
        controller.syncActiveView()
    }

    // 网格的滚动位置：整页形变要按它算出「当前卡片现在在哪儿」
    // （网格滚动过之后卡片位置会整体上移，锚点必须跟着走）
    val gridState = rememberLazyGridState()
    /**
     * 收起网格时被点中的那一格（**索引**，-1 = 没点卡片）。
     *
     * 用索引而不是标签 id：新建标签那条路径的落点是「新建卡」占的那一格
     *（索引 = 点之前的标签数），那一刻它还没有 id。
     *
     * 打开网格时清零 —— 打开方向永远落向**当前标签**的卡片，与上次点过谁无关
     *（否则"切到新标签 → 再开网格"会飞向上一轮那张卡的位置）。
     */
    var closeFromIndex by remember { mutableStateOf(-1) }
    LaunchedEffect(controller.tabsOpen) {
        if (controller.tabsOpen) closeFromIndex = -1
    }
    val activeTabIndex = controller.tabs.indexOfFirst { it.id == controller.activeId }
    // 形变锚点：开网格 = 当前页那张卡；收网格 = 被点中的那张卡（没点就是当前页）
    val anchorIndex = when {
        controller.tabsOpen -> activeTabIndex
        closeFromIndex >= 0 -> closeFromIndex
        else -> activeTabIndex
    }
    // 收起时被点中的卡片 id（让那张卡直接隐去，避免与放大中的网页重叠）
    val sourceCardId = if (!controller.tabsOpen && closeFromIndex >= 0) {
        controller.tabs.getOrNull(closeFromIndex)?.id ?: 0L
    } else {
        0L
    }
    // 卡片上报的**实测**矩形（根坐标）：整页形变的落点以它为准。
    // 只按常量推算的话，差一点点都会在落位那一瞬间"跳"到正确位置（用户点名）。
    val cardRects = remember { mutableStateMapOf<Long, Rect>() }
    // 本页根容器在根坐标里的位置（把实测矩形换算成页面层的局部坐标用）
    val rootPos = remember { mutableStateOf(Offset.Zero) }
    // 形变用的裁剪窗口（逐帧新建，见 MorphClipShape 的说明）
    // **形变期间卡片完全不显形**（用户点名："看起来还是两个组件在来回交替，
    // 我只想要一个组件的无缝动画"）：网页一路不透明地飞进卡片位，落位之后
    // 才把卡片淡进来（120ms）——那一下仅仅是为了抹掉"实时网页 → 卡片缩略图"
    // 的清晰度差，肉眼读到的自始至终是同一个组件（网页自己）在形变。
    //
    // 为什么必须**等形变完全走完**再淡、而不是在最后几个百分点就淡：缓动
    // （FastOutSlowIn）会把末尾进度摊得很长，最后 8% 进度对应网页还差
    // 约 20% 没缩到位，交叉淡入的两张图比例不同，用户读到的就是
    // "快到位时突然跳一下、大小直接变成标签的大小"（用户点名）。
    // 收起时立刻归零：放大回整页的主角同样只剩网页一个。
    val cardReveal by animateFloatAsState(
        targetValue = if (controller.tabsOpen && gridProgress >= 1f) 1f else 0f,
        animationSpec = tween(120, easing = FastOutSlowInEasing),
        label = "tabCardReveal"
    )
    // 卡片**内容**（标题 / 域名 / 关闭按钮 / 边框）**与卡片本体同时出现**
    //（用户点名：不能等缩小完成后再冒出来）—— 图片用 120ms 快速交接，
    // 内容用 240ms 淡入 + 上浮，两者**同一帧起跑**，读作"缩小成标签的同时
    // UI 一起浮出来"。再早不行：整页还在缩、卡片被压在下面，提前交叉淡入
    // 会把"尺寸还没缩到位"暴露出来（就是之前修过的"落位跳一下"）。
    val cardChrome by animateFloatAsState(
        targetValue = if (controller.tabsOpen && gridProgress >= 1f) 1f else 0f,
        animationSpec = tween(240, easing = FastOutSlowInEasing),
        label = "tabCardChrome"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .onGloballyPositioned { rootPos.value = it.boundsInRoot().topLeft }
    ) {
        // ── 网页内容：铺满整页（底部坞悬浮其上，不占布局高度）──
        // 展开网格时，整页**形变**成网格里当前页那张卡片：可视窗口、缩放、
        // 圆角（0 → 卡片圆角）沿 380ms 同一条时间线插值；落位后卡片 UI 才淡入，
        // 网页在同一刻淡出，交接处像素一致。点卡片收网格时反向播放（那张卡片
        // 放大回整页）。形变期间整页盖在网格**之上**（zIndex）——它是飞向卡片
        // 的实体，不是被网格压暗的背景。
        Box(
            modifier = Modifier
                .fillMaxSize()
                // 抬到网格之上，直到**整页彻底淡完**才落回：落早了会被网格背景
                // 瞬间盖掉（"快到位时跳一下"的另一半原因）。两个稳态都不抬 ——
                // 网格全开时整页是隐形的，抬上去会抢走卡片的点击。
                .zIndex(
                    if (gridProgress > 0f && (gridProgress < 1f || cardReveal < 1f)) 1f else 0f
                )
                .graphicsLayer {
                    val p = gridProgress
                    if (p <= 0f) {
                        // 网格已收起：显式复位（图形层会保留上一帧的值）
                        clip = false
                        scaleX = 1f
                        scaleY = 1f
                        translationX = 0f
                        translationY = 0f
                        alpha = 1f
                        return@graphicsLayer
                    }
                    val index = anchorIndex
                    if (index < 0) {
                        // 找不到来源标签页（理论上不会发生）：原地缩小淡出兜底
                        clip = false
                        transformOrigin = TransformOrigin(0.5f, 0.2f)
                        val sc = 1f - 0.38f * p
                        scaleX = sc
                        scaleY = sc
                        translationX = 0f
                        translationY = size.height * 0.06f * p
                        alpha = if (controller.tabsOpen) (1f - 1.15f * p).coerceIn(0f, 1f) else 1f
                        return@graphicsLayer
                    }
                    // 目标卡片矩形：**优先用卡片实测的位置**（落位严丝合缝）；
                    // 还没收到实测值（进场最头上一两帧）才退回按常量推算 ——
                    // 推算值哪怕只差几个 dp，落位那一刻也会"跳"一下（用户点名）。
                    val anchorId = controller.tabs.getOrNull(index)?.id ?: -1L
                    val measured = cardRects[anchorId]
                    val card = if (measured != null && measured.width > 0f) {
                        val origin = rootPos.value
                        Rect(
                            measured.left - origin.x,
                            measured.top - origin.y,
                            measured.right - origin.x,
                            measured.bottom - origin.y
                        )
                    } else {
                        // 没测到卡片时按常量外推：网格铺满整块，起排线在
                        // "状态栏 + 浮条 + 呼吸"之下
                        val contentTop = (
                            topInset + TAB_GRID_HEADER_GAP + TAB_GRID_HEADER + TAB_GRID_PAD_TOP
                            ).toPx()
                        val info = gridState.layoutInfo
                        val firstVisible = info.visibleItemsInfo.firstOrNull()
                        gridCardRect(
                            index = index,
                            gridWidth = size.width,
                            firstVisibleRow = (firstVisible?.index ?: 0) / TAB_GRID_COLUMNS,
                            firstVisibleRowOffsetY = firstVisible?.offset?.y?.toFloat()
                                ?: contentTop
                        )
                    }
                    // 形变的"整页"= **网页那一块**（顶部让给状态栏的那一截不算）：
                    // 缩略图拍的就是这块，两边同源，落位才对得齐
                    val pageTop = topInset.toPx()
                    val full = Rect(0f, pageTop, size.width, size.height)
                    // 覆盖式缩放：卡片 0.68 宽高比、整页更瘦长，取 max 比例，
                    // 多出来的部分靠窗口裁剪 —— 与卡片缩略图的 Crop 同一裁法，
                    // 落位瞬间与卡片像素对齐
                    val cover = maxOf(card.width / full.width, card.height / full.height)
                    val s = 1f + (cover - 1f) * p
                    // 目标矩形：整页 ⇄ 卡片矩形；可视窗口 = 目标矩形 ÷ 缩放并居中
                    // —— 缩放后窗口恰好落在目标矩形上，内容不偏心
                    val targetW = full.width + (card.width - full.width) * p
                    val targetH = full.height + (card.height - full.height) * p
                    val winW = targetW / s
                    val winH = targetH / s
                    val window = Rect(
                        Offset(full.center.x - winW / 2f, full.center.y - winH / 2f),
                        Size(winW, winH)
                    )
                    // 裁剪形状**每帧新建实例**：图形层判断"要不要重算轮廓"看的是
                    // shape 实例有没有换 —— 复用同一个实例再改它的窗口/半径，
                    // 裁剪会永远停在第一帧的尺寸上（形变看着就像"没动"）。
                    shape = MorphClipShape().apply {
                        this.window = window
                        // 裁剪在缩放之前：局部半径除以 s，屏幕上才是正圆角
                        radius = TAB_CARD_CORNER.toPx() * p / s
                    }
                    clip = true
                    scaleX = s
                    scaleY = s
                    transformOrigin = TransformOrigin(0f, 0f)
                    // 目标矩形左上角：full ⇄ card 的线性插值（full.left = 0）
                    translationX = card.left * p - s * window.left
                    translationY = (full.top + (card.top - full.top) * p) - s * window.top
                    // 展开：落位后整页淡出，把同一像素位置的卡片让出来；
                    // 收起：整页就是正在放大的主体，从第一帧起全亮
                    alpha = if (controller.tabsOpen) 1f - cardReveal else 1f
                }
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // 进度条只在加载时占位：不加载时高度为 0，避免页面上下抖动
                Box(modifier = Modifier.fillMaxWidth().height(2.dp)) {
                    if (controller.loading) {
                        LinearProgressIndicator(
                            progress = { controller.progress / 100f },
                            modifier = Modifier.fillMaxWidth().height(2.dp),
                            strokeCap = StrokeCap.Butt
                        )
                    }
                }

                // weight(1f)：只占剩余高度（用 fillMaxSize 会按整列高度撑开，
                // 把内容顶出可视区）。[animatedBottomInset] 作为底部留白，
                // 网页内容收在控制栏上方，不被坞遮住。
                // 网页内容让出顶部状态栏（标签网格则铺到顶，见上面的 Grid）
                Box(modifier = Modifier.fillMaxWidth().weight(1f).padding(top = topInset)) {
                    // 只挂容器本身（不随切换重建）：容器里放着所有标签页的
                    // WebView，当前页 VISIBLE、其余 GONE。
                    AndroidView(
                        factory = { controller.takeHost() },
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(bottom = webBottomInset)
                    )

                    // 滑动手势的实时提示（边缘箭头 / 顶部刷新圈）
                    SwipeHints(controller)

                    // 无痕标记：**只在无痕模式且停在自家首页时**出现。
                    // 浏览任意网页时不再常驻 —— 它属于首页的一部分（用户点名），
                    // 网页里飘一个标记既挡内容、也让人以为每个页面都挂着这个提示
                    if (controller.incognitoMode && controller.isHomePage) {
                        IncognitoBadge(
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .padding(top = 8.dp)
                        )
                    }

                    // 主文档加载失败：**整页换成自家的失败页**。
                    // 原来只在网页上浮一张小卡 —— 底下 Chromium 自带的错误页照样透出来，
                    // 用户看到的仍是"原始网页"（用户点名）。所以这里铺满整块网页区域、
                    // 用不透明底色盖住 WebView（见 PageErrorView）。
                    controller.loadError?.let { message ->
                        PageErrorView(
                            message = message,
                            onRetry = { controller.reload() },
                            onHome = { controller.loadHome() }
                        )
                    }

                    // 加载动画放**最上层**：正在加载时它盖住空白（页面一出来就淡出）
                    PageLoadingOverlay(visible = showPageLoading)
                }
            }
        }

        // ── 标签页网格（覆盖在网页之上；网格开着时底部坞会淡出）──
        if (gridProgress > 0f) {
            TabGrid(
                controller = controller,
                onExitBrowser = onExitBrowser,
                onWindowModeChange = { incognito -> switchWindowMode(incognito) },
                progress = gridProgress,
                reveal = cardReveal,
                chrome = cardChrome,
                topInset = topInset,
                gridState = gridState,
                // 收起网格时被点中的那张卡：整页正从它的位置放大，卡片直接隐去
                sourceCardId = sourceCardId,
                onSelectTab = { id ->
                    // 记住点中的是哪一格：关闭动画从它的位置放大回整页
                    closeFromIndex = controller.tabs.indexOfFirst { it.id == id }
                    controller.selectTab(id)
                    controller.closeTabs()
                },
                onNewTab = {
                    // 新建按钮不再是网格里的一格，形变就落在"新标签页自己那张卡"
                    // 的位置上（closeFromIndex 留空 → 锚点自动取当前页那张卡）
                    controller.newTab()
                    controller.closeTabs()
                },
                onCardBounds = { id, rect -> cardRects[id] = rect },
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

// ─── 滑动手势提示 ───

/**
 * 手势进行中的实时反馈（状态由 [SwipeHost] 写在控制器上）：
 * - 横向滑动：手指去向一侧出现圆形箭头徽标 + 边缘渐变色带，进度控制出现程度；
 * - 下拉：顶部滑出刷新指示器（见 [PullRefreshIndicator]），满环表示「松手重载」。
 *
 * 抬手后控制器把进度清零，这里的动画负责把提示丝滑收回（方向缓存到完全淡出，
 * 不会在回落动画播完前突然换边）。
 */
@Composable
private fun SwipeHints(controller: BrowserController) {
    val colorScheme = MaterialTheme.colorScheme
    val navProgress by animateFloatAsState(
        targetValue = controller.swipeNavProgress,
        animationSpec = tween(160, easing = FastOutSlowInEasing),
        label = "swipeNavHint"
    )
    var navDir by remember { mutableStateOf(BrowserController.SwipeNav.None) }
    if (controller.swipeNav != BrowserController.SwipeNav.None) navDir = controller.swipeNav
    Box(modifier = Modifier.fillMaxSize()) {
        if (navProgress > 0.01f && navDir != BrowserController.SwipeNav.None) {
            // 提示贴在**新页面滑来的那一侧**（与系统返回手势同直觉）：
            // 向左滑 = 前进，页面从右滑入 → 提示在右缘；向右滑 = 后退 → 左缘。
            val forward = navDir == BrowserController.SwipeNav.Forward
            val edge = if (forward) Alignment.CenterEnd else Alignment.CenterStart
            val bandColors = if (forward) {
                listOf(Color.Transparent, colorScheme.primary.copy(alpha = 0.22f))
            } else {
                listOf(colorScheme.primary.copy(alpha = 0.22f), Color.Transparent)
            }
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .graphicsLayer { alpha = navProgress }
            ) {
                Box(
                    modifier = Modifier
                        .align(edge)
                        .fillMaxHeight()
                        .width(72.dp)
                        .background(Brush.horizontalGradient(bandColors))
                )
                Surface(
                    modifier = Modifier
                        .align(edge)
                        .padding(horizontal = 26.dp)
                        .size(46.dp)
                        .graphicsLayer {
                            val s = 0.7f + 0.3f * navProgress
                            scaleX = s
                            scaleY = s
                        },
                    shape = CircleShape,
                    color = colorScheme.surfaceContainerHigh.copy(alpha = 0.96f),
                    border = BorderStroke(1.dp, colorScheme.outlineVariant),
                    shadowElevation = 0.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            if (forward) Icons.AutoMirrored.Filled.ArrowForward
                            else Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                            modifier = Modifier.size(21.dp),
                            tint = colorScheme.onSurface
                        )
                    }
                }
            }
        }

        // 下拉刷新指示器：**常驻在场**（空闲时整块 alpha 为 0）。
        // 由外部 if 决定生死的话，退场动画会在第一帧就被抹掉 ——
        // 「松手 → 旋转 → 收尾」必须是一条连续动画。
        PullRefreshIndicator(
            pull = controller.pullProgress,
            refreshing = controller.pullRefreshing,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 10.dp)
                .size(44.dp)
        )
    }
}

// ─── 下拉刷新指示器 ───

/**
 * 下拉刷新指示器。
 *
 * 全程由**同一个量**（[deploy]）驱动，所以不存在「换图标」这件事：
 *
 *  1. 跟手下拉：弧从右上角逆时针「长」出来，长满（[PullRefreshGlyph.RING_DONE]）之后
 *     弧尾的箭头从零尺寸展开；
 *  2. 松开到位：整枚图标匀速旋转，直到页面加载结束；
 *  3. 收尾：弧收回 + 上移 + 淡出，全程都在场，不会被硬切。
 *
 * 上一版是在 `pull >= 0.99` 时整块**换成**一个静态的 `Icons.Refresh`，
 * 弧与箭头在两帧之间交接 —— 这就是「突然变成刷新图标」的来源。
 */
@Composable
private fun PullRefreshIndicator(
    pull: Float,
    refreshing: Boolean,
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme

    // 形变进度：下拉时跟随手指（短 tween 只做平滑），刷新期间钉在 1（环不缩回去）
    val deploy by animateFloatAsState(
        targetValue = if (refreshing) 1f else pull.coerceIn(0f, 1f),
        animationSpec = tween(
            durationMillis = if (refreshing) 200 else 120,
            easing = FastOutSlowInEasing
        ),
        label = "pullDeploy"
    )
    // 到位才染主色，但颜色随进度**连续**过渡（不是到点才跳过去）
    val accent = if (refreshing) 1f else PullRefreshGlyph.accent(deploy)

    // 刷新中匀速旋转。它比 refreshing **多活一拍**：刷新结束的那一刻指示器
    // 还在淡出，此刻立即停转会在 alpha 还满的那一帧看到角度回跳。
    var spinning by remember { mutableStateOf(false) }
    LaunchedEffect(refreshing) {
        if (refreshing) {
            spinning = true
        } else if (spinning) {
            delay(240)
            spinning = false
        }
    }
    // 只有真正在转的时候才建这条无限动画：常驻的话，指示器整块 alpha 为 0 时
    // 也每帧都在转 —— 应用从此进不了空闲（性能）
    val spin = if (spinning) {
        rememberInfiniteTransition(label = "pullSpin").animateFloat(
            initialValue = 0f,
            targetValue = 360f,
            animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing)),
            label = "pullSpinAngle"
        )
    } else {
        null
    }

    Surface(
        modifier = modifier.graphicsLayer {
            // 空闲时整块隐去；下拉过程中随进度淡入，并从上方落到本位
            alpha = if (refreshing) 1f else PullRefreshGlyph.alpha(deploy)
            translationY = (deploy - 1f) * 30.dp.toPx()
            val s = 0.88f + 0.12f * (deploy * 2f).coerceIn(0f, 1f)
            scaleX = s
            scaleY = s
        },
        shape = CircleShape,
        color = colorScheme.surfaceContainerHigh.copy(alpha = 0.96f),
        border = BorderStroke(
            1.dp,
            lerp(
                colorScheme.outlineVariant,
                colorScheme.primary.copy(alpha = 0.55f),
                accent
            )
        ),
        shadowElevation = 0.dp
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp)
                // 旋转只作用在图形上（下面那圈容器是对称的，转不转一样）
                .graphicsLayer { if (spinning) rotationZ = spin?.value ?: 0f }
        ) {
            val strokePx = 2.6.dp.toPx()
            val radius = size.minDimension / 2f - strokePx / 2f
            val center = Offset(size.width / 2f, size.height / 2f)
            val tint = lerp(colorScheme.outlineVariant, colorScheme.primary, accent)

            // 弧：尾端钉在右上，随进度向逆时针长出来
            val arc = PullRefreshGlyph.arc(deploy)
            if (arc.sweepDeg > 0.6f) {
                drawArc(
                    color = tint,
                    startAngle = arc.startDeg,
                    sweepAngle = arc.sweepDeg,
                    useCenter = false,
                    topLeft = Offset(center.x - radius, center.y - radius),
                    size = Size(radius * 2f, radius * 2f),
                    style = Stroke(width = strokePx, cap = StrokeCap.Round)
                )
            }

            // 弧尾的箭头：尺寸从 0 长大的三角 —— 是「展开」，不是「换上一个图标」
            PullRefreshGlyph.head(deploy, radius)?.let { head ->
                val apex = Offset(center.x + head.apex.x, center.y + head.apex.y)
                val baseA = Offset(center.x + head.baseA.x, center.y + head.baseA.y)
                val baseB = Offset(center.x + head.baseB.x, center.y + head.baseB.y)
                drawPath(
                    path = Path().apply {
                        moveTo(apex.x, apex.y)
                        lineTo(baseA.x, baseA.y)
                        lineTo(baseB.x, baseB.y)
                        close()
                    },
                    color = tint
                )
            }
        }
    }
}

// ─── 标签页网格 ───

/**
 * 标签页网格。
 *
 * 卡片是 2 列网格；**「新建标签」永远排在最后一个标签页之后**，用虚线边框
 * 与普通卡片区分，但尺寸与圆角完全一致。
 *
 * 入场：**当前页那张卡片不参与滑入** —— 整页形变（见 BrowserScreen 的
 * graphicsLayer）落到它的位置后它才淡入（[reveal]）；其他标签页从四面八方
 * （不同方向的偏移）滑入就位，错开一点时间读起来更有层次感。
 */
@Composable
private fun TabGrid(
    controller: BrowserController,
    onExitBrowser: () -> Unit,
    onWindowModeChange: (Boolean) -> Unit,
    progress: Float,
    reveal: Float,
    /** 卡片内容的出现进度（比图片晚半步，见 BrowserScreen 的 cardChrome）。 */
    chrome: Float,
    /** 顶部状态栏高度：网格铺到顶，顶部渐变要盖过这一截。 */
    topInset: Dp,
    gridState: LazyGridState,
    sourceCardId: Long,
    onSelectTab: (Long) -> Unit,
    onNewTab: () -> Unit,
    /** 卡片上报的**实测**矩形（根坐标）：整页形变的落点以它为准。 */
    onCardBounds: (Long, Rect) -> Unit,
    modifier: Modifier
) {
    val colorScheme = MaterialTheme.colorScheme
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val lightTheme = colorScheme.background.luminance() > 0.5f
    // 网格底色比页面底色**再深一档**：标签栏和网页是两个层次，同色会糊成
    // 一片（用户点名）。向黑压一档、保留主题色相 —— 深色主题压得重一些，
    // 浅色主题轻一些（浅色下压太多会显脏）。
    // **无痕模式**再换一档偏紫的"夜深"色：一眼看出这不是普通窗口（用户点名）。
    val backdrop = if (controller.incognitoMode) {
        // 无痕：往**深靛**方向压，不往粉紫方向走 —— 浅色主题下压得太浅会泛粉红
        //（用户报的"进入标签页就泛红"）
        lerp(
            colorScheme.background,
            INCOGNITO_TINT,
            if (lightTheme) 0.34f else 0.45f
        )
    } else {
        lerp(colorScheme.background, Color.Black, if (lightTheme) 0.10f else 0.28f)
    }
    // 顶部浮条的位置：状态栏下沿留 [TAB_GRID_HEADER_GAP]，下面才是网格的起排线
    val headerTop = topInset + TAB_GRID_HEADER_GAP
    val contentTop = headerTop + TAB_GRID_HEADER
    // 需要知道自己铺了多大：首页那张卡要按"整页"的尺寸重画一遍预览
    //（见 HomePreview —— 与整页形变用同一套缩放裁法，落位那一刻才对得齐）
    BoxWithConstraints(
        modifier = modifier
            .graphicsLayer { alpha = progress }
            .background(backdrop)
    ) {
        val pageWidth = maxWidth
        val pageHeight = (maxHeight - topInset).coerceAtLeast(1.dp)

        // 进来时把**当前标签**那张卡完整露出来。
        //
        // 标签多起来之后当前页可能排在视口下方（"要往下滚才能看全"），不滚一下
        // 用户就看不到自己正在看的那一页（用户点名）。
        //
        // 用**瞬时**滚动而不是动画：这一刻网格还在淡入（progress 从 0 起），位移
        // 根本看不见；而整页形变正要落到这张卡上 —— 卡片自己还在滑的话，落点
        // 会一路追着跑。先把位置摆定，形变再落上去。
        LaunchedEffect(controller.tabsOpen) {
            if (!controller.tabsOpen) return@LaunchedEffect
            val index = controller.tabs.indexOfFirst { it.id == controller.activeId }
            if (index < 0) return@LaunchedEffect
            // 等一帧：这个副作用跑在"网格刚开始组合"的那一帧上，布局还没跑，
            // 此刻读 layoutInfo 拿到的是上一轮的量法
            withFrameNanos { }
            val info = gridState.layoutInfo
            if (info.totalItemsCount == 0) return@LaunchedEffect
            val item = info.visibleItemsInfo.firstOrNull { it.index == index }
            if (item == null) {
                // 整张卡都在视口外（没被组合出来）：滚到它，让它完整落进视口
                gridState.scrollToItem(index)
            } else {
                // 已经在视口里、只是被下缘切掉一截：只补被切掉的那点，别整屏跳。
                // viewportEndOffset 已经把底部留白（新建按钮那一带）算在外了
                val overflow = item.offset.y + item.size.height - info.viewportEndOffset
                if (overflow > 0) gridState.scrollBy(overflow.toFloat())
            }
        }
        // 网格**铺满整块**（含状态栏那一截）：卡片能滚到状态栏底下，顶部有落影
        // 渐变收边；滑块与关闭按钮浮在它上面（见下面的浮条），不伸进状态栏
        LazyVerticalGrid(
            columns = GridCells.Fixed(TAB_GRID_COLUMNS),
            state = gridState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = TAB_GRID_PAD_H,
                end = TAB_GRID_PAD_H,
                // 顶上给浮条让位（浮条本身 + 一点呼吸）
                top = contentTop + TAB_GRID_PAD_TOP,
                // 底部多让一截：新建按钮悬浮在这一带
                bottom = navBottom + TAB_NEW_TAB_RESERVE
            ),
            horizontalArrangement = Arrangement.spacedBy(TAB_GRID_GAP),
            verticalArrangement = Arrangement.spacedBy(TAB_GRID_GAP)
        ) {
            itemsIndexed(controller.tabs, key = { _, tab -> tab.id }) { index, tab ->
                TabCard(
                    tab = tab,
                    index = index,
                    active = tab.id == controller.activeId,
                    reveal = reveal,
                    hidden = tab.id == sourceCardId,
                    gridProgress = progress,
                    entering = controller.tabsOpen,
                    chrome = chrome,
                    onBounds = { rect -> onCardBounds(tab.id, rect) },
                    onSelect = { onSelectTab(tab.id) },
                    onClose = { controller.closeTab(tab.id) },
                    // 增删标签的动画：新卡片淡入、被删的卡片淡出、其余卡片
                    // **平滑挪到新位置**（用户点名：不加的话剩下的一起"跳"）
                    pageWidth = pageWidth,
                    pageHeight = pageHeight,
                    modifier = Modifier.animateItem(
                        fadeInSpec = tween(220, easing = FastOutSlowInEasing),
                        placementSpec = tween(260, easing = FastOutSlowInEasing),
                        fadeOutSpec = tween(160, easing = FastOutSlowInEasing)
                    )
                )
            }
        }

        // 顶部：状态栏一带的落影渐变（网格铺到顶之后，内容从状态栏底下透出来
        // 时有自然的收边，状态栏图标也压得住）。
        // **向下扩得更远、也更重**（用户点名）：中段就压到接近全实，卡片滚到
        // 状态栏底下时有一个明确的层次，而不是薄薄一层就没了。
        //
        // 画在**浮条之前**（见下面的顺序）：浮条与关闭按钮要压在影之上 —— 反过来
        // 的话这一条会盖住它们，滑块和关闭按钮就"蒙了一层灰"（用户点名）。
        // 网格 → 上下落影 → 浮条 → 新建按钮，就是这一屏的层次
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .height(topInset + TAB_GRID_TOP_SHADE)
                .background(
                    Brush.verticalGradient(
                        0f to backdrop,
                        0.34f to backdrop.copy(alpha = 0.88f),
                        0.66f to backdrop.copy(alpha = 0.48f),
                        1f to Color.Transparent
                    )
                )
        )

        // 底部：**从底向上延伸**的渐变（卡片滚到底部时淡出在它下面；
        // 新建按钮也坐落在这一条更实的底上）。
        //
        // 上一版从 0 直接跳到 0.78，等于在起始处划了一条"边"——看着像一条色带
        // 而不是影。现在把起手放平缓（0.28 → 0.55），再往后才收实（用户：
        // 让上下两条影看起来更自然一些）。
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(navBottom + TAB_NEW_TAB_RESERVE + TAB_GRID_BOTTOM_SHADE)
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.30f to backdrop.copy(alpha = 0.55f),
                        0.68f to backdrop.copy(alpha = 0.90f),
                        1f to backdrop
                    )
                )
        )

        // 顶部浮条（滑块 + 关闭按钮）：画在落影**之后**，因此始终压在影之上
        //（影只压网格）。这一行本身不带底色 —— 滑块自己那层外壳保留、关闭按钮裸着放；
        // 左右留边 + 下移的状态栏间距保留：两个控件都不贴边、不伸进状态栏
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(horizontal = TAB_GRID_HEADER_SIDE)
                .padding(top = headerTop)
                .fillMaxWidth()
                .height(TAB_GRID_HEADER)
        ) {
            // 窗口模式滑块：居中（左右各留出让位的余量，见下面的关闭按钮）
            WindowModeSwitch(
                incognito = controller.incognitoMode,
                onSelect = onWindowModeChange,
                modifier = Modifier.align(Alignment.Center)
            )
            IconButton(
                onClick = { controller.closeTabs() },
                modifier = Modifier.align(Alignment.CenterEnd).padding(end = 4.dp)
            ) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = stringResource(R.string.browser_tabs_done),
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // 新建标签：**底部居中**的一枚渐变按钮，只显示一个加号。
        // 背景与下载器页底部的浏览器按钮同一套渐变（自下而上淡出到页面底色）。
        // 它不再占网格里的一格 —— 网格只放标签页本身。
        // 出场**与底部控制栏的消失同一条时间线**：坞滑走的这两百多毫秒里
        // 它就从下方浮上来（不是等卡片内容那一拍才出现）。
        val newTabAppear = (progress / 0.55f).coerceIn(0f, 1f)
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = navBottom + 6.dp)
                .fillMaxWidth(TAB_NEW_TAB_WIDTH)
                .height(TAB_NEW_TAB_HEIGHT)
                .graphicsLayer {
                    alpha = newTabAppear
                    translationY = (1f - newTabAppear) * 18.dp.toPx()
                }
                .clip(RoundedCornerShape(TAB_NEW_TAB_HEIGHT / 2))
                // 渐变但**不留全透明的头**：上一版从全透明起，按钮上半截像被
                // 渐变糊掉了一样（用户报"被渐变遮挡"）。现在是一枚实心的圆角
                // 渐变胶囊：上浅下深，与下载器底部那条渐变的用料一致。
                .background(
                    Brush.verticalGradient(
                        0f to colorScheme.background.copy(alpha = 0.78f),
                        1f to colorScheme.background
                    )
                )
                .clickable(onClick = onNewTab),
            contentAlignment = Alignment.Center
        ) {
            // 图标：比 Material 自带的 Add 粗一档、也大一点（用户点名）
            BoldPlus(
                size = 22.dp,
                stroke = 2.8.dp,
                color = colorScheme.onSurface
            )
        }
    }
}

/** 无痕模式的网格底色：**深靛**（不是粉紫 —— 浅色主题下粉紫会读成"泛红"）。 */
private val INCOGNITO_TINT = Color(0xFF3B3552)

/** 新建标签按钮：宽占比 / 高度，以及网格底部为它让出的高度。 */
private const val TAB_NEW_TAB_WIDTH = 0.30f
private val TAB_NEW_TAB_HEIGHT = 40.dp

/**
 * 顶部 / 底部落影的**向下 / 向上延伸量**（叠在状态栏与新建按钮那一带之上）。
 *
 * 上一版顶 16dp / 底 18dp 都太薄：卡片滚到边上时收得不明显，看着像"刚好在
 * 那儿被切掉"而不是被一层影压住（用户点名：阴影要更重、向下扩得更远）。
 * 顶部加长到 56dp —— 它同时承担"状态栏图标压得住"这件事；
 * 底部则收回到 26dp：上一版 38dp 伸得太高，把卡片区吃掉了一截（用户点名）。
 */
private val TAB_GRID_TOP_SHADE = 56.dp
private val TAB_GRID_BOTTOM_SHADE = 26.dp
private val TAB_NEW_TAB_RESERVE = 64.dp

/** 更粗的加号：Material 自带的 Add 描边偏细，这里自己画两根圆头长条。 */
@Composable
private fun BoldPlus(size: Dp, stroke: Dp, color: Color) {
    Canvas(modifier = Modifier.size(size)) {
        val w = stroke.toPx()
        val center = this.size.minDimension / 2f
        val arm = this.size.minDimension - w
        drawLine(
            color, Offset(center - arm / 2f, center), Offset(center + arm / 2f, center),
            strokeWidth = w, cap = StrokeCap.Round
        )
        drawLine(
            color, Offset(center, center - arm / 2f), Offset(center, center + arm / 2f),
            strokeWidth = w, cap = StrokeCap.Round
        )
    }
}

/**
 * 非当前页卡片的入场进度。
 *
 * **由网格开合进度直接映射**，不是一次性的 delay 动画：后者开 / 合走的是两条
 * 互不相干的时间线（关的时候卡片根本不参与，只是跟着整层透明度消失），
 * 快速开关还会卡在半路。这里错开量从进度里"扣"出来 —— 第 [index] 张要多走
 * `index * TAB_CARD_STAGGER` 才起步，所以整段进度可正可反，来回拖都连贯。
 */
internal fun tabCardProgress(open: Float, index: Int, entering: Boolean): Float =
    if (entering) {
        // 入场：按索引错开起步（后面的稍晚一点），错开量封顶
        val delay = (index * TAB_CARD_STAGGER).coerceAtMost(TAB_CARD_MAX_DELAY)
        val span = (1f - delay).coerceAtLeast(0.2f)
        ((open - delay) / span).coerceIn(0f, 1f)
    } else {
        // 退场：**不错开、走得更快** —— 收网格时整页正从卡片位放大回来，
        // 卡片们要在前半程就利落地一起退走（按错开顺序一个个消失会让
        // "回到网页"这件事平白慢半拍）
        (open / TAB_CARD_EXIT_SPAN).coerceIn(0f, 1f)
    }

/** 相邻卡片的入场错开量（占总进度的比例）与单张最多错开多少。 */
private const val TAB_CARD_STAGGER = 0.055f
private const val TAB_CARD_MAX_DELAY = 0.33f

/** 退场占的进度比例：进度掉到这个值以下卡片就退干净了。 */
private const val TAB_CARD_EXIT_SPAN = 0.45f

/**
 * 一个标签页卡片：优先展示**页面快照**（缩略图铺满卡片，底部压一层暗色
 * 渐变托住标题与域名）；还没抓到快照时回退为图标 + 标题 + 域名。
 * 右上角关闭；**左右滑动也能关**（见下面的 `swipeToClose`）。
 *
 * 快照由控制器在页面加载完成 / 打开网格 / 切走标签页时对这些页**还可见**的
 * 那一刻抓（BrowserController.captureThumbnail）；隐藏的 WebView 画不出内容，
 * 与其软件绘制出一张灰板子，不如退回占位样式。
 *
 * 入场：当前页那张卡片**落位后才淡入**（[reveal]，整页形变到它身上）；
 * 收起时被点中的那张（[hidden]）直接隐去 —— 整页正从它的位置放大出来，
 * 两个组件不会同时在动。其他标签页的显隐由 [gridProgress] 直接驱动
 * （见 [tabCardProgress]）：轻微上浮 + 缩放 + 错开起步，**开与合是同一条
 * 时间线**，来回拖不会卡在半路。
 */
@Composable
private fun TabCard(
    tab: BrowserController.Tab,
    index: Int,
    active: Boolean,
    reveal: Float,
    hidden: Boolean,
    gridProgress: Float,
    /** 网格正在展开（true）还是收起（false）：出入场用不同的节奏。 */
    entering: Boolean,
    /** 卡片内容的出现进度（比图片晚半步，见 BrowserScreen 的 cardChrome）。 */
    chrome: Float,
    /** 上报卡片的**实测**矩形（根坐标）：整页形变落位以它为准，落位才严丝合缝。 */
    onBounds: (Rect) -> Unit,
    onSelect: () -> Unit,
    onClose: () -> Unit,
    /** "整页"的尺寸（宽 = 屏宽，高 = 屏高 − 状态栏）：首页预览要按它重画。 */
    pageWidth: Dp,
    pageHeight: Dp,
    /** 网格项自己的动画（`animateItem`）：增删时的淡入淡出与挪位。 */
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme
    val isCurrent = active
    val thumb = tab.thumbnail
    // 首页那张卡**不用快照**，自己画（见 [HomePreview]）；其余页照旧用快照。
    // 底色/文字取色按"有没有画面"分档，首页预览也是一张画面。
    //
    // 判定不只看 isHomePage：它由 `onPageStarted` / 恢复时写入，某些路径（新建标签
    // 后紧接着开网格）可能还没落值 —— 地址就是首页的话也算，免得漏判成一张空白卡
    val isHome = tab.isHomePage || tab.url.startsWith(BrowserController.HOME_URL)
    val hasPicture = isHome || thumb != null
    val cardShape = RoundedCornerShape(TAB_CARD_CORNER)
    val appear =
        if (isCurrent || hidden) 1f
        else tabCardProgress(gridProgress, index, entering)
    // 内容（标题 / 域名 / 关闭按钮 / 边框）的出现进度：当前页卡片跟着"落位后"
    // 的节奏浮出，其他卡片在自己入场的后半段浮出 —— 都不跟图片同一下出现
    val chromeIn = when {
        hidden -> 0f
        isCurrent -> chrome
        else -> ((appear - 0.45f) / 0.55f).coerceIn(0f, 1f)
    }

    // ── 滑动关闭 ──
    val scope = rememberCoroutineScope()
    val swipe = remember { Animatable(0f) }
    var cardWidth by remember { mutableStateOf(1f) }
    val swipeRatio = (abs(swipe.value) / cardWidth).coerceIn(0f, 1f)

    Box(
        modifier = modifier
            .aspectRatio(TAB_CARD_RATIO)
            .onGloballyPositioned {
                cardWidth = it.size.width.toFloat().coerceAtLeast(1f)
                onBounds(it.boundsInRoot())
            }
    ) {
        // 卡片底下那层"松手即关"的提示：随位移渐显（滑得越远越明确）。
        // **没在滑就整层不放**（连背景一起）—— 这是最后一道保险：只要 swipeRatio
        // 是 0，红色就绝无可能露出来（用户报过两次"标签泛红"）。
        if (swipeRatio > 0.001f) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .clip(cardShape)
                    .background(colorScheme.errorContainer.copy(alpha = swipeRatio)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = null,
                    modifier = Modifier
                        .size(26.dp)
                        .graphicsLayer { alpha = swipeRatio },
                    tint = colorScheme.onErrorContainer
                )
            }
        }
        Surface(
            onClick = onSelect,
            modifier = Modifier
                .matchParentSize()
                .draggable(
                    orientation = Orientation.Horizontal,
                    state = rememberDraggableState { delta ->
                        scope.launch { swipe.snapTo(swipe.value + delta) }
                    },
                    onDragStopped = { velocity ->
                        val far = abs(swipe.value) > cardWidth * SWIPE_CLOSE_RATIO
                        val fling = abs(velocity) > SWIPE_CLOSE_VELOCITY
                        if (far || fling) {
                            val dir = if (swipe.value != 0f) sign(swipe.value)
                            else if (velocity >= 0f) 1f else -1f
                            swipe.animateTo(dir * cardWidth * 1.4f, tween(190, easing = FastOutSlowInEasing))
                            onClose()
                        } else {
                            swipe.animateTo(
                                0f,
                                spring(dampingRatio = 0.6f, stiffness = 260f)
                            )
                        }
                    }
                )
                .graphicsLayer {
                    translationX = swipe.value
                    when {
                        // 当前页卡片：整页形变落位后淡入（网页在同一刻淡出）
                        isCurrent -> alpha = reveal
                        // 收起网格时被点中的那张：整页正从它放大，直接隐去并避免背景闪动
                        hidden -> {
                            alpha = 0f
                            scaleY = 1f
                            scaleX = 1f
                        }
                        else -> {
                            // 其他标签页：入场错开（淡入 + 从下方轻浮上来 + 轻微放大），
                            // 退场不错开、更快（见 tabCardProgress）。
                            // 滑动关闭时随位移收一点，给底下的红色提示让出层次。
                            alpha = appear * (1f - 0.6f * swipeRatio)
                            val scale = 0.92f + 0.08f * appear - 0.05f * swipeRatio
                            scaleX = scale
                            scaleY = scale
                            translationY = (1f - appear) * 18.dp.toPx()
                        }
                    }
                },
            shape = cardShape,
            color = colorScheme.surfaceContainerHigh,
            contentColor = colorScheme.onSurface,
            // 选中边框也随内容浮出（不然它是整张卡上唯一"提前"出现的东西）
            border = if (active) {
                BorderStroke(2.dp, colorScheme.primary.copy(alpha = chromeIn))
            } else {
                null
            }
        ) {
        Box(modifier = Modifier.fillMaxSize()) {
            if (isHome) {
                HomePreview(
                    pageWidth = pageWidth,
                    pageHeight = pageHeight,
                    modifier = Modifier.matchParentSize()
                )
            } else if (thumb != null) {
                Image(
                    bitmap = thumb.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.matchParentSize()
                )
            } else {
                // 无缩略图时填充纯色背景，避免闪屏
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .background(colorScheme.surfaceContainerHighest)
                )
            }
            if (hasPicture) {
                // 底部压一层暗色渐变：标题在亮色画面（首页预览就是亮底）上也读得清。
                // 它属于"内容"的一部分 —— 跟标题一起浮出（图层要写在 background
                // **前面**，链上排在后面的图层管不到已经画完的底色）
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .graphicsLayer { alpha = chromeIn }
                        .background(
                            Brush.verticalGradient(
                                0.5f to Color.Transparent,
                                1f to Color.Black.copy(alpha = 0.55f)
                            )
                        )
                )
            }
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 10.dp)
                    .graphicsLayer {
                        // 标题 / 域名：淡入 + 从下方轻浮上来
                        alpha = chromeIn
                        translationY = (1f - chromeIn) * 10.dp.toPx()
                    }
            ) {
                if (!hasPicture) {
                    Icon(
                        Icons.Default.Language,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = colorScheme.primary
                    )
                }
                Spacer(Modifier.weight(1f))
                Text(
                    TabNaming.title(
                        tab.title,
                        tab.url,
                        stringResource(R.string.browser_tab_untitled)
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                    color = if (hasPicture) Color.White else colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                val subtitle = TabNaming.subtitle(tab.url)
                if (subtitle.isNotEmpty()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (hasPicture) Color.White.copy(alpha = 0.75f)
                        else colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // 关闭：右上角、贴住顶端但不压边（原来贴在右下角偏里，很难找）
            Surface(
                onClick = onClose,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    // 再往下让一点（用户：标签卡右上角的关闭按钮向下移一点点）——
                    // 原来贴得太靠近卡片顶边，圆角处显得挤
                    .padding(top = 9.dp, end = 10.dp)
                    .size(28.dp)
                    .graphicsLayer {
                        // 关闭按钮同样随内容浮出：淡入 + 轻微放大就位
                        alpha = chromeIn
                        val pop = 0.82f + 0.18f * chromeIn
                        scaleX = pop
                        scaleY = pop
                    },
                shape = CircleShape,
                color = if (thumb != null) Color.Black.copy(alpha = 0.6f) else MaterialTheme.colorScheme.surfaceContainerHigh,
                contentColor = if (thumb != null) Color.White else MaterialTheme.colorScheme.onSurface
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(R.string.browser_close_tab),
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
            }
        }
    }
}

/**
 * 自家首页的卡片预览：**按首页真实版式画一张缩略图**。
 *
 * 首页是本地页面（`file:///android_asset/browser-home.html`），它的快照抓不到 ——
 * 进标签页网格时当前页的缩略图恰好缺席，那张卡就只剩一块空面板（用户点名：
 * 「在自定义首页进入标签页，首页那张标签是空白的」）。抓图这条路走不通：
 * 首页在网格形变期间正是飞向卡片的那一层，抓到的只会是形变中的画面。
 *
 * 所以这里**不抓图，直接画**：先按"整页"的尺寸（[pageWidth] × [pageHeight]）
 * 把首页排一遍，再用**与整页形变完全相同**的缩放裁法（Cover 缩放 + 居中裁剪）
 * 缩进卡片。
 *
 * 为什么非得先排后缩、而不是直接把字标画到卡片中间：形变结束的那一刻，卡片是
 * 拿这张预览顶上去接住"还在卡位上的整页"的 —— 两边尺寸对不齐，落位瞬间内容
 * 就会**突然变小 / 跳一下**（用户点名）。按页排布 + 同一套裁法，两边天然同源。
 *
 * 页面版式取自 browser-home.html 的 `.wrap`：上下留白后居中（上 24px、下 20vh），
 * 品牌区高 80px —— 因此字标中心落在 `0.4 × 页高 + 12` 处，**略高于页面中心**。
 * 那两处常量若在 HTML 里改了，这里要跟着改。
 */
@Composable
private fun HomePreview(pageWidth: Dp, pageHeight: Dp, modifier: Modifier = Modifier) {
    val colorScheme = MaterialTheme.colorScheme
    val logoImage = rememberLerxuLogo()
    val ratio = if (logoImage != null && logoImage.height > 0) {
        logoImage.width.toFloat() / logoImage.height.toFloat()
    } else {
        1f
    }
    // 深色底下原标的深藏青会糊进背景 —— 与首页同读法：把它提亮
    val tint = if (colorScheme.background.luminance() < 0.5f) {
        ColorFilter.tint(colorScheme.onSurface)
    } else {
        null
    }
    Box(
        modifier = modifier
            // 首页底色跟应用底一致（首页的 --bg 就是这个值，见 refreshHomeConfig 下发的色板）
            .background(colorScheme.background)
            // 直接算屏幕矩形再画，**不走布局/图形层**。
            //
            // 上一版是"造一个整页大小的盒子、再靠 graphicsLayer 缩放平移"：一个比
            // 卡片还大的子节点 + requiredSize + transformOrigin，链上任何一环没按
            // 预期生效，画出来就是一片空白或者只有一角有东西（用户报的正是这个）。
            // 这里改成一个坐标系里手算：形变怎么映射，这里就怎么映射，没有中间环节
            .drawBehind {
                if (logoImage == null) return@drawBehind
                val cardW = size.width
                val cardH = size.height
                val pageW = pageWidth.toPx()
                val pageH = pageHeight.toPx()
                if (pageW <= 0f || pageH <= 0f) return@drawBehind
                // 覆盖式缩放 + 居中取窗：与整页形变的 `cover` / `window` 同一个算式
                val cover = maxOf(cardW / pageW, cardH / pageH)
                val tx = (cardW - pageW * cover) / 2f
                val ty = (cardH - pageH * cover) / 2f
                // 字标在"页面"里的位置：水平居中；垂直中心在 0.4×页高 + 12 处
                //（首页 .wrap 上 24px、下 20vh，上下留白后居中 —— 因此略高于页面中心）
                val h = HOME_BRAND_HEIGHT.toPx() * cover
                val w = h * ratio
                val cx = pageW / 2f * cover + tx
                val cy = (pageH * 0.4f + 12.dp.toPx()) * cover + ty
                drawImage(
                    image = logoImage,
                    dstOffset = IntOffset(
                        (cx - w / 2f).roundToInt(),
                        (cy - h / 2f).roundToInt()
                    ),
                    dstSize = IntSize(
                        w.roundToInt().coerceAtLeast(1),
                        h.roundToInt().coerceAtLeast(1)
                    ),
                    colorFilter = tint
                )
            }
    )
}

/** 首页品牌区的高度（与 browser-home.html 里 `.brand img` 的 80px 一致）。 */
private val HOME_BRAND_HEIGHT = 80.dp

/**
 * 自家的网页加载失败页面。
 *
 * **铺满整块网页区域**、用不透明的页面底色盖住 WebView：Chromium 在主文档失败时
 * 会画一张自己的错误页，只浮一张小卡的话它照样透出来 —— 那正是用户说的
 * "用的还是原始网页"。所以这里做成一个真正的**页面**，而不是浮层卡片。
 *
 * 版式：大号断线图标（呼吸）+ 标题 + 具体失败原因 + 「重试 / 回到首页」两个出口。
 * 换一条失败原因会重播一次进场（淡入 + 0.96 → 1 轻微放大）。
 */
@Composable
private fun PageErrorView(
    message: String,
    onRetry: () -> Unit,
    onHome: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme
    var shown by remember(message) { mutableStateOf(false) }
    LaunchedEffect(message) { shown = true }
    val appear by animateFloatAsState(
        targetValue = if (shown) 1f else 0f,
        animationSpec = tween(260, easing = FastOutSlowInEasing),
        label = "pageErrorAppear"
    )
    val pulse = rememberInfiniteTransition(label = "pageErrorPulse").animateFloat(
        initialValue = 0.92f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(
            tween(1100, easing = FastOutSlowInEasing),
            RepeatMode.Reverse
        ),
        label = "pageErrorPulseScale"
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colorScheme.background)
            // 整页是自家的错误页：**吞掉没被控件用掉的触摸**。不吞的话事件会落到
            // 下面那张 Chromium 自带的错误页上 —— 长按选中的是原始页面的文字，
            // 复制出来是"ERR_..."那一套，而不是我们写的失败原因（用户点名）。
            // 子节点（按钮 / 可选文本）在 Main 阶段先拿到事件，处理过就不重复消费
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        awaitPointerEvent().changes.forEach { it.consume() }
                    }
                }
            }
            .graphicsLayer {
                alpha = appear
                scaleX = 0.96f + 0.04f * appear
                scaleY = 0.96f + 0.04f * appear
            },
        contentAlignment = Alignment.Center
    ) {
        // 失败原因要能**长按选中、复制**：包一层选择容器，选中与复制都走我们自己的
        // 文本（下面那张原始错误页已经不参与手势了）
        SelectionContainer {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 36.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .size(84.dp)
                        .clip(CircleShape)
                        .background(colorScheme.errorContainer.copy(alpha = 0.5f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.CloudOff,
                        contentDescription = null,
                        modifier = Modifier
                            .size(38.dp)
                            .graphicsLayer {
                                scaleX = pulse.value
                                scaleY = pulse.value
                            },
                        tint = colorScheme.error
                    )
                }
                Spacer(Modifier.height(20.dp))
                Text(
                    stringResource(R.string.browser_error_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(24.dp))
                Button(
                    onClick = onRetry,
                    shape = RoundedCornerShape(14.dp),
                    contentPadding = PaddingValues(horizontal = 28.dp, vertical = 10.dp)
                ) {
                    Text(stringResource(R.string.browser_retry))
                }
                Spacer(Modifier.height(4.dp))
                TextButton(onClick = onHome) {
                    Text(stringResource(R.string.browser_error_home))
                }
            }
        }
    }
}

/**
 * 自家的页面加载动画（不是系统那条细进度条）。
 *
 * 一圈匀速转动的弧 + 中间一枚**轻轻呼吸的字标**（与首页同一个资产），
 * 底色用页面底 —— 读起来是"应用自己在加载"，而不是网页自己的骨架屏。
 *
 * 盖住的那块是空白期：页面一画上来 `visible` 就转 false，260ms 淡出。
 */
@Composable
private fun PageLoadingOverlay(visible: Boolean, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = fadeIn(tween(180)),
        exit = fadeOut(tween(260))
    ) {
        // 两条无限动画放在**可见分支内部**：放外面的话，即便整块隐着，
        // 转圈与呼吸也会一直跑下去 —— 应用再也进不了空闲，白白每帧重绘
        PageLoadingGlyph()
    }
}

/** 加载动画本体（转圈 + 呼吸字标）。只在覆盖层可见期间存在。 */
@Composable
private fun PageLoadingGlyph() {
    val colorScheme = MaterialTheme.colorScheme
    val logo = rememberLerxuLogo()
    val spin = rememberInfiniteTransition(label = "pageLoadSpin").animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1100, easing = LinearEasing)),
        label = "pageLoadSpinAngle"
    )
    val breath = rememberInfiniteTransition(label = "pageLoadBreath").animateFloat(
        initialValue = 0.86f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(900, easing = FastOutSlowInEasing),
            RepeatMode.Reverse
        ),
        label = "pageLoadBreathScale"
    )
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Box(modifier = Modifier.size(46.dp), contentAlignment = Alignment.Center) {
            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { rotationZ = spin.value }
            ) {
                val stroke = 2.4.dp.toPx()
                val radius = size.minDimension / 2f - stroke / 2f
                drawArc(
                    color = colorScheme.primary,
                    startAngle = -90f,
                    sweepAngle = 250f,
                    useCenter = false,
                    topLeft = Offset(stroke / 2f, stroke / 2f),
                    size = Size(radius * 2f, radius * 2f),
                    style = Stroke(width = stroke, cap = StrokeCap.Round)
                )
            }
            if (logo != null) {
                Image(
                    bitmap = logo,
                    contentDescription = null,
                    modifier = Modifier
                        .height(13.dp)
                        .aspectRatio(logo.width.toFloat() / logo.height.coerceAtLeast(1))
                        .graphicsLayer {
                            scaleX = breath.value
                            scaleY = breath.value
                        },
                    // 深色底上原标的深藏青会糊进背景：与首页同读法，把它提亮
                    colorFilter = if (colorScheme.background.luminance() < 0.5f) {
                        ColorFilter.tint(colorScheme.onSurface)
                    } else {
                        null
                    }
                )
            }
        }
    }
}

/** 首页字标（assets 里那张）解一次记住：卡片预览与页面加载动画共用。 */
@Composable
private fun rememberLerxuLogo(): ImageBitmap? {
    val context = LocalContext.current
    val logo = remember {
        runCatching {
            context.assets.open("lerxu-logo.png").use { BitmapFactory.decodeStream(it) }
        }.getOrNull()
    }
    return remember(logo) { logo?.asImageBitmap() }
}

/**
 * 窗口模式滑块：普通窗口 ⇄ 无痕窗口。
 *
 * 圆角、悬浮（带一点投影）、左右不贴边，靠一个滑动的指示块表达当前模式 ——
 * 不再是"点按钮弹选择框"。切到无痕需要先过认证（见 [switchWindowMode]）。
 */
@Composable
private fun WindowModeSwitch(
    incognito: Boolean,
    onSelect: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val colorScheme = MaterialTheme.colorScheme
    val slide by animateFloatAsState(
        targetValue = if (incognito) 1f else 0f,
        animationSpec = tween(240, easing = FastOutSlowInEasing),
        label = "windowModeSlide"
    )
    // 高亮块的颜色**不随窗口模式变**：原来切到无痕会换成 tertiary（绿），
    // 读起来像"另一个控件的状态"（用户点名）。无痕的身份由边框表达。
    val accent = colorScheme.primary
    val onAccent = colorScheme.onPrimary

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        // 滑块**自己的容器保留底色**（要清除的是外面那条包着它的浮条，见 TabGrid）
        color = colorScheme.surfaceContainerHigh,
        // 无痕模式改用边框（去掉阴影）：这是"另一类窗口"的标识。
        // 描边要克制（用户："有点太明显了"）—— 只给一点点色，够看出边界就行
        border = if (incognito) {
            BorderStroke(1.dp, colorScheme.primary.copy(alpha = 0.32f))
        } else {
            null
        },
        shadowElevation = if (incognito) 0.dp else 6.dp,
        tonalElevation = 0.dp
    ) {
        // **长度**由这里定：只占头部宽度的 52%，左右各留约四分之一（用户：
        // "应该只占中间那一块区域，左右间距应该增加"）。之前这里只给了高度，
        // 内部的 `Row(fillMaxSize)` 把宽度撑到了整条头部 —— 于是它"始终占满顶部的
        // 空间"，缩字号也看不出变化（用户："是长度缩小，不是文字缩小"）。
        BoxWithConstraints(
            modifier = Modifier
                .height(34.dp)
                .fillMaxWidth(WINDOW_SWITCH_WIDTH)
        ) {
            val segment = maxWidth / 2
            // 高亮块的水平留边：3dp → 4dp（用户："就一点点"）。宽度与位移都
            // 从这里推导，改一处两边自动对齐
            val insetX = 4.dp
            Box(
                modifier = Modifier
                    .padding(horizontal = insetX, vertical = 3.dp)
                    .width(segment - insetX)
                    .fillMaxHeight()
                    .offset(x = (segment - insetX) * slide)
                    .clip(RoundedCornerShape(14.dp))
                    .background(accent)
            )
            Row(modifier = Modifier.fillMaxSize()) {
                WindowModeSegment(
                    label = stringResource(R.string.window_normal_short),
                    icon = Icons.Default.Home,
                    selected = !incognito,
                    selectedColor = if (!incognito) onAccent else colorScheme.onSurfaceVariant,
                    onClick = { onSelect(false) },
                    modifier = Modifier.weight(1f)
                )
                WindowModeSegment(
                    label = stringResource(R.string.window_incognito_short),
                    icon = Icons.Default.Lock,
                    selected = incognito,
                    selectedColor = if (incognito) onAccent else colorScheme.onSurfaceVariant,
                    onClick = { onSelect(true) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun WindowModeSegment(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    selected: Boolean,
    selectedColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = if (selected) selectedColor else MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.width(5.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = if (selected) selectedColor else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/** 无痕标记：只在无痕模式**且停在自家首页**时浮在网页顶部（见调用处）。 */
@Composable
private fun IncognitoBadge(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.tertiaryContainer,
        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
        shadowElevation = 4.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(13.dp))
            Spacer(Modifier.width(5.dp))
            Text(
                stringResource(R.string.incognito_window),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

/** 从 Compose 的 Context 里剥出宿主 Activity（Compose 给的常是包装过的 Context）。 */
private fun Context.findFragmentActivity(): androidx.fragment.app.FragmentActivity? {
    var ctx: Context? = this
    while (ctx != null) {
        if (ctx is androidx.fragment.app.FragmentActivity) return ctx
        ctx = (ctx as? android.content.ContextWrapper)?.baseContext
    }
    return null
}
