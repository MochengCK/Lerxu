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
  videoSnifferFormats: ['m4s', 'mp4', 'flv', 'm3u8', 'ts', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'],
  videoSnifferAutoCombine: true
}

const EXT_CONFIG_STORAGE_KEY = 'extConfig'

// 从 chrome.storage 恢复上次持久化的 extConfig，防止 Service Worker 重启后配置丢失
//
// 冷启动竞态修复:
// 模块级 extConfig 默认值 interceptAllDownloads=false，而 storage 恢复是异步的。
// SW 休眠后被下载事件唤醒时，downloads.onCreated 可能先于恢复完成触发，
// 导致接管被跳过、下载漏进浏览器自己的下载列表。
// 所有接管决策统一 await extConfigReady，确保拿到真实配置后再判断。
let resolveExtConfigReady = null
const extConfigReady = new Promise((resolve) => { resolveExtConfigReady = resolve })
const markExtConfigReady = () => {
  if (resolveExtConfigReady) {
    resolveExtConfigReady()
    resolveExtConfigReady = null
  }
}

let extConfig = { ...extConfigDefaults }
try {
  chrome.storage.local.get([EXT_CONFIG_STORAGE_KEY], (res) => {
    const stored = res && res[EXT_CONFIG_STORAGE_KEY]
    if (stored && typeof stored === 'object') {
      extConfig = {
        ...extConfigDefaults,
        ...stored
      }
      console.log('[Background] Restored extConfig from storage:', extConfig.interceptAllDownloads ? 'intercept ON' : 'intercept OFF')
    }
    markExtConfigReady()
    applyDownloadUiSetting()
  })
} catch (e) {
  markExtConfigReady()
}

let extConfigTimer = null
let extConfigSyncedOnce = false
const AUTO_HIJACK_OVERRIDE_KEY = 'autoHijackTemporarilyDisabled'
const SESSION_TOKEN_KEY = 'linkcoreSessionToken'
const TOKEN_VERSION_KEY = 'linkcoreTokenVersion'
// 回退到浏览器下载的 URL 集合，防止接管循环（取消→重新下载→取消→...）
// 使用 Map 记录时间戳，定期清理过期条目
const fallbackBrowserUrls = new Map()
// 缓存 autoHijackOverride 状态，避免 onCreated 中的异步 storage 读取延迟
// 同步读取是让 cancel 在下载项出现前立即执行的关键
let cachedAutoHijackDisabled = false
try {
  chrome.storage.local.get([AUTO_HIJACK_OVERRIDE_KEY], (res) => {
    cachedAutoHijackDisabled = !!(res && res[AUTO_HIJACK_OVERRIDE_KEY])
  })
} catch (e) {}
// 监听 storage 变化，保持缓存同步
try {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[AUTO_HIJACK_OVERRIDE_KEY]) {
      cachedAutoHijackDisabled = !!changes[AUTO_HIJACK_OVERRIDE_KEY].newValue
      // 通知所有 content script 更新缓存
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'autoHijackToggled',
            disabled: cachedAutoHijackDisabled
          }).catch(() => {})
        })
      })
    }
  })
} catch (e) {}
// webRequest.onHeadersReceived 预检测到的下载 URL 集合
// 当服务器响应 Content-Disposition: attachment 时，URL 被记录在此
// onCreated 可据此做更快决策（已知是下载，直接 cancel）
const pendingDownloadUrls = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [url, ts] of pendingDownloadUrls) {
    if (now - ts > 15000) {
      pendingDownloadUrls.delete(url)
    }
  }
}, 10000)
setInterval(() => {
  const now = Date.now()
  for (const [url, ts] of fallbackBrowserUrls) {
    if (now - ts > 10000) {
      fallbackBrowserUrls.delete(url)
    }
  }
}, 10000)
let sessionToken = null
let tokenVersion = null
let lastKnownTheme = null
let isAuthenticating = false
let authPromise = null
let isInitialized = false

const saveSessionToStorage = () => {
  try {
    chrome.storage.local.set({
      [SESSION_TOKEN_KEY]: sessionToken,
      [TOKEN_VERSION_KEY]: tokenVersion
    }, () => {})
  } catch (e) {}
}

