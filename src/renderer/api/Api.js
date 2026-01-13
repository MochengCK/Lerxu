import { ipcRenderer } from 'electron'
import is from 'electron-is'
import { isEmpty, clone } from 'lodash'
import { existsSync } from 'fs'
import { basename } from 'path'
import { Aria2 } from '@shared/aria2'
import {
  separateConfig,
  compactUndefined,
  formatOptionsForEngine,
  mergeTaskResult,
  changeKeysToCamelCase,
  changeKeysToKebabCase,
  generateUniqueTaskName
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
    const p = first && first.path ? `${first.path}` : ''
    if (!p) {
      return false
    }
    const base = basename(p)
    const lower = base.toLowerCase()
    const looksLikePart = lower.endsWith('_video.mp4') ||
      lower.endsWith('_audio.m4a') ||
      /\.m4s$/i.test(base)
    if (!looksLikePart) {
      return false
    }
    let missing = false
    try {
      missing = !existsSync(p)
    } catch (_) {}
    return missing
  } catch (_) {
    return false
  }
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
    const { user, system, others } = separateConfig(params)
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
    const args = formatOptionsForEngine(options)

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

    const engineOptions = formatOptionsForEngine(options)
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
        const uniqueOut = generateUniqueTaskName(out, existingNames)
        engineOptions.out = uniqueOut
        existingNames.add(uniqueOut)
      }

      const args = compactUndefined([[uri], engineOptions])
      return ['aria2.addUri', ...args]
    })
    return this.client.multicall(tasks)
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
      const uniqueOut = generateUniqueTaskName(engineOptions.out, existingNames)
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

    const historyMap = new Map(historyTasks.map(task => [task.gid, task]))
    return tasks.map(task => {
      const historyTask = historyMap.get(task.gid)
      if (historyTask) {
        const { savedAt, startedAt, createdAt, averageDownloadSpeed, averageSpeedSampleCount } = historyTask
        const liveStatus = `${task.status || ''}`
        const historyStatus = `${historyTask.status || ''}`
        const activeStatuses = new Set([TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED])
        const stoppedStatuses = new Set([TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED])
        const total = Number(task.totalLength || historyTask.totalLength || 0)
        const completed = Number(task.completedLength || historyTask.completedLength || 0)
        const shouldCoerceToHistoryStatus =
          activeStatuses.has(liveStatus) &&
          stoppedStatuses.has(historyStatus) &&
          Number.isFinite(total) && total > 0 &&
          Number.isFinite(completed) && completed >= total
        return {
          ...task,
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
            return isMetadataTask || [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED].includes(status)
          })
          taskHistory.saveStoppedTasks(stoppedTasks)

          // 获取历史记录并合并到结果中
          const historyTasks = taskHistory.getHistory()
          if (historyTasks.length > 0) {
            // 合并历史任务，避免重复
            const currentGids = new Set(result.map(task => task.gid))
            const newHistoryTasks = historyTasks.filter(task => !currentGids.has(task.gid))

            // 为从aria2获取的已停止任务合并历史字段（如 savedAt/平均速度）
            const historyMap = new Map(historyTasks.map(task => [task.gid, task]))
            result = result.map(task => {
              if ([TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED].includes(task.status)) {
                const historyTask = historyMap.get(task.gid)
                if (historyTask) {
                  const { savedAt, startedAt, createdAt, averageDownloadSpeed, averageSpeedSampleCount } = historyTask
                  return {
                    ...task,
                    ...(savedAt ? { savedAt } : {}),
                    ...(startedAt ? { startedAt } : {}),
                    ...(createdAt ? { createdAt } : {}),
                    ...(averageDownloadSpeed != null ? { averageDownloadSpeed } : {}),
                    ...(averageSpeedSampleCount != null ? { averageSpeedSampleCount } : {})
                  }
                }
              }
              return task
            })

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

          // 如果没有从Aria2获取到已停止的任务，直接返回历史记录
          if (stoppedTasks.length === 0) {
            return historyTasks
          }

          // 保存从Aria2获取到的已停止任务到历史记录
          taskHistory.saveStoppedTasks(stoppedTasks)

          // 合并Aria2任务和历史记录任务，避免重复
          const currentGids = new Set(stoppedTasks.map(task => task.gid))
          const newHistoryTasks = historyTasks.filter(task => !currentGids.has(task.gid))

          // 为从aria2获取的已停止任务合并历史字段（如 savedAt/平均速度）
          const updatedHistoryTasks = taskHistory.getHistory()
          const historyMap = new Map(updatedHistoryTasks.map(task => [task.gid, task]))
          stoppedTasks = stoppedTasks.map(task => {
            const historyTask = historyMap.get(task.gid)
            if (historyTask) {
              const { savedAt, startedAt, createdAt, averageDownloadSpeed, averageSpeedSampleCount } = historyTask
              return {
                ...task,
                ...(savedAt ? { savedAt } : {}),
                ...(startedAt ? { startedAt } : {}),
                ...(createdAt ? { createdAt } : {}),
                ...(averageDownloadSpeed != null ? { averageDownloadSpeed } : {}),
                ...(averageSpeedSampleCount != null ? { averageSpeedSampleCount } : {})
              }
            }
            return task
          })

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
          return history.filter(task => !looksLikeBilibiliDashPart(task))
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
        const result = data[0] && data[0][0]
        const peers = data[1] && data[1][0]
        result.peers = peers || []
        console.log('[Motrix] fetchTaskItemWithPeers.result:', result)
        console.log('[Motrix] fetchTaskItemWithPeers.peers:', peers)

        resolve(result)
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

  removeTask (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])

    // 先从历史记录中移除任务，确保任务卡片会消失
    taskHistory.removeTask(gid)

    return this.client.call('remove', ...args)
      .then((result) => {
        // 删除成功后，也尝试清理aria2的下载结果记录
        return this.client.call('removeDownloadResult', ...args)
          .catch(() => {
            // 忽略清理失败的错误
          })
          .then(() => result)
      })
  }

  forceRemoveTask (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])

    // 先从历史记录中移除任务，确保任务卡片会消失
    taskHistory.removeTask(gid)

    return this.client.call('forceRemove', ...args)
      .then((result) => {
        // 删除成功后，也尝试清理aria2的下载结果记录
        return this.client.call('removeDownloadResult', ...args)
          .catch(() => {
            // 忽略清理失败的错误
          })
          .then(() => result)
      })
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

    // 先从历史记录中移除任务，确保任务卡片会消失
    taskHistory.removeTask(gid)

    // 然后尝试从Aria2中删除任务记录，如果失败则忽略
    return this.client.call('removeDownloadResult', ...args)
      .catch((err) => {
        console.log('[Motrix] removeTaskRecord from aria2 fail:', err)
        // 忽略Aria2删除失败的错误，因为任务可能已经不在Aria2中了
      })
  }

  removeDownloadResult (params = {}) {
    const { gid } = params
    const args = compactUndefined([gid])
    return this.client.call('removeDownloadResult', ...args)
  }

  multicall (method, params = {}) {
    let { gids, options = {} } = params
    options = formatOptionsForEngine(options)

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

    if (Array.isArray(gids) && gids.length > 0) {
      gids.forEach(gid => {
        if (gid) {
          taskHistory.removeTask(gid)
        }
      })
    }

    return this.multicall('aria2.remove', params)
      .then(() => {
        if (!Array.isArray(gids) || gids.length === 0) {
          return
        }

        const calls = gids.map(gid => {
          if (!gid) {
            return Promise.resolve()
          }

          const args = compactUndefined([gid])
          return this.client.call('removeDownloadResult', ...args)
            .catch((err) => {
              console.log('[Motrix] batchRemoveTask removeDownloadResult fail:', err)
            })
        })

        return Promise.all(calls)
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
