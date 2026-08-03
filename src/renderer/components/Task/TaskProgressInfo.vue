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
      <el-tooltip
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
      </el-tooltip>
      <div v-else-if="task.completedLength > 0 || task.totalLength > 0">
        <span>{{ task.completedLength | bytesToSize(2) }}</span>
        <span v-if="task.totalLength > 0"> / {{ task.totalLength | bytesToSize(2) }}</span>
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
          <span>{{ task.uploadSpeed | bytesToSize }}/s</span>
        </div>
        <div class="task-speed-text">
          <i><mo-icon name="arrow-down" width="10" height="14" /></i>
          <span>{{ task.downloadSpeed | bytesToSize }}/s</span>
        </div>
        <div class="task-speed-text hidden-sm-and-down" v-if="remaining > 0">
          <span>
            {{
              remaining | timeFormat({
                prefix: $t('task.remaining-prefix'),
                i18n: {
                  'gt1d': $t('app.gt1d'),
                  'hour': $t('app.hour'),
                  'minute': $t('app.minute'),
                  'second': $t('app.second')
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
          <span>{{ $t('task.priority-short') }} {{ taskPriority }}</span>
        </div>
        <div class="task-speed-text hidden-sm-and-down" v-if="nearCompleteHintText">
          <span>{{ nearCompleteHintText }}</span>
        </div>
      </div>
      <div class="task-completion-time" v-else-if="isMerging">
        <span v-if="mergeProgressText">{{ mergeProgressText }}</span>
        <span v-else>{{ $t('task.merging') }}</span>
      </div>
      <div class="task-completion-time" v-else-if="isCompleted">
        <span>{{ $t('task.completed-at') }} {{ completionTime }}</span>
      </div>
      <!-- 做种任务显示上传速度 -->
      <div class="task-speed-info" v-else-if="isSeeder">
        <div class="task-speed-text" v-if="isBT">
          <i><mo-icon name="arrow-up" width="10" height="14" /></i>
          <span>{{ task.uploadSpeed | bytesToSize }}/s</span>
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
          <span>{{ $t('task.task-ratio') }} {{ shareRatio }}</span>
        </div>
      </div>
    </el-col>
  </el-row>
  </div>
</template>

<script>
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
  import { mapState } from 'vuex'

  export default {
    name: 'mo-task-progress-info',
    data () {
      return {
        isStatusTruncated: false
      }
    },
    props: {
      task: {
        type: Object
      },
      viewMode: {
        type: String,
        default: 'list'
      }
    },
    computed: {
      ...mapState('task', {
        magnetStatuses: state => state.magnetStatuses,
        dataAccessStatuses: state => state.dataAccessStatuses,
        taskPriorities: state => state.taskPriorities,
        taskLinkUpdateHints: state => state.taskLinkUpdateHints || {},
        mergeProgresses: state => state.mergeProgresses,
        pendingFileSelection: state => state.pendingFileSelection || {}
      }),
      ...mapState('preference', {
        preferenceConfig: state => state.config
      }),
      leftColSpan () {
        // 在网格视图下，给左侧列更多空间以防止任务大小信息折叠
        if (this.viewMode === 'grid') {
          return {
            xs: 10, // 增加xs断点的空间
            sm: 9, // 增加sm断点的空间
            md: 8, // 增加md断点的空间
            lg: 8 // 增加lg断点的空间
          }
        }
        // 列表视图使用原来的设置
        return {
          xs: 12,
          sm: 7,
          md: 6,
          lg: 6
        }
      },
      rightColSpan () {
        // 在网格视图下，相应调整右侧列的空间
        if (this.viewMode === 'grid') {
          return {
            xs: 14, // 对应左侧的10
            sm: 15, // 对应左侧的9
            md: 16, // 对应左侧的8
            lg: 16 // 对应左侧的8
          }
        }
        // 列表视图使用原来的设置
        return {
          xs: 12,
          sm: 17,
          md: 18,
          lg: 18
        }
      },
      isActive () {
        const task = this.task || {}
        return task.status === TASK_STATUS.ACTIVE
      },
      isCompleted () {
        const task = this.task || {}
        const isSeeding = checkTaskIsSeeder(task)
        // BT任务正在做种时不显示为已完成
        if (task.status === TASK_STATUS.ACTIVE && isSeeding) {
          return false
        }
        // 如果是已下载完成的BT任务（不论是 COMPLETE 还是 PAUSED），或者状态是 COMPLETE/ERROR/REMOVED，视为已完成（显示完成时间）
        return [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED].includes(task.status) || (task.status === TASK_STATUS.PAUSED && isSeeding)
      },
      isMerging () {
        const task = this.task || {}
        return task.status === TASK_STATUS.MERGING
      },
      mergeProgress () {
        const gid = this.task && this.task.gid ? `${this.task.gid}` : ''
        if (!gid) return null
        return this.mergeProgresses && this.mergeProgresses[gid] ? this.mergeProgresses[gid] : null
      },
      mergeProgressText () {
        const p = this.mergeProgress
        if (!p) return ''
        if (p.waitingForPair) {
          return this.$t('task.merging-waiting-pair')
        }
        const parts = [this.$t('task.merging')]
        if (p.totalSize > 0) {
          parts.push(bytesToSize(p.totalSize))
        }
        if (p.speed > 0) {
          parts.push(`${p.speed}x`)
        }
        return parts.join(' · ')
      },
      isBT () {
        return this.task ? checkTaskIsBT(this.task) : false
      },
      isSeeder () {
        return this.isActive && this.task ? checkTaskIsSeeder(this.task) : false
      },
      statusHintText () {
        const task = this.task || {}
        const raw = `${task.statusHint || ''}`.trim()
        if (!raw) {
          return ''
        }
        if (raw.startsWith('task.')) {
          return this.$t(raw)
        }
        return raw
      },
      connectingStatusText () {
        const task = this.task || {}
        // 待选择文件的BT任务：左下角直接显示下载进度
        if (this.isPendingFileSelection) {
          return ''
        }
        const total = Number(task.totalLength)
        const completed = Number(task.completedLength)

        // ED2K tasks: totalLength is known from the ed2k:// URL even before
        // any data is downloaded. Show "searching for sources" until actual
        // download progress (completedLength > 0) is made.
        if (isEd2kTask(task) && completed === 0) {
          const taskStatus = `${task.status || ''}`
          // 完成、错误、暂停状态：不再显示搜索提示，改为显示进度（0 B / 总大小）
          if (
            taskStatus === TASK_STATUS.COMPLETE ||
            taskStatus === TASK_STATUS.ERROR ||
            taskStatus === TASK_STATUS.PAUSED
          ) {
            return ''
          }
          const statusHint = `${task.statusHint || ''}`.trim()
          if (statusHint === 'task.ed2k-searching-sources') {
            return this.$t(statusHint)
          }
          // Fallback: show searching hint for active/waiting ED2K with no progress
          return this.$t('task.ed2k-searching-sources')
        }

        // For non-ED2K tasks: if total/completed > 0, let download progress show.
        if (total > 0 || completed > 0) {
          return ''
        }
        // 当任务已经是 active 状态时，不显示 waiting 相关的提示。
        const engineConnectingHints = [
          'task.status-waiting'
        ]
        const hintConnectingHints = [
          'task.waiting-download-data',
          'task.magnet-fetching-metadata',
          'task.ed2k-searching-sources'
        ]
        const taskStatus = `${task.status || ''}`
        if (taskStatus === TASK_STATUS.ACTIVE) {
          const statusHint = `${task.statusHint || ''}`.trim()
          if (hintConnectingHints.includes(statusHint)) {
            return this.$t(statusHint)
          }
          return ''
        }
        const engineStatus = `${task.engineStatus || ''}`.trim()
        const statusHint = `${task.statusHint || ''}`.trim()
        if (engineConnectingHints.includes(engineStatus)) {
          return this.$t(engineStatus)
        }
        if (hintConnectingHints.includes(statusHint)) {
          return this.$t(statusHint)
        }
        return ''
      },
      isPendingFileSelection () {
        const task = this.task || {}
        const gid = task.gid ? `${task.gid}` : ''
        if (!gid) return false
        return !!(this.pendingFileSelection && this.pendingFileSelection[gid])
      },
      statusRightText () {
        const task = this.task || {}
        // 待选择文件的BT任务显示"待选择文件"
        if (this.isPendingFileSelection) {
          return this.$t('task.pending-file-selection')
        }
        // 磁力任务右下角直接显示速度信息（与普通卡片一致），
        // 不再展示 "磁力任务下载中" 等引擎透传的状态提示
        if (isMagnetTask(task)) {
          return ''
        }
        const raw = `${task.statusRightText || ''}`.trim()
        if (!raw) {
          return ''
        }
        if (raw.startsWith('task.')) {
          return this.$t(raw)
        }
        return raw
      },
      remaining () {
        const { totalLength, completedLength, downloadSpeed } = this.task
        return timeRemaining(totalLength, completedLength, downloadSpeed)
      },
      downloadPercentText () {
        const { totalLength, completedLength } = this.task || {}
        const total = Number(totalLength)
        const completed = Number(completedLength)
        if (!(total > 0) || !(completed >= 0)) {
          return ''
        }
        const percent = calcProgress(totalLength, completedLength)
        if (!Number.isFinite(percent)) {
          return ''
        }
        return `${percent}%`
      },
      completionTime () {
        // 使用任务保存时间作为完成时间，如果没有保存时间则使用当前时间
        const timestamp = this.task.savedAt || Date.now()
        const date = new Date(timestamp)
        return date.toLocaleString()
      },
      magnetHintText () {
        const zero = Number(this.task.downloadSpeed) === 0
        const isMagnet = isMagnetTask(this.task)
        if (!(isMagnet && zero)) return ''
        const s = this.magnetStatuses[this.task.gid]
        if (!s) return this.$t('task.magnet-fetching-metadata')
        const { peerCount = 0, trackerCount = 0, elapsedSec = 0, phase = '', peerTrend = 'flat', globalLimitLow = false, pauseMetadata = false } = s
        const cfg = this.preferenceConfig || {}
        const dhtEnabled = Number(cfg['dht-listen-port'] || cfg.dhtListenPort || 0) > 0
        const trackersConfigured = `${cfg['bt-tracker'] || cfg.btTracker || ''}`.trim().length > 0
        const elapsedMin = Math.floor(elapsedSec / 60)

        // 检查磁力解析是否完成（元数据已准备好）
        const metadataReady = this.task.totalLength > 0 && this.task.files && this.task.files.length > 0
        if (metadataReady) {
          // 元数据已准备好，但下载速度为0，可能是暂停状态
          return ''
        }

        if (phase === 'no_trackers' || (peerCount === 0 && trackerCount === 0)) {
          const base = trackersConfigured ? this.$t('task.magnet-status-contacting-trackers', { trackerCount }) : this.$t('task.magnet-status-no-trackers')
          const suggest = this.$t('task.magnet-suggest-add-trackers')
          return `${base}，${suggest}`
        }
        if (phase === 'contacting_trackers' || (peerCount === 0 && trackerCount > 0)) {
          const base = this.$t('task.magnet-status-contacting-trackers', { trackerCount })
          if (elapsedMin >= 2) {
            const wait = this.$t('task.magnet-status-long-wait') + ' ' + this.$t('task.magnet-status-elapsed-minutes', { minutes: elapsedMin })
            const extra = dhtEnabled ? '' : (' ' + this.$t('task.magnet-suggest-open-port'))
            const limit = globalLimitLow ? (' ' + this.$t('task.magnet-suggest-limit')) : ''
            const paused = pauseMetadata ? (' ' + this.$t('task.magnet-suggest-unpause-metadata')) : ''
            return `${base}，${wait}${extra}${limit}${paused}`
          }
          return base
        }
        // peers connected but metadata not ready
        const peersText = this.$t('task.magnet-status-peers', { peerCount })
        const trackersText = this.$t('task.magnet-status-trackers', { trackerCount })
        if (elapsedMin >= 2) {
          const wait = this.$t('task.magnet-status-long-wait') + ' ' + this.$t('task.magnet-status-elapsed-minutes', { minutes: elapsedMin })
          const trendText = peerTrend === 'up' ? this.$t('task.magnet-trend-up') : (peerTrend === 'down' ? this.$t('task.magnet-trend-down') : this.$t('task.magnet-trend-flat'))
          const limit = globalLimitLow ? (' ' + this.$t('task.magnet-suggest-limit')) : ''
          const paused = pauseMetadata ? (' ' + this.$t('task.magnet-suggest-unpause-metadata')) : ''
          return `${peersText}，${trackersText}，${wait}，${trendText}${limit}${paused}`
        }
        const trendText = peerTrend === 'up' ? this.$t('task.magnet-trend-up') : (peerTrend === 'down' ? this.$t('task.magnet-trend-down') : '')
        return `${peersText}，${trackersText}${trendText ? '，' + trendText : ''}`
      },
      taskPriority () {
        const gid = this.task && this.task.gid
        const map = this.taskPriorities || {}
        return (gid && map[gid]) ? Number(map[gid]) : 0
      },
      nearCompleteHintText () {
        const { totalLength, completedLength, downloadSpeed, status } = this.task
        if (status !== TASK_STATUS.ACTIVE) {
          return ''
        }
        const total = Number(totalLength)
        const completed = Number(completedLength)
        if (!(total > 0 && completed > 0)) {
          return ''
        }
        const progress = calcProgress(total, completed, 2)
        if (!(progress >= 99 && progress < 100)) {
          return ''
        }
        if (Number(downloadSpeed) > 0) {
          return ''
        }
        return this.$t('task.near-complete-verifying')
      },
      dataAccessHintText () {
        const task = this.task || {}
        const status = task.status
        const downloadSpeed = Number(task.downloadSpeed || 0)
        const isMagnet = isMagnetTask(task)
        if (isMagnet) {
          return ''
        }
        if (status === TASK_STATUS.ERROR) {
          const reason = this.resolveErrorReason(task.errorCode, task.errorMessage)
          if (reason) {
            return this.$t('task.download-fail-with-reason', { reason })
          }
          return this.$t('task.download-fail-notify')
        }
        if (status !== TASK_STATUS.ACTIVE) {
          return ''
        }
        if (downloadSpeed > 0) {
          return ''
        }
        const gid = task.gid
        const statusInfo = (this.dataAccessStatuses && gid && this.dataAccessStatuses[gid]) || {}
        const elapsedSec = Number(statusInfo.elapsedSec || 0)
        if (elapsedSec < 10) {
          return ''
        }
        return this.$t('task.waiting-download-data')
      },
      shareRatio () {
        if (!this.task) return 0
        const { totalLength, uploadLength } = this.task
        return calcRatio(totalLength, uploadLength)
      }
    },
    watch: {
      connectingStatusText () {
        this.updateStatusTruncation()
      },
      'task.status' () {
        this.$nextTick(() => this.recalcSpeedItems())
      },
      viewMode () {
        this.$nextTick(() => this.recalcSpeedItems())
      }
    },
    mounted () {
      this.updateStatusTruncation()
      this.$nextTick(() => this.recalcSpeedItems())
      if (typeof window !== 'undefined') {
        this._handleResize = () => {
          this.updateStatusTruncation()
          this.recalcSpeedItems()
        }
        window.addEventListener('resize', this._handleResize)
      }
    },
    beforeDestroy () {
      if (typeof window !== 'undefined') {
        if (this._handleResize) {
          window.removeEventListener('resize', this._handleResize)
          this._handleResize = null
        }
      }
    },
    methods: {
      resolveErrorReason (errorCode, errorMessage = '') {
        const code = Number(errorCode)
        if (!code) {
          return ''
        }
        const msg = `${errorMessage || ''}`
        if (code === 3) {
          return this.$t('task.error-reason-not-found')
        }
        if (code === 1) {
          // Fake-IP 错误（代理软件）
          if (/fake-ip|198\.18\.|198\.19\./i.test(msg)) {
            return this.$t('task.error-reason-fake-ip')
          }
          // DNS 解析错误
          if (/DNS|name resolution|hostname|getaddrinfo|no data/i.test(msg)) {
            return this.$t('task.error-reason-dns')
          }
          // SSL/TLS 错误
          if (/SSL|TLS|certificate/i.test(msg)) {
            return this.$t('task.error-reason-ssl')
          }
          // 连接超时
          if (/timeout|timed out/i.test(msg)) {
            return this.$t('task.error-reason-timeout')
          }
          // 连接被拒绝
          if (/connection refused|refused/i.test(msg)) {
            return this.$t('task.error-reason-refused')
          }
          return this.$t('task.error-reason-network')
        }
        if (code === 16) {
          if (/Permission denied|permission/i.test(msg)) {
            return this.$t('task.error-reason-permission')
          }
          if (/No space left|disk full/i.test(msg)) {
            return this.$t('task.error-reason-disk-full')
          }
          return this.$t('task.error-reason-disk')
        }
        return this.$t('task.error-reason-generic')
      },
      updateStatusTruncation () {
        this.$nextTick(() => {
          const el = this.$refs.statusText
          if (!el || !el.scrollWidth || !el.clientWidth) {
            this.isStatusTruncated = false
            return
          }
          this.isStatusTruncated = el.scrollWidth > el.clientWidth
        })
      },
      recalcSpeedItems () {
        this.$nextTick(() => {
          const containers = this.$el.querySelectorAll('.task-speed-info')
          containers.forEach(container => {
            const parent = container.parentElement
            if (!parent) return
            const availableWidth = parent.clientWidth
            if (!availableWidth) return

            const items = container.querySelectorAll('.task-speed-text')
            if (!items.length) return

            // Show all items first for accurate measurement
            items.forEach(item => { item.style.display = '' })

            // Measure each item's width (including margin-left ~6px)
            const widths = []
            for (let i = 0; i < items.length; i++) {
              widths[i] = items[i].offsetWidth + 6
            }

            // Calculate how many items fit
            let totalWidth = widths.reduce((sum, w) => sum + w, 0)
            let fitCount = items.length

            while (totalWidth > availableWidth && fitCount > 1) {
              fitCount--
              totalWidth -= widths[fitCount]
            }

            // Hide items that don't fit (from the end, keeping essential ones)
            for (let i = fitCount; i < items.length; i++) {
              items[i].style.display = 'none'
            }
          })
        })
      }
    },
    filters: {
      bytesToSize,
      timeFormat
    }
  }
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
