<template>
  <div
    class="lc-segmented"
    :class="[`lc-segmented--${size}`, { 'lc-segmented--icon-only': iconOnly }]"
    ref="root"
    role="group"
  >
    <div
      class="lc-segmented__indicator"
      :style="indicatorStyle"
    ></div>
    <el-tooltip
      v-for="opt in options"
      :key="opt.value"
      effect="dark"
      placement="bottom"
      :content="opt.tooltip || ''"
      :disabled="!opt.tooltip"
    >
      <div
        :class="[
          'lc-segmented__item',
          {
            'lc-segmented__item--active': isActive(opt),
            'lc-segmented__item--disabled': opt.disabled
          }
        ]"
        :ref="setItemRef(opt.value)"
        @click="onSelect(opt)"
      >
        <mo-icon
          v-if="opt.icon"
          :name="opt.icon"
          :width="iconSize"
          :height="iconSize"
        />
        <span v-else class="lc-segmented__item-label">{{ opt.label }}</span>
      </div>
    </el-tooltip>
  </div>
</template>

<script>
  export default {
    name: 'mo-segmented-slider',
    model: {
      prop: 'value',
      event: 'input'
    },
    props: {
      value: {
        type: [String, Number],
        default: ''
      },
      options: {
        type: Array,
        default: () => []
      },
      size: {
        type: String,
        default: 'default',
        validator: v => ['default', 'mini'].includes(v)
      },
      iconOnly: {
        type: Boolean,
        default: false
      },
      iconSize: {
        type: Number,
        default: 14
      },
      stopPropagation: {
        type: Boolean,
        default: false
      }
    },
    data () {
      return {
        itemWidths: {},
        ro: null,
        ready: false
      }
    },
    computed: {
      activeValue () {
        const hit = this.options.find(opt => opt.value === this.value && !opt.disabled)
        return hit ? hit.value : ''
      },
      indicatorStyle () {
        if (!this.ready || !this.activeValue) {
          return { opacity: 0, transform: 'translate3d(0,0,0)', width: '0px' }
        }
        const idx = this.options.findIndex(opt => opt.value === this.activeValue)
        if (idx < 0) {
          return { opacity: 0, transform: 'translate3d(0,0,0)', width: '0px' }
        }
        let translateX = 0
        for (let i = 0; i < idx; i++) {
          translateX += this.itemWidths[this.options[i].value] || 0
        }
        const width = this.itemWidths[this.activeValue] || 0
        return {
          opacity: width > 0 ? 1 : 0,
          width: width ? `${width}px` : '0px',
          transform: `translate3d(${translateX}px, 0, 0)`
        }
      }
    },
    watch: {
      options: {
        handler () {
          this.$nextTick(this.measure)
        },
        deep: true
      },
      value () {
        this.$nextTick(this.measure)
      },
      activeValue () {
        this.$nextTick(this.measure)
      }
    },
    mounted () {
      this.$nextTick(() => {
        this.measure()
        this.setupResizeObserver()
      })
    },
    beforeDestroy () {
      if (this.ro) {
        this.ro.disconnect()
        this.ro = null
      }
    },
    methods: {
      isActive (opt) {
        return opt.value === this.activeValue && !opt.disabled
      },
      setItemRef (value) {
        return `item-${value}`
      },
      onSelect (opt) {
        if (opt.disabled || opt.value === this.activeValue) {
          return
        }
        if (this.stopPropagation) {
          event && event.stopPropagation && event.stopPropagation()
        }
        this.$emit('input', opt.value)
        this.$emit('change', opt.value, this.value)
      },
      measure () {
        const widths = {}
        this.options.forEach(opt => {
          const ref = this.$refs[`item-${opt.value}`]
          const el = Array.isArray(ref) ? ref[0] : ref
          if (el && el.offsetWidth) {
            widths[opt.value] = el.offsetWidth
          }
        })
        this.itemWidths = widths
        this.ready = Object.keys(widths).length > 0
      },
      setupResizeObserver () {
        if (typeof ResizeObserver === 'undefined') {
          return
        }
        this.ro = new ResizeObserver(() => {
          this.measure()
        })
        if (this.$refs.root) {
          this.ro.observe(this.$refs.root)
        }
        this.options.forEach(opt => {
          const ref = this.$refs[`item-${opt.value}`]
          const el = Array.isArray(ref) ? ref[0] : ref
          if (el) {
            this.ro.observe(el)
          }
        })
      },
      updateIndicator () {
        this.$nextTick(this.measure)
      }
    }
  }
</script>

<style lang="scss">
  .lc-segmented {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 2px;
    background-color: transparent;
    border: 1px solid var(--lc-task-item-border);
    border-radius: 8px;
    box-sizing: border-box;
    height: 28px;
    flex-shrink: 0;
    overflow: hidden;

    &--mini {
      height: 26px;
    }

    &__indicator {
      position: absolute;
      top: 2px;
      left: 2px;
      height: 22px;
      border-radius: 6px;
      background-color: var(--lc-color-primary);
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                  width 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                  opacity 0.18s ease;
      z-index: 1;
      pointer-events: none;
      will-change: transform, width, opacity;
    }

    &--mini &__indicator {
      height: 20px;
    }

    &__item {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 22px;
      padding: 0 14px;
      border-radius: 6px;
      cursor: pointer;
      user-select: none;
      font-size: 13px;
      color: var(--lc-task-action);
      transition: color 0.2s ease;
      white-space: nowrap;

      &:hover {
        color: var(--lc-task-action-hover);
      }

      &--active {
        color: #fff;
        &:hover {
          color: #fff;
        }
      }

      &--disabled {
        cursor: not-allowed;
        opacity: 0.4;
        &:hover {
          color: var(--lc-task-action);
        }
      }
    }

    &--mini &__item {
      height: 20px;
      padding: 0 12px;
      font-size: 12px;
    }

    &--icon-only &__item {
      width: 28px;
      padding: 0;
    }

    &--icon-only.lc-segmented--mini &__item {
      width: 26px;
    }

    &__item-label {
      display: inline-block;
    }
  }

  /* 修复 el-tooltip 包裹元素尺寸（图标场景） */
  .lc-segmented--icon-only > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 22px;
    flex-shrink: 0;
  }

  .lc-segmented--icon-only.lc-segmented--mini > span {
    width: 26px;
    height: 20px;
  }

  /* 背景图模式下边框加亮 */
  .theme-light.has-app-background-image .lc-segmented,
  .theme-dark.has-app-background-image .lc-segmented {
    border-color: var(--lc-task-item-hover-border);
  }
</style>
