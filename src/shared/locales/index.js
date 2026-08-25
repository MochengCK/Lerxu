export const availableLanguages = [
  {
    value: 'auto',
    label: '跟随系统'
  },
  {
    value: 'en-US',
    label: 'English'
  },
  {
    value: 'zh-CN',
    label: '简体中文'
  },
  {
    value: 'zh-TW',
    label: '繁體中文'
  }
]

const checkLngIsAvailable = (locale) => {
  return availableLanguages.some(lng => lng.value === locale)
}

const getSystemLocale = () => {
  try {
    const { app } = require('@electron/remote')
    return app.getLocale() || 'en-US'
  } catch (e) {
    try {
      const { app } = require('electron')
      return app.getLocale() || 'en-US'
    } catch (e2) {
      try {
        const { app } = require('electron').remote
        return app.getLocale() || 'en-US'
      } catch (e3) {
        return 'en-US'
      }
    }
  }
}

export const getSystemLocaleName = () => {
  const systemLocale = getSystemLocale()
  const matched = availableLanguages.find(lng => lng.value === systemLocale)
  if (matched) {
    return matched.label
  }
  const fallback = availableLanguages.find(lng => lng.value === getLanguage(systemLocale))
  return fallback ? fallback.label : systemLocale
}

export const getLanguage = (locale = 'en-US') => {
  if (locale === 'auto') {
    return getLanguage(getSystemLocale())
  }

  if (checkLngIsAvailable(locale)) {
    return locale
  }

  if (locale.startsWith('en')) {
    return 'en-US'
  }

  if (locale === 'zh-HK') {
    return 'zh-TW'
  }

  if (locale.startsWith('zh')) {
    return 'zh-CN'
  }

  // 默认回退到英文
  return 'en-US'
}
