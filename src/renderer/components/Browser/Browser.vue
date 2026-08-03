<template>
  <div ref="webviewViewport" class="webview-viewport">
    <webview
      class="mo-webview"
      ref="webview"
      :src="src"
    ></webview>
  </div>
</template>

<script>
  import is from 'electron-is'
  import { webContents } from '@electron/remote'
  import { Loading } from 'element-ui'

  export default {
    name: 'mo-browser',
    components: {
    },
    props: {
      src: {
        type: String,
        default: ''
      }
    },
    data () {
      return {
        loading: null,
        boundListeners: null
      }
    },
    computed: {
      isRenderer: () => is.renderer()
    },
    mounted () {
      const { webview } = this.$refs
      if (!webview) return

      this.boundListeners = {
        loadStart: this.loadStart.bind(this),
        loadStop: this.loadStop.bind(this),
        ready: this.ready.bind(this)
      }

      webview.addEventListener('did-start-loading', this.boundListeners.loadStart)
      webview.addEventListener('did-stop-loading', this.boundListeners.loadStop)
      webview.addEventListener('dom-ready', this.boundListeners.ready)
    },
    beforeDestroy () {
      const { webview } = this.$refs
      const listeners = this.boundListeners
      if (webview && listeners) {
        webview.removeEventListener('did-start-loading', listeners.loadStart)
        webview.removeEventListener('did-stop-loading', listeners.loadStop)
        webview.removeEventListener('dom-ready', listeners.ready)
      }
      if (this.loading) {
        try {
          this.loading.close()
        } catch (_) {}
      }
    },
    methods: {
      loadStart () {
        const { webviewViewport } = this.$refs
        this.loading = Loading.service({
          target: webviewViewport
        })
      },
      loadStop () {
        this.$nextTick(() => {
          if (this.loading) {
            this.loading.close()
          }
        })
      },
      ready () {
        const { webview } = this.$refs
        if (!webview) return

        try {
          const wc = webContents.fromId(webview.getWebContentsId())
          wc.setWindowOpenHandler(({ url }) => {
            this.$electron.ipcRenderer.send('command', 'application:open-external', url)
            return { action: 'deny' }
          })
        } catch (_) {}
      }
    }
  }
</script>

<style lang="scss">
.webview-viewport {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
}
.mo-webview {
  display: block;
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
}
</style>
