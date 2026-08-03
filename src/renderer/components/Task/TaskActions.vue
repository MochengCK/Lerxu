<template>
  <div class="task-actions">
    <div class="task-control-group">
      <el-tooltip
        class="item"
        effect="dark"
        placement="bottom"
        :content="$t('app.add-task')"
      >
        <i class="task-action" @click="onAddClick">
          <mo-icon name="menu-add" width="14" height="14" />
        </i>
      </el-tooltip>
      <span class="task-control-separator"></span>
      <el-tooltip
        class="item"
        effect="dark"
        placement="bottom"
        :content="$t('task.pause-all-task')"
      >
        <i
          class="task-action"
          :class="{ disabled: !canPauseAllTasks }"
          @click="onPauseAllClick"
        >
          <mo-icon name="task-pause-line" width="14" height="14" />
        </i>
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        placement="bottom"
        :content="$t('task.resume-all-task')"
      >
        <i
          class="task-action"
          :class="{ disabled: !canResumeAllTasks }"
          @click="onResumeAllClick"
        >
          <mo-icon name="task-start-line" width="14" height="14" />
        </i>
      </el-tooltip>
    </div>
    <slot></slot>
    <div class="task-action-group">
      <el-tooltip
        class="item"
        effect="dark"
        placement="bottom"
        :content="$t('task.purge-record')"
        v-if="currentList === 'stopped'"
      >
        <i class="task-action" @click="onPurgeRecordClick">
          <mo-icon name="purge" width="14" height="14" />
        </i>
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        placement="bottom"
        :content="$t('task.delete-selected-tasks')"
        v-if="currentList !== 'stopped'"
      >
        <i
          class="task-action"
          :class="{ disabled: selectedGidListCount === 0 }"
          @click="onBatchDeleteClick">
          <mo-icon name="delete" width="14" height="14" />
        </i>
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        placement="bottom"
        :content="$t('app.task-plan')"
      >
        <i
          class="task-action"
          :class="{ 'is-planned': isTaskPlanPlanned }"
          @click="onTaskPlanClick"
        >
          <mo-icon name="task-plan" width="16" height="16" />
        </i>
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        placement="bottom"
        :content="dateFilter.storeFilterDate || $t('task.date-filter')"
        :disabled="anyPopupOpen"
      >
        <i
          ref="dateFilterBtn"
          class="task-action date-filter-action"
          :class="{ 'has-filter': dateFilter.storeFilterDate, 'is-active': dateFilter.active }"
          @click.stop="onDateFilterClick"
          @mouseenter="onDateFilterEnter"
          @mouseleave="onDateFilterLeave"
        >
          <span
            class="task-date-filter-text"
            :class="{ visible: dateFilter.showText || dateFilter.storeFilterDate }"
          >{{ dateFilter.displayDateText }}</span>
          <mo-icon name="date-filter" width="16" height="16" />
        </i>
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        placement="bottom"
        :content="$t('task.sort')"
        :disabled="anyPopupOpen"
      >
        <i
          class="task-action sort-action"
          :class="{ 'is-active': isSortMenuVisible }"
          @click.stop="onSortClick"
        >
          <mo-icon name="sort" width="14" height="14" />
          <transition name="popup-scale">
            <div
              v-if="isSortMenuVisible"
              class="sort-menu"
              @click.stop
            >
              <div
                v-for="option in sortOptions"
                :key="option.value"
                :class="['sort-menu-item', { 'is-selected': currentSortField === option.value }]"
                @click="handleSortOptionClick(option.value)"
              >
                <span class="sort-menu-item-text">{{ option.label }}</span>
                <span v-if="currentSortField === option.value" :class="['sort-arrow', sortOrder === 'asc' ? 'sort-arrow-up' : 'sort-arrow-down']"></span>
              </div>
            </div>
          </transition>
        </i>
      </el-tooltip>
    </div>
    <mo-segmented-slider
      class="view-mode-nav"
      :value="viewMode"
      :options="viewModeOptions"
      icon-only
      @change="onViewModeChange"
    />
  </div>
</template>

