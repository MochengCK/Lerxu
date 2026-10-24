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
      <mo-preference-dialog
        v-if="preferenceVisible"
      />
    </Teleport>
    <mo-dragger />
  </el-container>
</template>

<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, defineAsyncComponent, toRaw } from 'vue'
import {
  showMessageBox,
  openTaskWindow,
  sendToTaskWindow,
  taskWindowAction,
  onTaskWindowEvent
} from '@/utils/nativeBridge'
import { commands } from '@/components/CommandManager/instance'
import { TASK_STATUS, APP_THEME } from '@shared/constants'
import { parsePieceStatuses, combinePieceStatuses } from '@shared/utils/piece-status'
import themeTokens from '@/utils/themeTokens'
import api from '@/api'
import taskHistory from '@/api/TaskHistory'
import path from 'node:path'
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
import { resolveProgressView, pairDisplayName } from '@/utils/taskPair'
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
const moPreferenceDialog = defineAsyncComponent(() => import('@/components/Preference/PreferenceDialog'))
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
const { addTaskVisible, addTaskType, systemTheme, preferenceVisible } = storeToRefs(appStore)
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
// 窗口句柄表用 shallowRef：模板不渲染它们，**不需要深响应式**；更重要的是
// `ref(new Map())` 会把存进去的 handle 在读取/遍历时包成响应式代理，
// 句柄里的 `w === handle` 身份比较会永远为 false（进度窗曾因此全空）。
const progressWindows = shallowRef(new Map())
const progressTaskGids = ref(new Set())
const completedTaskWindows = shallowRef(new Map())
let _offTaskWindowReady = null
let _offTaskWindowClosed = null

/** 按 IPC key 找句柄（进度窗与完成窗共用一套浮窗通道） */
function findTaskWindowHandle (key) {
  const target = `${key || ''}`
  if (!target) return null
  for (const handle of progressWindows.value.values()) {
    if (handle && handle.key === target) return handle
  }
  for (const handle of completedTaskWindows.value.values()) {
    if (handle && handle.key === target) return handle
  }
  return null
}

/**
 * 浮窗关闭：先把句柄从两张表里摘掉，再触发它自己的 closed 回调。
 *
 * 顺序不能反：`isDestroyed()` 是按"还在不在表里"判的，回调里若还要用
 * `isAliveWindow(win)`（原 `win.on('closed')` 的语义就是"已删表"），
 * 先 emit 会让它以为窗口还活着。
 */
function forgetTaskWindow (key) {
  const target = `${key || ''}`
  let handle = null
  for (const [gid, value] of progressWindows.value.entries()) {
    if (value && value.key === target) {
      handle = handle || value
      progressWindows.value.delete(gid)
      progressTaskGids.value.delete(gid)
    }
  }
  for (const [gid, value] of completedTaskWindows.value.entries()) {
    if (value && value.key === target) {
      handle = handle || value
      completedTaskWindows.value.delete(gid)
    }
  }
  if (handle) {
    handle.emitClosed()
  }
}
let _modalObserver = null
let taskStatusesInitialized = false

// --- 单任务"完成后弹窗"偏好（独立进度窗口设置分类） ---
// gid → boolean；未记录的任务默认 true（跟随全局 showTaskCompletedWindow）。
// 持久化到 localStorage，跨应用重启保留。
const COMPLETE_POPUP_PREFS_KEY = 'lerxu-progress-complete-popup-prefs'
function loadCompletePopupPrefs () {
  try {
    const raw = localStorage.getItem(COMPLETE_POPUP_PREFS_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch (e) {
    return {}
  }
}
function isCompletePopupEnabled (gid) {
  if (!gid) return true
  const prefs = loadCompletePopupPrefs()
  const v = prefs[gid]
  return v === undefined ? true : !!v
}
function setCompletePopupPref (gid, enabled) {
  if (!gid) return
  const prefs = loadCompletePopupPrefs()
  prefs[gid] = !!enabled
  try {
    localStorage.setItem(COMPLETE_POPUP_PREFS_KEY, JSON.stringify(prefs))
  } catch (e) {}
}
function handleTaskProgressSetCompletePopup (payload) {
  const data = payload || {}
  const gid = data.gid ? `${data.gid}` : ''
  if (gid && data.enabled !== undefined) {
    setCompletePopupPref(gid, data.enabled)
  }
}

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
  // 独立进度窗口"完成后弹窗"单任务开关：经主进程转发回主窗口的 IPC
  // 命令由 Ipc.vue 走 commands.execute 分发（只查 register 注册表），
  // 必须 register 而非 on——此前用 on 注册导致监听永远不触发，偏好
  // 从未写入 localStorage，重启后勾选状态恢复为默认勾选。
  commands.register('task-progress:set-complete-popup', handleTaskProgressSetCompletePopup)
  commands.on('task-progress:auto-open', handleTaskProgressAutoOpen)
  preloadHeavyOverlays()
  // 浮窗由主进程创建：就绪/关闭事件回到这里，驱动首次数据与清理
  _offTaskWindowReady = onTaskWindowEvent('task-window:ready', ({ key }) => {
    const handle = findTaskWindowHandle(key)
    if (handle) handle.emitReady()
  })
  _offTaskWindowClosed = onTaskWindowEvent('task-window:closed', ({ key }) => {
    forgetTaskWindow(key)
  })
})

