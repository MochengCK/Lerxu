import { defineStore } from 'pinia'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import api from '@/api'
import { EMPTY_STRING, TASK_STATUS, AUDIO_SUFFIXES, DOCUMENT_SUFFIXES, IMAGE_SUFFIXES, SUB_SUFFIXES, VIDEO_SUFFIXES } from '@shared/constants'
import { checkTaskIsBT, getFileNameFromFile, getFileExtension, getTaskUri, intersection, isGithubUrl, getGithubUrlsWithMirrors, repairMagnetDisplayName, unwrapMulticallValues } from '@shared/utils'
import taskHistory from '@/api/TaskHistory'
import pendingFileSelectionStore from '@/api/PendingFileSelection'
import { inferRefererFromUrl } from '@shared/utils/referer-rules'
import { getTaskInfoHash, isTaskPendingSelectionCandidate, isTaskPendingSelectionTarget, isTaskFileSelectionConfirmed, isHlsManifestUri } from '@/utils/task'
import { collapseTaskPairs, expandPairGids } from '@/utils/taskPair'
import { useAppStore } from './app'
import { usePreferenceStore } from './preference'

const MAX_TASK_SPEED_SAMPLE_GIDS = 200
const MAX_TASK_DISPLAY_NAME_GIDS = 1000
const MAX_TASK_PRIORITY_GIDS = 1000
const MAX_MAGNET_STATUS_GIDS = 300
const MAX_DATA_ACCESS_STATUS_GIDS = 300
const MAX_TASK_LINK_UPDATE_HINT_GIDS = 300
// 非「全部」列表时，侧边栏计数用的全量任务列表刷新间隔（毫秒）。
// 每秒单独再拉一次全量（tellActive+tellWaiting+tellStopped 全字段）
// 会让引擎与渲染进程负担翻倍，而它只影响侧边栏计数与待选择扫描
const ALL_LIST_REFRESH_INTERVAL = 3000
let _lastAllListFetchAt = 0

let saveSessionDebounceTimer = null

/* ── 「一对音视频」折叠的簿记 ───────────────────────────────────────────────
 * 扩展把同一个视频的画面流与声音流拆成两个任务发过来（带同一个 pairId），
 * 列表里应当只占**一条记录**（细节见 `@/utils/taskPair`）。折叠发生在下面两个
 * UPDATE_* 里，这里放它需要的四份簿记：
 *
 *  · rawTaskByGid / rawAllTaskByGid —— **折叠前**的上一轮任务。
 *    折叠之后 this.taskList 里已经找不到成员各自的记录了，而
 *    ①「条目没变化就复用旧对象」②「合并期间条目从引擎消失也要保留」
 *    这两处必须比对原始任务，否则每轮都会误判成"整个列表变了" → 全量重建。
 *  · pairRowsByPairId(ForAll) —— 上一轮折叠出来的记录，内容一致时复用同一个
 *    对象，避免每轮生成的"新对象"让 v-memo 失效、子组件全量重渲染。
 *  · pairMemberIndex —— 任一成员 gid → 该记录的全部成员 gid（批量操作按它展开）。
 */
let rawTaskByGid = new Map()
let rawAllTaskByGid = new Map()
let pairRowsByPairId = new Map()
let pairRowsByPairIdForAll = new Map()
let pairMemberIndex = new Map()

/**
 * 一条记录背后的引擎任务。
 *
 * 「一对音视频」折叠成一条记录之后，**引擎里仍然是两条独立任务**：暂停、继续、
 * 删除都必须落到两条上，否则会出现"画面停了、声音还在跑"或"删了记录另一半还在下"。
 * 非配对任务返回 `[task]` 本身。
 */
function pairMemberTasks (task) {
  if (!task) {
    return []
  }
  const members = Array.isArray(task.pairMembers) ? task.pairMembers.filter(Boolean) : []
  if (members.length > 0) {
    return members
  }
  return [task]
}

/**
 * 对同一条记录背后的多个成员执行同一个操作。
 *
 * 主成员（index 0）的失败照旧抛给调用方 —— 用户要看到"暂停失败"这类提示；
 * 伙伴的失败只记日志：合并流程可能已经把伙伴从引擎里摘掉了，那不是错误。
 */
function runForMembers (members, fn, label) {
  const list = Array.isArray(members) ? members.filter(Boolean) : []
  if (list.length === 0) {
    return Promise.resolve([])
  }
  return Promise.all(list.map((member, index) => Promise.resolve()
    .then(() => fn(member))
    .catch((err) => {
      if (index === 0) {
        throw err
      }
      console.warn(`[Lerxu] ${label || 'pair op'} on pair partner failed:`, err && err.message ? err.message : err)
      return null
    })))
}

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
        // 「一对音视频」折叠记录显示的是**产物名**（画面流名字去掉角色标记），
        // 排序必须跟显示用同一个名字，否则"看到的顺序"和"排序键"不一致
        if (task && task.pairDisplayName && Number(task.pairCount) >= 2) {
          return `${task.pairDisplayName}`.toLowerCase()
        }
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

const state = () => ({
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
  // 已确定**不会再合并**的成员 gid（合并重试耗尽、缺另一半、合并失败收尾）。
  // 与 mergingList 同一套做法：折叠记录要据此停止显示"待合并/合并中"，
  // 否则只有一条流的记录会永远挂在黄条上（详见 taskPair.resolveProgressView）。
  mergeSkippedList: [],
  mergeProgresses: {},
  mergeKeys: {},
  taskList: [],
  taskListRevision: 0, // taskList 以 splice 原地更新，引用不变；供外部 watch 检测列表实际变化
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
  taskSecurityScanStatuses: {},
  taskLinkUpdateHints: {},
  taskLinkUpdateHintsTouchedAt: {},
  searchKeyword: '',
  categoryFilter: '',
  sortField: 'name',
  sortOrder: 'asc',
  viewMode: 'list'
})

