<template>
  <!-- ElConfigProvider 渲染 fragment（无根 DOM 节点），不能传 class/样式 -->
  <el-config-provider :size="'small'">
    <div
      id="app"
      :style="appRootStyle"
      :class="{ 'has-custom-titlebar': showWindowActions, 'show-window-actions': showWindowActions, 'is-preference-window': isPreferenceWindow, 'is-task-detail-open': taskDetailVisible, 'is-add-task-open': addTaskVisible, 'is-task-plan-open': taskPlanVisible, 'is-mac': isMac }"
    >
      <div
        v-if="shouldUseBackgroundImage"
        class="app-background-layer"
        :style="backgroundLayerStyle"
      />
      <mo-title-bar
        v-if="isRenderer"
        :showActions="showWindowActions"
        :titleText="titleBarText"
      />
      <div class="app-content">
        <router-view />
        <mo-engine-client
          v-if="!isPreferenceWindow"
          :secret="rpcSecret"
        />
        <mo-ipc v-if="isRenderer && !isPreferenceWindow" />
        <mo-dynamic-tray v-if="enableTraySpeedometer && !isPreferenceWindow" />
        <mo-dynamic-dock v-if="isMac && isRenderer && !isPreferenceWindow" />
      </div>
    </div>
  </el-config-provider>
</template>
<script setup>
import { ref, computed, watch, onBeforeMount, onMounted, onUnmounted, getCurrentInstance } from 'vue'
import is from 'electron-is'
import { pathToFileURL } from 'node:url'
import { getCurrentWindow } from '@electron/remote'
import { ipcRenderer } from 'electron'
import { ElConfigProvider, ElMessage } from 'element-plus'
import { APP_RUN_MODE } from '@shared/constants'
import themeTokens from '@/utils/themeTokens'
// Native components (mo-title-bar, mo-engine-client, mo-ipc, mo-dynamic-tray)
// are globally registered in main.js
import { getLanguage } from '@shared/locales'
import { getLocaleManager } from '@/components/Locale'
import i18n from '@/plugins/i18n'
import { createMsg } from '@/components/Msg'
import { useAppStore } from '@/store/app'
import { usePreferenceStore } from '@/store/preference'
import { useTaskStore } from '@/store/task'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })
const route = useRoute()
const router = useRouter()
const instance = getCurrentInstance()

const appStore = useAppStore()
const preferenceStore = usePreferenceStore()
const taskStore = useTaskStore()

const { systemTheme, addTaskVisible, titleBarText, taskPlanVisible } = storeToRefs(appStore)
const { taskDetailVisible } = storeToRefs(taskStore)
const { config: preferenceConfig, theme, locale, direction } = storeToRefs(preferenceStore)

const UI_FROSTED_BLUR_SCOPES = [
  'date-filter', 'task-category-select', 'task-item',
  'preference-card', 'aside', 'subnav'
]
const UI_OPACITY_SCOPES = [
  'date-filter', 'task-category-select', 'task-item',
  'preference-card', 'aside', 'subnav'
]

// --- Data ---
const downloadMsgInstance = ref(null)
const isMounted = ref(false)
let _updateMessageShown = false
let _downloadStartNotified = false
let _handleWindowResize = null
let _preferenceCommandHandler = null
let _updateHandlers = {}

// --- Computed ---
const isMac = computed(() => is.macOS())
const isRenderer = computed(() => is.renderer())

const isPreferenceWindow = computed(() => {
  const path = `${route.path || ''}`
  const hashPath = typeof window !== 'undefined' && window.location && window.location.hash
    ? `${window.location.hash}`
    : ''
  return path.startsWith('/preference-window') || hashPath.startsWith('#/preference-window')
})

const isTaskPage = computed(() => {
  const path = `${route.path || ''}`
  const hashPath = typeof window !== 'undefined' && window.location && window.location.hash
    ? `${window.location.hash}`
    : ''
  const hashRoute = hashPath.startsWith('#') ? hashPath.slice(1) : hashPath
  const targetPath = path || hashRoute
  return targetPath.startsWith('/task')
})

