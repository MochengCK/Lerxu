import { spawn } from 'node:child_process'

/**
 * 用**媒体引擎**当播放内核。
 *
 * ## 为什么不能让 `<video>` 直接啃文件
 *
 * 把裸文件丢给 Chromium（`media.src = http://…/文件`）只在"文件完整、容器与编码
 * 都在浏览器支持面内"时成立。真实场景几乎都落在外面：
 *
 * | 场景 | 直接丢给 `<video>` |
 * |---|---|
 * | HLS 的 `.ts` 分片 | 认不出容器 → "无法播放" |
 * | fMP4 分片（`.m4s`） | `moov` 在别处，单看分片是无索引字节 |
 * | 还在下载的文件 | 中间有空洞，播放器把空洞当文件末尾 |
 * | `moov` 在文件末尾的 MP4 | 边下边播时读不到索引 |
 *
 * 所以分工改成：**引擎负责解析容器 / 边等边读 / 寻址，以及解码**
 * （视频出 NV12 帧、音频出 PCM），播放器页只负责上屏与发声。
 *
 * ## 数据怎么走
 *
 * ```
 * zuvrust stream <文件> --seek=秒 [--video=frames --audio=pcm]
 *      │ stdout：一行元信息 JSON + 之后全是数据
 *      │         · 默认（引擎解码）：带类型标签的包流（28 字节头 + NV12/PCM）
 *      │         · 诊断模式：分片 fMP4（浏览器解码，用 MSE 喂）
 *      │ stderr：播放头 NDJSON
 *      ▼
 * openStream(res)：把元信息塞进响应头、字节直通响应体
 *      ▼
 * 播放器页 fetch() → 帧流：canvas/WebGL 上屏 + Web Audio 发声
 *                  → fMP4：MSE SourceBuffer → <video>（诊断对比用）
 * ```
 *
 * 元信息走**响应头**（而不是另开一个接口）：播放器一次请求就同时拿到
 * "用什么 codecs 建 SourceBuffer / 时长多少 / 时间轴偏移多少"和字节，
 * 不存在"元信息还没到就先 append 了"的竞态。
 *
 * ## 为什么要用"一次请求 = 一条流"的模型
 *
 * MSE 的 seek 是"丢掉旧缓冲、从新位置重新来"。所以 seek 就做一件事：
 * **杀掉当前引擎进程、用新的 `--seek` 重启**，播放器重新 fetch 同一个地址。
 * 这样引擎侧永远只管"从某一点开始的顺序流"，不必实现随机访问协议。
 */
export default class EnginePlayer {
  /**
   * @param {Object} p
   * @param {string} p.enginePath 引擎可执行文件
   * @param {string} p.input      输入（本地文件路径）
   * @param {number} [p.size]     文件**最终**大小（下载任务的总大小；0 = 未知）
   * @param {boolean} [p.grow]    是否按"还在下载"的方式读（默认 true）
   * @param {number} [p.fragmentMs] 分片时长（越小出画越快、开销略高）
   * @param {number} [p.seekSec]  起始位置（秒）
   * @param {boolean} [p.engineDecode] 引擎解码（默认 true）：视频出 NV12 帧、音频出
   *   PCM，播放器页上屏/发声 —— 关掉时退成"转封装 fMP4 + 浏览器解码"（诊断用）
   * @param {Function} [p.onPlayhead] 收到引擎播放头时的回调（宿主转达给下载引擎）
   * @param {Object} [p.logger]
   */
  constructor ({
    enginePath,
    input,
    size = 0,
    grow = true,
    fragmentMs = 500,
    seekSec = 0,
    availPath = '',
    engineDecode = true,
    /** 「视频 → 解码线程数」：0 = 引擎默认（机器并行度）。换算成 `ME_THREADS`。 */
    threads = 0,
    /** 「视频 → 强制软解」：true 时给引擎 `ME_NO_HW=1`（硬解有兼容问题时逃生）。 */
    preferSoftwareDecode = false,
    onPlayhead = null,
    onPrioritize = null,
    logger = console
  } = {}) {
    this.enginePath = enginePath
    this.input = input
    this.size = Number(size) || 0
    this.grow = !!grow
    this.fragmentMs = Number(fragmentMs) || 500
    this.seekSec = Number(seekSec) || 0
    /** 可用性图路径（宿主写的"哪些字节已下到"；空 = 不知道，按老样子读） */
    this.availPath = `${availPath || ''}`
    /** `true` = 让引擎**解码**（视频出 NV12 帧、音频出 PCM；播放器不经浏览器解码） */
    this.engineDecode = !!engineDecode
    this.threads = Number(threads) || 0
    this.preferSoftwareDecode = !!preferSoftwareDecode
    this.onPlayhead = onPlayhead
    this.onPrioritize = onPrioritize
    this.logger = logger

    /** 最近一次解析出的元信息（mime / 时长 / 时间轴偏移） */
    this.meta = null
    /** 最近一次的播放头上报 */
    this.lastPlayhead = null
    /** 当前子进程 */
    this.child = null
    /** 已经请求过停止（停止后的退出不算异常） */
    this._stopped = false
    /** 已服务的请求代数：用来忽略上一代进程的迟到事件 */
    this._generation = 0
    /** 正在服务的响应（seek / 关窗时要主动断掉它） */
    this._res = null
  }

