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
const SESSION_TOKEN_KEY = 'lerxuSessionToken'
const TOKEN_VERSION_KEY = 'lerxuTokenVersion'
// 回退到浏览器下载的 URL 集合，防止接管循环（取消→重新下载→取消→...）
// 使用 Map 记录时间戳，定期清理过期条目
// 注意:命中后不再立即 delete——回退窗口期内(10s)所有匹配下载项一律放行,
// 因为一次回退可能并行产生多个下载项(download-interceptor 的 fallbackLink.click()
// 与 background 的 downloadViaBrowser 同时触发),若一次性消费,其余下载项仍会被
// 接管→再次发送→再次失败→再次回退,形成发送循环。由下方定时器统一清理。
const fallbackBrowserUrls = new Map()
// 最近被扩展尝试接管/发送过的 URL 集合(15s 窗口)。
// 与 fallbackBrowserUrls 的区别:fallback 只保护"本次主动回退"产生的下载项;
// recentTakeoverUrls 保护"最近 N 秒内被扩展处理过"的所有同名 URL 下载项——
// 即使回退下载项因 URL 重定向变化、并行创建等原因没有命中 fallback 标记,
// 只要该 URL 最近被扩展处理过,浏览器下载项也一律放行,从根上切断
// "接管→发送失败→回退→再次接管→再次发送"的无限循环。
const recentTakeoverUrls = new Map()
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
setInterval(() => {
  const now = Date.now()
  for (const [url, ts] of recentTakeoverUrls) {
    if (now - ts > 15000) {
      recentTakeoverUrls.delete(url)
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
      chrome.storage.local.get([SESSION_TOKEN_KEY, TOKEN_VERSION_KEY, 'uiTheme', CLIENT_OFFLINE_KEY, WS_AUTH_TIME_KEY], (res) => {
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
          // 恢复"程序离线开始时间戳":SW 冷启动后仍能判断下载项是否在离线期间创建。
          // 仅在本次会话尚未确认程序在线时恢复:WS 认证/HTTP 探测成功会清除该值并
          // 删除 storage 键,若恢复回调晚于清除回调执行(异步竞态),不能把已清除的
          // 陈旧值再写回内存,否则接管决策会把"离线期间创建"误判到之后的所有下载,
          // 导致程序明明在线却始终放行浏览器下载。
          if (res[CLIENT_OFFLINE_KEY] && typeof res[CLIENT_OFFLINE_KEY] === 'number' && lastOnlineAt === 0) {
            clientOfflineSince = res[CLIENT_OFFLINE_KEY]
          }
          // 恢复"程序最近一次启动时间"(WS 认证成功时间)
          if (res[WS_AUTH_TIME_KEY] && typeof res[WS_AUTH_TIME_KEY] === 'number') {
            wsAuthTime = res[WS_AUTH_TIME_KEY]
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
    // 并行探测两个 host,任一成功即返回,避免串行等待放大接管延迟
    const results = await Promise.allSettled(hosts.map(h => {
      const url = `http://${h}:${CHANNEL_PORT}/lerxu/handshake`
      return fetchWithTimeout(url, { method: 'GET' }, 1500)
    }))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.ok) {
        const data = await r.value.json().catch(() => null)
        if (data && data.challenge) {
          console.log('[Background] Challenge acquired:', data.challenge)
          return data
        }
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
    // 并行提交签名:两个 host 同时探测,任一成功即返回。
    // 应用侧 challenge 一次性使用,竞态失败方会收到 401,由 allSettled 忽略
    const results = await Promise.allSettled(hosts.map(h => {
      const url = `http://${h}:${CHANNEL_PORT}/lerxu/authorize`
      return fetchWithTimeout(url, {
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
      }, 1500)
    }))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.ok) {
        const data = await r.value.json().catch(() => null)
        if (data && data.token) {
          sessionToken = data.token
          tokenVersion = data.tokenVersion
          saveSessionToStorage()
          console.log('[Background] Session token acquired:', sessionToken.substring(0, 20) + '...', 'version:', tokenVersion)
          return data
        }
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

// === WebSocket 通道(主通道) ===
// 相比 HTTP + token 通道:
//   - 长连接复用,无重复 HTTP 握手与每次请求的 token 认证开销(接管更快)
//   - 认证在连接层完成(challenge + 签名),消息不再携带 token,暴露面更小
//   - 服务器校验 Origin 仅允许扩展来源,本机其他进程/网页无法伪造请求
//   - MV3 中活动 WebSocket 使 Service Worker 保持存活,接管链路不被回收
const WS_PATH = '/ws'
let wsSocket = null
let wsAuthenticated = false
let wsConnecting = false
let wsReconnectDelay = 1000
let wsReconnectTimer = null
let wsSeq = 0
const wsPending = new Map()

// 通过 WebSocket 发送请求并等待响应(id 关联)
const wsRequest = (type, params, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    if (!wsSocket || wsSocket.readyState !== WebSocket.OPEN || !wsAuthenticated) {
      reject(new Error('ws not ready'))
      return
    }
    const id = ++wsSeq
    const timer = setTimeout(() => {
      wsPending.delete(id)
      reject(new Error('ws timeout'))
    }, timeout)
    wsPending.set(id, { resolve, reject, timer })
    try {
      wsSocket.send(JSON.stringify({ id, type, params }))
    } catch (e) {
      clearTimeout(timer)
      wsPending.delete(id)
      reject(e)
    }
  })
}

// 连接层认证:对服务器下发的 challenge 签名后回传
const handleWsChallenge = async (challenge) => {
  try {
    const extensionId = chrome.runtime.id
    const timestamp = Date.now()
    const signatureString = `${challenge}${extensionId}${timestamp}`
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signatureString))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const signature = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('')
    if (wsSocket && wsSocket.readyState === WebSocket.OPEN) {
      wsSocket.send(JSON.stringify({ type: 'authorize', challenge, signature, extensionId, timestamp }))
    }
  } catch (e) {
    try { wsSocket.close() } catch (_) {}
  }
}

const handleWsDisconnect = () => {
  wsConnecting = false
  wsAuthenticated = false
  wsSocket = null
  // 拒绝所有在途请求,调用方会回退 HTTP 或浏览器下载
  for (const [, p] of wsPending) {
    clearTimeout(p.timer)
    p.reject(new Error('ws closed'))
  }
  wsPending.clear()
  if (lastConnectionCheck.connected) {
    notifyConnectionChange(false)
  }
  lastConnectionCheck.connected = false
  lastConnectionCheck.lastCheckTime = Date.now()
  // 指数退避重连
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer)
  }
  wsReconnectTimer = setTimeout(() => {
    wsConnect()
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 8000)
  }, wsReconnectDelay)
}

