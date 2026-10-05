import { resolve } from 'node:path'
import { access, constants, existsSync, lstatSync } from 'node:fs'
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
import { mediaEngineBinName, mediaEngineCandidates } from '@shared/zuvrust'
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
  // xferrust 使用原生 JSON 会话（settings + tasks），与旧 aria2 文本
  // 会话（download.session）格式不兼容，改用独立文件名避免误读旧格式
  return resolve(getUserDataPath(), './session.json')
}

export const getEnginePidPath = () => {
  return resolve(getUserDataPath(), './engine.pid')
}

export const getDhtPath = (protocol) => {
  const name = protocol === IP_VERSION.V6 ? 'dht6.dat' : 'dht.dat'
  return resolve(getUserDataPath(), `./${name}`)
}

// 下载引擎（XferRust）的调试日志。文件名与展示名都用"引擎"而不是
// 旧引擎的 aria2：换引擎后设置面板里再出现 "aria2" 只会让用户困惑（用户点名）
export const getEngineLogPath = () => {
  return resolve(getUserDataPath(), './engine-debug.log')
}

export const getEngineLogDir = () => {
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
  // __dirname = <workspace>/dist/electron（vite-plugin-electron 主进程产物目录）
  // 回退两级即到工作区根目录的 extra/
  const base = `../../extra/${platform}/${ah}/engine`
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

/**
 * **媒体引擎**（`zuvrust`）的候选路径，按优先级排列。
 *
 * 与下载引擎同一套回填约定（`extra/<平台>/<架构>/engine/` 与 `resourcesPath/engine`），
 * 区别只在文件名与"哪些平台目录"：
 *   1. 用户数据目录（可热替换升级 —— 用户拿到新引擎不必重装应用）
 *   2. 应用安装目录 / 资源目录（打包时回填）
 *   3. 开发期工作区的 extra/<平台>/<架构>/engine（本机开发直接用构建产物）
 *
 * 候选顺序由 `@shared/zuvrust` 决定（**与渲染进程共用同一份纯函数**），
 * 这样"前端去哪找引擎"与"主进程去哪找引擎"不可能漂移。
 */
export const getMediaEngineCandidates = () => {
  const binName = mediaEngineBinName(process.platform)
  try {
    return mediaEngineCandidates({
      platform: process.platform,
      arch: process.arch,
      userDataPath: getUserDataPath(),
      appDir: resolve(app.getPath('exe'), '..'),
      resourcesPath: process.resourcesPath || '',
      // __dirname = <workspace>/dist/electron（vite-plugin-electron 主进程产物目录）
      devRoot: resolve(__dirname, '../..')
    }).filter((p) => p !== binName) // 裸文件名要查 PATH，主进程侧不做（下面单独试）
  } catch (_) {
    return []
  }
}

/** 找到可用的媒体引擎；找不到返回空串（调用方回退到"浏览器直接播放"）。 */
export const resolveMediaEnginePath = () => {
  return getMediaEngineCandidates().find((p) => existsSync(p)) || ''
}

export const getAria2BinPath = (platform, arch) => {
  const base = getEnginePath(platform, arch)
  const binName = getEngineBin(platform)
  const result = resolve(base, `./${binName}`)
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
    str.startsWith('lerxu:')
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
    logger.info('[Lerxu] detected system http proxy:', url, 'raw:', result)
    return url
  } catch (e) {
    logger.warn('[Lerxu] getSystemHttpProxy failed:', e.message)
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
      logger.warn(`[Lerxu] ${fullPath} ${err ? 'does not exist' : 'exists'}`)
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
    logger.warn(`[Lerxu] Engine binary not found: ${fullPath}`)
    return []
  }
}
