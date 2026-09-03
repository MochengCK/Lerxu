#!/usr/bin/env node
/**
 * Lerxu 引擎运行时测试（CI 与本地通用，纯 Node 零依赖）
 *
 * 覆盖三类验证：
 *   1. 引擎可执行性 —— 在当前平台启动 extra/<platform>/<arch>/engine/xfercore，
 *      通过 JSON-RPC getVersion 探活（验证二进制架构 / 动态库加载 / RPC 栈）。
 *   2. HTTP 下载 —— 本地 HTTP 服务器提供随机数据（支持 Range 多连接分片），
 *      经引擎 addUri 下载，完成后逐字节校验。
 *   3. BT 下载 —— 本地极简 HTTP tracker + 双引擎实例组成闭环 swarm：
 *      实例 A 做种（种子由内置 bencode 生成器产出），实例 B 下载，完成后逐字节校验。
 *      全程仅使用 loopback/本机地址，不依赖任何外网资源。
 *
 * 用法：node test/engine/run.js [--engine-dir <path>] [--keep]
 * 退出码：0 = 全部通过；1 = 任一失败。
 */

import { spawn, execSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

// ---------- CLI ----------
const argv = process.argv.slice(2)
function argValue (name) {
  const i = argv.indexOf(name)
  return i !== -1 ? argv[i + 1] : null
}
const KEEP_ARTIFACTS = argv.includes('--keep')

// ---------- 平台 / 引擎路径 ----------
const PLATFORM = process.platform // darwin | win32 | linux
const ARCH = process.arch // x64 | arm64 ...
const ENGINE_BIN_NAME = PLATFORM === 'win32' ? 'xfercore.exe' : 'xfercore'

function resolveEngineDir () {
  const custom = argValue('--engine-dir')
  if (custom) return path.resolve(custom)
  return path.join(PROJECT_ROOT, 'extra', PLATFORM, ARCH, 'engine')
}

// ---------- 本机对外 IP（tracker peers 必须用非 loopback 地址：
//            aria2 系引擎会将与本机地址相同的 peer 视为“自己”而不连接） ----------
function detectLanIp () {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return '127.0.0.1'
}
const LAN_IP = detectLanIp()

// ---------- 日志 ----------
const t0 = Date.now()
function log (tag, msg) {
  const secs = ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
  process.stdout.write(`[${secs}s] [${tag}] ${msg}\n`)
}
function die (msg) {
  process.stderr.write(`FATAL: ${msg}\n`)
  process.exit(1)
}

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

// ---------- JSON-RPC 客户端 ----------
function rpcOnce (port, secret, method, params = [], timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: `lerxu-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      params: secret ? [`token:${secret}`, ...params] : params
    })
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/jsonrpc',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (data.error) return reject(new Error(`RPC error(${data.error.code}): ${data.error.message}`))
          resolve(data.result)
        } catch (e) {
          reject(new Error(`RPC response parse fail: ${e.message}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('RPC request timeout')) })
    req.write(body)
    req.end()
  })
}

async function waitEngineReady (port, secret, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const v = await rpcOnce(port, secret, 'aria2.getVersion')
      return v
    } catch (e) {
      lastErr = e
      await sleep(400)
    }
  }
  throw new Error(`engine RPC not ready on :${port} within ${timeoutMs}ms (${lastErr ? lastErr.message : 'unknown'})`)
}

// ---------- 引擎进程管理 ----------
const aliveEngines = []

