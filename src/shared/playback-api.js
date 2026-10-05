import channelNames from './playback-channels.json'

/**
 * PLAYBACK API —— **播放器与宿主之间唯一的契约**。
 *
 * ## 为什么要有这一个文件
 *
 * 播放器要能在"完全不知道数据从哪来"的前提下工作：它可能是磁盘上一份完整文件、
 * 一个正在下载的 BT 文件（中间有大片还没到的空洞）、将来也可能是 HTTP 远端或
 * 引擎直接喂的字节流。**这些差异一律留在宿主侧**，播放器只认这一份契约：
 *
 * - 它只知道"有一个媒体可以播、它的某几段现在还没有数据"；
 * - 它不需要知道 "BT"、"Aria2"、"Rust 下载引擎"、"HTTP 流" 这些词；
 * - 宿主（主进程）也只通过这里定义的频道与它说话，不再往里塞自定义字段。
 *
 * 这样三件事同时成立：
 * 1. 换数据来源（本地文件 → 下载中文件 → 未来的磁力流）**不用改播放器**；
 * 2. 换播放器实现（这套原生页面 → 以后换别的）**不用改主进程**；
 * 3. 数据侧的能力（缓冲进度、速度、优先下载）通过 `state` 单向汇报，
 *    播放器只负责**呈现**。
 *
 * ## 数据面与控制面分开
 *
 * - **数据面**：`session.src` —— 直接丢给 `<video>` 的 URL。它是宿主准备好的，
 *   播放器不拼、不解析、不关心它是不是 http（将来换成自定义协议也不用改）。
 * - **控制面**：下面这些频道。全部是"请求 / 上报 / 推送"三态，
 *   没有回调地狱，也没有让播放器去轮询的接口。
 */

/**
 * 频道名。**单一真相在 `playback-channels.json`**：主进程经 ESM 读它，
 * 播放器页面（原生 script，不能用 ESM）用 `require` 读同一份 JSON ——
 * 两边永远不会因为"各写一份常量"而漂移。
 */
export const PLAYBACK = channelNames

/** 健康度：宿主算好给播放器显示，播放器不做任何判断逻辑。 */
export const PLAYBACK_HEALTH = {
  /** 数据充足，正常播 */
  OK: 'ok',
  /** 下载速度低于播放消耗：现在还能撑一会儿，但可能中断 */
  SLOW: 'slow',
  /** 已经追上缓冲末端，随时会卡 */
  CRITICAL: 'critical'
}

/**
 * 构造一个会话对象（宿主侧调用，保证字段齐全 —— 播放器可以信任这里的形状）。
 *
 * @param {Object} p
 * @param {string} p.id          会话 id（换文件时会变）
 * @param {string} p.src         数据地址
 * @param {boolean} [p.mse]      `true` = 数据来自**媒体引擎**（走 `/engine/<token>` 那条路由）
 * @param {boolean} [p.frames]   `true` = 数据是**引擎解好的包流**（NV12 帧 + PCM）：
 *                               画面画到 canvas、声音排进 Web Audio，**不经浏览器解码**。
 *                               `false` 只出现在诊断模式（引擎转封装出 fMP4 → MSE）
 * @param {string} p.name        显示名
 * @param {'video'|'audio'} p.kind
 * @param {number} [p.duration]  秒；0 = 未知（边下边播时常常一开始不知道）
 * @param {boolean} [p.streaming] 是否"边下边播"（数据还在增长/有空洞）
 * @param {Object} [p.meta]      { title, artist, album, cover }
 * @param {Array}  [p.features]  数据侧支持的能力，如 ['subtitle','seek']
 * @returns {Object} PlaybackSession
 */
export function createPlaybackSession (p = {}) {
  return {
    id: `${p.id || ''}`,
    src: `${p.src || ''}`,
    mse: !!p.mse,
    frames: !!p.frames,
    name: `${p.name || ''}`,
    kind: p.kind === 'audio' ? 'audio' : 'video',
    duration: Number(p.duration) || 0,
    streaming: !!p.streaming,
    meta: p.meta && typeof p.meta === 'object' ? p.meta : {},
    features: Array.isArray(p.features) ? p.features.slice() : []
  }
}

/**
 * 构造一份状态快照。
 *
 * 这些数字全部由宿主的会话算出来 —— 播放器只显示，不推导。
 * 判据见 `PlaybackSession.evaluateHealth()`：
 * 平均播放消耗 4.2 MB/s、当前下载 12.8 MB/s → ok；
 * 消耗 8 MB/s、下载 2 MB/s → slow（提示"下载速度不足，播放可能中断"）。
 *
 * @param {Object} p
 * @param {number} [p.bufferedEnd]   已缓冲到的时间（秒）
 * @param {number} [p.bufferedBytes] 已有数据的字节数
 * @param {number} [p.bufferedRatio] 0~1，已有数据占总大小的比例
 * @param {number} [p.downloadSpeed] 字节/秒
 * @param {number} [p.consumption]   播放消耗（字节/秒）
 * @param {string} [p.health]        PLAYBACK_HEALTH.*
 * @param {string} [p.warning]       人话预警（为空表示没有）
 */
export function createPlaybackState (p = {}) {
  return {
    bufferedEnd: Number(p.bufferedEnd) || 0,
    bufferedBytes: Number(p.bufferedBytes) || 0,
    bufferedRatio: Number.isFinite(p.bufferedRatio) ? p.bufferedRatio : 0,
    downloadSpeed: Number(p.downloadSpeed) || 0,
    consumption: Number(p.consumption) || 0,
    health: p.health || PLAYBACK_HEALTH.OK,
    warning: `${p.warning || ''}`
  }
}

/**
 * 健康度判据：**当前下载速度还追不追得上播放消耗**。
 *
 * 为什么留余量（1.25）：下载速度的瞬时值抖得厉害，等于消耗就是"随时会断"，
 * 提示应当在真的断之前出现，而不是在卡住的那一刻。
 *
 * 返回 `{ health, warning }`；没有足够信息时给 `ok`（不吓唬用户）。
 */
export function evaluateHealth ({ consumption = 0, downloadSpeed = 0, streaming = false } = {}) {
  if (!streaming || consumption <= 0 || downloadSpeed <= 0) {
    return { health: PLAYBACK_HEALTH.OK, warning: '' }
  }
  const ratio = downloadSpeed / consumption
  // 文案里**不带数字**了：具体速度是播放器里常驻的读数（时长右侧那一行），
  // 提示条只负责说"该怎么办" —— 同一组数字出现在两个地方只会互相打架。
  if (ratio >= 1.25) {
    return { health: PLAYBACK_HEALTH.OK, warning: '' }
  }
  if (ratio >= 0.9) {
    return {
      health: PLAYBACK_HEALTH.SLOW,
      warning: '下载速度略低于播放消耗，播放可能中断'
    }
  }
  return {
    health: PLAYBACK_HEALTH.CRITICAL,
    warning: '下载速度跟不上播放消耗，播放随时会卡住'
  }
}
