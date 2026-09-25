package com.lerxu.android.ui.player

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * 播放器自己画的三枚图标（用户点名"重新设计一下右下角的横竖屏切换按钮"）。
 *
 * 为什么不直接用 Material 那套：
 * - 左上角那枚"退出全屏"要的就是**一枚向左的箭头**（用户点名）—— Material 的
 *   `FullscreenExit` 是"四角向内"的通用符号，读不出"退出去"；
 * - 右下角那枚要**分横竖屏**：横屏时是"缩回竖屏"、竖屏时是"转成横屏"，
 *   Material 没有这个说法。
 *
 * 笔法跟着 Material Rounded 走（圆头圆角、1.9 描边、24 视口），图形语言是我们自己的：
 * 转屏那两枚是**同一枚符号的两个方向**（设备画在目标方向上 + 半圈回转箭头，两枚互成
 * 90°），一眼就能读出"点下去它会转成什么样"。颜色不写死：`Icon(tint = …)` 会整体着色。
 */
private fun buildIcon(name: String, block: ImageVector.Builder.() -> ImageVector.Builder): ImageVector =
    ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    ).block().build()

/** 描边路径的公共参数（与 Material Rounded 的观感对齐）：交给 [path] 构造器。 */
private const val STROKE_W = 1.9f

/** 圆角矩形（用三段立方近似圆角，写成一条闭合路径）。 */
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

/**
 * 退出全屏（**全屏态左上角**那枚）：**一枚向左的箭头**。
 *
 * 用户点名："左侧应该显示退出全屏按钮，退出全屏按钮应该就是一个向左的箭头"。
 * 早先这里画的是"小窗 + 斜向射入的箭头"、摆在右上角 —— 那套语汇是"画面缩回小窗"，
 * 而用户要的就是最朴素的返回箭头：摆在左边、朝左、一眼读得出"退出去"。
 * 笔法仍跟着 Material Rounded（圆头圆角、1.9 描边、24 视口），尺寸取 Material
 * `arrow_back` 的比例（箭羽张开约 90°）。
 */
val LerxuExitFullscreen: ImageVector by lazy {
    buildIcon("LerxuExitFullscreen") {
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = STROKE_W,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 箭身：从右往左
            moveTo(19.8f, 12f)
            horizontalLineTo(4.8f)
            // 箭羽：两条斜边在左侧收成尖
            moveTo(11.6f, 5.2f)
            lineTo(4.8f, 12f)
            lineTo(11.6f, 18.8f)
        }
    }
}

/**
 * 全屏里"转成竖屏"（右下角那枚，当前是横屏时显示）：**竖着的设备 + 一枚回转箭头**。
 *
 * 用户点名要"重新设计"这一枚。设计取的是**"整个符号跟着转过去"**这一条：
 * 设备画在**目标方向**上（转竖屏 = 竖着的小窗），旁边一枚半圈的回转箭头说明"它会转"，
 * 而 [LerxuRotateToLandscape] 就是这一枚**整体转 90°** 的样子 —— 两枚图形同构，
 * 用户一看就知道点下去会发生什么，也不会把它误读成"退出全屏"。
 *
 * 与 [LerxuExitFullscreen] 同一套笔法（圆头圆角、1.9 描边、24 视口）。
 */
val LerxuRotateToPortrait: ImageVector by lazy {
    buildIcon("LerxuRotateToPortrait") {
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = STROKE_W,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 竖着的设备（居中偏左，给右侧那半圈留位置）
            roundRect(l = 7.4f, t = 3.2f, r = 16.6f, b = 20.8f, radius = 2.8f)
        }
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = STROKE_W,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 回转箭头：右侧半圈（上 → 右 → 下），箭头收在下端、朝左
            moveTo(19.4f, 9.0f)
            curveTo(21.06f, 9.0f, 22.4f, 10.34f, 22.4f, 12.0f)
            curveTo(22.4f, 13.66f, 21.06f, 15.0f, 19.4f, 15.0f)
            moveTo(21.5f, 13.5f)
            lineTo(19.4f, 15.0f)
            lineTo(21.5f, 16.5f)
        }
    }
}

/**
 * 全屏里"转成横屏"（右下角那枚，当前是竖屏时显示）：**横着的设备 + 一枚回转箭头** ——
 * 就是 [LerxuRotateToPortrait] 整体转 90° 的样子（半圈从右边搬到下边）。
 */
val LerxuRotateToLandscape: ImageVector by lazy {
    buildIcon("LerxuRotateToLandscape") {
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = STROKE_W,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            roundRect(l = 3.2f, t = 7.4f, r = 20.8f, b = 16.6f, radius = 2.8f)
        }
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = STROKE_W,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 回转箭头：下半圈（左 → 下 → 右），箭头收在左端、朝上
            moveTo(15.0f, 19.4f)
            curveTo(15.0f, 21.06f, 13.66f, 22.4f, 12.0f, 22.4f)
            curveTo(10.34f, 22.4f, 9.0f, 21.06f, 9.0f, 19.4f)
            moveTo(10.5f, 21.5f)
            lineTo(9.0f, 19.4f)
            lineTo(7.5f, 21.5f)
        }
    }
}
