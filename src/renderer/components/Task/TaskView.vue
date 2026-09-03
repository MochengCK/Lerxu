<template>
  <el-container
    class="main panel"
    direction="horizontal"
  >
    <!-- 三栏布局的左侧固定导航（进入偏好设置时保持不变，仅钉住当前选项） -->
    <el-aside width="220px" class="subnav three-column-subnav" :class="{ 'is-auto-hide-aside': autoHideAside, 'is-proximity-hovered': isSubnavProximityHovered }">
      <mo-task-subnav :current="activeStatus" />
    </el-aside>

    <el-container
      class="content panel"
      direction="vertical"
    >
      <!-- 偏好设置视图：内容区顶部分类导航（通用分段滑块按钮） + 设置表单 -->
      <template v-if="isPreferencePage">
        <el-header
          class="panel-header preference-view-header"
          height="44"
        >
          <div class="preference-view-nav">
            <mo-segmented-slider
              class="preference-view-slider"
              :model-value="preferenceCategory"
              :options="preferenceNavOptions"
              @update:model-value="navPreference"
            />
          </div>
        </el-header>
        <component
          :is="preferenceFormComponent"
          :category="preferenceCategory"
        />
      </template>
      <template v-else>
        <el-header
          class="panel-header task-panel-header"
          height="44"
        >
          <mo-task-actions
            :dateFilter="taskActionsDateFilter"
            @date-filter-click="onDateFilterClick"
            @date-filter-hover="onDateFilterHover"
            @date-filter-leave="onDateFilterLeave"
          >
            <div class="task-search-box" :class="{ 'is-focused': isSearchFocused }">
              <el-icon class="task-search-icon"><Search /></el-icon>
              <input
                ref="taskSearchInput"
                type="text"
                class="task-search-input"
                :placeholder="t('task.search-tasks')"
                v-model="taskSearchQuery"
                @focus="onSearchFocus"
                @blur="onSearchBlur"
              />
            </div>
          </mo-task-actions>
        </el-header>
        <el-main class="panel-content" @contextmenu="onTaskPageContextMenu">
          <mo-task-list :category="categoryFilter" :keyword="taskSearchQuery" />
        </el-main>
      </template>
    </el-container>

    <transition name="popup-scale">
      <mo-custom-date-picker
        v-if="datePickerVisible"
        v-model="selectedDate"
        :frosted="dateFilterFrosted"
        :task-counts="taskDateCounts"
        :trigger-rect="dateFilterBtnRect"
        @change="onDateChange"
        @hover="onDateHover"
        @clear="onDateClear"
        @close="closeDatePicker"
      />
    </transition>
  </el-container>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, onUnmounted, nextTick, getCurrentInstance, defineAsyncComponent } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { dialog, Menu, getCurrentWindow } from '@electron/remote'
import { ipcRenderer } from 'electron'
import { ElMessage } from 'element-plus'

import api from '@/api'
import i18n from '@/plugins/i18n'
import { commands } from '@/components/CommandManager/instance'
import { ADD_TASK_TYPE, TASK_STATUS } from '@shared/constants'
// mo-task-actions, mo-task-list, mo-task-subnav, mo-custom-date-picker
// are globally registered in main.js
import { createMsg } from '@/components/Msg'
import { useTaskStore } from '@/store/task'
import { useAppStore } from '@/store/app'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'
import '@/components/Icons/menu-task'
import '@/components/Icons/task-start'
import '@/components/Icons/task-pause'
import '@/components/Icons/task-stop'
import '@/components/Icons/date-filter'
import '@/components/Icons/menu-preference'
import {
  getTaskUri,
  parseHeader
} from '@shared/utils'
import {
  delayDeleteTaskFiles,
  showItemInFolder,
  moveTaskFilesToTrash
} from '@/utils/native'
import { clearMergeRetryTimer } from '@/utils/mergeRetryManager'

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })
const router = useRouter()
const route = useRoute()

const props = defineProps({
  status: {
    type: String,
    default: null
  },
  filterDate: {
    type: String,
    default: null
  }
})

const taskStore = useTaskStore()
const appStore = useAppStore()
const preferenceStore = usePreferenceStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)

// --- 偏好设置内嵌视图 ---
// 设置表单按需异步加载（与旧路由懒加载策略一致，不增主包体积）
const PreferenceBasic = defineAsyncComponent(() => import('@/components/Preference/Basic.vue'))
const PreferenceAdvanced = defineAsyncComponent(() => import('@/components/Preference/Advanced.vue'))
const PreferenceLab = defineAsyncComponent(() => import('@/components/Preference/Lab.vue'))
const moSegmentedSlider = defineAsyncComponent(() => import('@/components/SegmentedSlider/SegmentedSlider'))

const isPreferencePage = computed(() => `${route.path || ''}`.startsWith('/preference'))

const preferenceCategory = computed(() => {
  const category = route.params.category
  return typeof category === 'string' && category ? category : 'basic'
})

// 分类列表与旧独立窗口的偏好子导航保持一致（不含实验室入口），
// 顶部导航使用通用分段滑块按钮（mo-segmented-slider）
const preferenceNavOptions = computed(() => [
  { value: 'basic', label: t('preferences.basic') },
  { value: 'appearance', label: t('preferences.appearance') },
  { value: 'transfer', label: t('preferences.transfer-settings') },
  { value: 'bt', label: t('preferences.bt-settings') },
  { value: 'ed2k', label: t('preferences.ed2k-settings') },
  { value: 'task', label: t('preferences.task-manage') },
  { value: 'file', label: t('preferences.file-manage') },
  { value: 'advanced', label: t('preferences.advanced') }
])

