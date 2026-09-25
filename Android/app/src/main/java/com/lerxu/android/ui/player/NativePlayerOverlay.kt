package com.lerxu.android.ui.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.graphics.Rect
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
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
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.lerxu.android.R
import kotlin.math.roundToInt

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
    private val onClosed: () -> Unit
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
        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
        setKeepContentOnPlayerReset(true)
    }

    private val controlsView = ComposeView(activity).apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        setContent {
            PlayerControls(
                ui = ui,
                onClose = { close() },
                onToggleFullscreen = { setFullscreen(!ui.fullscreen) },
                onToggleOrientation = { toggleFullscreenOrientation() },
                onFit = { videoView.resizeMode = it.mode },
                onKeepOn = { host.keepScreenOn = it }
            )
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

    /** 全屏时用返回键**退出全屏**（而不是让页面去后退）。 */
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            if (ui.fullscreen) setFullscreen(false) else close()
        }
    }

    /** 返回键接管：挂在 Activity 的调度器上，开播时启用、收摊时摘掉。 */
    private val backDispatcher = (activity as? ComponentActivity)?.onBackPressedDispatcher

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            ui.playing = isPlaying
        }

        override fun onPlaybackStateChanged(state: Int) {
            ui.buffering = state == Player.STATE_BUFFERING
            ui.ended = state == Player.STATE_ENDED
            if (state == Player.STATE_READY) ui.failed = null
        }

        override fun onPlayerError(error: PlaybackException) {
            ui.failed = error.cause?.message ?: error.message
            ui.buffering = false
        }
    }

    /** 播放中每 250ms 取一次进度与缓冲（ExoPlayer 没有现成的进度流）。 */
    private val poll = object : Runnable {
        override fun run() {
            val exo = ui.player ?: return
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
        decor.addView(
            host,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
    }

    /** 打开一路流。请求头按当前标签页的 Referer / UA / Cookie 拼（影视站的流几乎都校验防盗链）。 */
    fun open(url: String, title: String, headers: Map<String, String>) {
        if (ui.open) close(notify = false)
        ui.reset()
        ui.open = true
        ui.title = title

        val http = DefaultHttpDataSource.Factory()
            .setDefaultRequestProperties(headers)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(15_000)
        val exo = ExoPlayer.Builder(activity)
            .setMediaSourceFactory(DefaultMediaSourceFactory(http))
            .build()
        ui.player = exo
        exo.addListener(listener)
        videoView.player = exo
        videoView.resizeMode = ui.fit.mode
        exo.setMediaItem(MediaItem.fromUri(url))
        exo.prepare()
        exo.playWhenReady = true

        restoreOrientation = activity.requestedOrientation
        restoreLightStatusBar =
            WindowCompat.getInsetsController(activity.window, decor)?.isAppearanceLightStatusBars
        (activity as? LifecycleOwner)?.let { backDispatcher?.addCallback(it, backCallback) }
        backCallback.isEnabled = true
        host.keepScreenOn = ui.keepOn
        startPoll()
        applyLayout()
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
        stopPoll()
        backCallback.isEnabled = false
        val exo = ui.player
        ui.player = null
        videoView.player = null
        if (exo != null) {
            exo.removeListener(listener)
            runCatching { exo.release() }
        }
        restoreWindow()
        host.visibility = View.GONE
        frame = null
        // 位置底子也要清：下一路流、下一个标签页都不该照搬上一块
        lastBox = null
        morphRect = null
        morphClip = null
        lastMorph = null
        lastMorphClip = null
        gridAlpha = 1f
        gridProgress = 0f
        ui.reset()
        if (notify) onClosed()
    }

    /** 界面整体退场时调用（Activity 销毁）：把覆盖层从窗口上摘掉。 */
    fun release() {
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
        } else {
            controller?.show(WindowInsetsCompat.Type.systemBars())
        }
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
        if (!shown) return

        if (ui.fullscreen) {
            host.setBackgroundColor(android.graphics.Color.BLACK)
            host.isClickable = true
            layout(clip, 0f, 0f, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            layout(videoView, 0f, 0f, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            layout(controlsView, 0f, 0f, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            clip.clipBounds = null
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
        if (haveBox && morph != null && target != null) {
            // 网格形变：裁剪窗口 = 页面此刻的可见窗口；视频按同一套映射摆进去。
            // **不看这一帧有没有新位置**（用户点名的那条"悬浮在标签上方再消失"就是
            // 这么来的）：位置缺失时用 [lastBox] 那块当起点，形变照样跟网页一起走
            layout(clip, target.left.toFloat(), target.top.toFloat(), target.width(), target.height())
            placeMorphed(videoView, box, morph, target)
            // 控件层摆在"视频本来的那块"上：形变期间它整层是隐的（见下面的 alpha），
            // 而形变收尾那一两帧它已经重新显形 —— 那时视频正好也回到这块上，接得上
            layout(controlsView, box.left, box.top, bw, bh)
        } else {
            // 播放器整块就是裁剪窗口，视频按**原始尺寸**摆进去（不做任何裁剪）：
            // 位置已经由页面算成"吸附之后"的那一条，顶上不可能再留缝
            layout(clip, box.left, box.top, bw, bh)
            placePlain(videoView, bw, bh, 0f, 0f)
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
     * 按形变映射把视频摆进裁剪窗口里：**布局尺寸只设一次**（用没有形变时的那个矩形，
     * 避免每帧重排），位置与缩放走 `x/y/scaleX/scaleY` —— 每帧只改这几个属性。
     */
    private fun placeMorphed(v: View, base: RectF, target: Rect, clip: Rect) {
        val bw = base.width().roundToInt()
        val bh = base.height().roundToInt()
        val lp = v.layoutParams
        if (lp == null || lp.width != bw || lp.height != bh) {
            v.layoutParams = FrameLayout.LayoutParams(bw, bh)
        }
        v.pivotX = 0f
        v.pivotY = 0f
        v.scaleX = if (bw > 0) target.width().toFloat() / bw else 1f
        v.scaleY = if (bh > 0) target.height().toFloat() / bh else 1f
        v.x = (target.left - clip.left).toFloat()
        v.y = (target.top - clip.top).toFloat()
        v.alpha = 1f
    }

    /** 把视频按**原始尺寸**摆到某处（坐标相对裁剪窗口，**保留小数**）。 */
    private fun placePlain(v: View, w: Int, h: Int, x: Float, y: Float) {
        val lp = v.layoutParams
        if (lp == null || lp.width != w || lp.height != h) {
            v.layoutParams = FrameLayout.LayoutParams(w, h)
        }
        plain(v)
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
}
