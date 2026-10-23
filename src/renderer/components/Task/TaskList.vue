<template>
  <mo-drag-select
    :class="['task-list', `task-list--${viewMode}`]"
    v-if="hasAnyTask"
    attribute="attr"
    @change="handleDragSelectChange"
    @mousedown="handleListBlankClick"
  >
    <!-- 端手互通：传输任务与普通任务共用同一个卡片组件。传输记录也参与
         框选/多选，选中 ID 加 `lan:` 前缀与引擎 gid 区分（批量操作按前缀分流）。 -->
    <div
      v-for="entry in renderRows"
      :key="entry.key"
      :attr="entry.attr"
      v-memo="entry.memo"
      :class="entry.classes"
      @click.stop="(e) => handleRowClick(entry, e)"
      @contextmenu.stop.prevent="(e) => handleRowContextMenu(entry, e)"
    >
      <mo-task-item
        :task="entry.row"
        :view-mode="viewMode"
        :resize-version="resizeVersion"
        :lan="entry.lan"
      />
    </div>
  </mo-drag-select>
  <div class="no-task" v-else>
    <div class="no-task-inner">
      {{ t('task.no-task') }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ipcRenderer } from 'electron'
import { Menu, getCurrentWindow } from '@electron/remote'
import cloneDeep from 'lodash/cloneDeep'
import {
  checkTaskIsSeeder,
  getFileExtension,
  getFileNameFromFile,
  getTaskName
} from '@shared/utils'
import {
  AUDIO_SUFFIXES,
  DOCUMENT_SUFFIXES,
  IMAGE_SUFFIXES,
  SUB_SUFFIXES,
  VIDEO_SUFFIXES,
  TASK_STATUS
} from '@shared/constants'
import i18n from '@/plugins/i18n'
import { getTaskActualPath } from '@/utils/native'
import { commands } from '@/components/CommandManager/instance'
import { useTaskStore } from '@/store/task'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'

const { t } = i18n.global

const CATEGORY_SUFFIXES = {
  archives: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']),
  programs: new Set(['exe', 'msi', 'deb', 'rpm', 'dmg', 'apk', 'app']),
  videos: new Set([...VIDEO_SUFFIXES, ...SUB_SUFFIXES].map(s => `${s}`.toLowerCase().replace(/^\./, ''))),
  music: new Set(AUDIO_SUFFIXES.map(s => `${s}`.toLowerCase().replace(/^\./, ''))),
  images: new Set(IMAGE_SUFFIXES.map(s => `${s}`.toLowerCase().replace(/^\./, ''))),
  documents: new Set(DOCUMENT_SUFFIXES.map(s => `${s}`.toLowerCase().replace(/^\./, '')))
}

const normalizeKeystrokeTokens = (str) => {
  return `${str || ''}`
    .trim()
    .toLowerCase()
    .split(/[-+]/g)
    .map(s => `${s || ''}`.trim())
    .filter(Boolean)
    .map(t => {
      if (t === 'control') return 'ctrl'
      if (t === 'command' || t === 'meta') return 'cmd'
      if (t === 'commandorcontrol' || t === 'cmdorctrl') return 'cmdctrl'
      return t
    })
}

const props = defineProps({
  category: {
    type: String,
    default: ''
  },
  keyword: {
    type: String,
    default: ''
  }
})

defineOptions({ name: 'mo-task-list' })

const taskStore = useTaskStore()
const preferenceStore = usePreferenceStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)
const { currentList, filterDate } = storeToRefs(taskStore)

const selectedList = ref(cloneDeep(taskStore.selectedGidList) || [])
const isMultiSelectModifierPressed = ref(false)
const isMultiSelectMode = ref(false)
const resizeVersion = ref(0)

// 端手互通：主进程通过 lan:update 推送全量（最多 50 条）传输任务
const lanTasks = ref([])

let handleKeyEvent = null
let handleResize = null

