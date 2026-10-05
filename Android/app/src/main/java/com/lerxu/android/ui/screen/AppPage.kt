package com.lerxu.android.ui.screen

/**
 * 底部导航的两个页面。
 *
 * 任务页是主页面：系统返回键在浏览器页时先回到任务页（浏览器页内部
 * 还能后退时先让 WebView 后退，见 BrowserScreen 里的 BackHandler）。
 *
 * 设置**不再是一页**（用户点名改成底部弹窗，见 SettingsScreen）：它由 AppScreen 里
 * 一个 `settingsOpen` 开关控制，关掉就回到原页面 —— 于是这里没有 Settings，
 * 也不再需要"从哪一页进来"的返回目标规则。
 */
enum class AppPage { Tasks, Browser }