const getters = {
  // 侧边栏任务数：受日期筛选（allTaskList 已在 fetchList 中过滤）和文件类型分类筛选影响
  filteredTaskCounts () {
    const preferenceStore = usePreferenceStore()
    const downloadingFileSuffix = (preferenceStore.config && preferenceStore.config.downloadingFileSuffix) || ''
    const category = this.categoryFilter
    const list = !category
      ? this.allTaskList
      : this.allTaskList.filter((task) => taskMatchesCategory(task, category, downloadingFileSuffix))

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
  categoryCounts () {
    const preferenceStore = usePreferenceStore()
    const downloadingFileSuffix = (preferenceStore.config && preferenceStore.config.downloadingFileSuffix) || ''
    const list = this.allTaskList
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
  UPDATE_SEEDING_LIST(seedingList) {
    this.seedingList = seedingList
  },
  UPDATE_MERGING_LIST(mergingList) {
    this.mergingList = mergingList
  },
  UPDATE_MERGE_SKIPPED_LIST(mergeSkippedList) {
    this.mergeSkippedList = mergeSkippedList
  },
  SET_TASK_STATUS({ gid, status }) {
    // 一对音视频折叠后列表里只有一条记录（gid 是主 gid），而引擎事件带的是
    // **成员**的 gid（合并往往是"后下完的那条"触发的）。两种 gid 都要能改到。
    const applyTo = (list) => {
      const direct = list.find(t => `${t.gid}` === `${gid}`)
      if (direct) {
        direct.status = status
        return
      }
      const row = list.find(t => Array.isArray(t.pairGids) && t.pairGids.some(g => `${g}` === `${gid}`))
      if (!row) {
        return
      }
      row.status = status
      if (Array.isArray(row.pairMembers)) {
        row.pairMembers.forEach(m => {
          if (`${m.gid}` === `${gid}`) {
            m.status = status
          }
        })
      }
    }
    applyTo(this.taskList)
    applyTo(this.allTaskList)
  },
  SET_MERGE_PROGRESS({ gid, progress }) {
    this.mergeProgresses = { ...this.mergeProgresses, [gid]: progress }
  },
  CLEAR_MERGE_PROGRESS(gid) {
    const next = { ...this.mergeProgresses }
    delete next[gid]
    this.mergeProgresses = next
  },
  SET_MERGE_KEY({ gid, key }) {
    this.mergeKeys = { ...this.mergeKeys, [gid]: key }
  },
  DELETE_MERGE_KEYS_BY_KEY(key) {
    const next = {}
    for (const [gid, k] of Object.entries(this.mergeKeys)) {
      if (k !== key) next[gid] = k
    }
    this.mergeKeys = next
  },
  UPDATE_TASK_LIST(taskList) {
    // 比对基准是**上一轮的原始任务**（不是 this.taskList —— 那里面已经是折叠后
    // 的记录了），否则每个配对成员都会被当成"新条目" → 每轮全量重建
    const oldMap = rawTaskByGid
    const newList = []
    let changed = false

    taskList.forEach(newTask => {
      const oldTask = oldMap.get(`${newTask.gid}`)
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
        if (this.mergingList.includes(newTask.gid) && updatedTask.status === TASK_STATUS.COMPLETE) {
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
    if (this.mergingList.length > 0) {
      const newGids = new Set(newList.map(t => t.gid))
      this.mergingList.forEach(gid => {
        if (!newGids.has(gid)) {
          const oldTask = oldMap.get(gid)
          if (oldTask) {
            newList.push({ ...oldTask, status: TASK_STATUS.MERGING })
            changed = true
          }
        }
      })
    }

    // 一对音视频折叠成**一条记录**：进度/速度按成员求和、状态按成员聚合。
    // 必须在上面两步之后——那两步都是按"引擎任务"口径做的。
    const collapsed = collapseTaskPairs(newList, {
      mergingGids: this.mergingList,
      mergeSkippedGids: this.mergeSkippedList,
      previousRows: pairRowsByPairId
    })
    pairMemberIndex = collapsed.index
    pairRowsByPairId = collapsed.rows
    if (collapsed.changed) {
      changed = true
    }
    // 折叠让"条数"与原始任务数不再相等，清空/删任务的场景靠这条兜住
    if (this.taskList.length !== collapsed.list.length) {
      changed = true
    }

    rawTaskByGid = new Map(newList.map(t => [`${t.gid}`, t]))

    // 本轮无任何变化时不替换数组，避免任务列表组件与下游
    // getter 在每个轮询周期内无谓重算/重渲染
    if (changed) {
      // 直接替换整个数组，确保 Vue 能检测到变化
      // 使用 splice 方法清空并重新填充数组，这样可以保持数组引用不变
      // 同时触发 Vue 的响应式更新
      this.taskList.splice(0, this.taskList.length, ...collapsed.list)

      // 重新应用当前的排序（如果有的话）
      if (this.sortField && this.sortOrder && this.sortField !== 'name') {
        // 只有在非默认排序时才重新排序，避免不必要的排序操作
        const sortedList = sortTaskList(this.taskList, this.sortField, this.sortOrder)
        this.taskList.splice(0, this.taskList.length, ...sortedList)
      } else if (this.sortField === 'name' && this.sortOrder !== 'asc') {
        // 名称排序但非升序时也需要重新排序
        const sortedList = sortTaskList(this.taskList, this.sortField, this.sortOrder)
        this.taskList.splice(0, this.taskList.length, ...sortedList)
      }

      // 数组引用未变（splice 原地更新），watch(taskList) 不会触发；
      // 通过递增 revision 让依赖任务列表变化的逻辑（如自动打开进度窗口）感知到更新
      this.taskListRevision++
    }
  },
  UPDATE_ALL_TASK_LIST(taskList) {
    const oldMap = rawAllTaskByGid
    const newList = []
    let changed = false
    taskList.forEach(newTask => {
      const oldTask = oldMap.get(`${newTask.gid}`)
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

    // 侧边栏计数同样按"一条记录"数：一对音视频算一条（与列表显示一致）
    const collapsed = collapseTaskPairs(newList, {
      mergingGids: this.mergingList,
      mergeSkippedGids: this.mergeSkippedList,
      previousRows: pairRowsByPairIdForAll
    })
    pairRowsByPairIdForAll = collapsed.rows
    if (collapsed.changed) {
      changed = true
    }
    if (this.allTaskList.length !== collapsed.list.length) {
      changed = true
    }
    rawAllTaskByGid = new Map(newList.map(t => [`${t.gid}`, t]))

    // 本轮无任何变化时不替换数组，避免侧边栏计数等 getter 与
    // 依赖 allTaskList 的组件在每个轮询周期内无谓重算/重渲染
    if (changed) {
      this.allTaskList.splice(0, this.allTaskList.length, ...collapsed.list)
    }
  },
  UPDATE_SELECTED_GID_LIST(gidList) {
    const prev = this.selectedGidList
    // 每轮 fetchList 都会用 intersection 结果回写一次。内容未变时复用旧数组，
    // 避免依赖选中态的 computed / 组件在每个轮询周期里无谓重算
    if (Array.isArray(gidList) && Array.isArray(prev) &&
        prev.length === gidList.length && prev.every((gid, i) => gid === gidList[i])) {
      return
    }
    this.selectedGidList = gidList
  },
  CHANGE_CURRENT_LIST(currentList) {
    this.currentList = currentList
  },
  UPDATE_FILTER_DATE(date) {
    this.filterDate = date
  },
  CHANGE_TASK_DETAIL_VISIBLE(visible) {
    this.taskDetailVisible = visible
  },
  UPDATE_CURRENT_TASK_GID(gid) {
    this.currentTaskGid = gid
  },
  UPDATE_ENABLED_FETCH_PEERS(enabled) {
    this.enabledFetchPeers = enabled
  },
  UPDATE_CURRENT_TASK_ITEM(task) {
    this.currentTaskItem = task
  },
  UPDATE_CURRENT_TASK_FILES(files) {
    this.currentTaskFiles = files
  },
  UPDATE_CURRENT_TASK_PEERS(peers) {
    this.currentTaskPeers = peers
  },
  UPDATE_MAGNET_STATUS(payload) {
    const { gid, ...rest } = payload
    const now = Date.now()
    const nextRest = { ...rest }
    if (nextRest.updatedAt == null) {
      nextRest.updatedAt = now
    }
    const prev = this.magnetStatuses[gid] || {}
    // 高频调用：除 updatedAt 外无变化时短路，避免无谓重建对象
    const dataKeys = Object.keys(nextRest).filter(k => k !== 'updatedAt')
    if (dataKeys.length > 0 && dataKeys.every(k => prev[k] === nextRest[k])) {
      return
    }
    this.magnetStatuses = { ...this.magnetStatuses, [gid]: { ...prev, ...nextRest } }
  },
  CLEAR_MAGNET_STATUS(gid) {
    if (!(gid in this.magnetStatuses)) {
      return
    }
    const next = { ...this.magnetStatuses }
    delete next[gid]
    this.magnetStatuses = next
  },
  SET_PENDING_FILE_SELECTION(payload) {
    const { gid, infoHash } = typeof payload === 'object' && payload !== null
      ? { gid: payload.gid, infoHash: payload.infoHash }
      : { gid: payload, infoHash: '' }
    if (!gid) {
      return
    }
    const hash = `${infoHash || ''}`.trim().toLowerCase()
    this.pendingFileSelection = { ...this.pendingFileSelection, [gid]: hash || true }
    const confirmed = { ...this.confirmedFileSelection }
    delete confirmed[gid]
    this.confirmedFileSelection = confirmed
    pendingFileSelectionStore.add(gid, hash)
    pendingFileSelectionStore.removeConfirmed(gid)
  },
  CLEAR_PENDING_FILE_SELECTION(gid) {
    const next = { ...this.pendingFileSelection }
    delete next[gid]
    this.pendingFileSelection = next
    pendingFileSelectionStore.remove(gid)
  },
  LOAD_PENDING_FILE_SELECTION(mapping) {
    this.pendingFileSelection = { ...(mapping || {}) }
    pendingFileSelectionStore.setAll(this.pendingFileSelection)
  },
  REPLACE_PENDING_FILE_SELECTION(mapping) {
    this.pendingFileSelection = { ...(mapping || {}) }
    pendingFileSelectionStore.setAll(this.pendingFileSelection)
  },
  LOAD_CONFIRMED_FILE_SELECTION(mapping) {
    this.confirmedFileSelection = { ...(mapping || {}) }
    pendingFileSelectionStore.setConfirmedAll(this.confirmedFileSelection)
  },
  CONFIRM_FILE_SELECTION(payload) {
    const gid = payload && typeof payload === 'object' ? payload.gid : payload
    const infoHash = payload && typeof payload === 'object' ? payload.infoHash : ''
    if (!gid) {
      return
    }
    this.confirmedFileSelection = { ...this.confirmedFileSelection, [gid]: infoHash || true }
    pendingFileSelectionStore.confirm(gid, infoHash || '')
  },
  UPDATE_DATA_ACCESS_STATUS(payload) {
    const { gid, ...rest } = payload
    const now = Date.now()
    const nextRest = { ...rest }
    if (nextRest.updatedAt == null) {
      nextRest.updatedAt = now
    }
    const prev = this.dataAccessStatuses[gid] || {}
    this.dataAccessStatuses = { ...this.dataAccessStatuses, [gid]: { ...prev, ...nextRest } }
  },
  CLEAR_DATA_ACCESS_STATUS(gid) {
    if (!(gid in this.dataAccessStatuses)) {
      return
    }
    const next = { ...this.dataAccessStatuses }
    delete next[gid]
    this.dataAccessStatuses = next
  },
  UPDATE_TASK_PRIORITIES(mapping) {
    // fetchList 每轮都会重放一次优先级映射。值完全一致时短路，
    // 避免无条件替换两个 map 触发依赖（排序/优先级展示）重算
    const keys = Object.keys(mapping || {})
    if (keys.length > 0 && keys.every(k => this.taskPriorities[k] === mapping[k])) {
      return
    }
    const now = Date.now()
    const nextTouched = { ...(this.taskPrioritiesTouchedAt || {}) }
    Object.keys(mapping || {}).forEach(gid => {
      const k = normalizeGid(gid)
      if (k) {
        nextTouched[k] = now
      }
    })
    this.taskPriorities = { ...this.taskPriorities, ...mapping }
    this.taskPrioritiesTouchedAt = nextTouched
  },
  CLEAR_TASK_PRIORITY(gid) {
    if (!gid) {
      return
    }
    if (!this.taskPriorities[gid]) {
      return
    }
    const next = { ...this.taskPriorities }
    delete next[gid]
    this.taskPriorities = next

    const nextTouched = { ...(this.taskPrioritiesTouchedAt || {}) }
    delete nextTouched[gid]
    this.taskPrioritiesTouchedAt = nextTouched
  },
  UPDATE_TASK_SPEED_SAMPLES(payload) {
    const { gid, samples } = payload || {}
    if (!gid) {
      return
    }
    this.taskSpeedSamples = { ...this.taskSpeedSamples, [gid]: Array.isArray(samples) ? samples : [] }
    this.taskSpeedSamplesTouchedAt = { ...(this.taskSpeedSamplesTouchedAt || {}), [gid]: Date.now() }
  },
  ADD_TASK_SPEED_SAMPLE(payload) {
    const { gid, sample, maxSamples = 60 } = payload || {}
    if (!gid) {
      return
    }
    const prev = Array.isArray(this.taskSpeedSamples[gid]) ? this.taskSpeedSamples[gid] : []
    const next = [...prev, sample]
    const cap = Number(maxSamples) > 0 ? Number(maxSamples) : 60
    if (next.length > cap) {
      next.splice(0, next.length - cap)
    }
    this.taskSpeedSamples = { ...this.taskSpeedSamples, [gid]: next }
    this.taskSpeedSamplesTouchedAt = { ...(this.taskSpeedSamplesTouchedAt || {}), [gid]: Date.now() }
  },
  CLEAR_TASK_SPEED_SAMPLES(gid) {
    if (!gid) {
      return
    }
    if (!this.taskSpeedSamples[gid]) {
      return
    }
    const next = { ...this.taskSpeedSamples }
    delete next[gid]
    this.taskSpeedSamples = next

    const nextTouched = { ...(this.taskSpeedSamplesTouchedAt || {}) }
    delete nextTouched[gid]
    this.taskSpeedSamplesTouchedAt = nextTouched
  },
  UPDATE_TASK_DISPLAY_NAME(payload) {
    const { gid, name } = payload || {}
    if (!gid || !name) {
      return
    }
    if (this.taskDisplayNames[gid] === name) {
      return
    }
    this.taskDisplayNames = { ...this.taskDisplayNames, [gid]: name }
    this.taskDisplayNamesTouchedAt = { ...(this.taskDisplayNamesTouchedAt || {}), [gid]: Date.now() }
  },
  CLEAR_TASK_DISPLAY_NAME(gid) {
    if (!gid) {
      return
    }
    if (!this.taskDisplayNames[gid]) {
      return
    }
    const next = { ...this.taskDisplayNames }
    delete next[gid]
    this.taskDisplayNames = next

    const nextTouched = { ...(this.taskDisplayNamesTouchedAt || {}) }
    delete nextTouched[gid]
    this.taskDisplayNamesTouchedAt = nextTouched
  },
  CLEAR_TASK_CACHES_FOR_GIDS(gids) {
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

    this.magnetStatuses = pruneBySet(this.magnetStatuses)
    this.dataAccessStatuses = pruneBySet(this.dataAccessStatuses)
    this.taskSpeedSamples = pruneBySet(this.taskSpeedSamples)
    this.taskSpeedSamplesTouchedAt = pruneBySet(this.taskSpeedSamplesTouchedAt)
    this.taskDisplayNames = pruneBySet(this.taskDisplayNames)
    this.taskDisplayNamesTouchedAt = pruneBySet(this.taskDisplayNamesTouchedAt)
    this.taskPriorities = pruneBySet(this.taskPriorities)
    this.taskPrioritiesTouchedAt = pruneBySet(this.taskPrioritiesTouchedAt)
    this.taskLinkUpdateHints = pruneBySet(this.taskLinkUpdateHints)
    this.taskLinkUpdateHintsTouchedAt = pruneBySet(this.taskLinkUpdateHintsTouchedAt)
    this.pendingFileSelection = pruneBySet(this.pendingFileSelection)
    this.confirmedFileSelection = pruneBySet(this.confirmedFileSelection)
    pendingFileSelectionStore.setAll(this.pendingFileSelection)
    pendingFileSelectionStore.setConfirmedAll(this.confirmedFileSelection)

    // 「不再合并」的登记也要跟着删：gid 复用/重新下载时不能被上一次的结论罩住
    if (this.mergeSkippedList && this.mergeSkippedList.length > 0) {
      const left = this.mergeSkippedList.filter(gid => !gidSet.has(`${gid}`))
      if (left.length !== this.mergeSkippedList.length) {
        this.UPDATE_MERGE_SKIPPED_LIST(left)
      }
    }
  },
  PRUNE_TASK_CACHES(payload) {
    const gids = Array.isArray(payload && payload.gids) ? payload.gids : []
    const keepGids = Array.isArray(payload && payload.keepGids) ? payload.keepGids : []
    const gidSet = new Set([...gids, ...keepGids].map(normalizeGid).filter(Boolean))

    this.magnetStatuses = pruneObjectByGidSet(this.magnetStatuses, gidSet)
    this.dataAccessStatuses = pruneObjectByGidSet(this.dataAccessStatuses, gidSet)
    this.taskSpeedSamples = pruneObjectByGidSet(this.taskSpeedSamples, gidSet)
    this.taskSpeedSamplesTouchedAt = pruneObjectByGidSet(this.taskSpeedSamplesTouchedAt, gidSet)
    this.taskDisplayNames = pruneObjectByGidSet(this.taskDisplayNames, gidSet)
    this.taskDisplayNamesTouchedAt = pruneObjectByGidSet(this.taskDisplayNamesTouchedAt, gidSet)
    this.taskPriorities = pruneObjectByGidSet(this.taskPriorities, gidSet)
    this.taskPrioritiesTouchedAt = pruneObjectByGidSet(this.taskPrioritiesTouchedAt, gidSet)

    this.magnetStatuses = capObjectByTimestamp(
      this.magnetStatuses,
      MAX_MAGNET_STATUS_GIDS,
      (gid) => (this.magnetStatuses && this.magnetStatuses[gid] && this.magnetStatuses[gid].updatedAt) || 0
    )
    this.dataAccessStatuses = capObjectByTimestamp(
      this.dataAccessStatuses,
      MAX_DATA_ACCESS_STATUS_GIDS,
      (gid) => (this.dataAccessStatuses && this.dataAccessStatuses[gid] && this.dataAccessStatuses[gid].updatedAt) || 0
    )

    const capByTouched = (map, touchedAt, cap) => {
      const cappedMap = capObjectByTimestamp(map, cap, (gid) => (touchedAt && touchedAt[gid]) || 0)
      const cappedKeys = new Set(Object.keys(cappedMap || {}))
      const cappedTouched = pruneObjectByGidSet(touchedAt || {}, cappedKeys)
      return { cappedMap, cappedTouched }
    }

    const speedCapped = capByTouched(this.taskSpeedSamples, this.taskSpeedSamplesTouchedAt, MAX_TASK_SPEED_SAMPLE_GIDS)
    this.taskSpeedSamples = speedCapped.cappedMap
    this.taskSpeedSamplesTouchedAt = speedCapped.cappedTouched

    const nameCapped = capByTouched(this.taskDisplayNames, this.taskDisplayNamesTouchedAt, MAX_TASK_DISPLAY_NAME_GIDS)
    this.taskDisplayNames = nameCapped.cappedMap
    this.taskDisplayNamesTouchedAt = nameCapped.cappedTouched

    const priorityCapped = capByTouched(this.taskPriorities, this.taskPrioritiesTouchedAt, MAX_TASK_PRIORITY_GIDS)
    this.taskPriorities = priorityCapped.cappedMap
    this.taskPrioritiesTouchedAt = priorityCapped.cappedTouched

    const linkHintCapped = capByTouched(this.taskLinkUpdateHints, this.taskLinkUpdateHintsTouchedAt, MAX_TASK_LINK_UPDATE_HINT_GIDS)
    this.taskLinkUpdateHints = linkHintCapped.cappedMap
    this.taskLinkUpdateHintsTouchedAt = linkHintCapped.cappedTouched
  },
  UPDATE_TASK_LINK_UPDATE_HINT(payload) {
    const gid = payload && payload.gid ? normalizeGid(payload.gid) : ''
    if (!gid) {
      return
    }
    const now = Date.now()
    const prev = (this.taskLinkUpdateHints && this.taskLinkUpdateHints[gid]) || {}
    const next = {
      ...prev,
      ...payload,
      gid,
      updatedAt: now
    }
    this.taskLinkUpdateHints = { ...(this.taskLinkUpdateHints || {}), [gid]: next }
    this.taskLinkUpdateHintsTouchedAt = { ...(this.taskLinkUpdateHintsTouchedAt || {}), [gid]: now }
  },
  CLEAR_TASK_LINK_UPDATE_HINT(gid) {
    const k = normalizeGid(gid)
    if (!k) {
      return
    }
    const next = { ...(this.taskLinkUpdateHints || {}) }
    delete next[k]
    this.taskLinkUpdateHints = next

    const nextTouched = { ...(this.taskLinkUpdateHintsTouchedAt || {}) }
    delete nextTouched[k]
    this.taskLinkUpdateHintsTouchedAt = nextTouched
  },
  UPDATE_TASK_SEARCH_KEYWORD(keyword) {
    this.searchKeyword = `${keyword || ''}`
  },
  UPDATE_CATEGORY_FILTER(filter) {
    this.categoryFilter = filter
  },
  UPDATE_VIEW_MODE(mode) {
    this.viewMode = mode
  },
  SORT_TASK_LIST(payload) {
    const { field, order } = payload || {}
    if (!field || !order) {
      return
    }

    // 更新排序状态
    this.sortField = field
    this.sortOrder = order

    const sortedList = sortTaskList(this.taskList, field, order)
    this.taskList = sortedList
  }
}

const actions = {
  markTaskNeedUpdateLink (payload) {
    const gid = payload && payload.gid ? `${payload.gid}` : ''
    if (!gid) {
      return
    }
    const httpStatus = payload && payload.httpStatus ? Number(payload.httpStatus) : 0
    const reason = payload && payload.reason ? `${payload.reason}` : ''
    const level = payload && payload.level ? `${payload.level}` : ''
    const errorCode = payload && payload.errorCode != null ? Number(payload.errorCode) : null
    const errorMessage = payload && payload.errorMessage ? `${payload.errorMessage}` : ''
    this.UPDATE_TASK_LINK_UPDATE_HINT({
      gid,
      httpStatus: Number.isFinite(httpStatus) ? httpStatus : 0,
      level,
      reason,
      errorCode,
      errorMessage
    })
  },
  clearTaskNeedUpdateLink (gid) {
    this.CLEAR_TASK_LINK_UPDATE_HINT(gid)
  },
  initializeViewMode (config) {
    // Load saved view mode from preferences
    // config 中的键是 camelCase 格式
    const savedViewMode = config?.taskViewMode || 'list'
    this.UPDATE_VIEW_MODE(savedViewMode)
  },
  initializeFilterDate (config) {
    const savedFilterDate = config && typeof config.taskFilterDate === 'string' ? config.taskFilterDate : null
    this.UPDATE_FILTER_DATE(savedFilterDate)
  },
  setTaskDisplayName (payload) {
    this.UPDATE_TASK_DISPLAY_NAME(payload)
  },
  clearTaskDisplayName (gid) {
    this.CLEAR_TASK_DISPLAY_NAME(gid)
  },
  updateTaskSearchKeyword (keyword) {
    this.UPDATE_TASK_SEARCH_KEYWORD(keyword)
  },
  updateCategoryFilter (filter) {
    this.UPDATE_CATEGORY_FILTER(filter)
  },
  updateViewMode (mode) {
    this.UPDATE_VIEW_MODE(mode)
    // Save the view mode to preferences for persistence
    // 使用 camelCase 格式的键名，与其他设置保持一致
    usePreferenceStore().save({ taskViewMode: mode })
  },
  sortTasks (payload) {
    this.SORT_TASK_LIST(payload)
  },
  changeCurrentList (currentList) {
    this.CHANGE_CURRENT_LIST(currentList)
    this.UPDATE_SELECTED_GID_LIST([])
    this.fetchList()
  },
  changeCurrentListWithDate ({ currentList, filterDate }) {
    this.CHANGE_CURRENT_LIST(currentList)
    this.UPDATE_FILTER_DATE(filterDate)
    this.UPDATE_SELECTED_GID_LIST([])
    this.fetchList()
  },
  updateFilterDate (date) {
    this.UPDATE_FILTER_DATE(date)
    if (date) {
      usePreferenceStore().save({ taskFilterDate: date })
    } else {
      usePreferenceStore().save({ taskFilterDate: null })
    }
  },
  fetchList () {
    const params = { type: this.currentList }

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
        const filteredData = applyDateFilter(data, this.filterDate)

        this.UPDATE_TASK_LIST(filteredData)

        const { selectedGidList } = this
        const gids = filteredData.map((task) => task.gid)
        const list = intersection(selectedGidList, gids)
        this.UPDATE_SELECTED_GID_LIST(list)

        try {
          const saved = (usePreferenceStore() && usePreferenceStore().config && usePreferenceStore().config.taskPriorities) || {}
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
            this.UPDATE_TASK_PRIORITIES(mapping)
          }
        } catch (e) {}

        this.PRUNE_TASK_CACHES({ gids, keepGids: [this.currentTaskGid] })

        // 更新全量任务列表（用于侧边栏计数，不受 currentList 影响）
        if (this.currentList === 'all') {
          this.UPDATE_ALL_TASK_LIST(filteredData)
        } else if (Date.now() - _lastAllListFetchAt >= ALL_LIST_REFRESH_INTERVAL) {
          _lastAllListFetchAt = Date.now()
          api.fetchTaskList({ type: 'all' })
            .then((allData) => {
              const allFiltered = applyDateFilter(allData, this.filterDate)
              this.UPDATE_ALL_TASK_LIST(allFiltered)
            })
            .catch(() => {})
        }
      })
  },
  updateDataAccessStatus (payload) {
    this.UPDATE_DATA_ACCESS_STATUS(payload)
  },
  clearDataAccessStatus (gid) {
    this.CLEAR_DATA_ACCESS_STATUS(gid)
  },
  selectTasks (list) {
    this.UPDATE_SELECTED_GID_LIST(list)
  },
  selectAllTask () {
    const gids = this.taskList.map((task) => task.gid)
    this.UPDATE_SELECTED_GID_LIST(gids)
  },
  fetchItem (gid) {
    return api.fetchTaskItem({ gid })
      .then((data) => {
        this.updateCurrentTaskItem(data)
      })
  },
  fetchItemWithPeers (gid) {
    return api.fetchTaskItemWithPeers({ gid })
      .then((data) => {
        this.updateCurrentTaskItem(data)
      })
  },
  showTaskDetailByGid (gid) {
    // 首先尝试从本地任务列表中查找任务
    const localTask = this.taskList.find(task => task.gid === gid)
    if (localTask) {
      // 对于本地任务列表中的任务，直接使用本地数据，不再调用 API
      // 这包括历史记录任务，它们已经在本地任务列表中
      this.updateCurrentTaskItem(localTask)
      this.UPDATE_CURRENT_TASK_GID(localTask.gid)
      this.CHANGE_TASK_DETAIL_VISIBLE(true)
      return
    }

    // 如果本地任务列表中没有，尝试从历史记录中获取
    return api.fetchStoppedTaskList({})
      .then((stoppedTasks) => {
        const historyTask = stoppedTasks.find(task => task.gid === gid)
        if (historyTask) {
          this.updateCurrentTaskItem(historyTask)
          this.UPDATE_CURRENT_TASK_GID(historyTask.gid)
          this.CHANGE_TASK_DETAIL_VISIBLE(true)
        } else {
          // 只有在本地和历史记录中都找不到任务时，才尝试从 aria2 引擎获取
          console.log('[Lerxu] Task not found in local list or history, try to get from engine:', gid)
          return api.fetchTaskItem({ gid })
            .then((task) => {
              this.updateCurrentTaskItem(task)
              this.UPDATE_CURRENT_TASK_GID(task.gid)
              this.CHANGE_TASK_DETAIL_VISIBLE(true)
            })
            .catch((error) => {
              console.error('[Lerxu] Task not found in engine:', error.message)
              // 可以添加一个错误提示给用户
            })
        }
      })
      .catch((err) => {
        console.error('[Lerxu] fetch stopped task list fail:', err)
        // 可以添加一个错误提示给用户
      })
  },
  showTaskDetail (task) {
    this.updateCurrentTaskItem(task)
    this.UPDATE_CURRENT_TASK_GID(task.gid)
    this.CHANGE_TASK_DETAIL_VISIBLE(true)
  },
  hideTaskDetail () {
    this.CHANGE_TASK_DETAIL_VISIBLE(false)
  },
  toggleEnabledFetchPeers (enabled) {
    this.UPDATE_ENABLED_FETCH_PEERS(enabled)
  },
  updateCurrentTaskItem (task) {
    this.UPDATE_CURRENT_TASK_ITEM(task)
    if (task) {
      this.UPDATE_CURRENT_TASK_FILES(task.files)
      this.UPDATE_CURRENT_TASK_PEERS(task.peers)
    } else {
      this.UPDATE_CURRENT_TASK_FILES([])
      this.UPDATE_CURRENT_TASK_PEERS([])
    }
  },
  updateCurrentTaskGid (gid) {
    this.UPDATE_CURRENT_TASK_GID(gid)
  },
  updateTaskSpeedSamples (payload) {
    this.UPDATE_TASK_SPEED_SAMPLES(payload)
  },
  addTaskSpeedSample (payload) {
    this.ADD_TASK_SPEED_SAMPLE(payload)
  },
  resetTaskSpeedSamples (gid) {
    this.CLEAR_TASK_SPEED_SAMPLES(gid)
  },
  addUri (data) {
    const { uris, outs, options, optionsList, dirs, priorities } = data

    // Handle downloading file suffix
    const config = usePreferenceStore().config || {}
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
        // 磁力的 dn 若不是合法 UTF-8（中文站点常用 GBK 百分号编码），引擎会
        // 解出一串 U+FFFD（界面显示为乱码）。交给引擎前先规范成 UTF-8，
        // 使任务名、文件选择、落盘目录名都取到正确名称。
        const finalUri = magnet || repairMagnetDisplayName(uri)

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
      // 磁力流程全权交给引擎：元数据就绪后由引擎暂停进入文件选择阶段
      // （多文件等待用户勾选；单文件引擎自动重启续下，不打断体验）
      if (typeof normalizedOptions['bt-file-selection'] === 'undefined') {
        normalizedOptions['bt-file-selection'] = 'true'
      }
    }
    const safeGetNameFromUri = (uri) => {
      try {
        // uri 可能是字符串或数组（GitHub 镜像情况）
        const uriStr = Array.isArray(uri) ? uri[0] : uri
        // HLS 清单（.m3u8）不从 URL 末段取名：清单不是产物，末段又常是
        // index/playlist 这类通用名。不填 out，交给引擎按"末段是通用名则
        // 回退上级目录名 + 按实际容器定扩展名（fMP4→.mp4，其余→.ts）"命名，
        // 产物名因此更贴近站点自己的命名。
        if (isHlsManifestUri(uriStr)) {
          return ''
        }
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
        console.warn('[Lerxu] getUniqueFilename error:', e.message)
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
      .then(async (res) => {
        if (Array.isArray(res)) {
          // gid 的取法必须**同时认两族协议**（aria2 的 [gid] 包裹 vs 原生协议的裸
          // gid）：只按前者取 r[0] 时，原生协议下拿到的是 gid 的第一个字符，
          // 下面那些"写进任务历史"的字段（配对 id / 创建时间 / 来源标记）就全
          // 挂到了不存在的 gid 上 —— 一对音视频因此永远折叠不成一条记录，
          // 合并也一直靠文件名猜（见 @shared/utils 的 unwrapMulticallValues）
          const gids = unwrapMulticallValues(res).filter(Boolean).map(gid => normalizeGid(gid))
          const hasBrowserExtensionHeader = (opt) => {
            try {
              const o = opt && typeof opt === 'object' ? opt : {}
              const hs = o && o.header ? o.header : []
              const headers = Array.isArray(hs) ? hs : (typeof hs === 'string' ? [hs] : [])
              return headers.some(h => /X-Lerxu-Source\s*:\s*BrowserExtension/i.test(`${h}`))
            } catch (_) {
              return false
            }
          }
          const fromBrowserExtension =
            hasBrowserExtensionHeader(normalizedOptions) ||
            (Array.isArray(optionsList) && optionsList.some(o => hasBrowserExtensionHeader(o)))
          // 扩展发来的一对音视频（画面流 / 声音流）带同一个 pairId 与各自角色，
          // 必须**落进任务历史**：下载完成事件里要据此配对合并，而那时任务可能
          // 已经被引擎清理、只剩历史可查（用户点名要合并可靠）
          const pairId = data && data.pairId ? `${data.pairId}` : ''
          const pairRole = data && data.pairRole ? `${data.pairRole}` : ''
          try {
            const now = Date.now()
            gids.forEach(gid => {
              const patch = { createdAt: now }
              if (fromBrowserExtension) patch.fromBrowserExtension = true
              if (pairId) {
                patch.pairId = pairId
                patch.pairRole = pairRole
              }
              taskHistory.updateTask(`${gid}`, patch, null)
            })
          } catch (e) {}
          if (Array.isArray(priorities) && priorities.length === gids.length) {
            const mapping = {}
            for (let i = 0; i < gids.length; i++) {
              mapping[gids[i]] = Number(priorities[i]) || 0
            }
            this.UPDATE_TASK_PRIORITIES(mapping)

            try {
              const existing = (usePreferenceStore() && usePreferenceStore().config && usePreferenceStore().config.taskPriorities) || {}
              const persist = { ...existing }
              for (let i = 0; i < gids.length; i++) {
                const dir = Array.isArray(dirs) && dirs[i] ? dirs[i] : (options && options.dir) || (usePreferenceStore() && usePreferenceStore().config && usePreferenceStore().config.dir) || ''
                const out = Array.isArray(baseOuts) && baseOuts[i] ? baseOuts[i] : ''
                if (dir && out) {
                  const key = `${dir}|${out}`
                  persist[key] = Number(priorities[i]) || 0
                }
              }
              usePreferenceStore().save({ taskPriorities: persist })
              // 延迟通知优先级管理器重新平衡资源，确保配置已保存
              setTimeout(() => {
                try {
                  api.rebalancePriority()
                } catch (e) {}
              }, 500)
            } catch (e) {}
          }
          const preferenceConfig = (usePreferenceStore() && usePreferenceStore().config) || {}
          const autoOpenTaskProgressWindow = preferenceConfig.autoOpenTaskProgressWindow !== false
          if (autoOpenTaskProgressWindow && gids.length > 0) {
            try {
              const { commands: commandsInstance } = await import('@/components/CommandManager/instance')
              const gid = `${gids[0]}`
              commandsInstance.emit('task-progress:auto-open', { gid })
            } catch (e) {}
          }
        }
        this.fetchList()
        useAppStore().updateAddTaskOptions()
      })
  },
  addTorrent (data) {
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
        this.fetchList()
        useAppStore().updateAddTaskOptions()
      })
  },
  addMetalink (data) {
    const { metalink, options } = data
    return api.addMetalink({ metalink, options })
      .then((gid) => {
        try {
          if (gid) {
            taskHistory.updateTask(`${gid}`, { createdAt: Date.now() }, null)
          }
        } catch (e) {}
        this.fetchList()
        useAppStore().updateAddTaskOptions()
      })
  },
  getTaskOption (gid) {
    return api.getOption({ gid })
  },
  changeTaskOption (payload) {
    const { gid, options } = payload
    return api.changeOption({ gid, options })
  },
  removeTask (task) {
    const gid = task && task.gid ? `${task.gid}` : ''
    if (gid === this.currentTaskGid) {
      this.hideTaskDetail()
    }

    const members = this.resolvePairMembers(task)
    return runForMembers(members, (member) => {
      const memberGid = member && member.gid ? `${member.gid}` : ''
      if (!memberGid) {
        return Promise.resolve(true)
      }
      return api.removeTask({ gid: memberGid })
    }, 'removeTask')
      .finally(() => {
        this.CLEAR_TASK_CACHES_FOR_GIDS(members.map(m => `${m.gid}`))
        this.fetchList()
        useAppStore().fetchGlobalStat(null)
        this.saveSession()
      })
  },
  forcePauseTask (task) {
    // 排队中的成员也一起停：删除流程里让它继续排队，删掉之前可能就启动了
    const pausable = this.pausableMemberStatuses()
    const targets = this.resolvePairMembers(task).filter(m => pausable.includes(`${m.status || ''}`))
    if (targets.length === 0) {
      return Promise.resolve(true)
    }

    // 任务可能处于无法暂停的状态（如已完成、正在完成、已被移除等）。
    // 调用方均为删除流程，暂停失败不应阻塞后续的任务移除操作。
    return Promise.all(targets.map(m => api.forcePauseTask({ gid: `${m.gid}` })
      .catch((e) => {
        console.warn('[Lerxu] forcePauseTask failed, continuing with removal:', e && e.message)
      })))
      .finally(() => {
        this.fetchList()
        this.saveSession()
      })
  },
  /**
   * 拿出"这条记录背后的全部引擎任务"。
   *
   * ⚠️ 调用方给的 `task` **未必是列表里的折叠记录**：独立进度窗、托盘菜单、
   * 详情抽屉拿到的是**单条引擎任务**（`api.fetchTaskItem` 的结果，没有
   * `pairMembers`、也没有 `pairId`）。只按它自己暂停/删除，就会漏掉另一半 ——
   * 表现就是用户说的"（视频+音频）任务无法暂停"（画面停了、声音还在下，
   * 记录仍是"下载中"）。
   *
   * 所以先按**当前列表里的折叠记录**认：gid / pairGids / pairId 任一命中即可；
   * pairId 还可以从任务历史里按 gid 反查（引擎任务对象上没有它）。
   */
  resolvePairMembers (task) {
    const gid = task && `${task.gid || ''}`
    if (!task) {
      return []
    }
    let pairId = task.pairId ? `${task.pairId}` : ''
    if (!pairId && gid) {
      try {
        const entry = (taskHistory.getAllHistory() || []).find(x => x && `${x.gid || ''}` === gid)
        if (entry && entry.pairId) {
          pairId = `${entry.pairId}`
        }
      } catch (_) {}
    }
    if (gid || pairId) {
      const lists = [this.taskList || [], this.allTaskList || []]
      for (const list of lists) {
        for (const row of list) {
          if (!row || row.isPair !== true) {
            continue
          }
          const matched = (gid && `${row.gid || ''}` === gid) ||
            (pairId && `${row.pairId || ''}` === pairId) ||
            (gid && Array.isArray(row.pairGids) && row.pairGids.some(g => `${g}` === gid))
          if (!matched) {
            continue
          }
          if (Array.isArray(row.pairMembers) && row.pairMembers.length > 0) {
            return row.pairMembers.filter(Boolean)
          }
        }
      }
    }
    return pairMemberTasks(task)
  },
  /**
   * 可以被"暂停"的成员状态。
   *
   * `waiting`（排队中）**必须算**：引擎把它停下完全可行，而它在配对记录里很常见 ——
   * 第二条流刚建好还没轮到、或刚"继续"回来排在队里。只认 `active` 时点暂停会
   * **一个目标都筛不到 → 静默什么都不做**，用户看到的就是"（视频+音频）任务无法暂停"。
   */
  pausableMemberStatuses () {
    return [TASK_STATUS.ACTIVE, TASK_STATUS.WAITING]
  },
  pauseTask (task) {
    // 配对记录：两条流都要暂停，只停画面会让用户看到"还在跑"
    const pausable = this.pausableMemberStatuses()
    const targets = this.resolvePairMembers(task).filter(m => pausable.includes(`${m.status || ''}`))
    if (targets.length === 0) {
      // 没有可暂停的成员：不做事，但**要让调用方知道**（它据此给出提示，
      // 而不是像以前那样先弹"已暂停"再什么都不发生）
      return Promise.resolve({ changed: 0, targets: 0 })
    }
    return runForMembers(targets, (member) => {
      // BT任务使用强制暂停以加快暂停速度
      // 普通HTTP/FTP任务使用普通暂停
      return checkTaskIsBT(member)
        ? api.forcePauseTask({ gid: `${member.gid}` })
        : api.pauseTask({ gid: `${member.gid}` })
    }, 'pauseTask')
      .then(() => ({ changed: targets.length, targets: targets.length }))
      .finally(() => {
        useAppStore().resetInterval(null)
        this.fetchList()
        this.saveSession()
      })
  },
  resumeTask (task) {
    // 与暂停对称：`waiting` 也要算 —— 排队中的任务点"继续"应当把它推进（引擎
    // 的 unpause 对排队任务是有效的），只认 `paused` 会让"排队中"的记录点了没反应
    const targets = this.resolvePairMembers(task).filter(m => {
      const s = `${m.status || ''}`
      return s === TASK_STATUS.PAUSED || s === TASK_STATUS.WAITING
    })
    if (targets.length === 0) {
      return Promise.resolve({ changed: 0, targets: 0 })
    }
    return runForMembers(targets, (member) => this.resumeSingleTask(member), 'resumeTask')
      .then(() => ({ changed: targets.length, targets: targets.length }))
      .finally(() => {
        useAppStore().resetInterval(null)
        this.fetchList()
        this.saveSession()
      })
  },
  /**
   * 恢复**一条引擎任务**（磁力断链修复 + out 回填 + resume）。
   *
   * 逻辑与原来的 `resumeTask` 一字不差，只是抽出来：折叠成一条记录的一对
   * 音视频要对两条任务各跑一遍，而每条都要做自己那套修复。
   */
  resumeSingleTask (task) {
    const { gid } = task
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
        const option = await this.getTaskOption(gid)
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
        await this.changeTaskOption({
          gid,
          options: { out: fallbackOut }
        })
      } catch (_) {}
    }
    return repairBtBrokenUri()
      .then(() => ensureBtResumeOptions())
      .then(() => api.resumeTask({ gid }))
  },
  pauseAllTask () {
    // 与单个 BT 任务暂停策略一致：优先使用 forcePauseAll。
    // 普通 pauseAll 对 BT 任务是软停止（等 peer/tracker 命令自然退出），
    // 用户会感觉"全部暂停很久才生效"。
    return api.forcePauseAllTask({})
      .catch(() => {
        return api.pauseAllTask({})
      })
      .then(() => {
        // 立即获取任务列表和全局统计以加快UI更新
        return Promise.all([
          this.fetchList().catch(err => {
            console.error('[Lerxu] pauseAllTask: fetchList failed', err)
          }),
          useAppStore().fetchGlobalStat().catch(err => {
            console.error('[Lerxu] pauseAllTask: fetchGlobalStat failed', err)
          })
        ])
      })
      .finally(() => {
        this.saveSession()
      })
  },
  resumeAllTask () {
    return api.resumeAllTask({})
      .then(() => {
        // 立即获取任务列表和全局统计以加快UI更新
        return Promise.all([
          this.fetchList().catch(err => {
            console.error('[Lerxu] resumeAllTask: fetchList failed', err)
          }),
          useAppStore().fetchGlobalStat().catch(err => {
            console.error('[Lerxu] resumeAllTask: fetchGlobalStat failed', err)
          })
        ])
      })
      .finally(() => {
        this.saveSession()
      })
  },
  updateMagnetStatus (payload) {
    this.UPDATE_MAGNET_STATUS(payload)
  },
  clearMagnetStatus (gid) {
    this.CLEAR_MAGNET_STATUS(gid)
  },
  setPendingFileSelection (gid, infoHash) {
    this.SET_PENDING_FILE_SELECTION({ gid, infoHash })
  },
  clearPendingFileSelection (gid) {
    this.CLEAR_PENDING_FILE_SELECTION(gid)
  },
  loadPendingFileSelection () {
    const mapping = pendingFileSelectionStore.getAll()
    this.LOAD_PENDING_FILE_SELECTION(mapping)
    this.LOAD_CONFIRMED_FILE_SELECTION(pendingFileSelectionStore.getConfirmedAll())
  },
  confirmFileSelection (payload) {
    this.CONFIRM_FILE_SELECTION(payload)
  },
  syncPendingFileSelection (tasks) {
    // 根据当前任务列表校验待选择文件状态:
    // - pending(待选择): 保留仍为暂停态、BT 元数据就绪、多文件且无进度的任务；
    //   判定只看任务自身状态（isTaskPendingSelectionCandidate），不读 confirmed
    //   记录——同一 infoHash 的历史确认可能属于旧实例，若据此否决会让用户
    //   尚未选择文件的新实例在重启后退回普通"暂停"。
    //   记录值带 infoHash 时，gid 漂移后可改挂到同哈希的当前任务上，
    //   暂时匹配不上的保留等待，避免重启后退回普通"暂停"显示
    // - confirmed(已确认选择): 只要任务仍存在（任意状态）就保留，仅作历史
    //   记录维护，不再参与待选择判定。
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
      const completed = Number(task.completedLength || 0)
      if (!bt || !bt.info) {
        // 重启后引擎可能仍在重新解析元数据（bittorrent.info 暂缺）：
        // 此时清除待选择标记会让任务退回普通"暂停"显示。
        // 仅保留无下载进度的任务——已有进度说明早已开始下载，
        // 不属于待选择文件场景。
        if (completed === 0) {
          validPendingGids.add(gid)
        }
        return
      }
      // 以任务自身状态判定是否为待选择候选（paused/多文件/无进度）。
      // 同一 infoHash 的历史 confirmed 记录不足以否决：用户可能对旧实例
      // 确认过选择，而当前磁力实例尚未选择文件，重启后仍应标待选择
      if (isTaskPendingSelectionCandidate(task)) {
        validPendingGids.add(gid)
      }
    })
    const current = this.pendingFileSelection || {}
    const confirmed = this.confirmedFileSelection || {}
    const taskByHash = new Map()
    list.forEach(task => {
      const hash = getTaskInfoHash(task)
      if (hash && !taskByHash.has(hash)) {
        taskByHash.set(hash, task)
      }
    })
    // 先处理 confirmed：磁力任务的 BT 阶段 gid 每次重启都会漂移，
    // 已确认记录按 infoHash 改挂到当前同哈希任务上；若磁力尚未解析
    // 完成（列表中暂时没有对应任务），保留原条目等待匹配，绝不能直接
    // 丢弃。改挂结果同时用于抑制待选择标记——已确认过文件选择的任务
    // 重启后不应再显示"待选择文件"
    const nextConfirmed = {}
    Object.keys(confirmed).forEach(gid => {
      if (existingGids.has(gid)) {
        nextConfirmed[gid] = confirmed[gid]
        return
      }
      const v = confirmed[gid]
      if (typeof v === 'string' && v.trim()) {
        const target = taskByHash.get(v.trim().toLowerCase())
        if (target && target.gid) {
          nextConfirmed[`${target.gid}`] = v
        } else {
          nextConfirmed[gid] = v
        }
      }
      // 值为 true 的旧格式条目且任务已不存在 → 自然丢弃
    })
    const next = {}
    const keepPending = (gid, hash) => {
      // 同一哈希可能有多条历史 gid 记录，合并为一条
      next[gid] = hash || true
    }
    Object.keys(current).forEach(gid => {
      const storedHash = typeof current[gid] === 'string' ? current[gid].trim().toLowerCase() : ''
      const task = list.find(t => `${t.gid || ''}` === gid)
      const hash = getTaskInfoHash(task) || storedHash
      if (validPendingGids.has(gid)) {
        // 该任务已确认过文件选择（按 gid 或同哈希）时清除待选择标记：
        // 选择结果已随会话保存，重启后应沿用而不是重新询问
        if (task && isTaskFileSelectionConfirmed(nextConfirmed, task)) {
          return
        }
        keepPending(gid, hash)
        return
      }
      if (existingGids.has(gid)) {
        // 任务仍在但已不属于待选择场景（已选文件/已有进度/非多文件）
        return
      }
      if (!storedHash) {
        // 无哈希可匹配且任务已消失 → 丢弃
        return
      }
      if (isTaskFileSelectionConfirmed(nextConfirmed, { infoHash: storedHash })) {
        // 该哈希已确认过文件选择，孤儿待选择记录作废
        return
      }
      const target = taskByHash.get(storedHash)
      const targetGid = target && target.gid ? `${target.gid}` : ''
      if (targetGid && isTaskPendingSelectionTarget(target) && !nextConfirmed[targetGid]) {
        keepPending(targetGid, storedHash)
        return
      }
      // 磁力尚未重新解析完元数据（当前列表里还没有可比对的任务）：
      // 保留原条目等待匹配，丢弃会让任务退回普通"暂停"显示
      keepPending(gid, storedHash)
    })
    const pendingChanged =
      Object.keys(next).length !== Object.keys(current).length ||
      Object.keys(next).some(k => current[k] !== next[k])
    if (pendingChanged) {
      this.REPLACE_PENDING_FILE_SELECTION(next)
    }
    const confirmedChanged =
      Object.keys(nextConfirmed).length !== Object.keys(confirmed).length ||
      Object.keys(nextConfirmed).some(k => nextConfirmed[k] !== confirmed[k])
    if (confirmedChanged) {
      this.LOAD_CONFIRMED_FILE_SELECTION(nextConfirmed)
    }
  },
  addToSeedingList (gid) {
    const { seedingList } = this
    if (seedingList.includes(gid)) {
      return
    }

    const list = [
      ...seedingList,
      gid
    ]
    this.UPDATE_SEEDING_LIST(list)
  },
  removeFromSeedingList (gid) {
    const { seedingList } = this
    const idx = seedingList.indexOf(gid)
    if (idx === -1) {
      return
    }

    const list = [...seedingList.slice(0, idx), ...seedingList.slice(idx + 1)]
    this.UPDATE_SEEDING_LIST(list)
  },
  addToMergingList ({ gid, mergeKey = '' }) {
    const { mergingList } = this
    if (mergingList.includes(gid)) {
      if (mergeKey) this.SET_MERGE_KEY({ gid, key: mergeKey })
      return
    }

    const list = [
      ...mergingList,
      gid
    ]
    this.UPDATE_MERGING_LIST(list)
    if (mergeKey) this.SET_MERGE_KEY({ gid, key: mergeKey })
  },
  removeFromMergingList (gidOrTask) {
    // 折叠成一条记录的「一对音视频」在 mergingList 里挂的是**成员** gid
    // （合并由"后下完的那条"触发），所以既接受 gid 也接受整条记录
    const gids = gidOrTask && typeof gidOrTask === 'object'
      ? pairMemberTasks(gidOrTask).map(m => `${m.gid}`)
      : [`${gidOrTask || ''}`]
    const targets = gids.filter(Boolean)
    if (targets.length === 0) {
      return
    }

    const list = this.mergingList.filter(gid => !targets.includes(`${gid}`))
    if (list.length === this.mergingList.length) {
      return
    }

    this.UPDATE_MERGING_LIST(list)
  },
  /**
   * 登记"这一对不会再合并了"（重试耗尽 / 缺另一半 / 合并失败收尾 / 合并已成功）。
   *
   * 折叠记录据此把进度条从"待合并的黄"收回普通档：进度条的判据已经改成
   * "配对 + 下载完成 + 没合并"就算待合并（不再看成员还剩几条 —— 成员数会被
   * 隐藏规则和合并收敛改掉，判据时灵时不灵）。所以必须有一个**明确的"不合并了"**
   * 信号，否则"只有一条流、永远等不到另一半"的记录会一直挂在黄条上。
   */
  addMergeSkippedGids (gids) {
    const targets = (Array.isArray(gids) ? gids : [gids])
      .map(g => `${g || ''}`)
      .filter(Boolean)
    if (targets.length === 0) {
      return
    }

    const existing = new Set((this.mergeSkippedList || []).map(g => `${g}`))
    const added = targets.filter(g => !existing.has(g))
    if (added.length === 0) {
      return
    }

    const list = [...(this.mergeSkippedList || []), ...added]
    // 与 mergeRetryManager 的定时器一样是"进程内簿记"：给个上限防止无限增长
    // （超出时丢最旧的；被丢的最坏结果是重试耗尽后多显示一次黄条）
    const MAX = 2000
    this.UPDATE_MERGE_SKIPPED_LIST(list.length > MAX ? list.slice(list.length - MAX) : list)

    // **立刻**把已经在列表里的记录标上。折叠记录是 1Hz 轮询重建的，只更新簿记
    // 要等下一拍才生效 —— 那半秒里进度条已经退成"已完成 + 等待合并…"的黄条，
    // 正是用户看到的"合并完又冒出等待合并"（诊断采样实测：簿记已含两个成员 gid，
    // 记录却还是 mergeSkipped=false）。
    // 与 `SET_TASK_STATUS` 同一套做法：直接写记录字段，让这一拍就正确。
    const addedSet = new Set(added)
    const touched = this.patchPairRowsByGids(addedSet, (row) => {
      row.mergeSkipped = true
    })
    // 记录被就地改了，数组引用没变 —— 递增 revision 让依赖列表的逻辑感知到
    if (touched) {
      this.taskListRevision++
    }
  },
  /** 按成员 gid 命中折叠记录（就地打补丁用）：返回是否命中至少一条。 */
  patchPairRowsByGids (gidSet, patch) {
    if (!gidSet || gidSet.size === 0 || typeof patch !== 'function') {
      return false
    }
    let touched = false
    const apply = (row) => {
      if (!row || row.isPair !== true) {
        return
      }
      const gids = [
        row.gid,
        ...(Array.isArray(row.pairGids) ? row.pairGids : []),
        ...(Array.isArray(row.pairMembers) ? row.pairMembers.map(m => m && m.gid) : [])
      ].map(g => `${g || ''}`)
      if (!gids.some(g => gidSet.has(g))) {
        return
      }
      patch(row)
      touched = true
    }
    ;(this.taskList || []).forEach(apply)
    ;(this.allTaskList || []).forEach(apply)
    return touched
  },
  setTaskStatus (payload) {
    this.SET_TASK_STATUS(payload)
  },
  setMergeProgress (payload) {
    this.SET_MERGE_PROGRESS(payload)
  },
  removeAllMergingByMergeKey (key) {
    if (!key) return
    const gidsToRemove = []
    for (const [gid, k] of Object.entries(this.mergeKeys || {})) {
      if (k === key) gidsToRemove.push(gid)
    }
    if (gidsToRemove.length === 0) return
    const list = this.mergingList.filter(gid => !gidsToRemove.includes(gid))
    this.UPDATE_MERGING_LIST(list)
    this.DELETE_MERGE_KEYS_BY_KEY(key)
    gidsToRemove.forEach(gid => {
      this.CLEAR_MERGE_PROGRESS(gid)
    })
  },
  clearMergeProgress (gid) {
    this.CLEAR_MERGE_PROGRESS(gid)
  },
  clearMergeProgressByMergeKey (key) {
    if (!key) return
    for (const [gid, k] of Object.entries(this.mergeKeys || {})) {
      if (k === key) {
        this.CLEAR_MERGE_PROGRESS(gid)
      }
    }
  },
  stopSeeding ({ gid }) {
    const config = (usePreferenceStore() && usePreferenceStore().config) || {}
    const action = `${config.stopSeedingAction || 'pause'}`.trim().toLowerCase()
    const shouldComplete = action === 'complete'

    const promise = shouldComplete
      ? this.changeTaskOption({
        gid,
        options: { seedTime: 0 }
      })
      : api.forcePauseTask({ gid }).catch(() => api.pauseTask({ gid }))

    return promise.then(() => {
      this.fetchList()
      this.saveSession()
    })
  },
  async banPeer ({ gid, ip, duration }) {
    await api.banPeer({ gid, ip, duration })

    const ipText = `${ip || ''}`.trim()
    const durationNum = Number(duration)
    if (!ipText || durationNum !== -1) {
      return
    }

    try {
      const config = (usePreferenceStore() && usePreferenceStore().config) || {}
      const currentList = normalizeBtIpBanList(config.btIpBanList)
      if (!currentList.includes(ipText)) {
        await usePreferenceStore().save({ btIpBanList: [...currentList, ipText] })
      }
    } catch (err) {
      console.warn('[task] sync btIpBanList after permanent peer ban failed:', err)
    }
  },
  async unbanPeer ({ gid, ip }) {
    await api.unbanPeer({ gid, ip })

    const ipText = `${ip || ''}`.trim()
    if (!ipText) {
      return
    }

    try {
      const config = (usePreferenceStore() && usePreferenceStore().config) || {}
      const currentList = normalizeBtIpBanList(config.btIpBanList)
      const nextList = currentList.filter(item => item !== ipText)
      if (nextList.length !== currentList.length) {
        await usePreferenceStore().save({ btIpBanList: nextList })
      }
    } catch (err) {
      console.warn('[task] sync btIpBanList after peer unban failed:', err)
    }
  },
  removeTaskRecord (task) {
    const gid = task && task.gid ? `${task.gid}` : ''
    if (gid === this.currentTaskGid) {
      this.hideTaskDetail()
    }

    const { ERROR, COMPLETE, REMOVED } = TASK_STATUS
    const validStatus = task && task.status ? task.status : REMOVED // 确保状态有效
    if (![ERROR, COMPLETE, REMOVED].includes(validStatus)) {
      return
    }

    // 一对音视频要把**两条**记录都清掉：只清一条的话，下一轮轮询里那条还会
    // 以"孤零零的配对记录"身份留在列表上（引擎侧记录删了、历史里还在）。
    const members = this.resolvePairMembers(task)
    // 尝试从Aria2中删除任务记录，如果失败则忽略，因为任务可能已经不在Aria2中
    return Promise.all(members.map(member => api.removeTaskRecord({ gid: `${member.gid}` })
      .catch((err) => {
        console.log('[Lerxu] removeTaskRecord from aria2 fail:', err)
        // 忽略Aria2删除失败的错误，继续执行
      })))
      .finally(() => {
        this.clearTaskCachesForGids(members.map(m => `${m.gid}`))
        this.fetchList()
        useAppStore().fetchGlobalStat(null)
      })
  },
  clearTaskCachesForGids (gids) {
    this.CLEAR_TASK_CACHES_FOR_GIDS(gids)
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
  purgeTaskRecord () {
    return api.purgeTaskRecord({})
      .finally(() => this.fetchList())
  },
  toggleTask (task) {
    const { status } = task
    const { ACTIVE, WAITING, PAUSED } = TASK_STATUS
    if (status === ACTIVE) {
      return this.pauseTask(task)
    } else if (status === WAITING || status === PAUSED) {
      return this.resumeTask(task)
    }
  },
  batchResumeSelectedTasks () {
    // 选中一条配对记录要展开成它背后的两条引擎任务，否则只恢复了其中一条流
    const gids = expandPairGids(pairMemberIndex, this.selectedGidList)
    if (gids.length === 0) {
      return
    }

    return api.batchResumeTask({ gids })
  },
  batchPauseSelectedTasks () {
    const gids = expandPairGids(pairMemberIndex, this.selectedGidList)
    if (gids.length === 0) {
      return
    }

    return api.batchPauseTask({ gids })
  },
  batchForcePauseTask (gids) {
    return api.batchForcePauseTask({ gids: expandPairGids(pairMemberIndex, gids) })
      .catch((e) => {
        // 批量暂停在删除流程中属于尽力而为的步骤，失败不应阻塞后续移除。
        console.warn('[Lerxu] batchForcePauseTask failed, continuing with removal:', e && e.message)
      })
  },
  batchResumeTask (gids) {
    return api.batchResumeTask({ gids: expandPairGids(pairMemberIndex, gids) })
  },
  batchRemoveTask (gids) {
    const list = expandPairGids(pairMemberIndex, gids)
    return api.batchRemoveTask({ gids: list })
      .finally(() => {
        this.CLEAR_TASK_CACHES_FOR_GIDS(list)
        this.fetchList()
        useAppStore().fetchGlobalStat(null)
        this.saveSession()
      })
  },
  async updateTaskLink (payload) {
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
      this.clearTaskNeedUpdateLink(gid)
      await this.fetchList().catch(() => {})
      return
    }

    const effectiveDesiredHeaderLines = effectiveHeaderLines

    if (wasActiveOrWaiting) {
      await this.pauseTask(current).catch(() => {})
      await this.fetchList().catch(() => {})
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

      this.clearTaskNeedUpdateLink(gid)

      const oldStatus = status
      if ([TASK_STATUS.ERROR, TASK_STATUS.COMPLETE, TASK_STATUS.REMOVED].includes(oldStatus)) {
        await this.removeTaskRecord({ gid, status: oldStatus }).catch(() => {})
      } else {
        await this.removeTask().catch(() => {})
      }

      await this.fetchList().catch(() => {})
      return
    }

    this.clearTaskNeedUpdateLink(gid)
    await this.fetchList().catch(() => {})
    if (wasActiveOrWaiting) {
      await this.resumeTask({ gid, status: TASK_STATUS.PAUSED }).catch(() => {})
    }
    await this.fetchList().catch(() => {})
  }
}

export const useTaskStore = defineStore('task', {
  state,
  getters,
  actions: {
    ...mutations,
    ...actions
  }
})