async function startEngine ({ name, rpcPort, btPort, workDir }) {
  const engineDir = resolveEngineDir()
  const bin = path.join(engineDir, ENGINE_BIN_NAME)
  if (!existsSync(bin)) die(`engine binary not found: ${bin}`)
  // xfercore 的 Logger 打不开文件会直接退出（Engine.js 有同样记录），先确保目录存在
  mkdirSync(workDir, { recursive: true })
  if (PLATFORM !== 'win32') {
    try {
      const st = statSync(bin)
      if ((Number(st.mode) & 0o111) === 0) chmodSync(bin, 0o755)
    } catch (_) {}
  }

  const args = [
    `--dir=${workDir}`,
    '--enable-rpc=true',
    `--rpc-listen-port=${rpcPort}`,
    '--rpc-listen-all=false',
    `--rpc-secret=${name}-secret`,
    '--file-allocation=none',
    '--continue=true',
    '--allow-overwrite=true',
    '--auto-file-renaming=false',
    '--disk-cache=16M',
    '--max-concurrent-downloads=8',
    '--max-connection-per-server=8',
    '--split=8',
    '--min-split-size=1M',
    `--log=${path.join(workDir, `${name}.log`)}`,
    '--log-level=debug',
    // BT：完全闭环，仅本地 tracker，不触碰外网（DHT/LPD/PEX 全关）
    '--enable-dht=false',
    '--enable-dht6=false',
    '--bt-enable-lpd=false',
    '--enable-peer-exchange=false',
    `--listen-port=${btPort}`,
    // 强制 TCP 传输：xfercore 默认 both（uTP 优先），实测 uTP 在
    // loopback/LAN 场景握手后无响应且长时间不回退 TCP，导致下载停滞
    '--bt-connect-protocol=tcp',
    `--bt-tracker=http://127.0.0.1:${TRACKER_PORT}/announce`,
    '--bt-request-timeout=30',
    '--bt-stop-timeout=0',
    '--seed-ratio=0'
  ]

  const child = spawn(bin, args, {
    cwd: engineDir, // 与应用一致：引擎依赖 lib/ 内动态库（rpath 相对引擎目录）
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const tail = []
  const capture = (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (!line.trim()) continue
      tail.push(line)
      if (tail.length > 40) tail.shift()
    }
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  child.on('exit', (code, signal) => {
    log(name, `process exited (code=${code} signal=${signal})`)
  })
  aliveEngines.push({ name, child, rpcPort, tail })

  const version = await waitEngineReady(rpcPort, `${name}-secret`)
  log(name, `engine ready: ${version.version} (rpc=${rpcPort} bt=${btPort} pid=${child.pid})`)
  return { name, child, rpcPort, secret: `${name}-secret`, tail }
}

async function shutdownAll () {
  for (const e of [...aliveEngines].reverse()) {
    try { await rpcOnce(e.rpcPort, `${e.name}-secret`, 'aria2.shutdown', [[]], 3000) } catch (_) {}
  }
  await sleep(500)
  for (const e of aliveEngines) {
    if (!e.child.killed && e.child.exitCode === null) {
      try { e.child.kill(PLATFORM === 'win32' ? undefined : 'SIGKILL') } catch (_) {}
    }
  }
}

process.on('exit', () => {
  for (const e of aliveEngines) {
    if (e.child.exitCode === null) {
      try { e.child.kill() } catch (_) {}
    }
  }
})
process.on('SIGINT', () => process.exit(130))
process.on('SIGTERM', () => process.exit(143))

// ---------- 极简 HTTP 静态服务器（支持 Range，供 HTTP 下载测试） ----------
function startHttpFileServer (port, payload) {
  const server = http.createServer((req, res) => {
    const range = req.headers.range
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (m) {
        let start = m[1] === '' ? 0 : parseInt(m[1], 10)
        let end = m[2] === '' ? payload.length - 1 : parseInt(m[2], 10)
        if (isNaN(start) || start >= payload.length) start = 0
        if (isNaN(end) || end >= payload.length) end = payload.length - 1
        if (start <= end) {
          res.writeHead(206, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': end - start + 1,
            'Content-Range': `bytes ${start}-${end}/${payload.length}`,
            'Accept-Ranges': 'bytes'
          })
          res.end(payload.subarray(start, end + 1))
          return
        }
      }
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.length,
      'Accept-Ranges': 'bytes'
    })
    res.end(payload)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

// ---------- 极简 BT HTTP tracker（闭环 swarm 的 peer 交换中枢） ----------
// raw 提取 percent-encoded 二进制参数（info_hash 为 20 字节，不能用 UTF-8 query 解析）
function rawQueryValue (url, key) {
  const re = new RegExp(`[?&]${key}=([^&]*)`)
  const m = re.exec(url)
  if (!m) return null
  const raw = m[1]
  const out = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '%') {
      out.push(parseInt(raw.slice(i + 1, i + 3), 16))
      i += 2
    } else if (raw[i] === '+') {
      out.push(32)
    } else {
      out.push(raw.charCodeAt(i))
    }
  }
  return Buffer.from(out)
}

