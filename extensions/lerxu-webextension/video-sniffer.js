// 视频资源嗅探器 - 基于文件扩展名检测
(function () {
  'use strict'

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

  if (isPureMediaDocument()) {
    return
  }

  // 多语言质量和类型映射
  const getLocalizedQuality = (quality, locale) => {
    const qualityTranslations = {
      'Audio': {
        'en': 'Audio',
        'zh_CN': '音频',
        'zh_TW': '音訊'
      },
      'Hi-Res Audio': {
        'en': 'Hi-Res Audio',
        'zh_CN': '高品质音频',
        'zh_TW': '高品質音訊'
      },
      'High Audio': {
        'en': 'High Audio',
        'zh_CN': '高音质',
        'zh_TW': '高音質'
      },
      'Unknown': {
        'en': 'Unknown',
        'zh_CN': '未知',
        'zh_TW': '未知'
      }
    }
    
    if (qualityTranslations[quality] && qualityTranslations[quality][locale]) {
      return qualityTranslations[quality][locale]
    }
    
    return quality // 如果没有翻译，返回原始值
  }

  // 获取当前语言设置
  const getCurrentLocale = async () => {
    try {
      const config = await new Promise((resolve) => {
        chrome.storage.local.get(['browserLocale'], (result) => {
          resolve(result || {})
        })
      })
      return config.browserLocale || 'en'
    } catch (e) {
      return 'en'
    }
  }

  let cachedLocale = 'en'
  try {
    getCurrentLocale().then((locale) => {
      cachedLocale = locale || 'en'
    })
  } catch (e) {}

  try {
    if (chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes && changes.browserLocale) {
          cachedLocale = changes.browserLocale.newValue || 'en'
        }
      })
    }
  } catch (e) {}

  // 调试日志控制
  const DEBUG = false // 关闭调试日志
  const log = (...args) => {
    if (DEBUG) {
      console.log('[Video Sniffer]', ...args)
    }
  }

  log('========== Script loaded! ==========')
  log('Current URL:', window.location.href)
  log('Document ready state:', document.readyState)

  // 默认配置
  let config = {
    enabled: true,
    formats: ['m4s', 'mp4', 'flv', 'm3u8', 'ts', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'],
    autoCombine: true,
    excludeFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico', 'css', 'js', 'json', 'xml', 'html', 'htm', 'woff', 'woff2', 'ttf', 'otf', 'pdf', 'txt']
  }

  let configLoaded = false

  log('Default config:', config)

  // 存储嗅探到的资源
  const sniffedResources = {
    video: [],
    audio: [],
    m4s: [],
    combined: []
  }

  const clearedResourceUrls = new Set()

  let uiUpdateTimer = null
  let lastUiUpdateAt = 0
  const requestUIUpdate = (immediate = false) => {
    try {
      if (immediate) {
        if (uiUpdateTimer) {
          clearTimeout(uiUpdateTimer)
          uiUpdateTimer = null
        }
        lastUiUpdateAt = Date.now()
        updateUI()
        return
      }

      const now = Date.now()
      const elapsed = now - lastUiUpdateAt
      if (elapsed >= 80 && !uiUpdateTimer) {
        lastUiUpdateAt = now
        updateUI()
        return
      }

      if (uiUpdateTimer) return
      const delay = Math.max(20, 80 - Math.max(0, elapsed))
      uiUpdateTimer = setTimeout(() => {
        uiUpdateTimer = null
        lastUiUpdateAt = Date.now()
        updateUI()
      }, delay)
    } catch (e) {}
  }

  let videoContextSeq = 1
  const videoContextMap = new WeakMap()
  const videoContextState = new Map()

  const coreUrl = (raw) => {
    try {
      if (!raw) return ''
      const u = new URL(raw)
      return `${u.protocol}//${u.hostname}${u.pathname}`
    } catch (e) {
      return `${raw || ''}`
    }
  }

  const isTrustedBiliHost = (hostname) => {
    const host = `${hostname || ''}`.toLowerCase()
    if (!host) return false
    const domains = ['bilivideo.com', 'mcdn.bilivideo.cn']
    return domains.some(d => host === d || host.endsWith(`.${d}`))
  }

  // 抖音/字节跳动域名识别
  const isDouyinHost = (hostname) => {
    const host = `${hostname || ''}`.toLowerCase()
    if (!host) return false
    const domains = [
      'douyinvod.com', 'bytecdntp.com', 'bytecdn.cn',
      'ixigua.com', 'douyin.com', 'douyincdn.com',
      'amemv.com', 'snssdk.com', 'bytegoofetch.com',
      'bytednsdoc.com', 'bytedance.com'
    ]
    return domains.some(d => host === d || host.endsWith(`.${d}`))
  }

  // 已知媒体CDN域名检测（覆盖国内外主流及小众视频平台）
  const isKnownMediaCdnHost = (hostname) => {
    const host = `${hostname || ''}`.toLowerCase()
    if (!host) return false

    // B站和抖音已在专用函数中处理
    if (isTrustedBiliHost(host)) return true
    if (isDouyinHost(host)) return true

    const knownDomains = [
      // 腾讯视频
      'qq.com', 'gtimg.com', 'qcloud.com', 'myqcloud.com', 'tnow.com',
      // 优酷/阿里
      'youku.com', 'alicdn.com', 'tudou.com', 'aliyuncs.com',
      // 爱奇艺
      'iqiyi.com', 'iq.com', 'qiyi.com', 'qiyipic.com',
      // 芒果TV
      'mgtv.com', 'hunantv.com',
      // 搜狐视频
      'sohu.com', 'sohucs.com',
      // 快手
      'kuaishou.com', 'yxixy.com', 'gifshow.com', 'ksapisrv.com', 'kwaicdn.com', 'yximgs.com',
      // 微博
      'sina.com.cn', 'weibo.com', 'sinavideo.com', 'sinaimg.cn',
      // 西瓜视频
      'ixigua.com',
      // 网易视频
      '163.com', 'netease.com', '126.net',
      // 百度
      'baidu.com', 'bdimg.com', 'bdstatic.com',
      // YouTube
      'googlevideo.com', 'ggpht.com', 'ytimg.com',
      // Vimeo
      'vimeocdn.com', 'vimeo.com',
      // Dailymotion
      'dailymotion.com', 'dmcdn.net',
      // Twitch
      'ttvnw.net', 'jtvnw.net',
      // 通用CDN
      'cloudflarestream.com', 'cloudfront.net', 'azureedge.net', 'azure-media.net',
      'akamaized.net', 'akamai.net', 'fastly.net',
      // 视频服务商
      'mux.com', 'brightcove.com', 'jwplayer.com', 'jwpcdn.com',
      'vidyard.com', 'wistia.com', 'kaltura.com', 'panopto.com',
      // 通用媒体存储
      'amazonaws.com', 'wasabisys.com', 'backblazeb2.com', 'digitaloceanspaces.com'
    ]

    if (knownDomains.some(d => host === d || host.endsWith(`.${d}`))) return true

    // 检查媒体相关子域名前缀（如 vod.xxx.com, video-cdn.xxx.net, stream.xxx.org）
    const mediaSubdomainPrefixes = ['vod', 'video', 'media', 'stream', 'play', 'clip', 'movie', 'live']
    const parts = host.split('.')
    if (parts.length >= 3) {
      for (let i = 0; i < parts.length - 2; i++) {
        if (mediaSubdomainPrefixes.includes(parts[i])) return true
      }
    }

    return false
  }

  // 通用启发式媒体检测（适用于小众平台，当标准扩展名检测失败时）
  const detectMediaHeuristic = (url, mimeType) => {
    try {
      // 如果MIME类型明确指示媒体内容，直接返回对应扩展名
      if (mimeType) {
        const mimeLower = mimeType.toLowerCase().split(';')[0].trim()
        if (mimeLower.startsWith('video/')) return 'mp4'
        if (mimeLower.startsWith('audio/')) return 'm4a'
        if (mimeLower.includes('mpegurl') || mimeLower.includes('m3u8')) return 'm3u8'
        if (mimeLower.includes('dash+xml') || mimeLower.includes('dash')) return 'mpd'
        if (mimeLower.includes('mp2t')) return 'ts'
        if (mimeLower.includes('matroska')) return 'mkv'
        if (mimeLower.includes('webm')) return 'webm'
        if (mimeLower.includes('flv')) return 'flv'
      }

      const urlObj = new URL(url)
      const pathLower = urlObj.pathname.toLowerCase()
      const host = urlObj.hostname.toLowerCase()
      const params = urlObj.searchParams
      const searchLower = urlObj.search.toLowerCase()

      const isKnownCdn = isKnownMediaCdnHost(host)

      // 媒体相关路径段
      const mediaPathPatterns = ['/video/', '/media/', '/stream/', '/vod/', '/play/', '/content/', '/clip/', '/movie/', '/audio/', '/sound/', '/music/']
      const hasMediaPath = mediaPathPatterns.some(p => pathLower.includes(p))

      // 媒体相关查询参数
      const mediaParamKeys = ['video_id', 'vid', 'media_type', 'content_type', 'video_type', 'mime_type', 'codec', 'bitrate', 'resolution', 'quality', 'audio_only', 'format']
      const hasMediaParam = mediaParamKeys.some(k => params.has(k))

      // 媒体相关关键词在查询字符串中
      const mediaKeywords = ['mp4', 'm3u8', 'flv', 'hls', 'dash', 'stream']
      const hasMediaKeyword = mediaKeywords.some(k => searchLower.includes(k))

      // 判断是否为音频
      const isAudio = pathLower.includes('/audio/') || pathLower.includes('/sound/') || pathLower.includes('/music/') ||
        params.get('audio_only') === 'true' || params.get('type') === 'audio' || params.get('media_type') === 'audio'

      // 决策逻辑：需要足够的信号才判定为媒体
      // 策略1：已知CDN + 媒体路径/参数/关键词
      if (isKnownCdn && (hasMediaPath || hasMediaParam || hasMediaKeyword)) {
        return isAudio ? 'm4a' : 'mp4'
      }

      // 策略2：媒体路径 + 媒体参数（双信号确认）
      if (hasMediaPath && hasMediaParam) {
        return isAudio ? 'm4a' : 'mp4'
      }

      // 策略3：HLS/DASH 清单检测
      if (pathLower.includes('m3u8') || searchLower.includes('m3u8') || params.get('format') === 'm3u8' || params.get('type') === 'hls') return 'm3u8'
      if (pathLower.endsWith('.mpd') || params.get('format') === 'dash') return 'mpd'

      return ''
    } catch (e) {
      return ''
    }
  }

  const normalizeUrlForDedup = (url) => {
    try {
      if (!url) return ''
      const urlObj = new URL(url)
      if (url.includes('.m4s') && isTrustedBiliHost(urlObj.hostname)) {
        const pathMatch = urlObj.pathname.match(/(\d+)-1-(\d+)\.m4s/)
        if (pathMatch) {
          const resourceId = pathMatch[1]
          const qualityCode = pathMatch[2]
          return `video:${resourceId}:${qualityCode}`
        }
      }
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`
    } catch (e) {
      return `${url || ''}`
    }
  }

  const ensureVideoContext = (video) => {
    try {
      if (!video || video.tagName !== 'VIDEO') return null
      let id = videoContextMap.get(video)
      if (!id) {
        const existing = video.getAttribute('data-lerxu-video-context-id')
        id = existing || `vc_${Date.now()}_${videoContextSeq++}`
        videoContextMap.set(video, id)
        try {
          video.setAttribute('data-lerxu-video-context-id', id)
        } catch (e) {}
        if (!videoContextState.has(id)) {
          videoContextState.set(id, { lastActiveAt: 0, lastSrc: '', isPlaying: false })
        }

        const mark = () => {
          const st = videoContextState.get(id)
          if (!st) return
          st.lastActiveAt = Date.now()
          const src = video.currentSrc || video.src || ''
          if (src) st.lastSrc = src
          try {
            video.setAttribute('data-lerxu-video-last-active', `${st.lastActiveAt}`)
          } catch (e) {}
        }
        const markPlaying = () => {
          const st = videoContextState.get(id)
          if (st) st.isPlaying = true
          mark()
        }
        const markPaused = () => {
          const st = videoContextState.get(id)
          if (st) st.isPlaying = false
        }
        try {
          video.addEventListener('play', markPlaying, true)
          video.addEventListener('playing', markPlaying, true)
          video.addEventListener('loadedmetadata', mark, true)
          video.addEventListener('loadeddata', mark, true)
          video.addEventListener('emptied', markPaused, true)
          video.addEventListener('pause', markPaused, true)
          video.addEventListener('ended', markPaused, true)
        } catch (e) {}
      }
      return id
    } catch (e) {
      return null
    }
  }

  const scanVideoElements = () => {
    try {
      const list = document.querySelectorAll('video')
      list.forEach(v => ensureVideoContext(v))
    } catch (e) {}
  }

  const getVideoContextIdForResource = (url) => {
    try {
      const target = coreUrl(url)
      if (target) {
        for (const [id, st] of videoContextState.entries()) {
          if (!st || !st.lastSrc) continue
          if (coreUrl(st.lastSrc) === target) return id
        }
      }

      const now = Date.now()

      // 优先选择正在播放的视频元素，避免将预加载（暂停）视频的资源分配给当前视频
      let bestPlayingId = null
      let bestPlayingAt = 0
      for (const [id, st] of videoContextState.entries()) {
        if (!st || !st.isPlaying) continue
        const at = Number(st.lastActiveAt || 0)
        if (at > bestPlayingAt) {
          bestPlayingAt = at
          bestPlayingId = id
        }
      }
      if (bestPlayingId && bestPlayingAt && now - bestPlayingAt < 8000) return bestPlayingId

      // 回退：最近活跃的视频（包括预加载的）
      let bestId = null
      let bestAt = 0
      for (const [id, st] of videoContextState.entries()) {
        if (!st) continue
        const at = Number(st.lastActiveAt || 0)
        if (at > bestAt) {
          bestAt = at
          bestId = id
        }
      }
      if (bestId && bestAt && now - bestAt < 8000) return bestId
    } catch (e) {}
    return null
  }

  // 从应用读取配置
  function loadConfig() {
    log('Loading config from storage...')
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        // Chrome storage API not available
        configLoaded = true
        return
      }
      chrome.storage.local.get(['videoSnifferEnabled', 'videoSnifferFormats', 'videoSnifferAutoCombine'], (result) => {
        log('Storage result:', JSON.stringify(result, null, 2))
        if (chrome.runtime.lastError) {
          // Storage error
          configLoaded = true
          return
        }
        let configChanged = false
        if (result.videoSnifferEnabled !== undefined) {
          config.enabled = result.videoSnifferEnabled
          log('Loaded videoSnifferEnabled:', config.enabled)
          configChanged = true
        } else {
          log('videoSnifferEnabled not found in storage, using default:', config.enabled)
        }
        if (result.videoSnifferFormats && Array.isArray(result.videoSnifferFormats)) {
          const oldFormats = config.formats
          config.formats = result.videoSnifferFormats.map(f => f.toLowerCase())
          log('Loaded videoSnifferFormats:', config.formats, 'Previous:', oldFormats)
          configChanged = true
        } else {
          log('videoSnifferFormats not found or not array in storage, using default:', config.formats)
        }
        if (result.videoSnifferAutoCombine !== undefined) {
          config.autoCombine = result.videoSnifferAutoCombine
          log('Loaded videoSnifferAutoCombine:', config.autoCombine)
          configChanged = true
        } else {
          log('videoSnifferAutoCombine not found in storage, using default:', config.autoCombine)
        }
        log('Final config after loading:', JSON.stringify(config, null, 2))

        configLoaded = true
        log('Config loaded from storage, marking as loaded and rechecking all resources')
        // 不清除现有资源，而是重新检查以确保完整性
        
        const resources = window.performance.getEntriesByType('resource')
        log('Rechecking', resources.length, 'resources after loading config')
        resources.forEach(entry => {
          addResource(entry.name)
        })
        checkMediaElements()
        
        // 立即触发UI更新以应用新配置
        if (configChanged) {
          log('Config changed, triggering UI update')
          requestUIUpdate(true)
        }
      })
    } catch (e) {
      // Failed to load config
      configLoaded = true
    }
  }

  // 监听配置变化
  try {
    if (chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        log('Storage changed:', changes, namespace)
        if (namespace === 'local') {
          let configChanged = false
          if (changes.videoSnifferEnabled) {
            config.enabled = changes.videoSnifferEnabled.newValue
            log('videoSnifferEnabled changed to:', config.enabled)
            configChanged = true
          }
          if (changes.videoSnifferFormats) {
            const oldFormats = config.formats
            config.formats = changes.videoSnifferFormats.newValue.map(f => f.toLowerCase())
            log('videoSnifferFormats changed from:', oldFormats, 'to:', config.formats)
            configChanged = true
          }
          if (changes.videoSnifferAutoCombine) {
            config.autoCombine = changes.videoSnifferAutoCombine.newValue
            log('videoSnifferAutoCombine changed to:', config.autoCombine)
            configChanged = true
          }
          log('Config updated:', config)

          if (configChanged) {
            log('Config changed, updating UI without clearing resources')
            
            // 只有在启用状态或格式发生变化时才需要重新检查资源
            if (changes.videoSnifferEnabled || changes.videoSnifferFormats) {
              log('Sniffer enabled or formats changed, rechecking resources')
              // 不清除现有资源，而是重新检查和过滤
              const resources = window.performance.getEntriesByType('resource')
              log('Found', resources.length, 'resources in performance API')
              resources.forEach(entry => {
                addResource(entry.name)
              })
              checkMediaElements()
            }
            
            // 如果只是autoCombine变化，只需要重新组合
            if (changes.videoSnifferAutoCombine) {
              log('AutoCombine setting changed, updating combinations')
            }
            
            requestUIUpdate(true)
            log('Config change handling complete')
          }
        }
      })
    }
  } catch (e) {
    // Failed to setup storage listener
  }

  // 从URL提取文件扩展名
  function getExtension(url) {
    try {
      const urlWithoutQuery = url.split('?')[0].split('#')[0]
      const atIndex = urlWithoutQuery.lastIndexOf('@.')
      if (atIndex !== -1) {
        const extAfterAt = urlWithoutQuery.substring(atIndex + 2).toLowerCase()
        if (extAfterAt) return extAfterAt
      }

      // 只在路径部分查找扩展名，避免误判域名中的点
      const urlObj = new URL(url)
      const pathname = urlObj.pathname

      const lastDotIndex = pathname.lastIndexOf('.')
      if (lastDotIndex === -1) return ''

      const ext = pathname.substring(lastDotIndex + 1).toLowerCase()
      const slashIndex = ext.indexOf('/')
      if (slashIndex !== -1) {
        return ext.substring(0, slashIndex)
      }
      return ext
    } catch (e) {
      return ''
    }
  }

  // 从MIME类型获取扩展名
  function getExtensionFromMimeType(mimeType) {
    if (!mimeType) return ''
    const mimeToExt = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/ogg': 'ogv',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/x-flv': 'flv',
      'video/x-matroska': 'mkv',
      'video/3gpp': '3gp',
      'video/3gpp2': '3g2',
      'video/mp2t': 'ts',
      'video/x-m4v': 'm4v',
      'video/x-mpeg': 'mpeg',
      'video/x-ms-wmv': 'wmv',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/mp3': 'mp3',
      'audio/webm': 'webm',
      'audio/ogg': 'oga',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/x-ms-wma': 'wma',
      'audio/x-aac': 'aac',
      'audio/aac': 'aac',
      'audio/flac': 'flac',
      'audio/x-flac': 'flac',
      'audio/opus': 'opus',
      'audio/vorbis': 'ogg',
      'audio/x-vorbis': 'ogg',
      'application/x-mpegURL': 'm3u8',
      'application/vnd.apple.mpegurl': 'm3u8',
      'application/dash+xml': 'mpd'
    }
    return mimeToExt[mimeType.toLowerCase().split(';')[0]] || ''
  }

  // 从URL参数中提取mime_type
  function getExtensionFromUrlParams(url) {
    try {
      const urlObj = new URL(url)
      const mimeType = urlObj.searchParams.get('mime_type')
      if (mimeType) {
        const mimeToExt = {
          'video_mp4': 'mp4',
          'video_webm': 'webm',
          'video_ogg': 'ogv',
          'video_mov': 'mov',
          'video_avi': 'avi',
          'video_flv': 'flv',
          'video_mkv': 'mkv',
          'video_3gp': '3gp',
          'video_3g2': '3g2',
          'video_ts': 'ts',
          'video_m4v': 'm4v',
          'video_mpeg': 'mpeg',
          'video_wmv': 'wmv',
          'audio_mp3': 'mp3',
          'audio_m4a': 'm4a',
          'audio_aac': 'aac',
          'audio_ogg': 'oga',
          'audio_wav': 'wav',
          'audio_wma': 'wma',
          'audio_webm': 'webm'
        }
        const ext = mimeToExt[mimeType.toLowerCase()]
        if (ext) {
          log('Found mime_type in URL params:', mimeType, '->', ext)
          return ext
        }
      }
      return ''
    } catch (e) {
      return ''
    }
  }

  // 检查URL是否应该被嗅探
  function shouldSniff(url, mimeType) {
    if (!configLoaded) {
      log('Config not loaded yet, skipping:', url.substring(0, 100))
      return false
    }
    if (!config.enabled || !url) return false

    const lowerUrl = url.toLowerCase()

    // 跳过blob URL（浏览器内部使用的临时URL）
    if (lowerUrl.startsWith('blob:')) {
      return false
    }

    if (lowerUrl.includes('/log/') ||
      lowerUrl.includes('/api/') ||
      lowerUrl.includes('/stat') ||
      lowerUrl.includes('analytics') ||
      lowerUrl.includes('tracking') ||
      lowerUrl.includes('beacon') ||
      lowerUrl.includes('metric') ||
      lowerUrl.includes('/thumb') ||
      lowerUrl.includes('/poster/') ||
      lowerUrl.includes('/avatar/') ||
      lowerUrl.includes('/sprite/') ||
      lowerUrl.includes('/captcha/') ||
      lowerUrl.includes('/favicon')) {
      return false
    }

    let ext = ''

    // 优先使用 MIME 类型检测（更准确）
    if (mimeType) {
      ext = getExtensionFromMimeType(mimeType)
      if (ext) {
        log('Extension from MIME type:', mimeType, '->', ext, 'URL:', url.substring(0, 100))
      }
    }

    // 如果 MIME 类型没有提供扩展名，尝试从 URL 获取
    if (!ext) {
      ext = getExtension(url)
    }

    // 如果还是没有扩展名，尝试从 URL 参数中的 mime_type 获取
    if (!ext) {
      ext = getExtensionFromUrlParams(url)
    }

    if (!ext) {
      // 抖音域名检测：抖音URL通常没有标准扩展名，通过URL参数和路径推断媒体类型
      try {
        const urlObj = new URL(url)
        if (isDouyinHost(urlObj.hostname)) {
          const paramMime = urlObj.searchParams.get('mime_type') || urlObj.searchParams.get('content_type') || ''
          const paramType = urlObj.searchParams.get('video_type') || urlObj.searchParams.get('type') || ''
          const paramAudioOnly = urlObj.searchParams.get('audio_only') || ''
          const pathLower = urlObj.pathname.toLowerCase()
          const hasVideoPath = pathLower.includes('/video/') || pathLower.includes('/tos/') || pathLower.includes('/obj/')
          const hasAudioPath = pathLower.includes('/audio/') || pathLower.includes('/sound/')

          if (paramMime.toLowerCase().includes('audio') || paramAudioOnly === 'true' || hasAudioPath) {
            ext = 'm4a'
            log('Douyin audio detected by URL params/path')
          } else if (paramMime.toLowerCase().includes('video') || paramType || hasVideoPath) {
            ext = 'mp4'
            log('Douyin video detected by URL params/path')
          }
        }
      } catch (e) {}
    }

    // 通用启发式媒体检测（适用于小众平台，当标准扩展名检测失败时）
    if (!ext) {
      ext = detectMediaHeuristic(url, mimeType)
      if (ext) {
        log('Media detected by heuristic:', ext, 'URL:', url.substring(0, 100))
      }
    }

    if (!ext) {
      // 只在调试模式下输出，并且过滤空 URL
      if (DEBUG && url && url.length > 0) {
        log('No extension found for:', url.substring(0, 100), 'MIME:', mimeType || 'none')
      }
      return false
    }

    if (config.excludeFormats.includes(ext)) {
      log('Excluded format:', ext, url.substring(0, 100))
      return false
    }

    // 检查扩展名是否在配置的格式列表中
    if (config.formats.includes(ext)) {
      log('Format matched:', ext, 'URL:', url.substring(0, 100))
      return true
    }

    // MIME 类型明确指示媒体内容时，即使不在格式列表中也接受
    if (mimeType) {
      const mimeLower = mimeType.toLowerCase().split(';')[0].trim()
      if (mimeLower.startsWith('video/') || mimeLower.startsWith('audio/') ||
          mimeLower.includes('mpegurl') || mimeLower.includes('dash+xml') ||
          mimeLower.includes('mp2t') || mimeLower.includes('matroska') ||
          mimeLower.includes('webm') || mimeLower.includes('flv')) {
        log('Accepted by MIME type bypass:', mimeType, 'URL:', url.substring(0, 100))
        return true
      }
    }

    // 已知媒体CDN的启发式检测结果也接受（确保小众平台资源不被遗漏）
    try {
      const urlObj = new URL(url)
      if (isKnownMediaCdnHost(urlObj.hostname)) {
        log('Accepted by known CDN heuristic:', ext, 'URL:', url.substring(0, 100))
        return true
      }
    } catch (e) {}

    log('Format not in list:', ext, 'Available:', config.formats.join(', '), 'URL:', url.substring(0, 100))
    return false
  }

  // 通用音频检测函数（适用于所有平台）
  const checkIfAudio = (url, ext, mimeType) => {
    log('Checking if audio:', url.substring(0, 100), 'ext:', ext, 'mimeType:', mimeType)
    
    // 1. 检查MIME类型
    if (mimeType) {
      const mimeTypeLower = mimeType.toLowerCase()
      if (mimeTypeLower.startsWith('audio/')) {
        log('Detected as audio by MIME type:', mimeType)
        return true
      }
    }
    
    // 2. 检查文件扩展名
    const audioExtensions = ['mp3', 'aac', 'm4a', 'wav', 'flac', 'ogg', 'oga', 'wma', 'opus', 'webm']
    if (ext && audioExtensions.includes(ext.toLowerCase())) {
      log('Detected as audio by extension:', ext)
      return true
    }
    
    // 3. 特殊处理M4S文件 - B站音频质量编号检测
    if (ext === 'm4s') {
      let isBiliM4s = false
      try {
        const urlObj = new URL(url)
        isBiliM4s = isTrustedBiliHost(urlObj.hostname) && urlObj.pathname.includes('.m4s')
      } catch (e) {
        isBiliM4s = false
      }
      if (isBiliM4s) {
        const audioQualityCodes = [
          '30280', '30232', '30216', // 标准音频质量编号
          '280', '232', '216' // 简化编号
        ]
        
        for (const code of audioQualityCodes) {
          if (url.includes(`-${code}.m4s`) || url.includes(`-${code}-`) || url.includes(`/${code}/`)) {
            log('Detected as audio M4S by quality code:', code)
            return true
          }
        }
        
        // 检查URL中是否包含音频相关的路径或参数
        if (url.includes('/audio/') || url.includes('_audio_') || url.includes('-audio-')) {
          log('Detected as audio M4S by URL pattern')
          return true
        }
      }
    }
    
    // 4. 检查URL路径中的音频关键词
    const urlLower = url.toLowerCase()
    const audioKeywords = [
      '/audio/', '_audio_', '-audio-', '.audio.',
      '/sound/', '_sound_', '-sound-', '.sound.',
      '/music/', '_music_', '-music-', '.music.',
      'audio=', 'sound=', 'music=',
      'type=audio', 'format=audio',
      '/a/', '_a_', '-a-' // 简短的音频标识
    ]
    
    for (const keyword of audioKeywords) {
      if (urlLower.includes(keyword)) {
        log('Detected as audio by URL keyword:', keyword)
        return true
      }
    }
    
    // 5. 检查URL参数中的音频标识
    try {
      const urlObj = new URL(url)
      const params = new URLSearchParams(urlObj.search)
      
      // 检查常见的音频参数
      const audioParams = ['audio', 'sound', 'music', 'track', 'stream_type']
      for (const param of audioParams) {
        const value = params.get(param)
        if (value && (value.toLowerCase() === 'true' || value.toLowerCase() === 'audio' || value.toLowerCase() === '1')) {
          log('Detected as audio by URL parameter:', param, '=', value)
          return true
        }
      }
      
      // 检查媒体类型参数
      const mediaType = params.get('mime_type') || params.get('type') || params.get('format')
      if (mediaType && mediaType.toLowerCase().includes('audio')) {
        log('Detected as audio by media type parameter:', mediaType)
        return true
      }
    } catch (e) {
      // URL解析失败，忽略
    }
    
    // 6. 检查文件名中的音频标识
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname.toLowerCase()
      const filename = pathname.split('/').pop() || ''
      
      const audioFilenamePatterns = [
        /audio/i, /sound/i, /music/i, /track/i,
        /_a\./i, /-a\./i, /\.a\./i, // 简短音频标识
        /soundtrack/i, /bgm/i, /voice/i
      ]
      
      for (const pattern of audioFilenamePatterns) {
        if (pattern.test(filename)) {
          log('Detected as audio by filename pattern:', pattern)
          return true
        }
      }
    } catch (e) {
      // URL解析失败，忽略
    }
    
    // 7. 抖音特定音频检测
    try {
      const urlObj = new URL(url)
      if (isDouyinHost(urlObj.hostname)) {
        const params = new URLSearchParams(urlObj.search)
        // 抖音音频流通常有明确的参数标识
        if (params.get('audio_only') === 'true') { log('Douyin audio: audio_only=true'); return true }
        if (params.get('type') === 'audio') { log('Douyin audio: type=audio'); return true }
        if (params.get('media_type') === 'audio') { log('Douyin audio: media_type=audio'); return true }
        if (params.get('stream_type') === 'audio') { log('Douyin audio: stream_type=audio'); return true }
        // 抖音音频路径标识
        const path = urlObj.pathname.toLowerCase()
        if (path.includes('/audio/') || path.includes('/sound/')) { log('Douyin audio: path keyword'); return true }
      }
    } catch (e) {}

    log('Not detected as audio')
    return false
  }

  // 从URL和其他信息推断可能的文件大小
  const inferResourceSize = (url, mimeType) => {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname.toLowerCase()
      const params = new URLSearchParams(urlObj.search)
      
      // 从URL参数中查找大小信息（这些通常是准确的）
      const sizeParams = ['len', 'size', 'filesize', 'content_length', 'cl', 'bytes']
      for (const param of sizeParams) {
        if (params.has(param)) {
          const size = parseInt(params.get(param)) || 0
          if (size > 0) {
            log('Found size in URL param', param + ':', size)
            return size
          }
        }
      }
      
      // 从URL路径中查找明确的大小信息（如文件名包含大小）
      const pathSizeMatch = pathname.match(/[\/_\-](\d+)([kmgt]?b)[\/_\-\.]/)
      if (pathSizeMatch) {
        const sizeValue = parseInt(pathSizeMatch[1])
        const unit = pathSizeMatch[2]?.toLowerCase() || ''
        
        if (sizeValue > 0 && unit) { // 必须有明确的单位
          let multiplier = 1
          if (unit === 'kb') multiplier = 1024
          else if (unit === 'mb') multiplier = 1024 * 1024
          else if (unit === 'gb') multiplier = 1024 * 1024 * 1024
          else if (unit === 'tb') multiplier = 1024 * 1024 * 1024 * 1024
          else if (unit === 'b') multiplier = 1 // bytes
          else return 0 // 不认识的单位，不估算
          
          const size = sizeValue * multiplier
          log('Found exact size from URL path:', size, 'from', pathSizeMatch[0])
          return size
        }
      }
      
    } catch (e) {
      log('Size inference failed:', e.message)
    }
    
    return 0 // 无法准确推断时返回0
  }

  // 解析资源信息（异步版本，支持多语言）
  async function parseResource(url, mimeType, size) {
    const currentLocale = cachedLocale || 'en'
    
    // 优先使用 MIME 类型获取扩展名（更准确）
    let ext = ''
    if (mimeType) {
      ext = getExtensionFromMimeType(mimeType)
      if (ext) {
        log('Using extension from MIME type for parsing:', mimeType, '->', ext)
      }
    }

    // 如果 MIME 类型没有提供扩展名，从 URL 获取
    if (!ext) {
      ext = getExtension(url)
    }

    // 如果还是没有，尝试从 URL 参数获取
    if (!ext) {
      ext = getExtensionFromUrlParams(url)
    }

    // 如果标准方法都失败了，使用启发式检测（适用于小众平台）
    if (!ext) {
      ext = detectMediaHeuristic(url, mimeType)
      if (ext) {
        log('Using heuristic extension for parsing:', ext, 'URL:', url.substring(0, 100))
      }
    }

    const info = {
      url: url,
      ext: ext || 'video',
      type: 'video',
      quality: '',
      size: 0,
      name: '',
      timestamp: Date.now()
    }

    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      const params = urlObj.searchParams
      const parts = pathname.split('/')
      let baseName = parts[parts.length - 1] || 'unknown'

      // 如果文件名没有正确的扩展名，但我们从 MIME 类型得到了扩展名
      if (ext && baseName && !baseName.toLowerCase().endsWith('.' + ext.toLowerCase())) {
        // 移除原有的错误扩展名（如果有）
        const lastDotIndex = baseName.lastIndexOf('.')
        if (lastDotIndex > 0) {
          // 检查是否是有效的扩展名
          const currentExt = baseName.substring(lastDotIndex + 1).toLowerCase()
          // 如果当前扩展名不在配置的格式列表中，就移除它
          if (!config.formats.includes(currentExt)) {
            baseName = baseName.substring(0, lastDotIndex)
          }
        }
        // 添加正确的扩展名
        info.name = baseName + '.' + ext
        log('文件名更新:', baseName, '->', info.name, '(使用 MIME 类型的扩展名:', ext + ')')
      } else {
        info.name = baseName
      }

      if (ext === 'm4s') {
        const u = new URL(url)
        const host = u.hostname
        if (host.endsWith('.bilivideo.com') || host.endsWith('.hdslb.com')) {
        const qualityMap = {
          // 视频质量编号映射（使用英文键值）
          '100027': '8K', '100026': '1080P', '100025': '4K', '100024': '720P',
          '100023': '480P', '100022': '360P', '100021': '240P', '100020': '144P',
          '100050': '4K HDR', '100051': '8K HDR', '100052': '1080P HDR',
          '100053': '720P HDR', '100054': '480P HDR',
          
          // 音频质量编号（使用英文键值）
          '30280': 'Audio', '30232': 'Hi-Res Audio', '30216': 'High Audio',
          
          // 标准视频质量编号
          '30127': '8K', '30126': 'Dolby Vision', '30125': 'HDR', '30120': '4K',
          '30116': '1080P60', '30112': '1080P+', '30080': '1080P', '30077': '1080P',
          '30074': '720P60', '30066': '720P60', '30064': '720P', '30048': '720P',
          '30032': '480P', '30033': '400P', '30016': '360P', '30006': '240P',
          '30011': '240P', '30005': '144P',
          
          // 新增的质量编号
          '30251': '8K+', '30250': '4K+', '30216': '1080P+', '30210': '1080P',
          '30192': '720P+', '30128': '720P', '30096': '480P+', '30080': '480P',
          '30064': '360P+', '30048': '360P', '30032': '240P+', '30016': '240P',
          
          // 特殊质量
          '30335': 'Dolby', '30350': 'HDR10+', '30400': 'AV1 8K', '30401': 'AV1 4K',
          '30402': 'AV1 1080P', '30403': 'AV1 720P',
          
          // 更多可能的编号
          '127': '8K', '126': 'Dolby Vision', '125': 'HDR', '120': '4K',
          '116': '1080P60', '112': '1080P+', '80': '1080P', '74': '720P60',
          '64': '720P', '32': '480P', '16': '360P', '6': '240P'
        }

        let qualityFound = false
        
        // 优先匹配完整的质量编号
        for (const [code, quality] of Object.entries(qualityMap)) {
          if (url.includes(`-${code}.m4s`) || url.includes(`-${code}-`) || url.includes(`/${code}/`)) {
            info.quality = getLocalizedQuality(quality, currentLocale)
            qualityFound = true
            log('Found quality by exact match:', code, '->', quality, '->', info.quality)
            break
          }
        }
        
        // 如果没有找到完整匹配，尝试部分匹配
        if (!qualityFound) {
          for (const [code, quality] of Object.entries(qualityMap)) {
            if (url.includes(code)) {
              info.quality = getLocalizedQuality(quality, currentLocale)
              qualityFound = true
              log('Found quality by partial match:', code, '->', quality, '->', info.quality)
              break
            }
          }
        }

        // 通用音频检测逻辑
        const isGeneralAudio = checkIfAudio(url, ext, mimeType)
        
        log('M4S resource analysis:', {
          url: url.substring(0, 100),
          qualityFound: qualityFound,
          isGeneralAudio: isGeneralAudio,
          quality: info.quality
        })
        
        if (isGeneralAudio) {
          info.type = 'audio'
          if (!qualityFound) info.quality = getLocalizedQuality('Audio', currentLocale)
          log('Classified as audio M4S:', info.quality)
        } else if (!qualityFound) {
          // 尝试从URL中提取质量编号的更智能方法
          const match = url.match(/-(\d+)\.m4s/)
          if (match) {
            const code = match[1]
            
            // 根据编号范围推断质量
            const codeNum = parseInt(code)
            if (codeNum >= 100000) {
              // 100xxx 系列
              if (codeNum >= 100050) info.quality = '4K+'
              else if (codeNum >= 100026) info.quality = '1080P+'
              else if (codeNum >= 100024) info.quality = '720P+'
              else info.quality = '480P+'
            } else if (codeNum >= 30000) {
              // 30xxx 系列
              if (codeNum >= 30280) info.quality = getLocalizedQuality('Audio', currentLocale)
              else if (codeNum >= 30120) info.quality = '4K'
              else if (codeNum >= 30080) info.quality = '1080P'
              else if (codeNum >= 30064) info.quality = '720P'
              else if (codeNum >= 30032) info.quality = '480P'
              else if (codeNum >= 30016) info.quality = '360P'
              else info.quality = '240P'
            } else {
              // 其他编号，直接显示
              info.quality = code
            }
            
            log('Inferred quality from code:', code, '->', info.quality)
          } else {
            info.quality = getLocalizedQuality('Unknown', currentLocale)
          }
        }

        // 为视频M4S流追加编码标识（H.264/H.265/AV1）
        if (info.type === 'video' && info.quality && !info.quality.includes('Audio')) {
          if (isBiliH264M4S(url)) {
            if (!info.quality.includes('H.26') && !info.quality.includes('AV1') && !info.quality.includes('Dolby') && !info.quality.includes('HDR')) {
              info.quality = `${info.quality} H.264`
            }
          } else {
            // 非H.264的已有标识（AV1/HDR/Dolby等），不重复添加
          }
        }

        // 尝试从URL参数获取大小
        if (params.has('len')) {
          info.size = parseInt(params.get('len')) || 0
        }
        if (!info.size && params.has('filesize')) {
          info.size = parseInt(params.get('filesize')) || 0
        }
        if (!info.size && params.has('size')) {
          info.size = parseInt(params.get('size')) || 0
        }
        }
      } else {
        info.quality = ext.toUpperCase()
        info.type = 'video'
        
        // 通用音频检测逻辑（适用于所有平台）
        const isAudio = checkIfAudio(url, ext, mimeType)
        if (isAudio) {
          info.type = 'audio'
          info.quality = getLocalizedQuality('Audio', currentLocale)
        }

        // 抖音质量推断：从URL参数中提取分辨率/质量信息
        try {
          const urlObj = new URL(url)
          if (isDouyinHost(urlObj.hostname)) {
            const ratio = urlObj.searchParams.get('ratio') || ''
            const qualityParam = urlObj.searchParams.get('quality') || ''
            const resolution = urlObj.searchParams.get('resolution') || ''
            const bitrate = urlObj.searchParams.get('bitrate') || ''
            const vcodec = urlObj.searchParams.get('vcodec') || ''

            if (ratio) {
              info.quality = ratio.toUpperCase()
              log('Douyin quality from ratio:', info.quality)
            } else if (qualityParam) {
              info.quality = qualityParam.toUpperCase()
              log('Douyin quality from quality param:', info.quality)
            } else if (resolution) {
              info.quality = resolution.toUpperCase()
              log('Douyin quality from resolution:', info.quality)
            }
            // 如果URL参数中有vcodec信息，可以进一步标识视频编码
            if (vcodec && !isAudio) {
              const codec = vcodec.toLowerCase()
              if (codec.includes('h265') || codec.includes('hevc')) {
                info.quality = `${info.quality} H.265`
              } else if (codec.includes('h264') || codec.includes('avc')) {
                info.quality = `${info.quality} H.264`
              } else if (codec.includes('av1')) {
                info.quality = `${info.quality} AV1`
              }
            }
          }
        } catch (e) {}
      }

      // 如果传入了有效的大小，使用传入的大小（优先级最高）
      if (size && size > 0) {
        info.size = size
      } else {
        // 尝试从URL推断大小
        const inferredSize = inferResourceSize(url, mimeType)
        if (inferredSize > 0) {
          info.size = inferredSize
        }
      }
    } catch (e) {
      // Parse error
    }

    return info
  }

  // 检查B站M4S URL是否为H.264编码（优先使用H.264，兼容性最好）
  const isBiliH264M4S = (url) => {
    try {
      // 提取质量编号
      const match = url.match(/-(\d+)\.m4s/) || url.match(/-(\d+)-/) || url.match(/\/(\d+)\//)
      if (!match) return true // 无法确定，假设是H.264
      const code = parseInt(match[1])
      if (isNaN(code)) return true

      // H.265/HDR/Dolby Vision 编码
      if ([30125, 30126, 30127, 125, 126, 127].includes(code)) return false
      // AV1 编码 (30400-30499, 400-403)
      if ((code >= 30400 && code <= 30499) || (code >= 400 && code <= 403)) return false
      // HDR 编码 (100xxx系列 100050-100054)
      if (code >= 100050 && code <= 100054) return false
      // Dolby/HDR10+
      if ([30335, 30350].includes(code)) return false
      // 8K+ 系列 (30251, 30250) 可能不是H.264
      if ([30251, 30250].includes(code)) return false

      return true // 其余编号默认为H.264
    } catch (e) {
      return true
    }
  }

  // 合并M4S格式的音视频流
  function combineM4SStreams() {
    const combined = []
    let videoStreams = sniffedResources.video.filter(r => r.ext === 'm4s')
    const audioStreams = sniffedResources.audio.filter(r => r.ext === 'm4s')

    // 优先处理H.264编码的视频流，确保合并结果使用兼容性最好的编码
    videoStreams.sort((a, b) => {
      const aH264 = isBiliH264M4S(a.url || '')
      const bH264 = isBiliH264M4S(b.url || '')
      if (aH264 && !bH264) return -1
      if (!aH264 && bH264) return 1
      return 0
    })

    log('Combining M4S streams - Video:', videoStreams.length, 'Audio:', audioStreams.length)

    // 用于跟踪已经组合过的视频流，避免重复
    const usedVideoUrls = new Set()
    const usedCombinations = new Set()
    const qualityGroups = new Map()

    videoStreams.forEach(video => {
      // 标准化视频URL用于去重检查
      const normalizeUrl = (url) => {
        try {
          const urlObj = new URL(url)
          // 对于M4S资源，使用资源ID和质量编号作为标识符
          if (url.includes('.m4s') && isTrustedBiliHost(urlObj.hostname)) {
            const pathMatch = urlObj.pathname.match(/(\d+)-1-(\d+)\.m4s/)
            if (pathMatch) {
              const resourceId = pathMatch[1]
              const qualityCode = pathMatch[2]
              return `video:${resourceId}:${qualityCode}`
            }
          }
          return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`
        } catch (e) {
          return url
        }
      }

      const normalizedVideoUrl = normalizeUrl(video.url)
      const quality = video.quality || 'Unknown'
      const contextId = video.videoContextId || ''
      const qualityKey = `${contextId}:${quality}`
      
      log('Processing video stream:', quality, video.url.substring(0, 100))
      
      // 如果这个视频URL已经被使用过，跳过
      if (usedVideoUrls.has(normalizedVideoUrl)) {
        log('Skipping duplicate video URL:', normalizedVideoUrl)
        return
      }

      // 如果这个质量已经有组合了，选择更好的（更大的文件或更完整的URL）
      if (qualityGroups.has(qualityKey)) {
        const existing = qualityGroups.get(qualityKey)
        const existingVideoSize = existing.videoSize || 0
        const currentVideoSize = video.size || 0
        
        // 如果当前视频更大或URL更完整，替换现有的
        if (currentVideoSize > existingVideoSize || 
            (currentVideoSize === existingVideoSize && video.url.length > existing.videoUrl.length)) {
          log('Replacing existing combination for quality:', qualityKey, 'old size:', existingVideoSize, 'new size:', currentVideoSize)
          // 移除旧的标记
          usedVideoUrls.delete(normalizeUrl(existing.videoUrl))
          usedCombinations.delete(existing.combinationId)
        } else {
          log('Keeping existing combination for quality:', quality)
          return
        }
      }

      // 查找匹配的音频流 - 使用更宽松的匹配策略
      const matchedAudio = audioStreams.find(audio => {
        log('Checking audio match for video:', quality, 'audio timestamp:', audio.timestamp, 'video timestamp:', video.timestamp)

        if (contextId && audio.videoContextId && audio.videoContextId !== contextId) {
          return false
        }
        
        // 策略1: 时间戳匹配（放宽到10秒内）
        const timeDiff = Math.abs(video.timestamp - audio.timestamp)
        if (timeDiff < 10000) {
          log('Audio matched by timestamp (within 10s):', timeDiff + 'ms')
          return true
        }
        
        // 策略2: URL相似性匹配
        try {
          const videoUrlObj = new URL(video.url)
          const audioUrlObj = new URL(audio.url)
          
          // 检查主机名和路径的相似性
          if (videoUrlObj.hostname === audioUrlObj.hostname) {
            const videoPath = videoUrlObj.pathname
            const audioPath = audioUrlObj.pathname
            
            // 检查路径是否包含相同的资源ID
            const videoId = videoPath.match(/(\d+)-1-(\d+)/)
            const audioId = audioPath.match(/(\d+)-1-(\d+)/)
            
            if (videoId && audioId && videoId[1] === audioId[1]) {
              log('Audio matched by resource ID:', videoId[1])
              return true
            }
          }
        } catch (e) {
          log('URL parsing failed for matching:', e.message)
        }
        
        // 策略3: 如果只有一个音频流，直接匹配
        if (audioStreams.length === 1) {
          log('Only one audio stream available, using it')
          return true
        }
        
        // 策略4: 按质量匹配（如果音频也有质量信息）
        if (audio.quality && audio.quality === quality) {
          log('Audio matched by quality:', quality)
          return true
        }
        
        return false
      })

      if (matchedAudio) {
        // 创建组合标识符，避免重复组合
        const combinationId = `${contextId}:${normalizedVideoUrl}:${normalizeUrl(matchedAudio.url)}:${quality}`
        
        if (usedCombinations.has(combinationId)) {
          log('Skipping duplicate combination:', combinationId)
          return
        }

        // 选择更准确的大小信息
        let totalSize = 0
        if (video.size > 0 && matchedAudio.size > 0) {
          totalSize = video.size + matchedAudio.size
        } else if (video.size > 0) {
          totalSize = video.size
        } else if (matchedAudio.size > 0) {
          totalSize = matchedAudio.size
        }

        const combinedItem = {
          quality: quality,
          videoUrl: video.url,
          audioUrl: matchedAudio.url,
          name: `${quality} 完整视频`,
          timestamp: video.timestamp,
          size: totalSize,
          videoSize: video.size || 0,
          audioSize: matchedAudio.size || 0,
          combinationId: combinationId,
          videoContextId: contextId || null
        }

        // 记录到质量分组中
        qualityGroups.set(qualityKey, combinedItem)

        // 标记为已使用
        usedVideoUrls.add(normalizedVideoUrl)
        usedCombinations.add(combinationId)
        
        log('✓ Created combined stream:', quality, 'Video size:', video.size, 'Audio size:', matchedAudio.size, 'Total:', totalSize)
      } else {
        log('✗ No matching audio found for video:', quality, video.url.substring(0, 100))
        
        // 如果没有找到匹配的音频，但有音频流，尝试使用第一个音频流
        if (audioStreams.length > 0) {
          const firstAudio = audioStreams[0]
          log('Using first available audio stream as fallback')
          
          const combinationId = `${contextId}:${normalizedVideoUrl}:${normalizeUrl(firstAudio.url)}:${quality}`
          
          if (!usedCombinations.has(combinationId)) {
            let totalSize = 0
            if (video.size > 0 && firstAudio.size > 0) {
              totalSize = video.size + firstAudio.size
            } else if (video.size > 0) {
              totalSize = video.size
            } else if (firstAudio.size > 0) {
              totalSize = firstAudio.size
            }

            const combinedItem = {
              quality: quality,
              videoUrl: video.url,
              audioUrl: firstAudio.url,
              name: `${quality} 完整视频`,
              timestamp: video.timestamp,
              size: totalSize,
              videoSize: video.size || 0,
              audioSize: firstAudio.size || 0,
              combinationId: combinationId,
              videoContextId: contextId || null
            }

            qualityGroups.set(qualityKey, combinedItem)
            usedVideoUrls.add(normalizedVideoUrl)
            usedCombinations.add(combinationId)
            
            log('✓ Created fallback combined stream:', quality, 'Video size:', video.size, 'Audio size:', firstAudio.size, 'Total:', totalSize)
          }
        }
      }
    })

    // 从质量分组中提取最终的组合项
    for (const [_, item] of qualityGroups) {
      combined.push({
        quality: item.quality,
        videoUrl: item.videoUrl,
        audioUrl: item.audioUrl,
        name: item.name,
        timestamp: item.timestamp,
        size: item.size,
        videoContextId: item.videoContextId || null
      })
    }

    log('✓ Combined streams created:', combined.length, 'from', videoStreams.length, 'video and', audioStreams.length, 'audio streams')
    combined.forEach((item, index) => {
      log(`Combined ${index + 1}:`, item.quality, 'Size:', item.size)
    })
    
    return combined
  }

  // 合并非M4S格式的音视频流（通用平台，如抖音等）
  function combineGenericStreams() {
    const combined = []
    const videoStreams = sniffedResources.video.filter(r => r && r.ext !== 'm4s')
    const audioStreams = sniffedResources.audio.filter(r => r && r.ext !== 'm4s')

    log('Combining generic streams - Video:', videoStreams.length, 'Audio:', audioStreams.length)

    if (videoStreams.length === 0 || audioStreams.length === 0) {
      return combined
    }

    const usedVideoUrls = new Set()
    const usedAudioUrls = new Set()

    videoStreams.forEach(video => {
      const normalizedVideoUrl = normalizeUrlForDedup(video.url)
      if (usedVideoUrls.has(normalizedVideoUrl)) return

      // 查找匹配的音频流
      const matchedAudio = audioStreams.find(audio => {
        const normalizedAudioUrl = normalizeUrlForDedup(audio.url)
        if (usedAudioUrls.has(normalizedAudioUrl)) return false

        // 策略1: 视频上下文匹配
        if (video.videoContextId && audio.videoContextId) {
          if (video.videoContextId === audio.videoContextId) return true
          return false
        }

        // 策略2: 时间戳匹配（10秒内）
        const timeDiff = Math.abs(video.timestamp - audio.timestamp)
        if (timeDiff < 10000) {
          log('Generic audio matched by timestamp (within 10s):', timeDiff + 'ms')
          return true
        }

        // 策略3: URL相似性匹配（同一主机）
        try {
          const videoUrlObj = new URL(video.url)
          const audioUrlObj = new URL(audio.url)
          if (videoUrlObj.hostname === audioUrlObj.hostname) {
            log('Generic audio matched by same hostname:', videoUrlObj.hostname)
            return true
          }
        } catch (e) {}

        // 策略4: 抖音URL路径相似性匹配和视频ID匹配
        try {
          const videoUrlObj = new URL(video.url)
          const audioUrlObj = new URL(audio.url)
          if (isDouyinHost(videoUrlObj.hostname) || isDouyinHost(audioUrlObj.hostname)) {
            // 提取URL路径中较长的段（通常是视频ID的一部分）
            const videoPathParts = videoUrlObj.pathname.split('/').filter(p => p.length > 10)
            const audioPathParts = audioUrlObj.pathname.split('/').filter(p => p.length > 10)
            const commonParts = videoPathParts.filter(p => audioPathParts.includes(p))
            if (commonParts.length > 0) {
              log('Douyin audio matched by path segments:', commonParts.length)
              return true
            }
            // 检查URL参数中是否有相同的视频ID
            const videoId = videoUrlObj.searchParams.get('video_id') || videoUrlObj.searchParams.get('vid') || videoUrlObj.searchParams.get('item_id') || ''
            const audioId = audioUrlObj.searchParams.get('video_id') || audioUrlObj.searchParams.get('vid') || audioUrlObj.searchParams.get('item_id') || ''
            if (videoId && audioId && videoId === audioId) {
              log('Douyin audio matched by video ID:', videoId)
              return true
            }
          }
        } catch (e) {}

        // 策略5: 如果只有一个音频流，直接匹配
        if (audioStreams.length === 1) {
          log('Only one generic audio stream available, using it')
          return true
        }

        return false
      })

      if (matchedAudio) {
        const quality = video.quality || ''
        const ext = video.ext || 'mp4'
        let totalSize = 0
        if (video.size > 0 && matchedAudio.size > 0) {
          totalSize = video.size + matchedAudio.size
        } else if (video.size > 0) {
          totalSize = video.size
        } else if (matchedAudio.size > 0) {
          totalSize = matchedAudio.size
        }

        const combinedItem = {
          quality: quality,
          videoUrl: video.url,
          audioUrl: matchedAudio.url,
          name: `${quality || ext.toUpperCase()} 完整视频`,
          timestamp: video.timestamp,
          size: totalSize,
          videoSize: video.size || 0,
          audioSize: matchedAudio.size || 0,
          videoContextId: video.videoContextId || matchedAudio.videoContextId || null
        }

        combined.push(combinedItem)
        usedVideoUrls.add(normalizedVideoUrl)
        usedAudioUrls.add(normalizeUrlForDedup(matchedAudio.url))

        log('✓ Created generic combined stream:', quality || ext, 'Video size:', video.size, 'Audio size:', matchedAudio.size, 'Total:', totalSize)
      } else {
        log('✗ No matching generic audio found for video:', quality || ext, video.url.substring(0, 100))
      }
    })

    log('✓ Generic combined streams created:', combined.length, 'from', videoStreams.length, 'video and', audioStreams.length, 'audio streams')
    return combined
  }

  // 性能统计
  const sizeStats = {
    totalRequests: 0,
    successfulRequests: 0,
    cacheHits: 0,
    methodSuccess: {
      contentLength: 0,
      responseSize: 0,
      headRequest: 0,
      rangeRequest: 0,
      xhrRequest: 0,
      inference: 0
    }
  }
  
  const logSizeSuccess = (method, size) => {
    sizeStats.totalRequests++
    if (size > 0) {
      sizeStats.successfulRequests++
      sizeStats.methodSuccess[method]++
      log('Size success via', method + ':', size, 'Success rate:', 
          (sizeStats.successfulRequests / sizeStats.totalRequests * 100).toFixed(1) + '%')
    }
  }

  // 资源大小获取队列，避免同时发送太多请求
  const sizeRequestQueue = []
  const sizeRequestCache = new Map() // 缓存已请求的URL，避免重复请求
  let isProcessingQueue = false
  let activeRequests = 0
  const MAX_CONCURRENT_REQUESTS = 3 // 最大并发请求数
  
  const processSizeRequestQueue = async () => {
    if (isProcessingQueue) return
    
    isProcessingQueue = true
    
    while (sizeRequestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
      const { url, resolve, retries } = sizeRequestQueue.shift()
      
      // 检查缓存（使用标准化URL）
      const normalizeUrl = (url) => {
        try {
          const urlObj = new URL(url)
          return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`
        } catch (e) {
          return url
        }
      }
      
      const normalizedUrl = normalizeUrl(url)
      if (sizeRequestCache.has(normalizedUrl)) {
        const cachedResult = sizeRequestCache.get(normalizedUrl)
        sizeStats.cacheHits++
        resolve(cachedResult)
        continue
      }
      
      activeRequests++
      
      // 异步处理请求
      (async () => {
        try {
          const size = await fetchResourceSize(url)
          
          // 缓存结果（使用标准化URL）
          const normalizedUrl = normalizeUrl(url)
          sizeRequestCache.set(normalizedUrl, size)
          resolve(size)
          
          // 如果获取失败且还有重试次数，重新加入队列
          if (size === 0 && retries > 0) {
            log('Retrying size request for:', url.substring(0, 100), 'retries left:', retries - 1)
            sizeRequestQueue.push({ url, resolve: () => {}, retries: retries - 1 })
          }
        } catch (e) {
          log('Size request error:', e.message)
          resolve(0)
        } finally {
          activeRequests--
          // 继续处理队列
          setTimeout(() => processSizeRequestQueue(), 50)
        }
      })()
      
      // 添加小延迟，避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    
    isProcessingQueue = false
  }
  
  const queueSizeRequest = (url) => {
    return new Promise((resolve) => {
      // 使用标准化的URL进行缓存检查
      const normalizeUrl = (url) => {
        try {
          const urlObj = new URL(url)
          return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`
        } catch (e) {
          return url
        }
      }
      
      const normalizedUrl = normalizeUrl(url)
      
      // 检查缓存（使用标准化URL）
      if (sizeRequestCache.has(normalizedUrl)) {
        sizeStats.cacheHits++
        resolve(sizeRequestCache.get(normalizedUrl))
        return
      }
      
      // 检查是否已在队列中（使用标准化URL）
      const existingRequest = sizeRequestQueue.find(req => normalizeUrl(req.url) === normalizedUrl)
      if (existingRequest) {
        // 如果已在队列中，不重复添加，但如果当前URL更完整，更新队列中的URL
        if (url.length > existingRequest.url.length) {
          existingRequest.url = url
          log('Updated queued URL to more complete version:', url.substring(0, 100))
        }
        return
      }
      
      sizeRequestQueue.push({ url, resolve, retries: 2 }) // 最多重试2次
      processSizeRequestQueue()
    })
  }

  // 专门获取资源文件大小的函数（通用且强化）
  const fetchResourceSize = async (url) => {
    try {
      log('Attempting to fetch size for:', url.substring(0, 100))
      
      // 策略1: HEAD请求获取Content-Length
      try {
        const headResponse = await fetch(url, { 
          method: 'HEAD',
          mode: 'cors',
          credentials: 'include',
          cache: 'no-cache',
          headers: {
            // 移除User-Agent，浏览器会自动设置
            'Accept': '*/*',
            'Accept-Encoding': 'identity' // 避免压缩影响大小
          }
        })
        
        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('Content-Length')
          if (contentLength) {
            const size = parseInt(contentLength) || 0
            if (size > 0) {
              log('Got size from HEAD request:', size, 'for URL:', url.substring(0, 100))
              return size
            }
          }
        }
      } catch (e) {
        log('HEAD request failed:', e.message)
      }
      
      // 策略2: Range请求获取总大小
      try {
        const rangeResponse = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
          headers: {
            'Range': 'bytes=0-1023', // 请求前1KB
            // 移除User-Agent，浏览器会自动设置
            'Accept': '*/*'
          },
          cache: 'no-cache'
        })
        
        if (rangeResponse.ok) {
          let contentRange = null
          try {
            contentRange = rangeResponse.headers.get('Content-Range')
          } catch (e) {
            // CORS 限制，无法读取 Content-Range 头
          }
          if (contentRange) {
            // Content-Range: bytes 0-1023/1234567
            const match = contentRange.match(/bytes \d+-\d+\/(\d+)/)
            if (match) {
              const size = parseInt(match[1]) || 0
              if (size > 0) {
                log('Got size from Range request:', size, 'for URL:', url.substring(0, 100))
                return size
              }
            }
          }
          
          // 如果Range请求成功但没有Content-Range，检查Content-Length
          const contentLength = rangeResponse.headers.get('Content-Length')
          if (contentLength) {
            const partialSize = parseInt(contentLength) || 0
            // 如果返回的是完整文件（不支持Range），Content-Length就是文件大小
            if (partialSize > 1024) {
              log('Got full size from Range request Content-Length:', partialSize, 'for URL:', url.substring(0, 100))
              return partialSize
            }
          }
        }
      } catch (e) {
        log('Range request failed:', e.message)
      }
      
      // 策略3: 完整GET请求获取准确大小
      try {
        const getResponse = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
          headers: {
            // 移除User-Agent，浏览器会自动设置
            'Accept': '*/*'
          },
          cache: 'no-cache'
        })
        
        if (getResponse.ok) {
          // 先检查Content-Length
          const contentLength = getResponse.headers.get('Content-Length')
          if (contentLength) {
            const size = parseInt(contentLength) || 0
            if (size > 0) {
              log('Got size from GET Content-Length:', size, 'for URL:', url.substring(0, 100))
              return size
            }
          }
          
          // 如果没有Content-Length，读取完整响应体获取准确大小
          try {
            const blob = await getResponse.blob()
            if (blob && blob.size > 0) {
              log('Got exact size from full response blob:', blob.size, 'for URL:', url.substring(0, 100))
              return blob.size
            }
          } catch (e) {
            log('Failed to get blob size:', e.message)
          }
        }
      } catch (e) {
        log('GET request failed:', e.message)
      }
      
      // 策略4: 尝试不同的请求方式
      try {
        // 尝试使用XMLHttpRequest，有时比fetch更容易获取到Content-Length
        const xhr = new XMLHttpRequest()
        return new Promise((resolve) => {
          xhr.open('HEAD', url, true)
          // 移除不安全的头部设置，浏览器会自动设置User-Agent
          xhr.setRequestHeader('Accept', '*/*')
          
          xhr.onreadystatechange = function() {
            if (xhr.readyState === 2) { // HEADERS_RECEIVED
              const contentLength = xhr.getResponseHeader('Content-Length')
              if (contentLength) {
                const size = parseInt(contentLength) || 0
                if (size > 0) {
                  log('Got size from XHR HEAD:', size, 'for URL:', url.substring(0, 100))
                  resolve(size)
                  return
                }
              }
            }
            if (xhr.readyState === 4) {
              resolve(0)
            }
          }
          
          xhr.onerror = () => resolve(0)
          xhr.ontimeout = () => resolve(0)
          xhr.timeout = 5000 // 5秒超时
          
          try {
            xhr.send()
          } catch (e) {
            resolve(0)
          }
        })
      } catch (e) {
        log('XHR request failed:', e.message)
      }
      
    } catch (e) {
      log('All size fetch strategies failed for:', url.substring(0, 100), e.message)
    }
    return 0
  }

  // 添加资源
  async function addResource(url, mimeType, size) {
    log('Adding resource:', url.substring(0, 150), 'mimeType:', mimeType, 'size:', size)
    
    if (!shouldSniff(url, mimeType)) {
      log('Resource skipped by shouldSniff filter')
      return
    }

    log('Resource passed shouldSniff filter, processing...')
    const videoContextId = getVideoContextIdForResource(url)

    const normalizedUrl = normalizeUrlForDedup(url)
    
    // 检查是否已存在相同的核心URL
    const existingVideo = sniffedResources.video.find(r => normalizeUrlForDedup(r.url) === normalizedUrl)
    const existingAudio = sniffedResources.audio.find(r => normalizeUrlForDedup(r.url) === normalizedUrl)
    
    // 如果已存在，只在新的信息更完整时才更新
    if (existingVideo) {
      let shouldUpdate = false

      if (!existingVideo.videoContextId && videoContextId) {
        existingVideo.videoContextId = videoContextId
        shouldUpdate = true
      }
      
      // 如果新的URL更完整（更长），更新URL
      if (url.length > existingVideo.url.length) {
        existingVideo.url = url
        shouldUpdate = true
        log('Updated video URL to more complete version:', url.substring(0, 100))
      }
      
      // 如果新的大小更大且有效，更新大小
      if (size && size > 0 && size > (existingVideo.size || 0)) {
        existingVideo.size = size
        shouldUpdate = true
        log('Updated existing video resource size:', size)
      }
      
      // 如果现有资源没有质量信息，但新资源有，则更新
      const newInfo = await parseResource(url, mimeType, size)
      if ((!existingVideo.quality || existingVideo.quality === 'Unknown') && newInfo.quality && newInfo.quality !== 'Unknown') {
        existingVideo.quality = newInfo.quality
        shouldUpdate = true
        log('Updated existing video quality:', newInfo.quality)
      }
      
      if (shouldUpdate) {
        requestUIUpdate(false)
      }
      return
    }
    
    if (existingAudio) {
      let shouldUpdate = false

      if (!existingAudio.videoContextId && videoContextId) {
        existingAudio.videoContextId = videoContextId
        shouldUpdate = true
      }
      
      // 如果新的URL更完整（更长），更新URL
      if (url.length > existingAudio.url.length) {
        existingAudio.url = url
        shouldUpdate = true
        log('Updated audio URL to more complete version:', url.substring(0, 100))
      }
      
      // 如果新的大小更大且有效，更新大小
      if (size && size > 0 && size > (existingAudio.size || 0)) {
        existingAudio.size = size
        shouldUpdate = true
        log('Updated existing audio resource size:', size)
      }
      
      // 如果现有资源没有质量信息，但新资源有，则更新
      const newInfo = await parseResource(url, mimeType, size)
      if ((!existingAudio.quality || existingAudio.quality === 'Unknown') && newInfo.quality && newInfo.quality !== 'Unknown') {
        existingAudio.quality = newInfo.quality
        shouldUpdate = true
        log('Updated existing audio quality:', newInfo.quality)
      }
      
      if (shouldUpdate) {
        requestUIUpdate(false)
      }
      return
    }

    const info = await parseResource(url, mimeType, size)
    if (videoContextId) {
      info.videoContextId = videoContextId
    }

    // 立即添加资源到列表，不等待大小获取
    if (info.type === 'audio') {
      sniffedResources.audio.push(info)
      log('✓ Audio detected:', info.quality, info.name, 'size:', info.size, 'ext:', info.ext, url.substring(0, 100))
      log('Current audio resources count:', sniffedResources.audio.length)
    } else {
      sniffedResources.video.push(info)
      log('✓ Video detected:', info.quality, info.name, 'size:', info.size, 'ext:', info.ext, url.substring(0, 100))
      log('Current video resources count:', sniffedResources.video.length)
    }

    requestUIUpdate((sniffedResources.video.length + sniffedResources.audio.length) <= 1)

    // 如果没有大小信息，异步获取（不阻塞UI显示）
    if (!info.size || info.size === 0) {
      queueSizeRequest(url).then(fetchedSize => {
        if (fetchedSize > 0) {
          info.size = fetchedSize
          log('Fetched resource size:', fetchedSize, 'for', url.substring(0, 100))
          requestUIUpdate(false)
        }
      }).catch(e => {
        log('Failed to fetch size:', e)
      })
    }
  }

  async function addResourceFromMediaElement(element, url, mimeType, size) {
    try {
      if (!url || !/^https?:/i.test(url)) return
      if (!shouldSniff(url, mimeType)) return
      const info = await parseResource(url, mimeType, size)
      if (element && element.tagName === 'VIDEO') {
        const contextId = ensureVideoContext(element)
        if (contextId) info.videoContextId = contextId
      }

      const normalizedUrl = normalizeUrlForDedup(info.url)
      if (!normalizedUrl) return

      if (info.type === 'audio') {
        const existing = sniffedResources.audio.find(r => normalizeUrlForDedup(r.url) === normalizedUrl)
        if (existing) {
          let changed = false
          if (!existing.videoContextId && info.videoContextId) {
            existing.videoContextId = info.videoContextId
            changed = true
          }
          if (info.url && info.url.length > (existing.url || '').length) {
            existing.url = info.url
            changed = true
          }
          if (info.size && info.size > 0 && info.size > (existing.size || 0)) {
            existing.size = info.size
            changed = true
          }
          if ((!existing.quality || existing.quality === 'Unknown') && info.quality && info.quality !== 'Unknown') {
            existing.quality = info.quality
            changed = true
          }
          if (changed) requestUIUpdate(false)
          return
        }
        sniffedResources.audio.push(info)
        requestUIUpdate((sniffedResources.video.length + sniffedResources.audio.length) <= 1)
        return
      }

      const existing = sniffedResources.video.find(r => normalizeUrlForDedup(r.url) === normalizedUrl)
      if (existing) {
        let changed = false
        if (!existing.videoContextId && info.videoContextId) {
          existing.videoContextId = info.videoContextId
          changed = true
        }
        if (info.url && info.url.length > (existing.url || '').length) {
          existing.url = info.url
          changed = true
        }
        if (info.size && info.size > 0 && info.size > (existing.size || 0)) {
          existing.size = info.size
          changed = true
        }
        if ((!existing.quality || existing.quality === 'Unknown') && info.quality && info.quality !== 'Unknown') {
          existing.quality = info.quality
          changed = true
        }
        if (changed) requestUIUpdate(false)
        return
      }

      sniffedResources.video.push(info)
      requestUIUpdate((sniffedResources.video.length + sniffedResources.audio.length) <= 1)
    } catch (e) {}
  }

  // 更新UI显示
  function updateUI() {
    let m4sResources = []
    const videoM4S = sniffedResources.video.filter(r => r.ext === 'm4s')
    const audioM4S = sniffedResources.audio.filter(r => r.ext === 'm4s')
    m4sResources = [...videoM4S, ...audioM4S]

    // 确保m4s资源被正确设置
    sniffedResources.m4s = m4sResources

    // 确保autoCombine配置已加载且启用
    if (config.autoCombine && configLoaded) {
      const m4sCombined = combineM4SStreams()
      const genericCombined = combineGenericStreams()
      sniffedResources.combined = [...m4sCombined, ...genericCombined]
      log('Auto-combine enabled, created', sniffedResources.combined.length, 'combined streams (M4S:', m4sCombined.length, 'Generic:', genericCombined.length, ')')
    } else {
      sniffedResources.combined = []
      if (!configLoaded) {
        log('Config not loaded yet, skipping auto-combine')
      } else {
        log('Auto-combine disabled in config')
      }
    }

    const totalCount = sniffedResources.video.length + sniffedResources.audio.length

    log('UI Update:', {
      video: sniffedResources.video.length,
      audio: sniffedResources.audio.length,
      m4s: m4sResources.length,
      combined: sniffedResources.combined.length,
      total: totalCount,
      autoCombine: config.autoCombine,
      configLoaded: configLoaded
    })

    const event = new CustomEvent('lerxu-resources-updated', {
      detail: {
        video: sniffedResources.video,
        audio: sniffedResources.audio,
        m4s: m4sResources,
        combined: sniffedResources.combined,
        total: totalCount
      }
    })
    log('Dispatching event to document with total:', totalCount, 'combined:', sniffedResources.combined.length)
    document.dispatchEvent(event)
    log('Event dispatched')

    // 如果在 iframe 中，向父窗口发送消息
    try {
      if (window.top !== window) {
        // In iframe, sending message to parent
        window.top.postMessage({
          type: 'lerxu-resources-updated',
          data: {
            video: sniffedResources.video,
            audio: sniffedResources.audio,
            m4s: m4sResources,
            combined: sniffedResources.combined,
            total: totalCount
          }
        }, '*')
      }
    } catch (e) {
      // Cannot access parent window
    }
  }

  // 拦截 XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url
    this._mimeType = null
    this._size = 0
    this._method = method
    return originalXHROpen.apply(this, arguments)
  }

  const originalXHRSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function () {
    if (this._url) {
      const xhr = this
      const originalOnReadyStateChange = xhr.onreadystatechange
      
      xhr.onreadystatechange = function () {
        if (xhr.readyState === xhr.HEADERS_RECEIVED) {
          const contentType = xhr.getResponseHeader('Content-Type')
          const contentLength = xhr.getResponseHeader('Content-Length')

          if (contentType) {
            xhr._mimeType = contentType
          }

          // 优先使用Content-Length
          if (contentLength) {
            xhr._size = parseInt(contentLength) || 0
            log('XHR Content-Length:', xhr._size, 'for', xhr._url.substring(0, 100))
          }

          // 如果没有Content-Length，尝试从Content-Range获取总大小
          // 注意：跨域请求中读取Content-Range会触发浏览器的安全警告，
          // 因此仅在Content-Length不可用时才尝试，且仅对同源请求读取
          if (!xhr._size) {
            let contentRange = null
            try {
              const urlObj = new URL(xhr._url, location.href)
              if (urlObj.origin === location.origin) {
                contentRange = xhr.getResponseHeader('Content-Range')
              }
            } catch (e) {
              // URL解析失败或无法读取头部，忽略
            }
            if (contentRange) {
              const match = contentRange.match(/bytes \d+-\d+\/(\d+)/)
              if (match) {
                xhr._size = parseInt(match[1]) || 0
                log('XHR Content-Range total size:', xhr._size, 'for', xhr._url.substring(0, 100))
              }
            }
          }
        }
        
        if (xhr.readyState === xhr.DONE) {
          let finalSize = xhr._size
          
          // 如果还没有大小信息，尝试从响应中计算
          if (!finalSize && xhr.response) {
            if (xhr.responseType === 'arraybuffer') {
              finalSize = xhr.response.byteLength || 0
            } else if (xhr.responseType === 'blob') {
              finalSize = xhr.response.size || 0
            } else if (typeof xhr.response === 'string') {
              finalSize = new Blob([xhr.response]).size
            } else if (xhr.responseText) {
              finalSize = new Blob([xhr.responseText]).size
            }
            
            if (finalSize > 0) {
              log('XHR response size calculated:', finalSize, 'for', xhr._url.substring(0, 100))
            }
          }
          
          // 只有当我们有有效大小或者这是一个我们关心的资源时才添加
          if (shouldSniff(xhr._url, xhr._mimeType)) {
            addResource(xhr._url, xhr._mimeType, finalSize)
          }
        }
        
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(xhr, arguments)
        }
      }
      
      // 添加错误处理
      const originalOnError = xhr.onerror
      xhr.onerror = function() {
        // 即使出错也尝试添加资源（大小为0）
        if (shouldSniff(xhr._url, xhr._mimeType)) {
          addResource(xhr._url, xhr._mimeType, 0)
        }
        if (originalOnError) {
          originalOnError.apply(xhr, arguments)
        }
      }
    }
    return originalXHRSend.apply(this, arguments)
  }

  // 拦截 Fetch API
  const originalFetch = window.fetch
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input.url || '')
    const method = init?.method || 'GET'
    
    if (url) {
      // 获取响应并检查各种大小信息
      const fetchPromise = originalFetch.apply(this, arguments)
      fetchPromise.then(response => {
        const contentType = response.headers.get('Content-Type')
        const contentLength = response.headers.get('Content-Length')
        let contentRange = null
        try {
          contentRange = response.headers.get('Content-Range')
        } catch (e) {
          // CORS 限制，无法读取 Content-Range 头
        }
        const contentEncoding = response.headers.get('Content-Encoding')
        
        let size = 0
        
        // 优先使用Content-Length（如果没有压缩）
        if (contentLength && !contentEncoding) {
          size = parseInt(contentLength) || 0
          log('Fetch Content-Length:', size, 'for', url.substring(0, 100))
        }
        
        // 如果是Range请求，从Content-Range获取总大小
        if (!size && contentRange) {
          const match = contentRange.match(/bytes \d+-\d+\/(\d+)/)
          if (match) {
            size = parseInt(match[1]) || 0
            log('Fetch Content-Range total size:', size, 'for', url.substring(0, 100))
          }
        }
        
        if (size > 0) {
          // 如果有明确的大小信息，立即添加
          if (shouldSniff(url, contentType)) {
            addResource(url, contentType, size)
          }
        } else {
          // 如果没有大小信息，先立即添加资源（大小为0），然后异步获取大小
          if (shouldSniff(url, contentType)) {
            addResource(url, contentType, 0)
            
            // 异步获取准确大小
            if (response.body && response.headers.get('Content-Type')) {
              // 克隆响应以避免消费原始流
              const clonedResponse = response.clone()
              
              // 尝试多种方式获取大小
              Promise.race([
                // 方式1: 转换为blob获取大小
                clonedResponse.blob().then(blob => ({ type: 'blob', size: blob ? blob.size : 0 })),
                // 方式2: 转换为arrayBuffer获取大小
                clonedResponse.arrayBuffer().then(buffer => ({ type: 'buffer', size: buffer ? buffer.byteLength : 0 })),
                // 方式3: 超时保护
                new Promise(resolve => setTimeout(() => resolve({ type: 'timeout', size: 0 }), 3000))
              ]).then(result => {
                const blobSize = result.size || 0
                log('Fetch', result.type, 'size for', url.substring(0, 100), ':', blobSize)
                
                // 如果获取到了更准确的大小，更新资源
                if (blobSize > 0) {
                  addResource(url, contentType, blobSize)
                }
              }).catch(() => {
                log('Failed to get accurate size for', url.substring(0, 100))
              })
            }
          }
        }
      }).catch((error) => {
        log('Fetch error for', url.substring(0, 100), ':', error.message)
        // 请求失败，但如果是我们关心的资源，仍然添加（大小为0）
        if (shouldSniff(url, null)) {
          addResource(url, null, 0)
        }
      })

      return fetchPromise
    }
    return originalFetch.apply(this, arguments)
  }

  // Network interceptors installed

  // 使用 PerformanceObserver
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // 跳过blob URL
        if (entry.name.toLowerCase().startsWith('blob:')) {
          continue
        }
        if (entry.initiatorType === 'xmlhttprequest' ||
          entry.initiatorType === 'fetch' ||
          entry.initiatorType === 'video' ||
          entry.initiatorType === 'audio') {
          addResource(entry.name)
        }
      }
    })
    observer.observe({ entryTypes: ['resource'] })
    // PerformanceObserver installed
  } catch (e) {
    // PerformanceObserver not available
  }

  // 检查已加载的资源
  function checkExistingResources() {
    if (window.performance && window.performance.getEntriesByType) {
      const resources = window.performance.getEntriesByType('resource')
      // Checking existing resources
      resources.forEach(entry => {
        // 跳过blob URL
        if (!entry.name.toLowerCase().startsWith('blob:')) {
          addResource(entry.name)
        }
      })
    }
  }

  // 检查媒体元素
  function checkMediaElements() {
    if (!configLoaded) {
      // Config not loaded yet, skipping media elements check
      return
    }
    const mediaElements = document.querySelectorAll('video, audio')
    mediaElements.forEach(element => {
      const mimeType = element.getAttribute('type') || ''
      if (element.src) {
        const src = element.src
        // Found media src
        // 跳过blob URL
        if (!src.toLowerCase().startsWith('blob:')) {
          addResourceFromMediaElement(element, src, mimeType)
        }
      }
      if (element.currentSrc) {
        const src = element.currentSrc
        // Found media currentSrc
        // 跳过blob URL
        if (!src.toLowerCase().startsWith('blob:')) {
          addResourceFromMediaElement(element, src, mimeType)
        }
      }
      const sources = element.querySelectorAll('source')
      sources.forEach(source => {
        const sourceMimeType = source.getAttribute('type') || ''
        if (source.src) {
          const src = source.src
          // Found source src
          // 跳过blob URL
          if (!src.toLowerCase().startsWith('blob:')) {
            addResourceFromMediaElement(element, src, sourceMimeType)
          }
        }
      })
    })
  }

  // 更频繁地检查媒体元素（每秒一次）
  setInterval(checkMediaElements, 1000)

  if (document.readyState === 'complete') {
    setTimeout(checkMediaElements, 200)
  } else {
    window.addEventListener('load', () => {
      setTimeout(checkMediaElements, 200)
    })
  }

  // 监听 video 元素的 loadstart 事件
  const observeVideoElements = () => {
    const videos = document.querySelectorAll('video')
    videos.forEach(video => {
      ensureVideoContext(video)
      if (!video._lerxuObserved) {
        video._lerxuObserved = true
        const mimeType = video.getAttribute('type') || ''
        video.addEventListener('loadstart', () => {
          const src = video.src || video.currentSrc
          // Video loadstart
          // 跳过blob URL
          if (src && !src.toLowerCase().startsWith('blob:')) {
            addResourceFromMediaElement(video, src, mimeType)
          }
        })
        video.addEventListener('play', () => {
          const src = video.src || video.currentSrc
          // Video play
          // 跳过blob URL
          if (src && !src.toLowerCase().startsWith('blob:')) {
            addResourceFromMediaElement(video, src, mimeType)
          }
        })
      }
    })
  }

  setInterval(observeVideoElements, 1000)

  // 使用 MutationObserver 监听 DOM 变化
  const domObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
            // New media element added
            observeVideoElements()
            checkMediaElements()
          }
          // 检查子元素
          const mediaElements = node.querySelectorAll && node.querySelectorAll('video, audio')
          if (mediaElements && mediaElements.length > 0) {
            // New media elements found
            observeVideoElements()
            checkMediaElements()
          }
        }
      })
    })
  })

  domObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  })
  // MutationObserver installed

  // 监听资源请求
  window.addEventListener('lerxu-get-resources', () => {
    // Resource request received
    requestUIUpdate(true)
  })

  window.addEventListener('message', (event) => {
    try {
      if (event && event.data && event.data.type === 'lerxu-clear-resources') {
        window.dispatchEvent(new Event('lerxu-clear-resources'))
      }
    } catch (e) {}
  })

  // 监听清除资源事件（当切换到不同的视频预览时触发）
  window.addEventListener('lerxu-clear-resources', () => {
    // Clear resources request received
    // 添加保护：只有在确实需要清除时才清除
    const currentResourceCount = sniffedResources.video.length + sniffedResources.audio.length
    if (currentResourceCount > 0) {
      log('Clearing', currentResourceCount, 'resources on explicit request')
    }
    
    sniffedResources.video = []
    sniffedResources.audio = []
    sniffedResources.m4s = []
    sniffedResources.combined = []
    
    // 清空已清除URL记录，允许重新检测
    clearedResourceUrls.clear()
    
    // 立即更新UI显示为空
    requestUIUpdate(true)
    
    // 延迟一小段时间后重新检测当前正在播放的媒体资源
    setTimeout(() => {
      log('Re-checking current media elements after clear')
      checkMediaElements()
    }, 100)
  })

  // 延迟加载配置
  setTimeout(() => {
    // Loading config...
    loadConfig()
  }, 100)

  // 确保在页面完全加载后再次检查配置
  window.addEventListener('load', () => {
    // Page loaded, reloading config...
    loadConfig()
  })

  // Initialization complete
})()
