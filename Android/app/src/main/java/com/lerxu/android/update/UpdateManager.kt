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
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * 应用更新检测 —— 基于 GitHub Releases（与桌面端同源、同语义）。
 *
 * - 自动：启动后延迟数秒检查（可在设置中关闭），发现新版本发系统通知，
 *   点击打开 release 页面（或 APK 资产直链）。
 * - 手动：设置页「检查更新」，toast 反馈结果。
 * - 渠道：与桌面端一致的 stable / beta / all 三档（设置页「更新渠道」），
 *   选版规则见 [ReleasePicker]，版本比较见 [AppVersion]。
 */
object UpdateManager {

    private const val TAG = "UpdateManager"
    private const val OWNER = "MochengCK"
    private const val REPO = "Lerxu"
    private const val RELEASES_API = "https://api.github.com/repos/$OWNER/$REPO/releases"
    private const val LATEST_API = "$RELEASES_API/latest"
    private const val CHANNEL_ID = "app_updates"
    private const val NOTIFICATION_ID = 2001
    private const val AUTO_CHECK_DELAY_MS = 4_000L
    private const val LIST_PAGE_SIZE = 50

    /** 偏好存储：与设置页共用同一个 SharedPreferences */
    const val PREFS_NAME = "lerxu_prefs"
    const val KEY_AUTO_CHECK = "auto_update_check"
    const val KEY_CHANNEL = "update_channel"

    /**
     * GitHub 镜像清单 —— 与桌面端 `src/main/core/UpdateManager.js` 的
     * MIRROR_HOSTS 保持同一份实测可用列表（api.github.com 在部分网络下
     * 直连不通，命中镜像时按 `https://<mirror>/https://原地址` 拼接）。
     */
    private val MIRROR_HOSTS = listOf(
        "gh-proxy.com",
        "ghfast.top",
        "gh.ddlc.top",
        "gh.xmly.dev",
        "cors.isteed.cc",
        "ghproxy.net"
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** 拉不到发布列表（限流 / 网络异常）——与「该渠道暂无新版本」严格区分 */
    private class ReleaseListUnavailableException(message: String = "release list unavailable") :
        IOException(message)

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
        /** 说明内容：Markdown（必要时含少量 HTML），渲染前由 [ReleaseNotes] 归一化 */
        val notes: String,
        val apkUrl: String?,
        val pageUrl: String
    )

    /** 关闭应用内提示（系统通知不受影响，仍可在通知栏查看） */
    fun dismiss() {
        _availableUpdate.value = null
        _downloadState.value = DownloadState.Idle
    }

    // ─── 更新渠道 ───

    /** 当前渠道（读取失败/历史缺省一律回落到稳定版） */
    fun currentChannel(context: Context): ReleaseChannel {
        val prefs = context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return ReleaseChannel.fromKey(prefs.getString(KEY_CHANNEL, null))
    }

