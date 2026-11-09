package com.lerxu.android.browser

/** 一条书签：地址、标题（加的时候是网页标题，取不到就退回域名）与加入时间。 */
data class Bookmark(
    val url: String,
    val title: String,
    val addedAt: Long
)

/**
 * 书签：全局一份，「最后加入的在前」。
 *
 * 与 [BrowseHistory] 是两套东西，**故意不共用**：
 * - 历史是"自动记"的（每访问一次就写、按 URL 置顶、有上限 300 条就会被挤掉）；
 * - 书签是"用户手动收"的 —— 只在他按下「加入书签」时变，**不会因为访问别处而消失**。
 *
 * 两条规则：
 * ① **同一 URL 只留一条**：再收一次只是把标题刷新、位置置顶，不新增；
 * ② **内部页不收**（首页 / about: / data: 等）—— 与历史同一个判据 [BrowseHistory.isRecordable]。
 *
 * 全部是纯函数 + 一个编解码，落盘放在 BrowserController —— 这样规则能直接单测。
 */
object Bookmarks {

    /** 上限：书签是用户自己攒的，给得比历史宽；到位之后挤掉**最旧**的那条。 */
    const val MAX_ENTRIES = 500

    private const val FIELD_SEP = '\t'
    private const val ROW_SEP = '\n'
    private const val MAX_TITLE = 200

    /** 这个地址能不能收：内部页、空白页与脚本式地址一律不收（与历史同一口径）。 */
    fun isBookmarkable(url: String?): Boolean = BrowseHistory.isRecordable(url)

    /** 这个地址是不是已经收过了。 */
    fun contains(list: List<Bookmark>, url: String?): Boolean {
        val clean = url?.trim().orEmpty()
        if (clean.isEmpty()) return false
        return list.any { it.url == clean }
    }

    /**
     * 收一条：同 URL 覆盖（标题刷新 + 置顶），超出上限截断。
     *
     * 标题取不到（重定向中途、标题还没来）时**退回域名**而不是留空 —— 列表里一行空标题
     * 谁也认不出是哪一页。
     */
    fun add(
        list: List<Bookmark>,
        url: String,
        title: String,
        now: Long
    ): List<Bookmark> {
        if (!isBookmarkable(url)) return list
        val clean = url.trim()
        val name = title.trim().take(MAX_TITLE).ifEmpty { BrowseHistory.hostOf(clean) }
        return (listOf(Bookmark(clean, name, now)) + list.filterNot { it.url == clean })
            .take(MAX_ENTRIES)
    }

    /** 删掉这些地址（传地址不传下标：界面那份列表与存储同序，但地址才是身份）。 */
    fun remove(list: List<Bookmark>, urls: Collection<String>): List<Bookmark> {
        if (urls.isEmpty()) return list
        val drop = urls.mapTo(HashSet()) { it.trim() }
        return list.filterNot { it.url in drop }
    }

    /** 去重（保留最靠前的一条）并截断：读盘后兜底，防止旧格式或手改过的文件带进脏数据。 */
    fun normalize(list: List<Bookmark>): List<Bookmark> {
        val seen = HashSet<String>()
        return list.filter { it.url.isNotEmpty() && seen.add(it.url) }.take(MAX_ENTRIES)
    }

    /** 列表里显示的一行文字：有标题用标题，没有就退回域名。 */
    fun displayTitle(bookmark: Bookmark): String =
        bookmark.title.trim().ifEmpty { BrowseHistory.hostOf(bookmark.url) }

    /** 落盘：每行 `addedAt \t url \t title`（分隔符是行/列边界，标题里必须清掉）。 */
    fun encode(list: List<Bookmark>): String =
        list.joinToString(ROW_SEP.toString()) { b ->
            b.addedAt.toString() + FIELD_SEP + b.url + FIELD_SEP + sanitize(b.title)
        }

    /** 读盘：坏行直接跳过，不抛异常（书签文件坏了也不该影响启动）。 */
    fun decode(raw: String?): List<Bookmark> {
        if (raw.isNullOrBlank()) return emptyList()
        val rows = raw.split(ROW_SEP).mapNotNull { row ->
            if (row.isBlank()) return@mapNotNull null
            val parts = row.split(FIELD_SEP, limit = 3)
            if (parts.size < 2) return@mapNotNull null
            val url = parts[1]
            if (!isBookmarkable(url)) return@mapNotNull null
            Bookmark(
                url = url,
                title = parts.getOrElse(2) { "" },
                addedAt = parts[0].toLongOrNull() ?: 0L
            )
        }
        return normalize(rows)
    }

    /** 标题里出现制表符 / 换行会把行格式撑坏（那是分隔符）。 */
    private fun sanitize(title: String): String =
        title.replace(FIELD_SEP, ' ').replace(ROW_SEP, ' ').take(MAX_TITLE)
}
