<template>
  <div class="task-item-actions-wrapper" v-on:dblclick.stop="() => null">
    <transition name="verify-slide">
      <ul
        v-if="showVerifyBar"
        :key="`${task.gid}-verify`"
        :class="['task-item-actions', 'task-item-actions--verify', { 'task-item-actions--verify-open': verifyPanelVisible }]"
      >
        <li
          class="task-item-action is-verify task-item-action--verify-trigger"
          @mouseenter="verifyBarMode === 'verify' && onVerifyTriggerEnter()"
          @mouseleave="verifyBarMode === 'verify' && onVerifyTriggerLeave()"
        >
          <span
            v-if="verifyBarMode === 'verify'"
            class="task-verify-dropdown-ref"
            ref="verifyTrigger"
            @click.stop="onVerifyDefaultClick()"
          >
            <span
              v-if="securityScanStatusText"
              class="task-security-scan-label"
            >
              {{ securityScanStatusText }}
            </span>
            <mo-icon name="verify-file" width="14" height="14" />
          </span>
          <mo-hover-tip
            v-else
            effect="dark"
            :content="t('task.update-link')"
            placement="top"
            :open-delay="500"
          >
            <span
              class="task-verify-dropdown-ref"
              ref="verifyTrigger"
              @click.stop="onUpdateLinkClick()"
            >
              <mo-icon name="link" width="14" height="14" />
            </span>
          </mo-hover-tip>
          <transition name="verify-panel">
            <div
              v-if="verifyBarMode === 'verify' && verifyPanelVisible"
              :class="['task-verify-panel', { 'task-verify-panel--top': verifyPlacementTop }]"
              @mouseenter="onVerifyPanelEnter"
              @mouseleave="onVerifyPanelLeave"
            >
              <ul class="task-verify-panel__list">
                <li
                  v-for="item in verifyMenuItems"
                  :key="item.value"
                  class="task-verify-panel__item"
                  @click.stop="onVerifyCommand(item.value)"
                >
                  {{ item.label }}
                </li>
              </ul>
            </div>
          </transition>
        </li>
      </ul>
    </transition>
    <transition name="verify-slide">
      <ul
        v-if="showSelectFilesBar"
        :key="`${task.gid}-select-files`"
        class="task-item-actions task-item-actions--verify"
      >
        <li class="task-item-action is-verify task-item-action--verify-trigger">
          <mo-hover-tip
            effect="dark"
            :content="t('task.select-files')"
            placement="top"
            :open-delay="500"
          >
            <span
              class="task-verify-dropdown-ref"
              @click.stop="onSelectFilesClick"
            >
              <mo-icon name="select-files" width="14" height="14" />
            </span>
          </mo-hover-tip>
        </li>
      </ul>
    </transition>
    <ul
      :key="task.gid"
      :class="['task-item-actions', { 'task-item-actions--verify-open': verifyPanelVisible }]"
    >
      <li
        v-for="action in primaryActions"
        :key="action"
        :class="['task-item-action', { 'task-item-action--verify-trigger': action === 'VERIFY' }]"
        @mouseenter="action === 'VERIFY' && onVerifyTriggerEnter()"
        @mouseleave="action === 'VERIFY' && onVerifyTriggerLeave()"
      >
        <mo-hover-tip
          effect="dark"
          :content="getActionLabel(action)"
          placement="top"
          :open-delay="500"
        >
          <i v-if="action ==='PAUSE'" @click.stop="onPauseClick">
            <mo-icon name="task-pause-line" width="14" height="14" />
          </i>
          <i v-else-if="action ==='STOP'" @click.stop="onStopClick">
            <mo-icon name="task-stop-line" width="14" height="14" />
          </i>
          <i v-else-if="action === 'RESUME'" @click.stop="onResumeClick">
            <mo-icon name="task-start-line" width="14" height="14" />
          </i>
          <i v-else-if="action === 'RESTART'" @click.stop="onRestartClick">
            <mo-icon name="task-restart" width="14" height="14" />
          </i>
          <i v-else-if="action === 'DELETE'" @click.stop="onDeleteClick">
            <mo-icon name="delete" width="14" height="14" />
          </i>
          <i v-else-if="action === 'TRASH'" @click.stop="onTrashClick">
            <mo-icon name="trash" width="14" height="14" />
          </i>
          <i v-else-if="action ==='FOLDER'" @click.stop="onFolderClick">
            <mo-icon name="folder" width="14" height="14" />
          </i>
          <i v-else-if="action ==='LINK'" @click.stop="onLinkClick">
            <mo-icon name="link" width="14" height="14" />
          </i>
          <i v-else-if="action ==='INFO'" @click.stop="onInfoClick">
            <mo-icon name="info-circle" width="14" height="14" />
          </i>
          <span
            v-else-if="action ==='VERIFY'"
            class="task-verify-dropdown-ref"
            ref="verifyTrigger"
            @click.stop="onVerifyDefaultClick"
          >
            <span
              v-if="securityScanStatusText"
              class="task-security-scan-label"
            >
              {{ securityScanStatusText }}
            </span>
            <mo-icon name="verify-file" width="14" height="14" />
          </span>
        </mo-hover-tip>
        <transition name="verify-panel">
          <div
            v-if="action === 'VERIFY' && verifyPanelVisible"
            :class="['task-verify-panel', { 'task-verify-panel--top': verifyPlacementTop }]"
            @mouseenter="onVerifyPanelEnter"
            @mouseleave="onVerifyPanelLeave"
          >
            <ul class="task-verify-panel__list">
              <li
                v-for="item in verifyMenuItems"
                :key="item.value"
                class="task-verify-panel__item"
                @click.stop="onVerifyCommand(item.value)"
              >
                {{ item.label }}
              </li>
            </ul>
          </div>
        </transition>
      </li>
    </ul>

    <el-dialog
      :title="t('task.update-link')"
      v-model="updateLinkDialogVisible"
      width="620px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      class="update-link-dialog"
      append-to-body
      @open="onUpdateLinkDialogOpen"
    >
      <el-form label-position="left">
        <el-form-item :label="`${t('task.uri-task')}: `" :label-width="formLabelWidth">
          <el-input
            v-model="updateLinkValue"
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 4 }"
            :placeholder="t('task.update-link-placeholder')"
          />
        </el-form-item>

        <div class="task-advanced-options" v-if="showUpdateAdvanced">
          <el-row :gutter="8" style="margin-bottom: 8px; align-items:center;">
            <el-col :span="16" :xs="14">
              <el-form-item :label="`${t('task.advanced-presets')}: `" :label-width="formLabelWidth">
                <mo-extend-select
                  v-model="selectedAdvancedPresetId"
                  placeholder=""
                  :options="[{ label: t('task.empty-preset'), value: '' }, ...advancedPresets.map(p => ({ label: p.name, value: p.id }))]"
                  @change="onAdvancedPresetChange"
                />
              </el-form-item>
            </el-col>
            <el-col :span="8" :xs="10" style="text-align:right;">
              <div class="preset-actions">
                <el-button type="primary" size="small" @click="saveOrUpdateAdvancedPreset">{{ selectedAdvancedPresetId ? t('task.update-advanced-preset') : t('task.save-advanced-preset') }}</el-button>
                <el-button type="danger" size="small" :disabled="!selectedAdvancedPresetId" @click="deleteAdvancedPreset">{{ t('task.delete-advanced-preset') }}</el-button>
              </div>
            </el-col>
          </el-row>

          <el-form-item :label="`${t('task.task-user-agent')}: `" :label-width="formLabelWidth">
            <el-input
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 2, maxRows: 3 }"
              :placeholder="t('task.task-user-agent')"
              v-model="updateHeadersUA"
            />
          </el-form-item>

          <el-form-item :label="`${t('task.task-authorization')}: `" :label-width="formLabelWidth">
            <el-input
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 2, maxRows: 3 }"
              :placeholder="t('task.task-authorization')"
              v-model="updateHeadersAuthorization"
            />
          </el-form-item>

          <el-form-item :label="`${t('task.task-referer')}: `" :label-width="formLabelWidth">
            <el-input
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 2, maxRows: 3 }"
              :placeholder="t('task.task-referer')"
              v-model="updateHeadersReferer"
            />
          </el-form-item>

          <el-form-item :label="`${t('task.task-cookie')}: `" :label-width="formLabelWidth">
            <el-input
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 2, maxRows: 3 }"
              :placeholder="t('task.task-cookie')"
              v-model="updateHeadersCookie"
            />
          </el-form-item>

          <el-row :gutter="12">
            <el-col :span="16" :xs="24">
              <el-form-item
                :label="`${t('task.task-proxy')}: `"
                :label-width="formLabelWidth"
              >
                <el-input
                  placeholder="[http://][USER:PASSWORD@]HOST[:PORT]"
                  v-model="updateAllProxy">
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :span="8" :xs="24">
              <div class="help-link">
                <a target="_blank" href="https://github.com/agalwood/Motrix/wiki/Proxy" rel="noopener noreferrer">
                  {{ t('preferences.proxy-tips') }}
                  <mo-icon name="link" width="12" height="12" />
                </a>
              </div>
            </el-col>
          </el-row>
        </div>
      </el-form>
      <div class="update-link-warning-tip">
        {{ updateLinkWarningTip }}
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-checkbox class="chk" v-model="showUpdateAdvanced">
            {{t('task.show-advanced-options')}}
          </el-checkbox>
          <div class="dialog-footer-actions">
            <el-button @click="updateLinkDialogVisible = false">{{ t('app.cancel') }}</el-button>
            <el-button type="primary" class="dialog-submit-btn" :loading="updateLinkSubmitting" @click="onUpdateLinkConfirm">{{ t('app.submit') }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      class="save-advanced-preset-dialog"
      width="400px"
      v-model="savePresetDialogVisible"
      :append-to-body="true"
    >
      <div>
        <el-form label-position="left">
          <el-form-item :label="`${t('task.preset-name')}: `" :label-width="formLabelWidth">
            <el-input v-model="savePresetName" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="savePresetDialogVisible=false">{{ t('app.cancel') }}</el-button>
          <el-button type="primary" @click="saveAdvancedPreset">{{ t('app.save') }}</el-button>
        </div>
      </template>
    </el-dialog>
    <el-dialog
      v-model="selectFilesDialogVisible"
      :title="t('task.select-files')"
      width="600px"
      append-to-body
      :close-on-click-modal="false"
      class="select-files-dialog"
    >
      <mo-task-files
        ref="selectFilesTable"
        mode="ADD"
        :files="selectFilesData"
        :height="360"
        @confirm-selection="onConfirmFileSelection"
      />
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="selectFilesDialogVisible = false">{{ t('app.cancel') }}</el-button>
          <el-button type="primary" @click="onConfirmFileSelection">{{ t('app.save') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, getCurrentInstance, onBeforeUnmount, nextTick } from 'vue'
import is from 'electron-is'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isAbsolute, resolve, basename } from 'node:path'
import { clipboard } from 'electron'

import { commands } from '@/components/CommandManager/instance'
import api from '@/api'
import {
  TASK_STATUS,
  NONE_SELECTED_FILES,
  SELECTED_ALL_FILES,
  EMPTY_STRING
} from '@shared/constants'
import {
  checkTaskIsSeeder,
  getTaskName,
  getFileName,
  getFileExtension
} from '@shared/utils'
import { getTaskActualPath, getPathCandidates } from '@/utils/native'
import { getTaskInfoHash } from '@/utils/task'
import '@/components/Icons/task-start-line'
import '@/components/Icons/task-pause-line'
import '@/components/Icons/task-stop-line'
import '@/components/Icons/task-restart'
import '@/components/Icons/delete'
import '@/components/Icons/folder'
import '@/components/Icons/link'
import '@/components/Icons/info-circle'
import '@/components/Icons/verify-file'
import '@/components/Icons/trash'
import '@/components/Icons/select-files'
import TaskFiles from '@/components/TaskDetail/TaskFiles'
import { useTaskStore } from '@/store/task'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例

const { t } = i18n.global
const instance = getCurrentInstance()

const taskStore = useTaskStore()
const preferenceStore = usePreferenceStore()
const { taskSecurityScanStatuses, taskLinkUpdateHints, pendingFileSelection } = storeToRefs(taskStore)
const { config: preferenceConfig } = storeToRefs(preferenceStore)

const taskActionsMap = {
  [TASK_STATUS.ACTIVE]: ['PAUSE', 'DELETE'],
  [TASK_STATUS.PAUSED]: ['RESUME', 'DELETE'],
  [TASK_STATUS.WAITING]: ['RESUME', 'DELETE'],
  [TASK_STATUS.ERROR]: ['RESTART', 'TRASH'],
  [TASK_STATUS.COMPLETE]: ['VERIFY', 'RESTART', 'TRASH'],
  [TASK_STATUS.REMOVED]: ['RESTART', 'TRASH'],
  [TASK_STATUS.SEEDING]: ['VERIFY', 'STOP', 'DELETE']
}

const props = defineProps({
  mode: {
    type: String,
    default: 'LIST',
    validator: function (value) {
      return ['LIST', 'DETAIL'].includes(value)
    }
  },
  task: {
    type: Object,
    required: true
  }
})

defineOptions({ name: 'mo-task-item-actions' })

const formLabelWidth = '110px'
const verifyTrigger = ref(null)
const selectFilesTable = ref(null)
const verifyTriggerHover = ref(false)
const verifyPanelHover = ref(false)
const verifyPanelVisibleInternal = ref(false)
let verifyHideTimer = null
const verifyPlacementTop = ref(false)
const updateLinkDialogVisible = ref(false)
const updateLinkValue = ref('')
const showUpdateAdvanced = ref(false)
const advancedPresets = ref([])
const selectedAdvancedPresetId = ref('')
const savePresetDialogVisible = ref(false)
const savePresetName = ref('')
const updateHeadersUA = ref('')
const updateHeadersReferer = ref('')
const updateHeadersCookie = ref('')
const updateHeadersAuthorization = ref('')
const updateAllProxy = ref('')
const updateLinkSubmitting = ref(false)
const selectFilesDialogVisible = ref(false)
const selectFilesData = ref([])

const noConfirmBeforeDelete = computed(() => preferenceConfig.value.noConfirmBeforeDeleteTask)

const needUpdateLink = computed(() => {
  const { task } = props
  const gid = task && task.gid ? `${task.gid}` : ''
  return !!(gid && taskLinkUpdateHints.value && taskLinkUpdateHints.value[gid])
})

const verifyBarMode = computed(() => needUpdateLink.value ? 'update-link' : 'verify')
const verifyPanelVisible = computed(() => verifyPanelVisibleInternal.value)

const updateLinkWarningTip = computed(() => {
  const key = 'task.update-link-warning-tip'
  const v = t(key)
  if (v && v !== key) return v
  return '更新链接后，若新链接指向不同文件，可能导致下载文件损坏。建议仅在确认是相同文件时使用'
})

const verifyMenuItems = computed(() => [
  { value: 'sha256', label: 'SHA-256' },
  { value: 'sha1', label: 'SHA-1' },
  { value: 'md5', label: 'MD5' },
  { value: 'sha512', label: 'SHA-512' },
  { value: 'size', label: t('task.verify-by-size') }
])

const taskName = computed(() => {
  const task = props.task || {}
  const cfg = preferenceConfig.value || {}
  const suffix = cfg.downloadingFileSuffix || ''
  const { COMPLETE, ERROR, REMOVED } = TASK_STATUS
  const isStopped = [COMPLETE, ERROR, REMOVED].includes(task.status)
  if (isStopped) {
    try {
      const p = getTaskActualPath(task, cfg)
      const base = basename(p || '')
      if (base) {
        if (suffix && base.endsWith(suffix)) return base.slice(0, -suffix.length)
        return base
      }
    } catch (_) {}
  }
  return getTaskName(task)
})

const path = computed(() => getTaskActualPath(props.task, preferenceConfig.value))

const isSeeder = computed(() => checkTaskIsSeeder(props.task))

const taskStatus = computed(() => {
  const { task } = props
  if (isSeeder.value && task.status === TASK_STATUS.ACTIVE) return TASK_STATUS.SEEDING
  return task.status
})

const taskCommonActions = computed(() => {
  const result = is.renderer() ? ['FOLDER'] : []
  switch (props.mode) {
  case 'LIST':
    result.push('LINK', 'INFO')
    break
  case 'DETAIL':
    result.push('LINK')
    break
  }
  return result
})

function resolveTaskFilePath (filePath) {
  const { task } = props
  const dir = task && task.dir ? `${task.dir}` : ''
  const raw = filePath ? `${filePath}` : ''
  if (!raw) return ''
  if (isAbsolute(raw)) return resolve(raw)
  if (!dir) return resolve(raw)
  return resolve(dir, raw)
}

function getActualFilePath (filePath) {
  const target = resolveTaskFilePath(filePath)
  if (!target) return target
  const config = preferenceConfig.value || {}
  const suffix = config.downloadingFileSuffix
  const candidates = getPathCandidates(target, suffix, config)
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return target
}

const hasExistingTaskFile = computed(() => {
  const { task } = props
  const files = Array.isArray(task && task.files) ? task.files : []
  if (!files.length) return false
  return files.some(file => {
    const filePath = getActualFilePath(file && file.path ? file.path : '')
    return !!(filePath && existsSync(filePath))
  })
})

const taskActions = computed(() => {
  const actions = taskActionsMap[taskStatus.value] || []
  const result = [...actions, ...taskCommonActions.value]
    .filter(action => (is.renderer() ? true : action !== 'VERIFY'))
    .filter(action => (action === 'VERIFY' ? hasExistingTaskFile.value : true))
    .reverse()
  return result
})

const showVerifyBar = computed(() => {
  if (needUpdateLink.value) return true
  const canVerify = taskActions.value.includes('VERIFY')
  if (!canVerify) return false
  return !!(path.value && existsSync(path.value))
})

const showSelectFilesBar = computed(() => {
  const { task } = props
  const gid = task && task.gid ? `${task.gid}` : ''
  if (!gid) return false
  return !!(pendingFileSelection.value && pendingFileSelection.value[gid])
})

const verifyCanSlideOut = computed(() => !!(path.value && existsSync(path.value)))

const primaryActions = computed(() => {
  return taskActions.value.filter(action => action !== 'VERIFY' || !showVerifyBar.value)
})

const securityScanStatus = computed(() => {
  if (!taskSecurityScanStatuses.value || !props.task || !props.task.gid) return null
  return taskSecurityScanStatuses.value[props.task.gid] || null
})

const securityScanStatusText = computed(() => {
  const scanStatus = securityScanStatus.value
  const status = scanStatus && scanStatus.status
  switch (status) {
  case 'running':
    return t('task.security-scan-running')
  case 'success':
    return t('task.security-scan-success')
  case 'failed':
    if (scanStatus && scanStatus.reason === 'quarantine-flag') return t('task.security-scan-quarantine')
    if (scanStatus && scanStatus.reason === 'virus-detected') return t('task.security-scan-virus')
    return t('task.security-scan-failed')
  case 'skipped':
    return t('task.security-scan-skipped')
  default:
    return ''
  }
})

function getActionLabel (action) {
  const labelMap = {
    VERIFY: t('task.verify-file'),
    PAUSE: t('task.pause'),
    STOP: t('task.stop'),
    RESUME: t('task.resume'),
    RESTART: t('task.restart'),
    DELETE: t('task.delete'),
    TRASH: t('task.trash'),
    FOLDER: t('task.reveal-in-folder'),
    LINK: t('task.copy-link'),
    INFO: t('task.info')
  }
  return labelMap[action] || action
}

function calculateHash (filePath, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => { hash.update(chunk) })
    stream.on('end', () => { resolve(hash.digest('hex')) })
  })
}

