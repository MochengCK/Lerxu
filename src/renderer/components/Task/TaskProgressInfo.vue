<template>
  <div class="task-progress-info-wrap">
  <el-row class="task-progress-info">
  <el-col
      class="task-progress-info-left"
      :xs="leftColSpan.xs"
      :sm="leftColSpan.sm"
      :md="leftColSpan.md"
      :lg="leftColSpan.lg"
    >
      <mo-hover-tip
        v-if="connectingStatusText"
        effect="dark"
        :content="connectingStatusText"
        placement="top"
        :disabled="!isStatusTruncated"
      >
        <div
          ref="statusText"
          class="task-magnet-hint task-magnet-hint--ellipsis"
        >
          {{ connectingStatusText }}
        </div>
      </mo-hover-tip>
      <div v-else-if="task.completedLength > 0 || task.totalLength > 0">
        <span>{{ bytesToSize(task.completedLength, 2) }}</span>
        <span v-if="task.totalLength > 0"> / {{ bytesToSize(task.totalLength, 2) }}</span>
        <span v-if="downloadPercentText" class="task-progress-sep"></span>
        <span v-if="downloadPercentText" class="task-progress-percent">{{ downloadPercentText }}</span>
      </div>
    </el-col>
    <el-col
      class="task-progress-info-right"
      :xs="rightColSpan.xs"
      :sm="rightColSpan.sm"
      :md="rightColSpan.md"
      :lg="rightColSpan.lg"
    >
      <div class="task-completion-time" v-if="statusRightText">
        <span>{{ statusRightText }}</span>
      </div>
      <div class="task-speed-info" v-else-if="isActive && !isSeeder">
        <div class="task-speed-text" v-if="isBT">
          <i><mo-icon name="arrow-up" width="10" height="14" /></i>
          <span>{{ bytesToSize(task.uploadSpeed) }}/s</span>
        </div>
        <div class="task-speed-text">
          <i><mo-icon name="arrow-down" width="10" height="14" /></i>
          <span>{{ bytesToSize(task.downloadSpeed) }}/s</span>
        </div>
        <div class="task-speed-text hidden-sm-and-down" v-if="remaining > 0">
          <span>
            {{
              timeFormat(remaining, {
                prefix: t('task.remaining-prefix'),
                i18n: {
                  'gt1d': t('app.gt1d'),
                  'hour': t('app.hour'),
                  'minute': t('app.minute'),
                  'second': t('app.second')
                }
              })
            }}
          </span>
        </div>
        <div class="task-speed-text hidden-sm-and-down" v-if="isBT">
          <i><mo-icon name="magnet" width="10" height="14" /></i>
          <span>{{ task.numSeeders }}</span>
        </div>
        <div class="task-speed-text hidden-sm-and-down">
          <i><mo-icon name="node" width="10" height="14" /></i>
          <span>{{ task.connections }}</span>
        </div>
        <div class="task-speed-text" v-if="taskPriority > 0">
          <span>{{ t('task.priority-short') }} {{ taskPriority }}</span>
        </div>
        <div class="task-speed-text hidden-sm-and-down" v-if="nearCompleteHintText">
          <span>{{ nearCompleteHintText }}</span>
        </div>
      </div>
      <div class="task-completion-time" v-else-if="isMerging">
        <span v-if="mergeProgressText">{{ mergeProgressText }}</span>
        <span v-else>{{ t('task.merging') }}</span>
      </div>
      <div class="task-completion-time" v-else-if="isCompleted">
        <span>{{ isError ? t('task.error-at') : t('task.completed-at') }} {{ completionTime }}</span>
      </div>
      <!-- 做种任务显示上传速度 -->
      <div class="task-speed-info" v-else-if="isSeeder">
        <div class="task-speed-text" v-if="isBT">
          <i><mo-icon name="arrow-up" width="10" height="14" /></i>
          <span>{{ bytesToSize(task.uploadSpeed) }}/s</span>
        </div>
        <div class="task-speed-text" v-if="isBT">
          <i><mo-icon name="magnet" width="10" height="14" /></i>
          <span>{{ task.numSeeders }}</span>
        </div>
        <div class="task-speed-text">
          <i><mo-icon name="node" width="10" height="14" /></i>
          <span>{{ task.connections }}</span>
        </div>
        <div class="task-speed-text" v-if="isBT">
          <span>{{ t('task.task-ratio') }} {{ shareRatio }}</span>
        </div>
      </div>
    </el-col>
  </el-row>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, getCurrentInstance } from 'vue'