<script>
  import { mapState } from 'vuex'

  import { commands } from '@/components/CommandManager/instance'
  import { ADD_TASK_TYPE, TASK_STATUS } from '@shared/constants'
  import { bytesToSize, timeFormat } from '@shared/utils'
  import SegmentedSlider from '@/components/SegmentedSlider/SegmentedSlider'
  import '@/components/Icons/menu-add'
  import '@/components/Icons/view-list'
  import '@/components/Icons/view-grid'
  import '@/components/Icons/delete'
  import '@/components/Icons/purge'
  import '@/components/Icons/more'
  import '@/components/Icons/task-plan'
  import '@/components/Icons/task-pause-line'
  import '@/components/Icons/task-start-line'
  import '@/components/Icons/sort'

  export default {
    name: 'mo-task-actions',
    components: {
      [SegmentedSlider.name]: SegmentedSlider
    },
    props: {
      task: {
        type: Object,
        default: null
      },
      dateFilter: {
        type: Object,
        default: () => ({
          storeFilterDate: null,
          displayDateText: '',
          active: false,
          showText: false,
          dateFilterFrosted: false
        })
      }
    },
    data () {
      return {
        isSortMenuVisible: false,
        currentSortField: 'name',
        sortOrder: 'asc',
        anyPopupOpen: false
      }
    },
    computed: {
      ...mapState('task', {
        currentList: state => state.currentList,
        selectedGidListCount: state => state.selectedGidList.length,
        viewMode: state => state.viewMode,
        taskList: state => state.taskList
      }),
      ...mapState('app', {
        stat: state => state.stat
      }),
      ...mapState('preference', {
        taskPlanActionFromConfig: state => (state.config && state.config.taskPlanAction) || 'none'
      }),
      viewModeOptions () {
        return [
          { value: 'list', icon: 'view-list', tooltip: this.$t('task.list-view') },
          { value: 'grid', icon: 'view-grid', tooltip: this.$t('task.grid-view') }
        ]
      },
      isTaskPlanPlanned () {
        return this.taskPlanActionFromConfig !== 'none'
      },
      sortOptions () {
        return [
          { label: this.$t('task.sort-by-completed-time'), value: 'completedTime' },
          { label: this.$t('task.sort-by-remaining-time'), value: 'remainingTime' },
          { label: this.$t('task.sort-by-speed'), value: 'speed' },
          { label: this.$t('task.sort-by-size'), value: 'size' },
          { label: this.$t('task.sort-by-name'), value: 'name' }
        ]
      },
      canPauseAllTasks () {
        return this.stat && this.stat.numActive > 0
      },
      canResumeAllTasks () {
        if (this.taskList.length === 0) return false
        const resumableTasks = this.taskList.filter(task => {
          return task.status === TASK_STATUS.WAITING || task.status === TASK_STATUS.PAUSED
        })
        return resumableTasks.length > 0
      }
    },
    filters: {
      bytesToSize,
      timeFormat
    },
    methods: {
      onBatchDeleteClick (event) {
        const deleteWithFiles = !!event.shiftKey
        commands.emit('batch-delete-task', { deleteWithFiles })
      },
      onViewModeChange (mode) {
        if (this.viewMode !== mode) {
          this.$store.dispatch('task/updateViewMode', mode)
        }
      },
      onPurgeRecordClick () {
        this.$store.dispatch('task/purgeTaskRecord')
          .then(() => {
            this.$msg.success(this.$t('task.purge-record-success'))
          })
          .catch(({ code }) => {
            if (code === 1) {
              this.$msg.error(this.$t('task.purge-record-fail'))
            }
          })
      },
      onAddClick () {
        this.$store.dispatch('app/showAddTaskDialog', ADD_TASK_TYPE.URI)
      },
      onTaskPlanClick () {
        if (this.isTaskPlanPlanned) {
          this.$store.dispatch('preference/save', {
            taskPlanAction: 'none',
            taskPlanType: 'complete',
            taskPlanTime: '',
            taskPlanGids: [],
            taskPlanOnlyWhenIdle: false
          })
          this.$store.commit('app/UPDATE_TASK_PLAN_VISIBLE', false)
          this.$msg.success(this.$t('app.task-plan-cancelled-message'))
          return
        }
        this.$store.commit('app/UPDATE_TASK_PLAN_VISIBLE', true)
      },
      onPauseAllClick () {
        if (!this.canPauseAllTasks) return
        this.$store.dispatch('task/pauseAllTask')
          .then(() => {
            this.$msg.success(this.$t('task.pause-all-task-success'))
          })
          .catch(({ code }) => {
            if (code === 1) {
              this.$msg.error(this.$t('task.pause-all-task-fail'))
            }
          })
      },
      onResumeAllClick () {
        if (!this.canResumeAllTasks) return
        this.$store.dispatch('task/resumeAllTask')
          .then(() => {
            this.$msg.success(this.$t('task.resume-all-task-success'))
          })
          .catch(({ code }) => {
            if (code === 1) {
              this.$msg.error(this.$t('task.resume-all-task-fail'))
            }
          })
      },
      onSortClick () {
        if (this.isSortMenuVisible) {
          this.isSortMenuVisible = false
          this.anyPopupOpen = false
          return
        }
        // 先通知其它弹窗关闭，再用双 rAF 延迟开启自身 enter：第一帧让其它弹窗的 leave
        // 过渡启动，第二帧才开启 enter，避免与 leave 同帧渲染导致 enter 起始状态
        // （scale(0.92)/opacity:0）未绘制即切到终态、入场动画丢失。
        commands.emit('popup:open', 'task-sort')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.isSortMenuVisible = true
            this.anyPopupOpen = true
          })
        })
      },
      onOtherPopupOpen (source) {
        if (source !== 'task-sort' && this.isSortMenuVisible) {
          this.isSortMenuVisible = false
        }
        this.anyPopupOpen = true
      },
      onPopupClosed () {
        this.anyPopupOpen = false
      },
      handleGlobalClick (event) {
        if (this.isSortMenuVisible && !this.$el.contains(event.target)) {
          this.isSortMenuVisible = false
          this.anyPopupOpen = false
          commands.emit('popup:closed')
        }
      },
      handleSortOptionClick (sortField) {
        if (this.currentSortField === sortField) {
          this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc'
        } else {
          this.currentSortField = sortField
          this.sortOrder = 'asc'
        }
        this.$store.dispatch('task/sortTasks', {
          field: this.currentSortField,
          order: this.sortOrder
        })
        this.saveSortState()
        this.isSortMenuVisible = false
        this.anyPopupOpen = false
        commands.emit('popup:closed')
      },
      saveSortState () {
        try {
          const sortState = {
            field: this.currentSortField,
            order: this.sortOrder
          }
          window.localStorage.setItem('taskSortState', JSON.stringify(sortState))
        } catch (e) {
          console.error('Failed to save sort state:', e)
        }
      },
      loadSortState () {
        try {
          const savedState = window.localStorage.getItem('taskSortState')
          if (savedState) {
            const sortState = JSON.parse(savedState)
            if (sortState.field && sortState.order) {
              this.currentSortField = sortState.field
              this.sortOrder = sortState.order
              this.$store.dispatch('task/sortTasks', {
                field: this.currentSortField,
                order: this.sortOrder
              })
            }
          }
        } catch (e) {
          console.error('Failed to load sort state:', e)
        }
      },
      onDateFilterClick (event) {
        event.stopPropagation()
        event.preventDefault()
        const rect = this.$refs.dateFilterBtn
          ? this.$refs.dateFilterBtn.getBoundingClientRect()
          : event.target.getBoundingClientRect()
        this.$emit('date-filter-click', { event, rect })
      },
      onDateFilterEnter () {
        this.$emit('date-filter-hover')
      },
      onDateFilterLeave () {
        this.$emit('date-filter-leave')
      }
    },
    mounted () {
      document.addEventListener('click', this.handleGlobalClick)
      commands.on('popup:open', this.onOtherPopupOpen)
      commands.on('popup:closed', this.onPopupClosed)
      this.loadSortState()
    },
    beforeDestroy () {
      document.removeEventListener('click', this.handleGlobalClick)
      commands.removeListener('popup:open', this.onOtherPopupOpen)
      commands.removeListener('popup:closed', this.onPopupClosed)
    }
  }
