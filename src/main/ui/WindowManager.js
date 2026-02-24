import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { debounce } from 'lodash'
import { app, shell, screen, BrowserWindow } from 'electron'
import is from 'electron-is'

import pageConfig from '../configs/page'
import logger from '../core/Logger'

const baseBrowserOptions = {
  titleBarStyle: 'hiddenInset',
  show: false,
  width: 1024,
  height: 768,
  backgroundColor: '#fff',
  webPreferences: {
    nodeIntegration: true
  }
}

// fix: BrowserWindow rendering bug under linux
const defaultBrowserOptions = is.macOS()
  ? {
    ...baseBrowserOptions,
    vibrancy: 'ultra-dark',
    visualEffectState: 'active',
    backgroundColor: '#00000000'
  }
  : {
    ...baseBrowserOptions
  }

export default class WindowManager extends EventEmitter {
  constructor (options = {}) {
    super()
    this.userConfig = options.userConfig || {}

    this.windows = {}

    this.willQuit = false

    this.windowRecoveryState = new Map()
    this.forceTopmostState = new WeakMap()

    this.handleBeforeQuit()

    this.handleAllWindowClosed()
  }

  setWillQuit (flag) {
    this.willQuit = flag
  }

  getPageOptions (page) {
    const result = pageConfig[page] || {}
    const hideAppMenu = this.userConfig['hide-app-menu']
    if (hideAppMenu) {
      result.attrs.frame = false
    }

    // Optimized for small screen users
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const widthScale = width >= 1280 ? 1 : 0.875
    const heightScale = height >= 800 ? 1 : 0.875
    result.attrs.width *= widthScale
    result.attrs.height *= heightScale

    if (is.linux()) {
      result.attrs.icon = join(__static, './512x512.png')
    }

    // Set window icon for Windows platform
    if (is.windows()) {
      result.attrs.icon = join(__static, './L_ico_256x256.ico')
    }

    return result
  }

  getPageBounds (page) {
    const enabled = this.userConfig['keep-window-state']
    const windowStateMap = this.userConfig['window-state'] || {}
    let result = null
    if (enabled) {
      result = windowStateMap[page]
    }

    return result
  }

