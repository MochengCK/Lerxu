const defaults = { host: '127.0.0.1', port: 16800, secret: '' }

const getConfig = () => new Promise((r) => chrome.storage.local.get(defaults, (c) => r(c || defaults)))
const setConfig = (d) => new Promise((r) => chrome.storage.local.set(d, () => r(true)))

const normalizeTheme = (v) => {
  const s = v === undefined || v === null ? '' : `${v}`.toLowerCase()
  if (s === 'dark' || s === 'light') return s
  return null
}

const getStoredTheme = () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['uiTheme'], (res) => {
      resolve(normalizeTheme(res && res.uiTheme ? res.uiTheme : null))
    })
  })
}

const applyTheme = (theme) => {
  const t = normalizeTheme(theme) || 'light'
  const root = document.documentElement
  root.classList.toggle('theme-dark', t === 'dark')
}

const applyThemeFromStorage = async () => {
  const stored = await getStoredTheme()
  if (stored) {
    applyTheme(stored)
    return
  }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(prefersDark ? 'dark' : 'light')
}

// 初始化界面文本
const initI18n = async () => {
  // 等待语言初始化完成
  await initLocale()
  
  console.log('[Popup] Updating UI text with locale:', currentLocale)
  
  // 设置所有带有 i18n 属性的元素
  const elements = [
    { id: 'popupTitle', key: 'popupTitle' },
    { id: 'labelRpc', key: 'rpcAddress' },
    { id: 'labelConn', key: 'connectionStatus' },
    { id: 'labelClientVersion', key: 'clientVersion' },
    { id: 'labelGlobalSpeed', key: 'totalSpeed' }
  ]
  
  elements.forEach(({ id, key }) => {
    const element = document.getElementById(id)
    if (element) {
      const text = t(key)
      element.textContent = text
      console.log(`[Popup] Updated ${id}:`, text)
    } else {
      console.warn(`[Popup] Element not found: ${id}`)
    }
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] Starting initialization...')

  await applyThemeFromStorage()
  chrome.runtime.sendMessage({ type: 'getExtConfig' }, () => {})
  
  // 首先同步客户端语言
  await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'syncLocale' }, (response) => {
      console.log('[Popup] Sync locale response:', response)
      resolve()
    })
  })
  
  // 初始化多语言
  await initI18n()
  console.log('[Popup] I18n initialized')
  
  const cfg = await getConfig()
  document.getElementById('rpc').textContent = `RPC: http://${cfg.host}:${cfg.port}`
  startPolling()
  startVersionPolling()
  chrome.runtime.sendMessage({ type: 'probe' }, async (ok) => {
    const c = await getConfig()
    document.getElementById('rpc').textContent = `RPC: http://${c.host}:${c.port}`
  })
  startConnectionPolling()
  
  // 监听语言变化消息
  setupLocaleChangeListener()
  
  // 设置新功能的事件监听器
  setupQuickActionListeners()
  
  // 检查当前域名是否在排除列表中
  checkCurrentSiteExcluded()
})

// 检查当前域名是否在排除列表中
const checkCurrentSiteExcluded = async () => {
  try {
    const [tab] = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    })
    
    if (tab && tab.url) {
      const url = new URL(tab.url)
      const domain = url.hostname.toLowerCase().trim()
      
      // 存储当前域名供悬停事件使用
      window.currentDomain = domain
      
      // 从客户端获取排除域名列表
      chrome.runtime.sendMessage({ type: 'getExcludeDomains' }, (response) => {
        const excludeBtn = document.getElementById('excludeCurrentSiteBtn')
        const labelSpan = document.getElementById('labelExcludeCurrentSite')
        
        if (response && Array.isArray(response.excludeDomains)) {
          const isExcluded = response.excludeDomains.some(d => d.toLowerCase().trim() === domain)
          
          // 存储排除状态
          window.isCurrentSiteExcluded = isExcluded
          
          const labelSpan = document.getElementById('labelExcludeCurrentSite')
          
          if (isExcluded) {
            if (labelSpan) {
              labelSpan.textContent = t('labelAdded') || '已添加'
            }
            excludeBtn.classList.add('added')
            excludeBtn.style.backgroundColor = '#67C23A'
          } else {
            if (labelSpan) {
              labelSpan.textContent = t('labelExcludeCurrentSite') || '不接管此网站'
            }
            excludeBtn.classList.remove('added')
            excludeBtn.style.backgroundColor = ''
          }
        }
      })
    }
  } catch (e) {
    console.error('[Popup] Failed to check excluded status:', e)
  }
}

