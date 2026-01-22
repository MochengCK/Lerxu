<template>
  <el-container id="container">
    <router-view />
    <mo-floating-bar />
    <el-tooltip effect="dark" :content="$t('app.task-plan')" placement="top" :open-delay="500">
      <button
        class="mo-task-plan"
        :class="{
          'is-planned': isTaskPlanPlanned,
          'is-search-open': isFloatingBarSearchOpen,
          'is-search-expanded': isFloatingBarSearchExpanded
        }"
        type="button"
        @click="onTaskPlanClick"
      >
        <mo-icon name="task-plan" width="20" height="20" />
      </button>
    </el-tooltip>
    <el-dialog
      :visible.sync="taskPlanVisible"
      width="360px"
      custom-class="task-plan-dialog"
      append-to-body
    >
      <div slot="title" class="task-plan-dialog-title">
        <el-radio-group v-model="taskPlanType" size="mini">
          <el-radio-button label="complete" :disabled="isTaskPlanCompleteTypeDisabled">{{ $t('app.task-plan-type-complete') }}</el-radio-button>
          <el-radio-button label="scheduled">{{ $t('app.task-plan-type-scheduled') }}</el-radio-button>
        </el-radio-group>
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
        <div class="mo-task-plan-save">
          <el-button type="primary" :disabled="isTaskPlanSaveDisabled" @click="saveTaskPlan">{{ $t('app.save') }}</el-button>
        </div>
      </div>
    </el-dialog>
    <mo-speedometer :class="{ 'is-shifted': isSpeedometerShifted }" />
    <mo-add-task :visible="addTaskVisible" :type="addTaskType" />
    <mo-task-detail
      :visible="taskDetailVisible"
      :gid="currentTaskGid"
      :task="currentTaskItem"
      :files="currentTaskFiles"
      :peers="currentTaskPeers"
    />
    <mo-dragger />
    <div v-if="showMainFloatingAside" class="aside-small-screen">
      <ul class="menu small-menu">
        <li
          @click="nav('/task')"
          :class="{ active: currentPage === '/task' }"
        >
          <el-tooltip
            effect="dark"
            :content="$t('menu.task')"
            placement="right"
            :open-delay="500"
          >
            <mo-icon name="menu-task" width="20" height="20" />
          </el-tooltip>
        </li>
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
    getTaskName
  } from '@shared/utils'
  import {
    moveTaskFilesToTrash
  } from '@/utils/native'
  import FloatingBar from '@/components/BottomBar/FloatingBar'
  import Speedometer from '@/components/Speedometer/Speedometer'
  import AddTask from '@/components/Task/AddTask'
  import TaskDetail from '@/components/TaskDetail/Index'
  import Dragger from '@/components/Dragger/Index'
  import '@/components/Icons/menu-task'
  import '@/components/Icons/task-plan'
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
        taskPlanVisible: false,
        taskPlanAction: '',
        taskPlanType: 'complete',
        taskPlanTime: '',
        taskPlanOnlyWhenIdle: false,
        hasModalMaskVisible: false,
        hasModalDialogVisible: false,
        lastTaskStatuses: {},
        progressWindows: new Map(), // gid -> window
        progressTaskGids: new Set(),
        isFloatingBarSearchOpen: false,
        isFloatingBarSearchExpanded: false,
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
        sidebarLayoutMode: state => (state.config && state.config.sidebarLayoutMode) || 'floating'
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
      isSpeedometerShifted () {
        const { taskPlanVisible, addTaskVisible, hasModalDialogVisible } = this
        return !!(taskPlanVisible || addTaskVisible || hasModalDialogVisible)
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
        const width = this.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 0)
        const mode = this.sidebarLayoutMode
        if (mode !== 'three-column') {
          return true
        }
        if (!width) {
          return false
        }
        return width < 960
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
        this.$router.push({
          path: page
        }).catch(err => {
          console.log(err)
        })
      },
      onTaskPlanClick () {
        if (this.isTaskPlanPlanned) {
          this.$store.dispatch('preference/save', {
            taskPlanAction: 'none',
            taskPlanType: 'complete',
            taskPlanTime: '',
            taskPlanGids: [],
            taskPlanOnlyWhenIdle: false
          })
          this.taskPlanAction = 'none'
          this.taskPlanVisible = false
          this.$msg.success(this.$t('app.task-plan-cancelled-message'))
          return
        }
        this.taskPlanAction = this.normalizeTaskPlanAction(this.taskPlanActionFromConfig)
        this.taskPlanType = this.normalizeTaskPlanType(this.taskPlanTypeFromConfig, this.taskPlanActionFromConfig)
        this.taskPlanTime = this.normalizeTaskPlanTime(this.taskPlanTimeFromConfig)
        this.taskPlanOnlyWhenIdle = !!this.taskPlanOnlyWhenIdleFromConfig
        this.taskPlanVisible = true
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
            const bodyBg = isDark ? '#1f1f1f' : '#ffffff'
            const textColor = isDark ? '#e5e5e5' : '#303133'
            const statusColor = isDark ? '#c0c4cc' : '#606266'
            const metaColor = isDark ? '#b0b0b0' : '#909399'
            const barBg = isDark ? '#3a3a3a' : '#ebeef5'
            const barInner = '#409EFF'
            const controlsBg = isDark ? '#252525' : '#ffffff'
            const controlsBorder = isDark ? '#4a4a4a' : '#dcdfe6'
            const controlsDivider = isDark ? '#555555' : '#e4e7ed'
            const controlsItemColor = isDark ? '#e5e5e5' : '#606266'
            const controlsItemHoverBg = isDark ? '#333333' : '#f2f6fc'
            const titleBtnHoverBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'

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
                tabBg: isDark ? '#2a2a2a' : '#f5f7fa',
                tabColor: isDark ? '#b0b0b0' : '#606266',
                tabBorder: isDark ? '#4a4a4a' : '#dcdfe6',
                piecePending: isDark ? '#4a4a4a' : '#dcdfe6'
              })
            } catch (e) {}
            this.updateProgressWindow(task)
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
        if (noConfirmBeforeDelete) {
          await this.$store.dispatch('task/forcePauseTask', task)
            .finally(async () => {
              // 先从aria2中删除任务
              await this.removeTaskItemFromProgress(task, taskName)

              // 然后再删除文件
              if (deleteWithFiles) {
                await new Promise(resolve => setTimeout(resolve, 500))
                await this.deleteTaskFilesFromProgress(task)
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
          await this.$store.dispatch('task/forcePauseTask', task)
            .finally(async () => {
              // 先从aria2中删除任务
              await this.removeTaskItemFromProgress(task, taskName)

              // 然后再删除文件
              if (checkboxChecked) {
                await new Promise(resolve => setTimeout(resolve, 500))
                await this.deleteTaskFilesFromProgress(task)
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
      buildProgressWindowHtml (useCustomFrame = false) {
        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const prefConfig = prefState && prefState.config ? prefState.config : {}
        const themeConfig = prefConfig.theme || APP_THEME.LIGHT
        const appState = this.$store && this.$store.state && this.$store.state.app
        const systemTheme = appState && appState.systemTheme ? appState.systemTheme : APP_THEME.LIGHT
        const finalTheme = themeConfig === APP_THEME.AUTO ? systemTheme : themeConfig
        const isDark = finalTheme === APP_THEME.DARK
        const bodyBg = isDark ? '#1f1f1f' : '#ffffff'
        const textColor = isDark ? '#e5e5e5' : '#303133'
        const statusColor = isDark ? '#c0c4cc' : '#606266'
        const metaColor = isDark ? '#b0b0b0' : '#909399'
        const barBg = isDark ? '#3a3a3a' : '#ebeef5'
        const barInner = '#409EFF'
        const controlsBg = isDark ? '#252525' : '#ffffff'
        const controlsBorder = isDark ? '#4a4a4a' : '#dcdfe6'
        const controlsDivider = isDark ? '#555555' : '#e4e7ed'
        const controlsItemColor = isDark ? '#e5e5e5' : '#606266'
        const controlsItemHoverBg = isDark ? '#333333' : '#f2f6fc'
        const titleBtnHoverBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
        const titleBarStyle = useCustomFrame
          ? '.title-bar{height:26px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;-webkit-app-region:drag;background-color:VAR_BODY_BG;}'
          : '.title-bar{display:none;}'
        const contentStyle = useCustomFrame
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
          '.tab-nav{display:flex;gap:0;margin-bottom:10px;border-radius:4px;overflow:hidden;border:1px solid VAR_TAB_BORDER;-webkit-app-region:no-drag;}',
          '.tab-btn{flex:1;padding:6px 12px;border:none;background:VAR_TAB_BG;color:VAR_TAB_COLOR;cursor:pointer;font-size:12px;transition:all .15s ease;}',
          '.tab-btn:not(:last-child){border-right:1px solid VAR_TAB_BORDER;}',
          '.tab-btn:hover{background:VAR_TAB_HOVER_BG;}',
          '.tab-btn.active{background:VAR_TAB_ACTIVE_BG;color:VAR_TAB_ACTIVE_COLOR;}',
          '.tab-content{display:none;}',
          '.tab-content.active{display:block;}',
          '.bar{height:6px;background:VAR_BAR_BG;border-radius:3px;overflow:hidden;margin-bottom:8px;}',
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
          '.conn-summary-item{text-align:center;flex:1;}',
          '.conn-summary-label{font-size:11px;color:VAR_META_COLOR;margin-bottom:2px;}',
          '.conn-summary-value{font-size:14px;font-weight:600;}',
          '.conn-table-wrap{-webkit-app-region:no-drag;max-height:130px;overflow-y:auto;overflow-x:hidden;}',
          '.conn-table{width:100%;border-collapse:collapse;font-size:11px;background:transparent;}',
          '.conn-table th,.conn-table td{padding:4px 6px;text-align:left;border:none;}',
          '.conn-table th{background:transparent;font-weight:500;position:sticky;top:0;color:VAR_TEXT_COLOR;}',
          '.conn-table td{color:VAR_META_COLOR;background:transparent;}',
          '.conn-table .speed-active{color:#67c23a;font-weight:500;}',
          '.conn-empty{text-align:center;padding:20px;color:VAR_META_COLOR;}',
          '.connections-panel{position:fixed;top:220px;left:0;right:0;padding:12px 0;background-color:VAR_BODY_BG;box-sizing:border-box;}',
          '.controls{position:fixed;top:170px;left:12px;right:12px;display:flex;justify-content:space-between;padding:8px 0;background-color:VAR_BODY_BG;pointer-events:none;z-index:1000;}',
          '.controls-left{display:flex;pointer-events:auto;}',
          '.controls-inner{display:flex;align-items:center;justify-content:flex-end;gap:8px;pointer-events:auto;}',
          '.controls-divider{display:none;}',
          '.controls-btn{width:36px;height:36px;border-radius:50%;border:none;background-color:VAR_CONTROLS_BG;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;color:VAR_CONTROLS_ITEM_COLOR;transition:background-color .2s ease,opacity .2s ease;box-shadow:0 2px 8px rgba(0,0,0,0.15);border:1px solid VAR_CONTROLS_BORDER;}',
          '.controls-btn:hover:not(:disabled){background-color:VAR_CONTROLS_ITEM_HOVER_BG;}',
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
          '.controls-btn.active .icon-connections{transform:rotate(180deg);}'
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
          '<div class="bar"><div class="bar-inner" id="bar"></div></div>',
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
          '<div class="controls">',
          '<div class="controls-left">',
          '<button id="connToggle" class="controls-btn" title="连接详情"><span class="controls-btn-icon icon-connections"></span></button>',
          '</div>',
          '<div class="controls-inner">',
          '<button id="pause" class="controls-btn"><span class="controls-btn-icon icon-pause"></span></button>',
          '<button id="resume" class="controls-btn"><span class="controls-btn-icon icon-resume"></span></button>',
          '<button id="cancel" class="controls-btn"><span class="controls-btn-icon icon-cancel"></span></button>',
          '</div>',
          '</div>',
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
          'const connToggleBtn = document.getElementById("connToggle");',
          'const connectionsPanel = document.getElementById("connectionsPanel");',
          'const PANEL_HEIGHT = 200;',
          'let isPanelOpen = false;',
          'let initialWidth = 0;',
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
          '  const controlsEl = document.querySelector(".controls");',
          '  if (controlsEl) {',
          '    controlsEl.style.backgroundColor = bodyBg;',
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
          '      el.style.backgroundColor = controlsBg;',
          '    });',
          '  }',
          '  const styleEl = document.getElementById("dynamic-theme-style");',
          '  if (styleEl) {',
          '    styleEl.textContent = ".title-btn:hover{background-color:" + titleBtnHoverBg + ";}.controls-btn:hover:not(:disabled){background-color:" + controlsItemHoverBg + ";}";',
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
          '            if (hostCell && hostCell.innerText !== s.host) hostCell.innerText = s.host || "-";',
          '            if (downloadedCell && downloadedCell.innerText !== s.downloaded) downloadedCell.innerText = s.downloaded || "0 B";',
          '            if (speedCell) {',
          '              if (speedCell.innerText !== s.speed) speedCell.innerText = s.speed || "0 B/s";',
          '              const newClass = s.isActive ? "speed-active" : "";',
          '              if (speedCell.className !== newClass) speedCell.className = newClass;',
          '            }',
          '            if (statusCell && statusCell.innerText !== s.status) statusCell.innerText = s.status || "-";',
          '          } else {',
          '            const newRow = document.createElement("tr");',
          '            newRow.innerHTML = "<td>" + (s.host || "-") + "</td><td>" + (s.downloaded || "0 B") + "</td><td class=\\"" + (s.isActive ? "speed-active" : "") + "\\">" + (s.speed || "0 B/s") + "</td><td>" + (s.status || "-") + "</td>";',
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
          '    pauseBtn.style.display = payload.showPause ? \'flex\' : \'none\';',
          '  }',
          '  if (resumeBtn) {',
          '    resumeBtn.title = payload.resumeText || "";',
          '    resumeBtn.disabled = !payload.canResume;',
          '    resumeBtn.style.display = payload.showResume ? \'flex\' : \'none\';',
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
          backgroundColor: isDark ? '#1f1f1f' : '#ffffff',
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
        const html = this.buildProgressWindowHtml(useCustomFrame)
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
      handleTaskListChange (list) {
        const prev = this.lastTaskStatuses || {}
        let candidate = null
        list.forEach(task => {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!gid) {
            return
          }
          const prevStatus = prev[gid]
          const currentStatus = task.status
          if (!candidate && currentStatus === TASK_STATUS.ACTIVE && prevStatus !== TASK_STATUS.ACTIVE) {
            candidate = task
          }
        })
        const nextStatuses = {}
        list.forEach(task => {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!gid) {
            return
          }
          nextStatuses[gid] = task.status
        })
        this.lastTaskStatuses = nextStatuses
        if (candidate) {
          const prefState = this.$store && this.$store.state && this.$store.state.preference
          const prefConfig = prefState && prefState.config ? prefState.config : {}
          const autoOpenTaskProgressWindow = prefConfig.autoOpenTaskProgressWindow !== false
          const taskProgressWindowMode = prefConfig.taskProgressWindowMode || 'first'
          if (autoOpenTaskProgressWindow) {
            if (taskProgressWindowMode === 'all') {
              // 为所有新的活跃任务打开窗口
              list.forEach(task => {
                const gid = task && task.gid ? `${task.gid}` : ''
                if (!gid) return
                const prevStatus = prev[gid]
                const currentStatus = task.status
                if (currentStatus === TASK_STATUS.ACTIVE && prevStatus !== TASK_STATUS.ACTIVE) {
                  this.openProgressWindowForTask(task)
                }
              })
            } else {
              // 只为第一个任务打开窗口
              this.openProgressWindowForTask(candidate)
            }
          }
        }

        // Update existing progress windows
        const doneStatuses = [TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED]
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
          if (doneStatuses.includes(current.status)) {
            this.closeProgressWindowByGid(gid)
          } else {
            this.updateProgressWindow(current)
          }
        })
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

  .mo-task-plan {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(87px);
    z-index: 220;
    height: 40px;
    width: 40px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 100px;
    border: 1px solid $--speedometer-border-color;
    background-color: $--floating-bar-background;
    opacity: 0.5;
    transition: opacity 0.15s ease-out,
      border-color 0.15s ease-out,
      transform 0.15s ease-out;
    cursor: pointer;
    user-select: none;
    outline: none;
    overflow: hidden;
    white-space: nowrap;
    font-size: 0;
    line-height: 0;

    &:hover {
      opacity: 1;
      border-color: $--speedometer-hover-border-color;
    }

    svg {
      display: block;
      color: $--floating-bar-item-color;
    }

    &.is-planned {
      opacity: 1;
      border-color: #c2e7b0;
      animation: pulse-green 1s infinite;
    }

    &.is-planned:hover {
      border-color: #a5d6a7;
      opacity: 1;
    }

    &.is-search-open {
      transform: translateX(121px);
      transition-delay: 0s;
    }

    &.is-search-expanded {
      transform: translateX(277px);
      transition-delay: 0s;
    }
  }

  .el-dialog.task-plan-dialog {
    max-width: 360px;
    min-width: 320px;
  }

  .el-dialog.task-plan-dialog .task-plan-dialog-title {
    display: flex;
    align-items: center;
    margin-right: 28px;
  }

  .el-dialog.task-plan-dialog .el-select {
    width: 100%;
  }

  .el-dialog.task-plan-dialog .el-dialog__footer {
    padding: 0;
  }

  .el-dialog.task-plan-dialog .el-dialog__footer::before {
    display: none;
  }

  .mo-task-plan-save {
    position: fixed;
    right: 14px;
    bottom: 24px;
    z-index: 2147483647;
  }

  .theme-dark .mo-task-plan.is-planned {
    border-color: #a5d6a7;
  }

  .theme-light .mo-task-plan:hover,
  .theme-light .mo-task-plan.is-planned {
    background-color: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .theme-dark .mo-task-plan:hover,
  .theme-dark .mo-task-plan.is-planned {
    background-color: rgba(45, 45, 45, 0.7);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  @keyframes pulse-green {
    0% {
      box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.4);
    }
    70% {
      box-shadow: 0 0 0 5px rgba(103, 194, 58, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(103, 194, 58, 0);
    }
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