  openWindow (page, options = {}) {
    const pageOptions = this.getPageOptions(page)
    const { hidden } = options
    const autoHideWindow = this.userConfig['auto-hide-window']
    let window = this.windows[page] || null
    if (window && typeof window.isDestroyed === 'function' && window.isDestroyed()) {
      this.removeWindow(page)
      window = null
    }
    if (window) {
      window.show()
      window.focus()
      return window
    }

    window = new BrowserWindow({
      ...defaultBrowserOptions,
      ...pageOptions.attrs,
      webPreferences: {
        enableRemoteModule: true,
        contextIsolation: false,
        backgroundThrottling: true,
        spellcheck: false,
        nodeIntegration: true,
        nodeIntegrationInWorker: true
      }
    })

    const bounds = this.getPageBounds(page)
    if (bounds) {
      window.setBounds(bounds)
    }

    if (is.dev() && pageOptions.openDevTools) {
      window.webContents.openDevTools()
    }

    window.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })

    if (pageOptions.url) {
      window.loadURL(pageOptions.url)
    }

    this.bindWindowHealth(page, window, pageOptions)

    window.once('ready-to-show', () => {
      if (!hidden) {
        window.show()
      }
    })

    window.on('enter-full-screen', () => {
      this.emit('enter-full-screen', window)
    })

    window.on('leave-full-screen', () => {
      this.emit('leave-full-screen', window)
    })

    this.handleWindowState(page, window)

    this.handleWindowClose(pageOptions, page, window)

    this.bindAfterClosed(page, window)

    this.addWindow(page, window)
    if (autoHideWindow) {
      this.handleWindowBlur()
    }

    return window
  }

  getWindowRecoveryState (page) {
    if (!this.windowRecoveryState.has(page)) {
      this.windowRecoveryState.set(page, {
        reloadTimer: null,
        lastRecoverAt: 0,
        recoverCount: 0,
        lastUnresponsiveAt: 0
      })
    }
    return this.windowRecoveryState.get(page)
  }

  clearWindowReloadTimer (page) {
    const state = this.windowRecoveryState.get(page)
    if (!state || !state.reloadTimer) {
      return
    }
    clearTimeout(state.reloadTimer)
    state.reloadTimer = null
  }

  scheduleWindowReload (page, window, pageOptions, reason) {
    if (this.willQuit) {
      return
    }
    if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) {
      return
    }
    if (!pageOptions || !pageOptions.url) {
      return
    }

    const state = this.getWindowRecoveryState(page)
    if (state.reloadTimer) {
      return
    }

    const now = Date.now()
    if (now - state.lastRecoverAt > 60000) {
      state.recoverCount = 0
    }
    if (state.recoverCount >= 3) {
      logger.error(`[Motrix] window recovery halted (too frequent): page=${page} reason=${reason}`)
      return
    }

    state.reloadTimer = setTimeout(() => {
      state.reloadTimer = null
      if (this.willQuit) {
        return
      }
      if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) {
        return
      }
      try {
        state.lastRecoverAt = Date.now()
        state.recoverCount += 1
        window.loadURL(pageOptions.url)
      } catch (e) {
        logger.error(`[Motrix] window reload failed: page=${page} reason=${reason} message=${e && e.message ? e.message : e}`)
      }
    }, 1200)
  }

  bindWindowHealth (page, window, pageOptions) {
    if (!window) {
      return
    }
    const state = this.getWindowRecoveryState(page)

    window.on('unresponsive', () => {
      state.lastUnresponsiveAt = Date.now()
      logger.warn(`[Motrix] window unresponsive: page=${page}`)
      this.scheduleWindowReload(page, window, pageOptions, 'unresponsive')
    })

    window.on('responsive', () => {
      state.lastUnresponsiveAt = 0
      this.clearWindowReloadTimer(page)
    })

    if (window.webContents && typeof window.webContents.on === 'function') {
      window.webContents.on('render-process-gone', (_event, details) => {
        const reason = details && details.reason ? details.reason : 'unknown'
        const exitCode = details && typeof details.exitCode !== 'undefined' ? details.exitCode : ''
        logger.error(`[Motrix] render-process-gone: page=${page} reason=${reason} exitCode=${exitCode}`)
        this.scheduleWindowReload(page, window, pageOptions, `render-process-gone:${reason}`)
      })

      window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) {
          return
        }
        logger.warn(`[Motrix] did-fail-load: page=${page} code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
        this.scheduleWindowReload(page, window, pageOptions, `did-fail-load:${errorCode}`)
      })
    }
  }

  getWindow (page) {
    return this.windows[page]
  }

  getWindows () {
    return this.windows || {}
  }

  getWindowList () {
    return Object.values(this.getWindows())
  }

  addWindow (page, window) {
    this.windows[page] = window
  }

  destroyWindow (page) {
    const win = this.getWindow(page)
    if (!win) {
      return
    }

    this.removeWindow(page)
    win.removeListener('closed')
    win.removeListener('move')
    win.removeListener('resize')
    win.destroy()
  }

  removeWindow (page) {
    this.windows[page] = null
  }

  bindAfterClosed (page, window) {
    window.on('closed', (event) => {
      this.removeWindow(page)
      this.clearWindowReloadTimer(page)
      this.windowRecoveryState.delete(page)
      const forceState = this.forceTopmostState.get(window)
      if (forceState && forceState.timer) {
        clearTimeout(forceState.timer)
      }
      this.forceTopmostState.delete(window)
    })
  }

  handleWindowState (page, window) {
    window.on('resize', debounce(() => {
      const bounds = window.getBounds()
      this.emit('window-resized', { page, bounds })
    }, 500))

    window.on('move', debounce(() => {
      const bounds = window.getBounds()
      this.emit('window-moved', { page, bounds })
    }, 500))
  }

  handleWindowClose (pageOptions, page, window) {
    window.on('close', (event) => {
      if (pageOptions.bindCloseToHide && !this.willQuit) {
        event.preventDefault()

        // @see https://github.com/electron/electron/issues/20263
        if (window.isFullScreen()) {
          window.once('leave-full-screen', () => window.hide())

          window.setFullScreen(false)
        } else {
          window.hide()
        }
      }
      const bounds = window.getBounds()
      this.emit('window-closed', { page, bounds })
    })
  }

  showWindow (page) {
    const window = this.getWindow(page)
    if (!window) {
      return
    }
    if (window.isMinimized()) {
      window.restore()
    }
    if (!window.isVisible()) {
      window.show()
    }
    window.focus()
  }

  bringToFront (page) {
    let window = this.getWindow(page)
    if (!window) {
      window = this.openWindow(page, { hidden: false })
    }
    if (!window) {
      return
    }
    if (typeof window.isDestroyed === 'function' && window.isDestroyed()) {
      return
    }

    try {
      if (window.isMinimized && window.isMinimized()) {
        window.restore()
      }
      if (window.show) {
        window.show()
      }
      if (app && typeof app.focus === 'function') {
        try {
          app.focus({ steal: true })
        } catch (e) {
          try { app.focus() } catch (_) {}
        }
      }
      if (window.focus) window.focus()
      if (window.moveTop) window.moveTop()

      if (window.setAlwaysOnTop) {
        let state = this.forceTopmostState.get(window)
        if (state && state.timer) {
          clearTimeout(state.timer)
          state.timer = null
        }
        if (!state) {
          const originalAlwaysOnTop = window.isAlwaysOnTop && window.isAlwaysOnTop()
          state = { originalAlwaysOnTop: !!originalAlwaysOnTop, timer: null }
          this.forceTopmostState.set(window, state)
        }

        try {
          window.setAlwaysOnTop(true)
        } catch (e) {}

        const timer = setTimeout(() => {
          const current = this.forceTopmostState.get(window)
          if (!current || current !== state || current.timer !== timer) {
            return
          }
          this.forceTopmostState.delete(window)
          if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) {
            return
          }
          try {
            window.setAlwaysOnTop(!!state.originalAlwaysOnTop)
          } catch (e) {}
        }, 250)
        state.timer = timer
      }
    } catch (e) {}
  }

  hideWindow (page) {
    const window = this.getWindow(page)
    if (!window || !window.isVisible()) {
      return
    }
    window.hide()
  }

  hideAllWindow () {
    this.getWindowList().forEach((window) => {
      window.hide()
    })
  }

  toggleWindow (page) {
    const window = this.getWindow(page)
    if (!window) {
      return
    }

    if (!window.isVisible() || window.isFullScreen()) {
      window.show()
    } else {
      window.hide()
    }
  }

  getFocusedWindow () {
    return BrowserWindow.getFocusedWindow()
  }

  handleBeforeQuit () {
    app.on('before-quit', () => {
      this.setWillQuit(true)
    })
  }

  onWindowBlur (event, window) {
    window.hide()
  }

  handleWindowBlur () {
    app.on('browser-window-blur', this.onWindowBlur)
  }

  unbindWindowBlur () {
    app.removeListener('browser-window-blur', this.onWindowBlur)
  }

  handleAllWindowClosed () {
    app.on('window-all-closed', (event) => {
      // 阻止默认的退出行为，保持应用在后台运行（系统托盘）
      // 用户需要通过菜单或托盘明确选择退出才能关闭程序
      event.preventDefault()
    })
  }

  sendCommandTo (window, command, ...args) {
    if (!window) {
      return
    }
    logger.info('[Motrix] send command to:', command, ...args)
    window.webContents.send('command', command, ...args)
  }

  sendMessageTo (window, channel, ...args) {
    if (!window) {
      return
    }
    window.webContents.send(channel, ...args)
  }
}
