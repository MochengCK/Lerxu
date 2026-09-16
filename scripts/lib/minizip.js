/**
 * minizip.js — 零依赖 ZIP 生成与条目读取
 * ======================================
 *
 * 为什么自己实现而不用系统 `zip`：
 *
 * 1. **AMO 要求扩展文件位于归档根目录**，且不得含 macOS 元数据
 *    （`__MACOSX/`、`._*`）与开发用文件——Finder/右键压缩会把源码目录
 *    连同资源分叉一起打进去，导致提交被拒（"No manifest.json was found at
 *    the root of the extension"）。
 * 2. **跨平台一致**：macOS 的 zip 会写入 `__MACOSX` 与扩展属性，Linux 不会。
 *    自己生成可保证本地与 CI 产物逐字节一致。
 * 3. **UTF-8 文件名**：本项目含中日韩文名的安装指南，必须设置 general
 *    purpose bit 11（UTF-8 标志），否则各解压工具会出现乱码。
 *
 * 生成时固定 DOS 时间戳（1980-01-01），使同一输入产出可复现的归档。
 */

'use strict'

const zlib = require('zlib')

/** CRC-32 查表（IEEE 802.3，ZIP 使用） */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }
  return table
})()

const crc32 = (buf) => {
  let crc = -1
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF]
  }
  return (crc ^ -1) >>> 0
}

/** 固定时间戳：1980-01-01 00:00:00（DOS 时间格式），保证产物可复现 */
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50
const FLAG_UTF8 = 0x0800
const METHOD_DEFLATE = 8
const VERSION_NEEDED = 20
const VERSION_MADE_BY = 20 // 2.0，MS-DOS 兼容

/**
 * 生成 ZIP 归档。
 * @param {Array<{name: string, data: Buffer|string}>} entries
 *   条目列表；`name` 必须是相对路径且使用 `/` 分隔（不带前导 `/`）
 * @returns {Buffer}
 */
const createZip = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('createZip: 至少需要一个条目')
  }

  const chunks = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    const name = String(entry.name).replace(/\\/g, '/')
    if (name.startsWith('/') || name.includes('../')) {
      throw new Error(`createZip: 非法条目名 ${name}`)
    }
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)

    const deflated = zlib.deflateRawSync(data, { level: 9 })
    // 压缩后反而更大时退回存储（method 0），避免无谓膨胀
    const useDeflate = deflated.length < data.length
    const payload = useDeflate ? deflated : data
    const method = useDeflate ? METHOD_DEFLATE : 0
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(SIG_LOCAL, 0)
    local.writeUInt16LE(VERSION_NEEDED, 4)
    local.writeUInt16LE(FLAG_UTF8, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra length

    chunks.push(local, nameBuf, payload)

    const centralEntry = Buffer.alloc(46)
    centralEntry.writeUInt32LE(SIG_CENTRAL, 0)
    centralEntry.writeUInt16LE(VERSION_MADE_BY, 4)
    centralEntry.writeUInt16LE(VERSION_NEEDED, 6)
    centralEntry.writeUInt16LE(FLAG_UTF8, 8)
    centralEntry.writeUInt16LE(method, 10)
    centralEntry.writeUInt16LE(DOS_TIME, 12)
    centralEntry.writeUInt16LE(DOS_DATE, 14)
    centralEntry.writeUInt32LE(crc, 16)
    centralEntry.writeUInt32LE(payload.length, 20)
    centralEntry.writeUInt32LE(data.length, 24)
    centralEntry.writeUInt16LE(nameBuf.length, 28)
    centralEntry.writeUInt16LE(0, 30) // extra length
    centralEntry.writeUInt16LE(0, 32) // comment length
    centralEntry.writeUInt16LE(0, 34) // disk number start
    centralEntry.writeUInt16LE(0, 36) // internal attributes
    centralEntry.writeUInt32LE(0, 38) // external attributes
    centralEntry.writeUInt32LE(offset, 42)

    central.push(centralEntry, nameBuf)
    offset += local.length + nameBuf.length + payload.length
  }

  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(SIG_EOCD, 0)
  eocd.writeUInt16LE(0, 4) // 本磁盘号
  eocd.writeUInt16LE(0, 6) // 中央目录起始磁盘
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20) // 注释长度

  return Buffer.concat([...chunks, centralBuf, eocd])
}

/**
 * 读取 ZIP 内的条目名列表（解析 EOCD + 中央目录）。
 *
 * 用途：打包后自检与自动化测试——AMO 要求扩展文件位于归档根目录，
 * 必须在提交前确认 `manifest.json` 处于根级、且没有 macOS 元数据混入。
 *
 * @param {Buffer} buf
 * @returns {Array<{name: string, size: number, compressedSize: number, utf8: boolean}>}
 */
const listZipEntries = (buf) => {
  // 从尾部向前查找 EOCD（无注释时位于最后 22 字节）
  const maxBack = Math.min(buf.length, 22 + 0xFFFF)
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= buf.length - maxBack; i--) {
    if (i < 0) break
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) {
    throw new Error('listZipEntries: 未找到 EOCD，不是有效的 ZIP')
  }

  const total = buf.readUInt16LE(eocdOffset + 10)
  const cdOffset = buf.readUInt32LE(eocdOffset + 16)

  let p = cdOffset
  const out = []
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new Error('listZipEntries: 中央目录签名错误')
    }
    const flags = buf.readUInt16LE(p + 8)
    const compressedSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8')
    out.push({ name, size, compressedSize, utf8: (flags & FLAG_UTF8) !== 0 })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** 解压单个条目（仅用于测试校验内容一致性） */
const readZipEntry = (buf, targetName) => {
  const entries = listZipEntries(buf)
  const index = entries.findIndex((e) => e.name === targetName)
  if (index < 0) {
    throw new Error(`readZipEntry: 未找到条目 ${targetName}`)
  }
  // 重新扫描本地头以定位数据（中央目录不含数据偏移）
  const maxBack = Math.min(buf.length, 22 + 0xFFFF)
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= buf.length - maxBack; i--) {
    if (i < 0) break
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocdOffset = i
      break
    }
  }
  const cdOffset = buf.readUInt32LE(eocdOffset + 16)

  let p = cdOffset
  for (let i = 0; i <= index; i++) {
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    if (i === index) {
      const localNameLen = buf.readUInt16LE(localOffset + 26)
      const localExtraLen = buf.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLen + localExtraLen
      const raw = buf.slice(dataStart, dataStart + compressedSize)
      return method === 0 ? raw : zlib.inflateRawSync(raw)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error('readZipEntry: 定位失败')
}

module.exports = { createZip, listZipEntries, readZipEntry, crc32 }