const preferenceFormComponent = computed(() => {
  switch (preferenceCategory.value) {
    case 'advanced':
      return PreferenceAdvanced
    case 'lab':
      return PreferenceLab
    default:
      return PreferenceBasic
  }
})

function navPreference (category = 'basic') {
  router.push({ path: `/preference/${category}` }).catch(err => {
    console.log(err)
  })
}

// --- Store refs ---
const { taskList, currentList, selectedGidList, taskDetailVisible, searchKeyword: taskSearchKeyword, filterDate: storeFilterDate } = storeToRefs(taskStore)
const { addTaskVisible, taskPlanVisible } = storeToRefs(appStore)

// --- Data ---
const isHoveringCategoryPopper = ref(false)
const isCategoryPopperEventsBound = ref(false)
let categoryHoverCloseTimer = null
let categoryPopperMouseEnterHandler = null
let categoryPopperMouseLeaveHandler = null
const datePickerVisible = ref(false)
const selectedDate = ref('')
const taskDateCounts = ref({})
const showDateText = ref(false)
const dateFilterBtnRect = ref({})
const hoverDate = ref(null)
const isSubnavProximityHovered = ref(false)
const isSearchFocused = ref(false)
const taskSearchInput = ref(null)
const categorySelect = ref(null)
const dateFilterBtn = ref(null)
let _subnavMouseRaf = null
let _subnavMouseEvent = null
let _handleWindowMouseMoveForSubnav = null

const instance = getCurrentInstance()

// --- Computed ---
const noConfirmBeforeDelete = computed(() => preferenceConfig.value.noConfirmBeforeDeleteTask)
const dateFilterFrosted = computed(() => preferenceConfig.value.dateFilterFrosted)
const autoHideAside = computed(() => preferenceConfig.value.autoHideAside)
const hideAppMenu = computed(() => preferenceConfig.value.hideAppMenu)

const selectedGidListCount = computed(() => selectedGidList.value.length)

const subnavs = computed(() => [
  { key: 'all', title: t('task.all'), route: '/task/all' },
  { key: 'active', title: t('task.active'), route: '/task/active' },
  { key: 'waiting', title: t('task.waiting'), route: '/task/waiting' },
  { key: 'stopped', title: t('task.stopped'), route: '/task/stopped' }
])

const taskSearchQuery = computed({
  get () { return taskSearchKeyword.value },
  set (val) { taskStore.updateTaskSearchKeyword(val) }
})

const categoryFilter = computed({
  get () { return taskStore.categoryFilter },
  set (val) { taskStore.updateCategoryFilter(val) }
})

const currentDateText = computed(() => storeFilterDate.value || t('task.all-tasks'))

const displayDateText = computed(() => {
  if (datePickerVisible.value && hoverDate.value) {
    return hoverDate.value
  }
  return currentDateText.value
})

const taskActionsDateFilter = computed(() => ({
  storeFilterDate: storeFilterDate.value,
  displayDateText: displayDateText.value,
  active: datePickerVisible.value || showDateText.value,
  showText: showDateText.value || datePickerVisible.value,
  dateFilterFrosted: dateFilterFrosted.value
}))

const blockCategoryHoverOpen = computed(() => !!(taskDetailVisible.value || addTaskVisible.value || taskPlanVisible.value))

const taskCounts = computed(() => taskStore.filteredTaskCounts)

// --- Watchers ---
// 进入偏好设置视图时（/preference/:category? 路由复用本组件，status 无 props），
// 不触发任务列表切换，保持进入前的列表状态
watch(() => props.status, () => {
  if (isPreferencePage.value) return
  onStatusChange()
})

// 侧边栏高亮钉住：偏好设置视图下保持进入前的任务选项
const lastTaskStatus = ref(props.status || 'all')
watch(() => props.status, (val) => {
  if (val && !isPreferencePage.value) {
    lastTaskStatus.value = val
  }
})
const activeStatus = computed(() => {
  // 偏好设置视图：任务选项全部停止高亮（侧边栏偏好项自身呈激活态）
  if (isPreferencePage.value) return ''
  return props.status || lastTaskStatus.value
})
watch(blockCategoryHoverOpen, (val) => {
  if (val) {
    forceCloseCategorySelect()
    if (datePickerVisible.value) {
      closeDatePicker()
    }
  }
})
watch(storeFilterDate, (val) => {
  selectedDate.value = val || ''
}, { immediate: true })
// --- Methods ---
function formatCount (count) {
  const n = Number(count) || 0
  if (n > 999) {
    return '999+'
  }
  return String(n)
}

function onTaskPageContextMenu (event) {
  const target = event && event.target
  if (!target || typeof target.closest !== 'function') {
    return
  }
  if (
    target.closest('.task-item') ||
    target.closest('.task-item-actions') ||
    target.closest('.task-item-actions-wrapper')
  ) {
    return
  }
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault()
  }

  const menu = Menu.buildFromTemplate([
    {
      label: t('task.new-task'),
      click: () => commands.execute('application:new-task', { type: ADD_TASK_TYPE.URI })
    },
    {
      label: t('task.new-bt-task'),
      click: () => commands.execute('application:new-bt-task')
    },
    { type: 'separator' },
    {
      label: t('task.refresh-list'),
      click: () => taskStore.fetchList()
    },
    { type: 'separator' },
    {
      label: t('task.pause-all-task'),
      click: () => commands.execute('application:pause-all-task')
    },
    {
      label: t('task.resume-all-task'),
      click: () => commands.execute('application:resume-all-task')
    },
    { type: 'separator' },
    {
      label: t('task.select-all-task'),
      click: () => commands.execute('application:select-all-task')
    }
  ])

  menu.popup({
    window: getCurrentWindow(),
    x: event.x != null ? event.x : event.clientX,
    y: event.y != null ? event.y : event.clientY
  })
}

