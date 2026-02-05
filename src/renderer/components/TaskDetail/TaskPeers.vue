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
          <span class="best-peer-value">{{ bestPeer.peerId | peerIdParser }}</span>
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
        :data="sortedPeers"
        :height="tableHeight"
        @sort-change="handleSortChange"
      >
        <el-table-column
          :label="$t('task.task-peer-host')"
          prop="ip"
          sortable
          min-width="140">
          <template slot-scope="scope">
            <el-tooltip :content="`${scope.row.ip}:${scope.row.port}`" placement="top" :disabled="!scope.row._hostOverflow">
              <span class="mo-peer-text" @mouseenter="handleTextMouseEnter($event, scope.row, '_hostOverflow')">{{ `${scope.row.ip}:${scope.row.port}` }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-location')"
          prop="ip"
          sortable
          min-width="80">
          <template slot-scope="scope">
            <el-tooltip :content="getLocationFromIp(scope.row.ip)" placement="top" :disabled="!scope.row._locationOverflow">
              <span class="mo-peer-text" @mouseenter="handleTextMouseEnter($event, scope.row, '_locationOverflow')">{{ getLocationFromIp(scope.row.ip) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-client')"
          prop="peerId"
          sortable
          min-width="125">
          <template slot-scope="scope">
            <el-tooltip :content="scope.row.peerId | peerIdParser" placement="top" :disabled="!scope.row._clientOverflow">
              <span class="mo-peer-text" @mouseenter="handleTextMouseEnter($event, scope.row, '_clientOverflow')">{{ scope.row.peerId | peerIdParser }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-downloaded')"
          prop="downloadLength"
          sortable
          align="right"
          width="110">
          <template slot-scope="scope">
            {{ scope.row.downloadLength | bytesToSize }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-progress')"
          prop="bitfield"
          sortable
          align="right"
          width="90">
          <template slot-scope="scope">
            {{ scope.row.bitfield | bitfieldToPercent(true) }}%
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-upload-speed')"
          prop="uploadSpeed"
          sortable
          align="right"
          width="110">
          <template slot-scope="scope">
            {{ scope.row.uploadSpeed | bytesToSize }}/s
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-download-speed')"
          prop="downloadSpeed"
          sortable
          align="right"
          width="110">
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
        tableHeight: '100%'
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
      }
    },
    methods: {
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
          if (row && row[overflowKey] !== overflow) {
            this.$set(row, overflowKey, overflow)
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
}
.el-table.mo-peer-table {
  .cell {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
  .mo-peer-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    // 渐隐效果
    mask-image: linear-gradient(to right, black 85%, transparent 100%);
    -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
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
.theme-dark .best-peer-label {
  color: #c0c4cc;
}
.theme-dark .best-peer-key {
  color: #909399;
}
.theme-dark .best-peer-value {
  color: #c0c4cc;
}
</style>
