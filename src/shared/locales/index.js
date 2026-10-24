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
  // 主进程在创建窗口前把系统语言写进环境变量：渲染进程直接读，不必为
  // `app.getLocale()` 付一次同步 IPC（@electron/remote 已从项目移除）。
  const fromEnv = typeof process !== 'undefined' && process.env && process.env.LERXU_LOCALE
  if (fromEnv) {
    return fromEnv
  }
  // 环境缺失（单测 / 浏览器直开）时用浏览器语言；Chromium 的 navigator.language
  // 与 Electron 的 app.getLocale() 同源（都来自系统区域设置）
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language
    }
  } catch (_) { }
  return 'en-US'
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

  // macOS 给的是 zh-Hant-TW / zh-Hans-CN 这种带书写系统的形式；
  // 只按 startsWith('zh') 一律落 zh-CN 会把繁体用户显示成简体。
  if (/^zh[-_](hant|tw|hk|mo)/i.test(locale) || /hant/i.test(locale)) {
    return 'zh-TW'
  }

  if (locale.startsWith('zh')) {
    return 'zh-CN'
  }

  // 默认回退到英文
  return 'en-US'
}
