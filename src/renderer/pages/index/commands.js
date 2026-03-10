import { Message } from 'element-ui'
import { base64StringToBlob } from 'blob-util'
import { ipcRenderer } from 'electron'

import router from '@/router'
import store from '@/store'
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
  store.dispatch('app/updateSystemTheme', theme)
}

const updateTheme = (payload = {}) => {
  const { theme } = payload
  store.dispatch('preference/updateAppTheme', theme)
}

const updateLocale = (payload = {}) => {
  const { locale } = payload
  store.dispatch('preference/updateAppLocale', locale)
}

const updateTrayFocused = (payload = {}) => {
  const { focused } = payload
  store.dispatch('app/updateTrayFocused', focused)
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

  if (type === ADD_TASK_TYPE.URI && uri) {
    store.dispatch('app/updateAddTaskUrl', uri)
  }
  store.dispatch('app/updateAddTaskOptions', options)

  if (silent) {
    addTaskSilent(type)
    return
  }

  store.dispatch('app/showAddTaskDialog', type)
}

const addTaskSilent = async (type) => {
  try {
    await addTaskByType(type)
  } catch (err) {
    Message.error(i18n.t(err.message))
  }
}

const addTaskByType = async (type) => {
  const form = initTaskForm(store.state)

  let payload = null
  if (type === ADD_TASK_TYPE.URI) {
    const config = store.state.preference.config || {}
    const autoCategorizeFiles = config.autoCategorizeFiles || false
    const fileCategories = config.fileCategories || null

    payload = await buildUriPayload(form, autoCategorizeFiles, fileCategories)
    store.dispatch('task/addUri', payload).catch(err => {
      Message.error(err.message)
    })
  } else if (type === ADD_TASK_TYPE.TORRENT) {
    payload = buildTorrentPayload(form)
    store.dispatch('task/addTorrent', payload).catch(err => {
      Message.error(err.message)
    })
  } else if (type === 'metalink') {
  // @TODO addMetalink
  } else {
    console.error('addTask fail', form)
  }
}

const showAddBtTask = () => {
  store.dispatch('app/showAddTaskDialog', ADD_TASK_TYPE.TORRENT)
}

const showAddBtTaskWithFile = (payload = {}) => {
  const { name, dataURL = '' } = payload
  if (!dataURL) {
    return
  }

  const blob = base64StringToBlob(dataURL, 'application/x-bittorrent')
  const file = new File([blob], name, { type: 'application/x-bittorrent' })
  const fileList = buildFileList(file)

  store.dispatch('app/showAddTaskDialog', ADD_TASK_TYPE.TORRENT)
  setTimeout(() => {
    store.dispatch('app/addTaskAddTorrents', { fileList })
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
  store.dispatch('task/batchPauseSelectedTasks')
}

const resumeTask = () => {
  store.dispatch('task/batchResumeSelectedTasks')
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
  store.dispatch('task/pauseAllTask')
}

const resumeAllTask = () => {
  store.dispatch('task/resumeAllTask')
}

const selectAllTask = () => {
  store.dispatch('task/selectAllTask')
}

const showTaskDetail = (payload = {}) => {
  const { gid } = payload
  navigateTaskList()
  if (gid) {
    store.dispatch('task/showTaskDetailByGid', gid)
  }
}

const fetchPreference = () => {
  store.dispatch('preference/fetchPreference')
}

const handleTaskProgressControl = (payload = {}) => {
  commands.emit('task-progress:control', payload)
}

const updateEngineList = (payload = {}) => {
  store.commit('app/UPDATE_ENGINE_LIST', payload)
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
