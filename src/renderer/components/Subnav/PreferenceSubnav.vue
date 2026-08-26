<template>
  <nav class="subnav-inner">
    <h3 v-if="!isStandalone">{{ title }}</h3>
    <ul class="preference-subnav-ul">
      <div class="nav-slider" :style="sliderStyle"></div>
      <li
        v-for="item in subnavItems"
        :key="item.key"
        @click="() => nav(item.key)"
        :class="['subnav-item', `subnav-item--${item.key}`, current === item.key ? 'active' : '' ]"
      >
        <i v-if="item.icon" class="subnav-icon">
          <mo-icon :name="item.icon" width="18" height="18" />
        </i>
        <i v-else class="subnav-icon subnav-icon--empty"></i>
        <span>{{ item.title }}</span>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, getCurrentInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'
import { ipcRenderer } from 'electron'
import '@/components/Icons/preference-basic'
import '@/components/Icons/preference-advanced'
import '@/components/Icons/preference-appearance'
import '@/components/Icons/preference-transfer'
import '@/components/Icons/preference-task'
import '@/components/Icons/preference-file'
import '@/components/Icons/preference-bt'
import '@/components/Icons/preference-ed2k'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例

const { t } = i18n.global
const route = useRoute()
const router = useRouter()
const instance = getCurrentInstance()

const appStore = useAppStore()
const preferenceStore = usePreferenceStore()

const { isCheckingUpdate } = storeToRefs(appStore)
const { updateAvailable, newVersion, isDownloadingUpdate, updateDownloaded, downloadProgress, downloadTotal, downloadTransferred, releaseNotes } = storeToRefs(preferenceStore)

const props = defineProps({
  current: {
    type: String,
    default: 'basic'
  }
})

defineOptions({ name: 'mo-preference-subnav' })

const appVersion = ref('')
const sliderTop = ref(0)
const sliderHeight = ref(36)
let _updateIpcHandlers = null

const preferenceBasePath = computed(() => {
  const path = `${route.path || ''}`
  return path.startsWith('/preference-window') ? '/preference-window' : '/preference'
})

const isStandalone = computed(() => preferenceBasePath.value === '/preference-window')

const title = computed(() => t('subnav.preferences'))

const subnavItems = computed(() => [
  { key: 'basic', title: t('preferences.basic'), icon: 'preference-basic' },
  { key: 'appearance', title: t('preferences.appearance'), icon: 'preference-appearance' },
  { key: 'transfer', title: t('preferences.transfer-settings'), icon: 'preference-transfer' },
  { key: 'bt', title: t('preferences.bt-settings'), icon: 'preference-bt' },
  { key: 'ed2k', title: t('preferences.ed2k-settings'), icon: 'preference-ed2k' },
  { key: 'task', title: t('preferences.task-manage'), icon: 'preference-task' },
  { key: 'file', title: t('preferences.file-manage'), icon: 'preference-file' },
  { key: 'advanced', title: t('preferences.advanced'), icon: 'preference-advanced' }
])

const isChecking = computed(() => isCheckingUpdate.value)

const currentIndex = computed(() => subnavItems.value.findIndex(item => item.key === props.current))

const sliderStyle = computed(() => {
  const index = currentIndex.value
  if (index === -1) return { display: 'none' }
  const top = Number.isFinite(sliderTop.value) ? sliderTop.value : 0
  const height = Number.isFinite(sliderHeight.value) ? sliderHeight.value : 36
  return {
    transform: `translateY(${top}px)`,
    height: `${height}px`
  }
})

function nav (category = 'basic') {
  const base = preferenceBasePath.value
  router.push({
    path: `${base}/${category}`
  }).catch(err => {
    console.log(err)
  })
}

