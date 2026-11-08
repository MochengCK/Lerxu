#!/usr/bin/env node
/**
 * 「下次连接」倒计时换算测试（纯 Node，零依赖）
 * ============================================
 *
 * 回归点：引擎 `task.getTrackers` 的 `nextAnnounceTime` 是 **epoch 毫秒**，
 * 面板曾按**秒**去减（`Math.floor(Date.now()/1000)`），于是 `毫秒 - 秒`
 * 多算 1000 倍 —— 任务详情 → 追踪器里的「下次连接」显示成「2939 万分钟」
 * 这种天量数字，而且永远走不到 0。
 *
 * 把 `nextAnnounceSeconds` 里的 `MS_THRESHOLD` 判断去掉（或把 `n * 1000`
 * 删掉）让秒级/毫秒级任一分支退化，下面第 1、2 条都会变红。
 *
 * 用法：node test/announcetime/run.mjs
 * 退出码：0 全过 / 1 有失败。
 */

import { nextAnnounceSeconds, formatRemaining } from '../../src/renderer/utils/announceTime.js'

let passed = 0
let failed = 0

const check = (name, fn) => {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (e) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${e.message}`)
  }
}

const assertEqual = (actual, expected, hint = '') => {
  if (actual !== expected) {
    throw new Error(`期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}${hint ? `（${hint}）` : ''}`)
  }
}

console.log('下次连接倒计时换算')

// 基准时刻：2026-11-09T00:00:00Z
const NOW = 1762646400000

check('毫秒时间戳：5 分钟后的 announce → 300 秒', () => {
  assertEqual(nextAnnounceSeconds(NOW + 300 * 1000, NOW), 300)
})

check('毫秒时间戳：10 秒后 → 10 秒（不能出现天量分钟）', () => {
  const secs = nextAnnounceSeconds(NOW + 10 * 1000, NOW)
  assertEqual(secs, 10)
  assertEqual(formatRemaining(secs), '10s')
})

check('毫秒时间戳：已过期 → <=0（调用方显示「立即」）', () => {
  const secs = nextAnnounceSeconds(NOW - 5 * 1000, NOW)
  if (!(secs <= 0)) throw new Error(`过期应为 <=0，实际 ${secs}`)
  assertEqual(formatRemaining(secs), '')
})

check('秒级时间戳也容忍（上游若改成秒，不得再放大 1000 倍）', () => {
  assertEqual(nextAnnounceSeconds(Math.floor(NOW / 1000) + 60, NOW), 60)
})

check('无效输入 → null', () => {
  assertEqual(nextAnnounceSeconds(0, NOW), null)
  assertEqual(nextAnnounceSeconds(null, NOW), null)
  assertEqual(nextAnnounceSeconds(undefined, NOW), null)
  assertEqual(nextAnnounceSeconds('', NOW), null)
  assertEqual(nextAnnounceSeconds('abc', NOW), null)
})

check('格式化：>=1 分钟带补零秒，<1 分钟只有秒', () => {
  assertEqual(formatRemaining(65), '1m 05s')
  assertEqual(formatRemaining(60), '1m 00s')
  assertEqual(formatRemaining(59), '59s')
  assertEqual(formatRemaining(0), '')
  assertEqual(formatRemaining(null), '')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