const displayTaskList = computed(() => {
  const baseList = !props.category
    ? taskStore.taskList
    : taskStore.taskList.filter((task) => taskMatchesCategory(task, props.category))
  const q = `${props.keyword || ''}`.trim().toLowerCase()
  if (!q) return baseList
  return baseList.filter((task) => {
    const name = getTaskName(task, { defaultName: '', maxLen: -1 }) || ''
    const uri = `${task && task.uri ? task.uri : ''}`.toLowerCase()
    const gid = `${task && task.gid ? task.gid : ''}`.toLowerCase()
    const loweredName = `${name}`.toLowerCase()
    return loweredName.includes(q) || uri.includes(q) || gid.includes(q)
  })
})

const multiSelectModifier = computed(() => {
  const v = preferenceConfig.value && preferenceConfig.value.taskMultiSelectModifier
  return (v ? `${v}`.toLowerCase() : 'ctrl').trim()
})

const multiSelectKeystroke = computed(() => {
  const tokens = normalizeKeystrokeTokens(multiSelectModifier.value)
  const modifiers = []
  let key = ''
  tokens.forEach(t => {
    if (t === 'cmdctrl' || t === 'ctrl' || t === 'cmd' || t === 'shift' || t === 'alt') {
      if (!modifiers.includes(t)) modifiers.push(t)
    } else {
      key = t
    }
  })
  const normalized = [...modifiers, key].filter(Boolean).join('-')
  return normalized || 'ctrl'
})

const multiSelectModifiers = computed(() => {
  const tokens = normalizeKeystrokeTokens(multiSelectKeystroke.value)
  const allowed = new Set(['cmdctrl', 'ctrl', 'cmd', 'shift', 'alt'])
  const uniq = []
  tokens.forEach(t => {
    if (!allowed.has(t)) return
    if (uniq.includes(t)) return
    uniq.push(t)
  })
  return uniq.length > 0 ? uniq : ['ctrl']
})

const isMultiSelectToggleShortcut = computed(() => {
  const tokens = normalizeKeystrokeTokens(multiSelectKeystroke.value)
  if (tokens.length === 0) return false
  const allowed = new Set(['cmdctrl', 'ctrl', 'cmd', 'shift', 'alt'])
  return tokens.some(t => !allowed.has(t))
})

const viewMode = computed(() => taskStore.viewMode)

/**
 * 传输任务归组：和引擎的 全部 / 下载中 / 等待中 / 已停止 对齐
 * （done、error 都是"已结束"，归到 stopped；行内再显示 已完成 / 失败）
 */
function lanStatusGroup (status) {
  if (status === 'active') return 'active'
  if (status === 'waiting') return 'waiting'
  return 'stopped'
}

function parseTaskDate (timestamp) {
  const raw = Number(timestamp)
  if (!Number.isFinite(raw) || raw <= 0) return null
  return new Date(raw < 1000000000000 ? raw * 1000 : raw)
}

function lanMatchesDate (task, date) {
  if (!date) return true
  // 与普通任务一致：终态记录按完成时间归档，进行中的才按创建时间
  const finished = task && (task.status === 'done' || task.status === 'error')
  const stamp = finished ? (task.finishedAt || task.createdAt) : (task && task.createdAt)
  const at = parseTaskDate(stamp)
  if (!at) return false
  const [year, month, day] = `${date}`.split('-').map(Number)
  return at.getFullYear() === year &&
    (at.getMonth() + 1) === month &&
    at.getDate() === day
}

function lanMatchesCategory (task, category) {
  const suffixes = getCategorySuffixes(category)
  if (suffixes.size === 0) return false
  const name = `${task && task.name ? task.name : ''}`
  const ext = `${getFileExtension(name)}`.toLowerCase()
  return !!ext && suffixes.has(ext)
}

/** 传输状态 → 引擎任务状态（卡片/进度条认的是这一套） */
const LAN_TASK_STATUS = {
  waiting: TASK_STATUS.WAITING,
  active: TASK_STATUS.ACTIVE,
  done: TASK_STATUS.COMPLETE,
  error: TASK_STATUS.ERROR
}

// 引擎 lan 任务里没有速度字段：按两次轮询的字节差自己算
const lanSpeedSamples = new Map()

