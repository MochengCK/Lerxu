import { net } from 'electron'
import { promises as dns } from 'node:dns'
import IP2Region from 'ip2region'
import logger from '../core/Logger'

// 初始化 ip2region 查询器
let ipSearcher = null
try {
  ipSearcher = new IP2Region()
  logger.info('[DNS] IP2Region initialized successfully')
} catch (error) {
  logger.warn('[DNS] Failed to initialize IP2Region:', error.message)
}

// DNS 服务器候选列表（按地区分组）
const DNS_CANDIDATES = {
  CN: [
    { name: 'AliDNS', server: '223.5.5.5', priority: 1 },
    { name: 'AliDNS2', server: '223.6.6.6', priority: 2 },
    { name: 'DNSPod', server: '119.29.29.29', priority: 3 },
    { name: 'Tencent', server: '183.60.83.19', priority: 4 }
  ],
  GLOBAL: [
    { name: 'Cloudflare', server: '1.1.1.1', priority: 1 },
    { name: 'Cloudflare2', server: '1.0.0.1', priority: 2 },
    { name: 'Google', server: '8.8.8.8', priority: 3 },
    { name: 'Google2', server: '8.8.4.4', priority: 4 },
    { name: 'Quad9', server: '9.9.9.9', priority: 5 }
  ]
}

// 测试域名（用于 DNS 速度测试）
const TEST_DOMAINS = {
  CN: [
    'www.baidu.com',
    'www.qq.com',
    'www.taobao.com'
  ],
  GLOBAL: [
    'www.google.com',
    'www.cloudflare.com',
    'www.github.com'
  ]
}

// 缓存检测结果
let cachedDNS = null
let cacheTimestamp = 0
const CACHE_DURATION = 6 * 60 * 60 * 1000 // 6小时

/**
 * 检查是否启用智能 DNS
 * @param {Object} configManager - 配置管理器实例
 * @returns {boolean}
 */
function isSmartDNSEnabled (configManager) {
  if (process.env.DISABLE_SMART_DNS === 'true') {
    return false
  }
  return configManager ? configManager.getUserConfig('enable-smart-dns', true) : true
}

/**
 * 测试单个 DNS 服务器的响应速度
 * @param {string} dnsServer - DNS 服务器地址
 * @param {string} testDomain - 测试域名
 * @returns {Promise<number>} 响应时间（毫秒），失败返回 Infinity
 */
async function resolveWithTimeout (resolver, domain, timeoutMs) {
  return Promise.race([
    resolver.resolve4(domain),
    new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout'))
      }, timeoutMs)
    })
  ])
}

async function testDNSSpeed (dnsServer, testDomains) {
  const resolver = new dns.Resolver()
  resolver.setServers([dnsServer])

  const results = []
  for (const domain of testDomains) {
    const startTime = Date.now()
    try {
      await resolveWithTimeout(resolver, domain, 2000)
      const responseTime = Date.now() - startTime
      results.push(responseTime)
    } catch (error) {
      logger.warn(`[DNS] ${dnsServer} failed to resolve ${domain}:`, error.message)
    }
  }

  if (results.length === 0) {
    return Infinity
  }

  results.sort((a, b) => a - b)
  const medianTime = results[Math.floor(results.length / 2)]
  logger.info(`[DNS] ${dnsServer} resolved ${results.length}/${testDomains.length} in ${medianTime}ms`)
  return medianTime
}

/**
 * 测试多个 DNS 服务器并返回最快的
 * @param {Array} dnsServers - DNS 服务器列表
 * @returns {Promise<Object>} 最快的 DNS 服务器信息
 */
