/**
 * 第三方扩展「同 stem 音视频」的配对判据（纯函数，不碰 fs / Vue / store）。
 *
 * 为什么需要它：我们自己的扩展发任务时会带 `pairId` + `pairRole`，谁是画面、
 * 谁是声音写得明明白白。别人的扩展（Bilibili-Evolved 的「aria2 输出支持」等）
 * 只发两条**普通任务**，落盘成同名的两个文件 —— `标题.mp4` + `标题.m4a`
 * （FLAC 音轨时是 `.flac`），没有任何角色标记。要触发合并，只能靠扩展名分类配对。
 *
 * ⚠️ 这段判据是**破坏性**的：配对成立、合并成功后，两个输入文件会被产物取代
 * （`EngineClient.afterBilibiliMerge` 会删掉它们）。所以每一条保守条件都不能省：
 *   · 必须有**互补角色**的另一半（盘上文件或任务列表），只是"同名"不凑一对；
 *   · 另一半还在下（`.xfer` / 下载中后缀 / 任务未结束）→ 只报 pending，不许合并；
 *   · 两个文件都在盘上时，mtime 相差超过一小时 → 认定是用户自己的独立文件；
 *   · 已经产出过合并文件（`alreadyMerged`）→ 不再当成一对。
 *
 * 折叠/进度这些展示逻辑在 `taskPair.js`，这里只管"这两个文件是不是一对"。
 * 测试：`node test/avpair/run.mjs`。
 */

/** 画面类容器：能装视频轨的。 */
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'flv', 'ts']
/** 声音类容器：只装音频轨的。 */
export const AUDIO_EXTENSIONS = ['m4a', 'aac', 'flac', 'mp3', 'opus', 'ogg', 'oga', 'wav']

const VIDEO_SET = new Set(VIDEO_EXTENSIONS)
const AUDIO_SET = new Set(AUDIO_EXTENSIONS)

export const MEDIA_KIND_VIDEO = 'video'
export const MEDIA_KIND_AUDIO = 'audio'

/**
 * 两个文件都被认定为一对的 mtime 上限。
 *
 * 同一次"下载视频"发出的两条流几乎同时落盘；相隔一小时以上的同名音视频
 * 多半是用户收藏里本来就分开的独立文件，合成一条会把它们**删掉**。
 */
export const MAX_PAIR_MTIME_GAP_MS = 60 * 60 * 1000

/** `.lerxu-merging-` 开头的隐藏文件是合并过程的临时产物，不参与配对。 */
const MERGING_TEMP_MARK = '.lerxu-merging-'

/**
 * 文件名 → `video` / `audio` / 空串（不认识）。
 *
 * 只看**最后一个点**后的扩展名（`标题.v2.mp4` 是画面，`.tar.gz` 里没有媒体类型）。
 */
export function mediaKindOf (filename) {
  const name = filename ? `${filename}` : ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  const ext = name.slice(dot + 1).toLowerCase()
  if (VIDEO_SET.has(ext)) return MEDIA_KIND_VIDEO
  if (AUDIO_SET.has(ext)) return MEDIA_KIND_AUDIO
  return ''
}

/** 去掉 `标题 (1).mp4` 里的重复序号（浏览器/系统的"另存为"会加）。 */
export function stripDuplicateNumber (filename) {
  const name = filename ? `${filename}` : ''
  if (!name) return name
  return name.replace(/\s+\(\d+\)(?=\.[^.]+$)/, '')
}

/** 去掉下载中的临时后缀（`标题.mp4.part` → `标题.mp4`）。 */
export function stripDownloadingSuffix (filename, downloadingSuffix) {
  const name = filename ? `${filename}` : ''
  const suffix = downloadingSuffix ? `${downloadingSuffix}` : ''
  if (!name || !suffix) return name
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
}

/**
 * 配对用的 stem：**去掉扩展名**，保留其余全部（包括 ` - 01` 这类序号）。
 *
 * 不剥 `_video` / `_audio` 这些角色后缀 —— 那是我们自己扩展的命名，走
 * `pairId` 或 B 站分片那套判据；这里混进来只会把两条不同角色的文件配错。
 */
export function mediaStemOf (filename, downloadingSuffix = '') {
  const noSuffix = stripDownloadingSuffix(filename ? `${filename}` : '', downloadingSuffix)
  const noDup = stripDuplicateNumber(noSuffix)
  const dot = noDup.lastIndexOf('.')
  return dot > 0 ? noDup.slice(0, dot) : noDup
}

