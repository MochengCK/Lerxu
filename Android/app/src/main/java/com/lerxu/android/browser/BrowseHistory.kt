package com.lerxu.android.browser

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** 一条浏览记录：地址、标题（可能为空，取到标题前就落库了）与最后访问时间。 */
data class HistoryEntry(
    val url: String,
    val title: String,
    val visitedAt: Long
)

/**
 * 历史弹窗顶部那三个筛选项（用户点名："顶部要有筛选选项，只显示最近访问、只显示搜索历史、
 * 默认全部"）。
 */
enum class HistoryFilter { All, Visits, Searches }

/**
 * 一组标题怎么念 —— **只影响文案**，准确的日期在 [HistoryGroup.date] 里。
 *
 * 用户点名："时间分类应该细致一点，而不是今天之外就是最近一周，然后就是更早，应该始终显示
 * 完整的时间，不应该出现最近一周更早这类没有准确时间的" ⇒ 于是分组单位从"档"变成**自然日**
 * （一天一组，组标题带完整日期），只剩"今天/昨天"这两个因为本身就没有歧义而特殊念法。
 */
enum class HistoryDay { Today, Yesterday, Dated }

/** 弹窗上的一行：文案都在这里成型，界面不再做判断。 */
data class HistoryRow(
    val url: String,
    val title: String,
    val subtitle: String,
    val visitedAt: Long,
    /** 这一行是**一次搜索**（地址是引擎的结果页）：标题是关键词，不是网页标题。 */
    val isSearch: Boolean
)

/**
 * 一组 = **一个自然日**（[date] 就是它的完整日期，组标题由界面本地化）。
 *
 * 行里不再带日期（行右侧只给时刻）：日期在组标题上，两边不重复 —— 用户点名
 * "每个选项右侧不应该重复显示时间"。
 */
data class HistoryGroup(val date: LocalDate, val rows: List<HistoryRow>)

/**
 * 浏览历史：全局一份，按 URL 去重、最近访问在前。
 *
 * 三条不变量（与无痕的口径一致，见 BrowserController 里无痕那一段）：
 * ① **自家页面不记** —— 首页与 about: 没有「访问」的语义，而且每次进浏览器都会开一张；
 * ② **无痕一律不记**（由调用方判断；[isRecordable] 只负责地址本身值不值得记）；
 * ③ **同一 URL 只留一条**：再次访问只是置顶并补标题，不新增（否则一串重复项）。
 *
 * 全部是纯函数 + 一个编解码，落盘放在 BrowserController —— 这样规则能直接单测。
 * 注意主机名解析**不能**用 `android.net.Uri`（JVM 单测里它不可用），见 [hostOf]。
 */
object BrowseHistory {

    /** 上限：300 条足够覆盖「最近访问」，再多只是无用的内存与落盘开销。 */
    const val MAX_ENTRIES = 300

    private const val FIELD_SEP = '\t'
    private const val ROW_SEP = '\n'

    /** 地址值不值得记：内部页、空白页与脚本式地址一律不要。 */
    fun isRecordable(url: String?): Boolean {
        val u = url?.trim().orEmpty()
        if (u.isEmpty()) return false
        val lower = u.lowercase()
        return !(lower.startsWith("about:") ||
            lower.startsWith("file:///android_asset/") ||
            lower.startsWith("data:") ||
            lower.startsWith("javascript:") ||
            lower.startsWith("blob:"))
    }

    /**
     * 记录一次访问：同 URL 置顶 + 补标题，超出上限截断。
     *
     * 标题取不到（重定向中途、懒加载页面）时**保留旧标题**而不是覆盖成空 —— 空标题
     * 会让这一条从「某某官网」退化成一行域名。
     */
    fun record(
        list: List<HistoryEntry>,
        url: String,
        title: String,
        now: Long
    ): List<HistoryEntry> {
        if (!isRecordable(url)) return list
        val clean = url.trim()
        val next = title.trim().take(MAX_TITLE)
        val existing = list.firstOrNull { it.url == clean }
        val merged = next.ifEmpty { existing?.title.orEmpty() }
        return (listOf(HistoryEntry(clean, merged, now)) + list.filter { it.url != clean })
            .take(MAX_ENTRIES)
    }

    /**
     * 按输入过滤：命中标题或地址即算命中（不区分大小写），最近访问在前。
     * [text] 为空时返回最近访问的前 [limit] 条 —— 面板空输入时显示的就是这份。
     */
    fun query(list: List<HistoryEntry>, text: String, limit: Int): List<HistoryEntry> {
        val q = text.trim().lowercase()
        val hit = if (q.isEmpty()) {
            list
        } else {
            list.filter { it.title.lowercase().contains(q) || it.url.lowercase().contains(q) }
        }
        return hit.take(limit.coerceAtLeast(0))
    }

    /** 去重（保留最靠前的一条）并截断：读盘后兜底，防止旧格式或手动改过的文件带进脏数据。 */
    fun normalize(list: List<HistoryEntry>): List<HistoryEntry> {
        val seen = HashSet<String>()
        return list.filter { it.url.isNotEmpty() && seen.add(it.url) }.take(MAX_ENTRIES)
    }

