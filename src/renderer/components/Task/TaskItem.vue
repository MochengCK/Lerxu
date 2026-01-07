<template>
  <div :key="task.gid" :class="['task-item', `task-item--${viewMode}`]" v-on:dblclick="onDbClick">
    <div class="task-name">
      <el-tooltip
        effect="dark"
        :content="taskFullName"
        placement="top"
        :open-delay="500"
        :disabled="!taskNameTruncated"
      >
        <span ref="taskNameText" class="task-name__text">{{ taskFullName }}</span>
      </el-tooltip>
    </div>
    <mo-task-item-actions mode="LIST" :task="task" />
    <div class="task-progress" v-if="taskProgressMode === 'component'">
      <mo-task-progress
        :completed="Number(task.completedLength)"
        :total="Number(task.totalLength)"
        :status="taskStatus"
        :speed="Number(task.downloadSpeed)"
      />
      <mo-task-progress-info :task="task" :view-mode="viewMode" />
    </div>
    <div class="task-progress" v-else-if="taskProgressMode === 'background'">
      <mo-task-progress-info :task="task" :view-mode="viewMode" />
    </div>
  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import { basename } from 'node:path'
  import { checkTaskIsSeeder, getTaskName, ellipsis } from '@shared/utils'
  import { TASK_STATUS } from '@shared/constants'
  import { openItem, getTaskActualPath } from '@/utils/native'
  import { commands } from '@/components/CommandManager/instance'
  import TaskItemActions from './TaskItemActions'
  import TaskProgress from './TaskProgress'
  import TaskProgressInfo from './TaskProgressInfo'

  export default {
    name: 'mo-task-item',
    components: {
      [TaskItemActions.name]: TaskItemActions,
      [TaskProgress.name]: TaskProgress,
      [TaskProgressInfo.name]: TaskProgressInfo
    },
    props: {
      task: {
        type: Object
      },
      viewMode: {
        type: String,
        default: 'list'
      }
    },
    data () {
      return {
        taskNameTruncated: false
      }
    },
    watch: {
      'task.status': {
        immediate: true,
        handler (val) {
          if (val === TASK_STATUS.COMPLETE) {
            this.ensureFixedDisplayName()
          }
        },
        taskFullName () {
          this.updateTaskNameTruncation()
        }
      }
    },
    computed: {
      ...mapState('preference', {
        preferenceConfig: state => state.config
      }),
      ...mapState('task', {
        taskDisplayNames: state => state.taskDisplayNames
      }),
      taskProgressMode () {
        return this.preferenceConfig?.taskProgressMode || 'component'
      },
      taskFullName () {
        const { task } = this
        if (task && task.status === TASK_STATUS.COMPLETE) {
          const gid = task && task.gid ? `${task.gid}` : ''
          const cached = gid && this.taskDisplayNames ? this.taskDisplayNames[gid] : ''
          if (cached) {
            return cached
          }
          return this.getCompletedDisplayName(task)
        }

        return getTaskName(task, {
          defaultName: this.$t('task.get-task-name'),
          maxLen: -1
        })
      },
      taskName () {
        const { task } = this
        if (task && task.status === TASK_STATUS.COMPLETE) {
          const gid = task && task.gid ? `${task.gid}` : ''
          const cached = gid && this.taskDisplayNames ? this.taskDisplayNames[gid] : ''
          if (cached) {
            return ellipsis(cached, 64)
          }
          return ellipsis(this.getCompletedDisplayName(task), 64)
        }

        return getTaskName(task, {
          defaultName: this.$t('task.get-task-name')
        })
      },
      isSeeder () {
        return checkTaskIsSeeder(this.task)
      },
      taskStatus () {
        const { task, isSeeder } = this
        if (isSeeder) {
          return TASK_STATUS.SEEDING
        } else {
          return task.status
        }
      }

    },
    mounted () {
      this.updateTaskNameTruncation()
      window.addEventListener('resize', this.updateTaskNameTruncation)
    },
    destroyed () {
      window.removeEventListener('resize', this.updateTaskNameTruncation)
    },
    methods: {
      getCompletedDisplayName (task) {
        const config = this.preferenceConfig || {}
        const suffix = config.downloadingFileSuffix || ''
        const path = getTaskActualPath(task, config)
        const base = basename(path || '')
        if (suffix && base.endsWith(suffix)) {
          return base.slice(0, -suffix.length)
        }
        return base
      },
      ensureFixedDisplayName () {
        const { task } = this
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) {
          return
        }
        const cached = this.taskDisplayNames ? this.taskDisplayNames[gid] : ''
        if (cached) {
          return
        }
        const name = this.getCompletedDisplayName(task)
        if (name) {
          this.$store.dispatch('task/setTaskDisplayName', { gid, name })
        }
      },
      updateTaskNameTruncation () {
        this.$nextTick(() => {
          const el = this.$refs.taskNameText
          if (!el || !el.scrollWidth || !el.clientWidth) {
            this.taskNameTruncated = false
            return
          }
          this.taskNameTruncated = el.scrollWidth > el.clientWidth
        })
      },
      onDbClick () {
        const { status } = this.task
        const { COMPLETE, WAITING, PAUSED, ACTIVE } = TASK_STATUS
        if (status === COMPLETE) {
          this.openTask()
          return
        }
        if ([WAITING, PAUSED, ACTIVE].includes(status)) {
          commands.emit('show-task-progress', { task: this.task })
          return
        }
        this.toggleTask()
      },
      async openTask () {
        const { taskName } = this
        this.$msg.info(this.$t('task.opening-task-message', { taskName }))
        const config = this.$store.state.preference.config || {}
        const fullPath = getTaskActualPath(this.task, config)
        const result = await openItem(fullPath)
        if (result) {
          this.$msg.error(this.$t('task.file-not-exist'))
        }
      },
      toggleTask () {
        this.$store.dispatch('task/toggleTask', this.task)
      }
    }
  }
