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
    <div class="mo-best-peer" v-if="bestPeer">
      <div class="best-peer-label">{{ $t('task.best-peer') }}</div>
      <div class="best-peer-info">
        <div class="best-peer-item">
          <span class="best-peer-key">{{ $t('task.task-peer-host') }}:</span>
          <span class="best-peer-value">{{ bestPeer.ip }}:{{ bestPeer.port }}</span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ $t('task.task-peer-location') }}:</span>
          <span class="best-peer-value">{{ getLocationFromIp(bestPeer.ip) }}</span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ $t('task.task-peer-client') }}:</span>
          <span class="best-peer-value">{{ renderPeerClient(bestPeer.peerId) }}</span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ $t('task.task-peer-progress') }}:</span>
          <span class="best-peer-value">{{ bestPeer.bitfield | bitfieldToPercent }}%</span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ $t('task.task-peer-upload-speed') }}:</span>
          <span class="best-peer-value">{{ bestPeer.uploadSpeed | bytesToSize }}/s</span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ $t('task.task-peer-download-speed') }}:</span>
          <span class="best-peer-value">{{ bestPeer.downloadSpeed | bytesToSize }}/s</span>
        </div>
      </div>
    </div>
    <div class="mo-table-wrapper" ref="tableWrapper">
      <el-table
        stripe
        ref="peerTable"
        class="mo-peer-table"
        size="mini"
        :data="groupedPeers"
        :height="tableHeight"
        row-key="id"
        :expand-row-keys="expandedGroupKeys"
        :tree-props="{children: 'children', hasChildren: 'hasChildren'}"
        :span-method="handleSpanMethod"
        :row-class-name="getRowClassName"
        @sort-change="handleSortChange"
        @expand-change="handleExpandChange"
        @row-click="handleRowClick"
      >
        <el-table-column
          :label="$t('task.task-peer-host')"
          prop="ip"
          sortable="custom"
          min-width="140">
          <template slot-scope="scope">
            <template v-if="scope.row.isGroup">
              <span class="mo-peer-group-label">{{ scope.row.groupLabel }}</span>
            </template>
            <template v-else>
              <el-tooltip :content="`${scope.row.ip}:${scope.row.port}`" placement="top" :disabled="!peerOverflowMap[`${scope.row.ip}:${scope.row.port}-_hostOverflow`]">
                <span class="mo-peer-text" @mouseenter="handleTextMouseEnter($event, scope.row, '_hostOverflow')">{{ `${scope.row.ip}:${scope.row.port}` }}</span>
              </el-tooltip>
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-location')"
          prop="ip"
          sortable="custom"
          min-width="80">
          <template slot-scope="scope">
            <el-tooltip :content="getLocationFromIp(scope.row.ip)" placement="top" :disabled="!peerOverflowMap[`${scope.row.ip}:${scope.row.port}-_locationOverflow`]">
              <span class="mo-peer-text" @mouseenter="handleTextMouseEnter($event, scope.row, '_locationOverflow')">{{ getLocationFromIp(scope.row.ip) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-client')"
          prop="peerId"
          sortable="custom"
          min-width="125">
          <template slot-scope="scope">
            <el-tooltip :content="renderPeerClient(scope.row.peerId)" placement="top" :disabled="!peerOverflowMap[`${scope.row.ip}:${scope.row.port}-_clientOverflow`]">
              <span class="mo-peer-text" @mouseenter="handleTextMouseEnter($event, scope.row, '_clientOverflow')">{{ renderPeerClient(scope.row.peerId) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-connection-time')"
          prop="connectionTime"
          sortable="custom"
          min-width="120">
          <template slot-scope="scope">
            {{ formatDuration(scope.row.connectionTime) || '-' }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-downloaded')"
          prop="downloadLength"
          sortable="custom"
          align="right"
          width="110">
          <template slot-scope="scope">
            {{ scope.row.downloadLength | bytesToSize }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-progress')"
          prop="bitfield"
          sortable="custom"
          align="right"
          width="90">
          <template slot-scope="scope">
            {{ scope.row.bitfield | bitfieldToPercent(true) }}%
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-upload-speed')"
          prop="uploadSpeed"
          sortable="custom"
          align="right"
          width="110">
          <template slot-scope="scope">
            {{ scope.row.uploadSpeed | bytesToSize }}/s
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-download-speed')"
          prop="downloadSpeed"
          sortable="custom"
          align="right"
          width="110">
          <template slot-scope="scope">
            {{ scope.row.downloadSpeed | bytesToSize }}/s
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="mo-peers-bottom-bar"></div>
  </div>
</template>

<script>
  import {
    bitfieldToPercent,
    bytesToSize,
    peerIdParser,
    timeFormat
  } from '@shared/utils'
  import IP2Region from 'ip2region'

  // 初始化 ip2region 查询器
  let ipSearcher = null
  try {
    ipSearcher = new IP2Region()
  } catch (e) {
    console.warn('[TaskPeers] Failed to initialize ip2region:', e.message)
  }

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
        search: '',
        sortProp: 'downloadSpeed',
        sortOrder: 'descending',
        tableHeight: '100%',
        peerStartTimeMap: {},
        expandedGroupKeys: ['group-active'],
        peerOverflowMap: {}
      }
    },
    mounted () {
      // this.updateTableHeight()
      // window.addEventListener('resize', this.updateTableHeight)
    },
    beforeDestroy () {
      // window.removeEventListener('resize', this.updateTableHeight)
    },
    computed: {
      bestPeer () {
        const peers = this.peers || []
        if (peers.length === 0) return null
        // 找到下载速度最快的 peer
        return peers.reduce((best, current) => {
          const bestSpeed = Number(best.downloadSpeed) || 0
          const currentSpeed = Number(current.downloadSpeed) || 0
          return currentSpeed > bestSpeed ? current : best
        }, peers[0])
      },
      filteredPeers () {
        const q = this.search.trim().toLowerCase()
        const list = (this.peersWithTime || [])
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
      countIdle () { return (this.peers || []).filter(p => (Number(p.uploadSpeed) || 0) === 0 && (Number(p.downloadSpeed) || 0) === 0).length },
      sortedPeers () {
        const peers = this.filteredPeers
        if (!this.sortProp) return peers
        return [...peers].sort((a, b) => {
          let valA = a[this.sortProp]
          let valB = b[this.sortProp]
          // 处理 bitfield 排序（转换为百分比）
          if (this.sortProp === 'bitfield') {
            valA = bitfieldToPercent(valA)
            valB = bitfieldToPercent(valB)
          }
          // 处理位置排序（根据IP获取位置后排序）
          if (this.sortProp === 'ip') {
            valA = this.getLocationFromIp(valA)
            valB = this.getLocationFromIp(valB)
            // 字符串排序
            if (this.sortOrder === 'ascending') {
              return valA.localeCompare(valB, 'zh-CN')
            }
            return valB.localeCompare(valA, 'zh-CN')
          }
          // 处理客户端排序（解析peerId后排序）
          if (this.sortProp === 'peerId') {
            valA = peerIdParser(valA)
            valB = peerIdParser(valB)
            // 字符串排序
            if (this.sortOrder === 'ascending') {
              return valA.localeCompare(valB, 'zh-CN')
            }
            return valB.localeCompare(valA, 'zh-CN')
          }
          // 转换为数字进行比较
          valA = Number(valA) || 0
          valB = Number(valB) || 0
          if (this.sortOrder === 'ascending') {
            return valA - valB
          }
          return valB - valA
        })
      },
      peersWithTime () {
        const now = Date.now()
        return (this.peers || []).map(p => {
          const key = `${p.ip}:${p.port}`
          if (!this.peerStartTimeMap[key]) {
            this.$set(this.peerStartTimeMap, key, now)
          }
          return {
            ...p,
            connectionTime: Math.floor((now - this.peerStartTimeMap[key]) / 1000)
          }
        })
      },
      groupedPeers () {
        const peers = this.sortedPeers
        if (!peers || peers.length === 0) return []

        const active = []
        const inactive = []

        peers.forEach(p => {
          const downloadSpeed = Number(p.downloadSpeed) || 0
          const uploadSpeed = Number(p.uploadSpeed) || 0
          const hasTraffic = downloadSpeed > 0 || uploadSpeed > 0

          const clientName = this.renderPeerClient(p.peerId)
          const isUnknown = clientName === this.$t('task.peer-client-unknown') || clientName === 'task.peer-client-unknown'

          // 活跃节点判定规则：
          // 1. 已知客户端 (Recognized Client)
          // 2. 或者是活跃节点 (Has Traffic) -> 即使客户端未知也视为活跃
          if (!isUnknown || hasTraffic) {
            active.push(p)
          } else {
            inactive.push(p)
          }
        })

        const result = []
        if (active.length > 0) {
          result.push({
            id: 'group-active',
            isGroup: true,
            groupLabel: `${this.$t('task.peers-active-nodes')} (${active.length})`,
            children: active.map(p => ({ ...p, id: `${p.peerId}-${p.ip}:${p.port}` }))
          })
        }
        if (inactive.length > 0) {
          result.push({
            id: 'group-inactive',
            isGroup: true,
            groupLabel: `${this.$t('task.peers-inactive-nodes')} (${inactive.length})`,
            children: inactive.map(p => ({ ...p, id: `${p.peerId}-${p.ip}:${p.port}` }))
          })
        }
        return result
      }
    },
    watch: {
      peers: {
        handler (newList) {
          const now = Date.now()
          const nextMap = { ...this.peerStartTimeMap }
          let changed = false
          const currentKeys = new Set()

          newList.forEach(p => {
            const key = `${p.ip}:${p.port}`
            currentKeys.add(key)
            if (!nextMap[key]) {
              nextMap[key] = now
              changed = true
            }
          })

          // Cleanup old peers? maybe not needed or beneficial to keep for a while
          // but if we want to be strict:
          Object.keys(nextMap).forEach(key => {
            if (!currentKeys.has(key)) {
              delete nextMap[key]
              changed = true
            }
          })

          if (changed) {
            this.peerStartTimeMap = nextMap
          }
        },
        immediate: true
      }
    },
    methods: {
      renderPeerClient (peerId) {
        const result = peerIdParser(peerId)
        if (result === 'task.peer-client-unknown') {
          return this.$t('task.peer-client-unknown')
        }
        return result
      },
      formatDuration (seconds) {
        if (seconds <= 0) return '0s'
        const i18n = {
          hour: this.$t('app.hour') || 'h',
          minute: this.$t('app.minute') || 'm',
          second: this.$t('app.second') || 's'
        }
        return timeFormat(seconds, { i18n })
      },
      updateTableHeight () {
        // height="100%" handled by CSS
      },
      handleSortChange ({ prop, order }) {
        this.sortProp = prop || 'downloadSpeed'
        this.sortOrder = order || 'descending'
      },
      handleTextMouseEnter (event, row, overflowKey) {
        try {
          const el = event && event.currentTarget
          const overflow = !!(el && el.scrollWidth > el.clientWidth + 1)
          const id = `${row.ip}:${row.port}-${overflowKey}`
          if (this.peerOverflowMap[id] !== overflow) {
            this.$set(this.peerOverflowMap, id, overflow)
          }
        } catch (e) {}
      },
      getLocationFromIp (ip) {
        if (!ip) return '-'
        // 使用 ip2region 查询地理位置
        if (ipSearcher) {
          try {
            const result = ipSearcher.search(ip)
            if (result) {
              // 返回国家或地区信息
              const country = result.country || result.nation
              const province = result.province
              const city = result.city
              // 优先显示国家，如果没有则显示省份或城市
              if (country && country !== '0') return country
              if (province && province !== '0') return province
              if (city && city !== '0') return city
            }
          } catch (e) {
            console.warn('[TaskPeers] ip2region search failed:', e.message)
          }
        }
        return '-'
      },
      handleExpandChange (row, expanded) {
        if (row.isGroup) {
          if (expanded) {
            if (!this.expandedGroupKeys.includes(row.id)) {
              this.expandedGroupKeys.push(row.id)
            }
          } else {
            this.expandedGroupKeys = this.expandedGroupKeys.filter(k => k !== row.id)
          }
        }
      },
      handleSpanMethod ({ row, column, rowIndex, columnIndex }) {
        if (row.isGroup) {
          if (columnIndex === 0) {
            return [1, 8]
          } else {
            return [0, 0]
          }
        }
      },
      getRowClassName ({ row }) {
        if (row.isGroup) {
          return 'mo-peer-group-row'
        }
        return ''
      },
      handleRowClick (row) {
        if (row.isGroup) {
          this.$refs.peerTable.toggleRowExpansion(row)
        }
      }
    }
  }
</script>

<style lang="scss">
.mo-task-peers {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.mo-table-wrapper {
  flex: 1;
  overflow: hidden;
  min-height: 200px;
  position: relative;
}
.mo-peers-bottom-bar {
  height: 1px;
  background-color: #ebeef5;
}
.el-table.mo-peer-table {
  height: 100% !important;
  border: none !important;
  &::before {
    display: none !important;
  }
  th.el-table__cell {
    border-bottom: none !important;
  }
  .cell {
    padding-left: 10px !important;
    padding-right: 10px !important;
  }
  .mo-peer-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    // 渐隐效果 - 始终启用，通过渐变锚点控制，仅在内容接近末尾时生效
    mask-image: linear-gradient(to right, black calc(100% - 20px), transparent 100%);
    -webkit-mask-image: linear-gradient(to right, black calc(100% - 20px), transparent 100%);
  }
  .mo-peer-group-label {
    font-weight: 600;
    color: #606266;
    font-size: 13px;
    line-height: 1;
    margin-left: 4px;
    vertical-align: middle;
  }
  .mo-peer-group-row {
    background-color: #f5f7fa !important;
    cursor: pointer;
  }
  // 严格强制单行高度并修复对齐
  .el-table__row {
    height: 32px !important;
    td {
      padding: 0 !important;
      .cell {
        line-height: 32px !important;
        height: 32px !important;
        display: flex;
        align-items: center;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        // 确保内边距与表头一致 (Element UI 默认 10px)
        padding-left: 10px !important;
        padding-right: 10px !important;
      }
      // 根据 Element UI 的类名处理水平对齐
      &.is-right .cell {
        justify-content: flex-end;
        text-align: right;
      }
      &.is-center .cell {
        justify-content: center;
        text-align: center;
      }
    }
  }
  // 树形结构图标对齐
  .el-table__indent, .el-table__placeholder {
    margin: 0 !important;
    vertical-align: middle;
    display: inline-block;
  }
  .el-table__expand-icon {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    height: 32px !important;
    width: 24px !important;
    line-height: 32px !important;
    margin: 0 !important;
    cursor: pointer;
    // 修复旋转时可能产生的偏移
    transition: transform 0.2s ease-in-out;
    .el-icon {
      font-size: 14px;
      line-height: 1;
    }
  }
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
.mo-best-peer {
  background: transparent;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  overflow-x: auto;
  white-space: nowrap;
}
.best-peer-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}
.best-peer-info {
  display: flex;
  flex-wrap: nowrap;
  gap: 16px;
}
.best-peer-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.best-peer-key {
  color: #909399;
}
.best-peer-value {
  color: #606266;
  font-weight: 500;
}

// 暗色主题适配 - 与 el-table 保持一致
.theme-dark .mo-best-peer {
  background: transparent;
  border-color: #404040;
}
.theme-dark .mo-peers-bottom-bar {
  background-color: #333;
}
.theme-dark .best-peer-label {
  color: #c0c4cc;
}
.theme-dark .best-peer-key {
  color: #909399;
}
.theme-dark .best-peer-value {
  color: #c0c4cc;
}
.theme-dark .mo-peer-group-row {
  background-color: transparent !important;
}
.theme-dark .mo-peer-group-label {
  color: #c0c4cc;
}
.theme-dark .mo-peer-table {
  background-color: transparent;
  .el-table__row {
    background-color: transparent;
  }
  .el-table__body tr:hover > td {
    background-color: rgba(255, 255, 255, 0.05) !important;
  }
  .mo-peer-group-row {
    background-color: transparent !important;
    color: #c0c4cc;
    .mo-peer-group-label {
      color: #c0c4cc;
    }
    &:hover > td {
      background-color: rgba(255, 255, 255, 0.08) !important;
    }
  }
  .el-table__expand-icon {
    color: #909399;
  }
  // 覆盖表头背景
  th.el-table__cell {
    background-color: #1a1a1a !important;
    color: #909399 !important;
    border-bottom: none !important;
  }
  .el-table__body-wrapper {
    background-color: transparent !important;
  }
  .el-table--border::after, .el-table--group::after, .el-table::before {
    display: none !important;
  }
}
</style>
