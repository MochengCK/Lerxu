// Extracted from Main.vue to avoid Vue SFC compiler issues with HTML in template literals

export function buildCompletedTaskWindowHtml (task, useCustomFrame, isMac, t, getThemeColors, formatBytes, escapeHtml) {
 {
        // Get task name from files or bittorrent info
        let taskName = 'Unknown'
        const files = Array.isArray(task.files) ? task.files : []
        const { bittorrent } = task
        if (bittorrent && bittorrent.info && bittorrent.info.name) {
          taskName = bittorrent.info.name
        } else if (files.length === 1) {
          const file = files[0]
          let path = file.path
          if (!path && file.uris && file.uris.length > 0) {
            path = decodeURI(file.uris[0].uri)
          }
          if (path) {
            const index = path.lastIndexOf('/')
            if (index >= 0) {
              taskName = path.substring(index + 1)
            } else {
              taskName = path
            }
            // Remove query parameters
            const q = taskName.indexOf('?')
            if (q >= 0) taskName = taskName.substring(0, q)
          }
        } else if (files.length > 1) {
          taskName = `${files.length} files`
        }

        const totalLength = task.totalLength || task.completedLength || 0
        const formattedSize = formatBytes(totalLength)

        // Get full file path for opening folder
        let filePath = ''
        if (files.length > 0) {
          const file = files[0]
          filePath = file.path || ''
          if (!filePath && file.uris && file.uris.length > 0) {
            const uri = decodeURI(file.uris[0].uri)
            // Convert file:// URL to path
            if (uri.startsWith('file://')) {
              filePath = uri.substring(7)
            } else {
              filePath = uri
            }
          }
        }
        // If still no path, use task.dir + taskName
        if (!filePath && task.dir && taskName) {
          filePath = task.dir + '/' + taskName
        }

        const gid = task.gid || ''
        const tc2 = getThemeColors()
        const bgColor = tc2.bodyBg
        const textColor = tc2.textColor
        const secondaryTextColor = tc2.secondaryTextColor
        const successColor = tc2.successColor
        const buttonBg = tc2.buttonBg
        const buttonHoverBg = tc2.buttonHoverBg

        const showTitleBar = useCustomFrame || isMac

        const titleBarHtml = showTitleBar
          ? '<' + 'div class="title-bar">' +
            '<' + 'span class="title-text">' + (t('task.task-completed-title') || '下载完成') + '<' + '/span>' +
            '<' + 'div class="title-actions">' +
            '<' + 'button class="title-btn" id="minimizeBtn">−' + '<' + '/button>' +
            '<' + 'button class="title-btn" id="titleCloseBtn">×' + '<' + '/button>' +
            '<' + '/div>' +
            '<' + '/div>'
          : ''

        const titleBarCss = showTitleBar
          ? `
          .title-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 12px;
            padding-left: ${isMac ? '78px' : '12px'};
            background: ${bgColor};
            -webkit-app-region: drag;
            z-index: 1000;
          }
          .title-text {
            font-size: 13px;
            font-weight: 500;
            color: ${textColor};
            -webkit-app-region: drag;
          }
          .title-actions {
            display: flex;
            gap: 4px;
            -webkit-app-region: no-drag;
          }
          .title-btn {
            width: 24px;
            height: 24px;
            border-radius: 4px;
            border: none;
            background: transparent;
            color: ${secondaryTextColor};
            cursor: pointer;
            font-size: 14px;
            line-height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s;
          }
          .title-btn:hover {
            background-color: ${tc2.titleBtnHoverBg};
            color: ${textColor};
          }
          ${
            isMac
              ? `
          .title-bar {
            justify-content: flex-end;
            padding-top: 4px;
            padding-right: 8px;
          }
          .title-actions {
            display: none;
          }
          `
              : ''
          }
        `
          : ''

        const containerPadding = showTitleBar ? '40px 16px 16px 16px' : '16px'
        const scriptEnd = '</' + 'script>'

        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 14px;
      background: ${bgColor};
      color: ${textColor};
      overflow: hidden;
    }
    ${titleBarCss}
    .container {
      padding: ${containerPadding};
      padding-bottom: 0;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .content-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .icon-wrapper {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: ${successColor}20;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
    }
    .icon {
      width: 28px;
      height: 28px;
      color: ${successColor};
    }
    .task-name {
      font-size: 15px;
      font-weight: 500;
      color: ${textColor};
      text-align: center;
      margin-bottom: 4px;
      max-width: 100%;
      padding: 0 8px;
      word-break: break-all;
    }
    .task-info {
      font-size: 13px;
      color: ${secondaryTextColor};
      text-align: center;
      margin-bottom: 16px;
    }
    .buttons {
      margin-top: auto;
      padding-bottom: 16px;
      display: flex;
      gap: 8px;
      width: 100%;
    }
    .btn {
      flex: 1;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: ${buttonBg};
      color: #ffffff;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.3s;
      text-align: center;
    }
    .btn:hover {
      background: ${buttonHoverBg};
    }
  </style>
</head>
<body>
  ${titleBarHtml}
  <div class="container">
    <div class="content-wrapper">
      <div class="task-name" title="${escapeHtml(taskName)}">${escapeHtml(taskName)}</div>
      <div class="task-info">${formattedSize}</div>
    </div>
    <div class="buttons">
      <button class="btn" id="openFileBtn">${t('task.open-file') || '打开文件'}</button>
      <button class="btn" id="openFolderBtn">${t('task.open-folder') || '打开文件夹'}</button>
      <button class="btn" id="closeBtn">${t('task.close') || '关闭'}</button>
    </div>
  </div>
  <script>
    const { ipcRenderer } = require('electron')
    const gid = '${gid}'
    const filePath = ${JSON.stringify(filePath)}

    document.getElementById('closeBtn').addEventListener('click', () => {
      ipcRenderer.send('close-completed-task-window', gid)
    })

    const titleCloseBtn = document.getElementById('titleCloseBtn')
    if (titleCloseBtn) {
      titleCloseBtn.addEventListener('click', () => {
        ipcRenderer.send('close-completed-task-window', gid)
      })
    }

    const minimizeBtn = document.getElementById('minimizeBtn')
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('minimize-completed-task-window', gid)
      })
    }

    document.getElementById('openFolderBtn').addEventListener('click', () => {
      ipcRenderer.send('open-completed-task-folder', { gid, filePath })
    })

    document.getElementById('openFileBtn').addEventListener('click', () => {
      ipcRenderer.send('open-completed-task-file', { gid, filePath })
    })

    // Listen for theme changes from main window
    ipcRenderer.on('theme-changed', (event, theme) => {
      const isDark = theme === 'dark'
      document.body.classList.toggle('dark', isDark)
      document.body.classList.toggle('light', !isDark)
    })
    ${scriptEnd}
</body>
</html>
`
      }
}
