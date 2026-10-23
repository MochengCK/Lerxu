import Store from 'electron-store'
import { TASK_STATUS } from '@shared/constants'

// 定义任务历史记录存储
const taskHistoryStore = new Store({
  name: 'taskHistory',
  cwd: process.env.NODE_ENV === 'development' ? './dev-config' : undefined,
  defaults: {
    tasks: [],
    deletedGids: []
  }
})

const MAX_HISTORY_ITEMS = 100// 最大历史记录数量
const MAX_DELETED_GIDS = 2000// 删除黑名单最大数量（滚动裁剪）

// ── 内存缓存 ────────────────────────────────────────────────────────────
// electron-store 每次 `get()` 都会**同步读盘 + JSON.parse**（Conf 的 store
// getter 不缓存）。轮询里 `getHistory() / getAllHistory() / getDeletedGids()`
// 每秒要调用好几次，实测单次 1~3ms，且全是主线程上的同步 IO；任务列表里
// 每个任务取一次时更糟（几十毫秒的卡顿 + 磁盘被反复唤醒）。
//
// 因此这里把两份数据（tasks / deletedGids）**读一次常驻内存**，之后所有读
// 都走内存，写走下面的合并落盘。
let cachedTasks = null
let cachedDeletedGids = null
let lastWrittenTasksJSON = ''
let lastWrittenDeletedJSON = ''

const loadTasks = () => {
  if (cachedTasks !== null) {
    return cachedTasks
  }
  const raw = taskHistoryStore.get('tasks', [])
  cachedTasks = Array.isArray(raw) ? raw : []
  try {
    lastWrittenTasksJSON = JSON.stringify(cachedTasks)
  } catch (_) {
    lastWrittenTasksJSON = ''
  }
  return cachedTasks
}

const loadDeletedGids = () => {
  if (cachedDeletedGids !== null) {
    return cachedDeletedGids
  }
  const raw = taskHistoryStore.get('deletedGids', [])
  cachedDeletedGids = Array.isArray(raw) ? raw : []
  try {
    lastWrittenDeletedJSON = JSON.stringify(cachedDeletedGids)
  } catch (_) {
    lastWrittenDeletedJSON = ''
  }
  return cachedDeletedGids
}

// 'tasks' 写盘合并：2 秒内的多次改动只在**第一次**预定一次落盘（旧的
// debounce 每次改动都重置计时器，而轮询每秒都会调用 saveStoppedTasks /
// updateTask ⇒ 计时器永远被推后，历史记录实际上只在退出时才落盘）。
let writeTimer = null

const flushPendingWrites = () => {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  try {
    const tasks = cachedTasks || []
    const json = JSON.stringify(tasks)
    if (json !== lastWrittenTasksJSON) {
      taskHistoryStore.set('tasks', tasks)
      lastWrittenTasksJSON = json
    }
  } catch (_) { }
  try {
    const deleted = cachedDeletedGids || []
    const json = JSON.stringify(deleted)
    if (json !== lastWrittenDeletedJSON) {
      taskHistoryStore.set('deletedGids', deleted)
      lastWrittenDeletedJSON = json
    }
  } catch (_) { }
}

const scheduleTasksWrite = (tasks) => {
  cachedTasks = Array.isArray(tasks) ? tasks : []
  // 已有待落盘的计时器就不再重置：保证最多 2 秒一定写一次
  if (!writeTimer) {
    writeTimer = setTimeout(flushPendingWrites, 2000)
  }
}

const scheduleDeletedGidsWrite = (gids) => {
  cachedDeletedGids = Array.isArray(gids) ? gids : []
  if (!writeTimer) {
    writeTimer = setTimeout(flushPendingWrites, 2000)
  }
}

const cancelPendingWrites = () => {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeunload', flushPendingWrites)
}

class TaskHistory {
  /**
   * 已删除任务的 gid 黑名单（持久化）。
   * 删除任务时记入，防止 aria2 在下一次 tellStopped 上报时任务复活。
   */
  getDeletedGids () {
    return loadDeletedGids()
  }

  _readTasks () {
    return loadTasks()
  }

  _deletedGidSet () {
    return new Set(this.getDeletedGids().map(gid => `${gid}`))
  }

