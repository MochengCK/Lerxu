<template>
  <div class="mo-task-trackers">
    <div class="mo-table-wrapper" ref="tableWrapper">
      <el-table
        stripe
        ref="trackerTable"
        class="mo-tracker-table"
        size="mini"
        :data="trackerList"
        :height="tableHeight"
        row-key="id"
        @sort-change="handleSortChange"
      >
        <el-table-column
          :label="$t('task.task-tracker-url')"
          prop="url"
          min-width="200"
          sortable="custom">
          <template slot-scope="scope">
            <el-tooltip :content="scope.row.url" placement="top" :disabled="!isTextOverflow(scope.row.url)">
              <span class="mo-tracker-text">{{ scope.row.url }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-protocol')"
          prop="protocol"
          align="center"
          width="70"
          sortable="custom">
          <template slot-scope="scope">
            {{ scope.row.protocol }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-status')"
          prop="status"
          align="center"
          width="80"
          sortable="custom">
          <template slot-scope="scope">
            {{ getTrackerStatusText(scope.row.status) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-seeders')"
          prop="seeders"
          align="right"
          width="80"
          sortable="custom">
          <template slot-scope="scope">
            {{ scope.row.seeders }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-leechers')"
          prop="leechers"
          align="right"
          width="80"
          sortable="custom">
          <template slot-scope="scope">
            {{ scope.row.leechers }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-peers')"
          prop="peers"
          align="right"
          width="80"
          sortable="custom">
          <template slot-scope="scope">
            {{ scope.row.peers }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-download-count')"
          prop="downloadCount"
          align="right"
          width="90"
          sortable="custom">
          <template slot-scope="scope">
            {{ scope.row.downloadCount }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('task.task-tracker-next-announce')"
          prop="nextAnnounceTime"
          align="right"
          width="100"
          sortable="custom">
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
        overflowMap: {},
        trackerStats: [],
        sortProp: '',
        sortOrder: ''
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

        let list = this.trackerStats.map((stat, index) => {
          return {
            id: `tracker-${index}`,
            url: stat.url || '',
            protocol: stat.protocol || 'unknown',
            status: stat.status || 'pending',
            peers: stat.peers || 0,
            seeders: stat.seeders || 0,
            leechers: stat.leechers || 0,
            downloadCount: stat.downloadCount || 0,
            nextAnnounceTime: stat.nextAnnounceTime || 0
          }
        })

        if (this.sortProp && this.sortOrder) {
          list = this.sortList(list, this.sortProp, this.sortOrder)
        }

        return list
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
      this.$nextTick(() => {
        this.scheduleDetectTextOverflow()
      })
    },
    updated () {
      // 防抖：避免每次轮询更新都强制 reflow。
      this.scheduleDetectTextOverflow()
    },
    beforeDestroy () {
      if (this._textOverflowTimer) {
        clearTimeout(this._textOverflowTimer)
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
          this.trackerStats = Array.isArray(stats) ? stats : []
        } catch (error) {
          this.trackerStats = []
        }
      },
      handleSortChange ({ prop, order }) {
        this.sortProp = prop
        this.sortOrder = order
      },
      sortList (list, prop, order) {
        if (!prop || !order) return list

        return [...list].sort((a, b) => {
          let valueA = a[prop]
          let valueB = b[prop]

          if (typeof valueA === 'string') {
            valueA = valueA.toLowerCase()
            valueB = valueB.toLowerCase()
            if (order === 'ascending') {
              return valueA.localeCompare(valueB)
            }
            return valueB.localeCompare(valueA)
          }

          if (order === 'ascending') {
            return valueA - valueB
          }
          return valueB - valueA
        })
      },
      getTrackerStatusText (status) {
        const statusMap = {
          working: this.$t('task.tracker-status-working'),
          updating: this.$t('task.tracker-status-updating'),
          error: this.$t('task.tracker-status-error'),
          unknown: this.$t('task.tracker-status-unknown'),
          disabled: this.$t('task.tracker-status-disabled'),
          pending: this.$t('task.tracker-status-pending'),
          waiting: this.$t('task.tracker-status-waiting'),
          'not-working': this.$t('task.tracker-status-not-working')
        }
        return statusMap[status] || status || '-'
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
      },
      scheduleDetectTextOverflow () {
        // Debounce: collapse repeated updated() calls into a single layout read.
        if (this._textOverflowTimer) {
          clearTimeout(this._textOverflowTimer)
        }
        this._textOverflowTimer = setTimeout(() => {
          this._textOverflowTimer = null
          this.detectTextOverflow()
        }, 200)
      },
      detectTextOverflow () {
        const textElements = this.$el.querySelectorAll('.mo-tracker-text')
        const newOverflowMap = {}

        textElements.forEach(el => {
          const isOverflow = el.scrollWidth > el.clientWidth + 1
          if (isOverflow) {
            el.classList.add('is-overflow')
          } else {
            el.classList.remove('is-overflow')
          }

          const text = el.textContent.trim()
          if (text) {
            newOverflowMap[text] = isOverflow
          }
        })

        this.overflowMap = newOverflowMap
      },
      isTextOverflow (text) {
        return this.overflowMap[text] === true
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
    border: 1px solid #dcdfe6;
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
  .mo-tracker-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    &.is-overflow {
      mask-image: linear-gradient(to right, black calc(100% - 20px), transparent 100%);
      -webkit-mask-image: linear-gradient(to right, black calc(100% - 20px), transparent 100%);
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
  border-color: #4c4d4f;
}
.theme-dark .mo-tracker-table {
  border-color: transparent !important;
  background-color: transparent;
  .el-table__row {
    background-color: transparent;
  }
  .el-table__body tr:hover > td {
    background-color: rgba(255, 255, 255, 0.05) !important;
  }
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
