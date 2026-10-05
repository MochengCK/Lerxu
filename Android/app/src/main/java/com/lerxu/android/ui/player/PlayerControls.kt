package com.lerxu.android.ui.player

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.text.format.DateFormat
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsIgnoringVisibility
import androidx.compose.foundation.layout.systemGestures
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.FastForward
import androidx.compose.material.icons.rounded.FastRewind
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * **竖屏全屏**控制层的左右外沿（顶部一行、底部一列、锁屏那枚**共用这一个值**）。
 *
 * 一个数就够了，因为三块都挂在同一条竖线上：顶部那行的命中框让出 [IconBoxSlack] 后可见外沿
 * 落在它上面，底部那一列的图标本来就贴着命中框站，锁屏那枚在竖屏下也在这列里。
 *
 * 口径变过几次，都是用户当场订正的：先"跟锁屏对齐"（那时算出 48.5dp）→ 再
 * **"控件的左右间距不对，应该减少"** ⇒ 收到 20dp（竖屏屏窄，一条边要吃掉八分之一屏宽）；
 * → 最后**"底部控件、顶部控件的左右间距跟锁屏按钮不一致"** ⇒ 横屏另立 [LandscapeEdge]，
 * 三块永远同一个值（见 [PlayerControls] 里 `edge` 那一段）。
 */
private val FullscreenEdge = 20.dp

/**
 * **横屏全屏**控制层的左右外沿：比竖屏宽（用户点名："锁屏按钮左侧间距应该增加，因为一般手机
 * 大多是左侧有摄像头的"）。横屏时左右两边会有一条边落在挖孔/刘海那一带，20dp 是不够的；
 * 而横屏屏宽（通常 700dp+）也吃得下这个值。
 *
 * 它同时是**三块**（顶部一行 / 底部一列 / 锁屏那枚）的外沿 —— 用户点名：
 * "底部控件、顶部控件，它的左右间距跟锁屏按钮不一致"，所以别再给某一处单独加宽。
 * 真挖孔比这个值还宽时按挖孔走（`displayCutout` 左右取大者 + 8dp，保证左右仍同值），见
 * [PlayerControls] 里 `edge` 那一段。
 */
private val LandscapeEdge = 44.dp

/**
 * 顶部那行图标在 44dp 命中框里**居中** ⇒ 方框比可见内容宽出 `(44-24)/2 = 10dp`。
 *
 * 顶部那行的留白要**减掉**它（见 [PlayerIconButton] 的 `align`），可见外沿才与底部那一列
 * 落在同一条线（`edge`）上；底部那列的图标本来就贴着命中框站，不需要让位。
 */
private val IconBoxSlack = 10.dp

/**
 * **窗口态**顶部那一行的留白。图标在 44dp 命中框里居中 ⇒ 它**看得见的外沿**是
 * `6 + [IconBoxSlack] = 16dp`；全屏态改成只跟信息栏隔 [StatusGap]（用户点名"顶部控件与顶部
 * 信息栏之间的间距应该减少一点"），那一档另算。
 */
private val TopInset = 6.dp

/**
 * 全屏顶部那排按钮与**自绘信息栏**之间的间隙，**按"看得见的"算**（信息栏下沿 → 图标可见外沿）。
 *
 * 用户点名过两轮："顶部控件与顶部信息栏之间的间距应该减少一点" → "再减少一点"。
 * 所以它是指**图标**到信息栏的距离，不是命中框的 `padding` —— 那 44dp 的命中框比 24dp 的图标
 * 高出一整格，直接用 padding 的话"看得见的间距"会平白多出 [IconBoxSlack] 的一半（10dp），
 * 怎么调都还是空一截。见 [PlayerControls] 里顶部那行的 `top`。
 *
 * 底部那一列跟着对称（同一句"跟顶部间距一致"的口径），但下限仍是系统手势带，见 [BottomIconSlack]。
 */
private val StatusGap = 2.dp

/**
 * 全屏底部那一列的图标**可见外沿**与屏幕下沿之间的目标间隙。
 *
 * 跟顶部是同一句口径（用户点名："底部控件的底部间距应该减少至跟顶部间距一致"），但两端几何
 * 不一样：底部最大的一枚是 27dp 的播放三角，它在 44dp 命中框里居中就把"看得见的间距"顶到
 * [BottomIconSlack]（8.5dp）了 —— 所以这里取一个**收得下去**的值（比顶部的 [StatusGap] 略大），
 * 下限再由系统手势带兜住，见 [PlayerControls] 里 `bottomPad` 那一段。
 */
private val BottomGap = 12.dp

/**
 * **自绘信息栏整体上抬多少**（用户点名："全屏后，顶部的系统信息显示应该向上移动一点点"）。
 *
 * 那一格是照系统状态栏高度摆的、内容在里面居中，而且各家把状态栏高度算得偏保守
 *（不少机器把那截高度里还混着挖孔/刘海那段没内容的边距），所以居中之后读起来偏低。
 * 抬 3dp 就够"看起来落在那一格的上半" —— 再往上就要贴着屏幕顶了。
 *
 * 用负偏移而不是减小 [statusBarHeight]：那一格的高度还被**顶部按钮那排的起点**用着
 *（`statusBarHeight + StatusGap - IconBoxSlack`），动它会连带把按钮也往上挪 —— 用户要的是
 * "时钟电量这一行往上挪一点"，不是"整层往上挪"。它没有背景也不吃触摸，抬出去的部分不会被裁。
 */
private val StatusBarRise = 3.dp

/**
 * 底部那一列里**最大**的一枚图标（27dp 的播放三角）在 44dp 命中框里居中的余量：
 * `(44-27)/2 = 8.5dp`。
 *
 * 顶部的对称式是"看得见的间距 + 余量"，底部要反过来把余量减掉 —— 两端订阅同一个数。
 */
private val BottomIconSlack = 8.5.dp

/**
 * 锁屏那枚与进度那排之间的间隙 —— **竖屏全屏**下它就是用户点名的那个"悬浮在进度条最左侧的
 * **上方一点**"；横屏时锁屏回到画面左缘竖直居中（见 [PlayerControls] 里那两支），用不上它。
 */
private val LockGap = 6.dp

/**
 * **竖屏全屏**锁屏态要给"进度 + 按钮"那两排**留出的高度**（30dp 的进度那排 + 44dp 的按钮那排）。
 *
 * 为什么锁上了还要占着地方：竖屏下锁屏那枚在那一列的顶上，锁上前/后**位置不能变**
 * （它是同一枚按钮的两种状态，一锁就往下掉一截读起来就是"按钮跑了"）。
 * 横屏锁屏时整列撤掉 —— 那枚在屏幕左缘居中，不依赖这一列。
 * 那两个尺寸写死在 [PlayerSeekRow] / [PlayerButtonsRow] 里，改那里要回来改这里。
 */
private val BottomRowsHeight = 74.dp

/** 自绘信息栏的高度下限（拿不到系统状态栏高度时用它，例如 insets 还没派发下来的头几帧）。 */
private val StatusBarMinHeight = 24.dp


