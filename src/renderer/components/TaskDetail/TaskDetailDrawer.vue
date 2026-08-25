<template>
  <el-drawer
    :class="drawerClass"
    size="73.7%"
    v-if="gid"
    :with-header="true"
    :show-close="false"
    :destroy-on-close="true"
    v-model="drawerVisible"
    :before-close="handleClose"
    append-to-body
    @open="handleOpen"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <div class="task-detail-drawer-title">
        <div class="task-detail-nav-wrapper">
          <mo-segmented-slider
            ref="navSlider"
            class="task-detail-nav-bar"
            :value="activeTab"
            :options="navOptions"
            @change="handleTabChange"
          />
        <div class="task-detail-nav-actions">
          <el-input
            v-if="activeTab === 'peers' && isBT"
            v-model="peerSearch"
            size="small"
            class="task-detail-peer-search"
            :placeholder="t('task.peers-search')"
            clearable
          />
          <button type="button" class="task-detail-close" aria-label="Close" @click="handleClose">
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </div>
    </div>
    <div class="task-detail-content">
      <div v-show="activeTab === 'general'">
        <mo-task-general :task="task" />
      </div>
      <div v-show="activeTab === 'activity'">
        <TaskActivity ref="taskGraphic" :task="task" />
      </div>
      <div v-show="activeTab === 'trackers'" v-if="isBT" class="task-detail-pane">
        <mo-task-trackers :task="task" />
      </div>
      <div v-show="activeTab === 'peers'" v-if="isBT" class="task-detail-pane">
        <TaskPeers ref="taskPeers" :peers="peers" :task="task" :search-text="peerSearch" />
      </div>
      <div v-show="activeTab === 'sources'" v-if="isEd2k" class="task-detail-pane">
        <TaskEd2kSources ref="taskSources" :peers="peers" :task="task" />
      </div>
      <div v-show="activeTab === 'files'" class="task-detail-pane">
        <TaskFiles
          ref="detailFileList"
          mode="DETAIL"
          :files="fileList"
          @selection-change="handleSelectionChange"
          @confirm-selection="saveTaskFilesSelection"
        />
      </div>
      <div v-show="activeTab === 'connections'">
        <mo-task-connections :task="task" />
      </div>
    </div>
    <div class="task-detail-actions">
      <div class="action-wrapper action-wrapper-center">
        <mo-task-item-actions mode="DETAIL" :task="task" />
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import is from 'electron-is'
import { debounce, merge } from 'lodash'
import {
  calcFormLabelWidth,
  checkTaskIsBT,
  checkTaskIsSeeder,
  isMagnetTask,
  isEd2kTask,
  getFileName,
  getFileExtension
} from '@shared/utils'
import {
  EMPTY_STRING,
  NONE_SELECTED_FILES,
  SELECTED_ALL_FILES,
  TASK_STATUS
} from '@shared/constants'
import i18n from '@/plugins/i18n'
// mo-task-item-actions, mo-task-general, mo-task-trackers,
// mo-segmented-slider are globally registered in main.js
// TaskActivity/TaskPeers/TaskEd2kSources/TaskFiles 必须本地 import：
// 组件通过 ref 访问其 defineExpose 的实例方法（updateGraphicWidth /
// updateTableHeight / toggleSelection 等），defineAsyncComponent 包装器
// 不会透传实例方法。
import TaskActivity from './TaskActivity'
import TaskPeers from './TaskPeers'
import TaskEd2kSources from './TaskEd2kSources'
import TaskFiles from './TaskFiles'
import { ElMessage } from 'element-plus'
import { createMsg } from '@/components/Msg'
import { usePreferenceStore } from '@/store/preference'
import { useTaskStore } from '@/store/task'
import { storeToRefs } from 'pinia'

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })

const props = defineProps({
  gid: {
    type: String
  },
  task: {
    type: Object
  },
  files: {
    type: Array,
    default: () => []
  },
  peers: {
    type: [Object, Array],
    default: () => ({ connected: [], attempting: [], banned: [], disconnected: [] })
  },
  visible: {
    type: Boolean,
    default: false
  }
})

defineOptions({ name: 'mo-task-detail' })

const preferenceStore = usePreferenceStore()
const taskStore = useTaskStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)
const { magnetStatuses, dataAccessStatuses } = storeToRefs(taskStore)

