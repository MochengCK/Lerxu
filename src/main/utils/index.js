import { resolve } from 'node:path'
import { access, chmodSync, constants, copyFileSync, existsSync, lstatSync } from 'node:fs'
import { app, nativeTheme, shell, session } from 'electron'
import is from 'electron-is'

import {
  APP_THEME,
  ENGINE_MAX_CONNECTION_PER_SERVER,
  IP_VERSION,
  IS_PORTABLE,
  PORTABLE_EXECUTABLE_DIR
} from '@shared/constants'
import { engineBinMap, engineArchMap } from '../configs/engine'
import logger from '../core/LogManager'

export const getUserDataPath = () => {
  return IS_PORTABLE ? PORTABLE_EXECUTABLE_DIR : app.getPath('userData')
}

export const getSystemLogPath = () => {
  return app.getPath('logs')
}

export const getUserDownloadsPath = () => {
  return app.getPath('downloads')
}

export const getConfigBasePath = () => {
  const path = getUserDataPath()
  return path
}

export const getSessionPath = () => {
  return resolve(getUserDataPath(), './download.session')
}

export const getEnginePidPath = () => {
  return resolve(getUserDataPath(), './engine.pid')
}

export const getDhtPath = (protocol) => {
  const name = protocol === IP_VERSION.V6 ? 'dht6.dat' : 'dht.dat'
  return resolve(getUserDataPath(), `./${name}`)
}

export const getAria2LogPath = () => {
  return resolve(getUserDataPath(), './aria2-debug.log')
}

export const getAria2LogDir = () => {
  return getUserDataPath()
}

export const getEngineBin = (platform) => {
  const result = engineBinMap[platform] || ''
  return result
}

export const getEngineArch = (platform, arch) => {
  if (!['darwin', 'win32', 'linux'].includes(platform)) {
    return ''
  }

  const result = engineArchMap[platform][arch]
  return result
}

export const getDevEnginePath = (platform, arch) => {
  const ah = getEngineArch(platform, arch)
  const base = `../../../extra/${platform}/${ah}/engine`
  const result = resolve(__dirname, base)
  return result
}

export const getProdEnginePath = () => {
  const base = process.resourcesPath || app.getAppPath()
  const primary = resolve(base, './engine')
  const secondary = resolve(base, '../engine')

  if (existsSync(primary)) {
    return primary
  }

  if (existsSync(secondary)) {
    return secondary
  }

  return primary
}

export const getEnginePath = (platform, arch) => {
  return is.dev() ? getDevEnginePath(platform, arch) : getProdEnginePath()
}

export const getAria2BinPath = (platform, arch) => {
  const base = getEnginePath(platform, arch)
  const binName = getEngineBin(platform)
  const result = resolve(base, `./${binName}`)
  return result
}

export const getAria2ConfPath = (platform, arch) => {
  const userConfigPath = resolve(getUserDataPath(), './aria2.conf')
  const defaultConfigPath = resolve(getEnginePath(platform, arch), './aria2.conf')
  const storedDefaultPath = resolve(getUserDataPath(), './aria2.conf.default')

  // 首次运行时，将默认配置从引擎目录复制到用户数据目录
  if (!existsSync(userConfigPath)) {
    if (existsSync(defaultConfigPath)) {
      copyFileSync(defaultConfigPath, userConfigPath)
      chmodSync(userConfigPath, 0o644)
    }
  }

  // 始终存储一份当前版本的默认配置，用于后续合并比较
  if (existsSync(defaultConfigPath)) {
    try {
      copyFileSync(defaultConfigPath, storedDefaultPath)
      chmodSync(storedDefaultPath, 0o644)
    } catch (_) {}
  }

  return userConfigPath
}

/**
 * 解析 aria2.conf 文件为 key-value Map
 * 忽略注释行和空行
 */
const parseConf = (content) => {
  const map = new Map()
  const lines = `${content}`.split(/\r?\n/)
  for (const line of lines) {
    const m = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m) {
      map.set(m[1], m[2])
    }
  }
  return map
}

