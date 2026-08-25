<template>
  <el-form
    class="mo-task-general"
    ref="formRef"
    :model="formData"
    :label-width="formLabelWidth"
    v-if="task"
  >
    <el-form-item :label="`${t('task.task-gid')}: `">
      <div class="form-static-value">
        {{ task.gid }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-name')}: `">
      <div class="form-static-value">
        {{ taskFullName }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-dir')}: `">
      <el-input placeholder="" readonly v-model="path">
        <mo-show-in-folder
          #append
          v-if="isRenderer"
          :path="path"
        />
      </el-input>
    </el-form-item>
    <el-form-item :label="`${t('task.task-status')}: `">
      <div class="form-static-value">
        <mo-task-status :theme="currentTheme" :status="taskStatus" />
      </div>
    </el-form-item>
    <el-form-item :label="`${t(isError ? 'task.error-at' : 'task.completed-at')}: `" v-if="isCompleted">
      <div class="form-static-value">
        {{ completionTime }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-priority')}: `">
      <div class="form-static-value">
        {{ taskPriority }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-error-info')}: `" v-if="task.errorCode && task.errorCode !== '0'">
      <div class="form-static-value">
        {{ task.errorCode }} {{ task.errorMessage }}
      </div>
    </el-form-item>

    <el-divider v-if="isBT">
      <el-icon><MagicStick /></el-icon>
      {{ t('task.task-bittorrent-info') }}
    </el-divider>

    <el-form-item :label="`${t('task.task-info-hash')}: `" v-if="isBT">
      <div class="form-static-value">
        {{ task.infoHash }}
        <mo-hover-tip
          effect="dark"
          :content="t('task.copy-link')"
          placement="top"
          :open-delay="500"
        >
          <i class="copy-link" @click="handleCopyClick">
            <mo-icon
              name="link"
              width="12"
              height="12"
            />
          </i>
        </mo-hover-tip>
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-piece-length')}: `" v-if="isBT">
      <div class="form-static-value">
        {{ bytesToSize(task.pieceLength) }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-num-pieces')}: `" v-if="isBT">
      <div class="form-static-value">
        {{ task.numPieces }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-bittorrent-creation-date')}: `" v-if="isBT && task.bittorrent">
      <div class="form-static-value">
        {{ localeDateTimeFormat(task.bittorrent.creationDate, locale) }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-bittorrent-comment')}: `" v-if="isBT && task.bittorrent">
      <div class="form-static-value">
        {{ task.bittorrent.comment }}
      </div>
    </el-form-item>

    <el-divider v-if="isEd2k">
      <el-icon><Connection /></el-icon>
      {{ t('task.task-ed2k-info') }}
    </el-divider>

    <el-form-item :label="`${t('task.task-ed2k-file-hash')}: `" v-if="isEd2k">
      <div class="form-static-value">
        {{ ed2kFileHash }}
        <mo-hover-tip
          effect="dark"
          :content="t('task.copy-link')"
          placement="top"
          :open-delay="500"
        >
          <i class="copy-link" @click="handleCopyClick">
            <mo-icon
              name="link"
              width="12"
              height="12"
            />
          </i>
        </mo-hover-tip>
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-piece-length')}: `" v-if="isEd2k">
      <div class="form-static-value">
        {{ bytesToSize(task.pieceLength) }}
      </div>
    </el-form-item>
    <el-form-item :label="`${t('task.task-num-pieces')}: `" v-if="isEd2k">
      <div class="form-static-value">
        {{ task.numPieces }}
      </div>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { computed, getCurrentInstance } from 'vue'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import is from 'electron-is'
import { ipcRenderer } from 'electron'
import { basename } from 'node:path'
import {
  bytesToSize,
  calcFormLabelWidth,
  checkTaskIsBT,
  checkTaskIsSeeder,
  getTaskName,
  getTaskUri,
  isEd2kTask,
  getEd2kFileHash,
  localeDateTimeFormat
} from '@shared/utils'
import { APP_THEME, TASK_STATUS } from '@shared/constants'
import { getTaskActualPath } from '@/utils/native'
// mo-show-in-folder, mo-task-status are globally registered in main.js
import { useAppStore, usePreferenceStore, useTaskStore } from '@/store'
import { storeToRefs } from 'pinia'
import '@/components/Icons/folder'
import '@/components/Icons/link'
import { MagicStick, Connection } from '@element-plus/icons-vue'

const props = defineProps({
  task: {
    type: Object
  }
})

defineOptions({
  name: 'mo-task-general'
})

const { t } = i18n.global
const instance = getCurrentInstance()

const appStore = useAppStore()
const preferenceStore = usePreferenceStore()
const taskStore = useTaskStore()
const { systemTheme } = storeToRefs(appStore)
const { config: preferenceConfig } = storeToRefs(preferenceStore)

const locale = preferenceStore.config?.locale || 'en-US'
const formRef = ref(null)
const formData = {}
const formLabelWidth = calcFormLabelWidth(locale)

const isRenderer = is.renderer()

const currentTheme = computed(() => {
  const theme = preferenceConfig.value?.theme
  if (theme === APP_THEME.AUTO) return systemTheme.value
  return theme
})

const isBT = computed(() => checkTaskIsBT(props.task))
const isEd2k = computed(() => isEd2kTask(props.task))
const ed2kFileHash = computed(() => getEd2kFileHash(props.task))
const isSeeder = computed(() => checkTaskIsSeeder(props.task))

const taskStatus = computed(() => {
  if (isSeeder.value) return TASK_STATUS.SEEDING
  return props.task.status
})

const path = computed(() => getTaskActualPath(props.task, preferenceConfig.value))

const taskFullName = computed(() => {
  const task = props.task || {}
  const config = preferenceConfig.value || {}
  const suffix = config.downloadingFileSuffix || ''
  if (task.status === TASK_STATUS.COMPLETE && !isBT.value) {
    const p = getTaskActualPath(task, config)
    const base = basename(p || '')
    if (suffix && base.endsWith(suffix)) {
      return base.slice(0, -suffix.length)
    }
    return base
  }
  return getTaskName(task, {
    defaultName: t('task.get-task-name'),
    maxLen: -1
  })
})

const taskPriority = computed(() => {
  const gid = props.task?.gid
  const map = taskStore.taskPriorities || {}
  return (gid && map[gid]) ? Number(map[gid]) : 0
})

const isCompleted = computed(() => {
  const completedStatuses = ['complete', 'error', 'removed']
  if (props.task.status === 'complete' && checkTaskIsSeeder(props.task)) {
    return false
  }
  return completedStatuses.includes(props.task.status)
})

const isError = computed(() => props.task.status === TASK_STATUS.ERROR)

const completionTime = computed(() => {
  let timestamp = props.task.savedAt || Date.now()
  if (timestamp < 1000000000000) {
    timestamp *= 1000
  }
  return new Date(timestamp).toLocaleString()
})

function handleCopyClick () {
  const uri = getTaskUri(props.task)
  try {
    ipcRenderer.invoke('clipboard:write-text', uri)
    instance.proxy.$msg.success(t('task.copy-link-success'))
  } catch (e) {
    instance.proxy.$msg.error(t('preferences.save-fail-message'))
  }
}
</script>

<style lang="scss">
.copy-link {
  cursor: pointer;
}
</style>
