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
    { id: 'labelGlobalSpeed', key: 'totalSpeed' },
    { id: 'labelDownloadTasks', key: 'downloadTasks' },
    { id: 'emptyState', key: 'noTasks' }
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
})

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
          if (res) renderTasks(res)
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
const renderTasks = (data) => {
  const gs = document.getElementById('globalSpeed')
  gs.textContent = humanSpeed(Number(data.totalSpeed || 0))
  const list = document.getElementById('taskList')
  list.innerHTML = ''
  const tasks = data.tasks || []
  if (tasks.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = t('noTasks')
    list.appendChild(empty)
    return
  }
  tasks.slice(0, 8).forEach(t => {
    const wrap = document.createElement('div')
    wrap.className = 'task'
    const meta = document.createElement('div')
    meta.className = 'meta'
    const nameEl = document.createElement('div')
    const rightEl = document.createElement('div')
    const name = t.name || t.gid
    const speed = humanSpeed(t.speed || 0)
    const percentText = `${t.percent}%`
    nameEl.textContent = name
    rightEl.textContent = `${percentText}  ${speed}`
    meta.appendChild(nameEl)
    meta.appendChild(rightEl)
    const progress = document.createElement('div')
    progress.className = 'progress'
    const bar = document.createElement('div')
    bar.className = 'progress-bar'
    bar.style.width = `${Math.max(0, Math.min(100, t.percent || 0))}%`
    progress.appendChild(bar)
    wrap.appendChild(meta)
    wrap.appendChild(progress)
    list.appendChild(wrap)
  })
}
const poll = () => {
  chrome.runtime.sendMessage({ type: 'tasks' }, (res) => {
    if (res) renderTasks(res)
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
