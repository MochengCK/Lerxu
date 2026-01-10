import { spawn } from 'node:child_process'
import { existsSync, writeFile, unlink } from 'node:fs'
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

    const binPath = this.getEngineBinPath()
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
      throw new Error(this.i18n.t('app.engine-damaged-message'))
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
      throw new Error(this.i18n.t('app.engine-missing-message'))
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
