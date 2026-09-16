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
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.lerxu.android.R
import com.lerxu.android.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
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

        private const val MAX_START_RETRIES = 3
        private const val RETRY_DELAY_MS = 2000L

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

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                EngineManager.stop()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
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
        watchdogJob?.cancel()
        scope.cancel()
        EngineManager.stop()
    }

    private fun createNotification(): Notification {
        return createNotification(getString(R.string.engine_notification_text))
    }

    private fun createNotification(text: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.engine_notification_title))
            .setContentText(text)
            // 状态栏/头部使用与应用图标同形的白色剪影，展开后另显示彩色应用图标
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher))
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(text: String) {
        val notification = createNotification(text)
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
