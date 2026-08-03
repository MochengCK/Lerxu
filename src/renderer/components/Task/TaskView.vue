<template>
  <el-container
    class="main panel"
    direction="horizontal"
  >
    <!-- 三栏布局的左侧固定导航 -->
    <el-aside width="220px" class="subnav three-column-subnav" :class="{ 'is-auto-hide-aside': autoHideAside, 'is-proximity-hovered': isSubnavProximityHovered }">
      <mo-task-subnav :current="status" />
    </el-aside>

    <el-container
      class="content panel"
      direction="vertical"
    >
      <el-header
        class="panel-header task-panel-header"
        height="44"
      >
        <mo-task-actions
          :dateFilter="taskActionsDateFilter"
          @date-filter-click="onDateFilterClick"
          @date-filter-hover="onDateFilterHover"
          @date-filter-leave="onDateFilterLeave"
        >
          <div class="task-search-box" :class="{ 'is-focused': isSearchFocused }">
            <i class="el-icon-search"></i>
            <input
              ref="taskSearchInput"
              type="text"
              class="task-search-input"
              :placeholder="$t('task.search-tasks')"
              v-model="taskSearchQuery"
              @focus="onSearchFocus"
              @blur="onSearchBlur"
            />
          </div>
        </mo-task-actions>
      </el-header>
      <el-main class="panel-content" @contextmenu.native="onTaskPageContextMenu">
        <mo-task-list :category="categoryFilter" :keyword="taskSearchQuery" />
      </el-main>
    </el-container>

    <transition name="popup-scale">
      <mo-custom-date-picker
        v-if="datePickerVisible"
        v-model="selectedDate"
        :frosted="dateFilterFrosted"
        :task-counts="taskDateCounts"
        :trigger-rect="dateFilterBtnRect"
        @change="onDateChange"
        @hover="onDateHover"
        @clear="onDateClear"
        @close="closeDatePicker"
      />
    </transition>
  </el-container>
</template>

