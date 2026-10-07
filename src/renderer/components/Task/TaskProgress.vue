<template>
  <!-- 「一对音视频」：底条 + 合并进度覆盖层。
       整条生命周期（下载中 → 待合并 → 合并中 → 已合并）都用**同一组元素**：
       下载时底条就是普通进度条（蓝），两个文件都下完转成满格黄底，合并进度
       用绿色从左往右覆盖，合并完转成满格绿底。
       这样每次变化都只是**颜色/宽度的 CSS 过渡**，不会出现"下载条瞬间被换成
       一根满格黄条"或"合并完瞬间换成另一根条"的跳变。 -->
  <div
    v-if="isPairRow"
    class="lc-pair-progress"
    :class="{ 'is-merge-overlay': progressView.mode === 'pair-merge' }">
    <el-progress
      class="lc-pair-progress__base"
      :class="{ 'is-dimmed': isCoverShowing }"
      :percentage="basePercent"
      :show-text="false"
      :stroke-width="6"
      :color="color">
    </el-progress>
    <el-progress
      class="lc-pair-progress__cover"
      :percentage="progressView.coverPercent"
      :show-text="false"
      :stroke-width="6"
      :color="pairMergeColor">
    </el-progress>
  </div>
  <el-progress
    v-else
    :percentage="displayPercent"
    :show-text="false"
    :status="isActive ? 'success' : undefined"
    :color="color"
    :class="{
      'is-pending-selection': pendingSelection,
      'is-fetching-metadata': fetchingMetadata,
      'is-live': isLiveTask,
      'is-rec-running': livePhase === 'running',
      'is-rec-stopped': livePhase === 'stopped' || livePhase === 'error',
      'is-rec-done': livePhase === 'done'
    }">
  </el-progress>
</template>