function forceCloseCategorySelect () {
  clearCategoryHoverCloseTimer()
  const select = categorySelect.value
  if (select && select.visible) {
    select.visible = false
  }
  unbindCategoryPopperEvents()
  blurCategorySelect()
}

function clearCategoryHoverCloseTimer () {
  if (!categoryHoverCloseTimer) {
    return
  }
  clearTimeout(categoryHoverCloseTimer)
  categoryHoverCloseTimer = null
}

function scheduleCloseCategorySelect () {
  clearCategoryHoverCloseTimer()
  categoryHoverCloseTimer = setTimeout(() => {
    const select = categorySelect.value
    if (!select || !select.visible) {
      return
    }
    if (isHoveringCategoryPopper.value) {
      return
    }
    if (select.visible) {
      select.visible = false
    }
    blurCategorySelect()
  }, 120)
}

function blurCategorySelect () {
  const select = categorySelect.value
  if (!select) {
    return
  }
  clearTextSelection()
  if (select.blur) {
    select.blur()
    return
  }
  const input = select.$el && select.$el.querySelector('input')
  if (input && input.blur) {
    input.blur()
  }
  setTimeout(() => {
    clearTextSelection()
  }, 10)
}

function bindCategoryPopperEvents () {
  if (isCategoryPopperEventsBound.value) {
    return
  }
  const select = categorySelect.value
  const popper = select && select.popperElm
  if (!popper) {
    return
  }
  categoryPopperMouseEnterHandler = () => {
    isHoveringCategoryPopper.value = true
    clearCategoryHoverCloseTimer()
  }
  categoryPopperMouseLeaveHandler = () => {
    isHoveringCategoryPopper.value = false
    scheduleCloseCategorySelect()
  }
  popper.addEventListener('mouseenter', categoryPopperMouseEnterHandler)
  popper.addEventListener('mouseleave', categoryPopperMouseLeaveHandler)
  isCategoryPopperEventsBound.value = true
}

function unbindCategoryPopperEvents () {
  const select = categorySelect.value
  const popper = select && select.popperElm
  if (!popper) {
    return
  }
  if (categoryPopperMouseEnterHandler) {
    popper.removeEventListener('mouseenter', categoryPopperMouseEnterHandler)
  }
  if (categoryPopperMouseLeaveHandler) {
    popper.removeEventListener('mouseleave', categoryPopperMouseLeaveHandler)
  }
  isCategoryPopperEventsBound.value = false
  categoryPopperMouseEnterHandler = null
  categoryPopperMouseLeaveHandler = null
  isHoveringCategoryPopper.value = false
}

function navStatus (status) {
  instance.proxy.$router.push({
    path: `/task/${status}`
  }).catch(err => {
    console.log(err)
  })
}

function showDatePicker () {
  datePickerVisible.value = true
  commands.emit('popup:open', 'date-picker')
}

function onOtherPopupOpen (source) {
  if (source !== 'date-picker' && datePickerVisible.value) {
    datePickerVisible.value = false
    hoverDate.value = null
  }
}

function toggleDatePicker (rect) {
  clearTextSelection()
  if (datePickerVisible.value) {
    datePickerVisible.value = false
    commands.emit('popup:closed')
    return
  }
  commands.emit('popup:open', 'date-picker')
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      datePickerVisible.value = true
      loadTaskDateCounts()
      if (rect) {
        dateFilterBtnRect.value = rect
      } else if (dateFilterBtn.value) {
        dateFilterBtnRect.value = dateFilterBtn.value.getBoundingClientRect()
      }
    })
  })
}

function closeDatePicker () {
  datePickerVisible.value = false
  hoverDate.value = null
  commands.emit('popup:closed')
}

function onDateHover (date) {
  hoverDate.value = date
}

function onDateClear () {
  selectedDate.value = ''
  taskStore.updateFilterDate(null)
  taskStore.fetchList()
  datePickerVisible.value = false
  hoverDate.value = null
  commands.emit('popup:closed')
}

function onDateFilterClick ({ event, rect }) {
  if (event) {
    event.stopPropagation()
    event.preventDefault()
  }
  clearTextSelection()
  if (storeFilterDate.value && !datePickerVisible.value) {
    selectedDate.value = ''
    taskStore.updateFilterDate(null)
    taskStore.fetchList()
    return
  }
  toggleDatePicker(rect)
}

async function loadTaskDateCounts () {
  const counts = {}
  const normalizeTimestamp = (value) => {
    const raw = parseInt(value)
    if (!Number.isFinite(raw) || raw <= 0) return 0
    if (raw < 1000000000000) return raw * 1000
    return raw
  }
  let data = []
  try {
    data = await api.fetchTaskList({ type: currentList.value })
  } catch (e) {
    data = []
  }
  data.forEach(task => {
    const status = `${task && task.status ? task.status : ''}`
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
    if (timestamp <= 0) {
      return
    }
    const date = new Date(timestamp)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    counts[dateStr] = (counts[dateStr] || 0) + 1
  })
  taskDateCounts.value = counts
}

