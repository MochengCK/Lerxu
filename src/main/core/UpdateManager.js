import { EventEmitter } from 'node:events'
import { createWriteStream, createReadStream, unlinkSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { resolve, basename, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { exec } from 'node:child_process'
import { app, session } from 'electron'
import axios from 'axios'
import yaml from 'js-yaml'
import semver from 'semver'

import logger from './LogManager'

const pipe = promisify(pipeline)
const execAsync = promisify(exec)

// 配置
const GITHUB_OWNER = 'MochengCK'
const GITHUB_REPO = 'LinkCore'
const CURRENT_VERSION = app.getVersion()

// GitHub 镜像列表，按优先级排序
const MIRROR_HOSTS = [
  'ghproxy.net',
  'ghproxy.com',
  'mirror.ghproxy.com',
  'gh.ddlc.top',
  'github.moeyy.xyz'
]

/**
 * 构建 latest.yml 的下载 URL 列表（优先平台特定 YML，再通用 YML）
 * 稳定渠道：固定从 releases/latest 拉取（electron-builder 的 latest.yml
 * 永远指向最新正式版，即使存在 pre-release 也不包含）。
 */
function buildLatestYmlUrls () {
  const ymlNames = getYmlNames()
  const urls = []

  for (const ymlName of ymlNames) {
    // GitHub 直连
    urls.push(
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/${ymlName}`,
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${CURRENT_VERSION}/${ymlName}`
    )
    // 各镜像
    for (const host of MIRROR_HOSTS) {
      urls.push(`https://${host}/https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/${ymlName}`)
    }
  }
  return urls
}

/**
 * 构建指定 release tag 的 latest.yml 下载 URL 列表（beta/all 渠道用）。
 * tagName 形如 v3.0.1-beta.1。
 */
function buildTaggedYmlUrls (tagName) {
  const ymlNames = getYmlNames()
  const urls = []

  for (const ymlName of ymlNames) {
    urls.push(
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tagName}/${ymlName}`
    )
    for (const host of MIRROR_HOSTS) {
      urls.push(`https://${host}/https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tagName}/${ymlName}`)
    }
  }
  return urls
}

function getYmlNames () {
  const ymlNames = []
  // 优先平台特定的 YML 文件
  if (process.platform === 'darwin') {
    ymlNames.push('latest-mac.yml')
  } else if (process.platform === 'linux') {
    ymlNames.push('latest-linux.yml')
  }
  // 通用 YML 作为回退
  ymlNames.push('latest.yml')
  return ymlNames
}

/**
 * 从 GitHub Releases API 拉取 release 列表（含 pre-release 标志），
 * 供 beta/all 渠道挑选目标版本。
 *
 * api.github.com 未认证限流 60 次/小时（按出口 IP 共享），限流或不可达
 * 时依次降级：镜像代理的 API、GitHub 官网 releases.atom（含 pre-release、
 * 不含草稿，仅最近 10 条）、镜像代理的 Atom feed。Atom 不提供 prerelease
 * 标志，按版本号推断。结果缓存 5 分钟，避免频繁检查快速耗尽 API 配额。
 */
let _releaseListCache = { data: null, time: 0 }
const RELEASE_LIST_CACHE_TTL = 5 * 60 * 1000

function decodeXmlEntities (str) {
  return String(str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * 解析 GitHub releases.atom 为与 Releases API 兼容的 release 对象数组。
 * 解析失败（无有效 entry）返回空数组。
 */
function parseReleasesAtom (xml) {
  const releases = []
  const blocks = String(xml || '').split('<entry')
  for (let i = 1; i < blocks.length; i++) {
    const titleMatch = blocks[i].match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const updatedMatch = blocks[i].match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)
    const contentMatch = blocks[i].match(/<content[^>]*>([\s\S]*?)<\/content>/i)
    const tagName = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : ''
    if (!tagName) continue
    releases.push({
      tag_name: tagName,
      name: tagName,
      draft: false,
      // Atom 不提供 prerelease 标志，按版本号推断
      prerelease: isPrereleaseVersion(tagName),
      published_at: updatedMatch ? updatedMatch[1].trim() : '',
      body: contentMatch ? decodeXmlEntities(contentMatch[1]) : '',
      // 标记来源：Atom 仅含最近 10 条 release，stable 渠道挑 tag 时不
      // 信任它（可能漏掉更早的正式版），beta/all 只取最新预发布不受影响
      source: 'atom'
    })
  }
  return releases
}

async function fetchReleaseList (axiosConfig = {}) {
  if (_releaseListCache.data && Date.now() - _releaseListCache.time < RELEASE_LIST_CACHE_TTL) {
    return _releaseListCache.data
  }
  const apiUrls = [
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=50`,
    ...MIRROR_HOSTS.slice(0, 2).map(host => `https://${host}/https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=50`)
  ]
  const atomUrls = [
    `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases.atom`,
    ...MIRROR_HOSTS.slice(0, 3).map(host => `https://${host}/https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases.atom`)
  ]
  const config = {
    ...axiosConfig,
    timeout: 8000,
    maxRedirects: 5
  }
  let lastError = null
  for (const url of apiUrls) {
    try {
      const response = await axios.get(url, {
        ...config,
        headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'LinkCore-UpdateCheck' }
      })
      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        _releaseListCache = { data: response.data, time: Date.now() }
        return response.data
      }
    } catch (err) {
      lastError = err
      logger.warn(`[LinkCore] Releases API failed: ${url} - ${err.message}`)
    }
  }
  for (const url of atomUrls) {
    try {
      const response = await axios.get(url, {
        ...config,
        headers: { Accept: 'application/atom+xml, application/xml, text/xml, */*' }
      })
      if (response.status === 200 && typeof response.data === 'string') {
        const releases = parseReleasesAtom(response.data)
        if (releases.length > 0) {
          logger.info(`[LinkCore] Release list fetched via Atom feed: ${url} (${releases.length} entries)`)
          _releaseListCache = { data: releases, time: Date.now() }
          return releases
        }
      }
    } catch (err) {
      lastError = err
      logger.warn(`[LinkCore] Releases Atom feed failed: ${url} - ${err.message}`)
    }
  }
  if (lastError) {
    throw lastError
  }
  return null
}

/**
 * 按渠道挑选目标 release，渠道语义严格隔离：
 * - stable：只挑正式版（非 pre-release、非草稿）——调用方已先过滤；
 * - beta：只挑 GitHub 标记为 pre-release 的 release（官方 Beta 标识）；
 * - all：任意 release（含 pre-release），取版本最高。
 * 返回 { tagName, prerelease, version }，无可用 release 时返回 null。
 */
