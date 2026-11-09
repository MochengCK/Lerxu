package com.lerxu.android

import com.lerxu.android.browser.Bookmarks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 书签的纯函数规则。
 *
 * 钉住四件事：① 同一地址再收一次只是**刷新标题 + 置顶**，不会出两条；② 内部页（自家首页）
 * 收不了；③ 落盘 / 读盘一趟回来内容不变，标题里的分隔符必须被清掉（否则一条书签会把行格式
 * 撑成两条坏数据）；④ 超上限时挤掉最旧的那条。
 */
class BookmarksTest {

    private val now = 1_700_000_000_000L

    @Test
    fun addDeduplicatesAndMovesToTop() {
        var list = Bookmarks.add(emptyList(), "https://a.com/1", "A", now)
        list = Bookmarks.add(list, "https://b.com/2", "B", now + 1)
        assertEquals(listOf("https://b.com/2", "https://a.com/1"), list.map { it.url })

        // 老地址再收一次：还是两条，但回到最前、标题刷成新的
        list = Bookmarks.add(list, "https://a.com/1", "A2", now + 2)
        assertEquals(2, list.size)
        assertEquals("https://a.com/1", list[0].url)
        assertEquals("A2", list[0].title)
    }

    @Test
    fun internalPagesAreNotBookmarkable() {
        assertFalse(Bookmarks.isBookmarkable("file:///android_asset/browser-home.html"))
        assertFalse(Bookmarks.isBookmarkable("about:blank"))
        assertFalse(Bookmarks.isBookmarkable(""))
        assertTrue(Bookmarks.isBookmarkable("https://example.com"))

        // 直接往里加也不会进列表
        val list = Bookmarks.add(emptyList(), "file:///android_asset/browser-home.html", "首页", now)
        assertTrue(list.isEmpty())
    }

    @Test
    fun emptyTitleFallsBackToHost() {
        val list = Bookmarks.add(emptyList(), "https://news.ycombinator.com/item?id=1", "  ", now)
        assertEquals("news.ycombinator.com", Bookmarks.displayTitle(list[0]))
    }

    @Test
    fun removeDropsByUrl() {
        var list = Bookmarks.add(emptyList(), "https://a.com", "A", now)
        list = Bookmarks.add(list, "https://b.com", "B", now)
        list = Bookmarks.remove(list, listOf("https://a.com"))
        assertEquals(listOf("https://b.com"), list.map { it.url })
        // 不存在的地址：原样返回（调用方据此判断"没变"、不必落盘）
        assertEquals(list, Bookmarks.remove(list, listOf("https://nope.com")))
    }

    @Test
    fun containsIgnoresSurroundingSpaces() {
        val list = Bookmarks.add(emptyList(), "https://a.com", "A", now)
        assertTrue(Bookmarks.contains(list, " https://a.com "))
        assertFalse(Bookmarks.contains(list, "https://a.com/x"))
        assertFalse(Bookmarks.contains(list, null))
    }

    @Test
    fun encodeDecodeRoundTripSanitizesSeparators() {
        // 标题里的制表符 / 换行是行格式的分隔符：不清理的话一条书签会被读成两条坏数据
        val list = Bookmarks.add(emptyList(), "https://a.com", "A\tB\nC", now)
        val back = Bookmarks.decode(Bookmarks.encode(list))
        assertEquals(1, back.size)
        assertEquals("https://a.com", back[0].url)
        assertEquals("A B C", back[0].title)
        assertEquals(now, back[0].addedAt)
    }

    @Test
    fun decodeSkipsBrokenRows() {
        val raw = buildString {
            append("1700000000000\thttps://ok.com\tOK\n")
            append("garbage-row\n")                       // 没有分隔符
            append("1700000000000\tfile:///android_asset/x\t内部页\n") // 内部页
        }
        val list = Bookmarks.decode(raw)
        assertEquals(1, list.size)
        assertEquals("https://ok.com", list[0].url)
        assertTrue(Bookmarks.decode(null).isEmpty())
    }

    @Test
    fun overLimitDropsOldest() {
        var list = emptyList<com.lerxu.android.browser.Bookmark>()
        repeat(Bookmarks.MAX_ENTRIES + 5) { i ->
            list = Bookmarks.add(list, "https://site/$i", "S$i", now + i)
        }
        assertEquals(Bookmarks.MAX_ENTRIES, list.size)
        // 最新的在最前，最旧的那几条已经被挤掉
        assertEquals("https://site/${Bookmarks.MAX_ENTRIES + 4}", list[0].url)
        assertFalse(list.any { it.url == "https://site/0" })
    }
}
