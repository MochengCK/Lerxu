<template>
  <el-container id="container">
    <div class="content-area">
      <router-view />
    </div>
    <el-dialog
      v-model="taskPlanVisible"
      width="360px"
      class="task-plan-dialog"
      modal-class="task-plan-overlay"
      append-to-body
      :modal="true"
    >
      <template #header>
        <div class="task-plan-dialog-title">
          <mo-segmented-slider
            v-model="taskPlanType"
            class="task-type-slider"
            :options="taskPlanTypeOptions"
          />
        </div>
      </template>
      <el-form label-position="top">
        <el-form-item>
          <mo-extend-select
            v-model="taskPlanAction"
            :options="taskPlanActionOptions"
            :placeholder="t('app.task-plan-select-placeholder')"
          />
        </el-form-item>
        <el-form-item v-if="taskPlanType === 'scheduled'">
          <el-time-picker
            v-model="taskPlanTime"
            :placeholder="t('app.task-plan-time-placeholder')"
            format="HH:mm"
            value-format="HH:mm"
            popper-class="task-plan-time-popper"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item v-if="taskPlanType === 'scheduled' && isTaskPlanOnlyWhenIdleVisible">
          <div class="toggle-row">
            <span class="toggle-label">{{ t('app.task-plan-only-when-idle') }}</span>
            <el-switch v-model="taskPlanOnlyWhenIdle" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button
            type="primary"
            class="dialog-submit-btn"
            :disabled="isTaskPlanSaveDisabled"
            @click="saveTaskPlan"
          >
            {{ t('app.save') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
    <Teleport to="body">
      <mo-add-task
        v-if="addTaskVisible"
        :visible="addTaskVisible"
        :type="addTaskType"
      />
      <mo-task-detail
        v-if="taskDetailVisible"
        :visible="taskDetailVisible"
        :gid="currentTaskGid"
        :task="currentTaskItem"
        :files="currentTaskFiles"
        :peers="currentTaskPeers"
      />
    </Teleport>
    <mo-dragger />
  </el-container>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, defineAsyncComponent } from 'vue'
import { dialog, BrowserWindow } from '@electron/remote'
import { commands } from '@/components/CommandManager/instance'
import { TASK_STATUS, APP_THEME } from '@shared/constants'
import themeTokens from '@/utils/themeTokens'
import api from '@/api'
import { ipcRenderer } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import {
  bytesToSize,
  timeRemaining,
  timeFormat,
  getTaskName,
  checkTaskIsSeeder
} from '@shared/utils'
import {
  moveTaskFilesToTrash
} from '@/utils/native'
import i18n from '@/plugins/i18n'
import { createMsg } from '@/components/Msg'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/task'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'
// mo-engine-client, mo-extend-select are globally registered in main.js
const moAddTask = defineAsyncComponent(() => import('@/components/Task/AddTask'))
const moTaskDetail = defineAsyncComponent(() => import('@/components/TaskDetail/TaskDetailDrawer'))
const moDragger = defineAsyncComponent(() => import('@/components/Dragger/DragDropZone'))
const moSegmentedSlider = defineAsyncComponent(() => import('@/components/SegmentedSlider/SegmentedSlider'))
import { buildCompletedTaskWindowHtml } from '@/utils/completedWindowHtml'
import { buildProgressWindowHtml } from '@/utils/progressWindowHtml'

defineOptions({ name: 'MoMain' })

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })

const appStore = useAppStore()
const taskStore = useTaskStore()
const preferenceStore = usePreferenceStore()
const { addTaskVisible, addTaskType, systemTheme } = storeToRefs(appStore)
const { taskDetailVisible, currentTaskGid, currentTaskItem, currentTaskFiles, currentTaskPeers, selectedGidList, taskList, taskListRevision } = storeToRefs(taskStore)
const { config: preferenceConfig } = storeToRefs(preferenceStore)

// --- Data ---
const taskPlanAction = ref('shutdown')
const taskPlanType = ref('complete')
const taskPlanTime = ref('')
const taskPlanOnlyWhenIdle = ref(false)
const hasModalMaskVisible = ref(false)
const hasModalDialogVisible = ref(false)
const lastTaskStatuses = ref({})
const autoOpenedProgressGids = ref(new Set())
const progressWindows = ref(new Map())
const progressTaskGids = ref(new Set())
const completedTaskWindows = ref(new Map())
let _modalObserver = null
let taskStatusesInitialized = false

// --- Computed ---
const taskPlanVisible = computed({
  get () { return appStore.taskPlanVisible },
  set (val) { appStore.updateTaskPlanVisible(val) }
})
const taskPlanActionFromConfig = computed(() => (preferenceConfig.value && preferenceConfig.value.taskPlanAction) || 'none')
const taskPlanTypeFromConfig = computed(() => (preferenceConfig.value && preferenceConfig.value.taskPlanType) || 'complete')
const taskPlanTimeFromConfig = computed(() => (preferenceConfig.value && preferenceConfig.value.taskPlanTime) || '')
const taskPlanOnlyWhenIdleFromConfig = computed(() => !!(preferenceConfig.value && preferenceConfig.value.taskPlanOnlyWhenIdle))
const prefTheme = computed(() => preferenceConfig.value && preferenceConfig.value.theme)
const isTaskPlanPlanned = computed(() => (taskPlanActionFromConfig.value || 'none') !== 'none')
const isTaskPlanCompleteTypeDisabled = computed(() => isTaskPlanRequireScheduledType(taskPlanAction.value))
const isTaskPlanOnlyWhenIdleVisible = computed(() => {
  const action = normalizeTaskPlanAction(taskPlanAction.value)
  return ['shutdown', 'sleep', 'quit'].includes(action)
})
const isTaskPlanSaveDisabled = computed(() => {
  if (!taskPlanAction.value) return true
  const action = normalizeTaskPlanAction(taskPlanAction.value)
  if (isTaskPlanRequireSelection(action) && getSelectedGids().length === 0) return true
  if (taskPlanType.value === 'scheduled' && !taskPlanTime.value) return true
  return false
})
const taskPlanTypeOptions = computed(() => [
  { value: 'complete', label: t('app.task-plan-type-complete'), disabled: isTaskPlanCompleteTypeDisabled.value },
  { value: 'scheduled', label: t('app.task-plan-type-scheduled') }
])
const taskPlanActionOptions = computed(() => {
  const actions = [
    { value: 'shutdown', label: t('app.task-plan-action-shutdown') },
    { value: 'sleep', label: t('app.task-plan-action-sleep') },
    { value: 'quit', label: t('app.task-plan-action-quit') }
  ]
  if (taskPlanType.value === 'scheduled') {
    actions.unshift(
      { value: 'resume-selected', label: t('app.task-plan-action-resume-selected') },
      { value: 'resume-all', label: t('app.task-plan-action-resume-all') },
      { value: 'pause-selected', label: t('app.task-plan-action-pause-selected') },
      { value: 'pause-all', label: t('app.task-plan-action-pause-all') }
    )
  }
  return actions
})

