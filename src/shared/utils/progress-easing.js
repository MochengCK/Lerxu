/**
 * 进度条动画：**唯一实现**（任务卡片 `TaskProgress.vue` 与独立任务进度窗口
 * `utils/progressWindowHtml.js` 共用）。
 *
 * 为什么要共用：这两处画的是同一条进度条，但它们是两个完全独立的渲染环境
 * （一个是 Vue 组件、一个是用字符串拼出来的 HTML 窗口），一旦各自写一套动画，
 * 就会出现"主列表里平滑前进、独立窗口里一跳一跳"这种同一任务两种手感的问题。
 * 参数与算法放在这里，两边只保留各自的"取数"与"画到哪根 DOM"部分。
 *
 * 动画由两层组成，缺一不可：
 *   ① JS 侧 **250ms 定时器**（`PROGRESS_TICK_MS`）：显示值每 tick 往目标推进
 *      `PROGRESS_EASE_ALPHA`（40%），目标 = min(按速度外推的估计进度,
 *      实际进度 + leadMax, 100)。`leadMax` 让条子**略微领先**真实进度
 *      （接近满格时收窄到 1 / 0.2，避免最后一段"爬"得很难看）。
 *   ② CSS 侧 `width .4s cubic-bezier(.08,.82,.17,1)`（`PROGRESS_BAR_CSS_TRANSITION`）：
 *      把 250ms 之间的每一步再抹平一次。
 */

/** 内条宽度过渡（与 Theme/Default.scss 的 `.el-progress-bar__inner` 保持一致） */
export const PROGRESS_BAR_CSS_TRANSITION = 'width .4s cubic-bezier(0.08,0.82,0.17,1)'

/** 动画定时器周期（ms） */
export const PROGRESS_TICK_MS = 250

/** 每个 tick 向目标推进的比例（0~1，越小越"黏"） */
export const PROGRESS_EASE_ALPHA = 0.4

/** 允许显示值领先真实进度的百分点 */
export const PROGRESS_LEAD_MAX = 3
export const PROGRESS_LEAD_NEAR_DONE = 1
export const PROGRESS_LEAD_ALMOST_DONE = 0.2
export const PROGRESS_NEAR_DONE_AT = 95
export const PROGRESS_ALMOST_DONE_AT = 99

/** 允许显示值回退的阈值（百分点）：超过它才真的往回走 */
export const PROGRESS_BACKWARD_TOLERANCE = 5

/** 总长未知（磁力取元数据、HLS 取播放列表……）时的往复区间 */
export const PROGRESS_INDETERMINATE_MIN = 5
export const PROGRESS_INDETERMINATE_MAX = 15
export const PROGRESS_INDETERMINATE_STEP = 0.6

/**
 * 当前实际进度对应的"最大领先"百分点。
 * @param {number} actual 真实进度（0~100）
 */
export function leadMaxFor (actual) {
  const a = Number(actual)
  if (!Number.isFinite(a)) {
    return PROGRESS_LEAD_MAX
  }
  if (a >= PROGRESS_ALMOST_DONE_AT) {
    return PROGRESS_LEAD_ALMOST_DONE
  }
  if (a >= PROGRESS_NEAR_DONE_AT) {
    return PROGRESS_LEAD_NEAR_DONE
  }
  return PROGRESS_LEAD_MAX
}

/**
 * 把显示值往目标推进一格（只前进不后退）。
 * @param {number} displayed 当前显示值
 * @param {number} target 本 tick 的目标值
 * @returns {number} 新的显示值
 */
export function easeToward (displayed, target) {
  const d = Number(displayed)
  const t = Number(target)
  if (!Number.isFinite(d)) {
    return Number.isFinite(t) ? t : 0
  }
  if (!Number.isFinite(t)) {
    return d
  }
  const next = d + (t - d) * PROGRESS_EASE_ALPHA
  // 只前进：目标（估计值）短暂回落时不许把条子往回拽
  return next >= d ? next : d
}

/**
 * 施加一次"真实上报值"：允许直接跳到更大的值；回退超过容差才接受
 * （引擎分片校验失败重下、统计口径抖动都会让上报值短暂回落 1~3 个点）。
 * @returns {number} 新的显示值
 */
export function applyReportedPercent (displayed, reported, force = false) {
  const d = Number(displayed)
  const r = Number(reported)
  const value = Number.isFinite(r) ? r : 0
  if (force || !Number.isFinite(d)) {
    return value
  }
  if (value > d || d - value > PROGRESS_BACKWARD_TOLERANCE) {
    return value
  }
  return d
}

/** 下一格往复占位（总长未知时） */
export function nextIndeterminatePercent (current) {
  const c = Number.isFinite(Number(current)) ? Number(current) : PROGRESS_INDETERMINATE_MIN
  const next = c + PROGRESS_INDETERMINATE_STEP
  return next > PROGRESS_INDETERMINATE_MAX ? PROGRESS_INDETERMINATE_MIN : next
}
