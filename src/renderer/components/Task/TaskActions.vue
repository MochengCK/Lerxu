<template>
  <div class="task-actions">
    <div class="task-control-group">
      <mo-hover-tip
        effect="dark"
        placement="bottom"
        :content="t('app.add-task')"
      >
        <i class="task-action" @click="onAddClick">
          <mo-icon name="menu-add" width="14" height="14" />
        </i>
      </mo-hover-tip>
      <span class="task-control-separator"></span>
      <mo-hover-tip
        effect="dark"
        placement="bottom"
        :content="t('task.pause-all-task')"
      >
        <i
          class="task-action"
          :class="{ disabled: !canPauseAllTasks }"
          @click="onPauseAllClick"
        >
          <mo-icon name="task-pause-line" width="14" height="14" />
        </i>
      </mo-hover-tip>
      <mo-hover-tip
        effect="dark"
        placement="bottom"
        :content="t('task.resume-all-task')"
      >
        <i
          class="task-action"
          :class="{ disabled: !canResumeAllTasks }"
          @click="onResumeAllClick"
        >
          <mo-icon name="task-start-line" width="14" height="14" />
        </i>
      </mo-hover-tip>
    </div>
    <slot></slot>
    <div class="task-action-group">
      <mo-hover-tip
        effect="dark"
        placement="bottom"
        :content="t('task.purge-record')"
        v-if="currentList === 'stopped'"
      >
        <i class="task-action" @click="onPurgeRecordClick">
          <mo-icon name="purge" width="14" height="14" />
        </i>
      </mo-hover-tip>
      <mo-hover-tip
        effect="dark"
        placement="bottom"
        :content="t('task.delete-selected-tasks')"
        v-if="currentList !== 'stopped'"
      >
        <i
          class="task-action"
          :class="{ disabled: selectedGidListCount === 0 }"
          @click="onBatchDeleteClick">
          <mo-icon name="delete" width="14" height="14" />
        </i>
      </mo-hover-tip>
      <mo-hover-tip
        effect="dark"
        placement="bottom"
        :content="t('app.task-plan')"
      >
        <i
          class="task-action"
          :class="{ 'is-planned': isTaskPlanPlanned }"
          @click="onTaskPlanClick"
        >
          <mo-icon name="task-plan" width="16" height="16" />
        </i>
      </mo-hover-tip>
      <mo-hover-tip
        effect="dark"
        placement="bottom"
        :content="dateFilter.storeFilterDate || t('task.date-filter')"
        :disabled="anyPopupOpen"
      >
        <i
          ref="dateFilterBtn"
          class="task-action date-filter-action"
          :class="{ 'has-filter': dateFilter.storeFilterDate, 'is-active': dateFilter.active }"
          @click.stop="onDateFilterClick"
          @mouseenter="onDateFilterEnter"
          @mouseleave="onDateFilterLeave"
        >
          <span
            class="task-date-filter-text"
            :class="{ visible: dateFilter.showText || dateFilter.storeFilterDate }"
          >{{ dateFilter.displayDateText }}</span>
          <mo-icon name="date-filter" width="16" height="16" />
        </i>
      </mo-hover-tip>
      <mo-hover-tip
        effect="dark"
        placement="bottom"
        :content="t('task.sort')"
        :disabled="anyPopupOpen"
      >
        <i
          class="task-action sort-action"
          :class="{ 'is-active': isSortMenuVisible }"
          @click.stop="onSortClick"
        >
          <mo-icon name="sort" width="14" height="14" />
          <transition name="popup-scale">
            <div
              v-if="isSortMenuVisible"
              class="sort-menu"
              @click.stop
            >
              <div
                v-for="option in sortOptions"
                :key="option.value"
                :class="['sort-menu-item', { 'is-selected': currentSortField === option.value }]"
                @click="handleSortOptionClick(option.value)"
              >
                <span class="sort-menu-item-text">{{ option.label }}</span>
                <span v-if="currentSortField === option.value" :class="['sort-arrow', sortOrder === 'asc' ? 'sort-arrow-up' : 'sort-arrow-down']"></span>
              </div>
            </div>
          </transition>
        </i>
      </mo-hover-tip>
    </div>
    <mo-segmented-slider
      class="view-mode-nav"
      :value="viewMode"
      :options="viewModeOptions"
      icon-only
      @change="onViewModeChange"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'
