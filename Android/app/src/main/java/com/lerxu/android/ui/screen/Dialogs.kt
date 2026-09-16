package com.lerxu.android.ui.screen

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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
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
) {
    val colorScheme = MaterialTheme.colorScheme
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
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
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
                        // 软键盘弹出时上移；底部固定 48dp 悬浮留白——
                        // Dialog 窗口内拿到的导航条 inset 在部分机型恒为 0
                        // （三键导航栏约 48dp 会盖住面板底部，视觉上"贴边"），
                        // inset 避让不可靠，固定留白覆盖最坏情况
                        .imePadding()
                        .padding(start = 14.dp, end = 14.dp, bottom = 64.dp)
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