const clearSessionToken = () => {
  sessionToken = null
  tokenVersion = null
  try {
    chrome.storage.local.remove([SESSION_TOKEN_KEY, TOKEN_VERSION_KEY], () => {})
  } catch (e) {}
}

const restoreSessionFromStorage = () => {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([SESSION_TOKEN_KEY, TOKEN_VERSION_KEY, 'uiTheme'], (res) => {
        if (res) {
          if (res[SESSION_TOKEN_KEY]) {
            sessionToken = res[SESSION_TOKEN_KEY]
          }
          if (res[TOKEN_VERSION_KEY] !== null && res[TOKEN_VERSION_KEY] !== undefined) {
            tokenVersion = res[TOKEN_VERSION_KEY]
          }
          const t = res.uiTheme ? `${res.uiTheme}`.toLowerCase() : ''
          if (t === 'dark' || t === 'light') {
            lastKnownTheme = t
          }
        }
        console.log('[Background] Session restored from storage:', sessionToken ? 'token exists' : 'no token')
        resolve()
      })
    } catch (e) {
      resolve()
    }
  })
}

const fetchHandshake = async () => {
  try {
    const hosts = ['127.0.0.1', 'localhost']
    for (const h of hosts) {
      try {
        const url = `http://${h}:${CHANNEL_PORT}/linkcore/handshake`
        const resp = await fetchWithTimeout(url, { method: 'GET' }, 3000)
        if (resp && resp.ok) {
          const data = await resp.json().catch(() => null)
          if (data && data.challenge) {
            console.log('[Background] Challenge acquired:', data.challenge)
            return data
          }
        }
      } catch (e) {
        // 继续尝试下一个host
      }
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
            saveSessionToStorage()
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

// 缓存上次成功的 host，避免每次都遍历两个
let cachedHost = null

const tryChannel = async (path, options = {}, timeout = 1000, allowRetry = true) => {
  // 对于需要认证的请求，先确保 token 有效
  if (!path.startsWith('/linkcore/handshake') && !path.startsWith('/linkcore/authorize')) {
    const tokenValid = await ensureSessionToken()
    if (!tokenValid) {
      console.log('[Background] Failed to ensure session token')
      return null
    }
  }

  // 优先使用缓存的 host，失败后再尝试全部
  const allHosts = ['127.0.0.1', 'localhost']
  const hosts = cachedHost ? [cachedHost, ...allHosts.filter(h => h !== cachedHost)] : allHosts

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

      if (resp && resp.status === 401 && allowRetry) {
        console.log('[Background] Token invalid (401), clearing and refreshing...')
        clearSessionToken()
        
        // 重新认证
        const authSuccess = await performAuthentication()
        if (authSuccess) {
          console.log('[Background] Re-authorization successful, retrying request...')
          // 重试请求，但不允许再次重试以避免无限循环
          return tryChannel(path, options, timeout, false)
        } else {
          console.log('[Background] Re-authorization failed')
        }
      }

      if (resp && resp.ok) {
        // 缓存成功的 host
        cachedHost = h
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
  // 清除 host 缓存，下次重新探测
  cachedHost = null
  return null
}

const performAuthentication = async () => {
  console.log('[Background] Performing authentication...')
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

const validateTokenWithHealthCheck = async () => {
  if (!sessionToken) return false
  try {
    const hosts = ['127.0.0.1', 'localhost']
    for (const h of hosts) {
      try {
        const url = `http://${h}:${CHANNEL_PORT}/linkcore/health`
        const resp = await fetchWithTimeout(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'X-Token-Version': tokenVersion !== null ? tokenVersion.toString() : ''
          }
        }, 1500)
        if (resp && resp.ok) {
          return true
        }
        if (resp && resp.status === 401) {
          console.log('[Background] Token validation failed: 401')
          return false
        }
      } catch (e) {
        // 继续尝试下一个host
      }
    }
  } catch (e) {
    console.log('[Background] Token health check error:', e)
  }
  return false
}

const ensureSessionToken = async () => {
  if (isAuthenticating) {
    console.log('[Background] Authentication already in progress, waiting...')
    if (authPromise) {
      return authPromise
    }
    return false
  }

  if (sessionToken) {
    return true
  }

  console.log('[Background] No session token, acquiring...')
  isAuthenticating = true
  authPromise = (async () => {
    try {
      const result = await performAuthentication()
      return result
    } finally {
      isAuthenticating = false
      authPromise = null
    }
  })()

  return authPromise
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
    const videoSnifferFormats = Array.isArray(data.videoSnifferFormats) ? data.videoSnifferFormats : ['m4s', 'mp4', 'flv', 'm3u8', 'ts', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus']
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
    markExtConfigReady()
    applyDownloadUiSetting()
    
    // 持久化完整 extConfig 到 chrome.storage，防止 Service Worker 重启后配置丢失
    chrome.storage.local.set({
      [EXT_CONFIG_STORAGE_KEY]: nextConfig,
      videoSnifferEnabled,
      videoSnifferFormats,
      videoSnifferAutoCombine,
      ...(lastKnownTheme ? { uiTheme: lastKnownTheme } : {})
    }, () => {
      console.log('[Background] extConfig saved to storage')
    })

    // 通知所有 content script 配置已更新
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'extConfigUpdated' }).catch(() => {})
      })
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
    // 并行获取 headers 和确保 token 有效，减少总等待时间
    const [baseHeaders] = await Promise.all([
      getHeadersForUrl(url, referer),
      ensureSessionToken()
    ])
    const headers = mergeHeaderLines(baseHeaders, extraHeaders)
    const payload = { url, referer, headers }
    // 如果有建议的文件名，添加到请求中
    if (suggestedFilename) {
      payload.suggestedFilename = suggestedFilename
    }
    const reqOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
    // 首次尝试，使用较短超时
    let ok = await tryChannel('/linkcore/add', reqOptions, 2000)
    if (!ok) {
      // 首次失败，短暂等待后重试一次（可能是瞬时网络抖动）
      await new Promise(r => setTimeout(r, 200))
      ok = await tryChannel('/linkcore/add', reqOptions, 3000)
    }
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

const initializeBackground = async () => {
  if (isInitialized) {
    console.log('[Background] Already initialized, skipping')
    return
  }
  isInitialized = true
  
  console.log('[Background] Initializing background script...')
  
  // 先从 storage 恢复 session
  await restoreSessionFromStorage()
  
  try {
    chrome.storage.local.set({ [AUTO_HIJACK_OVERRIDE_KEY]: false }, () => {})
  } catch (e) {}
  
  // 预探测一次,提升首用体验
  probeRpc()
  
  // 尝试认证（如果有恢复的token会直接使用，无效时会自动重新认证）
  ensureSessionToken().catch((e) => {
    console.log('[Background] Initial authentication failed, will retry on demand:', e)
  })
  
  // 同步客户端语言
  syncLocaleFromClient()
  // 启动语言监听
  startLocalePolling()
  // 同步客户端扩展配置
  startExtConfigPolling()

  // SW 重启后恢复放行下载的气泡跟踪(等配置就绪再判断)
  extConfigReady.then(() => recoverActiveBrowserDownloads())
  
  console.log('[Background] Background script initialized')
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: 'linkcore-download',
    title: chrome.i18n.getMessage('contextMenuDownload'),
    contexts: ['link', 'page', 'selection', 'image', 'video', 'audio']
  })
  initializeBackground()
})

