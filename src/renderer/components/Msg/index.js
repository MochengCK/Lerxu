import { ElMessage } from 'element-plus'

const instances = []
const maxLength = 5

/**
 * Bind onClick precisely to the message instance's own DOM.
 *
 * Element Plus ElMessage returns a handler instance that exposes
 * a `close()` method. The DOM node is accessible via the handler's
 * internal `proxy?.$el` or by querying `.el-message` as a fallback.
 */
const bindClickToMessage = (handler, arg) => {
  if (typeof arg.onClick !== 'function' || typeof document === 'undefined') {
    return
  }

  let tried = 0
  const attach = () => {
    try {
      // Element Plus message handler exposes the DOM via proxy?.$el or directly
      let el = null
      if (handler) {
        // Element Plus MessageHandler is a component instance
        el = (handler.proxy && handler.proxy.$el && handler.proxy.$el.isConnected)
          ? handler.proxy.$el
          : (handler.$el && handler.$el.isConnected ? handler.$el : null)
      }
      if (!el) {
        // Fallback: grab the last .el-message in the DOM
        const list = document.querySelectorAll('.el-message')
        el = list && list.length ? list[list.length - 1] : null
      }
      if (!el) {
        return
      }
      const contentEl = el.querySelector && el.querySelector('.el-message__content')
      const target = contentEl || el
      target.style.cursor = 'pointer'

      const onTap = (e) => {
        const t = e.target
        const isClose =
          t && typeof t.closest === 'function' && t.closest('.el-message__closeBtn')
        if (isClose) {
          return
        }
        // Unbind before triggering to ensure single-fire
        try {
          target.removeEventListener('click', onTap)
        } catch (e2) {}
        try {
          arg.onClick(e)
        } finally {
          try {
            handler && typeof handler.close === 'function' && handler.close()
          } catch (e3) {}
        }
      }
      target.addEventListener('click', onTap)
    } catch (e) {}
  }

  // Element Plus Message inserts DOM after mount; poll for readiness
  const waitDom = () => {
    let el = null
    if (handler) {
      el = (handler.proxy && handler.proxy.$el) || handler.$el
    }
    if (el && el.isConnected) {
      attach()
      return
    }
    if (++tried > 50) {
      return
    }
    setTimeout(waitDom, 50)
  }
  waitDom()
}

/**
 * Create a message service instance.
 *
 * This replaces the old Vue 2 plugin pattern (`Vue.prototype.$msg = msg`).
 * In Vue 3, the returned `msg` object is assigned to
 * `app.config.globalProperties.$msg` and `$message` in main.js.
 *
 * @param {Function} Message - ElMessage function from element-plus
 * @param {Object} defaultOption - Default options merged into every call
 * @returns {Proxy} A Proxy around ElMessage that supports
 *                   `msg(options)`, `msg.error(text)`, `msg.success(text)`, etc.
 */
export function createMsg (Message = ElMessage, defaultOption = {}) {
  const show = (createHandler, arg) => {
    if (!(arg instanceof Object)) {
      arg = { message: arg }
    }

    if (instances.length >= maxLength) {
      const oldest = instances[0]
      try {
        oldest && typeof oldest.close === 'function' && oldest.close()
      } catch (e) {}
    }

    const handler = createHandler({
      ...defaultOption,
      ...arg,
      onClose: (...data) => {
        const idx = instances.indexOf(handler)
        if (idx >= 0) {
          instances.splice(idx, 1)
        }
        if (typeof arg.onClose === 'function') {
          arg.onClose(...data)
        }
      }
    })

    if (handler) {
      instances.push(handler)
      bindClickToMessage(handler, arg)
    }

    return handler
  }

  const msg = new Proxy(Message, {
    apply (obj, thisArg, args) {
      const arg = args && args.length ? args[0] : undefined
      return show((options) => obj(options), arg)
    },
    get (obj, prop) {
      return (arg) => {
        return show((options) => obj[prop](options), arg)
      }
    }
  })

  return msg
}

export default { createMsg }
