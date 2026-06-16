const defaults = {
  host: '127.0.0.1',
  port: 16800,
  secret: ''
}

const extConfigDefaults = {
  interceptAllDownloads: false,
  silentDownload: false,
  skipFileExtensions: [],
  minFileSize: 0,
  shiftToggleEnabled: false,
  videoSnifferEnabled: true,
  videoSnifferFormats: ['m4s', 'mp4', 'flv', 'm3u8', 'ts'],
  videoSnifferAutoCombine: true
}

let extConfig = { ...extConfigDefaults }
let extConfigTimer = null
let extConfigSyncedOnce = false
const AUTO_HIJACK_OVERRIDE_KEY = 'autoHijackTemporarilyDisabled'
let sessionToken = null
let tokenVersion = null
let lastKnownTheme = null

try {
  chrome.storage.local.get(['uiTheme'], (res) => {
    const t = res && res.uiTheme ? `${res.uiTheme}`.toLowerCase() : ''
    if (t === 'dark' || t === 'light') {
      lastKnownTheme = t
    }
  })
} catch (e) {}

const fetchHandshake = async () => {
  try {
    const result = await tryChannel('/linkcore/handshake', { method: 'GET' }, 2000)
    if (!result || !result.resp || !result.resp.ok) {
      return null
    }
    const data = await result.resp.json().catch(() => null)
    if (data && data.challenge) {
      console.log('[Background] Challenge acquired:', data.challenge)
      return data
    }
  } catch (e) {
    console.log('[Background] Failed to fetch handshake:', e)
  }
  return null
}

const authorizeWithChallenge = async (challenge) => {
  try {
    const extensionId = chrome.runtime.id
    const timestamp = Date.now()

    // 生成签名
    const signatureString = `${challenge}${extensionId}${timestamp}`

    // 使用简单的哈希作为签名
    const encoder = new TextEncoder()
    const encodedData = encoder.encode(signatureString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedData)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const signature = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('')

    console.log('[Background] Authorizing with challenge:', challenge.substring(0, 8) + '...')

    // 直接使用 fetchWithTimeout，避免 tryChannel 的循环
    const hosts = ['127.0.0.1', 'localhost']
    for (const h of hosts) {
      try {
        const url = `http://${h}:${CHANNEL_PORT}/linkcore/authorize`
        const resp = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            challenge,
            signature,
            extensionId,
            timestamp
          })
        }, 2000)

        if (resp && resp.ok) {
          const data = await resp.json().catch(() => null)
          if (data && data.token) {
            sessionToken = data.token
            tokenVersion = data.tokenVersion
            console.log('[Background] Session token acquired:', sessionToken.substring(0, 20) + '...', 'version:', tokenVersion)
            return data
          }
        } else if (resp && resp.status === 401) {
          console.log('[Background] Authorization failed: 401 Unauthorized')
        } else if (resp) {
          console.log('[Background] Authorization failed: status', resp.status)
        }
      } catch (e) {
        console.log('[Background] Authorization error:', e.message)
      }
    }

    console.log('[Background] Authorization failed for all hosts')
    return null
  } catch (e) {
    console.log('[Background] Failed to authorize:', e)
    return null
  }
}

const getConfig = () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, (cfg) => resolve(cfg || defaults))
  })
}

const setConfig = (data) => {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => resolve(true))
  })
}

const tryRpc = async (host, port) => {
  try {
    const rpc = `http://${host}:${port}/jsonrpc`
    const body = { jsonrpc: '2.0', id: Date.now(), method: 'aria2.getVersion', params: [''] }
    const res = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) return { host, port }
  } catch (e) {}
  return null
}

const probeRpc = async () => {
  const candidates = [
    ['127.0.0.1', 16800],
    ['localhost', 16800],
    ['127.0.0.1', 6800],
    ['localhost', 6800]
  ]
  for (const [h, p] of candidates) {
    const ok = await tryRpc(h, p)
    if (ok) {
      await setConfig({ ...(await getConfig()), host: ok.host, port: ok.port })
      return ok
    }
  }
  return { host: defaults.host, port: defaults.port }
}

let lastConnectedAt = 0
let isHealthy = false // 添加健康状态标记