// --- Watchers ---
watch(taskPlanActionFromConfig, () => {
  if (!taskPlanVisible.value) {
    taskPlanAction.value = normalizeTaskPlanAction(taskPlanActionFromConfig.value)
    taskPlanType.value = normalizeTaskPlanType(taskPlanTypeFromConfig.value, taskPlanActionFromConfig.value)
    taskPlanTime.value = normalizeTaskPlanTime(taskPlanTimeFromConfig.value)
    taskPlanOnlyWhenIdle.value = !!taskPlanOnlyWhenIdleFromConfig.value
  }
})
watch(taskPlanAction, () => {
  const action = normalizeTaskPlanAction(taskPlanAction.value)
  if (isTaskPlanRequireScheduledType(action) && taskPlanType.value !== 'scheduled') {
    taskPlanType.value = 'scheduled'
  }
})
watch(taskPlanType, () => {
  if (taskPlanType.value !== 'complete') return
  const action = normalizeTaskPlanAction(taskPlanAction.value)
  if (!['shutdown', 'sleep', 'quit'].includes(action)) {
    taskPlanAction.value = ''
  }
  taskPlanTime.value = ''
  taskPlanOnlyWhenIdle.value = false
  alignTaskPlanActionToFirstOption()
})
watch(taskPlanVisible, (val) => {
  if (val) {
    taskPlanAction.value = normalizeTaskPlanAction(taskPlanActionFromConfig.value)
    taskPlanType.value = normalizeTaskPlanType(taskPlanTypeFromConfig.value, taskPlanActionFromConfig.value)
    taskPlanTime.value = normalizeTaskPlanTime(taskPlanTimeFromConfig.value)
    taskPlanOnlyWhenIdle.value = !!taskPlanOnlyWhenIdleFromConfig.value
    alignTaskPlanActionToFirstOption()
  }
})
// taskList 由 store 以 splice 原地更新（引用不变），直接 watch 不会触发；
// 改为监听 revision 计数，store 在列表实际变化时递增
watch(taskListRevision, () => {
  handleTaskListChange(taskList.value || [])
})
watch(prefTheme, () => {
  handleThemeChangeForProgressWindow()
})
watch(systemTheme, () => {
  handleThemeChangeForProgressWindow()
})

// --- Lifecycle ---
onMounted(() => {
  updateModalMaskVisible()
  if (typeof MutationObserver === 'undefined') return
  _modalObserver = new MutationObserver(() => {
    updateModalMaskVisible()
  })
  try {
    _modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden']
    })
  } catch (e) {}
  commands.on('show-task-progress', handleShowTaskProgress)
  commands.on('task-progress:control', handleTaskProgressControl)
  commands.on('task-progress:auto-open', handleTaskProgressAutoOpen)
})
onBeforeUnmount(() => {
  if (_modalObserver) {
    try {
      _modalObserver.disconnect()
      _modalObserver = null
    } catch (e) {}
  }
  commands.off('show-task-progress', handleShowTaskProgress)
  commands.off('task-progress:control', handleTaskProgressControl)
  commands.off('task-progress:auto-open', handleTaskProgressAutoOpen)
})