const cached = { files: [] }

const form = ref({})
const formLabelWidth = computed(() => calcFormLabelWidth(preferenceConfig.value.locale))
const locale = computed(() => preferenceConfig.value.locale)
const activeTab = ref('general')
const peerSearch = ref('')
const graphicWidth = ref(0)
const filesSelection = ref(EMPTY_STRING)
const selectionChangedCount = ref(0)
const statusHintTruncated = ref(false)
let resizeHandler = null
const drawerAnimationDone = ref(false)
const drawerVisible = ref(props.visible)

const taskGraphic = ref(null)
const taskPeers = ref(null)
const taskSources = ref(null)
const detailFileList = ref(null)
const detailStatusText = ref(null)
const navSlider = ref(null)

watch(() => props.visible, (val) => {
  drawerVisible.value = val
})

const isRenderer = is.renderer()

const taskDetailDefaultTransparentEnabled = computed(() => {
  const cfg = preferenceConfig.value || {}
  return cfg.taskDetailDefaultTransparent === undefined ? false : !!cfg.taskDetailDefaultTransparent
})

const taskDetailFrostedBlurValue = computed(() => {
  const cfg = preferenceConfig.value || {}
  const raw = Number(cfg.taskDetailFrostedBlur)
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 10) : 0
})

const shouldEnableBackdrop = computed(() => taskDetailDefaultTransparentEnabled.value && taskDetailFrostedBlurValue.value > 0)

const drawerClass = computed(() => {
  const base = 'panel task-detail-drawer'
  return shouldEnableBackdrop.value ? `${base} task-detail-drawer--backdrop` : base
})

const isBT = computed(() => checkTaskIsBT(props.task))
const isEd2k = computed(() => isEd2kTask(props.task))

const navTabs = computed(() => {
  const tabs = ['general', 'activity']
  if (isBT.value) tabs.push('trackers', 'peers')
  if (isEd2k.value) tabs.push('sources')
  tabs.push('files', 'connections')
  return tabs
})

const navOptions = computed(() => {
  const labelMap = {
    general: t('task.task-detail-general'),
    activity: t('task.task-detail-activity'),
    trackers: t('task.task-detail-trackers'),
    peers: t('task.task-detail-peers'),
    sources: t('task.task-detail-sources'),
    files: t('task.task-detail-files'),
    connections: t('task.task-detail-connections')
  }
  return navTabs.value.map(tab => ({ value: tab, label: labelMap[tab] || tab }))
})

const isSeeder = computed(() => {
  const task = props.task || {}
  return task.status === TASK_STATUS.ACTIVE && checkTaskIsSeeder(task)
})

const magnetHintText = computed(() => {
  const task = props.task || {}
  const zero = Number(task.downloadSpeed) === 0
  const isMagnet = isMagnetTask(task)
  const metadataReady = task.totalLength > 0 && task.files && task.files.length > 0
  if (!(isMagnet && zero && !metadataReady)) return ''
  const s = magnetStatuses.value[task.gid]
  if (!s) return t('task.magnet-fetching-metadata')
  const { peerCount = 0, trackerCount = 0, elapsedSec = 0, phase = '', peerTrend = 'flat', globalLimitLow = false, pauseMetadata = false } = s
  const cfg = preferenceConfig.value || {}
  const dhtEnabled = Number(cfg['dht-listen-port'] || cfg.dhtListenPort || 0) > 0
  const trackersConfigured = `${cfg['bt-tracker'] || cfg.btTracker || ''}`.trim().length > 0
  const elapsedMin = Math.floor(elapsedSec / 60)
  if (phase === 'no_trackers' || (peerCount === 0 && trackerCount === 0)) {
    const base = trackersConfigured ? t('task.magnet-status-contacting-trackers', { trackerCount }) : t('task.magnet-status-no-trackers')
    const suggest = t('task.magnet-suggest-add-trackers')
    return `${base}，${suggest}`
  }
  if (phase === 'contacting_trackers' || (peerCount === 0 && trackerCount > 0)) {
    const base = t('task.magnet-status-contacting-trackers', { trackerCount })
    if (elapsedMin >= 2) {
      const wait = t('task.magnet-status-long-wait') + ' ' + t('task.magnet-status-elapsed-minutes', { minutes: elapsedMin })
      const extra = dhtEnabled ? '' : (' ' + t('task.magnet-suggest-open-port'))
      const limit = globalLimitLow ? (' ' + t('task.magnet-suggest-limit')) : ''
      const paused = pauseMetadata ? (' ' + t('task.magnet-suggest-unpause-metadata')) : ''
      return `${base}，${wait}${extra}${limit}${paused}`
    }
    return base
  }
  const peersText = t('task.magnet-status-peers', { peerCount })
  const trackersText = t('task.magnet-status-trackers', { trackerCount })
  if (elapsedMin >= 2) {
    const wait = t('task.magnet-status-long-wait') + ' ' + t('task.magnet-status-elapsed-minutes', { minutes: elapsedMin })
    const trendText = peerTrend === 'up' ? t('task.magnet-trend-up') : (peerTrend === 'down' ? t('task.magnet-trend-down') : t('task.magnet-trend-flat'))
    const limit = globalLimitLow ? (' ' + t('task.magnet-suggest-limit')) : ''
    const paused = pauseMetadata ? (' ' + t('task.magnet-suggest-unpause-metadata')) : ''
    return `${peersText}，${trackersText}，${wait}，${trendText}${limit}${paused}`
  }
  const trendText = peerTrend === 'up' ? t('task.magnet-trend-up') : (peerTrend === 'down' ? t('task.magnet-trend-down') : '')
  return `${peersText}，${trackersText}${trendText ? '，' + trendText : ''}`
})

