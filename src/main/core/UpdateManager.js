import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import is from 'electron-is'
import { autoUpdater } from 'electron-updater'

import { PROXY_SCOPES, PROXY_MODE } from '@shared/constants'
import logger from './Logger'
import { getI18n } from '../ui/Locale'

if (is.dev()) {
  autoUpdater.updateConfigPath = resolve(__dirname, '../../../app-update.yml')
}

export default class UpdateManager extends EventEmitter {
  constructor (options = {}) {
    super()
    this.options = options
    this.i18n = getI18n()

    this.isChecking = false
    this.updater = autoUpdater
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true
    this.updater.logger = logger
    logger.info('[Motrix] setup proxy:', this.options.proxy)
    this.setupProxy(this.options.proxy)

    this.autoCheckData = {
      checkEnable: this.options.autoCheck,
      userCheck: false
    }
    this._autoCheckTimer = null
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
        this.updater.checkForUpdates()
      }
    } else {
      this.stopAutoCheckTimer()
    }
  }

  startAutoCheckTimer () {
    this.stopAutoCheckTimer()
    if (!this.autoCheckData.checkEnable) {
      return
    }
    const intervalMs = 60 * 60 * 1000
    this._autoCheckTimer = setInterval(() => {
      if (!this.autoCheckData.checkEnable) {
        return
      }
      if (this.isChecking) {
        return
      }
      const cfg = global.application?.configManager
      const updateAvailable = cfg ? !!cfg.getUserConfig('update-available') : false
      if (updateAvailable) {
        return
      }
      this.autoCheckData.userCheck = false
      this.updater.checkForUpdates()
    }, intervalMs)
    if (this._autoCheckTimer && typeof this._autoCheckTimer.unref === 'function') {
      this._autoCheckTimer.unref()
    }
  }

  stopAutoCheckTimer () {
    if (this._autoCheckTimer) {
      clearInterval(this._autoCheckTimer)
      this._autoCheckTimer = null
    }
  }

  setupProxy (proxy) {
    const { server } = proxy || {}
    const scope = (proxy && Array.isArray(proxy.scope)) ? proxy.scope : null
    // 兼容旧版配置（enable 字段）
    let proxyMode = proxy && proxy.mode
    if (!proxyMode && proxy && proxy.enable !== undefined) {
      proxyMode = proxy.enable ? PROXY_MODE.CUSTOM : PROXY_MODE.NONE
    }

    const enableUpdateProxy = !scope || scope.length === 0 || scope.includes(PROXY_SCOPES.UPDATE_APP)

    // 不使用代理或未指定：不覆盖默认网络行为，让系统自动处理
    if (proxyMode === PROXY_MODE.NONE || !proxyMode) {
      return
    }

    // 自定义代理：仅在勾选了"更新应用程序"时对更新生效
    if (proxyMode === PROXY_MODE.CUSTOM && server && enableUpdateProxy) {
      const url = new URL(server)
      const { username, password, protocol = 'http:', host, port } = url
      const proxyRules = `${protocol}//${host}`

      logger.info(`[Motrix] setup proxy: ${proxyRules}`, username, password, protocol, host, port)
      this.updater.netSession.setProxy({
        proxyRules
      })

      if (server.includes('@')) {
        this.updater.signals.login((_authInfo, callback) => {
          callback(username, password)
        })
      }
      return
    }

    // 系统代理模式且勾选"更新应用程序"：显式使用系统代理
    if (proxyMode === PROXY_MODE.SYSTEM && enableUpdateProxy) {
      this.updater.netSession.setProxy({
        proxyRules: 'system'
      })
    }
  }

  init () {
    // Event: error
    // Event: checking-for-update
    // Event: update-available
    // Event: update-not-available
    // Event: download-progress
    // Event: update-downloaded

    this.updater.on('checking-for-update', this.checkingForUpdate.bind(this))
    this.updater.on('update-available', this.updateAvailable.bind(this))
    this.updater.on('update-not-available', this.updateNotAvailable.bind(this))
    this.updater.on('download-progress', this.updateDownloadProgress.bind(this))
    this.updater.on('update-downloaded', this.updateDownloaded.bind(this))
    this.updater.on('update-cancelled', this.updateCancelled.bind(this))
    this.updater.on('error', this.updateError.bind(this))

    if (this.autoCheckData.checkEnable && !this.isChecking) {
      this.autoCheckData.userCheck = false
      this.updater.checkForUpdates()
    }
    if (this.autoCheckData.checkEnable) {
      this.startAutoCheckTimer()
    }
  }

  check () {
    this.autoCheckData.userCheck = true
    this.updater.checkForUpdates()
  }

  // 手动下载更新
  downloadUpdate () {
    this.emit('download-start')
    this.updater.downloadUpdate()
  }

  checkingForUpdate () {
    this.isChecking = true
    this.emit('checking')
    // 向所有窗口发送检查更新事件
    const windows = global.application?.windowManager?.getWindowList() || []
    windows.forEach(window => {
      window.webContents.send('checking-for-update')
    })
  }

  updateAvailable (event, info) {
    const data = (info && typeof info === 'object') ? info : (event && typeof event === 'object' ? event : {})
    this.emit('update-available', data)
    const windows = global.application?.windowManager?.getWindowList() || []
    logger.info('[Motrix] updateAvailable info:', JSON.stringify(data, null, 2))
    const versionPrimary = data?.version || data?.releaseName || (data?.updateInfo && data.updateInfo.version) || 'unknown'
    let finalVersion = versionPrimary
    if (versionPrimary === 'unknown') {
      if (data && typeof data === 'object') {
        for (const key in data) {
          if (key.toLowerCase().includes('version') || key.toLowerCase().includes('release')) {
            const value = data[key]
            if (value && value !== 'unknown' && typeof value === 'string') {
              finalVersion = value
              break
            }
          }
          const v = data.updateInfo && data.updateInfo.version
          if (v && typeof v === 'string') {
            finalVersion = v
            break
          }
        }
      }
    }
    let releaseNotes = ''
    const rawNotes = (data && typeof data === 'object')
      ? (data.releaseNotes || (data.updateInfo && data.updateInfo.releaseNotes))
      : ''
    if (Array.isArray(rawNotes)) {
      const matched = rawNotes.find((item) => {
        if (!item || typeof item !== 'object') {
          return false
        }
        if (item.version && typeof item.version === 'string') {
          return item.version === finalVersion || item.version === versionPrimary
        }
        return false
      })
      if (matched && typeof matched.note === 'string') {
        releaseNotes = matched.note
      } else {
        releaseNotes = rawNotes
          .map((item) => {
            if (!item) return ''
            if (typeof item === 'string') return item
            if (typeof item.note === 'string') return item.note
            return ''
          })
          .filter(Boolean)
          .join('\n\n')
      }
    } else if (typeof rawNotes === 'string') {
      releaseNotes = rawNotes
    }
    logger.info('[Motrix] Sending update-available with version:', finalVersion)
    windows.forEach(window => {
      window.webContents.send('update-available', finalVersion, releaseNotes)
    })
    if (global.application?.configManager) {
      global.application.configManager.setUserConfig('update-available', true)
      global.application.configManager.setUserConfig('new-version', finalVersion)
      global.application.configManager.setUserConfig('last-check-update-time', Date.now())
    }
    this.isChecking = false
    this.autoCheckData.userCheck = false
  }

  updateNotAvailable (event, info) {
    this.isChecking = false
    this.emit('update-not-available', info)
    // 向所有窗口发送更新不可用事件
    const windows = global.application?.windowManager?.getWindowList() || []
    windows.forEach(window => {
      window.webContents.send('update-not-available')
    })

    // 保存更新状态到配置文件，实现状态持久化
    if (global.application?.configManager) {
      global.application.configManager.setUserConfig('update-available', false)
      global.application.configManager.setUserConfig('new-version', '')
      global.application.configManager.setUserConfig('last-check-update-time', Date.now())
    }
  }

  /**
   * autoUpdater:download-progress
   * @param {Object} event
   * progress,
   * bytesPerSecond,
   * percent,
   * total,
   * transferred
   */
  updateDownloadProgress (event) {
    this.emit('download-progress', event)
  }

  updateDownloaded (event, info) {
    const data = (info && typeof info === 'object') ? info : (event && typeof event === 'object' ? event : {})
    this.emit('update-downloaded', data)
    try {
      this.updater.logger.log(`Update Downloaded: ${JSON.stringify(data, null, 2)}`)
    } catch (_) {
      this.updater.logger.log(`Update Downloaded: ${data}`)
    }
    this.isChecking = false
    this.emit('will-updated', data)
    // Notify renderer process about the downloaded update
    const windows = global.application?.windowManager?.getWindowList() || []
    windows.forEach(window => {
      window.webContents.send('update-downloaded', data)
    })
  }

  updateCancelled () {
    this.isChecking = false
  }

  updateError (event, error) {
    this.isChecking = false
    this.emit('update-error', error)
    // 向所有窗口发送更新错误事件
    const windows = global.application?.windowManager?.getWindowList() || []
    windows.forEach(window => {
      window.webContents.send('update-error')
    })
    const msg = (error == null)
      ? this.i18n.t('app.update-error-message')
      : (error.stack || error).toString()

    this.updater.logger.warn(`[Motrix] update-error: ${msg}`)
    // 不再显示系统弹窗，改为应用内通知
    // dialog.showErrorBox('Error', msg)
  }
}
