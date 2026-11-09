package com.lerxu.android

import com.lerxu.android.browser.DashPair
import com.lerxu.android.browser.SniffKind
import com.lerxu.android.browser.SniffedResource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * **音视频分离流的配对**（B 站那类 DASH 站点的画面与声音是两条地址）。
 *
 * 钉住三件事：① B 站文件名里 `<stem>-<流序号>-<清晰度码>` 的拆法（视频 `-1-30080`、
 * 音频 `-2-30280`，两段的流序号都不同，只切清晰度码会永远配不上）；② 多条音频时取
 * 码最大的那条；③ 清单（m3u8/mpd）不配对 —— 音轨本来就在清单里。
 */
class DashPairTest {

    private fun video(url: String) = SniffedResource(
        url = url, kind = SniffKind.VIDEO, extension = "m4s", pageUrl = "https://www.bilibili.com/video/BV1xx"
    )

    private fun audio(url: String) = SniffedResource(
        url = url, kind = SniffKind.AUDIO, extension = "m4s", pageUrl = "https://www.bilibili.com/video/BV1xx"
    )

    private val videoUrl =
        "https://xy1x2x3x.mcdn.bilivideo.cn:4483/upgcxcode/11/22/333/333-1-30080.m4s?e=1&uipk=9"

    @Test
    fun bilibiliPairsVideoWithItsOwnAudio() {
        val a64 = audio("https://cdn.bilivideo.cn/upgcxcode/11/22/333/333-2-30216.m4s?e=1")
        val a192 = audio("https://cdn.bilivideo.cn/upgcxcode/11/22/333/333-2-30280.m4s?e=1")
        val other = audio("https://cdn.bilivideo.cn/upgcxcode/99/88/777/777-2-30280.m4s?e=1")
        // 列表是"最新在前"：给进去的顺序不影响结论
        val picked = DashPair.pair(video(videoUrl), listOf(other, a64, a192))
        // 多条音频取码最大的那条（30280 = 192K）
        assertEquals(a192.url, picked?.url)
    }

    @Test
    fun bilibiliRefusesWhenStemDiffers() {
        val other = audio("https://cdn.bilivideo.cn/upgcxcode/99/88/777/777-2-30280.m4s")
        assertNull(DashPair.pair(video(videoUrl), listOf(other)))
    }

    @Test
    fun manifestIsNeverPaired() {
        val manifest = SniffedResource(
            url = "https://cdn.example.com/master.m3u8",
            kind = SniffKind.VIDEO,
            extension = "m3u8",
            pageUrl = "https://www.bilibili.com/video/BV1xx"
        )
        val a = audio("https://cdn.example.com/audio-1.m4a")
        // 清单里自带音轨，再配一条会两路同时出声
        assertNull(DashPair.pair(manifest, listOf(a)))
    }

    @Test
    fun genericSameStemPairsByAudioKind() {
        val v = SniffedResource(
            url = "https://cdn.example.com/show/clip-1.mp4",
            kind = SniffKind.VIDEO,
            extension = "mp4",
            pageUrl = "https://example.com/watch"
        )
        val a = SniffedResource(
            url = "https://cdn.example.com/show/clip-2.m4a",
            kind = SniffKind.AUDIO,
            extension = "m4a",
            pageUrl = "https://example.com/watch"
        )
        assertEquals(a.url, DashPair.pair(v, listOf(a))?.url)
    }

    @Test
    fun loneAudioOnPageIsTheLastResort() {
        // 名字完全对不上，但整页只有一条音频 —— 分离播放器几乎都是"一路画面 + 一路声音"
        val v = SniffedResource(
            url = "https://cdn.example.com/a/video.m4s",
            kind = SniffKind.VIDEO,
            extension = "m4s",
            pageUrl = "https://example.com/watch"
        )
        val a = SniffedResource(
            url = "https://cdn.example.com/b/sound.m4a",
            kind = SniffKind.AUDIO,
            extension = "m4a",
            pageUrl = "https://example.com/watch"
        )
        assertEquals(a.url, DashPair.pair(v, listOf(a))?.url)
        // 两条音频就不猜了（多视频页会把别的片子的声音配进来）
        val a2 = a.copy(url = "https://cdn.example.com/b/sound2.m4a")
        assertNull(DashPair.pair(v, listOf(a, a2)))
    }

    @Test
    fun otherPageAudioIsIgnored() {
        val v = video(videoUrl)
        val a = audio("https://cdn.bilivideo.cn/upgcxcode/11/22/333/333-2-30280.m4s")
            .copy(pageUrl = "https://www.bilibili.com/video/BV_other")
        assertNull(DashPair.pair(v, listOf(a)))
    }

    @Test
    fun genericStemStripsOneTrailingNumber() {
        assertEquals("/a/b/clip", DashPair.genericStem("https://h/a/b/clip-1.mp4"))
        assertEquals("/a/b/clip", DashPair.genericStem("https://h/a/b/clip_2.m4a"))
        assertEquals("/a/b/clip", DashPair.genericStem("https://h/a/b/clip.mp4"))
        // 只切一段：中段数字是身份的一部分
        assertEquals("/a/b/clip-1", DashPair.genericStem("https://h/a/b/clip-1-2.mp4"))
    }
}