import {
  bytesToSize,
  checkTaskIsBT,
  checkTaskIsSeeder,
  timeFormat,
  timeRemaining,
  isMagnetTask,
  isEd2kTask,
  calcProgress,
  calcRatio
} from '@shared/utils'
import { TASK_STATUS } from '@shared/constants'
import '@/components/Icons/arrow-up'
import '@/components/Icons/arrow-down'
import '@/components/Icons/node'
import '@/components/Icons/magnet'
import { useTaskStore } from '@/store/task'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例

const { t } = i18n.global

const taskStore = useTaskStore()
const preferenceStore = usePreferenceStore()
const { magnetStatuses, dataAccessStatuses, taskPriorities, taskLinkUpdateHints, mergeProgresses, pendingFileSelection } = storeToRefs(taskStore)
const { config: preferenceConfig } = storeToRefs(preferenceStore)

const instance = getCurrentInstance()

const props = defineProps({
  task: {
    type: Object
  },
  viewMode: {
    type: String,
    default: 'list'
  }
})

defineOptions({ name: 'mo-task-progress-info' })

const statusText = ref(null)
const isStatusTruncated = ref(false)

let _handleResize = null

const leftColSpan = computed(() => {
  if (props.viewMode === 'grid') {
    return { xs: 10, sm: 9, md: 8, lg: 8 }
  }
  return { xs: 12, sm: 7, md: 6, lg: 6 }
})

const rightColSpan = computed(() => {
  if (props.viewMode === 'grid') {
    return { xs: 14, sm: 15, md: 16, lg: 16 }
  }
  return { xs: 12, sm: 17, md: 18, lg: 18 }
})

const isActive = computed(() => {
  const task = props.task || {}
  return task.status === TASK_STATUS.ACTIVE
})

const isCompleted = computed(() => {
  const task = props.task || {}
  const isSeeding = checkTaskIsSeeder(task)
  if (task.status === TASK_STATUS.ACTIVE && isSeeding) return false
  return [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED].includes(task.status) || (task.status === TASK_STATUS.PAUSED && isSeeding)
})

const isMerging = computed(() => {
  const task = props.task || {}
  return task.status === TASK_STATUS.MERGING
})

const isError = computed(() => {
  const task = props.task || {}
  return task.status === TASK_STATUS.ERROR
})

const mergeProgress = computed(() => {
  const gid = props.task && props.task.gid ? `${props.task.gid}` : ''
  if (!gid) return null
  return mergeProgresses.value && mergeProgresses.value[gid] ? mergeProgresses.value[gid] : null
})

const mergeProgressText = computed(() => {
  const p = mergeProgress.value
  if (!p) return ''
  if (p.waitingForPair) return t('task.merging-waiting-pair')
  const parts = [t('task.merging')]
  if (p.totalSize > 0) parts.push(bytesToSize(p.totalSize))
  if (p.speed > 0) parts.push(`${p.speed}x`)
  return parts.join(' · ')
})

const isBT = computed(() => {
  return props.task ? checkTaskIsBT(props.task) : false
})

const isSeeder = computed(() => {
  return isActive.value && props.task ? checkTaskIsSeeder(props.task) : false
})

const statusHintText = computed(() => {
  const task = props.task || {}
  const raw = `${task.statusHint || ''}`.trim()
  if (!raw) return ''
  if (raw.startsWith('task.')) return t(raw)
  return raw
})

const isPendingFileSelection = computed(() => {
  const task = props.task || {}
  const gid = task.gid ? `${task.gid}` : ''
  if (!gid) return false
  return !!(pendingFileSelection.value && pendingFileSelection.value[gid])
})

const connectingStatusText = computed(() => {
  const task = props.task || {}
  if (isPendingFileSelection.value) return ''
  const total = Number(task.totalLength)
  const completed = Number(task.completedLength)

  if (isEd2kTask(task) && completed === 0) {
    const taskStatus = `${task.status || ''}`
    if (taskStatus === TASK_STATUS.COMPLETE || taskStatus === TASK_STATUS.ERROR || taskStatus === TASK_STATUS.PAUSED) return ''
    const statusHint = `${task.statusHint || ''}`.trim()
    if (statusHint === 'task.ed2k-searching-sources') return t(statusHint)
    return t('task.ed2k-searching-sources')
  }

  if (total > 0 || completed > 0) return ''

  const engineConnectingHints = ['task.status-waiting']
  const hintConnectingHints = ['task.waiting-download-data', 'task.magnet-fetching-metadata', 'task.ed2k-searching-sources']
  const taskStatus = `${task.status || ''}`
  if (taskStatus === TASK_STATUS.ACTIVE) {
    const statusHint = `${task.statusHint || ''}`.trim()
    if (hintConnectingHints.includes(statusHint) && statusHint !== 'task.waiting-download-data') {
      return t(statusHint)
    }
    return ''
  }
  const engineStatus = `${task.engineStatus || ''}`.trim()
  const statusHint = `${task.statusHint || ''}`.trim()
  if (engineConnectingHints.includes(engineStatus)) return t(engineStatus)
  if (hintConnectingHints.includes(statusHint)) return t(statusHint)
  return ''
})

