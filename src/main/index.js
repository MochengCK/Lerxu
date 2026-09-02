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
// 可用 LERXU_DEBUG_PORT 覆盖：本机已运行打包版（占用 9222）时，
// dev 实例需用别的端口才能挂 CDP。
app.commandLine.appendSwitch('remote-debugging-port', process.env.LERXU_DEBUG_PORT || '9222')

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
