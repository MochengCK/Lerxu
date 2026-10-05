#!/usr/bin/env node
/**
 * 播放通路的测试（纯 Node，零依赖）
 * ============================
 *
 * 用户问过的问题："播放器的内核不应该是媒体引擎吗？为什么是浏览器直接播放？"
 * —— 这条链路上**每一段都可能静默坏掉**，而它坏掉的表现是"黑屏/无法播放"，
 * 不会抛异常、不会写日志。所以这里把整段钉住：
 *
 * ```
 * zuvrust stream ──stdout: 一行元信息 + 引擎解码的包流（NV12 帧 / PCM）──▶
 *   EnginePlayer（响应头塞元信息、字节直通、背压、seek 重启、不留僵尸进程）
 *   ──▶ MediaStreamServer /engine/<token>
 *   ──▶ 播放器页 fetch + 帧渲染器/音频输出（页面侧，这里用真实 HTTP 请求验证到字节为止）
 * ```
 *
 * **桌面播放器只有引擎一个内核**（视频与音频都是，见 `@shared/playback-plan`）：
 * 引擎解不了的编码明确报错，不回退浏览器 —— 所以这里也钉住"没有回退链路"。
 *
 * 用法：
 *   node test/playback/run.mjs                # 自动找 target/debug 下的引擎
 *   node test/playback/run.mjs --bin <路径>
 *   node test/playback/run.mjs --no-engine    # 只跑不依赖引擎二进制的部分
 * 退出码：0 = 全部通过；1 = 任一失败。
 */

import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import EnginePlayer from '../../src/main/playback/EnginePlayer.js'
import { hintDue, createPlayheadHint } from '../../src/main/playback/PlayheadHint.js'
import { hasFileHead, STREAM_MAX_ATTEMPTS } from '../../src/main/playback/StreamWait.js'
import { buildAvailability, writeAvailabilityFile } from '../../src/main/playback/AvailabilityMap.js'
// 帧渲染器是**普通脚本**（浏览器里当全局用、Node 里当 CJS 用），所以按默认导入取它的导出对象
import framesRenderer from '../../src/main/pages/frames-renderer.js'
const { parseChunk, pickFrameIndex, HEADER_BYTES, MAGIC, KIND_VIDEO, KIND_AUDIO } = framesRenderer
import MediaStreamServer from '../../src/main/core/MediaStreamServer.js'
import PlaybackSession from '../../src/main/playback/PlaybackSession.js'
// 策略模块按命名空间导入：还要断言"回退那套函数已经不存在了"
import * as playbackPlan from '../../src/shared/playback-plan.js'
const { planPlayback } = playbackPlan
import channels from '../../src/shared/playback-channels.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

// ---------- 极简断言 ----------
let passed = 0
const failures = []
function ok (cond, name, detail = '') {
  if (cond) {
    passed++
    process.stdout.write(`  ✓ ${name}\n`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    process.stdout.write(`  ✗ ${name}${detail ? ` — ${detail}` : ''}\n`)
  }
}
function eq (actual, expected, name) {
  ok(actual === expected, name, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
}
function section (title) {
  process.stdout.write(`\n${title}\n`)
}

// ---------- 引擎与样例 ----------
function findEngineBin () {
  const i = process.argv.indexOf('--bin')
  if (i !== -1 && process.argv[i + 1]) return path.resolve(process.argv[i + 1])
  const exe = process.platform === 'win32' ? 'zuvrust.exe' : 'zuvrust'
  const candidates = [
    path.join(PROJECT_ROOT, 'ZuvRust', 'target', 'debug', exe),
    path.join(PROJECT_ROOT, 'ZuvRust', 'target', 'release', exe)
  ]
  return candidates.find(p => existsSync(p)) || ''
}

/** 找一个真实媒体样本来测：优先用环境变量给的，其次用 /tmp 下的历史样片。 */
function prepareSample () {
  const keep = process.env.LERXU_TEST_MEDIA || ''
  if (keep && existsSync(keep)) return keep
  for (const name of ['merged.mp4', 'merged3.mp4', 'bbb_360_1mb.mp4']) {
    const p = path.join('/tmp/me_samples', name)
    if (existsSync(p)) return p
  }
  // 没有样片就跳过（不假装通过）
  return ''
}

/**
 * 纯音频样片：用 macOS 自带的 `afconvert` 从系统音效转一个 AAC/m4a 出来。
 * 目的只有一个：**证明纯音频文件也走引擎**（解成 PCM 包流，没有视频轨不是错误）。
 * 拿不到就返回空串（调用方跳过，不假装通过）。
 */
function prepareAudioSample (dir) {
  const src = ['/System/Library/Sounds/Ping.aiff', '/System/Library/Sounds/Basso.aiff']
    .find((p) => existsSync(p))
  if (!src) return ''
  const out = path.join(dir, 'tone.m4a')
  const r = spawnSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', src, out], { encoding: 'utf8' })
  return r.status === 0 && existsSync(out) ? out : ''
}

/** 假响应：够 EnginePlayer 用（setHeader / write / end / destroy + drain 事件）。 */
class FakeResponse extends EventEmitter {
  /**
   * @param {Object} [p]
   * @param {number} [p.pauseFirstWrites] 前几次 write 返回 false（模拟客户端来不及消费，
   *   用来验证背压：源会被暂停，直到 'drain' 才继续）
   */
  constructor ({ pauseFirstWrites = 0 } = {}) {
    super()
    this.headers = {}
    this.chunks = []
    this.ended = false
    this.destroyed = false
    this.writes = 0
    this.paused = 0
    this.pauseFirstWrites = pauseFirstWrites
  }

  setHeader (k, v) {
    this.headers[`${k}`.toLowerCase()] = `${v}`
  }

  write (buf) {
    if (this.destroyed) return true
    this.chunks.push(Buffer.from(buf))
    this.writes += 1
    if (this.writes <= this.pauseFirstWrites) {
      this.paused += 1
      return false
    }
    return true
  }

  end () {
    this.ended = true
  }

  destroy () {
    this.destroyed = true
  }

  get bytes () {
    return Buffer.concat(this.chunks)
  }

  meta () {
    const b64 = this.headers['x-lerxu-meta']
    if (!b64) return null
    try {
      const line = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
      // 与播放器页一样：要拿的是 `data`（漏掉这层就会"一直黑屏"）
      return line && line.data ? line.data : line
    } catch (_) {
      return null
    }
  }
}

async function waitFor (fn, timeoutMs = 8000, stepMs = 30) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fn()) return true
    await new Promise((r) => setTimeout(r, stepMs))
  }
  return false
}

