import { EventEmitter } from 'node:events'
import _WebSocket from 'ws'
import { JSONRPCError } from './JSONRPCError'
import { Deferred } from './Deferred'
import promiseEvent from './promiseEvent'

const WebSocket = global.WebSocket || _WebSocket
// Electron 43（Node 22 / 现代 Chromium）已内置全局 fetch，不再需要 node-fetch
const fetch = global.fetch.bind(global)

export class JSONRPCClient extends EventEmitter {
  constructor (options) {
    super()
    this.deferreds = Object.create(null)
    this.lastId = 0

    Object.assign(this, this.defaultOptions, options)
  }

  id () {
    return this.lastId++
  }

  url (protocol) {
    return (
      protocol +
      (this.secure ? 's' : '') +
      '://' +
      this.host +
      ':' +
      this.port +
      this.path
    )
  }

  websocket (message) {
    return new Promise((resolve, reject) => {
      const cb = (err) => {
        if (err) reject(err)
        else resolve()
      }
      this.socket.send(JSON.stringify(message), cb)
      if (global.WebSocket && this.socket instanceof global.WebSocket) cb()
    })
  }

  async http (message) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeout = controller ? setTimeout(() => controller.abort(), this.timeout) : null
    try {
      const response = await fetch(this.url('http'), {
        method: 'POST',
        body: JSON.stringify(message),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        signal: controller ? controller.signal : undefined
      })

      if (!response.ok) {
        throw new Error(`HTTP request failed with status ${response.status}`)
      }

      let data
      try {
        data = await response.json()
      } catch (err) {
        throw new Error(`Invalid JSON response: ${err && err.message ? err.message : err}`)
      }
      this._onmessage(data)
    } catch (err) {
      this.emit('error', err)
      // 响应解析失败或超时时按消息 id reject 对应 deferred，
      // 否则调用方 promise 会永久挂起
      this._failMessage(message, err)
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }

  _buildMessage (method, params) {
    if (typeof method !== 'string') {
      throw new TypeError(method + ' is not a string')
    }

    const message = {
      method,
      'json-rpc': '2.0',
      id: this.id()
    }

    if (params) Object.assign(message, { params })
    return message
  }

  async batch (calls) {
    const message = calls.map(([method, params]) => {
      return this._buildMessage(method, params)
    })

    await this._send(message)

    return message.map(({ id }) => {
      const deferred = new Deferred()
      deferred._message = { method: id, params: undefined, id }
      deferred._batchMessage = message
      this.deferreds[id] = deferred
      return deferred.promise
    })
  }

  async call (method, parameters) {
    const message = this._buildMessage(method, parameters)
    await this._send(message)

    const deferred = new Deferred()
    deferred._message = message
    this.deferreds[message.id] = deferred

    // WebSocket 路径没有 HTTP 超时保护，引擎挂起不回包时 deferred 会永久
    // 驻留。加一个超时兜底，超时后 reject 并移除，防止内存泄漏。
    deferred._timeoutTimer = setTimeout(() => {
      if (this.deferreds[message.id] === deferred) {
        delete this.deferreds[message.id]
        deferred.reject(new Error(`JSONRPC call timeout: ${method}`))
      }
    }, this.timeout)
    // 不阻止进程退出
    if (typeof deferred._timeoutTimer.unref === 'function') {
      deferred._timeoutTimer.unref()
    }

    return deferred.promise
  }

  async _send (message) {
    this.emit('output', message)

    const { socket } = this
    return socket && socket.readyState === 1
      ? this.websocket(message)
      : this.http(message)
  }

  _onresponse ({ id, error, result }) {
    const deferred = this.deferreds[id]
    if (!deferred) return
    if (deferred._timeoutTimer) {
      clearTimeout(deferred._timeoutTimer)
    }
    if (error) deferred.reject(new JSONRPCError(error))
    else deferred.resolve(result)
    delete this.deferreds[id]
  }

  _onrequest ({ method, params }) {
    if (typeof this.onrequest === 'function') {
      return this.onrequest(method, params)
    }
    // 未定义 onrequest 时退化为事件通知，避免抛 TypeError
    this.emit('request', method, params)
    return undefined
  }

  _onnotification ({ method, params }) {
    this.emit(method, params)
  }

  _failMessage (message, err) {
    const ids = Array.isArray(message)
      ? message.map(m => m && m.id).filter(id => id !== undefined)
      : [message && message.id]
    for (const id of ids) {
      if (id === undefined) continue
      const deferred = this.deferreds[id]
      if (!deferred) continue
      if (deferred._timeoutTimer) {
        clearTimeout(deferred._timeoutTimer)
      }
      deferred.reject(new JSONRPCError({ message: (err && err.message) || String(err) }))
      delete this.deferreds[id]
    }
  }

  _onmessage = (message) => {
    this.emit('input', message)

    if (Array.isArray(message)) {
      for (const object of message) {
        this._onobject(object)
      }
    } else {
      this._onobject(message)
    }
  }

  _onobject (message) {
    if (message.method === undefined) this._onresponse(message)
    else if (message.id === undefined) this._onnotification(message)
    else this._onrequest(message)
  }

  _rejectAllDeferreds (reason) {
    const ids = Object.keys(this.deferreds)
    const retried = new Set()
    for (const id of ids) {
      const deferred = this.deferreds[id]
      if (!deferred) continue

      // If we have the original message, retry via HTTP instead of rejecting
      const msg = deferred._batchMessage || deferred._message
      if (msg) {
        // 同一批 batch 消息的所有 deferred 共享同一个 _batchMessage，
        // 只重试一次，避免断线时同一条消息被重复 POST N 次
        const key = Array.isArray(msg) ? msg.map(m => m && m.id).join(',') : String(msg && msg.id)
        if (!retried.has(key)) {
          retried.add(key)
          this.http(msg)
        }
        // Don't delete — HTTP response will resolve via _onresponse
        continue
      }

      // No message to retry — reject immediately
      deferred.reject(new Error(reason || 'WebSocket closed'))
      delete this.deferreds[id]
    }
  }

  async open () {
    // 清理可能残留的旧连接，避免重连时旧 socket 的事件继续影响新连接
    if (this.socket) {
      const old = this.socket
      try {
        old.onclose = null
        old.onmessage = null
        old.onopen = null
        old.onerror = null
      } catch (_) {}
      try {
        if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) {
          old.close()
        }
      } catch (_) {}
    }

    let socket
    try {
      socket = (this.socket = new WebSocket(this.url('ws')))
    } catch (err) {
      this.emit('error', err)
      throw err
    }

    socket.onclose = (...args) => {
      // 断线时立即 reject 所有 pending 请求，防止它们永久挂起
      this._rejectAllDeferreds('WebSocket connection closed')
      this.emit('close', ...args)
    }
    socket.onmessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch (err) {
        this.emit('error', err)
        return
      }
      this._onmessage(message)
    }
    socket.onopen = (...args) => {
      this.emit('open', ...args)
    }
    socket.onerror = (event) => {
      const error = new Error(`WebSocket error: ${event.type}`)
      this.emit('error', error)
    }

    return promiseEvent(this, 'open')
  }

  async close () {
    const { socket } = this
    if (!socket) {
      return undefined
    }
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.CLOSING) {
      socket.close()
      return promiseEvent(this, 'close')
    }
    // 已关闭或从未成功打开：close 事件不会再触发，直接返回
    this.socket = null
    return undefined
  }

  defaultOptions = {
    secure: false,
    host: 'localhost',
    port: 80,
    secret: '',
    path: '/jsonrpc',
    timeout: 10000,
    fetch,
    WebSocket
  }
}
