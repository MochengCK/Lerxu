package com.lerxu.android.ui

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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.SpannableString
import android.text.Spanned
import android.text.TextPaint
import android.text.method.LinkMovementMethod
import android.text.style.ClickableSpan
import android.text.style.URLSpan
import android.view.View
import android.widget.TextView
import androidx.core.text.HtmlCompat
import com.lerxu.android.BuildConfig
import com.lerxu.android.R
import com.lerxu.android.update.UpdateManager
import kotlinx.coroutines.delay

/**
 * 应用内「发现新版本」提示卡片。
 *
 * 形态与项目里通用的底部确认弹窗一致：**底部悬浮、圆角、四周留白（不贴边）**。
 *
 * 内容：新版本号 + 当前版本 + 更新说明摘要（可滚动，限高）；
 * 底部：一个更新按钮 —— 点击后**原地变为进度条**（下载中显示百分比），
 *       下载完成后调起系统安装器；失败时按钮变为「重试」。
 *
 * 关闭途径：右上角关闭按钮、点遮罩空白处（不阻塞用户操作）。
 */
@Composable
fun UpdateNoticeCard(
    update: UpdateManager.AppUpdate,
    downloadState: UpdateManager.DownloadState,
    onUpdate: () -> Unit,
    onDismiss: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme

    // 出现/消失动画（与 BottomConfirmDialog 同策略：遮罩淡入淡出 + 面板自底部滑入）
    var visible by remember { mutableStateOf(false) }
    var exiting by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { visible = true }

    fun beginExit() {
        if (visible && !exiting) {
            exiting = true
            visible = false
        }
    }

    LaunchedEffect(exiting) {
        if (exiting) {
            delay(220)
            onDismiss()
        }
    }

    Dialog(
        onDismissRequest = { beginExit() },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) { detectTapGestures { beginExit() } },
            contentAlignment = Alignment.BottomCenter
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(animationSpec = tween(200)),
                exit = fadeOut(animationSpec = tween(200))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.35f))
                )
            }
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
                        // 四周留白：左右 14dp、底部 64dp 悬浮（导航栏遮挡兜底，
                        // 与 BottomConfirmDialog 一致）
                        .padding(start = 14.dp, end = 14.dp, bottom = 64.dp)
                        // 吞掉面板内点击，避免误触遮罩关闭
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) { },
                    shape = RoundedCornerShape(24.dp),
                    color = colorScheme.surfaceContainerHigh,
                    tonalElevation = 3.dp,
                    shadowElevation = 8.dp
                ) {
                    Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 20.dp)) {
                        // 标题行：图标 + 「发现新版本」+ 关闭按钮
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Filled.Download,
                                contentDescription = null,
                                tint = colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                text = stringResource(R.string.update_card_title),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { beginExit() },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(
                                    Icons.Filled.Close,
                                    contentDescription = stringResource(R.string.close),
                                    tint = colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }

                        Spacer(Modifier.height(10.dp))

                        // 版本信息：新版本号（突出）+ 当前版本（次要）
                        Text(
                            text = update.version,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = colorScheme.primary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = stringResource(R.string.update_card_current, BuildConfig.VERSION_NAME),
                            style = MaterialTheme.typography.bodySmall,
                            color = colorScheme.onSurfaceVariant
                        )

                        // 更新说明：TextView + HtmlCompat 渲染 GitHub 的 HTML 说明，
                        // 保留标题/列表/粗体/代码/链接等样式；纯文本（降级路径）
                        // 自动包 <pre> 保留换行。
                        if (update.notes.isNotBlank()) {
                            Spacer(Modifier.height(12.dp))
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = colorScheme.surfaceVariant.copy(alpha = 0.55f),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Box(
                                    Modifier
                                        .heightIn(max = 180.dp)
                                        .verticalScroll(rememberScrollState())
                                        .padding(12.dp)
                                ) {
                                    ReleaseNotesText(
                                        content = update.notes,
                                        textColor = colorScheme.onSurfaceVariant.toArgb(),
                                        linkColor = colorScheme.primary.toArgb()
                                    )
                                }
                            }
                        }

                        Spacer(Modifier.height(16.dp))

                        // 底部动作区：更新按钮 ⇄ 进度条（原地切换）
                        UpdateActionArea(
                            downloadState = downloadState,
                            onUpdate = onUpdate
                        )
                    }
                }
            }
        }
    }
}

