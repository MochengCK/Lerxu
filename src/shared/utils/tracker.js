import { isEmpty } from 'lodash'
import axios from 'axios'
import { MAX_BT_TRACKER_LENGTH, ONE_SECOND, PROXY_SCOPES } from '@shared/constants'
import { getGithubUrlsWithMirrors, isGithubUrl } from './github-mirror'

export const convertToAxiosProxy = (proxyServer = '') => {
  if (!proxyServer) {
    return undefined
  }

  try {
    // 兼容无协议前缀的代理地址（如 127.0.0.1:7890）
    let target = proxyServer
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target)) {
      target = `http://${target}`
    }
    const url = new URL(target)
    const { username, password, protocol = 'http:', hostname, port } = url

    let result = {
      protocol: protocol.replace(':', ''),
      host: hostname,
      port
    }

    const auth = username || password
      ? {
        username,
        password
      }
      : undefined

    if (auth) {
      result = {
        ...result,
        auth
      }
    }

    return result
  } catch (e) {
    console.warn('[Tracker] Invalid proxy server config:', proxyServer, e.message)
    return undefined
  }
}

/**
 * 以「主进程 Node adapter」方式获取单个 URL 文本，使 axios proxy 配置真正生效
 * （renderer 的 XHR adapter 会忽略 proxy 选项，导致 Tracker 源请求直连）。
 * 供 main 进程 ipc handler 调用。
 */
export const fetchTrackerSourceText = async (url, proxyConfig = {}) => {
  const { enable, mode, server, scope = [] } = proxyConfig
  const proxyEnabled = enable !== undefined ? enable : (mode === 'custom')
  const proxy = proxyEnabled && server && scope.includes(PROXY_SCOPES.UPDATE_TRACKERS)
    ? convertToAxiosProxy(server)
    : undefined
  const response = await axios.get(url, {
    responseType: 'text',
    timeout: 15 * ONE_SECOND,
    proxy
  })
  return `${response && response.data ? response.data : ''}`
}

export const fetchBtTrackerFromSource = async (source, proxyConfig = {}, githubMirrorConfig = {}) => {
  if (isEmpty(source)) {
    return []
  }

  const now = Date.now()
  const { enable, mode, server, scope = [] } = proxyConfig
  const { useGithubMirror = false, githubMirrorUrls = [] } = githubMirrorConfig
  // 兼容新旧配置：新配置用 mode 字段，旧配置可能用 enable 字段
  const proxyEnabled = enable !== undefined ? enable : (mode === 'custom')
  const proxy = proxyEnabled && server && scope.includes(PROXY_SCOPES.UPDATE_TRACKERS)
    ? convertToAxiosProxy(server)
    : undefined

  // 处理每个源 URL，如果是 GitHub URL 则尝试使用镜像
  const promises = source.map(async (url) => {
    const urls = isGithubUrl(url)
      ? getGithubUrlsWithMirrors(url, githubMirrorUrls, useGithubMirror)
      : [url]

    // 依次尝试每个 URL（镜像 + 原始）
    for (const tryUrl of urls) {
      try {
        // 源 URL 可能自带查询参数，需用 & 拼接而非无条件追加 ?t=
        const cacheBustUrl = tryUrl.includes('?')
          ? `${tryUrl}&t=${now}`
          : `${tryUrl}?t=${now}`
        const response = await axios.get(cacheBustUrl, {
          timeout: 30 * ONE_SECOND,
          proxy
        })
        return response.data
      } catch (error) {
        console.warn(`[Tracker] Failed to fetch from ${tryUrl}:`, error.message)
        // 继续尝试下一个 URL
      }
    }

    // 所有 URL 都失败，返回 null
    return null
  })

  const results = await Promise.allSettled(promises)
  const values = results
    .filter(item => item.status === 'fulfilled' && item.value !== null)
    .map(item => item.value)
  const result = [...new Set(values)]
  return result
}

export const convertTrackerDataToLine = (arr = []) => {
  const result = arr.join('\r\n').replace(/^\s*[\r\n]/gm, '').trim()
  return result
}

export const convertTrackerDataToComma = (arr = []) => {
  const result = convertTrackerDataToLine(arr).replace(/(?:\r\n|\r|\n)/g, ',').trim()
  return result
}

/**
 * Deduplicate individual tracker URLs from raw text responses.
 * Each element in `data` is a raw string that may contain multiple tracker
 * URLs separated by newlines or commas (as returned by tracker-list sources).
 * Returns a flat array of unique, trimmed tracker URLs.
 */
export const deduplicateTrackers = (data = []) => {
  const seen = new Set()
  const result = []
  data.forEach(text => {
    if (typeof text !== 'string') return
    text.split(/[\r\n,]+/).forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed)
        result.push(trimmed)
      }
    })
  })
  return result
}

/**
 * Deduplicate tracker URLs in a comma/newline-separated string.
 * Returns a comma-separated string with duplicates removed, preserving
 * first-occurrence order.  Use this on any `bt-tracker` config value
 * before it reaches the engine so the engine never wastes announce
 * cycles on duplicate trackers.
 */
export const deduplicateTrackerString = (str = '') => {
  if (!str) return ''
  const seen = new Set()
  const result = []
  String(str).split(/[\r\n,]+/).forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      result.push(trimmed)
    }
  })
  return result.join(',')
}

export const reduceTrackerString = (str = '') => {
  if (str.length <= MAX_BT_TRACKER_LENGTH) {
    return str
  }

  const subStr = str.substring(0, MAX_BT_TRACKER_LENGTH)
  const index = subStr.lastIndexOf(',')
  if (index === -1) {
    return subStr
  }

  const result = subStr.substring(0, index)
  return result
}