// 启动时也要启动语言监听
chrome.runtime.onStartup.addListener(() => {
  initializeBackground()
})

// 处理 Service Worker 重启（onActivate 事件在 SW 启动时触发）
if (chrome.runtime.onActivate) {
  chrome.runtime.onActivate.addListener(() => {
    initializeBackground()
  })
}

const getAutoHijackOverride = () => {
  // 返回缓存值，避免异步延迟
  return Promise.resolve(cachedAutoHijackDisabled)
}

const toggleAutoHijackOverride = async () => {
  const current = cachedAutoHijackDisabled
  const next = !current
  cachedAutoHijackDisabled = next // 立即更新缓存
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

// Service Worker 启动时立即恢复 session（同步操作）
restoreSessionFromStorage().catch(() => {})

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
          sendResponse({ connected: false, downloadSpeed: 0, uploadSpeed: 0, totalSpeed: 0, tasks: [] })
        } else {
          ok.resp.json()
            .then(data => {
              sendResponse({ 
                connected: true, 
                downloadSpeed: data.downloadSpeed || 0,
                uploadSpeed: data.uploadSpeed || 0,
                totalSpeed: data.totalSpeed || 0, 
                tasks: data.tasks || [] 
              })
            })
            .catch(() => {
              sendResponse({ connected: false, downloadSpeed: 0, uploadSpeed: 0, totalSpeed: 0, tasks: [] })
            })
        }
      })
      .catch(() => {
        sendResponse({ connected: false, downloadSpeed: 0, uploadSpeed: 0, totalSpeed: 0, tasks: [] })
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
      // 直接尝试发送到程序，跳过 isClientAvailable 预检查以减少延迟
      const ok = await addUri(url, referer, suggestedFilename, extraHeaders)
      if (ok) {
        sendResponse({ ok: true, via: 'client' })
      } else {
        // 发送失败，回退到浏览器下载
        // 必须先标记 fallbackBrowserUrls，否则 onCreated 会把回退下载再次取消
        fallbackBrowserUrls.set(url, Date.now())
        const fallback = await downloadViaBrowser(url, suggestedFilename)
        sendResponse({ ok: !!fallback.ok, via: 'browser' })
      }
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
    // 直接尝试发送到程序，跳过预检查以减少延迟
    const ok = await addUri(url, referer)
    if (ok) return
    // 回退浏览器下载前先标记，防止被接管逻辑再次取消
    fallbackBrowserUrls.set(url, Date.now())
    await downloadViaBrowser(url, '')
  }
})