const showWindowActions = computed(() => (is.windows() || is.linux()) && preferenceConfig.value.hideAppMenu)
const runMode = computed(() => preferenceConfig.value.runMode)
const traySpeedometer = computed(() => preferenceConfig.value.traySpeedometer)
const rpcSecret = computed(() => preferenceConfig.value.rpcSecret)
const backgroundType = computed(() => preferenceConfig.value.backgroundType)
const backgroundImage = computed(() => preferenceConfig.value.backgroundImage)
const backgroundImageOpacity = computed(() => preferenceConfig.value.backgroundImageOpacity)
const backgroundImageFrostedBlur = computed(() => preferenceConfig.value.backgroundImageFrostedBlur)
const backgroundUiOpacity = computed(() => preferenceConfig.value.backgroundUiOpacity)
const backgroundUiOpacityScope = computed(() => preferenceConfig.value.backgroundUiOpacityScope)
const backgroundUiFrostedBlur = computed(() => preferenceConfig.value.backgroundUiFrostedBlur)
const backgroundUiFrostedBlurScope = computed(() => preferenceConfig.value.backgroundUiFrostedBlurScope)
const macNativeTransparent = computed(() => preferenceConfig.value.macNativeTransparent)
const taskDetailDefaultTransparent = computed(() => preferenceConfig.value.taskDetailDefaultTransparent)
const taskDetailFrostedBlur = computed(() => preferenceConfig.value.taskDetailFrostedBlur)
const dateFilterFrosted = computed(() => preferenceConfig.value.dateFilterFrosted)
const dateFilterFrostedBlur = computed(() => preferenceConfig.value.dateFilterFrostedBlur)

const themeClass = computed(() => `theme-${themeTokens.resolveTheme(theme.value, systemTheme.value)}`)
const i18nClass = computed(() => `i18n-${locale.value}`)
const directionClass = computed(() => `dir-${direction.value}`)
const backgroundClass = computed(() => {
  const type = `${backgroundType.value || ''}`.trim()
  const img = `${backgroundImage.value || ''}`.trim()
  return type === 'image' && img ? 'has-app-background-image' : ''
})

const nativeTransparentClass = computed(() => {
  const enabled = macNativeTransparent.value === undefined ? false : !!macNativeTransparent.value
  if (!isMac.value || !enabled) return ''
  if (isPreferenceWindow.value && !isMounted.value) return ''
  return 'mac-native-transparent'
})

const taskDetailTransparentClass = computed(() => {
  const enabled = taskDetailDefaultTransparent.value === undefined ? false : !!taskDetailDefaultTransparent.value
  return enabled ? 'task-detail-default-transparent' : ''
})

const layoutClass = computed(() => 'has-three-column-layout')

const backgroundImageUrl = computed(() => {
  const p = `${backgroundImage.value || ''}`.trim()
  if (!p) return ''
  if (/^(https?:|file:|data:)/i.test(p)) return p
  try { return pathToFileURL(p).toString() } catch (e) { return p }
})

const shouldUseBackgroundImage = computed(() => backgroundType.value === 'image' && !!backgroundImageUrl.value)

const uiOpacity = computed(() => {
  if (!shouldUseBackgroundImage.value) return 1
  const raw = Number(backgroundUiOpacity.value)
  const normalized = Number.isFinite(raw) ? raw : 0.7
  return Math.min(Math.max(normalized, 0.4), 1)
})

const uiFrostedBlur = computed(() => {
  if (!shouldUseBackgroundImage.value) return 0
  const raw = Number(backgroundUiFrostedBlur.value)
  const normalized = Number.isFinite(raw) ? raw : 6
  return Math.min(Math.max(normalized, 0), 10)
})

const backgroundImageCssValue = computed(() => {
  if (!shouldUseBackgroundImage.value) return 'none'
  const url = backgroundImageUrl.value
  if (!url) return 'none'
  return `url("${url}")`
})

