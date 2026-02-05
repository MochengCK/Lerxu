(function () {
  'use strict'

  const log = (...args) => {
    console.log('[Video Sniffer Add Format]', ...args)
  }

  log('========== Script loaded! ==========')

  let locale = 'en-US'
  let translations = {}

  async function loadTranslations (locale) {
    try {
      const isDev = typeof __dirname === 'string' && __dirname.includes('src')
      const localePath = isDev ? `../../shared/locales/${locale}/window.js` : `../shared/locales/${locale}/window.js`
      try {
        const module = await import(localePath)
        translations = module.default || {}
        log('Translations loaded for locale:', locale)
      } catch (importError) {
        console.error('[Video Sniffer Add Format] Failed to import translations:', importError)
      }
    } catch (e) {
      console.error('[Video Sniffer Add Format] Failed to load translations:', e)
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
            const useCustomFrame = !!appConfig['hide-app-menu']
            log('Use custom frame:', useCustomFrame)
            if (useCustomFrame) {
              document.body.classList.add('use-custom-frame')
            } else {
              document.body.classList.remove('use-custom-frame')
            }
          }
        }).catch((e) => {
          console.error('[Video Sniffer Add Format] Failed to get theme:', e)
        })
      }
    } catch (e) {
      console.error('[Video Sniffer Add Format] Failed to get theme:', e)
    }
  }

  // 添加主题同步函数，从父窗口获取当前主题
  function syncThemeFromParent () {
    try {
      if (window.require) {
        const { getCurrentWindow } = window.require('@electron/remote')
        const win = getCurrentWindow()
        const parentWindow = win.getParentWindow()

        if (parentWindow && parentWindow.webContents) {
          // 请求父窗口发送当前主题
          parentWindow.webContents.send('request-current-theme')
          log('Requested current theme from parent window')
        }
      }
    } catch (e) {
      console.error('[Video Sniffer Add Format] Failed to sync theme from parent:', e)
    }
  }

  // 添加语言同步函数，从父窗口获取当前语言
  function syncLocaleFromParent () {
    try {
      if (window.require) {
        const { getCurrentWindow } = window.require('@electron/remote')
        const win = getCurrentWindow()
        const parentWindow = win.getParentWindow()

        if (parentWindow && parentWindow.webContents) {
          // 请求父窗口发送当前语言
          parentWindow.webContents.send('request-current-locale')
          log('Requested current locale from parent window')
        }
      }
    } catch (e) {
      console.error('[Video Sniffer Add Format] Failed to sync locale from parent:', e)
    }
  }

  // 处理语言变化
  async function handleLocaleChange (newLocale) {
    log('Handling locale change:', newLocale)
    locale = newLocale
    try {
      await loadTranslations(locale)
      applyTranslations()
      log('Locale changed and translations applied:', locale)
    } catch (e) {
      console.error('[Video Sniffer Add Format] Failed to handle locale change:', e)
    }
  }

  function applyTranslations () {
    const titleText = document.getElementById('titleText')
    const formatLabel = document.getElementById('formatLabel')
    const formatInput = document.getElementById('formatInput')
    const cancelBtn = document.getElementById('cancelBtn')
    const confirmBtn = document.getElementById('confirmBtn')

    if (titleText) {
      titleText.textContent = t('video-sniffer-add-format')
    }

    if (formatLabel) {
      formatLabel.textContent = t('video-sniffer-formats')
    }

    if (formatInput) {
      formatInput.placeholder = t('video-sniffer-format-placeholder')
    }

    if (cancelBtn) {
      cancelBtn.textContent = t('cancel')
    }

    if (confirmBtn) {
      confirmBtn.textContent = t('confirm')
    }
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
      console.error('[Video Sniffer Add Format] Failed to get locale:', e)
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    log('DOM Content Loaded')
    await init()
    getCurrentTheme()

    // 同步父窗口主题和语言
    syncThemeFromParent()
    syncLocaleFromParent()

    applyTranslations()

    const formatInput = document.getElementById('formatInput')
    const confirmBtn = document.getElementById('confirmBtn')
    const cancelBtn = document.getElementById('cancelBtn')
    const closeBtn = document.getElementById('closeBtn')

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
          console.error('[Video Sniffer Add Format] Failed to close window:', e)
          window.close()
        }
      })
    }

    const confirmHandler = () => {
      const format = formatInput.value.trim().toLowerCase()
      if (format) {
        try {
          if (window.require) {
            const { getCurrentWindow } = window.require('@electron/remote')
            const win = getCurrentWindow()
            const parentWindow = win.getParentWindow()

            if (parentWindow) {
              parentWindow.webContents.send('video-sniffer-format-added', format)
              log('Format sent via IPC:', format)
            } else {
              console.error('[Video Sniffer Add Format] No parent window found')
            }
          }
        } catch (e) {
          console.error('[Video Sniffer Add Format] Failed to send format via IPC:', e)
        }
      }
      try {
        if (window.require) {
          const { getCurrentWindow } = window.require('@electron/remote')
          const win = getCurrentWindow()
          if (win) {
            win.close()
          }
        }
      } catch (e) {
        console.error('[Video Sniffer Add Format] Failed to close window:', e)
        window.close()
      }
    }

    const cancelHandler = () => {
      try {
        if (window.require) {
          const { getCurrentWindow } = window.require('@electron/remote')
          const win = getCurrentWindow()
          if (win) {
            win.close()
          }
        }
      } catch (e) {
        console.error('[Video Sniffer Add Format] Failed to close window:', e)
        window.close()
      }
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', confirmHandler)
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', cancelHandler)
    }

    if (formatInput) {
      formatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          confirmHandler()
        } else if (e.key === 'Escape') {
          cancelHandler()
        }
      })
      formatInput.focus()
    }

    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron')

        // 监听主题变化命令
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
            }
          } else if (command === 'application:update-locale') {
            const data = args[0]
            log('Locale updated:', data)
            if (data && data.locale) {
              handleLocaleChange(data.locale)
            }
          }
        })

        // 监听来自父窗口的主题同步消息
        ipcRenderer.on('sync-theme', (_, themeData) => {
          log('Theme sync received from parent:', themeData)
          if (themeData && themeData.theme) {
            const theme = themeData.theme
            if (theme === 'dark') {
              applyTheme('dark')
            } else if (theme === 'light') {
              applyTheme('light')
            } else if (theme === 'auto') {
              const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
              applyTheme(isDark ? 'dark' : 'light')
            }
          }
        })

        // 监听来自父窗口的语言同步消息
        ipcRenderer.on('sync-locale', (_, localeData) => {
          log('Locale sync received from parent:', localeData)
          if (localeData && localeData.locale) {
            handleLocaleChange(localeData.locale)
          }
        })

        // 监听父窗口的主题请求响应
        ipcRenderer.on('current-theme-response', (_, themeData) => {
          log('Current theme response received:', themeData)
          if (themeData && themeData.theme) {
            const theme = themeData.theme
            if (theme === 'dark') {
              applyTheme('dark')
            } else if (theme === 'light') {
              applyTheme('light')
            } else if (theme === 'auto') {
              const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
              applyTheme(isDark ? 'dark' : 'light')
            }
          }
        })

        // 监听父窗口的语言请求响应
        ipcRenderer.on('current-locale-response', (_, localeData) => {
          log('Current locale response received:', localeData)
          if (localeData && localeData.locale) {
            handleLocaleChange(localeData.locale)
          }
        })

        // 定期同步主题和语言（作为备用机制）
        const syncInterval = setInterval(() => {
          Promise.all([
            ipcRenderer.invoke('get-app-config'),
            ipcRenderer.invoke('get-app-locale')
          ]).then(([appConfig, appLocale]) => {
            // 检查主题
            if (appConfig && appConfig.theme) {
              const theme = appConfig.theme
              const currentIsDark = document.body.classList.contains('dark')
              let shouldBeDark = false

              if (theme === 'dark') {
                shouldBeDark = true
              } else if (theme === 'auto') {
                shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches
              }

              if (currentIsDark !== shouldBeDark) {
                log('Theme sync detected change, updating:', shouldBeDark ? 'dark' : 'light')
                applyTheme(shouldBeDark ? 'dark' : 'light')
              }
            }

            // 检查语言
            if (appLocale && appLocale !== locale) {
              log('Locale sync detected change, updating:', appLocale)
              handleLocaleChange(appLocale)
            }
          }).catch(() => {
            // 忽略错误，可能窗口已关闭
          })
        }, 1000) // 每秒检查一次

        // 窗口关闭时清理定时器
        window.addEventListener('beforeunload', () => {
          clearInterval(syncInterval)
        })
      }
    } catch (e) {
      console.error('[Video Sniffer Add Format] Failed to listen for theme changes:', e)
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      try {
        if (window.require) {
          const { ipcRenderer } = window.require('electron')
          ipcRenderer.invoke('get-app-config').then((appConfig) => {
            if (appConfig && appConfig.theme === 'auto') {
              const isDark = e.matches
              applyTheme(isDark ? 'dark' : 'light')
              log('System theme changed:', isDark ? 'dark' : 'light')
            }
          }).catch((err) => {
            console.error('[Video Sniffer Add Format] Failed to get app config:', err)
          })
        }
      } catch (e) {
        console.error('[Video Sniffer Add Format] Failed to handle system theme change:', e)
      }
    })
  })
})()