// 设置快速操作的事件监听器
const setupQuickActionListeners = () => {
  const excludeBtn = document.getElementById('excludeCurrentSiteBtn')
  const addSkipFileTypeBtn = document.getElementById('addSkipFileTypeBtn')
  const skipFileTypeInput = document.getElementById('skipFileTypeInput')
  
  let excludeBtnTimeout = null
  let excludeBtnIsHovered = false
  let excludeBtnShowingDomain = false
  
  const showExcludeDomain = () => {
    if (!window.currentDomain || window.isCurrentSiteExcluded) return
    const labelSpan = document.getElementById('labelExcludeCurrentSite')
    if (labelSpan) {
      labelSpan.classList.add('slide-out')
      excludeBtnTimeout = setTimeout(() => {
        labelSpan.textContent = window.currentDomain
        labelSpan.classList.remove('slide-out')
        labelSpan.classList.add('prep-left')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            labelSpan.classList.remove('prep-left')
            excludeBtnShowingDomain = true
            if (!excludeBtnIsHovered) {
              restoreExcludeLabel()
            }
          })
        })
      }, 150)
    }
  }
  
  const restoreExcludeLabel = () => {
    const labelSpan = document.getElementById('labelExcludeCurrentSite')
    if (!labelSpan) return
    if (window.isCurrentSiteExcluded) {
      labelSpan.classList.add('slide-out')
      excludeBtnTimeout = setTimeout(() => {
        labelSpan.textContent = t('labelAdded') || '已添加'
        labelSpan.classList.remove('slide-out')
        labelSpan.classList.add('prep-right')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            labelSpan.classList.remove('prep-right')
            excludeBtnShowingDomain = false
          })
        })
      }, 150)
    } else {
      labelSpan.classList.add('slide-out-left')
      excludeBtnTimeout = setTimeout(() => {
        labelSpan.textContent = t('labelExcludeCurrentSite') || '不接管此网站'
        labelSpan.classList.remove('slide-out-left')
        labelSpan.classList.add('prep-right')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            labelSpan.classList.remove('prep-right')
            excludeBtnShowingDomain = false
          })
        })
      }, 150)
    }
  }
  
  if (excludeBtn) {
    excludeBtn.addEventListener('mouseenter', () => {
      excludeBtnIsHovered = true
      if (!excludeBtnShowingDomain) {
        showExcludeDomain()
      }
    })
    
    excludeBtn.addEventListener('mouseleave', () => {
      excludeBtnIsHovered = false
      if (excludeBtnTimeout) {
        clearTimeout(excludeBtnTimeout)
        excludeBtnTimeout = null
      }
      const labelSpan = document.getElementById('labelExcludeCurrentSite')
      if (labelSpan) {
        labelSpan.classList.remove('slide-out', 'slide-out-left', 'prep-left', 'prep-right')
      }
      if (excludeBtnShowingDomain) {
        restoreExcludeLabel()
      }
    })
    
    excludeBtn.addEventListener('click', async () => {
      try {
        const [tab] = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        })
        
        if (tab && tab.url) {
          const url = new URL(tab.url)
          const domain = url.hostname
          
          chrome.runtime.sendMessage({ 
            type: 'addExcludeDomain', 
            domain 
          }, (response) => {
            const labelSpan = document.getElementById('labelExcludeCurrentSite')
            if (response && response.ok) {
              console.log('[Popup] Domain added to exclude list:', domain)
              if (labelSpan) {
                labelSpan.textContent = t('labelAdded') || '已添加'
              }
              excludeBtn.classList.add('added')
              excludeBtn.style.backgroundColor = '#67C23A'
              setTimeout(() => {
                checkCurrentSiteExcluded()
              }, 500)
            } else if (response && response.removed) {
              console.log('[Popup] Domain removed from exclude list:', domain)
              if (labelSpan) {
                labelSpan.textContent = t('labelRemoved') || '已移除'
              }
              excludeBtn.classList.remove('added')
              excludeBtn.style.backgroundColor = '#E6A23C'
              setTimeout(() => {
                checkCurrentSiteExcluded()
              }, 500)
            } else {
              console.error('[Popup] Failed to add domain to exclude list')
              if (labelSpan) {
                labelSpan.textContent = t('labelFailed') || '添加失败'
              }
              excludeBtn.style.backgroundColor = '#F56C6C'
              setTimeout(() => {
                checkCurrentSiteExcluded()
              }, 500)
            }
          })
        }
      } catch (e) {
        console.error('[Popup] Failed to add exclude domain:', e)
        const labelSpan = document.getElementById('labelExcludeCurrentSite')
        if (labelSpan) {
          labelSpan.textContent = t('labelFailed') || '添加失败'
        }
        excludeBtn.style.backgroundColor = '#F56C6C'
        setTimeout(() => {
          checkCurrentSiteExcluded()
        }, 500)
      }
    })
  }
  
  if (addSkipFileTypeBtn && skipFileTypeInput) {
    const updateButtonState = () => {
      const hasContent = skipFileTypeInput.value.trim() !== ''
      addSkipFileTypeBtn.disabled = !hasContent
    }
    
    const addSkipFileType = async () => {
      const input = skipFileTypeInput.value.trim()
      if (!input) return
      
      // 分割扩展名（支持多种分隔符：逗号、分号、空格，包括中文标点）
      const extensions = input
        .split(/[,，;；\s]+/)
        .map(ext => ext.trim().toLowerCase().replace(/^\./, ''))
        .filter(ext => ext.length > 0)
      
      if (extensions.length === 0) return
      
      console.log('[Popup] Sending addSkipFileTypes:', extensions)
      
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ 
            type: 'addSkipFileTypes', 
            fileTypes: extensions 
          }, (resp) => {
            // 检查是否有运行时错误
            if (chrome.runtime.lastError) {
              console.error('[Popup] Runtime error:', chrome.runtime.lastError)
              resolve({ ok: false, error: chrome.runtime.lastError.message })
            } else {
              resolve(resp)
            }
          })
        })
        
        console.log('[Popup] Response:', response)
        
        if (response && response.ok) {
          console.log('[Popup] File types added to skip list:', extensions)
          skipFileTypeInput.value = ''
          updateButtonState()
          addSkipFileTypeBtn.textContent = t('labelSuccess') || '成功'
          addSkipFileTypeBtn.style.color = '#67C23A'
          setTimeout(() => {
            addSkipFileTypeBtn.textContent = t('labelAdd') || '添加'
            addSkipFileTypeBtn.style.color = ''
          }, 2000)
        } else {
          console.error('[Popup] Failed to add file types to skip list, response:', response)
          addSkipFileTypeBtn.textContent = t('labelFailed') || '失败'
          addSkipFileTypeBtn.style.color = '#F56C6C'
          setTimeout(() => {
            addSkipFileTypeBtn.textContent = t('labelAdd') || '添加'
            addSkipFileTypeBtn.style.color = ''
          }, 2000)
        }
      } catch (e) {
        console.error('[Popup] Exception:', e)
        addSkipFileTypeBtn.textContent = t('labelFailed') || '失败'
        addSkipFileTypeBtn.style.color = '#F56C6C'
        setTimeout(() => {
          addSkipFileTypeBtn.textContent = t('labelAdd') || '添加'
          addSkipFileTypeBtn.style.color = ''
        }, 2000)
      }
    }
    
    addSkipFileTypeBtn.addEventListener('click', addSkipFileType)
    
    skipFileTypeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addSkipFileType()
      }
    })
    
    skipFileTypeInput.addEventListener('input', updateButtonState)
    
    let inputHoverTimeout = null
    let inputIsHovered = false
    let inputShowingExample = false
    
    const showInputExample = () => {
      if (skipFileTypeInput.value) return
      skipFileTypeInput.classList.add('slide-out')
      inputHoverTimeout = setTimeout(() => {
        skipFileTypeInput.placeholder = t('placeholderExample') || '示例: exe, zip, rar'
        skipFileTypeInput.classList.remove('slide-out')
        skipFileTypeInput.classList.add('prep-left')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            skipFileTypeInput.classList.remove('prep-left')
            inputShowingExample = true
            if (!inputIsHovered) {
              restoreInputPlaceholder()
            }
          })
        })
      }, 150)
    }
    
    const restoreInputPlaceholder = () => {
      if (skipFileTypeInput.value) return
      skipFileTypeInput.classList.add('slide-out-left')
      inputHoverTimeout = setTimeout(() => {
        skipFileTypeInput.placeholder = t('placeholderInputExt') || '输入文件扩展名'
        skipFileTypeInput.classList.remove('slide-out-left')
        skipFileTypeInput.classList.add('prep-right')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            skipFileTypeInput.classList.remove('prep-right')
            inputShowingExample = false
          })
        })
      }, 150)
    }
    
    skipFileTypeInput.addEventListener('mouseenter', () => {
      inputIsHovered = true
      if (!inputShowingExample && !skipFileTypeInput.value) {
        showInputExample()
      }
    })
    
    skipFileTypeInput.addEventListener('mouseleave', () => {
      inputIsHovered = false
      if (inputHoverTimeout) {
        clearTimeout(inputHoverTimeout)
        inputHoverTimeout = null
      }
      skipFileTypeInput.classList.remove('slide-out', 'slide-out-left', 'prep-left', 'prep-right')
      if (inputShowingExample) {
        restoreInputPlaceholder()
      }
    })
    
    updateButtonState()
  }
}

