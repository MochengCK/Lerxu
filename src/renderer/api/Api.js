import { ipcRenderer } from 'electron'
import is from 'electron-is'
import { isEmpty, clone } from 'lodash'
import { existsSync } from 'fs'
import { basename, resolve, isAbsolute } from 'path'
import { Aria2 } from '@shared/aria2'
import {
  separateConfig,
  compactUndefined,
  formatOptionsForEngine,
  mergeTaskResult,
  changeKeysToCamelCase,
  changeKeysToKebabCase,
  generateUniqueTaskName,
  checkTaskIsBT,
  checkTaskIsSeeder
} from '@shared/utils'
import { ENGINE_RPC_HOST, TASK_STATUS } from '@shared/constants'
import taskHistory from './TaskHistory'

const looksLikeBilibiliDashPart = (task) => {
  try {
    if (!task || typeof task !== 'object') {
      return false
    }
    const status = `${task.status || ''}`
    const { COMPLETE, ERROR, REMOVED } = TASK_STATUS
    if (![COMPLETE, ERROR, REMOVED].includes(status)) {
      return false
    }
    const files = Array.isArray(task.files) ? task.files : []
    if (!files.length) {
      return false
    }
    const first = files[0] || {}
    const rawPath = first && first.path ? `${first.path}` : ''
    if (!rawPath) {
      return false
    }
    const base = basename(rawPath)
    const lower = base.toLowerCase()
    const looksLikePart = lower.endsWith('_video.mp4') ||
      lower.endsWith('_audio.m4a') ||
      /\.m4s$/i.test(base)
    if (!looksLikePart) {
      return false
    }
    const taskDir = task && task.dir ? `${task.dir}` : ''
    let absolutePath = rawPath
    try {
      if (!isAbsolute(rawPath) && taskDir) {
        absolutePath = resolve(taskDir, rawPath)
      }
    } catch (_) {
      absolutePath = rawPath
    }
    let missing = false
    try {
      missing = !existsSync(absolutePath)
    } catch (_) {}
    return missing
  } catch (_) {
    return false
  }
}

const isStoppedCategoryStatus = (status) => {
  const s = `${status || ''}`
  return s === TASK_STATUS.PAUSED ||
    s === TASK_STATUS.COMPLETE ||
    s === TASK_STATUS.ERROR ||
    s === TASK_STATUS.REMOVED
}

const isHistoryStoppedStatus = (status) => {
  const s = `${status || ''}`
  return s === TASK_STATUS.COMPLETE ||
    s === TASK_STATUS.ERROR ||
    s === TASK_STATUS.REMOVED
}

const isTransientMagnetTask = (task) => {
  if (!task || typeof task !== 'object') {
    return false
  }
  const bt = task.bittorrent
  return !!(bt && !bt.info)
}

const isNonEmptyString = (value) => {
  return typeof value === 'string' && value.trim() !== ''
}

const cloneTaskFiles = (files) => {
  if (!Array.isArray(files)) {
    return files
  }
  return files.map((file) => {
    if (!file || typeof file !== 'object') {
      return file
    }
    const next = { ...file }
    if (Array.isArray(file.uris)) {
      next.uris = file.uris.map((u) => {
        if (!u || typeof u !== 'object') {
          return u
        }
        return { ...u }
      })
    }
    return next
  })
}

const cloneBittorrent = (bt) => {
  if (!bt || typeof bt !== 'object') {
    return bt
  }
  const next = { ...bt }
  if (bt.info && typeof bt.info === 'object') {
    next.info = { ...bt.info }
  }
  return next
}

const ensureUniqueOut = (out, dir, existingNames) => {
  const name = out ? `${out}` : ''
  if (!name) {
    return out
  }
  const names = existingNames instanceof Set ? existingNames : new Set()
  const normalizedDir = dir ? `${dir}` : ''
  const resolveOut = (candidate) => {
    const c = candidate ? `${candidate}` : ''
    if (!c) return ''
    if (isAbsolute(c)) return resolve(c)
    if (!normalizedDir) return ''
    return resolve(normalizedDir, c)
  }

  const baseUnique = generateUniqueTaskName(name, names)
  const basePath = resolveOut(baseUnique)
  if (basePath && !existsSync(basePath)) {
    return baseUnique
  }

  const lastDotIndex = name.lastIndexOf('.')
  const nameWithoutExt = lastDotIndex > 0 ? name.substring(0, lastDotIndex) : name
  const ext = lastDotIndex > 0 ? name.substring(lastDotIndex) : ''

  for (let counter = 1; counter < 1000; counter++) {
    const candidate = `${nameWithoutExt} (${counter})${ext}`
    if (names.has(candidate)) {
      continue
    }
    const p = resolveOut(candidate)
    if (!p) {
      return candidate
    }
    if (!existsSync(p)) {
      return candidate
    }
  }

  return baseUnique
}

