<template>
  <svg
    version="1.1"
    :class="klass"
    :role="label ? 'img' : 'presentation'"
    :aria-label="label"
    :x="x || null"
    :y="y || null"
    :width="width"
    :height="height"
    :viewBox="box"
    :style="style"
  >
    <slot>
      <template v-if="icon && icon.paths">
        <path v-for="(path, i) in icon.paths" :key="`path-${i}`" v-bind="path" />
      </template>
      <template v-if="icon && icon.polygons">
        <polygon v-for="(polygon, i) in icon.polygons" :key="`polygon-${i}`" v-bind="polygon" />
      </template>
      <template v-if="icon && icon.raw"><g v-bind="icon.g" v-html="raw" /></template>
    </slot>
  </svg>
</template>

<script setup>
import { ref, computed, onMounted, getCurrentInstance } from 'vue'
import { icons, getId } from './registry'

const props = defineProps({
  name: {
    type: String,
    validator (val) {
      if (val && !(val in icons)) {
        console.warn(`Invalid prop: prop "name" is referring to an unregistered icon "${val}".` +
          '\nPlease make sure you have imported this icon before using it.')
        return false
      }
      return true
    }
  },
  scale: [Number, String],
  spin: Boolean,
  inverse: Boolean,
  pulse: Boolean,
  flip: {
    validator (val) {
      return val === 'horizontal' || val === 'vertical'
    }
  },
  label: String
})

defineOptions({ name: 'mo-icon' })

const x = ref(false)
const y = ref(false)
const childrenWidth = ref(0)
const childrenHeight = ref(0)
const outerScale = ref(1)

const instance = getCurrentInstance()

const normalizedScale = computed(() => {
  let scale = props.scale
  scale = typeof scale === 'undefined' ? 1 : Number(scale)
  if (isNaN(scale) || scale <= 0) {
    console.warn('Invalid prop: prop "scale" should be a number over 0.', instance)
    return outerScale.value
  }
  return scale * outerScale.value
})

const klass = computed(() => ({
  'mo-icon': true,
  'mo-spin': props.spin,
  'mo-flip-horizontal': props.flip === 'horizontal',
  'mo-flip-vertical': props.flip === 'vertical',
  'mo-inverse': props.inverse,
  'mo-pulse': props.pulse
}))

const icon = computed(() => props.name ? icons[props.name] : null)

const ratio = computed(() => {
  if (!icon.value) return 1
  const { width: w, height: h } = icon.value
  return Math.max(w, h) / 16
})

const width = computed(() =>
  childrenWidth.value || (icon.value && icon.value.width / ratio.value * normalizedScale.value) || 0
)

const height = computed(() =>
  childrenHeight.value || (icon.value && icon.value.height / ratio.value * normalizedScale.value) || 0
)

const box = computed(() => {
  if (icon.value) return `0 0 ${icon.value.width} ${icon.value.height}`
  return `0 0 ${width.value} ${height.value}`
})

const style = computed(() => {
  if (normalizedScale.value === 1) return false
  return { fontSize: normalizedScale.value + 'em' }
})

const raw = computed(() => {
  if (!icon.value || !icon.value.raw) return null
  let rawVal = icon.value.raw
  const ids = {}
  rawVal = rawVal.replace(/\s(?:xml:)?id=(["']?)([^"')\s]+)\1/g, (_m, _q, id) => {
    const uniqueId = getId()
    ids[id] = uniqueId
    return ` id="${uniqueId}"`
  })
  rawVal = rawVal.replace(/#(?:([^'")\s]+)|xpointer\(id\((['"]?)([^')]+)\2\)\))/g, (match, rawId, _, pointerId) => {
    const id = rawId || pointerId
    if (!id || !ids[id]) return match
    return `#${ids[id]}`
  })
  return rawVal
})

onMounted(() => {
  const el = instance.proxy.$el
  if (!props.name && (!el || !el.children || el.children.length === 0)) {
    console.warn('Invalid prop: prop "name" is required.')
    return
  }
  if (icon.value) return

  // Vue 3 removed $children; use DOM children for layout calculation
  const children = el ? Array.from(el.children) : []
  let w = 0
  let h = 0
  children.forEach((childEl) => {
    w = Math.max(w, childEl.offsetWidth || 0)
    h = Math.max(h, childEl.offsetHeight || 0)
  })
  childrenWidth.value = w
  childrenHeight.value = h
  children.forEach((childEl) => {
    childEl.setAttribute('x', (w - (childEl.offsetWidth || 0)) / 2)
    childEl.setAttribute('y', (h - (childEl.offsetHeight || 0)) / 2)
  })
})
</script>

<script>
// Re-export registry as default export so icon definition files can keep using:
//   import Icon from '@/components/Icons/Icon'
//   Icon.register({ ... })
import registry from './registry'
export default registry
</script>

<style>
.mo-icon {
  display: inline-block;
  fill: currentColor;
}

.mo-flip-horizontal {
  transform: scale(-1, 1);
}

.mo-flip-vertical {
  transform: scale(1, -1);
}

.mo-spin {
  animation: mo-spin 0.5s 0s infinite linear;
}

.mo-inverse {
  color: #fff;
}

.mo-pulse {
  animation: mo-spin 1s infinite steps(8);
}

@keyframes mo-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
