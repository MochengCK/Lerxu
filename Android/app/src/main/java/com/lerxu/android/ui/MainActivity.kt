package com.lerxu.android.ui

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.*
import androidx.core.content.edit
import com.lerxu.android.engine.EngineService
import com.lerxu.android.update.UpdateManager
import com.lerxu.android.ui.screen.OnboardingTransition
import com.lerxu.android.ui.screen.AppScreen
import com.lerxu.android.ui.theme.LerxuTheme
import java.util.Locale

class MainActivity : ComponentActivity() {

    private val viewModel: TaskViewModel by viewModels()

    private var sharedIntentData: String? = null

    companion object {
        private const val PREFS_NAME = "lerxu_prefs"
        private const val KEY_ONBOARDING_DONE = "onboarding_done"
        const val KEY_LANGUAGE = "language"
        const val KEY_THEME = "theme"

        /** 语言切换后由设置页调用，recreate 重建界面并重连引擎 RPC */
        fun updateLanguage(context: Context, tag: String) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_LANGUAGE, tag).apply()
            (context as? MainActivity)?.recreate()
        }

        /** 计算应使用的 Locale：pref 为空时跟随系统 */
        private fun resolveLocale(context: Context): Locale {
            val pref = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_LANGUAGE, "") ?: ""
            val sys = context.resources.configuration.locales[0]
            if (pref.isEmpty() || pref == "system") return sys
            return Locale.forLanguageTag(pref)
        }
    }

    override fun attachBaseContext(newBase: Context) {
        val locale = resolveLocale(newBase)
        val config = Configuration(newBase.resources.configuration)
        config.setLocale(locale)
        super.attachBaseContext(newBase.createConfigurationContext(config))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // 检查是否已完成引导
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val onboardingDone = prefs.getBoolean(KEY_ONBOARDING_DONE, false)

        // 处理来自外部的 Intent（URL / 文件分享）
        handleIntent(intent)

        setContent {
            // 主题偏好：system 跟随系统，light/dark 手动指定；Compose 状态驱动即时切换
            var themePref by remember {
                mutableStateOf(prefs.getString(KEY_THEME, "system") ?: "system")
            }
            val darkTheme = when (themePref) {
                "light" -> false
                "dark" -> true
                else -> isSystemInDarkTheme()
            }
            LerxuTheme(darkTheme = darkTheme) {
                var showOnboarding by remember { mutableStateOf(!onboardingDone) }

                OnboardingTransition(
                    showOnboarding = showOnboarding,
                    onOnboardingFinished = {
                        // 标记引导完成
                        prefs.edit { putBoolean(KEY_ONBOARDING_DONE, true) }
                        showOnboarding = false
                        // 引导完成后启动引擎
                        EngineService.startEngine(this)
                        viewModel.start()
                    }
                ) {
                    AppScreen(
                        viewModel = viewModel,
                        initialIntentData = sharedIntentData,
                        themePref = themePref,
                        onThemeChange = { pref ->
                            themePref = pref
                            prefs.edit { putString(KEY_THEME, pref) }
                        }
                    )
                }
            }
        }

        // 如果已完成引导，直接启动引擎
        if (onboardingDone) {
            EngineService.startEngine(this)
            // 自动检测更新（可在设置中关闭）：延迟后台检查，发现新版本发通知
            UpdateManager.autoCheckIfEnabled(this)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /**
     * 前后台切换驱动全局速度轮询节奏：回到前台立即补一次采样，
     * 退到后台把间隔放宽到 3s（引擎照常下载，只是界面数据少刷几次）。
     */
    override fun onResume() {
        super.onResume()
        viewModel.setUiVisible(true)
    }

    override fun onStop() {
        super.onStop()
        viewModel.setUiVisible(false)
    }

    private fun handleIntent(intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_VIEW -> {
                val uri = intent.data
                if (uri != null) {
                    sharedIntentData = uri.toString()
                }
            }
            Intent.ACTION_SEND -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                val stream = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                if (text != null && (text.startsWith("http") || text.startsWith("magnet"))) {
                    sharedIntentData = text
                } else if (stream != null) {
                    sharedIntentData = stream.toString()
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        viewModel.stop()
    }
}
