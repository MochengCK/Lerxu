<template>
  <div class="mo-task-connections">
    <div class="mo-connections-summary" v-if="hasSummary">
      <el-row :gutter="16">
        <el-col :span="8">
          <div class="summary-item">
            <div class="summary-label">{{ connectionsData && connectionsData.totalLabel }}</div>
            <div class="summary-value">{{ connectionsData && connectionsData.totalValue }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="summary-item">
            <div class="summary-label">{{ connectionsData && connectionsData.activeLabel }}</div>
            <div class="summary-value">{{ connectionsData && connectionsData.activeValue }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="summary-item">
            <div class="summary-label">{{ connectionsData && connectionsData.speedLabel }}</div>
            <div class="summary-value">{{ connectionsData && connectionsData.speedValue }}</div>
          </div>
        </el-col>
      </el-row>
    </div>
      <div class="mo-connections-empty" v-if="!loading && !hasSummary && !initialLoading">
      <i class="el-icon-connection"></i>
      <p>{{ connectionsData && connectionsData.emptyText ? connectionsData.emptyText : $t('task.no-connections') }}</p>
    </div>
    <div class="mo-connections-loading" v-if="initialLoading">
      <i class="el-icon-loading"></i>
      <p>{{ $t('task.loading-connections') }}</p>
    </div>
    <div class="mo-table-wrapper" v-if="!initialLoading && serverList.length > 0">
      <el-table
        stripe
        class="mo-connection-table"
        :data="serverList"
        :row-key="row => row._key"
        size="mini"
        height="450"
      >
        <el-table-column
          :label="$t('task.connection-host')"
          min-width="150"
        >
          <template slot-scope="scope">
            <el-tooltip :content="scope.row.host" placement="top" :disabled="!scope.row._hostOverflow">
              <span class="mo-conn-host" @mouseenter="handleHostMouseEnter($event, scope.row)">{{ scope.row.host }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-peer-downloaded')"
          width="120"
          align="right"
        >
          <template slot-scope="scope">
            {{ scope.row.downloaded }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.connection-speed')"
          width="120"
          align="right"
        >
          <template slot-scope="scope">
            <span :class="{ 'speed-active': scope.row.isActive }">
              {{ scope.row.speed }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.connection-status')"
          width="80"
          align="center"
        >
          <template slot-scope="scope">
            <el-tag
              size="mini"
              :type="scope.row.isActive ? 'success' : 'info'"
            >
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script>
  import { bytesToSize, checkTaskIsSeeder } from '@shared/utils'
  import api from '@/api'

  export default {
    name: 'mo-task-connections',
    filters: {
      bytesToSize
    },
    props: {
      task: {
        type: Object,
        default: () => ({})
      }
    },
    data () {
      return {
        connectionsData: null,
        loading: false,
        initialLoading: true,
        fetchTimer: null
      }
    },
    computed: {
      hasSummary () {
        return this.connectionsData && this.connectionsData.servers && this.connectionsData.servers.length > 0
      },
      totalConnections () {
        return this.connectionsData && this.connectionsData.totalValue ? parseInt(this.connectionsData.totalValue) : 0
      },
      activeConnections () {
        return this.connectionsData && this.connectionsData.activeValue ? parseInt(this.connectionsData.activeValue) : 0
      },
      taskDownloadSpeed () {
        return Number(this.task && this.task.downloadSpeed) || 0
      },
      serverList () {
        return (this.connectionsData && this.connectionsData.servers) || []
      }
    },
    mounted () {
      this.resetAndFetch()
    },
    activated () {
      this.resetAndFetch()
    },
    beforeDestroy () {
      // 清理定时器
      if (this.fetchTimer) {
        clearTimeout(this.fetchTimer)
        this.fetchTimer = null
      }
    },
    watch: {
      'task.gid': {
        handler (newGid, oldGid) {
          if (newGid && newGid !== oldGid) {
            this.resetAndFetch()
          }
        }
      },
      'task.status': {
        handler (newStatus) {
          // 检查是否在做种，做种时不清空连接数据
          const isSeeding = checkTaskIsSeeder(this.task)
          // 只在任务暂停、完成（非做种）、停止或出错时，清空连接列表
          if (newStatus === 'paused' || newStatus === 'stopped' || newStatus === 'error' || newStatus === 'removed' ||
            (newStatus === 'complete' && !isSeeding)) {
            this.connectionsData = null
            this.initialLoading = false
          } else if (newStatus === 'active' || newStatus === 'waiting' || isSeeding) {
            // 任务活跃、等待或做种时获取连接信息
            this.resetAndFetch()
          }
        }
      },
      'task.downloadSpeed': {
        handler () {
          // 下载速度变化时更新（下载中时会频繁变化）
          if (this.task && this.task.status === 'active') {
            this.debouncedFetchConnections()
          }
        }
      },
      'task.connections': {
        handler () {
          // 连接数变化时也更新
          if (this.task && this.task.status === 'active') {
            this.debouncedFetchConnections()
          }
        }
      }
    },
    methods: {
      handleHostMouseEnter (event, row) {
        try {
          const el = event && event.currentTarget
          const overflow = !!(el && el.scrollWidth > el.clientWidth + 1)
          if (row && row._hostOverflow !== overflow) {
            this.$set(row, '_hostOverflow', overflow)
          }
        } catch (e) {}
      },
      resetAndFetch () {
        this.connectionsData = null
        this.initialLoading = true
        this.fetchConnections()
      },
      debouncedFetchConnections () {
        // 防抖：100ms 内只调用一次 fetchConnections
        if (this.fetchTimer) {
          clearTimeout(this.fetchTimer)
        }
        this.fetchTimer = setTimeout(() => {
          this.fetchConnections()
        }, 100)
      },
      async fetchConnections () {
        const gid = this.task && this.task.gid
        if (!gid) {
          this.connectionsData = null
          this.initialLoading = false
          return
        }

        this.loading = true
        try {
          const servers = await api.fetchTaskServers({ gid })
          const taskSpeed = Number(this.task.downloadSpeed) || 0
          this.connectionsData = this.buildConnectionsData(servers, taskSpeed)
        } catch (err) {
          console.warn('[TaskConnections] fetchConnections error:', err.message)
          if (this.initialLoading) {
            this.connectionsData = this.buildConnectionsData([], this.taskDownloadSpeed)
          }
        } finally {
          this.loading = false
          this.initialLoading = false
        }
      },
      buildConnectionsData (servers = [], taskSpeed = 0) {
        let totalConnections = 0
        let activeConnections = 0
        const serverList = []

        if (Array.isArray(servers)) {
          servers.forEach((file, fileIndex) => {
            const fileServers = file.servers || []
            fileServers.forEach((server, serverIndex) => {
              totalConnections++
              const speed = Number(server.downloadSpeed) || 0
              const isActive = speed > 0
              if (isActive) {
                activeConnections++
              }
              // 提取主机名
              let host = '-'
              const uri = server.currentUri || server.uri || ''
              if (uri) {
                try {
                  const url = new URL(uri)
                  host = url.hostname
                } catch (e) {
                  const match = uri.match(/:\/\/([^/:]+)/)
                  host = match ? match[1] : uri
                }
              }
              serverList.push({
                host,
                speed: `${bytesToSize(speed, 2)}/s`,
                downloaded: bytesToSize(Number(server.downloadLength) || 0, 2),
                isActive,
                status: isActive ? this.$t('task.connection-status-active') : this.$t('task.connection-status-idle'),
                _key: `${fileIndex}-${serverIndex}-${host}`
              })
            })
          })
        }

        return {
          totalLabel: this.$t('task.connections-total'),
          totalValue: String(totalConnections),
          activeLabel: this.$t('task.connections-active'),
          activeValue: String(activeConnections),
          speedLabel: this.$t('task.connections-total-speed'),
          speedValue: `${bytesToSize(taskSpeed, 2)}/s`,
          servers: serverList,
          emptyText: this.$t('task.no-connections')
        }
      }
    }
  }
</script>

<style lang="scss">
.mo-task-connections {
  .mo-connections-summary {
    margin-bottom: 16px;
    padding: 12px;
    background: var(--task-detail-summary-bg, #f5f7fa);
    border-radius: 4px;

    .summary-item {
      text-align: center;

      .summary-label {
        font-size: 12px;
        color: #909399;
        margin-bottom: 4px;
      }

      .summary-value {
        font-size: 18px;
        font-weight: 600;
        color: #303133;
      }
    }
  }

  .mo-connections-empty,
  .mo-connections-loading {
    text-align: center;
    padding: 40px 0;
    color: #909399;

    i {
      font-size: 48px;
      margin-bottom: 12px;
    }

    p {
      margin: 0;
      font-size: 14px;
    }
  }

  .mo-table-wrapper {
    max-height: 450px;
    overflow-y: auto;
    border: 1px solid #ebeef5;
    border-radius: 4px;
  }

  .mo-connection-table {
    .cell {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }

    .mo-conn-host {
      display: block;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: clip;
      -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) calc(100% - 18px), rgba(0, 0, 0, 0) 100%);
      mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) calc(100% - 18px), rgba(0, 0, 0, 0) 100%);
    }

    .speed-active {
      color: #67c23a;
      font-weight: 500;
    }
  }
}

// 暗色主题适配
.theme-dark .mo-task-connections {
  .mo-connections-summary {
    background: var(--task-detail-summary-bg, #2c2c2c);

    .summary-value {
      color: #e0e0e0;
    }
  }

  .mo-table-wrapper {
    border-color: #404040;
  }
}
</style>
