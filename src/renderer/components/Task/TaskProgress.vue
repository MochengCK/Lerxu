<template>
  <el-progress
    :percentage="displayPercent"
    :show-text="false"
    :status="isActive ? 'success' : undefined"
    :color="color"
    :class="{ 'is-pending-selection': pendingSelection, 'is-fetching-metadata': fetchingMetadata }">
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
  },
  // 磁力任务在元数据就绪前没有任何进度可展示（total 恒为 0）。
  // 置位时进度条改由 CSS 扫描动效表示"正在获取元数据"。
  fetchingMetadata: {
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
    // 元数据未就绪的磁力任务：进度恒为 0，动效交给 .is-fetching-metadata
    // 的 CSS 扫光（避免与 5%~15% 往复叠加，也避开回跳那一下的生硬感）
    if (props.fetchingMetadata) {
      lastIndeterminate.value = false
      displayPercent.value = 0
      return
    }
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

<style lang="scss">
/* 待选择文件的任务进度恒为 0，内条宽度按 percentage% 计算因此不可见，
   仅靠 color 无法体现状态，需要把底槽一并染色 */
.el-progress.is-pending-selection {
  .el-progress-bar__outer {
    background-color: #F6C46B;
  }
}

/* 待选择（橙）↔ 暂停（灰）↔ 普通（主题底槽色）之间切换时走过渡，
   避免颜色瞬间跳变；内条颜色的过渡由 Theme/Default.scss 的
   .el-progress-bar__inner { transition: all .4s } 负责 */
.el-progress .el-progress-bar__outer {
  transition: background-color 0.35s ease;
}

/* 深色主题同样使用 100% 不透明度的橙色，保证待选择文件状态清晰可辨 */
.theme-dark .el-progress.is-pending-selection .el-progress-bar__outer {
  background-color: #F0AD4E;
}

/* 磁力任务元数据未就绪（任务名还是临时的/"获取任务名中..."）：进度条
   内条宽度为 0，没有任何进度可展示。在底槽上扫过一道高光表示"正在获取
   元数据"，比让进度数字在 5%~15% 之间往复更平顺、也更有"在动"的感知。 */
.el-progress.is-fetching-metadata {
  .el-progress-bar__outer {
    position: relative;
    overflow: hidden;
  }

  .el-progress-bar__outer::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    /* 用"下载中"的状态色（#5b5bea）做高光：白色在浅灰底槽上几乎看不出来，
       靛蓝与 eventual 进度条同色，明暗主题下都清晰可辨 */
    background: linear-gradient(
      90deg,
      rgba(91, 91, 234, 0) 0%,
      rgba(91, 91, 234, 0.6) 50%,
      rgba(91, 91, 234, 0) 100%
    );
    transform: translateX(-100%);
    animation: lc-progress-metadata-sweep 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
}

/* 深色底槽（#363b44）上需要更高强度才能与浅色主题观感一致 */
.theme-dark .el-progress.is-fetching-metadata .el-progress-bar__outer::after {
  background: linear-gradient(
    90deg,
    rgba(91, 91, 234, 0) 0%,
    rgba(112, 112, 240, 0.85) 50%,
    rgba(91, 91, 234, 0) 100%
  );
}

@keyframes lc-progress-metadata-sweep {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(100%);
  }
}
</style>