function clearVerifyHideTimer () {
  if (verifyHideTimer) {
    clearTimeout(verifyHideTimer)
    verifyHideTimer = null
  }
}

function ensureVerifyPanelVisible () {
  verifyPanelVisibleInternal.value = true
  nextTick(() => { updateVerifyPlacement() })
}

function updateVerifyPlacement () {
  const triggerEl = verifyTrigger.value
  if (!triggerEl || typeof window === 'undefined') {
    verifyPlacementTop.value = false
    return
  }
  const rect = triggerEl.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  const estimatedPanelHeight = 120
  const spaceBelow = viewportHeight - rect.bottom
  const spaceAbove = rect.top
  verifyPlacementTop.value = spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow
}

function scheduleVerifyPanelHide () {
  clearVerifyHideTimer()
  if (verifyTriggerHover.value || verifyPanelHover.value) return
  verifyHideTimer = setTimeout(() => {
    if (verifyTriggerHover.value || verifyPanelHover.value) return
    verifyPanelVisibleInternal.value = false
  }, 120)
}

function onVerifyTriggerEnter () {
  clearVerifyHideTimer()
  verifyTriggerHover.value = true
  ensureVerifyPanelVisible()
}

function onVerifyTriggerLeave () {
  verifyTriggerHover.value = false
  scheduleVerifyPanelHide()
}