<script setup>
defineOptions({ name: 'mo-task-progress' }) // 供父组件 [X.name]: X 注册
import { ref, computed, watch, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'
import { storeToRefs } from 'pinia'
import { TASK_STATUS } from '@shared/constants'
import { calcProgress } from '@shared/utils'
import {
  PROGRESS_TICK_MS,
  applyReportedPercent,
  easeToward,
  leadMaxFor,
  nextIndeterminatePercent
} from '@shared/utils/progress-easing'
import { resolveProgressView } from '@/utils/taskPair'
import { useTaskStore } from '@/store/task'
import colors from '@shared/colors'

const props = defineProps({
  total: {
    type: Number
  },
  completed: {
    type: Number
  },
  // 任务 gid：合并进度按它从 store 里取（合并期间进度条要走**合并**的百分比）
  gid: {
    type: String,
    default: ''
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
  // 磁力任务在元数据就绪前、以及任何"已经开始但一个字节都没到"的任务
  // （HLS 取播放列表等）都没有任何进度可展示（total 可能为 0，也可能已有
  // 估算值而 completed 仍为 0）。置位时进度条改由 CSS 扫描动效表示"在动"。
  fetchingMetadata: {
    type: Boolean,
    default: false
  },
  // 直播任务（引擎 isLive 置位后恒真）：没有"总长"这个分母，进度条不画百分比，
  // 按 livePhase（录制中 / 停住 / 完成）走**录制专属**三态视觉——
  // 录制中 = 柔光带循环流动，暂停/失败 = 减速停住并变灰，完成 = 光带淡出、绿色铺满。
  // 它优先于 fetchingMetadata（录制已开始，只是首段还没到）。
  isLive: {
    type: Boolean,
    default: false
  },
  // 「一对音视频」折叠成的记录：背后是一条记录、**两个引擎任务**。
  // 合并进度挂在"后下完的那条"的 gid 上，所以要在全部成员里找。
  pairGids: {
    type: Array,
    default: () => []
  },
  // 这条记录背后还剩几条流（两条 = 合并还没发生，一条 = 已经合并完）
  pairMemberCount: {
    type: Number,
    default: 0
  },
  // 这条记录是不是"一对音视频"（isPair / pairId 存在）—— 用记录级标记，
  // 不再靠"成员还剩几条"推断（成员一下完就会被分片规则摘掉，判据会失效）
  isPair: {
    type: Boolean,
    default: false
  },
  // 已经合并出产物（记录的 dashMerged，由 afterBilibiliMerge 落库）：
  // 此时进度条回到普通满格绿，不再走黄/绿两层
  merged: {
    type: Boolean,
    default: false
  },
  // 已确定不会再合并（重试耗尽 / 缺另一半 / 合并失败收尾）：同样回普通档。
  // 没有它，"只有一条流、永远等不到另一半"的记录会一直挂在黄条上。
  mergeSkipped: {
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

// 动画参数与算法在 @shared/utils/progress-easing（**唯一实现**）：独立任务进度
// 窗口用的是同一套，两端手感必须一致，不要在这里另写一份。
//   · applyReportedPercent —— 只增不减，仅当回退超过阈值时才接受（引擎分片
//     校验失败重下、统计口径抖动、状态在 active/waiting/seeding 之间切换都会
//     让上报进度短暂回落 1~3 个点，直接跟随会让进度条肉眼可见地"倒退"）；
//   · easeToward / leadMaxFor —— 每 250ms 往"估计进度（最多领先 3 个点）"推进 40%。
function applyPercent (value, force = false) {
  displayPercent.value = applyReportedPercent(displayPercent.value, Number.isFinite(value) ? value : 0, force)
}

const isActive = computed(() => props.status === TASK_STATUS.ACTIVE)

// 组件实例（recApply 往根元素上写 --lc-rec-phase 用）
const instance = getCurrentInstance()

/** 这条任务是不是直播录制（引擎 `isLive` 置位后恒为 true）。 */
const isLiveTask = computed(() => props.isLive === true)

/**
 * 直播任务的呈现相位：
 * - `running`：录制中（引擎在跑；waiting 只是"重新排队的瞬时态"，同样按录制中对待）
 * - `stopped`：停住（暂停）——条纹减速停住并变灰
 * - `done`：完成——条纹淡出、绿色内条铺满（与普通任务完成同色，全程无百分比推进）
 * - `error`：失败——同"停住"，文案由卡片信息行负责说明
 * - 其余（如 removed）：不走录制视觉
 */
const livePhase = computed(() => {
  if (!isLiveTask.value) {
    return null
  }
  const s = `${props.status || ''}`
  if (s === TASK_STATUS.ACTIVE || s === TASK_STATUS.WAITING) return 'running'
  if (s === TASK_STATUS.PAUSED) return 'stopped'
  if (s === TASK_STATUS.COMPLETE || s === TASK_STATUS.SEEDING) return 'done'
  if (s === TASK_STATUS.ERROR) return 'error'
  return null
})

const taskStore = useTaskStore()
const { mergeProgresses } = storeToRefs(taskStore)

// 「一对音视频」记录的两层颜色：底条黄（主题里"合并"那一档）、
// 合并进度绿（与"完成"同色 —— 盖满就是完成）
const pairBaseColor = colors.merging
const pairMergeColor = colors.complete

// 直播录制中的红（与卡片信息行的录制图标同色，浅色主题用 --lc-color-danger 的近似值）
const REC_LIVE_COLOR = '#f56c6c'

/** 这条记录背后可能的全部引擎任务 gid（记录自身 + 配对成员，去重）。 */
const gidCandidates = computed(() => {
  const out = []
  const push = (gid) => {
    const g = `${gid || ''}`
    if (g && !out.includes(g)) {
      out.push(g)
    }
  }
  push(props.gid)
  ;(Array.isArray(props.pairGids) ? props.pairGids : []).forEach(push)
  return out
})

/**
 * 这条记录是不是「一对音视频」—— 用**记录级**标记（isPair / 还有两条流），
 * 不靠"引擎里还能查到几条成员"推断（成员一下完就会被清理）。
 *
 * 决定进度条用哪套模板：配对记录从下载到合并完成**始终**用底条+覆盖层这一组
 * 元素，颜色与宽度只在同一根条上过渡，避免换元素造成的瞬时跳变。
 */
const isPairRow = computed(() => props.isPair === true || props.pairMemberCount > 1)

/**
 * 引擎上报的合并进度（0~100）；没有可用的上报时返回 -1。
 *
 * 为什么合并期间要用它：下载阶段结束了，`completedLength/totalLength` 恒等于 100%，
 * 底条会一直满格不动 —— 合并本身是有进度的（引擎按"已写字节 / 输入总字节"实时
 * 上报），把它画成绿色覆盖层才是用户要的"实时进度"。
 *
 * 为什么要**遍历成员**：合并是"后下完的那条流"的完成事件触发的，进度行挂在
 * 它的 gid 上，未必是这条记录的主 gid（画面流）。
 */
const mergePercent = computed(() => {
  if (`${props.status || ''}` !== TASK_STATUS.MERGING) {
    return -1
  }
  const map = mergeProgresses.value || {}
  for (const gid of gidCandidates.value) {
    const p = map[gid]
    if (!p || p.waitingForPair) {
      continue
    }
    const v = Number(p.percent)
    if (Number.isFinite(v)) {
      return Math.max(0, Math.min(100, v))
    }
  }
  return -1
})

/**
 * 进度条走哪一档 —— 判据全在 `@/utils/taskPair` 的 `resolveProgressView`（唯一实现）：
 * 普通进度 / 满格黄条（下载完成、待合并）/ 黄底 + 绿色覆盖层（正在合并）。
 */
const progressView = computed(() => resolveProgressView({
  isPair: props.isPair === true || props.pairMemberCount > 1,
  merged: props.merged === true,
  mergeSkipped: props.mergeSkipped === true,
  status: props.status,
  total: props.total,
  completed: props.completed,
  mergePercent: mergePercent.value
}))

/**
 * 底条宽度：下载阶段沿用组件自己的缓动值（`displayPercent`），这样
 * 「下载 → 待合并」的满格黄条是从当前显示值**过渡**到 100%，而不是换一根
 * 元素直接出现在 100%。
 */
const basePercent = computed(() => (
  progressView.value.mode === 'plain' ? displayPercent.value : progressView.value.basePercent
))

/**
 * 绿色覆盖层出现后把黄底调淡：满不透明的黄和绿叠在一起，绿色反而读不出来。
 * 没有合并进度时（下载刚完成、还没开始合）黄底保持 100% 不透明。
 */
const isCoverShowing = computed(() => progressView.value.coverPercent > 0)

const percent = computed(() => {
  // 直播非完成态没有百分比可言（呈现由录制视觉承担，见 recTick 与 .is-live）
  if (isLiveTask.value && livePhase.value && livePhase.value !== 'done') {
    return 0
  }
  if (props.status === TASK_STATUS.MERGING) {
    // 有合并进度就跟着走；没有（还没开始合 / 在等另一半）就保持满格
    return mergePercent.value >= 0 ? mergePercent.value : 100
  }
  const raw = calcProgress(props.total, props.completed)
  if (props.status === TASK_STATUS.COMPLETE || props.status === TASK_STATUS.SEEDING) {
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
  // 直播非完成态：录制中保持红系，停住（暂停/失败）随状态色（灰 / 红）。
  // 内条此刻宽度为 0（不可见），颜色只为过渡瞬间与完成前后的衔接服务。
  if (isLiveTask.value && livePhase.value && livePhase.value !== 'done') {
    return livePhase.value === 'running' ? REC_LIVE_COLOR : (colors[props.status] || colors.paused)
  }
  // 一对音视频：两个文件都下完 → 黄（可以合并了 / 正在合并）
  if (progressView.value.mode !== 'plain') {
    return pairBaseColor
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
  ticker.value = setInterval(() => animateProgress(), PROGRESS_TICK_MS)
}

function stopTicker () {
  if (ticker.value) {
    clearInterval(ticker.value)
    ticker.value = null
  }
}

function animateProgress () {
  if (!isActive.value) {
    if (props.status === TASK_STATUS.COMPLETE || props.status === TASK_STATUS.SEEDING) {
      displayPercent.value = 100
    } else if (props.status === TASK_STATUS.MERGING) {
      // 合并期间进度属于合并：引擎在实时上报就直接跟它走
      displayPercent.value = mergePercent.value >= 0 ? mergePercent.value : 100
    } else {
      applyPercent(percent.value)
    }
    return
  }
  const total = Number.isFinite(props.total) ? props.total : 0
  // 直播任务非完成态：没有"总长"分母、也没有"剩余时间"——内条宽度保持 0，
  // 动效完全交给录制斜纹（相位由 recTick 逐帧推进；与"正在获取数据"的扫光、
  // 与真实下载进度都区分开）。**这一支必须在下面所有判断之前**。
  if (isLiveTask.value && livePhase.value && livePhase.value !== 'done') {
    lastIndeterminate.value = false
    displayPercent.value = 0
    return
  }
  // 还没有任何可展示的进度（磁力取元数据 / HLS 取播放列表等）：内条保持 0 宽，
  // 动效完全交给 .is-fetching-metadata 的 CSS 扫光（避免与 5%~15% 往复叠加，
  // 也避开回跳那一下的生硬感）。**这一支必须在 total 判断之前**：HLS 的总长是
  // 随分片落地实时估算出来的，早期可能已经有 total 而 completed 仍是 0，
  // 那种情况下若走百分比分支，看到的还是一根空条。
  if (props.fetchingMetadata) {
    lastIndeterminate.value = false
    displayPercent.value = 0
    return
  }
  if (!(total > 0)) {
    if (currentSpeed.value > 0) {
      // 总长未知但有速度：5%~15% 往复，表示"在动"（磁力取元数据 / HLS 取播放列表）
      displayPercent.value = nextIndeterminatePercent(displayPercent.value)
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
  const target = Math.min(estPercent, actual + leadMaxFor(actual), 100)
  displayPercent.value = easeToward(displayPercent.value, Number.isFinite(target) ? target : actual)
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

// ---------------------------------------------------------------------------
// 直播录制：光带相位由 JS（rAF）驱动 —— "暂停→逐渐停 / 恢复→逐渐动"需要的是
// **速度的渐变**，CSS 的 animation-play-state 只会瞬间冻结/瞬间启动，
// 做不到这个手感。速度用指数趋近（时间常数 ~0.16s，约 0.6~1s 内到位），
// 相位取模 REC_ROLL_PERIOD（= 平铺渐变沿 x 轴的周期，循环因此无缝）。
// ---------------------------------------------------------------------------
const REC_ROLL_PERIOD = 160 // px：光带平铺周期（必须与 CSS background-size 一致）
const REC_ROLL_SPEED = 72 // px/s：约 2.2s 走完一个周期
let recRaf = null
let recLastT = 0
let recSpeed = 0
let recPhase = 0

function recTargetSpeed () {
  if (isDocumentHidden()) return 0
  return livePhase.value === 'running' ? REC_ROLL_SPEED : 0
}

function recApply () {
  const el = instance?.proxy?.$el
  if (el && el.style && typeof el.style.setProperty === 'function') {
    el.style.setProperty('--lc-rec-phase', `${recPhase.toFixed(2)}px`)
  }
}

function recTick (t) {
  recRaf = null
  const dt = recLastT ? Math.min(0.05, (t - recLastT) / 1000) : 0
  recLastT = t
  const target = recTargetSpeed()
  const k = 1 - Math.exp(-dt / 0.16)
  recSpeed += (target - recSpeed) * k
  if (Math.abs(recSpeed - target) < 0.05) recSpeed = target
  recPhase = (recPhase + recSpeed * dt) % REC_ROLL_PERIOD
  recApply()
  if (recSpeed > 0 || recTargetSpeed() > 0) {
    recScheduleRec()
  }
}

function recScheduleRec () {
  // ⚠️ 不要在这里重置 recLastT：recTick 每帧末尾都会回来调度下一帧，
  //    每帧清一次会让 dt 恒为 0、速度永远涨不上去（相位不动）。
  if (recRaf == null && !isDocumentHidden() && typeof requestAnimationFrame === 'function') {
    recRaf = requestAnimationFrame(recTick)
  }
}

function recStop () {
  if (recRaf != null) {
    cancelAnimationFrame(recRaf)
    recRaf = null
  }
}

// 相位变化：录制中（立即）启动/保持循环；停住/完成则**不立即停** ——
// 让目标速度变 0，循环自己带减速跑到停止（"逐渐停止"）。
watch(livePhase, (val) => {
  if (!val) return
  recApply()
  if (val === 'running' || recSpeed > 0) {
    recScheduleRec()
  }
}, { immediate: true })

watch(() => props.status, (val) => {
  if (val === TASK_STATUS.COMPLETE || val === TASK_STATUS.SEEDING) {
    displayPercent.value = 100
  } else if (val === TASK_STATUS.MERGING) {
    // 合并有真实进度（引擎在上报），不能一律钉在 100%
    displayPercent.value = mergePercent.value >= 0 ? mergePercent.value : 100
  } else {
    // 不再无条件回落到真实进度：做种/下载状态来回切换时
    // （完种后校验失败重新下载等）会把进度条从 100% 拽回来
    applyPercent(percent.value)
  }
})

function handleVisibilityChange () {
  if (isDocumentHidden()) {
    stopTicker()
    recStop()
  } else {
    if (isActive.value) {
      startTicker()
      // 立即补一次动画，避免恢复可见瞬间停留在隐藏前的旧进度
      animateProgress()
    }
    if (isLiveTask.value && recTargetSpeed() > 0) {
      recScheduleRec()
    }
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
  // 挂载前 immediate 的 recApply 还拿不到根元素（暂停中的录制任务不会自起
  // rAF，相位变量只能在这里补上）
  if (livePhase.value) {
    recApply()
  }
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onBeforeUnmount(() => {
  stopTicker()
  recStop()
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

/* 「一对音视频」的合并记录：黄底（下载完成，保留为背景）+ 绿色合并进度盖上去。
   两层都用 el-progress 本体，只把覆盖层的轨道调透明 —— 这样圆角、内条过渡、
   深色主题的底槽色都与普通进度条完全一致，不用另造一套几何。 */
.lc-pair-progress {
  position: relative;

  .lc-pair-progress__cover {
    position: absolute;
    inset: 0;

    .el-progress-bar__outer {
      background-color: transparent;
    }
  }

  /* 绿色一出现就把黄底调淡：满不透明的黄会压住绿色，读不出合并进度。
     内条本来就有 transition: all .4s（Theme/Default.scss），透明度变化自带过渡 */
  .lc-pair-progress__base.is-dimmed .el-progress-bar__inner {
    opacity: 0.4;
  }
}

/* 深色主题同样使用 100% 不透明度的橙色，保证待选择文件状态清晰可辨 */
.theme-dark .el-progress.is-pending-selection .el-progress-bar__outer {
  background-color: #F0AD4E;
}

/* 还没有任何进度可展示时（磁力取元数据、HLS 取播放列表……）：进度条
   内条宽度为 0。在底槽上扫过一道高光表示"正在获取数据"，比让进度数字在
   5%~15% 之间往复更平顺、也更有"在动"的感知。 */
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

/* 直播三态：录制中 = 红系**柔光带从左向右循环流动**（相位由 JS 逐帧推进，
   见 recTick）；暂停/失败 = 光带减速停住并交叉淡化到"暂停灰"；完成 = 光带淡出、
   绿色内条铺满。

   光带用**固定像素周期的平铺渐变**（周期 160px = REC_ROLL_PERIOD，与 JS 相位
   取模一致 → 循环无缝）。渐变两端**完全透明**，所以被轨道左右边缘裁切时，边缘处
   的取值随时间**连续**变化 —— 不像高频斜纹那样每帧闪出"断面"（这正是上一版要靠
   mask / 底色同化去补的坑，换成低频光带后机制上就不存在了）。 */
.el-progress.is-live {
  .el-progress-bar__outer {
    position: relative;
    overflow: hidden;
    /* 录制态底槽：淡红底，静下来也能一眼认出"这是条录制任务" */
    background-color: rgba(245, 108, 108, 0.16);
    transition: background-color 0.45s ease;
  }

  .el-progress-bar__outer::before,
  .el-progress-bar__outer::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background-repeat: repeat-x;
    background-size: 160px 100%;
    background-position: var(--lc-rec-phase, 0px) 0;
    transition: opacity 0.45s ease;
    pointer-events: none;
  }

  /* 流动的红色光带：透明 → 柔光 → 亮芯 → 柔光 → 透明（两端归零，循环无缝） */
  .el-progress-bar__outer::before {
    background-image: linear-gradient(90deg,
      rgba(245, 108, 108, 0) 0px,
      rgba(245, 108, 108, 0.12) 34px,
      rgba(245, 108, 108, 0.66) 80px,
      rgba(245, 108, 108, 0.12) 126px,
      rgba(245, 108, 108, 0) 160px);
    opacity: 1;
  }

  /* 停住的光带（灰）：录制层原地交叉淡化到它 —— 与暂停色（#737373）同族 */
  .el-progress-bar__outer::after {
    background-image: linear-gradient(90deg,
      rgba(115, 115, 115, 0) 0px,
      rgba(115, 115, 115, 0.12) 34px,
      rgba(115, 115, 115, 0.6) 80px,
      rgba(115, 115, 115, 0.12) 126px,
      rgba(115, 115, 115, 0) 160px);
    opacity: 0;
  }

  &.is-rec-stopped .el-progress-bar__outer {
    background-color: rgba(115, 115, 115, 0.14);
  }

  &.is-rec-stopped .el-progress-bar__outer::before {
    opacity: 0;
  }

  &.is-rec-stopped .el-progress-bar__outer::after {
    opacity: 1;
  }

  /* 完成：光带全部淡出，绿色内条（el-progress 的 percentage=100）铺满 */
  &.is-rec-done .el-progress-bar__outer {
    background-color: transparent;
  }

  &.is-rec-done .el-progress-bar__outer::before,
  &.is-rec-done .el-progress-bar__outer::after {
    opacity: 0;
  }
}

/* ⚠️ 下面这两条必须**比上面的暗色基础规则多一个类**（`.is-rec-stopped` /
   `.is-rec-done`）：暗色基础红底 `.theme-dark .el-progress.is-live …` 与浅色
   三态的 `.el-progress.is-live.is-rec-stopped …` **权重相同**（都是 4 个类），
   而暗色块在文件里更靠后 —— 同权重下后者胜出，红底会压掉灰底，表现就是
   "暂停后底色仍然是红的"。多带一个类（5 个类）才能稳定覆盖。
   浅色主题没有这个问题（红底只有 3 个类，三态规则本就更高）。 */
.theme-dark .el-progress.is-live.is-rec-stopped .el-progress-bar__outer {
  background-color: rgba(160, 160, 160, 0.16);
}

.theme-dark .el-progress.is-live.is-rec-done .el-progress-bar__outer {
  background-color: transparent;
}

/* 深色底槽（#363b44）上提亮一档，与浅色主题观感一致 */
.theme-dark .el-progress.is-live .el-progress-bar__outer {
  background-color: rgba(255, 97, 87, 0.2);
}

.theme-dark .el-progress.is-live .el-progress-bar__outer::before {
  background-image: linear-gradient(90deg,
    rgba(255, 119, 110, 0) 0px,
    rgba(255, 119, 110, 0.14) 34px,
    rgba(255, 119, 110, 0.74) 80px,
    rgba(255, 119, 110, 0.14) 126px,
    rgba(255, 119, 110, 0) 160px);
}

.theme-dark .el-progress.is-live .el-progress-bar__outer::after {
  background-image: linear-gradient(90deg,
    rgba(170, 170, 170, 0) 0px,
    rgba(170, 170, 170, 0.12) 34px,
    rgba(170, 170, 170, 0.66) 80px,
    rgba(170, 170, 170, 0.12) 126px,
    rgba(170, 170, 170, 0) 160px);
}
</style>
