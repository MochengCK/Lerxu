import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { URL } from 'node:url'

/**
 * 本地媒体流服务 —— **薄薄一层 HTTP 门面**。两条路由，用途不同：
 *
 * | 路由 | 数据 | 谁在用 |
 * |---|---|---|
 * | `/engine/<token>` | 媒体引擎的产物（引擎解码的帧/PCM 包流，或分片 fMP4） | **播放器**（唯一路径） |
 * | `/stream/<token>` | 按 `Range` 读的裸文件字节 | 目前没有调用方（保留的能力，见下） |
 *
 * ## 为什么播放器不直接用 `file://`
 *
 * 1. 引擎要在"文件还在长"的时候工作（边下边播）：读到还没落盘的位置应当**等数据
 *    到达**，而不是判文件损坏 —— 那是引擎（`--avail` / NeedMore）的事，HTTP 只是
 *    把它接到播放器页面前最后一段管道；
 * 2. 数据面独立成 HTTP 之后，播放器只需一个 URL —— 它不必知道数据从哪来，
 *    将来换成自定义协议或别的引擎形态也不用改播放器。
 *
 * ## 安全
 *
 * 只绑 `127.0.0.1`、端口由内核分配；**每个会话一个一次性随机 token**，
 * 别的进程即使扫到端口也读不到用户磁盘上的任意文件。
 */
export default class MediaStreamServer {
  constructor ({ logger = console } = {}) {
    this.logger = logger
    this.server = null
    this.port = 0
    /** token → { session } */
    this.tokens = new Map()
  }

  get running () {
    return !!this.server
  }

  get origin () {
    return this.server ? `http://127.0.0.1:${this.port}` : ''
  }

