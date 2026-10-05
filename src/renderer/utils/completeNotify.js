/**
 * 下载完成通知的**去重**（唯一实现）。
 *
 * 为什么需要：一条下载可能走到**多条**"完成"路径上，每条路径过去都各自弹一次：
 *   · 最后一条流完成 → 合并成功 → 通知（`mergeResult.mergedPath` 那一支）；
 *   · 另一半的重试定时器醒来 → 也在同一个合并产物上通知（`_scheduleMergeRetry`）；
 *   · 重试耗尽、凑不齐 → 按"下载完成"如实收尾，又通知一次；
 *   · 缺媒体引擎时的降级完成，再通知一次。
 * 用户看到的就是"一个视频下载完成弹了三条下载完成通知"（2026-10-02 实测复现：
 * 一条 309MB 的配对记录弹了 2 次；用户侧 3 次）。
 *
 * 判据用**下载的身份**而不是"哪条路径"：
 *   · 一对音视频 → `pair:<pairId>`：整对只通知一次（合并前后都算同一次下载）；
 *   · 其余任务 → `gid:<gid>`：一个任务一次。
 *
 * 不拿文件路径当键：同一个文件被重新下载（新 gid）时，路径相同但**是另一次下载**，
 * 必须照常通知。
 */
export const COMPLETE_NOTIFY_TTL_MS = 10 * 60 * 1000
export const COMPLETE_NOTIFY_MAX_KEYS = 500

/**
 * 这条下载的身份键；取不到身份时返回空串（调用方应放行，不能吞掉通知）。
 *
 * ⚠️ `source` 可以是任务对象，也可以是调用方**自己拼的身份**
 * （`{ pairId, gid }`）—— 因为**引擎任务对象上没有 `pairId`**：配对信息只存在
 * 任务历史里（`getTaskPairInfo` 就是去历史里查的）。只按任务对象取键，一对
 * 音视频的两条流会各自落到 `gid:<自己的 gid>` 上 → 又是两次通知（实测）。
 */
export function completeNotifyKey (source, path) {
  const pairId = source && (source.pairId || (source.pair && source.pair.id))
  if (pairId) {
    return `pair:${pairId}`
  }
  const gid = source && source.gid ? `${source.gid}` : ''
  if (gid) {
    return `gid:${gid}`
  }
  const p = path ? `${path}` : ''
  return p ? `path:${p}` : ''
}

/**
 * 建一个去重器：`shouldNotify(task, path, now?)` 返回 true 表示"这一次该弹"。
 *
 * @param {Object} [options]
 * @param {number} [options.ttlMs] 同一个身份在多长时间内只算一次
 * @param {number} [options.maxKeys] 键上限（超了就 prune 掉过期的）
 */
export function createCompleteNotifier (options = {}) {
  const ttl = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : COMPLETE_NOTIFY_TTL_MS
  const max = Number(options.maxKeys) > 0 ? Number(options.maxKeys) : COMPLETE_NOTIFY_MAX_KEYS
  const seen = new Map()

  const prune = (now) => {
    seen.forEach((ts, key) => {
      if (!ts || (now - Number(ts)) >= ttl) {
        seen.delete(key)
      }
    })
    // 仍有大量长寿命条目（一次都没超时）时按插入顺序丢最旧的
    if (seen.size > max) {
      const overflow = seen.size - max
      let i = 0
      for (const key of seen.keys()) {
        if (i++ >= overflow) break
        seen.delete(key)
      }
    }
  }

  return {
    shouldNotify (source, path, now = Date.now()) {
      const key = completeNotifyKey(source, path)
      if (!key) {
        return true
      }
      const prev = seen.get(key)
      if (prev && (now - Number(prev)) < ttl) {
        return false
      }
      seen.set(key, now)
      if (seen.size > max) {
        prune(now)
      }
      return true
    },
    /** 让某个身份可以再次通知（删除任务/重新下载时用） */
    forget (source, path) {
      const key = completeNotifyKey(source, path)
      if (key) {
        seen.delete(key)
      }
    },
    /**
     * 按 gid 清掉登记（任务被删除时调用，避免 gid 复用/重下被上一次的结论罩住）。
     * 配对的身份是 `pair:<pairId>`，从 gid 推不出来 —— 但 pairId 每次发送都是新的，
     * 不存在复用，所以这里只需要处理 `gid:` 这一类。
     */
    forgetGids (gids) {
      const list = Array.isArray(gids) ? gids : [gids]
      list.forEach((gid) => {
        const g = gid ? `${gid}` : ''
        if (g) {
          seen.delete(`gid:${g}`)
        }
      })
    },
    reset () {
      seen.clear()
    },
    get size () {
      return seen.size
    }
  }
}
