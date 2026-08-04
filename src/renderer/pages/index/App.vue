<template>
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
    </div>
  </div>
</template>

<script>
  import is from 'electron-is'
  import { mapGetters, mapState } from 'vuex'
  import { ADD_TASK_TYPE, APP_RUN_MODE } from '@shared/constants'
  import themeTokens from '@/utils/themeTokens'
  import DynamicTray from '@/components/Native/DynamicTray'
  import EngineClient from '@/components/Native/EngineClient'
  import Ipc from '@/components/Native/Ipc'
  import TitleBar from '@/components/Native/TitleBar'
  import { getLanguage } from '@shared/locales'
  import { detectResource } from '@shared/utils'
  import { getLocaleManager } from '@/components/Locale'

  const UI_FROSTED_BLUR_SCOPES = [
    'date-filter',
    'task-category-select',
    'task-item',
    'preference-card',
    'aside',
    'subnav'
  ]

  const UI_OPACITY_SCOPES = [
    'date-filter',
    'task-category-select',
    'task-item',
    'preference-card',
    'aside',
    'subnav'
  ]

  export default {
    name: 'LinkCoreApp',
    components: {
      [DynamicTray.name]: DynamicTray,
      [EngineClient.name]: EngineClient,
      [Ipc.name]: Ipc,
      [TitleBar.name]: TitleBar
    },
    data () {
      return {
        clipboardWatchTimer: null,
        lastClipboardText: '',
        lastClipboardTriggerAt: 0,
        downloadMsgInstance: null
      }
    },
    computed: {
      isMac: () => is.macOS(),
      isRenderer: () => is.renderer(),
      isPreferenceWindow () {
        const path = `${this.$route.path || ''}`
        const hashPath = typeof window !== 'undefined' && window.location && window.location.hash
          ? `${window.location.hash}`
          : ''
        return path.startsWith('/preference-window') || hashPath.startsWith('#/preference-window')
      },
      isTaskPage () {
        const path = `${this.$route.path || ''}`
        const hashPath = typeof window !== 'undefined' && window.location && window.location.hash
          ? `${window.location.hash}`
          : ''
        const hashRoute = hashPath.startsWith('#') ? hashPath.slice(1) : hashPath
        const targetPath = path || hashRoute
        return targetPath.startsWith('/task')
      },
      ...mapState('app', {
        systemTheme: state => state.systemTheme,
        addTaskVisible: state => state.addTaskVisible,
        titleBarText: state => state.titleBarText
      }),
      ...mapState('task', {
        taskDetailVisible: state => state.taskDetailVisible
      }),
      ...mapState('app', {
        taskPlanVisible: state => state.taskPlanVisible
      }),
      ...mapState('preference', {
        showWindowActions: state => {
          return (is.windows() || is.linux()) && state.config.hideAppMenu
        },
        runMode: state => state.config.runMode,
        traySpeedometer: state => state.config.traySpeedometer,
        rpcSecret: state => state.config.rpcSecret,
        clipboardAutoPaste: state => state.config.clipboardAutoPaste,
        backgroundType: state => state.config.backgroundType,
        backgroundImage: state => state.config.backgroundImage,
        backgroundImageOpacity: state => state.config.backgroundImageOpacity,
        backgroundImageFrostedBlur: state => state.config.backgroundImageFrostedBlur,
        backgroundUiOpacity: state => state.config.backgroundUiOpacity,
        backgroundUiOpacityScope: state => state.config.backgroundUiOpacityScope,
        backgroundUiFrostedBlur: state => state.config.backgroundUiFrostedBlur,
        backgroundUiFrostedBlurScope: state => state.config.backgroundUiFrostedBlurScope,
        taskDetailDefaultTransparent: state => state.config.taskDetailDefaultTransparent,
        taskDetailFrostedBlur: state => state.config.taskDetailFrostedBlur,
        dateFilterFrosted: state => state.config.dateFilterFrosted,
        dateFilterFrostedBlur: state => state.config.dateFilterFrostedBlur
      }),
      ...mapGetters('preference', [
        'theme',
        'locale',
        'direction'
      ]),
      themeClass () {
        const effective = themeTokens.resolveTheme(this.theme, this.systemTheme)
        return `theme-${effective}`
      },
      i18nClass () {
        return `i18n-${this.locale}`
      },
      directionClass () {
        return `dir-${this.direction}`
      },
      backgroundClass () {
        const type = `${this.backgroundType || ''}`.trim()
        const img = `${this.backgroundImage || ''}`.trim()
        return type === 'image' && img ? 'has-app-background-image' : ''
      },
      taskDetailTransparentClass () {
        const enabled = this.taskDetailDefaultTransparent === undefined ? false : !!this.taskDetailDefaultTransparent
        return enabled ? 'task-detail-default-transparent' : ''
      },
      layoutClass () {
        return 'has-three-column-layout'
      },
      shouldUseBackgroundImage () {
        return this.backgroundType === 'image' && !!this.backgroundImageUrl
      },
      uiOpacity () {
        if (!this.shouldUseBackgroundImage) return 1
        const raw = Number(this.backgroundUiOpacity)
        const normalized = Number.isFinite(raw) ? raw : 0.7
        return Math.min(Math.max(normalized, 0.4), 1)
      },
      uiFrostedBlur () {
        if (!this.shouldUseBackgroundImage) return 0
        const raw = Number(this.backgroundUiFrostedBlur)
        const normalized = Number.isFinite(raw) ? raw : 6
        return Math.min(Math.max(normalized, 0), 10)
      },
      backgroundImageCssValue () {
        if (!this.shouldUseBackgroundImage) return 'none'
        const url = this.backgroundImageUrl
        if (!url) return 'none'
        return `url("${url}")`
      },
      appRootStyle () {
        const blurRaw = Number(this.taskDetailFrostedBlur)
        const blur = Number.isFinite(blurRaw) ? Math.min(Math.max(blurRaw, 0), 10) : 0
        const alpha = blur <= 0 ? 0 : Math.min(Math.max((blur / 10) * 0.16, 0), 0.16)
        const bgBlurRaw = Number(this.backgroundImageFrostedBlur)
        const bgBlur = Number.isFinite(bgBlurRaw) ? Math.min(Math.max(bgBlurRaw, 0), 10) : 0
        const scopeVars = {}
        UI_FROSTED_BLUR_SCOPES.forEach(scope => {
          scopeVars[`--app-ui-frosted-blur-${scope}`] = `${this.getUiFrostedBlurForScope(scope)}px`
        })
        UI_OPACITY_SCOPES.forEach(scope => {
          scopeVars[`--app-ui-opacity-${scope}`] = `${this.getUiOpacityForScope(scope)}`
        })
        return {
          '--app-ui-opacity': `${this.uiOpacity}`,
          '--app-ui-frosted-blur': `${this.uiFrostedBlur}px`,
          '--app-background-image': `${this.backgroundImageCssValue}`,
          '--task-detail-frosted-blur': `${blur}px`,
          '--task-detail-frosted-alpha': `${alpha}`,
          '--background-image-frosted-blur': `${bgBlur}px`,
          ...scopeVars
        }
      },
      backgroundImageUrl () {
        const p = `${this.backgroundImage || ''}`.trim()
        if (!p) return ''
        if (/^(https?:|file:|data:)/i.test(p)) {
          return p
        }
        try {
          const { pathToFileURL } = require('url')
          return pathToFileURL(p).toString()
        } catch (e) {
          return p
        }
      },
      backgroundLayerStyle () {
        const opacityRaw = Number(this.backgroundImageOpacity)
        const opacity = Number.isFinite(opacityRaw) ? Math.min(Math.max(opacityRaw, 0.3), 1) : 0.4
        const url = this.backgroundImageUrl
        if (!url) return {}
        const blurRaw = Number(this.backgroundImageFrostedBlur)
        const blur = Number.isFinite(blurRaw) ? Math.min(Math.max(blurRaw, 0), 10) : 0
        return {
          opacity,
          backgroundImage: `url("${url}")`,
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center center',
          filter: blur > 0 ? `blur(${blur}px)` : 'none'
        }
      },
      enableTraySpeedometer () {
        const { isMac, isRenderer, traySpeedometer, runMode } = this
        return isMac && isRenderer && traySpeedometer && runMode !== APP_RUN_MODE.HIDE_TRAY
      },
      clipboardAutoPasteEnabled () {
        if (this.clipboardAutoPaste === undefined) return true
        return !!this.clipboardAutoPaste
      }
    },
    methods: {
      updateWindowTitle () {
        if (!this.isPreferenceWindow) return
        if (typeof document === 'undefined') return
        document.title = this.$t('subnav.preferences')
      },
      handlePreferenceCommand (command, ...args) {
        if (!this.isPreferenceWindow) return
        if (command === 'application:update-system-theme') {
          const data = args[0]
          if (data && data.theme) {
            this.$store.dispatch('app/updateSystemTheme', data.theme)
          }
          return
        }
        if (command === 'application:update-theme') {
          const data = args[0]
          if (data && data.theme) {
            this.$store.dispatch('preference/updateAppTheme', data.theme)
          }
          return
        }
        if (command === 'application:open-preference-category') {
          const data = args[0]
          if (data && data.category) {
            this.$router.push({ path: `/preference-window/${data.category}` }).catch(err => {
              console.log(err)
            })
          }
        }
      },
      bringMainWindowToFront () {
        try {
          const { getCurrentWindow } = require('@electron/remote')
          const win = getCurrentWindow && getCurrentWindow()
          if (win) {
            if (win.isMinimized && win.isMinimized()) {
              win.restore()
            }
            if (win.show) win.show()
            if (win.focus) win.focus()
            if (win.moveTop) win.moveTop()
          }
        } catch (e) {}

        try {
          this.$electron.ipcRenderer.send('command', 'application:bring-to-front', { page: 'index' })
          return true
        } catch (e) {}
        return false
      },
      startClipboardAutoOpenWatch () {
        if (!this.isRenderer) return
        if (this.clipboardWatchTimer) return
        try {
          const { clipboard } = require('electron')
          this.lastClipboardText = `${clipboard.readText() || ''}`
        } catch (e) {
          this.lastClipboardText = ''
        }

        this.clipboardWatchTimer = setInterval(() => {
          this.checkClipboardAndAutoOpenAddTask()
        }, 800)
      },
      stopClipboardAutoOpenWatch () {
        if (this.clipboardWatchTimer) {
          clearInterval(this.clipboardWatchTimer)
          this.clipboardWatchTimer = null
        }
      },
      isDownloadLinkLine (line = '') {
        const s = `${line}`.trim()
        if (!s) return false
        const lower = s.toLowerCase()
        return lower.startsWith('http://') ||
          lower.startsWith('https://') ||
          lower.startsWith('ftp://') ||
          lower.startsWith('magnet:') ||
          lower.startsWith('thunder://')
      },
      checkClipboardAndAutoOpenAddTask () {
        if (!this.clipboardAutoPasteEnabled) return
        if (this.addTaskVisible) return
        try {
          const { clipboard } = require('electron')
          const content = clipboard.readText()
          const text = `${content || ''}`.trim()
          if (!text) return
          if (text === this.lastClipboardText) return
          this.lastClipboardText = text

          if (!detectResource(text)) return

          const lines = text.split(/\r?\n/).map(v => `${v}`.trim()).filter(Boolean)
          const uri = lines.find(l => this.isDownloadLinkLine(l))
          if (!uri) return

          const now = Date.now()
          if (now - (this.lastClipboardTriggerAt || 0) < 1200) return
          this.lastClipboardTriggerAt = now

          this.bringMainWindowToFront()
          this.$store.dispatch('app/updateAddTaskUrl', uri)
          this.$store.dispatch('app/showAddTaskDialog', ADD_TASK_TYPE.URI)
        } catch (e) {
        }
      },
      getUiOpacityForScope (scope) {
        if (scope === 'date-filter' && this.dateFilterFrosted) {
          if (this.shouldUseBackgroundImage) {
            const scopes = Array.isArray(this.backgroundUiOpacityScope) ? this.backgroundUiOpacityScope : null
            if (!scopes || scopes.includes(scope)) {
              return this.uiOpacity
            }
            return 0.8
          }
          return 0.8
        }

        if (!this.shouldUseBackgroundImage) return 1
        const scopes = Array.isArray(this.backgroundUiOpacityScope) ? this.backgroundUiOpacityScope : null
        if (!scopes) return this.uiOpacity
        return scopes.includes(scope) ? this.uiOpacity : 1
      },
      getUiFrostedBlurForScope (scope) {
        if (scope === 'date-filter' && this.dateFilterFrosted) {
          const raw = Number(this.dateFilterFrostedBlur)
          const val = Number.isFinite(raw) ? raw : 6
          return Math.min(Math.max(val, 0), 10)
        }

        if (!this.shouldUseBackgroundImage) return 0
        const scopes = Array.isArray(this.backgroundUiFrostedBlurScope) ? this.backgroundUiFrostedBlurScope : null
        if (!scopes) return this.uiFrostedBlur
        return scopes.includes(scope) ? this.uiFrostedBlur : 0
      },
      updateRootClassName () {
        const { themeClass = '', i18nClass = '', directionClass = '', backgroundClass = '', taskDetailTransparentClass = '', layoutClass = '' } = this
        const className = `${themeClass} ${i18nClass} ${directionClass} ${backgroundClass} ${taskDetailTransparentClass} ${layoutClass}`.trim()
        document.documentElement.className = className
      },
      updateRootCssVars () {
        const blurRaw = Number(this.taskDetailFrostedBlur)
        const blur = Number.isFinite(blurRaw) ? Math.min(Math.max(blurRaw, 0), 10) : 0
        const alpha = blur <= 0 ? 0 : Math.min(Math.max((blur / 10) * 0.16, 0), 0.16)
        const bgBlurRaw = Number(this.backgroundImageFrostedBlur)
        const bgBlur = Number.isFinite(bgBlurRaw) ? Math.min(Math.max(bgBlurRaw, 0), 10) : 0
        document.documentElement.style.setProperty('--app-ui-opacity', `${this.uiOpacity}`)
        document.documentElement.style.setProperty('--app-ui-frosted-blur', `${this.uiFrostedBlur}px`)
        document.documentElement.style.setProperty('--app-background-image', `${this.backgroundImageCssValue}`)
        document.documentElement.style.setProperty('--task-detail-frosted-blur', `${blur}px`)
        document.documentElement.style.setProperty('--task-detail-frosted-alpha', `${alpha}`)
        document.documentElement.style.setProperty('--background-image-frosted-blur', `${bgBlur}px`)
        UI_FROSTED_BLUR_SCOPES.forEach(scope => {
          document.documentElement.style.setProperty(`--app-ui-frosted-blur-${scope}`, `${this.getUiFrostedBlurForScope(scope)}px`)
        })
        UI_OPACITY_SCOPES.forEach(scope => {
          document.documentElement.style.setProperty(`--app-ui-opacity-${scope}`, `${this.getUiOpacityForScope(scope)}`)
        })
      },
      handleWindowResize () {}
    },
    beforeMount () {
      this.updateRootClassName()
      this.updateRootCssVars()
    },
    mounted () {
      this._updateMessageShown = false
      this.updateWindowTitle()
      if (typeof window !== 'undefined') {
        this.handleWindowResize()
        this._handleWindowResize = () => {
          this.handleWindowResize()
        }
        window.addEventListener('resize', this._handleWindowResize)
      }
      if (this.isRenderer && this.isPreferenceWindow) {
        this._preferenceCommandHandler = (event, command, ...args) => {
          this.handlePreferenceCommand(command, ...args)
        }
        this.$electron.ipcRenderer.on('command', this._preferenceCommandHandler)
      }
      const onUpdateAvailable = (event, version, releaseNotes) => {
        const cfg = (this.$store.state.preference && this.$store.state.preference.config) || {}
        const autoCheckEnabled = cfg.autoCheckUpdate !== undefined ? !!cfg.autoCheckUpdate : !!cfg['auto-check-update']
        if (autoCheckEnabled) {
          this.$store.dispatch('preference/updateUpdateAvailable', true)
          this.$store.dispatch('preference/updateUpdateDownloaded', false)
          this.$store.dispatch('preference/updateNewVersion', version)
          this.$store.dispatch('preference/updateLastCheckUpdateTime', Date.now())
          this.$store.dispatch('preference/updateReleaseNotes', releaseNotes || '')

          const v = (version == null) ? '' : `${version}`.trim()
          if (v && typeof window !== 'undefined' && window.localStorage) {
            const key = 'lastNotifiedUpdateVersion'
            const last = `${window.localStorage.getItem(key) || ''}`.trim()
            if (last !== v && !this._updateMessageShown) {
              this._updateMessageShown = true
              if (this.$msg && typeof this.$msg.info === 'function') {
                this.$msg.info({
                  message: `${this.$t('app.update-available-message')} ${v}`,
                  duration: 10000,
                  showClose: true,
                  onClick: () => {
                    this.$electron.ipcRenderer.send('open-preference-window', { category: 'advanced' })
                  }
                })
              }
              window.localStorage.setItem(key, v)
            }
          }
        }
      }
      const onUpdateNotAvailable = () => {
        const cfg = (this.$store.state.preference && this.$store.state.preference.config) || {}
        const autoCheckEnabled = cfg.autoCheckUpdate !== undefined ? !!cfg.autoCheckUpdate : !!cfg['auto-check-update']
        if (autoCheckEnabled) {
          this.$store.dispatch('preference/updateUpdateAvailable', false)
          this.$store.dispatch('preference/updateUpdateDownloaded', false)
          this.$store.dispatch('preference/updateNewVersion', '')
          this.$store.dispatch('preference/updateLastCheckUpdateTime', Date.now())
        }
      }
      const onUpdateError = () => {}
      // 下载全局监听（仅在主窗口显示，偏好窗口关闭后追踪下载进度）
      this._downloadStartNotified = false
      const onDownloadStart = () => {
        this.$store.dispatch('preference/updateIsDownloadingUpdate', true)
        this.$store.dispatch('preference/updateUpdateDownloaded', false)
        this.$store.dispatch('preference/updateDownloadProgress', 0)
        this.$store.dispatch('preference/updateDownloadSize', { total: 0, transferred: 0 })
      }
      const onDownloadProgress = (_event, progress) => {
        const percent = Math.round(progress.percent)
        this.$store.dispatch('preference/updateDownloadProgress', percent)
        this.$store.dispatch('preference/updateIsDownloadingUpdate', true)
        this.$store.dispatch('preference/updateDownloadSize', {
          total: progress.total || 0,
          transferred: progress.transferred || 0
        })

        // 仅主窗口、进度 > 0 时显示一条持久通知
        if (!this.isPreferenceWindow && percent > 0 && !this._downloadStartNotified && this.$msg) {
          this._downloadStartNotified = true
          this.downloadMsgInstance = this.$msg({
            message: '正在下载更新...',
            type: 'info',
            duration: 0,
            showClose: true
          })
        }
      }
      const onDownloaded = () => {
        this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
        this.$store.dispatch('preference/updateUpdateDownloaded', true)
        this.$store.dispatch('preference/updateUpdateAvailable', false)
        // 主进程会自动安装，等待installing-update事件，不在此显示通知
      }
      const onInstallingUpdate = () => {
        this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
        this.$store.dispatch('preference/updateIsInstallingUpdate', true)
        this.$store.dispatch('preference/updateDownloadProgress', 100)
        this.$store.dispatch('preference/updateUpdateDownloaded', false)
        this._downloadStartNotified = false
        // 关闭之前的"正在下载"通知
        if (this.downloadMsgInstance && typeof this.downloadMsgInstance.close === 'function') {
          try { this.downloadMsgInstance.close() } catch (e) {}
          this.downloadMsgInstance = null
        }
        if (!this.isPreferenceWindow && this.$msg && typeof this.$msg.success === 'function') {
          this.$msg.success('更新下载完成，准备重启到新版本...')
        }
      }
      const onDownloadError = (_event, errMsg) => {
        this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
        this.$store.dispatch('preference/updateIsInstallingUpdate', false)
        this.$store.dispatch('preference/updateUpdateDownloaded', false)
        this._downloadStartNotified = false
        if (this.downloadMsgInstance && typeof this.downloadMsgInstance.close === 'function') {
          try { this.downloadMsgInstance.close() } catch (e) {}
          this.downloadMsgInstance = null
        }
        if (!this.isPreferenceWindow && this.$msg && typeof this.$msg.error === 'function') {
          this.$msg.error(errMsg || this.$t('app.update-error-message'))
        }
      }
      const onDownloadCancelled = () => {
        this.$store.dispatch('preference/updateIsDownloadingUpdate', false)
        this.$store.dispatch('preference/updateIsInstallingUpdate', false)
        this.$store.dispatch('preference/updateUpdateDownloaded', false)
        this.$store.dispatch('preference/updateDownloadProgress', 0)
        this.$store.dispatch('preference/updateDownloadSize', { total: 0, transferred: 0 })
        this._downloadStartNotified = false
        if (this.downloadMsgInstance && typeof this.downloadMsgInstance.close === 'function') {
          try { this.downloadMsgInstance.close() } catch (e) {}
          this.downloadMsgInstance = null
        }
      }
      this.$electron.ipcRenderer.on('update-available', onUpdateAvailable)
      this.$electron.ipcRenderer.on('update-not-available', onUpdateNotAvailable)
      this.$electron.ipcRenderer.on('update-error', onUpdateError)
      this.$electron.ipcRenderer.on('download-start', onDownloadStart)
      this.$electron.ipcRenderer.on('download-progress', onDownloadProgress)
      this.$electron.ipcRenderer.on('update-downloaded', onDownloaded)
      this.$electron.ipcRenderer.on('installing-update', onInstallingUpdate)
      this.$electron.ipcRenderer.on('update-cancelled', onDownloadCancelled)
      this._updateHandlers = { onUpdateAvailable, onUpdateNotAvailable, onUpdateError, onDownloadStart, onDownloadProgress, onDownloaded, onInstallingUpdate, onDownloadError, onDownloadCancelled }
    },
    destroyed () {
      if (typeof window !== 'undefined' && this._handleWindowResize) {
        window.removeEventListener('resize', this._handleWindowResize)
        this._handleWindowResize = null
      }
      if (typeof this.stopClipboardAutoOpenWatch === 'function') {
        this.stopClipboardAutoOpenWatch()
      }
      if (this._preferenceCommandHandler) {
        this.$electron.ipcRenderer.removeListener('command', this._preferenceCommandHandler)
      }
      const h = this._updateHandlers || {}
      if (h.onUpdateAvailable) {
        this.$electron.ipcRenderer.removeListener('update-available', h.onUpdateAvailable)
      }
      if (h.onUpdateNotAvailable) {
        this.$electron.ipcRenderer.removeListener('update-not-available', h.onUpdateNotAvailable)
      }
      if (h.onUpdateError) {
        this.$electron.ipcRenderer.removeListener('update-error', h.onUpdateError)
      }
      if (h.onDownloadStart) {
        this.$electron.ipcRenderer.removeListener('download-start', h.onDownloadStart)
      }
      if (h.onDownloadProgress) {
        this.$electron.ipcRenderer.removeListener('download-progress', h.onDownloadProgress)
      }
      if (h.onDownloaded) {
        this.$electron.ipcRenderer.removeListener('update-downloaded', h.onDownloaded)
      }
      if (h.onInstallingUpdate) {
        this.$electron.ipcRenderer.removeListener('installing-update', h.onInstallingUpdate)
      }
      if (h.onDownloadCancelled) {
        this.$electron.ipcRenderer.removeListener('update-cancelled', h.onDownloadCancelled)
      }
    },
    watch: {
      locale (val) {
        const lng = getLanguage(val)
        getLocaleManager().changeLanguage(lng)
        this.updateWindowTitle()
      },
      backgroundClass () {
        this.updateRootClassName()
      },
      themeClass () {
        this.updateRootClassName()
      },
      i18nClass () {
        this.updateRootClassName()
      },
      directionClass () {
        this.updateRootClassName()
      },
      taskDetailTransparentClass () {
        this.updateRootClassName()
      },
      layoutClass () {
        this.updateRootClassName()
      },
      taskDetailFrostedBlur () {
        this.updateRootCssVars()
      },
      backgroundImageFrostedBlur () {
        this.updateRootCssVars()
      },
      uiOpacity () {
        this.updateRootCssVars()
      },
      uiFrostedBlur () {
        this.updateRootCssVars()
      },
      backgroundUiOpacityScope () {
        this.updateRootCssVars()
      },
      backgroundUiFrostedBlurScope () {
        this.updateRootCssVars()
      },
      backgroundImageCssValue () {
        this.updateRootCssVars()
      },
      dateFilterFrosted () {
        this.updateRootCssVars()
      },
      dateFilterFrostedBlur () {
        this.updateRootCssVars()
      }
    }
  }
</script>

<style scoped>
#app {
  position: relative;
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