function clearTextSelection () {
  if (window.getSelection) {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      selection.removeAllRanges()
    }
  }
  if (document.selection && document.selection.empty) {
    document.selection.empty()
  }
}

function onDateFilterHover () {
  clearTextSelection()
  showDateText.value = true
}

function onDateFilterLeave () {
  clearTextSelection()
  showDateText.value = false
}

function onDateChange (date) {
  if (date) {
    selectedDate.value = date
    taskStore.updateFilterDate(date)
    taskStore.fetchList()
  }
  datePickerVisible.value = false
  commands.emit('popup:closed')
}

function onStatusChange () {
  changeCurrentList()
}

function changeCurrentList () {
  if (props.status === 'date' && props.filterDate) {
    taskStore.changeCurrentListWithDate({
      currentList: props.status,
      filterDate: props.filterDate
    })
  } else {
    taskStore.changeCurrentList(props.status)
  }
}

function directAddTask (uri, options = {}) {
  const uris = [uri]
  const payload = {
    uris,
    options: {
      ...options
    }
  }
  taskStore.addUri(payload)
    .catch((err) => {
      msg.error(err.message)
    })
}

function showAddTaskDialog (uri, options = {}) {
  const {
    header,
    ...rest
  } = options
  console.log('[Lerxu] show add task dialog options: ', options)
  const headers = parseHeader(header)
  const newOptions = {
    ...rest,
    ...headers
  }
  appStore.updateAddTaskUrl(uri)
  appStore.updateAddTaskOptions(newOptions)
  appStore.showAddTaskDialog(ADD_TASK_TYPE.URI)
}

async function deleteTaskFiles (task) {
  const config = preferenceConfig.value || {}
  const downloadingFileSuffix = config.downloadingFileSuffix || ''
  try {
    await moveTaskFilesToTrash(task, downloadingFileSuffix, config)
  } catch (err) {
    console.warn('[Lerxu] deleteTaskFiles error:', err)
    const taskName = (task && task.name) ? task.name : (task && task.gid ? task.gid : '')
    msg.error(`删除文件失败: ${taskName}`)
  }
}
async function removeTask (task, taskName, isRemoveWithFiles = false) {
  const isMerging = task && task.status === TASK_STATUS.MERGING
  if (isMerging) {
    _clearMergeRetryTimer(task.gid)
    await taskStore.removeFromMergingList(task.gid)
    try { await taskStore.removeTask(task) } catch (e) {}
    if (isRemoveWithFiles) {
      await deleteTaskFiles(task)
    }
    await taskStore.fetchList()
    msg.success(t('task.delete-task-success', { taskName }))
    return
  }
  let taskForDeletion = task
  if (isRemoveWithFiles) {
    try {
      const fresh = await api.fetchTaskItem({ gid: task.gid })
      if (fresh && fresh.gid) {
        taskForDeletion = { ...task, ...fresh }
      }
    } catch (e) {
      console.warn('[Lerxu] Failed to fetch fresh task for deletion:', e.message)
    }
    try {
      const opt = await api.getOption({ gid: task.gid })
      if (opt) {
        taskForDeletion = { ...taskForDeletion, _engineOptions: opt }
      }
    } catch (e) {
      console.warn('[Lerxu] Failed to pre-fetch getOption for deletion:', e.message)
    }
  }
  await taskStore.forcePauseTask(task)
    .finally(async () => {
      await removeTaskItem(task, taskName)
      if (isRemoveWithFiles) {
        await new Promise(resolve => setTimeout(resolve, 500))
        await deleteTaskFiles(taskForDeletion)
      }
    })
}

async function removeTaskRecord (task, taskName, isRemoveWithFiles = false) {
  const isMerging = task && task.status === TASK_STATUS.MERGING
  if (isMerging) {
    _clearMergeRetryTimer(task.gid)
    await taskStore.removeFromMergingList(task.gid)
    try { await taskStore.removeTaskRecord(task) } catch (e) {}
    if (isRemoveWithFiles) {
      await deleteTaskFiles(task)
    }
    await taskStore.fetchList()
    msg.success(t('task.remove-record-success', { taskName }))
    return
  }
  let taskForDeletion = task
  if (isRemoveWithFiles) {
    try {
      const fresh = await api.fetchTaskItem({ gid: task.gid })
      if (fresh && fresh.gid) {
        taskForDeletion = { ...task, ...fresh }
      }
    } catch (e) {
      console.warn('[Lerxu] Failed to fetch fresh task for deletion:', e.message)
    }
    try {
      const opt = await api.getOption({ gid: task.gid })
      if (opt) {
        taskForDeletion = { ...taskForDeletion, _engineOptions: opt }
      }
    } catch (e) {
      console.warn('[Lerxu] Failed to pre-fetch getOption for deletion:', e.message)
    }
  }
  await taskStore.forcePauseTask(task)
    .finally(async () => {
      await removeTaskRecordItem(task, taskName)
      if (isRemoveWithFiles) {
        await new Promise(resolve => setTimeout(resolve, 500))
        await deleteTaskFiles(taskForDeletion)
      }
    })
}

function _clearMergeRetryTimer (gid) {
  try {
    clearMergeRetryTimer(gid)
  } catch (e) {}
}

