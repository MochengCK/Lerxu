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
        size="mini"
        :data="groupedTrackers"
        :height="tableHeight"
        row-key="id"
        :span-method="handleSpanMethod"
        :row-class-name="getRowClassName"
        @row-click="handleRowClick"
      >
        <el-table-column
          :label="$t('task.task-tracker-url')"
          prop="url"
          min-width="200">
          <template slot-scope="scope">
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
          :label="$t('task.task-tracker-protocol')"
          prop="protocol"
          align="center"
          width="70">
          <template slot-scope="scope">
            {{ scope.row.protocol }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-status')"
          prop="status"
          align="center"
          width="80">
          <template slot-scope="scope">
            {{ getTrackerStatusText(scope.row.status) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-seeders')"
          prop="seeders"
          align="right"
          width="80">
          <template slot-scope="scope">
            {{ scope.row.seeders }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-leechers')"
          prop="leechers"
          align="right"
          width="80">
          <template slot-scope="scope">
            {{ scope.row.leechers }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-peers')"
          prop="peers"
          align="right"
          width="80">
          <template slot-scope="scope">
            {{ scope.row.peers }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-download-count')"
          prop="downloadCount"
          align="right"
          width="90">
          <template slot-scope="scope">
            {{ scope.row.downloadCount }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-next-announce')"
          prop="nextAnnounceTime"
          align="right"
          width="100">
          <template slot-scope="scope">
            {{ formatNextAnnounceTime(scope.row.nextAnnounceTime) }}
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script>
  import is from 'electron-is'
  import {
    calcFormLabelWidth,
    checkTaskIsBT,
    checkTaskIsSeeder
  } from '@shared/utils'
  import { convertTrackerDataToLine } from '@shared/utils/tracker'
  import { EMPTY_STRING } from '@shared/constants'
  import api from '@/api'

  export default {
    name: 'mo-task-trackers',
    props: {
      task: {
        type: Object
      }
    },
    data () {
      const { locale } = this.$store.state.preference.config
      return {
        form: {},
        formLabelWidth: calcFormLabelWidth(locale),
        locale,
        tableHeight: '100%',
        trackerStats: [],
        // 通用网页图标（地球），用于 favicon 加载失败或无法获取时的占位
        defaultFavicon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23909399' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='2' y1='12' x2='22' y2='12'/%3E%3Cpath d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/%3E%3C/svg%3E",
        // 追踪器 URL -> 解析后的 favicon URL（加载失败后永久记为 defaultFavicon）
        faviconUrlCache: {},
        // 追踪器 URL -> 是否已加载完成（响应式，避免静态 inline style 被 re-render 重置）
        faviconLoaded: {}
      }
    },
    computed: {
      isRenderer: () => is.renderer(),
      isBT () {
        return checkTaskIsBT(this.task)
      },
      isSeeder () {
        return checkTaskIsSeeder(this.task)
      },
      announceList () {
        if (!this.isBT) {
          return EMPTY_STRING
        }

        const { bittorrent } = this.task
        if (!bittorrent || !bittorrent.announceList) {
          return EMPTY_STRING
        }
        const data = bittorrent.announceList.map((i) => i[0])
        return convertTrackerDataToLine(data)
      },
      trackerList () {
        if (!this.isBT) {
          return []
        }

        return this.trackerStats.map((stat, index) => {
          return {
            id: `tracker-${index}`,
            url: stat.url || '',
            protocol: stat.protocol || 'unknown',
            status: stat.status || 'waiting',
            peers: stat.peers || 0,
            seeders: stat.seeders || 0,
            leechers: stat.leechers || 0,
            downloadCount: stat.downloadCount || 0,
            nextAnnounceTime: stat.nextAnnounceTime || 0
          }
        })
      },
      groupedTrackers () {
        const list = this.trackerList
        if (list.length === 0) {
          return []
        }

        // 按状态分组：working（已连接）、not-working（连接失败）、waiting（等待中）
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
          { key: 'working', label: this.$t('task.trackers-group-working') },
          { key: 'not-working', label: this.$t('task.trackers-group-not-working') },
          { key: 'waiting', label: this.$t('task.trackers-group-waiting') }
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
          items.forEach(item => {
            result.push(item)
          })
        })

        return Object.freeze(result)
      },
      trackerStatusMap () {
        return {
          working: this.$t('task.tracker-status-working'),
          updating: this.$t('task.tracker-status-updating'),
          error: this.$t('task.tracker-status-error'),
          unknown: this.$t('task.tracker-status-unknown'),
          disabled: this.$t('task.tracker-status-disabled'),
          pending: this.$t('task.tracker-status-pending'),
          waiting: this.$t('task.tracker-status-waiting'),
          'not-working': this.$t('task.tracker-status-not-working')
        }
      },
      preconnectOrigins () {
        const origins = new Set()
        this.trackerList.forEach(t => {
          const faviconUrl = this.getFaviconUrl(t.url)
          if (faviconUrl && faviconUrl.startsWith('http')) {
            try {
              origins.add(new URL(faviconUrl).origin)
            } catch (e) {}
          }
        })
        return Array.from(origins)
      }
    },
    watch: {
      'task.gid': {
        handler (newGid) {
          // Re-fetch tracker stats only when the task changes (not every poll).
          // The previous `task: { deep: true }` watcher fired on every poll
          // tick (task is replaced ~1s), causing redundant fetchTrackerStats
          // calls. Tracker list changes infrequently, so gid-keyed refresh is
          // sufficient; periodic refresh is handled by a separate timer.
          this._trackerFetchTimer && clearTimeout(this._trackerFetchTimer)
          // 切换任务时清空 favicon 缓存，避免旧任务的图标缓存污染
          if (this._faviconFlushRafId) {
            cancelAnimationFrame(this._faviconFlushRafId)
            this._faviconFlushRafId = null
          }
          this._faviconLoadQueue = null
          this.faviconUrlCache = {}
          this.faviconLoaded = {}
          if (newGid && this.task && checkTaskIsBT(this.task)) {
            this.fetchTrackerStats(newGid)
            this._startTrackerRefreshTimer(newGid)
          } else {
            this.trackerStats = []
          }
        },
        immediate: true
      },
      'task.status': {
        handler (newStatus) {
          // Refresh when task becomes active again (resume from pause).
          if (newStatus === 'active' && this.task && this.task.gid && checkTaskIsBT(this.task)) {
            this._trackerFetchTimer && clearTimeout(this._trackerFetchTimer)
            this.fetchTrackerStats(this.task.gid)
            this._startTrackerRefreshTimer(this.task.gid)
          } else if (newStatus !== 'active' && newStatus !== 'waiting') {
            this._stopTrackerRefreshTimer()
          }
        }
      }
    },
    mounted () {
    },
    beforeDestroy () {
      if (this._faviconFlushRafId) {
        cancelAnimationFrame(this._faviconFlushRafId)
      }
      this._stopTrackerRefreshTimer()
    },
    methods: {
      _startTrackerRefreshTimer (gid) {
        this._stopTrackerRefreshTimer()
        // Refresh tracker stats every 10s (trackers change slowly compared
        // to peer lists; polling every 1s was wasteful).
        this._trackerRefreshInterval = setInterval(() => {
          if (gid && this.task && this.task.gid === gid && checkTaskIsBT(this.task)) {
            this.fetchTrackerStats(gid)
          } else {
            this._stopTrackerRefreshTimer()
          }
        }, 10000)
      },
      _stopTrackerRefreshTimer () {
        if (this._trackerRefreshInterval) {
          clearInterval(this._trackerRefreshInterval)
          this._trackerRefreshInterval = null
        }
      },
      async fetchTrackerStats (gid) {
        try {
          const stats = await api.fetchTaskTrackers({ gid })
          // 引擎返回按状态分类的 Dict: { working: [], not-working: [], waiting: [] }
          // 兼容旧版返回扁平 List 的格式
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
          // Deduplicate by URL — the engine may return the same tracker multiple
          // times (torrent announce list + global bt-tracker config overlap).
          const seen = new Set()
          list = list.filter(stat => {
            const url = ((stat && stat.url) || '').trim()
            if (!url || seen.has(url)) return false
            seen.add(url)
            return true
          })
          this.trackerStats = list
          // Pre-compute favicon URLs to avoid URL parsing & side effects during render
          this.precomputeFaviconUrls()
        } catch (error) {
          this.trackerStats = []
        }
      },
      handleSpanMethod ({ row, columnIndex }) {
        // 分组行：合并所有列
        if (row.isGroup) {
          if (columnIndex === 0) {
            return [1, 8]
          }
          return [0, 0]
        }
      },
      getRowClassName ({ row }) {
        if (row.isGroup) {
          const groupKey = row.groupKey || ''
          return `mo-tracker-group-row mo-tracker-group-${groupKey}`
        }
        return ''
      },
      handleRowClick (row) {
        // 分组行点击暂不处理展开/折叠，保持全部展开
      },
      getTrackerStatusText (status) {
        return this.trackerStatusMap[status] || status || '-'
      },
      precomputeFaviconUrls () {
        // Pre-resolve favicon URLs when tracker data changes so the render
        // path is a pure cache lookup with zero side effects.
        this.trackerStats.forEach(stat => {
          const url = stat.url || ''
          if (url && this.faviconUrlCache[url] === undefined) {
            this.faviconUrlCache[url] = this.resolveFaviconUrl(url)
          }
        })
      },
      resolveFaviconUrl (url) {
        try {
          const parsed = new URL(url)
          const host = parsed.hostname
          if (!host) {
            return this.defaultFavicon
          }
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return `${parsed.origin}/favicon.ico`
          }
          return `https://${host}/favicon.ico`
        } catch (e) {
          return this.defaultFavicon
        }
      },
      getFaviconUrl (url) {
        // Pure cache lookup — no URL parsing, no side effects during render
        return this.faviconUrlCache[url] || this.defaultFavicon
      },
      isFaviconLoaded (url) {
        return this.faviconLoaded[url] === true
      },
      onFaviconError (e) {
        const img = e.target
        const url = img.getAttribute('data-tracker-url')
        // favicon 加载失败时永久标记为 defaultFavicon 并更新 src
        if (url && this.faviconUrlCache[url] !== this.defaultFavicon) {
          this.$set(this.faviconUrlCache, url, this.defaultFavicon)
          img.src = this.defaultFavicon
        } else if (url) {
          // 已在使用 defaultFavicon 但仍出错（data URI 极少出错），直接标记为已加载
          this._enqueueFaviconLoaded(url)
        }
      },
      onFaviconLoad (e) {
        const url = e.target.getAttribute('data-tracker-url')
        if (url) {
          this._enqueueFaviconLoaded(url)
        }
      },
      _enqueueFaviconLoaded (url) {
        // Batch favicon loaded-state updates: collect URLs and flush in a
        // single requestAnimationFrame to avoid N individual re-renders.
        if (!this._faviconLoadQueue) {
          this._faviconLoadQueue = {}
        }
        this._faviconLoadQueue[url] = true
        if (!this._faviconFlushRafId) {
          this._faviconFlushRafId = requestAnimationFrame(() => {
            this._faviconFlushRafId = null
            const queue = this._faviconLoadQueue
            this._faviconLoadQueue = null
            if (queue && Object.keys(queue).length > 0) {
              this.faviconLoaded = Object.assign({}, this.faviconLoaded, queue)
            }
          })
        }
      },
      formatNextAnnounceTime (timestamp) {
        if (!timestamp || timestamp <= 0) {
          return '-'
        }

        const now = Math.floor(Date.now() / 1000)
        const diff = timestamp - now

        if (diff <= 0) {
          return this.$t('task.tracker-next-immediately')
        }

        const minutes = Math.floor(diff / 60)
        const seconds = diff % 60

        if (minutes > 0) {
          return `${minutes}m ${seconds}s`
        }
        return `${seconds}s`
      }
    }
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
