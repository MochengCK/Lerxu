<template>
  <mo-drag-select
    :class="['task-list', `task-list--${viewMode}`]"
    v-if="displayTaskList.length > 0"
    attribute="attr"
    @change="handleDragSelectChange"
    @mousedown.native="handleListBlankClick"
  >
    <div
      v-for="item in displayTaskList"
      :key="item.gid"
      :attr="item.gid"
      :class="getItemClass(item)"
      :style="getItemStyle(item)"
      @click.stop="(e) => handleItemClick(item, e)"
      @contextmenu.stop.prevent="(e) => handleItemContextMenu(item, e)"
    >
      <mo-task-item
        :task="item"
        :view-mode="viewMode"
      />
    </div>
  </mo-drag-select>
  <div class="no-task" v-else>
    <div class="no-task-inner">
      {{ $t('task.no-task') }}
    </div>
  </div>
</template>

<script>
  import { Menu, getCurrentWindow } from '@electron/remote'
  import { mapState } from 'vuex'
  import { cloneDeep } from 'lodash'
  import {
    calcProgress,
    checkTaskIsSeeder,
    getFileExtension,
    getFileNameFromFile,
    getTaskName
  } from '@shared/utils'
  import {
    AUDIO_SUFFIXES,
    DOCUMENT_SUFFIXES,
    IMAGE_SUFFIXES,
    SUB_SUFFIXES,
    VIDEO_SUFFIXES,
    TASK_STATUS
  } from '@shared/constants'

  import DragSelect from '@/components/DragSelect/Index'
  import { getTaskActualPath } from '@/utils/native'
  import { commands } from '@/components/CommandManager/instance'
  import TaskItem from './TaskItem'

  export default {
    name: 'mo-task-list',
    components: {
      [DragSelect.name]: DragSelect,
      [TaskItem.name]: TaskItem
    },
    props: {
      category: {
        type: String,
        default: ''
      },
      keyword: {
        type: String,
        default: ''
      }
    },
    data () {
      const selectedList = cloneDeep(this.$store.state.task.selectedGidList) || []
      return {
        selectedList,
        isMultiSelectModifierPressed: false,
        isMultiSelectMode: false
      }
    },
    computed: {
      ...mapState('task', {
        taskList: state => state.taskList,
        selectedGidList: state => state.selectedGidList,
        viewMode: state => state.viewMode
      }),
      ...mapState('preference', {
        preferenceConfig: state => state.config
      }),
      taskProgressMode () {
        return this.preferenceConfig?.taskProgressMode || 'component'
      },
      displayTaskList () {
        const baseList = !this.category
          ? this.taskList
          : this.taskList.filter((task) => {
            return this.taskMatchesCategory(task, this.category)
          })
        const q = `${this.keyword || ''}`.trim().toLowerCase()
        if (!q) {
          return baseList
        }
        return baseList.filter((task) => {
          const name = getTaskName(task, {
            defaultName: '',
            maxLen: -1
          }) || ''
          const uri = `${task && task.uri ? task.uri : ''}`.toLowerCase()
          const gid = `${task && task.gid ? task.gid : ''}`.toLowerCase()
          const loweredName = `${name}`.toLowerCase()
          return loweredName.includes(q) || uri.includes(q) || gid.includes(q)
        })
      },
      multiSelectModifier () {
        const v = this.preferenceConfig && this.preferenceConfig.taskMultiSelectModifier
        return (v ? `${v}`.toLowerCase() : 'ctrl').trim()
      },
      multiSelectKeystroke () {
        const raw = `${this.multiSelectModifier || ''}`.trim().toLowerCase()
        const tokens = raw
          .split(/[-+]/g)
          .map(s => `${s || ''}`.trim())
          .filter(Boolean)
          .map(t => {
            if (t === 'control') return 'ctrl'
            if (t === 'command') return 'cmd'
            if (t === 'meta') return 'cmd'
            if (t === 'commandorcontrol' || t === 'cmdorctrl') return 'cmdctrl'
            return t
          })

        const modifiers = []
        let key = ''
        tokens.forEach(t => {
          if (t === 'cmdctrl' || t === 'ctrl' || t === 'cmd' || t === 'shift' || t === 'alt') {
            if (!modifiers.includes(t)) modifiers.push(t)
          } else {
            key = t
          }
        })

        const normalized = [...modifiers, key].filter(Boolean).join('-')
        return normalized || 'ctrl'
      },
      multiSelectModifiers () {
        const raw = `${this.multiSelectKeystroke || ''}`.trim().toLowerCase()
        const tokens = raw
          .split(/[-+]/g)
          .map(s => `${s || ''}`.trim())
          .filter(Boolean)
          .map(t => {
            if (t === 'control') return 'ctrl'
            if (t === 'command') return 'cmd'
            if (t === 'meta') return 'cmd'
            if (t === 'commandorcontrol' || t === 'cmdorctrl') return 'cmdctrl'
            return t
          })

        const allowed = new Set(['cmdctrl', 'ctrl', 'cmd', 'shift', 'alt'])
        const uniq = []
        tokens.forEach(t => {
          if (!allowed.has(t)) return
          if (uniq.includes(t)) return
          uniq.push(t)
        })
        return uniq.length > 0 ? uniq : ['ctrl']
      },
      isMultiSelectToggleShortcut () {
        const raw = `${this.multiSelectKeystroke || ''}`.trim().toLowerCase()
        if (!raw) return false
        const tokens = raw.split(/[-+]/g).map(s => `${s || ''}`.trim()).filter(Boolean)
        const allowed = new Set(['cmdctrl', 'ctrl', 'cmd', 'shift', 'alt', 'meta'])
        return tokens.some(t => !allowed.has(t))
      }
    },
    mounted () {
      this.handleKeyEvent = (e) => {
        if (e && e.type === 'keydown' && this.isMultiSelectToggleShortcut && this.isMultiSelectToggleHit(e)) {
          if (!e.repeat) {
            this.isMultiSelectMode = !this.isMultiSelectMode
          }
          this.isMultiSelectModifierPressed = this.isMultiSelectMode
          e.preventDefault()
          return
        }
        this.isMultiSelectModifierPressed = this.isMultiSelectToggleShortcut
          ? this.isMultiSelectMode
          : this.getModifierPressedFromEvent(e)
      }
      window.addEventListener('keydown', this.handleKeyEvent)
      window.addEventListener('keyup', this.handleKeyEvent)
    },
    beforeDestroy () {
      if (this.handleKeyEvent) {
        window.removeEventListener('keydown', this.handleKeyEvent)
        window.removeEventListener('keyup', this.handleKeyEvent)
      }
    },
    methods: {
      normalizeKeystroke (event) {
        const parts = []
        if (event.ctrlKey || event.metaKey) parts.push('cmdctrl')
        if (event.shiftKey) parts.push('shift')
        if (event.altKey) parts.push('alt')
        let key = event.key || ''
        key = key.toLowerCase()
        if (key === 'control' || key === 'meta' || key === 'shift' || key === 'alt') {
          return ''
        }
        if (key === 'arrowup') key = 'up'
        if (key === 'arrowdown') key = 'down'
        if (key === 'arrowleft') key = 'left'
        if (key === 'arrowright') key = 'right'
        if (key === 'escape') key = 'esc'
        const result = [...parts, key].filter(Boolean).join('-')
        return result
      },
      isMultiSelectToggleHit (event) {
        const expected = `${this.multiSelectKeystroke || ''}`.trim().toLowerCase()
        if (!expected) return false
        const actual = this.normalizeKeystroke(event)
        return actual && actual === expected
      },
      getModifierPressedFromEvent (e) {
        const required = this.multiSelectModifiers || []
        return required.every((key) => {
          if (key === 'shift') return !!e.shiftKey
          if (key === 'alt') return !!e.altKey
          if (key === 'cmd') return !!e.metaKey
          if (key === 'cmdctrl') return !!(e.ctrlKey || e.metaKey)
          return !!e.ctrlKey
        })
      },
      isMultiSelectEvent (e) {
        return this.isMultiSelectToggleShortcut
          ? this.isMultiSelectMode
          : this.getModifierPressedFromEvent(e)
      },
      normalizeSuffixes (suffixes = []) {
        return suffixes
          .map((s) => `${s}`.toLowerCase())
          .map((s) => s.startsWith('.') ? s.slice(1) : s)
      },
      getCategorySuffixes (category) {
        const archives = [
          'zip',
          'rar',
          '7z',
          'tar',
          'gz',
          'bz2',
          'xz'
        ]
        const programs = [
          'exe',
          'msi',
          'deb',
          'rpm',
          'dmg',
          'apk',
          'app'
        ]

        switch (category) {
        case 'archives':
          return archives
        case 'programs':
          return programs
        case 'videos':
          return this.normalizeSuffixes([...VIDEO_SUFFIXES, ...SUB_SUFFIXES])
        case 'music':
          return this.normalizeSuffixes(AUDIO_SUFFIXES)
        case 'images':
          return this.normalizeSuffixes(IMAGE_SUFFIXES)
        case 'documents':
          return this.normalizeSuffixes(DOCUMENT_SUFFIXES)
        default:
          return []
        }
      },
      getTaskFileExtensions (task) {
        const files = (task && task.files) || []
        const suffix = (this.preferenceConfig && this.preferenceConfig.downloadingFileSuffix) || ''
        const result = []
        files.forEach((file) => {
          let name = getFileNameFromFile(file)
          if (suffix && name && name.endsWith(suffix)) {
            name = name.slice(0, -suffix.length)
          }
          const ext = `${getFileExtension(name)}`.toLowerCase()
          if (ext) {
            result.push(ext)
          }
        })
        return result
      },
      taskMatchesCategory (task, category) {
        const suffixes = this.getCategorySuffixes(category)
        if (suffixes.length === 0) {
          return false
        }
        const exts = this.getTaskFileExtensions(task)
        return exts.some((ext) => suffixes.includes(ext))
      },
      handleDragSelectChange (selectedList) {
        const incoming = Array.isArray(selectedList) ? selectedList : []
        const next = this.isMultiSelectModifierPressed
          ? Array.from(new Set([...(this.selectedList || []), ...incoming]))
          : incoming
        this.selectedList = next
        this.$store.dispatch('task/selectTasks', cloneDeep(next))
      },
      handleItemClick (item, e) {
        const gid = item && item.gid
        if (!gid) {
          return
        }

        const current = Array.isArray(this.selectedList) ? this.selectedList : []
        const useMulti = this.isMultiSelectEvent(e)
        let next = []

        if (useMulti) {
          const set = new Set(current)
          if (set.has(gid)) {
            set.delete(gid)
          } else {
            set.add(gid)
          }
          next = Array.from(set)
        } else {
          next = [gid]
        }

        this.selectedList = next
        this.$store.dispatch('task/selectTasks', cloneDeep(next))

        // 如果侧边栏已经打开，更新显示的任务
        const taskDetailVisible = this.$store.state.task.taskDetailVisible
        if (taskDetailVisible && next.length > 0) {
          // 显示第一个选中的任务
          const firstSelectedGid = next[0]
          const task = this.taskList.find(t => t.gid === firstSelectedGid)
          if (task) {
            this.$store.dispatch('task/showTaskDetail', task)
          }
        }
      },
      handleItemContextMenu (item, event) {
        const task = item || null
        const gid = task && task.gid ? task.gid : ''
        if (!gid) {
          return
        }
        if (!this.selectedList.includes(gid)) {
          this.selectedList = [gid]
          this.$store.dispatch('task/selectTasks', [gid])
        }

        const selected = Array.isArray(this.selectedList) ? this.selectedList : []
        const selectedUnique = Array.from(new Set(selected.map(x => `${x || ''}`.trim()).filter(Boolean)))
        const isMultiSelected = selectedUnique.length > 1 && selectedUnique.includes(`${gid}`)

        const template = isMultiSelected
          ? this.getMultiTaskContextMenuTemplate(selectedUnique)
          : this.getTaskContextMenuTemplate(task, event)

        const menu = Menu.buildFromTemplate(template)
        menu.popup({
          window: getCurrentWindow(),
          x: event.x != null ? event.x : event.clientX,
          y: event.y != null ? event.y : event.clientY
        })
      },
      getMultiTaskContextMenuTemplate (selectedGids = []) {
        const gids = Array.isArray(selectedGids) ? selectedGids : []
        const list = Array.isArray(this.taskList) ? this.taskList : []
        const selectedTasks = list.filter(t => t && gids.includes(`${t.gid}`))

        const canPause = selectedTasks.some(t => t && t.status === TASK_STATUS.ACTIVE)
        const canResume = selectedTasks.some(t => t && (t.status === TASK_STATUS.PAUSED || t.status === TASK_STATUS.WAITING))

        return [
          {
            label: this.$t('task.pause-task'),
            enabled: canPause,
            click: () => commands.execute('application:pause-task')
          },
          {
            label: this.$t('task.resume-task'),
            enabled: canResume,
            click: () => commands.execute('application:resume-task')
          },
          { type: 'separator' },
          {
            label: this.$t('task.delete-selected-tasks'),
            click: () => commands.emit('batch-delete-task', { deleteWithFiles: false })
          },
          {
            label: `${this.$t('task.delete-selected-tasks')}（${this.$t('task.delete-task-label')}）`,
            click: () => commands.emit('batch-delete-task', { deleteWithFiles: true })
          },
          { type: 'separator' },
          {
            label: this.$t('task.refresh-list'),
            click: () => this.$store.dispatch('task/fetchList')
          },
          {
            label: this.$t('task.select-all-task'),
            click: () => commands.execute('application:select-all-task')
          }
        ]
      },
      getTaskContextMenuTemplate (task, event) {
        const status = task && task.status ? task.status : ''
        const isSeeder = checkTaskIsSeeder(task)
        const taskName = getTaskName(task, {
          defaultName: this.$t('task.get-task-name'),
          maxLen: -1
        })

        let path = ''
        try {
          path = getTaskActualPath(task, this.preferenceConfig || {}) || ''
        } catch (_) {
          path = ''
        }

        const items = []

        if (status === TASK_STATUS.ACTIVE) {
          items.push({
            label: this.$t('task.pause-task'),
            click: () => commands.emit('pause-task', { task, taskName })
          })
        } else if (status === TASK_STATUS.PAUSED || status === TASK_STATUS.WAITING) {
          items.push({
            label: this.$t('task.resume-task'),
            click: () => commands.emit('resume-task', { task, taskName })
          })
        }

        if (isSeeder) {
          items.push({
            label: this.$t('task.stop'),
            click: () => commands.emit('stop-task-seeding', { task })
          })
        }

        if ([TASK_STATUS.ERROR, TASK_STATUS.COMPLETE, TASK_STATUS.REMOVED].includes(status)) {
          items.push({
            label: this.$t('task.restart'),
            click: () => commands.emit('restart-task', {
              task,
              taskName,
              showDialog: status === TASK_STATUS.COMPLETE || !!(event && event.altKey)
            })
          })
        }

        if (items.length > 0) {
          items.push({ type: 'separator' })
        }

        items.push({
          label: this.$t('task.reveal-in-folder'),
          enabled: !!path,
          click: () => commands.emit('reveal-in-folder', { path })
        })

        items.push({
          label: this.$t('task.copy-link'),
          click: () => commands.emit('copy-task-link', { task })
        })

        items.push({
          label: this.$t('task.info'),
          click: () => commands.emit('show-task-info', { task })
        })

        items.push({ type: 'separator' })

        const deleteEventPayload = (deleteWithFiles) => ({ task, taskName, deleteWithFiles: !!deleteWithFiles })
        const isRecordRemove = [TASK_STATUS.ERROR, TASK_STATUS.COMPLETE, TASK_STATUS.REMOVED].includes(status)
        if (isRecordRemove) {
          items.push({
            label: this.$t('task.remove-record'),
            click: () => commands.emit('delete-task-record', deleteEventPayload(false))
          })
          items.push({
            label: `${this.$t('task.remove-record')}（${this.$t('task.remove-record-label')}）`,
            click: () => commands.emit('delete-task-record', deleteEventPayload(true))
          })
        } else {
          items.push({
            label: this.$t('task.delete-task'),
            click: () => commands.emit('delete-task', deleteEventPayload(false))
          })
          items.push({
            label: `${this.$t('task.delete-task')}（${this.$t('task.delete-task-label')}）`,
            click: () => commands.emit('delete-task', deleteEventPayload(true))
          })
        }

        return items
      },
      handleListBlankClick (e) {
        if (!e || e.target !== e.currentTarget) {
          return
        }
        if (typeof e.button === 'number' && e.button !== 0) {
          return
        }
        if (!this.selectedList || this.selectedList.length === 0) {
          return
        }
        this.selectedList = []
        this.$store.dispatch('task/selectTasks', [])
      },
      getItemClass (item) {
        const isSelected = this.selectedList.includes(item.gid)
        const completed = Number(item && item.completedLength ? item.completedLength : 0) || 0
        const total = Number(item && item.totalLength ? item.totalLength : 0) || 0
        const speed = Number(item && item.downloadSpeed ? item.downloadSpeed : 0) || 0
        const isIndeterminateProgress = (
          this.taskProgressMode === 'background' &&
          item &&
          item.status === TASK_STATUS.ACTIVE &&
          !(total > 0) &&
          speed > 0 &&
          completed >= 0
        )
        return {
          'task-item-wrapper': true,
          [`task-item-wrapper--${this.viewMode}`]: true,
          'task-item-wrapper--background-progress': this.taskProgressMode === 'background',
          'task-item-wrapper--indeterminate': isIndeterminateProgress,
          selected: isSelected
        }
      },
      getItemStyle (item) {
        if (this.taskProgressMode !== 'background') {
          return {}
        }

        // 使用与TaskProgress组件相同的进度计算逻辑
        const completed = Number(item.completedLength) || 0
        const total = Number(item.totalLength) || 0
        let progress = calcProgress(total, completed)

        // 根据任务状态调整进度
        const status = item.status
        if (status === TASK_STATUS.COMPLETE || status === TASK_STATUS.SEEDING) {
          progress = 100
        } else if (status === TASK_STATUS.ACTIVE && !(total > 0) && (Number(item.downloadSpeed) || 0) > 0) {
          progress = 30
        } else if (!Number.isFinite(progress)) {
          progress = 0
        } else if (progress < 0) {
          progress = 0
        } else if (progress > 100) {
          progress = 100
        }

        // 根据任务状态设置颜色，与colors.json保持一致
        let progressColor = '#5b5bea' // 默认active颜色

        switch (status) {
        case TASK_STATUS.COMPLETE:
          progressColor = '#2ACB42' // 绿色
          break
        case TASK_STATUS.SEEDING:
          progressColor = '#2ACB42' // 绿色，与complete相同
          break
        case TASK_STATUS.ACTIVE:
          progressColor = '#5b5bea' // 蓝紫色
          break
        case TASK_STATUS.PAUSED:
          progressColor = '#737373' // 灰色
          break
        case TASK_STATUS.WAITING:
          progressColor = '#737373' // 灰色
          break
        case TASK_STATUS.ERROR:
          progressColor = '#FF6157' // 红色
          break
        case TASK_STATUS.REMOVED:
          progressColor = '#737373' // 灰色
          break
        default:
          progressColor = '#5b5bea' // 默认active颜色
        }

        return {
          '--progress-width': `${progress}%`,
          '--progress-color': progressColor
        }
      }
    },
    watch: {
      selectedGidList (newVal) {
        this.selectedList = newVal
      }
    }
  }
