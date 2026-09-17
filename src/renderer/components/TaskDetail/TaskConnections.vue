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
            <mo-hover-tip effect="dark" :content="scope.row.host" placement="top" :open-delay="300" :disabled="!scope.row._hostOverflow || !scope.row.host">
              <span class="mo-conn-host" :class="{ 'is-truncated': scope.row._hostOverflow }" @mouseenter="handleHostMouseEnter($event, scope.row)">{{ scope.row.host }}</span>
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
            <span class="mo-conn-status" :class="scope.row.isActive ? 'is-active' : 'is-idle'">
              {{ scope.row.status }}
            </span>
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
/* 连接表格样式与节点（Node/Peer）表格对齐：透明底、无表头分隔线、
   32px 行高、行内 1px 分隔、溢出渐隐，保证详情页内各表格观感统一 */
.mo-task-connections {
  .mo-connections-summary {
    margin-bottom: 12px;
    padding: 12px;
    background: transparent;
    border: 1px solid var(--lc-border-base);
    border-radius: 8px;

    .summary-item {
      text-align: center;

      .summary-label {
        font-size: 12px;
        color: var(--el-text-color-secondary);
        margin-bottom: 4px;
      }

      .summary-value {
        font-size: 18px;
        font-weight: 600;
        color: var(--lc-text-primary);
      }
    }
  }

  .mo-connections-empty,
  .mo-connections-loading {
    text-align: center;
    padding: 40px 0;
    color: var(--el-text-color-secondary);

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
    border: 1px solid var(--lc-border-base);
    border-radius: 8px;
    overflow: hidden;
    box-sizing: border-box;
  }

  .el-table.mo-connection-table {
    border: none !important;
    border-radius: 8px;
    &::before, &::after {
      display: none !important;
    }
    // 修复滚动条出现时表头错位问题（针对自定义滚动条优化）
    th.gutter, colgroup.gutter {
      display: none !important;
      width: 0 !important;
    }
    .el-table__header colgroup col[name="gutter"] {
      display: none !important;
      width: 0 !important;
    }
    // 修复底部边框重复导致粗细不一
    .el-table__body tr:last-child td {
      border-bottom: none !important;
    }
    th.el-table__cell {
      border-bottom: none !important;
    }
    .cell {
      padding-left: 10px !important;
      padding-right: 10px !important;
    }
    /* mo-hover-tip trigger 默认 inline-flex 会撑开宽度，
       改为 block 并限制宽度，确保 text-overflow 和溢出检测生效 */
    .lc-hover-tip__trigger {
      display: block;
      overflow: hidden;
    }
    .mo-conn-host {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      position: relative;
      text-overflow: clip; /* 不使用 ellipsis，避免双重省略效果 */
      /* 文本被截断时右侧渐隐，避免硬截断突兀 */
      &.is-truncated {
        -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 85%, rgba(0, 0, 0, 0));
        mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 85%, rgba(0, 0, 0, 0));
      }
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
          padding-left: 10px !important;
          padding-right: 10px !important;
        }
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
    .speed-active {
      color: #67c23a;
      font-weight: 500;
    }
    .mo-conn-status {
      &.is-active {
        color: #67c23a;
        font-weight: 500;
      }
      &.is-idle {
        color: var(--el-text-color-secondary);
      }
    }
  }
}

// 暗色主题适配
.theme-dark .mo-task-connections {
  .mo-connections-summary {
    background: transparent;
    border-color: var(--lc-border-base);

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

  .el-table.mo-connection-table {
    border-color: transparent !important;
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
    // 悬停高亮：强制覆盖 Element UI 默认白色背景
    .el-table__body tr:hover > td,
    .el-table__body tr:hover > td.el-table__cell,
    .el-table--enable-row-hover .el-table__body tr:hover > td {
      background-color: var(--lc-table-hover-bg) !important;
    }
    &.el-table thead th,
    &.el-table thead th.el-table__cell,
    &.el-table thead th.is-leaf,
    &.el-table thead th.el-table__cell.is-leaf {
      background-color: transparent !important;
      color: var(--lc-text-secondary) !important;
      border-bottom: none !important;
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
    .mo-conn-status.is-idle {
      color: var(--lc-text-secondary);
    }
    &::before, &::after {
      display: none !important;
    }
  }
}
</style>