function onVerifyPanelEnter () {
  clearVerifyHideTimer()
  verifyPanelHover.value = true
  ensureVerifyPanelVisible()
}

function onVerifyPanelLeave () {
  verifyPanelHover.value = false
  scheduleVerifyPanelHide()
}

function onVerifyDefaultClick () {
  onVerify('sha256')
}

function onVerifyCommand (command) {
  onVerify(command)
}

async function onVerify (verifyType) {
  const { task } = props
  if (![TASK_STATUS.COMPLETE, TASK_STATUS.SEEDING].includes(taskStatus.value)) return

  const files = Array.isArray(task.files) ? task.files : []
  if (!files.length) {
    instance.proxy.$msg.error(t('task.verify-no-files'))
    return
  }

  instance.proxy.$msg.info(t('task.verify-start'))

  const missing = []
  const mismatched = []
  const resolvedFiles = []

  for (const file of files) {
    const filePath = getActualFilePath(file && file.path ? file.path : '')
    if (!filePath || !existsSync(filePath)) {
      missing.push(filePath || '')
      continue
    }
    resolvedFiles.push({ file, filePath })

    const expected = Number(file && file.length ? file.length : 0)
    if (expected > 0) {
      try {
        const st = statSync(filePath)
        if (st && st.isFile && st.isFile() && Number.isFinite(st.size) && st.size !== expected) {
          mismatched.push(filePath)
        }
      } catch (_) {
        mismatched.push(filePath)
      }
    }
  }

  if (missing.length) {
    instance.proxy.$msg.error(t('task.verify-missing-files', { count: missing.length }))
    return
  }

  if (mismatched.length) {
    instance.proxy.$msg.error(t('task.verify-size-mismatch', { count: mismatched.length }))
    return
  }

  if (verifyType === 'size') {
    instance.proxy.$msg.success(t('task.verify-success-multi', { count: files.length }))
    return
  }

  const algorithm = typeof verifyType === 'string' && verifyType ? verifyType : 'sha256'
  const algorithmLabel = `${algorithm}`.toUpperCase()

  if (resolvedFiles.length === 1) {
    const singlePath = resolvedFiles[0].filePath
    try {
      const digest = await calculateHash(singlePath, algorithm)
      try { clipboard.writeText(digest) } catch (_) {}
      instance.proxy.$msg.success(t('task.verify-success-hash', { algorithm: algorithmLabel, hash: digest }))
    } catch (_) {
      instance.proxy.$msg.error(t('task.verify-hash-fail', { algorithm: algorithmLabel }))
    }
    return
  }

  const lines = []
  try {
    for (const it of resolvedFiles) {
      const digest = await calculateHash(it.filePath, algorithm)
      const label = (it.file && it.file.path ? `${it.file.path}` : basename(it.filePath)).replace(/\\/g, '/')
      lines.push(`${digest}  ${label}`)
    }
  } catch (_) {
    instance.proxy.$msg.error(t('task.verify-hash-fail', { algorithm: algorithmLabel }))
    return
  }

  try { clipboard.writeText(lines.join('\n')) } catch (_) {}
  instance.proxy.$msg.success(t('task.verify-success-hash-list', { algorithm: algorithmLabel, count: resolvedFiles.length }))
}

