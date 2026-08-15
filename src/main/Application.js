import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { readFile, unlink } from 'node:fs'
import { extname, basename } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { app, clipboard, shell, dialog, ipcMain } from 'electron'
import { createServer } from 'node:http'
import WS from 'ws'
import is from 'electron-is'
import { isEmpty, isEqual } from 'lodash'

import {
  APP_RUN_MODE,
  APP_THEME,
  AUTO_SYNC_TRACKER_INTERVAL,
  AUTO_SYNC_ED2K_SERVER_INTERVAL,
  BUILTIN_ED2K_SERVERS,
  ONE_HOUR,
  PROXY_SCOPES,
  PROXY_MODE,
  APP_HTTP_PORT,
  ADD_TASK_TYPE,
  TASK_STATUS
} from '@shared/constants'
import { bytesToSize, checkIsNeedRunAdvanced, detectResource, sanitizeLink, getTaskName, removeExtensionDot, timeFormat, timeRemaining } from '@shared/utils'
import {
  deduplicateTrackers,
  fetchBtTrackerFromSource,
  reduceTrackerString
} from '@shared/utils/tracker'
import { fetchEd2kServersFromSource } from '@shared/utils/ed2k'
import { inferRefererFromUrl } from '@shared/utils/referer-rules'
import { getLanguage } from '@shared/locales'
import { showItemInFolder, getEngineList, mergeAria2Conf, getSystemHttpProxy } from './utils'
import logger from './core/LogManager'
import Context from './core/Context'
import ConfigManager from './core/ConfigManager'
import { setupLocaleManager } from './ui/Locale'
import Engine from './core/Engine'
import EngineClient from './core/EngineClient'
import UPnPManager from './core/UPnPManager'
import AutoLaunchManager from './core/AutoLaunchManager'
import UpdateManager from './core/UpdateManager'
import EnergyManager from './core/EnergyManager'
import ProtocolManager from './core/ProtocolManager'
import WindowManager from './ui/WindowManager'
import MenuManager from './ui/MenuManager'
import TouchBarManager from './ui/TouchBarManager'
import TrayManager from './ui/TrayManager'
import DockManager from './ui/DockManager'
import ThemeManager from './ui/ThemeManager'

