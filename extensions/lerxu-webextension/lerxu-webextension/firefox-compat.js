/**
 * firefox-compat.js — 浏览器 API 兼容层（Chromium / Firefox 通用）
 * ================================================================
 *
 * 加载顺序要求：必须是 manifest 中 background / content_scripts 的**第一个**脚本
 * （Chrome 与 Firefox 两份 manifest 都已如此声明）。
 *
 * 扩展主体统一使用 `chrome.*` + 回调风格（Chromium 原生形态）。两个平台的差异：
 *
 * | 平台     | chrome.*                       | browser.* |
 * | -------- | ------------------------------ | --------- |
 * | Chromium | 原生（回调风格）               | 不提供    |
 * | Firefox  | 提供（browser.* 的回调包装）   | 原生（Promise 风格） |
 *
 * 因此 Firefox 上主体代码可直接运行；本层额外承担三件事：
 *
 * 1. **命名空间兜底**：若某个环境只提供 `browser.*` 而没有 `chrome.*`（Firefox
 *    衍生浏览器、或 Mozilla 未来收紧 `chrome` 别名），用 Proxy 把 Promise 风格的
 *    `browser.*` 包装成回调风格的 `chrome.*`，包括 `chrome.runtime.lastError`
 *    语义（包装调用失败时置位、成功时清空），主体代码无需改动。
 * 2. **平台标识**：`globalThis.LERXU_ENV` 给出 isFirefox / hasChromeNamespace
 *    与能力探测结果，避免各调用点重复写平台判断。
 * 3. **能力探测**：`downloads.setUiOptions`（下载气泡显隐）与
 *    `downloads.onDeterminingFilename` 是 Chromium 专有 API，Firefox 不提供。
 *    这里集中探测一次，调用点据此走降级分支。
 *
 * 注意：本文件必须幂等（content script 可能被重复注入），并保持零副作用——
 * 只做命名空间整理，不改动任何 API 的既有行为。
 */

