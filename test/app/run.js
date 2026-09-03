#!/usr/bin/env node
/**
 * Lerxu 应用冒烟测试（CI 与本地通用，纯 Node 零依赖）
 *
 * 覆盖三类验证：
 *   1. 应用可运行 —— 启动打包后的应用（unpacked 目录 / .app / .exe），
 *      等待主进程完成 init 并拉起引擎子进程（Linux 走 afterPackHook 生成的
 *      bash wrapper，与用户真实启动方式一致）。
 *   2. 引擎可用 —— 应用启动时生成随机 rpc-secret（持久化在
 *      <userData>/system.json），本测试先以无 token 探测 RPC（收到
 *      "Unauthorized" 即证明 RPC 栈存活），再读出 secret 完成
 *      aria2.getVersion 鉴权调用，验证「应用 → 引擎 → RPC」完整链路。
 *   3. HTTP 下载 —— 本地 HTTP 服务器提供随机数据，经应用拉起的引擎
 *      addUri 下载（走应用真实的 aria2.conf + 配置合并链路），完成后逐字节校验。
 *
 * BT 下载的完整闭环测试见 test/engine/run.js（对同一份打包引擎二进制执行）。
 *
 * 用法：node test/app/run.js [--app <path-to-app-binary>] [--timeout <sec>]
 * 退出码：0 = 全部通过；1 = 任一失败。
 */