function bencode (val) {
  const bufs = []
  const enc = (v) => {
    if (typeof v === 'number') {
      bufs.push(Buffer.from(`i${v}e`))
    } else if (typeof v === 'string' || Buffer.isBuffer(v)) {
      // byte string：<byteLength>:<raw bytes>（字符串与二进制同构）
      const b = Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8')
      bufs.push(Buffer.from(`${b.length}:`))
      bufs.push(b)
    } else if (Array.isArray(v)) {
      bufs.push(Buffer.from('l'))
      v.forEach(enc)
      bufs.push(Buffer.from('e'))
    } else if (v && typeof v === 'object') {
      bufs.push(Buffer.from('d'))
      for (const k of Object.keys(v).sort()) {
        enc(k)
        enc(v[k])
      }
      bufs.push(Buffer.from('e'))
    }
  }
  enc(val)
  return Buffer.concat(bufs)
}

function startTracker (port) {
  const swarms = new Map() // infoHashHex -> Map(port -> port)
  const server = http.createServer((req, res) => {
    // xfercore 的 announce 请求行可能是绝对 URI（proxy 风格）也可能是相对路径，
    // 统一剥掉 scheme://host 再判断
    const pathname = req.url.replace(/^https?:\/\/[^/]+/i, '')
    if (!pathname.startsWith('/announce')) {
      log('tracker', `404 for unexpected url: ${req.url.slice(0, 120)}`)
      res.writeHead(404).end()
      return
    }
    const infoHashBuf = rawQueryValue(req.url, 'info_hash')
    const peerPort = parseInt((rawQueryValue(req.url, 'port') || '').toString() || '0', 10)
    if (!infoHashBuf || infoHashBuf.length !== 20 || !peerPort) {
      res.writeHead(400).end()
      return
    }
    const hex = infoHashBuf.toString('hex')
    if (!swarms.has(hex)) swarms.set(hex, new Map())
    swarms.get(hex).set(peerPort, peerPort)

    const ipBytes = LAN_IP.split('.').map(x => parseInt(x, 10) & 0xff)
    const peersBufs = []
    for (const p of swarms.get(hex).values()) {
      // 不把通告者自己的端口返回给它自己，避免引擎自连挂起
      if (p === peerPort) continue
      const b = Buffer.alloc(6)
      b[0] = ipBytes[0]; b[1] = ipBytes[1]; b[2] = ipBytes[2]; b[3] = ipBytes[3]
      b.writeUInt16BE(p, 4)
      peersBufs.push(b)
    }
    const body = bencode({
      complete: 0,
      incomplete: swarms.get(hex).size,
      interval: 1,
      'min interval': 1,
      peers: Buffer.concat(peersBufs)
    })
    log('tracker', `announce from :${peerPort} swarm=${hex.slice(0, 8)} peers=${swarms.get(hex).size} ip=${LAN_IP}`)
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': body.length })
    res.end(body)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => resolve(server))
  })
}

// ---------- 种子（.torrent）生成 ----------
function buildTorrentFile ({ name, data, pieceLength = 262144, trackerPort }) {
  const pieces = []
  for (let off = 0; off < data.length; off += pieceLength) {
    pieces.push(createHash('sha1').update(data.subarray(off, off + pieceLength)).digest())
  }
  const info = { name, length: data.length, 'piece length': pieceLength, pieces: Buffer.concat(pieces) }
  const torrent = bencode({ info, announce: `http://127.0.0.1:${trackerPort}/announce` })
  const infoHash = createHash('sha1').update(bencode(info)).digest('hex')
  return { torrent, infoHash }
}

