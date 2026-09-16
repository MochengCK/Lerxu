package com.lerxu.android.update

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.lerxu.android.BuildConfig
import com.lerxu.android.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * 应用更新检测 —— 基于 GitHub Releases（与桌面端 app-update.yml 同源）。
 *
 * - 自动：启动后延迟数秒检查（可在设置中关闭），发现新版本发系统通知，
 *   点击打开 release 页面（或 APK 资产直链）。
 * - 手动：设置页"检查更新"，toast 反馈结果。
 */
object UpdateManager {

    private const val TAG = "UpdateManager"
    private const val RELEASES_API = "https://api.github.com/repos/MochengCK/Lerxu/releases/latest"
    private const val CHANNEL_ID = "app_updates"
    private const val NOTIFICATION_ID = 2001
    private const val AUTO_CHECK_DELAY_MS = 4_000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private data class LatestRelease(val tag: String, val pageUrl: String, val apkUrl: String?)

    /** 启动时的自动检查：prefs 开关（默认开）+ 延迟，避免抢占启动资源 */
    fun autoCheckIfEnabled(context: Context) {
        val prefs = context.getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("auto_update_check", true)) return
        scope.launch {
            delay(AUTO_CHECK_DELAY_MS)
            checkInternal(context.applicationContext, manual = false)
        }
    }

    /** 手动检查：结果以 toast 反馈（发现新版本同时发通知） */
    fun checkNow(context: Context) {
        val appCtx = context.applicationContext
        Toast.makeText(appCtx, appCtx.getString(R.string.update_checking), Toast.LENGTH_SHORT).show()
        scope.launch { checkInternal(appCtx, manual = true) }
    }

    private suspend fun checkInternal(context: Context, manual: Boolean) {
        val release = try {
            withContext(Dispatchers.IO) { fetchLatest() }
        } catch (e: Exception) {
            Log.w(TAG, "Update check failed", e)
            if (manual) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(context, context.getString(R.string.update_check_failed), Toast.LENGTH_SHORT).show()
                }
            }
            return
        }
        if (!isNewer(release.tag, BuildConfig.VERSION_NAME)) {
            if (manual) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(context, context.getString(R.string.update_latest), Toast.LENGTH_SHORT).show()
                }
            }
            return
        }
        Log.i(TAG, "Update available: ${release.tag} (current ${BuildConfig.VERSION_NAME})")
        if (manual) {
            withContext(Dispatchers.Main) {
                Toast.makeText(
                    context,
                    context.getString(R.string.update_available, release.tag),
                    Toast.LENGTH_LONG
                ).show()
            }
        }
        notifyUpdate(context, release.tag, release.apkUrl ?: release.pageUrl)
    }

    /**
     * 语义化版本比较：逐段取数字比较（"v1.10.0" 与 "1.9" 均可），
     * 忽略预发布后缀（-beta）与构建元数据（+sha）。
     */
    fun isNewer(latest: String, current: String): Boolean {
        fun parts(v: String) = v.trim()
            .removePrefix("v").removePrefix("V")
            .substringBefore('-').substringBefore('+')
            .split('.')
            .map { seg -> seg.filter { it.isDigit() }.toIntOrNull() ?: 0 }
        val a = parts(latest)
        val b = parts(current)
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    /** 拉取 GitHub 最新 release（/latest 自动排除草稿与预发布） */
    private fun fetchLatest(): LatestRelease {
        val conn = URL(RELEASES_API).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "Lerxu-Android/${BuildConfig.VERSION_NAME}")
            if (conn.responseCode != 200) throw IOException("HTTP ${conn.responseCode}")
            val body = conn.inputStream.use { it.readBytes().decodeToString() }
            val obj = JSONObject(body)
            val tag = obj.optString("tag_name")
            if (tag.isEmpty()) throw IOException("empty tag_name")
            val page = obj.optString("html_url")
            var apk: String? = null
            val assets = obj.optJSONArray("assets")
            if (assets != null) {
                for (i in 0 until assets.length()) {
                    val asset = assets.getJSONObject(i)
                    if (asset.optString("name").endsWith(".apk", ignoreCase = true)) {
                        apk = asset.optString("browser_download_url")
                        break
                    }
                }
            }
            return LatestRelease(tag, page.ifEmpty { RELEASES_API }, apk)
        } finally {
            conn.disconnect()
        }
    }

    private fun notifyUpdate(context: Context, tag: String, url: String) {
        val nm = NotificationManagerCompat.from(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    context.getString(R.string.channel_update_name),
                    NotificationManager.IMPORTANCE_DEFAULT
                )
            )
        }
        if (!nm.areNotificationsEnabled()) return
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(Intent.ACTION_VIEW, Uri.parse(url)),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.update_notification_title, tag))
            .setContentText(context.getString(R.string.update_notification_text))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            nm.notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // 通知权限未授予：静默跳过（手动检查仍有 toast）
        }
    }
}
