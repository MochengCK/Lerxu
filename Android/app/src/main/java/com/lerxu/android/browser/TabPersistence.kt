package com.lerxu.android.browser

/**
 * 标签页持久化的**纯函数**部分（不碰 prefs / WebView，方便单测）。
 *
 * 存 URL 行、与之**逐行对应**的标题行（标题让重启后的卡片立刻有字可读），
 * 活动下标，外加每格的缩略图文件（文件那部分在 [BrowserController]）。
 * 无痕窗口一律不存（见 [BrowserController.persistTabs]）。
 */
internal object TabPersistence {

    /** 分隔符：URL 里不可能出现换行。 */
    private const val SEP = "\n"

    /**
     * 这份列表不值得存 —— 没有非空地址，或者只剩一个自家首页
     *（等于"什么都没开"，留着只会在下次启动时凭空多出一个空白标签页）。
     *
     * 自己先把空白项滤掉，调用方给原始列表也行（少一个出错的机会）。
     */
    fun isTrivial(urls: List<String>): Boolean {
        val stored = urls.filter { it.isNotBlank() }
        return stored.isEmpty() ||
            (stored.size == 1 && stored[0].startsWith(BrowserController.HOME_URL))
    }

    /**
     * 落盘用的两份串：地址行 + 标题行。
     *
     * 只保留地址非空的项，**两份的行数因此一一对应**（下标 i 的标题就是下标 i
     * 那个地址的标题）。标题里的换行换成空格 —— 它是分隔符，漏进去会让两份串错位。
     */
    fun encode(urls: List<String>, titles: List<String>): Pair<String, String> {
        val kept = urls.indices.filter { urls[it].isNotBlank() }
        val urlText = kept.joinToString(SEP) { urls[it] }
        val titleText = kept.joinToString(SEP) {
            titles.getOrElse(it) { "" }.replace(SEP, " ")
        }
        return urlText to titleText
    }

    /** 落盘串还原成 URL 列表（空 / null 都得到空列表）。 */
    fun decode(raw: String?): List<String> =
        raw?.split(SEP)?.filter { it.isNotBlank() } ?: emptyList()

    /** 自建访问栈内部的地址分隔符（URL 里不会出现这个控制字符）。 */
    private const val HIST_SEP = "\u0001"

    /**
     * 每页的**访问地址栈**落盘串：标签页之间用 [SEP] 分（与 [encode] 的 URL
     * 行**一一对应**），栈内用 \u0001 分（没有历史的页留一个空行）。
     *
     * 为什么要自己存一份：WebView 的前后退列表**不跨进程** —— 重启后恢复出来
     * 的页面 `canGoBack()` 恒为 false，"回退到上一层"根本无从谈起（用户点名）。
     * 这份栈由 `doUpdateVisitedHistory` 维护、跟标签页一起落盘，重启后
     * 靠它把上一层找回来。
     */
    fun encodeHistory(histories: List<List<String>>): String =
        histories.joinToString(SEP) { it.joinToString(HIST_SEP) }

    /** 还原每页的访问栈；空行 = 这一页没有记录。 */
    fun decodeHistory(raw: String?): List<List<String>> =
        raw?.split(SEP)?.map { line ->
            if (line.isEmpty()) emptyList() else line.split(HIST_SEP).filter { it.isNotBlank() }
        } ?: emptyList()

    /**
     * 标题串还原：**不过滤空行** —— 空行正是"这一页还没有标题"的占位，
     * 滤掉会让后面的标题整体前移、张冠李戴。
     */
    fun decodeTitles(raw: String?): List<String> = raw?.split(SEP) ?: emptyList()

    /**
     * 活动标签页在**过滤后的列表**里的下标。
     *
     * 空白标签页不落盘，所以下标要按"前面有几个非空地址"重算 —— 直接用原下标会错位
     *（比如 [首页, 空白, 某页] 里选中"某页"，落盘后它是第 1 个而不是第 2 个）。
     */
    fun activeIndexOf(urls: List<String>, activeIndex: Int): Int =
        (urls.take(activeIndex + 1).count { it.isNotBlank() } - 1).coerceAtLeast(0)
}
