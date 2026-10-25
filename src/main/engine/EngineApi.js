/**
 * ZuvRust JSON-RPC 客户端（主进程用）。
 *
 * 协议以 ZuvRust 仓库的 `API.md` 为准；这里只实现 App 需要的那部分：
 * 一对一的请求、进度回调、可取消，以及**原样转发**的流式字节（不解析 MEV1）。
 *
 * 为什么不在渲染进程直接起引擎：引擎进程与版本/热替换/退出清理都归主进程管，
 * 渲染进程只通过 `media-engine:*` IPC 调这里（见 MediaEngineService / ipc.js）。
 */

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

const TYPE_JSON = 0
const TYPE_BINARY = 1
const MAX_JSON_BYTES = 8 << 20
const MAX_BINARY_BYTES = 64 << 20

function abortError () {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

export class EngineApiError extends Error {
  constructor (message, { code = 0, data = null } = {}) {
    super(message || 'ZuvRust error')
    this.name = 'EngineApiError'
    this.code = code
    this.data = data
    this.kind = data && data.kind ? data.kind : ''
    this.retryable = !!(data && data.retryable)
    this.exitCode = data && Number.isInteger(data.exitCode) ? data.exitCode : null
  }
}

function rpcError (error) {
  return new EngineApiError(error && error.message, {
    code: error && Number.isInteger(error.code) ? error.code : 0,
    data: error && error.data ? error.data : null
  })
}

/** 一条流：`ready` 先给出元信息，之后 `next()` 吐原始字节/进度/结束。 */
export class EngineStream {
  constructor (client) {
    this.client = client
    this.requestId = null
    this.streamId = null
    this.meta = null
    this._queue = []
    this._waiters = []
    this._ended = false
    this._error = null
    let resolveReady
    let rejectReady
    this.ready = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    this._readySettled = false
    this._resolveReady = (meta) => {
      if (this._readySettled) return
      this._readySettled = true
      resolveReady(meta)
    }
    this._rejectReady = (error) => {
      if (this._readySettled) return
      this._readySettled = true
      rejectReady(error)
    }
  }

  _started (result) {
    this.streamId = result.streamId
    this.meta = result.meta
    this._resolveReady(result.meta)
    this._pushEvent({ type: 'meta', meta: result.meta })
  }

  _chunk (data) {
    this._pushEvent({ type: 'chunk', data: Buffer.from(data) })
  }

  _progress (params) {
    this._pushEvent({ type: 'progress', name: params.type, data: params.data })
  }

  _end (params) {
    const error = params && params.ok === false && params.error
      ? rpcError(params.error)
      : null
    if (error) this._error = error
    this._ended = true
    this._pushEvent({ type: 'end', ok: !!(params && params.ok), error: error || undefined })
    this.client._streams.delete(this.streamId)
    this.client._streamRequests.delete(this.requestId)
  }

  _fail (error) {
    this._error = error
    this._ended = true
    this._rejectReady(error)
    this._queue.length = 0
    if (this.streamId != null) this.client._streams.delete(this.streamId)
    this.client._streamRequests.delete(this.requestId)
    this._drain()
  }

  _pushEvent (event) {
    this._queue.push(event)
    this._drain()
  }

  _drain () {
    while (this._waiters.length > 0 && this._queue.length > 0) {
      this._waiters.shift().resolve({ value: this._queue.shift(), done: false })
    }
    if (this._ended && this._queue.length === 0) {
      while (this._waiters.length > 0) {
        const waiter = this._waiters.shift()
        if (this._error) waiter.reject(this._error)
        else waiter.resolve({ value: undefined, done: true })
      }
    }
  }

  next () {
    if (this._queue.length > 0) {
      return Promise.resolve({ value: this._queue.shift(), done: false })
    }
    if (this._ended) {
      return this._error
        ? Promise.reject(this._error)
        : Promise.resolve({ value: undefined, done: true })
    }
    return new Promise((resolve, reject) => {
      this._waiters.push({ resolve, reject })
    })
  }

  async * [Symbol.asyncIterator] () {
    for (;;) {
      const item = await this.next()
      if (item.done) return
      yield item.value
    }
  }

  cancel () {
    if (this.requestId == null || this._ended) {
      return Promise.resolve({ cancelled: false })
    }
    return this.client.cancel(this.requestId)
  }
}

/**
 * 一个 `zuvrust serve --stdio` 客户端。一个客户端对应一个引擎进程。
 * 应用只通过 MediaEngineService 使用它（单例 + 热替换检查）。
 */
export default class EngineApi extends EventEmitter {
  static async start (options = {}) {
    const client = new EngineApi(options)
    await client._ready
    await client.initialize()
    return client
  }

  constructor ({ bin = 'zuvrust', env = process.env, stderr = 'pipe', windowsHide = true } = {}) {
    super()
    this.bin = bin
    this._closed = false
    this._exited = false
    this._buffer = Buffer.alloc(0)
    this._nextId = 1
    this._pending = new Map()
    this._streams = new Map()
    this._streamRequests = new Map()
    this.engine = null

    this._child = spawn(bin, ['serve', '--stdio'], {
      stdio: ['pipe', 'pipe', stderr === 'inherit' ? 'inherit' : 'pipe'],
      env,
      windowsHide
    })
    this._child.stdout.on('data', chunk => this._onData(chunk))
    this._child.stdin.on('error', error => {
      this._failAll(new EngineApiError(`engine stdin: ${error.message}`))
    })
    this._child.on('error', error => {
      this._failAll(new EngineApiError(`engine process: ${error.message}`))
    })
    if (stderr !== 'inherit') {
      this._child.stderr.on('data', chunk => {
        for (const line of chunk.toString('utf8').split('\n')) {
          if (line.trim()) this.emit('stderr', line)
        }
      })
    }
    this._exitPromise = new Promise(resolve => {
      this._child.once('exit', (code, signal) => {
        this._exited = true
        this._closed = true
        this._failAll(new EngineApiError(
          `engine exited${code == null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}`,
          { code: 1005, data: { kind: 'internal', retryable: false, exitCode: code } }
        ))
        this.emit('close', { code, signal })
        resolve()
      })
    })
    this._ready = new Promise((resolve, reject) => {
      this._child.once('spawn', resolve)
      this._child.once('error', reject)
    })
    this._ready.catch(() => {})
  }

  get closed () {
    return this._closed
  }

  async initialize () {
    const result = await this._request('initialize', { protocolVersion: 1 })
    if (result.protocolVersion !== 1) {
      throw new EngineApiError(`unsupported protocol version ${result.protocolVersion}`)
    }
    this.engine = result.engine
    return result
  }

  version () {
    return this._request('version', {})
  }

  ping () {
    return this._request('ping', {})
  }

  probe (input, options = {}) {
    const { onProgress, signal, ...params } = options
    return this._request('probe', { input, ...params }, { onProgress, signal })
  }

  mux (output, inputs, options = {}) {
    const { onProgress, signal, ...params } = options
    return this._request('mux', { output, inputs, ...params }, { onProgress, signal })
  }

  remux (output, input, options = {}) {
    const { onProgress, signal, ...params } = options
    return this._request('remux', { output, input, ...params }, { onProgress, signal })
  }

  download (input, options = {}) {
    const { onProgress, signal, ...params } = options
    return this._request('download', { input, ...params }, { onProgress, signal })
  }

  decode (input, options = {}) {
    const { onProgress, signal, ...params } = options
    return this._request('decode', { input, ...params }, { onProgress, signal })
  }

  /** 原始流（fMP4 或 MEV1 包流），不在这里解析。 */
  stream (input, options = {}) {
    const { onProgress, signal, ...params } = options
    const handle = new EngineStream(this)
    this._request('stream', { input, ...params }, { onProgress, signal, stream: handle })
      .catch(error => handle._fail(error))
    return handle
  }

  /** `EnginePlayer` 使用的别名：与 MediaEngineService 的接口保持一致。 */
  openStream (input, options = {}) {
    return this.stream(input, options)
  }

  cancel (requestId) {
    return this._request('cancel', { requestId })
  }

  async close () {
    if (this._closed) return
    try {
      await Promise.race([
        this._request('shutdown', {}),
        new Promise(resolve => setTimeout(resolve, 1000))
      ])
    } catch (_) {}
    try { this._child.stdin.end() } catch (_) {}
    await Promise.race([this._exitPromise, new Promise(resolve => setTimeout(resolve, 1000))])
    if (!this._exited) {
      try { this._child.kill() } catch (_) {}
      await Promise.race([this._exitPromise, new Promise(resolve => setTimeout(resolve, 1000))])
    }
    this._closed = true
  }

  _request (method, params = {}, { onProgress = null, signal = null, stream = null } = {}) {
    if (this._closed) {
      return Promise.reject(new EngineApiError('engine client is closed'))
    }
    const id = this._nextId++
    if (stream) stream.requestId = id
    return new Promise((resolve, reject) => {
      const entry = {
        id,
        method,
        onProgress,
        stream,
        settled: false,
        resolve: value => settle(resolve, value),
        reject: error => settle(reject, error)
      }
      let cleanup = null
      const settle = (fn, value) => {
        if (entry.settled) return
        entry.settled = true
        this._pending.delete(id)
        if (cleanup) cleanup()
        fn(value)
      }
      this._pending.set(id, entry)
      try {
        this._writeJson({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        settle(reject, error)
        return
      }
      if (signal) {
        if (signal.aborted) {
          this.cancel(id).catch(() => {})
          settle(reject, abortError())
          if (stream) stream._fail(abortError())
          return
        }
        const onAbort = () => {
          this.cancel(id).catch(() => {})
          settle(reject, abortError())
          if (stream) stream._fail(abortError())
        }
        signal.addEventListener('abort', onAbort, { once: true })
        cleanup = () => signal.removeEventListener('abort', onAbort)
      }
    })
  }

  _writeJson (value) {
    const payload = Buffer.from(JSON.stringify(value), 'utf8')
    if (payload.length > MAX_JSON_BYTES) {
      throw new EngineApiError('JSON frame too large')
    }
    const head = Buffer.allocUnsafe(5)
    head.writeUInt32LE(payload.length, 0)
    head.writeUInt8(TYPE_JSON, 4)
    this._child.stdin.write(Buffer.concat([head, payload]))
  }

  _onData (chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk])
    while (this._buffer.length >= 5) {
      const length = this._buffer.readUInt32LE(0)
      const type = this._buffer.readUInt8(4)
      const max = type === TYPE_JSON ? MAX_JSON_BYTES : MAX_BINARY_BYTES
      if (length > max) {
        this._failAll(new EngineApiError(`frame length ${length} exceeds limit ${max}`))
        return
      }
      if (this._buffer.length < 5 + length) return
      const payload = this._buffer.subarray(5, 5 + length)
      this._buffer = this._buffer.subarray(5 + length)
      if (type === TYPE_JSON) {
        let message
        try {
          message = JSON.parse(payload.toString('utf8'))
        } catch (error) {
          this._failAll(new EngineApiError(`invalid JSON from engine: ${error.message}`))
          return
        }
        this._onMessage(message)
      } else if (type === TYPE_BINARY) {
        if (payload.length < 8) continue
        const streamId = payload.readUInt32LE(0)
        const data = payload.subarray(8)
        const handle = this._streams.get(streamId)
        if (handle) handle._chunk(data)
      }
    }
  }

  _onMessage (message) {
    if (message && typeof message.method === 'string') {
      const params = message.params || {}
      if (message.method === 'progress') {
        const stream = this._streamRequests.get(params.requestId)
        if (stream) stream._progress(params)
        const entry = this._pending.get(params.requestId)
        if (entry && entry.onProgress) entry.onProgress(params.data, params.type)
        this.emit('progress', params)
        return
      }
      if (message.method === 'stream/end') {
        const handle = this._streams.get(params.streamId)
        if (handle) handle._end(params)
        return
      }
      if (message.method === 'log') {
        if (params.line) this.emit('stderr', params.line)
        return
      }
      this.emit('notification', message)
      return
    }
    if (!message || !Object.prototype.hasOwnProperty.call(message, 'id')) return
    const entry = this._pending.get(message.id)
    if (!entry) return
    if (message.error) {
      entry.reject(rpcError(message.error))
      return
    }
    if (entry.stream) {
      this._streams.set(message.result.streamId, entry.stream)
      this._streamRequests.set(message.id, entry.stream)
      entry.stream._started(message.result)
    }
    entry.resolve(message.result)
  }

  _failAll (error) {
    for (const entry of this._pending.values()) entry.reject(error)
    this._pending.clear()
    for (const handle of this._streams.values()) handle._fail(error)
    this._streams.clear()
    this._streamRequests.clear()
  }
}
