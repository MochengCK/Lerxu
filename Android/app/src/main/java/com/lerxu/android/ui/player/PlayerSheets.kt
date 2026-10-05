package com.lerxu.android.ui.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import com.lerxu.android.ui.formatBytes

/**
 * 弹窗进出场的时长（ms）：面板的滑动、遮罩的淡入淡出共用同一条时间线。
 *
 * 覆盖层那边也读它（收起时多留这一拍再整层摘掉，见 NativePlayerOverlay 的
 * `hideSheetLayer`）—— 两处必须是同一个数，否则要么动画被截断、要么空等一段。
 */
internal const val SHEET_ANIM_MS = 220

/**
 * 贴右整高那一档的**面板宽度**，也是全屏时**画面要让出的那条**宽度。
 *
 * 这一个数两处共用（面板画多宽、画面让多少）：写在两处的话，改了一处忘了另一处，
 * 就会出现"画面被压到面板底下"或者"多让出一截黑边"。
 * 覆盖层那边换算成 px 用它（见 NativePlayerOverlay 的 `syncSideInset`）。
 */
internal val SIDE_SHEET_WIDTH = 300.dp

/** 倍速那一行 1.0x 右侧那枚小标签的文案（只有**原始那一档**挂它）。 */
private const val NORMAL_BADGE = "正常"

/*
 * 播放器的两张弹窗：**播放设置**与**M3U8 下载**。
 *
 * 它们与 [PlayerControls] 分开、各自挂在覆盖层里**整窗口**的那一层上（见
 * NativePlayerOverlay 的 `sheetView`）：控件层只占视频那一块，弹窗放它里面会被
 * 限制在播放器内（用户点名"为什么被限制在播放器内"）。放在整窗口那一层之后，
 * 窗口态是贴屏幕底的面板、全屏态是贴右侧的面板，两者都不再受视频矩形约束。
 *
 * 内容颜色一律取 `MaterialTheme`：覆盖层把这两张弹窗包在 `LerxuTheme(darkTheme = true)`
 * 里（播放器本身就是深色 UI），所以芯片 / 开关 / 文字都拿到深色那一套 —— 以前这里
 * 是裸的 Compose 视图（没套主题），芯片与开关一直用 Material 的默认浅色，
 * 压在深色面板上就是"没适配深色"（用户点名）。
 */

/**
 * 弹窗形态的那**一个**判据（两张弹窗共用）：**全屏 + 横屏**才贴右整高。
 *
 * 用户订正过两次：先是"全屏后点下载应该一样是右侧弹窗，而不是底部弹窗"（那时看的是横屏），
 * 后来"全屏竖屏下载视频弹窗和播放器设置弹窗应该变为底部弹窗" —— 竖屏屏窄，300dp 的侧栏
 * 会把整屏盖掉大半。所以**别再用 `ui.fullscreen` 一个布尔决定形态**，也别在两处各写一遍。
 */
private fun sideSheetOf(ui: PlayerUi): Boolean = ui.fullscreen && !ui.fullscreenPortrait

/**
 * 两张弹窗**共用的壳**：遮罩、面板、进出场动画、以及"贴右整高 / 贴底整宽"这套几何。
 *
 * 为什么要抽出来（用户点名："全屏后点下载应该一样是右侧弹窗，而不是底部弹窗" —— 那一次是
 * 横屏）：这两张弹窗的壳本来就该是同一套 —— 之前下载那张自己写了一份"永远贴底"的壳，
 * 于是两者形态不一致。抽成一处之后，形态由 [sideSheet] 一个开关决定，想不齐都难。
 *
 * 几何（由 [sideSheet] 决定，**不是**由"是不是全屏"决定 —— 用户后来订正：
 * "全屏竖屏下载视频弹窗和播放器设置弹窗应该变为底部弹窗"）：
 * - **[sideSheet]（全屏 + 横屏）**：贴右、整高、300dp 宽、方角、内容可滚 ——
 *   横屏时右侧那条竖边是宽出来的一块，面板摆在那儿不挡画面主体；
 * - **其余（全屏竖屏 / 窗口态）**：贴底、整宽、上圆角、让出导航条与输入法 ——
 *   竖屏屏窄，300dp 的侧栏会把整屏盖掉大半，而竖屏画面本来就是中间一条带，
 *   底部弹窗只压到黑边与下缘。
 *
 * 面板本体包在 [AnimatedVisibility] 里：滑进滑出 + 淡。它必须**一直在组合里**
 * （开关只改 visible），收起的动画才有宿主可跑 —— 早先这里是 `if (ui.settingsOpen)`
 * 直接增删整棵子树，那就是"啪"地跳出来又"啪"地消失（用户点名）。收起时覆盖层那边
 * 会多留一小拍再整层摘掉（见 NativePlayerOverlay 的 `SHEET_ANIM_MS`）。
 */
