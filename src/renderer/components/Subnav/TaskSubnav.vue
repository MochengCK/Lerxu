<template>
  <nav class="subnav-inner task-subnav">
    <ul class="task-nav-list">
      <li
        @click="() => nav('all')"
        :class="[ current === 'all' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="menu-task" width="20" height="20" />
        </i>
        <span>{{ $t('task.all') }}</span>
        <span class="subnav-count">{{ taskCounts.all }}</span>
      </li>
      <li
        @click="() => nav('active')"
        :class="[ current === 'active' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="task-start" width="20" height="20" />
        </i>
        <span>{{ $t('task.active') }}</span>
        <span class="subnav-count">{{ taskCounts.active }}</span>
      </li>
      <li
        @click="() => nav('waiting')"
        :class="[ current === 'waiting' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="task-pause" width="20" height="20" />
        </i>
        <span>{{ $t('task.waiting') }}</span>
        <span class="subnav-count">{{ taskCounts.waiting }}</span>
      </li>
      <li
        @click="() => nav('stopped')"
        :class="[ current === 'stopped' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="task-stop" width="20" height="20" />
        </i>
        <span>{{ $t('task.stopped') }}</span>
        <span class="subnav-count">{{ taskCounts.stopped }}</span>
      </li>
    </ul>
    <ul class="preference-nav-list">
      <li
        class="preference-item"
        @click="openPreference"
      >
        <i class="subnav-icon">
          <mo-icon name="menu-preference" width="20" height="20" />
        </i>
        <span>{{ $t('subnav.preferences') }}</span>
      </li>
    </ul>
  </nav>
</template>

<script>
  import { mapGetters } from 'vuex'
  import '@/components/Icons/menu-task'
  import '@/components/Icons/task-start'
  import '@/components/Icons/task-pause'
  import '@/components/Icons/task-stop'
  import '@/components/Icons/menu-preference'

  export default {
    name: 'mo-task-subnav',
    props: {
      current: {
        type: String,
        default: 'all'
      }
    },
    computed: {
      title () {
        return this.$t('subnav.task-list')
      },
      ...mapGetters('task', {
        taskCounts: 'filteredTaskCounts'
      })
    },
    methods: {
      nav (status = 'active') {
        this.$router.push({
          path: `/task/${status}`
        }).catch(err => {
          console.log(err)
        })
      },
      openPreference () {
        this.$electron.ipcRenderer.send('open-preference-window')
      }
    }
  }
</script>

<style lang="scss">
// 自定义标题栏和原生标题栏模式下，subnav 的 margin-top 统一与
// .panel-header 的 padding-top (44px) 对齐，确保侧边栏首项与功能区标题同行
.subnav-inner.task-subnav {
  margin-top: 44px;
  padding-bottom: 20px;
  display: flex;
  flex-direction: column;
  height: calc(100% - 44px);

  .task-nav-list {
    flex: 1;
  }
}

// auto-hide-aside 模式下，侧边栏高度为 auto，不强制占满
.subnav.three-column-subnav.is-auto-hide-aside .subnav-inner.task-subnav {
  height: auto;
}

#app:not(.has-custom-titlebar) .subnav-inner.task-subnav {
  margin-top: 44px;
}

.subnav-inner {
  li.subnav-divider {
    display: block;
    width: auto;
    height: 1px;
    margin: 8px 10px;
    padding: 0;
    line-height: 0;
    background-color: rgba(0, 0, 0, 0.25);
    cursor: default;
    pointer-events: none;

    &:hover {
      background-color: rgba(0, 0, 0, 0.25) !important;
    }
  }
}
.theme-dark .subnav-inner li.subnav-divider {
  background-color: rgba(255, 255, 255, 0.25);
  &:hover {
    background-color: rgba(255, 255, 255, 0.25) !important;
  }
}

// 任务分类右侧数量徽标
.subnav-inner .subnav-count {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 18px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  color: inherit;
  opacity: 0.7;
  transition: opacity 0.25s;
  pointer-events: none;
}

.subnav-inner ul li.active .subnav-count,
.subnav-inner ul li:hover .subnav-count {
  opacity: 1;
}
</style>