/**
 * 播放器的**控件层**（Compose）：一块正好盖在视频上的透明视图，上面是压暗条 + 图标 +
 * 进度条，底下什么都不铺 —— 视频本身是覆盖层里另一个原生 View（TextureView 合成），
 * 就在这块 Compose 视图的下面，所以这里不能画任何不透明底。
 *
 * 控件形态沿用用户点名的口径：**没有底板**，靠下方一条贴边渐变"托"起图标，唤出时上方
 * 同时压暗一条；**全屏最顶上是自绘的信息栏**（时间 / 电量 / 网络，见 [PlayerStatusBar]），
 * 它的下沿才是那排按钮：上排只有播放/暂停（左）与全屏（右）+ 右上角**下载**（仅 M3U8）、设置，
 * 而**全屏时左上是退出全屏**（右上角不再有"关闭播放器"那枚叉，用户点名删掉）；
 * 下排全屏时是「进度在上、按钮在下」，而且**最上面还挂着那枚锁屏**（悬浮在进度条最左侧的
 * 上方一点，见 [PlayerLockButton]）；两枚图标的**外沿**与进度显示的外沿对齐。
 *
 * 手势：点任意处切换显隐；双击左 / 右三分之一 ∓10s、**双击中间切播放/暂停**；长按 2 倍速。
 * 锁屏之后只剩"点一下切显隐"这一下（双击跳转与长按加速整块摘掉），屏幕上只剩那枚
 * "已锁定" —— 它和其他控制按钮**同一个显隐节奏**：点一下出来、点一下收起、3 秒自动收起。
 */
