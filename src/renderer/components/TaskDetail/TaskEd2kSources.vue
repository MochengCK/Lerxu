<template>
  <div class="mo-task-ed2k-sources">
    <!-- ED2K Server & KAD info summary -->
    <div class="mo-ed2k-summary">
      <div class="ed2k-summary-item" v-if="ed2kMeta.serverAddr">
        <span class="ed2k-summary-label">{{ t('task.ed2k-source-server') }}:</span>
        <span class="ed2k-summary-value">{{ ed2kMeta.serverAddr }}:{{ ed2kMeta.serverPort }}</span>
      </div>
      <div class="ed2k-summary-item">
        <span class="ed2k-summary-label">{{ t('task.ed2k-source-kad') }}:</span>
        <span class="ed2k-summary-value">{{ kadStatusText }}</span>
      </div>
      <div class="ed2k-summary-item">
        <span class="ed2k-summary-label">{{ t('task.task-connections') }}:</span>
        <span class="ed2k-summary-value">{{ allSources.length }}</span>
      </div>
    </div>

    <!-- Sources table -->
    <div class="mo-table-wrapper" ref="tableWrapper">
      <el-table
        ref="sourceTable"
        class="mo-ed2k-source-table"
        size="small"
        :data="groupedSources"
        :height="tableHeight"
        row-key="id"
        :expand-row-keys="expandedGroupKeys"
        :tree-props="{children: 'children', hasChildren: 'hasChildren'}"
        :span-method="handleSpanMethod"
        :row-class-name="getRowClassName"
        :empty-text="t('task.ed2k-source-no-sources')"
        @row-click="handleRowClick"
      >
        <el-table-column
          :label="t('task.ed2k-source-host')"
          prop="addr"
          min-width="160">
          <template #default="scope">
            <template v-if="scope.row.isGroup">
              <span class="mo-source-group-label">{{ scope.row.groupLabel }}</span>
            </template>
            <template v-else>
              <span class="mo-source-text">{{ scope.row.addr }}:{{ scope.row.port }}</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.ed2k-source-state')"
          prop="ed2kState"
          min-width="100">
          <template #default="scope">
            <template v-if="!scope.row.isGroup">
              <span :class="['ed2k-state-tag', `ed2k-state-${scope.row.ed2kState.toLowerCase()}`]">
                {{ stateText(scope.row.ed2kState) }}
              </span>
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.ed2k-source-queue')"
          prop="queuePosition"
          min-width="80"
          align="center">
          <template #default="scope">
            <template v-if="!scope.row.isGroup">
              <span v-if="scope.row.queuePosition >= 0">{{ scope.row.queuePosition }}</span>
              <span v-else>-</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.ed2k-source-parts')"
          min-width="100"
          align="center">
          <template #default="scope">
            <template v-if="!scope.row.isGroup && scope.row.totalParts > 0">
              {{ scope.row.availableParts }} / {{ scope.row.totalParts }}
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, getCurrentInstance } from 'vue'
import { useTaskStore } from '@/store/task'
import { storeToRefs } from 'pinia'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例

const { t } = i18n.global
const instance = getCurrentInstance()

const taskStore = useTaskStore()
const { currentTaskPeers } = storeToRefs(taskStore)

const GROUP_CONFIG = [
  { key: 'connected', states: ['CONNECTED', 'DOWNLOADING', 'QUEUED'] },
  { key: 'attempting', states: ['CONNECTING', 'NEW'] },
  { key: 'disconnected', states: ['FAILED'] },
  { key: 'banned', states: ['EXPIRED'] }
]

const props = defineProps({
  peers: {
    type: [Object, Array],
    default: () => ({ connected: [], attempting: [], banned: [], disconnected: [] })
  },
  task: {
    type: Object,
    default: () => ({})
  }
})

defineOptions({ name: 'mo-task-ed2k-sources' })

const tableWrapper = ref(null)
const sourceTable = ref(null)
const tableHeight = ref(300)
const expandedGroupKeys = ref([])

const peersData = computed(() => {
  if (currentTaskPeers.value && typeof currentTaskPeers.value === 'object') {
    return currentTaskPeers.value
  }
  return { connected: [], attempting: [], banned: [], disconnected: [] }
})

