/**
 * "这次播放用哪个内核" —— **纯函数**，主进程拿它做决定，测试直接钉住它。
 *
 * ## 只有一个内核：媒体引擎
 *
 * 桌面播放器**不做"浏览器播放"这一档**。容器的解析、边等边读、寻址、转封装固然在
 * 引擎里，**解码也在引擎里**（视频硬解、音频自研软解），播放器页只负责上屏与发声：
 *
 * | 环节 | 谁做 |
 * |---|---|
 * | 解析容器 / 边等边读 / 寻址 | 媒体引擎 |
 * | 视频解码 → NV12 帧、音频解码 → PCM | 媒体引擎 |
 * | 上屏（WebGL）/ 发声（Web Audio） | 播放器页 |
 *
 * 为什么不做"浏览器能解的就交给浏览器"：那会让同一份文件在不同机器上走不同的路
 * （浏览器支持面随版本变、还只看扩展名），而"引擎能脱离浏览器播放"是这条路线的
 * 前提（引擎出帧 + 引擎出 PCM 就是为它建的）。代价是引擎还没接的编码**播不了**，
 * 那就**如实说不支持**：
 *
 * - 视频：目前只有 H.264 硬解（H.265 / AV1 / VP9 会明确报"解码目前只接了 H.264"）；
 * - 音频：FLAC / AAC-LC / MP3 / Opus（其余编码明确报 Unsupported，不会产噪声）；
 * - 容器：引擎不认的容器（wav / webm / 部分 mkv 等）同样明确报错。
 *
 * **失败不回退浏览器**：用户看到的是引擎给的原因，而不是一条被浏览器兜住的
 * "看起来能播"的路 —— 那样只会把引擎的缺口藏起来。
 *
 * 没有引擎可执行文件（该平台还没回填二进制）时同理：这次播放起不来，如实报错。
 */

/** 为什么选了某个内核（日志与测试都要用，所以是字符串而不是布尔）。 */
export const PLAYBACK_PLAN_REASON = {
  /** 用引擎（唯一内核） */
  ENGINE: 'engine',
  /** 没有引擎可执行文件 */
  NO_ENGINE: 'no-engine'
}

/**
 * 决定播放方案。
 *
 * @param {Object} p
 * @param {string} p.enginePath 引擎可执行文件（空 = 没找到）
 * @returns {{ engine: boolean, reason: string }}
 */
export function planPlayback ({ enginePath } = {}) {
  if (!enginePath) {
    return { engine: false, reason: PLAYBACK_PLAN_REASON.NO_ENGINE }
  }
  return { engine: true, reason: PLAYBACK_PLAN_REASON.ENGINE }
}
