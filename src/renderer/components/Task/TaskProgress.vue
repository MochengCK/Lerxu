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

// 同一任务内允许进度条回退的阈值（百分点）：引擎分片校验失败重下、
// 统计口径抖动、状态在 active/waiting/seeding 之间切换，都会让上报进度
// 短暂回落 1~3 个点，直接跟随会让进度条肉眼可见地"倒退"。
// 只有超过该阈值的回落（重新选择文件、任务重新开始等真实变化）才回退。
const BACKWARD_TOLERANCE = 5

// 应用真实进度：默认只增不减，仅当回退幅度超过阈值时才接受
function applyPercent (value, force = false) {
  const p = Number.isFinite(value) ? value : 0
  if (force || !Number.isFinite(displayPercent.value)) {
    displayPercent.value = p
    return
  }
  if (p > displayPercent.value || displayPercent.value - p > BACKWARD_TOLERANCE) {
    displayPercent.value = p
  }
}

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

function isDocumentHidden () {
  return typeof document !== 'undefined' && !!document.hidden
}

function startTicker () {
  // 页面不可见（最小化/切后台）时进度条无人观看：不启动 250ms 动画，
  // 避免每个活跃任务每秒 4 次空转触发 el-progress 重渲染
  if (ticker.value || isDocumentHidden()) {
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
      applyPercent(percent.value)
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
    // 暂停/等待态同样不允许小幅回退：状态在 active ↔ waiting 之间
    // 切换时会带着仍处于预估领先的显示值一起回落，看起来就是进度条倒退
    applyPercent(p)
  } else if (Math.abs(p - displayPercent.value) > 2) {
    applyPercent(p)
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
    // 不再无条件回落到真实进度：做种/下载状态来回切换时
    // （完种后校验失败重新下载等）会把进度条从 100% 拽回来
    applyPercent(percent.value)
  }
})

function handleVisibilityChange () {
  if (isDocumentHidden()) {
    stopTicker()
  } else if (isActive.value) {
    startTicker()
    // 立即补一次动画，避免恢复可见瞬间停留在隐藏前的旧进度
    animateProgress()
  }
}

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
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onBeforeUnmount(() => {
  stopTicker()
  if (typeof document !== 'undefined' && document && typeof document.removeEventListener === 'function') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
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
    /* 用"下载中"的状态色（#1a7fe0）做高光：白色在浅灰底槽上几乎看不出来，
       蓝色与最终进度条同色，明暗主题下都清晰可辨 */
    background: linear-gradient(
      90deg,
      rgba(26, 127, 224, 0) 0%,
      rgba(26, 127, 224, 0.6) 50%,
      rgba(26, 127, 224, 0) 100%
    );
    transform: translateX(-100%);
    animation: lc-progress-metadata-sweep 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
}

/* 深色底槽（#363b44）上需要更高强度才能与浅色主题观感一致 */
.theme-dark .el-progress.is-fetching-metadata .el-progress-bar__outer::after {
  background: linear-gradient(
    90deg,
    rgba(74, 158, 255, 0) 0%,
    rgba(74, 158, 255, 0.85) 50%,
    rgba(74, 158, 255, 0) 100%
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