function lanSpeedOf (task) {
  const now = Date.now()
  const bytes = Math.max(0, Number(task && task.transferred) || 0)
  const sample = lanSpeedSamples.get(task.id)
  let bps = 0
  if (task && task.status === 'active' && sample) {
    const delta = bytes - sample.bytes
    const elapsed = now - sample.at
    if (delta > 0 && elapsed >= 100) {
      const instant = delta * 1000 / elapsed
      bps = sample.bps > 0 ? sample.bps * 0.6 + instant * 0.4 : instant
    } else {
      bps = sample.bps || 0
    }
  }
  lanSpeedSamples.set(task.id, { bytes, at: now, bps })
  return bps
}

function lanErrorText (error) {
  const code = `${error || ''}`
  if (code === 'cancelled') return t('task.transfer-cancelled')
  if (code === 'interrupted') return t('task.transfer-interrupted')
  if (code === 'disposed') return ''
  return code
}

/**
 * 把引擎 lan 任务映射成普通任务的字段，交给 mo-task-item 渲染。
 * `lanTask` 保留原始对象（卡片上的取消/移除/打开文件夹要用）。
 */
function toLanTaskRow (task) {
  const size = Number(task.size) > 0 ? Number(task.size) : 0
  const transferred = Math.max(0, Number(task.transferred) || 0)
  const fullPath = (task.direction === 'in' ? task.path : task.sourcePath) || task.name || ''
  const finishedAt = Number(task.finishedAt) || 0
  const status = LAN_TASK_STATUS[task.status] || TASK_STATUS.WAITING

  const row = {
    gid: task.id,
    name: task.name,
    filename: task.name,
    status,
    totalLength: size,
    completedLength: size > 0 ? Math.min(transferred, size) : transferred,
    downloadSpeed: lanSpeedOf(task),
    uploadSpeed: 0,
    // 普通卡片在下载中会显示"连接数"：局域网传输固定一条连接
    connections: task.status === 'active' ? 1 : 0,
    // getTaskFullPath 认 files[0].path；没有绝对路径时用文件名兜底（只为显示名字）
    dir: '',
    files: fullPath
      ? [{ path: fullPath, length: String(size), completedLength: String(transferred), selected: 'true' }]
      : [],
    // 普通卡片用 savedAt 显示"完成于/错误于 …"（lan 任务的 finishedAt 就是本地完成时间）
    savedAt: finishedAt,
    lanTask: task
  }

  const reason = lanErrorText(task.error)
  if (status === TASK_STATUS.ERROR && reason) {
    const time = new Date(finishedAt || Date.now()).toLocaleString()
    row.statusRightText = `${t('task.error-at')} ${time} · ${reason}`
  }
  return row
}

const lanTaskRows = computed(() => {
  const list = currentList.value || 'all'
  const category = `${props.category || ''}`
  const date = filterDate.value || ''
  const keyword = `${props.keyword || ''}`.trim().toLowerCase()

  return (lanTasks.value || [])
    .filter((task) => {
      if (!task || !task.id) return false
      if (list !== 'all' && lanStatusGroup(task.status) !== list) return false
      if (category && !lanMatchesCategory(task, category)) return false
      if (!lanMatchesDate(task, date)) return false
      if (keyword) {
        const haystack = `${task.name || ''} ${task.peerName || ''} ${task.peerAddress || ''}`.toLowerCase()
        if (!haystack.includes(keyword)) return false
      }
      return true
    })
    .map(toLanTaskRow)
})

const hasAnyTask = computed(() => lanTaskRows.value.length > 0 || displayTaskList.value.length > 0)

const HISTORY_STATUSES = new Set([TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED])

function normalizeRowTimestamp (value) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return raw < 1000000000000 ? raw * 1000 : raw
}

function isHistoryRow (row) {
  return !!row && HISTORY_STATUSES.has(row.status)
}