const wsConnect = () => {
  if (wsConnecting || (wsSocket && (wsSocket.readyState === WebSocket.OPEN || wsSocket.readyState === WebSocket.CONNECTING))) {
    return
  }
  wsConnecting = true
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${CHANNEL_PORT}${WS_PATH}`)
    wsSocket = ws
    wsAuthenticated = false

    ws.onmessage = (ev) => {
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch (e) {
        return
      }
      if (msg.type === 'challenge') {
        handleWsChallenge(msg.challenge)
      } else if (msg.type === 'authorized') {
        wsAuthenticated = true
        wsConnecting = false
        wsReconnectDelay = 1000
        // 记录程序本次启动时间(WS 认证成功 = 程序必然已启动并监听端口)
        // 持久化到 storage:SW 冷启动后仍可判断下载项是否创建于程序启动前
        wsAuthTime = Date.now()
        try {
          chrome.storage.local.set({ [WS_AUTH_TIME_KEY]: wsAuthTime }, () => {})
        } catch (e) {}
        if (!lastConnectionCheck.connected) {
          notifyConnectionChange(true)
        }
        lastConnectionCheck.connected = true
        lastConnectionCheck.lastCheckTime = Date.now()
        console.log('[Background] WebSocket channel authenticated')
        // 连接就绪后立即同步一次配置
        syncExtConfigFromClient().catch(() => {})
      } else if (msg.type === 'error') {
        console.log('[Background] WebSocket server error:', msg.error)
      } else if (msg.id !== undefined) {
        const pending = wsPending.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          wsPending.delete(msg.id)
          if (msg.error) {
            pending.reject(new Error(msg.error))
          } else {
            pending.resolve(msg.result)
          }
        }
      }
    }

    ws.onclose = () => {
      handleWsDisconnect()
    }

    ws.onerror = () => {
      // onclose 会随之触发,统一在 handleWsDisconnect 处理
    }
  } catch (e) {
    wsConnecting = false
  }
}

// HTTP 兜底通道:按 type 映射回原 /lerxu/* 端点
const httpChannelRequest = async (type, params, timeout) => {
  try {
    switch (type) {
      case 'add': {
        const reqOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        }
        // add 是非幂等操作(创建任务):不做"失败后 150ms 盲重发"——
        // 服务器可能已处理任务但响应慢/丢包,盲重发会产生重复任务。
        // 改为延长单次超时 + singleHost(只试一个 host),宁缺毋滥,
        // 失败由调用方(addUriFromContent/executeTakeover)走回退流程。
        const ok = await tryChannel('/lerxu/add', { ...reqOptions, singleHost: true }, Math.max(timeout, 3000))
        if (!ok) return { ok: false }
        const data = await ok.resp.json().catch(() => ({}))
        return { ok: !!(data && data.ok), data }
      }
      case 'ext-config-get': {
        const ok = await tryChannel('/lerxu/ext-config', { method: 'GET' }, timeout)
        if (!ok || !ok.resp || !ok.resp.ok) return { ok: false }
        const data = await ok.resp.json().catch(() => null)
        return { ok: !!data, data }
      }
      case 'ext-config-set': {
        const ok = await tryChannel('/lerxu/ext-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params || {})
        }, timeout)
        return { ok: !!(ok && ok.resp && ok.resp.ok) }
      }
      case 'locale': {
        const ok = await tryChannel('/lerxu/locale', { method: 'GET' }, timeout)
        if (!ok || !ok.resp || !ok.resp.ok) return { ok: false }
        const data = await ok.resp.json().catch(() => null)
        return { ok: !!data, data }
      }
      case 'tasks': {
        const ok = await tryChannel('/lerxu/tasks', { method: 'GET' }, timeout)
        if (!ok || !ok.resp || !ok.resp.ok) return { ok: false, data: { tasks: [] } }
        const data = await ok.resp.json().catch(() => null)
        return { ok: !!data, data: data || { tasks: [] } }
      }
      case 'version': {
        const ok = await tryChannel('/lerxu/version', { method: 'GET' }, timeout)
        if (!ok || !ok.resp || !ok.resp.ok) return { ok: false }
        const data = await ok.resp.json().catch(() => null)
        return { ok: !!data, data }
      }
      case 'health': {
        const ok = await tryChannel('/lerxu/health', { method: 'GET' }, timeout)
        return { ok: !!(ok && ok.resp && ok.resp.ok) }
      }
      default:
        return { ok: false }
    }
  } catch (e) {
    return { ok: false }
  }
}

// 统一通道入口:优先 WebSocket 长连接(认证已在连接层完成),
// 失败时回退 HTTP(兼容旧版应用/WS 异常场景)。
// 返回 { ok: 业务是否成功, data } —— 与 httpChannelRequest 保持统一语义
const channelRequest = async (type, params, httpTimeout = 1500) => {
  if (wsSocket && wsSocket.readyState === WebSocket.OPEN && wsAuthenticated) {
    try {
      const data = await wsRequest(type, params)
      // add 的业务结果在 data.ok 中(invalid url 等失败场景),提取为统一 ok
      if (type === 'add') {
        return { ok: !!(data && data.ok), data }
      }
      return { ok: true, data }
    } catch (e) {
      // WS 请求失败,回退 HTTP
    }
  }
  return httpChannelRequest(type, params, httpTimeout)
}

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
// clientOfflineSince:程序最近一次"变为离线"的时间戳(ms),0 表示从未离线
// (或从未观察到离线)。持久化到 storage,SW 冷启动后仍可据此判断某个下载项
// 是否创建于程序离线期间 → 该下载项由浏览器完成,接管会丢失进度,必须放行。
// 之所以用"离线开始时间"而非"在线时间":程序一直在线时 SW 可能冷启动重启,
// 内存中的在线时间戳会丢失,而"离线开始时间"在冷启动后仍能从 storage 恢复,
// 避免误判"程序在线期间创建的下载项"为离线期间创建。
let clientOfflineSince = 0
let wsAuthTime = 0 // 最近一次 WS 认证成功的时间戳(ms):程序本次启动的可靠代理
let lastOnlineAt = 0 // 本 SW 会话内最近一次确认程序在线的时间戳(ms),0 = 尚未确认过
const CLIENT_OFFLINE_KEY = 'clientOfflineSince'
const WS_AUTH_TIME_KEY = 'wsAuthTime'
const notifyConnectionChange = (connected) => {
  console.log('[Background] Connection state changed:', connected ? 'connected' : 'disconnected')
  if (!connected) {
    if (!clientOfflineSince) {
      clientOfflineSince = Date.now()
      try {
        chrome.storage.local.set({ [CLIENT_OFFLINE_KEY]: clientOfflineSince }, () => {})
      } catch (e) {}
    }
  } else {
    lastOnlineAt = Date.now()
    if (clientOfflineSince) {
      clientOfflineSince = 0
      try {
        chrome.storage.local.remove([CLIENT_OFFLINE_KEY], () => {})
      } catch (e) {}
    }
  }
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
  if (!path.startsWith('/lerxu/handshake') && !path.startsWith('/lerxu/authorize')) {
    const tokenValid = await ensureSessionToken()
    if (!tokenValid) {
      console.log('[Background] Failed to ensure session token')
      return null
    }
  }

  // 优先使用缓存的 host，失败后再尝试全部
  // singleHost 模式(add 等非幂等操作专用):只试一个 host,避免同一请求
  // 先后发往 127.0.0.1 与 localhost 造成重复提交;两个地址本就指向本机同一进程,
  // 第一个不通时第二个几乎必然不通,单 host 的容错损失可忽略
  const allHosts = ['127.0.0.1', 'localhost']
  const hosts = options.singleHost
    ? [cachedHost || '127.0.0.1']
    : (cachedHost ? [cachedHost, ...allHosts.filter(h => h !== cachedHost)] : allHosts)

  for (const h of hosts) {
    try {
      const url = `http://${h}:${CHANNEL_PORT}${path}`
      const headers = { ...options.headers }

      // 只在非认证相关的请求中添加 Authorization header
      if (sessionToken && !path.startsWith('/lerxu/handshake') && !path.startsWith('/lerxu/authorize')) {
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
        // 记录程序启动时间:WS 不可用但 HTTP 可用时,以 HTTP 认证成功为准
        if (!wsAuthTime) {
          wsAuthTime = Date.now()
          try {
            chrome.storage.local.set({ [WS_AUTH_TIME_KEY]: wsAuthTime }, () => {})
          } catch (e) {}
        }
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
        const url = `http://${h}:${CHANNEL_PORT}/lerxu/health`
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
    const result = await channelRequest('ext-config-get')
    if (!result || !result.ok || !result.data) {
      return
    }
    const data = result.data
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
  // 快路径:WS 已认证连接即视为程序在线(连接层已完成 challenge 认证,零网络开销)
  if (wsSocket && wsSocket.readyState === WebSocket.OPEN && wsAuthenticated) {
    // WS 已确认程序在线:若内存中仍残留离线标记(异步恢复竞态/瞬断未清除),
    // 立即清除,否则陈旧的 clientOfflineSince 会让接管决策永久放行浏览器下载
    if (!lastConnectionCheck.connected || clientOfflineSince > 0) {
      notifyConnectionChange(true)
    }
    lastConnectionCheck.connected = true
    lastConnectionCheck.lastCheckTime = Date.now()
    lastOnlineAt = Date.now()
    return true
  }
  const now = Date.now()
  if (now - lastConnectionCheck.lastCheckTime < 1000) {
    return !!lastConnectionCheck.connected
  }
  try {
    const result = await channelRequest('health', undefined, 800)
    return !!(result && result.ok)
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
    // 禁止透传 Origin：浏览器对跨域 GET 不发送 Origin，伪造 Origin
    // （与目标 Host 不同源）是 CDN/WAF 判定伪造请求的特征，导致 403。
    if (/^origin$/i.test(k)) return ''
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

// add 请求在途去重:同一 URL+referer 的请求并发时只发一次,复用同一 Promise。
// 防止以下场景的重复提交:
//   - WS 发送成功但响应超时(5s)回退 HTTP,服务器两侧都收到
//   - 多触发源并发(onCreated/onDeterminingFilename、content script 与接管逻辑)
// add 是非幂等操作,重复提交会创建重复任务,"宁缺毋滥"——请求结束后立即移除,
// 顺序重发由 recentTakeoverUrls 的窗口放行兜底。
const inflightAdds = new Map()

const addUri = async (url, referer, suggestedFilename, extraHeaders) => {
  try {
    // 快速失败:程序不在线(无 WS 且最近 health 探测失败)时不走 HTTP 认证
    // 兜底(ensureSessionToken→performAuthentication→2 host×1.5s 超时,可达 5~6s),
    // 立即返回 false,调用方直接回退浏览器下载,避免用户空等。
    // 注意:isClientAvailable 内部有 1s 缓存,不会给每次调用增加网络开销。
    if (!(await isClientAvailable())) {
      console.log('[Background] addUri skipped: client offline, url:', url)
      return false
    }
    const key = `${url}\n${referer || ''}`
    if (inflightAdds.has(key)) {
      return inflightAdds.get(key)
    }
    const task = (async () => {
      const baseHeaders = await getHeadersForUrl(url, referer)
      const headers = mergeHeaderLines(baseHeaders, extraHeaders)
      const payload = { url, referer, headers }
      // 如果有建议的文件名，添加到请求中
      if (suggestedFilename) {
        payload.suggestedFilename = suggestedFilename
      }
      // WS 主通道认证在连接层完成,无需 token 校验;HTTP 兜底由 tryChannel 内部处理
      const result = await channelRequest('add', payload)
      return !!(result && result.ok)
    })()
    inflightAdds.set(key, task)
    try {
      return await task
    } finally {
      inflightAdds.delete(key)
    }
  } catch (e) {
    return false
  }
}
const getHeadersForUrl = async (url, referer) => {
  const hs = ['X-Lerxu-Source: BrowserExtension']
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
  
  // 建立 WebSocket 长连接(连接层认证,重连由 wsConnect 内部退避处理)
  wsConnect()
  
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
    id: 'lerxu-download',
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
    const result = await channelRequest('locale', undefined, 2000)
    if (result && result.ok && result.data) {
      const data = result.data
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
    en: 'Download with Lerxu',
    zh_CN: '使用 Lerxu 下载',
    zh_TW: '使用 Lerxu 下載',
    ja: 'Lerxu でダウンロード',
    ko: 'Lerxu로 다운로드',
    es: 'Descargar con Lerxu',
    fr: 'Télécharger avec Lerxu',
    de: 'Mit Lerxu herunterladen',
    ru: 'Скачать с Lerxu'
  }
  
  const title = menuTexts[locale] || menuTexts.en
  
  chrome.contextMenus.update('lerxu-download', {
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
    channelRequest('tasks')
      .then((result) => {
        if (!result || !result.ok || !result.data) {
          sendResponse({ connected: false, downloadSpeed: 0, uploadSpeed: 0, totalSpeed: 0, tasks: [] })
        } else {
          const data = result.data
          sendResponse({
            connected: true,
            downloadSpeed: data.downloadSpeed || 0,
            uploadSpeed: data.uploadSpeed || 0,
            totalSpeed: data.totalSpeed || 0,
            tasks: data.tasks || []
          })
        }
      })
      .catch(() => {
        sendResponse({ connected: false, downloadSpeed: 0, uploadSpeed: 0, totalSpeed: 0, tasks: [] })
      })
    return true
  }
  
  if (msg && msg.type === 'connection') {
    channelRequest('health')
      .then(result => {
        sendResponse({ connected: !!(result && result.ok) })
      })
      .catch(() => {
        sendResponse({ connected: false })
      })
    return true
  }
  
  if (msg && msg.type === 'version') {
    channelRequest('version')
      .then((result) => {
        if (result && result.ok && result.data) {
          const version = result.data.version || ''
          sendResponse({ connected: true, version })
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
      // addUri 内部已有程序在线预检查(快路径,零网络开销),离线时立即返回
      // false 走浏览器下载,不会卡在 HTTP 认证兜底上
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
        const currentConfig = await channelRequest('ext-config-get', undefined, 3000)
        
        let excludeDomains = []
        if (currentConfig && currentConfig.ok && currentConfig.data && Array.isArray(currentConfig.data.excludeDomains)) {
          excludeDomains = currentConfig.data.excludeDomains
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
          const result = await channelRequest('ext-config-set', { excludeDomains }, 3000)
          
          if (result && result.ok) {
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
          const result = await channelRequest('ext-config-set', { excludeDomains }, 3000)
          
          if (result && result.ok) {
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
        const result = await channelRequest('ext-config-get', undefined, 3000)
        
        if (result && result.ok && result.data) {
          sendResponse({ excludeDomains: result.data.excludeDomains || [] })
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
        const result = await channelRequest('ext-config-set', { skipFileExtensions: [msg.fileType] }, 3000)
        
        if (result && result.ok) {
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
        const currentConfig = await channelRequest('ext-config-get', undefined, 3000)
        
        let skipFileExtensions = []
        if (currentConfig && currentConfig.ok && currentConfig.data) {
          console.log('[Background] Current config data:', currentConfig.data)
          if (Array.isArray(currentConfig.data.skipFileExtensions)) {
            skipFileExtensions = currentConfig.data.skipFileExtensions
          }
        }
        
        // 合并并去重（与程序逻辑一致）
        const allExtensions = [...skipFileExtensions, ...msg.fileTypes]
        const uniqueExtensions = Array.from(new Set(allExtensions))
        
        console.log('[Background] Sending skipFileExtensions:', uniqueExtensions)
        
        const result = await channelRequest('ext-config-set', { skipFileExtensions: uniqueExtensions }, 3000)
        
        console.log('[Background] POST result:', result)
        
        if (result && result.ok) {
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
    // addUri 内部已有程序在线预检查(快路径),离线时立即返回 false 走浏览器下载
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

// 同步快速决策(由 decideTakeover 的缓存共享保证副作用只执行一次):
// 命中这些场景时无需等待异步配置即可确定接管/放行,把决策延迟从
// "storage 恢复 + 规则遍历"压缩到同步判读,是接管"快"的关键:
//   - 主动回退给浏览器的下载 → 放行(防止 取消→重下→取消 循环)
//   - 临时禁用接管(快捷键) → 放行
//   - webRequest 预检测已知的 attachment 下载 → 立即接管
//     这是最常见的下载形态(服务器 Content-Disposition 触发),
//     onHeadersReceived 已在响应头到达时记录 URL,这里直接命中,
//     不必等待 extConfigReady,浏览器下载项一创建就立刻取消
const quickTakeoverDecision = (item) => {
  if (!item || typeof item.id !== 'number') return 'skip'
  const url = item.url || ''
  if (!url || !/^https?:/i.test(url)) return 'skip'
  if (fallbackBrowserUrls.has(url) || recentTakeoverUrls.has(url)) {
    // fallbackBrowserUrls: 主动回退窗口内(10s)的下载项一律放行,不一次性消费,
    // 覆盖并行创建的多个回退下载项,防止"回退下载再次被接管"的循环
    // recentTakeoverUrls: 最近被扩展接管/发送过的 URL 放行,切断发送循环
    return 'skip'
  }
  if (cachedAutoHijackDisabled) return 'skip'
  if (pendingDownloadUrls.has(url)) {
    pendingDownloadUrls.delete(url)
    return 'intercept'
  }
  return null
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

  // 同步快速路径:可立即确定的场景不进入异步决策
  const quick = quickTakeoverDecision(item)
  if (quick) {
    const quickDecision = Promise.resolve(quick)
    takeoverDecisions.set(item.id, quickDecision)
    quickDecision.finally(() => {
      setTimeout(() => takeoverDecisions.delete(item.id), 30000)
    })
    return quickDecision
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
    // 窗口期内(10s)持续保护,不一次性消费,覆盖并行创建的多个回退下载项
    if (fallbackBrowserUrls.has(url)) {
      return 'skip'
    }

    // 最近被扩展接管/发送过的 URL:放行,切断"接管→发送失败→回退→再接管"循环
    if (recentTakeoverUrls.has(url)) {
      return 'skip'
    }

    // 临时禁用接管(缓存值,同步判断)
    if (cachedAutoHijackDisabled) {
      return 'skip'
    }

    // 程序必须在线才接管。程序未启动时,浏览器下载在正常进行,不能取消
    // (取消 → 任务丢失/进度清零,用户不可接受)。此处直接放行,让浏览器
    // 完成下载,避免 cancel→resume 的动作颠簸。
    if (!(await isClientAvailable())) {
      console.log('[Background] Takeover skipped (client offline) in decideTakeover, keeping browser download, id:', item.id, 'url:', url)
      return 'skip'
    }
    keepSwAlive()

    // 进度保护:若下载项创建于程序离线期间(即程序未启动/离线时浏览器已开始
    // 下载),接管会取消浏览器下载导致已下载进度丢失。此类下载一律放行让浏览器
    // 完成,不再抢回应用。
    // 两个依据,互补覆盖两种场景:
    //   a) wsAuthTime:程序本次启动时间(WS 认证成功时间)。下载项创建早于它
    //      → 创建于程序启动前,接管必丢进度 → 放行。覆盖"程序从未在线"场景
    //      (此时 clientOfflineSince 为 0,无离线记录)。
    //   b) 离线窗口 [clientOfflineSince, lastOnlineAt):下载项创建于程序离线
    //      期间(程序已确认在线之前)→ 浏览器正在下载,接管丢进度 → 放行。
    //      注意:必须同时要求 createdAt < lastOnlineAt —— clientOfflineSince
    //      可能因异步恢复竞态残留为陈旧值,若只判断 createdAt >= clientOfflineSince,
    //      程序在线后创建的所有下载都会被误判为"离线期间创建"而永久放行。
    // 注意:item.startTime 是 ISO 字符串,部分浏览器可能缺失,缺失时跳过该判断
    if (item.startTime) {
      try {
        const createdAt = new Date(item.startTime).getTime()
        if (!Number.isNaN(createdAt)) {
          const startedWhileClientOffline =
            clientOfflineSince > 0 && lastOnlineAt > 0 &&
            createdAt >= clientOfflineSince && createdAt < lastOnlineAt
          if ((wsAuthTime > 0 && createdAt < wsAuthTime) || startedWhileClientOffline) {
            console.log('[Background] Takeover skipped (download started before/while client was offline), keeping browser download, id:', item.id, 'url:', url)
            return 'skip'
          }
        }
      } catch (e) {}
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

// 保活:MV3 Service Worker 空闲 30s 即被终止,接管链路跨多个异步回调
// (cancel/erase/addUri 的 fetch),期间 SW 若被回收则 addUri 永远无法送达,
// 任务既不在浏览器也不在应用,表现为"接管后任务消失"。每次 await 后调用
// chrome.runtime API 可重置 SW 空闲计时器,保证整条链路执行完成。
const keepSwAlive = () => {
  try { chrome.runtime.getPlatformInfo() } catch (e) {}
}

// 执行接管:先确认程序在线(不在线绝不 cancel,保留浏览器下载进度),取消成功才转交应用。
// 接管优先级(从高到低):
//   1. 程序在线 + cancel 成功 + addUri 成功 → erase 清理浏览器记录,应用下载
//   2. 程序在线 + cancel 成功 + addUri 失败 → 恢复原浏览器下载项(不重下,进度保留)
//   3. 程序不在线 → 不 cancel,浏览器下载继续,进度保留
// 关键点:addUri 失败路径永远不 erase 原下载项,也不重新触发下载,避免
// "抢过来→发送失败→重下→再抢" 的循环与进度清零。fallbackBrowserUrls 仅用于
// 保护"我们主动 downloadViaBrowser"的下载项,此处已不再需要。
const executeTakeover = async (item) => {
  if (handledDownloadIds.has(item.id)) {
    return
  }
  handledDownloadIds.add(item.id)

  const url = item.url || ''
  try {
    keepSwAlive()
    // 前置检查:程序必须在线才接管。程序未启动/引擎未就绪时,浏览器下载
    // 正在正常进行(用户已看到进度),绝不能取消,否则进度直接丢失。
    if (!(await isClientAvailable())) {
      console.log('[Background] Takeover skipped: client offline, keeping browser download, id:', item.id, 'url:', url)
      if (extConfig.interceptAllDownloads && typeof item.id === 'number') {
        activeBrowserDownloads.add(item.id)
        setDownloadUiEnabled(true)
      }
      return
    }
    keepSwAlive()
    // 复查进度:cancel 前下载可能已接近完成(决策期间的网络消耗),此时
    // 取消再交给应用 = 进度清零。已下载超过一半就放行,让浏览器完成它。
    try {
      const current = await chrome.downloads.search({ id: item.id })
      const latest = current && current[0]
      if (latest && latest.state === 'complete') {
        console.log('[Background] Takeover skipped: download already complete, id:', item.id, 'url:', url)
        if (extConfig.interceptAllDownloads && typeof item.id === 'number') {
          activeBrowserDownloads.add(item.id)
          setDownloadUiEnabled(true)
        }
        return
      }
      if (latest && latest.state === 'in_progress' && latest.totalBytes > 0) {
        const ratio = (latest.bytesReceived || 0) / latest.totalBytes
        if (ratio > 0.5) {
          console.log(`[Background] Takeover skipped: ${(ratio * 100).toFixed(0)}% already downloaded by browser, id:`, item.id, 'url:', url)
          if (extConfig.interceptAllDownloads && typeof item.id === 'number') {
            activeBrowserDownloads.add(item.id)
            setDownloadUiEnabled(true)
          }
          return
        }
      }
    } catch (e) {}
    keepSwAlive()
    // 取消浏览器下载,确认取消成功才继续接管
    const cancelOk = await new Promise((resolve) => {
      chrome.downloads.cancel(item.id, () => {
        resolve(!chrome.runtime.lastError)
      })
    })
    keepSwAlive()
    if (!cancelOk) {
      // 取消失败:下载可能已完成(小文件/高速网络),浏览器已持有文件。
      // 放弃接管避免应用重复下载;恢复气泡让用户看到浏览器侧的真实进度
      console.log('[Background] Takeover skipped: download already finished, id:', item.id, 'url:', url)
      if (extConfig.interceptAllDownloads && typeof item.id === 'number') {
        activeBrowserDownloads.add(item.id)
        setDownloadUiEnabled(true)
      }
      return
    }
    console.log('[Background] Takeover canceled browser download, id:', item.id, 'url:', url)

    const addResult = await addUri(url, item.referrer, item.filename)
    keepSwAlive()
    // 无论 add 成功与否,标记"最近处理过的 URL":此后窗口期内(15s)浏览器侧
    // 再出现该 URL 的下载项一律放行,彻底切断"接管→发送→失败→回退→再接管→再发送"循环
    recentTakeoverUrls.set(url, Date.now())
    if (addResult) {
      console.log('[Background] Takeover success, task sent to client:', url)
      // 接管成功:取消完成后彻底移除浏览器下载记录
      await new Promise((resolve) => {
        chrome.downloads.erase({ id: item.id }, () => {
          // 下载可能已被自动清除,读取 lastError 防止 Unchecked 警告
          void chrome.runtime.lastError
          resolve()
        })
      })
      keepSwAlive()
    } else {
      // 发送失败:恢复原下载项,保留已下载进度,而不是重新下载清零进度。
      // 浏览器已持有部分文件,resume 会从断点继续,等于回滚到"未接管"状态。
      console.log('[Background] Takeover addUri failed, resuming original browser download:', url)
      await new Promise((resolve) => {
        chrome.downloads.resume(item.id, () => {
          void chrome.runtime.lastError
          resolve()
        })
      })
      keepSwAlive()
      if (extConfig.interceptAllDownloads && typeof item.id === 'number') {
        activeBrowserDownloads.add(item.id)
        setDownloadUiEnabled(true)
      }
    }
  } catch (e) {
    // 任何异常:恢复原下载项,进度保留,绝不重新触发下载
    console.log('[Background] Takeover failed, restoring browser download:', url, e)
    try {
      await new Promise((resolve) => {
        chrome.downloads.resume(item.id, () => {
          void chrome.runtime.lastError
          resolve()
        })
      })
    } catch (e2) {}
    keepSwAlive()
    if (extConfig.interceptAllDownloads && typeof item.id === 'number') {
      activeBrowserDownloads.add(item.id)
      setDownloadUiEnabled(true)
    }
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
// 注意:listener 返回 true 后浏览器会等待 suggest() 被调用,因此无论接管还是
// 放行都必须最终调用 suggest(),否则下载流程会挂起等待。
// 接管分支的下载已被 cancel,suggest 会报 Download must be in progress,
// try/catch 捕获不了 API 层的 runtime.lastError,必须显式读取以清除标记
// (否则控制台打印 Unchecked runtime.lastError 噪音)
try {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const finishSuggest = () => {
      try {
        suggest()
      } catch (e) {}
      // 读取 lastError 清除错误标记,结果无害
      void chrome.runtime.lastError
    }
    decideTakeover(item).then((decision) => {
      applyUiForDecision(item, decision)
      if (decision === 'intercept') {
        executeTakeover(item)
      }
      // 接管分支的下载已被 cancel,suggest 无效但无害;
      // 不放行时缺省调用会导致浏览器等待文件名,下载挂起
      finishSuggest()
    }).catch(() => {
      finishSuggest()
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
