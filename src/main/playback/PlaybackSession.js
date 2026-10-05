import {
  PLAYBACK_HEALTH,
  createPlaybackSession,
  createPlaybackState,
  evaluateHealth
} from '@shared/playback-api'

/**
 * 码率上限（字节/秒）：超过它就不是"码率高"，而是"时长是错的"。
 * 64 MB/s ≈ 512 Mbps —— 消费级媒体里没有这种东西（4K HDR 也就 ~12 MB/s）。
 */
const MAX_PLAUSIBLE_BITRATE = 64 * 1024 * 1024

/**
 * 一次播放会话。
 *
 * 它把三样东西汇在一起，算出"播放器该显示什么"：
 * ① **数据供给**（Provider）—— 有多少数据、缺哪些、要它优先弄哪些；
 * ② **播放器的进度上报** —— 播到哪了（决定优先下载的位置，也决定消耗速度的口径）；
 * ③ **宿主给的下载速度** —— 从下载引擎查来的当前速度。
 *
 * 它刻意**不含**：播放器的界面逻辑（播放器自己决定怎么画）、
 * 以及任何数据来源细节（那是 Provider 的事）。
 *
 * 健康度判据（用户要的那个"能不能顺畅播下去"）：
 *   平均播放消耗 = 文件总大小 ÷ 媒体时长（等于平均码率）
 *   消耗 4.2 MB/s、下载 12.8 MB/s → ok
 *   消耗 8 MB/s、下载 2 MB/s   → slow / critical，并把一句人话预警推给播放器
 */
export default class PlaybackSession {
  constructor ({
    id,
    name,
    kind = 'video',
    provider,
    streamUrl,
    mime = '',
    durationSecs = 0,
    totalBytes = 0,
    meta = {},
    streaming = false,
    mse = false,
    frames = false,
    onState = null,
    onPrioritize = null,
    logger = console
  } = {}) {
    this.id = `${id || ''}`
    this.provider = provider
    this.streamUrl = streamUrl
    this.mime = mime
    this.name = `${name || ''}`
    this.kind = kind === 'audio' ? 'audio' : 'video'
    this.meta = meta && typeof meta === 'object' ? meta : {}
    this.streaming = !!streaming
    this.mse = !!mse
    /** 数据是引擎解好的包流（NV12 帧 + PCM：画 canvas / 排 Web Audio，不经浏览器解码） */
    this.frames = !!frames
    this.onState = typeof onState === 'function' ? onState : null
    this.onPrioritize = typeof onPrioritize === 'function' ? onPrioritize : null
    /** 宿主临时提示（覆盖健康度预警，见 setNotice） */
    this.notice = ''
    this.logger = logger

    /** 媒体总时长（秒）；0 = 未知（边下边播时常常一开始拿不到） */
    this.duration = Number(durationSecs) || 0
    /** 文件总大小（字节）；0 = 未知 */
    this.totalBytes = Number(totalBytes) || (provider && provider.expectedSize ? provider.expectedSize() : 0)

    /** 播放器上报的位置（秒） */
    this.position = 0
    this.paused = true
    /** 播放器实测的"已缓冲到第几秒"（0 = 还不知道） */
    this.bufferedEnd = 0
    /** 上一次发出"优先下载"请求时的位置（秒）—— 避免每帧都打扰下载引擎 */
    this.lastPrioritizedAt = -Infinity
    /** 下载速度（字节/秒），由宿主注入 */
    this.downloadSpeed = 0

    this.timer = null
    this.closed = false
  }

  matches (id) {
    return `${id || ''}` === this.id
  }

  /**
   * 播放器的进度上报。
   *
   * 两件事：① 让下载引擎优先下播放位置附近的片（未来几秒、几十秒最值钱）；
   * ② 记录位置供健康度与缓冲计算使用。
   */
  updateProgress ({ position, duration, paused, bufferedEnd } = {}) {
    const pos = Math.max(0, Number(position) || 0)
    const dur = Number(duration) || 0
    if (dur > 0) {
      this.duration = dur
    }
    // 播放器从 `media.buffered` 量出来的"已缓冲到第几秒"：**比按码率猜准**
    // （fMP4 分片式产物的码率在段落之间并不均匀），拿到就优先用它
    const be = Number(bufferedEnd)
    if (Number.isFinite(be) && be > 0) {
      this.bufferedEnd = be
    }
    this.position = pos
    if (typeof paused === 'boolean') {
      this.paused = paused
    }
    // 位置每前进 5 秒（或跳转）就重发一次"优先下载这一带"
    if (Math.abs(pos - this.lastPrioritizedAt) >= 5) {
      this.lastPrioritizedAt = pos
      this._prioritizeAt(pos)
    }
  }

  /** 宿主注入当前下载速度（字节/秒）。 */
  setDownloadSpeed (bytesPerSecond) {
    const v = Number(bytesPerSecond)
    this.downloadSpeed = Number.isFinite(v) && v > 0 ? v : 0
  }

