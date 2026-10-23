/**
 * 渲染进程用的小型 JSON 持久化存储。
 *
 * 为什么不用 electron-store / conf：
 *   · 它会把 conf + ajv + semver + atomically/dot-prop 全部打进渲染包
 *     —— 实测约 250~280KB（占主 chunk 近两成），却只用到 `get/set` 两个方法；
 *   · Conf 的 `get()` **每次都同步读盘 + JSON.parse**（不缓存），
 *     任务历史每秒要读好几次，全落在渲染线程上；
 *   · 创建 Store 时还要通过 @electron/remote 取一次 userData（一次同步 IPC ~3ms）。
 *
 * 这里只做三件事：**读一次进内存、改写后合并落盘、退出前 flush**。
 * 文件格式与 Conf 完全一致（`{ key: value }`），可以直接接管已有文件。
 */

import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

// 合并写盘：连续 set 时只写一次（任务历史有自己的 2s 防抖，这里只兜底短突发）
const WRITE_DELAY_MS = 120

let _userDataCache = ''

/**
 * 渲染进程的数据目录。
 *
 * 主进程在创建窗口前把 `LERXU_USER_DATA` 写进自己的环境变量，渲染进程作为
 * 子进程会继承 —— 这样不需要任何同步 IPC。只有环境缺失（例如单独跑单测）时
 * 才回退到 remote 取一次；再不行用工作目录，保证不会抛异常。
 */
function resolveUserData () {
  if (_userDataCache) {
    return _userDataCache
  }
  if (process.env && process.env.LERXU_USER_DATA) {
    _userDataCache = process.env.LERXU_USER_DATA
    return _userDataCache
  }
  try {
    const { app } = require('@electron/remote')
    _userDataCache = app.getPath('userData')
    return _userDataCache
  } catch (_) { }
  try {
    const { app } = require('electron')
    _userDataCache = app.getPath('userData')
    return _userDataCache
  } catch (_) { }
  _userDataCache = process.cwd()
  return _userDataCache
}

const clone = (value) => {
  if (value === null || typeof value !== 'object') {
    return value
  }
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (_) {
    return Array.isArray(value) ? [] : {}
  }
}

export default class JsonStore {
  /**
   * @param {object} options
   * @param {string} options.name 文件名（不含 .json）
   * @param {string} [options.cwd] 相对 userData 的子目录（绝对路径则原样使用）
   * @param {object} [options.defaults] 默认值，读取时与文件内容合并
   */
  constructor ({ name, cwd, defaults = {} } = {}) {
    if (!name) {
      throw new Error('JsonStore 需要 name')
    }
    const base = resolveUserData()
    const dir = cwd ? (isAbsolute(cwd) ? cwd : resolve(base, cwd)) : base
    this.path = join(dir, `${name}.json`)
    this.defaults = clone(defaults) || {}
    this.data = this._load()
    this._timer = null
    this._onBeforeUnload = () => this.flush()
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('beforeunload', this._onBeforeUnload)
    }
  }

  _load () {
    try {
      const raw = readFileSync(this.path, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...this.defaults, ...parsed }
      }
    } catch (err) {
      // 文件损坏时先留一份备份再从默认值开始，绝不把原文件直接覆盖掉
      if (err && err.code !== 'ENOENT') {
        try {
          renameSync(this.path, `${this.path}.corrupt-${Date.now()}`)
        } catch (_) { }
      }
    }
    return { ...this.defaults }
  }

  get (key, defaultValue) {
    if (key === undefined) {
      return this.data
    }
    if (Object.prototype.hasOwnProperty.call(this.data, key)) {
      return this.data[key]
    }
    return defaultValue === undefined ? this.defaults[key] : defaultValue
  }

  set (key, value) {
    if (key && typeof key === 'object') {
      Object.assign(this.data, key)
    } else {
      this.data[key] = value
    }
    this._scheduleWrite()
    return this
  }

  delete (key) {
    if (Object.prototype.hasOwnProperty.call(this.data, key)) {
      delete this.data[key]
      this._scheduleWrite()
    }
    return this
  }

  get store () {
    return this.data
  }

  clear () {
    this.data = { ...this.defaults }
    this._scheduleWrite()
    return this
  }

  _scheduleWrite () {
    if (this._timer) {
      return
    }
    this._timer = setTimeout(() => this.flush(), WRITE_DELAY_MS)
  }

  /** 立即落盘（原子替换：先写 .tmp 再 rename） */
  flush () {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    try {
      mkdirSync(dirname(this.path), { recursive: true })
    } catch (_) { }
    const tmp = `${this.path}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify(this.data, null, 2))
      renameSync(tmp, this.path)
    } catch (err) {
      console.warn('[JsonStore] 写盘失败', this.path, err && err.message ? err.message : err)
    }
  }
}
