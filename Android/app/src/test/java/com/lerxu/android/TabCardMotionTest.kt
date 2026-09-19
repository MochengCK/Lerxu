package com.lerxu.android.ui.screen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 标签卡片的出入场曲线（`tabCardProgress`）：由网格开合进度直接映射，
 * 因此**可正可反**（开关来回拖不会卡在半路）。
 *
 * 入场与退场是两套节奏：
 * - 入场：按索引错开起步（后面的卡片稍晚一点），最后一起到位；
 * - 退场：**不错开、更快**（进度掉到一半之前就退干净），收网格时卡片们
 *   一起利落地让位给放大回来的整页。
 */
class TabCardMotionTest {

    @Test
    fun `closed grid hides every card`() {
        for (index in 0 until 8) {
            assertEquals(0f, tabCardProgress(0f, index, entering = true), 0.0001f)
            assertEquals(0f, tabCardProgress(0f, index, entering = false), 0.0001f)
        }
    }

    @Test
    fun `fully open grid shows every card`() {
        for (index in 0 until 8) {
            assertEquals(1f, tabCardProgress(1f, index, entering = true), 0.0001f)
            assertEquals(1f, tabCardProgress(1f, index, entering = false), 0.0001f)
        }
    }

    @Test
    fun `later cards start later but all finish together`() {
        // 同一个进度下，越靠后的卡片越"没到位"
        val open = 0.45f
        val first = tabCardProgress(open, 0, entering = true)
        val third = tabCardProgress(open, 2, entering = true)
        val eighth = tabCardProgress(open, 7, entering = true)
        assertTrue("first=$first third=$third eighth=$eighth", first > third)
        assertTrue("first=$first third=$third eighth=$eighth", third > eighth)
        // 起步之前恒为 0（不是负数，也不是"先露一点"）
        assertEquals(0f, tabCardProgress(0.05f, 7, entering = true), 0.0001f)
    }

    @Test
    fun `exit is not staggered and finishes early`() {
        // 退场：所有卡片同一条曲线，且进度过半之前就退干净
        for (index in 0 until 8) {
            assertEquals(
                tabCardProgress(0.5f, 0, entering = false),
                tabCardProgress(0.5f, index, entering = false),
                0.0001f
            )
        }
        assertEquals(1f, tabCardProgress(0.45f, 3, entering = false), 0.0001f)
        assertEquals(0f, tabCardProgress(0f, 3, entering = false), 0.0001f)
        assertTrue(tabCardProgress(0.2f, 3, entering = false) > 0f)
    }

    @Test
    fun `curve is monotonic so dragging back and forth stays continuous`() {
        for (entering in listOf(true, false)) {
            for (index in 0 until 8) {
                var previous = -1f
                var open = 0f
                while (open <= 1.0001f) {
                    val value = tabCardProgress(open, index, entering)
                    assertTrue("entering=$entering index=$index open=$open", value >= previous - 0.0001f)
                    previous = value
                    open += 0.05f
                }
            }
        }
    }

    @Test
    fun `huge index cannot push the curve past its span`() {
        // 错开量有上限：标签很多时不能出现"最后一张永远到不了 1"
        assertEquals(1f, tabCardProgress(1f, 40, entering = true), 0.0001f)
        assertEquals(0f, tabCardProgress(0.3f, 40, entering = true), 0.0001f)
        assertTrue(tabCardProgress(0.36f, 40, entering = true) > 0f)
    }
}
