<template>
  <el-container id="container">
    <div class="content-area">
      <router-view />
      <mo-floating-bar
        :class="{
          'is-auto-hide-floating-bar': autoHideFloatingBar && !isFloatingBarSearchExpanded && !isBottomHovered,
          'is-hovered': isBottomHovered,
          'is-three-column-layout': isThreeColumn
        }"
        @mouseenter.native="isBottomHovered = true"
        @mouseleave.native="isBottomHovered = false"
      />
    </div>
    <el-dialog
      :visible.sync="taskPlanVisible"
      width="360px"
      custom-class="task-plan-dialog"
      append-to-body
      :modal="true"
    >
      <div slot="title" class="task-plan-dialog-title">
        <div class="task-type-slider" role="group">
          <div class="task-type-slider-indicator" :style="taskPlanTypeIndicatorStyle"></div>
          <el-radio-group v-model="taskPlanType" size="mini">
            <el-radio-button label="complete" :disabled="isTaskPlanCompleteTypeDisabled">{{ $t('app.task-plan-type-complete') }}</el-radio-button>
            <el-radio-button label="scheduled">{{ $t('app.task-plan-type-scheduled') }}</el-radio-button>
          </el-radio-group>
        </div>
      </div>
      <el-form label-position="top">
        <el-form-item>
          <el-select v-model="taskPlanAction" :placeholder="$t('app.task-plan-select-placeholder')">
            <template v-if="taskPlanType === 'scheduled'">
              <el-option :label="$t('app.task-plan-action-resume-selected')" value="resume-selected" />
              <el-option :label="$t('app.task-plan-action-resume-all')" value="resume-all" />
              <el-option :label="$t('app.task-plan-action-pause-selected')" value="pause-selected" />
              <el-option :label="$t('app.task-plan-action-pause-all')" value="pause-all" />
            </template>
            <el-option :label="$t('app.task-plan-action-shutdown')" value="shutdown" />
            <el-option :label="$t('app.task-plan-action-sleep')" value="sleep" />
            <el-option :label="$t('app.task-plan-action-quit')" value="quit" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="taskPlanType === 'scheduled'">
          <el-time-picker
            v-model="taskPlanTime"
            :placeholder="$t('app.task-plan-time-placeholder')"
            format="HH:mm"
            value-format="HH:mm"
            size="mini"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item v-if="taskPlanType === 'scheduled' && isTaskPlanOnlyWhenIdleVisible">
          <el-checkbox v-model="taskPlanOnlyWhenIdle">{{ $t('app.task-plan-only-when-idle') }}</el-checkbox>
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer">
        <el-button type="primary" class="dialog-submit-btn" :disabled="isTaskPlanSaveDisabled" @click="saveTaskPlan">{{ $t('app.save') }}</el-button>
      </div>
    </el-dialog>
    <mo-speedometer :class="{ 'is-shifted': isSpeedometerShifted }" />
    <mo-add-task v-if="addTaskVisible" :visible="addTaskVisible" :type="addTaskType" />
    <mo-task-detail
      v-if="taskDetailVisible"
      :visible="taskDetailVisible"
      :gid="currentTaskGid"
      :task="currentTaskItem"
      :files="currentTaskFiles"
      :peers="currentTaskPeers"
    />
    <mo-dragger />
    <div v-if="showMainFloatingAside" class="aside-small-screen" :class="{ 'is-auto-hide-aside': autoHideAside, 'is-proximity-hovered': isAsideProximityHovered }">
      <ul class="menu small-menu">
        <li
          @click="nav('/preference')"
          :class="{ active: currentPage === '/preference' }"
        >
          <el-tooltip
            effect="dark"
            :content="$t('subnav.preferences')"
            placement="right"
            :open-delay="500"
          >
            <mo-icon name="menu-preference" width="20" height="20" />
          </el-tooltip>
        </li>
      </ul>
    </div>
  </el-container>
</template>

