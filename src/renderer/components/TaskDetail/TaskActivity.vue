<template>
  <el-form
    class="mo-task-activity"
    ref="form"
    :model="form"
    :label-width="formLabelWidth"
    v-if="task"
  >
    <div class="graphic-wrap" ref="graphicWrap">
      <div
        class="graphic-box"
        ref="graphicBox"
        :class="{ 'is-dragging': isDragging }"
        @mousedown="onGraphicMouseDown"
        @scroll="onGraphicScroll"
      >
        <div class="graphic-scroll-inner" ref="graphicInner">
          <mo-task-graphic
            :outerWidth="graphicWidth"
            :bitfield="task.bitfield"
            :numPieces="Number(task.numPieces)"
            :downloadSpeed="Number(task.downloadSpeed)"
            :pieceLength="Number(task.pieceLength)"
            v-if="graphicWidth > 0"
          />
        </div>
      </div>
      <div
        class="graphic-fade graphic-fade--top"
        v-show="showTopFade"
      />
      <div
        class="graphic-fade graphic-fade--bottom"
        v-show="showBottomFade"
      />
    </div>
    <el-form-item :label="`${$t('task.task-progress-info')}: `">
      <div class="form-static-value" style="overflow: hidden">
        <el-row :gutter="12">
          <el-col :span="18">
            <div class="progress-wrapper">
              <mo-task-progress
                :completed="Number(task.completedLength)"
                :total="Number(task.totalLength)"
                :status="taskStatus"
                :speed="Number(task.downloadSpeed)"
              />
            </div>
          </el-col>
          <el-col :span="5">
            {{ percent }}
          </el-col>
        </el-row>
      </div>
    </el-form-item>
    <el-form-item>
      <div class="form-static-value">
        <span>{{ task.completedLength | bytesToSize(2) }}</span>
        <span v-if="task.totalLength > 0"> / {{ task.totalLength | bytesToSize(2) }}</span>
        <span class="task-time-remaining" v-if="isActive && remaining > 0">
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
    </el-form-item>
    <el-form-item :label="`${$t('task.task-num-seeders')}: `" v-if="isBT">
      <div class="form-static-value">
        {{ task.numSeeders }}
      </div>
    </el-form-item>
    <el-form-item :label="`${$t('task.task-connections')}: `">
      <div class="form-static-value">
        {{ task.connections }}
      </div>
    </el-form-item>
    <el-form-item :label="`${$t('task.task-download-speed')}: `">
      <div class="form-static-value">
        <span>{{ task.downloadSpeed | bytesToSize }}/s</span>
      </div>
    </el-form-item>
    <el-form-item :label="`${$t('task.task-average-speed')}: `">
      <div class="form-static-value">
        <span>{{ averageDownloadSpeed | bytesToSize }}/s</span>
        <span class="average-speed-samples" v-if="speedSampleCount > 0">
          ({{ $t('task.task-average-speed-samples', { count: speedSampleCount }) }})
        </span>
      </div>
    </el-form-item>
    <el-form-item :label="`${$t('task.task-upload-speed')}: `" v-if="isBT">
      <div class="form-static-value">
        <span>{{ task.uploadSpeed | bytesToSize }}/s</span>
      </div>
    </el-form-item>
    <el-form-item :label="`${$t('task.task-upload-length')}: `" v-if="isBT">
      <div class="form-static-value">
        <span>{{ task.uploadLength | bytesToSize }}</span>
      </div>
    </el-form-item>
    <el-form-item :label="`${$t('task.task-ratio')}: `" v-if="isBT">
      <div class="form-static-value">
        {{ ratio }}
      </div>
    </el-form-item>
  </el-form>
</template>

