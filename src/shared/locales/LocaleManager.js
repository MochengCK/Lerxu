import i18next from 'i18next'
import { getLanguage } from '@shared/locales'

export default class LocaleManager {
  constructor (options = {}) {
    this.options = options

    i18next.init({
      fallbackLng: 'en-US',
      resources: options.resources
    })
  }

  changeLanguage (lng) {
    return i18next.changeLanguage(lng)
  }

  changeLanguageByLocale (locale) {
    const lng = getLanguage(locale)
    return this.changeLanguage(lng)
  }

  getI18n () {
    return i18next
  }

  getCurrentLanguage () {
    return i18next.language || 'en-US'
  }

  /**
   * Get all messages in vue-i18n format (flattened).
   * @returns {Object} { locale: { ...translations } }
   */
  getAllMessages () {
    const result = {}
    const resources = (this.options && this.options.resources) || {}
    for (const [locale, resource] of Object.entries(resources)) {
      result[locale] = (resource && resource.translation) || resource
    }
    return result
  }
}
