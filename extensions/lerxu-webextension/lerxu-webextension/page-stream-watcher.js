// 页面世界（MAIN world）的「流地址观察者」。
//
// 为什么单独要有这一层：内容脚本跑在隔离世界（isolated world），页面里的
// XHR / fetch / WebSocket 都是**页面世界**的对象 —— 在隔离世界改它们的原型
// 对页面毫无影响，也读不到接口响应体。而不少站点的直播地址正是这样下发的：
// 播放器在 Web Worker 里取流（页面侧看不到媒体请求），或者流地址只出现在
// 接口 JSON / 长连接帧里。
//
// 这里在页面世界里挂三处**只读**观察：
//   1. XHR 的 JSON 响应体（`load` 事件时读一次）；
//   2. fetch 的 JSON 响应体（clone 一份解析，不动页面拿到的那份）；
//   3. WebSocket 消息帧 —— 文本帧直接扫；二进制帧先试 gzip 解压（部分站点
//      的长连接是压缩后的二进制载荷），解压不了就按 UTF-8 文本扫
//      （protobuf 里的地址是明文 ASCII）。
// 捞到的媒体地址经 `postMessage` 交给隔离世界的内容脚本登记：两个世界共享
// DOM 与 window 消息，但不共享 JS 对象。
//
// 约束：**绝不改变页面行为**（只在原函数调用之外做自己的事，异常一律吞掉）、
// 单条载荷扫描有大小上限、只认 http(s) 且带媒体扩展名的地址。
(function () {
  'use strict'

  const MSG_KEY = '__lerxuStreamUrls'
  /// 单条载荷的扫描上限（超过就跳过：接口响应与长连接帧不该这么大）。
  const SCAN_MAX_BYTES = 2 * 1024 * 1024
  /// 一条载荷最多上报多少条地址（防恶意页面刷爆列表）。
  const MAX_URLS_PER_PAYLOAD = 32
  /// 一个页面（框架）最多上报多少条地址：直播流常按"清晰度 × 封装"铺开
  /// （同一条流能有一二十个变体），全铺在列表里反而没法选。页面/接口通常
  /// 把主推的那条放最前，留前若干条即可。
  const MAX_REPORTED_TOTAL = 12
  /// 只认这几种容器的流地址（与扩展的媒体嗅探范围一致）。
  const MEDIA_EXT_RE = /\.(?:m3u8?|flv|mpd)(?:[?#]|$)/i
  const ABS_URL_RE = /https?:\/\/[^\s"'\\<>\])}]+?\.(?:m3u8?|flv|mpd)(?:[?#][^\s"'\\<>\])}]*)?/gi
  /// 已经上报过的地址（几个时间点会重扫，同一地址不重复占额度/重复上报）
  const reported = new Set()

  /**
   * 文本里扫绝对媒体地址。
   *
   * 先做一次**转义还原**：接口/内嵌数据里的地址常常是转义形态，不还原就会
   * 在转义处截断（地址少了签名参数就是一条打不开的死链）：
   * - `\\u0026` 这类 `\uXXXX`（JSON/JS 字符串里的 `&` `=` 等）；
   * - `\\/`（JSON 里的斜杠）。
   */
  const scanText = (text) => {
    const out = new Set()
    if (typeof text !== 'string' || !text) return out
    let normalized = text
    if (normalized.indexOf('\\u') >= 0) {
      normalized = normalized.replace(/\\u([0-9a-fA-F]{4})/g, (m, hex) => {
        const code = parseInt(hex, 16)
        return code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : m
      })
    }
    if (normalized.indexOf('\\/') >= 0) {
      normalized = normalized.replace(/\\\//g, '/')
    }
    if (!MEDIA_EXT_RE.test(normalized)) return out
    const re = new RegExp(ABS_URL_RE.source, 'gi')
    let m
    while ((m = re.exec(normalized))) {
      out.add(m[0])
      if (out.size >= MAX_URLS_PER_PAYLOAD) break
    }
    return out
  }

  /**
   * JSON 值里递归捞媒体地址。
   *
   * - 绝对地址直接用；
   * - 协议相对（`//host/path.flv`）补上页面协议；
   * - **相对路径**（接口把 `host` 与 `base_url` 分开放：
   *   `{"host":"https://…","base_url":"/live/….flv?…"}`）用同一对象里
   *   最近的 http(s) 主机字段拼出完整地址 —— 这个形态在直播接口里很常见，
   *   只正则匹配绝对地址会整片漏掉。
   */
  const scanJsonValue = (root) => {
    const out = new Set()
    const seen = new Set()
    const visit = (value, hostHint) => {
      if (out.size >= MAX_URLS_PER_PAYLOAD) return
      if (typeof value === 'string') {
        const s = value.trim()
        if (!MEDIA_EXT_RE.test(s)) return
        if (/^https?:\/\//i.test(s)) {
          out.add(s)
          return
        }
        if (s.startsWith('//')) {
          out.add(`${location.protocol || 'https:'}${s}`)
          return
        }
        if (s.startsWith('/') && hostHint) {
          out.add(`${hostHint}${s}`)
        }
        return
      }
      if (Array.isArray(value)) {
        for (const v of value) visit(v, hostHint)
        return
      }
      if (value && typeof value === 'object') {
        if (seen.has(value)) return
        seen.add(value)
        let host = hostHint
        for (const key of Object.keys(value)) {
          const v = value[key]
          if (typeof v !== 'string') continue
          const sv = v.trim()
          if (/^https?:\/\//i.test(sv) && !MEDIA_EXT_RE.test(sv) && /host|domain|origin|prefix|server|base/i.test(key)) {
            host = sv.replace(/\/+$/, '')
          }
        }
        for (const key of Object.keys(value)) visit(value[key], host)
      }
    }
    visit(root, '')
    return out
  }

  const report = (urls) => {
    if (!urls || urls.size === 0) return
    for (const url of urls) {
      if (reported.has(url)) continue
      if (reported.size >= MAX_REPORTED_TOTAL) return
      reported.add(url)
      try {
        // 控制台留痕：排障时能一眼看出"观察器到底有没有捞到地址"
        console.debug('[Lerxu] page-world stream url:', url)
      } catch (e) {}
      try {
        window.postMessage({ [MSG_KEY]: url }, '*')
      } catch (e) {}
    }
  }

  /** 任意载荷（JSON 值 / JSON 文本 / 任意文本）→ 上报媒体地址。 */
  const scanPayload = (payload) => {
    try {
      let urls = null
      if (typeof payload === 'string') {
        const text = payload.length > SCAN_MAX_BYTES ? payload.slice(0, SCAN_MAX_BYTES) : payload
        try {
          urls = scanJsonValue(JSON.parse(text))
        } catch (e) {
          urls = scanText(text)
        }
      } else if (payload && typeof payload === 'object') {
        urls = scanJsonValue(payload)
      }
      if (urls) report(urls)
    } catch (e) {}
  }

  /** WebSocket 帧：文本直接扫；二进制/Blob 先试 gzip，再按 UTF-8 文本扫。 */
  const scanFrame = (data) => {
    try {
      if (typeof data === 'string') {
        scanPayload(data)
        return
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        // 浏览器默认把二进制帧交给页面为 Blob（播放器常这么用）——
        // 大小设限后读一次（帧已在内存里，读它不影响长连接节奏）
        if (data.size === 0 || data.size > SCAN_MAX_BYTES) return
        data.arrayBuffer().then((buf) => scanFrame(buf)).catch(() => {})
        return
      }
      let bytes = null
      if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data)
      } else if (data && ArrayBuffer.isView(data)) {
        bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      } else {
        return
      }
      if (bytes.byteLength === 0 || bytes.byteLength > SCAN_MAX_BYTES) return
      if (bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream === 'function') {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
        new Response(stream).text().then((text) => scanPayload(text)).catch(() => {})
        return
      }
      scanPayload(new TextDecoder('utf-8', { fatal: false }).decode(bytes))
    } catch (e) {}
  }

  /** 容错百分号解码：整体解不开时先把孤立的 `%` 转义掉再解。 */
  const pctDecodeTolerant = (text) => {
    if (text.indexOf('%') < 0) return text
    try {
      return decodeURIComponent(text)
    } catch (e) {
      try {
        return decodeURIComponent(text.replace(/%(?![0-9a-fA-F]{2})/g, '%25'))
      } catch (e2) {
        return text
      }
    }
  }

  /**
   * 页面 HTML / 内联脚本里内嵌的流地址。
   *
   * 服务端渲染的页面常把整份房间数据（含流地址）塞在内联脚本里，而且是
   * 整串百分号编码的（`%7B%22…` 这种）：只扫 XHR / 长连接会整片漏掉。
   * 这里把内联脚本的文本（必要时解码一次）按与别处同一套规则扫一遍。
   */
  const scanInlineScripts = () => {
    try {
      const scripts = document.scripts || []
      let budget = 4 * 1024 * 1024
      for (let i = 0; i < scripts.length && budget > 0; i++) {
        const s = scripts[i]
        if (!s || s.src) continue
        let text = ''
        try {
          text = s.textContent || ''
        } catch (e) {
          continue
        }
        if (!text || text.length > budget) {
          if (text) budget = 0
          continue
        }
        budget -= text.length
        if (text.indexOf('.flv') < 0 && text.indexOf('.m3u8') < 0 && text.indexOf('.m3u') < 0 &&
            text.indexOf('%2F') < 0 && text.indexOf('%2f') < 0) {
          continue
        }
        scanPayload(text)
        const decoded = pctDecodeTolerant(text)
        if (decoded !== text) scanPayload(decoded)
      }
    } catch (e) {}
  }

  // 内联脚本可能随水合/路由变化晚到：几个时间点各扫一次（都是只读且带预算）
  try {
    const rescan = () => {
      try {
        scanInlineScripts()
      } catch (e) {}
    }
    const rescanAll = () => {
      rescan()
      try {
        // 少数页面把数据放在非脚本的位置（属性 / 注释 / 模板）：
        // load 后再整页扫一遍（只此一次，带预算）
        const html = document.documentElement ? document.documentElement.outerHTML : ''
        if (html) scanPayload(pctDecodeTolerant(html))
      } catch (e) {}
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', rescan, { once: true })
    } else {
      rescan()
    }
    window.addEventListener('load', rescanAll, { once: true })
    setTimeout(rescan, 1500)
    setTimeout(rescan, 5000)
  } catch (e) {}

  // ---- 观察点 1：XHR 的 JSON 响应体（只加一个 load 监听，不动页面回调） ----
  try {
    const send = XMLHttpRequest.prototype.send
    if (typeof send === 'function') {
      XMLHttpRequest.prototype.send = function () {
        try {
          this.addEventListener('load', () => {
            try {
              const ct = this.getResponseHeader && this.getResponseHeader('Content-Type')
              if (!ct || !/json/i.test(ct)) return
              const len = parseInt(this.getResponseHeader('Content-Length') || '0', 10) || 0
              if (len > SCAN_MAX_BYTES) return
              const type = this.responseType
              let body = null
              if (type === '' || type === 'text') body = this.responseText
              else if (type === 'json') body = this.response
              if (body != null) scanPayload(body)
            } catch (e) {}
          })
        } catch (e) {}
        return send.apply(this, arguments)
      }
    }
  } catch (e) {}

  // ---- 观察点 2：fetch 的 JSON 响应体（clone 解析，页面拿到的那份不动） ----
  try {
    const origFetch = window.fetch
    if (typeof origFetch === 'function') {
      window.fetch = function () {
        const p = origFetch.apply(this, arguments)
        try {
          p.then((resp) => {
            try {
              if (!resp || !resp.headers || typeof resp.clone !== 'function') return
              const ct = resp.headers.get('Content-Type') || ''
              if (!/json/i.test(ct)) return
              const len = parseInt(resp.headers.get('Content-Length') || '0', 10) || 0
              if (len > SCAN_MAX_BYTES) return
              resp.clone().json().then((v) => scanPayload(v)).catch(() => {})
            } catch (e) {}
          }).catch(() => {})
        } catch (e) {}
        return p
      }
    }
  } catch (e) {}

  // ---- 观察点 3：WebSocket 消息帧（addEventListener 与 onmessage 两条路） ----
  try {
    const proto = WebSocket.prototype
    const origAdd = proto.addEventListener
    if (typeof origAdd === 'function') {
      proto.addEventListener = function (type, listener, options) {
        try {
          if (type === 'message' && typeof listener === 'function') {
            const wrapped = function (event) {
              try {
                scanFrame(event && event.data)
              } catch (e) {}
              return listener.apply(this, arguments)
            }
            return origAdd.call(this, type, wrapped, options)
          }
        } catch (e) {}
        return origAdd.apply(this, arguments)
      }
    }
    const desc = Object.getOwnPropertyDescriptor(proto, 'onmessage')
    if (desc && typeof desc.set === 'function' && typeof desc.get === 'function') {
      Object.defineProperty(proto, 'onmessage', {
        configurable: true,
        enumerable: !!desc.enumerable,
        get () {
          return desc.get.call(this)
        },
        set (fn) {
          let wrapped = fn
          if (typeof fn === 'function') {
            wrapped = function (event) {
              try {
                scanFrame(event && event.data)
              } catch (e) {}
              return fn.apply(this, arguments)
            }
          }
          try {
            return desc.set.call(this, wrapped)
          } catch (e) {
            return undefined
          }
        }
      })
    }
  } catch (e) {}
})()