@OptIn(UnstableApi::class, ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PlayerControls(
    ui: PlayerUi,
    onToggleFullscreen: () -> Unit,
    /** 全屏态下"切换横竖屏"（右下角那枚）：只转屏，不退出全屏。 */
    onToggleOrientation: () -> Unit,
    /**
     * 点右上角齿轮：开设置弹窗。
     *
     * 弹窗本体**不在这一层**：这块 Compose 视图只占视频那一块，弹窗放这里会被
     * 限制在播放器内（用户点名）。它挂在覆盖层的另一层上（整窗口，见
     * [NativePlayerOverlay]），这里只负责"开"。
     */
    onOpenSettings: () -> Unit,
    /** 点右上角下载：开下载弹窗（只有 M3U8 内容才显示这枚入口）。 */
    onOpenDownload: () -> Unit,
    /**
     * 播不了时点"用网页播放器"：关掉我们这一层，把页面自己的播放器还回去。
     *
     * 为什么必须有这条出路：现在失败画面是一句"可回到网页里继续看"，却**没有可点的东西** ——
     * 用户只能自己想起"退出去再点一次"。关掉这一层之后页面那一路会被原样还原
     * （见 BrowserController.setNativePlayerActive(false)），而页面侧的接管闸门那时已经关了，
     * 所以不会"关掉又被抢回来"。
     */
    onFallbackToPage: () -> Unit
) {
    val player = ui.player

    // 锁屏（只有全屏里会真）—— 锁上之后控件整块收起，只剩一枚"解锁"
    val locked = ui.locked && ui.fullscreen

    // 播放中闲置 3s 自动收起控件（暂停时一直留着）；锁屏态不需要这套
    // 锁屏态**一样要自动收起**（用户点名："锁屏按钮应该跟其他控制按钮的显示状态一样"）——
    // 早先这里把 locked 排除在外，于是锁屏按钮（和"已锁定"那行字）永远挂在屏幕上。
    // `locked` 仍留在 key 里：锁/解锁那一下要重新起表，锁上之后 3 秒再收
    LaunchedEffect(ui.controlsVisible, ui.playing, locked) {
        if (!ui.controlsVisible || !ui.playing) return@LaunchedEffect
        delay(3000)
        ui.controlsVisible = false
    }

    /** 长按加速：按下进入 2 倍，松手回到基准倍速。 */
    fun boost(on: Boolean) {
        ui.boost = on
        player?.playbackParameters = PlaybackParameters(if (on) 2f else ui.baseSpeed)
    }

    fun seekBy(deltaMs: Long) {
        val p = player ?: return
        val target = (p.currentPosition + deltaMs)
            .coerceIn(0L, if (ui.durationMs > 0) ui.durationMs else Long.MAX_VALUE)
        p.seekTo(target)
        ui.positionMs = target
    }

    /**
     * 播放 / 暂停，并亮一下居中那块状态徽标（双击画面**中间**用，用户点名）。
     *
     * 徽标显示的是**动作之后**的状态（刚暂停就是"暂停"），所以先记下切换前的状态。
     */
    fun togglePlay() {
        val wasPlaying = ui.playing
        if (wasPlaying) player?.pause() else player?.play()
        ui.playFlashPlaying = !wasPlaying
        ui.playFlashToken++
        ui.controlsVisible = true
    }

    if (!ui.open || !ui.visible && !ui.fullscreen) return
    // 标签网格展开时播放器正"缩进卡片"：这一段不画控件、也不吃触摸
    if (ui.gridOpen && !ui.fullscreen) return

    /**
     * 全屏时顶部要给那条**自绘信息栏**留出的高度（[PlayerStatusBar]）。
     *
     * 用 `statusBarsIgnoringVisibility`：全屏是沉浸式，系统那条状态栏被我们藏了，
     * 普通 `statusBars` 在隐藏时**会报 0**，于是留白会塌成 0、按钮又压回屏幕顶格。
     * 拿不到时用 [StatusBarMinHeight] 兜底（insets 还没派发下来的头几帧）。
     */
    val density = LocalDensity.current
    val statusBarHeight = with(density) {
        WindowInsets.statusBarsIgnoringVisibility.getTop(density).toDp()
    }.coerceAtLeast(StatusBarMinHeight)

    /**
     * 全屏态控制层的**左右外沿**：顶部一行、底部一列、锁屏那枚**共用这一个值** ——
     * 用户点名："底部控件、顶部控件的左右间距跟锁屏按钮不一致"（早先只把锁屏那枚单独加宽过，
     * 于是三块各走各的）。
     *
     * 取值分两种情况：
     * - **竖屏**：[FullscreenEdge]（20dp）—— 竖屏屏窄，而且两侧没有硬约束（挖孔在顶上）；
     * - **横屏**：[LandscapeEdge]（44dp）—— 用户点名："因为一般手机大多是左侧有摄像头的"，
     *   横屏时左右总有一边落在挖孔/刘海那一带。**实际挖孔更宽时按挖孔走**：
     *   左右两个边距取大者再 +8dp（取大者是为了 `左 == 右`，挖孔只在一边，但两边的控件
     *   得对称才好看）。
     *
     * 注意左右方向的 insets getter 要**带 layoutDirection**（上下那两个不用）。
     */
    val edge = if (!ui.fullscreen) {
        14.dp
    } else if (ui.fullscreenPortrait) {
        FullscreenEdge
    } else {
        val direction = LocalLayoutDirection.current
        val cutout = with(density) {
            maxOf(
                WindowInsets.displayCutout.getLeft(density, direction),
                WindowInsets.displayCutout.getRight(density, direction)
            ).toDp()
        }
        maxOf(LandscapeEdge, cutout + 8.dp)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                // 全屏态把拖动也吃掉：整屏都是我们的，别让手指漏到后面的网页上
                .then(
                    if (ui.fullscreen) {
                        Modifier.pointerInput(Unit) { detectDragGestures { change, _ -> change.consume() } }
                    } else {
                        Modifier
                    }
                )
                // 视频区域的手势：单击切换控件、双击（左 / 中 / 右三档）跳转或播放暂停、
                // 长按 2 倍速。**锁屏时整块摘掉**：这时候屏幕不该响应任何误触
                .then(
                    if (locked) {
                        // 锁屏：只留**点一下切控件显隐** —— 控件（那枚"已锁定"）收起后
                        // 得有路唤回来，而双击跳转 / 长按加速正是锁屏要挡住的误触
                        Modifier.pointerInput(Unit) {
                            detectTapGestures(
                                onTap = { ui.controlsVisible = !ui.controlsVisible }
                            )
                        }
                    } else {
                        Modifier.pointerInput(Unit) {
                            detectTapGestures(
                                onTap = { ui.controlsVisible = !ui.controlsVisible },
                                onDoubleTap = { offset ->
                                    // 三档而不是对半分（用户点名："双击播放器中间应该是暂停
                                    // 和开始视频"）：左 1/3 退 10s、右 1/3 进 10s、
                                    // **中间那 1/3 切播放/暂停**（各家的共同口径）
                                    val third = size.width / 3f
                                    when {
                                        offset.x < third -> {
                                            seekBy(-10_000L)
                                            // 左右各对应一侧的跳动提示：
                                            // 方向 + 令牌（连点两次也重播动画）
                                            ui.seekFlashDir = -1
                                            ui.seekFlashToken++
                                        }
                                        offset.x > third * 2f -> {
                                            seekBy(10_000L)
                                            ui.seekFlashDir = 1
                                            ui.seekFlashToken++
                                        }
                                        else -> togglePlay()
                                    }
                                    ui.controlsVisible = true
                                },
                                onLongPress = null,
                                // 长按 = **按住期间** 2 倍速，松手还原。
                                // 用 onPress + tryAwaitRelease，而不是 onLongPress：后者只报
                                // "按下了"、没有"松手"那一下，做不出"按住才加速"
                                onPress = {
                                    val released = withTimeoutOrNull(400L) {
                                        tryAwaitRelease()
                                        true
                                    }
                                    if (released == null) {
                                        boost(true)
                                        tryAwaitRelease()
                                        boost(false)
                                    }
                                }
                            )
                        }
                    }
                )
        ) {
            // ── 双击左右半屏：那一侧亮一块柔和的渐变 + 图标缩放淡出 ──
            if (ui.seekFlashDir != 0) SeekFlash(ui.seekFlashDir, ui.seekFlashToken)

            // ── 长按加速中：居中的徽标，带一点呼吸感 ──
            if (ui.boost) BoostBadge(ui.baseSpeed)

            if (ui.buffering) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .size(42.dp),
                    color = Color.White,
                    strokeWidth = 3.dp
                )
            }

            ui.failed?.let { msg ->
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("播放失败", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text(msg, color = Color(0xB3FFFFFF), fontSize = 13.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "有些流需要登录态或已失效，可回到网页里继续看",
                        color = Color(0x80FFFFFF),
                        fontSize = 12.sp
                    )
                    // 每一路尝试的原始错误（可选）：给"正在报一个问题"的人看，
                    // 字号与透明度再低一档，不抢主文案（见 PlayerUi.failedDetail）
                    ui.failedDetail?.let { detail ->
                        Spacer(Modifier.height(10.dp))
                        Text(
                            detail,
                            color = Color(0x66FFFFFF),
                            fontSize = 10.sp,
                            lineHeight = 14.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    // 出路：还回页面自己的播放器（不再是无处可点的死路）
                    TextButton(
                        onClick = onFallbackToPage,
                        colors = ButtonDefaults.textButtonColors(contentColor = Color.White)
                    ) {
                        Text("用网页播放器", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            if (ui.ended) {
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .size(72.dp)
                        .background(Color(0x66000000), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Rounded.Replay10,
                        contentDescription = "重播",
                        tint = Color.White,
                        modifier = Modifier
                            .size(34.dp)
                            .pointerInput(Unit) {
                                detectTapGestures {
                                    player?.seekTo(0)
                                    player?.play()
                                }
                            }
                    )
                }
            }

            // 双击画面**中间**那一下的播放/暂停徽标（与左右两侧那两块跳动提示同一套动效）
            if (ui.playFlashToken > 0) PlayFlash(ui.playFlashPlaying, ui.playFlashToken)

            // ── 控件层：上方压暗条 + 下方压暗条 + 底部控制行（都没有底板）──
            // 显隐只看 `ui.controlsVisible`（**锁屏态也一样**：锁上之后这层里只剩那枚
            // "已锁定"，它同样 3 秒自动收起、点一下画面再出来 —— 用户点名要和其它
            // 控制按钮同一个显示状态。早先是 `|| locked`，于是它永远亮着）
            if (ui.controlsVisible) {
                if (!locked) {
                    // 没跟上网页位置时亮一行小字：不然"播放器不在网页那个位置上"是无声的，
                    // 用户只看到"它固定在顶上"，原因却看不到
                    if (!ui.following && !ui.fullscreen) {
                        Text(
                            text = "位置未同步（网页里没量到播放器，暂用兜底位置）",
                            color = Color(0xCCFFFFFF),
                            fontSize = 11.sp,
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .padding(top = 58.dp)
                                .background(Color(0x59000000), RoundedCornerShape(20.dp))
                                .padding(horizontal = 10.dp, vertical = 3.dp)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .fillMaxWidth()
                            .height(if (ui.fullscreen) 96.dp else 56.dp)
                            .background(
                                Brush.verticalGradient(
                                    listOf(Color(0x9E000000), Color.Transparent)
                                )
                            )
                    )
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .height(if (ui.fullscreen) 148.dp else 96.dp)
                            .background(
                                Brush.verticalGradient(
                                    listOf(Color.Transparent, Color(0xD9000000))
                                )
                            )
                    )
                    // 全屏顶部那条**自绘信息栏**（用户点名："顶部的按钮不应该遮挡住系统的
                    // 信息栏……顶部应该显示我们自定义的系统信息栏"）。全屏是沉浸式、系统那条
                    // 被我们藏了，这条就是它的替身：它把那一格高度**占住**，下面那排顶部按钮
                    // 从它的下沿再往下排（见 [TopInset] 与 [statusBarHeight]）——
                    // 两者永远不会叠在一起。
                    //
                    // 它跟着控件层一起显隐（不是常驻）：全屏看片时那 3 秒后整层收起，
                    // 屏幕上就只剩画面，跟"系统栏被藏掉"的沉浸感是一致的
                    if (ui.fullscreen) {
                        PlayerStatusBar(
                            statusBarHeight = statusBarHeight,
                            // 竖屏：时间贴左（用户点名）；横屏：时间居中。跟锁屏那枚用的是
                            // **同一个档位**（[PlayerUi.fullscreenPortrait]，本模块一贯不读
                            // 系统当前配置），否则会出现"时间已经贴左、锁屏还在屏幕中间偏左"
                            // 这种两头不一致的中间态
                            portrait = ui.fullscreenPortrait,
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                // 与下面那排按钮、底部那一列同一条外沿（`edge`）——
                                // 信息栏的时钟/电量因此也落在控制层那条线上
                                .padding(horizontal = edge)
                                // 整体再往上抬一点（用户点名："全屏后，顶部的系统信息显示
                                // 应该向上移动一点点"）：那一格是按系统状态栏高度摆的，
                                // 内容在里面**居中**，多数机器读出来偏低（那一格里本来就
                                // 混着挖孔/刘海那段没内容的边距）。负偏移是安全的：
                                // 它不吃触摸、也没有背景，抬出去的部分不会被裁
                                .offset(y = -StatusBarRise)
                        )
                    }
                    // 顶部一行：全屏时左上是**退出全屏**（一枚向左的箭头，用户点名）、
                    // 右上依次是下载（仅 M3U8）/ 设置。
                    // **刻意不显示网页名**（用户点名）：那是页面自己的事，播放器上挂着站点名
                    // 既挤又没用。
                    //
                    // 设置**一直在右上角**（用户点名："它不应该仍然保持在右侧吗"）—— 之前
                    // 全屏时把设置摆到了左上、退出全屏摆到了右上，正好反了。
                    //
                    // **右上角不再有"关闭播放器"那枚叉**（用户点名："原生播放器全屏后，
                    // 右上角不应该有一个退出按钮"）：全屏里右上角只放下载与设置；结束播放
                    // 走设置弹窗里那一行「关闭播放器」，退出全屏仍走左上那枚箭头。
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .fillMaxWidth()
                            .padding(
                                // 全屏：命中框让出图标在框里居中的那半格（[IconBoxSlack]），
                                // 可见外沿才与底部那一列、锁屏那枚落在同一条线（`edge`）上；
                                // 窗口态照旧贴边 6dp
                                start = if (ui.fullscreen) edge - IconBoxSlack else 6.dp,
                                end = if (ui.fullscreen) edge - IconBoxSlack else 6.dp,
                                // 全屏：从**自绘信息栏的下沿**起算。注意 [StatusGap] 是"看得见的"
                                // 间距，而图标在 44dp 命中框里居中、框比图标高出一整格，
                                // 所以要把那半格（[IconBoxSlack]）减掉 —— 不然怎么调都还空一截。
                                // 顶到信息栏下沿也没关系：那条栏本身不吃触摸。
                                // 窗口态没有信息栏，照旧 [TopInset]
                                top = if (ui.fullscreen) {
                                    statusBarHeight + StatusGap - IconBoxSlack
                                } else {
                                    TopInset
                                }
                            ),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // 窗口态左上角**什么都不放**（用户点名：没全屏时不该有那枚关闭按钮）——
                        // 关播放器挪进了设置弹窗（"关闭播放器"那一行），离开页面本来也会收
                        if (ui.fullscreen) {
                            PlayerIconButton(LerxuExitFullscreen, "退出全屏") {
                                onToggleFullscreen()
                                ui.controlsVisible = true
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        // 下载：**这一路有可下载源才出现**（用户口径："准确识别该视频的
                        // 可下载源并显示"）—— HLS 清单与普通单文件给，DASH 清单 / 网页
                        // / 认不出的源不给（见 [DownloadSource]）
                        if (ui.downloadSource != DownloadSource.None) {
                            PlayerIconButton(Icons.Rounded.Download, "下载", size = 22.dp) {
                                onOpenDownload()
                                ui.controlsVisible = true
                            }
                        }
                        PlayerIconButton(Icons.Rounded.Settings, "设置", size = 22.dp) {
                            onOpenSettings()
                        }
                    }
                }
                // 锁屏那枚的位置**跟着屏幕方向走**（用户点名："应该只是竖屏状态下，锁屏在
                // 进度条的上方，横屏它应该仍然在中间的左侧"）：
                // - **竖屏**：挂在底部那一列的顶上（下一条 Column 里），悬浮在进度条最左侧的
                //   上方一点 —— 竖屏画面是屏幕中间一条带，底部那一列本来就在画面之外，
                //   锁屏跟着列走才不至于孤零零挂在黑边上；
                // - **横屏**：回到画面左缘、竖直居中（`Alignment.CenterStart`），左沿与顶部
                //   一行、底部一列同值（`edge`，横屏那一档本身就让开了左侧挖孔）。
                val lockAtColumnTop = ui.fullscreen && ui.fullscreenPortrait
                val onLockClick: () -> Unit = {
                    ui.locked = !ui.locked
                    ui.controlsVisible = true
                }
                if (ui.fullscreen && !ui.fullscreenPortrait) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .padding(start = edge)
                    ) {
                        PlayerLockButton(locked, onLockClick)
                    }
                }
                // 底部这一列：窗口态是「按钮在上、进度在下」；**全屏态反过来**（用户点名：
                // "全屏后应该变为进度显示在控制按钮的上方，控制按钮在下方"），竖屏全屏时它的
                // **顶上还挂着锁屏那枚**。
                //
                // 为什么锁屏要**进这一列**（而不是各自为政地摆）：它跟进度条共用同一条左沿
                // （`edge`），"全屏控制层的左沿"就只有一处出处。
                //
                // 锁上之后**竖屏这一列不撤、只把两排换成一团等高占位**：那枚按钮锁前锁后
                // 必须是同一个点（用户口径："位置不变，解锁还是这一枚"），
                // 直接把两排摘掉它就会往下掉一截（见 [BottomRowsHeight]）。
                // 横屏锁屏时整列撤掉 —— 锁屏那枚在屏幕中间，不依赖这一列。
                //
                // 底部留白分两件事：
                //
                // ① **与顶部对称**（用户点名："全屏状态下，底部控件的底部间距应该减少至跟
                //    顶部间距一致"）—— 目标是 [BottomGap] 那个"看得见的间距"，命中框比图标
                //    高出的那半格在这里要反过来减掉。
                // ② **下限仍守住系统手势带**：全屏是沉浸式（系统栏藏了、内容铺到最下沿），
                //    最下沿那条"上滑回桌面"的带子还在系统手里，落进去的按钮手势会被系统
                //    先吃掉、点上去**没反应**（用户早前点名的那条）。所以取两者的大者 ——
                //    可见图标不能压进那条带子里（命中框比图标大出的那半格可以）。
                //    窗口态系统栏在，按常规 10dp 摆。
                val gestureBottom = with(density) {
                    WindowInsets.systemGestures.getBottom(density).toDp()
                }
                val bottomPad = if (ui.fullscreen) {
                    maxOf(BottomGap - BottomIconSlack, gestureBottom - BottomIconSlack)
                } else {
                    10.dp
                }
                if (!locked || lockAtColumnTop) {
                    Column(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            // 左右留白：全屏与顶部那一行、锁屏那枚**共用 `edge`**
                            // （`edge` 在窗口态就是原来的 14dp）—— 进度那排跟着一起收，
                            // 所以"图标外沿与时间对齐"这层关系不变
                            .padding(
                                start = edge,
                                end = edge,
                                bottom = bottomPad
                            )
                    ) {
                        if (lockAtColumnTop) {
                            PlayerLockButton(locked, onLockClick)
                            Spacer(Modifier.height(LockGap))
                        }
                        if (locked) {
                            // 锁屏态：进度那排与按钮那排撤掉，但**位置留着**（见 [BottomRowsHeight]）
                            Spacer(Modifier.height(BottomRowsHeight))
                        } else {
                            if (ui.fullscreen) PlayerSeekRow(ui, player)
                            PlayerButtonsRow(ui, player, onToggleFullscreen, onToggleOrientation)
                            if (!ui.fullscreen) PlayerSeekRow(ui, player)
                        }
                    }
                }
            }
        }

    }
}

/** 信息栏左侧那一枚要表达的几档（拿不到网络信息时是 [None]，什么都不画）。 */
private enum class NetKind { Wifi, Cellular, Other, None }

/**
 * 全屏顶部那条**自绘的信息栏**（用户点名："顶部的按钮不应该遮挡住系统的信息栏……顶部应该
 * 显示我们自定义的系统信息栏"）。分工是固定的：
 *
 * - **右端**：网络图标 → 电量百分比 → 电量图标 —— 顺序由用户点名：
 *   "电量图标左侧显示电量百分比"、"WiFi 显示应该是在电量百分比的左侧，而不是最左侧"；
 * - **时间**：[portrait] 为真时贴**最左**，否则居中（用户点名："竖屏状态下，时间应该显示在
 *   最左侧，而不是中间"）。
 *
 * 为什么要有它：全屏是沉浸式、系统那条状态栏被我们藏了（见 `NativePlayerOverlay.setFullscreen`），
 * 而顶部那排按钮本来就贴着屏幕顶格 —— 用户读到的就是"按钮压着系统的信息栏"。所以**这一格
 * 高度由信息栏占住**，按钮从它的下沿再往下排（见 [TopInset]）。
 *
 * 三条数据各走各的读法，都在同一个循环里刷（对齐到分钟）：
 * - **时间**：`SimpleDateFormat`，12 / 24 小时**跟着系统设置**（别写死 24 小时）；
 * - **电量**：`ACTION_BATTERY_CHANGED` 是**粘性广播**，`registerReceiver(null, …)` 直接读，
 *   既不用注册接收器、也不用任何权限；
 * - **网络**：`ConnectivityManager` 当前那条链路的能力 —— 所以"用的是 WiFi 还是流量"是按
 *   **实际在用的链路**判的，不是按"WiFi 开着没"（开着 WiFi 但走蜂窝的机器不少）。
 *
 * 视觉：12sp / 16dp 的一档，跟控件层其它小字同重量；压在亮画面上要立得住，所以文字带投影
 * （顶部那条渐变压暗条也在它下面兜着）。
 */
@Composable
private fun PlayerStatusBar(
    statusBarHeight: Dp,
    portrait: Boolean,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var clock by remember { mutableStateOf("") }
    var percent by remember { mutableIntStateOf(-1) }
    var charging by remember { mutableStateOf(false) }
    var net by remember { mutableStateOf(NetKind.None) }

    LaunchedEffect(Unit) {
        val pattern = if (DateFormat.is24HourFormat(context)) "HH:mm" else "h:mm"
        val format = SimpleDateFormat(pattern, Locale.getDefault())
        while (true) {
            clock = format.format(Date())
            // 只显示到分钟 ⇒ 对齐到下一分钟再醒，别每秒空转（这条循环只活在控件可见期间）
            delay(60_000L - System.currentTimeMillis() % 60_000L + 40L)
        }
    }
    // 电量 / 充电 / 网络**单独一条短周期**：这三样变得比分钟快得多 ——
    // 插上充电线要马上看见那枚闪电（原来跟时钟同一条"每分钟醒一次"的循环，
    // 最坏要等 60 秒才更新，读起来就是"没识别充电状态"）。5 秒一次，成本可以忽略
    //（读一条粘性广播 + 一次 ConnectivityManager）；控件收起时这条循环随组合一起消失
    LaunchedEffect(Unit) {
        while (true) {
            val battery = readBattery(context)
            percent = battery.percent
            charging = battery.charging
            net = readNetworkKind(context)
            delay(5_000L)
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(statusBarHeight),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = clock,
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            style = TextStyle(shadow = Shadow(color = Color(0xB3000000), blurRadius = 4f)),
            // 竖屏贴最左、横屏居中（用户点名："竖屏状态下，时间应该显示在最左侧，而不是中间"）。
            // 横屏中间那一格必须留着：横屏时右端是"网络 + 电量"两截，比左端长，时间居中才好看
            modifier = Modifier.align(if (portrait) Alignment.CenterStart else Alignment.Center)
        )
        Row(
            modifier = Modifier.align(Alignment.CenterEnd),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 右端自左向右：**网络 → 电量百分比 → 电量图标**（用户点名次序：
            // "电量图标左侧显示电量百分比"、"WiFi 显示应该是在电量百分比的左侧，而不是最左侧"）
            when (net) {
                NetKind.Wifi -> StatusIcon(LerxuWifi, "WiFi")
                NetKind.Cellular -> StatusIcon(LerxuCellular, "移动数据")
                NetKind.Other -> StatusIcon(LerxuCellular, "其它网络")
                NetKind.None -> Unit
            }
            if (net != NetKind.None) Spacer(Modifier.width(6.dp))
            Text(
                text = if (percent >= 0) "$percent%" else "--",
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                style = TextStyle(shadow = Shadow(color = Color(0xB3000000), blurRadius = 4f))
            )
            Spacer(Modifier.width(5.dp))
            BatteryGlyph(percent, charging)
        }
    }
}

/** 信息栏里那枚网络图标：16dp，与旁边 12sp 的字同一档视觉重量。 */
@Composable
private fun StatusIcon(icon: ImageVector, label: String, modifier: Modifier = Modifier) {
    Icon(
        icon,
        contentDescription = label,
        tint = Color.White,
        modifier = modifier
            .size(16.dp)
            // **往上提 1dp**（用户点名："WiFi 图标没有跟它右侧的内容对齐，有点向下偏移"）：
            // 这两枚图标是自绘的 24 格矢量，墨迹画在格子的**下半段**（三弧落在 6.7~20、
            // 信号柱落在 6~19.4），装进 16dp 的框里之后视觉中线比框中线低约 1dp；
            // 右侧那排（电量百分比 + 电量图标）按框中线排，于是看着就是网络图标"沉"了一点
            .offset(y = (-1).dp)
    )
}

/**
 * 电量图标：外壳 + 按百分比的填充 + 右上那颗小凸点；**充电时里面画一枚闪电**。
 *
 * 自己画而不是用 Material 那组（`Battery2Bar`…`Battery6Bar`）有两个原因：一是它们只有
 * 六档，跟真实电量对不上；二是那组图标的名字随版本改过（`Battery20` → `Battery2Bar`），
 * 自绘不会因为升个依赖就编不过（这个项目不写 UI 测试，编译就是唯一闸门）。
 *
 * 闪电那一条是用户点名补的（"没有识别充电状态"）：原来只画填充，插着充电线时
 * 和拔下来一模一样 —— 系统那套状态栏的判断是"电池里有闪电"，照抄这一条最不容易误读。
 */
@Composable
private fun BatteryGlyph(percent: Int, charging: Boolean) {
    val shell = Color(0xCCFFFFFF)
    Canvas(modifier = Modifier.size(width = 21.dp, height = 11.dp)) {
        val stroke = 1.1.dp.toPx()
        val corner = CornerRadius(1.6.dp.toPx(), 1.6.dp.toPx())
        // 右侧留 3dp 给那颗凸点
        val bodyW = size.width - 3.dp.toPx()
        drawRoundRect(
            color = shell,
            topLeft = Offset(stroke / 2f, stroke / 2f),
            size = Size(bodyW - stroke, size.height - stroke),
            cornerRadius = corner,
            style = Stroke(width = stroke)
        )
        if (percent >= 0 && !charging) {
            val pad = stroke + 1.dp.toPx()
            val track = bodyW - pad * 2f
            val level = percent.coerceIn(0, 100) / 100f
            drawRoundRect(
                color = Color.White,
                topLeft = Offset(pad, pad),
                // 至少 2dp：1% 也看得出"有电"，不然那格跟空壳没区别
                size = Size((track * level).coerceAtLeast(2.dp.toPx()), size.height - pad * 2f),
                cornerRadius = CornerRadius(0.7.dp.toPx(), 0.7.dp.toPx())
            )
        }
        if (charging) {
            // 闪电：经典那道折线（六个点），只占电池内部那一格，右侧凸点也不挡
            val bw = 5.4.dp.toPx()
            val bh = 7.4.dp.toPx()
            val left = (bodyW - bw) / 2f
            val top = (size.height - bh) / 2f
            fun px(fx: Float) = left + bw * fx
            fun py(fy: Float) = top + bh * fy
            val bolt = Path().apply {
                moveTo(px(0.62f), py(0f))
                lineTo(px(0.18f), py(0.56f))
                lineTo(px(0.46f), py(0.56f))
                lineTo(px(0.34f), py(1f))
                lineTo(px(0.84f), py(0.42f))
                lineTo(px(0.54f), py(0.42f))
                close()
            }
            drawPath(bolt, Color.White)
        }
        drawRoundRect(
            color = shell,
            topLeft = Offset(bodyW + 0.6.dp.toPx(), size.height / 2f - 2.dp.toPx()),
            size = Size(1.7.dp.toPx(), 4.dp.toPx()),
            cornerRadius = CornerRadius(0.8.dp.toPx(), 0.8.dp.toPx())
        )
    }
}

/** 电量：百分比（读不到 -1）+ 是否在充电。 */
private class BatteryState(val percent: Int, val charging: Boolean)

/** 电量与充电状态：读 `ACTION_BATTERY_CHANGED` 这条**粘性广播**（不用注册接收器、不要权限）。 */
private fun readBattery(context: Context): BatteryState {
    val intent = runCatching {
        context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    }.getOrNull() ?: return BatteryState(-1, false)
    val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    // 与系统状态栏同一套判据：CHARGING 与 FULL（插着线冲到 100%）都算"在充"
    val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
        status == BatteryManager.BATTERY_STATUS_FULL
    val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
    if (level < 0 || scale <= 0) return BatteryState(-1, charging)
    return BatteryState(level * 100 / scale, charging)
}

/** 现在**实际在用**的那条链路（读不到就是 [NetKind.None]）。 */
private fun readNetworkKind(context: Context): NetKind {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        ?: return NetKind.None
    val caps = runCatching {
        manager.activeNetwork?.let { manager.getNetworkCapabilities(it) }
    }.getOrNull() ?: return NetKind.None
    return when {
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> NetKind.Wifi
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetKind.Cellular
        else -> NetKind.Other
    }
}

/**
 * 底部那排**进度**：当前进度（左）| 进度条 | 总时长（右）。
 *
 * 单独抽出来只为一件事：全屏态要把它和控制按钮那一排**换个次序**（进度在上、按钮在下，
 * 用户点名），两排的内容本身窗口态/全屏态完全一样。
 */
@Composable
private fun PlayerSeekRow(ui: PlayerUi, player: ExoPlayer?) {
    // 总时长还不知道（直播流没有 ENDLIST / 清单没给时长时 ExoPlayer 报 TIME_UNSET）：
    // 这一刻**别写 0:00**（那读起来就是"坏了"），写 `--:--`，进度条也只画轨道、不可拖 ——
    // 有总长的那一刻它会自己变回来（[PlayerUi.durationMs] 由 NativePlayerOverlay 的取数表刷）
    val known = ui.durationMs > 0L
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 已播时间照给：它在涨，是有用信息（总长未知时它就是"看了多久"）
        Text(
            ui.fmt(ui.positionMs),
            color = Color.White,
            fontSize = 12.sp,
            modifier = Modifier.width(52.dp)
        )
        SeekBar(
            modifier = Modifier.weight(1f),
            positionMs = ui.positionMs,
            bufferedMs = ui.bufferedMs,
            durationMs = ui.durationMs,
            seekable = known,
            onScrub = { ui.scrubbing = true; ui.positionMs = it },
            onCommit = {
                ui.scrubbing = false
                player?.seekTo(it)
                ui.controlsVisible = true
            }
        )
        Text(
            if (known) ui.fmt(ui.durationMs) else "--:--",
            color = Color(0x8CFFFFFF),
            fontSize = 12.sp,
            textAlign = TextAlign.End,
            modifier = Modifier.width(52.dp)
        )
    }
}

/**
 * 底部那排**控制按钮**：左是播放/暂停、右是"全屏"（窗口态）/"转屏"（全屏态）。
 *
 * **只留这两枚**（用户点名不要后退/前进，也不要倍速按钮）—— 倍速挪进设置，长按加速仍然保留。
 * 两枚图标的**外边**与进度那排的显示对齐（见 [PlayerIconButton] 的 align）：左图标的左沿落在
 * 当前进度那颗字的左沿、右图标的右沿落在总时长那颗字的右沿 —— 命中区仍是 44dp 的方框，
 * 只是图标贴着方框的外侧站，看上去刚好压在那条线上（用户点名）。
 *
 * 右枚在全屏里是**转屏**（"切换横竖屏应该是在全屏的状态下切换"，用户点名），退出全屏归
 * 左上角那枚箭头（用户点名）。图标按**当前档位**给，而这个档位取自 [PlayerUi.fullscreenPortrait]
 * —— 那是我们自己记的"上一次请求了什么"，不是去读系统当前配置（请求与实际转屏之间隔着系统
 * 那一拍，读配置会出现"图标显示的和它下一次真正做的事不是一回事"，点起来就像没反应）。
 *
 * 锁屏那枚**不在这里**（用户点名订正过一次）：它在画面中间偏左，见 [PlayerControls] 里
 * `Alignment.CenterStart` 那一支 —— 早先摆在这一排的中间偏左，被退回。
 */
@Composable
private fun PlayerButtonsRow(
    ui: PlayerUi,
    player: ExoPlayer?,
    onToggleFullscreen: () -> Unit,
    onToggleOrientation: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 左枚再往左顶一截（`edgeNudge`）：字形本身在 24 视口里带边距（播放三角从 x=8 起），
        // 不顶出去它的**视觉左沿**就落在进度那排文字的右边。顶的是内容、不是命中框
        PlayerIconButton(
            if (ui.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
            if (ui.playing) "暂停" else "播放",
            align = Alignment.CenterStart,
            size = 27.dp,
            edgeNudge = (-4).dp
        ) {
            if (ui.playing) player?.pause() else player?.play()
            ui.controlsVisible = true
        }
        Spacer(Modifier.weight(1f))
        val landscape = !ui.fullscreenPortrait
        PlayerIconButton(
            if (ui.fullscreen) {
                if (landscape) LerxuRotateToPortrait else LerxuRotateToLandscape
            } else {
                Icons.Rounded.Fullscreen
            },
            if (ui.fullscreen) {
                if (landscape) "转成竖屏" else "转成横屏"
            } else {
                "全屏"
            },
            align = Alignment.CenterEnd,
            size = 24.dp,
            edgeNudge = 2.dp
        ) {
            if (ui.fullscreen) onToggleOrientation() else onToggleFullscreen()
            ui.controlsVisible = true
        }
    }
}

/**
 * 全屏里那枚**锁屏**按钮（用户点名）：**上图下字**（图标在上、文字在下）。位置**分两种**，
 * 由 [PlayerUi.fullscreenPortrait] 一档控制（见 [PlayerControls] 里那两支）：
 *
 * - **竖屏全屏**：挂在底部那一列的顶上 —— 悬浮在**进度条最左侧的上方一点**（[LockGap]）；
 *   竖屏画面只是屏幕中间一条带，底部那一列本就在画面之外，锁屏跟着列走才不至于孤零零
 *   挂在黑边上。用户原话："锁屏按钮应该改为悬浮在进度条最左侧的上方一点，而不是悬浮在视频上"。
 *   锁上之后那一列不撤、只换成等高占位，保证同一枚按钮锁前锁后是同一个点。
 * - **横屏全屏**：回到**画面左缘、竖直居中**（`Alignment.CenterStart`），左沿与另外两块**同值**
 *   （`edge` 的横屏那一档 = [LandscapeEdge]，它本身就让开了左侧的挖孔 —— 用户原话：
 *   "锁屏按钮左侧间距应该增加，因为一般手机大多是左侧有摄像头的"）。
 *   用户原话（位置本身）："应该只是竖屏状态下，锁屏在进度条的上方，横屏它应该仍然在中间的左侧"。
 *
 * 命中框因此是 `CenterStart`：内容贴着命中框左沿站，视觉左沿才等于那条线；
 * **别再给这一枚单独加宽**：三块的外沿是同一个 `edge`（用户点名："底部控件、顶部控件的
 * 左右间距跟锁屏按钮不一致"）。
 *
 * 锁上之后它变成"解锁"（开着的锁 + **"锁定"**）—— 文案按用户点名订正过：
 * 不要"已锁定"那个**状态陈述**（"锁定后不应该显示'已锁定'，就显示'锁定'"），
 * 就和没锁时那句"锁屏"同一个体例（一个词、动作/状态同形）。
 *
 * 锁上之后它还是屏幕上**唯一**还能点的地方 ——
 * 画面区的点按 / 双击 / 长按这时全部摘掉（见 [PlayerControls] 里那道手势闸门），
 * 躺在床上看片时误触屏幕不至于把进度拨走。
 *
 * 手感与 [PlayerIconButton] 同一套：没有底板、按下缩到 0.86 弹回；文字给它一层投影
 * （压在亮画面上时要有轮廓，这一处底下什么都没有），锁定态整体压到 0.72 透明度
 * —— "现在控件是关着的"这件事本身也要看得出来。
 */
@Composable
private fun PlayerLockButton(locked: Boolean, onClick: () -> Unit) {
    val label = if (locked) "锁定" else "锁屏"
    val icon = if (locked) Icons.Rounded.Lock else Icons.Rounded.LockOpen
    var pressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.86f else 1f,
        animationSpec = spring(dampingRatio = 0.45f, stiffness = 900f),
        label = "lockPress"
    )
    Box(
        modifier = Modifier
            .size(width = 62.dp, height = 46.dp)
            .pointerInput(Unit) {
                detectTapGestures(
                    onPress = {
                        pressed = true
                        tryAwaitRelease()
                        pressed = false
                    },
                    onTap = { onClick() }
                )
            },
        // CenterStart 而不是 Center：内容贴命中框的左沿站，视觉左沿才等于控制层那条外沿；
        // 62dp 的宽度留着只是为了**好按**（多了那 41dp 是空的，没有视觉重量）
        contentAlignment = Alignment.CenterStart
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (locked) 0.72f else 1f
            }
        ) {
            Box {
                // 投影（同形状的半透明副本，下移 1dp）
                Icon(
                    icon,
                    contentDescription = null,
                    tint = Color(0x73000000),
                    modifier = Modifier
                        .size(21.dp)
                        .offset(y = 1.dp)
                )
                Icon(
                    icon,
                    contentDescription = label,
                    tint = Color.White,
                    modifier = Modifier.size(21.dp)
                )
            }
            Spacer(Modifier.height(1.dp))
            Text(
                text = label,
                color = Color.White,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
                style = TextStyle(
                    shadow = Shadow(color = Color(0xB3000000), blurRadius = 4f)
                )
            )
        }
    }
}