function isVersionNewer (a, b) {
  if (!a || !b) return false
  const parse = (v) => {
    const m = String(v).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
    if (!m) return null
    return {
      major: parseInt(m[1], 10),
      minor: parseInt(m[2], 10),
      patch: parseInt(m[3], 10),
      pre: m[4] ? m[4].toLowerCase().split('.') : null
    }
  }
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return false
  if (pa.major !== pb.major) return pa.major > pb.major
  if (pa.minor !== pb.minor) return pa.minor > pb.minor
  if (pa.patch !== pb.patch) return pa.patch > pb.patch
  if (!pa.pre) return !!pb.pre
  if (!pb.pre) return false
  const len = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < len; i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return false
    if (y === undefined) return true
    if (x === y) continue
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) return parseInt(x, 10) > parseInt(y, 10)
    if (xn) return false
    if (yn) return true
    return x > y
  }
  return false
}

function updateSliderFromDom () {
  const root = instance?.proxy?.$el
  if (!root) return
  const activeItem = root.querySelector('.preference-subnav-ul li.active')
  if (!activeItem) return
  sliderTop.value = activeItem.offsetTop || 0
  sliderHeight.value = activeItem.offsetHeight || 36
}

function getVersionText () {
  if (isDownloadingUpdate.value) {
    const bytesToSize = (bytes, decimals = 2) => {
      if (!bytes || bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
    }
    const transferred = bytesToSize(downloadTransferred.value, 2)
    const total = bytesToSize(downloadTotal.value, 2)
    if (downloadTotal.value > 0) {
      return `下载中 ${downloadProgress.value}% (${transferred} / ${total})`
    }
    return `下载中 ${downloadProgress.value}%`
  } else if (updateAvailable.value) {
    return `下载新版本 ${newVersion.value}`
  } else {
    return appVersion.value
  }
}

function hasMsgSupport () {
  return typeof instance.proxy.$msg !== 'undefined' && instance.proxy.$msg !== null
}

function showMessage (type, message) {
  if (hasMsgSupport()) {
    instance.proxy.$msg[type](message)
  } else {
    console.log(`[Lerxu] Update message: ${type} - ${message}`)
    if (type === 'error') {
      alert(message)
    }
  }
}

function checkForUpdates () {
  if (isCheckingUpdate.value) return
  appStore.updateCheckingUpdate(true)
  showMessage('info', t('app.checking-for-updates'))

  const onUpdateError = (_event, errMsg) => {
    const msg = errMsg || t('app.update-error-message')
    showMessage('error', msg)
    appStore.updateCheckingUpdate(false)
  }

  const onUpdateNotAvailable = () => {
    showMessage('success', t('app.update-not-available-message'))
    appStore.updateCheckingUpdate(false)
    preferenceStore.updateUpdateAvailable(false)
    preferenceStore.updateNewVersion('')
    preferenceStore.updateLastCheckUpdateTime(Date.now())
  }

  const onUpdateAvailable = (event, version, releaseNotes) => {
    showMessage('info', t('app.update-available-message'))
    appStore.updateCheckingUpdate(false)
    preferenceStore.updateUpdateAvailable(true)
    preferenceStore.updateNewVersion(version)
    preferenceStore.updateLastCheckUpdateTime(Date.now())
    preferenceStore.updateReleaseNotes(releaseNotes || '')
  }

  ipcRenderer.once('update-error', onUpdateError)
  ipcRenderer.once('update-not-available', onUpdateNotAvailable)
  ipcRenderer.once('update-available', onUpdateAvailable)

  const timeout = setTimeout(() => {
    console.log('[Lerxu] Update check timed out')
    ipcRenderer.removeListener('update-error', onUpdateError)
    ipcRenderer.removeListener('update-not-available', onUpdateNotAvailable)
    ipcRenderer.removeListener('update-available', onUpdateAvailable)

    showMessage('error', t('app.update-timeout-message') || '更新检查超时，请稍后重试')
    appStore.updateCheckingUpdate(false)
  }, 30000)

  const clearTimeoutListener = () => {
    clearTimeout(timeout)
    console.log('[Lerxu] Update check completed, clearing timeout')
    ipcRenderer.removeListener('update-error', clearTimeoutListener)
    ipcRenderer.removeListener('update-not-available', clearTimeoutListener)
    ipcRenderer.removeListener('update-available', clearTimeoutListener)
  }
  ipcRenderer.once('update-error', clearTimeoutListener)
  ipcRenderer.once('update-not-available', clearTimeoutListener)
  ipcRenderer.once('update-available', clearTimeoutListener)

  console.log('[Lerxu] Sending check for updates command')
  ipcRenderer.send('command', 'application:check-for-updates')
}

function downloadUpdate () {
  if (isDownloadingUpdate.value) return
  preferenceStore.updateIsDownloadingUpdate(true)
  preferenceStore.updateDownloadProgress(0)
  preferenceStore.updateDownloadSize({ total: 0, transferred: 0 })

  showMessage('info', t('app.downloading-new-version'))

  const cleanupListeners = () => {
    ipcRenderer.removeListener('download-progress', onDownloadProgress)
    ipcRenderer.removeListener('update-downloaded', onDownloaded)
    ipcRenderer.removeListener('update-error', onDownloadError)
    ipcRenderer.removeListener('update-cancelled', onDownloadCancelled)
  }

  const onDownloadProgress = (event, progress) => {
    preferenceStore.updateDownloadProgress(Math.round(progress.percent))
    preferenceStore.updateDownloadSize({
      total: progress.total || 0,
      transferred: progress.transferred || 0
    })
  }

  const onDownloaded = () => {
    preferenceStore.updateIsDownloadingUpdate(false)
    preferenceStore.updateUpdateAvailable(false)
    showMessage('success', t('app.update-download-complete-restart'))
    cleanupListeners()
  }

  const onDownloadError = (_event, errMsg) => {
    preferenceStore.updateIsDownloadingUpdate(false)
    const msg = errMsg ? t('app.update-download-failed', { message: errMsg }) : t('app.update-download-failed-network')
    showMessage('error', msg)
    cleanupListeners()
  }

  const onDownloadCancelled = () => {
    preferenceStore.updateIsDownloadingUpdate(false)
    showMessage('info', t('app.update-download-cancelled'))
    cleanupListeners()
  }

  ipcRenderer.on('download-progress', onDownloadProgress)
  ipcRenderer.on('update-downloaded', onDownloaded)
  ipcRenderer.on('update-error', onDownloadError)
  ipcRenderer.on('update-cancelled', onDownloadCancelled)

  console.log('[Lerxu] Sending download update command')
  ipcRenderer.send('command', 'application:download-update')
}

onMounted(async () => {
  try {
    const appConfig = await ipcRenderer.invoke('get-app-config')
    appVersion.value = appConfig.version
  } catch (error) {
    console.error('[Lerxu] Failed to get app version:', error)
  }

  try {
    const updateStatus = await ipcRenderer.invoke('get-update-status')

    if (updateStatus.isChecking) {
      appStore.updateCheckingUpdate(true)
    } else {
      appStore.updateCheckingUpdate(false)
    }

    preferenceStore.updateIsDownloadingUpdate(updateStatus.isDownloading)
    preferenceStore.updateUpdateDownloaded(updateStatus.updateDownloaded)

    if (updateStatus.isDownloading) {
      preferenceStore.updateDownloadProgress(updateStatus.downloadProgress || 0)
      preferenceStore.updateDownloadSize({
        total: updateStatus.downloadTotal || 0,
        transferred: updateStatus.downloadTransferred || 0
      })
      if (updateStatus.newVersion) preferenceStore.updateNewVersion(updateStatus.newVersion)
      if (updateStatus.releaseNotes) preferenceStore.updateReleaseNotes(updateStatus.releaseNotes)
      preferenceStore.updateUpdateAvailable(false)
      preferenceStore.updateLastCheckUpdateTime(Date.now())
    } else if (updateStatus.updateDownloaded) {
      preferenceStore.updateUpdateAvailable(false)
      if (updateStatus.newVersion) preferenceStore.updateNewVersion(updateStatus.newVersion)
      if (updateStatus.releaseNotes) preferenceStore.updateReleaseNotes(updateStatus.releaseNotes)
      preferenceStore.updateLastCheckUpdateTime(Date.now())
    } else {
      const cfg = preferenceStore.config || {}
      const ua = cfg['update-available'] || cfg.updateAvailable || false
      const nv = cfg['new-version'] || cfg.newVersion || ''
      const lct = cfg['last-check-update-time'] || cfg.lastCheckUpdateTime || 0
      const rn = cfg['release-notes'] || cfg.releaseNotes || ''

      if (ua && nv && isVersionNewer(nv, appVersion.value)) {
        preferenceStore.updateUpdateAvailable(ua)
        preferenceStore.updateNewVersion(nv)
        if (lct) preferenceStore.updateLastCheckUpdateTime(lct)
        if (rn) preferenceStore.updateReleaseNotes(rn)
      }
    }
  } catch (error) {
    console.error('[Lerxu] Failed to get update status:', error)
  }

  updateSliderFromDom()

  _updateIpcHandlers = {
    'checking-for-update': () => {
      appStore.updateCheckingUpdate(true)
    },
    'update-available': (event, version, releaseNotes, isPrerelease) => {
      appStore.updateCheckingUpdate(false)
      preferenceStore.updateUpdateAvailable(true)
      preferenceStore.updateUpdateDownloaded(false)
      preferenceStore.updateNewVersion(version)
      preferenceStore.updateUpdateIsPrerelease(!!isPrerelease)
      preferenceStore.updateLastCheckUpdateTime(Date.now())
      preferenceStore.updateReleaseNotes(releaseNotes || '')
    },
    'update-not-available': () => {
      appStore.updateCheckingUpdate(false)
      preferenceStore.updateUpdateAvailable(false)
      preferenceStore.updateUpdateDownloaded(false)
      preferenceStore.updateNewVersion('')
      preferenceStore.updateUpdateIsPrerelease(false)
      preferenceStore.updateLastCheckUpdateTime(Date.now())
    },
    'update-error': () => {
      appStore.updateCheckingUpdate(false)
      preferenceStore.updateIsDownloadingUpdate(false)
      preferenceStore.updateUpdateDownloaded(false)
    },
    'download-start': () => {
      preferenceStore.updateIsDownloadingUpdate(true)
      preferenceStore.updateUpdateDownloaded(false)
      preferenceStore.updateUpdateAvailable(false)
      preferenceStore.updateDownloadProgress(0)
      preferenceStore.updateDownloadSize({ total: 0, transferred: 0 })
    },
    'download-progress': (event, progress) => {
      const percent = Math.round(progress.percent)
      preferenceStore.updateDownloadProgress(percent)
      preferenceStore.updateIsDownloadingUpdate(true)
      preferenceStore.updateDownloadSize({
        total: progress.total || 0,
        transferred: progress.transferred || 0
      })
    },
    'update-downloaded': () => {
      preferenceStore.updateIsDownloadingUpdate(false)
      preferenceStore.updateUpdateDownloaded(true)
      preferenceStore.updateUpdateAvailable(false)
    },
    'update-cancelled': () => {
      preferenceStore.updateIsDownloadingUpdate(false)
      preferenceStore.updateUpdateDownloaded(false)
      preferenceStore.updateDownloadProgress(0)
      preferenceStore.updateDownloadSize({ total: 0, transferred: 0 })
    }
  }
  Object.keys(_updateIpcHandlers).forEach((channel) => {
    ipcRenderer.on(channel, _updateIpcHandlers[channel])
  })
})

onBeforeUnmount(() => {
  if (_updateIpcHandlers) {
    Object.keys(_updateIpcHandlers).forEach((channel) => {
      ipcRenderer.removeListener(channel, _updateIpcHandlers[channel])
    })
    _updateIpcHandlers = null
  }
})

watch(() => props.current, () => {
  nextTick(() => {
    updateSliderFromDom()
  })
})

watch(subnavItems, () => {
  nextTick(() => {
    updateSliderFromDom()
  })
})
</script>

<style lang="scss">
.preference-subnav-ul .subnav-icon {
  height: 18px;
}

.preference-subnav-ul .subnav-icon svg {
  width: 18px;
  height: 18px;
}

.preference-subnav-ul li:not(.subnav-item--basic):not(.subnav-item--advanced) .subnav-icon svg {
  transform: scale(1.12);
  transform-origin: center;
}

.version-item {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid #000;
  border-radius: 12px;
  padding: 8px 12px;
  margin-top: 10px;
  background-color: transparent;
  opacity: 0.5;

  &:hover {
    background-color: transparent;
    border-color: #c6e2ff;
    opacity: 1;
  }

  &.update-available {
    color: #67c23a;
    font-weight: bold;
    border-color: #c2e7b0;
    background-color: transparent;
    opacity: 1;
    animation: pulse-green 1s infinite;

    &:hover {
      background-color: transparent;
      border-color: #a5d6a7;
      opacity: 1;
    }
  }

  &.is-checking {
    cursor: not-allowed;
    opacity: 1;
    animation: pulse 1s infinite;
    border-color: #409eff;
  }

  &.is-checking:hover {
    opacity: 1;
    border-color: #409eff;
    background-color: transparent;
  }

  &.downloading {
    cursor: not-allowed;
    /* 下载进度文字跟随主题文字色：浅色黑色、深色白色（由 .theme-dark 覆盖） */
    color: var(--lc-text-primary, #2c3e50);
    font-weight: bold;
    border-color: #f0c78a;
    background-color: transparent;
    opacity: 1;
    animation: pulse-orange 1s infinite;

    &:hover {
      background-color: transparent;
      border-color: #f0c78a;
      opacity: 1;
    }
  }

  &.is-disabled {
    cursor: not-allowed;
    pointer-events: none;
  }

  &.downloaded {
    cursor: pointer;
    color: #67c23a;
    font-weight: bold;
    border-color: #c2e7b0;
    background-color: rgba(103, 194, 58, 0.1);
    opacity: 1;

    &:hover {
      background-color: rgba(103, 194, 58, 0.15);
      border-color: #67c23a;
    }
  }

  &[disabled] {
    cursor: not-allowed;
  }

  span {
    font-family: monospace;
    display: block;
    text-align: center;
  }

  /* 黑夜模式适配 */
  .theme-dark & {
    border-color: #fff;
    color: #fff;
  }

  .theme-dark &:hover {
    border-color: #c6e2ff;
  }

  .theme-dark &.update-available {
    border-color: #a5d6a7;
  }

  .theme-dark &.update-available:hover {
    border-color: #a5d6a7;
  }

  .theme-dark &.is-checking {
    border-color: #409eff;
  }

  .theme-dark &.is-checking:hover {
    border-color: #409eff;
  }

  .theme-dark &.downloading {
    border-color: #f0c78a;
  }

  .theme-dark &.downloading:hover {
    border-color: #f0c78a;
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.4);
  }
  70% {
    box-shadow: 0 0 0 5px rgba(64, 158, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0);
  }
}

@keyframes pulse-green {
  0% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.4);
  }
  70% {
    box-shadow: 0 0 0 5px rgba(103, 194, 58, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0);
  }
}

@keyframes pulse-orange {
  0% {
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.4);
  }
  70% {
    box-shadow: 0 0 0 5px rgba(230, 162, 60, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0);
  }
}
</style>