// ---------- 1. 参数构造（纯逻辑） ----------
section('EnginePlayer 命令行')
{
  const p = new EnginePlayer({ enginePath: '/x/zuvrust', input: '/a/b.mp4' })
  const args = p.args()
  ok(args[0] === 'stream', 'stream 子命令')
  eq(args[1], '/a/b.mp4', '输入是第二个参数')
  ok(!args.some((a) => a.startsWith('--seek=')), 'seek 为 0 时**不传** --seek（没必要多一次跳转）')
  ok(!args.some((a) => a.startsWith('--size=')), '大小未知时不传 --size')
  ok(!args.includes('--no-grow'), '默认按"可能还在下载"的方式读（边下边播是常态）')

  const p2 = new EnginePlayer({
    enginePath: '/x/zuvrust', input: '/a/b.ts', size: 1024, seekSec: 12.5, grow: false, fragmentMs: 250
  })
  const a2 = p2.args()
  ok(a2.includes('--seek=12.5'), 'seek 透传（秒，可带小数）')
  ok(a2.includes('--size=1024'), '最终大小透传给引擎（moov 在末尾的文件靠它）')
  ok(a2.includes('--no-grow'), 'grow=false 时明确关掉')
  ok(a2.includes('--fragment-ms=250'), '分片时长可调（越小出画越快）')
}