  async start () {
    if (this.server) {
      return this.origin
    }
    this.server = http.createServer((req, res) => {
      this._handle(req, res).catch((e) => {
        this.logger.warn?.('[Playback] 处理请求失败:', e && e.message ? e.message : e)
        if (!res.headersSent) {
          res.writeHead(500)
        }
        try { res.end() } catch (_) {}
      })
    })
    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => resolve())
    })
    this.port = this.server.address().port
    this.logger.info?.(`[Playback] 本地媒体流服务已启动: ${this.origin}`)
    return this.origin
  }

  /**
   * 把一个播放会话挂到 HTTP 上，返回它给 `<video>` 用的地址。
   *
   * @param {Object} session 播放会话（要有 `provider`）
   * @returns {Promise<string>} 数据地址
   */
  async register (session) {
    await this.start()
    const token = crypto.randomBytes(16).toString('hex')
    this.tokens.set(token, { session })
    return `${this.origin}/stream/${token}`
  }

  /**
   * 把**媒体引擎的流**挂到 HTTP 上（推荐路径）。
   *
   * 与 `register` 的区别：那边是"按 Range 读裸文件"，这边是"把引擎产出的
   * 分片 fMP4 顺序吐出去" —— 容器解析、边等边读、寻址、转封装全在引擎里，
   * 播放器只负责解码。响应头带 `X-Lerxu-Meta`（codecs / 时长 / 时间轴偏移）。
   *
   * @param {import('../playback/EnginePlayer').default} player
   * @returns {Promise<string>} 数据地址
   */
  async registerEngine (player) {
    await this.start()
    const token = crypto.randomBytes(16).toString('hex')
    this.tokens.set(token, { player })
    return `${this.origin}/engine/${token}`
  }

  /** token → 会话（Application 用它把 token 与窗口对上）。 */
  tokenOf (streamUrl) {
    const m = `${streamUrl || ''}`.match(/\/(?:stream|engine)\/([0-9a-f]{32})$/)
    return m ? m[1] : ''
  }

  release (token) {
    if (!token) {
      return
    }
    const entry = this.tokens.get(token)
    this.tokens.delete(token)
    try {
      // 引擎路径要**杀掉子进程**，否则关闭窗口后引擎会一直读文件（瘦客户端也会残留）
      entry?.player?.stop?.()
    } catch (_) {}
    try {
      entry?.session?.close?.()
    } catch (_) {}
  }

  async stop () {
    const srv = this.server
    this.server = null
    for (const token of Array.from(this.tokens.keys())) {
      this.release(token)
    }
    if (!srv) {
      return
    }
    await new Promise((resolve) => {
      srv.close(() => resolve())
      // `close()` 要等**所有连接**断开才回调，而播放器的连接是 keep-alive 的
      // —— 不主动掐断的话这里会一直挂着，应用退出时表现为"退不掉"。
      if (typeof srv.closeAllConnections === 'function') {
        srv.closeAllConnections()
      }
    })
  }

  // ── 请求处理 ──────────────────────────────────────────────────────

  async _handle (req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    let url
    try {
      url = new URL(req.url, 'http://127.0.0.1')
    } catch (_) {
      res.writeHead(400)
      res.end()
      return
    }
    // ── 引擎流（推荐路径）：容器解析 / 边等边读 / 转封装都在引擎里 ──
    const em = url.pathname.match(/^\/engine\/([0-9a-f]{32})$/)
    if (em) {
      // **跨源是常态，不是例外**：播放器页是 `file://` 加载的页面，而流在
      // `http://127.0.0.1:<端口>`，所以这里必须显式放行 —— 否则 `fetch` 连
      // 响应都读不到（自定义头 `X-Lerxu-Meta` 更读不到），表现就是"一直黑屏"。
      // 只绑 127.0.0.1 + 一次性随机 token，所以 `*` 的风险面仅限本机。
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Expose-Headers', 'X-Lerxu-Meta')
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      const entry = this.tokens.get(em[1])
      if (!entry || !entry.player) {
        res.writeHead(404)
        res.end()
        return
      }
      try {
        await entry.player.openStream(res)
      } catch (e) {
        // 元信息都拿不到（引擎缺失 / 输入不可读 / 编码装不进 fMP4）：
        // 如实把原因写回去，**不能**回一个空流让播放器干等
        this.logger.warn?.(`[Playback] 引擎流失败: ${e && e.message ? e.message : e}`)
        if (!res.headersSent) {
          try {
            res.writeHead(500, {
              'Content-Type': 'text/plain; charset=utf-8',
              // 错误也要能跨源读到：播放器要把它显示给用户（否则只有"黑屏"）
              'Access-Control-Allow-Origin': '*'
            })
          } catch (_) {}
        }
        try {
          res.end(`${e && e.message ? e.message : 'engine failed'}`)
        } catch (_) {}
      }
      return
    }

    const m = url.pathname.match(/^\/stream\/([0-9a-f]{32})$/)
    const entry = m ? this.tokens.get(m[1]) : null
    if (!entry || !entry.session || !entry.session.provider) {
      // token 过期/已释放：播放器会重新拿会话，这里如实报"找不到"
      res.writeHead(404)
      res.end()
      return
    }    const { session } = entry
    const provider = session.provider

    const total = Math.max(provider.expectedSize ? provider.expectedSize() : 0, 0)
    if (total <= 0) {
      // 一点可用的长度都没有（还没下到 moov）：让客户端稍后重试
      res.writeHead(503, { 'Retry-After': '1' })
      res.end()
      return
    }

    const range = parseRange(req.headers.range, total)
    const start = range ? range.start : 0
    const end = range ? Math.min(range.end, total - 1) : total - 1

    res.writeHead(range ? 206 : 200, {
      'Content-Type': session.mime || mimeOf(session.name),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${total}`
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    await this._pump(provider, start, end, res)
  }

  /**
   * 把 `[start, end]` 这段送到 `res`，**数据还没到就问 Provider 要**（它会等）。
   *
   * 为什么不能一次性读完再发：这段区间里"已经下到的部分"是逐渐变长的。
   * 只发当前可读的那一点就收尾，客户端会因为 `Content-Length` 对不上而
   * **永远等下去**（播放器一直转圈、连错误都不报）—— 比失败更糟。
   *
   * 等不到数据（下载已停）就结束响应：客户端看到短读会明确报错，
   * 播放器据此提示用户。
   */
  async _pump (provider, start, end, res) {
    let pos = start
    let closed = false
    const onClose = () => { closed = true }
    res.on('close', onClose)
    try {
      while (pos <= end && !closed) {
        // 一次最多 1 MiB：首次出画要快，也不会一次分配巨大缓冲
        const len = Math.min(end - pos + 1, 1 << 20)
        const buf = await provider.read(pos, len)
        if (!buf || !buf.length) {
          break
        }
        pos += buf.length
        const ok = res.write(buf)
        if (!ok && !closed) {
          // 背压：客户端还没读完，等它缓过来再继续
          await new Promise((resolve) => res.once('drain', resolve))
        }
      }
    } finally {
      res.off('close', onClose)
      if (pos > end || closed) {
        try { res.end() } catch (_) {}
      } else {
        // 没发满就收尾（数据等不到了）：`Content-Length` 已经发出去了，改不了 ——
        // 必须**切断连接**让客户端立刻知道响应被截断。只 `end()` 的话它会一直
        // 等剩下的字节，表现为播放器永远转圈。
        try { res.destroy() } catch (_) {}
      }
    }
  }
}

/** 解析 `Range: bytes=start-end`（支持 `start-` 与 `-suffix`）。 */
function parseRange (header, total) {
  if (!header || typeof header !== 'string') {
    return null
  }
  const m = header.trim().match(/^bytes=(\d*)-(\d*)$/)
  if (!m) {
    return null
  }
  const hasStart = m[1] !== ''
  const hasEnd = m[2] !== ''
  if (!hasStart && !hasEnd) {
    return null
  }
  let start
  let end
  if (!hasStart) {
    const suffix = Number(m[2])
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(m[1])
    end = hasEnd ? Number(m[2]) : total - 1
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null
  }
  end = Math.min(end, total - 1)
  if (start > end || start >= total) {
    return null
  }
  return { start, end }
}

const MIME_BY_EXT = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  m4s: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
  flv: 'video/x-flv',
  ogv: 'video/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wma: 'audio/x-ms-wma',
  ape: 'audio/x-ape',
  m3u8: 'application/vnd.apple.mpegurl'
}

export function mimeOf (filePath) {
  const ext = path.extname(`${filePath || ''}`).replace(/^\./, '').toLowerCase()
  return MIME_BY_EXT[ext] || 'application/octet-stream'
}

export { MIME_BY_EXT }