async function findFastestDNS (dnsServers, testDomains) {
  logger.info('[DNS] Testing DNS servers speed...')

  const testPromises = dnsServers.map(async (dns) => {
    const avgTime = await testDNSSpeed(dns.server, testDomains)
    return {
      ...dns,
      responseTime: avgTime
    }
  })

  const testResults = await Promise.all(testPromises)

  // 按响应时间排序
  testResults.sort((a, b) => a.responseTime - b.responseTime)

  // 过滤掉失败的服务器
  const validResults = testResults.filter(r => r.responseTime !== Infinity)

  if (validResults.length === 0) {
    throw new Error('All DNS servers failed speed test')
  }

  logger.info('[DNS] Speed test results:', validResults.map(r =>
    `${r.name}(${r.server}): ${r.responseTime}ms`
  ).join(', '))

  return validResults
}

function getTestDomains (region) {
  return TEST_DOMAINS[region] || TEST_DOMAINS.GLOBAL
}

function selectBestRegionResult (primary, secondary) {
  if (primary && !secondary) return primary
  if (!primary && secondary) return secondary
  if (!primary && !secondary) return null

  if (secondary.score < primary.score) {
    return secondary
  }
  return primary
}

async function testRegionCandidates (region) {
  const candidates = DNS_CANDIDATES[region] || DNS_CANDIDATES.GLOBAL
  const testDomains = getTestDomains(region)
  const sortedDNS = await findFastestDNS(candidates, testDomains)
  const topDNS = sortedDNS.slice(0, 3)
  const dnsServers = topDNS.map(d => d.server).join(',')
  const score = topDNS.reduce((sum, item) => sum + item.responseTime, 0) / topDNS.length
  return {
    region,
    sortedDNS,
    topDNS,
    dnsServers,
    score
  }
}

/**
 * 获取本机公网 IP 地址
 * @returns {Promise<string>} IP 地址
 */
async function getPublicIP () {
  const apis = [
    'https://api.ipify.org?format=json',
    'https://api.ip.sb/ip',
    'https://ifconfig.me/ip'
  ]

  for (const apiUrl of apis) {
    try {
      logger.info(`[DNS] Trying to get public IP from: ${apiUrl}`)

      const result = await new Promise((resolve, reject) => {
        const request = net.request({ method: 'GET', url: apiUrl })
        let data = ''

        request.on('response', (response) => {
          response.on('data', (chunk) => { data += chunk.toString() })
          response.on('end', () => {
            try {
              // 尝试解析 JSON
              if (data.includes('{')) {
                const json = JSON.parse(data)
                resolve(json.ip || data.trim())
              } else {
                resolve(data.trim())
              }
            } catch (e) {
              resolve(data.trim())
            }
          })
        })

        request.on('error', reject)
        request.setTimeout(3000)
        request.on('timeout', () => {
          request.abort()
          reject(new Error('Timeout'))
        })

        request.end()
      })

      // 验证 IP 格式
      if (result && (result.match(/^\d+\.\d+\.\d+\.\d+$/) || result.includes(':'))) {
        logger.info(`[DNS] Got public IP: ${result}`)
        return result
      }
    } catch (error) {
      logger.warn(`[DNS] Failed to get IP from ${apiUrl}:`, error.message)
      continue
    }
  }

  throw new Error('Failed to get public IP from all APIs')
}

/**
 * 使用 ip2region 检测 IP 所在地区
 * @param {string} ip - IP 地址
 * @returns {string} 'CN' 或 'GLOBAL'
 */
function detectRegionByIP (ip) {
  if (!ipSearcher) {
    logger.warn('[DNS] IP2Region not initialized, defaulting to GLOBAL')
    return 'GLOBAL'
  }

  try {
    const result = ipSearcher.search(ip)
    logger.info(`[DNS] IP ${ip} location:`, result)

    // 检查国家字段
    if (result && result.country) {
      const country = result.country.toLowerCase()
      // 检查是否为中国（包括各种可能的表示）
      if (country.includes('中国') || country.includes('china') || country === 'cn') {
        logger.info('[DNS] Detected region: CN (China)')
        return 'CN'
      }
    }

    logger.info('[DNS] Detected region: GLOBAL')
    return 'GLOBAL'
  } catch (error) {
    logger.warn('[DNS] IP2Region search failed:', error.message)
    return 'GLOBAL'
  }
}

