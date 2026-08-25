<template>
  <el-dialog
    class="tab-title-dialog add-task-dialog"
    width="50vw"
    v-model="dialogVisible"
    :show-close="false"
    :before-close="beforeClose"
    append-to-body
    @open="handleOpen"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <el-form
            ref="taskFormRef"
            :model="form"
    >
      <el-form-item>
        <div class="add-task-primary-input-wrap">
          <button type="button" class="add-task-type-floating__close" aria-label="Close" @click="handleClose">
            <el-icon class="add-task-type-floating__close-icon"><Close /></el-icon>
          </button>
          <div class="add-task-type-floating__bar">
            <mo-segmented-slider
              class="task-type-slider"
              :value="taskType"
              :options="taskTypeOptions"
              @change="handleTaskTypeInput"
            />
          </div>
          <div v-show="taskType === 'uri'" class="add-task-content-pane">
            <el-input
              ref="uriInput"
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 5, maxRows: 5 }"

              :placeholder="t('task.uri-task-tips')"
              @paste="handleUriPaste"
              v-model="form.uris"
            >
            </el-input>
          </div>
          <div v-show="taskType === 'torrent'" class="add-task-content-pane">
            <mo-select-torrent ref="selectTorrent" @change="handleTorrentChange" />
          </div>
        </div>
      </el-form-item>
      <div class="parsed-preview" v-if="taskType === 'uri' && parsedTasks.length > 0">
          <div class="mo-table-wrapper">
            <el-table
              :data="parsedTasks"
              class="mo-parsed-table"
              size="small"
              :max-height="parsedTableMaxHeight"
            >
              <el-table-column :label="t('task.task-name')" min-width="240">
                <template #default="scope">
                  <mo-hover-tip v-if="!scope.row.editing" :content="t('task.double-click-to-edit')" placement="top" :open-delay="300">
                    <span class="mo-parsed-text" @dblclick="enableNameEdit(scope.$index)">{{ scope.row.name }}</span>
                  </mo-hover-tip>
                  <el-input
                    v-else
                    size="small"
                    v-model="scope.row.name"
                    @blur="disableNameEdit(scope.$index)"
                    @keyup.enter="disableNameEdit(scope.$index)"
                  />
                </template>
              </el-table-column>
              <el-table-column :label="t('task.file-size')" min-width="120" align="right">
                <template #default="scope">
                  <span>{{ scope.row.sizeText }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="isPriorityEngineEnabled" :label="t('task.task-priority')" min-width="150" align="right">
                <template #default="scope">
                  <el-input-number
                    size="small"
                    v-model="scope.row.priority"
                    :min="0"
                    :max="999"
                    :step="1"
                    controls-position="right"
                  />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      <el-row :gutter="12">

        <el-col :span="24" :xs="24">
          <el-form-item
            :label="`${t('task.task-split')}: `"
            :label-width="formLabelWidth"
          >
            <el-input-number
              class="task-split-input"
              v-model="form.split"
              controls-position="right"
              :min="1"
              :max="config.engineMaxConnectionPerServer"
              :label="t('task.task-split')"
            >
            </el-input-number>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item
        :label="`${t('task.task-dir')}: `"
        :label-width="formLabelWidth"
      >
        <el-input
          placeholder=""
          v-model="form.dir"
          :readonly="isMas"
        >
          <template #prepend>
            <mo-history-directory
              placement="top-start"
              @selected="handleHistoryDirectorySelected"
            />
          </template>
          <template #append>
            <mo-select-directory
              v-if="isRenderer"
              @selected="handleNativeDirectorySelected"
            />
          </template>
        </el-input>
      </el-form-item>
      <div class="task-advanced-options" v-if="showAdvanced">
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
        <el-form-item
          :label="`${t('task.task-user-agent')}: `"
          :label-width="formLabelWidth"
        >
          <el-input
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 3 }"
            :placeholder="t('task.task-user-agent')"
            v-model="form.userAgent"
          >
          </el-input>
        </el-form-item>
        <el-form-item
          :label="`${t('task.task-authorization')}: `"
          :label-width="formLabelWidth"
        >
          <el-input
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 3 }"
            :placeholder="t('task.task-authorization')"
            v-model="form.authorization"
          >
          </el-input>
        </el-form-item>
        <el-form-item
          :label="`${t('task.task-referer')}: `"
          :label-width="formLabelWidth"
        >
          <el-input
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 3 }"
            :placeholder="t('task.task-referer')"
            v-model="form.referer"
          >
          </el-input>
        </el-form-item>
        <el-form-item
          :label="`${t('task.task-cookie')}: `"
          :label-width="formLabelWidth"
        >
          <el-input
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 3 }"
            :placeholder="t('task.task-cookie')"
            v-model="form.cookie"
          >
          </el-input>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="16" :xs="24">
            <el-form-item
              :label="`${t('task.task-proxy')}: `"
              :label-width="formLabelWidth"
            >
              <el-input
                placeholder="[http://][USER:PASSWORD@]HOST[:PORT]"
                v-model="form.allProxy">
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
        <el-form-item label="" :label-width="formLabelWidth" style="margin-top: 12px;">
          <div class="toggle-row">
            <span class="toggle-label">{{t('task.navigate-to-downloading')}}</span>
            <el-switch v-model="form.newTaskShowDownloading" />
          </div>
        </el-form-item>
      </div>
  </el-form>