function pickReleaseByChannel (releases, channel) {
  if (!Array.isArray(releases) || releases.length === 0) {
    return null
  }
  const clean = (r) => semver.clean(r.tag_name || r.name || '') || '0.0.0'
  let pool = releases
  if (channel === 'beta') {
    // Beta 渠道只认 pre-release（GitHub 官方 Beta 标识）：
    // 正式版发布后仍只推送最新 Beta，用户想升正式版需切换 stable 渠道
    pool = releases.filter(r => r.prerelease && !r.draft)
  }
  if (pool.length === 0) {
    return null
  }
  pool = pool.filter(r => !r.draft)
  // GitHub tag 大小写敏感（v3.0.2-Beta2 与 v3.0.2-beta.1 可能并存），
  // 排序前统一小写，避免 semver 大小写敏感导致挑错版本
  pool.sort((a, b) => {
    const va = clean(a).toLowerCase()
    const vb = clean(b).toLowerCase()
    return semver.gt(vb, va) ? 1 : -1
  })
  const best = pool[0]
  if (!best) {
    return null
  }
  const tagName = best.tag_name
  return {
    tagName,
    prerelease: !!best.prerelease,
    version: clean(best) || (tagName || '').replace(/^v/, ''),
    publishedAt: best.published_at || ''
  }
}

/**
 * 获取发行说明（从 GitHub Releases API 或镜像）
 * preferExactTag=true（beta/all 渠道）时只查 tags/v{version}，避免
 * releases/latest 返回正式版说明与 beta 版本号不匹配。
 */
async function fetchReleaseNotes (version, axiosConfig = {}, preferExactTag = false) {
  const apiUrls = preferExactTag
    ? [`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/v${version}`]
    : [
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/v${version}`
    ]

  const config = {
    timeout: 15000,
    headers: { Accept: 'application/vnd.github.v3+json' },
    maxRedirects: 5,
    ...axiosConfig
  }

  for (const url of apiUrls) {
    try {
      logger.info(`[LinkCore] Fetching release notes: ${url}`)
      const response = await axios.get(url, config)
      if (response.data && response.data.body) {
        logger.info('[LinkCore] Release notes fetched successfully')
        return response.data.body
      }
    } catch (err) {
      logger.warn(`[LinkCore] Release notes fetch failed: ${url} - ${err.message}`)
      continue
    }
  }

  // API 限流/不可达时降级到 releases.atom：按版本号（忽略大小写与
  // 前导 v）匹配对应 entry 的正文。
  try {
    const atomUrls = [
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases.atom`,
      ...MIRROR_HOSTS.slice(0, 3).map(host => `https://${host}/https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases.atom`)
    ]
    const target = String(version || '').trim().toLowerCase().replace(/^v/, '')
    for (const url of atomUrls) {
      try {
        const response = await axios.get(url, { ...config, timeout: 8000 })
        if (response.status !== 200 || typeof response.data !== 'string') continue
        const entry = parseReleasesAtom(response.data)
          .find(e => e.tag_name && e.tag_name.toLowerCase().replace(/^v/, '') === target)
        if (entry && entry.body) {
          logger.info(`[LinkCore] Release notes fetched via Atom feed: ${url}`)
          return entry.body
        }
      } catch (err) {
        logger.warn(`[LinkCore] Release notes Atom feed failed: ${url} - ${err.message}`)
      }
    }
  } catch (_) {}

  return `See the full release notes at:\nhttps://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version}`
}

/**
 * 尝试从多个 URL 获取内容，返回最先成功的
 */
async function fetchFromMirrors (urls, axiosConfig = {}) {
  let lastError = null
  for (const url of urls) {
    try {
      logger.info(`[LinkCore] Trying: ${url}`)
      const response = await axios.get(url, {
        timeout: 15000,
        responseType: 'text',
        maxRedirects: 5,
        ...axiosConfig
      })
      if (response.status === 200) {
        logger.info(`[LinkCore] Success: ${url}`)
        return { data: response.data, url }
      }
    } catch (err) {
      lastError = err
      logger.warn(`[LinkCore] Failed: ${url} - ${err.message}`)
      continue
    }
  }
  throw lastError || new Error('All URLs failed')
}

/**
 * 解析 latest.yml
 */
function parseUpdateInfo (ymlContent) {
  const doc = yaml.load(ymlContent)
  if (!doc || !doc.version) {
    throw new Error('Invalid latest.yml: missing version')
  }

  const files = (doc.files || []).map(f => ({
    url: f.url || '',
    sha512: f.sha512 || '',
    size: f.size || 0
  }))

  // 提取 releaseDate
  let releaseDate = doc.releaseDate || ''
  if (!releaseDate && doc.path) {
    // 某些格式的兼容
    releaseDate = ''
  }

  return {
    version: doc.version,
    files,
    path: doc.path || '',
    sha512: doc.sha512 || '',
    releaseDate,
    releaseNotes: doc.releaseNotes || ''
  }
}

/**
 * 版本号规范化：优先完整 semver（clean 保留 pre-release 标签，
 * 如 3.0.2-Beta1 → 3.0.2-Beta1），clean 失败时退回 coerce（兼容
 * 非标准写法）。GitHub tag 大小写敏感（v3.0.2-Beta2 与 v3.0.2-beta2
 * 可能是不同 release），yml version 与 package.json 版本大小写也
 * 可能不一致，比较前统一小写避免误判。
 */
function normalizeVersion (version) {
  const cleaned = semver.clean(String(version || '').trim())
  if (cleaned) {
    return cleaned.toLowerCase()
  }
  const coerced = semver.coerce(version)
  return coerced ? coerced.version : '0.0.0'
}

/**
 * 比较版本号，返回 true 表示有新版本。
 * 保留完整 pre-release 语义：3.0.2-Beta1 < 3.0.2-Beta2 < 3.0.2。
 * 注意不能用 coerce 比较 —— coerce 会把三个版本全部折叠成 3.0.2，
 * 导致 Beta1/Beta2 用户永远检测不到正式版 3.0.2 的升级。
 */
function isNewerVersion (latest, current) {
  try {
    return semver.gt(normalizeVersion(latest), normalizeVersion(current))
  } catch {
    return latest !== current
  }
}

/**
 * 判断版本号是否带 pre-release 标识（beta/alpha/rc/pre/test/nightly 等）。
 * stable 渠道用它硬性排除预发布版本，保证稳定版渠道只提示正式版。
 */
function isPrereleaseVersion (version) {
  return /[-.](beta|alpha|rc|pre|test|nightly)[.-]?\d*$/i.test(String(version || ''))
}

/**
 * 验证文件 SHA512
 */
function verifySha512 (filePath, expectedSha512) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => {
      const actual = hash.digest('base64')
      resolve(actual === expectedSha512)
    })
    stream.on('error', reject)
  })
}

/**
 * 解析 Electron session.resolveProxy() 的返回值，如
 * "PROXY 127.0.0.1:7890;DIRECT" / "HTTPS proxy.example.com:443" /
 * "SOCKS5 127.0.0.1:1080" / "DIRECT"。
 * 返回 { protocol, host, port }；无可用代理（DIRECT/未知）返回 null。
 */
function parseProxyString (proxyString) {
  if (!proxyString || typeof proxyString !== 'string') return null
  const parts = String(proxyString).split(';')
  for (const part of parts) {
    const m = part.trim().match(/^(PROXY|HTTPS|SOCKS4|SOCKS5)\s+([^:\s]+):(\d+)$/i)
    if (!m) continue
    const type = m[1].toLowerCase()
    return {
      // axios 的 proxy.protocol 支持 http/https/socks4/socks5
      protocol: type === 'proxy' ? 'http' : type,
      host: m[2],
      port: parseInt(m[3], 10)
    }
  }
  return null
}