/** 普通任务用 savedAt（完成/错误时间），传输任务用 finishedAt；进行中回退创建时间。 */
function historyTimestampOf (row, isLan) {
  if (isLan) {
    const raw = row && row.lanTask ? row.lanTask : {}
    const finished = raw.status === 'done' || raw.status === 'error'
    return normalizeRowTimestamp(finished ? (raw.finishedAt || raw.createdAt) : raw.createdAt)
  }
  return normalizeRowTimestamp(row.savedAt) ||
    normalizeRowTimestamp(row.completedTime) ||
    normalizeRowTimestamp(row.stopTime) ||
    normalizeRowTimestamp(row.createdAt)
}

/** 与 store 的 sortTaskList 同口径，补上传输记录（否则排序时它们只能粘在顶部）。 */
function sortValueOf (row, isLan, field) {
  switch (field) {
  case 'completedTime':
    return isLan ? historyTimestampOf(row, true) : (parseInt(row.savedAt) || 0)
  case 'remainingTime': {
    const total = parseInt(row.totalLength) || 0
    const done = parseInt(row.completedLength) || 0
    if (total <= 0 || done >= total) return 0
    const speed = parseInt(row.downloadSpeed) || 0
    return speed <= 0 ? Infinity : (total - done) / speed
  }
  case 'speed':
    return (parseInt(row.downloadSpeed) || 0) + (parseInt(row.uploadSpeed) || 0)
  case 'size':
    return parseInt(row.totalLength) || 0
  case 'name': {
    if (isLan) return `${row.name || ''}`.toLowerCase()
    if (row.pairDisplayName && Number(row.pairCount) >= 2) {
      return `${row.pairDisplayName}`.toLowerCase()
    }
    if (row.files && row.files.length > 0 && row.files[0].path) {
      return `${row.files[0].path}`.split(/[\\/]/).pop().toLowerCase()
    }
    if (row.dir) return `${row.dir}`.split(/[\\/]/).pop().toLowerCase()
    return row.gid || ''
  }
  default:
    return 0
  }
}

function compareRows (a, b, field, order) {
  const valueA = sortValueOf(a.row, a.lan, field)
  const valueB = sortValueOf(b.row, b.lan, field)
  let cmp = 0
  if (field === 'completedTime' && valueA === 0 && valueB === 0) {
    cmp = `${a.row.gid || ''}`.localeCompare(`${b.row.gid || ''}`)
  } else if (typeof valueA === 'string' || typeof valueB === 'string') {
    cmp = `${valueA}`.localeCompare(`${valueB}`)
  } else if (valueA < valueB) {
    cmp = -1
  } else if (valueA > valueB) {
    cmp = 1
  }
  return order === 'asc' ? cmp : -cmp
}

const renderRows = computed(() => {
  const engineRows = displayTaskList.value
  const lanRows = lanTaskRows.value
  const customSort = !!taskStore.sortField &&
    !(taskStore.sortField === 'name' && taskStore.sortOrder === 'asc')

  let ordered = []
  if (customSort) {
    ordered = [
      ...lanRows.map(row => ({ row, lan: true })),
      ...engineRows.map(row => ({ row, lan: false }))
    ]
    const field = taskStore.sortField
    const order = taskStore.sortOrder
    ordered.sort((a, b) => compareRows(a, b, field, order))
  } else {
    const lanHistory = []
    const lanOther = []
    lanRows.forEach(row => (isHistoryRow(row) ? lanHistory : lanOther).push(row))
    const engineHistory = []
    const engineOther = []
    engineRows.forEach(row => (isHistoryRow(row) ? engineHistory : engineOther).push(row))
    // 传输记录按完成时间并入普通历史记录（新的在上），不再永远置顶
    const mergedHistory = [...engineHistory]
    const sortedLanHistory = [...lanHistory]
      .sort((a, b) => historyTimestampOf(b, true) - historyTimestampOf(a, true))
    sortedLanHistory.forEach(row => {
      const ts = historyTimestampOf(row, true)
      const idx = mergedHistory.findIndex(item => historyTimestampOf(item, false) < ts)
      if (idx < 0) mergedHistory.push(row)
      else mergedHistory.splice(idx, 0, row)
    })
    ordered = [
      ...lanOther.map(row => ({ row, lan: true })),
      ...engineOther.map(row => ({ row, lan: false })),
      ...mergedHistory.map(row => ({ row, lan: lanHistory.includes(row) }))
    ]
  }

  return ordered.map(({ row, lan }) => {
    const selectionId = lan ? `lan:${row.gid}` : `${row.gid}`
    const selected = selectedList.value.includes(selectionId)
    return {
      key: selectionId,
      attr: selectionId,
      row,
      lan,
      classes: {
        'task-item-wrapper': true,
        [`task-item-wrapper--${viewMode.value}`]: true,
        'task-item-wrapper--lan': lan,
        selected
      },
      memo: lan
        ? [row.status, row.completedLength, row.downloadSpeed, viewMode.value, resizeVersion.value, selected]
        : [row.status, row.completedLength, row.downloadSpeed, row.uploadSpeed, row.uploadLength, row.connections, row.numSeeders, viewMode.value, resizeVersion.value, selected]
    }
  })
})

