(function() {
  'use strict'

  // Debug logging control
  const DEBUG = true
  const log = (...args) => {
    if (DEBUG) {
      console.log('[LinkCore Sniffer]', ...args)
    }
  }

  // 存储嗅探到的视频资源
  const sniffedResources = {
    video: [],
    audio: [],
    m4s: [], // 专门存储M4S资源
    combined: [] // 组合的视频（视频流+音频流）
  }

  // 资源类型判断
  const isVideoResource = (url) => {
    if (!url) return false
    const lowerUrl = url.toLowerCase()
    
    // 过滤非视频资源
    // 排除日志、统计、API请求
    if (lowerUrl.includes('/log/') || 
        lowerUrl.includes('/api/') ||
        lowerUrl.includes('/stat') ||
        lowerUrl.includes('analytics') ||
        lowerUrl.includes('tracking')) {
      return false
    }
    
    if (lowerUrl.includes('.m4s')) {
      // 确保是视频流域名
      return true
    }
    
    // 常见视频格式
    const videoExts = ['.mp4', '.flv', '.m3u8', '.ts', '.webm', '.mkv', '.avi']
    return videoExts.some(ext => lowerUrl.includes(ext))
  }

  const isAudioResource = (url) => {
    if (!url) return false
    const lowerUrl = url.toLowerCase()
    
    // 过滤非音频资源
    if (lowerUrl.includes('/log/') || 
        lowerUrl.includes('/api/') ||
        lowerUrl.includes('/stat')) {
      return false
    }
    
    // M4S音频
    if (lowerUrl.includes('.m4s') && (lowerUrl.includes('audio') || lowerUrl.includes('30280'))) {
      return true
    }
    
    const audioExts = ['.mp3', '.aac', '.m4a', '.wav', '.ogg']
    return audioExts.some(ext => lowerUrl.includes(ext))
  }

  const isM4SResource = (url) => {
    return url && url.toLowerCase().includes('.m4s')
  }

  // 解析资源信息
  const parseResourceInfo = (url, type) => {
    const info = {
      url: url,
      type: type,
      quality: '',
      size: 0,
      name: '',
      timestamp: Date.now()
    }

    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      
      // 从URL路径提取文件名
      const parts = pathname.split('/')
      info.name = parts[parts.length - 1] || 'unknown'

      // M4S资源质量解析
      if (isM4SResource(url)) {
        // 视频质量码映射（实际格式）：
        // 100026 -> 1080P, 100024 -> 720P, 100023 -> 480P, 100022 -> 360P
        // 以及旧格式：30080 -> 1080P, 30064 -> 720P, 30032 -> 480P, 30016 -> 360P
        const qualityMap = {
          // 新格式质量码
          '100027': '8K',
          '100026': '1080P',
          '100025': '4K',
          '100024': '720P',
          '100023': '480P',
          '100022': '360P',
          '100021': '240P',
          // 旧格式质量码（兼容）
          '30127': '8K',
          '30126': 'Dolby',
          '30125': 'HDR',
          '30120': '4K',
          '30116': '1080P60',
          '30112': '1080P+',
          '30080': '1080P',
          '30074': '720P60',
          '30064': '720P',
          '30032': '480P',
          '30016': '360P',
          '30006': '240P'
        }

        // 尝试从URL中匹配质量码
        let qualityFound = false
        for (const [code, quality] of Object.entries(qualityMap)) {
          if (url.includes(code)) {
            info.quality = quality
            qualityFound = true
            break
          }
        }

        // 如果没有匹配到质量码，尝试其他方法
        if (!qualityFound) {
          // 检查是否是音频
          if (url.includes('audio') || url.includes('-30280.m4s') || url.includes('/audio/')) {
            info.quality = 'Audio'
            qualityFound = true
          } else {
            // 尝试从文件名或路径提取质量信息
            const match = url.match(/-(\d+)\.m4s/)
            if (match) {
              const code = match[1]
              // 显示质量码作为标识
              info.quality = code
            } else {
              info.quality = 'Unknown'
            }
          }
        }

        // 判断是视频还是音频
        if (url.includes('audio') || url.includes('-30280.m4s') || url.includes('/audio/') || info.quality === 'Audio') {
          info.type = 'audio'
        } else {
          info.type = 'video'
        }
      }

      // 从URL参数获取额外信息
      const params = new URLSearchParams(urlObj.search)
      if (params.has('len')) {
        info.size = parseInt(params.get('len')) || 0
      }
    } catch (e) {
      log('Failed to parse resource info:', e)
    }

    return info
  }

  // 添加资源到列表（去重）
  const addResource = (url, type) => {
    const info = parseResourceInfo(url, type)
    
    // 检查是否已存在
    const exists = sniffedResources[type].some(r => r.url === url)
    if (exists) return

    sniffedResources[type].push(info)
    
    // 同时添加到m4s列表
    if (isM4SResource(url)) {
      const m4sExists = sniffedResources.m4s.some(r => r.url === url)
      if (!m4sExists) {
        sniffedResources.m4s.push(info)
      }
    }

    log(`Found ${info.type}:`, info.quality || 'unknown quality', '\nURL:', url.substring(0, 150) + '...')
    
    // 通知页面更新
    notifyResourceUpdate()
  }

  // 通知页面资源已更新
  const notifyResourceUpdate = () => {
    // 尝试配对M4S视频和音频
    combineDashResources()
    
    window.dispatchEvent(new CustomEvent('linkcore-resources-updated', {
      detail: {
        video: sniffedResources.video,
        audio: sniffedResources.audio,
        m4s: sniffedResources.m4s,
        combined: sniffedResources.combined,
        total: sniffedResources.video.length + sniffedResources.audio.length + sniffedResources.combined.length
      }
    }))
  }

  // 配对DASH视频和音频流
  const combineDashResources = () => {
    const videoStreams = sniffedResources.m4s.filter(r => r.type === 'video')
    const audioStreams = sniffedResources.m4s.filter(r => r.type === 'audio')
    
    const newCombined = []
    const usedVideos = new Set()
    const usedAudios = new Set()
    
    // 先检查已存在的组合，标记已使用的资源
    sniffedResources.combined.forEach(combo => {
      usedVideos.add(combo.videoUrl)
      usedAudios.add(combo.audioUrl)
      newCombined.push(combo)
    })
    
    // 尝试配对新的视频和音频
    videoStreams.forEach(video => {
      if (usedVideos.has(video.url)) return
      
      // 寻找匹配的音频流（优先选择时间相近的）
      const matchedAudio = audioStreams.find(audio => {
        if (usedAudios.has(audio.url)) return false
        // 检查时间差，5秒内的认为是同一个视频
        const timeDiff = Math.abs(video.timestamp - audio.timestamp)
        return timeDiff < 5000
      })
      
      if (matchedAudio) {
        const combined = {
          type: 'combined',
          quality: video.quality,
          videoUrl: video.url,
          audioUrl: matchedAudio.url,
          videoName: video.name,
          audioName: matchedAudio.name,
          timestamp: video.timestamp,
          name: `${video.quality} 视频`
        }
        newCombined.push(combined)
        usedVideos.add(video.url)
        usedAudios.add(matchedAudio.url)
      }
    })
    
    sniffedResources.combined = newCombined
  }

  // 拦截 XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._requestURL = url
    return originalOpen.call(this, method, url, ...args)
  }

  XMLHttpRequest.prototype.send = function(...args) {
    const url = this._requestURL
    if (url && typeof url === 'string') {
      if (isVideoResource(url)) {
        addResource(url, isAudioResource(url) ? 'audio' : 'video')
      }
    }
    return originalSend.apply(this, args)
  }

  // 拦截 Fetch API
  const originalFetch = window.fetch
  window.fetch = function(resource, ...args) {
    const url = typeof resource === 'string' ? resource : resource.url
    if (url && typeof url === 'string') {
      if (isVideoResource(url)) {
        addResource(url, isAudioResource(url) ? 'audio' : 'video')
      }
    }
    return originalFetch.apply(this, [resource, ...args])
  }

  // 监听网络请求（通过 PerformanceObserver）
  if (window.PerformanceObserver) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
            const url = entry.name
            if (url && isVideoResource(url)) {
              addResource(url, isAudioResource(url) ? 'audio' : 'video')
            }
          }
        }
      })
      observer.observe({ entryTypes: ['resource'] })
    } catch (e) {
      log('PerformanceObserver failed:', e)
    }
  }

  // 监听 video 和 audio 标签的 src 变化
  const observeMediaElements = () => {
    const mediaElements = document.querySelectorAll('video, audio')
    mediaElements.forEach(el => {
      const src = el.src || el.currentSrc
      if (src && isVideoResource(src)) {
        const type = el.tagName.toLowerCase() === 'audio' ? 'audio' : 'video'
        addResource(src, type)
      }

      // 监听 source 子元素
      const sources = el.querySelectorAll('source')
      sources.forEach(source => {
        const src = source.src
        if (src && isVideoResource(src)) {
          const type = el.tagName.toLowerCase() === 'audio' ? 'audio' : 'video'
          addResource(src, type)
        }
      })
    })
  }

  // 监听 iframe 内的视频资源
  const observeIframeMedia = () => {
    const iframes = document.querySelectorAll('iframe')
    iframes.forEach(iframe => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
        if (iframeDoc) {
          // 检查 iframe 内的 video 和 audio 元素
          const mediaElements = iframeDoc.querySelectorAll('video, audio')
          mediaElements.forEach(el => {
            const src = el.src || el.currentSrc
            if (src && isVideoResource(src)) {
              const type = el.tagName.toLowerCase() === 'audio' ? 'audio' : 'video'
              addResource(src, type)
            }

            const sources = el.querySelectorAll('source')
            sources.forEach(source => {
              const src = source.src
              if (src && isVideoResource(src)) {
                const type = el.tagName.toLowerCase() === 'audio' ? 'audio' : 'video'
                addResource(src, type)
              }
            })
          })
        }
      } catch (e) {
        // 跨域iframe无法访问，忽略错误
      }
    })
  }

  // 使用 MutationObserver 监听DOM变化，捕获动态加载的video元素
  const observeDOMChanges = () => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查新增的video/audio元素
            if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
              const src = node.src || node.currentSrc
              if (src && isVideoResource(src)) {
                const type = node.tagName.toLowerCase() === 'audio' ? 'audio' : 'video'
                addResource(src, type)
              }
              
              const sources = node.querySelectorAll('source')
              sources.forEach(source => {
                const src = source.src
                if (src && isVideoResource(src)) {
                  const type = node.tagName.toLowerCase() === 'audio' ? 'audio' : 'video'
                  addResource(src, type)
                }
              })
            }
            
            // 检查新增的iframe
            if (node.tagName === 'IFRAME') {
              setTimeout(() => observeIframeMedia(), 500)
            }
            
            // 检查子元素中是否有video/audio
            const mediaElements = node.querySelectorAll && node.querySelectorAll('video, audio')
            if (mediaElements) {
              mediaElements.forEach(el => {
                const src = el.src || el.currentSrc
                if (src && isVideoResource(src)) {
                  const type = el.tagName.toLowerCase() === 'audio' ? 'audio' : 'video'
                  addResource(src, type)
                }
              })
            }
          }
        })
      })
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  // 定期检查媒体元素
  setInterval(observeMediaElements, 2000)
  
  // 定期检查iframe内的媒体元素
  setInterval(observeIframeMedia, 2000)

  // 页面加载完成后立即检查
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observeMediaElements()
      observeIframeMedia()
      observeDOMChanges()
    })
  } else {
    observeMediaElements()
    observeIframeMedia()
    observeDOMChanges()
  }

  // 监听来自页面的获取资源请求
  window.addEventListener('linkcore-get-resources', () => {
    notifyResourceUpdate()
  })

  // 暴露清除资源的方法
  window.addEventListener('linkcore-clear-resources', () => {
    log('Clearing resources from dash-sniffer')
    
    sniffedResources.video = []
    sniffedResources.audio = []
    sniffedResources.m4s = []
    sniffedResources.combined = []
    
    // 立即更新UI显示为空
    notifyResourceUpdate()
    
    // 延迟一小段时间后重新检测当前正在播放的媒体资源
    setTimeout(() => {
      log('Re-checking current media elements after clear')
      observeMediaElements()
      observeIframeMedia()
    }, 100)
  })

  log('Video sniffer initialized')
})()
