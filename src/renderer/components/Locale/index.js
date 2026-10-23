/**
 * 渲染进程的语言管理器。
 *
 * 以前这里复用 `@shared/locales/LocaleManager`，而它是基于 **i18next** 的：
 * 渲染层只是为了「记住当前语言 + 给命令面板提供 t()」，真正的翻译与插值
 * 一直由 vue-i18n 负责 —— 等于同一件事背了两套 i18n 运行时（i18next 单是
 * 打进包就 57KB，还要在启动时 init 一遍）。
 *
 * 现在渲染层只保留一个薄封装：语言状态交给 vue-i18n，`getI18n()` 返回一个
 * 兼容 i18next 形状的 `{ t }`（命令面板在用）。主进程继续用它自己的
 * LocaleManager（menus / tray 仍是 i18next，属外部依赖、不进渲染包）。
 */
import i18n from '@/plugins/i18n'
import { getLanguage } from '@shared/locales'

class RendererLocaleManager {
  constructor () {
    this.current = i18n.global.locale.value || 'en-US'
  }

  changeLanguage (lng) {
    const next = lng || 'en-US'
    this.current = next
    if (i18n.global.locale.value !== next) {
      // composition 模式下 locale 是 computed ref，必须走 .value
      i18n.global.locale.value = next
    }
    return Promise.resolve(next)
  }

  changeLanguageByLocale (locale) {
    return this.changeLanguage(getLanguage(locale))
  }

  getCurrentLanguage () {
    return i18n.global.locale.value || this.current || 'en-US'
  }

  /** 兼容旧调用方（命令面板）：只用到 t() */
  getI18n () {
    return {
      // 命令面板会把 err.message 直接丢进来（可能是普通错误文本，不是 key）。
      // 旧实现（i18next）对缺失 key 原样返回；vue-i18n 会额外打一条 missing 警告，
      // 所以先用 te() 判断，行为与旧实现一致且不刷日志。
      t: (key, ...args) => (i18n.global.te(key) ? i18n.global.t(key, ...args) : key),
      get language () {
        return i18n.global.locale.value
      }
    }
  }
}

let localeManager = null

export function getLocaleManager () {
  if (!localeManager) {
    localeManager = new RendererLocaleManager()
  }
  return localeManager
}
