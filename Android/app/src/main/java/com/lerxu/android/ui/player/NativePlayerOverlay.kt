package com.lerxu.android.ui.player

import android.animation.ValueAnimator
import android.app.Activity
import android.content.pm.ActivityInfo
import android.graphics.Rect
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.LifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.ExoPlayer
import com.lerxu.android.browser.FixedHlsPlaylistParserFactory
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.hls.DefaultHlsDataSourceFactory
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.lerxu.android.R
import com.lerxu.android.browser.HlsProbe
import com.lerxu.android.browser.MediaProbe
import com.lerxu.android.browser.VideoSniffer
import com.lerxu.android.ui.ProvideAppLanguage
import com.lerxu.android.ui.theme.LerxuTheme
import kotlin.math.abs
import kotlin.math.roundToInt

/** 一次「把这一路 M3U8 交给下载引擎」的请求：地址 + 文件名 + 逐任务请求头。 */
data class PlayerDownload(
    val url: String,
    val fileName: String,
    val headers: Map<String, String>
)

/**
 * 原生播放器的**承载层**：一块加在 `decorView` 上的透明覆盖层，里面只有两样东西 ——
 * Media3 的 `PlayerView` 与我们的 Compose 控件层（[PlayerControls]）。
 *
 * ## 为什么这么搭（这是"跟网页自带的播放器一样"的成熟做法）
 * 播放器**不放在 Compose 里**，而是按本工程既有的那套做法（见 `BrowserController`
 * 给网页全屏视频用的 `fullscreenHost`）把一层 View 加到窗口最上层：
 *
 * 1. **窗口内合成**：视频用 `SURFACE_TYPE_TEXTURE_VIEW` 渲染成普通 View 的一部分，
 *    而不是另开一块 SurfaceView 合成面。于是没有"打洞"、没有层级跳、能被上层控件
 *    与页面正常遮挡 —— 之前那些"页面那块画面从播放器底下透出来"的怪象，根源就是
 *    独立合成面。（Media3 官方对"需要与其它 UI 叠放/变换"的场景也是这么建议的。）
 * 2. **贴在网页里那个 `<video>` 的位置上**：位置与尺寸都由页面持续回传（见
 *    PageVideoDetector 的位置回传），跟着网页滚、跟着网页变；**上沿滚出可视范围之后
 *    自动吸附在顶部**（吸在"网页内容顶 + 站点自己那条顶栏"之下）继续跟着用户往下滑
 *    —— 用户点名的那条，规则全在页面里（`PageVideoDetector.playerTop`）；页面切走就不画、
 *    页面没了就整个关掉。
 *    位置**全程保留小数**：取整会在滚动时留下 1dp 台阶（密度 3 就是 3 个设备像素，
 *    读起来就是"上下滑的时候它在抖"）。
 * 3. **不吃页面区域的触摸**：视频区以外的触摸原样漏给下面的网页（`FrameLayout` 不
 *    clickable、子 View 只占视频那一块），网页照常滚动点击。
 * 4. **全屏只是把这两块子 View 铺满 + 横屏 + 藏系统栏**，不涉及任何窗口/页面切换。
 */