// 设置语言变化监听器
const setupLocaleChangeListener = () => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'themeChanged' && msg.theme) {
      applyTheme(msg.theme)
      sendResponse({ ok: true })
      return true
    }

    if (msg && msg.type === 'localeChanged') {
      console.log('[Popup] Locale changed detected, reloading UI...', msg.locale)
      // 重新初始化多语言
      initI18n().then(() => {
        console.log('[Popup] UI reloaded with new locale:', msg.locale)
        // 重新渲染当前数据
        chrome.runtime.sendMessage({ type: 'connection' }, renderConnection)
        chrome.runtime.sendMessage({ type: 'tasks' }, (res) => {
          if (res) renderTasks(res)
        })
      })
      sendResponse({ ok: true })
      return true
    }
    
    // 监听连接状态变化
    if (msg && msg.type === 'connectionChanged') {
      console.log('[Popup] Connection state changed:', msg.connected)
      // 立即更新连接状态显示
      renderConnection({ connected: msg.connected })
      // 如果连接恢复,重新获取数据
      if (msg.connected) {
        chrome.runtime.sendMessage({ type: 'version' }, renderVersion)
        chrome.runtime.sendMessage({ type: 'tasks' }, (res) => {
          if (res) renderGlobalSpeed(res)
        })
      }
      sendResponse({ ok: true })
      return true
    }
  })
  console.log('[Popup] Locale change listener set up')
}