<script>
  import { mapState } from 'vuex'
  import { dialog } from '@electron/remote'
  import { commands } from '@/components/CommandManager/instance'
  import { TASK_STATUS, APP_THEME } from '@shared/constants'
  import api from '@/api'
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
  import FloatingBar from '@/components/BottomBar/FloatingBar'
  import Speedometer from '@/components/Speedometer/Speedometer'
  import AddTask from '@/components/Task/AddTask'
  import TaskDetail from '@/components/TaskDetail/Index'
  import Dragger from '@/components/Dragger/Index'
  import '@/components/Icons/menu-preference'

  export default {
    name: 'mo-main',
    components: {
      [FloatingBar.name]: FloatingBar,
      [Speedometer.name]: Speedometer,
      [AddTask.name]: AddTask,
      [TaskDetail.name]: TaskDetail,
      [Dragger.name]: Dragger
    },
    data () {
      return {
        taskPlanAction: '',
        taskPlanType: 'complete',
        taskPlanTime: '',
        taskPlanOnlyWhenIdle: false,
        hasModalMaskVisible: false,
        hasModalDialogVisible: false,
        lastTaskStatuses: {},
        autoOpenedProgressGids: new Set(),
        progressWindows: new Map(), // gid -> window
        progressTaskGids: new Set(),
        completedTaskWindows: new Map(), // gid -> window for completed tasks
        isFloatingBarSearchOpen: false,
        isFloatingBarSearchExpanded: false,
        isBottomHovered: false,
        isAsideProximityHovered: false,
        windowWidth: 0
      }
    },
    computed: {
      ...mapState('app', {
        addTaskVisible: state => state.addTaskVisible,
        addTaskType: state => state.addTaskType,
        currentPage: state => state.currentPage,
        systemTheme: state => state.systemTheme
      }),
      taskPlanVisible: {
        get () {
          return this.$store.state.app.taskPlanVisible
        },
        set (val) {
          this.$store.commit('app/UPDATE_TASK_PLAN_VISIBLE', val)
        }
      },
      ...mapState('task', {
        taskDetailVisible: state => state.taskDetailVisible,
        currentTaskGid: state => state.currentTaskGid,
        currentTaskItem: state => state.currentTaskItem,
        currentTaskFiles: state => state.currentTaskFiles,
        currentTaskPeers: state => state.currentTaskPeers,
        selectedGidList: state => state.selectedGidList,
        taskList: state => state.taskList
      }),
      ...mapState('preference', {
        taskPlanActionFromConfig: state => (state.config && state.config.taskPlanAction) || 'none',
        taskPlanTypeFromConfig: state => (state.config && state.config.taskPlanType) || 'complete',
        taskPlanTimeFromConfig: state => (state.config && state.config.taskPlanTime) || '',
        taskPlanOnlyWhenIdleFromConfig: state => !!(state.config && state.config.taskPlanOnlyWhenIdle),
        prefTheme: state => state.config && state.config.theme,
        sidebarLayoutMode: state => (state.config && state.config.sidebarLayoutMode) || 'floating',
        autoHideAside: state => state.config.autoHideAside,
        autoHideFloatingBar: state => state.config.autoHideFloatingBar
      }),
      isTaskPlanPlanned () {
        return (this.taskPlanActionFromConfig || 'none') !== 'none'
      },
      isTaskPlanCompleteTypeDisabled () {
        return this.isTaskPlanRequireScheduledType(this.taskPlanAction)
      },
      isTaskPlanOnlyWhenIdleVisible () {
        const action = this.normalizeTaskPlanAction(this.taskPlanAction)
        return ['shutdown', 'sleep', 'quit'].includes(action)
      },
      isTaskPlanSaveDisabled () {
        if (!this.taskPlanAction) {
          return true
        }
        const action = this.normalizeTaskPlanAction(this.taskPlanAction)
        if (this.isTaskPlanRequireSelection(action) && this.getSelectedGids().length === 0) {
          return true
        }
        if (this.taskPlanType === 'scheduled' && !this.taskPlanTime) {
          return true
        }
        return false
      },
      taskPlanTypeIndicatorStyle () {
        const idx = this.taskPlanType === 'scheduled' ? 1 : 0
        return {
          transform: `translateX(${idx * 100}%)`
        }
      },
      isSpeedometerShifted () {
        return false
      },
      isSmallWindow () {
        const width = this.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 0)
        if (!width) {
          return false
        }
        return width < 700
      },
      isThreeColumn () {
        if (this.sidebarLayoutMode !== 'three-column') {
          return false
        }
        return !this.isSmallWindow
      },
      showMainFloatingAside () {
        // 悬浮模式和三栏模式都不显示独立的设置按钮
        // 因为设置按钮已经集成到左侧任务导航中
        return false
      }
    },
    watch: {
      taskPlanActionFromConfig () {
        if (!this.taskPlanVisible) {
          this.taskPlanAction = this.normalizeTaskPlanAction(this.taskPlanActionFromConfig)
          this.taskPlanType = this.normalizeTaskPlanType(this.taskPlanTypeFromConfig, this.taskPlanActionFromConfig)
          this.taskPlanTime = this.normalizeTaskPlanTime(this.taskPlanTimeFromConfig)
          this.taskPlanOnlyWhenIdle = !!this.taskPlanOnlyWhenIdleFromConfig
        }
      },
      taskPlanAction () {
        const action = this.normalizeTaskPlanAction(this.taskPlanAction)
        if (this.isTaskPlanRequireScheduledType(action) && this.taskPlanType !== 'scheduled') {
          this.taskPlanType = 'scheduled'
        }
      },
      taskPlanType () {
        if (this.taskPlanType !== 'complete') {
          return
        }
        const action = this.normalizeTaskPlanAction(this.taskPlanAction)
        if (!['shutdown', 'sleep', 'quit'].includes(action)) {
          this.taskPlanAction = ''
        }
        this.taskPlanTime = ''
        this.taskPlanOnlyWhenIdle = false
      },
      taskPlanVisible (val) {
        if (val) {
          this.taskPlanAction = this.normalizeTaskPlanAction(this.taskPlanActionFromConfig)
          this.taskPlanType = this.normalizeTaskPlanType(this.taskPlanTypeFromConfig, this.taskPlanActionFromConfig)
          this.taskPlanTime = this.normalizeTaskPlanTime(this.taskPlanTimeFromConfig)
          this.taskPlanOnlyWhenIdle = !!this.taskPlanOnlyWhenIdleFromConfig
        }
      },
      taskList: {
        deep: true,
        handler (val) {
          this.handleTaskListChange(val || [])
        }
      },
      prefTheme () {
        this.handleThemeChangeForProgressWindow()
      },
      systemTheme () {
        this.handleThemeChangeForProgressWindow()
      }
    },
    methods: {
      handleFloatingBarSearchOpen (open) {
        this.isFloatingBarSearchOpen = !!open
      },
      handleFloatingBarSearchExpanded (expanded) {
        this.isFloatingBarSearchExpanded = !!expanded
      },
      handleWindowResize () {
        if (typeof window === 'undefined') {
          return
        }
        this.windowWidth = window.innerWidth || 0
      },
      updateAsideProximityHover (event) {
        if (!this.showMainFloatingAside || !this.autoHideAside) {
          if (this.isAsideProximityHovered) {
            this.isAsideProximityHovered = false
          }
          return
        }
        if (!event) {
          return
        }
        const height = typeof window !== 'undefined' ? window.innerHeight : 0
        if (!height) {
          return
        }
        const aside = this.$el && this.$el.querySelector ? this.$el.querySelector('.aside-small-screen') : null
        const asideHeight = aside ? aside.offsetHeight : 0
        const zoneHeight = Math.max(asideHeight || 0, 120) + 100
        const centerY = height / 2
        const top = centerY - zoneHeight / 2
        const bottom = centerY + zoneHeight / 2
        const withinY = event.clientY >= top && event.clientY <= bottom
        const withinX = event.clientX <= 120
        const next = withinX && withinY
        if (next !== this.isAsideProximityHovered) {
          this.isAsideProximityHovered = next
        }
      },
      updateBottomProximityHover (event) {
        if (!this.autoHideFloatingBar || !event) {
          return
        }
        const height = typeof window !== 'undefined' ? window.innerHeight : 0
        const width = typeof window !== 'undefined' ? window.innerWidth : 0
        if (!height || !width) {
          return
        }
        const top = height - 160
        const bottom = height
        const withinY = event.clientY >= top && event.clientY <= bottom

        const centerX = width / 2
        const left = centerX - 260
        const right = centerX + 320
        const withinX = event.clientX >= left && event.clientX <= right

        const next = withinX && withinY
        if (next !== this.isBottomHovered) {
          this.isBottomHovered = next
        }
        const shouldOpen = next || this.isFloatingBarSearchExpanded
        if (shouldOpen !== this.isFloatingBarSearchOpen) {
          this.isFloatingBarSearchOpen = shouldOpen
        }
      },
      handleWindowMouseMoveForAside (event) {
        this._asideMouseEvent = event
        if (this._asideMouseRaf) {
          return
        }
        this._asideMouseRaf = window.requestAnimationFrame(() => {
          this._asideMouseRaf = null
          const lastEvent = this._asideMouseEvent
          this._asideMouseEvent = null
          this.updateAsideProximityHover(lastEvent)
          this.updateBottomProximityHover(lastEvent)
        })
      },
      isAliveWindow (win) {
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
      },
      updateModalMaskVisible () {
        try {
          const body = document.body
          this.hasModalMaskVisible = !!(body && body.querySelector('.v-modal'))

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
          this.hasModalDialogVisible = modalBodies.some(el => {
            const wrapper = el.closest && el.closest('.el-dialog__wrapper, .el-message-box__wrapper')
            if (wrapper && wrapper.getAttribute && wrapper.getAttribute('aria-hidden') === 'true') return false
            return isVisible(el)
          })
        } catch (e) {
          this.hasModalMaskVisible = false
          this.hasModalDialogVisible = false
        }
      },
      normalizeTaskPlanAction (action) {
        const v = `${action || ''}`
        if (['resume-selected', 'resume-all', 'pause-selected', 'pause-all', 'shutdown', 'sleep', 'quit'].includes(v)) {
          return v
        }
        return ''
      },
      normalizeTaskPlanType (type, action) {
        const a = `${action || 'none'}`
        if (a === 'none') {
          return 'complete'
        }
        if (this.isTaskPlanRequireScheduledType(a)) {
          return 'scheduled'
        }
        const t = `${type || 'complete'}`
        if (['complete', 'scheduled'].includes(t)) {
          return t
        }
        return 'complete'
      },
      normalizeTaskPlanTime (time) {
        const v = `${time || ''}`
        if (!v) {
          return ''
        }
        return /^\d{2}:\d{2}$/.test(v) ? v : ''
      },
      isTaskPlanRequireSelection (action) {
        return ['resume-selected', 'pause-selected'].includes(`${action || ''}`)
      },
      isTaskPlanRequireScheduledType (action) {
        return ['resume-selected', 'resume-all', 'pause-selected', 'pause-all'].includes(`${action || ''}`)
      },
      getSelectedGids () {
        const list = Array.isArray(this.selectedGidList) ? this.selectedGidList : []
        return list.map(x => `${x || ''}`.trim()).filter(Boolean)
      },
      nav (page) {
        if (page === '/preference') {
          this.$electron.ipcRenderer.send('open-preference-window')
          return
        }
        this.$router.push({
          path: page
        }).catch(err => {
          console.log(err)
        })
      },
      saveTaskPlan () {
        const action = this.normalizeTaskPlanAction(this.taskPlanAction)
        const type = this.normalizeTaskPlanType(this.taskPlanType, action)
        const time = this.normalizeTaskPlanTime(this.taskPlanTime)
        if (!action) {
          this.$msg.warning(this.$t('app.task-plan-select-warning'))
          return
        }
        const gids = this.isTaskPlanRequireSelection(action) ? this.getSelectedGids() : []
        if (this.isTaskPlanRequireSelection(action) && gids.length === 0) {
          this.$msg.warning(this.$t('app.task-plan-selected-warning'))
          return
        }
        if (type === 'scheduled' && !time) {
          this.$msg.warning(this.$t('app.task-plan-time-warning'))
          return
        }
        this.$store.dispatch('preference/save', {
          taskPlanAction: action,
          taskPlanType: type,
          taskPlanTime: type === 'scheduled' ? time : '',
          taskPlanGids: gids,
          taskPlanOnlyWhenIdle: type === 'scheduled' && this.isTaskPlanOnlyWhenIdleVisible ? !!this.taskPlanOnlyWhenIdle : false
        })
        this.taskPlanVisible = false
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
          ? `${this.$t(labelKey)} (${time})`
          : this.$t(labelKey)
        this.$msg.success(this.$t('app.task-plan-set-message', { action: label }))
      },
      handleTaskProgressAutoOpen (payload) {
        const data = payload || {}
        const gid = data && data.gid ? `${data.gid}` : ''
        if (!gid) {
          return
        }
        const list = this.taskList || []
        const task = list.find(item => item && `${item.gid}` === gid)
        if (!task) {
          return
        }
        const autoOpened = this.autoOpenedProgressGids || (this.autoOpenedProgressGids = new Set())
        if (autoOpened.has(gid)) {
          return
        }
        autoOpened.add(gid)
        this.openProgressWindowForTask(task)
      },
      handleThemeChangeForProgressWindow () {
        // Update all progress windows
        this.progressWindows.forEach((win, gid) => {
          if (!win || (win.isDestroyed && win.isDestroyed())) {
            this.progressWindows.delete(gid)
            return
          }

          const list = this.taskList || []
          const task = list.find(item => item && `${item.gid}` === gid)
          if (!task) {
            return
          }

          try {
            const prefState = this.$store && this.$store.state && this.$store.state.preference
            const prefConfig = prefState && prefState.config ? prefState.config : {}
            const themeConfig = prefConfig.theme || APP_THEME.LIGHT
            const appState = this.$store && this.$store.state && this.$store.state.app
            const systemTheme = appState && appState.systemTheme ? appState.systemTheme : APP_THEME.LIGHT
            const finalTheme = themeConfig === APP_THEME.AUTO ? systemTheme : themeConfig
            const isDark = finalTheme === APP_THEME.DARK
            const bodyBg = isDark ? '#343434' : '#ffffff'
            const textColor = isDark ? '#e5e5e5' : '#303133'
            const statusColor = isDark ? '#c0c4cc' : '#606266'
            const metaColor = isDark ? '#b0b0b0' : '#909399'
            const barBg = isDark ? '#3a3a3a' : '#ebeef5'
            const barInner = '#409EFF'
            const controlsBg = isDark ? '#3a3a3a' : '#ffffff'
            const controlsBorder = isDark ? '#4a4a4a' : '#dcdfe6'
            const controlsDivider = isDark ? '#555555' : '#e4e7ed'
            const controlsItemColor = isDark ? '#e5e5e5' : '#606266'
            const controlsItemHoverBg = isDark ? '#444444' : '#f2f6fc'
            const titleBtnHoverBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
            const indicatorBg = isDark ? '#4a4a4a' : '#e8e8e8'

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
                tabBg: isDark ? '#2a2a2a' : '#f5f7fa',
                tabColor: isDark ? '#b0b0b0' : '#606266',
                tabBorder: isDark ? '#4a4a4a' : '#dcdfe6',
                piecePending: isDark ? '#4a4a4a' : '#dcdfe6'
              })
            } catch (e) {}
            this.updateProgressWindow(task)
          } catch (e) {}
        })

        // Update all completed task windows
        this.completedTaskWindows.forEach((win, gid) => {
          if (!win || (win.isDestroyed && win.isDestroyed())) {
            this.completedTaskWindows.delete(gid)
            return
          }

          try {
            const prefState = this.$store && this.$store.state && this.$store.state.preference
            const prefConfig = prefState && prefState.config ? prefState.config : {}
            const themeConfig = prefConfig.theme || APP_THEME.LIGHT
            const appState = this.$store && this.$store.state && this.$store.state.app
            const systemTheme = appState && appState.systemTheme ? appState.systemTheme : APP_THEME.LIGHT
            const finalTheme = themeConfig === APP_THEME.AUTO ? systemTheme : themeConfig
            const isDark = finalTheme === APP_THEME.DARK

            const bodyBg = isDark ? '#343434' : '#ffffff'
            if (typeof win.setBackgroundColor === 'function') {
              win.setBackgroundColor(bodyBg)
            }
            try {
              win.webContents.send('theme-changed', isDark ? 'dark' : 'light')
            } catch (e) {}
          } catch (e) {}
        })
      },
      async handleTaskProgressControl (payload) {
        const data = payload || {}
        const gid = data && data.gid ? `${data.gid}` : ''
        const action = data && data.action ? `${data.action}` : ''
        if (!gid || !action) {
          return
        }
        const list = this.taskList || []
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
          defaultName: this.$t('task.get-task-name')
        })
        if (action === 'pause') {
          this.$msg.info(this.$t('task.download-pause-message', { taskName }))
          this.$store.dispatch('task/pauseTask', task)
            .catch(({ code }) => {
              if (code === 1) {
                this.$msg.error(this.$t('task.pause-task-fail', { taskName }))
              }
            })
          return
        }
        if (action === 'resume') {
          this.$store.dispatch('task/resumeTask', task)
            .catch(({ code }) => {
              if (code === 1) {
                this.$msg.error(this.$t('task.resume-task-fail', {
                  taskName
                }))
              }
            })
          return
        }
        if (action === 'cancel') {
          const deleteWithFiles = false
          this.handleDeleteTaskFromProgress(task, taskName, deleteWithFiles)
        }
      },
      async deleteTaskFilesFromProgress (task) {
        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const config = prefState && prefState.config ? prefState.config : {}
        const downloadingFileSuffix = config.downloadingFileSuffix || ''
        try {
          await moveTaskFilesToTrash(task, downloadingFileSuffix, config)
        } catch (err) {
          console.warn('[Motrix] deleteTaskFilesFromProgress error:', err)
          const taskName = (task && task.name) ? task.name : (task && task.gid ? task.gid : '')
          this.$msg.error(`删除文件失败: ${taskName}`)
        }
      },
      async removeTaskItemFromProgress (task, taskName) {
        try {
          await this.$store.dispatch('task/removeTask', task)
          this.$msg.success(this.$t('task.delete-task-success', {
            taskName
          }))
        } catch ({ code }) {
          if (code === 1) {
            this.$msg.error(this.$t('task.delete-task-fail', {
              taskName
            }))
          }
        }
      },
      async handleDeleteTaskFromProgress (task, taskName, deleteWithFiles = false) {
        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const prefConfig = prefState && prefState.config ? prefState.config : {}
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
            console.warn('[Motrix] Failed to fetch fresh task for deletion:', e.message)
          }
          // 预获取引擎选项（dir + out），避免任务被 aria2 删除后 getOption 失败导致文件路径无法解析
          try {
            const opt = await api.getOption({ gid: originalTask.gid })
            if (opt) {
              taskForDeletion = { ...taskForDeletion, _engineOptions: opt }
            }
          } catch (e) {
            console.warn('[Motrix] Failed to pre-fetch getOption for deletion:', e.message)
          }
          return taskForDeletion
        }

        if (noConfirmBeforeDelete) {
          const taskForDeletion = deleteWithFiles ? await fetchFreshTaskForDeletion(task) : task
          await this.$store.dispatch('task/forcePauseTask', task)
            .finally(async () => {
              // 先从aria2中删除任务
              await this.removeTaskItemFromProgress(task, taskName)

              // 然后再删除文件
              if (deleteWithFiles) {
                await new Promise(resolve => setTimeout(resolve, 500))
                await this.deleteTaskFilesFromProgress(taskForDeletion)
              }
            })
          return
        }
        dialog.showMessageBox({
          type: 'warning',
          title: this.$t('task.delete-task'),
          message: this.$t('task.delete-task-confirm', { taskName }),
          buttons: [this.$t('app.yes'), this.$t('app.no')],
          cancelId: 1,
          checkboxLabel: this.$t('task.delete-task-label'),
          checkboxChecked: deleteWithFiles
        }).then(async ({ response, checkboxChecked }) => {
          if (response !== 0) {
            return
          }
          const taskForDeletion = checkboxChecked ? await fetchFreshTaskForDeletion(task) : task
          await this.$store.dispatch('task/forcePauseTask', task)
            .finally(async () => {
              // 先从aria2中删除任务
              await this.removeTaskItemFromProgress(task, taskName)

              // 然后再删除文件
              if (checkboxChecked) {
                await new Promise(resolve => setTimeout(resolve, 500))
                await this.deleteTaskFilesFromProgress(taskForDeletion)
              }
            })
        })
      },
      handleShowTaskProgress (payload) {
        const task = payload && payload.task
        if (!task) {
          return
        }
        this.openProgressWindowForTask(task)
      },
      buildProgressWindowHtml (useCustomFrame = false, isMac = false) {
        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const prefConfig = prefState && prefState.config ? prefState.config : {}
        const themeConfig = prefConfig.theme || APP_THEME.LIGHT
        const appState = this.$store && this.$store.state && this.$store.state.app
        const systemTheme = appState && appState.systemTheme ? appState.systemTheme : APP_THEME.LIGHT
        const finalTheme = themeConfig === APP_THEME.AUTO ? systemTheme : themeConfig
        const isDark = finalTheme === APP_THEME.DARK
        const bodyBg = isDark ? '#343434' : '#ffffff'
        const textColor = isDark ? '#e5e5e5' : '#303133'
        const statusColor = isDark ? '#c0c4cc' : '#606266'
        const metaColor = isDark ? '#b0b0b0' : '#909399'
        const barBg = isDark ? '#3a3a3a' : '#ebeef5'
        const barInner = '#409EFF'
        const controlsBg = isDark ? '#3a3a3a' : '#ffffff'
        const controlsBorder = isDark ? '#4a4a4a' : '#dcdfe6'
        const controlsDivider = isDark ? '#555555' : '#e4e7ed'
        const controlsItemColor = isDark ? '#e5e5e5' : '#606266'
        const controlsItemHoverBg = isDark ? '#444444' : '#f2f6fc'
        const titleBtnHoverBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
        const indicatorBg = isDark ? '#4a4a4a' : '#e8e8e8'
        const showTitleBar = useCustomFrame || isMac
        const titleBarStyle = showTitleBar
          ? `.title-bar{height:26px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;padding-left:${isMac ? '78px' : '16px'};-webkit-app-region:drag;background-color:VAR_BODY_BG;}`
          : '.title-bar{display:none;}'
        const contentStyle = showTitleBar
          ? '.content{box-sizing:border-box;padding:0 12px 12px 12px;height:calc(100vh - 26px);overflow-y:auto;}'
          : '.content{box-sizing:border-box;padding:0 12px 12px 12px;height:100vh;overflow-y:auto;}'
        const styles = [
          'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;color:VAR_TEXT_COLOR;background-color:VAR_BODY_BG;overflow:hidden;}',
          '::-webkit-scrollbar{width:8px;height:8px;}',
          '::-webkit-scrollbar-thumb{border-radius:8px;background-color:rgba(0,0,0,0.4);}',
          '::-webkit-scrollbar-thumb:window-inactive{background-color:rgba(0,0,0,0.25);}',
          '::-webkit-scrollbar-corner{background:transparent;}',
          titleBarStyle,
          contentStyle,
          '.title-text{font-size:12px;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:8px;}',
          '.title-actions{display:flex;gap:4px;-webkit-app-region:no-drag;}',
          '.title-btn{width:18px;height:18px;border-radius:3px;border:none;background:transparent;color:VAR_TEXT_COLOR;cursor:pointer;padding:0;font-size:14px;line-height:18px;}',
          '.title-btn:hover{background-color:VAR_TITLE_BTN_HOVER_BG;}',
          ...(isMac
            ? [
              '.title-bar{justify-content:flex-end !important;padding-top:6px;padding-right:8px;}',
              '.title-actions{display:none !important;}'
            ]
            : []),
          '.tab-nav{display:flex;gap:0;margin-bottom:10px;border-radius:7px;overflow:hidden;border:none;background:VAR_TAB_BG;-webkit-app-region:no-drag;}',
          '.tab-btn{flex:1;padding:6px 12px;margin:0;border:none;border-radius:0;background:VAR_TAB_BG;color:VAR_TAB_COLOR;cursor:pointer;font-size:12px;transition:all .15s ease;appearance:none;-webkit-appearance:none;}',
          '.tab-btn:first-child{border-top-left-radius:6px;border-bottom-left-radius:6px;}',
          '.tab-btn:last-child{border-top-right-radius:6px;border-bottom-right-radius:6px;}',
          '.tab-btn:not(:last-child){border-right:none;}',
          '.tab-btn:hover{background:VAR_TAB_HOVER_BG;}',
          '.tab-btn.active{background:VAR_TAB_ACTIVE_BG;color:VAR_TAB_ACTIVE_COLOR;position:relative;z-index:1;}',
          '.tab-content{display:none;}',
          '.tab-content.active{display:block;}',
          '.bar{height:6px;background:VAR_BAR_BG;border-radius:3px;overflow:hidden;margin-bottom:8px;}',
          '.bar-fixed{position:fixed;top:160px;left:12px;right:12px;height:6px;background:VAR_BAR_BG;border-radius:3px;overflow:hidden;z-index:999;}',
          '.bar-inner{height:100%;background:VAR_BAR_INNER;width:0;transition:width .2s ease;}',
          '.meta{color:VAR_META_COLOR;font-size:12px;margin-bottom:8px;}',
          '.meta-line{margin-bottom:2px;}',
          '.pieces-info{color:VAR_META_COLOR;font-size:12px;margin-bottom:8px;}',
          '.pieces-bar{display:flex;flex-wrap:wrap;gap:1px;margin-bottom:8px;}',
          '.piece{width:6px;height:6px;border-radius:1px;background:VAR_PIECE_PENDING;}',
          '.piece.completed{background:VAR_PIECE_COMPLETED;}',
          '.piece.partial{background:VAR_PIECE_PARTIAL;}',
          '.pieces-legend{display:flex;gap:12px;font-size:11px;color:VAR_META_COLOR;}',
          '.legend-item{display:flex;align-items:center;gap:4px;}',
          '.legend-color{width:10px;height:10px;border-radius:2px;}',
          '.legend-completed{background:VAR_PIECE_COMPLETED;}',
          '.legend-partial{background:VAR_PIECE_PARTIAL;}',
          '.legend-pending{background:VAR_PIECE_PENDING;}',
          '.conn-summary{display:flex;gap:16px;margin-bottom:10px;padding:8px;background:VAR_BAR_BG;border-radius:0;}',
          '.conn-summary-item{text-align:center;flex:1;min-width:0;}',
          '.conn-summary-label{font-size:11px;color:VAR_META_COLOR;margin-bottom:2px;white-space:nowrap;}',
          '.conn-summary-value{font-size:14px;font-weight:600;white-space:nowrap;}',
          '.conn-table-wrap{-webkit-app-region:no-drag;max-height:130px;overflow-y:auto;overflow-x:hidden;}',
          '.conn-table{width:100%;border-collapse:collapse;font-size:11px;background:transparent;table-layout:fixed;}',
          '.conn-table th,.conn-table td{padding:4px 6px;text-align:left;border:none;white-space:nowrap;}',
          '.conn-table th{background:transparent;font-weight:500;position:sticky;top:0;color:VAR_TEXT_COLOR;}',
          '.conn-table td{color:VAR_META_COLOR;background:transparent;}',
          '.conn-table .speed-active{color:#67c23a;font-weight:500;}',
          '.conn-table td:nth-child(2),.conn-table th:nth-child(2){width:76px;text-align:right;}',
          '.conn-table td:nth-child(3),.conn-table th:nth-child(3){width:78px;text-align:right;}',
          '.conn-table td:nth-child(4),.conn-table th:nth-child(4){width:60px;text-align:right;}',
          '.conn-host{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:clip;-webkit-mask-image:linear-gradient(to right,rgba(0,0,0,1) 0%,rgba(0,0,0,1) calc(100% - 18px),rgba(0,0,0,0) 100%);mask-image:linear-gradient(to right,rgba(0,0,0,1) 0%,rgba(0,0,0,1) calc(100% - 18px),rgba(0,0,0,0) 100%);}',
          '.host-tooltip{position:fixed;left:0;top:0;display:none;max-width:420px;white-space:normal;word-break:break-all;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.78);color:#fff;font-size:12px;line-height:1.25;pointer-events:none;z-index:3000;box-shadow:0 6px 18px rgba(0,0,0,0.25);}',
          '.conn-empty{text-align:center;padding:20px;color:VAR_META_COLOR;}',
          '.connections-panel{position:fixed;top:220px;left:0;right:0;padding:12px 0;background-color:VAR_BODY_BG;box-sizing:border-box;}',
          '.controls{position:fixed;top:170px;left:12px;right:12px;display:flex;justify-content:space-between;padding:8px 0;background-color:VAR_BODY_BG;pointer-events:none;z-index:1000;}',
          '.controls-left{display:flex;pointer-events:auto;}',
          '.controls-left .controls-btn{position:relative;}',
          '#pinBtn{margin-left:-18px;z-index:0;border-radius:0 18px 18px 0;width:46px;background-color:VAR_CONTROLS_ITEM_HOVER_BG;}',
          '#pinBtn:hover{background-color:VAR_CONTROLS_BORDER;}',
          '#connToggle{z-index:1;}',
          '.controls-inner{display:flex;align-items:center;justify-content:flex-end;gap:8px;pointer-events:auto;}',
          '.controls-divider{display:none;}',
          '.pause-resume-group{display:flex;background-color:VAR_CONTROLS_BG;border-radius:18px;box-shadow:0 2px 8px rgba(0,0,0,0.15);border:1px solid VAR_CONTROLS_BORDER;overflow:hidden;position:relative;margin-left:8px;}',
          '.pause-resume-indicator{position:absolute;width:32px;height:32px;background-color:VAR_INDICATOR_BG;border-radius:50%;top:2px;left:2px;transition:transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);z-index:0;box-shadow:inset 0 1px 3px rgba(0,0,0,0.1);}',
          '.pause-resume-indicator.right{transform:translateX(36px);}',
          '.pause-resume-group .controls-btn{border-radius:0;border:none;box-shadow:none;margin:0;background-color:transparent;width:36px;height:36px;position:relative;z-index:1;}',
          '.pause-resume-group .controls-btn:first-child{border-radius:18px 0 0 18px;}',
          '.pause-resume-group .controls-btn:last-child{border-radius:0 18px 18px 0;}',
          '.controls-btn{width:36px;height:36px;border-radius:50%;border:none;background-color:VAR_CONTROLS_BG;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;color:VAR_CONTROLS_ITEM_COLOR;transition:background-color .2s ease,opacity .2s ease;box-shadow:0 2px 8px rgba(0,0,0,0.15);border:1px solid VAR_CONTROLS_BORDER;}',
          '.controls-btn:hover:not(:disabled){background-color:VAR_CONTROLS_ITEM_HOVER_BG;}',
          '.pause-resume-group .controls-btn:hover:not(:disabled){background-color:transparent;color:#409EFF;}',
          '.controls-btn:disabled{cursor:not-allowed;opacity:0.4;}',
          '.controls-btn-icon{width:14px;height:14px;display:block;position:relative;}',
          '.icon-pause::before,.icon-pause::after{content:"";position:absolute;top:1px;bottom:1px;width:3px;border-radius:1px;background:currentColor;}',
          '.icon-pause::before{left:2px;}',
          '.icon-pause::after{right:2px;}',
          '.icon-resume::before{content:"";position:absolute;top:1px;bottom:1px;left:3px;border-style:solid;border-width:6px 0 6px 9px;border-color:transparent transparent transparent currentColor;}',
          '.icon-cancel::before,.icon-cancel::after{content:"";position:absolute;top:1px;bottom:1px;left:50%;width:2px;border-radius:1px;background:currentColor;transform-origin:center;}',
          '.icon-cancel::before{transform:translateX(-50%) rotate(45deg);}',
          '.icon-cancel::after{transform:translateX(-50%) rotate(-45deg);}',
          '.icon-connections{display:inline-block;width:14px;height:14px;position:relative;transition:transform .2s ease;}',
          '.icon-connections::before{content:"";position:absolute;width:0;height:0;border-style:solid;border-width:5px 5px 0 5px;border-color:currentColor transparent transparent transparent;left:2px;top:7px;}',
          '.icon-connections::after{content:"";position:absolute;width:2px;height:8px;background:currentColor;left:6px;top:3px;}',
          '.controls-btn.active .icon-connections{transform:rotate(180deg);}',
          '.icon-pin-svg{display:inline-block;width:14px;height:14px;transition:all .2s ease;margin-left:8px;}',
          '.controls-btn.active .icon-pin-svg{color:#409EFF;}'
        ].join('').replace(/VAR_BODY_BG/g, bodyBg)
          .replace(/VAR_TEXT_COLOR/g, textColor)
          .replace(/VAR_STATUS_COLOR/g, statusColor)
          .replace(/VAR_META_COLOR/g, metaColor)
          .replace(/VAR_BAR_BG/g, barBg)
          .replace(/VAR_BAR_INNER/g, barInner)
          .replace(/VAR_CONTROLS_BG/g, controlsBg)
          .replace(/VAR_CONTROLS_BORDER/g, controlsBorder)
          .replace(/VAR_CONTROLS_DIVIDER/g, controlsDivider)
          .replace(/VAR_CONTROLS_ITEM_COLOR/g, controlsItemColor)
          .replace(/VAR_CONTROLS_ITEM_HOVER_BG/g, controlsItemHoverBg)
          .replace(/VAR_TITLE_BTN_HOVER_BG/g, titleBtnHoverBg)
          .replace(/VAR_INDICATOR_BG/g, indicatorBg)
          .replace(/VAR_PIECE_COMPLETED/g, '#67c23a')
          .replace(/VAR_PIECE_PARTIAL/g, '#e6a23c')
          .replace(/VAR_PIECE_PENDING/g, isDark ? '#4a4a4a' : '#dcdfe6')
          .replace(/VAR_TAB_BORDER/g, isDark ? '#4a4a4a' : '#dcdfe6')
          .replace(/VAR_TAB_BG/g, isDark ? '#2a2a2a' : '#f5f7fa')
          .replace(/VAR_TAB_COLOR/g, isDark ? '#b0b0b0' : '#606266')
          .replace(/VAR_TAB_HOVER_BG/g, isDark ? '#333333' : '#e4e7ed')
          .replace(/VAR_TAB_ACTIVE_BG/g, '#409EFF')
          .replace(/VAR_TAB_ACTIVE_COLOR/g, '#ffffff')
        const html = [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '<meta charset="utf-8" />',
          '<title>Task Progress</title>',
          `<style>${styles}</style>`,
          '<style id="dynamic-theme-style"></style>',
          '</head>',
          '<body>',
          '<div class="title-bar">',
          '<div class="title-text" id="window-title"></div>',
          '<div class="title-actions"><button class="title-btn" id="min-btn">–</button><button class="title-btn" id="close-btn">×</button></div>',
          '</div>',
          '<div class="content">',
          '<div class="tab-nav" id="tabNav">',
          '<button class="tab-btn active" data-tab="info" id="tabInfo"></button>',
          '<button class="tab-btn" data-tab="pieces" id="tabPieces" style="display:none;"></button>',
          '</div>',
          '<div class="tab-content active" id="contentInfo">',
          '<div class="meta">',
          '<div class="meta-line" id="size"></div>',
          '<div class="meta-line" id="speed"></div>',
          '<div class="meta-line" id="avgSpeed"></div>',
          '<div class="meta-line" id="connections"></div>',
          '<div class="meta-line" id="remaining"></div>',
          '</div>',
          '</div>',
          '<div class="connections-panel" id="connectionsPanel" style="display:none;">',
          '<div class="conn-summary" id="connSummary">',
          '<div class="conn-summary-item"><div class="conn-summary-label" id="connTotalLabel"></div><div class="conn-summary-value" id="connTotalValue">0</div></div>',
          '<div class="conn-summary-item"><div class="conn-summary-label" id="connActiveLabel"></div><div class="conn-summary-value" id="connActiveValue">0</div></div>',
          '<div class="conn-summary-item"><div class="conn-summary-label" id="connSpeedLabel"></div><div class="conn-summary-value" id="connSpeedValue">0 B/s</div></div>',
          '</div>',
          '<div class="conn-table-wrap" id="connTableWrap">',
          '<table class="conn-table" id="connTable">',
          '<thead><tr><th id="connThHost"></th><th id="connThDownloaded"></th><th id="connThSpeed"></th><th id="connThStatus"></th></tr></thead>',
          '<tbody id="connTableBody"></tbody>',
          '</table>',
          '</div>',
          '<div class="conn-empty" id="connEmpty" style="display:none;"></div>',
          '</div>',
          '<div class="tab-content" id="contentPieces">',
          '<div class="pieces-info" id="piecesInfo"></div>',
          '<div class="pieces-bar" id="piecesBar"></div>',
          '<div class="pieces-legend">',
          '<span class="legend-item"><span class="legend-color legend-completed"></span><span id="legendCompleted"></span></span>',
          '<span class="legend-item"><span class="legend-color legend-partial"></span><span id="legendPartial"></span></span>',
          '<span class="legend-item"><span class="legend-color legend-pending"></span><span id="legendPending"></span></span>',
          '</div>',
          '</div>',
          '</div>',
          '<div class="bar-fixed"><div class="bar-inner" id="bar"></div></div>',
          '<div class="controls">',
          '<div class="controls-left">',
          '<button id="connToggle" class="controls-btn" title="连接详情"><span class="controls-btn-icon icon-connections"></span></button>',
          '<button id="pinBtn" class="controls-btn" title="固定窗口"><svg class="icon-pin-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" width="14" height="14" fill="none"><path d="M 8.5 0.5 L 13.5 5.5 L 10.5 8.5 L 10 10.5 L 7.5 8 L 3.5 12 L 2.5 11 L 6.5 7 L 4 4.5 L 6 4 Z" fill="currentColor"/><circle cx="11" cy="3" r="1" fill="currentColor" opacity="0.35"/></svg></button>',
          '</div>',
          '<div class="controls-inner">',
          '<div class="pause-resume-group">',
          '<div class="pause-resume-indicator" id="pauseResumeIndicator"></div>',
          '<button id="pause" class="controls-btn" title="暂停"><span class="controls-btn-icon icon-pause"></span></button>',
          '<button id="resume" class="controls-btn" title="继续"><span class="controls-btn-icon icon-resume"></span></button>',
          '</div>',
          '<button id="cancel" class="controls-btn"><span class="controls-btn-icon icon-cancel"></span></button>',
          '</div>',
          '</div>',
          '<div id="hostTooltip" class="host-tooltip"></div>',
          '<script>',
          'const { ipcRenderer } = require("electron");',
          'let currentGid = "";',
          'let currentTab = "info";',
          'let cachedPiecesData = null;',
          `let currentTheme = { tabBg: "${isDark ? '#2a2a2a' : '#f5f7fa'}", tabColor: "${isDark ? '#b0b0b0' : '#606266'}", tabBorder: "${isDark ? '#4a4a4a' : '#dcdfe6'}", tabActiveBg: "#409EFF", tabActiveColor: "#ffffff" };`,
          'const windowTitleEl = document.getElementById("window-title");',
          'const closeBtn = document.getElementById("close-btn");',
          'const minBtn = document.getElementById("min-btn");',
          'const tabInfoBtn = document.getElementById("tabInfo");',
          'const tabConnectionsBtn = document.getElementById("tabConnections");',
          'const tabPiecesBtn = document.getElementById("tabPieces");',
          'const contentInfoEl = document.getElementById("contentInfo");',
          'const contentConnectionsEl = document.getElementById("contentConnections");',
          'const contentPiecesEl = document.getElementById("contentPieces");',
          'const connTotalLabelEl = document.getElementById("connTotalLabel");',
          'const connTotalValueEl = document.getElementById("connTotalValue");',
          'const connActiveLabelEl = document.getElementById("connActiveLabel");',
          'const connActiveValueEl = document.getElementById("connActiveValue");',
          'const connSpeedLabelEl = document.getElementById("connSpeedLabel");',
          'const connSpeedValueEl = document.getElementById("connSpeedValue");',
          'const connThHostEl = document.getElementById("connThHost");',
          'const connThDownloadedEl = document.getElementById("connThDownloaded");',
          'const connThSpeedEl = document.getElementById("connThSpeed");',
          'const connThStatusEl = document.getElementById("connThStatus");',
          'const connTableBodyEl = document.getElementById("connTableBody");',
          'const connEmptyEl = document.getElementById("connEmpty");',
          'const connTableWrapEl = document.getElementById("connTableWrap");',
          'const barEl = document.getElementById("bar");',
          'const sizeEl = document.getElementById("size");',
          'const speedEl = document.getElementById("speed");',
          'const avgSpeedEl = document.getElementById("avgSpeed");',
          'const connectionsEl = document.getElementById("connections");',
          'const remainingEl = document.getElementById("remaining");',
          'const piecesInfoEl = document.getElementById("piecesInfo");',
          'const piecesBarEl = document.getElementById("piecesBar");',
          'const legendCompletedEl = document.getElementById("legendCompleted");',
          'const legendPartialEl = document.getElementById("legendPartial");',
          'const legendPendingEl = document.getElementById("legendPending");',
          'const pauseBtn = document.getElementById("pause");',
          'const resumeBtn = document.getElementById("resume");',
          'const cancelBtn = document.getElementById("cancel");',
          'const pauseResumeIndicator = document.getElementById("pauseResumeIndicator");',
          'const connToggleBtn = document.getElementById("connToggle");',
          'const connectionsPanel = document.getElementById("connectionsPanel");',
          'const hostTooltipEl = document.getElementById("hostTooltip");',
          'const PANEL_HEIGHT = 200;',
          'let isPanelOpen = false;',
          'let initialWidth = 0;',
          'function hideHostTooltip() {',
          '  if (!hostTooltipEl) return;',
          '  hostTooltipEl.style.display = "none";',
          '}',
          'function showHostTooltip(text, x, y) {',
          '  if (!hostTooltipEl) return;',
          '  if (!text) { hideHostTooltip(); return; }',
          '  hostTooltipEl.innerText = text;',
          '  hostTooltipEl.style.display = "block";',
          '  hostTooltipEl.style.visibility = "hidden";',
          '  const padding = 8;',
          '  const offset = 12;',
          '  const maxX = Math.max(padding, window.innerWidth - hostTooltipEl.offsetWidth - padding);',
          '  const maxY = Math.max(padding, window.innerHeight - hostTooltipEl.offsetHeight - padding);',
          '  const left = Math.min(maxX, Math.max(padding, x + offset));',
          '  const top = Math.min(maxY, Math.max(padding, y + offset));',
          '  hostTooltipEl.style.left = left + "px";',
          '  hostTooltipEl.style.top = top + "px";',
          '  hostTooltipEl.style.visibility = "visible";',
          '}',
          'function updateHostTooltipFromEvent(e) {',
          '  try {',
          '    const target = e && e.target && e.target.closest ? e.target.closest(".conn-host") : null;',
          '    if (!target) { hideHostTooltip(); return; }',
          '    if (target.scrollWidth <= target.clientWidth + 1) { hideHostTooltip(); return; }',
          '    const text = target.innerText || "";',
          '    showHostTooltip(text, e.clientX, e.clientY);',
          '  } catch (err) {',
          '    hideHostTooltip();',
          '  }',
          '}',
          'if (connTableWrapEl) {',
          '  connTableWrapEl.addEventListener("mousemove", updateHostTooltipFromEvent);',
          '  connTableWrapEl.addEventListener("mouseleave", hideHostTooltip);',
          '  connTableWrapEl.addEventListener("scroll", hideHostTooltip);',
          '}',
          'ipcRenderer.invoke("get-progress-window-size").then((size) => {',
          '  if (size && size.width) {',
          '    initialWidth = size.width;',
          '  }',
          '}).catch(() => {});',
          'if (connToggleBtn) {',
          '  connToggleBtn.onclick = function() {',
          '    isPanelOpen = !isPanelOpen;',
          '    ipcRenderer.invoke("resize-progress-window", { isPanelOpen, panelHeight: PANEL_HEIGHT, initialWidth }).catch(() => {});',
          '    if (connectionsPanel) {',
          '      connectionsPanel.style.display = isPanelOpen ? "block" : "none";',
          '    }',
          '    if (connToggleBtn) {',
          '      connToggleBtn.classList.toggle("active", isPanelOpen);',
          '    }',
          '    hideHostTooltip();',
          '  };',
          '}',
          'const pinBtn = document.getElementById("pinBtn");',
          'let isPinned = false;',
          'if (pinBtn) {',
          '  pinBtn.onclick = function() {',
          '    isPinned = !isPinned;',
          '    pinBtn.classList.toggle("active", isPinned);',
          '    ipcRenderer.invoke("set-progress-window-always-on-top", isPinned).catch(() => {});',
          '  };',
          '}',
          'function switchTab(tab) {',
          '  currentTab = tab;',
          '  if (tabInfoBtn) {',
          '    tabInfoBtn.classList.toggle("active", tab === "info");',
          '    if (tab === "info") {',
          '      tabInfoBtn.style.backgroundColor = currentTheme.tabActiveBg;',
          '      tabInfoBtn.style.color = currentTheme.tabActiveColor;',
          '    } else {',
          '      tabInfoBtn.style.backgroundColor = currentTheme.tabBg;',
          '      tabInfoBtn.style.color = currentTheme.tabColor;',
          '    }',
          '  }',
          '  if (tabPiecesBtn) {',
          '    tabPiecesBtn.classList.toggle("active", tab === "pieces");',
          '    if (tab === "pieces") {',
          '      tabPiecesBtn.style.backgroundColor = currentTheme.tabActiveBg;',
          '      tabPiecesBtn.style.color = currentTheme.tabActiveColor;',
          '    } else {',
          '      tabPiecesBtn.style.backgroundColor = currentTheme.tabBg;',
          '      tabPiecesBtn.style.color = currentTheme.tabColor;',
          '    }',
          '  }',
          '  if (contentInfoEl) contentInfoEl.classList.toggle("active", tab === "info");',
          '  if (contentPiecesEl) contentPiecesEl.classList.toggle("active", tab === "pieces");',
          '}',
          'if (tabInfoBtn) tabInfoBtn.onclick = () => switchTab("info");',
          'if (tabPiecesBtn) tabPiecesBtn.onclick = () => switchTab("pieces");',
          'if (minBtn) {',
          '  minBtn.onclick = () => {',
          '    try {',
          '      ipcRenderer.send("minimize-progress-window");',
          '    } catch (e) {',
          '      console.error("Failed to minimize window:", e);',
          '    }',
          '  };',
          '}',
          'if (closeBtn) {',
          '  closeBtn.onclick = () => {',
          '    try {',
          '      ipcRenderer.send("close-progress-window");',
          '    } catch (e) {',
          '      try { window.close(); } catch (err) {}',
          '    }',
          '  };',
          '}',
          'function sendAction(action) {',
          '  if (!currentGid) {',
          '    return;',
          '  }',
          '  ipcRenderer.send("command", "task-progress:control", { gid: currentGid, action });',
          '}',
          'if (pauseBtn) { pauseBtn.onclick = () => sendAction("pause"); }',
          'if (resumeBtn) { resumeBtn.onclick = () => sendAction("resume"); }',
          'if (cancelBtn) { cancelBtn.onclick = () => sendAction("cancel"); }',
          'ipcRenderer.on("task-progress-theme-update", (event, payload) => {',
          '  if (!payload) {',
          '    return;',
          '  }',
          '  const bodyBg = payload.bodyBg || "#ffffff";',
          '  const textColor = payload.textColor || "#303133";',
          '  const statusColor = payload.statusColor || "#606266";',
          '  const metaColor = payload.metaColor || "#909399";',
          '  const barBg = payload.barBg || "#ebeef5";',
          '  const barInner = payload.barInner || "#409EFF";',
          '  const controlsBg = payload.controlsBg || "#ffffff";',
          '  const controlsBorder = payload.controlsBorder || "#dcdfe6";',
          '  const controlsDivider = payload.controlsDivider || "#e4e7ed";',
          '  const controlsItemColor = payload.controlsItemColor || "#606266";',
          '  const controlsItemHoverBg = payload.controlsItemHoverBg || "#f2f6fc";',
          '  const titleBtnHoverBg = payload.titleBtnHoverBg || "rgba(0,0,0,0.08)";',
          '  document.body.style.backgroundColor = bodyBg;',
          '  document.body.style.color = textColor;',
          '  const titleBarEl = document.querySelector(".title-bar");',
          '  if (titleBarEl) {',
          '    titleBarEl.style.backgroundColor = bodyBg;',
          '    titleBarEl.style.color = textColor;',
          '  }',
          '  const titleBtnEls = document.querySelectorAll(".title-btn");',
          '  if (titleBtnEls && titleBtnEls.length) {',
          '    titleBtnEls.forEach(el => {',
          '      el.style.color = textColor;',
          '    });',
          '  }',
          '  const metaEl = document.querySelector(".meta");',
          '  if (metaEl) {',
          '    metaEl.style.color = metaColor;',
          '  }',
          '  const barContainer = document.querySelector(".bar");',
          '  if (barContainer) {',
          '    barContainer.style.backgroundColor = barBg;',
          '  }',
          '  if (barEl) {',
          '    barEl.style.backgroundColor = barInner;',
          '  }',
          '  const barFixedEl = document.querySelector(".bar-fixed");',
          '  if (barFixedEl) {',
          '    barFixedEl.style.backgroundColor = barBg;',
          '  }',
          '  const controlsEl = document.querySelector(".controls");',
          '  if (controlsEl) {',
          '    controlsEl.style.backgroundColor = bodyBg;',
          '  }',
          '  const pauseResumeGroupEl = document.querySelector(".pause-resume-group");',
          '  if (pauseResumeGroupEl) {',
          '    pauseResumeGroupEl.style.backgroundColor = controlsBg;',
          '    pauseResumeGroupEl.style.borderColor = controlsBorder;',
          '  }',
          '  const dividerEls = document.querySelectorAll(".controls-divider");',
          '  if (dividerEls && dividerEls.length) {',
          '    dividerEls.forEach(el => {',
          '      el.style.backgroundColor = controlsDivider;',
          '    });',
          '  }',
          '  const btnEls = document.querySelectorAll(".controls-btn");',
          '  if (btnEls && btnEls.length) {',
          '    btnEls.forEach(el => {',
          '      el.style.color = controlsItemColor;',
          '      if (!el.closest(".pause-resume-group")) {',
          '        el.style.backgroundColor = controlsBg;',
          '      }',
          '    });',
          '  }',
          '  const styleEl = document.getElementById("dynamic-theme-style");',
          '  if (styleEl) {',
          '    styleEl.textContent = ".title-btn:hover{background-color:" + titleBtnHoverBg + ";}.controls-btn:hover:not(:disabled):not(.pause-resume-group .controls-btn){background-color:" + controlsItemHoverBg + ";}";',
          '  }',
          '  const indicatorBg = payload.indicatorBg || "#e8e8e8";',
          '  if (pauseResumeIndicator) {',
          '    pauseResumeIndicator.style.backgroundColor = indicatorBg;',
          '  }',
          '  const connSummaryEl = document.querySelector(".conn-summary");',
          '  if (connSummaryEl) {',
          '    connSummaryEl.style.backgroundColor = barBg;',
          '  }',
          '  const connectionsPanelEl = document.querySelector(".connections-panel");',
          '  if (connectionsPanelEl) {',
          '    connectionsPanelEl.style.backgroundColor = bodyBg;',
          '  }',
          '  const connSummaryLabelEls = document.querySelectorAll(".conn-summary-label");',
          '  if (connSummaryLabelEls && connSummaryLabelEls.length) {',
          '    connSummaryLabelEls.forEach(el => {',
          '      el.style.color = metaColor;',
          '    });',
          '  }',
          '  const connSummaryValueEls = document.querySelectorAll(".conn-summary-value");',
          '  if (connSummaryValueEls && connSummaryValueEls.length) {',
          '    connSummaryValueEls.forEach(el => {',
          '      el.style.color = textColor;',
          '    });',
          '  }',
          '  const connTableThEls = document.querySelectorAll(".conn-table th");',
          '  if (connTableThEls && connTableThEls.length) {',
          '    const tabBg = payload.tabBg || "#f5f7fa";',
          '    const tabBorder = payload.tabBorder || "#dcdfe6";',
          '    connTableThEls.forEach(el => {',
          '      el.style.backgroundColor = tabBg;',
          '      el.style.borderColor = tabBorder;',
          '      el.style.color = textColor;',
          '    });',
          '  }',
          '  const connTableTdEls = document.querySelectorAll(".conn-table td");',
          '  if (connTableTdEls && connTableTdEls.length) {',
          '    const tabBorder = payload.tabBorder || "#dcdfe6";',
          '    connTableTdEls.forEach(el => {',
          '      el.style.borderColor = tabBorder;',
          '      if (!el.classList.contains("speed-active")) {',
          '        el.style.color = metaColor;',
          '      }',
          '    });',
          '  }',
          '  const connEmptyEl = document.querySelector(".conn-empty");',
          '  if (connEmptyEl) {',
          '    connEmptyEl.style.color = metaColor;',
          '  }',
          '  const tabNavEl = document.querySelector(".tab-nav");',
          '  if (tabNavEl) {',
          '    const tabBorder = payload.tabBorder || "#dcdfe6";',
          '    tabNavEl.style.borderColor = tabBorder;',
          '  }',
          '  const tabBtnEls = document.querySelectorAll(".tab-btn");',
          '  if (tabBtnEls && tabBtnEls.length) {',
          '    const tabBg = payload.tabBg || "#f5f7fa";',
          '    const tabColor = payload.tabColor || "#606266";',
          '    const tabBorder = payload.tabBorder || "#dcdfe6";',
          '    const tabActiveBg = "#409EFF";',
          '    const tabActiveColor = "#ffffff";',
          '    currentTheme = { tabBg, tabColor, tabBorder, tabActiveBg, tabActiveColor };',
          '    tabBtnEls.forEach(el => {',
          '      if (el.classList.contains("active")) {',
          '        el.style.backgroundColor = tabActiveBg;',
          '        el.style.color = tabActiveColor;',
          '      } else {',
          '        el.style.backgroundColor = tabBg;',
          '        el.style.color = tabColor;',
          '      }',
          '      el.style.borderColor = tabBorder;',
          '    });',
          '  }',
          '  const piecesInfoEl = document.querySelector(".pieces-info");',
          '  if (piecesInfoEl) {',
          '    piecesInfoEl.style.color = metaColor;',
          '  }',
          '  const piecesLegendEl = document.querySelector(".pieces-legend");',
          '  if (piecesLegendEl) {',
          '    piecesLegendEl.style.color = metaColor;',
          '  }',
          '  const piecePendingEls = document.querySelectorAll(".piece:not(.completed):not(.partial)");',
          '  if (piecePendingEls && piecePendingEls.length) {',
          '    const piecePending = payload.piecePending || "#dcdfe6";',
          '    piecePendingEls.forEach(el => {',
          '      el.style.backgroundColor = piecePending;',
          '    });',
          '  }',
          '  const legendPendingEl = document.querySelector(".legend-pending");',
          '  if (legendPendingEl) {',
          '    const piecePending = payload.piecePending || "#dcdfe6";',
          '    legendPendingEl.style.backgroundColor = piecePending;',
          '  }',
          '});',
          'function applyPayload(payload) {',
          '  if (!payload) {',
          '    return;',
          '  }',
          '  if (payload.gid) {',
          '    currentGid = String(payload.gid);',
          '  }',
          '  const title = payload.title ? String(payload.title) : "";',
          '  const percentText = payload.percentText ? String(payload.percentText) : "0%";',
          '  if (title) {',
          '    try { document.title = title; } catch (e) {}',
          '  }',
          '  if (windowTitleEl) {',
          '    windowTitleEl.innerText = title;',
          '  }',
          '  if (tabInfoBtn && payload.tabInfoText) {',
          '    tabInfoBtn.innerText = payload.tabInfoText || "Info";',
          '  }',
          '  if (tabConnectionsBtn && payload.tabConnectionsText) {',
          '    tabConnectionsBtn.innerText = payload.tabConnectionsText || "Connections";',
          '  }',
          '  if (barEl) {',
          '    barEl.style.width = percentText;',
          '    barEl.style.backgroundColor = payload.isPaused ? "#909399" : "#409EFF";',
          '  }',
          '  if (sizeEl && payload.sizeText != null) {',
          '    sizeEl.innerText = payload.sizeText || "";',
          '  }',
          '  if (speedEl && payload.speedText != null) {',
          '    speedEl.innerText = payload.speedText || "";',
          '  }',
          '  if (avgSpeedEl && payload.avgSpeedText != null) {',
          '    avgSpeedEl.innerText = payload.avgSpeedText || "";',
          '  }',
          '  if (connectionsEl && payload.connectionsText != null) {',
          '    connectionsEl.innerText = payload.connectionsText || "";',
          '  }',
          '  if (remainingEl && payload.remainingText != null) {',
          '    remainingEl.innerText = payload.remainingText || "";',
          '  }',
          '  if (payload.piecesData && payload.piecesData.numPieces > 0) {',
          '    const pd = payload.piecesData;',
          '    cachedPiecesData = pd;',
          '    if (tabPiecesBtn) {',
          '      tabPiecesBtn.style.display = "block";',
          '      tabPiecesBtn.innerText = pd.tabText || "Pieces";',
          '    }',
          '    if (piecesInfoEl) {',
          '      piecesInfoEl.innerText = pd.infoText || "";',
          '    }',
          '    if (piecesBarEl && pd.pieces) {',
          '      const pieces = Array.from(piecesBarEl.querySelectorAll(".piece"));',
          '      const newPieces = pd.pieces;',
          '      const pieceCount = pieces.length;',
          '      const newPieceCount = newPieces.length;',
          '      for (let i = 0; i < newPieceCount; i++) {',
          '        const status = newPieces[i];',
          '        const cls = status === 2 ? "completed" : (status === 1 ? "partial" : "");',
          '        if (i < pieceCount) {',
          '          const piece = pieces[i];',
          '          if (piece.className !== "piece " + cls) {',
          '            piece.className = "piece " + cls;',
          '          }',
          '        } else {',
          '          const newPiece = document.createElement("div");',
          '          newPiece.className = "piece " + cls;',
          '          piecesBarEl.appendChild(newPiece);',
          '        }',
          '      }',
          '      for (let i = pieceCount - 1; i >= newPieceCount; i--) {',
          '        pieces[i].remove();',
          '      }',
          '    }',
          '    if (legendCompletedEl) {',
          '      legendCompletedEl.innerText = pd.completedText || "";',
          '    }',
          '    if (legendPartialEl) {',
          '      legendPartialEl.innerText = pd.partialText || "";',
          '    }',
          '    if (legendPendingEl) {',
          '      legendPendingEl.innerText = pd.pendingText || "";',
          '    }',
          '  } else if (cachedPiecesData && cachedPiecesData.numPieces > 0) {',
          '    if (tabPiecesBtn && tabPiecesBtn.style.display === "none") {',
          '      tabPiecesBtn.style.display = "block";',
          '      if (cachedPiecesData.tabText) tabPiecesBtn.innerText = cachedPiecesData.tabText;',
          '    }',
          '  } else {',
          '    cachedPiecesData = null;',
          '    if (tabPiecesBtn) {',
          '      tabPiecesBtn.style.display = "none";',
          '    }',
          '    if (currentTab === "pieces") {',
          '      switchTab("info");',
          '    }',
          '  }',
          '  if (payload.connectionsData) {',
          '    const cd = payload.connectionsData;',
          '    if (connTotalLabelEl) connTotalLabelEl.innerText = cd.totalLabel || "";',
          '    if (connTotalValueEl) connTotalValueEl.innerText = cd.totalValue || "0";',
          '    if (connActiveLabelEl) connActiveLabelEl.innerText = cd.activeLabel || "";',
          '    if (connActiveValueEl) connActiveValueEl.innerText = cd.activeValue || "0";',
          '    if (connSpeedLabelEl) connSpeedLabelEl.innerText = cd.speedLabel || "";',
          '    if (connSpeedValueEl) connSpeedValueEl.innerText = cd.speedValue || "0 B/s";',
          '    if (connThHostEl) connThHostEl.innerText = cd.thHost || "";',
          '    if (connThDownloadedEl) connThDownloadedEl.innerText = cd.thDownloaded || "";',
          '    if (connThSpeedEl) connThSpeedEl.innerText = cd.thSpeed || "";',
          '    if (connThStatusEl) connThStatusEl.innerText = cd.thStatus || "";',
          '    if (cd.servers && cd.servers.length > 0) {',
          '      if (connTableWrapEl) connTableWrapEl.style.display = "block";',
          '      if (connEmptyEl) connEmptyEl.style.display = "none";',
          '      if (connTableBodyEl) {',
          '        const rows = Array.from(connTableBodyEl.querySelectorAll("tr"));',
          '        const newServers = cd.servers;',
          '        const rowCount = rows.length;',
          '        const serverCount = newServers.length;',
          '        for (let i = 0; i < serverCount; i++) {',
          '          const s = newServers[i];',
          '          if (i < rowCount) {',
          '            const row = rows[i];',
          '            const hostCell = row.cells[0];',
          '            const downloadedCell = row.cells[1];',
          '            const speedCell = row.cells[2];',
          '            const statusCell = row.cells[3];',
          '            if (hostCell) {',
          '              let hostSpan = hostCell.querySelector(".conn-host");',
          '              if (!hostSpan) {',
          '                hostCell.innerHTML = "<span class=\\"conn-host\\"></span>";',
          '                hostSpan = hostCell.querySelector(".conn-host");',
          '              }',
          '              const hostText = s.host || "-";',
          '              if (hostSpan) {',
          '                if (hostSpan.innerText !== hostText) hostSpan.innerText = hostText;',
          '                if (hostSpan.getAttribute("title") !== hostText) hostSpan.setAttribute("title", hostText);',
          '              }',
          '            }',
          '            if (downloadedCell && downloadedCell.innerText !== s.downloaded) downloadedCell.innerText = s.downloaded || "0 B";',
          '            if (speedCell) {',
          '              if (speedCell.innerText !== s.speed) speedCell.innerText = s.speed || "0 B/s";',
          '              const newClass = s.isActive ? "speed-active" : "";',
          '              if (speedCell.className !== newClass) speedCell.className = newClass;',
          '            }',
          '            if (statusCell && statusCell.innerText !== s.status) statusCell.innerText = s.status || "-";',
          '          } else {',
          '            const newRow = document.createElement("tr");',
          '            const hostTd = document.createElement("td");',
          '            const hostSpan = document.createElement("span");',
          '            const hostText = s.host || "-";',
          '            hostSpan.className = "conn-host";',
          '            hostSpan.innerText = hostText;',
          '            hostSpan.setAttribute("title", hostText);',
          '            hostTd.appendChild(hostSpan);',
          '            newRow.appendChild(hostTd);',
          '            const downloadedTd = document.createElement("td");',
          '            downloadedTd.innerText = s.downloaded || "0 B";',
          '            newRow.appendChild(downloadedTd);',
          '            const speedTd = document.createElement("td");',
          '            speedTd.className = s.isActive ? "speed-active" : "";',
          '            speedTd.innerText = s.speed || "0 B/s";',
          '            newRow.appendChild(speedTd);',
          '            const statusTd = document.createElement("td");',
          '            statusTd.innerText = s.status || "-";',
          '            newRow.appendChild(statusTd);',
          '            connTableBodyEl.appendChild(newRow);',
          '          }',
          '        }',
          '        for (let i = rowCount - 1; i >= serverCount; i--) {',
          '          rows[i].remove();',
          '        }',
          '      }',
          '    } else {',
          '      if (connTableBodyEl) {',
          '        connTableBodyEl.innerHTML = "";',
          '      }',
          '    }',
          '  }',
          '  if (pauseBtn) {',
          '    pauseBtn.title = payload.pauseText || "";',
          '    pauseBtn.disabled = !payload.canPause;',
          '  }',
          '  if (resumeBtn) {',
          '    resumeBtn.title = payload.resumeText || "";',
          '    resumeBtn.disabled = !payload.canResume;',
          '  }',
          '  if (pauseResumeIndicator) {',
          '    if (payload.isPaused) {',
          '      pauseResumeIndicator.classList.remove("right");',
          '    } else {',
          '      pauseResumeIndicator.classList.add("right");',
          '    }',
          '  }',
          '  if (cancelBtn) {',
          '    cancelBtn.title = payload.cancelText || "";',
          '    cancelBtn.disabled = !payload.canCancel;',
          '    cancelBtn.style.display = payload.showCancel ? \'flex\' : \'none\';',
          '  }',
          '}',
          'ipcRenderer.on("task-progress-update", (event, payload) => {',
          '  applyPayload(payload);',
          '});',
          'async function pollProgress() {',
          '  if (!currentGid) {',
          '    return;',
          '  }',
          '  const includeConnections = !!isPanelOpen;',
          '  try {',
          '    const res = await ipcRenderer.invoke("task-progress:fetch", { gid: currentGid, includeConnections });',
          '    if (res && res.done) {',
          '      try { window.close(); } catch (e) {}',
          '      return;',
          '    }',
          '    if (res && res.payload) {',
          '      applyPayload(res.payload);',
          '    }',
          '  } catch (e) {}',
          '}',
          'let pollTimer = setInterval(pollProgress, 1000);',
          'window.addEventListener("beforeunload", () => {',
          '  try { if (pollTimer) clearInterval(pollTimer); } catch (e) {}',
          '});',
          '</scr' + 'ipt>',
          '</body>',
          '</html>'
        ].join('')
        return html
      },
      async refreshProgressTaskDirectly () {
        // Refresh all progress windows
        this.progressWindows.forEach(async (win, gid) => {
          if (!this.isAliveWindow(win)) {
            this.progressWindows.delete(gid)
            return
          }

          const doneStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
          try {
            const task = await api.fetchTaskItem({ gid })
            if (!task || !task.gid) {
              this.closeProgressWindowByGid(gid)
              return
            }
            if (doneStatuses.includes(task.status)) {
              this.closeProgressWindowByGid(gid)
              return
            }
            this.updateProgressWindow(task)
          } catch (e) {
            this.closeProgressWindowByGid(gid)
          }
        })
      },
      buildProgressPayload (task) {
        const t = task || {}
        const completed = Number(t.completedLength || 0)
        const total = Number(t.totalLength || 0)
        const speed = Number(t.downloadSpeed || 0)
        const connections = Number(t.connections || 0)
        const percent = total > 0 ? Math.floor((completed * 100) / total) : 0
        const title = getTaskName(t, {
          defaultName: this.$t('task.get-task-name'),
          maxLen: -1
        })
        const completedText = bytesToSize(completed, 2)
        const totalText = total > 0 ? bytesToSize(total, 2) : ''
        const sizeText = totalText ? `${completedText} / ${totalText}` : completedText
        const speedValue = speed > 0 ? `${bytesToSize(speed, 2)}/s` : `${bytesToSize(0, 2)}/s`

        // 计算平均速度
        const gid = t && t.gid ? `${t.gid}` : ''
        const speedSamplesMap = this.$store.state.task.taskSpeedSamples || {}
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
        } else if (t.averageDownloadSpeed != null) {
          const v = Number(t.averageDownloadSpeed)
          avgSpeed = Number.isFinite(v) && v >= 0 ? v : 0
        }
        const avgSpeedValue = avgSpeed > 0 ? `${bytesToSize(avgSpeed, 2)}/s` : `${bytesToSize(0, 2)}/s`

        // 解析分片进度
        let piecesData = null
        const bitfield = t.bitfield || ''
        const numPieces = Number(t.numPieces || 0)
        if (bitfield && numPieces > 0) {
          const pieces = []
          let completedCount = 0
          let partialCount = 0
          let pendingCount = 0
          for (let i = 0; i < bitfield.length; i++) {
            const hex = parseInt(bitfield[i], 16)
            // hex 值 0-15 对应状态 0-3 (0=0%, 1-3=25%, 4-7=50%, 8-11=75%, 12-15=100%)
            // 简化为: 0=pending, 1-14=partial, 15=completed
            let status
            if (hex === 0) {
              status = 0 // pending
              pendingCount++
            } else if (hex === 15) {
              status = 2 // completed (f = 15 = 100%)
              completedCount++
            } else {
              status = 1 // partial
              partialCount++
            }
            pieces.push(status)
          }
          const pieceSize = Number(t.pieceLength || 0)
          const pieceSizeText = pieceSize > 0 ? bytesToSize(pieceSize, 2) : ''
          piecesData = {
            numPieces,
            pieces,
            tabText: this.$t('task.task-pieces-progress'),
            infoText: `${this.$t('task.task-num-pieces')}: ${numPieces} ${this.$t('task.task-pieces-unit')}` + (pieceSizeText ? ` (${pieceSizeText}/${this.$t('task.task-piece-unit')})` : ''),
            completedText: `${this.$t('task.piece-completed')} (${completedCount})`,
            partialText: `${this.$t('task.piece-partial')} (${partialCount})`,
            pendingText: `${this.$t('task.piece-pending')} (${pendingCount})`
          }
        }

        let remainingText = ''
        if (total > 0 && speed > 0 && completed < total) {
          const remainingSeconds = timeRemaining(total, completed, speed)
          if (remainingSeconds > 0) {
            remainingText = timeFormat(remainingSeconds, {
              prefix: this.$t('task.remaining-prefix'),
              i18n: {
                gt1d: this.$t('app.gt1d'),
                hour: this.$t('app.hour'),
                minute: this.$t('app.minute'),
                second: this.$t('app.second')
              }
            })
          }
        }
        if (!remainingText) {
          remainingText = `${this.$t('task.remaining-prefix')}: --`
        }
        const status = t.status
        const doneStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
        const isPaused = status === TASK_STATUS.PAUSED || status === TASK_STATUS.WAITING
        const canPause = status === TASK_STATUS.ACTIVE && completed > 0
        const canResume = status === TASK_STATUS.WAITING || status === TASK_STATUS.PAUSED
        const canCancel = !doneStatuses.includes(status)
        return {
          gid: t && t.gid ? `${t.gid}` : '',
          title,
          percent,
          percentText: `${percent}%`,
          nameText: title,
          isPaused,
          tabInfoText: this.$t('task.task-progress-info'),
          tabConnectionsText: this.$t('task.task-connections-detail'),
          sizeText: sizeText ? `${this.$t('task.task-file-size')}: ${sizeText}` : '',
          speedText: `${this.$t('task.task-download-speed')}: ${speedValue}`,
          avgSpeedText: `${this.$t('task.task-average-speed')}: ${avgSpeedValue}`,
          connectionsText: `${this.$t('task.task-connections')}: ${connections}`,
          remainingText,
          piecesData,
          connectionsData: null, // 将在 updateProgressWindow 中填充
          pauseText: this.$t('task.pause'),
          resumeText: this.$t('task.resume'),
          cancelText: this.$t('task.delete'),
          canPause,
          canResume,
          canCancel,
          showPause: true,
          showResume: true,
          showCancel: true
        }
      },
      buildConnectionsData (servers = [], taskSpeed = 0) {
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
                status: isActive ? this.$t('task.connection-status-active') : this.$t('task.connection-status-idle')
              })
            })
          })
        }

        return {
          totalLabel: this.$t('task.connections-total'),
          totalValue: String(totalConnections),
          activeLabel: this.$t('task.connections-active'),
          activeValue: String(activeConnections),
          speedLabel: this.$t('task.connections-total-speed'),
          speedValue: `${bytesToSize(taskSpeed, 2)}/s`,
          thHost: this.$t('task.connection-host'),
          thDownloaded: this.$t('task.task-peer-downloaded'),
          thSpeed: this.$t('task.connection-speed'),
          thStatus: this.$t('task.connection-status'),
          servers: serverList,
          emptyText: this.$t('task.no-connections')
        }
      },
      openProgressWindowForTask (task) {
        if (!task) {
          return
        }
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) {
          return
        }

        // 检查是否已经有窗口
        const existingWindow = this.progressWindows.get(gid)
        if (this.isAliveWindow(existingWindow)) {
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
                if (this.isAliveWindow(existingWindow)) {
                  existingWindow.setAlwaysOnTop(false)
                }
              } catch (e) {}
            }, 100)
          } catch (e) {
            console.warn('[Motrix] Failed to activate existing progress window:', e.message)
          }
          this.updateProgressWindow(task)
          return
        }

        this.progressTaskGids.add(gid)
        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const prefConfig = prefState && prefState.config ? prefState.config : {}
        const themeConfig = prefConfig.theme || APP_THEME.LIGHT
        const appState = this.$store && this.$store.state && this.$store.state.app
        const systemTheme = appState && appState.systemTheme ? appState.systemTheme : APP_THEME.LIGHT
        const finalTheme = themeConfig === APP_THEME.AUTO ? systemTheme : themeConfig
        const isDark = finalTheme === APP_THEME.DARK
        const hideAppMenu = !!prefConfig.hideAppMenu
        const isWin = process && process.platform === 'win32'
        const isLinux = process && process.platform === 'linux'
        const isMac = process && process.platform === 'darwin'
        const useCustomFrame = hideAppMenu && (isWin || isLinux)

        // 移除已有的窗口引用
        if (existingWindow) {
          this.progressWindows.delete(gid)
        }
        const { BrowserWindow } = require('@electron/remote')
        let icon = null
        try {
          const staticPath = (typeof window !== 'undefined' && window.__static) ? window.__static : null
          if (staticPath) {
            const path = require('node:path')
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
          backgroundColor: isDark ? '#343434' : '#ffffff',
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
        this.progressWindows.set(gid, win)

        win.on('closed', () => {
          this.progressWindows.delete(gid)
          this.progressTaskGids.delete(gid)
        })
        const html = this.buildProgressWindowHtml(useCustomFrame, isMac)
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        win.once('ready-to-show', () => {
          if (!this.isAliveWindow(win)) {
            this.progressWindows.delete(gid)
            this.progressTaskGids.delete(gid)
            return
          }
          const payload = this.buildProgressPayload(task)
          const windowTitle = this.$t('task.task-info-dialog-title', {
            title: payload.title
          })
          try {
            win.setTitle(windowTitle)
          } catch (e) {
            this.progressWindows.delete(gid)
            this.progressTaskGids.delete(gid)
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
                if (this.isAliveWindow(win)) {
                  win.setAlwaysOnTop(false)
                }
              } catch (e) {}
            }, 100)
          } catch (e) {
            console.warn('[Motrix] Failed to activate progress window:', e.message)
          }
          this.updateProgressWindow(task)
        })
      },
      async updateProgressWindow (task) {
        if (!task || !task.gid) {
          return
        }
        const gid = task.gid
        const win = this.progressWindows.get(gid)
        if (!this.isAliveWindow(win)) {
          this.progressWindows.delete(gid)
          this.progressTaskGids.delete(gid)
          return
        }
        const payload = this.buildProgressPayload(task)
        const taskSpeed = Number(task.downloadSpeed) || 0

        // 只在任务活跃或等待状态时获取连接数，暂停时不显示
        if (task.status === TASK_STATUS.ACTIVE || task.status === TASK_STATUS.WAITING) {
          try {
            const servers = await api.fetchTaskServers({ gid })
            payload.connectionsData = this.buildConnectionsData(servers, taskSpeed)
          } catch (e) {
            payload.connectionsData = this.buildConnectionsData([], taskSpeed)
          }
        } else {
          // 暂停、停止等状态时连接数为空，速度也为0
          payload.connectionsData = this.buildConnectionsData([], 0)
        }

        const windowTitle = this.$t('task.task-info-dialog-title', {
          title: payload.title
        })
        try {
          win.setTitle(windowTitle)
        } catch (e) {
          this.progressWindows.delete(gid)
          this.progressTaskGids.delete(gid)
          return
        }
        try {
          win.webContents.send('task-progress-update', payload)
        } catch (e) {}
      },
      closeProgressWindow () {
        // Close all progress windows
        this.progressWindows.forEach((win, gid) => {
          try {
            if (win && (!win.isDestroyed || !win.isDestroyed())) {
              win.close()
            }
          } catch (e) {}
        })
        this.progressWindows.clear()
        this.progressTaskGids.clear()
      },
      closeProgressWindowByGid (gid) {
        const win = this.progressWindows.get(gid)
        if (win) {
          try {
            if (!win.isDestroyed || !win.isDestroyed()) {
              win.close()
            }
          } catch (e) {}
          this.progressWindows.delete(gid)
        }
        this.progressTaskGids.delete(gid)
      },

      // Open a window to show task completion notification
      openCompletedTaskWindow (task) {
        console.log('[Motrix] openCompletedTaskWindow called:', task)
        if (!task) {
          console.log('[Motrix] No task provided')
          return
        }
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) {
          console.log('[Motrix] No gid found in task')
          return
        }
        console.log('[Motrix] Opening completed task window for gid:', gid)

        // Check if already showing a window for this task
        const existingWindow = this.completedTaskWindows.get(gid)
        if (this.isAliveWindow(existingWindow)) {
          existingWindow.show()
          existingWindow.focus()
          return
        }

        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const prefConfig = prefState && prefState.config ? prefState.config : {}
        const themeConfig = prefConfig.theme || APP_THEME.LIGHT
        const appState = this.$store && this.$store.state && this.$store.state.app
        const systemTheme = appState && appState.systemTheme ? appState.systemTheme : APP_THEME.LIGHT
        const finalTheme = themeConfig === APP_THEME.AUTO ? systemTheme : themeConfig
        const isDark = finalTheme === APP_THEME.DARK
        const hideAppMenu = !!prefConfig.hideAppMenu
        const isWin = process && process.platform === 'win32'
        const isLinux = process && process.platform === 'linux'
        const isMac = process && process.platform === 'darwin'
        const useCustomFrame = hideAppMenu && (isWin || isLinux)

        // Remove existing window reference
        if (existingWindow) {
          this.completedTaskWindows.delete(gid)
        }

        const { BrowserWindow } = require('@electron/remote')
        let icon = null
        try {
          const staticPath = (typeof window !== 'undefined' && window.__static) ? window.__static : null
          if (staticPath) {
            const path = require('node:path')
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
          backgroundColor: isDark ? '#343434' : '#ffffff',
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
        this.completedTaskWindows.set(gid, win)

        win.on('closed', () => {
          this.completedTaskWindows.delete(gid)
        })

        const html = this.buildCompletedTaskWindowHtml(task, useCustomFrame, isMac, isDark)
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

        win.once('ready-to-show', () => {
          if (!this.isAliveWindow(win)) {
            this.completedTaskWindows.delete(gid)
            return
          }

          const windowTitle = this.$t('task.task-completed-title') || '下载完成'
          try {
            win.setTitle(windowTitle)
          } catch (e) {
            this.completedTaskWindows.delete(gid)
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
                if (this.isAliveWindow(win)) {
                  win.setAlwaysOnTop(false)
                }
              } catch (e) {}
            }, 100)
          } catch (e) {
            console.warn('[Motrix] Failed to set always on top:', e.message)
          }
        })
      },

      // Build HTML for completed task window
      buildCompletedTaskWindowHtml (task, useCustomFrame = false, isMac = false, isDark = false) {
        // Get task name from files or bittorrent info
        let taskName = 'Unknown'
        const files = Array.isArray(task.files) ? task.files : []
        const { bittorrent } = task
        if (bittorrent && bittorrent.info && bittorrent.info.name) {
          taskName = bittorrent.info.name
        } else if (files.length === 1) {
          const file = files[0]
          let path = file.path
          if (!path && file.uris && file.uris.length > 0) {
            path = decodeURI(file.uris[0].uri)
          }
          if (path) {
            const index = path.lastIndexOf('/')
            if (index >= 0) {
              taskName = path.substring(index + 1)
            } else {
              taskName = path
            }
            // Remove query parameters
            const q = taskName.indexOf('?')
            if (q >= 0) taskName = taskName.substring(0, q)
          }
        } else if (files.length > 1) {
          taskName = `${files.length} files`
        }

        const totalLength = task.totalLength || task.completedLength || 0
        const formattedSize = this.formatBytes(totalLength)

        // Get full file path for opening folder
        let filePath = ''
        if (files.length > 0) {
          const file = files[0]
          filePath = file.path || ''
          if (!filePath && file.uris && file.uris.length > 0) {
            const uri = decodeURI(file.uris[0].uri)
            // Convert file:// URL to path
            if (uri.startsWith('file://')) {
              filePath = uri.substring(7)
            } else {
              filePath = uri
            }
          }
        }
        // If still no path, use task.dir + taskName
        if (!filePath && task.dir && taskName) {
          filePath = task.dir + '/' + taskName
        }

        const gid = task.gid || ''
        const bgColor = isDark ? '#343434' : '#ffffff'
        const textColor = isDark ? '#e0e0e0' : '#333333'
        const secondaryTextColor = isDark ? '#909399' : '#606266'
        const successColor = '#67c23a'
        const buttonBg = isDark ? '#3a3a3a' : '#f5f7fa'
        const buttonHoverBg = isDark ? '#444444' : '#e4e7ed'

        const showTitleBar = useCustomFrame || isMac

        const titleBarHtml = showTitleBar
          ? `
          <div class="title-bar">
            <span class="title-text">${this.$t('task.task-completed-title') || '下载完成'}</span>
            <div class="title-actions">
              <button class="title-btn" id="minimizeBtn">−</button>
              <button class="title-btn" id="titleCloseBtn">×</button>
            </div>
          </div>
          `
          : ''

        const titleBarCss = showTitleBar
          ? `
          .title-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 12px;
            padding-left: ${isMac ? '78px' : '12px'};
            background: ${bgColor};
            -webkit-app-region: drag;
            z-index: 1000;
          }
          .title-text {
            font-size: 13px;
            font-weight: 500;
            color: ${textColor};
            -webkit-app-region: drag;
          }
          .title-actions {
            display: flex;
            gap: 4px;
            -webkit-app-region: no-drag;
          }
          .title-btn {
            width: 24px;
            height: 24px;
            border-radius: 4px;
            border: none;
            background: transparent;
            color: ${secondaryTextColor};
            cursor: pointer;
            font-size: 14px;
            line-height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s;
          }
          .title-btn:hover {
            background-color: ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'};
            color: ${textColor};
          }
          ${
            isMac
              ? `
          .title-bar {
            justify-content: flex-end;
            padding-top: 4px;
            padding-right: 8px;
          }
          .title-actions {
            display: none;
          }
          `
              : ''
          }
        `
          : ''

        const containerPadding = showTitleBar ? '40px 16px 16px 16px' : '16px'
        const scriptEnd = '</' + 'script>'

        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 14px;
      background: ${bgColor};
      color: ${textColor};
      overflow: hidden;
    }
    ${titleBarCss}
    .container {
      padding: ${containerPadding};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .icon-wrapper {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: ${successColor}20;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
    }
    .icon {
      width: 28px;
      height: 28px;
      color: ${successColor};
    }
    .task-name {
      font-size: 15px;
      font-weight: 500;
      color: ${textColor};
      text-align: center;
      margin-bottom: 4px;
      max-width: 100%;
      padding: 0 8px;
      word-break: break-all;
    }
    .task-info {
      font-size: 13px;
      color: ${secondaryTextColor};
      text-align: center;
      margin-bottom: 16px;
    }
    .buttons {
      display: flex;
      gap: 8px;
      width: 100%;
    }
    .btn {
      flex: 1;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: ${buttonBg};
      color: ${textColor};
      font-size: 13px;
      cursor: pointer;
      transition: all 0.3s;
      text-align: center;
    }
    .btn:hover {
      background: ${buttonHoverBg};
    }
  </style>
</head>
<body>
  ${titleBarHtml}
  <div class="container">
    <div class="task-name" title="${this.escapeHtml(taskName)}">${this.escapeHtml(taskName)}</div>
    <div class="task-info">${formattedSize}</div>
    <div class="buttons">
      <button class="btn" id="openFileBtn">${this.$t('task.open-file') || '打开文件'}</button>
      <button class="btn" id="openFolderBtn">${this.$t('task.open-folder') || '打开文件夹'}</button>
      <button class="btn" id="closeBtn">${this.$t('task.close') || '关闭'}</button>
    </div>
  </div>
  <script>
    const { ipcRenderer } = require('electron')
    const gid = '${gid}'
    const filePath = ${JSON.stringify(filePath)}

    document.getElementById('closeBtn').addEventListener('click', () => {
      ipcRenderer.send('close-completed-task-window', gid)
    })

    const titleCloseBtn = document.getElementById('titleCloseBtn')
    if (titleCloseBtn) {
      titleCloseBtn.addEventListener('click', () => {
        ipcRenderer.send('close-completed-task-window', gid)
      })
    }

    const minimizeBtn = document.getElementById('minimizeBtn')
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('minimize-completed-task-window', gid)
      })
    }

    document.getElementById('openFolderBtn').addEventListener('click', () => {
      ipcRenderer.send('open-completed-task-folder', { gid, filePath })
    })

    document.getElementById('openFileBtn').addEventListener('click', () => {
      ipcRenderer.send('open-completed-task-file', { gid, filePath })
    })

    // Listen for theme changes from main window
    ipcRenderer.on('theme-changed', (event, theme) => {
      const isDark = theme === 'dark'
      const bgColor = isDark ? '#343434' : '#ffffff'
      const textColor = isDark ? '#e0e0e0' : '#333333'
      const secondaryTextColor = isDark ? '#909399' : '#606266'
      const buttonBg = isDark ? '#3a3a3a' : '#f5f7fa'
      const buttonHoverBg = isDark ? '#444444' : '#e4e7ed'

      document.body.style.background = bgColor
      document.body.style.color = textColor

      // Update task name color
      const taskNameEl = document.querySelector('.task-name')
      if (taskNameEl) taskNameEl.style.color = textColor

      // Update task info color
      const taskInfoEl = document.querySelector('.task-info')
      if (taskInfoEl) taskInfoEl.style.color = secondaryTextColor

      // Update buttons
      const buttons = document.querySelectorAll('.btn')
      buttons.forEach(btn => {
        btn.style.background = buttonBg
        btn.style.color = textColor
        btn.onmouseover = () => btn.style.background = buttonHoverBg
        btn.onmouseout = () => btn.style.background = buttonBg
      })

      // Update title bar
      const titleBar = document.querySelector('.title-bar')
      if (titleBar) titleBar.style.background = bgColor

      // Update title text color
      const titleText = document.querySelector('.title-text')
      if (titleText) titleText.style.color = textColor
    })
  ${scriptEnd}
