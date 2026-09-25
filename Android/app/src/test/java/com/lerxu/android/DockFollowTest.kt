package com.lerxu.android

import com.lerxu.android.browser.DockFollow
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 底部坞"跟手收起 + 吸附"的规则单测。
 *
 * 盯的都是用户点名过的行为：**方向绑网页滚动方向**、**过半吸附**、跟手可逆。
 */
class DockFollowTest {

    private val travel = DockFollow.SCROLL_TRAVEL_DP

    /**
     * 网页**向下滚**（内容往上走、继续看下面的内容）→ 收起。
     *
     * 这条就是"绑网页滚动方向而不是手指方向"：手指上滑才会让内容上移，所以
     * 对应到页面上报的 `scrollY/scrollTop` 增量是**正**的。
     */
    @Test
    fun `scrolling the page down collapses the dock`() {
        assertEquals(0.5f, DockFollow.advance(0f, travel / 2f, travel), 1e-4f)
        assertEquals(1f, DockFollow.advance(0f, travel, travel), 1e-4f)
        // 手指再上滑（继续向下滚）也只会停在全收，不会溢出
        assertEquals(1f, DockFollow.advance(1f, travel, travel), 1e-4f)
    }

    /** 网页**向上滚**（回看上面的内容）→ 展开。 */
    @Test
    fun `scrolling the page up expands the dock`() {
        assertEquals(0.5f, DockFollow.advance(1f, -travel / 2f, travel), 1e-4f)
        assertEquals(0f, DockFollow.advance(1f, -travel, travel), 1e-4f)
        assertEquals(0f, DockFollow.advance(0f, -travel, travel), 1e-4f)
    }

    /** 跟手是可逆的：滚下去多少、再滚回来就回到原处。 */
    @Test
    fun `following is reversible`() {
        val down = DockFollow.advance(0f, travel * 0.3f, travel)
        assertEquals(0.3f, down, 1e-4f)
        assertEquals(0f, DockFollow.advance(down, -travel * 0.3f, travel), 1e-4f)
    }

    /** 进度恒在 0..1 之间（两端都不会越界）。 */
    @Test
    fun `progress stays within 0 and 1`() {
        assertEquals(0f, DockFollow.advance(-5f, -1f, travel), 1e-4f)
        assertEquals(1f, DockFollow.advance(9f, 1f, travel), 1e-4f)
    }

    /** 退化输入不该乱动进度，也不该除零。 */
    @Test
    fun `degenerate input keeps progress untouched`() {
        assertEquals(0.4f, DockFollow.advance(0.4f, 0f, travel), 1e-4f)
        assertEquals(0.4f, DockFollow.advance(0.4f, 30f, 0f), 1e-4f)
    }

    /** 停下后的吸附：**过半收进去、不到一半展回来**（用户点名的约 50%）。 */
    @Test
    fun `settle snaps past half and restores below half`() {
        assertEquals(1f, DockFollow.settleTarget(1f), 1e-4f)
        assertEquals(1f, DockFollow.settleTarget(0.5f), 1e-4f)
        assertEquals(0f, DockFollow.settleTarget(0.49f), 1e-4f)
        assertEquals(0f, DockFollow.settleTarget(0f), 1e-4f)
    }

    /** 吸附阈值与"点胶囊恢复展开"的判定共用一个常量，别各自写死。 */
    @Test
    fun `snap threshold matches the shared constant`() {
        // 正好卡在阈值上算"过关"（收进去），差一点点才算没过
        assertEquals(1f, DockFollow.settleTarget(DockFollow.SNAP_AT), 1e-4f)
        assertEquals(0f, DockFollow.settleTarget(DockFollow.SNAP_AT - 1e-6f), 1e-4f)
    }

    /** 坞上拖动与网页滚动是两档行程，都要能走满全程。 */
    @Test
    fun `both travels cover the full range`() {
        assertEquals(1f, DockFollow.advance(0f, DockFollow.DRAG_TRAVEL_DP, DockFollow.DRAG_TRAVEL_DP), 1e-4f)
        assertEquals(0f, DockFollow.advance(1f, -DockFollow.DRAG_TRAVEL_DP, DockFollow.DRAG_TRAVEL_DP), 1e-4f)
    }

    /** 甩得快时**不看位置**：快速下滑（哪怕只收了一点点）也收进去。 */
    @Test
    fun `fast downward fling collapses below half`() {
        assertEquals(1f, DockFollow.settleTarget(0.2f, DockFollow.FLING_VELOCITY + 0.2f), 1e-4f)
    }

    /** 反向同理：快速上滑哪怕已经过了半也展回来。 */
    @Test
    fun `fast upward fling expands above half`() {
        assertEquals(0f, DockFollow.settleTarget(0.8f, -(DockFollow.FLING_VELOCITY + 0.2f)), 1e-4f)
    }

