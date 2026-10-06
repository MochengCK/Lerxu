<template>
  <div class="task-progress-info-wrap">
  <div class="task-progress-info">
  <div class="task-progress-info-left">
      <!-- 直播录制任务：**当前状态 + 已录制时长 + 已录制大小**，状态左侧是
           录制图标（录制中为红点，其余状态随文字色变灰）。它优先于下面所有
           分支 —— 直播的总长是未知的（流在生长），"已下载 / 总大小 / 百分比"
           那套在此没有意义。 -->
      <div v-if="isLiveTask" class="task-live-info">
        <i class="task-live-record" :class="{ 'is-recording': isLiveRecording }">
          <mo-icon name="record" width="11" height="11" />
        </i>
        <span>{{ liveStatusText }}</span>
        <span class="task-progress-sep"></span>
        <span>{{ liveRecordedText }}</span>
      </div>
      <!-- 合并期间**进度属于合并**：下载已结束，再显示"已下载 / 总大小"就是
           一直停在 100% 不动，看不出还在干活。 -->
      <div v-else-if="mergePercentText">
        <span>{{ t('task.merging') }}</span>
        <span class="task-progress-sep"></span>
        <span class="task-progress-percent">{{ mergePercentText }}</span>
      </div>
      <!-- 有进度可显示就**优先显示进度**：已下载 / 已知总大小 / 百分比。
           HLS 的总大小是逐步收敛的（先来自清单码率、再被实测外推修正），
           所以这里只要 `totalLength > 0` 就带上它，不再等"精确总长"。
           提示文字退到后面去，否则「正在获取数据…」会把大小和百分比盖住。 -->
      <div v-else-if="task.completedLength > 0 || task.totalLength > 0">
        <span>{{ bytesToSize(task.completedLength, 2) }}</span>
        <span v-if="task.totalLength > 0"> / {{ bytesToSize(task.totalLength, 2) }}</span>
        <span v-if="downloadPercentText" class="task-progress-sep"></span>
        <span v-if="downloadPercentText" class="task-progress-percent">{{ downloadPercentText }}</span>
        <!-- 「一对音视频」：一条记录背后是两个文件（视频流 + 音频流），
             大小与百分比都是两者之和；合并完成后也继续显示（这条记录仍然
             是"一对流合出来的"） -->
        <span v-if="showPairHint" class="task-progress-sep"></span>
        <span v-if="showPairHint" class="task-pair-hint">{{ t('task.pair-streams-hint') }}</span>
      </div>
      <mo-hover-tip
        v-else-if="connectingStatusText"
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
    </div>
    <div class="task-progress-info-right">
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
      </div>
      <!-- 「已下载完、还没合并」与「正在合并」共用同一句话：进度条此刻是满格
           黄条（见 TaskProgress.vue 的 resolveProgressView，唯一实现），
           说"完成"是假的 —— 产物还没生成。这两者必须同一个口径，
           否则就会出现"条是黄的、文案写着下载完成"（用户报的形态）。 -->
      <div class="task-completion-time" v-else-if="isMerging || isPendingMerge">
        <span v-if="mergeProgressText">{{ mergeProgressText }}</span>
        <span v-else>{{ isPendingMerge && !isMerging ? t('task.merging-pending') : t('task.merging') }}</span>
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
    </div>
  </div>
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
import { getPairGidCandidates, resolveProgressView } from '@/utils/taskPair'
import '@/components/Icons/arrow-up'
import '@/components/Icons/arrow-down'
import '@/components/Icons/node'
import '@/components/Icons/magnet'
import '@/components/Icons/record'
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

const isActive = computed(() => {
  const task = props.task || {}
  return task.status === TASK_STATUS.ACTIVE
})

/**
 * 这条任务是不是**直播录制**（引擎在清单确认没有 `#EXT-X-ENDLIST` 时置位，
 * 见引擎 status 的 `isLive` 字段）。
 *
 * 直播任务的卡片下半行换一套信息：当前状态 + 已录制时长 + 已录制大小 ——
 * 直播的总长在录制中永远未知，"已下载 / 总大小 / 百分比"没有分母。
 */
const isLiveTask = computed(() => {
  const task = props.task || {}
  return task.isLive === true
})

/** 正在录制（红点）；暂停/完成/失败时图标随文字色（灰）。 */
const isLiveRecording = computed(() => {
  const task = props.task || {}
  return task.status === TASK_STATUS.ACTIVE
})

