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
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例

const { t } = i18n.global

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
  // 5 = 未选择（该格分片属于未勾选的文件，不需下载）——不是百分比
  if (props.status === 5) {
    return t('task.task-piece-not-selected')
  }
  const percentages = [0, 25, 50, 75, 100]
  const percent = percentages[props.status] + '%'
  let speedStr = ''
  if (props.downloadSpeed > 0 && props.pieceLength > 0) {
    const blockDownloadSpeed = props.downloadSpeed
    // 1000 进制：与全局速度显示口径一致
    const speedKbps = (blockDownloadSpeed / 1000).toFixed(2)
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
.graphic-atom-s5 {
  /* 未选择（未勾选的文件所在分片）：中性蓝灰，区别于灰(未下载)与绿(已完成) */
  fill: var(--lc-graphic-atom-5);
}
</style>