<template #footer>
<div class="dialog-footer">
<el-checkbox
class="chk"
v-model="showAdvanced"
>
{{t('task.show-advanced-options')}}
</el-checkbox>
        <el-button
          type="primary"
          class="dialog-submit-btn"
          @click="submitForm()"
        >
          {{t('app.submit')}}
        </el-button>
      </div>
</template>
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
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import is from 'electron-is'
import { ipcRenderer } from 'electron'
import { isEmpty } from 'lodash'
// mo-history-directory, mo-select-directory, mo-select-torrent,
// mo-segmented-slider, mo-hover-tip, mo-extend-select are globally registered in main.js
import {
  initTaskForm,
  buildUriPayload,
  buildTorrentPayload
} from '@/utils/task'
import i18n from '@/plugins/i18n'
import { createMsg } from '@/components/Msg'
import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/task'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'
import { ADD_TASK_TYPE } from '@shared/constants'
import { detectResource, splitTaskLinks, normalizeCookie, generateUniqueTaskName } from '@shared/utils'
import '@/components/Icons/inbox'
import '@/components/Icons/folder'
import '@/components/Icons/link'
import { Close } from '@element-plus/icons-vue'

defineOptions({ name: 'mo-add-task' })

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })
const router = useRouter()

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: ADD_TASK_TYPE.URI
  }
})

const appStore = useAppStore()
const taskStore = useTaskStore()
const preferenceStore = usePreferenceStore()
const { config } = storeToRefs(preferenceStore)
const { addTaskUrl: addTaskUrlFromStore } = storeToRefs(appStore)
const { taskList } = storeToRefs(taskStore)

// --- Data ---
const formLabelWidth = '110px'
const showAdvanced = ref(false)
const form = ref({})
const rules = ref({})
const parsedTasks = ref([])
const lastDuplicateHistoryKey = ref('')
const keepTrailingNewline = ref(false)
const advancedPresets = ref([])
const selectedAdvancedPresetId = ref('')
const savePresetDialogVisible = ref(false)
const savePresetName = ref('')
let clipboardTimer = null
const lastClipboardText = ref('')
const dialogOpenInitialized = ref(false)
const dialogVisible = ref(false)
let _closeTimer = null
let _historyUrlSet = null

// --- Template refs ---
const taskFormRef = ref(null)
const uriInput = ref(null)
const selectTorrent = ref(null)

// --- Computed ---
const isRenderer = is.renderer()
const isMas = is.mas()
const isPriorityEngineEnabled = computed(() => !!(config.value && config.value.enablePriorityEngine))
const taskType = computed(() => props.type === 'video' ? ADD_TASK_TYPE.URI : props.type)
const taskTypeOptions = computed(() => [
  { value: 'uri', label: t('task.uri-task') },
  { value: 'torrent', label: t('task.torrent-task') }
])
const parsedTableMaxHeight = computed(() => {
  const count = parsedTasks.value.length
  if (count === 0) return undefined
  const headerHeight = 40
  const rowHeight = 32
  const maxRows = 5
  const maxHeight = headerHeight + maxRows * rowHeight
  return Math.min(headerHeight + count * rowHeight, maxHeight)
})

// --- Watchers ---
watch(taskType, (current, previous) => {
  // 切换任务类型时清除解析预览，防止种子文件列表显示在链接任务的解析框中
  if (current !== previous) {
    parsedTasks.value = []
  }

  if (props.visible && isUriLikeType(previous)) {
    return
  }

  if (isUriLikeType(current)) {
    // 切换到链接任务时，如果已有 URL 则重新构建预览
    if (form.value.uris) {
      updateUriPreview(form.value.uris)
    }
    setTimeout(() => {
      uriInput.value && uriInput.value.focus()
    }, 50)
  }
})

watch(() => props.visible, (current) => {
  dialogVisible.value = current
  const cfg = config.value || {}
  const clipboardAutoPasteEnabled = cfg.clipboardAutoPaste === undefined ? true : !!cfg.clipboardAutoPaste
  if (current === true) {
    document.addEventListener('keydown', handleHotkey)
    if (clipboardAutoPasteEnabled) {
      startClipboardWatch()
    }
  } else {
    document.removeEventListener('keydown', handleHotkey)
    stopClipboardWatch()
  }
})

