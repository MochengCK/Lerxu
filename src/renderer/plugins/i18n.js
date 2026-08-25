import { createI18n } from 'vue-i18n'
import resources from '@shared/locales/all'

/**
 * Recursively convert i18next-style {{var}} interpolation to vue-i18n {var} format.
 * i18next uses {{var}} (double braces), vue-i18n v9 legacy mode uses {var} (single braces).
 *
 * Also converts i18next plural suffixes (_one, _other, etc.) — but our locale files
 * don't use i18next plurals, so we only need to handle the brace conversion.
 *
 * @param {*} obj - messages object or string
 * @returns {*} converted object or string
 */
function convertInterpolation (obj) {
  if (typeof obj === 'string') {
    // Replace {{var}} with {var}, but not {{{var}}} or other edge cases
    return obj.replace(/\{\{(\w+)\}\}/g, '{$1}')
  }
  if (Array.isArray(obj)) {
    return obj.map(convertInterpolation)
  }
  if (obj && typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertInterpolation(value)
    }
    return result
  }
  return obj
}

/**
 * Convert i18next-style resources to vue-i18n messages format.
 *
 * i18next: { 'zh-CN': { translation: { ... } } }
 * vue-i18n: { 'zh-CN': { ... } }
 *
 * Also converts {{var}} interpolation to {var} for vue-i18n compatibility.
 */
const messages = {}
for (const [locale, resource] of Object.entries(resources)) {
  const raw = (resource && resource.translation) || resource
  messages[locale] = convertInterpolation(raw)
}

// Provide short-code aliases (e.g. 'zh' for 'zh-CN') so vue-i18n's locale
// fallback resolution doesn't emit "Not found 'key' in 'zh' locale" warnings.
// vue-i18n strips the region subtag (zh-CN → zh) when searching for keys.
if (messages['zh-CN'] && !messages['zh']) {
  messages['zh'] = messages['zh-CN']
}
if (messages['zh-TW'] && !messages['zh-TW']) {
  // already present, no-op
}
if (messages['en-US'] && !messages['en']) {
  messages['en'] = messages['en-US']
}

const i18n = createI18n({
  legacy: false, // Composition API mode; all components use `const { t } = i18n.global`
  locale: 'en-US',
  fallbackLocale: 'en-US',
  messages
})

export default i18n

/**
 * Map between app locale identifiers and Element Plus locale identifiers.
 * App locales use i18next convention (e.g. 'en-US', 'zh-CN').
 * Element Plus locales use a slightly different path convention.
 */
export const elementPlusLocaleMap = {
  'en-US': () => import('element-plus/es/locale/lang/en'),
  'zh-CN': () => import('element-plus/es/locale/lang/zh-cn'),
  'zh-TW': () => import('element-plus/es/locale/lang/zh-tw')
}