function getUiOpacityForScope (scope) {
  if (scope === 'date-filter' && dateFilterFrosted.value) {
    if (shouldUseBackgroundImage.value) {
      const scopes = Array.isArray(backgroundUiOpacityScope.value) ? backgroundUiOpacityScope.value : null
      if (!scopes || scopes.includes(scope)) return uiOpacity.value
      return 0.8
    }
    return 0.8
  }
  if (!shouldUseBackgroundImage.value) return 1
  const scopes = Array.isArray(backgroundUiOpacityScope.value) ? backgroundUiOpacityScope.value : null
  if (!scopes) return uiOpacity.value
  return scopes.includes(scope) ? uiOpacity.value : 1
}

function getUiFrostedBlurForScope (scope) {
  if (scope === 'date-filter' && dateFilterFrosted.value) {
    const raw = Number(dateFilterFrostedBlur.value)
    const val = Number.isFinite(raw) ? raw : 6
    return Math.min(Math.max(val, 0), 10)
  }
  if (!shouldUseBackgroundImage.value) return 0
  const scopes = Array.isArray(backgroundUiFrostedBlurScope.value) ? backgroundUiFrostedBlurScope.value : null
  if (!scopes) return uiFrostedBlur.value
  return scopes.includes(scope) ? uiFrostedBlur.value : 0
}

const appRootStyle = computed(() => {
  const blurRaw = Number(taskDetailFrostedBlur.value)
  const blur = Number.isFinite(blurRaw) ? Math.min(Math.max(blurRaw, 0), 10) : 0
  const alpha = blur <= 0 ? 0 : Math.min(Math.max((blur / 10) * 0.16, 0), 0.16)
  const bgBlurRaw = Number(backgroundImageFrostedBlur.value)
  const bgBlur = Number.isFinite(bgBlurRaw) ? Math.min(Math.max(bgBlurRaw, 0), 10) : 0
  const scopeVars = {}
  UI_FROSTED_BLUR_SCOPES.forEach(scope => {
    scopeVars[`--app-ui-frosted-blur-${scope}`] = `${getUiFrostedBlurForScope(scope)}px`
  })
  UI_OPACITY_SCOPES.forEach(scope => {
    scopeVars[`--app-ui-opacity-${scope}`] = `${getUiOpacityForScope(scope)}`
  })
  return {
    '--app-ui-opacity': `${uiOpacity.value}`,
    '--app-ui-frosted-blur': `${uiFrostedBlur.value}px`,
    '--app-background-image': `${backgroundImageCssValue.value}`,
    '--task-detail-frosted-blur': `${blur}px`,
    '--task-detail-frosted-alpha': `${alpha}`,
    '--background-image-frosted-blur': `${bgBlur}px`,
    ...scopeVars
  }
})

const backgroundLayerStyle = computed(() => {
  const opacityRaw = Number(backgroundImageOpacity.value)
  const opacity = Number.isFinite(opacityRaw) ? Math.min(Math.max(opacityRaw, 0.3), 1) : 0.4
  const url = backgroundImageUrl.value
  if (!url) return {}
  const blurRaw = Number(backgroundImageFrostedBlur.value)
  const blur = Number.isFinite(blurRaw) ? Math.min(Math.max(blurRaw, 0), 10) : 0
  return {
    opacity,
    backgroundImage: `url("${url}")`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center center',
    filter: blur > 0 ? `blur(${blur}px)` : 'none'
  }
})

const enableTraySpeedometer = computed(() => {
  return isMac.value && isRenderer.value && traySpeedometer.value && runMode.value !== APP_RUN_MODE.HIDE_TRAY
})

// --- Methods ---
function updateWindowTitle () {
  if (!isPreferenceWindow.value) return
  if (typeof document === 'undefined') return
  document.title = t('subnav.preferences')
}