const fetchWithTimeout = (url, options = {}, timeout = 2000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout)
    fetch(url, options).then((res) => {
      clearTimeout(timer)
      resolve(res)
    }).catch((err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

const CHANNEL_PORT = 16900

// 语言代码映射:客户端语言 -> 浏览器语言
const localeMap = {
  'zh-CN': 'zh_CN',
  'zh-TW': 'zh_TW',
  'en-US': 'en',
  'ja': 'ja',
  'ko': 'ko',
  'es': 'es',
  'fr': 'fr',
  'de': 'de',
  'ru': 'ru'
}

// 将浏览器 UI 语言映射为扩展内部语言代码
const getBrowserFallbackLocale = () => {
  const lang = chrome.i18n.getUILanguage()
  if (lang.startsWith('zh-CN') || lang.startsWith('zh_CN')) return 'zh_CN'
  if (lang.startsWith('zh-TW') || lang.startsWith('zh_TW')) return 'zh_TW'
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('ko')) return 'ko'
  if (lang.startsWith('es')) return 'es'
  if (lang.startsWith('fr')) return 'fr'
  if (lang.startsWith('de')) return 'de'
  if (lang.startsWith('ru')) return 'ru'
  return 'en'
}

// 连接状态管理 - 简化版,实时检测
let lastConnectionCheck = {
  connected: false,
  lastCheckTime: 0
}

// 通知 popup 连接状态变化
const notifyConnectionChange = (connected) => {
  console.log('[Background] Connection state changed:', connected ? 'connected' : 'disconnected')
  chrome.runtime.sendMessage({
    type: 'connectionChanged',
    connected: connected
  }).catch(() => {
    // 忽略错误(可能没有打开的popup)
  })
}

const tryChannel = async (path, options = {}, timeout = 1000) => {
  const hosts = ['127.0.0.1', 'localhost']

  // 对于需要认证的请求，先确保 token 有效
  if (!path.startsWith('/linkcore/handshake') && !path.startsWith('/linkcore/authorize')) {
    const tokenValid = await ensureSessionToken()
    if (!tokenValid) {
      console.log('[Background] Failed to ensure session token')
      return null
    }
  }

  for (const h of hosts) {
    try {
      const url = `http://${h}:${CHANNEL_PORT}${path}`
      const headers = { ...options.headers }

      // 只在非认证相关的请求中添加 Authorization header
      if (sessionToken && !path.startsWith('/linkcore/handshake') && !path.startsWith('/linkcore/authorize')) {
        headers['Authorization'] = `Bearer ${sessionToken}`
        if (tokenVersion !== null) {
          headers['X-Token-Version'] = tokenVersion.toString()
        }
      }

      const resp = await fetchWithTimeout(url, { ...options, headers }, timeout)

      if (resp && resp.status === 401) {
        console.log('[Background] Token invalid, refreshing...')
        const handshakeResult = await fetchHandshake()
        if (handshakeResult && handshakeResult.challenge) {
          console.log('[Background] Got challenge, authorizing...')
          const authResult = await authorizeWithChallenge(handshakeResult.challenge)
          if (authResult && authResult.token) {
            console.log('[Background] Authorization successful, retrying request...')
            const retryHeaders = { ...options.headers }
            if (sessionToken && !path.startsWith('/linkcore/handshake') && !path.startsWith('/linkcore/authorize')) {
              retryHeaders['Authorization'] = `Bearer ${sessionToken}`
              if (tokenVersion !== null) {
                retryHeaders['X-Token-Version'] = tokenVersion.toString()
              }
            }
            const retryResp = await fetchWithTimeout(url, { ...options, headers: retryHeaders }, timeout)
            console.log('[Background] Retry response status:', retryResp ? retryResp.status : 'no response')
            if (retryResp && retryResp.ok) {
              if (!lastConnectionCheck.connected) {
                notifyConnectionChange(true)
              }
              lastConnectionCheck.connected = true
              lastConnectionCheck.lastCheckTime = Date.now()
              return { host: h, resp: retryResp }
            }
          } else {
            console.log('[Background] No session token after authorization')
          }
        } else {
          console.log('[Background] Failed to get challenge')
        }
      }

      if (resp && resp.ok) {
        // 检测连接状态变化
        if (!lastConnectionCheck.connected) {
          notifyConnectionChange(true)
        }
        lastConnectionCheck.connected = true
        lastConnectionCheck.lastCheckTime = Date.now()
        return { host: h, resp }
      }
    } catch (e) {
      // 静默处理连接失败,不打印日志
    }
  }

  // 所有主机都失败 - 检测连接状态变化
  if (lastConnectionCheck.connected) {
    notifyConnectionChange(false)
  }
  lastConnectionCheck.connected = false
  lastConnectionCheck.lastCheckTime = Date.now()
  return null
}

// 确保 session token 有效
const ensureSessionToken = async () => {
  if (sessionToken) {
    console.log('[Background] Session token exists, skipping refresh')
    return true
  }

  console.log('[Background] No session token, acquiring...')
  const handshakeResult = await fetchHandshake()
  if (handshakeResult && handshakeResult.challenge) {
    const authResult = await authorizeWithChallenge(handshakeResult.challenge)
    if (authResult && authResult.token) {
      console.log('[Background] Session token acquired successfully')
      return true
    } else {
      console.log('[Background] Failed to authorize')
      return false
    }
  } else {
    console.log('[Background] Failed to get challenge')
    return false
  }
}

const syncExtConfigFromClient = async () => {
  try {
    const result = await tryChannel('/linkcore/ext-config', { method: 'GET' }, 1000)
    if (!result || !result.resp || !result.resp.ok) {
      return
    }
    const data = await result.resp.json().catch(() => null)
    if (!data) {
      return
    }
    const interceptAllDownloads = !!data.interceptAllDownloads
    const silentDownload = !!data.silentDownload
    const shiftToggleEnabled = !!data.shiftToggleEnabled
    const minFileSize = Number(data.minFileSize) || 0
    const rawList = Array.isArray(data.skipFileExtensions) ? data.skipFileExtensions : []
    const skipFileExtensions = rawList.map(x => `${x}`.trim().toLowerCase()).filter(Boolean)
    const rawDomainList = Array.isArray(data.excludeDomains) ? data.excludeDomains : []
    const excludeDomains = rawDomainList.map(x => `${x}`.trim()).filter(Boolean)
    
    // 视频嗅探器配置
    const videoSnifferEnabled = data.videoSnifferEnabled !== undefined ? !!data.videoSnifferEnabled : true
    const videoSnifferFormats = Array.isArray(data.videoSnifferFormats) ? data.videoSnifferFormats : ['m4s', 'mp4', 'flv', 'webm', 'm3u8', 'ts']
    const videoSnifferAutoCombine = data.videoSnifferAutoCombine !== undefined ? !!data.videoSnifferAutoCombine : true

    const normalizeTheme = (v) => {
      const s = v === undefined || v === null ? '' : `${v}`.toLowerCase()
      if (s === 'dark' || s === 'light') return s
      return null
    }

    const nextTheme = normalizeTheme(data.effectiveTheme) || normalizeTheme(data.theme)
    const themeChanged = nextTheme && nextTheme !== lastKnownTheme
    if (nextTheme) {
      lastKnownTheme = nextTheme
    }
    
    const nextConfig = {
      interceptAllDownloads,
      silentDownload,
      skipFileExtensions,
      excludeDomains,
      minFileSize,
      shiftToggleEnabled,
      videoSnifferEnabled,
      videoSnifferFormats,
      videoSnifferAutoCombine
    }
    extConfig = nextConfig
    
    // 保存到 chrome.storage 以便 content script 可以读取
    chrome.storage.local.set({
      videoSnifferEnabled,
      videoSnifferFormats,
      videoSnifferAutoCombine,
      ...(lastKnownTheme ? { uiTheme: lastKnownTheme } : {})
    }, () => {
      console.log('[Background] Video sniffer config saved to storage:', { videoSnifferEnabled, videoSnifferFormats, videoSnifferAutoCombine })
    })

    if (themeChanged) {
      chrome.runtime.sendMessage({ type: 'themeChanged', theme: lastKnownTheme }).catch(() => {})
    }
  } catch (e) {
  }
}

const startExtConfigPolling = () => {
  if (extConfigTimer) {
    clearInterval(extConfigTimer)
    extConfigTimer = null
  }
  syncExtConfigFromClient()
  extConfigTimer = setInterval(syncExtConfigFromClient, 3000)
}

const sanitizeDownloadFilename = (input) => {
  if (!input) return ''
  const raw = `${input}`.trim()
  if (!raw) return ''
  const base = raw.split(/[\\/]/).pop() || ''
  if (!base) return ''
  return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 180)
}

