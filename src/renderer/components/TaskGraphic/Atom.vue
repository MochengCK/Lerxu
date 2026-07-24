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

<script>
  export default {
    name: 'mo-task-graphic-atom',
    props: {
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
    },
    computed: {
      klass () {
        const { status } = this
        return `graphic-atom graphic-atom-s${status}`
      },
      statusLabel () {
        const percentages = [0, 25, 50, 75, 100]
        const percent = percentages[this.status] + '%'
        // 基于块大小和总下载速度计算单个块的下载速度
        let speedStr = ''
        if (this.downloadSpeed > 0 && this.pieceLength > 0) {
          // 假设每个块均匀分配下载速度
          const blockDownloadSpeed = this.downloadSpeed
          const speedKbps = (blockDownloadSpeed / 1024).toFixed(2)
          speedStr = `${speedKbps} KB/s`
        }
        return speedStr ? `${percent} - ${speedStr}` : percent
      }
    },
    methods: {
      showTooltip (event) {
        // SVG title 自动显示
      },
      hideTooltip (event) {
        // SVG title 自动隐藏
      }
    }
  }
</script>

<style lang="scss">
.graphic-atom {
  shape-rendering: geometricPrecision;
}
.graphic-atom-s0 {
  fill: $--graphic-atom-color-0;
}
.graphic-atom-s1 {
  fill: $--graphic-atom-color-1;
}
.graphic-atom-s2 {
  fill: $--graphic-atom-color-2;
}
.graphic-atom-s3 {
  fill: $--graphic-atom-color-3;
}
.graphic-atom-s4 {
  fill: $--graphic-atom-color-4;
}
</style>
