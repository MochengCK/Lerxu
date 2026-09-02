/**
 * 偏好设置窗口独立入口（preference.html）。
 * 与 pages/index/main.js 完全分离：不注册/不加载主窗口专属组件
 * （EngineClient、Ipc、DynamicTray/Dock、Task 系列、commands 快捷键等），
 * 使该 bundle 保持轻量，窗口关闭即销毁后重开也能快速加载。
 * 全局标记 __LERXU_PREFERENCE_BUNDLE__ 供 App.vue 等共享组件
 * 跳过主窗口专属的静态依赖（如 task store 的直连引入）。
 */
window.__LERXU_PREFERENCE_BUNDLE__ = true

import { createApp, defineAsyncComponent } from 'vue'
import { createPinia } from 'pinia'
import { ElLoading, ElMessage } from 'element-plus'
// Element Plus 组件按需引入由 unplugin-vue-components 自动完成；
// JS 中直接调用的 API（ElMessage/ElLoading）需手动引入样式。
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/loading/style/css'

import App from '../index/App.vue'
import router from '@/router/preference'
import { getLocaleManager } from '@/components/Locale'
import { getLanguage } from '@shared/locales'
import Icon from '@/components/Icons/Icon.vue'
import ExtendSelect from '@/components/ExtendSelect/ExtendSelect.vue'
import HoverTip from '@/components/HoverTip/HoverTip.vue'
import TitleBar from '@/components/Native/TitleBar'
import SegmentedSlider from '@/components/SegmentedSlider/SegmentedSlider'
import SelectDirectory from '@/components/Native/SelectDirectory'
import ShowInFolder from '@/components/Native/ShowInFolder'
import HistoryDirectory from '@/components/Preference/HistoryDirectory'
import ThemeSwitcher from '@/components/Preference/ThemeSwitcher'
import { createMsg } from '@/components/Msg'
import { setupIcons } from '@/plugins/icons'

// Lab 页模板用 <mo-browser>（kebab 标签，需全局注册）；
// 内嵌浏览器组件较重，异步化，仅打开 Lab 分类时才加载。
const Browser = defineAsyncComponent(() => import('@/components/Browser/Browser'))

import { usePreferenceStore, useAppStore } from '@/store'

import i18n from '@/plugins/i18n'

import '@/components/Theme/Index.scss'

// Create a single Pinia instance shared across the app lifecycle
const pinia = createPinia()

function init (config) {
  const app = createApp(App)

  // Pinia state management (reuse the instance created at module load)
  app.use(pinia)

  // Router（偏好设置专属路由，只含偏好设置树）
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

  // Message service (replaces Vue.prototype.$msg / $message)
  const msg = createMsg(ElMessage, { showClose: true })
  app.config.globalProperties.$msg = msg
  app.config.globalProperties.$message = msg

  // App.vue 模板引用了主窗口专属组件 mo-engine-client / mo-ipc /
  // mo-dynamic-tray / mo-dynamic-dock，它们均带 v-if="!isPreferenceWindow"
  // 守卫，偏好窗口不会实际渲染；但渲染函数仍会执行 _resolveComponent，
  // 不注册会产生 "Failed to resolve component" 告警，因此注册空壳组件。
  const NativeStub = () => null
  app.component('mo-engine-client', NativeStub)
  app.component('mo-ipc', NativeStub)
  app.component('mo-dynamic-tray', NativeStub)
  app.component('mo-dynamic-dock', NativeStub)

  // Global component registration（仅偏好设置组件树用到的）
  app.component('mo-icon', Icon)
  app.component('mo-extend-select', ExtendSelect)
  app.component('mo-hover-tip', HoverTip)
  app.component('mo-title-bar', TitleBar)
  app.component('mo-segmented-slider', SegmentedSlider)
  app.component('mo-select-directory', SelectDirectory)
  app.component('mo-show-in-folder', ShowInFolder)
  app.component('mo-history-directory', HistoryDirectory)
  app.component('mo-theme-switcher', ThemeSwitcher)
  app.component('mo-browser', Browser)

  // Register all Element Plus icons globally
  setupIcons(app)

  // Loading overlay
  const loading = ElLoading.service({
    fullscreen: true,
    background: 'rgba(0, 0, 0, 0.1)'
  })

  // Mount app
  global.app = app.mount('#root')

  // Initialize currentPage after router is ready
  router.isReady().then(() => {
    try {
      const appStore = useAppStore()
      appStore.updateCurrentPage('/preference')
    } catch (e) {
      console.warn('[Lerxu] Failed to update current page:', e)
    }
  })

  setTimeout(() => {
    loading.close()
  }, 400)
}

// Bootstrap: fetch preference using the shared Pinia instance,
// then init the app with the fetched config.
const preferenceStore = usePreferenceStore(pinia)
preferenceStore.fetchPreference()
  .then((config) => {
    console.info('[Lerxu] load preference:', config)
    init(config)
  })
  .catch((err) => {
    alert(err)
  })
