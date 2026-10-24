/**
 * 渲染进程读取「应用级只读信息」（用户数据目录 / 可执行文件 / 应用根目录）。
 *
 * 这些值过去通过 `@electron/remote` 取：`app.getPath()` 这类调用走的是**同步
 * IPC**，本机实测每次约 3ms，会直接卡住渲染线程（媒体合并前一口气取三个就是
 * 近 10ms）。它们在整个进程生命周期里都是常量，没必要反复问主进程。
 *
 * 主进程在创建窗口之前把它们写进自己的环境变量（`LERXU_*`），渲染进程作为
 * 子进程继承 —— 零 IPC、零等待。**这是唯一来源**：remote 已从项目里移除，
 * 不要在这里再引入任何同步 IPC 回退。
 */

const readEnv = (key) => {
  try {
    return (typeof process !== 'undefined' && process.env && process.env[key]) || ''
  } catch (_) {
    return ''
  }
}

let warned = false

/** 环境缺失只可能出现在「不在 Electron 里跑」的场景（单测 / 浏览器直开 dev server） */
function warnMissing (name, key) {
  if (warned) {
    return
  }
  warned = true
  console.warn(`[Lerxu] 缺少 ${key} 环境变量，${name} 不可用（是否在 Electron 之外运行？）`)
}

/** 用户数据目录（配置、会话、历史记录都在这里） */
export function getUserDataPath () {
  const fromEnv = readEnv('LERXU_USER_DATA')
  if (fromEnv) {
    return fromEnv
  }
  warnMissing('用户数据目录', 'LERXU_USER_DATA')
  return ''
}

/** 应用可执行文件（dev 下是 Electron 二进制） */
export function getExePath () {
  const fromEnv = readEnv('LERXU_EXE')
  if (fromEnv) {
    return fromEnv
  }
  // 渲染进程的 process.execPath 是 Electron 自己的可执行文件，与主进程
  // `app.getPath('exe')` 在 dev 下同值、打包后同值 —— 作为兜底足够
  try {
    return process.execPath || ''
  } catch (_) {
    return ''
  }
}

/** 应用根目录（dev 下是仓库根，打包后是 app.asar 路径） */
export function getAppPath () {
  const fromEnv = readEnv('LERXU_APP_PATH')
  if (fromEnv) {
    return fromEnv
  }
  warnMissing('应用根目录', 'LERXU_APP_PATH')
  return ''
}
