import api from '@/api'
import { EMPTY_STRING, TASK_STATUS, AUDIO_SUFFIXES, DOCUMENT_SUFFIXES, IMAGE_SUFFIXES, SUB_SUFFIXES, VIDEO_SUFFIXES } from '@shared/constants'
import { checkTaskIsBT, getFileNameFromFile, getFileExtension, getTaskUri, intersection, isGithubUrl, getGithubUrlsWithMirrors } from '@shared/utils'
import taskHistory from '@/api/TaskHistory'
import pendingFileSelectionStore from '@/api/PendingFileSelection'
import { inferRefererFromUrl } from '@shared/utils/referer-rules'

const MAX_TASK_SPEED_SAMPLE_GIDS = 200
const MAX_TASK_DISPLAY_NAME_GIDS = 1000
const MAX_TASK_PRIORITY_GIDS = 1000
const MAX_MAGNET_STATUS_GIDS = 300
const MAX_DATA_ACCESS_STATUS_GIDS = 300
const MAX_TASK_LINK_UPDATE_HINT_GIDS = 300

let saveSessionDebounceTimer = null

function normalizeGid (gid) {
  const s = `${gid || ''}`
  return s
}

function pruneObjectByGidSet (obj, gidSet) {
  const keys = Object.keys(obj || {})
  if (keys.length === 0) {
    return obj
  }
  let changed = false
  const next = {}
  keys.forEach(k => {
    if (gidSet.has(k)) {
      next[k] = obj[k]
    } else {
      changed = true
    }
  })
  return changed ? next : obj
}

function capObjectByTimestamp (obj, cap, getTs) {
  const keys = Object.keys(obj || {})
  if (keys.length <= cap) {
    return obj
  }
  const entries = keys.map(k => ({ k, ts: Number(getTs(k)) || 0 }))
  entries.sort((a, b) => a.ts - b.ts)
  const removeCount = entries.length - cap
  if (removeCount <= 0) {
    return obj
  }
  const removeSet = new Set(entries.slice(0, removeCount).map(it => it.k))
  const next = {}
  keys.forEach(k => {
    if (!removeSet.has(k)) {
      next[k] = obj[k]
    }
  })
  return next
}

// 排序辅助函数
function brokenTorrentUriToMagnet (uri) {
  const text = `${uri || ''}`.trim()
  if (!text) {
    return EMPTY_STRING
  }
  const match = text.match(/^[a-zA-Z]:\/\/.*?([0-9a-fA-F]{40})\.torrent(?:[?#].*)?$/)
  if (!match || !match[1]) {
    return EMPTY_STRING
  }
  return `magnet:?xt=urn:btih:${match[1].toLowerCase()}`
}

function normalizeBtIpBanList (value) {
  const list = Array.isArray(value)
    ? value
    : `${value || ''}`.split(/[\n,;，；\s]+/g)
  const result = []
  const seen = new Set()
  list.forEach(item => {
    const text = `${item || ''}`.trim()
    if (!text || seen.has(text)) {
      return
    }
    seen.add(text)
    result.push(text)
  })
  return result
}

function sortTaskList (taskList, field, order) {
  return [...taskList].sort((a, b) => {
    let valueA, valueB

    switch (field) {
    case 'completedTime': {
      // 完成时间排序 - 使用savedAt字段作为完成时间
      valueA = parseInt(a.savedAt) || 0
      valueB = parseInt(b.savedAt) || 0
      // 如果都没有savedAt，按gid排序（作为创建顺序的近似）
      if (valueA === 0 && valueB === 0) {
        valueA = a.gid || ''
        valueB = b.gid || ''
      }
      break
    }
    case 'remainingTime': {
      // 剩余时间排序 - 计算剩余下载时间
      const getRemainingTime = (task) => {
        const totalLength = parseInt(task.totalLength) || 0
        const completedLength = parseInt(task.completedLength) || 0
        const downloadSpeed = parseInt(task.downloadSpeed) || 0

        if (totalLength <= 0 || completedLength >= totalLength) {
          return 0 // 已完成的任务
        }

        if (downloadSpeed <= 0) {
          return Infinity // 无法计算剩余时间的任务排在最后
        }

        const remaining = totalLength - completedLength
        return remaining / downloadSpeed // 剩余时间（秒）
      }
      valueA = getRemainingTime(a)
      valueB = getRemainingTime(b)
      break
    }
    case 'speed': {
      // 下载速度排序
      valueA = (parseInt(a.downloadSpeed) || 0) + (parseInt(a.uploadSpeed) || 0)
      valueB = (parseInt(b.downloadSpeed) || 0) + (parseInt(b.uploadSpeed) || 0)
      break
    }
    case 'size': {
      // 文件大小排序
      valueA = parseInt(a.totalLength) || 0
      valueB = parseInt(b.totalLength) || 0
      break
    }
    case 'name': {
      // 文件名排序 - 从files数组中获取文件名，或使用dir作为备选
      const getTaskName = (task) => {
        // 尝试从files数组获取第一个文件的路径
        if (task.files && task.files.length > 0 && task.files[0].path) {
          const filePath = task.files[0].path
          // 提取文件名（去掉路径）
          return filePath.split(/[\\/]/).pop().toLowerCase()
        }
        // 备选：使用目录名
        if (task.dir) {
          return task.dir.split(/[\\/]/).pop().toLowerCase()
        }
        // 最后备选：使用gid
        return task.gid || ''
      }
      valueA = getTaskName(a)
      valueB = getTaskName(b)
      break
    }
    default:
      return 0
    }

    // 处理字符串比较
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      return order === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA)
    }

    // 处理数值比较
    if (valueA < valueB) {
      return order === 'asc' ? -1 : 1
    } else if (valueA > valueB) {
      return order === 'asc' ? 1 : -1
    }
    return 0
  })
}

// 日期过滤辅助函数（供 fetchList 和侧边栏全量任务列表复用）
function applyDateFilter (data, filterDate) {
  if (!filterDate) return data
  const normalizeTimestamp = (value) => {
    const raw = parseInt(value)
    if (!Number.isFinite(raw) || raw <= 0) return 0
    if (raw < 1000000000000) return raw * 1000
    return raw
  }
  const [year, month, day] = filterDate.split('-').map(Number)
  return data.filter(task => {
    const status = `${task.status || ''}`
    const isInProgress = [TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED].includes(status)
    const timestamp = isInProgress
      ? (normalizeTimestamp(task.startTime) ||
         normalizeTimestamp(task.startedAt) ||
         normalizeTimestamp(task.createdAt) ||
         normalizeTimestamp(task.creationTime))
      : (normalizeTimestamp(task.savedAt) ||
         normalizeTimestamp(task.completedTime) ||
         normalizeTimestamp(task.stopTime) ||
         normalizeTimestamp(task.createdAt) ||
         normalizeTimestamp(task.creationTime))
    if (timestamp === 0) return false
    const taskDate = new Date(timestamp)
    return taskDate.getFullYear() === year &&
           (taskDate.getMonth() + 1) === month &&
           taskDate.getDate() === day
  })
}

// 文件类型分类后缀集合（与 TaskList.vue 保持一致）
const CATEGORY_SUFFIXES = {
  archives: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']),
  programs: new Set(['exe', 'msi', 'deb', 'rpm', 'dmg', 'apk', 'app']),
  videos: new Set([...VIDEO_SUFFIXES, ...SUB_SUFFIXES].map(s => `${s}`.toLowerCase().replace(/^\./, ''))),
  music: new Set(AUDIO_SUFFIXES.map(s => `${s}`.toLowerCase().replace(/^\./, ''))),
  images: new Set(IMAGE_SUFFIXES.map(s => `${s}`.toLowerCase().replace(/^\./, ''))),
  documents: new Set(DOCUMENT_SUFFIXES.map(s => `${s}`.toLowerCase().replace(/^\./, '')))
}

function getTaskFileExtensions (task, downloadingFileSuffix) {
  const files = (task && task.files) || []
  const suffix = downloadingFileSuffix || ''
  const result = []
  files.forEach((file) => {
    let name = getFileNameFromFile(file)
    if (suffix && name && name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length)
    }
    const ext = `${getFileExtension(name)}`.toLowerCase()
    if (ext) {
      result.push(ext)
    }
  })
  return result
}

function taskMatchesCategory (task, category, downloadingFileSuffix) {
  const suffixes = CATEGORY_SUFFIXES[category]
  if (!suffixes || suffixes.size === 0) {
    return false
  }
  const exts = getTaskFileExtensions(task, downloadingFileSuffix)
  return exts.some((ext) => suffixes.has(ext))
}

const state = {
  currentList: 'all',
  filterDate: null, // 添加日期过滤状态
  taskDetailVisible: false,
  currentTaskGid: EMPTY_STRING,
  enabledFetchPeers: false,
  currentTaskItem: null,
  currentTaskFiles: [],
  currentTaskPeers: [],
  seedingList: [],
  mergingList: [],
  mergeProgresses: {},
  mergeKeys: {},
  taskList: [],
  allTaskList: [], // 全部任务（不受 currentList 影响，已按日期过滤），用于侧边栏计数
  selectedGidList: [],
  magnetStatuses: {},
  pendingFileSelection: {},
  confirmedFileSelection: {},
  dataAccessStatuses: {},
  taskPriorities: {},
  taskSpeedSamples: {},
  taskSpeedSamplesTouchedAt: {},
  taskDisplayNames: {},
  taskDisplayNamesTouchedAt: {},
  taskPrioritiesTouchedAt: {},
  taskLinkUpdateHints: {},
  taskLinkUpdateHintsTouchedAt: {},
  searchKeyword: '',
  categoryFilter: '',
  sortField: 'name',
  sortOrder: 'asc',
  viewMode: 'list' // Will be loaded from preferences on initialization
}