@UnstableApi
class NativePlayerOverlay(
    private val activity: Activity,
    private val onClosed: () -> Unit,
    /** 下载弹窗里点了「下载」：交给下载引擎（加任务与回执在界面侧）。 */
    private val onDownload: (PlayerDownload) -> Unit,
    /**
     * 贴在网页里的那一档按返回键时问宿主一句：**这一下该不该算"网页后退"**。
     *
     * 能退就退掉、返回 true（见 [backCallback]）。用户点名："回退网页时首先关掉的是原生
     * 播放器，这是不应该的" —— 返回键在网页浏览里是"回上一页"，播放器只是网页里那块
     * `<video>` 的替身、不是用户"跳进去的一屏"，所以该跟没接管时一样往历史里退一步。
     */
    private val onBackToPage: () -> Boolean = { false }
) {

    val ui = PlayerUi()

    private val main = Handler(Looper.getMainLooper())
    private val decor = activity.window.decorView as ViewGroup
    private val density = activity.resources.displayMetrics.density

    /** 覆盖层本体：透明、不吃触摸，只有子 View 占着视频那一块。 */
    private val host = FrameLayout(activity).apply {
        background = null
        isClickable = false
        clipChildren = false
        visibility = View.GONE
    }

    /**
     * 视频外面的**裁剪窗口**：视频装在这里面。窗口态它就是播放器整块（不裁任何东西）；
     * 网格形变时它缩成"网页此刻的可见窗口"，形变到卡片外的部分就靠它裁掉。
     *
     * 为什么需要它：网页形变是"覆盖式缩放 + 窗口裁剪"——缩到卡片时视频会有一部分被
     * 窗口裁掉（跟网页里那块一模一样）。没有这一层的话，播放器会照着映射把视频画到
     * 卡片外面去（网格上会多出一块视频）。
     */
    private val clip = FrameLayout(activity).apply {
        background = null
        isClickable = false
        clipChildren = true
    }

    /**
     * 视频画面：**用 XML 里的 `surface_type="texture_view"` 建** —— Media3 1.5 的这个
     * 属性只有 XML 入口（`setSurfaceType` 那时还不是公开 API），而"窗口内合成"正是
     * 这套覆盖层能干净工作的前提（见类注释）。
     */
    private val videoView = (activity.layoutInflater.inflate(R.layout.player_video_view, host, false) as PlayerView).apply {
        useController = false
        // **由我们自己摆尺寸**（见 [fitRect]）：画面该是多大、摆在哪，都由覆盖层按视频
        // 自己的宽高比算好，PlayerView 只负责把这一帧铺满它自己那块 —— 所以这里用 FILL
        // 而不是 FIT/ZOOM：那两档是"让 Media3 去改这块的尺寸"，与我们自己算的矩形叠加
        // 会互相打架（各算一次，边对不齐）
        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FILL
        // **换播放器时不许留着上一帧**（用户点名："为什么原生播放器每次播放的首帧都是
        // 上一个视频的"）。media3 这个开关的默认值就是 false，早先这里显式设成了 true ——
        // 它的全部作用就是"player 置空 / 换新 player 时把上一帧留在表面上"，正好是这个
        // 现象的成因：[playAttempt] 每次都 `releasePlayer()`（`player = null`）再建新的，
        // 于是新片子**渲染出第一帧之前**，屏幕上一直是上一个视频的画面。
        // 置回 false：那一段时间走 media3 的清屏（露出下面这层黑板），读起来是"正在起播"。
        //
        // **别改成"把这块 View 设成 INVISIBLE、等 onRenderedFirstFrame 再放出来"**：
        // `TextureView` 在不可见时会释放自己的 Surface，而本播放器正是靠这块 TextureView
        // 才能在窗口内合成的（见类注释与布局文件的 `surface_type`）—— 表面一没，
        // 首帧就永远渲染不出来，那才是真正卡死的那种黑屏。
        setKeepContentOnPlayerReset(false)
    }

    private val controlsView = ComposeView(activity).apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        setContent {
            // 播放器本身就是深色 UI（视频上压着暗条 + 白字），这里把主题钉成深色：
            // 不套主题的话，控件层里的 Material 组件拿到的是**默认浅色**配色（见 PlayerSheets）
            LerxuTheme(darkTheme = true) {
                // 语言：这一棵 ComposeView 挂在 decorView 上、**不在主树里**，
                // 拿不到主树那层 `ProvideAppLanguage` —— 不套上它，语言一切这里的
                // "锁屏 / 设置 / 下载" 还是老语言（见 AppLocale）
                ProvideAppLanguage {
                    PlayerControls(
                        ui = ui,
                        onToggleFullscreen = { setFullscreen(!ui.fullscreen) },
                        onToggleOrientation = { toggleFullscreenOrientation() },
                        onOpenSettings = { openSettings() },
                        onOpenDownload = { openDownload() },
                        // 播不了 → 关掉我们这一层，页面那边由 setNativePlayerActive(false)
                        // 原样还回去（onClosed 会让 AppScreen 把 playing 置空，两边一并收）
                        onFallbackToPage = { close() }
                    )
                }
            }
        }
    }

    /**
     * **弹窗层**：设置 / 下载两张弹窗挂在这一层上，整窗口大小。
     *
     * 为什么不跟控件放在一起：控件层是**按视频那块矩形摆的**（见 [applyLayout]），
     * 弹窗放进去就会被限制在播放器内（用户点名"为什么被限制在播放器内"）。这一层
     * 铺满窗口、只有弹窗开着时才可见，于是窗口态是贴屏幕底的面板、全屏态是贴右侧的
     * 面板，都不再受视频矩形约束；关着的时候整层 GONE，也不吃任何触摸。
     */
    private val sheetView = ComposeView(activity).apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        visibility = View.GONE
        setContent {
            LerxuTheme(darkTheme = true) {
                // 与控件层同一个理由：这一棵 ComposeView 也不在主树里，语言得自己套
                ProvideAppLanguage {
                    // 两张弹窗**始终留在组合里**，开与不开只落到 `visible` 上 —— 收起时得有人
                    // 把退场动画跑完（弹窗内部是 AnimatedVisibility），`if (ui.settingsOpen)`
                    // 那种增删子树的做法就是"啪"地跳出来又"啪"地消失（用户点名）。
                    PlayerSettingsSheet(
                        ui = ui,
                        visible = ui.settingsOpen,
                        player = ui.player,
                        // 换了比例只需重摆一次：画面尺寸由 [fitRect] 按 `ui.fit` 现算
                        onFit = { applyLayout() },
                        onKeepOn = { host.keepScreenOn = it },
                        // 面板实测尺寸 → 让位（竖屏贴底那档靠它才知道该让多高）
                        onPanelSize = ::onSheetPanelSize,
                        onClosePlayer = {
                            closeSettings()
                            close()
                        },
                        onDismiss = { closeSettings() }
                    )
                    PlayerDownloadSheet(
                        ui = ui,
                        visible = ui.downloadOpen,
                        onDismiss = { closeDownload() },
                        onPanelSize = ::onSheetPanelSize,
                        onConfirm = { name ->
                            closeDownload()
                            onDownload(
                                PlayerDownload(streamUrl, name, streamHeaders)
                            )
                        }
                    )
                }
            }
        }
    }

    /**
     * 页面报回来的位置（屏幕坐标、dp，**带小数**）：视频与控件都摆在这块上。
     *
     * 为什么保留小数：页面报的是一位小数的 CSS px，原生这边立刻取整会在滚动时留下
     * 1dp 台阶（乘上密度就是几个设备像素的"抖动"）—— 用户点名的"上下滑它还抖"里
     * 有一半是它。
     */
    private var frame: RectF? = null

    /**
     * **最近一次真的量到过的**那一块（窗口 px）。
     *
     * 为什么要留它：页面在网格展开、切清晰度、站点自己收放播放器的那几拍里可能一次都
     * 报不上来（[frame] 这会短暂是 null）。没有这份底子的话，网格形变那一支会被整段
     * 跳过 —— 播放器就**原尺寸赖在网格上方**，等收尾再消失（用户点名：
     * "它会先悬浮在标签上方再消失，这是不应该的"）。留着上一块，形变照常进行，
     * 播放器就跟网页一起缩进卡片。
     */
    private var lastBox: android.graphics.RectF? = null

    /** 网格是否正在展开（[applyLayout] 据此决定"没位置就藏起来"而不是原地赖着）。 */
    private val gridRunning: Boolean get() = gridProgress > 0.02f

    /**
     * 网格形变那一帧播放器该落在哪儿、可见窗口是多大（**窗口坐标 px**，由
     * `BrowserScreen` 用网页形变同一套映射算好推过来），以及整页此刻的不透明度。
     *
     * 三者一起决定"播放器跟网页一起缩进卡片"这一段：位置/缩放照 [morph] 摆、
     * 超出 [morphClip] 的部分裁掉、透明度跟网页同一个值（网页开始淡，播放器才淡 ——
     * 否则网页还在、播放器先没了，页面里那个播放器就露出来）。
     */
    private var morphRect: Rect? = null
    private var morphClip: Rect? = null
    private var gridAlpha = 1f

    /**
     * **最近一次真的收到过的**形变数据（落点 + 可见窗口）。
     *
     * 为什么要留一份：形变是逐帧推过来的，而"这一帧的数据算不出来"是会发生的
     *（锚点卡片还没测到、播放器位置那一帧缺一次……）。缺一帧就退回窗口态摆法的话，
     * 视频会在"形变后的位置"和"窗口态的位置"之间来回跳 —— 读起来就是**不断闪烁**
     *（用户点名："拖动的时候，原生播放器会不断闪烁"）。缺帧时用上一份顶住，等下一帧
     * 新数据到了再接上，整段形变就是连续的。
     */
    private var lastMorph: Rect? = null
    private var lastMorphClip: Rect? = null

    /**
     * 页面报上来的位置**已经是"吸附之后"的那一条**（见 `PageVideoDetector.playerTop`）：
     * 视频上沿越过站点顶栏露出来的那一条就钉在它下面、顶栏收起来就贴视口顶。
     *
     * 所以这里**没有**吸附线、没有裁剪量、也没有平滑与死区 —— 覆盖层只做一件事：
     * 照着这一份位置摆。早先原生侧要拿"网页内容顶 + 顶栏高度"两处数字自己拼吸附线，
     * 两个数各有各的来源与量化（顶栏高度、状态栏内边距、进度条那一截 2dp），对不齐时
     * 顶上就裂出一道缝、网页内容从缝里透出来（用户点名"顶部仍然有缝隙"）。
     * 规则挪进页面之后，吸附后的位置与视频矩形出自**同一次 getBoundingClientRect**，
     * 结构上不可能对不齐。
     */

    /** 标签网格展开进度（0..1）：非 0 就说明网格在场，控件层不参与（不画也不吃触摸）。 */
    private var gridProgress = 0f

    private var restoreOrientation = activity.requestedOrientation
    private var restoreLightStatusBar: Boolean? = null

    /**
     * 用户在全屏里**自己按过**右下角那枚转屏按钮：按过之后，方向就不再由内容自动决定
     *（见 [followContentOrientation]）。每开一路流复位一次 —— 那是新的一条片子。
     */
    private var userPickedOrientation = false

    /** 当前这一路流的地址、请求头与嗅探到的 MIME：下载弹窗确认与可下载源判定都要用。 */
    private var streamUrl: String = ""
    private var streamHeaders: Map<String, String> = emptyMap()
    private var streamMime: String = ""

    /** HLS 大小探测的竞态令箭：换一路流 +1，在飞的旧回调据此作废。 */
    private var downloadProbeToken = 0

    /**
     * 弹窗收起动画进行中（整层等它跑完再 GONE，见 [applyLayout]）。
     *
     * 为什么要等：`ui.settingsOpen` 一翻成 false，Compose 那边才开始播退场动画；
     * 这一层要是当场 GONE，动画刚起头就整块消失 —— 读起来还是"直接跳"（用户点名）。
     */
    private var sheetHiding = false

    /**
     * 弹窗让出的那一条，占 [sheetInsetPx] 的**比例**（0f~1f）。
     *
     * 为什么要有"让位"这一层（用户点名："改为让视频容器自己让位，确保不会被播放设置弹窗
     * 遮挡，同时确保它能完整显示"）：弹窗面板是**不透明**的，它压在画面上就是遮挡 ——
     * 早先的解法是给面板加渐变背景让画面透出来，那只是把"遮挡"变成"半透明遮挡"，面板底下的
     * 画面还在，且两层半透明叠出脏边。现在改成各让各的：弹窗占哪一档，画面就在剩下那块
     * 里**按自己的比例重新摆**（见 [applyLayout] 的全屏段与 [fitRect]）。
     *
     * 让位是**按边**的，不是固定一条右边：
     * - 全屏横屏（贴右整高）：让**右**边，让出宽度 = [SIDE_SHEET_WIDTH]；
     * - 全屏竖屏（贴底整宽）：让**底**边，让出高度 = 面板**实测**高度（[sheetInsetPx]，
     *   弹窗用 `onSizeSizeChanged` 报上来，见 `PlayerSheet` 的 `onPanelSize`）——
     *   竖屏那档面板高度由内容决定，猜常数必然对不上（用户点名"为什么竖屏状态下不会避让"）；
     * - 窗口态：不让位（弹窗盖在网页上，视频那一块在网页里，让了位反而错位）。
     *
     * 用比例而不是直接存 px：面板是滑入滑出的（[SHEET_ANIM_MS]），让位得跟它**同步**，
     * 否则画面先跳到一边、面板再滑进来，中间那 220ms 就是"面板压着一块已经摆错位置的画面"。
     */
    private var sheetInsetFrac = 0f
    private var sheetInsetAnim: ValueAnimator? = null

    /**
     * 弹窗面板的**实测尺寸**（px，由 `PlayerSheet` 的 `onSizeChanged` 报上来）。
     *
     * 贴右那档只用得上宽度、且它是固定值（[SIDE_SHEET_WIDTH]）；**贴底那档（竖屏）要用高度**，
     * 而高度由内容决定（设置弹窗与下载弹窗差很多，后者还要给键盘留位置）—— 只能实测。
     */
    private var sheetPanelW = 0
    private var sheetPanelH = 0

    /** 弹窗实测尺寸回报（见 [sheetPanelH]）。 */
    fun onSheetPanelSize(widthPx: Int, heightPx: Int) {
        if (widthPx == sheetPanelW && heightPx == sheetPanelH) return
        sheetPanelW = widthPx
        sheetPanelH = heightPx
        applyLayout()
    }

    /**
     * 让位动画的目标比例：全屏（横竖屏都算）+ 有一张弹窗开着 = 1f，否则 0f。
     *
     * **判据是 `ui.fullscreen` 而不是 `sideSheetOf`** —— 竖屏那档是贴底整宽，同样不该被
     * 面板压着（用户点名）。让位的**边**与**宽度**由 [sheetInsetPx] 那套决定。
     */
    private fun syncSheetInset() {
        val target = if (ui.fullscreen && (ui.settingsOpen || ui.downloadOpen)) 1f else 0f
        if (abs(target - sheetInsetFrac) < 0.001f && sheetInsetAnim?.isRunning != true) return
        sheetInsetAnim?.cancel()
        sheetInsetAnim = ValueAnimator.ofFloat(sheetInsetFrac, target).apply {
            duration = SHEET_ANIM_MS.toLong()
            // 与面板那侧同一条曲线：Compose 的 `FastOutSlowInEasing` 就是控制点
            // (0.4, 0, 0.2, 1) 的三次贝塞尔（平台只有 `FastOutSlowInInterpolator`
            // 之外的近似档，所以直接用 `PathInterpolator` 还原它，曲线逐点对得上）
            interpolator = PathInterpolator(0.4f, 0f, 0.2f, 1f)
            addUpdateListener {
                sheetInsetFrac = it.animatedValue as Float
                applyLayout()
            }
            start()
        }
    }

    /** 让位落在哪条边：贴右那档让右边，贴底那档让底边。 */
    private fun insetOnBottom(): Boolean =
        ui.fullscreen && ui.fullscreenPortrait

    private val hideSheetLayer = Runnable {
        sheetHiding = false
        sheetView.visibility = View.GONE
    }

    /**
     * 返回键：**先解锁 / 收弹窗**，再退全屏，**然后交给网页后退**，最后才关播放器。
     *
     * 顺序里的两条都是用户点名的：
     * - "开着弹窗、或者锁着屏按一下就把片子关了" —— 弹窗与锁定态要各吃一下；
     * - "回退网页时首先关掉的是原生播放器，这是不应该的" —— 贴在网页里的那一档
     *   （非全屏）按返回，该**跟没接管时一样往历史里退一步**（[onBackToPage]）；
     *   页面一换，这一路播放器自己就被 `onHostPageNavigated` 收摊了，不用我们手动关。
     *   只有历史到头（没有上一页）时才由我们关掉它 —— 不然它会退回任务页继续出声。
     *
     * 全屏那一档仍然先退全屏：全屏是用户**主动进去的一屏**，返回键该先出来。
     */
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            when {
                ui.settingsOpen -> closeSettings()
                ui.downloadOpen -> closeDownload()
                ui.locked -> ui.locked = false
                ui.fullscreen -> setFullscreen(false)
                onBackToPage() -> Unit
                else -> close()
            }
        }
    }

    /** 返回键接管：挂在 Activity 的调度器上，开播时启用、收摊时摘掉。 */
    private val backDispatcher = (activity as? ComponentActivity)?.onBackPressedDispatcher

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            ui.playing = isPlaying
        }

        /**
         * 视频的真实宽高比到了：记下来并**立刻重摆**。
         *
         * 这一条是"画面显示对不对"的地基（见 [fitRect]）：没有它，覆盖层就不知道画面
         * 该摆成多宽多高，只能把视频硬塞进页面报来的那块矩形 —— 比例不合时要么留边、
         * 要么被裁。ExoPlayer 在解出第一帧前后就会回调（换清晰度、换分辨率也会再来）。
         */
        override fun onVideoSizeChanged(videoSize: VideoSize) {
            ui.videoAspect = displayAspectOf(videoSize)
            applyLayout()
            followContentOrientation()
        }

        override fun onPlaybackStateChanged(state: Int) {
            ui.buffering = state == Player.STATE_BUFFERING
            ui.ended = state == Player.STATE_ENDED
            if (state == Player.STATE_READY) ui.failed = null
        }

        override fun onPlayerError(error: PlaybackException) {
            ui.buffering = false
            // **第一个**错误才是"这一路到底怎么了"：重试列表是 [探测结论, 另一种解释]，
            // 而另一种解释失败时给的往往是一句没有信息量的兜底错误（m3u8 被当普通文件去
            // 嗅探 ⇒ "None of the available extractors could read the stream"）。
            // 早先这里直接报**最后**那次，于是加密流真正的失败原因（清单/密钥）被盖掉了
            //（用户截图里那句"不是能直接播的视频流"就是这么来的）。
            if (firstError == null) firstError = error
            // 记下"这一路"自己的错误：失败画面那行明细按 kind 逐条列（见 attemptErrors）
            if (attemptIndex in attemptErrors.indices) attemptErrors[attemptIndex] = error
            // 还有没试过的"解释"（清单 ⇄ 普通文件）就先自己再试一次 —— 用户点名要"更强壮"：
            // 失败一次就把一长串提取器名字摔出来，不该是这台播放器的行为
            if (attemptIndex < attemptKinds.size - 1) {
                attemptIndex++
                playAttempt()
                return
            }
            ui.failed = segmentHint() ?: friendlyError(firstError ?: error)
            ui.failedDetail = describeAttempts()
        }
    }

    /**
     * 我们手里这只地址**本身就是一只分片**（ts / m4s …）时，给一句说得清的话。
     *
     * 分片不是"能播的流"：单独一只只有几秒，加密的那种更是一团随机字节。正常路径下挑源
     * 不会挑到它（见 `VideoSniffer.playbackRank`），所以出现这一句就说明**这一路根本没有
     * 可播的清单**（最典型：站点把清单塞在自己的 JS 里、用 blob/MSE 自己解密播放）——
     * 那种流任何通用播放器都拿不到地址，说清楚比糊一句"不是能直接播的视频流"有用得多。
     */
    private fun segmentHint(): String? {
        val ext = VideoSniffer.extensionOf(streamUrl)
        if (ext !in VideoSniffer.segmentFormats) return null
        return "拿到的是一只分片，不是播放清单（这类流多半由网页自己解密播放，播放器取不到能播的地址）"
    }

    /**
     * 失败画面那行**技术细节**：每一路试过的解释 + 它的错误码 + media3 的原话（截断）。
     *
     * 为什么要有它：界面上那句人话为了好读，把好几个错误码合成了同一句 —— 报问题的人
     * 看不出区别，我们这边也只能靠猜。这一行把最原始的判断依据摆出来。
     */
    private fun describeAttempts(): String? {
        if (attemptKinds.isEmpty()) return null
        val parts = attemptKinds.mapIndexedNotNull { i, kind ->
            val e = attemptErrors.getOrNull(i) ?: return@mapIndexedNotNull null
            val cause = e.cause?.message?.take(90)?.replace('\n', ' ')
            val msg = e.message?.take(60)?.replace('\n', ' ')
            "$kind[${e.errorCode}] " + (cause ?: msg.orEmpty())
        }
        if (parts.isEmpty()) return null
        return parts.joinToString("\n")
    }

    /**
     * 把 ExoPlayer 的错误码翻成一句人话（用户点名：不要再看到那串提取器报错）。
     *
     * 分档按"用户能做什么"来分：地址要登录/已失效、网络不行、数据坏了、
     * 这条地址根本不是直链、设备解不了这一档编码 —— 四类之外才回退到错误码。
     */
    private fun friendlyError(error: PlaybackException): String = when (error.errorCode) {
        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
        PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND,
        PlaybackException.ERROR_CODE_IO_NO_PERMISSION,
        PlaybackException.ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE,
        PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED ->
            "服务器拒绝了这一路（可能需要登录，或链接已失效）"

        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
        PlaybackException.ERROR_CODE_IO_UNSPECIFIED,
        PlaybackException.ERROR_CODE_TIMEOUT ->
            "网络读取失败（连接超时或被中断）"

        PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED ->
            "视频数据损坏，读到一半读不下去了"

        PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED ->
            "这条地址不是能直接播的视频流（多半是被网页包装过的地址）"

        // 下面两条早先与上面合成同一句，结果"报问题的人"和"我们"都分不出是哪一档
        //（2026-10-04 用户连报两次加密 m3u8，截图一模一样）。拆开之后**光看主文案**
        // 就能知道是"清单写得不规范"还是"清单里有不支持的东西"。
        PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED ->
            "这条流的清单写得不规范，播放器读不了（常见于加密流的 #EXT-X-KEY）"

        PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED ->
            "这条流的清单里有播放器不支持的东西（例如某种加密方式或 DRM）"

        PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
        PlaybackException.ERROR_CODE_DECODER_INIT_FAILED,
        PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED,
        PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES ->
            "视频编码不受支持，这台设备解不了"

        else -> "播放失败（代码 ${error.errorCode}）"
    }

    /**
     * 播放中每 250ms 取一次进度与缓冲（ExoPlayer 没有现成的进度流）。
     *
     * ⚠️ 播放器还没就绪时**必须把这一拍照样排回去**：这条表是在 [open] 里起的，而播放器要等
     * 容器探完才建（[playAttempt]）—— 早先这里直接 `return`，表就死在第一拍上、再也不跑，
     * 于是进度条永远显示 0:00 / 0:00（用户点名的那条）。让它自己续命，比"哪里建好播放器就
     * 记得再启一次表"稳得多（[playAttempt] 里那一句是顺手提前生效，不是唯一保障）。
     */
    private val poll = object : Runnable {
        override fun run() {
            val exo = ui.player
            if (exo == null) {
                main.postDelayed(this, 250)
                return
            }
            ui.durationMs = exo.duration.coerceAtLeast(0L)
            if (!ui.scrubbing) ui.positionMs = exo.currentPosition.coerceAtLeast(0L)
            ui.bufferedMs = exo.bufferedPosition.coerceAtLeast(0L)
            main.postDelayed(this, 250)
        }
    }

    init {
        // 视频装在裁剪窗口里（形变时按页面的可见窗口裁），控件层直接挂在覆盖层上
        clip.addView(
            videoView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        host.addView(
            clip,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        host.addView(
            controlsView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        // 弹窗层压在控件层之上（它是整窗口的，弹窗打开时要把控件一起盖住）
        host.addView(
            sheetView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        decor.addView(
            host,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        // 窗口尺寸一变就重摆：全屏那块"画面居中"是按窗口实测尺寸算的（见 [applyLayout]
        // 全屏那一支），而转屏、系统栏收放都会改它 —— 不重摆的话画面会停在旧的那块上，
        // 读起来就是"转了屏画面还偏着"。尺寸稳定之后本回调不再触发（没有边界变化），
        // 不会和 applyLayout 互相触发成环
        host.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> applyLayout() }
    }

    /**
     * 打开一路流。请求头按当前标签页的 Referer / UA / Cookie 拼（影视站的流几乎都校验防盗链）。
     *
     * [isHls] / [mime] = 界面给的"这一路是不是 m3u8、嗅探到的 MIME"：与地址一起当
     * **可下载源**的第一手线索（见 [guessDownloadSource]）—— 右上角那枚下载入口按它先开，
     * 容器探测回来后再按真实结论纠正（见 [applyProbedSource]）。
     *
     * 开播分两步（用户点名要"更强壮"）：先在后台**探一次容器**（见 [MediaProbe]），
     * 拿到结论再决定交给 ExoPlayer 哪一种数据源；探到"这是一张网页"就当场说清楚，
     * 不再进那套把一长串提取器名字摔给用户的兜底错误。
     */
    fun open(
        url: String,
        title: String,
        headers: Map<String, String>,
        isHls: Boolean = false,
        mime: String = "",
        /**
         * **开着但先不自动播**（用户点名："刚进入网页时，播放器如果处于暂停状态，显示的就是
         * 他们自己的播放器，不是我们原生播放"）。
         *
         * 这时整路是"页面里那个还停着的播放器"的替身：画面摆在同一位置、显示第一帧，
         * 等用户点我们那枚播放键。**不能自己播起来** —— 用户根本没按过播放，
         * 替他播等于凭空开始放片子。首播之后的重试（换容器再试一次）沿用同一个选择。
         */
        startPaused: Boolean = false
    ) {
        if (ui.open) close(notify = false)
        ui.reset()
        ui.open = true
        startPausedForAttempt = startPaused
        firstError = null
        attemptErrors.fill(null)
        ui.title = title
        ui.downloadSource = guessDownloadSource(url, isHls, mime)
        streamUrl = url
        streamHeaders = headers
        streamMime = mime
        if (ui.downloadSource != DownloadSource.None) startSizeProbe()

        restoreOrientation = activity.requestedOrientation
        restoreLightStatusBar =
            WindowCompat.getInsetsController(activity.window, decor)?.isAppearanceLightStatusBars
        (activity as? LifecycleOwner)?.let { backDispatcher?.addCallback(it, backCallback) }
        backCallback.isEnabled = true
        host.keepScreenOn = ui.keepOn
        startPoll()
        applyLayout()
        startProbeAndPlay(url, headers, isHls, mime)
    }

    // ─── 开播：先探容器，再按"今天这一路到底该怎么播"建播放器 ───

    /** 建播放器 / 换数据源 / 探测的竞态令箭：换一路流 +1，在飞的旧回调据此作废。 */
    private var playToken = 0

    /**
     * 这一路按哪几种"解释"依次试（前一个失败就换下一个）。
     *
     * 只列**两种**：清单（HLS / DASH）与普通文件（渐进式）。影视站那些
     * "普通文件"地址十有八九就是 m3u8 被当成了普通文件，反过来也有站点把
     * 清单地址嵌在 `.mp4` 结尾的路径里 —— 两种都试过才算尽责。
     */
    private var attemptKinds: List<MediaProbe.Kind> = emptyList()
    private var attemptIndex = 0

    /**
     * 这一路"开着但先不自动播"（见 [open] 的 `startPaused`）。
     *
     * 是个字段而不是 [playAttempt] 的参数：失败重试会再进 [playAttempt] 一次，
     * 而"要不要自动播"是**这一路**的属性，不该在重试时变回"自动播"。
     */
    private var startPausedForAttempt = false

    /** 这一路**第一次**播失败的那个错误（见 [Player.Listener.onPlayerError]）。 */
    private var firstError: PlaybackException? = null

    /**
     * 每一路尝试各自的那个错误（下标与 [attemptKinds] 对齐）。
     *
     * 留全是为了失败画面上那行技术细节（见 [PlayerUi.failedDetail]）：加密流的真实原因
     * 往往只在**其中一路**里（比如"清单里缺 IV"只会出现在 HLS 那一路的错误里，而另一路
     * 给的是毫无信息量的"没有可用提取器"）。
     */
    private val attemptErrors = arrayOfNulls<PlaybackException>(4)

    /** 探测 + 首播。探测在后台线程（网络），回来在主线程建播放器。 */
    private fun startProbeAndPlay(
        url: String,
        headers: Map<String, String>,
        isHls: Boolean,
        mime: String
    ) {
        ui.buffering = true
        val token = ++playToken
        Thread {
            val result = MediaProbe.probe(url, headers)
            main.post {
                if (token != playToken || !ui.open) return@post
                if (result.kind == MediaProbe.Kind.HTML) {
                    // 探到一张网页：多半是登录页 / 防盗链提示页。当场说清楚，
                    // 不建播放器（建了也只会再报一次那串提取器错误）
                    ui.buffering = false
                    ui.failed = "这条地址返回的是网页，不是视频流（可能需要登录或已失效）"
                    return@post
                }
                // 探测顺带纠正**可下载源**：地址线索可能把 `.mpd` / 网页猜成了文件，
                // 也可能漏掉一条没有扩展名的清单 —— 以探出来的容器为准（用户点名"准确识别"）
                applyProbedSource(result)
                attemptKinds = planAttempts(result, isHls, mime)
                attemptIndex = 0
                playAttempt()
            }
        }.apply { isDaemon = true }.start()
    }

    /**
     * 容器探测回来后纠正可下载源：HLS 清单与普通单文件是可下的两档，DASH 清单 / 网页
     * **收掉入口**（它们下出来不是能播的文件）；[MediaProbe.Kind.UNKNOWN]（探不动）
     * 保留地址那点初判，不下新结论 —— 探测只是"让能确定的事先确定"，不是新的门槛。
     *
     * 档位一变，下载弹窗的底子跟着重来：变成可下就重新探一次大小/容器，变成不可下就把
     * 在飞的探测作废、名字与大小清掉（不留上一跳的残留）。
     */
    private fun applyProbedSource(result: MediaProbe.Result) {
        val probed = when (result.kind) {
            MediaProbe.Kind.HLS -> DownloadSource.Hls
            MediaProbe.Kind.PROGRESSIVE -> DownloadSource.File
            MediaProbe.Kind.DASH, MediaProbe.Kind.HTML -> DownloadSource.None
            MediaProbe.Kind.UNKNOWN -> return
        }
        if (probed == ui.downloadSource) return
        ui.downloadSource = probed
        if (probed == DownloadSource.None) {
            downloadProbeToken++
            ui.downloadProbing = false
            ui.downloadSize = 0L
        } else {
            startSizeProbe()
        }
    }

    /**
     * 只按地址与 MIME 给可下载源一个**初判**（探测回来后会按真实容器纠正，见
     * [applyProbedSource]）：认得出是清单就是 [DownloadSource.Hls]，认得出是普通媒体
     * 文件（视频/音频容器后缀，见 [VideoSniffer.mediaFormats]）就是 [DownloadSource.File]，
     * `.mpd` 与认不出的一律先不给入口。
     */
    private fun guessDownloadSource(url: String, isHls: Boolean, mime: String): DownloadSource {
        if (isHls || VideoSniffer.isHlsManifest(url, mime)) return DownloadSource.Hls
        val mimeLower = mime.substringBefore(';').trim().lowercase()
        if (mimeLower.contains("dash+xml")) return DownloadSource.None
        val ext = VideoSniffer.extensionOf(url)
            .ifEmpty { VideoSniffer.extensionFromMime(mime).orEmpty() }
        if (ext == "mpd") return DownloadSource.None
        return if (ext in VideoSniffer.mediaFormats) DownloadSource.File else DownloadSource.None
    }

    private fun planAttempts(
        result: MediaProbe.Result,
        isHls: Boolean,
        mime: String
    ): List<MediaProbe.Kind> {
        val hlsHint = isHls || mime.contains("mpegurl", ignoreCase = true) ||
            VideoSniffer.extensionFromMime(mime) == "m3u8"
        return when (result.kind) {
            MediaProbe.Kind.HLS ->
                listOf(MediaProbe.Kind.HLS, MediaProbe.Kind.PROGRESSIVE)
            MediaProbe.Kind.DASH ->
                listOf(MediaProbe.Kind.DASH, MediaProbe.Kind.PROGRESSIVE)
            MediaProbe.Kind.PROGRESSIVE ->
                listOf(MediaProbe.Kind.PROGRESSIVE, MediaProbe.Kind.HLS)
            MediaProbe.Kind.UNKNOWN -> if (hlsHint) {
                listOf(MediaProbe.Kind.HLS, MediaProbe.Kind.PROGRESSIVE)
            } else {
                listOf(MediaProbe.Kind.PROGRESSIVE, MediaProbe.Kind.HLS)
            }
            MediaProbe.Kind.HTML -> emptyList()
        }
    }

    /** 按 [attemptIndex] 那一档建/换播放器。 */
    private fun playAttempt() {
        val kind = attemptKinds.getOrNull(attemptIndex) ?: return
        releasePlayer()
        ui.failed = null
        ui.buffering = true
        ui.ended = false
        ui.positionMs = 0L
        ui.durationMs = 0L
        ui.bufferedMs = 0L

        val http = DefaultHttpDataSource.Factory()
            .setDefaultRequestProperties(streamHeaders)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(15_000)
        // **按协议分派的数据源**，不是裸的 HTTP 那一层（用户点名："无法处理加密的 m3u8 流"）。
        //
        // 加密 HLS 要在播分片之前先取 `#EXT-X-KEY` 里那个 URI 的**密钥**，而那个 URI 不一定
        // 是 http(s)：站上常见 `data:text/plain;base64,…`（把密钥直接写在清单里）、也有写成
        // `file:` / `content:` 的。裸的 `DefaultHttpDataSource` 碰到这些会直接抛
        // `Malformed URL`，整路播放当场失败 —— 表现正是"碰到加密的就播不了"。
        // `DefaultDataSource` 会按 scheme 分派（data / file / content / asset / http…），
        // http(s) 那一支仍走上面这个**带着 Referer / UA / Cookie** 的工厂（防盗链必需）。
        val dataSource = DefaultDataSource.Factory(activity, http)
        // HLS **显式建源**，只为把"清单先合规化"那一层挂上去（见 FixedHlsPlaylistParserFactory）：
        // 加密流的 `#EXT-X-KEY` 写法稍不合规，media3 会把整条 KEY 静默忽略，最后摔出来的是
        // "容器不支持" —— 用户看到的就是"碰到加密的就播不了"（用户点名）。其余（含 DASH）
        // 仍旧交给默认工厂，行为一个字没变。
        val hlsFactory = HlsMediaSource.Factory(DefaultHlsDataSourceFactory(dataSource))
            .setPlaylistParserFactory(FixedHlsPlaylistParserFactory())
            // 允许"不需要先下一块分片就能准备"：TS 型 HLS 因此起播更快。
            // **加密清单会被 media3 自己忽略这一项**（它内部有判断），所以打开它是安全的 ——
            // 这也是市面上播放器普遍打开的默认档
            .setAllowChunklessPreparation(true)
        val msFactory = DefaultMediaSourceFactory(dataSource)
        val exo = ExoPlayer.Builder(activity)
            .setMediaSourceFactory(msFactory)
            .build()
        ui.player = exo
        exo.addListener(listener)
        videoView.player = exo
        // 新播放器就位：进度表**立刻**从这一拍起算（这一句是提前生效，不是唯一保障 ——
        // 表自己也会等播放器，见 [poll]）
        startPoll()
        // 画面尺寸由 [fitRect] 按视频自己的宽高比算（见 videoView 的构造），这里不设 resizeMode。
        // 换一路流 = 重新听用户的转屏选择：上一条片子的内容方向不该管这一条
        userPickedOrientation = false
        // **把容器明确告诉 ExoPlayer**：清单走各自的数据源（不再进"提取器逐个试"那条路），
        // 普通文件走渐进式 + 提取器嗅探 —— 用户看到的那串提取器报错，根子就是
        // 一条 m3u8 被当成了普通文件
        val item = when (kind) {
            MediaProbe.Kind.HLS -> MediaItem.Builder()
                .setUri(streamUrl)
                .setMimeType(MimeTypes.APPLICATION_M3U8)
                .build()
            MediaProbe.Kind.DASH -> MediaItem.Builder()
                .setUri(streamUrl)
                .setMimeType(MimeTypes.APPLICATION_MPD)
                .build()
            else -> MediaItem.fromUri(streamUrl)
        }
        exo.setMediaSource(
            if (kind == MediaProbe.Kind.HLS) {
                hlsFactory.createMediaSource(item)
            } else {
                msFactory.createMediaSource(item)
            }
        )
        exo.prepare()
        exo.playWhenReady = !startPausedForAttempt
        applyLayout()
    }

    /** 放掉当前的 ExoPlayer（换数据源重试、关闭播放器都走它）。 */
    private fun releasePlayer() {
        val exo = ui.player
        ui.player = null
        videoView.player = null
        if (exo != null) {
            exo.removeListener(listener)
            runCatching { exo.release() }
        }
    }

    // ─── 两张弹窗：开 / 关（弹窗本体在 [sheetView] 那一层） ───

    /** 开设置弹窗（右上角齿轮）。 */
    private fun openSettings() {
        ui.settingsOpen = true
        ui.downloadOpen = false
        // 弹窗起来时把**控制按钮整层收起**（用户点名："全屏状态下打开弹窗，控制按钮都应该
        // 自动关闭"）：弹窗自己带遮罩，底下那排按钮/进度/信息栏留着只会透出来抢注意力。
        // 收起就是 `controlsVisible = false` —— 关掉弹窗时那一拍自然再按用户手势唤起
        ui.controlsVisible = false
        syncSheetInset()
        applyLayout()
    }

    private fun closeSettings() {
        ui.settingsOpen = false
        syncSheetInset()
        applyLayout()
    }

    /** 开下载弹窗（右上角下载，只有认得出可下载源的这一路才有这枚入口）。 */
    private fun openDownload() {
        ui.downloadOpen = true
        ui.settingsOpen = false
        // 同 openSettings：弹窗一开，控制按钮整层收起
        ui.controlsVisible = false
        syncSheetInset()
        applyLayout()
    }

    private fun closeDownload() {
        ui.downloadOpen = false
        syncSheetInset()
        applyLayout()
    }

    /**
     * 探一次这一路**大概多大、产物是什么容器**，探完填进 [ui]：HLS 走清单估算
     * （见 [HlsProbe]），普通单文件直接问 `Content-Length`（见 [MediaProbe.length]）。
     *
     * 在后台线程发，回来在主线程就地更新；令牌保证"换了一路流之后，上一路的探测结果
     * 不会盖到这一路上"。探测失败只是"大小未知"，不影响下载本身。
     *
     * 文件名的默认值先按源给（见 [autoDownloadName]），探测出真实容器后再换掉 ——
     * 换之前先确认**用户没改过**这个名字（改过就以用户为准）。
     */
    private fun startSizeProbe() {
        val source = ui.downloadSource
        if (source == DownloadSource.None) return
        val auto = autoDownloadName(ui.title, source)
        ui.downloadAutoName = auto
        ui.downloadName = auto
        ui.downloadSize = 0L
        ui.downloadProbing = true
        val token = ++downloadProbeToken
        val url = streamUrl
        val headers = streamHeaders
        Thread {
            val info = if (source == DownloadSource.Hls) {
                HlsProbe.probe(url, headers)
            } else {
                HlsProbe.Info(MediaProbe.length(url, headers), fileExtension())
            }
            main.post {
                if (token != downloadProbeToken || !ui.open) return@post
                ui.downloadProbing = false
                ui.downloadSize = info.bytes
                if (info.extension.isEmpty()) return@post
                if (ui.downloadName != ui.downloadAutoName) return@post
                val renamed = withExtension(ui.downloadName, info.extension)
                ui.downloadName = renamed
                ui.downloadAutoName = renamed
            }
        }.apply { isDaemon = true }.start()
    }

    /**
     * 下载弹窗里文件名的默认值：**视频名 + 这一路的扩展名**。
     *
     * 扩展名按源给：HLS 的产物是一个整文件，先按最常见的 fMP4 给 `.mp4`（探测到真实
     * 容器后会被 [withExtension] 换掉）；普通单文件就跟着它自己的容器走（见
     * [fileExtension]）—— 下下来的还是这个文件，别改它的后缀。
     *
     * 标题里那串东西不能直接当文件名：`/ : * ? " < > |` 会被当成路径分隔符（轻则建错
     * 目录、重则抛异常），长度也封一下；标题尾部若已经带着这一路的后缀（`片子.mp4` /
     * `片子.m3u8`）先摘掉再补，免得叠成 `.mp4.mp4`。标题不可用时退回地址末段（把清单
     * 自己的 `.m3u8` 去掉 —— 那是清单不是产物）。
     */
    private fun autoDownloadName(title: String, source: DownloadSource): String {
        val ext = if (source == DownloadSource.Hls) "mp4" else fileExtension().ifEmpty { "mp4" }
        var base = sanitizeName(title)
        val suffixes = if (source == DownloadSource.Hls) {
            listOf(".mp4", ".m3u8", ".m3u")
        } else {
            listOf(".$ext")
        }
        suffixes.forEach { base = base.stripSuffixIgnoreCase(it) }
        if (base.isNotEmpty()) return "$base.$ext"
        val stem = sanitizeName(VideoSniffer.fileNameFromUrl(streamUrl))
            .stripSuffixIgnoreCase(".m3u8").stripSuffixIgnoreCase(".m3u")
            .ifEmpty { "video" }
        return if (stem.endsWith(".$ext", ignoreCase = true)) stem else "$stem.$ext"
    }

    /** 文件名里不能要的字符（路径分隔符等）与长度（标题可能很长）。 */
    private fun sanitizeName(raw: String): String = raw
        .replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
        .take(80)

    /** 忽略大小写地摘掉尾部（默认名要补扩展名，原名里若已有同后缀就不能重复）。 */
    private fun String.stripSuffixIgnoreCase(suffix: String): String =
        if (endsWith(suffix, ignoreCase = true)) dropLast(suffix.length) else this

    /** 这一路普通单文件的容器扩展名：地址后缀优先，其次是 MIME（都可能给不出来）。 */
    private fun fileExtension(): String = VideoSniffer.extensionOf(streamUrl)
        .ifEmpty { VideoSniffer.extensionFromMime(streamMime).orEmpty() }

    /**
     * 把默认名末尾的扩展名换成探测到的容器。只认 HLS 产物那三种（`.mp4` / `.ts` / `.m4a`）——
     * 普通单文件的名字本来就跟着它自己的容器走，不在这里动（别去动片名里的点）。
     */
    private fun withExtension(name: String, extension: String): String {
        val known = listOf(".mp4", ".ts", ".m4a")
        val hit = known.firstOrNull { name.endsWith(it, ignoreCase = true) } ?: return name
        return name.dropLast(hit.length) + "." + extension
    }

    /**
     * 页面位置更新：`frame` = 播放器该摆的那一块（屏幕 dp、带小数，**吸附已经在页面里算好**，
     * null = 量不到）；`visible` = 宿主标签页是否在台前；`morph` / `target` = 网格形变那一帧的
     * 落点与可见窗口（窗口 px，null = 没在形变）；`alpha` = 整页此刻的不透明度；
     * `gridProgress` = 网格展开进度（控件层据此让位）。
     */
    fun update(
        frame: RectF?,
        visible: Boolean,
        morph: Rect?,
        target: Rect?,
        alpha: Float,
        gridProgress: Float
    ) {
        this.frame = frame
        this.morphRect = morph
        this.morphClip = target
        this.gridAlpha = alpha
        this.gridProgress = gridProgress
        // 网格收起就把形变底子清掉：下一轮展开不该照搬上一次的落点
        if (gridProgress <= 0f) {
            lastMorph = null
            lastMorphClip = null
        }
        ui.visible = visible
        ui.following = frame != null
        // 网格开着的时候控件不参与（不画、也不吃触摸：那会儿屏幕上是网格的）
        ui.gridOpen = gridProgress > 0.02f
        applyLayout()
    }

    /** 退出播放器：还原方向与系统栏、放掉播放器，并通知界面收摊。 */
    fun close(notify: Boolean = true) {
        if (!ui.open) return
        ui.open = false
        // 在飞的"探测完就开播"作废（否则关了播放器它还会再建一个出来）
        playToken++
        attemptKinds = emptyList()
        attemptIndex = 0
        stopPoll()
        backCallback.isEnabled = false
        releasePlayer()
        restoreWindow()
        host.visibility = View.GONE
        // 收摊时把"等弹窗收尾动画"那一拍一并取消：这一层要立刻没了
        main.removeCallbacks(hideSheetLayer)
        sheetHiding = false
        sheetView.visibility = View.GONE
        frame = null
        // 位置底子也要清：下一路流、下一个标签页都不该照搬上一块
        lastBox = null
        morphRect = null
        morphClip = null
        lastMorph = null
        lastMorphClip = null
        gridAlpha = 1f
        // 这一路的东西一并丢掉：在飞的探测作废、下载弹窗里的名字与大小也不留给下一路
        downloadProbeToken++
        streamUrl = ""
        streamHeaders = emptyMap()
        streamMime = ""
        gridProgress = 0f
        // 让位状态一并归零：下一路流不该继承"边上空着一条"的画面
        sheetInsetAnim?.cancel()
        sheetInsetAnim = null
        sheetInsetFrac = 0f
        sheetPanelW = 0
        sheetPanelH = 0
        ui.reset()
        if (notify) onClosed()
    }

    /** 界面整体退场时调用（Activity 销毁）：把覆盖层从窗口上摘掉。 */
    fun release() {
        sheetInsetAnim?.cancel()
        sheetInsetAnim = null
        close(notify = false)
        (host.parent as? ViewGroup)?.removeView(host)
        backCallback.remove()
    }

    /**
     * 全屏态下切换横竖屏（右下角那枚，用户点名）：**只转屏，不退出全屏**。
     *
     * 进全屏时统一给的是 `SENSOR_LANDSCAPE`；这里就在"横"与"竖"之间来回拨 ——
     * 竖屏用 `SCREEN_ORIENTATION_PORTRAIT`（不看传感器：切过来就是要它竖着）。
     * MainActivity 的 `configChanges` 含 `orientation|screenSize`，转屏不会重建 Activity。
     *
     * **档位自己记**（[PlayerUi.fullscreenPortrait]），不去读系统当前配置：请求发出到真正
     * 转过来之间隔着系统那一拍，读配置时按下的那一下读到的往往还是**旧方向**，于是又请求
     * 回原来的方向 —— 表现就是"点了它没反应"（用户点名）。自己记一份，按一次翻一档，
     * 连点也稳稳地在两档之间来回。
     */
    private fun toggleFullscreenOrientation() {
        if (!ui.fullscreen) return
        // 用户自己拨了这一下：之后方向就听他的，内容方向不再自动插手（见 followContentOrientation）
        userPickedOrientation = true
        val toPortrait = !ui.fullscreenPortrait
        ui.fullscreenPortrait = toPortrait
        runCatching {
            activity.requestedOrientation = if (toPortrait) {
                ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            } else {
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            }
        }
        applyLayout()
    }

    private fun setFullscreen(on: Boolean) {
        if (ui.fullscreen == on) return
        ui.fullscreen = on
        // 锁屏**只属于全屏**：退出全屏时一并解锁，不然窗口态会停在一个"什么都没有、
        // 只剩一枚解锁按钮"的小窗里（那一档本来也没有锁屏按钮）
        if (!on) ui.locked = false
        // 进全屏统一是横屏（SENSOR_LANDSCAPE）：档位跟着复位，别把上一次竖屏的档带进来
        if (on) ui.fullscreenPortrait = false
        val controller = activity.window.let { WindowCompat.getInsetsController(it, decor) }
        // 播放器整屏都是深色底，状态栏图标得是亮色（浅色主题下默认是黑的，看不见）
        controller?.isAppearanceLightStatusBars = false
        runCatching {
            activity.requestedOrientation = if (on) {
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            } else {
                ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            }
        }
        if (on) {
            controller?.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller?.hide(WindowInsetsCompat.Type.systemBars())
            // 宽高比已经知道的话，进全屏就直接按内容定方向（竖屏片子转竖屏）——
            // 等 `onVideoSizeChanged` 再来一次也行，但那要等下一路回调，进全屏会先横一下
            followContentOrientation()
        } else {
            controller?.show(WindowInsetsCompat.Type.systemBars())
        }
        // 转屏 / 进出全屏都会改变"该不该让位"（让位只在全屏 + 横屏那档），跟着重算一次
        syncSheetInset()
        applyLayout()
    }

    /** 把方向、系统栏明暗都还回进播放器之前的样子。 */
    private fun restoreWindow() {
        runCatching { activity.requestedOrientation = restoreOrientation }
        runCatching {
            val controller = WindowCompat.getInsetsController(activity.window, decor)
            controller?.show(WindowInsetsCompat.Type.systemBars())
            restoreLightStatusBar?.let { controller?.isAppearanceLightStatusBars = it }
        }
    }

    private fun startPoll() {
        main.removeCallbacks(poll)
        main.post(poll)
    }

    private fun stopPoll() {
        main.removeCallbacks(poll)
    }

    /**
     * 摆位置。
     *
     * - **全屏**：两块子 View 铺满整屏（底下铺黑，适应模式的黑边有着落）；
     * - **窗口态**：摆在页面报回来的矩形上（`frame`）—— 页面里那块 `<video>` 在哪儿
     *   它就在哪儿，跟着网页滚、跟着网页变；
     * - **网格形变**：落点与可见窗口由 Compose 那边按网页形变的映射算好（[morphRect]
     *   / [morphClip]），透明度也跟网页同一个值（[gridAlpha]）—— 读起来就是"网页自己
     *   缩进了卡片"，而不是"播放器赖在网格上"或者"播放器先没了、露出网页的播放器"；
     * - 页面还没报位置（极少：整页都量不到）才退回"顶部一块 16:9"兜底 —— 什么都不画
     *   会让用户以为根本没播起来。注意兜底只在**等满 [BrowserController] 那个很长的
     *   时限之后**才会出现，正常路径上永远看不到它（它可是一块整宽贴顶的东西，
     *   会压住网页自己的顶部栏与滚动条）。
     * - 页面切走了（`visible` 为假）就整层隐藏 —— 声音继续，跟浏览器把播放页切后台一样。
     */
    private fun applyLayout() {
        val shown = ui.open && (ui.visible || ui.fullscreen)
        host.visibility = if (shown) View.VISIBLE else View.GONE
        // 弹窗层整窗口铺满（见 [sheetView]）。三种情形分开处理，别拿一个布尔硬套：
        // - 有弹窗开着：立刻可见；
        // - 播放器还在、只是弹窗在收起：整层**多留一拍照样可见**，让 Compose 把退场动画
        //   跑完（用户点名"不要直接跳"）—— 立刻摘掉的话动画只跑了一帧；
        // - 播放器整个关了：没有动画可言，当场摘掉。
        when {
            shown && (ui.settingsOpen || ui.downloadOpen) -> {
                main.removeCallbacks(hideSheetLayer)
                sheetHiding = false
                sheetView.visibility = View.VISIBLE
            }
            shown -> {
                if (!sheetHiding && sheetView.visibility == View.VISIBLE) {
                    sheetHiding = true
                    main.postDelayed(hideSheetLayer, SHEET_ANIM_MS.toLong())
                }
            }
            else -> {
                main.removeCallbacks(hideSheetLayer)
                sheetHiding = false
                sheetView.visibility = View.GONE
            }
        }
        if (!shown) return

        if (ui.fullscreen) {
            host.setBackgroundColor(android.graphics.Color.BLACK)
            host.isClickable = true
            layout(clip, 0f, 0f, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            // 全屏：**整屏是播放区**，画面按视频自己的比例摆在它中间（见 [fitRect]）——
            // 不再是"把视频拉满整屏"。横屏片子摊在那块更长的屏上时两侧留黑，
            // 这正是各家播放器的全屏形态；要一点边都不留就在设置里切「裁剪」
            val screen = RectF(
                0f, 0f,
                decor.width.takeIf { it > 0 }?.toFloat()
                    ?: activity.resources.displayMetrics.widthPixels.toFloat(),
                decor.height.takeIf { it > 0 }?.toFloat()
                    ?: activity.resources.displayMetrics.heightPixels.toFloat()
            )
            // 弹窗开着就把播放区**让出去**：全屏横屏让**右**边（宽度固定，见
            // [SIDE_SHEET_WIDTH]），全屏竖屏让**底**边（高度 = 面板实测值，见
            // [sheetPanelH]）。让位与面板滑入**同一条时间线**（[sheetInsetFrac]），画面
            // 在剩下那块里重摆 —— 既不会被面板压住，也仍然完整（[fitRect] 让位期间按「适应」）。
            val insetDp = SIDE_SHEET_WIDTH.value * activity.resources.displayMetrics.density
            if (sheetInsetFrac > 0f) {
                if (insetOnBottom()) {
                    // 贴底那档：让出面板实测高度；没量到（刚开那一帧）就先不动，别跳一下
                    val h = sheetPanelH * sheetInsetFrac
                    if (h > 0f) {
                        screen.bottom = (screen.bottom - h).coerceAtLeast(screen.height() * 0.35f)
                    }
                } else {
                    // 贴右那档：让出固定宽度，但不能吃掉整屏（留至少一半给画面）
                    val w = insetDp * sheetInsetFrac
                    screen.right = (screen.right - w).coerceAtLeast(screen.width() * 0.5f)
                }
            }
            val video = fitRect(screen)
            layout(
                videoView,
                video.left, video.top,
                video.width().roundToInt(), video.height().roundToInt()
            )
            // 控件铺满整屏（全屏下的进度条就该在屏幕底，而不是跟着画面那条带子走）
            layout(controlsView, 0f, 0f, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            clip.clipBounds = null
            // 透明度一并归位：网格那一支在"没有形变数据"时会把 clip 压到 0
            //（见窗口态那一段），进全屏前一帧正卡在那里的话画面就永远不出来
            clip.alpha = 1f
            plain(clip)
            plain(videoView)
            plain(controlsView)
            return
        }

        // 窗口态：覆盖层本身完全透明、也不吃触摸，视频区以外的触摸原样漏给网页
        host.background = null
        host.isClickable = false
        val raw = frame?.let { toPx(it) }
        // 形变数据缺一帧就用**上一份**顶住（见 [lastMorph]）：直接用 null 会在
        // "形变后的位置"与"窗口态的位置"之间来回跳，那就是闪烁
        if (morphRect != null && morphClip != null) {
            lastMorph = morphRect
            lastMorphClip = morphClip
        }
        val morph = morphRect ?: lastMorph
        val target = morphClip ?: lastMorphClip
        // 这一帧拿不到新位置时，**先用上一块真的量到过的**（见 [lastBox]）：
        // 拿 16:9 兜底块去顶替"上次量到的位置"，位置和尺寸都会突变一下
        //（用户点名的"位置一直在跳"里有一份就是它）。兜底块只在**从来没量到过**
        // 时才用得上。
        val seed = lastBox ?: fallbackRect().let {
            android.graphics.RectF(
                it.left.toFloat(), it.top.toFloat(),
                it.right.toFloat(), it.bottom.toFloat()
            )
        }
        val haveBox = raw != null || lastBox != null
        // 网格正在展开、而手上一块位置都没有：**整层藏起来** —— 这种时候按兜底块
        // 原尺寸摆在那儿，正是"播放器悬浮在标签上方"的样子（用户点名）
        if (gridRunning && !haveBox) {
            host.visibility = View.GONE
            return
        }
        // 网格铺开后**不再切 visibility**：整层透明度已经跟着 [gridAlpha] 淡到 0
        //（见下面的 clip.alpha），再切一次 GONE/VISIBLE 只会在"进度正好卡在边界"
        // 时来回抖 —— 用户点名"拖动的时候会不断闪烁"，一半就是它。alpha=0 的层不画，
        // 代价只是留在视图树里，换来的是绝不闪。
        // 形变那一帧却一次数据都没拿到（连上一份都没有）：这一帧什么都不画。
        // **用 alpha 而不是 visibility**：切 visibility 会走一次布局，而且"一帧有、
        // 一帧没有"本身就读成闪烁（用户点名）；alpha=0 只是这一帧不画，下一帧有数据
        // 就接着画，中间不会有任何跳变
        if (gridRunning && (morph == null || target == null)) {
            clip.alpha = 0f
            controlsView.alpha = 0f
            return
        }
        // 播放器此刻该在哪：**页面报回来的就是最终位置**（"越过顶栏就钉在它下面"这条
        // 吸附规则已经在页面里算完了，见 PageVideoDetector.playerTop），这里只照着摆 ——
        // 滚动时只动 x/y，不重排。
        val box = android.graphics.RectF(
            raw?.left ?: seed.left,
            raw?.top ?: seed.top,
            (raw?.left ?: seed.left) + (raw?.width() ?: seed.width()),
            (raw?.top ?: seed.top) + (raw?.height() ?: seed.height())
        )
        lastBox = android.graphics.RectF(box)
        clip.alpha = gridAlpha.coerceIn(0f, 1f)
        clip.clipBounds = null
        val bw = box.width().roundToInt()
        val bh = box.height().roundToInt()
        // 画面在**这块矩形里**该占哪儿（见 [fitRect]）：窗口态下它就是页面里那个
        // `<video>` 自己的画幅（网页默认 `object-fit: contain`），所以窗口态的画面
        // 与网页里那块严丝合缝
        val video = fitRect(box)
        if (haveBox && morph != null && target != null) {
            // 网格形变：裁剪窗口 = 页面此刻的可见窗口；画面按同一套映射摆进去。
            // **不看这一帧有没有新位置**（用户点名的那条"悬浮在标签上方再消失"就是
            // 这么来的）：位置缺失时用 [lastBox] 那块当起点，形变照样跟网页一起走
            layout(clip, target.left.toFloat(), target.top.toFloat(), target.width(), target.height())
            placeMorphed(videoView, video, box, morph, target)
            // 控件层摆在"视频本来的那块"上：形变期间它整层是隐的（见下面的 alpha），
            // 而形变收尾那一两帧它已经重新显形 —— 那时视频正好也回到这块上，接得上
            layout(controlsView, box.left, box.top, bw, bh)
        } else {
            // 播放器整块就是裁剪窗口，画面按算好的画幅摆进去（不做任何裁剪）：
            // 位置已经由页面算成"吸附之后"的那一条，顶上不可能再留缝
            layout(clip, box.left, box.top, bw, bh)
            placePlain(
                videoView,
                video.width().roundToInt(), video.height().roundToInt(),
                video.left - box.left, video.top - box.top
            )
            layout(controlsView, box.left, box.top, bw, bh)
        }
        plain(controlsView)
        controlsView.alpha = if (gridRunning) 0f else 1f
    }

    /** 页面报回来的那块（dp → px，**保留小数**）；没报到就是 null。 */
    private fun toPx(f: RectF): RectF = RectF(
        f.left * density,
        f.top * density,
        f.right * density,
        f.bottom * density
    )

    /** 兜底形态：顶部一块 16:9、避开状态栏（只在页面一个位置都报不上来时才用）。 */
    private fun fallbackRect(): Rect {
        val top = ViewCompat.getRootWindowInsets(decor)
            ?.getInsets(WindowInsetsCompat.Type.statusBars())?.top ?: 0
        val w = activity.resources.displayMetrics.widthPixels
        val h = (w * 9f / 16f).roundToInt()
        return Rect(0, top, w, top + h)
    }

    /** 摆到某个矩形（尺寸走布局参数、位置走 x/y，滚动时只动 x/y 不重排）。 */
    private fun layout(v: View, x: Float, y: Float, w: Int, h: Int) {
        val lp = v.layoutParams
        if (lp == null || lp.width != w || lp.height != h) {
            v.layoutParams = FrameLayout.LayoutParams(w, h)
        }
        // 位置**保留小数**：取整会在滚动时留下 1dp 台阶（密度 3 就是 3 个设备像素）
        if (v.x != x) v.x = x
        if (v.y != y) v.y = y
    }

    /**
     * 按形变映射把画面摆进裁剪窗口里：**布局尺寸只设一次**（用没有形变时的那个画幅，
     * 避免每帧重排），位置与缩放走 `x/y/scaleX/scaleY` —— 每帧只改这几个属性。
     *
     * [base] = 画面自己的矩形、[box] = 页面报来的播放器整块（都是窗口 px）：整块按
     * 形变映射缩到 [morph]，画面是块里的一小块，所以它的落点要在**缩放之后**再加上
     * "画面相对整块的那点偏移"（[base] - [box]），缩放系数与整块共用。
     */
    private fun placeMorphed(v: View, base: RectF, box: RectF, morph: Rect, clip: Rect) {
        val bw = box.width()
        val bh = box.height()
        if (bw <= 0f || bh <= 0f) return
        val sx = morph.width() / bw
        val sy = morph.height() / bh
        val vw = base.width().roundToInt()
        val vh = base.height().roundToInt()
        val lp = v.layoutParams
        if (lp == null || lp.width != vw || lp.height != vh) {
            v.layoutParams = FrameLayout.LayoutParams(vw, vh)
        }
        v.pivotX = 0f
        v.pivotY = 0f
        v.scaleX = sx
        v.scaleY = sy
        v.x = (morph.left - clip.left) + (base.left - box.left) * sx
        v.y = (morph.top - clip.top) + (base.top - box.top) * sy
        v.alpha = 1f
    }

    /**
     * **画面该占多大、摆在哪**（窗口 px）：按 [PlayerUi.fit] 把"视频自己的宽高比"这块
     * 矩形放进 [area] 里。这是"内容显示对不对"的唯一一处真相 —— 成熟播放器都是这么做的：
     * **让画面跟着视频的形状走**，而不是把视频硬塞进一个固定形状的播放区。
     *
     * - [FitMode.Fit]（默认）：整幅可见 —— 视频比播放区"宽"就按宽顶满、上下留边，
     *   反之按高顶满、左右留边；
     * - [FitMode.Zoom]：铺满播放区、溢出的部分裁掉（返回的矩形会**大于** area，
     *   由裁剪窗口裁掉 —— 窗口态是页面那块矩形，全屏态是整屏）；
     * - [FitMode.Fill]：直接用 area（拉伸）。
     *
     * 宽高比还没报上来（[PlayerUi.videoAspect] <= 0，起播的头几帧）就返回 area 本身：
     * 那几帧先按播放区原样摆，`onVideoSizeChanged` 一到就重摆，用户看到的只是"画面
     * 一出现就是对的"。
     */
    private fun fitRect(area: RectF): RectF {
        val aspect = ui.videoAspect
        if (aspect <= 0f || area.width() <= 0f || area.height() <= 0f) return RectF(area)
        // 贴右弹窗开着的时候**一律按「适应」算**，哪怕设置里选的是「裁剪」——
        // 播放区已经被面板压掉一块，再裁就两头都不完整了（用户点名"确保它能完整显示"）。
        // 这里只影响弹窗打开期间；弹窗一关就回到用户自己选的那一档。
        val mode = if (sheetInsetFrac > 0f) FitMode.Fit else ui.fit
        if (mode == FitMode.Fill) return RectF(area)
        val cx = (area.left + area.right) / 2f
        val cy = (area.top + area.bottom) / 2f
        // 播放区比视频"更宽"吗？是 → 高度是限制条件，按高度算宽度
        val areaWider = area.width() / area.height() > aspect
        // 适应：留边（取小的那个方向）；裁剪：裁掉溢出（取大的那个方向）
        val byHeight = if (mode == FitMode.Fit) areaWider else !areaWider
        return if (byHeight) {
            val w = area.height() * aspect
            RectF(cx - w / 2f, area.top, cx + w / 2f, area.bottom)
        } else {
            val h = area.width() / aspect
            RectF(area.left, cy - h / 2f, area.right, cy + h / 2f)
        }
    }

    /**
     * 视频的**显示**宽高比（宽 ÷ 高）：旋转角与像素比都得算进去。
     *
     * 竖着拍的片子常带 `unappliedRotationDegrees = 90`（容器里存的是横的、靠元数据转回来）：
     * 不换宽高的话，画面会被摆成躺倒的那一块（用户点名的"显示不对"里就有这一份）。
     * `pixelWidthHeightRatio` 是变形像素（老 DVD 那一类）的修正，一并乘上。
     */
    private fun displayAspectOf(size: VideoSize): Float {
        val rotated = size.unappliedRotationDegrees % 180 != 0
        val w = if (rotated) size.height else size.width
        val h = if (rotated) size.width else size.height
        if (w <= 0 || h <= 0) return 0f
        val ratio = size.pixelWidthHeightRatio.takeIf { it > 0f } ?: 1f
        return w * ratio / h
    }

    /**
     * 全屏的**方向跟着内容走**（用户点名的那条"全屏后四周全是黑边"的根治）。
     *
     * 竖着拍的片子进全屏时，如果照旧摆成横屏，画面只能是中间一条竖带、左右各一大块黑 ——
     * 这正是"四周都是黑边"的来源。成熟播放器（B 站 / YouTube）的做法是：**竖屏内容
     * 进全屏就转竖屏**，把整块屏给画面。
     *
     * 两条闸：只在全屏里生效；用户**自己按过**右下角那枚转屏按钮之后就不再插手
     *（见 [userPickedOrientation]）—— 自动是为了"多数情况一次就对"，不是跟用户较劲。
     */
    private fun followContentOrientation() {
        if (!ui.fullscreen || userPickedOrientation) return
        val aspect = ui.videoAspect
        if (aspect <= 0f) return
        val wantPortrait = aspect < 1f
        if (wantPortrait == ui.fullscreenPortrait) return
        ui.fullscreenPortrait = wantPortrait
        runCatching {
            activity.requestedOrientation = if (wantPortrait) {
                ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            } else {
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            }
        }
    }

    /**
     * 把视频摆到某处（坐标相对裁剪窗口，**保留小数**）。
     *
     * 尺寸那一支要当心（2026-10-03，用户点名"原生播放器在滑动过程中会不断闪烁，
     * 停下就不闪烁"）：**每帧换 `layoutParams` 就是画面闪一下的来源** —— 这一块是
     * Media3 的 `PlayerView`（`TextureView`），尺寸一变它就走一次布局 + 一次表面尺寸
     * 变更；滚动时页面是**按帧**报位置的，若宽高也跟着抖（站点自己那条吸顶/迷你播放器
     * 的补间、`vh` 随地址栏伸缩、宽高比回调抖动……），这块画面就跟着一帧一闪。
     *
     * 所以这里分两档：
     * - 尺寸差得**明显**（≥ [SizeChurnPx]）：照旧换一份 `layoutParams`（表面按真实尺寸重建）；
     * - 只差**一点点**：**不重排**，用 `scaleX/scaleY` 把这个差值补上。
     *
     * 缩放出来的画面精度不会受影响：基准尺寸始终落在真实尺寸的 [SizeChurnPx] 之内，
     * 而且 `TextureView` 是当成一块纹理缩放的，不会重建表面。位置 x/y 一直只改
     * `x/y`（不触发重排），与形变那一支同一套思路。
     */
    private fun placePlain(v: View, w: Int, h: Int, x: Float, y: Float) {
        val lp = v.layoutParams
        val resized = lp == null || lp.width <= 0 || lp.height <= 0 ||
            abs(w - lp.width) >= SizeChurnPx || abs(h - lp.height) >= SizeChurnPx
        if (resized) {
            if (lp == null || lp.width != w || lp.height != h) {
                v.layoutParams = FrameLayout.LayoutParams(w, h)
            }
            plain(v)
        } else {
            // 基准尺寸（上一步真正设下去的那个）→ 这一帧要的尺寸，差值交给缩放
            v.pivotX = 0f
            v.pivotY = 0f
            val sx = w.toFloat() / lp.width
            val sy = h.toFloat() / lp.height
            if (v.scaleX != sx) v.scaleX = sx
            if (v.scaleY != sy) v.scaleY = sy
            if (v.alpha != 1f) v.alpha = 1f
        }
        if (v.x != x) v.x = x
        if (v.y != y) v.y = y
    }

    /** 归位：缩放 / 透明度 / 原点回到常态。 */
    private fun plain(v: View) {
        if (v.pivotX != 0f) v.pivotX = 0f
        if (v.pivotY != 0f) v.pivotY = 0f
        if (v.scaleX != 1f) v.scaleX = 1f
        if (v.scaleY != 1f) v.scaleY = 1f
        if (v.alpha != 1f) v.alpha = 1f
    }

    private companion object {
        /**
         * 视频这块**允许重排的最小尺寸变化**（px）：比它小的差值一律用缩放补掉。
         *
         * 6px 约等于 2dp（密度 3 的机器）—— 缩放倍率因此始终在 1 附近，看不出精度损失，
         * 而滚动时那种"每帧差一两个像素"的抖动就再也不碰 `layoutParams` 了。
         */
        const val SizeChurnPx = 6
    }
}
