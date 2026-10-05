package com.lerxu.android

import com.lerxu.android.browser.SniffKind
import com.lerxu.android.browser.SniffedResource
import com.lerxu.android.browser.VideoSniffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 挑源规则：把**哪一条**嗅探结果交给原生播放器。
 *
 * 这条规则直接决定"能不能播"：嗅探列表是**最新在前**的，而 hls.js 起播时先拉清单、
 * 紧接着就狂拉分片 —— 原来那句 `firstOrNull { kind == VIDEO }` 于是拿到一只**分片**。
 * 加密分片是一团随机字节，两路播放各失败一次（不是 `#EXTM3U` / 没有提取器认得），
 * 用户看到的就是"加密的 m3u8 播不了"（2026-10-04 连报两次）。
 */
class VideoSnifferPickTest {

    private fun res(url: String, ext: String, kind: SniffKind = SniffKind.VIDEO) =
        SniffedResource(url = url, kind = kind, extension = ext)

    /** **清单优先于分片** —— 这一条就是那个 bug 的回归测试。 */
    @Test
    fun `manifest wins over the segments that were sniffed after it`() {
        // 最新在前：分片在前，清单在后面（这就是真实列表的样子）
        val list = listOf(
            res("https://cdn/a/seg-003.ts", "ts"),
            res("https://cdn/a/seg-002.ts", "ts"),
            res("https://cdn/a/index.m3u8", "m3u8")
        )
        assertEquals("https://cdn/a/index.m3u8", VideoSniffer.pickForPlayback(list)?.url)
    }

    /** 自包含单文件也优先于分片（mp4 一个地址就是一部片子）。 */
    @Test
    fun `progressive file wins over segments too`() {
        val list = listOf(
            res("https://cdn/a/seg.ts", "ts"),
            res("https://cdn/a/movie.mp4", "mp4")
        )
        assertEquals("https://cdn/a/movie.mp4", VideoSniffer.pickForPlayback(list)?.url)
    }

    /** 清单 > 自包含单文件（有清单时清单才是"整路"的入口）。 */
    @Test
    fun `manifest wins over a progressive file`() {
        val list = listOf(
            res("https://cdn/a/trailer.mp4", "mp4"),
            res("https://cdn/a/master.m3u8", "m3u8")
        )
        assertEquals("https://cdn/a/master.m3u8", VideoSniffer.pickForPlayback(list)?.url)
    }

    /** 同档取**最新的那份**（列表顺序即"最新在前"）。 */
    @Test
    fun `same rank keeps the newest entry`() {
        val list = listOf(
            res("https://cdn/a/variant.m3u8", "m3u8"),
            res("https://cdn/a/master.m3u8", "m3u8")
        )
        assertEquals("https://cdn/a/variant.m3u8", VideoSniffer.pickForPlayback(list)?.url)
    }

    /** DASH 的 mpd 与 HLS 的 m3u8 同档。 */
    @Test
    fun `dash manifest ranks with hls`() {
        val list = listOf(
            res("https://cdn/a/seg.m4s", "m4s"),
            res("https://cdn/a/manifest.mpd", "mpd")
        )
        assertEquals("https://cdn/a/manifest.mpd", VideoSniffer.pickForPlayback(list)?.url)
    }

    /** 影音同场：要的是画面，音频排最后。 */
    @Test
    fun `audio loses to video`() {
        val list = listOf(
            res("https://cdn/a/audio.m4a", "m4a", SniffKind.AUDIO),
            res("https://cdn/a/movie.mp4", "mp4")
        )
        assertEquals("https://cdn/a/movie.mp4", VideoSniffer.pickForPlayback(list)?.url)
    }

    /** 什么都没有时返回 null（调用方接着轮询等清单出现），**别**硬塞一条。 */
    @Test
    fun `empty list yields nothing`() {
        assertNull(VideoSniffer.pickForPlayback(emptyList()))
    }

    /**
     * **"先只要不是分片的"**（`pickPlayable(avoidSegments = true)` 用的就是它）：
     * 为的是给清单留出进列表的时间，而不是第一时间把一只分片当成一路流去播。
     */
    @Test
    fun `avoids segments while a manifest may still arrive`() {
        val onlySegments = listOf(
            res("https://cdn/a/seg-003.ts", "ts"),
            res("https://cdn/a/seg-002.ts", "ts")
        )
        // 筛掉分片之后没得挑 ⇒ 返回 null（调用方继续轮询等清单），而不是硬塞一只分片
        assertNull(
            VideoSniffer.pickForPlayback(
                onlySegments.filter { VideoSniffer.playbackRank(it) < VideoSniffer.RANK_SEGMENT }
            )
        )
        // 清单一旦进了列表就立刻可挑
        val withManifest = onlySegments + res("https://cdn/a/index.m3u8", "m3u8")
        assertEquals(
            "https://cdn/a/index.m3u8",
            VideoSniffer.pickForPlayback(
                withManifest.filter { VideoSniffer.playbackRank(it) < VideoSniffer.RANK_SEGMENT }
            )?.url
        )
    }

    /** 只有分片时仍取它（比一条都不给强），且取最新的那只。 */
    @Test
    fun `segments only still pick the newest`() {
        val list = listOf(
            res("https://cdn/a/seg-010.ts", "ts"),
            res("https://cdn/a/seg-009.ts", "ts")
        )
        assertEquals("https://cdn/a/seg-010.ts", VideoSniffer.pickForPlayback(list)?.url)
    }
}