<script>
  import { dialog, Menu, getCurrentWindow } from '@electron/remote'
  import { mapState } from 'vuex'

  import api from '@/api'
  import { commands } from '@/components/CommandManager/instance'
  import { ADD_TASK_TYPE, TASK_STATUS } from '@shared/constants'
  import TaskActions from '@/components/Task/TaskActions'
  import TaskList from '@/components/Task/TaskList'
  import TaskSubnav from '@/components/Subnav/TaskSubnav'
  import CustomDatePicker from '@/components/Task/DatePicker'
  import '@/components/Icons/menu-task'
  import '@/components/Icons/task-start'
  import '@/components/Icons/task-pause'
  import '@/components/Icons/task-stop'
  import '@/components/Icons/date-filter'
  import '@/components/Icons/menu-preference'
  import {
    getTaskUri,
    parseHeader
  } from '@shared/utils'
  import {
    delayDeleteTaskFiles,
    showItemInFolder,
    moveTaskFilesToTrash
  } from '@/utils/native'

  export default {
    name: 'mo-content-task',
    components: {
      [TaskActions.name]: TaskActions,
      [TaskList.name]: TaskList,
      [TaskSubnav.name]: TaskSubnav,
      [CustomDatePicker.name]: CustomDatePicker
    },
    props: {
      status: {
        type: String,
        default: 'all'
      },
      filterDate: {
        type: String,
        default: null
      }
    },
    data () {
      return {
        isHoveringCategoryPopper: false,
        isCategoryPopperEventsBound: false,
        categoryHoverCloseTimer: null,
        categoryPopperMouseEnterHandler: null,
        categoryPopperMouseLeaveHandler: null,
        datePickerVisible: false,
        selectedDate: '',
        taskDateCounts: {}, // 存储每个日期的任务数量
        showDateText: false,
        dateFilterBtnRect: {}, // 日期筛选按钮的位置信息
        hoverDate: null, // 悬停的日期
        isSubnavProximityHovered: false,
        isSearchFocused: false
      }
    },
    computed: {
      ...mapState('task', {
        taskList: state => state.taskList,
        currentList: state => state.currentList,
        selectedGidList: state => state.selectedGidList,
        selectedGidListCount: state => state.selectedGidList.length,
        taskSearchKeyword: state => state.searchKeyword,
        storeFilterDate: state => state.filterDate,
        taskDetailVisible: state => state.taskDetailVisible
      }),
      ...mapState('app', {
        systemTheme: state => state.systemTheme,
        addTaskVisible: state => state.addTaskVisible,
        taskPlanVisible: state => state.taskPlanVisible
      }),
      ...mapState('preference', {
        noConfirmBeforeDelete: state => state.config.noConfirmBeforeDeleteTask,
        prefTheme: state => state.config.theme,
        dateFilterFrosted: state => state.config.dateFilterFrosted,
        autoHideAside: state => state.config.autoHideAside,
        hideAppMenu: state => state.config.hideAppMenu
      }),
      subnavs () {
        return [
          {
            key: 'all',
            title: this.$t('task.all'),
            route: '/task/all'
          },
          {
            key: 'active',
            title: this.$t('task.active'),
            route: '/task/active'
          },
          {
            key: 'waiting',
            title: this.$t('task.waiting'),
            route: '/task/waiting'
          },
          {
            key: 'stopped',
            title: this.$t('task.stopped'),
            route: '/task/stopped'
          }
        ]
      },
      title () {
        if (this.status === 'date' && this.filterDate) {
          return `${this.$t('task.date-filter')} - ${this.filterDate}`
        }
        const subnav = this.subnavs.find((item) => item.key === this.status)
        return subnav ? subnav.title : this.$t('task.all')
      },
      taskSearchQuery: {
        get () {
          return this.taskSearchKeyword
        },
        set (val) {
          this.$store.dispatch('task/updateTaskSearchKeyword', val)
        }
      },
      categoryFilter: {
        get () {
          return this.$store.state.task.categoryFilter
        },
        set (val) {
          this.$store.dispatch('task/updateCategoryFilter', val)
        }
      },
      currentDateText () {
        if (this.storeFilterDate) {
          return this.storeFilterDate
        }
        return this.$t('task.all-tasks')
      },
      displayDateText () {
        // 优先显示悬停的日期
        if (this.datePickerVisible && this.hoverDate) {
          return this.hoverDate
        }
        return this.currentDateText
      },
      taskActionsDateFilter () {
        return {
          storeFilterDate: this.storeFilterDate,
          displayDateText: this.displayDateText,
          active: this.datePickerVisible || this.showDateText,
          showText: this.showDateText || this.datePickerVisible,
          dateFilterFrosted: this.dateFilterFrosted
        }
      },
      blockCategoryHoverOpen () {
        return !!(this.taskDetailVisible || this.addTaskVisible || this.taskPlanVisible)
      },
      taskCounts () {
        return this.$store.getters['task/filteredTaskCounts']
      }
    },
    watch: {
      status: 'onStatusChange',
      blockCategoryHoverOpen (val) {
        if (val) {
          this.forceCloseCategorySelect()
        }
      },
      storeFilterDate: {
        immediate: true,
        handler (val) {
          this.selectedDate = val || ''
        }
      }
    },
    methods: {
      formatCount (count) {
        const n = Number(count) || 0
        if (n > 999) {
          return '999+'
        }
        return String(n)
      },
      onTaskPageContextMenu (event) {
        const target = event && event.target
        if (!target || typeof target.closest !== 'function') {
          return
        }
        if (
          target.closest('.task-item') ||
          target.closest('.task-item-actions') ||
          target.closest('.task-item-actions-wrapper')
        ) {
          return
        }
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault()
        }

        const menu = Menu.buildFromTemplate([
          {
            label: this.$t('task.new-task'),
            click: () => commands.execute('application:new-task', { type: ADD_TASK_TYPE.URI })
          },
          {
            label: this.$t('task.new-bt-task'),
            click: () => commands.execute('application:new-bt-task')
          },
          { type: 'separator' },
          {
            label: this.$t('task.refresh-list'),
            click: () => this.$store.dispatch('task/fetchList')
          },
          { type: 'separator' },
          {
            label: this.$t('task.pause-all-task'),
            click: () => commands.execute('application:pause-all-task')
          },
          {
            label: this.$t('task.resume-all-task'),
            click: () => commands.execute('application:resume-all-task')
          },
          { type: 'separator' },
          {
            label: this.$t('task.select-all-task'),
            click: () => commands.execute('application:select-all-task')
          }
        ])

        menu.popup({
          window: getCurrentWindow(),
          x: event.x != null ? event.x : event.clientX,
          y: event.y != null ? event.y : event.clientY
        })
      },
      onCategoryMouseLeave () {
        this.scheduleCloseCategorySelect()
      },
      forceCloseCategorySelect () {
        this.clearCategoryHoverCloseTimer()
        const select = this.$refs.categorySelect
        if (select && select.visible) {
          select.visible = false
        }
        this.unbindCategoryPopperEvents()
        this.blurCategorySelect()
      },
      openCategorySelect () {
        if (this.blockCategoryHoverOpen) {
          this.forceCloseCategorySelect()
          return
        }
        const select = this.$refs.categorySelect
        if (!select || select.visible) {
          return
        }

        this.clearCategoryHoverCloseTimer()

        // 清除文本选择
        this.clearTextSelection()

        // 确保使用 visible 状态来切换，而不是简单的 toggleMenu
        if (!select.visible) {
          select.visible = true
        }

        this.$nextTick(() => {
          this.bindCategoryPopperEvents()
          // 清除可能产生的文本选择
          setTimeout(() => {
            this.clearTextSelection()
          }, 50)
        })
      },
      clearCategoryHoverCloseTimer () {
        if (!this.categoryHoverCloseTimer) {
          return
        }

        clearTimeout(this.categoryHoverCloseTimer)
        this.categoryHoverCloseTimer = null
      },
      scheduleCloseCategorySelect () {
        this.clearCategoryHoverCloseTimer()
        this.categoryHoverCloseTimer = setTimeout(() => {
          const select = this.$refs.categorySelect
          if (!select || !select.visible) {
            return
          }

          if (this.isHoveringCategoryPopper) {
            return
          }

          if (select.visible) {
            select.visible = false
          }
          this.blurCategorySelect()
        }, 120)
      },
      blurCategorySelect () {
        const select = this.$refs.categorySelect
        if (!select) {
          return
        }

        // 清除文本选择
        this.clearTextSelection()

        if (select.blur) {
          select.blur()
          return
        }

        const input = select.$el && select.$el.querySelector('input')
        if (input && input.blur) {
          input.blur()
        }

        // 再次清除文本选择，确保blur后也没有选中状态
        setTimeout(() => {
          this.clearTextSelection()
        }, 10)
      },
      onCategoryVisibleChange (visible) {
        if (visible && this.blockCategoryHoverOpen) {
          this.forceCloseCategorySelect()
          return
        }
        if (visible) {
          this.$nextTick(() => {
            this.bindCategoryPopperEvents()
            // 清除可能产生的文本选择
            setTimeout(() => {
              this.clearTextSelection()
            }, 50)
          })
          return
        }

        this.unbindCategoryPopperEvents()
        this.blurCategorySelect()
      },
      bindCategoryPopperEvents () {
        if (this.isCategoryPopperEventsBound) {
          return
        }

        const select = this.$refs.categorySelect
        const popper = select && select.popperElm
        if (!popper) {
          return
        }

        this.categoryPopperMouseEnterHandler = () => {
          this.isHoveringCategoryPopper = true
          this.clearCategoryHoverCloseTimer()
        }
        this.categoryPopperMouseLeaveHandler = () => {
          this.isHoveringCategoryPopper = false
          this.scheduleCloseCategorySelect()
        }

        popper.addEventListener('mouseenter', this.categoryPopperMouseEnterHandler)
        popper.addEventListener('mouseleave', this.categoryPopperMouseLeaveHandler)
        this.isCategoryPopperEventsBound = true
      },
      unbindCategoryPopperEvents () {
        const select = this.$refs.categorySelect
        const popper = select && select.popperElm
        if (!popper) {
          return
        }

        if (this.categoryPopperMouseEnterHandler) {
          popper.removeEventListener('mouseenter', this.categoryPopperMouseEnterHandler)
        }
        if (this.categoryPopperMouseLeaveHandler) {
          popper.removeEventListener('mouseleave', this.categoryPopperMouseLeaveHandler)
        }

        this.isCategoryPopperEventsBound = false
        this.categoryPopperMouseEnterHandler = null
        this.categoryPopperMouseLeaveHandler = null
        this.isHoveringCategoryPopper = false
      },
      onCategoryChange () {
        // 清除文本选择
        this.clearTextSelection()

        this.$store.dispatch('task/selectTasks', [])
        this.$store.dispatch('task/updateCategoryFilter', this.categoryFilter)
        this.$store.dispatch('task/fetchList')
        this.$nextTick(() => {
          this.blurCategorySelect()
        })
      },
      navStatus (status) {
        this.$router.push({
          path: `/task/${status}`
        }).catch(err => {
          console.log(err)
        })
      },
      showDatePicker () {
        this.datePickerVisible = true
        commands.emit('popup:open', 'date-picker')
      },
      onOtherPopupOpen (source) {
        if (source !== 'date-picker' && this.datePickerVisible) {
          this.datePickerVisible = false
          this.hoverDate = null
        }
      },
      toggleDatePicker (rect) {
        this.clearTextSelection()

        if (this.datePickerVisible) {
          this.datePickerVisible = false
          commands.emit('popup:closed')
          return
        }
        // 先通知其它弹窗关闭，再用双 rAF 延迟开启自身 enter：第一帧让其它弹窗的 leave
        // 过渡启动，第二帧才开启 enter，避免与 leave 同帧渲染导致 enter 起始状态
        // （scale(0.92)/opacity:0）未绘制即切到终态、入场动画丢失。
        commands.emit('popup:open', 'date-picker')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.datePickerVisible = true
            this.loadTaskDateCounts()
            // 获取按钮位置 - 优先使用传入的 rect
            if (rect) {
              this.dateFilterBtnRect = rect
            } else if (this.$refs.dateFilterBtn) {
              this.dateFilterBtnRect = this.$refs.dateFilterBtn.getBoundingClientRect()
            }
          })
        })
      },
      closeDatePicker () {
        this.datePickerVisible = false
        this.hoverDate = null
        commands.emit('popup:closed')
      },
      onDateHover (date) {
        this.hoverDate = date
      },
      onDateClear () {
        this.selectedDate = ''
        this.$store.dispatch('task/updateFilterDate', null)
        this.$store.dispatch('task/fetchList')
        this.datePickerVisible = false
        this.hoverDate = null
        commands.emit('popup:closed')
      },
      onDateFilterClick ({ event, rect }) {
        if (event) {
          event.stopPropagation()
          event.preventDefault()
        }

        this.clearTextSelection()

        // 如果当前已经有日期筛选，点击则清除日期筛选
        if (this.storeFilterDate && !this.datePickerVisible) {
          this.selectedDate = ''
          this.$store.dispatch('task/updateFilterDate', null)
          this.$store.dispatch('task/fetchList')
          return
        }
        // 否则打开日期选择器
        this.toggleDatePicker(rect)
      },
      async loadTaskDateCounts () {
        const counts = {}
        const normalizeTimestamp = (value) => {
          const raw = parseInt(value)
          if (!Number.isFinite(raw) || raw <= 0) return 0
          if (raw < 1000000000000) return raw * 1000
          return raw
        }
        let data = []
        try {
          data = await api.fetchTaskList({ type: this.currentList })
        } catch (e) {
          data = []
        }
        data.forEach(task => {
          const status = `${task && task.status ? task.status : ''}`
          const isInProgress = [TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED].includes(status)
          const timestamp = isInProgress
            ? (normalizeTimestamp(task.startTime) ||
              normalizeTimestamp(task.startedAt) ||
              normalizeTimestamp(task.createdAt) ||
              normalizeTimestamp(task.creationTime))
            : (normalizeTimestamp(task.savedAt) ||
              normalizeTimestamp(task.completedTime) ||
              normalizeTimestamp(task.stopTime) ||
              normalizeTimestamp(task.createdAt) ||
              normalizeTimestamp(task.creationTime))
          if (timestamp <= 0) {
            return
          }
          const date = new Date(timestamp)
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          counts[dateStr] = (counts[dateStr] || 0) + 1
        })
        this.taskDateCounts = counts
      },
      clearTextSelection () {
        // 清除任何文本选择的多种方法
        if (window.getSelection) {
          const selection = window.getSelection()
          if (selection.rangeCount > 0) {
            selection.removeAllRanges()
          }
        }
        if (document.selection && document.selection.empty) {
          document.selection.empty()
        }
      },
      onDateFilterHover () {
        this.clearTextSelection()
        this.showDateText = true
      },
      onDateFilterLeave () {
        this.clearTextSelection()
        this.showDateText = false
      },
      onDateChange (date) {
        if (date) {
          this.selectedDate = date
          this.$store.dispatch('task/updateFilterDate', date)
          this.$store.dispatch('task/fetchList')
        }
        this.datePickerVisible = false
        commands.emit('popup:closed')
      },
      onStatusChange () {
        this.changeCurrentList()
      },
      changeCurrentList () {
        if (this.status === 'date' && this.filterDate) {
          this.$store.dispatch('task/changeCurrentListWithDate', {
            currentList: this.status,
            filterDate: this.filterDate
          })
        } else {
          this.$store.dispatch('task/changeCurrentList', this.status)
        }
      },
      directAddTask (uri, options = {}) {
        const uris = [uri]
        const payload = {
          uris,
          options: {
            ...options
          }
        }
        this.$store.dispatch('task/addUri', payload)
          .catch((err) => {
            this.$msg.error(err.message)
          })
      },
      showAddTaskDialog (uri, options = {}) {
        const {
          header,
          ...rest
        } = options
        console.log('[LinkCore] show add task dialog options: ', options)

        const headers = parseHeader(header)
        const newOptions = {
          ...rest,
          ...headers
        }

        this.$store.dispatch('app/updateAddTaskUrl', uri)
        this.$store.dispatch('app/updateAddTaskOptions', newOptions)
        this.$store.dispatch('app/showAddTaskDialog', ADD_TASK_TYPE.URI)
      },
      async deleteTaskFiles (task) {
        const config = this.$store.state.preference.config || {}
        const downloadingFileSuffix = config.downloadingFileSuffix || ''
        try {
          await moveTaskFilesToTrash(task, downloadingFileSuffix, config)
        } catch (err) {
          console.warn('[LinkCore] deleteTaskFiles error:', err)
          const taskName = (task && task.name) ? task.name : (task && task.gid ? task.gid : '')
          this.$msg.error(`删除文件失败: ${taskName}`)
        }
      },
      async removeTask (task, taskName, isRemoveWithFiles = false) {
        // MERGING 状态的任务可能已不在 aria2 中，跳过 aria2 操作，直接清理本地状态
        const isMerging = task && task.status === TASK_STATUS.MERGING
        if (isMerging) {
          // 清理合并重试定时器
          this._clearMergeRetryTimer(task.gid)
          // 从合并列表中移除
          await this.$store.dispatch('task/removeFromMergingList', task.gid)
          // 尝试从 aria2 删除（可能失败，忽略错误）
          try { await this.$store.dispatch('task/removeTask', task) } catch (e) {}
          // 删除文件
          if (isRemoveWithFiles) {
            await this.deleteTaskFiles(task)
          }
          await this.$store.dispatch('task/fetchList')
          this.$msg.success(this.$t('task.delete-task-success', { taskName }))
          return
        }
        // 在从aria2移除任务前，获取最新的任务状态以确保文件路径准确
        let taskForDeletion = task
        if (isRemoveWithFiles) {
          try {
            const fresh = await api.fetchTaskItem({ gid: task.gid })
            if (fresh && fresh.gid) {
              taskForDeletion = { ...task, ...fresh }
            }
          } catch (e) {
            console.warn('[LinkCore] Failed to fetch fresh task for deletion:', e.message)
          }
          // 预获取引擎选项（dir + out），避免任务被 aria2 删除后 getOption 失败导致文件路径无法解析
          try {
            const opt = await api.getOption({ gid: task.gid })
            if (opt) {
              taskForDeletion = { ...taskForDeletion, _engineOptions: opt }
            }
          } catch (e) {
            console.warn('[LinkCore] Failed to pre-fetch getOption for deletion:', e.message)
          }
        }

        await this.$store.dispatch('task/forcePauseTask', task)
          .finally(async () => {
            // 先从aria2中删除任务，确保任务不会再被保存
            await this.removeTaskItem(task, taskName)

            // 然后再删除文件（包括.aria2控制文件）
            if (isRemoveWithFiles) {
              // 等待一小段时间确保aria2已经完全移除任务
              await new Promise(resolve => setTimeout(resolve, 500))
              await this.deleteTaskFiles(taskForDeletion)
            }
          })
      },
      async removeTaskRecord (task, taskName, isRemoveWithFiles = false) {
        // MERGING 状态的任务可能已不在 aria2 中，跳过 aria2 操作，直接清理本地状态
        const isMerging = task && task.status === TASK_STATUS.MERGING
        if (isMerging) {
          this._clearMergeRetryTimer(task.gid)
          await this.$store.dispatch('task/removeFromMergingList', task.gid)
          try { await this.$store.dispatch('task/removeTaskRecord', task) } catch (e) {}
          if (isRemoveWithFiles) {
            await this.deleteTaskFiles(task)
          }
          await this.$store.dispatch('task/fetchList')
          this.$msg.success(this.$t('task.remove-record-success', { taskName }))
          return
        }
        // 在从aria2移除任务前，获取最新的任务状态以确保文件路径准确
        let taskForDeletion = task
        if (isRemoveWithFiles) {
          try {
            const fresh = await api.fetchTaskItem({ gid: task.gid })
            if (fresh && fresh.gid) {
              taskForDeletion = { ...task, ...fresh }
            }
          } catch (e) {
            console.warn('[LinkCore] Failed to fetch fresh task for deletion:', e.message)
          }
          // 预获取引擎选项（dir + out），避免任务被 aria2 删除后 getOption 失败导致文件路径无法解析
          try {
            const opt = await api.getOption({ gid: task.gid })
            if (opt) {
              taskForDeletion = { ...taskForDeletion, _engineOptions: opt }
            }
          } catch (e) {
            console.warn('[LinkCore] Failed to pre-fetch getOption for deletion:', e.message)
          }
        }

        await this.$store.dispatch('task/forcePauseTask', task)
          .finally(async () => {
            // 先从aria2中删除任务记录
            await this.removeTaskRecordItem(task, taskName)

            // 然后再删除文件（包括.aria2控制文件）
            if (isRemoveWithFiles) {
              // 等待一小段时间确保aria2已经完全移除任务
              await new Promise(resolve => setTimeout(resolve, 500))
              await this.deleteTaskFiles(taskForDeletion)
            }
          })
      },
      _clearMergeRetryTimer (gid) {
        try {
          const engineClient = this.$children.find(c => c._mergeRetryTimers)
          if (engineClient && engineClient._mergeRetryTimers) {
            const timer = engineClient._mergeRetryTimers.get(gid)
            if (timer) {
              clearTimeout(timer)
              engineClient._mergeRetryTimers.delete(gid)
            }
          }
        } catch (e) {}
      },
      async removeTaskItem (task, taskName) {
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
      async removeTaskRecordItem (task, taskName) {
        try {
          await this.$store.dispatch('task/removeTaskRecord', task)
          this.$msg.success(this.$t('task.remove-record-success', {
            taskName
          }))
        } catch ({ code }) {
          if (code === 1) {
            this.$msg.error(this.$t('task.remove-record-fail', {
              taskName
            }))
          }
        }
      },
      async removeTasks (taskList, isRemoveWithFiles = false) {
        // 分离 MERGING 状态的任务和普通任务
        const mergingTasks = taskList.filter(t => t && t.status === TASK_STATUS.MERGING)
        const normalTasks = taskList.filter(t => t && t.status !== TASK_STATUS.MERGING)

        // 处理 MERGING 状态的任务
        if (mergingTasks.length > 0) {
          for (const task of mergingTasks) {
            this._clearMergeRetryTimer(task.gid)
            await this.$store.dispatch('task/removeFromMergingList', task.gid)
            try { await this.$store.dispatch('task/removeTask', task) } catch (e) {}
            if (isRemoveWithFiles) {
              await this.deleteTaskFiles(task)
            }
          }
        }

        // 处理普通任务
        taskList = normalTasks
        if (taskList.length === 0) {
          await this.$store.dispatch('task/fetchList')
          return
        }

        // 预获取引擎选项（dir + out），避免任务被 aria2 删除后 getOption 失败导致文件路径无法解析
        let taskListForDeletion = taskList
        if (isRemoveWithFiles) {
          taskListForDeletion = await Promise.all(taskList.map(async (task) => {
            let enrichedTask = task
            try {
              const fresh = await api.fetchTaskItem({ gid: task.gid })
              if (fresh && fresh.gid) {
                enrichedTask = { ...task, ...fresh }
              }
            } catch (e) {
              console.warn('[LinkCore] batch: failed to fetch fresh task for deletion:', e.message)
            }
            try {
              const opt = await api.getOption({ gid: task.gid })
              if (opt) {
                enrichedTask = { ...enrichedTask, _engineOptions: opt }
              }
            } catch (e) {
              console.warn('[LinkCore] batch: failed to pre-fetch getOption for deletion:', e.message)
            }
            return enrichedTask
          }))
        }

        const gids = taskList.map((task) => task.gid)
        this.$store.dispatch('task/batchForcePauseTask', gids)
          .finally(async () => {
            // 先从aria2中删除任务
            await this.removeTaskItems(gids)

            // 然后再删除文件（包括.aria2控制文件）
            if (isRemoveWithFiles) {
              // 等待一小段时间确保aria2已经完全移除任务
              await new Promise(resolve => setTimeout(resolve, 500))
              this.batchDeleteTaskFiles(taskListForDeletion)
            }
          })
      },
      batchDeleteTaskFiles (taskList) {
        // 获取下载中文件后缀配置
        const config = this.$store.state.preference.config || {}
        const downloadingFileSuffix = config.downloadingFileSuffix || ''
        const promises = taskList.map((task, index) => {
          return delayDeleteTaskFiles(task, index * 200, downloadingFileSuffix, config)
        })
        Promise.allSettled(promises).then(results => {
          const failures = results.filter(r => r.status === 'rejected')
          if (failures.length > 0) {
            console.warn('[LinkCore] batch delete task files - failures:', failures)
            this.$msg.error(`部分文件删除失败（${failures.length}个）`)
          }
          console.log('[LinkCore] batch delete task files: ', results)
        })
      },
      async removeTaskItems (gids) {
        try {
          await this.$store.dispatch('task/batchRemoveTask', gids)
          this.$msg.success(this.$t('task.batch-delete-task-success'))
        } catch ({ code }) {
          if (code === 1) {
            this.$msg.error(this.$t('task.batch-delete-task-fail'))
          }
        }
      },
      handlePauseTask (payload) {
        const { task, taskName } = payload
        this.$msg.info(this.$t('task.download-pause-message', { taskName }))
        this.$store.dispatch('task/pauseTask', task)
          .catch(({ code }) => {
            if (code === 1) {
              this.$msg.error(this.$t('task.pause-task-fail', { taskName }))
            }
          })
      },
      handleResumeTask (payload) {
        const { task, taskName } = payload
        this.$store.dispatch('task/resumeTask', task)
          .catch(({ code }) => {
            if (code === 1) {
              this.$msg.error(this.$t('task.resume-task-fail', {
                taskName
              }))
            }
          })
      },
      handleStopTaskSeeding (payload) {
        const { task } = payload
        this.$store.dispatch('task/stopSeeding', task)
        this.$msg.info({
          message: this.$t('task.bt-stopping-seeding-tip'),
          duration: 8000
        })
      },
      handleRestartTask (payload) {
        const { task, taskName, showDialog } = payload
        const { gid } = task
        const uri = getTaskUri(task)

        this.$store.dispatch('task/getTaskOption', gid)
          .then((data) => {
            console.log('[LinkCore] get task option:', data)
            const { dir, header, split } = data
            const options = {
              dir,
              header,
              split,
              out: taskName
            }

            if (showDialog) {
              this.showAddTaskDialog(uri, options)
            } else {
              this.directAddTask(uri, options)
              this.$store.dispatch('task/removeTaskRecord', task)
            }
          })
      },
      handleRevealInFolder (payload) {
        const { path } = payload
        showItemInFolder(path, {
          errorMsg: this.$t('task.file-not-exist')
        })
      },
      handleDeleteTask (payload) {
        const { task, taskName, deleteWithFiles } = payload
        const { noConfirmBeforeDelete } = this

        if (noConfirmBeforeDelete) {
          this.removeTask(task, taskName, deleteWithFiles)
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
        }).then(({ response, checkboxChecked }) => {
          if (response === 0) {
            this.removeTask(task, taskName, checkboxChecked)
          }
        })
      },
      handleDeleteTaskRecord (payload) {
        const { task, taskName, deleteWithFiles } = payload
        const { noConfirmBeforeDelete } = this

        if (noConfirmBeforeDelete) {
          this.removeTaskRecord(task, taskName, deleteWithFiles)
          return
        }

        dialog.showMessageBox({
          type: 'warning',
          title: this.$t('task.remove-record'),
          message: this.$t('task.remove-record-confirm', { taskName }),
          buttons: [this.$t('app.yes'), this.$t('app.no')],
          cancelId: 1,
          checkboxLabel: this.$t('task.remove-record-label'),
          checkboxChecked: !!deleteWithFiles
        }).then(({ response, checkboxChecked }) => {
          if (response === 0) {
            this.removeTaskRecord(task, taskName, checkboxChecked)
          }
        })
      },
      handleBatchDeleteTask (payload) {
        const { deleteWithFiles } = payload
        const {
          noConfirmBeforeDelete,
          selectedGidList,
          selectedGidListCount,
          taskList
        } = this
        if (selectedGidListCount === 0) {
          return
        }

        const selectedTaskList = taskList.filter((task) => {
          return selectedGidList.includes(task.gid)
        })

        if (noConfirmBeforeDelete) {
          this.removeTasks(selectedTaskList, deleteWithFiles)
          return
        }

        const count = `${selectedGidListCount}`
        dialog.showMessageBox({
          type: 'warning',
          title: this.$t('task.delete-selected-task'),
          message: this.$t('task.batch-delete-task-confirm', { count }),
          buttons: [this.$t('app.yes'), this.$t('app.no')],
          cancelId: 1,
          checkboxLabel: this.$t('task.delete-task-label'),
          checkboxChecked: deleteWithFiles
        }).then(({ response, checkboxChecked }) => {
          if (response === 0) {
            this.removeTasks(selectedTaskList, checkboxChecked)
          }
        })
      },
      handleCopyTaskLink (payload) {
        const { task } = payload
        const uri = getTaskUri(task)
        try {
          const { clipboard } = require('electron')
          clipboard.writeText(uri)
          this.$msg.success(this.$t('task.copy-link-success'))
        } catch (e) {
          this.$msg.error(this.$t('preferences.save-fail-message'))
        }
      },
      updateSubnavProximityHover (event) {
        if (!this.autoHideAside) {
          if (this.isSubnavProximityHovered) {
            this.isSubnavProximityHovered = false
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
        // 三栏模式：检测整个左侧边缘区域
        const withinX = event.clientX <= 120
        if (withinX !== this.isSubnavProximityHovered) {
          this.isSubnavProximityHovered = withinX
        }
      },
      handleWindowMouseMoveForSubnav (event) {
        this._subnavMouseEvent = event
        if (this._subnavMouseRaf) {
          return
        }
        this._subnavMouseRaf = window.requestAnimationFrame(() => {
          this._subnavMouseRaf = null
          const lastEvent = this._subnavMouseEvent
          this._subnavMouseEvent = null
          this.updateSubnavProximityHover(lastEvent)
        })
      },
      handleShowTaskInfo (payload) {
        const { task } = payload
        this.$store.dispatch('task/showTaskDetail', task)
      },
      openPreference () {
        this.$electron.ipcRenderer.send('open-preference-window')
      },
      onSearchFocus () {
        this.isSearchFocused = true
      },
      onSearchBlur () {
        if (!this.taskSearchQuery) {
          this.isSearchFocused = false
        }
      },
      handleDocumentClick (event) {
        const searchBox = this.$el.querySelector('.task-search-box')
        if (searchBox && !searchBox.contains(event.target)) {
          const input = this.$refs.taskSearchInput
          if (input) {
            input.blur()
          }
        }
      }
    },
    created () {
      this.changeCurrentList()
    },
    mounted () {
      if (typeof window !== 'undefined') {
        this._handleWindowMouseMoveForSubnav = (event) => {
          this.handleWindowMouseMoveForSubnav(event)
        }
        window.addEventListener('mousemove', this._handleWindowMouseMoveForSubnav)
      }
      commands.on('pause-task', this.handlePauseTask)
      commands.on('resume-task', this.handleResumeTask)
      commands.on('stop-task-seeding', this.handleStopTaskSeeding)
      commands.on('restart-task', this.handleRestartTask)
      commands.on('reveal-in-folder', this.handleRevealInFolder)
      commands.on('delete-task', this.handleDeleteTask)
      commands.on('delete-task-record', this.handleDeleteTaskRecord)
      commands.on('batch-delete-task', this.handleBatchDeleteTask)
      commands.on('copy-task-link', this.handleCopyTaskLink)
      commands.on('show-task-info', this.handleShowTaskInfo)
      commands.on('popup:open', this.onOtherPopupOpen)
      document.addEventListener('click', this.handleDocumentClick)
    },
    beforeDestroy () {
      if (typeof window !== 'undefined') {
        if (this._handleWindowMouseMoveForSubnav) {
          window.removeEventListener('mousemove', this._handleWindowMouseMoveForSubnav)
          this._handleWindowMouseMoveForSubnav = null
        }
      }
      if (this._subnavMouseRaf) {
        window.cancelAnimationFrame(this._subnavMouseRaf)
        this._subnavMouseRaf = null
      }
      document.removeEventListener('click', this.handleDocumentClick)
    },
    destroyed () {
      this.clearCategoryHoverCloseTimer()
      this.unbindCategoryPopperEvents()
      commands.off('pause-task', this.handlePauseTask)
      commands.off('resume-task', this.handleResumeTask)
      commands.off('stop-task-seeding', this.handleStopTaskSeeding)
      commands.off('restart-task', this.handleRestartTask)
      commands.off('reveal-in-folder', this.handleRevealInFolder)
      commands.off('delete-task', this.handleDeleteTask)
      commands.off('delete-task-record', this.handleDeleteTaskRecord)
      commands.off('batch-delete-task', this.handleBatchDeleteTask)
      commands.off('copy-task-link', this.handleCopyTaskLink)
      commands.off('show-task-info', this.handleShowTaskInfo)
      commands.removeListener('popup:open', this.onOtherPopupOpen)
    }
  }
