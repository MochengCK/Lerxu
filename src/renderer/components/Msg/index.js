const instances = []
const maxLength = 5

/**
 * 将 onClick 精确绑定到消息实例自身的 DOM。
 *
 * 旧实现用 document.querySelectorAll('.el-message') 取"最后一个"节点，
 * 在同时弹出多条通知时会错位：每条消息的点击都绑到同一个/错误的 DOM 上，
 * 点击一条会触发多条回调并关闭错误的通知。这里改为优先使用
 * element-ui Message 实例的 $el（.el-message 根节点），一对一绑定。
 */
const bindClickToMessage = (handler, arg) => {
  if (typeof arg.onClick !== 'function' || typeof document === 'undefined') {
    return
  }

  let tried = 0
  const attach = () => {
    try {
      // 优先消息实例自身 DOM；消息关闭后 isConnected 为 false，不会误绑
      let el = handler && handler.$el && handler.$el.isConnected ? handler.$el : null
      if (!el) {
        // 兜底：取容器内最后一条 .el-message
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
        // 先解绑再触发，保证每条消息的点击只触发一次
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

  // element-ui Message 在 mounted 后才把 DOM 插入容器，轮询等待就绪
  const waitDom = () => {
    const el = handler && handler.$el
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

    // Vue 2 compatibility
    Vue.prototype.$msg = msg
    Vue.prototype.$message = msg
  }
}
