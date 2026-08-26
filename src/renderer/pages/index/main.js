import { createApp, defineAsyncComponent } from 'vue'
import { createPinia } from 'pinia'
import { ElLoading, ElMessage } from 'element-plus'
// 说明：Element Plus 组件按需引入由 unplugin-vue-components 的
// ElementPlusResolver 自动完成（含组件样式）；JS 中直接调用的 API
// （ElMessage/ElLoading）在此手动 import，并显式引入其样式。
// 全局 size 配置由 App.vue 的 el-config-provider 提供。
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/loading/style/css'

import App from './App.vue'
import router from '@/router'
import { getLocaleManager } from '@/components/Locale'
import { getLanguage } from '@shared/locales'
import Icon from '@/components/Icons/Icon.vue'
import ExtendSelect from '@/components/ExtendSelect/ExtendSelect.vue'
import HoverTip from '@/components/HoverTip/HoverTip.vue'
import TitleBar from '@/components/Native/TitleBar'
import EngineClient from '@/components/Native/EngineClient'
import Ipc from '@/components/Native/Ipc'
import DynamicTray from '@/components/Native/DynamicTray'
import SegmentedSlider from '@/components/SegmentedSlider/SegmentedSlider'
import TaskSubnav from '@/components/Subnav/TaskSubnav'
import TaskActions from '@/components/Task/TaskActions'
import SelectDirectory from '@/components/Native/SelectDirectory'
import ShowInFolder from '@/components/Native/ShowInFolder'
import DragSelect from '@/components/DragSelect/DragSelect'
import HistoryDirectory from '@/components/Preference/HistoryDirectory'
import ThemeSwitcher from '@/components/Preference/ThemeSwitcher'
import TaskItem from '@/components/Task/TaskItem'
import TaskItemActions from '@/components/Task/TaskItemActions'
import TaskList from '@/components/Task/TaskList'
import TaskProgress from '@/components/Task/TaskProgress'
import TaskProgressInfo from '@/components/Task/TaskProgressInfo'
import TaskStatus from '@/components/Task/TaskStatus'
import CustomDatePicker from '@/components/Task/DatePicker'
import PreferenceSubnav from '@/components/Subnav/PreferenceSubnav'
import { createMsg } from '@/components/Msg'
import { commands } from '@/components/CommandManager/instance'
import { setupIcons } from '@/plugins/icons'

// 低频组件异步注册（首次渲染时才加载，避免全部打进主 chunk）：
// mo-add-task / mo-task-detail / mo-dragger 由 Main.vue 本地 defineAsyncComponent 提供，
// mo-browser 由 Lab.vue 本地 import 提供，
// 这里保留仍有全局标签使用点的异步注册。
const SelectTorrent = defineAsyncComponent(() => import('@/components/Task/SelectTorrent'))
const TaskGeneral = defineAsyncComponent(() => import('@/components/TaskDetail/TaskGeneral'))
const TaskConnections = defineAsyncComponent(() => import('@/components/TaskDetail/TaskConnections'))
const TaskFiles = defineAsyncComponent(() => import('@/components/TaskDetail/TaskFiles'))
const TaskTrackers = defineAsyncComponent(() => import('@/components/TaskDetail/TaskTrackers'))
// TaskActivity 模板用 <mo-task-graphic>（kebab 解析为 MoTaskGraphic，与本地 import 的
// TaskGraphic 变量名不匹配），必须保留全局注册；异步化避免进主 chunk
const TaskGraphic = defineAsyncComponent(() => import('@/components/TaskGraphic/TaskGraphic'))
// Lab.vue 模板用 <mo-browser>（解析为 MoBrowser，本地 import 的 Browser 不匹配），同样保留全局异步注册
const Browser = defineAsyncComponent(() => import('@/components/Browser/Browser'))

import { usePreferenceStore } from '@/store'
import { useTaskStore } from '@/store'
import { useAppStore } from '@/store'

import i18n from '@/plugins/i18n'

import '@/components/Theme/Index.scss'

// Create a single Pinia instance shared across the app lifecycle
const pinia = createPinia()

const isPreferenceWindow = typeof window !== 'undefined' &&
  window.location &&
  window.location.hash &&
  window.location.hash.startsWith('#/preference-window')

