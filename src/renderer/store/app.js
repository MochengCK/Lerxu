import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import is from 'electron-is'
import { ipcRenderer } from 'electron'
import { ADD_TASK_TYPE } from '@shared/constants'
import api from '@/api'
import { getSystemTheme } from '@/utils/native'

const BASE_INTERVAL = 1000
const PER_INTERVAL = 100
const MIN_INTERVAL = 500
const MAX_INTERVAL = 30000

export const useAppStore = defineStore('app', () => {
  // State
  const systemTheme = ref(getSystemTheme())
  const trayFocused = ref(false)
  const currentPage = ref('/task')
  const engineInfo = shallowRef({
    version: '',
    enabledFeatures: [],
    architecture: '',
    features: [],
    dependencies: [],
    compileInfo: '',
    binPath: ''
  })
  const engineList = shallowRef({
    engines: [],
    platform: '',
    arch: '',
    timestamp: 0,
    error: null
  })
  const engineOptions = ref({})
  const interval = ref(BASE_INTERVAL)
  const stat = shallowRef({
    downloadSpeed: 0,
    uploadSpeed: 0,
    numActive: 0,
    numWaiting: 0,
    numStopped: 0
  })
  const addTaskVisible = ref(false)
  const addTaskType = ref(ADD_TASK_TYPE.URI)
  const addTaskUrl = ref('')
  const addTaskTorrents = ref([])
  const addTaskOptions = ref({})
  const taskPlanVisible = ref(false)
  const progress = ref(0)
  const isCheckingUpdate = ref(false)
  const isAsideHovered = ref(false)
  const titleBarText = ref('')

  // Getters
  const hasActiveTask = computed(() => stat.value.numActive > 0)

  // Actions
  function updateSystemTheme (theme) {
    systemTheme.value = theme
  }

  function updateTrayFocused (focused) {
    trayFocused.value = focused
  }

  function updateCurrentPage (page) {
    currentPage.value = page
  }

  function updateAsideHovered (hovered) {
    isAsideHovered.value = !!hovered
  }

  function updateEngineInfo (info) {
    const { version, architecture, features, dependencies, compileInfo, binPath } = info
    const versionStr = version && typeof version === 'object' ? version.version : version
    const enabledFeatures = version && typeof version === 'object' ? version.enabledFeatures : []
    engineInfo.value = {
      version: versionStr || '',
      enabledFeatures: enabledFeatures || [],
      architecture: architecture || '',
      features: features || [],
      dependencies: dependencies || [],
      compileInfo: compileInfo || '',
      binPath: binPath || ''
    }
  }

  function updateEngineOptions (options) {
    engineOptions.value = { ...engineOptions.value, ...options }
  }

  function updateGlobalStat (newStat) {
    stat.value = newStat
  }

  function updateAddTaskVisible (visible) {
    addTaskVisible.value = visible
  }

  function updateAddTaskType (taskType) {
    addTaskType.value = taskType
  }

  function updateAddTaskUrl (text) {
    addTaskUrl.value = text
  }

  function updateAddTaskTorrents (fileList) {
    addTaskTorrents.value = [...fileList]
  }

  function updateAddTaskOptions (options) {
    addTaskOptions.value = {
      ...addTaskOptions.value,
      ...options
    }
  }

  function resetAddTaskOptions () {
    addTaskOptions.value = {}
  }

  function updateTaskPlanVisible (visible) {
    taskPlanVisible.value = visible
  }

  function updateInterval (millisecond) {
    let val = millisecond
    if (millisecond > MAX_INTERVAL) val = MAX_INTERVAL
    if (millisecond < MIN_INTERVAL) val = MIN_INTERVAL
    if (interval.value === val) return
    interval.value = val
  }

  function increaseInterval (millisecond = 100) {
    if (interval.value < MAX_INTERVAL) {
      interval.value += millisecond
    }
  }

  function decreaseInterval (millisecond = 100) {
    if (interval.value > MIN_INTERVAL) {
      interval.value -= millisecond
    }
  }

  function resetInterval () {
    interval.value = BASE_INTERVAL
  }

  function updateProgress (val) {
    progress.value = val
  }

  function clearProgress () {
    progress.value = -1
  }

  function updateCheckingUpdate (isChecking) {
    isCheckingUpdate.value = isChecking
  }

  function updateTitleBarText (text) {
    titleBarText.value = text || ''
  }

  function updateEngineList (engineListData) {
    engineList.value = {
      engines: engineListData.engines || [],
      platform: engineListData.platform || '',
      arch: engineListData.arch || '',
      timestamp: engineListData.timestamp || 0,
      error: engineListData.error || null
    }
  }

  function showAddTaskDialog (taskType) {
    addTaskType.value = taskType
    addTaskVisible.value = true
  }

  function hideAddTaskDialog () {
    addTaskVisible.value = false
    addTaskUrl.value = ''
    addTaskTorrents.value = []
    addTaskOptions.value = {}
  }

  function changeAddTaskType (taskType) {
    addTaskType.value = taskType
  }

  function addTaskAddTorrents ({ fileList }) {
    addTaskTorrents.value = fileList
  }

  function fetchEngineInfo () {
    return new Promise((resolve, reject) => {
      ipcRenderer.send('command', 'engine:get-version-info')

      const handleEngineInfo = (event, command, info) => {
        if (command !== 'engine-version-info') return

        ipcRenderer.removeListener('command', handleEngineInfo)
        clearTimeout(timeoutId)

        if (info && info.error) {
          console.error('[LinkCore] Failed to fetch engine info:', info.error)
          reject(new Error(info.error))
          return
        }

        updateEngineInfo(info)
        resolve(info)
      }

      const timeoutId = setTimeout(() => {
        ipcRenderer.removeListener('command', handleEngineInfo)
        console.warn('[LinkCore] Timeout fetching engine info')
        reject(new Error('Timeout fetching engine info'))
      }, 5000)

      ipcRenderer.on('command', handleEngineInfo)
    })
  }

  function fetchEngineOptions () {
    return new Promise((resolve) => {
      api.getGlobalOption()
        .then((data) => {
          updateEngineOptions(data)
          resolve(data)
        })
        .catch(() => {})
    })
  }

  function fetchGlobalStat () {
    return api.getGlobalStat()
      .then((data) => {
        const newStat = {}
        Object.keys(data).forEach((key) => {
          newStat[key] = Number(data[key])
        })

        const { numActive } = newStat
        if (numActive > 0) {
          const val = BASE_INTERVAL - PER_INTERVAL * numActive
          updateInterval(val)
        } else {
          increaseInterval()
        }
        stat.value = newStat
      })
      .catch(() => {})
  }

  function fetchProgress () {
    return api.fetchActiveTaskList()
      .then((data) => {
        let val = -1
        if (data.length !== 0) {
          data.forEach((task) => {
            task.totalLength = Number(task.totalLength)
            task.completedLength = Number(task.completedLength)
          })
          const realTotal = data.reduce((total, task) => total + task.totalLength, 0)
          if (realTotal === 0) {
            val = 2
          } else {
            const tasks = data.filter((task) => task.totalLength !== 0)
            const completed = tasks.reduce((total, task) => total + task.completedLength, 0)
            const total = tasks.reduce((total, task) => total + task.totalLength, 0)
            val = completed / total
          }
        }
        progress.value = val
      })
      .catch(() => {})
  }

  function fetchEngineList () {
    return new Promise((resolve, reject) => {
      ipcRenderer.send('command', 'engine:get-list')

      const handleEngineList = (event, command, engineListData) => {
        if (command !== 'engine-list') return

        ipcRenderer.removeListener('command', handleEngineList)
        clearTimeout(timeoutId)

        if (engineListData && engineListData.error) {
          console.error('[LinkCore] Failed to fetch engine list:', engineListData.error)
          reject(new Error(engineListData.error))
          return
        }

        updateEngineList(engineListData)
        resolve(engineListData)
      }

      const timeoutId = setTimeout(() => {
        ipcRenderer.removeListener('command', handleEngineList)
        console.warn('[LinkCore] Timeout fetching engine list')
        reject(new Error('Timeout fetching engine list'))
      }, 5000)

      ipcRenderer.on('command', handleEngineList)
    })
  }

  return {
    // State
    systemTheme,
    trayFocused,
    currentPage,
    engineInfo,
    engineList,
    engineOptions,
    interval,
    stat,
    addTaskVisible,
    addTaskType,
    addTaskUrl,
    addTaskTorrents,
    addTaskOptions,
    taskPlanVisible,
    progress,
    isCheckingUpdate,
    isAsideHovered,
    titleBarText,
    // Getters
    hasActiveTask,
    // Actions
    updateSystemTheme,
    updateTrayFocused,
    updateCurrentPage,
    updateAsideHovered,
    updateEngineInfo,
    updateEngineOptions,
    updateGlobalStat,
    updateAddTaskVisible,
    updateAddTaskType,
    updateAddTaskUrl,
    updateAddTaskTorrents,
    updateAddTaskOptions,
    resetAddTaskOptions,
    updateTaskPlanVisible,
    updateInterval,
    increaseInterval,
    decreaseInterval,
    resetInterval,
    updateProgress,
    clearProgress,
    updateCheckingUpdate,
    updateTitleBarText,
    updateEngineList,
    showAddTaskDialog,
    hideAddTaskDialog,
    changeAddTaskType,
    addTaskAddTorrents,
    fetchEngineInfo,
    fetchEngineOptions,
    fetchGlobalStat,
    fetchProgress,
    fetchEngineList
  }
})
