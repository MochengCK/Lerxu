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
          <el-tooltip
            v-else
            effect="dark"
            :content="$t('task.update-link')"
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
          </el-tooltip>
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
          <el-tooltip
            effect="dark"
            :content="$t('task.select-files')"
            placement="top"
            :open-delay="500"
          >
            <span
              class="task-verify-dropdown-ref"
              @click.stop="onSelectFilesClick"
            >
              <mo-icon name="select-files" width="14" height="14" />
            </span>
          </el-tooltip>
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
        <el-tooltip
          effect="dark"
          :content="getActionLabel(action)"
          placement="top"
          :open-delay="500"
        >
          <i v-if="action ==='PAUSE'" @click.stop="onPauseClick">
            <mo-icon name="task-pause-line" width="14" height="14" />
          </i>
          <i v-if="action ==='STOP'" @click.stop="onStopClick">
            <mo-icon name="task-stop-line" width="14" height="14" />
          </i>
          <i v-if="action === 'RESUME'" @click.stop="onResumeClick">
            <mo-icon name="task-start-line" width="14" height="14" />
          </i>
          <i v-if="action === 'RESTART'" @click.stop="onRestartClick">
            <mo-icon name="task-restart" width="14" height="14" />
          </i>
          <i v-if="action === 'DELETE'" @click.stop="onDeleteClick">
            <mo-icon name="delete" width="14" height="14" />
          </i>
          <i v-if="action === 'TRASH'" @click.stop="onTrashClick">
            <mo-icon name="trash" width="14" height="14" />
          </i>
          <i v-if="action ==='FOLDER'" @click.stop="onFolderClick">
            <mo-icon name="folder" width="14" height="14" />
          </i>
          <i v-if="action ==='LINK'" @click.stop="onLinkClick">
            <mo-icon name="link" width="14" height="14" />
          </i>
          <i v-if="action ==='INFO'" @click.stop="onInfoClick">
            <mo-icon name="info-circle" width="14" height="14" />
          </i>
          <span
            v-if="action ==='VERIFY'"
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
        </el-tooltip>
      </li>
    </ul>

    <el-dialog
      :title="$t('task.update-link')"
      :visible.sync="updateLinkDialogVisible"
      width="620px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      custom-class="update-link-dialog"
      append-to-body
      @open="onUpdateLinkDialogOpen"
    >
      <el-form label-position="left">
        <el-form-item :label="`${$t('task.uri-task')}: `" :label-width="formLabelWidth">
          <el-input
            v-model="updateLinkValue"
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 4 }"
            :placeholder="$t('task.update-link-placeholder')"
          />
        </el-form-item>

        <div class="task-advanced-options" v-if="showUpdateAdvanced">
          <el-row :gutter="8" style="margin-bottom: 8px; align-items:center;">
            <el-col :span="16" :xs="14">
              <el-form-item :label="`${$t('task.advanced-presets')}: `" :label-width="formLabelWidth">
                <el-select v-model="selectedAdvancedPresetId" placeholder="" @change="onAdvancedPresetChange">
                  <el-option :label="$t('task.empty-preset')" value="" />
                  <el-option v-for="p in advancedPresets" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8" :xs="10" style="text-align:right;">
              <div class="preset-actions">
                <el-button type="primary" size="mini" @click="saveOrUpdateAdvancedPreset">{{ selectedAdvancedPresetId ? $t('task.update-advanced-preset') : $t('task.save-advanced-preset') }}</el-button>
                <el-button type="danger" size="mini" :disabled="!selectedAdvancedPresetId" @click="deleteAdvancedPreset">{{ $t('task.delete-advanced-preset') }}</el-button>
              </div>
            </el-col>
          </el-row>

          <el-form-item :label="`${$t('task.task-user-agent')}: `" :label-width="formLabelWidth">
            <el-input
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 2, maxRows: 3 }"
              :placeholder="$t('task.task-user-agent')"
              v-model="updateHeadersUA"
            />
          </el-form-item>

          <el-form-item :label="`${$t('task.task-authorization')}: `" :label-width="formLabelWidth">
            <el-input
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 2, maxRows: 3 }"
              :placeholder="$t('task.task-authorization')"
              v-model="updateHeadersAuthorization"
            />
          </el-form-item>

          <el-form-item :label="`${$t('task.task-referer')}: `" :label-width="formLabelWidth">
            <el-input
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 2, maxRows: 3 }"
              :placeholder="$t('task.task-referer')"
              v-model="updateHeadersReferer"
            />
          </el-form-item>

          <el-form-item :label="`${$t('task.task-cookie')}: `" :label-width="formLabelWidth">
            <el-input
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 2, maxRows: 3 }"
              :placeholder="$t('task.task-cookie')"
              v-model="updateHeadersCookie"
            />
          </el-form-item>

          <el-row :gutter="12">
            <el-col :span="16" :xs="24">
              <el-form-item
                :label="`${$t('task.task-proxy')}: `"
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
                  {{ $t('preferences.proxy-tips') }}
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
      <div slot="footer" class="dialog-footer">
        <el-checkbox class="chk" v-model="showUpdateAdvanced">
          {{$t('task.show-advanced-options')}}
        </el-checkbox>
        <div class="dialog-footer-actions">
          <el-button @click="updateLinkDialogVisible = false">{{ $t('app.cancel') }}</el-button>
          <el-button type="primary" class="dialog-submit-btn" :loading="updateLinkSubmitting" @click="onUpdateLinkConfirm">{{ $t('app.submit') }}</el-button>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      custom-class="save-advanced-preset-dialog"
      width="400px"
      :visible.sync="savePresetDialogVisible"
      :append-to-body="true"
    >
      <div>
        <el-form label-position="left">
          <el-form-item :label="`${$t('task.preset-name')}: `" :label-width="formLabelWidth">
            <el-input v-model="savePresetName" />
          </el-form-item>
        </el-form>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button @click="savePresetDialogVisible=false">{{ $t('app.cancel') }}</el-button>
        <el-button type="primary" @click="saveAdvancedPreset">{{ $t('app.save') }}</el-button>
      </div>
    </el-dialog>
    <el-dialog
      :visible.sync="selectFilesDialogVisible"
      :title="$t('task.select-files')"
      width="600px"
      append-to-body
      :close-on-click-modal="false"
      custom-class="select-files-dialog"
    >
      <mo-task-files
        ref="selectFilesTable"
        mode="ADD"
        :files="selectFilesData"
        :height="360"
        @confirm-selection="onConfirmFileSelection"
      />
      <div slot="footer" class="dialog-footer">
        <el-button @click="selectFilesDialogVisible = false">{{ $t('app.cancel') }}</el-button>
        <el-button type="primary" @click="onConfirmFileSelection">{{ $t('app.save') }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import is from 'electron-is'
  import { createReadStream, existsSync } from 'node:fs'
  import { createHash } from 'node:crypto'
  import { isAbsolute, resolve, basename } from 'node:path'

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

  const taskActionsMap = {
    [TASK_STATUS.ACTIVE]: ['PAUSE', 'DELETE'],
    [TASK_STATUS.PAUSED]: ['RESUME', 'DELETE'],
    [TASK_STATUS.WAITING]: ['RESUME', 'DELETE'],
    [TASK_STATUS.ERROR]: ['RESTART', 'TRASH'],
    [TASK_STATUS.COMPLETE]: ['VERIFY', 'RESTART', 'TRASH'],
    [TASK_STATUS.REMOVED]: ['RESTART', 'TRASH'],
    [TASK_STATUS.SEEDING]: ['VERIFY', 'STOP', 'DELETE']
  }

  export default {
    name: 'mo-task-item-actions',
    components: {
      [TaskFiles.name]: TaskFiles
    },
    props: {
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
    },
    data () {
      return {
        formLabelWidth: '110px',
        verifyTriggerHover: false,
        verifyPanelHover: false,
        verifyPanelVisibleInternal: false,
        verifyHideTimer: null,
        verifyPlacementTop: false,
        updateLinkDialogVisible: false,
        updateLinkValue: '',
        showUpdateAdvanced: false,
        advancedPresets: [],
        selectedAdvancedPresetId: '',
        savePresetDialogVisible: false,
        savePresetName: '',
        updateHeadersUA: '',
        updateHeadersReferer: '',
        updateHeadersCookie: '',
        updateHeadersAuthorization: '',
        updateAllProxy: '',
        updateLinkSubmitting: false,
        selectFilesDialogVisible: false,
        selectFilesData: []
      }
    },
    computed: {
      ...mapState('preference', {
        noConfirmBeforeDelete: state => state.config.noConfirmBeforeDeleteTask,
        preferenceConfig: state => state.config
      }),
      ...mapState('task', {
        securityScanStatuses: state => state.taskSecurityScanStatuses || {},
        taskLinkUpdateHints: state => state.taskLinkUpdateHints || {},
        pendingFileSelection: state => state.pendingFileSelection || {}
      }),
      needUpdateLink () {
        const { task, taskLinkUpdateHints } = this
        const gid = task && task.gid ? `${task.gid}` : ''
        return !!(gid && taskLinkUpdateHints && taskLinkUpdateHints[gid])
      },
      verifyBarMode () {
        return this.needUpdateLink ? 'update-link' : 'verify'
      },
      verifyPanelVisible () {
        return this.verifyPanelVisibleInternal
      },
      updateLinkWarningTip () {
        const key = 'task.update-link-warning-tip'
        const v = this.$t(key)
        if (v && v !== key) {
          return v
        }
        return '更新链接后，若新链接指向不同文件，可能导致下载文件损坏。建议仅在确认是相同文件时使用'
      },
      verifyMenuItems () {
        return [
          { value: 'sha256', label: 'SHA-256' },
          { value: 'sha1', label: 'SHA-1' },
          { value: 'md5', label: 'MD5' },
          { value: 'sha512', label: 'SHA-512' },
          { value: 'size', label: this.$t('task.verify-by-size') }
        ]
      },
      taskName () {
        const task = this.task || {}
        const cfg = this.preferenceConfig || {}
        const suffix = cfg.downloadingFileSuffix || ''
        const { COMPLETE, ERROR, REMOVED } = TASK_STATUS
        const isStopped = [COMPLETE, ERROR, REMOVED].includes(task.status)
        if (isStopped) {
          try {
            const p = getTaskActualPath(task, cfg)
            const base = basename(p || '')
            if (base) {
              if (suffix && base.endsWith(suffix)) {
                return base.slice(0, -suffix.length)
              }
              return base
            }
          } catch (_) {}
        }
        return getTaskName(task)
      },
      path () {
        return getTaskActualPath(this.task, this.preferenceConfig)
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
      },
      taskCommonActions () {
        const { mode } = this
        const result = is.renderer() ? ['FOLDER'] : []

        switch (mode) {
        case 'LIST':
          result.push('LINK', 'INFO')
          break
        case 'DETAIL':
          result.push('LINK')
          break
        }

        return result
      },
      taskActions () {
        const { taskStatus, taskCommonActions, hasExistingTaskFile } = this
        const actions = taskActionsMap[taskStatus] || []
        const result = [...actions, ...taskCommonActions]
          .filter(action => (is.renderer() ? true : action !== 'VERIFY'))
          .filter(action => (action === 'VERIFY' ? hasExistingTaskFile : true))
          .reverse()
        return result
      },
      showVerifyBar () {
        if (this.needUpdateLink) {
          return true
        }
        const { taskActions, path } = this
        const canVerify = taskActions.includes('VERIFY')
        if (!canVerify) {
          return false
        }
        return !!(path && existsSync(path))
      },
      showSelectFilesBar () {
        const { task, pendingFileSelection } = this
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) return false
        return !!(pendingFileSelection && pendingFileSelection[gid])
      },
      verifyCanSlideOut () {
        const { path } = this
        return !!(path && existsSync(path))
      },
      hasExistingTaskFile () {
        const { task } = this
        const files = Array.isArray(task && task.files) ? task.files : []
        if (!files.length) return false
        return files.some(file => {
          const filePath = this.getActualFilePath(file && file.path ? file.path : '')
          return !!(filePath && existsSync(filePath))
        })
      },
      primaryActions () {
        const { taskActions, showVerifyBar } = this
        return taskActions.filter(action => action !== 'VERIFY' || !showVerifyBar)
      },
      securityScanStatus () {
        const { securityScanStatuses, task } = this
        if (!securityScanStatuses || !task || !task.gid) {
          return null
        }
        return securityScanStatuses[task.gid] || null
      },
      securityScanStatusText () {
        const scanStatus = this.securityScanStatus
        const status = scanStatus && scanStatus.status
        switch (status) {
        case 'running':
          return this.$t('task.security-scan-running')
        case 'success':
          return this.$t('task.security-scan-success')
        case 'failed':
          // quarantine-flag = macOS 外部来源文件警示，不是扫描失败
          if (scanStatus && scanStatus.reason === 'quarantine-flag') {
            return this.$t('task.security-scan-quarantine')
          }
          if (scanStatus && scanStatus.reason === 'virus-detected') {
            return this.$t('task.security-scan-virus')
          }
          return this.$t('task.security-scan-failed')
        case 'skipped':
          return this.$t('task.security-scan-skipped')
        default:
          return ''
        }
      }
    },
    methods: {
      getActionLabel (action) {
        const labelMap = {
          VERIFY: this.$t('task.verify-file'),
          PAUSE: this.$t('task.pause'),
          STOP: this.$t('task.stop'),
          RESUME: this.$t('task.resume'),
          RESTART: this.$t('task.restart'),
          DELETE: this.$t('task.delete'),
          TRASH: this.$t('task.trash'),
          FOLDER: this.$t('task.reveal-in-folder'),
          LINK: this.$t('task.copy-link'),
          INFO: this.$t('task.info')
        }
        return labelMap[action] || action
      },
      resolveTaskFilePath (filePath) {
        const { task } = this
        const dir = task && task.dir ? `${task.dir}` : ''
        const raw = filePath ? `${filePath}` : ''
        if (!raw) return ''
        if (isAbsolute(raw)) return resolve(raw)
        if (!dir) return resolve(raw)
        return resolve(dir, raw)
      },
      getActualFilePath (filePath) {
        const target = this.resolveTaskFilePath(filePath)
        if (!target) return target

        const config = this.preferenceConfig || {}
        const suffix = config.downloadingFileSuffix
        const candidates = getPathCandidates(target, suffix, config)

        for (const p of candidates) {
          if (existsSync(p)) {
            return p
          }
        }

        return target
      },
      calculateHash (filePath, algorithm) {
        return new Promise((resolve, reject) => {
          const hash = createHash(algorithm)
          const stream = createReadStream(filePath)
          stream.on('error', reject)
          stream.on('data', (chunk) => {
            hash.update(chunk)
          })
          stream.on('end', () => {
            resolve(hash.digest('hex'))
          })
        })
      },
      clearVerifyHideTimer () {
        if (this.verifyHideTimer) {
          clearTimeout(this.verifyHideTimer)
          this.verifyHideTimer = null
        }
      },
      ensureVerifyPanelVisible () {
        this.verifyPanelVisibleInternal = true
        this.$nextTick(() => {
          this.updateVerifyPlacement()
        })
      },
      updateVerifyPlacement () {
        const triggerRef = this.$refs.verifyTrigger
        const triggerEl = Array.isArray(triggerRef) ? triggerRef[0] : triggerRef
        if (!triggerEl || typeof window === 'undefined') {
          this.verifyPlacementTop = false
          return
        }
        const rect = triggerEl.getBoundingClientRect()
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
        const estimatedPanelHeight = 120
        const spaceBelow = viewportHeight - rect.bottom
        const spaceAbove = rect.top
        if (spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow) {
          this.verifyPlacementTop = true
        } else {
          this.verifyPlacementTop = false
        }
      },
      scheduleVerifyPanelHide () {
        this.clearVerifyHideTimer()
        if (this.verifyTriggerHover || this.verifyPanelHover) {
          return
        }
        this.verifyHideTimer = setTimeout(() => {
          if (this.verifyTriggerHover || this.verifyPanelHover) {
            return
          }
          this.verifyPanelVisibleInternal = false
        }, 120)
      },
      onVerifyTriggerEnter () {
        this.clearVerifyHideTimer()
        this.verifyTriggerHover = true
        this.ensureVerifyPanelVisible()
      },
      onVerifyTriggerLeave () {
        this.verifyTriggerHover = false
        this.scheduleVerifyPanelHide()
      },
      onVerifyPanelEnter () {
        this.clearVerifyHideTimer()
        this.verifyPanelHover = true
        this.ensureVerifyPanelVisible()
      },
      onVerifyPanelLeave () {
        this.verifyPanelHover = false
        this.scheduleVerifyPanelHide()
      },
      onVerifyDefaultClick () {
        this.onVerify('sha256')
      },
      onVerifyCommand (command) {
        this.onVerify(command)
      },
      async onVerifyClick () {
        this.onVerifyDefaultClick()
      },
      async onVerify (verifyType) {
        const { task, taskStatus } = this
        if (![TASK_STATUS.COMPLETE, TASK_STATUS.SEEDING].includes(taskStatus)) {
          return
        }

        const files = Array.isArray(task.files) ? task.files : []
        if (!files.length) {
          this.$msg.error(this.$t('task.verify-no-files'))
          return
        }

        this.$msg.info(this.$t('task.verify-start'))

        const missing = []
        const mismatched = []
        const resolvedFiles = []

        for (const file of files) {
          const filePath = this.getActualFilePath(file && file.path ? file.path : '')
          if (!filePath || !existsSync(filePath)) {
            missing.push(filePath || '')
            continue
          }
          resolvedFiles.push({ file, filePath })

          const expected = Number(file && file.length ? file.length : 0)
          if (expected > 0) {
            try {
              const { statSync } = require('node:fs')
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
          this.$msg.error(this.$t('task.verify-missing-files', { count: missing.length }))
          return
        }

        if (mismatched.length) {
          this.$msg.error(this.$t('task.verify-size-mismatch', { count: mismatched.length }))
          return
        }

        if (verifyType === 'size') {
          this.$msg.success(this.$t('task.verify-success-multi', { count: files.length }))
          return
        }

        const algorithm = typeof verifyType === 'string' && verifyType ? verifyType : 'sha256'
        const algorithmLabel = `${algorithm}`.toUpperCase()

        if (resolvedFiles.length === 1) {
          const singlePath = resolvedFiles[0].filePath
          try {
            const digest = await this.calculateHash(singlePath, algorithm)
            try {
              const { clipboard } = require('electron')
              clipboard.writeText(digest)
            } catch (_) {}
            this.$msg.success(this.$t('task.verify-success-hash', { algorithm: algorithmLabel, hash: digest }))
          } catch (_) {
            this.$msg.error(this.$t('task.verify-hash-fail', { algorithm: algorithmLabel }))
          }
          return
        }

        const lines = []
        try {
          for (const it of resolvedFiles) {
            const digest = await this.calculateHash(it.filePath, algorithm)
            const label = (it.file && it.file.path ? `${it.file.path}` : basename(it.filePath)).replace(/\\/g, '/')
            lines.push(`${digest}  ${label}`)
          }
        } catch (_) {
          this.$msg.error(this.$t('task.verify-hash-fail', { algorithm: algorithmLabel }))
          return
        }

        try {
          const { clipboard } = require('electron')
          clipboard.writeText(lines.join('\n'))
        } catch (_) {}

        this.$msg.success(this.$t('task.verify-success-hash-list', { algorithm: algorithmLabel, count: resolvedFiles.length }))
      },
      onResumeClick () {
        const { task, taskName } = this
        const gid = task && task.gid ? `${task.gid}` : ''
        if (gid && this.pendingFileSelection && this.pendingFileSelection[gid]) {
          this.$store.dispatch('task/clearPendingFileSelection', gid)
        }
        commands.emit('resume-task', {
          task,
          taskName
        })
      },
      onSelectFilesClick () {
        this.selectFilesDialogVisible = true
        const rawFiles = Array.isArray(this.task.files) ? this.task.files : []
        // 映射文件列表，确保包含 name/extension/idx 等字段（aria2 仅返回 path）
        this.selectFilesData = rawFiles.map((item, index) => {
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
        // 使用双 rAF 确保弹窗和表格完成渲染后再勾选
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const table = this.$refs.selectFilesTable
            if (!table) return
            const files = this.selectFilesData
            const selected = files.filter(f => f.selected)
            if (selected.length > 0) {
              table.toggleSelection(selected)
            } else {
              // 默认勾选全部文件
              table.toggleSelection(files)
            }
          })
        })
      },
      onConfirmFileSelection () {
        const table = this.$refs.selectFilesTable
        if (!table) return
        const fileIndex = table.selectedFileIndex
        if (fileIndex === NONE_SELECTED_FILES) {
          this.$msg.warning(this.$t('task.select-at-least-one'))
          return
        }
        const gid = this.task && this.task.gid ? `${this.task.gid}` : ''
        if (!gid) return
        const options = {
          selectFile: fileIndex !== SELECTED_ALL_FILES ? fileIndex : EMPTY_STRING
        }
        this.$store.dispatch('task/changeTaskOption', { gid, options }).then(() => {
          this.selectFilesDialogVisible = false
          this.$store.dispatch('task/clearPendingFileSelection', gid)
          const bt = this.task && this.task.bittorrent
          const infoHash = bt && bt.info && bt.info.hash ? `${bt.info.hash}` : ''
          this.$store.dispatch('task/confirmFileSelection', { gid, infoHash })
          return api.resumeTask({ gid })
        }).catch(() => {
          this.$store.dispatch('task/setPendingFileSelection', gid)
          this.$msg.error(this.$t('task.select-files-fail'))
        })
      },
      onRestartClick (event) {
        const { task, taskName } = this
        const { status } = task
        const showDialog = status === TASK_STATUS.COMPLETE || !!event.altKey
        commands.emit('restart-task', {
          task,
          taskName,
          showDialog
        })
      },
      onPauseClick () {
        const { task, taskName } = this
        commands.emit('pause-task', {
          task,
          taskName
        })
      },
      onStopClick () {
        if (!this.isSeeder) {
          return
        }

        const { task } = this
        commands.emit('stop-task-seeding', { task })
      },
      onDeleteClick (event) {
        const { task, taskName } = this
        const deleteWithFiles = !!event.shiftKey
        commands.emit('delete-task', {
          task,
          taskName,
          deleteWithFiles
        })
      },
      onTrashClick (event) {
        const { task, taskName } = this
        const deleteWithFiles = !!event.shiftKey
        commands.emit('delete-task-record', {
          task,
          taskName,
          deleteWithFiles
        })
      },
      onFolderClick () {
        const { path } = this
        commands.emit('reveal-in-folder', { path })
      },
      onLinkClick () {
        const { task } = this
        commands.emit('copy-task-link', { task })
      },
      onInfoClick () {
        const { task } = this
        commands.emit('show-task-info', { task })
      },
      onUpdateLinkClick () {
        this.updateLinkDialogVisible = true
      },
      async onUpdateLinkDialogOpen () {
        try {
          const cfg = this.preferenceConfig || {}
          const { advancedOptionPresets = [] } = cfg || {}
          this.advancedPresets = Array.isArray(advancedOptionPresets) ? advancedOptionPresets : []
        } catch (_) {
          this.advancedPresets = []
        }
        this.selectedAdvancedPresetId = ''
        this.showUpdateAdvanced = false

        const { task } = this
        const files = Array.isArray(task && task.files) ? task.files : []
        const first = files.length > 0 ? files[0] : null
        const uris = Array.isArray(first && first.uris)
          ? first.uris.map(u => u && u.uri ? `${u.uri}` : '').filter(Boolean)
          : []
        this.updateLinkValue = uris.length > 0 ? uris[0] : ''

        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) {
          this.updateHeadersUA = ''
          this.updateHeadersReferer = ''
          this.updateHeadersCookie = ''
          this.updateHeadersAuthorization = ''
          this.updateAllProxy = ''
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
          this.updateHeadersUA = map['user-agent'] || ''
          this.updateHeadersReferer = map.referer || ''
          this.updateHeadersCookie = map.cookie || ''
          this.updateHeadersAuthorization = map.authorization || ''
          this.updateAllProxy = (opt && (opt.allProxy || opt['all-proxy'])) ? `${opt.allProxy || opt['all-proxy']}` : ''
        } catch (e) {
          this.updateHeadersUA = ''
          this.updateHeadersReferer = ''
          this.updateHeadersCookie = ''
          this.updateHeadersAuthorization = ''
          this.updateAllProxy = ''
        }
      },
      async onUpdateLinkConfirm () {
        const { task } = this
        const newUri = `${this.updateLinkValue || ''}`.trim()
        if (!newUri) {
          this.$msg.error(this.$t('task.update-link-empty'))
          return
        }
        if (this.updateLinkSubmitting) {
          return
        }
        this.updateLinkSubmitting = true
        try {
          await this.$store.dispatch('task/updateTaskLink', {
            task,
            newUri,
            headersUA: this.updateHeadersUA,
            headersReferer: this.updateHeadersReferer,
            headersCookie: this.updateHeadersCookie,
            headersAuthorization: this.updateHeadersAuthorization,
            allProxy: this.updateAllProxy
          })
          this.$msg.success(this.$t('task.update-link-success'))
          this.updateLinkDialogVisible = false
          this.updateLinkValue = ''
          this.updateHeadersUA = ''
          this.updateHeadersReferer = ''
          this.updateHeadersCookie = ''
          this.updateHeadersAuthorization = ''
          this.updateAllProxy = ''
        } catch (e) {
          const code = e && e.message ? `${e.message}` : `${e}`
          if (/^HTTP_\d+$/.test(code)) {
            const httpCode = Number(code.replace('HTTP_', '')) || 0
            this.$msg.error(this.$t('task.update-link-http-fail', { code: httpCode || code }))
            return
          }
          const map = {
            INVALID_PAYLOAD: this.$t('task.update-link-fail'),
            NO_ORIGINAL_URI: this.$t('task.update-link-no-original'),
            LINK_MISMATCH: this.$t('task.update-link-mismatch'),
            CONTENT_LENGTH_MISMATCH: this.$t('task.update-link-mismatch'),
            UNABLE_TO_VERIFY: this.$t('task.update-link-unverifiable')
          }
          this.$msg.error(map[code] || (code ? `${this.$t('task.update-link-fail')}（${code}）` : this.$t('task.update-link-fail')))
        } finally {
          this.updateLinkSubmitting = false
        }
      },
      openSavePresetDialog () {
        const data = {
          userAgent: this.updateHeadersUA || '',
          authorization: this.updateHeadersAuthorization || '',
          referer: this.updateHeadersReferer || '',
          cookie: this.updateHeadersCookie || '',
          allProxy: this.updateAllProxy || ''
        }
        const allEmpty = [
          data.userAgent,
          data.authorization,
          data.referer,
          data.cookie,
          data.allProxy
        ].every(v => !v || !String(v).trim())
        if (allEmpty) {
          this.$msg.warning(this.$t('task.empty-advanced-options-tips'))
          return
        }
        this.savePresetName = ''
        this.savePresetDialogVisible = true
      },
      saveAdvancedPreset () {
        const name = (this.savePresetName || '').trim() || `Preset ${new Date().toLocaleString()}`
        const data = {
          userAgent: this.updateHeadersUA || '',
          authorization: this.updateHeadersAuthorization || '',
          referer: this.updateHeadersReferer || '',
          cookie: this.updateHeadersCookie || '',
          allProxy: this.updateAllProxy || '',
          newTaskShowDownloading: false
        }
        const preset = { id: Date.now().toString(), name, data }
        const next = [...(this.advancedPresets || []), preset]
        this.advancedPresets = next
        this.$store.dispatch('preference/save', { advancedOptionPresets: next })
        this.$msg.success(this.$t('task.save-preset-success'))
        this.savePresetDialogVisible = false
        this.selectedAdvancedPresetId = preset.id
      },
      onAdvancedPresetChange (id) {
        if (!id) {
          this.updateHeadersUA = ''
          this.updateHeadersAuthorization = ''
          this.updateHeadersReferer = ''
          this.updateHeadersCookie = ''
          this.updateAllProxy = ''
          return
        }
        const preset = (this.advancedPresets || []).find(p => p.id === id)
        if (!preset) return
        const d = preset.data || {}
        this.updateHeadersUA = d.userAgent || ''
        this.updateHeadersAuthorization = d.authorization || ''
        this.updateHeadersReferer = d.referer || ''
        this.updateHeadersCookie = d.cookie || ''
        this.updateAllProxy = d.allProxy || ''
        this.$msg.success(this.$t('task.apply-preset-success'))
      },
      deleteAdvancedPreset () {
        const id = this.selectedAdvancedPresetId
        if (!id) return
        const next = (this.advancedPresets || []).filter(p => p.id !== id)
        this.advancedPresets = next
        this.selectedAdvancedPresetId = ''
        this.onAdvancedPresetChange('')
        this.$store.dispatch('preference/save', { advancedOptionPresets: next })
        this.$msg.success(this.$t('task.delete-preset-success'))
      },
      updateAdvancedPreset () {
        const id = this.selectedAdvancedPresetId
        if (!id) return
        const presetIndex = (this.advancedPresets || []).findIndex(p => p.id === id)
        if (presetIndex === -1) return

        const data = {
          userAgent: this.updateHeadersUA || '',
          authorization: this.updateHeadersAuthorization || '',
          referer: this.updateHeadersReferer || '',
          cookie: this.updateHeadersCookie || '',
          allProxy: this.updateAllProxy || '',
          newTaskShowDownloading: false
        }

        const updatedPresets = [...this.advancedPresets]
        updatedPresets[presetIndex] = {
          ...updatedPresets[presetIndex],
          data
        }

        this.advancedPresets = updatedPresets
        this.$store.dispatch('preference/save', { advancedOptionPresets: updatedPresets })
        this.$msg.success(this.$t('task.update-preset-success'))
      },
      saveOrUpdateAdvancedPreset () {
        if (this.selectedAdvancedPresetId) {
          this.updateAdvancedPreset()
        } else {
          this.openSavePresetDialog()
        }
      }
    },
    beforeDestroy () {
      this.clearVerifyHideTimer()
    }
  }
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
  color: $--task-item-action-color;
  transition: $--all-transition, opacity 0.2s ease;
  /* 明确删除背景和边框 */
  background: none !important;
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  opacity: 0.6;
  &:hover {
    color: $--task-item-action-hover-color;
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

.verify-slide-enter {
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

.verify-panel-enter {
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
  border: 1px solid $--border-color-light;
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
  color: $--color-text-regular;
  white-space: nowrap;
  cursor: pointer;
}

.task-verify-panel__item:hover {
  background-color: $--color-primary;
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
    background-color: $--dk-popover-background;
    border-color: $--dk-popover-border-color;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
  }
  .task-verify-panel::before {
    border-color: transparent transparent $--dk-popover-background transparent;
  }
  .task-verify-panel--top::before {
    border-color: $--dk-popover-background transparent transparent transparent;
  }
  .task-verify-panel__item {
    color: $--dk-font-color-base;
  }
  .task-verify-panel__item:hover {
    background-color: $--color-primary;
    color: #fff;
  }
  .task-verify-dropdown-ref svg {
    opacity: 1;
  }
}
</style>
