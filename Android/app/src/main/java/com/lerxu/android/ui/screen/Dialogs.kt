package com.lerxu.android.ui.screen

import android.graphics.drawable.ColorDrawable
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import com.lerxu.android.R
import kotlinx.coroutines.delay

/**
 * 通用确认对话框（底部悬浮样式：删除任务 / 清除记录 / 各类输入与选项列表）
 *
 * 布局：底部弹出、四周留白悬浮圆角面板；上方标题，下方副标题，
 * 最底部"取消 + 确认"两个等宽按钮。
 * confirmLabel 传 null 时隐藏按钮行（选项点击即生效的列表弹窗）。
 * 出现/消失动画与编辑模式的底部控制栏（SelectionBarOverlay）同策略：
 * 遮罩淡入淡出 + 面板自底部滑入/滑出；确认/取消先播退出动画再真正关闭。
 * 底部固定 48dp 悬浮留白，任何机型都不会被导航栏遮挡。
 */

@Composable
fun BottomConfirmDialog(
    title: String,
    subtitle: String? = null,
    confirmLabel: String?,
    confirmEnabled: Boolean = true,
    confirmContainerColor: Color = MaterialTheme.colorScheme.error,
    confirmContentColor: Color = MaterialTheme.colorScheme.onError,
    content: @Composable ColumnScope.() -> Unit = {},
    onConfirm: () -> Unit = {},
    onDismiss: () -> Unit
) {    val colorScheme = MaterialTheme.colorScheme
    val currentOnDismiss by rememberUpdatedState(onDismiss)
    val currentOnConfirm by rememberUpdatedState(onConfirm)

    // 出现/消失动画状态：visible 驱动动画；exiting 标记退出流程已启动
    // （初始组合 visible=false 时不得触发关闭，只有"从 true 变 false"才算退出）
    var visible by remember { mutableStateOf(false) }
    var exiting by remember { mutableStateOf(false) }
    var pendingAction by remember { mutableStateOf<(() -> Unit)?>(null) }

    LaunchedEffect(Unit) { visible = true }

    fun beginExit(action: (() -> Unit)?) {
        if (visible && !exiting) {
            exiting = true
            pendingAction = action
            visible = false
        }
    }

    // 退出动画播完后：先执行挂起动作（确认路径的业务回调），再真正关闭 Dialog
    LaunchedEffect(exiting) {
        if (exiting) {
            delay(240)
            pendingAction?.invoke()
            pendingAction = null
            currentOnDismiss()
        }
    }

    Dialog(
        onDismissRequest = { beginExit(null) },
        // `decorFitsSystemWindows = false`：让这扇窗口**真的铺满整屏**（默认 true 时系统会
        // 把内容区缩到系统栏以内 —— 于是我们画的那层遮罩盖不到底部手势条那一带，
        // 而且窗口内的 `navigationBars` inset 会被吃掉、恒为 0，底部留白只能靠拍数字）
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        DialogWindowChrome()
        // 全屏容器把面板压到底部；点遮罩空白处关闭
        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) { detectTapGestures { beginExit(null) } },
            contentAlignment = Alignment.BottomCenter
        ) {
            // 遮罩：淡入淡出
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(animationSpec = tween(200)),
                exit = fadeOut(animationSpec = tween(200))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.35f))
                )
            }
            // 面板：自底部滑入 / 滑出
            AnimatedVisibility(
                visible = visible,
                enter = slideInVertically(
                    initialOffsetY = { it },
                    animationSpec = tween(260, easing = FastOutSlowInEasing)
                ) + fadeIn(),
                exit = slideOutVertically(
                    targetOffsetY = { it },
                    animationSpec = tween(220, easing = FastOutSlowInEasing)
                ) + fadeOut()
            ) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        // 软键盘弹出时上移；底部留白 = **导航条实测高度 + 12dp**
                        // （与任务页那枚「移除控制栏」完全同一档 —— 用户点名"应该跟移除控制栏
                        // 一样"）。早先固定 64dp 是在"窗口里量不到 inset"的前提下拍的兜底
                        //（见上：`decorFitsSystemWindows` 默认 true 会把 inset 吃掉），
                        // 现在窗口铺满整屏、inset 是真的，实测值比 64dp 小一截，固定值就显空
                        .imePadding()
                        .padding(
                            start = 14.dp,
                            end = 14.dp,
                            bottom = 12.dp + WindowInsets.navigationBars.asPaddingValues()
                                .calculateBottomPadding()
                        )
                        // 吞掉面板内点击，避免误触遮罩关闭
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) { },
                    shape = RoundedCornerShape(24.dp),
                    color = colorScheme.surfaceContainerHigh
                ) {
                    Column(Modifier.padding(20.dp)) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (subtitle != null) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = colorScheme.onSurfaceVariant
                            )
                        }
                        content()
                        if (confirmLabel != null) {
                            Spacer(Modifier.height(16.dp))
                            Row(Modifier.fillMaxWidth()) {
                                Button(
                                    onClick = { beginExit(null) },
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(46.dp),
                                    shape = RoundedCornerShape(14.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = colorScheme.surfaceContainerHighest,
                                        contentColor = colorScheme.onSurface
                                    ),
                                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
                                ) {
                                    Text(stringResource(R.string.cancel), fontWeight = FontWeight.Medium)
                                }
                                Spacer(Modifier.width(10.dp))
                                Button(
                                    onClick = { beginExit(currentOnConfirm) },
                                    enabled = confirmEnabled,
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(46.dp),
                                    shape = RoundedCornerShape(14.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = confirmContainerColor,
                                        contentColor = confirmContentColor
                                    ),
                                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
                                ) {
                                    Text(confirmLabel, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─── 弹窗里的分隔横杠 ───

/**
 * 选择弹窗里两条选项之间的那道细横杠。
 *
 * 单独抽出来是因为它此前**每一处都写 `colorScheme.outlineVariant`** —— 深色主题下
 * 那个色号（0xFF33363D）比弹窗面板底色（0xFF363B44）还深，划出来是一条看不见的线
 * （用户点名："主题弹窗的划分横杠在深色模式下不易见，很多选择弹窗都一样"）。
 * 现在统一走 [com.lerxu.android.ui.theme.LerxuExtraColors.dialogDivider]，
 * 深浅两套各自取"面板上看得见"的那一档；份量仍是发丝线（0.5dp + 4dp 内缩）。
 */
@Composable
fun DialogDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(horizontal = 4.dp),
        color = com.lerxu.android.ui.theme.lerxuExtraColors.dialogDivider,
        thickness = 0.5.dp
    )
}

// ─── 删除任务确认：可选"同时删除本地文件"（单任务删除：详情页/左滑） ───

@Composable
fun DeleteConfirmDialog(
    count: Int,
    onConfirm: (deleteFiles: Boolean) -> Unit,
    onDismiss: () -> Unit
) {
    var deleteFiles by remember { mutableStateOf(false) }

    BottomConfirmDialog(
        title = if (count > 1) stringResource(R.string.delete_multiple_tasks, count)
        else stringResource(R.string.delete_one_task),
        subtitle = if (deleteFiles) stringResource(R.string.delete_with_files_msg)
        else stringResource(R.string.delete_record_only_msg),
        confirmLabel = stringResource(R.string.delete),
        onConfirm = { onConfirm(deleteFiles) },
        onDismiss = onDismiss,
        content = {
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { deleteFiles = !deleteFiles },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(
                    checked = deleteFiles,
                    onCheckedChange = { deleteFiles = it },
                    colors = CheckboxDefaults.colors(checkedColor = MaterialTheme.colorScheme.primary)
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    stringResource(R.string.delete_local_files),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    )
}

// ─── 弹窗窗口的统一调色 ───

/**
 * 把 Compose 弹窗那**一扇窗口**调成"只有面板、其余一律透明"。
 *
 * 为什么必须调（2026-10-03 用户点名："语言弹窗打开后，底部小横条的背景颜色跟程序背景
 * 不一样，顶部的系统信息栏区背景也不一样"）：弹窗是**另一个窗口**，它不吃主窗口那套设置 ——
 * `MainActivity` 里的 `enableEdgeToEdge()` 与 `isNavigationBarContrastEnforced = false`
 * 都只作用于**主窗口**。弹窗窗口照样带着主题的 `windowBackground`（不透明）与自己的导航条
 * 配色，于是面板以外那两条带子（底部手势条区、顶部状态栏区）就跟主界面不是一个底色。
 *
 * 四件事一起做：
 * ① 窗口底 `setBackgroundDrawable(透明)` —— 面板之外让**底下那层**（主窗口）透上来，
 *   遮罩我们自己画（见调用处那层 `fillMaxSize` 的 35% 黑）；
 * ② `dimAmount = 0` —— 窗口自带的暗化也关掉：留着它就会和我们的遮罩叠成两层，底部更黑；
 * ③ 导航条 / 状态栏设成透明，并（API 29+）关掉**这一扇窗口**的导航条对比色
 *   （`isNavigationBarContrastEnforced`：系统只给"导航条是半透明"的窗口垫的那层 scrim。
 *   主窗口关过了，弹窗窗口还是默认开着的 —— 底部那条色差主要就是它）；
 * ④ 状态栏图标的明暗对齐当前主题：不然弹窗一开，顶部图标会自己翻个色。
 *
 * 注意：只能在 Dialog 的**内容里**调用（它靠 `LocalView` 往上找那扇窗口）。
 * 所有 `usePlatformDefaultWidth = false` 的自绘弹窗都要调（目前是 Dialogs 里的
 * `BottomConfirmDialog` 与 `UpdateNoticeCard`）—— 少调一个，那一张就又会有色差。
 */
@Composable
internal fun DialogWindowChrome() {
    val view = LocalView.current
    // 亮色主题（背景亮）→ 状态栏图标压暗；深色主题反过来。与主窗口同一判据
    val lightStatusBarIcons = MaterialTheme.colorScheme.background.luminance() > 0.5f
    SideEffect {
        val window = (view.parent as? DialogWindowProvider)?.window ?: return@SideEffect
        window.setBackgroundDrawable(ColorDrawable(android.graphics.Color.TRANSPARENT))
        window.setDimAmount(0f)
        @Suppress("DEPRECATION")
        run {
            // API 35 起这两个 setter 是 no-op（强制 edge-to-edge），低版本上还是得设
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
            window.statusBarColor = android.graphics.Color.TRANSPARENT
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }
        WindowCompat.getInsetsController(window, window.decorView)
            .isAppearanceLightStatusBars = lightStatusBarIcons
    }
}

// ─── 简单确认：标题 + 说明 + 取消/确认 ───
@Composable
fun SimpleConfirmDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    BottomConfirmDialog(
        title = title,
        subtitle = message,
        confirmLabel = confirmLabel,
        confirmContainerColor = MaterialTheme.colorScheme.primary,
        confirmContentColor = MaterialTheme.colorScheme.onPrimary,
        onConfirm = onConfirm,
        onDismiss = onDismiss
    )
}

// ─── 排序方式选项（供顶栏排序局部菜单使用，与桌面端同源） ───

data class SortOption(val key: String, val label: Int)

@Composable
fun sortOptions(): List<SortOption> = listOf(
    SortOption("finished_at", R.string.sort_field_finished),
    SortOption("remaining", R.string.sort_field_remaining),
    SortOption("speed", R.string.sort_field_speed),
    SortOption("size", R.string.sort_field_size)
)
