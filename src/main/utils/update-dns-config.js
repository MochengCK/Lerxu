import { readFileSync, writeFileSync } from 'node:fs'
import logger from '../core/Logger'
import { getOptimalDNSServers } from './dns-config'

/**
 * 更新 aria2 配置文件中的 DNS 服务器设置
 * @param {string} confPath - 配置文件路径
 * @param {Object} configManager - 配置管理器实例
 * @returns {Promise<boolean>} - 是否成功更新
 */
export async function updateDNSInConfig (confPath, configManager) {
  try {
    logger.info('[DNS] Updating DNS configuration in:', confPath)

    // 获取最优 DNS 服务器
    const dnsServers = await getOptimalDNSServers(configManager)

    // 如果返回 null，说明禁用了智能 DNS 或检测失败，跳过更新
    if (!dnsServers) {
      logger.info('[DNS] Skipping DNS update, using config file defaults')
      return true
    }

    logger.info('[DNS] Optimal DNS servers:', dnsServers)

    // 读取配置文件
    let content = readFileSync(confPath, 'utf8')

    // 检查是否已有 DNS 配置
    const dnsRegex = /async-dns-server=.+/
    const hasDNSConfig = dnsRegex.test(content)

    if (hasDNSConfig) {
      // 更新现有配置
      content = content.replace(dnsRegex, `async-dns-server=${dnsServers}`)
      logger.info('[DNS] Updated existing DNS configuration')
    } else {
      // 添加新配置（在 RPC 配置后）
      const dnsConfig = `\n\n################ DNS Configuration ################\n# 使用独立 DNS 服务器，避免被代理软件劫持\n# 根据地理位置自动选择最优 DNS\nasync-dns-server=${dnsServers}\n# 启用异步 DNS 解析\nasync-dns=true\n`

      // 在 File system 配置前插入
      if (content.includes('################ File system ################')) {
        content = content.replace(
          '################ File system ################',
          dnsConfig + '\n################ File system ################'
        )
        logger.info('[DNS] Added DNS configuration before File system section')
      } else {
        // 如果找不到合适位置，添加到文件末尾
        content += dnsConfig
        logger.info('[DNS] Added DNS configuration at end of file')
      }
    }

    if (/^async-dns=/m.test(content)) {
      content = content.replace(/^async-dns=.*/m, 'async-dns=true')
    } else {
      content = content.replace(
        `async-dns-server=${dnsServers}`,
        `async-dns-server=${dnsServers}\nasync-dns=true`
      )
    }

    // 写回配置文件
    writeFileSync(confPath, content, 'utf8')
    logger.info('[DNS] DNS configuration updated successfully')

    return true
  } catch (error) {
    logger.error('[DNS] Failed to update DNS configuration:', error.message)
    return false
  }
}

/**
 * 验证配置文件中的 DNS 设置
 * @param {string} confPath - 配置文件路径
 * @returns {object} - { hasDNS: boolean, dnsServers: string }
 */
export function verifyDNSConfig (confPath) {
  try {
    const content = readFileSync(confPath, 'utf8')
    const match = content.match(/async-dns-server=(.+)/)

    if (match) {
      return {
        hasDNS: true,
        dnsServers: match[1].trim()
      }
    }

    return {
      hasDNS: false,
      dnsServers: null
    }
  } catch (error) {
    logger.error('[DNS] Failed to verify DNS configuration:', error.message)
    return {
      hasDNS: false,
      dnsServers: null
    }
  }
}
