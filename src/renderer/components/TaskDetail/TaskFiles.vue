<template>
  <div class="mo-task-files" v-if="files">
    <div class="mo-table-wrapper">
      <el-table
        stripe
        ref="torrentTable"
        :height="height"
        :data="files"
        tooltip-effect="dark"
        style="width: 100%"
        @row-dblclick="handleRowDbClick"
        @selection-change="handleSelectionChange">
        <el-table-column
          type="selection"
          width="42">
        </el-table-column>
        <el-table-column
          :label="$t('task.file-name')"
          min-width="200"
          show-overflow-tooltip>
          <template slot-scope="scope">{{ scope.row.name }}</template>
        </el-table-column>
        <el-table-column
          :label="$t('task.file-extension')"
          width="80"
          class-name="task-file-extension"
          show-overflow-tooltip>
          <template slot-scope="scope">{{ scope.row.extension | removeExtensionDot }}</template>
        </el-table-column>
        <el-table-column
          v-if="mode === 'DETAIL'"
          :label="`%`"
          align="right"
          width="60"
          :show-overflow-tooltip="false">
          <template slot-scope="scope">{{ calcProgress(scope.row.length, scope.row.completedLength, 1) }}</template>
        </el-table-column>
        <el-table-column
          v-if="mode === 'DETAIL'"
          :label="`✓`"
          align="right"
          width="100">
          <template slot-scope="scope">{{ scope.row.completedLength | bytesToSize }}</template>
        </el-table-column>
        <el-table-column
          :label="$t('task.file-size')"
          align="right"
          width="100">
          <template slot-scope="scope">{{ scope.row.length | bytesToSize }}</template>
        </el-table-column>
      </el-table>
    </div>
    <el-row class="file-filters" :gutter="12">
      <el-col
        class="quick-filters"
        :xs="24"
        :sm="8"
        :md="8"
        :lg="8"
      >
        <div class="file-type-slider" role="group">
          <div
            class="slider-indicator"
            :class="{ 'is-hidden': !activeType }"
            :style="indicatorStyle"
          ></div>
          <button
            v-for="item in fileTypes"
            :key="item.key"
            type="button"
            class="slider-btn"
            :class="{ active: activeType === item.key }"
            @click="toggleTypeSelection(item.key)"
          >
            <mo-icon :name="item.icon" width="12" height="12" />
          </button>
        </div>
      </el-col>
      <el-col
        class="files-summary"
        :xs="24"
        :sm="16"
        :md="16"
        :lg="16"
      >
        {{ $t('task.selected-files-sum', { selectedFilesCount, selectedFilesTotalSize }) }}
      </el-col>
    </el-row>
  </div>
</template>

<script>
  import { isEmpty } from 'lodash'
  import '@/components/Icons/video'
  import '@/components/Icons/audio'
  import '@/components/Icons/image'
  import '@/components/Icons/document'
  import '@/components/Icons/select-all'
  import {
    NONE_SELECTED_FILES,
    SELECTED_ALL_FILES
  } from '@shared/constants'
  import {
    bytesToSize,
    calcProgress,
    filterAudioFiles,
    filterDocumentFiles,
    filterImageFiles,
    filterVideoFiles,
    removeExtensionDot
  } from '@shared/utils'

  export default {
    name: 'mo-task-files',
    filters: {
      bytesToSize,
      removeExtensionDot
    },
    props: {
      mode: {
        type: String,
        default: 'ADD',
        validator: function (value) {
          return ['ADD', 'DETAIL'].indexOf(value) !== -1
        }
      },
      height: {
        type: [Number, String]
      },
      files: {
        type: Array,
        default: function () {
          return []
        }
      }
    },
    data () {
      return {
        selectedFiles: [],
        activeType: 'all',
        fileTypes: [
          { key: 'all', icon: 'select-all' },
          { key: 'video', icon: 'video', filter: filterVideoFiles },
          { key: 'audio', icon: 'audio', filter: filterAudioFiles },
          { key: 'image', icon: 'image', filter: filterImageFiles },
          { key: 'document', icon: 'document', filter: filterDocumentFiles }
        ]
      }
    },
    computed: {
      selectedFilesCount () {
        return this.selectedFiles.length
      },
      selectedFilesTotalSize () {
        const result = this.selectedFiles.reduce((acc, cur) => {
          return acc + parseInt(cur.length, 10)
        }, 0)
        return bytesToSize(result)
      },
      selectedFileIndex () {
        const { files, selectedFiles } = this
        if (files.length === 0 || selectedFiles.length === 0) {
          return NONE_SELECTED_FILES
        }
        if (files.length === selectedFiles.length) {
          return SELECTED_ALL_FILES
        }
        const indexArr = this.selectedFiles.map((item) => item.idx)
        const result = indexArr.join(',')
        return result
      },
      indicatorStyle () {
        if (!this.activeType) {
          return { opacity: 0 }
        }
        const idx = this.fileTypes.findIndex(t => t.key === this.activeType)
        if (idx < 0) {
          return { opacity: 0 }
        }
        return {
          transform: `translateX(${idx * 100}%)`,
          opacity: 1
        }
      }
    },
    watch: {
      selectedFileIndex () {
        const { selectedFileIndex } = this
        this.$emit('selection-change', selectedFileIndex)
      }
    },
    methods: {
      calcProgress,
      toggleAllSelection () {
        if (!this.$refs.torrentTable) {
          return
        }
        this.$refs.torrentTable.toggleAllSelection()
      },
      clearSelection () {
        if (!this.$refs.torrentTable) {
          return
        }
        this.$refs.torrentTable.clearSelection()
        this.activeType = 'all'
      },
      toggleSelection (rows) {
        if (isEmpty(rows)) {
          this.$refs.torrentTable.clearSelection()
        } else {
          this.$refs.torrentTable.clearSelection()
          rows.forEach(row => {
            this.$refs.torrentTable.toggleRowSelection(row, true)
          })
        }
      },
      toggleTypeSelection (type) {
        this.activeType = type
        if (type === 'all') {
          this.toggleSelection(this.files)
          return
        }
        const item = this.fileTypes.find(t => t.key === type)
        if (!item) {
          return
        }
        const filtered = item.filter(this.files)
        this.toggleSelection(filtered)
      },
      handleRowDbClick (row, column, event) {
        this.$refs.torrentTable.toggleRowSelection(row)
      },
      handleSelectionChange (val) {
        this.selectedFiles = val
      }
    }
  }