const downloadViaBrowser = async (url, suggestedFilename) => {
  try {
    const sanitizedFilename = sanitizeDownloadFilename(suggestedFilename)
    const options = {
      url,
      conflictAction: 'uniquify',
      saveAs: !extConfig.silentDownload
    }
    if (sanitizedFilename) {
      options.filename = sanitizedFilename
    }
    return await new Promise((resolve) => {
      chrome.downloads.download(options, (downloadId) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || 'download failed' })
          return
        }
        resolve({ ok: typeof downloadId === 'number' })
      })
    })
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'download failed' }
  }
}

const isClientAvailable = async () => {
  const now = Date.now()
  if (now - lastConnectionCheck.lastCheckTime < 1000) {
    return !!lastConnectionCheck.connected
  }
  try {
    const result = await tryChannel('/linkcore/health', { method: 'GET' }, 800)
    return !!(result && result.resp && result.resp.ok)
  } catch (e) {
    return false
  }
}

const sanitizeHeaderLine = (line) => {
  try {
    const raw = `${line || ''}`.replace(/[\r\n]+/g, ' ').trim()
    if (!raw) return ''
    const idx = raw.indexOf(':')
    if (idx <= 0) return ''
    const k = raw.slice(0, idx).trim()
    const v = raw.slice(idx + 1).trim()
    if (!k || !v) return ''
    return `${k}: ${v}`
  } catch (e) {
    return ''
  }
}

