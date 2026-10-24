import { getLanguage } from '@shared/locales'

/**
 * 主进程的多语言（菜单 / 托盘 / 引擎错误提示 / 独立进度窗文案）。
 *
 * 以前这里挂的是 **i18next**：主进程只用到一个 `t(key)`（外加一处 `{{var}}` 插值），
 * 却要背 700KB+ 的运行时与一套异步初始化（`init()` / `changeLanguage()` 都是
 * Promise，调用点还得小心竞态）。渲染层早已换成 vue-i18n，这里没必要再留第二套
 * i18n 引擎 —— 直接按 i18next 的语义做一次查表：
 *
 *   · key 是 `命名空间.字段` 形式（`'app.system-error-message'`）：语言资源按
 *     命名空间嵌套（`translation.app['system-error-message']`）。查表先试**完整
 *     字面量 key**（兼容历史上把点写进 key 的写法），再按 `.` 逐层下钻
 *     ——与 i18next 打开 `ignoreJSONStructure` 时的行为一致
 *   · 当前语言缺 key 时回退 `en-US`，再缺就原样返回 key（i18next 同样如此）
 *   · 支持 `t(key, { name })` 形式的 `{{name}}` / `{{ name }}` 插值
 *
 * 有意不做 i18next 的 HTML 转义（`escapeValue` 默认 true）：这些文案全部进
 * 原生菜单 / 对话框，不做转义才能把带 `&`、`'` 的路径正确显示出来。
 */

const FALLBACK_LANGUAGE = 'en-US'
const INTERPOLATE_RE = /\{\{\s*([\w.]+)\s*\}\}/g

const tableOf = (resources, language) => {
  const entry = resources && resources[language]
  if (!entry) {
    return null
  }
  return entry.translation || entry
}

/** 先按字面量 key 找，再按 `.` 逐层下钻；返回 undefined 表示没有 */
const lookup = (table, name) => {
  if (!table) {
    return undefined
  }
  if (Object.prototype.hasOwnProperty.call(table, name)) {
    return table[name]
  }
  const parts = name.split('.')
  let cursor = table
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, part)) {
      return undefined
    }
    cursor = cursor[part]
  }
  return cursor
}

export default class LocaleManager {
  constructor (options = {}) {
    this.options = options
    this.resources = (options && options.resources) || {}
    this.language = FALLBACK_LANGUAGE

    // 兼容旧的 `getI18n().t(...)` 调用点
    const self = this
    this.i18n = {
      t: (key, vars) => self.t(key, vars),
      get language () {
        return self.language
      }
    }
  }

  t (key, vars) {
    if (key == null) {
      return ''
    }
    const name = `${key}`
    let text = lookup(tableOf(this.resources, this.language), name)
    if (typeof text !== 'string') {
      text = lookup(tableOf(this.resources, FALLBACK_LANGUAGE), name)
    }
    if (typeof text !== 'string') {
      // 与 i18next 一致：缺失（或命中的是命名空间对象）时原样返回 key
      return name
    }
    if (!vars || typeof vars !== 'object') {
      return text
    }
    return text.replace(INTERPOLATE_RE, (match, varName) => (
      Object.prototype.hasOwnProperty.call(vars, varName) ? `${vars[varName]}` : match
    ))
  }

  changeLanguage (lng) {
    this.language = lng || FALLBACK_LANGUAGE
    return Promise.resolve(this.language)
  }

  changeLanguageByLocale (locale) {
    return this.changeLanguage(getLanguage(locale))
  }

  getI18n () {
    return this.i18n
  }

  getCurrentLanguage () {
    return this.language || FALLBACK_LANGUAGE
  }

  /**
   * 以 vue-i18n 需要的格式返回全部文案（扁平 key）。
   * @returns {Object} { locale: { ...translations } }
   */
  getAllMessages () {
    const result = {}
    const resources = this.resources || {}
    for (const [locale, resource] of Object.entries(resources)) {
      result[locale] = (resource && resource.translation) || resource
    }
    return result
  }
}
