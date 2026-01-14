const instances = []
const maxLength = 5
const baseOffset = 20
const gap = 16
const defaultHeight = 48
const slideDuration = 250

export default {
  install: function (Vue, Message, defaultOption = {}) {
    const computeOffsets = () => {
      let offset = baseOffset
      return instances.map(it => {
        const el = it && it.$el
        const h = (el && el.offsetHeight) || defaultHeight
        const cur = offset
        offset += h + gap
        return cur
      })
    }

    const applyOffsets = () => {
      const offsets = computeOffsets()
      instances.forEach((it, i) => {
        const el = it && it.$el
        if (!el) return
        if (it.__lcClosing) return
        try {
          el.style.top = `${offsets[i]}px`
          el.style.transform = 'translateX(-50%) translateY(0)'
          el.style.opacity = '1'
        } catch (e) {}
      })
    }

    const show = (createVm, arg) => {
      if (!(arg instanceof Object)) {
        arg = { message: arg }
      }
      if (instances.length >= maxLength) {
        const oldest = instances[0]
        try {
          oldest && typeof oldest.close === 'function' && oldest.close()
        } catch (e) {}
      }

      let clickTarget = null
      let clickHandler = null
      let clicked = false
      let vm = null

      vm = createVm({
        ...defaultOption,
        ...arg,
        onClose (...data) {
          if (clickTarget && clickHandler) {
            try {
              clickTarget.removeEventListener('click', clickHandler)
            } catch (e) {}
          }
          const idx = instances.indexOf(vm)
          if (idx >= 0) {
            instances.splice(idx, 1)
          }
          setTimeout(() => applyOffsets(), 0)
          if (arg.onClose) {
            arg.onClose(...data)
          }
        }
      })

      if (vm) {
        const el = vm.$el
        try {
          el.style.willChange = 'top, transform, opacity'
          el.style.transition = `top ${slideDuration}ms ease, transform ${slideDuration}ms ease, opacity ${slideDuration}ms ease`
          el.style.opacity = '0'
          el.style.transform = 'translateX(-50%) translateY(-120%)'
        } catch (e) {}

        const originalClose = typeof vm.close === 'function' ? vm.close.bind(vm) : null
        if (originalClose) {
          vm.close = () => {
            if (vm.__lcClosing) return
            vm.__lcClosing = true
            const el2 = vm.$el
            try {
              el2.style.transform = 'translateX(-50%) translateY(-120%)'
              el2.style.opacity = '0'
            } catch (e) {}
            setTimeout(() => originalClose(), slideDuration)
          }
        }

        instances.push(vm)
        setTimeout(() => applyOffsets(), 0)
      }

      if (arg.onClick && vm && vm.$el) {
        try {
          const contentEl = vm.$el.querySelector('.el-message__content')
          clickTarget = contentEl || vm.$el
          clickTarget.style.cursor = 'pointer'
          clickHandler = (e) => {
            if (clicked) return
            const t = e.target
            const isClose = t && typeof t.closest === 'function' && t.closest('.el-message__closeBtn')
            if (isClose) {
              return
            }
            clicked = true
            try {
              arg.onClick(e)
            } finally {
              if (vm && typeof vm.close === 'function') {
                vm.close()
              }
            }
          }
          clickTarget.addEventListener('click', clickHandler)
        } catch (e) {}
      }
    }

    Vue.prototype.$msg = new Proxy(Message, {
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
    Vue.prototype.$message = Vue.prototype.$msg
  }
}