function handlePreferenceCommand (command, ...args) {
  if (!isPreferenceWindow.value) return
  if (command === 'application:update-system-theme') {
    const data = args[0]
    if (data && data.theme) {
      appStore.updateSystemTheme(data.theme)
    }
    return
  }
  if (command === 'application:update-theme') {
    const data = args[0]
    if (data && data.theme) {
      preferenceStore.updateAppTheme(data.theme)
    }
    return
  }
  if (command === 'application:open-preference-category') {
    const data = args[0]
    if (data && data.category) {
      router.push({ path: `/preference-window/${data.category}` }).catch(err => {
        console.log(err)
      })
    }
  }
}

function bringMainWindowToFront () {
  try {
    const win = getCurrentWindow && getCurrentWindow()
    if (win) {
      if (win.isMinimized && win.isMinimized()) win.restore()
      if (win.show) win.show()
      if (win.focus) win.focus()
      if (win.moveTop) win.moveTop()
    }
  } catch (e) {}
  try {
    ipcRenderer.send('command', 'application:bring-to-front', { page: 'index' })
    return true
  } catch (e) {}
  return false
}

function updateRootClassName () {
  const className = `${themeClass.value} ${i18nClass.value} ${directionClass.value} ${backgroundClass.value} ${nativeTransparentClass.value} ${taskDetailTransparentClass.value} ${layoutClass.value}`.trim()
  document.documentElement.className = className
}

function updateRootCssVars () {
  const blurRaw = Number(taskDetailFrostedBlur.value)
  const blur = Number.isFinite(blurRaw) ? Math.min(Math.max(blurRaw, 0), 10) : 0
  const alpha = blur <= 0 ? 0 : Math.min(Math.max((blur / 10) * 0.16, 0), 0.16)
  const bgBlurRaw = Number(backgroundImageFrostedBlur.value)
  const bgBlur = Number.isFinite(bgBlurRaw) ? Math.min(Math.max(bgBlurRaw, 0), 10) : 0
  document.documentElement.style.setProperty('--app-ui-opacity', `${uiOpacity.value}`)
  document.documentElement.style.setProperty('--app-ui-frosted-blur', `${uiFrostedBlur.value}px`)
  document.documentElement.style.setProperty('--app-background-image', `${backgroundImageCssValue.value}`)
  document.documentElement.style.setProperty('--task-detail-frosted-blur', `${blur}px`)
  document.documentElement.style.setProperty('--task-detail-frosted-alpha', `${alpha}`)
  document.documentElement.style.setProperty('--background-image-frosted-blur', `${bgBlur}px`)
  UI_FROSTED_BLUR_SCOPES.forEach(scope => {
    document.documentElement.style.setProperty(`--app-ui-frosted-blur-${scope}`, `${getUiFrostedBlurForScope(scope)}px`)
  })
  UI_OPACITY_SCOPES.forEach(scope => {
    document.documentElement.style.setProperty(`--app-ui-opacity-${scope}`, `${getUiOpacityForScope(scope)}`)
  })
}

function handleWindowResize () {}

// --- Watchers ---
watch(locale, (val) => {
  const lng = getLanguage(val)
  getLocaleManager().changeLanguage(lng)
  // composition 模式下 locale 是 computed ref，需用 .value 赋值
  i18n.global.locale.value = lng
  updateWindowTitle()
})
watch(backgroundClass, () => updateRootClassName())
watch(nativeTransparentClass, () => updateRootClassName())
watch(themeClass, () => updateRootClassName())
watch(i18nClass, () => updateRootClassName())
watch(directionClass, () => updateRootClassName())
watch(taskDetailTransparentClass, () => updateRootClassName())
watch(layoutClass, () => updateRootClassName())
watch(taskDetailFrostedBlur, () => updateRootCssVars())
watch(backgroundImageFrostedBlur, () => updateRootCssVars())
watch(uiOpacity, () => updateRootCssVars())
watch(uiFrostedBlur, () => updateRootCssVars())
watch(backgroundUiOpacityScope, () => updateRootCssVars())
watch(backgroundUiFrostedBlurScope, () => updateRootCssVars())
watch(backgroundImageCssValue, () => updateRootCssVars())
watch(dateFilterFrosted, () => updateRootCssVars())
watch(dateFilterFrostedBlur, () => updateRootCssVars())

