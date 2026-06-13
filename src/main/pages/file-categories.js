(function () {
  'use strict'

  const log = (...args) => {
    console.log('[File Categories Settings]', ...args)
  }

  log('========== Script loaded! ==========')

  // 默认分类配置
  const defaultCategories = {
    images: { name: 'image-files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] },
    documents: { name: 'document-files', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'xls', 'xlsx', 'ppt', 'pptx'] },
    audio: { name: 'audio-files', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma'] },
    video: { name: 'video-files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] },
    archives: { name: 'archive-files', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] },
    programs: { name: 'program-files', extensions: ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm'] },
    others: { name: 'other-files', extensions: [] }
  }

  // 当前配置
  let categories = {}
  let originalCategories = {}
  let useCustomFrame = false
  let locale = 'zh-CN'
  let translations = {}

  // 确认对话框回调
  let confirmCallback = null

  async function loadTranslations (locale) {
    try {
      const isDev = typeof __dirname === 'string' && __dirname.includes('src')
      const localePath = isDev ? `../../shared/locales/${locale}/window.js` : `../shared/locales/${locale}/window.js`
      try {
        const module = await import(localePath)
        translations = module.default || {}
        log('Translations loaded for locale:', locale)
      } catch (importError) {
        console.error('[File Categories] Failed to import translations:', importError)
        const response = await fetch(localePath)
        if (response.ok) {
          const text = await response.text()
          const match = text.match(/export default\s*\{([\s\S]*?)\}/)
          if (match && match[1]) {
            // eslint-disable-next-line
            const func = new Function(`return {${match[1]}}`)
            translations = func()
            log('Translations loaded for locale:', locale, '(fallback)')
          }
        }
      }
    } catch (e) {
      console.error('[File Categories] Failed to load translations:', e)
    }
  }

  function t (key) {
    if (!translations) return ''
    return Object.prototype.hasOwnProperty.call(translations, key) ? translations[key] : ''
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
          console.error('[File Categories] Failed to get theme:', e)
        })
      }
    } catch (e) {
      console.error('[File Categories] Failed to get theme:', e)
    }
  }

  function loadSettings () {
    log('Loading settings...')
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.invoke('get-file-categories-config').then((mainConfig) => {
          if (mainConfig) {
            log('Loaded settings from main process:', mainConfig)
            categories = { ...mainConfig }
            originalCategories = JSON.parse(JSON.stringify(mainConfig))
            updateUI()
          } else {
            categories = JSON.parse(JSON.stringify(defaultCategories))
            originalCategories = JSON.parse(JSON.stringify(defaultCategories))
            updateUI()
          }
        }).catch((e) => {
          console.error('[File Categories] Failed to load settings from main process:', e)
          categories = JSON.parse(JSON.stringify(defaultCategories))
          originalCategories = JSON.parse(JSON.stringify(defaultCategories))
          updateUI()
        })
      }
    } catch (e) {
      console.error('[File Categories] Failed to load settings:', e)
      categories = JSON.parse(JSON.stringify(defaultCategories))
      originalCategories = JSON.parse(JSON.stringify(defaultCategories))
      updateUI()
    }
  }

  function saveSettings () {
    log('Saving settings...')
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.send('file-categories-settings-updated', categories)
        log('Settings sent via IPC:', categories)
        return true
      }
    } catch (e) {
      console.error('[File Categories] Failed to save settings:', e)
    }
    return false
  }

  function normalizeExtensions (extString) {
    if (!extString) return []
    const parts = `${extString}`.split(/[,\s]+/)
    const extList = []
    parts.forEach((part) => {
      if (!part) return
      const cleaned = part.replace(/\./g, '').trim().toLowerCase()
      if (!cleaned) return
      if (!extList.includes(cleaned)) {
        extList.push(cleaned)
      }
    })
    return extList
  }

  function extensionsToString (extensions) {
    if (Array.isArray(extensions)) {
      return extensions.join(',')
    }
    return ''
  }

  function updateUI () {
    const categoryList = document.getElementById('categoryList')
    if (!categoryList) return

    categoryList.innerHTML = ''

    const keys = Object.keys(categories)
    if (keys.length === 0) {
      categoryList.innerHTML = `<div class="empty-tip">${t('file-categories-empty-tip') || '暂无分类规则'}</div>`
      return
    }

    keys.forEach((key) => {
      const category = categories[key] || {}
      const item = document.createElement('div')
      item.className = 'category-item'
      item.dataset.key = key

      const header = document.createElement('div')
      header.className = 'category-header'

      // 删除分类键名显示，只保留输入框和删除按钮
      const nameInput = document.createElement('input')
      nameInput.type = 'text'
      nameInput.className = 'name-input'
      nameInput.value = category.name || ''
      nameInput.placeholder = t('file-categories-folder-name') || '文件夹名称'
      nameInput.dataset.field = 'name'
      nameInput.dataset.key = key

      const extensionsInput = document.createElement('input')
      extensionsInput.type = 'text'
      extensionsInput.className = 'extensions-input'
      extensionsInput.value = extensionsToString(category.extensions)
      extensionsInput.placeholder = t('file-categories-extensions') || '扩展名（如：jpg,png,gif）'
      extensionsInput.dataset.field = 'extensions'
      extensionsInput.dataset.key = key

      const deleteBtn = document.createElement('button')
      deleteBtn.className = 'danger'
      deleteBtn.textContent = t('file-categories-remove') || '删除'
      deleteBtn.dataset.key = key
      deleteBtn.disabled = key === 'others'
      if (key === 'others') {
        deleteBtn.title = t('file-categories-cannot-remove-others') || '无法删除默认分类'
      }

      header.appendChild(nameInput)
      header.appendChild(extensionsInput)
      header.appendChild(deleteBtn)

      item.appendChild(header)
      categoryList.appendChild(item)
    })

    attachEventListeners()
  }

  function attachEventListeners () {
    const categoryList = document.getElementById('categoryList')
    if (!categoryList) return

    const inputs = categoryList.querySelectorAll('input')
    inputs.forEach((input) => {
      input.addEventListener('input', handleInputChange)
    })

    const deleteBtns = categoryList.querySelectorAll('button.danger')
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', handleDeleteClick)
    })
  }

  function handleInputChange (e) {
    const input = e.target
    const key = input.dataset.key
    const field = input.dataset.field

    if (!key || !categories[key]) return

    if (field === 'name') {
      categories[key].name = input.value.trim()
    } else if (field === 'extensions') {
      categories[key].extensions = normalizeExtensions(input.value)
    }

    log('Category updated:', key, categories[key])
  }

  function handleDeleteClick (e) {
    const key = e.target.dataset.key
    if (!key || key === 'others') return

    showConfirm(
      t('file-categories-remove-title') || '删除分类',
      t('file-categories-remove-confirm') || '确定要删除此分类吗？',
      () => {
        delete categories[key]
        updateUI()
        log('Category deleted:', key)
      }
    )
  }

  function showConfirm (title, message, onConfirm) {
    const dialog = document.getElementById('confirmDialog')
    const titleEl = document.getElementById('confirmTitle')
    const messageEl = document.getElementById('confirmMessage')

    titleEl.textContent = title
    messageEl.textContent = message
    confirmCallback = onConfirm

    dialog.classList.add('show')
  }

  function hideConfirm () {
    const dialog = document.getElementById('confirmDialog')
    dialog.classList.remove('show')
    confirmCallback = null
  }

  function addNewCategory () {
    const newKey = 'new_category_' + Date.now()
    categories[newKey] = {
      name: t('file-categories-new-folder-name') || '新分类',
      extensions: []
    }
    updateUI()
    log('New category added:', newKey)
  }

  function resetToDefault () {
    showConfirm(
      t('file-categories-reset-title') || '恢复默认',
      t('file-categories-reset-confirm') || '确定要恢复默认分类设置吗？当前设置将丢失。',
      () => {
        categories = JSON.parse(JSON.stringify(defaultCategories))
        updateUI()
        log('Settings reset to default')
      }
    )
  }

  function validateCategories () {
    for (const [, category] of Object.entries(categories)) {
      if (!category.name || category.name.trim() === '') {
        alert(t('file-categories-name-required') || '分类名称不能为空')
        return false
      }
    }
    return true
  }

  function hasChanges () {
    return JSON.stringify(categories) !== JSON.stringify(originalCategories)
  }

  function applyTranslations () {
    const titleText = document.getElementById('titleText')
    const dialogTitle = document.getElementById('dialogTitle')
    const dialogTip = document.getElementById('dialogTip')
    const addCategoryText = document.getElementById('addCategoryText')
    const resetBtn = document.getElementById('resetBtn')
    const cancelBtn = document.getElementById('cancelBtn')
    const saveBtn = document.getElementById('saveBtn')
    const confirmCancel = document.getElementById('confirmCancel')
    const confirmOk = document.getElementById('confirmOk')

    if (titleText) titleText.textContent = t('file-categories-settings-title') || '文件分类设置'
    if (dialogTitle) dialogTitle.textContent = t('file-categories') || '文件分类'
    if (dialogTip) dialogTip.textContent = t('file-categories-tips') || '自定义文件自动分类规则'
    if (addCategoryText) addCategoryText.textContent = '+ ' + (t('file-categories-add') || '添加分类')
    if (resetBtn) resetBtn.textContent = t('reset') || '恢复默认'
    if (cancelBtn) cancelBtn.textContent = t('cancel') || '取消'
    if (saveBtn) saveBtn.textContent = t('save') || '保存'
    if (confirmCancel) confirmCancel.textContent = t('cancel') || '取消'
    if (confirmOk) confirmOk.textContent = t('confirm') || '确定'

    // 更新输入框占位符
    const nameInputs = document.querySelectorAll('input[data-field="name"]')
    const extInputs = document.querySelectorAll('input[data-field="extensions"]')
    nameInputs.forEach(input => {
      input.placeholder = t('file-categories-folder-name') || '文件夹名称'
    })
    extInputs.forEach(input => {
      input.placeholder = t('file-categories-extensions') || '扩展名（如：jpg,png,gif）'
    })

    // 更新删除按钮文本
    const deleteBtns = document.querySelectorAll('button.danger')
    deleteBtns.forEach(btn => {
      btn.textContent = t('file-categories-remove') || '删除'
    })
  }

  async function init () {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron')
        const appLocale = await ipcRenderer.invoke('get-app-locale')
        locale = appLocale || 'zh-CN'
        log('Current locale:', locale)
        await loadTranslations(locale)
      }
    } catch (e) {
      console.error('[File Categories] Failed to get locale:', e)
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    log('DOM Content Loaded')
    await init()
    getCurrentTheme()
    loadSettings()
    applyTranslations()

    // 添加分类按钮
    const addCategoryBtn = document.getElementById('addCategoryBtn')
    if (addCategoryBtn) {
      addCategoryBtn.addEventListener('click', addNewCategory)
    }

    // 恢复默认按钮
    const resetBtn = document.getElementById('resetBtn')
    if (resetBtn) {
      resetBtn.addEventListener('click', resetToDefault)
    }

    // 保存按钮
    const saveBtn = document.getElementById('saveBtn')
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (!validateCategories()) return

        if (saveSettings()) {
          originalCategories = JSON.parse(JSON.stringify(categories))
          alert(t('file-categories-save-success') || '保存成功')
          try {
            if (window.require) {
              const { getCurrentWindow } = window.require('@electron/remote')
              const win = getCurrentWindow()
              if (win) win.close()
            }
          } catch (e) {
            window.close()
          }
        } else {
          alert(t('file-categories-save-failed') || '保存失败')
        }
      })
    }

    // 关闭按钮
    const closeBtn = document.getElementById('closeBtn')
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (hasChanges()) {
          showConfirm(
            t('file-categories-close-title') || '关闭确认',
            t('file-categories-close-confirm') || '有未保存的更改，确定要关闭吗？',
            () => {
              try {
                if (window.require) {
                  const { getCurrentWindow } = window.require('@electron/remote')
                  const win = getCurrentWindow()
                  if (win) win.close()
                }
              } catch (e) {
                window.close()
              }
            }
          )
        } else {
          try {
            if (window.require) {
              const { getCurrentWindow } = window.require('@electron/remote')
              const win = getCurrentWindow()
              if (win) win.close()
            }
          } catch (e) {
            window.close()
          }
        }
      })
    }

    // 最小化按钮
    const minimizeBtn = document.getElementById('minimizeBtn')
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        try {
          if (window.require) {
            const { getCurrentWindow } = window.require('@electron/remote')
            const win = getCurrentWindow()
            if (win) win.minimize()
          }
        } catch (e) {
          console.error('[File Categories] Failed to minimize window:', e)
        }
      })
    }

    // 确认对话框按钮
    const confirmCancel = document.getElementById('confirmCancel')
    const confirmOk = document.getElementById('confirmOk')
    if (confirmCancel) {
      confirmCancel.addEventListener('click', hideConfirm)
    }
    if (confirmOk) {
      confirmOk.addEventListener('click', () => {
        if (confirmCallback) {
          confirmCallback()
        }
        hideConfirm()
      })
    }

    // 监听主题和语言变化
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.on('command', (_, command, ...args) => {
          if (command === 'application:update-system-theme' || command === 'application:update-theme') {
            const data = args[0]
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
            if (data && data.locale) {
              locale = data.locale
              loadTranslations(locale).then(() => {
                applyTranslations()
              })
            }
          }
        })
      }
    } catch (e) {
      console.error('[File Categories] Failed to listen for theme changes:', e)
    }
  })
})()