export default class UpdateManager extends EventEmitter {
  constructor (options = {}) {
    super()
    this.options = options

    this.isChecking = false
    this.isDownloading = false
    this._downloadAborted = false
    this._cancelSource = null
    this._currentProgress = null
    this._proxyConfig = null
    // 系统代理（mode: system）解析结果缓存，由 _refreshSystemProxy() 更新
    this._systemProxy = null
    this._isInstalling = false
    this._beforeInstallCallback = null
    // 最近一次 check 失败的错误信息（downloadUpdate 重检时用于区分
    // "检查失败" 与 "已是最新版本"，避免误导性报错）
    this._lastCheckError = null

    // 存储更新信息
    this._updateInfo = null
    this._downloadUrl = null
    this._downloadSha512 = null
    this._downloadSize = 0
    this._downloadedFile = null
    this._downloadedFileType = null // 'dmg', 'zip', 'exe', 'appimage'

    this.autoCheckData = {
      checkEnable: this.options.autoCheck,
      userCheck: false
    }
    this._autoCheckTimer = null

    logger.info('[LinkCore] UpdateManager initialized')
    this.init()
  }

  /**
   * 设置代理配置
   */
  setupProxy (proxyConfig) {
    this._proxyConfig = proxyConfig
  }

  /**
   * 获取 axios 配置（包含代理设置）
   */
  _getAxiosConfig (extraConfig = {}) {
    const config = {
      timeout: 15000,
      maxRedirects: 5,
      ...extraConfig
    }

    try {
      // 优先使用传入的代理配置，否则从全局配置获取
      let proxy = this._proxyConfig
      if (!proxy) {
        const cfg = global.application?.configManager
        if (cfg) {
          proxy = cfg.getUserConfig('proxy')
        }
      }

      if (proxy) {
        const { mode, server, port, username, password } = proxy
        if (mode === 'custom' && server) {
          // 完整解析 [http://][USER:PASSWORD@]HOST[:PORT] 格式的代理地址。
          // 之前只剥掉协议头，未处理 host:port，用户按提示填 127.0.0.1:7890
          // 时 host 会变成 "127.0.0.1:7890" 且端口恒为 80，导致所有请求失败。
          let raw = `${server}`.trim()
          let proxyProtocol = 'http'
          const protocolMatch = raw.match(/^(https?):\/\//i)
          if (protocolMatch) {
            proxyProtocol = protocolMatch[1].toLowerCase()
            raw = raw.slice(protocolMatch[0].length)
          }
          let proxyUsername = username
          let proxyPassword = password || ''
          const authMatch = raw.match(/^([^:@/]+):([^@/]*)@/)
          if (authMatch) {
            try {
              proxyUsername = proxyUsername || decodeURIComponent(authMatch[1])
              proxyPassword = proxyPassword || decodeURIComponent(authMatch[2] || '')
            } catch (_) {
              proxyUsername = proxyUsername || authMatch[1]
              proxyPassword = proxyPassword || authMatch[2] || ''
            }
            raw = raw.slice(authMatch[0].length)
          }
          let proxyHost = raw
          let proxyPort = port || (proxyProtocol === 'https' ? 443 : 80)
          const hostPortMatch = raw.match(/^([^:/]+):(\d+)$/)
          if (hostPortMatch) {
            proxyHost = hostPortMatch[1]
            proxyPort = parseInt(hostPortMatch[2], 10)
          } else if (raw.includes(':')) {
            // 无法识别的多余端口/异常片段，取第一个冒号前的主机部分
            proxyHost = raw.split(':')[0]
          }
          config.proxy = {
            protocol: proxyProtocol,
            host: proxyHost,
            port: proxyPort
          }
          if (proxyUsername) {
            config.proxy.auth = {
              username: proxyUsername,
              password: proxyPassword
            }
          }
          logger.info(`[LinkCore] Using custom proxy: ${proxyProtocol}://${proxyHost}:${proxyPort}`)
        } else if (mode === 'system') {
          // 系统代理：axios 不会自动读取 macOS/Windows 系统偏好设置里的
          // 代理，必须用 Electron session.resolveProxy() 解析后显式设置。
          // 开启系统代理时应优先走系统代理，而不是直连。
          if (this._systemProxy) {
            if (this._systemProxy.protocol.startsWith('socks')) {
              // axios 1.x 不支持 socks protocol，需 socks-proxy-agent 自定义 agent
              try {
                const SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent
                const agent = new SocksProxyAgent(`socks${this._systemProxy.protocol === 'socks4' ? '4' : '5'}://${this._systemProxy.host}:${this._systemProxy.port}`)
                config.httpAgent = agent
                config.httpsAgent = agent
                logger.info(`[LinkCore] Using system SOCKS proxy: ${this._systemProxy.protocol}://${this._systemProxy.host}:${this._systemProxy.port}`)
              } catch (e) {
                logger.warn(`[LinkCore] socks-proxy-agent unavailable, system SOCKS proxy skipped: ${e.message}`)
              }
            } else {
              config.proxy = {
                protocol: this._systemProxy.protocol,
                host: this._systemProxy.host,
                port: this._systemProxy.port
              }
              logger.info(`[LinkCore] Using system proxy: ${this._systemProxy.protocol}://${this._systemProxy.host}:${this._systemProxy.port}`)
            }
          } else {
            logger.warn('[LinkCore] System proxy not resolved, requests will go direct')
          }
        } else if (mode === 'none') {
          // 显式禁用代理：axios 1.x 默认会读取 HTTP_PROXY/HTTPS_PROXY
          // 环境变量（代理软件常设置），用户选择"不使用代理"时应强制直连
          config.proxy = false
        }
      }
    } catch (_) {}

    return config
  }

  /**
   * 解析系统代理（mode: system）并缓存，供 _getAxiosConfig 使用。
   * 用 Electron session.resolveProxy()（跨平台读取系统代理配置），
   * 仅当配置的代理模式为 system 时生效。
   */
  async _refreshSystemProxy () {
    try {
      let proxy = this._proxyConfig
      if (!proxy) {
        const cfg = global.application?.configManager
        if (cfg) {
          proxy = cfg.getUserConfig('proxy')
        }
      }
      this._systemProxy = null
      if (!proxy || proxy.mode !== 'system') return
      const ses = session.defaultSession
      if (!ses || typeof ses.resolveProxy !== 'function') return
      const result = await ses.resolveProxy('https://github.com/')
      this._systemProxy = parseProxyString(result)
      if (this._systemProxy) {
        logger.info(`[LinkCore] System proxy resolved: ${result}`)
      } else {
        logger.info(`[LinkCore] System proxy resolved as DIRECT/unsupported: ${result}`)
      }
    } catch (err) {
      logger.warn(`[LinkCore] Failed to resolve system proxy: ${err.message}`)
      this._systemProxy = null
    }
  }

  /**
   * 系统代理是否已解析且当前代理模式为 system。
   * 用于决定下载 URL 顺序：系统代理生效时 GitHub 直连（走代理）最优先。
   */
  _isSystemProxyActive () {
    if (!this._systemProxy) return false
    try {
      let proxy = this._proxyConfig
      if (!proxy) {
        const cfg = global.application?.configManager
        if (cfg) {
          proxy = cfg.getUserConfig('proxy')
        }
      }
      return !!(proxy && proxy.mode === 'system')
    } catch (_) {
      return false
    }
  }

  setAutoCheckEnabled (enabled) {
    const next = !!enabled
    const prev = !!this.autoCheckData.checkEnable
    this.autoCheckData.checkEnable = next

    if (next) {
      this.startAutoCheckTimer()
      if (!prev && !this.isChecking) {
        this.autoCheckData.userCheck = false
        this.check()
      }
    } else {
      this.stopAutoCheckTimer()
    }
  }

  startAutoCheckTimer () {
    this.stopAutoCheckTimer()
    if (!this.autoCheckData.checkEnable) return
    const intervalMs = 60 * 60 * 1000
    this._autoCheckTimer = setInterval(() => {
      if (!this.autoCheckData.checkEnable) return
      if (this.isChecking) return
      const cfg = global.application?.configManager
      if (cfg && cfg.getUserConfig('update-available')) {
        // 持久化的"有新版本"可能已过期（例如用户已手动升级到该版本），
        // 若保存的新版本号不再大于当前版本则清除残留状态并继续检查；
        // 否则跳过本次自动检查（已有待下载的新版本，无需反复检查）。
        const savedVersion = cfg.getUserConfig('new-version')
        if (!savedVersion || !isNewerVersion(savedVersion, CURRENT_VERSION)) {
          logger.info(`[LinkCore] Clearing stale update-available state (${savedVersion || 'none'}), resuming auto check`)
          cfg.setUserConfig({ 'update-available': false, 'new-version': '', 'release-notes': '' })
        } else {
          return
        }
      }
      this.autoCheckData.userCheck = false
      this.check()
    }, intervalMs)
    if (this._autoCheckTimer?.unref) this._autoCheckTimer.unref()
  }

  stopAutoCheckTimer () {
    if (this._autoCheckTimer) {
      clearInterval(this._autoCheckTimer)
      this._autoCheckTimer = null
    }
  }

  init () {
    if (this.autoCheckData.checkEnable && !this.isChecking) {
      this.autoCheckData.userCheck = false
      this.check()
    }
    if (this.autoCheckData.checkEnable) {
      this.startAutoCheckTimer()
    }
  }

  // ===== 检测更新 =====

  async check () {
    if (this.isChecking) return
    // 每次检查前刷新系统代理（用户可能随时切换代理模式/代理软件）
    await this._refreshSystemProxy()
    this.isChecking = true
    this._lastCheckError = null
    this._notifyWindows('checking-for-update')
    this.emit('checking')

    try {
      const axiosConfig = this._getAxiosConfig()

      // 读取更新渠道：stable（正式版）/ beta（最新预发布）/ all（全部取最新）。
      // 兼容历史默认值 'latest'（视为 stable）。读取失败时退回 stable。
      let channel = 'stable'
      try {
        const cfg = global.application?.configManager
        if (cfg && typeof cfg.getUserConfig === 'function') {
          const raw = cfg.getUserConfig('update-channel')
          if (raw === 'beta' || raw === 'all') {
            channel = raw
          }
        }
      } catch (e) {
        logger.warn(`[LinkCore] Failed to read update-channel, fallback to stable: ${e.message}`)
      }

      let urls
      let channelPrerelease = false
      let releaseListAvailable = true
      try {
        const releases = await fetchReleaseList(axiosConfig)
        releaseListAvailable = Array.isArray(releases) && releases.length > 0
        if (channel === 'beta' || channel === 'all') {
          // beta/all 渠道：先从 Releases API 挑目标 release（GitHub 的
          // prerelease 标志即官方 Beta 标识），再下载对应 tag 的 latest.yml。
          const pick = pickReleaseByChannel(releases, channel)
          if (pick && pick.tagName) {
            urls = buildTaggedYmlUrls(pick.tagName)
            channelPrerelease = !!pick.prerelease
            logger.info(`[LinkCore] Update channel "${channel}" targeting ${pick.tagName} (prerelease=${pick.prerelease})`)
          }
        } else if (channel === 'stable') {
          // stable 渠道：显式挑选最新正式版（非 pre-release、非草稿），
          // 与 releases/latest 语义一致；即使 releases/latest 或镜像
          // 返回了 pre-release 的 yml 也不会被选中。仅信任 API 返回的
          // 完整列表（Atom 只有最近 10 条，可能漏掉更新的正式版）。
          const stableReleases = (releases || []).filter(r => r.source !== 'atom' && !r.prerelease && !r.draft)
          const pick = pickReleaseByChannel(stableReleases, 'stable')
          if (pick && pick.tagName) {
            urls = buildTaggedYmlUrls(pick.tagName)
            logger.info(`[LinkCore] Update channel "stable" targeting ${pick.tagName}`)
          }
        }
      } catch (err) {
        releaseListAvailable = false
        logger.warn(`[LinkCore] Channel "${channel}" release lookup failed, falling back to default URLs: ${err.message}`)
      }
      if (!urls) {
        // beta/all 渠道拿不到发布列表时（API 限流/网络异常），回退到
        // releases/latest 只能拿到正式版 yml，会被下方渠道守卫拒绝并
        // 误报"已是最新版本"，导致 Beta 用户永远漏掉新 Beta——这里直接
        // 报错，把真实原因呈现给用户而不是假装没有新版本。
        if (!releaseListAvailable && (channel === 'beta' || channel === 'all')) {
          throw new Error('Unable to fetch the GitHub release list (API rate limited or network error), cannot check for updates on this channel')
        }
        urls = buildLatestYmlUrls()
      }

      const { data: ymlContent } = await fetchFromMirrors(urls, axiosConfig)
      const info = parseUpdateInfo(ymlContent)
      if (info.version && info.version.toLowerCase().includes('beta') && !channelPrerelease) {
        // 兜底：即使 tag 选择偏差，也记录真实类型供前端展示
        channelPrerelease = true
      }

      // stable 渠道硬性排除 pre-release：无论 yml 来自哪条 URL
      // （releases/latest 异常、镜像缓存错乱、tag 大小写偏差），
      // 只要版本号带 pre-release 标识就不提示更新，
      // 保证稳定版渠道永远只看到正式版。
      if (channel === 'stable' && isPrereleaseVersion(info.version)) {
        logger.info(`[LinkCore] Stable channel ignored pre-release yml version: ${info.version}`)
        this.isChecking = false
        this._notifyWindows('update-not-available')
        this.emit('update-not-available', info)
        this._saveCheckResult(false, '')
        return
      }

      // beta 渠道对称地只认 pre-release：即使 yml 来自兜底 URL
      // （如 releases/latest 返回正式版、release 漏勾 Pre-release 标志），
      // 只要版本号不带 pre-release 标识就不提示更新，
      // 保证 Beta 渠道永远只看到测试版；想升级正式版请切换 stable 渠道。
      if (channel === 'beta' && !isPrereleaseVersion(info.version)) {
        logger.info(`[LinkCore] Beta channel ignored stable yml version: ${info.version}`)
        this.isChecking = false
        this._notifyWindows('update-not-available')
        this.emit('update-not-available', info)
        this._saveCheckResult(false, '')
        return
      }

      // 版本比较：所有渠道统一用完整 semver（保留 pre-release 标签语义）。
      // stable 渠道同样适用 —— coerce 会把 3.0.2-Beta1 / 3.0.2-Beta2 /
      // 3.0.2 全部折叠成 3.0.2，导致 Beta 用户检测不到正式版升级；
      // 且 stable 渠道已在上方用 isPrereleaseVersion 排除了远端 pre-release，
      // 这里只会拿到正式版 yml，与当前 Beta 版本比较时
      // semver.gt('3.0.2', '3.0.2-beta1') 为 true，升级可被正确识别。
      const newer = isNewerVersion(info.version, CURRENT_VERSION)

      if (!newer) {
        this.isChecking = false
        this._notifyWindows('update-not-available')
        this.emit('update-not-available', info)
        this._saveCheckResult(false, '')
        return
      }

      // 找到适合当前平台和架构的文件，并设置下载信息
      if (!this._applyUpdateInfo(info)) {
        throw new Error(`No matching file found for ${process.platform}/${process.arch} in release v${info.version}`)
      }

      // 获取发行说明（latest.yml 中不包含，需从 GitHub API 获取）
      let releaseNotes = info.releaseNotes || ''
      if (!releaseNotes) {
        releaseNotes = await fetchReleaseNotes(info.version, axiosConfig, channel !== 'stable')
      }
      this.isChecking = false
      // 第三参标识该更新是否为预发布版（Beta），供前端 UI 展示徽标
      this._notifyWindows('update-available', info.version, releaseNotes, channelPrerelease)
      info.prerelease = channelPrerelease
      this.emit('update-available', info)
      this._saveCheckResult(true, info.version, releaseNotes)
    } catch (err) {
      this.isChecking = false
      const errMsg = err?.message || `${err}`
      this._lastCheckError = errMsg
      logger.warn(`[LinkCore] Check failed: ${errMsg}`)
      this._notifyWindows('update-error', errMsg)
      this.emit('update-error', err)
    }
  }

  // ===== 下载更新 =====

  /**
   * 根据 update info 选择当前平台/架构的安装包并设置下载状态。
   * 供 check()（新检查到更新）与 _restoreUpdateInfoFromConfig()（重启后恢复）复用。
   * @returns {boolean} true 表示已就绪；false 表示没有匹配当前平台的文件
   */
  _applyUpdateInfo (info) {
    const platform = process.platform // darwin, win32, linux
    const arch = process.arch // x64, arm64

    logger.info(`[LinkCore] Platform: ${platform}/${arch}, available files: ${info.files.map(f => f.url).join(', ')}`)

    let asset = null
    if (platform === 'darwin') {
      // macOS: 优先选择 ZIP（支持静默替换），其次是 DMG
      const allMacFiles = info.files.filter(f => {
        const name = (f.url || '').toLowerCase()
        return name.endsWith('.dmg') || name.endsWith('-mac.zip') || name.endsWith('.zip') || name.includes('darwin') || name.includes('mac')
      })

      // 优先找 ZIP 文件（静默安装），按架构匹配
      const zipFiles = allMacFiles.filter(f => {
        const name = (f.url || '').toLowerCase()
        return name.endsWith('-mac.zip') || name.endsWith('.zip')
      })
      const dmgFiles = allMacFiles.filter(f => (f.url || '').toLowerCase().endsWith('.dmg'))

      // 按架构匹配函数
      const matchArch = (files, targetArch) => {
        return files.find(f => {
          const name = (f.url || '').toLowerCase()
          if (targetArch === 'arm64') return name.includes('arm64') || name.includes('aarch64')
          if (targetArch === 'x64') return name.includes('x64') || name.includes('amd64') || (!name.includes('arm64') && !name.includes('aarch64'))
          return false
        })
      }

      // 优先使用 ZIP（静默安装）
      asset = matchArch(zipFiles, arch)
      if (!asset && zipFiles.length > 0) {
        asset = zipFiles[0]
        logger.warn(`[LinkCore] No ${arch} ZIP found, falling back to first ZIP: ${asset.url}`)
      }

      // 如果没有 ZIP，再尝试 DMG
      if (!asset) {
        asset = matchArch(dmgFiles, arch)
        if (!asset && dmgFiles.length > 0) {
          asset = dmgFiles[0]
          logger.warn(`[LinkCore] No ${arch} DMG found, falling back to first DMG: ${asset.url}`)
        }
      }

      // 最后回退到任意 macOS 文件
      if (!asset && allMacFiles.length > 0) {
        asset = allMacFiles[0]
        logger.warn(`[LinkCore] No matching mac file found, falling back to: ${asset.url}`)
      }
    } else if (platform === 'win32') {
      asset = info.files.find(f => (f.url || '').toLowerCase().endsWith('.exe'))
    } else if (platform === 'linux') {
      asset = info.files.find(f => (f.url || '').toLowerCase().endsWith('.appimage'))
    }

    if (!asset) {
      logger.warn(`[LinkCore] No matching file found for ${platform}/${arch} in release v${info.version}. Files: ${info.files.map(f => f.url).join(', ')}`)
      return false
    }

    // YML 中的文件 URL 是相对路径，需要构建为完整的 GitHub 下载 URL
    const filename = asset.url
    const downloadBase = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${info.version}`
    const fullDownloadUrl = filename.startsWith('http') ? filename : `${downloadBase}/${filename}`

    // 检测文件类型
    const fn = filename.toLowerCase()
    let fileType = null
    if (fn.endsWith('.dmg')) fileType = 'dmg'
    else if (fn.endsWith('.exe')) fileType = 'exe'
    else if (fn.endsWith('.appimage')) fileType = 'appimage'
    else if (fn.endsWith('-mac.zip') || fn.endsWith('.zip')) fileType = 'zip'

    this._updateInfo = info
    this._downloadUrl = fullDownloadUrl
    this._downloadSha512 = asset.sha512 || info.sha512 || ''
    this._downloadSize = asset.size || 0
    this._downloadedFileType = fileType

    logger.info(`[LinkCore] Update available: ${info.version} (current: ${CURRENT_VERSION}), selected: ${filename}`)
    return true
  }

  /**
   * 构建下载 URL 列表（按可用性排序）：
   * 1. 系统代理生效时：GitHub 直连（走系统代理）最直接，排最前
   * 2. 用户配置的 GitHub 镜像（设置页镜像列表）
   * 3. 内置镜像列表
   * 4. GitHub 直连兜底（无系统代理时）
   */
  _buildDownloadUrls () {
    const originalUrl = this._downloadUrl || ''
    const match = originalUrl.match(/github\.com\/(.+)/)
    const ghPath = match ? match[1] : ''
    if (!ghPath) {
      return [originalUrl].filter(Boolean)
    }

    const useSystemProxy = this._isSystemProxyActive()
    const urls = []
    // 系统代理生效时：直连走代理，比镜像更快更稳
    if (useSystemProxy) {
      urls.push(originalUrl)
    }
    // 用户配置的镜像（Advanced 设置页 GitHub 镜像列表，host 格式如 ghproxy.net）
    try {
      const cfg = global.application?.configManager
      if (cfg && typeof cfg.getUserConfig === 'function') {
        const userMirrors = cfg.getUserConfig('github-mirror-urls') || cfg.getUserConfig('githubMirrorUrls') || []
        if (Array.isArray(userMirrors)) {
          for (const host of userMirrors) {
            if (host && typeof host === 'string') {
              const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/+$/, '')
              if (cleanHost) {
                urls.push(`https://${cleanHost}/https://github.com/${ghPath}`)
              }
            }
          }
        }
      }
    } catch (_) {}
    // 内置镜像
    for (const host of MIRROR_HOSTS) {
      urls.push(`https://${host}/https://github.com/${ghPath}`)
    }
    // 直连兜底（无系统代理时）
    if (!useSystemProxy) {
      urls.push(originalUrl)
    }
    // 去重
    return urls.filter((v, i) => urls.indexOf(v) === i)
  }

  async downloadUpdate () {
    if (this.isDownloading) return
    // 下载前刷新系统代理，保证走最新的系统代理配置
    await this._refreshSystemProxy()

    if (!this._downloadUrl || !this._updateInfo) {
      // 应用重启后内存中的 update info 会丢失，但前端"下载新版本"按钮
      // 是从持久化配置恢复的。先尝试从配置直接恢复，避免重新联网检查；
      // 恢复失败再重新检查。
      if (!this._restoreUpdateInfoFromConfig()) {
        logger.info('[LinkCore] No persisted update info, re-checking for updates before download...')
        this.autoCheckData.userCheck = true
        try {
          await this.check()
        } catch (err) {
          this._notifyWindows('update-error', 'Failed to check for updates: ' + err.message)
          return
        }
        if (!this._downloadUrl || !this._updateInfo) {
          // check() 失败时已在内部发过 update-error（含真实原因），这里补发
          // 一条驱动 downloadUpdate 的前端监听器收尾（清理"下载中"状态）。
          // 若 check 成功但无新版本（_lastCheckError 为空），提示已是最新，
          // 并同步发 update-not-available 让前端清除过期的"下载新版本"按钮。
          if (!this._lastCheckError) {
            this._notifyWindows('update-not-available')
            this.emit('update-not-available')
          }
          const msg = this._lastCheckError || 'You are already on the latest version'
          this._notifyWindows('update-error', msg)
          return
        }
      }
    }

    this.isDownloading = true
    this._downloadAborted = false
    this._currentProgress = { percent: 0, total: this._downloadSize || 0, transferred: 0 }
    this.emit('download-start')
    this._notifyWindows('download-start')

    const urls = this._buildDownloadUrls()
    const downloadAxiosConfig = this._getAxiosConfig({
      // 60 秒无数据超时（axios 的 timeout 是 socket 空闲超时，
      // 大文件持续有数据不会触发；无速度时能尽快切换下一个源，
      // 避免原 5 分钟超时导致用户长时间"无速度"）
      timeout: 60000,
      responseType: 'stream'
    })

    for (const url of urls) {
      if (this._downloadAborted) {
        this.isDownloading = false
        this.emit('update-cancelled')
        this._notifyWindows('update-cancelled')
        return
      }

      try {
        logger.info(`[LinkCore] Downloading: ${url}`)
        const tmpFile = resolve(tmpdir(), basename(url))

        // 清理旧文件
        if (existsSync(tmpFile)) {
          try { unlinkSync(tmpFile) } catch (_) {}
        }

        // 取消上一个请求的 CancelToken（若有残留）。
        // 注意：axios 1.x 的 `new CancelToken(executor)` 传给 executor 的
        // 参数是 cancel 函数本身（无 .cancel 属性），之前直接存 executor
        // 参数导致后续 `_cancelSource.cancel()` 抛
        // "cancel is not a function" —— 所有镜像 URL 被这个 bug 误杀。
        // 改用 CancelToken.source() 获取标准 { token, cancel } 结构。
        if (this._cancelSource) {
          try {
            this._cancelSource.cancel('Download canceled')
          } catch (_) {}
          this._cancelSource = null
        }
        const cancelSource = axios.CancelToken.source()
        this._cancelSource = cancelSource

        const { data: stream, headers } = await axios.get(url, {
          ...downloadAxiosConfig,
          cancelToken: cancelSource.token,
          // 不使用压缩传输，确保 content-length 是实际文件大小
          headers: {
            ...(downloadAxiosConfig.headers || {}),
            'Accept-Encoding': 'identity'
          }
        })

        // 优先使用 YML 中声明的大小，其次使用响应头中的大小
        const declaredSize = this._downloadSize || 0
        const headerSize = parseInt(headers['content-length'] || '0', 10)
        const totalSize = declaredSize > 0 ? declaredSize : headerSize
        let downloadedSize = 0
        let lastPercent = -1

        const writer = createWriteStream(tmpFile)
        stream.on('data', chunk => {
          downloadedSize += chunk.length
          if (!this._downloadAborted) {
            // 计算进度，不超过 99%（完成时再设为 100%）
            let percent = totalSize > 0 ? Math.floor((downloadedSize / totalSize) * 100) : 0
            if (percent > 99) percent = 99
            if (percent > lastPercent) {
              lastPercent = percent
              this._currentProgress = {
                percent,
                bytesPerSecond: 0,
                total: totalSize,
                transferred: downloadedSize
              }
              this.emit('download-progress', this._currentProgress)
              this._notifyWindows('download-progress', this._currentProgress)
            }
          }
        })

        await pipe(stream, writer)
        this._cancelSource = null

        if (this._downloadAborted) {
          try { unlinkSync(tmpFile) } catch (_) {}
          this.isDownloading = false
          this._currentProgress = null
          this.emit('update-cancelled')
          this._notifyWindows('update-cancelled')
          return
        }

        // 获取实际下载文件大小，发送 100% 进度
        let actualFileSize = downloadedSize
        try {
          const stats = statSync(tmpFile)
          actualFileSize = stats.size
        } catch (_) {}

        this._currentProgress = {
          percent: 100,
          bytesPerSecond: 0,
          total: totalSize || actualFileSize,
          transferred: actualFileSize
        }
        this.emit('download-progress', this._currentProgress)
        this._notifyWindows('download-progress', this._currentProgress)

        // 验证 SHA512
        if (this._downloadSha512) {
          logger.info('[LinkCore] Verifying SHA512...')
          const valid = await verifySha512(tmpFile, this._downloadSha512)
          if (!valid) {
            logger.warn(`[LinkCore] SHA512 mismatch for: ${url}`)
            try { unlinkSync(tmpFile) } catch (_) {}
            continue // 尝试下一个镜像
          }
          logger.info('[LinkCore] SHA512 verified')
        }

        // 下载成功，自动触发安装（用户已点击下载即表示确认）
        this.isDownloading = false
        this._currentProgress = null
        this._downloadedFile = tmpFile
        const data = {
          version: this._updateInfo.version,
          downloadedFile: tmpFile,
          fileType: this._downloadedFileType,
          releaseNotes: await fetchReleaseNotes(this._updateInfo.version, this._getAxiosConfig()).catch(() => '')
        }
        this.emit('update-downloaded', data)
        this._notifyWindows('update-downloaded', data)
        logger.info(`[LinkCore] Download complete: ${tmpFile}, type: ${this._downloadedFileType}, auto-installing...`)

        // 延迟一小段时间让UI更新后，自动执行安装
        setTimeout(() => {
          if (!this._isInstalling) {
            Promise.resolve(this.quitAndInstall()).catch((err) => {
              logger.error('[LinkCore] auto quitAndInstall failed:', err && err.message ? err.message : err)
            })
          }
        }, 500)
        return
      } catch (err) {
        if (axios.isCancel(err) || this._downloadAborted) {
          this.isDownloading = false
          this._currentProgress = null
          this.emit('update-cancelled')
          this._notifyWindows('update-cancelled')
          return
        }
        logger.warn(`[LinkCore] Download failed from ${url}: ${err.message}`)
      }
    }

    // 所有下载尝试都失败
    this.isDownloading = false
    this._currentProgress = null
    const errMsg = 'All download sources failed, please check your network connection'
    logger.warn(`[LinkCore] ${errMsg}`)
    this._notifyWindows('update-error', errMsg)
    this.emit('update-error', new Error(errMsg))
  }

  /**
   * 取消下载
   */
  cancelDownload () {
    this._downloadAborted = true
    if (this._cancelSource) {
      try {
        this._cancelSource.cancel('User canceled')
      } catch (_) {}
      this._cancelSource = null
    }
  }

  /**
   * 设置安装前回调（用于停止引擎等清理工作）
   */
  setBeforeInstallCallback (callback) {
    this._beforeInstallCallback = callback
  }

  /**
   * 退出并安装更新
   */
  async quitAndInstall () {
    if (!this._downloadedFile) {
      logger.warn('[LinkCore] No downloaded file to install')
      this._notifyWindows('update-error', 'No update file downloaded')
      return
    }

    const fileType = this._downloadedFileType
    const downloadedFile = this._downloadedFile

    logger.info(`[LinkCore] Starting install: ${downloadedFile} (${fileType})`)
    this._isInstalling = true

    try {
      this._notifyWindows('installing-update')
      this.emit('installing-update')

      // 执行安装前回调（停止引擎等）
      if (typeof this._beforeInstallCallback === 'function') {
        try {
          logger.info('[LinkCore] Running before-install callback...')
          await this._beforeInstallCallback()
          logger.info('[LinkCore] Before-install callback completed')
        } catch (err) {
          logger.warn('[LinkCore] Before-install callback error:', err.message)
        }
      }

      if (process.platform === 'darwin') {
        // macOS: 优先使用ZIP静默安装，DMG作为备选
        if (fileType === 'zip') {
          await this._installMacZip(downloadedFile)
        } else if (fileType === 'dmg') {
          await this._installDmg(downloadedFile)
        } else {
          await this._openFile(downloadedFile)
        }
      } else if (process.platform === 'win32') {
        await this._installExe(downloadedFile)
      } else {
        await this._installLinux(downloadedFile)
      }
    } catch (err) {
      this._isInstalling = false
      logger.error(`[LinkCore] Install failed: ${err.message}`)
      this._notifyWindows('update-error', `Install failed: ${err.message}`)
      this.emit('update-error', err)
    }
  }

  /**
   * macOS: 安装 DMG 文件
   */
  async _installDmg (dmgPath) {
    logger.info('[LinkCore] Installing DMG...')

    // 挂载 DMG
    const { stdout: attachOutput } = await execAsync(`hdiutil attach -nobrowse -noautoopen "${dmgPath}"`)
    logger.info(`[LinkCore] hdiutil attach output: ${attachOutput}`)

    // 解析挂载点（通常是 /Volumes/xxx）
    const mountMatch = attachOutput.match(/\/Volumes\/[^\n]+/)
    if (!mountMatch) {
      throw new Error('Could not find mounted volume')
    }
    const mountPoint = mountMatch[0].trim()
    logger.info(`[LinkCore] Mount point: ${mountPoint}`)

    try {
      // 在挂载点中查找 .app 文件
      const files = readdirSync(mountPoint)
      const appFile = files.find(f => f.endsWith('.app'))
      if (!appFile) {
        throw new Error('No .app file found in DMG')
      }

      const sourceApp = join(mountPoint, appFile)
      const targetApp = join('/Applications', appFile)

      logger.info(`[LinkCore] Copying ${sourceApp} to ${targetApp}`)

      // 如果目标已存在，先删除（需要权限，会提示用户输入密码）
      try {
        // 使用 ditto 复制（保留权限和符号链接）
        await execAsync(`ditto "${sourceApp}" "${targetApp}"`)
        logger.info('[LinkCore] App copied successfully')
      } catch (copyErr) {
        // 如果复制失败（可能是权限问题），使用 osascript 提示认证
        logger.warn(`[LinkCore] Copy failed, trying with privileges: ${copyErr.message}`)
        const script = `do shell script "ditto \\"${sourceApp}\\" \\"${targetApp}\\"" with administrator privileges`
        await execAsync(`osascript -e '${script}'`)
        logger.info('[LinkCore] App copied with admin privileges')
      }

      // 卸载 DMG
      try {
        await execAsync(`hdiutil detach "${mountPoint}" -quiet`)
      } catch (_) {}

      // 打开新版本
      logger.info('[LinkCore] Relaunching new version...')
      this._relaunchApp(targetApp)
    } catch (err) {
      // 确保卸载 DMG
      try {
        await execAsync(`hdiutil detach "${mountPoint}" -quiet -force`)
      } catch (_) {}
      throw err
    }
  }

  /**
   * macOS: 安装 ZIP 更新包（优先方案，静默安装）
   */
  async _installMacZip (zipPath) {
    logger.info('[LinkCore] Installing ZIP update (silent replace)...')
    const appPath = app.getAppPath()
    const appBundlePath = dirname(dirname(dirname(appPath))) // 从 app.asar 向上找 .app 包
    logger.info(`[LinkCore] Current app bundle: ${appBundlePath}`)

    const tmpExtractDir = join(tmpdir(), `linkcore-update-${Date.now()}`)
    mkdirSync(tmpExtractDir, { recursive: true })

    try {
      // 解压 ZIP
      await execAsync(`unzip -o -q "${zipPath}" -d "${tmpExtractDir}"`)

      // 查找解压后的 .app 文件
      const findApp = (dir) => {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory() && entry.name.endsWith('.app')) {
            return fullPath
          }
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const found = findApp(fullPath)
            if (found) return found
          }
        }
        return null
      }

      const newAppPath = findApp(tmpExtractDir)
      if (!newAppPath) {
        throw new Error('No .app found in ZIP')
      }

      logger.info(`[LinkCore] New app: ${newAppPath}`)

      // 尝试静默替换（ditto保留权限和符号链接）
      try {
        await execAsync(`ditto "${newAppPath}" "${appBundlePath}"`)
        logger.info('[LinkCore] App replaced successfully with ditto')
      } catch (copyErr) {
        logger.warn(`[LinkCore] Silent copy failed, trying with privileges: ${copyErr.message}`)
        // 如果权限不足，提示用户输入密码进行认证
        const escapedSource = newAppPath.replace(/"/g, '\\"')
        const escapedTarget = appBundlePath.replace(/"/g, '\\"')
        const script = `do shell script "ditto \\"${escapedSource}\\" \\"${escapedTarget}\\"" with administrator privileges`
        await execAsync(`osascript -e '${script}'`)
        logger.info('[LinkCore] App replaced with admin privileges')
      }

      this._relaunchApp(appBundlePath)
    } finally {
      // 清理临时目录
      try {
        rmSync(tmpExtractDir, { recursive: true, force: true })
      } catch (_) {}
    }
  }

  /**
   * Windows: 安装 EXE 文件
   */
  async _installExe (exePath) {
    logger.info('[LinkCore] Installing EXE...')
    const { spawn } = require('node:child_process')
    spawn(exePath, ['/S', '--force-run'], {
      detached: true,
      stdio: 'ignore'
    }).unref()

    setTimeout(() => {
      app.exit(0)
    }, 500)
  }

  /**
   * Linux: 安装 AppImage
   */
  async _installLinux (filePath) {
    logger.info('[LinkCore] Installing Linux update...')
    const currentAppImage = process.env.APPIMAGE ? `${process.env.APPIMAGE}` : ''
    const fs = require('node:fs')
    const path = require('node:path')

    const ensureExecutable = (p) => {
      try { fs.chmodSync(p, 0o755) } catch (_) {}
    }

    const spawnDetached = (p) => {
      ensureExecutable(p)
      const { spawn } = require('node:child_process')
      const child = spawn(p, [], {
        detached: true,
        stdio: 'ignore',
        env: process.env
      })
      child.unref()
      setTimeout(() => app.exit(0), 500)
    }

    // 尝试替换当前 AppImage
    if (currentAppImage && fs.existsSync(currentAppImage) && fs.existsSync(filePath)) {
      try {
        fs.accessSync(path.dirname(currentAppImage), fs.constants.W_OK)
        fs.accessSync(currentAppImage, fs.constants.W_OK)
        fs.copyFileSync(filePath, currentAppImage)
        ensureExecutable(currentAppImage)
        logger.info('[LinkCore] AppImage replaced, relaunching...')
        spawnDetached(currentAppImage)
        return
      } catch (err) {
        logger.warn('[LinkCore] Cannot replace AppImage in-place:', err.message)
      }
    }

    // 回退：打开文件让用户手动处理
    await this._openFile(filePath)
  }

  /**
   * 通用：用系统默认程序打开文件
   */
  async _openFile (filePath) {
    const { shell } = require('electron')
    await shell.openPath(filePath)
    setTimeout(() => app.exit(0), 1000)
  }

  /**
   * 重新启动应用
   */
  _relaunchApp (appPath) {
    logger.info(`[LinkCore] Relaunching app: ${appPath}`)

    // 使用 open 命令启动应用，通过 shell 确保完全脱离当前进程
    // 使用双 fork 策略：先启动一个 shell 脚本，延迟打开应用，然后退出
    const relaunchScript = `
      nohup /bin/bash -c '
        # 等待父进程退出
        sleep 1
        # 打开应用
        open "${appPath}"
      ' >/dev/null 2>&1 &
      disown
    `

    try {
      const { exec } = require('node:child_process')
      exec(relaunchScript, {
        detached: true,
        stdio: 'ignore'
      }, (err) => {
        if (err) {
          logger.warn(`[LinkCore] Relaunch script failed, falling back to direct spawn: ${err.message}`)
          // 回退方案：直接 spawn open
          const { spawn } = require('node:child_process')
          const child = spawn('open', [appPath], {
            detached: true,
            stdio: 'ignore'
          })
          child.unref()
        }
      })
    } catch (err) {
      logger.warn(`[LinkCore] Relaunch error: ${err.message}`)
      // 最终回退
      const { spawn } = require('node:child_process')
      const child = spawn('open', [appPath], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    }

    // 延迟更长时间确保新应用启动后再退出
    setTimeout(() => {
      logger.info('[LinkCore] Exiting for update...')
      app.exit(0)
    }, 1500)
  }

  // ===== 内部方法 =====

  _saveCheckResult (available, version, releaseNotes) {
    if (global.application?.configManager) {
      // 合并为一次对象写入，避免逐 key set 导致整个 user.json 被重写 4 次
      const payload = {
        'update-available': available,
        'new-version': version || '',
        'last-check-update-time': Date.now(),
        'release-notes': available && releaseNotes ? releaseNotes : ''
      }
      if (available && this._updateInfo) {
        // 持久化完整更新信息，供应用重启后直接恢复下载（无需重新联网检查）
        payload['update-info'] = {
          version: this._updateInfo.version,
          path: this._updateInfo.path || '',
          sha512: this._updateInfo.sha512 || '',
          releaseDate: this._updateInfo.releaseDate || '',
          files: (this._updateInfo.files || []).map(f => ({
            url: f.url || '',
            sha512: f.sha512 || '',
            size: f.size || 0
          }))
        }
      } else {
        // undefined 触发 setUserConfig 删除该 key，避免残留过期更新信息
        payload['update-info'] = undefined
      }
      global.application.configManager.setUserConfig(payload)
    }
  }

  /**
   * 从持久化配置恢复上次检查到的更新信息（应用重启后内存状态丢失时用）。
   * @returns {boolean} 是否恢复成功
   */
  _restoreUpdateInfoFromConfig () {
    try {
      const cfg = global.application?.configManager
      if (!cfg || typeof cfg.getUserConfig !== 'function') return false
      const saved = cfg.getUserConfig('update-info')
      if (!saved || !saved.version || !Array.isArray(saved.files) || saved.files.length === 0) {
        return false
      }
      const info = {
        version: saved.version,
        path: saved.path || '',
        sha512: saved.sha512 || '',
        releaseDate: saved.releaseDate || '',
        releaseNotes: '',
        files: saved.files.map(f => ({
          url: f.url || '',
          sha512: f.sha512 || '',
          size: f.size || 0
        }))
      }
      logger.info(`[LinkCore] Restored update info from config: v${info.version}`)
      return this._applyUpdateInfo(info)
    } catch (err) {
      logger.warn(`[LinkCore] Failed to restore update info from config: ${err.message}`)
      return false
    }
  }

  getStatus () {
    return {
      isChecking: this.isChecking,
      isDownloading: this.isDownloading,
      updateAvailable: !!this._updateInfo && !this.isDownloading && !this._downloadedFile,
      updateDownloaded: !!this._downloadedFile,
      newVersion: this._updateInfo?.version || '',
      releaseNotes: this._updateInfo?.releaseNotes || '',
      downloadProgress: this._currentProgress?.percent || 0,
      downloadTotal: this._currentProgress?.total || this._downloadSize || 0,
      downloadTransferred: this._currentProgress?.transferred || 0
    }
  }

  /**
   * 静态版本比较（与模块级 isNewerVersion 同语义），供 Application 等
   * 外部模块校验持久化更新状态是否仍有效。
   */
  static isNewerVersion (latest, current) {
    return isNewerVersion(latest, current)
  }

  _notifyWindows (channel, ...args) {
    const windows = global.application?.windowManager?.getWindowList() || []
    windows.forEach(window => {
      try {
        if (window && !window.isDestroyed() && window.webContents) {
          window.webContents.send(channel, ...args)
        }
      } catch (_) {}
    })
  }
}
