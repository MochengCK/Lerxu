<template>
  <div class="mo-task-peers">
    <div class="mo-peers-toolbar">
      <el-button-group>
        <el-button size="mini" :type="filterMode==='all'?'primary':'default'" @click="filterMode='all'">{{ $t('task.peers-filter-all') }} ({{ countAll }})</el-button>
        <el-button size="mini" :type="filterMode==='downloading'?'primary':'default'" @click="filterMode='downloading'">{{ $t('task.peers-filter-downloading') }} ({{ countDownloading }})</el-button>
        <el-button size="mini" :type="filterMode==='uploading'?'primary':'default'" @click="filterMode='uploading'">{{ $t('task.peers-filter-uploading') }} ({{ countUploading }})</el-button>
        <el-button size="mini" :type="filterMode==='idle'?'primary':'default'" @click="filterMode='idle'">{{ $t('task.peers-filter-idle') }} ({{ countIdle }})</el-button>
      </el-button-group>
      <el-input class="mo-peers-search" size="mini" :placeholder="$t('task.peers-search')" v-model="search" clearable />
    </div>
    <div class="mo-table-wrapper">
      <el-table
        stripe
        ref="peerTable"
        class="mo-peer-table"
        :data="filteredPeers"
      >
        <el-table-column
          :label="`${$t('task.task-peer-host')}: `"
          min-width="140">
          <template slot-scope="scope">
            {{ `${scope.row.ip}:${scope.row.port}` }}
          </template>
        </el-table-column>
        <el-table-column
          :label="`${$t('task.task-peer-client')}: `"
          min-width="125">
          <template slot-scope="scope">
            {{ scope.row.peerId | peerIdParser }}
          </template>
        </el-table-column>
        <el-table-column
          :label="`${$t('task.task-peer-downloaded')}`"
          align="right"
          width="100">
          <template slot-scope="scope">
            {{ scope.row.downloadLength | bytesToSize }}
          </template>
        </el-table-column>
        <el-table-column
          :label="`%`"
          align="right"
          width="55">
          <template slot-scope="scope">
            {{ scope.row.bitfield | bitfieldToPercent }}%
          </template>
        </el-table-column>
        <el-table-column
          :label="`↑`"
          align="right"
          width="90">
          <template slot-scope="scope">
            {{ scope.row.uploadSpeed | bytesToSize }}/s
          </template>
        </el-table-column>
        <el-table-column
          :label="`↓`"
          align="right"
          width="90">
          <template slot-scope="scope">
            {{ scope.row.downloadSpeed | bytesToSize }}/s
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script>
  import {
    bitfieldToPercent,
    bytesToSize,
    peerIdParser
  } from '@shared/utils'

  export default {
    name: 'mo-task-peers',
    filters: {
      bitfieldToPercent,
      bytesToSize,
      peerIdParser
    },
    props: {
      peers: {
        type: Array,
        default: function () {
          return []
        }
      },
      task: {
        type: Object,
        default: function () {
          return {}
        }
      }
    },
    data () {
      return {
        filterMode: 'all',
        search: ''
      }
    },
    computed: {
      filteredPeers () {
        const q = this.search.trim().toLowerCase()
        const list = (this.peers || [])
        const byMode = list.filter(p => {
          const up = Number(p.uploadSpeed) || 0
          const down = Number(p.downloadSpeed) || 0
          const percent = bitfieldToPercent(p.bitfield)
          switch (this.filterMode) {
          case 'downloading':
            return down > 0
          case 'uploading':
            return up > 0 || percent >= 100
          case 'idle':
            return up === 0 && down === 0
          default:
            return true
          }
        })
        if (!q) return byMode
        return byMode.filter(p => {
          const host = `${p.ip}:${p.port}`.toLowerCase()
          const client = peerIdParser(p.peerId).toLowerCase()
          return host.includes(q) || client.includes(q)
        })
      },
      countAll () { return (this.peers || []).length },
      countDownloading () { return (this.peers || []).filter(p => (Number(p.downloadSpeed) || 0) > 0).length },
      countUploading () {
        return (this.peers || []).filter(p => {
          const up = Number(p.uploadSpeed) || 0
          const percent = bitfieldToPercent(p.bitfield)
          return up > 0 || percent >= 100
        }).length
      },
      countIdle () { return (this.peers || []).filter(p => (Number(p.uploadSpeed) || 0) === 0 && (Number(p.downloadSpeed) || 0) === 0).length }
    },
    methods: {
    }
  }
</script>

<style lang="scss">
.el-table.mo-peer-table .cell {
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
.mo-peers-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.mo-peers-search {
  max-width: 220px;
}
</style>
