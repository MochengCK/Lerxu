/**
 * 引擎帧流的**解析**与**上屏**（WebGL）—— 播放器页与验证页共用同一份。
 *
 * ## 包流格式（与引擎 `stream --video=frames [--audio=pcm]` 的契约）
 *
 * ```
 * 第一行：{"ok":true,"type":"stream-meta","data":{…}}\n
 * 之后  ：[28 字节头 + 载荷] 重复
 *         头 = magic "MEV1"(4) | kind u32 | a u32 | b u32 | pts_us i64 | len u32（全小端）
 *         kind=0 画面：a=宽 b=高，载荷紧凑 NV12
 *         kind=1 声音：a=采样率 b=声道数，载荷交织 S16LE
 * ```
 *
 * ## 为什么是 NV12 + WebGL
 *
 * NV12 是所有平台解码器的"母语"（VideoToolbox/MediaCodec 直接产出），也是 GPU 最
 * 容易吃的格式：两个纹理（Y、CbCr）＋ 一个 shader 做 YUV→RGB，零 CPU 转换。
 *
 * ## 踩过的坑（别再犯）
 *
 * 色度纹理是 `LUMINANCE_ALPHA`：**Cb 在 `.r`、Cr 在 `.a`**。读 `.rg` 会拿到两个
 * Cb（因为 LUMINANCE_ALPHA 的 g 通道就是亮度本身），画面立刻变成洋红/荧光绿。
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) {
    module.exports = api
  }
  if (root) {
    root.LerxuFrames = api
  }
})(typeof self !== 'undefined' ? self : this, function () {
  /** 包头字节数（引擎 meta 里的 `packetHeaderBytes` 必须与它一致）。 */
  const HEADER_BYTES = 28
  /** 包流魔数（大端读作 u32）。 */
  const MAGIC = 0x4d455631 // "MEV1"
  /** 包类型：画面（NV12）。 */
  const KIND_VIDEO = 0
  /** 包类型：声音（交织 S16LE）。 */
  const KIND_AUDIO = 1

  /**
   * 从一段字节里尽量切出完整的包。
   *
   * @param {Uint8Array} buf 累积的字节（可能含半个包，返回值里的 rest 要留着）
   * @returns {{packets: Array<{kind:number,a:number,b:number,ptsUs:number,payload:Uint8Array}>, rest: Uint8Array, bad: boolean}}
   */
  function parseChunk (buf) {
    const packets = []
    let off = 0
    while (off + HEADER_BYTES <= buf.length) {
      const view = new DataView(buf.buffer, buf.byteOffset + off, HEADER_BYTES)
      if (view.getUint32(0, false) !== MAGIC) {
        // 流错位（对端不是包流 / 中间丢了字节）：交给调用方报错，别乱画
        return { packets, rest: buf.subarray(off), bad: true }
      }
      const kind = view.getUint32(4, true)
      const a = view.getUint32(8, true)
      const b = view.getUint32(12, true)
      const ptsUs = Number(view.getBigInt64(16, true))
      const len = view.getUint32(24, true)
      if (off + HEADER_BYTES + len > buf.length) {
        break // 半个包：等下一块
      }
      packets.push({
        kind,
        a,
        b,
        ptsUs,
        payload: buf.subarray(off + HEADER_BYTES, off + HEADER_BYTES + len)
      })
      off += HEADER_BYTES + len
    }
    return { packets, rest: buf.subarray(off), bad: false }
  }

  /**
   * 音频输出：把引擎解出来的 PCM（S16LE）排进 Web Audio。
   *
   * 为什么音频由**前端**输出而不是引擎进程：引擎解的是样本，放出去要接系统音频栈
   * （CoreAudio/WASAPI/ALSA 各一套），而浏览器本来就是干这个的；等引擎要独立播放
   * （无前端）时再加那一层。**时钟在这里**：视频跟着音频的播放位置走。
   *
   * 音量/静音/倍速都作用在这里（引擎解码这条路上没有 `<video>` 可设）：
   * 前两个走一个共享的增益节点（对**已排入**的样本同样生效），倍速走每个
   * 源节点的 `playbackRate`（见 `setRate` 的说明：只影响之后排入的样本）。
   *
   * @param {{leadSec?: number}} [opts] leadSec = 预留的调度提前量（越小延迟越低）
   */
  function createAudioOutput (opts = {}) {
    const leadSec = Number(opts.leadSec) > 0 ? Number(opts.leadSec) : 0.08
    let ctx = null
    let gain = null
    let nextAt = 0
    /** 时钟锚点：第一个音频包的时间戳 + 它在 AudioContext 时间轴上的起点 */
    let anchorPtsUs = 0
    let anchorAt = 0
    let anchoring = false
    /** 播放速率（倍速）与音量（0..1）/静音 —— 播放器的控件直接改它们 */
    let rate = 1
    let volume = 1
    let muted = false
    /** 已排入的样本数（自检用） */
    let scheduledSamples = 0
    const active = new Set()

    function ensureContext (sampleRate) {
      if (ctx) {
        return ctx
      }
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) {
        throw new Error('这台设备没有 Web Audio')
      }
      ctx = sampleRate ? new AC({ sampleRate }) : new AC()
      gain = ctx.createGain()
      gain.gain.value = muted ? 0 : volume
      gain.connect(ctx.destination)
      return ctx
    }

    /** 推一段 PCM。返回是否排进去了。 */
    function push (bytes, sampleRate, channels, ptsUs) {
      const c = ensureContext(sampleRate)
      const chans = Math.max(1, channels | 0)
      const frames = Math.floor(bytes.byteLength / 2 / chans)
      if (frames <= 0) {
        return false
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset, frames * chans * 2)
      const buffer = c.createBuffer(chans, frames, sampleRate)
      for (let ch = 0; ch < chans; ch++) {
        const out = buffer.getChannelData(ch)
        for (let i = 0; i < frames; i++) {
          out[i] = view.getInt16((i * chans + ch) * 2, true) / 32768
        }
      }
      const at = Math.max(c.currentTime + leadSec, nextAt)
      if (!anchoring) {
        anchoring = true
        anchorPtsUs = ptsUs
        anchorAt = at
      }
      const src = c.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = rate
      // 经过增益节点（音量/静音），不再直连 destination
      src.connect(gain)
      src.onended = () => active.delete(src)
      src.start(at)
      active.add(src)
      nextAt = at + frames / sampleRate / rate
      scheduledSamples += frames
      return true
    }

    /** 音频时钟（微秒）：排进去的音频"现在播到哪"。暂停时 AudioContext 冻结，它自然也跟着停。 */
    function clockUs () {
      if (!ctx || !anchoring) {
        return anchorPtsUs
      }
      // 倍速下"内容时间"走得比挂钟快（速率乘在差值上）
      return anchorPtsUs + Math.max(0, ctx.currentTime - anchorAt) * 1e6 * rate
    }

    /** 音量（0..1）与静音：共享增益节点，对已排入的样本也生效。 */
    function setVolume (v, m) {
      volume = Math.max(0, Math.min(1, Number(v) || 0))
      if (typeof m === 'boolean') {
        muted = m
      }
      if (gain) {
        gain.gain.value = muted ? 0 : volume
      }
    }

    /**
     * 倍速。
     *
     * 已经排进去的样本会在旧速率下播完（提前量只有几十毫秒，而且引擎按实时喂，
     * 排入量就那么点），所以这里只把**时钟锚点**挪到当下，之后按新速率调度与计时；
     * 视频跟着这个时钟走，自然还是同步的。
     */
    function setRate (r) {
      const v = Math.max(0.25, Math.min(4, Number(r) || 1))
      if (v === rate) {
        return
      }
      if (ctx && anchoring) {
        anchorPtsUs = clockUs()
        anchorAt = ctx.currentTime
      }
      rate = v
    }

    /** 还在排（有音频数据）吗 */
    function isActive () {
      return anchoring
    }

    /**
     * 已经排进输出的音频"超前播放头多少秒"（判"还能不能再读"用）。
     *
     * 引擎解码比播放快得多，前端不做读入节制就会把整部片子排进音频图（内存炸）。
     * 没有输出（纯视频）时返回 0。
     */
    function aheadSec () {
      if (!ctx) {
        return 0
      }
      return Math.max(0, nextAt - ctx.currentTime)
    }

    function pause () {
      if (ctx && ctx.state === 'running') {
        ctx.suspend().catch(() => {})
      }
    }

    function resume () {
      if (ctx && ctx.state !== 'running') {
        ctx.resume().catch(() => {})
      }
    }

    /** 清空所有已排的音频（seek / 换文件）。 */
    function reset () {
      for (const src of active) {
        try {
          src.stop()
        } catch (_) {}
      }
      active.clear()
      nextAt = 0
      anchoring = false
      anchorPtsUs = 0
      anchorAt = 0
    }

    return {
      push,
      clockUs,
      isActive,
      aheadSec,
      pause,
      resume,
      setVolume,
      setRate,
      reset,
      get scheduledSamples () {
        return scheduledSamples
      },
      dispose () {
        reset()
        try {
          ctx && ctx.close()
        } catch (_) {}
        ctx = null
      }
    }
  }

  /**
   * 时钟走到 `targetPtsUs` 时该画哪一帧：**最后一个 pts ≤ target 的帧**。
   *
   * 返回 -1 表示"还没有该画的帧"（全都还没到点）。纯函数，单测钉住。
   */
  function pickFrameIndex (frames, targetPtsUs) {
    let pick = -1
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].ptsUs <= targetPtsUs) {
        pick = i
      } else {
        break
      }
    }
    return pick
  }

  /**
   * 建一个 NV12 渲染器（WebGL）。
   *
   * @param {HTMLCanvasElement} canvas
   * @returns {{draw: Function, sample: Function, dispose: Function}}
   */
  function createRenderer (canvas) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true })
    if (!gl) {
      throw new Error('这台设备没有可用的 WebGL')
    }
    const compile = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) || 'shader 编译失败')
      }
      return s
    }
    const vs = compile(gl.VERTEX_SHADER, `attribute vec2 p; varying vec2 uv;
void main(){ uv = vec2((p.x+1.0)*0.5, (1.0-p.y)*0.5); gl_Position = vec4(p,0,1); }`)
    const fs = compile(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 uv;
uniform sampler2D yTex; uniform sampler2D uvTex;
void main(){
  float Y = texture2D(yTex, uv).r * 255.0;
  // LUMINANCE_ALPHA：Cb 在 .r、Cr 在 .a（读 .rg 会拿到两个 Cb → 颜色全错）
  vec4 c = texture2D(uvTex, uv);
  vec2 C = vec2(c.r, c.a) * 255.0 - vec2(128.0);
  // BT.601 video range（解码器的输出范围）
  float r = 1.164*(Y-16.0) + 1.596*C.y;
  float g = 1.164*(Y-16.0) - 0.813*C.y - 0.391*C.x;
  float b = 1.164*(Y-16.0) + 2.018*C.x;
  gl_FragColor = vec4(clamp(vec3(r,g,b)/255.0, 0.0, 1.0), 1.0);
}`)
    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const yTex = gl.createTexture()
    const uvTex = gl.createTexture()
    for (const [tex, unit] of [[yTex, 0], [uvTex, 1]]) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
    gl.uniform1i(gl.getUniformLocation(prog, 'yTex'), 0)
    gl.uniform1i(gl.getUniformLocation(prog, 'uvTex'), 1)

    let lastSize = ''
    function draw (frame) {
      const w = frame.width
      const h = frame.height
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      if (lastSize !== `${w}x${h}`) {
        lastSize = `${w}x${h}`
        gl.viewport(0, 0, w, h)
      }
      const y = frame.nv12.subarray(0, w * h)
      const uv = frame.nv12.subarray(w * h)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, yTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, y)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, uvTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, w >> 1, h >> 1, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, uv)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    /** 读回画面上的若干像素（自检/自动化验证用；不参与播放）。 */
    function sample (points = [[0.5, 0.5]]) {
      const out = []
      for (const [fx, fy] of points) {
        const px = new Uint8Array(4)
        const x = Math.max(0, Math.min(canvas.width - 1, Math.round(fx * canvas.width)))
        const y = Math.max(0, Math.min(canvas.height - 1, Math.round(fy * canvas.height)))
        gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        out.push([px[0], px[1], px[2]])
      }
      return out
    }

    return {
      draw,
      sample,
      dispose () {
        try {
          gl.deleteTexture(yTex)
          gl.deleteTexture(uvTex)
          gl.deleteBuffer(buf)
          gl.deleteProgram(prog)
        } catch (_) {}
      }
    }
  }

  return {
    HEADER_BYTES,
    MAGIC,
    KIND_VIDEO,
    KIND_AUDIO,
    parseChunk,
    pickFrameIndex,
    createRenderer,
    createAudioOutput
  }
})