/**
 * 扫同目录的兄弟文件，找出与 `ownName` **同 stem 的互补角色**。
 *
 * @param {Object} input
 * @param {string} input.ownName 刚下完的那个文件名（已去掉下载中后缀）
 * @param {Array<string>} input.names 同目录的全部文件名（原样，含 `.xfer`）
 * @param {string} [input.downloadingSuffix] 下载中后缀（如 `.lerxu-downloading`）
 * @param {(name: string) => ({ size?: number, mtimeMs?: number } | null)} [input.statOf]
 *        只在**候选**（同 stem 且角色已知、不在下载中）上调用，避免为大目录里
 *        每个文件都 stat 一次。
 * @returns {null | { kind: string, stem: string, video: Object|null, audio: Object|null, pending: boolean }}
 *         `video` / `audio` = `{ name, size, mtimeMs }`；同一角色有多个文件时取**最大**的
 *         那个（分片/重复下载里最大的才是完整那份）。
 */
export function scanSiblingMedia (input = {}) {
  const { ownName, names, downloadingSuffix = '', statOf } = input

  const ownKind = mediaKindOf(ownName)
  if (!ownKind) return null
  const stem = mediaStemOf(ownName, downloadingSuffix)
  if (!stem) return null

  const list = Array.isArray(names) ? names : []
  // `<完整文件名>.xfer` 是引擎的临时文件：出现它就说明这条还没下完。
  const xferNames = new Set()
  for (const raw of list) {
    const name = raw ? `${raw}` : ''
    if (!name) continue
    if (name.toLowerCase().endsWith('.xfer')) {
      xferNames.add(name.slice(0, -'.xfer'.length))
    }
  }

  const ready = { video: null, audio: null }
  let pending = false

  for (const raw of list) {
    const name = raw ? `${raw}` : ''
    if (!name) continue
    if (name.toLowerCase().endsWith('.xfer')) continue
    if (name.startsWith('.') && name.includes(MERGING_TEMP_MARK)) continue
    const noSuffix = stripDownloadingSuffix(name, downloadingSuffix)
    const kind = mediaKindOf(noSuffix)
    if (!kind) continue
    if (mediaStemOf(name, downloadingSuffix) !== stem) continue

    // 还在下载：下载中后缀没去掉，或者旁边还躺着 `.xfer`
    if ((downloadingSuffix && name.endsWith(downloadingSuffix)) ||
      xferNames.has(name) || xferNames.has(noSuffix)) {
      pending = true
      continue
    }

    let size = 0
    let mtimeMs = 0
    try {
      const st = typeof statOf === 'function' ? statOf(name) : null
      size = Number(st && st.size) || 0
      mtimeMs = Number(st && st.mtimeMs) || 0
    } catch (_) {
      size = 0
    }
    if (size <= 0) continue

    const prev = ready[kind]
    if (!prev || size > prev.size) {
      ready[kind] = { name, size, mtimeMs }
    }
  }

  return { kind: ownKind, stem, video: ready.video, audio: ready.audio, pending }
}

/**
 * 把"盘上扫到的"和"任务列表里看到的"合起来，判定这两个文件是不是一对。
 *
 * @param {Object|null} scan `scanSiblingMedia` 的返回值
 * @param {Object} [hints]
 * @param {{video?: boolean, audio?: boolean}} [hints.taskKinds]
 *        任务列表 / 历史里同 stem 的互补角色（另一半可能还没落盘）
 * @param {boolean} [hints.partnerPending] 那一半的任务还没结束
 * @param {boolean} [hints.alreadyMerged] 这一对已经产出过合并文件
 * @returns {null | { kind: string, stem: string, video: Object|null, audio: Object|null,
 *                    pending: boolean, pairLike: boolean, alreadyMerged: boolean }}
 *         `null` = 不是一对（缺互补角色），调用方按普通任务收尾。
 */
export function resolveGenericPair (scan, hints = {}) {
  if (!scan) return null
  const taskKinds = hints.taskKinds || {}
  const alreadyMerged = hints.alreadyMerged === true
  const partnerPending = hints.partnerPending === true

  const hasVideo = !!(scan.video || taskKinds.video)
  const hasAudio = !!(scan.audio || taskKinds.audio)
  if (!hasVideo || !hasAudio) return null

  let pairLike = !alreadyMerged
  if (pairLike && scan.video && scan.audio) {
    const vm = scan.video.mtimeMs || 0
    const am = scan.audio.mtimeMs || 0
    if (vm && am && Math.abs(vm - am) > MAX_PAIR_MTIME_GAP_MS) {
      pairLike = false
    }
  }

  return {
    kind: scan.kind,
    stem: scan.stem,
    video: scan.video,
    audio: scan.audio,
    // 缺任一边、那边还在下、或任务说它没结束 —— 都只算"还没齐"，不许合并
    pending: scan.pending || partnerPending || !scan.video || !scan.audio,
    pairLike,
    alreadyMerged
  }
}