<script>
  import is from 'electron-is'
  import {
    bytesToSize,
    calcFormLabelWidth,
    calcProgress,
    calcRatio,
    checkTaskIsBT,
    checkTaskIsSeeder,
    timeFormat,
    timeRemaining
  } from '@shared/utils'
  import { TASK_STATUS } from '@shared/constants'
  import TaskGraphic from '@/components/TaskGraphic/TaskGraphic'
  import TaskProgress from '@/components/Task/TaskProgress'

  export default {
    name: 'mo-task-activity',
    components: {
      [TaskGraphic.name]: TaskGraphic,
      [TaskProgress.name]: TaskProgress
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
        type: Array,
        default: function () {
          return []
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
        graphicWidth: 0,
        // 记录开始采样时的已下载量，用于计算增量
        initialCompletedLength: 0,
        downloadStartTime: null,
        downloadEndTime: null,
        // 拖拽滚动状态
        isDragging: false,
        dragStartY: 0,
        dragStartScrollTop: 0,
        // 渐变显示状态
        showTopFade: false,
        showBottomFade: false,
        graphicMaxRows: 6,
        graphicRafId: null
      }
    },
    computed: {
      isRenderer: () => is.renderer(),
      speedSamples () {
        const gid = this.task && this.task.gid ? `${this.task.gid}` : ''
        const map = this.$store.state.task.taskSpeedSamples || {}
        const samples = gid && Array.isArray(map[gid]) ? map[gid] : []
        return samples
      },
      isBT () {
        return checkTaskIsBT(this.task)
      },
      isSeeder () {
        return checkTaskIsSeeder(this.task)
      },
      taskStatus () {
        const { task, isSeeder } = this
        if (isSeeder) {
          return TASK_STATUS.SEEDING
        } else {
          return task.status
        }
      },
      isActive () {
        return this.taskStatus === TASK_STATUS.ACTIVE
      },
      percent () {
        const { totalLength, completedLength } = this.task
        const percent = calcProgress(totalLength, completedLength)
        return `${percent}%`
      },
      remaining () {
        const { totalLength, completedLength, downloadSpeed } = this.task
        return timeRemaining(totalLength, completedLength, downloadSpeed)
      },
      ratio () {
        if (!this.isBT) {
          return 0
        }

        const { totalLength, uploadLength } = this.task
        const ratio = calcRatio(totalLength, uploadLength)
        return ratio
      },
      averageDownloadSpeed () {
        // 如果任务不是活跃状态，或者任务中有已保存的平均速度且我们没有样本（例如刚恢复）
        if (!this.isActive && this.task && this.task.averageDownloadSpeed != null) {
          const v = Number(this.task.averageDownloadSpeed)
          return Number.isFinite(v) && v >= 0 ? v : 0
        }

        // 如果有样本，计算当前样本的平均速度
        if (this.speedSamples.length > 0) {
          const normalized = this.speedSamples
            .map(s => {
              if (typeof s === 'number') {
                const speed = Number(s)
                if (!Number.isFinite(speed) || speed < 0) return null
                return { bytes: speed, durationMs: 1000 }
              }
              if (!s || typeof s !== 'object') return null
              const bytes = Number(s.bytes)
              const durationMs = Number(s.durationMs)
              if (!Number.isFinite(bytes) || bytes < 0) return null
              if (!Number.isFinite(durationMs) || durationMs <= 0) return null
              return { bytes, durationMs }
            })
            .filter(Boolean)

          if (normalized.length > 0) {
            const totalBytes = normalized.reduce((sum, it) => sum + it.bytes, 0)
            const totalDurationMs = normalized.reduce((sum, it) => sum + it.durationMs, 0)
            const avg = totalDurationMs > 0 ? Math.round((totalBytes * 1000) / totalDurationMs) : 0
            return avg
          }
        }

        // 如果没有样本（例如刚启动应用，samples还未累积），但有历史记录
        if (this.task && this.task.averageDownloadSpeed != null) {
          const v = Number(this.task.averageDownloadSpeed)
          return Number.isFinite(v) && v >= 0 ? v : 0
        }

        return 0
      },
      speedSampleCount () {
        if (!this.isActive && this.task && this.task.averageSpeedSampleCount != null) {
          const v = Number(this.task.averageSpeedSampleCount)
          return Number.isFinite(v) && v >= 0 ? v : 0
        }
        return this.speedSamples
          .map(s => {
            if (typeof s === 'number') {
              const speed = Number(s)
              return Number.isFinite(speed) && speed > 0 ? speed : 0
            }
            if (!s || typeof s !== 'object') return 0
            const bytes = Number(s.bytes)
            const durationMs = Number(s.durationMs)
            if (!Number.isFinite(bytes) || bytes < 0) return 0
            if (!Number.isFinite(durationMs) || durationMs <= 0) return 0
            const speed = (bytes * 1000) / durationMs
            return Number.isFinite(speed) && speed > 0 ? speed : 0
          })
          .filter(v => v > 0).length
      }
    },
    filters: {
      bytesToSize,
      timeFormat
    },
    watch: {
      'task.completedLength': {
        handler (newLength, oldLength) {
          // 检测下载开始（仅在未记录起始时间时）
          const length = Number(newLength)
          if (Number.isFinite(length) && length > 0 && !this.downloadStartTime) {
            this.downloadStartTime = Date.now()
            this.initialCompletedLength = length
          }
        },
        immediate: true
      },
      'task.status': {
        handler (newStatus, oldStatus) {
          const currentLength = Number(this.task && this.task.completedLength ? this.task.completedLength : 0)
          if (
            oldStatus === TASK_STATUS.ACTIVE &&
            newStatus !== TASK_STATUS.ACTIVE &&
            this.downloadStartTime &&
            Number.isFinite(currentLength) &&
            currentLength > this.initialCompletedLength
          ) {
            this.downloadEndTime = Date.now()
          }
          if (newStatus === TASK_STATUS.ACTIVE && oldStatus !== TASK_STATUS.ACTIVE) {
            this.resetSpeedSamples()
            this.downloadStartTime = Date.now()
            this.initialCompletedLength = Number(this.task ? this.task.completedLength : 0) || 0
            this.downloadEndTime = null
          }
        }
      },
      'task.gid': {
        handler (newGid, oldGid) {
          if (newGid !== oldGid) {
            this.downloadStartTime = null
            this.initialCompletedLength = 0
            this.downloadEndTime = null
          }
        }
      },
      graphicWidth: {
        handler () {
          this.scheduleUpdateGraphicFadeState()
        }
      },
      'task.bitfield': {
        handler () {
          // bitfield changes frequently during BT download; debounce to avoid
          // forced reflow (scrollHeight/clientHeight/scrollTop reads) on every tick.
          this.scheduleUpdateGraphicFadeState()
        }
      }
    },
    mounted () {
      setImmediate(() => {
        this.updateGraphicWidth()
      })
      // 初始化记录当前已下载量（作为基准线）
      const initLength = Number(this.task && this.task.completedLength ? this.task.completedLength : 0)
      if (Number.isFinite(initLength) && initLength > 0) {
        this.downloadStartTime = Date.now()
        this.initialCompletedLength = initLength
      }
    },
    beforeDestroy () {
      this.unbindGraphicDragEvents()
      if (this.graphicRafId) {
        cancelAnimationFrame(this.graphicRafId)
        this.graphicRafId = null
      }
      if (this._fadeStateTimer) {
        clearTimeout(this._fadeStateTimer)
      }
    },
    methods: {
      scheduleUpdateGraphicFadeState () {
        // Debounce: bitfield changes frequently during BT download, and
        // updateGraphicFadeState reads scrollHeight/clientHeight/scrollTop
        // (forced reflow). Collapse repeated calls into one layout read.
        if (this._fadeStateTimer) {
          clearTimeout(this._fadeStateTimer)
        }
        this._fadeStateTimer = setTimeout(() => {
          this._fadeStateTimer = null
          this.updateGraphicFadeState()
        }, 200)
      },
      updateGraphicWidth () {
        if (!this.$refs.graphicBox) {
          return
        }
        this.graphicWidth = this.calcInnerWidth(this.$refs.graphicBox)
        this.scheduleUpdateGraphicFadeState()
      },
      calcInnerWidth (ele) {
        if (!ele) {
          return 0
        }

        const style = getComputedStyle(ele, null)
        const width = parseInt(style.width, 10)
        const paddingLeft = parseInt(style.paddingLeft, 10)
        const paddingRight = parseInt(style.paddingRight, 10)
        return width - paddingLeft - paddingRight
      },
      calcGraphicMaxHeight () {
        const atomHeight = 10
        const atomGutter = 3
        const paddingTop = 8
        const paddingBottom = 8
        return this.graphicMaxRows * (atomHeight + atomGutter) - atomGutter + paddingTop + paddingBottom
      },
      updateGraphicFadeState () {
        try {
          const box = this.$refs.graphicBox
          if (!box) return
          const scrollH = box.scrollHeight || 0
          const clientH = box.clientHeight || 0
          const hasOverflow = scrollH > clientH + 2
          if (!hasOverflow) {
            this.showTopFade = false
            this.showBottomFade = false
            return
          }
          const scrollTop = box.scrollTop || 0
          this.showTopFade = scrollTop > 2
          const atBottom = scrollTop + clientH >= scrollH - 2
          this.showBottomFade = !atBottom
        } catch (_) {
          this.showTopFade = false
          this.showBottomFade = false
        }
      },
      onGraphicScroll () {
        if (this.graphicRafId) return
        this.graphicRafId = requestAnimationFrame(() => {
          this.graphicRafId = null
          this.updateGraphicFadeState()
        })
      },
      onGraphicMouseDown (e) {
        try {
          const box = this.$refs.graphicBox
          if (!box) return
          const scrollH = box.scrollHeight || 0
          const clientH = box.clientHeight || 0
          if (scrollH <= clientH + 2) return
          this.isDragging = true
          this.dragStartY = e.clientY
          this.dragStartScrollTop = box.scrollTop || 0
          this.bindGraphicDragEvents()
          e.preventDefault()
        } catch (_) {}
      },
      bindGraphicDragEvents () {
        if (this._graphicDragBound) return
        this._graphicDragBound = true
        document.addEventListener('mousemove', this.onGraphicMouseMove)
        document.addEventListener('mouseup', this.onGraphicMouseUp)
      },
      unbindGraphicDragEvents () {
        if (!this._graphicDragBound) return
        this._graphicDragBound = false
        document.removeEventListener('mousemove', this.onGraphicMouseMove)
        document.removeEventListener('mouseup', this.onGraphicMouseUp)
      },
      onGraphicMouseMove (e) {
        if (!this.isDragging) return
        try {
          const box = this.$refs.graphicBox
          if (!box) return
          const deltaY = e.clientY - this.dragStartY
          box.scrollTop = this.dragStartScrollTop - deltaY
        } catch (_) {}
      },
      onGraphicMouseUp () {
        this.isDragging = false
        this.unbindGraphicDragEvents()
      },
      resetSpeedSamples () {
        const gid = this.task && this.task.gid ? `${this.task.gid}` : ''
        if (gid) {
          this.$store.dispatch('task/resetTaskSpeedSamples', gid)
        }
        this.downloadStartTime = null
        this.initialCompletedLength = 0
      }
    }
  }
