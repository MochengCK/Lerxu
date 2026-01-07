<template>
  <div class="task-actions">
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
    props: ['task'],
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
  transition: all 0.25s;
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

.view-mode-nav {
  display: inline-flex;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  padding: 2px;
  margin: 0 4px;
  height: 24px;
  box-sizing: border-box;

  &__item {
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
      background-color: $--color-primary;
      color: #fff;

      &:hover {
        color: #fff;
      }
    }
  }
}

// 暗色主题支持
.theme-dark {
  .view-mode-nav {
    background-color: rgba(255, 255, 255, 0.1);

    &__item {
      color: $--dk-task-action-color;

      &:hover {
        color: $--dk-task-action-hover-color;
      }

      &--active {
        background-color: $--color-primary;
        color: #fff;

        &:hover {
          color: #fff;
        }
      }
    }
  }
}
</style>
