package com.lerxu.android

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 崩溃记录。
 *
 * 应用里有原生引擎（xferrust）与多个 WebView，偶发的"直接退出"如果只靠
 * 描述很难定位。这里把 Java 层未捕获异常落一份到文件，用户可以直接取出，
 * 同时也走一遍系统默认处理（不会把崩溃吞掉）。
 *
 * 注意：原生崩溃（SIGSEGV 之类）不会经过这里 —— 那种情况要看 `adb logcat`。
 */
object CrashLog {

    private const val TAG = "LerxuCrash"
    private const val FILE_NAME = "last-crash.txt"

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val text = buildString {
                    append("time=")
                    append(SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date()))
                    append("\nthread=").append(thread.name)
                    append("\npackage=").append(app.packageName)
                    append("\n\n").append(Log.getStackTraceString(error))
                }
                Log.e(TAG, text)
                crashFile(app).writeText(text)
            }
            previous?.uncaughtException(thread, error)
        }
    }

    /** 优先写到外部目录（用户能用文件管理器取出），取不到就退回内部目录。 */
    private fun crashFile(context: Context): File {
        val dir = context.getExternalFilesDir(null) ?: context.filesDir
        return File(dir, FILE_NAME)
    }
}
