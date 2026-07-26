<template>
  <el-dialog
    custom-class="tab-title-dialog add-task-dialog"
    width="50vw"
    :visible="visible"
    :top="dialogTop"
    :show-close="false"
    :before-close="beforeClose"
    append-to-body
    @open="handleOpen"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <el-form ref="taskForm" label-position="left" :model="form" :rules="rules">
      <el-form-item>
        <div class="add-task-primary-input-wrap">
          <button type="button" class="add-task-type-floating__close" aria-label="Close" @click="handleClose">
            <i class="el-icon-close"></i>
          </button>
          <div class="add-task-type-floating__bar">
            <div class="task-type-slider" role="group">
              <div class="task-type-slider-indicator" :style="taskTypeIndicatorStyle"></div>
              <el-radio-group :value="taskType" size="mini" @input="handleTaskTypeInput">
                <el-radio-button label="uri">{{ $t('task.uri-task') }}</el-radio-button>
                <el-radio-button label="torrent">{{ $t('task.torrent-task') }}</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <div v-show="taskType === 'uri'" class="add-task-content-pane">
            <el-input
              ref="uri"
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 5, maxRows: 8 }"

              :placeholder="$t('task.uri-task-tips')"
              @paste.native="handleUriPaste"
              v-model="form.uris"
            >
            </el-input>
          </div>
          <div v-show="taskType === 'torrent'" class="add-task-content-pane">
            <mo-select-torrent ref="selectTorrent" v-on:change="handleTorrentChange" />
          </div>
        </div>
      </el-form-item>
      <div class="parsed-preview" v-if="taskType === 'uri' && parsedTasks.length > 0">
          <div class="mo-table-wrapper">
            <el-table
              :data="parsedTasks"
              stripe
              class="mo-parsed-table"
              size="mini"
              :max-height="parsedTableMaxHeight"
            >
              <el-table-column :label="$t('task.task-name')" min-width="240">
                <template slot-scope="scope">
                  <el-tooltip v-if="!scope.row.editing" :content="$t('task.double-click-to-edit')" placement="top" :open-delay="300">
                    <span class="mo-parsed-text" @dblclick="enableNameEdit(scope.$index)">{{ scope.row.name }}</span>
                  </el-tooltip>
                  <el-input
                    v-else
                    size="mini"
                    v-model="scope.row.name"
                    @blur="disableNameEdit(scope.$index)"
                    @keyup.enter.native="disableNameEdit(scope.$index)"
                  />
                </template>
              </el-table-column>
              <el-table-column :label="$t('task.file-size')" min-width="120" align="right">
                <template slot-scope="scope">
                  <span>{{ scope.row.sizeText }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="isPriorityEngineEnabled" :label="$t('task.task-priority')" min-width="150" align="right">
                <template slot-scope="scope">
                  <el-input-number
                    size="mini"
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
            :label="`${$t('task.task-split')}: `"
            :label-width="formLabelWidth"
          >
            <el-input-number
              class="task-split-input"
              v-model="form.split"
              controls-position="right"
              :min="1"
              :max="config.engineMaxConnectionPerServer"
              :label="$t('task.task-split')"
            >
            </el-input-number>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item
        :label="`${$t('task.task-dir')}: `"
        :label-width="formLabelWidth"
      >
        <el-input
          placeholder=""
          v-model="form.dir"
          :readonly="isMas"
        >
          <mo-history-directory
            slot="prepend"
            @selected="handleHistoryDirectorySelected"
          />
          <mo-select-directory
            v-if="isRenderer"
            slot="append"
            @selected="handleNativeDirectorySelected"
          />
        </el-input>
      </el-form-item>
      <div class="task-advanced-options" v-if="showAdvanced">
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
        <el-form-item
          :label="`${$t('task.task-user-agent')}: `"
          :label-width="formLabelWidth"
        >
          <el-input
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 3 }"
            :placeholder="$t('task.task-user-agent')"
            v-model="form.userAgent"
          >
          </el-input>
        </el-form-item>
        <el-form-item
          :label="`${$t('task.task-authorization')}: `"
          :label-width="formLabelWidth"
        >
          <el-input
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 3 }"
            :placeholder="$t('task.task-authorization')"
            v-model="form.authorization"
          >
          </el-input>
        </el-form-item>
        <el-form-item
          :label="`${$t('task.task-referer')}: `"
          :label-width="formLabelWidth"
        >
          <el-input
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 3 }"
            :placeholder="$t('task.task-referer')"
            v-model="form.referer"
          >
          </el-input>
        </el-form-item>
        <el-form-item
          :label="`${$t('task.task-cookie')}: `"
          :label-width="formLabelWidth"
        >
          <el-input
            type="textarea"
            auto-complete="off"
            :autosize="{ minRows: 2, maxRows: 3 }"
            :placeholder="$t('task.task-cookie')"
            v-model="form.cookie"
          >
          </el-input>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="16" :xs="24">
            <el-form-item
              :label="`${$t('task.task-proxy')}: `"
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
                {{ $t('preferences.proxy-tips') }}
                <mo-icon name="link" width="12" height="12" />
              </a>
            </div>
          </el-col>
        </el-row>
        <el-form-item label="" :label-width="formLabelWidth" style="margin-top: 12px;">
          <el-checkbox class="chk" v-model="form.newTaskShowDownloading">
            {{$t('task.navigate-to-downloading')}}
          </el-checkbox>
        </el-form-item>
      </div>
  </el-form>
      <div slot="footer" class="dialog-footer">
        <el-checkbox class="chk" v-model="showAdvanced">
          {{$t('task.show-advanced-options')}}
        </el-checkbox>
        <el-button
          type="primary"
          class="dialog-submit-btn"
          @click="submitForm('taskForm')"
        >
          {{$t('app.submit')}}
        </el-button>
      </div>
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
  </el-dialog>
