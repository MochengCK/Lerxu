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
    <mo-hover-tip
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
        @click="onSelect(opt, $event)"
      >
        <mo-icon
          v-if="opt.icon"
          :name="opt.icon"
          :width="iconSize"
          :height="iconSize"
        />
        <span v-else class="lc-segmented__item-label">{{ opt.label }}</span>
      </div>
    </mo-hover-tip>
  </div>
</template>

<script setup>
// Options API 父组件通过 [SegmentedSlider.name]: SegmentedSlider 注册，必须有 name
defineOptions({ name: 'mo-segmented-slider' })

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  // Backward compat: support `value` prop from Vue 2 v-model
  value: {
    type: [String, Number],
    default: undefined
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
})

const emit = defineEmits(['update:modelValue', 'update:value', 'change'])

// Support both Vue 3 modelValue and Vue 2 value prop
const currentValue = computed(() => {
  if (props.modelValue !== undefined && props.modelValue !== '') return props.modelValue
  if (props.value !== undefined) return props.value
  return ''
})

const root = ref(null)
const itemWidths = ref({})
const ro = ref(null)
const ready = ref(false)

// Template refs for items — stored dynamically
const itemRefs = {}

const setItemRef = (value) => (el) => {
  if (el) {
    itemRefs[value] = el
  } else {
    delete itemRefs[value]
  }
}

const activeValue = computed(() => {
  const hit = props.options.find(opt => opt.value === currentValue.value && !opt.disabled)
  return hit ? hit.value : ''
})

const indicatorStyle = computed(() => {
  if (!ready.value || !activeValue.value) {
    return { opacity: 0, transform: 'translate3d(0,0,0)', width: '0px' }
  }
  const idx = props.options.findIndex(opt => opt.value === activeValue.value)
  if (idx < 0) {
    return { opacity: 0, transform: 'translate3d(0,0,0)', width: '0px' }
  }
  let translateX = 0
  for (let i = 0; i < idx; i++) {
    translateX += itemWidths.value[props.options[i].value] || 0
  }
  const width = itemWidths.value[activeValue.value] || 0
  return {
    opacity: width > 0 ? 1 : 0,
    width: width ? `${width}px` : '0px',
    transform: `translate3d(${translateX}px, 0, 0)`
  }
})

const isActive = (opt) => opt.value === activeValue.value && !opt.disabled

const onSelect = (opt, event) => {
  if (opt.disabled || opt.value === activeValue.value) {
    return
  }
  if (props.stopPropagation) {
    event && event.stopPropagation && event.stopPropagation()
  }
  emit('update:modelValue', opt.value)
  emit('update:value', opt.value)
  emit('change', opt.value, currentValue.value)
}

const measure = () => {
  const widths = {}
  props.options.forEach(opt => {
    const el = itemRefs[opt.value]
    if (el && el.offsetWidth) {
      widths[opt.value] = el.offsetWidth
    }
  })
  itemWidths.value = widths
  ready.value = Object.keys(widths).length > 0
}

const setupResizeObserver = () => {
  if (typeof ResizeObserver === 'undefined') {
    return
  }
  ro.value = new ResizeObserver(() => {
    measure()
  })
  if (root.value) {
    ro.value.observe(root.value)
  }
  props.options.forEach(opt => {
    const el = itemRefs[opt.value]
    if (el) {
      ro.value.observe(el)
    }
  })
}

const updateIndicator = () => {
  nextTick(measure)
}

watch(() => props.options, () => {
  nextTick(measure)
}, { deep: true })

watch(() => props.modelValue, () => {
  nextTick(measure)
})

watch(() => props.value, () => {
  nextTick(measure)
})

watch(activeValue, () => {
  nextTick(measure)
})

onMounted(() => {
  nextTick(() => {
    measure()
    setupResizeObserver()
  })
})

onBeforeUnmount(() => {
  if (ro.value) {
    ro.value.disconnect()
    ro.value = null
  }
})

// Expose for parent components that call this method directly
defineExpose({ updateIndicator })
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
