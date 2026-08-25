// ip2region.js synchronous wrapper — IPv4 + IPv6 dual-stack
// Optimized for high-frequency synchronous queries:
//   1. Reusable Buffers (no per-search allocation, zero GC pressure)
//   2. Combined searchInfoSync (search + parse in one pass)
//   3. String-based IP version detection (avoids parseIP overhead on every call)

import { IPv4, IPv6, newWithBuffer, parseIP, HeaderInfoLength, VectorIndexCols, VectorIndexSize } from 'ip2region.js'
import path from 'path'
import fs from 'fs'
import { gunzipSync } from 'zlib'

let v4Searcher = null
let v6Searcher = null
let initialized = false

// --- Reusable Buffers (avoid per-search allocation / GC) ---
// IPv4 index size = 14, IPv6 index size = 38; use the larger one.
const MAX_INDEX_SIZE = 38
const _idxBuff = Buffer.allocUnsafe(MAX_INDEX_SIZE)
// Maximum region data length in practice is ~255 bytes.
const _regionBuff = Buffer.allocUnsafe(512)

function resolveXdbPath (filename) {
  const candidates = []

  try {
    candidates.push(path.join(__dirname, 'shared', 'data', filename))
  } catch (_) {}

  // 开发模式: __dirname 通常是 src/shared/utils，向上一级到 src/shared，再进 data/
  try {
    candidates.push(path.resolve(__dirname, '..', 'data', filename))
  } catch (_) {}

  // 打包模式: __dirname 通常是 dist/electron
  try {
    candidates.push(path.join(__dirname, 'shared', 'data', filename))
  } catch (_) {}

  try {
    const { app } = require('@electron/remote')
    const appPath = app.getAppPath()
    candidates.push(path.join(appPath, 'dist', 'electron', 'shared', 'data', filename))
    candidates.push(path.join(appPath, 'src', 'shared', 'data', filename))
  } catch (_) {}

  try {
    if (process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, 'app.asar', 'dist', 'electron', 'shared', 'data', filename))
    }
  } catch (_) {}

  return candidates.find(p => {
    try { return fs.existsSync(p) } catch (_) { return false }
  }) || ''
}

// 构建期 xdb 以 gzip 落盘以减小打包体积（47MB -> 11MB），
// 优先加载 .gz 并在内存中解压，回退到未压缩版本
function readXdbBuffer (filename) {
  const gzPath = resolveXdbPath(`${filename}.gz`)
  if (gzPath) {
    return gunzipSync(fs.readFileSync(gzPath))
  }

  const rawPath = resolveXdbPath(filename)
  if (rawPath) {
    return fs.readFileSync(rawPath)
  }

  return null
}

function ensureInitialized () {
  if (initialized) return
  initialized = true

  try {
    const v4Buffer = readXdbBuffer('ip2region_v4.xdb')
    if (v4Buffer) {
      v4Searcher = newWithBuffer(IPv4, v4Buffer)
    } else {
      console.warn('[ip2region] ip2region_v4.xdb not found')
    }
  } catch (e) {
    console.warn('[ip2region] Failed to initialize IPv4 searcher:', e.message)
  }

  try {
    const v6Buffer = readXdbBuffer('ip2region_v6.xdb')
    if (v6Buffer) {
      v6Searcher = newWithBuffer(IPv6, v6Buffer)
    } else {
      console.warn('[ip2region] ip2region_v6.xdb not found')
    }
  } catch (e) {
    console.warn('[ip2region] Failed to initialize IPv6 searcher:', e.message)
  }
}

/**
 * Core binary search on a searcher's in-memory buffer.
 * Uses pre-allocated _idxBuff and _regionBuff — zero allocation in hot path.
 * Returns the region string or "".
 */
function doSearch (searcher, ipBytes) {
  const cBuffer = searcher.cBuffer
  if (cBuffer == null) return ''

  const il0 = ipBytes[0]
  const il1 = ipBytes[1]
  const idx = il0 * VectorIndexCols * VectorIndexSize + il1 * VectorIndexSize
  const base = HeaderInfoLength + idx

  const sPtr = cBuffer.readUint32LE(base)
  const ePtr = cBuffer.readUint32LE(base + 4)
  if (sPtr === 0 || ePtr === 0) return ''

  const bytes = ipBytes.length
  const dBytes = bytes << 1
  const indexSize = searcher.version.indexSize
  const version = searcher.version
  const buff = _idxBuff
  let dLen = 0
  let dPtr = 0
  let l = 0
  let h = (ePtr - sPtr) / indexSize

  while (l <= h) {
    const m = (l + h) >> 1
    const p = sPtr + m * indexSize
    cBuffer.copy(buff, 0, p, p + indexSize)
    if (version.ipSubCompare(ipBytes, buff, 0) < 0) {
      h = m - 1
    } else if (version.ipSubCompare(ipBytes, buff, bytes) > 0) {
      l = m + 1
    } else {
      dLen = buff.readUint16LE(dBytes)
      dPtr = buff.readUint32LE(dBytes + 2)
      break
    }
  }

  if (dLen === 0 || dLen > _regionBuff.length) return ''

  // 越界时静默截断会导致 _regionBuff 中残留上一次查询的陈旧数据，
  // 必须显式校验目标范围
  if (dPtr + dLen > cBuffer.length) return ''

  cBuffer.copy(_regionBuff, 0, dPtr, dPtr + dLen)
  return _regionBuff.toString('utf-8', 0, dLen)
}

