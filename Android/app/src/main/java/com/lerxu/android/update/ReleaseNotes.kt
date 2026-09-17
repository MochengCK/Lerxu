package com.lerxu.android.update

/**
 * 发行说明的结构化块。
 *
 * 为什么需要它（而不是继续用 `HtmlCompat.fromHtml`）：
 * Android 的 Html 解析器只认一小撮行内标签，容器/块级标签（`<pre>`、`<div>`、
 * `<table>` 等）会被直接忽略，文本里的换行也会被吞掉 —— 社区里的通用绕法是
 * 「先把 \n 换成 <br> 再交给 fromHtml」。发行说明是 Markdown，靠这套解析器
 * 渲染的结果就是标题层级、列表缩进、段落间距全部丢失，整篇说明挤成一坨。
 * 这里先把说明解析成块，再交给 Compose 按块排版，排版不再取决于运行时
 * HTML 解析器的行为。
 *
 * 纯 Kotlin、不依赖 Android，便于 JVM 单测覆盖。
 */
sealed interface NoteBlock {
    /** Markdown 标题（level = # 的个数，1..6）；行内标记保留在 text 里交给渲染层解析 */
    data class Heading(val level: Int, val text: String) : NoteBlock

    /** 普通段落（连续的非空行合并为一段） */
    data class Paragraph(val text: String) : NoteBlock

    /** 列表项：marker 为「•」或「1.」，depth 为缩进层级（0 起，用于左侧缩进） */
    data class Item(val text: String, val depth: Int, val marker: String) : NoteBlock

    /** 引用块 */
    data class Quote(val text: String) : NoteBlock

    /** 围栏代码块 */
    data class Code(val lang: String, val text: String) : NoteBlock

    /** 分隔线（`---` / `***`，或 GitHub 里常见的空标题行「#」） */
    data object Divider : NoteBlock
}

object ReleaseNotes {

    /** 需要当作块级处理的 HTML 标签：命中即认为内容是 HTML 而非 Markdown */
    private val BLOCK_TAG_RE = Regex(
        "(?i)</?(p|div|ul|ol|li|h[1-6]|blockquote|pre|table|thead|tbody|tr|td|th|section|article|details|summary|br)\\b"
    )

    private val FENCE_RE = Regex("^(```|~~~)\\s*([A-Za-z0-9+#._-]*)")
    private val HEADING_EMPTY_RE = Regex("^(#{1,6})\\s*$")
    private val HEADING_RE = Regex("^(#{1,6})\\s+(.+)$")
    private val DIVIDER_RE = Regex("^(-{3,}|\\*{3,}|_{3,})$")
    private val QUOTE_RE = Regex("^>\\s?(.*)$")
    private val BULLET_RE = Regex("^[-*+]\\s+(.*)$")
    private val ORDERED_RE = Regex("^(\\d+)[.)]\\s+(.*)$")

    /** 一步到位：原始内容（Markdown 或 HTML）→ 结构化块 */
    fun blocks(raw: String?): List<NoteBlock> = parse(normalize(raw.orEmpty()))

    /**
     * 内容归一化。
     *
     * GitHub API 的 `body` 是 Markdown 原文，正常情况下原样返回；但发行说明
     * 里手写 HTML（`<details>`、`<p>`、`<br>` 等）也完全合法，直接按 Markdown
     * 解析会把标签原样显示出来。这里做一次「HTML → 类 Markdown」的轻量转换：
     * 只映射影响排版的块级标签，其余标签一律剥离，实体解码。
     */
    fun normalize(raw: String): String {
        val text = raw.replace("\r\n", "\n").replace('\r', '\n')
        if (!text.contains('<') || !BLOCK_TAG_RE.containsMatchIn(text)) return text

        var out = text
        out = Regex("(?i)<br\\s*/?>").replace(out, "\n")
        out = Regex("(?i)<h([1-6])[^>]*>").replace(out) { m ->
            val level = (m.groupValues[1].toIntOrNull() ?: 1).coerceIn(1, 6)
            "\n\n" + "#".repeat(level) + " "
        }
        out = Regex("(?i)<hr\\s*/?>").replace(out, "\n\n---\n\n")
        out = Regex("(?i)<li[^>]*>").replace(out, "- ")
        // 其余块级标签（开或闭）统一转为空行，保证「一段一行」而不是整块粘连
        out = Regex(
            "(?i)</?(p|div|ul|ol|h[1-6]|blockquote|pre|table|thead|tbody|tr|td|th|section|article|details|summary)\\b[^>]*>"
        ).replace(out, "\n\n")
        out = Regex("<[^>]+>").replace(out, "")
        out = decodeEntities(out)
        // 连续空行压成一行空行，避免解析出大量空段落
        return Regex("\n{3,}").replace(out, "\n\n").trim()
    }

