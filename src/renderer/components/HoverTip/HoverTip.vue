<template>
  <span class="lc-hover-tip__trigger" ref="triggerRef" @mouseenter="onTriggerEnter" @mouseleave="onTriggerLeave" @focus="onTriggerEnter" @blur="onTriggerLeave">
    <slot />
  </span>
  <Teleport to="body">
    <Transition name="lc-hover-tip">
      <div
        v-if="visible"
        class="lc-hover-tip"
        :class="[`lc-hover-tip--${effect}`, `lc-hover-tip--${actualPlacement}`, { 'is-enterable': enterable }]"
        :style="tipStyle"
        @mouseenter="onTipEnter"
        @mouseleave="onTipLeave"
      >
        <div class="lc-hover-tip__inner" ref="tipInnerRef" :style="innerStyle">
          <span class="lc-hover-tip__content">{{ content }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'

defineOptions({ name: 'MoHoverTip' })

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  placement: {
    type: String,
    default: 'top'
  },
  effect: {
    type: String,
    default: 'dark'
  },
  openDelay: {
    type: Number,
    default: 0
  },
  closeDelay: {
    type: Number,
    default: 100
  },
  disabled: {
    type: Boolean,
    default: false
  },
  enterable: {
    type: Boolean,
    default: false
  },
  offset: {
    type: Number,
    default: 8
  }
})

const emit = defineEmits(['show', 'hide'])

const triggerRef = ref(null)
const tipInnerRef = ref(null)

const visible = ref(false)
const tipRect = ref(null)
const triggerRect = ref(null)

// 测量阶段：'measuring' = nowrap 测量自然宽度；'settled' = 应用最终约束
const measurePhase = ref('measuring')
// 文本自然宽度（nowrap 时的宽度）
const naturalWidth = ref(0)

let openTimer = null
let closeTimer = null
let isTipHovered = false
let isTriggerHovered = false

const tipHeight = computed(() => tipRect.value ? tipRect.value.height : 28)
const tipWidth = computed(() => tipRect.value ? tipRect.value.width : 60)

// 安全边距：弹窗边缘到视口边缘的最小距离
const SAFETY_MARGIN = 12

// 计算弹窗的水平定位和最大宽度。
// 策略：以触发元素中心为起点，优先居中；居中放不下则平移贴边；
// 整个视口都放不下才设 max-width 换行。
// 返回 { left, maxWidth, transform }
const horizontalLayout = computed(() => {
  if (!triggerRect.value || naturalWidth.value <= 0) {
    return { left: 0, maxWidth: 0, transform: 'translateX(-50%)' }
  }
  const tc = triggerRect.value.left + triggerRect.value.width / 2
  const tipW = naturalWidth.value
  const half = tipW / 2
  const vw = window.innerWidth

  // 居中时的左右边界
  const leftEdge = tc - half
  const rightEdge = tc + half

  // 情况 1：居中放得下 → 居中对齐
  if (leftEdge >= SAFETY_MARGIN && rightEdge <= vw - SAFETY_MARGIN) {
    return { left: tc, maxWidth: 0, transform: 'translateX(-50%)' }
  }

  // 情况 2：居中放不下，但整个视口宽度放得下 → 平移到不溢出
  if (tipW <= vw - SAFETY_MARGIN * 2) {
    if (leftEdge < SAFETY_MARGIN) {
      // 左边溢出 → 贴左边对齐
      return { left: SAFETY_MARGIN, maxWidth: 0, transform: 'none' }
    }
    // 右边溢出 → 贴右边对齐
    return { left: vw - SAFETY_MARGIN, maxWidth: 0, transform: 'translateX(-100%)' }
  }

  // 情况 3：整个视口都放不下 → 设 max-width，贴左对齐
  return { left: SAFETY_MARGIN, maxWidth: vw - SAFETY_MARGIN * 2, transform: 'none' }
})