watch(addTaskUrlFromStore, (current, previous) => {
  if (!props.visible) {
    return
  }
  applyUrlFromStore(current, previous)
})

watch(() => form.value.uris, (val) => {
  if (isUriLikeType(taskType.value)) {
    updateUriPreview(val)
  }
})

// --- Lifecycle ---
onMounted(() => {
  dialogVisible.value = props.visible
  if (props.visible && !dialogOpenInitialized.value) {
    handleOpen()
    nextTick(() => {
      handleOpened()
    })
  }
})

onBeforeUnmount(() => {
  stopClipboardWatch()
  if (_closeTimer) {
    clearTimeout(_closeTimer)
    _closeTimer = null
  }
  document.removeEventListener('keydown', handleHotkey)
})

// --- Methods ---
function isUriLikeType (type) {
  return type === ADD_TASK_TYPE.URI
}

function applyUrlFromStore (current, previous) {
  if (!isUriLikeType(taskType.value)) {
    return
  }
  const cur = (current || '').trim()
  const prev = (previous || '').trim()
  if (!cur || cur === prev) {
    return
  }
  const existing = (form.value.uris || '').trim()
  const lines = existing ? existing.split(/\r?\n/).filter(Boolean) : []
  if (!lines.includes(cur)) {
    const next = existing ? `${existing}\n${cur}` : cur
    keepTrailingNewline.value = true
    form.value.uris = next
  }
}

function loadAdvancedPresets () {
  const { advancedOptionPresets = [] } = config.value || {}
  advancedPresets.value = Array.isArray(advancedOptionPresets) ? advancedOptionPresets : []
}

function openSavePresetDialog () {
  const data = {
    userAgent: form.value.userAgent || '',
    authorization: form.value.authorization || '',
    referer: form.value.referer || '',
    cookie: form.value.cookie || '',
    allProxy: form.value.allProxy || '',
    newTaskShowDownloading: !!form.value.newTaskShowDownloading
  }
  const allEmpty = [
    data.userAgent,
    data.authorization,
    data.referer,
    data.cookie,
    data.allProxy
  ].every(v => !v || !String(v).trim()) && !data.newTaskShowDownloading
  if (allEmpty) {
    msg.warning(t('task.empty-advanced-options-tips'))
    return
  }
  savePresetName.value = ''
  savePresetDialogVisible.value = true
}

function saveAdvancedPreset () {
  const name = (savePresetName.value || '').trim() || `Preset ${new Date().toLocaleString()}`
  const data = {
    userAgent: form.value.userAgent || '',
    authorization: form.value.authorization || '',
    referer: form.value.referer || '',
    cookie: form.value.cookie || '',
    allProxy: form.value.allProxy || '',
    newTaskShowDownloading: !!form.value.newTaskShowDownloading
  }
  const preset = { id: Date.now().toString(), name, data }
  const next = [...advancedPresets.value, preset]
  advancedPresets.value = next
  preferenceStore.save({ advancedOptionPresets: next })
  msg.success(t('task.save-preset-success'))
  savePresetDialogVisible.value = false
  selectedAdvancedPresetId.value = preset.id
}

function onAdvancedPresetChange (id) {
  if (!id) {
    form.value.userAgent = ''
    form.value.authorization = ''
    form.value.referer = ''
    form.value.cookie = ''
    form.value.allProxy = ''
    form.value.newTaskShowDownloading = !!(config.value && config.value.newTaskShowDownloading)
    return
  }
  const preset = advancedPresets.value.find(p => p.id === id)
  if (!preset) return
  const d = preset.data || {}
  form.value.userAgent = d.userAgent || ''
  form.value.authorization = d.authorization || ''
  form.value.referer = d.referer || ''
  form.value.cookie = d.cookie || ''
  form.value.allProxy = d.allProxy || ''
  form.value.newTaskShowDownloading = !!d.newTaskShowDownloading
  msg.success(t('task.apply-preset-success'))
}

function deleteAdvancedPreset () {
  const id = selectedAdvancedPresetId.value
  if (!id) return
  const next = advancedPresets.value.filter(p => p.id !== id)
  advancedPresets.value = next
  selectedAdvancedPresetId.value = ''
  onAdvancedPresetChange('')
  preferenceStore.save({ advancedOptionPresets: next })
  msg.success(t('task.delete-preset-success'))
}

