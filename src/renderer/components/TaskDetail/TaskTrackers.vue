<template>
  <div class="mo-task-trackers">
    <link
      v-for="origin in preconnectOrigins"
      :key="origin"
      rel="preconnect"
      :href="origin"
    />
    <div class="mo-table-wrapper" ref="tableWrapper">
      <el-table
        ref="trackerTable"
        class="mo-tracker-table"
        size="small"
        :data="groupedTrackers"
        :height="tableHeight"
        row-key="id"
        :span-method="handleSpanMethod"
        :row-class-name="getRowClassName"
        @row-click="handleRowClick"
      >
        <el-table-column
          :label="t('task.task-tracker-url')"
          prop="url"
          min-width="200">
          <template #default="scope">
            <template v-if="scope.row.isGroup">
              <span class="mo-tracker-group-label">{{ scope.row.groupLabel }}</span>
            </template>
            <template v-else>
              <img
                class="mo-tracker-favicon"
                :class="{ 'is-loaded': isFaviconLoaded(scope.row.url) }"
                :src="getFaviconUrl(scope.row.url)"
                :data-tracker-url="scope.row.url"
                :alt="''"
                referrerpolicy="no-referrer"
                loading="lazy"
                decoding="async"
                @load="onFaviconLoad"
                @error="onFaviconError"
              />
              <span class="mo-tracker-text" :title="scope.row.url">{{ scope.row.url }}</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-tracker-protocol')"
          prop="protocol"
          align="center"
          width="70">
          <template #default="scope">
            {{ scope.row.protocol }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-tracker-status')"
          prop="status"
          align="center"
          width="80">
          <template #default="scope">
            {{ getTrackerStatusText(scope.row.status) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-tracker-seeders')"
          prop="seeders"
          align="right"
          width="80">
          <template #default="scope">
            {{ scope.row.seeders }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-tracker-leechers')"
          prop="leechers"
          align="right"
          width="80">
          <template #default="scope">
            {{ scope.row.leechers }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-tracker-peers')"
          prop="peers"
          align="right"
          width="80">
          <template #default="scope">
            {{ scope.row.peers }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-tracker-download-count')"
          prop="downloadCount"
          align="right"
          width="90">
          <template #default="scope">
            {{ scope.row.downloadCount }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-tracker-next-announce')"
          prop="nextAnnounceTime"
          align="right"
          width="100">
          <template #default="scope">
            {{ formatNextAnnounceTime(scope.row.nextAnnounceTime) }}
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import is from 'electron-is'
import {
  calcFormLabelWidth,
  checkTaskIsBT,
  checkTaskIsSeeder
} from '@shared/utils'
import { convertTrackerDataToLine } from '@shared/utils/tracker'
import { EMPTY_STRING } from '@shared/constants'
import i18n from '@/plugins/i18n'
import api from '@/api'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'

const { t } = i18n.global

const props = defineProps({
  task: {
    type: Object
  }
})

defineOptions({ name: 'mo-task-trackers' })

const preferenceStore = usePreferenceStore()
const { config } = storeToRefs(preferenceStore)

const form = ref({})
const formLabelWidth = computed(() => calcFormLabelWidth(config.value.locale))
const locale = computed(() => config.value.locale)
const tableHeight = ref('100%')
const trackerStats = ref([])
const defaultFavicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23909399' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='2' y1='12' x2='22' y2='12'/%3E%3Cpath d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/%3E%3C/svg%3E"
const faviconUrlCache = ref({})
const faviconLoaded = ref({})

const tableWrapper = ref(null)
const trackerTable = ref(null)

let _trackerFetchTimer = null
let _faviconFlushRafId = null
let _faviconLoadQueue = null
let _trackerRefreshInterval = null

const isRenderer = is.renderer()

const isBT = computed(() => checkTaskIsBT(props.task))
const isSeeder = computed(() => checkTaskIsSeeder(props.task))

const announceList = computed(() => {
  if (!isBT.value) return EMPTY_STRING
  const { bittorrent } = props.task
  if (!bittorrent || !bittorrent.announceList) return EMPTY_STRING
  const data = bittorrent.announceList.map((i) => i[0])
  return convertTrackerDataToLine(data)
})

const trackerList = computed(() => {
  if (!isBT.value) return []
  return trackerStats.value.map((stat, index) => ({
    id: `tracker-${index}`,
    url: stat.url || '',
    protocol: stat.protocol || 'unknown',
    status: stat.status || 'waiting',
    peers: stat.peers || 0,
    seeders: stat.seeders || 0,
    leechers: stat.leechers || 0,
    downloadCount: stat.downloadCount || 0,
    nextAnnounceTime: stat.nextAnnounceTime || 0
  }))
})

const groupedTrackers = computed(() => {
  const list = trackerList.value
  if (list.length === 0) return []

  const groups = {
    working: [],
    'not-working': [],
    waiting: []
  }
  list.forEach(t => {
    const key = groups[t.status] !== undefined ? t.status : 'waiting'
    groups[key].push(t)
  })

  const result = []
  const groupOrder = [
    { key: 'working', label: i18n.global.t('task.trackers-group-working') },
    { key: 'not-working', label: i18n.global.t('task.trackers-group-not-working') },
    { key: 'waiting', label: i18n.global.t('task.trackers-group-waiting') }
  ]

  groupOrder.forEach(({ key, label }) => {
    const items = groups[key]
    if (items.length === 0) return
    result.push({
      id: `group-${key}`,
      isGroup: true,
      groupLabel: `${label} (${items.length})`,
      groupKey: key
    })
    items.forEach(item => result.push(item))
  })

  return Object.freeze(result)
})

const trackerStatusMap = computed(() => ({
  working: i18n.global.t('task.tracker-status-working'),
  updating: i18n.global.t('task.tracker-status-updating'),
  error: i18n.global.t('task.tracker-status-error'),
  unknown: i18n.global.t('task.tracker-status-unknown'),
  disabled: i18n.global.t('task.tracker-status-disabled'),
  pending: i18n.global.t('task.tracker-status-pending'),
  waiting: i18n.global.t('task.tracker-status-waiting'),
  'not-working': i18n.global.t('task.tracker-status-not-working')
}))

const preconnectOrigins = computed(() => {
  const origins = new Set()
  trackerList.value.forEach(t => {
    const faviconUrl = getFaviconUrl(t.url)
    if (faviconUrl && faviconUrl.startsWith('http')) {
      try {
        origins.add(new URL(faviconUrl).origin)
      } catch (e) {}
    }
  })
  return Array.from(origins)
})

// Watchers
watch(
  () => props.task && props.task.gid,
  (newGid) => {
    if (_trackerFetchTimer) clearTimeout(_trackerFetchTimer)
    if (_faviconFlushRafId) {
      cancelAnimationFrame(_faviconFlushRafId)
      _faviconFlushRafId = null
    }
    _faviconLoadQueue = null
    faviconUrlCache.value = {}
    faviconLoaded.value = {}
    if (newGid && props.task && checkTaskIsBT(props.task)) {
      fetchTrackerStats(newGid)
      _startTrackerRefreshTimer(newGid)
    } else {
      trackerStats.value = []
    }
  },
  { immediate: true }
)

watch(
  () => props.task && props.task.status,
  (newStatus) => {
    if (newStatus === 'active' && props.task && props.task.gid && checkTaskIsBT(props.task)) {
      if (_trackerFetchTimer) clearTimeout(_trackerFetchTimer)
      fetchTrackerStats(props.task.gid)
      _startTrackerRefreshTimer(props.task.gid)
    } else if (newStatus !== 'active' && newStatus !== 'waiting') {
      _stopTrackerRefreshTimer()
    }
  }
)

onBeforeUnmount(() => {
  if (_faviconFlushRafId) {
    cancelAnimationFrame(_faviconFlushRafId)
  }
  _stopTrackerRefreshTimer()
})

// Methods
function _startTrackerRefreshTimer (gid) {
  _stopTrackerRefreshTimer()
  _trackerRefreshInterval = setInterval(() => {
    if (gid && props.task && props.task.gid === gid && checkTaskIsBT(props.task)) {
      fetchTrackerStats(gid)
    } else {
      _stopTrackerRefreshTimer()
    }
  }, 10000)
}

function _stopTrackerRefreshTimer () {
  if (_trackerRefreshInterval) {
    clearInterval(_trackerRefreshInterval)
    _trackerRefreshInterval = null
  }
}

async function fetchTrackerStats (gid) {
  try {
    const stats = await api.fetchTaskTrackers({ gid })
    let list = []
    if (Array.isArray(stats)) {
      list = stats
    } else if (stats && typeof stats === 'object') {
      const keys = ['working', 'not-working', 'waiting']
      keys.forEach(key => {
        const arr = stats[key]
        if (Array.isArray(arr)) {
          list.push(...arr)
        }
      })
    }
    const seen = new Set()
    list = list.filter(stat => {
      const url = ((stat && stat.url) || '').trim()
      if (!url || seen.has(url)) return false
      seen.add(url)
      return true
    })
    trackerStats.value = list
    precomputeFaviconUrls()
  } catch (error) {
    trackerStats.value = []
  }
}

function handleSpanMethod ({ row, columnIndex }) {
  if (row.isGroup) {
    if (columnIndex === 0) {
      return [1, 8]
    }
    return [0, 0]
  }
}

function getRowClassName ({ row }) {
  if (row.isGroup) {
    const groupKey = row.groupKey || ''
    return `mo-tracker-group-row mo-tracker-group-${groupKey}`
  }
  return ''
}

function handleRowClick (row) {
  // 分组行点击暂不处理展开/折叠，保持全部展开
}

function getTrackerStatusText (status) {
  return trackerStatusMap.value[status] || status || '-'
}

function precomputeFaviconUrls () {
  trackerStats.value.forEach(stat => {
    const url = stat.url || ''
    if (url && faviconUrlCache.value[url] === undefined) {
      faviconUrlCache.value[url] = resolveFaviconUrl(url)
    }
  })
}

function resolveFaviconUrl (url) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    if (!host) return defaultFavicon
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.origin}/favicon.ico`
    }
    return `https://${host}/favicon.ico`
  } catch (e) {
    return defaultFavicon
  }
}

function getFaviconUrl (url) {
  return faviconUrlCache.value[url] || defaultFavicon
}

function isFaviconLoaded (url) {
  return faviconLoaded.value[url] === true
}

function onFaviconError (e) {
  const img = e.target
  const url = img.getAttribute('data-tracker-url')
  if (url && faviconUrlCache.value[url] !== defaultFavicon) {
    faviconUrlCache.value[url] = defaultFavicon
    img.src = defaultFavicon
  } else if (url) {
    _enqueueFaviconLoaded(url)
  }
}

function onFaviconLoad (e) {
  const url = e.target.getAttribute('data-tracker-url')
  if (url) {
    _enqueueFaviconLoaded(url)
  }
}

function _enqueueFaviconLoaded (url) {
  if (!_faviconLoadQueue) {
    _faviconLoadQueue = {}
  }
  _faviconLoadQueue[url] = true
  if (!_faviconFlushRafId) {
    _faviconFlushRafId = requestAnimationFrame(() => {
      _faviconFlushRafId = null
      const queue = _faviconLoadQueue
      _faviconLoadQueue = null
      if (queue && Object.keys(queue).length > 0) {
        faviconLoaded.value = Object.assign({}, faviconLoaded.value, queue)
      }
    })
  }
}

function formatNextAnnounceTime (timestamp) {
  if (!timestamp || timestamp <= 0) return '-'
  const now = Math.floor(Date.now() / 1000)
  const diff = timestamp - now
  if (diff <= 0) return i18n.global.t('task.tracker-next-immediately')
  const minutes = Math.floor(diff / 60)
  const seconds = diff % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
</script>

<style lang="scss">
.mo-task-trackers {
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
.mo-table-wrapper {
  flex: 1;
  overflow: hidden;
  min-height: 200px;
  position: relative;
  border-radius: 8px;
}
.el-table.mo-tracker-table {
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
  th.gutter, colgroup.gutter {
    display: none !important;
    width: 0 !important;
  }
  .el-table__header colgroup col[name="gutter"] {
    display: none !important;
    width: 0 !important;
  }
  .el-table__body tr:last-child td {
    border-bottom: none !important;
  }
  th.el-table__cell {
    border-bottom: none !important;
    .cell {
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
  }
  .cell {
    padding-left: 10px !important;
    padding-right: 10px !important;
  }
  .mo-tracker-favicon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    margin-right: 6px;
    border-radius: 2px;
    object-fit: contain;
    vertical-align: middle;
    position: relative;
    top: -1px;
    visibility: hidden;
    &.is-loaded {
      visibility: visible;
    }
  }
  .mo-tracker-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    text-overflow: ellipsis;
  }
.mo-tracker-group-row {
background-color: var(--lc-table-striped-bg, #f5f7fa) !important;
td,
td.el-table__cell {
background-color: var(--lc-table-striped-bg, #f5f7fa) !important;
border-bottom: 1px solid var(--lc-border-base) !important;
}
    .cell {
      padding-left: 12px !important;
    }
    .mo-tracker-group-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--lc-text-secondary);
      letter-spacing: 0.3px;
    }
  }
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
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
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
}

.theme-dark .mo-task-trackers .mo-table-wrapper {
  border-color: var(--lc-border-base) !important;
  background-color: var(--lc-task-item-bg) !important;
}
.theme-dark .mo-tracker-table {
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
  &.el-table thead th.el-table__cell.is-leaf,
  th.el-table__cell {
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
  .mo-tracker-group-row {
    background-color: var(--lc-table-striped-bg) !important;
    &.el-table__row td,
    td.el-table__cell {
      background-color: var(--lc-table-striped-bg) !important;
      border-bottom: 1px solid var(--lc-border-base) !important;
    }
    .mo-tracker-group-label {
      color: var(--lc-text-secondary) !important;
    }
    &.el-table__row:hover > td,
    &:hover > td {
      background-color: var(--lc-table-hover-bg) !important;
    }
  }
}
</style>
