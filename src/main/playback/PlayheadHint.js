/**
 * 播放头提示：把"正在播文件里的哪个位置"转达给下载引擎（`task.setPlayhead`）。
 *
 * ## 为什么要有它
 *
 * BT 的默认选片是 **rarest-first**（让整个种子尽快健康），而边下边播要的是
 * "播放头附近立刻有连续数据"——两者冲突时前者优先，表现就是"刚打开就转圈"。
 * 下载引擎为此开了一条通道：宿主把播放头（**种子内的字节偏移**）报过去，
 * 选片就把这一带提到最前（档位与窗口见引擎侧 `xfer-bt::playhead`）。
 *
 * 这条通道**只有 BT 任务有**：本地完整文件、HTTP 任务不需要（也没有在跑的
 * BT 引擎，引擎会回 `applied:false`，不是错误）。
 *
 * ## 为什么必须节流
 *
 * 媒体引擎每 0.5 秒就上报一次播放头，而选片窗口是几十 MB 量级 —— 每次都发一遍
 * RPC 没有意义。判据在 [`hintDue`]（纯函数、单测钉住）：第一次必发；距上次
 * 不足 `gapMs` 不发；位置移动不足 `deltaBytes` 不发（抖动不重发）。
 */

/** 两次提示之间的最小间隔（毫秒）。 */
export const HINT_GAP_MS = 2000

/** 播放头移动不足这么多字节就不重发（选片窗口是几十 MB，1 MiB 是抖动量级）。 */
export const HINT_DELTA_BYTES = 1024 * 1024

/** `send` 收到这个偏移表示"停止播放"（清除提示，选片退回 rarest-first）。 */
export const HINT_CLEAR = -1

/**
 * 该不该发这次提示（纯函数）。
 *
 * @param {Object} p
 * @param {number} p.now        现在（毫秒）
 * @param {number} p.lastAt     上次发出时刻（毫秒；0 = 还没发过）
 * @param {number} p.offset     本次位置（文件内字节偏移）
 * @param {number} p.lastOffset 上次发的位置（负数 = 还没发过）
 */
export function hintDue ({
  now,
  lastAt,
  offset,
  lastOffset,
  gapMs = HINT_GAP_MS,
  deltaBytes = HINT_DELTA_BYTES
} = {}) {
  if (!Number.isFinite(offset) || offset < 0) {
    return false
  }
  if (!(lastOffset >= 0)) {
    return true
  }
  if (now - lastAt < gapMs) {
    return false
  }
  return Math.abs(offset - lastOffset) >= deltaBytes
}

/**
 * 建一个"播放头 → 下载引擎"的转发器。
 *
 * @param {Object} p
 * @param {Function} p.send 发 RPC 的函数；收的是**种子内的字节偏移**（`-1` = 停止）
 * @param {number} [p.fileOffset] 正在播的文件在种子里的起始字节
 *                               （多文件种子要算上前面文件的长度；单文件为 0）
 * @param {Function} [p.now] 时钟（测试注入）
 * @param {Object} [p.logger]
 */
export function createPlayheadHint ({
  fileOffset = 0,
  send = null,
  now = Date.now,
  logger = console
} = {}) {
  const base = Math.max(0, Number(fileOffset) || 0)
  let lastAt = 0
  let lastOffset = -1
  let sent = 0

  /** 上报一次"文件内偏移"。返回是否真的发出去了（节流吞掉时 false）。 */
  function push (localOffset) {
    const offset = Math.max(0, Number(localOffset) || 0)
    const t = now()
    if (!hintDue({ now: t, lastAt, offset, lastOffset })) {
      return false
    }
    lastAt = t
    lastOffset = offset
    sent += 1
    try {
      send?.(base + offset)
    } catch (e) {
      logger.warn?.('[Playback] 播放头提示失败:', e && e.message ? e.message : e)
    }
    return true
  }

  /** 停止播放：清除提示。没发过就不必打扰引擎。 */
  function clear () {
    if (!(lastOffset >= 0)) {
      return
    }
    lastOffset = -1
    lastAt = 0
    try {
      send?.(HINT_CLEAR)
    } catch (_) {}
  }

  return {
    push,
    clear,
    get sentCount () {
      return sent
    },
    get lastLocalOffset () {
      return lastOffset
    }
  }
}
