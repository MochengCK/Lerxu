/**
 * 原生能力桥：把渲染进程需要的 dialog / Menu / shell / 窗口操作 / nativeImage
 * 收在主进程执行。
 *
 * 背景：这些能力过去走 `@electron/remote`。它的每次调用都是**同步 IPC**
 * （本机实测 2.9~3.4ms），会直接阻塞渲染线程；而且 remote 是 Electron 已废弃、
 * 官方不建议使用的模块。改成 `invoke` 之后调用方本来就是 async 的，等待期间
 * 渲染线程可以继续跑，体验只会更好。
 *
 * 约定：
 * · 能用 `ipcMain.handle` 的一律 handle（调用方 await 结果）；
 * · 纯通知（窗口移动、广播）用 `ipcMain.on`，避免每帧一次往返；
 * · 所有窗口相关操作都作用在 `event.sender` 所属窗口上，调用方不必传窗口。
 */
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell
} from 'electron'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const senderWindow = (event) => BrowserWindow.fromWebContents(event.sender) || undefined

const str = (value) => (value == null ? '' : `${value}`)

/** 菜单模板：把渲染层给的 `id` 变成"点击后回传 id" */
function attachMenuHandlers (items, finish) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const next = { ...item }
    if (item && item.id) {
      next.click = () => finish(`${item.id}`)
    }
    if (Array.isArray(item && item.submenu)) {
      next.submenu = attachMenuHandlers(item.submenu, finish)
    }
    return next
  })
}

let registered = false