import { useTaskStore } from '@/store/task'
import { useAppStore } from '@/store/app'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { commands } from '@/components/CommandManager/instance'
import { ADD_TASK_TYPE, TASK_STATUS } from '@shared/constants'
import { bytesToSize, timeFormat } from '@shared/utils'
// mo-segmented-slider is globally registered in main.js
import '@/components/Icons/menu-add'
import '@/components/Icons/view-list'
import '@/components/Icons/view-grid'
import '@/components/Icons/delete'
import '@/components/Icons/purge'
import '@/components/Icons/more'
import '@/components/Icons/task-plan'
import '@/components/Icons/task-pause-line'
import '@/components/Icons/task-start-line'
import '@/components/Icons/sort'

const { t } = i18n.global
const instance = getCurrentInstance()

const taskStore = useTaskStore()
const appStore = useAppStore()
const preferenceStore = usePreferenceStore()

const { currentList, selectedGidList, viewMode, taskList } = storeToRefs(taskStore)
const { stat } = storeToRefs(appStore)
const { config: preferenceConfig } = storeToRefs(preferenceStore)

const selectedGidListCount = computed(() => selectedGidList.value.length)

const props = defineProps({
  task: {
    type: Object,
    default: null
  },
  dateFilter: {
    type: Object,
    default: () => ({
      storeFilterDate: null,
      displayDateText: '',
      active: false,
      showText: false,
      dateFilterFrosted: false
    })
  }
})

const emit = defineEmits(['date-filter-click', 'date-filter-hover', 'date-filter-leave'])

defineOptions({ name: 'mo-task-actions' })

const dateFilterBtn = ref(null)
const isSortMenuVisible = ref(false)
const currentSortField = ref('name')
const sortOrder = ref('asc')
const anyPopupOpen = ref(false)

const viewModeOptions = computed(() => [
  { value: 'list', icon: 'view-list', tooltip: t('task.list-view') },
  { value: 'grid', icon: 'view-grid', tooltip: t('task.grid-view') }
])

const taskPlanActionFromConfig = computed(() => (preferenceConfig.value && preferenceConfig.value.taskPlanAction) || 'none')
const isTaskPlanPlanned = computed(() => taskPlanActionFromConfig.value !== 'none')

const sortOptions = computed(() => [
  { label: t('task.sort-by-completed-time'), value: 'completedTime' },
  { label: t('task.sort-by-remaining-time'), value: 'remainingTime' },
  { label: t('task.sort-by-speed'), value: 'speed' },
  { label: t('task.sort-by-size'), value: 'size' },
  { label: t('task.sort-by-name'), value: 'name' }
])

const canPauseAllTasks = computed(() => stat.value && stat.value.numActive > 0)

const canResumeAllTasks = computed(() => {
  if (taskList.value.length === 0) return false
  const resumableTasks = taskList.value.filter(task => {
    return task.status === TASK_STATUS.WAITING || task.status === TASK_STATUS.PAUSED
  })
  return resumableTasks.length > 0
})

function onBatchDeleteClick (event) {
  const deleteWithFiles = !!event.shiftKey
  commands.emit('batch-delete-task', { deleteWithFiles })
}

function onViewModeChange (mode) {
  if (viewMode.value !== mode) {
    taskStore.updateViewMode(mode)
  }
}

function onPurgeRecordClick () {
  taskStore.purgeTaskRecord()
    .then(() => {
      instance.proxy.$msg.success(t('task.purge-record-success'))
    })
    .catch(({ code }) => {
      if (code === 1) {
        instance.proxy.$msg.error(t('task.purge-record-fail'))
      }
    })
}

function onAddClick () {
  appStore.showAddTaskDialog(ADD_TASK_TYPE.URI)
}