    /** 速度没过阈值时仍是"过半吸附"—— 速度判据不许把位置判据吞掉。 */
    @Test
    fun `below the fling threshold position still decides`() {
        val v = DockFollow.FLING_VELOCITY - 0.2f
        assertEquals(1f, DockFollow.settleTarget(0.6f, v), 1e-4f)
        assertEquals(0f, DockFollow.settleTarget(0.4f, v), 1e-4f)
    }

    /** 无初速的临界阻尼：单调趋向目标、不过冲（吸附是归位，不是弹簧玩具）。 */
    @Test
    fun `spring converges without overshoot`() {
        val dt = 1f / 60f
        var last = DockFollow.springValue(0.35f, 1f, 0f, 0f)
        var t = 0f
        while (t < 0.6f) {
            t += dt
            val x = DockFollow.springValue(0.35f, 1f, 0f, t)
            assertTrue("无初速的临界阻尼不该越过后回落", x >= last - 1e-3f)
            assertTrue("不该越过目标（无初速）", x <= 1f + 1e-3f)
            last = x
        }
        assertEquals(1f, last, 0.01f)
    }

    /** 带初速时更早接近目标：吸附的"顺势"就来自这里。 */
    @Test
    fun `initial velocity carries the spring forward`() {
        val slow = DockFollow.springValue(0f, 1f, 0f, 0.12f)
        val fast = DockFollow.springValue(0f, 1f, 2f, 0.12f)
        assertTrue("初速朝目标时同一时刻应更接近目标", fast > slow)
    }

    /** 停手越久、速度残值越小（吸附不许拿"停手那一刻"的全速去冲）。 */
    @Test
    fun `velocity decays with idle time`() {
        val v0 = 3f
        val at0 = DockFollow.decayVelocity(v0, 0L)
        val at110 = DockFollow.decayVelocity(v0, 110L)
        val at300 = DockFollow.decayVelocity(v0, 300L)
        assertEquals(v0, at0, 1e-4f)
        assertTrue(at110 < at0)
        assertTrue(at300 < at110)
    }

    /** 补间时长夹在可用区间：太短像"戛然而止"，太长会拖住下一次跟手。 */
    @Test
    fun `spring duration stays within bounds`() {
        val near = DockFollow.springDurationMs(0.9f, 1f, 0f)
        val far = DockFollow.springDurationMs(0f, 1f, 0f)
        assertTrue("近距吸附也要看得见动作", near >= 140L)
        assertTrue("远距吸附不许拖成慢动作", far <= 900L)
        assertTrue("距离越远、补间越久", far >= near)
    }

    /** 速度平滑：一次采样不许把速度直接跳到瞬时值。 */
    @Test
    fun `velocity smoothing eases toward the instant value`() {
        val s = DockFollow.smoothVelocity(0f, 10f)
        assertTrue(s > 0f)
        assertTrue(s < 10f)
        assertEquals(10f, DockFollow.smoothVelocity(10f, 10f), 1e-4f)
    }

    /**
     * 源码守卫：吸附补间**不许**换回 `androidx.compose.animation.core.animate`。
     *
     * 那个函数内部走 `withFrameNanos`，而 `withFrameNanos` 要求 `CoroutineContext`
     * 里带 `MonotonicFrameClock` —— 只有 Compose 自己发的 `AndroidUiDispatcher` 才带，
     * 控制器里自建的 `CoroutineScope(SupervisorJob() + Dispatchers.Main)` **不带**。
     * 于是补间一启动就抛
     * `IllegalStateException: A MonotonicFrameClock is not available in this CoroutineContext`，
     * 主线程未捕获 → 直接闪退。
     *
     * 用户报的正是"网页滚动停住页面直接闪退"：跟手期间不跑补间（不崩），
     * 一停手进度停在半路 → 触发吸附 → 崩。改用平台的 `ValueAnimator`
     *（Choreographer 驱动、不依赖 Compose 环境）才修好。
     */
    @Test
    fun `dock settle does not use compose animate`() {
        val candidates = listOf(
            "src/main/java/com/lerxu/android/browser/BrowserController.kt",
            "app/src/main/java/com/lerxu/android/browser/BrowserController.kt"
        )
        val file = candidates.map { File(it) }.firstOrNull { it.exists() }
            ?: error("找不到 BrowserController.kt（工作目录：${File(".").absolutePath}）")
        val src = file.readText()
        // 判据盯着 **import 行**，不是整篇文本：上面那段说明里就写着这个全限定名，
        // 用 contains 会被自己的注释判红（真踩过）
        val importedComposeAnimate = src.lines().any {
            it.trimStart().startsWith("import androidx.compose.animation.core.animate")
        }
        assertFalse(
            "吸附补间不能用 Compose 的 animate —— withFrameNanos 要 MonotonicFrameClock，控制器里没有",
            importedComposeAnimate
        )
        assertTrue(
            "吸附补间应该用平台的 ValueAnimator",
            src.contains("ValueAnimator.ofFloat(")
        )
    }
}
