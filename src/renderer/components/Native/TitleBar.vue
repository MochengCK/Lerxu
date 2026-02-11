<template>
  <div class="title-bar">
    <div v-if="titleText" class="title-bar-title">
      <span class="title-bar-title__text">{{ titleText }}</span>
    </div>
    <div class="title-bar-dragger"></div>
    <ul v-if="showActions" class="window-actions">
      <li @click="handleMinimize">
        <mo-icon name="win-minimize" width="12" height="12" />
      </li>
      <li @click="handleMaximize">
        <mo-icon name="win-maximize" width="12" height="12" />
      </li>
      <li @click="handleClose" class="win-close-btn">
        <mo-icon name="win-close" width="12" height="12" />
      </li>
    </ul>
  </div>
</template>

<script>
  import { getCurrentWindow } from '@electron/remote'
  import '@/components/Icons/win-minimize'
  import '@/components/Icons/win-maximize'
  import '@/components/Icons/win-close'

  export default {
    name: 'mo-title-bar',
    props: {
      showActions: {
        type: Boolean
      },
      titleText: {
        type: String,
        default: ''
      }
    },
    computed: {
      win () {
        return getCurrentWindow()
      }
    },
    methods: {
      handleMinimize () {
        this.win.minimize()
      },
      handleMaximize () {
        if (this.win.isMaximized()) {
          this.win.unmaximize()
        } else {
          this.win.maximize()
        }
      },
      handleClose () {
        this.win.close()
      }
    }
  }
</script>

<style lang="scss">
.title-bar {
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 42px;
  background: transparent;
  background-color: transparent;
  isolation: isolate;
  z-index: 5000;
  pointer-events: none;
  .title-bar-dragger {
    margin: 0;
    flex: 1;
    user-select: none;
    -webkit-app-region: drag;
    -webkit-user-select: none;
    pointer-events: auto;
  }
  .title-bar-title {
    display: flex;
    align-items: center;
    max-width: 320px;
    margin-left: 16px;
    margin-top: 6px;
    height: 30px;
    pointer-events: auto;
    -webkit-app-region: drag;
    color: $--titlebar-actions-color;
    font-size: 16px;
    font-weight: 500;
    @media only screen and (min-width: 568px) {
      margin-left: 36px;
    }
  }
  .title-bar-title__text {
    display: block;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .window-actions {
    opacity: 0.4;
    transition: $--fade-transition;
    list-style: none;
    padding: 0;
    margin: 0;
    z-index: 5100;
    font-size: 0;
    pointer-events: auto;
    -webkit-app-region: no-drag;
    display: flex;
    align-items: stretch;
    height: 42px;
    &:hover {
      opacity: 1;
    }
    > li {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 18px;
      height: 100%;
      font-size: 16px;
      margin: 0;
      color: $--titlebar-actions-color;
      -webkit-app-region: no-drag;
      &:hover {
        background-color: $--titlebar-actions-active-background;
      }
      &.win-close-btn:hover {
        color: $--titlebar-close-active-color;
        background-color: $--titlebar-close-active-background;
      }
    }
  }
}
.has-custom-titlebar .title-bar .title-bar-dragger {
  margin-left: 0;
}
.has-custom-titlebar .title-bar .title-bar-title {
  margin-left: 16px;
  @media only screen and (min-width: 568px) {
    margin-left: 36px;
  }
}

.show-window-actions .title-bar {
  background: transparent;
  background-color: transparent;
}

.is-task-detail-open .title-bar {
  z-index: 5000;
}
.is-add-task-open .title-bar,
.is-task-plan-open .title-bar {
  z-index: 5000;
}

.is-task-detail-open.show-window-actions .title-bar,
.is-add-task-open.show-window-actions .title-bar,
.is-task-plan-open.show-window-actions .title-bar {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.is-task-detail-open .title-bar .title-bar-title,
.is-add-task-open .title-bar .title-bar-title,
.is-task-plan-open .title-bar .title-bar-title {
  opacity: 0.4;
}

.is-task-detail-open.show-window-actions .title-bar::before,
.is-add-task-open.show-window-actions .title-bar::before,
.is-task-plan-open.show-window-actions .title-bar::before {
  display: none;
}

.is-task-detail-open .title-bar:hover .window-actions,
.is-add-task-open .title-bar:hover .window-actions,
.is-task-plan-open .title-bar:hover .window-actions {
  opacity: 0.4;
}

.is-task-detail-open .title-bar .window-actions:hover,
.is-add-task-open .title-bar .window-actions:hover,
.is-task-plan-open .title-bar .window-actions:hover {
  opacity: 1;
}

.is-preference-window .title-bar .title-bar-dragger {
  margin-left: 220px;
}

.is-preference-window .title-bar {
  background: transparent;
  background-color: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-bottom: none;
}

@media only screen and (min-width: 568px) {
  .title-bar {
    .title-bar-title {
      margin-left: 36px;
    }
  }
}
</style>
