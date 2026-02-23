const instances = []
const maxLength = 5

export default {
  install: function (Vue, Message, defaultOption = {}) {
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

      let clicked = false
      let clickTarget = null
      let clickHandler = null

      const handler = createHandler({
        ...defaultOption,
        ...arg,
        onClose: (...data) => {
          if (clickTarget && clickHandler) {
            try {
              clickTarget.removeEventListener('click', clickHandler)
            } catch (e) {}
          }
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
      }

      if (arg.onClick && typeof document !== 'undefined') {
        queueMicrotask(() => {
          try {
            const list = document.querySelectorAll('.el-message')
            const el = list && list.length ? list[list.length - 1] : null
            if (!el) return

            const contentEl = el.querySelector('.el-message__content')
            clickTarget = contentEl || el
            clickTarget.style.cursor = 'pointer'
            clickHandler = (e) => {
              if (clicked) return
              const t = e.target
              const isClose = t && typeof t.closest === 'function' && t.closest('.el-message__closeBtn')
              if (isClose) return
              clicked = true
              try {
                arg.onClick(e)
              } finally {
                try {
                  handler && typeof handler.close === 'function' && handler.close()
                } catch (e) {}
              }
            }
            clickTarget.addEventListener('click', clickHandler)
          } catch (e) {}
        })
      }
    }

    const msg = new Proxy(Message, {
      apply (obj, thisArg, args) {
        const arg = args && args.length ? args[0] : undefined
        show((options) => obj(options), arg)
      },
      get (obj, prop) {
        return (arg) => {
          show((options) => obj[prop](options), arg)
        }
      }
    })

    // Vue 2 compatibility
    Vue.prototype.$msg = msg
    Vue.prototype.$message = msg
  }
}
