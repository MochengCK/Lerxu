/**
 * 平台 / 运行环境判断（替代 `electron-is`）。
 *
 * electron-is 3.0.0 已经很多年没更新，为了几个 `process.platform === 'darwin'`
 * 级别的判断，额外拖进来 electron-is-dev 与**第二份 semver**（它用 semver 做
 * Electron/Chrome 版本比较，而本项目一处都没用到），且新版 Electron 下它的
 * `renderer()` 依赖 `process.type`、`mas()` 依赖 `process.mas`，都只是读环境变量。
 * 这里按原语义重写一份，**API 名保持一致**，调用点只换 import 路径。
 *
 * `dev()` 判定与 electron-is 完全一致（顺序也一样）：
 *   1. 显式给了 `ELECTRON_IS_DEV` 就听它的（`0` 视为生产）；
 *   2. 否则看 `process.defaultApp`（`electron .` 启动时为 true）；
 *   3. 再看可执行文件路径里有没有 `node_modules/electron/`（dev 依赖启动）。
 *
 * ⚠️ 与 electron-is 一样在**模块加载时**求值一次：之后再改环境变量不生效。
 */

const devFlag = (() => {
  if (typeof process === 'undefined') {
    return false
  }
  if ('ELECTRON_IS_DEV' in process.env) {
    return Number.parseInt(process.env.ELECTRON_IS_DEV, 10) === 1
  }
  return !!process.defaultApp || /node_modules[\\/]electron[\\/]/.test(process.execPath || '')
})()

const is = {
  /** 渲染进程 */
  renderer: () => typeof process !== 'undefined' && process.type === 'renderer',
  /** 主进程 */
  main: () => typeof process !== 'undefined' && process.type === 'browser',
  /** macOS（历史别名 osx 一并保留） */
  macOS: () => process.platform === 'darwin',
  osx: () => process.platform === 'darwin',
  windows: () => process.platform === 'win32',
  linux: () => process.platform === 'linux',
  /** 开发模式（见文件头判定顺序） */
  dev: () => devFlag,
  production: () => !devFlag,
  /** Mac App Store 构建 */
  mas: () => process.mas === true,
  /** Windows Store(appx) 构建 */
  windowsStore: () => process.windowsStore === true,
  /** 运行在 macOS 沙箱里 */
  sandbox: () => 'APP_SANDBOX_CONTAINER_ID' in process.env,
  x86: () => process.arch === 'ia32',
  x64: () => process.arch === 'x64'
}

export default is