const getters = {
  // 侧边栏任务数：受日期筛选（allTaskList 已在 fetchList 中过滤）和文件类型分类筛选影响
  filteredTaskCounts (state, getters, rootState) {
    const downloadingFileSuffix = (rootState.preference && rootState.preference.config && rootState.preference.config.downloadingFileSuffix) || ''
    const category = state.categoryFilter
    const list = !category
      ? state.allTaskList
      : state.allTaskList.filter((task) => taskMatchesCategory(task, category, downloadingFileSuffix))

    let active = 0
    let waiting = 0
    let stopped = 0
    list.forEach((task) => {
      const status = `${(task && task.status) || ''}`
      if (status === TASK_STATUS.ACTIVE) {
        active++
      } else if (status === TASK_STATUS.WAITING || status === TASK_STATUS.PAUSED) {
        waiting++
      } else if (status === TASK_STATUS.COMPLETE || status === TASK_STATUS.ERROR || status === TASK_STATUS.SEEDING || status === TASK_STATUS.MERGING) {
        stopped++
      }
    })
    return {
      all: active + waiting + stopped,
      active,
      waiting,
      stopped
    }
  },
  // 各文件类型分类的任务数量
  categoryCounts (state, getters, rootState) {
    const downloadingFileSuffix = (rootState.preference && rootState.preference.config && rootState.preference.config.downloadingFileSuffix) || ''
    const list = state.allTaskList
    const categories = ['', 'archives', 'programs', 'videos', 'music', 'images', 'documents']
    const counts = {}
    categories.forEach(cat => {
      if (!cat) {
        counts[''] = list.length
      } else {
        counts[cat] = list.filter(task => taskMatchesCategory(task, cat, downloadingFileSuffix)).length
      }
    })
    return counts
  }
}

