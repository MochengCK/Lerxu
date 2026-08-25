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
    <el-form-item :label="`${t('task.task-progress-info')}: `">
      <div class="form-static-value task-progress-static" style="overflow: hidden">
        <div class="task-progress-row">
          <div class="progress-wrapper">
            <mo-task-progress
              :completed="Number(task.completedLength)"
              :total="Number(task.totalLength)"
              :status="taskStatus"
              :speed="Number(task.downloadSpeed)"
            />
          </div>
          <div class="task-progress-percent">{{ percent }}</div>
        </div>
      </div>
    </el-form-item>
    <el-form-item>
      <div class="form-static-value">
        <span>{{ bytesToSize(task.completedLength, 2) }}</span>
        <span v-if="task.totalLength > 0"> / {{ bytesToSize(task.totalLength, 2) }}</span>
        <span class="task-time-remaining" v-if="isActive && remaining > 0">
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
    </el-form-item>
    <el-form-item :label="`${t('task.task-num-seeders')}: `" v-if="isBT">
      <div class="form-static-value">
        {{ task.numSeeders }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-connections')}: `">
      <div class="form-static-value">
        {{ task.connections }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-download-speed')}: `">
      <div class="form-static-value">
        <span>{{ bytesToSize(task.downloadSpeed) }}/s</span>
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-average-speed')}: `">
      <div class="form-static-value">
        <span>{{ bytesToSize(averageDownloadSpeed) }}/s</span>
        <span class="average-speed-samples" v-if="speedSampleCount > 0">
          ({{ t('task.task-average-speed-samples', { count: speedSampleCount }) }})
        </span>
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-upload-speed')}: `" v-if="isBT">
      <div class="form-static-value">
        <span>{{ bytesToSize(task.uploadSpeed) }}/s</span>
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-upload-length')}: `" v-if="isBT">
      <div class="form-static-value">
        <span>{{ bytesToSize(task.uploadLength) }}</span>
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-ratio')}: `" v-if="isBT">
      <div class="form-static-value">
        {{ ratio }}
      </div>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
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
import i18n from '@/plugins/i18n'
import TaskGraphic from '@/components/TaskGraphic/TaskGraphic'
import TaskProgress from '@/components/Task/TaskProgress'
import { usePreferenceStore } from '@/store/preference'
import { useTaskStore } from '@/store/task'
import { storeToRefs } from 'pinia'

const { t } = i18n.global

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
    type: Array,
    default: () => []
  },
  visible: {
    type: Boolean,
    default: false
  }
})

defineOptions({ name: 'mo-task-activity' })

const preferenceStore = usePreferenceStore()
const taskStore = useTaskStore()
const { config } = storeToRefs(preferenceStore)

const form = ref({})
const formLabelWidth = computed(() => calcFormLabelWidth(config.value.locale))
const locale = computed(() => config.value.locale)
const graphicWidth = ref(0)
const initialCompletedLength = ref(0)
const downloadStartTime = ref(null)
const downloadEndTime = ref(null)
const isDragging = ref(false)
const dragStartY = ref(0)
const dragStartScrollTop = ref(0)
const showTopFade = ref(false)
const showBottomFade = ref(false)
const graphicMaxRows = 6
let graphicRafId = null
let _fadeStateTimer = null
let _graphicDragBound = false

const graphicBox = ref(null)

const isRenderer = is.renderer()

const speedSamples = computed(() => {
  const gid = props.task && props.task.gid ? `${props.task.gid}` : ''
  const map = taskStore.taskSpeedSamples || {}
  const samples = gid && Array.isArray(map[gid]) ? map[gid] : []
  return samples
})

const isBT = computed(() => checkTaskIsBT(props.task))
const isSeeder = computed(() => checkTaskIsSeeder(props.task))
const taskStatus = computed(() => {
  if (isSeeder.value) {
    return TASK_STATUS.SEEDING
  }
  return props.task.status
})
const isActive = computed(() => taskStatus.value === TASK_STATUS.ACTIVE)
const percent = computed(() => {
  const { totalLength, completedLength } = props.task
  const p = calcProgress(totalLength, completedLength)
  return `${p}%`
})
const remaining = computed(() => {
  const { totalLength, completedLength, downloadSpeed } = props.task
  return timeRemaining(totalLength, completedLength, downloadSpeed)
})
const ratio = computed(() => {
  if (!isBT.value) return 0
  const { totalLength, uploadLength } = props.task
  return calcRatio(totalLength, uploadLength)
})

