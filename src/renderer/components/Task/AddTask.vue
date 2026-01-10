<template>
  <el-dialog
    custom-class="tab-title-dialog add-task-dialog"
    width="67vw"
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
      <template v-if="type === 'uri' || type === 'video'">
        <el-form-item>
          <div class="add-task-primary-input-wrap">
            <button type="button" class="add-task-type-floating__close" aria-label="Close" @click="handleClose">
              <i class="el-icon-close"></i>
            </button>
            <div class="add-task-type-floating__bar">
              <el-radio-group :value="type" size="mini" @input="handleTaskTypeInput">
                <el-radio-button label="uri">{{ $t('task.uri-task') }}</el-radio-button>
                <el-radio-button label="video">{{ $t('task.video-task') }}</el-radio-button>
                <el-radio-button label="torrent">{{ $t('task.torrent-task') }}</el-radio-button>
              </el-radio-group>
            </div>
            <el-input
              ref="uri"
              type="textarea"
              auto-complete="off"
              :autosize="{ minRows: 3, maxRows: 5 }"
              :placeholder="type === 'video' ? $t('task.video-task-tips') : $t('task.uri-task-tips')"
              @paste.native="handleUriPaste"
              v-model="form.uris"
            >
            </el-input>
          </div>
        </el-form-item>
        <div
          class="video-preview"
          v-if="type === 'video' && (videoPreviewLoading || videoPreviewError || videoMeta || (videoQualities && videoQualities.length > 0) || videoCollection)"
        >
          <div class="video-preview__status" v-if="videoPreviewLoading">{{ $t('task.video-parsing') }}</div>
          <div class="video-preview__error" v-else-if="videoPreviewError">{{ $t('task.video-parse-failed') }}：{{ videoPreviewError }}</div>
          <div class="video-preview__meta" v-else-if="videoMeta">
            <div class="video-preview__meta-item video-preview__quality-item" v-if="videoQualities.length > 0 || videoCollection">
              <el-select
                ref="videoQualitySelect"
                class="video-quality-select video-quality-select--text"
                v-model="form.videoQn"
                :placeholder="$t('task.video-quality-placeholder')"
                :disabled="videoPreviewLoading || videoQualities.length === 0"
                @change="handleVideoQnChange"
              >
                <el-option
                  v-for="q in videoQualities"
                  :key="q.value"
                  :label="q.label"
                  :value="q.value"
                />
              </el-select>
              <el-select
                class="video-format-select"
                v-model="form.videoFormat"
                :placeholder="$t('task.video-format-placeholder')"
                :disabled="videoPreviewLoading"
                v-if="videoQualities.length > 0 || videoCollection"
              >
                <el-option
                  v-for="f in videoFormats"
                  :key="f.value"
                  :label="f.label"
                  :value="f.value"
                />
              </el-select>
            </div>
            <div class="video-preview__meta-item">
              <span class="video-preview__meta-label">{{ $t('task.video-info-title') }}：</span>
              <el-tooltip :content="videoMeta.title" placement="top" :open-delay="300" :disabled="!videoTitleOverflow">
                <span ref="videoMetaTitle" class="video-preview__meta-value video-preview__meta-value--fade">{{ videoMeta.title }}</span>
              </el-tooltip>
            </div>
            <div class="video-preview__meta-item" v-if="videoMeta.owner">
              <span class="video-preview__meta-label">{{ $t('task.video-info-owner') }}：</span>
              <el-tooltip :content="videoMeta.owner" placement="top" :open-delay="300" :disabled="!videoOwnerOverflow">
                <span ref="videoMetaOwner" class="video-preview__meta-value video-preview__meta-value--fade">{{ videoMeta.owner }}</span>
              </el-tooltip>
            </div>
            <div class="video-preview__meta-item" v-if="videoMeta.durationText">
              <span class="video-preview__meta-label">{{ $t('task.video-info-duration') }}：</span>
              <el-tooltip :content="videoMeta.durationText" placement="top" :open-delay="300" :disabled="!videoDurationOverflow">
                <span ref="videoMetaDuration" class="video-preview__meta-value video-preview__meta-value--fade">{{ videoMeta.durationText }}</span>
              </el-tooltip>
            </div>
            <div class="video-preview__meta-item" v-if="videoMeta.sizeText">
              <span class="video-preview__meta-label">{{ $t('task.video-info-size') }}：</span>
              <el-tooltip :content="videoMeta.sizeText" placement="top" :open-delay="300" :disabled="!videoSizeOverflow">
                <span ref="videoMetaSize" class="video-preview__meta-value video-preview__meta-value--fade">{{ videoMeta.sizeText }}</span>
              </el-tooltip>
            </div>
          </div>
          <div class="video-collection-selector" v-if="videoCollection">
            <div class="video-collection-selector__header">
              <span class="video-collection-selector__header-title">{{ $t('task.collection-videos') }} ({{ videoCollection.total_videos }})</span>
              <el-button size="mini" style="margin-left: 16px;" @click="toggleSelectAll">
                {{ isAllSelected ? $t('task.deselect-all') : $t('task.select-all') }}
              </el-button>
            </div>
            <div class="video-collection-selector__list">
              <div
                v-for="video in videoCollection.videos"
                :key="video.index"
                class="video-collection-selector__item"
                :class="{ 'is-selected': isVideoSelected(video) }"
                @click="toggleVideoSelection(video)"
              >
                <el-checkbox
                  :value="isVideoSelected(video)"
                  @click.native.prevent
                ></el-checkbox>
                <span class="video-collection-selector__item-index">{{ video.index }}.</span>
                <span class="video-collection-selector__item-title">{{ video.title }}</span>
                <span class="video-collection-selector__item-duration">{{ video.duration_text }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="parsed-preview" v-if="taskType !== 'video' && parsedTasks.length > 0">
          <div class="parsed-preview__header">{{ $t('task.parsed-tasks') }}</div>
          <el-table :data="parsedTasks" :border="false" :stripe="true" size="mini" style="width: 100%" height="150">
            <el-table-column :label="$t('task.task-name')" min-width="240">
              <template slot-scope="scope">
                <el-tooltip v-if="!scope.row.editing" :content="$t('task.double-click-to-edit')" placement="top" :open-delay="300">
                  <span @dblclick="enableNameEdit(scope.$index)">{{ scope.row.name }}</span>
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
            <el-table-column :label="$t('task.file-size')" min-width="120">
              <template slot-scope="scope">
                <span>{{ scope.row.sizeText }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="isPriorityEngineEnabled" :label="$t('task.task-priority')" min-width="150">
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
      </template>
      <template v-else-if="type === 'torrent'">
        <el-form-item>
          <div class="add-task-primary-input-wrap">
            <button type="button" class="add-task-type-floating__close" aria-label="Close" @click="handleClose">
              <i class="el-icon-close"></i>
            </button>
            <div class="add-task-type-floating__bar">
              <el-radio-group :value="type" size="mini" @input="handleTaskTypeInput">
                <el-radio-button label="uri">{{ $t('task.uri-task') }}</el-radio-button>
                <el-radio-button label="video">{{ $t('task.video-task') }}</el-radio-button>
                <el-radio-button label="torrent">{{ $t('task.torrent-task') }}</el-radio-button>
              </el-radio-group>
            </div>
            <mo-select-torrent ref="selectTorrent" v-on:change="handleTorrentChange" />
          </div>
        </el-form-item>
      </template>
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
        <el-row>
          <el-col :span="12" :xs="12">
            <el-checkbox class="chk" v-model="showAdvanced">
            {{$t('task.show-advanced-options')}}
          </el-checkbox>
        </el-col>
        <el-col :span="12" :xs="12" style="text-align: right;">
          <el-button
            type="primary"
            @click="submitForm('taskForm')"
          >
            {{$t('app.submit')}}
          </el-button>
        </el-col>
      </el-row>
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
    buildTorrentPayload,
    resolveBilibiliResources,
    isBilibiliUrl
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
        videoPreviewLoading: false,
        videoPreviewError: '',
        videoMeta: null,
        videoQualities: [],
        videoCollection: null,
        selectedVideos: [],
        videoPreviewTimer: null,
        videoTitleOverflow: false,
        videoOwnerOverflow: false,
        videoDurationOverflow: false,
        videoSizeOverflow: false,
        advancedPresets: [],
        selectedAdvancedPresetId: '',
        savePresetDialogVisible: false,
        savePresetName: '',
        clipboardTimer: null,
        lastClipboardText: '',
        videoFormats: [
          { value: 'mp4', label: 'MP4' },
          { value: 'mkv', label: 'MKV' },
          { value: 'mov', label: 'MOV' },
          { value: 'm4v', label: 'M4V' },
          { value: 'flv', label: 'FLV' },
          { value: 'ts', label: 'TS' }
        ]
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
        return this.type
      },
      dialogTop () {
        const advancedVisible = this.showAdvanced
        return advancedVisible ? '8vh' : '15vh'
      },
      isAllSelected () {
        if (!this.videoCollection || !Array.isArray(this.videoCollection.videos)) {
          return false
        }
        return this.videoCollection.videos.length > 0 &&
          this.videoCollection.videos.every(video => this.selectedVideos.includes(video.index))
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
        if (this.taskType === 'video') {
          this.scheduleVideoPreview(val)
        }
      }
    },
    methods: {
      isUriLikeType (type) {
        return type === ADD_TASK_TYPE.URI || type === 'video'
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
        if (isBilibiliUrl(cur) && this.taskType !== 'video') {
          this.$store.dispatch('app/changeAddTaskType', 'video')
          setTimeout(() => {
            if (this.taskType === 'video') {
              this.scheduleVideoPreview(this.form.uris || cur)
            }
          }, 0)
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

          if (isBilibiliUrl(text) && this.taskType !== 'video') {
            this.$store.dispatch('app/changeAddTaskType', 'video')
            this.scheduleVideoPreview(this.form.uris || text)
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
            if (isBilibiliUrl(text) && this.taskType !== 'video') {
              this.$store.dispatch('app/changeAddTaskType', 'video')
              this.scheduleVideoPreview(this.form.uris || text)
            }
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
        this.form = initTaskForm(this.$store.state)
        this.selectedAdvancedPresetId = ''
        this.onAdvancedPresetChange('')
        this.loadAdvancedPresets()
        if (this.isUriLikeType(this.taskType)) {
          if (this.addTaskUrlFromStore) {
            this.applyUrlFromStore(this.addTaskUrlFromStore, '')
          }
          const rawUris = this.form.uris || ''
          if (rawUris && this.taskType !== 'video') {
            const firstUrl = rawUris.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || ''
            if (firstUrl && isBilibiliUrl(firstUrl)) {
              this.$store.dispatch('app/changeAddTaskType', 'video')
              setTimeout(() => {
                if (this.taskType === 'video') {
                  const cfg = this.config || {}
                  if (!this.form.cookie && cfg.videoCookie) {
                    this.form.cookie = `${cfg.videoCookie}`
                  }
                  if (this.form.videoQn === undefined) {
                    this.$set(this.form, 'videoQn', cfg.videoPreferredQn !== undefined ? cfg.videoPreferredQn : '')
                  }
                  this.scheduleVideoPreview(this.form.uris || firstUrl)
                }
              }, 0)
            }
          }
          if (this.taskType === 'video') {
            const cfg = this.config || {}
            if (!this.form.cookie && cfg.videoCookie) {
              this.form.cookie = `${cfg.videoCookie}`
            }
            if (this.form.videoQn === undefined) {
              this.$set(this.form, 'videoQn', cfg.videoPreferredQn !== undefined ? cfg.videoPreferredQn : '')
            }
            this.scheduleVideoPreview(this.form.uris || '')
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
        this.$store.dispatch('app/updateAddTaskOptions', {})
      },
      handleClosed () {
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
        this.videoPreviewLoading = false
        this.videoPreviewError = ''
        this.videoMeta = null
        this.videoQualities = []
        if (this.videoPreviewTimer) {
          clearTimeout(this.videoPreviewTimer)
        }
        this.videoPreviewTimer = null
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
      handleVideoQnChange () {
        this.scheduleVideoPreview(this.form.uris || '')
      },
      selectAllVideos () {
        if (!this.videoCollection || !Array.isArray(this.videoCollection.videos)) {
          return
        }
        this.selectedVideos = this.videoCollection.videos.map(video => video.index)
      },
      deselectAllVideos () {
        this.selectedVideos = []
      },
      toggleSelectAll () {
        if (this.isAllSelected) {
          this.deselectAllVideos()
        } else {
          this.selectAllVideos()
        }
      },
      isVideoSelected (video) {
        return this.selectedVideos.includes(video.index)
      },
      toggleVideoSelection (video) {
        if (this.isVideoSelected(video)) {
          this.selectedVideos = this.selectedVideos.filter(index => index !== video.index)
        } else {
          this.selectedVideos = [...this.selectedVideos, video.index]
        }
      },
      ensureVideoFormatDefault () {
        const current = this.form && this.form.videoFormat
        if (current === undefined || current === null || `${current}`.trim() === '') {
          const cfg = this.config || {}
          const pref = cfg.videoPreferredFormat
          const allowed = ['mp4', 'mkv', 'mov', 'm4v', 'flv', 'ts']
          let next = 'mp4'
          if (pref && `${pref}`.trim()) {
            const lower = `${pref}`.trim().toLowerCase()
            if (allowed.includes(lower)) {
              next = lower
            }
          }
          this.$set(this.form, 'videoFormat', next)
        }
      },
      scheduleVideoPreview (uris = '') {
        if (this.taskType !== 'video') {
          return
        }
        if (this.videoPreviewTimer) {
          clearTimeout(this.videoPreviewTimer)
        }
        this.videoPreviewTimer = setTimeout(() => {
          this.updateVideoPreview(uris)
        }, 400)
      },
      async updateVideoPreview (uris = '') {
        if (this.taskType !== 'video') {
          return
        }
        const raw = `${uris || ''}`.trim()
        const first = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || ''
        if (!first || !isBilibiliUrl(first)) {
          this.videoPreviewLoading = false
          this.videoPreviewError = ''
          this.videoMeta = null
          this.videoQualities = []
          this.videoCollection = null
          return
        }
        this.videoPreviewLoading = true
        this.videoPreviewError = ''
        try {
          const cookie = normalizeCookie(this.form.cookie || '')
          const parsed = await resolveBilibiliResources(first, {
            qn: this.form.videoQn !== undefined ? this.form.videoQn : '',
            cookie
          })

          if (parsed.type === 'collection') {
            this.videoCollection = parsed
            this.videoMeta = {
              title: parsed.title || '',
              owner: parsed.owner || '',
              durationText: `${parsed.total_videos} ${this.$t('task.videos')}`,
              sizeText: ''
            }
            this.selectedVideos = parsed.original_video_index ? [parsed.original_video_index] : []
            this.ensureVideoFormatDefault()
            const qualities = Array.isArray(parsed.qualities) ? parsed.qualities : []
            const nextQualities = qualities
              .map(q => {
                const qn = q && q.qn !== undefined ? Number(q.qn) : NaN
                if (!Number.isFinite(qn)) return null
                const desc = q && q.desc ? `${q.desc}` : ''
                const base = desc ? `${desc} (${qn})` : `${qn}`
                const prefix = this.$t('task.video-quality')
                return { value: qn, label: `${prefix}: ${base}` }
              })
              .filter(Boolean)
            this.videoQualities = nextQualities
            const currentQn = this.form.videoQn !== undefined && this.form.videoQn !== null && `${this.form.videoQn}`.trim()
              ? Number(this.form.videoQn)
              : null
            if (nextQualities.length > 0 && (!currentQn || !nextQualities.some(q => q.value === currentQn))) {
              const cfg = this.config || {}
              const preferred = cfg.videoPreferredQn !== undefined && cfg.videoPreferredQn !== null
                ? Number(cfg.videoPreferredQn)
                : null
              const fallback = preferred && nextQualities.some(q => q.value === preferred) ? preferred : nextQualities[0].value
              this.$set(this.form, 'videoQn', fallback)
            }
            this.updateVideoMetaOverflow()
            return
          }

          this.videoCollection = null
          this.ensureVideoFormatDefault()
          const qualities = Array.isArray(parsed.qualities) ? parsed.qualities : []
          const nextQualities = qualities
            .map(q => {
              const qn = q && q.qn !== undefined ? Number(q.qn) : NaN
              if (!Number.isFinite(qn)) return null
              const desc = q && q.desc ? `${q.desc}` : ''
              const base = desc ? `${desc} (${qn})` : `${qn}`
              const prefix = this.$t('task.video-quality')
              return { value: qn, label: `${prefix}: ${base}` }
            })
            .filter(Boolean)
          this.videoQualities = nextQualities
          const currentQn = this.form.videoQn !== undefined && this.form.videoQn !== null && `${this.form.videoQn}`.trim()
            ? Number(this.form.videoQn)
            : null
          if (nextQualities.length > 0 && (!currentQn || !nextQualities.some(q => q.value === currentQn))) {
            const cfg = this.config || {}
            const preferred = cfg.videoPreferredQn !== undefined && cfg.videoPreferredQn !== null
              ? Number(cfg.videoPreferredQn)
              : null
            const fallback = preferred && nextQualities.some(q => q.value === preferred) ? preferred : nextQualities[0].value
            this.$set(this.form, 'videoQn', fallback)
          }
          const totalSize = parsed.total_size
          const sizeText = totalSize && Number(totalSize) > 0 ? this.bytesToSize(Number(totalSize)) : ''
          this.videoMeta = {
            title: parsed.title || '',
            owner: parsed.owner || '',
            durationText: parsed.duration_text || '',
            sizeText
          }
          this.updateVideoMetaOverflow()
        } catch (e) {
          this.videoPreviewError = e && e.message ? e.message : `${e}`
          this.videoMeta = null
          this.videoQualities = []
          this.videoTitleOverflow = false
          this.videoOwnerOverflow = false
          this.videoDurationOverflow = false
          this.videoSizeOverflow = false
          this.videoSizeOverflow = false
        } finally {
          this.videoPreviewLoading = false
        }
      },
      updateVideoMetaOverflow () {
        this.$nextTick(() => {
          const checkOverflow = (refName) => {
            const el = this.$refs[refName]
            if (!el || !el.scrollWidth || !el.clientWidth) {
              return false
            }
            return el.scrollWidth > el.clientWidth + 1
          }
          this.videoTitleOverflow = checkOverflow('videoMetaTitle')
          this.videoOwnerOverflow = checkOverflow('videoMetaOwner')
          this.videoDurationOverflow = checkOverflow('videoMetaDuration')
          this.videoSizeOverflow = checkOverflow('videoMetaSize')
        })
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
          if (this.isUriLikeType(this.type) && this.parsedTasks.length > 0) {
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
          await this.addTask(this.type, this.form)

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
          if (err.message === 'BILIBILI_COLLECTION') {
            // 保存集合数据供选择视频使用
            this.videoCollection = err.collection
            if (this.videoCollection && Array.isArray(this.videoCollection.videos)) {
              // 如果没有手动选择，则自动选择所有视频
              if (this.selectedVideos.length === 0) {
                this.selectedVideos = this.videoCollection.videos.map(v => v.index)
              }
              const selectedVideoData = this.videoCollection.videos.filter(v => this.selectedVideos.includes(v.index))
              if (selectedVideoData.length === 0) {
                this.$msg.warning(this.$t('task.please-select-videos'))
                return
              }

              const allVideoUrls = []
              const allVideoReferers = []
              const allVideoUserAgents = []
              const allVideoNames = []
              const qn = this.form.videoQn || null
              const cookie = this.form.cookie || null

              const parsePromises = selectedVideoData.map(async (video) => {
                let videoUrl = null
                if (video.bvid) {
                  videoUrl = `https://www.bilibili.com/video/${video.bvid}`
                } else if (video.aid) {
                  videoUrl = `https://www.bilibili.com/video/av${video.aid}`
                }

                if (!videoUrl) {
                  return null
                }

                try {
                  const parsed = await resolveBilibiliResources(videoUrl, { qn, cookie, forceSingle: true })
                  if (parsed && Array.isArray(parsed.resources)) {
                    const results = []
                    for (const r of parsed.resources) {
                      if (r && r.url) {
                        results.push({
                          url: r.url,
                          referer: r.referer || `https://www.bilibili.com/video/${video.bvid || video.aid}`,
                          userAgent: r.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                          name: r.name || video.title || `video_${video.bvid || video.aid}`
                        })
                      }
                    }
                    return results
                  }
                } catch (parseErr) {
                  console.error(`Failed to resolve video ${video.title}:`, parseErr)
                  throw new Error(`${this.$t('task.video-parse-failed')}: ${video.title}`)
                }
                return null
              })

              const parseResults = await Promise.all(parsePromises)

              for (const result of parseResults) {
                if (!result) continue
                for (const item of result) {
                  allVideoUrls.push(item.url)
                  allVideoReferers.push(item.referer)
                  allVideoUserAgents.push(item.userAgent)
                  allVideoNames.push(item.name)
                }
              }

              if (allVideoUrls.length === 0) {
                this.$msg.warning(this.$t('task.no-video-urls'))
                return
              }

              this.form.uris = allVideoUrls.join('\n')
              this.form.customReferers = allVideoReferers
              this.form.customUserAgents = allVideoUserAgents
              this.form.customOuts = allVideoNames
              const autoCategorizeFiles = this.config.autoCategorizeFiles || false
              const fileCategories = this.config.fileCategories || null
              const payload = await buildUriPayload(this.form, autoCategorizeFiles, fileCategories)
              this.$store.dispatch('task/addUri', payload).catch(err => {
                this.$msg.error(err.message)
              })
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
            } else {
              this.$msg.error(err.message)
            }
          } else {
            this.$msg.error(this.$t(err.message))
          }
        }
      }
    }
  }
</script>

<style lang="scss">
.add-task-primary-input-wrap {
  position: relative;
  padding-top: 38px;
}

.add-task-type-floating__bar {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  display: flex;
  align-items: center;
}

.add-task-type-floating__bar :deep(.el-radio-group) {
  display: inline-flex;
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

  .el-dialog__header {
    display: none;
  }

  /* 确保弹窗遮罩层有正确的背景色 */
  :deep(.el-dialog__wrapper) {
    background: rgba(0, 0, 0, 0.5);
  }
.parsed-preview {
    margin-top: 12px;
    .parsed-preview__header {
      font-size: 12px;
      color: $--color-text-secondary;
      margin-bottom: 6px;
    }
    background: transparent;
    border: none;
    border-radius: 4px;
    padding: 8px;
    :deep(.el-table) {
      background: transparent;
    }
    :deep(.el-table--border) {
      border: none !important;
    }
    :deep(.el-table::before),
    :deep(.el-table--border::after),
    :deep(.el-table__border-left-patch),
    :deep(.el-table__border-right-patch) {
      display: none !important;
    }
    :deep(.el-table th),
    :deep(.el-table td),
    :deep(.el-table__header-wrapper th),
    :deep(.el-table__body-wrapper td),
    :deep(.el-table--border .el-table__cell) {
      border: none !important;
    }
    :deep(.el-table th),
    :deep(.el-table tr),
    :deep(.el-table td) {
      border-color: var(--border-color) !important;
      background-color: transparent !important;
      color: var(--text-color-primary);
    }
    :deep(.el-table__header-wrapper),
    :deep(.el-table__body-wrapper) {
      background: transparent;
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
  .video-quality-select {
    width: 100%;
    max-width: 100%;
  }
  .video-quality-select--text {
    display: inline-block;
    vertical-align: baseline;
    margin: 0;
    :deep(.el-input) {
      width: 100%;
    }
    :deep(.el-input__inner) {
      border: none;
      padding: 0 14px 0 0;
      height: auto;
      line-height: 1.4;
      background: transparent;
      box-shadow: none;
      color: transparent;
      font-size: 12px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
      mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
    }
    :deep(.el-input__suffix) {
      right: 0;
    }
    :deep(.el-select__caret) {
      font-size: 12px;
      color: $--color-text-regular;
    }
  }
  .video-preview__quality-item:hover .video-quality-select--text :deep(.el-input__inner) {
    color: $--color-text-regular;
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
    padding-top: 0;
    background-color: transparent;
    border-radius: 0 0 5px 5px;
    position: fixed;
    bottom: 0;
    right: 0;
    left: 0;
    z-index: 1000;
    box-shadow: none;
  }
  .dialog-footer {
    .chk {
      float: left;
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

  .video-preview {
    margin-top: 8px;
    padding: 10px 0;
    border-radius: 6px;
    background: transparent;
  }

  .video-preview__status {
    font-size: 12px;
    color: $--color-text-secondary;
    margin-top: 6px;
  }

  .video-preview__error {
    font-size: 12px;
    color: $--color-danger;
    margin-top: 6px;
    word-break: break-all;
  }

  .video-preview__meta {
    margin-top: 2px;
    color: $--color-text-regular;
  }

  .video-preview__meta-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 2px;
  }

  .video-preview__quality-item {
    margin-bottom: 3px;
    .video-format-select {
      min-width: 96px;
    }
  }

  .video-preview__meta-label {
    color: $--color-text-secondary;
    flex: 0 0 auto;
  }

  .video-preview__meta-value {
    flex: 1 1 auto;
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    color: $--color-text-regular;
    font-size: 12px;
  }

  .video-preview__meta-value--fade {
    -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
    mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
  }

  .video-collection-selector {
    margin-top: 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 8px 0;
    max-height: 200px;
    display: flex;
    flex-direction: column;
  }

  .video-collection-selector__header {
    flex: 0 0 auto;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 6px 8px 6px 2px;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 8px;
  }

  .video-collection-selector__header-title {
    flex: 1 1 auto;
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    color: var(--text-color-secondary);
    font-size: 13px;
    line-height: 1;
    -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
    mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 70%, rgba(0, 0, 0, 0));
  }

  .video-collection-selector__list {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    max-height: 150px;
  }

  .video-collection-selector__item {
    display: flex;
    align-items: center;
    padding: 6px 12px 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
    gap: 8px;
  }

  .video-collection-selector__item:hover {
    background-color: var(--border-color);
  }

  .video-collection-selector__item.is-selected {
    background-color: rgba(64, 158, 255, 0.1);
  }

  .video-collection-selector__item-index {
    flex: 0 0 auto;
    color: var(--text-color-secondary);
    font-size: 12px;
  }

  .video-collection-selector__item-title {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color-primary);
    font-size: 12px;
  }

  .video-collection-selector__item-duration {
    flex: 0 0 auto;
    color: var(--text-color-secondary);
    font-size: 11px;
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
</style>
