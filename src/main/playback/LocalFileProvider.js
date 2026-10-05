import fs from 'node:fs'

/**
 * 本地文件的数据供给 —— **包括"正在下载、还在长大"的文件**。
 *
 * ## 它在整个体系里的位置
 *
 * ```
 * 播放器 (<video>) ──HTTP──▶ MediaStreamServer ──▶ Provider ──▶ 数据来源
 *        ▲                       （薄门面）         ▲
 *        └── 只认 playback:* 契约 ───────────────────┘
 *                                    本地文件 / 正在下载的文件 / 将来的 BT 直读 piece
 * ```
 *
 * 上层（HTTP 门面、会话、播放器）只认下面这套方法，**不知道数据是怎么来的**：
 *
 * - `read(offset, length)`：读一段字节；**数据还没到就等它到达**（这就是边下边播）
 * - `size()` / `expectedSize()`：当前可读大小 / 最终大小
 * - `bufferedRanges()` / `bufferedBytes()`：已有数据的字节区间（播放器的缓冲条靠它）
 * - `prioritize(positionBytes)`：请求"优先把这一带弄来"（接下载引擎的钩子）
 * - `close()`
 *
 * 将来要接"BT 直接按 piece 读"（不落盘、不受文件系统稀疏空洞影响），
 * 只需再写一个满足同一套方法的 Provider —— 其余代码一行都不用改。
 */
export default class LocalFileProvider {
  /**
   * @param {Object} p
   * @param {string} p.filePath      文件路径
   * @param {number} [p.expectedSize] 最终大小（下载任务的总大小；0 = 未知）
   * @param {Function} [p.bitfieldProvider]
   *        返回"已有数据的字节区间" `[[start, endExclusive], ...]` 的回调。
   *        BT 任务由主进程从下载引擎的 piece 位图算出来 —— 文件系统上看不到
   *        稀疏空洞，只有位图才是真相。不给就退化为"已下载即连续"。
   * @param {Function} [p.onPrioritize] 收到 `prioritize()` 时的回调（接下载引擎）。
   * @param {Object} [p.logger]
   */
  constructor ({
    filePath,
    expectedSize = 0,
    bitfieldProvider = null,
    onPrioritize = null,
    logger = console
  } = {}) {
    this.filePath = filePath
    this.expected = Number(expectedSize) || 0
    this.bitfieldProvider = bitfieldProvider
    this.onPrioritize = onPrioritize
    this.logger = logger

    /** 连续两次 stat 大小不变且超过这个时间 → 判定"文件不再增长" */
    this.idleMs = 1500
    /** 单次等待的上限：下载停了不能把播放器永久挂住 */
    this.waitTimeoutMs = 30_000
    /** 已经读到过的最大位置（消耗速度实测用） */
    this.readHighWater = 0
  }

  size () {
    try {
      return fs.statSync(this.filePath).size
    } catch (_) {
      return 0
    }
  }

  expectedSize () {
    // 下载任务知道最终大小时用它：Content-Range 的总长要正确，
    // 播放器才知道总时长、才敢让用户拖到最后
    return Math.max(this.expected, this.size())
  }

  /**
   * 已有数据的区间。
   *
   * 优先用下载引擎的 piece 位图：BT 会随机下 piece，文件中间可能有大片空洞，
   * 只按"文件多大"判断会让播放器以为前面都好了。拿不到位图时退回"顺序下载"的
   * 近似假设 —— 那时它是**保守**的（宁可少报缓冲）。
   */
  bufferedRanges () {
    if (typeof this.bitfieldProvider === 'function') {
      try {
        const ranges = this.bitfieldProvider()
        if (Array.isArray(ranges) && ranges.length) {
          return ranges
        }
      } catch (_) {}
    }
    const size = this.size()
    return size > 0 ? [[0, size]] : []
  }

  /** 已有数据的字节数（缓冲条 / 健康度用）。 */
  bufferedBytes () {
    return this.bufferedRanges().reduce((sum, [s, e]) => sum + Math.max(0, e - s), 0)
  }

  /**
   * 请求"优先弄到这一带的数据"。
   *
   * 播放位置往前走时，它附近的片最值钱 —— 交给下载引擎去做调度，
   * 这里只负责把意图传出去（对 HTTP 顺序下载它是个空操作）。
   */
  prioritize (positionBytes) {
    if (typeof this.onPrioritize !== 'function') {
      return
    }
    try {
      this.onPrioritize(Number(positionBytes) || 0)
    } catch (e) {
      this.logger.warn?.('[Playback] prioritize 失败:', e && e.message ? e.message : e)
    }
  }

  /**
   * 读一段字节。**数据没到就等**（这正是"边下边播"）。
   *
   * 等不到（下载已停 / 超时）返回**短的** Buffer：调用方据此知道"这里真的没有"，
   * 并把连接收尾 —— 让客户端看到明确的短读，比让它永远转圈好。
   */
  async read (offset, length) {
    const want = Math.max(0, Number(length) || 0)
    if (want === 0) {
      return Buffer.alloc(0)
    }
    const start = Math.max(0, Number(offset) || 0)
    const ready = await this._waitUntilReadable(start)
    if (!ready.readable) {
      return Buffer.alloc(0)
    }

    let fd = null
    try {
      fd = fs.openSync(this.filePath, 'r')
      const size = fs.fstatSync(fd).size
      const take = Math.min(want, Math.max(0, size - start))
      if (take <= 0) {
        return Buffer.alloc(0)
      }
      const buf = Buffer.allocUnsafe(take)
      const got = fs.readSync(fd, buf, 0, take, start)
      this.readHighWater = Math.max(this.readHighWater, start + got)
      return got === take ? buf : buf.subarray(0, got)
    } catch (e) {
      this.logger.warn?.('[Playback] 读文件失败:', e && e.message ? e.message : e)
      return Buffer.alloc(0)
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd) } catch (_) {}
      }
    }
  }

  close () {
    // 本地文件没有需要释放的句柄（每次读都是即开即关）
  }

  // ── 内部 ────────────────────────────────────────────────────────

  /**
   * 等到"从 `start` 起至少有一个字节可读"。
   *
   * 判定"文件不再增长"：连续 stat 大小不变且超过 `idleMs` ——
   * 这样下载中的文件会老实等到数据，而下载已停（暂停/失败/已完成）的文件
   * 不会把播放器永久挂住。
   */
  async _waitUntilReadable (start) {
    const deadline = Date.now() + this.waitTimeoutMs
    let size = this.size()
    if (size > start) {
      return { readable: true, size }
    }
    let lastSize = size
    let lastChangeAt = Date.now()
    while (Date.now() <= deadline) {
      await sleep(100)
      size = this.size()
      if (size > start) {
        return { readable: true, size }
      }
      if (size !== lastSize) {
        lastSize = size
        lastChangeAt = Date.now()
      } else if (Date.now() - lastChangeAt > this.idleMs) {
        return { readable: false, size }
      }
    }
    return { readable: false, size }
  }
}

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
