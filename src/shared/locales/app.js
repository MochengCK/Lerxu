import appLocaleEnUS from '@shared/locales/en-US'
import appLocaleZhCN from '@shared/locales/zh-CN'
import appLocaleZhTW from '@shared/locales/zh-TW'

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
