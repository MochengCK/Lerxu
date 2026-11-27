package com.lerxu.android.ui.player

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.group
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * 播放器自己画的三枚图标（用户点名"重新设计一下右下角的横竖屏切换按钮"）。
 *
 * 为什么不直接用 Material 那套：
 * - 左上角那枚"退出全屏"要的就是**一枚向左的尖角**（用户点名）—— Material 的
 *   `FullscreenExit` 是"四角向内"的通用符号，读不出"退出去"；
 * - 右下角那枚要**分横竖屏**：横屏时是"缩回竖屏"、竖屏时是"转成横屏"，
 *   Material 没有这个说法。
 *
 * 笔法跟着 Material Rounded 走（圆头圆角、1.9 描边、24 视口），图形语言是我们自己的：
 * 转屏那两枚是**同一枚符号的两个方向**（设备画在目标方向上 + 半圈回转箭头，两枚互成
 * 90°），一眼就能读出"点下去它会转成什么样"。颜色不写死：`Icon(tint = …)` 会整体着色。
 */
private fun buildIcon(name: String, block: ImageVector.Builder.() -> Unit): ImageVector =
    ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    ).apply(block).build()

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
 * 退出全屏（**全屏态左上角**那枚）：**一枚向左的尖角（chevron）**。
 *
 * 用户点名："左侧应该显示退出全屏按钮，退出全屏按钮应该就是一个向左的箭头"；
 * 后来又点名："把右侧那条横杠删掉，只保留一个向左的图标" —— 所以这里不再画箭身，
 * 只留两条在左侧收尖的斜边，读起来就是最干净的"返回"。几何在 24 视口里居中
 * （尖点 x=7.8、两翼 x=15.2），放进 44dp 命中框里不会偏左。
 * 笔法跟着 Material Rounded（圆头圆角、1.9 描边、24 视口）。
 */
val LerxuExitFullscreen: ImageVector by lazy {
    buildIcon("LerxuExitFullscreen") {
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = STROKE_W,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 只有一枚向左的尖角（chevron）：用户点名删掉右侧那条横杠，不要箭身
            moveTo(15.2f, 5.0f)
            lineTo(7.8f, 12f)
            lineTo(15.2f, 19.0f)
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
    buildIcon("LerxuRotateToPortrait") { portraitRotatePaths() }
}

/**
 * 转屏图标共用的笔画：**竖屏设备 + 右侧回转箭头**。
 *
 * 之前那版箭头是一段很短的半圆、贴着 24 视口最右边，设备又偏左，整体重心歪、
 * 放大到 28dp 时显得草率（用户点名）。这里把设备收窄、箭头拉成完整的半椭圆，
 * 末端箭头沿切线张开，并补上听筒 / 底部指示条，线条更稳、更像一枚精致的状态图标。
 */
private fun ImageVector.Builder.portraitRotatePaths() {
    path(
        stroke = SolidColor(Color.White),
        strokeLineWidth = 1.8f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round
    ) {
        // 设备轮廓
        roundRect(l = 5.8f, t = 3.2f, r = 14.6f, b = 20.8f, radius = 2.4f)
    }
    path(
        stroke = SolidColor(Color.White),
        strokeLineWidth = 1.5f,
        strokeLineCap = StrokeCap.Round
    ) {
        // 听筒与底部指示条：小细节让轮廓读起来像手机
        moveTo(9.4f, 5.4f)
        lineTo(11.0f, 5.4f)
        moveTo(9.2f, 18.6f)
        lineTo(11.2f, 18.6f)
    }
    path(
        stroke = SolidColor(Color.White),
        strokeLineWidth = 1.8f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round
    ) {
        // 回转箭头：右侧半椭圆（上 → 右 → 下），箭头收在下端、**沿切线**张开。
        // 早先两条箭羽横在末端（一上一下），读出来是一枚"向左的箭头"、不像回转，
        // 这里按终点切线（左下方向）把两翼摆到右侧偏上，尖端才顺着弧势指出去
        moveTo(17.4f, 6.6f)
        curveTo(20.0f, 8.4f, 20.0f, 15.6f, 17.4f, 17.4f)
        moveTo(19.2f, 17.3f)
        lineTo(17.4f, 17.4f)
        lineTo(18.1f, 15.7f)
    }
}

/**
 * 全屏里"转成横屏"（右下角那枚，当前是竖屏时显示）：**横着的设备 + 一枚回转箭头** ——
 * 就是 [LerxuRotateToPortrait] 整体转 90° 的样子（半圈从右边搬到下边）。
 */
val LerxuRotateToLandscape: ImageVector by lazy {
    buildIcon("LerxuRotateToLandscape") {
        // 与竖屏同构：整枚符号转 90°，设备与箭头的关系永远一致
        group(rotate = 90f, pivotX = 12f, pivotY = 12f) {
            portraitRotatePaths()
        }
    }
}

/**
 * 全屏信息栏左侧那枚 **WiFi**（用户点名："在左侧显示使用的是 WiFi 还是流量"）：
 * 三道人字弧 + 一个点，就是各家状态栏那一枚。
 *
 * 信息栏这两枚（本枚与 [LerxuCellular]）**必须成套**：它们表达的是同一件事的两种答案，
 * 所以弧的粗细、点的直径、柱子的宽度都取同一套笔法（1.9 描边 / 24 视口），
 * 换一个看另一个才不会"一个胖一个瘦"。
 */
val LerxuWifi: ImageVector by lazy {
    buildIcon("LerxuWifi") {
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = STROKE_W,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 三道同心的弧，越往外张得越开；用三次贝塞尔近似（控制点取满弦的 2/3 处）
            moveTo(3.3f, 10.3f)
            curveTo(7.0f, 6.7f, 17.0f, 6.7f, 20.7f, 10.3f)
            moveTo(6.7f, 13.9f)
            curveTo(9.2f, 11.5f, 14.8f, 11.5f, 17.3f, 13.9f)
            moveTo(10.0f, 17.3f)
            curveTo(11.2f, 16.2f, 12.8f, 16.2f, 14.0f, 17.3f)
        }
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = 2.6f,
            strokeLineCap = StrokeCap.Round
        ) {
            // 那个点：PathBuilder 没有 circle，一段极短的圆头线就是一颗点
            moveTo(12f, 20.0f)
            lineTo(12f, 20.05f)
        }
    }
}

