<template>
  <div :key="task.gid" :class="['task-item', `task-item--${viewMode}`]" v-on:dblclick="onDbClick">
    <div v-if="showTaskTypeBadge" class="task-type-badge" :class="[`task-type-badge--${taskType}`, { 'is-magnet-en': taskType === 'magnet' && taskTypeLabel === 'Magnet' }]">
      {{ taskTypeLabel }}
    </div>
    <div class="task-name">
      <mo-hover-tip
        effect="dark"
        :content="taskFullName"
        placement="top"
        :open-delay="500"
        :disabled="!taskNameTruncated"
      >
        <span ref="taskNameText" :class="['task-name__text', { 'is-truncated': taskNameTruncated }]">{{ taskFullName }}</span>
      </mo-hover-tip>
    </div>
    <mo-task-item-actions mode="LIST" :task="task" />
    <div class="task-progress">
      <mo-task-progress
        :completed="Number(task.completedLength)"
        :total="Number(task.totalLength)"
        :status="taskStatus"
        :speed="Number(task.downloadSpeed)"
        :pending-selection="isPendingFileSelection"
      />
      <mo-task-progress-info :task="task" :view-mode="viewMode" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, getCurrentInstance } from 'vue'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { basename } from 'node:path'
import { checkTaskIsSeeder, getTaskName, ellipsis, isEd2kTask } from '@shared/utils'
import { TASK_STATUS } from '@shared/constants'
import { openItem, getTaskActualPath } from '@/utils/native'
import { commands } from '@/components/CommandManager/instance'
import TaskItemActions from './TaskItemActions'
import TaskProgress from './TaskProgress'
import TaskProgressInfo from './TaskProgressInfo'
import { usePreferenceStore, useTaskStore } from '@/store'
import { storeToRefs } from 'pinia'

const props = defineProps({
  task: {
    type: Object
  },
  viewMode: {
    type: String,
    default: 'list'
  },
  resizeVersion: {
    type: Number,
    default: 0
  }
})

defineOptions({
  name: 'mo-task-item'
})

const { t } = i18n.global
const instance = getCurrentInstance()

const preferenceStore = usePreferenceStore()
const taskStore = useTaskStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)
const { taskDisplayNames, pendingFileSelection } = storeToRefs(taskStore)

const taskNameTruncated = ref(false)
const taskNameText = ref(null)

const showTaskTypeBadge = computed(() => preferenceConfig.value?.showTaskTypeBadge === true)

const taskType = computed(() => {
  const type = props.task?.taskType ? `${props.task.taskType}`.toLowerCase() : ''
  const hasInfoHash = !!(props.task?.infoHash)
  const hasBittorrent = !!(props.task?.bittorrent)
  if (type === 'ed2k' || isEd2kTask(props.task)) return 'ed2k'
  if (['bt', 'magnet', 'http', 'https', 'ftp'].includes(type)) {
    if (type === 'http' && (hasBittorrent || hasInfoHash)) {
      const btInfo = hasBittorrent && props.task.bittorrent?.info
      return btInfo ? 'bt' : 'magnet'
    }
    return type
  }
  if (hasBittorrent || hasInfoHash) {
    const btInfo = hasBittorrent && props.task.bittorrent?.info
    return btInfo ? 'bt' : 'magnet'
  }
  return 'http'
})

const taskTypeLabel = computed(() => {
  const typeMap = {
    bt: 'BT',
    magnet: t('task.task-type-magnet') || 'Magnet',
    http: 'HTTP',
    https: 'HTTPS',
    ftp: 'FTP',
    ed2k: 'ED2K'
  }
  return typeMap[taskType.value] || 'HTTP'
})

const isSeeder = computed(() => checkTaskIsSeeder(props.task))

const taskStatus = computed(() => {
  if (isSeeder.value && props.task.status === TASK_STATUS.ACTIVE) {
    return TASK_STATUS.SEEDING
  }
  return props.task.status
})

const isPendingFileSelection = computed(() => {
  const gid = props.task?.gid ? `${props.task.gid}` : ''
  if (!gid) return false
  return !!(pendingFileSelection.value && pendingFileSelection.value[gid])
})

function getCompletedDisplayName (task) {
  const config = preferenceConfig.value || {}
  const suffix = config.downloadingFileSuffix || ''
  const path = getTaskActualPath(task, config)
  const base = basename(path || '')
  if (suffix && base.endsWith(suffix)) {
    return base.slice(0, -suffix.length)
  }
  return base
}

const taskFullName = computed(() => {
  const task = props.task
  if (task && (task.status === TASK_STATUS.COMPLETE || task.status === TASK_STATUS.MERGING)) {
    const gid = task.gid ? `${task.gid}` : ''
    const cached = gid && taskDisplayNames.value ? taskDisplayNames.value[gid] : ''
    if (cached) return cached
    return getCompletedDisplayName(task)
  }
  return getTaskName(task, {
    defaultName: t('task.get-task-name'),
    maxLen: -1
  })
})

const taskName = computed(() => {
  const task = props.task
  if (task && (task.status === TASK_STATUS.COMPLETE || task.status === TASK_STATUS.MERGING)) {
    const gid = task.gid ? `${task.gid}` : ''
    const cached = gid && taskDisplayNames.value ? taskDisplayNames.value[gid] : ''
    if (cached) return ellipsis(cached, 64)
    return ellipsis(getCompletedDisplayName(task), 64)
  }
  return getTaskName(task, {
    defaultName: t('task.get-task-name')
  })
})