const liveStatusText = computed(() => {
  const task = props.task || {}
  const status = `${task.status || ''}`
  const map = {
    [TASK_STATUS.ACTIVE]: 'task.live-recording',
    [TASK_STATUS.WAITING]: 'task.status-waiting',
    [TASK_STATUS.PAUSED]: 'task.live-paused',
    [TASK_STATUS.COMPLETE]: 'task.live-completed',
    [TASK_STATUS.ERROR]: 'task.live-error',
    [TASK_STATUS.REMOVED]: 'task.status-removed'
  }
  const key = map[status]
  return key ? t(key) : status
})

/**
 * 「已录制 时长 · 大小」。时长取引擎上报的 `liveRecordedMs` —— 口径是
 * **已拼进产物的媒体分片 `#EXTINF` 之和**（产物能播多长），不是"从按下
 * 录制过去了多久"：断网追帧时两者会分叉，用户关心的是前者。
 */
const liveRecordedText = computed(() => {
  const task = props.task || {}
  const ms = Number(task.liveRecordedMs)
  const secs = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n) => String(n).padStart(2, '0')
  const duration = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
  const size = bytesToSize(Number(task.completedLength) || 0, 2)
  return `${t('task.live-recorded')} ${duration} · ${size}`
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

/**
 * 这条记录当前的**合并进度**（引擎实时上报的 percent / 已写字节 / 速率）。
 *
 * 只认带 `percent` 的条目。「先下完的那条流」留下的 `{waitingForPair:true}`
 * 是内部状态（合并闸门用它避免提前合并、避免删掉还在写的输入文件），
 * **不再往上翻成文案**：折叠记录本身就是两条流的总进度，
 * 一条下完时用户看到的应该是"还在下载 + 总量进度"，而不是"等待配对文件下载完成"
 * —— 那个状态对用户没有信息量，还和进度条上的总进度自相矛盾。
 * 两条都下完、合并真的开始之后才有 percent，界面才切到合并进度。
 */
const mergeProgress = computed(() => {
  // 合并进度挂在"后下完的那条流"的 gid 上，未必是这条记录的主 gid，
  // 所以要遍历记录背后的全部成员（折叠记录的 pairGids）。
  const map = mergeProgresses.value || {}
  for (const gid of getPairGidCandidates(props.task)) {
    const entry = map[gid]
    if (!entry || entry.waitingForPair) {
      continue
    }
    if (Number.isFinite(Number(entry.percent))) {
      return entry
    }
  }
  return null
})

/**
 * 「一对音视频」标记要不要显示。
 *
 * **合并完成后也继续显示**：合并流程会把记录收敛成一条（pairCount 变 1），
 * 但它仍然是"一对流合出来的产物"，标记不该跟着消失 —— 所以这里只看
 * `isPair` / `pairId`，不看还剩几条成员。
 */
const showPairHint = computed(() => {
  const task = props.task || {}
  return task.isPair === true || !!task.pairId
})

/**
 * 「两个文件都下完了、还没合并」阶段（进度条是满格黄条那一档）。
 *
 * 判据直接复用进度条那条唯一实现 `resolveProgressView`，两者不允许各判一次 ——
 * 一旦分叉就会复现"黄条 + 完成文案"的自相矛盾。
 * 注意成员全部完成时聚合状态本身就是 complete（`dashMerged` 还没落），
 * 所以不能只看 status。
 */
const isPendingMerge = computed(() => {
  const task = props.task || {}
  if (!(task.isPair === true || task.pairId)) {
    return false
  }
  const view = resolveProgressView({
    isPair: true,
    merged: task.dashMerged === true || task.pairMerged === true,
    mergeSkipped: task.mergeSkipped === true,
    status: `${task.status || ''}`,
    total: Number(task.totalLength) || 0,
    completed: Number(task.completedLength) || 0,
    mergePercent: -1
  })
  return view.mode !== 'plain'
})

const mergeProgressText = computed(() => {
  const p = mergeProgress.value
  if (!p) return ''
  const parts = []
  // 已写 / 输入总量：合并是"只搬字节"，这两个数的比值就是进度条的分母
  if (p.totalSize > 0) {
    parts.push(p.inputBytes > 0
      ? `${bytesToSize(p.totalSize)} / ${bytesToSize(p.inputBytes)}`
      : bytesToSize(p.totalSize))
  }
  // 引擎报的是**写入速率**（字节/秒）。以前把它当倍数显示（"123456x"）是错的
  if (p.speed > 0) parts.push(`${bytesToSize(p.speed)}/s`)
  return parts.length ? parts.join(' · ') : t('task.merging')
})

/**
 * 合并百分比（引擎实时上报）。合并期间左侧显示它，而不是"已下载 / 总大小" ——
 * 那时下载早就 100% 了，再显示那两个数字看不出合并在动。
 */
const mergePercentText = computed(() => {
  const p = mergeProgress.value
  if (!p) return ''
  const v = Number(p.percent)
  if (!Number.isFinite(v) || v <= 0) return ''
  return `${Math.min(100, Math.round(v))}%`
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

  // 已经开始、但一个字节都还没到：HLS 要先取播放列表（还可能要读变体清单），
  // 普通 HTTP 也要先握手。**必须在 `total > 0` 那条之前判断** —— HLS 的总长
  // 是随分片落地实时估算出来的，早期可能已经有 total 但 completed 仍是 0。
  // 这里只出文字；"在动"的感知交给进度条上的扫光动效（TaskItem 的
  // isFetchingMetadata → TaskProgress 的 .is-fetching-metadata），
  // 左下角不放独立动画（用户点名不要）。
  if (`${task.status || ''}` === TASK_STATUS.ACTIVE
    && completed === 0
    && Number(task.downloadSpeed || 0) === 0) {
    return t('task.fetching-data')
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
/* 左右两栏改成**内容自适应的 flex**：以前用 el-col 按栅格定死宽度
   （左栏 lg 只有 25%），「一对音视频」的大小 + 百分比 + 标记一长就被裁掉，
   而右边明明还有大片空余。现在左栏按需伸展、右栏只占自己需要的宽度。 */
.task-progress-info {
  display: flex;
  /* 必须 center，不能用 baseline：右栏（速度/ETA 那一列）第一行里带着
     14px 的行内图标（vertical-align:middle 的 <i>），它会把右栏的
     "首行基线"压到比自己文字更低的位置——baseline 对齐时右栏整体被顶低
     约 4px，看起来就是"右下角信息比左侧往下偏"。两侧都是一行、行高一致，
     center 与 baseline 的差异只体现在这段偏移上（实测：改前右侧文字 top
     比左侧低 4px，改后完全一致）。 */
  align-items: center;
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
  flex: 1 1 auto;
  min-width: 0; // 允许被右栏挤压：真放不下时才省略，而不是溢出压住右栏
  min-height: 0.875rem;
  text-align: left;
  overflow: hidden;

  // 进度文字仅保证不换行，不进入省略模式：右边 speed-info 列还有空余空间时
  // 不应提前截断成 "12.3 MB / 45.6 MB …"
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
/* 「一对音视频」标记：与大小文字同色系但更淡，不抢进度数字的注意力 */
.task-pair-hint {
  opacity: 0.75;
}
/* 直播录制信息行：录制图标（状态左侧）+ 当前状态 + 已录制时长 · 大小 */
.task-live-info {
  display: flex;
  align-items: center;
  /* flex 子项在挤压时会各自换行（文本里的空格就是断点）—— 直播信息必须是
     一行，放不下时交给外层 overflow: hidden 裁掉（与其它行的口径一致） */
  white-space: nowrap;
  /* 分隔条在 flex 行里由 align-items:center 居中即可：全局的 `top:-1px` 是
     给**行内文本**语境校的（vertical-align:middle 的基准不同），在 flex 里
     会把它整体抬高 1px —— 看起来就是"横杠向上偏移"（实测 sep 中心比文字
     中心高 1px，置 0 后完全对齐）。 */
  .task-progress-sep {
    top: 0;
  }
  .task-live-record {
    display: inline-flex;
    align-items: center;
    height: 0.875rem;
    margin-right: 0.25rem;
    /* 非录制态（暂停/完成/失败）随文字色变灰；录制中才是红点 */
    color: inherit;
    opacity: 0.65;
    & > svg {
      display: block;
    }
    &.is-recording {
      color: var(--lc-color-danger, #f56c6c);
      opacity: 1;
    }
  }
}
.task-progress-info-right {
  flex: 0 0 auto; // 速度/时间等右栏内容只占自己需要的宽度
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