// === 下载接管核心:统一决策 + 幂等执行 ===
// Chromium 扩展 API 的上限说明:
//   没有任何扩展 API 能在"下载项创建之前"介入(MV3 webRequest 不可阻塞、
//   declarativeNetRequest 无法按响应头拦截)。IDM/FDM/ABDM 在 Chrome 上
//   全都是 cancel + erase 路线。能把体验做干净的关键是:
//   1. 决策前必须等配置就绪(修复 SW 冷启动漏接管)
//   2. cancel 必须 await 成功后再 erase,否则"已取消"条目残留下载列表
//   3. onDeterminingFilename 在写盘/另存为弹窗之前介入,不留 .crdownload
//   4. downloads.ui 按决策动态显隐:接管隐藏气泡,放行显示气泡(见 applyUiForDecision)

// 已成功接管(或正在接管)的下载 id,防止 onCreated/onDeterminingFilename 重复执行
const handledDownloadIds = new Set()
// downloadId -> Promise<'intercept'|'skip'>,让两个事件共享同一份决策
const takeoverDecisions = new Map()

setInterval(() => {
  if (handledDownloadIds.size > 500) {
    const keep = Array.from(handledDownloadIds).slice(-200)
    handledDownloadIds.clear()
    keep.forEach(id => handledDownloadIds.add(id))
  }
}, 60000)

// 浏览器下载气泡按接管结果动态显隐:
//   - 下载被接管 → 隐藏气泡(浏览器侧不留痕迹)
//   - 下载被放行(临时禁用/命中排除规则/回退浏览器下载) → 显示气泡,
//     浏览器真正在下载,用户需要正常的下载反馈;该下载结束后恢复隐藏
//   - 接管功能关闭 → 始终显示气泡(基线)
// 注意 setUiOptions 是 profile 级全局开关,无法按单个下载设置,
// 所以放行中的下载与新接管下载并发时,气泡以后到的决策为准
const setDownloadUiEnabled = (enabled) => {
  try {
    if (chrome.downloads && typeof chrome.downloads.setUiOptions === 'function') {
      chrome.downloads.setUiOptions({ enabled }, () => {
        if (chrome.runtime.lastError) {
          // 不支持 downloads.ui 的平台(如 Firefox),忽略
        }
      })
    }
  } catch (e) {}
}

// 基线:接管开启时默认隐藏,关闭时显示
const applyDownloadUiSetting = () => {
  setDownloadUiEnabled(!extConfig.interceptAllDownloads)
}

// 决策为"放行"的进行中下载 id —— 这些由浏览器处理,期间气泡保持显示
const activeBrowserDownloads = new Set()