const statusRightText = computed(() => {
  const task = props.task || {}
  if (isPendingFileSelection.value) return t('task.pending-file-selection')
  if (isMagnetTask(task)) return ''
  const raw = `${task.statusRightText || ''}`.trim()
  if (!raw) return ''
  if (raw.startsWith('task.')) return t(raw)
  return raw
})

const remaining = computed(() => {
  const { totalLength, completedLength, downloadSpeed } = props.task
  return timeRemaining(totalLength, completedLength, downloadSpeed)
})

const downloadPercentText = computed(() => {
  const { totalLength, completedLength } = props.task || {}
  const total = Number(totalLength)
  const completed = Number(completedLength)
  if (!(total > 0) || !(completed >= 0)) return ''
  const percent = calcProgress(totalLength, completedLength)
  if (!Number.isFinite(percent)) return ''
  return `${percent}%`
})

const completionTime = computed(() => {
  const timestamp = props.task.savedAt || Date.now()
  const date = new Date(timestamp)
  return date.toLocaleString()
})

const magnetHintText = computed(() => {
  const zero = Number(props.task.downloadSpeed) === 0
  const isMagnet = isMagnetTask(props.task)
  if (!(isMagnet && zero)) return ''
  const s = magnetStatuses.value[props.task.gid]
  if (!s) return t('task.magnet-fetching-metadata')
  const { peerCount = 0, trackerCount = 0, elapsedSec = 0, phase = '', peerTrend = 'flat', globalLimitLow = false, pauseMetadata = false } = s
  const cfg = preferenceConfig.value || {}
  const dhtEnabled = Number(cfg['dht-listen-port'] || cfg.dhtListenPort || 0) > 0
  const trackersConfigured = `${cfg['bt-tracker'] || cfg.btTracker || ''}`.trim().length > 0
  const elapsedMin = Math.floor(elapsedSec / 60)

  const metadataReady = props.task.totalLength > 0 && props.task.files && props.task.files.length > 0
  if (metadataReady) return ''

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

const taskPriority = computed(() => {
  const gid = props.task && props.task.gid
  const map = taskPriorities.value || {}
  return (gid && map[gid]) ? Number(map[gid]) : 0
})

const nearCompleteHintText = computed(() => {
  const { totalLength, completedLength, downloadSpeed, status } = props.task
  if (status !== TASK_STATUS.ACTIVE) return ''
  const total = Number(totalLength)
  const completed = Number(completedLength)
  if (!(total > 0 && completed > 0)) return ''
  const progress = calcProgress(total, completed, 2)
  if (!(progress >= 99 && progress < 100)) return ''
  if (Number(downloadSpeed) > 0) return ''
  return t('task.near-complete-verifying')
})

const dataAccessHintText = computed(() => {
  const task = props.task || {}
  const status = task.status
  const downloadSpeed = Number(task.downloadSpeed || 0)
  const isMagnet = isMagnetTask(task)
  if (isMagnet) return ''
  if (status === TASK_STATUS.ERROR) {
    const reason = resolveErrorReason(task.errorCode, task.errorMessage)
    if (reason) return t('task.download-fail-with-reason', { reason })
    return t('task.download-fail-notify')
  }
  if (status !== TASK_STATUS.ACTIVE) return ''
  if (downloadSpeed > 0) return ''
  const gid = task.gid
  const statusInfo = (dataAccessStatuses.value && gid && dataAccessStatuses.value[gid]) || {}
  const elapsedSec = Number(statusInfo.elapsedSec || 0)
  if (elapsedSec < 10) return ''
  return t('task.waiting-download-data')
})

const shareRatio = computed(() => {
  if (!props.task) return 0
  const { totalLength, uploadLength } = props.task
  return calcRatio(totalLength, uploadLength)
})

function resolveErrorReason (errorCode, errorMessage = '') {
  const code = Number(errorCode)
  if (!code) return ''
  const msg = `${errorMessage || ''}`
  if (code === 3) return t('task.error-reason-not-found')
  if (code === 1) {
    if (/fake-ip|198\.18\.|198\.19\./i.test(msg)) return t('task.error-reason-fake-ip')
    if (/DNS|name resolution|hostname|getaddrinfo|no data/i.test(msg)) return t('task.error-reason-dns')
    if (/SSL|TLS|certificate/i.test(msg)) return t('task.error-reason-ssl')
    if (/timeout|timed out/i.test(msg)) return t('task.error-reason-timeout')
    if (/connection refused|refused/i.test(msg)) return t('task.error-reason-refused')
    return t('task.error-reason-network')
  }
  if (code === 16) {
    if (/Permission denied|permission/i.test(msg)) return t('task.error-reason-permission')
    if (/No space left|disk full/i.test(msg)) return t('task.error-reason-disk-full')
    return t('task.error-reason-disk')
  }
  return t('task.error-reason-generic')
}

function updateStatusTruncation () {
  nextTick(() => {
    const el = statusText.value
    if (!el || !el.scrollWidth || !el.clientWidth) {
      isStatusTruncated.value = false
      return
    }
    isStatusTruncated.value = el.scrollWidth > el.clientWidth
  })
}

function recalcSpeedItems () {
  nextTick(() => {
    const root = instance?.proxy?.$el
    if (!root) return
    const containers = root.querySelectorAll('.task-speed-info')
    containers.forEach(container => {
      const parent = container.parentElement
      if (!parent) return
      const availableWidth = parent.clientWidth
      if (!availableWidth) return

      const items = container.querySelectorAll('.task-speed-text')
      if (!items.length) return

      items.forEach(item => { item.style.display = '' })

      const widths = []
      for (let i = 0; i < items.length; i++) {
        widths[i] = items[i].offsetWidth + 6
      }

      let totalWidth = widths.reduce((sum, w) => sum + w, 0)
      let fitCount = items.length

      while (totalWidth > availableWidth && fitCount > 1) {
        fitCount--
        totalWidth -= widths[fitCount]
      }

      for (let i = fitCount; i < items.length; i++) {
        items[i].style.display = 'none'
      }
    })
  })
}

watch(connectingStatusText, () => {
  updateStatusTruncation()
})

watch(() => props.task?.status, () => {
  nextTick(() => recalcSpeedItems())
})

watch(() => props.viewMode, () => {
  nextTick(() => recalcSpeedItems())
})

onMounted(() => {
  updateStatusTruncation()
  nextTick(() => recalcSpeedItems())
  if (typeof window !== 'undefined') {
    _handleResize = () => {
      updateStatusTruncation()
      recalcSpeedItems()
    }
    window.addEventListener('resize', _handleResize)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && _handleResize) {
    window.removeEventListener('resize', _handleResize)
    _handleResize = null
  }
})
</script>

<style lang="scss">
.task-progress-info {
  font-size: 0.75rem;
  line-height: 0.875rem;
  min-height: 0.875rem;
  color: #9B9B9B;
  margin-top: 0.6rem;
  overflow: hidden;
  i {
    font-style: normal;
  }
}

.task-progress-info-left {
  min-height: 0.875rem;
  text-align: left;
  overflow: hidden;

  // 进度文字仅保证不换行，不进入省略模式：右边 speed-info 列还有空余空间时
  // 不应在本列固定宽度内提前截断成 "12.3 MB / 45.6 MB …"
  & > div {
    white-space: nowrap;
    min-width: 0; // 允许flex收缩但保持内容可见
  }

  // 在网格视图下给任务大小信息更多空间
  .task-item--grid & {
    flex: 0 0 auto; // 防止收缩
    min-width: 120px; // 设置最小宽度确保任务大小信息完整显示
  }
}
.task-progress-percent {
  margin-left: 0;
}
.task-progress-sep {
  display: inline-block;
  width: 1px;
  height: 0.625rem;
  background: currentColor;
  opacity: 0.65;
  margin: 0 0.25rem;
  vertical-align: middle;
  position: relative;
  top: -1px;
}
.task-progress-info-right {
  min-height: 0.875rem;
  text-align: right;
  overflow: hidden;
}
.task-speed-info {
  font-size: 0;
  white-space: nowrap;
  & > .task-speed-text {
    margin-left: 0.375rem;
    font-size: 0;
    line-height: 0.875rem;
    vertical-align: middle;
    display: inline-block;
    &:first-of-type {
      margin-left: 0;
    }
    & > i, & > span {
      height: 0.875rem;
      line-height: 0.875rem;
      display: inline-block;
      vertical-align: middle;
    }
    & > i {
      margin-right: 0.125rem;
    }
    & > span {
      font-size: 0.75rem;
    }
  }
}
.task-completion-time {
  font-size: 0.75rem;
  line-height: 0.875rem;
  color: #9B9B9B;
  text-align: right;
  min-height: 0.875rem;
}
.task-magnet-hint {
  font-size: 0.75rem;
  line-height: 0.875rem;
  min-height: 0.875rem;
  color: #9B9B9B;
}
.task-magnet-hint--ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  width: 100%;
}
.task-magnet-hint-row {
  margin-top: 2px;
}
</style>