function onTaskPlanClick () {
  if (isTaskPlanPlanned.value) {
    preferenceStore.save({
      taskPlanAction: 'none',
      taskPlanType: 'complete',
      taskPlanTime: '',
      taskPlanGids: [],
      taskPlanOnlyWhenIdle: false
    })
    appStore.updateTaskPlanVisible(false)
    instance.proxy.$msg.success(t('app.task-plan-cancelled-message'))
    return
  }
  appStore.updateTaskPlanVisible(true)
}

function onPauseAllClick () {
  if (!canPauseAllTasks.value) return
  taskStore.pauseAllTask()
    .then(() => {
      instance.proxy.$msg.success(t('task.pause-all-task-success'))
    })
    .catch(({ code }) => {
      if (code === 1) {
        instance.proxy.$msg.error(t('task.pause-all-task-fail'))
      }
    })
}

function onResumeAllClick () {
  if (!canResumeAllTasks.value) return
  taskStore.resumeAllTask()
    .then(() => {
      instance.proxy.$msg.success(t('task.resume-all-task-success'))
    })
    .catch(({ code }) => {
      if (code === 1) {
        instance.proxy.$msg.error(t('task.resume-all-task-fail'))
      }
    })
}

function onSortClick () {
  if (isSortMenuVisible.value) {
    isSortMenuVisible.value = false
    anyPopupOpen.value = false
    return
  }
  commands.emit('popup:open', 'task-sort')
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isSortMenuVisible.value = true
      anyPopupOpen.value = true
    })
  })
}

function onOtherPopupOpen (source) {
  if (source !== 'task-sort' && isSortMenuVisible.value) {
    isSortMenuVisible.value = false
  }
  anyPopupOpen.value = true
}

function onPopupClosed () {
  anyPopupOpen.value = false
}

function handleGlobalClick (event) {
  const root = instance?.proxy?.$el
  if (isSortMenuVisible.value && root && !root.contains(event.target)) {
    isSortMenuVisible.value = false
    anyPopupOpen.value = false
    commands.emit('popup:closed')
  }
}

function handleSortOptionClick (sortField) {
  if (currentSortField.value === sortField) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    currentSortField.value = sortField
    sortOrder.value = 'asc'
  }
  taskStore.sortTasks({
    field: currentSortField.value,
    order: sortOrder.value
  })
  saveSortState()
  isSortMenuVisible.value = false
  anyPopupOpen.value = false
  commands.emit('popup:closed')
}

function saveSortState () {
  try {
    const sortState = {
      field: currentSortField.value,
      order: sortOrder.value
    }
    window.localStorage.setItem('taskSortState', JSON.stringify(sortState))
  } catch (e) {
    console.error('Failed to save sort state:', e)
  }
}

function loadSortState () {
  try {
    const savedState = window.localStorage.getItem('taskSortState')
    if (savedState) {
      const sortState = JSON.parse(savedState)
      if (sortState.field && sortState.order) {
        currentSortField.value = sortState.field
        sortOrder.value = sortState.order
        taskStore.sortTasks({
          field: currentSortField.value,
          order: sortOrder.value
        })
      }
    }
  } catch (e) {
    console.error('Failed to load sort state:', e)
  }
}

function onDateFilterClick (event) {
  event.stopPropagation()
  event.preventDefault()
  const rect = dateFilterBtn.value
    ? dateFilterBtn.value.getBoundingClientRect()
    : event.target.getBoundingClientRect()
  emit('date-filter-click', { event, rect })
}

function onDateFilterEnter () {
  emit('date-filter-hover')
}

function onDateFilterLeave () {
  emit('date-filter-leave')
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
  commands.on('popup:open', onOtherPopupOpen)
  commands.on('popup:closed', onPopupClosed)
  loadSortState()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleGlobalClick)
  commands.removeListener('popup:open', onOtherPopupOpen)
  commands.removeListener('popup:closed', onPopupClosed)
})
</script>