// --- Lifecycle ---
onBeforeMount(() => {
  updateRootClassName()
  updateRootCssVars()
})

onMounted(() => {
  _updateMessageShown = false
  isMounted.value = true
  updateRootClassName()
  updateWindowTitle()
  if (typeof window !== 'undefined') {
    handleWindowResize()
    _handleWindowResize = () => handleWindowResize()
    window.addEventListener('resize', _handleWindowResize)
  }
  if (isRenderer.value && isPreferenceWindow.value) {
    _preferenceCommandHandler = (event, command, ...args) => {
      handlePreferenceCommand(command, ...args)
    }
    ipcRenderer.on('command', _preferenceCommandHandler)
  }

  const onUpdateAvailable = (event, version, releaseNotes) => {
    const cfg = preferenceConfig.value || {}
    const autoCheckEnabled = cfg.autoCheckUpdate !== undefined ? !!cfg.autoCheckUpdate : !!cfg['auto-check-update']
    if (autoCheckEnabled) {
      preferenceStore.updateUpdateAvailable(true)
      preferenceStore.updateUpdateDownloaded(false)
      preferenceStore.updateNewVersion(version)
      preferenceStore.updateLastCheckUpdateTime(Date.now())
      preferenceStore.updateReleaseNotes(releaseNotes || '')

      const v = (version == null) ? '' : `${version}`.trim()
      if (v && typeof window !== 'undefined' && window.localStorage) {
        const key = 'lastNotifiedUpdateVersion'
        const last = `${window.localStorage.getItem(key) || ''}`.trim()
        if (last !== v && !_updateMessageShown) {
          _updateMessageShown = true
          msg.info({
            message: `${t('app.update-available-message')} ${v}`,
            duration: 10000,
            showClose: true,
            onClick: () => {
              ipcRenderer.send('open-preference-window', { category: 'advanced' })
            }
          })
          window.localStorage.setItem(key, v)
        }
      }
    }
  }
  const onUpdateNotAvailable = () => {
    const cfg = preferenceConfig.value || {}
    const autoCheckEnabled = cfg.autoCheckUpdate !== undefined ? !!cfg.autoCheckUpdate : !!cfg['auto-check-update']
    if (autoCheckEnabled) {
      preferenceStore.updateUpdateAvailable(false)
      preferenceStore.updateUpdateDownloaded(false)
      preferenceStore.updateNewVersion('')
      preferenceStore.updateLastCheckUpdateTime(Date.now())
    }
  }
  const onUpdateError = () => {}
  _downloadStartNotified = false
  const onDownloadStart = () => {
    preferenceStore.updateIsDownloadingUpdate(true)
    preferenceStore.updateUpdateDownloaded(false)
    preferenceStore.updateDownloadProgress(0)
    preferenceStore.updateDownloadSize({ total: 0, transferred: 0 })
  }
  const onDownloadProgress = (_event, progress) => {
    const percent = Math.round(progress.percent)
    preferenceStore.updateDownloadProgress(percent)
    preferenceStore.updateIsDownloadingUpdate(true)
    preferenceStore.updateDownloadSize({
      total: progress.total || 0,
      transferred: progress.transferred || 0
    })
    if (!isPreferenceWindow.value && percent > 0 && !_downloadStartNotified) {
      _downloadStartNotified = true
      downloadMsgInstance.value = msg({
        message: '正在下载更新...',
        type: 'info',
        duration: 0,
        showClose: true
      })
    }
  }
  const onDownloaded = () => {
    preferenceStore.updateIsDownloadingUpdate(false)
    preferenceStore.updateUpdateDownloaded(true)
    preferenceStore.updateUpdateAvailable(false)
  }
  const onInstallingUpdate = () => {
    preferenceStore.updateIsDownloadingUpdate(false)
    preferenceStore.updateIsInstallingUpdate(true)
    preferenceStore.updateDownloadProgress(100)
    preferenceStore.updateUpdateDownloaded(false)
    _downloadStartNotified = false
    if (downloadMsgInstance.value && typeof downloadMsgInstance.value.close === 'function') {
      try { downloadMsgInstance.value.close() } catch (e) {}
      downloadMsgInstance.value = null
    }
    if (!isPreferenceWindow.value) {
      msg.success('更新下载完成，准备重启到新版本...')
    }
  }
  const onDownloadError = (_event, errMsg) => {
    preferenceStore.updateIsDownloadingUpdate(false)
    preferenceStore.updateIsInstallingUpdate(false)
    preferenceStore.updateUpdateDownloaded(false)
    _downloadStartNotified = false
    if (downloadMsgInstance.value && typeof downloadMsgInstance.value.close === 'function') {
      try { downloadMsgInstance.value.close() } catch (e) {}
      downloadMsgInstance.value = null
    }
    if (!isPreferenceWindow.value) {
      msg.error(errMsg || t('app.update-error-message'))
    }
  }
  const onDownloadCancelled = () => {
    preferenceStore.updateIsDownloadingUpdate(false)
    preferenceStore.updateIsInstallingUpdate(false)
    preferenceStore.updateUpdateDownloaded(false)
    preferenceStore.updateDownloadProgress(0)
    preferenceStore.updateDownloadSize({ total: 0, transferred: 0 })
    _downloadStartNotified = false
    if (downloadMsgInstance.value && typeof downloadMsgInstance.value.close === 'function') {
      try { downloadMsgInstance.value.close() } catch (e) {}
      downloadMsgInstance.value = null
    }
  }
  ipcRenderer.on('update-available', onUpdateAvailable)
  ipcRenderer.on('update-not-available', onUpdateNotAvailable)
  ipcRenderer.on('update-error', onUpdateError)
  ipcRenderer.on('download-start', onDownloadStart)
  ipcRenderer.on('download-progress', onDownloadProgress)
  ipcRenderer.on('update-downloaded', onDownloaded)
  ipcRenderer.on('installing-update', onInstallingUpdate)
  ipcRenderer.on('update-cancelled', onDownloadCancelled)
  _updateHandlers = { onUpdateAvailable, onUpdateNotAvailable, onUpdateError, onDownloadStart, onDownloadProgress, onDownloaded, onInstallingUpdate, onDownloadError, onDownloadCancelled }
})

