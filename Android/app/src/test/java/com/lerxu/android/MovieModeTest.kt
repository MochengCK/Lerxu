package com.lerxu.android

import com.lerxu.android.browser.SniffKind
import com.lerxu.android.browser.SniffedResource
import com.lerxu.android.browser.looksLikeMoviePage
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 影视模式的识别判据（[looksLikeMoviePage]）。
 *
 * 这三条判据是"通用启发式"的全部依据：不认域名、不要站点名单。规则一旦放宽，
 * 用户侧的体感是"随便点开个网页就被换成影视页"（首页广告位、装饰性背景片、
 * 后台预加载下一集都会把它撞开）；一旦收紧成"必须有流才算"，又会漏掉那些
 * 还没起播、只有播放器元素的影视页。所以这里把四个方向都钉死。
 */
class MovieModeTest {

    private fun video(url: String = "https://cdn.example.com/v/1.mp4") =
        SniffedResource(url = url, kind = SniffKind.VIDEO)

    private fun audio(url: String = "https://cdn.example.com/a/1.mp3") =
        SniffedResource(url = url, kind = SniffKind.AUDIO)

    @Test
    fun `home page never counts even with video element and stream`() {
        assertFalse(
            looksLikeMoviePage(
                hasPlayerVideo = true,
                sniffed = listOf(video()),
                isHomePage = true
            )
        )
    }

    @Test
    fun `no player video element means not a movie page`() {
        assertFalse(
            looksLikeMoviePage(
                hasPlayerVideo = false,
                sniffed = listOf(video()),
                isHomePage = false
            )
        )
    }

    @Test
    fun `audio only stream means not a movie page`() {
        assertFalse(
            looksLikeMoviePage(
                hasPlayerVideo = true,
                sniffed = listOf(audio()),
                isHomePage = false
            )
        )
    }

    @Test
    fun `empty sniffed list means not a movie page`() {
        assertFalse(
            looksLikeMoviePage(
                hasPlayerVideo = true,
                sniffed = emptyList(),
                isHomePage = false
            )
        )
    }

    @Test
    fun `all three conditions hold`() {
        assertTrue(
            looksLikeMoviePage(
                hasPlayerVideo = true,
                sniffed = listOf(audio(), video()),
                isHomePage = false
            )
        )
    }
}
