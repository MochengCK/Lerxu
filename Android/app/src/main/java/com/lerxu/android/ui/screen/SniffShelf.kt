package com.lerxu.android.ui.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.lerxu.android.R
import com.lerxu.android.browser.SniffedResource
import com.lerxu.android.ui.formatBytes

/**
 * 「本页资源」局部弹窗。
 *
 * 它从**资源按钮那里长出来**：进场是"从按钮位置向上移动 + 由小放大 + 淡入"，
 * 收起反向回到按钮（用户点名要的动效）。所以这里不占页面、也不推坞 ——
 * 它是浮在坞上方的一块面板（调用方把它排在坞**之前**，于是坞原地不动）。
 *
 * 形变原点定在**底边靠右**（0.85, 1）：资源按钮就在地址栏右端、坞的上沿，
 * 那个位置对应面板底边的 85% 处 —— 缩放和位移因此都像是从那枚按钮发出来的。
 *
 * 版式按应用自己的语言：面板色（`surface`）+ 圆角 + 投影；头部之下一条**两侧
 * 留边的横杠**把标题栏与列表分开（用户点名），每条只有"名称 + 三枚小标签"
 * 和一枚移除 —— **整条可点即下载**，不再单摆一个下载按钮（用户点名）。
 */
@Composable
fun SniffPopup(
    open: Boolean,
    items: List<SniffedResource>,
    /** 整条可点 = **用原生播放器播它**（视频资源的第一动作）。 */
    onPlay: (SniffedResource) -> Unit,
    onDownload: (SniffedResource) -> Unit,
    onDismissItem: (SniffedResource) -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier
) {
    val origin = TransformOrigin(0.85f, 1f)
    AnimatedVisibility(
        visible = open,
        modifier = modifier,
        enter = fadeIn(tween(150)) +
            scaleIn(
                animationSpec = tween(240, easing = FastOutSlowInEasing),
                initialScale = 0.86f,
                transformOrigin = origin
            ) +
            slideInVertically(
                animationSpec = tween(240, easing = FastOutSlowInEasing)
            ) { it / 3 },
        exit = fadeOut(tween(130)) +
            scaleOut(
                animationSpec = tween(200, easing = FastOutSlowInEasing),
                targetScale = 0.86f,
                transformOrigin = origin
            ) +
            slideOutVertically(
                animationSpec = tween(200, easing = FastOutSlowInEasing)
            ) { it / 3 }
    ) {
        val colorScheme = MaterialTheme.colorScheme
        Surface(
            shape = RoundedCornerShape(18.dp),
            // 面板色（纯白 / 深面板）+ 投影：它浮在网页之上，得有自己的面
            color = colorScheme.surface,
            shadowElevation = 10.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 10.dp)
        ) {
            Column {
                // ── 头部：与资源按钮同一个图标，读起来是"那枚按钮展开了" ──
                // 顶部间距只留 6dp：弹窗是浮层，上面不需要抽屉那种呼吸位（用户点名收窄）
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.FileDownload,
                        contentDescription = null,
                        modifier = Modifier.size(17.dp),
                        tint = colorScheme.primary
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.browser_sniff_title),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )
                    if (items.isNotEmpty()) {
                        Spacer(Modifier.width(7.dp))
                        // 数量用标签样式（与行里那几枚同族），不另造一种视觉
                        SniffTag(items.size.toString())
                    }
                    Spacer(Modifier.weight(1f))
                    if (items.isNotEmpty()) {
                        TextButton(onClick = onClear) {
                            Text(stringResource(R.string.browser_sniff_clear))
                        }
                    }
                }

                // 标题栏与列表之间的一条横杠，**两侧留边**（用户点名）
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    thickness = 0.5.dp,
                    color = colorScheme.outlineVariant
                )

                if (items.isEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.SearchOff,
                            contentDescription = null,
                            modifier = Modifier.size(28.dp),
                            tint = colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            stringResource(R.string.browser_sniff_empty),
                            style = MaterialTheme.typography.bodyMedium,
                            color = colorScheme.onSurface
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            stringResource(R.string.browser_sniff_empty_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 300.dp)
                            .padding(vertical = 4.dp)
                    ) {
                        items(items, key = { it.dedupKey }) { item ->
                            SniffRow(
                                item = item,
                                onPlay = { onPlay(item) },
                                onDownload = { onDownload(item) },
                                onDismiss = { onDismissItem(item) }
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 一条资源：**整条可点即播放**（用原生播放器），右侧两枚小按钮分别是下载与移除。
 *
 * 这里与之前"整条可点即下载"的口径不同 —— 加了原生播放之后，一条视频资源的第一
 * 动作是"看"，下载退到右侧那枚按钮上（两枚按钮都做得克制，不抢整条的点击）。
 *
 * 左侧不再放类型图标 —— 类型已经由标签里的扩展名说了（用户点名）；
 * 名称用**视频名**（嗅探那一刻的页面标题），地址里的文件名只作兜底。
 */
@Composable
private fun SniffRow(
    item: SniffedResource,
    onPlay: () -> Unit,
    onDownload: () -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay)
            .padding(start = 16.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            // 名称**只占一行**，超出部分用尾部**渐隐**收住（不是省略号）：
            // 视频名往往很长，硬截断会在末尾留一个突兀的"…"（用户点名要渐隐）
            var overflowing by remember { mutableStateOf(false) }
            Box(modifier = Modifier.fillMaxWidth()) {
                Text(
                    sniffDisplayName(item),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    onTextLayout = { overflowing = it.hasVisualOverflow },
                    modifier = Modifier.fillMaxWidth()
                )
                // 只有真的被裁了才铺这层遮罩：短名字上留一道渐变反而脏
                if (overflowing) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .width(30.dp)
                            .height(18.dp)
                            .background(
                                Brush.horizontalGradient(
                                    0f to Color.Transparent,
                                    1f to colorScheme.surface
                                )
                            )
                    )
                }
            }
            Spacer(Modifier.height(5.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (item.extension.isNotEmpty()) {
                    SniffTag(item.extension.uppercase())
                }
                if (item.quality != null) {
                    SniffTag(item.quality)
                }
                SniffTag(
                    if (item.size > 0) formatBytes(item.size)
                    else stringResource(R.string.browser_size_unknown)
                )
            }
        }
        IconButton(onClick = onDownload, modifier = Modifier.size(30.dp)) {
            Icon(
                Icons.Default.FileDownload,
                contentDescription = stringResource(R.string.browser_download),
                modifier = Modifier.size(16.dp),
                tint = colorScheme.onSurfaceVariant
            )
        }
        IconButton(onClick = onDismiss, modifier = Modifier.size(30.dp)) {
            Icon(
                Icons.Default.Close,
                contentDescription = stringResource(R.string.browser_remove),
                modifier = Modifier.size(15.dp),
                tint = colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * 一条资源显示什么名字：**视频名**优先（嗅探时记下的页面标题），
 * 没有才退回地址里的文件名 —— 后者往往是 `index-1.m4s` 这种看不出是什么的串。
 */
private fun sniffDisplayName(item: SniffedResource): String {
    val title = item.title.trim()
    if (title.isNotEmpty()) return title
    return item.url.substringAfterLast('/').substringBefore('?')
        .ifEmpty { item.url.substringAfter("://").substringBefore('/') }
}

/** 小标签：类型 / 清晰度 / 大小 / 数量都用它。 */
@Composable
private fun SniffTag(text: String) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHighest
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