/**
 * 检测用户所在地区（使用专业 IP 库）
 * @returns {Promise<string>} 'CN' 或 'GLOBAL'
 */
async function detectRegion () {
  try {
    // 步骤1: 获取公网 IP
    const publicIP = await getPublicIP()

    // 步骤2: 使用 ip2region 离线库查询地区
    const region = detectRegionByIP(publicIP)

    return region
  } catch (error) {
    logger.warn('[DNS] Region detection failed:', error.message)
    // 失败时默认使用 GLOBAL
    return 'GLOBAL'
  }
}

/**
 * 获取最优 DNS 服务器配置（基于实际速度测试）
 * @param {Object} configManager - 配置管理器实例
 * @returns {Promise<string|null>} DNS 服务器列表，如果禁用则返回 null
 */
export async function getOptimalDNSServers (configManager) {
  try {
    // 检查是否启用智能 DNS
    if (!isSmartDNSEnabled(configManager)) {
      logger.info('[DNS] Smart DNS is disabled, using config file defaults')
      return null
    }

    // 检查缓存
    const now = Date.now()
    if (cachedDNS && (now - cacheTimestamp) < CACHE_DURATION) {
      logger.info('[DNS] Using cached DNS servers:', cachedDNS)
      return cachedDNS
    }

    logger.info('[DNS] Starting intelligent DNS selection...')

    const primaryRegion = await detectRegion()
    const secondaryRegion = primaryRegion === 'CN' ? 'GLOBAL' : 'CN'
    logger.info(`[DNS] Detected region: ${primaryRegion}`)

    let primaryResult = null
    let secondaryResult = null
    try {
      primaryResult = await testRegionCandidates(primaryRegion)
    } catch (error) {
      logger.warn(`[DNS] Primary region test failed (${primaryRegion}):`, error.message)
    }
    try {
      secondaryResult = await testRegionCandidates(secondaryRegion)
    } catch (error) {
      logger.warn(`[DNS] Secondary region test failed (${secondaryRegion}):`, error.message)
    }

    const selected = selectBestRegionResult(primaryResult, secondaryResult)
    if (!selected) {
      throw new Error('All DNS servers failed speed test')
    }

    const dnsServers = selected.dnsServers
    logger.info(`[DNS] Selected optimal DNS servers (${selected.region}): ${dnsServers}`)
    logger.info(`[DNS] Performance: ${selected.topDNS.map(d => `${d.name}=${d.responseTime}ms`).join(', ')}`)

    // 缓存结果
    cachedDNS = dnsServers
    cacheTimestamp = now

    return dnsServers
  } catch (error) {
    logger.error('[DNS] Failed to get optimal DNS servers:', error.message)
    logger.info('[DNS] Falling back to config file defaults')
    return null
  }
}

/**
 * 清除缓存的 DNS 配置（用于测试或强制重新检测）
 */
export function clearDNSCache () {
  cachedDNS = null
  cacheTimestamp = 0
  logger.info('[DNS] DNS cache cleared')
}

/**
 * 获取当前缓存的 DNS 服务器
 * @returns {string|null}
 */
export function getCachedDNS () {
  return cachedDNS
}

/**
 * 手动测试并选择最优 DNS（供用户手动触发）
 * @param {Object} configManager - 配置管理器实例
 * @returns {Promise<Object>} 测试结果
 */
export async function manualDNSTest (configManager) {
  try {
    // 清除缓存以强制重新测试
    clearDNSCache()

    const region = await detectRegion()
    const candidates = DNS_CANDIDATES[region] || DNS_CANDIDATES.GLOBAL
    const testDomains = getTestDomains(region)
    const sortedDNS = await findFastestDNS(candidates, testDomains)

    return {
      success: true,
      region,
      results: sortedDNS.map(d => ({
        name: d.name,
        server: d.server,
        responseTime: d.responseTime,
        status: d.responseTime === Infinity ? 'failed' : 'success'
      })),
      selected: sortedDNS.slice(0, 3).map(d => d.server).join(',')
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}