/**
 * 信息栏左侧那枚 **移动数据**（与 [LerxuWifi] 是同一件事的另一个答案）：四根底对齐的信号柱。
 *
 * 实心柱而不是描边：状态栏尺寸下（16dp）1.9 描边的四根柱子会糊成一团，
 * 实心块才分得清四档高低 —— 这也是各家状态栏的做法。
 */
val LerxuCellular: ImageVector by lazy {
    buildIcon("LerxuCellular") {
        // 四根柱子底对齐（b 都是 19.4），由矮到高：这是状态栏里"有信号"那一档的读法。
        // 每根单独一条 path —— 一条 path 装四根要把 roundRect 拼成四个子路径，
        // 而 path() 是**追加**语义，写四条反而最短也最好读
        path(fill = SolidColor(Color.White)) { roundRect(l = 3.5f, t = 15.0f, r = 6.4f, b = 19.4f, radius = 1.1f) }
        path(fill = SolidColor(Color.White)) { roundRect(l = 8.3f, t = 12.0f, r = 11.2f, b = 19.4f, radius = 1.1f) }
        path(fill = SolidColor(Color.White)) { roundRect(l = 13.1f, t = 9.0f, r = 16.0f, b = 19.4f, radius = 1.1f) }
        path(fill = SolidColor(Color.White)) { roundRect(l = 17.9f, t = 6.0f, r = 20.8f, b = 19.4f, radius = 1.1f) }
    }
}

/**
 * 下载弹窗左侧那枚图标：**一张折角文稿 + 一枚播放三角**（用户点名："它应该代表的是一个
 * 文件图标，而不是这个"、"上网搜索一下，参考一下"）。
 *
 * 早先这里放的是 Material 的 `Movie`（一卷胶片）—— 它讲的是"这是一段视频"，而这一行
 * 要讲的其实是"你即将落盘的**这个文件**"：名称、大小、改名，说的都是文件。所以按业界
 * 那套 `file-video` 的画法重画（Lucide / Material Symbols 里都有这一枚，形状几乎一样）：
 * **文稿轮廓 + 右上折角 + 文稿下腹的播放三角** —— 一眼读出"视频文件"，而不是"一段视频"
 * 或者"一个文本文件"（折角 + 两道正文线那种画法只读得出"文档"）。
 *
 * 三角**实心**、文稿**描边**：与「更多功能」那六枚同一套"线 + 一块实心"的语言；
 * 三角的光学中心比几何中心右移一点（`10.4 → 15.2`），这也是图标设计里对三角形的标准修正
 * —— 顶角在左边，几何居中看着会偏左。
 *
 * 笔法与 [LerxuExitFullscreen] 同一套（圆头圆角、1.9 描边、24 视口）。
 */
val LerxuFile: ImageVector by lazy {
    buildIcon("LerxuFile") {
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = STROKE_W,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 外轮廓：右上角被折角斜切（最后的 close 就是那条切线），另外三个角是圆角
            moveTo(13.8f, 3.0f)
            horizontalLineTo(7.6f)
            curveTo(6.27f, 3.0f, 5.2f, 4.07f, 5.2f, 5.4f)
            verticalLineTo(18.6f)
            curveTo(5.2f, 19.93f, 6.27f, 21.0f, 7.6f, 21.0f)
            horizontalLineTo(16.4f)
            curveTo(17.73f, 21.0f, 18.8f, 19.93f, 18.8f, 18.6f)
            verticalLineTo(8.0f)
            close()
        }
        path(
            stroke = SolidColor(Color.White),
            strokeLineWidth = STROKE_W,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            // 折角：竖边 + 横边，与切线合成那枚小三角
            moveTo(13.8f, 3.0f)
            verticalLineTo(8.0f)
            horizontalLineTo(18.8f)
        }
        path(fill = SolidColor(Color.White)) {
            // 播放三角：实心（文稿下腹，光学居中偏右）
            moveTo(10.4f, 11.2f)
            lineTo(15.2f, 13.9f)
            lineTo(10.4f, 16.6f)
            close()
        }
    }
}
