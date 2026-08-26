<template>
  <div style="display: none;">
    <img
      id="tray-icon-light-normal"
      :src="trayIconLightNormal"
    >
    <img
      id="tray-icon-light-active"
      :src="trayIconLightActive"
    >
    <img
      id="tray-icon-dark-normal"
      :src="trayIconDarkNormal"
    >
    <img
      id="tray-icon-dark-active"
      :src="trayIconDarkActive"
    >
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ipcRenderer } from 'electron'
import { getInverseTheme } from '@shared/utils'
import { APP_THEME } from '@shared/constants'
import TrayWorker from '@/workers/tray.worker?worker'
import trayIconLightNormal from '../../../../static/mo-tray-light-normal@2x.png'
import trayIconLightActive from '../../../../static/mo-tray-light-active@2x.png'
import trayIconDarkNormal from '../../../../static/mo-tray-dark-normal@2x.png'
import trayIconDarkActive from '../../../../static/mo-tray-dark-active@2x.png'
import { useAppStore } from '@/store'
import { storeToRefs } from 'pinia'

defineOptions({ name: 'mo-dynamic-tray' })

const appStore = useAppStore()
const { stat, systemTheme: theme, trayFocused: focused } = storeToRefs(appStore)

const trayWorker = ref(null)
const cache = {}

let lastUploadSpeed = null
let lastDownloadSpeed = null

const iconStatus = computed(() => stat.value.numActive > 0 ? 'active' : 'normal')
const scale = 2

const currentTheme = computed(() => {
  if (theme.value === APP_THEME.DARK) return theme.value
  return focused.value ? getInverseTheme(theme.value) : theme.value
})

const iconKey = computed(() => `tray-icon-${currentTheme.value}-${iconStatus.value}`)

const uploadSpeed = computed(() => stat.value.uploadSpeed)
const downloadSpeed = computed(() => stat.value.downloadSpeed)

watch(uploadSpeed, () => onSpeedChange())
watch(downloadSpeed, () => onSpeedChange())
watch(iconKey, async () => await drawTray())

function ensureTrayWorker () {
  if (trayWorker.value) return trayWorker.value
  if (global.app && global.app.trayWorker) {
    trayWorker.value = global.app.trayWorker
    return trayWorker.value
  }
  const worker = new TrayWorker()
  worker.addEventListener('message', (event) => {
    const { type, payload } = event.data
    switch (type) {
      case 'initialized':
      case 'log':
        console.log('[Lerxu] Log from Tray Worker: ', payload)
        break
      case 'tray:drawed':
        updateTray(payload)
        break
      default:
        console.warn('[Lerxu] Tray Worker unhandled message type:', type, payload)
    }
  })
  trayWorker.value = worker
  if (global.app) {
    global.app.trayWorker = worker
  }
  return worker
}

async function updateTray (payload) {
  const { tray } = payload || {}
  if (!tray) return
  const ab = await tray.arrayBuffer()
  ipcRenderer.send('command', 'application:update-tray', ab)
}

async function getIcon (key) {
  if (cache[key]) return cache[key]
  const iconImage = document.getElementById(key)
  if (!iconImage || !iconImage.complete || iconImage.naturalWidth === 0) {
    await new Promise((resolve, reject) => {
      if (!iconImage) return reject(new Error('Icon not found'))
      iconImage.addEventListener('load', resolve, { once: true })
      iconImage.addEventListener('error', reject, { once: true })
    })
  }
  const result = await createImageBitmap(iconImage)
  cache[key] = result
  return result
}

async function drawTray () {
  const t = currentTheme.value
  const us = uploadSpeed.value
  const ds = downloadSpeed.value
  const ik = iconKey.value
  const icon = await getIcon(ik)
  const worker = ensureTrayWorker()
  if (!worker) return
  worker.postMessage({
    type: 'tray:draw',
    payload: {
      theme: t,
      icon,
      uploadSpeed: us,
      downloadSpeed: ds,
      scale
    }
  })
}

async function onSpeedChange () {
  const us = uploadSpeed.value
  const ds = downloadSpeed.value
  if (us === lastUploadSpeed && ds === lastDownloadSpeed) return
  lastUploadSpeed = us
  lastDownloadSpeed = ds
  await drawTray()
}

onMounted(() => {
  ensureTrayWorker()
  setTimeout(async () => {
    await drawTray()
  }, 200)
})

onBeforeUnmount(() => {
  if (!trayWorker.value) return
  try {
    trayWorker.value.terminate()
  } catch (e) {}
  if (global.app && global.app.trayWorker === trayWorker.value) {
    global.app.trayWorker = null
  }
  trayWorker.value = null
})
</script>
