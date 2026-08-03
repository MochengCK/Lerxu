import { ADD_TASK_TYPE } from '@shared/constants'
import api from '@/api'
import { getSystemTheme } from '@/utils/native'
import { ipcRenderer } from 'electron'

const BASE_INTERVAL = 1000
const PER_INTERVAL = 100
const MIN_INTERVAL = 500
const MAX_INTERVAL = 30000

const state = {
  systemTheme: getSystemTheme(),
  trayFocused: false,
  currentPage: '/task',
  engineInfo: {
    version: '',
    enabledFeatures: [],
    architecture: '',
    features: [],
    dependencies: [],
    compileInfo: '',
    binPath: ''
  },
  engineList: {
    engines: [],
    platform: '',
    arch: '',
    timestamp: 0,
    error: null
  },
  engineOptions: {},
  interval: BASE_INTERVAL,
  stat: {
    downloadSpeed: 0,
    uploadSpeed: 0,
    numActive: 0,
    numWaiting: 0,
    numStopped: 0
  },
  addTaskVisible: false,
  addTaskType: ADD_TASK_TYPE.URI,
  addTaskUrl: '',
  addTaskTorrents: [],
  addTaskOptions: {},
  taskPlanVisible: false,
  progress: 0,
  isCheckingUpdate: false,
  isAsideHovered: false
}

const getters = {
}

const mutations = {
  UPDATE_SYSTEM_THEME (state, theme) {
    state.systemTheme = theme
  },
  UPDATE_TRAY_FOCUSED (state, focused) {
    state.trayFocused = focused
  },
  UPDATE_CURRENT_PAGE (state, page) {
    state.currentPage = page
  },
  UPDATE_ENGINE_INFO (state, engineInfo) {
    // 正确处理后端返回的数据结构
    const { version, architecture, features, dependencies, compileInfo, binPath } = engineInfo

    // 如果version是对象，提取version字段和enabledFeatures
    const versionStr = version && typeof version === 'object' ? version.version : version
    const enabledFeatures = version && typeof version === 'object' ? version.enabledFeatures : []

    state.engineInfo = {
      version: versionStr || '',
      enabledFeatures: enabledFeatures || [],
      architecture: architecture || '',
      features: features || [],
      dependencies: dependencies || [],
      compileInfo: compileInfo || '',
      binPath: binPath || ''
    }
  },
  UPDATE_ENGINE_OPTIONS (state, engineOptions) {
    state.engineOptions = { ...state.engineOptions, ...engineOptions }
  },
  UPDATE_GLOBAL_STAT (state, stat) {
    state.stat = stat
  },
  UPDATE_ADD_TASK_VISIBLE (state, visible) {
    state.addTaskVisible = visible
  },
  UPDATE_ADD_TASK_TYPE (state, taskType) {
    state.addTaskType = taskType
  },
  UPDATE_ADD_TASK_URL (state, text) {
    state.addTaskUrl = text
  },
  UPDATE_ADD_TASK_TORRENTS (state, fileList) {
    state.addTaskTorrents = [...fileList]
  },
  UPDATE_ADD_TASK_OPTIONS (state, options) {
    state.addTaskOptions = {
      ...state.addTaskOptions,
      ...options
    }
  },
  RESET_ADD_TASK_OPTIONS (state) {
    state.addTaskOptions = {}
  },
  UPDATE_TASK_PLAN_VISIBLE (state, visible) {
    state.taskPlanVisible = visible
  },
  UPDATE_INTERVAL (state, millisecond) {
    let interval = millisecond
    if (millisecond > MAX_INTERVAL) {
      interval = MAX_INTERVAL
    }
    if (millisecond < MIN_INTERVAL) {
      interval = MIN_INTERVAL
    }
    if (state.interval === interval) {
      return
    }
    state.interval = interval
  },
  INCREASE_INTERVAL (state, millisecond) {
    if (state.interval < MAX_INTERVAL) {
      state.interval += millisecond
    }
  },
  DECREASE_INTERVAL (state, millisecond) {
    if (state.interval > MIN_INTERVAL) {
      state.interval -= millisecond
    }
  },
  UPDATE_PROGRESS (state, progress) {
    state.progress = progress
  },
  UPDATE_CHECKING_UPDATE (state, isChecking) {
    state.isCheckingUpdate = isChecking
  },
  UPDATE_TITLE_BAR_TEXT (state, text) {
    state.titleBarText = text || ''
  },
  UPDATE_ASIDE_HOVERED (state, hovered) {
    state.isAsideHovered = !!hovered
  },
  UPDATE_ENGINE_LIST (state, engineListData) {
    state.engineList = {
      engines: engineListData.engines || [],
      platform: engineListData.platform || '',
      arch: engineListData.arch || '',
      timestamp: engineListData.timestamp || 0,
      error: engineListData.error || null
    }
  }
}