try {
  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.uiTheme) {
        const next = normalizeTheme(changes.uiTheme.newValue)
        if (next) applyTheme(next)
      }
    })
  }
} catch (e) {}

let timer = null
let versionTimer = null
let connectionTimer = null
const humanSize = (n) => {
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${u[i]}`
}
const humanSpeed = (n) => `${humanSize(n)}/s`
const renderGlobalSpeed = (data) => {
  const gs = document.getElementById('globalSpeed')
  if (gs) {
    gs.textContent = humanSpeed(Number(data.totalSpeed || 0))
  }
}
const poll = () => {
  chrome.runtime.sendMessage({ type: 'tasks' }, (res) => {
    if (res) renderGlobalSpeed(res)
  })
}
const startPolling = () => {
  if (timer) clearInterval(timer)
  poll()
  timer = setInterval(poll, 1000)
}

const renderVersion = (res) => {
  const ver = document.getElementById('clientVersion')
  if (!ver) return
  if (res && res.connected && res.version) {
    ver.textContent = res.version
  } else {
    ver.textContent = '-'
  }
}
const pollVersion = () => {
  chrome.runtime.sendMessage({ type: 'version' }, (res) => {
    renderVersion(res || null)
  })
}
const startVersionPolling = () => {
  if (versionTimer) clearInterval(versionTimer)
  pollVersion()
  versionTimer = setInterval(pollVersion, 3000)
}

const renderConnection = (res) => {
  const conn = document.getElementById('conn')
  if (!conn) return
  if (res && res.connected) {
    conn.textContent = t('connected')
  } else {
    conn.textContent = t('disconnected')
  }
}
const pollConnection = () => {
  chrome.runtime.sendMessage({ type: 'connection' }, (res) => {
    renderConnection(res || null)
  })
}
const startConnectionPolling = () => {
  if (connectionTimer) clearInterval(connectionTimer)
  pollConnection()
  // 每1秒检查一次连接状态,实现快速响应
  connectionTimer = setInterval(pollConnection, 1000)
}
