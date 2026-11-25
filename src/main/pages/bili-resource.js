(function () {
  'use strict'

  const { ipcRenderer } = require('electron')

  const token = new URLSearchParams(window.location.search).get('token') || ''
  const $ = (id) => document.getElementById(id)
  const MERGE_FORMATS = ['mp4', 'mkv', 'ts']

  const state = {
    mergeFormat: 'mp4',
    videoGroups: [],
    videoGroupIndex: 0,
    videoStreamIndex: 0,
    audioGroups: [],
    audioGroupIndex: 0,
    audioStreamIndex: 0,
    duration: 0,
    metaParts: [],
    submitting: false
  }

  function formatDuration (seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const mm = h > 0 ? `${m}`.padStart(2, '0') : `${m}`
    const ss = `${s}`.padStart(2, '0')
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  }

  function formatBitrate (bps) {
    const value = Number(bps) || 0
    if (value <= 0) {
      return ''
    }
    const mbps = value / 1000000
    return `${mbps >= 10 ? mbps.toFixed(1) : mbps.toFixed(2)} Mbps`
  }

  function formatBytes (bytes) {
    const value = Number(bytes) || 0
    if (value <= 0) {
      return ''
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = value
    let unit = 0
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024
      unit++
    }
    const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2
    return `${size.toFixed(digits)} ${units[unit]}`
  }

  function qualityLabel (item) {
    return `${(item && item.qualityName) || ''}`.replace(/\s*·.*$/, '').trim() || '未知画质'
  }

  function streamDetail (item) {
    const parts = []
    if (item.width && item.height) {
      parts.push(`${item.width}×${item.height}`)
    }
    if (item.frameRate) {
      parts.push(`${item.frameRate}fps`)
    }
    return parts.join(' · ') || '—'
  }

  function codecDetail (item) {
    const bitrate = formatBitrate(item.bandwidth)
    return `${item.codecName || '未知编码'}${bitrate ? ` · ${bitrate}` : ''}`
  }

  function groupStreams (list) {
    const groups = []
    const index = new Map()
    list.forEach((stream) => {
      const id = Number(stream.id) || 0
      if (!index.has(id)) {
        index.set(id, groups.length)
        groups.push({
          id,
          title: qualityLabel(stream),
          streams: []
        })
      }
      groups[index.get(id)].streams.push(stream)
    })
    return groups
  }

  // ── 自绘下拉（不用系统 select） ──
  const selectState = new Map()
  const selectMenu = $('globalSelectMenu')
  let openSelectId = ''
  let selectMenuHideTimer = 0

  function initSelect (id, onChange) {
    const root = $(id)
    const trigger = root.querySelector('.lx-select-trigger')
    const valueEl = root.querySelector('.lx-select-value')
    const item = { root, trigger, valueEl, items: [], index: 0, disabled: false, onChange }
    selectState.set(id, item)
    trigger.addEventListener('click', (event) => {
      event.stopPropagation()
      if (item.disabled) {
        return
      }
      if (openSelectId === id) {
        closeSelectMenu()
        return
      }
      openSelectMenu(id)
    })
  }

  function setSelectOptions (id, items, selectedIndex) {
    const item = selectState.get(id)
    if (!item) {
      return
    }
    item.items = Array.isArray(items) ? items : []
    const max = Math.max(0, item.items.length - 1)
    item.index = Math.min(Math.max(Number(selectedIndex) || 0, 0), max)
    item.valueEl.textContent = item.items[item.index] ? item.items[item.index].label : '—'
    if (openSelectId === id) {
      renderSelectMenu(id)
    }
  }

  function setSelectDisabled (id, disabled) {
    const item = selectState.get(id)
    if (!item) {
      return
    }
    item.disabled = !!disabled
    item.root.classList.toggle('disabled', item.disabled)
    item.trigger.disabled = item.disabled
    if (item.disabled && openSelectId === id) {
      closeSelectMenu()
    }
  }

  function positionSelectMenu (item) {
    const rect = item.trigger.getBoundingClientRect()
    const width = Math.max(rect.width, 140)
    selectMenu.style.width = `${width}px`
    selectMenu.style.left = '0px'
    selectMenu.style.top = '0px'
    const height = selectMenu.offsetHeight
    let left = Math.min(rect.left, window.innerWidth - width - 8)
    if (left < 8) {
      left = 8
    }
    let top = rect.bottom + 4
    let dropUp = false
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 4)
      dropUp = true
    }
    selectMenu.classList.toggle('drop-up', dropUp)
    selectMenu.style.left = `${left}px`
    selectMenu.style.top = `${top}px`
  }

  function renderSelectMenu (id) {
    const item = selectState.get(id)
    if (!item) {
      return
    }
    if (selectMenuHideTimer) {
      clearTimeout(selectMenuHideTimer)
      selectMenuHideTimer = 0
    }
    selectMenu.textContent = ''
    item.items.forEach((option, index) => {
      const row = document.createElement('div')
      row.className = `lx-select-option${index === item.index ? ' selected' : ''}`

      const label = document.createElement('span')
      label.textContent = option.label
      row.appendChild(label)

      if (index === item.index) {
        const check = document.createElement('span')
        check.className = 'lx-select-check'
        check.textContent = '✓'
        row.appendChild(check)
      }

      row.addEventListener('click', (event) => {
        event.stopPropagation()
        item.index = index
        item.valueEl.textContent = option.label
        closeSelectMenu()
        if (typeof item.onChange === 'function') {
          item.onChange(index)
        }
      })
      selectMenu.appendChild(row)
    })
    selectMenu.hidden = false
    selectMenu.classList.remove('open')
    // 先以隐藏态（opacity 0 + 下移）完成测量与定位，再在下一帧进入，
    // 否则同一次样式计算里会直接从 open 态开始，看不到动画
    positionSelectMenu(item)
    void selectMenu.offsetHeight
    requestAnimationFrame(() => {
      if (openSelectId === id) {
        selectMenu.classList.add('open')
      }
    })
  }

  function openSelectMenu (id) {
    closeSelectMenu(true)
    const item = selectState.get(id)
    if (!item || item.disabled || item.items.length === 0) {
      return
    }
    openSelectId = id
    item.root.classList.add('open')
    renderSelectMenu(id)
  }

  function closeSelectMenu (immediate = false) {
    if (selectMenuHideTimer) {
      clearTimeout(selectMenuHideTimer)
      selectMenuHideTimer = 0
    }
    if (!openSelectId && selectMenu.hidden) {
      return
    }
    if (openSelectId) {
      const item = selectState.get(openSelectId)
      if (item) {
        item.root.classList.remove('open')
      }
      openSelectId = ''
    }
    selectMenu.classList.remove('open')
    if (immediate) {
      selectMenu.hidden = true
      selectMenu.classList.remove('drop-up')
      return
    }
    // 等淡出动画结束再真正隐藏（140ms + 一点余量）
    selectMenuHideTimer = setTimeout(() => {
      selectMenuHideTimer = 0
      if (!openSelectId) {
        selectMenu.hidden = true
        selectMenu.classList.remove('drop-up')
      }
    }, 170)
  }

  function setFormError (message) {
    const el = $('formError')
    if (!message) {
      el.hidden = true
      el.textContent = ''
      return
    }
    el.textContent = message
    el.hidden = false
  }

  function showError (message) {
    $('loading').hidden = true
    $('form').hidden = true
    $('error').textContent = message
    $('error').hidden = false
    $('submitBtn').disabled = true
  }

  function selectedVideoStream () {
    const group = state.videoGroups[state.videoGroupIndex]
    if (!group) {
      return null
    }
    return group.streams[state.videoStreamIndex] || group.streams[0] || null
  }

  function selectedAudioStream () {
    const group = state.audioGroups[state.audioGroupIndex]
    if (!group) {
      return null
    }
    return group.streams[state.audioStreamIndex] || group.streams[0] || null
  }

  /** 预计下载大小：接口带宽 × 时长（视频 + 音频），只用于展示，标“约”。 */
  function updateDownloadSummary () {
    const video = selectedVideoStream()
    const audio = selectedAudioStream()
    const duration = Number(state.duration) || 0
    const videoBps = Number(video && video.bandwidth) || 0
    const audioBps = audio ? Number(audio.bandwidth) || 0 : 0
    const bytes = duration > 0 && (videoBps + audioBps) > 0
      ? ((videoBps + audioBps) * duration) / 8
      : 0
    const sizeText = formatBytes(bytes)
    $('videoSize').textContent = sizeText ? `· 约 ${sizeText}` : ''
  }

  function updateVideoHints () {
    const stream = selectedVideoStream()
    if (!stream) {
      return
    }
    $('qualityHint').textContent = streamDetail(stream)
    $('codecHint').textContent = codecDetail(stream)
    updateDownloadSummary()
  }

  function updateAudioHints () {
    const stream = selectedAudioStream()
    if (!stream) {
      $('audioHint').textContent = '该视频没有独立音频流'
      $('audioCodecHint').textContent = '将只下载视频'
      return
    }
    $('audioHint').textContent = formatBitrate(stream.bandwidth) || '—'
    $('audioCodecHint').textContent = codecDetail(stream)
    updateDownloadSummary()
  }

  function renderVideoCodecs (preferAvc) {
    const group = state.videoGroups[state.videoGroupIndex]
    if (!group) {
      setSelectOptions('videoCodecSelect', [{ label: '—' }], 0)
      setSelectDisabled('videoCodecSelect', true)
      updateVideoHints()
      return
    }
    const items = group.streams.map((stream) => ({ label: stream.codecName || '未知编码' }))
    let index = 0
    if (preferAvc) {
      const avc = group.streams.findIndex((stream) => Number(stream.codecid) === 7)
      index = avc >= 0 ? avc : 0
    } else {
      index = Math.min(state.videoStreamIndex, group.streams.length - 1)
    }
    state.videoStreamIndex = index
    setSelectOptions('videoCodecSelect', items, index)
    setSelectDisabled('videoCodecSelect', group.streams.length <= 1)
    updateVideoHints()
  }

  function renderAudioCodecs () {
    const group = state.audioGroups[state.audioGroupIndex]
    if (!group) {
      setSelectOptions('audioCodecSelect', [{ label: '—' }], 0)
      setSelectDisabled('audioCodecSelect', true)
      updateAudioHints()
      return
    }
    const items = group.streams.map((stream) => ({ label: stream.codecName || '未知编码' }))
    state.audioStreamIndex = Math.min(state.audioStreamIndex, group.streams.length - 1)
    setSelectOptions('audioCodecSelect', items, state.audioStreamIndex)
    setSelectDisabled('audioCodecSelect', group.streams.length <= 1)
    updateAudioHints()
  }

  function renderVideoQuality () {
    setSelectOptions(
      'qualitySelect',
      state.videoGroups.map((group) => ({ label: group.title })),
      state.videoGroupIndex
    )
    setSelectDisabled('qualitySelect', state.videoGroups.length <= 1)
    renderVideoCodecs(true)
  }

  function renderAudioQuality () {
    if (state.audioGroups.length === 0) {
      setSelectOptions('audioSelect', [{ label: '无独立音频流' }], 0)
      setSelectDisabled('audioSelect', true)
      renderAudioCodecs()
      return
    }
    setSelectOptions(
      'audioSelect',
      state.audioGroups.map((group) => ({ label: group.title })),
      state.audioGroupIndex
    )
    setSelectDisabled('audioSelect', state.audioGroups.length <= 1)
    renderAudioCodecs()
  }

  function render (data) {
    const payload = data && data.payload
    if (!payload || !Array.isArray(payload.videos) || payload.videos.length === 0) {
      showError('没有可用的视频流，请在网页上重新点击下载')
      return
    }

    state.mergeFormat = MERGE_FORMATS.includes(`${data.mergeFormat || ''}`)
      ? data.mergeFormat
      : 'mp4'

    // 与进度窗一致：macOS（hiddenInset）始终画 26px 标题栏；其它平台
    // 只在隐藏应用菜单（frameless）时才画，否则用系统原生标题栏
    if (data.isMac || data.customFrame) {
      document.body.classList.add('show-title-bar')
    }
    // macOS 且保留系统红绿灯（hiddenInset）时才走进度窗那种"标题右对齐、
    // 隐藏自绘按钮"的形态；frameless 时没有红绿灯，必须留自绘的最小化/关闭
    if (data.isMac && !data.customFrame) {
      document.body.classList.add('mac')
    }

    // 标题栏只写动作名，视频标题放到下方封面信息里，避免两处重复
    $('windowTitle').textContent = '下载视频'
    document.title = '下载视频'

    $('videoTitle').textContent = payload.title || 'B 站视频'
    state.duration = Number(payload.duration) || 0
    state.metaParts = []
    if (payload.owner) {
      state.metaParts.push(payload.owner)
    }
    if (state.duration > 0) {
      state.metaParts.push(`时长 ${formatDuration(state.duration)}`)
    }
    if (Number(payload.pageCount) > 1) {
      state.metaParts.push(`P${payload.page}/${payload.pageCount}`)
    }
    $('videoMeta').textContent = state.metaParts.join(' · ') || 'B 站视频'

    const thumbWrap = $('videoThumbWrap')
    const thumb = $('videoThumb')
    const cover = `${payload.cover || ''}`.trim()
    if (cover) {
      thumb.addEventListener('error', () => {
        thumb.hidden = true
        thumbWrap.classList.add('empty')
      }, { once: true })
      thumb.src = cover
    } else {
      thumb.hidden = true
      thumbWrap.classList.add('empty')
    }

    const videos = payload.videos.filter((item) => item && item.url)
    const audios = Array.isArray(payload.audios) ? payload.audios.filter((item) => item && item.url) : []
    state.videoGroups = groupStreams(videos)
    state.audioGroups = groupStreams(audios)
    if (state.videoGroups.length === 0) {
      showError('没有可用的视频流，请在网页上重新点击下载')
      return
    }

    state.videoGroupIndex = 0
    state.videoStreamIndex = 0
    const preferredAudio = state.audioGroups.findIndex((group) => Number(group.id) === 30280)
    state.audioGroupIndex = preferredAudio >= 0 ? preferredAudio : 0
    state.audioStreamIndex = 0

    setSelectOptions(
      'mergeFormat',
      MERGE_FORMATS.map((format) => ({ label: format.toUpperCase() })),
      MERGE_FORMATS.indexOf(state.mergeFormat)
    )
    setSelectDisabled('mergeFormat', MERGE_FORMATS.length <= 1)

    renderVideoQuality()
    renderAudioQuality()

    $('loading').hidden = true
    $('error').hidden = true
    $('form').hidden = false
    $('submitBtn').disabled = false
  }

  async function submit () {
    if (state.submitting) {
      return
    }
    setFormError('')
    closeSelectMenu()
    const video = selectedVideoStream()
    if (!video || !video.url) {
      setFormError('请选择清晰度')
      return
    }
    const audio = selectedAudioStream()

    const selection = {
      video: {
        url: video.url,
        codecs: video.codecs || '',
        codecid: Number(video.codecid) || 0
      },
      audio: audio
        ? {
          url: audio.url,
          codecs: audio.codecs || '',
          codecid: Number(audio.codecid) || 0
        }
        : null,
      mergeFormat: state.mergeFormat
    }

    state.submitting = true
    const btn = $('submitBtn')
    btn.disabled = true
    btn.textContent = '正在加入…'

    try {
      const res = await ipcRenderer.invoke('bili-resource:submit', { token, selection })
      if (!res || !res.ok) {
        setFormError((res && res.error) || '加入下载任务失败')
        state.submitting = false
        btn.disabled = false
        btn.textContent = '开始下载'
        return
      }
      btn.textContent = '已加入下载任务'
      setTimeout(() => window.close(), 500)
    } catch (err) {
      setFormError(err && err.message ? err.message : '加入下载任务失败')
      state.submitting = false
      btn.disabled = false
      btn.textContent = '开始下载'
    }
  }

  async function boot () {
    if (!token) {
      showError('资源已失效，请在网页上重新点击下载')
      return
    }
    try {
      const data = await ipcRenderer.invoke('bili-resource:get', token)
      if (!data) {
        showError('资源已失效，请在网页上重新点击下载')
        return
      }
      render(data)
    } catch (err) {
      showError(err && err.message ? err.message : '读取资源失败')
    }
  }

  initSelect('qualitySelect', (index) => {
    state.videoGroupIndex = index
    setFormError('')
    renderVideoCodecs(true)
  })
  initSelect('videoCodecSelect', (index) => {
    state.videoStreamIndex = index
    setFormError('')
    updateVideoHints()
  })
  initSelect('audioSelect', (index) => {
    state.audioGroupIndex = index
    state.audioStreamIndex = 0
    setFormError('')
    renderAudioCodecs()
  })
  initSelect('audioCodecSelect', (index) => {
    state.audioStreamIndex = index
    setFormError('')
    updateAudioHints()
  })
  initSelect('mergeFormat', (index) => {
    state.mergeFormat = MERGE_FORMATS[index] || 'mp4'
    setFormError('')
  })

  let currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'

  function applyTheme (theme) {
    if (!theme || theme === currentTheme) {
      return
    }
    currentTheme = theme
    // 主题类挂在 <html> 上，首帧主题脚本与这里共用同一个开关
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }

  // 独立窗口不在主窗口的广播列表里：主动向主进程要一次当前主题，
  // 并定时轮询 —— 主程序切换浅色/深色后这里能实时跟上。
  async function syncCurrentTheme () {
    try {
      const result = await ipcRenderer.invoke('bili-resource:theme')
      if (result && result.theme) {
        applyTheme(result.theme)
      }
    } catch (e) {}
  }

  ipcRenderer.on('sync-theme', (_event, data) => {
    applyTheme(data && data.theme)
  })
  syncCurrentTheme()
  setInterval(syncCurrentTheme, 600)

  $('submitBtn').addEventListener('click', submit)
  $('minBtn').addEventListener('click', () => ipcRenderer.send('minimize-progress-window'))
  $('closeBtn').addEventListener('click', () => ipcRenderer.send('close-progress-window'))

  document.addEventListener('click', () => closeSelectMenu())
  document.querySelector('.content').addEventListener('scroll', () => closeSelectMenu())
  window.addEventListener('blur', () => closeSelectMenu())
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return
    }
    if (openSelectId) {
      closeSelectMenu()
      return
    }
    window.close()
  })

  boot()
})()