</script>

<style lang="scss">
.mo-task-files {
  .mo-table-wrapper {
    border: 1px solid #dcdfe6;
    border-radius: 8px;
  }
  .el-table {
    border-radius: 8px;
    border: none !important;
    &::before, &::after {
      display: none !important;
    }
    .el-table__header-wrapper {
      th.el-table__cell {
        border-bottom: none !important;
        padding: 8px 0;
        .cell {
          padding: 0 10px;
          font-size: $--font-size-base;
          line-height: 1.5;
        }
      }
    }
    .el-table__body-wrapper {
      overflow: auto !important;
      tr {
        position: relative;
        &:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: 0;
          height: 1px;
          background: #ebeef5;
        }
      }
      td.el-table__cell {
        border-bottom: none !important;
        padding: 8px 0;
        .cell {
          padding: 0 10px;
          font-size: $--font-size-base;
          line-height: 1.5;
        }
      }
    }
  }
}
.file-filters {
  margin-top: 0.75rem;
  .quick-filters {
    .file-type-slider {
      position: relative;
      display: inline-flex;
      align-items: center;
      padding: 3px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 10px;

      .slider-indicator {
        position: absolute;
        top: 3px;
        left: 3px;
        width: calc(20% - 1.2px);
        height: calc(100% - 6px);
        background: $--button-default-background-color;
        border-radius: 7px;
        transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1),
                    opacity 0.2s ease;
        z-index: 0;
        pointer-events: none;

        &.is-hidden {
          opacity: 0;
        }
      }

      .slider-btn {
        position: relative;
        z-index: 1;
        flex: 1 0 auto;
        min-width: 0;
        height: 24px;
        padding: 0 8px;
        background: transparent;
        border: none;
        border-radius: 7px;
        cursor: pointer;
        outline: none;
        box-shadow: none;
        color: $--color-text-secondary;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s ease;

        &:hover {
          color: $--color-text-primary;
        }

        &.active {
          color: $--color-primary;
        }
      }
    }
  }
  .files-summary {
    text-align: right;
    font-size: $--font-size-base;
    color: $--color-text-regular;
    line-height: 1.75rem;
  }
}

.theme-dark {
  .file-filters .quick-filters {
    .file-type-slider {
      background: rgba(255, 255, 255, 0.06);

      .slider-indicator {
        background: rgba(255, 255, 255, 0.1);
      }

      .slider-btn {
        color: rgba(255, 255, 255, 0.55);

        &:hover {
          color: rgba(255, 255, 255, 0.85);
        }

        &.active {
          color: $--color-primary;
        }
      }
    }
  }
}

.theme-dark .mo-task-files .el-table__body-wrapper tr:not(:last-child)::after {
  background: #4c4d4f;
}

.mo-task-files .task-file-extension .cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  display: block;
  -webkit-mask-image: linear-gradient(90deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0) 100%);
  mask-image: linear-gradient(90deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0) 100%);
}
</style>
