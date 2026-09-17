package com.lerxu.android

import com.lerxu.android.data.EngineRepository.Companion.nextStatPollInterval
import com.lerxu.android.data.EngineRepository.Companion.statPollDelayMs
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 全局速度轮询节奏测试。
 *
 * 背景：顶栏「上下行速度」来自 engine.globalStat，而引擎不推送速度，
 * 只能靠轮询刷新；节奏错了就会表现为「速度不准」（停在旧采样值 / 刷得过勤耗电）。
 * 节奏公式与桌面端 EngineClient 的 polling 一致，这里把它钉住。
 */
class StatPollingTest {

    private val base = 1000L
    private val perTask = 100L
    private val min = 500L
    private val max = 30_000L

    // ─── 有活跃任务：随任务数加压，但不得低于下限 ───

    @Test
    fun `one active task shaves one step off the base interval`() {
        assertEquals(base - perTask, nextStatPollInterval(base, 1))
    }

    @Test
    fun `more active tasks poll faster`() {
        assertEquals(base - perTask * 2, nextStatPollInterval(base, 2))
        assertEquals(base - perTask * 4, nextStatPollInterval(base, 4))
    }

    @Test
    fun `active interval never drops below floor`() {
        assertEquals(min, nextStatPollInterval(base, 5))
        assertEquals(min, nextStatPollInterval(base, 50))
    }

    @Test
    fun `active interval ignores the previous idle backlog`() {
        // 从退避后的长间隔切回活跃：必须立刻回到快速档，而不是在旧值上递减
        assertEquals(base - perTask, nextStatPollInterval(max, 1))
    }

    // ─── 空闲：逐级退避到上限 ───

    @Test
    fun `idle backs off by one step per tick`() {
        assertEquals(base + perTask, nextStatPollInterval(base, 0))
        assertEquals(base + perTask * 2, nextStatPollInterval(base + perTask, 0))
    }

    @Test
    fun `idle backoff saturates at max`() {
        assertEquals(max, nextStatPollInterval(max, 0))
        assertEquals(max, nextStatPollInterval(max - 50, 0))
    }

    // ─── 界面可见性：不可见时不低于 3s ───

    @Test
    fun `visible uses the poll interval as-is`() {
        assertEquals(base, statPollDelayMs(base, visible = true))
        assertEquals(max, statPollDelayMs(max, visible = true))
    }

    @Test
    fun `hidden never polls faster than 3s`() {
        assertEquals(3_000L, statPollDelayMs(min, visible = false))
        assertEquals(3_000L, statPollDelayMs(base, visible = false))
        assertEquals(max, statPollDelayMs(max, visible = false))
    }
}