</body>
</html>`
      },

      // Helper method to format bytes
      formatBytes (bytes) {
        if (!bytes || bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
      },

      // Helper method to escape HTML special characters
      escapeHtml (text) {
        if (!text) return ''
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
      },

      handleTaskListChange (list) {
        const prev = this.lastTaskStatuses || {}
        const autoOpened = this.autoOpenedProgressGids || new Set()
        const doneStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
        const currentGids = new Set()
        let candidate = null
        const newActiveTasks = []

        list.forEach(task => {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!gid) {
            return
          }
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
          if (!gid) {
            return
          }
          nextStatuses[gid] = task.status
        })
        Object.keys(nextStatuses).forEach(gid => {
          if (!currentGids.has(gid)) {
            delete nextStatuses[gid]
          }
        })
        this.lastTaskStatuses = nextStatuses

        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const prefConfig = prefState && prefState.config ? prefState.config : {}
        const autoOpenTaskProgressWindow = prefConfig.autoOpenTaskProgressWindow !== false
        const taskProgressWindowMode = prefConfig.taskProgressWindowMode || 'first'
        if (autoOpenTaskProgressWindow && (candidate || newActiveTasks.length > 0)) {
          if (taskProgressWindowMode === 'all') {
            newActiveTasks.forEach(task => {
              const gid = task && task.gid ? `${task.gid}` : ''
              if (gid) {
                autoOpened.add(gid)
                this.openProgressWindowForTask(task)
              }
            })
          } else if (candidate) {
            const gid = candidate && candidate.gid ? `${candidate.gid}` : ''
            if (gid) {
              autoOpened.add(gid)
              this.openProgressWindowForTask(candidate)
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
        const taskState = this.$store && this.$store.state && this.$store.state.task
        const currentListType = taskState && taskState.currentList ? taskState.currentList : 'all'
        const closeWhenMissingLists = ['all']

        this.progressWindows.forEach((win, gid) => {
          const current = list.find(item => item && `${item.gid}` === gid)
          if (!current) {
            if (closeWhenMissingLists.includes(currentListType)) {
              this.closeProgressWindowByGid(gid)
            } else {
              // Keep window open but refresh data
              this.refreshProgressTaskDirectly()
            }
            return
          }
          // Don't close progress window if BT task is seeding
          const isSeeding = checkTaskIsSeeder(current)
          if (doneStatuses.includes(current.status) && !isSeeding) {
            this.closeProgressWindowByGid(gid)
          } else {
            this.updateProgressWindow(current)
          }
        })

        // Check for newly completed tasks and show completion window
        // Only show if prevStatus is defined (not initial load) and task just became complete
        const showTaskCompletedWindow = prefConfig.showTaskCompletedWindow !== false

        if (showTaskCompletedWindow) {
          // 检查当前列表中新完成的任务
          list.forEach(task => {
            const gid = task && task.gid ? `${task.gid}` : ''
            if (!gid) return
            const prevStatus = prev[gid]
            const currentStatus = task.status
            // Show completion window when task becomes complete (but not on initial load)
            console.log('[Motrix] Task status check:', gid, 'prev:', prevStatus, 'current:', currentStatus)
            if (prevStatus && currentStatus === TASK_STATUS.COMPLETE && prevStatus !== TASK_STATUS.COMPLETE) {
              console.log('[Motrix] Opening completed task window for:', gid)
              this.openCompletedTaskWindow(task)
            }
          })

          // 检查从当前列表中消失但之前是活跃状态的任务
          // 这些任务可能已经完成并移到了其他分类
          const disappearedGids = Object.keys(prev).filter(gid => {
            const prevStatus = prev[gid]
            // 如果之前是活跃/等待/暂停状态，但现在不在当前列表中了
            if ([TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED].includes(prevStatus)) {
              const stillInList = list.some(task => task && `${task.gid}` === gid)
              return !stillInList
            }
            return false
          })

          // 如果有消失的任务，异步获取它们的最新状态
          if (disappearedGids.length > 0) {
            console.log('[Motrix] Checking disappeared tasks:', disappearedGids)
            // 使用 API 直接获取所有任务（不受分类过滤限制，包含历史记录）
            api.fetchTaskList({ type: 'all' })
              .then(allTasks => {
                if (!Array.isArray(allTasks)) return
                disappearedGids.forEach(gid => {
                  const task = allTasks.find(t => t && `${t.gid}` === gid)
                  if (task && task.status === TASK_STATUS.COMPLETE) {
                    console.log('[Motrix] Opening completed task window for disappeared task:', gid)
                    this.openCompletedTaskWindow(task)
                  }
                })
              })
              .catch(err => {
                console.warn('[Motrix] Failed to check disappeared tasks:', err)
              })
          }
        }
      }
    },
    mounted () {
      this.updateModalMaskVisible()
      if (typeof window !== 'undefined') {
        this.handleWindowResize()
        this._handleWindowResize = () => {
          this.handleWindowResize()
        }
        window.addEventListener('resize', this._handleWindowResize)
        this._handleWindowMouseMoveForAside = (event) => {
          this.handleWindowMouseMoveForAside(event)
        }
        window.addEventListener('mousemove', this._handleWindowMouseMoveForAside)
      }
      if (typeof MutationObserver === 'undefined') {
        return
      }

      this._modalObserver = new MutationObserver(() => {
        this.updateModalMaskVisible()
      })

      try {
        this._modalObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'aria-hidden']
        })
      } catch (e) {}

      commands.on('show-task-progress', this.handleShowTaskProgress)
      commands.on('task-progress:control', this.handleTaskProgressControl)
      commands.on('task-progress:auto-open', this.handleTaskProgressAutoOpen)
      commands.on('floating-bar:search-open', this.handleFloatingBarSearchOpen)
      commands.on('floating-bar:search-expanded', this.handleFloatingBarSearchExpanded)
    },
    beforeDestroy () {
      if (typeof window !== 'undefined' && this._handleWindowResize) {
        window.removeEventListener('resize', this._handleWindowResize)
        this._handleWindowResize = null
      }
      if (typeof window !== 'undefined' && this._handleWindowMouseMoveForAside) {
        window.removeEventListener('mousemove', this._handleWindowMouseMoveForAside)
        this._handleWindowMouseMoveForAside = null
      }
      if (this._asideMouseRaf) {
        window.cancelAnimationFrame(this._asideMouseRaf)
        this._asideMouseRaf = null
      }
      if (this._modalObserver) {
        try {
          this._modalObserver.disconnect()
          this._modalObserver = null
        } catch (e) {}
      }
      commands.off('show-task-progress', this.handleShowTaskProgress)
      commands.off('task-progress:control', this.handleTaskProgressControl)
      commands.off('task-progress:auto-open', this.handleTaskProgressAutoOpen)
      commands.off('floating-bar:search-open', this.handleFloatingBarSearchOpen)
      commands.off('floating-bar:search-expanded', this.handleFloatingBarSearchExpanded)
    }
  }
</script>

<style lang="scss">
  @import '~@/components/Theme/Variables';
  @import '~@/components/Theme/Light/Variables';

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
    border-radius: 16px;
  }

  .el-dialog.task-plan-dialog .task-plan-dialog-title {
    display: flex;
    align-items: center;
    margin-right: 28px;
    margin-top: -8px;
  }

  .task-plan-dialog .task-type-slider {
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
      display: inline-flex;
      position: relative;
      z-index: 1;
    }

    .el-radio-button {
      display: flex;
      .el-radio-button__inner {
        position: relative;
        z-index: 1;
        display: flex;
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

      &.is-disabled .el-radio-button__inner {
        color: $--color-text-secondary;
        opacity: 0.4;
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

  .theme-dark .task-plan-dialog .task-type-slider {
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

  .el-dialog.task-plan-dialog .el-select {
    width: 100%;
  }

  .el-dialog.task-plan-dialog .el-dialog__footer {
    padding: 0;
    background-color: transparent;
  }

  .task-plan-dialog .dialog-footer {
    position: relative;
    min-height: 52px;
  }

  .task-plan-dialog .dialog-submit-btn {
    position: absolute;
    right: 12px;
    bottom: 10px;
    height: 28px;
    padding: 0 16px;
    border-radius: 8px !important;
  }

  .el-dialog.task-plan-dialog .el-dialog__footer::before {
    display: none;
  }

  /* 小屏幕侧边栏样式 */
  .aside-small-screen {
    position: fixed;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1000;
    background-color: transparent;
    border-radius: 100px;
    opacity: 0.5;
    transition: opacity 0.3s ease;
    padding: 8px;

    &:hover {
      opacity: 1;
    }

    &.is-auto-hide-aside {
      transform: translateY(-50%) translateX(calc(-100% - 20px));
      transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;

      /* 感应区域 */
      &::before {
        content: '';
        position: absolute;
        top: -50px;
        bottom: -50px;
        right: -100px;
        width: 150px;
        background: transparent;
        cursor: default;
        pointer-events: none;
        z-index: -1;
      }

      &:hover,
      &.is-proximity-hovered {
        transform: translateY(-50%) translateX(0);
      }
    }
  }

  /* 只针对小窗模式的菜单样式 */
  .aside-small-screen .menu {
    list-style: none;
    padding: 0;
    margin: 0 auto;
    user-select: none;
    cursor: default;
    > li {
      width: 32px;
      height: 32px;
      cursor: pointer;
      border-radius: 16px;
      transition: background-color 0.25s, border-radius 0.25s;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
      border: none;
      box-shadow: none;
      &:focus,
      &:active {
        outline: none;
        border: none;
        box-shadow: none;
      }
      &:hover {
        background-color: rgba(0, 0, 0, 0.15);
        border-radius: 8px;
      }
      &.active {
        background-color: rgba(0, 0, 0, 0.25);
        border-radius: 8px;
      }
    }
    svg {
      padding: 6px;
      color: $--icon-color;
      outline: none;
      border: none;
      box-shadow: none;
    }
  }

  .aside-small-screen .small-menu {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 4px 0;
    > li {
      margin-top: 8px;
      margin-bottom: 8px;
      &:first-child {
        margin-top: 0;
      }
      &:last-child {
        margin-bottom: 0;
      }
    }
  }
</style>