</script>

<style lang="scss">
.task-list {
  padding: 16px 16px 64px 16px;
  min-height: 100%;
  box-sizing: border-box;

  // 列表视图（默认）
  &.task-list--list {
    .task-item-wrapper {
      margin-bottom: 8px;
      position: relative;
      z-index: 1;

      // 当有弹窗时提升层级
      &:hover {
        z-index: 50;
      }
    }
  }

  // 网格视图
  &.task-list--grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    grid-auto-rows: 110px; // 明确设置每行的高度
    row-gap: 8px; // 行间距与列表视图的margin-bottom保持完全一致
    column-gap: 16px; // 列间距（左右间隔）

    .task-item-wrapper {
      margin-bottom: 0;
      z-index: 1; // 确保网格项有合适的层级
      height: 110px; // 确保wrapper高度正确

      // 当有弹窗时提升层级
      &:hover {
        z-index: 50;
      }
    }
  }
}

.task-item-wrapper {
  transition: all 0.2s ease;

  &.task-item-wrapper--list {
    // 列表视图样式
    position: relative; // 确保背景进度条能正确定位
    border-radius: 6px; // 与TaskItem的圆角保持一致
    height: 110px; // 与网格视图保持完全一致的高度
    min-height: 110px; // 确保最小高度

    // 内容层
    & > .task-item {
      position: relative;
      z-index: 1;
      height: 110px; // 明确设置高度
      min-height: 110px; // 确保最小高度
      margin-bottom: 0; // 移除margin，由wrapper控制间距
      box-sizing: border-box; // 确保padding包含在高度内
    }
  }

  &.task-item-wrapper--grid {
    // 网格视图样式 - 主要作为进度条背景容器
    border-radius: 6px; // 与TaskItem的圆角保持一致
    overflow: visible; // 改为visible，让弹窗能够显示
    position: relative;
    height: 110px; // 固定高度，与列表视图一致

    // 内容层 - TaskItem会处理自己的样式
    & > .task-item {
      position: relative;
      z-index: 1;
      height: 110px; // 明确设置高度，不使用100%
      box-sizing: border-box;
      margin-bottom: 0; // 覆盖列表视图的margin-bottom
      overflow: visible; // 确保TaskItem内的弹窗能显示
    }
  }

  // 背景进度条模式 - 适用于列表和网格视图
  &.task-item-wrapper--background-progress {
    position: relative;
    border-radius: 6px; // 确保容器有圆角
    border: 1px solid $--task-item-border-color; // 添加边框
    overflow: visible; // 改为visible，让弹窗能够显示
    transition: $--border-transition-base; // 添加边框过渡效果

    &:hover {
      border-color: $--task-item-hover-border-color; // 悬停边框效果
      z-index: 10; // 悬停时提升层级，确保弹窗不被遮挡
    }

    // 进度条背景
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: var(--progress-color, #5b5bea);
      transition: width 0.3s ease, background-color 0.3s ease;
      z-index: 0;
      width: var(--progress-width, 0%);
      opacity: 0.3; // 降低透明度，让文字更清晰
      border-radius: 6px; // 直接设置圆角，确保进度条不超出容器
    }

    &.task-item-wrapper--indeterminate::before {
      transition: none;
      animation: mo-task-indeterminate 1.2s ease-in-out infinite;
    }

    // 确保内容在进度条之上
    & > .task-item {
      position: relative;
      z-index: 1;
      background: transparent; // 确保TaskItem背景透明，让进度条可见
      border: none; // 移除TaskItem的边框，由wrapper控制
    }
  }
}

@keyframes mo-task-indeterminate {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(410%);
  }
}

// 背景进度条模式下的选中状态
.task-item-wrapper--background-progress.selected {
  border-color: $--task-item-hover-border-color !important; // 选中时高亮边框
}

// 暗色主题支持
.theme-dark {
  .task-item-wrapper--grid {
    height: 110px; // 与亮色主题保持一致

    & > .task-item {
      height: 100%;
      box-sizing: border-box;
      margin-bottom: 0; // 覆盖列表视图的margin-bottom
    }
  }

  // 暗色主题下的背景进度条模式选中状态
  .task-item-wrapper--background-progress.selected {
    border-color: $--dk-task-item-hover-border-color !important; // 暗色主题的选中边框色
  }
}

.no-task {
  display: flex;
  height: 100%;
  text-align: center;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #666;
  user-select: none;
}
.no-task-inner {
  width: 100%;
  padding-top: 280px;
  background: transparent url('~@/assets/no-task.svg') top center no-repeat;
  background-size: 400px auto;
}
</style>
