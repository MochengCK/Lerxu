package com.lerxu.android.ui.player

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout

/** 画面比例：适应（留黑边）/ 铺满（拉伸）/ 裁剪（填满并裁掉溢出）。 */
@UnstableApi
enum class FitMode(val label: String, val mode: Int) {
    Fit("适应", AspectRatioFrameLayout.RESIZE_MODE_FIT),
    Fill("铺满", AspectRatioFrameLayout.RESIZE_MODE_FILL),
    Zoom("裁剪", AspectRatioFrameLayout.RESIZE_MODE_ZOOM)
}

/**
 * 播放器这一版的构建标记：**在播放设置弹窗里显示**。
 *
 * 为什么要它：调试期间一天出好几版 APK，而 versionName 全一样（取自 package.json），
 * 用户没法说清"我装的是哪一版"、我也没法确认他测的是哪一版 —— 白跑过好几轮。
 */
const val PLAYER_BUILD = "播放器 0922-21"

/**
 * 原生播放器的界面状态：**覆盖层（[NativePlayerOverlay]）与控件（[PlayerControls]）
 * 之间唯一的那份真相**。
 *
 * 为什么要有这个类：播放器现在不在 Compose 里 —— 它是一块加在 `decorView` 上的原生
 * 覆盖层（理由是"跟网页自带的播放器一样"这件事只有原生的 View 层做得干净，见
 * NativePlayerOverlay 的说明）。于是播放器的状态得有个中立的地方放：覆盖层往里写
 * （播放器回调、进度轮询），Compose 控件从里读。全部是 Compose 状态，写一处、读一处，
 * 不存在两份状态打架。
 */
@UnstableApi
class PlayerUi {

    /** 播放器开着（覆盖层在场）。 */
    var open by mutableStateOf(false)

    /** 宿主标签页在台前：不在台前就什么都不画（声音继续）。 */
    var visible by mutableStateOf(false)

    /**
     * 位置**跟上了网页**（拿到了页面里那个 `<video>` 的矩形）。
     *
     * 假 = 页面报不上位置（跨域 iframe 里的播放器、注入脚本没跑起来……），此时用
     * "顶部一块 16:9"兜底。界面据此亮一行小字，省得"明明没跟上"却没人知道。
     */
    var following by mutableStateOf(false)

    /** 全屏态（铺满整屏 + 横屏 + 藏系统栏），由画面里那枚按钮切换。 */
    var fullscreen by mutableStateOf(false)

    /**
     * 全屏里"目标是竖屏"（右下角那枚转屏按钮当前在哪一档）。
     *
     * 为什么要自己记一份：转屏请求发出到真正转过来之间隔着系统那一拍，去读系统当前的
     * 方向，按下的那一下往往读到的还是**旧值**（于是又请求回原来的方向）—— 表现就是
     * "点了它没反应"。由覆盖层写、控件层读，图标的形态就永远与"下一次按下会发生什么"一致。
     */
    var fullscreenPortrait by mutableStateOf(false)

    var title by mutableStateOf("")

    var playing by mutableStateOf(false)
    var buffering by mutableStateOf(true)
    var ended by mutableStateOf(false)
    var failed by mutableStateOf<String?>(null)
    var positionMs by mutableLongStateOf(0L)
    var durationMs by mutableLongStateOf(0L)
    var bufferedMs by mutableLongStateOf(0L)
    var controlsVisible by mutableStateOf(true)

    /** 基准倍速：长按加速结束后回到它（不是死记 1.0）。 */
    var baseSpeed by mutableFloatStateOf(1f)
    var fit by mutableStateOf(FitMode.Fit)
    var loop by mutableStateOf(false)
    var keepOn by mutableStateOf(true)

    var settingsOpen by mutableStateOf(false)
    var scrubbing by mutableStateOf(false)

    /**
     * 标签网格正展开（播放器在往里缩）：控件层不参与 —— 不画、也不吃触摸
     *（那会儿屏幕上是网格的，播放器只是"缩进去的那一块"）。
     */
    var gridOpen by mutableStateOf(false)

    /** 长按加速中（按住不放）：界面据此显示"2× 快进中"那枚徽标。 */
    var boost by mutableStateOf(false)

    /** 双击左右半屏的方向（-1 左 / +1 右 / 0 无），配合 [seekFlashToken] 重新播放动画。 */
    var seekFlashDir by mutableStateOf(0)

    /** 每双击一次 +1：同一个方向连点两次也要重新播一遍动画。 */
    var seekFlashToken by mutableStateOf(0)

    /**
     * 播放器本体。控件直接操作它（播放/暂停、跳转、倍速）—— 它已经不是 Compose 里的
     * 一个 `remember` 了，所以只能从这份状态里拿。
     */
    var player: androidx.media3.exoplayer.ExoPlayer? = null

    /** 开新一轮时清干净上一轮的残留（进度、错误、暂停态都是上一路的）。 */
    fun reset() {
        visible = false
        following = false
        fullscreen = false
        fullscreenPortrait = false
        title = ""
        playing = false
        buffering = true
        ended = false
        failed = null
        positionMs = 0L
        durationMs = 0L
        bufferedMs = 0L
        controlsVisible = true
        baseSpeed = 1f
        fit = FitMode.Fit
        loop = false
        settingsOpen = false
        scrubbing = false
        gridOpen = false
        boost = false
        seekFlashDir = 0
        seekFlashToken = 0
        player = null
    }
}
