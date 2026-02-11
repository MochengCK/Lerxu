<template>
  <nav class="subnav-inner task-subnav">
    <ul>
      <li
        @click="() => nav('all')"
        :class="[ current === 'all' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="menu-task" width="20" height="20" />
        </i>
        <span>{{ $t('task.all') }}</span>
      </li>
      <li
        @click="() => nav('active')"
        :class="[ current === 'active' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="task-start" width="20" height="20" />
        </i>
        <span>{{ $t('task.active') }}</span>
      </li>
      <li
        @click="() => nav('waiting')"
        :class="[ current === 'waiting' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="task-pause" width="20" height="20" />
        </i>
        <span>{{ $t('task.waiting') }}</span>
      </li>
      <li
        @click="() => nav('stopped')"
        :class="[ current === 'stopped' ? 'active' : '' ]"
      >
        <i class="subnav-icon">
          <mo-icon name="task-stop" width="20" height="20" />
        </i>
        <span>{{ $t('task.stopped') }}</span>
      </li>
      <li class="subnav-divider"></li>
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
      }
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
.subnav-inner.task-subnav {
  margin-top: 12px;
}

.subnav-inner {
  li.subnav-divider {
    display: block;
    width: auto;
    height: 1px;
    margin: 8px -20px 8px 30px;
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
</style>
