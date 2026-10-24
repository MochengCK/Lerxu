/**
 * 原生能力的渲染层入口（替代 `@electron/remote`）。
 *
 * 每个调用都对应主进程 `core/NativeBridge.js` 里的一个 handler；窗口相关操作
 * 作用在当前调用者所属窗口上，所以不需要再传 `getCurrentWindow()`。
 *
 * 为什么不再用 remote：它每次调用都是**同步 IPC**（本机实测 2.9~3.4ms），
 * 会卡住渲染线程；而这里的调用方本来就是 async，`invoke` 等待期间界面照常跑。
 */
import { ipcRenderer } from 'electron'

export const openDialog = (options = {}) => ipcRenderer.invoke('native:open-dialog', options)
export const saveDialog = (options = {}) => ipcRenderer.invoke('native:save-dialog', options)
export const showMessageBox = (options = {}) => ipcRenderer.invoke('native:message-box', options)

export const openPath = (target) => ipcRenderer.invoke('native:open-path', `${target || ''}`)
export const openExternal = (target) => ipcRenderer.invoke('native:open-external', `${target || ''}`)
export const showItemInFolder = (target) => ipcRenderer.invoke('native:show-item', `${target || ''}`)
export const trashItem = (target) => ipcRenderer.invoke('native:trash-item', `${target || ''}`)

export const windowAction = (action) => ipcRenderer.invoke('native:window-action', action)
export const getWindowState = () => ipcRenderer.invoke('native:window-state')
export const getWindowBounds = () => ipcRenderer.invoke('native:window-bounds')
export const setWindowBounds = (bounds = {}) => ipcRenderer.send('native:window-set-bounds', bounds)
export const setMinimumSize = (width, height) => ipcRenderer.send('native:window-min-size', { width, height })
export const broadcastToWindows = (channel, payload) => ipcRenderer.send('native:broadcast', channel, payload)
export const sendToParent = (channel, payload) => ipcRenderer.send('native:to-parent', channel, payload)
export const cacheBackgroundImage = (src, cacheDir) => ipcRenderer.invoke('native:cache-background-image', { src, cacheDir })

let _menuSeq = 0

function serializeTemplate (items, handlers) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const next = { ...item }
    if (typeof item.click === 'function') {
      const id = `menu:${++_menuSeq}`
      handlers.set(id, item.click)
      next.id = id
    } else if (next.id) {
      // 调用方自带的 id 不参与回传，避免和我们的通道混用
      delete next.id
    }
    delete next.click
    if (Array.isArray(item.submenu)) {
      next.submenu = serializeTemplate(item.submenu, handlers)
    }
    return next
  })
}

/**
 * 弹出原生右键菜单，返回被点击项对应的 id（取消/关闭返回 null）。
 *
 * 模板仍在渲染层构造（`label/enabled/type/click`），点击回调留在渲染层执行；
 * 主进程只负责建菜单并把点了哪一项回传过来。
 */
export async function popupMenu (template, options = {}) {
  const handlers = new Map()
  const payload = serializeTemplate(template, handlers)
  let clicked = null
  try {
    clicked = await ipcRenderer.invoke('native:menu-popup', {
      template: payload,
      x: options.x,
      y: options.y
    })
  } catch (err) {
    console.warn('[nativeBridge] 右键菜单弹出失败:', err && err.message ? err.message : err)
    return null
  }
  const handler = clicked ? handlers.get(clicked) : null
  if (handler) {
    try {
      handler()
    } catch (err) {
      console.error('[nativeBridge] 菜单回调执行失败:', err)
    }
  }
  return clicked
}

// ── 任务浮窗（进度窗 / 完成提示窗）─────────────────────────────────
export const openTaskWindow = (payload) => ipcRenderer.invoke('task-window:open', payload)
export const sendToTaskWindow = (key, channel, payload) => ipcRenderer.send('task-window:send', { key, channel, payload })
export const taskWindowAction = (key, action, value) => ipcRenderer.send('task-window:action', { key, action, value })

/** 监听浮窗事件（task-window:ready / task-window:closed），返回取消函数 */
export function onTaskWindowEvent (channel, callback) {
  const handler = (_event, payload) => {
    try {
      callback(payload || {})
    } catch (err) {
      console.error('[nativeBridge] 浮窗事件处理失败:', err)
    }
  }
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}
