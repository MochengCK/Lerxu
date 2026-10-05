package com.lerxu.android

import com.lerxu.android.browser.BrowseHistory
import com.lerxu.android.browser.HistoryDay
import com.lerxu.android.browser.HistoryEntry
import com.lerxu.android.browser.HistoryFilter
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

    // ─── 历史弹窗的时间轴（timeline / bucketOf / timeLabel） ───

    private val zone = java.time.ZoneId.of("Asia/Shanghai")

    private fun at(y: Int, m: Int, d: Int, h: Int, min: Int = 0): Long =
        java.time.ZonedDateTime.of(y, m, d, h, min, 0, 0, zone).toInstant().toEpochMilli()

    /** 某一天（要跟 `group.date` 比对时用；[at] 还要给一个时刻）。 */
    private fun browseDay(y: Int, m: Int, d: Int): java.time.LocalDate =
        java.time.LocalDate.of(y, m, d)

    /**
     * 搜索与访问**混在同一条按时间排的轴上**（用户点名："搜索历史跟最近访问不要按分类来排序，
     * 按时间排序"），再**按自然日**分组（用户点名："时间分类应该细致一点……应该始终显示完整
     * 的时间"）—— 一天一组，组标题带完整日期，所以这里断言的是**日期**而不是档位名字。
     */
    @Test
    fun `timeline merges searches and visits and groups them by day`() {
        val list = listOf(
            HistoryEntry("https://cn.bing.com/search?q=柯基", "柯基 - 搜索", at(2026, 10, 3, 14)),
            HistoryEntry("https://example.com/a", "文章 A", at(2026, 10, 3, 12)),
            HistoryEntry("https://www.google.com/search?q=天气", "天气 - Google", at(2026, 10, 2, 20)),
            HistoryEntry("https://example.com/b", "文章 B", at(2026, 9, 20, 8))
        )
        val groups = BrowseHistory.timeline(list, SearchEngines.all, HistoryFilter.All, zone = zone)
        // 一天一组、新的在前 —— 没有"最近一周 / 更早"这种没有准确时间的组
        assertEquals(
            listOf(
                browseDay(2026, 10, 3),
                browseDay(2026, 10, 2),
                browseDay(2026, 9, 20)
            ),
            groups.map { it.date }
        )
        // 10-03 这一组：14 点那次搜索在前、12 点那篇文章在后 —— 就是"按时间"
        assertEquals(listOf("柯基", "文章 A"), groups[0].rows.map { it.title })
        assertTrue(groups[0].rows[0].isSearch)
        assertFalse(groups[0].rows[1].isSearch)
        // 搜索行的标题是**关键词**、副标题是引擎域名（不是结果页标题）
        assertEquals("cn.bing.com/search", groups[0].rows[0].subtitle)
        assertEquals("example.com/a", groups[0].rows[1].subtitle)
    }

    /** 同一自然日的多条合成一组（不是一条一组）。 */
    @Test
    fun `timeline puts the same day in one group`() {
        val list = listOf(
            HistoryEntry("https://a.com/1", "A1", at(2026, 10, 3, 20)),
            HistoryEntry("https://a.com/2", "A2", at(2026, 10, 3, 9)),
            HistoryEntry("https://a.com/3", "A3", at(2026, 10, 2, 9))
        )
        val groups = BrowseHistory.timeline(list, SearchEngines.all, HistoryFilter.All, zone = zone)
        assertEquals(2, groups.size)
        assertEquals(2, groups[0].rows.size)
        assertEquals(listOf("A1", "A2"), groups[0].rows.map { it.title })
    }

    /** 三个筛选项：全部 / 只访问 / 只搜索。 */
    @Test
    fun `timeline filters keep only the asked kind`() {
        val list = listOf(
            HistoryEntry("https://cn.bing.com/search?q=柯基", "柯基", at(2026, 10, 3, 14)),
            HistoryEntry("https://example.com/a", "文章 A", at(2026, 10, 3, 12))
        )
        val visits = BrowseHistory.timeline(list, SearchEngines.all, HistoryFilter.Visits, zone = zone)
            .flatMap { it.rows }
        assertEquals(listOf("文章 A"), visits.map { it.title })
        val searches = BrowseHistory.timeline(list, SearchEngines.all, HistoryFilter.Searches, zone = zone)
            .flatMap { it.rows }
        assertEquals(listOf("柯基"), searches.map { it.title })
    }

    /** 同一句关键词搜两遍只留最近那一次（与 `searchQueries` 同一个口径）。 */
    @Test
    fun `timeline keeps only the latest row per search keyword`() {
        val list = listOf(
            HistoryEntry("https://cn.bing.com/search?q=柯基&p=2", "柯基 - 第 2 页", at(2026, 10, 3, 14)),
            HistoryEntry("https://cn.bing.com/search?q=柯基", "柯基 - Bing", at(2026, 10, 3, 13)),
            HistoryEntry("https://example.com/a", "文章 A", at(2026, 10, 3, 12))
        )
        val rows = BrowseHistory.timeline(list, SearchEngines.all, HistoryFilter.All, zone = zone)
            .single().rows
        assertEquals(listOf("柯基", "文章 A"), rows.map { it.title })
        assertEquals(at(2026, 10, 3, 14), rows[0].visitedAt)
    }

    /**
     * 组标题怎么念：**按自然日**算，不按小时差（凌晨 0:30 看昨晚 23:50 那条是「昨天」），
     * 更早的走完整日期（[BrowseHistory.dayKind] 只说"该念日期"，日期本身在 `group.date` 里）。
     */
    @Test
    fun `dayKind separates today yesterday and dated`() {
        val now = BrowseHistory.dayOf(at(2026, 10, 3, 0, 30), zone)
        assertEquals(HistoryDay.Today, BrowseHistory.dayKind(BrowseHistory.dayOf(at(2026, 10, 3, 0, 10), zone), now))
        assertEquals(HistoryDay.Yesterday, BrowseHistory.dayKind(BrowseHistory.dayOf(at(2026, 10, 2, 23, 50), zone), now))
        assertEquals(HistoryDay.Yesterday, BrowseHistory.dayKind(BrowseHistory.dayOf(at(2026, 10, 2, 1), zone), now))
        assertEquals(HistoryDay.Dated, BrowseHistory.dayKind(BrowseHistory.dayOf(at(2026, 10, 1, 23), zone), now))
        assertEquals(HistoryDay.Dated, BrowseHistory.dayKind(BrowseHistory.dayOf(at(2026, 9, 20, 12), zone), now))
    }

    /** 行右侧只给**时刻**（日期在组标题上），12 / 24 小时跟着系统。 */
    @Test
    fun `clockLabel gives only the time of day`() {
        assertEquals("09:05", BrowseHistory.clockLabel(at(2026, 10, 3, 9, 5), zone, hour24 = true))
        assertEquals("9:05", BrowseHistory.clockLabel(at(2026, 10, 3, 9, 5), zone, hour24 = false))
        assertEquals("20:00", BrowseHistory.clockLabel(at(2025, 12, 31, 20), zone, hour24 = true))
    }

    /** 缺失时间戳的老数据落到 [LocalDate.MIN]（排在最末），不会混进今天。 */
    @Test
    fun `missing timestamps fall to the earliest day`() {
        assertEquals(java.time.LocalDate.MIN, BrowseHistory.dayOf(0L, zone))
    }

    /** 副标题与首页面板同口径：去协议、去 `www.`、去查询串与锚点。 */
    @Test
    fun `subtitleOf trims the scheme the query and the fragment`() {
        assertEquals("example.com/a/b", BrowseHistory.subtitleOf("https://www.example.com/a/b/?x=1#y"))
        assertEquals("cn.bing.com/search", BrowseHistory.subtitleOf("https://cn.bing.com/search?q=k"))
        assertEquals("", BrowseHistory.subtitleOf("about:blank"))
    }

    /**
     * 顶部搜索框（用户点名"在历史记录界面……可以搜索历史"）：关键词同时作用在**两种行**上。
     *
     * 访问行比标题与地址；搜索行比的是**关键词本身**（那一行的标题就是关键词）——
     * 用户搜"柯基"，输入"柯基"当然要能搜到那一条，而不是拿结果页地址去比。
     */
    @Test
    fun `timeline text matches both visit titles and search keywords`() {
        val list = listOf(
            HistoryEntry("https://cn.bing.com/search?q=柯基", "柯基", at(2026, 10, 3, 14)),
            HistoryEntry("https://example.com/corgi", "柯基视频合集", at(2026, 10, 3, 13)),
            HistoryEntry("https://example.com/cat", "猫咪", at(2026, 10, 3, 12))
        )
        val hit = BrowseHistory.timeline(
            list, SearchEngines.all, HistoryFilter.All, "柯基", zone = zone
        ).flatMap { it.rows }
        // 搜索行（标题 = 关键词）+ 标题命中的访问行；"猫咪"那条出局
        assertEquals(listOf("柯基", "柯基视频合集"), hit.map { it.title })

        // 地址命中：关键词不在标题里，但地址里有
        val byUrl = BrowseHistory.timeline(
            list, SearchEngines.all, HistoryFilter.All, "corgi", zone = zone
        ).flatMap { it.rows }
        assertEquals(listOf("柯基视频合集"), byUrl.map { it.title })

        // 空关键词 = 不过滤（三行都在）
        val all = BrowseHistory.timeline(
            list, SearchEngines.all, HistoryFilter.All, "", zone = zone
        ).flatMap { it.rows }
        assertEquals(3, all.size)
    }

    /**
     * 搜索与分类**同时生效**；关键词命中的去重不能把后面的同名记录误伤。
     *
     * 这一条钉的是一个顺序 bug：关键词不匹配时必须**在写进"已见过"名单之前**退出 ——
     * 否则一次不匹配的搜索会占掉名额，把后面那条真正匹配的同名记录一起丢掉。
     */
    @Test
    fun `timeline text combines with the filter and does not poison dedupe`() {
        val list = listOf(
            HistoryEntry("https://cn.bing.com/search?q=猫", "猫 - Bing", at(2026, 10, 3, 15)),
            HistoryEntry("https://cn.bing.com/search?q=柯基", "柯基 - Bing", at(2026, 10, 3, 14)),
            HistoryEntry("https://example.com/corgi", "柯基视频", at(2026, 10, 3, 13))
        )
        // "猫"那一条先被关键词否掉，不该影响后面"柯基"那条搜索行的去重
        val searches = BrowseHistory.timeline(
            list, SearchEngines.all, HistoryFilter.Searches, "柯基", zone = zone
        ).flatMap { it.rows }
        assertEquals(listOf("柯基"), searches.map { it.title })

        // 「最近访问」这一档里，搜索行本来就不该出现 —— 关键词也救不回来
        val visits = BrowseHistory.timeline(
            list, SearchEngines.all, HistoryFilter.Visits, "柯基", zone = zone
        ).flatMap { it.rows }
        assertEquals(listOf("柯基视频"), visits.map { it.title })
    }
}
