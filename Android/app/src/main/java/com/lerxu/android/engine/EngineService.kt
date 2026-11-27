package com.lerxu.android.engine

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.webkit.MimeTypeMap
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import com.lerxu.android.R
import com.lerxu.android.model.TaskInfo
import com.lerxu.android.ui.MainActivity
import java.io.File
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class EngineService : Service() {

    companion object {
        private const val TAG = "EngineService"
        const val CHANNEL_ID = "lerxu_engine"
        const val NOTIFICATION_ID = 1

        const val ACTION_START = "com.lerxu.android.action.START_ENGINE"
        const val ACTION_STOP = "com.lerxu.android.action.STOP_ENGINE"

        const val ACTION_ENGINE_READY = "com.lerxu.android.action.ENGINE_READY"
        const val ACTION_ENGINE_FAILED = "com.lerxu.android.action.ENGINE_FAILED"
        const val EXTRA_ERROR = "error"

        // 通知上的操作按钮（PendingIntent 重新进到本服务处理）
        private const val ACTION_NOTIFICATION_PAUSE = "com.lerxu.android.action.NOTIF_PAUSE"
        private const val ACTION_NOTIFICATION_RESUME = "com.lerxu.android.action.NOTIF_RESUME"
        private const val ACTION_NOTIFICATION_OPEN = "com.lerxu.android.action.NOTIF_OPEN"
        private const val EXTRA_GIDS = "gids"
        private const val EXTRA_FILE_PATH = "filePath"

        private const val MAX_START_RETRIES = 3
        private const val RETRY_DELAY_MS = 2000L

        // 任务进度刷新：下载中 1s（引擎进度事件粒度约 0.5~1s，再快只是重复发通知）；
        // 空闲时 10s 看一眼是否有新任务；RPC 未就绪 / 断线时 3s 重试
        private const val TASK_POLL_ACTIVE_MS = 1000L
        private const val TASK_POLL_IDLE_MS = 10_000L
        private const val TASK_POLL_RETRY_MS = 3000L

        fun startEngine(context: Context) {
            val intent = Intent(context, EngineService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopEngine(context: Context) {
            val intent = Intent(context, EngineService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var watchdogJob: Job? = null

    // 通知用的引擎连接（与 UI 的 EngineRepository 各连一条，互不影响）：
    // 界面退出后 Repository 会断开，但前台服务仍在跑，通知必须自己续上。
    private var taskPollJob: Job? = null
    private var taskRpcClient: EngineRpcClient? = null
    // 上一次通知内容摘要：进度没变化就不重复 notify
    private var lastTaskNotificationSignature = ""

    // 通知的状态机：上一轮的活动任务（用来在它们结束后查最终状态）、
    // 因通知“暂停”而停下的任务（用于“继续”）、最近完成的任务（用于“打开”）
    private var lastActiveTasks: List<TaskInfo> = emptyList()
    private var pausedTasks: List<TaskInfo> = emptyList()
    private var completedTask: TaskInfo? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopTaskPolling()
                EngineManager.stop()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_NOTIFICATION_PAUSE -> {
                pauseTasksFromNotification(intent)
                return START_STICKY
            }
            ACTION_NOTIFICATION_RESUME -> {
                resumeTasksFromNotification(intent)
                return START_STICKY
            }
            ACTION_NOTIFICATION_OPEN -> {
                openFileFromNotification(intent)
                return START_STICKY
            }
            else -> {
                startForeground(NOTIFICATION_ID, createNotification())
                startEngine()
            }
        }
        return START_STICKY
    }

    private fun startEngine() {
        scope.launch {
            if (!EngineManager.isRunning()) {
                updateNotification(getString(R.string.engine_starting_notification))

                val prefs = getSharedPreferences("lerxu_prefs", Context.MODE_PRIVATE)
                var retries = 0
                var started = false

                while (!started && retries < MAX_START_RETRIES) {
                    retries++
                    Log.i(TAG, "Engine start attempt $retries/$MAX_START_RETRIES")

                    started = EngineManager.start(
                        port = prefs.getInt("rpc_port", EngineManager.DEFAULT_RPC_PORT),
                        secret = prefs.getString("rpc_secret", "") ?: "",
                        downloadDir = EngineManager.getDownloadDirSafe(),
                        maxConcurrent = prefs.getInt("max_concurrent", EngineManager.DEFAULT_MAX_CONCURRENT)
                    )

                    if (!started && retries < MAX_START_RETRIES) {
                        Log.w(TAG, "Engine start failed, retrying in ${RETRY_DELAY_MS}ms...")
                        delay(RETRY_DELAY_MS)
                    }
                }

                if (started) {
                    Log.i(TAG, "Engine started, broadcasting READY")
                    updateNotification(getString(R.string.engine_notification_text))
                    startTaskPolling()
                    sendBroadcast(Intent(ACTION_ENGINE_READY).setPackage(packageName))
                } else {
                    val error = EngineManager.getLastError()
                    Log.e(TAG, "Engine failed to start after $retries attempts. Error: $error")
                    updateNotification(getString(R.string.engine_failed_notification))
                    sendBroadcast(
                        Intent(ACTION_ENGINE_FAILED)
                            .setPackage(packageName)
                            .putExtra(EXTRA_ERROR, error.ifEmpty { getString(R.string.engine_start_failed_default) })
                    )
                }
            } else {
                // 进程被复用（引擎已在跑）时也要接上通知进度
                startTaskPolling()
                sendBroadcast(Intent(ACTION_ENGINE_READY).setPackage(packageName))
            }
        }

        // 看门狗
        watchdogJob = scope.launch {
            while (true) {
                delay(5000)
                if (EngineManager.getState() == EngineManager.EngineState.RUNNING &&
                    !EngineManager.isProcessAlive()
                ) {
                    Log.w(TAG, "Engine process died, attempting restart...")
                    updateNotification(getString(R.string.engine_restarting_notification))
                    val restarted = EngineManager.start()
                    if (restarted) {
                        updateNotification(getString(R.string.engine_notification_text))
                        sendBroadcast(Intent(ACTION_ENGINE_READY).setPackage(packageName))
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopTaskPolling()
        watchdogJob?.cancel()
        scope.cancel()
        EngineManager.stop()
    }

    /**
     * 任务进度通知循环。
     *
     * 状态机：
     * - 有 active 任务：显示进度，按钮「暂停 / 全部暂停」；
     * - 全部结束：回查上一轮任务，暂停的 → 显示「继续 / 全部继续」，
     *   完成的 → 显示「打开」；
     * - 都没有：退回引擎状态文案。
     * 查询失败（引擎重启 / 未就绪）时保持现有通知，不覆盖“重启中…”等状态文案。
     */
    private fun startTaskPolling() {
        if (taskPollJob?.isActive == true) return
        taskPollJob = scope.launch {
            val client = EngineRpcClient.create(
                EngineManager.getRpcHost(),
                EngineManager.getRpcPort(),
                EngineManager.getRpcSecret()
            )
            taskRpcClient = client
            client.connect()
            try {
                while (isActive) {
                    val active = try {
                        // 只认真正在下载的：BT 下载完后会转做种（seeding），
                        // 那已经算“下载完成”，应该切到打开按钮而不是继续显示进度
                        client.listTasks("active").filter { it.status == "active" }
                    } catch (e: Exception) {
                        null
                    }
                    if (active == null) {
                        delay(TASK_POLL_RETRY_MS)
                        continue
                    }
                    if (EngineManager.getState() == EngineManager.EngineState.RUNNING) {
                        if (active.isNotEmpty()) {
                            lastActiveTasks = active
                            pausedTasks = emptyList()
                            completedTask = null
                            applyActiveNotification(active)
                        } else {
                            if (lastActiveTasks.isNotEmpty()) {
                                // 从“有下载”变成“没有下载”：回查最终状态，决定显示继续还是打开
                                val resolved = lastActiveTasks.mapNotNull { task ->
                                    try {
                                        client.tellStatus(task.gid)
                                    } catch (e: Exception) {
                                        null
                                    }
                                }
                                lastActiveTasks = emptyList()
                                pausedTasks = resolved.filter { it.status == "paused" }
                                completedTask = resolved
                                    .filter { it.status == "complete" || it.status == "seeding" }
                                    .maxByOrNull { it.finishedAt }
                            } else {
                                // 长时间没有活动任务：把已经被删除 / 被外部恢复的旧状态清掉
                                refreshIdleTasks(client)
                            }
                            applyIdleNotification()
                        }
                    }
                    delay(if (active.isNotEmpty()) TASK_POLL_ACTIVE_MS else TASK_POLL_IDLE_MS)
                }
            } finally {
                client.disconnect()
                if (taskRpcClient === client) taskRpcClient = null
            }
        }
    }

    private fun stopTaskPolling() {
        taskPollJob?.cancel()
        taskPollJob = null
        taskRpcClient?.disconnect()
        taskRpcClient = null
        lastTaskNotificationSignature = ""
        lastActiveTasks = emptyList()
        pausedTasks = emptyList()
        completedTask = null
    }

    /** 暂停 / 继续之后立刻让下一轮通知重新渲染（不用等摘要比对）。 */
    private fun pauseTasksFromNotification(intent: Intent) {
        val gids = intent.getStringArrayListExtra(EXTRA_GIDS).orEmpty()
        if (gids.isEmpty()) return
        scope.launch {
            val client = taskRpcClient ?: return@launch
            gids.forEach { gid -> runCatching { client.pauseTask(gid) } }
            lastTaskNotificationSignature = ""
        }
    }

    private fun resumeTasksFromNotification(intent: Intent) {
        val gids = intent.getStringArrayListExtra(EXTRA_GIDS).orEmpty()
        if (gids.isEmpty()) return
        scope.launch {
            val client = taskRpcClient ?: return@launch
            gids.forEach { gid -> runCatching { client.resumeTask(gid) } }
            lastTaskNotificationSignature = ""
        }
    }

    private fun openFileFromNotification(intent: Intent) {
        val path = intent.getStringExtra(EXTRA_FILE_PATH).orEmpty()
        val opened = path.isNotEmpty() && openLocalFile(File(path))
        if (!opened) {
            // 文件路径拿不到 / 已被移走：至少把应用带到前台，别让“打开”点了没反应
            runCatching {
                startActivity(
                    Intent(this, MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
        }
        // 打开后回到引擎状态文案；如果还有别的暂停任务，下一轮会重新给出“继续”
        completedTask = null
        lastTaskNotificationSignature = ""
        if (pausedTasks.isEmpty()) {
            pushNotification(createNotification(getString(R.string.engine_notification_text)))
        }
    }

    /** 用系统查看器打开下载完成的文件（FileProvider，Android 7+ 不能用 file://）。 */
    private fun openLocalFile(file: File): Boolean {
        return try {
            if (!file.exists()) return false
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            val mime = contentResolver.getType(uri)
                ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase())
                ?: "application/octet-stream"
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to open downloaded file: ${file.absolutePath}", e)
            false
        }
    }

    /** 空闲态复查：任务被删除 / 在应用里被恢复后，通知里的旧状态要跟着消失。 */
    private suspend fun refreshIdleTasks(client: EngineRpcClient) {
        if (pausedTasks.isNotEmpty()) {
            pausedTasks = pausedTasks
                .mapNotNull { task -> runCatching { client.tellStatus(task.gid) }.getOrNull() }
                .filter { it.status == "paused" }
        }
        val done = completedTask ?: return
        val fresh = runCatching { client.tellStatus(done.gid) }.getOrNull()
        completedTask = if (fresh == null || fresh.status == "removed" || fresh.status == "error") {
            null
        } else {
            fresh
        }
    }

    /** 有活动任务 → 进度通知（按钮：暂停 / 全部暂停）。 */
    private fun applyActiveNotification(running: List<TaskInfo>) {
        val signature = running.joinToString(";") {
            "${it.gid}:${it.fileName}:${it.completedLength}:${it.totalLength}:${it.downloadSpeed}:${it.status}"
        }
        if (signature == lastTaskNotificationSignature) return
        lastTaskNotificationSignature = signature
        pushNotification(createActiveNotification(running))
    }

    /** 无活动任务 → 暂停（继续按钮）/ 完成（打开按钮）/ 引擎状态。 */
    private fun applyIdleNotification() {
        val signature = when {
            pausedTasks.isNotEmpty() -> "paused:" + pausedTasks.joinToString(",") { "${it.gid}:${it.fileName}" }
            completedTask != null -> "done:${completedTask!!.gid}:${completedTask!!.finishedAt}:${completedTask!!.fileName}"
            else -> "idle"
        }
        if (signature == lastTaskNotificationSignature) return
        lastTaskNotificationSignature = signature
        val notification = when {
            pausedTasks.isNotEmpty() -> createPausedNotification(pausedTasks)
            completedTask != null -> createCompletedNotification(completedTask!!)
            else -> createNotification(getString(R.string.engine_notification_text))
        }
        pushNotification(notification)
    }

    private fun createActiveNotification(running: List<TaskInfo>): Notification {
        val speed = running.sumOf { it.downloadSpeed }
        val total = running.sumOf { it.totalLength }
        val completed = running.sumOf { it.completedLength }.coerceAtMost(total)
        val percent = if (total > 0) ((completed * 100) / total).toInt().coerceIn(0, 100) else 0
        val speedText = "${formatBytes(speed)}/s"

        val title = if (running.size == 1) {
            running.first().fileName
        } else {
            getString(R.string.download_notification_title_multi, running.size)
        }
        // 通知文案顺序（用户口径）：① 速度 ② 已下载 / 总大小 ③ 剩余时间。
        // 不显示百分比文本 —— 进度由系统进度条表达，数字只保留大小与时间。
        val text = buildList {
            add(speedText)
            if (total > 0) {
                add("${formatBytes(completed)} / ${formatBytes(total)}")
            }
            etaText(completed, total, speed)?.let { add(it) }
        }.joinToString(" · ")

        val builder = baseBuilder(title, text)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(100, percent, total <= 0)

        // 展开后不再列出完整文件名（用户点名），改成直接可用的操作按钮。
        if (running.size == 1) {
            builder.addAction(
                buildAction(
                    icon = R.drawable.ic_notif_pause,
                    label = getString(R.string.notification_action_pause),
                    action = ACTION_NOTIFICATION_PAUSE,
                    gids = listOf(running.first().gid)
                )
            )
        } else {
            builder.addAction(
                buildAction(
                    icon = R.drawable.ic_notif_pause,
                    label = getString(R.string.notification_action_pause_all),
                    action = ACTION_NOTIFICATION_PAUSE,
                    gids = running.map { it.gid }
                )
            )
        }

        return builder.build()
    }

    /** 暂停态：按钮从「暂停」变「继续」，没有进度条。 */
    private fun createPausedNotification(paused: List<TaskInfo>): Notification {
        val title = if (paused.size == 1) {
            paused.first().fileName
        } else {
            getString(R.string.notification_paused_multi, paused.size)
        }
        val builder = baseBuilder(title, getString(R.string.status_paused))
        if (paused.size == 1) {
            builder.addAction(
                buildAction(
                    icon = R.drawable.ic_notif_resume,
                    label = getString(R.string.notification_action_resume),
                    action = ACTION_NOTIFICATION_RESUME,
                    gids = listOf(paused.first().gid)
                )
            )
        } else {
            builder.addAction(
                buildAction(
                    icon = R.drawable.ic_notif_resume,
                    label = getString(R.string.notification_action_resume_all),
                    action = ACTION_NOTIFICATION_RESUME,
                    gids = paused.map { it.gid }
                )
            )
        }
        return builder.build()
    }

    /** 完成态：按钮变「打开」；文件路径拿不到时至少保留完成提示。 */
    private fun createCompletedNotification(task: TaskInfo): Notification {
        val builder = baseBuilder(task.fileName, getString(R.string.notification_completed_text))
            .setCategory(NotificationCompat.CATEGORY_STATUS)
        // 即使路径暂时拿不到也保留“打开”按钮：点击会退回打开应用，而不是无响应
        builder.addAction(
            buildAction(
                icon = R.drawable.ic_notif_open,
                label = getString(R.string.notification_action_open),
                action = ACTION_NOTIFICATION_OPEN,
                filePath = resolveOpenablePath(task)
            )
        )
        return builder.build()
    }

    /** 完成任务的“可打开文件”：优先首文件；路径是目录时取其中最大的普通文件。 */
    private fun resolveOpenablePath(task: TaskInfo): String {
        var path = task.filePath
        if (path.isEmpty() && task.fileName.isNotBlank() && task.dir.isNotBlank()) {
            path = File(task.dir, task.fileName).absolutePath
        }
        if (path.isEmpty()) return ""
        var file = File(path)
        if (file.isDirectory) {
            file = file.listFiles()
                ?.filter { it.isFile }
                ?.maxByOrNull { it.length() }
                ?: return ""
        }
        return if (file.exists()) file.absolutePath else ""
    }

    private fun baseBuilder(title: String, text: String): NotificationCompat.Builder =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher))
            .setContentIntent(contentIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setShowWhen(false)

    private fun buildAction(
        icon: Int,
        label: String,
        action: String,
        gids: List<String> = emptyList(),
        filePath: String = ""
    ): NotificationCompat.Action {
        val intent = Intent(this, EngineService::class.java).apply {
            this.action = action
            // 两个 extra 都写：FLAG_UPDATE_CURRENT 会复用同一个 PendingIntent，
            // 不显式写入会让上一次的 gid / 路径残留下来
            putStringArrayListExtra(EXTRA_GIDS, ArrayList(gids))
            putExtra(EXTRA_FILE_PATH, filePath)
        }
        val requestCode = when (action) {
            ACTION_NOTIFICATION_PAUSE -> 101
            ACTION_NOTIFICATION_RESUME -> 102
            else -> 103
        }
        val pending = PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Action.Builder(icon, label, pending).build()
    }

    /** 「剩余 3:20」；速度或总大小未知时返回 null（宁可不显示，也不给一个假时间）。 */
    private fun etaText(completed: Long, total: Long, speed: Long): String? {
        if (total <= 0 || speed <= 0) return null
        val remaining = (total - completed).coerceAtLeast(0)
        if (remaining <= 0) return null
        // 向上取整：还剩 1 字节时显示 0:01 而不是 0:00
        val seconds = (remaining + speed - 1) / speed
        return getString(R.string.download_notification_eta, formatEta(seconds))
    }

    private fun formatEta(seconds: Long): String {
        val h = seconds / 3600
        val m = (seconds % 3600) / 60
        val s = seconds % 60
        return if (h > 0) {
            String.format(Locale.US, "%d:%02d:%02d", h, m, s)
        } else {
            String.format(Locale.US, "%d:%02d", m, s)
        }
    }

    /** 1024 进制、1 位小数；超过 100 时不带小数，避免通知文案过长。 */
    private fun formatBytes(bytes: Long): String {
        val value = bytes.coerceAtLeast(0)
        if (value < 1024) return "$value B"
        val units = arrayOf("KB", "MB", "GB", "TB")
        var size = value.toDouble() / 1024
        var unit = 0
        while (size >= 1024 && unit < units.lastIndex) {
            size /= 1024
            unit++
        }
        return if (size >= 100) {
            String.format(Locale.getDefault(), "%.0f %s", size, units[unit])
        } else {
            String.format(Locale.getDefault(), "%.1f %s", size, units[unit])
        }
    }

    private fun createNotification(): Notification {
        return createNotification(getString(R.string.engine_notification_text))
    }

    private fun createNotification(text: String): Notification =
        baseBuilder(getString(R.string.engine_notification_title), text).build()

    private fun contentIntent(): PendingIntent = PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    private fun updateNotification(text: String) {
        // 引擎状态文案优先展示；重置摘要，让任务轮询拿到下一份数据后能覆盖回来
        lastTaskNotificationSignature = ""
        pushNotification(createNotification(text))
    }

    private fun pushNotification(notification: Notification) {
        // Android 13（API 33）起通知需要 POST_NOTIFICATIONS 运行时授权，
        // 用户拒绝时 notify 会抛 SecurityException。这里显式兜底：
        // 未授权就静默跳过通知刷新——前台服务与下载本身不受影响，
        // 只是状态栏不再更新文案。
        val manager = NotificationManagerCompat.from(this)
        if (!manager.areNotificationsEnabled()) {
            return
        }
        try {
            manager.notify(NOTIFICATION_ID, notification)
        } catch (e: SecurityException) {
            Log.w(TAG, "通知刷新失败（缺少 POST_NOTIFICATIONS 授权）", e)
        }
    }
}
