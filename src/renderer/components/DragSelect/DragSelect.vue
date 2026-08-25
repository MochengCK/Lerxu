<template>
  <div
    ref="container"
    style="position: relative; user-select: none; overflow-x: hidden; touch-action: none;"
  >
    <slot v-bind="{ selected: intersected }" />
  </div>
</template>

<script setup>
defineOptions({ name: 'mo-drag-select' }) // 供父组件 [X.name]: X 注册
import { ref, watch, onMounted, onBeforeUnmount, useSlots, getCurrentInstance } from 'vue'

const props = defineProps({
  attribute: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: '#bad7fb'
  },
  opacity: {
    type: Number,
    default: 0.7
  }
})

const emit = defineEmits(['change'])

const container = ref(null)
const intersected = ref([])
const children = ref([])

let cleanupFn = null

const getCoords = (e, containerRect) => ({
  x: e.clientX - containerRect.left,
  y: e.clientY - containerRect.top
})

const getDimensions = (p1, p2) => ({
  width: Math.abs(p1.x - p2.x),
  height: Math.abs(p1.y - p2.y)
})

const collisionCheck = (node1, node2) =>
  node1.left < node2.left + node2.width &&
  node1.left + node1.width > node2.left &&
  node1.top < node2.top + node2.height &&
  node1.top + node1.height > node2.top

function createBox () {
  const box = document.createElement('div')
  box.setAttribute('data-drag-box-component', '')
  box.style.position = 'absolute'
  box.style.backgroundColor = props.color
  box.style.opacity = props.opacity
  box.style.zIndex = 9999
  box.style.boxSizing = 'border-box'
  box.style.border = '1px solid rgba(64, 158, 255, 0.9)'
  box.style.borderRadius = '4px'
  box.style.pointerEvents = 'none'
  return box
}

function intersection (box) {
  const rect = box.getBoundingClientRect()
  const result = []

  for (let i = 0; i < children.value.length; i++) {
    const el = children.value[i]
    if (!el || !el.hasAttribute(props.attribute)) continue
    if (collisionCheck(rect, el.getBoundingClientRect())) {
      result.push(el.getAttribute(props.attribute))
    }
  }

  if (
    JSON.stringify([...result]) !==
    JSON.stringify([...intersected.value])
  ) {
    intersected.value = result
  }
}

watch(intersected, (i) => {
  emit('change', i)
})

