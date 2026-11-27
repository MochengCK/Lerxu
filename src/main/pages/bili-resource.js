(function () {
  'use strict'

  const { ipcRenderer } = require('electron')

  const token = new URLSearchParams(window.location.search).get('token') || ''
  const $ = (id) => document.getElementById(id)
  const MERGE_FORMATS = ['mp4', 'mkv', 'flv', 'ts']

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
    // 番剧：整季的集数元信息 + 当前勾选的 epId（只在这类资源窗里用）
    isBangumi: false,
    // 直播：脚本窗口只负责选清晰度并开始录制（不显示音频/合并格式）
    isLive: false,
    episodes: [],
    selectedEpisodeIds: new Set(),
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
    resizeWindowToContent()
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

  /** 集数关卡：与左侧标题融为一体，显示为「集数（已选/总数）」。 */
  function updateEpisodeHint () {
    const total = state.episodes.length
    const selected = state.selectedEpisodeIds.size
    $('episodeHint').textContent = total > 0 ? `（${selected}/${total}）` : ''
    const all = $('episodeAll')
    if (all) {
      all.checked = total > 0 && selected === total
      all.indeterminate = selected > 0 && selected < total
    }
  }

  /** 番剧资源窗：渲染整季集数并默认勾选当前正在看的那一集。 */
  function renderEpisodes (payload) {
    state.isBangumi = `${(payload && payload.kind) || ''}` === 'bangumi'
    state.episodes = state.isBangumi && Array.isArray(payload.episodes) ? payload.episodes : []
    state.selectedEpisodeIds = new Set()
    const block = $('episodeBlock')
    const list = $('episodeList')
    list.textContent = ''
    if (!state.isBangumi || state.episodes.length === 0) {
      block.hidden = true
      return
    }
    block.hidden = false
    const currentId = `${(payload && payload.currentEpId) || ''}`
    state.episodes.forEach((ep) => {
      const row = document.createElement('label')
      row.className = 'episode-item'

      const checkCell = document.createElement('span')
      checkCell.className = 'episode-check'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'lx-checkbox'
      checkbox.checked = `${ep.epId}` === currentId
      if (checkbox.checked) {
        state.selectedEpisodeIds.add(`${ep.epId}`)
      }
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.selectedEpisodeIds.add(`${ep.epId}`)
        } else {
          state.selectedEpisodeIds.delete(`${ep.epId}`)
        }
        updateEpisodeHint()
        updateDownloadSummary()
      })
      checkCell.appendChild(checkbox)

      const indexCell = document.createElement('span')
      indexCell.className = 'episode-col-index'
      indexCell.textContent = ep.title || `第${ep.index || ''}集`

      const titleCell = document.createElement('span')
      titleCell.className = 'episode-col-title'
      titleCell.textContent = ep.longTitle || '—'
      if (ep.longTitle) {
        titleCell.title = ep.longTitle
      }

      const durationCell = document.createElement('span')
      durationCell.className = 'episode-col-duration'
      durationCell.textContent = Number(ep.duration) > 0 ? formatDuration(ep.duration) : ''

      row.appendChild(checkCell)
      row.appendChild(indexCell)
      row.appendChild(titleCell)
      row.appendChild(durationCell)
      list.appendChild(row)
    })
    // 当前集不在清单里（接口没回这个 ep）→ 默认勾第一集，保证能直接下载
    if (state.selectedEpisodeIds.size === 0 && state.episodes.length > 0) {
      state.selectedEpisodeIds.add(`${state.episodes[0].epId}`)
      const first = list.querySelector('input[type="checkbox"]')
      if (first) {
        first.checked = true
      }
    }
    updateEpisodeHint()
    // 长篇连载（上千集）时当前集可能在列表深处：滚到它，别让用户自己找
    const checked = list.querySelector('input[type="checkbox"]:checked')
    const checkedRow = checked && checked.closest ? checked.closest('.episode-item') : null
    if (checkedRow && checkedRow.scrollIntoView) {
      checkedRow.scrollIntoView({ block: 'nearest' })
    }
  }

  /** 已选集数的总时长：预计大小按它算，多集时不再只按当前集。 */
  function selectedEpisodeDuration () {
    if (!state.isBangumi) {
      return Number(state.duration) || 0
    }
    let total = 0
    state.selectedEpisodeIds.forEach((epId) => {
      const ep = state.episodes.find(item => `${item.epId}` === epId)
      total += Number(ep && ep.duration) || 0
    })
    return total
  }

  /**
   * 让窗口高度贴合内容：外层永远不出现滚动条，只有集数表自己滚。
   *
   * 不能用 `content.scrollHeight`：`.content` 是 `flex: 1`，窗口偏矮时
   * 它会被拉成窗口高度，算出来永远缩不回去。这里按"当前可见区块 +
   * 标题栏 + 页脚 + 内边距"实际高度求和。
   */
  function resizeWindowToContent () {
    requestAnimationFrame(() => {
      try {
        const titleBar = $('titleBar')
        const titleH = titleBar && getComputedStyle(titleBar).display !== 'none'
          ? titleBar.offsetHeight
          : 0
        const content = document.querySelector('.content')
        const footer = document.querySelector('.footer')
        let inner = 0
        const form = $('form')
        const loading = $('loading')
        const error = $('error')
        if (form && !form.hidden) {
          inner = form.offsetHeight
        } else if (error && !error.hidden) {
          inner = error.offsetHeight
        } else if (loading && !loading.hidden) {
          inner = loading.offsetHeight
        }
        let pad = 0
        if (content) {
          const style = getComputedStyle(content)
          pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
        }
        const height = Math.ceil(titleH + pad + inner + (footer ? footer.offsetHeight : 0))
        if (height > 0) {
          ipcRenderer.send('bili-resource:resize', height)
        }
      } catch (e) {}
    })
  }

  /** 单条流的字节数：优先用嗅探得到的真实大小，其次按带宽 × 时长估算。 */
  function streamBytes (stream, duration) {
    const size = Number(stream && stream.size) || 0
    if (size > 0) return size
    const bandwidth = Number(stream && stream.bandwidth) || 0
    return bandwidth > 0 && duration > 0 ? (bandwidth * duration) / 8 : 0
  }

  /** 预计下载大小：真实大小优先，没有就按带宽 × 时长估算（视频 + 音频）。 */
  function updateDownloadSummary () {
    const video = selectedVideoStream()
    const audio = selectedAudioStream()
    const duration = selectedEpisodeDuration()
    const bytes = streamBytes(video, duration) + streamBytes(audio, duration)
    const sizeText = formatBytes(bytes)
    $('videoSize').textContent = sizeText ? `· 约 ${sizeText}` : ''
  }

  /** 画面流的容器是不是通常已自带音轨（单文件视频 / HLS 清单）。 */
  function videoHasEmbeddedAudio (stream) {
    const ext = `${(stream && stream.ext) || ''}`.toLowerCase()
    if (!ext) return false
    return ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'ts', 'm2ts', 'mts', '3gp', 'ogv', 'm4v', 'm3u8'].includes(ext)
  }

  function updateAudioHints () {
    const stream = selectedAudioStream()
    if (!stream) {
      // 单文件视频（嗅探到的 mp4 / HLS）本身就有声音，别让「将只下载视频」
      // 看起来像丢音轨；真正的纯画面流（DASH 分离流）才提示只下画面。
      const embedded = videoHasEmbeddedAudio(selectedVideoStream())
      $('audioHint').textContent = embedded ? '音频已包含在视频文件中' : '该视频没有独立音频流'
      $('audioCodecHint').textContent = embedded ? '无需单独下载音频' : '将只下载视频'
    } else {
      // 副标题只解释选项含义，不重复选择框里的档位 / 编码
      $('audioHint').textContent = '码率越高，声音细节越多'
      $('audioCodecHint').textContent = 'AAC 兼容性最好'
    }
    updateDownloadSummary()
  }

  function renderVideoCodecs (preferAvc) {
    const group = state.videoGroups[state.videoGroupIndex]
    if (!group) {
      setSelectOptions('videoCodecSelect', [{ label: '—' }], 0)
      setSelectDisabled('videoCodecSelect', true)
      updateDownloadSummary()
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
    updateDownloadSummary()
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
    const isBangumi = `${payload.kind || ''}` === 'bangumi'
    const isLive = `${payload.kind || ''}` === 'live'
    state.isLive = isLive
    const actionTitle = isLive ? '录制直播' : isBangumi ? '下载剧集' : '下载视频'
    $('windowTitle').textContent = actionTitle
    document.title = actionTitle

    $('videoTitle').textContent = payload.title || (isLive ? '直播' : isBangumi ? '番剧' : '视频')
    state.duration = Number(payload.duration) || 0
    state.metaParts = []
    if (payload.owner) {
      state.metaParts.push(payload.owner)
    }
    if (isLive) {
      state.metaParts.push('直播')
    } else if (isBangumi && Array.isArray(payload.episodes) && payload.episodes.length > 0) {
      state.metaParts.push(`共 ${payload.episodes.length} 集`)
    } else {
      if (state.duration > 0) {
        state.metaParts.push(`时长 ${formatDuration(state.duration)}`)
      }
      if (Number(payload.pageCount) > 1) {
        state.metaParts.push(`P${payload.page}/${payload.pageCount}`)
      }
    }
    $('videoMeta').textContent = state.metaParts.join(' · ') || (isLive ? '直播' : isBangumi ? '番剧' : '视频')

    // 直播只选清晰度：音频随流、录制产物也不做合并
    $('audioQualityRow').hidden = isLive
    $('audioCodecRow').hidden = isLive
    $('mergeFormatRow').hidden = isLive
    $('qualityTitle').textContent = '清晰度'
    $('videoCodecTitle').textContent = isLive ? '流格式' : '视频编码'
    $('codecHint').textContent = isLive ? '由站点提供的直播流格式' : 'AVC 兼容性更好，AV1 体积更小'
    $('submitBtn').textContent = isLive ? '开始录制' : '开始下载'

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

    // 必须在画质/大小提示之前：集数决定「已选时长」，预计大小按它算
    renderEpisodes(payload)

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
    resizeWindowToContent()
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
    const audio = state.isLive ? null : selectedAudioStream()

    let selection
    if (state.isBangumi) {
      const episodeIds = Array.from(state.selectedEpisodeIds)
      if (episodeIds.length === 0) {
        setFormError('请选择要下载的集数')
        return
      }
      // 番剧：只带"选集 + 全局画质/编码偏好"，每一集的播放地址由应用反向
      // 请求网页内容脚本去取（一次最多 50 集，主进程会再校验）。
      selection = {
        episodeIds,
        videoQualityId: Number(video.id) || 0,
        videoCodecid: Number(video.codecid) || 0,
        audioId: audio ? Number(audio.id) || 0 : 0,
        audioCodecid: audio ? Number(audio.codecid) || 0 : 0,
        mergeFormat: state.mergeFormat
      }
    } else {
      selection = {
        video: {
          url: video.url,
          codecs: video.codecs || '',
          codecid: Number(video.codecid) || 0,
          // 嗅探来的流没有接口编码信息，但容器扩展名决定了产物后缀
          ext: `${video.ext || ''}`
        },
        audio: audio
          ? {
            url: audio.url,
            codecs: audio.codecs || '',
            codecid: Number(audio.codecid) || 0,
            ext: `${audio.ext || ''}`
          }
          : null,
        // 直播是单条流：录制产物不做合并，交给引擎按流本身处理
        mergeFormat: state.isLive ? '' : state.mergeFormat,
        live: state.isLive
      }
    }

    const idleText = state.isLive ? '开始录制' : '开始下载'
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
        btn.textContent = idleText
        return
      }
      btn.textContent = state.isLive ? '已加入录制任务' : '已加入下载任务'
      setTimeout(() => window.close(), 500)
    } catch (err) {
      setFormError(err && err.message ? err.message : '加入下载任务失败')
      state.submitting = false
      btn.disabled = false
      btn.textContent = idleText
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

  // 番剧集数「全选 / 全不选」：只改勾选与本集合，不重画列表
  const episodeAll = $('episodeAll')
  if (episodeAll) {
    episodeAll.addEventListener('change', () => {
      state.selectedEpisodeIds = new Set(
        episodeAll.checked ? state.episodes.map(ep => `${ep.epId}`) : []
      )
      const boxes = $('episodeList').querySelectorAll('input[type="checkbox"]')
      boxes.forEach((box) => { box.checked = episodeAll.checked })
      updateEpisodeHint()
      updateDownloadSummary()
    })
  }

  initSelect('qualitySelect', (index) => {
    state.videoGroupIndex = index
    setFormError('')
    renderVideoCodecs(true)
  })

  initSelect('videoCodecSelect', (index) => {
    state.videoStreamIndex = index
    setFormError('')
    updateDownloadSummary()
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