  /** 传给引擎的命令行（顺序即调试时看到的形态，便于人工复现）。 */
  args (seekSec = this.seekSec) {
    const args = ['stream', this.input, '--json', `--fragment-ms=${this.fragmentMs}`]
    if (this.size > 0) {
      args.push(`--size=${this.size}`)
    }
    if (seekSec > 0) {
      args.push(`--seek=${seekSec}`)
    }
    if (!this.grow) {
      args.push('--no-grow')
    }
    // 可用性图：有它，空洞就是"等"而不是"损坏"（BT 边下边播的必需输入）
    if (this.availPath) {
      args.push(`--avail=${this.availPath}`)
    }
    // 引擎解码：视频出 NV12 帧、音频出 PCM（播放器画到 canvas、排进 Web Audio）。
    // 纯音频文件也带这个开关：它只决定"引擎出解码后的包流"，没有视频轨不是错误。
    if (this.engineDecode) {
      args.push('--video=frames', '--audio=pcm')
    }
    return args
  }

  /**
   * 把引擎的输出接到一个响应上（一次调用 = 一条流）。
   *
   * `res` 需要具备 `setHeader` / `write` / `end` / `destroy`，并会发出 `drain` ——
   * 也就是 node 的 `http.ServerResponse`。做成"鸭子类型"是为了**能在单测里
   * 用一个假对象验证**（MSE 在测试环境里跑不起来，但这条数据通路必须被测到）。
   *
   * @returns {Promise<Object>} 元信息
   */
  openStream (res) {
    this.stopChild()
    this._stopped = false
    const generation = ++this._generation

    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn, v) => {
        if (settled) return
        settled = true
        fn(v)
      }

      let child
      try {
        // 「视频」设置项 → 引擎环境变量（只写非默认项，不设 = 引擎按自己的默认走）
        const env = { ...process.env }
        if (this.threads > 0) env.ME_THREADS = `${Math.floor(this.threads)}`
        if (this.preferSoftwareDecode) env.ME_NO_HW = '1'
        child = spawn(this.enginePath, this.args(), {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          env
        })
      } catch (e) {
        reject(e)
        return
      }
      this.child = child
      this._res = res
      // 客户端断开（播放器 abort / 换了 seek / 关窗）：**立刻杀掉引擎**。
      // 不做这件事就会留下一个仍在读文件、往废弃连接写数据的僵尸进程。
      res.on('close', () => {
        if (this._res === res) {
          this._res = null
          this.stopChild()
        }
      })

      let head = Buffer.alloc(0)
      let metaSent = false
      let sawAnyByte = false

      child.on('error', (e) => {
        settle(reject, e)
        try { res.destroy() } catch (_) {}
      })

      child.stdout.on('data', (d) => {
        if (generation !== this._generation) {
          return
        }
        if (!metaSent) {
          head = Buffer.concat([head, d])
          const nl = head.indexOf(0x0a)
          if (nl === -1) {
            // 元信息行有长度上限：引擎坏掉时不能把内存吃光
            if (head.length > 64 * 1024) {
              this.stopChild()
              settle(reject, new Error('引擎没有给出元信息行（前 64KB 里没有换行）'))
            }
            return
          }
          const line = head.subarray(0, nl).toString('utf8')
          const rest = head.subarray(nl + 1)
          head = Buffer.alloc(0)
          let parsed = null
          try {
            parsed = JSON.parse(line)
          } catch (_) {}
          if (!parsed || !parsed.data || !parsed.data.mime) {
            this.stopChild()
            settle(reject, new Error(`引擎的元信息行无法解析: ${line.slice(0, 200)}`))
            return
          }
          this.meta = parsed.data
          metaSent = true
          // 元信息塞进响应头：播放器在 append 之前就能读到 codecs 与时间轴偏移
          try {
            res.setHeader('X-Lerxu-Meta', Buffer.from(line, 'utf8').toString('base64'))
            // 内容类型按**实际产物**给：引擎解码的包流不是 mp4。播放器不看这个头
            // （它认 X-Lerxu-Meta），但用 curl / DevTools 排查的人应该看到真话。
            res.setHeader(
              'Content-Type',
              /^video\/mp4/.test(`${parsed.data.mime}`) ? 'video/mp4' : 'application/octet-stream'
            )
            res.setHeader('Cache-Control', 'no-store')
          } catch (e) {
            settle(reject, e)
            return
          }
          settle(resolve, parsed.data)
          if (rest.length) {
            sawAnyByte = true
            writeWithBackpressure(res, rest, child)
          }
          return
        }
        sawAnyByte = true
        writeWithBackpressure(res, d, child)
      })

