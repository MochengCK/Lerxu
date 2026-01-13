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
  transformConfig,
  getEngineBin,
  getEnginePath
} from '../utils/index'

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

  start () {
    const pidPath = getEnginePidPath()
    logger.info('[Motrix] Engie pid path:', pidPath)

    if (this.instance) {
      return
    }

    const originBinPath = this.getEngineBinPath()
    const binPath = this.prepareEngineBinary(originBinPath)
    const args = this.getStartArgs()

    const enableEngineLogs = is.dev() || is.linux() || is.windows()
    logger.info('[Motrix] engine bin path:', binPath)
    logger.info('[Motrix] engine start args:', args)

    this.instance = spawn(binPath, args, {
      windowsHide: false,
      stdio: enableEngineLogs ? 'pipe' : 'ignore'
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

    // 获取可用引擎列表
    let availableEngines = []
    try {
      const files = require('fs').readdirSync(enginePath)
      availableEngines = files.filter(file => {
        const filePath = resolve(enginePath, file)
        const stats = require('fs').lstatSync(filePath)
        // 检查是否为可执行文件（aria2c）
        const isExecutable = platform === 'win32'
          ? file.endsWith('.exe')
          : (stats.mode & parseInt('111', 8)) !== 0

        return stats.isFile() && isExecutable &&
               file.includes('aria2c') &&
               !file.endsWith('.backup') && !file.endsWith('.tmp')
      })

      const linkCoreRelative = 'src/LinkCore.exe'
      const linkCoreFullPath = resolve(enginePath, linkCoreRelative)
      if (existsSync(linkCoreFullPath)) {
        availableEngines.push(linkCoreRelative)
      }
    } catch (error) {
      logger.error('[Motrix] Failed to read engine directory:', error)
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
        // 优先选择包含1.37.0的aria2c引擎
        const specificEngine = availableEngines.find(file => file.includes('1.37.0'))
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

    return result
  }

  getStartArgs () {
    const confPath = getAria2ConfPath(platform, arch)

    const sessionPath = getSessionPath()
    const sessionIsExist = existsSync(sessionPath)

    let result = [`--conf-path=${confPath}`, `--save-session=${sessionPath}`]
    if (sessionIsExist) {
      result = [...result, `--input-file=${sessionPath}`]
    }

    const binPath = this.getEngineBinPath()
    const is136 = /1\.36\.0/.test(binPath)
    const is137 = /1\.37\.0/.test(binPath)
    const engineFile = String(binPath).split(/[\\/]/).pop() || ''
    const isLinkCoreEngine = /^LinkCore(\.exe)?$/i.test(engineFile)
    const isAria2cFamily = /^aria2c/i.test(engineFile)
    const isStandardAria2c = isAria2cFamily && !isLinkCoreEngine
    const isHighConnAria2c = is136 || is137

    let allowedMax = 16
    if (isLinkCoreEngine || isHighConnAria2c) {
      allowedMax = 64
    }
    const extraConfig = {
      ...this.systemConfig
    }

    const rawMax = this.systemConfig['max-connection-per-server']
    let desiredMax = Number(rawMax)
    if (!Number.isFinite(desiredMax) || desiredMax < 0) {
      desiredMax = allowedMax
    } else if (desiredMax === 0) {
      desiredMax = allowedMax
    }
    extraConfig['max-connection-per-server'] = Math.min(desiredMax, allowedMax)
    const desiredSplit = Number(this.systemConfig.split || 0)
    const splitBaseline = allowedMax >= 64 ? 64 : 16
    const baseSplit = desiredSplit >= splitBaseline ? desiredSplit : splitBaseline
    if (isLinkCoreEngine || isHighConnAria2c) {
      extraConfig.split = Math.min(baseSplit, 64)
    } else if (isStandardAria2c) {
      // 标准aria2c使用较小的split值以避免过多连接
      extraConfig.split = Math.min(baseSplit, 16)
    } else {
      extraConfig.split = baseSplit
    }

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
