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
        :gid="task.gid ? `${task.gid}` : ''"
        :status="taskStatus"
        :speed="Number(task.downloadSpeed)"
        :pending-selection="isPendingFileSelection"
        :fetching-metadata="isFetchingMetadata && !isLiveTask"
        :is-live="isLiveTask"
        :pair-gids="pairGids"
        :pair-member-count="pairMemberCount"
        :is-pair="isPairTask"
        :merged="isMergedPair"
        :merge-skipped="isMergeSkippedPair"
      />
      <mo-task-progress-info :task="task" :view-mode="viewMode" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, getCurrentInstance } from 'vue'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { basename } from 'node:path'
import { checkTaskIsSeeder, getTaskName, ellipsis, isEd2kTask, isMagnetTask } from '@shared/utils'
import { TASK_STATUS } from '@shared/constants'
import { openItem, getTaskActualPath } from '@/utils/native'
import { getPairGidCandidates, isPairRow } from '@/utils/taskPair'
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

// 正在获取数据：进度条上还没有任何可展示的量。两种情形：
//   1) 磁力任务元数据就绪前（任务名此刻还是临时的）；
//   2) 任何任务"已经开始但一个字节都没到"——HLS 要先取播放列表（大清单不再
//      预探测分片大小，总长是随后估算出来的），普通 HTTP 也要先握手。
// 这两种情形进度恒为 0，交给进度条上的"从左到右"扫光动效表示在动
// （BT 取元数据时就是这个动效，用户点名要一致）。
const isFetchingMetadata = computed(() => {
  const task = props.task || {}
  if (`${task.status || ''}` !== TASK_STATUS.ACTIVE) return false
  if (isMagnetTask(task)) return true
  // 待选择文件有自己的一档（橙色底槽），不叠加扫光
  if (isPendingFileSelection.value) return false
  return Number(task.completedLength || 0) === 0 && Number(task.downloadSpeed || 0) === 0
})

/**
 * 直播任务（引擎 isLive 置位后恒真）：进度条不画百分比，改走「录制专属」
 * 三态视觉 —— 录制中滚动斜纹 / 暂停减速变灰 / 完成绿色铺满（见
 * TaskProgress.vue 的 .is-live）。录制没有"总长"这个分母，装成一根会走到
 * 100% 的下载条是假的。
 */
const isLiveTask = computed(() => {
  const task = props.task || {}
  return task.isLive === true
})

function getCompletedDisplayName (task) {
  // 「一对音视频」在列表里显示的是**合并产物**的名字（画面流名字去掉角色标记，
  // 与合并落盘的名字同一套规则），而不是 `xxx_video.mp4` 这种"零件名"。
  // 只剩一条成员时（合并已完成 / 伙伴被删）不再用它：那时磁盘上就是那一个文件。
  if (isPairRow(task) && Number(task.pairCount) >= 2 && task.pairDisplayName) {
    return `${task.pairDisplayName}`
  }
  const config = preferenceConfig.value || {}
  const suffix = config.downloadingFileSuffix || ''
  const path = getTaskActualPath(task, config)
  const base = basename(path || '')
  if (suffix && base.endsWith(suffix)) {
    return base.slice(0, -suffix.length)
  }
  return base
}

/** 折叠记录身上"已经固定下来的显示名"：任一成员 gid 上写着都算。 */
function getCachedDisplayName (task) {
  const map = taskDisplayNames.value || {}
  for (const gid of getPairGidCandidates(task)) {
    if (map[gid]) {
      return `${map[gid]}`
    }
  }
  return ''
}

/**
 * 这条记录是"一对音视频"折叠出来的，**而且还没合并出产物** —— 显示名用
 * 折叠后的产物名（`pairDisplayName`）。
 *
 * 判据不能用 `pairCount >= 2`：成员下完被摘掉后（历史/引擎侧的正常变化）它会掉到 1，
 * 名字就会退回成零件的名字（`xxx_audio.m4a`）。合并成功后
 * `afterBilibiliMerge` 会把记录的名字改成落盘产物名（`task.name`），
 * 所以这里用 `dashMerged` 收口即可。
 */
const isPendingPair = computed(() => {
  const task = props.task
  const merged = task && (task.dashMerged === true || task.pairMerged === true)
  return !!(isPairRow(task) && !merged && task.pairDisplayName)
})

const pairGids = computed(() => {
  const task = props.task
  if (!isPairRow(task)) {
    return []
  }
  return (task.pairGids || []).map(g => `${g}`)
})

const pairMemberCount = computed(() => {
  const task = props.task
  return isPairRow(task) ? Number(task.pairCount) || 0 : 0
})

// 记录级的"这是一对音视频"标记：**用 isPair/pairId，不看还剩几条流**。
// 折叠记录在成员被摘掉后仍带 isPair/pairId，用它才能让进度条在
// "下载完成 → 待合并 → 合并中" 这几档之间稳定切换。
const isPairTask = computed(() => {
  const task = props.task || {}
  return task.isPair === true || !!task.pairId
})

// 已经合并出产物（`afterBilibiliMerge` 落的 dashMerged）：回到普通满格绿。
// 判据看**整对**（`pairMerged`：任一成员带 dashMerged）—— 产物通常落在
// "后下完、触发合并"的那条成员上，而它未必是记录的主记录；只看主记录的
// `dashMerged` 会在另一半还没被清掉时判成"没合并"，于是又回到"待合并/正在合并"。
const isMergedPair = computed(() => {
  const task = props.task || {}
  return task.dashMerged === true || task.pairMerged === true
})

// 这一对**不会再合并**了（重试耗尽 / 缺另一半 / 合并失败收尾）：进度条与文案
// 都按普通"已完成"收尾，不再显示黄条与"等待合并…"。
const isMergeSkippedPair = computed(() => {
  const task = props.task || {}
  return task.mergeSkipped === true
})

const taskFullName = computed(() => {
  const task = props.task
  const isStopped = !!task && (task.status === TASK_STATUS.COMPLETE || task.status === TASK_STATUS.MERGING)
  const cached = isStopped ? getCachedDisplayName(task) : ''
  if (cached) return cached
  if (isPendingPair.value) return `${task.pairDisplayName}`
  if (isStopped) return getCompletedDisplayName(task)
  return getTaskName(task, {
    defaultName: t('task.get-task-name'),
    hashFallbackLabel: t('task.magnet-pending-name'),
    maxLen: -1
  })
})

const taskName = computed(() => {
  const task = props.task
  const isStopped = !!task && (task.status === TASK_STATUS.COMPLETE || task.status === TASK_STATUS.MERGING)
  const cached = isStopped ? getCachedDisplayName(task) : ''
  if (cached) return ellipsis(cached, 64)
  if (isPendingPair.value) return ellipsis(`${task.pairDisplayName}`, 64)
  if (isStopped) return ellipsis(getCompletedDisplayName(task), 64)
  return getTaskName(task, {
    defaultName: t('task.get-task-name'),
    hashFallbackLabel: t('task.magnet-pending-name')
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
  // 配对记录：任一成员 gid 上已经有固定名就不用再写（合并完成后主流程会写
  // 在"最后下完的那条"的 gid 上）
  if (getCachedDisplayName(task)) return
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