<style lang="scss">
.task-actions {
  position: absolute;
  top: 6px;
  left: 0;
  right: 0;
  height: 28px;
  padding: 0 6px;
  box-sizing: border-box;
  overflow: visible;
  user-select: none;
  cursor: default;
  color: var(--lc-task-action);
  transition: all 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.task-action-group {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 4px;
  pointer-events: auto;
  background-color: transparent;
  border: 1px solid var(--lc-task-item-border);
  border-radius: 8px;
  box-sizing: border-box;
  flex-shrink: 0;

  .task-action {
    display: inline-block;
    padding: 5px;
    margin: 0 4px;
    font-size: 0;
    cursor: pointer;
    outline: none;
    &:hover {
      color: var(--lc-task-action-hover);
    }
    &.disabled {
      color: var(--lc-task-action-disabled);
    }
    &.is-planned {
      color: #67c23a;
    }
  }
  .date-filter-action {
    display: inline-flex;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    &.has-filter {
      color: var(--el-color-primary);
    }
    &.is-active {
      color: var(--el-color-primary);
    }
    .task-date-filter-text {
      font-size: 12px;
      font-style: normal;
      margin-right: 2px;
      position: relative;
      top: 1px;
      opacity: 0;
      max-width: 0;
      overflow: hidden;
      transition: opacity 0.3s ease, max-width 0.3s ease;
      &.visible {
        opacity: 1;
        max-width: 80px;
      }
    }
  }
}

.task-control-group {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 4px;
  pointer-events: auto;
  background-color: transparent;
  border: 1px solid var(--lc-task-item-border);
  border-radius: 8px;
  box-sizing: border-box;
  flex-shrink: 0;

  .task-action {
    display: inline-block;
    padding: 5px;
    margin: 0 4px;
    font-size: 0;
    cursor: pointer;
    outline: none;
    &:hover {
      color: var(--lc-task-action-hover);
    }
    &.disabled {
      color: var(--lc-task-action-disabled);
    }
  }
}

.task-control-separator {
  display: inline-block;
  width: 1px;
  height: 14px;
  background-color: currentColor;
  opacity: 0.2;
  margin: 6px 4px;
  flex-shrink: 0;
}

/* 视图切换滑块：父容器 pointer-events:none，此处恢复 */
.view-mode-nav {
  pointer-events: auto;
}

/* 背景图模式下：操作按钮容器边框加亮 */
.theme-light.has-app-background-image .task-action-group,
.theme-dark.has-app-background-image .task-action-group,
.theme-light.has-app-background-image .task-control-group,
.theme-dark.has-app-background-image .task-control-group {
  border-color: var(--lc-task-item-hover-border);
}

/* 排序菜单 */
.sort-action {
  position: relative;
  &.is-active {
    color: var(--el-color-primary);
  }
}

.sort-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  min-width: 120px;
  background-color: var(--lc-bg-dropdown, #fff);
  border: none;
  border-radius: var(--lc-radius-dropdown);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  padding: 4px 0;
  transform-origin: top right;
  overflow: hidden;
}

.sort-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
  font-style: normal;
  color: var(--lc-text-regular, #333);
  transition: background-color 0.15s ease;

  &:hover {
    background-color: var(--lc-bg-hover, rgba(0, 0, 0, 0.06));
  }

  &.is-selected {
    color: var(--el-color-primary);
  }
}

.sort-menu-item-text {
  white-space: nowrap;
  font-style: normal;
}

.sort-arrow {
  display: inline-block;
  width: 0;
  height: 0;
  margin-left: 8px;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
}

.sort-arrow-up {
  border-bottom: 5px solid var(--el-color-primary);
}

.sort-arrow-down {
  border-top: 5px solid var(--el-color-primary);
}

.theme-dark .sort-menu {
  background-color: var(--lc-bg-dropdown, #2e333b);
  border: none;
}

.theme-dark .sort-menu-item {
  color: var(--lc-text-regular, #ddd);

  &:hover {
    background-color: var(--lc-bg-hover, rgba(255, 255, 255, 0.08));
  }
}
</style>
