package com.lerxu.android.ui.screen

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 默认入口的纯逻辑：坏值 / 空值一律退回**下载器**（与历史行为一致 —— 以前固定落任务页）。
 */
class StartPageTest {

    @Test
    fun `missing or unknown value falls back to downloader`() {
        assertEquals(StartPage.Downloader, StartPagePrefs.parse(null))
        assertEquals(StartPage.Downloader, StartPagePrefs.parse(""))
        assertEquals(StartPage.Downloader, StartPagePrefs.parse("tasks"))
        assertEquals(StartPage.Downloader, StartPagePrefs.parse("Downloader"))
    }

    @Test
    fun `browser value round trips`() {
        assertEquals(StartPage.Browser, StartPagePrefs.parse("browser"))
        assertEquals("browser", StartPagePrefs.key(StartPage.Browser))
        assertEquals("downloader", StartPagePrefs.key(StartPage.Downloader))
    }

    @Test
    fun `maps onto the landing page`() {
        assertEquals(AppPage.Tasks, StartPagePrefs.toAppPage(StartPage.Downloader))
        assertEquals(AppPage.Browser, StartPagePrefs.toAppPage(StartPage.Browser))
        // 设置页那一栏要能反映"当前入口"；设置页本身不算入口（读回来当下载器）
        assertEquals(StartPage.Browser, StartPagePrefs.fromAppPage(AppPage.Browser))
        assertEquals(StartPage.Downloader, StartPagePrefs.fromAppPage(AppPage.Settings))
    }
}