const ed2kMeta = computed(() => {
  if (currentTaskPeers.value && currentTaskPeers.value.ed2kMeta) {
    return currentTaskPeers.value.ed2kMeta
  }
  return { serverAddr: '', serverPort: 0, kadEnabled: false, kadState: '' }
})

const kadStatusText = computed(() => {
  if (!ed2kMeta.value.kadEnabled) return t('task.ed2k-kad-disabled')
  const state = ed2kMeta.value.kadState
  if (!state) return t('task.ed2k-kad-disabled')
  const key = `task.ed2k-kad-${state}`
  const translated = t(key)
  return translated === key ? state : translated
})

const allSources = computed(() => {
  const result = []
  for (const group of GROUP_CONFIG) {
    const list = peersData.value[group.key] || []
    list.forEach(item => {
      result.push({
        addr: item.ip || item.addr || '',
        port: item.port || '',
        ed2kState: item.ed2kState || 'NEW',
        queuePosition: Number(item.queuePosition || -1),
        availableParts: Number(item.availableParts || 0),
        totalParts: Number(item.totalParts || 0),
        source: item.source || 'ed2k'
      })
    })
  }
  return result
})

const groupedSources = computed(() => {
  const groups = []
  let idx = 0
  for (const group of GROUP_CONFIG) {
    const items = allSources.value.filter(s => group.states.includes(s.ed2kState))
    if (items.length === 0) continue
    const groupKey = `group-${idx++}`
    const groupLabels = {
      connected: t('task.peers-connected'),
      attempting: t('task.peers-attempting'),
      disconnected: t('task.peers-disconnected'),
      banned: t('task.peers-banned')
    }
    groups.push({
      id: groupKey,
      isGroup: true,
      groupLabel: `${groupLabels[group.key]} (${items.length})`,
      children: items.map((item, i) => ({
        id: `${groupKey}-${i}`,
        ...item
      }))
    })
  }
  return groups
})

function updateTableHeight () {
  if (!tableWrapper.value) return
  const rect = tableWrapper.value.getBoundingClientRect()
  if (rect.height > 0) {
    tableHeight.value = Math.max(200, rect.height)
  }
}

function stateText (state) {
  const key = `task.ed2k-source-state-${state}`
  const translated = t(key)
  return translated === key ? state : translated
}

function getRowClassName ({ row }) {
  if (row.isGroup) return 'ed2k-source-group-row'
  return `ed2k-source-row ed2k-source-row-${(row.ed2kState || '').toLowerCase()}`
}

function handleSpanMethod ({ row, columnIndex }) {
  if (row.isGroup) {
    if (columnIndex === 0) return [1, 4]
    return [0, 0]
  }
  return { rowspan: 1, colspan: 1 }
}

function handleRowClick (row) {
  if (!row || !row.isGroup) return
  const key = row.id
  const idx = expandedGroupKeys.value.indexOf(key)
  if (idx >= 0) {
    expandedGroupKeys.value.splice(idx, 1)
  } else {
    expandedGroupKeys.value.push(key)
  }
}

onMounted(() => {
  nextTick(() => {
    updateTableHeight()
    expandedGroupKeys.value = groupedSources.value.map(g => g.id)
  })
})

watch(allSources, () => {
  nextTick(() => {
    updateTableHeight()
    expandedGroupKeys.value = groupedSources.value.map(g => g.id)
  })
})

defineExpose({
  updateTableHeight
})
</script>

