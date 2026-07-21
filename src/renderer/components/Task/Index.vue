<template>
  <el-container
    class="main panel"
    direction="horizontal"
  >
    <!-- 左侧悬浮任务状态导航 - 仅悬浮模式使用 -->
    <div
      v-if="showLeftFloatingNav"
      class="subnav-small-screen subnav-left"
      :class="{ 'is-auto-hide-aside': autoHideAside, 'is-proximity-hovered': isSubnavProximityHovered }"
      @mouseenter="onSubnavEnter"
      @mouseleave="onSubnavLeave"
    >
      <ul class="menu small-menu">
        <li
          @click="navStatus('all')"
          :class="{ active: status === 'all' || status === 'date' }"
        >
          <el-tooltip
            effect="dark"
            :content="$t('task.all')"
            placement="right"
            :open-delay="500"
          >
            <mo-icon name="menu-task" width="20" height="20" />
          </el-tooltip>
          <span v-if="taskCounts.all > 0" class="subnav-badge">{{ formatCount(taskCounts.all) }}</span>
        </li>
        <li
          @click="navStatus('active')"
          :class="{ active: status === 'active' }"
        >
          <el-tooltip
            effect="dark"
            :content="$t('task.active')"
            placement="right"
            :open-delay="500"
          >
            <mo-icon name="task-start" width="20" height="20" />
          </el-tooltip>
          <span v-if="taskCounts.active > 0" class="subnav-badge">{{ formatCount(taskCounts.active) }}</span>
        </li>
        <li
          @click="navStatus('waiting')"
          :class="{ active: status === 'waiting' }"
        >
          <el-tooltip
            effect="dark"
            :content="$t('task.waiting')"
            placement="right"
            :open-delay="500"
          >
            <mo-icon name="task-pause" width="20" height="20" />
          </el-tooltip>
          <span v-if="taskCounts.waiting > 0" class="subnav-badge">{{ formatCount(taskCounts.waiting) }}</span>
        </li>
        <li
          @click="navStatus('stopped')"
          :class="{ active: status === 'stopped' }"
        >
          <el-tooltip
            effect="dark"
            :content="$t('task.stopped')"
            placement="right"
            :open-delay="500"
          >
            <mo-icon name="task-stop" width="20" height="20" />
          </el-tooltip>
          <span v-if="taskCounts.stopped > 0" class="subnav-badge">{{ formatCount(taskCounts.stopped) }}</span>
        </li>
      </ul>
      <!-- 分隔线 -->
      <div class="subnav-divider-left"></div>
      <!-- 设置按钮 -->
      <ul class="menu small-menu">
        <li
          @click="openPreference"
          :class="{ active: false }"
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

    <template v-if="isThreeColumn">
      <el-aside
        v-if="showThreeColumnSubnav"
        width="220px"
        class="subnav three-column-subnav"
        :class="{ 'is-auto-hide-aside': autoHideAside, 'is-proximity-hovered': isSubnavProximityHovered }"
        @mouseenter.native="onSubnavEnter"
        @mouseleave.native="onSubnavLeave"
      >
        <mo-task-subnav :current="status" />
      </el-aside>
    </template>

    <el-container
      class="content panel"
      direction="vertical"
    >
      <el-header
        class="panel-header"
        height="84"
      >
        <h4
          class="task-title hidden-xs-only"
        >
          {{ title }}
        </h4>
        <h4
          class="task-title hidden-sm-and-up"
        >
          {{ title }}
        </h4>
        <div
          class="task-category-select"
        >
          <el-select
            ref="categorySelect"
            v-model="categoryFilter"
            :disabled="blockCategoryHoverOpen"
            size="mini"
            :placeholder="$t('task.category-all')"
            popper-class="task-category-select-dropdown"
            @change="onCategoryChange"
            @visible-change="onCategoryVisibleChange"
            @mouseenter.native="openCategorySelect"
            @mouseleave.native="onCategoryMouseLeave"
            @focus.native="clearTextSelection"
            @click.native="clearTextSelection"
          >
            <el-option :label="$t('task.category-all')" value="" />
            <el-option :label="$t('task.category-archives')" value="archives" />
            <el-option :label="$t('task.category-programs')" value="programs" />
            <el-option :label="$t('task.category-videos')" value="videos" />
            <el-option :label="$t('task.category-music')" value="music" />
            <el-option :label="$t('task.category-images')" value="images" />
            <el-option :label="$t('task.category-documents')" value="documents" />
          </el-select>
        </div>
        <mo-task-actions
          :dateFilter="taskActionsDateFilter"
          @date-filter-click="onDateFilterClick"
          @date-filter-hover="onDateFilterHover"
          @date-filter-leave="onDateFilterLeave"
        />
      </el-header>
      <el-main class="panel-content" @contextmenu.native="onTaskPageContextMenu">
        <mo-task-list :category="categoryFilter" :keyword="taskSearchQuery" />
      </el-main>
    </el-container>

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
        isSubnavHovered: false,
        isSubnavProximityHovered: false,
        windowWidth: 0
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
        sidebarLayoutMode: state => (state.config && state.config.sidebarLayoutMode) || 'floating',
        prefTheme: state => state.config.theme,
        dateFilterFrosted: state => state.config.dateFilterFrosted,
        autoHideAside: state => state.config.autoHideAside,
        autoHideSubnav: state => state.config.autoHideSubnav,
        hideAppMenu: state => state.config.hideAppMenu
      }),
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
      showLeftFloatingNav () {
        return !this.isThreeColumn
      },
      showThreeColumnSubnav () {
        return this.isThreeColumn
      },
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
      },
      toggleDatePicker (rect) {
        this.clearTextSelection()

        this.datePickerVisible = !this.datePickerVisible
        if (this.datePickerVisible) {
          this.loadTaskDateCounts()
          // 获取按钮位置 - 优先使用传入的 rect
          if (rect) {
            this.dateFilterBtnRect = rect
          } else if (this.$refs.dateFilterBtn) {
            this.dateFilterBtnRect = this.$refs.dateFilterBtn.getBoundingClientRect()
          }
        }
      },
      closeDatePicker () {
        this.datePickerVisible = false
        this.hoverDate = null
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
      },
      handleFocusTaskSearch () {
        // Since the top search bar is removed, we delegate focus to the floating bar search if needed,
        // or just ignore if the intention was to focus the removed input.
        // For now, let's try to activate the floating bar search if available via command
        try {
          commands.emit('floating-bar:search-open', true)
          commands.emit('floating-bar:search-expanded', true)
        } catch (e) {}
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
        console.log('[Motrix] show add task dialog options: ', options)

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
          console.warn('[Motrix] deleteTaskFiles error:', err)
        }
      },
      async removeTask (task, taskName, isRemoveWithFiles = false) {
        await this.$store.dispatch('task/forcePauseTask', task)
          .finally(async () => {
            // 先从aria2中删除任务，确保任务不会再被保存
            await this.removeTaskItem(task, taskName)

            // 然后再删除文件（包括.aria2控制文件）
            if (isRemoveWithFiles) {
              // 等待一小段时间确保aria2已经完全移除任务
              await new Promise(resolve => setTimeout(resolve, 500))
              await this.deleteTaskFiles(task)
            }
          })
      },
      async removeTaskRecord (task, taskName, isRemoveWithFiles = false) {
        await this.$store.dispatch('task/forcePauseTask', task)
          .finally(async () => {
            // 先从aria2中删除任务记录
            await this.removeTaskRecordItem(task, taskName)

            // 然后再删除文件（包括.aria2控制文件）
            if (isRemoveWithFiles) {
              // 等待一小段时间确保aria2已经完全移除任务
              await new Promise(resolve => setTimeout(resolve, 500))
              await this.deleteTaskFiles(task)
            }
          })
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
      removeTasks (taskList, isRemoveWithFiles = false) {
        const gids = taskList.map((task) => task.gid)
        this.$store.dispatch('task/batchForcePauseTask', gids)
          .finally(async () => {
            // 先从aria2中删除任务
            await this.removeTaskItems(gids)

            // 然后再删除文件（包括.aria2控制文件）
            if (isRemoveWithFiles) {
              // 等待一小段时间确保aria2已经完全移除任务
              await new Promise(resolve => setTimeout(resolve, 500))
              this.batchDeleteTaskFiles(taskList)
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
          console.log('[Motrix] batch delete task files: ', results)
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
            console.log('[Motrix] get task option:', data)
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
      handleWindowResize () {
        if (typeof window === 'undefined') {
          return
        }
        this.windowWidth = window.innerWidth || 0
      },
      onSubnavEnter () {
        if (this.subnavHoverTimer) {
          clearTimeout(this.subnavHoverTimer)
          this.subnavHoverTimer = null
        }
        this.isSubnavHovered = true
        // 更新全局状态，用于标题栏文字位置调整
        if (this.isThreeColumn && this.autoHideAside) {
          this.$store.dispatch('app/updateAsideHovered', true)
        }
      },
      onSubnavLeave () {
        // 立即更新全局状态，让标题栏文字立即开始移动
        if (this.isThreeColumn && this.autoHideAside) {
          this.$store.dispatch('app/updateAsideHovered', false)
        }

        if (this.subnavHoverTimer) {
          clearTimeout(this.subnavHoverTimer)
        }
        this.subnavHoverTimer = setTimeout(() => {
          this.isSubnavHovered = false
        }, 400)
      },
      updateSubnavProximityHover (event) {
        // 三栏模式：检测左侧子侧边栏
        if (this.isThreeColumn) {
          if (!this.autoHideAside) {
            if (this.isSubnavProximityHovered) {
              this.isSubnavProximityHovered = false
              this.$store.dispatch('app/updateAsideHovered', false)
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
          const el = this.$el && this.$el.querySelector ? this.$el.querySelector('.three-column-subnav') : null
          const subnavHeight = el ? el.offsetHeight : 0
          const zoneHeight = Math.max(subnavHeight || 0, 200) + 100
          const centerY = height / 2
          const top = centerY - zoneHeight / 2
          const bottom = centerY + zoneHeight / 2
          const withinY = event.clientY >= top && event.clientY <= bottom
          const withinX = event.clientX <= 120
          const next = withinX && withinY
          if (next !== this.isSubnavProximityHovered) {
            this.isSubnavProximityHovered = next
            // 立即更新全局状态，用于标题栏文字位置调整
            // 只有在接近区域内或者正在悬停时才显示
            const shouldShow = next || this.isSubnavHovered
            this.$store.dispatch('app/updateAsideHovered', shouldShow)
          }
          return
        }
        // 悬浮模式：检测左侧小图标导航
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
        const el = this.$el && this.$el.querySelector ? this.$el.querySelector('.subnav-left') : null
        const subnavHeight = el ? el.offsetHeight : 0
        const zoneHeight = Math.max(subnavHeight || 0, 200) + 100
        const centerY = height / 2
        const top = centerY - zoneHeight / 2
        const bottom = centerY + zoneHeight / 2
        const withinY = event.clientY >= top && event.clientY <= bottom
        const withinX = event.clientX <= 120
        const next = withinX && withinY
        if (next !== this.isSubnavProximityHovered) {
          this.isSubnavProximityHovered = next
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
      handleWindowMouseLeave () {
        // 鼠标离开窗口时，重置所有悬停状态
        if (this.isThreeColumn && this.autoHideAside) {
          this.isSubnavProximityHovered = false
          this.$store.dispatch('app/updateAsideHovered', false)

          // 如果有悬停计时器，立即执行
          if (this.subnavHoverTimer) {
            clearTimeout(this.subnavHoverTimer)
            this.subnavHoverTimer = null
          }
          this.isSubnavHovered = false
        }
      },
      handleShowTaskInfo (payload) {
        const { task } = payload
        this.$store.dispatch('task/showTaskDetail', task)
      },
      openPreference () {
        this.$electron.ipcRenderer.send('open-preference-window')
      }
    },
    created () {
      this.changeCurrentList()
    },
    mounted () {
      if (typeof window !== 'undefined') {
        this.handleWindowResize()
        this._handleWindowResize = () => {
          this.handleWindowResize()
        }
        window.addEventListener('resize', this._handleWindowResize)
        this._handleWindowMouseMoveForSubnav = (event) => {
          this.handleWindowMouseMoveForSubnav(event)
        }
        window.addEventListener('mousemove', this._handleWindowMouseMoveForSubnav)

        // 监听鼠标离开窗口事件
        this._handleWindowMouseLeave = () => {
          this.handleWindowMouseLeave()
        }
        document.addEventListener('mouseleave', this._handleWindowMouseLeave)
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
      commands.on('task:focus-search', this.handleFocusTaskSearch)
    },
    beforeDestroy () {
      if (typeof window !== 'undefined' && this._handleWindowResize) {
        window.removeEventListener('resize', this._handleWindowResize)
        this._handleWindowResize = null
      }
      if (typeof window !== 'undefined' && this._handleWindowMouseMoveForSubnav) {
        window.removeEventListener('mousemove', this._handleWindowMouseMoveForSubnav)
        this._handleWindowMouseMoveForSubnav = null
      }
      if (typeof document !== 'undefined' && this._handleWindowMouseLeave) {
        document.removeEventListener('mouseleave', this._handleWindowMouseLeave)
        this._handleWindowMouseLeave = null
      }
      if (this._subnavMouseRaf) {
        window.cancelAnimationFrame(this._subnavMouseRaf)
        this._subnavMouseRaf = null
      }
      this.$store.dispatch('app/updateAsideHovered', false)
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
      commands.off('task:focus-search', this.handleFocusTaskSearch)
    }
  }
</script>

<style lang="scss">
.main.panel {
  height: 100vh;
  overflow: hidden;
}

.content.panel {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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

.task-category-select {
  position: absolute;
  top: 44px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
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
  opacity: 0.75;
  transition: opacity 0.2s ease;
}

.task-category-select .el-select .el-input__inner {
  user-select: none !important;
  -webkit-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
}

.task-category-select .el-select:hover,
.task-category-select .el-select:focus-within {
  opacity: 1;
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

/* 左侧悬浮任务状态导航 - 悬浮模式使用 */
.subnav-small-screen.subnav-left {
  position: fixed;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  background-color: transparent;
  border-radius: 100px;
  opacity: 0.5;
  transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  padding: 8px;
  pointer-events: auto;
}

.subnav-small-screen.subnav-left:hover {
  opacity: 1;
}

/* 自动隐藏左侧导航 */
.subnav-small-screen.subnav-left.is-auto-hide-aside {
  transform: translateY(-50%) translateX(-120px);
}

.subnav-small-screen.subnav-left.is-auto-hide-aside.is-proximity-hovered,
.subnav-small-screen.subnav-left.is-auto-hide-aside:hover {
  transform: translateY(-50%) translateX(0);
}

/* 左侧导航分隔线 */
.subnav-divider-left {
  width: 16px;
  height: 2px;
  background-color: $--icon-color;
  border-radius: 1px;
  opacity: 0.3;
  margin: 8px auto;
}

/* 通用小屏幕导航样式 */
.subnav-small-screen .menu {
  list-style: none;
  padding: 0;
  margin: 0 auto;
  user-select: none;
  cursor: default;
}

.subnav-small-screen .menu > li {
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
  position: relative;
}

.subnav-small-screen .menu > li:focus,
.subnav-small-screen .menu > li:active {
  outline: none;
  border: none;
  box-shadow: none;
}

.subnav-small-screen .menu > li:hover {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
}

.subnav-small-screen .menu > li.active {
  background-color: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
}

/* 悬浮侧边栏图标右上角任务数量，使用纯文字显示 */
.subnav-small-screen .menu > li .subnav-badge {
  position: absolute;
  top: -6px;
  right: -2px;
  min-width: 0;
  height: auto;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  color: $--icon-color;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  z-index: 2;
  pointer-events: none;
  white-space: nowrap;
}

.subnav-small-screen .menu svg {
  padding: 6px;
  color: $--icon-color;
  outline: none;
  border: none;
  box-shadow: none;
}

.subnav-small-screen .small-menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 4px 0;
}

.subnav-small-screen .small-menu > li {
  margin-top: 8px;
  margin-bottom: 8px;
}

.subnav-small-screen .small-menu > li:first-child {
  margin-top: 0;
}

.subnav-small-screen .small-menu > li:last-child {
  margin-bottom: 0;
}

.subnav-small-screen.subnav-right {
  position: fixed;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  background-color: transparent;
  border-radius: 100px;
  opacity: 0.5;
  transition: opacity 0.3s ease;
  padding: 8px;
  pointer-events: auto;
}

.dialog-footer {
  text-align: right;
}

.dialog-footer .el-button {
  margin-left: 10px;
}
</style>