/** 毫秒 → `m:ss` / `h:mm:ss`。 */
private fun PlayerUi.fmt(ms: Long): String {
    val t = (ms.coerceAtLeast(0L)) / 1000
    val h = t / 3600
    val m = (t % 3600) / 60
    val s = t % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

/**
 * 播放器上的图标按钮：**没有底板**，只有白色图标与一点投影。
 *
 * 设计细节（用户点名"让图标更有设计感"）：
 * - 用 **Rounded** 系列图标（比 Filled 圆润、和圆角界面更贴）；
 * - 投影用"同一枚图标在下方 1dp 处的半透明副本"画 —— Compose 没有给矢量图形
 *   用的 drop shadow，这是最省也最像的一招；压在亮画面上时轮廓才立得住；
 * - 按下时整枚图标轻微缩小（0.86）并降低透明度，松手弹回：**没有底板也能有手感**；
 * - 播放三角按光学居中右移 1dp（几何居中看起来是偏左的）。
 *
 * [align] 决定图标落在 44dp 命中框里的哪一侧：默认居中（顶栏那两枚），底部控制行
 * 的两枚用 CenterStart / CenterEnd —— 命中框不变（还是 44dp 的方框），图标贴到
 * 方框外侧站，视觉上就与下方进度显示（左「当前进度」、右「总时长」）的外侧对齐了。
 */
@Composable
private fun PlayerIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    align: Alignment = Alignment.Center,
    size: androidx.compose.ui.unit.Dp = 24.dp,
    /**
     * 内容的**横向外顶**量（只在 [align] 贴左 / 贴右时有意义）。
     *
     * 用途：字形在 24 视口里自带边距（播放三角从 x=8 起、全屏四角离边 4 个单位），
     * 贴齐命中框的边并不等于**视觉**贴齐 —— 用户点名要控制条两端跟下面那排时间
     * "最左 / 最右对齐"，靠这个把内容顶出去对齐那条线
     */
    edgeNudge: androidx.compose.ui.unit.Dp = 0.dp,
    onClick: () -> Unit
) {
    var pressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.86f else 1f,
        animationSpec = spring(dampingRatio = 0.45f, stiffness = 900f),
        label = "iconPress"
    )
    Box(
        modifier = Modifier
            .size(44.dp)
            .pointerInput(Unit) {
                detectTapGestures(
                    onPress = {
                        pressed = true
                        tryAwaitRelease()
                        pressed = false
                    },
                    onTap = { onClick() }
                )
            },
        contentAlignment = align
    ) {
        Box(
            modifier = Modifier
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    alpha = if (pressed) 0.75f else 1f
                }
                .offset(x = edgeNudge)
        ) {
            // 投影（同形状的半透明副本，下移 1dp）
            Icon(
                icon,
                contentDescription = null,
                tint = Color(0x73000000),
                modifier = Modifier
                    .size(size)
                    .offset(y = 1.dp)
            )
            Icon(
                icon,
                contentDescription = label,
                tint = Color.White,
                modifier = Modifier
                    .size(size)
                    // 播放三角右移 1dp：几何居中看着偏左（**只在居中档做**，
                    // 贴边档要的是跟下面那排对齐，多这 1dp 就偏了）
                    .offset(x = if (label == "播放" && align == Alignment.Center) 1.dp else 0.dp)
            )
        }
    }
}

