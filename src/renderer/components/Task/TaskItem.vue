<template>
  <div :key="task.gid" :class="['task-item', `task-item--${viewMode}`]" v-on:dblclick="onDbClick">
    <div v-if="showTaskTypeBadge" class="task-type-badge" :class="`task-type-badge--${taskType}`">
      {{ taskTypeLabel }}
    </div>
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
        }
      },
      taskFullName () {
        this.updateTaskNameTruncation()
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
      showTaskTypeBadge () {
        return this.preferenceConfig?.showTaskTypeBadge !== false
      },
      taskType () {
        const type = this.task && this.task.taskType ? `${this.task.taskType}`.toLowerCase() : ''
        const hasInfoHash = !!(this.task && this.task.infoHash)
        const hasBittorrent = !!(this.task && this.task.bittorrent)
        if (['bt', 'magnet', 'http', 'https', 'ftp'].includes(type)) {
          if (type === 'http' && (hasBittorrent || hasInfoHash)) {
            const btInfo = hasBittorrent && this.task.bittorrent && this.task.bittorrent.info
            return btInfo ? 'bt' : 'magnet'
          }
          return type
        }
        if (hasBittorrent || hasInfoHash) {
          const btInfo = hasBittorrent && this.task.bittorrent && this.task.bittorrent.info
          return btInfo ? 'bt' : 'magnet'
        }
        return 'http'
      },
      taskTypeLabel () {
        const typeMap = {
          bt: 'BT',
          magnet: this.$t('task.task-type-magnet') || 'Magnet',
          http: 'HTTP',
          https: 'HTTPS',
          ftp: 'FTP'
        }
        return typeMap[this.taskType] || 'HTTP'
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
        if (isSeeder && task.status === TASK_STATUS.ACTIVE) {
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
  min-height: 104px;
  padding: 16px 12px;
  background-color: $--task-item-background;
  border: 1px solid $--task-item-border-color;
  border-radius: 6px;
  margin-bottom: 16px;
  transition: $--border-transition-base;
  box-sizing: border-box;

  &:hover {
    border-color: $--task-item-hover-border-color;
  }

  .task-item-actions-wrapper {
    position: absolute;
    top: 16px;
    right: 12px;
  }

  &.task-item--grid {
    margin-bottom: 0;
    border: 1px solid $--task-item-border-color;
    border-radius: 6px;
    background-color: $--task-item-background;
    height: 104px;
    min-height: 104px;
    padding: 16px 12px;
    overflow: visible;
    transition: $--border-transition-base;
    box-sizing: border-box;

    &:hover {
      border-color: $--task-item-hover-border-color;
    }

    .task-name {
      margin-right: 170px;
      margin-bottom: 1.25rem;

      .task-name__text {
        font-size: 14px;
        line-height: 26px;
        display: block;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
        mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
      }
    }

    .task-item-actions-wrapper {
      top: 16px;
      right: 12px;
      z-index: 10;
    }
  }
}

.task-type-badge {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 120px;
  font-weight: 700;
  color: #c0c4cc;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  user-select: none;
  pointer-events: none;
  opacity: 0.3;
  line-height: 1;
  height: 120px;

  &.task-type-badge--bt {
    transform: translateY(-55%);
  }

  &.task-type-badge--https {
    transform: translateY(-55%);
  }

  &.task-type-badge--magnet {
    font-size: 88px;
    height: 88px;
  }
}

.theme-dark .task-type-badge {
  color: #5f5b54;
  opacity: 0.3;
}

.theme-light.has-app-background-image .task-item {
  background-color: rgba(255, 255, 255, var(--app-ui-opacity-task-item, var(--app-ui-opacity, 0.9)));
  backdrop-filter: blur(var(--app-ui-frosted-blur-task-item, var(--app-ui-frosted-blur, 0px)));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-item, var(--app-ui-frosted-blur, 0px)));
}

.theme-dark.has-app-background-image .task-item {
  background-color: rgba(45, 45, 45, var(--app-ui-opacity-task-item, var(--app-ui-opacity, 0.9)));
  backdrop-filter: blur(var(--app-ui-frosted-blur-task-item, var(--app-ui-frosted-blur, 0px)));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-item, var(--app-ui-frosted-blur, 0px)));
}

.task-item-wrapper--background-progress .task-item {
  background: transparent !important;
  border: none !important;

  &:hover {
    background: transparent !important;
  }
}

.theme-dark .task-item-wrapper--background-progress .task-item {
  background: transparent !important;
  border: none !important;

  &:hover {
    background: transparent !important;
  }
}

.selected .task-item {
  border-color: $--task-item-hover-border-color;
}

.task-name {
  color: #505753;
  margin-bottom: 1.25rem;
  margin-right: 170px;
  margin-left: 0;
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
