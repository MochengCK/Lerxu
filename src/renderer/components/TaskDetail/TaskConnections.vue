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
      <el-icon><Connection /></el-icon>
      <p>{{ connectionsData && connectionsData.emptyText ? connectionsData.emptyText : t('task.no-connections') }}</p>
    </div>
    <div class="mo-connections-loading" v-if="initialLoading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <p>{{ t('task.loading-connections') }}</p>
    </div>
    <div class="mo-table-wrapper" v-if="!initialLoading && serverList.length > 0">
      <el-table
        class="mo-connection-table"
        :data="serverList"
        :row-key="row => row._key"
        size="small"
        height="450"
      >
        <el-table-column
          :label="t('task.connection-host')"
          min-width="150"
        >
          <template #default="scope">
            <mo-hover-tip :content="scope.row.host" placement="top" :disabled="!scope.row._hostOverflow">
              <span class="mo-conn-host" @mouseenter="handleHostMouseEnter($event, scope.row)">{{ scope.row.host }}</span>
            </mo-hover-tip>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-downloaded')"
          width="120"
          align="right"
        >
          <template #default="scope">
            {{ scope.row.downloaded }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.connection-speed')"
          width="120"
          align="right"
        >
          <template #default="scope">
            <span :class="{ 'speed-active': scope.row.isActive }">
              {{ scope.row.speed }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.connection-status')"
          width="80"
          align="center"
        >
          <template #default="scope">
            <el-tag
              size="small"
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

<script setup>
import { ref, computed, watch, onMounted, onActivated, onBeforeUnmount } from 'vue'
import { bytesToSize, checkTaskIsSeeder } from '@shared/utils'
import api from '@/api'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例

const { t } = i18n.global

const props = defineProps({
  task: {
    type: Object,
    default: () => ({})
  }
})

defineOptions({ name: 'mo-task-connections' })

const connectionsData = ref(null)
const loading = ref(false)
const initialLoading = ref(true)
let fetchTimer = null

const hasSummary = computed(() => connectionsData.value && connectionsData.value.servers && connectionsData.value.servers.length > 0)
const totalConnections = computed(() => connectionsData.value && connectionsData.value.totalValue ? parseInt(connectionsData.value.totalValue) : 0)
const activeConnections = computed(() => connectionsData.value && connectionsData.value.activeValue ? parseInt(connectionsData.value.activeValue) : 0)
const taskDownloadSpeed = computed(() => Number(props.task && props.task.downloadSpeed) || 0)
const serverList = computed(() => (connectionsData.value && connectionsData.value.servers) || [])

function handleHostMouseEnter (event, row) {
  try {
    const el = event && event.currentTarget
    const overflow = !!(el && el.scrollWidth > el.clientWidth + 1)
    if (row && row._hostOverflow !== overflow) {
      row['_hostOverflow'] = overflow
    }
  } catch (e) {}
}

function resetAndFetch () {
  connectionsData.value = null
  initialLoading.value = true
  fetchConnections()
}

function debouncedFetchConnections () {
  if (fetchTimer) clearTimeout(fetchTimer)
  fetchTimer = setTimeout(() => { fetchConnections() }, 300)
}

async function fetchConnections () {
  const gid = props.task && props.task.gid
  if (!gid) {
    connectionsData.value = null
    initialLoading.value = false
    return
  }
  loading.value = true
  try {
    const servers = await api.fetchTaskServers({ gid })
    const taskSpeed = Number(props.task.downloadSpeed) || 0
    connectionsData.value = buildConnectionsData(servers, taskSpeed)
  } catch (err) {
    console.warn('[TaskConnections] fetchConnections error:', err.message)
    if (initialLoading.value) {
      connectionsData.value = buildConnectionsData([], taskDownloadSpeed.value)
    }
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

function buildConnectionsData (servers = [], taskSpeed = 0) {
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
        if (isActive) activeConnections++
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
          status: isActive ? t('task.connection-status-active') : t('task.connection-status-idle'),
          _key: `${fileIndex}-${serverIndex}-${host}`
        })
      })
    })
  }

  return {
    totalLabel: t('task.connections-total'),
    totalValue: String(totalConnections),
    activeLabel: t('task.connections-active'),
    activeValue: String(activeConnections),
    speedLabel: t('task.connections-total-speed'),
    speedValue: `${bytesToSize(taskSpeed, 2)}/s`,
    servers: serverList,
    emptyText: t('task.no-connections')
  }
}

onMounted(() => { resetAndFetch() })
onActivated(() => { resetAndFetch() })

onBeforeUnmount(() => {
  if (fetchTimer) {
    clearTimeout(fetchTimer)
    fetchTimer = null
  }
})

watch(() => props.task?.gid, (newGid, oldGid) => {
  if (newGid && newGid !== oldGid) resetAndFetch()
})

watch(() => props.task?.status, (newStatus) => {
  const isSeeding = checkTaskIsSeeder(props.task)
  if (newStatus === 'paused' || newStatus === 'error' || newStatus === 'removed' ||
    (newStatus === 'complete' && !isSeeding)) {
    connectionsData.value = null
    initialLoading.value = false
  } else if (newStatus === 'active' || newStatus === 'waiting' || isSeeding) {
    resetAndFetch()
  }
})

watch(() => props.task?.downloadSpeed, () => {
  if (props.task && props.task.status === 'active') debouncedFetchConnections()
})

watch(() => props.task?.connections, () => {
  if (props.task && props.task.status === 'active') debouncedFetchConnections()
})
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
border: 1px solid var(--lc-border-base);
    border-radius: 8px;
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
      text-overflow: ellipsis;
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
    background: var(--lc-table-striped-bg, #1a1e24);
    border-radius: 8px;

    .summary-label {
      color: var(--lc-text-secondary);
    }

    .summary-value {
      color: var(--lc-text-primary);
    }
  }

  .mo-connections-empty,
  .mo-connections-loading {
    color: var(--lc-text-secondary);
  }

  .mo-table-wrapper {
    border-color: var(--lc-border-base) !important;
    background-color: var(--lc-task-item-bg) !important;
  }

  .mo-connection-table {
    background-color: transparent !important;
    color: var(--lc-text-regular) !important;

    .el-table__inner-wrapper {
      background-color: transparent !important;
    }
    .el-table__header-wrapper,
    .el-table__body-wrapper,
    .el-table__footer-wrapper {
      background-color: transparent !important;
    }
    .el-table__header,
    .el-table__body,
    .el-table__footer {
      background-color: transparent !important;
    }
    .el-table__row {
      background-color: transparent !important;
    }
    th.el-table__cell {
      background-color: var(--lc-table-th-bg) !important;
      color: var(--lc-text-secondary) !important;
      border-bottom: none !important;
    }
    // 悬停高亮：强制覆盖 Element UI 默认白色背景
    .el-table__body tr:hover > td,
    .el-table__body tr:hover > td.el-table__cell,
    .el-table--enable-row-hover .el-table__body tr:hover > td {
      background-color: var(--lc-table-hover-bg) !important;
    }
    td.el-table__cell {
      background-color: transparent !important;
      color: var(--lc-text-regular) !important;
      border-bottom: 1px solid var(--lc-border-base) !important;
    }
    .el-table__empty-block {
      background-color: transparent !important;
    }
    .el-table__empty-text {
      color: var(--lc-text-placeholder) !important;
    }
    &::before, &::after {
      display: none !important;
    }
  }
}
</style>