onMounted(() => {
  const el = container.value
  const minDragDistance = 4

  let containerRect = el.getBoundingClientRect()
  const box = createBox()
  let start = { x: 0, y: 0 }
  let end = { x: 0, y: 0 }
  let _children = []
  let activated = false
  let boxAttached = false
  let isDragging = false
  let lastPointer = null
  let scrollParent = null
  let autoScrollRaf = null
  let autoScrollV = 0

  const canScrollY = (node) => {
    if (!node || node === document.body || node === document.documentElement) return false
    const style = window.getComputedStyle(node)
    const overflowY = `${style.overflowY || ''}`.toLowerCase()
    const overflow = `${style.overflow || ''}`.toLowerCase()
    const hasOverflow = /(auto|scroll|overlay)/.test(overflowY) || /(auto|scroll|overlay)/.test(overflow)
    if (!hasOverflow) return false
    return node.scrollHeight > node.clientHeight + 1
  }

  const getScrollParent = (node) => {
    let cur = node && node.parentElement ? node.parentElement : null
    while (cur && cur !== document.body) {
      if (canScrollY(cur)) return cur
      cur = cur.parentElement
    }
    return document.scrollingElement || document.documentElement
  }

  const stopAutoScroll = () => {
    autoScrollV = 0
    if (autoScrollRaf) {
      cancelAnimationFrame(autoScrollRaf)
      autoScrollRaf = null
    }
  }

  const ensureAutoScroll = () => {
    if (autoScrollRaf || !autoScrollV || !isDragging) return
    const step = () => {
      if (!isDragging || !autoScrollV) {
        autoScrollRaf = null
        return
      }
      if (scrollParent) {
        scrollParent.scrollTop = (scrollParent.scrollTop || 0) + autoScrollV
      }
      if (lastPointer) {
        updateFromPointer(lastPointer)
      }
      autoScrollRaf = requestAnimationFrame(step)
    }
    autoScrollRaf = requestAnimationFrame(step)
  }

  const updateAutoScroll = (pointer) => {
    if (!activated || !pointer) {
      stopAutoScroll()
      return
    }
    const edge = 36
    const maxSpeed = 18
    const y = Number(pointer.clientY || 0)

    let limitTop = 0
    let limitBottom = window.innerHeight

    if (scrollParent && scrollParent !== document.body && scrollParent !== document.documentElement) {
      const rect = scrollParent.getBoundingClientRect()
      limitTop = rect.top
      limitBottom = rect.bottom
    }

    let v = 0
    if (y < limitTop + edge) {
      v = -Math.ceil(((limitTop + edge - y) / edge) * maxSpeed)
    } else if (y > limitBottom - edge) {
      v = Math.ceil(((y - (limitBottom - edge)) / edge) * maxSpeed)
    }

    if (v !== autoScrollV) {
      autoScrollV = v
      if (!autoScrollV) {
        stopAutoScroll()
      } else {
        ensureAutoScroll()
      }
    }
  }

  function touchStart (e) {
    e.preventDefault()
    startDrag(e.touches[0])
  }

  function touchMove (e) {
    e.preventDefault()
    updateFromPointer(e.touches[0])
  }

  function startDrag (e) {
    if (e && typeof e.button === 'number' && e.button !== 0) {
      return
    }
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault()
    }
    isDragging = true
    lastPointer = e ? { clientX: e.clientX, clientY: e.clientY } : null
    containerRect = el.getBoundingClientRect()
    scrollParent = getScrollParent(el)
    _children = Array.from(el.querySelectorAll('[' + props.attribute + ']'))
    children.value = _children
    start = getCoords(e, containerRect)
    end = start
    activated = false
    boxAttached = false
    stopAutoScroll()
    document.addEventListener('mousemove', drag)
    document.addEventListener('touchmove', touchMove)
    if (scrollParent) {
      scrollParent.addEventListener('scroll', onScroll, false)
    }
    window.addEventListener('resize', onScroll)
  }

  function drag (e) {
    updateFromPointer(e)
  }

  function updateFromPointer (e) {
    if (!isDragging || !e) return
    lastPointer = { clientX: e.clientX, clientY: e.clientY }
    containerRect = el.getBoundingClientRect()
    end = getCoords(e, containerRect)

    let limitTop = 0
    let limitBottom = window.innerHeight
    let limitLeft = 0
    let limitRight = window.innerWidth

    if (scrollParent && scrollParent !== document.body && scrollParent !== document.documentElement) {
      const scrollRect = scrollParent.getBoundingClientRect()
      limitTop = scrollRect.top
      limitBottom = scrollRect.bottom
      limitLeft = scrollRect.left
      limitRight = scrollRect.right
    }

    const minX = limitLeft - containerRect.left
    const maxX = limitRight - containerRect.left
    const minY = limitTop - containerRect.top
    const maxY = limitBottom - containerRect.top

    if (end.x < minX) end.x = minX
    if (end.x > maxX) end.x = maxX
    if (end.y < minY) end.y = minY
    if (end.y > maxY) end.y = maxY

    const dimensions = getDimensions(start, end)

    if (!activated) {
      if (dimensions.width < minDragDistance && dimensions.height < minDragDistance) {
        return
      }
      activated = true
      box.style.width = '0px'
      box.style.height = '0px'
      if (!boxAttached) {
        el.prepend(box)
        boxAttached = true
      }
    }

    box.style.left = Math.min(start.x, end.x) + 'px'
    box.style.top = Math.min(start.y, end.y) + 'px'
    box.style.width = dimensions.width + 'px'
    box.style.height = dimensions.height + 'px'

    if (activated) {
      updateAutoScroll(e)
      intersection(box)
    }
  }

  function onScroll () {
    if (!isDragging || !lastPointer) return
    updateFromPointer(lastPointer)
  }

  function endDrag () {
    start = { x: 0, y: 0 }
    end = { x: 0, y: 0 }
    activated = false
    isDragging = false
    lastPointer = null

    box.style.width = 0
    box.style.height = 0

    stopAutoScroll()
    document.removeEventListener('mousemove', drag)
    document.removeEventListener('touchmove', touchMove)
    if (scrollParent) {
      scrollParent.removeEventListener('scroll', onScroll, false)
    }
    window.removeEventListener('resize', onScroll)
    if (boxAttached) {
      boxAttached = false
      box.remove()
    }
  }

  const onMouseDown = (e) => {
    if (!el.contains(e.target)) {
      return
    }
    startDrag(e)
  }

  document.addEventListener('mousedown', onMouseDown, true)
  el.addEventListener('touchstart', touchStart)

  document.addEventListener('mouseup', endDrag)
  document.addEventListener('touchend', endDrag)

  cleanupFn = () => {
    document.removeEventListener('mousedown', onMouseDown, true)
    el.removeEventListener('touchstart', touchStart)
    document.removeEventListener('mouseup', endDrag)
    document.removeEventListener('touchend', endDrag)
  }
})

onBeforeUnmount(() => {
  if (cleanupFn) {
    cleanupFn()
    cleanupFn = null
  }
})
</script>