@Composable
private fun PlayerSheet(
    visible: Boolean,
    /** 贴右整高那一档（全屏 + 横屏）；否则贴底整宽。见上文。 */
    sideSheet: Boolean,
    /**
     * 面板外要不要压一层黑。
     *
     * **只在窗口态要**（用户点名"打开播放设置弹窗时的遮罩效果应该删掉，只在全屏状态下"）——
     * 全屏下弹窗开着，画面已经**让开**了它（见 NativePlayerOverlay 的 `syncSheetInset`），
     * 底下那片画面本来就是可看的；再压一层 60% 的黑，等于把刚让出来的画面又弄暗，而面板
     * 自己那点宽度根本压不住画面 —— 视觉上只是"整屏发暗"，读不出"弹窗开着"。
     *
     * **注意判据是 `fullscreen` 而不是 [sideSheet]**：竖屏那档也是全屏、也要让位（让的是
     * 底边），所以也不能有遮罩。早先挂在 `sideSheet` 上，竖屏就漏了（用户点名
     * "竖屏状态下还有遮罩"）。
     */
    dimOutside: Boolean,
    onDismiss: () -> Unit,
    /**
     * 钉在面板**最底部**的那一块（目前只有下载弹窗用：那枚「下载」按钮）。
     *
     * 为什么要单独开一个槽位（用户点名："全屏状态下，右侧弹窗状态下的下载按钮应该在弹窗
     * 的最底部"）：贴右的那张面板是**整高**的，按钮如果跟着内容排，就会挂在半空、下面空出
     * 一大片。给一条 footer 之后，它自己滚（`weight(1f)`），按钮永远压在面板下沿；
     * 贴底那一档两张弹窗都矮，footer 直接接在内容后面，与原来一模一样。
     */
    footer: (@Composable () -> Unit)? = null,
    /**
     * 面板**实测尺寸**回报给覆盖层（px）。
     *
     * 覆盖层拿它做"画面让位"：贴右那档宽度是固定的（[SIDE_SHEET_WIDTH]），贴底那档的高度
     * 是**内容决定的**（设置弹窗和下载弹窗差很多，下载那张还要给键盘留位置），所以只能
     * 让面板自己报 —— 猜一个常数就会和面板对不上（用户点名"为什么竖屏状态下不会避让"：
     * 竖屏那档是贴底整宽，让位必须从**底部**减，而减多少只有面板自己知道）。
     */
    onPanelSize: (widthPx: Int, heightPx: Int) -> Unit = { _, _ -> },
    content: @Composable ColumnScope.() -> Unit
) {
    val panelSpec = tween<IntOffset>(SHEET_ANIM_MS, easing = FastOutSlowInEasing)
    val fadeSpec = tween<Float>(SHEET_ANIM_MS, easing = FastOutSlowInEasing)
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = if (sideSheet) Alignment.CenterEnd else Alignment.BottomCenter
    ) {
        // 遮罩只在**窗口态**画（全屏一律不画，判据见 `dimOutside`）。
        //
        // 关键是判据必须是 `fullscreen` 而不是 `sideSheet`：竖屏那档也是全屏、也要让位
        //（让的是底边），挂在 `sideSheet` 上竖屏就漏了（用户点名"竖屏状态下还有遮罩"）。
        //
        // 但**点击区必须留着**：它是"点面板外关掉弹窗"唯一的命中区（返回键只覆盖硬件返回，
        // 点外面这条是这个交互的另一半）。所以只把颜色换成透明，`clickable` 与淡入淡出都不动。

        AnimatedVisibility(visible = visible, enter = fadeIn(fadeSpec), exit = fadeOut(fadeSpec)) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(if (dimOutside) Color(0x99000000) else Color.Transparent)
                    .clickable { onDismiss() }
            )
        }
        // 面板用 Surface 承载，而不是给 Column 加 `.background()`：Surface 会顺手把
        // `LocalContentColor` 设成这片底色的正文色。少了它，没显式给 `color` 的 Text
        // 会落到 Compose 的默认正文色（黑）上 —— 压在深色面板上就等于"没适配深色"（用户点名）
        AnimatedVisibility(
            visible = visible,
            enter = if (sideSheet) {
                slideInHorizontally(panelSpec) { it } + fadeIn(fadeSpec)
            } else {
                slideInVertically(panelSpec) { it } + fadeIn(fadeSpec)
            },
            exit = if (sideSheet) {
                slideOutHorizontally(panelSpec) { it } + fadeOut(fadeSpec)
            } else {
                slideOutVertically(panelSpec) { it } + fadeOut(fadeSpec)
            }
        ) {
            // 背景：**纯色**（面板左缘是一道硬边）。
            //
            // 早先试过"向左淡出的渐变"，看着像溶进画面，实际是错的：弹窗一动，画面就在
            // 面板底下**换位置换大小**（见 NativePlayerOverlay 的 `syncSideInset`），
            // 半透明的面板压在一块正在重排的画面上，两层半透明叠出脏边 —— 比纯色更糟。
            // 现在改成"容器让位"：面板占哪一档，画面就避开哪一档，两者互不重叠。
            val base = MaterialTheme.colorScheme.surfaceContainerHigh
            val panelModifier = if (sideSheet) {
                Modifier
                    .fillMaxHeight()
                    .width(SIDE_SHEET_WIDTH)
            } else {
                Modifier.fillMaxWidth()
            }
            Surface(
                modifier = panelModifier.onSizeChanged { onPanelSize(it.width, it.height) },
                // `contentColor` 交给 Surface 自己按底色推导（`contentColorFor`）：显式写死
                // 成底色那个值会让文字跟背景同色。
                color = base,
                shape = if (sideSheet) RectangleShape else {
                    RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
                }
            ) {
                if (sideSheet) {
                    // 贴右整高：面板铺满高 —— 内容自己滚（weight），footer 永远压在面板下沿
                    Column(modifier = Modifier.fillMaxSize()) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .verticalScroll(rememberScrollState())
                                .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 12.dp),
                            content = content
                        )
                        if (footer != null) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 24.dp)
                            ) {
                                footer()
                            }
                        }
                    }
                } else {
                    Column(
                        modifier = Modifier
                            // 下载那张里有输入框：键盘抬起时整块面板跟着升上去
                            .imePadding()
                            .navigationBarsPadding()
                            .padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 20.dp)
                    ) {
                        content()
                        footer?.invoke()
                    }
                }
            }
        }
    }
}

