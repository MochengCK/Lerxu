<template>
  <div id="app" :style="appRootStyle">
    <div
      v-if="shouldUseBackgroundImage"
      class="app-background-layer"
      :style="backgroundLayerStyle"
    />
    <mo-title-bar
      v-if="isRenderer"
      :showActions="showWindowActions"
    />
    <div class="app-content">
      <router-view />
      <mo-engine-client
        :secret="rpcSecret"
      />
      <mo-ipc v-if="isRenderer" />
      <mo-dynamic-tray v-if="enableTraySpeedometer" />
    </div>
  </div>
</template>

<script>
  import is from 'electron-is'
  import { mapGetters, mapState } from 'vuex'
  import { APP_RUN_MODE, APP_THEME } from '@shared/constants'
  import DynamicTray from '@/components/Native/DynamicTray'
  import EngineClient from '@/components/Native/EngineClient'
  import Ipc from '@/components/Native/Ipc'
  import TitleBar from '@/components/Native/TitleBar'
  import { getLanguage } from '@shared/locales'
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
    name: 'LinkCoreDownloadManagerApp',
    components: {
      [DynamicTray.name]: DynamicTray,
      [EngineClient.name]: EngineClient,
      [Ipc.name]: Ipc,
      [TitleBar.name]: TitleBar
    },
    computed: {
      isMac: () => is.macOS(),
      isRenderer: () => is.renderer(),
      ...mapState('app', {
        systemTheme: state => state.systemTheme
      }),
      ...mapState('preference', {
        showWindowActions: state => {
          return (is.windows() || is.linux()) && state.config.hideAppMenu
        },
        runMode: state => state.config.runMode,
        traySpeedometer: state => state.config.traySpeedometer,
        rpcSecret: state => state.config.rpcSecret,
        backgroundType: state => state.config.backgroundType,
        backgroundImage: state => state.config.backgroundImage,
        backgroundImageOpacity: state => state.config.backgroundImageOpacity,
        backgroundImageFrostedBlur: state => state.config.backgroundImageFrostedBlur,
        backgroundUiOpacity: state => state.config.backgroundUiOpacity,
        backgroundUiOpacityScope: state => state.config.backgroundUiOpacityScope,
        backgroundUiFrostedBlur: state => state.config.backgroundUiFrostedBlur,
        backgroundUiFrostedBlurScope: state => state.config.backgroundUiFrostedBlurScope,
        taskDetailDefaultTransparent: state => state.config.taskDetailDefaultTransparent,
        taskDetailFrostedBlur: state => state.config.taskDetailFrostedBlur
      }),
      ...mapGetters('preference', [
        'theme',
        'locale',
        'direction'
      ]),
      themeClass () {
        if (this.theme === APP_THEME.AUTO) {
          return `theme-${this.systemTheme}`
        } else {
          return `theme-${this.theme}`
        }
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
      shouldUseBackgroundImage () {
        return this.backgroundType === 'image' && !!this.backgroundImageUrl
      },
      uiOpacity () {
        if (!this.shouldUseBackgroundImage) return 1
        const raw = Number(this.backgroundUiOpacity)
        const normalized = Number.isFinite(raw) ? raw : 0.7
        return Math.min(Math.max(normalized, 0.3), 1)
      },
      uiFrostedBlur () {
        if (!this.shouldUseBackgroundImage) return 0
        const raw = Number(this.backgroundUiFrostedBlur)
        const normalized = Number.isFinite(raw) ? raw : 6
        return Math.min(Math.max(normalized, 0), 20)
      },
      backgroundImageCssValue () {
        if (!this.shouldUseBackgroundImage) return 'none'
        const url = this.backgroundImageUrl
        if (!url) return 'none'
        return `url("${url}")`
      },
      appRootStyle () {
        const blurRaw = Number(this.taskDetailFrostedBlur)
        const blur = Number.isFinite(blurRaw) ? Math.min(Math.max(blurRaw, 0), 20) : 0
        const alpha = blur <= 0 ? 0 : Math.min(Math.max((blur / 20) * 0.16, 0), 0.16)
        const bgBlurRaw = Number(this.backgroundImageFrostedBlur)
        const bgBlur = Number.isFinite(bgBlurRaw) ? Math.min(Math.max(bgBlurRaw, 0), 20) : 0
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
        const opacity = Number.isFinite(opacityRaw) ? Math.min(Math.max(opacityRaw, 0), 1) : 0.3
        const url = this.backgroundImageUrl
        if (!url) return {}
        const blurRaw = Number(this.backgroundImageFrostedBlur)
        const blur = Number.isFinite(blurRaw) ? Math.min(Math.max(blurRaw, 0), 20) : 0
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
      }
    },
    methods: {
      getUiOpacityForScope (scope) {
        if (!this.shouldUseBackgroundImage) return 1
        const scopes = Array.isArray(this.backgroundUiOpacityScope) ? this.backgroundUiOpacityScope : null
        if (!scopes) return this.uiOpacity
        return scopes.includes(scope) ? this.uiOpacity : 1
      },
      getUiFrostedBlurForScope (scope) {
        if (!this.shouldUseBackgroundImage) return 0
        const scopes = Array.isArray(this.backgroundUiFrostedBlurScope) ? this.backgroundUiFrostedBlurScope : null
        if (!scopes) return this.uiFrostedBlur
        return scopes.includes(scope) ? this.uiFrostedBlur : 0
      },
      updateRootClassName () {
        const { themeClass = '', i18nClass = '', directionClass = '', backgroundClass = '', taskDetailTransparentClass = '' } = this
        const className = `${themeClass} ${i18nClass} ${directionClass} ${backgroundClass} ${taskDetailTransparentClass}`.trim()
        document.documentElement.className = className
      },
      updateRootCssVars () {
        const blurRaw = Number(this.taskDetailFrostedBlur)
        const blur = Number.isFinite(blurRaw) ? Math.min(Math.max(blurRaw, 0), 20) : 0
        const alpha = blur <= 0 ? 0 : Math.min(Math.max((blur / 20) * 0.16, 0), 0.16)
        const bgBlurRaw = Number(this.backgroundImageFrostedBlur)
        const bgBlur = Number.isFinite(bgBlurRaw) ? Math.min(Math.max(bgBlurRaw, 0), 20) : 0
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
      }
    },
    beforeMount () {
      this.updateRootClassName()
      this.updateRootCssVars()
    },
    mounted () {
      this._updateMessageShown = false
      const onUpdateAvailable = (event, version, releaseNotes) => {
        const cfg = (this.$store.state.preference && this.$store.state.preference.config) || {}
        const autoCheckEnabled = !!cfg.autoCheckUpdate
        if (autoCheckEnabled) {
          this.$store.dispatch('preference/updateUpdateAvailable', true)
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
                    this.$router.push({ path: '/preference/advanced' }).catch(err => console.log(err))
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
        const autoCheckEnabled = !!cfg.autoCheckUpdate
        if (autoCheckEnabled) {
          this.$store.dispatch('preference/updateUpdateAvailable', false)
          this.$store.dispatch('preference/updateNewVersion', '')
          this.$store.dispatch('preference/updateLastCheckUpdateTime', Date.now())
        }
      }
      const onUpdateError = () => {}
      this.$electron.ipcRenderer.on('update-available', onUpdateAvailable)
      this.$electron.ipcRenderer.on('update-not-available', onUpdateNotAvailable)
      this.$electron.ipcRenderer.on('update-error', onUpdateError)
      this._updateHandlers = { onUpdateAvailable, onUpdateNotAvailable, onUpdateError }
    },
    destroyed () {
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
    },
    watch: {
      locale (val) {
        const lng = getLanguage(val)
        getLocaleManager().changeLanguage(lng)
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
  z-index: 1;
  height: 100%;
  width: 100%;
}
</style>
