/**
 * 「下次 announce 还有多久」的纯函数（面板与测试共用）
 * ====================================================
 *
 * 引擎 `task.getTrackers` 的 `nextAnnounceTime` 是 **epoch 毫秒**
 * （xfer-engine `manager.rs`：`"nextAnnounceTime": s.next_announce_ms`，
 * 而 `next_announce_ms = now_ms + interval * 1000`）。
 *
 * 这里以前把它当**秒**用（`Math.floor(Date.now()/1000)`），于是
 * `毫秒 - 秒` 多算 1000 倍，面板上显示成「2939 万分钟」这种天量数字。
 *
 * 同时容忍秒级时间戳（< 1e12 视为秒）：万一上游改成秒，也不会再出现
 * 「几千万分钟」这种离谱显示，最多是四舍五入差一秒。
 */

/** 1e12 ms ≈ 2001-09-09；小于它的一定是秒级时间戳。 */
const MS_THRESHOLD = 1e12

/**
 * @param {number|string} timestamp 引擎上报的 nextAnnounceTime（epoch ms）
 * @param {number} [nowMs] 当前时间（毫秒），测试可注入
 * @returns {number|null} 剩余秒数（<=0 表示马上）；无效输入返回 null
 */
export function nextAnnounceSeconds (timestamp, nowMs = Date.now()) {
  const n = Number(timestamp)
  if (!Number.isFinite(n) || n <= 0) return null
  const tsMs = n > MS_THRESHOLD ? n : n * 1000
  return Math.round((tsMs - nowMs) / 1000)
}

/**
 * 把剩余秒数格式化成 `1m 05s` / `23s`；<=0 返回空串（调用方显示「立即」）。
 * @param {number|null} seconds
 * @returns {string}
 */
export function formatRemaining (seconds) {
  if (seconds === null || seconds === undefined) return ''
  if (seconds <= 0) return ''
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes > 0) return `${minutes}m ${String(rest).padStart(2, '0')}s`
  return `${rest}s`
}