// --- Methods ---

      function isAliveWindow(win) {
        if (!win) {
          return false
        }
        try {
          if (typeof win.isDestroyed === 'function' && win.isDestroyed()) {
            return false
          }
        } catch (e) {
          return false
        }
        return true
      }
      function updateModalMaskVisible() {
        try {
          const body = document.body
          hasModalMaskVisible.value = !!(body && body.querySelector('.v-modal'))

          const isVisible = (el) => {
            if (!el) return false
            try {
              const style = window.getComputedStyle ? window.getComputedStyle(el) : null
              if (style && (style.display === 'none' || style.visibility === 'hidden')) return false
              if (style && Number(style.opacity) <= 0.01) return false
              if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false
              return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
            } catch (e) {
              return true
            }
          }

          const modalBodies = body
            ? Array.from(body.querySelectorAll('.el-dialog, .el-message-box'))
            : []
          hasModalDialogVisible.value = modalBodies.some(el => {
            const wrapper = el.closest && el.closest('.el-overlay, .el-dialog__wrapper, .el-message-box__wrapper')
            if (wrapper && wrapper.style && wrapper.style.display === 'none') return false
            if (wrapper && wrapper.getAttribute && wrapper.getAttribute('aria-hidden') === 'true') return false
            return isVisible(el)
          })
        } catch (e) {
          hasModalMaskVisible.value = false
          hasModalDialogVisible.value = false
        }
      }
      function normalizeTaskPlanAction(action) {
        const v = `${action || ''}`
        if (['resume-selected', 'resume-all', 'pause-selected', 'pause-all', 'shutdown', 'sleep', 'quit'].includes(v)) {
          return v
        }
        return ''
      }
      function alignTaskPlanActionToFirstOption() {
        const actions = taskPlanActionOptions.value
        const first = actions && actions.length > 0 ? actions[0].value : ''
        const current = normalizeTaskPlanAction(taskPlanAction.value)
        if (!current && first !== '') {
          taskPlanAction.value = first
        }
      }
      function normalizeTaskPlanType(type, action) {
        const a = `${action || 'none'}`
        if (a === 'none') {
          return 'complete'
        }
        if (isTaskPlanRequireScheduledType(a)) {
          return 'scheduled'
        }
        const t = `${type || 'complete'}`
        if (['complete', 'scheduled'].includes(t)) {
          return t
        }
        return 'complete'
      }
      function normalizeTaskPlanTime(time) {
        const v = `${time || ''}`
        if (!v) {
          return ''
        }
        return /^\d{2}:\d{2}$/.test(v) ? v : ''
      }
      function isTaskPlanRequireSelection(action) {
        return ['resume-selected', 'pause-selected'].includes(`${action || ''}`)
      }
      function isTaskPlanRequireScheduledType(action) {
        return ['resume-selected', 'resume-all', 'pause-selected', 'pause-all'].includes(`${action || ''}`)
      }
      function getSelectedGids() {
        const list = Array.isArray(selectedGidList.value) ? selectedGidList.value : []
        return list.map(x => `${x || ''}`.trim()).filter(Boolean)
      }
      function saveTaskPlan() {
        const action = normalizeTaskPlanAction(taskPlanAction.value)
        const type = normalizeTaskPlanType(taskPlanType.value, action)
        const time = normalizeTaskPlanTime(taskPlanTime.value)
        if (!action) {
          msg.warning(t('app.task-plan-select-warning'))
          return
        }
        const gids = isTaskPlanRequireSelection(action) ? getSelectedGids() : []
        if (isTaskPlanRequireSelection(action) && gids.length === 0) {
          msg.warning(t('app.task-plan-selected-warning'))
          return
        }
        if (type === 'scheduled' && !time) {
          msg.warning(t('app.task-plan-time-warning'))
          return
        }
        preferenceStore.save({
          taskPlanAction: action,
          taskPlanType: type,
          taskPlanTime: type === 'scheduled' ? time : '',
          taskPlanGids: gids,
          taskPlanOnlyWhenIdle: type === 'scheduled' && isTaskPlanOnlyWhenIdleVisible.value ? !!taskPlanOnlyWhenIdle.value : false
        })
        taskPlanVisible.value = false
        const labelKey = {
          'resume-selected': 'app.task-plan-action-resume-selected',
          'resume-all': 'app.task-plan-action-resume-all',
          'pause-selected': 'app.task-plan-action-pause-selected',
          'pause-all': 'app.task-plan-action-pause-all',
          shutdown: 'app.task-plan-action-shutdown',
          sleep: 'app.task-plan-action-sleep',
          quit: 'app.task-plan-action-quit'
        }[action] || 'app.task-plan-action-quit'
        const label = type === 'scheduled' && time
          ? `${t(labelKey)} (${time})`
          : t(labelKey)
        msg.success(t('app.task-plan-set-message', { action: label }))
      }
      async function handleTaskProgressAutoOpen(payload) {
        const data = payload || {}
        const gid = data && data.gid ? `${data.gid}` : ''
        if (!gid) {
          return
        }
        // 提前去重，避免并发事件重复打开窗口
        const autoOpened = autoOpenedProgressGids.value || (autoOpenedProgressGids.value = new Set())
        if (autoOpened.has(gid)) {
          return
        }
        // 任务刚创建时 fetchList 可能尚未完成，或当前列表被类型筛选过滤，
        // 此时直接从引擎拉取任务数据，保证自动打开不被时序问题吞掉
        const list = taskList.value || []
        let task = list.find(item => item && `${item.gid}` === gid)
        if (!task) {
          try {
            task = await api.fetchTaskItem({ gid })
          } catch (e) {
            task = null
          }
          if (!task || !task.gid) {
            return
          }
        }
        autoOpened.add(gid)
        openProgressWindowForTask(task)
      }
      function handleThemeChangeForProgressWindow() {
        // Update all progress windows
        progressWindows.value.forEach((win, gid) => {
          if (!win || (win.isDestroyed && win.isDestroyed())) {
            progressWindows.value.delete(gid)
            return
          }

          const list = taskList.value || []
          const task = list.find(item => item && `${item.gid}` === gid)
          if (!task) {
            return
          }

          try {
            const tc = getThemeColors()
            const bodyBg = tc.bodyBg
            const textColor = tc.textColor
            const statusColor = tc.statusColor
            const metaColor = tc.metaColor
            const barBg = tc.barBg
            const barInner = tc.barInner
            const controlsBg = tc.controlsBg
            const controlsBorder = tc.controlsBorder
            const controlsDivider = tc.controlsDivider
            const controlsItemColor = tc.controlsItemColor
            const controlsItemHoverBg = tc.controlsItemHoverBg
            const titleBtnHoverBg = tc.titleBtnHoverBg
            const indicatorBg = tc.indicatorBg
            const primaryColor = tc.primaryColor

            if (typeof win.setBackgroundColor === 'function') {
              win.setBackgroundColor(bodyBg)
            }
            try {
              win.webContents.send('task-progress-theme-update', {
                bodyBg,
                textColor,
                statusColor,
                metaColor,
                barBg,
                barInner,
                controlsBg,
                controlsBorder,
                controlsDivider,
                controlsItemColor,
                controlsItemHoverBg,
                titleBtnHoverBg,
                indicatorBg,
                primaryColor,
                tabBg: tc.tabBg,
                tabColor: tc.tabColor,
                tabBorder: tc.tabBorder,
                pieceColors: tc.pieceColors
              })
            } catch (e) {}
            updateProgressWindow(task)
          } catch (e) {}
        })

        // Update all completed task windows
        completedTaskWindows.value.forEach((win, gid) => {
          if (!win || (win.isDestroyed && win.isDestroyed())) {
            completedTaskWindows.value.delete(gid)
            return
          }

          try {
            
            const prefConfig = preferenceConfig.value || {}
            const themeConfig = prefConfig.theme || APP_THEME.LIGHT

            const currentSystemTheme = systemTheme.value || APP_THEME.LIGHT
            const finalTheme = themeConfig === APP_THEME.AUTO ? currentSystemTheme : themeConfig
            const isDark = finalTheme === APP_THEME.DARK

            const bodyBg = getThemeColors().bodyBg
            if (typeof win.setBackgroundColor === 'function') {
              win.setBackgroundColor(bodyBg)
            }
            try {
              win.webContents.send('theme-changed', isDark ? 'dark' : 'light')
            } catch (e) {}
          } catch (e) {}
        })
      }
      function getThemeColors() {
        
        const themeConfig = (preferenceConfig.value && preferenceConfig.value.theme) || APP_THEME.LIGHT

        const currentSystemTheme = systemTheme.value || APP_THEME.LIGHT
        const effectiveTheme = themeTokens.resolveTheme(themeConfig, currentSystemTheme)
        return themeTokens.getColors(effectiveTheme)
      }
      async function handleTaskProgressControl(payload) {
        const data = payload || {}
        const gid = data && data.gid ? `${data.gid}` : ''
        const action = data && data.action ? `${data.action}` : ''
        if (!gid || !action) {
          return
        }
        const list = taskList.value || []
        let task = list.find(item => item && `${item.gid}` === gid)
        if (!task) {
          try {
            task = await api.fetchTaskItem({ gid })
          } catch (e) {
            task = null
          }
        }
        if (!task) {
          return
        }
        const taskName = getTaskName(task, {
          defaultName: t('task.get-task-name')
        })
        if (action === 'pause') {
          msg.info(t('task.download-pause-message', { taskName }))
          taskStore.pauseTask(task)
            .catch(({ code }) => {
              if (code === 1) {
                msg.error(t('task.pause-task-fail', { taskName }))
              }
            })
          return
        }
        if (action === 'resume') {
          taskStore.resumeTask(task)
            .catch(({ code }) => {
              if (code === 1) {
                msg.error(t('task.resume-task-fail', {
                  taskName
                }))
              }
            })
          return
        }
        if (action === 'cancel') {
          const deleteWithFiles = false
          handleDeleteTaskFromProgress(task, taskName, deleteWithFiles)
        }
      }
      async function deleteTaskFilesFromProgress(task) {
        
        const config = preferenceConfig.value || {}
        const downloadingFileSuffix = config.downloadingFileSuffix || ''
        try {
          await moveTaskFilesToTrash(task, downloadingFileSuffix, config)
        } catch (err) {
          console.warn('[LinkCore] deleteTaskFilesFromProgress error:', err)
          const taskName = (task && task.name) ? task.name : (task && task.gid ? task.gid : '')
          msg.error(`删除文件失败: ${taskName}`)
        }
      }
      async function removeTaskItemFromProgress(task, taskName) {
        try {
          await taskStore.removeTask(task)
          msg.success(t('task.delete-task-success', {
            taskName
          }))
        } catch ({ code }) {
          if (code === 1) {
            msg.error(t('task.delete-task-fail', {
              taskName
            }))
          }
        }
      }
      async function handleDeleteTaskFromProgress(task, taskName, deleteWithFiles = false) {
        
        const prefConfig = preferenceConfig.value || {}
        const noConfirmBeforeDelete = !!prefConfig.noConfirmBeforeDeleteTask

        // 在从aria2移除任务前，获取最新的任务状态以确保文件路径准确
        const fetchFreshTaskForDeletion = async (originalTask) => {
          let taskForDeletion = originalTask
          try {
            const fresh = await api.fetchTaskItem({ gid: originalTask.gid })
            if (fresh && fresh.gid) {
              taskForDeletion = { ...originalTask, ...fresh }
            }
          } catch (e) {
            console.warn('[LinkCore] Failed to fetch fresh task for deletion:', e.message)
          }
          // 预获取引擎选项（dir + out），避免任务被 aria2 删除后 getOption 失败导致文件路径无法解析
          try {
            const opt = await api.getOption({ gid: originalTask.gid })
            if (opt) {
              taskForDeletion = { ...taskForDeletion, _engineOptions: opt }
            }
          } catch (e) {
            console.warn('[LinkCore] Failed to pre-fetch getOption for deletion:', e.message)
          }
          return taskForDeletion
        }

        if (noConfirmBeforeDelete) {
          const taskForDeletion = deleteWithFiles ? await fetchFreshTaskForDeletion(task) : task
          await taskStore.forcePauseTask(task)
            .finally(async () => {
              // 先从aria2中删除任务
              await removeTaskItemFromProgress(task, taskName)

              // 然后再删除文件
              if (deleteWithFiles) {
                await new Promise(resolve => setTimeout(resolve, 500))
                await deleteTaskFilesFromProgress(taskForDeletion)
              }
            })
          return
        }
        dialog.showMessageBox({
          type: 'warning',
          title: t('task.delete-task'),
          message: t('task.delete-task-confirm', { taskName }),
          buttons: [t('app.yes'), t('app.no')],
          cancelId: 1,
          checkboxLabel: t('task.delete-task-label'),
          checkboxChecked: deleteWithFiles
        }).then(async ({ response, checkboxChecked }) => {
          if (response !== 0) {
            return
          }
          const taskForDeletion = checkboxChecked ? await fetchFreshTaskForDeletion(task) : task
          await taskStore.forcePauseTask(task)
            .finally(async () => {
              // 先从aria2中删除任务
              await removeTaskItemFromProgress(task, taskName)

              // 然后再删除文件
              if (checkboxChecked) {
                await new Promise(resolve => setTimeout(resolve, 500))
                await deleteTaskFilesFromProgress(taskForDeletion)
              }
            })
        })
      }
      function handleShowTaskProgress(payload) {
        const task = payload && payload.task
        if (!task) {
          return
        }
        openProgressWindowForTask(task)
      }
      // buildProgressWindowHtml moved to @/utils/progressWindowHtml
      async function refreshProgressTaskDirectly() {
        // Refresh all progress windows
        progressWindows.value.forEach(async (win, gid) => {
          if (!isAliveWindow(win)) {
            progressWindows.value.delete(gid)
            return
          }

          const doneStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
          try {
            const task = await api.fetchTaskItem({ gid })
            if (!task || !task.gid) {
              closeProgressWindowByGid(gid)
              return
            }
            if (doneStatuses.includes(task.status)) {
              closeProgressWindowByGid(gid)
              return
            }
            updateProgressWindow(task)
          } catch (e) {
            closeProgressWindowByGid(gid)
          }
        })
      }
      function buildProgressPayload(task) {
        const taskData = task || {}
        const completed = Number(taskData.completedLength || 0)
        const total = Number(taskData.totalLength || 0)
        const speed = Number(taskData.downloadSpeed || 0)
        const connections = Number(taskData.connections || 0)
        const percent = total > 0 ? Math.floor((completed * 100) / total) : 0
        const title = getTaskName(taskData, {
          defaultName: t('task.get-task-name'),
          maxLen: -1
        })
        const completedText = bytesToSize(completed, 2)
        const totalText = total > 0 ? bytesToSize(total, 2) : ''
        const sizeText = totalText ? `${completedText} / ${totalText}` : completedText
        const speedValue = speed > 0 ? `${bytesToSize(speed, 2)}/s` : `${bytesToSize(0, 2)}/s`

        // 计算平均速度
        const gid = taskData && taskData.gid ? `${taskData.gid}` : ''
        const speedSamplesMap = taskStore.taskSpeedSamples || {}
        const speedSamples = gid && Array.isArray(speedSamplesMap[gid]) ? speedSamplesMap[gid] : []
        let avgSpeed = 0
        if (speedSamples.length > 0) {
          const normalized = speedSamples
            .map(s => {
              if (typeof s === 'number') {
                const spd = Number(s)
                if (!Number.isFinite(spd) || spd < 0) return null
                return { bytes: spd, durationMs: 1000 }
              }
              if (!s || typeof s !== 'object') return null
              const bytes = Number(s.bytes)
              const durationMs = Number(s.durationMs)
              if (!Number.isFinite(bytes) || bytes < 0) return null
              if (!Number.isFinite(durationMs) || durationMs <= 0) return null
              return { bytes, durationMs }
            })
            .filter(Boolean)
          if (normalized.length > 0) {
            const totalBytes = normalized.reduce((sum, it) => sum + it.bytes, 0)
            const totalDurationMs = normalized.reduce((sum, it) => sum + it.durationMs, 0)
            avgSpeed = totalDurationMs > 0 ? Math.round((totalBytes * 1000) / totalDurationMs) : 0
          }
        } else if (taskData.averageDownloadSpeed != null) {
          const v = Number(taskData.averageDownloadSpeed)
          avgSpeed = Number.isFinite(v) && v >= 0 ? v : 0
        }
        const avgSpeedValue = avgSpeed > 0 ? `${bytesToSize(avgSpeed, 2)}/s` : `${bytesToSize(0, 2)}/s`

        // 解析分片进度 - 与任务详情活动图表 (TaskGraphic) 保持一致的 5 级分类
        let piecesData = null
        const bitfield = taskData.bitfield || ''
        const numPieces = Number(taskData.numPieces || 0)
        if (bitfield && numPieces > 0) {
          const pieces = []
          // bitfield 按字节补零，最后一个 nibble 可能只包含填充位，
          // 只取真实分片对应的 nibble 数量 ceil(numPieces / 4)，避免
          // 已完成任务末尾多渲染一个"未下载"的假分片。
          const nibbleCount = Math.min(Math.ceil(numPieces / 4), bitfield.length)
          for (let i = 0; i < nibbleCount; i++) {
            const hex = parseInt(bitfield[i], 16)
            // 与 TaskGraphic buildAtom 一致: Math.floor(hex / 4) → 0..3
            // hex 0-3 → s0, 4-7 → s1, 8-11 → s2, 12-15 → s3
            pieces.push(Math.floor(hex / 4))
          }
          piecesData = {
            numPieces,
            pieces,
            tabText: t('task.task-pieces-progress')
          }
        }

        let remainingText = ''
        if (total > 0 && speed > 0 && completed < total) {
          const remainingSeconds = timeRemaining(total, completed, speed)
          if (remainingSeconds > 0) {
            remainingText = timeFormat(remainingSeconds, {
              prefix: t('task.remaining-prefix'),
              i18n: {
                gt1d: t('app.gt1d'),
                hour: t('app.hour'),
                minute: t('app.minute'),
                second: t('app.second')
              }
            })
          }
        }
        if (!remainingText) {
          remainingText = `${t('task.remaining-prefix')}: --`
        }
        const status = taskData.status
        const doneStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
        const isPaused = status === TASK_STATUS.PAUSED || status === TASK_STATUS.WAITING
        // 待选择文件状态（磁力元数据已下载完、等待用户选择文件），
        // 进度窗口据此用橙色进度条区分"任务还没正式开始"
        const pendingMap = taskStore.pendingFileSelection || {}
        const pendingSelection = !!(gid && pendingMap[gid])
        const canPause = status === TASK_STATUS.ACTIVE && completed > 0
        const canResume = status === TASK_STATUS.WAITING || status === TASK_STATUS.PAUSED
        const canCancel = !doneStatuses.includes(status)
        return {
          gid: taskData && taskData.gid ? `${taskData.gid}` : '',
          title,
          percent,
          percentText: `${percent}%`,
          nameText: title,
          isPaused,
          pendingSelection,
          // 与主进程 task-progress:fetch 返回保持一致，
          // 避免事件推送缺字段时滑块按钮文本被清空导致宽度闪烁
          tabInfoText: t('task.task-progress-info'),
          tabPiecesText: t('task.task-pieces-progress'),
          piecesEmptyText: t('task.task-no-pieces-data'),
          tabInfoShort: t('task.task-progress-info'),
          tabPiecesShort: t('task.task-pieces-progress'),
          sizeText: sizeText ? `${t('task.task-file-size')}: ${sizeText}` : '',
          speedText: `${t('task.task-download-speed')}: ${speedValue}`,
          avgSpeedText: `${t('task.task-average-speed')}: ${avgSpeedValue}`,
          connectionsText: `${t('task.task-connections')}: ${connections}`,
          remainingText,
          piecesData,
          connectionsData: null, // 将在 updateProgressWindow 中填充
          pauseText: t('task.pause'),
          resumeText: t('task.resume'),
          cancelText: t('task.delete'),
          canPause,
          canResume,
          canCancel,
          showPause: true,
          showResume: true,
          showCancel: true
        }
      }
      function buildConnectionsData(servers = [], taskSpeed = 0) {
        let totalConnections = 0
        let activeConnections = 0
        const serverList = []

        if (Array.isArray(servers)) {
          servers.forEach(file => {
            const fileServers = file.servers || []
            fileServers.forEach(server => {
              totalConnections++
              const speed = Number(server.downloadSpeed) || 0
              const isActive = speed > 0
              if (isActive) {
                activeConnections++
              }
              // 提取主机名
              let host = '-'
              const uri = server.currentUri || server.uri || ''
              if (uri) {
                try {
                  const url = new URL(uri)
                  host = url.hostname
                } catch (e) {
                  const match = uri.match(/:\/\/([^/:]+)/)
                  host = match ? match[1] : uri
                }
              }
              serverList.push({
                host,
                speed: `${bytesToSize(speed, 2)}/s`,
                downloaded: bytesToSize(Number(server.downloadLength) || 0, 2),
                isActive,
                status: isActive ? t('task.connection-status-active') : t('task.connection-status-idle')
              })
            })
          })
        }

        return {
          totalLabel: t('task.connections-total'),
          totalValue: String(totalConnections),
          activeLabel: t('task.connections-active'),
          activeValue: String(activeConnections),
          speedLabel: t('task.connections-total-speed'),
          speedValue: `${bytesToSize(taskSpeed, 2)}/s`,
          thHost: t('task.connection-host'),
          thDownloaded: t('task.task-peer-downloaded'),
          thSpeed: t('task.connection-speed'),
          thStatus: t('task.connection-status'),
          servers: serverList,
          emptyText: t('task.no-connections')
        }
      }
      function openProgressWindowForTask(task) {
        if (!task) {
          return
        }
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) {
          return
        }

        // 检查是否已经有窗口
        const existingWindow = progressWindows.value.get(gid)
        if (isAliveWindow(existingWindow)) {
          // 确保窗口显示、激活并置于最前面
          try {
            if (existingWindow.isMinimized()) {
              existingWindow.restore()
            }
            existingWindow.show()
            existingWindow.focus()
            // 短暂置顶以确保窗口在最前面，然后取消置顶
            existingWindow.setAlwaysOnTop(true)
            setTimeout(() => {
              try {
                if (isAliveWindow(existingWindow)) {
                  existingWindow.setAlwaysOnTop(false)
                }
              } catch (e) {}
            }, 100)
          } catch (e) {
            console.warn('[LinkCore] Failed to activate existing progress window:', e.message)
          }
          updateProgressWindow(task)
          return
        }

        progressTaskGids.value.add(gid)
        
        const prefConfig = preferenceConfig.value || {}
        const hideAppMenu = !!prefConfig.hideAppMenu
        const isWin = process && process.platform === 'win32'
        const isLinux = process && process.platform === 'linux'
        const isMac = process && process.platform === 'darwin'
        const useCustomFrame = hideAppMenu && (isWin || isLinux)

        // 移除已有的窗口引用
        if (existingWindow) {
          progressWindows.value.delete(gid)
        }
        let icon = null
        try {
          const staticPath = (typeof window !== 'undefined' && window.__static) ? window.__static : null
          if (staticPath) {
            if (process && process.platform === 'win32') {
              icon = path.join(staticPath, './L_ico_256x256.ico')
            } else if (process && process.platform === 'linux') {
              icon = path.join(staticPath, './512x512.png')
            }
          }
        } catch (e) {}

        // 读取保存的窗口大小，如果没有就使用默认值
        const savedProgressWindowSize = prefConfig.progressWindowSize || { width: 360, height: 230 }
        const defaultWidth = Math.max(savedProgressWindowSize.width || 360, 360)
        const defaultHeight = Math.max(savedProgressWindowSize.height || 230, 210)

        const win = new BrowserWindow({
          width: defaultWidth,
          height: defaultHeight,
          resizable: true,
          minWidth: 360,
          minHeight: 220,
          minimizable: true,
          maximizable: false,
          useContentSize: true,
          frame: !useCustomFrame,
          titleBarStyle: isMac ? 'hiddenInset' : 'default',
          backgroundColor: getThemeColors().bodyBg,
          icon,
          // 确保窗口独立于主窗口，不会继承主窗口的最小化状态
          parent: null,
          modal: false,
          show: false, // 先不显示，等 ready-to-show 时再显示
          webPreferences: {
            enableRemoteModule: true,
            contextIsolation: false,
            nodeIntegration: true
          }
        })
        progressWindows.value.set(gid, win)

        win.on('closed', () => {
          progressWindows.value.delete(gid)
          progressTaskGids.value.delete(gid)
        })
        const html = buildProgressWindowHtml(useCustomFrame, isMac, getThemeColors)
        // Write HTML to a temp file and load it, because data: URLs have
        // size limits in Chromium that this large HTML can exceed.
        try {
          const tmpDir = os.tmpdir()
          const tmpFile = path.join(tmpDir, `lc-progress-${gid}.html`)
          fs.writeFileSync(tmpFile, html, 'utf-8')
          win.loadFile(tmpFile)
          win.once('closed', () => {
            try { fs.unlinkSync(tmpFile) } catch (e) {}
          })
        } catch (e) {
          // Fallback to data URL if temp file approach fails
          win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        }
        win.once('ready-to-show', () => {
          if (!isAliveWindow(win)) {
            progressWindows.value.delete(gid)
            progressTaskGids.value.delete(gid)
            return
          }
          const payload = buildProgressPayload(task)
          const windowTitle = t('task.task-info-dialog-title', {
            title: payload.title
          })
          try {
            win.setTitle(windowTitle)
          } catch (e) {
            progressWindows.value.delete(gid)
            progressTaskGids.value.delete(gid)
            return
          }
          if (hideAppMenu) {
            if (typeof win.setMenuBarVisibility === 'function') {
              win.setMenuBarVisibility(false)
            }
            if (win.setMenu) {
              win.setMenu(null)
            }
          }
          // 确保窗口显示、激活并置于最前面
          try {
            if (win.isMinimized()) {
              win.restore()
            }
            win.show()
            win.focus()
            // 短暂置顶以确保窗口在最前面，然后取消置顶
            win.setAlwaysOnTop(true)
            setTimeout(() => {
              try {
                if (isAliveWindow(win)) {
                  win.setAlwaysOnTop(false)
                }
              } catch (e) {}
            }, 100)
          } catch (e) {
            console.warn('[LinkCore] Failed to activate progress window:', e.message)
          }
          updateProgressWindow(task)
        })
      }
      async function updateProgressWindow(task) {
        if (!task || !task.gid) {
          return
        }
        const gid = task.gid
        const win = progressWindows.value.get(gid)
        if (!isAliveWindow(win)) {
          progressWindows.value.delete(gid)
          progressTaskGids.value.delete(gid)
          return
        }
        const payload = buildProgressPayload(task)
        const taskSpeed = Number(task.downloadSpeed) || 0

        // 只在任务活跃或等待状态时获取连接数，暂停时不显示
        if (task.status === TASK_STATUS.ACTIVE || task.status === TASK_STATUS.WAITING) {
          try {
            const servers = await api.fetchTaskServers({ gid })
            payload.connectionsData = buildConnectionsData(servers, taskSpeed)
          } catch (e) {
            payload.connectionsData = buildConnectionsData([], taskSpeed)
          }
        } else {
          // 暂停、停止等状态时连接数为空，速度也为0
          payload.connectionsData = buildConnectionsData([], 0)
        }

        const windowTitle = t('task.task-info-dialog-title', {
          title: payload.title
        })
        try {
          win.setTitle(windowTitle)
        } catch (e) {
          progressWindows.value.delete(gid)
          progressTaskGids.value.delete(gid)
          return
        }
        try {
          // 独立进度窗口的平均速度由窗口自身轮询 (task-progress:fetch) 计算
          // 此处移除 avgSpeedText 以避免两个数据源交替覆盖导致闪烁
          if ('avgSpeedText' in payload) {
            delete payload.avgSpeedText
          }
          win.webContents.send('task-progress-update', payload)
        } catch (e) {}
      }
      function closeProgressWindow() {
        // Close all progress windows
        progressWindows.value.forEach((win, gid) => {
          try {
            if (win && (!win.isDestroyed || !win.isDestroyed())) {
              win.close()
            }
          } catch (e) {}
        })
        progressWindows.value.clear()
        progressTaskGids.value.clear()
      }
      function closeProgressWindowByGid(gid) {
        const win = progressWindows.value.get(gid)
        if (win) {
          try {
            if (!win.isDestroyed || !win.isDestroyed()) {
              win.close()
            }
          } catch (e) {}
          progressWindows.value.delete(gid)
        }
        progressTaskGids.value.delete(gid)
      }

      // Open a window to show task completion notification
      function openCompletedTaskWindow(task) {
        try {
        console.log('[LinkCore] openCompletedTaskWindow called:', task)
        if (!task) {
          console.log('[LinkCore] No task provided')
          return
        }
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) {
          console.log('[LinkCore] No gid found in task')
          return
        }
        console.log('[LinkCore] Opening completed task window for gid:', gid)

        // Check if already showing a window for this task
        const existingWindow = completedTaskWindows.value.get(gid)
        if (isAliveWindow(existingWindow)) {
          existingWindow.show()
          existingWindow.focus()
          return
        }

        
        const prefConfig = preferenceConfig.value || {}
        const hideAppMenu = !!prefConfig.hideAppMenu
        const isWin = process && process.platform === 'win32'
        const isLinux = process && process.platform === 'linux'
        const isMac = process && process.platform === 'darwin'
        const useCustomFrame = hideAppMenu && (isWin || isLinux)

        // Remove existing window reference
        if (existingWindow) {
          completedTaskWindows.value.delete(gid)
        }

        let icon = null
        try {
          const staticPath = (typeof window !== 'undefined' && window.__static) ? window.__static : null
          if (staticPath) {
            if (process && process.platform === 'win32') {
              icon = path.join(staticPath, './L_ico_256x256.ico')
            } else if (process && process.platform === 'linux') {
              icon = path.join(staticPath, './512x512.png')
            }
          }
        } catch (e) {}

        const win = new BrowserWindow({
          width: 360,
          height: 200,
          resizable: false,
          minimizable: true,
          maximizable: false,
          useContentSize: true,
          frame: !useCustomFrame,
          titleBarStyle: isMac ? 'hiddenInset' : 'default',
          backgroundColor: getThemeColors().bodyBg,
          icon,
          parent: null,
          modal: false,
          show: false,
          webPreferences: {
            enableRemoteModule: true,
            contextIsolation: false,
            nodeIntegration: true
          }
        })
        completedTaskWindows.value.set(gid, win)

        win.on('closed', () => {
          completedTaskWindows.value.delete(gid)
        })

        const html = buildCompletedTaskWindowHtml(task, useCustomFrame, isMac, t, getThemeColors, formatBytes, escapeHtml)
        try {
          const tmpDir = os.tmpdir()
          const tmpFile = path.join(tmpDir, `lc-completed-${gid}.html`)
          fs.writeFileSync(tmpFile, html, 'utf-8')
          win.loadFile(tmpFile)
          win.once('closed', () => {
            try { fs.unlinkSync(tmpFile) } catch (e) {}
          })
        } catch (e) {
          win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        }

        win.once('ready-to-show', () => {
          if (!isAliveWindow(win)) {
            completedTaskWindows.value.delete(gid)
            return
          }

          const windowTitle = t('task.task-completed-title') || '下载完成'
          try {
            win.setTitle(windowTitle)
          } catch (e) {
            completedTaskWindows.value.delete(gid)
            return
          }

          if (hideAppMenu) {
            if (typeof win.setMenuBarVisibility === 'function') {
              win.setMenuBarVisibility(false)
            }
            if (win.setMenu) {
              win.setMenu(null)
            }
          }

          win.show()
          win.focus()
          // Keep on top briefly then allow normal stacking
          try {
            win.setAlwaysOnTop(true)
            setTimeout(() => {
              try {
                if (isAliveWindow(win)) {
                  win.setAlwaysOnTop(false)
                }
              } catch (e) {}
            }, 100)
          } catch (e) {
            console.warn('[LinkCore] Failed to set always on top:', e.message)
          }
        })
      } catch (e) {
        console.error('[LinkCore] Failed to open completed task window:', e)
      }
      }

