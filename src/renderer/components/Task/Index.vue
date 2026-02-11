<template>
  <el-container
    class="main panel"
    direction="horizontal"
  >
    <template v-if="isThreeColumn">
      <mo-aside v-if="showMainAside" :class="{ 'is-auto-hide-aside': autoHideAside && !isThreeColumn }" />
      <el-aside v-if="showThreeColumnSubnav" width="220px" class="subnav" :class="{ 'is-auto-hide-subnav': autoHideSubnav && !isThreeColumn }">
        <mo-task-subnav :current="status" />
      </el-aside>
    </template>

    <el-container
      class="content panel"
      direction="vertical"
    >
      <el-header
        class="panel-header"
        :class="{ 'is-collapsed': shouldMoveTitleToTitlebar }"
        :height="shouldMoveTitleToTitlebar ? '0' : '84'"
      >
        <h4
          v-if="subnavMode !== 'title' && !shouldMoveTitleToTitlebar"
          class="task-title hidden-xs-only"
        >
          {{ title }}
        </h4>
        <h4
          v-if="subnavMode === 'floating' && !shouldMoveTitleToTitlebar"
          class="task-title hidden-sm-and-up"
        >
          {{ title }}
        </h4>
        <mo-subnav-switcher
          v-if="subnavMode === 'title'"
          :class="['task-subnav-switch', { 'task-subnav-switch--titlebar': shouldMoveTitleToTitlebar }]"
          :title="title"
          :subnavs="subnavs"
        />
        <div
          :class="['task-category-select', { 'task-category-select--titlebar': shouldMoveTitleToTitlebar }]"
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
        <mo-task-actions :showInTitlebar="shouldMoveActionsToTitlebar" />
      </el-header>
      <el-main class="panel-content" @contextmenu.native="onTaskPageContextMenu">
        <mo-task-list :category="categoryFilter" :keyword="taskSearchQuery" :collapsed="shouldMoveTitleToTitlebar" />
      </el-main>
    </el-container>

    <div
      v-if="subnavMode === 'floating'"
      class="right-floating-panel"
      :class="{ 'is-auto-hide-subnav': autoHideSubnav && !isThreeColumn && !datePickerVisible, 'is-proximity-hovered': isSubnavProximityHovered }"
    >
      <template v-if="showSmallScreenNav">
        <div class="subnav-small-screen subnav-right">
          <ul class="menu small-menu">
            <li
              @click="navStatus('all')"
              :class="{ active: status === 'all' || status === 'date' }"
            >
              <el-tooltip
                effect="dark"
                :content="$t('task.all')"
                placement="left"
                :open-delay="500"
              >
                <mo-icon name="menu-task" width="20" height="20" />
              </el-tooltip>
            </li>
            <li
              @click="navStatus('active')"
              :class="{ active: status === 'active' }"
            >
              <el-tooltip
                effect="dark"
                :content="$t('task.active')"
                placement="left"
                :open-delay="500"
              >
                <mo-icon name="task-start" width="20" height="20" />
              </el-tooltip>
            </li>
            <li
              @click="navStatus('waiting')"
              :class="{ active: status === 'waiting' }"
            >
              <el-tooltip
                effect="dark"
                :content="$t('task.waiting')"
                placement="left"
                :open-delay="500"
              >
                <mo-icon name="task-pause" width="20" height="20" />
              </el-tooltip>
            </li>
            <li
              @click="navStatus('stopped')"
              :class="{ active: status === 'stopped' }"
            >
              <el-tooltip
                effect="dark"
                :content="$t('task.stopped')"
                placement="left"
                :open-delay="500"
              >
                <mo-icon name="task-stop" width="20" height="20" />
              </el-tooltip>
            </li>
          </ul>
        </div>
        <div class="subnav-divider"></div>
      </template>

      <div
        ref="dateFilterBtn"
        class="date-filter-standalone"
        :class="{ 'has-filter': storeFilterDate, expanded: datePickerVisible || showDateText, active: datePickerVisible, 'date-filter-standalone--three-column': isThreeColumn, 'is-frosted': dateFilterFrosted }"
        @click.stop="onDateFilterClick"
        @mouseenter="onDateFilterHover"
        @mouseleave="onDateFilterLeave"
        @mousedown.prevent
        @selectstart.prevent
        @dragstart.prevent
      >
        <span
          class="date-filter-text"
          :class="{ visible: datePickerVisible || showDateText || storeFilterDate }"
          @mousedown.prevent
          @selectstart.prevent
          @dragstart.prevent
        >
          {{ displayDateText }}
        </span>
        <div
          class="date-filter-icon"
          @mousedown.prevent
          @selectstart.prevent
          @dragstart.prevent
        >
          <mo-icon name="date-filter" width="24" height="24" />
        </div>
      </div>
    </div>
    <mo-custom-date-picker
      v-if="subnavMode === 'floating' && datePickerVisible"
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
  import is from 'electron-is'
  import { mapState } from 'vuex'

  import { commands } from '@/components/CommandManager/instance'
  import { ADD_TASK_TYPE } from '@shared/constants'
  import TaskActions from '@/components/Task/TaskActions'
  import TaskList from '@/components/Task/TaskList'
  import Aside from '@/components/Aside/Index'
  import SubnavSwitcher from '@/components/Subnav/SubnavSwitcher'
  import TaskSubnav from '@/components/Subnav/TaskSubnav'
  import CustomDatePicker from '@/components/Task/DatePicker'
  import taskHistory from '@/api/TaskHistory'
  import '@/components/Icons/menu-task'
  import '@/components/Icons/task-start'
  import '@/components/Icons/task-pause'
  import '@/components/Icons/task-stop'
  import '@/components/Icons/date-filter'
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
      [Aside.name]: Aside,
      [SubnavSwitcher.name]: SubnavSwitcher,
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
        windowWidth: 0
      }
    },
    computed: {
      ...mapState('task', {
        taskList: state => state.taskList,
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
        subnavMode: state => state.config.subnavMode || 'floating',
        sidebarLayoutMode: state => (state.config && state.config.sidebarLayoutMode) || 'floating',
        prefTheme: state => state.config.theme,
        dateFilterFrosted: state => state.config.dateFilterFrosted,
        autoHideAside: state => state.config.autoHideAside,
        autoHideSubnav: state => state.config.autoHideSubnav,
        hideAppMenu: state => state.config.hideAppMenu
      }),
      showWindowActions () {
        return (is.windows() || is.linux()) && !!this.hideAppMenu
      },
      shouldMoveActionsToTitlebar () {
        return this.shouldMoveTitleToTitlebar
      },
      shouldMoveTitleToTitlebar () {
        return this.showWindowActions && !this.isTitlebarCompact
      },
      shouldShowTitleBarText () {
        return this.shouldMoveTitleToTitlebar && this.subnavMode !== 'title'
      },
      isTitlebarCompact () {
        const width = this.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 0)
        if (!width) {
          return false
        }
        return width < 780
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
      showMainAside () {
        if (!this.isThreeColumn) {
          return false
        }
        const width = this.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 0)
        if (!width) {
          return false
        }
        return width >= 960
      },
      showThreeColumnSubnav () {
        return this.isThreeColumn && this.subnavMode !== 'title'
      },
      showSmallScreenNav () {
        if (this.sidebarLayoutMode !== 'three-column') {
          return true
        }
        return !this.isThreeColumn
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
      blockCategoryHoverOpen () {
        return !!(this.taskDetailVisible || this.addTaskVisible || this.taskPlanVisible)
      }
    },
    watch: {
      status: 'onStatusChange',
      title: 'updateTitleBarText',
      showWindowActions: 'updateTitleBarText',
      subnavMode: 'updateTitleBarText',
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
      updateTitleBarText () {
        const text = this.shouldShowTitleBarText ? this.title : ''
        this.$store.dispatch('app/updateTitleBarText', text)
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
      toggleDatePicker () {
        this.clearTextSelection()

        this.datePickerVisible = !this.datePickerVisible
        if (this.datePickerVisible) {
          this.loadTaskDateCounts()
          // 获取按钮位置
          if (this.$refs.dateFilterBtn) {
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
      onDateFilterClick (event) {
        event.stopPropagation()
        event.preventDefault()

        this.clearTextSelection()

        // 如果当前已经有日期筛选，点击则清除日期筛选
        if (this.storeFilterDate && !this.datePickerVisible) {
          this.selectedDate = ''
          this.$store.dispatch('task/updateFilterDate', null)
          this.$store.dispatch('task/fetchList')
          return
        }
        // 否则打开日期选择器
        this.toggleDatePicker()
      },
      loadTaskDateCounts () {
        const history = taskHistory.getHistory()
        const counts = {}
        // 限制处理的历史记录数量，避免卡顿
        const maxHistoryItems = 100
        const limitedHistory = history.length > maxHistoryItems ? history.slice(0, maxHistoryItems) : history
        limitedHistory.forEach(task => {
          // 使用savedAt作为任务完成时间
          const timestamp = parseInt(task.savedAt) || parseInt(task.createdAt) || parseInt(task.creationTime) || 0
          if (timestamp > 0) {
            const date = new Date(timestamp)
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
            counts[dateStr] = (counts[dateStr] || 0) + 1
          }
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
        this.updateTitleBarText()
      },
      updateSubnavProximityHover (event) {
        if (!this.autoHideSubnav || this.datePickerVisible || this.subnavMode !== 'floating') {
          if (this.isSubnavProximityHovered) {
            this.isSubnavProximityHovered = false
          }
          return
        }
        if (!event) {
          return
        }
        const width = typeof window !== 'undefined' ? window.innerWidth : 0
        const height = typeof window !== 'undefined' ? window.innerHeight : 0
        if (!width || !height) {
          return
        }
        const centerY = height / 2
        const top = centerY - 120
        const bottom = centerY + 180
        const withinY = event.clientY >= top && event.clientY <= bottom
        const withinX = event.clientX >= width - 100
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
      handleShowTaskInfo (payload) {
        const { task } = payload
        this.$store.dispatch('task/showTaskDetail', task)
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
      this.updateTitleBarText()
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
      if (this._subnavMouseRaf) {
        window.cancelAnimationFrame(this._subnavMouseRaf)
        this._subnavMouseRaf = null
      }
      this.$store.dispatch('app/updateTitleBarText', '')
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
.panel-header {
  position: relative;
  z-index: 100;
  transition: all 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
}

.panel-header.is-collapsed {
  padding: 0 !important;
  min-height: 0 !important;
  overflow: visible;
  z-index: 6000;
  border-bottom: none !important;
  margin: 0 !important;
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
.task-category-select.task-category-select--titlebar {
  position: fixed;
  top: 7px;
  height: auto;
  align-items: center;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  z-index: 10000;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  transition: opacity 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
}
.has-custom-titlebar .task-category-select.task-category-select--titlebar {
  justify-content: center;
  padding-left: 0;
}

.is-task-detail-open .task-category-select.task-category-select--titlebar,
.is-add-task-open .task-category-select.task-category-select--titlebar,
.is-task-plan-open .task-category-select.task-category-select--titlebar {
  z-index: 1999;
  opacity: 0;
  pointer-events: none;
  transition: none;
}
.is-task-detail-open .task-category-select.task-category-select--titlebar .el-select,
.is-add-task-open .task-category-select.task-category-select--titlebar .el-select,
.is-task-plan-open .task-category-select.task-category-select--titlebar .el-select {
  pointer-events: none !important;
}

.is-task-detail-open .task-subnav-switch.task-subnav-switch--titlebar,
.is-add-task-open .task-subnav-switch.task-subnav-switch--titlebar,
.is-task-plan-open .task-subnav-switch.task-subnav-switch--titlebar {
  z-index: 1999;
}

.task-subnav-switch {
  display: block;
  margin: 0;
  transition: all 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
}

.task-subnav-switch:not(.task-subnav-switch--titlebar) {
  margin-left: -6px;
}

.task-subnav-switch.task-subnav-switch--titlebar {
  position: fixed;
  top: 9px;
  left: 16px;
  transform: none;
  z-index: 10000;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  transition: opacity 0.35s cubic-bezier(0.215, 0.61, 0.355, 1);
}
.has-custom-titlebar .task-subnav-switch.task-subnav-switch--titlebar {
  left: 16px;
}

@media only screen and (min-width: 568px) {
  .task-subnav-switch.task-subnav-switch--titlebar {
    left: 36px;
  }
  .has-custom-titlebar .task-subnav-switch.task-subnav-switch--titlebar {
    left: 36px;
  }
  .has-custom-titlebar .task-category-select.task-category-select--titlebar {
    padding-left: 0;
  }
}

.task-category-select .el-select {
  width: 160px;
  pointer-events: auto;
  opacity: 0.75;
  transition: opacity 0.2s ease;
}

.task-category-select.task-category-select--titlebar .el-select {
  -webkit-app-region: no-drag;
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

.task-search-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.task-search-bar .el-input {
  max-width: 160px;
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

/* 右侧悬浮面板容器 */
.right-floating-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 0;
  z-index: 2000;
  pointer-events: auto;
}

.is-add-task-open .right-floating-panel,
.is-task-plan-open .right-floating-panel {
  z-index: 1999;
}

/* 针对子元素的独立滑入滑出逻辑，确保不覆盖原有的 transform */

/* 1. 子菜单 */
.right-floating-panel.is-auto-hide-subnav .subnav-small-screen.subnav-right {
  transform: translateY(-50%) translateX(120px);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
}

.right-floating-panel.is-auto-hide-subnav:hover .subnav-small-screen.subnav-right,
.right-floating-panel.is-auto-hide-subnav.is-proximity-hovered .subnav-small-screen.subnav-right {
  transform: translateY(-50%) translateX(0);
}

/* 2. 分隔线 */
.right-floating-panel.is-auto-hide-subnav .subnav-divider {
  transform: translateX(120px);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
}

.right-floating-panel.is-auto-hide-subnav:hover .subnav-divider,
.right-floating-panel.is-auto-hide-subnav.is-proximity-hovered .subnav-divider {
  transform: translateX(0);
}

/* 3. 日期筛选按钮 (普通模式) */
.right-floating-panel.is-auto-hide-subnav .date-filter-standalone:not(.date-filter-standalone--three-column) {
  transform: translateX(120px);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s ease, background-color 0.3s ease, opacity 0.3s ease;
}

.right-floating-panel.is-auto-hide-subnav:hover .date-filter-standalone:not(.date-filter-standalone--three-column),
.right-floating-panel.is-auto-hide-subnav.is-proximity-hovered .date-filter-standalone:not(.date-filter-standalone--three-column) {
  transform: translateX(0);
}

/* 4. 日期筛选按钮 (三栏模式) */
.right-floating-panel.is-auto-hide-subnav .date-filter-standalone.date-filter-standalone--three-column {
  transform: translateY(-50%) translateX(120px);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s ease, background-color 0.3s ease, opacity 0.3s ease;
}

.right-floating-panel.is-auto-hide-subnav:hover .date-filter-standalone.date-filter-standalone--three-column,
.right-floating-panel.is-auto-hide-subnav.is-proximity-hovered .date-filter-standalone.date-filter-standalone--three-column {
  transform: translateY(-50%) translateX(0);
}

/* 鼠标靠近感应区域 */
.right-floating-panel.is-auto-hide-subnav::before {
  content: '';
  position: absolute;
  top: 50%;
  height: 400px;
  transform: translateY(-50%);
  left: -100px;
  width: 100px;
  background: transparent;
  cursor: default;
  pointer-events: none;
  z-index: -1;
}

.subnav-small-screen.subnav-right:hover {
  opacity: 1;
}

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
  &:focus,
  &:active {
    outline: none;
    border: none;
    box-shadow: none;
  }
}

.subnav-small-screen .menu > li:hover {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
}

.subnav-small-screen .menu > li.active {
  background-color: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
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

/* 子侧边栏与日期筛选按钮之间的分隔线 */
.subnav-divider {
  position: fixed;
  right: 26px;
  top: calc(50% + 97px);
  width: 16px;
  height: 2px;
  background-color: $--icon-color;
  border-radius: 1px;
  z-index: 1000;
  opacity: 0.3;
  pointer-events: none;
}

/* 日期筛选独立按钮样式 */
.date-filter-standalone {
  position: fixed;
  right: 18px;
  top: calc(50% + 108px);
  width: 32px;
  height: 32px;
  background-color: var(--speedometer-background);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  cursor: pointer;
  transition: width 0.3s ease, background-color 0.3s ease, opacity 0.3s ease;
  overflow: hidden;
  opacity: 0.5;
  z-index: 1000;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  pointer-events: auto;
}

.date-filter-standalone.date-filter-standalone--three-column {
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
}

.theme-light .date-filter-standalone.is-frosted,
.theme-dark .date-filter-standalone.is-frosted {
  background-color: transparent !important;
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.theme-light .date-filter-standalone.is-frosted.active,
.theme-light .date-filter-standalone.is-frosted.has-filter,
.theme-light .date-filter-standalone.is-frosted:hover:not(.has-filter):not(.active) {
  background-color: rgba(255, 255, 255, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9))) !important;
  background: rgba(255, 255, 255, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9))) !important;
  backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px))) !important;
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px))) !important;
}

.theme-dark .date-filter-standalone.is-frosted.active,
.theme-dark .date-filter-standalone.is-frosted.has-filter,
.theme-dark .date-filter-standalone.is-frosted:hover:not(.has-filter):not(.active) {
  background-color: rgba(45, 45, 45, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9))) !important;
  background: rgba(45, 45, 45, var(--app-ui-opacity-date-filter, var(--app-ui-opacity, 0.9))) !important;
  backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px))) !important;
  -webkit-backdrop-filter: blur(var(--app-ui-frosted-blur-date-filter, var(--app-ui-frosted-blur, 0px))) !important;
}