function onResumeClick () {
  const { task } = props
  const gid = task && task.gid ? `${task.gid}` : ''
  if (gid && pendingFileSelection.value && pendingFileSelection.value[gid]) {
    taskStore.clearPendingFileSelection(gid)
    taskStore.confirmFileSelection({ gid, infoHash: getTaskInfoHash(task) })
  }
  commands.emit('resume-task', { task, taskName: taskName.value })
}

function onSelectFilesClick () {
  selectFilesDialogVisible.value = true
  const rawFiles = Array.isArray(props.task.files) ? props.task.files : []
  selectFilesData.value = rawFiles.map((item, index) => {
    const rawName = getFileName(item.path || '')
    const extension = getFileExtension(rawName)
    return {
      idx: Number(item.index) || (index + 1),
      selected: item.selected === 'true' || item.selected === true,
      path: item.path || '',
      name: item.name || rawName,
      extension: extension ? `.${extension}` : '',
      length: parseInt(item.length, 10) || 0,
      completedLength: item.completedLength || '0'
    }
  })
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const table = selectFilesTable.value
      if (!table) return
      const files = selectFilesData.value
      const selected = files.filter(f => f.selected)
      if (selected.length > 0) {
        table.toggleSelection(selected)
      } else {
        table.toggleSelection(files)
      }
    })
  })
}

