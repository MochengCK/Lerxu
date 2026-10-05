package com.lerxu.android.ui.player

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.util.UnstableApi

/**
 * 画面比例：适应（整幅可见）/ 裁剪（填满并裁掉溢出）/ 铺满（拉伸填满）。
 *
 * **默认是「适应」**（[PlayerUi.fit] 的初值也是它）—— 这是市面上成熟播放器的一致默认
 * （VLC / MX Player / 网页 `<video>` 的 `object-fit: contain` 都是它）：先把**整幅画面**
 * 给到用户，比例不合的那点空档留在播放区里。之前默认「裁剪」是把画面填满、溢出裁掉，
 * 竖屏片子摊在横屏播放区里会被裁成中间一条 —— 那不是"显示好了"，是"看不全"（用户点名）。
 *
 * 三档与成熟播放器的口径一一对应：适应 = contain、裁剪 = cover、铺满 = fill。
 * 播放区本身按**视频自己的宽高比**摆放（见 `NativePlayerOverlay.fitRect`），所以
 * "适应"这一档在播放区比例与视频一致时**一条边都不会留** —— 留边只发生在两者确实不同的
 * 时候，那正是用户自己要看整幅的取舍。
 *
 * 这里**不带 Media3 的 resizeMode**：画面尺寸现在由覆盖层按这一档自己算（`fitRect`），
 * 再交给 `PlayerView` 去填 —— 早先那套"把 mode 直接递给 PlayerView"是让 Media3 去改
 * 播放区的尺寸，与页面报来的位置各算一次，边对不齐。
 *
 * 默认档排在最前：选项排在第一位的通常就是"本应用替你选好的那一档"。
 */
@UnstableApi
enum class FitMode(val label: String) {
    Fit("适应"),
    Zoom("裁剪"),
    Fill("铺满")
}

/**
 * 右上角那枚"下载"入口背后的**可下载源**三档（见 [PlayerUi.downloadSource]）。
 *
 * 用户点名："确保……下载视频按钮能够**准确识别该视频的可下载源**并显示" —— 于是这里
 * 不再只按"HLS 清单"一种源开入口，而是先认清"这一路到底能不能下成一个文件"：
 *
 * - [Hls]：M3U8 清单。地址不是产物（自己只有几 KB），但引擎会按清单把分片抓下来
 *   拼成整文件 —— 可下；
 * - [File]：普通单文件（mp4 / flv / webm / mkv / ts / 音频…）。引擎直下即可 —— 可下；
 * - [None]：DASH 清单（`.mpd`）、网页（登录页 / 防盗链提示页）、以及探不出是什么的 ——
 *   都不是能下成一个文件的源，**入口收掉**（早先那种"按地址猜是不是 m3u8"的判定会把
 *   它们里的 `.mpd` 漏放进来，点下去只能得到一个 XML）。
 */
