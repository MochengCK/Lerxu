import { EventEmitter } from 'node:events'
import { createWriteStream, createReadStream, unlinkSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { app } from 'electron'
import axios from 'axios'
import yaml from 'js-yaml'
import semver from 'semver'

import logger from './Logger'
import { getI18n } from '../ui/Locale'

const pipe = promisify(pipeline)

// 配置
const GITHUB_OWNER = 'MochengCK'
const GITHUB_REPO = 'LinkCore-Download-Manager'
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
 */
function buildLatestYmlUrls () {
  const urls = []
  const ymlNames = []

  // 优先平台特定的 YML 文件
  if (process.platform === 'darwin') {
    ymlNames.push('latest-mac.yml')
  } else if (process.platform === 'linux') {
    ymlNames.push('latest-linux.yml')
  }
  // 通用 YML 作为回退
  ymlNames.push('latest.yml')

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
 * 获取发行说明（从 GitHub Releases API 或镜像）
 */
async function fetchReleaseNotes (version) {
  const apiUrls = [
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/v${version}`
  ]

  for (const url of apiUrls) {
    try {
      logger.info(`[Motrix] Fetching release notes: ${url}`)
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { Accept: 'application/vnd.github.v3+json' },
        maxRedirects: 5
      })
      if (response.data && response.data.body) {
        logger.info('[Motrix] Release notes fetched successfully')
        return response.data.body
      }
    } catch (err) {
      logger.warn(`[Motrix] Release notes fetch failed: ${url} - ${err.message}`)
      continue
    }
  }
  return `See the full release notes at:\nhttps://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version}`
}

/**
 * 根据原始 URL 构建镜像 URL 列表
 */
function buildMirrorUrls (originalUrl) {
  // 从原始 URL 提取 GitHub 路径
  const match = originalUrl.match(/github\.com\/(.+)/)
  const ghPath = match ? match[1] : ''
  if (!ghPath) return [originalUrl]

  const urls = [originalUrl]
  for (const host of MIRROR_HOSTS) {
    urls.push(`https://${host}/https://github.com/${ghPath}`)
  }
  return urls
}

/**
 * 尝试从多个 URL 获取内容，返回最先成功的
 */
async function fetchFromMirrors (urls, timeout = 15000) {
  let lastError = null
  for (const url of urls) {
    try {
      logger.info(`[Motrix] Trying: ${url}`)
      const response = await axios.get(url, {
        timeout,
        responseType: 'text',
        maxRedirects: 5
      })
      if (response.status === 200) {
        logger.info(`[Motrix] Success: ${url}`)
        return { data: response.data, url }
      }
    } catch (err) {
      lastError = err
      logger.warn(`[Motrix] Failed: ${url} - ${err.message}`)
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
 * 比较版本号，返回 true 表示有新版本
 */
function isNewerVersion (latest, current) {
  try {
    return semver.gt(semver.coerce(latest) || '0.0.0', semver.coerce(current) || '0.0.0')
  } catch {
    return latest !== current
  }
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

export default class UpdateManager extends EventEmitter {
  constructor (options = {}) {
    super()
    this.options = options
    this.i18n = getI18n()

    this.isChecking = false
    this.isDownloading = false
    this._downloadAborted = false
    this._cancelSource = null

    // 存储更新信息
    this._updateInfo = null
    this._downloadUrl = null
    this._downloadSha512 = null

    this.autoCheckData = {
      checkEnable: this.options.autoCheck,
      userCheck: false
    }
    this._autoCheckTimer = null

    logger.info('[Motrix] UpdateManager initialized')
    this.init()
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
      if (cfg && cfg.getUserConfig('update-available')) return
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
    this.isChecking = true
    this.autoCheckData.userCheck = true
    this._notifyWindows('checking-for-update')
    this.emit('checking')

    try {
      const urls = buildLatestYmlUrls()
      const { data: ymlContent } = await fetchFromMirrors(urls)
      const info = parseUpdateInfo(ymlContent)

      if (!isNewerVersion(info.version, CURRENT_VERSION)) {
        this.isChecking = false
        this._notifyWindows('update-not-available')
        this.emit('update-not-available', info)
        this._saveCheckResult(false, '')
        return
      }

      // 找到适合当前平台和架构的文件
      const platform = process.platform // darwin, win32, linux
      const arch = process.arch // x64, arm64

      logger.info(`[Motrix] Platform: ${platform}/${arch}, available files: ${info.files.map(f => f.url).join(', ')}`)

      let asset = null
      if (platform === 'darwin') {
        // 先筛选 macOS 文件，再优先匹配架构
        const macFiles = info.files.filter(f => {
          const name = (f.url || '').toLowerCase()
          return name.endsWith('.dmg') || name.endsWith('-mac.zip') || name.includes('darwin') || name.includes('mac')
        })
        // 按架构匹配
        asset = macFiles.find(f => {
          const name = (f.url || '').toLowerCase()
          if (arch === 'arm64') return name.includes('arm64') || name.includes('aarch64')
          if (arch === 'x64') return name.includes('x64') || name.includes('amd64') || (!name.includes('arm64') && !name.includes('aarch64'))
          return false
        })
        // 架构不匹配则回退到第一个 macOS 文件
        if (!asset && macFiles.length > 0) {
          asset = macFiles[0]
          logger.warn(`[Motrix] No ${arch} mac file found, falling back to ${asset.url}`)
        }
      } else if (platform === 'win32') {
        asset = info.files.find(f => (f.url || '').toLowerCase().endsWith('.exe'))
      } else if (platform === 'linux') {
        asset = info.files.find(f => (f.url || '').toLowerCase().endsWith('.appimage'))
      }

      if (!asset) {
        const errMsg = `No matching file found for ${platform}/${arch} in release v${info.version}`
        logger.warn(`[Motrix] ${errMsg}. Files: ${info.files.map(f => f.url).join(', ')}`)
        throw new Error(errMsg)
      }

      // YML 中的文件 URL 是相对路径，需要构建为完整的 GitHub 下载 URL
      const filename = asset.url
      const downloadBase = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${info.version}`
      const fullDownloadUrl = filename.startsWith('http') ? filename : `${downloadBase}/${filename}`

      this._updateInfo = info
      this._downloadUrl = fullDownloadUrl
      this._downloadSha512 = asset.sha512 || info.sha512 || ''

      logger.info(`[Motrix] Update available: ${info.version} (current: ${CURRENT_VERSION}), selected: ${filename}`)

      // 获取发行说明（latest.yml 中不包含，需从 GitHub API 获取）
      let releaseNotes = info.releaseNotes || ''
      if (!releaseNotes) {
        releaseNotes = await fetchReleaseNotes(info.version)
      }
      this.isChecking = false
      this._notifyWindows('update-available', info.version, releaseNotes)
      this.emit('update-available', info)
      this._saveCheckResult(true, info.version)
    } catch (err) {
      this.isChecking = false
      const errMsg = err?.message || `${err}`
      logger.warn(`[Motrix] Check failed: ${errMsg}`)
      this._notifyWindows('update-error', errMsg)
      this.emit('update-error', err)
    }
  }

  // ===== 下载更新 =====

  async downloadUpdate () {
    if (this.isDownloading) return
    if (!this._downloadUrl || !this._updateInfo) {
      this._notifyWindows('update-error', 'No update info available, please check for updates first')
      return
    }

    this.isDownloading = true
    this._downloadAborted = false
    this.emit('download-start')

    const urls = buildMirrorUrls(this._downloadUrl)

    for (const url of urls) {
      if (this._downloadAborted) {
        this.isDownloading = false
        this.emit('update-cancelled')
        return
      }

      try {
        logger.info(`[Motrix] Downloading: ${url}`)
        const tmpFile = resolve(tmpdir(), basename(url))

        // 清理旧文件
        if (existsSync(tmpFile)) {
          try { unlinkSync(tmpFile) } catch (_) {}
        }

        if (this._cancelSource) {
          this._cancelSource.cancel('Download canceled')
        }
        const cancelToken = new axios.CancelToken(source => {
          this._cancelSource = source
        })

        const { data: stream, headers } = await axios.get(url, {
          responseType: 'stream',
          timeout: 300000, // 5 分钟超时
          maxRedirects: 5,
          cancelToken
        })

        const totalSize = parseInt(headers['content-length'] || '0', 10) || 0
        let downloadedSize = 0

        const writer = createWriteStream(tmpFile)
        stream.on('data', chunk => {
          downloadedSize += chunk.length
          if (!this._downloadAborted) {
            const percent = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
            this.emit('download-progress', {
              percent,
              bytesPerSecond: 0,
              total: totalSize,
              transferred: downloadedSize
            })
            this._notifyWindows('download-progress', {
              percent,
              bytesPerSecond: 0,
              total: totalSize,
              transferred: downloadedSize
            })
          }
        })

        await pipe(stream, writer)
        this._cancelSource = null

        if (this._downloadAborted) {
          try { unlinkSync(tmpFile) } catch (_) {}
          this.isDownloading = false
          this.emit('update-cancelled')
          return
        }

        // 验证 SHA512
        if (this._downloadSha512) {
          logger.info('[Motrix] Verifying SHA512...')
          const valid = await verifySha512(tmpFile, this._downloadSha512)
          if (!valid) {
            logger.warn(`[Motrix] SHA512 mismatch for: ${url}`)
            try { unlinkSync(tmpFile) } catch (_) {}
            continue // 尝试下一个镜像
          }
          logger.info('[Motrix] SHA512 verified')
        }

        // 下载成功
        this.isDownloading = false
        const data = {
          version: this._updateInfo.version,
          downloadedFile: tmpFile
        }
        this.emit('update-downloaded', data)
        this.emit('will-updated', data)
        this._notifyWindows('update-downloaded', data)
        logger.info(`[Motrix] Download complete: ${tmpFile}`)
        return
      } catch (err) {
        if (axios.isCancel(err) || this._downloadAborted) {
          this.isDownloading = false
          this.emit('update-cancelled')
          return
        }
        logger.warn(`[Motrix] Download failed from ${url}: ${err.message}`)
      }
    }

    // 所有下载尝试都失败
    this.isDownloading = false
    const errMsg = 'All download sources failed, please check your network connection'
    logger.warn(`[Motrix] ${errMsg}`)
    this._notifyWindows('update-error', errMsg)
    this.emit('update-error', new Error(errMsg))
  }

  /**
   * 取消下载
   */
  cancelDownload () {
    this._downloadAborted = true
    if (this._cancelSource) {
      this._cancelSource.cancel('User canceled')
      this._cancelSource = null
    }
  }

  // ===== 内部方法 =====

  _saveCheckResult (available, version) {
    if (global.application?.configManager) {
      global.application.configManager.setUserConfig('update-available', available)
      global.application.configManager.setUserConfig('new-version', version || '')
      global.application.configManager.setUserConfig('last-check-update-time', Date.now())
    }
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
