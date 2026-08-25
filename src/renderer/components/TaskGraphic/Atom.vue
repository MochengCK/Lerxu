<template>
  <g @mouseenter="showTooltip" @mouseleave="hideTooltip">
    <rect
      :class="klass"
      :status="status"
      :width="width"
      :height="height"
      :rx="radius"
      :ry="radius"
      :x="x"
      :y="y"
    >
    </rect>
    <title>{{ statusLabel }}</title>
  </g>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: {
    type: Number
  },
  downloadSpeed: {
    type: Number,
    default: 0
  },
  pieceLength: {
    type: Number,
    default: 0
  },
  width: {
    type: Number,
    default: 10
  },
  height: {
    type: Number,
    default: 10
  },
  radius: {
    type: Number,
    default: 2
  },
  x: {
    type: Number
  },
  y: {
    type: Number
  }
})

const klass = computed(() => {
  return `graphic-atom graphic-atom-s${props.status}`
})

const statusLabel = computed(() => {
  const percentages = [0, 25, 50, 75, 100]
  const percent = percentages[props.status] + '%'
  let speedStr = ''
  if (props.downloadSpeed > 0 && props.pieceLength > 0) {
    const blockDownloadSpeed = props.downloadSpeed
    const speedKbps = (blockDownloadSpeed / 1024).toFixed(2)
    speedStr = `${speedKbps} KB/s`
  }
  return speedStr ? `${percent} - ${speedStr}` : percent
})

function showTooltip () {
  // SVG <title> 自动显示
}

function hideTooltip () {
  // SVG <title> 自动隐藏
}
</script>

<style lang="scss">
.graphic-atom {
  shape-rendering: geometricPrecision;
}
.graphic-atom-s0 {
  fill: var(--lc-graphic-atom-0);
}
.graphic-atom-s1 {
  fill: var(--lc-graphic-atom-1);
}
.graphic-atom-s2 {
  fill: var(--lc-graphic-atom-2);
}
.graphic-atom-s3 {
  fill: var(--lc-graphic-atom-3);
}
.graphic-atom-s4 {
  fill: var(--lc-graphic-atom-4);
}
</style>