const shouldAdoptHistoryFiles = (task, historyTask) => {
  const liveFiles = Array.isArray(task && task.files) ? task.files : []
  const historyFiles = Array.isArray(historyTask && historyTask.files) ? historyTask.files : []
  if (historyFiles.length === 0) {
    return false
  }
  if (liveFiles.length === 0) {
    return true
  }

  const liveFirst = liveFiles[0] || {}
  const livePath = isNonEmptyString(liveFirst.path) ? liveFirst.path : ''
  const liveUris = Array.isArray(liveFirst.uris) ? liveFirst.uris : []
  const liveUri0 = liveUris[0] && isNonEmptyString(liveUris[0].uri) ? liveUris[0].uri : ''
  if (isNonEmptyString(`${livePath}`) || isNonEmptyString(`${liveUri0}`)) {
    return false
  }

  const histFirst = historyFiles[0] || {}
  const histPath = isNonEmptyString(histFirst.path) ? histFirst.path : ''
  const histUris = Array.isArray(histFirst.uris) ? histFirst.uris : []
  const histUri0 = histUris[0] && isNonEmptyString(histUris[0].uri) ? histUris[0].uri : ''
  return isNonEmptyString(`${histPath}`) || isNonEmptyString(`${histUri0}`)
}

export default class Api {
  constructor (options = {}) {
    this.options = options

    this.init()
  }

  async init () {
    this.config = await this.loadConfig()

    this.client = this.initClient()
    this.client.open()
  }

  loadConfigFromLocalStorage () {
    // TODO
    const result = {}
    return result
  }

  async loadConfigFromNativeStore () {
    const result = await ipcRenderer.invoke('get-app-config')
    return result
  }

  async loadConfig () {
    let result = is.renderer()
      ? await this.loadConfigFromNativeStore()
      : this.loadConfigFromLocalStorage()

    result = changeKeysToCamelCase(result)
    return result
  }

  initClient () {
    const {
      rpcListenPort: port,
      rpcSecret: secret
    } = this.config
    const host = ENGINE_RPC_HOST
    return new Aria2({
      host,
      port,
      secret
    })
  }

  closeClient () {
    this.client.close()
      .then(() => {
        this.client = null
      })
      .catch(err => {
        console.log('engine client close fail', err)
      })
  }

  async fetchPreference () {
    this.config = await this.loadConfig()
    return this.config
  }

  savePreference (params = {}) {
    const kebabParams = changeKeysToKebabCase(params)
    if (is.renderer()) {
      return this.savePreferenceToNativeStore(kebabParams)
    } else {
      return this.savePreferenceToLocalStorage(kebabParams)
    }
  }

  savePreferenceToLocalStorage () {
    // TODO
  }

  savePreferenceToNativeStore (params = {}) {
    const normalizedParams = { ...params }
    if (normalizedParams['bt-encryption-mode'] !== undefined) {
      const mode = normalizedParams['bt-encryption-mode']
      if (mode === 'force') {
        normalizedParams['bt-require-crypto'] = true
        normalizedParams['bt-min-crypto-level'] = 'arc4'
      } else if (mode === 'none') {
        normalizedParams['bt-require-crypto'] = false
        normalizedParams['bt-min-crypto-level'] = 'plain'
      } else {
        normalizedParams['bt-require-crypto'] = false
        normalizedParams['bt-min-crypto-level'] = 'arc4'
      }
      // 保留 bt-encryption-mode 以便持久化到 system.json，
      // 否则重新打开偏好设置时会因读取不到该值而回退到默认值 adaptive。
      // 派生的 bt-require-crypto / bt-min-crypto-level 仅用于引擎即时生效。
      delete normalizedParams['bt-force-encryption']
    } else if (normalizedParams['bt-force-encryption'] !== undefined) {
      const forceEncryption = normalizedParams['bt-force-encryption'] === true || normalizedParams['bt-force-encryption'] === 'true'
      normalizedParams['bt-require-crypto'] = forceEncryption
      normalizedParams['bt-min-crypto-level'] = forceEncryption ? 'arc4' : 'plain'
    }
    const { user, system, others } = separateConfig(normalizedParams)
    const config = {}

    if (!isEmpty(user)) {
      console.info('[Motrix] save user config: ', user)
      config.user = user
    }

    if (!isEmpty(system)) {
      console.info('[Motrix] save system config: ', system)
      config.system = system
      this.updateActiveTaskOption(system)
    }

    if (!isEmpty(others)) {
      console.info('[Motrix] save config found illegal key: ', others)
    }

    ipcRenderer.send('command', 'application:save-preference', config)
  }

