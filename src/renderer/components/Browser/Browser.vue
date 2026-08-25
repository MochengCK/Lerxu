<template>
  <div ref="webviewViewport" class="webview-viewport">
    <webview
      class="mo-webview"
      ref="webview"
      :src="src"
    ></webview>
  </div>
</template>

<script setup>
defineOptions({ name: 'mo-browser' }) // 供父组件 [X.name]: X 注册
import { ref, computed, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'
import is from 'electron-is'
import { webContents } from '@electron/remote'
import { ElLoading } from 'element-plus'
import { ipcRenderer } from 'electron'

const props = defineProps({
  src: {
    type: String,
    default: ''
  }
})

const webviewViewport = ref(null)
const webview = ref(null)
const loadingInstance = ref(null)
const boundListeners = ref(null)

const isRenderer = computed(() => is.renderer())

function loadStart () {
  loadingInstance.value = ElLoading.service({
    target: webviewViewport.value
  })
}

function loadStop () {
  if (loadingInstance.value) {
    try {
      loadingInstance.value.close()
    } catch (_) {}
    loadingInstance.value = null
  }
}

function ready () {
  const wv = webview.value
  if (!wv) return

  try {
    const wc = webContents.fromId(wv.getWebContentsId())
    wc.setWindowOpenHandler(({ url }) => {
      ipcRenderer.send('command', 'application:open-external', url)
      return { action: 'deny' }
    })
  } catch (_) {}
}

onMounted(() => {
  const wv = webview.value
  if (!wv) return

  boundListeners.value = {
    loadStart,
    loadStop,
    ready
  }

  wv.addEventListener('did-start-loading', loadStart)
  wv.addEventListener('did-stop-loading', loadStop)
  wv.addEventListener('dom-ready', ready)
})

onBeforeUnmount(() => {
  const wv = webview.value
  const listeners = boundListeners.value
  if (wv && listeners) {
    wv.removeEventListener('did-start-loading', listeners.loadStart)
    wv.removeEventListener('did-stop-loading', listeners.loadStop)
    wv.removeEventListener('dom-ready', listeners.ready)
  }
  if (loadingInstance.value) {
    try {
      loadingInstance.value.close()
    } catch (_) {}
  }
})
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