(function () {
  'use strict'

  const root = (typeof globalThis !== 'undefined')
    ? globalThis
    : (typeof self !== 'undefined' ? self : null)
  if (!root || root.__lerxuCompatInstalled) {
    return
  }

  /**
   * 事件对象（runtime.onMessage、downloads.onCreated 等）必须原样保留：
   * 其 addListener/removeListener 是注册入口，包装会破坏事件注册。
   */
  const isEventObject = (value) => !!value && typeof value === 'object' &&
    (typeof value.addListener === 'function' || typeof value.removeListener === 'function')

  /**
   * 把 Promise 风格 API 包装成回调风格（chrome.* 语义）。
   *
   * - 最后一个参数是函数 → 回调风格：调用后以结果回调，失败时置位 lastError
   *   并回调 undefined（与 Chromium 的 chrome.* 行为一致）
   * - 最后一个参数不是函数 → 原样返回 Promise（保留 browser.* 用法）
   * - 事件对象与普通值原样返回；对象递归包装（runtime/storage/downloads 等）
   *
   * @param {object} promiseApi   Promise 风格命名空间（如 browser）
   * @param {{ value: any }} lastErrorBox  lastError 状态容器（跨调用共享）
   * @returns {object} 回调风格命名空间
   */
  const createChromeCompatApi = (promiseApi, lastErrorBox) => {
    const runtimeRoot = promiseApi && promiseApi.runtime ? promiseApi.runtime : null
    const cache = new WeakMap()

    const wrapNode = (node) => {
      if (!node || typeof node !== 'object') return node
      if (isEventObject(node)) return node
      const cached = cache.get(node)
      if (cached) return cached

      const isRuntimeRoot = node === runtimeRoot
      const proxy = new Proxy(node, {
        get (target, prop) {
          // chrome.runtime.lastError：最近一次回调调用的错误（无错误为 undefined）
          if (isRuntimeRoot && prop === 'lastError') {
            return lastErrorBox.value
          }
          const value = target[prop]
          if (typeof value === 'function') {
            return function (...args) {
              const maybeCallback = args.length > 0 ? args[args.length - 1] : undefined
              if (typeof maybeCallback !== 'function') {
                // 无回调：保持 Promise 风格
                return value.apply(target, args)
              }
              const callback = args.pop()
              lastErrorBox.value = undefined
              let result
              try {
                result = value.apply(target, args)
              } catch (err) {
                lastErrorBox.value = { message: (err && err.message) || String(err) }
                try { callback(undefined) } catch (e) {}
                return undefined
              }
              if (result && typeof result.then === 'function') {
                result.then(
                  (resolved) => {
                    lastErrorBox.value = undefined
                    try { callback(resolved) } catch (e) {}
                  },
                  (err) => {
                    lastErrorBox.value = { message: (err && err.message) || String(err) }
                    try { callback(undefined) } catch (e) {}
                  }
                )
                return undefined
              }
              lastErrorBox.value = undefined
              try { callback(result) } catch (e) {}
              return undefined
            }
          }
          if (value && typeof value === 'object') {
            return wrapNode(value)
          }
          return value
        },
        set (target, prop, value) {
          // 兼容 chrome.runtime.lastError = undefined 这类显式清空写法
          if (isRuntimeRoot && prop === 'lastError') {
            lastErrorBox.value = value
            return true
          }
          target[prop] = value
          return true
        },
        has (target, prop) {
          if (isRuntimeRoot && prop === 'lastError') return true
          return prop in target
        }
      })
      cache.set(node, proxy)
      return proxy
    }

    return wrapNode(promiseApi)
  }

  const chromeApi = root.chrome
  const browserApi = root.browser
  const hasNativeChrome = !!(chromeApi && chromeApi.runtime && chromeApi.runtime.id !== undefined)
  const hasBrowserApi = !!(browserApi && browserApi.runtime)

  const lastErrorBox = { value: undefined }

  if (!hasNativeChrome && hasBrowserApi) {
    // 仅有 browser.*：构造回调风格的 chrome.* 供主体代码使用
    root.chrome = createChromeCompatApi(browserApi, lastErrorBox)
  }

  const api = root.chrome || {}
  const downloads = api.downloads || {}

  /**
   * Firefox 检测：`runtime.getBrowserInfo` 为 Firefox 独有（Chromium 不提供）。
   * 在 Firefox 上通过 chrome.* 访问同样命中（chrome 是 browser 的回调别名）。
   */
  const isFirefox = !!(api.runtime && typeof api.runtime.getBrowserInfo === 'function')

  root.LERXU_ENV = {
    /** 是否运行在 Firefox（Gecko）内核上 */
    isFirefox,
    /** 是否原生提供 chrome.*（Chromium 与 Firefox 均为 true；兜底包装时为 false） */
    hasChromeNamespace: hasNativeChrome,
    /** 原生的 browser.* 是否存在（Firefox 为 true） */
    hasBrowserNamespace: hasBrowserApi,
    /**
     * Chromium 专有 API 能力探测：
     * - downloadBubbleUi：downloads.setUiOptions（按决策显隐下载气泡）
     * - onDeterminingFilename：写盘/另存为之前介入的事件
     * Firefox 两者皆无 → 接管流程走 downloads.onCreated 路径（功能等价，
     * 只是接管发生在下载项创建之后，浏览器侧可能短暂出现条目）。
     *
     * 注意：`downloads` 仅对扩展页面（后台页 / popup）可见——content script
     * 无权访问该 API，其上下文中的这两个值恒为 false，判断时请勿依赖。
     */
    capabilities: {
      downloadBubbleUi: typeof downloads.setUiOptions === 'function',
      onDeterminingFilename: !!downloads.onDeterminingFilename
    }
  }

  root.__lerxuCompatInstalled = true
  // 供诊断脚本与构建期检查复用（不参与运行时逻辑）
  root.__lerxuCreateChromeCompatApi = createChromeCompatApi
})()
