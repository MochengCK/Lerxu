#!/usr/bin/env node
/**
 * MSE 播放链路的浏览器端验证（需要真实 Chromium —— 用内置浏览器打开它）。
 *
 * ## 它验的是什么
 *
 * 这条链路的每一段都可能静默坏掉，而"坏掉"的表现是黑屏，不抛异常：
 *
 * ```
 * zuvrust stream ──▶ EnginePlayer ──▶ MediaStreamServer /engine/<token>
 *                                          ──▶ 页面 fetch ──▶ MSE ──▶ <video> 真解码
 * ```
 *
 * 上面的 Node 测试（`run.mjs`）验到"字节正确流动"为止；**解码**这一步只有
 * 真浏览器能做，所以这里起一个只依赖 node 的服务器（MediaStreamServer 与
 * EnginePlayer 都不依赖 Electron），把链路接到一个页面里，让 Chromium
 * 实际去 `addSourceBuffer` + `appendBuffer`，再把结果 POST 回来。
 *
 * 用法：
 *   node test/playback/mse-server.mjs [--bin <引擎>] [--file <样本>] [--port 0]
 *   然后用浏览器打开它打印的地址，页面加载后会把结果打到屏幕上、
 *   同时 POST 回 /report（服务器打一行 JSON）。
 * 退出码：0 = 收到结果；1 = 超时没结果。
 */

import http from 'node:http'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import EnginePlayer from '../../src/main/playback/EnginePlayer.js'
import MediaStreamServer from '../../src/main/core/MediaStreamServer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

const argv = process.argv.slice(2)
function argValue (name) {
  const i = argv.indexOf(name)
  return i !== -1 ? ` ${argv[i + 1]}`.trim() : ''
}

function findEngineBin () {
  const given = argValue('--bin')
  if (given) return path.resolve(given)
  const exe = process.platform === 'win32' ? 'zuvrust.exe' : 'zuvrust'
  const cands = [
    path.join(PROJECT_ROOT, 'ZuvRust/target/debug', exe),
    path.join(PROJECT_ROOT, 'ZuvRust/target/release', exe),
    path.join(PROJECT_ROOT, 'extra/darwin/x64/engine', exe)
  ]
  return cands.find((p) => existsSync(p)) || ''
}

function findSample () {
  const given = argValue('--file')
  if (given && existsSync(given)) return path.resolve(given)
  for (const n of ['merged.mp4', 'merged3.mp4', 'bbb_360_1mb.mp4']) {
    const p = path.join('/tmp/me_samples', n)
    if (existsSync(p)) return p
  }
  return ''
}

const bin = findEngineBin()
const sample = findSample()
if (!bin || !sample) {
  process.stdout.write(`缺少引擎或样本（引擎=${bin || '无'} 样本=${sample || '无'}）\n`)
  process.exit(1)
}

const server = new MediaStreamServer({ logger: { info () {}, warn (e) { process.stdout.write(`[server] ${e}\n`) } } })
await server.start()
const player = new EnginePlayer({ enginePath: bin, input: sample, fragmentMs: 500 })
const streamUrl = await server.registerEngine(player)

