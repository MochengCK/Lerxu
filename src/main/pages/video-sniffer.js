(function () {
  'use strict'

  const log = (...args) => {
    console.log('[Lerxu:VideoSniffer]', ...args)
  }

  log('========== Script loaded! ==========')

  let config = {
    enabled: true,
    autoCombine: true,
    formats: ['m4s', 'mp4', 'flv', 'm3u8', 'm3u', 'ts', 'm2ts', 'mts', 'cmfv', 'cmfa', 'mp2t', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ism', 'ismc', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus']
  }

  let useCustomFrame = false
  let locale = 'en-US'
  let translations = {}

  const defaultFormats = ['m4s', 'mp4', 'flv', 'm3u8', 'm3u', 'ts', 'm2ts', 'mts', 'cmfv', 'cmfa', 'mp2t', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ism', 'ismc', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus']

  async function loadTranslations (locale) {
    try {
      const isDev = typeof __dirname === 'string' && __dirname.includes('src')
      const localePath = isDev ? `../../shared/locales/${locale}/window.js` : `../shared/locales/${locale}/window.js`
      try {
        const module = await import(localePath)
        translations = module.default || {}
        log('Translations loaded for locale:', locale)
      } catch (importError) {
        console.error('[Lerxu:VideoSniffer] Failed to import translations:', importError)
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
      console.error('[Lerxu:VideoSniffer] Failed to load translations:', e)
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
          console.error('[Lerxu:VideoSniffer] Failed to get theme:', e)
        })
      }
    } catch (e) {
      console.error('[Lerxu:VideoSniffer] Failed to get theme:', e)
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
      console.error('[Lerxu:VideoSniffer] Failed to load settings:', e)
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
          console.error('[Lerxu:VideoSniffer] Failed to load settings from main process:', e)
        })
      }
    } catch (e) {
      console.error('[Lerxu:VideoSniffer] Failed to load settings from main process:', e)
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
        console.error('[Lerxu:VideoSniffer] Failed to send settings via IPC:', e)
      }
    } catch (e) {
      console.error('[Lerxu:VideoSniffer] Failed to save settings:', e)
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

  async function adjustWindowSize () {
    try {
      const bridge = window.lerxuNative
      if (!bridge) {
        return
      }

      const formatList = document.getElementById('formatList')
      if (!formatList) return

      const formatCount = config.formats.length
      const baseHeight = 420
      const heightPerRow = 32
      const formatsPerRow = Math.floor(500 / 80)
      const rows = Math.ceil(formatCount / formatsPerRow)
      const additionalHeight = rows > 1 ? (rows - 1) * heightPerRow : 0
      const newHeight = baseHeight + additionalHeight

      const bounds = await bridge.getWindowBounds()
      if (bounds && bounds.height !== newHeight) {
        bridge.setWindowSize(bounds.width, newHeight)
        bridge.setMinimumSize(500, newHeight)
        log('Window size adjusted to:', bounds.width, newHeight)
      }
    } catch (e) {
      console.error('[Lerxu:VideoSniffer] Failed to adjust window size:', e)
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
      pageTitle.textContent = `${t('video-sniffer-settings-title')} - Lerxu`
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
      const bridge = window.lerxuNative
      if (!bridge || !window.require) {
        return
      }
      const { ipcRenderer } = window.require('electron')

      // 先摘掉上一次的监听：同一时刻只允许一个「添加格式」子窗把结果回传进来
      ipcRenderer.removeAllListeners('video-sniffer-format-added')

      let currentTheme = 'light'
      let currentLocale = 'en-US'
      try {
        const appConfig = await ipcRenderer.invoke('get-app-config')
        if (appConfig && appConfig.theme) {
          currentTheme = appConfig.theme
        }

        const appLocale = await ipcRenderer.invoke('get-app-locale')
        if (appLocale) {
          currentLocale = appLocale
        }
      } catch (e) {
        console.error('[Lerxu:VideoSniffer] Failed to get app config:', e)
      }

      ipcRenderer.once('video-sniffer-format-added', (_, format) => {
        addFormat(format)
      })

      // 窗口由主进程创建（parent/modal/尺寸/主题语言同步都在那边），
      // 这里只发一次 IPC —— 不再用 remote 的 `new BrowserWindow(...)`
      const opened = await bridge.openAddFormatWindow({
        theme: currentTheme,
        locale: currentLocale
      })
      if (!opened) {
        ipcRenderer.removeAllListeners('video-sniffer-format-added')
        console.error('[Lerxu:VideoSniffer] Failed to open add format window')
      }
    } catch (e) {
      console.error('[Lerxu:VideoSniffer] Failed to open add format window:', e)
    }
  }

  function addFormat (format) {
    format = format.trim().toLowerCase()
    if (!format) return
    if (config.formats.includes(format)) {
      try {
        const bridge = window.lerxuNative
        if (bridge) {
          bridge.showMessageBox({
            type: 'warning',
            title: t('video-sniffer-add-format'),
            message: t('video-sniffer-format-exists'),
            buttons: [t('confirm')],
            defaultId: 0
          })
        }
      } catch (e) {
        console.error('[Lerxu:VideoSniffer] Failed to show dialog:', e)
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
      console.error('[Lerxu:VideoSniffer] Failed to get locale:', e)
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
          if (window.lerxuNative) {
            window.lerxuNative.minimizeWindow()
          }
        } catch (e) {
          console.error('[Lerxu:VideoSniffer] Failed to minimize window:', e)
        }
      })
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        try {
          if (window.lerxuNative) {
            window.lerxuNative.closeWindow()
          } else {
            window.close()
          }
        } catch (e) {
          console.error('[Lerxu:VideoSniffer] Failed to close window:', e)
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
        // （子窗的主题/语言由主进程在 dom-ready 时推一次，变化时由下面两个
        //   notify* 广播，所以不再需要「子窗来问、父窗回答」这条往返：
        //   那条路径原本也不通 —— 父窗 `ipcRenderer.send` 发去的是主进程）
      }
    } catch (e) {
      console.error('[Lerxu:VideoSniffer] Failed to listen for theme changes:', e)
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
        console.error('[Lerxu:VideoSniffer] Failed to handle locale change:', e)
      }
    }

    // 通知子窗口主题变化的函数
    // 主进程的 `native:broadcast` 会把消息发给"除自己以外的所有窗口"，
    // 与原来 BrowserWindow.getAllWindows() 里排除当前窗口等价
    function notifyChildWindows (themeData) {
      try {
        if (window.lerxuNative) {
          window.lerxuNative.broadcast('sync-theme', themeData)
          log('Sent theme sync to child windows:', themeData)
        }
      } catch (e) {
        console.error('[Lerxu:VideoSniffer] Failed to notify child windows:', e)
      }
    }

    // 通知子窗口语言变化的函数
    function notifyChildWindowsLocale (localeData) {
      try {
        if (window.lerxuNative) {
          window.lerxuNative.broadcast('sync-locale', localeData)
          log('Sent locale sync to child windows:', localeData)
        }
      } catch (e) {
        console.error('[Lerxu:VideoSniffer] Failed to notify child windows locale:', e)
      }
    }
  })
})()
