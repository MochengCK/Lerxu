<template>
  <div
    class="floating-bar"
    :class="{ 'is-always-show': isAlwaysShow }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <el-tooltip
      effect="dark"
      :content="searchTitle"
      placement="top"
      :open-delay="500"
      :disabled="isSearchExpanded"
    >
      <button
        :class="['floating-bar-search', { 'is-expanded': isSearchExpanded }]"
        @click="handleSearchTasks"
      >
        <input
          ref="bottomSearchInput"
          class="floating-bar-search-input"
          type="text"
          :placeholder="searchPlaceholder"
          v-model="bottomSearchValue"
          @click.stop
          @focus="handleSearchFocus"
          @blur="handleSearchBlur"
        >
        <i class="el-icon-search"></i>
      </button>
    </el-tooltip>
    <button
      class="floating-bar-sort-button"
      :class="{ 'is-active': isSortMenuVisible, 'is-search-expanded': isSearchExpanded }"
      @mouseenter="handleSortButtonMouseEnter"
      @mouseleave="handleSortButtonMouseLeave"
    >
      <mo-icon name="sort" width="18" height="18" />
      <div
        class="floating-bar-sort-menu"
        :class="{ 'is-visible': isSortMenuVisible }"
        @click.stop
        @mouseenter="handleSortMenuMouseEnter"
        @mouseleave="handleSortMenuMouseLeave"
      >
        <div
          v-for="option in sortOptions"
          :key="option.value"
          :class="['sort-menu-item', { 'is-selected': currentSortField === option.value }]"
          @click="handleSortOptionClick(option.value)"
        >
          <span class="sort-menu-item-text">{{ option.label }}</span>
          <span v-if="currentSortField === option.value" :class="['sort-arrow', sortOrder === 'asc' ? 'sort-arrow-up' : 'sort-arrow-down']"></span>
        </div>
      </div>
    </button>
    <div class="floating-bar-inner" :class="{ 'is-active': !!bottomSearchValue || shouldKeepActive || isSearchExpanded }" @mouseenter="handleInnerMouseEnter">
      <button
        class="floating-bar-item"
        title="添加任务"
        @click="handleAddTask"
      >
        <mo-icon name="menu-add" width="20" height="20" />
      </button>
      <div class="floating-bar-divider"></div>
      <button
        class="floating-bar-item"
        :class="{ disabled: !canPauseAllTasks }"
        :disabled="!canPauseAllTasks"
        title="暂停所有任务"
        @click="handlePauseAllTasks"
      >
        <mo-icon name="task-pause-line" width="20" height="20" />
      </button>
      <button
        class="floating-bar-item"
        :class="{ disabled: !canResumeAllTasks }"
        :disabled="!canResumeAllTasks"
        title="恢复所有任务"
        @click="handleResumeAllTasks"
      >
        <mo-icon name="task-start-line" width="20" height="20" />
      </button>
    </div>
  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import { ADD_TASK_TYPE } from '@shared/constants'
  import { commands } from '@/components/CommandManager/instance'
  import '@/components/Icons/menu-add'
  import '@/components/Icons/task-pause-line'
  import '@/components/Icons/task-start-line'
  import '@/components/Icons/sort'

  export default {
    name: 'mo-floating-bar',
    data () {
      return {
        isSearchExpanded: false,
        isInputFocused: false,
        isHovering: false,
        shouldKeepActive: false,
        previousRoutePath: '',
        isSortMenuVisible: false,
        sortButtonHover: false,
        sortMenuHover: false,
        sortMenuHideTimer: null,
        currentSortField: 'name',
        sortOrder: 'asc'
      }
    },
    mounted () {
      document.addEventListener('click', this.handleGlobalClick)
      this.loadSortState()
      this.$nextTick(() => {
        try {
          commands.emit('floating-bar:search-open', this.isAlwaysShow)
        } catch (e) {}
      })
    },
    beforeDestroy () {
      document.removeEventListener('click', this.handleGlobalClick)
    },
    computed: {
      ...mapState('app', {
        stat: state => state.stat
      }),
      ...mapState('task', {
        taskList: state => state.taskList,
        taskSearchKeyword: state => state.searchKeyword
      }),
      ...mapState('preference', {
        preferenceSearchKeyword: state => state.searchKeyword,
        config: state => state.config
      }),
      isPreferencePage () {
        return this.$route.path.startsWith('/preference')
      },
      searchPlaceholder () {
        return this.isPreferencePage ? this.$t('preferences.search-settings') : this.$t('task.search-tasks')
      },
      searchTitle () {
        return this.isPreferencePage ? this.$t('preferences.search-settings') : '搜索任务'
      },
      canPauseAllTasks () {
        // 暂停按钮在有活跃任务时可用
        return this.stat.numActive > 0
      },
      canResumeAllTasks () {
        // 恢复按钮在有可恢复的任务时可用（等待中或已暂停的任务，但不包括已完成的任务）
        // 由于全局统计中的numStopped包含了已暂停和已完成的任务，我们需要精确判断
        // 通过检查任务列表，只计算状态为WAITING或PAUSED的任务数量
        if (this.taskList.length === 0) {
          return false
        }

        const { TASK_STATUS } = require('@shared/constants')
        const resumableTasks = this.taskList.filter(task => {
          return task.status === TASK_STATUS.WAITING || task.status === TASK_STATUS.PAUSED
        })

        return resumableTasks.length > 0
      },
      bottomSearchValue: {
        get () {
          return this.isPreferencePage ? this.preferenceSearchKeyword : this.taskSearchKeyword
        },
        set (val) {
          if (this.isPreferencePage) {
            this.$store.dispatch('preference/updateSearchKeyword', val)
          } else {
            this.$store.dispatch('task/updateTaskSearchKeyword', val)
          }
          if (val) {
            this.shouldKeepActive = true
          }
        }
      },
      sortOptions () {
        return [
          { label: this.$t('task.sort-by-completed-time'), value: 'completedTime' },
          { label: this.$t('task.sort-by-remaining-time'), value: 'remainingTime' },
          { label: this.$t('task.sort-by-speed'), value: 'speed' },
          { label: this.$t('task.sort-by-size'), value: 'size' },
          { label: this.$t('task.sort-by-name'), value: 'name' }
        ]
      },
      floatingBarDisplayMode () {
        return this.config.floatingBarDisplayMode || 'hover'
      },
      isAlwaysShow () {
        return this.floatingBarDisplayMode === 'always'
      }
    },
    watch: {
      $route (to, from) {
        const wasPreferencePage = from.path.startsWith('/preference')
        const isNowPreferencePage = to.path.startsWith('/preference')

        if (wasPreferencePage && !isNowPreferencePage) {
          this.$store.dispatch('preference/updateSearchKeyword', '')
          this.$store.dispatch('task/updateTaskSearchKeyword', '')
        }
        if (this.isSearchExpanded) {
          this.shouldKeepActive = true
        }
        this.previousRoutePath = to.path
      },
      bottomSearchValue (val) {
        if (!val && !this.isHovering && !this.isInputFocused && !this.shouldKeepActive) {
          this.collapseSearch()
        }
      },
      isAlwaysShow (val) {
        try {
          commands.emit('floating-bar:search-open', !!val)
        } catch (e) {}
      }
    },
    methods: {
      handleAddTask () {
        this.$store.dispatch('app/showAddTaskDialog', ADD_TASK_TYPE.URI)
      },
      handlePauseAllTasks () {
        if (!this.canPauseAllTasks) return
        this.$store.dispatch('task/pauseAllTask')
          .then(() => {
            this.$msg.success(this.$t('task.pause-all-task-success'))
          })
          .catch(({ code }) => {
            if (code === 1) {
              this.$msg.error(this.$t('task.pause-all-task-fail'))
            }
          })
      },
      handleResumeAllTasks () {
        if (!this.canResumeAllTasks) return
        this.$store.dispatch('task/resumeAllTask')
          .then(() => {
            this.$msg.success(this.$t('task.resume-all-task-success'))
          })
          .catch(({ code }) => {
            if (code === 1) {
              this.$msg.error(this.$t('task.resume-all-task-fail'))
            }
          })
      },
      handleSearchTasks () {
        if (!this.isSearchExpanded) {
          this.isSearchExpanded = true
          try {
            commands.emit('floating-bar:search-expanded', true)
          } catch (e) {}
        }
        if (!this.isPreferencePage) {
          this.$router.push({
            path: '/task'
          }).catch(err => {
            console.log(err)
          })
        }
        this.$nextTick(() => {
          const input = this.$refs.bottomSearchInput
          if (input && input.focus) {
            input.focus()
          }
        })
      },
      handleSearchFocus () {
        this.isInputFocused = true
      },
      handleSearchBlur () {
        this.isInputFocused = false
      },
      handleMouseEnter () {
        this.isHovering = true
        try {
          commands.emit('floating-bar:search-open', true)
        } catch (e) {}
      },
      handleInnerMouseEnter () {
        if (this.isSearchExpanded && !this.bottomSearchValue) {
          if (this.isInputFocused) {
            this.$refs.bottomSearchInput.blur()
          }
          this.shouldKeepActive = false
          this.collapseSearch()
        }
      },
      handleMouseLeave () {
        this.isHovering = false
        if (this.bottomSearchValue || this.shouldKeepActive || this.isInputFocused) {
          return
        }
        this.collapseSearch()
      },
      handleGlobalClick (event) {
        const floatingBar = this.$el
        if (!floatingBar.contains(event.target)) {
          if (this.isSearchExpanded && !this.bottomSearchValue) {
            this.shouldKeepActive = false
            this.collapseSearch()
          }
        }
      },
      handleSortButtonMouseEnter () {
        this.sortButtonHover = true
        this.clearSortMenuHideTimer()
        this.isSortMenuVisible = true
      },
      handleSortButtonMouseLeave () {
        this.sortButtonHover = false
        this.startSortMenuHideTimer()
      },
      handleSortMenuMouseEnter () {
        this.sortMenuHover = true
        this.clearSortMenuHideTimer()
      },
      handleSortMenuMouseLeave () {
        this.sortMenuHover = false
        this.startSortMenuHideTimer()
      },
      startSortMenuHideTimer () {
        this.clearSortMenuHideTimer()
        this.sortMenuHideTimer = setTimeout(() => {
          if (!this.sortButtonHover && !this.sortMenuHover) {
            this.isSortMenuVisible = false
          }
        }, 50)
      },
      clearSortMenuHideTimer () {
        if (this.sortMenuHideTimer) {
          clearTimeout(this.sortMenuHideTimer)
          this.sortMenuHideTimer = null
        }
      },
      handleSortOptionClick (sortField) {
        if (this.currentSortField === sortField) {
          this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc'
        } else {
          this.currentSortField = sortField
          this.sortOrder = 'asc'
        }
        this.$store.dispatch('task/sortTasks', {
          field: this.currentSortField,
          order: this.sortOrder
        })
        this.saveSortState()
      },
      collapseSearch () {
        const shouldEmitClose = !this.isHovering && !this.bottomSearchValue && !this.isAlwaysShow

        this.isSearchExpanded = false

        try {
          commands.emit('floating-bar:search-expanded', false)
        } catch (e) {}

        if (shouldEmitClose) {
          try {
            commands.emit('floating-bar:search-open', false)
          } catch (e) {}
        }
      },
      saveSortState () {
        try {
          const sortState = {
            field: this.currentSortField,
            order: this.sortOrder
          }
          window.localStorage.setItem('taskSortState', JSON.stringify(sortState))
        } catch (e) {
          console.error('Failed to save sort state:', e)
        }
      },
      loadSortState () {
        try {
          const savedState = window.localStorage.getItem('taskSortState')
          if (savedState) {
            const sortState = JSON.parse(savedState)
            if (sortState.field && sortState.order) {
              this.currentSortField = sortState.field
              this.sortOrder = sortState.order
              this.$store.dispatch('task/sortTasks', {
                field: this.currentSortField,
                order: this.sortOrder
              })
            }
          } else {
            // 如果没有保存的状态，使用store中的默认状态
            this.currentSortField = this.$store.state.task.sortField
            this.sortOrder = this.$store.state.task.sortOrder
          }
        } catch (e) {
          console.error('Failed to load sort state:', e)
        }
      }
    }
  }