  getVersion () {
    return this.client.call('getVersion')
  }

  changeGlobalOption (options) {
    const normalizedOptions = { ...options }
    if (normalizedOptions['bt-encryption-mode'] !== undefined) {
      const mode = normalizedOptions['bt-encryption-mode']
      if (mode === 'force') {
        normalizedOptions['bt-require-crypto'] = true
        normalizedOptions['bt-min-crypto-level'] = 'arc4'
      } else if (mode === 'none') {
        normalizedOptions['bt-require-crypto'] = false
        normalizedOptions['bt-min-crypto-level'] = 'plain'
      } else {
        normalizedOptions['bt-require-crypto'] = false
        normalizedOptions['bt-min-crypto-level'] = 'arc4'
      }
      delete normalizedOptions['bt-encryption-mode']
      delete normalizedOptions['bt-force-encryption']
    } else if (normalizedOptions['bt-force-encryption'] !== undefined) {
      const forceEncryption = normalizedOptions['bt-force-encryption'] === true || normalizedOptions['bt-force-encryption'] === 'true'
      normalizedOptions['bt-require-crypto'] = forceEncryption
      normalizedOptions['bt-min-crypto-level'] = forceEncryption ? 'arc4' : 'plain'
    }
    const args = formatOptionsForEngine(normalizedOptions)

    return this.client.call('changeGlobalOption', args)
  }

  getGlobalOption () {
    return this.client.call('getGlobalOption')
      .then((data) => changeKeysToCamelCase(data))
  }