const page = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>MSE 播放链路验证</title>
<style>
 body{font:13px/1.5 -apple-system,system-ui,sans-serif;margin:16px;background:#111;color:#ddd}
 #log{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace}
 .ok{color:#5f5} .bad{color:#f66} video{width:480px;background:#000;display:block;margin:10px 0}
</style></head><body>
<h3>引擎供流 → MSE → 解码</h3>
<video id="v" muted playsinline></video>
<div id="log"></div>
<script>
const lines = []
function log (s, cls) {
  lines.push(s)
  const d = document.createElement('div')
  if (cls) d.className = cls
  d.textContent = s
  document.getElementById('log').appendChild(d)
}
function finish (result) {
  window.__RESULT__ = result
  fetch('/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) })
}
function metaOf (res) {
  const b64 = res.headers.get('X-Lerxu-Meta')
  if (!b64) return null
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const line = JSON.parse(new TextDecoder().decode(bytes))
  return line.data || line
}
;(async () => {
  const result = { ok: false, steps: [], timelineOffset: 0, duration: 0, appended: 0, decoded: false, error: '' }
  const step = (name, pass, info) => { result.steps.push({ name, pass, info: info || '' }); log((pass ? '✓ ' : '✗ ') + name + (info ? ' — ' + info : ''), pass ? 'ok' : 'bad') }
  try {
    const v = document.getElementById('v')
    if (typeof window.MediaSource !== 'function') { step('浏览器支持 MSE', false); throw new Error('no MediaSource') }
    step('浏览器支持 MSE', true, 'MediaSource 可用')
    step('支持我们的 codecs', MediaSource.isTypeSupported('video/mp4; codecs="avc1.64001F,mp4a.40.2"'), 'avc1.64001F + mp4a.40.2')

    // 用**绝对地址**取流：与应用里的真实情形一致（播放器页在 file:// 下，
    // 流在 127.0.0.1:端口 —— 跨源，靠响应头里的 CORS 放行）。
    // 如果这里改成相对路径，就变成"同源取本页 HTML"，测不到 CORS 这一环。
    const res = await fetch('${streamUrl}')
    step('取到引擎流', res.ok, 'HTTP ' + res.status)
    const meta = metaOf(res)
    if (!meta) { step('响应头带元信息', false); throw new Error('no meta') }
    step('响应头带元信息', true, meta.mime)
    result.timelineOffset = (meta.timelineOffsetUs || 0) / 1e6
    result.duration = meta.durationSecs || 0

    const ms = new MediaSource()
    v.src = URL.createObjectURL(ms)
    await new Promise((r) => ms.addEventListener('sourceopen', r, { once: true }))
    const sb = ms.addSourceBuffer(meta.mime)
    step('addSourceBuffer 成功', true, meta.mime)
    // 与播放器页**同一套换算**：引擎的流统一从 0 开始，而它对应的真实媒体位置是
    // timelineOffsetUs（可能不是 0 —— 实测 HLS 分片从 10 秒起）。界面要的是
    // 0..时长，所以偏移取"流起点 − 文件起点"；第一条流时它正好是 0。
    result.fileOrigin = result.timelineOffset
    result.timestampOffset = (result.timelineOffset - result.fileOrigin) / 1e6
    sb.timestampOffset = result.timestampOffset
    if (result.duration > 0) ms.duration = result.duration

    const reader = res.body.getReader()
    let first = true
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      await new Promise((resolve, reject) => {
        sb.addEventListener('updateend', resolve, { once: true })
        sb.addEventListener('error', reject, { once: true })
        try { sb.appendBuffer(value); result.appended += value.length } catch (e) { reject(e) }
      })
      if (first) {
        first = false
        step('第一块 append 后就有数据', sb.buffered.length > 0, 'buffered=' + (sb.buffered.length ? sb.buffered.end(0).toFixed(2) + 's' : '空'))
        v.play().catch(() => {})
      }
    }
    try { ms.endOfStream() } catch (_) {}
    step('全部追加完成', true, result.appended + ' 字节')
    log('buffered: ' + (sb.buffered.length ? sb.buffered.start(0).toFixed(2) + ' ~ ' + sb.buffered.end(0).toFixed(2) + 's' : '空'))

    await new Promise((r) => setTimeout(r, 1200))
    result.decoded = v.videoWidth > 0 && v.videoHeight > 0
    step('解码出画面', result.decoded, v.videoWidth + 'x' + v.videoHeight)
    step('时长正确', Math.abs((v.duration || 0) - result.duration) < 0.5, 'video.duration=' + (v.duration || 0).toFixed(2))
    step('播放位置在前进', v.currentTime > 0.05, 'currentTime=' + v.currentTime.toFixed(2))
    step('没有媒体错误', !v.error, v.error ? 'code=' + v.error.code : '')

    // ── 第二轮：seek（引擎从新位置重启一条流，时间轴重映射） ──
    // 这是 MSE 播放最容易出错的一段：流是**重新开始**的（时间戳又从 0 起），
    // 必须靠 timestampOffset 把它放回 5 秒处，否则界面上的位置会回到开头。
    const targetRel = 5
    const absTarget = result.fileOrigin + targetRel
    const seekRes = await fetch('/seek?t=' + absTarget)
    step('请求引擎跳到 ' + targetRel + 's', seekRes.ok)
    const res2 = await fetch('${streamUrl}')
    const meta2 = metaOf(res2)
    if (!meta2) { step('第二条流的元信息', false); throw new Error('no meta on re-seek') }
    const streamStart2 = (meta2.timelineOffsetUs || 0) / 1e6
    step('第二条流的起点在 seek 位置附近', Math.abs(streamStart2 - absTarget) < 2.5, 'streamStart=' + streamStart2.toFixed(2) + 's（目标 ' + absTarget.toFixed(2) + 's）')

    const ms2 = new MediaSource()
    v.src = URL.createObjectURL(ms2)
    await new Promise((r) => ms2.addEventListener('sourceopen', r, { once: true }))
    const sb2 = ms2.addSourceBuffer(meta2.mime)
    sb2.timestampOffset = streamStart2 - result.fileOrigin
    step('重映射偏移正确', Math.abs(sb2.timestampOffset - targetRel) < 2.5, 'timestampOffset=' + sb2.timestampOffset.toFixed(2) + 's')
    if (result.duration > 0) ms2.duration = result.duration

    const reader2 = res2.body.getReader()
    let got2 = 0
    // 读到真的**有媒体数据**为止（初始化段不给 buffered 贡献任何区间，
    // 固定读几块很容易只读到 init 就下结论 —— 那会把正确实现判成失败）
    for (let i = 0; i < 80; i++) {
      if (sb2.buffered.length > 0) break
      const { done, value } = await reader2.read()
      if (done) break
      got2 += value.length
      await new Promise((resolve, reject) => {
        sb2.addEventListener('updateend', resolve, { once: true })
        sb2.addEventListener('error', reject, { once: true })
        try { sb2.appendBuffer(value) } catch (e) { reject(e) }
      })
      if (i < 6) {
        log('  · append#' + (i + 1) + ' ' + value.length + 'B → buffered=' + sb2.buffered.length +
            (sb2.buffered.length ? ' [' + sb2.buffered.start(0).toFixed(2) + ',' + sb2.buffered.end(0).toFixed(2) + ']' : '') +
            ' tsOffset=' + sb2.timestampOffset.toFixed(2) + ' msState=' + ms2.readyState)
      }
    }
    await new Promise((r) => setTimeout(r, 600))
    const bufStart = sb2.buffered.length ? sb2.buffered.start(0) : -1
    step('seek 之后数据落在目标位置', bufStart >= targetRel - 2.5 && bufStart <= targetRel + 2.5, 'buffered.start=' + bufStart.toFixed(2) + 's')
    v.currentTime = targetRel
    await new Promise((r) => setTimeout(r, 300))
    step('currentTime 能落到 seek 位置', Math.abs(v.currentTime - targetRel) < 1.5, 'currentTime=' + v.currentTime.toFixed(2))
    v.play().catch(() => {})
    await new Promise((r) => setTimeout(r, 500))
    step('seek 之后继续播放', v.currentTime > targetRel, 'currentTime=' + v.currentTime.toFixed(2))
    result.seek = { targetRel, streamStart2, timestampOffset: sb2.timestampOffset, bufStart, bytes: got2 }

    result.ok = result.steps.every((s) => s.pass)
    result.currentTime = v.currentTime
    result.videoSize = [v.videoWidth, v.videoHeight]
    finish(result)
  } catch (e) {
    result.error = String(e && e.message ? e.message : e)
    log('异常: ' + result.error, 'bad')
    result.ok = false
    finish(result)
  }
})()
</script></body></html>`

const pageServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/report') {    let body = ''
    req.on('data', (d) => { body += d })
    req.on('end', () => {
      process.stdout.write(`REPORT ${body}\n`)
      res.writeHead(200); res.end('ok')
      // **收到结果后继续挂着**：方便在浏览器里反复重载验证（每次重载都会
      // 重新开一条引擎流）。超时或不想要了就 Ctrl-C / 杀掉进程。
      process.stdout.write('（收到结果，服务器继续运行以便重复验证；Ctrl-C 结束）\n')
    })
    return
  }
  // 让页面能请求"引擎跳到某个绝对时间"（模拟主进程处理 playback:seek）
  if (req.method === 'GET' && req.url.startsWith('/seek')) {
    const t = Number(new URL(req.url, 'http://x').searchParams.get('t')) || 0
    player.seek(t)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, seekSec: t }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(page)
})

const port = Number(argValue('--port')) || 0
await new Promise((r) => pageServer.listen(port, '127.0.0.1', r))
const pagePort = pageServer.address().port
process.stdout.write(`\n引擎流地址: ${streamUrl}\n`)
process.stdout.write(`用浏览器打开: http://127.0.0.1:${pagePort}/\n\n`)

setTimeout(() => {
  process.stdout.write('超时：页面没有回报结果\n')
  process.exit(1)
}, Number(process.env.MSE_TIMEOUT_MS || 90000))
