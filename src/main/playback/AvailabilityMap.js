/**
 * 可用性图：把下载引擎的**片位图**翻译成"这个文件的哪些字节已经下到了"，
 * 交给媒体引擎（`stream --avail=<文件>`）。
 *
 * ## 为什么需要它
 *
 * BT 下载先扩文件、后填数据 —— 没下到的位置读出来是零。媒体引擎读到一片零会把它
 * 当真实数据（H.264 找不到起始码 → "码流损坏" → 播放直接终止）。真相只有下载
 * 引擎的片位图知道，而位图在宿主手里，所以由宿主翻译成一个小文件、秒级刷新，
 * 引擎在等待期间反复读它（见 ZuvRust 的 `me_stream::avail`）。
 *
 * ## 坐标
 *
 * 位图是**按整份种子**编的，而引擎问的是**文件内**偏移 —— 所以图里要带
 * `fileOffset`（本文件在种子里的起点 = 前面所有文件长度之和）。
 */

import { renameSync, writeFileSync } from 'node:fs'

/** 位图十六进制串 → 是否像样（偶数长度、全是 hex）。 */
export function isHexBitfield (hex) {
  const s = `${hex || ''}`.trim()
  return s.length > 0 && s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s)
}

/**
 * 组装可用性图（纯函数）。
 *
 * @param {Object} p
 * @param {string} p.bitfield   种子片位图（十六进制；下载引擎 `task.tell` 的 `bitfield`）
 * @param {number} p.pieceLength 片长（字节）
 * @param {number} [p.fileOffset] 本文件在种子里的起始字节
 * @param {number} [p.total]     本文件总长（字节，仅作参考）
 * @returns {Object|null} 合法的图；字段不合法时返回 null（调用方按"不知道"处理）
 */
export function buildAvailability ({ bitfield, pieceLength, fileOffset = 0, total = 0 } = {}) {
  if (!isHexBitfield(bitfield)) {
    return null
  }
  const piece = Number(pieceLength)
  if (!Number.isFinite(piece) || piece <= 0) {
    return null
  }
  const offset = Number(fileOffset)
  if (!Number.isFinite(offset) || offset < 0) {
    return null
  }
  return {
    fileOffset: Math.floor(offset),
    pieceLength: Math.floor(piece),
    total: Math.max(0, Math.floor(Number(total) || 0)),
    bitfield: `${bitfield}`.trim().toLowerCase()
  }
}

/**
 * 原子写（临时文件 + rename）：引擎随时可能在读，绝不能让它读到半截 JSON。
 */
export function writeAvailabilityFile (path, map) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(map))
  renameSync(tmp, path)
}