</template>

<script>
  import is from 'electron-is'
  import { mapState } from 'vuex'
  import { isEmpty } from 'lodash'
  import fetch from 'node-fetch'
  import HistoryDirectory from '@/components/Preference/HistoryDirectory'
  import SelectDirectory from '@/components/Native/SelectDirectory'
  import SelectTorrent from '@/components/Task/SelectTorrent'
  import {
    initTaskForm,
    buildUriPayload,
    buildTorrentPayload
  } from '@/utils/task'
  import { ADD_TASK_TYPE } from '@shared/constants'
  import { detectResource, splitTaskLinks, normalizeCookie, generateUniqueTaskName } from '@shared/utils'
  import '@/components/Icons/inbox'

  export default {
    name: 'mo-add-task',
    components: {
      [HistoryDirectory.name]: HistoryDirectory,
      [SelectDirectory.name]: SelectDirectory,
      [SelectTorrent.name]: SelectTorrent
    },
    props: {
      visible: {
        type: Boolean,
        default: false
      },
      type: {
        type: String,
        default: ADD_TASK_TYPE.URI
      }
    },
    data () {
      return {
        formLabelWidth: '110px',
        showAdvanced: false,
        form: {},
        rules: {},
        parsedTasks: [],
        lastDuplicateHistoryKey: '',
        keepTrailingNewline: false,
        advancedPresets: [],
        selectedAdvancedPresetId: '',
        savePresetDialogVisible: false,
        savePresetName: '',
        clipboardTimer: null,
        lastClipboardText: '',
        dialogOpenInitialized: false
      }
    },
    computed: {
      isRenderer: () => is.renderer(),
      isMas: () => is.mas(),
      ...mapState('app', {
        addTaskUrlFromStore: state => state.addTaskUrl
      }),
      ...mapState('task', {
        taskList: state => state.taskList
      }),
      ...mapState('preference', {
        config: state => state.config
      }),
      isPriorityEngineEnabled () {
        return !!(this.config && this.config.enablePriorityEngine)
      },
      taskType () {
        return this.type === 'video' ? ADD_TASK_TYPE.URI : this.type
      },
      taskTypeIndicatorStyle () {
        const idx = this.taskType === 'torrent' ? 1 : 0
        return {
          transform: `translateX(${idx * 100}%)`
        }
      },
      dialogTop () {
        const advancedVisible = this.showAdvanced
        return advancedVisible ? '8vh' : '15vh'
      },
      parsedTableMaxHeight () {
        const count = this.parsedTasks.length
        if (count === 0) return undefined
        const headerHeight = 40
        const rowHeight = 32
        const maxRows = 5
        const maxHeight = headerHeight + maxRows * rowHeight
        return Math.min(headerHeight + count * rowHeight, maxHeight)
      }
    },
    mounted () {
      if (this.visible && !this.dialogOpenInitialized) {
        this.handleOpen()
        this.$nextTick(() => {
          this.handleOpened()
        })
      }
    },
    watch: {
      taskType (current, previous) {
        if (this.visible && this.isUriLikeType(previous)) {
          return
        }

        if (this.isUriLikeType(current)) {
          setTimeout(() => {
            this.$refs.uri && this.$refs.uri.focus()
          }, 50)
        }
      },
      visible (current) {
        const cfg = this.config || {}
        const clipboardAutoPasteEnabled = cfg.clipboardAutoPaste === undefined ? true : !!cfg.clipboardAutoPaste
        if (current === true) {
          document.addEventListener('keydown', this.handleHotkey)
          if (clipboardAutoPasteEnabled) {
            this.startClipboardWatch()
          }
        } else {
          document.removeEventListener('keydown', this.handleHotkey)
          this.stopClipboardWatch()
        }
      },
      addTaskUrlFromStore (current, previous) {
        if (!this.visible) {
          return
        }
        this.applyUrlFromStore(current, previous)
      },
      'form.uris' (val) {
        if (this.isUriLikeType(this.taskType)) {
          this.updateUriPreview(val)
        }
      }
    },
    methods: {
      isUriLikeType (type) {
        return type === ADD_TASK_TYPE.URI
      },
      applyUrlFromStore (current, previous) {
        if (!this.isUriLikeType(this.taskType)) {
          return
        }
        const cur = (current || '').trim()
        const prev = (previous || '').trim()
        if (!cur || cur === prev) {
          return
        }
        const existing = (this.form.uris || '').trim()
        const lines = existing ? existing.split(/\r?\n/).filter(Boolean) : []
        if (!lines.includes(cur)) {
          const next = existing ? `${existing}\n${cur}` : cur
          this.keepTrailingNewline = true
          this.form.uris = next
        }
      },
      loadAdvancedPresets () {
        const { advancedOptionPresets = [] } = this.config || {}
        this.advancedPresets = Array.isArray(advancedOptionPresets) ? advancedOptionPresets : []
      },
      openSavePresetDialog () {
        const data = {
          userAgent: this.form.userAgent || '',
          authorization: this.form.authorization || '',
          referer: this.form.referer || '',
          cookie: this.form.cookie || '',
          allProxy: this.form.allProxy || '',
          newTaskShowDownloading: !!this.form.newTaskShowDownloading
        }
        const allEmpty = [
          data.userAgent,
          data.authorization,
          data.referer,
          data.cookie,
          data.allProxy
        ].every(v => !v || !String(v).trim()) && !data.newTaskShowDownloading
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
          userAgent: this.form.userAgent || '',
          authorization: this.form.authorization || '',
          referer: this.form.referer || '',
          cookie: this.form.cookie || '',
          allProxy: this.form.allProxy || '',
          newTaskShowDownloading: !!this.form.newTaskShowDownloading
        }
        const preset = { id: Date.now().toString(), name, data }
        const next = [...this.advancedPresets, preset]
        this.advancedPresets = next
        this.$store.dispatch('preference/save', { advancedOptionPresets: next })
        this.$msg.success(this.$t('task.save-preset-success'))
        this.savePresetDialogVisible = false
        this.selectedAdvancedPresetId = preset.id
      },
      onAdvancedPresetChange (id) {
        if (!id) {
          this.form.userAgent = ''
          this.form.authorization = ''
          this.form.referer = ''
          this.form.cookie = ''
          this.form.allProxy = ''
          this.form.newTaskShowDownloading = !!(this.config && this.config.newTaskShowDownloading)
          return
        }
        const preset = this.advancedPresets.find(p => p.id === id)
        if (!preset) return
        const d = preset.data || {}
        this.form.userAgent = d.userAgent || ''
        this.form.authorization = d.authorization || ''
        this.form.referer = d.referer || ''
        this.form.cookie = d.cookie || ''
        this.form.allProxy = d.allProxy || ''
        this.form.newTaskShowDownloading = !!d.newTaskShowDownloading
        this.$msg.success(this.$t('task.apply-preset-success'))
      },
      deleteAdvancedPreset () {
        const id = this.selectedAdvancedPresetId
        if (!id) return
        const next = this.advancedPresets.filter(p => p.id !== id)
        this.advancedPresets = next
        this.selectedAdvancedPresetId = ''
        this.onAdvancedPresetChange('')
        this.$store.dispatch('preference/save', { advancedOptionPresets: next })
        this.$msg.success(this.$t('task.delete-preset-success'))
      },
      updateAdvancedPreset () {
        const id = this.selectedAdvancedPresetId
        if (!id) return
        const presetIndex = this.advancedPresets.findIndex(p => p.id === id)
        if (presetIndex === -1) return

        const data = {
          userAgent: this.form.userAgent || '',
          authorization: this.form.authorization || '',
          referer: this.form.referer || '',
          cookie: this.form.cookie || '',
          allProxy: this.form.allProxy || '',
          newTaskShowDownloading: !!this.form.newTaskShowDownloading
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
      },
      async autofillResourceLink () {
        try {
          const { clipboard } = require('electron')
          const content = clipboard.readText()
          const text = (content || '').trim()
          if (!text) {
            return
          }
          this.lastClipboardText = text

          if (isEmpty(this.form.uris)) {
            const hasResource = detectResource(text)
            if (!hasResource) {
              return
            }
            this.form.uris = text
            this.updateUriPreview(this.form.uris)
            this.keepTrailingNewline = true
            this.ensureTrailingNewlineAndCaret()
          }
        } catch (e) {
        }
      },
      startClipboardWatch () {
        if (this.clipboardTimer) {
          return
        }
        try {
          const { clipboard } = require('electron')
          const checkClipboard = () => {
            if (!this.visible) {
              return
            }
            if (!this.isUriLikeType(this.taskType)) {
              return
            }
            const content = clipboard.readText()
            const text = (content || '').trim()
            if (!text) {
              return
            }
            if (text === this.lastClipboardText) {
              return
            }
            this.lastClipboardText = text
            const hasResource = detectResource(text)
            if (!hasResource) {
              return
            }
            const existing = (this.form.uris || '').trim()
            if (!existing) {
              this.form.uris = text
            } else {
              const lines = existing.split(/\r?\n/).filter(Boolean)
              if (lines.includes(text)) {
                return
              }
              this.form.uris = `${existing}\n${text}`
            }
            this.updateUriPreview(this.form.uris)
            this.keepTrailingNewline = true
            this.ensureTrailingNewlineAndCaret()
          }
          this.clipboardTimer = setInterval(checkClipboard, 1000)
        } catch (e) {
        }
      },
      stopClipboardWatch () {
        if (this.clipboardTimer) {
          clearInterval(this.clipboardTimer)
          this.clipboardTimer = null
        }
      },
      beforeClose () {
        if (isEmpty(this.form.uris) && isEmpty(this.form.torrent)) {
          this.handleClose()
        }
      },
      handleOpen () {
        this.dialogOpenInitialized = true
        this.form = initTaskForm(this.$store.state)
        this.selectedAdvancedPresetId = ''
        this.onAdvancedPresetChange('')
        this.loadAdvancedPresets()
        if (this.isUriLikeType(this.taskType)) {
          if (this.addTaskUrlFromStore) {
            this.applyUrlFromStore(this.addTaskUrlFromStore, '')
          }
          if (!isEmpty(this.form.uris)) {
            this.updateUriPreview(this.form.uris)
            this.keepTrailingNewline = true
            this.ensureTrailingNewlineAndCaret()
          }
          const cfg = this.config || {}
          const clipboardAutoPasteEnabled = cfg.clipboardAutoPaste === undefined ? true : !!cfg.clipboardAutoPaste
          if (clipboardAutoPasteEnabled) {
            this.autofillResourceLink()
          }
          setTimeout(() => {
            this.$refs.uri && this.$refs.uri.focus()
          }, 50)
        }
      },
      handleOpened () {
        this.detectThunderResource(this.form.uris)
      },
      handleClose () {
        this.$store.dispatch('app/hideAddTaskDialog')
      },
      handleClosed () {
        this.dialogOpenInitialized = false
        this.reset()
      },
      handleHotkey (event) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()

          this.submitForm('taskForm')
        }
      },
      handleTabClick (tab) {
        this.$store.dispatch('app/changeAddTaskType', tab.name)
      },
      handleTaskTypeInput (type) {
        this.$store.dispatch('app/changeAddTaskType', type)
      },
      handleUriPaste (event) {
        setImmediate(() => {
          const uris = this.$refs.uri.value
          this.detectThunderResource(uris)
          this.updateUriPreview(uris)
          this.keepTrailingNewline = true
          this.ensureTrailingNewlineAndCaret()
        })
      },
      ensureTrailingNewlineAndCaret () {
        let uris = this.$refs.uri && (this.$refs.uri.value || (this.$refs.uri.$refs && this.$refs.uri.$refs.textarea && this.$refs.uri.$refs.textarea.value))
        if (!uris) return
        if (!/\n$/.test(uris)) {
          uris = uris.replace(/\s+$/, '') + '\n'
          this.form.uris = uris
        }
        this.$nextTick(() => {
          const textarea = this.$refs.uri && this.$refs.uri.$refs && this.$refs.uri.$refs.textarea
          if (textarea) {
            const end = this.form.uris.length
            textarea.selectionStart = end
            textarea.selectionEnd = end
          }
          this.keepTrailingNewline = false
        })
      },
      detectThunderResource (uris = '') {
        if (uris.includes('thunder://')) {
          this.$msg({
            type: 'warning',
            message: this.$t('task.thunder-link-tips'),
            duration: 6000
          })
        }
      },
      handleTorrentChange (torrent, selectedFileIndex, files) {
        this.form.torrent = torrent
        this.form.selectFile = selectedFileIndex
        if (Array.isArray(files) && files.length > 0) {
          this.parsedTasks = files.map(f => {
            const size = (typeof f.length === 'number') ? f.length : (typeof f.size === 'number' ? f.size : 0)
            return { name: f.path || f.name, sizeText: this.bytesToSize(size) }
          })
        } else {
          this.updateTorrentPreview()
        }
      },
      handleHistoryDirectorySelected (dir) {
        this.form.dir = dir
      },
      handleNativeDirectorySelected (dir) {
        this.form.dir = dir
        this.$store.dispatch('preference/recordHistoryDirectory', dir)
      },
      reset () {
        this.showAdvanced = false
        this.form = initTaskForm(this.$store.state)
        this.parsedTasks = []
        this.lastDuplicateHistoryKey = ''
        this._historyUrlSet = null
        this.selectedAdvancedPresetId = ''
        this.savePresetDialogVisible = false
        this.savePresetName = ''
      },
      enableNameEdit (idx) {
        if (this.parsedTasks[idx]) {
          this.$set(this.parsedTasks[idx], 'editing', true)
        }
      },
      disableNameEdit (idx) {
        const task = this.parsedTasks[idx]
        if (!task) return
        this.$set(task, 'editing', false)
        const originalName = task.originalName || task.name || ''
        if (!task.originalName && originalName) {
          this.$set(task, 'originalName', originalName)
        }
        const currentName = task.name || ''
        const renamed = originalName && currentName && currentName !== originalName
        this.$set(task, 'renamed', !!renamed)
      },
      async updateUriPreview (uris = '') {
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
          this.form.uris = joined
          if (removed > 0) {
            this.$msg.info(this.$t('task.remove-duplicate-links-message', { count: removed }))
          }
        }

        // 保留已存在 URL 的优先值和其他属性
        const existingMap = new Map()
        for (const task of this.parsedTasks) {
          if (task.url) {
            existingMap.set(task.url, task)
          }
        }

        // 如果只有一个 URL 且 form.out 存在（从浏览器扩展传入的建议文件名），使用它
        const suggestedName = lines.length === 1 && this.form.out && typeof this.form.out === 'string' && this.form.out.trim()
          ? this.form.out.trim()
          : null

        // 使用建议文件名后立即清空，避免影响后续操作
        if (suggestedName) {
          this.form.out = ''
        }

        const items = lines.map((u, i) => {
          // 如果有建议的文件名，即使 URL 已存在也要使用新的建议文件名
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
              // 使用建议的文件名并确保唯一
              const uniqueName = this.generateUniqueTaskName(suggestedName)
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
              const uniqueName = this.generateUniqueTaskName(suggestedName)
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

          // 检查是否已存在该 URL，保留其优先值和其他属性
          const existing = existingMap.get(u)
          if (existing) {
            const originalName = existing.originalName || existing.name || ''
            const uniqueName = this.generateUniqueTaskName(existing.name)
            return {
              ...existing,
              name: uniqueName,
              originalName,
              renamed: uniqueName !== existing.name,
              order: i
            }
          }

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
            // 使用建议的文件名（如果存在）并确保唯一
            const finalName = suggestedName || name
            const uniqueName = this.generateUniqueTaskName(finalName)
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
            const uniqueName = this.generateUniqueTaskName(finalName)
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
        this.parsedTasks = items

        // 只对新增的 URL 获取文件大小
        const newLines = lines.filter(u => !existingMap.has(u))
        if (newLines.length > 0) {
          await this.fetchUriSizes(lines)
        }

        if (this.keepTrailingNewline && lines.length > 0) {
          this.ensureTrailingNewlineAndCaret()
        }
      },
      openVideoPreference () {
        this.$router.push({ path: '/preference/video' }).catch(() => {})
      },
      async fetchUriSizes (lines = []) {
        const buildHeaders = () => {
          const h = {}
          if (this.form.userAgent) h['User-Agent'] = this.form.userAgent
          if (this.form.referer) h.Referer = this.form.referer
          if (this.form.cookie) {
            const cookie = normalizeCookie(this.form.cookie)
            if (cookie) {
              h.Cookie = cookie
            }
          }
          if (this.form.authorization) h.Authorization = this.form.authorization
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
            return { idx, sizeText: '-', dispName: null }
          }
          const headers = buildHeaders()
          try {
            let res = await fetch(u, { method: 'HEAD', headers })
            let len = res.headers.get('content-length')
            let disp = parseDisposition(res.headers.get('content-disposition'))
            if (!len || len === '0') {
              try {
                res = await fetch(u, { method: 'GET', headers: { ...headers, Range: 'bytes=0-0' } })
                const cr = res.headers.get('content-range')
                if (cr) {
                  const m = /\/(\d+)$/i.exec(cr)
                  if (m && m[1]) len = m[1]
                }
                if (!disp) disp = parseDisposition(res.headers.get('content-disposition'))
              } catch (_) {}
            }
            const sizeText = len ? this.bytesToSize(parseInt(len, 10)) : '-'
            return { idx, sizeText, dispName: disp }
          } catch (_) {
            return { idx, sizeText: '-', dispName: null }
          }
        }))
        updates.forEach(({ idx, sizeText, dispName }) => {
          if (this.parsedTasks[idx]) {
            this.$set(this.parsedTasks[idx], 'sizeText', sizeText)
            if (dispName) {
              this.$set(this.parsedTasks[idx], 'name', dispName)
            }
          }
        })
      },
      updateTorrentPreview () {
        // For torrent tasks, try to read files from child component if available
        const selectComp = this.$refs && this.$refs.selectTorrent
        let items = []
        if (selectComp && Array.isArray(selectComp.files) && selectComp.files.length > 0) {
          items = selectComp.files.map(f => {
            const size = (typeof f.length === 'number') ? f.length : (typeof f.size === 'number' ? f.size : 0)
            return { name: f.path || f.name, sizeText: this.bytesToSize(size), editing: false }
          })
        }
        this.parsedTasks = items
      },

      bytesToSize (n) {
        if (!n || n <= 0) return '-'
        const units = ['B', 'KB', 'MB', 'GB', 'TB']
        let i = 0
        let val = n
        while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
        return `${val.toFixed(1)} ${units[i]}`
      },
      generateUniqueTaskName (name) {
        const taskList = this.taskList || []
        const existingNames = new Set(taskList.map(t => t.name))
        return generateUniqueTaskName(name, existingNames)
      },
      async addTask (type, form) {
        let payload = null
        if (this.isUriLikeType(type)) {
          // 获取自动分类配置
          const autoCategorizeFiles = this.config.autoCategorizeFiles || false
          const fileCategories = this.config.fileCategories || null

          payload = await buildUriPayload(form, autoCategorizeFiles, fileCategories)
          this.$store.dispatch('task/addUri', payload).catch(err => {
            this.$msg.error(err.message)
          })
        } else if (type === ADD_TASK_TYPE.TORRENT) {
          payload = buildTorrentPayload(form)
          this.$store.dispatch('task/addTorrent', payload).catch(err => {
            this.$msg.error(err.message)
          })
        } else if (type === 'metalink') {
        // @TODO addMetalink
        } else {
          console.error('[Motrix] Add task fail', form)
        }
      },
      async submitForm (formName) {
        const valid = await new Promise(resolve => {
          this.$refs[formName].validate(v => resolve(v))
        })
        if (!valid) {
          return
        }

        try {
          if (this.isUriLikeType(this.taskType) && this.parsedTasks.length > 0) {
            const buckets = {}
            const prios = []
            this.parsedTasks.forEach(item => {
              const p = Number(item.priority) || 0
              if (!buckets[p]) {
                buckets[p] = []
                prios.push(p)
              }
              buckets[p].push(item)
            })
            prios.sort((a, b) => b - a)
            const ordered = []
            let remaining = this.parsedTasks.length
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
            this.form.customOuts = ordered.map(i => i.name)
            const urisOrdered = ordered.map(i => i.url)
            this.form.uris = urisOrdered.join('\n')
            this.form.priorities = ordered.map(i => Number(i.priority) || 0)
          }
          await this.addTask(this.taskType, this.form)

          this.$store.dispatch('app/hideAddTaskDialog')
          if (this.form.newTaskShowDownloading) {
            const config = this.config || {}
            const jumpTarget = this.form.newTaskJumpTarget || config.newTaskJumpTarget || 'downloading'
            const status = jumpTarget === 'all' ? 'all' : 'active'
            this.$router.push({
              path: `/task/${status}`
            }).catch(err => {
              console.log(err)
            })
          }
        } catch (err) {
          this.$msg.error(this.$t(err.message))
        }
      }
    }
  }
