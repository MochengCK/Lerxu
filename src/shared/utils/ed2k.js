import { isEmpty } from 'lodash'
import axios from 'axios'
import { ONE_SECOND, PROXY_SCOPES } from '@shared/constants'
import { convertToAxiosProxy } from './tracker'

// Parse server.met binary format
// Format: 1 byte version (0xe0), 4 bytes server count (little-endian),
// then for each server:
//   4 bytes IP (big-endian), 2 bytes port (little-endian),
//   4 bytes tag count (little-endian), then tags
const parseServerMet = (buffer) => {
  const servers = []
  if (buffer.length < 5) return servers

  let offset = 0
  const version = buffer.readUInt8(offset)
  offset += 1

  if (version !== 0xe0) return servers

  // Read server count (4 bytes, little-endian)
  if (offset + 4 > buffer.length) return servers
  const serverCount = buffer.readUInt32LE(offset)
  offset += 4

  // Sanity check: server count should be reasonable (< 10000)
  if (serverCount > 10000) return servers

  for (let s = 0; s < serverCount; s++) {
    if (offset + 10 > buffer.length) break

    try {
      const ip = buffer.readUInt32BE(offset)
      offset += 4
      const port = buffer.readUInt16LE(offset)
      offset += 2
      const tagCount = buffer.readUInt32LE(offset)
      offset += 4

      // Sanity check: tag count should be reasonable (< 1000)
      if (tagCount > 1000) break

      // Skip tags
      let broken = false
      for (let i = 0; i < tagCount; i++) {
        if (offset + 2 > buffer.length) {
          offset = buffer.length
          broken = true
          break
        }

        const tagType = buffer.readUInt8(offset)
        offset += 1

        const hasExtendedId = (tagType & 0x80) !== 0
        const baseType = tagType & 0x7f

        // Tag name: 1-byte numeric id (if 0x80 flag) or 2-byte length + string
        if (hasExtendedId) {
          if (offset + 1 > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          offset += 1
        } else {
          if (offset + 2 > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          const nameLen = buffer.readUInt16LE(offset)
          if (offset + 2 + nameLen > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          offset += 2 + nameLen
        }

        // eMule tag type values:
        // 0x01 = HASH16 (16 raw bytes)
        // 0x02 = STRING (uint16 len + data)
        // 0x03 = UINT32 (4 bytes)
        // 0x04 = FLOAT32 (4 bytes)
        // 0x05 = UINT16/INT16 (2 bytes)
        // 0x06 = UINT8/INT8 (1 byte)
        // 0x07 = BLOB (uint32 len + data)
        if (baseType === 0x01) {
          // HASH16: 16 raw bytes
          if (offset + 16 > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          offset += 16
        } else if (baseType === 0x02) {
          // STRING: 2-byte len + utf8 data
          if (offset + 2 > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          const strLen = buffer.readUInt16LE(offset)
          if (offset + 2 + strLen > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          offset += 2 + strLen
        } else if (baseType === 0x03 || baseType === 0x04) {
          // UINT32 / FLOAT32: 4 bytes
          if (offset + 4 > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          offset += 4
        } else if (baseType === 0x05) {
          // UINT16 / INT16: 2 bytes
          if (offset + 2 > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          offset += 2
        } else if (baseType === 0x06) {
          // UINT8 / INT8: 1 byte
          if (offset + 1 > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          offset += 1
        } else if (baseType === 0x07) {
          // BLOB: 4-byte len + data
          if (offset + 4 > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          const byteLen = buffer.readUInt32LE(offset)
          if (offset + 4 + byteLen > buffer.length) {
            offset = buffer.length
            broken = true
            break
          }
          offset += 4 + byteLen
        } else {
          // Unknown tag type: cannot continue safely
          offset = buffer.length
          broken = true
          break
        }
      }

      // 数据损坏到无法继续解析时，丢弃整个列表剩余部分，避免产出残缺服务器
      if (broken) {
        break
      }

      const ipStr = [
        (ip >>> 24) & 0xff,
        (ip >>> 16) & 0xff,
        (ip >>> 8) & 0xff,
        ip & 0xff
      ].join('.')

      if (port > 0 && port <= 65535) {
        servers.push(`${ipStr}:${port}`)
      }
    } catch (e) {
      break
    }
  }

  return servers
}

// Parse text format: extract ip:port patterns from any text (plain text or HTML)
const parseTextServerList = (text) => {
  if (!text) return []

  const ipPortRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5})/g
  const servers = []
  let match

  while ((match = ipPortRegex.exec(text)) !== null) {
    const ip = match[1]
    const port = parseInt(match[2], 10)
    const octets = ip.split('.').map(Number)
    if (octets.every(o => o >= 0 && o <= 255) && port > 0 && port <= 65535) {
      servers.push(`${ip}:${port}`)
    }
  }

  return servers
}

export const fetchEd2kServersFromSource = async (source, proxyConfig = {}) => {
  if (isEmpty(source)) {
    return []
  }

  const now = Date.now()
  const { enable, mode, server, scope = [] } = proxyConfig
  // 兼容新旧配置：新配置用 mode 字段，旧配置可能用 enable 字段
  const proxyEnabled = enable !== undefined ? enable : (mode === 'custom')
  const proxy = proxyEnabled && server && scope.includes(PROXY_SCOPES.UPDATE_TRACKERS)
    ? convertToAxiosProxy(server)
    : undefined

  const promises = source.map(async (url) => {
    try {
      const cacheBustUrl = url.includes('?')
        ? `${url}&t=${now}`
        : `${url}?t=${now}`
      const response = await axios.get(cacheBustUrl, {
        timeout: 30 * ONE_SECOND,
        proxy,
        responseType: 'arraybuffer'
      })

      const buffer = Buffer.from(response.data)

      // Try binary server.met format first (version byte 0xe0)
      if (buffer.length > 0 && buffer[0] === 0xe0) {
        return parseServerMet(buffer)
      }

      // Fall back to text format
      const text = buffer.toString('utf-8')
      return parseTextServerList(text)
    } catch (error) {
      console.warn(`[ED2K] Failed to fetch from ${url}:`, error.message)
      return null
    }
  })

  const results = await Promise.allSettled(promises)
  const servers = []

  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value !== null) {
      servers.push(...result.value)
    }
  })

  return [...new Set(servers)]
}
