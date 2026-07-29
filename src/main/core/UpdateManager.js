import { EventEmitter } from 'node:events'
import { createWriteStream, createReadStream, unlinkSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve, basename, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { exec } from 'node:child_process'
import { app } from 'electron'
import axios from 'axios'
import yaml from 'js-yaml'
import semver from 'semver'

import logger from './Logger'
import { getI18n } from '../ui/Locale'

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
  const getAxiosConfig = () => {
    const config = {
      timeout: 15000,
      headers: { Accept: 'application/vnd.github.v3+json' },
      maxRedirects: 5
    }
    try {
      const cfg = global.application?.configManager
      if (cfg) {
        const useProxy = cfg.getUserConfig('use-proxy') || cfg.getUserConfig('useProxy')
        const proxy = cfg.getUserConfig('proxy')
        if (useProxy && proxy) {
          if (proxy.mode === 'system') {
            // 使用系统代理，axios 会自动处理
          } else if (proxy.mode === 'custom' && proxy.server) {
            let proxyHost = proxy.server
            const proxyPort = proxy.port || 80
            // 移除协议前缀
            proxyHost = proxyHost.replace(/^https?:\/\//, '')
            config.proxy = {
              host: proxyHost,
              port: proxyPort
            }
            if (proxy.username) {
              config.proxy.auth = {
                username: proxy.username,
                password: proxy.password || ''
              }
            }
          }
        }
      }
    } catch (_) {}
    return config
  }

  const apiUrls = [
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/v${version}`
  ]

  const axiosConfig = getAxiosConfig()

  for (const url of apiUrls) {
    try {
      logger.info(`[Motrix] Fetching release notes: ${url}`)
      const response = await axios.get(url, axiosConfig)
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
    this._currentProgress = null

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
        // macOS 优先选择 DMG 安装包，其次是 ZIP
        const allMacFiles = info.files.filter(f => {
          const name = (f.url || '').toLowerCase()
          return name.endsWith('.dmg') || name.endsWith('-mac.zip') || name.includes('darwin') || name.includes('mac')
        })

        // 优先找 DMG 文件，按架构匹配
        const dmgFiles = allMacFiles.filter(f => (f.url || '').toLowerCase().endsWith('.dmg'))
        const zipFiles = allMacFiles.filter(f => (f.url || '').toLowerCase().endsWith('-mac.zip') || (f.url || '').toLowerCase().endsWith('.zip'))

        // 按架构匹配函数
        const matchArch = (files, targetArch) => {
          return files.find(f => {
            const name = (f.url || '').toLowerCase()
            if (targetArch === 'arm64') return name.includes('arm64') || name.includes('aarch64')
            if (targetArch === 'x64') return name.includes('x64') || name.includes('amd64') || (!name.includes('arm64') && !name.includes('aarch64'))
            return false
          })
        }

        // 优先使用 DMG
        asset = matchArch(dmgFiles, arch)
        if (!asset && dmgFiles.length > 0) {
          asset = dmgFiles[0]
          logger.warn(`[Motrix] No ${arch} DMG found, falling back to first DMG: ${asset.url}`)
        }

        // 如果没有 DMG，再尝试 ZIP
        if (!asset) {
          asset = matchArch(zipFiles, arch)
          if (!asset && zipFiles.length > 0) {
            asset = zipFiles[0]
            logger.warn(`[Motrix] No ${arch} ZIP found, falling back to first ZIP: ${asset.url}`)
          }
        }

        // 最后回退到任意 macOS 文件
        if (!asset && allMacFiles.length > 0) {
          asset = allMacFiles[0]
          logger.warn(`[Motrix] No matching mac file found, falling back to: ${asset.url}`)
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

      logger.info(`[Motrix] Update available: ${info.version} (current: ${CURRENT_VERSION}), selected: ${filename}`)

      // 获取发行说明（latest.yml 中不包含，需从 GitHub API 获取）
      let releaseNotes = info.releaseNotes || ''
      if (!releaseNotes) {
        releaseNotes = await fetchReleaseNotes(info.version)
      }
      this.isChecking = false
      this._notifyWindows('update-available', info.version, releaseNotes)
      this.emit('update-available', info)
      this._saveCheckResult(true, info.version, releaseNotes)
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
      logger.info('[Motrix] No update info in memory, re-checking for updates before download...')
      this.autoCheckData.userCheck = true
      try {
        await this.check()
      } catch (err) {
        this._notifyWindows('update-error', 'Failed to check for updates: ' + err.message)
        return
      }
      if (!this._downloadUrl || !this._updateInfo) {
        this._notifyWindows('update-error', 'No update info available, please check for updates first')
        return
      }
    }

    this.isDownloading = true
    this._downloadAborted = false
    this._currentProgress = { percent: 0, total: this._downloadSize || 0, transferred: 0 }
    this.emit('download-start')
    this._notifyWindows('download-start')

    const urls = buildMirrorUrls(this._downloadUrl)

    for (const url of urls) {
      if (this._downloadAborted) {
        this.isDownloading = false
        this.emit('update-cancelled')
        this._notifyWindows('update-cancelled')
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

        const totalSize = parseInt(headers['content-length'] || '0', 10) || this._downloadSize || 0
        let downloadedSize = 0

        const writer = createWriteStream(tmpFile)
        stream.on('data', chunk => {
          downloadedSize += chunk.length
          if (!this._downloadAborted) {
            const percent = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
            this._currentProgress = {
              percent,
              bytesPerSecond: 0,
              total: totalSize,
              transferred: downloadedSize
            }
            this.emit('download-progress', this._currentProgress)
            this._notifyWindows('download-progress', this._currentProgress)
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
        this._currentProgress = null
        this._downloadedFile = tmpFile
        const data = {
          version: this._updateInfo.version,
          downloadedFile: tmpFile,
          fileType: this._downloadedFileType
        }
        this.emit('update-downloaded', data)
        this.emit('will-updated', data)
        this._notifyWindows('update-downloaded', data)
        logger.info(`[Motrix] Download complete: ${tmpFile}, type: ${this._downloadedFileType}`)
        return
      } catch (err) {
        if (axios.isCancel(err) || this._downloadAborted) {
          this.isDownloading = false
          this._currentProgress = null
          this.emit('update-cancelled')
          this._notifyWindows('update-cancelled')
          return
        }
        logger.warn(`[Motrix] Download failed from ${url}: ${err.message}`)
      }
    }

    // 所有下载尝试都失败
    this.isDownloading = false
    this._currentProgress = null
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

  /**
   * 退出并安装更新
   */
  async quitAndInstall () {
    if (!this._downloadedFile) {
      logger.warn('[Motrix] No downloaded file to install')
      this._notifyWindows('update-error', 'No update file downloaded')
      return
    }

    const fileType = this._downloadedFileType
    const downloadedFile = this._downloadedFile

    logger.info(`[Motrix] Starting install: ${downloadedFile} (${fileType})`)

    try {
      this._notifyWindows('installing-update')
      this.emit('installing-update')

      if (process.platform === 'darwin') {
        if (fileType === 'dmg') {
          await this._installDmg(downloadedFile)
        } else if (fileType === 'zip') {
          await this._installMacZip(downloadedFile)
        } else {
          await this._openFile(downloadedFile)
        }
      } else if (process.platform === 'win32') {
        await this._installExe(downloadedFile)
      } else {
        await this._openFile(downloadedFile)
      }
    } catch (err) {
      logger.error(`[Motrix] Install failed: ${err.message}`)
      this._notifyWindows('update-error', `Install failed: ${err.message}`)
      this.emit('update-error', err)
    }
  }

  /**
   * macOS: 安装 DMG 文件
   */
  async _installDmg (dmgPath) {
    logger.info('[Motrix] Installing DMG...')

    // 挂载 DMG
    const { stdout: attachOutput } = await execAsync(`hdiutil attach -nobrowse -noautoopen "${dmgPath}"`)
    logger.info(`[Motrix] hdiutil attach output: ${attachOutput}`)

    // 解析挂载点（通常是 /Volumes/xxx）
    const mountMatch = attachOutput.match(/\/Volumes\/[^\n]+/)
    if (!mountMatch) {
      throw new Error('Could not find mounted volume')
    }
    const mountPoint = mountMatch[0].trim()
    logger.info(`[Motrix] Mount point: ${mountPoint}`)

    try {
      // 在挂载点中查找 .app 文件
      const files = readdirSync(mountPoint)
      const appFile = files.find(f => f.endsWith('.app'))
      if (!appFile) {
        throw new Error('No .app file found in DMG')
      }

      const sourceApp = join(mountPoint, appFile)
      const targetApp = join('/Applications', appFile)

      logger.info(`[Motrix] Copying ${sourceApp} to ${targetApp}`)

      // 如果目标已存在，先删除（需要权限，会提示用户输入密码）
      try {
        // 使用 ditto 复制（保留权限和符号链接）
        await execAsync(`ditto "${sourceApp}" "${targetApp}"`)
        logger.info('[Motrix] App copied successfully')
      } catch (copyErr) {
        // 如果复制失败（可能是权限问题），使用 osascript 提示认证
        logger.warn(`[Motrix] Copy failed, trying with privileges: ${copyErr.message}`)
        const script = `do shell script "ditto \\"${sourceApp}\\" \\"${targetApp}\\"" with administrator privileges`
        await execAsync(`osascript -e '${script}'`)
        logger.info('[Motrix] App copied with admin privileges')
      }

      // 卸载 DMG
      try {
        await execAsync(`hdiutil detach "${mountPoint}" -quiet`)
      } catch (_) {}

      // 打开新版本
      logger.info('[Motrix] Relaunching new version...')
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
   * macOS: 安装 ZIP 更新包
   */
  async _installMacZip (zipPath) {
    logger.info('[Motrix] Installing ZIP update...')
    const appPath = app.getAppPath()
    const appBundlePath = dirname(dirname(dirname(appPath))) // 从 app.asar 向上找 .app 包
    logger.info(`[Motrix] Current app bundle: ${appBundlePath}`)

    const tmpExtractDir = join(tmpdir(), `motrix-update-${Date.now()}`)
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

      logger.info(`[Motrix] New app: ${newAppPath}`)

      // 使用 ditto 替换当前应用
      await execAsync(`ditto "${newAppPath}" "${appBundlePath}"`)
      logger.info('[Motrix] App replaced successfully')

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
    logger.info('[Motrix] Installing EXE...')
    // 使用 spawn 启动安装程序，然后退出
    const { spawn } = require('node:child_process')
    spawn(exePath, ['/S', '--force-run'], {
      detached: true,
      stdio: 'ignore'
    }).unref()

    // 延迟退出，确保安装程序启动
    setTimeout(() => {
      app.quit()
    }, 500)
  }

  /**
   * 通用：用系统默认程序打开文件
   */
  async _openFile (filePath) {
    const { shell } = require('electron')
    await shell.openPath(filePath)
    app.quit()
  }

  /**
   * 重新启动应用
   */
  _relaunchApp (appPath) {
    const { spawn } = require('node:child_process')
    // 使用 open 命令启动新版本
    spawn('open', [appPath], {
      detached: true,
      stdio: 'ignore'
    }).unref()

    // 退出当前应用
    setTimeout(() => {
      app.quit()
    }, 500)
  }

  // ===== 内部方法 =====

  _saveCheckResult (available, version, releaseNotes) {
    if (global.application?.configManager) {
      global.application.configManager.setUserConfig('update-available', available)
      global.application.configManager.setUserConfig('new-version', version || '')
      global.application.configManager.setUserConfig('last-check-update-time', Date.now())
      if (available && releaseNotes) {
        global.application.configManager.setUserConfig('release-notes', releaseNotes)
      } else if (!available) {
        global.application.configManager.setUserConfig('release-notes', '')
      }
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