const statusHintText = computed(() => {
  const task = props.task || {}
  if (!task) return ''
  const raw = `${task.statusHint || ''}`.trim()
  if (!raw) return ''
  if (raw.startsWith('task.')) return t(raw)
  return raw
})

const resolveErrorReason = computed(() => {
  return (errorCode, errorMessage = '') => {
    const code = Number(errorCode)
    if (!code) return ''
    const msgText = `${errorMessage || ''}`
    if (code === 3) return t('task.error-reason-not-found')
    if (code === 1) {
      if (/fake-ip|198\.18\.|198\.19\./i.test(msgText)) return t('task.error-reason-fake-ip')
      if (/DNS|name resolution|hostname|getaddrinfo|no data/i.test(msgText)) return t('task.error-reason-dns')
      if (/SSL|TLS|certificate/i.test(msgText)) return t('task.error-reason-ssl')
      if (/timeout|timed out/i.test(msgText)) return t('task.error-reason-timeout')
      if (/connection refused|refused/i.test(msgText)) return t('task.error-reason-refused')
      return t('task.error-reason-network')
    }
    if (code === 16) {
      if (/Permission denied|permission/i.test(msgText)) return t('task.error-reason-permission')
      if (/No space left|disk full/i.test(msgText)) return t('task.error-reason-disk-full')
      return t('task.error-reason-disk')
    }
    return t('task.error-reason-generic')
  }
})

const taskStatus = computed(() => {
  if (isSeeder.value && props.task.status === TASK_STATUS.ACTIVE) {
    return TASK_STATUS.SEEDING
  }
  return props.task.status
})

const fileList = computed(() => {
  const task = props.task || {}
  const cfg = preferenceConfig.value || {}
  const suffix = cfg.downloadingFileSuffix || ''
  const completedStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
  const shouldStripSuffix = !!(suffix && !isBT.value && completedStatuses.includes(task.status))
  const result = props.files.map((item) => {
    const rawName = getFileName(item.path)
    const name = shouldStripSuffix && rawName && rawName.endsWith(suffix)
      ? rawName.slice(0, -suffix.length)
      : rawName
    const extension = getFileExtension(name)
    return {
      idx: Number(item.index),
      selected: item.selected === 'true',
      path: item.path,
      name,
      extension: extension ? `.${extension}` : '',
      length: parseInt(item.length, 10),
      completedLength: item.completedLength
    }
  })
  merge(cached.files, result)
  return cached.files
})

const selectedFileList = computed(() => fileList.value.filter((item) => item.selected))