      let errBuf = ''
      child.stderr.on('data', (d) => {
        errBuf += d.toString('utf8')
        const lines = errBuf.split('\n')
        errBuf = lines.pop() || ''
        for (const l of lines) {
          const s = l.trim()
          if (!s) continue
          let parsed = null
          try {
            parsed = JSON.parse(s)
          } catch (_) {
            continue
          }
          if (parsed.ok === false && parsed.error) {
            // 引擎的**失败**要走明确路径：不能只是"流没了"，否则播放器只会显示卡住
            settle(reject, Object.assign(new Error(parsed.error.message || '引擎失败'), {
              kind: parsed.error.kind,
              retryable: parsed.error.retryable
            }))
            continue
          }
          if (parsed.type === 'playhead' && parsed.data) {
            this.lastPlayhead = parsed.data
            try { this.onPlayhead?.(parsed.data) } catch (_) {}
          }
        }
      })

      child.on('close', (code) => {
        this.child = null
        if (generation !== this._generation) {
          return
        }
        if (!sawAnyByte) {
          // 一个字节都没出来就退了：把元信息解析结果当作失败原因（如果是失败的话）
          settle(reject, new Error(`引擎在产出任何数据前退出（退出码 ${code}）`))
        }
        // 正常情况下"流结束"就是响应结束；被 seek/stop 掐断时下面的 destroy 先到
        try { res.end() } catch (_) {}
      })
    })
  }

  /**
   * 跳到某个位置：**杀掉当前进程**，下一次 `openStream` 从新位置开始。
   *
   * 为什么不做"运行时 seek 协议"：MSE 本来就要丢掉旧缓冲重来，
   * 而"重启一条流"是引擎最擅长的模式（顺序读 + 顺序写），
   * 两边都简单，也少一整类"流中途跳变"的边界情况。
   */
  seek (sec) {
    this.seekSec = Math.max(0, Number(sec) || 0)
    this.stopChild()
  }

  /** 停掉当前进程（用户暂停到很远、关窗、换文件时都会调到）。 */
  stopChild () {
    const child = this.child
    this.child = null
    const res = this._res
    this._res = null
    if (!child) {
      return
    }
    // 代数 +1：让这个进程后续的所有事件都被忽略
    this._generation += 1
    try { child.kill('SIGKILL') } catch (_) {}
    // 把在途响应也收掉：否则播放器那边会挂着一个永远不结束的响应
    try { res?.destroy?.() } catch (_) {}
  }

  stop () {
    this._stopped = true
    this.stopChild()
  }

  /** 现在是否有一条活着的流。 */
  get running () {
    return !!this.child
  }

  // ── 数据侧的能力（PlaybackSession 只认这一套方法：大小 / 进度 / 优先下载） ──
  //
  // 会话只关心"总大小 / 已有多少 / 读到哪里 / 请求优先下载"这几件事，
  // 至于数据是"按 Range 读文件"还是"引擎在转封装"它不需要知道。

  /** 文件最终大小（下载任务的总大小；0 = 未知）。 */
  expectedSize () {
    return this.size
  }

  /** 已经读到源上的哪个位置（引擎每次上报播放头都会更新）。 */
  get readHighWater () {
    return Number(this.lastPlayhead && this.lastPlayhead.sourceOffset) || 0
  }

  /**
   * 已有数据的字节数。
   *
   * 用引擎上报的"读到了源上哪个偏移"当口径：它正是"引擎已经取到手的量"，
   * 对"边下边播时有多少数据可用"这个问题是最诚实的答案。
   */
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
 * 为什么必须处理：引擎产出 fMP4 比 MSE 消费得快时，不施加背压就会把整条流
 * 堆在内存里（一部两小时的片子就是几个 GB）。做法是**暂停源**（子进程的
 * stdout），让引擎那边的管道写阻塞住 —— 它自然会慢下来。
 */
function writeWithBackpressure (res, buf, child) {
  let ok = true
  try {
    ok = res.write(buf)
  } catch (_) {
    // 客户端断开（换 seek / 关窗）：让 close 事件去收尾，这里不抛
    return
  }
  if (ok === false && child && child.stdout && typeof child.stdout.pause === 'function') {
    child.stdout.pause()
    res.once('drain', () => {
      try {
        child.stdout.resume()
      } catch (_) {}
    })
  }
}
