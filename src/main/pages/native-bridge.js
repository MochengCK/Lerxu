/**
 * 独立页面（视频嗅探设置 / 添加格式 / 文件分类）用的原生能力桥。
 *
 * 这些页面由主进程以 `file://` 直接加载（nodeIntegration + contextIsolation:false），
 * 不是 Vite 打包的 ESM，所以不能 import `@/utils/nativeBridge`；这里用普通脚本
 * + `require('electron')` 暴露同样的能力。
 *
 * 背景：过去它们走 `@electron/remote` 的 `getCurrentWindow()` / `BrowserWindow`，
 * 每次调用都是同步 IPC（本机实测 2.9~3.4ms），且 remote 已被 Electron 废弃。
 * 现在窗口操作按 `event.sender` 定位到调用者自己的窗口，页面不必再传窗口对象。
 *
 * 用法：在页面脚本之前引入本文件，然后 `window.lerxuNative.closeWindow()`。
 */
(function () {
  'use strict'

  const { ipcRenderer } = require('electron')

  const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload)
  const send = (channel, ...args) => ipcRenderer.send(channel, ...args)

  window.lerxuNative = {
    // ── 窗口 ────────────────────────────────────────────────────────
    closeWindow: () => invoke('native:window-action', 'close'),
    minimizeWindow: () => invoke('native:window-action', 'minimize'),
    toggleMaximize: () => invoke('native:window-action', 'toggle-maximize'),
    getWindowBounds: () => invoke('native:window-bounds'),
    setWindowSize: (width, height) => send('native:window-set-bounds', { width, height }),
    setMinimumSize: (width, height) => send('native:window-min-size', { width, height }),

    // ── 对话框 ──────────────────────────────────────────────────────
    showMessageBox: (options) => invoke('native:message-box', options || {}),

    // ── 窗口间消息 ──────────────────────────────────────────────────
    /** 发给除自己以外的所有窗口（主题 / 语言同步） */
    broadcast: (channel, payload) => send('native:broadcast', channel, payload),
    /** 发给自己的父窗口（模态子窗回传结果） */
    sendToParent: (channel, payload) => send('native:to-parent', channel, payload),

    // ── 视频嗅探器专属 ──────────────────────────────────────────────
    openAddFormatWindow: (payload) => invoke('video-sniffer:open-add-format', payload || {})
  }
})()