function onConfirmFileSelection () {
  const table = selectFilesTable.value
  if (!table) return
  const fileIndex = table.selectedFileIndex
  if (fileIndex === NONE_SELECTED_FILES) {
    instance.proxy.$msg.warning(t('task.select-at-least-one'))
    return
  }
  const gid = props.task && props.task.gid ? `${props.task.gid}` : ''
  if (!gid) return
  const options = {
    selectFile: fileIndex !== SELECTED_ALL_FILES ? fileIndex : EMPTY_STRING
  }
  taskStore.changeTaskOption({ gid, options }).then(() => {
    selectFilesDialogVisible.value = false
    taskStore.clearPendingFileSelection(gid)
    const infoHash = getTaskInfoHash(props.task)
    taskStore.confirmFileSelection({ gid, infoHash })
    return api.resumeTask({ gid })
  }).catch(() => {
    taskStore.setPendingFileSelection(gid, getTaskInfoHash(props.task))
    instance.proxy.$msg.error(t('task.select-files-fail'))
  })
}

function onRestartClick (event) {
  const { task } = props
  const { status } = task
  const showDialog = status === TASK_STATUS.COMPLETE || !!event.altKey
  commands.emit('restart-task', { task, taskName: taskName.value, showDialog })
}

function onPauseClick () {
  commands.emit('pause-task', { task: props.task, taskName: taskName.value })
}