async function removeTaskItem (task, taskName) {
  try {
    await taskStore.removeTask(task)
    msg.success(t('task.delete-task-success', { taskName }))
  } catch ({ code }) {
    if (code === 1) {
      msg.error(t('task.delete-task-fail', { taskName }))
    }
  }
}

async function removeTaskRecordItem (task, taskName) {
  try {
    await taskStore.removeTaskRecord(task)
    msg.success(t('task.remove-record-success', { taskName }))
  } catch ({ code }) {
    if (code === 1) {
      msg.error(t('task.remove-record-fail', { taskName }))
    }
  }
}

async function removeTasks (taskList, isRemoveWithFiles = false) {
  const mergingTasks = taskList.filter(t => t && t.status === TASK_STATUS.MERGING)
  const normalTasks = taskList.filter(t => t && t.status !== TASK_STATUS.MERGING)
  if (mergingTasks.length > 0) {
    for (const task of mergingTasks) {
      _clearMergeRetryTimer(task.gid)
      await taskStore.removeFromMergingList(task.gid)
      try { await taskStore.removeTask(task) } catch (e) {}
      if (isRemoveWithFiles) {
        await deleteTaskFiles(task)
      }
    }
  }
  taskList = normalTasks
  if (taskList.length === 0) {
    await taskStore.fetchList()
    return
  }
  let taskListForDeletion = taskList
  if (isRemoveWithFiles) {
    taskListForDeletion = await Promise.all(taskList.map(async (task) => {
      let enrichedTask = task
      try {
        const fresh = await api.fetchTaskItem({ gid: task.gid })
        if (fresh && fresh.gid) {
          enrichedTask = { ...task, ...fresh }
        }
      } catch (e) {
        console.warn('[Lerxu] batch: failed to fetch fresh task for deletion:', e.message)
      }
      try {
        const opt = await api.getOption({ gid: task.gid })
        if (opt) {
          enrichedTask = { ...enrichedTask, _engineOptions: opt }
        }
      } catch (e) {
        console.warn('[Lerxu] batch: failed to pre-fetch getOption for deletion:', e.message)
      }
      return enrichedTask
    }))
  }
  const gids = taskList.map((task) => task.gid)
  taskStore.batchForcePauseTask(gids)
    .finally(async () => {
      await removeTaskItems(gids)
      if (isRemoveWithFiles) {
        await new Promise(resolve => setTimeout(resolve, 500))
        batchDeleteTaskFiles(taskListForDeletion)
      }
    })
}

function batchDeleteTaskFiles (taskList) {
  const config = preferenceConfig.value || {}
  const downloadingFileSuffix = config.downloadingFileSuffix || ''
  const promises = taskList.map((task, index) => {
    return delayDeleteTaskFiles(task, index * 200, downloadingFileSuffix, config)
  })
  Promise.allSettled(promises).then(results => {
    const failures = results.filter(r => r.status === 'rejected')
    if (failures.length > 0) {
      console.warn('[Lerxu] batch delete task files - failures:', failures)
      msg.error(`部分文件删除失败（${failures.length}个）`)
    }
    console.log('[Lerxu] batch delete task files: ', results)
  })
}

async function removeTaskItems (gids) {
  try {
    await taskStore.batchRemoveTask(gids)
    msg.success(t('task.batch-delete-task-success'))
  } catch ({ code }) {
    if (code === 1) {
      msg.error(t('task.batch-delete-task-fail'))
    }
  }
}

function handlePauseTask (payload) {
  const { task, taskName } = payload
  msg.info(t('task.download-pause-message', { taskName }))
  taskStore.pauseTask(task)
    .catch(({ code }) => {
      if (code === 1) {
        msg.error(t('task.pause-task-fail', { taskName }))
      }
    })
}

function handleResumeTask (payload) {
  const { task, taskName } = payload
  taskStore.resumeTask(task)
    .catch(({ code }) => {
      if (code === 1) {
        msg.error(t('task.resume-task-fail', { taskName }))
      }
    })
}

function handleStopTaskSeeding (payload) {
  const { task } = payload
  taskStore.stopSeeding(task)
  msg.info({
    message: t('task.bt-stopping-seeding-tip'),
    duration: 8000
  })
}

function handleRestartTask (payload) {
  const { task, taskName, showDialog } = payload
  const { gid } = task
  const uri = getTaskUri(task)
  taskStore.getTaskOption(gid)
    .then((data) => {
      console.log('[Lerxu] get task option:', data)
      const { dir, header, split } = data
      const options = {
        dir,
        header,
        split,
        out: taskName
      }
      if (showDialog) {
        showAddTaskDialog(uri, options)
      } else {
        directAddTask(uri, options)
        taskStore.removeTaskRecord(task)
      }
    })
}

function handleRevealInFolder (payload) {
  const { path } = payload
  showItemInFolder(path, {
    errorMsg: t('task.file-not-exist')
  })
}

function handleDeleteTask (payload) {
  const { task, taskName, deleteWithFiles } = payload
  if (noConfirmBeforeDelete.value) {
    removeTask(task, taskName, deleteWithFiles)
    return
  }
  dialog.showMessageBox({
    type: 'warning',
    title: t('task.delete-task'),
    message: t('task.delete-task-confirm', { taskName }),
    buttons: [t('app.yes'), t('app.no')],
    cancelId: 1,
    checkboxLabel: t('task.delete-task-label'),
    checkboxChecked: deleteWithFiles
  }).then(({ response, checkboxChecked }) => {
    if (response === 0) {
      removeTask(task, taskName, checkboxChecked)
    }
  })
}

