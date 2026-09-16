package com.lerxu.android.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * 共享 UI 组件 —— 状态图标、状态徽章、圆角进度条
 */

fun statusIcon(status: String): ImageVector = when (status) {
    "active" -> Icons.Filled.Download
    "waiting" -> Icons.Filled.Schedule
    "paused" -> Icons.Filled.PauseCircle
    "complete" -> Icons.Filled.CheckCircle
    "error" -> Icons.Filled.ErrorOutline
    "removed" -> Icons.Filled.RemoveCircleOutline
    else -> Icons.Filled.Download
}

/** 状态徽章 —— 彩色小胶囊，含图标与状态文案 */
@Composable
fun StatusPill(status: String, modifier: Modifier = Modifier) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val color = Color(statusColor(status))
    Surface(
        color = color.copy(alpha = 0.14f),
        shape = CircleShape,
        modifier = modifier
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                statusIcon(status),
                contentDescription = null,
                modifier = Modifier.size(11.dp),
                tint = color
            )
            Spacer(Modifier.width(4.dp))
            Text(
                statusText(context, status),
                style = MaterialTheme.typography.labelSmall,
                color = color
            )
        }
    }
}

/** 圆角进度条 —— 平滑动画、全圆角端点；indeterminate 用于总大小未知（如磁力解析中）的任务 */
@Composable
fun RoundedProgressBar(
    progress: Float,
    color: Color,
    trackColor: Color,
    modifier: Modifier = Modifier,
    height: Dp = 6.dp,
    animate: Boolean = true,
    indeterminate: Boolean = false
) {
    if (indeterminate) {
        val transition = rememberInfiniteTransition(label = "indeterminateBar")
        val shift by transition.animateFloat(
            initialValue = -0.4f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                tween(1300, easing = LinearEasing),
                RepeatMode.Restart
            ),
            label = "segmentShift"
        )
        Box(
            modifier
                .fillMaxWidth()
                .height(height)
                .clip(CircleShape)
                .background(trackColor)
        ) {
            // 一段 40% 宽的小条沿轨道循环滑动，表达"进行中但进度未知"
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val trackWidth = maxWidth
                Box(
                    Modifier
                        .offset(x = trackWidth * shift)
                        .width(trackWidth * 0.4f)
                        .fillMaxHeight()
                        .clip(CircleShape)
                        .background(color)
                )
            }
        }
        return
    }
    val p by animateFloatAsState(
        targetValue = progress.coerceIn(0f, 1f),
        animationSpec = if (animate) tween(350, easing = FastOutSlowInEasing) else snap(),
        label = "progress"
    )
    // 外层轨道必须占满整行：否则宽度由进度填充撑出，0% 时整个条宽度为 0，轨道不可见
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(CircleShape)
            .background(trackColor)
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(p)
                .clip(CircleShape)
                .background(color)
        )
    }
}
