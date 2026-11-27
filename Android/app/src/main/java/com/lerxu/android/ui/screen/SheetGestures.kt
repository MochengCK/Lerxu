package com.lerxu.android.ui.screen

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
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
 * 在**弹窗外层**取状态栏高度。
 *
 * 不能在 [SheetPanel] 内部读 `WindowInsets`：ModalBottomSheet 会把自身当前的
 * 偏移量从子内容的 window insets 里扣掉（见 material3 的 `SheetWindowInsets`）。
 * 当弹窗已经停在"状态栏下方"时，内容再读到的状态栏 inset 就变成 0，
 * 于是面板又长高、弹窗继续往上爬 —— 这正是之前"弹窗慢慢上移直到全覆盖"的原因。
 * 在调用 ModalBottomSheet 之前取一次，传入 [SheetPanel] 使用。
 */
@Composable
internal fun rememberSheetTopGap(): Dp =
    WindowInsets.safeDrawing.asPaddingValues().calculateTopPadding()

/**
 * 设置类弹窗的统一内容面板。
 *
 * 用户口径：设置这类弹窗**顶部要留出系统状态栏的空间**，不要把状态栏一起盖住；
 * 任务详情也要用同一套形态，而不是半覆盖。
 *
 * 做法：用弹窗内容的最大高度减去 [topGap]（状态栏高度）作为面板高度。
 * 弹窗表面（Surface）的高度跟随后代内容，所以面板矮一截，弹窗顶部就会往下退一截，
 * 状态栏那一截自然露出来（背后是正常的弹窗遮罩）。高度一次算好、不做位移动画。
 */
@Composable
internal fun SheetPanel(
    topGap: Dp,
    content: @Composable ColumnScope.() -> Unit
) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val panelHeight = (maxHeight - topGap).coerceAtLeast(0.dp)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .height(panelHeight)
        ) {
            content()
        }
    }
}

/**
 * 底部弹窗**内容**末尾要留的那一段高度 = 手势条 + [extra]。
 *
 * 配合 [SheetPanel] 使用：弹窗不再替内容让开手势条了，所以"最后一行不该
 * 压在手势条底下"这件事得由内容自己保证（列表的 `contentPadding` / 末尾的 Spacer）。
 * 留的是**手势条 + extra**，而不是整块空白 —— 滚动中内容会从手势条下面穿过去。
 */
@Composable
internal fun sheetBottomGap(extra: Dp = 0.dp): Dp =
    WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + extra