function handleDeleteTaskRecord (payload) {
  const { task, taskName, deleteWithFiles } = payload
  if (noConfirmBeforeDelete.value) {
    removeTaskRecord(task, taskName, deleteWithFiles)
    return
  }
  dialog.showMessageBox({
    type: 'warning',
    title: t('task.remove-record'),
    message: t('task.remove-record-confirm', { taskName }),
    buttons: [t('app.yes'), t('app.no')],
    cancelId: 1,
    checkboxLabel: t('task.remove-record-label'),
    checkboxChecked: !!deleteWithFiles
  }).then(({ response, checkboxChecked }) => {
    if (response === 0) {
      removeTaskRecord(task, taskName, checkboxChecked)
    }
  })
}

function handleBatchDeleteTask (payload) {
  const { deleteWithFiles } = payload
  if (selectedGidListCount.value === 0) {
    return
  }
  const selectedTaskList = taskList.value.filter((task) => {
    return selectedGidList.value.includes(task.gid)
  })
  if (noConfirmBeforeDelete.value) {
    removeTasks(selectedTaskList, deleteWithFiles)
    return
  }
  const count = `${selectedGidListCount.value}`
  dialog.showMessageBox({
    type: 'warning',
    title: t('task.delete-selected-task'),
    message: t('task.batch-delete-task-confirm', { count }),
    buttons: [t('app.yes'), t('app.no')],
    cancelId: 1,
    checkboxLabel: t('task.delete-task-label'),
    checkboxChecked: deleteWithFiles
  }).then(({ response, checkboxChecked }) => {
    if (response === 0) {
      removeTasks(selectedTaskList, checkboxChecked)
    }
  })
}

function handleCopyTaskLink (payload) {
  const { task } = payload
  const uri = getTaskUri(task)
  try {
    ipcRenderer.invoke('clipboard:write-text', uri)
    msg.success(t('task.copy-link-success'))
  } catch (e) {
    msg.error(t('preferences.save-fail-message'))
  }
}

function updateSubnavProximityHover (event) {
  if (!autoHideAside.value) {
    if (isSubnavProximityHovered.value) {
      isSubnavProximityHovered.value = false
    }
    return
  }
  if (!event) {
    return
  }
  const height = typeof window !== 'undefined' ? window.innerHeight : 0
  if (!height) {
    return
  }
  const withinX = event.clientX <= 120
  if (withinX !== isSubnavProximityHovered.value) {
    isSubnavProximityHovered.value = withinX
  }
}

function handleWindowMouseMoveForSubnav (event) {
  _subnavMouseEvent = event
  if (_subnavMouseRaf) {
    return
  }
  _subnavMouseRaf = window.requestAnimationFrame(() => {
    _subnavMouseRaf = null
    const lastEvent = _subnavMouseEvent
    _subnavMouseEvent = null
    updateSubnavProximityHover(lastEvent)
  })
}

function handleShowTaskInfo (payload) {
  const { task } = payload
  taskStore.showTaskDetail(task)
}

function openPreference () {
  // 偏好设置内嵌在主窗口中：路由跳转到 /preference
  router.push({ path: '/preference' }).catch(err => {
    console.log(err)
  })
}

function onSearchFocus () {
  isSearchFocused.value = true
}

function onSearchBlur () {
  if (!taskSearchQuery.value) {
    isSearchFocused.value = false
  }
}

function handleDocumentClick (event) {
  const el = instance.proxy.$el
  const searchBox = el && el.querySelector('.task-search-box')
  if (searchBox && !searchBox.contains(event.target)) {
    const input = taskSearchInput.value
    if (input) {
      input.blur()
    }
  }
}

// --- Lifecycle ---
// 冷启动直接落在偏好设置视图时，不初始化任务列表切换（保持任务页原状态）
if (!isPreferencePage.value) {
  changeCurrentList()
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    _handleWindowMouseMoveForSubnav = (event) => {
      handleWindowMouseMoveForSubnav(event)
    }
    window.addEventListener('mousemove', _handleWindowMouseMoveForSubnav)
  }
  commands.on('pause-task', handlePauseTask)
  commands.on('resume-task', handleResumeTask)
  commands.on('stop-task-seeding', handleStopTaskSeeding)
  commands.on('restart-task', handleRestartTask)
  commands.on('reveal-in-folder', handleRevealInFolder)
  commands.on('delete-task', handleDeleteTask)
  commands.on('delete-task-record', handleDeleteTaskRecord)
  commands.on('batch-delete-task', handleBatchDeleteTask)
  commands.on('copy-task-link', handleCopyTaskLink)
  commands.on('show-task-info', handleShowTaskInfo)
  commands.on('popup:open', onOtherPopupOpen)
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    if (_handleWindowMouseMoveForSubnav) {
      window.removeEventListener('mousemove', _handleWindowMouseMoveForSubnav)
      _handleWindowMouseMoveForSubnav = null
    }
  }
  if (_subnavMouseRaf) {
    window.cancelAnimationFrame(_subnavMouseRaf)
    _subnavMouseRaf = null
  }
  document.removeEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  clearCategoryHoverCloseTimer()
  unbindCategoryPopperEvents()
  commands.off('pause-task', handlePauseTask)
  commands.off('resume-task', handleResumeTask)
  commands.off('stop-task-seeding', handleStopTaskSeeding)
  commands.off('restart-task', handleRestartTask)
  commands.off('reveal-in-folder', handleRevealInFolder)
  commands.off('delete-task', handleDeleteTask)
  commands.off('delete-task-record', handleDeleteTaskRecord)
  commands.off('batch-delete-task', handleBatchDeleteTask)
  commands.off('copy-task-link', handleCopyTaskLink)
  commands.off('show-task-info', handleShowTaskInfo)
  commands.removeListener('popup:open', onOtherPopupOpen)
})
</script>