// 预热重型弹层组件：mo-task-detail / mo-add-task 均为 defineAsyncComponent，
// 首次点击"任务详情/新建任务"时才拉取并解析 chunk，导致弹层延迟数秒才出现。
// 启动空闲时提前触发同样的动态 import（模块 promise 全局共享），
// 之后 defineAsyncComponent 立即 resolve，弹层即点即出。
function preloadHeavyOverlays () {
  const preload = () => {
    import('@/components/TaskDetail/TaskDetailDrawer')
    import('@/components/Task/AddTask')
  }
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(preload, { timeout: 3000 })
  } else {
    setTimeout(preload, 1500)
  }
}
onBeforeUnmount(() => {
  if (_offTaskWindowReady) {
    _offTaskWindowReady()
    _offTaskWindowReady = null
  }
  if (_offTaskWindowClosed) {
    _offTaskWindowClosed()
    _offTaskWindowClosed = null
  }
  if (_modalObserver) {
    try {
      _modalObserver.disconnect()
      _modalObserver = null
    } catch (e) {}
  }
  commands.off('show-task-progress', handleShowTaskProgress)
  commands.off('task-progress:control', handleTaskProgressControl)
  commands.unregister('task-progress:set-complete-popup')
  commands.off('task-progress:auto-open', handleTaskProgressAutoOpen)
})

