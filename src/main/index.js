import { join } from 'node:path'
import { app } from 'electron'
import is from 'electron-is'
import { initialize } from '@electron/remote/main'

import Launcher from './Launcher'

/**
 * initialize the main-process side of the remote module
 */
initialize()

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

// TEMP-DEBUG: 调试用远程调试端口，排查后删除
app.commandLine.appendSwitch('remote-debugging-port', '9222')

/**
 * 兼容旧 electron-vue 的 __static 全局（TrayManager / TouchBarManager /
 * WindowManager 以 join(__static, ...) 引用静态资源）。
 * dev：工作区 static/（__dirname = dist/electron）；
 * 打包后：bundle 同目录（vite publicDir 会把 static/ 拷到 dist/electron/）。
 */
global.__static = app.isPackaged ? __dirname : join(__dirname, '../../static')

/**
 * Fix Windows notification func
 * appId defined in .electron-vue/webpack.main.config.js
 */
if (is.windows()) {
  app.setAppUserModelId(appId)
}

global.launcher = new Launcher()