onUnmounted(() => {
  if (typeof window !== 'undefined' && _handleWindowResize) {
    window.removeEventListener('resize', _handleWindowResize)
    _handleWindowResize = null
  }
  if (_preferenceCommandHandler) {
    ipcRenderer.removeListener('command', _preferenceCommandHandler)
  }
  const h = _updateHandlers || {}
  if (h.onUpdateAvailable) ipcRenderer.removeListener('update-available', h.onUpdateAvailable)
  if (h.onUpdateNotAvailable) ipcRenderer.removeListener('update-not-available', h.onUpdateNotAvailable)
  if (h.onUpdateError) ipcRenderer.removeListener('update-error', h.onUpdateError)
  if (h.onDownloadStart) ipcRenderer.removeListener('download-start', h.onDownloadStart)
  if (h.onDownloadProgress) ipcRenderer.removeListener('download-progress', h.onDownloadProgress)
  if (h.onDownloaded) ipcRenderer.removeListener('update-downloaded', h.onDownloaded)
  if (h.onInstallingUpdate) ipcRenderer.removeListener('installing-update', h.onInstallingUpdate)
  if (h.onDownloadCancelled) ipcRenderer.removeListener('update-cancelled', h.onDownloadCancelled)
})
</script>

<style scoped>
#app {
  position: relative;
  height: 100%;
}

.app-background-layer {
  position: fixed;
  top: -40px;
  right: -40px;
  bottom: -40px;
  left: -40px;
  pointer-events: none;
  z-index: 0;
}

.app-content {
  position: relative;
  /* z-index: 1; */
  height: 100%;
  width: 100%;
}

.has-custom-titlebar .app-content {
  height: 100%;
}

.is-preference-window.has-custom-titlebar .app-content {
  padding-top: 0;
  height: 100%;
}
</style>
