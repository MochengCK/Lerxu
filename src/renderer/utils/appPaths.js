/**
 * 渲染进程读取「应用级只读信息」（用户数据目录 / 可执行文件 / 应用根目录）。
 *
 * 这些值过去通过 `@electron/remote` 取：`app.getPath()` 这类调用走的是**同步
 * IPC**，本机实测每次约 3ms，会直接卡住渲染线程（媒体合并前一口气取三个就是
 * 近 10ms）。它们在整个进程生命周期里都是常量，没必要反复问主进程。
 *
 * 主进程在创建窗口之前把它们写进自己的环境变量（`LERXU_*`），渲染进程作为
 * 子进程继承 —— 零 IPC、零等待。只有环境缺失（单测 / 非标准启动）时才回退到
 * remote 或 `process.execPath`，保证任何情况下都能拿到值。
 */

const readEnv = (key) => {
  try {
    return (typeof process !== 'undefined' && process.env && process.env[key]) || ''
  } catch (_) {
    return ''
  }
}

let _remoteApp
let _remoteTried = false

function remoteApp () {
  if (_remoteTried) {
    return _remoteApp
  }
  _remoteTried = true
  try {
    _remoteApp = require('@electron/remote').app
  } catch (_) {
    _remoteApp = undefined
  }
  return _remoteApp
}

/** 用户数据目录（配置、会话、历史记录都在这里） */
export function getUserDataPath () {
  const fromEnv = readEnv('LERXU_USER_DATA')
  if (fromEnv) {
    return fromEnv
  }
  try {
    return remoteApp().getPath('userData')
  } catch (_) { }
  try {
    return require('electron').app.getPath('userData')
  } catch (_) { }
  return ''
}

/** 应用可执行文件（dev 下是 Electron 二进制） */
export function getExePath () {
  const fromEnv = readEnv('LERXU_EXE')
  if (fromEnv) {
    return fromEnv
  }
  try {
    return remoteApp().getPath('exe')
  } catch (_) { }
  try {
    return process.execPath || ''
  } catch (_) { }
  return ''
}

/** 应用根目录（dev 下是仓库根，打包后是 app.asar 路径） */
export function getAppPath () {
  const fromEnv = readEnv('LERXU_APP_PATH')
  if (fromEnv) {
    return fromEnv
  }
  try {
    return remoteApp().getAppPath()
  } catch (_) { }
  return ''
}
