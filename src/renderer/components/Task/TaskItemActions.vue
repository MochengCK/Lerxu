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
          @mouseenter="onVerifyTriggerEnter"
          @mouseleave="onVerifyTriggerLeave"
        >
          <span
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
              v-if="verifyPanelVisible"
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
  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import is from 'electron-is'
  import { createReadStream, existsSync } from 'node:fs'
  import { createHash } from 'node:crypto'
  import { isAbsolute, resolve, basename } from 'node:path'

  import { commands } from '@/components/CommandManager/instance'
  import { TASK_STATUS } from '@shared/constants'
  import {
    checkTaskIsSeeder,
    getTaskName
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
    props: {
      mode: {
        type: String,
        default: 'LIST',
        validator: function (value) {
          return ['LIST', 'DETAIL'].indexOf(value) !== -1
        }
      },
      task: {
        type: Object,
        required: true
      }
    },
    data () {
      return {
        verifyTriggerHover: false,
        verifyPanelHover: false,
        verifyPanelVisibleInternal: false,
        verifyHideTimer: null,
        verifyPlacementTop: false
      }
    },
    computed: {
      ...mapState('preference', {
        noConfirmBeforeDelete: state => state.config.noConfirmBeforeDeleteTask,
        preferenceConfig: state => state.config
      }),
      ...mapState('task', {
        securityScanStatuses: state => state.taskSecurityScanStatuses || {}
      }),
      verifyPanelVisible () {
        return this.verifyPanelVisibleInternal
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
        return getTaskName(this.task)
      },
      path () {
        return getTaskActualPath(this.task, this.preferenceConfig)
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
        const { taskActions, isSeeder, path } = this
        const canVerify = taskActions.indexOf('VERIFY') !== -1

        if (!canVerify || isSeeder) {
          return false
        }

        // 确保文件存在才显示校验按钮
        // path 已经是通过 getTaskActualPath 获取的，处理了后缀和分类
        return path && existsSync(path)
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
        const status = this.securityScanStatus && this.securityScanStatus.status
        switch (status) {
        case 'running':
          return this.$t('task.security-scan-running')
        case 'success':
          return this.$t('task.security-scan-success')
        case 'failed':
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
        commands.emit('resume-task', {
          task,
          taskName
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
  border: 1px solid $--task-item-action-border-color;
  color: $--task-item-action-color;
  background-color: $--task-item-action-background;
  border-radius: 14px;
  transition: $--all-transition;
  &:hover {
    border-color: $--task-item-action-hover-border-color;
    color: $--task-item-action-hover-color;
    background-color: $--task-item-action-hover-background;
    width: auto;
  }
  &> .task-item-action {
    display: inline-block;
    padding: 5px;
    margin: 0 4px;
    font-size: 0;
    cursor: pointer;
    i {
      display: inline-block;
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

.task-verify-dropdown-ref {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  font-size: 0;
  cursor: pointer;
}

.task-verify-dropdown-ref svg {
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.task-item-actions:hover .task-verify-dropdown-ref svg {
  opacity: 1;
}

.task-item-actions--verify {
  direction: ltr;
  border-color: $--task-item-action-border-color;
  background-color: $--task-item-action-verify-background;
  position: relative;
  margin-right: -23px;
  z-index: 1;
  &:hover {
    border-color: $--task-item-action-hover-border-color;
    background-color: $--task-item-action-verify-hover-background;
  }
  .task-item-action {
    margin: 0 9px;
    .task-verify-dropdown-ref {
      margin-left: -17px;
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
  .task-item-actions.task-item-actions--verify {
    background-color: $--dk-task-item-action-verify-background;
    &:hover {
      background-color: $--dk-task-item-action-verify-hover-background;
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
