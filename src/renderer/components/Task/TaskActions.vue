<template>
  <div :class="['task-actions', { 'task-actions--titlebar': showInTitlebar }]">
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
      :content="$t('task.refresh-list')"
    >
      <i class="task-action" @click="onRefreshClick">
        <mo-icon name="refresh" width="14" height="14" :spin="refreshing" />
      </i>
    </el-tooltip>
    <div class="view-mode-nav">
      <div
        class="view-mode-nav__highlight"
        :class="{ 'is-grid': viewMode === 'grid' }"
      ></div>
      <el-tooltip
        effect="dark"
        placement="bottom"
        :content="$t('task.list-view')"
      >
        <div
          :class="['view-mode-nav__item', { 'view-mode-nav__item--active': viewMode === 'list' }]"
          @click="onViewModeChange('list')"
        >
          <mo-icon name="view-list" width="14" height="14" />
        </div>
      </el-tooltip>
      <el-tooltip
        effect="dark"
        placement="bottom"
        :content="$t('task.grid-view')"
      >
        <div
          :class="['view-mode-nav__item', { 'view-mode-nav__item--active': viewMode === 'grid' }]"
          @click="onViewModeChange('grid')"
        >
          <mo-icon name="view-grid" width="14" height="14" />
        </div>
      </el-tooltip>
    </div>
  </div>
</template>

<script>
  import { mapState } from 'vuex'

  import { commands } from '@/components/CommandManager/instance'
  import { ADD_TASK_TYPE } from '@shared/constants'
  import { bytesToSize, timeFormat } from '@shared/utils'
  import '@/components/Icons/menu-add'
  import '@/components/Icons/refresh'
  import '@/components/Icons/view-list'
  import '@/components/Icons/view-grid'
  import '@/components/Icons/delete'
  import '@/components/Icons/purge'
  import '@/components/Icons/more'

  export default {
    name: 'mo-task-actions',
    components: {
    },
    props: {
      task: {
        type: Object,
        default: null
      },
      showInTitlebar: {
        type: Boolean,
        default: false
      }
    },
    data () {
      return {
        refreshing: false
      }
    },
    computed: {
      ...mapState('task', {
        currentList: state => state.currentList,
        selectedGidListCount: state => state.selectedGidList.length,
        viewMode: state => state.viewMode
      })
    },
    filters: {
      bytesToSize,
      timeFormat
    },
    methods: {
      refreshSpin () {
        this.t && clearTimeout(this.t)

        this.refreshing = true
        this.t = setTimeout(() => {
          this.refreshing = false
        }, 500)
      },
      onBatchDeleteClick (event) {
        const deleteWithFiles = !!event.shiftKey
        commands.emit('batch-delete-task', { deleteWithFiles })
      },
      onRefreshClick () {
        this.refreshSpin()
        this.$store.dispatch('task/fetchList')
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
      }
    }
  }
</script>

<style lang="scss">
.task-actions {
  position: absolute;
  top: 44px;
  right: 0;
  height: 24px;
  padding: 0;
  overflow: hidden;
  user-select: none;
  cursor: default;
  text-align: right;
  color: $--task-action-color;
  transition: all 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
  display: flex;
  align-items: center;

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

.task-actions.task-actions--titlebar {
  position: fixed;
  top: 9px;
  right: 160px;
  z-index: 10000;
  overflow: visible;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  transition: opacity 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
}

.is-task-detail-open .task-actions.task-actions--titlebar,
  .is-add-task-open .task-actions.task-actions--titlebar,
  .is-task-plan-open .task-actions.task-actions--titlebar {
    z-index: 1999;
    opacity: 0;
    pointer-events: none;
    transition: none;
  }

.task-actions.task-actions--titlebar::after {
  content: '';
  position: absolute;
  right: -10px;
  top: 4px;
  width: 1px;
  height: 16px;
  background-color: $--task-action-color;
  opacity: 0.5;
}
.view-mode-nav {
  position: relative;
  display: inline-flex;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  padding: 2px;
  margin: 0 4px;
  height: 24px;
  box-sizing: border-box;

  &__highlight {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 28px;
    height: 20px;
    border-radius: 6px;
    background-color: $--color-primary;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    z-index: 1;
    transform: translate3d(0, 0, 0);

    &.is-grid {
      transform: translate3d(100%, 0, 0);
    }
  }

  &__item {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 20px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: $--task-action-color;

    &:hover {
      color: $--task-action-hover-color;
    }

    &--active {
      background-color: transparent;
      color: #fff;

      &:hover {
        color: #fff;
      }
    }
  }
}

// 暗色主题支持
.theme-dark {
  .task-actions.task-actions--titlebar::after {
    background-color: $--dk-task-action-color;
  }
  .view-mode-nav {
    background-color: rgba(255, 255, 255, 0.1);

    &__item {
      color: $--dk-task-action-color;

      &:hover {
        color: $--dk-task-action-hover-color;
      }

      &--active {
        background-color: transparent;
        color: #fff;

        &:hover {
          color: #fff;
        }
      }
    }
  }
}
</style>