  getAllHistory () {
    const list = this._readTasks()
    const deleted = this._deletedGidSet()
    const cleaned = list.filter(t => {
      if (!t || !t.gid || t.deletedAt) return false
      if (deleted.has(`${t.gid}`)) return false
      const status = `${t.status || ''}`
      return status !== TASK_STATUS.REMOVED
    })
    // 如果历史记录过多，只保留最新的
    if (cleaned.length > MAX_HISTORY_ITEMS) {
      // 按 savedAt（无则 createdAt）排序，新的在前，保留最新的
      cleaned.sort((a, b) => {
        const tsA = parseInt(a.savedAt) || parseInt(a.createdAt) || 0
        const tsB = parseInt(b.savedAt) || parseInt(b.createdAt) || 0
        return tsB - tsA
      })
      const limited = cleaned.slice(0, MAX_HISTORY_ITEMS)
      scheduleTasksWrite(limited)
      return limited
    }
    if (cleaned.length !== list.length) {
      scheduleTasksWrite(cleaned)
    }
    return cleaned
  }

  /**
   * 保存已停止的任务到历史记录
   * @param {Array} tasks - 已停止的任务列表
   */
  saveStoppedTasks (tasks = []) {
    if (!Array.isArray(tasks)) {
      return
    }

    // 过滤出已完成、已失败的任务，排除元数据解析任务
    const stoppedTasks = tasks.filter(task => {
      const { status } = task
      // 检查是否为种子解析任务（名称以[METADATA]开头）- 这些任务不应该保存到历史记录
      const isMetadataTask = task.name && task.name.startsWith('[METADATA]')
      if (isMetadataTask) {
        return false
      }
      // 排除尚未获取元数据的磁力任务
      const isTransientMagnet = task.bittorrent && !task.bittorrent.info
      if (isTransientMagnet) {
        return false
      }
      const statusKey = `${status || ''}`
      return [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR].includes(statusKey)
    })

    if (stoppedTasks.length === 0) {
      return
    }

    const currentHistory = this.getAllHistory()
    const deleted = this._deletedGidSet()
    const updatedHistory = [...currentHistory]
    stoppedTasks.forEach(task => {
      if (!task || !task.gid) {
        return
      }
      // 用户已删除的任务不再重新写入历史记录（防止删除后复活）
      if (deleted.has(`${task.gid}`)) {
        return
      }
      const idx = updatedHistory.findIndex(t => t && t.gid === task.gid)
      if (idx === -1) {
        updatedHistory.push({
          ...task,
          savedAt: Date.now()
        })
        return
      }
      const prev = updatedHistory[idx] || {}
      if (prev.deletedAt) {
        return
      }
      const savedAt = prev.savedAt != null ? prev.savedAt : Date.now()
      updatedHistory[idx] = {
        ...prev,
        ...task,
        savedAt
      }
    })

    scheduleTasksWrite(updatedHistory)
  }

  /**
   * 获取任务历史记录
   * @returns {Array} 任务历史记录列表
   */
  getHistory () {
    const all = this.getAllHistory()
    return all.filter(t => !t.deletedAt && `${t.status || ''}` !== TASK_STATUS.REMOVED)
  }