function onStopClick () {
  if (!isSeeder.value) return
  commands.emit('stop-task-seeding', { task: props.task })
}

function onDeleteClick (event) {
  const deleteWithFiles = !!event.shiftKey
  commands.emit('delete-task', { task: props.task, taskName: taskName.value, deleteWithFiles })
}

function onTrashClick (event) {
  const deleteWithFiles = !!event.shiftKey
  commands.emit('delete-task-record', { task: props.task, taskName: taskName.value, deleteWithFiles })
}

function onFolderClick () {
  commands.emit('reveal-in-folder', { path: path.value })
}

function onLinkClick () {
  commands.emit('copy-task-link', { task: props.task })
}

function onInfoClick () {
  commands.emit('show-task-info', { task: props.task })
}

function onUpdateLinkClick () {
  updateLinkDialogVisible.value = true
}

async function onUpdateLinkDialogOpen () {
  try {
    const cfg = preferenceConfig.value || {}
    const { advancedOptionPresets = [] } = cfg || {}
    advancedPresets.value = Array.isArray(advancedOptionPresets) ? advancedOptionPresets : []
  } catch (_) {
    advancedPresets.value = []
  }
  selectedAdvancedPresetId.value = ''
  showUpdateAdvanced.value = false

  const { task } = props
  const files = Array.isArray(task && task.files) ? task.files : []
  const first = files.length > 0 ? files[0] : null
  const uris = Array.isArray(first && first.uris)
    ? first.uris.map(u => u && u.uri ? `${u.uri}` : '').filter(Boolean)
    : []
  updateLinkValue.value = uris.length > 0 ? uris[0] : ''

  const gid = task && task.gid ? `${task.gid}` : ''
  if (!gid) {
    updateHeadersUA.value = ''
    updateHeadersReferer.value = ''
    updateHeadersCookie.value = ''
    updateHeadersAuthorization.value = ''
    updateAllProxy.value = ''
    return
  }
  try {
    const opt = await api.getOption({ gid })
    const hs = opt && opt.header ? opt.header : []
    const headerItems = Array.isArray(hs) ? hs : (typeof hs === 'string' ? [hs] : [])
    const headers = []
    headerItems.filter(Boolean).forEach(h => {
      `${h}`.split(/\r?\n/).forEach(line => {
        const s = `${line || ''}`.trim()
        if (s) headers.push(s)
      })
    })
    const map = {}
    headers.forEach(h => {
      const s = `${h}`
      const i = s.indexOf(':')
      if (i > 0) {
        const k = s.slice(0, i).trim().toLowerCase()
        const v = s.slice(i + 1).trim()
        map[k] = v
      }
    })
    updateHeadersUA.value = map['user-agent'] || ''
    updateHeadersReferer.value = map.referer || ''
    updateHeadersCookie.value = map.cookie || ''
    updateHeadersAuthorization.value = map.authorization || ''
    updateAllProxy.value = (opt && (opt.allProxy || opt['all-proxy'])) ? `${opt.allProxy || opt['all-proxy']}` : ''
  } catch (e) {
    updateHeadersUA.value = ''
    updateHeadersReferer.value = ''
    updateHeadersCookie.value = ''
    updateHeadersAuthorization.value = ''
    updateAllProxy.value = ''
  }
}

async function onUpdateLinkConfirm () {
  const { task } = props
  const newUri = `${updateLinkValue.value || ''}`.trim()
  if (!newUri) {
    instance.proxy.$msg.error(t('task.update-link-empty'))
    return
  }
  if (updateLinkSubmitting.value) return
  updateLinkSubmitting.value = true
  try {
    await taskStore.updateTaskLink({
      task,
      newUri,
      headersUA: updateHeadersUA.value,
      headersReferer: updateHeadersReferer.value,
      headersCookie: updateHeadersCookie.value,
      headersAuthorization: updateHeadersAuthorization.value,
      allProxy: updateAllProxy.value
    })
    instance.proxy.$msg.success(t('task.update-link-success'))
    updateLinkDialogVisible.value = false
    updateLinkValue.value = ''
    updateHeadersUA.value = ''
    updateHeadersReferer.value = ''
    updateHeadersCookie.value = ''
    updateHeadersAuthorization.value = ''
    updateAllProxy.value = ''
  } catch (e) {
    const code = e && e.message ? `${e.message}` : `${e}`
    if (/^HTTP_\d+$/.test(code)) {
      const httpCode = Number(code.replace('HTTP_', '')) || 0
      instance.proxy.$msg.error(t('task.update-link-http-fail', { code: httpCode || code }))
      return
    }
    const map = {
      INVALID_PAYLOAD: t('task.update-link-fail'),
      NO_ORIGINAL_URI: t('task.update-link-no-original'),
      LINK_MISMATCH: t('task.update-link-mismatch'),
      CONTENT_LENGTH_MISMATCH: t('task.update-link-mismatch'),
      UNABLE_TO_VERIFY: t('task.update-link-unverifiable')
    }
    instance.proxy.$msg.error(map[code] || (code ? `${t('task.update-link-fail')}（${code}）` : t('task.update-link-fail')))
  } finally {
    updateLinkSubmitting.value = false
  }
}

