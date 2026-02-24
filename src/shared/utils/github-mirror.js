/**
 * GitHub 镜像加速工具
 * 用于将 GitHub URL 转换为镜像 URL
 */

/**
 * 检查 URL 是否为 GitHub URL
 * @param {string} url - 要检查的 URL
 * @returns {boolean}
 */
export function isGithubUrl (url) {
  if (!url || typeof url !== 'string') {
    return false
  }
  const urlLower = url.toLowerCase()
  return urlLower.includes('github.com') ||
         urlLower.includes('raw.githubusercontent.com') ||
         urlLower.includes('github.io')
}

/**
 * 将 GitHub URL 转换为镜像 URL
 * @param {string} url - 原始 GitHub URL
 * @param {string} mirrorUrl - 镜像站点 URL（不含 https://）
 * @returns {string} - 转换后的镜像 URL
 */
export function convertToMirrorUrl (url, mirrorUrl) {
  if (!url || !mirrorUrl) {
    return url
  }

  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()

    // 确保镜像 URL 格式正确
    const cleanMirrorUrl = mirrorUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

    // GitHub 主站 URL
    if (hostname === 'github.com') {
      // 对于 release 下载链接，使用特殊处理
      if (urlObj.pathname.includes('/releases/download/')) {
        return `https://${cleanMirrorUrl}/${url}`
      }
      // 对于其他 GitHub 链接
      return url.replace('https://github.com', `https://${cleanMirrorUrl}/https://github.com`)
    }

    // GitHub Raw 内容 URL
    if (hostname === 'raw.githubusercontent.com') {
      return url.replace('https://raw.githubusercontent.com', `https://${cleanMirrorUrl}/https://raw.githubusercontent.com`)
    }

    // GitHub Pages URL (github.io)
    if (hostname.endsWith('.github.io')) {
      return url.replace(/^https:\/\/([^/]+\.github\.io)/, `https://${cleanMirrorUrl}/https://$1`)
    }

    return url
  } catch (e) {
    console.warn('[GitHub Mirror] Failed to convert URL:', url, e)
    return url
  }
}

/**
 * 使用多个镜像站点尝试访问 GitHub 资源
 * @param {string} url - 原始 GitHub URL
 * @param {Array<string>} mirrorUrls - 镜像站点列表
 * @param {boolean} useGithubMirror - 是否启用镜像
 * @returns {Array<string>} - 返回 URL 列表（包含原始 URL 和镜像 URL）
 */
export function getGithubUrlsWithMirrors (url, mirrorUrls = [], useGithubMirror = true) {
  if (!url) {
    return []
  }

  // 如果不是 GitHub URL，直接返回原始 URL
  if (!isGithubUrl(url)) {
    return [url]
  }

  const urls = []

  // 如果启用镜像且有镜像列表，先添加镜像 URL
  if (useGithubMirror && Array.isArray(mirrorUrls) && mirrorUrls.length > 0) {
    mirrorUrls.forEach(mirrorUrl => {
      if (mirrorUrl && typeof mirrorUrl === 'string') {
        const mirrorUrlConverted = convertToMirrorUrl(url, mirrorUrl)
        if (mirrorUrlConverted && mirrorUrlConverted !== url) {
          urls.push(mirrorUrlConverted)
        }
      }
    })
  }

  // 最后添加原始 URL 作为后备
  urls.push(url)

  return urls
}

/**
 * 尝试使用镜像 URL 获取资源（带重试机制）
 * @param {string} url - 原始 GitHub URL
 * @param {Object} config - 配置对象
 * @param {Array<string>} config.mirrorUrls - 镜像站点列表
 * @param {boolean} config.useGithubMirror - 是否启用镜像
 * @param {Function} fetchFn - 获取资源的函数
 * @returns {Promise<any>} - 返回获取的资源
 */
export async function fetchWithGithubMirror (url, config = {}, fetchFn) {
  const { mirrorUrls = [], useGithubMirror = true } = config

  if (!fetchFn || typeof fetchFn !== 'function') {
    throw new Error('fetchFn is required and must be a function')
  }

  const urls = getGithubUrlsWithMirrors(url, mirrorUrls, useGithubMirror)
  let lastError = null

  // 依次尝试每个 URL
  for (const tryUrl of urls) {
    try {
      const result = await fetchFn(tryUrl)
      return result
    } catch (error) {
      lastError = error
      console.warn(`[GitHub Mirror] Failed to fetch from ${tryUrl}:`, error.message)
      // 继续尝试下一个 URL
    }
  }

  // 所有 URL 都失败，抛出最后一个错误
  throw lastError || new Error('Failed to fetch resource from all URLs')
}

/**
 * 获取 GitHub API URL 的镜像版本
 * @param {string} apiUrl - GitHub API URL
 * @param {string} mirrorUrl - 镜像站点 URL
 * @returns {string} - 镜像 API URL
 */
export function getGithubApiMirrorUrl (apiUrl, mirrorUrl) {
  if (!apiUrl || !mirrorUrl) {
    return apiUrl
  }

  try {
    const cleanMirrorUrl = mirrorUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

    // GitHub API URL 通常是 https://api.github.com/...
    if (apiUrl.includes('api.github.com')) {
      return apiUrl.replace('https://api.github.com', `https://${cleanMirrorUrl}/https://api.github.com`)
    }

    return apiUrl
  } catch (e) {
    console.warn('[GitHub Mirror] Failed to convert API URL:', apiUrl, e)
    return apiUrl
  }
}

/**
 * 从配置中获取 GitHub 镜像设置
 * @param {Object} config - 应用配置对象
 * @returns {Object} - 返回 { useGithubMirror, mirrorUrls }
 */
export function getGithubMirrorConfig (config) {
  if (!config || typeof config !== 'object') {
    return {
      useGithubMirror: false,
      mirrorUrls: []
    }
  }

  const useGithubMirror = config.useGithubMirror !== undefined ? config.useGithubMirror : true
  const mirrorUrls = Array.isArray(config.githubMirrorUrls) ? config.githubMirrorUrls : []

  return {
    useGithubMirror,
    mirrorUrls
  }
}
