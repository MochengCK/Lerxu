<template>
  <el-drawer
    :custom-class="drawerClass"
    size="73.7%"
    v-if="gid"
    :with-header="true"
    :show-close="false"
    :destroy-on-close="true"
    :visible="visible"
    :before-close="handleClose"
    append-to-body
    @open="handleOpen"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <div slot="title" class="task-detail-drawer-title">
      <div class="task-detail-nav-wrapper">
        <div class="task-detail-nav-bar">
          <el-radio-group :value="activeTab" size="mini" @input="handleTabChange">
            <el-radio-button label="general">
              {{ $t('task.task-detail-general') }}
            </el-radio-button>
            <el-radio-button label="activity">
              {{ $t('task.task-detail-activity') }}
            </el-radio-button>
            <el-radio-button label="trackers" v-if="isBT">
              {{ $t('task.task-detail-trackers') }}
            </el-radio-button>
            <el-radio-button label="peers" v-if="isBT">
              {{ $t('task.task-detail-peers') }}
            </el-radio-button>
            <el-radio-button label="files">
              {{ $t('task.task-detail-files') }}
            </el-radio-button>
            <el-radio-button label="connections">
              {{ $t('task.task-detail-connections') }}
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="task-detail-nav-actions">
          <el-input
            v-if="activeTab === 'peers' && isBT"
            v-model="peerSearch"
            size="mini"
            class="task-detail-peer-search"
            :placeholder="$t('task.peers-search')"
            clearable
          />
          <button type="button" class="task-detail-close" aria-label="Close" @click="handleClose">
            <i class="el-icon-close"></i>
          </button>
        </div>
      </div>
    </div>
    <div v-if="statusHintText" class="task-detail-hint">
      <el-tooltip
        effect="dark"
        :content="statusHintText"
        placement="bottom"
        :disabled="!statusHintTruncated"
      >
        <span
          ref="detailStatusText"
          class="task-detail-hint__text"
        >
          {{ statusHintText }}
        </span>
      </el-tooltip>
    </div>
    <div v-if="isCompleted" class="task-detail-completion-time">
      <span class="task-detail-completion-time__text">{{ $t('task.completed-at') }} {{ completionTime }}</span>
    </div>
    <div class="task-detail-content">
      <div v-show="activeTab === 'general'">
        <mo-task-general :task="task" />
      </div>
      <div v-show="activeTab === 'activity'">
        <mo-task-activity ref="taskGraphic" :task="task" />
      </div>
      <div v-show="activeTab === 'trackers'" v-if="isBT">
        <mo-task-trackers :task="task" />
      </div>
      <div v-show="activeTab === 'peers'" v-if="isBT" class="task-detail-pane">
        <mo-task-peers ref="taskPeers" :peers="peers" :task="task" :search-text="peerSearch" />
      </div>
      <div v-show="activeTab === 'files'">
        <mo-task-files
          ref="detailFileList"
          mode="DETAIL"
          :files="fileList"
          @selection-change="handleSelectionChange"
        />
      </div>
      <div v-show="activeTab === 'connections'">
        <mo-task-connections :task="task" />
      </div>
    </div>
    <div class="task-detail-actions">
      <div class="action-wrapper action-wrapper-left" v-if="optionsChanged">
        <el-button @click="resetChanged">
          {{$t('app.reset')}}
        </el-button>
      </div>
      <div class="action-wrapper action-wrapper-center">
        <mo-task-item-actions mode="DETAIL" :task="task" />
      </div>
      <div class="action-wrapper action-wrapper-right" v-if="optionsChanged">
        <el-button type="primary" @click="saveChanged">
          {{$t('app.save')}}
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script>
  import is from 'electron-is'
  import { debounce, merge } from 'lodash'
  import {
    calcFormLabelWidth,
    checkTaskIsBT,
    checkTaskIsSeeder,
    isMagnetTask,
    getFileName,
    getFileExtension
  } from '@shared/utils'
  import {
    EMPTY_STRING,
    NONE_SELECTED_FILES,
    SELECTED_ALL_FILES,
    TASK_STATUS
  } from '@shared/constants'
  import TaskItemActions from '@/components/Task/TaskItemActions'
  import TaskGeneral from './TaskGeneral'
  import TaskActivity from './TaskActivity'
  import TaskTrackers from './TaskTrackers'
  import TaskPeers from './TaskPeers'
  import TaskFiles from './TaskFiles'
  import TaskConnections from './TaskConnections'
  import { mapState } from 'vuex'

  const cached = {
    files: []
  }

  export default {
    name: 'mo-task-detail',
    components: {
      [TaskItemActions.name]: TaskItemActions,
      [TaskGeneral.name]: TaskGeneral,
      [TaskActivity.name]: TaskActivity,
      [TaskTrackers.name]: TaskTrackers,
      [TaskPeers.name]: TaskPeers,
      [TaskFiles.name]: TaskFiles,
      [TaskConnections.name]: TaskConnections
    },
    props: {
      gid: {
        type: String
      },
      task: {
        type: Object
      },
      files: {
        type: Array,
        default: function () {
          return []
        }
      },
      peers: {
        type: [Object, Array],
        default: function () {
          return { connected: [], attempting: [], banned: [], disconnected: [] }
        }
      },
      visible: {
        type: Boolean,
        default: false
      }
    },
    data () {
      const { locale } = this.$store.state.preference.config
      return {
        form: {},
        formLabelWidth: calcFormLabelWidth(locale),
        locale,
        activeTab: 'general',
        peerSearch: '',
        graphicWidth: 0,
        optionsChanged: false,
        filesSelection: EMPTY_STRING,
        selectionChangedCount: 0,
        statusHintTruncated: false,
        resizeHandler: null,
        drawerAnimationDone: false
      }
    },
    computed: {
      ...mapState('task', {
        magnetStatuses: state => state.magnetStatuses,
        dataAccessStatuses: state => state.dataAccessStatuses
      }),
      ...mapState('preference', {
        preferenceConfig: state => state.config
      }),
      isRenderer: () => is.renderer(),
      taskDetailDefaultTransparentEnabled () {
        const cfg = this.preferenceConfig || {}
        return cfg.taskDetailDefaultTransparent === undefined ? false : !!cfg.taskDetailDefaultTransparent
      },
      taskDetailFrostedBlurValue () {
        const cfg = this.preferenceConfig || {}
        const raw = Number(cfg.taskDetailFrostedBlur)
        return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 10) : 0
      },
      shouldEnableBackdrop () {
        return this.taskDetailDefaultTransparentEnabled && this.taskDetailFrostedBlurValue > 0
      },
      drawerClass () {
        const base = 'panel task-detail-drawer'
        return this.shouldEnableBackdrop ? `${base} task-detail-drawer--backdrop` : base
      },
      isBT () {
        return checkTaskIsBT(this.task)
      },
      isSeeder () {
        const task = this.task || {}
        return task.status === TASK_STATUS.ACTIVE && checkTaskIsSeeder(task)
      },
      magnetHintText () {
        const task = this.task || {}
        const zero = Number(task.downloadSpeed) === 0
        const isMagnet = isMagnetTask(task)

        // 检查任务是否已经完成解析（元数据已准备好）
        const metadataReady = task.totalLength > 0 && task.files && task.files.length > 0

        // 如果不是磁力链接、下载速度不为零、或者元数据已准备好，都不显示提示
        if (!(isMagnet && zero && !metadataReady)) return ''

        const s = this.magnetStatuses[task.gid]
        if (!s) return this.$t('task.magnet-fetching-metadata')
        const { peerCount = 0, trackerCount = 0, elapsedSec = 0, phase = '', peerTrend = 'flat', globalLimitLow = false, pauseMetadata = false } = s
        const cfg = this.preferenceConfig || {}
        const dhtEnabled = Number(cfg['dht-listen-port'] || cfg.dhtListenPort || 0) > 0
        const trackersConfigured = `${cfg['bt-tracker'] || cfg.btTracker || ''}`.trim().length > 0
        const elapsedMin = Math.floor(elapsedSec / 60)
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
      statusHintText () {
        const task = this.task || {}
        if (!task) {
          return ''
        }
        const raw = `${task.statusHint || ''}`.trim()
        if (!raw) {
          return ''
        }
        if (raw.startsWith('task.')) {
          return this.$t(raw)
        }
        return raw
      },
      resolveErrorReason () {
        return (errorCode, errorMessage = '') => {
          const code = Number(errorCode)
          if (!code) {
            return ''
          }
          const msg = `${errorMessage || ''}`
          if (code === 3) {
            return this.$t('task.error-reason-not-found')
          }
          if (code === 1) {
            if (/SSL|TLS|certificate/i.test(msg)) {
              return this.$t('task.error-reason-ssl')
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
        }
      },
      taskStatus () {
        const { task, isSeeder } = this
        if (isSeeder && task.status === TASK_STATUS.ACTIVE) {
          return TASK_STATUS.SEEDING
        } else {
          return task.status
        }
      },
      fileList () {
        const { files } = this
        const task = this.task || {}
        const cfg = this.preferenceConfig || {}
        const suffix = cfg.downloadingFileSuffix || ''
        const completedStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
        const shouldStripSuffix = !!(suffix && !this.isBT && completedStatuses.includes(task.status))
        const result = files.map((item) => {
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
      },
      selectedFileList () {
        const { fileList } = this
        const result = fileList.filter((item) => item.selected)

        return result
      },
      isCompleted () {
        const task = this.task || {}
        if (!task.gid) return false
        const isSeeder = checkTaskIsSeeder(task)
        // BT任务正在做种时不显示为已完成
        if (task.status === TASK_STATUS.ACTIVE && isSeeder) {
          return false
        }
        // 如果是已下载完成的BT任务（不论是 COMPLETE 还是 PAUSED），或者状态是 COMPLETE/ERROR/REMOVED，视为已完成（显示完成时间）
        return [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED].includes(task.status) || (task.status === TASK_STATUS.PAUSED && isSeeder)
      },
      completionTime () {
        // 使用任务保存时间作为完成时间，如果没有保存时间则使用当前时间
        if (!this.task) return ''
        const timestamp = this.task.savedAt || Date.now()
        return new Date(timestamp).toLocaleString()
      }
    },
    mounted () {
      this.resizeHandler = debounce(() => {
        if (this.activeTab === 'activity' && this.$refs.taskGraphic) {
          this.$refs.taskGraphic.updateGraphicWidth()
        }
      }, 250)
      window.addEventListener('resize', this.resizeHandler)
    },
    destroyed () {
      window.removeEventListener('resize', this.resizeHandler)
      if (this.resizeHandler && this.resizeHandler.cancel) {
        this.resizeHandler.cancel()
      }
      cached.files = []
    },
    watch: {
      gid () {
        cached.files = []
      },
      statusHintText () {
        this.updateStatusTruncation()
      }
    },
    methods: {
      handleOpen () {
        this.drawerAnimationDone = false
      },
      handleOpened () {
        const done = () => {
          this.drawerAnimationDone = true

          // 如果当前标签是peers，启用节点数据获取
          if (this.activeTab === 'peers') {
            this.$store.dispatch('task/toggleEnabledFetchPeers', true)
          }

          if (this.activeTab === 'peers' && this.$refs.taskPeers) {
            setImmediate(() => {
              this.$refs.taskPeers.updateTableHeight()
            })
          }
          if (this.activeTab === 'activity' && this.$refs.taskGraphic) {
            this.$refs.taskGraphic.updateGraphicWidth()
          }
        }
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
          window.requestAnimationFrame(() => window.requestAnimationFrame(done))
          return
        }
        setTimeout(done, 0)
      },
      handleClose (done) {
        this.drawerAnimationDone = false
        // 关闭任务详情时禁用节点数据获取
        this.$store.dispatch('task/toggleEnabledFetchPeers', false)
        this.$store.dispatch('task/hideTaskDetail')
        window.removeEventListener('resize', this.resizeHandler)
        if (this.resizeHandler && this.resizeHandler.cancel) {
          this.resizeHandler.cancel()
        }
        if (typeof done === 'function') {
          done()
        }
      },
      handleClosed (done) {
        this.drawerAnimationDone = false
        this.$store.dispatch('task/updateCurrentTaskGid', EMPTY_STRING)
        this.$store.dispatch('task/updateCurrentTaskItem', null)
        this.optionsChanged = false
        this.resetFaskFilesSelection()
      },
      updateStatusTruncation () {
        this.$nextTick(() => {
          const el = this.$refs.detailStatusText
          if (!el || !el.scrollWidth || !el.clientWidth) {
            this.statusHintTruncated = false
            return
          }
          this.statusHintTruncated = el.scrollWidth > el.clientWidth
        })
      },
      handleTabBeforeLeave (activeName, oldActiveName) {
        this.activeTab = activeName
        this.optionsChanged = false
        switch (oldActiveName) {
        case 'peers':
          this.$store.dispatch('task/toggleEnabledFetchPeers', false)
          break
        case 'files':
          this.resetFaskFilesSelection()
          break
        }
      },
      handleTabClick (tab) {
        const { name } = tab
        this.activeTab = name
        switch (name) {
        case 'peers':
          this.$store.dispatch('task/toggleEnabledFetchPeers', true)
          setImmediate(() => {
            if (this.$refs.taskPeers) {
              this.$refs.taskPeers.updateTableHeight()
            }
          })
          break
        case 'activity':
          this.$nextTick(() => {
            if (this.$refs.taskGraphic) {
              this.$refs.taskGraphic.updateGraphicWidth()
            }
          })
          break
        case 'files':
          setImmediate(() => {
            this.updateFilesListSelection()
          })
          break
        }
      },
      handleTabChange (tabName) {
        this.activeTab = tabName
        switch (tabName) {
        case 'peers':
          this.$store.dispatch('task/toggleEnabledFetchPeers', true)
          setImmediate(() => {
            if (this.$refs.taskPeers) {
              this.$refs.taskPeers.updateTableHeight()
            }
          })
          break
        case 'activity':
          this.$nextTick(() => {
            if (this.$refs.taskGraphic) {
              this.$refs.taskGraphic.updateGraphicWidth()
            }
          })
          break
        case 'files':
          setImmediate(() => {
            this.updateFilesListSelection()
          })
          break
        }
      },
      resetChanged () {
        const { activeTab } = this
        switch (activeTab) {
        case 'files':
          this.resetFaskFilesSelection()
          this.updateFilesListSelection()
          break
        }
        this.optionsChanged = false
      },
      saveChanged () {
        const { activeTab } = this
        switch (activeTab) {
        case 'files':
          this.saveFaskFilesSelection()
          break
        }
        this.optionsChanged = false
      },
      updateFilesListSelection () {
        if (!this.$refs.detailFileList) {
          return
        }

        const { selectedFileList } = this
        this.$refs.detailFileList.toggleSelection(selectedFileList)
      },
      handleSelectionChange (val) {
        this.filesSelection = val
        this.selectionChangedCount += 1
        if (this.selectionChangedCount > 1) {
          this.optionsChanged = true
        }
      },
      resetFaskFilesSelection () {
        this.filesSelection = EMPTY_STRING
        this.selectionChangedCount = 0
      },
      saveFaskFilesSelection () {
        const { gid, filesSelection } = this
        if (filesSelection === NONE_SELECTED_FILES) {
          this.$msg.warning(this.$t('task.select-at-least-one'))
          return
        }

        const options = {
          selectFile: filesSelection !== SELECTED_ALL_FILES ? filesSelection : EMPTY_STRING
        }
        this.$store.dispatch('task/changeTaskOption', { gid, options })
      }
    }
  }
</script>

<style lang="scss">
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
    .el-radio-button__inner,
    .el-table,
    .el-table .cell,
    .el-table th,
    .el-table td {
      color: #000 !important;
    }

    .task-detail-nav-bar .el-radio-button.is-active .el-radio-button__inner {
      color: #fff !important;
    }

    .task-detail-nav-bar .el-radio-button:not(.is-active) .el-radio-button__inner:hover {
      color: $--color-primary !important;
    }

    .task-detail-nav-bar .el-radio-button.is-active .el-radio-button__inner:hover {
      color: #fff !important;
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
    background-color: $--panel-background !important;
    background: $--panel-background !important;
  }

  .task-detail-drawer {
    .el-form-item__label,
    .el-form-item__content,
    .form-static-value,
    .summary-label,
    .summary-value,
    .el-radio-button__inner,
    .el-table,
    .el-table .cell,
    .el-table th,
    .el-table td {
      color: #000 !important;
    }

    .task-detail-nav-bar .el-radio-button.is-active .el-radio-button__inner {
      color: #fff !important;
    }

    .task-detail-nav-bar .el-radio-button:not(.is-active) .el-radio-button__inner:hover {
      color: $--color-primary !important;
    }

    .task-detail-nav-bar .el-radio-button.is-active .el-radio-button__inner:hover {
      color: #fff !important;
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
    background-color: $--dk-panel-background !important;
    background: $--dk-panel-background !important;
  }

  .task-detail-drawer .el-drawer__header,
  .task-detail-drawer .el-drawer__body,
  .task-detail-content {
    background-color: transparent !important;
    background: transparent !important;
  }
}

.task-detail-drawer {
  min-width: 478px;
  .el-drawer__header {
    padding: 3rem 0.75rem 0;
    margin-bottom: 0;
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
  .task-detail-completion-time {
    padding: 0.25rem 0.75rem 0.5rem;
    color: #9B9B9B;
    font-size: 0.875rem;
    .task-detail-completion-time__text {
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
  }
  .task-detail-nav-wrapper {
    display: flex;
    align-items: center;
    width: 100%;
    justify-content: space-between;
  }
  .task-detail-nav-bar {
    display: flex;
    align-items: center;
    position: relative;
    z-index: 2;
    flex: 1;
  }
  .task-detail-nav-bar :deep(.el-radio-group) {
    display: inline-flex;
  }
  .task-detail-nav-bar :deep(.el-radio-button) {
    .el-radio-button__inner {
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
    }
  }
  .task-detail-nav-bar :deep(.el-radio-button:first-child .el-radio-button__inner) {
    border-radius: 4px 0 0 4px;
  }
  .task-detail-nav-bar :deep(.el-radio-button:last-child .el-radio-button__inner) {
    border-radius: 0 4px 4px 0;
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
    color: $--color-primary;
  }
  .task-detail-peer-search {
    max-width: 240px;
  }
}

.task-detail-content {
  flex: 1;
  height: 0; /* Ensures flex container scrolls correctly */
  padding: 0.5rem 0.75rem;
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
    padding: 0 1.25rem 1.5rem;
    display: flex;
    align-content: space-between;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .action-wrapper-left {
    text-align: left;
  }
  .action-wrapper-center {
    padding: 1px 0;
    &> .task-item-actions {
      margin: 0 auto;
    }
  }
  .action-wrapper-right {
    text-align: right;
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