enum class DownloadSource { None, Hls, File }

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

    /**
     * 失败画面第三行那段**技术细节**（每一路尝试的错误码 + 底层消息，短）。
     *
     * 为什么要露出来（2026-10-04）：用户连着两次报"加密 m3u8 播不了"，而界面那句话
     * （"这条地址不是能直接播的视频流"）**盖着三个完全不同的错误码** —— 光看它根本
     * 分不出是清单畸形、容器不认、还是密钥取不到。与其隔着一轮轮试，不如把底层的
     * `errorCode` 与 media3 的原话直接摆出来。**这不是给普通用户看的**，是给"正在
     * 报一个问题"的人看的；字号与透明度都比主文案低一档。
     */
    var failedDetail by mutableStateOf<String?>(null)
    var positionMs by mutableLongStateOf(0L)
    var durationMs by mutableLongStateOf(0L)
    var bufferedMs by mutableLongStateOf(0L)
    var controlsVisible by mutableStateOf(true)

    /** 基准倍速：长按加速结束后回到它（不是死记 1.0）。 */
    var baseSpeed by mutableFloatStateOf(1f)

    /** 画面比例：默认「适应」（见 [FitMode] 的说明）—— 整幅可见，不裁内容。 */
    var fit by mutableStateOf(FitMode.Fit)
    var loop by mutableStateOf(false)
    var keepOn by mutableStateOf(true)

    /**
     * 视频自己的**显示宽高比**（宽 ÷ 高，已算上旋转与像素比；0 = 还没报上来）。
     *
     * 覆盖层拿它算"画面该摆成多大"（见 `NativePlayerOverlay.fitRect`）：成熟播放器的做法
     * 是**让播放区跟着视频的形状走**，而不是把视频硬塞进一个固定形状的播放区 ——
     * 前者在窗口态与网页里那块 `<video>` 严丝合缝（网页的 `<video>` 默认就是
     * `object-fit: contain`），后者必然在某个方向留边。
     *
     * 由播放器的 `onVideoSizeChanged` 写入（ExoPlayer 在解出第一帧前后给出），
     * 到之前为 0：那几帧先按播放区原样摆，尺寸一到立刻重摆。
     */
    var videoAspect by mutableFloatStateOf(0f)

    var settingsOpen by mutableStateOf(false)
    var scrubbing by mutableStateOf(false)

    /**
     * 这一路的**可下载源**：只有认得出"交给引擎就能下成一个文件"的源，右上角才显示
     * "下载"入口（点开底部那张下载弹窗，见 [downloadOpen]）。
     *
     * 由覆盖层写：开播时先按地址/MIME 给个初判（[NativePlayerOverlay.open]），容器探测
     * 回来后按真实结论纠正（DASH 清单、网页这些**不是**可下载的单体源，入口要收掉）。
     */
    var downloadSource by mutableStateOf(DownloadSource.None)

    /** 下载弹窗开着（底部弹窗：文件名 + 大小 + 下载按钮）。 */
    var downloadOpen by mutableStateOf(false)

    /** 下载弹窗里的文件名（可编辑）。 */
    var downloadName by mutableStateOf("")

    /** 我们给的那个默认名（用户没改过时才允许被探测结果改名）。 */
    var downloadAutoName by mutableStateOf("")

    /** 探测出来的预计大小（字节；0 = 还不知道 / 探不出来）。 */
    var downloadSize by mutableStateOf(0L)

    /** 正在探测清单算大小（弹窗上显示"正在计算…"）。 */
    var downloadProbing by mutableStateOf(false)

    /**
     * 标签网格正展开（播放器在往里缩）：控件层不参与 —— 不画、也不吃触摸
     *（那会儿屏幕上是网格的，播放器只是"缩进去的那一块"）。
     */
    var gridOpen by mutableStateOf(false)

    /** 长按加速中（按住不放）：界面据此显示"2× 快进中"那枚徽标。 */
    var boost by mutableStateOf(false)

    /**
     * **锁屏**（用户点名：全屏里控制栏中间偏左加一枚锁屏按钮）。
     *
     * 锁上之后控件整块收起、画面区的点按 / 双击 / 长按全部摘掉，屏幕上只剩那枚"解锁"
     * —— 躺在床上看片时误触屏幕不至于把进度拨走。**只有全屏能锁**：退出全屏、关播放器、
     * 开新一轮都由这里清成 false（见 [reset] 与 `NativePlayerOverlay.setFullscreen`）。
     */
    var locked by mutableStateOf(false)

    /**
     * 双击画面**中间**那一下的结果：true = 现在是播放中。
     *
     * 与 [seekFlashToken] 同一套路数 —— 令牌每切一次 +1，徽标才重播一遍动画
     * （连点两次也看得见反馈）。
     */
    var playFlashPlaying by mutableStateOf(false)
    var playFlashToken by mutableStateOf(0)

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
        failedDetail = null
        positionMs = 0L
        durationMs = 0L
        bufferedMs = 0L
        controlsVisible = true
        baseSpeed = 1f
        fit = FitMode.Fit
        // 上一路的宽高比不能留给下一路：留着的话新片子起播的头几帧会按上一条的比例摆
        videoAspect = 0f
        loop = false
        settingsOpen = false
        scrubbing = false
        downloadSource = DownloadSource.None
        downloadOpen = false
        downloadName = ""
        downloadAutoName = ""
        downloadSize = 0L
        downloadProbing = false
        gridOpen = false
        boost = false
        locked = false
        playFlashPlaying = false
        playFlashToken = 0
        seekFlashDir = 0
        seekFlashToken = 0
        player = null
    }
}