// Helper method to format bytes
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Helper method to escape HTML special characters
function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function handleTaskListChange(list) {
  const prev = lastTaskStatuses.value || {}
  // 应用启动后的首次列表快照只记录基线状态，
  // 避免把启动前已在下载的任务误判为“新开始”而自动弹窗
  const isInitialSnapshot = !taskStatusesInitialized
  taskStatusesInitialized = true
  const autoOpened = autoOpenedProgressGids.value || new Set()
  const doneStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
  const currentGids = new Set()
  let candidate = null
  const newActiveTasks = []

  list.forEach(task => {
    const gid = task && task.gid ? `${task.gid}` : ''
    if (!gid) return
    currentGids.add(gid)
    const prevStatus = prev[gid]
    const currentStatus = task.status
    const isNewlyActive = currentStatus === TASK_STATUS.ACTIVE && prevStatus !== TASK_STATUS.ACTIVE && !autoOpened.has(gid)
    if (isNewlyActive) {
      newActiveTasks.push(task)
      if (!candidate) {
        candidate = task
      }
    }
  })

  const nextStatuses = { ...prev }
  list.forEach(task => {
    const gid = task && task.gid ? `${task.gid}` : ''
    if (!gid) return
    nextStatuses[gid] = task.status
  })
  Object.keys(nextStatuses).forEach(gid => {
    if (!currentGids.has(gid)) {
      delete nextStatuses[gid]
    }
  })
  lastTaskStatuses.value = nextStatuses

  const prefConfig = preferenceConfig.value || {}
  const autoOpenTaskProgressWindow = prefConfig.autoOpenTaskProgressWindow !== false
  const taskProgressWindowMode = prefConfig.taskProgressWindowMode || 'first'
  if (!isInitialSnapshot && autoOpenTaskProgressWindow && (candidate || newActiveTasks.length > 0)) {
    if (taskProgressWindowMode === 'all') {
      newActiveTasks.forEach(task => {
        const gid = task && task.gid ? `${task.gid}` : ''
        if (gid) {
          autoOpened.add(gid)
          openProgressWindowForTask(task)
        }
      })
    } else if (candidate) {
      const gid = candidate && candidate.gid ? `${candidate.gid}` : ''
      if (gid) {
        autoOpened.add(gid)
        openProgressWindowForTask(candidate)
      }
    }
  }

  list.forEach(task => {
    const gid = task && task.gid ? `${task.gid}` : ''
    if (!gid) return
    const isSeeding = checkTaskIsSeeder(task)
    if (doneStatuses.includes(task.status) && !isSeeding) {
      autoOpened.delete(gid)
    }
  })

  // Update existing progress windows
  const closeWhenMissingLists = ['all']

  progressWindows.value.forEach((win, gid) => {
    const current = list.find(item => item && `${item.gid}` === gid)
    if (!current) {
      if (closeWhenMissingLists.includes(taskStore.currentList || 'all')) {
        closeProgressWindowByGid(gid)
      } else {
        refreshProgressTaskDirectly()
      }
      return
    }
    const isSeeding = checkTaskIsSeeder(current)
    if (doneStatuses.includes(current.status) && !isSeeding) {
      closeProgressWindowByGid(gid)
    } else {
      updateProgressWindow(current)
    }
  })

  // Check for newly completed tasks and show completion window
  const showTaskCompletedWindow = prefConfig.showTaskCompletedWindow !== false

  if (showTaskCompletedWindow) {
    list.forEach(task => {
      const gid = task && task.gid ? `${task.gid}` : ''
      if (!gid) return
      const prevStatus = prev[gid]
      const currentStatus = task.status
      if (prevStatus && currentStatus === TASK_STATUS.COMPLETE && prevStatus !== TASK_STATUS.COMPLETE) {
        openCompletedTaskWindow(task)
      }
    })

    const disappearedGids = Object.keys(prev).filter(gid => {
      const prevStatus = prev[gid]
      if ([TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED].includes(prevStatus)) {
        const stillInList = list.some(task => task && `${task.gid}` === gid)
        return !stillInList
      }
      return false
    })

    if (disappearedGids.length > 0) {
      api.fetchTaskList({ type: 'all' })
        .then(allTasks => {
          if (!Array.isArray(allTasks)) return
          disappearedGids.forEach(gid => {
            const task = allTasks.find(t => t && `${t.gid}` === gid)
            if (task && task.status === TASK_STATUS.COMPLETE) {
              openCompletedTaskWindow(task)
            }
          })
        })
        .catch(err => {
          console.warn('[LinkCore] Failed to check disappeared tasks:', err)
        })
    }
  }
}
</script>