const mergeHeaderLines = (baseLines, extraLines) => {
  try {
    const base = (Array.isArray(baseLines) ? baseLines : []).map(sanitizeHeaderLine).filter(Boolean)
    const extra = (Array.isArray(extraLines) ? extraLines : []).map(sanitizeHeaderLine).filter(Boolean)
    const map = new Map()
    const order = []

    const put = (line, allowOverride) => {
      const idx = line.indexOf(':')
      if (idx <= 0) return
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      if (!key || !value) return
      const lower = key.toLowerCase()
      if (!map.has(lower)) {
        order.push(lower)
        map.set(lower, { key, value })
        return
      }
      if (allowOverride) {
        map.set(lower, { key, value })
      }
    }

    base.forEach(line => put(line, false))
    extra.forEach(line => {
      const idx = line.indexOf(':')
      const k = idx > 0 ? line.slice(0, idx).trim().toLowerCase() : ''
      if (k === 'cookie') {
        put(line, false)
        return
      }
      put(line, true)
    })

    return order.map(lower => {
      const kv = map.get(lower)
      if (!kv) return ''
      return `${kv.key}: ${kv.value}`
    }).filter(Boolean)
  } catch (e) {
    return (Array.isArray(baseLines) ? baseLines : []).map(sanitizeHeaderLine).filter(Boolean)
  }
}

const addUri = async (url, referer, suggestedFilename, extraHeaders) => {
  try {
    const baseHeaders = await getHeadersForUrl(url, referer)
    const headers = mergeHeaderLines(baseHeaders, extraHeaders)
    const payload = { url, referer, headers }
    // 如果有建议的文件名，添加到请求中
    if (suggestedFilename) {
      payload.suggestedFilename = suggestedFilename
    }
    const ok = await tryChannel('/linkcore/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 3000)
    if (!ok) return false
    const data = await ok.resp.json().catch(() => ({}))
    return !!(data && data.ok)
  } catch (e) {
    return false
  }
}
const getHeadersForUrl = async (url, referer) => {
  const hs = ['X-LinkCore-Source: BrowserExtension']
  try {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : ''
    if (ua) hs.push(`User-Agent: ${ua}`)
  } catch (_) {}
  if (referer) {
    hs.push(`Referer: ${referer}`)
  }
  try {
    const list = await new Promise((resolve) => {
      chrome.cookies.getAll({ url }, (cookies) => resolve(cookies || []))
    })
    if (Array.isArray(list) && list.length > 0) {
      const cookieStr = list.map(c => `${c.name}=${c.value}`).join('; ')
      if (cookieStr) hs.push(`Cookie: ${cookieStr}`)
    }
  } catch (_) {}
  return hs
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: 'linkcore-download',
    title: chrome.i18n.getMessage('contextMenuDownload'),
    contexts: ['link', 'page', 'selection', 'image', 'video', 'audio']
  })
  try {
    chrome.storage.local.set({ [AUTO_HIJACK_OVERRIDE_KEY]: false }, () => {})
  } catch (e) {}
  // 预探测一次,提升首用体验
  probeRpc()
  // 获取 challenge 并授权
  const handshakeResult = await fetchHandshake()
  if (handshakeResult && handshakeResult.challenge) {
    await authorizeWithChallenge(handshakeResult.challenge)
  }
  // 同步客户端语言
  syncLocaleFromClient()
  // 启动语言监听
  startLocalePolling()
  // 同步客户端扩展配置
  startExtConfigPolling()
})