    /**
     * 从地址里取主机名。
     *
     * 纯字符串解析：单元测试跑在 JVM 上，`android.net.Uri` 在那里是空实现（会直接抛）。
     */
    fun hostOf(url: String): String {
        var s = url.trim()
        val scheme = s.indexOf("://")
        if (scheme >= 0) s = s.substring(scheme + 3)
        val cut = s.indexOfFirst { it == '/' || it == '?' || it == '#' }
        if (cut >= 0) s = s.substring(0, cut)
        val at = s.lastIndexOf('@')
        if (at >= 0) s = s.substring(at + 1)
        return s
    }

    /** 面板上显示的一行文字：有标题用标题，没有就退回域名。 */
    fun displayTitle(entry: HistoryEntry): String =
        entry.title.trim().ifEmpty { hostOf(entry.url) }

    /**
     * 这条记录是不是**一次搜索**？是的话把关键词取出来。
     *
     * 判据：地址的查询串里带着某个引擎的查询参数名（`bing.com/search?q=…` 里的 `q`）。
     * **逐个引擎试** —— 用户当时可能用的是另一个引擎；参数名从各引擎自己的
     * `searchUrl` 里认（带 `%s` 的那一段），不写死。
     *
     * 纯字符串解析：`android.net.Uri` 在 JVM 单测里不可用（见 [hostOf]）。
     */
    fun searchQueryOf(url: String, engines: List<SearchEngine>): String? {
        val query = url.substringAfter('?', "")
        if (query.isEmpty()) return null
        val pairs = query.substringBefore('#').split('&')
        engines.forEach { e ->
            val name = e.searchUrl.substringAfter('?', "")
                .split('&')
                .firstOrNull { it.contains("%s") }
                ?.substringBefore('=')
                ?.trim()
                .orEmpty()
            if (name.isEmpty()) return@forEach
            val value = pairs.firstOrNull { it.substringBefore('=') == name }
                ?.substringAfter('=', "")
                .orEmpty()
            if (value.isBlank()) return@forEach
            // 引擎可能用 `+` 代替空格（自家编码走的是百分号，两种都得认）
            val text = runCatching {
                java.net.URLDecoder.decode(value.replace("+", " "), "UTF-8")
            }.getOrDefault(value).trim()
            if (text.isNotEmpty()) return text
        }
        return null
    }

    /**
     * 搜索历史：从记录里认出搜索、按关键词去重（最近一次在前），最多 [limit] 条。
     *
     * [text] 非空时只留命中它的关键词 —— 与页面上的输入保持一致。
     */
    fun searchQueries(
        list: List<HistoryEntry>,
        engines: List<SearchEngine>,
        text: String,
        limit: Int
    ): List<String> {
        val q = text.trim().lowercase()
        val out = ArrayList<String>()
        val seen = HashSet<String>()
        list.forEach { e ->
            val hit = searchQueryOf(e.url, engines) ?: return@forEach
            if (q.isNotEmpty() && !hit.lowercase().contains(q)) return@forEach
            if (seen.add(hit.lowercase())) out += hit
        }
        return out.take(limit.coerceAtLeast(0))
    }

    /**
     * 清掉记录里的**搜索项**（结果页地址），普通页面保留。
     *
     * 「搜索历史」那一组就是从记录里认出来的关键词（见 [searchQueries]）——
     * 清它只该抹掉搜索，不该把用户逛过的网页一起带走。
     */
    fun clearSearches(list: List<HistoryEntry>, engines: List<SearchEngine>): List<HistoryEntry> =
        list.filter { searchQueryOf(it.url, engines) == null }

    /** 落盘：每行 `visitedAt \t url \t title`（分隔符是行/列边界，标题里必须清掉）。 */
    fun encode(list: List<HistoryEntry>): String =
        list.joinToString(ROW_SEP.toString()) { e ->
            e.visitedAt.toString() + FIELD_SEP + e.url + FIELD_SEP + sanitize(e.title)
        }

    /** 读盘：坏行直接跳过，不抛异常（历史丢了也不该影响启动）。 */
    fun decode(raw: String?): List<HistoryEntry> {
        if (raw.isNullOrBlank()) return emptyList()
        val rows = raw.split(ROW_SEP).mapNotNull { row ->
            if (row.isBlank()) return@mapNotNull null
            val parts = row.split(FIELD_SEP, limit = 3)
            if (parts.size < 2) return@mapNotNull null
            val url = parts[1]
            if (!isRecordable(url)) return@mapNotNull null
            HistoryEntry(
                url = url,
                title = parts.getOrElse(2) { "" },
                visitedAt = parts[0].toLongOrNull() ?: 0L
            )
        }
        return normalize(rows)
    }

    /** 标题里出现制表符 / 换行会把行格式撑坏（那是分隔符）。 */
    private fun sanitize(title: String): String =
        title.replace(FIELD_SEP, ' ').replace(ROW_SEP, ' ').take(MAX_TITLE)

