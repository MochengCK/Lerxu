package com.lerxu.android.ui.screen

import android.content.Context

/**
 * 默认入口：启动 App 时先落在哪一页。
 *
 * 首次启动由引导界面选（见 [OnboardingScreen]），之后在设置的「启动」一栏里改。
 * 只影响**首次组装** AppScreen 时的 landing 页：`page` 本身是 `rememberSaveable`
 * 的，转屏 / 换语言不会把用户从他正在看的页面踢走。
 */
enum class StartPage { Downloader, Browser }

internal object StartPagePrefs {

    const val KEY = "start_page"
    const val VALUE_DOWNLOADER = "downloader"
    const val VALUE_BROWSER = "browser"

    /** 旧的 / 坏的值一律当作**下载器** —— 与历史行为一致（以前固定落在任务页）。 */
    fun parse(raw: String?): StartPage = when (raw) {
        VALUE_BROWSER -> StartPage.Browser
        else -> StartPage.Downloader
    }

    fun key(page: StartPage): String =
        if (page == StartPage.Browser) VALUE_BROWSER else VALUE_DOWNLOADER

    fun read(context: Context): StartPage =
        parse(prefs(context).getString(KEY, null))

    fun write(context: Context, page: StartPage) {
        prefs(context).edit().putString(KEY, key(page)).apply()
    }

    /** 与 [AppScreen] 的 landing 页对应；设置页的弹窗也读它做高亮。 */
    fun toAppPage(page: StartPage): AppPage =
        if (page == StartPage.Browser) AppPage.Browser else AppPage.Tasks

    fun fromAppPage(page: AppPage): StartPage =
        if (page == AppPage.Browser) StartPage.Browser else StartPage.Downloader

    private fun prefs(context: Context) =
        context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
}