/**
 * 将 key-value Map 序列化为 aria2.conf 格式文本
 */
const serializeConf = (map) => {
  const lines = []
  for (const [k, v] of map) {
    lines.push(`${k}=${v}`)
  }
  return lines.join('\n')
}

/**
 * 智能合并 aria2.conf
 * 策略：
 * - 用户未修改的项（值与上一版默认值相同）→ 更新为新版默认值
 * - 用户修改过的项（值与上一版默认值不同）→ 保留用户值
 * - 新版新增的项 → 自动添加
 * - 旧版有但新版删除的项 → 如果用户未修改则删除，如果修改了则保留
 */
export const mergeAria2Conf = (platform, arch) => {
  const fs = require('node:fs')
  const userConfigPath = resolve(getUserDataPath(), './aria2.conf')
  const defaultConfigPath = resolve(getEnginePath(platform, arch), './aria2.conf')
  const storedDefaultPath = resolve(getUserDataPath(), './aria2.conf.default')

  // 如果用户配置或新默认配置不存在，无法合并
  if (!existsSync(userConfigPath) || !existsSync(defaultConfigPath)) {
    return
  }

  try {
    const userContent = fs.readFileSync(userConfigPath, 'utf8')
    const newDefaultContent = fs.readFileSync(defaultConfigPath, 'utf8')
    const oldDefaultContent = existsSync(storedDefaultPath)
      ? fs.readFileSync(storedDefaultPath, 'utf8')
      : ''

    const userMap = parseConf(userContent)
    const newDefaultMap = parseConf(newDefaultContent)
    const oldDefaultMap = parseConf(oldDefaultContent)

    const merged = new Map()

    // 1. 处理新默认配置中的所有键
    for (const [key, newDefaultVal] of newDefaultMap) {
      const userVal = userMap.get(key)
      const oldDefaultVal = oldDefaultMap.get(key)

      if (userVal === undefined) {
        // 用户配置中没有此键 → 新增的默认项，添加
        merged.set(key, newDefaultVal)
      } else if (oldDefaultVal !== undefined && userVal === oldDefaultVal) {
        // 用户值与旧默认值相同 → 用户未修改，更新为新默认值
        merged.set(key, newDefaultVal)
      } else {
        // 用户值与旧默认值不同，或没有旧默认值可比较 → 用户修改过，保留用户值
        merged.set(key, userVal)
      }
    }

    // 2. 处理用户配置中有但新默认配置中没有的键
    for (const [key, userVal] of userMap) {
      if (!newDefaultMap.has(key)) {
        const oldDefaultVal = oldDefaultMap.get(key)
        // 如果旧默认配置有此键且用户未修改 → 说明此键已从默认中移除，删除
        // 如果用户修改过 → 保留用户自定义项
        if (oldDefaultVal !== undefined && userVal === oldDefaultVal) {
          // 键已被新版移除且用户未修改 → 不添加到 merged（即删除）
        } else {
          // 用户自定义的键 → 保留
          merged.set(key, userVal)
        }
      }
    }

    // 3. 写入合并后的配置
    const mergedContent = serializeConf(merged)
    fs.writeFileSync(userConfigPath, mergedContent, 'utf8')

    // 4. 更新存储的默认配置为当前版本
    try {
      copyFileSync(defaultConfigPath, storedDefaultPath)
      chmodSync(storedDefaultPath, 0o644)
    } catch (_) {}
  } catch (e) {
    // 合并失败时不影响启动
  }
}

export const transformConfig = (config) => {
  const result = []
  for (const [k, v] of Object.entries(config)) {
    // 过滤掉空字符串、undefined 和 null
    if (v !== '' && v !== undefined && v !== null) {
      result.push(`--${k}=${v}`)
    }
  }
  return result
}

export const isRunningInDmg = () => {
  if (!is.macOS() || is.dev()) {
    return false
  }
  const appPath = app.getAppPath()
  const result = appPath.startsWith('/Volumes/')
  return result
}

