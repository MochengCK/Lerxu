'use strict'

import { Aria2 } from '@shared/aria2'

import logger from './LogManager'
import {
  compactUndefined,
  formatOptionsForEngine,
  normalizeBtEncryptionOptions
} from '@shared/utils'
import { deduplicateTrackerString } from '@shared/utils/tracker'
import {
  ENGINE_RPC_HOST,
  ENGINE_RPC_PORT,
  EMPTY_STRING
} from '@shared/constants'

const defaults = {
  host: ENGINE_RPC_HOST,
  port: ENGINE_RPC_PORT,
  secret: EMPTY_STRING
}

// 需要从引擎实时推送给渲染进程的通知事件
const ENGINE_EVENTS = [
  'onDownloadStart',
  'onDownloadPause',
  'onDownloadStop',
  'onDownloadComplete',
  'onDownloadError',
  'onBtDownloadComplete'
]

export default class EngineClient {
  static instance = null
  static client = null

  constructor (options = {}) {
    this.options = {
      ...defaults,
      ...options
    }

    this._eventForwarder = null
    this._reconnectTimer = null
    this._reconnectAttempts = 0
    this._intentionalClose = false

    this.init()
  }

  init () {
    this.connect()
  }

  /**
   * 建立与引擎的 WebSocket 连接（单一长连接）。
   * 渲染进程不再直连引擎，统一经主进程转发，
   * 避免 Chromium 走系统代理导致本地 RPC 端口被拒。
   */
  connect () {
    logger.info('[Lerxu] main engine client connect', this.options)
    const { host, port, secret } = this.options
    const client = new Aria2({ host, port, secret })

    // 引擎通知事件（onDownloadStart 等）转发给渲染进程
    this.bindEngineEvents(client)

    // 引擎未启动 / 崩溃时 socket 会 emit('error')，
    // 必须监听防止 EventEmitter 抛未捕获异常导致应用崩溃
    client.on('error', (err) => {
      logger.warn('[Lerxu] engine websocket error:', err && err.message ? err.message : err)
    })

    // 断线自动重连（引擎崩溃重启 / 网络波动）
    client.on('close', () => {
      if (this._intentionalClose) {
        return
      }
      this.scheduleReconnect()
    })

    client.open().catch((err) => {
      logger.warn('[Lerxu] engine websocket connect fail:', err && err.message ? err.message : err)
    })

    this.client = client
    EngineClient.client = client
  }

  bindEngineEvents (client) {
    ENGINE_EVENTS.forEach((name) => {
      client.on(name, (...args) => {
        if (this._eventForwarder) {
          this._eventForwarder(name, ...args)
        }
      })
    })
  }

  /**
   * 注册引擎事件转发回调（由 Application 注入，广播到渲染进程窗口）。
   */
  setEventForwarder (fn) {
    this._eventForwarder = fn
  }

  scheduleReconnect () {
    if (this._reconnectTimer || this._intentionalClose) {
      return
    }
    this._reconnectAttempts += 1
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts - 1), 15000)
    logger.warn(`[Lerxu] engine websocket disconnected, reconnect in ${delay}ms (attempt ${this._reconnectAttempts})`)
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      this.reconnect()
    }, delay)
  }

  async reconnect () {
    try {
      const { host, port, secret } = this.options
      const client = new Aria2({ host, port, secret })
      this.bindEngineEvents(client)
      client.on('error', (err) => {
        logger.warn('[Lerxu] engine websocket error:', err && err.message ? err.message : err)
      })
      client.on('close', () => {
        if (this._intentionalClose) {
          return
        }
        this.scheduleReconnect()
      })
      await client.open()
      this.client = client
      EngineClient.client = client
      this._reconnectAttempts = 0
      logger.info('[Lerxu] engine websocket reconnected')
      // 通知渲染进程连接已恢复（用于刷新断线期间的数据）
      if (this._eventForwarder) {
        this._eventForwarder('reconnect')
      }
    } catch (err) {
      logger.warn('[Lerxu] engine websocket reconnect fail:', err && err.message ? err.message : err)
      this.scheduleReconnect()
    }
  }

  /**
   * 主进程内部调用：失败时吞错返回 null（保持原有语义）。
   */
  async call (method, ...args) {
    if (!this.client) {
      return null
    }
    return this.client.call(method, ...args).catch((err) => {
      logger.warn('[Lerxu] call client fail:', err.message)
      return null
    })
  }

  /**
   * 供渲染进程 IPC 转发使用：失败时向上抛错，让调用方感知引擎不可用。
   */
  async callForRenderer (method, ...args) {
    if (!this.client) {
      throw new Error('engine client is closed')
    }
    return this.client.call(method, ...args)
  }

  async multicall (calls) {
    if (!this.client) {
      throw new Error('engine client is closed')
    }
    return this.client.multicall(calls)
  }

  async changeGlobalOption (options) {
    logger.info('[Lerxu] change engine global option:', options)
    const normalizedOptions = { ...options }
    // Deduplicate bt-tracker URLs before sending to the engine so it
    // never wastes announce cycles on duplicate trackers.
    if (normalizedOptions['bt-tracker'] !== undefined && normalizedOptions['bt-tracker']) {
      normalizedOptions['bt-tracker'] = deduplicateTrackerString(normalizedOptions['bt-tracker'])
    }
    if (normalizedOptions['bt-encryption-mode'] !== undefined || normalizedOptions['bt-force-encryption'] !== undefined) {
      // 必须先读取原键再删除：normalizeBtEncryptionOptions 依赖入参中的
      // bt-encryption-mode/bt-force-encryption 计算引擎选项，若先 delete
      // 再调用，函数读不到键会直接返回原对象，BT 加密设置被静默丢弃。
      // normalize 返回的新对象已剔除应用层键，但 Object.assign 不会删除
      // 原对象中已存在的键，因此仍需显式 delete，避免把引擎不认识的
      // bt-encryption-mode/bt-force-encryption 通过 RPC 传给引擎。
      const normalizedBt = normalizeBtEncryptionOptions(normalizedOptions)
      delete normalizedOptions['bt-encryption-mode']
      delete normalizedOptions['bt-force-encryption']
      Object.assign(normalizedOptions, normalizedBt)
    }
    const args = formatOptionsForEngine(normalizedOptions)

    return this.call('changeGlobalOption', args)
  }

  async shutdown (options = {}) {
    const { force = false } = options
    const { secret } = this.options

    const method = force ? 'forceShutdown' : 'shutdown'
    const args = compactUndefined([secret])
    return this.call(method, ...args)
  }

  /**
   * 主动关闭与引擎的连接：停止自动重连并清理定时器。
   * 应用退出 / 引擎停止时调用，防止重连定时器无限存活。
   */
  close () {
    this._intentionalClose = true
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    const client = this.client
    this.client = null
    EngineClient.client = null
    if (client) {
      try {
        client.removeAllListeners && client.removeAllListeners()
        client.close && client.close()
      } catch (err) {
        logger.warn('[Lerxu] engine client close fail:', err && err.message ? err.message : err)
      }
    }
  }
}
