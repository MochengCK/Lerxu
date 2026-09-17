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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.lerxu.android.BuildConfig
import com.lerxu.android.R
import com.lerxu.android.update.NoteBlock
import com.lerxu.android.update.ReleaseNotes
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

                        // 更新说明：解析成结构化块后用 Compose 排版（标题层级/列表缩进/
                        // 段落间距/代码块/分隔线都保留）。旧实现走 TextView + HtmlCompat，
                        // 块级排版会被 HTML 解析器吞掉，整篇说明糊成一段。
                        if (update.notes.isNotBlank()) {
                            Spacer(Modifier.height(12.dp))
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = colorScheme.surfaceVariant.copy(alpha = 0.55f),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Box(
                                    Modifier
                                        .heightIn(max = 200.dp)
                                        .verticalScroll(rememberScrollState())
                                        .padding(12.dp)
                                ) {
                                    ReleaseNotesView(
                                        content = update.notes,
                                        textColor = colorScheme.onSurfaceVariant,
                                        headingColor = colorScheme.onSurface,
                                        linkColor = colorScheme.primary,
                                        codeBackground = colorScheme.surfaceContainerHighest
                                            .copy(alpha = 0.75f)
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

// ─── 发行说明渲染 ───

/**
 * 发行说明渲染：结构化块 + Compose 原生排版。
 *
 * 旧实现是 TextView + `HtmlCompat.fromHtml`：Android 的 Html 解析器忽略容器
 * 标签（`<pre>`、`<div>`、`<table>`）并会吞掉文本里的换行，于是标题层级、
 * 列表缩进、段落间距全部丢失，整篇更新说明挤成一坨。
 * 现在改成先解析成块（[ReleaseNotes.blocks]），再逐块用 Compose 排版：
 * 标题按层级加粗放大、列表按嵌套深度缩进、段落之间留白、引用带竖线、
 * 代码块用等宽字体独立底纹。
 */
@Composable
private fun ReleaseNotesView(
    content: String,
    textColor: Color,
    headingColor: Color,
    linkColor: Color,
    codeBackground: Color
) {
    val blocks = remember(content) { ReleaseNotes.blocks(content) }
    Column(Modifier.fillMaxWidth()) {
        blocks.forEachIndexed { index, block ->
            val topGap = when (block) {
                is NoteBlock.Heading -> if (index == 0) 0.dp else 12.dp
                NoteBlock.Divider -> 7.dp
                is NoteBlock.Paragraph -> if (index == 0) 0.dp else 7.dp
                is NoteBlock.Code -> 7.dp
                is NoteBlock.Quote -> 6.dp
                is NoteBlock.Item -> 4.dp
            }
            if (topGap > 0.dp) Spacer(Modifier.height(topGap))

            when (block) {
                is NoteBlock.Heading -> Text(
                    text = inlineMarkdown(block.text, linkColor, codeBackground),
                    style = when (block.level) {
                        1, 2 -> MaterialTheme.typography.titleSmall
                        3 -> MaterialTheme.typography.labelLarge
                        else -> MaterialTheme.typography.labelMedium
                    },
                    fontWeight = FontWeight.Bold,
                    color = headingColor
                )

                is NoteBlock.Paragraph -> Text(
                    text = inlineMarkdown(block.text, linkColor, codeBackground),
                    style = MaterialTheme.typography.bodySmall,
                    lineHeight = 19.sp,
                    color = textColor
                )

                is NoteBlock.Item -> Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = (block.depth * 12).dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Text(
                        text = block.marker,
                        style = MaterialTheme.typography.bodySmall,
                        lineHeight = 19.sp,
                        color = textColor.copy(alpha = 0.7f)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = inlineMarkdown(block.text, linkColor, codeBackground),
                        style = MaterialTheme.typography.bodySmall,
                        lineHeight = 19.sp,
                        color = textColor,
                        modifier = Modifier.weight(1f)
                    )
                }

                is NoteBlock.Quote -> Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(IntrinsicSize.Min)
                ) {
                    Box(
                        Modifier
                            .width(3.dp)
                            .fillMaxHeight()
                            .background(linkColor.copy(alpha = 0.45f), RoundedCornerShape(2.dp))
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = inlineMarkdown(block.text, linkColor, codeBackground),
                        style = MaterialTheme.typography.bodySmall,
                        lineHeight = 19.sp,
                        color = textColor.copy(alpha = 0.85f),
                        modifier = Modifier.weight(1f)
                    )
                }

                is NoteBlock.Code -> Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = codeBackground,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = block.text,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        lineHeight = 16.sp,
                        color = textColor,
                        modifier = Modifier
                            .horizontalScroll(rememberScrollState())
                            .padding(8.dp)
                    )
                }

                NoteBlock.Divider -> HorizontalDivider(
                    modifier = Modifier.padding(vertical = 1.dp),
                    color = textColor.copy(alpha = 0.18f),
                    thickness = 0.7.dp
                )
            }
        }
    }
}