function applyLanPayload (payload) {
  if (payload && Array.isArray(payload.tasks)) {
    lanTasks.value = payload.tasks
  }
}

function handleLanUpdate (_event, payload) {
  applyLanPayload(payload)
}

async function refreshLanTasks () {
  try {
    const tasks = await ipcRenderer.invoke('lan:tasks')
    if (Array.isArray(tasks)) {
      lanTasks.value = tasks
    }
  } catch (_) {}
}

// Lifecycle
onMounted(() => {
  handleKeyEvent = (e) => {
    if (e && e.type === 'keydown' && isMultiSelectToggleShortcut.value && isMultiSelectToggleHit(e) && !e.repeat) {
      if (!e.repeat) {
        isMultiSelectMode.value = !isMultiSelectMode.value
      }
      isMultiSelectModifierPressed.value = isMultiSelectMode.value
      e.preventDefault()
      return
    }
    isMultiSelectModifierPressed.value = isMultiSelectToggleShortcut.value
      ? isMultiSelectMode.value
      : getModifierPressedFromEvent(e)
  }
  window.addEventListener('keydown', handleKeyEvent)
  window.addEventListener('keyup', handleKeyEvent)
  handleResize = () => {
    resizeVersion.value += 1
  }
  window.addEventListener('resize', handleResize)

  ipcRenderer.on('lan:update', handleLanUpdate)
  refreshLanTasks()
})

onBeforeUnmount(() => {
  ipcRenderer.removeListener('lan:update', handleLanUpdate)
  if (handleKeyEvent) {
    window.removeEventListener('keydown', handleKeyEvent)
    window.removeEventListener('keyup', handleKeyEvent)
  }
  if (handleResize) {
    window.removeEventListener('resize', handleResize)
  }
})

// Watchers
watch(() => taskStore.selectedGidList, (newVal) => {
  selectedList.value = newVal
})

// 传输记录被移除/过滤后，清掉已经不存在于列表中的选择项
watch(lanTaskRows, (rows) => {
  const current = Array.isArray(selectedList.value) ? selectedList.value : []
  if (!current.some(id => `${id}`.startsWith('lan:'))) return
  const valid = new Set(rows.map(row => `lan:${row.gid}`))
  const next = current.filter(id => !`${id}`.startsWith('lan:') || valid.has(id))
  if (next.length !== current.length) {
    selectedList.value = next
    taskStore.selectTasks(cloneDeep(next))
  }
})

// Methods
function normalizeKeystroke (event) {
  const parts = []
  if (event.ctrlKey || event.metaKey) parts.push('cmdctrl')
  if (event.shiftKey) parts.push('shift')
  if (event.altKey) parts.push('alt')
  let key = event.key || ''
  key = key.toLowerCase()
  if (key === 'control' || key === 'meta' || key === 'shift' || key === 'alt') return ''
  if (key === 'arrowup') key = 'up'
  if (key === 'arrowdown') key = 'down'
  if (key === 'arrowleft') key = 'left'
  if (key === 'arrowright') key = 'right'
  if (key === 'escape') key = 'esc'
  return [...parts, key].filter(Boolean).join('-')
}