// 启动时也要启动语言监听
chrome.runtime.onStartup.addListener(async () => {
  try {
    chrome.storage.local.set({ [AUTO_HIJACK_OVERRIDE_KEY]: false }, () => {})
  } catch (e) {}
  // 获取 challenge 并授权
  const handshakeResult = await fetchHandshake()
  if (handshakeResult && handshakeResult.challenge) {
    await authorizeWithChallenge(handshakeResult.challenge)
  }
  syncLocaleFromClient()
  startLocalePolling()
  startExtConfigPolling()
})

const getAutoHijackOverride = () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(AUTO_HIJACK_OVERRIDE_KEY, (res) => {
      resolve(!!(res && res[AUTO_HIJACK_OVERRIDE_KEY]))
    })
  })
}

const toggleAutoHijackOverride = async () => {
  const current = await getAutoHijackOverride()
  const next = !current
  await new Promise((resolve) => {
    chrome.storage.local.set({ [AUTO_HIJACK_OVERRIDE_KEY]: next }, () => resolve(true))
  })
  return next
}

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-bypass-downloads') {
      toggleAutoHijackOverride()
    }
  })
}

// 确保在每次后台脚本加载时也会同步扩展配置
startExtConfigPolling()

// 当前已知的语言,用于检测变化
let lastKnownLocale = null

// 从客户端同步语言设置
const syncLocaleFromClient = async (notifyPopup = false) => {
  try {
    console.log('[Background] Syncing locale from client...')
    const result = await tryChannel('/linkcore/locale', { method: 'GET' }, 2000)
    if (result && result.resp && result.resp.ok) {
      const data = await result.resp.json()
      console.log('[Background] Received locale data:', data)
      if (data && data.locale) {
        const browserLocale = data.locale === 'auto'
          ? getBrowserFallbackLocale()
          : (localeMap[data.locale] || localeMap['en-US'])
        
        // 检测语言是否变化
        const localeChanged = lastKnownLocale && lastKnownLocale !== data.locale
        
        if (localeChanged) {
          console.log(`[Background] Locale changed: ${lastKnownLocale} -> ${data.locale}`)
        }
        
        lastKnownLocale = data.locale
        
        // 将语言信息存储到 storage,供 popup使用
        await setConfig({ clientLocale: data.locale, browserLocale })
        console.log(`[Background] Locale synced: ${data.locale} -> ${browserLocale}`)
        
        // 更新右键菜单文本
        updateContextMenu(browserLocale)
        
        // 如果语言变化了,通知所有打开的 popup
        if (localeChanged || notifyPopup) {
          notifyLocaleChange(browserLocale)
        }
        
        return { success: true, locale: data.locale, browserLocale }
      } else {
        console.log('[Background] Invalid locale data:', data)
      }
    } else {
      console.log('[Background] Failed to connect to client or invalid response')
    }
  } catch (e) {
    console.log('[Background] Failed to sync locale from client:', e)
  }
  return { success: false }
}

// 通知所有打开的 popup 语言已变化
const notifyLocaleChange = (browserLocale) => {
  console.log('[Background] Notifying popups about locale change:', browserLocale)
  // 向所有扩展页面广播语言变化消息
  chrome.runtime.sendMessage({
    type: 'localeChanged',
    locale: browserLocale
  }).catch(() => {
    // 忽略错误(可能没有打开的popup)
  })
  
  // 通知所有标签页的 content scripts
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'localeChanged',
        locale: browserLocale
      }).catch(() => {
        // 忽略错误(标签页可能没有 content script)
      })
    })
  })
}

// 定期轮询客户端语言
let localePollingTimer = null
const startLocalePolling = () => {
  syncLocaleFromClient(false)
  
  // 每30秒检查一次语言变化
  localePollingTimer = setInterval(() => {
    syncLocaleFromClient(false)
  }, 30000)
}

const stopLocalePolling = () => {
  if (localePollingTimer) {
    clearInterval(localePollingTimer)
    localePollingTimer = null
    console.log('[Background] Stopped locale polling')
  }
}

