import Store from 'electron-store'
import { TASK_STATUS } from '@shared/constants'

// 定义任务历史记录存储
const taskHistoryStore = new Store({
  name: 'taskHistory',
  cwd: process.env.NODE_ENV === 'development' ? './dev-config' : undefined,
  defaults: {
    tasks: []
  }
})

const MAX_HISTORY_ITEMS = 100// 最大历史记录数量

class TaskHistory {
  getAllHistory () {
    const raw = taskHistoryStore.get('tasks', [])
    const list = Array.isArray(raw) ? raw : []
    const cleaned = list.filter(t => {
      if (!t || !t.gid) return false
      const status = `${t.status || ''}`
      if (t.deletedAt) return true
      return status !== TASK_STATUS.REMOVED
    })
    // 如果历史记录过多，只保留最新的
    if (cleaned.length > MAX_HISTORY_ITEMS) {
      // 按 savedAt 或 createdAt 排序，保留最新的
      cleaned.sort((a, b) => {
        const tsA = parseInt(b.savedAt) || parseInt(b.createdAt) || 0
        const tsB = parseInt(a.savedAt) || parseInt(a.createdAt) || 0
        return tsA - tsB
      })
      const limited = cleaned.slice(0, MAX_HISTORY_ITEMS)
      try {
        taskHistoryStore.set('tasks', limited)
      } catch (_) { }
      return limited
    }
    if (cleaned.length !== list.length) {
      try {
        taskHistoryStore.set('tasks', cleaned)
      } catch (_) { }
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
      // 检查是否为磁力链接任务
      const isMagnetTask = task.bittorrent && !task.bittorrent.info
      return isMagnetTask || [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR].includes(status)
    })

    if (stoppedTasks.length === 0) {
      return
    }

    const currentHistory = this.getAllHistory()
    const updatedHistory = [...currentHistory]
    stoppedTasks.forEach(task => {
      if (!task || !task.gid) {
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

    taskHistoryStore.set('tasks', updatedHistory)
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
      taskHistoryStore.set('tasks', [
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
    taskHistoryStore.set('tasks', next)
  }

  /**
   * 从历史记录中移除任务
   * @param {string} gid - 任务的GID
   */
  removeTask (gid) {
    if (!gid) {
      return
    }

    const now = Date.now()
    const currentHistory = this.getAllHistory()
    const idx = currentHistory.findIndex(task => task.gid === gid)
    if (idx === -1) {
      taskHistoryStore.set('tasks', [...currentHistory, { gid, deletedAt: now }])
      return
    }

    const next = [...currentHistory]
    next[idx] = { ...next[idx], deletedAt: now }
    taskHistoryStore.set('tasks', next)
  }

  /**
   * 清空任务历史记录
   */
  clearHistory () {
    taskHistoryStore.set('tasks', [])
  }
}

export default new TaskHistory()