function isMultiSelectToggleHit (event) {
  const expected = `${multiSelectKeystroke.value || ''}`.trim().toLowerCase()
  if (!expected) return false
  const actual = normalizeKeystroke(event)
  return actual && actual === expected
}

function getModifierPressedFromEvent (e) {
  const required = multiSelectModifiers.value || []
  return required.every((key) => {
    if (key === 'shift') return !!e.shiftKey
    if (key === 'alt') return !!e.altKey
    if (key === 'cmd') return !!e.metaKey
    if (key === 'cmdctrl') return !!(e.ctrlKey || e.metaKey)
    return !!e.ctrlKey
  })
}

function isMultiSelectEvent (e) {
  return isMultiSelectToggleShortcut.value
    ? isMultiSelectMode.value
    : getModifierPressedFromEvent(e)
}

function getCategorySuffixes (category) {
  return CATEGORY_SUFFIXES[category] || new Set()
}

function getTaskFileExtensions (task) {
  const files = (task && task.files) || []
  const suffix = (preferenceConfig.value && preferenceConfig.value.downloadingFileSuffix) || ''
  const result = []
  files.forEach((file) => {
    let name = getFileNameFromFile(file)
    if (suffix && name && name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length)
    }
    const ext = `${getFileExtension(name)}`.toLowerCase()
    if (ext) result.push(ext)
  })
  return result
}

function taskMatchesCategory (task, category) {
  const suffixes = getCategorySuffixes(category)
  if (suffixes.size === 0) return false
  const exts = getTaskFileExtensions(task)
  return exts.some((ext) => suffixes.has(ext))
}

function handleDragSelectChange (selectedListIncoming) {
  const incoming = Array.isArray(selectedListIncoming) ? selectedListIncoming : []
  const next = isMultiSelectModifierPressed.value
    ? Array.from(new Set([...(selectedList.value || []), ...incoming]))
    : incoming
  selectedList.value = next
  taskStore.selectTasks(cloneDeep(next))
}

function handleRowClick (entry, e) {
  const id = entry && entry.attr
  if (!id) return
  const current = Array.isArray(selectedList.value) ? selectedList.value : []
  const useMulti = isMultiSelectEvent(e)
  let next = []
  if (useMulti) {
    const set = new Set(current)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    next = Array.from(set)
  } else {
    next = [id]
  }
  selectedList.value = next
  taskStore.selectTasks(cloneDeep(next))
  if (!entry.lan && taskStore.taskDetailVisible && next.length > 0) {
    const firstSelectedGid = next.find(g => !`${g}`.startsWith('lan:'))
    const task = firstSelectedGid
      ? taskStore.taskList.find(t => t.gid === firstSelectedGid)
      : null
    if (task) {
      taskStore.showTaskDetail(task)
    }
  }
}

function handleRowContextMenu (entry, event) {
  if (!entry) return
  if (entry.lan) {
    handleLanItemContextMenu(entry.row, event)
    return
  }
  handleItemContextMenu(entry.row, event)
}

function popupMenuAt (template, event) {
  const menu = Menu.buildFromTemplate(template)
  menu.popup({
    window: getCurrentWindow(),
    x: event.x != null ? event.x : event.clientX,
    y: event.y != null ? event.y : event.clientY
  })
}

function handleLanItemContextMenu (item, event) {
  const row = item || null
  if (!row) return
  const selectionId = `lan:${row.gid}`
  const current = Array.isArray(selectedList.value) ? selectedList.value : []
  if (!current.includes(selectionId)) {
    selectedList.value = [selectionId]
    taskStore.selectTasks([selectionId])
  }
  const selectedUnique = Array.from(new Set(
    (selectedList.value || []).map(id => `${id || ''}`.trim()).filter(Boolean)
  ))
  if (selectedUnique.length > 1 && selectedUnique.includes(selectionId)) {
    popupMenuAt(getMultiTaskContextMenuTemplate(selectedUnique), event)
    return
  }
  const raw = row.lanTask || {}
  const template = []
  if (raw.direction === 'in' && raw.status === 'done' && raw.path) {
    template.push({
      label: t('task.transfer-open-folder'),
      click: () => ipcRenderer.invoke('lan:open-folder', raw.path).catch(() => {})
    })
  }
  template.push({
    label: t('task.transfer-remove-record'),
    click: () => commands.emit('remove-lan-task', { task: raw })
  })
  popupMenuAt(template, event)
}