const actualPlacement = computed(() => {
  if (!triggerRect.value) return props.placement
  const margin = 12
  if (props.placement === 'top' && triggerRect.value.top < tipHeight.value + margin) {
    return 'bottom'
  }
  if (props.placement === 'bottom' && window.innerHeight - triggerRect.value.bottom < tipHeight.value + margin) {
    return 'top'
  }
  if (props.placement === 'left' && triggerRect.value.left < tipWidth.value + margin) {
    return 'right'
  }
  if (props.placement === 'right' && window.innerWidth - triggerRect.value.right < tipWidth.value + margin) {
    return 'left'
  }
  return props.placement
})

// 内层元素样式：测量阶段 nowrap，定稿阶段按需设置 max-width
const innerStyle = computed(() => {
  if (measurePhase.value === 'measuring') {
    return { whiteSpace: 'nowrap' }
  }
  const mw = horizontalLayout.value.maxWidth
  if (mw > 0) {
    return { maxWidth: `${mw}px`, whiteSpace: 'normal' }
  }
  return { whiteSpace: 'nowrap' }
})

const tipStyle = computed(() => {
  if (!triggerRect.value) return { visibility: 'hidden' }
  const { actualPlacement: ap, triggerRect: tr, offset: off } = {
    actualPlacement: actualPlacement.value,
    triggerRect: triggerRect.value,
    offset: props.offset
  }
  const style = {}

  if (ap === 'top' || ap === 'bottom') {
    // 水平方向使用智能布局：居中 → 平移 → 换行
    const hl = horizontalLayout.value
    style.left = `${hl.left}px`
    if (ap === 'top') {
      style.top = `${tr.top - off}px`
      style.transform = hl.transform === 'none'
        ? 'translateY(-100%)'
        : `${hl.transform} translateY(-100%)`
    } else {
      style.top = `${tr.bottom + off}px`
      style.transform = hl.transform === 'none' ? 'none' : hl.transform
    }
  } else if (ap === 'left') {
    style.left = `${tr.left - off}px`
    style.top = `${tr.top + tr.height / 2}px`
    style.transform = 'translate(-100%, -50%)'
  } else if (ap === 'right') {
    style.left = `${tr.right + off}px`
    style.top = `${tr.top + tr.height / 2}px`
    style.transform = 'translate(0, -50%)'
  }
  return style
})

watch(() => props.disabled, (val) => {
  if (val) {
    hideTip()
  } else if (isTriggerHovered) {
    // disabled 从 true 变 false（如溢出状态延迟检测后），
    // 鼠标仍在 trigger 上时重新启动显示逻辑
    clearCloseTimer()
    if (props.openDelay > 0) {
      clearOpenTimer()
      openTimer = setTimeout(() => {
        openTimer = null
        showTip()
      }, props.openDelay)
    } else {
      showTip()
    }
  }
})

watch(() => props.content, () => {
  if (visible.value) {
    // 内容变化，重新走测量流程
    measurePhase.value = 'measuring'
    nextTick(() => measureAndSettle())
  }
})

function measureTip () {
  if (tipInnerRef.value) {
    tipRect.value = tipInnerRef.value.getBoundingClientRect()
  }
}

// 两阶段测量：
// 1. measuring 阶段（nowrap）：获取文本自然宽度
// 2. settled 阶段：应用 max-width（如需要），重新测量最终尺寸
function measureAndSettle () {
  if (!tipInnerRef.value) return
  // 阶段 1：测量自然宽度（此时 innerStyle 为 nowrap，无 max-width）
  if (measurePhase.value === 'measuring') {
    naturalWidth.value = tipInnerRef.value.getBoundingClientRect().width
    // 切换到定稿阶段，让 innerStyle 和 tipStyle 更新
    measurePhase.value = 'settled'
    nextTick(() => {
      // 阶段 2：测量最终尺寸（可能已换行），用于 placement 判断和定位
      measureTip()
    })
    return
  }
  measureTip()
}

function onTriggerEnter () {
  isTriggerHovered = true
  if (props.disabled) return
  clearCloseTimer()
  if (props.openDelay > 0) {
    clearOpenTimer()
    openTimer = setTimeout(() => {
      openTimer = null
      showTip()
    }, props.openDelay)
  } else {
    showTip()
  }
}

