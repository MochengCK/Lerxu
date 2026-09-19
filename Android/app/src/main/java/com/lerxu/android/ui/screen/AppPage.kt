package com.lerxu.android.ui.screen

/**
 * 底部导航的三个页面。
 *
 * 任务页是主页面：系统返回键在其它页面时先回到任务页（浏览器页内部
 * 还能后退时先让 WebView 后退，见 BrowserScreen 里的 BackHandler）。
 */
enum class AppPage { Tasks, Browser, Settings }
