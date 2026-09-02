import { spawn, execFile } from 'node:child_process'
import { accessSync, chmodSync, constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFile, readFileSync, unlink, unlinkSync, writeFile, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import is from 'electron-is'

import logger from './LogManager'
import {
  getI18n
} from '../ui/Locale'
import {
  getEnginePidPath,
  getAria2ConfPath,
  getSessionPath,
  getUserDataPath,
  getAria2LogPath,
  transformConfig,
  getEngineBin,
  getEnginePath
} from '../utils/index'
import { ensureDhtRoutingTable } from '../utils/dht'
import { getEngineConnectionPolicy, normalizeBtEncryptionOptions } from '@shared/utils'

const { platform, arch } = process

export default class Engine {
  // ChildProcess | null
  static instance = null
  static restartAttempts = 0
  static maxRestartAttempts = 5
  static lastRestartTime = 0

  constructor (options = {}) {
    this.options = options

    this.i18n = getI18n()
    this.systemConfig = options.systemConfig
    this.userConfig = options.userConfig
    this.configManager = options.configManager // 接收ConfigManager实例
    this.restartTimer = null
    this._startingPromise = null
  }

  async start () {
    // 并发锁：自动重启 / 手动 restart / resetSession 可能交错触发 start，
    // 重入时返回同一个 Promise，避免两个引擎进程并存抢 RPC/BT 端口。
    if (this._startingPromise) {
      return this._startingPromise
    }
    this._startingPromise = this._doStart()
    try {
      return await this._startingPromise
    } finally {
      this._startingPromise = null
    }
  }

  async _doStart () {
    const pidPath = getEnginePidPath()
    logger.info('[Lerxu] Engine pid path:', pidPath)

    if (this.instance) {
      return
    }
    // 重新启动前清除主动停止标记
    this._stopping = false

    // 启动前清理可能存在的孤儿引擎进程。上次退出若异常（如崩溃、
    // 强制结束主进程），PID 文件会残留且对应进程仍存活，此时若直接
    // spawn 新进程会导致两个引擎并存，旧进程继续下载、占用端口。
    await this.killStaleProcess(pidPath)

    // 启动前截断旧日志，防止日志文件无限增长占用磁盘
    this.truncateAria2Log()

    const originBinPath = this.getEngineBinPath()
    // 二进制可用性检查（xattr/版本探测）为异步子进程调用，不阻塞主进程
    // 事件循环（主窗口此时已先行创建，阻塞会冻结渲染进程 bootstrap）；
    // 同一会话内缓存结果，避免引擎重启时重复探测。
    const binPath = this._preparedBinPath || await this.prepareEngineBinary(originBinPath)
    if (binPath) {
      this._preparedBinPath = binPath
    }

    const args = this.getStartArgs(binPath)

    // 首次启动时预热 DHT 路由表（预置引导节点），加速 DHT 网络接入。
    // 必须在 spawn 引擎之前完成，失败静默跳过，不影响启动。
    await this.prepareDhtBootstrap()

    const enableEngineLogs = is.dev() || is.linux() || is.windows()
    logger.info('[Lerxu] engine bin path:', binPath)
    logger.info('[Lerxu] engine start args:', args)

    // 获取引擎所在目录作为工作目录
    const engineDir = require('path').dirname(binPath)
    this.instance = spawn(binPath, args, {
      windowsHide: true,
      stdio: enableEngineLogs ? 'pipe' : 'ignore',
      cwd: engineDir
    })

    this.instance.on('error', (err) => {
      logger.error('[Lerxu] engine process error:', err && err.message ? err.message : err)
    })
    if (typeof this.instance.pid !== 'number') {
      logger.error('[Lerxu] engine process pid is invalid:', this.instance.pid)
      const e = new Error(this.i18n.t('app.engine-damaged-message'))
      e.details = [
        `platform=${platform} arch=${arch}`,
        `binPath=${binPath}`,
        `args=${Array.isArray(args) ? args.join(' ') : ''}`,
        `pid=${String(this.instance.pid)}`
      ].join('\n')
      throw e
    }
    const pid = String(this.instance.pid)
    this.writePidFile(pidPath, pid)

    this.instance.once('close', (code, signal) => {
      logger.warn('[Lerxu] engine process exited:', code, signal)
      try {
        unlink(pidPath, (err) => {
          if (err) {
            logger.warn(`[Lerxu] Unlink engine process pid file failed: ${err}`)
          }
        })
      } catch (err) {
        logger.warn(`[Lerxu] Unlink engine process pid file failed: ${err}`)
      }

      // 清理实例引用
      this.instance = null

      // 触发自动重启检查
      this.checkAndRestartEngine(code, signal)
    })

    if (enableEngineLogs) {
      this.instance.stdout.on('data', (data) => {
        logger.log('[Lerxu] engine stdout===>', data.toString())
      })

      this.instance.stderr.on('data', (data) => {
        logger.error('[Lerxu] engine stderr===>', data.toString())
      })
    }

    // 注册进程级保底清理。Node.js 的 spawn 默认不会在父进程退出时
    // 自动杀子进程，子进程会被 init 接管成为孤儿继续运行。
    // process.on('exit') 是主进程退出的最后机会，同步执行，必须在此
    // 同步发信号杀掉引擎，否则任何异步路径（will-quit/setImmediate/
    // setTimeout）都可能在主进程退出前没机会执行。
    this.registerExitHandlers()
  }

  /**
   * DHT 路由表预热。首次运行（dht.dat / dht6.dat 不存在）时，
   * 预置公共 DHT 引导节点，让引擎启动后立即有可联系节点并强制
   * bucket refresh，大幅加快磁链 / BT 任务的节点发现速度。
   * 引擎运行后会自行维护路由表文件，此逻辑只在文件缺失时介入。
   * 整个过程有超时保护，失败静默跳过，不阻塞引擎启动。
   */
  async prepareDhtBootstrap () {
    const enabled = (v) => v !== false && v !== 'false'
    const job = (async () => {
      const tasks = []
      if (enabled(this.systemConfig['enable-dht'])) {
        tasks.push(ensureDhtRoutingTable(this.systemConfig['dht-file-path'], false))
      }
      if (enabled(this.systemConfig['enable-dht6'])) {
        tasks.push(ensureDhtRoutingTable(this.systemConfig['dht-file-path6'], true))
      }
      const results = await Promise.all(tasks)
      results.forEach((r) => {
        if (r && r.created) {
          logger.info(`[Lerxu] DHT routing table pre-seeded with ${r.nodes} bootstrap nodes`)
        }
      })
    })()

    try {
      // 整体超时兜底：DNS 异常时最多等待 4 秒，不拖慢引擎启动
      await Promise.race([
        job,
        new Promise((resolve) => setTimeout(resolve, 4000))
      ])
    } catch (e) {
      logger.warn('[Lerxu] DHT bootstrap pre-seed skipped:', e && e.message ? e.message : e)
    }
  }

  // 注册进程级退出处理器，确保任何退出路径下引擎都会被清理：
  // 1. process.on('exit') — 主进程退出的最后机会，同步执行
  // 2. process.on('SIGTERM'/'SIGINT') — 外部信号（kill、Ctrl-C、系统关机）
  // 这些处理器是保底机制，与 Application.quit() 的优雅关闭路径互补。
  // 如果优雅关闭已经杀掉引擎（this.instance = null），这里不会重复操作。
  registerExitHandlers () {
    if (this.exitHandlersRegistered) {
      return
    }
    this.exitHandlersRegistered = true

    // 主进程退出的最后机会。只能同步操作。
    // 无论之前是否调用过 engine.stop()，只要 this.instance 还在
    // （说明优雅关闭没完成），就同步发 SIGKILL 强制终止。
    const onExit = () => {
      if (this.instance) {
        const inst = this.instance
        this.instance = null
        try {
          inst.kill('SIGKILL')
        } catch (_) {}
      }
    }
    process.on('exit', onExit)

    // 外部信号：kill <pid>、Ctrl-C（开发模式）、系统关机/注销。
    // 这些信号默认不会触发 Electron 的 before-quit/will-quit 事件，
    // 不注册的话引擎会直接变孤儿。
    const onSignal = (signal) => {
      logger.warn(`[Lerxu] Received ${signal}, stopping engine before exit`)
      // 同步发 SIGTERM，给 aria2 保存 session 的机会
      this.stop(1500).finally(() => {
        // 信号处理后立即退出（不能阻塞太久，系统关机有超时）
        process.exit(0)
      })
    }
    process.on('SIGTERM', () => onSignal('SIGTERM'))
    process.on('SIGINT', () => onSignal('SIGINT'))

    // Electron 主进程未捕获异常时触发，保底杀引擎。
    // 不主动 process.exit：上报/弹窗由 ExceptionHandler 统一负责，
    // 普通异常不应直接杀掉整个应用；若进程真的退出，'exit' 处理器会兜底。
    process.on('uncaughtException', (err) => {
      logger.error('[Lerxu] Uncaught exception, killing engine:', err && err.message)
      onExit()
    })
  }

  async prepareEngineBinary (originBinPath) {
    const p = originBinPath ? resolve(`${originBinPath}`) : ''
    if (!p || platform === 'win32') {
      return p
    }

    // 异步执行子进程（带超时），resolve 而不 reject，调用方按 error 判断。
    // 原实现用 spawnSync，最长 3~5s 的同步等待会冻结主进程事件循环，
    // 阻塞渲染进程 bootstrap 的同步 IPC（get-app-config）。
    const execFileAsync = (cmd, args, options = {}) => new Promise((resolve) => {
      execFile(cmd, args, { windowsHide: true, encoding: 'utf8', ...options }, (error, stdout, stderr) => {
        resolve({ error, stdout, stderr })
      })
    })

    const tryUnquarantine = async (fp) => {
      if (!is.macOS() || !fp) {
        return
      }
      const args = ['-dr', 'com.apple.quarantine', fp]
      const r = await execFileAsync('xattr', args, { timeout: 3000 })
      if (!r.error) {
        return
      }
      await execFileAsync('/usr/bin/xattr', args, { timeout: 3000 })
    }

    const canExecute = (fp) => {
      try {
        accessSync(fp, constants.X_OK)
        return true
      } catch (_) {
        return false
      }
    }

    const runVersionCheck = async (fp) => {
      if (!is.macOS() || !fp) {
        return { ok: true, detail: '' }
      }
      const r = await execFileAsync(fp, ['--version'], {
        timeout: 5000,
        maxBuffer: 1024 * 128
      })
      if (r.error) {
        const code = typeof r.error.code !== 'undefined' ? String(r.error.code) : ''
        const signal = r.error.signal ? String(r.error.signal) : ''
        const stderr = r.stderr ? String(r.stderr).trim() : ''
        const stderrLine = stderr ? `\nstderr=${stderr.slice(0, 600)}` : ''
        return {
          ok: false,
          detail: `spawn_or_exit_error=${r.error.message}${code ? ` code=${code}` : ''}${signal ? ` signal=${signal}` : ''}${stderrLine}`
        }
      }
      return { ok: true, detail: '' }
    }

    const tryChmod = (fp) => {
      try {
        const st = lstatSync(fp)
        const mode = Number(st && st.mode) || 0
        if ((mode & parseInt('111', 8)) !== 0) {
          return true
        }
      } catch (_) {}
      try {
        chmodSync(fp, 0o755)
        return true
      } catch (_) {
        return false
      }
    }

    await tryUnquarantine(p)
    tryChmod(p)
    const originalCheck = canExecute(p) ? await runVersionCheck(p) : { ok: false, detail: 'not_executable' }
    if (canExecute(p) && originalCheck.ok) {
      return p
    }

    let lastError = null
    try {
      const destDir = resolve(getUserDataPath(), 'engine')
      try {
        mkdirSync(destDir, { recursive: true })
      } catch (_) {}

      const name = p.split(/[\\/]/).pop() || 'aria2c'
      const destPath = resolve(destDir, name)
      try {
        copyFileSync(p, destPath)
      } catch (e) {
        logger.warn('[Lerxu] Copy engine to userData failed:', e && e.message ? e.message : e)
        const err = new Error(this.i18n.t('app.engine-damaged-message'))
        err.details = [
          `platform=${platform} arch=${arch}`,
          `origin=${p}`,
          `origin_check=${originalCheck && originalCheck.detail ? originalCheck.detail : 'unknown'}`,
          `copy_failed=${e && e.message ? e.message : String(e)}`
        ].join('\n')
        throw err
      }

      // 复制 lib/ 目录（macOS 动态库依赖）
      if (is.macOS()) {
        const srcDir = dirname(p)
        const srcLib = join(srcDir, 'lib')
        if (existsSync(srcLib)) {
          const destLib = join(destDir, 'lib')
          try {
            cpSync(srcLib, destLib, { recursive: true, force: true })
            logger.info('[Lerxu] Copied engine lib directory to userData:', destLib)
          } catch (e) {
            logger.warn('[Lerxu] Copy engine lib directory failed:', e && e.message ? e.message : e)
          }
        }
      }

      tryChmod(destPath)
      await tryUnquarantine(destPath)

      if (canExecute(destPath)) {
        const copiedCheck = await runVersionCheck(destPath)
        if (copiedCheck.ok) {
          return destPath
        }
        const e = new Error(this.i18n.t('app.engine-damaged-message'))
        e.details = [
          `platform=${platform} arch=${arch}`,
          `origin=${p}`,
          `origin_check=${originalCheck && originalCheck.detail ? originalCheck.detail : 'unknown'}`,
          `copied=${destPath}`,
          `copied_check=${copiedCheck && copiedCheck.detail ? copiedCheck.detail : 'unknown'}`
        ].join('\n')
        throw e
      }
      const err = new Error(this.i18n.t('app.engine-damaged-message'))
      err.details = [
        `platform=${platform} arch=${arch}`,
        `origin=${p}`,
        `origin_check=${originalCheck && originalCheck.detail ? originalCheck.detail : 'unknown'}`,
        `copied=${destPath}`,
        'copied_check=not_executable'
      ].join('\n')
      throw err
    } catch (e) {
      logger.warn('[Lerxu] prepareEngineBinary failed:', e && e.message ? e.message : e)
      lastError = e
    }

    if (lastError) {
      throw lastError
    }
    const err = new Error(this.i18n.t('app.engine-damaged-message'))
    err.details = [
      `platform=${platform} arch=${arch}`,
      `origin=${p}`,
      `origin_check=${originalCheck && originalCheck.detail ? originalCheck.detail : 'unknown'}`,
      'copy_skipped=unknown_reason'
    ].join('\n')
    throw err
  }

  // 停止引擎子进程。先发 SIGTERM 优雅关闭，超时后 SIGKILL 兜底。
  // 返回 Promise，resolve 时子进程已退出（或 kill 信号已发出且无法等待）。
  // 调用方应 await 本方法，确保 app.exit() 前子进程已被清理，否则引擎会
  // 变成孤儿进程继续占用端口、写 session 文件。
  stop (timeout = 3000) {
    logger.info('[Lerxu] engine.stop.instance')
    if (!this.instance) {
      return Promise.resolve()
    }
    const instance = this.instance
    // 立即置空，避免重入时重复 kill / 重复注册监听器
    this.instance = null
    // 标记正在主动停止，避免退出流程中 SIGKILL 兜底被误判为崩溃而重启
    this._stopping = true

    return new Promise((resolve) => {
      let settled = false
      let killTimer = null
      const finish = () => {
        if (settled) {
          return
        }
        settled = true
        if (killTimer) {
          clearTimeout(killTimer)
          killTimer = null
        }
        resolve()
      }

      // 子进程退出时（无论正常还是被信号杀掉）触发 close 事件
      instance.once('close', (code, signal) => {
        logger.info('[Lerxu] engine process closed during stop:', code, signal)
        finish()
      })

      // 先发 SIGTERM 优雅关闭（aria2 会保存 session）
      try {
        instance.kill('SIGTERM')
      } catch (err) {
        logger.warn('[Lerxu] engine SIGTERM failed:', err && err.message)
        finish()
        return
      }

      // 超时后 SIGKILL 强制终止，防止 aria2 卡死（如磁盘 IO 阻塞、
      // BT 种子校验）导致 SIGTERM 被忽略、进程永不退出
      killTimer = setTimeout(() => {
        if (!settled) {
          logger.warn(`[Lerxu] engine SIGTERM timeout after ${timeout}ms, sending SIGKILL`)
          try {
            instance.kill('SIGKILL')
          } catch (err) {
            logger.warn('[Lerxu] engine SIGKILL failed:', err && err.message)
            // 即使 SIGKILL 失败也 resolve，避免阻塞退出流程
            finish()
          }
        }
      }, timeout)
    })
  }

  writePidFile (pidPath, pid) {
    writeFile(pidPath, pid, (err) => {
      if (err) {
        logger.error(`[Lerxu] Write engine process pid failed: ${err}`)
      }
    })
  }

  // 检查并自动重启引擎
  checkAndRestartEngine (exitCode, signal) {
    // 主动停止（应用退出/手动停止）时不重启，避免 SIGKILL 兜底被误判为崩溃
    if (this._stopping) {
      logger.info('[Lerxu] Engine stopped intentionally, not restarting')
      if (this.restartTimer) {
        clearTimeout(this.restartTimer)
        this.restartTimer = null
      }
      return
    }

    const now = Date.now()
    const timeSinceLastRestart = now - Engine.lastRestartTime

    // 如果是正常退出或收到SIGTERM，不重启
    if (signal === 'SIGTERM' || exitCode === 0) {
      logger.info('[Lerxu] Engine exited normally, not restarting')
      Engine.restartAttempts = 0
      return
    }

    // 检查重启条件
    if (Engine.restartAttempts >= Engine.maxRestartAttempts) {
      logger.error(`[Lerxu] Engine restart attempts (${Engine.restartAttempts}) exceeded maximum (${Engine.maxRestartAttempts})`)
      return
    }

    // 如果距离上次重启时间太短，延迟重启
    if (timeSinceLastRestart < 5000) {
      const delay = 5000 - timeSinceLastRestart
      logger.warn(`[Lerxu] Engine crash detected, will restart in ${delay}ms (attempt ${Engine.restartAttempts + 1}/${Engine.maxRestartAttempts})`)

      if (this.restartTimer) {
        clearTimeout(this.restartTimer)
      }

      this.restartTimer = setTimeout(() => {
        this.performEngineRestart()
      }, delay)
    } else {
      logger.warn(`[Lerxu] Engine crash detected, restarting immediately (attempt ${Engine.restartAttempts + 1}/${Engine.maxRestartAttempts})`)
      this.performEngineRestart()
    }
  }

  performEngineRestart () {
    Engine.restartAttempts++
    Engine.lastRestartTime = Date.now()

    try {
      // 清理可能残留的旧进程
      this.killStaleProcess(getEnginePidPath()).then(() => {
        logger.info('[Lerxu] Starting automatic engine restart')
        this.start().then(() => {
          // 引擎成功重启后复位计数，使 maxRestartAttempts 仅针对"连续崩溃"生效，
          // 而非整个应用生命周期的累计崩溃次数，避免恢复后仍因历史计数而停摆
          Engine.restartAttempts = 0
          logger.info('[Lerxu] Engine restarted successfully, restart attempts reset')
        }).catch((error) => {
          logger.error('[Lerxu] Failed to restart engine:', error.message)
          // 如果重启失败，指数退避延迟下一次尝试
          const delay = Math.pow(2, Engine.restartAttempts) * 1000
          if (Engine.restartAttempts < Engine.maxRestartAttempts) {
            this.restartTimer = setTimeout(() => {
              this.performEngineRestart()
            }, Math.min(delay, 30000)) // 最大延迟30秒
          }
        })
      })
    } catch (error) {
      logger.error('[Lerxu] Error during engine restart:', error.message)
    }
  }

  // 读取 PID 文件并清理可能残留的孤儿引擎进程。
  // 返回 true 表示清理了一个存活进程，false 表示无残留或已退出。
  killStaleProcess (pidPath) {
    return new Promise((resolve) => {
      readFile(pidPath, 'utf8', (err, data) => {
        if (err) {
          // 文件不存在或读不出，无孤儿可清理
          resolve(false)
          return
        }
        const pid = Number(String(data).trim())
        if (!Number.isFinite(pid) || pid <= 0) {
          // PID 无效，清理残留的 pid 文件
          unlink(pidPath, () => resolve(false))
          return
        }
        // 用 signal 0 探活：不发信号，仅检查进程是否存在
        let alive = false
        try {
          process.kill(pid, 0)
          alive = true
        } catch (_) {
          // ESRCH: 进程不存在；EPERM: 无权限（视为不可清理）
          alive = false
        }
        if (!alive) {
          unlink(pidPath, () => resolve(false))
          return
        }
        logger.warn(`[Lerxu] Found stale engine process pid=${pid}, killing it`)
        // 先 SIGTERM 优雅关闭，1.5s 后 SIGKILL 兜底
        try {
          process.kill(pid, 'SIGTERM')
        } catch (_) {
          unlink(pidPath, () => resolve(false))
          return
        }
        const killTimer = setTimeout(() => {
          try {
            process.kill(pid, 'SIGKILL')
          } catch (_) {
            // ignore
          }
        }, 1500)
        // 等待进程退出（轮询探活，最多 2s）
        const start = Date.now()
        const poll = () => {
          try {
            process.kill(pid, 0)
            if (Date.now() - start < 2000) {
              setTimeout(poll, 100)
            } else {
              clearTimeout(killTimer)
              unlink(pidPath, () => resolve(true))
            }
          } catch (_) {
            clearTimeout(killTimer)
            unlink(pidPath, () => resolve(true))
          }
        }
        poll()
      })
    })
  }

  getEngineBinPath () {
    let binName = ''
    const enginePath = getEnginePath(platform, arch)

    // 直接使用 xfercore 作为引擎，不再支持多引擎选择
    binName = getEngineBin(platform)
    logger.info(`[Lerxu] Using engine: ${binName}`)

    const result = resolve(enginePath, binName)
    const binIsExist = existsSync(result)
    if (!binIsExist) {
      logger.error('[Lerxu] engine bin is not exist:', result)
      const e = new Error(this.i18n.t('app.engine-missing-message'))
      e.details = [
        `platform=${platform} arch=${arch}`,
        `engine_path=${enginePath}`,
        `configured=${binName || ''}`,
        `engine_binary=${binName}`,
        `missing=${result}`
      ].join('\n')
      throw e
    }
    if (platform !== 'win32') {
      try {
        const st = lstatSync(result)
        const mode = Number(st && st.mode) || 0
        if ((mode & parseInt('111', 8)) === 0) {
          chmodSync(result, 0o755)
        }
      } catch (_) {}
    }

    return result
  }

  /**
   * 将用户设置的日志级别映射到 aria2 的日志级别
   * aria2 支持的级别: debug, info, notice, warn, error
   * 默认 warn，避免 debug 级别产生过多日志导致磁盘占用过高
   */
  getAria2LogLevel () {
    const appLevel = (this.userConfig && this.userConfig['log-level']) || 'warn'
    const mapping = {
      error: 'error',
      warn: 'warn',
      info: 'info',
      verbose: 'info',
      debug: 'debug',
      silly: 'debug'
    }
    return mapping[appLevel] || 'warn'
  }

  /**
   * 引擎通过 --input-file 恢复会话，任务级选项优先于全局选项。
   * 全局把 bt-stop-timeout 置 0 后，会话里已固化的旧值（如 300）仍会
   * 作用于恢复的任务，导致重启后零速度 5 分钟被强制停止报错。
   * 启动前把会话中每个任务条目的该选项同步为当前配置值，0 则删除该行。
   */
  syncSessionBtStopTimeout (sessionPath) {
    try {
      const desired = Number(this.systemConfig && this.systemConfig['bt-stop-timeout']) || 0
      const raw = readFileSync(sessionPath, 'utf8')
      if (!raw || raw.indexOf('bt-stop-timeout=') === -1) {
        return
      }
      const lines = raw.split('\n')
      const updated = []
      let changed = false
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const m = line.match(/^(\s*)bt-stop-timeout=(\d+)\s*$/)
        if (!m) {
          updated.push(line)
          continue
        }
        changed = true
        if (desired > 0) {
          updated.push(`${m[1]}bt-stop-timeout=${desired}`)
        }
        // desired 为 0：丢弃该行，恢复引擎默认（不自动停止）
      }
      if (changed) {
        writeFileSync(sessionPath, updated.join('\n'))
        logger.info(`[Lerxu] session bt-stop-timeout synced to ${desired}`)
      }
    } catch (e) {
      logger.warn('[Lerxu] sync session bt-stop-timeout failed:', e && e.message ? e.message : e)
    }
  }

  /**
   * 引擎启动前截断旧日志文件，防止日志无限增长占用磁盘
   * 如果日志文件超过 5MB，清空文件内容
   */
  truncateAria2Log () {
    const logPath = getAria2LogPath()
    try {
      if (existsSync(logPath)) {
        // 引擎日志文件可能处于异常状态：xfercore 的 Logger 打开失败时
        // 会直接报错退出（退出码 1/28），导致引擎反复重启后放弃，RPC
        // 端口一直无法连接。已确认"文件存在但引擎打不开"的状态无法靠
        // 内容校验（appendFileSync）识别，因此每次启动前直接删除，
        // 由引擎全新创建，规避任何异常 inode / 权限 / 锁状态。
        unlinkSync(logPath)
      }
    } catch (e) {
      // 删除失败不影响启动
    }
  }

  getStartArgs (binPath) {
    const confPath = getAria2ConfPath(platform, arch)
    const logPath = getAria2LogPath()

    const sessionPath = getSessionPath()
    const sessionIsExist = existsSync(sessionPath)
    if (sessionIsExist) {
      this.syncSessionBtStopTimeout(sessionPath)
    }

    // 根据用户设置的日志级别映射到 aria2 日志级别，默认 warn
    const aria2LogLevel = this.getAria2LogLevel()

    // 添加日志路径和日志级别参数
    let result = [
      `--conf-path=${confPath}`,
      `--save-session=${sessionPath}`,
      `--log=${logPath}`,
      `--log-level=${aria2LogLevel}`
    ]
    if (sessionIsExist) {
      result = [...result, `--input-file=${sessionPath}`]
    }

    // 使用传入的 binPath 或重新获取
    const enginePath = binPath || this.getEngineBinPath()
    const enginePolicy = getEngineConnectionPolicy(enginePath)
    const allowedMax = Math.max(0, Number(enginePolicy.max) || 16)
    const defaultMax = Math.max(0, Number(enginePolicy.defaultMax) || allowedMax)
    const splitMax = Math.max(0, Number(enginePolicy.splitMax) || allowedMax)
    const extraConfig = {
      ...this.systemConfig
    }

    const rawMax = this.systemConfig['max-connection-per-server']
    let desiredMax = Number(rawMax)
    if (!Number.isFinite(desiredMax) || desiredMax <= 0) {
      desiredMax = defaultMax
    }
    extraConfig['max-connection-per-server'] = Math.min(desiredMax, allowedMax)
    const desiredSplit = Number(this.systemConfig.split || 0)
    // 确保 split 至少为 max-connection-per-server 的 2 倍，让连接在
    // 整个下载过程中始终有新片段可下载，避免后期速度下降
    const minSplitForSpeed = Math.max(extraConfig['max-connection-per-server'] * 2, 16)
    const splitBaseline = Math.min(splitMax, Math.max(minSplitForSpeed, allowedMax >= 128 ? 128 : (allowedMax >= 64 ? 64 : 16)))
    const baseSplit = desiredSplit >= splitBaseline ? desiredSplit : splitBaseline
    extraConfig.split = Math.min(baseSplit, splitMax)

    // === 下载速度保障：确保关键参数不被旧配置覆盖 ===
    // min-split-size 过小会导致高带宽下每个分片的 HTTP Range 请求往返
    // 开销占比过高，连接利用率下降（表现为"几秒后速度降低"）；
    // 4M 是分片数与请求开销之间的平衡点
    if (!extraConfig['min-split-size'] || extraConfig['min-split-size'] === '1M' || extraConfig['min-split-size'] === '1m') {
      extraConfig['min-split-size'] = '4M'
    }
    // disk-cache 提供多连接并发写入的缓冲，避免高速下载时缓存被写满、
    // aria2 等待落盘导致的周期性速度抖动
    if (!extraConfig['disk-cache']) {
      extraConfig['disk-cache'] = '128M'
    }
    // keep-alive 关闭会让每个分片请求都新建 TCP/TLS 连接，
    // 高延迟网络下速度骤降，确保开启
    if (extraConfig['enable-http-keep-alive'] === false || extraConfig['enable-http-keep-alive'] === 'false') {
      extraConfig['enable-http-keep-alive'] = true
    }
    // geom 选择器会让后期片段越来越大，并行度递减，改为 default 保持均匀分片
    if (!extraConfig['stream-piece-selector'] || extraConfig['stream-piece-selector'] === 'geom') {
      extraConfig['stream-piece-selector'] = 'default'
    }
    // 删除 enable-http-pipelining，该选项会导致部分 HTTPS 服务器 TLS 握手失败
    delete extraConfig['enable-http-pipelining']
    // 确保 check-certificate 为 false，避免 HTTPS 证书验证导致下载失败
    extraConfig['check-certificate'] = false

    // === 下载容错保障：防止用户旧配置覆盖新的容错参数 ===
    // lowest-speed-limit 过高会导致慢速 CDN（如 dl.hdslb.com）连接被过早中止
    {
      const sp = String(extraConfig['lowest-speed-limit'] || '')
      const num = parseFloat(sp)
      if (!sp || (!isNaN(num) && num > 1024)) {
        extraConfig['lowest-speed-limit'] = '1K'
      }
    }
    // retry-wait >= 5，给 CDN 限流场景更多恢复时间
    {
      const rw = Number(extraConfig['retry-wait'])
      if (!Number.isFinite(rw) || rw < 5) {
        extraConfig['retry-wait'] = 5
      }
    }
    // timeout >= 60，避免大文件传输时连接被过早断开
    {
      const to = Number(extraConfig.timeout)
      if (!Number.isFinite(to) || to < 60) {
        extraConfig.timeout = 60
      }
    }
    // connect-timeout >= 20，给慢速 DNS 解析更多时间
    {
      const ct = Number(extraConfig['connect-timeout'])
      if (!Number.isFinite(ct) || ct < 20) {
        extraConfig['connect-timeout'] = 20
      }
    }

    const keepSeeding = this.userConfig['keep-seeding']
    const seedRatio = this.systemConfig['seed-ratio']
    if (keepSeeding || seedRatio === 0) {
      extraConfig['seed-ratio'] = 0
      delete extraConfig['seed-time']
    }

    if (extraConfig['bt-encryption-mode'] !== undefined || extraConfig['bt-force-encryption'] !== undefined) {
      // normalizeBtEncryptionOptions 会将应用层的 bt-encryption-mode/bt-force-encryption
      // 转换为引擎原生选项（bt-require-crypto/bt-min-crypto-level），但 Object.assign
      // 不会删除原对象中已存在的键，必须显式删除，否则引擎会收到无法识别的
      // --bt-encryption-mode 参数而启动失败（退出码 28）。
      delete extraConfig['bt-encryption-mode']
      delete extraConfig['bt-force-encryption']
      Object.assign(extraConfig, normalizeBtEncryptionOptions(extraConfig))
    }

    // ED2K engine options live in userConfig (they're user preferences),
    // but the engine reads them via getOption() at startup. Merge them
    // into the engine's command-line config so Ed2kDownloadCommand picks
    // up the user's source-discovery settings (KAD, source exchange, etc.).
    // These options are registered in OptionHandlerFactory.cc, so the
    // engine accepts them on the command line.
    const ed2kEngineKeys = [
      'ed2k-enabled',
      'ed2k-listen-port',
      'ed2k-max-connections',
      'ed2k-connection-timeout',
      'ed2k-max-sources-per-file',
      'ed2k-default-servers',
      'ed2k-server-source-enabled',
      'ed2k-source-exchange-enabled',
      'ed2k-source-exchange-interval',
      'ed2k-kad-enabled',
      'ed2k-kad-bootstrap-nodes'
    ]
    for (const k of ed2kEngineKeys) {
      if (this.userConfig[k] !== undefined) {
        extraConfig[k] = this.userConfig[k]
      }
    }

    // NAT traversal / transport toggles live in userConfig (UI layer) but
    // are consumed by the engine at startup (BtSetup / UtpContext). Merge
    // them explicitly so --enable-upnp / --enable-utp / --enable-nat-pmp
    // reach the engine, while keeping them out of the system config that
    // gets pushed via changeGlobalOption (the engine registers these as
    // startup-only options and would reject runtime changes).
    const natTransportEngineKeys = [
      'enable-upnp',
      'enable-utp',
      'enable-nat-pmp',
      'bt-connect-protocol'
    ]
    for (const k of natTransportEngineKeys) {
      const v = this.userConfig[k]
      if (v !== undefined) {
        extraConfig[k] = v
      }
    }

    const extra = transformConfig(extraConfig)
    result = [...result, ...extra]

    return result
  }

  isRunning (pid) {
    try {
      return process.kill(pid, 0)
    } catch (e) {
      return e.code === 'EPERM'
    }
  }

  async restart () {
    // 必须等旧进程完全退出后再启动，否则两个引擎会竞争 RPC/BT 端口
    await this.stop()
    await this.start()
  }
}
