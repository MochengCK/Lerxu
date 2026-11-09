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

    /**
     * 页面报的是 CSS px，原生那边要的是 dp —— 电脑模式下这两者差三倍多。
     *
     * 这是"网页处于桌面版时原生播放器出问题"的根因：播放器把页面报的 CSS px 当成 dp 用，
     * 位置与尺寸都被放大 `1280 / 屏宽dp` 倍（360dp 的屏上是 3.55 倍）。
     */
    @Test
    fun cssToDpShrinksOnDesktopLayout() {
        assertEquals(360f / DesktopMode.VIEWPORT_WIDTH, DesktopMode.cssToDpFactor(360f), 1e-5f)
        assertEquals(720f / DesktopMode.VIEWPORT_WIDTH, DesktopMode.cssToDpFactor(720f), 1e-5f)
        // 1280dp 宽的屏（平板横置）：整版正好铺满，1px 就是 1dp
        assertEquals(1f, DesktopMode.cssToDpFactor(1280f), 1e-5f)
    }

    /** 还没量到宽度（0）时不许除出 0 —— 返回 1 让上层退回"CSS px 当 dp"的老口径。 */
    @Test
    fun cssToDpIsOneWhenWidthUnknown() {
        assertEquals(1f, DesktopMode.cssToDpFactor(0f), 1e-5f)
        assertEquals(1f, DesktopMode.cssToDpFactor(-10f), 1e-5f)
    }

    /** 窄到离谱/宽到离谱的窗口不许把系数带出 (0,1]：那是"播放器缩成一条 / 撑出屏"的来源。 */
    @Test
    fun cssToDpIsClamped() {
        assertTrue(DesktopMode.cssToDpFactor(4000f) <= 1f)
        assertTrue(DesktopMode.cssToDpFactor(1f) > 0f)
    }
}
