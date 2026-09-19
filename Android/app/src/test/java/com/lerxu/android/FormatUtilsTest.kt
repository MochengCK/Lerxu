package com.lerxu.android

import com.lerxu.android.ui.formatBytes
import com.lerxu.android.ui.formatDuration
import com.lerxu.android.ui.formatSpeed
import com.lerxu.android.ui.statusColor
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Locale

/**
 * 展示层纯函数测试（进度/速度/时长格式化与状态配色）。
 *
 * 这些值直接决定任务列表与详情页的文案，回归代价低但覆盖面广。
 * 固定 Locale.ROOT 以消除 `String.format` 的本地化差异（小数点符号等）。
 */
class FormatUtilsTest {

    private lateinit var defaultLocale: Locale

    @Before
    fun setUp() {
        defaultLocale = Locale.getDefault()
        Locale.setDefault(Locale.ROOT)
    }

    @After
    fun tearDown() {
        Locale.setDefault(defaultLocale)
    }

    @Test
    fun `formatBytes handles boundaries`() {
        assertEquals("0 B", formatBytes(0))
        assertEquals("0 B", formatBytes(-1))
        assertEquals("512 B", formatBytes(512))
        assertEquals("1.0 KB", formatBytes(1024))
        assertEquals("1.5 KB", formatBytes(1536))
        assertEquals("1.0 MB", formatBytes(1024L * 1024))
        assertEquals("1.0 GB", formatBytes(1024L * 1024 * 1024))
        assertEquals("1.0 TB", formatBytes(1024L * 1024 * 1024 * 1024))
    }

    @Test
    fun `formatSpeed appends per-second suffix`() {
        assertEquals("0 B/s", formatSpeed(0))
        assertEquals("0 B/s", formatSpeed(-5))
        assertEquals("1.0 KB/s", formatSpeed(1024))
    }

    @Test
    fun `formatDuration renders h m s`() {
        assertEquals("—", formatDuration(-1))
        assertEquals("—", formatDuration(0))
        assertEquals("45s", formatDuration(45))
        assertEquals("1m 5s", formatDuration(65))
        assertEquals("59m 59s", formatDuration(3599))
        assertEquals("1h 0m", formatDuration(3600))
        assertEquals("2h 30m", formatDuration(9000))
    }

    @Test
    fun `statusColor maps each task status`() {
        // 取值与桌面端共用一套（桌面来源 src/shared/colors.json）：
        // 下载中 = 品牌主色；做种/完成 = 同一绿；等待/暂停/已移除 = 同一灰
        assertEquals(0xFF1A7FE0, statusColor("active"))
        assertEquals(0xFF2ACB42, statusColor("seeding"))
        assertEquals(0xFF737373, statusColor("waiting"))
        // 待勾选文件是安卓特有状态，对应桌面 pendingSelection 的 #f0ad4e
        assertEquals(0xFFF0AD4E, statusColor("awaiting_selection"))
        assertEquals(0xFF737373, statusColor("paused"))
        assertEquals(0xFF2ACB42, statusColor("complete"))
        assertEquals(0xFFFF6157, statusColor("error"))
        assertEquals(0xFF737373, statusColor("removed"))
        // 未知状态回落为灰色，不抛异常
        assertEquals(0xFF737373, statusColor("unknown-status"))
    }

    @Test
    fun `formatBytes output stays human readable for large values`() {
        // 极大值不应溢出成负数或丢单位
        val huge = formatBytes(Long.MAX_VALUE)
        assertTrue("异常输出：$huge", huge.contains("TB"))
    }
}
