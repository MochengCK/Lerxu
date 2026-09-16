package com.lerxu.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.lerxu.android.engine.EngineManager
import com.lerxu.android.engine.EngineService

class LerxuApp : Application() {

    override fun onCreate() {
        super.onCreate()
        instance = this
        EngineManager.init(this)
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                EngineService.CHANNEL_ID,
                getString(R.string.engine_notification_channel),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.engine_notification_text)
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        @Volatile
        lateinit var instance: LerxuApp
            private set
    }
}