/**
 * 双击左右半屏的跳动提示：那半边亮一块柔和的渐变，图标 + "10 秒"缩放淡出。
 *
 * [token] 每次双击都变，`key` 一换动画就重头放 —— 连点两次不会"没反应"。
 */
@Composable
private fun BoxScope.SeekFlash(direction: Int, token: Int) {
    val left = direction < 0
    var shown by remember(token) { mutableStateOf(true) }
    LaunchedEffect(token) {
        delay(520)
        shown = false
    }
    val progress by animateFloatAsState(
        targetValue = if (shown) 1f else 0f,
        animationSpec = tween(520, easing = FastOutSlowInEasing),
        label = "seekFlash"
    )
    Box(
        modifier = Modifier
            .align(if (left) Alignment.CenterStart else Alignment.CenterEnd)
            .fillMaxHeight()
            .fillMaxWidth(0.42f)
            .graphicsLayer { alpha = progress }
            .background(
                Brush.horizontalGradient(
                    if (left) {
                        listOf(Color(0x66FFFFFF), Color.Transparent)
                    } else {
                        listOf(Color.Transparent, Color(0x66FFFFFF))
                    }
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.graphicsLayer {
                // 从 0.8 放大到 1.05：有一点"弹进去"的感觉
                val s = 0.8f + 0.25f * progress
                scaleX = s
                scaleY = s
            }
        ) {
            Icon(
                if (left) Icons.Rounded.FastRewind else Icons.Rounded.FastForward,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(30.dp)
            )
            Spacer(Modifier.height(3.dp))
            Text(
                "10 秒",
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

/**
 * 双击画面**中间**那一下的播放 / 暂停徽标：图标 + 一行小字，缩放淡出。
 *
 * 节奏与左右那两块跳动提示同一套（[SeekFlash]），但**不铺侧边渐变**：那两块是"往哪一侧
 * 跳"的方向提示，需要一块亮面把注意力引过去；这一块是画面正中的状态回执，铺一层渐变
 * 只会把画面中间糊掉。
 */
@Composable
private fun BoxScope.PlayFlash(playing: Boolean, token: Int) {
    var shown by remember(token) { mutableStateOf(true) }
    LaunchedEffect(token) {
        delay(520)
        shown = false
    }
    val progress by animateFloatAsState(
        targetValue = if (shown) 1f else 0f,
        animationSpec = tween(520, easing = FastOutSlowInEasing),
        label = "playFlash"
    )
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .align(Alignment.Center)
            .graphicsLayer {
                alpha = progress
                // 与左右那两块同一个"弹进去"的量
                val s = 0.8f + 0.25f * progress
                scaleX = s
                scaleY = s
            }
    ) {
        Icon(
            if (playing) Icons.Rounded.PlayArrow else Icons.Rounded.Pause,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(30.dp)
        )
        Spacer(Modifier.height(3.dp))
        Text(
            if (playing) "播放" else "暂停",
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

/** 长按加速中的徽标：带一点呼吸感，明确告诉用户"现在在 2 倍"。 */
@Composable
private fun BoxScope.BoostBadge(speed: Float) {
    val breathe by rememberInfiniteTransition(label = "boost").animateFloat(
        initialValue = 1f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(tween(620), RepeatMode.Reverse),
        label = "boostScale"
    )
    Box(
        modifier = Modifier
            .align(Alignment.Center)
            .graphicsLayer {
                scaleX = breathe
                scaleY = breathe
            }
            .background(Color(0x8C000000), RoundedCornerShape(20.dp))
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Rounded.FastForward,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(16.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = "2.0×  快进中",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

/**
 * 进度条：轨道 + 已缓冲段 + 已播放段 + 旋钮。
 *
 * 用 Canvas 自己画而不是 Material 的 Slider：Slider 自带一圈内边距与圆点样式，
 * 在视频上看着很"应用"，而且没法直接画缓冲段。
 *
 * [seekable] 为假（总时长还不知道，例如直播流）时**只画轨道**、也不吃手势：那种时候
 * 按 `positionMs / max(duration, 1)` 算出来的进度毫无意义（位置一涨整条就"满了"），
 * 拖了也 seek 不到地方。
 */
@Composable
private fun SeekBar(
    modifier: Modifier = Modifier,
    positionMs: Long,
    bufferedMs: Long,
    durationMs: Long,
    seekable: Boolean = true,
    onScrub: (Long) -> Unit,
    onCommit: (Long) -> Unit
) {
    val total = durationMs.coerceAtLeast(1L)
    var widthPx by remember { mutableFloatStateOf(1f) }
    // 拖动过程中最后一次落点：`onDragEnd` 拿不到位置，只能记下来（早先写成
    // `posOf(0f)` —— 一松手就跳回 0，是个真 bug）
    var lastX by remember { mutableFloatStateOf(0f) }

    fun posOf(x: Float): Long =
        ((x / widthPx).coerceIn(0f, 1f) * total).toLong()

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(30.dp)
            .then(
                if (!seekable) {
                    Modifier
                } else {
                    Modifier
                        .pointerInput(total) {
                            detectDragGestures(
                                onDragStart = { offset ->
                                    widthPx = size.width.toFloat()
                                    lastX = offset.x
                                    onScrub(posOf(offset.x))
                                },
                                onDrag = { change, _ ->
                                    change.consume()
                                    lastX = change.position.x
                                    onScrub(posOf(lastX))
                                },
                                onDragEnd = { onCommit(posOf(lastX)) }
                            )
                        }
                        .pointerInput(total) {
                            widthPx = size.width.toFloat()
                            detectTapGestures { offset -> onCommit(posOf(offset.x)) }
                        }
                }
            ),
        contentAlignment = Alignment.CenterStart
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            widthPx = size.width
            val h = size.height
            val cy = h / 2f
            val trackH = 4.dp.toPx()
            val knobR = 6.5f.dp.toPx()

            drawLine(
                Color(0x59FFFFFF), Offset(0f, cy), Offset(size.width, cy),
                strokeWidth = trackH, cap = StrokeCap.Round
            )
            if (!seekable) return@Canvas

            val played = (positionMs.toFloat() / total).coerceIn(0f, 1f) * size.width
            val buffered = (bufferedMs.toFloat() / total).coerceIn(0f, 1f) * size.width

            drawLine(
                Color(0x8CFFFFFF), Offset(0f, cy), Offset(buffered, cy),
                strokeWidth = trackH, cap = StrokeCap.Round
            )
            drawLine(
                Color(0xFF6FB4FF), Offset(0f, cy), Offset(played, cy),
                strokeWidth = trackH, cap = StrokeCap.Round
            )
            drawCircle(Color.White, knobR, Offset(played, cy))
        }
    }
}