<style lang="scss">
  @import '@/components/Theme/Variables';
  @import '@/components/Theme/Light/Variables';

  .content-area {
    position: relative;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .el-dialog.task-plan-dialog {
    max-width: 360px;
    min-width: 320px;
    /* 不强制最小高度，让弹窗高度=内容（footer 自然贴底、按钮贴右下角），
       避免类型切换时弹窗底部出现大段空白 */
    min-height: 0;
    border-radius: 16px;
    /* 底部收紧：保存按钮距弹窗底边 ≈ 4px(padding) + 6px(footer 内居中) = 10px */
    padding-bottom: 4px;
    /* 放开裁剪，让 ExtendSelect 的选项区能延伸到弹窗外。
       用 !important 防止被 .theme-dark .el-dialog { overflow: hidden } 覆盖
       （深色模式同名规则特异性同为 0,2,0，靠加载顺序胜出，致选项区被裁剪） */
    overflow: visible !important;
  }

  /* EP 默认 .el-overlay 有 overflow:auto，会裁剪延伸出去的选项区。
     通过 modal-class 直接选中 .el-overlay，放开裁剪限制 */
  .el-overlay.task-plan-overlay {
    overflow: visible;
  }

  /* EP 默认 .el-overlay-dialog 有 overflow:auto，会裁剪延伸出去的选项区 */
  .el-overlay-dialog:has(> .el-dialog.task-plan-dialog) {
    overflow: visible;
  }

  /* 弹窗 body 也必须放开裁剪，否则 ExtendSelect 选项区在 body 内被裁切 */
  .el-dialog.task-plan-dialog .el-dialog__body {
    overflow: visible;
  }

  .el-dialog.task-plan-dialog .task-plan-dialog-title {
    display: flex;
    align-items: center;
    margin-right: 28px;
    margin-top: -8px;
  }

  /* 任务计划分类切换滑块：项内边距加大 */
  .task-plan-dialog .task-type-slider .lc-segmented__item {
    padding: 0 20px;
  }

  .el-dialog.task-plan-dialog .el-select {
    width: 100%;
  }

  /* 任务计划弹窗内第二个选择框（时间选择器）与 ExtendSelect 选择框同规格：
     视觉高度 26px（24px 内容 + 1px 边框），同圆角、同字号。
     直接写死高度：EP 的 --el-input-height 变量在根元素上解析，覆盖子元素无效 */
  .el-dialog.task-plan-dialog .el-input__wrapper {
    height: 26px;
    border-radius: var(--lc-radius-dropdown);
  }

  .el-dialog.task-plan-dialog .el-input__inner {
    height: 24px;
    line-height: 24px;
    font-size: 14px;
  }

  /* 表单项（两个选择框所在行）垂直间距统一 */
  .el-dialog.task-plan-dialog .el-form-item {
    margin-bottom: 12px;
  }

  .el-dialog.task-plan-dialog .el-form-item:last-of-type {
    margin-bottom: 0;
  }

  .el-dialog.task-plan-dialog .el-dialog__footer {
    padding: 0;
    background-color: transparent;
    /* 兜底定位上下文：即使 .dialog-footer 的定位被覆盖，
       提交按钮也始终锚定在 footer（弹窗底部）内 */
    position: relative;
  }

  .task-plan-dialog .dialog-footer {
    display: flex;
    /* 按钮贴 footer 底部：增高的空间留在按钮上方，拉开与表单内容的间距，
       底部仍由 padding-bottom + 弹窗 padding-bottom 控制为 10px */
    align-items: flex-end;
    /* 右对齐：按钮固定在弹窗右下角，不随弹窗内容增减漂移 */
    justify-content: flex-end;
    min-height: 56px;
    padding: 0 0 6px;
    box-sizing: border-box;
  }

  /* 保存按钮固定在弹窗右下角：flex 右对齐 + 弹窗 padding 提供边缘间距。
     不再使用 absolute 定位（依赖定位上下文，内容变化时位置会漂移） */
  .task-plan-dialog .dialog-submit-btn {
    height: 28px;
    padding: 0 16px;
    border-radius: 8px !important;
  }

  /* 时间选择器下拉面板：提升 z-index，避免被弹窗遮罩
     （macOS 原生透明模式下遮罩 z-index 提到 5100）遮挡导致显示不全 */
  .task-plan-time-popper {
    z-index: 5200 !important;
  }

  .el-dialog.task-plan-dialog .el-dialog__footer::before {
    display: none;
  }
</style>
