import { spawn, spawnSync } from 'node:child_process'
import { accessSync, chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, writeFile, unlink } from 'node:fs'
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

  constructor (options = {}) {
    this.options = options

    this.i18n = getI18n()
    this.systemConfig = options.systemConfig
    this.userConfig = options.userConfig
    this.configManager = options.configManager // 接收ConfigManager实例
  }

  async start () {
    const pidPath = getEnginePidPath()
    logger.info('[Motrix] Engie pid path:', pidPath)

    if (this.instance) {
      return
    }

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
    })

    if (enableEngineLogs) {
      this.instance.stdout.on('data', (data) => {
        logger.log('[Motrix] engine stdout===>', data.toString())
      })

      this.instance.stderr.on('data', (data) => {
        logger.error('[Motrix] engine stderr===>', data.toString())
      })
    }
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

  stop () {
    logger.info('[Motrix] engine.stop.instance')
    if (this.instance) {
      this.instance.kill()
      this.instance = null
    }
  }

  writePidFile (pidPath, pid) {
    writeFile(pidPath, pid, (err) => {
      if (err) {
        logger.error(`[Motrix] Write engine process pid failed: ${err}`)
      }
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