// Lifecycle
onMounted(() => {
  resizeHandler = debounce(() => {
    if (activeTab.value === 'activity' && taskGraphic.value) {
      taskGraphic.value.updateGraphicWidth()
    }
    updateNavIndicator()
  }, 250)
  window.addEventListener('resize', resizeHandler)
  nextTick(() => updateNavIndicator())
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeHandler)
  if (resizeHandler && resizeHandler.cancel) {
    resizeHandler.cancel()
  }
  cached.files = []
})

// Watchers
watch(() => props.gid, () => {
  cached.files = []
})

watch(statusHintText, () => {
  updateStatusTruncation()
})

watch(isBT, () => {
  nextTick(() => updateNavIndicator())
})

watch(isEd2k, () => {
  nextTick(() => updateNavIndicator())
})

// Methods
function handleOpen () {
  drawerAnimationDone.value = false
}

function handleOpened () {
  const done = () => {
    drawerAnimationDone.value = true
    if (activeTab.value === 'peers' || activeTab.value === 'sources') {
      taskStore.toggleEnabledFetchPeers(true)
    }
    if (activeTab.value === 'peers' && taskPeers.value) {
      setImmediate(() => {
        taskPeers.value.updateTableHeight()
      })
    }
    if (activeTab.value === 'sources' && taskSources.value) {
      setImmediate(() => {
        taskSources.value.updateTableHeight()
      })
    }
    if (activeTab.value === 'activity' && taskGraphic.value) {
      taskGraphic.value.updateGraphicWidth()
    }
    nextTick(() => updateNavIndicator())
  }
  if (typeof window !== 'undefined' && window.requestAnimationFrame) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(done))
    return
  }
  setTimeout(done, 0)
}

function handleClose (done) {
  drawerAnimationDone.value = false
  taskStore.toggleEnabledFetchPeers(false)
  taskStore.hideTaskDetail()
  window.removeEventListener('resize', resizeHandler)
  if (resizeHandler && resizeHandler.cancel) {
    resizeHandler.cancel()
  }
  if (typeof done === 'function') {
    done()
  }
}

function handleClosed (done) {
  drawerAnimationDone.value = false
  taskStore.updateCurrentTaskGid(EMPTY_STRING)
  taskStore.updateCurrentTaskItem(null)
  resetTaskFilesSelection()
}

function updateStatusTruncation () {
  nextTick(() => {
    const el = detailStatusText.value
    if (!el || !el.scrollWidth || !el.clientWidth) {
      statusHintTruncated.value = false
      return
    }
    statusHintTruncated.value = el.scrollWidth > el.clientWidth
  })
}

function handleTabBeforeLeave (activeName, oldActiveName) {
  activeTab.value = activeName
  switch (oldActiveName) {
  case 'peers':
    taskStore.toggleEnabledFetchPeers(false)
    break
  case 'files':
    resetTaskFilesSelection()
    break
  }
}

function handleTabClick (tab) {
  const { name } = tab
  activeTab.value = name
  switch (name) {
  case 'peers':
    taskStore.toggleEnabledFetchPeers(true)
    setImmediate(() => {
      if (taskPeers.value) {
        taskPeers.value.updateTableHeight()
      }
    })
    break
  case 'activity':
    nextTick(() => {
      if (taskGraphic.value) {
        taskGraphic.value.updateGraphicWidth()
      }
    })
    break
  case 'files':
    setImmediate(() => {
      updateFilesListSelection()
    })
    break
  }
}

function handleTabChange (tabName) {
  const prevTab = activeTab.value
  activeTab.value = tabName
  updateNavIndicator()
  switch (tabName) {
  case 'peers':
  case 'sources':
    taskStore.toggleEnabledFetchPeers(true)
    setImmediate(() => {
      const ref = tabName === 'sources' ? taskSources.value : taskPeers.value
      if (ref) {
        ref.updateTableHeight()
      }
    })
    break
  case 'activity':
    nextTick(() => {
      if (taskGraphic.value) {
        taskGraphic.value.updateGraphicWidth()
      }
    })
    break
  case 'files':
    setImmediate(() => {
      updateFilesListSelection()
    })
    break
  }
  if ((prevTab === 'peers' || prevTab === 'sources') && tabName !== 'peers' && tabName !== 'sources') {
    taskStore.toggleEnabledFetchPeers(false)
  }
}