  getOption (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])

    return this.client.call('getOption', ...args)
      .then((data) => changeKeysToCamelCase(data))
  }

  updateActiveTaskOption (options) {
    // 复制 options 对象，避免修改原始对象
    const activeTaskOptions = { ...options }
    // 排除 dir 选项，确保正在下载的任务的下载路径不会被更改
    // 这是因为更改正在下载任务的下载路径会导致任务重新开始下载
    delete activeTaskOptions.dir

    // 如果没有剩余选项，直接返回
    if (isEmpty(activeTaskOptions)) {
      return
    }

    this.fetchTaskList({ type: 'active' })
      .then((data) => {
        if (isEmpty(data)) {
          return
        }

        const gids = data.map((task) => task.gid)
        this.batchChangeOption({ gids, options: activeTaskOptions })
      })
  }

  changeOption (params = {}) {
    const { gid, options = {} } = params

    const normalizedOptions = { ...options }
    if (normalizedOptions['bt-encryption-mode'] !== undefined) {
      const mode = normalizedOptions['bt-encryption-mode']
      if (mode === 'force') {
        normalizedOptions['bt-require-crypto'] = true
        normalizedOptions['bt-min-crypto-level'] = 'arc4'
      } else if (mode === 'none') {
        normalizedOptions['bt-require-crypto'] = false
        normalizedOptions['bt-min-crypto-level'] = 'plain'
      } else {
        normalizedOptions['bt-require-crypto'] = false
        normalizedOptions['bt-min-crypto-level'] = 'arc4'
      }
      delete normalizedOptions['bt-encryption-mode']
      delete normalizedOptions['bt-force-encryption']
    } else if (normalizedOptions['bt-force-encryption'] !== undefined) {
      const forceEncryption = normalizedOptions['bt-force-encryption'] === true || normalizedOptions['bt-force-encryption'] === 'true'
      normalizedOptions['bt-require-crypto'] = forceEncryption
      normalizedOptions['bt-min-crypto-level'] = forceEncryption ? 'arc4' : 'plain'
    }
    const engineOptions = formatOptionsForEngine(normalizedOptions)
    const args = compactUndefined([gid, engineOptions])

    return this.client.call('changeOption', ...args)
  }

  getGlobalStat () {
    return this.client.call('getGlobalStat')
  }

  async addUri (params) {
    const {
      uris,
      outs,
      options,
      optionsList,
      dirs
    } = params

    const historyTasks = taskHistory.getHistory()
    const allTasks = []

    try {
      const [active, waiting, stopped] = await Promise.all([
        this.client.call('tellActive'),
        this.client.call('tellWaiting', 0, 1000),
        this.client.call('tellStopped', 0, 10000)
      ])
      allTasks.push(...(active || []), ...(waiting || []), ...(stopped || []))
    } catch (error) {
      console.error('[Duplicate Check] Error fetching tasks:', error)
    }

    allTasks.push(...historyTasks)

    const existingNames = new Set()
    allTasks.forEach(task => {
      const taskName = task.bittorrent?.info?.name ||
                       (task.files?.[0]?.path ? task.files[0].path.split(/[\\/]/).pop() : '')
      if (taskName) {
        existingNames.add(taskName)
      }
    })

    const tasks = uris.map((uri, index) => {
      const perOptions = {
        ...options,
        ...(Array.isArray(optionsList) && optionsList[index] ? optionsList[index] : {})
      }
      if (Array.isArray(dirs) && dirs[index]) {
        perOptions.dir = dirs[index]
      }
      const engineOptions = formatOptionsForEngine(perOptions)

      const out = outs && outs[index] ? outs[index] : undefined
      if (out) {
        const uniqueOut = ensureUniqueOut(out, engineOptions.dir, existingNames)
        engineOptions.out = uniqueOut
        existingNames.add(uniqueOut)
      }

      // uri 可能是单个 URL 字符串，也可能是 URL 数组（用于 GitHub 镜像故障转移）
      const uriArray = Array.isArray(uri) ? uri : [uri]
      const args = compactUndefined([uriArray, engineOptions])
      return ['aria2.addUri', ...args]
    })
    return this.client.multicall(tasks)
  }

  addUriRaw (params = {}) {
    const { uri, uris, options = {}, position } = params
    const list = Array.isArray(uris) ? uris : (uri ? [uri] : [])
    const engineOptions = formatOptionsForEngine(options)
    const args = compactUndefined([list, engineOptions, position])
    return this.client.call('addUri', ...args)
  }

  async addTorrent (params) {
    const {
      torrent,
      options
    } = params

    const historyTasks = taskHistory.getHistory()
    const allTasks = []

    try {
      const [active, waiting, stopped] = await Promise.all([
        this.client.call('tellActive'),
        this.client.call('tellWaiting', 0, 1000),
        this.client.call('tellStopped', 0, 10000)
      ])
      allTasks.push(...(active || []), ...(waiting || []), ...(stopped || []))
    } catch (error) {
      console.error('[Duplicate Check] Error fetching tasks:', error)
    }

    allTasks.push(...historyTasks)

    const existingNames = new Set()
    allTasks.forEach(task => {
      const taskName = task.bittorrent?.info?.name ||
                       (task.files?.[0]?.path ? task.files[0].path.split(/[\\/]/).pop() : '')
      if (taskName) {
        existingNames.add(taskName)
      }
    })

    const engineOptions = formatOptionsForEngine(options)

    if (engineOptions.out) {
      const uniqueOut = ensureUniqueOut(engineOptions.out, engineOptions.dir, existingNames)
      engineOptions.out = uniqueOut
      existingNames.add(uniqueOut)
    }

    const args = compactUndefined([torrent, [], engineOptions])
    return this.client.call('addTorrent', ...args)
  }

  addMetalink (params) {
    const {
      metalink,
      options
    } = params
    const engineOptions = formatOptionsForEngine(options)
    const args = compactUndefined([metalink, engineOptions])
    return this.client.call('addMetalink', ...args)
  }

  _mergeHistoryToTasks (tasks) {
    const historyTasks = taskHistory.getHistory()
    if (historyTasks.length === 0) {
      return tasks
    }

    const historyMap = new Map(historyTasks
      .filter(task => task && task.gid)
      .map(task => [task.gid, task]))
    const activeStatuses = new Set([TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED])
    const stoppedStatuses = new Set([TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED])
    return tasks.map(task => {
      const historyTask = historyMap.get(task.gid)
      if (historyTask) {
        const { savedAt, startedAt, createdAt, averageDownloadSpeed, averageSpeedSampleCount } = historyTask
        const mergedFields = {}
        if (!isNonEmptyString(`${task && task.dir ? task.dir : ''}`) && isNonEmptyString(`${historyTask.dir || ''}`)) {
          mergedFields.dir = historyTask.dir
        }
        if (!isNonEmptyString(`${task && task.uri ? task.uri : ''}`) && isNonEmptyString(`${historyTask.uri || ''}`)) {
          mergedFields.uri = historyTask.uri
        }
        if (!isNonEmptyString(`${task && task.name ? task.name : ''}`) && isNonEmptyString(`${historyTask.name || ''}`)) {
          mergedFields.name = historyTask.name
        }
        if (shouldAdoptHistoryFiles(task, historyTask)) {
          mergedFields.files = cloneTaskFiles(historyTask.files)
        }

        const liveBtName = task && task.bittorrent && task.bittorrent.info && task.bittorrent.info.name
          ? `${task.bittorrent.info.name}`
          : ''
        const histBtName = historyTask && historyTask.bittorrent && historyTask.bittorrent.info && historyTask.bittorrent.info.name
          ? `${historyTask.bittorrent.info.name}`
          : ''
        if (!isNonEmptyString(liveBtName) && isNonEmptyString(histBtName)) {
          mergedFields.bittorrent = cloneBittorrent(historyTask.bittorrent)
        }

        const liveStatus = `${task.status || ''}`
        const historyStatus = `${historyTask.status || ''}`
        const total = Number(task.totalLength || historyTask.totalLength || 0)
        const completed = Number(task.completedLength || historyTask.completedLength || 0)
        // Do not coerce active BT tasks to stopped history status when they are
        // seeding (or ready-to-seed right after app restart).
        const isBtTask = checkTaskIsBT(task) || checkTaskIsBT(historyTask)
        const isSeeding = checkTaskIsSeeder(task) || checkTaskIsSeeder(historyTask)
        const isBtCompletedActive = isBtTask &&
          activeStatuses.has(liveStatus) &&
          Number.isFinite(total) &&
          total > 0 &&
          Number.isFinite(completed) &&
          completed >= total
        const shouldCoerceToHistoryStatus =
          !(isSeeding || isBtCompletedActive || (isBtTask && activeStatuses.has(liveStatus))) &&
          activeStatuses.has(liveStatus) &&
          stoppedStatuses.has(historyStatus) &&
          Number.isFinite(total) && total > 0 &&
          Number.isFinite(completed) && completed >= total
        const shouldUseMergedHistory = !!historyTask.dashMerged && historyStatus === TASK_STATUS.COMPLETE
        return {
          ...task,
          ...mergedFields,
          ...(shouldUseMergedHistory
            ? {
              ...historyTask,
              status: TASK_STATUS.COMPLETE,
              statusHint: '',
              engineStatus: '',
              downloadSpeed: '0',
              uploadSpeed: '0'
            }
            : {}),
          ...(shouldCoerceToHistoryStatus ? { status: historyStatus } : {}),
          ...(savedAt ? { savedAt } : {}),
          ...(startedAt ? { startedAt } : {}),
          ...(createdAt ? { createdAt } : {}),
          ...(averageDownloadSpeed != null ? { averageDownloadSpeed } : {}),
          ...(averageSpeedSampleCount != null ? { averageSpeedSampleCount } : {})
        }
      }
      return task
    })
  }

  fetchDownloadingTaskList (params = {}) {
    const { offset = 0, num = 20, keys } = params
    const activeArgs = compactUndefined([keys])
    const waitingArgs = compactUndefined([offset, num, keys])
    return new Promise((resolve, reject) => {
      this.client.multicall([
        ['aria2.tellActive', ...activeArgs],
        ['aria2.tellWaiting', ...waitingArgs]
      ]).then((data) => {
        console.log('[Motrix] fetch downloading task list data:', data)
        let result = mergeTaskResult(data)
        result = this._mergeHistoryToTasks(result)
        result = result.filter(task => {
          const status = `${task && task.status ? task.status : ''}`
          return status === TASK_STATUS.ACTIVE || status === TASK_STATUS.WAITING
        })
        resolve(result)
      }).catch((err) => {
        console.log('[Motrix] fetch downloading task list fail:', err)
        reject(err)
      })
    })
  }

  fetchWaitingTaskList (params = {}) {
    const { offset = 0, num = 20, keys } = params
    const args = compactUndefined([offset, num, keys])
    return this.client.call('tellWaiting', ...args)
      .then(data => this._mergeHistoryToTasks(data))
  }

  fetchStoppedTaskList (params = {}) {
    const { offset = 0, num = 10000, keys } = params
    const args = compactUndefined([offset, num, keys])
    return this.client.call('tellStopped', ...args)
  }

  fetchActiveTaskList (params = {}) {
    const { keys } = params
    const args = compactUndefined([keys])
    return this.client.call('tellActive', ...args)
  }

  fetchTaskList (params = {}) {
    const { type } = params
    switch (type) {
    case 'all': {
      const { offset = 0, keys } = params
      const activeArgs = compactUndefined([keys])
      const waitingArgs = compactUndefined([offset, 1000, keys])
      const stoppedArgs = compactUndefined([offset, 10000, keys])
      return new Promise((resolve, reject) => {
        this.client.multicall([
          ['aria2.tellActive', ...activeArgs],
          ['aria2.tellWaiting', ...waitingArgs],
          ['aria2.tellStopped', ...stoppedArgs]
        ]).then((data) => {
          let result = mergeTaskResult(data)

          const stoppedTasks = result.filter(task => {
            const { status } = task
            const isMetadataTask = task.name && task.name.startsWith('[METADATA]')
            if (isMetadataTask || looksLikeBilibiliDashPart(task)) {
              return false
            }
            return [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR].includes(status)
          })
          taskHistory.saveStoppedTasks(stoppedTasks)

          result = this._mergeHistoryToTasks(result)
          // 移除已停止状态下的临时磁力任务，避免出现无效重复记录
          result = result.filter(task => !(isTransientMagnetTask(task) && isHistoryStoppedStatus(task && task.status)))

          // 获取历史记录并合并到结果中
          const historyTasks = taskHistory.getHistory()
          if (historyTasks.length > 0) {
            // 合并历史任务，避免重复，仅展示真正已停止的记录
            const currentGids = new Set(result.map(task => task.gid))
            const newHistoryTasks = historyTasks
              .filter(task => isHistoryStoppedStatus(task && task.status))
              .filter(task => !isTransientMagnetTask(task))
              .filter(task => !currentGids.has(task.gid))
            result = [...result, ...newHistoryTasks]
          }

          try {
            const deleted = taskHistory.getAllHistory().filter(t => t && t.deletedAt && t.gid).map(t => t.gid)
            if (deleted.length > 0) {
              const deletedGids = new Set(deleted)
              result = result.filter(task => task && task.gid && !deletedGids.has(task.gid))
            }
          } catch (e) {}

          result = result.filter(task => !looksLikeBilibiliDashPart(task))

          resolve(result)
        }).catch((err) => {
          console.log('[Motrix] fetch all task list fail:', err)
          reject(err)
        })
      })
    }
    case 'active':
      return this.fetchDownloadingTaskList(params)
    case 'waiting':
      return this.fetchWaitingTaskList(params)
    case 'stopped':
      return this.fetchStoppedTaskList(params)
        .then(stoppedTasks => {
          // 获取历史记录中的任务
          const historyTasks = taskHistory.getHistory()
          const historyStoppedTasks = historyTasks
            .filter(task => isHistoryStoppedStatus(task && task.status))
            .filter(task => !isTransientMagnetTask(task))

          // 如果没有从Aria2获取到已停止的任务，直接返回历史记录
          if (stoppedTasks.length === 0) {
            return historyStoppedTasks
              .filter(task => !looksLikeBilibiliDashPart(task))
          }

          // 保存从Aria2获取到的已停止任务到历史记录
          const savableStoppedTasks = stoppedTasks.filter(task => !looksLikeBilibiliDashPart(task))
          taskHistory.saveStoppedTasks(savableStoppedTasks)

          stoppedTasks = this._mergeHistoryToTasks(stoppedTasks)
          // 移除已停止状态下的临时磁力任务，避免出现无效重复记录
          stoppedTasks = stoppedTasks.filter(task => !(isTransientMagnetTask(task) && isHistoryStoppedStatus(task && task.status)))

          // 合并Aria2任务和历史记录任务，避免重复
          const currentGids = new Set(stoppedTasks.map(task => task.gid))
          const newHistoryTasks = historyStoppedTasks
            .filter(task => !currentGids.has(task.gid))
            .filter(task => isHistoryStoppedStatus(task && task.status))
          stoppedTasks = stoppedTasks.filter(task => isStoppedCategoryStatus(task && task.status))

          let merged = [...stoppedTasks, ...newHistoryTasks]
          try {
            const deleted = taskHistory.getAllHistory().filter(t => t && t.deletedAt && t.gid).map(t => t.gid)
            if (deleted.length > 0) {
              const deletedGids = new Set(deleted)
              merged = merged.filter(task => task && task.gid && !deletedGids.has(task.gid))
            }
          } catch (e) {}

          return merged.filter(task => !looksLikeBilibiliDashPart(task))
        })
        .catch(err => {
          console.log('[Motrix] fetch stopped task list fail, fallback to history:', err)
          const history = taskHistory.getHistory()
          return history
            .filter(task => isHistoryStoppedStatus(task && task.status))
            .filter(task => !isTransientMagnetTask(task))
            .filter(task => !looksLikeBilibiliDashPart(task))
        })
    default:
      return this.fetchDownloadingTaskList(params)
    }
  }

  fetchTaskItem (params = {}) {
    const { gid, keys } = params
    const args = compactUndefined([gid, keys])
    return this.client.call('tellStatus', ...args)
      .catch((error) => {
        console.log('[Motrix] fetchTaskItem fail:', error.message)
        // 返回一个空对象或者重新抛出错误，让上层调用者处理
        return Promise.reject(error)
      })
  }

  fetchTaskItemWithPeers (params = {}) {
    const { gid, keys } = params
    const statusArgs = compactUndefined([gid, keys])
    const peersArgs = compactUndefined([gid])
    return new Promise((resolve, reject) => {
      this.client.multicall([
        ['aria2.tellStatus', ...statusArgs],
        ['aria2.getPeers', ...peersArgs]
      ]).then((data) => {
        console.log('[Motrix] fetchTaskItemWithPeers:', data)

        // multicall 返回的是 [result1, result2]，每个result是 [value] 或 value
        // 需要处理两种可能的格式
        let result, peers

        if (Array.isArray(data) && data.length >= 2) {
          // 提取第一个结果（tellStatus）
          result = Array.isArray(data[0]) ? data[0][0] : data[0]
          // 提取第二个结果（getPeers）
          peers = Array.isArray(data[1]) ? data[1][0] : data[1]
        }

        console.log('[Motrix] fetchTaskItemWithPeers.result:', result)
        console.log('[Motrix] fetchTaskItemWithPeers.peers:', peers)

        // 确保result存在再设置peers
        if (result) {
          result.peers = peers || { connected: [], attempting: [], banned: [], disconnected: [] }
          resolve(result)
        } else {
          reject(new Error('No task data returned'))
        }
      }).catch((err) => {
        console.log('[Motrix] fetchTaskItemWithPeers fail:', err.message)
        reject(err)
      })
    })
  }

  fetchTaskItemPeers (params = {}) {
    const { gid, keys } = params
    const args = compactUndefined([gid, keys])
    return this.client.call('getPeers', ...args)
  }

  banPeer (params = {}) {
    const { gid, ip, duration } = params
    console.log('[Motrix API] banPeer called with:', { gid, ip, duration, types: { gid: typeof gid, ip: typeof ip, duration: typeof duration } })

    // Ensure all parameters are the correct type
    const gidStr = String(gid)
    const ipStr = String(ip)
    const durationInt = Number(duration)

    console.log('[Motrix API] banPeer converted:', { gidStr, ipStr, durationInt })

    return this.client.call('aria2.banPeer', gidStr, ipStr, durationInt)
  }

  unbanPeer (params = {}) {
    const { gid, ip } = params
    console.log('[Motrix API] unbanPeer called with:', { gid, ip, types: { gid: typeof gid, ip: typeof ip } })

    // Ensure all parameters are the correct type
    const gidStr = String(gid)
    const ipStr = String(ip)

    console.log('[Motrix API] unbanPeer converted:', { gidStr, ipStr })

    return this.client.call('aria2.unbanPeer', gidStr, ipStr)
  }

  // 获取任务的服务器/连接详细信息
  fetchTaskServers (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])
    return this.client.call('getServers', ...args)
      .catch((error) => {
        console.log('[Motrix] fetchTaskServers fail:', error.message)
        return []
      })
  }

  // 获取BT任务的追踪器统计信息
  fetchTaskTrackers (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])
    return this.client.call('getTrackers', ...args)
      .catch((error) => {
        console.log('[Motrix] fetchTaskTrackers fail:', error.message)
        return []
      })
  }

  pauseTask (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])
    return this.client.call('pause', ...args)
  }

  pauseAllTask (params = {}) {
    return this.client.call('pauseAll')
  }

  forcePauseTask (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])
    return this.client.call('forcePause', ...args)
  }

  forcePauseAllTask (params = {}) {
    return this.client.call('forcePauseAll')
  }

  resumeTask (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])
    return this.client.call('unpause', ...args)
  }

  resumeAllTask (params = {}) {
    return this.client.call('unpauseAll')
  }

  changeUri (params = {}) {
    const { gid, fileIndex = 1, delUris = [], addUris = [], position } = params
    const idx = Number(fileIndex) || 1
    const del = Array.isArray(delUris) ? delUris : []
    const add = Array.isArray(addUris) ? addUris : []
    const args = compactUndefined([gid, idx, del, add, position])
    return this.client.call('changeUri', ...args)
  }

  removeTask (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])

    return this.client.call('remove', ...args)
      .catch((error) => {
        if (error && error.code === 1) {
          return gid
        }
        throw error
      })
      .then((result) => this.client.call('removeDownloadResult', ...args)
        .catch((error) => {
          if (error && error.code === 1) {
            return
          }
          throw error
        })
        .then(() => {
          taskHistory.removeTask(gid)
          return result
        }))
  }

  forceRemoveTask (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])

    return this.client.call('forceRemove', ...args)
      .catch((error) => {
        if (error && error.code === 1) {
          return gid
        }
        throw error
      })
      .then((result) => this.client.call('removeDownloadResult', ...args)
        .catch((error) => {
          if (error && error.code === 1) {
            return
          }
          throw error
        })
        .then(() => {
          taskHistory.removeTask(gid)
          return result
        }))
  }

  saveSession (params = {}) {
    return this.client.call('saveSession')
  }

  purgeTaskRecord (params = {}) {
    return this.client.call('purgeDownloadResult')
      .then(() => {
        // 清空任务历史记录
        taskHistory.clearHistory()
      })
  }

  removeTaskRecord (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])

    return this.client.call('removeDownloadResult', ...args)
      .catch((error) => {
        if (error && error.code === 1) {
          return
        }
        throw error
      })
      .then(() => {
        taskHistory.removeTask(gid)
      })
  }

  removeDownloadResult (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])
    return this.client.call('removeDownloadResult', ...args)
  }

  multicall (method, params = {}) {
    let { gids, options = {} } = params
    const normalizedOptions = { ...options }
    if (normalizedOptions['bt-encryption-mode'] !== undefined) {
      const mode = normalizedOptions['bt-encryption-mode']
      if (mode === 'force') {
        normalizedOptions['bt-require-crypto'] = true
        normalizedOptions['bt-min-crypto-level'] = 'arc4'
      } else if (mode === 'none') {
        normalizedOptions['bt-require-crypto'] = false
        normalizedOptions['bt-min-crypto-level'] = 'plain'
      } else {
        normalizedOptions['bt-require-crypto'] = false
        normalizedOptions['bt-min-crypto-level'] = 'arc4'
      }
      delete normalizedOptions['bt-encryption-mode']
      delete normalizedOptions['bt-force-encryption']
    } else if (normalizedOptions['bt-force-encryption'] !== undefined) {
      const forceEncryption = normalizedOptions['bt-force-encryption'] === true || normalizedOptions['bt-force-encryption'] === 'true'
      normalizedOptions['bt-require-crypto'] = forceEncryption
      normalizedOptions['bt-min-crypto-level'] = forceEncryption ? 'arc4' : 'plain'
    }
    options = formatOptionsForEngine(normalizedOptions)

    const data = gids.map((gid, index) => {
      const _options = clone(options)
      const args = compactUndefined([gid, _options])
      return [method, ...args]
    })
    return this.client.multicall(data)
  }

  batchChangeOption (params = {}) {
    return this.multicall('aria2.changeOption', params)
  }

  batchRemoveTask (params = {}) {
    const { gids } = params
    const list = Array.isArray(gids) ? gids.filter(Boolean) : []

    return this.multicall('aria2.remove', params)
      .catch((error) => {
        if (error && error.code === 1) {
          return []
        }
        throw error
      })
      .then(() => Promise.all(list.map(gid => {
        const args = compactUndefined([gid])
        return this.client.call('removeDownloadResult', ...args)
          .catch((error) => {
            if (error && error.code === 1) {
              return
            }
            throw error
          })
      })))
      .then((result) => {
        list.forEach(gid => taskHistory.removeTask(gid))
        return result
      })
  }

  batchResumeTask (params = {}) {
    return this.multicall('aria2.unpause', params)
  }

  batchPauseTask (params = {}) {
    return this.multicall('aria2.pause', params)
  }

  batchForcePauseTask (params = {}) {
    return this.multicall('aria2.forcePause', params)
  }

  // 优先级管理相关方法
  getPriorityStatus () {
    return ipcRenderer.invoke('priority:status').catch(err => {
      console.warn('[Motrix] getPriorityStatus failed:', err.message)
      return { success: false, error: err.message }
    })
  }

  // 触发优先级重新平衡（当用户修改任务优先级后调用）
  rebalancePriority () {
    return ipcRenderer.invoke('priority:rebalance').catch(err => {
      console.warn('[Motrix] rebalancePriority failed:', err.message)
      return { success: false, error: err.message }
    })
  }
}