// 决策副作用(幂等,onCreated/onDeterminingFilename 都会调用):
// 接管 → 尽早隐藏气泡;放行 → 显示气泡并跟踪,终态时统一恢复基线
const applyUiForDecision = (item, decision) => {
  if (decision === 'intercept') {
    applyDownloadUiSetting()
    return
  }
  if (extConfig.interceptAllDownloads && item && typeof item.id === 'number') {
    activeBrowserDownloads.add(item.id)
    setDownloadUiEnabled(true)
  }
}

// SW 重启恢复:仍在进行中的下载说明之前被放行(接管的已被取消),
// 重新纳入跟踪并显示气泡,避免长下载期间 SW 休眠唤醒后气泡消失
const recoverActiveBrowserDownloads = () => {
  try {
    chrome.downloads.search({ state: 'in_progress' }, (items) => {
      if (chrome.runtime.lastError || !Array.isArray(items)) {
        return
      }
      if (!extConfig.interceptAllDownloads) {
        return
      }
      for (const it of items) {
        if (it && typeof it.id === 'number') {
          activeBrowserDownloads.add(it.id)
        }
      }
      if (activeBrowserDownloads.size > 0) {
        setDownloadUiEnabled(true)
      }
    })
  } catch (e) {}
}

// 判断一个下载项是否应该被接管(所有排除规则集中在此,onCreated 与
// onDeterminingFilename 通过 takeoverDecisions 共享同一份决策,不会重复判断)
const decideTakeover = (item) => {
  if (!item || typeof item.id !== 'number') {
    return Promise.resolve('skip')
  }
  const existing = takeoverDecisions.get(item.id)
  if (existing) {
    return existing
  }

  const decision = (async () => {
    // 等待配置从 storage 恢复/从客户端同步,修复 SW 冷启动竞态导致的漏接管
    await extConfigReady

    if (!extConfig.interceptAllDownloads) {
      return 'skip'
    }

    const url = item.url || ''
    if (!url || !/^https?:/i.test(url)) {
      return 'skip'
    }

    // 我们主动回退给浏览器的下载,跳过接管(防止 取消→重下→取消 循环)
    if (fallbackBrowserUrls.has(url)) {
      fallbackBrowserUrls.delete(url)
      return 'skip'
    }

    // 临时禁用接管(缓存值,同步判断)
    if (cachedAutoHijackDisabled) {
      return 'skip'
    }

    // 域名排除(下载域名或来源域名命中即放行)
    try {
      const downloadDomain = new URL(url).hostname.toLowerCase()
      let refererDomain = ''
      if (item.referrer) {
        try {
          refererDomain = new URL(item.referrer).hostname.toLowerCase()
        } catch (e) {}
      }
      const excludeDomains = Array.isArray(extConfig.excludeDomains) ? extConfig.excludeDomains : []
      const isDomainExcluded = excludeDomains.some(domain => {
        const normalized = `${domain}`.toLowerCase().trim()
        return normalized && (downloadDomain.includes(normalized) || (refererDomain && refererDomain.includes(normalized)))
      })
      if (isDomainExcluded) {
        return 'skip'
      }
    } catch (e) {}

    // 文件扩展名排除 + 文件大小排除
    try {
      let name = item.filename || ''
      if (!name) {
        try {
          name = new URL(url).pathname.split('/').pop() || ''
        } catch (e) {}
      }
      const ext = name && name.indexOf('.') !== -1 ? name.split('.').pop().toLowerCase() : ''
      if (ext && Array.isArray(extConfig.skipFileExtensions) && extConfig.skipFileExtensions.includes(ext)) {
        return 'skip'
      }
      const minFileSizeMB = Number(extConfig.minFileSize) || 0
      if (minFileSizeMB > 0) {
        const totalBytes = item.totalBytes || 0
        // 注意:onCreated 阶段 totalBytes 常为 0(响应头未就绪),此过滤为尽力而为
        if (totalBytes > 0 && totalBytes / (1024 * 1024) < minFileSizeMB) {
          return 'skip'
        }
      }
    } catch (e) {}

    return 'intercept'
  })()

  takeoverDecisions.set(item.id, decision)
  decision.finally(() => {
    setTimeout(() => takeoverDecisions.delete(item.id), 30000)
  })
  return decision
}

