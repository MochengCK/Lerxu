import { decodeModeOf } from '@shared/zuvrust'

/**
 * 用**媒体引擎**当播放内核。
 *
 * ## 为什么不能让 `<video>` 直接啃文件
 *
 * 把裸文件丢给 Chromium（`media.src = http://…/文件`）只在"文件完整、容器与编码
 * 都在浏览器支持面内"时成立。真实场景几乎都落在外面：
 *
 * | 场景 | 直接丢给 `<video>` 的结果 |
 * |---|---|
 * | HLS 的 `.ts` 分片 | 认不出容器 → "无法播放" |
 * | fMP4 分片（`.m4s`） | `moov` 在别处，单看分片是无索引字节 |
 * | 还在下载的文件 | 中间有空洞，播放器把空洞当文件末尾 |
 * | `moov` 在文件末尾的 MP4 | 边下边播时读不到索引 |
 *
 * 所以分工是：**引擎负责解析容器 / 边等边读 / 寻址 / 解码**，
 * 播放器页只负责上屏与发声。
 *
 * ## 数据怎么走
 *
 * ```
 * 主进程 MediaEngineService（单例 zuvrust serve --stdio）
 *      │ stream(mode=frames, audioPcm=true, decodeMode/threads)
 *      │ result.meta → X-Lerxu-Meta 响应头
 *      │ 二进制块（MEV1 包流）→ 响应体
 *      ▼
 * 播放器页 fetch() → WebGL 上屏 + Web Audio 发声
 * ```
 *
 * 引擎只在**每条流开始时**建立一次流请求；seek = 取消旧流、用新位置再开一条。
 * 不再为每次播放/seek 起一个 `zuvrust` 进程。
 *
 * ## 为什么引擎 API 返回原始块
 *
 * 播放器页的帧渲染器按 MEV1 包头解析；`EngineApi` 把二进制块原样转发，
 * 不在主进程拆包（拆包会让这段数据通路多一次无意义的拷贝与重排）。
 */
export default class EnginePlayer {
  /**
   * @param {Object} p
   * @param {Object} p.engine 主进程的媒体引擎服务（MediaEngineService）
   * @param {string} p.input 输入（本地文件路径）
   * @param {string} [p.enginePath] 仅用于日志/诊断
   * @param {number} [p.size] 文件**最终**大小（下载任务的总大小；0 = 未知）
   * @param {boolean} [p.grow] 是否按"还在下载"的方式读（默认 true）
   * @param {number} [p.fragmentMs] 分片时长（越小出画越快、开销略高）
   * @param {number} [p.seekSec] 起始位置（秒）
   * @param {boolean} [p.engineDecode] 引擎解码（默认 true）：视频出 NV12 帧、音频出
   *   PCM，播放器页上屏/发声 —— 关掉时退成"转封装 fMP4 + 浏览器解码"（诊断用）
   * @param {number} [p.threads] 解码线程数（0 = 引擎默认）
   * @param {string} [p.decodeMode] auto / hardware / software
   * @param {Function} [p.onPlayhead] 收到引擎播放头时的回调（宿主转达给下载引擎）
   * @param {Object} [p.logger]
   */
  constructor ({
    engine,
    enginePath = '',
    input,
    size = 0,
    grow = true,
    fragmentMs = 500,
    seekSec = 0,
    availPath = '',
    engineDecode = true,
    threads = 0,
    decodeMode = 'auto',
    onPlayhead = null,
    onPrioritize = null,
    logger = console
  } = {}) {
    if (!engine || typeof engine.openStream !== 'function') {
      throw new Error('EnginePlayer 需要主进程媒体引擎服务（MediaEngineService）')
    }
    this.engine = engine
    this.enginePath = enginePath
    this.input = input
    this.size = Number(size) || 0
    this.grow = !!grow
    this.fragmentMs = Number(fragmentMs) || 500
    this.seekSec = Number(seekSec) || 0
    this.availPath = `${availPath || ''}`
    this.engineDecode = !!engineDecode
    this.threads = Number(threads) || 0
    this.decodeMode = decodeModeOf({ decodeMode })
    this.onPlayhead = onPlayhead
    this.onPrioritize = onPrioritize
    this.logger = logger

    /** 最近一次解析出的元信息（mime / 时长 / 时间轴偏移） */
    this.meta = null
    /** 最近一次的播放头上报 */
    this.lastPlayhead = null
    /** 当前 API 流句柄 */
    this._handle = null
    /** 当前流的取消控制器 */
    this._controller = null
    /** 已经请求过停止（停止后的退出不算异常） */
    this._stopped = false
    /** 已服务的请求代数：用来忽略上一代流的迟到事件 */
    this._generation = 0
    /** 正在服务的响应（seek / 关窗时要主动断掉它） */
    this._res = null
  }

  /** 传给 `stream` 的 API 参数（顺序即调试时看到的形态）。 */
  streamParams (seekSec = this.seekSec) {
    const params = {
      input: this.input,
      mode: this.engineDecode ? 'frames' : 'fmp4',
      fragmentMs: this.fragmentMs,
      grow: this.grow
    }
    if (this.engineDecode) params.audioPcm = true
    if (this.size > 0) params.size = this.size
    if (seekSec > 0) params.seek = seekSec
    if (this.availPath) params.avail = this.availPath
    if (this.decodeMode && this.decodeMode !== 'auto') params.decodeMode = this.decodeMode
    if (this.threads > 0) params.threads = this.threads
    return params
  }