// ─── 行内标记（粗体 / 斜体 / 删除线 / 行内代码 / 链接 / @提及） ───

/** 行内匹配结果：end 为匹配合成结束位置（左闭右开），text 为要显示的文本 */
private class InlineSpan(val end: Int, val kind: Int, val text: String, val url: String = "") {
    companion object {
        const val CODE = 0
        const val LINK = 1
        const val URL = 2
        const val BOLD = 3
        const val ITALIC = 4
        const val STRIKE = 5
        const val MENTION = 6
    }
}

private val CODE_RE = Regex("`([^`\n]+)`")
private val LINK_RE = Regex("\\[([^\\]]+)\\]\\((https?://[^\\s)]+)\\)")
private val BOLD_RE = Regex("\\*\\*([^*\n]+)\\*\\*")
private val STRONG_ALT_RE = Regex("__([^_\n]+)__")
private val STRIKE_RE = Regex("~~([^~\n]+)~~")
private val ITALIC_RE = Regex("\\*([^*\n]+)\\*")

// 裸链接：排除空白与常见收尾符号（含中文标点，避免把句号吞进 URL）
private val BARE_URL_RE = Regex("https?://[^\\s<>()\\[\\]「」『』，。；：！？、）》】\"']+")
private val MENTION_RE = Regex("@([A-Za-z0-9][A-Za-z0-9-]{0,37})")

/** URL 前一位是 ASCII 字母/数字或 . - / 时不算新链接（邮箱、域名片段误判兜底） */
private fun isUrlBoundary(prev: Char?): Boolean =
    prev == null || !(prev.isLetterOrDigit() && prev.code < 128) && prev !in charArrayOf('.', '-', '/')

/** 在 text[start] 处尝试匹配一个行内标记；不匹配返回 null */
private fun matchInlineAt(text: String, start: Int, allowEmphasis: Boolean): InlineSpan? {
    fun at(re: Regex): MatchResult? = re.find(text, start)?.takeIf { it.range.first == start }

    at(CODE_RE)?.let { return InlineSpan(it.range.last + 1, InlineSpan.CODE, it.groupValues[1]) }
    at(LINK_RE)?.let {
        return InlineSpan(it.range.last + 1, InlineSpan.LINK, it.groupValues[1], it.groupValues[2])
    }
    if (allowEmphasis) {
        at(BOLD_RE)?.let { return InlineSpan(it.range.last + 1, InlineSpan.BOLD, it.groupValues[1]) }
        at(STRONG_ALT_RE)?.let { return InlineSpan(it.range.last + 1, InlineSpan.BOLD, it.groupValues[1]) }
    }
    at(STRIKE_RE)?.let { return InlineSpan(it.range.last + 1, InlineSpan.STRIKE, it.groupValues[1]) }
    if (allowEmphasis) {
        at(ITALIC_RE)?.let { return InlineSpan(it.range.last + 1, InlineSpan.ITALIC, it.groupValues[1]) }
    }
    at(BARE_URL_RE)?.let {
        if (isUrlBoundary(if (start == 0) null else text[start - 1])) {
            return InlineSpan(it.range.last + 1, InlineSpan.URL, it.value, it.value)
        }
    }
    at(MENTION_RE)?.let {
        if (isUrlBoundary(if (start == 0) null else text[start - 1])) {
            return InlineSpan(
                it.range.last + 1,
                InlineSpan.MENTION,
                it.value,
                "https://github.com/${it.groupValues[1]}"
            )
        }
    }
    return null
}

/** 行内标记 → AnnotatedString；链接走 LinkAnnotation（点击由 Text 交给系统浏览器打开） */
private fun inlineMarkdown(
    text: String,
    linkColor: Color,
    codeBackground: Color,
    allowEmphasis: Boolean = true
): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        val m = matchInlineAt(text, i, allowEmphasis)
        if (m == null) {
            append(text[i])
            i++
            continue
        }
        when (m.kind) {
            InlineSpan.CODE -> withStyle(
                SpanStyle(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    background = codeBackground
                )
            ) { append(m.text) }

            InlineSpan.LINK, InlineSpan.URL, InlineSpan.MENTION -> withLink(
                LinkAnnotation.Url(
                    m.url,
                    TextLinkStyles(
                        SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)
                    )
                )
            ) { append(m.text) }

            InlineSpan.BOLD -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                append(inlineMarkdown(m.text, linkColor, codeBackground, allowEmphasis = false))
            }

            InlineSpan.ITALIC -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                append(inlineMarkdown(m.text, linkColor, codeBackground, allowEmphasis = false))
            }

            else -> withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) {
                append(m.text)
            }
        }
        i = m.end
    }
}