// ---------- 2. 会话契约 ----------
section('会话与频道契约')
{
  const s = new PlaybackSession({ id: 'x', name: 'n', kind: 'video', provider: { expectedSize: () => 0 }, mse: true })
  const sess = s.toSession()
  eq(sess.mse, true, 'mse 会话标记会传到播放器（决定用 MSE 还是直接 src）')
  eq(sess.frames, false, '默认不是出帧模式')
  eq(new PlaybackSession({ id: 'f', name: 'n', provider: { expectedSize: () => 0 }, frames: true }).toSession().frames, true, 'frames 标记传到播放器（决定画 canvas 还是喂 <video>）')
  eq(sess.src, '', '没有 streamUrl 时 src 为空串（不是 undefined）')

  const s2 = new PlaybackSession({ id: 'y', name: 'n', kind: 'video', provider: { expectedSize: () => 100 } })
  eq(s2.toSession().mse, false, '默认不是 MSE（浏览器自解的旧路径仍在）')

  // 播放器实测的 bufferedEnd 优先于"按字节比例折算"
  const provider = { expectedSize: () => 1000, bufferedBytes: () => 10, readHighWater: 0 }
  const s3 = new PlaybackSession({ id: 'z', name: 'n', provider })
  s3.duration = 100
  s3.totalBytes = 1000
  s3.updateProgress({ position: 5, duration: 100, bufferedEnd: 42, paused: false })
  eq(s3.snapshot().bufferedEnd, 42, '用播放器实测的缓冲末端（比按码率猜准）')
  s3.updateProgress({ position: 5, duration: 100, paused: false })
  eq(s3.snapshot().bufferedEnd, 42, '播放器没报时沿用上一次的实测值（不跳回折算值）')

  // 播放消耗（平均码率）的可信度：假时长不能拿来当"播放消耗"
  const s4 = new PlaybackSession({ id: 'c', name: 'n', provider: { expectedSize: () => 4194304000 } })
  s4.totalBytes = 4194304000
  s4.duration = 3897
  ok(
    Math.abs(s4.consumption - 4194304000 / 3897) < 1,
    '时长可信时：播放消耗 = 总大小 ÷ 时长（平均码率）'
  )
  s4.duration = 0.8
  eq(
    s4.consumption,
    0,
    '假的时长（文件没下全时量出来的）算出的几千 MB/s 要判成"不知道"，不能显示给用户'
  )
  const s5 = new PlaybackSession({ id: 'd', name: 'n', provider: { expectedSize: () => 0, readHighWater: 5 * 1048576 } })
  s5.totalBytes = 0
  s5.position = 0.2
  eq(s5.consumption, 0, '刚开播（预读了几 MB、只播了 0.2 秒）时不用实测值，免得报出虚高的消耗')
  s5.position = 20
  ok(s5.consumption > 0 && s5.consumption <= 64 * 1048576, '播够久之后才用"已读字节 ÷ 已播秒数"实测')

  eq(typeof channels.SEEK, 'string', '频道表里有 SEEK')
  const appSrc = readFileSync(path.join(PROJECT_ROOT, 'src/main/Application.js'), 'utf8')
  const pageSrc = readFileSync(path.join(PROJECT_ROOT, 'src/main/pages/player.js'), 'utf8')
  ok(appSrc.includes('PLAYBACK.SEEK'), '主进程注册了 SEEK 处理器')
  ok(pageSrc.includes('CH.SEEK'), '播放器页用同一个常量请求跳转（写死字符串会两边漂移）')
  // 速度读数的位置与来源：常驻在时长右侧，不再走提示条
  ok(pageSrc.includes('speedText'), '播放器把"下载 / 播放"速度显示在时长右侧（常驻读数）')
  ok(pageSrc.includes('fmtSpeed'), '速度读数用统一的格式化（MB/s 与 KB/s 分档）')
  const apiSrc = readFileSync(path.join(PROJECT_ROOT, 'src/shared/playback-api.js'), 'utf8')
  ok(
    !/warning: `[^`]*\$\{[^}]*mb\(/.test(apiSrc),
    '预警文案里不再带数字（数字在常驻读数里，同一组数出现在两处只会打架）'
  )
  ok(appSrc.includes('EnginePlayer'), '主进程的播放路径接了引擎播放器')

  // registerEngine 返回的地址形态
  const server = new MediaStreamServer({ logger: { info () {}, warn () {} } })
  const url = await server.registerEngine(new EnginePlayer({ enginePath: '/x/e', input: '/a/b.mp4' }))
  ok(/^http:\/\/127\.0\.0\.1:\d+\/engine\/[0-9a-f]{32}$/.test(url), `引擎流地址形态正确（${url}）`)
  eq(server.tokenOf(url), url.split('/').pop(), 'tokenOf 能从引擎地址里取回 token（关闭时要按它释放）')
  // `/stream/`（按 Range 读裸文件）这条路由本身还留着，但**播放器不再用它**：
  // 桌面播放器只有引擎一个内核，没有"浏览器直接啃文件"那一档
  const legacyUrl = await server.register({ provider: { expectedSize: () => 1 } })
  ok(legacyUrl.includes('/stream/'), '按 Range 读裸文件的路由还在（服务还在，播放器不用它）')
  eq(server.tokenOf(legacyUrl), legacyUrl.split('/').pop(), 'tokenOf 同时认两种地址')
  eq(server.tokenOf('http://127.0.0.1:1/engine/zz'), '', '非法 token 返回空串（不乱释放）')
  await server.stop()
}

// ---------- 2b. 内核选择策略（纯函数） ----------
section('内核选择策略')
{
  eq(planPlayback({ enginePath: '/e/zuvrust' }).engine, true, '有引擎 → 用引擎（视频与音频都是它）')
  eq(planPlayback({ enginePath: '/e/zuvrust' }).reason, 'engine', '原因如实写清（日志要能看出走的哪条路）')
  eq(planPlayback({ enginePath: '' }).engine, false, '没有引擎 → 播放起不来（该平台还没回填二进制）')
  eq(planPlayback({ enginePath: '' }).reason, 'no-engine', '原因如实写清（日志要能看出是缺引擎）')
  ok(!('planEngineFailure' in playbackPlan), '没有"引擎失败就回退浏览器"这条函数了（不回退是硬约束，而不是默认值）')

  // 宿主侧不再有回退链路：这些字样出现在主进程代码里就是回退又长回来了
  const hostSrc = readFileSync(path.join(PROJECT_ROOT, 'src/main/Application.js'), 'utf8')
  for (const forbidden of ['fallbackToLegacyPlayback', 'forceLegacy', 'legacyRetried', 'LocalFileProvider']) {
    ok(!hostSrc.includes(forbidden), `主进程里没有 ${forbidden}（桌面播放器无浏览器播放这一档）`)
  }
  ok(hostSrc.includes('dialog.showErrorBox'), '缺引擎时明确报错（不是静默什么都不做）')
}