  /**
   * 把引擎的流接到一个响应上（一次调用 = 一条流）。
   *
   * `res` 需要具备 `setHeader` / `write` / `end` / `destroy`，并会发出 `drain` ——
   * 也就是 node 的 `http.ServerResponse`。做成"鸭子类型"是为了**能在单测里
   * 用一个假对象验证**（MSE 在测试环境里跑不起来，但这条数据通路必须被测到）。
   *
   * @returns {Promise<Object>} 元信息
   */
  async openStream (res) {
    this.stopStream()
    this._stopped = false
    const generation = ++this._generation
    const controller = new AbortController()
    this._controller = controller
    this._res = res
    res.on('close', () => {
      if (this._res === res) {
        this._res = null
        this.stopStream()
      }
    })

    let handle
    try {
      handle = await this.engine.openStream(this.input, {
        ...this.streamParams(),
        signal: controller.signal
      })
      this._handle = handle
      const meta = await handle.ready
      if (generation !== this._generation) {
        try { await handle.cancel() } catch (_) {}
        throw new Error('播放流已被取消')
      }
      this.meta = meta
      const line = JSON.stringify({ ok: true, type: 'stream-meta', data: meta })
      res.setHeader('X-Lerxu-Meta', Buffer.from(line, 'utf8').toString('base64'))
      res.setHeader(
        'Content-Type',
        /^video\/mp4/.test(`${meta.mime}`) ? 'video/mp4' : 'application/octet-stream'
      )
      res.setHeader('Cache-Control', 'no-store')
      this._pump(res, handle, generation).catch((e) => {
        if (generation !== this._generation) return
        this.logger.warn?.(`[Lerxu] 播放流异常：${e && e.message ? e.message : e}`)
        try { res.destroy?.() } catch (_) {}
      })
      return meta
    } catch (error) {
      if (this._res === res) this._res = null
      if (this._handle === handle) this._handle = null
      if (this._controller === controller) this._controller = null
      if (handle) {
        try { await handle.cancel() } catch (_) {}
      }
      throw error
    }
  }

  /** 消费 API 流：原始 MEV1/fMP4 块 + 播放头进度，直到结束/取消。 */
  async _pump (res, handle, generation) {
    let sawAnyByte = false
    let endInfo = null
    try {
      for (;;) {
        const item = await handle.next()
        if (item.done) break
        if (generation !== this._generation) return
        const event = item.value
        if (event.type === 'chunk') {
          sawAnyByte = true
          await writeWithBackpressure(res, event.data)
        } else if (event.type === 'progress') {
          if (event.name === 'playhead' && event.data) {
            this.lastPlayhead = event.data
            try { this.onPlayhead?.(event.data) } catch (_) {}
          }
        } else if (event.type === 'end') {
          endInfo = event
          break
        }
      }
      if (generation !== this._generation) return
      if (this._handle === handle) {
        this._handle = null
        this._controller = null
      }
      if (this._res === res) this._res = null
      if (!sawAnyByte && endInfo && !endInfo.ok) {
        this.logger.warn?.(`[Lerxu] 引擎在产出任何数据前结束：${endInfo.error?.message || '未知错误'}`)
      }
      try { res.end() } catch (_) {}
    } finally {
      if (this._handle === handle) {
        this._handle = null
        this._controller = null
      }
    }
  }

  /**
   * 跳到某个位置：**取消当前流**，下一次 `openStream` 从新位置开始。
   *
   * 为什么不做"运行时 seek 协议"：MSE 本来就要丢掉旧缓冲重来，
   * 而"重开一条流"是引擎最擅长的模式（顺序读 + 顺序写），
   * 两边都简单，也少一整类"流中途跳变"的边界情况。
   */
  seek (sec) {
    this.seekSec = Math.max(0, Number(sec) || 0)
    this.stopStream()
  }

  /** 停掉当前流（用户暂停到很远、关窗、换文件时都会调到）。 */
  stopStream () {
    const handle = this._handle
    const controller = this._controller
    const res = this._res
    this._handle = null
    this._controller = null
    this._res = null
    if (!handle && !controller && !res) {
      return
    }
    // 代数 +1：让这条流后续的所有事件都被忽略
    this._generation += 1
    try { controller?.abort?.() } catch (_) {}
    try { handle?.cancel?.() } catch (_) {}
    try { res?.destroy?.() } catch (_) {}
  }

  stop () {
    this._stopped = true
    this.stopStream()
  }

  /** 现在是否有一条活着的流。 */
  get running () {
    return !!this._handle
  }

  // ── 数据侧的能力（PlaybackSession 只认这一套方法：大小 / 进度 / 优先下载） ──

  /** 文件最终大小（下载任务的总大小；0 = 未知）。 */
  expectedSize () {
    return this.size
  }

  /** 已经读到源上的哪个位置（引擎每次上报播放头都会更新）。 */
  get readHighWater () {
    return Number(this.lastPlayhead && this.lastPlayhead.sourceOffset) || 0
  }

  /** 已有数据的字节数（引擎上报的"已经取到手的量"）。 */
  bufferedBytes () {
    return this.readHighWater
  }

  /** 可以按数据区间给下载引擎提优先级（宿主注入 `onPrioritize`）。 */
  prioritize (bytes) {
    try {
      this.onPrioritize?.(Number(bytes) || 0)
    } catch (_) {}
  }

  close () {
    this.stop()
  }
}

/**
 * 写响应体并遵守背压。
 *
 * API 流是**拉模型**：不 `next()` 就不会继续取数据。`res.write` 返回 false 时
 * 等 `drain`，引擎侧的子进程自然被管道反压，内存不会堆成几个 GB。
 */
async function writeWithBackpressure (res, buf) {
  let ok = true
  try {
    ok = res.write(buf)
  } catch (_) {
    return
  }
  if (ok === false) {
    await new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        try {
          res.removeListener('drain', finish)
          res.removeListener('close', finish)
        } catch (_) {}
        resolve()
      }
      res.once('drain', finish)
      res.once('close', finish)
    })
  }
}