// --- Methods ---

      /**
       * 任务浮窗句柄。
       *
       * 窗口本身现在归主进程所有（见 main/core/NativeBridge.js）；这里保留一个
       * 与 BrowserWindow 同形状的薄句柄，让原有调用点（setTitle / close /
       * webContents.send / isDestroyed…）不必整体重写。所有操作都是 IPC，
       * 不再像 remote 那样同步阻塞渲染线程。
       */
      function createTaskWindowHandle (ipcKey) {
        const handle = {
          key: ipcKey,
          __lerxuPairId: '',
          _readyCbs: [],
          _closedCbs: [],
          once (event, cb) {
            if (event === 'ready-to-show') handle._readyCbs.push(cb)
            if (event === 'closed') handle._closedCbs.push(cb)
            return handle
          },
          on (event, cb) {
            if (event === 'closed') handle._closedCbs.push(cb)
            return handle
          },
          emitReady () {
            const list = handle._readyCbs.splice(0)
            list.forEach((fn) => { try { fn() } catch (e) {} })
          },
          emitClosed () {
            const list = handle._closedCbs.splice(0)
            list.forEach((fn) => { try { fn() } catch (e) {} })
          },
          isDestroyed () {
            // ⚠️ 这两张表用 shallowRef 存的是原始 Map，但**别指望调用方一定这么写**：
            // 一旦换回 `ref(new Map())`，get/values() 返回的就是响应式代理，与闭包里
            // 这个原始 handle 做 `===` 永远为 false —— 句柄会被判成"已销毁"，首帧
            // 数据推不出去、条目被 updateProgressWindow 删掉，窗口一直是空的
            // （2026-10-23 实际踩到）。所以这里统一 toRaw 回到原始 Map 再比身份。
            for (const w of toRaw(progressWindows.value).values()) {
              if (w === handle) return false
            }
            for (const w of toRaw(completedTaskWindows.value).values()) {
              if (w === handle) return false
            }
            return true
          },
          show () { taskWindowAction(handle.key, 'present') },
          focus () { taskWindowAction(handle.key, 'present') },
          setTitle (title) { taskWindowAction(handle.key, 'set-title', title) },
          setBackgroundColor (color) { taskWindowAction(handle.key, 'set-background', color) },
          close () { taskWindowAction(handle.key, 'close') },
          get webContents () {
            return {
              send: (channel, payload) => sendToTaskWindow(handle.key, channel, payload)
            }
          }
        }
        return handle
      }

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
      /**
       * 按 gid 找列表里的记录。
       *
       * 「一对音视频」折叠成一条记录之后，进度窗口/事件带过来的可能是**成员**的
       * gid（画面流或声音流），所以除了记录自身的 gid 还要认 pairGids。
       */
      function findTaskRowByGid(list, gid) {
        const key = `${gid || ''}`
        if (!key) {
          return null
        }
        const rows = Array.isArray(list) ? list : []
        const direct = rows.find(item => item && `${item.gid}` === key)
        if (direct) {
          return direct
        }
        return rows.find(item => item && Array.isArray(item.pairGids) && item.pairGids.some(g => `${g}` === key)) || null
      }
      /**
       * 引擎任务对象上没有配对信息（pairId / pairRole 只存在任务历史里）。
       * 自动开窗发生在 addUri 刚返回、任务列表还没折叠的时刻，这里按 gid
       * 从历史里补出配对身份，避免画面流/声音流各开一个窗口。
       */
      function getPairMetaFromHistory(gid) {
        const key = `${gid || ''}`
        if (!key) {
          return null
        }
        try {
          const entry = (taskHistory.getAllHistory() || []).find(item => item && `${item.gid || ''}` === key)
          const pairId = entry && entry.pairId != null ? `${entry.pairId}` : ''
          if (pairId) {
            return {
              pairId,
              pairRole: entry.pairRole != null ? `${entry.pairRole}` : ''
            }
          }
        } catch (e) {}
        return null
      }
      /**
       * 完成弹窗可能拿到的是**单条成员任务**（成员从列表消失时由 fetchTaskList
       * 兜底找到的原始引擎任务），它身上没有 pairDisplayName，直接按文件路径取名
       * 就会退回 `xxx_video.mp4`。这里按 pairId 找回这一对的折叠记录或合并完成时
       * 写入的产物名，保证弹窗和卡片一样显示最终合并产物名。
       */
      function resolveCompletedDisplayName(task) {
        if (!task) return ''
        // 折叠记录本身：没被判定为合并失败时，预览名就是最终产物名（容器跟合并格式）
        if (task.pairDisplayName && task.mergeSkipped !== true && Number(task.pairCount) >= 2) {
          return `${task.pairDisplayName}`
        }
        const gid = `${task.gid || ''}`
        if (!gid) return ''
        const meta = getPairMetaFromHistory(gid)
        const pairId = meta && meta.pairId ? `${meta.pairId}` : (task.pairId != null ? `${task.pairId}` : '')
        if (!pairId) return ''
        // 先找这一对的折叠记录（列表刷新后主 gid 可能已换成合并产物那一行）
        for (const rows of [taskList.value || [], taskStore.allTaskList || []]) {
          const row = rows.find(item => item && `${item.pairId || ''}` === pairId && item.mergeSkipped !== true && item.pairDisplayName)
          if (row) return `${row.pairDisplayName}`
        }
        // 再取成员 gid 上最新写入的显示名：合并完成时写的是产物名，
        // 比下载阶段缓存的零件名（`xxx_video.mp4`）更新。
        let memberGids = []
        try {
          memberGids = (taskHistory.getAllHistory() || [])
            .filter(item => item && `${item.pairId || ''}` === pairId)
            .map(item => `${item.gid || ''}`)
            .filter(Boolean)
        } catch (e) {}
        const nameMap = taskStore.taskDisplayNames || {}
        const touchedMap = taskStore.taskDisplayNamesTouchedAt || {}
        let bestName = ''
        let bestTouched = -1
        for (const memberGid of [gid, ...memberGids]) {
          const name = nameMap[memberGid]
          if (!name) continue
          const touched = Number(touchedMap[memberGid]) || 0
          if (touched >= bestTouched) {
            bestTouched = touched
            bestName = `${name}`
          }
        }
        if (bestName) return bestName
        // 收尾时另一半的配对历史可能已经被清掉：用成员文件名算出产物名，
        // 再去显示名缓存里找同名产物（合并成功时写在存活的那条 gid 上）。
        try {
          const cfg = preferenceConfig.value || {}
          const preview = pairDisplayName({ pairMembers: [task] }, cfg.mergeFormat || '')
          const previewStem = `${preview || ''}`.replace(/\.[^.]+$/, '').replace(/\s+\(\d+\)$/, '')
          if (previewStem) {
            const productName = Object.keys(nameMap)
              .map(key => `${nameMap[key] || ''}`)
              .find(name => name && name.replace(/\.[^.]+$/, '').replace(/\s+\(\d+\)$/, '') === previewStem)
            if (productName) return productName
          }
        } catch (e) {}
        return ''
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
        let task = findTaskRowByGid(list, gid)
        if (!task) {
          try {
            task = await api.fetchTaskItem({ gid })
          } catch (e) {
            task = null
          }
          if (!task || !task.gid) {
            return
          }
          // fetchTaskItem 返回的是引擎原始任务（不带 pairId）：等待期间列表
          // 可能已经刷新并完成折叠，优先改用折叠记录，避免按单条流开窗。
          const row = findTaskRowByGid(taskList.value || [], gid)
          if (row) {
            task = row
          }
        }
        autoOpened.add(`${task.gid}`)
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
          const task = findTaskRowByGid(list, gid)
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
                pendingBarBg: tc.pendingBarBg,
                pendingBarInner: tc.pendingBarInner,
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
            updateProgressWindow(task, gid)
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
        let task = findTaskRowByGid(list, gid)
        if (!task) {
          // 当前列表可能被筛选/分类过滤掉，退回全量列表找折叠记录
          task = findTaskRowByGid(taskStore.allTaskList || [], gid)
        }
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
          defaultName: t('task.get-task-name'),
          hashFallbackLabel: t('task.magnet-pending-name')
        })
        if (action === 'pause') {
          // 同主窗口：只在真的暂停了才弹"已暂停"，否则如实说"当前无法暂停"
          taskStore.pauseTask(task)
            .then((res) => {
              if (res && res.changed > 0) {
                msg.info(t('task.download-pause-message', { taskName }))
              } else {
                msg.warning(t('task.pause-task-unavailable', { taskName }))
              }
            })
            .catch((e) => {
              msg.error(t('task.pause-task-fail', { taskName }))
            })
          return
        }
        if (action === 'resume') {
          taskStore.resumeTask(task)
            .then((res) => {
              if (!(res && res.changed > 0)) {
                msg.warning(t('task.resume-task-unavailable', { taskName }))
              }
            })
            .catch((e) => {
              msg.error(t('task.resume-task-fail', { taskName }))
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
        // 「一对音视频」在列表里折叠成一条记录，但磁盘上是两个文件（画面流 + 声音流）：
        // 带文件删除必须按成员逐个清掉，否则只会删掉一条流，另一条留在下载目录里。
        const members = Array.isArray(task && task.pairMembers) ? task.pairMembers.filter(Boolean) : []
        const targets = members.length > 1 ? members : [task]
        try {
          for (const target of targets) {
            await moveTaskFilesToTrash(target, downloadingFileSuffix, config)
          }
        } catch (err) {
          console.warn('[Lerxu] deleteTaskFilesFromProgress error:', err)
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
            console.warn('[Lerxu] Failed to fetch fresh task for deletion:', e.message)
          }
          // 预获取引擎选项（dir + out），避免任务被 aria2 删除后 getOption 失败导致文件路径无法解析
          try {
            const opt = await api.getOption({ gid: originalTask.gid })
            if (opt) {
              taskForDeletion = { ...taskForDeletion, _engineOptions: opt }
            }
          } catch (e) {
            console.warn('[Lerxu] Failed to pre-fetch getOption for deletion:', e.message)
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
        showMessageBox({
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

          // 当前列表被筛选掉时，用**全量折叠列表**定位这条记录。
          // 「一对音视频」必须仍然按聚合口径喂进度窗口：直接
          // api.fetchTaskItem(gid) 拿到的是单条流（画面流）的原始状态，
          // 会让窗口显示单流进度，并在画面流下完时被误判成"已完成/可关闭"。
          const row = findTaskRowByGid(taskStore.allTaskList || [], gid)
          if (row) {
            if (doneStatuses.includes(row.status) && !checkTaskIsSeeder(row)) {
              closeProgressWindowByGid(gid)
              return
            }
            updateProgressWindow(row, gid)
            return
          }

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
      /**
       * 这条记录的合并进度（0~100）；没有可用上报时返回 -1。
       *
       * 合并进度挂在「后下完的那条流」的 gid 上（合并是它的完成事件触发的），
       * 未必是记录的主 gid（画面流），所以要按记录自身 + pairGids 一起找。
       * `waitingForPair` 的条目是「先下完那条」在等另一半，不是真进度，跳过。
       */
      function resolvePairMergePercent(status, gid, pairGids) {
        if (`${status || ''}` !== TASK_STATUS.MERGING) {
          return -1
        }
        const map = taskStore.mergeProgresses || {}
        const candidates = [`${gid || ''}`, ...(Array.isArray(pairGids) ? pairGids : []).map(g => `${g}`)]
        for (const key of candidates) {
          if (!key) continue
          const entry = map[key]
          if (!entry || entry.waitingForPair) continue
          const v = Number(entry.percent)
          if (Number.isFinite(v)) {
            return Math.max(0, Math.min(100, v))
          }
        }
        return -1
      }

      function buildProgressPayload(task) {
        const taskData = task || {}
        const completed = Number(taskData.completedLength || 0)
        const total = Number(taskData.totalLength || 0)
        const speed = Number(taskData.downloadSpeed || 0)
        const connections = Number(taskData.connections || 0)
        const percent = total > 0 ? Math.floor((completed * 100) / total) : 0
        // 「一对音视频」折叠记录：标题用折叠后的产物名（与任务卡片一致），
        // 并把成员 gid 一并发下去。独立进度窗口自己还有一条 1Hz 轮询
        // （task-progress:fetch），它必须按同一批成员求和——否则推送是
        // "两条流的总量"、轮询是"画面流一条"，进度条会在两个数值之间来回跳。
        const pairGids = Array.isArray(taskData.pairGids)
          ? taskData.pairGids.map(g => `${g}`).filter(Boolean)
          : []
        const pairName = `${taskData.pairDisplayName || ''}`.trim()
        // 这条记录是不是「一对音视频」折叠出来的。**不能**用 pairGids.length > 1
        // 判断：某个成员被引擎清理后记录里就只剩一条了（pairGids 变短），但这条
        // 记录仍然是"一对"，进度窗口也必须继续按一对处理。
        const isPair = taskData.isPair === true
        const title = pairName || getTaskName(taskData, {
          defaultName: t('task.get-task-name'),
          hashFallbackLabel: t('task.magnet-pending-name'),
          maxLen: -1
        })
        const completedText = bytesToSize(completed, 2)
        const totalText = total > 0 ? bytesToSize(total, 2) : ''
        const sizeText = totalText ? `${completedText} / ${totalText}` : completedText
        const speedValue = speed > 0 ? `${bytesToSize(speed, 2)}/s` : `${bytesToSize(0, 2)}/s`

        // 计算平均速度：引擎直供 averageSpeed（active 阶段实时累计、
        // 随会话持久化，1Hz 刷新）；旧数据源（本地采样/历史均值）兜底
        const gid = taskData && taskData.gid ? `${taskData.gid}` : ''
        let avgSpeed = 0
        if (taskData.averageSpeed != null) {
          const v = Number(taskData.averageSpeed)
          avgSpeed = Number.isFinite(v) && v >= 0 ? v : 0
        } else {
          const speedSamplesMap = taskStore.taskSpeedSamples || {}
          const speedSamples = gid && Array.isArray(speedSamplesMap[gid]) ? speedSamplesMap[gid] : []
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
        }
        const avgSpeedValue = avgSpeed > 0 ? `${bytesToSize(avgSpeed, 2)}/s` : `${bytesToSize(0, 2)}/s`

        // 解析分片进度 - 与任务详情活动图表 (TaskGraphic) 保持一致的 6 级分类。
        // 映射规则抽到 @shared/utils/piece-status 共享实现，与主进程
        // task-progress:fetch 同源，避免两条数据流状态映射不一致闪烁；
        // wantedBitfield 非空时，未选择文件覆盖的格显示为「未选择」，
        // 与「未下载」区分（否则任务完成后末尾残留灰格）
        const numPieces = Number(taskData.numPieces || 0)
        // 一对音视频：把两条流各自的位图**合成一张**网格（取每格的最小值，
        // 即"画面与声音对应的那一段都下完才算下完"）。此前这里对配对一律
        // 不下发分片，独立进度窗口的「分片」页对一对音视频永远是「无分片数据」。
        // 注意引擎的位图是**下载开始之后**才有的（零进度时 bitfield 为空），
        // 所以刚开始时只有先开工的那条流有网格，两条都没开工才显示无分片数据。
        const pieces = isPair
          ? combinePieceStatuses((Array.isArray(taskData.pairMembers) ? taskData.pairMembers : [])
            .map(m => parsePieceStatuses(
              m && m.bitfield,
              m && m.partialBitfield,
              Number((m && m.numPieces) || 0),
              (m && m.wantedBitfield) || ''
            )))
          : parsePieceStatuses(
            taskData.bitfield,
            taskData.partialBitfield,
            numPieces,
            taskData.wantedBitfield || ''
          )
        let piecesData = null
        if (pieces && pieces.length > 0) {
          piecesData = {
            // 合成网格的格数就是 pieces 的长度（配对时两条流分片数不同）
            numPieces: isPair ? pieces.length : numPieces,
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
        // 「两个文件都下完、可以合并了」（含正在合并）：进度窗口据此把底条
        // 变成满格黄底并叠加绿色合并进度覆盖层。判据复用任务卡片那条
        // resolveProgressView（唯一实现），窗口与卡片因此永远同一口径。
        const mergePercent = resolvePairMergePercent(status, gid, pairGids)
        const pairPending = isPair && resolveProgressView({
          isPair: true,
          merged: taskData.dashMerged === true || taskData.pairMerged === true,
          memberCount: pairGids.length,
          status,
          total,
          completed,
          mergePercent
        }).mode !== 'plain'
        return {
          gid: taskData && taskData.gid ? `${taskData.gid}` : '',
          title,
          status,
          percent,
          percentText: `${percent}%`,
          // 原始字节数与速度：独立进度窗口的进度条动画（与任务卡片同一套）
          // 要按速度外推"估计进度"，只给百分比它只能一步步跳
          completedLength: completed,
          totalLength: total,
          downloadSpeed: speed,
          nameText: title,
          // 「一对音视频」记录的成员 gid（普通任务为空数组）：
          // 进度窗口据此把自身的轮询也按键求和
          pairGids,
          pairMemberCount: pairGids.length,
          // 这条记录是"一对音视频"（成员被清理后 pairGids 可能只剩一条，
          // 所以单独给一个稳定标记，窗口/主进程据此保持一对的口径）
          isPair,
          // 已经合并出产物（记录的 dashMerged）：进度窗口据此把黄底换成绿底
          merged: taskData.dashMerged === true || taskData.pairMerged === true,
          // 「两个文件都下完、可以合并了（含合并中）」：窗口把底条变黄并
          // 用绿色覆盖层画合并进度
          pairPending,
          // 合并进度（0~100，-1 = 还没有上报）。窗口拿它画绿色覆盖层 ——
          // 否则下载 100% 之后进度条只能停在满格，合并那几秒完全看不出在动。
          mergePercent,
          isPaused,
          pendingSelection,
          // 直播录制（引擎 isLive）：进度窗口的进度条改走"录制动画"（滚动斜纹，
          // 与任务卡片同一套）。轮询路径（主进程 task-progress:fetch）也带这个
          // 字段 —— 两条 1Hz 数据流必须同口径。
          isLive: taskData.isLive === true,
          // 单任务"完成后弹窗"偏好（进度窗口设置分类的 checkbox 初始值）
          completePopupEnabled: isCompletePopupEnabled(gid),
          // 与主进程 task-progress:fetch 返回保持一致，
          // 避免事件推送缺字段时滑块按钮文本被清空导致宽度闪烁
          tabInfoText: t('task.task-progress-info'),
          tabPiecesText: t('task.task-pieces-progress'),
          piecesEmptyText: t('task.task-no-pieces-data'),
          // tab 按钮文案：信息/分片用完整文案，设置用短文案
          tabInfoShort: t('task.task-progress-info-short'),
          tabPiecesShort: t('task.task-pieces-progress-short'),
          tabSettingsShort: t('task.task-settings-short'),
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

        // 检查是否已经有窗口。一条记录只能有一个窗口：「一对音视频」可能
        // 在折叠完成前就先按某一条流的 gid 开过窗（自动开窗），此时按记录
        // gid 再开一个就会出现两个窗口各显示一条流。
        const windowKeys = [gid, ...(Array.isArray(task.pairGids) ? task.pairGids.map(g => `${g}`) : [])]
          .filter((v, i, arr) => v && arr.indexOf(v) === i)
        let existingKey = ''
        let existingWindow = null
        for (const key of windowKeys) {
          const win = progressWindows.value.get(key)
          if (isAliveWindow(win)) {
            existingKey = key
            existingWindow = win
            break
          }
        }
        // 还要按 pairId 认一遍：自动开窗（task-progress:auto-open 按 gid 触发，
        // 画声两条流各发一次）很可能在折叠成一条记录**之前**就已经按某一条流的
        // gid 开过窗，这时上面按 gid 匹配不上，会再开一个 —— 两个窗口叠在一起，
        // 看起来就是"信息在两个任务之间跳"。一条记录（一个 pairId）只留一个窗口。
        // 自动开窗拿到的引擎原始任务不带 pairId，按 gid 从任务历史补齐，
        // 否则两条流会被当成两个普通任务、各开一个窗口。
        let pairId = task && task.pairId ? `${task.pairId}` : ''
        if (!pairId) {
          const pairMeta = getPairMetaFromHistory(gid)
          if (pairMeta) {
            pairId = pairMeta.pairId
          }
        }
        if (!isAliveWindow(existingWindow) && pairId) {
          for (const [key, win] of progressWindows.value.entries()) {
            if (isAliveWindow(win) && `${win.__lerxuPairId || ''}` === pairId) {
              existingKey = key
              existingWindow = win
              break
            }
          }
        }
        if (isAliveWindow(existingWindow)) {
          // 窗口可能是在折叠前按单条流开的，补记配对身份，后续去重才能命中
          if (pairId && !existingWindow.__lerxuPairId) {
            existingWindow.__lerxuPairId = pairId
          }
          // 窗口显示/激活/置顶都在主进程（`present` = restore + show + focus），
          // 页面这边只发一条指令
          try {
            existingWindow.focus()
          } catch (e) {
            console.warn('[Lerxu] Failed to activate existing progress window:', e.message)
          }
          updateProgressWindow(task, existingKey)
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

        // 窗口大小不允许手动拖拽调整，尺寸固定为 360x230；控制行 top 锚定
        // （连接面板向下展开时按钮保持原位），tab 按钮用短文案避免横向溢出
        const defaultWidth = 360
        const defaultHeight = 230

        const win = createTaskWindowHandle(`progress:${gid}`)
        progressWindows.value.set(gid, win)
        // 记下 pairId：同一条「一对音视频」记录只允许存在一个进度窗口
        if (pairId) {
          win.__lerxuPairId = pairId
        }

        win.on('closed', () => {
          progressWindows.value.delete(gid)
          progressTaskGids.value.delete(gid)
        })
        const html = buildProgressWindowHtml(useCustomFrame, isMac, getThemeColors)
        // 窗口创建 / 临时 HTML 落盘 / 显示时机（含置顶与取消置顶）都交给主进程，
        // 页面这边只负责把首屏数据与标题补上
        openTaskWindow({
          key: win.key,
          kind: 'progress',
          html,
          hideMenu: hideAppMenu,
          backgroundColor: getThemeColors().bodyBg,
          options: {
            width: defaultWidth,
            height: defaultHeight,
            resizable: false,
            minimizable: true,
            maximizable: false,
            useContentSize: true,
            frame: !useCustomFrame,
            titleBarStyle: isMac ? 'hiddenInset' : 'default',
            icon,
            parent: null,
            modal: false
          }
        }).then((result) => {
          if (!result || !result.ok) {
            forgetTaskWindow(win.key)
          }
        }).catch((e) => {
          console.error('[Lerxu] Failed to open progress window:', e)
          forgetTaskWindow(win.key)
        })
        win.once('ready-to-show', () => {
          if (!isAliveWindow(win)) {
            return
          }
          const payload = buildProgressPayload(task)
          const windowTitle = t('task.task-info-dialog-title', {
            title: payload.title
          })
          try {
            win.setTitle(windowTitle)
          } catch (e) {
            forgetTaskWindow(win.key)
            return
          }
          updateProgressWindow(task)
        })
      }
      async function updateProgressWindow(task, windowGid = '') {
        if (!task || !task.gid) {
          return
        }
        const gid = task.gid
        // 窗口 key 未必等于记录自身的 gid：「一对音视频」折叠记录的 gid 是
        // 画面流那条，但窗口可能是按声音流 gid 打开的（自动开窗时列表里
        // 还是两条原始任务），所以要允许调用方显式指定窗口 key。
        const key = `${windowGid || gid}`
        const win = progressWindows.value.get(key)
        if (!isAliveWindow(win)) {
          progressWindows.value.delete(key)
          progressTaskGids.value.delete(key)
          return
        }
        // 窗口可能是在折叠成记录之前按单条流开的；拿到折叠记录后补记
        // 配对身份，handleTaskListChange 才能把同一对的多余窗口收掉。
        const pairId = task.pairId ? `${task.pairId}` : ''
        if (pairId && !win.__lerxuPairId) {
          win.__lerxuPairId = pairId
        }
        const payload = buildProgressPayload(task)
        const taskSpeed = Number(task.downloadSpeed) || 0

        // 只在任务活跃或等待状态时获取连接数，暂停时不显示
        if (task.status === TASK_STATUS.ACTIVE || task.status === TASK_STATUS.WAITING) {
          // 「一对音视频」按成员汇总连接列表（与进度/速度同口径，主进程轮询
          // 路径也是同一套汇总），否则两条 1Hz 数据流会给出一张/两张表
          const memberGids = Array.isArray(task.pairGids) && task.pairGids.length > 0
            ? task.pairGids.map(g => `${g}`).filter(Boolean)
            : [gid]
          try {
            const collected = await Promise.all(
              memberGids.map(g => api.fetchTaskServers({ gid: g }).catch(() => []))
            )
            const servers = collected.flat().filter(Boolean)
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
          progressWindows.value.delete(key)
          progressTaskGids.value.delete(key)
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
      /**
       * 一条「一对音视频」记录只允许一个进度窗口。
       *
       * 自动开窗可能在列表折叠前按两条流各开一次（窗口 key 是各自的 gid），
       * 折叠完成后两个窗口都还在。这里在列表刷新时认一遍 pairId：同一对
       * 只保留一个（优先保留记录主 gid 的窗口），其余关掉。
       */
      function closeDuplicatePairProgressWindows(list) {
        const keptByPair = new Map()
        const staleKeys = []
        progressWindows.value.forEach((win, key) => {
          if (!isAliveWindow(win)) {
            return
          }
          const row = findTaskRowByGid(list, key)
          const pairId = row && row.pairId
            ? `${row.pairId}`
            : `${win.__lerxuPairId || ''}`
          if (!pairId) {
            return
          }
          const keptKey = keptByPair.get(pairId)
          if (keptKey === undefined) {
            keptByPair.set(pairId, key)
            return
          }
          const rowGid = row && row.gid ? `${row.gid}` : ''
          if (rowGid && `${key}` === rowGid) {
            // 当前窗口就是记录主 gid 的窗口：换它留下
            staleKeys.push(keptKey)
            keptByPair.set(pairId, key)
            return
          }
          staleKeys.push(key)
        })
        staleKeys.forEach(closeProgressWindowByGid)
      }

      // Open a window to show task completion notification
      function openCompletedTaskWindow(task) {
        try {
        console.log('[Lerxu] openCompletedTaskWindow called:', task)
        if (!task) {
          console.log('[Lerxu] No task provided')
          return
        }
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) {
          console.log('[Lerxu] No gid found in task')
          return
        }
        console.log('[Lerxu] Opening completed task window for gid:', gid)

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

        const win = createTaskWindowHandle(`completed:${gid}`)
        completedTaskWindows.value.set(gid, win)

        win.on('closed', () => {
          completedTaskWindows.value.delete(gid)
        })

        const html = buildCompletedTaskWindowHtml(task, useCustomFrame, isMac, t, getThemeColors, formatBytes, escapeHtml, resolveCompletedDisplayName(task))
        // 显示时机（macOS 用 showInactive + floating，避免把主窗口一并置前）
        // 也在主进程里，页面这边只需要把 HTML 交过去
        openTaskWindow({
          key: win.key,
          kind: 'completed',
          html,
          title: t('task.task-completed-title') || '下载完成',
          hideMenu: hideAppMenu,
          backgroundColor: getThemeColors().bodyBg,
          options: {
            width: 360,
            height: 200,
            resizable: false,
            minimizable: true,
            maximizable: false,
            useContentSize: true,
            frame: !useCustomFrame,
            titleBarStyle: isMac ? 'hiddenInset' : 'default',
            icon,
            parent: null,
            modal: false
          }
        }).then((result) => {
          if (!result || !result.ok) {
            forgetTaskWindow(win.key)
          }
        }).catch((e) => {
          console.error('[Lerxu] Failed to open completed task window:', e)
          forgetTaskWindow(win.key)
        })
        // 标题 / 菜单栏 / 显示时机（含 macOS 的 showInactive + floating）
        // 都由主进程在 ready-to-show 里处理，这里不再重复一次
      } catch (e) {
        console.error('[Lerxu] Failed to open completed task window:', e)
      }
      }

// Helper method to format bytes
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  // 1000 进制：与 Finder/资源管理器显示口径一致
  const k = 1000
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
    // 用 findTaskRowByGid：窗口 key 可能是「一对音视频」里某一条流的 gid，
    // 记录自身的 gid 则是画面流那条；按成员 gid 也要能定位到折叠记录，
    // 否则窗口会被当成"任务已消失"而关掉/退回单流数据。
    const current = findTaskRowByGid(list, gid)
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
      updateProgressWindow(current, gid)
    }
  })

  // 折叠成一条记录后，同一对音视频只保留一个进度窗口
  closeDuplicatePairProgressWindows(list)

  // Check for newly completed tasks and show completion window
  const showTaskCompletedWindow = prefConfig.showTaskCompletedWindow !== false

  if (showTaskCompletedWindow) {
    list.forEach(task => {
      const gid = task && task.gid ? `${task.gid}` : ''
      if (!gid) return
      const prevStatus = prev[gid]
      const currentStatus = task.status
      if (prevStatus && currentStatus === TASK_STATUS.COMPLETE && prevStatus !== TASK_STATUS.COMPLETE && isCompletePopupEnabled(gid)) {
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
            if (task && task.status === TASK_STATUS.COMPLETE && isCompletePopupEnabled(gid)) {
              openCompletedTaskWindow(task)
            }
          })
        })
        .catch(err => {
          console.warn('[Lerxu] Failed to check disappeared tasks:', err)
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
