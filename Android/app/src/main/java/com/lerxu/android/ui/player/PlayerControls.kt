package com.lerxu.android.ui.player

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
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemGestures
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.FastForward
import androidx.compose.material.icons.rounded.FastRewind
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.FullscreenExit
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull

/**
 * 播放器的**控件层**（Compose）：一块正好盖在视频上的透明视图，上面是压暗条 + 图标 +
 * 进度条，底下什么都不铺 —— 视频本身是覆盖层里另一个原生 View（TextureView 合成），
 * 就在这块 Compose 视图的下面，所以这里不能画任何不透明底。
 *
 * 控件形态沿用用户点名的口径：**没有底板**，靠下方一条贴边渐变"托"起图标，唤出时上方
 * 同时压暗一条；上排只有播放/暂停（左）与全屏（右）+ 右上角设置；下排是「当前进度 |
 * 进度条 | 总时长」，两枚图标的**外沿**与下排进度显示的外沿对齐。
 *
 * 手势：点任意处切换显隐；双击左右半屏 ∓10s；长按 2 倍速。
 */
@OptIn(UnstableApi::class, ExperimentalMaterial3Api::class)
@Composable
fun PlayerControls(
    ui: PlayerUi,
    onClose: () -> Unit,
    onToggleFullscreen: () -> Unit,
    /** 全屏态下"切换横竖屏"（右下角那枚）：只转屏，不退出全屏。 */
    onToggleOrientation: () -> Unit,
    onFit: (FitMode) -> Unit,
    onKeepOn: (Boolean) -> Unit
) {
    val player = ui.player

    // 播放中闲置 3s 自动收起控件（暂停时一直留着）
    LaunchedEffect(ui.controlsVisible, ui.playing) {
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

    if (!ui.open || !ui.visible && !ui.fullscreen) return
    // 标签网格展开时播放器正"缩进卡片"：这一段不画控件、也不吃触摸
    if (ui.gridOpen && !ui.fullscreen) return

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
                // 视频区域的手势：单击切换控件、双击左右半屏跳转、长按 2 倍速
                .pointerInput(Unit) {
                    detectTapGestures(
                        onTap = { ui.controlsVisible = !ui.controlsVisible },
                        onDoubleTap = { offset ->
                            val left = offset.x < size.width / 2f
                            seekBy(if (left) -10_000L else 10_000L)
                            // 左右各对应一侧的跳动提示：方向 + 令牌（连点两次也重播动画）
                            ui.seekFlashDir = if (left) -1 else 1
                            ui.seekFlashToken++
                            ui.controlsVisible = true
                        },
                        onLongPress = null,
                        // 长按 = **按住期间** 2 倍速，松手还原。
                        // 用 onPress + tryAwaitRelease，而不是 onLongPress：后者只报"按下了"、
                        // 没有"松手"那一下，做不出"按住才加速"
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

            // ── 控件层：上方压暗条 + 下方压暗条 + 底部控制行（都没有底板）──
            if (ui.controlsVisible) {
                // 没跟上网页位置时亮一行小字：不然"播放器不在网页那个位置上"是无声的，
                // 用户只看到"它固定在顶上"，原因却看不到（调试期用，见 PLAYER_BUILD）
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
                // 顶部一行：全屏时左上是**退出全屏**（一枚向左的箭头，用户点名）、右上是设置；
                // 窗口态左上什么都不放，只有右上那枚设置。
                // **刻意不显示网页名**（用户点名）：那是页面自己的事，播放器上挂着站点名既挤又没用。
                //
                // 设置**一直在右上角**（用户点名："它不应该仍然保持在右侧吗"）—— 之前全屏时
                // 把设置摆到了左上、退出全屏摆到了右上，正好反了。
                Row(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .fillMaxWidth()
                        .padding(start = 6.dp, end = 6.dp, top = 6.dp),
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
                    PlayerIconButton(Icons.Rounded.Settings, "设置", size = 22.dp) {
                        ui.settingsOpen = true
                    }
                }
                // 底部：窗口态是「按钮在上、进度在下」；**全屏态反过来**（用户点名："全屏后
                // 应该变为进度显示在控制按钮的上方，控制按钮在下方"）。
                //
                // 全屏还要把整列**抬出系统手势区**：全屏是沉浸式（系统栏藏了、内容铺到最下沿），
                // 而最下沿那条"上滑回桌面"的区域仍在系统手里 —— 贴在它里面的按钮手势会被系统
                // 先吃掉，点上去**没反应**（用户点名的那条）。窗口态系统栏在，按常规间距摆。
                val gestureBottom = with(LocalDensity.current) {
                    WindowInsets.systemGestures.getBottom(this).toDp()
                }
                val bottomPad = if (ui.fullscreen) maxOf(28.dp, gestureBottom + 6.dp) else 10.dp
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(start = 14.dp, end = 14.dp, bottom = bottomPad)
                ) {
                    if (ui.fullscreen) {
                        PlayerSeekRow(ui, player)
                        PlayerButtonsRow(ui, player, onToggleFullscreen, onToggleOrientation)
                    } else {
                        PlayerButtonsRow(ui, player, onToggleFullscreen, onToggleOrientation)
                        PlayerSeekRow(ui, player)
                    }
                }
            }
        }

    }

    if (ui.settingsOpen) {
        PlayerSettingsSheet(
            speed = ui.baseSpeed,
            onSpeed = { ui.baseSpeed = it },
            fit = ui.fit,
            onFit = {
                ui.fit = it
                onFit(it)
            },
            loop = ui.loop,
            onLoop = {
                ui.loop = it
                player?.repeatMode = if (it) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            },
            keepOn = ui.keepOn,
            onClosePlayer = {
                ui.settingsOpen = false
                onClose()
            },
            onKeepOn = {
                ui.keepOn = it
                onKeepOn(it)
            },
            following = ui.following,
            onDismiss = { ui.settingsOpen = false },
            fullscreen = ui.fullscreen
        )
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
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
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
            onScrub = { ui.scrubbing = true; ui.positionMs = it },
            onCommit = {
                ui.scrubbing = false
                player?.seekTo(it)
                ui.controlsVisible = true
            }
        )
        Text(
            ui.fmt(ui.durationMs),
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
 */
@Composable
private fun SeekBar(
    modifier: Modifier = Modifier,
    positionMs: Long,
    bufferedMs: Long,
    durationMs: Long,
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
            },
        contentAlignment = Alignment.CenterStart
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            widthPx = size.width
            val h = size.height
            val cy = h / 2f
            val trackH = 4.dp.toPx()
            val knobR = 6.5f.dp.toPx()

            val played = (positionMs.toFloat() / total).coerceIn(0f, 1f) * size.width
            val buffered = (bufferedMs.toFloat() / total).coerceIn(0f, 1f) * size.width

            drawLine(
                Color(0x59FFFFFF), Offset(0f, cy), Offset(size.width, cy),
                strokeWidth = trackH, cap = StrokeCap.Round
            )
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

/**
 * 播放设置（右上角齿轮点开的底部弹窗）。
 *
 * 只放**与观看直接相关**、且 ExoPlayer 原生支持的几项：倍速、画面比例、循环播放、
 * 屏幕常亮。刻意不做"解码方式 / 渲染后端"那类开关 —— 在 Android 上它们要么没有
 * 稳定入口，要么改错了直接黑屏。
 *
 * 也刻意**没有**"进入播放器自动横屏"：用户点名进播放器不该自动全屏，横屏这件事
 * 只由画面右上角那枚全屏按钮决定。
 */
@OptIn(ExperimentalMaterial3Api::class, UnstableApi::class)
@Composable
private fun PlayerSettingsSheet(
    speed: Float,
    onSpeed: (Float) -> Unit,
    fit: FitMode,
    onFit: (FitMode) -> Unit,
    loop: Boolean,
    onLoop: (Boolean) -> Unit,
    keepOn: Boolean,
    onKeepOn: (Boolean) -> Unit,
    following: Boolean,
    onDismiss: () -> Unit,
    onClosePlayer: () -> Unit,
    /** 全屏态：设置做成**贴右侧的面板**（底部弹窗在全屏里会把画面下缘整条盖住）。 */
    fullscreen: Boolean = false
) {
    // 容器分两种，**内容完全相同**（所以只换容器、不动里面那一段）：
    // - 全屏 → 贴右、整高、可滚的侧面板 + 遮罩
    // - 窗口 → 从底部升起的面板（手机习惯）
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = if (fullscreen) Alignment.CenterEnd else Alignment.BottomCenter
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0x99000000))
                .clickable { onDismiss() }
        )
        Column(
            modifier = Modifier
                .then(
                    if (fullscreen) {
                        Modifier
                            .fillMaxHeight()
                            .width(300.dp)
                            .background(Color(0xFF14161B))
                            .verticalScroll(rememberScrollState())
                            .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 24.dp)
                    } else {
                        Modifier
                            .fillMaxWidth()
                            .background(
                                Color(0xFF14161B),
                                RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
                            )
                            .padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 24.dp)
                    }
                )
        ) {
            Text("播放设置", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(Modifier.height(18.dp))

            SettingsLabel("播放速度")
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f).forEach { s ->
                    FilterChip(
                        selected = speed == s,
                        onClick = { onSpeed(s) },
                        label = { Text(if (s == 1f) "1.0x" else "${s}x") }
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            SettingsLabel("画面比例")
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FitMode.values().forEach { m ->
                    FilterChip(
                        selected = fit == m,
                        onClick = { onFit(m) },
                        label = { Text(m.label) }
                    )
                }
            }
            Spacer(Modifier.height(8.dp))

            SettingsSwitch("循环播放", loop, onLoop)
            SettingsSwitch("屏幕常亮", keepOn, onKeepOn)
            Spacer(Modifier.height(6.dp))
            // 关播放器：窗口态左上角那枚关闭按钮已经撤掉（用户点名），出口挪到这里
            SettingsAction("关闭播放器", onClosePlayer)
            Spacer(Modifier.height(10.dp))
            // 构建标记：调试期用来确认"装的是哪一版"（versionName 每版都一样）
            Text(
                text = PLAYER_BUILD + if (following) " · 已跟随网页" else " · 未同步位置",
                fontSize = 11.sp,
                color = Color(0xFF8B95A3)
            )
        }
    }
}

/** 设置分组的小标题。 */
@Composable
private fun SettingsLabel(text: String) {
    Text(
        text,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        color = Color(0xFF8B95A3),
        modifier = Modifier.padding(bottom = 6.dp)
    )
}

/** 一行动作：左标题、右一枚">"，整行可点（与 [SettingsSwitch] 同一套排版）。 */
@Composable
private fun SettingsAction(label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .pointerInput(Unit) { detectTapGestures { onClick() } }
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 14.sp)
        Icon(
            Icons.AutoMirrored.Rounded.KeyboardArrowRight,
            contentDescription = null,
            tint = androidx.compose.material3.LocalContentColor.current.copy(alpha = 0.6f)
        )
    }
}

/** 一行开关：左标题、右开关，整行可点。 */
@Composable
private fun SettingsSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .pointerInput(Unit) { detectTapGestures { onChange(!checked) } }
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 14.sp)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