  /** 播放消耗（字节/秒）：总大小 ÷ 时长 = 平均码率。 */
  get consumption () {
    if (this.totalBytes > 0 && this.duration > 0) {
      const bitrate = this.totalBytes / this.duration
      // 时长可能是**假的**：文件没下全时，从破损索引里量出来的时长能小到一秒以下，
      // 除出来的码率会离谱到 5000 MB/s（2026-09-27 实测：界面上就显示了这个数）。
      // 超过任何真实媒体的量级就当"不知道" —— 宁可不报，也不瞎报。
      return bitrate <= MAX_PLAUSIBLE_BITRATE ? bitrate : 0
    }
    // 时长未知（还没拿到 moov）时，用"已读到的字节 ÷ 已播的秒数"实测。
    // 要播够一会儿才采信：引擎会**预读**几十 MB，刚开播时这个比值能高出一两个数量级。
    if (this.position > 3 && this.provider && typeof this.provider.readHighWater === 'number') {
      const measured = this.provider.readHighWater / this.position
      return measured <= MAX_PLAUSIBLE_BITRATE ? measured : 0
    }
    return 0
  }

  /** 当前状态快照（推给播放器）。 */
  snapshot () {
    const { health, warning } = evaluateHealth({
      consumption: this.consumption,
      // 已下完的文件不需要预警（那时下载速度为 0 也照样能播）
      downloadSpeed: this.streaming ? this.downloadSpeed : 0,
      streaming: this.streaming
    })
    const total = this.totalBytes || (this.provider && this.provider.expectedSize ? this.provider.expectedSize() : 0)
    let bufferedBytes = 0
    try {
      bufferedBytes = this.provider && this.provider.bufferedBytes ? this.provider.bufferedBytes() : 0
    } catch (_) {
      bufferedBytes = 0
    }
    return createPlaybackState({
      // 播放器实测的缓冲末端优先（它在页面上直接读 `media.buffered`）；
      // 拿不到时才退回"按字节比例折算"
      bufferedEnd: this.bufferedEnd > 0
        ? this.bufferedEnd
        : this._bufferedEndSeconds(bufferedBytes, total),
      bufferedBytes,
      bufferedRatio: total > 0 ? Math.min(1, bufferedBytes / total) : 0,
      downloadSpeed: this.downloadSpeed,
      consumption: this.consumption,
      // 宿主临时提示（如"文件开头还没下到，正在优先下载…"）优先于健康度预警：
      // 两者不在一个维度上（那条说的是"追不追得上"，这条说的是"还开不了播"），
      // 但共用播放器上同一条提示位。
      health: this.notice ? PLAYBACK_HEALTH.SLOW : health,
      warning: this.notice || warning
    })
  }

  /**
   * 宿主临时提示（空串 = 撤下）。
   *
   * 为什么放在会话上：播放器只认 PLAYBACK API 的状态通道，宿主多一个提示位
   * 不该逼它加一条新通道 —— 会话是"宿主侧的状态汇总"，这就是它该管的事。
   */
  setNotice (text) {
    this.notice = `${text || ''}`
  }

  /** 给播放器的会话对象（字段齐全、与实现无关）。 */
  toSession () {
    return createPlaybackSession({
      id: this.id,
      src: this.streamUrl,
      // `mse: true` = 数据来自**媒体引擎**（`/engine/<token>` 那条路由），不是给
      // `<video>` 当文件地址用的裸文件。播放器不知道也不该知道"引擎"这个词 ——
      // 它只认这套契约（`frames` 决定是"引擎解码的包流"还是"分片 fMP4 走 MSE"）。
      mse: !!this.mse,
      frames: !!this.frames,
      name: this.name,
      kind: this.kind,
      duration: this.duration,
      streaming: this.streaming,
      meta: this.meta,
      features: ['seek', 'subtitle', 'progress']
    })
  }

  /** 开始定时把状态推给播放器（播放器不做任何推导，只显示）。 */
  start (intervalMs = 1000) {
    this.stop()
    this.timer = setInterval(() => {
      if (this.closed) {
        return
      }
      try {
        this.onState?.(this.snapshot())
      } catch (e) {
        this.logger.warn?.('[Playback] 推送状态失败:', e && e.message ? e.message : e)
      }
    }, intervalMs)
  }

  stop () {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  close () {
    if (this.closed) {
      return
    }
    this.closed = true
    this.stop()
    try {
      this.provider?.close?.()
    } catch (_) {}
  }

  // ── 内部 ────────────────────────────────────────────────────────

  _prioritizeAt (positionSec) {
    if (!this.provider || typeof this.provider.prioritize !== 'function') {
      return
    }
    const bytes = this._secondsToBytes(positionSec)
    this.provider.prioritize(bytes)
    try {
      this.onPrioritize?.({ positionSec, positionBytes: bytes })
    } catch (_) {}
  }

  _secondsToBytes (sec) {
    const total = this.totalBytes || (this.provider?.expectedSize?.() || 0)
    if (total > 0 && this.duration > 0) {
      return Math.min(total, Math.max(0, (sec / this.duration) * total))
    }
    if (this.provider && typeof this.provider.readHighWater === 'number') {
      return Math.max(0, this.provider.readHighWater)
    }
    return 0
  }

  _bufferedEndSeconds (bufferedBytes, total) {
    if (this.duration > 0 && total > 0) {
      return Math.min(this.duration, (bufferedBytes / total) * this.duration)
    }
    return 0
  }
}
