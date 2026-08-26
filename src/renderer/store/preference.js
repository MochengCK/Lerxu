import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import { isEmpty } from 'lodash'
import { ipcRenderer } from 'electron'

import api from '@/api'
import {
  getLangDirection,
  pushItemToFixedLengthArray,
  removeArrayItem
} from '@shared/utils'
import { MAX_NUM_OF_DIRECTORIES } from '@shared/constants'
import { useTaskStore } from './task'

export const usePreferenceStore = defineStore('preference', () => {
  // State
  const engineMode = ref('MAX')
  const config = shallowRef({})
  const updateAvailable = ref(false)
  const newVersion = ref('')
  const updateIsPrerelease = ref(false)
  const lastCheckUpdateTime = ref(0)
  const isDownloadingUpdate = ref(false)
  const isInstallingUpdate = ref(false)
  const updateDownloaded = ref(false)
  const downloadProgress = ref(0)
  const downloadTotal = ref(0)
  const downloadTransferred = ref(0)
  const releaseNotes = ref('')
  const searchKeyword = ref('')

  // Getters
  const theme = computed(() => config.value.theme)
  const locale = computed(() => config.value.locale)
  const direction = computed(() => getLangDirection(config.value.locale))
  const searchKeywordGetter = computed(() => searchKeyword.value)

  // Actions
  function updateSearchKeyword (keyword) {
    searchKeyword.value = keyword
  }

  function updatePreferenceData (newConfig) {
    const next = { ...config.value }
    Object.keys(newConfig).forEach(key => {
      const value = newConfig[key]
      if (value === undefined) {
        delete next[key]
      } else {
        next[key] = value
      }
    })
    config.value = next
  }

  function updateUpdateAvailable (val) {
    updateAvailable.value = val
  }

  function updateNewVersion (val) {
    newVersion.value = val
  }

  function updateUpdateIsPrerelease (isPrerelease) {
    updateIsPrerelease.value = !!isPrerelease
  }

  function updateLastCheckUpdateTime (val) {
    lastCheckUpdateTime.value = val
  }

  function updateIsDownloadingUpdate (val) {
    isDownloadingUpdate.value = val
  }

  function updateIsInstallingUpdate (val) {
    isInstallingUpdate.value = val
  }

  function updateUpdateDownloaded (downloaded) {
    updateDownloaded.value = downloaded
  }

  function updateDownloadProgress (val) {
    downloadProgress.value = val
  }

  function updateDownloadSize ({ total, transferred }) {
    downloadTotal.value = total
    downloadTransferred.value = transferred
  }

  function updateReleaseNotes (notes) {
    releaseNotes.value = notes
  }

  function fetchPreference () {
    return new Promise((resolve) => {
      api.fetchPreference()
        .then((cfg) => {
          updatePreference(cfg)
          resolve(cfg)
        })
    })
  }

  function save (cfg) {
    if (isEmpty(cfg)) {
      // 无变更也返回 Promise，保证调用方 .then() 链路稳定
      return Promise.resolve()
    }

    // 防御性过滤：移除值为 undefined 的键，避免 diffConfig 产生的
    // undefined 值意外删除用户配置（如 theme 被置为 undefined 后
    // updatePreferenceData 会从 config 中删除 theme，导致主题回退到浅色）
    const filteredCfg = {}
    let hasValidKeys = false
    Object.keys(cfg).forEach(key => {
      if (cfg[key] !== undefined) {
        filteredCfg[key] = cfg[key]
        hasValidKeys = true
      }
    })
    if (!hasValidKeys) {
      return Promise.resolve()
    }

    const taskStore = useTaskStore()
    taskStore.saveSession()
    updatePreference(filteredCfg)
    // api.savePreference 内部是 ipcRenderer.send（fire-and-forget）返回 undefined，
    // 这里统一包装成 Promise，避免调用方 .then() 崩溃
    return Promise.resolve(api.savePreference(filteredCfg))
  }

  function recordHistoryDirectory (directory) {
    const { historyDirectories = [], favoriteDirectories = [] } = config.value
    const all = new Set([...historyDirectories, ...favoriteDirectories])
    if (all.has(directory)) {
      return
    }
    addHistoryDirectory(directory)
  }

  function addHistoryDirectory (directory) {
    const { historyDirectories = [] } = config.value
    const history = pushItemToFixedLengthArray(
      historyDirectories,
      MAX_NUM_OF_DIRECTORIES,
      directory
    )
    save({ historyDirectories: history })
  }

  function favoriteDirectory (directory) {
    const { historyDirectories = [], favoriteDirectories = [] } = config.value
    if (favoriteDirectories.includes(directory) ||
      favoriteDirectories.length >= MAX_NUM_OF_DIRECTORIES
    ) {
      return
    }
    const favorite = pushItemToFixedLengthArray(
      favoriteDirectories,
      MAX_NUM_OF_DIRECTORIES,
      directory
    )
    const history = removeArrayItem(historyDirectories, directory)
    save({
      historyDirectories: history,
      favoriteDirectories: favorite
    })
  }

  function cancelFavoriteDirectory (directory) {
    const { historyDirectories = [], favoriteDirectories = [] } = config.value
    if (historyDirectories.includes(directory)) {
      return
    }
    const favorite = removeArrayItem(favoriteDirectories, directory)
    const history = pushItemToFixedLengthArray(
      historyDirectories,
      MAX_NUM_OF_DIRECTORIES,
      directory
    )
    save({
      historyDirectories: history,
      favoriteDirectories: favorite
    })
  }

  function removeDirectory (directory) {
    const { historyDirectories = [], favoriteDirectories = [] } = config.value
    const favorite = removeArrayItem(favoriteDirectories, directory)
    const history = removeArrayItem(historyDirectories, directory)
    save({
      historyDirectories: history,
      favoriteDirectories: favorite
    })
  }

  function updateAppTheme (theme) {
    updatePreference({ theme })
  }

  function updateAppLocale (locale) {
    updatePreference({ locale })
  }

  function updatePreference (cfg) {
    updatePreferenceData(cfg)
  }

  function fetchBtTracker (trackerSource = []) {
    const cfg = config.value || {}
    const { proxy = {} } = cfg
    const githubMirrorUrls = cfg.githubMirrorUrls || cfg['github-mirror-urls'] || []
    const useGithubMirror = cfg.useGithubMirror !== undefined
      ? !!cfg.useGithubMirror
      : githubMirrorUrls.length > 0
    // 深拷贝去除 Vue 响应式 Proxy 包装，IPC 序列化要求纯原生对象
    const plainParams = JSON.parse(JSON.stringify({
      source: trackerSource,
      proxy,
      useGithubMirror,
      githubMirrorUrls
    }))
    // 走主进程发起请求，使 axios proxy 配置（renderer XHR 下不生效）真正可用
    return ipcRenderer.invoke('bt-tracker:fetch', plainParams)
  }

  function fetchEd2kServers (ed2kServerSource = []) {
    const cfg = config.value || {}
    const { proxy = {} } = cfg
    // 深拷贝去除 Vue 响应式 Proxy 包装，IPC 序列化要求纯原生对象
    const plainParams = JSON.parse(JSON.stringify({
      source: ed2kServerSource,
      proxy
    }))
    return ipcRenderer.invoke('ed2k:fetch-servers', plainParams)
  }

  function toggleEngineMode () {
    // placeholder
  }

  return {
    // State
    engineMode,
    config,
    updateAvailable,
    newVersion,
    updateIsPrerelease,
    lastCheckUpdateTime,
    isDownloadingUpdate,
    isInstallingUpdate,
    updateDownloaded,
    downloadProgress,
    downloadTotal,
    downloadTransferred,
    releaseNotes,
    searchKeyword,
    // Getters
    theme,
    locale,
    direction,
    searchKeywordGetter,
    // Actions
    updateSearchKeyword,
    updatePreferenceData,
    updateUpdateAvailable,
    updateNewVersion,
    updateUpdateIsPrerelease,
    updateLastCheckUpdateTime,
    updateIsDownloadingUpdate,
    updateIsInstallingUpdate,
    updateUpdateDownloaded,
    updateDownloadProgress,
    updateDownloadSize,
    updateReleaseNotes,
    fetchPreference,
    save,
    recordHistoryDirectory,
    addHistoryDirectory,
    favoriteDirectory,
    cancelFavoriteDirectory,
    removeDirectory,
    updateAppTheme,
    updateAppLocale,
    updatePreference,
    fetchBtTracker,
    fetchEd2kServers,
    toggleEngineMode
  }
})