    private const val MAX_TITLE = 200

    // ─────────────────────── 历史弹窗要的形状（纯函数，JVM 单测可覆盖） ───────────────────────

    /**
     * 把记录摊成**一条按时间排的时间轴**（用户点名："搜索历史跟最近访问不要按分类来排序，
     * 按时间排序"）—— 搜索与访问混在同一条里，谁新谁在上，再**按自然日分组**
     * （用户点名："时间分类应该细致一点……应该始终显示完整的时间"）。
     *
     * 两条与面板一致的规则：
     * - **搜索行的标题换成关键词**（"柯基视频"才是用户认得出的东西，结果页标题是噪声）；
     * - 同一条关键词**只留最近那次**（同一句话搜两遍不该出两行）—— 与 [searchQueries] 同口径。
     *
     * 副标题统一是"站点 + 路径"（[subtitleOf]），搜索行因此显示引擎域名。
     * 组间新的在前，组内也是新的在前（`sortedByDescending` 之后 `groupBy` 保序）。
     */
    fun timeline(
        list: List<HistoryEntry>,
        engines: List<SearchEngine>,
        filter: HistoryFilter,
        /**
         * 顶部搜索框里的关键词（空 = 不过滤）。
         *
         * 命中规则与 [query] 同口径：**标题或地址**含它就留下；搜索行比的是**关键词
         * 本身**（那一行的标题就是关键词，见下），不是结果页地址 —— 用户搜"柯基"，
         * 输入"柯基"当然要能搜到那一条。
         */
        text: String = "",
        zone: ZoneId = ZoneId.systemDefault()
    ): List<HistoryGroup> {
        val q = text.trim().lowercase()
        val seenSearch = HashSet<String>()
        val rows = ArrayList<HistoryRow>(list.size)
        list.sortedByDescending { it.visitedAt }.forEach { e ->
            val word = searchQueryOf(e.url, engines)
            if (word != null) {
                if (filter == HistoryFilter.Visits) return@forEach
                // 关键词不匹配就**在去重之前**退出：否则一次不匹配的搜索会把
                // 后面那条真正匹配的同名记录一起按"已经见过"丢掉
                if (q.isNotEmpty() && !word.lowercase().contains(q)) return@forEach
                if (!seenSearch.add(word.lowercase())) return@forEach
            } else {
                if (filter == HistoryFilter.Searches) return@forEach
                if (q.isNotEmpty() &&
                    !e.title.lowercase().contains(q) && !e.url.lowercase().contains(q)
                ) {
                    return@forEach
                }
            }
            rows += HistoryRow(
                url = e.url,
                title = word ?: displayTitle(e),
                subtitle = subtitleOf(e.url),
                visitedAt = e.visitedAt,
                isSearch = word != null
            )
        }
        return rows.groupBy { dayOf(it.visitedAt, zone) }
            .map { (date, group) -> HistoryGroup(date, group) }
            // groupBy 已经保序（新的在前），这里再按日期倒序排一次：万一数据里
            // 某个未来的时间戳（时钟被改过）混进来，也不至于把组的顺序打乱
            .sortedByDescending { it.date }
    }

    /** 这一条属于哪个自然日（时间戳缺失的老数据统一落到 [LocalDate.MIN]，排在最末）。 */
    fun dayOf(at: Long, zone: ZoneId = ZoneId.systemDefault()): LocalDate =
        if (at <= 0L) LocalDate.MIN else Instant.ofEpochMilli(at).atZone(zone).toLocalDate()

    /** 组标题怎么念：今天 / 昨天 / 其余走完整日期（由界面按语言格式化 [HistoryGroup.date]）。 */
    fun dayKind(date: LocalDate, now: LocalDate): HistoryDay = when (date) {
        now -> HistoryDay.Today
        now.minusDays(1) -> HistoryDay.Yesterday
        else -> HistoryDay.Dated
    }

    /**
     * 行右侧那个**时刻**（只给时刻，不给日期 —— 日期在组标题上，见 [HistoryGroup]）。
     *
     * [hour24] 由调用方按**系统设置**给（[android.text.format.DateFormat.is24HourFormat]）——
     * 这里不碰 Context，才能留在 JVM 单测里。
     */
    fun clockLabel(at: Long, zone: ZoneId = ZoneId.systemDefault(), hour24: Boolean = true): String =
        DateTimeFormatter.ofPattern(if (hour24) "HH:mm" else "h:mm")
            .format(Instant.ofEpochMilli(at).atZone(zone))

    /**
     * 一行下面的副标题：站点 + 路径（与首页面板同一口径，见 `panelSubtitle`）。
     *
     * 比面板那条多一步 `trimEnd('/')`：面板是先砍查询串再显示的原串，而这里砍完往往
     * 正好把一个目录层级留在最后（`…/a/b/?x=1` → `…/a/b/`），那条尾巴在列表里看着像没写完。
     */
    fun subtitleOf(url: String): String =
        TabNaming.subtitle(url).substringBefore('?').substringBefore('#').trimEnd('/')
}