function updateAdvancedPreset () {
  const id = selectedAdvancedPresetId.value
  if (!id) return
  const presetIndex = advancedPresets.value.findIndex(p => p.id === id)
  if (presetIndex === -1) return

  const data = {
    userAgent: form.value.userAgent || '',
    authorization: form.value.authorization || '',
    referer: form.value.referer || '',
    cookie: form.value.cookie || '',
    allProxy: form.value.allProxy || '',
    newTaskShowDownloading: !!form.value.newTaskShowDownloading
  }

  const updatedPresets = [...advancedPresets.value]
  updatedPresets[presetIndex] = {
    ...updatedPresets[presetIndex],
    data
  }

  advancedPresets.value = updatedPresets
  preferenceStore.save({ advancedOptionPresets: updatedPresets })
  msg.success(t('task.update-preset-success'))
}

function saveOrUpdateAdvancedPreset () {
  if (selectedAdvancedPresetId.value) {
    updateAdvancedPreset()
  } else {
    openSavePresetDialog()
  }
}

async function autofillResourceLink () {
  try {
    const content = await ipcRenderer.invoke('clipboard:read-text')
    const text = (content || '').trim()
    if (!text) {
      return
    }
    lastClipboardText.value = text

    if (isEmpty(form.value.uris)) {
      const hasResource = detectResource(text)
      if (!hasResource) {
        return
      }
      form.value.uris = text
      updateUriPreview(form.value.uris)
      keepTrailingNewline.value = true
      ensureTrailingNewlineAndCaret()
    }
  } catch (e) {
  }
}

function startClipboardWatch () {
  if (clipboardTimer) {
    return
  }
  const readClipboard = () => ipcRenderer.invoke('clipboard:read-text')
  const checkClipboard = async () => {
    if (!props.visible) {
      return
    }
    if (!isUriLikeType(taskType.value)) {
      return
    }
    const content = await readClipboard()
    const text = (content || '').trim()
    if (!text) {
      return
    }
    if (text === lastClipboardText.value) {
      return
    }
    lastClipboardText.value = text
    const hasResource = detectResource(text)
    if (!hasResource) {
      return
    }
    const existing = (form.value.uris || '').trim()
    if (!existing) {
      form.value.uris = text
    } else {
      const lines = existing.split(/\r?\n/).filter(Boolean)
      if (lines.includes(text)) {
        return
      }
      form.value.uris = `${existing}\n${text}`
    }
    updateUriPreview(form.value.uris)
    keepTrailingNewline.value = true
    ensureTrailingNewlineAndCaret()
  }
  clipboardTimer = setInterval(checkClipboard, 1000)
}

function stopClipboardWatch () {
  if (clipboardTimer) {
    clearInterval(clipboardTimer)
    clipboardTimer = null
  }
}

function beforeClose (done) {
  if (isEmpty(form.value.uris) && isEmpty(form.value.torrent)) {
    done()
    if (_closeTimer) clearTimeout(_closeTimer)
    _closeTimer = setTimeout(() => {
      _closeTimer = null
      if (!dialogVisible.value) {
        handleClosed()
      }
    }, 200)
  }
}

function buildStoreState () {
  return {
    app: {
      addTaskUrl: appStore.addTaskUrl,
      addTaskOptions: appStore.addTaskOptions
    },
    preference: {
      config: config.value
    }
  }
}

function handleOpen () {
  dialogOpenInitialized.value = true
  form.value = initTaskForm(buildStoreState())
  parsedTasks.value = []
  selectedAdvancedPresetId.value = ''
  onAdvancedPresetChange('')
  loadAdvancedPresets()
  if (isUriLikeType(taskType.value)) {
    if (addTaskUrlFromStore.value) {
      applyUrlFromStore(addTaskUrlFromStore.value, '')
    }
    if (!isEmpty(form.value.uris)) {
      updateUriPreview(form.value.uris)
      keepTrailingNewline.value = true
      ensureTrailingNewlineAndCaret()
    }
    const cfg = config.value || {}
    const clipboardAutoPasteEnabled = cfg.clipboardAutoPaste === undefined ? true : !!cfg.clipboardAutoPaste
    if (clipboardAutoPasteEnabled) {
      autofillResourceLink()
    }
    setTimeout(() => {
      uriInput.value && uriInput.value.focus()
    }, 50)
  }
}

function handleOpened () {
  detectThunderResource(form.value.uris)
}

function handleClose () {
  dialogVisible.value = false
  if (_closeTimer) clearTimeout(_closeTimer)
  _closeTimer = setTimeout(() => {
    _closeTimer = null
    if (!dialogVisible.value) {
      handleClosed()
    }
  }, 200)
}

function handleClosed () {
  if (_closeTimer) {
    clearTimeout(_closeTimer)
    _closeTimer = null
  }
  dialogOpenInitialized.value = false
  reset()
  appStore.hideAddTaskDialog()
}

function handleHotkey (event) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    submitForm()
  }
}

function handleTaskTypeInput (type) {
  appStore.changeAddTaskType(type)
}

