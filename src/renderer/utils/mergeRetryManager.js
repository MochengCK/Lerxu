/**
 * Merge retry timer manager.
 *
 * Extracted from EngineClient.vue to allow cross-component access
 * without using Vue 2's $children. Any component can import and use
 * these functions directly.
 */
const timers = new Map()

export function setMergeRetryTimer (gid, timer) {
  timers.set(gid, timer)
}

export function clearMergeRetryTimer (gid) {
  const timer = timers.get(gid)
  if (timer) {
    clearTimeout(timer)
    timers.delete(gid)
  }
}

/** 这个 gid 当前有没有 armed 着的合并重试（补扫逻辑靠它避免重复武装） */
export function hasMergeRetryTimer (gid) {
  return timers.has(`${gid || ''}`)
}

export function clearAllMergeRetryTimers () {
  timers.forEach((timer) => {
    clearTimeout(timer)
  })
  timers.clear()
}
