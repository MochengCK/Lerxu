import { readFileSync } from 'node:fs'

/**
 * 解析 aria2 断点控制文件（*.aria2），得到引擎自己保存的真实下载进度。
 *
 * 文件格式（大端）：
 *   version(2B) ext(4B) infoHashLen(4B) infoHash(infoHashLen B)
 *   pieceLength(4B) totalLength(8B) uploadLength(8B) bitfieldLen(4B) bitfield(...)
 *
 * 应用退出前任务必经 pause（aria2 暂停时同步落盘控制文件），
 * 因此这里的 completedLength 与重启后 unpause 时引擎上报的进度一致。
 */
export function parseAria2ControlProgress (filePath) {
  try {
    const buf = readFileSync(filePath)
    if (buf.length < 14) {
      return null
    }
    const infoHashLen = buf.readUInt32BE(6)
    if (infoHashLen > 4096) {
      return null
    }
    let off = 10 + infoHashLen
    if (off + 24 > buf.length) {
      return null
    }
    const pieceLength = buf.readUInt32BE(off)
    off += 4
    const totalLength = Number(buf.readBigUInt64BE(off))
    off += 8
    off += 8 // uploadLength，暂不使用
    const bitfieldLen = buf.readUInt32BE(off)
    off += 4
    if (!(pieceLength > 0) || !(totalLength >= 0)) {
      return null
    }
    if (bitfieldLen < 0 || off + bitfieldLen > buf.length) {
      return null
    }

    let setBits = 0
    for (let i = 0; i < bitfieldLen; i++) {
      let b = buf[off + i]
      while (b) {
        b &= b - 1
        setBits++
      }
    }

    const numPieces = Math.ceil(totalLength / pieceLength)
    const fullBits = Math.min(setBits, numPieces)
    const completedLength = fullBits >= numPieces ? totalLength : fullBits * pieceLength
    return { totalLength, completedLength }
  } catch (_) {
    return null
  }
}