<style lang="scss">
.main.panel {
  height: 100vh;
  overflow: hidden;
}

.content.panel {
  height: calc(100% - 38px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--lc-bg-panel);
  border-top-left-radius: 10px;
  margin: 38px 0 0 0;
}

/* Windows/Linux 关闭自定义标题栏（使用系统原生标题栏/菜单栏）时，
   不再需要为自定义标题栏保留 38px 顶部占位：任务面板顶部贴边、左上角直角。
   macOS 始终使用原生标题栏且布局已适配，保持不变。 */
#app:not(.has-custom-titlebar):not(.is-mac) .content.panel {
  height: 100%;
  margin-top: 0;
  border-top-left-radius: 0;
}

.content.panel .panel-header {
  flex-shrink: 0;
}

.content.panel .panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.panel-header {
  position: relative;
  z-index: 100;
  transition: all 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
}

/* 任务页面 panel-header：移除外层边框，改为内部独立容器 */
.content.panel .panel-header.task-panel-header {
border: none !important;
padding: 0 !important;
margin: 6px 0 0;
height: 44px !important;
}

/* ── 偏好设置内嵌视图：内容区顶部分类导航（通用分段滑块按钮） ──
   几何参数与任务视图顶部控制按钮（.task-actions）完全一致：
   absolute top:6px, height:28px, 左右 padding 6px（≥568px 时 14px） */
.content.panel .panel-header.preference-view-header {
  border: none !important;
  padding: 0 !important;
  margin: 6px 0 0;
  height: 44px !important;
  box-sizing: border-box;
}