    private fun decodeEntities(s: String): String {
        var out = s
        out = out.replace("&nbsp;", " ")
        out = Regex("&#(\\d+);").replace(out) { m ->
            m.groupValues[1].toIntOrNull()?.let { runCatching { it.toChar().toString() }.getOrDefault("") } ?: ""
        }
        out = out.replace("&lt;", "<").replace("&gt;", ">")
            .replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'")
        // &amp; 必须最后解，否则 "&amp;lt;" 会被二次解码
        return out.replace("&amp;", "&")
    }

    fun parse(markdown: String): List<NoteBlock> {
        val out = mutableListOf<NoteBlock>()
        val lines = markdown.replace("\r\n", "\n").replace('\r', '\n').split('\n')

        var paragraph = mutableListOf<String>()
        var inFence = false
        var fenceLang = ""
        val fenceLines = mutableListOf<String>()

        fun flushParagraph() {
            if (paragraph.isNotEmpty()) {
                out += NoteBlock.Paragraph(paragraph.joinToString(" ").trim())
                paragraph = mutableListOf()
            }
        }

        for (raw in lines) {
            val line = raw.trimEnd()
            val trimmed = line.trim()

            val fence = FENCE_RE.find(trimmed)
            if (fence != null && trimmed.startsWith(fence.value)) {
                if (inFence) {
                    out += NoteBlock.Code(fenceLang, fenceLines.joinToString("\n"))
                    fenceLines.clear()
                    fenceLang = ""
                    inFence = false
                } else {
                    flushParagraph()
                    inFence = true
                    fenceLang = fence.groupValues[2]
                }
                continue
            }
            if (inFence) {
                fenceLines += line
                continue
            }
            if (trimmed.isEmpty()) {
                flushParagraph()
                continue
            }

            // 空标题（只有 #）；GitHub 渲染为空标题，本项目的发布说明用它当分隔符
            if (HEADING_EMPTY_RE.matches(trimmed)) {
                flushParagraph()
                out += NoteBlock.Divider
                continue
            }

            // 标题：CommonMark 要求 # 后必须有空格，`#标签` 不算标题
            val heading = HEADING_RE.find(trimmed)
            if (heading != null) {
                flushParagraph()
                out += NoteBlock.Heading(heading.groupValues[1].length, heading.groupValues[2].trim())
                continue
            }

            if (DIVIDER_RE.matches(trimmed)) {
                flushParagraph()
                out += NoteBlock.Divider
                continue
            }

            val quote = QUOTE_RE.find(trimmed)
            if (quote != null) {
                flushParagraph()
                out += NoteBlock.Quote(quote.groupValues[1].trim())
                continue
            }

            val bullet = BULLET_RE.find(trimmed)
            if (bullet != null) {
                flushParagraph()
                out += NoteBlock.Item(bullet.groupValues[1].trim(), indentDepth(line), "•")
                continue
            }

            val ordered = ORDERED_RE.find(trimmed)
            if (ordered != null) {
                flushParagraph()
                out += NoteBlock.Item(ordered.groupValues[2].trim(), indentDepth(line), ordered.groupValues[1] + ".")
                continue
            }

            paragraph += trimmed
        }

        if (inFence && fenceLines.isNotEmpty()) {
            out += NoteBlock.Code(fenceLang, fenceLines.joinToString("\n"))
        }
        flushParagraph()
        return out
    }

    /** 缩进层级：2 空格（或 1 个 Tab）算一级，最深 4 级，避免长缩进把文字挤出屏幕 */
    private fun indentDepth(line: String): Int {
        val firstNonSpace = line.indexOfFirst { it != ' ' && it != '\t' }
        if (firstNonSpace <= 0) return 0
        var width = 0
        for (c in line.take(firstNonSpace)) {
            width += if (c == '\t') 4 else 1
        }
        return (width / 2).coerceIn(0, 4)
    }
}