function init (config, options = {}) {
  const { isPreferenceWindow } = options

  const app = createApp(App)

  // Pinia state management (reuse the instance created at module load)
  app.use(pinia)

  // Router
  app.use(router)

  // Internationalization (vue-i18n composition mode)
  // 注意：composition 模式下 i18n.global.locale 是 computed ref，
  // 必须通过 .value 赋值，直接 i18n.global.locale = xxx 不会生效。
  const localeManager = getLocaleManager()
  const initialLng = getLanguage(config.locale || 'en-US')
  localeManager.changeLanguageByLocale(initialLng)
  // Sync locale to vue-i18n（不依赖 i18next 的异步 changeLanguage 结果，避免竞态）
  i18n.global.locale.value = initialLng
  app.use(i18n)

  // Element Plus 组件按需导入（unplugin-vue-components），
  // 全局默认尺寸由 App.vue 的 el-config-provider 提供
  // Message service (replaces Vue.prototype.$msg / $message)
  const msg = createMsg(ElMessage, { showClose: true })
  app.config.globalProperties.$msg = msg
  app.config.globalProperties.$message = msg

  // Global component registration
  app.component('mo-icon', Icon)
  app.component('mo-extend-select', ExtendSelect)
  app.component('mo-hover-tip', HoverTip)
  app.component('mo-title-bar', TitleBar)
  app.component('mo-engine-client', EngineClient)
  app.component('mo-ipc', Ipc)
  app.component('mo-dynamic-tray', DynamicTray)
  app.component('mo-segmented-slider', SegmentedSlider)
  app.component('mo-task-subnav', TaskSubnav)
  app.component('mo-task-actions', TaskActions)
  app.component('mo-select-torrent', SelectTorrent)
  app.component('mo-select-directory', SelectDirectory)
  app.component('mo-show-in-folder', ShowInFolder)
  app.component('mo-drag-select', DragSelect)
  app.component('mo-history-directory', HistoryDirectory)
  app.component('mo-theme-switcher', ThemeSwitcher)
  app.component('mo-task-item', TaskItem)
  app.component('mo-task-item-actions', TaskItemActions)
  app.component('mo-task-list', TaskList)
  app.component('mo-task-progress', TaskProgress)
  app.component('mo-task-progress-info', TaskProgressInfo)
  app.component('mo-task-status', TaskStatus)
  app.component('mo-task-graphic', TaskGraphic)
  app.component('mo-browser', Browser)
  app.component('mo-task-connections', TaskConnections)
  app.component('mo-task-files', TaskFiles)
  app.component('mo-task-general', TaskGeneral)
  app.component('mo-task-trackers', TaskTrackers)
  app.component('mo-custom-date-picker', CustomDatePicker)
  app.component('mo-preference-subnav', PreferenceSubnav)

  // Register all Element Plus icons globally
  setupIcons(app)

  // Loading overlay
  const loading = ElLoading.service({
    fullscreen: true,
    background: 'rgba(0, 0, 0, 0.1)'
  })

  // Mount app (vuex-router-sync not needed - Pinia + vue-router 4 work natively)
  global.app = app.mount('#root')

  // Initialize currentPage after router is ready
  router.isReady().then(() => {
    const currentPath = router.currentRoute.value.path
    let page = '/task'

    if (currentPath.startsWith('/preference')) {
      page = '/preference'
    }

    try {
      const appStore = useAppStore()
      appStore.updateCurrentPage(page)
    } catch (e) {
      console.warn('[Lerxu] Failed to update current page:', e)
    }
  })

  if (!isPreferenceWindow) {
    global.app.commands = commands
    import('./commands')
  }

  setTimeout(() => {
    loading.close()
  }, 400)
}

// Bootstrap: fetch preference using the shared Pinia instance,
// then init the app with the fetched config.
// The Pinia stores retain their state from the fetch into the mounted app.
const preferenceStore = usePreferenceStore(pinia)
preferenceStore.fetchPreference()
  .then((config) => {
    console.info('[Lerxu] load preference:', config)
    if (!isPreferenceWindow) {
      const taskStore = useTaskStore(pinia)
      taskStore.initializeViewMode(config)
      taskStore.initializeFilterDate(config)
    }
    init(config, { isPreferenceWindow })
  })
  .catch((err) => {
    alert(err)
  })