// --- Fast IP version detection (string-based, no Buffer allocation) ---

function isIPv4String (ip) {
  return ip.includes('.') && !ip.includes(':')
}

function isIPv6String (ip) {
  return ip.includes(':')
}

// --- Pre-parsed zero-IP bytes for fast skip ---

const _emptyResult = { country: '', province: '', city: '', isp: '', countryCode: '', region: '' }

/**
 * Combined search + parse in a single pass.
 * Returns { country, province, city, isp, countryCode, region } or a shared empty object.
 * This avoids calling searchSync + parseRegion separately (which would allocate
 * an intermediate string and a parse object on every call).
 *
 * @param {string|Buffer} ip
 * @returns {{country: string, province: string, city: string, isp: string, countryCode: string, region: string}}
 */
export function searchInfoSync (ip) {
  ensureInitialized()
  if (!ip) return _emptyResult

  try {
    // Fast path: string-based version detection to avoid parseIP when possible
    let searcher = null
    let ipBytes = null

    if (typeof ip === 'string') {
      if (isIPv4String(ip)) {
        searcher = v4Searcher
      } else if (isIPv6String(ip)) {
        searcher = v6Searcher
      } else {
        return _emptyResult
      }
      ipBytes = parseIP(ip)
    } else if (Buffer.isBuffer(ip)) {
      if (ip.length === 4) {
        searcher = v4Searcher
      } else if (ip.length === 16) {
        searcher = v6Searcher
      } else {
        return _emptyResult
      }
      ipBytes = ip
    } else {
      return _emptyResult
    }

    if (!searcher) return _emptyResult

    const region = doSearch(searcher, ipBytes)
    if (!region) return _emptyResult

    // Parse the "country|province|city|isp|countryCode" format directly
    // without creating an intermediate array via split('|')
    let s = 0
    const parts = []
    for (let i = 0; i <= region.length; i++) {
      if (i === region.length || region.charCodeAt(i) === 124) { // '|'
        parts.push(s === i ? '' : region.substring(s, i))
        s = i + 1
        if (parts.length === 5) break
      }
    }
    // Fill remaining parts if string had fewer than 5 segments
    while (parts.length < 5) parts.push('')

    const clean = (v) => (v && v !== '0') ? v : ''
    return {
      country: clean(parts[0]),
      province: clean(parts[1]),
      city: clean(parts[2]),
      isp: clean(parts[3]),
      countryCode: clean(parts[4]),
      region: region
    }
  } catch (e) {
    return _emptyResult
  }
}

/**
 * Synchronous IP region search — supports both IPv4 and IPv6.
 * Returns the raw region string "国家|省份|城市|ISP|国家代码" or "".
 * For better performance, prefer searchInfoSync() to avoid separate parse.
 *
 * @param {string|Buffer} ip
 * @returns {string}
 */
export function searchSync (ip) {
  ensureInitialized()
  if (!ip) return ''

  try {
    let searcher = null
    let ipBytes = null

    if (typeof ip === 'string') {
      if (isIPv4String(ip)) {
        searcher = v4Searcher
      } else if (isIPv6String(ip)) {
        searcher = v6Searcher
      } else {
        return ''
      }
      ipBytes = parseIP(ip)
    } else if (Buffer.isBuffer(ip)) {
      ipBytes = ip
      if (ip.length === 4) {
        searcher = v4Searcher
      } else if (ip.length === 16) {
        searcher = v6Searcher
      } else {
        return ''
      }
    } else {
      return ''
    }

    if (!searcher) return ''
    return doSearch(searcher, ipBytes)
  } catch (e) {
    return ''
  }
}

/**
 * Parse a region string "国家|省份|城市|ISP|国家代码" into an object.
 * For better performance, use searchInfoSync() to get search + parse in one call.
 *
 * @param {string} region
 * @returns {{country: string, province: string, city: string, isp: string, countryCode: string}}
 */
export function parseRegion (region) {
  if (!region) {
    return { country: '', province: '', city: '', isp: '', countryCode: '' }
  }
  const parts = region.split('|')
  const clean = (v) => (v && v !== '0') ? v : ''
  return {
    country: clean(parts[0]),
    province: clean(parts[1]),
    city: clean(parts[2]),
    isp: clean(parts[3]),
    countryCode: clean(parts[4])
  }
}
