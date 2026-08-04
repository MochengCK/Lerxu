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

// 'tasks' 写盘防抖：高频调用（轮询 saveStoppedTasks / updateTask）时
// 先更新内存中的待写数据，2 秒后落盘；退出前通过 beforeunload flush
let pendingTasks = null
let writeTimer = null

const flushPendingWrites = () => {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  if (pendingTasks !== null) {
    const tasks = pendingTasks
    pendingTasks = null
    try {
      taskHistoryStore.set('tasks', tasks)
    } catch (_) { }
  }
}

const scheduleTasksWrite = (tasks) => {
  pendingTasks = tasks
  if (writeTimer) {
    clearTimeout(writeTimer)
  }
  writeTimer = setTimeout(flushPendingWrites, 2000)
}

const cancelPendingWrites = () => {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  pendingTasks = null
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
    const raw = taskHistoryStore.get('deletedGids', [])
    return Array.isArray(raw) ? raw : []
  }

  _readTasks () {
    if (pendingTasks !== null) {
      return pendingTasks
    }
    const raw = taskHistoryStore.get('tasks', [])
    return Array.isArray(raw) ? raw : []
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
    taskHistoryStore.set('deletedGids', deletedList)
  }

  /**
   * 清空任务历史记录
   */
  clearHistory () {
    cancelPendingWrites()
    taskHistoryStore.set('tasks', [])
    taskHistoryStore.set('deletedGids', [])
  }
}

export default new TaskHistory()