</script>

<style lang="scss">
.task-item {
  position: relative;
  min-height: 110px; // 统一设置为110px，确保所有视图下高度一致
  padding: 16px 12px;
  background-color: $--task-item-background;
  border: 1px solid $--task-item-border-color;
  border-radius: 6px;
  margin-bottom: 16px;
  transition: $--border-transition-base;
  box-sizing: border-box; // 确保padding包含在高度内

  &:hover {
    border-color: $--task-item-hover-border-color;
  }

  .task-item-actions-wrapper {
    position: absolute;
    top: 16px;
    right: 12px;
  }

  // 列表视图样式（默认）
  &.task-item--list {
    // 保持原有样式
  }

  // 网格视图样式
  &.task-item--grid {
    margin-bottom: 0;
    border: 1px solid $--task-item-border-color; // 恢复边框，与列表视图一致
    border-radius: 6px; // 恢复圆角，与列表视图一致
    background-color: $--task-item-background; // 使用与列表视图相同的背景色
    height: 110px; // 固定高度，确保一致性
    min-height: 110px; // 与基础样式保持一致
    padding: 16px 12px; // 与列表视图保持一致
    overflow: visible; // 改为visible，让弹窗能够显示
    transition: $--border-transition-base; // 与列表视图一致的过渡效果
    box-sizing: border-box; // 确保padding包含在高度内

    // 悬停效果与列表视图完全一致
    &:hover {
      border-color: $--task-item-hover-border-color; // 只改变边框色，与列表视图一致
    }

    .task-name {
      margin-right: 170px; // 与列表视图保持一致
      margin-bottom: 1.5rem; // 与列表视图保持一致

      .task-name__text {
        font-size: 14px; // 与列表视图保持一致
        line-height: 26px; // 与列表视图保持一致
        display: block;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
        mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
      }
    }

    .task-item-actions-wrapper {
      top: 16px; // 与列表视图保持一致
      right: 12px; // 与列表视图保持一致
      z-index: 10; // 确保操作按钮和弹窗在最上层
    }

    // 在网格视图中的样式调整
    .task-progress {
      // 进度条信息的样式可以在这里调整
    }
  }
}

// 背景进度条模式下的TaskItem样式调整
.task-item-wrapper--background-progress .task-item {
  background: transparent !important; // 强制透明背景，让进度条可见
  border: none !important; // 移除边框，由wrapper控制

  &:hover {
    background: transparent !important; // 悬停时保持透明，不添加额外背景
  }
}

// 暗色主题下的背景进度条模式
.theme-dark .task-item-wrapper--background-progress .task-item {
  background: transparent !important; // 暗色主题也使用透明背景
  border: none !important; // 移除边框，由wrapper控制

  &:hover {
    background: transparent !important; // 悬停时保持透明，不添加额外背景
  }
}

.selected .task-item {
  border-color: $--task-item-hover-border-color;
}

.task-name {
  color: #505753;
  margin-bottom: 1.5rem;
  margin-right: 170px;
  min-height: 26px;

  .task-name__text {
    font-size: 14px;
    line-height: 26px;
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    position: relative;
    -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
    mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
  }
}
</style>
