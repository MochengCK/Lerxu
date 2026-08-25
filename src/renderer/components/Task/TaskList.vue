<template>
  <mo-drag-select
    :class="['task-list', `task-list--${viewMode}`]"
    v-if="displayTaskList.length > 0"
    attribute="attr"
    @change="handleDragSelectChange"
    @mousedown="handleListBlankClick"
  >
    <div
      v-for="item in displayTaskList"
      :key="item.gid"
      :attr="item.gid"
      v-memo="[item.status, item.completedLength, item.downloadSpeed, item.uploadSpeed, item.uploadLength, item.connections, item.numSeeders, viewMode, resizeVersion, selectedList.includes(item.gid)]"
      :class="getItemClass(item)"
      @click.stop="(e) => handleItemClick(item, e)"
      @contextmenu.stop.prevent="(e) => handleItemContextMenu(item, e)"
    >
      <mo-task-item
        :task="item"
        :view-mode="viewMode"
        :resize-version="resizeVersion"
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
import { Menu, getCurrentWindow } from '@electron/remote'
import { cloneDeep } from 'lodash'
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
import DragSelect from '@/components/DragSelect/DragSelect'
import { getTaskActualPath } from '@/utils/native'
import { commands } from '@/components/CommandManager/instance'
import TaskItem from './TaskItem'
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

const selectedList = ref(cloneDeep(taskStore.selectedGidList) || [])
const isMultiSelectModifierPressed = ref(false)
const isMultiSelectMode = ref(false)
const resizeVersion = ref(0)

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
})

onBeforeUnmount(() => {
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

function handleItemClick (item, e) {
  const gid = item && item.gid
  if (!gid) return
  const current = Array.isArray(selectedList.value) ? selectedList.value : []
  const useMulti = isMultiSelectEvent(e)
  let next = []
  if (useMulti) {
    const set = new Set(current)
    if (set.has(gid)) set.delete(gid)
    else set.add(gid)
    next = Array.from(set)
  } else {
    next = [gid]
  }
  selectedList.value = next
  taskStore.selectTasks(cloneDeep(next))
  if (taskStore.taskDetailVisible && next.length > 0) {
    const firstSelectedGid = next[0]
    const task = taskStore.taskList.find(t => t.gid === firstSelectedGid)
    if (task) {
      taskStore.showTaskDetail(task)
    }
  }
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
  const taskName = getTaskName(task, { defaultName: t('task.get-task-name'), maxLen: -1 })
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

function getItemClass (item) {
  const isSelected = selectedList.value.includes(item.gid)
  return {
    'task-item-wrapper': true,
    [`task-item-wrapper--${viewMode.value}`]: true,
    selected: isSelected
  }
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