.preference-view-nav {
  position: absolute;
  top: 6px;
  left: 0;
  right: 0;
  height: 28px;
  padding: 0 6px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

@media only screen and (min-width: 568px) {
  .preference-view-nav {
    padding-left: 14px;
    padding-right: 14px;
  }
}

.preference-view-slider {
  flex-shrink: 0;
}

/* 宽屏下与 task-list 的 14px 左右 padding 对齐（见 Default.scss 媒体查询） */
@media only screen and (min-width: 568px) {
  .content.panel .panel-header.task-panel-header .task-actions {
    padding-left: 14px;
    padding-right: 14px;
  }
}

/* dark theme: task-category-select 边框色由 CSS 变量自动适配 */

.task-category-select {
  position: absolute;
  top: 6px;
  left: 123px;
  display: flex;
  justify-content: flex-start;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  transition: all 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
}

.task-category-select .el-select {
  width: 160px;
  pointer-events: auto;
  opacity: 1;
  transition: opacity 0.2s ease;
}

.task-category-select .el-select .el-input__inner {
  user-select: none !important;
  -webkit-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  background-color: transparent !important;
  border: 1px solid var(--lc-task-item-border) !important;
  border-radius: 8px !important;
  height: 28px !important;
  line-height: 28px !important;
}

/* dark theme: task-category-select 边框色由 CSS 变量自动适配 */

.task-category-select .el-select .el-input__icon {
  line-height: 28px !important;
}

.task-search-box {
  flex: 1;
  min-width: 0;
  height: 28px;
  display: flex;
  align-items: center;
  border: 1px solid var(--lc-task-item-border);
  border-radius: 8px;
  background-color: transparent;
  box-sizing: border-box;
  padding: 0 8px;
  pointer-events: auto;
  transition: border-color 0.2s ease;

  &:focus-within,
  &.is-focused {
    border-color: var(--el-color-primary);
  }

  .task-search-icon {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--lc-task-action);
    margin-right: 6px;
  }

  .task-search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    color: var(--lc-text-regular, #333);
    height: 100%;
    min-width: 0;

    &::placeholder {
      color: var(--lc-text-secondary, #999);
      opacity: 0.6;
    }
  }
}

.theme-dark .task-search-box {
  .task-search-icon {
    color: var(--lc-text-secondary, #999);
  }
  .task-search-input {
    color: var(--lc-text-regular, #ddd);
  }
}

.task-category-select .el-select:hover,
.task-category-select .el-select:focus-within {
  opacity: 1;
}

/* 背景图模式下：分类选择框边框加亮 */
.theme-light.has-app-background-image .task-category-select .el-select .el-input__inner,
.theme-dark.has-app-background-image .task-category-select .el-select .el-input__inner {
  border-color: var(--lc-task-item-hover-border) !important;
}

.theme-light.has-app-background-image {
  .task-category-select .el-select .el-input__inner {
    background-color: rgba(255, 255, 255, var(--app-ui-opacity-task-category-select, var(--app-ui-opacity, 0.9))) !important;
    backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
  }
  .task-category-select-dropdown {
    background-color: rgba(255, 255, 255, var(--app-ui-opacity-task-category-select, var(--app-ui-opacity, 0.9)));
    backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
  }
}

.theme-dark.has-app-background-image {
  .task-category-select .el-select .el-input__inner {
    background-color: rgba(45, 45, 45, var(--app-ui-opacity-task-category-select, var(--app-ui-opacity, 0.9))) !important;
    backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    border-color: rgba(255, 255, 255, 0.1) !important;
    color: #eee !important;
  }
  .task-category-select-dropdown {
    background-color: rgba(45, 45, 45, var(--app-ui-opacity-task-category-select, var(--app-ui-opacity, 0.9)));
    backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    border-color: rgba(255, 255, 255, 0.12);
  }
  .task-category-select-dropdown .el-select-dropdown__item {
    color: #eee;
  }
  .task-category-select-dropdown .el-select-dropdown__item.hover,
  .task-category-select-dropdown .el-select-dropdown__item:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
}

.dialog-footer {
  text-align: right;
}

.dialog-footer .el-button {
  margin-left: 10px;
}

/* ── 以下为偏好设置表单样式（自旧 PreferencePanel.vue 迁移，
      偏好设置内嵌视图继续使用） ── */

/* macOS 原生透明背景：偏好设置卡片百分百不透明，保持纯色背景 */
html.mac-native-transparent .form-preference .preference-card {
  background-color: var(--lc-bg-panel, #ffffff);
  backdrop-filter: none;
}

html.mac-native-transparent.theme-dark .form-preference .preference-card {
  background-color: var(--lc-bg-panel, #262a31);
  border-color: rgba(255, 255, 255, 0.08);
}

/* 加 .content.panel 前缀提高特异性：主题 Index.scss 在 main.js 中晚于路由导入，
   若与组件样式同特异性，注入顺序变化会导致表单间距不稳定（实测被覆盖）。 */
.content.panel .form-preference {
  /* 顶部 8px 与任务视图「顶部控制按钮 → 任务卡片」的间距
     （.task-list padding-top: 8px）保持一致 */
  padding: 8px 6px 24px 6px;
  display: flex;
  flex-direction: column;
  gap: 24px;

  /* 宽屏左右间距与顶部导航（task-actions 14px）一致 */
  @media only screen and (min-width: 568px) {
    padding-left: 14px;
    padding-right: 14px;
  }

  .preference-card {
    background: transparent;
    border-radius: 8px;
    padding: 20px 24px;
    border: 1px solid var(--el-border-color-light);
    transition: all 0.3s ease;
  }

  .card-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--el-border-color-light);
    letter-spacing: 0.3px;
  }

  .card-content {
    padding-top: 0;
  }

  .el-switch__label {
    font-weight: normal;
    color: var(--el-text-color-regular);
    &.is-active {
      color: var(--el-text-color-regular);
    }
  }

  .el-checkbox__input.is-checked + .el-checkbox__label {
    color: var(--el-text-color-regular);
  }

  .el-form-item {
    a {
      color: var(--el-text-color-regular);
      text-decoration: none;
      &:hover {
        color: var(--el-text-color-primary);
        text-decoration: underline;
      }
      &:active {
        color: var(--el-text-color-primary);
      }
    }
  }

  .el-form-item.el-form-item--mini {
    margin-bottom: 16px;
  }

  .el-form-item__content {
    color: var(--el-text-color-regular);
    line-height: 1.6;
    /* Element Plus 的 .el-form-item__content 默认 display:flex; align-items:center; flex-wrap:wrap,
       但直接子元素（el-row、el-col、div 等）不会自动占满宽度，
       会被 inline-flex 压缩为内容宽度。这里确保每个直接子元素占满宽度，
       使多行内容正确垂直堆叠，同时不破坏 EP 默认的 flex-wrap 行为。 */
    & > * {
      flex-basis: 100%;
    }
  }

  .form-item-sub {
    margin-bottom: 12px;
    line-height: 1.6;
    &:last-of-type {
      margin-bottom: 0;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;

      .toggle-label {
        font-size: 13px;
        color: var(--el-text-color-secondary);
        flex: 1;
        min-width: 0;
      }

      &.toggle-row--with-desc {
        align-items: center;

        .toggle-row__text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .toggle-desc {
          font-size: 12px;
          color: var(--el-text-color-secondary);
          line-height: 1.4;
          opacity: 0.7;
        }
      }
    }

    .sub-row-reverse {
      display: flex;
      align-items: center;
      flex-direction: row-reverse;
      justify-content: flex-end;
      gap: 10px;

      .sub-row-label {
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  .form-item-sub-sub {
    margin-left: 24px;
    margin-bottom: 10px;
    padding-left: 12px;
    border-left: 2px solid var(--el-border-color-lighter);
    line-height: 1.6;

    .el-radio-group {
      .el-radio__label {
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  .el-form-item__info {
    line-height: 1.6;
    margin-top: 6px;
  }

  .el-button {
    border-radius: 8px;
  }

  .el-button--small {
    border-radius: 6px;
  }
}

.theme-light.has-app-background-image .form-preference {
  .preference-card {
    background-color: transparent;
    backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    overflow: hidden;
  }
}

/* Dark theme styles */
.theme-dark .form-preference {
  .preference-card {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .card-title {
    color: var(--lc-text-primary);
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
}

.theme-dark.has-app-background-image .form-preference {
  .preference-card {
    background-color: transparent;
    backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-preference-card, var(--app-ui-frosted-blur, 0px)));
    overflow: hidden;
  }
}

/* 宽屏下的左右间距已在上方 .content.panel .form-preference 的媒体查询中
   与顶部导航（task-actions 14px）对齐 */

.form-actions {
  position: sticky;
  bottom: 0;
  left: auto;
  z-index: 10;
  width: -webkit-fill-available;
  box-sizing: border-box;
  padding: 24px 16px;
}
</style>
