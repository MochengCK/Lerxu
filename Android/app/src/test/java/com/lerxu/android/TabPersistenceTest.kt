package com.lerxu.android.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 标签页持久化的纯函数：只在"普通窗口"存，空白标签页不落盘（下标要重算），
 * 标题与地址**逐行对应**。
 */
class TabPersistenceTest {

    private val home = BrowserController.HOME_URL
    private val a = "https://example.com/a"
    private val b = "https://example.com/b"

    @Test
    fun `nothing worth storing when there is no real url`() {
        assertTrue(TabPersistence.isTrivial(emptyList()))
        assertTrue(TabPersistence.isTrivial(listOf("", "  ")))
        assertTrue(TabPersistence.isTrivial(listOf(home)))
    }

    @Test
    fun `a real page is worth storing even next to home`() {
        assertFalse(TabPersistence.isTrivial(listOf(a)))
        assertFalse(TabPersistence.isTrivial(listOf(home, a)))
    }

    @Test
    fun `encode drops blank tabs and decode restores order`() {
        val (urls, titles) = TabPersistence.encode(
            listOf(a, "", b, " "),
            listOf("A", "空", "B", "空")
        )
        assertEquals("$a\n$b", urls)
        assertEquals("A\nB", titles)
        assertEquals(listOf(a, b), TabPersistence.decode(urls))
        assertEquals(emptyList<String>(), TabPersistence.decode(null))
        assertEquals(emptyList<String>(), TabPersistence.decode(""))
        assertEquals(emptyList<String>(), TabPersistence.decode("\n\n"))
    }

    @Test
    fun `round trip keeps every non blank url`() {
        val urls = listOf("", a, home, b, "")
        val (encoded, _) = TabPersistence.encode(urls, List(urls.size) { "" })
        assertEquals(listOf(a, home, b), TabPersistence.decode(encoded))
    }

    @Test
    fun `titles stay aligned with urls line by line`() {
        // 中间那页还没标题 → 标题串里就是空行，**不能把它滤掉**
        //（滤掉会让后面那页的标题整体前移，卡片张冠李戴）
        val (urls, titles) = TabPersistence.encode(listOf(a, b, home), listOf("A", "", "首页"))
        assertEquals("$a\n$b\n$home", urls)
        assertEquals("A\n\n首页", titles)
        assertEquals(listOf("A", "", "首页"), TabPersistence.decodeTitles(titles))
        // 行数一一对应
        assertEquals(TabPersistence.decode(urls).size, TabPersistence.decodeTitles(titles).size)
    }

    @Test
    fun `title with a newline cannot shift the list`() {
        val (urls, titles) = TabPersistence.encode(listOf(a, b), listOf("多行\n标题", "B"))
        assertEquals("多行 标题\nB", titles)
        assertEquals(TabPersistence.decode(urls).size, TabPersistence.decodeTitles(titles).size)
    }

    @Test
    fun `missing titles decode as empty lines`() {
        assertEquals(emptyList<String>(), TabPersistence.decodeTitles(null))
        // 标题比地址少时调用方用 getOrElse 兜底，这里只保证不炸
        assertEquals(listOf("A"), TabPersistence.decodeTitles("A"))
    }

    @Test
    fun `history round trip keeps per tab stacks aligned`() {
        // 两页：第 1 页有完整访问链，第 2 页只有当前地址
        val encoded = TabPersistence.encodeHistory(
            listOf(listOf(home, a, b), listOf(a))
        )
        assertEquals(
            listOf(listOf(home, a, b), listOf(a)),
            TabPersistence.decodeHistory(encoded)
        )
        // 行数与 URL 行一一对应（没有记录的那页留空行，不能错位）
        val (urls, _) = TabPersistence.encode(listOf(a, b, home), List(3) { "" })
        val withEmpty = TabPersistence.encodeHistory(listOf(listOf(home, a), emptyList(), listOf(b)))
        assertEquals(TabPersistence.decode(urls).size, TabPersistence.decodeHistory(withEmpty).size)
        assertEquals(emptyList<List<String>>(), TabPersistence.decodeHistory(null))
        assertEquals(listOf(emptyList<String>()), TabPersistence.decodeHistory(""))
    }

    @Test
    fun `active index is recomputed after blank tabs are dropped`() {
        // [首页, 空白, 某页] 选中"某页"（原下标 2）→ 落盘后它是第 1 个
        assertEquals(1, TabPersistence.activeIndexOf(listOf(home, "", a), 2))
        assertEquals(0, TabPersistence.activeIndexOf(listOf(home, "", a), 0))
        // 选中的本身就是空白页 → 退回它前面那个
        assertEquals(0, TabPersistence.activeIndexOf(listOf(home, "", a), 1))
        assertEquals(1, TabPersistence.activeIndexOf(listOf(a, b), 1))
        // 越界 / 全是空白都不该算出负数
        assertEquals(0, TabPersistence.activeIndexOf(listOf("", ""), 5))
    }
}
