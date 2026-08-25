<template>
  <div :class="['mo-task-files', { 'is-detail-mode': mode === 'DETAIL' }]" v-if="files">
    <div class="mo-table-wrapper">
      <el-table
        ref="torrentTable"
        :height="computedTableHeight"
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
          :label="t('task.file-name')"
          min-width="200"
          show-overflow-tooltip>
          <template #default="scope">{{ scope.row.name }}</template>
        </el-table-column>
        <el-table-column
          :label="t('task.file-extension')"
          width="80"
          class-name="task-file-extension"
          show-overflow-tooltip>
          <template #default="scope">{{ removeExtensionDot(scope.row.extension) }}</template>
        </el-table-column>
        <el-table-column
          v-if="mode === 'DETAIL'"
          :label="`%`"
          align="right"
          width="60"
          :show-overflow-tooltip="false">
          <template #default="scope">{{ calcProgress(scope.row.length, scope.row.completedLength, 1) }}</template>
        </el-table-column>
        <el-table-column
          v-if="mode === 'DETAIL'"
          :label="`✓`"
          align="right"
          width="100">
          <template #default="scope">{{ bytesToSize(scope.row.completedLength) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('task.file-size')"
          align="right"
          width="100">
          <template #default="scope">{{ bytesToSize(scope.row.length) }}</template>
        </el-table-column>
      </el-table>
    </div>
    <div class="file-filters">
      <div class="quick-filters">
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
            <mo-icon :name="item.icon" width="14" height="14" />
          </button>
        </div>
        <button
          v-if="showConfirm && mode === 'DETAIL'"
          type="button"
          class="slider-confirm-btn"
          @click="confirmSelection"
        >
          {{ t('app.save') }}
        </button>
      </div>
      <div class="files-summary">
        {{ t('task.selected-files-sum', { selectedFilesCount, selectedFilesTotalSize }) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, getCurrentInstance } from 'vue'
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
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例

const { t } = i18n.global
const instance = getCurrentInstance()

const props = defineProps({
  mode: {
    type: String,
    default: 'ADD',
    validator: function (value) {
      return ['ADD', 'DETAIL'].includes(value)
    }
  },
  height: {
    type: [Number, String]
  },
  tableHeight: {
    type: [Number, String],
    default: '100%'
  },
  files: {
    type: Array,
    default: function () {
      return []
    }
  }
})

const emit = defineEmits(['selection-change', 'confirm-selection'])

defineOptions({ name: 'mo-task-files' })

const torrentTable = ref(null)
const selectedFiles = ref([])
const activeType = ref('all')
const showConfirm = ref(false)
const initialSelectedFileIndex = ref(null)

const fileTypes = [
  { key: 'all', icon: 'select-all' },
  { key: 'video', icon: 'video', filter: filterVideoFiles },
  { key: 'audio', icon: 'audio', filter: filterAudioFiles },
  { key: 'image', icon: 'image', filter: filterImageFiles },
  { key: 'document', icon: 'document', filter: filterDocumentFiles }
]

const computedTableHeight = computed(() => {
  if (props.height !== undefined && props.height !== null) return props.height
  return props.mode === 'DETAIL' ? props.tableHeight : undefined
})

const selectedFilesCount = computed(() => selectedFiles.value.length)

const selectedFilesTotalSize = computed(() => {
  const result = selectedFiles.value.reduce((acc, cur) => acc + parseInt(cur.length, 10), 0)
  return bytesToSize(result)
})

const selectedFileIndex = computed(() => {
  if (props.files.length === 0 || selectedFiles.value.length === 0) return NONE_SELECTED_FILES
  if (props.files.length === selectedFiles.value.length) return SELECTED_ALL_FILES
  const indexArr = selectedFiles.value.map((item) => item.idx)
  return indexArr.join(',')
})

const indicatorStyle = computed(() => {
  if (!activeType.value) return { opacity: 0 }
  const idx = fileTypes.findIndex(t => t.key === activeType.value)
  if (idx < 0) return { opacity: 0 }
  return { transform: `translateX(${idx * 100}%)`, opacity: 1 }
})

function toggleAllSelection () {
  if (!torrentTable.value) return
  torrentTable.value.toggleAllSelection()
}

function clearSelection () {
  if (!torrentTable.value) return
  torrentTable.value.clearSelection()
  activeType.value = 'all'
  nextTick(() => {
    initialSelectedFileIndex.value = selectedFileIndex.value
    showConfirm.value = false
  })
}

function toggleSelection (rows) {
  if (isEmpty(rows)) {
    torrentTable.value.clearSelection()
  } else {
    torrentTable.value.clearSelection()
    rows.forEach(row => {
      torrentTable.value.toggleRowSelection(row, true)
    })
  }
}

function toggleTypeSelection (type) {
  activeType.value = type
  if (type === 'all') {
    toggleSelection(props.files)
  } else {
    const item = fileTypes.find(t => t.key === type)
    if (!item) return
    const filtered = item.filter(props.files)
    toggleSelection(filtered)
  }
}

function confirmSelection () {
  initialSelectedFileIndex.value = selectedFileIndex.value
  showConfirm.value = false
  emit('confirm-selection')
}

function hideConfirm () {
  showConfirm.value = false
}

function handleRowDbClick (row) {
  torrentTable.value.toggleRowSelection(row)
}

function handleSelectionChange (val) {
  selectedFiles.value = val
}

watch(selectedFileIndex, (val) => {
  if (initialSelectedFileIndex.value === null) {
    initialSelectedFileIndex.value = val
    showConfirm.value = false
  } else {
    showConfirm.value = val !== initialSelectedFileIndex.value
  }
  emit('selection-change', val)
})

watch(() => props.files, () => {
  initialSelectedFileIndex.value = null
  showConfirm.value = false
}, { immediate: true })

defineExpose({
  selectedFileIndex,
  toggleSelection,
  toggleAllSelection,
  clearSelection
})
</script>

<style lang="scss">
@import '@/components/Theme/Variables';
@import '@/components/Theme/Light/Variables';

.mo-task-files {
  .mo-table-wrapper {
    border: 1px solid var(--lc-border-base);
    border-radius: 8px;
  }

  &.is-detail-mode {
    height: 100%;
    display: flex;
    flex-direction: column;

    .mo-table-wrapper {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
  }
  .el-table {
    border-radius: 8px;
    border: none !important;
    &::before, &::after {
      display: none !important;
    }
    th.gutter, colgroup col[name="gutter"] {
      display: none !important;
      width: 0 !important;
    }
    .el-table__header-wrapper {
      th.el-table__cell {
        border-bottom: none !important;
        padding: 4px 0;
        .cell {
          padding: 0 10px;
          font-size: 12px;
          line-height: 1.5;
        }
      }
    }
    .el-table__body-wrapper {
      overflow-y: auto !important;
      overflow-x: hidden !important;
      tr {
        position: relative;
        &:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: 0;
          height: 1px;
          background: var(--lc-border-light);
        }
      }
      td.el-table__cell {
        border-bottom: none !important;
        padding: 8px 0;
        .cell {
          padding: 0 10px;
          font-size: var(--el-font-size-base);
          line-height: 1.5;
        }
      }
    }

    /* 勾选框样式与新建任务弹窗左下角「高级选项」一致：16px + 4px 圆角 + 居中对勾。
     用 !important 防止详情抽屉异步加载的 EP checkbox 样式（默认 14px）后写覆盖 */
    .el-checkbox__inner {
      width: 16px !important;
      height: 16px !important;
      border-radius: 4px !important;
      background-color: var(--lc-bg-input) !important;
      border-color: var(--lc-border-base) !important;

      &::after {
        width: 4px;
        height: 8px;
        left: 50%;
        top: 44%;
        transform: translate(-50%, -50%) rotate(45deg) scaleY(0);
        transform-origin: center;
      }
    }

    .el-checkbox__input.is-checked .el-checkbox__inner::after {
      transform: translate(-50%, -50%) rotate(45deg) scaleY(1);
    }

    /* 勾选/半选状态背景用主题色，避免被上面的灰色内框压成「灰底白勾」，
       浅色模式下几乎不可见而误以为未勾选（本规则特异性高于灰色内框规则） */
    .el-checkbox__input.is-checked .el-checkbox__inner,
    .el-checkbox__input.is-indeterminate .el-checkbox__inner {
      background-color: var(--el-checkbox-checked-bg-color, var(--lc-color-primary)) !important;
      border-color: var(--el-checkbox-checked-border-color, var(--lc-color-primary)) !important;
    }
  }
}
.file-filters {
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  .quick-filters {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;

    .file-type-slider {
      position: relative;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      padding: 2px;
      background: transparent !important;
      border: 1px solid var(--lc-border-base) !important;
      border-radius: 8px;
      overflow: hidden;
      box-sizing: border-box;

      .slider-indicator {
        position: absolute;
        top: 2px;
        left: 2px;
        width: calc(20% - 0.8px);
        height: calc(100% - 4px);
        background: rgba(0, 0, 0, 0.08);
        border-radius: 6px;
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
        height: 26px;
        padding: 0 7px;
        background: transparent !important;
        border: none !important;
        border-radius: 6px;
        cursor: pointer;
        outline: none !important;
        box-shadow: none !important;
        color: var(--el-text-color-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s ease;

        &:hover {
          color: var(--el-text-color-primary);
        }

        &.active {
          color: var(--el-color-primary);
        }
      }
    }

    .slider-confirm-btn {
      position: relative;
      z-index: 1;
      flex: 0 0 auto;
      height: 30px;
      padding: 0 12px;
      margin-left: 6px;
      background: transparent !important;
      border: 1px solid var(--lc-border-base) !important;
      border-radius: 8px;
      cursor: pointer;
      outline: none !important;
      box-shadow: none !important;
      color: #000000;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      box-sizing: border-box;
      transition: background 0.2s ease, color 0.2s ease;

      &:hover {
        background: rgba(0, 0, 0, 0.05) !important;
        color: #000000;
      }
    }
  }
  .files-summary {
    display: inline-flex;
    align-items: center;
    height: 30px;
    font-size: 12px;
    color: var(--el-text-color-regular);
    padding: 0 12px;
    background: transparent !important;
    border: 1px solid var(--lc-border-base) !important;
    border-radius: 8px;
    white-space: nowrap;
    flex-shrink: 0;
    box-sizing: border-box;
  }
}

.theme-dark {
  .file-filters .quick-filters {
    .file-type-slider {
      background: transparent !important;
      border-color: var(--lc-border-base) !important;

      .slider-indicator {
        background: rgba(255, 255, 255, 0.12);
      }

      .slider-btn {
        color: rgba(255, 255, 255, 0.55);

        &:hover {
          color: rgba(255, 255, 255, 0.85);
        }

        &.active {
          color: var(--el-color-primary);
        }
      }
    }

    .slider-confirm-btn {
      background: transparent !important;
      border-color: var(--lc-border-base) !important;
      color: #ffffff;

      &:hover {
        background: rgba(255, 255, 255, 0.08) !important;
        color: #ffffff;
      }
    }
  }
  .file-filters .files-summary {
    background: transparent !important;
    border-color: var(--lc-border-base) !important;
    color: rgba(255, 255, 255, 0.75);
  }
}

.theme-dark .mo-task-files .el-table__body-wrapper tr:not(:last-child)::after {
  background: var(--lc-border-base);
}

.theme-dark .mo-task-files .mo-table-wrapper {
  border-color: var(--lc-border-base) !important;
  background-color: var(--lc-task-item-bg) !important;
}

.theme-dark .mo-task-files .el-table {
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

  thead th,
  thead th.el-table__cell,
  thead th.is-leaf,
  thead th.el-table__cell.is-leaf,
  th.el-table__cell {
    background-color: transparent !important;
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
    border-bottom: none;
  }

  .el-table__empty-block {
    background-color: transparent !important;
  }

  .el-table__empty-text {
    color: var(--lc-text-placeholder) !important;
  }

  .el-checkbox__inner {
    background-color: var(--lc-bg-input) !important;
    border-color: var(--lc-border-base) !important;
  }

  &::before, &::after {
    display: none !important;
  }
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