export const moveAppToApplicationsFolder = (errorMsg = '') => {
  return new Promise((resolve, reject) => {
    try {
      const result = app.moveToApplicationsFolder()
      if (result) {
        resolve(result)
      } else {
        reject(new Error(errorMsg))
      }
    } catch (err) {
      reject(err)
    }
  })
}

export const splitArgv = (argv) => {
  const args = []
  const extra = {}
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const kv = arg.split('=')
      const key = kv[0]
      const value = kv[1] || '1'
      extra[key] = value
      continue
    }
    args.push(arg)
  }
  return { args, extra }
}

export const parseArgvAsUrl = (argv) => {
  const arg = argv[1]
  if (!arg) {
    return
  }

  if (checkIsSupportedSchema(arg)) {
    return arg
  }
}

export const checkIsSupportedSchema = (url = '') => {
  const str = url.toLowerCase()
  if (
    str.startsWith('ftp:') ||
    str.startsWith('http:') ||
    str.startsWith('https:') ||
    str.startsWith('magnet:') ||
    str.startsWith('thunder:') ||
    str.startsWith('ed2k:') ||
    str.startsWith('mo:') ||
    str.startsWith('motrix:')
  ) {
    return true
  } else {
    return false
  }
}

export const isDirectory = (path) => {
  return existsSync(path) && lstatSync(path).isDirectory()
}

export const parseArgvAsFile = (argv) => {
  let arg = argv[1]
  if (!arg || isDirectory(arg)) {
    return
  }

  if (is.linux()) {
    arg = arg.replace('file://', '')
  }
  return arg
}

export const getMaxConnectionPerServer = () => {
  return ENGINE_MAX_CONNECTION_PER_SERVER
}

export const getSystemHttpProxy = async () => {
  try {
    if (!session || !session.defaultSession) {
      return ''
    }
    const result = await session.defaultSession.resolveProxy('http://www.google.com')
    if (!result) {
      return ''
    }
    const parts = result.split(';').map(p => p.trim()).filter(Boolean)
    const proxyPart = parts.find(p => /^PROXY\s+/i.test(p))
    if (!proxyPart) {
      return ''
    }
    const tokens = proxyPart.split(/\s+/)
    const hostPort = tokens[1]
    if (!hostPort) {
      return ''
    }
    const url = `http://${hostPort}`
    logger.info('[LinkCore] detected system http proxy:', url, 'raw:', result)
    return url
  } catch (e) {
    logger.warn('[LinkCore] getSystemHttpProxy failed:', e.message)
    return ''
  }
}

export const getSystemTheme = () => {
  let result = APP_THEME.LIGHT
  result = nativeTheme.shouldUseDarkColors ? APP_THEME.DARK : APP_THEME.LIGHT
  return result
}

export const convertArrayBufferToBuffer = (arrayBuffer) => {
  return Buffer.from(arrayBuffer)
}

export const showItemInFolder = (fullPath) => {
  if (!fullPath) {
    return
  }

  fullPath = resolve(fullPath)
  access(fullPath, constants.F_OK, (err) => {
    if (err) {
      logger.warn(`[LinkCore] ${fullPath} ${err ? 'does not exist' : 'exists'}`)
      return
    }

    shell.showItemInFolder(fullPath)
  })
}

/**
 * 获取引擎目录下的所有引擎（递归扫描子目录）
 * @param {string} platform - 平台
 * @param {string} arch - 架构
 * @returns {Array} 引擎列表
 */
export const getEngineList = (platform, arch) => {
  const enginePath = getEnginePath(platform, arch)
  const binName = getEngineBin(platform)
  const fullPath = resolve(enginePath, binName)

  try {
    const stats = lstatSync(fullPath)
    return [{
      name: binName,
      path: fullPath,
      size: stats.size,
      modified: stats.mtime,
      isDefault: true
    }]
  } catch (error) {
    logger.warn(`[LinkCore] Engine binary not found: ${fullPath}`)
    return []
  }
}
