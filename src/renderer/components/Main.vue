<template>
  <el-container id="container">
    <div class="content-area">
      <router-view />
    </div>
    <el-dialog
      :visible.sync="taskPlanVisible"
      width="360px"
      custom-class="task-plan-dialog"
      append-to-body
      :modal="true"
    >
      <div slot="title" class="task-plan-dialog-title">
        <mo-segmented-slider
          class="task-type-slider"
          v-model="taskPlanType"
          :options="taskPlanTypeOptions"
        />
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
  </el-container>
</template>

<script>
  import { mapState } from 'vuex'
  import { dialog } from '@electron/remote'
  import { commands } from '@/components/CommandManager/instance'
  import { TASK_STATUS, APP_THEME } from '@shared/constants'
  import themeTokens from '@/utils/themeTokens'
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
  import EngineClient from '@/components/Native/EngineClient'
  import AddTask from '@/components/Task/AddTask'
  import TaskDetail from '@/components/TaskDetail/TaskDetailDrawer'
  import Dragger from '@/components/Dragger/DragDropZone'
  import SegmentedSlider from '@/components/SegmentedSlider/SegmentedSlider'

  export default {
    name: 'mo-main',
    components: {
      [EngineClient.name]: EngineClient,
      [AddTask.name]: AddTask,
      [TaskDetail.name]: TaskDetail,
      [Dragger.name]: Dragger,
      [SegmentedSlider.name]: SegmentedSlider
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
        completedTaskWindows: new Map() // gid -> window for completed tasks
      }
    },
    computed: {
      ...mapState('app', {
        addTaskVisible: state => state.addTaskVisible,
        addTaskType: state => state.addTaskType,
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
        prefTheme: state => state.config && state.config.theme
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
      taskPlanTypeOptions () {
        return [
          { value: 'complete', label: this.$t('app.task-plan-type-complete'), disabled: this.isTaskPlanCompleteTypeDisabled },
          { value: 'scheduled', label: this.$t('app.task-plan-type-scheduled') }
        ]
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
      taskList (val) {
        this.handleTaskListChange(val || [])
      },
      prefTheme () {
        this.handleThemeChangeForProgressWindow()
      },
      systemTheme () {
        this.handleThemeChangeForProgressWindow()
      }
    },
    methods: {
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
            const tc = this.getThemeColors()
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

            const bodyBg = this.getThemeColors().bodyBg
            if (typeof win.setBackgroundColor === 'function') {
              win.setBackgroundColor(bodyBg)
            }
            try {
              win.webContents.send('theme-changed', isDark ? 'dark' : 'light')
            } catch (e) {}
          } catch (e) {}
        })
      },
      getThemeColors () {
        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const themeConfig = (prefState && prefState.config && prefState.config.theme) || APP_THEME.LIGHT
        const appState = this.$store && this.$store.state && this.$store.state.app
        const systemTheme = (appState && appState.systemTheme) || APP_THEME.LIGHT
        const effectiveTheme = themeTokens.resolveTheme(themeConfig, systemTheme)
        return themeTokens.getColors(effectiveTheme)
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
          console.warn('[LinkCore] deleteTaskFilesFromProgress error:', err)
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
        const tc = this.getThemeColors()
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
          '.tab-content{display:none;}',
          '.tab-content.active{display:block;}',
          '.bar{height:6px;background:VAR_BAR_BG;border-radius:3px;overflow:hidden;margin-bottom:8px;}',
          '.bar-fixed{position:fixed;top:160px;left:12px;right:12px;height:6px;background:VAR_BAR_BG;border-radius:3px;overflow:hidden;z-index:999;}',
          '.bar-inner{height:100%;background:VAR_BAR_INNER;width:0;transition:width .2s ease;}',
          '.meta{color:VAR_META_COLOR;font-size:12px;margin-bottom:8px;}',
          '.meta-line{margin-bottom:2px;}',
          '.pieces-scroll-wrap{position:relative;margin-bottom:8px;}',
          '.pieces-empty{padding:28px 0;text-align:center;font-size:12px;color:VAR_META_COLOR;user-select:none;}',
          '.pieces-scroll-box{max-height:120px;overflow-y:auto;overflow-x:hidden;cursor:grab;user-select:none;-webkit-user-select:none;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,0.15) transparent;}',
          '.pieces-scroll-box.is-dragging{cursor:grabbing;}',
          '.pieces-scroll-box::-webkit-scrollbar{width:6px;}',
          '.pieces-scroll-box::-webkit-scrollbar-track{background:transparent;}',
          '.pieces-scroll-box::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.15);border-radius:3px;}',
          '.pieces-bar{display:flex;flex-wrap:wrap;gap:3px;}',
          '.piece{width:10px;height:10px;border-radius:4px;}',
          '.piece.s0{background:VAR_PIECE_COLOR_0;}',
          '.piece.s1{background:VAR_PIECE_COLOR_1;}',
          '.piece.s2{background:VAR_PIECE_COLOR_2;}',
          '.piece.s3{background:VAR_PIECE_COLOR_3;}',
          '.piece.s4{background:VAR_PIECE_COLOR_4;}',
          '.pieces-fade{position:absolute;left:0;right:0;height:16px;pointer-events:none;z-index:2;}',
          '.pieces-fade--top{top:0;background:linear-gradient(to bottom,VAR_BODY_BG 0%,transparent 100%);}',
          '.pieces-fade--bottom{bottom:0;background:linear-gradient(to top,VAR_BODY_BG 0%,transparent 100%);}',
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
          '.controls{position:fixed;top:170px;left:12px;right:12px;display:flex;justify-content:flex-end;gap:8px;padding:8px 0;background-color:VAR_BODY_BG;pointer-events:none;z-index:1000;}',
          '.controls-left{display:flex;pointer-events:auto;}',
          '.controls-left .controls-btn{position:relative;}',
          // connToggle 与 pinBtn 视觉上组成一个药丸按钮组（pinBtn 以负 margin 叠在
          // connToggle 下方）。若只给 connToggle 自身加 hover，悬停到 pinBtn 露出的
          // 右半部分时不会高亮，出现"只有一边高亮"。改为对 .controls-left 整组 hover：
          // 任意一侧悬停时两侧同时高亮，保持整体一致。
          '.controls-left:hover .controls-btn{background-color:VAR_CONTROLS_ITEM_HOVER_BG;}',
          '.controls-left:hover #pinBtn{background-color:VAR_CONTROLS_ITEM_HOVER_BG;}',
          '.pieces-toggle-group{display:none;background-color:VAR_CONTROLS_BG;border-radius:18px;box-shadow:0 2px 8px rgba(0,0,0,0.15);border:1px solid VAR_CONTROLS_BORDER;overflow:hidden;position:relative;pointer-events:auto;-webkit-app-region:no-drag;}',
          '.pieces-toggle-indicator{position:absolute;height:32px;top:2px;left:0;width:0;background-color:VAR_PRIMARY_COLOR;border-radius:16px;transition:transform 0.25s cubic-bezier(0.4,0,0.2,1),width 0.25s ease;z-index:0;}',
          '.pieces-toggle-tab{border:none;box-shadow:none;margin:0;background-color:transparent;height:36px;padding:0 12px 0 8px;font-size:12px;color:VAR_CONTROLS_ITEM_COLOR;cursor:pointer;position:relative;z-index:1;transition:color 0.2s ease;white-space:nowrap;}',
          '.pieces-toggle-tab:hover:not(.active){color:VAR_PRIMARY_COLOR;}',
          '.pieces-toggle-tab.active{color:#fff;}',
          '#pinBtn{margin-left:-18px;z-index:1;border-radius:0 18px 18px 0;width:46px;background-color:VAR_CONTROLS_BG;}',
          '#connToggle{z-index:2;}',
          '.controls-inner{display:flex;align-items:center;justify-content:flex-end;gap:8px;pointer-events:auto;}',
          '.controls-divider{display:none;}',
          '.pause-resume-group{display:flex;background-color:VAR_CONTROLS_BG;border-radius:18px;box-shadow:0 2px 8px rgba(0,0,0,0.15);border:1px solid VAR_CONTROLS_BORDER;overflow:hidden;position:relative;}',
          '.pause-resume-indicator{position:absolute;width:32px;height:32px;background-color:VAR_INDICATOR_BG;border-radius:50%;top:2px;left:2px;transition:transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);z-index:0;box-shadow:inset 0 1px 3px rgba(0,0,0,0.1);}',
          '.pause-resume-indicator.right{transform:translateX(36px);}',
          '.pause-resume-group .controls-btn{border-radius:0;border:none;box-shadow:none;margin:0;background-color:transparent;width:36px;height:36px;position:relative;z-index:1;}',
          '.pause-resume-group .controls-btn:first-child{border-radius:18px 0 0 18px;}',
          '.pause-resume-group .controls-btn:last-child{border-radius:0 18px 18px 0;}',
          '.controls-btn{width:36px;height:36px;border-radius:50%;border:none;background-color:VAR_CONTROLS_BG;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;color:VAR_CONTROLS_ITEM_COLOR;transition:background-color .2s ease,opacity .2s ease;box-shadow:0 2px 8px rgba(0,0,0,0.15);border:1px solid VAR_CONTROLS_BORDER;}',
          '.controls-btn:hover:not(:disabled){background-color:VAR_CONTROLS_ITEM_HOVER_BG;}',
          '.pause-resume-group .controls-btn:hover:not(:disabled){background-color:transparent;color:VAR_PRIMARY_COLOR;}',
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
          '.controls-btn.active .icon-pin-svg{color:VAR_PRIMARY_COLOR;}'
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
          .replace(/VAR_PIECE_COLOR_0/g, tc.pieceColors[0])
          .replace(/VAR_PIECE_COLOR_1/g, tc.pieceColors[1])
          .replace(/VAR_PIECE_COLOR_2/g, tc.pieceColors[2])
          .replace(/VAR_PIECE_COLOR_3/g, tc.pieceColors[3])
          .replace(/VAR_PIECE_COLOR_4/g, tc.pieceColors[4])
          .replace(/VAR_TAB_BORDER/g, tc.tabBorder)
          .replace(/VAR_TAB_BG/g, tc.tabBg)
          .replace(/VAR_TAB_COLOR/g, tc.tabColor)
          .replace(/VAR_TAB_HOVER_BG/g, tc.tabHoverBg)
          .replace(/VAR_TAB_ACTIVE_BG/g, tc.tabActiveBg)
          .replace(/VAR_TAB_ACTIVE_COLOR/g, tc.tabActiveColor)
          .replace(/VAR_SUCCESS_COLOR/g, tc.successColor)
          .replace(/VAR_PRIMARY_COLOR/g, primaryColor)
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
          '<div class="pieces-scroll-wrap">',
          '<div class="pieces-scroll-box" id="piecesScrollBox">',
          '<div class="pieces-bar" id="piecesBar"></div>',
          '</div>',
          '<div class="pieces-empty" id="piecesEmpty" style="display:none;"></div>',
          '<div class="pieces-fade pieces-fade--top" id="piecesFadeTop" style="display:none;"></div>',
          '<div class="pieces-fade pieces-fade--bottom" id="piecesFadeBottom" style="display:none;"></div>',
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
          '<div id="piecesToggle" class="pieces-toggle-group" style="display:none;">',
          '<div class="pieces-toggle-indicator" id="piecesToggleIndicator"></div>',
          '<button id="piecesTabInfo" class="pieces-toggle-tab active"></button>',
          '<button id="piecesTabPieces" class="pieces-toggle-tab"></button>',
          '</div>',
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
          'let _piecesIndicatorW = 0;',
          'let _piecesIndicatorX = 0;',
          `let currentTheme = { tabBg: "${tc.tabBg}", tabColor: "${tc.tabColor}", tabBorder: "${tc.tabBorder}", tabActiveBg: "${tc.tabActiveBg}", tabActiveColor: "${tc.tabActiveColor}", barBg: "${tc.barBg}" };`,
          'const windowTitleEl = document.getElementById("window-title");',
          'const closeBtn = document.getElementById("close-btn");',
          'const minBtn = document.getElementById("min-btn");',
          'const piecesToggleGroup = document.getElementById("piecesToggle");',
          'const piecesToggleIndicator = document.getElementById("piecesToggleIndicator");',
          'const piecesTabInfoBtn = document.getElementById("piecesTabInfo");',
          'const piecesTabPiecesBtn = document.getElementById("piecesTabPieces");',
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
          'const piecesBarEl = document.getElementById("piecesBar");',
          'const piecesEmptyEl = document.getElementById("piecesEmpty");',
          'const piecesScrollBoxEl = document.getElementById("piecesScrollBox");',
          'const piecesFadeTopEl = document.getElementById("piecesFadeTop");',
          'const piecesFadeBottomEl = document.getElementById("piecesFadeBottom");',
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
          'let piecesDragState = null;',
          'let piecesFadeRafId = null;',
          'function updatePiecesFadeState() {',
          '  if (!piecesScrollBoxEl) return;',
          '  try {',
          '    const scrollH = piecesScrollBoxEl.scrollHeight || 0;',
          '    const clientH = piecesScrollBoxEl.clientHeight || 0;',
          '    if (scrollH <= clientH + 2) {',
          '      if (piecesFadeTopEl) piecesFadeTopEl.style.display = "none";',
          '      if (piecesFadeBottomEl) piecesFadeBottomEl.style.display = "none";',
          '      return;',
          '    }',
          '    const scrollTop = piecesScrollBoxEl.scrollTop || 0;',
          '    if (piecesFadeTopEl) piecesFadeTopEl.style.display = scrollTop > 2 ? "block" : "none";',
          '    const atBottom = scrollTop + clientH >= scrollH - 2;',
          '    if (piecesFadeBottomEl) piecesFadeBottomEl.style.display = atBottom ? "none" : "block";',
          '  } catch (_) {',
          '    if (piecesFadeTopEl) piecesFadeTopEl.style.display = "none";',
          '    if (piecesFadeBottomEl) piecesFadeBottomEl.style.display = "none";',
          '  }',
          '}',
          'function schedulePiecesFadeUpdate() {',
          '  if (piecesFadeRafId) return;',
          '  piecesFadeRafId = requestAnimationFrame(() => {',
          '    piecesFadeRafId = null;',
          '    updatePiecesFadeState();',
          '  });',
          '}',
          'if (piecesScrollBoxEl) {',
          '  piecesScrollBoxEl.addEventListener("scroll", schedulePiecesFadeUpdate);',
          '  piecesScrollBoxEl.addEventListener("mousedown", function(e) {',
          '    try {',
          '      const scrollH = piecesScrollBoxEl.scrollHeight || 0;',
          '      const clientH = piecesScrollBoxEl.clientHeight || 0;',
          '      if (scrollH <= clientH + 2) return;',
          '      piecesDragState = { startY: e.clientY, startScrollTop: piecesScrollBoxEl.scrollTop || 0 };',
          '      piecesScrollBoxEl.classList.add("is-dragging");',
          '      e.preventDefault();',
          '    } catch (_) {}',
          '  });',
          '  document.addEventListener("mousemove", function(e) {',
          '    if (!piecesDragState) return;',
          '    try {',
          '      const deltaY = e.clientY - piecesDragState.startY;',
          '      piecesScrollBoxEl.scrollTop = piecesDragState.startScrollTop - deltaY;',
          '    } catch (_) {}',
          '  });',
          '  document.addEventListener("mouseup", function() {',
          '    if (!piecesDragState) return;',
          '    piecesDragState = null;',
          '    if (piecesScrollBoxEl) piecesScrollBoxEl.classList.remove("is-dragging");',
          '  });',
          '}',
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
          'function updatePiecesIndicator() {',
          '  if (!piecesToggleIndicator) return;',
          '  var activeTab = currentTab === "pieces" ? piecesTabPiecesBtn : piecesTabInfoBtn;',
          '  if (!activeTab) return;',
          '  var w = activeTab.offsetWidth;',
          '  if (w > 0) {',
          '    var x = activeTab.offsetLeft;',
          '    var leftInset = 2;',
          '    var rightInset = 2;',
          '    w = w - leftInset - rightInset;',
          '    x = x + leftInset;',
          '    if (w !== _piecesIndicatorW) {',
          '      _piecesIndicatorW = w;',
          '      piecesToggleIndicator.style.width = w + "px";',
          '    }',
          '    if (x !== _piecesIndicatorX) {',
          '      _piecesIndicatorX = x;',
          '      piecesToggleIndicator.style.transform = "translateX(" + x + "px)";',
          '    }',
          '  }',
          '}',
          'function switchTab(tab) {',
          '  currentTab = tab;',
          '  if (piecesTabInfoBtn) piecesTabInfoBtn.classList.toggle("active", tab === "info");',
          '  if (piecesTabPiecesBtn) piecesTabPiecesBtn.classList.toggle("active", tab === "pieces");',
          '  updatePiecesIndicator();',
          '  if (contentInfoEl) contentInfoEl.classList.toggle("active", tab === "info");',
          '  if (contentPiecesEl) contentPiecesEl.classList.toggle("active", tab === "pieces");',
          '  if (tab === "pieces") { schedulePiecesFadeUpdate(); }',
          '}',
          'if (piecesTabInfoBtn) piecesTabInfoBtn.onclick = () => { switchTab("info"); };',
          'if (piecesTabPiecesBtn) piecesTabPiecesBtn.onclick = () => { switchTab("pieces"); };',
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
          '  const textColor = payload.textColor || "#2c3e50";',
          '  const statusColor = payload.statusColor || "#5a6c7d";',
          '  const metaColor = payload.metaColor || "#8492a6";',
          '  const barBg = payload.barBg || "#e2e8f0";',
          '  const barInner = payload.barInner || "#1a7fe0";',
          '  const controlsBg = payload.controlsBg || "#ffffff";',
          '  const controlsBorder = payload.controlsBorder || "#d3dde6";',
          '  const controlsDivider = payload.controlsDivider || "#e2e8f0";',
          '  const controlsItemColor = payload.controlsItemColor || "#5a6c7d";',
          '  const controlsItemHoverBg = payload.controlsItemHoverBg || "#f0f4f8";',
          '  const titleBtnHoverBg = payload.titleBtnHoverBg || "rgba(26,35,50,0.08)";',
          '  document.body.style.backgroundColor = bodyBg;',
          '  document.body.style.color = textColor;',
          '  if (piecesFadeTopEl) { piecesFadeTopEl.style.background = "linear-gradient(to bottom," + bodyBg + " 0%,transparent 100%)"; }',
          '  if (piecesFadeBottomEl) { piecesFadeBottomEl.style.background = "linear-gradient(to top," + bodyBg + " 0%,transparent 100%)"; }',
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
          '  const piecesToggleGroupEl = document.querySelector(".pieces-toggle-group");',
          '  if (piecesToggleGroupEl) {',
          '    piecesToggleGroupEl.style.backgroundColor = controlsBg;',
          '    piecesToggleGroupEl.style.borderColor = controlsBorder;',
          '  }',
          '  const dividerEls = document.querySelectorAll(".controls-divider");',
          '  if (dividerEls && dividerEls.length) {',
          '    dividerEls.forEach(el => {',
          '      el.style.backgroundColor = controlsDivider;',
          '    });',
          '  }',
          // 按钮颜色和背景已通过 dynamic-theme-style 管理，无需设置内联样式
          '  const styleEl = document.getElementById("dynamic-theme-style");',
          '  const primaryColor = payload.primaryColor || "#1a7fe0";',
          '  const pieceColors = payload.pieceColors || ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#39d353"];',
          '  if (styleEl) {',
          '    styleEl.textContent = ".title-btn:hover{background-color:" + titleBtnHoverBg + ";}.controls-btn{color:" + controlsItemColor + "!important;background-color:" + controlsBg + "!important;}.controls-btn:hover:not(:disabled){background-color:" + controlsItemHoverBg + "!important;}.pause-resume-group .controls-btn{background-color:transparent!important;}.pause-resume-group .controls-btn:hover:not(:disabled){background-color:transparent!important;color:" + primaryColor + "!important;}.pieces-toggle-tab{color:" + controlsItemColor + "!important;}.pieces-toggle-group .pieces-toggle-tab{background-color:transparent!important;}.pieces-toggle-tab:hover:not(.active){color:" + primaryColor + "!important;}.pieces-toggle-indicator{background-color:" + primaryColor + "!important;}.controls-left:hover .controls-btn{background-color:" + controlsItemHoverBg + "!important;}.controls-left:hover #pinBtn{background-color:" + controlsItemHoverBg + "!important;}.controls-btn.active .icon-pin-svg{color:" + primaryColor + "!important;}.piece.s0{background-color:" + pieceColors[0] + "!important;}.piece.s1{background-color:" + pieceColors[1] + "!important;}.piece.s2{background-color:" + pieceColors[2] + "!important;}.piece.s3{background-color:" + pieceColors[3] + "!important;}.piece.s4{background-color:" + pieceColors[4] + "!important;}";',
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
          '    const tabBg = payload.tabBg || "#f0f4f8";',
          '    const tabBorder = payload.tabBorder || "#d3dde6";',
          '    connTableThEls.forEach(el => {',
          '      el.style.backgroundColor = tabBg;',
          '      el.style.borderColor = tabBorder;',
          '      el.style.color = textColor;',
          '    });',
          '  }',
          '  const connTableTdEls = document.querySelectorAll(".conn-table td");',
          '  if (connTableTdEls && connTableTdEls.length) {',
          '    const tabBorder = payload.tabBorder || "#d3dde6";',
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
          '  const tabBorder = payload.tabBorder || "#d3dde6";',
          '  currentTheme = { tabBorder, tabActiveBg: payload.primaryColor || "#1a7fe0" };',
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
          '  if (piecesTabInfoBtn) {',
          '    if (payload.tabInfoShort !== undefined || payload.tabInfoText !== undefined) {',
          '      var infoShort = payload.tabInfoShort || payload.tabInfoText || "";',
          '      if (piecesTabInfoBtn.innerText !== infoShort) {',
          '        piecesTabInfoBtn.innerText = infoShort;',
          '        updatePiecesIndicator();',
          '      }',
          '      piecesTabInfoBtn.title = payload.tabInfoText || "";',
          '    }',
          '  }',
          '  if (piecesTabPiecesBtn) {',
          '    if (payload.tabPiecesShort !== undefined || payload.tabPiecesText !== undefined) {',
          '      var psShort = payload.tabPiecesShort || payload.tabPiecesText || "";',
          '      if (piecesTabPiecesBtn.innerText !== psShort) {',
          '        piecesTabPiecesBtn.innerText = psShort;',
          '        updatePiecesIndicator();',
          '      }',
          '      piecesTabPiecesBtn.title = payload.tabPiecesText || (payload.piecesData && payload.piecesData.tabText) || "";',
          '    }',
          '  }',
          '  if (barEl) {',
          '    barEl.style.width = percentText;',
          '    barEl.style.backgroundColor = payload.isPaused ? "#8b95a3" : "#1a7fe0";',
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
          '    if (piecesToggleGroup && piecesToggleGroup.style.display !== "flex") {',
          '      piecesToggleGroup.style.display = "flex";',
          '      requestAnimationFrame(updatePiecesIndicator);',
          '    }',
          '    if (piecesEmptyEl) {',
          '      piecesEmptyEl.style.display = "none";',
          '    }',
          '    if (piecesTabPiecesBtn && pd.tabText) {',
          '      piecesTabPiecesBtn.title = pd.tabText;',
          '    }',
          '    if (piecesBarEl && pd.pieces) {',
          '      const pieces = Array.from(piecesBarEl.querySelectorAll(".piece"));',
          '      const newPieces = pd.pieces;',
          '      const pieceCount = pieces.length;',
          '      const newPieceCount = newPieces.length;',
          '      for (let i = 0; i < newPieceCount; i++) {',
          '        const status = newPieces[i];',
          '        const cls = "s" + status;',
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
          '      schedulePiecesFadeUpdate();',
          '    }',
          '  } else {',
          '    cachedPiecesData = null;',
          '    if (piecesToggleGroup) {',
          '      piecesToggleGroup.style.display = "none";',
          '    }',
          '    if (currentTab === "pieces") {',
          '      switchTab("info");',
          '    }',
          '    if (piecesBarEl) {',
          '      piecesBarEl.innerHTML = "";',
          '    }',
          '    if (piecesEmptyEl) {',
          '      piecesEmptyEl.innerText = payload.piecesEmptyText || "";',
          '      piecesEmptyEl.style.display = "block";',
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
          '/* 滑块切换组常显，加载后初始化一次指示器位置 */',
          'requestAnimationFrame(updatePiecesIndicator);',
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

        // 解析分片进度 - 与任务详情活动图表 (TaskGraphic) 保持一致的 5 级分类
        let piecesData = null
        const bitfield = t.bitfield || ''
        const numPieces = Number(t.numPieces || 0)
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
            tabText: this.$t('task.task-pieces-progress')
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
        // 待选择文件状态（磁力元数据已下载完、等待用户选择文件），
        // 进度窗口据此用橙色进度条区分"任务还没正式开始"
        const pendingMap = this.$store.state.task.pendingFileSelection || {}
        const pendingSelection = !!(gid && pendingMap[gid])
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
          pendingSelection,
          // 与主进程 task-progress:fetch 返回保持一致，
          // 避免事件推送缺字段时滑块按钮文本被清空导致宽度闪烁
          tabInfoText: this.$t('task.task-progress-info'),
          tabPiecesText: this.$t('task.task-pieces-progress'),
          piecesEmptyText: this.$t('task.task-no-pieces-data'),
          tabInfoShort: this.$t('task.task-progress-info'),
          tabPiecesShort: this.$t('task.task-pieces-progress'),
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
            console.warn('[LinkCore] Failed to activate existing progress window:', e.message)
          }
          this.updateProgressWindow(task)
          return
        }

        this.progressTaskGids.add(gid)
        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const prefConfig = prefState && prefState.config ? prefState.config : {}
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
          backgroundColor: this.getThemeColors().bodyBg,
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
        // Write HTML to a temp file and load it, because data: URLs have
        // size limits in Chromium that this large HTML can exceed.
        try {
          const path = require('node:path')
          const os = require('node:os')
          const fs = require('node:fs')
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
            console.warn('[LinkCore] Failed to activate progress window:', e.message)
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
          // 独立进度窗口的平均速度由窗口自身轮询 (task-progress:fetch) 计算
          // 此处移除 avgSpeedText 以避免两个数据源交替覆盖导致闪烁
          if ('avgSpeedText' in payload) {
            delete payload.avgSpeedText
          }
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
        const existingWindow = this.completedTaskWindows.get(gid)
        if (this.isAliveWindow(existingWindow)) {
          existingWindow.show()
          existingWindow.focus()
          return
        }

        const prefState = this.$store && this.$store.state && this.$store.state.preference
        const prefConfig = prefState && prefState.config ? prefState.config : {}
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
          backgroundColor: this.getThemeColors().bodyBg,
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

        const html = this.buildCompletedTaskWindowHtml(task, useCustomFrame, isMac)
        try {
          const path = require('node:path')
          const os = require('node:os')
          const fs = require('node:fs')
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
            console.warn('[LinkCore] Failed to set always on top:', e.message)
          }
        })
      },

      // Build HTML for completed task window
      buildCompletedTaskWindowHtml (task, useCustomFrame = false, isMac = false) {
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
        const tc2 = this.getThemeColors()
        const bgColor = tc2.bodyBg
        const textColor = tc2.textColor
        const secondaryTextColor = tc2.secondaryTextColor
        const successColor = tc2.successColor
        const buttonBg = tc2.buttonBg
        const buttonHoverBg = tc2.buttonHoverBg

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
            background-color: ${tc2.titleBtnHoverBg};
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
      padding-bottom: 0;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .content-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
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
      margin-top: auto;
      padding-bottom: 16px;
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
      color: #ffffff;
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
    <div class="content-wrapper">
      <div class="task-name" title="${this.escapeHtml(taskName)}">${this.escapeHtml(taskName)}</div>
      <div class="task-info">${formattedSize}</div>
    </div>
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
      const bgColor = isDark ? '#262a31' : '#ffffff'
      const textColor = isDark ? '#dfe3e8' : '#2c3e50'
      const secondaryTextColor = isDark ? '#8b95a3' : '#5a6c7d'
      const buttonBg = isDark ? '#3d424d' : '#1a7fe0'
      const buttonHoverBg = isDark ? '#4a505c' : '#1a7fe0'
      const buttonTextColor = '#ffffff'

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
        btn.style.color = buttonTextColor
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
            console.log('[LinkCore] Task status check:', gid, 'prev:', prevStatus, 'current:', currentStatus)
            if (prevStatus && currentStatus === TASK_STATUS.COMPLETE && prevStatus !== TASK_STATUS.COMPLETE) {
              console.log('[LinkCore] Opening completed task window for:', gid)
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
            console.log('[LinkCore] Checking disappeared tasks:', disappearedGids)
            // 使用 API 直接获取所有任务（不受分类过滤限制，包含历史记录）
            api.fetchTaskList({ type: 'all' })
              .then(allTasks => {
                if (!Array.isArray(allTasks)) return
                disappearedGids.forEach(gid => {
                  const task = allTasks.find(t => t && `${t.gid}` === gid)
                  if (task && task.status === TASK_STATUS.COMPLETE) {
                    console.log('[LinkCore] Opening completed task window for disappeared task:', gid)
                    this.openCompletedTaskWindow(task)
                  }
                })
              })
              .catch(err => {
                console.warn('[LinkCore] Failed to check disappeared tasks:', err)
              })
          }
        }
      }
    },
    mounted () {
      this.updateModalMaskVisible()
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
    },
    beforeDestroy () {
      if (this._modalObserver) {
        try {
          this._modalObserver.disconnect()
          this._modalObserver = null
        } catch (e) {}
      }
      commands.off('show-task-progress', this.handleShowTaskProgress)
      commands.off('task-progress:control', this.handleTaskProgressControl)
      commands.off('task-progress:auto-open', this.handleTaskProgressAutoOpen)
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

  /* 任务计划分类切换滑块：项内边距加大 */
  .task-plan-dialog .task-type-slider .lc-segmented__item {
    padding: 0 20px;
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
</style>
