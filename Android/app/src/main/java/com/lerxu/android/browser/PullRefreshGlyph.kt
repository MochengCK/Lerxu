package com.lerxu.android.browser

import kotlin.math.cos
import kotlin.math.sin

/**
 * 下拉刷新指示器的几何计算（纯函数、与 Compose 无关，可纯 JVM 单测）。
 *
 * 指示器只画两样东西：**一段弧** + **弧尾的箭头**。两者共用一个形变进度
 * `progress`（0 = 什么都没有，1 = 就绪 / 刷新中），于是：
 *
 * - 弧的**尾**钉在右上不动，随进度向逆时针方向长出来（长度从 0 开始）；
 * - 长满之后，弧尾的箭头从**零尺寸**展开。
 *
 * 全程没有任何一步是「把 A 换成 B」，所以从下拉到刷新图标是一条连续生长。
 * 上一版是在 `pull >= 0.99` 时整块换成静态的 `Icons.Refresh` —— 弧与箭头在
 * 两帧之间交接，看起来就是「突然变成刷新图标」。
 *
 * 坐标约定：圆心为原点，x 向右、y 向下（与画布一致），角度 0° = 三点钟、
 * 顺时针为正。
 */
object PullRefreshGlyph {

    /** 满进度时弧扫过的角度：留 60° 缺口，就是刷新图标那一口。 */
    const val ARC_SWEEP_DEG = 300f

    /** 弧的收尾角：-60° 落在右上，箭头从这里指出去。 */
    const val ARC_TIP_DEG = -60f

    /** 弧在总行程的前多少比例长满 —— 剩下的留给箭头展开，读得出「还差一点」。 */
    const val RING_DONE = 0.78f

    /** 箭头开始展开的进度：与弧长满有一小段重叠，交接处才不生硬。 */
    const val HEAD_START = 0.5f

    /** 主色开始介入的进度（就绪感的颜色提示）。 */
    const val ACCENT_START = 0.72f

    /** 就绪时箭头的尺度（相对圆半径）：沿切向的长度、向后的一点点、半宽。 */
    private const val HEAD_AHEAD = 0.31f
    private const val HEAD_BEHIND = 0.115f
    private const val HEAD_HALF_WIDTH = 0.31f

    /** 一个点（相对圆心）。刻意用最朴素的类型：单测里不必依赖 Compose 的几何类。 */
    data class Point(val x: Float, val y: Float)

    /** 弧：从 [startDeg] 起顺时针扫 [sweepDeg]。 */
    data class Arc(val startDeg: Float, val sweepDeg: Float)

    /** 箭头三角：顶点 + 底边两点。 */
    data class Head(val apex: Point, val baseA: Point, val baseB: Point)

    /**
     * 平滑阶跃：[edge0] 之前恒 0、[edge1] 之后恒 1，中间三次平滑过渡。
     *
     * 用它而不是线性映射，是为了让「长出来」和「展开」都有起步与收尾的软过渡 ——
     * 线性映射在起点会有一下很硬的出现感。
     */
    fun smoothStep(edge0: Float, edge1: Float, x: Float): Float {
        if (edge1 <= edge0) return if (x >= edge1) 1f else 0f
        val t = ((x - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    /**
     * 弧：尾端恒为 [ARC_TIP_DEG]，长度随进度从 0 长到 [ARC_SWEEP_DEG]。
     *
     * 不变量：[startDeg] + [sweepDeg] == [ARC_TIP_DEG] —— 尾端钉住不动是
     * 「从一点长出来」的关键，否则看起来会是一段弧在环上平移。
     */
    fun arc(progress: Float): Arc {
        val sweep = ARC_SWEEP_DEG * smoothStep(0f, RING_DONE, progress.coerceIn(0f, 1f))
        return Arc(startDeg = ARC_TIP_DEG - sweep, sweepDeg = sweep)
    }

    /**
     * 弧尾的箭头：沿**顺时针切向**伸出的三角（指向旋转方向），尺寸随进度从 0 长大。
     *
     * [radius] 是弧的半径；箭头各尺寸都按它等比取（见 `HEAD_*`），所以画布大小
     * 变化时形状不变。进度不足 [HEAD_START] 时返回 null（还没有箭头可画）。
     */
    fun head(progress: Float, radius: Float): Head? {
        val k = smoothStep(HEAD_START, 1f, progress.coerceIn(0f, 1f))
        if (k <= 0.001f) return null
        val rad = Math.toRadians(ARC_TIP_DEG.toDouble())
        val ux = cos(rad).toFloat()   // 径向单位向量（由圆心指向弧尾）
        val uy = sin(rad).toFloat()
        val tx = -uy                  // 顺时针切向单位向量
        val ty = ux
        val tipX = ux * radius
        val tipY = uy * radius
        val ahead = HEAD_AHEAD * radius * k
        val behind = HEAD_BEHIND * radius * k
        val half = HEAD_HALF_WIDTH * radius * k
        val baseX = tipX - tx * behind
        val baseY = tipY - ty * behind
        return Head(
            apex = Point(tipX + tx * ahead, tipY + ty * ahead),
            baseA = Point(baseX + ux * half, baseY + uy * half),
            baseB = Point(baseX - ux * half, baseY - uy * half)
        )
    }

    /** 主色介入程度（0 = 仍是中性描边色，1 = 完全是主色）。 */
    fun accent(progress: Float): Float = smoothStep(ACCENT_START, 1f, progress.coerceIn(0f, 1f))

    /**
     * 整块的显隐：0 → 1 在很短的行程里走完（下拉一点点就该看见），
     * 于是「收回」时也是先淡掉、再收形 —— 退场不会被看见成一段干瘪的收线。
     */
    fun alpha(progress: Float): Float = (progress.coerceIn(0f, 1f) * 2.6f).coerceIn(0f, 1f)
}