function openSavePresetDialog () {
  const data = {
    userAgent: updateHeadersUA.value || '',
    authorization: updateHeadersAuthorization.value || '',
    referer: updateHeadersReferer.value || '',
    cookie: updateHeadersCookie.value || '',
    allProxy: updateAllProxy.value || ''
  }
  const allEmpty = [data.userAgent, data.authorization, data.referer, data.cookie, data.allProxy].every(v => !v || !String(v).trim())
  if (allEmpty) {
    instance.proxy.$msg.warning(t('task.empty-advanced-options-tips'))
    return
  }
  savePresetName.value = ''
  savePresetDialogVisible.value = true
}

function saveAdvancedPreset () {
  const name = (savePresetName.value || '').trim() || `Preset ${new Date().toLocaleString()}`
  const data = {
    userAgent: updateHeadersUA.value || '',
    authorization: updateHeadersAuthorization.value || '',
    referer: updateHeadersReferer.value || '',
    cookie: updateHeadersCookie.value || '',
    allProxy: updateAllProxy.value || '',
    newTaskShowDownloading: false
  }
  const preset = { id: Date.now().toString(), name, data }
  const next = [...(advancedPresets.value || []), preset]
  advancedPresets.value = next
  preferenceStore.save({ advancedOptionPresets: next })
  instance.proxy.$msg.success(t('task.save-preset-success'))
  savePresetDialogVisible.value = false
  selectedAdvancedPresetId.value = preset.id
}

function onAdvancedPresetChange (id) {
  if (!id) {
    updateHeadersUA.value = ''
    updateHeadersAuthorization.value = ''
    updateHeadersReferer.value = ''
    updateHeadersCookie.value = ''
    updateAllProxy.value = ''
    return
  }
  const preset = (advancedPresets.value || []).find(p => p.id === id)
  if (!preset) return
  const d = preset.data || {}
  updateHeadersUA.value = d.userAgent || ''
  updateHeadersAuthorization.value = d.authorization || ''
  updateHeadersReferer.value = d.referer || ''
  updateHeadersCookie.value = d.cookie || ''
  updateAllProxy.value = d.allProxy || ''
  instance.proxy.$msg.success(t('task.apply-preset-success'))
}

function deleteAdvancedPreset () {
  const id = selectedAdvancedPresetId.value
  if (!id) return
  const next = (advancedPresets.value || []).filter(p => p.id !== id)
  advancedPresets.value = next
  selectedAdvancedPresetId.value = ''
  onAdvancedPresetChange('')
  preferenceStore.save({ advancedOptionPresets: next })
  instance.proxy.$msg.success(t('task.delete-preset-success'))
}

function updateAdvancedPreset () {
  const id = selectedAdvancedPresetId.value
  if (!id) return
  const presetIndex = (advancedPresets.value || []).findIndex(p => p.id === id)
  if (presetIndex === -1) return

  const data = {
    userAgent: updateHeadersUA.value || '',
    authorization: updateHeadersAuthorization.value || '',
    referer: updateHeadersReferer.value || '',
    cookie: updateHeadersCookie.value || '',
    allProxy: updateAllProxy.value || '',
    newTaskShowDownloading: false
  }

  const updatedPresets = [...advancedPresets.value]
  updatedPresets[presetIndex] = { ...updatedPresets[presetIndex], data }

  advancedPresets.value = updatedPresets
  preferenceStore.save({ advancedOptionPresets: updatedPresets })
  instance.proxy.$msg.success(t('task.update-preset-success'))
}

function saveOrUpdateAdvancedPreset () {
  if (selectedAdvancedPresetId.value) {
    updateAdvancedPreset()
  } else {
    openSavePresetDialog()
  }
}

onBeforeUnmount(() => {
  clearVerifyHideTimer()
})
</script>

<style lang="scss">
.task-item-actions-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

.task-item-actions {
  position: relative;
  z-index: 2;
  height: 24px;
  padding: 0 10px;
  margin: 0;
  overflow: hidden;
  user-select: none;
  cursor: default;
  text-align: right;
  direction: rtl;
  color: var(--lc-text-placeholder);
  transition: all 0.25s cubic-bezier(.645,.045,.355,1), opacity 0.2s ease;
  /* 明确删除背景和边框 */
  background: none !important;
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  opacity: 0.6;
  &:hover {
    color: var(--lc-task-action-hover);
    opacity: 1;
    width: auto;
    background: none !important;
    background-color: transparent !important;
    border: none !important;
  }
  &> .task-item-action {
    display: inline-block;
    padding: 5px;
    margin: 0 4px;
    font-size: 0;
    cursor: pointer;
    position: relative;

    i {
      display: inline-block;
    }
    /* 在每个按钮之间添加分隔横杠 (RTL布局中，需要在左侧添加) */
    &:not(:last-child)::after {
      content: '';
      position: absolute;
      left: -4px;
      top: 50%;
      transform: translateY(-50%);
      width: 1px;
      height: 12px;
      background-color: currentColor;
      opacity: 0.25;
    }
  }
  &> .task-item-action--verify-trigger {
    padding: 0;
    position: relative;
  }
}

