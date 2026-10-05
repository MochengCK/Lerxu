package com.lerxu.android

import com.lerxu.android.browser.MediaProbe
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 播放前"容器探测"的纯函数判定（用户点名的"原生播放器一直报提取器错误"那条的底座）。
 *
 * 这里只测 [MediaProbe.classify]（不碰网络）：判对了容器，播放侧才会把 m3u8 交给
 * HLS 数据源、把"其实是一张网页"的地址当场说清楚。
 */
class MediaProbeTest {

    private fun bytes(s: String) = s.toByteArray(Charsets.UTF_8)

    @Test
    fun detectsHlsManifestByFirstLine() {
        assertEquals(
            MediaProbe.Kind.HLS,
            MediaProbe.classify(bytes("#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10,\n"), "")
        )
        // 响应头写着 mpegurl（有些站点第一行不是 #EXTM3U）
        assertEquals(
            MediaProbe.Kind.HLS,
            MediaProbe.classify(bytes("garbage"), "application/vnd.apple.mpegurl")
        )
        // BOM / 前导空白也要认
        assertEquals(
            MediaProbe.Kind.HLS,
            MediaProbe.classify(bytes("\uFEFF\n\r\n  #EXTM3U\n"), "text/plain")
        )
    }

    @Test
    fun detectsDashManifest() {
        assertEquals(
            MediaProbe.Kind.DASH,
            MediaProbe.classify(bytes("<?xml version=\"1.0\"?><MPD mediaPresentationDuration=\"PT1M\">"), "")
        )
        assertEquals(MediaProbe.Kind.DASH, MediaProbe.classify(bytes("junk"), "application/dash+xml"))
    }

    @Test
    fun detectsHtmlLoginOrErrorPage() {
        assertEquals(
            MediaProbe.Kind.HTML,
            MediaProbe.classify(bytes("<!DOCTYPE html><html><head></head>"), "text/html")
        )
        assertEquals(MediaProbe.Kind.HTML, MediaProbe.classify(bytes("<html><body>login</body>"), "text/plain"))
        // 空白与大小写都吃掉
        assertEquals(MediaProbe.Kind.HTML, MediaProbe.classify(bytes("\n  <HTML>"), ""))
    }

    @Test
    fun detectsBinaryContainers() {
        val mp4 = ByteArray(16).also {
            it[4] = 'f'.code.toByte()
            it[5] = 't'.code.toByte()
            it[6] = 'y'.code.toByte()
            it[7] = 'p'.code.toByte()
        }
        assertEquals(MediaProbe.Kind.PROGRESSIVE, MediaProbe.classify(mp4, ""))
        assertEquals(MediaProbe.Kind.PROGRESSIVE, MediaProbe.classify(bytes("FLV\u0001\u0005"), ""))
        assertEquals(
            MediaProbe.Kind.PROGRESSIVE,
            MediaProbe.classify(byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte()), "")
        )
        // TS：三个同步字（0/188/376）都有才算
        val ts = ByteArray(400).also {
            it[0] = 0x47
            it[188] = 0x47
            it[376] = 0x47
        }
        assertEquals(MediaProbe.Kind.PROGRESSIVE, MediaProbe.classify(ts, ""))
    }

    @Test
    fun unknownStaysUnknownSoPlaybackStillTries() {
        assertEquals(MediaProbe.Kind.UNKNOWN, MediaProbe.classify(ByteArray(0), ""))
        assertEquals(MediaProbe.Kind.UNKNOWN, MediaProbe.classify(bytes("random text body"), ""))
        // 只有一个 0x47 的二进制不当作 TS（否则一大堆二进制会被误判）
        val stray = ByteArray(400).also { it[0] = 0x47 }
        assertEquals(MediaProbe.Kind.UNKNOWN, MediaProbe.classify(stray, ""))
    }

    @Test
    fun rejectedStatusIsFlagged() {
        assertTrue(MediaProbe.Result(MediaProbe.Kind.UNKNOWN, 403).rejected)
        assertTrue(MediaProbe.Result(MediaProbe.Kind.UNKNOWN, 404).rejected)
        assertTrue(MediaProbe.Result(MediaProbe.Kind.UNKNOWN, 401).rejected)
        assertFalse(MediaProbe.Result(MediaProbe.Kind.HLS, 200).rejected)
        assertFalse(MediaProbe.Result().rejected)
    }
}
