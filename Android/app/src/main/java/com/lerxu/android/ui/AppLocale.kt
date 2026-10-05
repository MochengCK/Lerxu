package com.lerxu.android.ui

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import java.util.Locale

/**
 * 应用语言：**运行时切换，不重建 Activity**（2026-10-03 重做）。
 *
 * 为什么要重做（用户："切换语言还是会崩溃 —— 直接重做一下切换语言系统吧"）：
 * 上一版是"写偏好 → `recreate()`"，而 `recreate()` 要拆掉整棵视图树、再拆掉当时挂着的
 * **两层 Dialog 窗口**（设置那张 `ModalBottomSheet` + 语言选择弹窗），谁先谁后都有一拍
 * 对不上的窗口生命周期 —— 推迟重建只是把窗口往前挪，治不了根。语言这档事**根本不需要**
 * 重建 Activity：把整棵 Compose 树外面套一层"换过 Configuration 的局部环境"就够了。
 *
 * 三条路各管一段，缺一不可：
 * - **Compose 里的文字**（`stringResource`）：material3/compose 的 `stringResource` 读的是
 *   `LocalResources`，而它的默认实现 = `LocalContext.current.resources`，只在
 *   `LocalConfiguration` 变化时失效重取。所以这里**同时**提供
 *   `LocalConfiguration`（换过 locale 的 Configuration）与 `LocalResources`
 *   （用那份 Configuration 造出来的 Resources）—— 两个一起换，读到的就是新语言；
 * - **非 Compose 的文字**（`SimpleDateFormat` / `Locale.getDefault()` / Toast /
 *   `AbstractStringBuilder` 之类）：靠 [Locale.setDefault] —— 顺手把进程默认语言也切过去，
 *   播放器状态栏那枚时钟、`DateFormat` 的 12/24 小时制都跟着走；
 * - **冷启动**：`MainActivity.attachBaseContext` 仍然按偏好套一份 Configuration ——
 *   那一层管的是"进程刚起来、还没进 Compose"的那段时间（首帧就是对的，不会闪一下旧语言）。
 *
 * 注意"跟随系统"那一档：系统语言从 [Resources.getSystem] 取（那份配置**不受**我们
 * `attachBaseContext` 的覆盖影响），而不是 `Locale.getDefault()`——后者可能已经被
 * 我们上一次 [Locale.setDefault] 改过。
 */
object AppLocale {

    /** "跟随系统"在偏好里的存档值（空串；历史数据里也出现过 `"system"`，两个都认）。 */
    const val FOLLOW_SYSTEM = ""

    const val PREFS_NAME = "lerxu_prefs"
    const val KEY_LANGUAGE = "language"

    /**
     * 当前选择。**全局 Compose 状态**（不是某个 composable 的 `remember`）：
     * 播放器那两棵 ComposeView（控件层 / 弹窗层）挂在 decorView 上、不在主树里，
     * 只有走全局状态它们才会跟着换语言。
     */
    var current: String by mutableStateOf(FOLLOW_SYSTEM)
        private set

    /** 进程内的**系统**语言（见类注释：不能用 `Locale.getDefault()`）。 */
    val systemLocale: Locale
        get() = Resources.getSystem().configuration.locales[0]

    /** 启动时读一次偏好（`MainActivity.onCreate`）。 */
    fun load(context: Context) {
        current = read(context)
    }

    /** 存档里的选择（不触发重组，读盘用）。 */
    fun read(context: Context): String = prefs(context)
        .getString(KEY_LANGUAGE, FOLLOW_SYSTEM) ?: FOLLOW_SYSTEM

    /**
     * 用户选了一档：写偏好 + 推状态。**没有 `recreate()`** —— 状态一变，
     * [ProvideAppLanguage] 那一层就换掉 Configuration，整棵树当帧就是新语言。
     */
    fun select(context: Context, tag: String) {
        prefs(context).edit().putString(KEY_LANGUAGE, tag).apply()
        current = tag
    }

    /** 偏好值 → Locale（"跟随系统" / 历史值 `"system"` 都落到系统语言）。 */
    fun localeOf(tag: String): Locale =
        if (tag.isEmpty() || tag == "system") systemLocale else Locale.forLanguageTag(tag)

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}

/**
 * 把整棵 Compose 树切到 [AppLocale.current] 那一档语言（见 [AppLocale] 的类注释）。
 *
 * 用法：主树（`MainActivity.setContent` 里）与**播放器那两棵独立的 ComposeView** 都要套 ——
 * 少套一个，那一处的按钮 / 弹窗就还是老语言。
 */
@Composable
fun ProvideAppLanguage(content: @Composable () -> Unit) {
    val tag = AppLocale.current
    val context = LocalContext.current
    val locale = remember(tag) { AppLocale.localeOf(tag) }
    val configuration = remember(locale, context) {
        Configuration(context.resources.configuration).apply { setLocale(locale) }
    }
    // 用那份 Configuration 现造一份 Resources：`stringResource` 拿的就是它
    val resources = remember(configuration, context) {
        context.createConfigurationContext(configuration).resources
    }
    // 非 Compose 那条路（SimpleDateFormat / DateFormat / Locale.getDefault()）跟着切
    SideEffect { Locale.setDefault(locale) }
    CompositionLocalProvider(
        LocalConfiguration provides configuration,
        LocalResources provides resources
    ) {
        content()
    }
}