export function registerNativeBridge ({ getWindowManager } = {}) {
  if (registered) {
    return
  }
  registered = true

  // ── 窗口 ──────────────────────────────────────────────────────────
  ipcMain.handle('native:window-action', (event, action) => {
    const win = senderWindow(event)
    if (!win) {
      return false
    }
    switch (`${action || ''}`) {
      case 'close': win.close(); break
      case 'minimize': win.minimize(); break
      case 'maximize': win.maximize(); break
      case 'unmaximize': win.unmaximize(); break
      case 'toggle-maximize':
        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
        break
      case 'toggle-fullscreen':
        win.setFullScreen(!win.isFullScreen())
        break
      case 'hide': win.hide(); break
      case 'front': win.moveTop(); break
      case 'reload': win.webContents.reload(); break
      case 'toggle-devtools': win.webContents.toggleDevTools(); break
      default: return false
    }
    return true
  })

  ipcMain.handle('native:window-state', (event) => {
    const win = senderWindow(event)
    if (!win) {
      return { isMaximized: false, isFullScreen: false }
    }
    return {
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen()
    }
  })

  ipcMain.handle('native:window-bounds', (event) => {
    const win = senderWindow(event)
    if (!win) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }
    const [x, y] = win.getPosition()
    const [width, height] = win.getSize()
    return { x, y, width, height }
  })

  // 拖动跟手：每帧一次，用 send 不等回包
  ipcMain.on('native:window-set-bounds', (event, bounds = {}) => {
    const win = senderWindow(event)
    if (!win) {
      return
    }
    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
      win.setPosition(Math.round(bounds.x), Math.round(bounds.y))
    }
    if (Number.isFinite(bounds.width) && Number.isFinite(bounds.height)) {
      win.setSize(Math.round(bounds.width), Math.round(bounds.height))
    }
  })

  ipcMain.on('native:window-min-size', (event, size = {}) => {
    const win = senderWindow(event)
    if (win && Number.isFinite(size.width) && Number.isFinite(size.height)) {
      win.setMinimumSize(Math.round(size.width), Math.round(size.height))
    }
  })

  // ── 对话框 / 外壳 ────────────────────────────────────────────────
  // ⚠️ 这里刻意**不传窗口**：`dialog.showXxx(win, opts)` 在 macOS 上会变成
  // 贴着窗口滑出的 sheet，而 remote 时代是应用级模态面板。这是一次纯行为
  // 等价的重构，视觉形态不该跟着变；真要换成 sheet 是另一个决定。
  ipcMain.handle('native:open-dialog', (_event, options = {}) => dialog.showOpenDialog(options))
  ipcMain.handle('native:save-dialog', (_event, options = {}) => dialog.showSaveDialog(options))
  ipcMain.handle('native:message-box', (_event, options = {}) => dialog.showMessageBox(options))

  ipcMain.handle('native:open-path', (_event, target) => shell.openPath(str(target)))
  ipcMain.handle('native:open-external', (_event, target) => shell.openExternal(str(target)))
  ipcMain.handle('native:show-item', (_event, target) => {
    if (target) {
      shell.showItemInFolder(str(target))
    }
    return true
  })
  ipcMain.handle('native:trash-item', async (_event, target) => {
    if (!target) {
      return false
    }
    await shell.trashItem(str(target))
    return true
  })

  // ── 菜单 ─────────────────────────────────────────────────────────
  ipcMain.handle('native:menu-popup', (event, payload = {}) => new Promise((resolve) => {
    const win = senderWindow(event)
    let settled = false
    const finish = (id) => {
      if (settled) {
        return
      }
      settled = true
      resolve(id == null ? null : `${id}`)
    }
    const menu = Menu.buildFromTemplate(attachMenuHandlers(payload.template, finish))
    // "点了某一项"与"菜单关闭"都会走到这里：点击的 id 先到（click 在菜单关闭
    // 之前派发），关闭回调只负责 `null`。延迟一个 tick 兜住平台差异 ——
    // 万一个别平台先回调 close，也不会把点击结果吞成 null。
    const options = { callback: () => setTimeout(() => finish(null), 0) }
    if (win) {
      options.window = win
    }
    if (Number.isFinite(payload.x)) {
      options.x = Math.round(payload.x)
    }
    if (Number.isFinite(payload.y)) {
      options.y = Math.round(payload.y)
    }
    menu.popup(options)
  }))

  // ── 多窗口广播（页面之间同步主题/语言）────────────────────────────
  ipcMain.on('native:broadcast', (event, channel, payload) => {
    const name = str(channel)
    if (!name) {
      return
    }
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed() && win.webContents !== event.sender) {
        win.webContents.send(name, payload)
      }
    })
  })

  ipcMain.on('native:to-parent', (event, channel, payload) => {
    const name = str(channel)
    const win = senderWindow(event)
    const parent = win && typeof win.getParentWindow === 'function' ? win.getParentWindow() : null
    if (name && parent && !parent.isDestroyed()) {
      parent.webContents.send(name, payload)
    }
  })

  // ── 背景图缓存（原本在渲染层用 nativeImage 缩放/转码）──────────────
  // 缩放/编码只能在主进程做（nativeImage 是主进程 API）；落盘用 fs.promises，
  // 别让几十 MB 的写入卡住主线程的窗口/菜单事件
  ipcMain.handle('native:cache-background-image', async (_event, payload = {}) => {
    const src = str(payload.src)
    const cacheDir = str(payload.cacheDir)
    if (!src || !cacheDir || !existsSync(src)) {
      return ''
    }
    try {
      mkdirSync(cacheDir, { recursive: true })
    } catch (_) { }

    const ext = (src.match(/\.[^./\\]+$/) || ['.img'])[0]
    const lower = ext.toLowerCase()
    const base = `bg-${Date.now()}-${randomBytes(6).toString('hex')}`
    let output = null
    let outputExt = ext

    try {
      if (lower !== '.gif' && lower !== '.svg') {
        const img = nativeImage.createFromPath(src)
        if (img && !img.isEmpty()) {
          const size = img.getSize()
          const maxSide = 2560
          const longest = Math.max(size.width || 0, size.height || 0)
          const scale = longest > maxSide ? (maxSide / longest) : 1
          const processed = scale < 1
            ? img.resize({
              width: Math.max(1, Math.round(size.width * scale)),
              height: Math.max(1, Math.round(size.height * scale)),
              quality: 'good'
            })
            : img
          if (lower === '.jpg' || lower === '.jpeg' || lower === '.webp') {
            output = processed.toJPEG(80)
            outputExt = '.jpg'
          } else {
            output = processed.toPNG()
            outputExt = '.png'
          }
        }
      }
    } catch (_) { }

    const dest = join(cacheDir, `${base}${outputExt}`)
    try {
      if (output && output.length) {
        await writeFile(dest, output)
      } else {
        await copyFile(src, dest)
      }
    } catch (_) {
      return ''
    }
    return dest
  })


  // ── 任务浮窗（进度窗 / 完成提示窗）────────────────────────────────
  // 之前是渲染层用 remote 的 `new BrowserWindow(...)` 自己造、再用窗口对象
  // 的 `webContents.send / setTitle / show / close` 操作。现在窗口归主进程所有，
  // 渲染层只按 key 发指令（全部是 send，不阻塞渲染线程）。
  const taskWindows = new Map()

  // 主进程崩溃/强杀时临时 HTML 来不及删 —— 启动时清一次一天前的残留
  // （只认自己的前缀，不动系统临时目录里的其它文件）
  try {
    const tmpDir = app.getPath('temp')
    const expireAt = Date.now() - 24 * 3600 * 1000
    readdirSync(tmpDir)
      .filter((name) => name.startsWith('lerxu-task-') && name.endsWith('.html'))
      .forEach((name) => {
        const target = join(tmpDir, name)
        try {
          if (statSync(target).mtimeMs < expireAt) {
            unlinkSync(target)
          }
        } catch (_) { }
      })
  } catch (_) { }

  ipcMain.handle('task-window:open', (event, payload = {}) => {
    const key = str(payload.key)
    if (!key) {
      return { ok: false }
    }
    const existing = taskWindows.get(key)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) {
        existing.restore()
      }
      existing.show()
      existing.focus()
      // 窗口已经 ready 过，不会再发一次 ready-to-show；这里补一条，
      // 让调用方注册的 ready 回调照样能拿到（补首屏数据 / 改标题）
      if (!event.sender.isDestroyed()) {
        event.sender.send('task-window:ready', { key })
      }
      return { ok: true, existed: true }
    }

    const options = payload.options && typeof payload.options === 'object' ? payload.options : {}
    const win = new BrowserWindow({
      ...options,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    })
    // 标题不在这里设：`loadFile` 之后 document.title（没有 <title> 时就是
    // 临时文件名）会覆盖窗口标题；统一由下面的 applyTitle 在
    // ready-to-show / did-finish-load 各设一次
    if (payload.backgroundColor) {
      try { win.setBackgroundColor(str(payload.backgroundColor)) } catch (_) { }
    }
    if (payload.hideMenu) {
      try {
        win.setMenuBarVisibility(false)
        win.setMenu(null)
      } catch (_) { }
    }

    // 完成提示窗的 HTML 没有 <title>，加载完 document.title 会变成临时文件名
    // （并且晚于 ready-to-show 才生效），必须挡住"页面标题改写窗口标题"。
    // 进度窗**不能**挡：它的页面自己用 document.title 跟随任务名。
    if (str(payload.kind) === 'completed') {
      win.on('page-title-updated', (e) => e.preventDefault())
    }

    let tmpFile = ''
    const html = str(payload.html)
    try {
      tmpFile = join(app.getPath('temp'), `lerxu-task-${Date.now()}-${randomBytes(4).toString('hex')}.html`)
      writeFileSync(tmpFile, html, 'utf-8')
      win.loadFile(tmpFile)
    } catch (_) {
      try {
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      } catch (_) { }
    }

    // 标题在 ready-to-show 与 did-finish-load 各设一次：前者保证窗口露面时
    // 是对的，后者保证不会被页面加载完成时的 document.title 覆盖（时序在
    // 不同 Electron 版本上不完全一致，两处都设是幂等的）
    const applyTitle = () => {
      if (payload.title && !win.isDestroyed()) {
        try { win.setTitle(str(payload.title)) } catch (_) { }
      }
    }
    win.webContents.once('did-finish-load', applyTitle)

    const sender = event.sender
    win.on('closed', () => {
      taskWindows.delete(key)
      if (tmpFile) {
        try { unlinkSync(tmpFile) } catch (_) { }
      }
      if (sender && !sender.isDestroyed()) {
        sender.send('task-window:closed', { key })
      }
    })

    // 页面加载失败（临时文件被清、磁盘满…）：主进程收掉窗口，
    // 让调用方通过 closed 事件把句柄清掉，不要留一个永不 ready 的僵尸
    win.webContents.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => {
      if (isMainFrame === false) {
        return
      }
      try {
        win.close()
      } catch (_) { }
    })

    win.once('ready-to-show', () => {
      if (win.isDestroyed()) {
        return
      }
      // 页面加载完 document.title 已经生效（完成窗的 HTML 没有 <title>，
      // 会被写成临时文件名），所以标题必须在这之后设（did-finish-load 再补一次）
      applyTitle()
      const kind = str(payload.kind)
      // 完成提示窗在 macOS 上必须"只显示、不激活应用"，否则主窗口会被一并置前
      if (kind === 'completed' && process.platform === 'darwin') {
        win.showInactive()
        try {
          win.setAlwaysOnTop(true, 'floating')
        } catch (_) {
          try { win.setAlwaysOnTop(true) } catch (_) { }
        }
      } else {
        if (win.isMinimized()) {
          win.restore()
        }
        win.show()
        win.focus()
        try { win.setAlwaysOnTop(true) } catch (_) { }
        if (kind !== 'completed') {
          // 进度窗：短暂置顶把窗口带到最前，随后取消
          setTimeout(() => {
            try {
              if (!win.isDestroyed()) {
                win.setAlwaysOnTop(false)
              }
            } catch (_) { }
          }, 100)
        }
      }
      if (sender && !sender.isDestroyed()) {
        sender.send('task-window:ready', { key })
      }
    })

    taskWindows.set(key, win)
    return { ok: true }
  })

  ipcMain.on('task-window:send', (_event, payload = {}) => {
    const win = taskWindows.get(str(payload.key))
    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send(str(payload.channel), payload.payload)
      } catch (_) { }
    }
  })

  ipcMain.on('task-window:action', (_event, payload = {}) => {
    const win = taskWindows.get(str(payload.key))
    if (!win || win.isDestroyed()) {
      return
    }
    switch (str(payload.action)) {
      case 'present':
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        break
      case 'close':
        win.close()
        break
      case 'set-title':
        try { win.setTitle(str(payload.value)) } catch (_) { }
        break
      case 'set-background':
        if (payload.value) {
          try { win.setBackgroundColor(str(payload.value)) } catch (_) { }
        }
        break
      default:
        break
    }
  })

  // ── 视频嗅探器：主进程创建"添加格式"模态子窗 ─────────────────────
  // 页面（video-sniffer.js）只发一次 invoke；主题/语言在 dom-ready 时由
  // WindowManager 同步过去，结果由子窗用 `native:to-parent` 回传。
  ipcMain.handle('video-sniffer:open-add-format', (event, payload = {}) => {
    const parent = senderWindow(event)
    const manager = typeof getWindowManager === 'function' ? getWindowManager() : null
    if (!parent || !manager) {
      return false
    }
    try {
      const win = manager.openModalPage('video-sniffer-add-format', {
        parent,
        theme: str(payload.theme) || 'light',
        locale: str(payload.locale) || 'en-US'
      })
      return !!win
    } catch (err) {
      console.error('[nativeBridge] 打开添加格式窗口失败:', err && err.message ? err.message : err)
      return false
    }
  })
}
