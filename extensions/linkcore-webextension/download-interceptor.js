/**
 * download-interceptor.js — DOM 层下载拦截
 * ==========================================
 *
 * 在浏览器发起 HTTP 请求之前就拦截下载行为，防止浏览器创建下载项。
 *
 * 拦截策略:
 *   1. <a download> 属性 — 浏览器原生下载标记
 *   2. <a href="file.ext"> — 链接到已知下载扩展名
 *   3. <a> 的 Alt+Click — 用户强制下载 (浏览器行为)
 *
 * 拦截后:
 *   - preventDefault() + stopPropagation() 阻止浏览器导航
 *   - 通过 chrome.runtime.sendMessage 发送到 background.js → LinkCore
 *   - 如果 LinkCore 不可用，回退到浏览器原生下载
 *
 * 注意: 服务器端通过 Content-Disposition: attachment 触发的下载
 *       仍由 background.js 的 downloads.onCreated + webRequest 三层兜底处理。
 */

(function () {
  'use strict'

  // ─── 配置缓存 ──────────────────────────────────────────
  // 从 chrome.storage 同步缓存的拦截配置，避免每次点击都异步等待
  let cachedInterceptEnabled = false
  let cachedSilentDownload = false
  let cachedSkipExtensions = []
  let cachedExcludeDomains = []
  let cachedMinFileSize = 0
  let cachedAutoHijackDisabled = false

  // 从 storage 加载配置
  const loadConfig = () => {
    try {
      chrome.storage.local.get([
        'interceptAllDownloads',
        'silentDownload',
        'skipFileExtensions',
        'excludeDomains',
        'minFileSize',
        'autoHijackTemporarilyDisabled'
      ], (res) => {
        if (res) {
          cachedInterceptEnabled = !!res.interceptAllDownloads
          cachedSilentDownload = !!res.silentDownload
          cachedSkipExtensions = Array.isArray(res.skipFileExtensions) ? res.skipFileExtensions : []
          cachedExcludeDomains = Array.isArray(res.excludeDomains) ? res.excludeDomains : []
          cachedMinFileSize = Number(res.minFileSize) || 0
          cachedAutoHijackDisabled = !!res.autoHijackTemporarilyDisabled
        }
      })
    } catch (e) {}
  }

  // 初始加载
  loadConfig()

  // 监听配置变化
  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.interceptAllDownloads) cachedInterceptEnabled = !!changes.interceptAllDownloads.newValue
      if (changes.silentDownload) cachedSilentDownload = !!changes.silentDownload.newValue
      if (changes.skipFileExtensions) cachedSkipExtensions = Array.isArray(changes.skipFileExtensions.newValue) ? changes.skipFileExtensions.newValue : []
      if (changes.excludeDomains) cachedExcludeDomains = Array.isArray(changes.excludeDomains.newValue) ? changes.excludeDomains.newValue : []
      if (changes.minFileSize) cachedMinFileSize = Number(changes.minFileSize.newValue) || 0
      if (changes.autoHijackTemporarilyDisabled) cachedAutoHijackDisabled = !!changes.autoHijackTemporarilyDisabled.newValue
    })
  } catch (e) {}

  // ─── 工具函数 ──────────────────────────────────────────

  // 常见下载文件扩展名（不含 .）
  const DOWNLOAD_EXTS = new Set([
    // 压缩包
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'tbz2',
    // 安装包
    'exe', 'msi', 'msp', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'snap', 'flatpak',
    // 镜像
    'iso', 'img', 'vmdk', 'ova', 'ovf',
    // 视频
    'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'ts', 'm2ts', 'vob',
    // 音频
    'mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'wma', 'ape', 'mka',
    // 文档
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'epub', 'mobi', 'azw3',
    // 程序/脚本
    'apk', 'aab', 'xapk', 'jar', 'war', 'ear', 'whl', 'crx', 'xpi', 'oxps', 'jar',
    // 其他
    'torrent', 'mpd', 'm3u8', 'pls', 'cue', 'bin', 'dat', 'db', 'sqlite', 'csv', 'json', 'xml'
  ])

  // 从 URL 提取文件扩展名
  const getExtFromUrl = (url) => {
    try {
      const u = new URL(url)
      const path = u.pathname || ''
      const last = path.split('/').pop() || ''
      const dotIdx = last.lastIndexOf('.')
      if (dotIdx <= 0) return ''
      return last.slice(dotIdx + 1).toLowerCase()
    } catch (e) {
      return ''
    }
  }

  // 判断链接是否会触发下载
  const isDownloadLink = (a) => {
    // 1. <a download> 属性 — 最明确的下载信号
    if (a.hasAttribute('download')) return true

    // 2. href 指向已知下载扩展名
    const href = a.getAttribute('href') || ''
    if (!href) return false

    // 解析 href（可能是相对路径）
    let absUrl
    try {
      absUrl = new URL(href, window.location.href).href
    } catch (e) {
      return false
    }

    const ext = getExtFromUrl(absUrl)
    if (ext && DOWNLOAD_EXTS.has(ext)) return true

    return false
  }

  // 检查域名是否在排除列表
  const isDomainExcluded = (url) => {
    if (!cachedExcludeDomains || cachedExcludeDomains.length === 0) return false
    try {
      const hostname = new URL(url).hostname
      return cachedExcludeDomains.some(d => {
        const domain = d.toLowerCase().trim()
        return hostname.toLowerCase().includes(domain)
      })
    } catch (e) {
      return false
    }
  }

  // 检查文件扩展名是否在排除列表
  const isExtExcluded = (url) => {
    if (!cachedSkipExtensions || cachedSkipExtensions.length === 0) return false
    const ext = getExtFromUrl(url)
    return ext && cachedSkipExtensions.includes(ext)
  }

  // 获取链接的绝对 URL
  const getAbsUrl = (a) => {
    const href = a.getAttribute('href') || ''
    if (!href) return ''
    try {
      return new URL(href, window.location.href).href
    } catch (e) {
      return ''
    }
  }

  // ─── 核心拦截逻辑 ──────────────────────────────────────

  const handleDownloadClick = (event, link) => {
    const url = getAbsUrl(link)
    if (!url || !/^https?:/i.test(url)) return false

    // 如果临时禁用了自动接管，放行
    if (cachedAutoHijackDisabled) return false

    // 域名排除
    if (isDomainExcluded(url)) return false

    // 扩展名排除
    if (isExtExcluded(url)) return false

    // 阻止浏览器原生行为 — 这是最关键的一步！
    // preventDefault 阻止导航/下载，stopPropagation 阻止其他监听器
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    // 发送到 background.js → LinkCore
    const suggestedFilename = link.getAttribute('download') || ''
    const referer = window.location.href

    chrome.runtime.sendMessage({
      type: 'addUriFromContent',
      url: url,
      referer: referer,
      suggestedFilename: suggestedFilename
    }, (response) => {
      if (!response || !response.ok) {
        // LinkCore 不可用，回退到浏览器下载
        // 使用 <a download> 的方式重新触发，避免被拦截
        const fallbackLink = document.createElement('a')
        fallbackLink.href = url
        fallbackLink.download = suggestedFilename || ''
        fallbackLink.style.display = 'none'
        document.body.appendChild(fallbackLink)
        fallbackLink.click()
        setTimeout(() => {
          try { document.body.removeChild(fallbackLink) } catch (e) {}
        }, 100)
      }
    })

    return true // 表示已拦截
  }

  // ─── 事件监听 ──────────────────────────────────────────

  // 捕获阶段拦截 click 事件 — 在所有其他监听器之前执行
  document.addEventListener('click', (event) => {
    // 拦截功能未开启时不处理
    if (!cachedInterceptEnabled) return

    // Alt+Click 是浏览器的"另存为"快捷键，即使没有 download 属性也触发下载
    // 但我们不拦截 Alt+Click，因为用户明确选择了浏览器下载
    if (event.altKey) return

    // 只处理鼠标左键和中键
    if (event.button !== 0 && event.button !== 1) return

    // 修饰键组合（Ctrl/Cmd+Click 打开新标签页）不拦截
    if (event.ctrlKey || event.metaKey) return

    // Shift+Click 可能是用户用快捷键切换接管模式，不拦截
    if (event.shiftKey) return

    // 找到最近的 <a> 祖先
    const link = event.target.closest('a')
    if (!link) return

    // 检查是否是下载链接
    if (!isDownloadLink(link)) return

    handleDownloadClick(event, link)
  }, true) // true = 捕获阶段，在目标阶段之前执行

  // 辅助函数：确保音频/视频/图片等媒体类型不被误判为下载
  // （它们有 <a> 链接但应该由浏览器内联播放）
  // isDownloadLink 只检查 download 属性和文件扩展名
  // .mp4/.mp3 等扩展名的链接如果带 download 属性会被拦截，
  // 如果不带 download 属性但扩展名匹配也会被拦截 — 这是期望行为，
  // 因为用户通常希望用下载管理器下载这些文件

  // ─── 监听来自 background.js 的配置更新通知 ─────────────
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'extConfigUpdated') {
        loadConfig()
      }
      if (msg && msg.type === 'autoHijackToggled') {
        cachedAutoHijackDisabled = !!msg.disabled
      }
    })
  } catch (e) {}
})()
