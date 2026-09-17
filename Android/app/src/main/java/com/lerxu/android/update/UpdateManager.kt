package com.lerxu.android.update

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.io.FileOutputStream
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

    private data class LatestRelease(
        val tag: String,
        val pageUrl: String,
        val apkUrl: String?,
        /** 发行说明：优先 GitHub 渲染好的 HTML（body_html），降级为 Markdown 原文 */
        val notes: String
    )

    // ─── 应用内更新状态（驱动底部悬浮更新卡片） ───

    /** 卡片底部按钮的三种形态：可更新 / 下载中（进度条）/ 失败可重试 */
    sealed interface DownloadState {
        data object Idle : DownloadState
        data class Downloading(val percent: Int) : DownloadState
        data class Ready(val file: File) : DownloadState
        data class Failed(val message: String) : DownloadState
    }

    /** 当前可用的新版本（null = 无提示） */
    private val _availableUpdate = MutableStateFlow<AppUpdate?>(null)
    val availableUpdate: StateFlow<AppUpdate?> = _availableUpdate.asStateFlow()

    /** 下载进度状态 */
    private val _downloadState = MutableStateFlow<DownloadState>(DownloadState.Idle)
    val downloadState: StateFlow<DownloadState> = _downloadState.asStateFlow()

    /** 新版本信息（供 UI 展示版本号与说明） */
    data class AppUpdate(
        val version: String,
        /** 说明内容：HTML（body_html）或 Markdown 原文（降级），卡片按内容形态渲染 */
        val notes: String,
        val apkUrl: String?,
        val pageUrl: String
    )

    /** 关闭应用内提示（系统通知不受影响，仍可在通知栏查看） */
    fun dismiss() {
        _availableUpdate.value = null
        _downloadState.value = DownloadState.Idle
    }

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
        // 应用内提示：与系统通知并行。用户正在前台时系统通知可能被忽略，
        // 底部悬浮卡片能立刻看到版本信息并直接发起更新。
        _downloadState.value = DownloadState.Idle
        _availableUpdate.value = AppUpdate(
            version = release.tag,
            notes = release.notes,
            apkUrl = release.apkUrl,
            pageUrl = release.pageUrl
        )
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

    /** 拉取 GitHub 最新 release（/latest 自动排除草稿与预发布）。
     *  说明优先取 GitHub 渲染好的 body_html（标题/列表/粗体/代码块等样式齐全），
     *  拿不到时回退普通 JSON 的 Markdown 原文（卡片按纯文本展示）。 */
    private fun fetchLatest(): LatestRelease {
        var conn = URL(RELEASES_API).openConnection() as HttpURLConnection
        try {
            // 1) 渲染好的 HTML
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            conn.setRequestProperty("Accept", "application/vnd.github.v3.html+json")
            conn.setRequestProperty("User-Agent", "Lerxu-Android/${BuildConfig.VERSION_NAME}")
            if (conn.responseCode == 200) {
                val obj = JSONObject(conn.inputStream.use { it.readBytes().decodeToString() })
                val tag = obj.optString("tag_name")
                if (tag.isNotEmpty()) {
                    val html = obj.optString("body_html").trim()
                    return LatestRelease(
                        tag = tag,
                        pageUrl = obj.optString("html_url").ifEmpty { RELEASES_API },
                        apkUrl = findApkUrl(obj),
                        notes = if (html.isNotEmpty()) html else obj.optString("body").trim()
                    )
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Fetch release (html) failed, falling back: ${e.message}")
        } finally {
            conn.disconnect()
        }

        // 2) 降级：默认 JSON（Markdown 原文）
        conn = URL(RELEASES_API).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "Lerxu-Android/${BuildConfig.VERSION_NAME}")
            if (conn.responseCode != 200) throw IOException("HTTP ${conn.responseCode}")
            val obj = JSONObject(conn.inputStream.use { it.readBytes().decodeToString() })
            val tag = obj.optString("tag_name")
            if (tag.isEmpty()) throw IOException("empty tag_name")
            return LatestRelease(
                tag = tag,
                pageUrl = obj.optString("html_url").ifEmpty { RELEASES_API },
                apkUrl = findApkUrl(obj),
                notes = obj.optString("body").trim()
            )
        } finally {
            conn.disconnect()
        }
    }

    private fun findApkUrl(obj: JSONObject): String? {
        val assets = obj.optJSONArray("assets") ?: return null
        for (i in 0 until assets.length()) {
            val asset = assets.getJSONObject(i)
            if (asset.optString("name").endsWith(".apk", ignoreCase = true)) {
                return asset.optString("browser_download_url")
            }
        }
        return null
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

    // ─── APK 下载与安装（供应用内更新卡片调用） ───

    /**
     * 下载新版本 APK 并交给系统安装。
     *
     * - 有 APK 资产（CI 构建的 app-release*.apk）→ 应用内下载并显示进度；
     * - 没有资产（release 未附 APK）→ 退回浏览器打开 release 页面，
     *   避免"点了没反应"。
     */
    fun downloadAndInstall(context: Context) {
        val appCtx = context.applicationContext
        val update = _availableUpdate.value ?: return
        if (_downloadState.value is DownloadState.Downloading) return

        val apkUrl = update.apkUrl
        if (apkUrl.isNullOrBlank()) {
            _downloadState.value = DownloadState.Failed("no-apk")
            openInBrowser(appCtx, update.pageUrl)
            return
        }

        scope.launch {
            _downloadState.value = DownloadState.Downloading(0)
            try {
                val file = downloadApk(appCtx, apkUrl, update.version)
                _downloadState.value = DownloadState.Ready(file)
                withContext(Dispatchers.Main) { installApk(appCtx, file) }
            } catch (e: Exception) {
                Log.w(TAG, "APK download failed", e)
                _downloadState.value = DownloadState.Failed(e.message ?: "download-failed")
            }
        }
    }

    /** 流式下载 APK 到 cache/updates，按已下载字节刷新百分比 */
    private fun downloadApk(context: Context, url: String, version: String): File {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        val target = File(dir, "lerxu-${version.removePrefix("v")}.apk")
        // 已经下载完成过（重复点击 / 失败后重试）：直接复用，避免重复下载
        if (target.exists() && target.length() > 0) return target

        val tmp = File(dir, "${target.name}.part")
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "Lerxu-Android/${BuildConfig.VERSION_NAME}")
            if (conn.responseCode !in 200..299) throw IOException("HTTP ${conn.responseCode}")
            val total = conn.contentLengthLong
            var done = 0L
            var lastPercent = -1
            conn.inputStream.use { input ->
                FileOutputStream(tmp).use { output ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n <= 0) break
                        output.write(buf, 0, n)
                        done += n
                        if (total > 0) {
                            val percent = ((done * 100) / total).toInt().coerceIn(0, 100)
                            if (percent != lastPercent) {
                                lastPercent = percent
                                _downloadState.value = DownloadState.Downloading(percent)
                            }
                        }
                    }
                    output.flush()
                }
            }
            // 长度校验：网络中断时 read 可能提前返回 0，不校验会安装到坏包
            if (total > 0 && done < total) throw IOException("incomplete download")
            if (!tmp.renameTo(target)) {
                tmp.copyTo(target, overwrite = true)
                tmp.delete()
            }
            return target
        } finally {
            conn.disconnect()
        }
    }

    /** 通过 FileProvider 把 APK 交给系统安装器（Android 7+ 必须用 content:// URI） */
    /** 通过 FileProvider 把 APK 交给系统安装器（Android 7+ 必须用 content:// URI）。
     *  Android 8+ 要求先授予本应用「安装未知应用」权限：未授予时打开系统
     *  设置引导用户开启，并把状态复位为 Idle（下载文件已存在，授权返回后
     *  再点一次「立即更新」会直接进入安装，无需重新下载）。 */
    private fun installApk(context: Context, file: File) {
        // Android 8+：安装未知应用权限检查
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.packageManager.canRequestPackageInstalls()
        ) {
            try {
                val intent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.w(TAG, "Open install-sources settings failed", e)
                openInBrowser(context, _availableUpdate.value?.pageUrl ?: RELEASES_API)
            }
            // 复位为 Idle：授权返回后按钮变回「立即更新」，点击即安装（文件已缓存）
            _downloadState.value = DownloadState.Idle
            return
        }

        try {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Install APK failed", e)
            // 安装器不可用：退回浏览器下载
            openInBrowser(context, _availableUpdate.value?.pageUrl ?: RELEASES_API)
        }
    }

    private fun openInBrowser(context: Context, url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Open url failed: $url", e)
        }
    }
}
