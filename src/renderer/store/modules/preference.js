import { isEmpty } from 'lodash'

import api from '@/api'
import {
  getLangDirection,
  pushItemToFixedLengthArray,
  removeArrayItem
} from '@shared/utils'
import { fetchBtTrackerFromSource } from '@shared/utils/tracker'
import { MAX_NUM_OF_DIRECTORIES } from '@shared/constants'

const state = {
  engineMode: 'MAX',
  config: {},
  // 版本更新状态持久化存储
  updateAvailable: false,
  newVersion: '',
  lastCheckUpdateTime: 0,
  isDownloadingUpdate: false,
  updateDownloaded: false,
  downloadProgress: 0,
  downloadTotal: 0,
  downloadTransferred: 0,
  releaseNotes: '',
  searchKeyword: ''
}

const getters = {
  theme: state => state.config.theme,
  locale: state => state.config.locale,
  direction: state => getLangDirection(state.config.locale),
  searchKeyword: state => state.searchKeyword
}

const mutations = {
  UPDATE_SEARCH_KEYWORD (state, keyword) {
    state.searchKeyword = keyword
  },
  UPDATE_PREFERENCE_DATA (state, config) {
    // 创建新的配置对象
    const newConfig = { ...state.config }

    // 处理config中的每个属性
    Object.keys(config).forEach(key => {
      const value = config[key]

      if (value === undefined) {
        // 如果值为undefined，表示该属性应该被删除
        delete newConfig[key]
      } else {
        // 否则更新属性值
        newConfig[key] = value
      }
    })

    state.config = newConfig
  },
  UPDATE_UPDATE_AVAILABLE (state, updateAvailable) {
    state.updateAvailable = updateAvailable
  },
  UPDATE_NEW_VERSION (state, newVersion) {
    state.newVersion = newVersion
  },
  UPDATE_LAST_CHECK_UPDATE_TIME (state, lastCheckUpdateTime) {
    state.lastCheckUpdateTime = lastCheckUpdateTime
  },
  UPDATE_IS_DOWNLOADING_UPDATE (state, isDownloadingUpdate) {
    state.isDownloadingUpdate = isDownloadingUpdate
  },
  UPDATE_UPDATE_DOWNLOADED (state, downloaded) {
    state.updateDownloaded = downloaded
  },
  UPDATE_DOWNLOAD_PROGRESS (state, downloadProgress) {
    state.downloadProgress = downloadProgress
  },
  UPDATE_DOWNLOAD_SIZE (state, { total, transferred }) {
    state.downloadTotal = total
    state.downloadTransferred = transferred
  },
  UPDATE_RELEASE_NOTES (state, releaseNotes) {
    state.releaseNotes = releaseNotes
  }
}

const actions = {
  updateSearchKeyword ({ commit }, keyword) {
    commit('UPDATE_SEARCH_KEYWORD', keyword)
  },
  fetchPreference ({ dispatch }) {
    return new Promise((resolve) => {
      api.fetchPreference()
        .then((config) => {
          dispatch('updatePreference', config)
          resolve(config)
        })
    })
  },
  save ({ dispatch }, config) {
    dispatch('task/saveSession', null, { root: true })
    if (isEmpty(config)) {
      return
    }

    dispatch('updatePreference', config)
    return api.savePreference(config)
  },
  recordHistoryDirectory ({ state, dispatch }, directory) {
    const { historyDirectories = [], favoriteDirectories = [] } = state.config
    const all = new Set([...historyDirectories, ...favoriteDirectories])
    if (all.has(directory)) {
      return
    }

    dispatch('addHistoryDirectory', directory)
  },
  addHistoryDirectory ({ state, dispatch }, directory) {
    const { historyDirectories = [] } = state.config
    const history = pushItemToFixedLengthArray(
      historyDirectories,
      MAX_NUM_OF_DIRECTORIES,
      directory
    )

    dispatch('save', { historyDirectories: history })
  },
  favoriteDirectory ({ state, dispatch }, directory) {
    const { historyDirectories = [], favoriteDirectories = [] } = state.config
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

    dispatch('save', {
      historyDirectories: history,
      favoriteDirectories: favorite
    })
  },
  cancelFavoriteDirectory ({ state, dispatch }, directory) {
    const { historyDirectories = [], favoriteDirectories = [] } = state.config
    if (historyDirectories.includes(directory)) {
      return
    }

    const favorite = removeArrayItem(favoriteDirectories, directory)

    const history = pushItemToFixedLengthArray(
      historyDirectories,
      MAX_NUM_OF_DIRECTORIES,
      directory
    )

    dispatch('save', {
      historyDirectories: history,
      favoriteDirectories: favorite
    })
  },
  removeDirectory ({ state, dispatch }, directory) {
    const { historyDirectories = [], favoriteDirectories = [] } = state.config

    const favorite = removeArrayItem(favoriteDirectories, directory)
    const history = removeArrayItem(historyDirectories, directory)

    dispatch('save', {
      historyDirectories: history,
      favoriteDirectories: favorite
    })
  },
  updateAppTheme ({ dispatch }, theme) {
    dispatch('updatePreference', { theme })
  },
  updateAppLocale ({ dispatch }, locale) {
    dispatch('updatePreference', { locale })
  },
  updatePreference  ({ commit }, config) {
    commit('UPDATE_PREFERENCE_DATA', config)
  },
  updateUpdateAvailable ({ commit }, updateAvailable) {
    commit('UPDATE_UPDATE_AVAILABLE', updateAvailable)
  },
  updateNewVersion ({ commit }, newVersion) {
    commit('UPDATE_NEW_VERSION', newVersion)
  },
  updateLastCheckUpdateTime ({ commit }, lastCheckUpdateTime) {
    commit('UPDATE_LAST_CHECK_UPDATE_TIME', lastCheckUpdateTime)
  },
  updateIsDownloadingUpdate ({ commit }, isDownloadingUpdate) {
    commit('UPDATE_IS_DOWNLOADING_UPDATE', isDownloadingUpdate)
  },
  updateUpdateDownloaded ({ commit }, downloaded) {
    commit('UPDATE_UPDATE_DOWNLOADED', downloaded)
  },
  updateDownloadProgress ({ commit }, downloadProgress) {
    commit('UPDATE_DOWNLOAD_PROGRESS', downloadProgress)
  },
  updateDownloadSize ({ commit }, { total, transferred }) {
    commit('UPDATE_DOWNLOAD_SIZE', { total, transferred })
  },
  updateReleaseNotes ({ commit }, releaseNotes) {
    commit('UPDATE_RELEASE_NOTES', releaseNotes)
  },
  fetchBtTracker (_, trackerSource = []) {
    const { proxy = { enable: false } } = state.config
    // 与 task.js 的 addUri 保持一致的 useGithubMirror 推断逻辑：
    // 若用户显式设置则尊重，否则由镜像列表非空推断。
    const githubMirrorUrls = state.config.githubMirrorUrls || state.config['github-mirror-urls'] || []
    const useGithubMirror = state.config.useGithubMirror !== undefined
      ? !!state.config.useGithubMirror
      : githubMirrorUrls.length > 0
    return fetchBtTrackerFromSource(trackerSource, proxy, { useGithubMirror, githubMirrorUrls })
  },
  toggleEngineMode () {

  }
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions
}