export default class Application extends EventEmitter {
  constructor () {
    super()
    this.isReady = false
    this._updateStatusInitialized = false
    this._taskPlanTriggered = false
    this._taskPlanHasCompletionSinceEnabled = false
    this._taskPlanKey = ''
    this._taskPlanCheckTimer = null
    this._taskPlanScheduleTimer = null
    this._taskPlanScheduledNotBeforeTime = null
    this._videoSnifferConfig = {
      enabled: true,
      formats: ['m4s', 'mp4', 'flv', 'm3u8', 'ts', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'],
      autoCombine: true
    }
    this._clipboardWatchTimer = null
    this._clipboardLastText = ''
    this._clipboardLastTriggerAt = 0

    // 独立任务进度窗口的平均速度采样 (gid -> [{bytes, durationMs}])
    this._progressSpeedSamples = new Map()

    // 安全机制：挑战-响应认证
    this.startupNonce = randomBytes(8).toString('hex')
    this.challenges = new Map()
    this.sessionTokens = new Map()
    this.tokenVersion = Date.now()
    this.sessionTokenTTL = 24 * 60 * 60 * 1000 // session token 24小时过期

    // 定期清理过期的 challenge 和 session tokens（保存引用，退出时清除）
    this._tokenCleanupTimer = setInterval(() => {
      this.cleanupExpiredChallenges()
      this.cleanupExpiredSessionTokens()
    }, 60000) // 每分钟清理一次

    this._initPromise = this.init()
  }

  stopTokenCleanupTimer () {
    if (this._tokenCleanupTimer) {
      clearInterval(this._tokenCleanupTimer)
      this._tokenCleanupTimer = null
    }
  }

  async init () {
    this.initContext()

    this.initConfigManager()

    this.setupLogger()

    this.initLocaleManager()

    this.setupApplicationMenu()

    this.initWindowManager()

    this.initUPnPManager()

    // 在启动引擎前，如果使用系统代理模式，先获取系统代理地址
    await this.initSystemProxyIfNeeded()

    await this.startEngine()

    this.initEngineClient()

    this.initThemeManager()

    this.initTrayManager()

    this.initTouchBarManager()

    this.initDockManager()

    this.initAutoLaunchManager()

    this.initEnergyManager()

    this.initProtocolManager()

    this.initUpdaterManager()

    this.handleCommands()

    this.handleEvents()

    this.handleIpcMessages()

    this.handleIpcInvokes()

    this.initAppHttpServer()

    // 应用启动时自动获取引擎信息
    await this.autoFetchEngineInfo()

    // 应用启动时自动获取引擎列表
    await this.autoFetchEngineList()

    this.emit('application:initialized')
  }

  async initSystemProxyIfNeeded () {
    try {
      const proxy = this.configManager.getUserConfig('proxy', { mode: PROXY_MODE.SYSTEM })
      let proxyMode = proxy.mode
      if (!proxyMode && proxy.enable !== undefined) {
        proxyMode = proxy.enable ? PROXY_MODE.CUSTOM : PROXY_MODE.NONE
      }
      const { bypass, scope = [] } = proxy

      if (proxyMode === PROXY_MODE.SYSTEM && scope.includes(PROXY_SCOPES.DOWNLOAD)) {
        logger.info('[LinkCore] System proxy mode enabled, fetching system proxy...')
        const systemProxy = await getSystemHttpProxy()
        if (systemProxy) {
          logger.info('[LinkCore] System proxy detected:', systemProxy)
          this.configManager.setSystemConfig({
            'all-proxy': systemProxy,
            'no-proxy': bypass || ''
          })
        } else {
          logger.warn('[LinkCore] No system proxy detected, downloads will use direct connection')
          this.configManager.setSystemConfig({
            'all-proxy': '',
            'no-proxy': ''
          })
        }
      }
    } catch (error) {
      logger.warn('[LinkCore] Failed to initialize system proxy:', error.message)
    }
  }

  // ===== 浏览器扩展通信:公共处理逻辑(HTTP 与 WebSocket 共用) =====

  // 验证扩展授权签名(挑战码 + extensionId + timestamp → SHA-256)
  // 供 HTTP /linkcore/authorize 与 WebSocket 连接认证共用
  _verifyExtensionAuthorize (payload) {
    const { challenge, signature, extensionId, timestamp } = payload

    const challengeData = this.challenges.get(challenge)
    if (!challengeData) {
      return { ok: false, error: 'Invalid challenge' }
    }

    if (Date.now() > challengeData.expiresAt) {
      this.challenges.delete(challenge)
      return { ok: false, error: 'Challenge expired' }
    }

    if (!extensionId || typeof extensionId !== 'string' || extensionId.length < 10) {
      console.log('[Security] Invalid extension ID:', extensionId)
      return { ok: false, error: 'Invalid extension ID' }
    }

    if (!signature || typeof signature !== 'string') {
      return { ok: false, error: 'Invalid signature' }
    }

    if (!timestamp || typeof timestamp !== 'number') {
      return { ok: false, error: 'Invalid timestamp' }
    }

    if (Math.abs(Date.now() - timestamp) > 60000) {
      return { ok: false, error: 'Timestamp expired' }
    }

    const signatureString = `${challenge}${extensionId}${timestamp}`
    const expectedSignature = createHash('sha256').update(signatureString).digest('hex')

    if (signature !== expectedSignature) {
      console.log('[Security] Signature mismatch:', {
        expected: expectedSignature,
        received: signature
      })
      return { ok: false, error: 'Signature mismatch' }
    }

    return { ok: true }
  }

  // 读取扩展配置(与 /linkcore/ext-config GET 一致)
  _getExtensionConfig () {
    const interceptAllDownloads = !!this.configManager.getUserConfig('extension-intercept-all-downloads', false)
    const silentDownload = !!this.configManager.getUserConfig('extension-silent-download', false)
    const shiftToggleEnabled = !!this.configManager.getUserConfig('extension-shift-toggle-enabled', false)
    const minFileSize = Number(this.configManager.getUserConfig('extension-min-file-size', 0)) || 0
    const skipRaw = this.configManager.getUserConfig('extension-skip-file-extensions', '')
    let skipFileExtensions = []
    if (typeof skipRaw === 'string') {
      const normalizeSkipExt = (x) => removeExtensionDot(`${x}`.trim().toLowerCase())
      skipFileExtensions = skipRaw.split(/[,;\n]/).map(normalizeSkipExt).filter(Boolean)
    } else if (Array.isArray(skipRaw)) {
      const normalizeSkipExt = (x) => removeExtensionDot(`${x}`.trim().toLowerCase())
      skipFileExtensions = skipRaw.map(normalizeSkipExt).filter(Boolean)
    }

    const excludeDomainsRaw = this.configManager.getUserConfig('extension-exclude-domains', '')
    let excludeDomains = []
    if (typeof excludeDomainsRaw === 'string') {
      excludeDomains = excludeDomainsRaw.split(/[,;\n]/).map(x => `${x}`.trim()).filter(Boolean)
    } else if (Array.isArray(excludeDomainsRaw)) {
      excludeDomains = excludeDomainsRaw.map(x => `${x}`.trim()).filter(Boolean)
    }

    const theme = this.configManager.getUserConfig('theme', APP_THEME.AUTO)
    const systemTheme = this.themeManager ? this.themeManager.getSystemTheme() : null
    const effectiveTheme = theme === APP_THEME.AUTO ? (systemTheme || APP_THEME.LIGHT) : theme

    return {
      interceptAllDownloads,
      silentDownload,
      shiftToggleEnabled,
      minFileSize,
      skipFileExtensions,
      excludeDomains,
      videoSnifferEnabled: this._videoSnifferConfig.enabled,
      videoSnifferFormats: this._videoSnifferConfig.formats,
      videoSnifferAutoCombine: this._videoSnifferConfig.autoCombine,
      theme,
      effectiveTheme
    }
  }

  // 更新扩展配置(与 /linkcore/ext-config POST 一致)
  _setExtensionConfig (payload) {
    if (payload.excludeDomains !== undefined) {
      // 直接使用完整列表替换现有配置,支持添加和移除操作
      const newDomains = Array.isArray(payload.excludeDomains)
        ? payload.excludeDomains
        : (payload.excludeDomains || '').split(/[,;\n]/).map(x => `${x}`.trim()).filter(Boolean)

      this.configManager.setUserConfig('extension-exclude-domains', newDomains.join(','))
      this.sendCommandToAll('preference:update-from-extension')
    }

    if (payload.skipFileExtensions !== undefined) {
      // 文件扩展名使用合并逻辑(添加新的,保留现有的)
      const current = this.configManager.getUserConfig('extension-skip-file-extensions', '')
      const newExts = Array.isArray(payload.skipFileExtensions)
        ? payload.skipFileExtensions
        : (payload.skipFileExtensions || '').split(/[,;\n]/).map(x => `${x}`.trim()).filter(Boolean)

      const existingExts = current
        ? current.split(/[,;\n]/).map(x => `${x}`.trim()).filter(Boolean)
        : []

      const normalizeDot = (x) => {
        let s = `${x}`.trim()
        while (s.startsWith('.')) {
          s = s.substring(1)
        }
        return s.toLowerCase()
      }

      const allExts = new Set([...existingExts.map(normalizeDot), ...newExts.map(normalizeDot)])
      this.configManager.setUserConfig('extension-skip-file-extensions', Array.from(allExts).join(','))
      this.sendCommandToAll('preference:update-from-extension')
    }
  }

  // 添加下载任务(与 /linkcore/add POST 一致),返回 { ok, dialog } 或 { ok: false, error }
  async _handleExtensionAdd (payload) {
    const { url, referer, headers, suggestedFilename } = payload
    const downloadUrl = `${url || ''}`.trim()
    if (!downloadUrl || !/^https?:/i.test(downloadUrl)) {
      return { ok: false, error: 'invalid url' }
    }

    const historyTasks = []
    const allTasks = []

    try {
      // 仅检查活动 / 等待中的任务,避免历史已完成任务(文件可能已删除或已合并)
      // 阻塞新任务的命名,导致 suggestedFilename 被错误地追加 (1)。
      // stopped 历史不参与命名冲突判断,由 aria2 在文件系统层处理实际重名。
      const [active, waiting] = await Promise.all([
        this.engineClient.call('tellActive'),
        this.engineClient.call('tellWaiting', 0, 1000)
      ])
      allTasks.push(...(active || []), ...(waiting || []))
    } catch (error) {
      console.error('[Duplicate Check] Error fetching tasks:', error)
    }

    allTasks.push(...historyTasks)

    const existingNames = new Set()
    allTasks.forEach(task => {
      const taskName = task.bittorrent?.info?.name ||
                       (task.files?.[0]?.path ? task.files[0].path.split(/[\\/]/).pop() : '')
      if (taskName) {
        existingNames.add(taskName)
      }
    })

    let finalOut = suggestedFilename
    if (finalOut && existingNames.has(finalOut)) {
      const lastDotIndex = finalOut.lastIndexOf('.')
      let nameWithoutExt = finalOut
      let ext = ''

      if (lastDotIndex > 0) {
        nameWithoutExt = finalOut.substring(0, lastDotIndex)
        ext = finalOut.substring(lastDotIndex)
      }

      let counter = 1
      while (existingNames.has(finalOut)) {
        finalOut = `${nameWithoutExt} (${counter})${ext}`
        counter++
      }
      existingNames.add(finalOut)
    }

    const headerList = []
    if (Array.isArray(headers)) {
      headers.forEach((h) => {
        if (!h) return
        if (typeof h === 'string') {
          headerList.push(h)
        } else if (h && typeof h === 'object') {
          const name = h.name || h.key || h.header
          const value = h.value
          if (name && typeof value !== 'undefined') {
            headerList.push(`${name}: ${value}`)
          }
        }
      })
    } else if (headers && typeof headers === 'object') {
      Object.keys(headers).forEach((k) => {
        const v = headers[k]
        if (typeof v !== 'undefined') {
          headerList.push(`${k}: ${v}`)
        }
      })
    } else if (typeof headers === 'string' && headers.trim()) {
      headerList.push(headers)
    }

    let finalHeaders = headerList
    if (!finalHeaders.length) {
      finalHeaders = ['X-LinkCore-Source: BrowserExtension']
    } else if (!finalHeaders.some(h => typeof h === 'string' && /^x-linkcore-source\s*:/i.test(h.trim()))) {
      finalHeaders = [...finalHeaders, 'X-LinkCore-Source: BrowserExtension']
    }

    const options = { header: finalHeaders }

    const hasRefererInHeaders = finalHeaders.some(h =>
      typeof h === 'string' && /^referer\s*:/i.test(h.trim())
    )

    if (referer) {
      options.referer = referer
    } else if (!hasRefererInHeaders) {
      const inferredReferer = inferRefererFromUrl(downloadUrl)
      if (inferredReferer) {
        options.referer = inferredReferer
      }
    }

    const silentDownload = !!this.configManager.getUserConfig('extension-silent-download', false)

    const headerMap = {}
    finalHeaders.forEach((h) => {
      if (typeof h !== 'string') {
        return
      }
      const idx = h.indexOf(':')
      if (idx <= 0) {
        return
      }
      const name = h.slice(0, idx).trim().toLowerCase()
      const value = h.slice(idx + 1).trim()
      if (!name) {
        return
      }
      if (!headerMap[name]) {
        headerMap[name] = value
      }
    })

    const userAgent = headerMap['user-agent']
    const cookie = headerMap.cookie
    const authorization = headerMap.authorization
    const taskPayload = {
      type: ADD_TASK_TYPE.URI,
      uri: downloadUrl,
      fromBrowserExtension: true
    }
    if (finalOut) {
      taskPayload.suggestedFilename = finalOut
    }
    if (options.referer) {
      taskPayload.referer = options.referer
    }
    if (userAgent) {
      taskPayload.userAgent = userAgent
    }
    if (cookie) {
      taskPayload.cookie = cookie
    }
    if (authorization) {
      taskPayload.authorization = authorization
    }

    if (!silentDownload) {
      try {
        if (this.windowManager && typeof this.windowManager.bringToFront === 'function') {
          this.windowManager.bringToFront('index')
        } else {
          this.show()
        }
      } catch (_) {
        this.show()
      }
      global.application.sendCommandToAll('application:new-task', taskPayload)
      return { ok: true, dialog: true }
    }

    taskPayload.silent = true
    global.application.sendCommandToAll('application:new-task', taskPayload)
    return { ok: true, dialog: false }
  }

  // 活动任务列表(与 /linkcore/tasks GET 一致)
  async _getExtensionTasks () {
    const keys = ['gid', 'status', 'totalLength', 'completedLength', 'downloadSpeed', 'uploadSpeed', 'files']
    const data = await this.engineClient.call('tellActive', keys) || []
    let downloadSpeed = 0
    let uploadSpeed = 0
    const tasks = data.map(it => {
      const tl = Number(it.totalLength || 0)
      const cl = Number(it.completedLength || 0)
      const ds = Number(it.downloadSpeed || 0)
      const us = Number(it.uploadSpeed || 0)
      const percent = tl > 0 ? Math.floor((cl / tl) * 100) : 0
      const name = it.files && it.files[0] && it.files[0].path ? it.files[0].path.split('/').pop() : ''
      downloadSpeed += ds
      uploadSpeed += us
      return { gid: it.gid, status: it.status, total: tl, completed: cl, speed: ds, percent, name }
    })
    return { downloadSpeed, uploadSpeed, totalSpeed: downloadSpeed, tasks }
  }

  initAppHttpServer () {
    try {
      // 保存所有活跃的连接，方便关闭时强制断开
      this.httpConnections = new Set()

      const server = createServer((req, res) => {
        const url = req.url || ''

        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Token-Version, X-Signature, X-Extension-Id, X-Timestamp, X-Session-Token')
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Access-Control-Max-Age', '86400')

        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }

        if (url.startsWith('/linkcore/handshake')) {
          const challenge = randomBytes(16).toString('hex')
          const expiresAt = Date.now() + 30000 // 30秒过期，给网络慢的情况留足够时间
          this.challenges.set(challenge, {
            expiresAt,
            createdAt: Date.now()
          })
          const version = app.getVersion()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            challenge,
            expires: 30000,
            version
          }))
          return
        }

        if (url.startsWith('/linkcore/authorize')) {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Method not allowed' }))
            return
          }

          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body)
              const verifyResult = this._verifyExtensionAuthorize(payload)
              if (!verifyResult.ok) {
                res.writeHead(401, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: verifyResult.error }))
                return
              }

              const { challenge, extensionId } = payload

              // 生成 session token
              const sessionToken = randomBytes(32).toString('hex')

              this.sessionTokens.set(sessionToken, {
                challenge,
                extensionId,
                createdAt: Date.now(),
                tokenVersion: this.tokenVersion
              })

              // 删除已使用的 challenge
              this.challenges.delete(challenge)

              const responseData = {
                token: sessionToken,
                tokenVersion: this.tokenVersion
              }
              console.log('[Security] Authorization successful, returning:', {
                token: sessionToken.substring(0, 20) + '...',
                tokenVersion: this.tokenVersion
              })

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(responseData))
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Invalid request' }))
            }
          })
          return
        }

        if (url.startsWith('/linkcore/ext-config')) {
          if (req.method === 'GET') {
            try {
              const data = this._getExtensionConfig()
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(data))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                interceptAllDownloads: false,
                silentDownload: false,
                shiftToggleEnabled: false,
                minFileSize: 0,
                skipFileExtensions: [],
                excludeDomains: [],
                videoSnifferEnabled: false,
                videoSnifferFormats: ['m4s', 'mp4', 'flv', 'm3u8', 'ts', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'],
                videoSnifferAutoCombine: true,
                theme: APP_THEME.AUTO,
                effectiveTheme: APP_THEME.LIGHT
              }))
            }
          } else if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', async () => {
              try {
                const payload = body ? JSON.parse(body) : {}
                this._setExtensionConfig(payload)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: true }))
              } catch (err) {
                console.error('[LinkCore] Failed to update ext config:', err)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: false }))
              }
            })
          }
          return
        }

        if (url.startsWith('/linkcore/locale')) {
          const locale = this.configManager.getLocale()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ locale }))
          return
        }

        const validateToken = () => {
          const authHeader = req.headers.authorization || req.headers['x-session-token']
          if (!authHeader) {
            console.log('[Security] Token validation failed: no auth header', {
              url: url,
              method: req.method,
              headers: Object.keys(req.headers)
            })
            return false
          }
          const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader

          const sessionData = this.sessionTokens.get(token)
          if (!sessionData) {
            console.log('[Security] Token validation failed: token not found', {
              token: token.substring(0, 20) + '...',
              url: url
            })
            return false
          }

          return true
        }

        if (!validateToken()) {
          const clientIp = req.socket.remoteAddress || 'unknown'
          const requestPath = url
          const requestMethod = req.method || 'GET'

          console.log('[Security] Unauthorized request detected:', {
            ip: clientIp,
            path: requestPath,
            method: requestMethod,
            timestamp: new Date().toISOString()
          })

          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Unauthorized' }))
          return
        }

        const validateTokenVersion = () => {
          const authHeader = req.headers.authorization || req.headers['x-session-token']
          if (!authHeader) {
            console.log('[Security] Token version validation failed: no auth header')
            return false
          }
          const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader

          const sessionData = this.sessionTokens.get(token)
          if (!sessionData) {
            console.log('[Security] Token version validation failed: token not found')
            return false
          }

          const isValid = sessionData.tokenVersion === this.tokenVersion
          if (!isValid) {
            console.log('[Security] Token version mismatch:', {
              sessionTokenVersion: sessionData.tokenVersion,
              currentTokenVersion: this.tokenVersion,
              token: token.substring(0, 20) + '...'
            })
          }
          return isValid
        }

        if (!validateTokenVersion()) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Token version mismatch' }))
          return
        }

        if (url.startsWith('/linkcore/version')) {
          const version = app.getVersion()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ version }))
          return
        }

        if (url.startsWith('/linkcore/tasks')) {
          (async () => {
            try {
              const data = await this._getExtensionTasks()
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(data))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ downloadSpeed: 0, uploadSpeed: 0, totalSpeed: 0, tasks: [] }))
            }
          })()
          return
        }

        if (url.startsWith('/linkcore/add')) {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', async () => {
            try {
              const payload = body ? JSON.parse(body) : {}
              const result = await this._handleExtensionAdd(payload)
              if (result.ok) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: true, dialog: result.dialog }))
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(result))
              }
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false }))
            }
          })
          return
        }

        if (url.startsWith('/linkcore/health')) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not Found' }))
      })

      // 跟踪所有连接
      server.on('connection', (conn) => {
        this.httpConnections.add(conn)
        conn.on('close', () => {
          this.httpConnections.delete(conn)
        })
      })

      // 添加错误处理
      server.on('error', (err) => {
        logger.error('[LinkCore] App HTTP server error:', err && err.message ? err.message : err)
        if (err.code === 'EADDRINUSE') {
          logger.error(`[LinkCore] Port ${APP_HTTP_PORT} is already in use. Browser extension connection will not work.`)
        }
      })

      server.listen(APP_HTTP_PORT, '127.0.0.1', () => {
        logger.info(`[LinkCore] App HTTP server listening at http://127.0.0.1:${APP_HTTP_PORT}/`)
      })
      this.httpServer = server

      // WebSocket 通道(浏览器扩展主通道),挂在同一 HTTP server 上
      this._initExtensionWebSocket(server)
    } catch (e) {
      logger.warn('[LinkCore] Failed to start app HTTP server:', e && e.message ? e.message : e)
    }
  }

  // ===== 浏览器扩展 WebSocket 通道 =====
  // 相比 HTTP + token 通道:
  //   - 长连接复用,无重复 HTTP 握手与每次请求的 token 认证开销(接管更快)
  //   - 认证在连接层完成(challenge + 签名),消息不再携带 token,暴露面更小
  //   - Origin 校验(chrome-extension://)拒绝本机其他进程/网页伪造请求
  //   - MV3 中活动 WebSocket 使扩展 Service Worker 保持存活,接管链路不被回收
  _initExtensionWebSocket (server) {
    try {
      const { WebSocketServer } = WS
      const wss = new WebSocketServer({ server, path: '/ws' })
      this.wsServer = wss

      wss.on('connection', (ws, req) => {
        // 来源校验:只允许浏览器扩展连接(Chrome: chrome-extension://, Firefox: moz-extension://)
        const origin = req.headers.origin || ''
        if (!origin.startsWith('chrome-extension://') && !origin.startsWith('moz-extension://')) {
          logger.warn('[LinkCore] WebSocket rejected, forbidden origin:', origin || '(none)')
          ws.close(1008, 'Forbidden origin')
          return
        }

        ws.isAuthenticated = false

        // 连接建立即发送挑战码,客户端签名后回传完成连接级认证
        const challenge = randomBytes(16).toString('hex')
        const expiresAt = Date.now() + 30000
        this.challenges.set(challenge, { expiresAt, createdAt: Date.now() })
        ws.send(JSON.stringify({ type: 'challenge', challenge, expires: 30000 }))

        // 30s 未认证关闭连接,防止未授权连接长期占用
        ws.authTimer = setTimeout(() => {
          if (!ws.isAuthenticated) {
            ws.close(1008, 'Auth timeout')
          }
        }, 30000)

        ws.on('message', async (raw) => {
          let msg
          try {
            msg = JSON.parse(raw.toString())
          } catch (e) {
            return
          }

          // 连接级认证
          if (!ws.isAuthenticated) {
            if (msg.type === 'authorize') {
              const verifyResult = this._verifyExtensionAuthorize(msg)
              if (!verifyResult.ok) {
                logger.warn('[LinkCore] WebSocket authorization failed:', verifyResult.error)
                ws.close(1008, verifyResult.error)
                return
              }
              this.challenges.delete(msg.challenge)
              ws.isAuthenticated = true
              clearTimeout(ws.authTimer)
              console.log('[LinkCore] WebSocket extension authorized')
              ws.send(JSON.stringify({ type: 'authorized' }))
            }
            return
          }

          // 认证后的请求处理
          try {
            const result = await this._handleWsRequest(msg)
            if (result !== undefined) {
              ws.send(JSON.stringify({ id: msg.id, result }))
            }
          } catch (err) {
            ws.send(JSON.stringify({ id: msg.id, error: err && err.message ? err.message : 'internal error' }))
          }
        })

        ws.on('close', () => {
          clearTimeout(ws.authTimer)
        })
      })

      wss.on('error', (err) => {
        logger.error('[LinkCore] WebSocket server error:', err && err.message ? err.message : err)
      })

      logger.info(`[LinkCore] WebSocket server ready at ws://127.0.0.1:${APP_HTTP_PORT}/ws`)
    } catch (e) {
      logger.warn('[LinkCore] Failed to start WebSocket server:', e && e.message ? e.message : e)
    }
  }

  // WebSocket 请求分发(仅认证后的连接会到达这里)
  async _handleWsRequest (msg) {
    const { type, params } = msg
    switch (type) {
    case 'add': {
      const result = await this._handleExtensionAdd(params || {})
      return { ok: result.ok, dialog: result.dialog, error: result.error }
    }
    case 'ext-config-get':
      return this._getExtensionConfig()
    case 'ext-config-set':
      this._setExtensionConfig(params || {})
      return { ok: true }
    case 'locale':
      return { locale: this.configManager.getLocale() }
    case 'version':
      return { version: app.getVersion() }
    case 'tasks':
      return this._getExtensionTasks()
    case 'health':
      return { ok: true }
    case 'ping':
      return { pong: true }
    default:
      return undefined
    }
  }

  async autoFetchEngineInfo () {
    try {
      logger.info('[LinkCore] Auto fetching engine info on app startup')
      const engineInfo = await this.getEngineVersionInfo()
      logger.info('[LinkCore] Engine info fetched successfully:', engineInfo)

      // 发送引擎信息到所有窗口
      this.sendCommandToAll('engine-version-info', engineInfo)
    } catch (error) {
      logger.warn('[LinkCore] Failed to fetch engine info on startup:', error.message)
      // 发送错误信息到前端
      this.sendCommandToAll('engine-version-info', {
        error: error.message,
        version: 'Unknown',
        architecture: 'Unknown',
        features: [],
        dependencies: [],
        compileInfo: 'Unknown'
      })
    }
  }

  async autoFetchEngineList () {
    try {
      logger.info('[LinkCore] Auto fetching engine list on app startup')
      const { platform, arch } = process
      const engineList = getEngineList(platform, arch)
      logger.info('[LinkCore] Engine list fetched successfully:', engineList)

      // 发送引擎列表到所有窗口
      this.sendCommandToAll('engine-list', {
        engines: engineList,
        platform,
        arch,
        timestamp: Date.now()
      })
    } catch (error) {
      logger.warn('[LinkCore] Failed to fetch engine list on startup:', error.message)
      // 发送错误信息到前端
      this.sendCommandToAll('engine-list', {
        error: error.message,
        engines: [],
        platform: process.platform,
        arch: process.arch,
        timestamp: Date.now()
      })
    }
  }

  initContext () {
    this.context = new Context()
  }

  initConfigManager () {
    this.configListeners = {}
    this.configManager = new ConfigManager()
    this.loadVideoSnifferConfig()
  }

  loadVideoSnifferConfig () {
    try {
      const savedEnabled = this.configManager.getUserConfig('video-sniffer-enabled')
      const savedFormats = this.configManager.getUserConfig('video-sniffer-formats')
      const savedAutoCombine = this.configManager.getUserConfig('video-sniffer-auto-combine')

      if (savedEnabled !== undefined || savedFormats !== undefined || savedAutoCombine !== undefined) {
        this._videoSnifferConfig = {
          enabled: savedEnabled !== undefined ? savedEnabled : true,
          formats: Array.isArray(savedFormats) ? savedFormats : ['m4s', 'mp4', 'flv', 'm3u8', 'ts', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'],
          autoCombine: savedAutoCombine !== undefined ? savedAutoCombine : true
        }
        logger.log('[LinkCore] Video sniffer config loaded from disk:', this._videoSnifferConfig)
      }
    } catch (e) {
      logger.warn('[LinkCore] Failed to load video sniffer config from disk:', e)
    }
  }

  offConfigListeners () {
    try {
      Object.keys(this.configListeners).forEach((key) => {
        this.configListeners[key]()
      })
    } catch (e) {
      logger.warn('[LinkCore] offConfigListeners===>', e)
    }
    this.configListeners = {}
  }

  setupLogger () {
    const { userConfig } = this.configManager
    const key = 'log-level'
    const logLevel = userConfig.get(key)
    logger.transports.file.level = logLevel

    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)
      logger.transports.file.level = newValue
    })

    // 注意：configListeners 的 key 必须唯一，watchCustomKeymapChange 中
    // 也监听了 'custom-keymap'，同名会覆盖导致前一个卸载函数丢失。
    const keymapKey = 'custom-keymap:menu'
    this.configListeners[keymapKey] = userConfig.onDidChange('custom-keymap', async (newValue, oldValue) => {
      try {
        logger.info('[LinkCore] detected custom-keymap change, rebuilding application menu')
        this.menuManager && this.menuManager.setup()
      } catch (e) {
        logger.warn('[LinkCore] rebuild menu failed after custom-keymap change:', e && e.message ? e.message : e)
      }
    })
  }

  initLocaleManager () {
    this.locale = this.configManager.getLocale()
    this.localeManager = setupLocaleManager(this.locale)
    this.i18n = this.localeManager.getI18n()
  }

  setupApplicationMenu () {
    this.menuManager = new MenuManager()
    this.menuManager.setup(this.locale)
  }

  adjustMenu () {
    if (is.mas()) {
      const visibleStates = {
        'app.check-for-updates': false,
        'task.new-bt-task': false
      }
      this.menuManager.updateMenuStates(visibleStates, null, null)
      this.trayManager.updateMenuStates(visibleStates, null, null)
    }
  }

  async startEngine () {
    const self = this

    try {
      // 智能合并 aria2.conf：更新未修改的配置项，添加新增项，移除已删除项
      const { platform, arch } = process
      mergeAria2Conf(platform, arch)

      // 每次启动生成随机 RPC secret，防止未授权的外部 RPC 访问。
      // secret 通过 systemConfig 传递给 Engine（命令行参数）和 EngineClient。
      const rpcSecret = randomBytes(16).toString('hex')
      this.configManager.setSystemConfig('rpc-secret', rpcSecret)

      this.engine = new Engine({
        systemConfig: this.configManager.getSystemConfig(),
        userConfig: this.configManager.getUserConfig(),
        configManager: this.configManager // 将configManager传递给Engine
      })
      await this.engine.start()
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      const detail = err && err.details
        ? String(err.details)
        : (err && err.stack ? String(err.stack) : '')
      dialog.showMessageBox({
        type: 'error',
        title: this.i18n.t('app.system-error-title'),
        message: this.i18n.t('app.system-error-message', { message }),
        detail: detail || undefined
      }).then(_ => {
        setTimeout(() => {
          self.quit()
        }, 100)
      })
    }
  }

  async stopEngine () {
    logger.info('[LinkCore] stopEngine===>')
    try {
      // 引擎已停止（如 will-quit 已调用 engine.stop()）时跳过所有 RPC 调用，
      // 避免 fetch failed 噪声和 undefined is not iterable 崩溃。
      if (!this.engine || !this.engine.instance) {
        logger.info('[LinkCore] Engine already stopped, skipping RPC shutdown')
        return
      }

      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

      await this.pauseTasksBeforeExit('shutdown')

      await Promise.race([
        this.engineClient.call('saveSession'),
        wait(1200)
      ])

      const graceful = await Promise.race([
        this.engineClient.shutdown({ force: false }),
        wait(1500)
      ])
      if (graceful !== 'OK') {
        await Promise.race([
          this.engineClient.shutdown({ force: true }),
          wait(1200)
        ])
      }
      logger.info('[LinkCore] stopEngine.engine.stop===>')
      // 直接 await engine.stop()，确保 app.exit() 前子进程已收到信号。
      // 原实现用 setImmediate 调度，但 quit() 紧接着调用 app.exit() 同步
      // 退出主进程，setImmediate 回调永不执行，导致引擎子进程变孤儿。
      await this.engine.stop()
    } catch (err) {
      logger.warn('[LinkCore] shutdown engine fail: ', err.message)
    } finally {
      // no finally
    }
  }

  initEngineClient () {
    const port = this.configManager.getSystemConfig('rpc-listen-port')
    const secret = this.configManager.getSystemConfig('rpc-secret')
    this.engineClient = new EngineClient({
      port,
      secret
    })
    // 引擎通知事件（onDownloadStart 等）广播到所有渲染窗口
    this.engineClient.setEventForwarder((name, ...args) => {
      this.broadcastEngineEvent(name, ...args)
    })
  }

  broadcastEngineEvent (name, ...args) {
    if (!this.windowManager) {
      return
    }
    this.windowManager.getWindowList().forEach((win) => {
      try {
        win.webContents.send('engine:event', { name, args })
      } catch (e) {}
    })
  }

  // 缓存 taskHistory store 实例，避免每次添加任务 / 退出时重复创建
  // electron-store 并全量解析历史 JSON（历史越大同步阻塞越明显）
  getTaskHistoryStore () {
    if (!this._taskHistoryStore) {
      const Store = require('electron-store')
      this._taskHistoryStore = new Store({
        name: 'taskHistory',
        // 与 quit() 中历史记录 store 的 cwd 保持一致
        cwd: process.env.NODE_ENV === 'development' ? './dev-config' : undefined
      })
    }
    return this._taskHistoryStore
  }

  async generateUniqueTaskName (suggestedFilename) {
    if (!suggestedFilename) {
      return suggestedFilename
    }

    try {
      const existingTasks = []
      const active = await this.engineClient.call('tellActive', ['gid', 'files'])
      if (Array.isArray(active) && active.length > 0) {
        existingTasks.push(...active)
      }
      const waiting = await this.engineClient.call('tellWaiting', 0, 1000, ['gid', 'files'])
      if (Array.isArray(waiting) && waiting.length > 0) {
        existingTasks.push(...waiting)
      }
      const stopped = await this.engineClient.call('tellStopped', 0, 10000, ['gid', 'files'])
      if (Array.isArray(stopped) && stopped.length > 0) {
        existingTasks.push(...stopped)
      }

      const existingNames = new Set()
      for (const task of existingTasks) {
        if (task.files && task.files.length > 0) {
          const path = task.files[0].path || ''
          const name = basename(path)
          if (name) {
            existingNames.add(name)
          }
        }
      }

      const historyTasks = this.getTaskHistoryStore().get('tasks', [])
      const deletedGids = new Set(
        (Array.isArray(this.getTaskHistoryStore().get('deletedGids', [])) ? this.getTaskHistoryStore().get('deletedGids', []) : [])
          .map(gid => `${gid}`)
      )
      if (Array.isArray(historyTasks)) {
        for (const task of historyTasks) {
          if (!task || deletedGids.has(`${task.gid || ''}`)) {
            continue
          }
          let name = null
          if (task.files && task.files.length > 0) {
            const path = task.files[0].path || ''
            name = basename(path)
          }
          if (!name && task.name) {
            name = task.name
          }
          if (name) {
            existingNames.add(name)
          }
        }
      }

      if (!existingNames.has(suggestedFilename)) {
        return suggestedFilename
      }

      const ext = extname(suggestedFilename)
      const baseName = basename(suggestedFilename, ext)

      for (let i = 1; i <= 100; i++) {
        const newName = `${baseName} (${i})${ext}`
        if (!existingNames.has(newName)) {
          return newName
        }
      }

      return suggestedFilename
    } catch (err) {
      logger.warn('[LinkCore] Failed to generate unique task name:', err.message)
      return suggestedFilename
    }
  }

  initAutoLaunchManager () {
    this.autoLaunchManager = new AutoLaunchManager()
  }

  initEnergyManager () {
    this.energyManager = new EnergyManager()
  }

  initTrayManager () {
    this.trayManager = new TrayManager({
      theme: this.configManager.getUserConfig('tray-theme'),
      systemTheme: this.themeManager.getSystemTheme(),
      speedometer: this.configManager.getUserConfig('tray-speedometer'),
      runMode: this.configManager.getUserConfig('run-mode')
    })

    this.watchTraySpeedometerEnabledChange()
    this.watchCustomKeymapChange()

    this.trayManager.on('mouse-down', ({ focused }) => {
      this.sendCommandToAll('application:update-tray-focused', { focused })
    })

    this.trayManager.on('mouse-up', ({ focused }) => {
      this.sendCommandToAll('application:update-tray-focused', { focused })
    })

    this.trayManager.on('drop-files', (files = []) => {
      this.handleFile(files[0])
    })

    this.trayManager.on('drop-text', (text) => {
      this.handleProtocol(text)
    })
  }

  watchTraySpeedometerEnabledChange () {
    const { userConfig } = this.configManager
    const key = 'tray-speedometer'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)
      this.trayManager.handleSpeedometerEnableChange(newValue)
    })
  }

  watchCustomKeymapChange () {
    const { userConfig } = this.configManager
    const key = 'custom-keymap'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)
      if (this.menuManager) {
        this.menuManager.setup(this.locale)
      } else {
        logger.warn('[LinkCore] menuManager not initialized')
      }
    })
  }

  initDockManager () {
    this.dockManager = new DockManager({
      runMode: this.configManager.getUserConfig('run-mode')
    })
  }

  watchOpenAtLoginChange () {
    const { userConfig } = this.configManager
    const key = 'open-at-login'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)
      if (is.linux()) {
        return
      }

      if (newValue) {
        this.autoLaunchManager.enable()
      } else {
        this.autoLaunchManager.disable()
      }
    })
  }

  watchProtocolsChange () {
    const { userConfig } = this.configManager
    const key = 'protocols'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)

      if (!newValue || isEqual(newValue, oldValue)) {
        return
      }

      logger.info('[LinkCore] setup protocols client:', newValue)
      if (this.protocolManager) {
        this.protocolManager.setup(newValue)
      } else {
        logger.warn('[LinkCore] protocolManager not initialized')
      }
    })
  }

  watchRunModeChange () {
    const { userConfig } = this.configManager
    const key = 'run-mode'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)
      this.trayManager.handleRunModeChange(newValue)

      if (newValue !== APP_RUN_MODE.TRAY) {
        this.dockManager.show()
      } else {
        this.dockManager.hide()
        // Hiding the dock icon will trigger the entire app to hide.
        this.show()
      }
    })
  }

  watchProxyChange () {
    const { userConfig } = this.configManager
    const key = 'proxy'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)
      this.updateManager.setupProxy(newValue)

      const { server, bypass, scope = [] } = newValue
      // 兼容旧版配置（enable 字段）
      let proxyMode = newValue.mode
      if (!proxyMode && newValue.enable !== undefined) {
        proxyMode = newValue.enable ? PROXY_MODE.CUSTOM : PROXY_MODE.NONE
      }

      let system = {}
      if (proxyMode === PROXY_MODE.CUSTOM && server && scope.includes(PROXY_SCOPES.DOWNLOAD)) {
        system = {
          'all-proxy': server,
          'no-proxy': bypass
        }
      } else if (proxyMode === PROXY_MODE.SYSTEM && scope.includes(PROXY_SCOPES.DOWNLOAD)) {
        const systemProxy = await getSystemHttpProxy()
        if (systemProxy) {
          system = {
            'all-proxy': systemProxy,
            'no-proxy': bypass
          }
        } else {
          system = {
            'all-proxy': '',
            'no-proxy': ''
          }
        }
      } else {
        system = {
          'all-proxy': '',
          'no-proxy': ''
        }
      }
      this.configManager.setSystemConfig(system)
      this.engineClient.call('changeGlobalOption', system)

      if (scope.includes(PROXY_SCOPES.DOWNLOAD)) {
        setTimeout(() => {
          this.engineClient.call('pauseAll')
          setTimeout(() => {
            this.engineClient.call('unpauseAll')
          }, 200)
        }, 0)
      }
    })
  }

  watchLocaleChange () {
    const { userConfig } = this.configManager
    const key = 'locale'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)
      this.localeManager.changeLanguageByLocale(newValue)
        .then(() => {
          this.menuManager.handleLocaleChange(newValue)
          this.trayManager.handleLocaleChange(newValue)
        })
        .catch((err) => {
          logger.warn('[LinkCore] failed to apply locale change:', err)
        })
      const resolvedLocale = getLanguage(newValue)
      this.sendCommandToAll('application:update-locale', { locale: resolvedLocale })
    })
  }

  watchThemeChange () {
    const { userConfig } = this.configManager
    const key = 'theme'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)
      this.themeManager.updateSystemTheme(newValue)
      this.sendCommandToAll('application:update-theme', { theme: newValue })
    })
  }

  watchAutoCheckUpdateChange () {
    const { userConfig } = this.configManager
    const key = 'auto-check-update'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)
      if (this.updateManager && typeof this.updateManager.setAutoCheckEnabled === 'function') {
        this.updateManager.setAutoCheckEnabled(!!newValue)
      }
    })
  }

  watchShowProgressBarChange () {
    const { userConfig } = this.configManager
    const key = 'show-progress-bar'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue, oldValue)

      if (newValue) {
        this.bindProgressChange()
      } else {
        this.unbindProgressChange()
      }
    })
  }

  initUPnPManager () {
    this.upnp = new UPnPManager()

    this.watchUPnPEnabledChange()

    this.watchUPnPPortsChange()

    const enabled = this.configManager.getUserConfig('enable-upnp')
    if (!enabled) {
      return
    }

    this.startUPnPMapping()
  }

  async startUPnPMapping () {
    // 分工：BT TCP 端口由引擎端 UPnPContext/NatPmpContext 映射（与 DHT
    // 防火墙感知联动、UPnP 失败自动回退 NAT-PMP）；主进程只负责引擎不
    // 映射的 DHT UDP 端口，避免同一端口被两端重复映射（部分路由器上
    // 两次 AddPortMapping 会互相覆盖，导致映射失效）。
    const dhtPort = this.configManager.getSystemConfig('dht-listen-port')

    try {
      await this.upnp.map(dhtPort)
    } catch (e) {
      logger.warn('[LinkCore] start UPnP mapping fail', e.message)
    }
  }

  async stopUPnPMapping () {
    const dhtPort = this.configManager.getSystemConfig('dht-listen-port')

    try {
      await this.upnp.unmap(dhtPort)
    } catch (e) {
      logger.warn('[LinkCore] stop UPnP mapping fail', e)
    }
  }

  watchUPnPPortsChange () {
    const { systemConfig } = this.configManager
    // 只监听 DHT 端口：BT TCP 端口的映射/重映射由引擎侧负责，
    // 主进程不参与，避免双端竞争同一映射。
    const watchKeys = ['dht-listen-port']

    watchKeys.forEach((key) => {
      this.configListeners[key] = systemConfig.onDidChange(key, async (newValue, oldValue) => {
        logger.info('[LinkCore] detected port change event:', key, newValue, oldValue)
        const enable = this.configManager.getUserConfig('enable-upnp')
        if (!enable) {
          return
        }

        const promises = [
          this.upnp.unmap(oldValue),
          this.upnp.map(newValue)
        ]
        try {
          await Promise.allSettled(promises)
        } catch (e) {
          logger.info('[LinkCore] change UPnP port mapping failed:', e)
        }
      })
    })
  }

  watchUPnPEnabledChange () {
    const { userConfig } = this.configManager
    const key = 'enable-upnp'
    this.configListeners[key] = userConfig.onDidChange(key, async (newValue, oldValue) => {
      logger.info('[LinkCore] detected enable-upnp value change event:', newValue, oldValue)
      if (newValue) {
        this.startUPnPMapping()
      } else {
        await this.stopUPnPMapping()
        this.upnp.closeClient()
      }
    })
  }

  async shutdownUPnPManager () {
    const enable = this.configManager.getUserConfig('enable-upnp')
    if (enable) {
      await this.stopUPnPMapping()
    }

    this.upnp.closeClient()
  }

  syncTrackers (source, proxy) {
    if (isEmpty(source)) {
      return
    }

    setTimeout(() => {
      fetchBtTrackerFromSource(source, proxy).then((data) => {
        logger.warn('[LinkCore] auto sync tracker data:', data)
        if (!data || data.length === 0) {
          return
        }

        // Split raw text responses into individual tracker URLs and
        // deduplicate — different sources often return overlapping trackers.
        const uniqueTrackers = deduplicateTrackers(data)
        let tracker = uniqueTrackers.join(',')
        tracker = reduceTrackerString(tracker)
        this.savePreference({
          system: {
            'bt-tracker': tracker
          },
          user: {
            'last-sync-tracker-time': Date.now()
          }
        })
      }).catch((err) => {
        logger.warn('[LinkCore] auto sync tracker failed:', err.message)
      })
    }, 500)
  }

  autoSyncTrackers () {
    const enable = this.configManager.getUserConfig('auto-sync-tracker')
    const lastTime = this.configManager.getUserConfig('last-sync-tracker-time')

    // 获取用户自定义的更新间隔和具体时间
    const customInterval = this.configManager.getUserConfig('auto-sync-tracker-interval')
    const customTime = this.configManager.getUserConfig('auto-sync-tracker-time')

    // 使用默认间隔或用户自定义间隔
    const interval = customInterval ? customInterval * ONE_HOUR : AUTO_SYNC_TRACKER_INTERVAL

    // 使用新的高级检查函数
    const result = checkIsNeedRunAdvanced(enable, lastTime, interval, customTime)
    logger.info('[LinkCore] auto sync tracker checkIsNeedRunAdvanced:', result, 'interval:', interval, 'customTime:', customTime)
    if (!result) {
      return
    }

    const source = this.configManager.getUserConfig('tracker-source')
    const proxy = this.configManager.getUserConfig('proxy', { enable: false })

    this.syncTrackers(source, proxy)
  }

  syncEd2kServers (source, proxy) {
    if (isEmpty(source)) {
      return
    }

    setTimeout(() => {
      fetchEd2kServersFromSource(source, proxy).then((servers) => {
        logger.warn('[LinkCore] auto sync ed2k servers:', servers.length)
        if (!servers || servers.length === 0) {
          return
        }

        // Merge with builtin servers and dedupe
        const merged = [...new Set([...servers, ...BUILTIN_ED2K_SERVERS])]
        const serversStr = merged.join(',')

        this.savePreference({
          user: {
            'ed2k-default-servers': serversStr,
            'ed2k-last-sync-server-time': Date.now()
          }
        })
      }).catch((err) => {
        logger.warn('[LinkCore] auto sync ed2k servers failed:', err.message)
      })
    }, 500)
  }

  autoSyncEd2kServers () {
    const enable = this.configManager.getUserConfig('ed2k-auto-sync-server')
    const lastTime = this.configManager.getUserConfig('ed2k-last-sync-server-time')

    const customInterval = this.configManager.getUserConfig('ed2k-auto-sync-server-interval')
    const customTime = this.configManager.getUserConfig('ed2k-auto-sync-server-time')

    const interval = customInterval ? customInterval * ONE_HOUR : AUTO_SYNC_ED2K_SERVER_INTERVAL

    const result = checkIsNeedRunAdvanced(enable, lastTime, interval, customTime)
    logger.info('[LinkCore] auto sync ed2k servers checkIsNeedRunAdvanced:', result, 'interval:', interval, 'customTime:', customTime)
    if (!result) {
      return
    }

    const source = this.configManager.getUserConfig('ed2k-server-source')
    const proxy = this.configManager.getUserConfig('proxy', { enable: false })

    this.syncEd2kServers(source, proxy)
  }

  async autoResumeTask () {
    const enabled = this.configManager.getUserConfig('resume-all-when-app-launched')
    if (!enabled) {
      return
    }

    // 获取所有暂停的任务
    try {
      const waitingTasks = await this.engineClient.call('tellWaiting', 0, 1000)
      if (!waitingTasks || waitingTasks.length === 0) {
        return
      }

      // 筛选出可以恢复的任务
      const tasksToResume = []
      for (const task of waitingTasks) {
        const { status, bittorrent, files } = task
        // 只处理暂停状态的任务
        if (status !== 'paused') {
          continue
        }

        // 允许自动恢复磁力任务以继续获取元数据，避免重启后长期停在 0 速度

        // 额外检查：如果是BT任务但没有文件信息，也跳过
        // 这种情况可能是元数据正在获取中
        if (bittorrent && (!files || files.length === 0)) {
          logger.info(`[LinkCore] Skipping BT task ${task.gid} - no files info yet`)
          continue
        }

        // 检查是否是元数据任务（名称以[METADATA]开头）
        const taskName = files && files.length > 0 && files[0].path ? files[0].path : ''
        if (taskName.includes('[METADATA]')) {
          logger.info(`[LinkCore] Skipping metadata task ${task.gid}`)
          continue
        }

        tasksToResume.push(task.gid)
      }

      // 逐个恢复任务
      for (const gid of tasksToResume) {
        try {
          await this.engineClient.call('unpause', gid)
          logger.info(`[LinkCore] Resumed task: ${gid}`)
        } catch (err) {
          logger.warn(`[LinkCore] Failed to resume task ${gid}:`, err.message)
        }
      }
    } catch (error) {
      logger.warn('[LinkCore] Failed to auto resume tasks:', error.message)
      // 如果出错，不要回退到 unpauseAll，因为这可能会恢复不应该恢复的任务
    }
  }

  initWindowManager () {
    this.windowManager = new WindowManager({
      userConfig: this.configManager.getUserConfig()
    })

    this.windowManager.on('window-resized', (data) => {
      this.storeWindowState(data)
    })

    this.windowManager.on('window-moved', (data) => {
      this.storeWindowState(data)
    })

    this.windowManager.on('window-closed', (data) => {
      this.storeWindowState(data)
    })

    this.windowManager.on('enter-full-screen', (window) => {
      this.dockManager.show()
    })

    this.windowManager.on('leave-full-screen', (window) => {
      const mode = this.configManager.getUserConfig('run-mode')
      if (mode === APP_RUN_MODE.TRAY) {
        this.dockManager.hide()
      }
    })

    // Background memory release
    this.initBackgroundMemoryRelease()
  }

  initBackgroundMemoryRelease () {
    // Track if app is in background
    this.isAppInBackground = false

    // Listen to all window blur events
    app.on('browser-window-blur', () => {
      // Check if all windows are hidden/minimized
      const allWindowsHidden = this.windowManager.getWindowList().every(win => {
        return win && (!win.isVisible() || win.isMinimized())
      })

      if (allWindowsHidden && !this.isAppInBackground) {
        this.isAppInBackground = true
        logger.info('[LinkCore] App entered background, releasing memory')
        this.releaseBackgroundMemory()
      }
    })

    // Listen to window focus events
    app.on('browser-window-focus', () => {
      if (this.isAppInBackground) {
        this.isAppInBackground = false
        logger.info('[LinkCore] App returned to foreground')
      }
    })

    // 窗口在 start() 阶段才创建，init 时 getWindowList() 为空，
    // 直接遍历绑定是死代码。改为监听 browser-window-created，每个新窗口
    // 创建时绑定 hide/minimize，确保所有窗口（含后续打开的）都能触发检查。
    const checkAllWindowsHidden = () => {
      setTimeout(() => {
        const allWindowsHidden = this.windowManager.getWindowList().every(w => {
          return w && (!w.isVisible() || w.isMinimized())
        })
        if (allWindowsHidden && !this.isAppInBackground) {
          this.isAppInBackground = true
          logger.info('[LinkCore] All windows hidden/minimized, releasing memory')
          this.releaseBackgroundMemory()
        }
      }, 100)
    }

    app.on('browser-window-created', (event, win) => {
      win.on('hide', checkAllWindowsHidden)
      win.on('minimize', checkAllWindowsHidden)
    })
  }

  releaseBackgroundMemory () {
    try {
      // Send command to all renderer processes to release memory
      this.windowManager.getWindowList().forEach(win => {
        if (win && !win.isDestroyed() && win.webContents) {
          // 不再 clearCache()：清掉 HTTP 缓存会让回前台时重新拉取全部资源，
          // 属于反优化。仅通知渲染进程做内存清理即可。
          win.webContents.send('application:background-memory-release')

          // Reduce polling frequency for background tasks
          win.webContents.send('application:reduce-polling-frequency')
        }
      })

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
        logger.info('[LinkCore] Forced garbage collection')
      }

      logger.info('[LinkCore] Background memory release completed')
    } catch (err) {
      logger.warn('[LinkCore] Failed to release background memory:', err.message)
    }
  }

  storeWindowState (data = {}) {
    const enabled = this.configManager.getUserConfig('keep-window-state')
    if (!enabled) {
      return
    }

    const state = this.configManager.getUserConfig('window-state', {})
    const { page, bounds } = data
    const newState = {
      ...state,
      [page]: bounds
    }
    this.configManager.setUserConfig('window-state', newState)
  }

  async start (page, options = {}) {
    try {
      await this._initPromise
    } catch (err) {
      logger.error('[LinkCore] Application init failed, cannot start:', err)
      return
    }

    const win = this.showPage(page, options)
    if (!win) {
      logger.error('[LinkCore] showPage returned null, cannot start')
      return
    }

    win.once('ready-to-show', () => {
      this.isReady = true
      this.emit('ready')
    })

    if (is.macOS() && this.touchBarManager) {
      this.touchBarManager.setup(page, win)
    }
  }

  /**
   * 当 activate 事件触发但 windowManager 未初始化时（init 失败的级联场景），
   * 重新尝试 init 并显示窗口。仅在 init 已 settle 后调用。
   */
  async retryStart (page = 'index') {
    try {
      await this._initPromise
    } catch (err) {
      logger.info('[LinkCore] Retrying init after previous failure:', err.message)
      this._initPromise = this.init()
      try {
        await this._initPromise
      } catch (retryErr) {
        logger.error('[LinkCore] Retry init failed:', retryErr.message)
        return
      }
    }

    if (!this.windowManager) {
      logger.error('[LinkCore] windowManager still not initialized after retry')
      return
    }

    const win = this.showPage(page)
    if (win && !this.isReady) {
      win.once('ready-to-show', () => {
        this.isReady = true
        this.emit('ready')
      })
    }
  }

  /**
   * 引擎是否仍在运行（用于退出流程判断是否需要 RPC 调用）
   */
  isEngineRunning () {
    return this.engine && this.engine.instance !== null
  }

  showPage (page, options = {}) {
    if (!this.windowManager) {
      logger.error('[LinkCore] windowManager is not initialized, cannot show page:', page)
      return null
    }
    const { openedAtLogin } = options
    const autoHideWindow = this.configManager ? this.configManager.getUserConfig('auto-hide-window') : false
    return this.windowManager.openWindow(page, {
      hidden: openedAtLogin || autoHideWindow
    })
  }

  show (page = 'index') {
    if (!this.windowManager) {
      logger.error('[LinkCore] windowManager is not initialized, cannot show:', page)
      return
    }
    this.windowManager.showWindow(page)
  }

  startClipboardAutoOpenWatch () {
    if (this._clipboardWatchTimer) {
      return
    }
    // 未开启自动弹出添加任务时不启动常驻剪贴板轮询，避免
    // 无意义的 800ms 系统级 clipboard.readText() 持续占用 CPU
    try {
      const raw = this.configManager.getUserConfig('clipboard-auto-open-add-task')
      if (raw !== undefined && !raw) {
        return
      }
    } catch (e) {}
    try {
      this._clipboardLastText = `${clipboard.readText() || ''}`
    } catch (e) {
      this._clipboardLastText = ''
    }
    this._clipboardWatchTimer = setInterval(() => {
      this.checkClipboardAndAutoOpenAddTask()
    }, 800)
  }

  stopClipboardAutoOpenWatch () {
    if (this._clipboardWatchTimer) {
      clearInterval(this._clipboardWatchTimer)
      this._clipboardWatchTimer = null
    }
  }

  // 运行期开关剪贴板监听：用户在偏好设置里开启/关闭时即时生效，无需重启
  watchClipboardAutoOpenChange () {
    const { userConfig } = this.configManager
    const key = 'clipboard-auto-open-add-task'
    this.configListeners[key] = userConfig.onDidChange(key, (newValue) => {
      logger.info(`[LinkCore] detected ${key} value change event:`, newValue)
      if (newValue) {
        this.startClipboardAutoOpenWatch()
      } else {
        this.stopClipboardAutoOpenWatch()
      }
    })
  }

  isDownloadLinkLine (line = '') {
    const s = `${line}`.trim()
    if (!s) return false
    const lower = s.toLowerCase()
    if (lower.startsWith('magnet:') || lower.startsWith('thunder://') || lower.startsWith('ftp://')) {
      return true
    }
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
      return false
    }

    let url
    try {
      url = new URL(s)
    } catch (_) {
      return false
    }

    const pathname = `${url.pathname || ''}`.toLowerCase()

    const lastSegment = pathname.split('/').filter(Boolean).slice(-1)[0] || ''
    const dotIndex = lastSegment.lastIndexOf('.')
    if (dotIndex > 0 && dotIndex < lastSegment.length - 1) {
      const ext = lastSegment.slice(dotIndex + 1)
      if (ext.length >= 2 && ext.length <= 8 && /[a-z]/i.test(ext)) {
        return true
      }
    }

    const search = `${url.search || ''}`.toLowerCase()
    if (search.includes('response-content-disposition=') || search.includes('filename=') || search.includes('download=') || search.includes('attachment=1')) {
      return true
    }

    if (pathname.includes('/download') || pathname.includes('/downloads') || pathname.includes('/dl/')) {
      return true
    }

    return false
  }

  getDownloadUriFromClipboardHtml (plainText = '') {
    let html = ''
    try {
      html = `${clipboard.readHTML() || ''}`.trim()
    } catch (e) {
      return ''
    }
    if (!html) return ''

    let baseOrigin = ''
    const baseMatch = /https?:\/\/[^\s"'<>]+/i.exec(html)
    if (baseMatch && baseMatch[0]) {
      try {
        baseOrigin = new URL(baseMatch[0]).origin
      } catch (_) {}
    }

    const hrefs = []
    const hrefRe = /href\s*=\s*["']([^"']+)["']/ig
    let match
    while ((match = hrefRe.exec(html))) {
      const raw = `${match[1] || ''}`.trim()
      if (!raw) continue
      hrefs.push(raw)
    }
    if (hrefs.length <= 0) return ''

    const name = `${plainText || ''}`.trim()
    const nameLower = name.toLowerCase()
    const looksLikeFileName = /\.[a-z0-9]{1,8}$/i.test(name) && /[a-z]/i.test(name)

    const normalizeHref = (h) => {
      let v = `${h || ''}`.trim()
      if (!v) return ''
      v = v.replace(/&amp;/g, '&')
      if (v.startsWith('//')) {
        v = `https:${v}`
      } else if (v.startsWith('/') && baseOrigin) {
        v = `${baseOrigin}${v}`
      }
      return sanitizeLink(v)
    }

    const safeDecode = (v) => {
      try {
        return decodeURIComponent(v)
      } catch (_) {
        return v
      }
    }

    const candidates = hrefs.map(normalizeHref).filter(Boolean)

    if (looksLikeFileName && nameLower) {
      for (const c of candidates) {
        const rawLower = `${c}`.toLowerCase()
        const decodedLower = `${safeDecode(c)}`.toLowerCase()
        if (rawLower.includes(nameLower) || decodedLower.includes(nameLower)) {
          if (this.isDownloadLinkLine(c)) return c
        }
      }
    }

    for (const c of candidates) {
      if (this.isDownloadLinkLine(c)) return c
    }

    return ''
  }

  checkClipboardAndAutoOpenAddTask () {
    let enabled = true
    try {
      const raw = this.configManager.getUserConfig('clipboard-auto-paste')
      enabled = raw === undefined ? true : !!raw
    } catch (e) {}
    if (!enabled) return

    let autoOpenEnabled = false
    try {
      const raw = this.configManager.getUserConfig('clipboard-auto-open-add-task')
      autoOpenEnabled = raw === undefined ? false : !!raw
    } catch (e) {}
    if (!autoOpenEnabled) return

    let text = ''
    try {
      text = `${clipboard.readText() || ''}`.trim()
    } catch (e) {
      return
    }
    if (!text) return
    if (text === this._clipboardLastText) return
    this._clipboardLastText = text

    let uri = ''
    if (detectResource(text)) {
      const lines = text.split(/\r?\n/).map(v => sanitizeLink(`${v}`.trim())).filter(Boolean)
      uri = lines.find(l => this.isDownloadLinkLine(l)) || ''
    }
    if (!uri) {
      uri = this.getDownloadUriFromClipboardHtml(text)
    }
    if (!uri) return

    const now = Date.now()
    if (now - (this._clipboardLastTriggerAt || 0) < 1200) return
    this._clipboardLastTriggerAt = now

    try {
      this.windowManager.bringToFront('index')
      this.sendCommandToAll('application:new-task', { type: ADD_TASK_TYPE.URI, uri })
    } catch (e) {}
  }

  hide (page) {
    if (!this.windowManager) return
    if (page) {
      this.windowManager.hideWindow(page)
    } else {
      this.windowManager.hideAllWindow()
    }
  }

  toggle (page = 'index') {
    if (!this.windowManager) return
    this.windowManager.toggleWindow(page)
  }

  closePage (page) {
    if (!this.windowManager) return
    this.windowManager.destroyWindow(page)
  }

  stop () {
    try {
      // 主动关闭引擎 WebSocket 客户端，停止自动重连定时器
      if (this.engineClient) {
        this.engineClient.close()
      }

      const promises = [
        this.stopEngine(),
        this.shutdownUPnPManager(),
        this.energyManager.stopPowerSaveBlocker(),
        this.trayManager.destroy()
      ]

      // 关闭HTTP服务器
      if (this.httpServer) {
        promises.push(new Promise((resolve) => {
          // 先强制销毁所有活跃连接
          if (this.httpConnections) {
            logger.info(`[LinkCore] Destroying ${this.httpConnections.size} active HTTP connections`)
            this.httpConnections.forEach(conn => {
              conn.destroy()
            })
            this.httpConnections.clear()
          }

          // 设置超时，如果1秒内没有关闭就强制resolve
          const timeout = setTimeout(() => {
            logger.warn('[LinkCore] HTTP server close timeout, forcing shutdown')
            resolve()
          }, 1000)

          // 关闭服务器
          this.httpServer.close(() => {
            clearTimeout(timeout)
            logger.info('[LinkCore] App HTTP server closed gracefully')
            resolve()
          })
        }))
      }

      return promises
    } catch (err) {
      logger.warn('[LinkCore] stop error: ', err.message)
      // 必须返回数组，否则 Promise.allSettled(undefined) 会抛错导致 quit 失败
      return []
    }
  }

  async stopAllSettled () {
    await Promise.allSettled(this.stop() || [])
  }

  async pauseTasksBeforeExit (reason) {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))
    try {
      logger.info(`[LinkCore] Pausing tasks before ${reason}`)
      const [activeTasks, waitingTasks] = await Promise.all([
        this.engineClient.call('tellActive'),
        this.engineClient.call('tellWaiting', 0, 1000)
      ])
      const tasks = [
        ...(Array.isArray(activeTasks) ? activeTasks : []),
        ...(Array.isArray(waitingTasks) ? waitingTasks : [])
      ]
      if (tasks.length === 0) {
        logger.info('[LinkCore] No active or waiting tasks found')
        return
      }
      logger.info(`[LinkCore] Found ${tasks.length} active/waiting tasks, pausing them...`)
      const pausePromises = tasks.map(task => {
        const gid = task && task.gid
        if (!gid) {
          return Promise.resolve()
        }
        const method = task && task.bittorrent ? 'forcePause' : 'pause'
        return this.engineClient.call(method, gid)
      })
      await Promise.allSettled(pausePromises)
      logger.info('[LinkCore] All active/waiting tasks paused')
      await wait(500)
    } catch (error) {
      logger.warn('[LinkCore] Failed to pause tasks:', error.message)
    }
  }

  async quit () {
    // 退出前停止剪贴板轮询与其它常驻定时器，避免退出路径残留
    this.stopClipboardAutoOpenWatch()
    this.stopTokenCleanupTimer()

    // 清理任务计划 / 更新状态轮询 / 会话重置定时器
    if (this._taskPlanCheckTimer) {
      clearTimeout(this._taskPlanCheckTimer)
      this._taskPlanCheckTimer = null
    }
    if (this._taskPlanScheduleTimer) {
      clearTimeout(this._taskPlanScheduleTimer)
      this._taskPlanScheduleTimer = null
    }
    if (this._updateStatusWatchTimer) {
      clearTimeout(this._updateStatusWatchTimer)
      this._updateStatusWatchTimer = null
    }
    if (this._resetSessionTimer) {
      clearTimeout(this._resetSessionTimer)
      this._resetSessionTimer = null
    }

    // 引擎未运行时跳过 RPC 调用，避免大量 fetch failed 警告
    const engineRunning = this.isEngineRunning()

    if (engineRunning) {
      await this.pauseTasksBeforeExit('quit')
    }

    // Check if auto-purge-record is enabled and purge records before quitting
    const autoPurgeRecord = this.configManager.getUserConfig('auto-purge-record', false)
    if (autoPurgeRecord) {
      try {
        logger.info('[LinkCore] Auto-purging download records before quit')
        // 清除 aria2 引擎中的下载记录
        if (engineRunning) {
          await this.engineClient.call('purgeDownloadResult')
        }

        // 清除本地存储的历史记录
        this.getTaskHistoryStore().set('tasks', [])
        this.getTaskHistoryStore().set('deletedGids', [])
        logger.info('[LinkCore] Download records purged successfully')
      } catch (error) {
        logger.warn('[LinkCore] Failed to purge download records:', error.message)
      }
    } else {
      // 如果未启用自动清除，则在退出前保存所有任务到历史记录
      if (engineRunning) {
        try {
          logger.info('[LinkCore] Saving all tasks to history before quit')
          // 获取所有任务（包括活跃、等待和已停止的任务），三路并行拉取
          const allTasks = await Promise.all([
            this.engineClient.call('tellActive'),
            this.engineClient.call('tellWaiting', 0, 1000),
            this.engineClient.call('tellStopped', 0, 10000)
          ])
            .then(([activeTasks, waitingTasks, stoppedTasks]) => {
              return [
                ...(Array.isArray(activeTasks) ? activeTasks : []),
                ...(Array.isArray(waitingTasks) ? waitingTasks : []),
                ...(Array.isArray(stoppedTasks) ? stoppedTasks : [])
              ]
            })
            .catch(error => {
              logger.warn('[LinkCore] Failed to fetch all tasks before quit:', error.message)
              return []
            })

          if (allTasks.length > 0) {
            // 保存任务到历史记录
            const taskHistoryStore = this.getTaskHistoryStore()

            const currentHistoryRaw = taskHistoryStore.get('tasks', [])
            const currentHistory = Array.isArray(currentHistoryRaw) ? currentHistoryRaw : []

            // 已删除任务的 gid 黑名单：本次运行中删除的任务不再写回历史，防止退出后复活
            const deletedGids = new Set(
              (Array.isArray(taskHistoryStore.get('deletedGids', [])) ? taskHistoryStore.get('deletedGids', []) : [])
                .map(gid => `${gid}`)
            )

            // 过滤需要保存的任务（仅保存已停止状态的任务，排除元数据解析任务和已删除任务）
            const tasksToSave = allTasks.filter(task => {
              const { status } = task
              // 检查是否为种子解析任务 - 这些是临时任务，不应该保存到历史记录
              const isMetadataTask = task.name && task.name.startsWith('[METADATA]')
              if (isMetadataTask) {
                return false
              }
              if (deletedGids.has(`${task.gid || ''}`)) {
                return false
              }
              // 仅保存已停止状态的任务
              return ['complete', 'error', 'removed'].includes(status)
            })

            // 历史记录中残留的已删除任务一并移除
            let updatedHistory = [...currentHistory]
            if (deletedGids.size > 0) {
              updatedHistory = updatedHistory.filter(t => !t || !t.gid || !deletedGids.has(`${t.gid}`))
            }
            tasksToSave.forEach(task => {
              if (!task || !task.gid) {
                return
              }
              const idx = updatedHistory.findIndex(t => t && t.gid === task.gid)
              if (idx === -1) {
                updatedHistory.push({
                  ...task,
                  savedAt: Date.now()
                })
                return
              }
              const prev = updatedHistory[idx] || {}
              if (prev.deletedAt) {
                return
              }
              const savedAt = prev.savedAt != null ? prev.savedAt : Date.now()
              updatedHistory[idx] = {
                ...prev,
                ...task,
                savedAt
              }
            })

            // 限制历史总量，防止 taskHistory.json 无限膨胀导致每次
            // 读取/写入都全量序列化大数组（同步阻塞主进程、增大内存）
            const MAX_HISTORY_SIZE = 5000
            if (updatedHistory.length > MAX_HISTORY_SIZE) {
              updatedHistory = updatedHistory.slice(-MAX_HISTORY_SIZE)
            }

            taskHistoryStore.set('tasks', updatedHistory)
            logger.info(`[LinkCore] Saved ${tasksToSave.length} tasks to history before quit`)
          }
        } catch (error) {
          logger.warn('[LinkCore] Failed to save tasks to history before quit:', error.message)
        }
      }
    }

    await this.stopAllSettled()
    app.exit()
  }

  sendCommand (command, ...args) {
    if (!this.emit(command, ...args)) {
      const window = this.windowManager.getFocusedWindow()
      if (window) {
        this.windowManager.sendCommandTo(window, command, ...args)
      }
    }
  }

  sendCommandToAll (command, ...args) {
    if (!this.emit(command, ...args)) {
      this.windowManager.getWindowList().forEach(window => {
        this.windowManager.sendCommandTo(window, command, ...args)
      })
    }
  }

  sendMessageToAll (channel, ...args) {
    this.windowManager.getWindowList().forEach(window => {
      this.windowManager.sendMessageTo(window, channel, ...args)
    })
  }

  initThemeManager () {
    this.themeManager = new ThemeManager()
    const theme = this.configManager.getUserConfig('theme')
    if (theme) {
      this.themeManager.updateSystemTheme(theme)
    }
    this.themeManager.on('system-theme-change', (theme) => {
      this.trayManager.handleSystemThemeChange(theme)
      this.sendCommandToAll('application:update-system-theme', { theme })
      this.sendMessageToAll('application:update-system-theme', { theme })
    })
  }

  initTouchBarManager () {
    if (!is.macOS()) {
      return
    }

    this.touchBarManager = new TouchBarManager()
  }

  initProtocolManager () {
    const protocols = this.configManager.getUserConfig('protocols', {})
    this.protocolManager = new ProtocolManager({
      protocols
    })
  }

  handleProtocol (url) {
    this.show()

    this.protocolManager.handle(url)
  }

  handleFile (filePath) {
    if (!filePath) {
      return
    }

    if (extname(filePath).toLowerCase() !== '.torrent') {
      return
    }

    this.show()

    const name = basename(filePath)
    readFile(filePath, (err, data) => {
      if (err) {
        logger.warn(`[LinkCore] read file error: ${filePath}`, err.message)
        return
      }
      const dataURL = Buffer.from(data).toString('base64')
      this.sendCommandToAll('application:new-bt-task-with-file', {
        name,
        dataURL
      })
    })
  }

  initUpdaterManager () {
    if (is.mas()) {
      return
    }

    const enabled = this.configManager.getUserConfig('auto-check-update', is.macOS())
    const autoCheck = enabled
    this.updateManager = new UpdateManager({
      autoCheck
    })

    // 设置安装前回调：停止引擎、保存会话
    this.updateManager.setBeforeInstallCallback(async () => {
      this._isQuittingForInstall = true
      this.windowManager.setWillQuit(true)
      await this.stopAllSettled()
    })

    this.handleUpdaterEvents()
  }

  handleUpdaterEvents () {
    this.updateManager.on('checking', (event) => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', false)
      this.trayManager.updateMenuItemEnabledState('app.check-for-updates', false)
      this.configManager.setUserConfig('last-check-update-time', Date.now())
    })

    this.updateManager.on('update-available', () => {
      this._updateStatusInitialized = true
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
      this.trayManager.updateMenuItemEnabledState('app.check-for-updates', true)
      const win = this.windowManager.getWindow('index')
      if (win) {
        win.setProgressBar(-1)
      }
    })

    this.updateManager.on('download-progress', (event) => {
      const win = this.windowManager.getWindow('index')
      if (win && !win.isDestroyed()) {
        win.setProgressBar(event.percent / 100)
      }
    })

    this.updateManager.on('update-not-available', (event) => {
      this._updateStatusInitialized = true
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
      this.trayManager.updateMenuItemEnabledState('app.check-for-updates', true)
    })

    this.updateManager.on('update-downloaded', (event) => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
      this.trayManager.updateMenuItemEnabledState('app.check-for-updates', true)
      const win = this.windowManager.getWindow('index')
      if (win) win.setProgressBar(1)
    })

    this.updateManager.on('update-cancelled', (event) => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
      this.trayManager.updateMenuItemEnabledState('app.check-for-updates', true)
      const win = this.windowManager.getWindow('index')
      if (win) win.setProgressBar(-1)
    })

    this.updateManager.on('installing-update', () => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', false)
      this.trayManager.updateMenuItemEnabledState('app.check-for-updates', false)
    })

    this.updateManager.on('update-error', (event) => {
      this.menuManager.updateMenuItemEnabledState('app.check-for-updates', true)
      this.trayManager.updateMenuItemEnabledState('app.check-for-updates', true)
    })
  }

  async relaunch () {
    await this.stopAllSettled()
    app.relaunch()
    app.exit()
  }

  async resetSession () {
    await this.stopEngine()

    app.clearRecentDocuments()

    const sessionPath = this.context.get('session-path')
    // 保存句柄以便 quit() 时取消，避免退出竞态下 3 秒后引擎又被拉起
    this._resetSessionTimer = setTimeout(async () => {
      this._resetSessionTimer = null
      unlink(sessionPath, (err) => {
        logger.info('[LinkCore] Removed the download seesion file:', err)
      })

      await this.engine.start()
    }, 3000)
  }

  savePreference (config = {}) {
    logger.info('[LinkCore] save preference:', config)
    const { system, user } = config
    if (!isEmpty(system)) {
      console.info('[LinkCore] main save system config: ', system)
      this.configManager.setSystemConfig(system)
      // 热更新运行中的引擎。部分键是引擎 startup-only 选项（如
      // enable-dht / dht-listen-port），changeGlobalOption 会返回错误
      // —— 静默忽略即可：持久化配置在下次引擎启动时经 getStartArgs
      // 生效，不应因热更新失败影响保存流程。
      this.engineClient.changeGlobalOption(system).catch((e) => {
        logger.warn('[LinkCore] changeGlobalOption (best-effort) failed:', e && e.message)
      })
    }

    if (!isEmpty(user)) {
      console.info('[LinkCore] main save user config: ', user)
      this.configManager.setUserConfig(user)
      // NAT/传输类开关（enable-upnp / enable-utp / enable-nat-pmp）属于
      // userKeys（Engine.js 从 userConfig 注入启动参数），引擎侧现已
      // 注册 changeGlobalOption 支持——这里单独热更新推送，让开关无需
      // 重启引擎即可生效（UPnP/NAT-PMP 的实际端口映射动作仍在引擎
      // 启动期执行，热更新仅更新配置值）。
      const natTransportKeys = ['enable-upnp', 'enable-utp', 'enable-nat-pmp']
      const hotNat = {}
      for (const k of natTransportKeys) {
        if (user[k] !== undefined) {
          hotNat[k] = user[k]
        }
      }
      if (!isEmpty(hotNat)) {
        this.engineClient.changeGlobalOption(hotNat).catch((e) => {
          logger.warn('[LinkCore] changeGlobalOption (NAT/transport) failed:', e && e.message)
        })
      }
      if (
        Object.prototype.hasOwnProperty.call(user, 'task-plan-action') ||
        Object.prototype.hasOwnProperty.call(user, 'task-plan-type') ||
        Object.prototype.hasOwnProperty.call(user, 'task-plan-time') ||
        Object.prototype.hasOwnProperty.call(user, 'task-plan-gids') ||
        Object.prototype.hasOwnProperty.call(user, 'task-plan-only-when-idle')
      ) {
        this._taskPlanTriggered = false
        this._taskPlanScheduledNotBeforeTime = null
        this.scheduleCheckTaskPlan(0)
      }
    }
  }

  getTaskPlanAction () {
    const raw = this.configManager.getUserConfig('task-plan-action', 'none')
    const action = `${raw || 'none'}`
    if ([
      'none',
      'resume-selected',
      'resume-all',
      'pause-selected',
      'pause-all',
      'shutdown',
      'sleep',
      'quit'
    ].includes(action)) {
      return action
    }
    return 'none'
  }

  getTaskPlanGids () {
    const raw = this.configManager.getUserConfig('task-plan-gids', [])
    const list = Array.isArray(raw) ? raw : []
    return list.map(x => `${x || ''}`.trim()).filter(Boolean)
  }

  getTaskPlanOnlyWhenIdle () {
    return !!this.configManager.getUserConfig('task-plan-only-when-idle', false)
  }

  getTaskPlanType () {
    const raw = this.configManager.getUserConfig('task-plan-type', 'complete')
    const type = `${raw || 'complete'}`
    if (['complete', 'scheduled'].includes(type)) {
      return type
    }
    return 'complete'
  }

  getTaskPlanTime () {
    const raw = this.configManager.getUserConfig('task-plan-time', '')
    const value = `${raw || ''}`
    if (!value) {
      return ''
    }
    const m = value.match(/^(\d{2}):(\d{2})$/)
    if (!m) {
      return ''
    }
    const hh = Number(m[1])
    const mm = Number(m[2])
    if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return ''
    }
    return value
  }

  getTaskPlanScheduledDelayMs (time) {
    const m = `${time || ''}`.match(/^(\d{2}):(\d{2})$/)
    if (!m) {
      return null
    }
    const hh = Number(m[1])
    const mm = Number(m[2])
    if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null
    }
    const now = new Date()
    const target = new Date(now.getTime())
    target.setHours(hh, mm, 0, 0)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target.getTime() - now.getTime()
  }

  async triggerScheduledTaskPlan () {
    try {
      const action = this.getTaskPlanAction()
      const type = this.getTaskPlanType()
      const time = this.getTaskPlanTime()
      const onlyWhenIdle = this.getTaskPlanOnlyWhenIdle()

      if (action === 'none' || type !== 'scheduled' || !time) {
        this._taskPlanTriggered = false
        this._taskPlanScheduledNotBeforeTime = null
        return
      }

      if (this._taskPlanTriggered) {
        return
      }
      if (onlyWhenIdle) {
        this._taskPlanScheduledNotBeforeTime = Date.now()
        this._taskPlanTriggered = false
        this.scheduleCheckTaskPlan(0)
        return
      }

      this._taskPlanTriggered = true

      try {
        await this.engineClient.call('saveSession')
      } catch (e) {}

      const ok = await this.executeTaskPlanAction(action)
      if (!ok) {
        this._taskPlanTriggered = false
        this.scheduleCheckTaskPlan(2000)
      }
    } catch (e) {
      this._taskPlanTriggered = false
      throw e
    }
  }

  isActiveTaskDownloaded (task = {}) {
    const total = Number(task.totalLength || 0)
    const completed = Number(task.completedLength || 0)
    if (total <= 0) {
      return false
    }
    return completed >= total
  }

  performSecurityScan (task, filePath) {
    const window = this.windowManager && this.windowManager.getWindow('index')
    const sendStatus = (status, extra = {}) => {
      try {
        if (!window || !window.webContents || !task || !task.gid || !filePath) {
          return
        }
        window.webContents.send('security-scan-status', {
          gid: task.gid,
          filePath,
          status,
          ...extra
        })
      } catch (e) {
        logger.warn('[LinkCore] send security-scan-status failed:', e.message)
      }
    }

    try {
      const enableSecurityScan = this.configManager.getUserConfig('enable-security-scan')
      if (!enableSecurityScan) {
        sendStatus('skipped')
        return
      }

      const securityScanTool = this.configManager.getUserConfig('security-scan-tool') || 'system'
      const customSecurityScanPath = this.configManager.getUserConfig('custom-security-scan-path')

      const fs = require('fs')

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        logger.warn('[LinkCore] Security scan: file not found:', filePath)
        sendStatus('failed', { reason: 'file-not-found' })
        return
      }

      let scanCommand = ''
      let scanArgs = []

      if (securityScanTool === 'custom') {
        // 使用自定义杀毒软件
        if (!customSecurityScanPath || !fs.existsSync(customSecurityScanPath)) {
          logger.warn('[LinkCore] Security scan: custom antivirus not found:', customSecurityScanPath)
          sendStatus('failed', { reason: 'custom-tool-not-found' })
          return
        }
        scanCommand = customSecurityScanPath
        scanArgs = [filePath]
      } else {
        // 使用系统默认杀毒软件（三平台，退出码语义各自正确）
        if (is.windows()) {
          // Windows Defender 命令行工具：退出码 0=干净，2=发现威胁，其他=错误。
          // （Start-MpScan 是 PowerShell cmdlet，退出码恒 0，无法反映扫描结果，
          // 故改用 MpCmdRun.exe）
          const candidatePaths = [
            'C:\\Program Files\\Windows Defender\\MpCmdRun.exe',
            'C:\\Program Files (x86)\\Windows Defender\\MpCmdRun.exe'
          ]
          const mpCmd = candidatePaths.find(p => {
            try { return fs.existsSync(p) } catch (_) { return false }
          })
          if (!mpCmd) {
            logger.warn('[LinkCore] Security scan: MpCmdRun.exe not found on Windows, skipping scan')
            sendStatus('skipped', { reason: 'defender-tool-not-found' })
            return
          }
          scanCommand = mpCmd
          scanArgs = ['-Scan', '-ScanType', '3', '-File', filePath]
        } else if (is.macOS()) {
          // macOS 没有免费命令行杀毒引擎，改用隔离属性（quarantine）判定：
          // com.apple.quarantine 存在 = 文件来自外部来源（下载/邮件），
          // 触发 warning 级提示；不存在 = 本地安全。
          // xattr -p 退出码：0=有该属性，1=无该属性。
          scanCommand = 'xattr'
          scanArgs = ['-p', 'com.apple.quarantine', filePath]
        } else if (is.linux()) {
          // Linux 尝试使用 ClamAV
          // 先检查 clamscan 是否存在
          const { execSync } = require('child_process')
          try {
            execSync('which clamscan', { stdio: 'ignore' })
            scanCommand = 'clamscan'
            scanArgs = ['--no-summary', filePath]
          } catch (e) {
            logger.warn('[LinkCore] Security scan: clamscan not found on Linux, skipping scan')
            sendStatus('skipped', { reason: 'clamscan-not-installed' })
            return
          }
        } else {
          logger.warn('[LinkCore] Security scan: unsupported platform')
          sendStatus('skipped', { reason: 'unsupported-platform' })
          return
        }
      }

      logger.info('[LinkCore] Starting security scan:', filePath)
      sendStatus('running')

      const scanProcess = spawn(scanCommand, scanArgs, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stderr = ''

      if (scanProcess.stderr) {
        scanProcess.stderr.on('data', (data) => {
          stderr += data.toString()
        })
      }

      scanProcess.on('error', (error) => {
        logger.warn('[LinkCore] Security scan error:', error.message)
        sendStatus('failed', { reason: 'process-error', error: error.message })
      })

      scanProcess.on('exit', (code) => {
        logger.info('[LinkCore] Security scan exited with code:', code, '| stderr:', stderr)
        if (is.macOS()) {
          // xattr -p com.apple.quarantine：0 = 文件带隔离标记（外部来源，
          // 需用户注意），1 = 无隔离标记（本地/安全）
          if (code === 0) {
            sendStatus('failed', { reason: 'quarantine-flag', code })
          } else {
            sendStatus('success')
          }
          return
        }
        if (is.windows()) {
          // MpCmdRun.exe：0 = 干净，2 = 发现威胁，其他 = 扫描错误
          if (code === 2) {
            sendStatus('failed', { reason: 'virus-detected', code })
          } else if (code === 0) {
            sendStatus('success')
          } else {
            sendStatus('failed', { reason: 'scan-error', code })
          }
          return
        }
        // Linux clamscan：0 = 干净，1 = 发现病毒，其他 = 错误
        if (code === 0) {
          sendStatus('success')
        } else if (code === 1) {
          sendStatus('failed', { reason: 'virus-detected', code })
        } else {
          sendStatus('failed', { reason: 'scan-error', code })
        }
      })
    } catch (error) {
      logger.error('[LinkCore] Security scan failed:', error.message)
      sendStatus('failed', { reason: 'exception', error: error.message })
    }
  }

  scheduleCheckTaskPlan (delay = 800) {
    const action = this.getTaskPlanAction()
    if (action === 'none') {
      if (this._taskPlanCheckTimer) {
        clearTimeout(this._taskPlanCheckTimer)
        this._taskPlanCheckTimer = null
      }
      if (this._taskPlanScheduleTimer) {
        clearTimeout(this._taskPlanScheduleTimer)
        this._taskPlanScheduleTimer = null
      }
      this._taskPlanTriggered = false
      this._taskPlanHasCompletionSinceEnabled = false
      this._taskPlanKey = ''
      this._taskPlanScheduledNotBeforeTime = null
      return
    }

    const type = this.getTaskPlanType()
    try {
      const time = this.getTaskPlanTime()
      const onlyWhenIdle = this.getTaskPlanOnlyWhenIdle()
      const gids = this.getTaskPlanGids()
      const key = `${action}|${type}|${time}|${onlyWhenIdle ? '1' : '0'}|${gids.join(',')}`
      if (key !== this._taskPlanKey) {
        this._taskPlanKey = key
        this._taskPlanHasCompletionSinceEnabled = false
        this._taskPlanTriggered = false
        this._taskPlanScheduledNotBeforeTime = null
      }
    } catch (_) {}
    if (type === 'scheduled') {
      const onlyWhenIdle = this.getTaskPlanOnlyWhenIdle()
      const notBefore = this._taskPlanScheduledNotBeforeTime
      if (onlyWhenIdle && notBefore && Date.now() >= notBefore) {
        if (this._taskPlanScheduleTimer) {
          clearTimeout(this._taskPlanScheduleTimer)
          this._taskPlanScheduleTimer = null
        }
        if (this._taskPlanCheckTimer) {
          clearTimeout(this._taskPlanCheckTimer)
        }
        this._taskPlanCheckTimer = setTimeout(() => {
          this._taskPlanCheckTimer = null
          this.checkTaskPlanIdle().catch((e) => {
            this._taskPlanTriggered = false
            logger.warn('[LinkCore] checkTaskPlanIdle failed:', e && e.message ? e.message : e)
          })
        }, delay)
        return
      }

      this._taskPlanScheduledNotBeforeTime = null
      if (this._taskPlanCheckTimer) {
        clearTimeout(this._taskPlanCheckTimer)
        this._taskPlanCheckTimer = null
      }
      if (this._taskPlanScheduleTimer) {
        clearTimeout(this._taskPlanScheduleTimer)
      }
      const time = this.getTaskPlanTime()
      const delayMs = this.getTaskPlanScheduledDelayMs(time)
      if (delayMs === null) {
        this._taskPlanTriggered = false
        return
      }
      this._taskPlanScheduleTimer = setTimeout(() => {
        this._taskPlanScheduleTimer = null
        this.triggerScheduledTaskPlan().catch((e) => {
          this._taskPlanTriggered = false
          logger.warn('[LinkCore] triggerScheduledTaskPlan failed:', e && e.message ? e.message : e)
        })
      }, delayMs)
      if (this._taskPlanScheduleTimer && typeof this._taskPlanScheduleTimer.unref === 'function') {
        this._taskPlanScheduleTimer.unref()
      }
      return
    }

    if (this._taskPlanScheduleTimer) {
      clearTimeout(this._taskPlanScheduleTimer)
      this._taskPlanScheduleTimer = null
    }

    if (this._taskPlanCheckTimer) {
      clearTimeout(this._taskPlanCheckTimer)
    }

    this._taskPlanCheckTimer = setTimeout(() => {
      this._taskPlanCheckTimer = null
      this.checkTaskPlan().catch((e) => {
        this._taskPlanTriggered = false
        logger.warn('[LinkCore] checkTaskPlan failed:', e && e.message ? e.message : e)
      })
    }, delay)
  }

  async checkTaskPlan () {
    try {
      const action = this.getTaskPlanAction()
      if (action === 'none') {
        this._taskPlanTriggered = false
        return
      }

      const active = await this.engineClient.call('tellActive')
      const activeList = Array.isArray(active) ? active : []
      const hasBlockingActive = activeList.some(t => {
        const isBt = !!(t && t.bittorrent)
        if (isBt && this.isActiveTaskDownloaded(t)) {
          return false
        }
        return true
      })
      if (hasBlockingActive) {
        this._taskPlanTriggered = false
        this.scheduleCheckTaskPlan(2000)
        return
      }

      const waiting = await this.engineClient.call('tellWaiting', 0, 1000)
      const waitingList = Array.isArray(waiting) ? waiting : []
      if (waitingList.length > 0) {
        this._taskPlanTriggered = false
        this.scheduleCheckTaskPlan(2000)
        return
      }

      if (!this._taskPlanHasCompletionSinceEnabled) {
        this._taskPlanTriggered = false
        this.scheduleCheckTaskPlan(2000)
        return
      }

      if (this._taskPlanTriggered) {
        return
      }
      this._taskPlanTriggered = true
      await this.engineClient.call('saveSession')
      const ok = await this.executeTaskPlanAction(action)
      if (!ok) {
        this._taskPlanTriggered = false
        this.scheduleCheckTaskPlan(2000)
      }
    } catch (e) {
      this._taskPlanTriggered = false
      throw e
    }
  }

  async checkTaskPlanIdle () {
    try {
      const action = this.getTaskPlanAction()
      const type = this.getTaskPlanType()
      const onlyWhenIdle = this.getTaskPlanOnlyWhenIdle()
      const notBefore = this._taskPlanScheduledNotBeforeTime

      if (action === 'none') {
        this._taskPlanTriggered = false
        this._taskPlanScheduledNotBeforeTime = null
        return
      }

      if (type !== 'scheduled' || !onlyWhenIdle || !notBefore || Date.now() < notBefore) {
        this._taskPlanTriggered = false
        this._taskPlanScheduledNotBeforeTime = null
        this.scheduleCheckTaskPlan(0)
        return
      }

      const active = await this.engineClient.call('tellActive')
      const activeList = Array.isArray(active) ? active : []
      const hasBlockingActive = activeList.some(t => {
        const isBt = !!(t && t.bittorrent)
        if (isBt && this.isActiveTaskDownloaded(t)) {
          return false
        }
        return true
      })
      if (hasBlockingActive) {
        this._taskPlanTriggered = false
        this.scheduleCheckTaskPlan(2000)
        return
      }

      const waiting = await this.engineClient.call('tellWaiting', 0, 1000)
      const waitingList = Array.isArray(waiting) ? waiting : []
      if (waitingList.length > 0) {
        this._taskPlanTriggered = false
        this.scheduleCheckTaskPlan(2000)
        return
      }

      if (this._taskPlanTriggered) {
        return
      }
      this._taskPlanTriggered = true
      await this.engineClient.call('saveSession')
      const ok = await this.executeTaskPlanAction(action)
      if (!ok) {
        this._taskPlanTriggered = false
        this.scheduleCheckTaskPlan(2000)
      }
    } catch (e) {
      this._taskPlanTriggered = false
      throw e
    }
  }

  spawnDetached (command, args = []) {
    try {
      spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref()
      return true
    } catch (e) {
      logger.warn('[LinkCore] spawnDetached failed:', e && e.message ? e.message : e)
      return false
    }
  }

  clearTaskPlanConfig () {
    this._taskPlanTriggered = false
    this._taskPlanHasCompletionSinceEnabled = false
    this._taskPlanKey = ''
    this._taskPlanScheduledNotBeforeTime = null
    this.configManager.setUserConfig({
      'task-plan-action': 'none',
      'task-plan-type': 'complete',
      'task-plan-time': '',
      'task-plan-gids': [],
      'task-plan-only-when-idle': false
    })
  }

  async executeTaskPlanAction (action) {
    if (action === 'pause-all') {
      const res = await this.engineClient.call('pauseAll')
      if (!res) {
        await this.engineClient.call('forcePauseAll')
      }
      this.clearTaskPlanConfig()
      return true
    }

    if (action === 'resume-all') {
      await this.engineClient.call('unpauseAll')
      this.clearTaskPlanConfig()
      return true
    }

    if (action === 'pause-selected') {
      const gids = this.getTaskPlanGids()
      if (gids.length > 0) {
        await Promise.allSettled(gids.map(gid => this.engineClient.call('pause', gid)))
      }
      this.clearTaskPlanConfig()
      return true
    }

    if (action === 'resume-selected') {
      const gids = this.getTaskPlanGids()
      if (gids.length > 0) {
        await Promise.allSettled(gids.map(gid => this.engineClient.call('unpause', gid)))
      }
      this.clearTaskPlanConfig()
      return true
    }

    if (action === 'quit') {
      this.clearTaskPlanConfig()
      await this.quit()
      return true
    }

    const platform = process.platform
    let ok = false

    if (action === 'shutdown') {
      if (platform === 'win32') {
        ok = this.spawnDetached('shutdown', ['/s', '/t', '0'])
      } else if (platform === 'darwin') {
        ok = this.spawnDetached('osascript', ['-e', 'tell application "System Events" to shut down'])
      } else {
        ok = this.spawnDetached('systemctl', ['poweroff'])
      }
    }

    if (action === 'sleep') {
      if (platform === 'win32') {
        ok = this.spawnDetached('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'])
      } else if (platform === 'darwin') {
        ok = this.spawnDetached('pmset', ['sleepnow'])
      } else {
        ok = this.spawnDetached('systemctl', ['suspend'])
      }
    }

    if (ok) {
      this.clearTaskPlanConfig()
      await this.quit()
      return true
    } else {
      this._taskPlanTriggered = false
      return false
    }
  }

  handleCommands () {
    this.on('application:save-preference', this.savePreference)

    this.on('application:update-tray', (tray) => {
      this.trayManager.updateTrayByImage(tray)
    })

    this.on('application:relaunch', () => {
      this.relaunch()
    })

    this.on('application:quit', () => {
      this.quit()
    })

    this.on('application:show', ({ page }) => {
      this.show(page)
    })

    this.on('application:bring-to-front', ({ page }) => {
      if (!this.windowManager) return
      this.windowManager.bringToFront(page || 'index')
    })

    this.on('application:hide', ({ page }) => {
      this.hide(page)
    })

    this.on('application:reset-session', () => this.resetSession())

    this.on('application:factory-reset', () => {
      this.offConfigListeners()
      this.configManager.reset()
      this.relaunch()
    })

    this.on('application:check-for-updates', () => {
      if (this.updateManager) {
        this.updateManager.autoCheckData.userCheck = true
        // 正在检查中（自动检查/上一次手动检查未结束）时，不能静默吞掉
        // 手动点击——先通知前端展示"正在检查更新"状态，让点击有可见
        // 反馈；当前检查结束后 isChecking 复位，用户再次点击即可发起
        // 新的检查。
        if (this.updateManager.isChecking) {
          this.updateManager._notifyWindows('checking-for-update')
        }
        this.updateManager.check()
      }
    })

    this.on('application:download-update', () => {
      this.updateManager.downloadUpdate()
    })

    this.on('application:quit-and-install-update', () => {
      if (this.updateManager) {
        this.updateManager.quitAndInstall()
      }
    })

    this.on('application:change-theme', (theme) => {
      this.themeManager.updateSystemTheme(theme)
      this.sendCommandToAll('application:update-theme', { theme })
    })

    this.on('application:change-locale', (locale) => {
      this.localeManager.changeLanguageByLocale(locale)
        .then(() => {
          this.menuManager.handleLocaleChange(locale)
          this.trayManager.handleLocaleChange(locale)
        })
    })

    this.on('application:toggle-dock', (visible) => {
      if (visible) {
        this.dockManager.show()
      } else {
        this.dockManager.hide()
        // Hiding the dock icon will trigger the entire app to hide.
        this.show()
      }
    })

    this.on('application:auto-hide-window', (hide) => {
      if (hide) {
        this.windowManager.handleWindowBlur()
      } else {
        this.windowManager.unbindWindowBlur()
      }
    })

    this.on('application:change-menu-states', (visibleStates, enabledStates, checkedStates) => {
      this.menuManager.updateMenuStates(visibleStates, enabledStates, checkedStates)
      this.trayManager.updateMenuStates(visibleStates, enabledStates, checkedStates)
    })

    this.on('application:open-file', (event) => {
      dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          {
            name: 'Torrent',
            extensions: ['torrent']
          }
        ]
      }).then(({ canceled, filePaths }) => {
        if (canceled || filePaths.length === 0) {
          return
        }

        const [filePath] = filePaths
        this.handleFile(filePath)
      })
    })

    this.on('application:clear-recent-tasks', () => {
      app.clearRecentDocuments()
    })

    this.on('application:setup-protocols-client', (protocols) => {
      if (is.dev() || is.mas() || !protocols) {
        return
      }
      logger.info('[LinkCore] setup protocols client:', protocols)
      if (this.protocolManager) {
        this.protocolManager.setup(protocols)
      } else {
        logger.warn('[LinkCore] protocolManager not initialized')
      }
    })

    this.on('application:open-external', (url) => {
      this.openExternal(url)
    })

    this.on('task-progress:control', (payload = {}) => {
      const window = this.windowManager.getWindow('index')
      if (!window) {
        return
      }
      this.windowManager.sendCommandTo(window, 'task-progress:control', payload)
    })

    this.on('engine:get-version-info', async () => {
      try {
        const versionInfo = await this.getEngineVersionInfo()
        this.sendCommandToAll('engine-version-info', versionInfo)
      } catch (error) {
        logger.error('[LinkCore] Failed to get engine version info:', error)
        this.sendCommandToAll('engine-version-info', {
          error: error.message,
          version: 'Unknown',
          architecture: 'Unknown',
          features: [],
          dependencies: [],
          compileInfo: 'Unknown'
        })
      }
    })

    this.on('engine:get-list', async () => {
      try {
        const { platform, arch } = process
        const engineList = getEngineList(platform, arch)
        logger.info('[LinkCore] Engine list retrieved:', engineList)
        this.sendCommandToAll('engine-list', {
          engines: engineList,
          platform,
          arch,
          timestamp: Date.now()
        })
      } catch (error) {
        logger.error('[LinkCore] Failed to get engine list:', error)
        this.sendCommandToAll('engine-list', {
          error: error.message,
          engines: [],
          platform: process.platform,
          arch: process.arch,
          timestamp: Date.now()
        })
      }
    })

    this.on('application:reveal-in-folder', (data) => {
      const { gid, path } = data
      logger.info('[LinkCore] application:reveal-in-folder===>', path)
      if (path) {
        showItemInFolder(path)
      }
      if (gid) {
        this.sendCommandToAll('application:show-task-detail', { gid })
      }
    })

    this.on('help:official-website', () => {
      const url = 'https://github.com/MochengCK/LinkCore'
      this.openExternal(url)
    })

    this.on('help:release-notes', () => {
      const url = 'https://github.com/MochengCK/LinkCore/releases'
      this.openExternal(url)
    })

    this.on('help:report-problem', () => {
      const url = 'https://github.com/MochengCK/LinkCore/issues'
      this.openExternal(url)
    })
  }

  openExternal (url) {
    if (!url) {
      return
    }

    shell.openExternal(url)
  }

  async getEngineVersionInfo () {
    try {
      // 引擎启动早期 WebSocket 可能尚未连上，engineClient.call 会走 HTTP
      // 路径；若引擎端口未就绪，请求可能长时间挂起，超过渲染进程的 5s
      // 等待后前端报 "Timeout fetching engine info"。给 RPC 调用加超时
      // 兜底：超时按 null 处理（版本显示 Unknown），引擎就绪后可手动刷新。
      const withTimeout = (promise, fallback) => {
        return Promise.race([
          Promise.resolve(promise),
          new Promise((resolve) => setTimeout(() => resolve(fallback), 3000))
        ])
      }

      // 获取引擎版本信息
      const version = await withTimeout(this.engineClient.call('getVersion'), null)

      // 获取支持的协议
      const protocols = await withTimeout(
        this.engineClient.call('getGlobalOption', ['enable-http-pipelining', 'enable-mmap', 'check-certificate']),
        null
      )

      // 获取系统架构信息
      const { platform, arch } = process

      // 获取引擎二进制文件路径
      const engineBinPath = this.context.get('aria2-bin-path')

      // 构建版本信息对象
      const versionInfo = {
        version: version || 'Unknown',
        architecture: `${platform}-${arch}`,
        features: this.getEngineFeatures(protocols),
        dependencies: this.getEngineDependencies(),
        compileInfo: this.getCompileInfo(),
        binPath: engineBinPath
      }

      logger.info('[LinkCore] Engine version info:', versionInfo)
      return versionInfo
    } catch (error) {
      logger.error('[LinkCore] Failed to get engine version info:', error)
      throw error
    }
  }

  getEngineFeatures (protocols) {
    const features = []

    // 基于协议支持判断功能
    if (protocols && protocols['enable-http-pipelining']) {
      features.push('HTTP Pipelining')
    }
    if (protocols && protocols['enable-mmap']) {
      features.push('Memory Mapping')
    }
    if (protocols && protocols['check-certificate'] === false) {
      features.push('SSL Certificate Bypass')
    }

    // 添加基本功能
    features.push('HTTP/HTTPS', 'FTP', 'BitTorrent', 'Metalink', 'ED2K')

    return features
  }

  getEngineDependencies () {
    // 返回引擎依赖的库信息
    return [
      'zlib',
      'c-ares',
      'sqlite3',
      'libxml2',
      'libssh2',
      'gmp',
      'libgcrypt',
      'expat'
    ]
  }

  getCompileInfo () {
    // 返回编译信息
    const { platform, arch } = process
    const isDev = process.env.NODE_ENV === 'development'

    return `Compiled for ${platform}-${arch} ${isDev ? '(Development)' : '(Production)'}`
  }

  handleConfigChange (configName) {
    this.sendCommandToAll('application:update-preference-config', { configName })
  }

  handleEvents () {
    this.once('application:initialized', () => {
      this.autoSyncTrackers()

      this.autoSyncEd2kServers()

      this.autoResumeTask()

      this.adjustMenu()
      this.scheduleCheckTaskPlan(2000)

      // 主窗口在 start() 中才创建（init 完成之后），此处可能尚未存在，
      // 需要等窗口出现后再挂载 did-finish-load，否则启动时更新状态推送永不执行
      this.sendUpdateStatusWhenReady()

      this.startClipboardAutoOpenWatch()
      this.watchClipboardAutoOpenChange()
    })

    // 将 onDidAnyChange 的卸载函数保存到 configListeners，
    // 否则 factory-reset 无法卸载、init 重试时监听器会叠加
    this.configListeners.__any_user = this.configManager.userConfig.onDidAnyChange(() => this.handleConfigChange('user'))
    this.configListeners.__any_system = this.configManager.systemConfig.onDidAnyChange(() => this.handleConfigChange('system'))

    this.watchOpenAtLoginChange()
    this.watchProtocolsChange()
    this.watchRunModeChange()
    this.watchShowProgressBarChange()
    this.watchProxyChange()
    this.watchLocaleChange()
    this.watchThemeChange()
    this.watchAutoCheckUpdateChange()

    this.on('download-status-change', (downloading) => {
      this.trayManager.handleDownloadStatusChange(downloading)
      if (downloading) {
        this.energyManager.startPowerSaveBlocker()
        this._taskPlanTriggered = false
      } else {
        this.energyManager.stopPowerSaveBlocker()
        this.scheduleCheckTaskPlan()
      }
    })

    this.on('speed-change', (speed) => {
      this.dockManager.handleSpeedChange(speed)
      this.trayManager.handleSpeedChange(speed)
    })

    this.on('task-download-complete', (task, path) => {
      // 通知最先展示：后续步骤（安全扫描、最近文档等）即使抛错
      // 也不能影响系统通知的发出
      this.showTaskCompleteNativeNotification(task, path)

      try {
        this.dockManager.openDock(path)
      } catch (e) {
        logger.warn('[LinkCore] openDock failed:', e.message)
      }
      this._taskPlanHasCompletionSinceEnabled = true

      // 执行安全扫描
      this.performSecurityScan(task, path)

      if (!is.linux()) {
        try {
          app.addRecentDocument(path)
        } catch (e) {
          logger.warn('[LinkCore] addRecentDocument failed:', e.message)
        }
      }
      this.scheduleCheckTaskPlan()
    })

    this.on('download-start', (event) => {
    })

    if (this.configManager.userConfig.get('show-progress-bar')) {
      this.bindProgressChange()
    }
  }

  handleProgressChange (progress) {
    if (this.updateManager && this.updateManager.isChecking) {
      return
    }
    if (!is.windows() && progress === 2) {
      progress = 0
    }
    const win = this.windowManager.getWindow('index')
    if (win && !win.isDestroyed()) {
      win.setProgressBar(progress)
    }
  }

  bindProgressChange () {
    if (this.listeners('progress-change').length > 0) {
      return
    }

    this.on('progress-change', this.handleProgressChange)
  }

  unbindProgressChange () {
    if (this.listeners('progress-change').length === 0) {
      return
    }

    this.off('progress-change', this.handleProgressChange)
    const win = this.windowManager.getWindow('index')
    if (win && !win.isDestroyed()) {
      win.setProgressBar(-1)
    }
  }

  // 下载完成系统通知。在主进程创建原生 Notification：
  // macOS 上渲染进程的 HTML5 Notification 需要系统权限才能显示，
  // 而主进程的原生通知会在首次展示时自动向系统申请权限（应用需签名，
  // 打包配置中 mac.type=development 已启用签名）。这里同时负责点击行为。
  showTaskCompleteNativeNotification (task, path) {
    try {
      if (!this.configManager.getUserConfig('task-notification')) {
        return
      }
      const { Notification } = require('electron')
      if (!Notification || !Notification.isSupported || !Notification.isSupported()) {
        return
      }

      let taskName = ''
      if (path) {
        taskName = basename(path || '')
      }
      if (!taskName && task && task.name) {
        taskName = `${task.name}`
      }
      if (!taskName && task && task.files && task.files[0] && task.files[0].path) {
        taskName = basename(`${task.files[0].path}`)
      }
      if (!taskName) {
        return
      }

      const isBT = !!(task && task.bittorrent)
      const t = this.i18n ? this.i18n.t : null
      const title = isBT
        ? (t ? t('task.bt-download-complete-notify') : taskName)
        : (t ? t('task.download-complete-notify') : taskName)

      const clickAction = this.configManager.getUserConfig('task-complete-notify-click-action') || 'open-folder'
      const notify = new Notification({
        title,
        body: taskName
      })
      notify.on('click', () => {
        try {
          if (clickAction === 'show-app') {
            this.emit('application:show', { page: 'index' })
          } else if (clickAction === 'execute-file') {
            if (path) {
              shell.openPath(path).catch((error) => {
                logger.warn('[LinkCore] Failed to execute file from notification:', error && error.message ? error.message : error)
                shell.showItemInFolder(path)
              })
            }
          } else if (path) {
            shell.showItemInFolder(path)
          }
        } catch (e) {
          logger.warn('[LinkCore] Failed to handle notification click:', e.message)
        }
      })
      notify.show()
      logger.info(`[LinkCore] Task complete notification shown: ${title} / ${taskName}`)
    } catch (e) {
      logger.warn('[LinkCore] Failed to show task complete notification:', e.message)
    }
  }

  handleIpcMessages () {
    // retryStart 等路径可能重复执行初始化，重复注册会导致监听叠加
    if (this._ipcMessagesRegistered) {
      return
    }
    this._ipcMessagesRegistered = true

    ipcMain.on('command', (event, command, ...args) => {
      logger.log('[LinkCore] ipc receive command', command, ...args)
      this.emit(command, ...args)
    })

    ipcMain.on('event', (event, eventName, ...args) => {
      logger.log('[LinkCore] ipc receive event', eventName, ...args)
      this.emit(eventName, ...args)
    })

    // Handle minimize-progress-window
    ipcMain.on('minimize-progress-window', (event) => {
      try {
        const win = require('electron').BrowserWindow.fromWebContents(event.sender)
        if (win && typeof win.minimize === 'function') {
          win.minimize()
        }
      } catch (e) {
        logger.warn('[LinkCore] Failed to minimize progress window:', e.message)
      }
    })

    // Handle close-progress-window
    ipcMain.on('close-progress-window', (event) => {
      try {
        const win = require('electron').BrowserWindow.fromWebContents(event.sender)
        if (win && typeof win.close === 'function') {
          win.close()
        }
      } catch (e) {
        logger.warn('[LinkCore] Failed to close progress window:', e.message)
      }
    })

    // Handle close-completed-task-window
    ipcMain.on('close-completed-task-window', (event, gid) => {
      try {
        const win = require('electron').BrowserWindow.fromWebContents(event.sender)
        if (win && typeof win.close === 'function') {
          win.close()
        }
      } catch (e) {
        logger.warn('[LinkCore] Failed to close completed task window:', e.message)
      }
    })

    // Handle open-completed-task-folder
    ipcMain.on('open-completed-task-folder', (event, { gid, filePath }) => {
      try {
        const { showItemInFolder } = require('./utils/index')
        if (filePath) {
          showItemInFolder(filePath)
        }
        // Close the window after opening folder
        const win = require('electron').BrowserWindow.fromWebContents(event.sender)
        if (win && typeof win.close === 'function') {
          win.close()
        }
      } catch (e) {
        logger.warn('[LinkCore] Failed to open completed task folder:', e.message)
      }
    })

    // Handle open-completed-task-file
    ipcMain.on('open-completed-task-file', (event, { gid, filePath }) => {
      try {
        const { shell } = require('electron')
        if (filePath) {
          shell.openPath(filePath)
        }
        // Close the window after opening file
        const win = require('electron').BrowserWindow.fromWebContents(event.sender)
        if (win && typeof win.close === 'function') {
          win.close()
        }
      } catch (e) {
        logger.warn('[LinkCore] Failed to open completed task file:', e.message)
      }
    })

    // Handle minimize-completed-task-window
    ipcMain.on('minimize-completed-task-window', (event, gid) => {
      try {
        const win = require('electron').BrowserWindow.fromWebContents(event.sender)
        if (win && typeof win.minimize === 'function') {
          win.minimize()
        }
      } catch (e) {
        logger.warn('[LinkCore] Failed to minimize completed task window:', e.message)
      }
    })

    // Handle open-video-detection-settings
    ipcMain.on('open-video-detection-settings', () => {
      this.windowManager.openWindow('video-detection-settings', {
        hidden: false
      })
    })

    // Handle open-file-categories-settings
    ipcMain.on('open-file-categories-settings', () => {
      this.windowManager.openWindow('file-categories-settings', {
        hidden: false
      })
    })

    // Handle open-preference-window
    ipcMain.on('open-preference-window', (event, payload = {}) => {
      const { category } = payload || {}
      const win = this.windowManager.openWindow('preference', {
        hidden: false
      })
      if (win && category) {
        const sendNavigateCommand = () => {
          win.webContents.send('command', 'application:open-preference-category', { category })
        }
        if (win.webContents.isLoading()) {
          win.webContents.once('did-finish-load', sendNavigateCommand)
        } else {
          sendNavigateCommand()
        }
      }
    })

    // Handle video-sniffer-settings-updated
    ipcMain.on('video-sniffer-settings-updated', (event, settings) => {
      logger.log('[LinkCore] Video sniffer settings updated:', settings)

      this._videoSnifferConfig = {
        enabled: settings.enabled,
        formats: settings.formats,
        autoCombine: settings.autoCombine
      }

      logger.log('[LinkCore] Video sniffer config updated in main process:', this._videoSnifferConfig)

      this.configManager.setUserConfig({
        'video-sniffer-enabled': settings.enabled,
        'video-sniffer-formats': settings.formats,
        'video-sniffer-auto-combine': settings.autoCombine
      })
      logger.log('[LinkCore] Video sniffer config saved to disk')
    })

    // Handle file-categories-settings-updated
    ipcMain.on('file-categories-settings-updated', (event, categories) => {
      logger.log('[LinkCore] File categories settings updated:', categories)

      this.configManager.setUserConfig({
        'file-categories': categories
      })
      logger.log('[LinkCore] File categories config saved to disk')
    })
  }

  // 汇总系统/用户配置与应用上下文，供同步/异步 get-app-config 共用
  _collectAppConfig () {
    const systemConfig = this.configManager.getSystemConfig()
    const userConfig = this.configManager.getUserConfig()
    const context = this.context.get()
    const appVersion = require('../../package.json').version

    // 注意：这里不能重建应用菜单（menuManager.setup）。该函数在每个窗口
    // 加载时都会被同步 IPC 调用，菜单重建只应发生在 keymap 变更监听里。
    return {
      ...systemConfig,
      ...userConfig,
      ...context,
      version: appVersion
    }
  }

  handleIpcInvokes () {
    // retryStart 等路径可能重复执行初始化；ipcMain.handle 对同一频道
    // 重复注册会直接抛 "second handler"，这里做幂等保护。
    if (this._ipcInvokesRegistered) {
      return
    }
    this._ipcInvokesRegistered = true

    // 渲染进程引擎 RPC 统一转发（主进程持有与引擎的 WebSocket 长连接）。
    // 返回 { ok, result/error } 契约：Electron 的 IPC 结构化克隆不会传输
    // Error 的自定义属性（code），直接 throw 会导致渲染进程拿不到
    // aria2 的错误码（如 remove 任务的 code===1 判断），因此错误信息
    // 以普通对象返回，由 IpcEngineClient 恢复为带 code 的 Error。
    ipcMain.handle('engine:rpc', async (event, payload) => {
      const { method, args } = payload || {}
      if (!method || !this.engineClient) {
        return { ok: false, error: { message: 'engine not ready' } }
      }
      try {
        const result = method === 'multicall'
          ? await this.engineClient.multicall(args && args[0] ? args[0] : [])
          : await this.engineClient.callForRenderer(method, ...(Array.isArray(args) ? args : []))
        return { ok: true, result }
      } catch (err) {
        return {
          ok: false,
          error: {
            code: err && err.code !== undefined ? err.code : undefined,
            message: err && err.message ? err.message : 'engine rpc failed'
          }
        }
      }
    })

    ipcMain.on('get-app-config', (event) => {
      event.returnValue = this._collectAppConfig()
    })

    ipcMain.handle('get-app-config', async () => {
      return this._collectAppConfig()
    })

    ipcMain.handle('get-update-status', async () => {
      try {
        if (this.updateManager && typeof this.updateManager.getStatus === 'function') {
          return this.updateManager.getStatus()
        }
      } catch (e) {
        logger.warn('[LinkCore] get-update-status failed:', e.message)
      }
      return {
        isChecking: false,
        isDownloading: false,
        updateAvailable: false,
        updateDownloaded: false,
        newVersion: '',
        releaseNotes: '',
        downloadProgress: 0,
        downloadTotal: 0,
        downloadTransferred: 0
      }
    })

    ipcMain.handle('get-app-locale', async () => {
      const raw = this.configManager.getUserConfig('locale') || this.configManager.getSystemConfig('locale')
      return getLanguage(raw)
    })

    ipcMain.handle('get-engine-list', async () => {
      try {
        const { platform, arch } = process
        const engines = getEngineList(platform, arch)
        logger.info('[LinkCore] IPC get-engine-list:', engines)
        return {
          success: true,
          engines,
          platform,
          arch,
          timestamp: Date.now()
        }
      } catch (error) {
        logger.error('[LinkCore] IPC get-engine-list failed:', error)
        return {
          success: false,
          error: error.message,
          engines: [],
          platform: process.platform,
          arch: process.arch,
          timestamp: Date.now()
        }
      }
    })

    // Get progress window size
    ipcMain.handle('get-progress-window-size', async (event) => {
      try {
        const win = require('electron').BrowserWindow.fromWebContents(event.sender)
        if (win) {
          const size = win.getContentSize()
          return { width: size[0], height: size[1] }
        }
      } catch (e) {
        logger.warn('[LinkCore] Failed to get progress window size:', e.message)
      }
      return null
    })

    // Resize progress window
    ipcMain.handle('resize-progress-window', async (event, payload) => {
      try {
        const { isPanelOpen, panelHeight, initialWidth } = payload || {}
        const win = require('electron').BrowserWindow.fromWebContents(event.sender)
        if (win) {
          const size = win.getContentSize()
          const currentWidth = initialWidth > 0 ? initialWidth : size[0]
          const newHeight = isPanelOpen ? (size[1] + panelHeight) : (size[1] - panelHeight)
          win.setContentSize(currentWidth, newHeight)
          return { success: true }
        }
      } catch (e) {
        logger.warn('[LinkCore] Failed to resize progress window:', e.message)
      }
      return { success: false }
    })

    // Set progress window always on top
    ipcMain.handle('set-progress-window-always-on-top', async (event, isPinned) => {
      try {
        const win = require('electron').BrowserWindow.fromWebContents(event.sender)
        if (win && typeof win.setAlwaysOnTop === 'function') {
          win.setAlwaysOnTop(isPinned)
          return { success: true }
        }
      } catch (e) {
        logger.warn('[LinkCore] Failed to set progress window always on top:', e.message)
      }
      return { success: false }
    })

    // 剪贴板读写桥：渲染进程直接访问 electron.clipboard 已弃用
    // （Accessing 'clipboard.readText' from the renderer process is deprecated），
    // 统一经主进程代理。
    ipcMain.handle('clipboard:read-text', async () => {
      try {
        return clipboard.readText()
      } catch (e) {
        logger.warn('[LinkCore] clipboard read failed:', e.message)
        return ''
      }
    })
    ipcMain.handle('clipboard:write-text', async (event, text) => {
      try {
        clipboard.writeText(`${text || ''}`)
        return true
      } catch (e) {
        logger.warn('[LinkCore] clipboard write failed:', e.message)
        return false
      }
    })

    ipcMain.handle('task-progress:fetch', async (_event, payload = {}) => {
      const gid = payload && payload.gid ? String(payload.gid) : ''
      const includeConnections = !!(payload && payload.includeConnections)
      if (!gid) {
        return { success: false, error: 'invalid-gid' }
      }

      const task = await this.engineClient.call('tellStatus', gid)
      if (!task || !task.gid) {
        this._progressSpeedSamples.delete(gid)
        return { success: false, done: true, error: 'task-not-found' }
      }

      const status = task.status
      const doneStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
      if (doneStatuses.includes(status)) {
        this._progressSpeedSamples.delete(gid)
        return { success: true, done: true }
      }

      const completed = Number(task.completedLength || 0)
      const total = Number(task.totalLength || 0)
      const speed = Number(task.downloadSpeed || 0)
      const connections = Number(task.connections || 0)
      const percent = total > 0 ? Math.floor((completed * 100) / total) : 0
      const title = getTaskName(task, {
        defaultName: this.i18n.t('task.get-task-name'),
        maxLen: -1
      })
      const completedText = bytesToSize(completed, 2)
      const totalText = total > 0 ? bytesToSize(total, 2) : ''
      const sizeText = totalText ? `${this.i18n.t('task.task-file-size')}: ${completedText} / ${totalText}` : `${this.i18n.t('task.task-file-size')}: ${completedText}`
      const speedValue = speed > 0 ? `${bytesToSize(speed, 2)}/s` : `${bytesToSize(0, 2)}/s`

      // 主进程独立维护速度采样，计算平均速度
      // 这样即使不打开主窗口，独立进度窗口也能显示正确的平均速度
      const PROGRESS_SPEED_SAMPLE_MAX = 60 // 60 个采样点（约60秒）
      let avgSpeed = 0
      if (status === TASK_STATUS.ACTIVE) {
        const samples = this._progressSpeedSamples.get(gid) || []
        samples.push({ bytes: speed, durationMs: 1000 })
        while (samples.length > PROGRESS_SPEED_SAMPLE_MAX) {
          samples.shift()
        }
        this._progressSpeedSamples.set(gid, samples)
        const totalBytes = samples.reduce((sum, s) => sum + (Number(s.bytes) || 0), 0)
        const totalDurationMs = samples.reduce((sum, s) => sum + (Number(s.durationMs) || 0), 0)
        avgSpeed = totalDurationMs > 0 ? Math.round((totalBytes * 1000) / totalDurationMs) : 0
      } else {
        this._progressSpeedSamples.delete(gid)
      }
      const avgSpeedValue = avgSpeed > 0 ? `${bytesToSize(avgSpeed, 2)}/s` : `${bytesToSize(0, 2)}/s`

      let remainingText = ''
      if (total > 0 && speed > 0 && completed < total) {
        const remainingSeconds = timeRemaining(total, completed, speed)
        if (remainingSeconds > 0) {
          remainingText = timeFormat(remainingSeconds, {
            prefix: this.i18n.t('task.remaining-prefix'),
            i18n: {
              gt1d: this.i18n.t('app.gt1d'),
              hour: this.i18n.t('app.hour'),
              minute: this.i18n.t('app.minute'),
              second: this.i18n.t('app.second')
            }
          })
        }
      }
      if (!remainingText) {
        remainingText = `${this.i18n.t('task.remaining-prefix')}: --`
      }

      let piecesData = null
      const bitfield = task.bitfield || ''
      const numPieces = Number(task.numPieces || 0)
      if (bitfield && numPieces > 0) {
        const pieces = []
        // bitfield 按字节补零，最后一个 nibble 可能只包含填充位，
        // 只取真实分片对应的 nibble 数量 ceil(numPieces / 4)，避免
        // 已完成任务末尾多渲染一个"未下载"的假分片。
        const nibbleCount = Math.min(Math.ceil(numPieces / 4), bitfield.length)
        for (let i = 0; i < nibbleCount; i++) {
          const hex = parseInt(bitfield[i], 16)
          // 与 TaskGraphic buildAtom 一致: Math.floor(hex / 4) → 0..3
          pieces.push(Math.floor(hex / 4))
        }
        piecesData = {
          numPieces,
          pieces,
          tabText: this.i18n.t('task.task-pieces-progress')
        }
      }

      const isPaused = status === TASK_STATUS.PAUSED || status === TASK_STATUS.WAITING
      const canPause = status === TASK_STATUS.ACTIVE && completed > 0
      const canResume = status === TASK_STATUS.WAITING || status === TASK_STATUS.PAUSED
      const canCancel = !doneStatuses.includes(status)

      let connectionsData = null
      if (includeConnections && (status === TASK_STATUS.ACTIVE || status === TASK_STATUS.WAITING)) {
        const servers = await this.engineClient.call('getServers', gid)
        const serverList = []
        let totalConnections = 0
        let activeConnections = 0
        if (Array.isArray(servers)) {
          servers.forEach(file => {
            const fileServers = file && file.servers ? file.servers : []
            fileServers.forEach(server => {
              totalConnections++
              const spd = Number(server.downloadSpeed) || 0
              const isActive = spd > 0
              if (isActive) activeConnections++
              let host = '-'
              const uri = server.currentUri || server.uri || ''
              if (uri) {
                try {
                  const url = new URL(uri)
                  host = url.hostname
                } catch (e) {
                  const match = uri.match(/:\/\/([^/:]+)/)
                  host = match ? match[1] : uri
                }
              }
              serverList.push({
                host,
                speed: `${bytesToSize(spd, 2)}/s`,
                downloaded: bytesToSize(Number(server.downloadLength) || 0, 2),
                isActive,
                status: isActive ? this.i18n.t('task.connection-status-active') : this.i18n.t('task.connection-status-idle')
              })
            })
          })
        }
        connectionsData = {
          totalLabel: this.i18n.t('task.connections-total'),
          totalValue: String(totalConnections),
          activeLabel: this.i18n.t('task.connections-active'),
          activeValue: String(activeConnections),
          speedLabel: this.i18n.t('task.connections-total-speed'),
          speedValue: `${bytesToSize(speed, 2)}/s`,
          thHost: this.i18n.t('task.connection-host'),
          thDownloaded: this.i18n.t('task.task-peer-downloaded'),
          thSpeed: this.i18n.t('task.connection-speed'),
          thStatus: this.i18n.t('task.connection-status'),
          servers: serverList,
          emptyText: this.i18n.t('task.no-connections')
        }
      }

      return {
        success: true,
        payload: {
          gid,
          title,
          percent,
          percentText: `${percent}%`,
          nameText: title,
          isPaused,
          tabInfoText: this.i18n.t('task.task-progress-info'),
          tabConnectionsText: this.i18n.t('task.task-connections-detail'),
          tabPiecesText: this.i18n.t('task.task-pieces-progress'),
          piecesEmptyText: this.i18n.t('task.task-no-pieces-data'),
          tabInfoShort: this.i18n.t('task.task-progress-info'),
          tabPiecesShort: this.i18n.t('task.task-pieces-progress'),
          sizeText,
          speedText: `${this.i18n.t('task.task-download-speed')}: ${speedValue}`,
          avgSpeedText: `${this.i18n.t('task.task-average-speed')}: ${avgSpeedValue}`,
          connectionsText: `${this.i18n.t('task.task-connections')}: ${connections}`,
          remainingText,
          piecesData,
          connectionsData,
          pauseText: this.i18n.t('task.pause'),
          resumeText: this.i18n.t('task.resume'),
          cancelText: this.i18n.t('task.delete'),
          canPause,
          canResume,
          canCancel,
          showPause: true,
          showResume: true,
          showCancel: true
        }
      }
    })

    // Get video sniffer config
    ipcMain.handle('get-video-sniffer-config', async () => {
      return this._videoSnifferConfig
    })

    // Get file categories config
    ipcMain.handle('get-file-categories-config', async () => {
      return this.configManager.getUserConfig('file-categories') || {
        images: { name: 'image-files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] },
        documents: { name: 'document-files', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'xls', 'xlsx', 'ppt', 'pptx'] },
        audio: { name: 'audio-files', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma'] },
        video: { name: 'video-files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] },
        archives: { name: 'archive-files', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] },
        programs: { name: 'program-files', extensions: ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm'] },
        others: { name: 'other-files', extensions: [] }
      }
    })

    // Get task list (for checking completed tasks across all categories)
    ipcMain.handle('get-task-list', async (_event, payload = {}) => {
      try {
        const type = payload && payload.type ? String(payload.type) : 'all'
        let tasks = []

        if (type === 'active') {
          tasks = await this.engineClient.call('tellActive')
        } else if (type === 'waiting') {
          tasks = await this.engineClient.call('tellWaiting', 0, 999)
        } else if (type === 'stopped') {
          tasks = await this.engineClient.call('tellStopped', 0, 999)
        } else {
          // Get all tasks
          const [active, waiting, stopped] = await Promise.all([
            this.engineClient.call('tellActive'),
            this.engineClient.call('tellWaiting', 0, 999),
            this.engineClient.call('tellStopped', 0, 999)
          ])
          tasks = [...active, ...waiting, ...stopped]
        }

        return tasks || []
      } catch (err) {
        logger.warn('[LinkCore] Failed to get task list:', err.message)
        return []
      }
    })

    // Priority rebalance handler
    ipcMain.handle('priority:rebalance', async () => {
      return { success: true }
    })

    // ED2K server fetch handler (bypasses renderer CORS restrictions)
    ipcMain.handle('ed2k:fetch-servers', async (_event, { source, proxy }) => {
      return fetchEd2kServersFromSource(source, proxy)
    })
  }

  /**
   * 等待主窗口创建后推送已保存的更新状态。
   * init() 完成时 index 窗口尚未创建（窗口在 start() 中才打开），
   * 因此需轮询等待窗口出现再挂载 did-finish-load。
   */
  sendUpdateStatusWhenReady () {
    if (this._updateStatusWatchTimer) {
      return
    }
    const tryAttach = () => {
      const mainWindow = this.windowManager.getWindow('index')
      if (!mainWindow || mainWindow.isDestroyed()) {
        return false
      }
      mainWindow.webContents.once('did-finish-load', () => {
        // 延迟发送更新状态，确保前端组件已完全初始化
        setTimeout(() => {
          this.loadAndSendUpdateStatus()
        }, 500)
      })
      return true
    }

    if (tryAttach()) {
      return
    }

    // 窗口尚未创建，每 200ms 轮询一次，最多等待 10 秒
    this._updateStatusWatchTimer = setInterval(() => {
      if (tryAttach()) {
        clearInterval(this._updateStatusWatchTimer)
        this._updateStatusWatchTimer = null
        return
      }
      const timeout = Date.now() - (this._updateStatusWatchStartedAt || Date.now())
      if (timeout > 10000) {
        clearInterval(this._updateStatusWatchTimer)
        this._updateStatusWatchTimer = null
        logger.warn('[LinkCore] Timed out waiting for main window to send update status')
      }
    }, 200)
    this._updateStatusWatchStartedAt = Date.now()
  }

  /**
   * 加载保存的更新状态并发送给前端
   */
  loadAndSendUpdateStatus () {
    try {
      if (this._updateStatusInitialized) {
        return
      }
      // 从用户配置中加载保存的更新状态
      const updateAvailable = this.configManager.getUserConfig('update-available') || false
      const newVersion = this.configManager.getUserConfig('new-version') || ''
      const lastCheckUpdateTime = this.configManager.getUserConfig('last-check-update-time') || 0

      logger.info('[LinkCore] Loading saved update status:', {
        updateAvailable,
        newVersion,
        lastCheckUpdateTime
      })

      // 发送更新状态给所有窗口
      if (updateAvailable) {
        // 如果检测到有新版本可用，发送update-available事件
        const windows = this.windowManager.getWindowList()
        windows.forEach(window => {
          try {
            if (window && !window.isDestroyed() && window.webContents) {
              window.webContents.send('update-available', newVersion, '')
            }
          } catch (_) {}
        })
      } else {
        // 如果没有新版本可用，发送update-not-available事件
        const windows = this.windowManager.getWindowList()
        windows.forEach(window => {
          try {
            if (window && !window.isDestroyed() && window.webContents) {
              window.webContents.send('update-not-available')
            }
          } catch (_) {}
        })
      }
    } catch (error) {
      logger.warn('[LinkCore] Failed to load and send update status:', error.message)
    }
  }

  cleanupExpiredChallenges () {
    const now = Date.now()
    let cleaned = 0
    for (const [challenge, data] of this.challenges.entries()) {
      if (now > data.expiresAt) {
        this.challenges.delete(challenge)
        cleaned++
      }
    }
    if (cleaned > 0) {
      console.log('[Security] Cleaned up expired challenges:', cleaned)
    }
  }

  cleanupExpiredSessionTokens () {
    const now = Date.now()
    let cleaned = 0
    for (const [token, data] of this.sessionTokens.entries()) {
      if (now - data.createdAt > this.sessionTokenTTL) {
        this.sessionTokens.delete(token)
        cleaned++
      }
    }
    if (cleaned > 0) {
      console.log('[Security] Cleaned up expired session tokens:', cleaned)
    }
  }
}