<style lang="scss">
.mo-task-ed2k-sources {
  height: 100%;
  display: flex;
  flex-direction: column;
  .mo-table-wrapper {
    border: 1px solid var(--lc-border-base);
    border-radius: 8px;
    box-sizing: border-box;
    padding: 0;
  }
}
.mo-task-ed2k-sources .mo-ed2k-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: transparent;
  border: 1px solid var(--lc-border-base);
  border-radius: 8px;

  .ed2k-summary-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ed2k-summary-label {
    color: var(--lc-text-secondary);
    font-size: 0.8rem;
  }
  .ed2k-summary-value {
    color: var(--lc-text-regular);
    font-size: 0.8rem;
    font-weight: 500;
  }
}
.mo-table-wrapper {
  flex: 1;
  overflow: hidden;
  min-height: 200px;
  position: relative;
  border-radius: 8px;
}
.el-table.mo-ed2k-source-table {
  height: 100% !important;
  border: none !important;
  border-radius: 8px;
  overflow: hidden;
  &::before, &::after {
    display: none !important;
  }
  .el-table--border::after, .el-table--group::after {
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
  .mo-source-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    &.is-overflow {
      mask-image: linear-gradient(to right, black calc(100% - 20px), transparent 100%);
      -webkit-mask-image: linear-gradient(to right, black calc(100% - 20px), transparent 100%);
    }
  }
  .mo-source-group-label {
    font-weight: 600;
    color: var(--lc-text-secondary);
    font-size: 13px;
    line-height: 1;
    margin-left: 4px;
    vertical-align: middle;
  }
  .ed2k-source-group-row {
    background-color: var(--lc-table-striped-bg, #f5f7fa) !important;
    cursor: pointer;
    position: sticky;
    top: 0;
    z-index: 10;
    td,
    td.el-table__cell {
      background-color: var(--lc-table-striped-bg, #f5f7fa) !important;
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
    transition: transform 0.2s ease-in-out;
    .el-icon {
      font-size: 14px;
      line-height: 1;
    }
  }
  // ED2K 源状态标签
  .ed2k-state-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.4;

    &.ed2k-state-new {
      background: rgba(144, 147, 153, 0.15);
      color: #909399;
    }
    &.ed2k-state-connecting {
      background: rgba(230, 162, 60, 0.15);
      color: #e6a23c;
    }
    &.ed2k-state-connected {
      background: rgba(64, 158, 255, 0.15);
      color: #409eff;
    }
    &.ed2k-state-downloading {
      background: rgba(103, 194, 58, 0.15);
      color: #67c23a;
    }
    &.ed2k-state-queued {
      background: rgba(230, 162, 60, 0.1);
      color: #e6a23c;
    }
    &.ed2k-state-failed {
      background: rgba(245, 108, 108, 0.15);
      color: #f56c6c;
    }
    &.ed2k-state-expired {
      background: rgba(245, 108, 108, 0.1);
      color: #f56c6c;
      text-decoration: line-through;
    }
  }
}

// 暗色主题适配 - 与 BT 节点表格保持一致
.theme-dark .mo-task-ed2k-sources .mo-ed2k-summary {
  background: transparent;
  border-color: var(--lc-border-base);
  .ed2k-summary-label { color: var(--lc-text-secondary); }
  .ed2k-summary-value { color: var(--lc-text-regular); }
}
.theme-dark .mo-task-ed2k-sources .mo-table-wrapper {
  border-color: var(--lc-border-base) !important;
  background-color: var(--lc-task-item-bg) !important;
}
.theme-dark .mo-ed2k-source-table {
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
    &.el-table__row--level-0,
    &.el-table__row--level-1,
    &.el-table__row--level-2 {
      background-color: transparent !important;
      td {
        background-color: transparent !important;
      }
    }
  }
  // 悬停高亮
  .el-table__body tr:hover > td,
  .el-table__body tr:hover > td.el-table__cell,
  .el-table--enable-row-hover .el-table__body tr:hover > td {
    background-color: var(--lc-table-hover-bg) !important;
  }
  .ed2k-source-group-row {
    background-color: var(--lc-table-striped-bg) !important;
    color: var(--lc-text-secondary) !important;
    &.el-table__row td,
    td.el-table__cell {
      background-color: var(--lc-table-striped-bg) !important;
      border-bottom: 1px solid var(--lc-border-base) !important;
    }
    .mo-source-group-label {
      color: var(--lc-text-secondary) !important;
    }
    &.el-table__row:hover > td,
    &:hover > td {
      background-color: var(--lc-table-hover-bg) !important;
    }
  }
  .el-table__expand-icon {
    color: var(--lc-text-secondary) !important;
    background-color: transparent !important;
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
  .el-table--border::after, .el-table--group::after, .el-table::before {
    display: none !important;
  }
  .el-checkbox__inner {
    background-color: var(--lc-bg-input) !important;
    border-color: var(--lc-border-base) !important;
  }
}
</style>
