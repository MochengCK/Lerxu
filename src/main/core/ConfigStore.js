/**
 * 主进程的小型 JSON 配置存储（替代 electron-store / conf）。
 *
 * 为什么换掉 electron-store：
 *   · **每次 `get()` 都同步读盘 + JSON.parse**（conf 的 store getter 不缓存）。
 *     窗口显示/隐藏、主题切换、菜单重建都会读配置，等于每条读操作都在主线程做文件 IO。
 *     WindowManager 里好几处注释都在绕这件事（"userConfig 必须按需实时读取"）。
 *   · `set()` **每个 key 写一次盘 + fsync**：`savePreference` 一次保存十几项就是十几次同步写。
 *   · 依赖链重：conf → ajv / ajv-formats / dot-prop / atomically / env-paths…（约 6MB）。
 *   · 上游 8.2.0 → 12.x 已转 ESM-only，与本项目的 CJS 主进程包不兼容，无法简单升级。
 *
 * 这里只做四件事，语义对齐 electron-store：
 *   1. 启动时**读一次**进内存，之后 `get` 全是内存操作（O(1)、零 IO）；
 *   2. 写入合并到同一轮事件循环末尾（`setTimeout 0`），一次保存只落一次盘；
 *   3. 落盘走 临时文件 + rename 的原子替换，断电/崩溃不会留下半截 JSON；
 *   4. 文件损坏时先改名备份（`.corrupt-<时间戳>`）再从默认值起，不阻塞启动。
 *
 * 与 electron-store 的一个**有意差异**：只把**用户显式写过的 key** 落到磁盘，
 * 默认值留在代码里。这样以后调默认值时，老用户也能拿到新默认值
 * （electron-store 会把 defaults 一起持久化，导致改默认值对老用户无效 ——
 * ConfigManager 里那一长串 fixXxxConfig 迁移有一半是在补这个坑）。
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { cloneDeep, isEqual } from '@shared/utils/object'

// 合并同一轮事件循环里的多次 set（保存偏好一次会写十几项）
const WRITE_DELAY_MS = 0

/** 已创建的 store（退出前统一 flush） */
const instances = new Set()
let quitHookInstalled = false

function installQuitHook () {
  if (quitHookInstalled) {
    return
  }
  quitHookInstalled = true
  const flushAll = () => {
    instances.forEach((store) => {
      try {
        store.flush()
      } catch (_) { }
    })
  }
  // will-quit 可能被 preventDefault（Launcher 要先停引擎），这里每次都 flush，
  // 未脏时是空操作
  app.on('will-quit', flushAll)
  app.on('before-quit', flushAll)
}

export default class ConfigStore {
  /**
   * @param {object} options
   * @param {string} options.name 文件名（不含 .json）
   * @param {string} [options.cwd] 目录（相对路径按进程工作目录解析，与 conf 一致）
   * @param {object} [options.defaults] 默认值（不落盘）
   */
  constructor ({ name, cwd, defaults = {} } = {}) {
    if (!name) {
      throw new Error('ConfigStore 需要 name')
    }
    this.name = name
    this.defaults = defaults && typeof defaults === 'object' ? defaults : {}
    this.file = resolve(cwd || app.getPath('userData'), `${name}.json`)
    this.data = {}
    this._timer = null
    this._dirty = false
    // onDidChange / onDidAnyChange（electron-store 同名 API）
    this._listeners = new Map()
    this._anyListeners = new Set()
    // 本轮脏数据开始时的快照，用于 flush 时算差异并通知监听者
    this._snapshot = null
    this._lastSerialized = null

    instances.add(this)
    installQuitHook()

    this._load()
  }

