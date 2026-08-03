import { existsSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import dns from 'node:dns'

/**
 * DHT 路由表预热
 *
 * XferCore(aria2) 首次启动时如果 dht.dat 不存在，只能通过 dht-entry-point
 * 冷启动引导，节点发现慢。这里在引擎启动前检测：若路由表文件不存在，
 * 则解析知名 DHT 引导节点的地址，按引擎自身的 v3 二进制格式
 * （见 XferCore/src/DHTRoutingTableSerializer.cc）预写一个路由表文件。
 *
 * 引擎加载该文件后会把这些节点加入路由表，并立即强制执行 bucket refresh
 * （DHTSetup.cc），实现"秒级"接入 DHT 网络。引擎运行后会自行维护并覆盖
 * 该文件（DHTAutoSaveCommand），此逻辑只在文件缺失时介入。
 */

// 与引擎内置入口保持一致（DHTSetup.cc getDefaultDHTEntryPoints），
// 并额外补充两个公共引导节点提高成功率
const DHT_BOOTSTRAP_NODES = [
  { host: 'dht.transmissionbt.com', port: 6881 },
  { host: 'router.bittorrent.com', port: 6881 },
  { host: 'router.utorrent.com', port: 6881 },
  { host: 'router.silotis.us', port: 6881 },
  { host: 'dht.libtorrent.org', port: 25401 },
  { host: 'dht.aelitis.com', port: 6881 }
]

const DNS_TIMEOUT = 2500
const MAX_SEED_NODES = 16

const withTimeout = (promise, ms) => {
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('dns lookup timeout')), ms)
    })
  ])
}

/**
 * IPv6 地址字符串转 16 字节 Buffer，失败返回 null
 */
const ipv6ToBuffer = (ip) => {
  try {
    let addr = `${ip}`.split('%')[0]
    let v4Groups = null
    const lastColon = addr.lastIndexOf(':')
    const lastPart = lastColon >= 0 ? addr.slice(lastColon + 1) : addr
    if (lastPart.includes('.')) {
      const v4 = lastPart.split('.').map((n) => parseInt(n, 10))
      if (v4.length !== 4 || v4.some((n) => isNaN(n) || n < 0 || n > 255)) {
        return null
      }
      v4Groups = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]]
      addr = addr.slice(0, lastColon + 1)
    }

    const sides = addr.split('::')
    if (sides.length > 2) {
      return null
    }
    const parseGroups = (s) => {
      if (!s) {
        return []
      }
      return s.split(':').filter((g) => g !== '').map((g) => {
        const n = parseInt(g, 16)
        return (isNaN(n) || n < 0 || n > 0xffff) ? NaN : n
      })
    }

    const head = parseGroups(sides[0])
    const tail = sides.length === 2 ? parseGroups(sides[1]) : []
    if (v4Groups) {
      tail.push(...v4Groups)
    }
    if (head.some(isNaN) || tail.some(isNaN)) {
      return null
    }
    const missing = 8 - head.length - tail.length
    if (missing < 0 || (sides.length === 1 && missing !== 0)) {
      return null
    }
    const groups = [...head, ...new Array(missing).fill(0), ...tail]
    const buf = Buffer.alloc(16)
    groups.forEach((g, i) => buf.writeUInt16BE(g, i * 2))
    return buf
  } catch (e) {
    return null
  }
}

const ipv4ToBuffer = (ip) => {
  const parts = `${ip}`.split('.').map((n) => parseInt(n, 10))
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) {
    return null
  }
  return Buffer.from(parts)
}

/**
 * 构建 v3 格式的 DHT 路由表文件内容
 * 布局（网络字节序，共 56 字节头 + 每节点 56 字节）：
 *   magic(2) 0xa1a2 | fmt(1) 0x02 | rsv(3) | ver(2) 0x0003
 *   mtime(8) | rsv(8) | localNodeId(20) | rsv(4) | numNodes(4) | rsv(4)
 *   每节点: plen(1) | rsv(7) | compactPeer(plen) | rsv(24-plen) | nodeId(20) | rsv(4)
 */
export const buildDhtRoutingTableFile = (nodes, isV6 = false) => {
  const plen = isV6 ? 18 : 6
  const header = Buffer.alloc(56)
  header[0] = 0xa1
  header[1] = 0xa2
  header[2] = 0x02
  header[7] = 0x03
  header.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)), 8)
  randomBytes(20).copy(header, 24) // local node ID
  header.writeUInt32BE(nodes.length, 48)

  const entrySize = 56
  const body = Buffer.alloc(nodes.length * entrySize)
  nodes.forEach((node, idx) => {
    const off = idx * entrySize
    body[off] = plen
    const ipBuf = isV6 ? ipv6ToBuffer(node.ip) : ipv4ToBuffer(node.ip)
    ipBuf.copy(body, off + 8)
    body.writeUInt16BE(node.port, off + 8 + (isV6 ? 16 : 4))
    node.id.copy(body, off + 32)
  })

  return Buffer.concat([header, body])
}

/**
 * 若路由表文件不存在，解析引导节点并预写一份
 * @param {string} filePath dht.dat / dht6.dat 路径
 * @param {boolean} isV6 是否为 IPv6
 * @returns {Promise<{created: boolean, nodes?: number, reason?: string}>}
 */
export const ensureDhtRoutingTable = async (filePath, isV6 = false) => {
  if (!filePath || existsSync(filePath)) {
    return { created: false, reason: 'exists' }
  }

  const resolveFn = isV6
    ? dns.promises.resolve6.bind(dns.promises)
    : dns.promises.resolve4.bind(dns.promises)

  const results = await Promise.allSettled(
    DHT_BOOTSTRAP_NODES.map(({ host, port }) =>
      withTimeout(resolveFn(host), DNS_TIMEOUT).then((addrs) =>
        (addrs || []).map((ip) => ({ ip, port }))
      )
    )
  )

  const seen = new Set()
  const nodes = []
  for (const r of results) {
    if (r.status !== 'fulfilled') {
      continue
    }
    for (const { ip, port } of r.value) {
      const key = `${ip}:${port}`
      if (seen.has(key) || nodes.length >= MAX_SEED_NODES) {
        continue
      }
      const valid = isV6 ? ipv6ToBuffer(ip) : ipv4ToBuffer(ip)
      if (!valid) {
        continue
      }
      seen.add(key)
      nodes.push({ ip, port, id: randomBytes(20) })
    }
  }

  if (nodes.length === 0) {
    return { created: false, reason: 'dns-failed' }
  }

  try {
    writeFileSync(filePath, buildDhtRoutingTableFile(nodes, isV6))
    return { created: true, nodes: nodes.length }
  } catch (e) {
    return { created: false, reason: e.message }
  }
}