// 更新右键菜单
const updateContextMenu = (locale) => {
  const menuTexts = {
    en: 'Download with LinkCore',
    zh_CN: '使用 LinkCore 下载',
    zh_TW: '使用 LinkCore 下載',
    ja: 'LinkCore でダウンロード',
    ko: 'LinkCore로 다운로드',
    es: 'Descargar con LinkCore',
    fr: 'Télécharger avec LinkCore',
    de: 'Mit LinkCore herunterladen',
    ru: 'Скачать с LinkCore'
  }
  
  const title = menuTexts[locale] || menuTexts.en
  
  chrome.contextMenus.update('linkcore-download', {
    title: title
  }, () => {
    if (chrome.runtime.lastError) {
      console.log('Context menu update error:', chrome.runtime.lastError)
    }
  })
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'probe') {
    probeRpc().then(ok => sendResponse(ok))
    return true
  }
  
  if (msg && msg.type === 'syncLocale') {
    syncLocaleFromClient(true).then((result) => {
      sendResponse({ ok: result.success, ...result })
    })
    return true
  }
  
  if (msg && msg.type === 'tasks') {
    tryChannel('/linkcore/tasks', { method: 'GET' }, 1000)
      .then(ok => {
        if (!ok) {
          sendResponse({ connected: false, totalSpeed: 0, tasks: [] })
        } else {
          ok.resp.json()
            .then(data => {
              sendResponse({ 
                connected: true, 
                totalSpeed: data.totalSpeed || 0, 
                tasks: data.tasks || [] 
              })
            })
            .catch(() => {
              sendResponse({ connected: false, totalSpeed: 0, tasks: [] })
            })
        }
      })
      .catch(() => {
        sendResponse({ connected: false, totalSpeed: 0, tasks: [] })
      })
    return true
  }
  
  if (msg && msg.type === 'connection') {
    tryChannel('/linkcore/health', { method: 'GET' }, 1000)
      .then(result => {
        sendResponse({ connected: !!(result && result.resp && result.resp.ok) })
      })
      .catch(() => {
        sendResponse({ connected: false })
      })
    return true
  }
  
  if (msg && msg.type === 'version') {
    tryChannel('/linkcore/version', { method: 'GET' }, 1000)
      .then(ok => {
        if (ok && ok.resp && ok.resp.ok) {
          ok.resp.json()
            .then(data => {
              const version = data && data.version ? data.version : ''
              sendResponse({ connected: true, version })
            })
            .catch(() => {
              sendResponse({ connected: false, version: '' })
            })
        } else {
          sendResponse({ connected: false, version: '' })
        }
      })
      .catch(() => {
        sendResponse({ connected: false, version: '' })
      })
    return true
  }

  if (msg && msg.type === 'getExtConfig') {
    const handleGetExtConfig = async () => {
      await syncExtConfigFromClient()
      const interceptAllDownloads = !!extConfig.interceptAllDownloads
      const silentDownload = !!extConfig.silentDownload
      const skipFileExtensions = Array.isArray(extConfig.skipFileExtensions) ? extConfig.skipFileExtensions : []
      const shiftToggleEnabled = !!extConfig.shiftToggleEnabled
      sendResponse({
        interceptAllDownloads,
        silentDownload,
        skipFileExtensions,
        shiftToggleEnabled
      })
    }
    handleGetExtConfig()
    return true
  }

  if (msg && msg.type === 'toggleAutoHijackOverride') {
    toggleAutoHijackOverride().then((disabled) => {
      sendResponse({ disabled })
    })
    return true
  }

  if (msg && msg.type === 'shiftHotkeyTriggered') {
    const handleShiftHotkey = async () => {
      await syncExtConfigFromClient()
      if (extConfig && extConfig.shiftToggleEnabled) {
        const disabled = await toggleAutoHijackOverride()
        sendResponse({ disabled })
      } else {
        sendResponse({ disabled: null })
      }
    }
    handleShiftHotkey()
    return true
  }

  if (msg && msg.type === 'addUriFromContent' && msg.url) {
    const handleAddFromContent = async () => {
      const url = msg.url || ''
      if (!url || !/^https?:/i.test(url)) {
        sendResponse({ ok: false })
        return
      }
      const referer = msg.referer || ''
      const suggestedFilename = msg.suggestedFilename || ''
      const extraHeaders = Array.isArray(msg.headers) ? msg.headers : []
      const connected = await isClientAvailable()
      if (!connected) {
        const fallback = await downloadViaBrowser(url, suggestedFilename)
        sendResponse({ ok: !!fallback.ok, via: 'browser' })
        return
      }
      const ok = await addUri(url, referer, suggestedFilename, extraHeaders)
      sendResponse({ ok, via: 'client' })
    }
    handleAddFromContent()
    return true
  }

  if (msg && msg.type === 'addExcludeDomain' && msg.domain) {
    const handleAddExcludeDomain = async () => {
      try {
        console.log('[Background] Received addExcludeDomain request for:', msg.domain)
        
        // 先获取当前配置
        const currentConfig = await tryChannel('/linkcore/ext-config', {
          method: 'GET'
        }, 3000)
        
        let excludeDomains = []
        if (currentConfig && currentConfig.resp) {
          const data = await currentConfig.resp.json()
          if (Array.isArray(data.excludeDomains)) {
            excludeDomains = data.excludeDomains
          }
        }
        
        console.log('[Background] Current excludeDomains:', excludeDomains)
        
        const domain = msg.domain.toLowerCase().trim()
        const existingIndex = excludeDomains.findIndex(d => d.toLowerCase().trim() === domain)
        
        console.log('[Background] Domain to toggle:', domain)
        console.log('[Background] Existing index:', existingIndex)
        
        if (existingIndex !== -1) {
          // 域名已存在，移除它
          console.log('[Background] Removing domain from list')
          excludeDomains.splice(existingIndex, 1)
          const result = await tryChannel('/linkcore/ext-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ excludeDomains })
          }, 3000)
          
          if (result && result.resp && result.resp.ok) {
            console.log('[Background] Domain removed successfully')
            sendResponse({ ok: true, removed: true })
          } else {
            console.error('[Background] Failed to remove domain')
            sendResponse({ ok: false })
          }
        } else {
          // 域名不存在，添加它
          console.log('[Background] Adding domain to list')
          excludeDomains.push(domain)
          const result = await tryChannel('/linkcore/ext-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ excludeDomains })
          }, 3000)
          
          if (result && result.resp && result.resp.ok) {
            console.log('[Background] Domain added successfully')
            sendResponse({ ok: true, added: true })
          } else {
            console.error('[Background] Failed to add domain')
            sendResponse({ ok: false })
          }
        }
      } catch (e) {
        console.error('[Background] Failed to add/remove exclude domain:', e)
        sendResponse({ ok: false })
      }
    }
    handleAddExcludeDomain()
    return true
  }

  if (msg && msg.type === 'getExcludeDomains') {
    const handleGetExcludeDomains = async () => {
      try {
        const result = await tryChannel('/linkcore/ext-config', {
          method: 'GET'
        }, 3000)
        
        if (result && result.resp) {
          const data = await result.resp.json()
          sendResponse({ excludeDomains: data.excludeDomains || [] })
        } else {
          sendResponse({ excludeDomains: [] })
        }
      } catch (e) {
        console.error('[Background] Failed to get exclude domains:', e)
        sendResponse({ excludeDomains: [] })
      }
    }
    handleGetExcludeDomains()
    return true
  }

  if (msg && msg.type === 'addSkipFileType' && msg.fileType) {
    const handleAddSkipFileType = async () => {
      try {
        const result = await tryChannel('/linkcore/ext-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skipFileExtensions: [msg.fileType] })
        }, 3000)
        
        if (result && result.resp && result.resp.ok) {
          sendResponse({ ok: true })
        } else {
          sendResponse({ ok: false })
        }
      } catch (e) {
        console.error('[Background] Failed to add skip file type:', e)
        sendResponse({ ok: false })
      }
    }
    handleAddSkipFileType()
    return true
  }

  if (msg && msg.type === 'addSkipFileTypes' && Array.isArray(msg.fileTypes)) {
    const handleAddSkipFileTypes = async () => {
      let response = { ok: false, error: 'unknown' }
      try {
        console.log('[Background] Adding skip file types:', msg.fileTypes)
        
        // 先获取当前配置
        const currentConfig = await tryChannel('/linkcore/ext-config', {
          method: 'GET'
        }, 5000)
        
        let skipFileExtensions = []
        if (currentConfig && currentConfig.resp) {
          const data = await currentConfig.resp.json()
          console.log('[Background] Current config data:', data)
          if (Array.isArray(data.skipFileExtensions)) {
            skipFileExtensions = data.skipFileExtensions
          }
        }
        
        // 合并并去重（与程序逻辑一致）
        const allExtensions = [...skipFileExtensions, ...msg.fileTypes]
        const uniqueExtensions = Array.from(new Set(allExtensions))
        
        console.log('[Background] Sending skipFileExtensions:', uniqueExtensions)
        
        const result = await tryChannel('/linkcore/ext-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skipFileExtensions: uniqueExtensions })
        }, 5000)
        
        console.log('[Background] POST result:', result)
        
        if (result && result.resp && result.resp.ok) {
          response = { ok: true, added: msg.fileTypes.length }
        } else {
          console.error('[Background] POST failed, result:', result)
          response = { ok: false, error: 'POST failed' }
        }
      } catch (e) {
        console.error('[Background] Failed to add skip file types:', e)
        response = { ok: false, error: e.message }
      }
      
      // 确保总是发送响应
      try {
        sendResponse(response)
      } catch (e) {
        console.error('[Background] Failed to send response:', e)
      }
    }
    handleAddSkipFileTypes()
    return true
  }
})
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let url = info.linkUrl || info.srcUrl || info.pageUrl
  const referer = tab && tab.url ? tab.url : ''
  if (url) {
    const connected = await isClientAvailable()
    if (connected) {
      const ok = await addUri(url, referer)
      if (ok) return
    }
    await downloadViaBrowser(url, '')
  }
})