// ---------- 等待工具 ----------
// tellStatus 轮询（对 xfercore BT 任务的 "GID xx is not unique" 已知怪癖容错：
// 该错误出现时退化为文件级完成检测——目标文件达到期望大小且 .aria2 控制文件消失）
async function waitTaskDone (engine, gid, { timeoutMs = 180000, expectFile = null, expectSize = 0 } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastProgress = ''
  let notUniqueWarned = false
  while (Date.now() < deadline) {
    // 文件级完成检测：不受引擎 RPC 怪癖影响。
    // 下载完成 = 目标文件达到期望大小且 .aria2 控制文件已消失
    if (expectFile && expectSize > 0 && existsSync(expectFile) && !existsSync(expectFile + '.aria2')) {
      const size = statSync(expectFile).size
      if (size === expectSize) {
        log(engine.name, `file-level completion detected: ${path.basename(expectFile)} (${size} bytes)`)
        return null
      }
    }
    try {
      const st = await rpcOnce(engine.rpcPort, engine.secret, 'aria2.tellStatus', [gid])
      if (st.totalLength && st.totalLength !== '0') {
        const pct = Math.floor((Number(st.completedLength) / Number(st.totalLength)) * 100)
        const prog = `${pct}% dl=${st.downloadSpeed}B/s conns=${st.connections || 0}`
        if (prog !== lastProgress) {
          lastProgress = prog
          log(engine.name, `task ${gid} ${st.status} ${prog}`)
        }
      }
      if (st.status === 'complete') return st
      if (st.status === 'error') {
        throw new Error(`task ${gid} failed: errorCode=${st.errorCode} errorMessage=${st.errorMessage || ''}`)
      }
    } catch (e) {
      if (/is not unique/.test(e.message) && !notUniqueWarned) {
        notUniqueWarned = true
        log('warn', `xfercore reported "${e.message.replace(/RPC error\(1\): /, '')}" on ${engine.name}; relying on file-level completion check (known xfercore quirk, data integrity is still verified)`)
      }
    }
    await sleep(800)
  }
  throw new Error(`task ${gid} not done within ${timeoutMs}ms`)
}

function assertFileEquals (file, expected, label) {
  if (!existsSync(file)) die(`${label}: downloaded file missing: ${file}`)
  const actual = readFileSync(file)
  if (actual.length !== expected.length) {
    die(`${label}: size mismatch actual=${actual.length} expected=${expected.length}`)
  }
  if (!actual.equals(expected)) die(`${label}: content mismatch (bytes differ)`)
  log('verify', `${label}: content OK (${expected.length} bytes)`)
}

// ---------- 测试主体 ----------
const RPC_PORT_A = 16801
const RPC_PORT_B = 16802
const BT_PORT_A = 21311
const BT_PORT_B = 21312
const HTTP_FILE_PORT = 18701
const TRACKER_PORT = 17899

let tmpRoot = null
const cleanupFns = []

