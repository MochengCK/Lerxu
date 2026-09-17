package com.lerxu.android

import com.lerxu.android.update.NoteBlock
import com.lerxu.android.update.ReleaseNotes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 发行说明解析测试。
 *
 * 背景：安卓端更新卡片原先用 `HtmlCompat.fromHtml` 渲染说明，块级排版
 * （标题层级 / 列表缩进 / 段落间距）会被 HTML 解析器吞掉，整篇糊成一坨。
 * 现在改为「先解析成结构化块、再交给 Compose 排版」，这里把解析结果钉住，
 * 保证标题、列表、缩进、分隔线这些排版信息不再丢失。
 */
class ReleaseNotesTest {

    private fun parse(markdown: String) = ReleaseNotes.parse(markdown)

    @Test
    fun `headings keep their level`() {
        val blocks = parse("## 大标题\n\n### 小标题")
        assertEquals(NoteBlock.Heading(2, "大标题"), blocks[0])
        assertEquals(NoteBlock.Heading(3, "小标题"), blocks[1])
    }

    @Test
    fun `lone hash acts as a divider`() {
        // 本项目发布说明用单独一行 # 分节，GitHub 渲染成空标题，
        // 在手机上渲染为分隔线比留一段空白更清楚
        val blocks = parse("正文\n\n#\n\n### 修复（Fix）")
        assertEquals(NoteBlock.Paragraph("正文"), blocks[0])
        assertEquals(NoteBlock.Divider, blocks[1])
        assertEquals(NoteBlock.Heading(3, "修复（Fix）"), blocks[2])
    }

    @Test
    fun `hash without space is not a heading`() {
        val blocks = parse("#标签不是标题")
        assertEquals(NoteBlock.Paragraph("#标签不是标题"), blocks[0])
    }

    @Test
    fun `loose list items stay separate items`() {
        // 实际发布说明的列表项之间夹着空行（松散列表），不能被合并成一段
        val blocks = parse("- 将XferCore引擎更替为XferRust\n\n- Electron 升级至 v44.4.1")
        val items = blocks.filterIsInstance<NoteBlock.Item>()
        assertEquals(2, items.size)
        assertEquals("将XferCore引擎更替为XferRust", items[0].text)
        assertEquals("Electron 升级至 v44.4.1", items[1].text)
        assertEquals("•", items[0].marker)
        assertEquals(0, items[0].depth)
    }

    @Test
    fun `indented bullets keep their nesting depth`() {
        val blocks = parse("- 下载引擎 XferCore 升级至 v1.6.5\n\n   - 新增已暂停做种任务状态的记录\n\n   - 修复uTP协议实现异常")
        val items = blocks.filterIsInstance<NoteBlock.Item>()
        assertEquals(3, items.size)
        assertEquals(0, items[0].depth)
        assertEquals(1, items[1].depth)
        assertEquals(1, items[2].depth)
    }

    @Test
    fun `ordered list keeps its number`() {
        val blocks = parse("1. 第一步\n2. 第二步")
        val items = blocks.filterIsInstance<NoteBlock.Item>()
        assertEquals("1.", items[0].marker)
        assertEquals("2.", items[1].marker)
        assertEquals("第一步", items[0].text)
    }

    @Test
    fun `consecutive plain lines merge into one paragraph`() {
        val blocks = parse("第一行\n第二行\n\n另起一段")
        assertEquals(NoteBlock.Paragraph("第一行 第二行"), blocks[0])
        assertEquals(NoteBlock.Paragraph("另起一段"), blocks[1])
    }

    @Test
    fun `quote becomes quote block`() {
        val blocks = parse("> 此版本为补丁版本，延续上个版本更新说明")
        assertEquals(NoteBlock.Quote("此版本为补丁版本，延续上个版本更新说明"), blocks[0])
    }

    @Test
    fun `fenced code keeps language and body`() {
        val blocks = parse("```kotlin\nval a = 1\nval b = 2\n```")
        assertEquals(NoteBlock.Code("kotlin", "val a = 1\nval b = 2"), blocks[0])
    }

    @Test
    fun `horizontal rule becomes divider`() {
        assertEquals(NoteBlock.Divider, parse("---")[0])
        assertEquals(NoteBlock.Divider, parse("***")[0])
    }

    @Test
    fun `html release body is normalised into markdown blocks`() {
        // GitHub body_html 形式（部分发行说明直接手写 HTML）：块级标签必须先
        // 归一化，否则解析出来只有一个大段落
        val html = "<h2>Lerxu v3.2.0 发布说明</h2>\n<p>第一段。</p>\n<ul>\n<li>新增 A</li>\n<li>修复 B</li>\n</ul>"
        val blocks = ReleaseNotes.blocks(html)
        assertEquals(NoteBlock.Heading(2, "Lerxu v3.2.0 发布说明"), blocks[0])
        assertEquals(NoteBlock.Paragraph("第一段。"), blocks[1])
        val items = blocks.filterIsInstance<NoteBlock.Item>()
        assertEquals(2, items.size)
        assertEquals("新增 A", items[0].text)
        assertEquals("修复 B", items[1].text)
    }

    @Test
    fun `plain markdown is not treated as html`() {
        // 说明里出现「<」但内容其实是 Markdown 时不能走 HTML 归一化
        val md = "## 标题\n\n- 版本 <3.0 的用户请先升级"
        val blocks = ReleaseNotes.blocks(md)
        assertEquals(NoteBlock.Heading(2, "标题"), blocks[0])
        assertEquals(NoteBlock.Item("版本 <3.0 的用户请先升级", 0, "•"), blocks[1])
    }

    @Test
    fun `real release notes keep their section structure`() {
        val md = """
            ## Lerxu v3.2.0-Beta1 发布说明

            Lerxu v3.2.0-Beta1 是一次重要的架构与平台扩展更新。

            #

            - 将XferCore引擎更替为XferRust

            - Electron 升级至 v44.4.1

            #

            ### 修复（Fix）

            - 修复预览更新始终显示为空的问题（@MochengCK）

            ### 新增（New Features）

            - 新增全新的安卓客户端（@MochengCK）
        """.trimIndent()

        val blocks = ReleaseNotes.blocks(md)
        assertEquals(NoteBlock.Heading(2, "Lerxu v3.2.0-Beta1 发布说明"), blocks[0])
        assertTrue(blocks[1] is NoteBlock.Paragraph)
        assertEquals(NoteBlock.Divider, blocks[2])
        assertTrue(blocks[3] is NoteBlock.Item)
        // 分节标题必须是标题块，不能被并进正文
        val fixIndex = blocks.indexOfFirst { it is NoteBlock.Heading && it.text == "修复（Fix）" }
        assertEquals(NoteBlock.Heading(3, "修复（Fix）"), blocks[fixIndex])
        assertTrue(blocks[fixIndex + 1] is NoteBlock.Item)
        assertTrue(blocks.any { it is NoteBlock.Heading && it.text == "新增（New Features）" })
    }
}