.task-item-actions.task-item-actions--verify-open {
  overflow: visible;
  z-index: 100;
}

.el-dialog.update-link-dialog {
  max-width: 680px;
  min-width: 420px;
  border-radius: 16px;

  .el-dialog__footer {
    padding: 0;
    background-color: transparent;
  }

  .el-dialog__footer::before {
    display: none;
  }

  .dialog-footer {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 52px;
    padding-left: 20px;
    padding-right: 20px;
    .chk {
      line-height: 28px;
      &.el-checkbox {
        & .el-checkbox__input {
          line-height: 19px;
        }
        & .el-checkbox__label {
          padding-left: 6px;
        }
      }
    }
    .dialog-footer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      .el-button {
        border-radius: 8px;
        height: 28px;
        padding: 0 16px;
      }
    }
  }

  .dialog-submit-btn {
    border-radius: 8px !important;
  }

  .el-dialog__body {
    padding-top: 20px;
    padding-bottom: 72px;
  }

  .update-link-warning-tip {
    position: absolute;
    left: 20px;
    right: 20px;
    bottom: 64px;
    font-size: 12px;
    line-height: 16px;
    color: #909399;
    text-align: left;
    pointer-events: none;
  }

  .help-link {
    font-size: 12px;
    line-height: 14px;
    padding-top: 7px;
    > a {
      color: #909399;
    }
  }

  .task-advanced-options .el-form-item:last-of-type {
    margin-bottom: 0;
  }

  .preset-actions {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    flex-wrap: nowrap;
  }
}

.task-verify-dropdown-ref {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  font-size: 0;
  cursor: pointer;
}

.task-item-actions--verify {
  direction: ltr;
  position: relative;
  margin-right: -23px;
  z-index: 1;
  /* 明确删除verify按钮的背景 */
  background: none !important;
  background-color: transparent !important;
  border: none !important;
  &:hover {
    background: none !important;
    background-color: transparent !important;
  }
  .task-item-action {
    margin: 0 9px;
    opacity: 0.6;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 1;
    }

    .task-verify-dropdown-ref {
      margin-left: -17px;
    }

    /* verify按钮右侧添加分隔横杠（因为direction是ltr，所以在右侧） */
    &::after {
      content: '';
      position: absolute;
      right: -4px;
      top: 50%;
      transform: translateY(-50%);
      width: 1px;
      height: 12px;
      background-color: currentColor;
      opacity: 0.25;
      transition: opacity 0.25s ease-out;
    }
  }
}

.verify-slide-enter-active {
  transition: transform 0.25s ease-out, opacity 0.25s ease-out;
}

.verify-slide-enter-from {
  transform: translateX(24px);
  opacity: 0;
}

.verify-slide-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.verify-slide-leave-active {
  transition: transform 0.25s ease-in, opacity 0.25s ease-in;
}

.verify-slide-leave {
  transform: translateX(0);
  opacity: 1;
}

.verify-slide-leave-to {
  transform: translateX(24px);
  opacity: 0;
}

.verify-panel-enter-active,
.verify-panel-leave-active {
  transition: opacity 0.12s ease-out;
}

.verify-panel-enter-from {
  opacity: 0;
}

.verify-panel-leave-to {
  opacity: 0;
}

.task-verify-panel {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(calc(-50% - 8px));
  margin-top: 8px;
  z-index: 100;
  min-width: 88px;
  max-width: 100px;
  padding: 4px 0;
  border-radius: 4px;
  background-color: #fff;
  border: 1px solid var(--el-border-color-light);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.task-verify-panel--top {
  top: auto;
  bottom: 100%;
  margin-top: 0;
  margin-bottom: 8px;
}

.task-verify-panel::before {
  content: '';
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 6px 6px 6px;
  border-color: transparent transparent #fff transparent;
  top: -6px;
}

.task-verify-panel--top::before {
  border-width: 6px 6px 0 6px;
  border-color: #fff transparent transparent transparent;
  top: auto;
  bottom: -6px;
}

.task-verify-panel__list {
  list-style: none;
  padding: 0;
  margin: 0;
  text-align: left;
}

.task-verify-panel__item {
  padding: 4px 6px 4px 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  cursor: pointer;
}

.task-verify-panel__item:hover {
  background-color: var(--el-color-primary);
  color: #fff;
}

.theme-dark {
  .task-item-actions {
    /* 暗色主题下的分隔线颜色 */
    &> .task-item-action:not(:first-child)::before {
      background-color: rgba(255, 255, 255, 0.15);
    }
  }
  .task-verify-panel {
    background-color: var(--lc-bg-popover);
    border-color: var(--lc-border-base);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
  }
  .task-verify-panel::before {
    border-color: transparent transparent var(--lc-bg-popover) transparent;
  }
  .task-verify-panel--top::before {
    border-color: var(--lc-bg-popover) transparent transparent transparent;
  }
  .task-verify-panel__item {
    color: var(--lc-text-primary);
  }
  .task-verify-panel__item:hover {
    background-color: var(--el-color-primary);
    color: #fff;
  }
  .task-verify-dropdown-ref svg {
    opacity: 1;
  }
}
</style>