function handleItemContextMenu (item, event) {
  const task = item || null
  const gid = task && task.gid ? task.gid : ''
  if (!gid) return
  if (!selectedList.value.includes(gid)) {
    selectedList.value = [gid]
    taskStore.selectTasks([gid])
  }
  const selected = Array.isArray(selectedList.value) ? selectedList.value : []
  const selectedUnique = Array.from(new Set(selected.map(x => `${x || ''}`.trim()).filter(Boolean)))
  const isMultiSelected = selectedUnique.length > 1 && selectedUnique.includes(`${gid}`)
  const template = isMultiSelected
    ? getMultiTaskContextMenuTemplate(selectedUnique)
    : getTaskContextMenuTemplate(task, event)
  const menu = Menu.buildFromTemplate(template)
  menu.popup({
    window: getCurrentWindow(),
    x: event.x != null ? event.x : event.clientX,
    y: event.y != null ? event.y : event.clientY
  })
}

function getMultiTaskContextMenuTemplate (selectedGids = []) {
  const gids = Array.isArray(selectedGids) ? selectedGids : []
  const list = Array.isArray(taskStore.taskList) ? taskStore.taskList : []
  const selectedTasks = list.filter(t => t && gids.includes(`${t.gid}`))
  const canPause = selectedTasks.some(t => t && t.status === TASK_STATUS.ACTIVE)
  const canResume = selectedTasks.some(t => t && (t.status === TASK_STATUS.PAUSED || t.status === TASK_STATUS.WAITING))
  return [
    { label: t('task.pause-task'), enabled: canPause, click: () => commands.execute('application:pause-task') },
    { label: t('task.resume-task'), enabled: canResume, click: () => commands.execute('application:resume-task') },
    { type: 'separator' },
    { label: t('task.delete-selected-tasks'), click: () => commands.emit('batch-delete-task', { deleteWithFiles: false }) },
    { label: `${t('task.delete-selected-tasks')}（${t('task.delete-task-label')}）`, click: () => commands.emit('batch-delete-task', { deleteWithFiles: true }) },
    { type: 'separator' },
    { label: t('task.refresh-list'), click: () => taskStore.fetchList() },
    { label: t('task.select-all-task'), click: () => commands.execute('application:select-all-task') }
  ]
}

