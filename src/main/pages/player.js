/**
 * Lerxu 独立播放器窗口。
 *
 * 它只做"呈现与控制"：数据由主进程的媒体引擎（`zuvrust stream`）经本地
 * 流服务（MediaStreamServer 的 `/engine/<token>`）送来 —— 容器解析、边等边读、
 * 寻址、**解码**都在引擎里，这一页只负责
 *
 *   · 画面：引擎出 NV12 帧 → `frames-renderer.js` 用 WebGL 上屏（不看 `<video>`）；
 *   · 声音：引擎出 PCM → Web Audio 排出去（时钟也长在它上面）；
 *   · 控制：播放/暂停/倍速/音量/进度条，以及把进度报给宿主（优先下载与健康度）。
 *
 * 所以**正在下载的 BT 文件也能边下边播**（引擎读到还没下到的那段会等数据到达）。
 * 引擎解不了的编码由引擎明确报错，这一页把它的原话显示出来 —— 这里**没有**第二
 * 个内核（不存在"退回浏览器直接播"的路，见 `@shared/playback-plan`）。
 *
 * 上下文（该播哪个文件、标题/艺术家/封面）由主进程通过 `player:load` 事件推来，
 * 页面加载完也会主动拉一次（避免错过首次事件）。
 */
(function () {
  const { ipcRenderer } = require('electron')
  // PLAYBACK API 的频道名来自与主进程**同一份** JSON（见 @shared/playback-api）。
  // 播放器只认这套契约：它不知道数据是本地文件还是正在下载的 BT 文件。
  const CH = require('./playback-channels.json')

  const $ = (id) => document.getElementById(id)
  const media = $('media')
  const stage = $('stage')
  const controls = $('controls')
  const loading = $('loading')
  const toast = $('toast')

  // 图标统一：24 视框、线宽 1.7~1.8、圆角端点 —— 与整体风格保持一致。
  // 播放/暂停/静音用实心（眼睛最先落在它们上面），其余用描边。
  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8.2 5.4c0-.95 1.05-1.53 1.85-1.02l9.5 6.05c.75.48.75 1.57 0 2.05l-9.5 6.05A1.2 1.2 0 0 1 8.2 18.6V5.4z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6.6" y="4.6" width="4" height="14.8" rx="1.5" fill="currentColor"/><rect x="13.4" y="4.6" width="4" height="14.8" rx="1.5" fill="currentColor"/></svg>',
    // 后退/前进 10 秒：一段回转的弧 + 箭头 + 中间的 10
    rew: '<svg viewBox="0 0 24 24"><path d="M12 5.6A7 7 0 1 1 5.95 9.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 1.9 8.35 5.5 12 9.1z" fill="currentColor"/><text x="12" y="15.6" text-anchor="middle" font-size="7.6" font-weight="600" fill="currentColor" font-family="-apple-system, system-ui, sans-serif">10</text></svg>',
    ff: '<svg viewBox="0 0 24 24"><path d="M12 5.6A7 7 0 1 0 18.05 9.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 1.9 15.65 5.5 12 9.1z" fill="currentColor"/><text x="12" y="15.6" text-anchor="middle" font-size="7.6" font-weight="600" fill="currentColor" font-family="-apple-system, system-ui, sans-serif">10</text></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4.4 9.3h2.9l3.8-3.05c.5-.4 1.25-.05 1.25.6v10.3c0 .65-.75 1-1.25.6L7.3 14.7H4.4a1 1 0 0 1-1-1v-3.4a1 1 0 0 1 1-1z" fill="currentColor"/><path d="M15 9.3a4.1 4.1 0 0 1 0 5.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M17.6 6.7a7.7 7.7 0 0 1 0 10.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4.4 9.3h2.9l3.8-3.05c.5-.4 1.25-.05 1.25.6v10.3c0 .65-.75 1-1.25.6L7.3 14.7H4.4a1 1 0 0 1-1-1v-3.4a1 1 0 0 1 1-1z" fill="currentColor"/><path d="M15.5 9.7 20 14.2M20 9.7l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    subtitle: '<svg viewBox="0 0 24 24"><rect x="3.2" y="5" width="17.6" height="14" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6.6 14.4h4.2M12.9 14.4h4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4.4 9.2V5.6c0-.66.54-1.2 1.2-1.2h3.6M19.6 9.2V5.6c0-.66-.54-1.2-1.2-1.2h-3.6M4.4 14.8v3.6c0 .66.54 1.2 1.2 1.2h3.6M19.6 14.8v3.6c0 .66-.54 1.2-1.2 1.2h-3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    exitFull: '<svg viewBox="0 0 24 24"><path d="M9.2 4.4v3.6c0 .66-.54 1.2-1.2 1.2H4.4M14.8 4.4v3.6c0 .66.54 1.2 1.2 1.2h3.6M9.2 19.6v-3.6c0-.66-.54-1.2-1.2-1.2H4.4M14.8 19.6v-3.6c0-.66.54-1.2 1.2-1.2h3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    winMin: '<svg viewBox="0 0 24 24"><path d="M6.5 12h11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    winClose: '<svg viewBox="0 0 24 24"><path d="M7.4 7.4l9.2 9.2M16.6 7.4l-9.2 9.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  }

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
  const state = {
    /** 当前播放的文件上下文 */
    ctx: null,
    speed: 1,
    volume: 1,
    muted: false,
    /** 拖动进度条时的预览时间（秒），null = 没在拖 */
    scrubbing: null,
    /** 外部加载的字幕（blob URL），切文件时要回收 */
    subtitleUrl: '',
    hideTimer: null,
    toastTimer: null,
    /** 宿主推来的最新状态（缓冲比例 / 健康度 / 预警）—— 播放器只显示，不推导 */
    dataState: null,
    /** 控制栏当前是否隐身（决定要不要让 macOS 把原生红绿灯也收起来） */
    controlsHidden: false,
    /** 上次上报播放进度的时刻（秒） */
    lastReportAt: 0,
    /**
     * 这个文件的媒体时间轴**从哪一刻开始**（秒）。
     *
     * 真实文件不一定从 0 开始（实测 HLS 分片从 10 秒起），而界面上的进度条
     * 必须是 0..时长 —— 所以要把"文件起点"记住，seek 时加上它换成绝对时间
     * 交给引擎，显示时再减掉。
     */
    fileOrigin: null
  }

  // ── 工具 ────────────────────────────────────────────────────────

  function fmt (sec) {
    if (!Number.isFinite(sec) || sec < 0) {
      sec = 0
    }
    const total = Math.floor(sec)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
  }

  function showToast (text, sticky) {
    toast.textContent = text
    toast.classList.add('is-visible')
    if (state.toastTimer) {
      clearTimeout(state.toastTimer)
      state.toastTimer = null
    }
    if (!sticky) {
      state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 620)
    }
  }

  function hideToast () {
    if (state.toastTimer) {
      clearTimeout(state.toastTimer)
      state.toastTimer = null
    }
    toast.classList.remove('is-visible')
  }

  // ── 控制栏自动隐藏 ──────────────────────────────────────────────

  /**
   * 统一开关"控制栏隐身"。
   *
   * macOS 的红绿灯是**原生控件**，网页里的 CSS 碰不到它 —— 必须让主进程调
   * `setWindowButtonVisibility()` 才能让它跟着一起隐掉。所以除了切 class，
   * 还要通知宿主；只在**状态真的变化**时发（鼠标一动就发会太频）。
   */
  function applyControlsHidden (hidden) {
    if (state.controlsHidden === hidden) {
      return
    }
    state.controlsHidden = hidden
    document.body.classList.toggle('controls-hidden', hidden)
    try {
      ipcRenderer.send('player:window-control', hidden ? 'traffic-lights-hide' : 'traffic-lights-show')
    } catch (_) {}
  }

  function wakeControls () {
    applyControlsHidden(false)
    if (state.hideTimer) {
      clearTimeout(state.hideTimer)
    }
    // 暂停时不隐藏（用户正在找按钮），播放中 2.5 秒无操作才收
    if (T.paused || state.scrubbing !== null || !state.ctx) {
      return
    }
    state.hideTimer = setTimeout(() => {
      if (!T.paused && state.scrubbing === null) {
        applyControlsHidden(true)
      }
    }, 2500)
  }

  // ── 进度与音量 ──────────────────────────────────────────────────

  function render () {
    const dur = T.duration
    const cur = state.scrubbing !== null ? state.scrubbing : T.currentTime
    const played = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0
    $('barPlayed').style.width = `${played}%`
    $('barThumb').style.left = `${played}%`

    // 已缓冲到哪：浏览器视角（它实际读到的）与数据侧视角（宿主告诉我们的
    // "已有数据的比例"）取较大者 —— 对正在下载的文件，后者更准，
    // 因为浏览器还没读到的部分不代表没有数据。
    // 引擎出帧模式没有 `<video>` 可问，缓冲条由宿主的状态兜着（见 applyState）。
    let bufferedEnd = 0
    if (!frames.active) {
      try {
        for (let i = 0; i < media.buffered.length; i++) {
          bufferedEnd = Math.max(bufferedEnd, media.buffered.end(i))
        }
      } catch (_) {}
    } else {
      bufferedEnd = T.currentTime
    }
    if (state.dataState && Number.isFinite(state.dataState.bufferedEnd)) {
      bufferedEnd = Math.max(bufferedEnd, state.dataState.bufferedEnd)
    }
    const bufferedPct = dur > 0 ? Math.min(100, (bufferedEnd / dur) * 100) : 0
    $('barBuffered').style.width = `${bufferedPct}%`

    // 当前 / 总时长：都放进度条**上方左侧**（用户要求）
    $('timeText').textContent = `${fmt(cur)} / ${dur > 0 ? fmt(dur) : '--:--'}`

    $('playBtn').innerHTML = (T.paused || !state.ctx) ? ICONS.play : ICONS.pause
  }

  /**
   * 应用宿主推来的状态。
   *
   * 播放器**不做任何判断**：健康度与预警文案都是宿主算好的（判据见
   * `@shared/playback-api` 的 evaluateHealth —— 平均播放消耗 vs 当前下载速度）。
   */
  function applyState (dataState) {
    state.dataState = dataState || null
    render()
    renderSpeed(dataState)
    const notice = $('notice')
    const warning = dataState && dataState.warning ? `${dataState.warning}` : ''
    if (warning) {
      notice.textContent = warning
      notice.className = `is-visible is-${dataState.health || 'slow'}`
    } else if (notice) {
      notice.className = ''
      notice.textContent = ''
    }
  }

  /**
   * 时长右侧的速度读数：**下载**（宿主报的当前速度）与**播放消耗**（平均码率）。
   *
   * 为什么放在这里而不是提示条：这两个数在边下边播时是"常看"的信息，
   * 而提示条是留给"跟不上"这类**要做点什么**的预警 —— 常显的数字不该占着它。
   * 一边为 0（还没量到）就不显示那一边，两个都没有就整条留空（CSS 会收起）。
   */
  function renderSpeed (dataState) {
    const el = $('speedText')
    if (!el) {
      return
    }
    const ds = dataState || {}
    const parts = []
    if (ds.downloadSpeed > 0) {
      parts.push(`下载 ${fmtSpeed(ds.downloadSpeed)}`)
    }
    if (ds.consumption > 0) {
      parts.push(`播放 ${fmtSpeed(ds.consumption)}`)
    }
    el.textContent = parts.length ? `· ${parts.join(' · ')}` : ''
  }

  /** 速度（字节/秒）→ 人话；小于 1 MB/s 用 KB/s（那边更容易读）。 */
  function fmtSpeed (bytesPerSec) {
    const v = Number(bytesPerSec) || 0
    if (v <= 0) {
      return '—'
    }
    if (v >= 1048576) {
      return `${(v / 1048576).toFixed(1)} MB/s`
    }
    return `${Math.max(1, Math.round(v / 1024))} KB/s`
  }

  /** 上报播放进度（节流 1 秒）：宿主据此优先下载这一带、并算健康度。 */
  function reportProgress (force) {
    const now = Date.now()
    if (!force && now - state.lastReportAt < 1000) {
      return
    }
    state.lastReportAt = now
    // 已缓冲到哪一秒：MSE 与直接播放都从 `media.buffered` 取，
    // **比宿主按码率猜准**（尤其 fMP4 分片式产物）
    let bufferedEnd = frames.active ? T.currentTime : 0
    if (!frames.active) {
      try {
        for (let i = 0; i < media.buffered.length; i++) {
          bufferedEnd = Math.max(bufferedEnd, media.buffered.end(i))
        }
      } catch (_) {}
    }
    try {
      ipcRenderer.send(CH.PROGRESS, {
        position: T.currentTime || 0,
        duration: T.duration,
        bufferedEnd,
        paused: !!T.paused
      })
    } catch (_) {}
  }

  function renderVolume () {
    const v = state.muted ? 0 : state.volume
    $('volumeFill').style.width = `${Math.round(v * 100)}%`
    $('volumeThumb').style.left = `${Math.round(v * 100)}%`
    $('muteBtn').innerHTML = (state.muted || state.volume === 0) ? ICONS.mute : ICONS.vol
    $('muteBtn').classList.toggle('is-off', state.muted || state.volume === 0)
    media.volume = state.volume
    media.muted = state.muted
    // 引擎解码（PCM）那条路上没有 `<video>` 可设：音量/静音作用在音频输出的增益上
    frames.audio?.setVolume?.(state.volume, state.muted)
  }

  /**
   * 跳到某个位置。
   *
   * 引擎那两条路（默认的引擎解码 / 诊断用的 MSE）的 seek 是同一个动作：
   * 让主进程把引擎**重启到新位置**，然后重新取一条流 —— 引擎最擅长的就是
   * "从某一点起顺序读"，两边都简单（MSE 的 seek 本来就是丢掉旧缓冲重来）。
   * 只有 `<video>` 直接播放那条路才设 `currentTime`（现在只是兜底分支）。
   */
  function seekTo (sec) {
    const dur = T.duration
    const want = Math.max(0, dur > 0 ? Math.min(dur, sec) : sec)
    if (frames.active) {
      // 帧流模式：让宿主把引擎重启到新位置，再重取一条流（与 MSE 同一套语义）
      const abs = want + (state.fileOrigin || 0)
      Promise.resolve()
        .then(() => ipcRenderer.invoke(CH.SEEK, { position: abs, relative: want }))
        .then(() => startFrames(want))
        .catch((e) => playbackFailed(`跳转失败：${e && e.message ? e.message : e}`))
      return
    }
    if (mse.active) {
      // 先本地记住要跳到哪：拖动时不给反馈会让人以为没生效
      mse.targetSec = want
      // 引擎要的是**绝对媒体时间**（文件不一定从 0 开始）
      const abs = want + (state.fileOrigin || 0)
      Promise.resolve()
        .then(() => ipcRenderer.invoke(CH.SEEK, { position: abs, relative: want }))
        .then(() => startEngine(abs))
        .catch((e) => playbackFailed(`跳转失败：${e && e.message ? e.message : e}`))
      return
    }
    if (!Number.isFinite(media.duration) && dur === 0) {
      return
    }
    media.currentTime = want
  }

  // ── 菜单 ────────────────────────────────────────────────────────

  function closeMenus () {
    $('speedMenu').classList.remove('is-open')
    $('subtitleMenu').classList.remove('is-open')
  }

  /**
   * 倍速：三条路各设一次 —— `<video>`（诊断用的 MSE 路）、帧时钟（无音频时
   * 视频跟着它走）、音频输出（有音频时音频是主时钟，视频再跟着音频）。
   */
  function applySpeed (s) {
    state.speed = s
    media.playbackRate = s
    frames.rate = s
    frames.audio?.setRate?.(s)
  }

  function buildSpeedMenu () {
    const menu = $('speedMenu')
    menu.innerHTML = ''
    for (const s of SPEEDS) {
      const item = document.createElement('div')
      item.className = 'menu-item' + (Math.abs(state.speed - s) < 0.001 ? ' is-active' : '')
      item.innerHTML = `<span>${s === 1 ? '正常' : s.toFixed(2).replace(/0$/, '') + 'x'}</span><span class="tick">✓</span>`
      item.addEventListener('click', () => {
        applySpeed(s)
        $('speedBtn').textContent = `${s}x`
        buildSpeedMenu()
        closeMenus()
        showToast(`${s}x`)
      })
      menu.appendChild(item)
    }
  }

  function renderSubtitleButton (hasSub) {
    $('subtitleBtn').classList.toggle('is-off', !hasSub)
  }

  function buildSubtitleMenu () {
    const menu = $('subtitleMenu')
    menu.innerHTML = ''
    const add = (label, active, onClick) => {
      const item = document.createElement('div')
      item.className = 'menu-item' + (active ? ' is-active' : '')
      item.innerHTML = `<span>${label}</span><span class="tick">✓</span>`
      item.addEventListener('click', () => {
        onClick()
        closeMenus()
      })
      menu.appendChild(item)
    }
    add('关闭字幕', !hasShowingTrack(), () => setSubtitleMode('disabled'))
    add('加载本地字幕…', false, () => pickSubtitle())
    const tracks = Array.from(media.querySelectorAll('track'))
    tracks.forEach((t, i) => {
      const label = t.label || `字幕 ${i + 1}`
      add(label, t.mode === 'showing', () => setSubtitleMode('showing', i))
    })
  }

  function hasShowingTrack () {
    return Array.from(media.querySelectorAll('track')).some((t) => t.mode === 'showing')
  }

  function setSubtitleMode (mode, onlyIndex) {
    const tracks = Array.from(media.querySelectorAll('track'))
    tracks.forEach((t, i) => {
      t.mode = (mode === 'showing' && (onlyIndex === undefined || i === onlyIndex)) ? 'showing' : 'disabled'
    })
    if (onlyIndex !== undefined && media.textTracks[onlyIndex]) {
      // 某些情况下改 track.mode 不生效，直接改 textTracks 更可靠
      for (let i = 0; i < media.textTracks.length; i++) {
        media.textTracks[i].mode = (i === onlyIndex) ? 'showing' : 'disabled'
      }
    }
    renderSubtitleButton(hasShowingTrack())
    showToast(mode === 'disabled' ? '已关闭字幕' : '字幕已开启')
  }

  async function pickSubtitle () {
    try {
      const r = await ipcRenderer.invoke(CH.PICK_SUBTITLE)
      if (!r || !r.content) {
        return
      }
      // 清掉上一次外部加载的
      if (state.subtitleUrl) {
        URL.revokeObjectURL(state.subtitleUrl)
      }
      const blob = new Blob([toVtt(r.content)], { type: 'text/vtt' })
      state.subtitleUrl = URL.createObjectURL(blob)
      const track = document.createElement('track')
      track.kind = 'subtitles'
      track.label = r.name || '外部字幕'
      track.srclang = 'zh'
      track.src = state.subtitleUrl
      track.default = true
      media.appendChild(track)
      await new Promise((resolve) => {
        track.addEventListener('load', resolve)
        setTimeout(resolve, 400)
      })
      setSubtitleMode('showing', media.querySelectorAll('track').length - 1)
    } catch (e) {
      showToast('字幕加载失败')
    }
  }

  /** SRT → VTT（Chromium 只认 WebVTT）。已是 VTT 就原样返回。 */
  function toVtt (text) {
    let s = `${text || ''}`.replace(/^\uFEFF/, '')
    if (/^\s*WEBVTT/i.test(s)) {
      return s
    }
    // SRT 的 `00:00:01,000 --> 00:00:04,000` → VTT 用点号
    s = s.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    return `WEBVTT\n\n${s}`
  }

  // ── MSE（引擎供流） ─────────────────────────────────────────────
  //
  // 引擎把容器解析 / 边等边读 / 寻址 / 转封装全做完，产出**分片 fMP4**；
  // 这里只做一件事：把字节 append 给 SourceBuffer —— 解码交给浏览器。
  //
  // 为什么不能像以前那样把文件地址直接给 `<video>`：TS、fMP4 分片、
  // 还没下完的文件浏览器都解不了（那是"浏览器当内核"的必然结果，见主进程
  // `EnginePlayer` 的说明）。现在容器层在引擎里，浏览器只做它擅长的解码。

  const mse = {
    active: false,
    source: null,
    buffer: null,
    blobUrl: '',
    controller: null,
    /** 每次（重）开始流都 +1：用来忽略上一代的迟到回调 */
    generation: 0,
    /** **当前这条流**的起点（秒，绝对媒体时间；由引擎的元信息给出） */
    streamStart: 0,
    /** 这条流要让 currentTime 落到哪（秒，**相对文件开头**） */
    targetSec: 0,
    meta: null
  }

  function mseSupported () {
    return typeof window.MediaSource === 'function' &&
      typeof window.SourceBuffer === 'function'
  }

  /** 从响应头里取引擎给的元信息（base64 的 JSON，避免头部编码问题）。 */
  function metaFromResponse (res) {
    let b64 = ''
    try {
      b64 = res.headers.get('X-Lerxu-Meta') || ''
    } catch (_) {
      return null
    }
    if (!b64) {
      return null
    }
    try {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i)
      }
      const line = JSON.parse(new TextDecoder('utf-8').decode(bytes))
      // 响应头里是引擎的**整行** NDJSON（`{ok, type, data}`），
      // 真正要的东西在 `data` 里。这一步漏掉的话 mime 会是 undefined，
      // 表现就是"一直黑屏"（源码里踩过）。
      if (line && line.data) {
        return line.data
      }
      return line
    } catch (_) {
      return null
    }
  }

  /** 收掉 MSE：中止取流、断开 MediaSource、回收 blob URL。 */
  function stopEngine () {
    mse.generation += 1
    mse.active = false
    if (mse.controller) {
      try { mse.controller.abort() } catch (_) {}
      mse.controller = null
    }
    mse.buffer = null
    const ms = mse.source
    mse.source = null
    if (ms && ms.readyState === 'open') {
      try { ms.endOfStream() } catch (_) {}
    }
    if (mse.blobUrl) {
      try { URL.revokeObjectURL(mse.blobUrl) } catch (_) {}
      mse.blobUrl = ''
    }
  }

  /**
   * 用引擎开播：`startAt` 之后的第一个关键帧开始。
   *
   * seek 也走这里 —— MSE 的 seek 本来就是"丢掉旧缓冲重来"，
   * 而引擎最擅长的正是"从某一点起顺序读写"，两边都简单。
   */
  async function startEngine (startAt) {
    const ctx = state.ctx
    if (!ctx) {
      return
    }
    stopEngine()
    const gen = mse.generation
    mse.active = true
    // `startAt` 是**绝对媒体时间**（文件起点 + 相对位置）；0 = 从头开始
    mse.startAt = Math.max(0, Number(startAt) || 0)
    if (mse.startAt <= 0) {
      mse.targetSec = 0
    }

    const ms = new MediaSource()
    mse.source = ms
    mse.blobUrl = URL.createObjectURL(ms)
    media.src = mse.blobUrl
    media.load()

    await new Promise((resolve) => {
      if (ms.readyState === 'open') {
        resolve()
        return
      }
      ms.addEventListener('sourceopen', resolve, { once: true })
    })
    if (gen !== mse.generation || !mse.active) {
      return
    }
    await pump(ctx, gen)
  }

  /** 取引擎的字节流并按需 append（顺序 await，天然形成背压）。 */
  async function pump (ctx, gen) {
    const controller = new AbortController()
    mse.controller = controller
    let res = null
    try {
      res = await fetch(ctx.src, { signal: controller.signal, cache: 'no-store' })
    } catch (e) {
      if (gen === mse.generation) {
        playbackFailed(`取不到引擎的流：${e && e.message ? e.message : e}`)
      }
      return
    }
    if (gen !== mse.generation) {
      return
    }
    if (!res.ok) {
      let why = ''
      try {
        why = (await res.text()).trim()
      } catch (_) {}
      playbackFailed(why || `引擎拒绝了这次播放（HTTP ${res.status}）`)
      return
    }
    const meta = metaFromResponse(res)
    if (!meta || !meta.mime) {
      // 没有元信息就没法建 SourceBuffer；如实说清楚，不要装作在加载
      playbackFailed('引擎没有给出编解码信息，无法建立解码缓冲')
      return
    }
    mse.meta = meta
    mse.streamStart = (Number(meta.timelineOffsetUs) || 0) / 1e6
    // 文件起点只在第一条流上确定（之后的流从 seek 落点开始，不是文件开头）
    if (state.fileOrigin === null) {
      state.fileOrigin = mse.streamStart
    }
    const fileOrigin = state.fileOrigin || 0

    let sb = null
    try {
      sb = mse.source.addSourceBuffer(meta.mime)
    } catch (e) {
      // 编解码器不被这台机器支持（codecs 字符串是浏览器的契约）
      playbackFailed(`这台设备解不了这条流的编码（${meta.mime}）`)
      return
    }
    mse.buffer = sb
    // 时间轴对齐：引擎的流**统一从 0 开始**，而它对应的真实媒体位置是
    // `streamStart`。相对文件开头的偏移就是两者的差 —— 这样界面上的
    // `currentTime` 与进度条都是 0..时长，与用户的直觉一致。
    try {
      sb.timestampOffset = mse.streamStart - fileOrigin
    } catch (_) {}
    if (Number(meta.durationSecs) > 0) {
      try { mse.source.duration = Number(meta.durationSecs) } catch (_) {}
    }
    // 把时长/画面尺寸报给宿主（它比"打开时猜的"准，窗口按它裁黑边）
    try {
      ipcRenderer.send(CH.METADATA, {
        duration: Number(meta.durationSecs) || 0,
        // 文件媒体时间轴的起点：宿主用它做日志/诊断（播放器自己已经换算好了）
        timelineOffset: mse.streamStart,
        width: (meta.tracks || []).find((t) => t.kind === 0)?.width || 0,
        height: (meta.tracks || []).find((t) => t.kind === 0)?.height || 0
      })
    } catch (_) {}
    if (meta.note) {
      showToast(meta.note, true)
    }
    if (meta.droppedAudio) {
      // 声音装不进 fMP4 时如实提示：用户不会以为是自己的设备坏了
      showToast(`这条流只有画面（${meta.droppedAudio} 暂不支持），已在后台提示`, true)
      try {
        ipcRenderer.send(CH.ERROR, { code: 0, message: `音频编码 ${meta.droppedAudio} 无法随画面一起播放` })
      } catch (_) {}
    }

    const reader = res.body.getReader()
    let first = true
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done || gen !== mse.generation) {
          break
        }
        if (!value || !value.length) {
          continue
        }
        await appendChunk(sb, value)
        if (first) {
          first = false
          loading.classList.add('is-hidden')
          // 数据到位后再定位：seek 之后要落到用户要的那一刻（引擎给的是它前面
          // 最近的关键帧，所以从 timelineOffset 起播、再精确跳到 target）
          applyTargetTime()
          media.play().catch(() => {})
        }
      }
    } catch (e) {
      if (gen === mse.generation && e && e.name !== 'AbortError') {
        playbackFailed(`播放中断：${e.message}`)
        return
      }
    }
    if (gen === mse.generation) {
      // 流正常结束：告诉 MediaSource 没有更多数据了，否则 <video> 会以为还会来
      try {
        if (mse.source && mse.source.readyState === 'open') {
          mse.source.endOfStream()
        }
      } catch (_) {}
    }
  }

  /** append 一块数据；等 SourceBuffer 空闲再返回（这就是背压）。 */
  function appendChunk (sb, bytes) {
    return new Promise((resolve, reject) => {
      const done = () => {
        sb.removeEventListener('updateend', onEnd)
        sb.removeEventListener('error', onErr)
        resolve()
      }
      const onEnd = () => done()
      const onErr = () => {
        sb.removeEventListener('updateend', onEnd)
        sb.removeEventListener('error', onErr)
        reject(new Error('SourceBuffer 拒绝了这段数据'))
      }
      sb.addEventListener('updateend', onEnd)
      sb.addEventListener('error', onErr)
      try {
        sb.appendBuffer(bytes)
      } catch (e) {
        // QuotaExceededError：缓冲满了（浏览器会自己淘汰旧数据，这里退一步等一会儿）
        sb.removeEventListener('updateend', onEnd)
        sb.removeEventListener('error', onErr)
        setTimeout(resolve, 200)
      }
    })
  }

  /** seek 之后把播放位置落到用户要的那一刻。 */
  function applyTargetTime () {
    const target = mse.targetSec
    if (!(target > 0)) {
      return
    }
    // `target` 是**相对文件开头**的秒数，与 `media.duration`（时长）同一坐标系，
    // 所以直接夹取即可 —— 不要再叠上流起点（那会让 seek 越跑越远）
    const dur = Number.isFinite(media.duration) ? media.duration : target
    const want = Math.max(0, Math.min(dur, target))
    try {
      media.currentTime = want
    } catch (_) {}
  }

  /** 统一的失败上报（把原因显示出来 + 告诉宿主留痕）。 */
  function playbackFailed (message) {
    loading.textContent = message
    loading.classList.remove('is-hidden')
    render()
    try {
      ipcRenderer.send(CH.ERROR, { code: 0, message })
    } catch (_) {}
  }

  // ── 引擎解码（视频与音频都不经浏览器解码）─────────────────────
  //
  // 数据是引擎解好的包流（NV12 帧 + PCM；格式见 `frames-renderer.js` 抬头），
  // 这里只做三件事：取流、**按帧自己的 pts 选帧**、画到 canvas 上；音频排进
  // Web Audio。时钟因此长在帧时间戳/音频播放位置上 —— 不依赖 `<video>`。
  // **有音频时以音频为主时钟**（人对声音延迟更敏感，视频跟着它走）。
  //
  // 纯音频文件（没有视频轨）也走这条：不上屏，进度直接跟音频时钟。
  // 与 MSE 路径（诊断开关）的关系：两条路互斥，`ctx.frames` 决定走哪条，
  // 切换发生在 `load()`。
  const frames = {
    active: false,
    /** 总时长（秒；来自引擎给的元信息） */
    duration: 0,
    /** 已画到哪一帧（秒，**相对文件开头**，与进度条同一坐标系） */
    position: 0,
    paused: true,
    rate: 1,
    canvas: null,
    renderer: null,
    controller: null,
    /** 每次换流 +1：忽略上一代的迟到回调 */
    generation: 0,
    /** 待画帧队列（按 pts 升序）与时钟原点 */
    queue: [],
    clockAt: 0,
    clockPtsUs: 0,
    raf: 0,
    /** 音频输出（引擎解好的 PCM 排进 Web Audio；它同时是主时钟） */
    audio: null,
    /** 收到的音频样本数（诊断） */
    audioSamples: 0,
    /** 收到的音频包数（与"排进去了多少"无关：纯音频的起播判据用它） */
    audioPackets: 0,
    /** 这条流里有视频轨吗（纯音频没有：不上屏，进度跟音频时钟） */
    hasVideo: false,
    /** 引擎那边的字节发完了（用来判"播到片尾"） */
    eof: false,
    /** 是否已起播（有视频=第一帧到手；纯音频=第一个音频包到手） */
    started: false
  }

  /** 数据源无关的"播放头"访问器：MSE/直接播放读 `<video>`，引擎出帧读帧时钟。 */
  const T = {
    get paused () {
      return frames.active ? frames.paused : media.paused
    },
    get duration () {
      if (frames.active) {
        return frames.duration
      }
      return Number.isFinite(media.duration) ? media.duration : 0
    },
    get currentTime () {
      return frames.active ? frames.position : media.currentTime
    },
    play () {
      if (!frames.active) {
        media.play().catch(() => {})
        return
      }
      if (!frames.paused) {
        return
      }
      // 播到片尾之后再按播放：从头来（不然按下去什么都不会发生 —— 与 `<video>`
      // 在 ended 状态下 play() 的行为一致）
      if (frames.eof && frames.duration > 0 && frames.position >= frames.duration - 0.05) {
        seekTo(0)
        return
      }
      frames.paused = false
      frames.clockAt = performance.now()
      frames.clockPtsUs = frames.position * 1e6 + (state.fileOrigin || 0) * 1e6
      if (frames.audio) {
        frames.audio.resume()
      }
      if (!frames.raf) {
        frames.raf = requestAnimationFrame(tickFrames)
      }
      render()
      wakeControls()
      reportProgress(true)
    },
    pause () {
      if (!frames.active) {
        media.pause()
        return
      }
      if (frames.paused) {
        return
      }
      frames.paused = true
      if (frames.raf) {
        cancelAnimationFrame(frames.raf)
        frames.raf = 0
      }
      if (frames.audio) {
        frames.audio.pause()
      }
      render()
      applyControlsHidden(false)
      reportProgress(true)
    }
  }

  /** 帧队列按 pts 升序插入（B 帧会让到达顺序 ≠ 显示顺序）。 */
  function pushFrame (f) {
    const q = frames.queue
    let lo = 0
    let hi = q.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (q[mid].ptsUs <= f.ptsUs) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    q.splice(lo, 0, f)
    // 队列上限：引擎解得快时不该无限攒（一帧 1080p 就是 3 MB）
    if (q.length > 240) {
      q.splice(0, q.length - 240)
    }
  }

  /** 每帧一次：时钟到哪就画哪一帧（画过的丢掉）。纯音频没有画面，只推进度。 */
  function tickFrames () {
    if (!frames.active || frames.paused) {
      frames.raf = 0
      return
    }
    // **音频在放就跟音频**（人对声音的延迟更敏感，所以同步基准放在音频上），
    // 没有音频时用自己那套"起点 + 挂钟"的时钟。
    const target = frames.audio && frames.audio.isActive()
      ? frames.audio.clockUs()
      : frames.clockPtsUs + (performance.now() - frames.clockAt) * frames.rate * 1000
    const idx = window.LerxuFrames.pickFrameIndex(frames.queue, target)
    if (idx >= 0) {
      const f = frames.queue[idx]
      frames.queue.splice(0, idx + 1)
      const drawn = frames.renderer && frames.renderer.draw(f)
      if (drawn !== false) {
        if (frames.duration <= 0 && pendingEndPts > 0) {
          frames.duration = pendingEndPts
        }
        frames.position = Math.max(0, f.ptsUs / 1e6 - (state.fileOrigin || 0))
        loading.classList.add('is-hidden')
        render()
        reportProgress()
      }
    } else if (!frames.hasVideo && frames.audio && frames.audio.isActive()) {
      // 纯音频：没有帧可画，进度直接跟音频时钟（它同时也是播放位置）
      frames.position = Math.max(0, target / 1e6 - (state.fileOrigin || 0))
      render()
      reportProgress()
    }
    // 播到片尾（引擎发完了、也没东西可画了）：停住 —— 与 `<video>` 的 ended 同语义。
    // 判据用"没视频帧可画"（含纯音频），否则最后一批帧会被时钟推着追
    if (
      frames.eof &&
      frames.queue.length === 0 &&
      frames.duration > 0 &&
      frames.position >= frames.duration - 0.05
    ) {
      frames.position = frames.duration
      T.pause()
      return
    }
    frames.raf = requestAnimationFrame(tickFrames)
  }

  /** 元信息里没给时长时，用最后一帧的 pts 兜底（帧流本身不知道总长）。 */
  let pendingEndPts = 0

  // ── 读入侧的预算 ────────────────────────────────────────────────
  //
  // 引擎解码**比播放快得多**（实测 320×180 时 5 倍速以上，硬解更快），所以
  // "拿多少放多少"会把整部片子攒在内存里，而且帧队列一满就只能丢老帧（那是
  // "跳着播"，不是缓冲）。这里给消费端留预算：到顶就**先不读** —— 不读 → HTTP
  // 那头不消费 → 背压一路传回引擎的 stdout，它自己慢下来（引擎就是为这条设计的）。
  const MAX_QUEUED_FRAMES = 60
  const MAX_QUEUED_BYTES = 48 * 1024 * 1024
  const MAX_AUDIO_AHEAD_SEC = 4

  /** 队列里还没画的帧共多少字节（1080p 一帧就 3 MB，只按帧数封顶会吃几百 MB）。 */
  function queuedFrameBytes () {
    let n = 0
    for (const f of frames.queue) {
      n += f.nv12.length
    }
    return n
  }

  /** 还能再读一块吗（暂停时也会停在"攒了一点点"的状态，而不是无限攒）。 */
  function canReadMore (gen) {
    if (!frames.active || gen !== frames.generation) {
      return false
    }
    if (frames.queue.length >= MAX_QUEUED_FRAMES || queuedFrameBytes() >= MAX_QUEUED_BYTES) {
      return false
    }
    const ahead = frames.audio && frames.audio.aheadSec ? frames.audio.aheadSec() : 0
    return ahead < MAX_AUDIO_AHEAD_SEC
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  /**
   * 开一条帧流：`startAt` 是**相对文件开头**的秒数。
   *
   * seek 也走这里（与 MSE 一样：引擎那边重启一条流最干净）。
   */
  async function startFrames (startAt) {
    const ctx = state.ctx
    if (!ctx || !window.LerxuFrames) {
      return
    }
    stopFrames()
    const gen = ++frames.generation
    frames.active = true
    frames.paused = true
    frames.queue = []
    frames.position = Math.max(0, Number(startAt) || 0)
    frames.clockPtsUs = (frames.position + (state.fileOrigin || 0)) * 1e6
    frames.clockAt = performance.now()
    frames.canvas = $('framesCanvas')
    // 画布与非画布都等**元信息**到了再定：纯音频流没有视频轨，不该建 WebGL、
    // 也不该把画布露出来（那是黑屏；音频模式的封面面板要占着那块地方）。
    frames.hasVideo = false
    frames.eof = false
    frames.started = false
    frames.audioPackets = 0
    loading.textContent = '正在打开…'
    loading.classList.remove('is-hidden')

    // 音频输出（引擎解好的 PCM 由这里放出来；它同时是主时钟）
    try {
      frames.audio = frames.audio || window.LerxuFrames.createAudioOutput()
      frames.audio.reset()
      // 音量/静音是用户当前的设定：新流要按它来（增益节点上生效）
      frames.audio.setVolume(state.volume, state.muted)
      frames.audio.setRate(state.speed)
      frames.audioSamples = 0
    } catch (e) {
      frames.audio = null
      console.warn('[Lerxu] 音频输出起不来（只出画面）:', e && e.message ? e.message : e)
    }

    const controller = new AbortController()
    frames.controller = controller
    let res = null
    try {
      res = await fetch(ctx.src, { signal: controller.signal, cache: 'no-store' })
    } catch (e) {
      if (gen === frames.generation) {
        playbackFailed(`取不到引擎的帧流：${e && e.message ? e.message : e}`)
      }
      return
    }
    if (gen !== frames.generation) {
      return
    }
    if (!res.ok) {
      let why = ''
      try {
        why = (await res.text()).trim()
      } catch (_) {}
      playbackFailed(why || `引擎拒绝了这次播放（HTTP ${res.status}）`)
      return
    }

    // 元信息在**响应头**里（`EnginePlayer` 把引擎的第一行 NDJSON 摘到了
    // `X-Lerxu-Meta`），body 从第一个字节起就是包流 —— 和 MSE 那条路同一个读法。
    // 别去 body 里找"元信息行"：它不在那儿（踩过：那样第一行会拿包流的魔数当 JSON 解）。
    const meta = metaFromResponse(res)
    if (!meta || !meta.mime) {
      playbackFailed('引擎没有给出帧流元信息，无法开始播放')
      return
    }
    if (!applyFramesMeta(meta)) {
      return
    }

    const reader = res.body.getReader()
    let buf = new Uint8Array(0)
    try {
      for (;;) {
        // 消费端还有余量才继续读（见上面"读入侧的预算"）
        while (!canReadMore(gen)) {
          if (gen !== frames.generation) {
            break
          }
          await sleep(30)
        }
        if (gen !== frames.generation) {
          break
        }
        const { done, value } = await reader.read()
        if (done || gen !== frames.generation) {
          break
        }
        if (!value || !value.length) {
          continue
        }
        const merged = new Uint8Array(buf.length + value.length)
        merged.set(buf)
        merged.set(value, buf.length)
        buf = merged
        const parsed = window.LerxuFrames.parseChunk(buf)
        if (parsed.bad) {
          playbackFailed('引擎的输出流错位了（不是帧/音频包流）')
          return
        }
        buf = parsed.rest
        for (const p of parsed.packets) {
          if (p.kind === window.LerxuFrames.KIND_AUDIO) {
            frames.audioPackets += 1
            if (frames.audio) {
              try {
                if (frames.audio.push(p.payload, p.a, p.b, p.ptsUs)) {
                  frames.audioSamples += (p.payload.byteLength >> 1) / Math.max(1, p.b)
                }
              } catch (e) {
                // 音频失败不该带走画面：记一笔，继续放画面
                console.warn('[Lerxu] 音频排进输出失败:', e && e.message ? e.message : e)
                frames.audio = null
              }
            }
            continue
          }
          pushFrame({ width: p.a, height: p.b, ptsUs: p.ptsUs, nv12: p.payload })
        }
        // 起播：有视频等第一帧，纯音频等第一个音频包 —— 两种流各等各的，
        // 不能都等视频帧（纯音频永远等不到，那就是"一直黑屏/不出声"）
        if (!frames.started) {
          if (frames.hasVideo && frames.queue.length) {
            frames.started = true
            // 第一帧到位就先画出来再开播：比"黑屏等时钟"舒服
            const f = frames.queue[0]
            frames.queue.splice(0, 1)
            frames.renderer.draw(f)
            frames.position = Math.max(0, f.ptsUs / 1e6 - (state.fileOrigin || 0))
            loading.classList.add('is-hidden')
            try {
              // 画面尺寸用**实测**的第一帧报给宿主（窗口据此裁黑边）
              ipcRenderer.send(CH.METADATA, {
                duration: frames.duration,
                timelineOffset: state.fileOrigin || 0,
                width: f.width,
                height: f.height
              })
            } catch (_) {}
            render()
            T.play()
          } else if (!frames.hasVideo && frames.audioPackets > 0) {
            if (!frames.audio) {
              playbackFailed('这台设备没有可用的音频输出，放不了这个文件')
              return
            }
            frames.started = true
            loading.classList.add('is-hidden')
            try {
              // 纯音频没有画面尺寸可报（宿主那边宽高为 0 即不动窗口）
              ipcRenderer.send(CH.METADATA, {
                duration: frames.duration,
                timelineOffset: state.fileOrigin || 0,
                width: 0,
                height: 0
              })
            } catch (_) {}
            render()
            T.play()
          }
        }
      }
      // 引擎把这条流发完了：片尾判据（见 tickFrames）要用它
      if (gen === frames.generation) {
        frames.eof = true
      }
    } catch (e) {
      if (gen === frames.generation && e && e.name !== 'AbortError') {
        playbackFailed(`帧流中断：${e.message}`)
      }
    }
  }

  /**
   * 应用引擎给的帧流元信息（时长 / 有没有视频轨 / 时间轴原点 / 声音缺失的说明）。
   *
   * @returns {boolean} 能不能继续播（画不了帧 = false，调用方要收手）
   */
  function applyFramesMeta (meta) {
    const start = (Number(meta.timelineOffsetUs) || 0) / 1e6
    if (state.fileOrigin === null) {
      state.fileOrigin = start
    }
    if (Number(meta.durationSecs) > 0) {
      frames.duration = Number(meta.durationSecs)
    }
    pendingEndPts = 0
    frames.hasVideo = (meta.tracks || []).some((t) => t && t.kind === window.LerxuFrames.KIND_VIDEO)
    if (frames.hasVideo) {
      frames.canvas.classList.remove('is-hidden')
      try {
        frames.renderer = frames.renderer || window.LerxuFrames.createRenderer(frames.canvas)
      } catch (e) {
        playbackFailed(`这台设备画不了引擎出的帧：${e && e.message ? e.message : e}`)
        return false
      }
    }
    // 有画面却没有声音：引擎在 note 里说清了原因（这条流没有音频轨 / 音频编码还
    // 不能自研解码）—— 原样显示出来。**悄悄没声音是最难排查的那种失败**。
    // 纯音频流的 note（"只有声音"）是正常的，不打扰。
    if (frames.hasVideo && !meta.audio && meta.note) {
      showToast(meta.note, true)
    }
    render()
    return true
  }

  /** 收掉帧流：中止取流、停时钟、隐藏画布（MSE/直接播放路径要用它清场）。 */
  function stopFrames () {
    frames.generation += 1
    frames.active = false
    frames.paused = true
    if (frames.raf) {
      cancelAnimationFrame(frames.raf)
      frames.raf = 0
    }
    if (frames.controller) {
      try {
        frames.controller.abort()
      } catch (_) {}
      frames.controller = null
    }
    frames.queue = []
    frames.hasVideo = false
    frames.eof = false
    frames.started = false
    frames.audioPackets = 0
    if (frames.audio) {
      frames.audio.reset()
    }
    if (frames.canvas) {
      frames.canvas.classList.add('is-hidden')
    }
  }

  /** 首次交互时唤醒音频上下文（浏览器的自动播放策略要求手势）。 */
  function wakeAudio () {
    if (frames.active && frames.audio) {
      frames.audio.resume()
    }
  }
  document.addEventListener('pointerdown', wakeAudio)
  document.addEventListener('keydown', wakeAudio)

  // ── 加载一个文件 ────────────────────────────────────────────────

  function load (ctx) {
    state.ctx = ctx || null
    closeMenus()
    hideToast()
    state.dataState = null
    applyState(null)
    if (!ctx || !ctx.src) {
      loading.textContent = '没有可播放的文件'
      loading.classList.remove('is-hidden')
      return
    }
    // 换文件时把上一份字幕、拖动状态清干净
    state.scrubbing = null
    document.body.classList.remove('is-scrubbing')
    if (state.subtitleUrl) {
      URL.revokeObjectURL(state.subtitleUrl)
      state.subtitleUrl = ''
    }
    media.querySelectorAll('track').forEach((t) => t.remove())

    const isAudio = ctx.kind === 'audio'
    document.body.classList.toggle('is-audio', isAudio)
    document.title = ctx.name || 'Lerxu 播放器'
    $('audioTitle').textContent = (ctx.meta && ctx.meta.title) || ctx.name || '未知标题'
    $('audioArtist').textContent = (ctx.meta && ctx.meta.artist) || ''
    $('audioAlbum').textContent = (ctx.meta && ctx.meta.album) || ''
    if (ctx.meta && ctx.meta.cover) {
      $('cover').src = ctx.meta.cover
      $('cover').style.display = 'block'
      $('coverFallback').style.display = 'none'
    } else {
      $('cover').removeAttribute('src')
      $('cover').style.display = 'none'
      $('coverFallback').style.display = 'block'
    }

    $('subtitleBtn').style.display = isAudio ? 'none' : ''
    applySpeed(1)
    $('speedBtn').textContent = '1.0x'

    loading.textContent = '正在打开…'
    loading.classList.remove('is-hidden')
    renderVolume()
    render()
    renderSubtitleButton(false)
    buildSpeedMenu()
    // 换文件：先把上一条流收掉（MSE 与出帧两条都收），免得两路数据同时在喂
    stopEngine()
    stopFrames()
    if (ctx.frames && window.LerxuFrames) {
      // 引擎出帧：视频由引擎解码，这里只负责把帧画到 canvas 上
      startFrames(0).catch((e) => {
        playbackFailed(`启动失败：${e && e.message ? e.message : e}`)
      })
    } else if (ctx.mse && mseSupported()) {
      // 引擎供流：容器解析 / 边等边读 / 转封装在引擎里，这里用 MSE 喂解码器
      startEngine(0).catch((e) => {
        playbackFailed(`启动失败：${e && e.message ? e.message : e}`)
      })
    } else {
      media.src = ctx.src
      media.load()
    }
    reportProgress(true)
    wakeControls()
  }

  // ── 事件绑定 ────────────────────────────────────────────────────

  $('playBtn').addEventListener('click', () => {
    if (!state.ctx) return
    if (T.paused) {
      T.play()
    } else {
      T.pause()
    }
    wakeControls()
  })

  $('rewBtn').addEventListener('click', () => {
    seekTo(T.currentTime - 10)
    showToast('-10s')
    wakeControls()
  })

  $('ffBtn').addEventListener('click', () => {
    seekTo(T.currentTime + 10)
    showToast('+10s')
    wakeControls()
  })

  $('muteBtn').addEventListener('click', () => {
    state.muted = !state.muted
    renderVolume()
    showToast(state.muted ? '已静音' : '取消静音')
    wakeControls()
  })

  $('speedBtn').addEventListener('click', (e) => {
    e.stopPropagation()
    const menu = $('speedMenu')
    const open = menu.classList.contains('is-open')
    closeMenus()
    if (!open) {
      buildSpeedMenu()
      menu.classList.add('is-open')
    }
    wakeControls()
  })

  $('subtitleBtn').addEventListener('click', (e) => {
    e.stopPropagation()
    const menu = $('subtitleMenu')
    const open = menu.classList.contains('is-open')
    closeMenus()
    if (!open) {
      buildSubtitleMenu()
      menu.classList.add('is-open')
    }
    wakeControls()
  })

  $('fullBtn').addEventListener('click', () => {
    toggleFullscreen()
    wakeControls()
  })

  // ── 顶部窗口控制（无边框窗口，自己画；与底部控制栏同一条生命周期）──

  $('tbMinBtn').addEventListener('click', () => {
    sendWindowControl('minimize')
  })
  $('tbCloseBtn').addEventListener('click', () => {
    sendWindowControl('close')
  })
  $('titleDrag').addEventListener('dblclick', () => {
    sendWindowControl('toggle-maximize')
  })

  /** 窗口控制走独立的通道：它属于"窗口管理"，不是播放语义，不进 PLAYBACK API。 */
  function sendWindowControl (action) {
    try {
      ipcRenderer.send('player:window-control', action)
    } catch (_) {}
  }

  document.addEventListener('click', () => closeMenus())

  function toggleFullscreen () {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  document.addEventListener('fullscreenchange', () => {
    const full = !!document.fullscreenElement
    $('fullBtn').innerHTML = full ? ICONS.exitFull : ICONS.full
    if (state.ctx) {
      showToast(full ? '全屏' : '退出全屏')
    }
  })

  // 单击画面：播放/暂停；双击：全屏（用一个短延时分流）
  let clickTimer = null
  stage.addEventListener('click', (e) => {
    if (e.target.closest('#controls')) {
      return
    }
    if (e.target.closest('#audioPane') && !document.body.classList.contains('is-audio')) {
      return
    }
    if (clickTimer) {
      clearTimeout(clickTimer)
      clickTimer = null
      toggleFullscreen()
      return
    }
    clickTimer = setTimeout(() => {
      clickTimer = null
      if (!state.ctx) return
      // 走 T（播放头访问器）而不是直接读 `<video>`：引擎解码那条路上没有 `<video>`
      if (T.paused) {
        T.play()
        showToast('播放')
      } else {
        T.pause()
        showToast('暂停')
      }
      wakeControls()
    }, 220)
  })

  // ── 进度条拖动 ──────────────────────────────────────────────────

  function ratioFromEvent (e, el) {
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    return rect.width > 0 ? x / rect.width : 0
  }

  const barHit = $('barHit')
  barHit.addEventListener('pointerdown', (e) => {
    // 时长从 T 取：引擎解码那条路上 `<video>` 没有 duration（它没加载任何 src）
    if (!state.ctx || !(T.duration > 0)) return
    barHit.setPointerCapture(e.pointerId)
    state.scrubbing = 0
    document.body.classList.add('is-scrubbing')
    onScrubMove(e)
    e.preventDefault()
  })
  barHit.addEventListener('pointermove', (e) => {
    if (state.scrubbing === null) return
    onScrubMove(e)
  })
  barHit.addEventListener('pointerup', (e) => {
    if (state.scrubbing === null) return
    const target = state.scrubbing
    state.scrubbing = null
    document.body.classList.remove('is-scrubbing')
    seekTo(target)
    showToast(fmt(target))
    wakeControls()
  })
  barHit.addEventListener('pointercancel', () => {
    state.scrubbing = null
    document.body.classList.remove('is-scrubbing')
  })

  function onScrubMove (e) {
    const r = ratioFromEvent(e, $('barTrack'))
    const dur = T.duration
    state.scrubbing = r * dur
    render()
  }

  // ── 音量拖动 ────────────────────────────────────────────────────

  let volDragging = false
  const volTrack = $('volumeTrack')
  function applyVolumeFromEvent (e) {
    const r = ratioFromEvent(e, volTrack)
    state.volume = Math.max(0, Math.min(1, r))
    if (state.volume > 0) {
      state.muted = false
    }
    renderVolume()
  }
  volTrack.addEventListener('pointerdown', (e) => {
    volDragging = true
    volTrack.setPointerCapture(e.pointerId)
    applyVolumeFromEvent(e)
    e.preventDefault()
  })
  volTrack.addEventListener('pointermove', (e) => {
    if (volDragging) applyVolumeFromEvent(e)
  })
  volTrack.addEventListener('pointerup', () => {
    volDragging = false
  })

  // ── 媒体事件 ────────────────────────────────────────────────────

  media.addEventListener('loadedmetadata', () => {
    loading.classList.add('is-hidden')
    render()
    wakeControls()
    // 把播放器**实测**到的时长与画面尺寸报给宿主：
    // 它比"打开时猜的"准，也是窗口能否做到无黑边的关键（任何能播的格式都覆盖，
    // 不依赖宿主去解析各种容器的元数据）。
    try {
      ipcRenderer.send(CH.METADATA, {
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        width: media.videoWidth || 0,
        height: media.videoHeight || 0
      })
    } catch (_) {}
  })
  media.addEventListener('timeupdate', () => {
    render()
    reportProgress()
  })
  media.addEventListener('progress', render)
  media.addEventListener('play', () => {
    render()
    wakeControls()
    reportProgress(true)
  })
  media.addEventListener('pause', () => {
    render()
    applyControlsHidden(false)
    if (state.hideTimer) {
      clearTimeout(state.hideTimer)
    }
    reportProgress(true)
  })
  media.addEventListener('seeked', () => reportProgress(true))
  media.addEventListener('ratechange', render)
  media.addEventListener('volumechange', renderVolume)
  // 边下边播的关键反馈：数据还没到（服务端在等下载）时告诉用户是在缓冲
  media.addEventListener('waiting', () => {
    loading.textContent = '正在缓冲…'
    loading.classList.remove('is-hidden')
  })
  media.addEventListener('playing', () => {
    loading.classList.add('is-hidden')
  })
  media.addEventListener('canplay', () => {
    loading.classList.add('is-hidden')
  })
  media.addEventListener('ended', () => {
    render()
    applyControlsHidden(false)
  })
  media.addEventListener('error', () => {
    const code = media.error ? media.error.code : 0
    // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED。两种内核的成因不同，分开说：
    //   · 引擎供流（MSE）：多半是数据还没到 / 缓冲被清空，可以等一等；
    //   · 直接播放：容器或编码不在浏览器的支持面里（这正是改用引擎要解决的问题）
    const message = mse.active
      ? '这条引擎流中断了，正在等数据…（如果一直这样，请看后台日志）'
      : (code === 4
          ? '这个文件浏览器无法直接播放（编码不受支持，或还没下载到可播放的数据）'
          : '播放失败')
    loading.textContent = message
    loading.classList.remove('is-hidden')
    render()
    try {
      ipcRenderer.send(CH.ERROR, { code, message })
    } catch (_) {}
  })

  // ── 鼠标活动 / 键盘 ─────────────────────────────────────────────

  stage.addEventListener('mousemove', wakeControls)
  controls.addEventListener('mousemove', wakeControls)
  window.addEventListener('blur', () => {
    if (state.hideTimer) clearTimeout(state.hideTimer)
  })

  document.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return
    switch (e.key) {
      case ' ':
      case 'k':
      case 'K':
        e.preventDefault()
        $('playBtn').click()
        break
      case 'ArrowLeft':
        e.preventDefault()
        seekTo(T.currentTime - (e.altKey ? 1 : 5))
        showToast(e.altKey ? '-1s' : '-5s')
        wakeControls()
        break
      case 'ArrowRight':
        e.preventDefault()
        seekTo(T.currentTime + (e.altKey ? 1 : 5))
        showToast(e.altKey ? '+1s' : '+5s')
        wakeControls()
        break
      case 'ArrowUp':
        e.preventDefault()
        state.volume = Math.min(1, state.volume + 0.05)
        state.muted = false
        renderVolume()
        showToast(`音量 ${Math.round(state.volume * 100)}%`)
        wakeControls()
        break
      case 'ArrowDown':
        e.preventDefault()
        state.volume = Math.max(0, state.volume - 0.05)
        renderVolume()
        showToast(`音量 ${Math.round(state.volume * 100)}%`)
        wakeControls()
        break
      case 'm':
      case 'M':
        $('muteBtn').click()
        break
      case 'f':
      case 'F':
        toggleFullscreen()
        break
      default:
        break
    }
  })

  // ── 启动：拿上下文 ──────────────────────────────────────────────

  $('fullBtn').innerHTML = ICONS.full
  $('playBtn').innerHTML = ICONS.play
  $('muteBtn').innerHTML = ICONS.vol
  $('subtitleBtn').innerHTML = ICONS.subtitle
  $('rewBtn').innerHTML = ICONS.rew
  $('ffBtn').innerHTML = ICONS.ff
  $('tbMinBtn').innerHTML = ICONS.winMin
  $('tbCloseBtn').innerHTML = ICONS.winClose
  buildSpeedMenu()
  renderVolume()
  render()

  ipcRenderer.on(CH.OPEN, (_e, session) => load(session))
  ipcRenderer.on(CH.STATE, (_e, dataState) => applyState(dataState))
  ipcRenderer.on(CH.CLOSE, () => {
    try { media.pause() } catch (_) {}
    // 关窗要**收掉引擎流**：不然引擎还在读文件、还往这条连接上吐数据
    stopEngine()
  })

  // 系统给了哪些窗口装饰？按主进程回报的**实际形态**决定自己画什么（不猜平台）：
  //   · 有红绿灯（macOS hiddenInset）→ 不画按钮，但保留顶部拖拽条；
  //   · 有原生标题栏（Windows/Linux 默认）→ 顶部那条整个不需要；
  //   · 两者都没有（无边框窗口）→ 拖拽条 + 窗口按钮都自己画。
  ipcRenderer.invoke('app:frame-mode')
    .then((info) => {
      const i = info || {}
      const ownControls = !i.trafficLights && !i.nativeTitleBar
      document.body.classList.toggle('own-window-controls', ownControls)
      document.body.classList.toggle('native-titlebar', !!i.nativeTitleBar)
    })
    .catch(() => {})

  ipcRenderer.invoke(CH.READY)
    .then((session) => {
      if (session) {
        load(session)
      } else {
        loading.textContent = '没有待播放的文件'
      }
    })
    .catch(() => {
      loading.textContent = '没有待播放的文件'
    })
})()