const mutations = {
  UPDATE_SEEDING_LIST (state, seedingList) {
    state.seedingList = seedingList
  },
  UPDATE_MERGING_LIST (state, mergingList) {
    state.mergingList = mergingList
  },
  SET_TASK_STATUS (state, { gid, status }) {
    const task = state.taskList.find(t => t.gid === gid)
    if (task) {
      task.status = status
    }
    const allTask = state.allTaskList.find(t => t.gid === gid)
    if (allTask) {
      allTask.status = status
    }
  },
  SET_MERGE_PROGRESS (state, { gid, progress }) {
    state.mergeProgresses = { ...state.mergeProgresses, [gid]: progress }
  },
  CLEAR_MERGE_PROGRESS (state, gid) {
    const next = { ...state.mergeProgresses }
    delete next[gid]
    state.mergeProgresses = next
  },
  SET_MERGE_KEY (state, { gid, key }) {
    state.mergeKeys = { ...state.mergeKeys, [gid]: key }
  },
  DELETE_MERGE_KEYS_BY_KEY (state, key) {
    const next = {}
    for (const [gid, k] of Object.entries(state.mergeKeys)) {
      if (k !== key) next[gid] = k
    }
    state.mergeKeys = next
  },
  UPDATE_TASK_LIST (state, taskList) {
    const oldList = state.taskList
    const oldMap = new Map(oldList.map(t => [t.gid, t]))
    const newList = []
    // 数量变化（含清空场景）时必然需要更新数组，
    // 否则任务全部移除后旧卡片会残留显示
    let changed = oldList.length !== taskList.length

    taskList.forEach(newTask => {
      const oldTask = oldMap.get(newTask.gid)
      if (oldTask) {
        // Engine-derived transient hint fields must be cleared when absent
        // in latest payload, otherwise stale paused/checking/magnet text may stick.
        const clearedFields = {}
        ;['statusHint', 'statusRightText', 'engineStatus'].forEach((k) => {
          if (!Object.prototype.hasOwnProperty.call(newTask, k) && Object.prototype.hasOwnProperty.call(oldTask, k)) {
            clearedFields[k] = undefined
          }
        })

        // 创建新对象而不是修改旧对象，确保 Vue 能检测到变化
        // 这样可以确保进度等关键属性的更新能正确触发组件重新渲染
        const updatedTask = {
          ...oldTask,
          ...newTask,
          ...clearedFields
        }

        // 清理 undefined 字段
        Object.keys(clearedFields).forEach(k => {
          if (clearedFields[k] === undefined) {
            delete updatedTask[k]
          }
        })

        // 如果任务正在合并中，保持 merging 状态，不被 aria2 的 complete 状态覆盖
        if (state.mergingList.includes(newTask.gid) && updatedTask.status === TASK_STATUS.COMPLETE) {
          updatedTask.status = TASK_STATUS.MERGING
        }

        const oldKeys = Object.keys(oldTask)
        const updatedKeys = Object.keys(updatedTask)
        const unchanged = oldKeys.length === updatedKeys.length && updatedKeys.every(k => updatedTask[k] === oldTask[k])
        newList.push(unchanged ? oldTask : updatedTask)
        if (!unchanged) {
          changed = true
        }
      } else {
        newList.push(newTask)
        changed = true
      }
    })

    // 保留 mergingList 中的任务，即使它们不在新列表中（可能已从 aria2 删除但合并仍在进行）
    if (state.mergingList.length > 0) {
      const newGids = new Set(newList.map(t => t.gid))
      state.mergingList.forEach(gid => {
        if (!newGids.has(gid)) {
          const oldTask = oldMap.get(gid)
          if (oldTask) {
            newList.push({ ...oldTask, status: TASK_STATUS.MERGING })
            changed = true
          }
        }
      })
    }

    // 本轮无任何变化时不替换数组，避免任务列表组件与下游
    // getter 在每个轮询周期内无谓重算/重渲染
    if (changed) {
      // 直接替换整个数组，确保 Vue 能检测到变化
      // 使用 splice 方法清空并重新填充数组，这样可以保持数组引用不变
      // 同时触发 Vue 的响应式更新
      state.taskList.splice(0, state.taskList.length, ...newList)

      // 重新应用当前的排序（如果有的话）
      if (state.sortField && state.sortOrder && state.sortField !== 'name') {
        // 只有在非默认排序时才重新排序，避免不必要的排序操作
        const sortedList = sortTaskList(state.taskList, state.sortField, state.sortOrder)
        state.taskList.splice(0, state.taskList.length, ...sortedList)
      } else if (state.sortField === 'name' && state.sortOrder !== 'asc') {
        // 名称排序但非升序时也需要重新排序
        const sortedList = sortTaskList(state.taskList, state.sortField, state.sortOrder)
        state.taskList.splice(0, state.taskList.length, ...sortedList)
      }
    }
  },
  UPDATE_ALL_TASK_LIST (state, taskList) {
    const oldList = state.allTaskList
    const oldMap = new Map(oldList.map(t => [t.gid, t]))
    const newList = []
    let changed = oldList.length !== taskList.length
    taskList.forEach(newTask => {
      const oldTask = oldMap.get(newTask.gid)
      if (oldTask) {
        const oldKeys = Object.keys(oldTask)
        const updatedKeys = Object.keys(newTask)
        const unchanged = oldKeys.length === updatedKeys.length && updatedKeys.every(k => newTask[k] === oldTask[k])
        // 无变化的条目复用旧对象引用，避免触发子组件重渲染
        newList.push(unchanged ? oldTask : newTask)
        if (!unchanged) {
          changed = true
        }
      } else {
        newList.push(newTask)
        changed = true
      }
    })
    // 本轮无任何变化时不替换数组，避免侧边栏计数等 getter 与
    // 依赖 allTaskList 的组件在每个轮询周期内无谓重算/重渲染
    if (changed) {
      state.allTaskList.splice(0, state.allTaskList.length, ...newList)
    }
  },
  UPDATE_SELECTED_GID_LIST (state, gidList) {
    state.selectedGidList = gidList
  },
  CHANGE_CURRENT_LIST (state, currentList) {
    state.currentList = currentList
  },
  UPDATE_FILTER_DATE (state, date) {
    state.filterDate = date
  },
  CHANGE_TASK_DETAIL_VISIBLE (state, visible) {
    state.taskDetailVisible = visible
  },
  UPDATE_CURRENT_TASK_GID (state, gid) {
    state.currentTaskGid = gid
  },
  UPDATE_ENABLED_FETCH_PEERS (state, enabled) {
    state.enabledFetchPeers = enabled
  },
  UPDATE_CURRENT_TASK_ITEM (state, task) {
    state.currentTaskItem = task
  },
  UPDATE_CURRENT_TASK_FILES (state, files) {
    state.currentTaskFiles = files
  },
  UPDATE_CURRENT_TASK_PEERS (state, peers) {
    state.currentTaskPeers = peers
  },
  UPDATE_MAGNET_STATUS (state, payload) {
    const { gid, ...rest } = payload
    const now = Date.now()
    const nextRest = { ...rest }
    if (nextRest.updatedAt == null) {
      nextRest.updatedAt = now
    }
    const prev = state.magnetStatuses[gid] || {}
    // 高频调用：除 updatedAt 外无变化时短路，避免无谓重建对象
    const dataKeys = Object.keys(nextRest).filter(k => k !== 'updatedAt')
    if (dataKeys.length > 0 && dataKeys.every(k => prev[k] === nextRest[k])) {
      return
    }
    state.magnetStatuses = { ...state.magnetStatuses, [gid]: { ...prev, ...nextRest } }
  },
  CLEAR_MAGNET_STATUS (state, gid) {
    if (!(gid in state.magnetStatuses)) {
      return
    }
    const next = { ...state.magnetStatuses }
    delete next[gid]
    state.magnetStatuses = next
  },
  SET_PENDING_FILE_SELECTION (state, gid) {
    state.pendingFileSelection = { ...state.pendingFileSelection, [gid]: true }
    const confirmed = { ...state.confirmedFileSelection }
    delete confirmed[gid]
    state.confirmedFileSelection = confirmed
    pendingFileSelectionStore.add(gid)
    pendingFileSelectionStore.removeConfirmed(gid)
  },
  CLEAR_PENDING_FILE_SELECTION (state, gid) {
    const next = { ...state.pendingFileSelection }
    delete next[gid]
    state.pendingFileSelection = next
    pendingFileSelectionStore.remove(gid)
  },
  LOAD_PENDING_FILE_SELECTION (state, mapping) {
    state.pendingFileSelection = { ...(mapping || {}) }
    pendingFileSelectionStore.setAll(state.pendingFileSelection)
  },
  REPLACE_PENDING_FILE_SELECTION (state, mapping) {
    state.pendingFileSelection = { ...(mapping || {}) }
    pendingFileSelectionStore.setAll(state.pendingFileSelection)
  },
  LOAD_CONFIRMED_FILE_SELECTION (state, mapping) {
    state.confirmedFileSelection = { ...(mapping || {}) }
    pendingFileSelectionStore.setConfirmedAll(state.confirmedFileSelection)
  },
  CONFIRM_FILE_SELECTION (state, payload) {
    const gid = payload && typeof payload === 'object' ? payload.gid : payload
    const infoHash = payload && typeof payload === 'object' ? payload.infoHash : ''
    if (!gid) {
      return
    }
    state.confirmedFileSelection = { ...state.confirmedFileSelection, [gid]: infoHash || true }
    pendingFileSelectionStore.confirm(gid, infoHash || '')
  },
  UPDATE_DATA_ACCESS_STATUS (state, payload) {
    const { gid, ...rest } = payload
    const now = Date.now()
    const nextRest = { ...rest }
    if (nextRest.updatedAt == null) {
      nextRest.updatedAt = now
    }
    const prev = state.dataAccessStatuses[gid] || {}
    state.dataAccessStatuses = { ...state.dataAccessStatuses, [gid]: { ...prev, ...nextRest } }
  },
  CLEAR_DATA_ACCESS_STATUS (state, gid) {
    if (!(gid in state.dataAccessStatuses)) {
      return
    }
    const next = { ...state.dataAccessStatuses }
    delete next[gid]
    state.dataAccessStatuses = next
  },
  UPDATE_TASK_PRIORITIES (state, mapping) {
    const now = Date.now()
    const nextTouched = { ...(state.taskPrioritiesTouchedAt || {}) }
    Object.keys(mapping || {}).forEach(gid => {
      const k = normalizeGid(gid)
      if (k) {
        nextTouched[k] = now
      }
    })
    state.taskPriorities = { ...state.taskPriorities, ...mapping }
    state.taskPrioritiesTouchedAt = nextTouched
  },
  CLEAR_TASK_PRIORITY (state, gid) {
    if (!gid) {
      return
    }
    if (!state.taskPriorities[gid]) {
      return
    }
    const next = { ...state.taskPriorities }
    delete next[gid]
    state.taskPriorities = next

    const nextTouched = { ...(state.taskPrioritiesTouchedAt || {}) }
    delete nextTouched[gid]
    state.taskPrioritiesTouchedAt = nextTouched
  },
  UPDATE_TASK_SPEED_SAMPLES (state, payload) {
    const { gid, samples } = payload || {}
    if (!gid) {
      return
    }
    state.taskSpeedSamples = { ...state.taskSpeedSamples, [gid]: Array.isArray(samples) ? samples : [] }
    state.taskSpeedSamplesTouchedAt = { ...(state.taskSpeedSamplesTouchedAt || {}), [gid]: Date.now() }
  },
  ADD_TASK_SPEED_SAMPLE (state, payload) {
    const { gid, sample, maxSamples = 60 } = payload || {}
    if (!gid) {
      return
    }
    const prev = Array.isArray(state.taskSpeedSamples[gid]) ? state.taskSpeedSamples[gid] : []
    const next = [...prev, sample]
    const cap = Number(maxSamples) > 0 ? Number(maxSamples) : 60
    if (next.length > cap) {
      next.splice(0, next.length - cap)
    }
    state.taskSpeedSamples = { ...state.taskSpeedSamples, [gid]: next }
    state.taskSpeedSamplesTouchedAt = { ...(state.taskSpeedSamplesTouchedAt || {}), [gid]: Date.now() }
  },
  CLEAR_TASK_SPEED_SAMPLES (state, gid) {
    if (!gid) {
      return
    }
    if (!state.taskSpeedSamples[gid]) {
      return
    }
    const next = { ...state.taskSpeedSamples }
    delete next[gid]
    state.taskSpeedSamples = next

    const nextTouched = { ...(state.taskSpeedSamplesTouchedAt || {}) }
    delete nextTouched[gid]
    state.taskSpeedSamplesTouchedAt = nextTouched
  },
  UPDATE_TASK_DISPLAY_NAME (state, payload) {
    const { gid, name } = payload || {}
    if (!gid || !name) {
      return
    }
    if (state.taskDisplayNames[gid] === name) {
      return
    }
    state.taskDisplayNames = { ...state.taskDisplayNames, [gid]: name }
    state.taskDisplayNamesTouchedAt = { ...(state.taskDisplayNamesTouchedAt || {}), [gid]: Date.now() }
  },
  CLEAR_TASK_DISPLAY_NAME (state, gid) {
    if (!gid) {
      return
    }
    if (!state.taskDisplayNames[gid]) {
      return
    }
    const next = { ...state.taskDisplayNames }
    delete next[gid]
    state.taskDisplayNames = next

    const nextTouched = { ...(state.taskDisplayNamesTouchedAt || {}) }
    delete nextTouched[gid]
    state.taskDisplayNamesTouchedAt = nextTouched
  },
  CLEAR_TASK_CACHES_FOR_GIDS (state, gids) {
    const list = Array.isArray(gids) ? gids : []
    if (list.length === 0) {
      return
    }
    const gidSet = new Set(list.map(normalizeGid).filter(Boolean))

    const pruneBySet = (obj) => {
      const next = { ...(obj || {}) }
      gidSet.forEach(gid => {
        delete next[gid]
      })
      return next
    }

    state.magnetStatuses = pruneBySet(state.magnetStatuses)
    state.dataAccessStatuses = pruneBySet(state.dataAccessStatuses)
    state.taskSpeedSamples = pruneBySet(state.taskSpeedSamples)
    state.taskSpeedSamplesTouchedAt = pruneBySet(state.taskSpeedSamplesTouchedAt)
    state.taskDisplayNames = pruneBySet(state.taskDisplayNames)
    state.taskDisplayNamesTouchedAt = pruneBySet(state.taskDisplayNamesTouchedAt)
    state.taskPriorities = pruneBySet(state.taskPriorities)
    state.taskPrioritiesTouchedAt = pruneBySet(state.taskPrioritiesTouchedAt)
    state.taskLinkUpdateHints = pruneBySet(state.taskLinkUpdateHints)
    state.taskLinkUpdateHintsTouchedAt = pruneBySet(state.taskLinkUpdateHintsTouchedAt)
    state.pendingFileSelection = pruneBySet(state.pendingFileSelection)
    state.confirmedFileSelection = pruneBySet(state.confirmedFileSelection)
    pendingFileSelectionStore.setAll(state.pendingFileSelection)
    pendingFileSelectionStore.setConfirmedAll(state.confirmedFileSelection)
  },
  PRUNE_TASK_CACHES (state, payload) {
    const gids = Array.isArray(payload && payload.gids) ? payload.gids : []
    const keepGids = Array.isArray(payload && payload.keepGids) ? payload.keepGids : []
    const gidSet = new Set([...gids, ...keepGids].map(normalizeGid).filter(Boolean))

    state.magnetStatuses = pruneObjectByGidSet(state.magnetStatuses, gidSet)
    state.dataAccessStatuses = pruneObjectByGidSet(state.dataAccessStatuses, gidSet)
    state.taskSpeedSamples = pruneObjectByGidSet(state.taskSpeedSamples, gidSet)
    state.taskSpeedSamplesTouchedAt = pruneObjectByGidSet(state.taskSpeedSamplesTouchedAt, gidSet)
    state.taskDisplayNames = pruneObjectByGidSet(state.taskDisplayNames, gidSet)
    state.taskDisplayNamesTouchedAt = pruneObjectByGidSet(state.taskDisplayNamesTouchedAt, gidSet)
    state.taskPriorities = pruneObjectByGidSet(state.taskPriorities, gidSet)
    state.taskPrioritiesTouchedAt = pruneObjectByGidSet(state.taskPrioritiesTouchedAt, gidSet)

    state.magnetStatuses = capObjectByTimestamp(
      state.magnetStatuses,
      MAX_MAGNET_STATUS_GIDS,
      (gid) => (state.magnetStatuses && state.magnetStatuses[gid] && state.magnetStatuses[gid].updatedAt) || 0
    )
    state.dataAccessStatuses = capObjectByTimestamp(
      state.dataAccessStatuses,
      MAX_DATA_ACCESS_STATUS_GIDS,
      (gid) => (state.dataAccessStatuses && state.dataAccessStatuses[gid] && state.dataAccessStatuses[gid].updatedAt) || 0
    )

    const capByTouched = (map, touchedAt, cap) => {
      const cappedMap = capObjectByTimestamp(map, cap, (gid) => (touchedAt && touchedAt[gid]) || 0)
      const cappedKeys = new Set(Object.keys(cappedMap || {}))
      const cappedTouched = pruneObjectByGidSet(touchedAt || {}, cappedKeys)
      return { cappedMap, cappedTouched }
    }

    const speedCapped = capByTouched(state.taskSpeedSamples, state.taskSpeedSamplesTouchedAt, MAX_TASK_SPEED_SAMPLE_GIDS)
    state.taskSpeedSamples = speedCapped.cappedMap
    state.taskSpeedSamplesTouchedAt = speedCapped.cappedTouched

    const nameCapped = capByTouched(state.taskDisplayNames, state.taskDisplayNamesTouchedAt, MAX_TASK_DISPLAY_NAME_GIDS)
    state.taskDisplayNames = nameCapped.cappedMap
    state.taskDisplayNamesTouchedAt = nameCapped.cappedTouched

    const priorityCapped = capByTouched(state.taskPriorities, state.taskPrioritiesTouchedAt, MAX_TASK_PRIORITY_GIDS)
    state.taskPriorities = priorityCapped.cappedMap
    state.taskPrioritiesTouchedAt = priorityCapped.cappedTouched

    const linkHintCapped = capByTouched(state.taskLinkUpdateHints, state.taskLinkUpdateHintsTouchedAt, MAX_TASK_LINK_UPDATE_HINT_GIDS)
    state.taskLinkUpdateHints = linkHintCapped.cappedMap
    state.taskLinkUpdateHintsTouchedAt = linkHintCapped.cappedTouched
  },
  UPDATE_TASK_LINK_UPDATE_HINT (state, payload) {
    const gid = payload && payload.gid ? normalizeGid(payload.gid) : ''
    if (!gid) {
      return
    }
    const now = Date.now()
    const prev = (state.taskLinkUpdateHints && state.taskLinkUpdateHints[gid]) || {}
    const next = {
      ...prev,
      ...payload,
      gid,
      updatedAt: now
    }
    state.taskLinkUpdateHints = { ...(state.taskLinkUpdateHints || {}), [gid]: next }
    state.taskLinkUpdateHintsTouchedAt = { ...(state.taskLinkUpdateHintsTouchedAt || {}), [gid]: now }
  },
  CLEAR_TASK_LINK_UPDATE_HINT (state, gid) {
    const k = normalizeGid(gid)
    if (!k) {
      return
    }
    const next = { ...(state.taskLinkUpdateHints || {}) }
    delete next[k]
    state.taskLinkUpdateHints = next

    const nextTouched = { ...(state.taskLinkUpdateHintsTouchedAt || {}) }
    delete nextTouched[k]
    state.taskLinkUpdateHintsTouchedAt = nextTouched
  },
  UPDATE_TASK_SEARCH_KEYWORD (state, keyword) {
    state.searchKeyword = `${keyword || ''}`
  },
  UPDATE_CATEGORY_FILTER (state, filter) {
    state.categoryFilter = filter
  },
  UPDATE_VIEW_MODE (state, mode) {
    state.viewMode = mode
  },
  SORT_TASK_LIST (state, payload) {
    const { field, order } = payload || {}
    if (!field || !order) {
      return
    }

    // 更新排序状态
    state.sortField = field
    state.sortOrder = order

    const sortedList = sortTaskList(state.taskList, field, order)
    state.taskList = sortedList
  }
}

