package com.lerxu.android.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * 应用内自绘图标：与播放器图标同一套笔法（24 视口、1.9 描边、圆头圆角），
 * 颜色交给 `Icon(tint = …)`。Material 的 Rounded 图标在 13~26dp 之间粗细
 * 不一致，混在自绘的种子文件图标旁尤其明显，这里把任务/传输相关图形统一。
 */
private const val UI_STROKE_W = 1.9f

private fun buildUiIcon(name: String, block: ImageVector.Builder.() -> Unit): ImageVector =
    ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    ).apply(block).build()

private fun ImageVector.Builder.stroked(block: PathBuilder.() -> Unit) {
    path(
        stroke = SolidColor(Color.White),
        strokeLineWidth = UI_STROKE_W,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round
    ) { block() }
}

private fun PathBuilder.roundRect(l: Float, t: Float, r: Float, b: Float, radius: Float) {
    val k = radius * 0.5523f
    moveTo(l + radius, t)
    horizontalLineTo(r - radius)
    curveTo(r - radius + k, t, r, t + radius - k, r, t + radius)
    verticalLineTo(b - radius)
    curveTo(r, b - radius + k, r - radius + k, b, r - radius, b)
    horizontalLineTo(l + radius)
    curveTo(l + radius - k, b, l, b - radius + k, l, b - radius)
    verticalLineTo(t + radius)
    curveTo(l, t + radius - k, l + radius - k, t, l + radius, t)
    close()
}

private fun PathBuilder.circle(cx: Float, cy: Float, r: Float) {
    val k = r * 0.5523f
    moveTo(cx, cy - r)
    curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy)
    curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r)
    curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
    curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r)
    close()
}

/** 发送文件（托盘 + 上行箭头）。 */
val LerxuUpload: ImageVector by lazy {
    buildUiIcon("LerxuUpload") {
        stroked {
            moveTo(12f, 15.4f)
            verticalLineTo(4.2f)
            moveTo(8.2f, 8.0f)
            lineTo(12f, 4.2f)
            lineTo(15.8f, 8.0f)
            moveTo(5f, 19.2f)
            horizontalLineTo(19f)
        }
    }
}

/** 下载（托盘 + 下行箭头）。 */
val LerxuDownload: ImageVector by lazy {
    buildUiIcon("LerxuDownload") {
        stroked {
            moveTo(12f, 4.2f)
            verticalLineTo(15.4f)
            moveTo(8.2f, 11.6f)
            lineTo(12f, 15.4f)
            lineTo(15.8f, 11.6f)
            moveTo(5f, 19.2f)
            horizontalLineTo(19f)
        }
    }
}

val LerxuChevronRight: ImageVector by lazy {
    buildUiIcon("LerxuChevronRight") {
        stroked {
            moveTo(9.2f, 5.8f)
            lineTo(15.4f, 12f)
            lineTo(9.2f, 18.2f)
        }
    }
}

val LerxuSend: ImageVector by lazy {
    buildUiIcon("LerxuSend") {
        stroked {
            moveTo(20.2f, 3.8f)
            lineTo(10.9f, 13.1f)
            moveTo(20.2f, 3.8f)
            lineTo(13.9f, 20.2f)
            lineTo(10.9f, 13.1f)
            lineTo(3.8f, 10.1f)
            close()
        }
    }
}

val LerxuFolder: ImageVector by lazy {
    buildUiIcon("LerxuFolder") {
        stroked {
            moveTo(3.8f, 7.4f)
            curveTo(3.8f, 6.5f, 4.5f, 5.8f, 5.4f, 5.8f)
            horizontalLineTo(9.2f)
            lineTo(10.9f, 8.0f)
            horizontalLineTo(18.6f)
            curveTo(19.5f, 8.0f, 20.2f, 8.7f, 20.2f, 9.6f)
            verticalLineTo(17.2f)
            curveTo(20.2f, 18.1f, 19.5f, 18.8f, 18.6f, 18.8f)
            horizontalLineTo(5.4f)
            curveTo(4.5f, 18.8f, 3.8f, 18.1f, 3.8f, 17.2f)
            close()
        }
    }
}

val LerxuAdd: ImageVector by lazy {
    buildUiIcon("LerxuAdd") {
        stroked {
            moveTo(12f, 5.2f)
            verticalLineTo(18.8f)
            moveTo(5.2f, 12f)
            horizontalLineTo(18.8f)
        }
    }
}

val LerxuPaste: ImageVector by lazy {
    buildUiIcon("LerxuPaste") {
        stroked {
            roundRect(5.5f, 4.8f, 18.5f, 20.2f, 2.4f)
            roundRect(9.2f, 2.8f, 14.8f, 6.0f, 1.4f)
        }
    }
}

val LerxuClose: ImageVector by lazy {
    buildUiIcon("LerxuClose") {
        stroked {
            moveTo(7f, 7f)
            lineTo(17f, 17f)
            moveTo(17f, 7f)
            lineTo(7f, 17f)
        }
    }
}

/** 两台设备并排：附近设备选择行的主图标。 */
val LerxuDevices: ImageVector by lazy {
    buildUiIcon("LerxuDevices") {
        stroked {
            roundRect(3.8f, 4.0f, 11.4f, 20.0f, 2.0f)
            moveTo(6.8f, 17.2f)
            horizontalLineTo(8.4f)
            roundRect(13.2f, 7.0f, 20.6f, 20.0f, 2.0f)
            moveTo(15.8f, 17.2f)
            horizontalLineTo(18.0f)
        }
    }
}

val LerxuPhone: ImageVector by lazy {
    buildUiIcon("LerxuPhone") {
        stroked {
            roundRect(6.6f, 2.8f, 17.4f, 21.2f, 2.4f)
            moveTo(10.8f, 18.4f)
            horizontalLineTo(13.2f)
        }
    }
}

val LerxuComputer: ImageVector by lazy {
    buildUiIcon("LerxuComputer") {
        stroked {
            roundRect(3.2f, 4.6f, 20.8f, 15.8f, 1.8f)
            moveTo(12f, 15.8f)
            verticalLineTo(19.2f)
            moveTo(8.2f, 19.4f)
            horizontalLineTo(15.8f)
        }
    }
}

/** 本地播放：圆 + 播放三角（不用实心按钮那套 Material 图标）。 */
val LerxuPlay: ImageVector by lazy {
    buildUiIcon("LerxuPlay") {
        stroked {
            circle(12f, 12f, 8.2f)
            moveTo(10.3f, 8.7f)
            lineTo(15.4f, 12f)
            lineTo(10.3f, 15.3f)
            close()
        }
    }
}

val LerxuCheckCircle: ImageVector by lazy {
    buildUiIcon("LerxuCheckCircle") {
        stroked {
            circle(12f, 12f, 8.2f)
            moveTo(8.2f, 12.2f)
            lineTo(11.1f, 15.0f)
            lineTo(16.0f, 9.2f)
        }
    }
}

val LerxuCircle: ImageVector by lazy {
    buildUiIcon("LerxuCircle") {
        stroked {
            circle(12f, 12f, 8.2f)
        }
    }
}