// ---------- 2c. 优先下载（播放头 → 下载引擎） ----------
section('优先下载（播放头提示）')
{
  const appSrc = readFileSync(path.join(PROJECT_ROOT, 'src/main/Application.js'), 'utf8')
  // 节流判据：媒体引擎每 0.5 秒报一次播放头，而选片窗口是几十 MB 量级
  eq(hintDue({ now: 1000, lastAt: 0, offset: 0, lastOffset: -1 }), true, '第一次上报必发（也就是"开播先给文件开头"那一下）')
  eq(hintDue({ now: 1000, lastAt: 500, offset: 50 * 1048576, lastOffset: 0 }), false, '间隔不足就不发（0.5 秒一次的播放头不能每次都打 RPC）')
  eq(hintDue({ now: 4000, lastAt: 1000, offset: 0, lastOffset: 0 }), false, '位置没动就不发')
  eq(hintDue({ now: 4000, lastAt: 1000, offset: 200 * 1024, lastOffset: 0 }), false, '抖动（不足 1 MiB）不重发')
  eq(hintDue({ now: 4000, lastAt: 1000, offset: 8 * 1048576, lastOffset: 0 }), true, '间隔够了且位置真的前进了 → 重发')
  eq(hintDue({ now: 4000, lastAt: 1000, offset: 8 * 1048576, lastOffset: 16 * 1048576 }), true, 'seek 回退也算"位置变了"（回退缓冲要抢）')
  eq(hintDue({ now: 4000, lastAt: 1000, offset: -1, lastOffset: 0 }), false, '负数偏移不是有效位置（清除走 clear()）')

  // 转发器：文件内偏移 + 文件在种子里的起点 = 引擎要的坐标
  const sent = []
  let clock = 1000
  const hint = createPlayheadHint({ fileOffset: 700 * 1048576, send: (off) => sent.push(off), now: () => clock })
  hint.push(0)
  eq(sent[0], 700 * 1048576, '开播的初始提示带上文件在种子里的起点（多文件种子不换算就会去抢别的文件）')
  hint.push(1024) // 间隔不足 → 吞掉
  eq(sent.length, 1, '节流生效：连续上报只发一次')
  clock = 5000
  hint.push(4 * 1048576)
  eq(sent[1], 700 * 1048576 + 4 * 1048576, '播放位置前进了就再报一次（换算成种子内坐标）')
  hint.clear()
  eq(sent[2], -1, '停止播放要清除提示（选片退回 rarest-first，否则会一直只下那一段）')
  hint.clear()
  eq(sent.length, 3, '没发过就不必重复清除（不打扰引擎）')

  const neverSent = []
  const h2 = createPlayheadHint({ send: (off) => neverSent.push(off) })
  h2.clear()
  eq(neverSent.length, 0, '一次都没上报过时，clear 不发 RPC')

  // 接线：宿主把播放头接到下载引擎的原生方法上
  const filesSrc = readFileSync(path.join(PROJECT_ROOT, 'src/renderer/components/TaskDetail/TaskFiles.vue'), 'utf8')
  ok(appSrc.includes('task.setPlayhead'), '主进程把播放头转达给下载引擎（task.setPlayhead）')
  ok(appSrc.includes('onPlayhead'), '引擎上报的播放头（最准的位置来源）接进了这条通道')
  ok(appSrc.includes('onPrioritize'), '按播放位置（位置 × 码率估算）的优先下载也接了')
  ok(appSrc.includes('waitForStreamData'), '"文件开头还没下到"时等数据而不是判失败（BT 文件开头是空洞时引擎必然报容器错误）')
  ok(filesSrc.includes('fileOffset'), '文件表把"本文件在种子里的起点"传给宿主（选片坐标是整份种子）')
  ok(
    /function absolutePathOf[\s\S]{0,700}rel = listed/.test(filesSrc),
    '磁盘路径用引擎给的相对 path 拼，不用文件名（BT 文件在自己的子目录里，只拿文件名会拼出不存在的路径）'
  )

  // 引擎出包（视频/音频同一条流）：包解析 + 按时钟选帧 + PCM 输出
  {
    const head = (kind, a, b, pts, len) => {
      const buf = new Uint8Array(HEADER_BYTES)
      const v = new DataView(buf.buffer)
      v.setUint32(0, MAGIC, false)
      v.setUint32(4, kind, true)
      v.setUint32(8, a, true)
      v.setUint32(12, b, true)
      v.setBigInt64(16, BigInt(pts), true)
      v.setUint32(24, len, true)
      return buf
    }
    const frame = (w, h, pts) => {
      const nv12 = new Uint8Array(w * h * 3 / 2)
      return { head: head(KIND_VIDEO, w, h, pts, nv12.length), payload: nv12 }
    }
    const audio = (rate, chans, pts, bytes) => {
      const pcm = new Uint8Array(bytes)
      return { head: head(KIND_AUDIO, rate, chans, pts, pcm.length), payload: pcm }
    }
    const f1 = frame(4, 2, 0)
    const a1 = audio(22050, 2, 0, 8)
    const f2 = frame(4, 2, 40000)
    const parts = [f1, a1, f2]
    const stream = new Uint8Array(parts.reduce((n, p) => n + p.head.length + p.payload.length, 0))
    let at = 0
    for (const p of parts) {
      stream.set(p.head, at)
      stream.set(p.payload, at + p.head.length)
      at += p.head.length + p.payload.length
    }

    const all = parseChunk(stream)
    eq(all.bad, false, '包流魔数对得上')
    eq(all.packets.length, 3, '一次切出三个包（画面/声音/画面）')
    eq(all.packets[0].kind, KIND_VIDEO, '第一个是画面包')
    eq(all.packets[1].kind, KIND_AUDIO, '第二个是声音包（音视频同一条流，按 kind 分流）')
    eq(all.packets[1].a, 22050, '声音包里 a = 采样率')
    eq(all.packets[1].b, 2, '声音包里 b = 声道数')
    eq(all.packets[2].ptsUs, 40000, '包带自己的 pts（时钟长在它上面）')
    eq(all.packets[0].payload.length, 4 * 2 * 3 / 2, '画面载荷 = NV12（w*h*1.5）')
    eq(all.rest.length, 0, '整包切完不留残余')

    // 半个包：只给头 + 一半载荷 → 不吐包，残余留到下一块
    const half = stream.subarray(0, HEADER_BYTES + 3)
    const partial = parseChunk(half)
    eq(partial.packets.length, 0, '载荷没到齐不吐包（不能画半张/放半段）')
    eq(partial.rest.length, half.length, '残余原样留着')

    // 拼接：分块到达也要能拼出完整的包
    const merged = new Uint8Array(stream.length)
    merged.set(half)
    merged.set(stream.subarray(half.length), half.length)
    eq(parseChunk(merged).packets.length, 3, '分块到达也能拼出完整包')

    // 错位：魔数不对要报出来（宁可报错也不画乱码）
    eq(parseChunk(new Uint8Array(HEADER_BYTES)).bad, true, '不是包流（魔数不对）要如实报错')
    eq(typeof framesRenderer.createAudioOutput, 'function', '渲染器里带音频输出（PCM → Web Audio）')

    // 时钟：画「最后一个 pts ≤ target」的帧（B 帧到达顺序 ≠ 显示顺序）
    const q = [{ ptsUs: 0 }, { ptsUs: 40000 }, { ptsUs: 80000 }]
    eq(pickFrameIndex(q, -1), -1, '时钟还没到第一帧：什么都不画')
    eq(pickFrameIndex(q, 0), 0, '正好到第一帧')
    eq(pickFrameIndex(q, 50000), 1, '到两帧之间：画前面那一帧')
    eq(pickFrameIndex(q, 999999), 2, '时钟走过了：画最后一帧（不追着时钟跑）')

    const pageSrc = readFileSync(path.join(PROJECT_ROOT, 'src/main/pages/player.html'), 'utf8')
    const playerSrc = readFileSync(path.join(PROJECT_ROOT, 'src/main/pages/player.js'), 'utf8')
    ok(pageSrc.includes('framesCanvas'), '播放器页有上屏画布')
    ok(pageSrc.includes('frames-renderer.js'), '播放器页引入帧渲染器（与验证页共用同一份）')
    ok(playerSrc.includes('ctx.frames'), '播放器按会话里的 frames 标记选出帧路径')
    ok(playerSrc.includes('pickFrameIndex'), '按帧自己的 pts 选帧（时钟不依赖 <video>）')
    // 元信息在**响应头**里（EnginePlayer 把引擎第一行 NDJSON 摘走了），body 从头就是包流：
    // 帧路径曾经去 body 第一行找它 → 拿包流魔数当 JSON 解，必然失败（真踩过）
    ok(!playerSrc.includes('第一行是元信息'), '帧流不从 body 里找"元信息行"（它已被摘到响应头）')
    ok(/startFrames[\s\S]{0,2500}metaFromResponse\(res\)/.test(playerSrc), '帧路径与 MSE 一样从 X-Lerxu-Meta 读元信息')
    ok(playerSrc.includes('createAudioOutput'), '播放器把引擎给的 PCM 排进 Web Audio（音频由引擎解码）')
    ok(playerSrc.includes('audio.clockUs'), '有音频时视频跟音频时钟（音画同步的基准在音频上）')

    // 纯音频（没有视频轨）：也得起播、推进度 —— 引擎解码这条路音频文件也走
    ok(playerSrc.includes('hasVideo'), '播放器区分"有没有视频轨"（纯音频不上屏）')
    ok(playerSrc.includes('audioPackets'), '纯音频的起播判据是"第一个音频包到手"（不能等视频帧）')
    ok(/applyFramesMeta[\s\S]{0,900}hasVideo[\s\S]{0,400}createRenderer/.test(playerSrc), '有视频轨才建 WebGL 渲染器（纯音频不该建）')
    ok(playerSrc.includes('frames.eof'), '引擎发完 + 没东西可画 → 停住（与 <video> 的 ended 同语义）')

    // 读入侧要节制：引擎解码比播放快好几倍（实测 5 倍以上），不节制会把整部片子
    // 攒在内存里，而且帧队列一满只能丢老帧 = 跳着播
    ok(playerSrc.includes('canReadMore'), '读入侧有预算（队列/超前量到顶就先不读 → 背压传回引擎）')
    ok(playerSrc.includes('aheadSec'), '音频"超前多少秒"参与"还能不能再读"的判据')
    ok(playerSrc.includes('MAX_QUEUED_BYTES'), '帧队列还按字节封顶（1080p 一帧就 3 MB）')
    ok(typeof framesRenderer.createAudioOutput().aheadSec === 'function', '音频输出暴露 aheadSec（超前量）')

    // 音量/静音/倍速：引擎解码这条路上没有 <video> 可设，控件要接到音频输出上
    ok(playerSrc.includes('frames.audio?.setVolume'), '音量控件接到 PCM 输出的增益上（否则音量条是死的）')
    ok(playerSrc.includes('setRate'), '倍速接到 PCM 输出（否则倍速只对画面生效，声音还是原速）')
    ok(typeof framesRenderer.createAudioOutput().setVolume === 'function', '音频输出暴露 setVolume')
    ok(typeof framesRenderer.createAudioOutput().setRate === 'function', '音频输出暴露 setRate')

    // 进度条/方向键/点画面：都走 T（播放头访问器），不直接读 <video>
    ok(!/barHit\.addEventListener\('pointerdown'[\s\S]{0,200}media\.duration/.test(playerSrc), '进度条拖动不再直接读 <video> 的 duration（引擎路径上它是 NaN）')
    ok(!/case 'ArrowLeft':[\s\S]{0,120}media\.currentTime/.test(playerSrc), '方向键 seek 走 T.currentTime')

    const engineSrc = readFileSync(path.join(PROJECT_ROOT, 'src/main/playback/EnginePlayer.js'), 'utf8')
    const framesArgs = new EnginePlayer({
      enginePath: '/x/zuvrust',
      input: '/a/b.mp4',
      engineDecode: true
    }).args()
    ok(framesArgs.includes('--video=frames'), '引擎解码作为 --video=frames 传给引擎')
    ok(framesArgs.includes('--audio=pcm'), '同时要引擎把音频解成 PCM（音视频都由引擎解码）')
    ok(!new EnginePlayer({ enginePath: '/x/e', input: '/a/b.mp4', engineDecode: false }).args().some((a) => a.startsWith('--video=')), '关掉引擎解码时退回 fMP4 + MSE（诊断开关）')
    ok(engineSrc.includes('engineDecode'), 'EnginePlayer 认识引擎解码开关')
    ok(!engineSrc.includes('videoFrames'), '旧名（只提视频）不再出现：它是引擎解码，音频同样走这条')
    ok(appSrc.includes('video-frames'), '诊断开关：video-frames 配置项 / LERXU_VIDEO_FRAMES=0 才关掉引擎解码')
    ok(!/video-frames'\) === true/.test(appSrc), '引擎解码是**默认**（不再是"显式为 true 才开"）')
  }

  // 可用性图：下载引擎的片位图 → "哪些字节已下到"（引擎靠它把空洞当"等"而不是"损坏"）
  {
    const map = buildAvailability({
      bitfield: 'f0',
      pieceLength: 1048576,
      fileOffset: 2 * 1048576,
      total: 100 * 1048576
    })
    eq(map && map.fileOffset, 2 * 1048576, '图里带"本文件在种子里的起点"（位图是按整份种子编的）')
    eq(map && map.pieceLength, 1048576, '片长原样传下去')
    eq(map && map.bitfield, 'f0', '位图原样传下去')
    eq(buildAvailability({ bitfield: '', pieceLength: 1 }), null, '空位图 = 不知道（不写文件）')
    eq(buildAvailability({ bitfield: 'f', pieceLength: 1 }), null, '奇数长度 hex 不是位图')
    eq(buildAvailability({ bitfield: 'zz', pieceLength: 1 }), null, '非 hex 不是位图')
    eq(buildAvailability({ bitfield: 'f0', pieceLength: 0 }), null, '片长 0 不合法')
    eq(buildAvailability({ bitfield: 'f0', pieceLength: 1, fileOffset: -1 }), null, '负偏移不合法')

    const dir = mkdtempSync(path.join(os.tmpdir(), 'lerxu-avail-'))
    const file = path.join(dir, 'map.json')
    writeAvailabilityFile(file, map)
    eq(JSON.parse(readFileSync(file, 'utf8')).bitfield, 'f0', '图文件是原子写出来的（临时文件 + rename）')
    ok(!existsSync(`${file}.tmp`), '临时文件不留下')
    rmSync(dir, { recursive: true, force: true })

    const argsWithAvail = new EnginePlayer({
      enginePath: '/x/zuvrust',
      input: '/a/b.mp4',
      availPath: '/tmp/map.json'
    }).args()
    ok(argsWithAvail.includes('--avail=/tmp/map.json'), '可用性图作为 --avail 传给引擎')
    ok(!new EnginePlayer({ enginePath: '/x/e', input: '/a/b.mp4' }).args().some((a) => a.startsWith('--avail=')), '没有图时不传 --avail（本地文件照老样子读）')
    ok(appSrc.includes('task.tell'), '宿主每秒向下载引擎要片位图（bitfield/pieceLength）来刷新这张图')
  }

  // "数据还没到"的判据：下载引擎先扩文件后填数据，没下到的位置读出来是零
  const probeDir = mkdtempSync(path.join(os.tmpdir(), 'lerxu-head-'))
  const zeros = path.join(probeDir, 'holes.bin')
  writeFileSync(zeros, Buffer.alloc(256 * 1024))
  eq(hasFileHead(zeros), false, '全零的开头 = 还没下到（媒体引擎读它必然报容器错误）')
  const withData = path.join(probeDir, 'head.bin')
  const buf = Buffer.alloc(256 * 1024)
  buf.write('ftyp', 4, 'ascii')
  writeFileSync(withData, buf)
  eq(hasFileHead(withData), true, '开头有真实字节 = 可以试了（哪怕后面还是空洞）')
  eq(hasFileHead(path.join(probeDir, 'nope.bin')), false, '文件还不存在也算"数据没到"（不抛错）')
  ok(STREAM_MAX_ATTEMPTS > 0 && STREAM_MAX_ATTEMPTS < 100, '重开次数有上限（防"重开→立刻失败"无限循环）')
  rmSync(probeDir, { recursive: true, force: true })
}

// ---------- 3. 引擎真实数据通路 ----------
const noEngine = process.argv.includes('--no-engine')
const bin = noEngine ? '' : findEngineBin()
const tmp = mkdtempSync(path.join(os.tmpdir(), 'lerxu-playback-'))
const sample = bin ? prepareSample() : ''

if (!bin || !sample) {
  process.stdout.write('\n引擎数据通路：跳过（' + (!bin ? '没找到 zuvrust 二进制' : '没找到可用的样本文件') + '）\n')
} else {
  section(`引擎数据通路（${path.basename(bin)} + ${path.basename(sample)}）`)

  // 3.1 默认内核：**引擎解码**（视频 NV12 帧 + 音频 PCM，播放器页只上屏/发声）
  const res = new FakeResponse()
  const player = new EnginePlayer({ enginePath: bin, input: sample })
  const meta = await player.openStream(res)
  ok(!!meta && typeof meta.mime === 'string', '元信息里带 mime（播放器靠它选渲染器）')
  eq(meta.decodeMode, 'frames', `默认就是引擎解码（${meta.decodeMode}）`)
  eq(meta.mime, 'video/x-nv12', '画面是 NV12 帧流（交给 WebGL 上屏）')
  eq(meta.packetHeaderBytes, HEADER_BYTES, '包头字节数与渲染器的解析器一致（不一致就会错位）')
  ok(meta.audio && meta.audio.kind === KIND_AUDIO, '音频也由引擎解码（PCM 交给 Web Audio）')
  eq(res.headers['content-type'], 'application/octet-stream', '响应头如实声明"不是 mp4"（引擎解码的包流）')
  ok(!!res.meta() && res.meta().mime === meta.mime, '元信息也能从响应头解出来（播放器就是这么读的）')
  const ended = await waitFor(() => res.ended, 60000)
  ok(ended, '流正常结束（引擎读完输入就收尾）')
  {
    const parsed = parseChunk(new Uint8Array(res.bytes))
    ok(!parsed.bad, '产出是完整的包流（魔数对得上）')
    ok(parsed.packets.length > 0, `切出了包（${parsed.packets.length} 个）`)
    const videoPkts = parsed.packets.filter((p) => p.kind === KIND_VIDEO)
    const audioPkts = parsed.packets.filter((p) => p.kind === KIND_AUDIO)
    ok(videoPkts.length > 0, '有画面包（视频由引擎解码）')
    ok(audioPkts.length > 0, '有声音包（音频由引擎解码）')
    eq(videoPkts[0].payload.length, videoPkts[0].a * videoPkts[0].b * 3 / 2, '画面载荷 = NV12（w*h*1.5）')
    ok(audioPkts[0].a > 0 && audioPkts[0].b > 0, `声音包带采样率/声道（${audioPkts[0].a}Hz ${audioPkts[0].b}ch）`)
    eq(parsed.rest.length, 0, '整条流切完不留残余')
  }
  ok(!!player.lastPlayhead && player.lastPlayhead.sourceOffset > 0, '播放头有上报（宿主据此优先下载这一带）')
  eq(player.running, false, '读完之后子进程已退出（不留僵尸）')

  // 3.1b 诊断开关（engineDecode: false）：引擎只转封装，出**分片 fMP4** 给浏览器解码
  const resMse = new FakeResponse()
  const playerMse = new EnginePlayer({ enginePath: bin, input: sample, engineDecode: false })
  const metaMse = await playerMse.openStream(resMse)
  ok(metaMse.mime.includes('codecs='), `诊断模式的 mime 带 codecs 参数（${metaMse.mime}）`)
  eq(resMse.headers['content-type'], 'video/mp4', '诊断模式响应头声明 video/mp4')
  ok(await waitFor(() => resMse.ended, 60000), '诊断模式的流也正常结束')
  eq(resMse.bytes.subarray(4, 8).toString('latin1'), 'ftyp', '首字节就是 ftyp（不是半截数据）')
  ok(resMse.bytes.includes(Buffer.from('moof')), '产物是**分片** fMP4（有 moof）')

  // 3.2 产物能被引擎自己读出来（证明"引擎产的东西是真能解码的容器"）
  const outPath = path.join(tmp, 'streamed.mp4')
  writeFileSync(outPath, resMse.bytes)
  const probe = spawnSync(bin, ['probe', outPath, '--json'], { encoding: 'utf8', timeout: 30000 })
  let probed = null
  try {
    probed = JSON.parse(probe.stdout.trim().split('\n').pop()).result
  } catch (_) {}
  ok(!!probed && probed.container === 'iso-bmff', '产物是合法 ISO BMFF（引擎自己认）')
  ok(!!probed && probed.tracks.length >= 1, `产物带轨道（${probed ? probed.tracks.length : 0} 条）`)

  // 3.3 seek：重启一条流，且时间轴偏移 = 真实落点
  player.seek(1)
  eq(player.running, false, 'seek 会先停掉当前流（不留着旧进程继续读）')
  const res2 = new FakeResponse()
  const meta2 = await player.openStream(res2)
  ok(Number(meta2.timelineOffsetUs) > 0, `seek 之后元信息带真实起点（${meta2.timelineOffsetUs}us）`)
  eq(player.running, true, 'seek 之后新的流已经起来')
  await waitFor(() => res2.ended, 30000)

  // 3.4 客户端断开 → 引擎立刻被杀（否则关窗后它还在读文件）
  const res3 = new FakeResponse()
  const player3 = new EnginePlayer({ enginePath: bin, input: sample })
  await player3.openStream(res3)
  eq(player3.running, true, '流在跑')
  res3.emit('close')
  const killed = await waitFor(() => !player3.running, 3000)
  ok(killed, '客户端断开后引擎被收掉（不留僵尸进程）')

  // 3.5 背压：写不进去时暂停源，drain 之后继续，最终字节数不丢
  const res4 = new FakeResponse({ pauseFirstWrites: 1 })
  const player4 = new EnginePlayer({ enginePath: bin, input: sample })
  await player4.openStream(res4)
  // 必须**等到真的发生了一次"写不进去"**再 drain：写是异步发生的，
  // 立刻 emit('drain') 会打在 listener 注册之前（那就测不到恢复路径了）
  const pushed = await waitFor(() => res4.paused > 0, 10000)
  ok(pushed, '触发了背压路径（write 返回 false → 暂停源）')
  const drained = res4.bytes.length
  res4.emit('drain')
  const grew = await waitFor(() => res4.bytes.length > drained + 1000, 15000)
  ok(grew, 'drain 之后数据继续流动（背压处理正确）')
  const full1 = await waitFor(() => res4.ended, 30000)
  ok(full1, '背压之后仍能读到流结束')
  ok(
    Math.abs(res4.bytes.length - res.bytes.length) < res.bytes.length * 0.2,
    `背压不影响产出量（${res4.bytes.length} vs ${res.bytes.length}）`
  )
  player4.stop()

  // 3.6 stop 会杀进程
  const res5 = new FakeResponse()
  const player5 = new EnginePlayer({ enginePath: bin, input: sample })
  await player5.openStream(res5)
  player5.stop()
  const stopped = await waitFor(() => !player5.running, 3000)
  ok(stopped, 'stop() 之后没有活着的流')

  // 3.7 引擎不存在 / 输入不可读：要**报错**，不能假装在播
  const bad = new EnginePlayer({ enginePath: '/nonexistent/zuvrust-xyz', input: sample })
  let badErr = null
  try {
    await bad.openStream(new FakeResponse())
  } catch (e) {
    badErr = e
  }
  ok(!!badErr, '引擎缺失时 openStream 抛错（宿主据此明确报错 —— 没有别的内核可退）')

  const badInput = new EnginePlayer({ enginePath: bin, input: '/nonexistent/video-xyz.mp4' })
  let inputErr = null
  try {
    await badInput.openStream(new FakeResponse())
  } catch (e) {
    inputErr = e
  }
  ok(!!inputErr, '输入不存在时开流失败（不会假装在播）')
  // 注意：引擎在**出帧模式**下对"文件不存在"给的是"无法识别的容器"（fMP4 模式给的
  // 是"文件不存在：<路径>"）—— 文案不够准，是引擎侧的小毛病（宿主日志里另有
  // existsSync 复核会写清真正原因）。这条只钉"失败得明确、能读懂"，不钉具体文案。
  ok(
    !!inputErr && /不存在|No such file|os error 2|无法识别|Unrecognized/i.test(`${inputErr.message}`),
    `失败原因能读懂（${inputErr && inputErr.message}）`
  )

  // 3.8 纯音频文件也走引擎：音频解成 PCM 包流，没有视频轨不该是错误
  const audioSample = prepareAudioSample(tmp)
  if (!audioSample) {
    process.stdout.write('  · 纯音频样片拿不到（没有 afconvert / 系统音效）：跳过\n')
  } else {
    const resA = new FakeResponse()
    const playerA = new EnginePlayer({ enginePath: bin, input: audioSample })
    const metaA = await playerA.openStream(resA)
    eq(metaA.decodeMode, 'frames', '纯音频也走引擎解码（同一个内核）')
    ok(!!metaA.audio && metaA.audio.kind === KIND_AUDIO, '元信息里带音频参数（采样率/声道数）')
    ok(!(metaA.tracks || []).some((t) => t.kind === KIND_VIDEO), '没有视频轨（这是正常情况，不是错误）')
    ok(await waitFor(() => resA.ended, 30000), '纯音频的流正常结束')
    const parsedA = parseChunk(new Uint8Array(resA.bytes))
    ok(!parsedA.bad && parsedA.packets.length > 0, `纯音频也切得出包（${parsedA.packets.length} 个）`)
    ok(parsedA.packets.every((p) => p.kind === KIND_AUDIO), '全是声音包（没有画面）')
    eq(parsedA.rest.length, 0, '整条流切完不留残余')
  }
}

rmSync(tmp, { recursive: true, force: true })

// ---------- 汇总 ----------
process.stdout.write(`\n通过 ${passed} 项`)
if (failures.length) {
  process.stdout.write(`，失败 ${failures.length} 项：\n`)
  for (const f of failures) process.stdout.write(`  - ${f}\n`)
  process.exit(1)
}
process.stdout.write('，全部通过\n')
