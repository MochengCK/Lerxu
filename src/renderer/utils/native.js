import { access, constants, existsSync } from 'node:fs'
import { resolve, basename, dirname, isAbsolute } from 'node:path'
import { shell, nativeTheme } from '@electron/remote'
import { Message } from 'element-ui'
import api from '@/api'

import {
  getFileNameFromFile,
  isMagnetTask
} from '@shared/utils'
import { buildCategorizedPath } from '@shared/utils/file-categorize'
import { APP_THEME } from '@shared/constants'

export const showItemInFolder = (fullPath, { errorMsg }) => {
  if (!fullPath) {
    return
  }

  fullPath = resolve(fullPath)
  access(fullPath, constants.F_OK, (err) => {
    console.warn(`[LinkCore] ${fullPath} ${err ? 'does not exist' : 'exists'}`)
    if (err && errorMsg) {
      Message.error(errorMsg)
      return
    }

    shell.showItemInFolder(fullPath)
  })
}

export const openItem = async (fullPath) => {
  if (!fullPath) {
    return
  }

  const result = await shell.openPath(fullPath)
  return result
}

export const getTaskFullPath = (task) => {
  const { dir, files, bittorrent, name } = task || {}
  let result = resolve(dir || '')

  // Magnet link task
  if (isMagnetTask(task)) {
    return result
  }

  if (bittorrent && bittorrent.info && bittorrent.info.name) {
    result = resolve(result, bittorrent.info.name)
    return result
  }

  const [file] = Array.isArray(files) ? files : []
  const rawPath = file && file.path ? `${file.path}` : ''
  const path = rawPath
    ? (isAbsolute(rawPath) ? resolve(rawPath) : resolve(result, rawPath))
    : ''
  let fileName = ''

  if (path) {
    result = path
  } else {
    // Resolve filename from task object fields first (files[0] URI, then task.name)
    // instead of relying on aria2 API queries after task removal.
    if (files && files.length === 1) {
      fileName = getFileNameFromFile(file)
    }
    if (!fileName && name) {
      fileName = `${name}`
    }
    if (fileName) {
      result = resolve(result, fileName)
    }
  }

  return result
}

export const getPathCandidates = (originPath, suffix, config) => {
  const candidates = new Set()
  if (!originPath) return []

  // 1. Determine Logical Paths (Original and Suffix-removed)
  const logicalPaths = new Set()
  logicalPaths.add(originPath)

  if (suffix && originPath.endsWith(suffix)) {
    logicalPaths.add(originPath.slice(0, -suffix.length))
  }

  // 2. Determine Base Paths (Logical + Categorized)
  const basePaths = new Set(logicalPaths)

  const autoCategorizeFiles = config && config.autoCategorizeFiles
  const categories = config && config.fileCategories

  if (autoCategorizeFiles && categories && Object.keys(categories).length > 0) {
    for (const p of logicalPaths) {
      try {
        const filename = basename(p)
        const baseDir = dirname(p)
        const categorizedInfo = buildCategorizedPath(p, filename, categories, baseDir)
        if (categorizedInfo && categorizedInfo.categorizedPath) {
          basePaths.add(categorizedInfo.categorizedPath)
        }
      } catch (e) {
        // ignore
      }
    }
  }

  // 3. Generate Physical Paths (Base + Suffix variants)
  for (const p of basePaths) {
    candidates.add(p)
    if (suffix) {
      candidates.add(`${p}${suffix}`)
      if (p.endsWith(suffix)) {
        candidates.add(p.slice(0, -suffix.length))
      }
    }
  }

  return Array.from(candidates)
}

export const getTaskActualPath = (task, preferenceConfig = {}) => {
  const path = getTaskFullPath(task)
  if (!path) {
    return path
  }

  const config = preferenceConfig || {}
  const suffix = config.downloadingFileSuffix

  const candidates = getPathCandidates(path, suffix, config)

  for (const p of candidates) {
    if (existsSync(p)) {
      return p
    }
  }

  return path
}

