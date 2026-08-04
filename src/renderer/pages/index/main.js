import is from 'electron-is'
import Vue from 'vue'
import VueI18Next from '@panter/vue-i18next'
import { sync } from 'vuex-router-sync'
import Element, { Loading, Message } from 'element-ui'

import App from './App'
import router from '@/router'
import store from '@/store'
import { getLocaleManager } from '@/components/Locale'
import Icon from '@/components/Icons/Icon'
import Msg from '@/components/Msg'
import { commands } from '@/components/CommandManager/instance'

import '@/components/Theme/Index.scss'

function init (config, options = {}) {
  const { isPreferenceWindow } = options
  if (is.renderer()) {
    Vue.use(require('vue-electron'))
  }

  Vue.config.productionTip = false

  const { locale } = config
  const localeManager = getLocaleManager()
  localeManager.changeLanguageByLocale(locale)

  Vue.use(VueI18Next)
  const i18n = new VueI18Next(localeManager.getI18n())
  Vue.use(Element, {
    size: 'mini',
    i18n: (key, value) => i18n.t(key, value)
  })
  Vue.use(Msg, Message, {
    showClose: true
  })
  Vue.component('mo-icon', Icon)

  const loading = Loading.service({
    fullscreen: true,
    background: 'rgba(0, 0, 0, 0.1)'
  })

  sync(store, router)

  /* eslint-disable no-new */
  global.app = new Vue({
    components: { App },
    router,
    store,
    i18n,
    template: '<App/>'
  }).$mount('#app')

  // Initialize currentPage after app mount
  router.isReady = router.isReady || Promise.resolve()
  router.isReady.then(() => {
    const currentPath = router.currentRoute.path
    let page = '/task'

    if (currentPath.startsWith('/preference')) {
      page = '/preference'
    }

    store.dispatch('app/updateCurrentPage', page)
  })

  if (!isPreferenceWindow) {
    global.app.commands = commands
    require('./commands')
  }

  setTimeout(() => {
    loading.close()
  }, 400)
}

const isPreferenceWindow = typeof window !== 'undefined' &&
  window.location &&
  window.location.hash &&
  window.location.hash.startsWith('#/preference-window')

store.dispatch('preference/fetchPreference')
  .then((config) => {
    console.info('[LinkCore] load preference:', config)
    if (!isPreferenceWindow) {
      // Initialize task view mode from preferences
      store.dispatch('task/initializeViewMode', config)
      store.dispatch('task/initializeFilterDate', config)
    }
    init(config, { isPreferenceWindow })
  })
  .catch((err) => {
    alert(err)
  })