.date-filter-standalone * {
  user-select: none !important;
  -webkit-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  -webkit-touch-callout: none !important;
}

.date-filter-standalone:hover {
  opacity: 1;
}

.date-filter-standalone.expanded {
  width: 120px;
}

.date-filter-standalone.active {
  opacity: 1;
  background-color: rgba(0, 0, 0, 0.15);
}

.date-filter-standalone.has-filter {
  background-color: rgba(0, 0, 0, 0.15);
  opacity: 1;
}

.date-filter-standalone:hover:not(.has-filter):not(.active) {
  background-color: rgba(0, 0, 0, 0.15);
}

.date-filter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.date-filter-icon svg {
  padding: 4px;
  color: $--icon-color;
}

.date-filter-text {
  flex: 1;
  color: $--icon-color;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 8px;
  transition: opacity 0.3s ease;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.date-filter-text.visible {
  opacity: 1;
}

.date-filter-picker {
  flex: 1;
  margin-left: 4px;
}

.date-filter-picker .el-input__inner {
  height: 24px;
  line-height: 24px;
  font-size: 12px;
  padding: 0 8px;
  background: transparent;
  border: none;
  color: $--icon-color;
}

.date-filter-picker .el-input__prefix,
.date-filter-picker .el-input__suffix {
  display: none;
}

.date-picker-content {
  padding: 20px 0;
}

.dialog-footer {
  text-align: right;
}

.dialog-footer .el-button {
  margin-left: 10px;
}
</style>