</script>

<style lang="scss">
.task-actions {
  position: absolute;
  top: 6px;
  left: 0;
  right: 0;
  height: 28px;
  padding: 0 6px;
  box-sizing: border-box;
  overflow: visible;
  user-select: none;
  cursor: default;
  color: $--task-action-color;
  transition: all 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.task-action-group {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 4px;
  pointer-events: auto;
  background-color: transparent;
  border: 1px solid $--task-item-border-color;
  border-radius: 8px;
  box-sizing: border-box;
  flex-shrink: 0;

  .task-action {
    display: inline-block;
    padding: 5px;
    margin: 0 4px;
    font-size: 0;
    cursor: pointer;
    outline: none;
    &:hover {
      color: $--task-action-hover-color;
    }
    &.disabled {
      color: $--task-action-disabled-color;
    }
    &.is-planned {
      color: #67c23a;
    }
  }
  .date-filter-action {
    display: inline-flex;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    &.has-filter {
      color: $--color-primary;
    }
    &.is-active {
      color: $--color-primary;
    }
    .task-date-filter-text {
      font-size: 12px;
      font-style: normal;
      margin-right: 2px;
      position: relative;
      top: 1px;
      opacity: 0;
      max-width: 0;
      overflow: hidden;
      transition: opacity 0.3s ease, max-width 0.3s ease;
      &.visible {
        opacity: 1;
        max-width: 80px;
      }
    }
  }
}

.task-control-group {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 4px;
  pointer-events: auto;
  background-color: transparent;
  border: 1px solid $--task-item-border-color;
  border-radius: 8px;
  box-sizing: border-box;
  flex-shrink: 0;

  .task-action {
    display: inline-block;
    padding: 5px;
    margin: 0 4px;
    font-size: 0;
    cursor: pointer;
    outline: none;
    &:hover {
      color: $--task-action-hover-color;
    }
    &.disabled {
      color: $--task-action-disabled-color;
    }
  }
}

.task-control-separator {
  display: inline-block;
  width: 1px;
  height: 14px;
  background-color: currentColor;
  opacity: 0.2;
  margin: 6px 4px;
  flex-shrink: 0;
}

/* 视图切换滑块：父容器 pointer-events:none，此处恢复 */
.view-mode-nav {
  pointer-events: auto;
}

/* 背景图模式下：操作按钮容器边框加亮 */
.theme-light.has-app-background-image .task-action-group,
.theme-dark.has-app-background-image .task-action-group,
.theme-light.has-app-background-image .task-control-group,
.theme-dark.has-app-background-image .task-control-group {
  border-color: var(--lc-task-item-hover-border);
}

/* 排序菜单 */
.sort-action {
  position: relative;
  &.is-active {
    color: $--color-primary;
  }
}

.sort-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  min-width: 120px;
  background-color: var(--lc-bg-dropdown, #fff);
  border: none;
  border-radius: var(--lc-radius-dropdown);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  padding: 4px 0;
  transform-origin: top right;
  overflow: hidden;
}

.sort-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
  font-style: normal;
  color: var(--lc-text-regular, #333);
  transition: background-color 0.15s ease;

  &:hover {
    background-color: var(--lc-bg-hover, rgba(0, 0, 0, 0.06));
  }

  &.is-selected {
    color: $--color-primary;
  }
}

.sort-menu-item-text {
  white-space: nowrap;
  font-style: normal;
}

.sort-arrow {
  display: inline-block;
  width: 0;
  height: 0;
  margin-left: 8px;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
}

.sort-arrow-up {
  border-bottom: 5px solid $--color-primary;
}

.sort-arrow-down {
  border-top: 5px solid $--color-primary;
}

.theme-dark .sort-menu {
  background-color: var(--lc-bg-dropdown, #2e333b);
  border: none;
}

.theme-dark .sort-menu-item {
  color: var(--lc-text-regular, #ddd);

  &:hover {
    background-color: var(--lc-bg-hover, rgba(255, 255, 255, 0.08));
  }
}
</style>
