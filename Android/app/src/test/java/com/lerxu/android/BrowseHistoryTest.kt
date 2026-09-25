package com.lerxu.android

import com.lerxu.android.browser.BrowseHistory
import com.lerxu.android.browser.HistoryEntry
import com.lerxu.android.browser.SearchEngines
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 浏览历史（首页面板的「历史记录」就来自它）。
 *
 * 这些规则直接决定用户在首页看到什么：漏记一条是「明明看过却查不到」，
 * 多记一条是隐私问题（自家页面 / 无痕），去重没做就是满屏重复项。
 * 都抽成了纯函数，所以在 JVM 上钉死。
 */
class BrowseHistoryTest {

    /** 清"搜索历史"只抹搜索项（结果页地址），用户逛过的普通页面要留着。 */
    @Test
    fun `clearSearches drops only search entries`() {
        val engines = SearchEngines.all
        val list = listOf(
            HistoryEntry(url = "https://cn.bing.com/search?q=weather", title = "weather - Bing", visitedAt = 3L),
            HistoryEntry(url = "https://example.com/article", title = "Article", visitedAt = 2L),
            HistoryEntry(url = "https://www.google.com/search?q=news", title = "news - Google", visitedAt = 1L)
        )
        val next = BrowseHistory.clearSearches(list, engines)
        assertEquals(1, next.size)
        assertEquals("https://example.com/article", next[0].url)
    }

    /** 没有搜索项时原样返回（调用方按 size 判断有没有变化）。 */
    @Test
    fun `clearSearches keeps list when nothing to drop`() {
        val list = listOf(
            HistoryEntry(url = "https://example.com/a", title = "A", visitedAt = 2L),
            HistoryEntry(url = "https://example.com/b", title = "B", visitedAt = 1L)
        )
        assertEquals(list, BrowseHistory.clearSearches(list, SearchEngines.all))
    }

    private fun entry(url: String, title: String = "", at: Long = 0L) =
        HistoryEntry(url, title, at)

    // ─── 什么该记、什么不该记 ───

    @Test
    fun `normal pages are recordable`() {
        assertTrue(BrowseHistory.isRecordable("https://example.com/a"))
        assertTrue(BrowseHistory.isRecordable("http://192.168.1.1:8080/x"))
    }

    @Test
    fun `internal and script pages are never recorded`() {
        // 自家首页没有「访问」的语义，而且每次进浏览器都会开一张
        assertFalse(BrowseHistory.isRecordable("file:///android_asset/browser-home.html"))
        assertFalse(BrowseHistory.isRecordable("about:blank"))
        assertFalse(BrowseHistory.isRecordable("data:text/html,hi"))
        assertFalse(BrowseHistory.isRecordable("javascript:void(0)"))
        assertFalse(BrowseHistory.isRecordable("blob:https://a.com/1"))
        assertFalse(BrowseHistory.isRecordable(""))
        assertFalse(BrowseHistory.isRecordable("   "))
        assertFalse(BrowseHistory.isRecordable(null))
    }

    @Test
    fun `unrecordable urls leave the list untouched`() {
        val before = listOf(entry("https://a.com", "A"))
        val after = BrowseHistory.record(before, "about:blank", "x", 1L)
        assertEquals(before, after)
    }

    // ─── 置顶与补标题 ───

    @Test
    fun `visiting the same url again moves it to the front without duplicating`() {
        var list = emptyList<HistoryEntry>()
        list = BrowseHistory.record(list, "https://a.com", "A", 1L)
        list = BrowseHistory.record(list, "https://b.com", "B", 2L)
        list = BrowseHistory.record(list, "https://a.com", "A", 3L)

        assertEquals(listOf("https://a.com", "https://b.com"), list.map { it.url })
        assertEquals(3L, list.first().visitedAt)
    }

    @Test
    fun `a blank title keeps the previous one`() {
        var list = BrowseHistory.record(emptyList(), "https://a.com", "站点标题", 1L)
        // 重定向 / 懒加载时标题会先报空：不能把已有的标题冲掉
        list = BrowseHistory.record(list, "https://a.com", "", 2L)
        assertEquals("站点标题", list.first().title)
    }

    @Test
    fun `history is capped at the max entry count`() {
        var list = emptyList<HistoryEntry>()
        repeat(BrowseHistory.MAX_ENTRIES + 20) { i ->
            list = BrowseHistory.record(list, "https://a.com/$i", "p$i", i.toLong())
        }
        assertEquals(BrowseHistory.MAX_ENTRIES, list.size)
        // 留下的是最新的那一批
        assertEquals("https://a.com/${BrowseHistory.MAX_ENTRIES + 19}", list.first().url)
    }

