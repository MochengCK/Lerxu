package com.lerxu.android.browser

/** 一条浏览记录：地址、标题（可能为空，取到标题前就落库了）与最后访问时间。 */
data class HistoryEntry(
    val url: String,
    val title: String,
    val visitedAt: Long
)

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
}
