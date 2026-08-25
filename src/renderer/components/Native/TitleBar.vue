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
              <span>{{ t('app.quit') }}</span>
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

<script setup>
// Options API 父组件通过 [TitleBar.name]: TitleBar 注册，必须有 name
defineOptions({ name: 'mo-title-bar' })

import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import i18n from '@/plugins/i18n' // vue-i18n legacy 模式下 useI18n() 会抛错，直接用共享实例
import { getCurrentWindow } from '@electron/remote'
import { ipcRenderer } from 'electron'
import { commands } from '@/components/CommandManager/instance'
import '@/components/Icons/win-minimize'
import '@/components/Icons/win-maximize'
import '@/components/Icons/win-close'

defineProps({
  showActions: {
    type: Boolean
  }
})

const { t } = i18n.global

const logoMenuVisible = ref(false)
const activeMenu = ref('')

const win = computed(() => getCurrentWindow())

const menuBarItems = computed(() => [
  {
    id: 'file',
    label: t('menu.file'),
    items: [
      { label: t('app.preferences'), command: 'application:preferences' },
      { label: t('app.check-for-updates'), command: 'application:check-for-updates' },
      { label: t('app.show'), command: 'application:show' },
      { separator: true },
      { label: t('app.quit'), command: 'application:quit' }
    ]
  },
  {
    id: 'task',
    label: t('menu.task'),
    items: [
      { label: t('task.new-task'), command: 'application:new-task' },
      { label: t('task.new-bt-task'), command: 'application:new-bt-task' },
      { label: t('task.open-torrent-file'), command: 'application:open-file' },
      { separator: true },
      { label: t('app.task-list'), command: 'application:task-list' },
      { label: t('task.pause-task'), command: 'application:pause-task' },
      { label: t('task.resume-task'), command: 'application:resume-task' },
      { label: t('task.delete-task'), command: 'application:delete-task' },
      { label: t('task.move-task-up'), command: 'application:move-task-up' },
      { label: t('task.move-task-down'), command: 'application:move-task-down' },
      { separator: true },
      { label: t('task.pause-all-task'), command: 'application:pause-all-task' },
      { label: t('task.resume-all-task'), command: 'application:resume-all-task' },
      { label: t('task.select-all-task'), command: 'application:select-all-task' },
      { separator: true },
      { label: t('task.clear-recent-tasks'), command: 'application:clear-recent-tasks' }
    ]
  },
  {
    id: 'edit',
    label: t('menu.edit'),
    items: [
      { label: t('edit.undo'), role: 'undo' },
      { label: t('edit.redo'), role: 'redo' },
      { separator: true },
      { label: t('edit.cut'), role: 'cut' },
      { label: t('edit.copy'), role: 'copy' },
      { label: t('edit.paste'), role: 'paste' },
      { label: t('edit.delete'), role: 'delete' },
      { label: t('edit.select-all'), role: 'selectall' }
    ]
  },
  {
    id: 'window',
    label: t('menu.window'),
    items: [
      { label: t('window.reload'), role: 'reload' },
      { label: t('window.close'), role: 'close' },
      { label: t('window.minimize'), role: 'minimize' },
      { label: t('window.zoom'), role: 'zoom' },
      { label: t('window.toggle-fullscreen'), role: 'togglefullscreen' },
      { separator: true },
      { label: t('window.front'), role: 'front' }
    ]
  },
  {
    id: 'help',
    label: t('menu.help'),
    items: [
      { label: t('help.official-website'), command: 'help:official-website' },
      { label: t('help.release-notes'), command: 'help:release-notes' },
      { separator: true },
      { label: t('help.report-problem'), command: 'help:report-problem' },
      { separator: true },
      { label: t('help.toggle-dev-tools'), role: 'toggledevtools' }
    ]
  }
])

let _handleDocumentClick = null
let _appObserver = null

const observeAppClass = () => {
  const appEl = document.getElementById('app')
  if (!appEl) return
  const modalFlags = ['is-add-task-open', 'is-task-detail-open', 'is-task-plan-open']
  _appObserver = new MutationObserver(() => {
    if (modalFlags.some(cls => appEl.classList.contains(cls))) {
      logoMenuVisible.value = false
      activeMenu.value = ''
    }
  })
  _appObserver.observe(appEl, { attributes: true, attributeFilter: ['class'] })
}

const toggleLogoMenu = () => {
  logoMenuVisible.value = !logoMenuVisible.value
}

const handleMenuMouseLeave = (e) => {
  const toEl = e.relatedTarget
  if (toEl && toEl.closest && toEl.closest('.title-bar-logo__submenu')) {
    return
  }
  activeMenu.value = ''
}

const handleSubmenuMouseLeave = (e) => {
  const toEl = e.relatedTarget
  if (toEl && toEl.closest && toEl.closest('.title-bar-logo__menu-item')) {
    return
  }
  activeMenu.value = ''
}