import { spawn, execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import http from 'node:http'
import { randomBytes } from 'node:crypto'
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
const TIMEOUT_SEC = parseInt(argValue('--timeout') || '90', 10)

// ---------- 平台 ----------
const PLATFORM = process.platform // darwin | win32 | linux
const APP_RPC_PORT = 16800
const HTTP_FILE_PORT = 18702
const IS_WIN = PLATFORM === 'win32'

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

// ---------- 定位应用二进制 ----------
function resolveAppBin () {
  const custom = argValue('--app')
  if (custom) return path.resolve(custom)

  const releaseDir = path.join(PROJECT_ROOT, 'release')
  if (!existsSync(releaseDir)) die(`release dir not found: ${releaseDir} (run build first)`)

  if (PLATFORM === 'win32') {
    const bin = path.join(releaseDir, 'win-unpacked', 'Lerxu.exe')
    if (!existsSync(bin)) die(`app binary not found: ${bin}`)
    return bin
  }

  if (PLATFORM === 'linux') {
    // afterPackHook 将真实二进制改名为 lerxu.bin，并生成 bash wrapper `lerxu`
    const bin = path.join(releaseDir, 'linux-unpacked', 'lerxu')
    if (!existsSync(bin)) die(`app binary not found: ${bin}`)
    return bin
  }

  // darwin：mac/（默认命名）或 mac-arm64/（显式指定 arm64 时），优先当前架构
  const hostArch = os.arch() // arm64 | x64
  const candidates = readdirSync(releaseDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^mac/.test(e.name))
    .map(e => e.name)
    .sort((a, b) => {
      const score = (n) => (n === `mac-${hostArch}` ? 0 : (n === 'mac' ? 1 : 2))
      return score(a) - score(b)
    })
  for (const dir of candidates) {
    const bin = path.join(releaseDir, dir, 'Lerxu.app', 'Contents', 'MacOS', 'Lerxu')
    if (existsSync(bin)) return bin
  }
  die(`app binary not found under ${releaseDir}/mac*/Lerxu.app (dirs: ${candidates.join(', ') || 'none'})`)
}

// ---------- JSON-RPC ----------
function rpcOnce (secret, method, params = [], timeoutMs = 10000) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: `lerxu-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      params: secret ? [`token:${secret}`, ...params] : params
    })
    const req = http.request({
      host: '127.0.0.1',
      port: APP_RPC_PORT,
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
          resolve({ ok: true, data })
        } catch (e) {
          resolve({ ok: false, error: `parse fail: ${e.message}` })
        }
      })
    })
    req.on('error', (e) => resolve({ ok: false, error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }) })
    req.write(body)
    req.end()
  })
}

/**
 * 探测引擎 RPC 存活。
 * - 返回 result            → 引擎存活且无 secret（理论上首启会生成 secret，此分支兜底）
 * - 返回 error.code === 1  → 引擎存活但鉴权拒绝（"Unauthorized"），同样是存活的证明
 */
async function probeEngineAlive () {
  const r = await rpcOnce('', 'aria2.getVersion')
  if (r.ok && r.data.result) return { alive: true, authorized: true, version: r.data.result.version }
  if (r.ok && r.data.error && Number(r.data.error.code) === 1) return { alive: true, authorized: false }
  return { alive: false, detail: r.ok ? JSON.stringify(r.data).slice(0, 200) : r.error }
}

// ---------- userData 定位与 secret 读取 ----------
function detectUserDataDir () {
  const base = PLATFORM === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : PLATFORM === 'win32'
      ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
      : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'))
  // Electron 取 package.json 的 name（无 productName 字段）→ 目录为小写 lerxu；
  // 同时兼容 Lerxu 大小写变体，取包含 system.json 且最新的那个
  const candidates = ['lerxu', 'Lerxu']
    .map(name => path.join(base, name))
    .filter(dir => existsSync(dir))
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const mtime = (dir) => {
      try { return statSync(path.join(dir, 'system.json')).mtimeMs } catch (_) { return 0 }
    }
    return mtime(b) - mtime(a)
  })
  return candidates[0]
}

async function waitRpcSecret (timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    const userDataDir = detectUserDataDir()
    const systemJsonPath = userDataDir ? path.join(userDataDir, 'system.json') : null
    if (systemJsonPath && existsSync(systemJsonPath)) {
      try {
        const conf = JSON.parse(readFileSync(systemJsonPath, 'utf8'))
        if (typeof conf['rpc-secret'] === 'string') {
          return { secret: conf['rpc-secret'], userDataDir, systemJsonPath }
        }
        lastErr = new Error('system.json exists but rpc-secret missing')
      } catch (e) {
        lastErr = e
      }
    } else {
      lastErr = new Error(`system.json not found: ${systemJsonPath || '(no userData dir)'}`)
    }
    await sleep(500)
  }
  throw new Error(`rpc-secret not available within ${timeoutMs}ms (${lastErr ? lastErr.message : 'unknown'})`)
}

// ---------- 本机对外 IP（与 engine 测试同因：引擎不连 loopback peer） ----------
function detectLanIp () {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return '127.0.0.1'
}

// ---------- 极简 HTTP 静态服务器（支持 Range） ----------
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
    server.listen(port, '0.0.0.0', () => resolve(server))
  })
}

// ---------- 应用进程管理 ----------
let appChild = null
const appTail = []

function spawnApp (binPath) {
  const args = ['--disable-gpu']
  if (PLATFORM === 'linux') args.push('--no-sandbox') // wrapper 也会加，双保险

  appChild = spawn(binPath, args, {
    cwd: path.dirname(binPath),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  })

  const capture = (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (!line.trim()) continue
      appTail.push(line)
      if (appTail.length > 40) appTail.shift()
    }
  }
  appChild.stdout.on('data', capture)
  appChild.stderr.on('data', capture)
  appChild.on('exit', (code, signal) => {
    log('app', `process exited (code=${code} signal=${signal})`)
  })
  log('app', `spawned pid=${appChild.pid} bin=${binPath} args=${args.join(' ')}`)
}

async function stopApp () {
  if (!appChild || appChild.exitCode !== null) return
  if (IS_WIN) {
    // 树杀：Electron 主进程 + 引擎子进程一并结束
    try {
      await new Promise((resolve) => {
        execFile('taskkill', ['/PID', String(appChild.pid), '/T', '/F'], { windowsHide: true }, () => resolve())
      })
    } catch (_) {}
  } else {
    try { appChild.kill('SIGTERM') } catch (_) {}
  }
  // 优雅退出最多等 8s，超时强杀
  const deadline = Date.now() + 8000
  while (appChild.exitCode === null && Date.now() < deadline) await sleep(200)
  if (appChild.exitCode === null) {
    log('warn', 'app did not exit after SIGTERM, sending SIGKILL')
    if (IS_WIN) {
      try { execFile('taskkill', ['/PID', String(appChild.pid), '/T', '/F'], { windowsHide: true }, () => {}) } catch (_) {}
    } else {
      try { appChild.kill('SIGKILL') } catch (_) {}
    }
  }
  // Windows 下引擎可能成为孤儿，按进程名兜底清理
  if (IS_WIN) {
    try { execFile('taskkill', ['/IM', 'xfercore.exe', '/F'], { windowsHide: true }, () => {}) } catch (_) {}
  }
  await sleep(300)
}

process.on('exit', () => {
  if (appChild && appChild.exitCode === null) {
    try { appChild.kill(IS_WIN ? undefined : 'SIGKILL') } catch (_) {}
  }
})
process.on('SIGINT', () => process.exit(130))
process.on('SIGTERM', () => process.exit(143))

// ---------- 主流程 ----------
async function main () {
  const appBin = resolveAppBin()
  log('setup', `platform=${PLATFORM} arch=${process.arch} appBin=${appBin}`)
  log('setup', `LAN IP for local HTTP server: ${detectLanIp()}`)

  const tmpRoot = path.join(os.tmpdir(), `lerxu-app-smoke-${Date.now()}`)
  const downloadDir = path.join(tmpRoot, 'downloads')
  mkdirSync(downloadDir, { recursive: true })
  log('setup', `workdir=${tmpRoot}`)

  const fileServer = await startHttpFileServer(HTTP_FILE_PORT, randomBytes(1024 * 1024))
  const httpPayloadSize = 1024 * 1024
  log('setup', `local HTTP file server listening :${HTTP_FILE_PORT} (${httpPayloadSize} bytes)`)

  try {
    // ---- 1. 启动应用 ----
    spawnApp(appBin)

    // ---- 2. 等待应用拉起引擎（RPC 探活） ----
    log('test', '=== wait for app engine RPC ===')
    const deadline = Date.now() + TIMEOUT_SEC * 1000
    let alive = null
    while (Date.now() < deadline) {
      if (appChild.exitCode !== null) {
        throw new Error(`app exited too early (code=${appChild.exitCode}) before engine RPC became ready.\n--- app output tail ---\n${appTail.join('\n')}`)
      }
      alive = await probeEngineAlive()
      if (alive.alive) break
      await sleep(600)
    }
    if (!alive || !alive.alive) {
      throw new Error(`engine RPC not ready on :${APP_RPC_PORT} within ${TIMEOUT_SEC}s (${alive ? alive.detail : 'unknown'})\n--- app output tail ---\n${appTail.join('\n')}`)
    }
    log('app', `engine RPC alive (authorized=${alive.authorized}${alive.version ? ` version=${alive.version}` : ''})`)

    // ---- 3. 读取 rpc-secret，完成鉴权 getVersion ----
    const { secret, systemJsonPath } = await waitRpcSecret()
    log('app', `rpc-secret loaded from ${systemJsonPath} (len=${secret.length})`)
    const authed = await rpcOnce(secret, 'aria2.getVersion')
    if (!authed.ok || !authed.data.result) {
      throw new Error(`authorized getVersion failed: ${authed.ok ? JSON.stringify(authed.data).slice(0, 200) : authed.error}`)
    }
    log('app', `authorized getVersion OK: engine=${authed.data.result.version}`)

    // ---- 4. 经应用引擎做 HTTP 下载端到端校验 ----
    log('test', '=== HTTP download via app engine ===')
    const outName = 'app-smoke-http.bin'
    const expectFile = path.join(downloadDir, outName)
    const [gid] = await rpcOnce(secret, 'aria2.addUri', [
      [`http://${detectLanIp()}:${HTTP_FILE_PORT}/app-smoke-http.bin`],
      { dir: downloadDir, out: outName }
    ]).then(r => {
      if (!r.ok || !r.data.result) {
        throw new Error(`addUri failed: ${r.ok ? JSON.stringify(r.data).slice(0, 200) : r.error}`)
      }
      return r.data.result
    })
    log('app', `HTTP task gid=${gid}`)

    const dlDeadline = Date.now() + 120000
    let done = false
    let lastProgress = ''
    while (Date.now() < dlDeadline) {
      // 文件级完成检测（对 xfercore 的 gid 怪癖容错，见 engine 测试同名逻辑）
      if (existsSync(expectFile) && !existsSync(expectFile + '.aria2') && statSync(expectFile).size === httpPayloadSize) {
        done = true
        break
      }
      try {
        const st = await rpcOnce(secret, 'aria2.tellStatus', [gid])
        if (st.ok && st.data.result) {
          const s = st.data.result
          if (s.totalLength && s.totalLength !== '0') {
            const pct = Math.floor((Number(s.completedLength) / Number(s.totalLength)) * 100)
            const prog = `${s.status} ${pct}%`
            if (prog !== lastProgress) { lastProgress = prog; log('app', `task ${gid} ${prog}`) }
          }
          if (s.status === 'error') {
            throw new Error(`download failed: errorCode=${s.errorCode} errorMessage=${s.errorMessage || ''}`)
          }
        }
      } catch (e) {
        if (/download failed/.test(e.message)) throw e
        // tellStatus 偶发怪癖（GID not unique 等）忽略，靠文件级检测兜底
      }
      await sleep(700)
    }
    if (!done) throw new Error(`HTTP download not finished within 120s`)
    const actual = readFileSync(expectFile)
    const served = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${HTTP_FILE_PORT}/app-smoke-http.bin`, (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      }).on('error', () => resolve(null))
    })
    if (!served || !actual.equals(served)) throw new Error('HTTP download content mismatch')
    log('verify', `HTTP download via app engine: content OK (${served.length} bytes)`)

    // ---- 5. 退出应用 ----
    log('test', '=== shutdown app ===')
    await stopApp()
    log('result', 'ALL APP SMOKE TESTS PASSED (app-launch / engine-rpc / http-download)')
    process.exit(0)
  } catch (e) {
    process.stderr.write(`\nTEST FAILED: ${e.message}\n`)
    if (appTail.length) {
      process.stderr.write(`\n--- app output tail ---\n${appTail.join('\n')}\n`)
    }
    await stopApp().catch(() => {})
    process.exit(1)
  } finally {
    fileServer.close()
    try { rmSync(tmpRoot, { recursive: true, force: true }) } catch (_) {}
  }
}

main()