function onTriggerLeave () {
  isTriggerHovered = false
  if (props.enterable && isTipHovered) return
  scheduleHide()
}

function onTipEnter () {
  isTipHovered = true
}

function onTipLeave () {
  isTipHovered = false
  scheduleHide()
}

function scheduleHide () {
  clearOpenTimer()
  if (!visible.value) return
  if (props.closeDelay > 0) {
    clearCloseTimer()
    closeTimer = setTimeout(() => {
      closeTimer = null
      hideTip()
    }, props.closeDelay)
  } else {
    hideTip()
  }
}

function showTip () {
  if (props.disabled) return
  clearCloseTimer()
  triggerRect.value = triggerRef.value
    ? triggerRef.value.getBoundingClientRect()
    : null
  // 重置为测量阶段
  measurePhase.value = 'measuring'
  naturalWidth.value = 0
  visible.value = true
  emit('show')
  nextTick(() => measureAndSettle())
}

function hideTip () {
  visible.value = false
  emit('hide')
}

function clearOpenTimer () {
  if (openTimer) {
    clearTimeout(openTimer)
    openTimer = null
  }
}

function clearCloseTimer () {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function clearTimers () {
  clearOpenTimer()
  clearCloseTimer()
}

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<style lang="scss">
.lc-hover-tip__trigger {
  display: inline-flex;
  align-items: center;
}

.lc-hover-tip {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
}

.lc-hover-tip.is-enterable {
  pointer-events: auto;
}

.lc-hover-tip__inner {
  display: inline-block;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: break-word;
  word-break: break-word;
}

.lc-hover-tip--dark .lc-hover-tip__inner {
  color: #fff;
  background-color: #303133;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.lc-hover-tip--light .lc-hover-tip__inner {
  color: #303133;
  background-color: #fff;
  border: 1px solid #e4e7ed;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* ===== 动画 ===== */

.lc-hover-tip-enter-active .lc-hover-tip__inner {
  transition: opacity 0.18s cubic-bezier(0.34, 1.2, 0.64, 1),
              transform 0.18s cubic-bezier(0.34, 1.2, 0.64, 1);
  will-change: transform, opacity;
}

.lc-hover-tip-leave-active .lc-hover-tip__inner {
  transition: opacity 0.14s cubic-bezier(0.4, 0, 1, 1),
              transform 0.14s cubic-bezier(0.4, 0, 1, 1);
  will-change: transform, opacity;
}

.lc-hover-tip--bottom .lc-hover-tip__inner {
  transform-origin: top center;
}
.lc-hover-tip--bottom.lc-hover-tip-enter-from .lc-hover-tip__inner,
.lc-hover-tip--bottom.lc-hover-tip-leave-to .lc-hover-tip__inner {
  opacity: 0;
  transform: scale(0.85) translateY(-6px);
}

.lc-hover-tip--top .lc-hover-tip__inner {
  transform-origin: bottom center;
}
.lc-hover-tip--top.lc-hover-tip-enter-from .lc-hover-tip__inner,
.lc-hover-tip--top.lc-hover-tip-leave-to .lc-hover-tip__inner {
  opacity: 0;
  transform: scale(0.85) translateY(6px);
}

.lc-hover-tip--left .lc-hover-tip__inner {
  transform-origin: right center;
}
.lc-hover-tip--left.lc-hover-tip-enter-from .lc-hover-tip__inner,
.lc-hover-tip--left.lc-hover-tip-leave-to .lc-hover-tip__inner {
  opacity: 0;
  transform: scale(0.85) translateX(6px);
}

.lc-hover-tip--right .lc-hover-tip__inner {
  transform-origin: left center;
}
.lc-hover-tip--right.lc-hover-tip-enter-from .lc-hover-tip__inner,
.lc-hover-tip--right.lc-hover-tip-leave-to .lc-hover-tip__inner {
  opacity: 0;
  transform: scale(0.85) translateX(-6px);
}
</style>