</script>

<style lang="scss">
.main.panel {
  height: 100vh;
  overflow: hidden;
}

.content.panel {
  height: calc(100% - 38px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--lc-bg-panel);
  border-top-left-radius: 10px;
  margin: 38px 0 0 0;
}

.content.panel .panel-header {
  flex-shrink: 0;
}

.content.panel .panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.panel-header {
  position: relative;
  z-index: 100;
  transition: all 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
}

/* 任务页面 panel-header：移除外层边框，改为内部独立容器 */
.content.panel .panel-header.task-panel-header {
  border: none !important;
  padding: 0 !important;
  margin: 6px 0 0;
  height: 44px !important;
}

/* 宽屏下与 task-list 的 14px 左右 padding 对齐（见 Default.scss 媒体查询） */
@media only screen and (min-width: 568px) {
  .content.panel .panel-header.task-panel-header .task-actions {
    padding-left: 14px;
    padding-right: 14px;
  }
}

/* dark theme: task-category-select 边框色由 CSS 变量自动适配 */

.task-category-select {
  position: absolute;
  top: 6px;
  left: 123px;
  display: flex;
  justify-content: flex-start;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  transition: all 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
}

.task-category-select .el-select {
  width: 160px;
  pointer-events: auto;
  opacity: 1;
  transition: opacity 0.2s ease;
}