    /**
     * 切换渠道：落盘 → 清掉旧渠道残留的「发现新版本」状态 → 立刻按新渠道重检。
     * 与桌面端 onUpdateChannelChange 的行为一致（渠道即改即生效、即检）。
     */
    fun setChannel(context: Context, channel: ReleaseChannel) {
        val appCtx = context.applicationContext
        appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_CHANNEL, channel.key)
            .apply()
        // 旧卡片属于旧渠道的版本，先清掉，否则会出现「切到稳定版仍显示 Beta 卡片」
        dismiss()
        Log.i(TAG, "Update channel switched to ${channel.key}")
        checkNow(appCtx)
    }

    /** 启动时的自动检查：prefs 开关（默认开）+ 延迟，避免抢占启动资源 */
    fun autoCheckIfEnabled(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_AUTO_CHECK, true)) return
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
        val channel = currentChannel(context)
        val release = try {
            withContext(Dispatchers.IO) { findUpdate(channel) }
        } catch (e: ReleaseListUnavailableException) {
            Log.w(TAG, "Update check failed on channel ${channel.key}: ${e.message}")
            if (manual) {
                toast(context, R.string.update_check_channel_failed)
            }
            return
        } catch (e: Exception) {
            Log.w(TAG, "Update check failed", e)
            if (manual) {
                toast(context, R.string.update_check_failed)
            }
            return
        }
        if (release == null || !AppVersion.isNewer(release.tag, BuildConfig.VERSION_NAME)) {
            if (manual) toast(context, R.string.update_latest)
            return
        }
        Log.i(
            TAG,
            "Update available: ${release.tag} (channel=${channel.key}, current ${BuildConfig.VERSION_NAME})"
        )
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

    private suspend fun toast(context: Context, resId: Int) {
        withContext(Dispatchers.Main) {
            Toast.makeText(context, context.getString(resId), Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 按渠道找到目标 release。
     *
     * - 正常路径：拉 `/releases?per_page=50` 全量列表（含 prerelease 标志），
     *   交给 [ReleasePicker] 选版；
     * - stable 渠道兜底：列表拿不到时退回 `/releases/latest`（GitHub 保证它
     *   指向最新正式版，天然排除预发布），单条 release 也能完成检查；
     * - beta / all 渠道没有兜底可言 —— `/latest` 只会给正式版，用它会让
     *   Beta 用户被误报「已是最新版本」，所以这里显式抛错，把真实原因
     *   （限流/网络）呈现给用户。
     *
     * @return 该渠道的目标版本；null 表示该渠道当前没有符合条件的发布
     */
    private fun findUpdate(channel: ReleaseChannel): ReleaseInfo? {
        val releases = try {
            fetchReleaseList()
        } catch (e: Exception) {
            if (channel != ReleaseChannel.STABLE) {
                throw ReleaseListUnavailableException(e.message ?: "release list unavailable")
            }
            Log.w(TAG, "Release list unavailable, falling back to /releases/latest: ${e.message}")
            return fetchLatestRelease()
        }
        return ReleasePicker.pick(releases, channel)
    }

    /**
     * 拉取 release 列表：直连优先，失败逐个尝试 GitHub 镜像。
     */
    private fun fetchReleaseList(): List<ReleaseInfo> {
        val path = "$RELEASES_API?per_page=$LIST_PAGE_SIZE"
        val urls = listOf(path) + MIRROR_HOSTS.map { "https://$it/$path" }
        var lastError: Exception? = null
        for (url in urls) {
            try {
                val arr = JSONArray(httpGet(url))
                val list = (0 until arr.length()).map { parseRelease(arr.getJSONObject(it)) }
                if (list.isNotEmpty()) return list
            } catch (e: Exception) {
                lastError = e
                Log.w(TAG, "Release list via $url failed: ${e.message}")
            }
        }
        throw lastError ?: IOException("empty release list")
    }

    /** `/releases/latest`（仅正式版）——stable 渠道在列表不可用时的单条兜底 */
    private fun fetchLatestRelease(): ReleaseInfo? {
        val urls = listOf(LATEST_API) + MIRROR_HOSTS.map { "https://$it/$LATEST_API" }
        var lastError: Exception? = null
        for (url in urls) {
            try {
                return parseRelease(JSONObject(httpGet(url)))
            } catch (e: Exception) {
                lastError = e
                Log.w(TAG, "Latest release via $url failed: ${e.message}")
            }
        }
        throw ReleaseListUnavailableException(lastError?.message ?: "latest release unavailable")
    }

    private fun parseRelease(obj: JSONObject): ReleaseInfo {
        val tag = obj.optString("tag_name").trim()
        return ReleaseInfo(
            tag = tag,
            prerelease = obj.optBoolean("prerelease", false),
            draft = obj.optBoolean("draft", false),
            // 说明取 Markdown 原文（GitHub 的 body）。旧实现取 body_html 交给
            // Html.fromHtml 渲染，块级排版（标题/列表缩进/空行）会被吞掉，
            // 结论是整篇说明糊成一段——详见 ReleaseNotes 的注释。
            notes = obj.optString("body"),
            pageUrl = obj.optString("html_url").ifEmpty { RELEASES_API },
            apkUrl = findApkUrl(obj)
        )
    }

    private fun httpGet(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("Accept", "application/vnd.github.v3+json")
            conn.setRequestProperty("User-Agent", "Lerxu-Android/${BuildConfig.VERSION_NAME}")
            if (conn.responseCode !in 200..299) throw IOException("HTTP ${conn.responseCode}")
            return conn.inputStream.use { it.readBytes().decodeToString() }
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
     * - 有 APK 资产（CI 构建的 app-release.apk）→ 应用内下载并显示进度；
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
                val file = downloadApk(appCtx, apkUrls(apkUrl), update.version)
                _downloadState.value = DownloadState.Ready(file)
                withContext(Dispatchers.Main) { installApk(appCtx, file) }
            } catch (e: Exception) {
                Log.w(TAG, "APK download failed", e)
                _downloadState.value = DownloadState.Failed(e.message ?: "download-failed")
            }
        }
    }

    /**
     * APK 直链 → 候选下载地址（直连 + 镜像）。
     * 与检查更新走同一套镜像清单：能拉到 metadata 不代表下载直链可达。
     */
    private fun apkUrls(url: String): List<String> {
        val m = Regex("^https://github\\.com/(.+)$").find(url) ?: return listOf(url)
        val path = m.groupValues[1]
        return (listOf(url) + MIRROR_HOSTS.map { "https://$it/https://github.com/$path" }).distinct()
    }

    /**
     * 流式下载 APK 到 cache/updates，按已下载字节刷新百分比；
     * 逐个尝试 [urls]（直连 → 各镜像），任一成功即返回。
     */
    private fun downloadApk(context: Context, urls: List<String>, version: String): File {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        val target = File(dir, "lerxu-${version.removePrefix("v")}.apk")
        // 已经下载完成过（重复点击 / 失败后重试）：直接复用，避免重复下载
        if (target.exists() && target.length() > 0) return target

        val tmp = File(dir, "${target.name}.part")
        var lastError: Exception? = null
        for (url in urls) {
            try {
                if (tmp.exists()) tmp.delete()
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
                } finally {
                    conn.disconnect()
                }
                if (!tmp.renameTo(target)) {
                    tmp.copyTo(target, overwrite = true)
                    tmp.delete()
                }
                return target
            } catch (e: Exception) {
                lastError = e
                Log.w(TAG, "APK download via $url failed: ${e.message}")
            }
        }
        throw lastError ?: IOException("download failed")
    }

    /**
     * 通过 FileProvider 把 APK 交给系统安装器（Android 7+ 必须用 content:// URI）。
     * Android 8+ 要求先授予本应用「安装未知应用」权限：未授予时打开系统
     * 设置引导用户开启，并把状态复位为 Idle（下载文件已存在，授权返回后
     * 再点一次「立即更新」会直接进入安装，无需重新下载）。
     */
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
