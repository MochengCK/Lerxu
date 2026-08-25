import { ElMessage as Message } from 'element-plus'
import { ipcRenderer } from 'electron'

import router from '@/router'
import { useAppStore, usePreferenceStore, useTaskStore } from '@/store'
import { buildFileList } from '@shared/utils'
import { ADD_TASK_TYPE } from '@shared/constants'
import { getLocaleManager } from '@/components/Locale'
import { commands } from '@/components/CommandManager/instance'
import {
  initTaskForm,
  buildUriPayload,
  buildTorrentPayload
} from '@/utils/task'

const i18n = getLocaleManager().getI18n()

const updateSystemTheme = (payload = {}) => {
  const { theme } = payload
  const appStore = useAppStore()
  appStore.updateSystemTheme(theme)
}

const updateTheme = (payload = {}) => {
  const { theme } = payload
  const preferenceStore = usePreferenceStore()
  preferenceStore.updateAppTheme(theme)
}

const updateLocale = (payload = {}) => {
  const { locale } = payload
  const preferenceStore = usePreferenceStore()
  preferenceStore.updateAppLocale(locale)
}

const updateTrayFocused = (payload = {}) => {
  const { focused } = payload
  const appStore = useAppStore()
  appStore.updateTrayFocused(focused)
}

const addTask = (payload = {}) => {
  const {
    type = ADD_TASK_TYPE.URI,
    uri,
    silent,
    ...rest
  } = payload

  const options = {
    ...rest
  }

  const appStore = useAppStore()

  if (type === ADD_TASK_TYPE.URI && uri) {
    appStore.updateAddTaskUrl(uri)
  }
  appStore.updateAddTaskOptions(options)

  if (silent) {
    addTaskSilent(type)
    return
  }

  appStore.showAddTaskDialog(type)
}

const addTaskSilent = async (type) => {
  try {
    await addTaskByType(type)
  } catch (err) {
    Message.error(i18n.t(err.message))
  } finally {
    const appStore = useAppStore()
    appStore.resetAddTaskOptions()
  }
}

const addTaskByType = async (type) => {
  const appStore = useAppStore()
  const preferenceStore = usePreferenceStore()
  const taskStore = useTaskStore()

  // Build a state-like object for initTaskForm compatibility
  const form = initTaskForm({
    app: {
      addTaskUrl: appStore.addTaskUrl,
      addTaskTorrents: appStore.addTaskTorrents,
      addTaskOptions: appStore.addTaskOptions
    },
    preference: {
      config: preferenceStore.config
    }
  })

  let payload = null
  if (type === ADD_TASK_TYPE.URI) {
    const config = preferenceStore.config || {}
    const autoCategorizeFiles = config.autoCategorizeFiles || false
    const fileCategories = config.fileCategories || null

    payload = await buildUriPayload(form, autoCategorizeFiles, fileCategories)
    taskStore.addUri(payload).catch(err => {
      Message.error(err.message)
    })
  } else if (type === ADD_TASK_TYPE.TORRENT) {
    payload = buildTorrentPayload(form)
    taskStore.addTorrent(payload).catch(err => {
      Message.error(err.message)
    })
  } else if (type === 'metalink') {
  // @TODO addMetalink
  } else {
    console.error('addTask fail', form)
  }
}

const showAddBtTask = () => {
  const appStore = useAppStore()
  appStore.showAddTaskDialog(ADD_TASK_TYPE.TORRENT)
}

const showAddBtTaskWithFile = (payload = {}) => {
  const { name, dataURL = '' } = payload
  if (!dataURL) {
    return
  }

  const appStore = useAppStore()

  // 将 base64 字符串解码为 Blob（替代已移除的 blob-util 依赖）
  const byteString = atob(dataURL)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: 'application/x-bittorrent' })
  const file = new File([blob], name, { type: 'application/x-bittorrent' })
  const fileList = buildFileList(file)

  appStore.showAddTaskDialog(ADD_TASK_TYPE.TORRENT)
  setTimeout(() => {
    appStore.addTaskAddTorrents({ fileList })
  }, 200)
}

const navigateTaskList = (payload = {}) => {
  const { status = 'all' } = payload

  router.push({ path: `/task/${status}` }).catch(err => {
    console.log(err)
  })
}

const navigatePreferences = () => {
  ipcRenderer.send('open-preference-window')
}

const openPreferenceCategory = (payload = {}) => {
  const { category = 'advanced' } = payload || {}
  const hash = typeof window !== 'undefined' && window.location && window.location.hash
    ? `${window.location.hash}`
    : ''
  const base = hash.startsWith('#/preference-window') ? '/preference-window' : '/preference'
  router.push({ path: `${base}/${category}` }).catch(err => {
    console.log(err)
  })
}

const showUnderDevelopmentMessage = () => {
  Message.info(i18n.t('app.under-development-message'))
}

const pauseTask = () => {
  const taskStore = useTaskStore()
  taskStore.batchPauseSelectedTasks()
}

const resumeTask = () => {
  const taskStore = useTaskStore()
  taskStore.batchResumeSelectedTasks()
}

const deleteTask = () => {
  commands.emit('batch-delete-task', {
    deleteWithFiles: false
  })
}

const moveTaskUp = () => {
  showUnderDevelopmentMessage()
}

const moveTaskDown = () => {
  showUnderDevelopmentMessage()
}

const pauseAllTask = () => {
  const taskStore = useTaskStore()
  taskStore.pauseAllTask()
}

const resumeAllTask = () => {
  const taskStore = useTaskStore()
  taskStore.resumeAllTask()
}

const selectAllTask = () => {
  const taskStore = useTaskStore()
  taskStore.selectAllTask()
}

const showTaskDetail = (payload = {}) => {
  const { gid } = payload
  navigateTaskList()
  if (gid) {
    const taskStore = useTaskStore()
    taskStore.showTaskDetailByGid(gid)
  }
}

const fetchPreference = () => {
  const preferenceStore = usePreferenceStore()
  preferenceStore.fetchPreference()
}

const handleTaskProgressControl = (payload = {}) => {
  commands.emit('task-progress:control', payload)
}

const updateEngineList = (payload = {}) => {
  const appStore = useAppStore()
  appStore.updateEngineList(payload)
}

commands.register('application:task-list', navigateTaskList)
commands.register('application:preferences', navigatePreferences)
commands.register('application:open-preference-category', openPreferenceCategory)

commands.register('application:new-task', addTask)
commands.register('application:new-bt-task', showAddBtTask)
commands.register('application:new-bt-task-with-file', showAddBtTaskWithFile)
commands.register('application:pause-task', pauseTask)
commands.register('application:resume-task', resumeTask)
commands.register('application:delete-task', deleteTask)
commands.register('application:move-task-up', moveTaskUp)
commands.register('application:move-task-down', moveTaskDown)
commands.register('application:pause-all-task', pauseAllTask)
commands.register('application:resume-all-task', resumeAllTask)
commands.register('application:select-all-task', selectAllTask)
commands.register('application:show-task-detail', showTaskDetail)

commands.register('application:update-preference-config', fetchPreference)
commands.register('preference:update-from-extension', fetchPreference)
commands.register('application:update-system-theme', updateSystemTheme)
commands.register('application:update-theme', updateTheme)
commands.register('application:update-locale', updateLocale)
commands.register('application:update-tray-focused', updateTrayFocused)
commands.register('task-progress:control', handleTaskProgressControl)
commands.register('engine-list', updateEngineList)