/**
 * 播放设置（右上角齿轮点开的弹窗）。
 *
 * 只放**与观看直接相关**、且 ExoPlayer 原生支持的几项：倍速、画面比例、循环播放、
 * 屏幕常亮。刻意不做"解码方式 / 渲染后端"那类开关 —— 在 Android 上它们要么没有
 * 稳定入口，要么改错了直接黑屏。
 *
 * 也刻意**没有**"进入播放器自动横屏"：用户点名进播放器不该自动全屏，横屏这件事
 * 只由画面右上角那枚全屏按钮决定。
 */
@OptIn(UnstableApi::class)
@Composable
internal fun PlayerSettingsSheet(
    ui: PlayerUi,
    /** 这一张弹窗此刻该不该在场上（收起时还要留着把退场动画跑完，见下）。 */
    visible: Boolean,
    player: ExoPlayer?,
    onFit: (FitMode) -> Unit,
    onKeepOn: (Boolean) -> Unit,
    onClosePlayer: () -> Unit,
    onDismiss: () -> Unit,
    /** 面板实测尺寸回报给覆盖层做让位（见 [PlayerSheet] 的 `onPanelSize`）。 */
    onPanelSize: (widthPx: Int, heightPx: Int) -> Unit = { _, _ -> }
) {
    // 形态由 [sideSheetOf] 一处判：全屏横屏贴右整高，全屏竖屏与窗口态一样贴底（用户点名）
    PlayerSheet(
        visible = visible,
        sideSheet = sideSheetOf(ui),
        // 遮罩只跟"是不是全屏"有关，与形态无关（竖屏贴底那档也不遮，见 `dimOutside`）
        dimOutside = !ui.fullscreen,
        onDismiss = onDismiss,
        onPanelSize = onPanelSize
    ) {
        Text("播放设置", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Spacer(Modifier.height(18.dp))

        SettingsLabel("播放速度")
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f).forEach { s ->
                PlayerOptionChip(
                    label = if (s == 1f) "1.0x" else "${s}x",
                    selected = ui.baseSpeed == s,
                    // 「正常」挂在 1 倍速这一档：一排数字里用户不用猜"哪一档是原速"
                    badge = if (s == 1f) NORMAL_BADGE else null,
                    onClick = { ui.baseSpeed = s }
                )
            }
        }
        Spacer(Modifier.height(16.dp))

        SettingsLabel("画面比例")
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            FitMode.values().forEach { m ->
                // 这一排**不挂标签**（用户点名）：三档的名字本身就是"适应 / 裁剪 / 铺满"，
                // 谁是默认那档读一眼设置里的顺序就知道，再挂一枚"正常"反而是噪音
                PlayerOptionChip(
                    label = m.label,
                    selected = ui.fit == m,
                    onClick = {
                        ui.fit = m
                        onFit(m)
                    }
                )
            }
        }
        Spacer(Modifier.height(8.dp))

        SettingsSwitch("循环播放", ui.loop) {
            ui.loop = it
            player?.repeatMode = if (it) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        }
        SettingsSwitch("屏幕常亮", ui.keepOn) {
            ui.keepOn = it
            onKeepOn(it)
        }
        Spacer(Modifier.height(6.dp))
        // 关播放器：窗口态左上角那枚关闭按钮已经撤掉（用户点名），出口挪到这里
        SettingsAction("关闭播放器", onClosePlayer)
    }
}