</script>

<style lang="scss">
.progress-wrapper {
  padding: 0.6875rem 0 0 0;
}

.task-time-remaining {
  margin-left: 1rem;
}

.average-speed-samples {
  margin-left: 0.5rem;
  color: #909399;
  font-size: 0.85em;
}

.mo-task-activity .graphic-wrap {
  position: relative;
  margin-bottom: 1.5rem;
}

.mo-task-activity .graphic-box {
  max-height: 110px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  margin-bottom: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.15) transparent;

  &.is-dragging {
    cursor: grabbing;
  }

  .graphic-scroll-inner {
    font-size: 0;
    line-height: 0;
  }

  & > svg {
    display: block;
    margin: 0 auto;
  }
}

.mo-task-activity .graphic-box::-webkit-scrollbar {
  width: 6px;
}

.mo-task-activity .graphic-box::-webkit-scrollbar-track {
  background: transparent;
}

.mo-task-activity .graphic-box::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

.mo-task-activity .graphic-box::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

.theme-dark .mo-task-activity .graphic-box::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

.theme-dark .mo-task-activity .graphic-box::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.35);
}

.theme-dark .mo-task-activity .graphic-box {
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.mo-task-activity .graphic-fade {
  position: absolute;
  left: 0;
  right: 6px;
  height: 22px;
  pointer-events: none;
  z-index: 2;

  &--top {
    top: 0;
  }

  &--bottom {
    bottom: 0;
  }
}

.mo-task-activity .graphic-fade--top {
  background: linear-gradient(to bottom, rgba(var(--lc-bg-panel-rgb), 1) 0%, rgba(var(--lc-bg-panel-rgb), 0) 100%);
}
.mo-task-activity .graphic-fade--bottom {
  background: linear-gradient(to top, rgba(var(--lc-bg-panel-rgb), 1) 0%, rgba(var(--lc-bg-panel-rgb), 0) 100%);
}

.task-detail-default-transparent .mo-task-activity .graphic-fade--top {
  background: linear-gradient(to bottom, rgba(var(--lc-bg-panel-rgb), 0.8) 0%, rgba(var(--lc-bg-panel-rgb), 0) 100%);
}
.task-detail-default-transparent .mo-task-activity .graphic-fade--bottom {
  background: linear-gradient(to top, rgba(var(--lc-bg-panel-rgb), 0.8) 0%, rgba(var(--lc-bg-panel-rgb), 0) 100%);
}
</style>