function handleUriPaste (event) {
  const pastedText = (event.clipboardData || window.clipboardData).getData('text') || ''
  if (pastedText) {
    detectThunderResource(pastedText)
    updateUriPreview(pastedText)
  }
  setImmediate(() => {
    keepTrailingNewline.value = true
    ensureTrailingNewlineAndCaret()
  })
}

function ensureTrailingNewlineAndCaret () {
  let uris = uriInput.value && (uriInput.value.value || (uriInput.value.$refs && uriInput.value.$refs.textarea && uriInput.value.$refs.textarea.value))
  if (!uris) return
  if (!/\n$/.test(uris)) {
    uris = uris.replace(/\s+$/, '') + '\n'
    form.value.uris = uris
  }
  nextTick(() => {
    const textarea = uriInput.value && uriInput.value.$refs && uriInput.value.$refs.textarea
    if (textarea) {
      const end = form.value.uris.length
      textarea.selectionStart = end
      textarea.selectionEnd = end
    }
    keepTrailingNewline.value = false
  })
}

function detectThunderResource (uris = '') {
  if (uris.includes('thunder://')) {
    msg({
      type: 'warning',
      message: t('task.thunder-link-tips'),
      duration: 6000
    })
  }
}

function handleTorrentChange (torrent, selectedFileIndex, files) {
  form.value.torrent = torrent
  form.value.selectFile = selectedFileIndex
  if (Array.isArray(files) && files.length > 0) {
    parsedTasks.value = files.map(f => {
      const size = (typeof f.length === 'number') ? f.length : (typeof f.size === 'number' ? f.size : 0)
      return { name: f.path || f.name, sizeText: bytesToSize(size) }
    })
  } else {
    updateTorrentPreview()
  }
}

function handleHistoryDirectorySelected (dir) {
  form.value.dir = dir
}

function handleNativeDirectorySelected (dir) {
  form.value.dir = dir
  preferenceStore.recordHistoryDirectory(dir)
}

function reset () {
  showAdvanced.value = false
  form.value = initTaskForm(buildStoreState())
  parsedTasks.value = []
  lastDuplicateHistoryKey.value = ''
  _historyUrlSet = null
  selectedAdvancedPresetId.value = ''
  savePresetDialogVisible.value = false
  savePresetName.value = ''
}

function enableNameEdit (idx) {
  if (parsedTasks.value[idx]) {
    parsedTasks.value[idx].editing = true
  }
}

function disableNameEdit (idx) {
  const task = parsedTasks.value[idx]
  if (!task) return
  task.editing = false
  const originalName = task.originalName || task.name || ''
  if (!task.originalName && originalName) {
    task.originalName = originalName
  }
  const currentName = task.name || ''
  const renamed = originalName && currentName && currentName !== originalName
  task.renamed = !!renamed
}

async function updateUriPreview (uris = '') {
  const sanitized = splitTaskLinks(uris || '')
  const seen = new Set()
  const lines = []
  for (const u of sanitized) {
    if (!seen.has(u)) {
      seen.add(u)
      lines.push(u)
    }
  }
  const removed = sanitized.length - lines.length
  const joined = lines.join('\n')
  const currentJoined = (uris || '').trim().replace(/(?:\r\n|\r|\n)/g, '\n')
  if (joined !== currentJoined) {
    form.value.uris = joined
    if (removed > 0) {
      msg.info(t('task.remove-duplicate-links-message', { count: removed }))
    }
  }

  const existingMap = new Map()
  for (const task of parsedTasks.value) {
    if (task.url) {
      existingMap.set(task.url, task)
    }
  }

  const suggestedName = lines.length === 1 && form.value.out && typeof form.value.out === 'string' && form.value.out.trim()
    ? form.value.out.trim()
    : null

  if (suggestedName) {
    form.value.out = ''
  }

  const items = lines.map((u, i) => {
    if (suggestedName) {
      try {
        const url = decodeURI(u)
        const lastSlash = url.lastIndexOf('/')
        let name = lastSlash >= 0 ? url.substring(lastSlash + 1) : url
        if (name) {
          const qIdx = name.indexOf('?')
          const hIdx = name.indexOf('#')
          const cutIdx = [qIdx, hIdx].filter(i => i >= 0).sort((a, b) => a - b)[0]
          if (typeof cutIdx === 'number') {
            name = name.substring(0, cutIdx)
          }
        }
        const uniqueName = generateUniqueTaskNameFn(suggestedName)
        return {
          name: uniqueName,
          originalName: suggestedName,
          renamed: uniqueName !== suggestedName,
          sizeText: '-',
          editing: false,
          priority: 0,
          url: u,
          order: i
        }
      } catch (e) {
        const uniqueName = generateUniqueTaskNameFn(suggestedName)
        return {
          name: uniqueName,
          originalName: suggestedName,
          renamed: uniqueName !== suggestedName,
          sizeText: '-',
          editing: false,
          priority: 0,
          url: u,
          order: i
        }
      }
    }

    const existing = existingMap.get(u)
    if (existing) {
      const originalName = existing.originalName || existing.name || ''
      const uniqueName = generateUniqueTaskNameFn(existing.name)
      return {
        ...existing,
        name: uniqueName,
        originalName,
        renamed: uniqueName !== existing.name,
        order: i
      }
    }

    try {
      let name = ''
      if (u.toLowerCase().startsWith('ed2k://|file|')) {
        const parts = u.split('|')
        if (parts.length >= 3) {
          name = decodeURIComponent(parts[2])
        }
      } else {
        const url = decodeURI(u)
        const lastSlash = url.lastIndexOf('/')
        name = lastSlash >= 0 ? url.substring(lastSlash + 1) : url
        if (name) {
          const qIdx = name.indexOf('?')
          const hIdx = name.indexOf('#')
          const cutIdx = [qIdx, hIdx].filter(i => i >= 0).sort((a, b) => a - b)[0]
          if (typeof cutIdx === 'number') {
            name = name.substring(0, cutIdx)
          }
        }
      }
      const finalName = suggestedName || name || u
      const uniqueName = generateUniqueTaskNameFn(finalName)
      return {
        name: uniqueName,
        originalName: finalName,
        renamed: uniqueName !== finalName,
        sizeText: '-',
        editing: false,
        priority: 0,
        url: u,
        order: i
      }
    } catch (e) {
      const finalName = suggestedName || u
      const uniqueName = generateUniqueTaskNameFn(finalName)
      return {
        name: uniqueName,
        originalName: finalName,
        renamed: uniqueName !== finalName,
        sizeText: '-',
        editing: false,
        priority: 0,
        url: u,
        order: i
      }
    }
  })
  parsedTasks.value = items

  const newLines = lines.filter(u => !existingMap.has(u))
  if (newLines.length > 0) {
    await fetchUriSizes(lines)
  }

  if (keepTrailingNewline.value && lines.length > 0) {
    ensureTrailingNewlineAndCaret()
  }
}