export const moveTaskFilesToTrash = async (task, downloadingFileSuffix = '', preferenceConfig = {}) => {
  /**
   * For magnet link tasks, there is bittorrent, but there is no bittorrent.info.
   * The path is not a complete path before it becomes a BT task.
   * In order to avoid accidentally deleting the directory
   * where the task is located, it directly returns true when deleting.
   */
  if (isMagnetTask(task)) {
    return true
  }

  const config = preferenceConfig || {}
  const suffix = downloadingFileSuffix || config.downloadingFileSuffix || ''
  const taskDir = task && task.dir ? resolve(`${task.dir}`) : ''
  let path = getTaskFullPath(task)

  console.log('[LinkCore] moveTaskFilesToTrash - task fields:', {
    gid: task && task.gid,
    dir: task && task.dir,
    name: task && task.name,
    filesPath: task && task.files && task.files[0] ? task.files[0].path : undefined,
    filesUri: task && task.files && task.files[0] && task.files[0].uris && task.files[0].uris[0] ? task.files[0].uris[0].uri : undefined,
    bittorrentInfoName: task && task.bittorrent && task.bittorrent.info ? task.bittorrent.info.name : undefined,
    resolvedPath: path,
    taskDir,
    suffix
  })

  // 当路径无效或等于下载目录时，尝试从预获取的引擎选项或实时 getOption 解析
  if (!path || (taskDir && resolve(path) === taskDir)) {
    // 优先使用预获取的 _engineOptions（在任务被 aria2 删除前获取，避免 getOption 失败）
    const preOpt = task && task._engineOptions
    let resolved = false

    if (preOpt) {
      const dirFromOpt = preOpt.dir ? resolve(`${preOpt.dir}`) : taskDir
      const outFromOpt = preOpt.out ? `${preOpt.out}` : ''
      const nameFallback = task && task.name ? `${task.name}` : ''
      console.log('[LinkCore] moveTaskFilesToTrash - pre-fetched getOption fallback:', { dirFromOpt, outFromOpt, nameFallback })
      if (dirFromOpt && outFromOpt) {
        path = resolve(dirFromOpt, outFromOpt)
        resolved = true
      } else if (dirFromOpt && nameFallback) {
        path = resolve(dirFromOpt, nameFallback)
        resolved = true
      }
    }

    // 预获取的选项也无法解析时，尝试实时调用 getOption（任务可能仍存在）
    if (!resolved) {
      try {
        const gid = task && task.gid ? `${task.gid}` : ''
        if (gid) {
          const opt = await api.getOption({ gid })
          const dirFromOpt = opt && opt.dir ? resolve(`${opt.dir}`) : taskDir
          const outFromOpt = opt && opt.out ? `${opt.out}` : ''
          const nameFallback = task && task.name ? `${task.name}` : ''
          console.log('[LinkCore] moveTaskFilesToTrash - live getOption fallback:', { dirFromOpt, outFromOpt, nameFallback })
          if (dirFromOpt && outFromOpt) {
            path = resolve(dirFromOpt, outFromOpt)
          } else if (dirFromOpt && nameFallback) {
            path = resolve(dirFromOpt, nameFallback)
          }
        }
      } catch (e) {
        console.warn('[LinkCore] moveTaskFilesToTrash - getOption fallback failed:', e.message)
      }
    }
  }

  if (!path || (taskDir && resolve(path) === taskDir)) {
    const err = new Error(`无法解析任务文件路径，跳过文件删除（gid=${task && task.gid}, dir=${taskDir}）`)
    console.warn('[LinkCore] moveTaskFilesToTrash -', err.message)
    throw err
  }

  const candidates = getPathCandidates(path, suffix, config)
  console.log('[LinkCore] moveTaskFilesToTrash - candidates:', candidates.map(p => ({ path: p, exists: existsSync(p) })))

  let deletedCount = 0
  let lastError = null

  for (const p of candidates) {
    // Delete main file
    try {
      if (existsSync(p)) {
        const target = resolve(p)
        console.log(`[LinkCore] ${target} exists, deleting...`)
        await shell.trashItem(target)
        deletedCount++
      }
    } catch (e) {
      console.warn(`[LinkCore] Failed to trash ${p}:`, e)
      lastError = e
    }

    // Delete .xfer control file
    const xferPath = `${p}.xfer`
    try {
      if (existsSync(xferPath)) {
        console.log(`[LinkCore] ${xferPath} exists, deleting...`)
        await shell.trashItem(xferPath)
        deletedCount++
      }
    } catch (e) {
      console.warn(`[LinkCore] Failed to trash ${xferPath}:`, e)
      lastError = e
    }
  }

  // 如果候选路径中有文件存在但全部删除失败，抛出错误让上层提示用户
  const anyExists = candidates.some(p => existsSync(p) || existsSync(`${p}.xfer`))
  if (anyExists && deletedCount === 0 && lastError) {
    throw new Error(`删除文件失败: ${lastError.message || lastError}`)
  }

  return true
}

export const getSystemTheme = () => {
  return nativeTheme.shouldUseDarkColors ? APP_THEME.DARK : APP_THEME.LIGHT
}

/**
 * Show a system notification.
 *
 * Prefer Electron's native Notification module (works reliably on macOS /
 * Windows / Linux) and fall back to the HTML5 Notification API. On macOS the
 * bare HTML5 `new Notification()` silently does nothing unless permission was
 * granted first, which is why native notifications are used.
 */
export const showNativeNotification = ({ title, body, onClick }) => {
  try {
    const { Notification } = require('electron')
    if (Notification && Notification.isSupported && Notification.isSupported()) {
      const notify = new Notification({ title, body })
      if (onClick) {
        notify.on('click', onClick)
      }
      notify.show()
      return notify
    }
  } catch (e) {
    console.warn('[LinkCore] Native notification unavailable, fallback to HTML5:', e.message)
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const notify = new window.Notification(title, { body })
      if (onClick) {
        notify.onclick = onClick
      }
      return notify
    } catch (e) {
      console.warn('[LinkCore] HTML5 notification failed:', e.message)
    }
  }

  return null
}

export const delayDeleteTaskFiles = (task, delay, downloadingFileSuffix = '', preferenceConfig = {}) => {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const result = await moveTaskFilesToTrash(task, downloadingFileSuffix, preferenceConfig)
        resolve(result)
      } catch (err) {
        reject(err.message)
      }
    }, delay)
  })
}
