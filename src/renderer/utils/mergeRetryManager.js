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

export function clearAllMergeRetryTimers () {
  timers.forEach((timer) => {
    clearTimeout(timer)
  })
  timers.clear()
}