    // ─── 过滤 ───

    @Test
    fun `empty query returns the most recent entries up to the limit`() {
        val list = listOf(
            entry("https://a.com", "甲"),
            entry("https://b.com", "乙"),
            entry("https://c.com", "丙")
        )
        assertEquals(listOf("甲", "乙"), BrowseHistory.query(list, "", 2).map { it.title })
        assertEquals(listOf("甲", "乙"), BrowseHistory.query(list, "   ", 2).map { it.title })
    }

    @Test
    fun `query matches title and url ignoring case`() {
        val list = listOf(
            entry("https://github.com/x", "XferRust 引擎"),
            entry("https://example.com", "Example")
        )
        assertEquals(1, BrowseHistory.query(list, "xf", 8).size)
        assertEquals(1, BrowseHistory.query(list, "GITHUB", 8).size)
        assertEquals(2, BrowseHistory.query(list, "e", 8).size)
        assertEquals(0, BrowseHistory.query(list, "不存在的词", 8).size)
    }

    @Test
    fun `query never returns more than the limit`() {
        val list = (1..20).map { entry("https://a.com/$it", "第 $it 条") }
        assertEquals(5, BrowseHistory.query(list, "", 5).size)
        assertEquals(5, BrowseHistory.query(list, "https", 5).size)
        assertEquals(0, BrowseHistory.query(list, "", 0).size)
    }

    // ─── 落盘 ───

    @Test
    fun `encode decode round trip keeps order url and title`() {
        val list = listOf(
            entry("https://a.com/x?y=1#z", "标题 A", 1700000000000L),
            entry("https://b.com", "", 1699999999999L)
        )
        assertEquals(list, BrowseHistory.decode(BrowseHistory.encode(list)))
    }

    @Test
    fun `titles containing separators survive the round trip`() {
        val list = listOf(entry("https://a.com", "带\t制表符\n和换行的标题", 1L))
        val back = BrowseHistory.decode(BrowseHistory.encode(list)).single()
        // 分隔符会被替换成空格（否则行格式被撑坏），但不该丢整条记录
        assertEquals("带 制表符 和换行的标题", back.title)
        assertEquals("https://a.com", back.url)
    }

    @Test
    fun `broken rows are skipped instead of throwing`() {
        val raw = "123\thttps://a.com\t甲\n" +     // 正常行
            "这行只有一列\n" +                       // 列数不够
            "\n" +                                  // 空行
            "456\tfile:///android_asset/browser-home.html\t首页\n" + // 内部页
            "\tabout:blank\t空白\n"                  // 内部页 + 时间戳缺失
        val list = BrowseHistory.decode(raw)
        assertEquals(1, list.size)
        assertEquals("https://a.com", list.single().url)
    }

    @Test
    fun `decode tolerates empty and null input`() {
        assertEquals(emptyList<HistoryEntry>(), BrowseHistory.decode(null))
        assertEquals(emptyList<HistoryEntry>(), BrowseHistory.decode(""))
        assertEquals(emptyList<HistoryEntry>(), BrowseHistory.decode("  \n "))
    }

    @Test
    fun `normalize dedupes keeping the first occurrence and caps the size`() {
        val list = listOf(
            entry("https://a.com", "新"),
            entry("https://b.com", "B"),
            entry("https://a.com", "旧")
        )
        val fixed = BrowseHistory.normalize(list)
        assertEquals(listOf("https://a.com", "https://b.com"), fixed.map { it.url })
        assertEquals("新", fixed.first().title)
    }

    // ─── 主机名 ───

    @Test
    fun `hostOf strips scheme userinfo and path`() {
        assertEquals("example.com", BrowseHistory.hostOf("https://example.com/a/b?c=1#d"))
        assertEquals("example.com", BrowseHistory.hostOf("example.com"))
        // userinfo 要去掉；端口保留（对内网地址是有用信息）
        assertEquals("host.example:21", BrowseHistory.hostOf("ftp://user@host.example:21/x"))
        assertEquals("192.168.1.1:8080", BrowseHistory.hostOf("http://192.168.1.1:8080/"))
    }

    @Test
    fun `display title falls back to the host when the title is blank`() {
        assertEquals("站点标题", BrowseHistory.displayTitle(entry("https://a.com", "站点标题")))
        assertEquals("a.com", BrowseHistory.displayTitle(entry("https://a.com/very/long", "  ")))
    }
}
