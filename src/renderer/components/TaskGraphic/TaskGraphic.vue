<template>
  <svg version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    class="svg-task-graphic"
    :width="width"
    :height="height"
    :viewBox="box">
    <g v-for="(row, index) in atoms" :key="`g-${index}`" >
      <Atom
        v-for="atom in row"
        :key="`atom-${atom.id}`"
        :status="atom.status"
        :downloadSpeed="downloadSpeed"
        :pieceLength="pieceLength"
        :width="atomWidth"
        :height="atomHeight"
        :radius="atomRadius"
        :x="atom.x"
        :y="atom.y"
      />
    </g>
  </svg>
</template>

<script setup>
defineOptions({ name: 'mo-task-graphic' }) // 供父组件 [X.name]: X 注册
  import { computed } from 'vue'
  import Atom from './Atom.vue'

  const props = defineProps({
    bitfield: {
      type: String,
      default: ''
    },
    numPieces: {
      type: Number,
      default: 0
    },
    downloadSpeed: {
      type: Number,
      default: 0
    },
    pieceLength: {
      type: Number,
      default: 0
    },
    outerWidth: {
      type: Number,
      default: 240
    },
    atomWidth: {
      type: Number,
      default: 10
    },
    atomHeight: {
      type: Number,
      default: 10
    },
    atomGutter: {
      type: Number,
      default: 3
    },
    atomRadius: {
      type: Number,
      default: 4
    }
  })

  const len = computed(() => {
    const total = Number(props.numPieces)
    if (total > 0) {
      return Math.min(Math.ceil(total / 4), props.bitfield.length)
    }
    return props.bitfield.length
  })

  const atomWG = computed(() => props.atomWidth + props.atomGutter)
  const atomHG = computed(() => props.atomHeight + props.atomGutter)

  const columnCount = computed(() => {
    return parseInt((props.outerWidth - props.atomWidth) / atomWG.value, 10) + 1
  })

  const rowCount = computed(() => {
    return parseInt((len.value / columnCount.value), 10) + 1
  })

  const offset = computed(() => {
    const totalWidth = atomWG.value * (columnCount.value - 1) + props.atomWidth
    const result = (props.outerWidth - totalWidth) / 2
    return parseFloat(result.toFixed(2))
  })

  const width = computed(() => {
    return parseInt(atomWG.value * (columnCount.value - 1) + props.atomWidth, 10)
  })

  const height = computed(() => {
    return parseInt(atomHG.value * (rowCount.value - 1) + props.atomHeight + offset.value * 2, 10)
  })

  const box = computed(() => `0 0 ${width.value} ${height.value}`)

  function buildAtom (index) {
    const hIndex = index + 1
    let chIndex = index % columnCount.value
    let rhIndex = parseInt((index / columnCount.value), 10)
    chIndex = chIndex < 0 ? 0 : chIndex
    rhIndex = rhIndex < 0 ? 0 : rhIndex
    const result = {
      id: `${hIndex}`,
      status: Math.floor(parseInt(props.bitfield[index], 16) / 4),
      x: chIndex * atomWG.value,
      y: offset.value + rhIndex * atomHG.value
    }
    return result
  }

  const atoms = computed(() => {
    const result = []
    let row = []
    for (let i = 0; i < len.value; i++) {
      row.push(buildAtom(i))
      if ((i + 1) % columnCount.value === 0) {
        result.push(row)
        row = []
      }
    }
    result.push(row)
    return result
  })
</script>