async function fetchUriSizes (lines = []) {
  const buildHeaders = () => {
    const h = {}
    if (form.value.userAgent) h['User-Agent'] = form.value.userAgent
    if (form.value.referer) h.Referer = form.value.referer
    if (form.value.cookie) {
      const cookie = normalizeCookie(form.value.cookie)
      if (cookie) {
        h.Cookie = cookie
      }
    }
    if (form.value.authorization) h.Authorization = form.value.authorization
    h.Accept = '*/*'
    return h
  }
  const parseDisposition = (v) => {
    if (!v) return null
    const star = /filename\*=([^;]+)/i.exec(v)
    if (star && star[1]) {
      const part = star[1].trim()
      const m = /^([^']*)'[^']*'(.*)$/.exec(part)
      const name = m ? decodeURIComponent(m[2]) : decodeURIComponent(part)
      return name
    }
    const normal = /filename="?([^";]+)"?/i.exec(v)
    if (normal && normal[1]) return normal[1]
    return null
  }
  const updates = await Promise.all(lines.map(async (u, idx) => {
    if (!/^https?:/i.test(u) || u.startsWith('magnet:')) {
      if (u.toLowerCase().startsWith('ed2k://|file|')) {
        const parts = u.split('|')
        if (parts.length >= 4) {
          const size = parseInt(parts[3], 10)
          if (!isNaN(size) && size > 0) {
            return { idx, sizeText: bytesToSize(size), dispName: null }
          }
        }
      }
      return { idx, sizeText: '-', dispName: null }
    }
    const headers = buildHeaders()
    try {
      const res = await ipcRenderer.invoke('uri:fetch-size', { url: u, headers })
      let len = res && res.ok ? res.contentLength : ''
      let disp = res && res.ok ? parseDisposition(res.contentDisposition) : null
      if (!len || len === '0') {
        // HEAD/Range 都没拿到，返回 '-'
      }
      const sizeText = len ? bytesToSize(parseInt(len, 10)) : '-'
      return { idx, sizeText, dispName: disp }
    } catch (_) {
      return { idx, sizeText: '-', dispName: null }
    }
  }))
  updates.forEach(({ idx, sizeText, dispName }) => {
    if (parsedTasks.value[idx]) {
      parsedTasks.value[idx].sizeText = sizeText
      if (dispName) {
        parsedTasks.value[idx].name = dispName
      }
    }
  })
}

function updateTorrentPreview () {
  const selectComp = selectTorrent.value
  let items = []
  if (selectComp && Array.isArray(selectComp.files) && selectComp.files.length > 0) {
    items = selectComp.files.map(f => {
      const size = (typeof f.length === 'number') ? f.length : (typeof f.size === 'number' ? f.size : 0)
      return { name: f.path || f.name, sizeText: bytesToSize(size), editing: false }
    })
  }
  parsedTasks.value = items
}

function bytesToSize (n) {
  if (!n || n <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let val = n
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
  return `${val.toFixed(1)} ${units[i]}`
}

function generateUniqueTaskNameFn (name) {
  const list = taskList.value || []
  const existingNames = new Set(list.map(t => t.name))
  return generateUniqueTaskName(name, existingNames)
}

async function addTask (type, formData) {
  let payload = null
  if (isUriLikeType(type)) {
    const autoCategorizeFiles = config.value.autoCategorizeFiles || false
    const fileCategories = config.value.fileCategories || null

    payload = await buildUriPayload(formData, autoCategorizeFiles, fileCategories)
    taskStore.addUri(payload).catch(err => {
      msg.error(err.message)
    })
  } else if (type === ADD_TASK_TYPE.TORRENT) {
    payload = buildTorrentPayload(formData)
    taskStore.addTorrent(payload).catch(err => {
      msg.error(err.message)
    })
  } else if (type === 'metalink') {
    // @TODO addMetalink
  } else {
    console.error('[LinkCore] Add task fail', formData)
  }
}

async function submitForm () {
  const valid = await new Promise(resolve => {
    taskFormRef.value.validate(v => resolve(v))
  })
  if (!valid) {
    return
  }

  try {
    if (isUriLikeType(taskType.value) && parsedTasks.value.length > 0) {
      const buckets = {}
      const prios = []
      parsedTasks.value.forEach(item => {
        const p = Number(item.priority) || 0
        if (!buckets[p]) {
          buckets[p] = []
          prios.push(p)
        }
        buckets[p].push(item)
      })
      prios.sort((a, b) => b - a)
      const ordered = []
      let remaining = parsedTasks.value.length
      const indices = prios.map(() => 0)
      while (remaining > 0) {
        for (let i = 0; i < prios.length; i++) {
          const p = prios[i]
          const arr = buckets[p]
          const idx = indices[i]
          if (idx < arr.length) {
            ordered.push(arr[idx])
            indices[i] = idx + 1
            remaining--
            if (remaining <= 0) break
          }
        }
      }
      form.value.customOuts = ordered.map(i => i.name)
      const urisOrdered = ordered.map(i => i.url)
      form.value.uris = urisOrdered.join('\n')
      form.value.priorities = ordered.map(i => Number(i.priority) || 0)
    }
    await addTask(taskType.value, form.value)

    handleClose()
    if (form.value.newTaskShowDownloading) {
      const cfg = config.value || {}
      const jumpTarget = form.value.newTaskJumpTarget || cfg.newTaskJumpTarget || 'downloading'
      const status = jumpTarget === 'all' ? 'all' : 'active'
      router.push({
        path: `/task/${status}`
      }).catch(err => {
        console.log(err)
      })
    }
  } catch (err) {
    msg.error(t(err.message))
  }
}
</script>

<style lang="scss">
.add-task-primary-input-wrap {
  position: relative;
  padding-top: 38px;
  padding-bottom: 0;
  width: 100%;

  .add-task-content-pane {
    min-height: 120px;
    width: 100%;

    /* 种子模式下文件表格底部与分片数选择框之间保持间距 */
    .selective-torrent {
      .mo-task-files {
        .file-filters {
          margin-bottom: 12px;
        }
      }
    }
  }

  .el-textarea__inner,
  .el-upload-dragger {
    border-radius: 8px !important;
    background: transparent !important;
  }

  .el-textarea__inner {
    padding-left: 12px;
    min-height: 120px;
  }
}

.add-task-dialog .el-form > .el-form-item:first-child {
  margin-bottom: 0 !important;
}

.add-task-type-floating__bar {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  display: flex;
  align-items: center;
}

/* 新建任务分类切换滑块：项内边距加大 */
.task-type-slider .lc-segmented__item {
  padding: 0 20px;
}

.add-task-type-floating__close {
  position: absolute;
  top: 0;
  right: -6px;
  z-index: 1;
  appearance: none;
  height: 28px;
  padding: 0 2px;
  margin: 0;
  cursor: pointer;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  font-size: 16px;
  box-sizing: border-box;
  border-radius: 4px;
  box-shadow: none;
}

.add-task-type-floating__close:hover {
  background: transparent;
}

.el-dialog.add-task-dialog {
  max-width: 632px;
  min-width: 380px;
  border-radius: 16px;

  /* 顶部/底部整体收紧：任务类型导航栏与关闭按钮上移，页脚下缘收紧 */
  padding-top: 8px;
  padding-bottom: 6px;

  .el-dialog__body {
    padding-top: 4px;
  }

  .el-button {
    border-radius: 8px;
  }

  /* 确保输入框/输入框组在弹窗内占满可用宽度 */
  .el-form-item__content {
    .el-input,
    .el-textarea,
    .el-input-group,
    .el-input-number {
      width: 100%;
    }
  }

  .el-dialog__header {
    display: none;
  }

  /* Element Plus 的遮罩层由 .el-overlay 处理，无需额外设置背景色 */
  /* :deep(.el-overlay) 已由 Element Plus modal 属性自动生成遮罩 */
.parsed-preview {
    margin-top: 0;
    margin-bottom: 16px;
    .mo-table-wrapper {
      border: 1px solid var(--lc-border-base);
      border-radius: 8px;
      box-sizing: border-box;
      padding: 0;
    }
    .el-table.mo-parsed-table {
      border: none !important;
      border-radius: 8px 8px 0 0;
      overflow: hidden;
      &::before, &::after {
        display: none !important;
      }
      .el-table--border::after, .el-table--group::after {
        display: none !important;
      }
      th.gutter, colgroup.gutter {
        display: none !important;
        width: 0 !important;
      }
      .el-table__header colgroup col[name="gutter"] {
        display: none !important;
        width: 0 !important;
      }
      .el-table__body tr:last-child td {
        border-bottom: none !important;
      }
      th.el-table__cell {
        background-color: transparent !important;
        border-bottom: none !important;
        .cell {
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
      }
      .cell {
        padding-left: 10px !important;
        padding-right: 10px !important;
      }
      .mo-parsed-text {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .el-table__row {
        height: 32px !important;
        td {
          padding: 0 !important;
          .cell {
            line-height: 32px !important;
            height: 32px !important;
            display: flex;
            align-items: center;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          &.is-right .cell {
            justify-content: flex-end;
            text-align: right;
          }
          &.is-center .cell {
            justify-content: center;
            text-align: center;
          }
        }
      }
    }
  }
  .task-advanced-options .el-form-item:last-of-type {
    margin-bottom: 0;
  }
  .el-input-number.el-input-number--mini {
    width: 100%;
  }
  .task-split-input.el-input-number {
    width: 100%;
  }
  .help-link {
    font-size: 12px;
    line-height: 14px;
    padding-top: 7px;
    > a {
      color: #909399;
    }
  }
  /* 表单项标题左对齐：与顶部输入框（链接输入区）最左侧上下对齐。
     EP 2.8 el-form-item__label 默认 display:flex + justify-content:flex-end
     （label-position: right），flex 布局下 text-align 失效，必须改 justify-content */
  .el-form-item__label {
    justify-content: flex-start;
  }
  .el-dialog__footer {
    padding: 0;
    background-color: transparent;
    border-radius: 0;
  }
  .dialog-footer {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 40px;
    padding-left: 4px;
  .chk {
    line-height: 28px;
    &.el-checkbox {
      /* 勾选框 16px（默认 14px 略小、18px 偏大）；
         对勾用 50%/50% + translate 定位并覆盖 checked 态 transform，保证视觉居中 */
      .el-checkbox__inner {
        width: 16px;
        height: 16px;
        border-radius: 4px;

        &::after {
          width: 4px;
          height: 8px;
          left: 50%;
          top: 44%;
          transform: translate(-50%, -50%) rotate(45deg) scaleY(0);
          transform-origin: center;
        }
      }
      &.is-checked .el-checkbox__inner::after,
      .el-checkbox__input.is-checked .el-checkbox__inner::after {
        transform: translate(-50%, -50%) rotate(45deg) scaleY(1);
      }
      .el-checkbox__label {
        padding-left: 6px;
        font-size: 13px;
        color: var(--lc-text-regular, #606266);
      }
      &.is-checked .el-checkbox__label {
        color: var(--lc-text-regular, #606266);
      }
    }
  }
  }
  .dialog-submit-btn {
    position: absolute;
    right: 0;
    bottom: 4px;
    height: 28px;
    padding: 0 16px;
    border-radius: 8px !important;
  }
}

.task-advanced-options {
  .preset-actions {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
    gap: 2px; /* 继续收紧两个预设按钮之间的间距 */
    flex-wrap: nowrap;

    .el-button {
      border-radius: 6px; /* 比输入框圆角略大一点，保持区分度 */
    }
  }
}

.theme-dark .add-task-dialog .parsed-preview {
  .mo-table-wrapper {
    border-color: var(--lc-border-base) !important;
    background-color: var(--lc-task-item-bg) !important;
  }
  .el-table.mo-parsed-table {
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
      border-bottom: 1px solid var(--lc-border-base) !important;
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
  }
}

.theme-dark .add-task-dialog .mo-task-files {
  .mo-table-wrapper {
    border-color: var(--lc-border-base);
  }
  .el-table th.gutter {
    display: none !important;
    border-bottom: none !important;
  }
}
</style>