async function main () {
  const engineDir = resolveEngineDir()
  if (!existsSync(engineDir)) die(`engine dir not found: ${engineDir}`)
  log('setup', `platform=${PLATFORM} arch=${ARCH} engineDir=${engineDir}`)
  log('setup', `LAN IP for tracker peers: ${LAN_IP}`)

  tmpRoot = path.join(os.tmpdir(), `lerxu-engine-test-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })
  log('setup', `workdir=${tmpRoot}`)
  if (!KEEP_ARTIFACTS) cleanupFns.push(() => { try { rmSync(tmpRoot, { recursive: true, force: true }) } catch (_) {} })

  const trackerServer = await startTracker(TRACKER_PORT)
  cleanupFns.push(() => trackerServer.close())
  log('setup', `local BT tracker listening :${TRACKER_PORT}`)

  // ---- 1. 启动双引擎实例（覆盖：二进制可执行、动态库加载、RPC 栈） ----
  const engineA = await startEngine({ name: 'engine-a', rpcPort: RPC_PORT_A, btPort: BT_PORT_A, workDir: path.join(tmpRoot, 'a') })
  const engineB = await startEngine({ name: 'engine-b', rpcPort: RPC_PORT_B, btPort: BT_PORT_B, workDir: path.join(tmpRoot, 'b') })

  // ---- 2. HTTP 下载测试（4MB 随机数据，Range 多连接分片） ----
  log('test', '=== HTTP download test ===')
  const httpPayload = randomBytes(4 * 1024 * 1024)
  const fileServer = await startHttpFileServer(HTTP_FILE_PORT, httpPayload)
  cleanupFns.push(() => fileServer.close())
  const [httpGid] = await rpcOnce(engineA.rpcPort, engineA.secret, 'aria2.addUri', [
    [`http://127.0.0.1:${HTTP_FILE_PORT}/http-test.bin`],
    { out: 'http-test.bin' }
  ])
  log('engine-a', `HTTP task gid=${httpGid}`)
  await waitTaskDone(engineA, httpGid, { timeoutMs: 120000 })
  assertFileEquals(path.join(tmpRoot, 'a', 'http-test.bin'), httpPayload, 'HTTP download')

  // ---- 3. BT 下载测试（A 做种 / B 下载，本地 tracker 闭环） ----
  log('test', '=== BT download test (local tracker swarm) ===')
  const btPayload = randomBytes(1024 * 1024)
  const seedDir = path.join(tmpRoot, 'a', 'seed')
  mkdirSync(seedDir, { recursive: true })
  writeFileSync(path.join(seedDir, 'bt-test.bin'), btPayload)
  const { torrent, infoHash } = buildTorrentFile({ name: 'bt-test.bin', data: btPayload, trackerPort: TRACKER_PORT })
  log('engine-a', `torrent built infoHash=${infoHash}`)

  // A：对已有完整文件 addTorrent + 完整性校验 → 转入做种
  const [seedGid] = await rpcOnce(engineA.rpcPort, engineA.secret, 'aria2.addTorrent', [
    torrent.toString('base64'),
    [],
    { dir: seedDir, 'check-integrity': 'true' }
  ])
  log('engine-a', `seed task gid=${seedGid}`)
  // 做种端就位判定：已完成校验（completed==total）即开始提供 piece
  await waitTaskDone(engineA, seedGid, {
    timeoutMs: 60000,
    expectFile: path.join(seedDir, 'bt-test.bin'),
    expectSize: btPayload.length
  })

  // B：从 swarm 下载同一 torrent（完成后校验；文件级检测兜底 gid 冲突怪癖）
  const [dlGid] = await rpcOnce(engineB.rpcPort, engineB.secret, 'aria2.addTorrent', [
    torrent.toString('base64'),
    [],
    { dir: path.join(tmpRoot, 'b') }
  ])
  log('engine-b', `download task gid=${dlGid}`)
  await waitTaskDone(engineB, dlGid, {
    timeoutMs: 90000,
    expectFile: path.join(tmpRoot, 'b', 'bt-test.bin'),
    expectSize: btPayload.length
  })
  assertFileEquals(path.join(tmpRoot, 'b', 'bt-test.bin'), btPayload, 'BT download')

  // ---- 收尾 ----
  await shutdownAll()
  for (const fn of cleanupFns.reverse()) { try { fn() } catch (_) {} }

  log('result', 'ALL ENGINE TESTS PASSED (rpc / http-download / bt-download)')
  process.exit(0)
}

main().catch(async (e) => {
  process.stderr.write(`\nTEST FAILED: ${e.message}\n`)
  for (const en of aliveEngines) {
    if (en.tail.length) {
      process.stderr.write(`\n--- ${en.name} output tail ---\n${en.tail.join('\n')}\n`)
    }
  }
  await shutdownAll().catch(() => {})
  for (const fn of cleanupFns.reverse()) { try { fn() } catch (_) {} }
  process.exit(1)
})