  updateTask (gid, patch = {}, fallbackTask = null) {
    if (!gid) {
      return
    }
    // 已删除的任务不再接收状态更新（防止复活）
    if (this._deletedGidSet().has(`${gid}`)) {
      return
    }

    const currentHistory = this.getAllHistory()
    const idx = currentHistory.findIndex(task => task.gid === gid)
    const now = Date.now()
    const stoppedStatuses = new Set([TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED])
    const activeStatuses = new Set([TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED])

    if (idx === -1) {
      const base = fallbackTask && typeof fallbackTask === 'object' ? fallbackTask : { gid }
      const normalizedPatch = patch && typeof patch === 'object' ? patch : {}
      const baseStatus = `${base.status || ''}`
      const patchStatus = `${normalizedPatch.status || ''}`
      const shouldSetSavedAt =
        normalizedPatch.savedAt != null ||
        base.savedAt != null ||
        stoppedStatuses.has(patchStatus) ||
        stoppedStatuses.has(baseStatus)
      const startedAt = base.startedAt != null
        ? base.startedAt
        : (normalizedPatch.startedAt != null ? normalizedPatch.startedAt : (activeStatuses.has(patchStatus) || activeStatuses.has(baseStatus) ? now : undefined))
      const createdAt = base.createdAt != null ? base.createdAt : normalizedPatch.createdAt
      const savedAt = normalizedPatch.savedAt != null
        ? normalizedPatch.savedAt
        : (base.savedAt != null ? base.savedAt : (shouldSetSavedAt ? now : undefined))
      const entry = {
        ...base,
        ...normalizedPatch
      }
      if (startedAt !== undefined) {
        entry.startedAt = startedAt
      }
      if (createdAt !== undefined) {
        entry.createdAt = createdAt
      }
      if (savedAt !== undefined) {
        entry.savedAt = savedAt
      }
      scheduleTasksWrite([
        ...currentHistory,
        entry
      ])
      return
    }

    const prev = currentHistory[idx] || {}
    if (prev.deletedAt) {
      return
    }
    const normalizedPatch = patch && typeof patch === 'object' ? patch : {}
    const prevStatus = `${prev.status || ''}`
    const patchStatus = `${normalizedPatch.status || ''}`
    const shouldSetSavedAt =
      normalizedPatch.savedAt != null ||
      prev.savedAt != null ||
      stoppedStatuses.has(patchStatus) ||
      stoppedStatuses.has(prevStatus)
    const startedAt = prev.startedAt != null
      ? prev.startedAt
      : (normalizedPatch.startedAt != null ? normalizedPatch.startedAt : (activeStatuses.has(patchStatus) || activeStatuses.has(prevStatus) ? now : undefined))
    const createdAt = prev.createdAt != null ? prev.createdAt : normalizedPatch.createdAt
    const savedAt = normalizedPatch.savedAt != null
      ? normalizedPatch.savedAt
      : (prev.savedAt != null ? prev.savedAt : (shouldSetSavedAt ? now : undefined))
    const next = [...currentHistory]
    const entry = { ...prev, ...normalizedPatch }
    if (startedAt !== undefined) {
      entry.startedAt = startedAt
    } else if (Object.prototype.hasOwnProperty.call(entry, 'startedAt')) {
      delete entry.startedAt
    }
    if (createdAt !== undefined) {
      entry.createdAt = createdAt
    }
    if (savedAt !== undefined) {
      entry.savedAt = savedAt
    } else if (Object.prototype.hasOwnProperty.call(entry, 'savedAt')) {
      delete entry.savedAt
    }
    next[idx] = entry
    scheduleTasksWrite(next)
  }

  consolidateTasks (canonicalGid, memberGids = [], patch = {}, fallbackTask = null) {
    if (!canonicalGid) {
      return
    }
    // 已删除的任务不再合并（防止复活）
    if (this._deletedGidSet().has(`${canonicalGid}`)) {
      return
    }
    const raw = this._readTasks()
    const currentHistory = Array.isArray(raw) ? raw : []
    const members = new Set((memberGids || []).map(gid => `${gid}`))
    members.add(`${canonicalGid}`)
    const existing = currentHistory.find(task => task && `${task.gid}` === `${canonicalGid}`)
    const base = existing || fallbackTask || { gid: canonicalGid }
    const entry = {
      ...base,
      ...patch,
      gid: canonicalGid,
      savedAt: base.savedAt != null ? base.savedAt : Date.now()
    }
    const next = currentHistory.filter(task => {
      return task && !members.has(`${task.gid}`)
    })
    next.push(entry)
    scheduleTasksWrite(next)
  }

  /**
   * 从历史记录中移除任务，并记入删除黑名单。
   * 黑名单用于阻止 aria2 在后续轮询（tellStopped）中重新上报该任务。
   * @param {string} gid - 任务的GID
   */
  removeTask (gid) {
    if (!gid) {
      return
    }

    const raw = this._readTasks()
    const currentHistory = Array.isArray(raw) ? raw : []
    const next = currentHistory.filter(task => task && `${task.gid}` !== `${gid}`)
    scheduleTasksWrite(next)

    const deleted = this._deletedGidSet()
    deleted.add(`${gid}`)
    let deletedList = Array.from(deleted)
    if (deletedList.length > MAX_DELETED_GIDS) {
      deletedList = deletedList.slice(deletedList.length - MAX_DELETED_GIDS)
    }
    // 同样合并落盘：批量删除（一次删几十条）时不再每条一次同步写
    scheduleDeletedGidsWrite(deletedList)
  }

  /**
   * 清空任务历史记录
   */
  clearHistory () {
    cancelPendingWrites()
    cachedTasks = []
    cachedDeletedGids = []
    taskHistoryStore.set('tasks', [])
    taskHistoryStore.set('deletedGids', [])
    lastWrittenTasksJSON = '[]'
    lastWrittenDeletedJSON = '[]'
  }
}

export default new TaskHistory()
