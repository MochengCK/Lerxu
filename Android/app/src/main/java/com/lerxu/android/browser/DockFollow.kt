package com.lerxu.android.browser

import kotlin.math.abs
import kotlin.math.exp

/**
 * 底部坞"跟手收起 + 最终吸附"的纯逻辑。
 *
 * 抽成纯函数（与 [BrowseHistory]、[TabNaming] 同一套路）是为了能在 JVM 单测里
 * 钉住两条被用户点名的规则：
 * ① **方向绑的是网页滚动方向**（网页向下滚 = 收起、向上滚 = 展开），不是手指方向；
 * ② **停下后按"过没过一半"吸附** —— 但甩得快时按甩的方向（见 [settleTarget]）。
 *
 * 状态的持有与补间在 [BrowserController] 里（它要跑动画、要接网页回传），
 * 这里只管"给一个增量算新进度"、"给进度和速度算吸附目标"、"按弹簧解析解算位移"。
 */
object DockFollow {

    /** 吸附判据：进度**过半**就吸到收起态，不到一半展回展开态（用户点名的约 50%）。 */
    const val SNAP_AT = 0.5f

    /**
     * 网页滚多少距离（dp）才从"全展"滚到"全收"。
     *
     * WebView 里 1 CSS px ≈ 1dp（初始缩放 1、viewport 宽 = 设备宽），所以按 dp 给。
     * 吸附判据是"过半"，也就等价于滚 60dp 左右就真的收进去 ——
     * 与系统浏览器藏地址栏的手感同档。
     */
    const val SCROLL_TRAVEL_DP = 120f

    /** 在坞上往下拖多少距离（dp）才从"全展"拖到"全收"：比滚动那一档更跟手一点。 */
    const val DRAG_TRAVEL_DP = 72f

    /**
     * fling 判据（进度/秒）：跟手速度超过它时，吸附**不看位置、只看甩的方向**。
     *
     * 用户甩一把（快速下滑）却因为只滚了三四十 dp（进度不到一半）就弹回来，
     * 读起来就是"它不听我的" —— 系统浏览器的地址栏、列表的 fling 都是这个语义。
     */
    const val FLING_VELOCITY = 1.6f

    /**
     * 吸附弹簧的自然频率（rad/s，临界阻尼 1.0）。
     *
     * 无初速时半程吸附 ≈ 210ms —— 与上一版固定 220ms 的 tween 同档，
     * 手感延长而不是换一条曲线；有初速时由解析解自然接续（见 [springValue]）。
     */
    const val SPRING_OMEGA = 22f

    /** 跟手速度的 EMA 平滑系数：滚动事件间隔不匀（逐帧 / 成批），瞬时值直接当速度会抖。 */
    const val VELOCITY_SMOOTHING = 0.4f

    /** 停手后速度的衰减时间常数（毫秒）：停手判定 110ms 之后只剩约三成。 */
    const val VELOCITY_DECAY_MS = 90f

    /**
     * 推进收起进度。
     *
     * [deltaPx] > 0 = **网页向下滚**（内容往上走、继续看下面的内容）→ 收起；
     * < 0 = 网页向上滚 → 展开。[travelPx] = 从全展到全收需要多少像素。
     *
     * 方向不必另判：`scrollY/scrollTop` 的增减**就是网页的滚动方向**
     *（网页向下滚 = 增量为正 = 收起），页面上报的正负号直接照用。
     * 反过来按手指方向绑就会变成"手指一上滑坞反而展开"（用户点名要避免的）。
     */
    fun advance(progress: Float, deltaPx: Float, travelPx: Float): Float {
        if (travelPx <= 0f || deltaPx == 0f) return progress.coerceIn(0f, 1f)
        return (progress + deltaPx / travelPx).coerceIn(0f, 1f)
    }

    /**
     * 吸附目标：**速度优先、位置兜底**。
     *
     * - [velocity] >= [FLING_VELOCITY]（还在快速下滑）→ 1（收起）；
     * - <= -[FLING_VELOCITY]（快速上滑）→ 0（展开）；
     * - 其余按"过没过一半"（[SNAP_AT]）。
     *
     * [velocity] 单位是**进度/秒**（1 = 一整段行程），与弹簧的初速同一口径。
     * 不传速度时（默认 0）行为与旧版一致 —— 单测里那几条"过半吸附"照旧成立。
     */
    fun settleTarget(progress: Float, velocity: Float = 0f): Float {
        if (velocity >= FLING_VELOCITY) return 1f
        if (velocity <= -FLING_VELOCITY) return 0f
        return if (progress >= SNAP_AT) 1f else 0f
    }

    /** EMA 平滑一次速度采样（单位与 [instant] 一致：进度/秒）。 */
    fun smoothVelocity(previous: Float, instant: Float): Float =
        previous * (1f - VELOCITY_SMOOTHING) + instant * VELOCITY_SMOOTHING

    /** 停手 [idleMs] 毫秒后的速度残值：越久越接近 0，吸附不会拿"停手那一刻"的全速去冲。 */
    fun decayVelocity(velocity: Float, idleMs: Long): Float =
        velocity * exp(-idleMs.coerceAtLeast(0L) / VELOCITY_DECAY_MS)

    /**
     * 临界阻尼弹簧的位移解析解（单位：进度），[t] 为秒。
     *
     * `x(t) = target + (a + b·t)·e^(-ωt)`，其中 `a = from - target`、`b = v0 + ω·a`。
     *
     * 选临界阻尼（ζ = 1）而不是欠阻尼：吸附是"归位"动作，不该像弹簧玩具那样
     * 来回弹几下；带初速时允许一次轻微过冲（数学解自带的），这与快甩之后
     * 坞"顺势多收一点"的直觉一致。**这里不夹取 0..1** —— 保持数学纯净，
     * 夹取由调用方在写入进度时做。
     */
    fun springValue(from: Float, target: Float, velocity: Float, t: Float): Float {
        if (t <= 0f) return from
        val a = from - target
        val b = velocity + SPRING_OMEGA * a
        return target + (a + b * t) * exp(-SPRING_OMEGA * t)
    }

    /**
     * 弹簧补间要跑多久（毫秒）：包络 `(|a| + |b|·t)·e^(-ωt)` 衰减到可忽略的时刻。
     *
     * 夹取到 140..900ms：太短会看出"戛然而止"，太长会让"已经到位"的尾巴拖住
     * 下一次跟手（下一次跟手会掐掉补间，但停手那一刻的观感要干净）。
     */
    fun springDurationMs(from: Float, target: Float, velocity: Float): Long {
        val a = from - target
        val b = velocity + SPRING_OMEGA * a
        val eps = 0.004f
        val step = 1f / 120f
        var t = 0f
        while (t < 2f && (abs(a) + abs(b) * t) * exp(-SPRING_OMEGA * t) > eps) {
            t += step
        }
        return (t * 1000f).coerceIn(140f, 900f).toLong()
    }
}