/**
 * M3U8 下载弹窗（播放 M3U8 时右上角那枚下载图标点开）。
 *
 * 内容就三样（用户口径）：**文件信息**（图标 + 名称 + 大小）、最底部一枚**下载**按钮。
 * 大小是探测出来的**估算值**（见 `HlsProbe`），所以带一个"约"字；探不出来就显示
 * "未知"，不假装知道。
 *
 * 文件名那一块按用户点名的版式：**左侧一枚文件图标**（见 [LerxuFile]），右侧**上为
 * 「名称 + 改名按钮」、下为大小** —— 铅笔贴在**第一行（文件名）的最右**，不再像早先
 * 那样挂在整块的右边、看着横跨两行；名称默认是**纯文字**（不是输入框），点铅笔才进入
 * 编辑。"看一眼要下的是哪个片子、多大"因此是最省事的一屏，改名的动作收在铅笔后面。
 *
 * 壳走与设置弹窗**同一个** [PlayerSheet]：全屏**横屏**下它是一张贴右整高的面板，而
 * **下载按钮由 footer 钉在面板最下沿**（用户点名）；全屏竖屏与窗口态都贴底（见 [sideSheetOf]）。
 */
@Composable
internal fun PlayerDownloadSheet(
    ui: PlayerUi,
    /** 同设置弹窗：收起时留着把退场动画跑完（见 [PlayerSettingsSheet] 的说明）。 */
    visible: Boolean,
    onDismiss: () -> Unit,
    onPanelSize: (widthPx: Int, heightPx: Int) -> Unit = { _, _ -> },
    onConfirm: (String) -> Unit
) {
    // 改名中：名称那一行从纯文字切成输入框，铅笔变对勾
    var editing by remember { mutableStateOf(false) }
    val nameFocus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    // 每次进入编辑都重新要焦点：`editing` 由点铅笔翻真，翻真之后这一拍把光标送进去
    LaunchedEffect(editing) {
        if (editing) nameFocus.requestFocus()
    }
    // 弹窗收起时把编辑态一并复位：下一次打开又该是"看一眼就能按下载"的那一屏
    LaunchedEffect(visible) {
        if (!visible) editing = false
    }
    fun finishEditing() {
        editing = false
        focusManager.clearFocus()
        keyboard?.hide()
    }

    PlayerSheet(
        visible = visible,
        // 与设置弹窗同一个判据：全屏竖屏时它也贴底（用户点名）
        sideSheet = sideSheetOf(ui),
        // 与设置弹窗同一口径：遮罩只看是不是全屏
        dimOutside = !ui.fullscreen,
        onDismiss = onDismiss,
        onPanelSize = onPanelSize,
        footer = {
            Button(
                onClick = {
                    finishEditing()
                    onConfirm(ui.downloadName)
                },
                enabled = ui.downloadName.isNotBlank(),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp)
            ) {
                Icon(Icons.Rounded.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("下载", fontSize = 15.sp, fontWeight = FontWeight.Medium)
            }
        }
    ) {
        Text("下载视频", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Spacer(Modifier.height(16.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            // **文件图标**（用户点名两条：换成文件图标、再"放大"一档）。34dp 与右侧
            // 那两行文字（名称 + 大小）等高，一眼就能认出"要下的是个视频文件"
            Icon(
                LerxuFile,
                contentDescription = null,
                modifier = Modifier.size(34.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                // 第一行 = 「文件名 + 改名按钮」：**按钮贴在这一行的最右**（用户点名：
                // "编辑文件名称按钮应该是在第一行文件名称的最右侧，而不是连占两行"）。
                // 早先它挂在整块（名称 + 大小）的右边、纵向居中，看着就是横跨两行的
                // 一个独立控件；第二行（大小）因此整行都留给文字。
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (editing) {
                        BasicTextField(
                            value = ui.downloadName,
                            onValueChange = { ui.downloadName = it },
                            singleLine = true,
                            textStyle = TextStyle(
                                color = MaterialTheme.colorScheme.onSurface,
                                fontSize = 15.sp
                            ),
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Text,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(onDone = { finishEditing() }),
                            modifier = Modifier
                                .weight(1f)
                                .focusRequester(nameFocus)
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(horizontal = 10.dp, vertical = 7.dp)
                        )
                    } else {
                        // 默认就是一行**纯文字**：不套输入框、不带底色（用户点名）
                        Text(
                            text = ui.downloadName.ifBlank { "未命名" },
                            fontSize = 15.sp,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Spacer(Modifier.width(4.dp))
                    IconButton(
                        onClick = { if (editing) finishEditing() else editing = true },
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(
                            imageVector = if (editing) Icons.Rounded.Check else Icons.Rounded.Edit,
                            contentDescription = if (editing) "完成" else "编辑文件名",
                            modifier = Modifier.size(18.dp),
                            tint = if (editing) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    text = downloadSizeText(ui),
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        // 下载按钮在 footer（见 [PlayerSheet]）：窗口态接在下面，全屏态钉在面板最下沿
        Spacer(Modifier.height(18.dp))
    }
}

/** 弹窗里那行大小：探测中 / 约多少 / 未知。 */
private fun downloadSizeText(ui: PlayerUi): String = when {
    ui.downloadProbing -> "正在计算…"
    ui.downloadSize > 0L -> "约 " + formatBytes(ui.downloadSize)
    else -> "未知"
}

/** 设置分组的小标题（也可当弹窗里一个字段的标题）。 */
@Composable
private fun SettingsLabel(text: String) {
    Text(
        text,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 6.dp)
    )
}

/** 一行动作：左标题、右一枚">"，整行可点（与 [SettingsSwitch] 同一套排版）。 */
@Composable
private fun SettingsAction(label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 14.sp)
        Icon(
            Icons.AutoMirrored.Rounded.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/** 一行开关：左标题、右开关，整行可点。 */
@Composable
private fun SettingsSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onChange(!checked) }
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 14.sp)
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            // 关闭态的配色必须自己给：Material 默认把未选中的圆点画成 outline、底槽画成
            // surfaceVariant，而这张面板本来就是 surfaceContainerHigh —— 三者在深色下
            // 深浅太近，圆点直接和面板糊成一片（用户点名："圆点跟背景融为一体"）。
            // 这里把圆点提到 onSurfaceVariant（亮一档的灰）、底槽压到 surfaceContainerHighest
            // （比面板亮一档），圆点与底槽、底槽与面板两级都拉得开；默认那圈描边去掉。
            colors = SwitchDefaults.colors(
                uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
                uncheckedTrackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                uncheckedBorderColor = Color.Transparent
            )
        )
    }
}

/**
 * 设置里的一枚选项（倍速 / 画面比例）：**就是一枚文字按钮**。
 *
 * 用户点名的口径（两次强调）："只是文字高亮，不应该有边框，也不应该在一个容器内"。
 * 所以这里**没有底色、没有描边、没有芯片壳** —— 选中那一档只靠**文字变主色 + 加粗**
 * 表达，未选中的是次级文字色。一排看过去，"当前是哪一档"落在字色上，干净得只有字。
 *
 * 早先那版是 FilterChip（带描边）→ 改成一枚主色实心块（带底色）→ 现在两样都撤掉：
 * 实心块在一排里会立起几个色块，比描边还抢眼，而这一屏要的只是"哪一个是当前的"。
 *
 * 留下的只有 [Modifier.padding]：那是**点击区**，不是容器 —— 没有它相邻两档会挤在一起，
 * 手指按不准。视觉上没有任何东西被画出来。
 *
 * [badge] 不为空时在文字右侧挂一枚小标签（"正常"，见 [NormalBadge]）。
 */
@Composable
private fun PlayerOptionChip(
    label: String,
    selected: Boolean,
    badge: String? = null,
    onClick: () -> Unit
) {
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) scheme.primary else scheme.onSurfaceVariant
        )
        if (badge != null) {
            Spacer(Modifier.width(6.dp))
            NormalBadge(badge)
        }
    }
}

/**
 * 「正常」小标签：**只有文字 + 一圈描边**，一个标准长方形（用户点名）。
 *
 * 不是胶囊、也不是色块：早先是主色/前景色的实心圆角块，在一排纯文字里它比被标的那个
 * 选项还显眼 —— 标签是"补充说明"，不该抢主体的位置。描边取主色的半透明档，
 * 压在深色面板上是一道细线，不会糊成一块。
 *
 * **高度压到最紧**（用户点名："它的高度应该减少"）：字号 9.5sp、`lineHeight` 直接写死
 * 11sp（Material 的 bodySmall/labelSmall 行高都带 1.4 倍余量，那是给成段的文字用的，
 * 单行标签白顶出一截），上下不留纵向内边距，只靠那圈描边撑出边界 —— 整枚高约 13dp，
 * 与旁边的 "1.0x" 一个视觉档位。
 *
 * 圆角给 3dp（近乎直角）：用户要的是"标准长方形"，而那点极轻的圆角只是避免两条线
 * 在角落上叠出一个墨点。
 */
@Composable
private fun NormalBadge(text: String) {
    val scheme = MaterialTheme.colorScheme
    Text(
        text,
        modifier = Modifier
            .border(
                BorderStroke(1.dp, scheme.primary.copy(alpha = 0.45f)),
                RoundedCornerShape(3.dp)
            )
            .padding(horizontal = 4.dp),
        style = TextStyle(fontSize = 9.5.sp, lineHeight = 11.sp),
        fontWeight = FontWeight.Medium,
        color = scheme.primary
    )
}