function updateNavIndicator () {
  if (navSlider.value && navSlider.value.updateIndicator) {
    navSlider.value.updateIndicator()
  }
}

function updateFilesListSelection () {
  if (!detailFileList.value) return
  detailFileList.value.toggleSelection(selectedFileList.value)
  detailFileList.value.activeType = 'all'
}

function handleSelectionChange (val) {
  filesSelection.value = val
}

function resetTaskFilesSelection () {
  filesSelection.value = EMPTY_STRING
  selectionChangedCount.value = 0
  if (detailFileList.value) {
    detailFileList.value.hideConfirm()
  }
}

function saveTaskFilesSelection () {
  const { gid, filesSelection: fs } = { gid: props.gid, filesSelection: filesSelection.value }
  if (fs === NONE_SELECTED_FILES) {
    msg.warning(t('task.select-at-least-one'))
    return
  }
  const options = {
    selectFile: fs !== SELECTED_ALL_FILES ? fs : EMPTY_STRING
  }
  taskStore.changeTaskOption({ gid, options })
}
</script>

<style lang="scss">
.el-drawer__wrapper:has(.task-detail-drawer) {
  overflow: visible !important;
}
.task-detail-default-transparent {
  .task-detail-drawer,
  .task-detail-drawer .el-drawer__header,
  .task-detail-drawer .el-drawer__body,
  .task-detail-content {
    background-color: transparent !important;
    background: transparent !important;
  }

  .task-detail-drawer {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;

    .el-input__inner,
    .el-textarea__inner,
    .el-input-group__append,
    .el-input-group__prepend,
    .el-divider__text {
      background-color: transparent !important;
      background: transparent !important;
    }

    .el-table,
    .el-table__header-wrapper,
    .el-table__body-wrapper,
    .el-table__footer-wrapper,
    .el-table__fixed,
    .el-table__fixed-right,
    .el-table__fixed-header-wrapper,
    .el-table__fixed-body-wrapper,
    .el-table__fixed-footer-wrapper,
    .el-table__empty-block,
    .el-table__body,
    .el-table__header,
    .el-table tr,
    .el-table th,
    .el-table td {
      background-color: transparent !important;
      background: transparent !important;
    }

    .el-table::before,
    .el-table--border::after,
    .el-table__border-left-patch {
      background-color: transparent !important;
    }

    .mo-connections-summary,
    .graphic-box {
      background: transparent !important;
      background-color: transparent !important;
    }
  }

  .task-detail-drawer.task-detail-drawer--backdrop {
    backdrop-filter: blur(var(--task-detail-frosted-blur, 0px));
    -webkit-backdrop-filter: blur(var(--task-detail-frosted-blur, 0px));
  }
}

.theme-light.task-detail-default-transparent {
  .task-detail-drawer {
    background-color: rgba(255, 255, 255, var(--task-detail-frosted-alpha, 0)) !important;
    background: rgba(255, 255, 255, var(--task-detail-frosted-alpha, 0)) !important;
  }

  .task-detail-drawer {
    .el-form-item__label,
    .el-form-item__content,
    .form-static-value,
    .summary-label,
    .summary-value,
    .el-table,
    .el-table .cell,
    .el-table th,
    .el-table td {
      color: #000 !important;
    }

    .el-input__inner,
    .el-textarea__inner {
      color: #000 !important;
    }

    .el-input__inner::placeholder,
    .el-textarea__inner::placeholder {
      color: #606266 !important;
    }
  }
}

.theme-dark.task-detail-default-transparent {
  .task-detail-drawer {
    background-color: rgba(0, 0, 0, var(--task-detail-frosted-alpha, 0)) !important;
    background: rgba(0, 0, 0, var(--task-detail-frosted-alpha, 0)) !important;
  }

  .task-detail-drawer {
    .el-table,
    .el-table__header-wrapper,
    .el-table__body-wrapper,
    .el-table__footer-wrapper,
    .el-table__fixed,
    .el-table__fixed-right,
    .el-table__fixed-header-wrapper,
    .el-table__fixed-body-wrapper,
    .el-table__fixed-footer-wrapper,
    .el-table__empty-block,
    .el-table__body,
    .el-table__header,
    .el-table tr,
    .el-table th,
    .el-table td,
    .mo-connections-summary,
    .graphic-box {
      background-color: rgba(0, 0, 0, var(--task-detail-frosted-alpha, 0)) !important;
      background: rgba(0, 0, 0, var(--task-detail-frosted-alpha, 0)) !important;
    }
  }
}