const actions = {
  updateSystemTheme ({ commit }, theme) {
    commit('UPDATE_SYSTEM_THEME', theme)
  },
  updateTrayFocused ({ commit }, focused) {
    commit('UPDATE_TRAY_FOCUSED', focused)
  },
  updateCurrentPage ({ commit }, page) {
    commit('UPDATE_CURRENT_PAGE', page)
  },
  updateAsideHovered ({ commit }, hovered) {
    commit('UPDATE_ASIDE_HOVERED', hovered)
  },
  fetchEngineInfo ({ commit }) {
    return new Promise((resolve, reject) => {
      // 通过IPC调用后端获取完整的引擎信息
      ipcRenderer.send('command', 'engine:get-version-info')

      // 监听引擎信息返回事件
      const handleEngineInfo = (event, command, engineInfo) => {
        if (command !== 'engine-version-info') {
          return
        }

        ipcRenderer.removeListener('command', handleEngineInfo)
        clearTimeout(timeoutId)

        if (engineInfo && engineInfo.error) {
          console.error('[LinkCore] Failed to fetch engine info:', engineInfo.error)
          reject(new Error(engineInfo.error))
          return
        }

        commit('UPDATE_ENGINE_INFO', engineInfo)
        resolve(engineInfo)
      }

      // 设置超时处理
      const timeoutId = setTimeout(() => {
        ipcRenderer.removeListener('command', handleEngineInfo)
        console.warn('[LinkCore] Timeout fetching engine info')
        reject(new Error('Timeout fetching engine info'))
      }, 5000)

      ipcRenderer.on('command', handleEngineInfo)
    })
  },
  fetchEngineOptions ({ commit }) {
    return new Promise((resolve) => {
      api.getGlobalOption()
        .then((data) => {
          commit('UPDATE_ENGINE_OPTIONS', data)
          resolve(data)
        })
    })
  },
  fetchGlobalStat ({ commit, dispatch }) {
    api.getGlobalStat()
      .then((data) => {
        const stat = {}
        Object.keys(data).forEach((key) => {
          stat[key] = Number(data[key])
        })

        const { numActive } = stat
        if (numActive > 0) {
          const interval = BASE_INTERVAL - PER_INTERVAL * numActive
          dispatch('updateInterval', interval)
        } else {
          // 只在彻底没有任务时才重置速度，不要在轮询时频繁设置为0
          dispatch('increaseInterval')
        }
        commit('UPDATE_GLOBAL_STAT', stat)
      })
  },
  increaseInterval ({ commit }, millisecond = 100) {
    commit('INCREASE_INTERVAL', millisecond)
  },
  showAddTaskDialog ({ commit }, taskType) {
    commit('UPDATE_ADD_TASK_TYPE', taskType)
    commit('UPDATE_ADD_TASK_VISIBLE', true)
  },
  hideAddTaskDialog ({ commit }) {
    commit('UPDATE_ADD_TASK_VISIBLE', false)
    commit('UPDATE_ADD_TASK_URL', '')
    commit('UPDATE_ADD_TASK_TORRENTS', [])
    commit('RESET_ADD_TASK_OPTIONS')
  },
  changeAddTaskType ({ commit }, taskType) {
    commit('UPDATE_ADD_TASK_TYPE', taskType)
  },
  updateAddTaskUrl ({ commit }, uri = '') {
    commit('UPDATE_ADD_TASK_URL', uri)
  },
  addTaskAddTorrents ({ commit }, { fileList }) {
    commit('UPDATE_ADD_TASK_TORRENTS', fileList)
  },
  updateAddTaskOptions ({ commit }, options = {}) {
    commit('UPDATE_ADD_TASK_OPTIONS', options)
  },
  resetAddTaskOptions ({ commit }) {
    commit('RESET_ADD_TASK_OPTIONS')
  },
  updateInterval ({ commit }, millisecond) {
    commit('UPDATE_INTERVAL', millisecond)
  },
  resetInterval ({ commit }) {
    commit('UPDATE_INTERVAL', BASE_INTERVAL)
  },
  fetchProgress ({ commit }) {
    api.fetchActiveTaskList()
      .then((data) => {
        let progress = -1
        if (data.length !== 0) {
          data.forEach((task) => {
            task.totalLength = Number(task.totalLength)
            task.completedLength = Number(task.completedLength)
          })
          const realTotal = data.reduce((total, task) => total + task.totalLength, 0)
          if (realTotal === 0) {
            progress = 2
          } else {
            const tasks = data.filter((task) => task.totalLength !== 0)
            const completed = tasks.reduce((total, task) => total + task.completedLength, 0)
            const total = tasks.reduce((total, task) => total + task.totalLength, 0)
            progress = completed / total
          }
        }
        commit('UPDATE_PROGRESS', progress)
      })
      .catch(() => {
        // 引擎断线时轮询会 reject，静默忽略避免每秒产生 unhandled rejection
      })
  },
  clearProgress ({ commit }) {
    commit('UPDATE_PROGRESS', -1)
  },
  updateCheckingUpdate ({ commit }, isChecking) {
    commit('UPDATE_CHECKING_UPDATE', isChecking)
  },
  fetchEngineList ({ commit }) {
    return new Promise((resolve, reject) => {
      // 通过IPC调用后端获取引擎列表
      ipcRenderer.send('command', 'engine:get-list')

      // 监听引擎列表返回事件
      const handleEngineList = (event, command, engineListData) => {
        if (command !== 'engine-list') {
          return
        }

        ipcRenderer.removeListener('command', handleEngineList)
        clearTimeout(timeoutId)

        if (engineListData && engineListData.error) {
          console.error('[LinkCore] Failed to fetch engine list:', engineListData.error)
          reject(new Error(engineListData.error))
          return
        }

        commit('UPDATE_ENGINE_LIST', engineListData)
        resolve(engineListData)
      }

      // 设置超时处理
      const timeoutId = setTimeout(() => {
        ipcRenderer.removeListener('command', handleEngineList)
        console.warn('[LinkCore] Timeout fetching engine list')
        reject(new Error('Timeout fetching engine list'))
      }, 5000)

      ipcRenderer.on('command', handleEngineList)
    })
  }
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions
}
