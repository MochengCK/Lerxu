import appLocaleEnUS from '@shared/locales/en-US'
import appLocaleZhCN from '@shared/locales/zh-CN'
import appLocaleZhTW from '@shared/locales/zh-TW'

/**
 * Application locale resources.
 *
 * Element UI locale imports have been removed. Element Plus locale management
 * is now handled separately via ElConfigProvider in App.vue and the
 * elementPlusLocaleMap in src/renderer/plugins/i18n.js.
 *
 * The structure is kept as { locale: { translation: { ... } } } for backward
 * compatibility with LocaleManager (i18next). The vue-i18n plugin
 * (src/renderer/plugins/i18n.js) flattens this to { locale: { ... } }.
 */
const resources = {
  'en-US': {
    translation: {
      ...appLocaleEnUS
    }
  },
  'zh-CN': {
    translation: {
      ...appLocaleZhCN
    }
  },
  'zh-TW': {
    translation: {
      ...appLocaleZhTW
    }
  }
}

export default resources
