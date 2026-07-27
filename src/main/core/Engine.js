import { spawn, spawnSync } from 'node:child_process'
import { accessSync, chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFile, writeFile, unlink } from 'node:fs'
import { resolve } from 'node:path'
import is from 'electron-is'

import logger from './Logger'
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
import { getEngineConnectionPolicy } from '@shared/utils'

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
  }

  async start () {
    const pidPath = getEnginePidPath()
    logger.info('[Motrix] Engie pid path:', pidPath)

    if (this.instance) {
      return
    }

    // 启动前清理可能存在的孤儿引擎进程。上次退出若异常（如崩溃、
    // 强制结束主进程），PID 文件会残留且对应进程仍存活，此时若直接
    // spawn 新进程会导致两个引擎并存，旧进程继续下载、占用端口。
    await this.killStaleProcess(pidPath)

    const originBinPath = this.getEngineBinPath()
    const binPath = this.prepareEngineBinary(originBinPath)

    const args = this.getStartArgs(binPath)

    const enableEngineLogs = is.dev() || is.linux() || is.windows()
    logger.info('[Motrix] engine bin path:', binPath)
    logger.info('[Motrix] engine start args:', args)

    // 获取引擎所在目录作为工作目录
    const engineDir = require('path').dirname(binPath)
    this.instance = spawn(binPath, args, {
      windowsHide: true,
      stdio: enableEngineLogs ? 'pipe' : 'ignore',
      cwd: engineDir
    })

    this.instance.on('error', (err) => {
      logger.error('[Motrix] engine process error:', err && err.message ? err.message : err)
    })
    if (typeof this.instance.pid !== 'number') {
      logger.error('[Motrix] engine process pid is invalid:', this.instance.pid)
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
      logger.warn('[Motrix] engine process exited:', code, signal)
      try {
        unlink(pidPath, (err) => {
          if (err) {
            logger.warn(`[Motrix] Unlink engine process pid file failed: ${err}`)
          }
        })
      } catch (err) {
        logger.warn(`[Motrix] Unlink engine process pid file failed: ${err}`)
      }

      // 清理实例引用
      this.instance = null

      // 触发自动重启检查
      this.checkAndRestartEngine(code, signal)
    })

    if (enableEngineLogs) {
      this.instance.stdout.on('data', (data) => {
        logger.log('[Motrix] engine stdout===>', data.toString())
      })

      this.instance.stderr.on('data', (data) => {
        logger.error('[Motrix] engine stderr===>', data.toString())
      })
    }

    // 注册进程级保底清理。Node.js 的 spawn 默认不会在父进程退出时
    // 自动杀子进程，子进程会被 init 接管成为孤儿继续运行。
    // process.on('exit') 是主进程退出的最后机会，同步执行，必须在此
    // 同步发信号杀掉引擎，否则任何异步路径（will-quit/setImmediate/
    // setTimeout）都可能在主进程退出前没机会执行。
    this.registerExitHandlers()
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
      logger.warn(`[Motrix] Received ${signal}, stopping engine before exit`)
      // 同步发 SIGTERM，给 aria2 保存 session 的机会
      this.stop(1500).finally(() => {
        // 信号处理后立即退出（不能阻塞太久，系统关机有超时）
        process.exit(0)
      })
    }
    process.on('SIGTERM', () => onSignal('SIGTERM'))
    process.on('SIGINT', () => onSignal('SIGINT'))

    // Electron 主进程未捕获异常时触发，保底杀引擎
    process.on('uncaughtException', (err) => {
      logger.error('[Motrix] Uncaught exception:', err && err.message)
      onExit()
      process.exit(1)
    })
  }

  prepareEngineBinary (originBinPath) {
    const p = originBinPath ? resolve(`${originBinPath}`) : ''
    if (!p || platform === 'win32') {
      return p
    }

    const tryUnquarantine = (fp) => {
      if (!is.macOS() || !fp) {
        return
      }
      const args = ['-dr', 'com.apple.quarantine', fp]
      try {
        spawnSync('xattr', args, { windowsHide: true, timeout: 3000 })
        return
      } catch (_) {}
      try {
        spawnSync('/usr/bin/xattr', args, { windowsHide: true, timeout: 3000 })
      } catch (_) {}
    }

    const canExecute = (fp) => {
      try {
        accessSync(fp, constants.X_OK)
        return true
      } catch (_) {
        return false
      }
    }

    const runVersionCheck = (fp) => {
      if (!is.macOS() || !fp) {
        return { ok: true, detail: '' }
      }
      try {
        const r = spawnSync(fp, ['--version'], {
          windowsHide: true,
          timeout: 5000,
          encoding: 'utf8',
          maxBuffer: 1024 * 128,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        if (r && r.error) {
          const c = r.error && r.error.code ? String(r.error.code) : ''
          return { ok: false, detail: `spawn_error=${r.error.message}${c ? ` code=${c}` : ''}` }
        }
        if (!r || r.status !== 0) {
          const status = r && typeof r.status === 'number' ? String(r.status) : 'unknown'
          const signal = r && r.signal ? String(r.signal) : ''
          const stderr = r && r.stderr ? String(r.stderr).trim() : ''
          const stderrLine = stderr ? `\nstderr=${stderr.slice(0, 600)}` : ''
          return { ok: false, detail: `exit_status=${status}${signal ? ` signal=${signal}` : ''}${stderrLine}` }
        }
        return { ok: true, detail: '' }
      } catch (e) {
        return { ok: false, detail: `exception=${e && e.message ? e.message : String(e)}` }
      }
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

    tryUnquarantine(p)
    tryChmod(p)
    const originalCheck = canExecute(p) ? runVersionCheck(p) : { ok: false, detail: 'not_executable' }
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
        logger.warn('[Motrix] Copy engine to userData failed:', e && e.message ? e.message : e)
        const err = new Error(this.i18n.t('app.engine-damaged-message'))
        err.details = [
          `platform=${platform} arch=${arch}`,
          `origin=${p}`,
          `origin_check=${originalCheck && originalCheck.detail ? originalCheck.detail : 'unknown'}`,
          `copy_failed=${e && e.message ? e.message : String(e)}`
        ].join('\n')
        throw err
      }

      tryChmod(destPath)
      tryUnquarantine(destPath)

      if (canExecute(destPath)) {
        const copiedCheck = runVersionCheck(destPath)
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
      logger.warn('[Motrix] prepareEngineBinary failed:', e && e.message ? e.message : e)
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
    logger.info('[Motrix] engine.stop.instance')
    if (!this.instance) {
      return Promise.resolve()
    }
    const instance = this.instance
    // 立即置空，避免重入时重复 kill / 重复注册监听器
    this.instance = null

    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(killTimer)
        resolve()
      }

      // 子进程退出时（无论正常还是被信号杀掉）触发 close 事件
      instance.once('close', (code, signal) => {
        logger.info('[Motrix] engine process closed during stop:', code, signal)
        finish()
      })

      // 先发 SIGTERM 优雅关闭（aria2 会保存 session）
      try {
        instance.kill('SIGTERM')
      } catch (err) {
        logger.warn('[Motrix] engine SIGTERM failed:', err && err.message)
        finish()
        return
      }

      // 超时后 SIGKILL 强制终止，防止 aria2 卡死（如磁盘 IO 阻塞、
      // BT 种子校验）导致 SIGTERM 被忽略、进程永不退出
      const killTimer = setTimeout(() => {
        if (!settled) {
          logger.warn(`[Motrix] engine SIGTERM timeout after ${timeout}ms, sending SIGKILL`)
          try {
            instance.kill('SIGKILL')
          } catch (err) {
            logger.warn('[Motrix] engine SIGKILL failed:', err && err.message)
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
        logger.error(`[Motrix] Write engine process pid failed: ${err}`)
      }
    })
  }

  // 检查并自动重启引擎
  checkAndRestartEngine (exitCode, signal) {
    const now = Date.now()
    const timeSinceLastRestart = now - Engine.lastRestartTime

    // 如果是正常退出或收到SIGTERM，不重启
    if (signal === 'SIGTERM' || exitCode === 0) {
      logger.info('[Motrix] Engine exited normally, not restarting')
      Engine.restartAttempts = 0
      return
    }

    // 检查重启条件
    if (Engine.restartAttempts >= Engine.maxRestartAttempts) {
      logger.error(`[Motrix] Engine restart attempts (${Engine.restartAttempts}) exceeded maximum (${Engine.maxRestartAttempts})`)
      return
    }

    // 如果距离上次重启时间太短，延迟重启
    if (timeSinceLastRestart < 5000) {
      const delay = 5000 - timeSinceLastRestart
      logger.warn(`[Motrix] Engine crash detected, will restart in ${delay}ms (attempt ${Engine.restartAttempts + 1}/${Engine.maxRestartAttempts})`)

      if (this.restartTimer) {
        clearTimeout(this.restartTimer)
      }

      this.restartTimer = setTimeout(() => {
        this.performEngineRestart()
      }, delay)
    } else {
      logger.warn(`[Motrix] Engine crash detected, restarting immediately (attempt ${Engine.restartAttempts + 1}/${Engine.maxRestartAttempts})`)
      this.performEngineRestart()
    }
  }

  performEngineRestart () {
    Engine.restartAttempts++
    Engine.lastRestartTime = Date.now()

    try {
      // 清理可能残留的旧进程
      this.killStaleProcess(getEnginePidPath()).then(() => {
        logger.info('[Motrix] Starting automatic engine restart')
        this.start().catch((error) => {
          logger.error('[Motrix] Failed to restart engine:', error.message)
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
      logger.error('[Motrix] Error during engine restart:', error.message)
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
        logger.warn(`[Motrix] Found stale engine process pid=${pid}, killing it`)
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

    // 优先从ConfigManager获取最新配置
    if (this.configManager) {
      binName = this.configManager.getUserConfig('engine-binary') || ''
      logger.info(`[Motrix] Got engine from config manager: ${binName}`)
    } else {
      // 降级：从传入的userConfig对象获取
      binName = this.userConfig['engine-binary'] || ''
      logger.info(`[Motrix] Got engine from user config: ${binName}`)
    }

    // 获取可用引擎列表（递归扫描子目录）
    const availableEngines = []
    const scannedPaths = new Set() // 避免重复扫描

    const scanDirectory = (dirPath, relativePrefix = '') => {
      // 防止循环引用或重复扫描
      const realPath = require('fs').realpathSync(dirPath)
      if (scannedPaths.has(realPath)) {
        return
      }
      scannedPaths.add(realPath)

      try {
        const files = require('fs').readdirSync(dirPath)
        files.forEach(file => {
          const fullPath = resolve(dirPath, file)
          const relativePath = relativePrefix ? `${relativePrefix}/${file}` : file
          const stats = require('fs').lstatSync(fullPath)

          if (stats.isDirectory()) {
            // 递归扫描子目录
            scanDirectory(fullPath, relativePath)
          } else if (stats.isFile()) {
            const defaultBinName = getEngineBin(platform)
            const isCandidate = file.includes('fluxcore') || file === defaultBinName
            let isExecutable = platform === 'win32'
              ? file.endsWith('.exe')
              : (stats.mode & parseInt('111', 8)) !== 0
            if (!isExecutable && platform !== 'win32' && isCandidate) {
              try {
                chmodSync(fullPath, 0o755)
                const nextStats = require('fs').lstatSync(fullPath)
                isExecutable = (nextStats.mode & parseInt('111', 8)) !== 0
              } catch (_) {}
            }

            if ((isExecutable || platform !== 'win32') &&
                isCandidate &&
                !file.endsWith('.backup') && !file.endsWith('.tmp')) {
              availableEngines.push(relativePath)
            }
          }
        })
      } catch (error) {
        logger.warn(`[Motrix] Failed to scan directory ${dirPath}:`, error.message)
      }
    }

    try {
      scanDirectory(enginePath)

      const fluxCoreRelative = 'src/FluxCore.exe'
      const fluxCoreFullPath = resolve(enginePath, fluxCoreRelative)
      if (existsSync(fluxCoreFullPath) && !availableEngines.includes(fluxCoreRelative)) {
        availableEngines.push(fluxCoreRelative)
      }
    } catch (error) {
      logger.error('[Motrix] Failed to scan engine directory:', error)
    }

    // 1. 检查当前配置的引擎是否存在
    if (binName) {
      const binPath = resolve(enginePath, binName)
      if (!existsSync(binPath)) {
        // 当前配置的引擎不存在，尝试使用可用引擎
        logger.warn(`[Motrix] Configured engine ${binName} not found, trying to find available engines`)
        binName = ''
      }
    }

    // 2. 如果用户没有配置引擎或配置的引擎不存在，尝试查找默认引擎或可用引擎
    if (!binName) {
      // 默认引擎文件名
      const defaultBinName = getEngineBin(platform)
      const defaultPath = resolve(enginePath, defaultBinName)

      if (existsSync(defaultPath)) {
        // 默认引擎文件存在，使用默认引擎
        binName = defaultBinName
      } else if (availableEngines.length > 0) {
        // 默认引擎文件不存在，使用可用引擎
        // 优先选择包含 fluxcore 的引擎
        const specificEngine = availableEngines.find(file => /fluxcore(\.exe)?$/i.test(file))
        if (specificEngine) {
          binName = specificEngine
        } else {
          // 最后使用第一个找到的引擎
          binName = availableEngines[0]
        }
        // 保存为默认引擎，下次启动使用
        logger.info(`[Motrix] Using available engine ${binName} as default`)
        // 使用ConfigManager保存配置到文件
        if (this.configManager) {
          this.configManager.setUserConfig('engine-binary', binName)
          logger.info(`[Motrix] Engine configuration saved: ${binName}`)
        } else {
          logger.warn('[Motrix] ConfigManager not available, cannot save engine configuration')
        }
      } else {
        // 没有找到任何引擎文件，使用默认引擎名（会失败）
        binName = defaultBinName
      }
    }

    const result = resolve(enginePath, binName)
    const binIsExist = existsSync(result)
    if (!binIsExist) {
      logger.error('[Motrix] engine bin is not exist:', result)
      const e = new Error(this.i18n.t('app.engine-missing-message'))
      e.details = [
        `platform=${platform} arch=${arch}`,
        `engine_path=${enginePath}`,
        `configured=${binName || ''}`,
        `available=${Array.isArray(availableEngines) ? availableEngines.join(',') : ''}`,
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

  getStartArgs (binPath) {
    const confPath = getAria2ConfPath(platform, arch)
    const logPath = getAria2LogPath()

    const sessionPath = getSessionPath()
    const sessionIsExist = existsSync(sessionPath)

    // 添加日志路径和日志级别参数
    let result = [
      `--conf-path=${confPath}`,
      `--save-session=${sessionPath}`,
      `--log=${logPath}`,
      '--log-level=debug'
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
    const splitBaseline = Math.min(splitMax, allowedMax >= 128 ? 128 : (allowedMax >= 64 ? 64 : 16))
    const baseSplit = desiredSplit >= splitBaseline ? desiredSplit : splitBaseline
    extraConfig.split = Math.min(baseSplit, splitMax)

    const keepSeeding = this.userConfig['keep-seeding']
    const seedRatio = this.systemConfig['seed-ratio']
    if (keepSeeding || seedRatio === 0) {
      extraConfig['seed-ratio'] = 0
      delete extraConfig['seed-time']
    }

    if (extraConfig['bt-encryption-mode'] !== undefined) {
      const mode = extraConfig['bt-encryption-mode']
      if (mode === 'force') {
        extraConfig['bt-require-crypto'] = true
        extraConfig['bt-min-crypto-level'] = 'arc4'
      } else if (mode === 'none') {
        extraConfig['bt-require-crypto'] = false
        extraConfig['bt-min-crypto-level'] = 'plain'
      } else {
        extraConfig['bt-require-crypto'] = false
        extraConfig['bt-min-crypto-level'] = 'arc4'
      }
      delete extraConfig['bt-encryption-mode']
      delete extraConfig['bt-force-encryption']
    }

    console.log('extraConfig===>', extraConfig)

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

  restart () {
    this.stop()
    this.start()
  }
}