function getTaskContextMenuTemplate (task, event) {
  const status = task && task.status ? task.status : ''
  const isSeeder = checkTaskIsSeeder(task)
  const taskName = getTaskName(task, {
    defaultName: t('task.get-task-name'),
    hashFallbackLabel: t('task.magnet-pending-name'),
    maxLen: -1
  })
  let path = ''
  try {
    path = getTaskActualPath(task, preferenceConfig.value || {}) || ''
  } catch (_) {
    path = ''
  }
  const items = []
  if (status === TASK_STATUS.ACTIVE) {
    items.push({ label: t('task.pause-task'), click: () => commands.emit('pause-task', { task, taskName }) })
  } else if (status === TASK_STATUS.PAUSED || status === TASK_STATUS.WAITING) {
    items.push({ label: t('task.resume-task'), click: () => commands.emit('resume-task', { task, taskName }) })
  }
  if (isSeeder) {
    items.push({ label: t('task.stop'), click: () => commands.emit('stop-task-seeding', { task }) })
  }
  if ([TASK_STATUS.ERROR, TASK_STATUS.COMPLETE, TASK_STATUS.REMOVED].includes(status)) {
    items.push({
      label: t('task.restart'),
      click: () => commands.emit('restart-task', { task, taskName, showDialog: status === TASK_STATUS.COMPLETE || !!(event && event.altKey) })
    })
  }
  if (items.length > 0) items.push({ type: 'separator' })
  items.push({ label: t('task.reveal-in-folder'), enabled: !!path, click: () => commands.emit('reveal-in-folder', { path }) })
  items.push({ label: t('task.copy-link'), click: () => commands.emit('copy-task-link', { task }) })
  items.push({ label: t('task.info'), click: () => commands.emit('show-task-info', { task }) })
  items.push({ type: 'separator' })
  const deleteEventPayload = (deleteWithFiles) => ({ task, taskName, deleteWithFiles: !!deleteWithFiles })
  const isRecordRemove = [TASK_STATUS.ERROR, TASK_STATUS.COMPLETE, TASK_STATUS.REMOVED].includes(status)
  if (isRecordRemove) {
    items.push({ label: t('task.remove-record'), click: () => commands.emit('delete-task-record', deleteEventPayload(false)) })
    items.push({ label: `${t('task.remove-record')}（${t('task.remove-record-label')}）`, click: () => commands.emit('delete-task-record', deleteEventPayload(true)) })
  } else {
    items.push({ label: t('task.delete-task'), click: () => commands.emit('delete-task', deleteEventPayload(false)) })
    items.push({ label: `${t('task.delete-task')}（${t('task.delete-task-label')}）`, click: () => commands.emit('delete-task', deleteEventPayload(true)) })
  }
  return items
}

function handleListBlankClick (e) {
  if (!e || e.target !== e.currentTarget) return
  if (typeof e.button === 'number' && e.button !== 0) return
  if (!selectedList.value || selectedList.value.length === 0) return
  selectedList.value = []
  taskStore.selectTasks([])
}

</script>

<style lang="scss">
.task-list {
  padding: 8px 6px 64px 6px;
  min-height: 100%;
  box-sizing: border-box;
  transition: padding-top 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);

  // 列表视图（默认）
  &.task-list--list {
    .task-item-wrapper {
      margin-bottom: 8px;
      position: relative;
      z-index: 1;

      // 当有弹窗时提升层级
      &:hover {
        z-index: 50;
      }
    }
  }

  // 网格视图
  &.task-list--grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    grid-auto-rows: 96px;
    row-gap: 8px; // 行间距与列表视图的margin-bottom保持完全一致
    column-gap: 16px; // 列间距（左右间隔）

    .task-item-wrapper {
      margin-bottom: 0;
      z-index: 1; // 确保网格项有合适的层级
      height: 96px;

      // 当有弹窗时提升层级
      &:hover {
        z-index: 50;
      }
    }
  }
}

.task-item-wrapper {
  transition: all 0.2s ease;

  &.task-item-wrapper--list {
    // 列表视图样式
    position: relative; // 确保背景进度条能正确定位
    border-radius: 8px; // 与TaskItem的圆角保持一致
    height: 96px;
    min-height: 96px;

    // 内容层
    & > .task-item {
      position: relative;
      z-index: 1;
      height: 96px;
      min-height: 96px;
      margin-bottom: 0; // 移除margin，由wrapper控制间距
      box-sizing: border-box; // 确保padding包含在高度内
    }
  }

  &.task-item-wrapper--grid {
    // 网格视图样式 - 主要作为进度条背景容器
    border-radius: 8px; // 与TaskItem的圆角保持一致
    overflow: visible; // 改为visible，让弹窗能够显示
    position: relative;
    height: 88px;

    // 内容层 - TaskItem会处理自己的样式
    & > .task-item {
      position: relative;
      z-index: 1;
      height: 92px; // 明确设置高度，不使用100%
      box-sizing: border-box;
      margin-bottom: 0; // 覆盖列表视图的margin-bottom
      overflow: visible; // 确保TaskItem内的弹窗能显示
    }
  }
}

.no-task {
  display: flex;
  height: 100%;
  text-align: center;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #666;
  user-select: none;
}
.no-task-inner {
  width: 100%;
  padding-top: 280px;
  background: transparent url('@/assets/no-task.svg') top center no-repeat;
  background-size: 400px auto;
}
</style>
