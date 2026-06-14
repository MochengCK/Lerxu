export const availableLanguages = [
  {
    value: 'auto',
    label: '跟随系统'
  },
  {
    value: 'de',
    label: 'Deutsch'
  },
  {
    value: 'en-US',
    label: 'English'
  },
  {
    value: 'es',
    label: 'Español'
  },
  {
    value: 'fr',
    label: 'Français'
  },
  {
    value: 'it',
    label: 'Italiano'
  },
  {
    value: 'ja',
    label: '日本語'
  },
  {
    value: 'ko',
    label: '한국어'
  },
  {
    value: 'pt-BR',
    label: 'Português (Brasil)'
  },
  {
    value: 'ru',
    label: 'Русский'
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

  if (locale.startsWith('de')) {
    return 'de'
  }

  if (locale.startsWith('en')) {
    return 'en-US'
  }

  if (locale.startsWith('es')) {
    return 'es'
  }

  if (locale.startsWith('fr')) {
    return 'fr'
  }

  if (locale.startsWith('it')) {
    return 'it'
  }

  if (locale.startsWith('pt')) {
    return 'pt-BR'
  }

  if (locale === 'zh-HK') {
    return 'zh-TW'
  }

  if (locale.startsWith('zh')) {
    return 'zh-CN'
  }
}
