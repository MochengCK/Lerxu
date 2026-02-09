<template>
  <div style="display: none;">
    <img
      id="tray-icon-light-normal"
      src="static/mo-tray-light-normal@2x.png"
    >
    <img
      id="tray-icon-light-active"
      src="static/mo-tray-light-active@2x.png"
    >
    <img
      id="tray-icon-dark-normal"
      src="static/mo-tray-dark-normal@2x.png"
    >
    <img
      id="tray-icon-dark-active"
      src="static/mo-tray-dark-active@2x.png"
    >
  </div>
</template>

<script>
  import { ipcRenderer } from 'electron'
  import { mapState } from 'vuex'

  import { getInverseTheme } from '@shared/utils'
  import { APP_THEME } from '@shared/constants'
  import TrayWorker from '@/workers/tray.worker'

  const cache = {}

  export default {
    name: 'mo-dynamic-tray',
    data () {
      return {
        trayWorker: null
      }
    },
    computed: {
      ...mapState('app', {
        iconStatus: state => state.stat.numActive > 0 ? 'active' : 'normal',
        theme: state => state.systemTheme,
        focused: state => state.trayFocused,
        uploadSpeed: state => state.stat.uploadSpeed,
        downloadSpeed: state => state.stat.downloadSpeed,
        speed: state => state.stat.uploadSpeed + state.stat.downloadSpeed
      }),
      scale () {
        return 2
      },
      currentTheme () {
        const { theme, focused } = this
        if (theme === APP_THEME.DARK) {
          return theme
        }

        return focused ? getInverseTheme(theme) : theme
      },
      iconKey () {
        const { bigSur, iconStatus, currentTheme } = this
        return bigSur ? 'tray-icon-light-normal' : `tray-icon-${currentTheme}-${iconStatus}`
      }
    },
    watch: {
      async speed (val) {
        await this.drawTray()
      },
      async iconKey (val) {
        await this.drawTray()
      }
    },
    mounted () {
      this.ensureTrayWorker()
      setTimeout(async () => {
        await this.drawTray()
      }, 200)
    },
    beforeDestroy () {
      if (!this.trayWorker) {
        return
      }
      try {
        this.trayWorker.terminate()
      } catch (e) {}
      if (global.app && global.app.trayWorker === this.trayWorker) {
        global.app.trayWorker = null
      }
      this.trayWorker = null
    },
    methods: {
      ensureTrayWorker () {
        if (this.trayWorker) {
          return this.trayWorker
        }
        if (global.app && global.app.trayWorker) {
          this.trayWorker = global.app.trayWorker
          return this.trayWorker
        }
        const worker = new TrayWorker()
        worker.addEventListener('message', (event) => {
          const { type, payload } = event.data

          switch (type) {
          case 'initialized':
          case 'log':
            console.log('[Motrix] Log from Tray Worker: ', payload)
            break
          case 'tray:drawed':
            this.updateTray(payload)
            break
          default:
            console.warn('[Motrix] Tray Worker unhandled message type:', type, payload)
          }
        })
        this.trayWorker = worker
        if (global.app) {
          global.app.trayWorker = worker
        }
        return worker
      },
      async updateTray (payload) {
        const { tray } = payload || {}
        if (!tray) {
          return
        }
        const ab = await tray.arrayBuffer()
        ipcRenderer.send('command', 'application:update-tray', ab)
      },
      async getIcon (key) {
        if (cache[key]) {
          return cache[key]
        }

        const iconImage = document.getElementById(key)
        const result = await createImageBitmap(iconImage)
        cache[key] = result

        return result
      },
      async drawTray () {
        const {
          currentTheme: theme,
          uploadSpeed,
          downloadSpeed,
          scale,
          iconKey
        } = this

        const icon = await this.getIcon(iconKey)
        const worker = this.ensureTrayWorker()
        if (!worker) {
          return
        }
        worker.postMessage({
          type: 'tray:draw',
          payload: {
            theme,
            icon,
            uploadSpeed,
            downloadSpeed,
            scale
          }
        })
      }
    }
  }
</script>