watch(() => props.task?.status, (val) => {
  if (val === TASK_STATUS.COMPLETE || val === TASK_STATUS.MERGING) {
    ensureFixedDisplayName()
  }
}, { immediate: true })

watch(taskFullName, () => {
  updateTaskNameTruncation()
}, { immediate: true })

watch(() => props.resizeVersion, () => {
  updateTaskNameTruncation()
})

function ensureFixedDisplayName () {
  const task = props.task
  const gid = task?.gid ? `${task.gid}` : ''
  if (!gid) return
  const cached = taskDisplayNames.value ? taskDisplayNames.value[gid] : ''
  if (cached) return
  const name = getCompletedDisplayName(task)
  if (name) {
    taskStore.setTaskDisplayName({ gid, name })
  }
}

function updateTaskNameTruncation () {
  nextTick(() => {
    const el = taskNameText.value
    if (!el || !el.scrollWidth || !el.clientWidth) {
      taskNameTruncated.value = false
      return
    }
    taskNameTruncated.value = el.scrollWidth > el.clientWidth
  })
}

function onDbClick () {
  const { status } = props.task
  const { COMPLETE, WAITING, PAUSED, ACTIVE, MERGING } = TASK_STATUS
  if (status === COMPLETE) {
    openTask()
    return
  }
  if (status === MERGING) return
  if ([WAITING, PAUSED, ACTIVE].includes(status)) {
    commands.emit('show-task-progress', { task: props.task })
    return
  }
  toggleTask()
}

async function openTask () {
  const tn = taskName.value
  instance.proxy.$msg.info(t('task.opening-task-message', { taskName: tn }))
  const config = preferenceConfig.value || {}
  const fullPath = getTaskActualPath(props.task, config)
  const result = await openItem(fullPath)
  if (result) {
    instance.proxy.$msg.error(t('task.file-not-exist'))
  }
}

function toggleTask () {
  taskStore.toggleTask(props.task)
}

onMounted(() => {
  updateTaskNameTruncation()
})
</script>

<style lang="scss">
.task-item {
  position: relative;
  min-height: 96px;
  padding: 12px 12px;
  background-color: var(--lc-task-item-bg);
  border: 1px solid var(--lc-task-item-border);
  border-radius: 8px;
  margin-bottom: 16px;
  transition: border-color 0.25s cubic-bezier(.645,.045,.355,1);
  box-sizing: border-box;

  &:hover {
    border-color: var(--lc-task-item-hover-border);
  }

  .task-item-actions-wrapper {
    position: absolute;
    top: 12px;
    right: -4px;
  }

  &.task-item--grid {
    margin-bottom: 0;
    border: 1px solid var(--lc-task-item-border);
    border-radius: 8px;
    background-color: var(--lc-task-item-bg);
    height: 96px;
    min-height: 96px;
    padding: 12px 12px;
    overflow: visible;
    transition: border-color 0.25s cubic-bezier(.645,.045,.355,1);
    box-sizing: border-box;

    &:hover {
      border-color: var(--lc-task-item-hover-border);
    }

    .task-name {
      margin-right: 170px;
      margin-bottom: 0.75rem;

      .lc-hover-tip__trigger {
        display: block;
        overflow: hidden;
      }

      .task-name__text {
        font-size: 14px;
        line-height: 26px;
        display: block;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;

        /* 仅在名称溢出时渐隐，避免右侧还有空位时文字提前淡出 */
        &.is-truncated {
          text-overflow: clip;
          -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
          mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
        }
      }
    }

    .task-item-actions-wrapper {
      top: 12px;
      right: -4px;
      z-index: 10;
    }
  }
}

.task-type-badge {
  position: absolute;
  left: 8px;
  top: 50%;
  bottom: auto;
  height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 120px;
  font-weight: 700;
  color: #a8b8d8;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
  opacity: 0.18;
  line-height: 1;
  transform: translateY(0.04em);

  &.task-type-badge--magnet {
    font-size: 88px;

    &.is-magnet-en {
      font-size: 96px;
    }
  }

  &.task-type-badge--ed2k {
    font-size: 96px;
  }
}

.theme-dark .task-type-badge {
  color: #5f5b54;
  opacity: 0.16;
}

.theme-light.has-app-background-image .task-item,
.theme-dark.has-app-background-image .task-item {
  background-color: transparent;
  backdrop-filter: blur(var(--app-ui-frosted-blur-task-item, var(--app-ui-frosted-blur, 0px)));
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-item, var(--app-ui-frosted-blur, 0px)));
}

.theme-dark.has-app-background-image .task-item {
  border-color: var(--lc-task-item-hover-border);
}

.task-name {
  color: #505753;
  margin-bottom: 0.75rem;
  margin-right: 170px;
  margin-left: 0;
  min-height: 26px;

  /* mo-hover-tip trigger 默认 inline-flex 会撑开宽度，
     这里改为 block 并限制宽度，确保 text-overflow 生效 */
  .lc-hover-tip__trigger {
    display: block;
    overflow: hidden;
  }

  .task-name__text {
    font-size: 14px;
    line-height: 26px;
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    position: relative;

    /* 仅在名称溢出时渐隐，避免右侧还有空位时文字提前淡出 */
    &.is-truncated {
      text-overflow: clip;
      -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
      mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
    }
  }
}
</style>
