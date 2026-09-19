package com.lerxu.android.ui

import android.content.Context
import com.lerxu.android.R
import com.lerxu.android.model.TaskInfo

/**
 * 工具函数 —— 格式化文件大小、速度、时间等
 */

fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val sizes = arrayOf("B", "KB", "MB", "GB", "TB")
    val i = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt()
    val index = i.coerceIn(0, sizes.lastIndex)
    val value = bytes / Math.pow(1024.0, index.toDouble())
    return if (index == 0) "$bytes B" else String.format("%.1f %s", value, sizes[index])
}

fun formatSpeed(bytesPerSec: Long): String {
    if (bytesPerSec <= 0) return "0 B/s"
    return formatBytes(bytesPerSec) + "/s"
}

fun formatDuration(seconds: Long): String {
    if (seconds < 0) return "—"
    if (seconds == 0L) return "—"
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return when {
        h > 0 -> "${h}h ${m}m"
        m > 0 -> "${m}m ${s}s"
        else -> "${s}s"
    }
}

fun formatProgress(task: TaskInfo): String {
    return "${task.percent}% (${formatBytes(task.completedLength)} / ${formatBytes(task.totalLength)})"
}

/** 完成/错误时间的展示格式：当天 HH:mm，昨天加前缀，同年「M月d日」，跨年带年份 */
fun formatFinishedTime(context: Context, timestamp: Long): String {
    if (timestamp <= 0) return ""
    val cal = java.util.Calendar.getInstance().apply { timeInMillis = timestamp }
    val now = java.util.Calendar.getInstance()
    fun pad(v: Int) = v.toString().padStart(2, '0')
    val hm = "${pad(cal.get(java.util.Calendar.HOUR_OF_DAY))}:${pad(cal.get(java.util.Calendar.MINUTE))}"
    val yesterday = java.util.Calendar.getInstance().apply {
        add(java.util.Calendar.DAY_OF_YEAR, -1)
    }
    val sameYear = now.get(java.util.Calendar.YEAR) == cal.get(java.util.Calendar.YEAR)
    return when {
        now.get(java.util.Calendar.YEAR) == cal.get(java.util.Calendar.YEAR) &&
            now.get(java.util.Calendar.DAY_OF_YEAR) == cal.get(java.util.Calendar.DAY_OF_YEAR) -> hm
        yesterday.get(java.util.Calendar.YEAR) == cal.get(java.util.Calendar.YEAR) &&
            yesterday.get(java.util.Calendar.DAY_OF_YEAR) == cal.get(java.util.Calendar.DAY_OF_YEAR) -> context.getString(R.string.yesterday, hm)
        sameYear -> context.getString(R.string.month_day, cal.get(java.util.Calendar.MONTH) + 1, cal.get(java.util.Calendar.DAY_OF_MONTH), hm)
        else -> "${cal.get(java.util.Calendar.YEAR)}/${cal.get(java.util.Calendar.MONTH) + 1}/${cal.get(java.util.Calendar.DAY_OF_MONTH)} $hm"
    }
}

/**
 * 任务状态色：与桌面端共用同一套取值（桌面来源 `src/shared/colors.json`，
 * 主列表状态点与进度条都读它），两种主题下都不变——桌面就是这么做的。
 * `awaiting_selection` 是安卓特有的「待勾选文件」状态，对应桌面
 * TaskProgress 的 pendingSelection 色 `#f0ad4e`。
 */
fun statusColor(status: String): Long = when (status) {
    "active" -> 0xFF1A7FE0  // --lc-color-primary（下载中）
    "seeding" -> 0xFF2ACB42 // complete 同色（做种中）
    "waiting" -> 0xFF737373
    "awaiting_selection" -> 0xFFF0AD4E // pendingSelection
    "paused" -> 0xFF737373
    "complete" -> 0xFF2ACB42
    "error" -> 0xFFFF6157
    "removed" -> 0xFF737373
    else -> 0xFF737373
}

fun statusText(context: Context, status: String): String = when (status) {
    "active" -> context.getString(R.string.status_active)
    "seeding" -> context.getString(R.string.status_seeding)
    "waiting" -> context.getString(R.string.status_waiting)
    "awaiting_selection" -> context.getString(R.string.status_awaiting_selection)
    "paused" -> context.getString(R.string.status_paused)
    "complete" -> context.getString(R.string.status_complete)
    "error" -> context.getString(R.string.status_error)
    "removed" -> context.getString(R.string.status_removed)
    else -> status
}
