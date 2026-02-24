import { isEmpty } from 'lodash'
import axios from 'axios'
import { MAX_BT_TRACKER_LENGTH, ONE_SECOND, PROXY_SCOPES } from '@shared/constants'
import { getGithubUrlsWithMirrors, isGithubUrl } from './github-mirror'

export const convertToAxiosProxy = (proxyServer = '') => {
  if (!proxyServer) {
    return
  }

  const url = new URL(proxyServer)
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
}

export const fetchBtTrackerFromSource = async (source, proxyConfig = {}, githubMirrorConfig = {}) => {
  if (isEmpty(source)) {
    return []
  }

  const now = Date.now()
  const { enable, server, scope = [] } = proxyConfig
  const { useGithubMirror = false, githubMirrorUrls = [] } = githubMirrorConfig
  const proxy = enable && server && scope.includes(PROXY_SCOPES.UPDATE_TRACKERS)
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
        const response = await axios.get(`${tryUrl}?t=${now}`, {
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