  _load () {
    try {
      if (!existsSync(this.file)) {
        return
      }
      const raw = readFileSync(this.file, 'utf-8')
      if (!raw.trim()) {
        return
      }
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.data = parsed
      }
    } catch (err) {
      // 损坏文件先备份，避免用户的旧配置被静默覆盖
      try {
        renameSync(this.file, `${this.file}.corrupt-${Date.now()}`)
        console.error(`[ConfigStore] ${this.file} 解析失败，已备份并从默认值启动:`, err && err.message)
      } catch (_) { }
      this.data = {}
    }
  }

  /** 与 electron-store 一致：默认值 + 已持久化的值 */
  get store () {
    return { ...this.defaults, ...this.data }
  }

  /** 文件路径（调试用） */
  get path () {
    return this.file
  }

  get (key, defaultValue) {
    if (typeof key === 'undefined') {
      return this.store
    }
    if (Object.prototype.hasOwnProperty.call(this.data, key)) {
      return this.data[key]
    }
    if (Object.prototype.hasOwnProperty.call(this.defaults, key)) {
      return this.defaults[key]
    }
    return defaultValue
  }

  has (key) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ||
      Object.prototype.hasOwnProperty.call(this.defaults, key)
  }

  /**
   * 写入。支持 `set(key, value)` 与 `set({ a: 1, b: 2 })` 两种形态
   * （后者与 electron-store 一致，值为 undefined 表示删除该 key）。
   */
  set (key, value) {
    if (key && typeof key === 'object' && !Array.isArray(key)) {
      this._beginChange()
      Object.keys(key).forEach((k) => {
        if (key[k] === undefined) {
          delete this.data[k]
        } else {
          this.data[k] = key[k]
        }
      })
      return
    }
    if (key == null) {
      return
    }
    if (value === undefined) {
      this.delete(key)
      return
    }
    this._beginChange()
    this.data[key] = value
  }

  delete (key) {
    if (!Object.prototype.hasOwnProperty.call(this.data, key)) {
      return
    }
    this._beginChange()
    delete this.data[key]
  }

  clear () {
    this._beginChange()
    this.data = {}
  }

  /**
   * 标记「即将有改动」。必须在**修改 data 之前**调用：
   * 快照要保存改动前的完整 store，flush 时才能算出正确的差异
   * （早先写在赋值之后，diff 永远是空 → onDidChange 一次都不触发）。
   */
  _beginChange () {
    if (!this._dirty) {
      this._snapshot = cloneDeep(this.store)
    }
    this._dirty = true
    if (this._timer) {
      return
    }
    this._timer = setTimeout(() => {
      this._timer = null
      this.flush()
    }, WRITE_DELAY_MS)
  }

  /**
   * 监听单个 key 的变化（对齐 electron-store：返回取消函数，回调收 newValue/oldValue）。
   * 通知在 **flush 时合并派发**：一次保存十几项只会触发一轮回调，不会像
   * electron-store 那样每个 key 各触发一次（那会让菜单/主题反复重建）。
   */
  onDidChange (key, callback) {
    if (typeof callback !== 'function') {
      return () => { }
    }
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set())
    }
    this._listeners.get(key).add(callback)
    return () => {
      const set = this._listeners.get(key)
      if (set) {
        set.delete(callback)
        if (set.size === 0) {
          this._listeners.delete(key)
        }
      }
    }
  }

  /** 监听任意变化（对齐 electron-store：回调收 newStore/oldStore，返回取消函数） */
  onDidAnyChange (callback) {
    if (typeof callback !== 'function') {
      return () => { }
    }
    this._anyListeners.add(callback)
    return () => this._anyListeners.delete(callback)
  }

  _notify (before, after) {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    let anyChanged = false
    keys.forEach((key) => {
      const oldValue = before ? before[key] : undefined
      const newValue = after ? after[key] : undefined
      if (isEqual(oldValue, newValue)) {
        return
      }
      anyChanged = true
      const set = this._listeners.get(key)
      if (!set) {
        return
      }
      set.forEach((fn) => {
        try {
          fn(newValue, oldValue)
        } catch (err) {
          console.error(`[ConfigStore] onDidChange(${key}) 回调抛错:`, err && err.message)
        }
      })
    })
    if (!anyChanged) {
      return
    }
    this._anyListeners.forEach((fn) => {
      try {
        fn(after, before)
      } catch (err) {
        console.error('[ConfigStore] onDidAnyChange 回调抛错:', err && err.message)
      }
    })
  }

  /** 立即落盘（原子替换）；未脏时直接返回 */
  flush () {
    if (!this._dirty) {
      return
    }
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    const before = this._snapshot || {}
    this._snapshot = null
    try {
      const serialized = JSON.stringify(this.data, null, 2)
      // 值没变就别写盘（"保存偏好"里常常有点了保存但没改的情况）
      if (serialized !== this._lastSerialized) {
        mkdirSync(dirname(this.file), { recursive: true })
        const tmp = `${this.file}.tmp`
        writeFileSync(tmp, serialized, 'utf-8')
        renameSync(tmp, this.file)
        this._lastSerialized = serialized
      }
      this._dirty = false
      this._notify(before, this.store)
    } catch (err) {
      // 写失败保留 dirty，下次 set/flush 再试
      this._dirty = true
      console.error(`[ConfigStore] 写入 ${this.file} 失败:`, err && err.message)
    }
  }
}
