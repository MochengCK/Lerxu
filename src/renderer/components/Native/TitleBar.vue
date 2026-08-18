<template>
  <div class="title-bar">
    <div
      v-if="showActions"
      class="title-bar-logo"
      :class="{ 'is-open': logoMenuVisible }"
      @click.stop="toggleLogoMenu"
    >
      <span class="title-bar-logo__text">
        <span class="title-bar-logo__text-strong">Link</span><span class="title-bar-logo__text-soft">Core</span>
      </span>
      <svg class="title-bar-logo__chevron" viewBox="0 0 12 12" aria-hidden="true">
        <path class="title-bar-logo__chevron-path" d="M2.5 4.5L6 8l3.5-3.5" />
      </svg>
      <transition name="popup-scale">
        <div v-if="logoMenuVisible" class="title-bar-logo__menu" @click.stop>
          <div
            v-for="menu in menuBarItems"
            :key="menu.id"
            class="title-bar-logo__menu-item"
            :class="{ 'is-active': activeMenu === menu.id }"
            @mouseenter="activeMenu = menu.id"
            @mouseleave="handleMenuMouseLeave"
            @click="activeMenu = menu.id"
          >
            <span>{{ menu.label }}</span>
            <svg class="title-bar-logo__menu-item-arrow" viewBox="0 0 12 12" aria-hidden="true">
              <path class="title-bar-logo__menu-item-arrow-path" d="M4.5 2.5L8 6l-3.5 3.5" />
            </svg>
            <transition name="submenu-pop">
              <div
                v-if="activeMenu === menu.id && menu.items.length"
                class="title-bar-logo__submenu"
                @mouseleave="handleSubmenuMouseLeave"
              >
                <template v-for="(item, index) in menu.items">
                  <div v-if="item.separator" :key="`sep-${index}`" class="title-bar-logo__submenu-separator"></div>
                  <div
                    v-else
                    :key="`${menu.id}-${index}`"
                    class="title-bar-logo__submenu-item"
                    @click="handleMenuAction(item)"
                  >
                    <span>{{ item.label }}</span>
                  </div>
                </template>
              </div>
            </transition>
          </div>
          <div class="title-bar-logo__menu-footer">
            <div class="title-bar-logo__separator"></div>
            <div class="title-bar-logo__menu-item" @click="handleMenuAction({ command: 'application:quit' })">
              <span>{{ $t('app.quit') }}</span>
            </div>
          </div>
        </div>
      </transition>
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
  import { commands } from '@/components/CommandManager/instance'
  import '@/components/Icons/win-minimize'
  import '@/components/Icons/win-maximize'
  import '@/components/Icons/win-close'

  export default {
    name: 'mo-title-bar',
    props: {
      showActions: {
        type: Boolean
      }
    },
    data () {
      return {
        logoMenuVisible: false,
        activeMenu: ''
      }
    },
    computed: {
      win () {
        return getCurrentWindow()
      },
      menuBarItems () {
        return [
          {
            id: 'file',
            label: this.$t('menu.file'),
            items: [
              { label: this.$t('app.preferences'), command: 'application:preferences' },
              { label: this.$t('app.check-for-updates'), command: 'application:check-for-updates' },
              { label: this.$t('app.show'), command: 'application:show' },
              { separator: true },
              { label: this.$t('app.quit'), command: 'application:quit' }
            ]
          },
          {
            id: 'task',
            label: this.$t('menu.task'),
            items: [
              { label: this.$t('task.new-task'), command: 'application:new-task' },
              { label: this.$t('task.new-bt-task'), command: 'application:new-bt-task' },
              { label: this.$t('task.open-file'), command: 'application:open-file' },
              { separator: true },
              { label: this.$t('app.task-list'), command: 'application:task-list' },
              { label: this.$t('task.pause-task'), command: 'application:pause-task' },
              { label: this.$t('task.resume-task'), command: 'application:resume-task' },
              { label: this.$t('task.delete-task'), command: 'application:delete-task' },
              { label: this.$t('task.move-task-up'), command: 'application:move-task-up' },
              { label: this.$t('task.move-task-down'), command: 'application:move-task-down' },
              { separator: true },
              { label: this.$t('task.pause-all-task'), command: 'application:pause-all-task' },
              { label: this.$t('task.resume-all-task'), command: 'application:resume-all-task' },
              { label: this.$t('task.select-all-task'), command: 'application:select-all-task' },
              { separator: true },
              { label: this.$t('task.clear-recent-tasks'), command: 'application:clear-recent-tasks' }
            ]
          },
          {
            id: 'edit',
            label: this.$t('menu.edit'),
            items: [
              { label: this.$t('edit.undo'), role: 'undo' },
              { label: this.$t('edit.redo'), role: 'redo' },
              { separator: true },
              { label: this.$t('edit.cut'), role: 'cut' },
              { label: this.$t('edit.copy'), role: 'copy' },
              { label: this.$t('edit.paste'), role: 'paste' },
              { label: this.$t('edit.delete'), role: 'delete' },
              { label: this.$t('edit.select-all'), role: 'selectall' }
            ]
          },
          {
            id: 'window',
            label: this.$t('menu.window'),
            items: [
              { label: this.$t('window.reload'), role: 'reload' },
              { label: this.$t('window.close'), role: 'close' },
              { label: this.$t('window.minimize'), role: 'minimize' },
              { label: this.$t('window.zoom'), role: 'zoom' },
              { label: this.$t('window.toggle-fullscreen'), role: 'togglefullscreen' },
              { separator: true },
              { label: this.$t('window.front'), role: 'front' }
            ]
          },
          {
            id: 'help',
            label: this.$t('menu.help'),
            items: [
              { label: this.$t('help.official-website'), command: 'help:official-website' },
              { label: this.$t('help.release-notes'), command: 'help:release-notes' },
              { separator: true },
              { label: this.$t('help.report-problem'), command: 'help:report-problem' },
              { separator: true },
              { label: this.$t('help.toggle-dev-tools'), role: 'toggledevtools' }
            ]
          }
        ]
      }
    },
    mounted () {
      this.handleDocumentClick = () => {
        if (this.logoMenuVisible) {
          this.logoMenuVisible = false
        }
      }
      document.addEventListener('click', this.handleDocumentClick)
      this.observeAppClass()
    },
    beforeDestroy () {
      if (this.handleDocumentClick) {
        document.removeEventListener('click', this.handleDocumentClick)
      }
      if (this._appObserver) {
        this._appObserver.disconnect()
        this._appObserver = null
      }
    },
    methods: {
      // 新建任务/任务详情/任务计划弹窗打开时强制收起 logo 菜单，
      // 避免关闭弹窗后 logo 恢复显示时仍带着 is-open 背景
      observeAppClass () {
        const appEl = document.getElementById('app')
        if (!appEl) return
        const modalFlags = ['is-add-task-open', 'is-task-detail-open', 'is-task-plan-open']
        this._appObserver = new MutationObserver(() => {
          if (modalFlags.some(cls => appEl.classList.contains(cls))) {
            this.logoMenuVisible = false
            this.activeMenu = ''
          }
        })
        this._appObserver.observe(appEl, { attributes: true, attributeFilter: ['class'] })
      },
      toggleLogoMenu () {
        this.logoMenuVisible = !this.logoMenuVisible
      },
      handleMenuMouseLeave (e) {
        // 移向二级弹窗内部时保持展开，否则自动收起
        const toEl = e.relatedTarget
        if (toEl && toEl.closest && toEl.closest('.title-bar-logo__submenu')) {
          return
        }
        this.activeMenu = ''
      },
      handleSubmenuMouseLeave (e) {
        // 移回一级菜单项时交由 hover 切换，否则自动收起
        const toEl = e.relatedTarget
        if (toEl && toEl.closest && toEl.closest('.title-bar-logo__menu-item')) {
          return
        }
        this.activeMenu = ''
      },
      handleMenuAction (item) {
        this.logoMenuVisible = false
        if (item.command) {
          // 渲染进程未注册的命令（如 application:quit）转发给主进程处理
          if (!commands.execute(item.command)) {
            this.$electron.ipcRenderer.send('command', item.command)
          }
          return
        }
        const win = this.win
        switch (item.role) {
        case 'undo':
          document.execCommand('undo')
          break
        case 'redo':
          document.execCommand('redo')
          break
        case 'cut':
          document.execCommand('cut')
          break
        case 'copy':
          document.execCommand('copy')
          break
        case 'paste':
          document.execCommand('paste')
          break
        case 'delete':
          document.execCommand('delete')
          break
        case 'selectall':
          document.execCommand('selectAll')
          break
        case 'reload':
          win.webContents.reload()
          break
        case 'close':
          win.close()
          break
        case 'minimize':
          win.minimize()
          break
        case 'zoom':
          if (win.isMaximized()) {
            win.unmaximize()
          } else {
            win.maximize()
          }
          break
        case 'togglefullscreen':
          win.setFullScreen(!win.isFullScreen())
          break
        case 'front':
          win.moveTop()
          break
        case 'toggledevtools':
          win.webContents.toggleDevTools()
          break
        }
      },
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
/* Windows/Linux 自定义标题栏下，窗口控制按钮占 38px 高，
   hover 高亮区域比原生略大，按钮贴顶无间距 */
.has-custom-titlebar .title-bar .window-actions {
  height: 38px;
  align-self: flex-start;
}

/* Windows/Linux 自定义标题栏下的应用 logo：贴左上角的文字字标 + 下拉箭头，
   放大字标并下移留出顶部间距，点击弹出快捷操作菜单；
   悬停背景为内嵌圆角色块，四周留边不贴按钮边缘 */
.has-custom-titlebar .title-bar .title-bar-logo {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  align-self: flex-start;
  margin-left: 6px;
  margin-top: 4px;
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  user-select: none;

  &::before {
    content: '';
    position: absolute;
    inset: 5px;
    border-radius: 8px;
    background-color: transparent;
    transition: background-color 0.2s ease;
  }

  /* 浅色模式下 --lc-bg-hover 与主背景同色（#f0f4f8），改用深色半透明保证可见 */
  &:hover::before,
  &.is-open::before {
    background-color: rgba(26, 35, 50, 0.1);
  }

  &__text {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: baseline;
    margin-top: -1px;
    font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.2px;
    line-height: 1;
    color: var(--lc-color-primary);
  }

  &__text-strong {
    font-weight: 800;
  }

  &__text-soft {
    font-weight: 600;
    opacity: 0.72;
  }

  &__chevron {
    position: relative;
    z-index: 1;
    width: 10px;
    height: 10px;
    display: block;
    align-self: center;
    margin-top: 0px;
    transition: transform 0.2s ease;
  }

  &.is-open .title-bar-logo__chevron {
    transform: rotate(180deg);
  }

  &__chevron-path {
    fill: none;
    stroke: var(--lc-text-secondary);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &__menu {
    position: absolute;
    top: 42px;
    left: 6px;
    min-width: 160px;
    padding: 4px;
    border-radius: var(--lc-radius-dropdown);
    background-color: var(--lc-bg-popover);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
    z-index: 5200;
    pointer-events: auto;
    -webkit-app-region: no-drag;
  }

  /* 一级菜单：垂直排列，带二级菜单的项右侧显示向右箭头 */
  &__menu-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 16px;
    color: var(--lc-text-primary);
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
    transition: background-color 0.15s ease, color 0.15s ease;

    &:hover,
    &.is-active {
      color: var(--lc-text-primary);
      background-color: var(--lc-bg-hover);
    }
  }

  &__menu-item-arrow {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    display: block;
    opacity: 0.7;
  }

  &__menu-item-arrow-path {
    fill: none;
    stroke: var(--lc-text-secondary);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* 二级菜单：跟随所悬停的一级项在其右侧无缝展开 */
  &__submenu {
    position: absolute;
    top: -4px;
    left: 100%;
    min-width: 176px;
    padding: 4px;
    border-radius: var(--lc-radius-dropdown);
    background-color: var(--lc-bg-popover);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
    max-height: 400px;
    overflow-y: auto;
  }

  &__submenu-item {
    display: flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 16px;
    color: var(--lc-text-primary);
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
    transition: background-color 0.15s ease;

    &:hover {
      background-color: var(--lc-bg-hover);
    }
  }

  &__submenu-separator {
    height: 1px;
    margin: 4px 8px;
    background-color: var(--lc-border-lighter);
  }

  &__menu-footer {
    padding: 2px 0 2px;
  }

  &__separator {
    height: 1px;
    margin: 4px 10px;
    background-color: var(--lc-border-lighter);
  }
}

/* 二级弹窗过渡动画：从所属一级项放大打开，缩小关闭（锚点为左侧） */
.submenu-pop-enter-active,
.submenu-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: left center;
}
.submenu-pop-enter {
  opacity: 0;
  transform: scale(0.85);
}
.submenu-pop-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

/* 深色模式：半透明深色在深色背景上不可见，恢复使用主题 hover 变量 */
.theme-dark .has-custom-titlebar .title-bar .title-bar-logo {
  &:hover::before,
  &.is-open::before {
    background-color: var(--lc-bg-hover);
  }
}

/* 偏好设置窗口不显示应用 logo（仅保留拖动区与窗口控制按钮） */
.is-preference-window .title-bar .title-bar-logo {
  display: none;
}

/* Windows/Linux 关闭自定义标题栏（使用系统原生标题栏/菜单栏）时，
   系统标题栏已提供拖动能力：禁用透明 title-bar 的拖动层，
   否则贴顶后的任务面板头部（搜索框/工具栏）会被 42px 拖动层遮挡无法点击 */
#app:not(.has-custom-titlebar):not(.is-mac) .title-bar .title-bar-dragger {
  -webkit-app-region: no-drag;
  pointer-events: none;
}
.has-custom-titlebar .title-bar .title-bar-title {
  margin-left: 16px;
  @media only screen and (min-width: 568px) {
    margin-left: 36px;
  }
}

/* 三栏式布局下，标题栏文字与任务卡片左侧对齐 */
.has-three-column-layout .title-bar .title-bar-title {
  margin-left: calc(200px + 6px + 6px); /* 侧边栏宽度 + task-list padding + task-item padding */
  transition: margin-left 0.35s cubic-bezier(0.22, 1, 0.36, 1); /* 与侧边栏动画同步 */
  @media only screen and (min-width: 568px) {
    margin-left: calc(200px + 6px + 6px);
  }
}

/* 三栏式布局下，当侧边栏自动隐藏且未悬停时，标题栏文字位置与悬浮模式一致 */
.has-three-column-layout.is-aside-auto-hide:not(.is-aside-hovered) .title-bar .title-bar-title {
  margin-left: 16px; /* 与悬浮模式保持一致 */
  @media only screen and (min-width: 568px) {
    margin-left: 36px; /* 与悬浮模式保持一致 */
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

/* 打开新建任务/任务详情/任务计划弹窗时隐藏左上角 logo，避免其浮在弹窗之上 */
.is-task-detail-open .title-bar .title-bar-logo,
.is-add-task-open .title-bar .title-bar-logo,
.is-task-plan-open .title-bar .title-bar-logo {
  display: none;
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

/* macOS 原生透明背景开启时：偏好设置窗口标题栏恢复模糊效果，
   覆盖上面的 backdrop-filter: none */
html.mac-native-transparent .is-preference-window .title-bar {
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
}

@media only screen and (min-width: 568px) {
  .title-bar {
    .title-bar-title {
      margin-left: 36px;
    }
  }
}
</style>