</script>

<style lang="scss">
.add-task-primary-input-wrap {
  position: relative;
  padding-top: 38px;
  padding-bottom: 0;

  .add-task-content-pane {
    min-height: 136px;
  }

  .el-textarea__inner,
  .el-upload-dragger {
    border-radius: 12px !important;
    background: transparent !important;
  }

  .el-textarea__inner {
    padding-left: 12px;
    min-height: 144px;
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

.task-type-slider {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: none;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.05);

  .task-type-slider-indicator {
    position: absolute;
    top: 2px;
    left: 2px;
    width: calc(50% - 2px);
    height: calc(100% - 4px);
    background: $--color-primary;
    border-radius: 8px;
    transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 0;
    pointer-events: none;
  }

  .el-radio-group {
    display: flex;
    width: 100%;
    position: relative;
    z-index: 1;
  }

  .el-radio-button {
    flex: 1;
    display: flex;
    .el-radio-button__inner {
      position: relative;
      z-index: 1;
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      padding: 5px 20px;
        font-size: 13px;
        font-weight: 500;
      background: transparent !important;
      border: none !important;
      border-radius: 8px;
      box-shadow: none !important;
      color: $--color-text-secondary;
      transition: color 0.32s ease;
    }

    .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      color: #fff;
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }

    &.is-active .el-radio-button__inner {
      color: #fff;
      background: transparent !important;
      box-shadow: none !important;
    }
  }
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

  .el-button {
    border-radius: 8px;
  }

  .el-dialog__header {
    display: none;
  }

  /* 确保弹窗遮罩层有正确的背景色 */
  :deep(.el-dialog__wrapper) {
    background: rgba(0, 0, 0, 0.5);
  }
.parsed-preview {
    margin-top: -18px;
    margin-bottom: 16px;
    .mo-table-wrapper {
      border: 1px solid $--border-color-base;
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
  .el-dialog__footer {
    padding: 0;
    background-color: transparent;
    border-radius: 0;
  }
  .dialog-footer {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 52px;
    padding-left: 20px;
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
  }
  .dialog-submit-btn {
    position: absolute;
    right: 12px;
    bottom: 10px;
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
    gap: 6px;
    flex-wrap: nowrap;
  }
}

.theme-dark .add-task-dialog .parsed-preview {
  .mo-table-wrapper {
    border-color: #5f5f5f;
  }
  .el-table.mo-parsed-table {
    th.el-table__cell {
      background-color: transparent !important;
    }
    .el-table__header-wrapper {
      background-color: transparent !important;
    }
    thead {
      background-color: transparent !important;
    }
  }
}

.theme-dark .task-type-slider {
  background: rgba(255, 255, 255, 0.06);

  .el-radio-button {
    .el-radio-button__inner {
      color: rgba(255, 255, 255, 0.55);
    }

    &.is-active .el-radio-button__inner {
      color: #fff;
    }
  }
}
</style>