.task-category-select .el-select .el-input__inner {
  user-select: none !important;
  -webkit-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  background-color: transparent !important;
  border: 1px solid $--task-item-border-color !important;
  border-radius: 8px !important;
  height: 28px !important;
  line-height: 28px !important;
}

/* dark theme: task-category-select 边框色由 CSS 变量自动适配 */

.task-category-select .el-select .el-input__icon {
  line-height: 28px !important;
}

.task-search-box {
  flex: 1;
  min-width: 0;
  height: 28px;
  display: flex;
  align-items: center;
  border: 1px solid $--task-item-border-color;
  border-radius: 8px;
  background-color: transparent;
  box-sizing: border-box;
  padding: 0 8px;
  pointer-events: auto;
  transition: border-color 0.2s ease;

  &:focus-within,
  &.is-focused {
    border-color: $--color-primary;
  }

  .el-icon-search {
    flex-shrink: 0;
    font-size: 14px;
    color: $--task-action-color;
    margin-right: 6px;
  }

  .task-search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    color: var(--lc-text-regular, #333);
    height: 100%;
    min-width: 0;

    &::placeholder {
      color: var(--lc-text-secondary, #999);
      opacity: 0.6;
    }
  }
}

.theme-dark .task-search-box {
  .el-icon-search {
    color: var(--lc-text-secondary, #999);
  }
  .task-search-input {
    color: var(--lc-text-regular, #ddd);
  }
}

.task-category-select .el-select:hover,
.task-category-select .el-select:focus-within {
  opacity: 1;
}

/* 背景图模式下：分类选择框边框加亮 */
.theme-light.has-app-background-image .task-category-select .el-select .el-input__inner,
.theme-dark.has-app-background-image .task-category-select .el-select .el-input__inner {
  border-color: var(--lc-task-item-hover-border) !important;
}

.theme-light.has-app-background-image {
  .task-category-select .el-select .el-input__inner {
    background-color: rgba(255, 255, 255, var(--app-ui-opacity-task-category-select, var(--app-ui-opacity, 0.9))) !important;
    backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
  }
  .task-category-select-dropdown {
    background-color: rgba(255, 255, 255, var(--app-ui-opacity-task-category-select, var(--app-ui-opacity, 0.9)));
    backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
  }
}

.theme-dark.has-app-background-image {
  .task-category-select .el-select .el-input__inner {
    background-color: rgba(45, 45, 45, var(--app-ui-opacity-task-category-select, var(--app-ui-opacity, 0.9))) !important;
    backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    border-color: rgba(255, 255, 255, 0.1) !important;
    color: #eee !important;
  }
  .task-category-select-dropdown {
    background-color: rgba(45, 45, 45, var(--app-ui-opacity-task-category-select, var(--app-ui-opacity, 0.9)));
    backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-task-category-select, var(--app-ui-frosted-blur, 0px)));
    border-color: rgba(255, 255, 255, 0.12);
  }
  .task-category-select-dropdown .el-select-dropdown__item {
    color: #eee;
  }
  .task-category-select-dropdown .el-select-dropdown__item.hover,
  .task-category-select-dropdown .el-select-dropdown__item:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
}

.dialog-footer {
  text-align: right;
}

.dialog-footer .el-button {
  margin-left: 10px;
}
</style>
