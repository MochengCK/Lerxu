<template>
  <div style="display: none;">
    <img
      id="dock-icon-base"
      :src="dockIconBase"
    >
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ipcRenderer } from 'electron'
import DockWorker from '@/workers/dock.worker?worker'
import dockIconBase from '../../../../static/512x512.png'
import { useAppStore } from '@/store'
import { storeToRefs } from 'pinia'

defineOptions({ name: 'mo-dynamic-dock' })

const appStore = useAppStore()
const { stat } = storeToRefs(appStore)

const trayWorker = ref(null)
let baseBitmap = null
let lastUploadSpeed = null
let lastDownloadSpeed = null

const uploadSpeed = computed(() => stat.value.uploadSpeed)
const downloadSpeed = computed(() => stat.value.downloadSpeed)

watch(uploadSpeed, () => onSpeedChange())
watch(downloadSpeed, () => onSpeedChange())

function ensureDockWorker () {
  if (trayWorker.value) return trayWorker.value
  if (global.app && global.app.dockWorker) {
    trayWorker.value = global.app.dockWorker
    return trayWorker.value
  }
  const worker = new DockWorker()
  worker.addEventListener('message', (event) => {
    const { type, payload } = event.data
    switch (type) {
      case 'dock:drawed':
        updateDock(payload)
        break
      default:
        break
    }
  })
  trayWorker.value = worker
  if (global.app) {
    global.app.dockWorker = worker
  }
  return worker
}

async function updateDock (payload) {
  const { dock } = payload || {}
  if (!dock) return
  const ab = await dock.arrayBuffer()
  ipcRenderer.send('command', 'application:update-dock-icon', ab)
}

async function getBaseIcon () {
  if (baseBitmap) return baseBitmap
  const iconImage = document.getElementById('dock-icon-base')
  if (!iconImage) return null
  if (!iconImage.complete || iconImage.naturalWidth === 0) {
    await new Promise((resolve, reject) => {
      iconImage.addEventListener('load', resolve, { once: true })
      iconImage.addEventListener('error', reject, { once: true })
    })
  }
  baseBitmap = await createImageBitmap(iconImage)
  return baseBitmap
}

async function drawDock () {
  const icon = await getBaseIcon()
  const worker = ensureDockWorker()
  if (!worker) return
  worker.postMessage({
    type: 'dock:draw',
    payload: {
      icon,
      uploadSpeed: uploadSpeed.value,
      downloadSpeed: downloadSpeed.value
    }
  })
}

function onSpeedChange () {
  const us = uploadSpeed.value
  const ds = downloadSpeed.value
  if (us === lastUploadSpeed && ds === lastDownloadSpeed) return
  lastUploadSpeed = us
  lastDownloadSpeed = ds
  drawDock()
}

onMounted(() => {
  ensureDockWorker()
  setTimeout(async () => {
    await drawDock()
  }, 200)
})

onBeforeUnmount(() => {
  if (!trayWorker.value) return
  try {
    trayWorker.value.terminate()
  } catch (e) {}
  if (global.app && global.app.dockWorker === trayWorker.value) {
    global.app.dockWorker = null
  }
  trayWorker.value = null
})
</script>
