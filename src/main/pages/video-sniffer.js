(function () {
  'use strict'

  const log = (...args) => {
    console.log('[LinkCore:VideoSniffer]', ...args)
  }

  log('========== Script loaded! ==========')

  let config = {
    enabled: true,
    autoCombine: true,
    formats: ['m4s', 'mp4', 'flv', 'm3u8', 'ts', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus']
  }

  let useCustomFrame = false
  let locale = 'en-US'
  let translations = {}

  const defaultFormats = ['m4s', 'mp4', 'flv', 'm3u8', 'ts', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus']

  async function loadTranslations (locale) {
    try {
      const isDev = typeof __dirname === 'string' && __dirname.includes('src')
      const localePath = isDev ? `../../shared/locales/${locale}/window.js` : `../shared/locales/${locale}/window.js`
      try {
        const module = await import(localePath)
        translations = module.default || {}
        log('Translations loaded for locale:', locale)
      } catch (importError) {
        console.error('[LinkCore:VideoSniffer] Failed to import translations:', importError)
        const response = await fetch(localePath)
        if (response.ok) {
          const text = await response.text()
          const match = text.match(/export default\s*\{([\s\S]*?)\}/)
          if (match && match[1]) {
            // eslint-disable-next-line no-new-func
            const func = new Function(`return {${match[1]}}`)
            translations = func()
            log('Translations loaded for locale:', locale, '(fallback)')
          }
        }
      }
    } catch (e) {
      console.error('[LinkCore:VideoSniffer] Failed to load translations:', e)
    }
  }

  function t (key) {
    return translations[key] || key
  }

  function applyTheme (theme) {
    const isDark = theme === 'dark'
    log('Applying theme:', theme, 'isDark:', isDark)

    if (isDark) {
      document.body.classList.add('dark')
    } else {
      document.body.classList.remove('dark')
    }
  }

  function getCurrentTheme () {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.invoke('get-app-config').then((appConfig) => {
          if (appConfig && appConfig.theme) {
            const theme = appConfig.theme
            log('Current theme from app config:', theme)
            if (theme === 'dark') {
              applyTheme('dark')
            } else if (theme === 'light') {
              applyTheme('light')
            } else if (theme === 'auto') {
              const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
              applyTheme(isDark ? 'dark' : 'light')
            }
          }

          if (appConfig && typeof appConfig['hide-app-menu'] !== 'undefined') {
            useCustomFrame = !!appConfig['hide-app-menu']
            log('Use custom frame:', useCustomFrame)
            if (useCustomFrame) {
              document.body.classList.add('use-custom-frame')
            } else if (process && process.platform !== 'darwin') {
              document.body.classList.remove('use-custom-frame')
            }
          }
        }).catch((e) => {
          console.error('[LinkCore:VideoSniffer] Failed to get theme:', e)
        })
      }
    } catch (e) {
      console.error('[LinkCore:VideoSniffer] Failed to get theme:', e)
    }
  }

  function loadSettings () {
    log('Loading settings from localStorage...')
    try {
      const saved = localStorage.getItem('videoSnifferSettings')
      if (saved) {
        const parsed = JSON.parse(saved)
        config = { ...config, ...parsed }
        log('Loaded settings from localStorage:', config)
      }
    } catch (e) {
      console.error('[LinkCore:VideoSniffer] Failed to load settings:', e)
    }

    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.invoke('get-video-sniffer-config').then((mainConfig) => {
          if (mainConfig) {
            log('Loaded settings from main process:', mainConfig)
            config = { ...config, ...mainConfig }
            updateUI()
          }
        }).catch((e) => {
          console.error('[LinkCore:VideoSniffer] Failed to load settings from main process:', e)
        })
      }
    } catch (e) {
      console.error('[LinkCore:VideoSniffer] Failed to load settings from main process:', e)
    }
  }

  function saveSettings () {
    log('Saving settings...')
    try {
      localStorage.setItem('videoSnifferSettings', JSON.stringify(config))
      log('Settings saved to localStorage:', config)

      try {
        if (window.require && window.electronAPI) {
          window.electronAPI.sendVideoSnifferSettings(config)
          log('Settings sent via IPC:', config)
        } else if (window.require) {
          const { ipcRenderer } = window.require('electron')
          ipcRenderer.send('video-sniffer-settings-updated', config)
          log('Settings sent via IPC (legacy):', config)
        }
      } catch (e) {
        console.error('[LinkCore:VideoSniffer] Failed to send settings via IPC:', e)
      }
    } catch (e) {
      console.error('[LinkCore:VideoSniffer] Failed to save settings:', e)
    }
  }

  function updateUI () {
    const enabledCheckbox = document.getElementById('videoSnifferEnabled')
    const autoCombineCheckbox = document.getElementById('videoSnifferAutoCombine')
    const formatList = document.getElementById('formatList')

    if (enabledCheckbox) {
      enabledCheckbox.checked = config.enabled
    }

    if (autoCombineCheckbox) {
      autoCombineCheckbox.checked = config.autoCombine
    }

    if (formatList) {
      formatList.innerHTML = ''
      config.formats.forEach((format, index) => {
        const tag = document.createElement('div')
        tag.className = 'format-tag'

        const text = document.createTextNode(format)
        tag.appendChild(text)

        const removeBtn = document.createElement('span')
        removeBtn.className = 'remove-btn'
        removeBtn.dataset.index = index
        removeBtn.textContent = '×'

        tag.appendChild(removeBtn)
        formatList.appendChild(tag)
      })

      const addBtn = document.createElement('div')
      addBtn.className = 'format-tag add-btn'
      addBtn.textContent = '+'
      addBtn.addEventListener('click', showAddFormatDialog)
      formatList.appendChild(addBtn)
    }

    adjustWindowSize()
  }

  function adjustWindowSize () {
    try {
      if (window.require) {
        const { getCurrentWindow } = window.require('@electron/remote')
        const win = getCurrentWindow()
        if (!win) return

        const formatList = document.getElementById('formatList')
        if (!formatList) return

        const formatCount = config.formats.length
        const baseHeight = 420
        const heightPerRow = 32
        const formatsPerRow = Math.floor(500 / 80)
        const rows = Math.ceil(formatCount / formatsPerRow)
        const additionalHeight = rows > 1 ? (rows - 1) * heightPerRow : 0
        const newHeight = baseHeight + additionalHeight

        const [currentWidth, currentHeight] = win.getSize()
        if (currentHeight !== newHeight) {
          win.setSize(currentWidth, newHeight)
          win.setMinimumSize(500, newHeight)
          log('Window size adjusted to:', currentWidth, newHeight)
        }
      }
    } catch (e) {
      console.error('[LinkCore:VideoSniffer] Failed to adjust window size:', e)
    }
  }

  function applyTranslations () {
    const pageTitle = document.getElementById('pageTitle')
    const titleText = document.getElementById('titleText')
    const videoSnifferEnabledLabel = document.getElementById('videoSnifferEnabledLabel')
    const videoSnifferEnabledTips = document.getElementById('videoSnifferEnabledTips')
    const videoSnifferAutoCombineLabel = document.getElementById('videoSnifferAutoCombineLabel')
    const videoSnifferAutoCombineTips = document.getElementById('videoSnifferAutoCombineTips')
    const videoSnifferFormatsLabel = document.getElementById('videoSnifferFormatsLabel')
    const videoSnifferFormatsTips = document.getElementById('videoSnifferFormatsTips')
    const resetBtn = document.getElementById('resetBtn')
    const saveBtn = document.getElementById('saveBtn')

    if (pageTitle) {
      pageTitle.textContent = `${t('video-sniffer-settings-title')} - LinkCore`
    }

    if (titleText) {
      titleText.textContent = t('video-sniffer-settings-title')
    }

    if (videoSnifferEnabledLabel) {
      videoSnifferEnabledLabel.textContent = t('video-sniffer-enabled')
    }

    if (videoSnifferEnabledTips) {
      videoSnifferEnabledTips.textContent = t('video-sniffer-enabled-tips')
    }

    if (videoSnifferAutoCombineLabel) {
      videoSnifferAutoCombineLabel.textContent = t('video-sniffer-auto-combine')
    }

    if (videoSnifferAutoCombineTips) {
      videoSnifferAutoCombineTips.textContent = t('video-sniffer-auto-combine-tips')
    }

    if (videoSnifferFormatsLabel) {
      videoSnifferFormatsLabel.textContent = t('video-sniffer-formats')
    }

    if (videoSnifferFormatsTips) {
      videoSnifferFormatsTips.textContent = t('video-sniffer-formats-tips')
    }

    if (resetBtn) {
      resetBtn.textContent = t('reset')
    }

    if (saveBtn) {
      saveBtn.textContent = t('save')
    }
  }

  async function showAddFormatDialog () {
    try {
      if (window.require) {
        const { BrowserWindow } = window.require('@electron/remote')
        const { ipcRenderer } = window.require('electron')

        const parentWindow = BrowserWindow.getFocusedWindow()

        ipcRenderer.removeAllListeners('video-sniffer-format-added')

        let useCustomFrame = false
        let currentTheme = 'light'
        let currentLocale = 'en-US'
        try {
          const appConfig = await ipcRenderer.invoke('get-app-config')
          if (appConfig && appConfig['hide-app-menu']) {
            useCustomFrame = appConfig['hide-app-menu']
          }
          if (appConfig && appConfig.theme) {
            currentTheme = appConfig.theme
          }

          const appLocale = await ipcRenderer.invoke('get-app-locale')
          if (appLocale) {
            currentLocale = appLocale
          }
        } catch (e) {
          console.error('[LinkCore:VideoSniffer] Failed to get app config:', e)
        }

        const win = new BrowserWindow({
          width: 400,
          height: 220,
          resizable: false,
          maximizable: false,
          minimizable: false,
          frame: !useCustomFrame,
          parent: parentWindow,
          modal: true,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
          }
        })

        const url = `file://${__dirname.replace(/\\/g, '/')}/video-sniffer-add-format.html`

        win.loadURL(url)

        // 窗口加载完成后立即同步主题和语言
        win.webContents.once('dom-ready', () => {
          log('Child window DOM ready, syncing theme and locale:', currentTheme, currentLocale)
          win.webContents.send('sync-theme', { theme: currentTheme })
          win.webContents.send('sync-locale', { locale: currentLocale })
        })

        ipcRenderer.once('video-sniffer-format-added', (_, format) => {
          addFormat(format)
        })

        win.on('closed', () => {
          ipcRenderer.removeAllListeners('video-sniffer-format-added')
        })
      }
    } catch (e) {
      console.error('[LinkCore:VideoSniffer] Failed to open add format window:', e)
    }
  }

  function addFormat (format) {
    format = format.trim().toLowerCase()
    if (!format) return
    if (config.formats.includes(format)) {
      try {
        if (window.require) {
          const { dialog } = window.require('@electron/remote')
          dialog.showMessageBox({
            type: 'warning',
            title: t('video-sniffer-add-format'),
            message: t('video-sniffer-format-exists'),
            buttons: [t('confirm')],
            defaultId: 0
          })
        }
      } catch (e) {
        console.error('[LinkCore:VideoSniffer] Failed to show dialog:', e)
      }
      return
    }
    config.formats.push(format)
    saveSettings()
    updateUI()
  }

  function removeFormat (index) {
    config.formats.splice(index, 1)
    saveSettings()
    updateUI()
  }

  function resetSettings () {
    config = {
      enabled: true,
      autoCombine: true,
      formats: [...defaultFormats]
    }
    saveSettings()
    updateUI()
    log('Settings reset to default')
  }

  async function init () {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron')
        const appLocale = await ipcRenderer.invoke('get-app-locale')
        locale = appLocale || 'en-US'
        log('Current locale:', locale)
        await loadTranslations(locale)
      }
    } catch (e) {
      console.error('[LinkCore:VideoSniffer] Failed to get locale:', e)
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    log('DOM Content Loaded')
    await init()
    getCurrentTheme()
    loadSettings()
    updateUI()
    applyTranslations()

    const enabledCheckbox = document.getElementById('videoSnifferEnabled')
    const autoCombineCheckbox = document.getElementById('videoSnifferAutoCombine')
    const resetBtn = document.getElementById('resetBtn')
    const closeBtn = document.getElementById('closeBtn')
    const minimizeBtn = document.getElementById('minimizeBtn')

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        try {
          if (window.require) {
            const { getCurrentWindow } = window.require('@electron/remote')
            const win = getCurrentWindow()
            if (win) {
              win.minimize()
            }
          }
        } catch (e) {
          console.error('[LinkCore:VideoSniffer] Failed to minimize window:', e)
        }
      })
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        try {
          if (window.require) {
            const { getCurrentWindow } = window.require('@electron/remote')
            const win = getCurrentWindow()
            if (win) {
              win.close()
            }
          }
        } catch (e) {
          console.error('[LinkCore:VideoSniffer] Failed to close window:', e)
          window.close()
        }
      })
    }

    if (enabledCheckbox) {
      enabledCheckbox.addEventListener('change', (e) => {
        config.enabled = e.target.checked
        saveSettings()
        log('Enabled changed:', config.enabled)
      })
    }

    if (autoCombineCheckbox) {
      autoCombineCheckbox.addEventListener('change', (e) => {
        config.autoCombine = e.target.checked
        saveSettings()
        log('AutoCombine changed:', config.autoCombine)
      })
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm(t('video-sniffer-reset-confirm'))) {
          resetSettings()
        }
      })
    }

    const formatList = document.getElementById('formatList')
    if (formatList) {
      formatList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
          const index = parseInt(e.target.dataset.index)
          removeFormat(index)
        }
      })
    }

    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.on('command', (_, command, ...args) => {
          log('Command received:', command, args)
          if (command === 'application:update-system-theme') {
            const data = args[0]
            log('System theme updated:', data)
            if (data && data.theme) {
              const theme = data.theme
              if (theme === 'dark') {
                applyTheme('dark')
              } else if (theme === 'light') {
                applyTheme('light')
              } else if (theme === 'auto') {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
                applyTheme(isDark ? 'dark' : 'light')
              }

              // 通知所有子窗口主题变化
              notifyChildWindows(data)
            }
          } else if (command === 'application:update-theme') {
            const data = args[0]
            log('Theme updated:', data)
            if (data && data.theme) {
              const theme = data.theme
              if (theme === 'dark') {
                applyTheme('dark')
              } else if (theme === 'light') {
                applyTheme('light')
              } else if (theme === 'auto') {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
                applyTheme(isDark ? 'dark' : 'light')
              }

              // 通知所有子窗口主题变化
              notifyChildWindows(data)
            }
          } else if (command === 'application:update-locale') {
            const data = args[0]
            log('Locale updated:', data)
            if (data && data.locale) {
              handleLocaleChange(data.locale)
            }
          }
        })

        // 监听子窗口的主题请求
        ipcRenderer.on('request-current-theme', async () => {
          log('Child window requested current theme')
          try {
            const appConfig = await ipcRenderer.invoke('get-app-config')
            if (appConfig && appConfig.theme) {
              // 发送当前主题给请求的子窗口
              ipcRenderer.send('current-theme-response', { theme: appConfig.theme })
              log('Sent current theme to child window:', appConfig.theme)
            }
          } catch (e) {
            console.error('[LinkCore:VideoSniffer] Failed to get current theme for child window:', e)
          }
        })

        // 监听子窗口的语言请求
        ipcRenderer.on('request-current-locale', async () => {
          log('Child window requested current locale')
          try {
            const appLocale = await ipcRenderer.invoke('get-app-locale')
            if (appLocale) {
              // 发送当前语言给请求的子窗口
              ipcRenderer.send('current-locale-response', { locale: appLocale })
              log('Sent current locale to child window:', appLocale)
            }
          } catch (e) {
            console.error('[LinkCore:VideoSniffer] Failed to get current locale for child window:', e)
          }
        })
      }
    } catch (e) {
      console.error('[LinkCore:VideoSniffer] Failed to listen for theme changes:', e)
    }

    // 处理语言变化
    async function handleLocaleChange (newLocale) {
      log('Handling locale change:', newLocale)
      locale = newLocale
      try {
        await loadTranslations(locale)
        applyTranslations()
        log('Locale changed and translations applied:', locale)

        // 通知所有子窗口语言变化
        notifyChildWindowsLocale({ locale: newLocale })
      } catch (e) {
        console.error('[LinkCore:VideoSniffer] Failed to handle locale change:', e)
      }
    }

    // 通知子窗口主题变化的函数
    function notifyChildWindows (themeData) {
      try {
        if (window.require) {
          const { BrowserWindow } = window.require('@electron/remote')
          const allWindows = BrowserWindow.getAllWindows()
          const currentWindow = BrowserWindow.getFocusedWindow()

          allWindows.forEach(win => {
            if (win !== currentWindow && win.webContents) {
              try {
                win.webContents.send('sync-theme', themeData)
                log('Sent theme sync to child window:', themeData)
              } catch (e) {
                // 忽略已关闭的窗口
              }
            }
          })
        }
      } catch (e) {
        console.error('[LinkCore:VideoSniffer] Failed to notify child windows:', e)
      }
    }

    // 通知子窗口语言变化的函数
    function notifyChildWindowsLocale (localeData) {
      try {
        if (window.require) {
          const { BrowserWindow } = window.require('@electron/remote')
          const allWindows = BrowserWindow.getAllWindows()
          const currentWindow = BrowserWindow.getFocusedWindow()

          allWindows.forEach(win => {
            if (win !== currentWindow && win.webContents) {
              try {
                win.webContents.send('sync-locale', localeData)
                log('Sent locale sync to child window:', localeData)
              } catch (e) {
                // 忽略已关闭的窗口
              }
            }
          })
        }
      } catch (e) {
        console.error('[LinkCore:VideoSniffer] Failed to notify child windows locale:', e)
      }
    }
  })
})()
