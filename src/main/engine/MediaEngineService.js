/**
 * 主进程的媒体引擎单例。
 *
 * 整个应用只维护一个 `zuvrust serve --stdio`：
 *   · 渲染进程的 probe / mux / remux 经 IPC 调这里；
 *   · 主进程播放经 `openStream()` 直接调这里；
 *   · 引擎路径变化（用户数据目录热替换）时自动换进程；
 *   · 应用退出时统一 close。
 */

import EngineApi, { EngineApiError } from './EngineApi'
import { resolveMediaEnginePath } from '../utils'

class MediaEngineService {
  constructor () {
    this.client = null
    this.enginePath = ''
    this._starting = null
  }

  /** 确保引擎已启动；返回 EngineApi。 */
  async ensure () {
    if (this._starting) return this._starting
    const path = resolveMediaEnginePath()
    if (!path) {
      throw new EngineApiError('没有找到媒体引擎（zuvrust）', {
        code: 1002,
        data: { kind: 'engine-missing', retryable: false, exitCode: 2 }
      })
    }
    if (this.client && !this.client.closed && this.enginePath === path) {
      return this.client
    }
    this._starting = this._start(path)
    try {
      return await this._starting
    } finally {
      this._starting = null
    }
  }

  async _start (path) {
    await this.closeClient()
    const client = await EngineApi.start({ bin: path, env: { ...process.env } })
    this.client = client
    this.enginePath = path
    client.on('close', () => {
      if (this.client === client) {
        this.client = null
      }
    })
    return client
  }

  async version () {
    const client = await this.ensure()
    return client.version()
  }

  async status () {
    try {
      const client = await this.ensure()
      return {
        ok: true,
        result: {
          path: this.enginePath,
          engine: client.engine
        }
      }
    } catch (error) {
      return { ok: false, error: serializeEngineError(error) }
    }
  }

  async probe (input, options = {}) {
    const client = await this.ensure()
    return client.probe(input, options)
  }

  async mux (output, inputs, options = {}) {
    const client = await this.ensure()
    return client.mux(output, inputs, options)
  }

  async remux (output, input, options = {}) {
    const client = await this.ensure()
    return client.remux(output, input, options)
  }

  async download (input, options = {}) {
    const client = await this.ensure()
    return client.download(input, options)
  }

  async decode (input, options = {}) {
    const client = await this.ensure()
    return client.decode(input, options)
  }

  /** 打开一条原始流（EngineStream）；调用方自己消费字节/进度。 */
  async openStream (input, options = {}) {
    const client = await this.ensure()
    return client.stream(input, options)
  }

  async closeClient () {
    const client = this.client
    this.client = null
    this.enginePath = ''
    if (client) {
      try { await client.close() } catch (_) {}
    }
  }

  async close () {
    if (this._starting) {
      try { await this._starting } catch (_) {}
    }
    await this.closeClient()
  }
}

export function serializeEngineError (error) {
  if (error && error.name === 'AbortError') {
    return {
      message: 'cancelled',
      kind: 'cancelled',
      retryable: false,
      code: 1006,
      exitCode: 6
    }
  }
  if (error instanceof EngineApiError) {
    return {
      message: error.message,
      kind: error.kind || 'internal',
      retryable: !!error.retryable,
      code: error.code || 1005,
      exitCode: error.exitCode
    }
  }
  return {
    message: error && error.message ? error.message : `${error}`,
    kind: 'internal',
    retryable: false,
    code: 1005,
    exitCode: null
  }
}

export const mediaEngineService = new MediaEngineService()
export { EngineApi }