chrome.downloads.onCreated.addListener((item) => {
  const handleDownloadCreated = async () => {
    // 只处理正在进行中的下载，忽略历史记录
    // 历史记录的状态通常是 'complete' 或 'interrupted'
    // 只有真正的新下载才会是 'in_progress'
    if (item.state !== 'in_progress') {
      console.log('[LinkCore] Ignoring non-active download (state: ' + item.state + '):', item.url)
      return
    }
    
    const overrideDisabled = await getAutoHijackOverride()
    if (overrideDisabled) {
      return
    }
    // 使用已缓存的 extConfig（由定时轮询保持同步），避免每次下载都发起网络请求导致延迟
    const effectiveAutoHijack = !!extConfig.interceptAllDownloads
    if (!effectiveAutoHijack) return
    const url = item && item.url ? item.url : ''
    if (!url || !/^https?:/i.test(url)) return
    
    // 检查是否在排除域名列表中
    try {
      const downloadUrl = new URL(url)
      const downloadDomain = downloadUrl.hostname
      
      // 检查 referer 域名
      let refererDomain = ''
      if (item.referrer) {
        try {
          const refererUrl = new URL(item.referrer)
          refererDomain = refererUrl.hostname
        } catch (e) {}
      }
      
      // 获取排除域名列表
      const excludeDomains = Array.isArray(extConfig.excludeDomains) ? extConfig.excludeDomains : []
      
      // 检查下载域名或 referer 域名是否在排除列表中
      const isDomainExcluded = excludeDomains.some(domain => {
        const normalizedDomain = domain.toLowerCase().trim()
        return downloadDomain.toLowerCase().includes(normalizedDomain) || 
               (refererDomain && refererDomain.toLowerCase().includes(normalizedDomain))
      })
      
      if (isDomainExcluded) {
        console.log('[LinkCore] Domain excluded, skipping download:', downloadDomain)
        return
      }
    } catch (e) {
      console.error('[LinkCore] Error checking excluded domain:', e)
    }
    
    try {
      let name = ''
      if (item && item.filename) {
        name = item.filename
      } else {
        try {
          const u = new URL(url)
          name = u.pathname ? u.pathname.split('/').pop() || '' : ''
        } catch (e) {
          name = ''
        }
      }
      const ext = name && name.indexOf('.') !== -1 ? name.split('.').pop().toLowerCase() : ''
      if (ext && Array.isArray(extConfig.skipFileExtensions) && extConfig.skipFileExtensions.includes(ext)) {
        return
      }
      
      // 检查文件大小限制（minFileSize 单位为 MB）
      const minFileSizeMB = Number(extConfig.minFileSize) || 0
      if (minFileSizeMB > 0) {
        // 获取文件大小（字节）
        // totalBytes 是文件总大小，如果未知则为 -1
        const totalBytes = item.totalBytes || 0
        const fileSizeMB = totalBytes / (1024 * 1024)
        
        // 如果已知文件大小且小于最小限制，跳过拦截
        if (totalBytes > 0 && fileSizeMB < minFileSizeMB) {
          console.log('[LinkCore] File size (' + fileSizeMB.toFixed(2) + 'MB) below minimum (' + minFileSizeMB + 'MB), skipping:', url)
          return
        }
        
        // 如果文件大小未知（totalBytes 为 0 或 -1），继续拦截
        if (totalBytes <= 0) {
          console.log('[LinkCore] File size unknown, will intercept anyway:', url)
        }
      }
    } catch (e) {
    }
    try {
      const ok = await addUri(url, item.referrer)
      if (ok) {
        chrome.downloads.cancel(item.id)
        // 从下载历史中删除记录，避免留下痕迹
        chrome.downloads.erase({ id: item.id })
      }
    } catch (e) {
    }
  }
  handleDownloadCreated()
})
