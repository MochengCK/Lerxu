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
    total: 0,
    timestamp: 0
  }

  let lastExplicitClearAt = 0

  const getMaxResourceTimestamp = (res) => {
    try {
      const r = res || {}
      const lists = [r.video, r.audio, r.m4s, r.combined]
      let max = 0
      lists.forEach(list => {
        if (!Array.isArray(list)) return
        list.forEach(item => {
          const ts = Number(item && item.timestamp ? item.timestamp : 0)
          if (ts > max) max = ts
        })
      })
      return max
    } catch (e) {
      return 0
    }
  }

  const shouldIgnoreResourcesUpdateAfterClear = (res) => {
    try {
      if (!lastExplicitClearAt) return false
      const total = countAllResources(res)
      if (!total) return false
      const maxTs = getMaxResourceTimestamp(res)
      return !!(maxTs && maxTs < lastExplicitClearAt)
    } catch (e) {
      return false
    }
  }

  const broadcastClearResourcesToFrames = () => {
    try {
      const msg = { type: 'lerxu-clear-resources', at: Date.now() }
      try {
        const iframes = document.querySelectorAll('iframe')
        iframes.forEach(iframe => {
          try {
            const w = iframe && iframe.contentWindow
            if (w && w.postMessage) w.postMessage(msg, '*')
          } catch (e) {}
        })
      } catch (e) {}

      try {
        if (window.top && window.top !== window && window.top.postMessage) {
          window.top.postMessage(msg, '*')
        }
      } catch (e) {}
    } catch (e) {}
  }

  const countAllResources = (res) => {
    try {
      const r = res || {}
      const combined = Array.isArray(r.combined) ? r.combined.length : 0
      const m4s = Array.isArray(r.m4s) ? r.m4s.length : 0
      const video = Array.isArray(r.video) ? r.video.length : 0
      const audio = Array.isArray(r.audio) ? r.audio.length : 0
      return combined + m4s + video + audio
    } catch (e) {
      return 0
    }
  }

  // 备份当前资源
  const backupResources = () => {
    const total = countAllResources(sniffedResources)
    if (total > 0) {
      resourcesBackup = {
        video: [...sniffedResources.video],
        audio: [...sniffedResources.audio],
        m4s: [...(sniffedResources.m4s || [])],
        combined: [...sniffedResources.combined],
        total,
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
    const currentTotal = countAllResources(sniffedResources)
    const backupTotal = Number(resourcesBackup.total || 0) || countAllResources(resourcesBackup)
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
      sniffedResources.total = countAllResources(sniffedResources)
      updateButtonVisibility()
      updateMainButtonResourceCount()
      return true
    }
    
    // 检查是否只有部分资源丢失（比如只有单独资源消失但组合资源还在）
    const currentCombined = sniffedResources.combined?.length || 0
    const currentM4s = sniffedResources.m4s?.length || 0
    const currentVideoAudioM4s = (sniffedResources.video?.length || 0) + (sniffedResources.audio?.length || 0) + currentM4s
    const backupVideoAudioM4s = resourcesBackup.video.length + resourcesBackup.audio.length + (resourcesBackup.m4s?.length || 0)
    
    if ((currentCombined > 0 || currentM4s > 0) && currentVideoAudioM4s === 0 && backupVideoAudioM4s > 0 && timeSinceBackup < 30000) {
      log('Restoring individual resources while keeping combined:', {
        restoring_video: resourcesBackup.video.length,
        restoring_audio: resourcesBackup.audio.length,
        restoring_m4s: resourcesBackup.m4s.length,
        keeping_combined: currentCombined,
        keeping_m4s: currentM4s
      })
      sniffedResources.video = [...resourcesBackup.video]
      sniffedResources.audio = [...resourcesBackup.audio]
      if (currentM4s === 0) {
        sniffedResources.m4s = [...resourcesBackup.m4s]
      }
      sniffedResources.total = countAllResources(sniffedResources)
      updateButtonVisibility()
      updateMainButtonResourceCount()
      return true
    }
    
    return false
  }

  /**
   * 一条资源是不是「M4S 分片」。
   *
   * 分片在列表里归到「DASH 分离流」那一段，就不再重复出现在视频/音频段。
   * 计数和渲染必须共用这一个判定，否则数字与列表必然对不上（用户点名）。
   */
  const isM4sEntry = (resource) => {
    try {
      return !!(resource && typeof resource.url === 'string' && resource.url.includes('.m4s'))
    } catch (e) {
      return false
    }
  }

  /**
   * 一条资源是不是 **HLS 清单**（`.m3u8`，也就是 `#EXTM3U` 那种索引文件）。
   *
   * 清单不是媒体文件，但它**就是"一个完整视频"**：把这一条交给下载器，
   * 引擎自己会拉清单里的全部分片并拼成单个文件。所以它必须独立成一栏、
   * 排在所有资源最前面 —— 混在几十条分片里，用户根本不知道该点哪一条
   * （用户点名：嗅探到 m3u8 + ts 时"分不清该点哪个"）。
   *
   * 判定先看扩展名（嗅探结果有时拿不到正确扩展名），再看地址本身。
   */
  const isHlsManifestEntry = (resource) => {
    try {
      if (!resource || typeof resource.url !== 'string') return false
      if (`${resource.ext || ''}`.toLowerCase() === 'm3u8') return true
      return /\.m3u8(?:[?#]|$)/i.test(resource.url)
    } catch (e) {
      return false
    }
  }

  /**
   * 一条资源是不是 HLS 的 **TS 分片**。
   *
   * 分片单独下出来只有几秒钟的画面，没有任何意义。但**只有页面上确实
   * 存在清单时**才把它折进「HLS 分片」组 —— 孤立的一条 `.ts` 可能真是
   * 整段视频（老式站点直接给 .ts 文件），不能一律当分片藏起来。
   */
  const isTsSegmentEntry = (resource) => {
    try {
      if (!resource || typeof resource.url !== 'string') return false
      if (`${resource.ext || ''}`.toLowerCase() === 'ts') return true
      return /\.(ts|m2ts|mts)(?:[?#]|$)/i.test(resource.url)
    } catch (e) {
      return false
    }
  }

  /**
   * 把一批资源切成**真正会显示出来的各组条目**。
   *
   * 返回 `{ manifest, segments, combined, m4s, video, audio }`：
   *   - `manifest`：HLS 清单（m3u8）——**一条就是一个完整视频**，排最前面；
   *   - `segments`：清单的分片（.ts）——默认收起的一组，不占版面；
   *   - 其余四组沿用老口径（合并条目 / DASH 分离流 / 视频 / 音频）。
   *
   * 这是「按钮上的数量」与「下拉框里的条目」唯一的共同来源：两处都从这里取，
   * 切分规则只有一份，就不可能再对不上（用户点名）。
   *
   * 顺带把缺 url 的脏数据挡在渲染之外 —— 老代码在渲染循环里直接取
   * `resource.url.includes(...)`，一条脏数据就抛异常让整段渲染中断，
   * 列表少几条而按钮数字照旧，正是「数量不一样」的另一个来源。
   */
  /** 比较 URL 是否指向同一条资源（忽略查询串）。 */
  const urlKeyForDedup = (url) => {
    try {
      const u = new URL(url)
      return `${u.protocol}//${u.hostname}${u.pathname}`
    } catch (e) {
      return `${url || ''}`.split('?')[0]
    }
  }

  const collectDisplayItems = (resources) => {
    const r = resources || {}
    const combined = Array.isArray(r.combined) ? r.combined.filter(Boolean) : []
    const m4s = Array.isArray(r.m4s) ? r.m4s.filter(Boolean) : []
    const hasM4s = m4s.length > 0
    const keepPlain = (list) => (Array.isArray(list) ? list.filter(Boolean) : [])
      .filter(item => !(hasM4s && isM4sEntry(item)))

    // 合并条目（「完整视频」）已经覆盖了它用的那两条流：这两条不再在
    // 「分离流 / 视频资源 / 音频资源」段里重复列一遍 —— 否则同一条资源
    // 在下拉框里出现两次，看起来就是「内容重复」（用户点名）。
    const usedByCombined = new Set()
    combined.forEach(c => {
      if (!c) return
      if (c.videoUrl) usedByCombined.add(urlKeyForDedup(c.videoUrl))
      if (c.audioUrl) usedByCombined.add(urlKeyForDedup(c.audioUrl))
    })
    const dropUsed = (list) => list.filter(item => !(item && usedByCombined.has(urlKeyForDedup(item.url))))

    const video = dropUsed(keepPlain(r.video))
    const audio = dropUsed(keepPlain(r.audio))
    const m4sKept = dropUsed(m4s)

    // 清单与它的分片从普通条目里**抽出来单独成组**：
    //   清单 → 最前面一栏「HLS 完整视频」，点一下就是一个完整视频；
    //   分片 → 默认收起的「HLS 分片」组（**只有这一页真有清单时才收**）。
    // 不抽的话它们全混在「视频资源」栏里，几十条长得一模一样的 `.ts`
    // 会把真正该点的那一条埋掉（用户点名：分不清该点哪个）。
    const dedupeByUrl = (list) => {
      const seen = new Set()
      const out = []
      list.forEach(item => {
        if (!item) return
        // 清单的查询串是有意义的（?stream=a 与 ?stream=b 是两条流），按完整地址去重
        const key = `${item.url || ''}`
        if (!key || seen.has(key)) return
        seen.add(key)
        out.push(item)
      })
      return out
    }
    const plainPool = video.concat(audio, m4sKept)
    // 直播条目**单独成一栏**：它既不是"下好了的完整视频"也不是"零件"，
    // 点它是"开始录制"——混在「视频资源」里会让人以为那是一份能直接下完的
    // 文件（用户点名）。所有 live 条目（含直播清单）都归这一栏，且从
    // 其它栏里剔除，避免同一条出现两次。
    const isLiveEntry = (item) => !!(item && item.live === true)
    const live = dedupeByUrl(plainPool.filter(isLiveEntry))
    const manifest = dedupeByUrl(plainPool.filter(item => isHlsManifestEntry(item) && !isLiveEntry(item)))
    const hasManifest = manifest.length > 0
    const segments = hasManifest ? dedupeByUrl(plainPool.filter(isTsSegmentEntry)) : []
    const strip = (list) => list.filter(item =>
      !(item && (isLiveEntry(item) || isHlsManifestEntry(item) || (hasManifest && isTsSegmentEntry(item)))))

    // 「完整视频」在手时（DASH 合并条目 / HLS 清单），**不再列出**视频流与音频流：
    // 那两条本来就是被完整视频吃掉的两半，列出来只会让人在"该点哪一条"上犹豫
    // （用户点名）。判定必须放在上面切分之后 —— manifest 自己就是从
    // video/audio 池子里挑出来的，先清空会把清单也一起清掉。
    const hasCompleteVideo = combined.length > 0 || manifest.length > 0

    return {
      live,
      manifest,
      segments,
      combined,
      m4s: strip(m4sKept),
      video: hasCompleteVideo ? [] : strip(video),
      audio: hasCompleteVideo ? [] : strip(audio)
    }
  }

  /**
   * 下拉框里一共几条**看得见的条目** —— 按钮上显示的就是这个数。
   *
   * 分片那一整组只算一条：它就是列表里的一个可折叠行，而"按钮数字 =
   * 列表里看得见的条目数"这条不变式是用户点名要的。
   */
  const countDisplayItems = (items) => {
    try {
      return items.live.length + items.manifest.length + items.combined.length + items.m4s.length +
        items.video.length + items.audio.length + (items.segments.length > 0 ? 1 : 0)
    } catch (e) {
      return 0
    }
  }

  // 取数重入深度：从备份恢复的那一步本身会回头刷新 UI（进而再次取数），
  // 不挡住的话会来回套娃；恢复只允许在最外层做一次。
  let displayResolveDepth = 0

  /**
   * 当前该展示哪一批资源。
   *
   * 按钮与列表必须看到**同一批数据**，所以取数（含「资源被意外清空后从备份
   * 恢复」这一步）只在这里做一次，谁先调用都不会得出两个不同的结果（用户点名）。
   * 短视频信息流站点保持原口径：只用圈定结果，不回退到全部资源。
   */
  const resolveDisplayResources = () => {
    displayResolveDepth++
    try {
      let resources = getUniversalScopedResources().resources
      if (displayResolveDepth === 1 &&
          !hasAnySniffedResources(resources) && checkAndRestoreResources()) {
        resources = getUniversalScopedResources().resources
      }
      if (isShortVideoFeedHost()) return resources
      return hasAnySniffedResources(resources) ? resources : sniffedResources
    } catch (e) {
      return sniffedResources
    } finally {
      displayResolveDepth--
    }
  }

  /** 下拉框正开着就跟着新资源一起刷新，否则按钮数字涨了列表还是旧的（用户点名）。 */
  const refreshOpenDropdown = () => {
    try {
      const dropdown = document.getElementById('lerxu-resource-dropdown')
      if (!dropdown || dropdown.style.display !== 'flex') return
      updateResourceList()
      adjustDropdownPosition(dropdown)
    } catch (e) {}
  }

  const updateMainButtonResourceCount = () => {
    try {
      const btn = document.getElementById('lerxu-bilibili-download-btn')
      if (!btn) return
      const countSpan = btn.querySelector('.lerxu-resource-count')
      if (!countSpan) return

      // 与下拉框同源同算法：这个数就是列表里能看到几条
      const total = countDisplayItems(collectDisplayItems(resolveDisplayResources()))
      countSpan.textContent = `${total} 个资源`
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
  document.addEventListener('lerxu-resources-updated', (event) => {
    log('Resources updated:', event.detail)
    const next = event.detail || { video: [], audio: [], m4s: [], combined: [], total: 0 }
    if (shouldIgnoreResourcesUpdateAfterClear(next)) {
      log('Ignoring stale resources update after clear')
      return
    }
    sniffedResources = next
    sniffedResources.total = countAllResources(sniffedResources)
    log('Total resources:', sniffedResources.total)
    
    // 备份资源
    backupResources()
    updateMainButtonResourceCount()
    
    // 按钮显隐统一交给 updateButtonVisibility 决定（它已包含 per-video 模式判断）。
    // 旧代码在这里直接写 display=block：per-video 页面里会把本该隐藏的主按钮
    // 闪出来一帧，再被 renderPerVideoSniffButtons 藏回去（用户点名）
    dedupeUniversalButtonWrappers()
    renderPerVideoSniffButtons()
    updateButtonVisibility()
    // 下拉框开着就跟着一起刷新，保证「按钮上的数 = 列表里的条数」（用户点名）
    refreshOpenDropdown()
  })

  // 监听来自 iframe 的消息
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'lerxu-clear-resources') {
      window.dispatchEvent(new Event('lerxu-clear-resources'))
      return
    }
    if (event.data && event.data.type === 'lerxu-resources-updated') {
      log('Received message from iframe:', event.data.data)
      const next = event.data.data || { video: [], audio: [], m4s: [], combined: [], total: 0 }
      if (shouldIgnoreResourcesUpdateAfterClear(next)) {
        log('Ignoring stale iframe resources update after clear')
        return
      }
      sniffedResources = next
      sniffedResources.total = countAllResources(sniffedResources)
      log('Total resources from iframe:', sniffedResources.total)
      
      // 备份资源
      backupResources()
      updateMainButtonResourceCount()
      
      // 按钮显隐同样统一交给 updateButtonVisibility（见上方说明）
      dedupeUniversalButtonWrappers()
      renderPerVideoSniffButtons()
      updateButtonVisibility()
      refreshOpenDropdown()
    }
  })

  // 监听清除资源事件
  window.addEventListener('lerxu-clear-resources', () => {
    log('Clearing resources')
    lastExplicitClearAt = Date.now()
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
      total: 0,
      timestamp: 0
    }
    log('Resources and backup cleared, was:', beforeCount, 'now: 0')
    
    // 关闭下拉框
    const dropdown = document.getElementById('lerxu-resource-dropdown')
    hideResourceDropdownAnimated(dropdown)
    
    // 资源被清除后强制隐藏按钮（无视拖拽/固定状态）
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
        window.dispatchEvent(new Event('lerxu-clear-resources'))
        setTimeout(() => {
          window.dispatchEvent(new Event('lerxu-get-resources'))
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

  // 构造发给下载器的请求头。注意：绝不能附带 Origin ——
  // 浏览器对跨域 GET 请求不会发送 Origin，伪造 Origin（与目标 Host
  // 不同源）是 CDN/WAF 判定伪造请求的典型特征，会导致 403。
  const buildDownloadHeaders = () => {
    const headers = []
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
    return headers
  }

  /**
   * 一条流（视频流 / 音频流）在一对音视频里的角色。
   * 应用端靠它决定"哪个文件当画面、哪个当声音"，不再靠扩展名去猜。
   */
  const PAIR_ROLE_VIDEO = 'video'
  const PAIR_ROLE_AUDIO = 'audio'

  /** 生成一对音视频的配对 ID（两条消息共用同一个，应用据此配对）。 */
  const makePairId = () => {
    try {
      const rand = Math.random().toString(36).slice(2, 10)
      return `lx${Date.now().toString(36)}${rand}`
    } catch (e) {
      return `lx${Date.now()}`
    }
  }

  /**
   * 清单类地址（HLS/DASH）的**产物**扩展名。
   *
   * `.m3u8` / `.mpd` 是清单文本，不是媒体文件：应用端（引擎）会按清单顺序
   * 把分片拉下来拼成一个真实媒体文件。把建议文件名写成 `.m3u8` 会让用户在
   * 新建任务对话框里看到一个与实际产物不符的名字（引擎虽然会在落盘时纠正
   * 扩展名，但对话框里的预览就是错的）。
   *
   * HLS 绝大多数是 MPEG-TS，按 `.ts` 建议；fMP4（`#EXT-X-MAP`）的清单由
   * 引擎在下载时自行改成 `.mp4`。DASH 的 `.mpd` 同理按 `.mp4`。
   */
  const MANIFEST_OUT_EXT = { m3u8: 'ts', mpd: 'mp4' }
  const outputExtFor = (ext) => {
    const e = `${ext || ''}`.toLowerCase()
    return MANIFEST_OUT_EXT[e] || e
  }

  /** 地址是否为清单（不是可直接下载的媒体文件）。 */
  const MANIFEST_URL_RE = /\.(m3u8|mpd)(?:[?#]|$)/i
  const isManifestUrl = (url) => MANIFEST_URL_RE.test(`${url || ''}`)

  /**
   * 一对音视频的文件名。
   *
   * **必须只有这一处**：视频流与音频流的名字只差结尾那一个词，应用端据此
   * 归并出同一个 stem。以前两个分支各写一套（一套 `_video/_audio`，一套本地化的
   * `_视频流/_音频流`），同一对流的 stem 就可能不一致，配不上对（用户点名）。
   */
  const streamPairFilenames = (base, seq) => {
    const b = safeFilenamePart(base || '') || 'video'
    const s = (typeof seq === 'number' && seq > 0) ? `_${seq}` : ''
    return {
      video: `${b}${s}_video.mp4`,
      audio: `${b}${s}_audio.m4a`
    }
  }

  /**
   * 每条资源的「合并产出格式」（url → mp4 / mkv / ts）。
   *
   * 只活在内存里：刷新页面就回到「跟随应用」。这是一个**单次任务**的偏好，
   * 跨会话留着只会让人下次想改时找不到是哪来的；真正要持久化的默认值
   * 在应用设置「视频 → 合并输出格式」里。
   */
  const mergeFormatByUrl = new Map()
  /**
   * 每条资源的片段区间（url → { start, end }，秒）。
   *
   * 引擎按清单 `#EXTINF` 的累计时间裁分片（粒度是整个分片），所以只有
   * **HLS 清单**能真正按片段下；普通 mp4 没有帧级裁切能力，不摆这个控件
   * （摆了就是"能拖但不生效"）。同样只活在本页内存里。
   */
  const clipByUrl = new Map()
  const clipOf = (url) => clipByUrl.get(`${url || ''}`) || null
  /** 可选的合并容器；'' 这一项表示跟随应用。webm 不列（H.264+AAC 装不进 WebM） */
  const MERGE_FORMAT_VALUES = ['', 'mp4', 'mkv', 'ts']
  const mergeFormatOf = (url) => mergeFormatByUrl.get(`${url || ''}`) || ''

  /**
   * 把一对音视频发给下载器。
   *
   * 两条消息带**同一个 pairId** 与各自的角色，应用端因此不需要靠"文件名像不像"
   * 去猜配对，也不会把不相干的视频误配成一对（用户点名）。
   */
  const sendStreamPair = (videoUrl, audioUrl, referer, base, seq) => {
    try {
      if (!videoUrl || !audioUrl) return false
      // 整对去重：同一对（同样的画面 + 同样的声音）短时间内只发一次。
      // 必须在这一层去重 —— 只拦单条会把一对拆成一半，应用端会一直
      // 等一个永远不来的伙伴（用户点名）
      if (!markSent(`${videoUrl}|${audioUrl}`)) return false
      // 防御：清单（HLS/DASH）自带音视频，根本不是"分离的视频流"。配对由
      // video-sniffer 侧拦掉（见 NON_PAIRABLE_EXTS），这里再兜一层——旧版
      // 或历史数据把清单配进来时，降级成单条，绝不发成一对。
      if (isManifestUrl(videoUrl)) {
        const b = safeFilenamePart(base || '') || 'video'
        const s = (typeof seq === 'number' && seq > 0) ? `_${seq}` : ''
        sendResourceToClient(videoUrl, referer, `${b}${s}.${outputExtFor('m3u8')}`)
        return true
      }
      const names = streamPairFilenames(base, seq)
      const pairId = makePairId()
      sendResourceToClient(videoUrl, referer, names.video, { id: pairId, role: PAIR_ROLE_VIDEO })
      sendResourceToClient(audioUrl, referer, names.audio, { id: pairId, role: PAIR_ROLE_AUDIO })
      return true
    } catch (e) {
      return false
    }
  }

  const sendPageToClient = () => {
    try {
      const url = window.location.href || ''
      if (!url || !/^https?:/i.test(url)) return
      const referer = url
      chrome.runtime.sendMessage({ type: 'addUriFromContent', url, referer, headers: buildDownloadHeaders() }, () => { })
    } catch (e) {
    }
  }

  /**
   * 近期已发送过的资源（key → 时间戳）。
   *
   * 同一份资源被发两次会变成两个任务、下载两份文件，还会把合并配对搅乱
   * （重名会被应用追加 " (1)"）。以前只有 background 里"并发在途"那一层去重，
   * 两次点击 / "下载全部"这类**先后发生**的重复拦不住（用户点名）。
   */
  const recentSentKeys = new Map()
  // 只拦"手一抖点两下"这类重复：窗口太长会挡住用户删除任务后立刻重下的正常操作
  const RECENT_SENT_TTL = 5000

  const markSent = (key) => {
    try {
      const now = Date.now()
      recentSentKeys.forEach((ts, k) => {
        if (now - ts > RECENT_SENT_TTL) recentSentKeys.delete(k)
      })
      if (recentSentKeys.has(key)) return false
      recentSentKeys.set(key, now)
      return true
    } catch (e) {
      return true
    }
  }

  const sendResourceToClient = (url, referer, suggestedFilename, pair) => {
    try {
      if (!url || !/^https?:/i.test(url)) return false
      // 单独发送的资源按**地址**去重，拦"手一抖点两下"；
      // 成对的流不在这里拦 —— 它们由 sendStreamPair 按"整对"去重，
      // 在这里按单条拦会把一对拆成一半（用户点名）
      if (!(pair && pair.id) && !markSent(url)) return false

      const headers = buildDownloadHeaders()
      const message = {
        type: 'addUriFromContent',
        url,
        referer,
        headers
      }
      // 配对信息走**消息字段**而不是请求头：应用只从 headers 里挑出
      // User-Agent / Cookie / Authorization，其余一律丢弃，
      // 塞进 headers 的话应用端根本收不到（用户点名要能配对）
      if (pair && pair.id) {
        message.pairId = pair.id
        message.pairRole = pair.role || ''
      }
      // 如果有建议的文件名，添加到消息中
      if (suggestedFilename) {
        message.suggestedFilename = suggestedFilename
      }
      // 这条资源自己选的合并产出格式（应用按任务落地，缺省走应用设置）
      const mergeFormat = mergeFormatOf(url)
      if (mergeFormat) {
        message.mergeFormat = mergeFormat
      }
      // 片段区间（秒）：只发有效窗口，引擎按清单累计时间挑分片
      const clip = clipOf(url)
      if (clip && Number.isFinite(clip.start) && Number.isFinite(clip.end) && clip.end > clip.start + 0.5) {
        message.clipStart = Math.round(clip.start * 10) / 10
        message.clipEnd = Math.round(clip.end * 10) / 10
      }
      chrome.runtime.sendMessage(message, () => { })
      return true
    } catch (e) {
      return false
    }
  }

  const safeFilenamePart = (input) => {
    const s = `${input || ''}`.trim()
    if (!s) return ''
    return s.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 180)
  }

  // 从页面DOM提取视频标题（优先于网页标题，用于区分不同视频资源）
  const getVideoTitle = () => {
    try {
      const titleSelectors = [
        // 抖音特定选择器
        '[data-e2e="video-desc"]',
        '[data-e2e="video-desc-h5"]',
        '[data-e2e="feed-active-video"] [data-e2e="video-desc"]',
        '[data-e2e="video_title"]',
        '[data-e2e="desc"]',
        '[data-e2e="feed-active-video"] [data-e2e="desc"]',
        '.video-info-detail .title',
        '.video-info .title',
        '.author-card .title',
        '.video-side-card .desc',
        '.slide-item.active [data-e2e="video-desc"]',
        'p[data-e2e="video-desc"]',
        'div[data-e2e="video-desc"]',
        // B站特定选择器
        'h1.video-title',
        '.video-title',
        '[data-e2e="video-title"]',
        '#viewbox_report .title',
        '.bpx-player-top-left-title',
        'h1.title',
        '.video-title-h1',
        '.video-info-title'
      ]

      // 策略1：找到当前可见/活跃的视频元素，从其容器内查找标题
      // 解决抖音等信息流中多个视频标题同时存在于DOM、querySelector取到错误视频标题的问题
      try {
        const videos = Array.from(document.querySelectorAll('video'))
        const visible = videos.filter(v => isElementVisibleInViewport(v))
        const candidates = visible.length > 0 ? visible : (videos.length === 1 ? videos : [])

        if (candidates.length > 0) {
          // 选择最近活跃的视频元素
          let activeVideo = candidates[0]
          let bestAt = -1
          candidates.forEach(v => {
            const at = getVideoLastActiveAt(v)
            if (at > bestAt) {
              bestAt = at
              activeVideo = v
            }
          })

          // 从活跃视频元素向上遍历祖先容器，在容器内查找标题
          let container = activeVideo.parentElement
          for (let depth = 0; depth < 8 && container; depth++) {
            for (const selector of titleSelectors) {
              const el = container.querySelector(selector)
              if (el && el.textContent && el.textContent.trim().length > 2) {
                return el.textContent.trim()
              }
            }
            container = container.parentElement
          }
        }
      } catch (e) {}

      // 策略2：全局查找标题（回退）
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector)
        if (el && el.textContent && el.textContent.trim().length > 2) {
          return el.textContent.trim()
        }
      }

      // 策略3：通用 - video 元素的 title 或 aria-label
      const videoEls = document.querySelectorAll('video')
      for (const video of videoEls) {
        const title = video.getAttribute('title') || video.getAttribute('aria-label') || ''
        if (title.trim().length > 2) return title.trim()
      }

      // 策略4：通用 - og:title meta 标签
      const ogTitle = document.querySelector('meta[property="og:title"]')
      if (ogTitle) {
        const content = ogTitle.getAttribute('content') || ''
        if (content.trim().length > 2) return content.trim()
      }

      // 策略5：通用 - 页面 h1
      const h1 = document.querySelector('h1')
      if (h1 && h1.textContent && h1.textContent.trim().length > 2) {
        return h1.textContent.trim()
      }
    } catch (e) {}

    // 最终回退到 document.title
    return document.title || ''
  }

  // 清理标题，移除常见后缀（在线播放、视频网站名等）
  const cleanVideoTitle = (rawTitle) => {
    if (!rawTitle) return ''
    return rawTitle
      .replace(/\s*[-_│|]\s*在线播放.*$/i, '')
      .replace(/\s*[-_│|]\s*在线观看.*$/i, '')
      .replace(/\s*[-_│|]\s*樱花动漫.*$/i, '')
      .replace(/\s*[-_│|]\s*\w+视频.*$/i, '')
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim()
  }

  let perVideoModeActive = false

  const getVideoContextIdFromElement = (video) => {
    try {
      if (!video) return ''
      return video.getAttribute('data-lerxu-video-context-id') || ''
    } catch (e) {
      return ''
    }
  }

  const getVideoLastActiveAt = (video) => {
    try {
      if (!video) return 0
      const raw = video.getAttribute('data-lerxu-video-last-active') || ''
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

  const isHostMatchDomain = (host, domain) => {
    try {
      const h = `${host || ''}`.toLowerCase().replace(/\.$/, '')
      const d = `${domain || ''}`.toLowerCase().replace(/^\.+/, '').replace(/\.$/, '')
      if (!h || !d) return false
      return h === d || h.endsWith(`.${d}`)
    } catch (e) {
      return false
    }
  }

  const isShortVideoFeedHost = () => {
    try {
      const host = (window.location && window.location.hostname ? window.location.hostname : '').toLowerCase()
      if (!host) return false
      return isHostMatchDomain(host, 'douyin.com') ||
        isHostMatchDomain(host, 'iesdouyin.com') ||
        isHostMatchDomain(host, 'tiktok.com')
    } catch (e) {
      return false
    }
  }

  // 检查URL host是否为抖音/字节跳动CDN域名
  const isDouyinCdnHost = (host) => {
    const h = `${host || ''}`.toLowerCase()
    if (!h) return false
    const domains = [
      'douyinvod.com', 'bytecdntp.com', 'bytecdn.cn',
      'ixigua.com', 'douyincdn.com', 'amemv.com',
      'snssdk.com', 'bytegoofetch.com', 'bytednsdoc.com'
    ]
    return domains.some(d => h === d || h.endsWith(`.${d}`))
  }

  const collectUniversalButtonWrappers = () => {
    try {
      const list = []
      document.querySelectorAll('#lerxu-bilibili-download-btn-wrapper').forEach(el => list.push(el))
      document.querySelectorAll('#lerxu-download-btn-wrapper').forEach(el => list.push(el))
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
        // 优先选择正在播放的视频元素，避免选中预加载（暂停）的下一个视频
        const playing = list.filter(v => {
          try { return !v.paused && !v.ended } catch (e) { return false }
        })
        const candidates = playing.length > 0 ? playing : list
        let best = null
        let bestAt = -1
        candidates.forEach(v => {
          const at = getVideoLastActiveAt(v)
          if (at > bestAt) {
            bestAt = at
            best = v
          }
        })
        const chosen = best || candidates[0]
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

      // contextId 过滤为空时回退到全部资源（抖音 blob URL 导致 contextId 分配不可靠）
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
      const list = document.querySelectorAll('.lerxu-video-sniff-btn-wrapper')
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
      const base = safeFilenamePart(getVideoTitle() || 'video')
      const seq = typeof index === 'number' ? index + 1 : 1
      const activeAt = getVideoLastActiveAt(video) || Date.now()
      const preferredHost = getHostFromUrl((video && (video.currentSrc || video.src)) ? (video.currentSrc || video.src) : '')

      const combinedPool = filterContextResources(sniffedResources.combined || [], contextId, activeAt, preferredHost)
      const bestCombined = pickNearest(combinedPool, activeAt) || pickBestCombined(combinedPool)
      if (bestCombined && bestCombined.videoUrl && bestCombined.audioUrl) {
        // 成对发送：两条流带同一个 pairId，应用端据此合并（不再靠文件名猜）
        sendStreamPair(bestCombined.videoUrl, bestCombined.audioUrl, referer, base, seq)
        return true
      }

      const videoPool = filterContextResources(sniffedResources.video || [], contextId, activeAt, preferredHost)
      // 清单优先：per-video 按钮点的是"这个视频"，而 HLS 页面上"这个视频"
      // 就是清单那一条。分片按"离播放时刻最近"排序经常排在最前，点下去只
      // 下到几秒钟的画面 —— 用户看到的正是"点了不对的那个"（用户点名）。
      const manifests = videoPool.filter(isHlsManifestEntry)
      const bestManifest = pickNearest(manifests, activeAt) || pickBestSingle(manifests)
      if (bestManifest && bestManifest.url) {
        const filename = base ? `${base}_${seq}.${outputExtFor(bestManifest.ext || 'm3u8')}` : ''
        sendResourceToClient(bestManifest.url, referer, filename)
        return true
      }

      const hasManifest = manifests.length > 0
      const nonM4s = Array.isArray(videoPool)
        ? videoPool.filter(r => r && r.url && r.ext !== 'm4s' && !(hasManifest && isTsSegmentEntry(r)))
        : []
      const bestVideo = pickNearest(nonM4s, activeAt) || pickBestSingle(nonM4s) || pickNearest(videoPool, activeAt) || pickBestSingle(videoPool)
      if (bestVideo && bestVideo.url) {
        const ext = bestVideo.ext ? `${bestVideo.ext}`.toLowerCase() : 'mp4'
        // 清单（m3u8）不是媒体文件：产物扩展名按实际容器给（HLS → ts）
        const filename = base ? `${base}_${seq}.${outputExtFor(ext)}` : ''
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

      const wrapperId = `lerxu-video-sniff-btn-wrapper-${contextId}`
      const existing = document.getElementById(wrapperId)
      if (existing) {
        // 视频元素可能被站点重建，始终引用最新的 video 节点
        existing._lerxuVideo = video
        return true
      }

      // 不向视频容器插入任何节点、不修改容器样式：
      // 播放器容器（React/Vue 管理、依赖 :nth-child 布局）被注入外来
      // 节点或改动 position 后可能导致视频层错位/黑屏。按钮统一挂到
      // body，用 fixed 定位跟随视频可视区域。
      const wrapper = document.createElement('div')
      wrapper.id = wrapperId
      wrapper.className = 'lerxu-video-sniff-btn-wrapper'
      wrapper._lerxuVideo = video
      const wStyle = wrapper.style
      wStyle.position = 'fixed'
      wStyle.top = '0px'
      wStyle.left = '0px'
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
      bStyle.display = 'flex'
      bStyle.alignItems = 'center'
      bStyle.justifyContent = 'center'
      bStyle.opacity = '0.95'
      
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', '20')
      svg.setAttribute('height', '20')
      svg.style.fill = 'currentColor'
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z')
      
      svg.appendChild(path)
      btn.appendChild(svg)

      const extend = document.createElement('div')
      const exStyle = extend.style
      exStyle.position = 'absolute'
      exStyle.top = '0'
      exStyle.right = '0'
      exStyle.height = '32px'
      exStyle.width = '32px'
      exStyle.background = '#1a7fe0'
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
      document.body.appendChild(wrapper)
      syncPerVideoButtonPosition(wrapper)
      return true
    } catch (e) {
      return false
    }
  }

  // 将 fixed 定位的按钮同步到视频可视区域的右上角。
  // 视频不可见、被移除或尺寸过小时隐藏按钮，避免遮挡页面。
  const syncPerVideoButtonPosition = (wrapper) => {
    try {
      const video = wrapper && wrapper._lerxuVideo
      if (!wrapper || !video) return
      if (!video.isConnected || !document.contains(wrapper)) {
        wrapper.style.display = 'none'
        return
      }
      const rect = video.getBoundingClientRect()
      const visible = rect.width >= 120 && rect.height >= 70 &&
        rect.bottom > 0 && rect.top < window.innerHeight &&
        rect.right > 0 && rect.left < window.innerWidth
      if (!visible) {
        wrapper.style.display = 'none'
        return
      }
      wrapper.style.display = 'block'
      // 停在视口内，避免被裁剪
      const top = Math.min(Math.max(8, rect.top + 8), Math.max(8, window.innerHeight - 40))
      const left = Math.min(Math.max(8, rect.right - 40), Math.max(8, window.innerWidth - 40))
      wrapper.style.top = `${top}px`
      wrapper.style.left = `${left}px`
    } catch (e) {}
  }

  // 轻量位置同步循环：页面滚动/布局变化时让按钮跟随视频。
  // 没有按钮时几乎零开销（一次 querySelectorAll）。
  setInterval(() => {
    try {
      const wrappers = document.querySelectorAll('.lerxu-video-sniff-btn-wrapper')
      if (!wrappers || wrappers.length === 0) return
      wrappers.forEach(syncPerVideoButtonPosition)
    } catch (e) {}
  }, 300)

  // 高频维护视频"最近可见"的记忆值，供 per-video 模式判定使用。
  // 判定（renderPerVideoSniffButtons）是事件驱动的低频调用，如果只在判定时
  // 采样可见性，采样相位与滚动 / 懒加载的节奏错开时会把仍在视口内的视频误判成
  // "已离开"，模式跟着来回切，主按钮就一闪一闪（用户点名）。
  setInterval(() => {
    try {
      const nowTs = Date.now()
      document.querySelectorAll('video').forEach(v => {
        if (isElementVisibleInViewport(v)) v._lerxuEligibleAt = nowTs
      })
    } catch (e) {}
  }, 300)

  // per-video 模式判定参数：
  // - ELIGIBLE_TTL：视频"算数"的可见性记忆窗口，抹平滚动/懒加载造成的瞬时抖动
  // - SWITCH_DELAY：候选模式连续稳定多久才真正切换
  const PER_VIDEO_ELIGIBLE_TTL = 5000
  const PER_VIDEO_SWITCH_DELAY = 700
  let pendingPerVideoMode = null
  let pendingPerVideoModeSince = 0
  let perVideoModeSwitchTimer = null

  const renderPerVideoSniffButtons = () => {
    try {
      if (!videoSnifferConfig.loaded || !videoSnifferConfig.enabled) {
        perVideoModeActive = false
        removePerVideoButtons()
        return
      }

      const videos = Array.from(document.querySelectorAll('video'))
      const nowTs = Date.now()
      const eligibleVideos = videos.filter(v => {
        try {
          // 可见性用「最近 PER_VIDEO_ELIGIBLE_TTL 内可见过」的记忆值，而不是瞬时值。
          // 滚动、懒加载、悬停预览会让瞬时可见性在 1↔2 的边界反复横跳，模式判定
          // 跟着跳 -> 主按钮周期性显隐（用户看到按钮一直闪、点不中）。记忆值让
          // 模式判定稳定；小按钮自身的位置/显隐仍由 syncPerVideoButtonPosition
          // 按瞬时可见性即时处理，不会因此残留。
          if (isElementVisibleInViewport(v)) {
            v._lerxuEligibleAt = nowTs
          } else if (!v._lerxuEligibleAt) {
            return false
          }
          if (nowTs - (v._lerxuEligibleAt || 0) > PER_VIDEO_ELIGIBLE_TTL) return false

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

      // 模式切换加迟滞。
      // 「可见的大视频数量」在滚动 / 懒加载 / 悬停预览出现消失时会在 1↔2 的
      // 边界上抖动，而这个函数又被 scroll / 资源更新高频调用 —— 立即切换会让
      // 主按钮刚显示又被藏起来，用户看到的就是按钮一直闪烁、点不到。
      // 候选状态必须连续稳定 PER_VIDEO_SWITCH_DELAY 才真正切换。
      const now = Date.now()
      if (shouldUsePerVideoMode === perVideoModeActive) {
        pendingPerVideoMode = null
        if (perVideoModeSwitchTimer) {
          clearTimeout(perVideoModeSwitchTimer)
          perVideoModeSwitchTimer = null
        }
      } else if (pendingPerVideoMode === shouldUsePerVideoMode) {
        if (now - pendingPerVideoModeSince >= PER_VIDEO_SWITCH_DELAY) {
          perVideoModeActive = shouldUsePerVideoMode
          pendingPerVideoMode = null
          if (perVideoModeSwitchTimer) {
            clearTimeout(perVideoModeSwitchTimer)
            perVideoModeSwitchTimer = null
          }
        }
      } else {
        pendingPerVideoMode = shouldUsePerVideoMode
        pendingPerVideoModeSince = now
        if (perVideoModeSwitchTimer) clearTimeout(perVideoModeSwitchTimer)
        // 事件可能不再来了（比如滚动停下），到点主动重算一次完成切换
        perVideoModeSwitchTimer = setTimeout(() => {
          perVideoModeSwitchTimer = null
          renderPerVideoSniffButtons()
        }, PER_VIDEO_SWITCH_DELAY + 30)
      }

      if (!perVideoModeActive) {
        removePerVideoButtons()
        // 主按钮的显隐统一由 updateButtonVisibility 决定，这里不直接写 style
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

      const existing = document.querySelectorAll('.lerxu-video-sniff-btn-wrapper')
      existing.forEach(el => {
        const id = el && el.id ? `${el.id}` : ''
        const m = id.match(/^lerxu-video-sniff-btn-wrapper-(.+)$/)
        const contextId = m && m[1] ? m[1] : ''
        if (contextId && !createdContextIds.has(contextId)) {
          el.remove()
        }
      })

      // per-video 模式下主按钮应隐藏：借统一的可见性函数完成（它会读 perVideoModeActive）
      updateButtonVisibility()
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
        'zh_TW': '清空資源列表'
      },
      'dashCompleteVideo': {
        'en': 'DASH Complete Video (Video+Audio)',
        'zh_CN': 'DASH 完整视频 (视频+音频)',
        'zh_TW': 'DASH 完整視頻 (視頻+音頻)'
      },
      'dashSeparateStreams': {
        'en': 'DASH Separate Streams',
        'zh_CN': 'DASH 单独流',
        'zh_TW': 'DASH 單獨流'
      },
      'videoResources': {
        'en': 'Video Resources',
        'zh_CN': '视频资源',
        'zh_TW': '視頻資源'
      },
      'audioResources': {
        'en': 'Audio Resources',
        'zh_CN': '音频资源',
        'zh_TW': '音頻資源'
      },
      'noVideoResourcesDetected': {
        'en': 'No video resources detected',
        'zh_CN': '未检测到视频资源',
        'zh_TW': '未檢測到視頻資源'
      },
      'rightClickTip': {
        'en': 'Tip: Right-click on links and select "Download with Lerxu"',
        'zh_CN': '提示：右键点击页面上的链接，选择"使用 Lerxu 下载"',
        'zh_TW': '提示：右鍵點擊頁面上的鏈接，選擇"使用 Lerxu 下載"'
      },
      'complete': {
        'en': 'Complete',
        'zh_CN': '完整',
        'zh_TW': '完整'
      },
      'completeVideo': {
        'en': 'Complete Video',
        'zh_CN': '完整视频',
        'zh_TW': '完整視頻'
      },
      'videoStream': {
        'en': 'Video stream',
        'zh_CN': '视频流',
        'zh_TW': '視頻流'
      },
      'audioStream': {
        'en': 'Audio stream',
        'zh_CN': '音频流',
        'zh_TW': '音頻流'
      },
      'file': {
        'en': 'file',
        'zh_CN': '文件',
        'zh_TW': '文件'
      },
      'downloadAll': {
        'en': 'Download all',
        'zh_CN': '下载全部',
        'zh_TW': '下載全部'
      },
      'hlsCompleteVideo': {
        'en': 'HLS Complete Video',
        'zh_CN': 'HLS 完整视频',
        'zh_TW': 'HLS 完整視頻'
      },
      'hlsSegments': {
        'en': 'HLS segments',
        'zh_CN': 'HLS 分片',
        'zh_TW': 'HLS 分片'
      },
      'segment': {
        'en': 'segment',
        'zh_CN': '分片',
        'zh_TW': '分片'
      },
      // 直播徽章：条目已被识别为直播流（HLS 清单无 #EXT-X-ENDLIST / FLV
      // 无总长的长连接，见 video-sniffer 的实时探测）。点它 = 让应用开始
      // **录制**这条流（而不是下载一份快照）。
      'live': {
        'en': 'LIVE',
        'zh_CN': '直播',
        'zh_TW': '直播'
      },
      // 直播栏的栏名：直播条目单独成栏（点一下就是开始录制）
      'liveStreams': {
        'en': 'Live streams',
        'zh_CN': '直播',
        'zh_TW': '直播'
      },
      // 每条资源右侧的「输出格式」：这条任务传到应用、下载完成之后合并/换封装
      // 用的容器。空值 = 跟随应用「视频 → 合并输出格式」那一项。
      'outputFormat': {
        'en': 'Output format',
        'zh_CN': '输出格式',
        'zh_TW': '輸出格式'
      },
      'formatFollowApp': {
        'en': 'App default',
        'zh_CN': '跟随应用',
        'zh_TW': '跟隨應用'
      },
      'clipRange': {
        'en': 'Clip',
        'zh_CN': '片段',
        'zh_TW': '片段'
      },
      'downloadOne': {
        'en': 'Download',
        'zh_CN': '下载',
        'zh_TW': '下載'
      },
      // 空态：弹窗打开时还没嗅探到任何资源
      'noResources': {
        'en': 'No media found yet',
        'zh_CN': '暂未发现媒体资源',
        'zh_TW': '暫未發現媒體資源'
      },
      'noResourcesHint': {
        'en': 'Play the video on the page and resources will show up here',
        'zh_CN': '在页面上播放视频后会自动出现',
        'zh_TW': '在頁面上播放影片後會自動出現'
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

  // === 外观：与桌面端同一套设计令牌（src/renderer/components/Theme/Tokens.scss）
  // + 明暗主题跟随应用 ===
  //
  // 桌面端 Tokens.scss 是配色的唯一来源，这里取同一组值（改色只改那边）。
  // 主题来自 storage.uiTheme（background 从应用同步后写入，变更时发
  // themeChanged）；拿不到就跟随系统 prefers-color-scheme。
  // 令牌挂在 `.lx-scope`（按钮 + 弹窗的最外层容器）上，深色时加 `lx-dark`。
  const LX_STYLE_ID = 'lerxu-ui-style'
  const ensureLxStyles = () => {
    try {
      if (document.getElementById(LX_STYLE_ID)) return
      const style = document.createElement('style')
      style.id = LX_STYLE_ID
      style.textContent = `
/* 令牌（浅色，取桌面端 Tokens.scss 同值） */
.lx-scope {
  --lx-primary: #1a7fe0;
  --lx-primary-weak: rgba(26, 127, 224, 0.08);
  --lx-danger: #f56c6c;
  --lx-danger-weak: rgba(245, 108, 108, 0.1);
  --lx-success: #67c23a;
  --lx-success-weak: rgba(103, 194, 58, 0.12);
  --lx-text-1: #2c3e50;
  --lx-text-2: #5a6c7d;
  --lx-text-3: #8492a6;
  --lx-bg-panel: #ffffff;
  --lx-bg-head: #f7f9fc;
  --lx-bg-hover: #f0f4f8;
  --lx-border: rgba(26, 35, 50, 0.08);
  --lx-border-strong: #e2e8f0;
  --lx-shadow: 0 10px 28px rgba(26, 35, 50, 0.14);
  /* 小尺寸浮层（嗅探按钮）用的轻阴影：弹窗那种大阴影压在 24px 高的条上会显脏 */
  --lx-shadow-sm: 0 2px 8px rgba(26, 35, 50, 0.16);
  --lx-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", Helvetica, Arial, sans-serif;
}
.lx-scope.lx-dark {
  --lx-primary: #4a9eff;
  --lx-primary-weak: rgba(74, 158, 255, 0.18);
  --lx-danger-weak: rgba(245, 108, 108, 0.18);
  --lx-text-1: #dfe3e8;
  --lx-text-2: #8b95a3;
  --lx-text-3: #6b7280;
  --lx-bg-panel: #262a31;
  --lx-bg-head: #2e333b;
  --lx-bg-hover: #363b44;
  --lx-border: rgba(255, 255, 255, 0.08);
  --lx-border-strong: #3d424d;
  --lx-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
  --lx-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.45);
}

/* 弹窗本体：一整张卡片（工具栏 + 列表同卡，圆角裁切） */
#lerxu-resource-dropdown {
  width: 350px;
  box-sizing: border-box;
  font-family: var(--lx-font);
  font-variant-numeric: tabular-nums;
  color: var(--lx-text-1);
  background: var(--lx-bg-panel);
  border: 1px solid var(--lx-border-strong);
  /* 圆角与应用的小控件统一到 6px（原来是 12，跟里面 6px 的按钮不搭） */
  border-radius: 6px;
  box-shadow: var(--lx-shadow);
  overflow: hidden;
  /* 出入场动画由 JS 写内联 transition（见 playPopupEnter/Leave）：
     这里只兜底 transform-origin，避免过渡结束后残留偏移 */
  transform-origin: top center;
}
@keyframes lx-drop-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

/* 顶部工具栏 */
#lerxu-dropdown-header {
  /* 与下方列表同底：工具栏不是另一块面板，只是列表上方的一行操作 */
  background: var(--lx-bg-panel);
}
#lerxu-dropdown-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  box-sizing: border-box;
}
/* 两个按钮各占左右一半 */
#lerxu-dropdown-controls .lx-btn {
  flex: 1 1 0;
  min-width: 0;
}
/* 分隔线：不再通到卡片两边，左右各留 12px */
#lerxu-dropdown-header::after {
  content: "";
  display: block;
  height: 1px;
  margin: 0 12px;
  background: var(--lx-border-strong);
}
.lx-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
#lerxu-clear-resources-btn {
  color: var(--lx-text-2);
  border: 1px solid var(--lx-border-strong);
  background: var(--lx-bg-panel);
}
#lerxu-clear-resources-btn:hover {
  color: var(--lx-danger);
  border-color: var(--lx-danger);
  background: var(--lx-danger-weak);
}
#lerxu-download-all-btn {
  color: #fff;
  background: var(--lx-primary);
  border: 1px solid transparent;
}
#lerxu-download-all-btn:hover { filter: brightness(1.08); }

/* 列表 */
#lerxu-resource-list {
  max-height: 420px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  /* 新资源进来时列表会长高：给 height 一个过渡，JS 侧负责量前后高度（见 animateListHeight） */
  transition: height 0.2s ease;
}
#lerxu-resource-list::-webkit-scrollbar { width: 6px; }
#lerxu-resource-list::-webkit-scrollbar-track { background: transparent; }
#lerxu-resource-list::-webkit-scrollbar-thumb {
  background: rgba(132, 146, 166, 0.35);
  border-radius: 3px;
}
#lerxu-resource-list::-webkit-scrollbar-thumb:hover { background: rgba(132, 146, 166, 0.55); }

/* 区块标题（滚动时留在顶部） */
.lx-section-title {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--lx-text-2);
  background: var(--lx-bg-panel);
}
.lx-section-count { font-weight: 400; font-size: 11px; color: var(--lx-text-3); }
.lx-section-live .lx-section-title { color: var(--lx-danger); }
.lx-section-hls .lx-section-title { color: var(--lx-primary); }

/* 条目 */
.lx-item {
  padding: 8px 12px;
  cursor: default;
  border-bottom: 1px solid var(--lx-border);
  transition: background-color 0.15s ease;
}
.lx-item:last-child { border-bottom: none; }
/* 条目本身不再是按钮（下载靠右侧按钮），悬停也就不再整行高亮 */
.lx-item-top { display: flex; align-items: center; gap: 6px; min-width: 0; }
/* 第二行：徽章 + 大小。名字独占第一行，不再被三四个标签挤成省略号 */
.lx-item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  min-width: 0;
  max-height: 24px;
  overflow: hidden;
  /* 设置展开时第二行要收起来：走高度塌陷而不是直接消失，否则条目会先矮一行、
     面板再展开，两段变化叠在一起看着就是"跳一下" */
  transition: max-height 0.18s ease, margin-top 0.18s ease, opacity 0.18s ease;
}
.lx-item-meta.is-collapsed {
  max-height: 0;
  margin-top: 0;
  opacity: 0;
}
.lx-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  color: var(--lx-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lx-item .lx-name.lx-name-dim { color: var(--lx-text-3); }
.lx-size { flex: 0 0 auto; font-size: 11px; color: var(--lx-text-3); }
.lx-badges { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.lx-badge {
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}
.lx-badge-live { color: #fff; background: var(--lx-danger); }
.lx-badge-quality { color: var(--lx-primary); background: var(--lx-primary-weak); }
.lx-badge-success { color: var(--lx-success); background: var(--lx-success-weak); }
.lx-badge-muted { font-weight: 500; color: var(--lx-text-3); background: var(--lx-bg-hover); }

/* 条目的「输出格式」：齿轮贴在条目最右侧，展开后是一个选择框 */
.lx-format {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
}
/* 图标按钮（齿轮 / 下载）：图标默认就是正常文字色、100% 不透明；
   hover 只浮出背景，图标本身不变色 —— "图标高亮"看着像换了个图标 */
.lx-gear,
.lx-item-download {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--lx-text-1);
  opacity: 1;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.lx-gear:hover,
.lx-item-download:hover { background: var(--lx-bg-hover); }
.lx-format-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* 收起态：高度 0 + 透明。max-height 可过渡，height:auto 不行 */
  max-height: 0;
  margin-top: 0;
  /* 左右对称留 2px：右边这 2px 是给滑块把手的阴影，缺了就会贴着裁切边 */
  padding: 0 2px;
  overflow: hidden;
  opacity: 0;
  transition: max-height 0.18s ease, opacity 0.18s ease, margin-top 0.18s ease;
}
.lx-format-panel.is-open {
  max-height: 150px;
  margin-top: 6px;
  opacity: 1;
}
/* 选项区与设置内容区之间的分隔线：左右各留一点空，不顶到条目边 */
.lx-format-divider {
  display: block;
  flex: 0 0 auto;
  height: 1px;
  margin: 0 4px 0 2px;
  background: var(--lx-border-strong);
}
/* 一行设置：左标题 + 右控件（对齐应用设置页的行） */
.lx-format-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.lx-format-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--lx-text-2);
}
.lx-format-field {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
}
/* 自绘选择框：与应用的小尺寸下拉同款（描边、6px 圆角、面板底） */
.lx-format-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 24px;
  min-width: 104px;
  padding: 0 22px 0 8px;
  border-radius: 6px;
  border: 1px solid var(--lx-border-strong);
  background: var(--lx-bg-panel);
  color: var(--lx-text-1);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.lx-format-trigger:hover { border-color: var(--lx-text-3); }
.lx-format-trigger.is-open { border-color: var(--lx-primary); }
.lx-format-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 自绘箭头（SVG 描边）：translateY(-50%) 正好是 11px 盒子的一半，几何居中 */
.lx-format-caret {
  position: absolute;
  right: 7px;
  top: 50%;
  display: block;
  color: var(--lx-text-3);
  transform: translateY(-50%);
  pointer-events: none;
  transition: transform 0.15s ease;
}
.lx-format-trigger.is-open .lx-format-caret {
  transform: translateY(-50%) rotate(180deg);
}
/* 片段区间：双滑块（左=起点，右=终点）
   ⚠️ 设置面板为了做高度动画带 overflow:hidden，而把手（12px 宽）是骑在轨道
   两端上的：滑动区左右各留的空白必须 ≥ 半个把手 + 阴影，否则 100% 处的那个
   把手会被切掉右侧（用户报的形态）。这里留 10px，面板再补 2px。 */
.lx-clip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* 给把手留出上下呼吸位：把手是绝对定位、骑在轨道上，面板为高度动画带
     overflow:hidden —— 内容盒刚好到滑动区底边时，把手下沿会被切掉 */
  padding-bottom: 3px;
}
.lx-clip[hidden] { display: none; }
/* 读数行：两个时间横向上跟着各自的把手走（定位在 JS 里按百分比算）。
   容器高度写死 16px，读数移动时整块不会跟着跳。*/
.lx-clip-head {
  position: relative;
  height: 16px;
  margin: 0 10px;
}
.lx-clip-time {
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(-50%);
  font-size: 11.5px;
  line-height: 16px;
  color: var(--lx-text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}
.lx-clip-slider {
  position: relative;
  height: 20px;
  margin: 0 10px;
  touch-action: none;
  cursor: pointer;
}
.lx-clip-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 4px;
  margin-top: -2px;
  border-radius: 999px;
  background: var(--lx-border-strong);
}
.lx-clip-fill {
  position: absolute;
  top: 50%;
  height: 4px;
  margin-top: -2px;
  border-radius: 999px;
  background: var(--lx-primary);
}
/* 把手：竖着的圆角夹子（比圆点更像"可拖"），中间一道浅色竖线当抓手 */
.lx-clip-thumb {
  position: absolute;
  top: 50%;
  /* border-box：18px 是**含描边**的总高。默认 content-box 会让 1.5px 描边把
     实际高度撑到 21px，margin-top:-9px 就不再是垂直居中，下沿溢出 2px 被裁 */
  box-sizing: border-box;
  width: 12px;
  height: 18px;
  margin: -9px 0 0 -6px;
  border-radius: 5px;
  background: var(--lx-bg-panel);
  border: 1.5px solid var(--lx-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  cursor: grab;
  transition: box-shadow 0.12s ease, transform 0.12s ease;
}
.lx-clip-thumb::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 8px;
  margin: -4px 0 0 -1px;
  border-radius: 1px;
  background: var(--lx-primary);
  opacity: 0.55;
}
.lx-clip-thumb:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22); }
.lx-clip-thumb:active,
.lx-clip-thumb.is-dragging {
  cursor: grabbing;
  transform: scale(1.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.26);
}

/* 展开的选项列表：挂 body 上，fixed 定位（列表是滚动容器，放里面会被裁） */
.lx-format-menu {
  position: fixed;
  z-index: 2147483000;
  min-width: 104px;
  padding: 4px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--lx-bg-panel);
  border: 1px solid var(--lx-border-strong);
  border-radius: 6px;
  box-shadow: var(--lx-shadow);
  font-family: var(--lx-font);
  /* 出入场由 JS 内联过渡驱动（与资源弹窗共用一套） */
  transform-origin: top center;
.lx-format-option {
  display: block;
  width: 100%;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--lx-text-1);
  font-family: inherit;
  font-size: 12px;
  line-height: 26px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.lx-format-option:hover { background: var(--lx-bg-hover); }
.lx-format-option.is-active { color: var(--lx-primary); background: var(--lx-primary-weak); }

/* 分片组（默认收起） */
.lx-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--lx-text-2);
  border-bottom: 1px solid var(--lx-border);
}
.lx-group-head:hover { background: var(--lx-bg-hover); }
.lx-group-head .lx-count { font-weight: 400; color: var(--lx-text-3); }
.lx-chevron { font-size: 10px; color: var(--lx-text-3); transition: transform 0.15s ease; }
.lx-chevron-open { transform: rotate(90deg); }

/* 空态 */
.lx-empty { padding: 28px 16px 30px; text-align: center; }
.lx-empty-title { font-size: 12.5px; color: var(--lx-text-2); }
.lx-empty-hint { margin-top: 6px; font-size: 11px; color: var(--lx-text-3); }
`
      ;(document.head || document.documentElement).appendChild(style)
    } catch (e) {}
  }
  ensureLxStyles()

  const normalizeLxTheme = (v) => {
    const s = v === undefined || v === null ? '' : `${v}`.toLowerCase()
    return s === 'dark' || s === 'light' ? s : null
  }
  let lxTheme = 'light'
  const applyLxTheme = (theme) => {
    try {
      const t = normalizeLxTheme(theme) || 'light'
      lxTheme = t
      const scopes = document.querySelectorAll('.lx-scope')
      for (const el of scopes) el.classList.toggle('lx-dark', t === 'dark')
    } catch (e) {}
  }
  const initLxTheme = () => {
    try {
      const fallback = () => {
        const prefersDark = window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
        applyLxTheme(prefersDark ? 'dark' : 'light')
      }
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        fallback()
        return
      }
      chrome.storage.local.get(['uiTheme'], (res) => {
        const t = normalizeLxTheme(res && res.uiTheme)
        if (t) applyLxTheme(t)
        else fallback()
      })
    } catch (e) {}
  }
  initLxTheme()

  // 主题变化（应用里切换主题 → background 存 uiTheme 并广播）
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    try {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.uiTheme) {
          applyLxTheme(changes.uiTheme.newValue)
        }
      })
    } catch (e) {}
  }

  // 监听语言变化
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'localeChanged') {
        updateLocaleCache().then(() => {
          // 语言变化后重新渲染UI（文案变了，必须重画，绕过去重）
          updateResourceList(true)
          
          // 更新按钮文本
          const btn = document.getElementById('lerxu-bilibili-download-btn')
          if (btn) {
            applyClientLocaleToButton(btn)
          }
        })
      }

      // 应用里切换了主题：弹窗跟着换（令牌挂在 .lx-scope 上）
      if (msg && msg.type === 'themeChanged') {
        applyLxTheme(msg.theme)
      }
    })
  }

  // 监听来自标签页的语言变化消息
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'localeChanged') {
        updateLocaleCache().then(() => {
          // 语言变化后重新渲染UI（文案变了，必须重画，绕过去重）
          updateResourceList(true)
          
          // 更新按钮文本
          const btn = document.getElementById('lerxu-bilibili-download-btn')
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
    dropdown.id = 'lerxu-resource-dropdown'
    // 视觉全在注入的样式表里（`#lerxu-resource-dropdown` 等选择器）；这里只留
    // 定位/显隐这类**功能**样式
    const dStyle = dropdown.style
    dStyle.position = 'fixed'  // 使用 fixed 定位，不受容器限制
    dStyle.top = '0'
    dStyle.left = '0'
    dStyle.zIndex = '999999'
    dStyle.display = 'none'
    dStyle.flexDirection = 'column'

    // 顶部固定区域（工具栏：清空 / 下载全部）
    const header = document.createElement('div')
    header.id = 'lerxu-dropdown-header'
    const hStyle = header.style
    hStyle.flexShrink = '0'
    hStyle.flexGrow = '0'

    // 内容区域
    const content = document.createElement('div')
    content.id = 'lerxu-resource-list'
    content.style.flexGrow = '1'

    dropdown.appendChild(header)
    dropdown.appendChild(content)

    return dropdown
  }

  const createDropdownControls = (viewResources, referer) => {
    const container = document.createElement('div')
    container.id = 'lerxu-dropdown-controls'

    const clearBtn = document.createElement('div')
    clearBtn.id = 'lerxu-clear-resources-btn'
    clearBtn.className = 'lx-btn'

    clearBtn.addEventListener('click', () => {
      log('Clear button clicked')
      window.dispatchEvent(new Event('lerxu-clear-resources'))
      broadcastClearResourcesToFrames()
      const dropdown = document.getElementById('lerxu-resource-dropdown')
      hideResourceDropdownAnimated(dropdown)
    })

    const clearText = document.createElement('span')
    clearText.textContent = getLocalizedText('clearResourceList')

    clearBtn.appendChild(clearText)

    const downloadAllBtn = document.createElement('div')
    downloadAllBtn.id = 'lerxu-download-all-btn'
    downloadAllBtn.className = 'lx-btn'

    downloadAllBtn.addEventListener('click', () => {
      try {
        const resources = viewResources || {}
        const live = Array.isArray(resources.live) ? resources.live : []
        const manifest = Array.isArray(resources.manifest) ? resources.manifest : []
        const combined = Array.isArray(resources.combined) ? resources.combined : []
        const m4s = Array.isArray(resources.m4s) ? resources.m4s : []
        const videos = Array.isArray(resources.video) ? resources.video : []
        const audios = Array.isArray(resources.audio) ? resources.audio : []

        // 已经发出去的地址不再发第二遍。
        // combined 的 videoUrl / audioUrl **本来就取自** video / audio / m4s 这几栏，
        // 老逻辑"成对发一遍、再逐条发一遍"，同一份资源变成两个任务、下载两份文件，
        // 还会因重名被追加 " (1)" 把合并配对搅乱（用户点名）。
        const sentUrls = new Set()

        combined.forEach(resource => {
          if (!resource) return
          const v = resource.videoUrl || ''
          const a = resource.audioUrl || ''
          if (!v || !a) return
          downloadCombinedResource(resource, referer)
          sentUrls.add(v)
          sentUrls.add(a)
        })

        const sendSingle = (resource) => {
          if (!resource || typeof resource.url !== 'string') return
          if (sentUrls.has(resource.url)) return
          sentUrls.add(resource.url)
          downloadSingleResource(resource, referer)
        }

        // 清单**先发**：HLS 页面上"一个视频"就是清单那一条，分片交给引擎按
        // 清单自己拉。绝不去遍历 segments —— 几十条 .ts 逐条发只会得到几十个
        // 几秒钟的垃圾任务，还要手删（用户点名）。
        manifest.forEach(sendSingle)

        // 直播最靠前：一条直播 = 一个"开始录制"的任务，与栏内顺序一致
        live.forEach(sendSingle)

        // m4s 先发：video / audio 两栏里往往就是同一批 m4s，靠上面的集合自然去重
        m4s.forEach(sendSingle)
        videos.forEach(sendSingle)
        audios.forEach(sendSingle)
      } catch (e) {
      }

      const dropdown = document.getElementById('lerxu-resource-dropdown')
      hideResourceDropdownAnimated(dropdown)
    })

    const downloadIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    downloadIcon.setAttribute('viewBox', '0 0 24 24')
    downloadIcon.setAttribute('width', '14')
    downloadIcon.setAttribute('height', '14')
    downloadIcon.style.fill = 'currentColor'
    downloadIcon.style.flexShrink = '0'

    const downloadIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    downloadIconPath.setAttribute('d', 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z')
    downloadIcon.appendChild(downloadIconPath)

    const downloadText = document.createElement('span')
    downloadText.textContent = getLocalizedText('downloadAll')

    downloadAllBtn.appendChild(downloadIcon)
    downloadAllBtn.appendChild(downloadText)

    container.appendChild(clearBtn)
    container.appendChild(downloadAllBtn)

    return container
  }

  // 上次渲染的内容签名：资源没变就不重建 —— 否则后台每来一批资源就把列表
  // 整个重画一次，正在列表里滚动的人会被弹回顶部。
  let lastResourceListSignature = ''

  // HLS 分片组是否展开。列表每次重画都要保留这个状态：新分片不断进来，
  // 每来一条就把用户展开的组收回去，等于点了没法看。
  let segmentsExpanded = false

  /**
   * 区块外壳：吸顶小标题（可着色）+ 右侧计数。计数与列表内容同源 ——
   * "栏里几条"一眼可见（按钮数字是全部栏的总和）。
   */
  const buildSection = (sectionClass, titleText, count) => {
    const section = document.createElement('div')
    if (sectionClass) section.className = sectionClass
    const title = document.createElement('div')
    title.className = 'lx-section-title'
    const label = document.createElement('span')
    label.textContent = titleText
    title.appendChild(label)
    if (count > 0) {
      const badge = document.createElement('span')
      badge.className = 'lx-section-count'
      badge.textContent = `${count}`
      title.appendChild(badge)
    }
    section.appendChild(title)
    return section
  }

  /**
   * 列表高度变化做成过渡，而不是"跳一下"。
   *
   * 嗅探结果是一条条进来的，列表每隔一会儿就长高/变矮；让浏览器直接重排，
   * 视觉上就是弹窗在抽搐（用户点名要"丝滑"）。做法：记住上一轮的高度，
   * 重画后量出新高度，从旧高度过渡到新高度，结束后清掉内联高度回到 auto。
   */
  const animateListHeight = (el) => {
    try {
      if (!el) return
      const prev = Number(el.getAttribute('data-lx-height') || 0)
      el.style.height = 'auto'
      const next = Math.min(el.scrollHeight || 0, 420)
      if (!next) {
        el.style.height = ''
        return
      }
      el.setAttribute('data-lx-height', `${next}`)
      if (!prev || Math.abs(next - prev) < 2) {
        el.style.height = ''
        return
      }
      el.style.height = `${prev}px`
      void el.offsetHeight // 强制重排，保证过渡从旧高度开始
      el.style.height = `${next}px`
      const done = () => {
        el.style.height = ''
        el.removeEventListener('transitionend', done)
      }
      el.addEventListener('transitionend', done)
    } catch (_) {}
  }

  // 更新资源列表
  const updateResourceList = (force) => {
    // 与按钮上的数量**同源同算法**：同一批数据、同一套切分规则，
    // 于是列表里有几条，按钮上就写几（用户点名要准确）
    const viewResources = collectDisplayItems(resolveDisplayResources())
    const totalItems = countDisplayItems(viewResources)
    log('Updating resource list, items:', totalItems)
    log('Video count:', viewResources.video.length)
    log('Audio count:', viewResources.audio.length)
    log('M4S count:', viewResources.m4s.length)
    log('Combined count:', viewResources.combined.length)
    log('Live count:', viewResources.live.length)
    
    const content = document.getElementById('lerxu-resource-list')
    if (!content) {
      log('Resource list container not found')
      return
    }

    // 内容没变就不重画（切换语言要重画，那种调用传 force）。
    // **直播状态算内容**：实时探测回来后 `resource.live` 变了，签名必须跟着变，
    // 否则徽章/分栏要等下一次资源更新才会出现（用户看不到识别结果）。
    const signature = `${totalItems}|` +
      viewResources.live.concat(viewResources.manifest, viewResources.segments,
        viewResources.combined, viewResources.m4s, viewResources.video, viewResources.audio)
        .map(item => `${(item && item.url) || ''}|${item && item.live === true ? 1 : 0}`)
        .join('\n')
    if (!force && content.children.length > 0 && signature === lastResourceListSignature) return
    lastResourceListSignature = signature

    content.innerHTML = ''

    const referer = window.location.href

    // 如果有资源，添加顶部浮动控制组件
    const header = document.getElementById('lerxu-dropdown-header')
    if (header) {
      header.innerHTML = ''
      // 一条资源都没有时不摆工具栏（没东西可清空/下载，空态自会说明）
      header.style.display = totalItems > 0 ? 'block' : 'none'
      if (totalItems > 0) {
        const controls = createDropdownControls(viewResources, referer)
        header.appendChild(controls)
      }
    }

    // 直播排在最前面：点一下就**开始录制**（不是下载一份快照）——比
    // 任何"完整视频"都该先被看到（用户点名：直播条目不能混在视频资源里）。
    if (viewResources.live.length > 0) {
      const liveSection = buildSection('lx-section-live', getLocalizedText('liveStreams'), viewResources.live.length)
      viewResources.live.forEach((resource, index) => {
        liveSection.appendChild(createResourceItem(resource, referer, index, { primary: true }))
      })
      content.appendChild(liveSection)
    }

    // HLS 清单排在最前面：一条地址 = 一个完整视频，**点这条就是下载**
    // （引擎会把全部分片拉下来拼成一个文件）。这一栏必须在分片前面 ——
    // 用户点开列表第一眼看到的就是该点的那条。
    if (viewResources.manifest.length > 0) {
      const hlsSection = buildSection('lx-section-hls', getLocalizedText('hlsCompleteVideo'), viewResources.manifest.length)
      viewResources.manifest.forEach((resource, index) => {
        hlsSection.appendChild(createResourceItem(resource, referer, index, { primary: true }))
      })
      content.appendChild(hlsSection)
    }

    // 优先显示组合的DASH视频（视频+音频）
    if (viewResources.combined.length > 0) {
      const combinedSection = buildSection('', getLocalizedText('dashCompleteVideo'), viewResources.combined.length)
      viewResources.combined.forEach((resource, index) => {
        combinedSection.appendChild(createCombinedResourceItem(resource, referer, index))
      })
      content.appendChild(combinedSection)
    }

    // 显示 M4S 资源（B站 DASH 视频）
    if (viewResources.m4s.length > 0) {
      const m4sSection = buildSection('', getLocalizedText('dashSeparateStreams'), viewResources.m4s.length)
      viewResources.m4s.forEach((resource, index) => {
        m4sSection.appendChild(createResourceItem(resource, referer, index))
      })
      content.appendChild(m4sSection)
    }

    // 显示普通视频资源
    if (viewResources.video.length > 0) {
      const videoSection = buildSection('', getLocalizedText('videoResources'), viewResources.video.length)
      // 归到「DASH 分离流」的分片在切分时已剔除，这里剩下的是纯视频流
      viewResources.video.forEach((resource, index) => {
        videoSection.appendChild(createResourceItem(resource, referer, index))
      })
      content.appendChild(videoSection)
    }

    // 显示音频资源
    if (viewResources.audio.length > 0) {
      const audioSection = buildSection('', getLocalizedText('audioResources'), viewResources.audio.length)
      // 同上：分片已归到「DASH 分离流」，这里剩下的是纯音频流
      viewResources.audio.forEach((resource, index) => {
        audioSection.appendChild(createResourceItem(resource, referer, index))
      })
      content.appendChild(audioSection)
    }

    // HLS 分片收在最后、默认收起：几十条分片把清单淹没正是用户"分不清点哪个"
    // 的直接原因。默认不展开，但一条都没删 —— 想单独取某一段的人展开就能点。
    if (viewResources.segments.length > 0) {
      content.appendChild(createSegmentGroup(viewResources.segments, referer))
    }

    if (content.children.length === 0) {
      const noData = document.createElement('div')
      noData.className = 'lx-empty'

      const tip1 = document.createElement('div')
      tip1.className = 'lx-empty-title'
      tip1.textContent = getLocalizedText('noResources')

      const tip2 = document.createElement('div')
      tip2.className = 'lx-empty-hint'
      tip2.textContent = getLocalizedText('noResourcesHint')

      noData.appendChild(tip1)
      noData.appendChild(tip2)
      content.appendChild(noData)
    }

    // 列表长高/变矮走过渡（弹窗跟着平滑延展，而不是跳一下）
    animateListHeight(content)
  }

  /**
   * 条目右侧的下载按钮。
   *
   * 整行不再是"点了就下载"——列表里还要点齿轮、选格式、点选项，整行可点会
   * 频繁误发任务（用户点名要显式的下载入口）。图标与悬浮下载按钮同一套描边。
   */
  const createItemDownloadButton = (label, onClick) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'lx-item-download'
    btn.title = label
    btn.setAttribute('aria-label', label)

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('width', '13')
    icon.setAttribute('height', '13')
    icon.style.fill = 'none'
    icon.style.stroke = 'currentColor'
    icon.style.strokeWidth = '1.9'
    icon.style.strokeLinecap = 'round'
    icon.style.strokeLinejoin = 'round'
    icon.style.display = 'block'
    const shaft = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    shaft.setAttribute('d', 'M12 4.5v9.5')
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    head.setAttribute('d', 'M7.8 10.5 12 14.7l4.2-4.2')
    const tray = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    tray.setAttribute('d', 'M5 19.5h14')
    icon.appendChild(shaft)
    icon.appendChild(head)
    icon.appendChild(tray)
    btn.appendChild(icon)

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    })
    return btn
  }

  /**
   * 一条资源右侧的「输出格式」设置（齿轮 + 展开后的容器选项）。
   *
   * **为什么挂在条目上而不是全局**：同一个页面里 HLS 清单、直播录制、DASH
   * 分离流想要的容器经常不一样（直播录下来留 .ts 最稳，普通视频要 .mp4），
   * 全局只有一个值就必然要为其中一类将就。
   *
   * 选择结果进 `mergeFormatByUrl`，随 add 消息一起发给应用（`mergeFormat`），
   * 应用把它记在这条任务的历史里，合并/换封装时优先用它。
   *
   * @param {string[]} urls 这条条目对应的地址（一对音视频要两个都记，谁先下完都认）
   */
  /**
   * @param {string[]} urls 这条条目对应的地址（一对音视频要两个都记）
   * @param {() => HTMLElement|null} [metaProvider] 第二行的徽章/大小容器：
   *   设置展开时把它藏起来（一行只留名字和设置），收起后再显示
   */
  /** 秒 → 0:00 / 1:02:03。 */
  const formatClipTime = (sec) => {
    const total = Math.max(0, Math.round(Number(sec) || 0))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const mm = h > 0 ? `${m}`.padStart(2, '0') : `${m}`
    return `${h > 0 ? `${h}:` : ''}${mm}:${`${s}`.padStart(2, '0')}`
  }

  /** 页面里各 <video> 中最长的时长（拿不到就是 0）。 */
  const pageVideoDuration = () => {
    try {
      let best = 0
      document.querySelectorAll('video').forEach((v) => {
        const d = Number(v && v.duration)
        if (Number.isFinite(d) && d > best) best = d
      })
      return best
    } catch (_) {
      return 0
    }
  }

  /**
   * 「片段」设置：双滑块选 [start, end]（秒）。
   *
   * 只在**拿得到时间轴**时出现（页面里的 `<video>` 有 duration）。两条路都能裁：
   * - HLS 清单：下载引擎按 `#EXTINF` 累计时间挑分片（分段级），再把区间传给应用；
   * - 普通单文件（mp4 / flv …）：应用在下载完成后用媒体引擎按帧裁一次
   *   （mp4 产物带编辑列表，看到的第一帧就是切点那一帧）。
   * 直播没有稳定时间轴，调用方不会把 `canClip` 传进来。
   */
  const createClipRow = (keys, canClip) => {
    const wrap = document.createElement('div')
    wrap.className = 'lx-clip'

    const duration = pageVideoDuration()
    if (!canClip || !(duration > 0)) {
      wrap.hidden = true
      return wrap
    }

    // 读数行：两个时间**横向跟着各自那个把手走**（左边=起点把手，右边=终点把手），
    // 默认就显示时间，不再出现"全片"这种字。定位在 paint 里按百分比算。
    const head = document.createElement('div')
    head.className = 'lx-clip-head'
    const startTime = document.createElement('span')
    startTime.className = 'lx-clip-time'
    const endTime = document.createElement('span')
    endTime.className = 'lx-clip-time'
    head.appendChild(startTime)
    head.appendChild(endTime)
    // 两个读数只有时间，整行挂个提示说明它是「片段」（也给读屏软件一个名字）
    head.title = getLocalizedText('clipRange')

    const slider = document.createElement('div')
    slider.className = 'lx-clip-slider'
    const track = document.createElement('div')
    track.className = 'lx-clip-track'
    const fill = document.createElement('div')
    fill.className = 'lx-clip-fill'
    const thumbStart = document.createElement('div')
    thumbStart.className = 'lx-clip-thumb'
    const thumbEnd = document.createElement('div')
    thumbEnd.className = 'lx-clip-thumb'
    slider.appendChild(track)
    slider.appendChild(fill)
    slider.appendChild(thumbStart)
    slider.appendChild(thumbEnd)

    // 两个滑块之间至少留一点点，避免 start === end 的零长度窗口
    const minGap = Math.min(1, duration / 10)
    const current = () => {
      const saved = clipOf(keys[0])
      if (saved && Number.isFinite(saved.start) && Number.isFinite(saved.end)) return saved
      return { start: 0, end: duration }
    }
    const paint = () => {
      const { start, end } = current()
      const a = (start / duration) * 100
      const b = (end / duration) * 100
      thumbStart.style.left = `${a}%`
      thumbEnd.style.left = `${b}%`
      fill.style.left = `${a}%`
      fill.style.width = `${Math.max(0, b - a)}%`
      // 两个读数分别跟自己的把手：拖左边只动左边那个，拖右边只动右边
      startTime.textContent = formatClipTime(start)
      endTime.textContent = formatClipTime(end)
      placeTimes(start, end)
    }

    /**
     * 把两个读数摆到各自把手的正上方。
     *
     * 用 px 不用百分比：读数本身有宽度，`left: 50%` 加 `translateX(-50%)` 在两端
     * 会溢出容器（又被 overflow:hidden 裁）；这里按容器宽度夹住，贴边时读数停在
     * 边上。两个把手挨得很近时读数会撞在一起，这时一左一右各让一半，保持可读。
     */
    const placeTimes = (startSec, endSec) => {
      const width = head.clientWidth
      if (!width) return
      const sw = startTime.offsetWidth || 0
      const ew = endTime.offsetWidth || 0
      const ratio = (sec) => (duration > 0 ? Math.min(1, Math.max(0, sec / duration)) : 0)
      // 贴边时不再居中，整块留在容器里
      const clamp = (x, labelWidth) => {
        const half = labelWidth / 2
        return Math.min(Math.max(x, half), Math.max(half, width - half))
      }
      let sx = clamp(ratio(startSec) * width, sw)
      let ex = clamp(ratio(endSec) * width, ew)
      const overlap = (sx + sw / 2 + 6) - (ex - ew / 2)
      if (overlap > 0) {
        sx = Math.max(sw / 2, sx - overlap / 2)
        ex = Math.min(width - ew / 2, ex + overlap / 2)
      }
      startTime.style.left = `${Math.round(sx)}px`
      endTime.style.left = `${Math.round(ex)}px`
    }
    const apply = (next) => {
      const start = Math.max(0, Math.min(next.start, duration - minGap))
      const end = Math.min(duration, Math.max(next.end, start + minGap))
      keys.forEach((key) => clipByUrl.set(key, { start, end }))
      paint()
    }

    // 指针位置 → 0~1（每次重新量：弹窗出现/滚动都可能改变位置）
    const ratioAt = (event) => {
      const rect = slider.getBoundingClientRect()
      if (!rect.width) return null
      return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    }

    const drag = (which) => (event) => {
      event.preventDefault()
      event.stopPropagation()
      const move = (ev) => {
        const ratio = ratioAt(ev)
        if (ratio === null) return
        const sec = ratio * duration
        const cur = current()
        apply(which === 'start' ? { start: sec, end: cur.end } : { start: cur.start, end: sec })
      }
      const el = which === 'start' ? thumbStart : thumbEnd
      const up = () => {
        window.removeEventListener('pointermove', move, true)
        window.removeEventListener('pointerup', up, true)
        el.classList.remove('is-dragging')
      }
      window.addEventListener('pointermove', move, true)
      window.addEventListener('pointerup', up, true)
      // 拖动期间用类保持"按下"的视觉：指针一离开把手，:active 就没了，
      // 而这时用户明明还在拖
      el.classList.add('is-dragging')
      move(event)
    }
    thumbStart.addEventListener('pointerdown', drag('start'))
    thumbEnd.addEventListener('pointerdown', drag('end'))
    // 点轨道任意位置：把**离得近**的那个把手挪过去，并继续跟着拖。
    // 把手只有 12px 宽，必须先把指针对准它才能拖；点哪儿都能定位之后，
    // 选片段就是"点一下、拖一下"两件事，而不是先找把手。
    slider.addEventListener('pointerdown', (event) => {
      const ratio = ratioAt(event)
      if (ratio === null) return
      const sec = ratio * duration
      const cur = current()
      const which = Math.abs(sec - cur.start) <= Math.abs(sec - cur.end) ? 'start' : 'end'
      drag(which)(event)
    })

    wrap.appendChild(head)
    wrap.appendChild(slider)
    // 读数要按**真实宽度**定位（贴边夹住），所以先入 DOM 再画一次
    paint()
    // ⚠️ 上面这次 paint 其实摆不动读数：createClipRow 返回的是一棵**还没挂上去**
    // 的子树（调用方 append 进条目 → 条目进弹窗 → 弹窗最后才进 body），此刻
    // `head.clientWidth` 是 0，placeTimes 里 `if (!width) return` 直接返回 ——
    // 两个 span 的 left 从头到尾没被写过，只剩样式表里的 `left: 0`，于是
    // 起点和终点两个读数一起挤在左边（用户报的形态）。拖动之所以"正常"，是因为
    // 那时节点早就进文档了。
    // 宽度只有在入文档之后才量得到：交给 ResizeObserver 盯到第一次非 0 再摆一次
    // （弹窗从 display:none 切到可见也走这条）。摆好就断开，不留监听。
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => {
        if (!head.clientWidth) return
        paint()
        observer.disconnect()
      })
      observer.observe(head)
    } else {
      // 老浏览器没有 ResizeObserver：按帧重试，最多约 2 秒
      let tries = 0
      const retry = () => {
        if (head.clientWidth) {
          paint()
          return
        }
        if (++tries < 120) requestAnimationFrame(retry)
      }
      requestAnimationFrame(retry)
    }
    return wrap
  }

  const createFormatControl = (urls, metaProvider, extras = {}) => {
    const keys = (Array.isArray(urls) ? urls : [urls]).map(u => `${u || ''}`).filter(Boolean)

    const control = document.createElement('span')
    control.className = 'lx-format'

    const gear = document.createElement('button')
    gear.type = 'button'
    gear.className = 'lx-gear'
    const gearLabel = getLocalizedText('outputFormat')
    gear.title = gearLabel
    gear.setAttribute('aria-label', gearLabel)
    const gearIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    gearIcon.setAttribute('viewBox', '0 0 24 24')
    gearIcon.setAttribute('width', '13')
    gearIcon.setAttribute('height', '13')
    gearIcon.style.fill = 'currentColor'
    gearIcon.style.display = 'block'
    const gearPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    gearPath.setAttribute('d', 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z')
    gearIcon.appendChild(gearPath)
    gear.appendChild(gearIcon)

    const panel = document.createElement('div')
    panel.className = 'lx-format-panel'
    panel.setAttribute('aria-hidden', 'true')
    // 面板里的点击不能冒泡到条目上（条目整行 = 立即下载）
    panel.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })

    // 一行设置：**左边标题、右边选择框**（与应用设置页的行同构）。
    // 选择框是**自绘**的：原生 <select> 的框线和弹出列表由浏览器画，各平台
    // 长得都不一样（macOS 上还是系统菜单），跟应用的描边小方框放一起很跳。
    const row = document.createElement('div')
    row.className = 'lx-format-row'

    const label = document.createElement('span')
    label.className = 'lx-format-label'
    label.textContent = getLocalizedText('outputFormat')

    const field = document.createElement('span')
    field.className = 'lx-format-field'

    const valueLabel = (value) => (value ? `${value}`.toUpperCase() : getLocalizedText('formatFollowApp'))

    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'lx-format-trigger'
    const triggerText = document.createElement('span')
    triggerText.className = 'lx-format-value'
    triggerText.textContent = valueLabel(mergeFormatOf(keys[0]))
    // 箭头用 SVG 描边，而不是"两条边框转 45°"：那种做法旋转后视觉重心会偏离
    // 盒子中心（顶点比两条臂更远），怎么调 margin 都偏低 1~2px（用户两次点名）
    const caret = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    caret.setAttribute('class', 'lx-format-caret')
    caret.setAttribute('viewBox', '0 0 24 24')
    caret.setAttribute('width', '11')
    caret.setAttribute('height', '11')
    caret.setAttribute('fill', 'none')
    caret.setAttribute('stroke', 'currentColor')
    caret.setAttribute('stroke-width', '2')
    caret.setAttribute('stroke-linecap', 'round')
    caret.setAttribute('stroke-linejoin', 'round')
    const caretPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    caretPath.setAttribute('d', 'M6 9.5l6 6 6-6')
    caret.appendChild(caretPath)
    trigger.appendChild(triggerText)
    trigger.appendChild(caret)

    // 菜单挂到 body 上：列表是滚动容器（overflow-y:auto），放在条目里会被裁掉
    let menu = null
    let closeMenu = () => {}

    const openMenu = () => {
      closeMenu()
      menu = document.createElement('div')
      menu.className = 'lx-scope lx-format-menu'
      if (lxTheme === 'dark') menu.classList.add('lx-dark')
      MERGE_FORMAT_VALUES.forEach((value) => {
        const option = document.createElement('button')
        option.type = 'button'
        option.className = 'lx-format-option'
        if (value === mergeFormatOf(keys[0])) option.classList.add('is-active')
        option.textContent = valueLabel(value)
        option.addEventListener('click', (ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          keys.forEach((key) => {
            if (value) mergeFormatByUrl.set(key, value)
            else mergeFormatByUrl.delete(key)
          })
          triggerText.textContent = valueLabel(value)
          closeMenu()
        })
        menu.appendChild(option)
      })
      menu.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
      })
      document.body.appendChild(menu)
      trigger.classList.add('is-open')

      const rect = trigger.getBoundingClientRect()
      // 用 offsetWidth/Height 量：此时菜单可能正处在 scale(0.94) 的起始态，
      // getBoundingClientRect 会把缩放算进去，定位就差几个像素
      const menuWidth = menu.offsetWidth
      const menuHeight = menu.offsetHeight
      const vw = viewportWidthForLayout()
      const vh = window.innerHeight || 0
      const below = rect.bottom + 4
      const top = (below + menuHeight > vh)
        ? Math.max(4, rect.top - menuHeight - 4)
        : below
      const left = Math.max(4, Math.min(rect.left, vw - menuWidth - 4))
      menu.style.top = `${Math.round(top)}px`
      menu.style.left = `${Math.round(left)}px`

      // 与资源弹窗同一套：从上往下落 8px 并放大
      playPopupEnter(menu, POPUP_ENTER_OFFSET, POPUP_ENTER_ORIGIN)

      const onDocDown = (ev) => {
        if (menu && !menu.contains(ev.target) && ev.target !== trigger && !trigger.contains(ev.target)) {
          closeMenu()
        }
      }
      const onScroll = () => closeMenu()
      closeMenu = () => {
        document.removeEventListener('mousedown', onDocDown, true)
        window.removeEventListener('scroll', onScroll, true)
        trigger.classList.remove('is-open')
        const node = menu
        menu = null
        if (!node) return
        // 收起 = 反着播一遍（朝触发按钮收 + 缩小），播完再摘节点；期间不接收点击
        node.style.pointerEvents = 'none'
        playPopupLeave(node, POPUP_ENTER_OFFSET, POPUP_ENTER_ORIGIN, () => {
          if (node.parentNode) node.parentNode.removeChild(node)
        })
      }
      document.addEventListener('mousedown', onDocDown, true)
      window.addEventListener('scroll', onScroll, true)
    }

    trigger.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (menu) {
        closeMenu()
        return
      }
      openMenu()
    })

    field.appendChild(trigger)
    row.appendChild(label)
    row.appendChild(field)

    // 内容区与上方选项区之间的分隔线：左右都留一点空，不顶到条目边上
    const divider = document.createElement('span')
    divider.className = 'lx-format-divider'

    panel.appendChild(divider)
    panel.appendChild(row)
    // 片段区间：拿得到时间轴、且这条资源确实是个能裁的媒体时才显示
    panel.appendChild(createClipRow(keys, extras.canClip === true))

    gear.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const willOpen = !panel.classList.contains('is-open')
      // 同时只开一个：列表里挂着一排齿轮，开着好几个就分不清在给谁设
      document.querySelectorAll('.lx-format-panel.is-open').forEach((el) => { el.classList.remove('is-open') })
      // 先把被上一次展开藏起来的第二行全部复原，再按本次是否展开决定藏不藏
      document.querySelectorAll('.lx-item-meta.is-collapsed').forEach((el) => { el.classList.remove('is-collapsed') })
      if (!willOpen) closeMenu()
      if (!willOpen) closeMenu()
      panel.classList.toggle('is-open', willOpen)
      // 设置展开时第二行的标签不显示，收起后再显示（用户点名）
      const metaEl = typeof metaProvider === 'function' ? metaProvider() : null
      // 用类做「高度塌陷」动画，而不是 hidden 直接消失：直接消失会让条目瞬间
      // 矮一行，正好和面板展开叠在一起 —— 用户看到的就是"跳一下"
      if (metaEl) metaEl.classList.toggle('is-collapsed', willOpen)
      if (willOpen) {
        // 每次打开都回读一次：一对音视频的两个地址可能被另一个条目改过
        triggerText.textContent = valueLabel(mergeFormatOf(keys[0]))
      }
    })

    control.appendChild(gear)
    return { control, panel }
  }

  // 创建组合资源项（视频+音频）
  const createCombinedResourceItem = (resource, referer, index) => {
    const item = document.createElement('div')
    item.className = 'lx-item'

    const info = document.createElement('div')
    info.className = 'lx-item-top'

    // 生成友好的文件名（与普通资源项相同的逻辑）
    let displayName = ''
    let sizeInfo = ''
    try {
      // 尝试从页面标题获取
      const pageTitle = getVideoTitle()
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
          displayName = `${cleanTitle}, ${ext}${getLocalizedText('completeVideo')}`
          // 如果有质量信息，添加到文件名
          if (resource.quality) {
            displayName = `${cleanTitle}, ${resource.quality}, ${ext}${getLocalizedText('completeVideo')}`
          }
        } else {
          displayName = resource.name || `${getLocalizedText('completeVideo')} ${index + 1}`
        }
      } else {
        displayName = resource.name || `${getLocalizedText('completeVideo')} ${index + 1}`
      }
    } catch (e) {
      displayName = resource.name || `完整视频 ${index + 1}`
      // displayName += ` (${formatFileSize(resource.size)})`
    }

    const name = document.createElement('div')
    name.textContent = displayName
    name.className = 'lx-name'

    const badges = document.createElement('div')
    badges.className = 'lx-badges'

    // 质量徽章
    if (resource.quality) {
      const quality = document.createElement('span')
      quality.textContent = resource.quality
      quality.className = 'lx-badge lx-badge-quality'
      badges.appendChild(quality)
    }

    // 完整标记
    const completeTag = document.createElement('span')
    completeTag.textContent = getLocalizedText('complete')
    completeTag.className = 'lx-badge lx-badge-success'
    badges.appendChild(completeTag)

    info.appendChild(name)

    // 右侧：输出格式齿轮 + 下载按钮（下载在最右）
    // 一对音视频记**两个**地址 —— 谁先下完，应用都能从历史里查到同一个选择
    const format = createFormatControl([resource.videoUrl, resource.audioUrl], () => item.querySelector('.lx-item-meta'), { canClip: true })
    info.appendChild(format.control)
    info.appendChild(createItemDownloadButton(getLocalizedText('downloadOne'), () => sendPair()))

    // 徽章与大小下沉到第二行（与普通条目同版式）
    const meta = document.createElement('div')
    meta.className = 'lx-item-meta'
    if (badges.children.length > 0) {
      meta.appendChild(badges)
    }
    // 「完整视频」的大小 = 两条流之和；size 还没算出来时自己加一遍（快照可能滞后）
    const combinedSize = (resource.size && resource.size > 0)
      ? resource.size
      : ((resource.videoSize || 0) + (resource.audioSize || 0))
    const size = document.createElement('span')
    size.textContent = formatFileSize(combinedSize)
    size.className = 'lx-size'
    meta.appendChild(size)

    item.appendChild(info)
    if (meta.children.length > 0) {
      item.appendChild(meta)
    }
    item.appendChild(format.panel)

    // 一对音视频交给同一个函数发送：命名规则与配对 ID 都只有一处定义。
    // 只有右侧下载按钮会调它，整行不可点。
    const sendPair = () => {
      sendStreamPair(resource.videoUrl, resource.audioUrl, referer, getVideoTitle())
      const dropdown = document.getElementById('lerxu-resource-dropdown')
      hideResourceDropdownAnimated(dropdown)
    }

    return item
  }

  /**
   * 创建资源条目。
   *
   * `options.primary`：清单那一栏用（浅蓝底 + 标题条目标题就是页面标题本身）；
   * `options.segment`：HLS 分片用（灰一点 + 「分片」徽章）。
   *
   * **条目上不放任何下载按钮/图标** —— 点条目本身就是"加入下载队列"，
   * 再挂一个按钮只是噪音（用户点名不要）。
   */
  const createResourceItem = (resource, referer, index, options) => {
    const opts = options || {}

    const item = document.createElement('div')
    item.className = 'lx-item'

    const info = document.createElement('div')
    info.className = 'lx-item-top'

    // 生成友好的文件名
    let displayName = ''
    let sizeInfo = ''
    try {
      // 尝试从页面标题获取
      const pageTitle = getVideoTitle()
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
          // 清单条目就显示标题本身：它上面那行标题已经写明"HLS 完整视频"，
          // 再拼一个 "M3U8文件" 只是噪音
          displayName = opts.primary
            ? cleanTitle
            : `${cleanTitle}, ${ext}${getLocalizedText('file')}`
          // 如果有质量信息，添加到文件名
          if (!opts.primary && resource.quality && resource.quality !== ext) {
            displayName = `${cleanTitle}, ${resource.quality}, ${ext}${getLocalizedText('file')}`
          }
        } else {
          displayName = resource.name || `${ext} ${index + 1}`
        }
      } else {
        displayName = resource.name || `${ext} ${index + 1}`
      }
    } catch (e) {
      displayName = resource.name || `Resource ${index + 1}`
      // displayName += ` (${formatFileSize(resource.size)})`
    }

    const name = document.createElement('div')
    name.textContent = displayName
    // 分片整条压暗：它是"零件"而不是能单独用的资源，视觉上就该往后退
    name.className = opts.segment ? 'lx-name lx-name-dim' : 'lx-name'

    const badges = document.createElement('div')
    badges.className = 'lx-badges'

    // 直播徽章：条目已被识别为直播流（HLS 清单无 ENDLIST / FLV 无总长的
    // 长连接）。排在最前 —— "这条是直播、点了是开始录制"比画质/大小都重要。
    if (resource.live === true) {
      const liveTag = document.createElement('span')
      liveTag.textContent = getLocalizedText('live')
      liveTag.className = 'lx-badge lx-badge-live'
      badges.appendChild(liveTag)
    }

    // 质量徽章
    if (resource.quality) {
      const quality = document.createElement('span')
      quality.textContent = resource.quality
      quality.className = 'lx-badge lx-badge-quality'
      badges.appendChild(quality)
    }

    // 分片徽章：分片不是"一个视频"，标出来免得跟真资源混淆
    if (opts.segment) {
      const segTag = document.createElement('span')
      segTag.textContent = getLocalizedText('segment')
      segTag.className = 'lx-badge lx-badge-muted'
      badges.appendChild(segTag)
    }

    info.appendChild(name)

    // 右侧：输出格式齿轮 + 下载按钮。**下载在最右**——它是这行的主动作
    // 直播没有稳定时间轴：不摆片段滑块（摆了也不知道该按哪条时间轴裁）
    const format = createFormatControl([resource.url], () => item.querySelector('.lx-item-meta'), { canClip: resource.live !== true })
    info.appendChild(format.control)
    info.appendChild(createItemDownloadButton(getLocalizedText('downloadOne'), () => sendThis()))

    // 徽章与大小挪到**第二行**：一行里挤着名字 + 直播/画质/分片 + 大小，
    // 名字只剩十来个字就被省略号吃掉（用户点名：右侧标签要下沉一行）
    const meta = document.createElement('div')
    meta.className = 'lx-item-meta'
    if (badges.children.length > 0) {
      meta.appendChild(badges)
    }
    // 大小永远给一个：探不到就写「未知大小」。以前是「没有就不渲染」，
    // 同一屏里几条缺这一块，看着像界面坏了（用户点名）
    const size = document.createElement('span')
    size.textContent = formatFileSize(resource.size)
    size.className = 'lx-size'
    meta.appendChild(size)

    item.appendChild(info)
    if (meta.children.length > 0) {
      item.appendChild(meta)
    }
    item.appendChild(format.panel)

    // 加入下载队列（行、以及行里的下载按钮共用这一段）
    const sendThis = () => {
      // 生成建议的文件名
      let filename = ''
      try {
        const pageTitle = getVideoTitle()
        const srcExt = resource.ext || 'video'
        // 清单（m3u8/mpd）的产物扩展名与实际容器一致，见 outputExtFor
        const ext = outputExtFor(srcExt)

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
            if (resource.quality && resource.quality !== srcExt.toUpperCase()) {
              filename = `${cleanTitle}_${resource.quality}.${ext}`
            } else {
              filename = `${cleanTitle}.${ext}`
            }
          }
        }
      } catch (e) {
      }

      sendResourceToClient(resource.url, referer, filename)
      const dropdown = document.getElementById('lerxu-resource-dropdown')
      hideResourceDropdownAnimated(dropdown)
    }

    // 整行不再可点：只有右侧的下载按钮会发任务（避免点齿轮/选格式时误发）
    return item
  }

  /**
   * 「HLS 分片」组：一个可折叠的标题行 + 收在里面的分片条目。
   *
   * 分片默认收起（`segmentsExpanded` 是跨重画的持久状态）。**一条都没丢** ——
   * 想单独取某几段的人展开就能点，但默认不会再让几十条分片把清单挤下去。
   */
  const createSegmentGroup = (segments, referer) => {
    const section = document.createElement('div')

    const header = document.createElement('div')
    header.className = 'lx-group-head'

    const arrow = document.createElement('span')
    arrow.textContent = '▶'
    arrow.className = segmentsExpanded ? 'lx-chevron lx-chevron-open' : 'lx-chevron'

    const label = document.createElement('span')
    label.textContent = getLocalizedText('hlsSegments')

    const count = document.createElement('span')
    count.className = 'lx-count'
    count.textContent = `· ${segments.length}`

    header.appendChild(arrow)
    header.appendChild(label)
    header.appendChild(count)
    section.appendChild(header)

    const list = document.createElement('div')
    list.style.display = segmentsExpanded ? 'block' : 'none'
    segments.forEach((resource, index) => {
      list.appendChild(createResourceItem(resource, referer, index, { segment: true }))
    })
    section.appendChild(list)

    header.addEventListener('click', () => {
      segmentsExpanded = !segmentsExpanded
      arrow.className = segmentsExpanded ? 'lx-chevron lx-chevron-open' : 'lx-chevron'
      list.style.display = segmentsExpanded ? 'block' : 'none'
      // 展开/收起改变的是下拉框高度，它贴着按钮定位 —— 不重算就可能伸出屏幕
      const dropdown = document.getElementById('lerxu-resource-dropdown')
      if (dropdown) adjustDropdownPosition(dropdown)
    })

    return section
  }

  const downloadSingleResource = (resource, referer, index) => {
    let filename = ''
    try {
      const pageTitle = getVideoTitle()
      const srcExt = resource.ext || 'video'
      // 清单（m3u8/mpd）的产物扩展名与实际容器一致，见 outputExtFor
      const ext = outputExtFor(srcExt)

      if (pageTitle) {
        let cleanTitle = pageTitle
          .replace(/\s*[-_│|]\s*在线播放.*$/i, '')
          .replace(/\s*[-_│|]\s*在线观看.*$/i, '')
          .replace(/\s*[-_│|]\s*樱花动漫.*$/i, '')
          .replace(/\s*[-_│|]\s*\w+视频.*$/i, '')
          .replace(/[<>:"/\\|?*]/g, '_')
          .trim()

        if (cleanTitle) {
          if (resource.quality && resource.quality !== srcExt.toUpperCase()) {
            filename = `${cleanTitle}_${resource.quality}.${ext}`
          } else {
            filename = `${cleanTitle}.${ext}`
          }
        }
      }
    } catch (e) {
    }

    sendResourceToClient(resource.url, referer, filename)
    const dropdown = document.getElementById('lerxu-resource-dropdown')
    hideResourceDropdownAnimated(dropdown)
  }

  const downloadCombinedResource = (resource, referer) => {
    sendStreamPair(resource.videoUrl, resource.audioUrl, referer, getVideoTitle())
    const dropdown = document.getElementById('lerxu-resource-dropdown')
    hideResourceDropdownAnimated(dropdown)
  }

  const getAutoDownloadCandidates = (resources) => {
    const r = resources || sniffedResources
    // 与下拉框**共用同一套切分规则**：这里老代码自己又写了一遍"哪些进 m4s 栏"，
    // 规则一改两处就会对不上（数量对不上是用户点名过的问题）。分片组永远不进
    // 候选 —— 自动下载只在"整页就一个视频"时触发，分片不是视频。
    const items = collectDisplayItems(r)
    const candidates = []
    const push = (section) => (list) => {
      (Array.isArray(list) ? list : []).forEach((resource, index) => {
        candidates.push({ section, resource, index })
      })
    }
    push('manifest')(items.manifest)
    push('combined')(items.combined)
    push('m4s')(items.m4s)
    push('video')(items.video)
    push('audio')(items.audio)
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

  /**
   * 弹层的出入场动画（资源弹窗与格式菜单共用）。
   *
   * 为什么用内联 transition + `void offsetHeight` 强制重排，而不是"加个 class、
   * 下一帧再删"：`display:none → flex` 的那一帧浏览器常常还没算出起始态，
   * 双 rAF 撤类时过渡就被合并掉了 —— 表现就是"根本没有动画"（用户点名）。
   * 这里先把起始态写死、强制提交一帧，再写目标态，过渡一定会跑。
   *
   * 方向按弹层与锚点的相对位置定：在锚点下方 → 从上方落下（负位移）；
   * 被翻到锚点上方 → 从下方升起（正位移），也就是"从按钮那儿长出来"。
   */
  const DROPDOWN_ANIM_MS = 160

  /**
   * 出入场方向：**永远是"从上往下落"**，不按弹层与按钮的相对位置翻转。
   *
   * 踩过两次：按几何判断"在按钮上方就往上飘"，结果弹窗被翻到按钮上方时
   * 整块往上滑，看着既不是从按钮出来、也不是落下来（用户点名两次）。
   * 固定成"起始位置在最终位置上方 8px、origin 在顶边"，视觉上就是干净地
   * 往下落一截并放大 —— 与"从选项向下移动"的诉求一致。
   */
  const POPUP_ENTER_OFFSET = -8
  const POPUP_ENTER_ORIGIN = 'top center'

  function playPopupEnter (el, offsetY, origin) {
    if (!el) return
    el.style.transition = 'none'
    el.style.transformOrigin = origin
    el.style.opacity = '0'
    el.style.transform = `translateY(${offsetY}px) scale(0.96)`
    void el.offsetHeight // 强制重排：让起始态成为真正的起点
    el.style.transition = `opacity ${DROPDOWN_ANIM_MS}ms ease, transform ${DROPDOWN_ANIM_MS}ms ease`
    el.style.opacity = '1'
    el.style.transform = 'none'
    if (el.__lxAnimTimer) clearTimeout(el.__lxAnimTimer)
    el.__lxAnimTimer = setTimeout(() => {
      el.__lxAnimTimer = null
      el.style.transition = ''
      el.style.transformOrigin = ''
      el.style.transform = ''
      el.style.opacity = ''
    }, DROPDOWN_ANIM_MS + 60)
  }

  function playPopupLeave (el, offsetY, origin, onDone) {
    if (!el) return
    el.style.transition = `opacity ${DROPDOWN_ANIM_MS}ms ease, transform ${DROPDOWN_ANIM_MS}ms ease`
    el.style.transformOrigin = origin
    el.style.opacity = '0'
    el.style.transform = `translateY(${offsetY}px) scale(0.96)`
    if (el.__lxAnimTimer) clearTimeout(el.__lxAnimTimer)
    el.__lxAnimTimer = setTimeout(() => {
      el.__lxAnimTimer = null
      el.style.transition = ''
      el.style.transformOrigin = ''
      el.style.transform = ''
      el.style.opacity = ''
      if (typeof onDone === 'function') onDone()
    }, DROPDOWN_ANIM_MS + 10)
  }

  function showResourceDropdownAnimated (dropdown) {
    if (!dropdown) return
    dropdown.__lxClosing = false
    dropdown.style.display = 'flex'
    // 位置必须在显示之后算（依赖尺寸），算完再按"它相对按钮在哪一侧"定动画方向
    adjustDropdownPosition(dropdown)
    playPopupEnter(dropdown, POPUP_ENTER_OFFSET, POPUP_ENTER_ORIGIN)
  }

  function hideResourceDropdownAnimated (dropdown) {
    if (!dropdown || dropdown.style.display === 'none') return
    if (dropdown.__lxClosing) return
    dropdown.__lxClosing = true
    playPopupLeave(dropdown, POPUP_ENTER_OFFSET, POPUP_ENTER_ORIGIN, () => {
      dropdown.style.display = 'none'
      dropdown.__lxClosing = false
    })
  }

  // 显示资源选择下拉框
  const showResourceDropdown = () => {
    const dropdown = document.getElementById('lerxu-resource-dropdown')
    if (!dropdown) return
    const isOpen = dropdown.style.display === 'flex' && !dropdown.__lxClosing
    if (isOpen) {
      hideResourceDropdownAnimated(dropdown)
      return
    }
    // 在显示下拉框前检查是否需要恢复资源
    checkAndRestoreResources()
    updateResourceList()
    showResourceDropdownAnimated(dropdown)
  }

  // 调整下拉框位置，确保在屏幕内
  const adjustDropdownPosition = (dropdown) => {
    const btn = document.getElementById('lerxu-bilibili-download-btn')
    if (!btn) return

    const btnRect = btn.getBoundingClientRect()
    const dropdownRect = dropdown.getBoundingClientRect()
    const viewportWidth = viewportWidthForLayout()
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
  //
  // ⚠️ 这是 **capture** 阶段的监听：它在目标元素的处理器之前跑，所以点格式齿轮
  // 时也会先走到这里。判据必须把「弹窗自身的内容」也算作"里面" —— 只看 wrapper
  // 会把弹窗里的一切点击都当成外面，点一下齿轮整个资源弹窗就没了（用户点名）。
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('lerxu-resource-dropdown')
    if (!dropdown || dropdown.style.display !== 'flex') return
    const wrapper = document.getElementById('lerxu-bilibili-download-btn-wrapper')
    const target = e.target
    if (wrapper && wrapper.contains(target)) return
    if (dropdown.contains(target)) return
    const menu = document.querySelector('.lx-format-menu')
    if (menu && menu.contains(target)) return
    hideResourceDropdownAnimated(dropdown)
  }, true)

  /**
   * 布局视口宽度（**不含**经典滚动条）。
   *
   * `position: fixed; right: N` 是相对布局视口算的，而 `window.innerWidth`
   * 把经典滚动条也算在内（Windows 上恒 17px，macOS 打开"始终显示滚动条"
   * 时约 15px）。用 innerWidth 去减 rect.right，按钮就会比右边缘往里缩
   * 一个滚动条的宽度 —— 用户看到的"总是差一段距离"就是它。
   */
  const viewportWidthForLayout = () => {
    try {
      const el = document.documentElement
      const w = el && el.clientWidth ? el.clientWidth : 0
      if (w > 0) return w
    } catch (e) {}
    return window.innerWidth || 0
  }

  /**
   * 按钮右边缘要对齐到的 x 坐标。
   *
   * 容器经常比画面本身宽（视频卡片、带内边距的外壳、信息流里的 feed-item），
   * 直接对齐容器的右边缘就会离画面差出一截。所以容器里若有基本铺满它的
   * `<video>`，就以画面为准；没有才退回容器本身。
   */
  const alignRightOfContainer = (container) => {
    const rect = container.getBoundingClientRect()
    try {
      let video = null
      if (container.tagName === 'VIDEO') {
        video = container
      } else if (container.querySelector) {
        video = container.querySelector('video')
      }
      if (video) {
        const vr = video.getBoundingClientRect()
        // 缩略图/浮层里的小预览不算：宽度得占容器六成以上才是"这一个画面"
        if (vr.width > 0 && vr.height > 0 && vr.width >= rect.width * 0.6) {
          return vr.right
        }
      }
    } catch (e) {}
    return rect.right
  }

  // 检查按钮是否被用户关闭
  const isButtonClosedByUser = () => {
    // 检查全局标记
    if (window.lerxuButtonClosed) return true
    
    // 检查wrapper上的标记
    const wrapper = document.getElementById('lerxu-bilibili-download-btn-wrapper')
    if (wrapper && wrapper.getAttribute('data-user-closed') === 'true') {
      window.lerxuButtonClosed = true
      return true
    }
    
    return false
  }

  // 上次更新资源列表的时间戳，用于节流
  let lastResourceListUpdate = 0
  const RESOURCE_LIST_UPDATE_INTERVAL = 100 // 减少到100ms，提高响应速度

  // 更新按钮显示状态
  const updateButtonVisibility = (skipListRefresh = false) => {
    // wrapper 直接按 id 取。旧代码是从按钮反推（btn.parentElement.parentElement），
    // 但查的按钮 id 还是废弃的 lerxu-download-btn —— 找不到就直接 return，
    // 整个可见性逻辑静默失效（该显示的按钮不显示、per-video 模式下也藏不干净）。
    const wrapper = document.getElementById('lerxu-bilibili-download-btn-wrapper')
    if (!wrapper) return

    // 只在值真的变化时才写 style：每写一次都可能触发样式重算与重绘，
    // 高频写入会让按钮看起来在闪（用户点名）
    const applyDisplay = (value) => {
      if (wrapper.style.display !== value) wrapper.style.display = value
    }

    if (perVideoModeActive) {
      applyDisplay('none')
      return
    }

    const { resources: viewResources } = getUniversalScopedResources()
    const hasResources = hasAnySniffedResources(viewResources)
    const snifferEnabled = videoSnifferConfig.enabled
    const configLoaded = videoSnifferConfig.loaded
    log('Update button visibility, total:', viewResources.total, 'sniffer enabled:', snifferEnabled, 'config loaded:', configLoaded)

    // 检查按钮是否已被用户关闭
    const isButtonClosed = isButtonClosedByUser()

    // 只有在配置已加载、嗅探器启用、有资源且按钮未被用户关闭时才显示按钮
    if (configLoaded && snifferEnabled && hasResources && !isButtonClosed) {
      log('Showing button, updating resource list...')
      {
        const wasHidden = wrapper.style.display === 'none'

        // 确保按钮始终显示（有资源时）
        applyDisplay('block')
        if (wrapper.style.visibility !== 'visible') wrapper.style.visibility = 'visible'

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
            const viewportWidth = viewportWidthForLayout()
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

            let newRight = viewportWidth - alignRightOfContainer(container)

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

      // 资源列表与数量只在需要时刷新（稳定性兜底每 2 秒调用一次，
      // 每次都重建列表会让打开着的下拉框规律性闪动）
      if (!skipListRefresh) {
        updateResourceList()
        updateMainButtonResourceCount()
      }
    } else {
      log('Hiding button - config loaded:', configLoaded, 'sniffer enabled:', snifferEnabled, 'has resources:', hasResources, 'button closed:', isButtonClosed)
      // 无资源、嗅探器禁用、或用户关闭时，强制隐藏按钮（无视拖拽/锁定/固定状态）
      applyDisplay('none')
      log('Hiding button - no resources or sniffer disabled or closed')
    }
  }

  let currentContainer = null
  let currentContainerSelector = ''
  let hasBeenDragged = false // 标记按钮是否被拖拽过
  let isButtonHovered = false // 标记按钮是否正在被悬停
  let positionLocked = false // 标记位置是否已锁定（只有悬停新视频才会解锁）
  let hideButtonTimeout = null // 按钮隐藏倒计时
  let buttonStabilityTimer = null // 按钮稳定性定时器
  let buttonPinned = false // 按钮是否已锁定可见（用户悬停过视频后锁定，直到悬停下个视频或关闭按钮）

  // 按钮稳定性检查 —— 兜底校正，可见性判定统一交给 updateButtonVisibility。
  //
  // 旧实现自己判断"有资源就显示"，既不看 per-video 模式、也不用作用域资源口径：
  // 在 per-video 页面（多个视频）里，主按钮本应隐藏，它却每 2 秒把按钮亮一次，
  // 与 renderPerVideoSniffButtons 的隐藏来回拉锯 —— 用户看到的就是按钮持续闪烁
  // 且点不中（用户点名）。现在只调用同一个真源，判定不可能再打架。
  const ensureButtonStability = () => {
    updateButtonVisibility(true)
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
    // 隐藏延迟，给用户时间操作
    hideButtonTimeout = setTimeout(() => {
      const wrapper = document.getElementById('lerxu-bilibili-download-btn-wrapper')
      const isButtonClosed = isButtonClosedByUser()
      
      // 无资源或嗅探器禁用时强制隐藏（无视拖拽/固定状态，但尊重悬停和用户关闭状态）
      if (wrapper && !isButtonHovered && !isButtonClosed && (!sniffedResources || sniffedResources.total === 0 || !videoSnifferConfig.enabled)) {
        wrapper.style.display = 'none'
        positionLocked = false
        hoveredVideoContainer = null
        log('Button hidden - no resources or sniffer disabled')
      } else {
        log('Button not hidden - hovered:', isButtonHovered, 'closed:', isButtonClosed, 'resources:', sniffedResources?.total || 0, 'sniffer enabled:', videoSnifferConfig.enabled)
      }
    }, 10000)
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
      const wrapper = document.getElementById('lerxu-bilibili-download-btn-wrapper')
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
    const existingBtn = document.getElementById('lerxu-bilibili-download-btn')
    if (existingBtn && (!containerChanged || positionLocked)) {
      log('Button already exists, skipping recreation. containerChanged:', containerChanged, 'positionLocked:', positionLocked)
      return
    }

    // 如果按钮已存在且容器变化，先删除它
    if (existingBtn) {
      const existingWrapper = existingBtn.parentElement
      if (existingWrapper && existingWrapper.id === 'lerxu-bilibili-download-btn-wrapper') {
        log('Removing existing button and dropdown to create new one, containerChanged:', containerChanged)
        // 不要在UI重置时清除资源，导致闪烁
        // window.dispatchEvent(new Event('lerxu-clear-resources'))
        // 直接删除整个wrapper（包括按钮和dropdown）
        existingWrapper.remove()
      }
    }

    // 更新当前容器记录
    currentContainer = container
    currentContainerSelector = containerSelector

    // 如果没找到专用播放器容器，查找 video 元素仅用于计算按钮位置。
    // 绝不移动 video 节点、不修改其父容器样式 —— 移动 DOM 节点会破坏
    // React/Vue 等框架的 DOM 追踪和播放器的 MSE 挂载，导致视频黑屏。
    let videoElement = null
    if (!container) {
      videoElement = document.querySelector('video')
      if (videoElement) {
        container = videoElement
        containerSelector = 'video-rect'
        log('Using video element rect for positioning')
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
    log('Container dimensions:', container.offsetWidth, 'x', container.offsetHeight)

    const wrapper = document.createElement('div')
    wrapper.id = 'lerxu-bilibili-download-btn-wrapper'
    // 资源弹窗的外观令牌挂在容器上（深色主题 = 容器加 lx-dark）
    wrapper.classList.add('lx-scope')
    // 此时还没进文档，applyLxTheme 选择不到它 —— 直接按当前主题落类
    if (lxTheme === 'dark') wrapper.classList.add('lx-dark')
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
        const viewportWidth = viewportWidthForLayout()
        const viewportHeight = window.innerHeight
        const buttonWidth = 150
        const buttonHeight = 30

        let newTop = rect.top - 28
        let newRight = viewportWidth - alignRightOfContainer(container)

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
        const viewportWidth = viewportWidthForLayout()
        const viewportHeight = window.innerHeight
        const buttonWidth = 150
        const buttonHeight = 30

        let newTop = rect.top - 34
        let newRight = viewportWidth - alignRightOfContainer(container)

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
    // 重置样式，防止受到宿主页面（如B站）样式的影响导致组件被放大
    wStyle.zoom = '1'
    wStyle.transform = 'none'
    wStyle.fontSize = '14px'
    wStyle.lineHeight = 'normal'
    wStyle.letterSpacing = 'normal'
    wStyle.fontFamily = 'sans-serif, Arial, "Microsoft YaHei"'
    wStyle.boxSizing = 'border-box'
    
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
    btn.id = 'lerxu-bilibili-download-btn'
    let label = 'Download with Lerxu'
    try {
      if (chrome && chrome.i18n && chrome.i18n.getMessage) {
        const msg = chrome.i18n.getMessage('contextMenuDownload')
        if (msg) label = msg
      }
    } catch (e) {
    }
    btn.title = label
    applyClientLocaleToButton(btn)
    // 与「资源弹窗」同一套设计语言（令牌来自 wrapper 上的 .lx-scope）：素底描边小方卡
    // + 主色图标 + 次级文字计数。替掉原来的蓝色实心胶囊 + 红色实心关闭点，同时把
    // 16px 全圆角收成 8px（与弹窗里 .lx-btn 一致），整体轻一档。
    const style = btn.style
    style.position = 'relative'
    style.padding = '3px 32px 3px 10px' // 右侧留出关闭按钮的热区
    style.background = 'var(--lx-bg-panel)'
    style.color = 'var(--lx-text-1)'
    style.border = '1px solid var(--lx-border-strong)'
    style.borderRadius = '6px'
    style.cursor = 'pointer'
    style.fontSize = '12px'
    style.fontWeight = '500'
    style.fontFamily = 'var(--lx-font)'
    style.boxShadow = 'var(--lx-shadow-sm)'
    style.opacity = '0.9'
    style.transition = 'opacity 0.2s ease, background-color 0.15s ease, border-color 0.15s ease'
    style.pointerEvents = 'auto'
    style.display = 'inline-flex'
    style.alignItems = 'center'
    style.verticalAlign = 'top'
    style.overflow = 'visible'

    // 创建关闭按钮
    const closeBtn = document.createElement('button')
    closeBtn.id = 'lerxu-close-btn'
    closeBtn.title = 'Close'
    const closeStyle = closeBtn.style
    closeStyle.position = 'absolute'
    closeStyle.right = '4px'
    closeStyle.top = '50%'
    closeStyle.transform = 'translateY(-50%)'
    closeStyle.width = '18px'
    closeStyle.height = '18px'
    closeStyle.padding = '0'
    // 关闭：红色实心圆点 → "幽灵"图标按钮。平时只是次级灰的 ×，hover 才浮出
    // danger 弱底（与弹窗里"清空"按钮的 hover 语言一致）。
    closeStyle.background = 'transparent'
    closeStyle.color = 'var(--lx-text-3)'
    closeStyle.border = 'none'
    closeStyle.borderRadius = '6px'
    closeStyle.cursor = 'pointer'
    closeStyle.boxShadow = 'none'
    closeStyle.transition = 'background-color 0.15s ease, color 0.15s ease'
    closeStyle.pointerEvents = 'auto'
    closeStyle.display = 'inline-flex'
    closeStyle.alignItems = 'center'
    closeStyle.justifyContent = 'center'
    closeStyle.zIndex = '1'

    // 关闭图标用 SVG 十字，而不是文字 '×'：文字按字体基线排版，ascent 大于
    // descent，视觉中心天然比盒子中心低约 1px；抽掉红色圆底后这 1px 就露出来了。
    // 换成 SVG，以 viewBox 几何居中（与左侧下载图标同一套路）。
    const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    closeIcon.setAttribute('viewBox', '0 0 24 24')
    closeIcon.setAttribute('width', '11')
    closeIcon.setAttribute('height', '11')
    closeIcon.style.fill = 'currentColor'
    closeIcon.style.display = 'block'
    const closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    closePath.setAttribute('d', 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z')
    closeIcon.appendChild(closePath)
    closeBtn.appendChild(closeIcon)

    // 左侧图标：一根竖线 + 一个下箭头 + 一条底线（比原来那坨实心箭头干净），
    // 用 **描边** 而不是填充 —— 12px 上下的小尺寸里描边更锐利。
    // 颜色继承文字色（currentColor）：按钮里只该有一个强调色，
    // 图标单独染色会让人以为它是可点的第二个东西（用户点名）。
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('width', '14')
    icon.setAttribute('height', '14')
    icon.style.fill = 'none'
    icon.style.stroke = 'currentColor'
    icon.style.strokeWidth = '1.8'
    icon.style.strokeLinecap = 'round'
    icon.style.strokeLinejoin = 'round'
    icon.style.marginRight = '5px'
    icon.style.flexShrink = '0'
    icon.style.display = 'block'

    const iconShaft = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    iconShaft.setAttribute('d', 'M12 4v10')
    icon.appendChild(iconShaft)

    const iconHead = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    iconHead.setAttribute('d', 'M7.5 10.5 12 15l4.5-4.5')
    icon.appendChild(iconHead)

    const iconTray = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    iconTray.setAttribute('d', 'M4.5 19.5h15')
    icon.appendChild(iconTray)

    const countSpan = document.createElement('span')
    countSpan.className = 'lerxu-resource-count'
    const countStyle = countSpan.style
    countStyle.display = 'inline-block'
    countStyle.minWidth = '16px'
    countStyle.textAlign = 'left'
    countStyle.color = 'var(--lx-text-2)'
    countStyle.whiteSpace = 'nowrap'

    btn.appendChild(icon)
    btn.appendChild(countSpan)

    // 创建按钮容器
    const buttonContainer = document.createElement('div')
    buttonContainer.style.display = 'inline-flex'
    buttonContainer.style.alignItems = 'stretch'
    buttonContainer.style.borderRadius = '6px'

    // 关闭按钮点击事件
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      
      // 解除按钮锁定状态
      buttonPinned = false
      
      // 隐藏整个按钮组
      wrapper.style.display = 'none'
      
      // 在wrapper上设置关闭标记，这样即使wrapper被重新创建也能保持状态
      wrapper.setAttribute('data-user-closed', 'true')
      
      // 设置全局关闭标记，防止按钮重新出现
      window.lerxuButtonClosed = true
      
      log('Download button closed by user')
    })

    // 关闭按钮悬停效果：浮出 danger 弱底（与弹窗里"清空"按钮同语言）
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'var(--lx-danger-weak)'
      closeBtn.style.color = 'var(--lx-danger)'
    })
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'transparent'
      closeBtn.style.color = 'var(--lx-text-3)'
    })

    // 将按钮添加到容器
    buttonContainer.appendChild(btn)
    btn.appendChild(closeBtn)
    // 监听按钮悬停状态，防止悬停时位置被重置
    buttonContainer.addEventListener('mouseenter', () => {
      isButtonHovered = true
      clearHideTimeout() // 清除隐藏倒计时
      btn.style.opacity = '1'
      btn.style.background = 'var(--lx-bg-hover)'
      log('Button container mouseenter, locked position')
    })
    buttonContainer.addEventListener('mouseleave', () => {
      isButtonHovered = false
      startHideTimeout() // 开始隐藏倒计时
      btn.style.opacity = '0.9'
      btn.style.background = 'var(--lx-bg-panel)'
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
        const viewportWidth = viewportWidthForLayout()
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
        const dropdown = document.getElementById('lerxu-resource-dropdown')
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
    const btnInDom = document.getElementById('lerxu-bilibili-download-btn')
    log('Button in DOM:', btnInDom)
    if (btnInDom) {
      const rect = btnInDom.getBoundingClientRect()
      log('Button position:', rect)
      log('Button visible:', rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0)
    }
    updateMainButtonResourceCount()

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
        window.dispatchEvent(new Event('lerxu-get-resources'))
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
      const viewportWidth = viewportWidthForLayout()
      const viewportHeight = window.innerHeight
      const buttonWidth = 150
      const buttonHeight = 36

      // 按钮在容器上方
      let newTop = rect.top - 34
      let newRight = viewportWidth - alignRightOfContainer(container)

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

    const wrapper = document.getElementById('lerxu-bilibili-download-btn-wrapper')
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
    const viewportWidth = viewportWidthForLayout()
    const viewportHeight = window.innerHeight
    const buttonWidth = 150
    const buttonHeight = 36

    // 按钮定位在容器上方，紧贴容器顶部
    let newTop = rect.top - 34
    let newRight = viewportWidth - alignRightOfContainer(container)

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

    // 只有在有资源、嗅探器启用且不在 per-video 模式时才确保按钮可见
    if (!perVideoModeActive && sniffedResources && sniffedResources.total > 0 && videoSnifferConfig.enabled) {
      if (wrapper.style.display !== 'block') wrapper.style.display = 'block'
      if (wrapper.style.visibility !== 'visible') wrapper.style.visibility = 'visible'
    }

    // 锁定位置，防止被其他逻辑重置
    positionLocked = true
    // 锁定按钮可见状态：用户悬停过视频后，按钮一直保持显示
    buttonPinned = true

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
      if (video._lerxuHoverListenerAdded) return
      video._lerxuHoverListenerAdded = true

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
      if (container._lerxuHoverListenerAdded) return
      container._lerxuHoverListenerAdded = true

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
      const wrapper = document.getElementById('lerxu-bilibili-download-btn-wrapper')
      if (sniffedResources && sniffedResources.total > 0) {
        if (!hasBeenDragged) {
          positionLocked = false
          hoveredVideoContainer = null
          log('Container removed but keeping button due to resources')
        }
      } else if (!hasBeenDragged) {
        // 只有在没有资源且未被拖拽时才隐藏
        // 不立即隐藏，使用宽限期让用户有时间点击按钮
        startHideTimeout()
        positionLocked = false
        hoveredVideoContainer = null
        log('Container removed from DOM and no resources, scheduled hide')
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
          const wrapper = document.getElementById('lerxu-bilibili-download-btn-wrapper')
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
        // 不立即隐藏，使用宽限期让用户有时间点击按钮
        startHideTimeout()
        log('Container disconnected and no resources or user closed, scheduled hide')
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

  // ===== B站合集检测与下载合集按钮 =====

  // 检测B站合集，返回合集容器、订阅按钮和视频列表项
  const detectBilibiliCollection = () => {
    try {
      // 合集容器选择器（多种版本兼容）
      const containerSelectors = [
        '.video-pod',
        '[class*="video-pod"]',
        '.video-sections',
        '[class*="video-sections"]',
        '#multi_page .cur-list',
        '.multi-page .cur-list'
      ]

      for (const sel of containerSelectors) {
        const container = document.querySelector(sel)
        if (!container) continue

      // 查找"订阅合集"按钮
      const subscribeBtnSelectors = [
        '.subscribe-btn',
        '[class*="subscribe-btn"]',
        '[class*="blue-btn"]',
        '[class*="follow-btn"]',
        '[class*="subscribe"]',
        'button[class*="blue"]'
      ]

        let subscribeBtn = null
        for (const btnSel of subscribeBtnSelectors) {
          subscribeBtn = container.querySelector(btnSel)
          if (subscribeBtn) break
        }

      // 查找合集视频列表项：合并选择器一次查完，分类容器与视频项都会被命中，
      // 交给 extractCollectionVideos 区分并下钻 —— 分类下的视频必须都列出来
      let videoItems = container.querySelectorAll(COLLECTION_ITEM_SELECTOR)
      if (videoItems.length === 0) {
        // class 全改版时的兜底：带 BV 的 data-key 一直都在
        videoItems = container.querySelectorAll(COLLECTION_BV_SELECTOR)
      }

      // 查找合集标题
      let collectionTitle = ''
      const titleSelectors = [
        '.video-pod__header .title.jumpable',
        '.video-pod .title.jumpable',
        '.video-pod__header .title',
        '.section-title-text',
        '[class*="section-title"]',
        '[class*="collection-title"]',
        '[class*="list-title"]'
      ]
        for (const titleSel of titleSelectors) {
          const titleEl = container.querySelector(titleSel)
          if (titleEl && titleEl.textContent && titleEl.textContent.trim()) {
            collectionTitle = titleEl.textContent.trim()
            break
          }
        }

        if (subscribeBtn || videoItems.length > 0) {
          return { container, subscribeBtn, videoItems, collectionTitle, exists: true }
        }
      }
    } catch (e) {}
    return { exists: false }
  }

  /** 合集条目选择器：分类容器与视频项都可能被它命中，靠 isCollectionSectionNode 区分。 */
  const COLLECTION_ITEM_SELECTOR = '.pod-item, .video-pod__item, [class*="pod-item"], .video-section-item, [class*="section-item"], [class*="video-list-item"], [class*="episode-item"]'

  /** 视频项（带 BV 的 data-key）：比 class 稳，站点改版也不容易失效。 */
  const COLLECTION_BV_SELECTOR = '[data-key^="BV"], [data-key^="bv"]'

  /**
   * 这个元素是「分类容器」还是「视频项」？
   *
   * 合集带分类（section）时，分类容器和视频项会被同一批选择器命中：容器里只有
   * 分类名，真正的视频在它内部 —— 老代码把容器当视频提取，于是列表里只剩一条
   * 分类名、分类下的视频全丢（用户点名）。
   * 判据：自己带 BV 的 data-key 就是视频项；内部还套着 BV 项的就是分类容器。
   */
  const isCollectionSectionNode = (el) => {
    try {
      if (!el || !el.getAttribute) return false
      const own = `${el.getAttribute('data-key') || ''}`.trim()
      if (/^bv/i.test(own)) return false
      // 内部套着带 BV 的 data-key → 是分类容器
      if (el.querySelectorAll(COLLECTION_BV_SELECTOR).length > 0) return true
      // 没有 data-key 的版本：内部指向**不同** BV 才算容器
      // （视频项自己也有多个指向同一个 BV 的链接，不能只看链接个数）
      const bvs = new Set()
      el.querySelectorAll('a[href*="/video/BV"]').forEach(a => {
        const m = `${a.getAttribute('href') || ''}`.match(/BV[0-9A-Za-z]+/)
        if (m) bvs.add(m[0])
      })
      return bvs.size > 1
    } catch (e) {
      return false
    }
  }

  /** 分类名（拿不到就返回空串）。 */
  const collectionSectionTitle = (el) => {
    try {
      const selectors = [
        '.video-pod__header .title', '.video-pod__header',
        '[class*="section-title"]', '[class*="section-header"]',
        '.title-txt', '[class*="list-title"]'
      ]
      for (const sel of selectors) {
        const node = el.querySelector(sel)
        if (!node) continue
        const text = `${node.getAttribute('title') || node.textContent || ''}`.trim()
        if (text) return text.slice(0, 30)
      }
    } catch (e) {}
    return ''
  }

  /** 视频项所在的分类名（向上找最近的分类容器；没有就返回空串）。 */
  const collectionSectionAncestorTitle = (el) => {
    try {
      let node = el && el.parentElement
      let depth = 0
      while (node && depth < 6) {
        const cls = `${node.getAttribute ? (node.getAttribute('class') || '') : ''}`
        // 分类容器的 class 里带 section（合集容器 .video-pod 不带），且里面确实装着视频
        if (/section/i.test(cls) && node.querySelectorAll(COLLECTION_BV_SELECTOR).length > 0) {
          const title = collectionSectionTitle(node)
          if (title) return title
        }
        node = node.parentElement
        depth++
      }
    } catch (e) {}
    return ''
  }

  // 从合集视频列表项中提取视频信息
  // （支持「合集 → 分类 → 视频」两级结构：分类容器会被下钻，分类名记进 section）
  const extractCollectionVideos = (videoItems) => {
    const videos = []
    const seen = new Set()

    // 先摊平成一张视频项清单：分类容器下钻，并把分类名带下来
    const flat = []
    const flatten = (nodes, section) => {
      Array.prototype.forEach.call(nodes || [], el => {
        if (isCollectionSectionNode(el)) {
          const title = collectionSectionTitle(el) || section
          let inner = el.querySelectorAll(COLLECTION_BV_SELECTOR)
          if (inner.length === 0) inner = el.querySelectorAll(COLLECTION_ITEM_SELECTOR)
          flatten(inner, title)
        } else {
          // 分类名优先用下钻时带下来的；没有（视频项被顶层选择器直接命中）就向上
          // 找最近的分类容器 —— 两种情况都要能标出分类（用户点名）
          flat.push({ el, section: section || collectionSectionAncestorTitle(el) })
        }
      })
    }
    flatten(videoItems, '')

    try {
      flat.forEach(({ el: item, section }) => {
        try {
          let bvKey = ''
          let title = ''
          let duration = ''

          // 从 data-key 属性提取 BV 号
          bvKey = item.getAttribute('data-key') || ''

          // 提取标题
          const titleEl = item.querySelector('.title-txt') || item.querySelector('[title]')
          if (titleEl) {
            title = titleEl.getAttribute('title') || titleEl.textContent || ''
          }
          title = title.trim()

          // 提取时长
          const durationEl = item.querySelector('.duration') || item.querySelector('[class*="duration"]')
          if (durationEl) {
            duration = durationEl.textContent.trim()
          }

          // 构建 URL
          let url = ''
          if (bvKey && bvKey.startsWith('BV')) {
            url = `https://www.bilibili.com/video/${bvKey}`
          } else {
            // 回退：从 <a> 标签提取
            const link = item.querySelector('a[href*="/video/"], a[href*="/ep"]') || item.querySelector('a[href]')
            if (link) {
              const href = link.href || link.getAttribute('href') || ''
              if (href) {
                url = href.startsWith('http') ? href : new URL(href, window.location.origin).href
              }
            }
          }
          if (!url) return

          // 去重键统一成 BV 号（拿不到才退回 URL）：分类容器下钻和顶层列表可能
          // 命中同一个视频，键不统一就会把它收两次（用户点名要分类下的视频，不要重复）
          const bvInUrl = (url.match(/BV[0-9A-Za-z]+/) || [])[0] || ''
          const dedupKey = /^BV/i.test(bvKey) ? bvKey : (bvInUrl || url)
          if (seen.has(dedupKey)) return
          seen.add(dedupKey)

          // av 号兜底：部分老页面 / 课程页只给 av 不给 BV，只认 BV 会让这些条目
          // 静默取不到流（用户点名"选了 3 个只发出去 2 个"）
          const aidInUrl = (url.match(/\/video\/av(\d+)/i) || [])[1] || ''
          const aid = aidInUrl || (/^\d+$/.test(bvKey) ? bvKey : '')

          videos.push({
            url,
            title: title || bvKey || '未知视频',
            duration,
            // BV 兜底从地址里取：后续预取分P / 下载都靠它
            bv: /^BV/i.test(bvKey) ? bvKey : bvInUrl,
            aid,
            section
          })
        } catch (e) {}
      })
    } catch (e) {}
    return videos
  }

  // ─── B 站接口 ───

  /**
   * B 站接口里"值得重试"的返回码：限频 / 风控 / 服务繁忙。
   *
   * 合集下载会连着打好几个视频的 view + playurl（面板的"共 N P"预取也在打
   * 同一批接口），很容易撞上频率限制。以前一次失败就把这个视频**静默跳过**，
   * 用户看到的是"选了 3 个只发出去 2 个"（用户点名）。这类码是瞬态的，
   * 退避重试即可恢复；"视频不存在""无权限"之类重试也没用，直接放弃。
   */
  const BILI_TRANSIENT_CODES = [-799, -412, -509, -504, -503]

  /** 请求 B 站接口并解析 JSON；瞬态失败退避重试，重试后仍失败返回 null。 */
  const biliApiJson = async (url, attempts = 3) => {
    for (let i = 0; i < attempts; i++) {
      try {
        const resp = await fetch(url, { credentials: 'include' })
        if (resp && resp.ok) {
          const data = await resp.json()
          const code = data && typeof data.code === 'number' ? data.code : 0
          if (!BILI_TRANSIENT_CODES.includes(code)) return data
          log('bili api transient code', code, url)
        } else {
          log('bili api http error', resp && resp.status, url)
        }
      } catch (e) {
        log('bili api request error', e, url)
      }
      // 退避 400ms / 1.6s：限频通常一两秒内恢复
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 400 * (i + 1) * (i + 1)))
      }
    }
    return null
  }

  /**
   * 取流接口的 id 参数。
   *
   * 优先 BV 号；只有 av 号（部分老页面 / 课程页不给 BV）时退回 aid ——
   * 以前写死 `bvid=`，这类条目必然拿到 code != 0 而被静默跳过（用户点名）。
   */
  const biliVideoQuery = (video) => {
    try {
      const v = video || {}
      const bv = `${v.bv || ''}`.trim()
      if (/^BV/i.test(bv)) return `bvid=${encodeURIComponent(bv)}`
      const aid = `${v.aid || ''}`.trim()
      if (/^\d+$/.test(aid)) return `aid=${aid}`
      const url = `${v.url || ''}`
      const mBv = url.match(/(BV[0-9A-Za-z]{8,})/)
      if (mBv) return `bvid=${encodeURIComponent(mBv[1])}`
      const mAid = url.match(/\/video\/av(\d+)/i) || url.match(/[?&]aid=(\d+)/)
      if (mAid) return `aid=${mAid[1]}`
    } catch (e) {}
    return ''
  }

  /** 从 view 响应里取出分P 列表。 */
  const parseBiliPages = (data) => {
    const pages = data && data.data && Array.isArray(data.data.pages) ? data.data.pages : []
    return pages.map(p => ({ cid: p.cid, page: p.page || 0, part: p.part || '' }))
  }

  /** 从 playurl 响应里挑出画面流与声音流（DASH 优先 H.264，兼容旧版 durl）。 */
  const parseBiliPlayData = (streamData) => {
    const result = { videoUrl: '', audioUrl: '', videoQuality: '' }
    if (!streamData) return result
    if (streamData.dash && (streamData.dash.video || streamData.dash.audio)) {
      const videos = streamData.dash.video || []
      const audios = streamData.dash.audio || []
      const h264Videos = videos.filter(v => {
        const code = `${(v && v.codecs) || ''}`.toLowerCase()
        return code.includes('avc') || code.includes('h264')
      })
      const bestVideo = (h264Videos.length > 0 ? h264Videos : videos)[0]
      if (bestVideo) {
        result.videoUrl = bestVideo.baseUrl || bestVideo.base_url || ''
        result.videoQuality = bestVideo.id ? `${bestVideo.id}` : ''
      }
      const bestAudio = audios[0]
      if (bestAudio) {
        result.audioUrl = bestAudio.baseUrl || bestAudio.base_url || ''
      }
    } else if (streamData.durl && streamData.durl.length > 0) {
      result.videoUrl = streamData.durl[0].url || ''
    }
    return result
  }

  /**
   * 取某个 cid（分P）的播放地址。**只打 playurl 一个接口** ——
   * 分P 场景下 view 的结果调用方已经有了，再打一次纯属浪费，也更容易触发限频。
   */
  const fetchBiliPlayUrl = async (video, cid) => {
    try {
      const query = biliVideoQuery(video)
      if (!query || !cid) return null
      const data = await biliApiJson(
        `https://api.bilibili.com/x/player/playurl?${query}&cid=${cid}&qn=80&fnval=16&fnver=0&fourk=1`
      )
      if (!data || data.code !== 0 || !data.data) {
        log('Failed to get playurl for', query, 'cid', cid, data)
        return null
      }
      return parseBiliPlayData(data.data)
    } catch (e) {
      log('fetchBiliPlayUrl error for', video && video.bv, e)
      return null
    }
  }

  /**
   * 通过B站API获取视频流URL（含 cid 与分P 列表）。
   *
   * 返回 `{ title, videoUrl, audioUrl, cid, pages }`，拿不到返回 null。
   * 调用方拿到 `pages` 后，后续分P 只需 [`fetchBiliPlayUrl`]（见合集下载循环）。
   */
  const fetchBiliVideoStream = async (video, cid) => {
    try {
      const query = biliVideoQuery(video)
      if (!query) {
        log('No bilibili video id for', video && video.url)
        return null
      }
      // 1. 获取 cid 与分P 列表
      const viewData = await biliApiJson(`https://api.bilibili.com/x/web-interface/view?${query}`)
      if (!viewData || viewData.code !== 0 || !viewData.data || !viewData.data.cid) {
        log('Failed to get cid for', query, viewData)
        return null
      }
      const pages = parseBiliPages(viewData)
      const useCid = cid || viewData.data.cid
      const title = viewData.data.title || (video && video.title) || ''

      // 2. 获取播放地址（DASH 格式）
      const play = await fetchBiliPlayUrl(video, useCid)
      if (!play) return null

      return { title, videoUrl: play.videoUrl, audioUrl: play.audioUrl, cid: useCid, pages }
    } catch (e) {
      log('fetchBiliVideoStream error for', video && video.bv, e)
      return null
    }
  }

  /**
   * 只取分P 列表（面板里标"共 N P"用，不请求播放地址，省一半请求）。
   * 拿不到就返回空数组 —— 标记不显示而已，下载时还会再取一次。
   */
  const fetchBiliVideoPages = async (video) => {
    try {
      const query = biliVideoQuery(video)
      if (!query) return []
      const data = await biliApiJson(`https://api.bilibili.com/x/web-interface/view?${query}`)
      if (!data || data.code !== 0 || !data.data) return []
      return parseBiliPages(data)
    } catch (e) {
      return []
    }
  }

  // 检测合集中当前正在播放的视频BV号
  const detectCurrentPlayingBv = () => {
    try {
      const containerSelectors = ['.video-pod', '[class*="video-pod"]']
      for (const sel of containerSelectors) {
        const container = document.querySelector(sel)
        if (!container) continue
        const items = container.querySelectorAll('.pod-item, [class*="pod-item"]')
        for (const item of items) {
          // 检查 playing-gif 是否可见
          const gif = item.querySelector('.playing-gif')
          if (gif) {
            const display = window.getComputedStyle(gif).display
            if (display !== 'none') {
              return item.getAttribute('data-key') || ''
            }
          }
          // 检查 item 是否有 playing/active 类
          const cls = item.className || ''
          if (/playing|active/i.test(cls)) {
            return item.getAttribute('data-key') || ''
          }
        }
      }
    } catch (e) {}
    return ''
  }

  /**
   * 顶部悬浮导航栏在**视口坐标**里的下沿（没有则 0）。
   *
   * B 站顶栏是 fixed 的、z-index 比我们的面板高：面板一旦伸到它底下就会被吃掉半截。
   * 所以定位前先问清楚"从哪儿开始才是安全区"（用户点名要自动避让）。
   */
  const getBiliHeaderBottom = () => {
    try {
      const selectors = [
        '.bili-header', '#bili-header', '.fixed-header', '.bili-nav-header',
        '.mini-header', '.international-header'
      ]
      let bottom = 0
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          try {
            const style = window.getComputedStyle(el)
            if (!style || style.display === 'none' || style.visibility === 'hidden') return
            const pos = style.position
            // 只算会悬浮盖住内容的（fixed / sticky）；跟着文档流的顶栏挡不住面板
            if (pos !== 'fixed' && pos !== 'sticky') return
            const rect = el.getBoundingClientRect()
            if (rect.height <= 0 || rect.top > 0) return
            if (rect.bottom > bottom) bottom = rect.bottom
          } catch (e) {}
        })
      })
      return bottom
    } catch (e) {
      return 0
    }
  }

  // 显示合集下载悬浮面板
  const showCollectionDownloadDialog = (videos, collectionTitle) => {
    // 移除已存在的面板
    const existing = document.getElementById('lerxu-collection-panel')
    if (existing) existing.remove()

    // 获取下载合集按钮的位置
    const downloadBtnEl = document.getElementById('lerxu-collection-download-btn')
    let btnRect = { top: 0, right: 0, bottom: 0, left: 0, width: 0 }
    if (downloadBtnEl) {
      btnRect = downloadBtnEl.getBoundingClientRect()
    }

    // 检测当前正在播放的视频
    const currentBv = detectCurrentPlayingBv()

    // 创建悬浮面板（精简：无标题栏、无底部栏、无分割线）
    const panel = document.createElement('div')
    panel.id = 'lerxu-collection-panel'
    const pStyle = panel.style
    pStyle.position = 'absolute'
    pStyle.backgroundColor = '#fff'
    pStyle.borderRadius = '8px'
    pStyle.boxShadow = '0 2px 12px rgba(0,0,0,0.12)'
    pStyle.border = '1px solid #e8e8e8'
    pStyle.width = '300px'
    pStyle.maxWidth = '90vw'
    pStyle.maxHeight = '360px'
    pStyle.display = 'flex'
    pStyle.flexDirection = 'column'
    pStyle.overflow = 'hidden'
    // 10000：比 B 站顶栏那一档高，万一避让判定在特殊布局下失灵也不会被吃掉半截
    pStyle.zIndex = '10000'
    // 初始位置先占个位，真正的落位在 append 之后由 placePanel 统一算
    // （规则见 placePanel：向下展开 → 放不下翻上方 → 都不许伸进顶部导航栏）
    pStyle.top = '0'
    pStyle.left = '0'

    // 滚动条样式
    const scrollStyle = document.createElement('style')
    scrollStyle.textContent = `
      #lerxu-collection-panel .col-list::-webkit-scrollbar { width: 4px; }
      #lerxu-collection-panel .col-list::-webkit-scrollbar-track { background: transparent; }
      #lerxu-collection-panel .col-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 2px; }
    `
    panel.appendChild(scrollStyle)

    // 下载按钮（悬浮在顶部，无标题栏）
    const downloadBtn = document.createElement('div')
    downloadBtn.textContent = '下载选中'
    downloadBtn.style.cssText = 'margin:8px 8px 0;padding:6px 0;border:none;border-radius:6px;background:#1a7fe0;color:#fff;cursor:pointer;font-size:12px;font-weight:500;text-align:center;flex-shrink:0;'
    downloadBtn.addEventListener('mouseenter', () => { downloadBtn.style.backgroundColor = '#00b5e0' })
    downloadBtn.addEventListener('mouseleave', () => { downloadBtn.style.backgroundColor = '#1a7fe0' })
    panel.appendChild(downloadBtn)

    // 工具栏（无分割线）
    const toolbar = document.createElement('div')
    toolbar.style.cssText = 'padding:6px 10px;display:flex;align-items:center;gap:8px;flex-shrink:0;'

    const selectAllCheckbox = document.createElement('input')
    selectAllCheckbox.type = 'checkbox'
    selectAllCheckbox.checked = true
    selectAllCheckbox.style.cursor = 'pointer'

    const selectAllLabel = document.createElement('span')
    selectAllLabel.textContent = '全选'
    selectAllLabel.style.cssText = 'font-size:11px;color:#666;cursor:pointer;'

    const countSpan = document.createElement('span')
    countSpan.style.cssText = 'font-size:10px;color:#aaa;margin-left:auto;'
    countSpan.textContent = `共${videos.length}个`

    toolbar.appendChild(selectAllCheckbox)
    toolbar.appendChild(selectAllLabel)
    toolbar.appendChild(countSpan)
    panel.appendChild(toolbar)

    // 视频列表
    const listContainer = document.createElement('div')
    listContainer.className = 'col-list'
    listContainer.style.cssText = 'flex:1;overflow-y:auto;padding:2px 0;'

    const itemCheckboxes = []
    // 每行的"共 N P"标记（下标与 videos 对齐），下面异步填
    const pageMarks = []
    // 面板一关就停掉还在跑的分P 预取，别让请求打到用户已经关掉的弹窗上
    let pagesCancelled = false
    let lastSection = null
    videos.forEach((video, index) => {
      // 分类名变化时插一条小标题，分类下的视频跟在它后面 ——
      // 老版本只列出分类名、分类里的视频全丢（用户点名），现在两样都看得到
      const section = video.section || ''
      if (section !== lastSection) {
        lastSection = section
        if (section) {
          const sectionRow = document.createElement('div')
          sectionRow.textContent = section
          sectionRow.style.cssText = 'padding:6px 10px 2px;font-size:10px;color:#888;font-weight:600;'
          listContainer.appendChild(sectionRow)
        }
      }
      const isPlaying = currentBv && video.bv === currentBv
      const item = document.createElement('div')
      item.style.cssText = `display:flex;align-items:center;padding:4px 10px;cursor:pointer;${isPlaying ? 'background:#e3f2fd;' : ''}`
      item.addEventListener('mouseenter', () => { if (!isPlaying) item.style.backgroundColor = '#f7f7f7' })
      item.addEventListener('mouseleave', () => { if (!isPlaying) item.style.backgroundColor = '' })

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = true
      checkbox.style.cssText = 'margin-right:8px;cursor:pointer;flex-shrink:0;'
      itemCheckboxes.push(checkbox)

      const titleSpan = document.createElement('span')
      titleSpan.textContent = video.title
      titleSpan.style.cssText = 'flex:1;min-width:0;font-size:11px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'

      const rightSpan = document.createElement('span')
      rightSpan.style.cssText = 'flex-shrink:0;margin-left:8px;display:flex;align-items:center;gap:4px;'

      // "共 N P"：这个合集视频里还含着几个分P（下面异步补，取不到就不显示）
      const pageMark = document.createElement('span')
      pageMark.style.cssText = 'font-size:10px;color:#1a7fe0;flex-shrink:0;'
      rightSpan.appendChild(pageMark)
      pageMarks.push(pageMark)

      if (isPlaying) {
        const playingTag = document.createElement('span')
        playingTag.textContent = '▶'
        playingTag.style.cssText = 'font-size:9px;color:#1a7fe0;'
        rightSpan.appendChild(playingTag)
      }

      if (video.duration) {
        const durationSpan = document.createElement('span')
        durationSpan.textContent = video.duration
        durationSpan.style.cssText = 'font-size:10px;color:#aaa;'
        rightSpan.appendChild(durationSpan)
      }

      item.appendChild(checkbox)
      item.appendChild(titleSpan)
      item.appendChild(rightSpan)
      listContainer.appendChild(item)

      item.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked
          updateSelectAllState()
        }
      })
      checkbox.addEventListener('change', updateSelectAllState)
    })

    panel.appendChild(listContainer)
    document.body.appendChild(panel)

    /**
     * 落位：先在按钮下方展开；下方放不下就翻到按钮上方；
     * **两种都不许伸进顶部导航栏底下**（导航栏 z-index 更高，伸进去就被吃掉半截），
     * 实在放不下就压高度，而不是把面板挪到导航栏底下去（用户点名要自动避让）。
     * 面板与按钮都用文档坐标（absolute + scrollY），页面滚动时两者一起走，不会错位。
     */
    const placePanel = () => {
      try {
        const vw = window.innerWidth
        const vh = window.innerHeight
        const sx = window.scrollX || window.pageXOffset || 0
        const sy = window.scrollY || window.pageYOffset || 0
        const safeTop = getBiliHeaderBottom() + 8   // 视口坐标：安全上沿
        const safeBottom = vh - 10                  // 视口坐标：安全下沿

        // 先按可用空间收紧高度，再决定放上还是放下
        const available = Math.max(120, safeBottom - safeTop)
        panel.style.maxHeight = `${Math.min(360, available)}px`

        const width = panel.offsetWidth || 300
        const height = panel.offsetHeight || 0

        let top = btnRect.bottom + 4
        if (top + height > safeBottom) {
          const above = btnRect.top - height - 4
          top = above >= safeTop ? above : safeTop
        }
        if (top + height > safeBottom) top = Math.max(safeTop, safeBottom - height)

        let left = btnRect.right - width
        if (left + width > vw - 10) left = vw - width - 10
        if (left < 10) left = 10

        panel.style.top = `${top + sy}px`
        panel.style.left = `${left + sx}px`
      } catch (e) {}
    }
    placePanel()
    // 列表内容渲染完（异步补上的"共 N P"标记会把面板撑高）再校一次
    requestAnimationFrame(placePanel)

    // 全选逻辑
    function updateSelectAllState() {
      const checkedCount = itemCheckboxes.filter(cb => cb.checked).length
      selectAllCheckbox.checked = checkedCount === itemCheckboxes.length
      downloadBtn.textContent = `下载选中 (${checkedCount})`
      downloadBtn.style.opacity = checkedCount === 0 ? '0.5' : '1'
    }
    updateSelectAllState()

    // 一个合集视频里可能还含着多个分P（"视频里的视频"）：逐个把"共 N P"补上。
    // 串行 + 留间隔，避免一堆请求同时打 B 站接口；面板一关就停（用户点名要能处理分P）
    ;(async () => {
      for (let i = 0; i < videos.length; i++) {
        if (pagesCancelled || !panel.isConnected) return
        const pages = await fetchBiliVideoPages(videos[i])
        if (pagesCancelled || !panel.isConnected) return
        if (pages.length > 1 && pageMarks[i]) {
          pageMarks[i].textContent = `共${pages.length}P`
          pageMarks[i].title = pages.map(p => `P${p.page} ${p.part}`).join('\n')
        }
        await new Promise(r => setTimeout(r, 300))
      }
    })()

    selectAllCheckbox.addEventListener('change', () => {
      itemCheckboxes.forEach(cb => { cb.checked = selectAllCheckbox.checked })
      updateSelectAllState()
    })
    selectAllLabel.addEventListener('click', () => {
      selectAllCheckbox.checked = !selectAllCheckbox.checked
      selectAllCheckbox.dispatchEvent(new Event('change'))
    })

    // 关闭面板
    const closePanel = () => {
      pagesCancelled = true
      panel.remove()
      document.removeEventListener('click', outsideClickHandler, true)
    }

    // 点击面板外部关闭
    const outsideClickHandler = (e) => {
      if (!panel.contains(e.target) && e.target !== downloadBtnEl) {
        closePanel()
      }
    }
    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler, true)
    }, 100)

    // 下载选中按钮
    downloadBtn.addEventListener('click', async () => {
      const selectedIndices = itemCheckboxes
        .map((cb, i) => cb.checked ? i : -1)
        .filter(i => i >= 0)
      if (selectedIndices.length === 0) return

      closePanel()

      const btnTextEl = document.querySelector('#lerxu-collection-download-btn span')
      const oldText = btnTextEl ? btnTextEl.textContent : ''

      const referer = window.location.href || ''
      // 不附带 Origin：伪造 Origin 会导致 CDN/WAF 403（见 buildDownloadHeaders）
      const headers = []
      try {
        const ua = navigator.userAgent
        if (ua) headers.push(`User-Agent: ${ua}`)
      } catch (e) {}
      headers.push(`Referer: ${referer}`)
      headers.push('Accept: */*')

      let successCount = 0
      let failCount = 0
      // 失败的视频标题：收尾时如实报出来，不再让"选了 3 个只发出去 2 个"无声发生
      const failedTitles = []

      for (let i = 0; i < selectedIndices.length; i++) {
        const video = videos[selectedIndices[i]]
        if (btnTextEl) {
          btnTextEl.textContent = `获取中 ${i + 1}/${selectedIndices.length}`
        }

        // 通过B站API获取视频流URL（分P 列表也一并带回来了）
        const info = await fetchBiliVideoStream(video)

        if (!info || !info.videoUrl) {
          failCount++
          failedTitles.push(video.title || video.bv || video.url)
          log('Failed to get stream for', video.bv || video.aid || video.title)
          if (i < selectedIndices.length - 1) {
            await new Promise(r => setTimeout(r, 300))
          }
          continue
        }

        // 一个合集视频里可能还含着多个分P（"视频里的视频"）：多 P 时逐个 P 都要发，
        // 只发第一个 P 的话剩下的分P 一个都下不到（用户点名）
        const parts = info.pages && info.pages.length > 1
          ? info.pages
          : [{ cid: info.cid, page: 0, part: '' }]

        // 文件名用 view 里的标题：分P 只取了 playurl，那条结果里没有 title
        const titleBase = info.title || video.title || ''

        for (let k = 0; k < parts.length; k++) {
          const part = parts[k]
          // 首个 P 复用上面那次结果；其余 P 只打 playurl —— view 的结果已经有了，
          // 再打一次纯属浪费且更容易触发限频（用户点名"选了 3 个只发出去 2 个"）
          const stream = part.cid === info.cid ? info : await fetchBiliPlayUrl(video, part.cid)
          if (!stream || !stream.videoUrl) {
            failCount++
            failedTitles.push(`${video.title || video.bv || ''} P${part.page || 1}`)
            log('Failed to get stream for', video.bv || video.aid, 'P', part.page)
            continue
          }

          if (btnTextEl) {
            btnTextEl.textContent = parts.length > 1
              ? `下载中 ${i + 1}/${selectedIndices.length} · P${k + 1}/${parts.length}`
              : `下载中 ${i + 1}/${selectedIndices.length}`
          }

          // 多 P 时文件名带上 P 号，否则几十个分P 会互相覆盖成一个
          const partTag = part.page
            ? `_P${part.page}${part.part ? '_' + safeFilenamePart(part.part) : ''}`
            : ''

          // 这一对音视频共用一个配对 ID（与页面内嗅探走同一套协议），
          // 应用端据此把画面与声音配到一起合并（用户点名）。
          // 去重按"整对"做：只拦单条会把一对拆成一半，应用端会一直等一个不来的伙伴
          const videoUrl = stream.videoUrl || ''
          const audioUrl = stream.audioUrl || ''
          // 没有音频流就不是"一对"，按单条发（不带配对 ID）——
          // 否则应用端会一直等一个不存在的伙伴
          if (!audioUrl) {
            if (markSent(videoUrl)) {
              chrome.runtime.sendMessage({
                type: 'addUriFromContent',
                url: videoUrl,
                referer,
                headers,
                suggestedFilename: `${titleBase}${partTag}.mp4`
              }, () => {})
            }
            successCount++
            if (k < parts.length - 1) {
              await new Promise(r => setTimeout(r, 300))
            }
            continue
          }
          if (!markSent(`${videoUrl}|${audioUrl}`)) {
            if (k < parts.length - 1) {
              await new Promise(r => setTimeout(r, 300))
            }
            continue
          }
          const pairId = makePairId()

          // 发送视频流
          chrome.runtime.sendMessage({
            type: 'addUriFromContent',
            url: videoUrl,
            referer,
            headers,
            pairId,
            pairRole: PAIR_ROLE_VIDEO,
            suggestedFilename: `${titleBase}${partTag}_video.mp4`
          }, () => {})

          // 发送音频流
          await new Promise(r => setTimeout(r, 100))
          chrome.runtime.sendMessage({
            type: 'addUriFromContent',
            url: audioUrl,
            referer,
            headers,
            pairId,
            pairRole: PAIR_ROLE_AUDIO,
            suggestedFilename: `${titleBase}${partTag}_audio.m4a`
          }, () => {})

          successCount++

          if (k < parts.length - 1) {
            await new Promise(r => setTimeout(r, 300))
          }
        }

        if (i < selectedIndices.length - 1) {
          await new Promise(r => setTimeout(r, 300))
        }
      }

      if (btnTextEl) {
        // 有失败就写清楚几个失败、并把是哪些打到控制台 ——
        // 以前只写"失败 N"且 4 秒后复原，用户看到的是"选了 3 个怎么只发出去 2 个"（用户点名）。
        // 这里刻意用 console.warn 而不是 log：后者受 DEBUG 开关控制（默认关），
        // 真出问题时必须能在控制台看到到底哪个视频没发出去。
        if (failCount > 0) {
          console.warn('[Key Listener] Collection download failed for:', failedTitles)
          btnTextEl.textContent = `已发送 ${successCount}，${failCount} 个失败`
        } else {
          btnTextEl.textContent = `已发送 ${successCount} 个`
        }
        setTimeout(() => { btnTextEl.textContent = oldText }, failCount > 0 ? 8000 : 4000)
      }
    })
  }

  // 创建或更新下载合集按钮
  // 将合集下载按钮同步到"订阅合集"按钮当前的位置。
  // 布局变化（展开弹幕列表、窗口缩放、SPA 重渲染）时持续调用即可跟随。
  const syncCollectionButtonPosition = (downloadBtn, subscribeBtn) => {
    try {
      if (!downloadBtn || !downloadBtn.isConnected) return
      if (!subscribeBtn || !subscribeBtn.isConnected) return
      const rect = subscribeBtn.getBoundingClientRect()
      const scrollX = window.scrollX || window.pageXOffset || 0
      const scrollY = window.scrollY || window.pageYOffset || 0
      const btnWidth = downloadBtn.offsetWidth || 50
      downloadBtn.style.top = `${rect.top + scrollY}px`
      downloadBtn.style.left = `${Math.max(0, rect.left + scrollX - btnWidth - 4)}px`
      downloadBtn.style.height = `${rect.height - 6}px`
    } catch (e) {}
  }

  // 实时跟随循环：rAF 逐帧同步位置（弹幕列表展开动画期间也能跟随），
  // 位置无变化时跳过写入；锚点被站点重建时节流重新检测；
  // 按钮被移除时循环自动停止，页面隐藏时 rAF 由浏览器自动暂停。
  let collectionFollowRaf = 0
  let collectionFollowLast = null
  let collectionAnchorNextDetectAt = 0
  const collectionFollowLoop = () => {
    try {
      const btn = document.getElementById('lerxu-collection-download-btn')
      if (!btn || !btn.isConnected) {
        collectionFollowRaf = 0
        collectionFollowLast = null
        return
      }
      let anchor = btn._lerxuSubscribeBtn
      if ((!anchor || !anchor.isConnected) && Date.now() >= collectionAnchorNextDetectAt) {
        const { subscribeBtn } = detectBilibiliCollection()
        anchor = subscribeBtn
        btn._lerxuSubscribeBtn = anchor
        // detect 失败时节流，避免每帧做全量 DOM 查询
        collectionAnchorNextDetectAt = Date.now() + (anchor ? 0 : 1000)
      }
      if (anchor && anchor.isConnected) {
        const rect = anchor.getBoundingClientRect()
        const scrollX = window.scrollX || window.pageXOffset || 0
        const scrollY = window.scrollY || window.pageYOffset || 0
        const width = (btn._lerxuWidth = btn.offsetWidth || btn._lerxuWidth || 50)
        const next = {
          top: rect.top + scrollY,
          left: Math.max(0, rect.left + scrollX - width - 4),
          height: rect.height - 6
        }
        const last = collectionFollowLast
        if (!last || last.top !== next.top || last.left !== next.left || last.height !== next.height) {
          btn.style.top = `${next.top}px`
          btn.style.left = `${next.left}px`
          btn.style.height = `${next.height}px`
          collectionFollowLast = next
        }
      }
    } catch (e) {}
    if (collectionFollowRaf) {
      collectionFollowRaf = requestAnimationFrame(collectionFollowLoop)
    }
  }
  const ensureCollectionFollowRunning = () => {
    if (!collectionFollowRaf) {
      collectionFollowRaf = requestAnimationFrame(collectionFollowLoop)
    }
  }

  const ensureCollectionDownloadButton = () => {
    try {
      const { subscribeBtn, videoItems, collectionTitle, exists } = detectBilibiliCollection()

      const existingBtn = document.getElementById('lerxu-collection-download-btn')

      if (!exists || !subscribeBtn) {
        // 没有合集，移除已存在的按钮
        if (existingBtn) {
          existingBtn.remove()
          log('Collection download button removed (no collection found)')
        }
        return
      }

      // 如果已经存在且未变化，不重复创建，但仍要同步位置并确保跟随循环在跑
      // （打开弹幕列表等布局变化会把合集组件顶下去，按钮需跟随）
      if (existingBtn && existingBtn.getAttribute('data-collection-title') === collectionTitle) {
        existingBtn._lerxuSubscribeBtn = subscribeBtn
        syncCollectionButtonPosition(existingBtn, subscribeBtn)
        ensureCollectionFollowRunning()
        return
      }

      // 如果已存在但合集变了，先移除
      if (existingBtn) {
        existingBtn.remove()
      }

      // 创建全新的下载按钮（独立元素，不插入Vue管理的DOM，避免干扰B站渲染）
      const downloadBtn = document.createElement('div')
      downloadBtn.id = 'lerxu-collection-download-btn'
      downloadBtn.setAttribute('data-collection-title', collectionTitle || '')
      downloadBtn.setAttribute('data-lerxu-btn', 'collection-download')

      // 创建按钮内容
      const btnText = document.createElement('span')
      btnText.textContent = '下载合集'
      btnText.style.cssText = 'pointer-events:none;'
      downloadBtn.appendChild(btnText)

      // 从订阅按钮复制视觉样式（只复制外观）
      try {
        const computed = window.getComputedStyle(subscribeBtn)
        const visualStyles = [
          'border', 'border-radius',
          'background', 'background-color', 'color', 'font-size', 'font-weight',
          'font-family', 'box-sizing',
          'white-space', 'user-select',
          'box-shadow', 'transition'
        ]
        visualStyles.forEach(prop => {
          const val = computed.getPropertyValue(prop)
          if (val) downloadBtn.style.setProperty(prop, val)
        })
      } catch (e) {}

      // 独立定位，追加到document.body，不触碰Vue管理的DOM
      downloadBtn.style.position = 'absolute'
      downloadBtn.style.zIndex = '100'
      downloadBtn.style.cursor = 'pointer'
      downloadBtn.style.display = 'flex'
      downloadBtn.style.alignItems = 'center'
      downloadBtn.style.justifyContent = 'center'
      // 减少高度和宽度
      downloadBtn.style.padding = '2px 8px'
      downloadBtn.style.minWidth = '0'
      document.body.appendChild(downloadBtn)

      // 使用 absolute 定位（跟随页面滚动，不干扰 Vue DOM），保存锚点
      // 引用并启动实时跟随循环（弹幕列表展开等布局变化）
      downloadBtn._lerxuSubscribeBtn = subscribeBtn
      syncCollectionButtonPosition(downloadBtn, subscribeBtn)
      ensureCollectionFollowRunning()

      log('Collection download button created (fixed), collection:', collectionTitle)

      // 点击事件：弹出/关闭合集下载弹窗（切换）
      downloadBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // 如果面板已存在，关闭它（切换关闭）
        const existingPanel = document.getElementById('lerxu-collection-panel')
        if (existingPanel) {
          existingPanel.remove()
          return
        }

        try {
          // 重新检测合集（确保最新）
          const { videoItems: items, collectionTitle: title } = detectBilibiliCollection()
          const videos = extractCollectionVideos(items)

          if (videos.length === 0) {
            log('No videos found in collection')
            const oldText = btnText.textContent
            btnText.textContent = '未找到视频'
            downloadBtn.style.opacity = '0.6'
            setTimeout(() => {
              btnText.textContent = oldText
              downloadBtn.style.opacity = ''
            }, 2000)
            return
          }

          log(`Found ${videos.length} videos in collection, showing dialog`)

          // 弹出下载弹窗
          showCollectionDownloadDialog(videos, title)

        } catch (err) {
          log('Collection download error:', err)
          btnText.textContent = '打开失败'
          downloadBtn.style.opacity = ''
          setTimeout(() => {
            btnText.textContent = '下载合集'
          }, 2000)
        }
      })

    } catch (e) {
      log('ensureCollectionDownloadButton error:', e)
    }
  }

  // 定期检测B站合集（B站是SPA，需要持续检测）
  let collectionCheckTimer = null
  const startCollectionCheck = () => {
    if (collectionCheckTimer) clearInterval(collectionCheckTimer)
    // 每3秒检查一次
    collectionCheckTimer = setInterval(() => {
      try {
        const host = (window.location.hostname || '').toLowerCase()
        if (host.includes('bilibili.com') || host.includes('b23.tv')) {
          ensureCollectionDownloadButton()
        }
      } catch (e) {}
    }, 3000)
    // 首次立即检测
    setTimeout(() => {
      try {
        const host = (window.location.hostname || '').toLowerCase()
        if (host.includes('bilibili.com') || host.includes('b23.tv')) {
          ensureCollectionDownloadButton()
        }
      } catch (e) {}
    }, 1000)
  }

  // 启动合集检测
  startCollectionCheck()

  // 监听URL变化（B站SPA导航）
  let lastCollectionUrl = ''
  setInterval(() => {
    try {
      const href = window.location.href || ''
      if (href !== lastCollectionUrl) {
        lastCollectionUrl = href
        // URL变化后延迟检测合集
        setTimeout(() => {
          const host = (window.location.hostname || '').toLowerCase()
          if (host.includes('bilibili.com')) {
            ensureCollectionDownloadButton()
          }
        }, 1500)
      }
    } catch (e) {}
  }, 1000)
}
})()
