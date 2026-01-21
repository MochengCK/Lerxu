(function () {
const matchHotkey = (event) => {
  if (!event) return false
  if (event.shiftKey) return true
  const key = (event.key || '').toLowerCase()
  return key === 'shift'
}

const sendToggleAutoHijackOverride = () => {
  try {
    chrome.runtime.sendMessage({ type: 'shiftHotkeyTriggered' }, () => { })
  } catch (e) {
  }
}

const buttonLocaleTexts = {
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

const normalizeButtonLocale = (locale) => {
  const s = `${locale || ''}`.toLowerCase()
  if (!s) return ''
  if (s.startsWith('zh-cn') || s.startsWith('zh_cn')) return 'zh_CN'
  if (s.startsWith('zh-tw') || s.startsWith('zh_tw')) return 'zh_TW'
  if (s.startsWith('ja')) return 'ja'
  if (s.startsWith('ko')) return 'ko'
  if (s.startsWith('es')) return 'es'
  if (s.startsWith('fr')) return 'fr'
  if (s.startsWith('de')) return 'de'
  if (s.startsWith('ru')) return 'ru'
  if (s.startsWith('en')) return 'en'
  return ''
}

const applyClientLocaleToButton = (btn) => {
  try {
    if (!chrome || !chrome.storage || !chrome.storage.local) return
    chrome.storage.local.get(['browserLocale'], (result) => {
      const raw = result && result.browserLocale ? result.browserLocale : ''
      const direct = buttonLocaleTexts[raw]
      const key = direct ? raw : normalizeButtonLocale(raw)
      const text = buttonLocaleTexts[key]
      if (text) {
        btn.title = text
      }
    })
  } catch (e) {
  }
}

const isPureMediaDocument = () => {
  try {
    const type = `${document.contentType || ''}`.toLowerCase()
    if (type.startsWith('video/') || type.startsWith('audio/')) return true
    if (!document.body) return false
    const videos = document.body.querySelectorAll('video')
    if (videos.length === 1) {
      const bodyChildren = document.body.children ? document.body.children.length : 0
      if (bodyChildren <= 2) return true
    }
  } catch (e) {}
  return false
}

if (typeof window !== 'undefined' && window.addEventListener) {
  if (isPureMediaDocument()) {
    return
  }
  window.addEventListener('keydown', (event) => {
    if (matchHotkey(event)) {
      sendToggleAutoHijackOverride()
    }
  }, true)

  window.addEventListener('click', (event) => {
    if (matchHotkey(event)) {
      sendToggleAutoHijackOverride()
    }
  }, true)

  const isTopWindow = () => {
    try {
      return window.top === window
    } catch (e) {
      return true
    }
  }

  const isVideoPage = (url) => {
    const s = (url || window.location.href || '').trim()
    if (!s) return false
    try {
      const u = new URL(s)
      const host = (u.hostname || '').toLowerCase()
      const path = (u.pathname || '').toLowerCase()
      if (!host) return false
      
      // 检查是否是视频网站
      const isVideoHost = host.includes('video') || 
        host.includes('tube') || 
        host.includes('tv') ||
        host === 'bilibili.com' ||
        host === 'www.bilibili.com' ||
        host.endsWith('.bilibili.com')
      
      const isShort = host === 'b23.tv' || host === 'www.b23.tv'
      if (isShort) return true
      if (!isVideoHost) return false
      
      // 检查是否是视频页面路径
      if (path.startsWith('/video/')) return true
      if (path.startsWith('/watch')) return true
      if (path.startsWith('/v/')) return true
      if (path.startsWith('/bangumi/')) return true
      if (path.startsWith('/cheese/')) return true
      return false
    } catch (e) {
      return false
    }
  }

  // 存储嗅探到的视频资源
  let sniffedResources = {
    video: [],
    audio: [],
    m4s: [],
    combined: [], // 组合的视频（视频流+音频流）
    total: 0
  }

  // 资源备份系统，防止意外清除
  let resourcesBackup = {
    video: [],
    audio: [],
    m4s: [],
    combined: [],
    timestamp: 0
  }

  // 备份当前资源
  const backupResources = () => {
    if (sniffedResources.total > 0) {
      resourcesBackup = {
        video: [...sniffedResources.video],
        audio: [...sniffedResources.audio],
        m4s: [...(sniffedResources.m4s || [])],
        combined: [...sniffedResources.combined],
        timestamp: Date.now()
      }
      log('Resources backed up:', {
        video: resourcesBackup.video.length,
        audio: resourcesBackup.audio.length,
        m4s: resourcesBackup.m4s.length,
        combined: resourcesBackup.combined.length
      })
    }
  }

  // 检查是否需要从备份恢复资源
  const checkAndRestoreResources = () => {
    const currentTotal = sniffedResources.total || 0
    const backupTotal = resourcesBackup.video.length + resourcesBackup.audio.length
    const timeSinceBackup = Date.now() - resourcesBackup.timestamp
    
    // 如果当前资源为空，但备份有资源，且备份时间在30秒内，则恢复
    if (currentTotal === 0 && backupTotal > 0 && timeSinceBackup < 30000) {
      log('Restoring resources from backup:', {
        video: resourcesBackup.video.length,
        audio: resourcesBackup.audio.length,
        m4s: resourcesBackup.m4s.length,
        combined: resourcesBackup.combined.length
      })
      sniffedResources.video = [...resourcesBackup.video]
      sniffedResources.audio = [...resourcesBackup.audio]
      sniffedResources.m4s = [...resourcesBackup.m4s]
      sniffedResources.combined = [...resourcesBackup.combined]
      sniffedResources.total = backupTotal
      updateButtonVisibility()
      return true
    }
    
    // 检查是否只有部分资源丢失（比如只有单独资源消失但组合资源还在）
    const currentVideoAudio = (sniffedResources.video?.length || 0) + (sniffedResources.audio?.length || 0)
    const backupVideoAudio = resourcesBackup.video.length + resourcesBackup.audio.length
    const currentCombined = sniffedResources.combined?.length || 0
    const backupCombined = resourcesBackup.combined.length
    
    if (currentCombined > 0 && currentVideoAudio === 0 && backupVideoAudio > 0 && timeSinceBackup < 30000) {
      log('Restoring individual resources while keeping combined:', {
        restoring_video: resourcesBackup.video.length,
        restoring_audio: resourcesBackup.audio.length,
        keeping_combined: currentCombined
      })
      sniffedResources.video = [...resourcesBackup.video]
      sniffedResources.audio = [...resourcesBackup.audio]
      sniffedResources.m4s = [...resourcesBackup.m4s]
      sniffedResources.total = currentVideoAudio + currentCombined
      updateButtonVisibility()
      return true
    }
    
    return false
  }

  const updateMainButtonResourceCount = () => {
    try {
      const btn = document.getElementById('linkcore-bilibili-download-btn')
      if (!btn) return
      const countSpan = btn.querySelector('.linkcore-resource-count')
      if (!countSpan) return

      const scoped = getUniversalScopedResources().resources
      const resources = scoped || sniffedResources

      const hasM4s = Array.isArray(resources.m4s) && resources.m4s.length > 0

      const combinedCount = Array.isArray(resources.combined) ? resources.combined.length : 0
      const m4sCount = hasM4s ? resources.m4s.length : 0

      const videoList = Array.isArray(resources.video) ? resources.video : []
      const audioList = Array.isArray(resources.audio) ? resources.audio : []

      const videoCount = videoList.filter((resource) => {
        if (!resource || typeof resource.url !== 'string') return true
        const isM4S = resource.url.includes('.m4s')
        const shouldShowInM4SSection = isM4S && hasM4s
        return !shouldShowInM4SSection
      }).length

      const audioCount = audioList.filter((resource) => {
        if (!resource || typeof resource.url !== 'string') return true
        const isM4S = resource.url.includes('.m4s')
        const shouldShowInM4SSection = isM4S && hasM4s
        return !shouldShowInM4SSection
      }).length

      const totalItems = combinedCount + m4sCount + videoCount + audioCount
      const safeTotal = totalItems > 0 ? totalItems : 0
      countSpan.textContent = `${safeTotal} 个资源`
    } catch (e) {}
  }

  // 视频嗅探器配置
  let videoSnifferConfig = {
    enabled: true, // 默认启用
    loaded: false
  }

  // 加载视频嗅探器配置
  const loadVideoSnifferConfig = () => {
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        log('Chrome storage not available, using default config')
        videoSnifferConfig.loaded = true
        return
      }
      
      chrome.storage.local.get(['videoSnifferEnabled'], (result) => {
        if (chrome.runtime.lastError) {
          log('Error loading video sniffer config:', chrome.runtime.lastError)
          videoSnifferConfig.loaded = true
          return
        }
        
        if (result.videoSnifferEnabled !== undefined) {
          videoSnifferConfig.enabled = result.videoSnifferEnabled
          log('Loaded videoSnifferEnabled:', videoSnifferConfig.enabled)
        }
        
        videoSnifferConfig.loaded = true
        log('Video sniffer config loaded:', videoSnifferConfig)
        
        // 配置加载后更新按钮可见性
        updateButtonVisibility()
      })
    } catch (e) {
      log('Error loading video sniffer config:', e)
      videoSnifferConfig.loaded = true
    }
  }

  // 监听配置变化
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.videoSnifferEnabled) {
        const oldEnabled = videoSnifferConfig.enabled
        videoSnifferConfig.enabled = changes.videoSnifferEnabled.newValue
        log('videoSnifferEnabled changed from', oldEnabled, 'to', videoSnifferConfig.enabled)
        
        // 配置变化后更新按钮可见性
        updateButtonVisibility()
      }
    })
  }

  // 调试日志控制
  const DEBUG = false // 关闭调试日志
  const log = (...args) => {
    if (DEBUG) {
      console.log('[Key Listener]', ...args)
    }
  }

  // 监听视频资源更新事件
  log('Setting up event listeners...')

  // 只在 document 上监听（因为 video-sniffer.js 在 document 上触发）
  document.addEventListener('linkcore-resources-updated', (event) => {
    log('Resources updated:', event.detail)
    sniffedResources = event.detail || { video: [], audio: [], m4s: [], combined: [], total: 0 }
    log('Total resources:', sniffedResources.total)
    
    // 备份资源
    backupResources()
    updateMainButtonResourceCount()
    
    // 检查按钮是否被用户关闭，如果关闭则不显示
    if (!isButtonClosedByUser() && sniffedResources.total > 0) {
      const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper') || document.getElementById('linkcore-download-btn-wrapper')
      if (wrapper) {
        wrapper.style.display = 'block'
        wrapper.style.visibility = 'visible'
        log('Ensured button visibility after resource update')
      }
    }
    
    dedupeUniversalButtonWrappers()
    renderPerVideoSniffButtons()
    updateButtonVisibility()
  })

  // 监听来自 iframe 的消息
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'linkcore-resources-updated') {
      log('Received message from iframe:', event.data.data)
      sniffedResources = event.data.data || { video: [], audio: [], m4s: [], combined: [], total: 0 }
      log('Total resources from iframe:', sniffedResources.total)
      
      // 备份资源
      backupResources()
      updateMainButtonResourceCount()
      
      // 检查按钮是否被用户关闭，如果关闭则不显示
      if (!isButtonClosedByUser() && sniffedResources.total > 0) {
        const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper') || document.getElementById('linkcore-download-btn-wrapper')
        if (wrapper) {
          wrapper.style.display = 'block'
          wrapper.style.visibility = 'visible'
          log('Ensured button visibility after iframe message')
        }
      }
      
      dedupeUniversalButtonWrappers()
      renderPerVideoSniffButtons()
      updateButtonVisibility()
    }
  })

  // 监听清除资源事件
  window.addEventListener('linkcore-clear-resources', () => {
    log('Clearing resources')
    const beforeCount = sniffedResources.total || 0
    log('Resources before clear:', beforeCount)
    sniffedResources = {
      video: [],
      audio: [],
      m4s: [],
      combined: [],
      total: 0
    }
    // 同时清空备份，防止资源被恢复
    resourcesBackup = {
      video: [],
      audio: [],
      m4s: [],
      combined: [],
      timestamp: 0
    }
    log('Resources and backup cleared, was:', beforeCount, 'now: 0')
    
    // 关闭下拉框
    const dropdown = document.getElementById('linkcore-resource-dropdown')
    if (dropdown) {
      dropdown.style.display = 'none'
    }
    
    // 隐藏按钮
    try {
      collectUniversalButtonWrappers().forEach(w => {
        try { w.style.display = 'none' } catch (e) {}
      })
    } catch (e) {}

    removePerVideoButtons()
    
    updateButtonVisibility()
  })

  log('Event listeners registered')

  let lastKnownHref = ''
  let navClearTimer = null
  const handleMaybeUrlChange = () => {
    try {
      const href = window.location.href || ''
      if (!href) return
      if (!lastKnownHref) lastKnownHref = href
      if (href === lastKnownHref) return
      lastKnownHref = href

      if (navClearTimer) clearTimeout(navClearTimer)
      navClearTimer = setTimeout(() => {
        navClearTimer = null
        window.dispatchEvent(new Event('linkcore-clear-resources'))
        setTimeout(() => {
          window.dispatchEvent(new Event('linkcore-get-resources'))
        }, 200)
      }, 80)
    } catch (e) {}
  }

  try {
    lastKnownHref = window.location.href || ''
    window.addEventListener('popstate', handleMaybeUrlChange, true)
    window.addEventListener('hashchange', handleMaybeUrlChange, true)
    if (window.history) {
      const wrap = (method) => {
        const original = window.history[method]
        if (typeof original !== 'function') return
        window.history[method] = function () {
          const ret = original.apply(this, arguments)
          handleMaybeUrlChange()
          return ret
        }
      }
      wrap('pushState')
      wrap('replaceState')
    }
  } catch (e) {}

  const sendPageToClient = () => {
    try {
      const url = window.location.href || ''
      if (!url || !/^https?:/i.test(url)) return
      const referer = url
      const headers = []
      try {
        const origin = window.location && window.location.origin ? window.location.origin : ''
        if (origin && /^https?:/i.test(origin)) headers.push(`Origin: ${origin}`)
      } catch (e) {}
      try {
        const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : ''
        if (ua) headers.push(`User-Agent: ${ua}`)
      } catch (e) {}
      try {
        const langs = (typeof navigator !== 'undefined' && Array.isArray(navigator.languages) ? navigator.languages : [])
          .map(x => `${x || ''}`.trim()).filter(Boolean)
        if (langs.length > 0) headers.push(`Accept-Language: ${langs.join(',')}`)
      } catch (e) {}
      headers.push('Accept: */*')
      chrome.runtime.sendMessage({ type: 'addUriFromContent', url, referer, headers }, () => { })
    } catch (e) {
    }
  }

  const sendResourceToClient = (url, referer, suggestedFilename) => {
    try {
      if (!url || !/^https?:/i.test(url)) return
      const headers = []
      try {
        const origin = window.location && window.location.origin ? window.location.origin : ''
        if (origin && /^https?:/i.test(origin)) headers.push(`Origin: ${origin}`)
      } catch (e) {}
      try {
        const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : ''
        if (ua) headers.push(`User-Agent: ${ua}`)
      } catch (e) {}
      try {
        const langs = (typeof navigator !== 'undefined' && Array.isArray(navigator.languages) ? navigator.languages : [])
          .map(x => `${x || ''}`.trim()).filter(Boolean)
        if (langs.length > 0) headers.push(`Accept-Language: ${langs.join(',')}`)
      } catch (e) {}
      headers.push('Accept: */*')
      const message = {
        type: 'addUriFromContent',
        url,
        referer,
        headers
      }
      // 如果有建议的文件名，添加到消息中
      if (suggestedFilename) {
        message.suggestedFilename = suggestedFilename
      }
      chrome.runtime.sendMessage(message, () => { })
    } catch (e) {
    }
  }

  const safeFilenamePart = (input) => {
    const s = `${input || ''}`.trim()
    if (!s) return ''
    return s.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 180)
  }

  let perVideoModeActive = false

  const getVideoContextIdFromElement = (video) => {
    try {
      if (!video) return ''
      return video.getAttribute('data-linkcore-video-context-id') || ''
    } catch (e) {
      return ''
    }
  }

  const getVideoLastActiveAt = (video) => {
    try {
      if (!video) return 0
      const raw = video.getAttribute('data-linkcore-video-last-active') || ''
      const n = Number(raw)
      return Number.isFinite(n) ? n : 0
    } catch (e) {
      return 0
    }
  }

  const isElementVisibleInViewport = (el) => {
    try {
      if (!el || !el.isConnected) return false
      const rects = el.getClientRects()
      if (!rects || rects.length === 0) return false
      const style = window.getComputedStyle(el)
      if (!style || style.display === 'none' || style.visibility === 'hidden') return false
      if (Number(style.opacity || '1') === 0) return false
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth || document.documentElement.clientWidth || 0
      const vh = window.innerHeight || document.documentElement.clientHeight || 0
      if (!vw || !vh) return false
      if (rect.width <= 0 || rect.height <= 0) return false
      return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw
    } catch (e) {
      return false
    }
  }

  const getViewportIntersectionArea = (rect, vw, vh) => {
    try {
      if (!rect || !vw || !vh) return 0
      const left = Math.max(0, rect.left)
      const right = Math.min(vw, rect.right)
      const top = Math.max(0, rect.top)
      const bottom = Math.min(vh, rect.bottom)
      const w = Math.max(0, right - left)
      const h = Math.max(0, bottom - top)
      return w * h
    } catch (e) {
      return 0
    }
  }

  const isShortVideoFeedHost = () => {
    try {
      const host = (window.location && window.location.hostname ? window.location.hostname : '').toLowerCase()
      if (!host) return false
      if (host.includes('douyin.com')) return true
      if (host.includes('iesdouyin.com')) return true
      if (host.includes('tiktok.com')) return true
      return false
    } catch (e) {
      return false
    }
  }

  const collectUniversalButtonWrappers = () => {
    try {
      const list = []
      document.querySelectorAll('#linkcore-bilibili-download-btn-wrapper').forEach(el => list.push(el))
      document.querySelectorAll('#linkcore-download-btn-wrapper').forEach(el => list.push(el))
      return list.filter(Boolean)
    } catch (e) {
      return []
    }
  }

  const dedupeUniversalButtonWrappers = () => {
    try {
      const wrappers = collectUniversalButtonWrappers().filter(w => w && w.isConnected)
      if (wrappers.length <= 1) return

      let keep = wrappers[0]
      let bestTop = null
      wrappers.forEach(w => {
        try {
          const rect = w.getBoundingClientRect()
          const top = Number(rect && rect.top != null ? rect.top : 0)
          if (bestTop == null || top < bestTop) {
            bestTop = top
            keep = w
          }
        } catch (e) {}
      })

      wrappers.forEach(w => {
        if (w !== keep) {
          try { w.remove() } catch (e) {}
        }
      })
    } catch (e) {}
  }

  const hasLargeFeedVideoInView = (videos) => {
    try {
      const list = Array.isArray(videos) ? videos.filter(Boolean) : []
      if (list.length === 0) return false
      const vw = window.innerWidth || document.documentElement.clientWidth || 0
      const vh = window.innerHeight || document.documentElement.clientHeight || 0
      if (!vw || !vh) return false
      const viewportArea = vw * vh
      if (!viewportArea) return false

      for (const v of list) {
        try {
          const rect = v.getBoundingClientRect()
          const area = getViewportIntersectionArea(rect, vw, vh)
          if (!area) continue
          const wide = rect.width >= vw * 0.6
          const tall = rect.height >= vh * 0.6
          const large = (area / viewportArea) >= 0.55
          if (wide && tall && large) return true
        } catch (e) {}
      }
      return false
    } catch (e) {
      return false
    }
  }

  const hasSingleDominantVideoInView = (videos) => {
    try {
      const list = Array.isArray(videos) ? videos.filter(Boolean) : []
      if (list.length <= 1) return true
      const vw = window.innerWidth || document.documentElement.clientWidth || 0
      const vh = window.innerHeight || document.documentElement.clientHeight || 0
      if (!vw || !vh) return false
      const viewportArea = vw * vh
      if (!viewportArea) return false

      const areas = list.map(v => {
        try {
          const rect = v.getBoundingClientRect()
          return getViewportIntersectionArea(rect, vw, vh)
        } catch (e) {
          return 0
        }
      }).filter(a => a > 0)

      if (areas.length <= 1) return true
      const sum = areas.reduce((acc, n) => acc + n, 0)
      const max = Math.max.apply(null, areas)
      if (!sum || !max) return false

      const dominantByViewport = (max / viewportArea) >= 0.55
      const dominantBySum = (max / sum) >= 0.72
      return dominantByViewport && dominantBySum
    } catch (e) {
      return false
    }
  }

  const hasAnySniffedResources = (res) => {
    try {
      const r = res || {}
      const combined = Array.isArray(r.combined) ? r.combined.length : 0
      const m4s = Array.isArray(r.m4s) ? r.m4s.length : 0
      const video = Array.isArray(r.video) ? r.video.length : 0
      const audio = Array.isArray(r.audio) ? r.audio.length : 0
      return (combined + m4s + video + audio) > 0
    } catch (e) {
      return false
    }
  }

  const getPreferredUniversalVideoContextId = () => {
    try {
      const videos = Array.from(document.querySelectorAll('video'))
      if (videos.length === 0) return ''
      const visible = videos.filter(v => isElementVisibleInViewport(v))

      const pick = (list) => {
        if (!list || list.length === 0) return ''
        let best = null
        let bestAt = -1
        list.forEach(v => {
          const at = getVideoLastActiveAt(v)
          if (at > bestAt) {
            bestAt = at
            best = v
          }
        })
        const chosen = best || list[0]
        return getVideoContextIdFromElement(chosen) || ''
      }

      if (visible.length === 1) return pick(visible)
      if (visible.length > 1) return pick(visible)
      if (videos.length === 1) return pick(videos)
      return ''
    } catch (e) {
      return ''
    }
  }

  const getUniversalScopedResources = () => {
    try {
      if (perVideoModeActive) return { resources: sniffedResources, contextId: '', scoped: false }
      const contextId = getPreferredUniversalVideoContextId()
      if (!contextId) return { resources: sniffedResources, contextId: '', scoped: false }

      const scoped = {
        video: (sniffedResources.video || []).filter(r => (r && (r.videoContextId || '') === contextId)),
        audio: (sniffedResources.audio || []).filter(r => (r && (r.videoContextId || '') === contextId)),
        m4s: (sniffedResources.m4s || []).filter(r => (r && (r.videoContextId || '') === contextId)),
        combined: (sniffedResources.combined || []).filter(r => (r && (r.videoContextId || '') === contextId)),
        total: 0
      }
      scoped.total = (scoped.video.length || 0) + (scoped.audio.length || 0)

      if (hasAnySniffedResources(scoped)) {
        return { resources: scoped, contextId, scoped: true }
      }
      return { resources: sniffedResources, contextId, scoped: false }
    } catch (e) {
      return { resources: sniffedResources, contextId: '', scoped: false }
    }
  }

  const getHostFromUrl = (url) => {
    try {
      const u = new URL(url)
      return (u.hostname || '').toLowerCase()
    } catch (e) {
      return ''
    }
  }

  const filterContextResources = (list, contextId, activeAt, preferredHost) => {
    const arr = Array.isArray(list) ? list.filter(Boolean) : []
    if (!contextId) return arr
    const matched = arr.filter(r => (r.videoContextId || '') === contextId)
    if (matched.length > 0) return matched
    const host = `${preferredHost || ''}`.trim().toLowerCase()
    if (host) {
      const hostMatched = arr.filter(r => !r.videoContextId && getHostFromUrl(r.url || r.videoUrl || '') === host)
      if (hostMatched.length > 0) return hostMatched
    }
    const at = Number(activeAt || 0)
    if (!at) return []
    const near = arr.filter(r => !r.videoContextId && Math.abs(Number(r.timestamp || 0) - at) < 15000)
    return near.length > 0 ? near : []
  }

  const pickNearest = (list, activeAt) => {
    const arr = Array.isArray(list) ? list.filter(Boolean) : []
    if (arr.length === 0) return null
    const at = Number(activeAt || 0)
    return [...arr].sort((a, b) => {
      const da = at ? Math.abs(Number(a.timestamp || 0) - at) : 0
      const db = at ? Math.abs(Number(b.timestamp || 0) - at) : 0
      if (da !== db) return da - db
      const sa = Number(a && a.size ? a.size : 0)
      const sb = Number(b && b.size ? b.size : 0)
      if (sb !== sa) return sb - sa
      return Number(b.timestamp || 0) - Number(a.timestamp || 0)
    })[0] || null
  }

  const removePerVideoButtons = () => {
    try {
      const list = document.querySelectorAll('.linkcore-video-sniff-btn-wrapper')
      list.forEach(el => el.remove())
    } catch (e) {}
  }

  const collectResourcesForContext = (contextId) => {
    const combined = (sniffedResources.combined || []).filter(r => (r && (r.videoContextId || '') === contextId))
    const videos = (sniffedResources.video || []).filter(r => (r && (r.videoContextId || '') === contextId))
    const audios = (sniffedResources.audio || []).filter(r => (r && (r.videoContextId || '') === contextId))
    return { combined, videos, audios }
  }

  const pickBestCombined = (list) => {
    if (!Array.isArray(list) || list.length === 0) return null
    return [...list].sort((a, b) => {
      const sa = Number(a && a.size ? a.size : 0)
      const sb = Number(b && b.size ? b.size : 0)
      if (sb !== sa) return sb - sa
      const ta = Number(a && a.timestamp ? a.timestamp : 0)
      const tb = Number(b && b.timestamp ? b.timestamp : 0)
      return tb - ta
    })[0] || null
  }

  const pickBestSingle = (list) => {
    if (!Array.isArray(list) || list.length === 0) return null
    return [...list].sort((a, b) => {
      const sa = Number(a && a.size ? a.size : 0)
      const sb = Number(b && b.size ? b.size : 0)
      if (sb !== sa) return sb - sa
      const ta = Number(a && a.timestamp ? a.timestamp : 0)
      const tb = Number(b && b.timestamp ? b.timestamp : 0)
      return tb - ta
    })[0] || null
  }

  const downloadForVideoContext = (contextId, video, index) => {
    try {
      const referer = window.location.href || ''
      const base = safeFilenamePart(document.title || 'video')
      const seq = typeof index === 'number' ? index + 1 : 1
      const activeAt = getVideoLastActiveAt(video) || Date.now()
      const preferredHost = getHostFromUrl((video && (video.currentSrc || video.src)) ? (video.currentSrc || video.src) : '')

      const combinedPool = filterContextResources(sniffedResources.combined || [], contextId, activeAt, preferredHost)
      const bestCombined = pickNearest(combinedPool, activeAt) || pickBestCombined(combinedPool)
      if (bestCombined && bestCombined.videoUrl && bestCombined.audioUrl) {
        const videoFilename = base ? `${base}_${seq}_video.m4s` : ''
        const audioFilename = base ? `${base}_${seq}_audio.m4s` : ''
        sendResourceToClient(bestCombined.videoUrl, referer, videoFilename)
        setTimeout(() => sendResourceToClient(bestCombined.audioUrl, referer, audioFilename), 100)
        return true
      }

      const videoPool = filterContextResources(sniffedResources.video || [], contextId, activeAt, preferredHost)
      const nonM4s = Array.isArray(videoPool) ? videoPool.filter(r => r && r.url && r.ext !== 'm4s') : []
      const bestVideo = pickNearest(nonM4s, activeAt) || pickBestSingle(nonM4s) || pickNearest(videoPool, activeAt) || pickBestSingle(videoPool)
      if (bestVideo && bestVideo.url) {
        const ext = bestVideo.ext ? `${bestVideo.ext}`.toLowerCase() : 'mp4'
        const filename = base ? `${base}_${seq}.${ext}` : ''
        sendResourceToClient(bestVideo.url, referer, filename)
        return true
      }

      const currentSrc = video && (video.currentSrc || video.src) ? (video.currentSrc || video.src) : ''
      if (currentSrc && /^https?:/i.test(currentSrc)) {
        const filename = base ? `${base}_${seq}.mp4` : ''
        sendResourceToClient(currentSrc, referer, filename)
        return true
      }
    } catch (e) {}
    return false
  }

  const ensurePerVideoButton = (video, contextId, index) => {
    try {
      if (!video || !contextId) return false

      const wrapperId = `linkcore-video-sniff-btn-wrapper-${contextId}`
      const existing = document.getElementById(wrapperId)
      if (existing) return true

      const container = video.parentElement || video
      if (!container) return false

      const computedPosition = window.getComputedStyle(container).position
      if (computedPosition === 'static') {
        container.style.position = 'relative'
      }

      const wrapper = document.createElement('div')
      wrapper.id = wrapperId
      wrapper.className = 'linkcore-video-sniff-btn-wrapper'
      const wStyle = wrapper.style
      wStyle.position = 'absolute'
      wStyle.top = '8px'
      wStyle.right = '8px'
      wStyle.zIndex = '2147483647'
      wStyle.pointerEvents = 'auto'
      wStyle.display = 'block'
      wStyle.width = '32px'
      wStyle.height = '32px'
      wStyle.overflow = 'visible'
      wStyle.opacity = '0.5'
      wStyle.transition = 'opacity 0.12s ease'

      let title = 'Download'
      try {
        if (chrome && chrome.i18n && chrome.i18n.getMessage) {
          const msg = chrome.i18n.getMessage('contextMenuDownload')
          if (msg) title = msg
        }
      } catch (e) {}
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('aria-label', title)
      btn.setAttribute('title', '')
      const bStyle = btn.style
      bStyle.width = '32px'
      bStyle.height = '32px'
      bStyle.borderRadius = '16px'
      bStyle.border = 'none'
      bStyle.cursor = 'pointer'
      bStyle.background = 'transparent'
      bStyle.color = '#ffffff'
      bStyle.fontSize = '18px'
      bStyle.lineHeight = '32px'
      bStyle.textAlign = 'center'
      bStyle.opacity = '0.95'
      btn.textContent = '↓'

      const extend = document.createElement('div')
      const exStyle = extend.style
      exStyle.position = 'absolute'
      exStyle.top = '0'
      exStyle.right = '0'
      exStyle.height = '32px'
      exStyle.width = '32px'
      exStyle.background = '#409eff'
      exStyle.borderRadius = '16px'
      exStyle.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'
      exStyle.overflow = 'hidden'
      exStyle.pointerEvents = 'none'
      exStyle.transition = 'width 0.18s ease'

      const label = document.createElement('div')
      label.textContent = title
      const lStyle = label.style
      lStyle.height = '32px'
      lStyle.display = 'flex'
      lStyle.alignItems = 'center'
      lStyle.padding = '0 40px 0 12px'
      lStyle.color = '#ffffff'
      lStyle.fontSize = '12px'
      lStyle.whiteSpace = 'nowrap'
      lStyle.maxWidth = '150px'
      lStyle.overflow = 'hidden'
      lStyle.textOverflow = 'ellipsis'
      lStyle.opacity = '0'
      lStyle.transform = 'translateX(6px)'
      lStyle.transition = 'opacity 0.12s ease, transform 0.12s ease'

      extend.appendChild(label)

      const showLabel = () => {
        extend.style.width = '150px'
        label.style.opacity = '1'
        label.style.transform = 'translateX(0)'
        wrapper.style.opacity = '1'
      }
      const hideLabel = () => {
        extend.style.width = '32px'
        label.style.opacity = '0'
        label.style.transform = 'translateX(6px)'
        wrapper.style.opacity = '0.5'
      }
      wrapper.addEventListener('mouseenter', showLabel, true)
      wrapper.addEventListener('mouseleave', hideLabel, true)
      btn.addEventListener('blur', hideLabel, true)

      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        downloadForVideoContext(contextId, video, index)
      }, true)

      wrapper.appendChild(extend)
      wrapper.appendChild(btn)
      container.appendChild(wrapper)
      return true
    } catch (e) {
      return false
    }
  }

  const renderPerVideoSniffButtons = () => {
    try {
      if (!videoSnifferConfig.loaded || !videoSnifferConfig.enabled) {
        perVideoModeActive = false
        removePerVideoButtons()
        return
      }

      const videos = Array.from(document.querySelectorAll('video'))
      const eligibleVideos = videos.filter(v => {
        try {
          if (!isElementVisibleInViewport(v)) return false
          const rect = v.getBoundingClientRect()
          const minW = 240
          const minH = 135
          const bigEnough = rect.width >= minW && rect.height >= minH

          const muted = !!v.muted
          const autoplay = !!v.autoplay
          const likelyHoverPreview = muted && autoplay && rect.width < 320 && rect.height < 220
          if (likelyHoverPreview && !bigEnough) return false

          return bigEnough
        } catch (e) {
          return false
        }
      })
      if (eligibleVideos.length === 0) {
        perVideoModeActive = false
        removePerVideoButtons()
        return
      }

      const eligibleContextIds = []
      eligibleVideos.forEach((video, idx) => {
        const contextId = getVideoContextIdFromElement(video)
        if (!contextId) return

        const { combined, videos: resVideos } = collectResourcesForContext(contextId)
        const hasResources = (combined && combined.length > 0) || (resVideos && resVideos.length > 0)
        const hasDirectUrl = (() => {
          const src = (video && (video.currentSrc || video.src)) ? (video.currentSrc || video.src) : ''
          return !!(src && /^https?:/i.test(src))
        })()
        if (!hasResources && !hasDirectUrl) return

        eligibleContextIds.push(contextId)
      })

      const uniqueEligible = Array.from(new Set(eligibleContextIds))
      let shouldUsePerVideoMode = uniqueEligible.length >= 2
      if (shouldUsePerVideoMode) {
        const shortVideoFeed = isShortVideoFeedHost()
        if (shortVideoFeed) {
          const largeFeed = hasLargeFeedVideoInView(eligibleVideos)
          const dominant = hasSingleDominantVideoInView(eligibleVideos)
          if (largeFeed || dominant) shouldUsePerVideoMode = false
        }
      }
      perVideoModeActive = shouldUsePerVideoMode

      if (!shouldUsePerVideoMode) {
        removePerVideoButtons()
        return
      }

      const createdContextIds = new Set()
      eligibleVideos.forEach((video, idx) => {
        const contextId = getVideoContextIdFromElement(video)
        if (!contextId) return

        const { combined, videos: resVideos } = collectResourcesForContext(contextId)
        const hasResources = (combined && combined.length > 0) || (resVideos && resVideos.length > 0)
        const hasDirectUrl = (() => {
          const src = (video && (video.currentSrc || video.src)) ? (video.currentSrc || video.src) : ''
          return !!(src && /^https?:/i.test(src))
        })()
        if (!hasResources && !hasDirectUrl) return

        if (ensurePerVideoButton(video, contextId, idx)) {
          createdContextIds.add(contextId)
        }
      })

      const existing = document.querySelectorAll('.linkcore-video-sniff-btn-wrapper')
      existing.forEach(el => {
        const id = el && el.id ? `${el.id}` : ''
        const m = id.match(/^linkcore-video-sniff-btn-wrapper-(.+)$/)
        const contextId = m && m[1] ? m[1] : ''
        if (contextId && !createdContextIds.has(contextId)) {
          el.remove()
        }
      })

      const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
      if (wrapper) wrapper.style.display = 'none'
    } catch (e) {}
  }

  let perVideoRenderTimer = null
  const schedulePerVideoRender = () => {
    if (perVideoRenderTimer) return
    perVideoRenderTimer = setTimeout(() => {
      perVideoRenderTimer = null
      renderPerVideoSniffButtons()
      try {
        updateButtonVisibility()
      } catch (e) {}
    }, 120)
  }

  try {
    window.addEventListener('scroll', schedulePerVideoRender, true)
    window.addEventListener('resize', schedulePerVideoRender, true)
    document.addEventListener('play', schedulePerVideoRender, true)
    document.addEventListener('playing', schedulePerVideoRender, true)
    document.addEventListener('pause', schedulePerVideoRender, true)
    document.addEventListener('ended', schedulePerVideoRender, true)
    document.addEventListener('wheel', schedulePerVideoRender, { capture: true, passive: true })
    document.addEventListener('touchend', schedulePerVideoRender, { capture: true, passive: true })
    document.addEventListener('pointerup', schedulePerVideoRender, { capture: true, passive: true })
  } catch (e) {}

  // 获取当前语言的缓存
  let cachedLocale = 'en'
  let cachedUnknownSizeText = 'Unknown size'
  
  // 更新语言缓存
  const updateLocaleCache = async () => {
    try {
      const config = await new Promise((resolve) => {
        chrome.storage.local.get(['browserLocale'], (result) => {
          resolve(result || {})
        })
      })
      
      cachedLocale = config.browserLocale || 'en'
      const unknownSizeTranslations = {
        'en': 'Unknown size',
        'zh_CN': '未知大小',
        'zh_TW': '未知大小',
        'ja': 'サイズ不明',
        'ko': '크기 알 수 없음',
        'es': 'Tamaño desconocido',
        'fr': 'Taille inconnue',
        'de': 'Unbekannte Größe',
        'ru': 'Неизвестный размер'
      }
      
      cachedUnknownSizeText = unknownSizeTranslations[cachedLocale] || unknownSizeTranslations['en']
    } catch (e) {
      cachedLocale = 'en'
      cachedUnknownSizeText = 'Unknown size'
    }
  }

  // 获取本地化文本
  const getLocalizedText = (key) => {
    const translations = {
      'clearResourceList': {
        'en': 'Clear resource list',
        'zh_CN': '清空资源列表',
        'zh_TW': '清空資源列表',
        'ja': 'リソースリストをクリア',
        'ko': '리소스 목록 지우기',
        'es': 'Limpiar lista de recursos',
        'fr': 'Effacer la liste des ressources',
        'de': 'Ressourcenliste löschen',
        'ru': 'Очистить список ресурсов'
      },
      'dashCompleteVideo': {
        'en': 'DASH Complete Video (Video+Audio)',
        'zh_CN': 'DASH 完整视频 (视频+音频)',
        'zh_TW': 'DASH 完整視頻 (視頻+音頻)',
        'ja': 'DASH 完全動画 (動画+音声)',
        'ko': 'DASH 완전 비디오 (비디오+오디오)',
        'es': 'Video completo DASH (Video+Audio)',
        'fr': 'Vidéo complète DASH (Vidéo+Audio)',
        'de': 'DASH Vollständiges Video (Video+Audio)',
        'ru': 'DASH Полное видео (Видео+Аудио)'
      },
      'dashSeparateStreams': {
        'en': 'DASH Separate Streams',
        'zh_CN': 'DASH 单独流',
        'zh_TW': 'DASH 單獨流',
        'ja': 'DASH 個別ストリーム',
        'ko': 'DASH 개별 스트림',
        'es': 'Flujos separados DASH',
        'fr': 'Flux séparés DASH',
        'de': 'DASH Separate Streams',
        'ru': 'DASH Отдельные потоки'
      },
      'videoResources': {
        'en': 'Video Resources',
        'zh_CN': '视频资源',
        'zh_TW': '視頻資源',
        'ja': '動画リソース',
        'ko': '비디오 리소스',
        'es': 'Recursos de video',
        'fr': 'Ressources vidéo',
        'de': 'Video-Ressourcen',
        'ru': 'Видео ресурсы'
      },
      'audioResources': {
        'en': 'Audio Resources',
        'zh_CN': '音频资源',
        'zh_TW': '音頻資源',
        'ja': '音声リソース',
        'ko': '오디오 리소스',
        'es': 'Recursos de audio',
        'fr': 'Ressources audio',
        'de': 'Audio-Ressourcen',
        'ru': 'Аудио ресурсы'
      },
      'noVideoResourcesDetected': {
        'en': 'No video resources detected',
        'zh_CN': '未检测到视频资源',
        'zh_TW': '未檢測到視頻資源',
        'ja': '動画リソースが検出されませんでした',
        'ko': '비디오 리소스가 감지되지 않음',
        'es': 'No se detectaron recursos de video',
        'fr': 'Aucune ressource vidéo détectée',
        'de': 'Keine Video-Ressourcen erkannt',
        'ru': 'Видео ресурсы не обнаружены'
      },
      'rightClickTip': {
        'en': 'Tip: Right-click on links and select "Download with LinkCore"',
        'zh_CN': '提示：右键点击页面上的链接，选择"使用 LinkCore 下载"',
        'zh_TW': '提示：右鍵點擊頁面上的鏈接，選擇"使用 LinkCore 下載"',
        'ja': 'ヒント：リンクを右クリックして「LinkCore でダウンロード」を選択',
        'ko': '팁: 링크를 마우스 오른쪽 버튼으로 클릭하고 "LinkCore로 다운로드"를 선택',
        'es': 'Consejo: Haz clic derecho en los enlaces y selecciona "Descargar con LinkCore"',
        'fr': 'Astuce : Cliquez avec le bouton droit sur les liens et sélectionnez "Télécharger avec LinkCore"',
        'de': 'Tipp: Rechtsklick auf Links und "Mit LinkCore herunterladen" auswählen',
        'ru': 'Совет: Щелкните правой кнопкой мыши по ссылкам и выберите "Скачать с LinkCore"'
      },
      'complete': {
        'en': 'Complete',
        'zh_CN': '完整',
        'zh_TW': '完整',
        'ja': '完全',
        'ko': '완전',
        'es': 'Completo',
        'fr': 'Complet',
        'de': 'Vollständig',
        'ru': 'Полный'
      },
      'completeVideo': {
        'en': 'Complete Video',
        'zh_CN': '完整视频',
        'zh_TW': '完整視頻',
        'ja': '完全動画',
        'ko': '완전 비디오',
        'es': 'Video completo',
        'fr': 'Vidéo complète',
        'de': 'Vollständiges Video',
        'ru': 'Полное видео'
      },
      'videoStream': {
        'en': 'Video stream',
        'zh_CN': '视频流',
        'zh_TW': '視頻流',
        'ja': '動画ストリーム',
        'ko': '비디오 스트림',
        'es': 'Flujo de video',
        'fr': 'Flux vidéo',
        'de': 'Video-Stream',
        'ru': 'Видео поток'
      },
      'audioStream': {
        'en': 'Audio stream',
        'zh_CN': '音频流',
        'zh_TW': '音頻流',
        'ja': '音声ストリーム',
        'ko': '오디오 스트림',
        'es': 'Flujo de audio',
        'fr': 'Flux audio',
        'de': 'Audio-Stream',
        'ru': 'Аудио поток'
      },
      'file': {
        'en': 'file',
        'zh_CN': '文件',
        'zh_TW': '文件',
        'ja': 'ファイル',
        'ko': '파일',
        'es': 'archivo',
        'fr': 'fichier',
        'de': 'Datei',
        'ru': 'файл'
      }
    }
    
    const localeTexts = translations[key]
    if (localeTexts && localeTexts[cachedLocale]) {
      return localeTexts[cachedLocale]
    }
    return localeTexts ? localeTexts['en'] : key
  }

  // 初始化语言缓存
  updateLocaleCache()

  // 监听语言变化
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'localeChanged') {
        updateLocaleCache().then(() => {
          // 语言变化后重新渲染UI
          updateResourceList()
          
          // 更新按钮文本
          const btn = document.getElementById('linkcore-bilibili-download-btn')
          if (btn) {
            applyClientLocaleToButton(btn)
          }
        })
      }
    })
  }

  // 监听来自标签页的语言变化消息
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'localeChanged') {
        updateLocaleCache().then(() => {
          // 语言变化后重新渲染UI
          updateResourceList()
          
          // 更新按钮文本
          const btn = document.getElementById('linkcore-bilibili-download-btn')
          if (btn) {
            applyClientLocaleToButton(btn)
          }
        })
      }
    })
  }

  // 格式化文件大小显示（同步版本）
  const formatFileSize = (bytes) => {
    if (!bytes || bytes <= 0) return cachedUnknownSizeText
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    // 根据大小选择合适的小数位数
    let decimals = 0
    if (unitIndex > 0) {
      if (size < 10) decimals = 2
      else if (size < 100) decimals = 1
      else decimals = 0
    }
    
    return `${size.toFixed(decimals)} ${units[unitIndex]}`
  }

  // 创建资源选择下拉框
  const createResourceDropdown = () => {
    const dropdown = document.createElement('div')
    dropdown.id = 'linkcore-resource-dropdown'
    const dStyle = dropdown.style
    dStyle.position = 'fixed'  // 使用 fixed 定位，不受容器限制
    dStyle.top = '0'
    dStyle.left = '0'
    dStyle.marginTop = '0'
    dStyle.width = '400px'
    dStyle.maxHeight = '400px'
    dStyle.backgroundColor = '#ffffff'
    dStyle.borderRadius = '6px'
    dStyle.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
    dStyle.zIndex = '999999'
    dStyle.display = 'none'
    dStyle.flexDirection = 'column'
    dStyle.overflow = 'hidden'
    dStyle.border = '1px solid #e5e5e5'

    // 顶部固定区域（放置清空按钮）
    const header = document.createElement('div')
    header.id = 'linkcore-dropdown-header'
    const hStyle = header.style
    hStyle.flexShrink = '0'
    hStyle.flexGrow = '0'

    // 内容区域
    const content = document.createElement('div')
    content.id = 'linkcore-resource-list'
    const cStyle = content.style
    cStyle.flexGrow = '1'
    cStyle.maxHeight = '400px'
    cStyle.overflowY = 'auto'
    cStyle.overflowX = 'hidden'

    dropdown.appendChild(header)
    dropdown.appendChild(content)

    return dropdown
  }

  // 创建清空资源按钮
  const createClearButton = () => {
    const clearBtn = document.createElement('div')
    clearBtn.id = 'linkcore-clear-resources-btn'
    const bStyle = clearBtn.style
    bStyle.padding = '10px 12px'
    bStyle.backgroundColor = '#fff1f0'
    bStyle.borderTop = '1px solid #ffccc7'
    bStyle.borderBottom = '1px solid #ffccc7'
    bStyle.cursor = 'pointer'
    bStyle.display = 'flex'
    bStyle.alignItems = 'center'
    bStyle.justifyContent = 'center'
    bStyle.gap = '6px'
    bStyle.transition = 'background-color 0.2s ease'
    bStyle.fontSize = '12px'
    bStyle.color = '#ff4d4f'
    bStyle.fontWeight = '500'

    clearBtn.addEventListener('mouseenter', () => {
      clearBtn.style.backgroundColor = '#ffccc7'
    })
    clearBtn.addEventListener('mouseleave', () => {
      clearBtn.style.backgroundColor = '#fff1f0'
    })

    clearBtn.addEventListener('click', () => {
      log('Clear button clicked')
      window.dispatchEvent(new Event('linkcore-clear-resources'))
      const dropdown = document.getElementById('linkcore-resource-dropdown')
      if (dropdown) dropdown.style.display = 'none'
    })

    const icon = document.createElement('span')
    icon.textContent = '🗑️'
    icon.style.fontSize = '14px'

    const text = document.createElement('span')
    text.textContent = getLocalizedText('clearResourceList')

    clearBtn.appendChild(icon)
    clearBtn.appendChild(text)

    return clearBtn
  }

  // 更新资源列表
  const updateResourceList = () => {
    const { resources: viewResources } = getUniversalScopedResources()
    log('Updating resource list, resources:', JSON.stringify(viewResources))
    log('Video count:', viewResources.video?.length || 0)
    log('Audio count:', viewResources.audio?.length || 0)
    log('M4S count:', viewResources.m4s?.length || 0)
    log('Combined count:', viewResources.combined?.length || 0)
    
    const content = document.getElementById('linkcore-resource-list')
    if (!content) {
      log('Resource list container not found')
      return
    }

    // 检查是否资源突然变为空（可能是意外清除）
    const totalResources = (viewResources.video?.length || 0) + 
                          (viewResources.audio?.length || 0) + 
                          (viewResources.combined?.length || 0)
    
    if (totalResources === 0 && content.children.length > 0) {
      log('Warning: Resources became empty but UI had content, this might be an unexpected clear')
      // 可以在这里添加恢复逻辑，但现在先记录
    }

    content.innerHTML = ''

    const referer = window.location.href

    // 如果有资源，添加清空按钮到顶部固定区域
    const header = document.getElementById('linkcore-dropdown-header')
    if (header) {
      header.innerHTML = ''
      if (hasAnySniffedResources(viewResources)) {
        const clearBtn = createClearButton()
        header.appendChild(clearBtn)
      }
    }

    // 优先显示组合的DASH视频（视频+音频）
    if (viewResources.combined && viewResources.combined.length > 0) {
      const combinedSection = document.createElement('div')

      const combinedTitle = document.createElement('div')
      combinedTitle.textContent = getLocalizedText('dashCompleteVideo')
      combinedTitle.style.fontSize = '12px'
      combinedTitle.style.fontWeight = 'bold'
      combinedTitle.style.padding = '10px 12px 5px'
      combinedTitle.style.color = '#00a1d6'
      combinedTitle.style.backgroundColor = '#f5f5f5'
      combinedSection.appendChild(combinedTitle)

      viewResources.combined.forEach((resource, index) => {
        const item = createCombinedResourceItem(resource, referer, index)
        combinedSection.appendChild(item)
      })

      content.appendChild(combinedSection)
    }

    // 显示 M4S 资源（B站 DASH 视频）
    if (viewResources.m4s && viewResources.m4s.length > 0) {
      const m4sSection = document.createElement('div')

      const m4sTitle = document.createElement('div')
      m4sTitle.textContent = getLocalizedText('dashSeparateStreams')
      m4sTitle.style.fontSize = '12px'
      m4sTitle.style.fontWeight = 'bold'
      m4sTitle.style.padding = '10px 12px 5px'
      m4sTitle.style.color = '#999'
      m4sTitle.style.backgroundColor = '#f5f5f5'
      m4sSection.appendChild(m4sTitle)

      viewResources.m4s.forEach((resource, index) => {
        const item = createResourceItem(resource, referer, index)
        m4sSection.appendChild(item)
      })

      content.appendChild(m4sSection)
    }

    // 显示普通视频资源
    if (viewResources.video && viewResources.video.length > 0) {
      const videoSection = document.createElement('div')

      const videoTitle = document.createElement('div')
      videoTitle.textContent = getLocalizedText('videoResources')
      videoTitle.style.fontSize = '12px'
      videoTitle.style.fontWeight = 'bold'
      videoTitle.style.padding = '10px 12px 5px'
      videoTitle.style.color = '#333'
      videoTitle.style.backgroundColor = '#f5f5f5'
      videoSection.appendChild(videoTitle)

      viewResources.video.forEach((resource, index) => {
        // 如果M4S资源没有在M4S区域显示，则在这里显示
        const isM4S = resource.url.includes('.m4s')
        const shouldShowInM4SSection = isM4S && viewResources.m4s && viewResources.m4s.length > 0
        
        if (!shouldShowInM4SSection) {
          const item = createResourceItem(resource, referer, index)
          videoSection.appendChild(item)
        }
      })

      if (videoSection.children.length > 1) { // 除了标题还有其他内容
        content.appendChild(videoSection)
      }
    }

    // 显示音频资源
    if (viewResources.audio && viewResources.audio.length > 0) {
      const audioSection = document.createElement('div')

      const audioTitle = document.createElement('div')
      audioTitle.textContent = getLocalizedText('audioResources')
      audioTitle.style.fontSize = '12px'
      audioTitle.style.fontWeight = 'bold'
      audioTitle.style.padding = '10px 12px 5px'
      audioTitle.style.color = '#333'
      audioTitle.style.backgroundColor = '#f5f5f5'
      audioSection.appendChild(audioTitle)

      viewResources.audio.forEach((resource, index) => {
        // 如果M4S资源没有在M4S区域显示，则在这里显示
        const isM4S = resource.url.includes('.m4s')
        const shouldShowInM4SSection = isM4S && viewResources.m4s && viewResources.m4s.length > 0
        
        if (!shouldShowInM4SSection) {
          const item = createResourceItem(resource, referer, index)
          audioSection.appendChild(item)
        }
      })

      if (audioSection.children.length > 1) {
        content.appendChild(audioSection)
      }
    }

    if (content.children.length === 0) {
      const noData = document.createElement('div')
      noData.style.textAlign = 'center'
      noData.style.color = '#999'
      noData.style.padding = '20px'
      noData.style.fontSize = '12px'

      const tip1 = document.createElement('div')
      tip1.textContent = getLocalizedText('noVideoResourcesDetected')
      tip1.style.marginBottom = '8px'

      const tip2 = document.createElement('div')
      tip2.textContent = getLocalizedText('rightClickTip')
      tip2.style.color = '#666'
      tip2.style.fontSize = '11px'

      noData.appendChild(tip1)
      noData.appendChild(tip2)
      content.appendChild(noData)
    }
  }

  // 创建组合资源项（视频+音频）
  const createCombinedResourceItem = (resource, referer, index) => {
    const item = document.createElement('div')
    const iStyle = item.style
    iStyle.padding = '8px 12px'
    iStyle.borderBottom = '1px solid #f0f0f0'
    iStyle.backgroundColor = '#ffffff'
    iStyle.cursor = 'pointer'
    iStyle.transition = 'background-color 0.2s ease'
    iStyle.fontSize = '12px'

    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = '#f5f5f5'
    })
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = '#ffffff'
    })

    const info = document.createElement('div')
    info.style.display = 'flex'
    info.style.justifyContent = 'space-between'
    info.style.alignItems = 'center'
    info.style.marginBottom = '4px'

    // 生成友好的文件名（与普通资源项相同的逻辑）
    let displayName = ''
    let sizeInfo = ''
    try {
      // 尝试从页面标题获取
      const pageTitle = document.title || window.top.document.title || ''
      const ext = 'DASH'

      // 格式化大小信息（总是显示，即使是未知大小）
      sizeInfo = ` (${formatFileSize(resource.size)})`

      if (pageTitle) {
        // 清理标题，移除常见后缀
        let cleanTitle = pageTitle
          .replace(/\s*[-_│|]\s*在线播放.*$/i, '')
          .replace(/\s*[-_│|]\s*在线观看.*$/i, '')
          .replace(/\s*[-_│|]\s*樱花动漫.*$/i, '')
          .replace(/\s*[-_│|]\s*\w+视频.*$/i, '')
          .trim()

        if (cleanTitle) {
          displayName = `${cleanTitle}, ${ext}${getLocalizedText('completeVideo')}${sizeInfo}`
          // 如果有质量信息，添加到文件名
          if (resource.quality) {
            displayName = `${cleanTitle}, ${resource.quality}, ${ext}${getLocalizedText('completeVideo')}${sizeInfo}`
          }
        } else {
          displayName = resource.name || `${getLocalizedText('completeVideo')} ${index + 1}${sizeInfo}`
        }
      } else {
        displayName = resource.name || `${getLocalizedText('completeVideo')} ${index + 1}${sizeInfo}`
      }
    } catch (e) {
      displayName = resource.name || `完整视频 ${index + 1}`
      displayName += ` (${formatFileSize(resource.size)})`
    }

    const name = document.createElement('div')
    name.textContent = displayName
    name.style.fontSize = '12px'
    name.style.fontWeight = '500'
    name.style.color = '#333'
    name.style.flex = '1'
    name.style.overflow = 'hidden'
    name.style.textOverflow = 'ellipsis'
    name.style.whiteSpace = 'nowrap'
    name.style.marginRight = '8px'

    const badges = document.createElement('div')
    badges.style.display = 'flex'
    badges.style.gap = '4px'
    badges.style.flexShrink = '0'

    // 质量徽章
    if (resource.quality) {
      const quality = document.createElement('span')
      quality.textContent = resource.quality
      quality.style.fontSize = '11px'
      quality.style.color = '#00a1d6'
      quality.style.fontWeight = 'bold'
      quality.style.padding = '2px 6px'
      quality.style.backgroundColor = '#e6f7ff'
      quality.style.borderRadius = '3px'
      badges.appendChild(quality)
    }

    // 完整标记
    const completeTag = document.createElement('span')
    completeTag.textContent = getLocalizedText('complete')
    completeTag.style.fontSize = '11px'
    completeTag.style.color = '#52c41a'
    completeTag.style.fontWeight = 'bold'
    completeTag.style.padding = '2px 6px'
    completeTag.style.backgroundColor = '#f6ffed'
    completeTag.style.borderRadius = '3px'
    badges.appendChild(completeTag)

    // 文件大小徽章（只在有准确大小时显示）
    if (resource.size && resource.size > 0) {
      const size = document.createElement('span')
      const sizeText = formatFileSize(resource.size)
      size.textContent = sizeText
      size.style.fontSize = '11px'
      size.style.color = '#666'
      size.style.fontWeight = '500'
      size.style.padding = '2px 6px'
      size.style.backgroundColor = '#f0f0f0'
      size.style.borderRadius = '3px'
      size.style.border = '1px solid #e0e0e0'
      badges.appendChild(size)
    }

    info.appendChild(name)
    info.appendChild(badges)

    // 显示两个资源的URL
    const videoUrl = document.createElement('div')
    videoUrl.textContent = `${getLocalizedText('videoStream')}: ${resource.videoUrl}`
    videoUrl.style.fontSize = '10px'
    videoUrl.style.color = '#999'
    videoUrl.style.overflow = 'hidden'
    videoUrl.style.textOverflow = 'ellipsis'
    videoUrl.style.whiteSpace = 'nowrap'
    videoUrl.style.marginBottom = '2px'

    const audioUrl = document.createElement('div')
    audioUrl.textContent = `${getLocalizedText('audioStream')}: ${resource.audioUrl}`
    audioUrl.style.fontSize = '10px'
    audioUrl.style.color = '#999'
    audioUrl.style.overflow = 'hidden'
    audioUrl.style.textOverflow = 'ellipsis'
    audioUrl.style.whiteSpace = 'nowrap'

    item.appendChild(info)
    item.appendChild(videoUrl)
    item.appendChild(audioUrl)

    item.addEventListener('click', () => {
      // 生成建议的文件名
      let videoFilename = ''
      let audioFilename = ''
      try {
        const pageTitle = document.title || window.top.document.title || ''

        if (pageTitle) {
          let cleanTitle = pageTitle
            .replace(/\s*[-_│|]\s*在线播放.*$/i, '')
            .replace(/\s*[-_│|]\s*在线观看.*$/i, '')
            .replace(/\s*[-_│|]\s*樱花动漫.*$/i, '')
            .replace(/\s*[-_│|]\s*\w+视频.*$/i, '')
            .replace(/[<>:"/\\|?*]/g, '_')  // 替换非法文件名字符
            .trim()

          if (cleanTitle) {
            // 视频流文件名
            videoFilename = `${cleanTitle}_${getLocalizedText('videoStream').replace(':', '')}.m4s`
            // 音频流文件名
            audioFilename = `${cleanTitle}_${getLocalizedText('audioStream').replace(':', '')}.m4s`
          }
        }
      } catch (e) {
      }

      // 同时下载视频和音频
      sendResourceToClient(resource.videoUrl, referer, videoFilename)
      setTimeout(() => {
        sendResourceToClient(resource.audioUrl, referer, audioFilename)
      }, 100)
      const dropdown = document.getElementById('linkcore-resource-dropdown')
      if (dropdown) dropdown.style.display = 'none'
    })

    return item
  }

  // 创建资源项
  const createResourceItem = (resource, referer, index) => {
    const item = document.createElement('div')
    const iStyle = item.style
    iStyle.padding = '8px 12px'
    iStyle.borderBottom = '1px solid #f0f0f0'
    iStyle.backgroundColor = '#ffffff'
    iStyle.cursor = 'pointer'
    iStyle.transition = 'background-color 0.2s ease'
    iStyle.fontSize = '12px'

    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = '#f5f5f5'
    })
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = '#ffffff'
    })

    const info = document.createElement('div')
    info.style.display = 'flex'
    info.style.justifyContent = 'space-between'
    info.style.alignItems = 'center'
    info.style.marginBottom = '4px'

    // 生成友好的文件名
    let displayName = ''
    let sizeInfo = ''
    try {
      // 尝试从页面标题获取
      const pageTitle = document.title || window.top.document.title || ''
      const ext = resource.ext ? resource.ext.toUpperCase() : 'VIDEO'

      // 格式化大小信息（总是显示，即使是未知大小）
      sizeInfo = ` (${formatFileSize(resource.size)})`

      if (pageTitle) {
        // 清理标题，移除常见后缀
        let cleanTitle = pageTitle
          .replace(/\s*[-_│|]\s*在线播放.*$/i, '')
          .replace(/\s*[-_│|]\s*在线观看.*$/i, '')
          .replace(/\s*[-_│|]\s*樱花动漫.*$/i, '')
          .replace(/\s*[-_│|]\s*\w+视频.*$/i, '')
          .trim()

        if (cleanTitle) {
          displayName = `${cleanTitle}, ${ext}${getLocalizedText('file')}${sizeInfo}`
          // 如果有质量信息，添加到文件名
          if (resource.quality && resource.quality !== ext) {
            displayName = `${cleanTitle}, ${resource.quality}, ${ext}${getLocalizedText('file')}${sizeInfo}`
          }
        } else {
          displayName = resource.name || `${ext} ${index + 1}${sizeInfo}`
        }
      } else {
        displayName = resource.name || `${ext} ${index + 1}${sizeInfo}`
      }
    } catch (e) {
      displayName = resource.name || `Resource ${index + 1}`
      displayName += ` (${formatFileSize(resource.size)})`
    }

    const name = document.createElement('div')
    name.textContent = displayName
    name.style.fontSize = '12px'
    name.style.fontWeight = '500'
    name.style.color = '#333'
    name.style.flex = '1'
    name.style.overflow = 'hidden'
    name.style.textOverflow = 'ellipsis'
    name.style.whiteSpace = 'nowrap'
    name.style.marginRight = '8px'

    const badges = document.createElement('div')
    badges.style.display = 'flex'
    badges.style.gap = '4px'
    badges.style.flexShrink = '0'

    // 质量徽章
    if (resource.quality) {
      const quality = document.createElement('span')
      quality.textContent = resource.quality
      quality.style.fontSize = '11px'
      quality.style.color = '#00a1d6'
      quality.style.fontWeight = 'bold'
      quality.style.padding = '2px 6px'
      quality.style.backgroundColor = '#e6f7ff'
      quality.style.borderRadius = '3px'
      badges.appendChild(quality)
    }

    // 文件大小徽章（只在有准确大小时显示）
    if (resource.size && resource.size > 0) {
      const size = document.createElement('span')
      const sizeText = formatFileSize(resource.size)
      size.textContent = sizeText
      size.style.fontSize = '11px'
      size.style.color = '#666'
      size.style.fontWeight = '500'
      size.style.padding = '2px 6px'
      size.style.backgroundColor = '#f0f0f0'
      size.style.borderRadius = '3px'
      size.style.border = '1px solid #e0e0e0'
      badges.appendChild(size)
    }

    info.appendChild(name)
    if (badges.children.length > 0) {
      info.appendChild(badges)
    }

    const url = document.createElement('div')
    url.textContent = resource.url
    url.style.fontSize = '10px'
    url.style.color = '#999'
    url.style.overflow = 'hidden'
    url.style.textOverflow = 'ellipsis'
    url.style.whiteSpace = 'nowrap'

    item.appendChild(info)
    item.appendChild(url)

    item.addEventListener('click', () => {
      // 生成建议的文件名
      let filename = ''
      try {
        const pageTitle = document.title || window.top.document.title || ''
        const ext = resource.ext || 'video'

        if (pageTitle) {
          let cleanTitle = pageTitle
            .replace(/\s*[-_│|]\s*在线播放.*$/i, '')
            .replace(/\s*[-_│|]\s*在线观看.*$/i, '')
            .replace(/\s*[-_│|]\s*樱花动漫.*$/i, '')
            .replace(/\s*[-_│|]\s*\w+视频.*$/i, '')
            .replace(/[<>:"/\\|?*]/g, '_')  // 替换非法文件名字符
            .trim()

          if (cleanTitle) {
            // 如果有质量信息，添加到文件名
            if (resource.quality && resource.quality !== ext.toUpperCase()) {
              filename = `${cleanTitle}_${resource.quality}.${ext}`
            } else {
              filename = `${cleanTitle}.${ext}`
            }
          }
        }
      } catch (e) {
      }

      sendResourceToClient(resource.url, referer, filename)
      const dropdown = document.getElementById('linkcore-resource-dropdown')
      if (dropdown) dropdown.style.display = 'none'
    })

    return item
  }

  const downloadSingleResource = (resource, referer, index) => {
    let filename = ''
    try {
      const pageTitle = document.title || window.top.document.title || ''
      const ext = resource.ext || 'video'

      if (pageTitle) {
        let cleanTitle = pageTitle
          .replace(/\s*[-_│|]\s*在线播放.*$/i, '')
          .replace(/\s*[-_│|]\s*在线观看.*$/i, '')
          .replace(/\s*[-_│|]\s*樱花动漫.*$/i, '')
          .replace(/\s*[-_│|]\s*\w+视频.*$/i, '')
          .replace(/[<>:"/\\|?*]/g, '_')
          .trim()

        if (cleanTitle) {
          if (resource.quality && resource.quality !== ext.toUpperCase()) {
            filename = `${cleanTitle}_${resource.quality}.${ext}`
          } else {
            filename = `${cleanTitle}.${ext}`
          }
        }
      }
    } catch (e) {
    }

    sendResourceToClient(resource.url, referer, filename)
    const dropdown = document.getElementById('linkcore-resource-dropdown')
    if (dropdown) dropdown.style.display = 'none'
  }

  const downloadCombinedResource = (resource, referer) => {
    let videoFilename = ''
    let audioFilename = ''
    try {
      const pageTitle = document.title || window.top.document.title || ''

      if (pageTitle) {
        let cleanTitle = pageTitle
          .replace(/\s*[-_│|]\s*在线播放.*$/i, '')
          .replace(/\s*[-_│|]\s*在线观看.*$/i, '')
          .replace(/\s*[-_│|]\s*樱花动漫.*$/i, '')
          .replace(/\s*[-_│|]\s*\w+视频.*$/i, '')
          .replace(/[<>:"/\\|?*]/g, '_')
          .trim()

        if (cleanTitle) {
          videoFilename = `${cleanTitle}_${getLocalizedText('videoStream').replace(':', '')}.m4s`
          audioFilename = `${cleanTitle}_${getLocalizedText('audioStream').replace(':', '')}.m4s`
        }
      }
    } catch (e) {
    }

    sendResourceToClient(resource.videoUrl, referer, videoFilename)
    setTimeout(() => {
      sendResourceToClient(resource.audioUrl, referer, audioFilename)
    }, 100)
    const dropdown = document.getElementById('linkcore-resource-dropdown')
    if (dropdown) dropdown.style.display = 'none'
  }

  const getAutoDownloadCandidates = (resources) => {
    const r = resources || sniffedResources
    const candidates = []
    const hasM4sSection = !!(r.m4s && r.m4s.length > 0)

    if (r.combined && r.combined.length > 0) {
      r.combined.forEach((resource, index) => {
        candidates.push({ section: 'combined', resource, index })
      })
    }

    if (r.m4s && r.m4s.length > 0) {
      r.m4s.forEach((resource, index) => {
        candidates.push({ section: 'm4s', resource, index })
      })
    }

    if (r.video && r.video.length > 0) {
      r.video.forEach((resource, index) => {
        const isM4S = resource.url && resource.url.includes('.m4s')
        const shouldShowInM4SSection = isM4S && hasM4sSection
        if (!shouldShowInM4SSection) {
          candidates.push({ section: 'video', resource, index })
        }
      })
    }

    if (r.audio && r.audio.length > 0) {
      r.audio.forEach((resource, index) => {
        const isM4S = resource.url && resource.url.includes('.m4s')
        const shouldShowInM4SSection = isM4S && hasM4sSection
        if (!shouldShowInM4SSection) {
          candidates.push({ section: 'audio', resource, index })
        }
      })
    }

    return candidates
  }

  const tryAutoDownloadForUniversalButton = () => {
    checkAndRestoreResources()
    const referer = window.location.href
    const { resources: viewResources } = getUniversalScopedResources()
    const candidates = getAutoDownloadCandidates(viewResources)
    if (candidates.length !== 1) return false

    const c = candidates[0]
    if (c.section === 'audio') return false

    if (c.section === 'combined') {
      downloadCombinedResource(c.resource, referer)
      return true
    }

    downloadSingleResource(c.resource, referer, c.index)
    return true
  }

  // 显示资源选择下拉框
  const showResourceDropdown = () => {
    const dropdown = document.getElementById('linkcore-resource-dropdown')
    if (dropdown) {
      if (dropdown.style.display === 'flex') {
        dropdown.style.display = 'none'
      } else {
        // 在显示下拉框前检查是否需要恢复资源
        if (!checkAndRestoreResources()) {
          // 如果没有恢复，正常更新资源列表
          updateResourceList()
        } else {
          // 如果恢复了资源，重新更新资源列表
          updateResourceList()
        }
        dropdown.style.display = 'flex'
        adjustDropdownPosition(dropdown)
      }
    }
  }

  // 调整下拉框位置，确保在屏幕内
  const adjustDropdownPosition = (dropdown) => {
    const btn = document.getElementById('linkcore-bilibili-download-btn')
    if (!btn) return

    const btnRect = btn.getBoundingClientRect()
    const dropdownRect = dropdown.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let top = btnRect.bottom + 5
    let left = btnRect.left

    // 检查是否超出右边界
    if (left + dropdownRect.width > viewportWidth) {
      left = viewportWidth - dropdownRect.width - 10
    }

    // 检查是否超出左边界
    if (left < 10) {
      left = 10
    }

    // 检查是否超出下边界
    if (top + dropdownRect.height > viewportHeight) {
      // 如果下方空间不足，显示在按钮上方
      top = btnRect.top - dropdownRect.height - 5
    }

    // 检查是否超出上边界
    if (top < 10) {
      top = 10
    }

    dropdown.style.position = 'fixed'
    dropdown.style.top = top + 'px'
    dropdown.style.left = left + 'px'
    dropdown.style.right = 'auto'

    log('Dropdown position adjusted:', { top, left, viewportWidth, viewportHeight })
  }

  // 点击其他地方关闭下拉框
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('linkcore-resource-dropdown')
    const btn = document.getElementById('linkcore-bilibili-download-btn')
    if (dropdown && dropdown.style.display === 'flex') {
      const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
      if (wrapper && !wrapper.contains(e.target)) {
        dropdown.style.display = 'none'
      }
    }
  }, true)

  // 检查按钮是否被用户关闭
  const isButtonClosedByUser = () => {
    // 检查全局标记
    if (window.linkcoreButtonClosed) return true
    
    // 检查wrapper上的标记
    const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
    if (wrapper && wrapper.getAttribute('data-user-closed') === 'true') {
      window.linkcoreButtonClosed = true
      return true
    }
    
    return false
  }

  // 上次更新资源列表的时间戳，用于节流
  let lastResourceListUpdate = 0
  const RESOURCE_LIST_UPDATE_INTERVAL = 100 // 减少到100ms，提高响应速度

  // 更新按钮显示状态
  const updateButtonVisibility = () => {
    if (perVideoModeActive) {
      const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
      if (wrapper) wrapper.style.display = 'none'
      return
    }
    const btn = document.getElementById('linkcore-download-btn')
    const { resources: viewResources } = getUniversalScopedResources()
    log('Update button visibility, btn:', !!btn, 'total:', viewResources.total, 'sniffer enabled:', videoSnifferConfig.enabled, 'config loaded:', videoSnifferConfig.loaded)
    if (!btn) return

    const hasResources = hasAnySniffedResources(viewResources)
    const snifferEnabled = videoSnifferConfig.enabled
    const configLoaded = videoSnifferConfig.loaded
    const wrapper = btn.parentElement?.parentElement // 现在btn在buttonContainer中，wrapper是buttonContainer的父元素

    log('Wrapper element:', wrapper)
    log('Wrapper current display:', wrapper ? wrapper.style.display : 'no wrapper')

    // 检查按钮是否已被用户关闭
    const isButtonClosed = isButtonClosedByUser()

    // 只有在配置已加载、嗅探器启用、有资源且按钮未被用户关闭时才显示按钮
    if (configLoaded && snifferEnabled && hasResources && !isButtonClosed) {
      log('Showing button, updating resource list...')
      if (wrapper) {
        const wasHidden = wrapper.style.display === 'none'

        // 确保按钮始终显示（有资源时）
        wrapper.style.display = 'block'
        wrapper.style.visibility = 'visible'

        // 只有在按钮之前是隐藏的时候才需要特殊处理位置
        if (wasHidden) {
          // 先确保位置正确设置，再显示按钮
          const isNonPlayerContainer = ['#content', '#content-inner', '.content', '.article-container', 'article', 'main'].includes(currentContainerSelector)

          if (isNonPlayerContainer) {
            // 非播放器容器，按钮固定在右上角
            wrapper.style.position = 'fixed'
            wrapper.style.top = '20px'
            wrapper.style.right = '20px'
            log('Updated button position for non-player container before showing')
          } else if (!hasBeenDragged && currentContainer) {
            // 播放器容器且未被拖拽过，更新位置
            const container = currentContainer
            const rect = container.getBoundingClientRect()
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight
            const buttonWidth = 150
            const buttonHeight = 36

            const containerWidth = container.offsetWidth
            const containerHeight = container.offsetHeight

            // 对于小窗口（预览播放器），使用不同的偏移
            let newTop
            if (containerWidth < 400 || containerHeight < 200) {
              newTop = rect.top - 28
            } else {
              newTop = rect.top - 34
            }

            // 如果上方没有空间，则显示在容器内部
            if (newTop < 0) {
              newTop = rect.top + 8
            }

            let newRight = viewportWidth - rect.right

            // 确保按钮在视口内
            if (newTop < 0) newTop = 0
            if (newTop + buttonHeight > viewportHeight) newTop = viewportHeight - buttonHeight
            if (newRight < 0) newRight = 0
            if (newRight + buttonWidth > viewportWidth) newRight = viewportWidth - buttonWidth

            wrapper.style.position = 'fixed'
            wrapper.style.top = `${newTop}px`
            wrapper.style.right = `${newRight}px`
            log('Updated button position for player container before showing, top:', newTop, 'right:', newRight)
          }
        }

        log('Wrapper display set to block, current display:', wrapper.style.display)
        log('Wrapper position:', wrapper.style.position)
        log('Wrapper top:', wrapper.style.top, 'right:', wrapper.style.right)
      }

      // 立即更新资源列表，不使用节流
      updateResourceList()
    } else {
      log('Hiding button - config loaded:', configLoaded, 'sniffer enabled:', snifferEnabled, 'has resources:', hasResources, 'button closed:', isButtonClosed)
      // 如果嗅探器被禁用或没有资源，隐藏按钮（除非被拖拽过）
      if (wrapper && !hasBeenDragged && !positionLocked && !isButtonClosed) {
        wrapper.style.display = 'none'
        log('Hiding button - sniffer disabled or no resources and not dragged/locked/closed')
      } else if (wrapper && !snifferEnabled && configLoaded) {
        // 如果嗅探器被禁用，强制隐藏按钮（即使被拖拽过）
        wrapper.style.display = 'none'
        log('Hiding button - sniffer disabled by user')
      } else if (wrapper && isButtonClosed) {
        // 如果按钮被用户关闭，强制隐藏
        wrapper.style.display = 'none'
        log('Hiding button - closed by user')
      } else {
        log('Keeping button visible - dragged:', hasBeenDragged, 'locked:', positionLocked, 'closed:', isButtonClosed, 'sniffer enabled:', snifferEnabled)
      }
    }
  }

  let currentContainer = null
  let currentContainerSelector = ''
  let hasBeenDragged = false // 标记按钮是否被拖拽过
  let isButtonHovered = false // 标记按钮是否正在被悬停
  let positionLocked = false // 标记位置是否已锁定（只有悬停新视频才会解锁）
  let hideButtonTimeout = null // 按钮隐藏倒计时
  let buttonStabilityTimer = null // 按钮稳定性定时器

  // 按钮稳定性检查 - 确保有资源且嗅探器启用时按钮始终可见
  const ensureButtonStability = () => {
    const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
    const isButtonClosed = isButtonClosedByUser()

    if (perVideoModeActive) {
      if (wrapper && wrapper.style.display !== 'none') {
        wrapper.style.display = 'none'
      }
      return
    }
    
    if (wrapper && sniffedResources && sniffedResources.total > 0 && videoSnifferConfig.enabled && videoSnifferConfig.loaded && !isButtonClosed) {
      // 如果有资源且嗅探器启用但按钮被隐藏且未被用户关闭，重新显示
      if (wrapper.style.display === 'none') {
        wrapper.style.display = 'block'
        wrapper.style.visibility = 'visible'
        log('Button stability check: restored hidden button with resources and sniffer enabled')
      }
    } else if (wrapper && (!videoSnifferConfig.enabled && videoSnifferConfig.loaded) || isButtonClosed) {
      // 如果嗅探器被禁用或按钮被用户关闭，强制隐藏按钮
      if (wrapper.style.display !== 'none') {
        wrapper.style.display = 'none'
        log('Button stability check: hidden button due to sniffer disabled or user closed')
      }
    }
  }

  // 启动按钮稳定性检查
  const startButtonStabilityCheck = () => {
    if (buttonStabilityTimer) {
      clearInterval(buttonStabilityTimer)
    }
    buttonStabilityTimer = setInterval(ensureButtonStability, 2000) // 每2秒检查一次
  }

  // 启动稳定性检查
  startButtonStabilityCheck()

  const clearHideTimeout = () => {
    if (hideButtonTimeout) {
      clearTimeout(hideButtonTimeout)
      hideButtonTimeout = null
    }
  }

  const startHideTimeout = () => {
    clearHideTimeout()
    // 增加隐藏延迟到10秒，给用户更多时间操作
    hideButtonTimeout = setTimeout(() => {
      const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
      const isButtonClosed = isButtonClosedByUser()
      
      // 只有在没有资源、没有被拖拽、没有被悬停、没有被用户关闭且嗅探器启用时才隐藏
      if (wrapper && !isButtonHovered && !hasBeenDragged && !isButtonClosed && (!sniffedResources || sniffedResources.total === 0 || !videoSnifferConfig.enabled)) {
        wrapper.style.display = 'none'
        positionLocked = false
        hoveredVideoContainer = null
        log('Button hidden after 10s timeout')
      } else {
        log('Button not hidden - hovered:', isButtonHovered, 'dragged:', hasBeenDragged, 'closed:', isButtonClosed, 'resources:', sniffedResources?.total || 0, 'sniffer enabled:', videoSnifferConfig.enabled)
      }
    }, 10000) // 增加到10秒
  }

  const ensureBilibiliButton = () => {
    if (!isTopWindow()) return
    if (!document) return

    // 如果按钮已被用户关闭，不重新创建
    if (isButtonClosedByUser()) {
      log('Button was closed by user, skipping creation')
      return
    }

    if (perVideoModeActive) {
      const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
      if (wrapper) wrapper.style.display = 'none'
    }

    log('Creating download button...')

    // 智能查找播放器容器（通用选择器）
    const selectors = [
      '.bpx-player-container',  // B站新版播放器
      '.bpx-player-video-area',
      '.bilibili-player-video-wrap',
      '#bilibili-player',
      '.xgplayer-container',  // xgplayer播放器（抖音等）
      '.xgplayer-video-container',
      '.xgplayer',
      '.video-js',           // video.js 播放器
      '.video-js-container',  // video.js 容器
      '.player-container',
      '.player-wrap',
      '.video-container',
      '.video-wrapper',
      '#player',
      '[class*="player"]',  // 任何包含 player 的 class
      '[id*="player"]',      // 任何包含 player 的 id
      '#content',             // 内容区域
      '#content-inner',       // 内容内部区域
      '.content',             // 通用内容区域
      '.article-container',   // 文章容器
      'article',              // 文章元素
      'main'                 // 主内容区域
    ]

    let container = null
    let containerSelector = ''
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el) {
        container = el
        containerSelector = sel
        break
      }
    }

    // 如果没找到容器，使用 body
    if (!container) {
      container = document.body
      containerSelector = 'body'
      log('No container found, using body')
    }

    log('Available containers:', selectors)
    log('Selected container:', containerSelector, container)

    // 检查容器是否变化
    const containerChanged = currentContainer !== container || currentContainerSelector !== containerSelector

    // 如果按钮已存在且（容器未变化 或 位置已锁定），不重新创建
    const existingBtn = document.getElementById('linkcore-bilibili-download-btn')
    if (existingBtn && (!containerChanged || positionLocked)) {
      log('Button already exists, skipping recreation. containerChanged:', containerChanged, 'positionLocked:', positionLocked)
      return
    }

    // 如果按钮已存在且容器变化，先删除它
    if (existingBtn) {
      const existingWrapper = existingBtn.parentElement
      if (existingWrapper && existingWrapper.id === 'linkcore-bilibili-download-btn-wrapper') {
        log('Removing existing button and dropdown to create new one, containerChanged:', containerChanged)
        // 不要在UI重置时清除资源，导致闪烁
        // window.dispatchEvent(new Event('linkcore-clear-resources'))
        // 直接删除整个wrapper（包括按钮和dropdown）
        existingWrapper.remove()
      }
    }

    // 更新当前容器记录
    currentContainer = container
    currentContainerSelector = containerSelector

    // 如果没找到专用播放器容器，查找 video 元素
    let videoElement = null
    if (!container) {
      videoElement = document.querySelector('video')
      if (videoElement) {
        // 为 video 创建一个包装容器
        let videoWrapper = videoElement.parentElement

        // 检查 video 是否已经在一个包装容器中
        if (videoWrapper && videoWrapper.tagName !== 'BODY') {
          // 检查这个容器是否只包含 video（或者主要是 video）
          const containerHeight = videoWrapper.offsetHeight
          const videoHeight = videoElement.offsetHeight

          // 如果容器高度远大于 video（说明容器里有很多其他内容），使用 video 自己的位置
          if (containerHeight > videoHeight * 1.5) {
            // 创建一个新的 wrapper 专门包装 video
            const newWrapper = document.createElement('div')
            newWrapper.style.position = 'relative'
            newWrapper.style.display = 'inline-block'
            newWrapper.style.width = '100%'

            videoWrapper.insertBefore(newWrapper, videoElement)
            newWrapper.appendChild(videoElement)

            container = newWrapper
            containerSelector = 'video-wrapper-created'
            log('Created wrapper for video')
          } else {
            // 容器大小合适，直接使用
            container = videoWrapper
            containerSelector = 'video-parent'
            log('Using video parent as container:', videoWrapper.tagName, videoWrapper.className || videoWrapper.id)
          }
        } else {
          // 父元素是 body，使用 fixed 定位
          container = document.body
          containerSelector = 'body'
        }
      } else {
        container = document.body
        containerSelector = 'body'
      }
    }

    if (!container) {
      log('No container found')
      return
    }

    log('Final container:', containerSelector, container)
    log('Container position:', window.getComputedStyle(container).position)
    log('Container dimensions:', container.offsetWidth, 'x', container.offsetHeight)

    // 为容器设置相对定位
    const computedPosition = window.getComputedStyle(container).position
    if (computedPosition === 'static') {
      container.style.position = 'relative'
      log('Set container position to relative')
    }

    const wrapper = document.createElement('div')
    wrapper.id = 'linkcore-bilibili-download-btn-wrapper'
    const wStyle = wrapper.style

    // 根据容器类型设置位置
    if (containerSelector === 'body' || containerSelector === '#content' ||
      containerSelector === '#content-inner' || containerSelector === '.content' ||
      containerSelector === '.article-container' || containerSelector === 'article' ||
      containerSelector === 'main') {
      // 非播放器容器（文章页面等），使用 fixed 定位在页面右上角
      wStyle.position = 'fixed'
      wStyle.top = '20px'
      wStyle.right = '20px'
      wStyle.zIndex = '999999'
      log('Non-player container, button at top-right corner')
    } else {
      // 播放器容器，按钮在容器外部上方，紧贴小窗口
      const containerWidth = container.offsetWidth
      const containerHeight = container.offsetHeight

      // 对于小窗口（预览播放器），使用fixed定位，紧贴小窗口上方
      if (containerWidth < 400 || containerHeight < 200) {
        const rect = container.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const buttonWidth = 150
        const buttonHeight = 36

        let newTop = rect.top - 28
        let newRight = viewportWidth - rect.right

        // 确保按钮在视口内
        if (newTop < 0) newTop = 0
        if (newTop + buttonHeight > viewportHeight) newTop = viewportHeight - buttonHeight
        if (newRight < 0) newRight = 0
        if (newRight + buttonWidth > viewportWidth) newRight = viewportWidth - buttonWidth

        wStyle.position = 'fixed'
        wStyle.top = `${newTop}px`
        wStyle.right = `${newRight}px`
        wStyle.zIndex = '999999'
        log('Small preview window, button above container, top:', newTop, 'right:', newRight)
      } else {
        // 正常播放器，按钮在容器外部上方，紧贴容器
        const rect = container.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const buttonWidth = 150
        const buttonHeight = 36

        let newTop = rect.top - 34
        let newRight = viewportWidth - rect.right

        // 确保按钮在视口内
        if (newTop < 0) newTop = 0
        if (newTop + buttonHeight > viewportHeight) newTop = viewportHeight - buttonHeight
        if (newRight < 0) newRight = 0
        if (newRight + buttonWidth > viewportWidth) newRight = viewportWidth - buttonWidth

        wStyle.position = 'fixed'
        wStyle.top = `${newTop}px`
        wStyle.right = `${newRight}px`
        wStyle.zIndex = '99999'
        log('Normal player, button above container, top:', newTop, 'right:', newRight)
      }
    }

    wStyle.pointerEvents = 'auto'
    
    // 根据当前状态设置初始显示状态
    if (isButtonClosedByUser()) {
      wStyle.display = 'none'
      wrapper.setAttribute('data-user-closed', 'true')
      log('Button created in closed state due to user preference')
    } else {
      wStyle.display = 'none' // 默认隐藏，检测到资源后显示
    }
    if (perVideoModeActive) {
      wStyle.display = 'none'
    }

    const btn = document.createElement('button')
    btn.id = 'linkcore-bilibili-download-btn'
    let label = 'Download with LinkCore'
    try {
      if (chrome && chrome.i18n && chrome.i18n.getMessage) {
        const msg = chrome.i18n.getMessage('contextMenuDownload')
        if (msg) label = msg
      }
    } catch (e) {
    }
    btn.title = label
    applyClientLocaleToButton(btn)
    const style = btn.style
    style.position = 'relative'
    style.padding = '6px 30px 6px 12px'
    style.background = '#00a1d6'
    style.color = '#ffffff'
    style.border = 'none'
    style.borderRadius = '4px'
    style.cursor = 'pointer'
    style.fontSize = '12px'
    style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'
    style.opacity = '0.9'
    style.transition = 'opacity 0.2s ease'
    style.pointerEvents = 'auto'
    style.display = 'inline-block'
    style.verticalAlign = 'top'
    style.overflow = 'visible'

    // 创建关闭按钮
    const closeBtn = document.createElement('button')
    closeBtn.id = 'linkcore-close-btn'
    closeBtn.textContent = '×'
    closeBtn.title = 'Close'
    const closeStyle = closeBtn.style
    closeStyle.position = 'absolute'
    closeStyle.right = '4px'
    closeStyle.top = '50%'
    closeStyle.transform = 'translateY(-50%)'
    closeStyle.width = '18px'
    closeStyle.height = '18px'
    closeStyle.padding = '0'
    closeStyle.background = '#ff4d4f'
    closeStyle.color = '#ffffff'
    closeStyle.border = 'none'
    closeStyle.borderRadius = '4px'
    closeStyle.cursor = 'pointer'
    closeStyle.fontSize = '12px'
    closeStyle.fontWeight = 'bold'
    closeStyle.boxShadow = '0 1px 3px rgba(0,0,0,0.25)'
    closeStyle.opacity = '0.9'
    closeStyle.transition = 'opacity 0.2s ease'
    closeStyle.pointerEvents = 'auto'
    closeStyle.display = 'inline-flex'
    closeStyle.alignItems = 'center'
    closeStyle.justifyContent = 'center'
    closeStyle.zIndex = '1'
    closeStyle.lineHeight = '18px'

    const icon = document.createElement('span')
    icon.textContent = '⭳'
    const iconStyle = icon.style
    iconStyle.display = 'inline-block'
    iconStyle.marginRight = '6px'
    iconStyle.fontSize = '14px'

    const countSpan = document.createElement('span')
    countSpan.className = 'linkcore-resource-count'
    const countStyle = countSpan.style
    countStyle.display = 'inline-block'
    countStyle.minWidth = '16px'
    countStyle.textAlign = 'left'

    btn.appendChild(icon)
    btn.appendChild(countSpan)

    // 创建按钮容器
    const buttonContainer = document.createElement('div')
    buttonContainer.style.display = 'inline-flex'
    buttonContainer.style.alignItems = 'stretch'
    buttonContainer.style.borderRadius = '4px'

    // 关闭按钮点击事件
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      
      // 隐藏整个按钮组
      wrapper.style.display = 'none'
      
      // 在wrapper上设置关闭标记，这样即使wrapper被重新创建也能保持状态
      wrapper.setAttribute('data-user-closed', 'true')
      
      // 设置全局关闭标记，防止按钮重新出现
      window.linkcoreButtonClosed = true
      
      log('Download button closed by user')
    })

    // 关闭按钮悬停效果
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.opacity = '1'
      closeBtn.style.background = '#ff7875'
    })
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.opacity = '0.9'
      closeBtn.style.background = '#ff4d4f'
    })

    // 将按钮添加到容器
    buttonContainer.appendChild(btn)
    btn.appendChild(closeBtn)
    // 监听按钮悬停状态，防止悬停时位置被重置
    buttonContainer.addEventListener('mouseenter', () => {
      isButtonHovered = true
      clearHideTimeout() // 清除隐藏倒计时
      btn.style.opacity = '1'
      log('Button container mouseenter, locked position')
    })
    buttonContainer.addEventListener('mouseleave', () => {
      isButtonHovered = false
      startHideTimeout() // 开始隐藏倒计时
      btn.style.opacity = '0.9'
      log('Button container mouseleave, unlocked position')
    })
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      showResourceDropdown()
    })

    // 长按拖拽功能
    let longPressTimer = null
    let isDragging = false
    let dragOffsetX = 0
    let dragOffsetY = 0
    let animationFrameId = null
    let hasMoved = false // 标记是否真正发生了拖拽移动

    const startDrag = (e) => {
      isDragging = true
      hasMoved = false // 重置移动标志

      const rect = wrapper.getBoundingClientRect()
      dragOffsetX = e.clientX - rect.left
      dragOffsetY = e.clientY - rect.top
      wStyle.cursor = 'grabbing'
      btn.style.cursor = 'grabbing'
      wStyle.transition = 'none'  // 移除过渡动画，使拖拽更流畅
      log('Drag started')
    }

    const onDrag = (e) => {
      if (!isDragging) return

      // 使用 requestAnimationFrame 优化性能
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = requestAnimationFrame(() => {
        const rect = wrapper.getBoundingClientRect()
        let newX = e.clientX - dragOffsetX
        let newY = e.clientY - dragOffsetY

        // 检测是否真正发生了移动
        if (Math.abs(newX - rect.left) > 1 || Math.abs(newY - rect.top) > 1) {
          hasMoved = true
        }

        // 限制在视口内（fixed定位不需要考虑滚动）
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        // 获取B站导航栏高度，防止拖拽到导航栏
        let navBarHeight = 0
        const navBar = document.querySelector('.bili-header') || document.querySelector('.fixed-header') || document.querySelector('#bili-header') || document.querySelector('.bili-nav-header')
        if (navBar) {
          navBarHeight = navBar.offsetHeight || navBar.getBoundingClientRect().height || 0
        }

        // 限制Y坐标不能小于导航栏高度，避免拖拽到导航栏
        const minY = navBarHeight

        // 限制在视口内（fixed定位，不需要考虑滚动）
        newX = Math.max(0, Math.min(newX, viewportWidth - wrapper.offsetWidth))
        newY = Math.max(minY, Math.min(newY, viewportHeight - wrapper.offsetHeight))

        wStyle.position = 'fixed'
        wStyle.left = newX + 'px'
        wStyle.top = newY + 'px'
        wStyle.right = 'auto'

        // 下拉框跟随按钮移动
        const dropdown = document.getElementById('linkcore-resource-dropdown')
        if (dropdown && dropdown.style.display === 'flex') {
          adjustDropdownPosition(dropdown)
        }
      })
    }

    const endDrag = () => {
      isDragging = false
      // 只有真正发生了移动才标记为已拖拽
      if (hasMoved) {
        hasBeenDragged = true
      }
      wStyle.cursor = 'auto'
      btn.style.cursor = 'pointer'
      wStyle.transition = 'opacity 0.2s ease'  // 恢复过渡动画
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      log('Drag ended, hasMoved:', hasMoved, 'hasBeenDragged:', hasBeenDragged)
    }

    // 鼠标长按150ms开启拖拽
    btn.addEventListener('mousedown', (e) => {
      longPressTimer = setTimeout(() => {
        startDrag(e)
      }, 150)  // 150ms长按触发拖拽
    })

    btn.addEventListener('mouseup', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      if (isDragging) {
        endDrag()
      }
    })

    btn.addEventListener('mouseleave', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      // 不调用 endDrag()，避免快速移动时中断拖拽
      // 拖拽结束由 document 的 mouseup 事件处理
    })

    // 鼠标移动
    document.addEventListener('mousemove', onDrag)
    document.addEventListener('mouseup', endDrag)

    wrapper.appendChild(buttonContainer)

    // 创建并添加下拉框
    const dropdown = createResourceDropdown()
    wrapper.appendChild(dropdown)

    // 将wrapper添加到document.body，确保fixed定位正常工作
    document.body.appendChild(wrapper)
    dedupeUniversalButtonWrappers()

    log('Button created successfully')
    log('Wrapper display:', wrapper.style.display)
    log('Wrapper position:', wrapper.style.position, 'top:', wrapper.style.top, 'right:', wrapper.style.right)
    log('Current sniffedResources:', sniffedResources)
    log('Button element:', btn)
    const btnInDom = document.getElementById('linkcore-bilibili-download-btn')
    log('Button in DOM:', btnInDom)
    if (btnInDom) {
      const rect = btnInDom.getBoundingClientRect()
      log('Button position:', rect)
      log('Button visible:', rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0)
    }

    // 初始化后立即检查是否有资源
    setTimeout(() => {
      log('Delayed check...')
      log('Current sniffedResources:', sniffedResources)

      // 如果按钮被用户关闭，不显示
      if (isButtonClosedByUser()) {
        log('Button was closed by user, keeping hidden')
        return
      }

      // 如果已经有资源，立即显示按钮
      if (sniffedResources && sniffedResources.total > 0) {
        log('Already have resources from iframe:', sniffedResources.total)
        wrapper.style.display = 'block'
        wrapper.style.visibility = 'visible'
        updateButtonVisibility()
      } else {
        log('No resources yet, requesting...')
        window.dispatchEvent(new Event('linkcore-get-resources'))
      }
    }, 500)

    // 监听容器位置变化，仅针对播放器小窗口
    const isPlayerContainer = ['.bpx-player-container', '.bpx-player-video-area', '.bilibili-player-video-wrap',
      '#bilibili-player', '.xgplayer-container', '.xgplayer-video-container', '.xgplayer',
      '.video-js', '.video-js-container',
      '.player-container', '.player-wrap', '.video-container', '.video-wrapper', '#player',
      '[class*="player"]', '[id*="player"]'].includes(containerSelector)

    // 更新按钮位置，确保在视口内
    const updateButtonPosition = () => {
      // 如果按钮正在被悬停，不更新位置
      if (isButtonHovered) return

      const containerWidth = container.offsetWidth
      const containerHeight = container.offsetHeight

      const rect = container.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const buttonWidth = 150
      const buttonHeight = 36

      // 按钮在容器上方
      let newTop = rect.top - 34
      let newRight = viewportWidth - rect.right

      // 确保按钮在视口内
      if (newTop < 0) newTop = 0
      if (newTop + buttonHeight > viewportHeight) newTop = viewportHeight - buttonHeight
      if (newRight < 0) newRight = 0
      if (newRight + buttonWidth > viewportWidth) newRight = viewportWidth - buttonWidth

      wStyle.top = `${newTop}px`
      wStyle.right = `${newRight}px`
      log('Updated button position, top:', newTop, 'right:', newRight, 'viewport:', viewportWidth, 'x', viewportHeight)
    }

    // 监听窗口大小变化，确保按钮始终在视口内
    const handleResize = () => {
      // 如果按钮被用户关闭，不处理调整大小
      if (isButtonClosedByUser()) {
        log('Button closed by user, skipping resize update')
        return
      }

      // 如果位置已锁定或按钮正在被悬停，不更新位置
      if (positionLocked || isButtonHovered) {
        log('Position locked or button hovered, skipping resize update')
        return
      }

      const isNonPlayerContainer = ['#content', '#content-inner', '.content', '.article-container', 'article', 'main'].includes(containerSelector)

      if (isNonPlayerContainer) {
        // 非播放器容器，按钮固定在右上角
        wStyle.top = '20px'
        wStyle.right = '20px'
        log('Updated button position for non-player container on resize')
      } else if (!hasBeenDragged) {
        // 播放器容器且未被拖拽过，更新位置
        updateButtonPosition()
      }
    }

    if (isPlayerContainer && containerSelector !== 'body') {
      // 使用 MutationObserver 监听容器位置变化（仅当未被拖拽过时）
      const observer = new MutationObserver(() => {
        // 只有在位置未锁定且未被拖拽过时才更新
        if (!hasBeenDragged && !positionLocked && !isButtonHovered) {
          updateButtonPosition()
        }
      })

      observer.observe(container, {
        attributes: true,
        attributeFilter: ['style', 'class']
      })

      // 定期检查位置（仅在位置未锁定且未被拖拽过时）
      // 注意：为了避免按钮跳动，我们离用这个定期更新
      // setInterval(() => {
      //   if (!hasBeenDragged && !positionLocked && !isButtonHovered) {
      //     updateButtonPosition()
      //   }
      // }, 500)
    }

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize)
    // 初始调用一次
    handleResize()
  }

  const scheduleBilibiliButton = () => {
    log('scheduleBilibiliButton called, isTopWindow:', isTopWindow())
    if (!isTopWindow()) return
    const tryInit = () => {
      log('tryInit called')
      ensureBilibiliButton()
      dedupeUniversalButtonWrappers()
    }
    // 立即尝试创建按钮，不等待 DOMContentLoaded
    log('Document ready state:', document.readyState)
    setTimeout(tryInit, 100) // 延迟 100ms 确保 DOM 基本就绪

    // 同时也监听 DOMContentLoaded 以防万一
    if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
      log('Waiting for DOMContentLoaded')
      window.addEventListener('DOMContentLoaded', () => {
        log('DOMContentLoaded fired')
        tryInit()
      })
    }

    // 定期重试（防止失败）
    // setInterval(() => {
    //   tryInit()
    // }, 3000)
  }

  log('Script loaded, calling scheduleBilibiliButton')
  scheduleBilibiliButton()

  // 加载视频嗅探器配置
  loadVideoSnifferConfig()

  // 当前悬停的视频元素或容器
  let hoveredVideoContainer = null

  // 上次位置更新的参数，用于检测是否需要更新
  let lastPositionTop = null
  let lastPositionRight = null

  // 更新按钮位置到指定容器的右上角
  const updateButtonPositionToContainer = (container) => {
    if (!container) return

    const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
    if (!wrapper) return

    // 如果按钮已被用户关闭，不更新位置也不显示
    if (isButtonClosedByUser()) {
      log('Button was closed by user, skipping position update')
      return
    }

    // 如果按钮已被拖拽过，不自动更新位置
    if (hasBeenDragged) return

    // 如果按钮正在被悬停，不更新位置（让用户能点击按钮）
    if (isButtonHovered) {
      log('Button is hovered, skipping position update')
      return
    }

    const rect = container.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const buttonWidth = 150
    const buttonHeight = 36

    // 按钮定位在容器上方，紧贴容器顶部
    let newTop = rect.top - 34
    let newRight = viewportWidth - rect.right

    // 如果上方没有空间，则显示在容器内部
    if (newTop < 0) {
      newTop = rect.top + 8
    }

    // 确保按钮在视口内
    if (newTop < 0) newTop = 0
    if (newTop + buttonHeight > viewportHeight) newTop = viewportHeight - buttonHeight
    if (newRight < 0) newRight = 0
    if (newRight + buttonWidth > viewportWidth) newRight = viewportWidth - buttonWidth

    // 如果位置没有变化，不更新（避免不必要的重绘和闪烁）
    if (lastPositionTop === newTop && lastPositionRight === newRight) {
      return
    }

    lastPositionTop = newTop
    lastPositionRight = newRight

    // 直接更新位置，不使用 visibility 隐藏，避免闪烁
    wrapper.style.position = 'fixed'
    wrapper.style.top = `${newTop}px`
    wrapper.style.right = `${newRight}px`
    wrapper.style.left = 'auto'

    // 只有在有资源且嗅探器启用时才确保按钮可见
    if (sniffedResources && sniffedResources.total > 0 && videoSnifferConfig.enabled) {
      wrapper.style.display = 'block'
      wrapper.style.visibility = 'visible'
    }

    // 锁定位置，防止被其他逻辑重置
    positionLocked = true

    log('Updated button position to hovered container, top:', newTop, 'right:', newRight)
  }

  // 查找视频元素的容器（视频卡片）
  const findVideoContainer = (videoElement) => {
    if (!videoElement) return null

    let bestContainer = null

    // 尝试找到视频的直接容器
    let parent = videoElement.parentElement
    let depth = 0
    const maxDepth = 8  // 增加查找深度到8层

    while (parent && depth < maxDepth) {
      // 检查是否是视频卡片
      if (parent.classList && parent.classList.length > 0) {
        const classList = Array.from(parent.classList)
        // 抖音及通用视频卡片类名
        if (classList.some(cls =>
          cls.includes('video-card') ||
          cls.includes('aweme-card') ||
          cls.includes('AwemeCard') ||
          cls.includes('player') ||
          cls.includes('video-container') ||
          cls.includes('xgplayer') ||
          cls.includes('video-item') ||
          cls.includes('feed-item') ||
          cls.includes('recommend-item') ||
          cls.includes('video-wrapper') ||
          cls.includes('poster') ||
          cls.includes('cover') ||
          cls.includes('bpx-player') ||
          cls.includes('bilibili-player')
        )) {
          bestContainer = parent
          // 继续向上查找更好的容器
        }
      }

      // 检查ID
      if (parent.id && (
        parent.id.includes('player') ||
        parent.id.includes('video') ||
        parent.id.includes('bilibili')
      )) {
        bestContainer = parent
      }

      // 如果还没有找到基于类的容器，检查尺寸
      if (!bestContainer) {
        const style = window.getComputedStyle(parent)
        const width = parent.offsetWidth
        const height = parent.offsetHeight

        if (width >= 100 && height >= 60 &&
          (style.position === 'relative' || style.position === 'absolute' || style.position === 'fixed')) {
          if (!bestContainer) bestContainer = parent
        }
      }

      parent = parent.parentElement
      depth++
    }

    // 如果找到了容器，返回它；否则返回视频元素自身
    return bestContainer || videoElement
  }



  // 为视频元素添加悬停监听
  const addVideoHoverListeners = () => {
    const videos = document.querySelectorAll('video')
    videos.forEach(video => {
      if (video._linkcoreHoverListenerAdded) return
      video._linkcoreHoverListenerAdded = true

      // 当视频开始播放时（通常是悬停触发的预览播放）
      video.addEventListener('play', () => {
        const container = findVideoContainer(video)
        if (container && container !== hoveredVideoContainer) {
          hoveredVideoContainer = container
          hoveredVideoElement = video
          // 更新当前容器记录，这样 updateButtonVisibility 会使用新位置
          currentContainer = container
          currentContainerSelector = 'video-hover'
          log('Video play detected, container:', container)
          updateButtonPositionToContainer(container)
        }
      })

      // 监听视频元素的鼠标进入事件
      video.addEventListener('mouseenter', () => {
        clearHideTimeout() // 清除隐藏倒计时
        const container = findVideoContainer(video)
        if (container && container !== hoveredVideoContainer) {
          hoveredVideoContainer = container
          hoveredVideoElement = video
          currentContainer = container
          currentContainerSelector = 'video-hover'
          log('Video mouseenter, container:', container)
          updateButtonPositionToContainer(container)
        }
      })

      // 监听离开事件
      video.addEventListener('mouseleave', () => {
        // 只有当鼠标真的离开了容器才开始倒计时
        const container = findVideoContainer(video)
        if (container && container.matches && container.matches(':hover')) {
          log('Mouse left video but still in container, skipping timeout')
          return
        }
        // 用户要求不自动消失
        // startHideTimeout()
      })
    })

    // 也监听可能的视频容器
    const videoContainers = document.querySelectorAll('[class*="video-card"], [class*="player"], [class*="xgplayer"], [class*="video-item"], [class*="feed-item"]')
    videoContainers.forEach(container => {
      if (container._linkcoreHoverListenerAdded) return
      container._linkcoreHoverListenerAdded = true

      container.addEventListener('mouseenter', () => {
        // 检查容器内是否有视频元素
        const video = container.querySelector('video')
        if (video) {
          clearHideTimeout() // 清除隐藏倒计时
          if (container !== hoveredVideoContainer) {
            hoveredVideoContainer = container
            hoveredVideoElement = video
            currentContainer = container
            currentContainerSelector = 'video-hover'
            log('Video container mouseenter:', container)
            updateButtonPositionToContainer(container)
          }
        }
      })

      container.addEventListener('mouseleave', () => {
        // 用户要求不自动消失
        // startHideTimeout()
      })
    })
  }

  // 当前悬停的视频元素（用于在容器失效时找回）
  let hoveredVideoElement = null

  // 监听滚动事件，确保按钮随容器移动
  window.addEventListener('scroll', () => {
    if (positionLocked && hoveredVideoContainer && hoveredVideoContainer.isConnected) {
      updateButtonPositionToContainer(hoveredVideoContainer)
    } else if (positionLocked && hoveredVideoContainer && !hoveredVideoContainer.isConnected) {
      // 容器失效，尝试恢复
      if (hoveredVideoElement && hoveredVideoElement.isConnected) {
        log('Container disconnected but video exists, re-finding container')
        const newContainer = findVideoContainer(hoveredVideoElement)
        if (newContainer && newContainer.isConnected) {
          hoveredVideoContainer = newContainer
          updateButtonPositionToContainer(hoveredVideoContainer)
          return
        }
      }

      // 如果容器被移除但有资源，保持按钮显示但重置锁定
      const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
      if (sniffedResources && sniffedResources.total > 0) {
        if (!hasBeenDragged) {
          positionLocked = false
          hoveredVideoContainer = null
          log('Container removed but keeping button due to resources')
        }
      } else if (!hasBeenDragged) {
        // 只有在没有资源且未被拖拽时才隐藏
        if (wrapper) wrapper.style.display = 'none'
        positionLocked = false
        hoveredVideoContainer = null
        log('Container removed from DOM and no resources, hiding button')
      }
    }
  }, true) // 使用 capture 捕获滚动事件

  // 也使用 requestAnimationFrame 持续跟踪位置（处理非滚动导致的布局变化）
  const trackPositionLoop = () => {
    // 如果按钮被用户关闭，不进行位置跟踪
    if (isButtonClosedByUser()) {
      requestAnimationFrame(trackPositionLoop)
      return
    }

    if (positionLocked && hoveredVideoContainer) {
      if (hoveredVideoContainer.isConnected) {
        updateButtonPositionToContainer(hoveredVideoContainer)
      } else {
        // 容器失效，尝试恢复
        let recovered = false
        if (hoveredVideoElement && hoveredVideoElement.isConnected) {
          const newContainer = findVideoContainer(hoveredVideoElement)
          if (newContainer && newContainer.isConnected) {
            hoveredVideoContainer = newContainer
            updateButtonPositionToContainer(hoveredVideoContainer)
            recovered = true
            log('Container recovered via video element')
          }
        }

        // 更宽松的恢复策略：如果有资源且按钮存在，保持显示
        if (!recovered) {
          const wrapper = document.getElementById('linkcore-bilibili-download-btn-wrapper')
          const isButtonClosed = isButtonClosedByUser()
          if (wrapper && sniffedResources && sniffedResources.total > 0 && !isButtonClosed) {
            // 有资源且未被用户关闭时不隐藏按钮，只是重置位置锁定
            if (!hasBeenDragged) {
              positionLocked = false
              hoveredVideoContainer = null
              log('Container disconnected but keeping button visible due to resources')
            }
          } else if (!hasBeenDragged || isButtonClosed) {
            // 只有在没有资源、未被拖拽或被用户关闭时才隐藏
            positionLocked = false
            hoveredVideoContainer = null
            if (wrapper) wrapper.style.display = 'none'
            log('Container disconnected and no resources or user closed, hidden')
          }
        }
      }
    }
    requestAnimationFrame(trackPositionLoop)
  }
  requestAnimationFrame(trackPositionLoop)

  // 定期扫描新的视频元素并添加监听
  // setInterval(addVideoHoverListeners, 1000)

  // 全局鼠标移动监听，用于捕获动态变化的元素或被遮挡的视频
  let lastMouseMoveTime = 0
  window.addEventListener('mousemove', (e) => {
    // 如果按钮被用户关闭，不处理鼠标移动
    if (isButtonClosedByUser()) {
      return
    }

    const now = Date.now()
    if (now - lastMouseMoveTime < 100) return // 节流 100ms
    lastMouseMoveTime = now

    const target = e.target
    if (!target) return

    // 检查是否悬停在视频上（或视频上方的遮罩层）
    let foundContainer = null

    // 1. 直接悬停在视频元素
    if (target.tagName === 'VIDEO') {
      foundContainer = findVideoContainer(target)
    } else {
      // 2. 悬停在视频容器或其子元素
      let el = target
      let depth = 0
      while (el && depth < 5) {
        if (el.tagName === 'VIDEO') {
          foundContainer = findVideoContainer(el)
          break
        }
        // 检查常用容器类名
        if (el.classList && Array.from(el.classList).some(cls =>
          cls.includes('video-card') || cls.includes('player') || cls.includes('video-item') || cls.includes('AwemeCard')
        )) {
          // 如果容器内有视频，则是目标
          const video = el.querySelector('video')
          if (video) {
            foundContainer = findVideoContainer(video) // 使用标准逻辑获取最佳容器
            break
          }
        }
        el = el.parentElement
        depth++
      }
    }

    if (foundContainer && foundContainer.isConnected) {
      // 如果找到了容器，手动触发悬停逻辑
      // 由于作用域限制，我们直接调用 core logic
      // 为了简单，我们只更新位置（如果是新容器）
      if (foundContainer !== hoveredVideoContainer) {
        // 这里我们需要访问 video 元素来设置 hoveredVideoElement
        // 如果 foundContainer 是通过 video 找到的，我们反查 video
        let video = foundContainer.querySelector('video')
        if (!video && foundContainer.tagName === 'VIDEO') video = foundContainer

        if (video) {
          hoveredVideoContainer = foundContainer
          hoveredVideoElement = video
          currentContainer = foundContainer
          currentContainerSelector = 'video-hover-global'
          // clearHideTimeout() // 全局如果有访问权最好调用
          if (typeof clearHideTimeout === 'function') clearHideTimeout()

          log('Global mousemove detected container:', foundContainer)
          updateButtonPositionToContainer(foundContainer)
        }
      } else {
        // 同一个容器，保持显示（清除隐藏倒计时）
        if (typeof clearHideTimeout === 'function') {
          clearHideTimeout()
        }
      }
    }
  }, true) // capture

  // 初始添加一次
  setTimeout(addVideoHoverListeners, 500)
}
})()