</script>

<style lang="scss">
  @import '~@/components/Theme/Variables';
  @import '~@/components/Theme/Light/Variables';

  .floating-bar {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    pointer-events: none;

    &.is-always-show {
      .floating-bar-inner {
        opacity: 1;
      }

      .floating-bar-search {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(-50%) translateX(35px);
      }

      .floating-bar-sort-button {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(-50%) translateX(-35px);
      }
    }

    .floating-bar-inner {
      position: relative;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 5px 10px;
      background-color: $--floating-bar-background;
      border: 1px solid $--speedometer-border-color;
      border-radius: 100px;
      pointer-events: auto;
      opacity: 0.5;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      width: 150px;
      height: 40px;
      box-sizing: border-box;

      &:hover, &.is-active {
        opacity: 1;
        border-color: $--speedometer-hover-border-color;
      }
    }

    .floating-bar-divider {
      width: 1px;
      height: 20px;
      background-color: $--floating-bar-divider-color;
      margin: 0 3px;
    }

    .floating-bar-item {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: none;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      transition: background-color 0.25s, opacity 0.25s;
      padding: 0;

      &:hover:not(.disabled) {
        background-color: $--floating-bar-item-hover-background;
      }

      &.disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
      }

      svg {
        color: $--floating-bar-item-color;
      }
    }

    .floating-bar-search {
      position: absolute;
      top: 50%;
      left: calc(50% + 10px);
      transform: translateY(-50%);
      width: 64px;
      height: 40px;
      border-radius: 0 24px 24px 0;
      border: 1px solid $--speedometer-border-color;
      background-color: $--task-item-action-verify-background;
      padding: 0;
      pointer-events: none;
      cursor: pointer;
      z-index: 2;
      opacity: 0;
      transition: width 0.15s ease-out, transform 0.15s ease-out, opacity 0.15s ease-out, background-color 0.15s;
      transition-delay: 0s;
      overflow: hidden;
      color: $--task-item-action-color;
      box-sizing: border-box;

      i {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 18px;
        color: $--floating-bar-item-color;
        z-index: 10;
      }
      .floating-bar-search-input {
        position: absolute;
        left: 32px;
        top: 0;
        height: 100%;
        width: 160px;
        border: none;
        outline: none;
        background-color: transparent;
        color: inherit;
        font-size: 12px;
        opacity: 0;
        transition: opacity 0.1s linear 0s;
      }
      &.is-expanded {
        width: 220px;
        transition-delay: 0s !important;
      }
      &.is-expanded .floating-bar-search-input {
        opacity: 1;
        transition: opacity 0.2s ease-out 0s;
      }

      &.is-expanded {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(-50%) translateX(35px);
      }

      &:hover {
        border-color: $--speedometer-hover-border-color;
        background-color: $--floating-bar-item-hover-background;
      }
    }

    &:hover .floating-bar-search {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(-50%) translateX(35px);
      transition-delay: 0s;
    }

    .floating-bar-sort-button {
      position: absolute;
      top: 50%;
      left: calc(50% - 74px);
      transform: translateY(-50%);
      width: 64px;
      height: 40px;
      border-radius: 24px 0 0 24px;
      border: 1px solid $--speedometer-border-color;
      background-color: $--task-item-action-verify-background;
      cursor: pointer;
      padding: 0;
      transition: transform 0.15s ease-out, opacity 0.15s ease-out, background-color 0.15s;
      transition-delay: 0s;
      opacity: 0;
      pointer-events: none;
      z-index: 2;
      color: $--task-item-action-color;
      box-sizing: border-box;

      .mo-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: $--floating-bar-item-color;
        z-index: 10;
      }

      &:hover {
        border-color: $--speedometer-hover-border-color;
        background-color: $--floating-bar-item-hover-background;
      }

      &.is-active {
        pointer-events: auto;
      }

      .floating-bar-sort-menu {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 35%;
        transform: translateX(-50%);
        z-index: 10;
        min-width: 90px;
        max-width: 110px;
        padding: 4px 0;
        border-radius: 4px;
        background-color: #fff;
        border: 1px solid $--border-color-light;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        opacity: 0;
        transition: opacity 0.12s ease-out;
        pointer-events: none;

        &.is-visible {
          opacity: 1;
          pointer-events: auto;
        }

        &::before {
          content: '';
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 6px 6px 0 6px;
          border-color: #fff transparent transparent transparent;
          bottom: -6px;
        }

        &::after {
          content: '';
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 100px;
          height: 8px;
          bottom: -8px;
          background: transparent;
        }

        .sort-menu-item {
          padding: 4px 8px 4px 8px;
          font-size: 12px;
          color: $--color-text-regular;
          white-space: nowrap;
          cursor: pointer;
          display: flex;
          align-items: center;
          width: 100%;
          box-sizing: border-box;

          &:hover {
            background-color: $--color-primary;
            color: #fff;
          }

          &.is-selected {
            color: $--color-primary;
          }

          &:hover.is-selected {
            color: #fff;
          }

          .sort-menu-item-text {
            font-size: 12px;
            flex-shrink: 0;
          }

          .sort-arrow {
            margin-left: auto;
            flex-shrink: 0;
            width: 0;
            height: 0;
            border-style: solid;
          }

          .sort-arrow-up {
            border-width: 0 4px 5px 4px;
            border-color: transparent transparent currentColor transparent;
          }

          .sort-arrow-down {
            border-width: 5px 4px 0 4px;
            border-color: currentColor transparent transparent transparent;
          }
        }
      }
    }

    &:hover .floating-bar-sort-button {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(-50%) translateX(-35px);
      transition-delay: 0s;
    }

    &:hover .floating-bar-inner {
      opacity: 1;
      border-color: $--speedometer-hover-border-color;
    }
  }

  .theme-dark {
    .floating-bar-sort-button {
      .floating-bar-sort-menu {
        background-color: $--dk-popover-background;
        border-color: $--dk-popover-border-color;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);

        &::before {
          border-color: $--dk-popover-background transparent transparent transparent;
        }

        .sort-menu-item {
          color: $--dk-dialog-text-color;

          &:hover {
            background-color: $--color-primary;
            color: #fff;
          }

          &.is-selected {
            color: $--color-primary;
          }

          &:hover.is-selected {
            color: #fff;
          }
        }
      }
    }
  }

  .theme-light {
    .floating-bar-inner,
    .floating-bar-search,
    .floating-bar-sort-button {
      background-color: rgba(255, 255, 255, 0.5);
    }

    .floating-bar-sort-button .floating-bar-sort-menu {
      background-color: rgba(255, 255, 255, 1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);

      &::before {
        border-color: rgba(255, 255, 255, 1) transparent transparent transparent;
      }
    }

    .floating-bar:hover .floating-bar-inner,
    .floating-bar .floating-bar-inner.is-active,
    .floating-bar .floating-bar-search:hover,
    .floating-bar .floating-bar-search.is-expanded,
    .floating-bar .floating-bar-sort-button:hover,
    .floating-bar .floating-bar-sort-button.is-active {
      background-color: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .floating-bar.is-always-show .floating-bar-inner,
    .floating-bar.is-always-show .floating-bar-search,
    .floating-bar.is-always-show .floating-bar-sort-button {
      background-color: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
  }

  .theme-dark {
    .floating-bar-inner,
    .floating-bar-search,
    .floating-bar-sort-button {
      background-color: rgba(45, 45, 45, 0.5);
    }

    .floating-bar-sort-button .floating-bar-sort-menu {
      background-color: rgba(45, 45, 45, 1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);

      &::before {
        border-color: rgba(45, 45, 45, 1) transparent transparent transparent;
      }
    }

    .floating-bar:hover .floating-bar-inner,
    .floating-bar .floating-bar-inner.is-active,
    .floating-bar .floating-bar-search:hover,
    .floating-bar .floating-bar-search.is-expanded,
    .floating-bar .floating-bar-sort-button:hover,
    .floating-bar .floating-bar-sort-button.is-active {
      background-color: rgba(45, 45, 45, 0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .floating-bar.is-always-show .floating-bar-inner,
    .floating-bar.is-always-show .floating-bar-search,
    .floating-bar.is-always-show .floating-bar-sort-button {
      background-color: rgba(45, 45, 45, 0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
  }

</style>