// 执行接管:取消浏览器下载(等待取消完成)→ 从历史擦除 → 转交 LinkCore → 失败回退浏览器
const executeTakeover = async (item) => {
  if (handledDownloadIds.has(item.id)) {
    return
  }
  handledDownloadIds.add(item.id)

  const url = item.url || ''
  try {
    // 必须 await:进行中的下载 erase 不生效,只有取消完成后才能彻底移除,
    // 否则浏览器下载列表会残留"已取消"条目
    await chrome.downloads.cancel(item.id)
  } catch (e) {}
  try {
    await chrome.downloads.erase({ id: item.id })
  } catch (e) {}

  try {
    const success = await addUri(url, item.referrer, item.filename)
    if (!success) {
      fallbackBrowserUrls.set(url, Date.now())
      await downloadViaBrowser(url, item.filename)
    }
  } catch (e) {
    fallbackBrowserUrls.set(url, Date.now())
    await downloadViaBrowser(url, item.filename)
  }
}

chrome.downloads.onCreated.addListener((item) => {
  // 只处理正在进行中的下载，忽略历史记录
  if (!item || item.state !== 'in_progress') {
    return
  }
  decideTakeover(item).then((decision) => {
    applyUiForDecision(item, decision)
    if (decision === 'intercept') {
      executeTakeover(item)
    }
  }).catch(() => {})
})

// onDeterminingFilename 在浏览器确定文件名/写入磁盘/弹出"另存为"之前触发。
// 在这里取消可以:
//   - 不留 .crdownload 残留文件
//   - 避免用户开启"下载前询问保存位置"时弹窗一闪而过
// 规则:决定接管 → 取消(不可再调 suggest);决定放行 → 必须调 suggest() 走默认文件名
try {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    decideTakeover(item).then((decision) => {
      applyUiForDecision(item, decision)
      if (decision === 'intercept') {
        executeTakeover(item)
      } else {
        try { suggest() } catch (e) {}
      }
    }).catch(() => {
      try { suggest() } catch (e) {}
    })
    return true
  })
} catch (e) {
  console.log('[Background] onDeterminingFilename setup failed:', e)
}

// 放行的浏览器下载到达终态后,若没有其他进行中的放行下载,恢复气泡基线(隐藏)
try {
  chrome.downloads.onChanged.addListener((delta) => {
    if (!delta || typeof delta.id !== 'number') {
      return
    }
    if (!activeBrowserDownloads.has(delta.id)) {
      return
    }
    const state = delta.state && delta.state.current
    if (state === 'complete' || state === 'interrupted') {
      activeBrowserDownloads.delete(delta.id)
      if (activeBrowserDownloads.size === 0) {
        applyDownloadUiSetting()
      }
    }
  })
} catch (e) {
  console.log('[Background] onChanged setup failed:', e)
}

// === webRequest.onHeadersReceived: 预检测下载响应 ===
// 在浏览器创建下载项之前检测 Content-Disposition: attachment
// 记录 URL 到 pendingDownloadUrls，让 onCreated 处理器做更快决策
try {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      // 只处理主框架的响应
      if (details.type !== 'main_frame' && details.type !== 'sub_frame') {
        return
      }

      // 检查拦截功能是否开启（同步检查）
      if (!extConfig.interceptAllDownloads) {
        return
      }

      // 检查响应头是否有 Content-Disposition: attachment
      const headers = details.responseHeaders || []
      let isAttachment = false
      for (const header of headers) {
        const name = (header.name || '').toLowerCase()
        const value = (header.value || '')
        if (name === 'content-disposition' && /attachment/i.test(value)) {
          isAttachment = true
          break
        }
        // Content-Type 不是 HTML/JSON/XML 的也可能触发下载
        // 但只靠 Content-Disposition 判断更精确
      }

      if (isAttachment) {
        const url = details.url || ''
        if (url && /^https?:/i.test(url)) {
          pendingDownloadUrls.set(url, Date.now())
        }
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  )
} catch (e) {
  console.log('[Background] webRequest.onHeadersReceived setup failed:', e)
}

// Service Worker 每次加载时执行初始化
// 使用 setTimeout 确保所有 const 函数声明都已完成
setTimeout(() => {
  initializeBackground().catch((e) => {
    console.log('[Background] Initialize failed:', e)
  })
}, 0)
