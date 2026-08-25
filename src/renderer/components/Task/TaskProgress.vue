<template>
  <el-progress
    :percentage="displayPercent"
    :show-text="false"
    :status="isActive ? 'success' : undefined"
    :color="color"
    :define-back-color="backColor"
    :class="{ 'is-pending-selection': pendingSelection }">
  </el-progress>
</template>

<script setup>
defineOptions({ name: 'mo-task-progress' }) // 供父组件 [X.name]: X 注册
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { TASK_STATUS } from '@shared/constants'
import { calcProgress } from '@shared/utils'
import colors from '@shared/colors'

const props = defineProps({
  total: {
    type: Number
  },
  completed: {
    type: Number
  },
  status: {
    type: String,
    default: TASK_STATUS.ACTIVE
  },
  speed: {
    type: Number,
    default: 0
  },
  pendingSelection: {
    type: Boolean,
    default: false
  }
})

const displayPercent = ref(0)
const ticker = ref(null)
const baseCompleted = ref(0)
const baseTime = ref(0)
const currentSpeed = ref(0)
const lastIndeterminate = ref(false)

const isActive = computed(() => props.status === TASK_STATUS.ACTIVE)

const percent = computed(() => {
  const raw = calcProgress(props.total, props.completed)
  if (props.status === TASK_STATUS.COMPLETE || props.status === TASK_STATUS.SEEDING || props.status === TASK_STATUS.MERGING) {
    return 100
  }
  if (!Number.isFinite(raw)) {
    return 0
  }
  if (raw < 0) {
    return 0
  }
  if (raw > 100) {
    return 100
  }
  return raw
})

const color = computed(() => {
  if (props.pendingSelection) {
    return '#f0ad4e'
  }
  return colors[props.status]
})

const backColor = computed(() => {
  if (props.status === TASK_STATUS.ERROR) {
    return '#FF6157'
  }
  if (props.pendingSelection) {
    return '#F6C46B'
  }
  return ''
})

function startTicker () {
  if (ticker.value) {
    return
  }
  ticker.value = setInterval(() => animateProgress(), 250)
}

function stopTicker () {
  if (ticker.value) {
    clearInterval(ticker.value)
    ticker.value = null
  }
}

function animateProgress () {
  if (!isActive.value) {
    if (props.status === TASK_STATUS.COMPLETE || props.status === TASK_STATUS.SEEDING || props.status === TASK_STATUS.MERGING) {
      displayPercent.value = 100
    } else {
      displayPercent.value = percent.value
    }
    return
  }
  const total = Number.isFinite(props.total) ? props.total : 0
  if (!(total > 0)) {
    if (currentSpeed.value > 0) {
      const min = 5
      const max = 15
      const step = 0.6
      let next = Number.isFinite(displayPercent.value) ? (displayPercent.value + step) : min
      if (next > max) {
        next = min
      }
      displayPercent.value = next
      lastIndeterminate.value = true
      return
    }
    lastIndeterminate.value = false
    const actual = percent.value
    if (!Number.isFinite(displayPercent.value) || actual > displayPercent.value) {
      displayPercent.value = actual
    }
    return
  }
  const actual = percent.value
  if (lastIndeterminate.value) {
    if (actual > displayPercent.value) {
      displayPercent.value = actual
    }
    lastIndeterminate.value = false
  }
  if (!(currentSpeed.value > 0 && baseTime.value > 0)) {
    if (!Number.isFinite(displayPercent.value) || actual > displayPercent.value) {
      displayPercent.value = actual
    }
    return
  }
  const now = Date.now()
  const elapsed = Math.max(0, now - baseTime.value) / 1000
  const estCompleted = baseCompleted.value + currentSpeed.value * elapsed
  const estClamped = Math.min(estCompleted, total)
  const estPercent = calcProgress(total, estClamped)
  let leadMax = 3
  if (actual >= 99) {
    leadMax = 0.2
  } else if (actual >= 95) {
    leadMax = 1
  }
  const target = Math.min(estPercent, actual + leadMax, 100)
  let next
  if (!Number.isFinite(displayPercent.value)) {
    next = target
  } else {
    const alpha = 0.4
    next = displayPercent.value + (target - displayPercent.value) * alpha
  }
  if (!Number.isFinite(next)) {
    next = actual
  }
  if (next >= displayPercent.value) {
    displayPercent.value = next
  }
}

watch(percent, (val) => {
  const p = Number.isFinite(val) ? val : 0
  if (!Number.isFinite(displayPercent.value)) {
    displayPercent.value = p
  } else if (!isActive.value) {
    displayPercent.value = p
  } else if (Math.abs(p - displayPercent.value) > 2) {
    if (p > displayPercent.value) {
      displayPercent.value = p
    }
  }
  baseCompleted.value = Number.isFinite(props.completed) ? props.completed : 0
  baseTime.value = Date.now()
}, { immediate: true })

watch(() => props.speed, (val) => {
  currentSpeed.value = Number.isFinite(val) ? val : 0
  if (currentSpeed.value > 0 && baseTime.value === 0) {
    baseCompleted.value = Number.isFinite(props.completed) ? props.completed : 0
    baseTime.value = Date.now()
  }
}, { immediate: true })

watch(() => props.status, (val) => {
  if (val === TASK_STATUS.COMPLETE || val === TASK_STATUS.SEEDING || val === TASK_STATUS.MERGING) {
    displayPercent.value = 100
  } else {
    displayPercent.value = percent.value
  }
})

watch(isActive, (val) => {
  if (val) {
    startTicker()
  } else {
    stopTicker()
  }
})

onMounted(() => {
  if (isActive.value) {
    startTicker()
  }
})

onBeforeUnmount(() => {
  stopTicker()
})
</script>