.theme-light {
  .task-detail-drawer {
    .task-detail-hint,
    .task-detail-completion-time,
    .files-summary,
    .average-speed-samples,
    .mo-task-connections .mo-connections-empty,
    .mo-task-connections .mo-connections-loading,
    .mo-task-connections .mo-connections-summary .summary-label {
      color: #000 !important;
    }
  }
}

.theme-light.has-app-background-image:not(.task-detail-default-transparent) {
  .task-detail-drawer {
    background-color: var(--lc-bg-panel) !important;
    background: var(--lc-bg-panel) !important;
  }

  .task-detail-drawer {
    .el-form-item__label,
    .el-form-item__content,
    .form-static-value,
    .summary-label,
    .summary-value,
    .el-table,
    .el-table .cell,
    .el-table th,
    .el-table td {
      color: #000 !important;
    }

    .el-input__inner,
    .el-textarea__inner {
      color: #000 !important;
    }

    .el-input__inner::placeholder,
    .el-textarea__inner::placeholder {
      color: #606266 !important;
    }
  }

  .task-detail-drawer .el-drawer__header,
  .task-detail-drawer .el-drawer__body,
  .task-detail-content {
    background-color: transparent !important;
    background: transparent !important;
  }
}

.theme-dark.has-app-background-image:not(.task-detail-default-transparent) {
  .task-detail-drawer {
    background-color: var(--lc-bg-panel) !important;
    background: var(--lc-bg-panel) !important;
  }

  .task-detail-drawer .el-drawer__header,
  .task-detail-drawer .el-drawer__body,
  .task-detail-content {
    background-color: transparent !important;
    background: transparent !important;
  }
}

.task-detail-drawer {
  position: absolute !important;
  right: 8px !important;
  top: 8px !important;
  bottom: 8px !important;
  left: auto !important;
  min-width: 478px;
  height: auto !important;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  .el-drawer__header {
    padding: 0 !important;
    margin-bottom: 0 !important;
  }
  .el-drawer__header > .el-drawer__title {
    width: 100%;
    display: block;
  }
  .el-drawer__body {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .task-detail-hint {
    padding: 0.25rem 0.75rem 0.5rem;
    color: #9B9B9B;
    .task-detail-hint__text {
      display: inline-block;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
  .task-detail-drawer-title {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    padding: 1.125rem 0.1875rem 1rem 0.3125rem; /* 上间距减小；左（滑块）保持收紧、右（关闭按钮）再收紧 */
    box-sizing: border-box;
  }
  .task-detail-nav-wrapper {
    display: flex;
    align-items: center;
    width: 100%;
    justify-content: space-between;
    gap: 12px;
  }
  .task-detail-nav-bar {
    z-index: 2;
  }
  .task-detail-nav-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .task-detail-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #909399;
    cursor: pointer;
  }
  .task-detail-close:hover {
    color: var(--el-color-primary);
  }
  .task-detail-peer-search {
    max-width: 240px;
    :deep(.el-input__inner) {
      border-radius: 8px;
    }
  }
}

.task-detail-content {
  flex: 1;
  height: 0; /* Ensures flex container scrolls correctly */
  padding: 0.125rem 0.25rem; /* 继续收紧抽屉内容区顶部/下/左右留白 */
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
}

.task-detail-pane {
  height: 100%;
}

.task-detail-drawer {
  .action-wrapper {
    flex: 1;
  }
  .task-detail-actions {
    position: relative; /* Reset from absolute/sticky */
    z-index: 10;
    width: 100%;
    text-align: center;
    font-size: 0;
    padding: 0.5rem 1.25rem 0.375rem; /* 收紧底部控制按钮的底部留白 */
    display: flex;
    align-content: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .action-wrapper-center {
    padding: 1px 0;
    &> .task-item-actions {
      margin: 0 auto;
    }
  }
  .el-button {
    border-radius: 8px;
  }
}

.tab-panel-actions {
  display: flex;
  justify-content: space-between;
  position: absolute;
  bottom: -28px;
  left: 0;
  width: 100%;
}
</style>
