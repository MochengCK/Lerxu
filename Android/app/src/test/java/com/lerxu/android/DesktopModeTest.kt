package com.lerxu.android

import com.lerxu.android.browser.DesktopMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 网页「电脑模式」的纯函数判定。
 *
 * 两件事各自钉住：① UA 里的 Chromium 版本必须**取自设备的默认 UA**（写死版本会被站点当
 * 老浏览器给降级页），且不能带 `Mobile` / `wv` 标记；② 视口脚本只在开着电脑模式时才下发，
 * 且必须放过自家的 `file:` 首页（那里套 1280 会排版全乱）。
 */
class DesktopModeTest {

    private val webViewUa =
        "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 " +
            "Mobile Safari/537.36"

    @Test
    fun desktopUaKeepsDeviceChromiumVersion() {
        val ua = DesktopMode.desktopUserAgent(webViewUa)
        assertTrue(ua, ua.contains("Chrome/120.0.6099.144"))
        // 桌面平台 + 不带手机标记
        assertTrue(ua, ua.contains("Windows NT 10.0"))
        assertFalse(ua, ua.contains("Mobile"))
        assertFalse(ua, ua.contains("; wv"))
        // 版本号之后不能再拖一串（拼错就会变成 Chrome/120.0 x2）
        assertFalse(ua, ua.contains("Chrome/120.0.6099.144.144"))
    }

    @Test
    fun desktopUaFallsBackWhenNoChromeToken() {
        assertEquals(DesktopMode.FALLBACK_UA, DesktopMode.desktopUserAgent(null))
        assertEquals(DesktopMode.FALLBACK_UA, DesktopMode.desktopUserAgent(""))
        assertEquals(
            DesktopMode.FALLBACK_UA,
            DesktopMode.desktopUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36")
        )
    }

    @Test
    fun viewportScriptOnlyWhenEnabled() {
        assertEquals("", DesktopMode.docStartJs(false))
        val js = DesktopMode.docStartJs(true)
        assertTrue(js, js.contains("width=${DesktopMode.VIEWPORT_WIDTH}"))
        // 自家首页（file:）必须放过，否则首页会被排成 1280 宽
        assertTrue(js, js.contains("location.protocol==='file:'"))
        // 脚本自带观察者，`<meta>` 是解析到 head 才出现的，不能只改一次
        assertTrue(js, js.contains("MutationObserver"))
    }
}
