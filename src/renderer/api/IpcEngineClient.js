import { ipcRenderer } from 'electron'
import { EventEmitter } from 'events'

/**
 * 渲染进程引擎客户端（IPC 桥接）。
 *
 * 渲染进程不再通过 WebSocket 直连 aria2（Chromium 会走系统代理，
 * 导致本地 127.0.0.1:16800 被代理拒绝，出现 ERR_CONNECTION_REFUSED），
 * 而是统一把 RPC 转发给主进程，由主进程持有与引擎的单一 WebSocket
 * 长连接。本类保持与原 Aria2 客户端一致的接口（call / multicall /
 * open / close / on / removeListener / emit），EngineClient.vue 等
 * 现有调用方无需改动。
 */
export default class IpcEngineClient extends EventEmitter {
  constructor (options = {}) {
    super()
    this.options = options || {}
    this._ipcBound = false

    // 主进程转发的引擎通知事件（onDownloadStart 等）
    this._onEngineEvent = (event, payload) => {
      if (!payload) {
        return
      }
      const { name, args } = payload
      if (name && this.listenerCount(name) > 0) {
        this.emit(name, ...(Array.isArray(args) ? args : []))
      }
    }
  }

  async open () {
    if (!this._ipcBound) {
      ipcRenderer.on('engine:event', this._onEngineEvent)
      this._ipcBound = true
    }
    // 主进程负责与引擎建立/维护连接，此处仅确保事件订阅就绪
    return true
  }

  async close () {
    if (this._ipcBound) {
      ipcRenderer.removeListener('engine:event', this._onEngineEvent)
      this._ipcBound = false
    }
    return true
  }

  /**
   * 统一调用主进程 engine:rpc，解包 { ok, result/error } 契约。
   * 失败时恢复带 code 的 Error（aria2 错误码对调用方很重要，如 code===1）。
   */
  async _invoke (method, args) {
    const res = await ipcRenderer.invoke('engine:rpc', { method, args })
    if (!res || res.ok === false) {
      const err = new Error((res && res.error && res.error.message) || 'engine rpc failed')
      if (res && res.error && res.error.code !== undefined) {
        err.code = res.error.code
      }
      throw err
    }
    return res && res.result
  }

  call (method, ...args) {
    return this._invoke(method, args)
  }

  multicall (calls) {
    return this._invoke('multicall', [calls])
  }
}