const actions = {
  markTaskNeedUpdateLink ({ commit }, payload) {
    const gid = payload && payload.gid ? `${payload.gid}` : ''
    if (!gid) {
      return
    }
    const httpStatus = payload && payload.httpStatus ? Number(payload.httpStatus) : 0
    const reason = payload && payload.reason ? `${payload.reason}` : ''
    const level = payload && payload.level ? `${payload.level}` : ''
    const errorCode = payload && payload.errorCode != null ? Number(payload.errorCode) : null
    const errorMessage = payload && payload.errorMessage ? `${payload.errorMessage}` : ''
    commit('UPDATE_TASK_LINK_UPDATE_HINT', {
      gid,
      httpStatus: Number.isFinite(httpStatus) ? httpStatus : 0,
      level,
      reason,
      errorCode,
      errorMessage
    })
  },
  clearTaskNeedUpdateLink ({ commit }, gid) {
    commit('CLEAR_TASK_LINK_UPDATE_HINT', gid)
  },
  initializeViewMode ({ commit }, config) {
    // Load saved view mode from preferences
    // config 中的键是 camelCase 格式
    const savedViewMode = config?.taskViewMode || 'list'
    commit('UPDATE_VIEW_MODE', savedViewMode)
  },
  initializeFilterDate ({ commit }, config) {
    const savedFilterDate = config && typeof config.taskFilterDate === 'string' ? config.taskFilterDate : null
    commit('UPDATE_FILTER_DATE', savedFilterDate)
  },
  setTaskDisplayName ({ commit }, payload) {
    commit('UPDATE_TASK_DISPLAY_NAME', payload)
  },
  clearTaskDisplayName ({ commit }, gid) {
    commit('CLEAR_TASK_DISPLAY_NAME', gid)
  },
  updateTaskSearchKeyword ({ commit }, keyword) {
    commit('UPDATE_TASK_SEARCH_KEYWORD', keyword)
  },
  updateCategoryFilter ({ commit }, filter) {
    commit('UPDATE_CATEGORY_FILTER', filter)
  },
  updateViewMode ({ commit, dispatch }, mode) {
    commit('UPDATE_VIEW_MODE', mode)
    // Save the view mode to preferences for persistence
    // 使用 camelCase 格式的键名，与其他设置保持一致
    dispatch('preference/save', { taskViewMode: mode }, { root: true })
  },
  sortTasks ({ commit }, payload) {
    commit('SORT_TASK_LIST', payload)
  },
  changeCurrentList ({ commit, dispatch }, currentList) {
    commit('CHANGE_CURRENT_LIST', currentList)
    commit('UPDATE_SELECTED_GID_LIST', [])
    dispatch('fetchList')
  },
  changeCurrentListWithDate ({ commit, dispatch }, { currentList, filterDate }) {
    commit('CHANGE_CURRENT_LIST', currentList)
    commit('UPDATE_FILTER_DATE', filterDate)
    commit('UPDATE_SELECTED_GID_LIST', [])
    dispatch('fetchList')
  },
  updateFilterDate ({ commit, dispatch }, date) {
    commit('UPDATE_FILTER_DATE', date)
    if (date) {
      dispatch('preference/save', { taskFilterDate: date }, { root: true })
    } else {
      dispatch('preference/save', { taskFilterDate: null }, { root: true })
    }
  },
  fetchList ({ commit, state, rootState }) {
    const params = { type: state.currentList }

    return api.fetchTaskList(params)
      .then((data) => {
        try {
          const now = Date.now()
          data.forEach(task => {
            const gid = task && task.gid ? `${task.gid}` : ''
            if (!gid) return
            // 检查是否为元数据任务 - 这些任务不应该保存到历史记录
            const taskName = task && task.name ? `${task.name}` : ''
            const isMetadataTask = taskName.startsWith('[METADATA]')
            if (isMetadataTask) return
            const status = `${task.status || ''}`
            if (![TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED].includes(status)) return
            const hasSavedAt = task.savedAt != null && Number(task.savedAt) > 0
            const hasCreatedAt = task.createdAt != null && Number(task.createdAt) > 0
            if (!hasSavedAt && !hasCreatedAt) {
              taskHistory.updateTask(gid, { createdAt: now }, task)
              task.createdAt = now
            }
          })
        } catch (e) {}

        // 应用日期过滤
        const filteredData = applyDateFilter(data, state.filterDate)

        commit('UPDATE_TASK_LIST', filteredData)

        const { selectedGidList } = state
        const gids = filteredData.map((task) => task.gid)
        const list = intersection(selectedGidList, gids)
        commit('UPDATE_SELECTED_GID_LIST', list)

        try {
          const saved = (rootState.preference && rootState.preference.config && rootState.preference.config.taskPriorities) || {}
          const mapping = {}
          filteredData.forEach(task => {
            const dir = task.dir || ''
            let base = ''
            try {
              const fp = task.files && task.files[0] && (task.files[0].path || '')
              base = fp ? fp.split(/[\\/]/).pop() : ''
            } catch (_) {}
            if (dir && base) {
              const key = `${dir}|${base}`
              if (saved[key] != null) {
                mapping[task.gid] = Number(saved[key]) || 0
              }
            }
          })
          if (Object.keys(mapping).length > 0) {
            commit('UPDATE_TASK_PRIORITIES', mapping)
          }
        } catch (e) {}

        commit('PRUNE_TASK_CACHES', { gids, keepGids: [state.currentTaskGid] })

        // 更新全量任务列表（用于侧边栏计数，不受 currentList 影响）
        if (state.currentList === 'all') {
          commit('UPDATE_ALL_TASK_LIST', filteredData)
        } else {
          api.fetchTaskList({ type: 'all' })
            .then((allData) => {
              const allFiltered = applyDateFilter(allData, state.filterDate)
              commit('UPDATE_ALL_TASK_LIST', allFiltered)
            })
            .catch(() => {})
        }
      })
  },
  updateDataAccessStatus ({ commit }, payload) {
    commit('UPDATE_DATA_ACCESS_STATUS', payload)
  },
  clearDataAccessStatus ({ commit }, gid) {
    commit('CLEAR_DATA_ACCESS_STATUS', gid)
  },
  selectTasks ({ commit }, list) {
    commit('UPDATE_SELECTED_GID_LIST', list)
  },
  selectAllTask ({ commit, state }) {
    const gids = state.taskList.map((task) => task.gid)
    commit('UPDATE_SELECTED_GID_LIST', gids)
  },
  fetchItem ({ dispatch }, gid) {
    return api.fetchTaskItem({ gid })
      .then((data) => {
        dispatch('updateCurrentTaskItem', data)
      })
  },
  fetchItemWithPeers ({ dispatch }, gid) {
    return api.fetchTaskItemWithPeers({ gid })
      .then((data) => {
        dispatch('updateCurrentTaskItem', data)
      })
  },
  showTaskDetailByGid ({ commit, dispatch, state }, gid) {
    // 首先尝试从本地任务列表中查找任务
    const localTask = state.taskList.find(task => task.gid === gid)
    if (localTask) {
      // 对于本地任务列表中的任务，直接使用本地数据，不再调用 API
      // 这包括历史记录任务，它们已经在本地任务列表中
      dispatch('updateCurrentTaskItem', localTask)
      commit('UPDATE_CURRENT_TASK_GID', localTask.gid)
      commit('CHANGE_TASK_DETAIL_VISIBLE', true)
      return
    }

    // 如果本地任务列表中没有，尝试从历史记录中获取
    return api.fetchStoppedTaskList()
      .then((stoppedTasks) => {
        const historyTask = stoppedTasks.find(task => task.gid === gid)
        if (historyTask) {
          dispatch('updateCurrentTaskItem', historyTask)
          commit('UPDATE_CURRENT_TASK_GID', historyTask.gid)
          commit('CHANGE_TASK_DETAIL_VISIBLE', true)
        } else {
          // 只有在本地和历史记录中都找不到任务时，才尝试从 aria2 引擎获取
          console.log('[LinkCore] Task not found in local list or history, try to get from engine:', gid)
          return api.fetchTaskItem({ gid })
            .then((task) => {
              dispatch('updateCurrentTaskItem', task)
              commit('UPDATE_CURRENT_TASK_GID', task.gid)
              commit('CHANGE_TASK_DETAIL_VISIBLE', true)
            })
            .catch((error) => {
              console.error('[LinkCore] Task not found in engine:', error.message)
              // 可以添加一个错误提示给用户
            })
        }
      })
      .catch((err) => {
        console.error('[LinkCore] fetch stopped task list fail:', err)
        // 可以添加一个错误提示给用户
      })
  },
  showTaskDetail ({ commit, dispatch }, task) {
    dispatch('updateCurrentTaskItem', task)
    commit('UPDATE_CURRENT_TASK_GID', task.gid)
    commit('CHANGE_TASK_DETAIL_VISIBLE', true)
  },
  hideTaskDetail ({ commit }) {
    commit('CHANGE_TASK_DETAIL_VISIBLE', false)
  },
  toggleEnabledFetchPeers ({ commit }, enabled) {
    commit('UPDATE_ENABLED_FETCH_PEERS', enabled)
  },
  updateCurrentTaskItem ({ commit }, task) {
    commit('UPDATE_CURRENT_TASK_ITEM', task)
    if (task) {
      commit('UPDATE_CURRENT_TASK_FILES', task.files)
      commit('UPDATE_CURRENT_TASK_PEERS', task.peers)
    } else {
      commit('UPDATE_CURRENT_TASK_FILES', [])
      commit('UPDATE_CURRENT_TASK_PEERS', [])
    }
  },
  updateCurrentTaskGid ({ commit }, gid) {
    commit('UPDATE_CURRENT_TASK_GID', gid)
  },
  updateTaskSpeedSamples ({ commit }, payload) {
    commit('UPDATE_TASK_SPEED_SAMPLES', payload)
  },
  addTaskSpeedSample ({ commit }, payload) {
    commit('ADD_TASK_SPEED_SAMPLE', payload)
  },
  resetTaskSpeedSamples ({ commit }, gid) {
    commit('CLEAR_TASK_SPEED_SAMPLES', gid)
  },
  addUri ({ commit, dispatch, rootState }, data) {
    const { uris, outs, options, optionsList, dirs, priorities } = data

    // Handle downloading file suffix
    const config = rootState.preference.config || {}
    const suffix = config.downloadingFileSuffix

    // GitHub 镜像配置：尊重用户显式设置的 useGithubMirror 开关，
    // 若未显式设置则由镜像列表是否非空推断（保持向后兼容）。
    // 之前直接用 length 推断会忽略用户"配置镜像但暂时禁用"的意图。
    const githubMirrorUrls = config.githubMirrorUrls || config['github-mirror-urls'] || []
    const useGithubMirror = config.useGithubMirror !== undefined
      ? !!config.useGithubMirror
      : githubMirrorUrls.length > 0

    const normalizedOptions = options ? { ...options } : {}

    // 处理 URI，应用 GitHub 镜像转换
    // 对于 GitHub URL，返回包含所有镜像的数组，让 aria2 自动进行故障转移
    let hasMultipleMirrors = false
    const normalizedUris = Array.isArray(uris)
      ? uris.map((uri) => {
        const magnet = brokenTorrentUriToMagnet(uri)
        const finalUri = magnet || uri

        // 如果是 GitHub URL 且启用了镜像，返回镜像 URL 数组
        if (isGithubUrl(finalUri)) {
          const mirrorUrls = getGithubUrlsWithMirrors(finalUri, githubMirrorUrls, useGithubMirror)
          // 如果有多个镜像 URL，标记需要启用多镜像并发
          if (mirrorUrls.length > 1) {
            hasMultipleMirrors = true
          }
          // 返回所有镜像 URL 数组，aria2 会自动尝试所有源
          return mirrorUrls.length > 0 ? mirrorUrls : [finalUri]
        }

        // 非 GitHub URL 返回单个 URL 的数组
        return [finalUri]
      })
      : uris

    // 如果检测到有多个镜像，自动启用多镜像并发下载
    if (hasMultipleMirrors && !normalizedOptions['uri-selector']) {
      normalizedOptions['uri-selector'] = 'multimirror'

      // 确保有足够的总连接数
      if (!normalizedOptions.split || normalizedOptions.split < 8) {
        normalizedOptions.split = 16
      }

      // 每个服务器的最大连接数受用户配置的 engineMaxConnectionPerServer 上限约束，
      // 避免单任务突破用户全局连接数限制。默认按 split 的一半设置。
      const userMaxPerServer = Number(config.engineMaxConnectionPerServer) || 0
      const splitValue = normalizedOptions.split || 16
      let maxPerServer = Math.max(4, Math.floor(splitValue / 2))
      if (userMaxPerServer > 0 && maxPerServer > userMaxPerServer) {
        maxPerServer = userMaxPerServer
      }
      if (!normalizedOptions['max-connection-per-server'] || normalizedOptions['max-connection-per-server'] < maxPerServer) {
        normalizedOptions['max-connection-per-server'] = maxPerServer
      }

      // 设置最小分段大小，与引擎全局默认一致（4M 兼顾分片数与请求开销，
      // 过小的分片在高带宽下会因 HTTP Range 请求往返开销导致利用率下降）
      if (!normalizedOptions['min-split-size']) {
        normalizedOptions['min-split-size'] = '4M'
      }
    }

    const isMagnetLikeUri = (uri) => {
      // uri 可能是字符串或数组（GitHub 镜像情况）
      const uriStr = Array.isArray(uri) ? uri[0] : uri
      return /^magnet:/i.test(`${uriStr || ''}`.trim())
    }
    const hasMagnetUri = Array.isArray(normalizedUris) && normalizedUris.some(uri => isMagnetLikeUri(uri))
    if (hasMagnetUri) {
      if (typeof normalizedOptions.allowOverwrite === 'undefined') {
        normalizedOptions.allowOverwrite = true
      }
      if (typeof normalizedOptions.autoFileRenaming === 'undefined') {
        normalizedOptions.autoFileRenaming = false
      }
      if (typeof normalizedOptions.btHashCheckSeed === 'undefined') {
        normalizedOptions.btHashCheckSeed = true
      }
      if (typeof normalizedOptions.btSeedUnverified === 'undefined') {
        normalizedOptions.btSeedUnverified = true
      }
    }
    const safeGetNameFromUri = (uri) => {
      try {
        // uri 可能是字符串或数组（GitHub 镜像情况）
        const uriStr = Array.isArray(uri) ? uri[0] : uri
        return getFileNameFromFile({ uris: [{ uri: uriStr }] })
      } catch (_) {
        return ''
      }
    }

    // 辅助函数：为文件名添加正确位置的序号
    const addDuplicateNumber = (filename, num) => {
      const lastDotIndex = filename.lastIndexOf('.')
      if (lastDotIndex > 0) {
        const name = filename.substring(0, lastDotIndex)
        const ext = filename.substring(lastDotIndex)
        return `${name} (${num})${ext}`
      }
      return `${filename} (${num})`
    }

    // 辅助函数：检查文件是否存在并生成唯一文件名
    const getUniqueFilename = (dir, filename, downloadingSuffix) => {
      if (!dir || !filename) return filename

      try {
        const { existsSync } = require('node:fs')
        const { join } = require('node:path')

        // 检查带后缀的文件名
        const filenameWithSuffix = downloadingSuffix ? `${filename}${downloadingSuffix}` : filename
        const targetPath = join(dir, filenameWithSuffix)

        // 也检查不带后缀的文件名（可能已经下载完成）
        const targetPathWithoutSuffix = join(dir, filename)

        if (!existsSync(targetPath) && !existsSync(targetPathWithoutSuffix)) {
          return filename // 文件不存在，使用原始文件名
        }

        // 文件存在，需要添加序号
        let num = 1
        while (num < 1000) { // 防止无限循环
          const newFilename = addDuplicateNumber(filename, num)
          const newFilenameWithSuffix = downloadingSuffix ? `${newFilename}${downloadingSuffix}` : newFilename
          const newPath = join(dir, newFilenameWithSuffix)
          const newPathWithoutSuffix = join(dir, newFilename)

          if (!existsSync(newPath) && !existsSync(newPathWithoutSuffix)) {
            return newFilename
          }
          num++
        }

        return filename // 如果找不到唯一名称，返回原始名称
      } catch (e) {
        console.warn('[LinkCore] getUniqueFilename error:', e.message)
        return filename
      }
    }

    const hasOuts = Array.isArray(outs) && outs.length > 0
    const hasSingleOptionOut = !!(Array.isArray(normalizedUris) && normalizedUris.length === 1 && normalizedOptions && typeof normalizedOptions.out === 'string' && normalizedOptions.out.trim() !== '')

    // 获取默认下载目录
    const defaultDir = (options && options.dir) || config.dir || ''

    if (hasSingleOptionOut && Array.isArray(normalizedUris) && normalizedUris.length === 1 && isMagnetLikeUri(normalizedUris[0])) {
      delete normalizedOptions.out
    } else if (suffix && hasSingleOptionOut) {
      const onlyUri = normalizedUris[0]
      if (onlyUri && !isMagnetLikeUri(onlyUri) && !normalizedOptions.out.endsWith(suffix)) {
        // 检查文件是否存在，如果存在则添加序号
        const dir = Array.isArray(dirs) && dirs[0] ? dirs[0] : defaultDir
        const uniqueFilename = getUniqueFilename(dir, normalizedOptions.out, suffix)
        normalizedOptions.out = `${uniqueFilename}${suffix}`
      }
    } else if (!suffix && hasSingleOptionOut) {
      const onlyUri = normalizedUris[0]
      if (onlyUri && !isMagnetLikeUri(onlyUri)) {
        const dir = Array.isArray(dirs) && dirs[0] ? dirs[0] : defaultDir
        const uniqueFilename = getUniqueFilename(dir, normalizedOptions.out, '')
        normalizedOptions.out = uniqueFilename
      }
    }

    const shouldDeriveOuts = !!(Array.isArray(normalizedUris) && normalizedUris.length > 0 && !hasOuts && !hasSingleOptionOut)
    const baseOuts = shouldDeriveOuts
      ? normalizedUris.map((uri) => {
        if (!uri || isMagnetLikeUri(uri)) {
          return null
        }
        // uri may be an array (GitHub mirrors) or a string (single URL)
        // Extract the first URL for name extraction to avoid turning the
        // array into a comma-separated string which breaks getFileNameFromFile.
        const firstUri = Array.isArray(uri) ? uri[0] : uri
        const name = safeGetNameFromUri(firstUri)
        return name || null
      })
      : outs

    let newOuts = baseOuts

    if (suffix && Array.isArray(baseOuts)) {
      newOuts = baseOuts.map((out, index) => {
        const uri = normalizedUris[index]
        // Only append suffix if out is present and uri is not a magnet link
        if (out && uri && !isMagnetLikeUri(uri)) {
          if (!out.endsWith(suffix)) {
            // 检查文件是否存在，如果存在则添加序号
            const dir = Array.isArray(dirs) && dirs[index] ? dirs[index] : defaultDir
            const uniqueFilename = getUniqueFilename(dir, out, suffix)
            return uniqueFilename + suffix
          }
        }
        return out
      })
    } else if (!suffix && shouldDeriveOuts && Array.isArray(baseOuts)) {
      newOuts = baseOuts.map((out, index) => {
        const uri = normalizedUris[index]
        if (out && uri && !isMagnetLikeUri(uri)) {
          const dir = Array.isArray(dirs) && dirs[index] ? dirs[index] : defaultDir
          const uniqueFilename = getUniqueFilename(dir, out, '')
          return uniqueFilename === out ? null : uniqueFilename
        }
        return out
      })
    }

    if (Array.isArray(newOuts) && Array.isArray(normalizedUris) && normalizedUris.length > 0) {
      newOuts = newOuts.map((out, index) => {
        const uri = normalizedUris[index]
        if (!isMagnetLikeUri(uri)) {
          return out
        }
        const text = `${out || ''}`.trim().toLowerCase()
        if (!text || text === 'magnet:' || text === 'magnet:?') {
          return null
        }
        return out
      })
    }

    return api.addUri({ uris: normalizedUris, outs: newOuts, options: normalizedOptions, optionsList, dirs })
      .then((res) => {
        if (Array.isArray(res)) {
          const gids = res.map(r => r && r[0]).filter(Boolean)
          const hasBrowserExtensionHeader = (opt) => {
            try {
              const o = opt && typeof opt === 'object' ? opt : {}
              const hs = o && o.header ? o.header : []
              const headers = Array.isArray(hs) ? hs : (typeof hs === 'string' ? [hs] : [])
              return headers.some(h => /X-LinkCore-Source\s*:\s*BrowserExtension/i.test(`${h}`))
            } catch (_) {
              return false
            }
          }
          const fromBrowserExtension =
            hasBrowserExtensionHeader(normalizedOptions) ||
            (Array.isArray(optionsList) && optionsList.some(o => hasBrowserExtensionHeader(o)))
          try {
            const now = Date.now()
            gids.forEach(gid => {
              const patch = fromBrowserExtension ? { createdAt: now, fromBrowserExtension: true } : { createdAt: now }
              taskHistory.updateTask(`${gid}`, patch, null)
            })
          } catch (e) {}
          if (Array.isArray(priorities) && priorities.length === gids.length) {
            const mapping = {}
            for (let i = 0; i < gids.length; i++) {
              mapping[gids[i]] = Number(priorities[i]) || 0
            }
            commit('UPDATE_TASK_PRIORITIES', mapping)

            try {
              const existing = (rootState.preference && rootState.preference.config && rootState.preference.config.taskPriorities) || {}
              const persist = { ...existing }
              for (let i = 0; i < gids.length; i++) {
                const dir = Array.isArray(dirs) && dirs[i] ? dirs[i] : (options && options.dir) || (rootState.preference && rootState.preference.config && rootState.preference.config.dir) || ''
                const out = Array.isArray(baseOuts) && baseOuts[i] ? baseOuts[i] : ''
                if (dir && out) {
                  const key = `${dir}|${out}`
                  persist[key] = Number(priorities[i]) || 0
                }
              }
              dispatch('preference/save', { taskPriorities: persist }, { root: true })
              // 延迟通知优先级管理器重新平衡资源，确保配置已保存
              setTimeout(() => {
                try {
                  api.rebalancePriority()
                } catch (e) {}
              }, 500)
            } catch (e) {}
          }
          const preferenceConfig = (rootState.preference && rootState.preference.config) || {}
          const autoOpenTaskProgressWindow = preferenceConfig.autoOpenTaskProgressWindow !== false
          if (autoOpenTaskProgressWindow && gids.length > 0) {
            try {
              const commandsInstance = require('@/components/CommandManager/instance').commands
              const gid = `${gids[0]}`
              commandsInstance.emit('task-progress:auto-open', { gid })
            } catch (e) {}
          }
        }
        dispatch('fetchList')
        dispatch('app/updateAddTaskOptions', {}, { root: true })
      })
  },
  addTorrent ({ dispatch }, data) {
    const { torrent, options } = data
    const normalizedOptions = options ? { ...options } : {}
    if (typeof normalizedOptions.allowOverwrite === 'undefined') {
      normalizedOptions.allowOverwrite = true
    }
    if (typeof normalizedOptions.autoFileRenaming === 'undefined') {
      normalizedOptions.autoFileRenaming = false
    }
    if (typeof normalizedOptions.btHashCheckSeed === 'undefined') {
      normalizedOptions.btHashCheckSeed = true
    }
    if (typeof normalizedOptions.btSeedUnverified === 'undefined') {
      normalizedOptions.btSeedUnverified = true
    }
    return api.addTorrent({ torrent, options: normalizedOptions })
      .then((gid) => {
        try {
          if (gid) {
            taskHistory.updateTask(`${gid}`, { createdAt: Date.now() }, null)
          }
        } catch (e) {}
        dispatch('fetchList')
        dispatch('app/updateAddTaskOptions', {}, { root: true })
      })
  },
  addMetalink ({ dispatch }, data) {
    const { metalink, options } = data
    return api.addMetalink({ metalink, options })
      .then((gid) => {
        try {
          if (gid) {
            taskHistory.updateTask(`${gid}`, { createdAt: Date.now() }, null)
          }
        } catch (e) {}
        dispatch('fetchList')
        dispatch('app/updateAddTaskOptions', {}, { root: true })
      })
  },
  getTaskOption (_, gid) {
    return api.getOption({ gid })
  },
  changeTaskOption (_, payload) {
    const { gid, options } = payload
    return api.changeOption({ gid, options })
  },
  removeTask ({ state, dispatch, commit }, task) {
    const { gid } = task
    if (gid === state.currentTaskGid) {
      dispatch('hideTaskDetail')
    }

    return api.removeTask({ gid })
      .finally(() => {
        commit('CLEAR_TASK_CACHES_FOR_GIDS', [gid])
        dispatch('fetchList')
        dispatch('app/fetchGlobalStat', null, { root: true })
        dispatch('saveSession')
      })
  },
  forcePauseTask ({ dispatch }, task) {
    const { gid, status } = task
    if (status !== TASK_STATUS.ACTIVE) {
      return Promise.resolve(true)
    }

    return api.forcePauseTask({ gid })
      .catch((e) => {
        // 任务可能处于无法暂停的状态（如已完成、正在完成、已被移除等）。
        // 调用方均为删除流程，暂停失败不应阻塞后续的任务移除操作。
        console.warn('[LinkCore] forcePauseTask failed, continuing with removal:', e && e.message)
      })
      .finally(() => {
        dispatch('fetchList')
        dispatch('saveSession')
      })
  },
  pauseTask ({ dispatch }, task) {
    const { gid, status } = task
    if (status !== TASK_STATUS.ACTIVE) {
      return Promise.resolve(true)
    }
    const isBT = checkTaskIsBT(task)
    // BT任务使用强制暂停以加快暂停速度
    // 普通HTTP/FTP任务使用普通暂停
    const promise = isBT ? api.forcePauseTask({ gid }) : api.pauseTask({ gid })
    return promise
      .finally(() => {
        dispatch('app/resetInterval', null, { root: true })
        dispatch('fetchList')
        dispatch('saveSession')
      })
  },
  resumeTask ({ dispatch }, task) {
    const { gid, status } = task
    if (status === TASK_STATUS.WAITING) {
      return Promise.resolve(true)
    }
    if (status !== TASK_STATUS.PAUSED) {
      return Promise.resolve(true)
    }
    const repairBtBrokenUri = async () => {
      try {
        const snapshot = await api.fetchTaskItem({ gid })
        const files = Array.isArray(snapshot && snapshot.files) ? snapshot.files : []
        for (let i = 0; i < files.length; i++) {
          const file = files[i] || {}
          const uris = Array.isArray(file.uris) ? file.uris : []
          const brokenUris = uris
            .map((u) => (u && u.uri ? `${u.uri}` : EMPTY_STRING))
            .filter((u) => !!brokenTorrentUriToMagnet(u))
          if (brokenUris.length === 0) {
            continue
          }

          let magnet = getTaskUri(snapshot)
          if (!/^magnet:/i.test(`${magnet || ''}`)) {
            magnet = brokenTorrentUriToMagnet(brokenUris[0])
          }
          if (!/^magnet:/i.test(`${magnet || ''}`)) {
            continue
          }

          await api.changeUri({
            gid,
            fileIndex: i + 1,
            delUris: brokenUris,
            addUris: [magnet]
          })
        }
      } catch (_) {}
    }
    const ensureBtResumeOptions = async () => {
      if (!checkTaskIsBT(task)) {
        return
      }
      try {
        const option = await dispatch('getTaskOption', gid)
        const out = option && option.out ? `${option.out}`.trim() : ''
        if (!/^magnet:/i.test(out)) {
          return
        }
        const btName = task && task.bittorrent && task.bittorrent.info && task.bittorrent.info.name
          ? `${task.bittorrent.info.name}`.trim()
          : ''
        const taskName = task && task.name ? `${task.name}`.trim() : ''
        const infoHash = task && task.infoHash ? `${task.infoHash}`.trim() : ''
        const fallbackOut = btName || (/^magnet:/i.test(taskName) ? '' : taskName) || (infoHash ? `${infoHash}.torrent` : '')
        if (!fallbackOut) {
          return
        }
        await dispatch('changeTaskOption', {
          gid,
          options: { out: fallbackOut }
        })
      } catch (_) {}
    }
    return repairBtBrokenUri()
      .then(() => ensureBtResumeOptions())
      .then(() => api.resumeTask({ gid }))
      .finally(() => {
        dispatch('app/resetInterval', null, { root: true })
        dispatch('fetchList')
        dispatch('saveSession')
      })
  },
  pauseAllTask ({ dispatch }) {
    // 与单个 BT 任务暂停策略一致：优先使用 forcePauseAll。
    // 普通 pauseAll 对 BT 任务是软停止（等 peer/tracker 命令自然退出），
    // 用户会感觉"全部暂停很久才生效"。
    return api.forcePauseAllTask()
      .catch(() => {
        return api.pauseAllTask()
      })
      .then(() => {
        // 立即获取任务列表和全局统计以加快UI更新
        return Promise.all([
          dispatch('fetchList').catch(err => {
            console.error('[LinkCore] pauseAllTask: fetchList failed', err)
          }),
          dispatch('app/fetchGlobalStat', {}, { root: true }).catch(err => {
            console.error('[LinkCore] pauseAllTask: fetchGlobalStat failed', err)
          })
        ])
      })
      .finally(() => {
        dispatch('saveSession')
      })
  },
  resumeAllTask ({ dispatch }) {
    return api.resumeAllTask()
      .then(() => {
        // 立即获取任务列表和全局统计以加快UI更新
        return Promise.all([
          dispatch('fetchList').catch(err => {
            console.error('[LinkCore] resumeAllTask: fetchList failed', err)
          }),
          dispatch('app/fetchGlobalStat', {}, { root: true }).catch(err => {
            console.error('[LinkCore] resumeAllTask: fetchGlobalStat failed', err)
          })
        ])
      })
      .finally(() => {
        dispatch('saveSession')
      })
  },
  updateMagnetStatus ({ commit }, payload) {
    commit('UPDATE_MAGNET_STATUS', payload)
  },
  clearMagnetStatus ({ commit }, gid) {
    commit('CLEAR_MAGNET_STATUS', gid)
  },
  setPendingFileSelection ({ commit }, gid) {
    commit('SET_PENDING_FILE_SELECTION', gid)
  },
  clearPendingFileSelection ({ commit }, gid) {
    commit('CLEAR_PENDING_FILE_SELECTION', gid)
  },
  loadPendingFileSelection ({ commit }) {
    const mapping = pendingFileSelectionStore.getAll()
    commit('LOAD_PENDING_FILE_SELECTION', mapping)
    commit('LOAD_CONFIRMED_FILE_SELECTION', pendingFileSelectionStore.getConfirmedAll())
  },
  confirmFileSelection ({ commit }, payload) {
    commit('CONFIRM_FILE_SELECTION', payload)
  },
  syncPendingFileSelection ({ commit, state }, tasks) {
    // 根据当前任务列表校验待选择文件状态:
    // - pending(待选择): 仅保留仍为暂停状态的多文件 BT 任务，且未被用户确认过
    // - confirmed(已确认选择): 只要任务仍存在（任意状态）就保留。
    //   旧逻辑在任务非暂停（如下载中/重启后元数据重解析中）时会丢弃 confirmed，
    //   导致重启后任务被重新标记回"待选择文件"。
    const list = Array.isArray(tasks) ? tasks : []
    const existingGids = new Set()
    const validPendingGids = new Set()
    list.forEach(task => {
      const gid = task && task.gid ? `${task.gid}` : ''
      if (!gid) return
      existingGids.add(gid)
      const status = `${task.status || ''}`
      if (status !== TASK_STATUS.PAUSED) return
      const bt = task.bittorrent
      if (!bt || !bt.info) return
      const files = Array.isArray(task.files) ? task.files : []
      if (files.length > 1) {
        validPendingGids.add(gid)
      }
    })
    const current = state.pendingFileSelection || {}
    const confirmed = state.confirmedFileSelection || {}
    // 用 infoHash 判断已确认（磁力 follow 后 gid 可能漂移，哈希稳定）
    const confirmedHashes = new Set(
      Object.values(confirmed)
        .filter(v => typeof v === 'string')
        .map(v => v.trim().toLowerCase())
    )
    const next = {}
    const nextConfirmed = {}
    Object.keys(current).forEach(gid => {
      const task = list.find(t => `${t.gid || ''}` === gid)
      const bt = task && task.bittorrent
      const hash = task ? String(task.infoHash || (bt && bt.info && bt.info.hash) || '').trim().toLowerCase() : ''
      if (validPendingGids.has(gid) && !confirmed[gid] && !(hash && confirmedHashes.has(hash))) {
        next[gid] = true
      }
    })
    Object.keys(confirmed).forEach(gid => {
      if (existingGids.has(gid)) {
        nextConfirmed[gid] = confirmed[gid]
        return
      }
      const v = confirmed[gid]
      if (typeof v === 'string' && v.trim()) {
        // 磁力任务的 BT 阶段 gid 每次重启都会漂移：会话文件保存的是
        // 磁力 URI 与元数据任务的 gid，重启后重新 follow 会生成新 gid。
        // 已确认记录按 infoHash 改挂到当前同哈希任务上；若磁力尚未
        // 解析完成（列表中暂时没有对应任务），保留原条目等待匹配，
        // 绝不能直接丢弃——否则重启后任务会退回"待选择文件"状态。
        const hash = v.trim().toLowerCase()
        const target = list.find(t => String(
          (t && (t.infoHash || (t.bittorrent && t.bittorrent.info && t.bittorrent.info.hash))) || ''
        ).trim().toLowerCase() === hash)
        if (target && target.gid) {
          nextConfirmed[`${target.gid}`] = v
        } else {
          nextConfirmed[gid] = v
        }
      }
      // 值为 true 的旧格式条目且任务已不存在 → 自然丢弃
    })
    if (Object.keys(next).length !== Object.keys(current).length) {
      commit('REPLACE_PENDING_FILE_SELECTION', next)
    }
    const confirmedChanged =
      Object.keys(nextConfirmed).length !== Object.keys(confirmed).length ||
      Object.keys(nextConfirmed).some(k => nextConfirmed[k] !== confirmed[k])
    if (confirmedChanged) {
      commit('LOAD_CONFIRMED_FILE_SELECTION', nextConfirmed)
    }
  },
  addToSeedingList ({ state, commit }, gid) {
    const { seedingList } = state
    if (seedingList.includes(gid)) {
      return
    }

    const list = [
      ...seedingList,
      gid
    ]
    commit('UPDATE_SEEDING_LIST', list)
  },
  removeFromSeedingList ({ state, commit }, gid) {
    const { seedingList } = state
    const idx = seedingList.indexOf(gid)
    if (idx === -1) {
      return
    }

    const list = [...seedingList.slice(0, idx), ...seedingList.slice(idx + 1)]
    commit('UPDATE_SEEDING_LIST', list)
  },
  addToMergingList ({ state, commit }, { gid, mergeKey = '' }) {
    const { mergingList } = state
    if (mergingList.includes(gid)) {
      if (mergeKey) commit('SET_MERGE_KEY', { gid, key: mergeKey })
      return
    }

    const list = [
      ...mergingList,
      gid
    ]
    commit('UPDATE_MERGING_LIST', list)
    if (mergeKey) commit('SET_MERGE_KEY', { gid, key: mergeKey })
  },
  removeFromMergingList ({ state, commit }, gid) {
    const { mergingList } = state
    const idx = mergingList.indexOf(gid)
    if (idx === -1) {
      return
    }

    const list = [...mergingList.slice(0, idx), ...mergingList.slice(idx + 1)]
    commit('UPDATE_MERGING_LIST', list)
  },
  setTaskStatus ({ commit }, payload) {
    commit('SET_TASK_STATUS', payload)
  },
  setMergeProgress ({ commit }, payload) {
    commit('SET_MERGE_PROGRESS', payload)
  },
  removeAllMergingByMergeKey ({ state, commit }, key) {
    if (!key) return
    const gidsToRemove = []
    for (const [gid, k] of Object.entries(state.mergeKeys || {})) {
      if (k === key) gidsToRemove.push(gid)
    }
    if (gidsToRemove.length === 0) return
    const list = state.mergingList.filter(gid => !gidsToRemove.includes(gid))
    commit('UPDATE_MERGING_LIST', list)
    commit('DELETE_MERGE_KEYS_BY_KEY', key)
    gidsToRemove.forEach(gid => {
      commit('CLEAR_MERGE_PROGRESS', gid)
    })
  },
  clearMergeProgress ({ commit }, gid) {
    commit('CLEAR_MERGE_PROGRESS', gid)
  },
  clearMergeProgressByMergeKey ({ state, commit }, key) {
    if (!key) return
    for (const [gid, k] of Object.entries(state.mergeKeys || {})) {
      if (k === key) {
        commit('CLEAR_MERGE_PROGRESS', gid)
      }
    }
  },
  stopSeeding ({ dispatch, rootState }, { gid }) {
    const config = (rootState.preference && rootState.preference.config) || {}
    const action = `${config.stopSeedingAction || 'pause'}`.trim().toLowerCase()
    const shouldComplete = action === 'complete'

    const promise = shouldComplete
      ? dispatch('changeTaskOption', {
        gid,
        options: { seedTime: 0 }
      })
      : api.forcePauseTask({ gid }).catch(() => api.pauseTask({ gid }))

    return promise.then(() => {
      dispatch('fetchList')
      dispatch('saveSession')
    })
  },
  async banPeer ({ dispatch, rootState }, { gid, ip, duration }) {
    await api.banPeer({ gid, ip, duration })

    const ipText = `${ip || ''}`.trim()
    const durationNum = Number(duration)
    if (!ipText || durationNum !== -1) {
      return
    }

    try {
      const config = (rootState.preference && rootState.preference.config) || {}
      const currentList = normalizeBtIpBanList(config.btIpBanList)
      if (!currentList.includes(ipText)) {
        await dispatch('preference/save', { btIpBanList: [...currentList, ipText] }, { root: true })
      }
    } catch (err) {
      console.warn('[task] sync btIpBanList after permanent peer ban failed:', err)
    }
  },
  async unbanPeer ({ dispatch, rootState }, { gid, ip }) {
    await api.unbanPeer({ gid, ip })

    const ipText = `${ip || ''}`.trim()
    if (!ipText) {
      return
    }

    try {
      const config = (rootState.preference && rootState.preference.config) || {}
      const currentList = normalizeBtIpBanList(config.btIpBanList)
      const nextList = currentList.filter(item => item !== ipText)
      if (nextList.length !== currentList.length) {
        await dispatch('preference/save', { btIpBanList: nextList }, { root: true })
      }
    } catch (err) {
      console.warn('[task] sync btIpBanList after peer unban failed:', err)
    }
  },
  removeTaskRecord ({ state, dispatch }, task) {
    const { gid, status } = task
    if (gid === state.currentTaskGid) {
      dispatch('hideTaskDetail')
    }

    const { ERROR, COMPLETE, REMOVED } = TASK_STATUS
    const validStatus = status || REMOVED // 确保状态有效
    if (![ERROR, COMPLETE, REMOVED].includes(validStatus)) {
      return
    }

    // 尝试从Aria2中删除任务记录，如果失败则忽略，因为任务可能已经不在Aria2中
    return api.removeTaskRecord({ gid })
      .catch((err) => {
        console.log('[LinkCore] removeTaskRecord from aria2 fail:', err)
        // 忽略Aria2删除失败的错误，继续执行
      })
      .finally(() => {
        dispatch('clearTaskCachesForGids', [gid])
        dispatch('fetchList')
        dispatch('app/fetchGlobalStat', null, { root: true })
      })
  },
  clearTaskCachesForGids ({ commit }, gids) {
    commit('CLEAR_TASK_CACHES_FOR_GIDS', gids)
  },
  saveSession () {
    // aria2.saveSession 在引擎主循环内同步写盘（会话文件 + 所有任务控制文件），
    // 执行期间会阻塞同一连接上的后续 RPC（包括轮询 tellActive 和 pause/unpause），
    // 用户会感知"开始/暂停很久才生效"。暂停、恢复、删除、任务启动事件等都会触发
    // saveSession，这里做 trailing 防抖合并，避免引擎被反复阻塞。
    if (saveSessionDebounceTimer) {
      clearTimeout(saveSessionDebounceTimer)
    }
    saveSessionDebounceTimer = setTimeout(() => {
      saveSessionDebounceTimer = null
      api.saveSession().catch(() => {})
    }, 800)
  },
  purgeTaskRecord ({ dispatch }) {
    return api.purgeTaskRecord()
      .finally(() => dispatch('fetchList'))
  },
  toggleTask ({ dispatch }, task) {
    const { status } = task
    const { ACTIVE, WAITING, PAUSED } = TASK_STATUS
    if (status === ACTIVE) {
      return dispatch('pauseTask', task)
    } else if (status === WAITING || status === PAUSED) {
      return dispatch('resumeTask', task)
    }
  },
  batchResumeSelectedTasks ({ state }) {
    const gids = state.selectedGidList
    if (gids.length === 0) {
      return
    }

    return api.batchResumeTask({ gids })
  },
  batchPauseSelectedTasks ({ state }) {
    const gids = state.selectedGidList
    if (gids.length === 0) {
      return
    }

    return api.batchPauseTask({ gids })
  },
  batchForcePauseTask (_, gids) {
    return api.batchForcePauseTask({ gids })
      .catch((e) => {
        // 批量暂停在删除流程中属于尽力而为的步骤，失败不应阻塞后续移除。
        console.warn('[LinkCore] batchForcePauseTask failed, continuing with removal:', e && e.message)
      })
  },
  batchResumeTask (_, gids) {
    return api.batchResumeTask({ gids })
  },
  batchRemoveTask ({ dispatch, commit }, gids) {
    return api.batchRemoveTask({ gids })
      .finally(() => {
        commit('CLEAR_TASK_CACHES_FOR_GIDS', gids)
        dispatch('fetchList')
        dispatch('app/fetchGlobalStat', null, { root: true })
        dispatch('saveSession')
      })
  },
  async updateTaskLink ({ dispatch, rootState }, payload) {
    const task = payload && payload.task ? payload.task : null
    const gid = task && task.gid ? `${task.gid}` : ''
    const newUri = payload && payload.newUri ? `${payload.newUri}`.trim() : ''
    const headersUA = payload && payload.headersUA != null ? `${payload.headersUA}` : ''
    const headersReferer = payload && payload.headersReferer != null ? `${payload.headersReferer}` : ''
    const headersCookie = payload && payload.headersCookie != null ? `${payload.headersCookie}` : ''
    const headersAuthorization = payload && payload.headersAuthorization != null ? `${payload.headersAuthorization}` : ''
    const desiredAllProxy = payload && payload.allProxy != null ? `${payload.allProxy}`.trim() : ''
    if (!gid || !newUri) {
      throw new Error('INVALID_PAYLOAD')
    }

    const current = await api.fetchTaskItem({ gid }).catch(() => task)
    const files = Array.isArray(current && current.files) ? current.files : []
    const fileIdx0 = files.findIndex(f => Array.isArray(f && f.uris) && f.uris.some(u => u && u.uri))
    const firstFile = fileIdx0 >= 0 ? files[fileIdx0] : null
    const fileIndex = fileIdx0 >= 0 ? (fileIdx0 + 1) : 1

    const currentUris = Array.isArray(firstFile && firstFile.uris)
      ? firstFile.uris.map(u => u && u.uri ? `${u.uri}` : '').filter(Boolean)
      : []
    if (currentUris.length === 0) {
      throw new Error('NO_ORIGINAL_URI')
    }

    const buildDesiredHeaderLines = (existing = []) => {
      const base = new Map()
      const input = Array.isArray(existing) ? existing : []
      input.forEach(h => {
        const s = `${h || ''}`
        const i = s.indexOf(':')
        if (i <= 0) return
        const k = s.slice(0, i).trim()
        const v = s.slice(i + 1).trim()
        if (!k) return
        base.set(k.toLowerCase(), { k, v })
      })

      const setOrDelete = (keyLower, keyName, value) => {
        const v = `${value || ''}`.trim()
        if (!v) {
          base.delete(keyLower)
          return
        }
        base.set(keyLower, { k: keyName, v })
      }

      setOrDelete('user-agent', 'User-Agent', headersUA)
      setOrDelete('referer', 'Referer', headersReferer)
      setOrDelete('cookie', 'Cookie', headersCookie)
      setOrDelete('authorization', 'Authorization', headersAuthorization)

      return Array.from(base.values()).map(it => `${it.k}: ${it.v}`)
    }
    let currentHeaderLines = []
    let currentAllProxy = ''
    try {
      const opt = await api.getOption({ gid })
      const hs = opt && opt.header ? opt.header : []
      const headerItems = Array.isArray(hs) ? hs : (typeof hs === 'string' ? [hs] : [])
      const lines = []
      headerItems.filter(Boolean).forEach(h => {
        `${h}`.split(/\r?\n/).forEach(line => {
          const s = `${line || ''}`.trim()
          if (s) lines.push(s)
        })
      })
      currentHeaderLines = lines
      currentAllProxy = opt && (opt.allProxy || opt['all-proxy']) ? `${opt.allProxy || opt['all-proxy']}`.trim() : ''
    } catch (_) {}

    const desiredHeaderLines = buildDesiredHeaderLines(currentHeaderLines)

    const normalizeLines = (lines) => (Array.isArray(lines) ? lines.map(x => `${x}`.trim()).filter(Boolean) : [])
    const ensureMinimalHeaders = (url, lines) => {
      const arr = normalizeLines(lines)
      const hasRef = arr.some(s => /^Referer\s*:/i.test(s))
      const hasOrigin = arr.some(s => /^Origin\s*:/i.test(s))
      const next = [...arr]
      if (!hasRef) {
        const inferred = inferRefererFromUrl(url)
        if (inferred) {
          next.push(`Referer: ${inferred}`)
          if (!hasOrigin && /bilibili\.com/i.test(inferred)) {
            next.push('Origin: https://www.bilibili.com')
          }
        }
      }
      return next
    }
    const effectiveHeaderLines = ensureMinimalHeaders(newUri, desiredHeaderLines)
    const sameHeaders = normalizeLines(effectiveHeaderLines).join('\n') === normalizeLines(currentHeaderLines).join('\n')

    const sameProxy = `${currentAllProxy || ''}`.trim() === `${desiredAllProxy || ''}`.trim()

    const status = current && current.status ? `${current.status}` : ''
    const wasActiveOrWaiting = status === TASK_STATUS.ACTIVE || status === TASK_STATUS.WAITING

    if (currentUris.includes(newUri) && sameHeaders && sameProxy) {
      dispatch('clearTaskNeedUpdateLink', gid)
      await dispatch('fetchList').catch(() => {})
      return
    }

    const effectiveDesiredHeaderLines = effectiveHeaderLines

    if (wasActiveOrWaiting) {
      await dispatch('pauseTask', current).catch(() => {})
      await dispatch('fetchList').catch(() => {})
    }

    const headerLinesToFetchHeaders = (lines) => {
      const list = Array.isArray(lines) ? lines : []
      const out = {}
      for (const raw of list) {
        const s = `${raw || ''}`
        const idx = s.indexOf(':')
        if (idx <= 0) continue
        const k = s.slice(0, idx).trim()
        const v = s.slice(idx + 1).trim()
        if (!k) continue
        out[k] = v
      }
      return out
    }

    const fetchHeadLength = async (url, headerLines) => {
      const baseHeaders = headerLinesToFetchHeaders(headerLines)
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          ...baseHeaders,
          'Accept-Encoding': 'identity'
        }
      })
      const cl = res && res.headers && res.headers.get ? res.headers.get('content-length') : ''
      return cl ? (Number(cl) || 0) : 0
    }

    const fetchRange0 = async (url, maxBytes, headerLines) => {
      const end = Math.max(0, maxBytes - 1)
      const baseHeaders = headerLinesToFetchHeaders(headerLines)
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          ...baseHeaders,
          Range: `bytes=0-${end}`,
          'Accept-Encoding': 'identity'
        }
      })
      if (!(res && (res.status === 206 || res.status === 200))) {
        throw new Error(`HTTP_${res ? res.status : 0}`)
      }
      const arrayBuf = await res.arrayBuffer()
      const body = Buffer.from(arrayBuf || [])
      const contentRange = res.headers && res.headers.get ? res.headers.get('content-range') : ''
      const contentLength = res.headers && res.headers.get ? res.headers.get('content-length') : ''
      let total = 0
      if (contentRange) {
        const m = `${contentRange}`.match(/\/(\d+)\s*$/)
        if (m) total = Number(m[1]) || 0
      }
      if (!total && contentLength && res.status === 200) {
        total = Number(contentLength) || 0
      }
      return { body, total, status: res.status }
    }

    let remoteTotal = 0
    const verifyRangeBytes = 8192
    const remoteProbe = await fetchRange0(newUri, verifyRangeBytes, effectiveHeaderLines)
    remoteTotal = remoteProbe.total || 0

    let verifiedRemoteTotal = Number(remoteTotal) || 0
    if (verifiedRemoteTotal === 0) {
      try {
        verifiedRemoteTotal = await fetchHeadLength(newUri, effectiveHeaderLines)
      } catch (_) {
        verifiedRemoteTotal = 0
      }
      if (verifiedRemoteTotal > 0) {
        remoteTotal = verifiedRemoteTotal
      }
    }

    const applyOptionsAndUri = async () => {
      if (!sameProxy) {
        await api.changeOption({ gid, options: { allProxy: desiredAllProxy } })
      }

      if (normalizeLines(effectiveDesiredHeaderLines).join('\n') !== normalizeLines(currentHeaderLines).join('\n')) {
        await api.changeOption({ gid, options: { header: effectiveDesiredHeaderLines } })
      }

      await api.changeUri({
        gid,
        fileIndex,
        delUris: currentUris,
        addUris: [newUri]
      })
    }

    const shouldFallback = (err) => {
      const msg = err && err.message ? `${err.message}` : `${err || ''}`
      return /Cannot change option for GID#/i.test(msg) ||
        /GID\s*#?.*\s*is not found/i.test(msg) ||
        /Cannot change URI/i.test(msg) ||
        /Cannot\s+change\s+option/i.test(msg)
    }

    try {
      await applyOptionsAndUri()
    } catch (e) {
      if (!shouldFallback(e)) {
        throw e
      }

      let opt = null
      try {
        opt = await api.getOption({ gid })
      } catch (_) {}

      const dir = opt && opt.dir ? `${opt.dir}` : (current && current.dir ? `${current.dir}` : '')
      const out = opt && opt.out ? `${opt.out}` : ''
      const split = opt && opt.split != null ? Number(opt.split) : null
      const options = {
        dir,
        out,
        continue: true,
        header: effectiveDesiredHeaderLines,
        allProxy: desiredAllProxy
      }
      if (split != null && Number.isFinite(split) && split > 0) {
        options.split = split
      }
      const nextGid = await api.addUriRaw({ uri: newUri, options })
      if (!nextGid) {
        throw e
      }

      dispatch('clearTaskNeedUpdateLink', gid)

      const oldStatus = status
      if ([TASK_STATUS.ERROR, TASK_STATUS.COMPLETE, TASK_STATUS.REMOVED].includes(oldStatus)) {
        await dispatch('removeTaskRecord', { gid, status: oldStatus }).catch(() => {})
      } else {
        await dispatch('removeTask', { gid }).catch(() => {})
      }

      await dispatch('fetchList').catch(() => {})
      return
    }

    dispatch('clearTaskNeedUpdateLink', gid)
    await dispatch('fetchList').catch(() => {})
    if (wasActiveOrWaiting) {
      await dispatch('resumeTask', { gid, status: TASK_STATUS.PAUSED }).catch(() => {})
    }
    await dispatch('fetchList').catch(() => {})
  }
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions
}