const averageDownloadSpeed = computed(() => {
  if (!isActive.value && props.task && props.task.averageDownloadSpeed != null) {
    const v = Number(props.task.averageDownloadSpeed)
    return Number.isFinite(v) && v >= 0 ? v : 0
  }

  if (speedSamples.value.length > 0) {
    const normalized = speedSamples.value
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

  if (props.task && props.task.averageDownloadSpeed != null) {
    const v = Number(props.task.averageDownloadSpeed)
    return Number.isFinite(v) && v >= 0 ? v : 0
  }

  return 0
})

const speedSampleCount = computed(() => {
  if (!isActive.value && props.task && props.task.averageSpeedSampleCount != null) {
    const v = Number(props.task.averageSpeedSampleCount)
    return Number.isFinite(v) && v >= 0 ? v : 0
  }
  return speedSamples.value
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
})

// Watchers
watch(
  () => props.task && props.task.completedLength,
  (newLength) => {
    const length = Number(newLength)
    if (Number.isFinite(length) && length > 0 && !downloadStartTime.value) {
      downloadStartTime.value = Date.now()
      initialCompletedLength.value = length
    }
  },
  { immediate: true }
)

watch(
  () => props.task && props.task.status,
  (newStatus, oldStatus) => {
    const currentLength = Number(props.task && props.task.completedLength ? props.task.completedLength : 0)
    if (
      oldStatus === TASK_STATUS.ACTIVE &&
      newStatus !== TASK_STATUS.ACTIVE &&
      downloadStartTime.value &&
      Number.isFinite(currentLength) &&
      currentLength > initialCompletedLength.value
    ) {
      downloadEndTime.value = Date.now()
    }
    if (newStatus === TASK_STATUS.ACTIVE && oldStatus !== TASK_STATUS.ACTIVE) {
      resetSpeedSamples()
      downloadStartTime.value = Date.now()
      initialCompletedLength.value = Number(props.task ? props.task.completedLength : 0) || 0
      downloadEndTime.value = null
    }
  }
)

watch(
  () => props.task && props.task.gid,
  (newGid, oldGid) => {
    if (newGid !== oldGid) {
      downloadStartTime.value = null
      initialCompletedLength.value = 0
      downloadEndTime.value = null
    }
  }
)

watch(graphicWidth, () => {
  scheduleUpdateGraphicFadeState()
})

watch(
  () => props.task && props.task.bitfield,
  () => {
    scheduleUpdateGraphicFadeState()
  }
)

// Lifecycle
onMounted(() => {
  setImmediate(() => {
    updateGraphicWidth()
  })
  const initLength = Number(props.task && props.task.completedLength ? props.task.completedLength : 0)
  if (Number.isFinite(initLength) && initLength > 0) {
    downloadStartTime.value = Date.now()
    initialCompletedLength.value = initLength
  }
})

onBeforeUnmount(() => {
  unbindGraphicDragEvents()
  if (graphicRafId) {
    cancelAnimationFrame(graphicRafId)
    graphicRafId = null
  }
  if (_fadeStateTimer) {
    clearTimeout(_fadeStateTimer)
  }
})

// Methods
function scheduleUpdateGraphicFadeState () {
  if (_fadeStateTimer) {
    clearTimeout(_fadeStateTimer)
  }
  _fadeStateTimer = setTimeout(() => {
    _fadeStateTimer = null
    updateGraphicFadeState()
  }, 200)
}

function updateGraphicWidth () {
  if (!graphicBox.value) return
  graphicWidth.value = calcInnerWidth(graphicBox.value)
  scheduleUpdateGraphicFadeState()
}

function calcInnerWidth (ele) {
  if (!ele) return 0
  const style = getComputedStyle(ele, null)
  const width = parseInt(style.width, 10)
  const paddingLeft = parseInt(style.paddingLeft, 10)
  const paddingRight = parseInt(style.paddingRight, 10)
  return width - paddingLeft - paddingRight
}

function updateGraphicFadeState () {
  try {
    const box = graphicBox.value
    if (!box) return
    const scrollH = box.scrollHeight || 0
    const clientH = box.clientHeight || 0
    const hasOverflow = scrollH > clientH + 2
    if (!hasOverflow) {
      showTopFade.value = false
      showBottomFade.value = false
      return
    }
    const scrollTop = box.scrollTop || 0
    showTopFade.value = scrollTop > 2
    const atBottom = scrollTop + clientH >= scrollH - 2
    showBottomFade.value = !atBottom
  } catch (_) {
    showTopFade.value = false
    showBottomFade.value = false
  }
}

function onGraphicScroll () {
  if (graphicRafId) return
  graphicRafId = requestAnimationFrame(() => {
    graphicRafId = null
    updateGraphicFadeState()
  })
}

function onGraphicMouseDown (e) {
  try {
    const box = graphicBox.value
    if (!box) return
    const scrollH = box.scrollHeight || 0
    const clientH = box.clientHeight || 0
    if (scrollH <= clientH + 2) return
    isDragging.value = true
    dragStartY.value = e.clientY
    dragStartScrollTop.value = box.scrollTop || 0
    bindGraphicDragEvents()
    e.preventDefault()
  } catch (_) {}
}

function bindGraphicDragEvents () {
  if (_graphicDragBound) return
  _graphicDragBound = true
  document.addEventListener('mousemove', onGraphicMouseMove)
  document.addEventListener('mouseup', onGraphicMouseUp)
}

function unbindGraphicDragEvents () {
  if (!_graphicDragBound) return
  _graphicDragBound = false
  document.removeEventListener('mousemove', onGraphicMouseMove)
  document.removeEventListener('mouseup', onGraphicMouseUp)
}

function onGraphicMouseMove (e) {
  if (!isDragging.value) return
  try {
    const box = graphicBox.value
    if (!box) return
    const deltaY = e.clientY - dragStartY.value
    box.scrollTop = dragStartScrollTop.value - deltaY
  } catch (_) {}
}

function onGraphicMouseUp () {
  isDragging.value = false
  unbindGraphicDragEvents()
}

function resetSpeedSamples () {
  const gid = props.task && props.task.gid ? `${props.task.gid}` : ''
  if (gid) {
    taskStore.resetTaskSpeedSamples(gid)
  }
  downloadStartTime.value = null
  initialCompletedLength.value = 0
}

defineExpose({
  updateGraphicWidth
})
</script>

<style lang="scss">
.task-progress-static {
  width: 100%;
}

.task-progress-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.task-progress-row .progress-wrapper {
  flex: 1;
  min-width: 0;
  padding: 0.6875rem 0 0 0;

  .el-progress {
    width: 100%;
  }
}

.task-progress-percent {
  flex-shrink: 0;
  margin-left: 12px;
  white-space: nowrap;
}

.progress-wrapper {
  width: 100%;

  .el-progress {
    width: 100%;
  }
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