/**
 * 卡片底部动作区。
 *
 * - Idle / Failed：一个「立即更新」按钮（失败时为「重试」）；
 * - Downloading：按钮位置替换为进度条 + 百分比文本；
 * - Ready：提示已下载完成（马上跳系统安装器）。
 */
@Composable
private fun UpdateActionArea(
    downloadState: UpdateManager.DownloadState,
    onUpdate: () -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme

    when (downloadState) {
        is UpdateManager.DownloadState.Downloading -> {
            Column(Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.update_card_downloading),
                        style = MaterialTheme.typography.bodySmall,
                        color = colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "${downloadState.percent}%",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = colorScheme.primary
                    )
                }
                Spacer(Modifier.height(8.dp))
                RoundedProgressBar(
                    progress = downloadState.percent / 100f,
                    color = colorScheme.primary,
                    trackColor = colorScheme.surfaceVariant,
                    height = 8.dp
                )
            }
        }

        is UpdateManager.DownloadState.Ready -> {
            Column(Modifier.fillMaxWidth()) {
                RoundedProgressBar(
                    progress = 1f,
                    color = colorScheme.primary,
                    trackColor = colorScheme.surfaceVariant,
                    height = 8.dp
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.update_card_installing),
                    style = MaterialTheme.typography.bodySmall,
                    color = colorScheme.onSurfaceVariant
                )
            }
        }

        else -> {
            val failed = downloadState is UpdateManager.DownloadState.Failed
            Button(
                onClick = onUpdate,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colorScheme.primary,
                    contentColor = colorScheme.onPrimary
                )
            ) {
                Text(
                    text = stringResource(
                        if (failed) R.string.update_card_retry else R.string.update_card_action
                    ),
                    style = MaterialTheme.typography.labelLarge
                )
            }
            if (failed) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = stringResource(R.string.update_card_download_failed),
                    style = MaterialTheme.typography.bodySmall,
                    color = colorScheme.error
                )
            }
        }
    }
}

/**
 * 发行说明渲染：TextView + HtmlCompat。
 *
 * - 内容为 HTML（GitHub body_html）时按富文本渲染（标题 / 列表 / 粗体 /
 *   代码 / 链接等样式保留）；
 * - 纯文本（降级路径：拿不到 body_html 时的 Markdown 原文）包一层 `<pre>`，
 *   保留换行；
 * - 链接只放行 http(s)，点击在系统浏览器打开（用 ClickableSpan 替换
 *   URLSpan，避免 javascript: / file: / content: 等协议被拉起）。
 */
@Composable
private fun ReleaseNotesText(
    content: String,
    textColor: Int,
    linkColor: Int
) {
    AndroidView(
        factory = { ctx ->
            TextView(ctx).apply {
                setTextColor(textColor)
                textSize = 12f
                setLineSpacing(0f, 1.5f)
                movementMethod = LinkMovementMethod.getInstance()
                highlightColor = android.graphics.Color.TRANSPARENT
            }
        },
        update = { tv ->
            tv.setTextColor(textColor)
            tv.setLinkTextColor(linkColor)
            val looksLikeHtml = content.contains('<') &&
                (content.contains("</") || content.contains("<h") ||
                    content.contains("<p") || content.contains("<li") ||
                    content.contains("<ul") || content.contains("<ol"))
            val html = if (looksLikeHtml) content else "<pre>" + escapeHtmlText(content) + "</pre>"
            val spanned = HtmlCompat.fromHtml(html, HtmlCompat.FROM_HTML_MODE_COMPACT)
            tv.text = makeSafeLinks(spanned, tv.context, linkColor)
        }
    )
}

private fun escapeHtmlText(s: String): String = s
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")

/** 把 HTML 里的 URLSpan 替换为只放行 http(s) 的 ClickableSpan */
private fun makeSafeLinks(spanned: Spanned, context: Context, linkColor: Int): Spanned {
    val ss = SpannableString(spanned)
    for (span in ss.getSpans(0, ss.length, URLSpan::class.java)) {
        val start = ss.getSpanStart(span)
        val end = ss.getSpanEnd(span)
        val flags = ss.getSpanFlags(span)
        val url = span.url
        ss.removeSpan(span)
        ss.setSpan(object : ClickableSpan() {
            override fun updateDrawState(ds: TextPaint) {
                ds.color = linkColor
                ds.isUnderlineText = true
            }

            override fun onClick(widget: View) {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    try {
                        context.startActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        )
                    } catch (_: Exception) {
                        // 没有可处理该链接的应用：静默忽略
                    }
                }
            }
        }, start, end, flags)
    }
    return ss
}
