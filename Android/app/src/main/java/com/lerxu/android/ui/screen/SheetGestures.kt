package com.lerxu.android.ui.screen

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp



/**
 * 下滑关闭的**距离**阈值：手指往下带出这么多，松手才认作"要关掉弹窗"。
 *
 * material3 的默认是 `56.dp`（见 `BottomSheetDefaults.PositionalThreshold`）—— 那几乎是
 * "蹭一下就关"。这里抬到 120dp：正常翻列表带出的那点位移根本不到，而真心想关的人往下
 * 拽一截就够。
 */
private val SheetDismissDrag = 120.dp

/**
 * 下滑关闭的**速度**阈值：往下甩得比这个快，就算位移没到 [SheetDismissDrag] 也关。
 *
 * material3 的默认只有 `125.dp/s`（见 `BottomSheetDefaults.VelocityThreshold`），
 * 而列表滚到顶之后剩给弹窗的那点残余惯性轻易就超过它 —— 用户点名的"向下滑动老误触"
 * 主要就是这一档太低造成的。抬到 600dp/s 之后，得是**明确的一甩**才算。
 */
private val SheetDismissFling = 600.dp

/**
 * 设置 / 历史两张弹窗共用的**底部弹窗状态**：`sheetGesturesEnabled` 一直开着（能下滑关闭），
 * 但把 material3 那两档阈值抬到"不会误触"的高度。
 *
 * 为什么要有这么一个共用函数（用户前后两句话合起来的要求）：
 * - "向下滑动时老是容易误触到弹窗的向下滑动" —— 不能让它一点就关；
 * - "应该可以通过向下滑动弹窗来关闭，只是要让它不会轻易的被误触" —— 又必须关得掉。
 *
 * 两句话只差在阈值上，所以阈值收到这一处、两张弹窗共用，别再各写一份
 *（早先它们就是各写各的：历史那张关掉了手势、设置那张没跟上，成了"设置弹窗还是无法
 * 通过下移关闭"—— 用户点名）。
 *
 * 实现上直接构造 [SheetState] 而不是 `rememberModalBottomSheetState(...)`：
 * 后者不暴露这两个数（内部的 `rememberSheetState` 是 internal），而 [SheetState]
 * 的构造参数里它们是公开的。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun rememberSheetStateFirmDismiss(): SheetState {
    val density = LocalDensity.current
    return remember(density) {
        SheetState(
            skipPartiallyExpanded = true,
            positionalThreshold = { with(density) { SheetDismissDrag.toPx() } },
            velocityThreshold = { with(density) { SheetDismissFling.toPx() } }
        )
    }
}

/**
 * 底部弹窗的 `contentWindowInsets`：**只让开顶部，底部一律不让**。
 *
 * 为什么（用户点名："设置弹窗和历史记录弹窗内容无法显示到底部小横条区域"）：
 * material3 把 `contentWindowInsets` 用 `Modifier.windowInsetsPadding` 加在
 * **Surface 内部**那个 Column 上 —— 默认值 `safeDrawing` 于是把**手势条那一整条**
 * 当成内容的内边距。结果就是：面板底色铺到了屏幕底，但内容被整体抬高一截，
 * 最下面永远留一条**画不出东西的空带**。
 *
 * 让开底部之后，内容（列表）能一路画进手势条区域（滚动时从它下面穿过），
 * 而那一段该留的呼吸由各自内容自己加 —— 用 [sheetBottomGap]，**别指望这里**。
 *
 * 顶部**必须留着**：这两张弹窗都铺满整屏，不留的话标题行会被状态栏/挖孔压住。
 */
@Composable
internal fun sheetContentInsets(): WindowInsets =
    WindowInsets.safeDrawing.only(WindowInsetsSides.Top)

/**
 * 底部弹窗**内容**末尾要留的那一段高度 = 手势条 + [extra]。
 *
 * 配合 [sheetContentInsets] 使用：insets 那边不再替内容让开手势条了，所以"最后一行不该
 * 压在手势条底下"这件事得由内容自己保证（列表的 `contentPadding` / 末尾的 Spacer）。
 * 留的是**手势条 + extra**，而不是整块空白 —— 滚动中内容会从手势条下面穿过去。
 */
@Composable
internal fun sheetBottomGap(extra: Dp = 0.dp): Dp =
    WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + extra