const handleMenuAction = (item) => {
  logoMenuVisible.value = false
  if (item.command) {
    if (!commands.execute(item.command)) {
      ipcRenderer.send('command', item.command)
    }
    return
  }
  const w = win.value
  switch (item.role) {
    case 'undo': document.execCommand('undo'); break
    case 'redo': document.execCommand('redo'); break
    case 'cut': document.execCommand('cut'); break
    case 'copy': document.execCommand('copy'); break
    case 'paste': document.execCommand('paste'); break
    case 'delete': document.execCommand('delete'); break
    case 'selectall': document.execCommand('selectAll'); break
    case 'reload': w.webContents.reload(); break
    case 'close': w.close(); break
    case 'minimize': w.minimize(); break
    case 'zoom':
      if (w.isMaximized()) { w.unmaximize() } else { w.maximize() }
      break
    case 'togglefullscreen': w.setFullScreen(!w.isFullScreen()); break
    case 'front': w.moveTop(); break
    case 'toggledevtools': w.webContents.toggleDevTools(); break
  }
}

const handleMinimize = () => win.value.minimize()
const handleMaximize = () => {
  if (win.value.isMaximized()) { win.value.unmaximize() } else { win.value.maximize() }
}
const handleClose = () => win.value.close()

onMounted(() => {
  _handleDocumentClick = () => {
    if (logoMenuVisible.value) {
      logoMenuVisible.value = false
    }
  }
  document.addEventListener('click', _handleDocumentClick)
  observeAppClass()
})

onBeforeUnmount(() => {
  if (_handleDocumentClick) {
    document.removeEventListener('click', _handleDocumentClick)
  }
  if (_appObserver) {
    _appObserver.disconnect()
    _appObserver = null
  }
})
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
    color: var(--lc-text-primary);
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
    transition: opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
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
      color: var(--lc-text-primary);
      -webkit-app-region: no-drag;
      &:hover {
        background-color: rgba(0, 0, 0, 0.08);
      }
      &.win-close-btn:hover {
        color: #fff;
        background-color: #fd0007;
      }
    }
  }
}
.has-custom-titlebar .title-bar .title-bar-dragger {
  margin-left: 0;
}
.has-custom-titlebar .title-bar .window-actions {
  height: 38px;
  align-self: flex-start;
}
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
  &__text-strong { font-weight: 800; }
  &__text-soft { font-weight: 600; opacity: 0.72; }
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
  &.is-open .title-bar-logo__chevron { transform: rotate(180deg); }
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
    &:hover { background-color: var(--lc-bg-hover); }
  }
  &__submenu-separator {
    height: 1px;
    margin: 4px 8px;
    background-color: var(--lc-border-lighter);
  }
  &__menu-footer { padding: 2px 0 2px; }
  &__separator {
    height: 1px;
    margin: 4px 10px;
    background-color: var(--lc-border-lighter);
  }
}
.submenu-pop-enter-active,
.submenu-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: left center;
}
.submenu-pop-enter-from { opacity: 0; transform: scale(0.85); }
.submenu-pop-leave-to { opacity: 0; transform: scale(0.85); }
.theme-dark .has-custom-titlebar .title-bar .title-bar-logo {
  &:hover::before,
  &.is-open::before { background-color: var(--lc-bg-hover); }
}
.is-preference-window .title-bar .title-bar-logo { display: none; }
#app:not(.has-custom-titlebar):not(.is-mac) .title-bar .title-bar-dragger {
  -webkit-app-region: no-drag;
  pointer-events: none;
}
.has-custom-titlebar .title-bar .title-bar-title {
  margin-left: 16px;
  @media only screen and (min-width: 568px) { margin-left: 36px; }
}
.has-three-column-layout .title-bar .title-bar-title {
  margin-left: calc(200px + 6px + 6px);
  transition: margin-left 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  @media only screen and (min-width: 568px) { margin-left: calc(200px + 6px + 6px); }
}
.has-three-column-layout.is-aside-auto-hide:not(.is-aside-hovered) .title-bar .title-bar-title {
  margin-left: 16px;
  @media only screen and (min-width: 568px) { margin-left: 36px; }
}
.show-window-actions .title-bar {
  background: transparent;
  background-color: transparent;
}
.is-task-detail-open .title-bar { z-index: 5000; }
.is-add-task-open .title-bar,
.is-task-plan-open .title-bar { z-index: 5000; }
.is-task-detail-open.show-window-actions .title-bar,
.is-add-task-open.show-window-actions .title-bar,
.is-task-plan-open.show-window-actions .title-bar {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.is-task-detail-open .title-bar .title-bar-title,
.is-add-task-open .title-bar .title-bar-title,
.is-task-plan-open .title-bar .title-bar-title { opacity: 0.4; }
.is-task-detail-open .title-bar .title-bar-logo,
.is-add-task-open .title-bar .title-bar-logo,
.is-task-plan-open .title-bar .title-bar-logo { display: none; }
.is-task-detail-open.show-window-actions .title-bar::before,
.is-add-task-open.show-window-actions .title-bar::before,
.is-task-plan-open.show-window-actions .title-bar::before { display: none; }
.is-task-detail-open .title-bar:hover .window-actions,
.is-add-task-open .title-bar:hover .window-actions,
.is-task-plan-open .title-bar:hover .window-actions { opacity: 0.4; }
.is-task-detail-open .title-bar .window-actions:hover,
.is-add-task-open .title-bar .window-actions:hover,
.is-task-plan-open .title-bar .window-actions:hover { opacity: 1; }
.is-preference-window .title-bar .title-bar-dragger { margin-left: 220px; }
.is-preference-window .title-bar {
  background: transparent;
  background-color: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-bottom: none;
}
html.mac-native-transparent .is-preference-window .title-bar {
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
}
@media only screen and (min-width: 568px) {
  .title-bar {
    .title-bar-title { margin-left: 36px; }
  }
}
</style>
