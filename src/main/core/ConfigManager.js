import { app } from 'electron'
import is from 'electron-is'
import Store from 'electron-store'

import {
  getConfigBasePath,
  getDhtPath,
  getMaxConnectionPerServer,
  getUserDownloadsPath
} from '../utils/index'
import { engineBinMap } from '../configs/engine'
import {
  APP_RUN_MODE,
  APP_THEME,
  EMPTY_STRING,
  ENGINE_RPC_PORT,
  IP_VERSION,
  LOGIN_SETTING_OPTIONS,
  PROXY_MODE,
  PROXY_SCOPES,
  PROXY_SCOPE_OPTIONS,
  TRACKER_SOURCE_OPTIONS
} from '@shared/constants'
import { LINKCORE_BT_UA, LINKCORE_PEER_ID_PREFIX, CHROME_UA } from '@shared/ua'
import { separateConfig, getEngineConnectionPolicy } from '@shared/utils'
import { reduceTrackerString } from '@shared/utils/tracker'

const getDefaultTrackerSources = () => {
  const sources = []
  ;(TRACKER_SOURCE_OPTIONS || []).forEach(group => {
    ;(group.options || []).forEach(opt => {
      if (opt.value && !sources.includes(opt.value)) {
        sources.push(opt.value)
      }
    })
  })
  return sources
}

export default class ConfigManager {
  constructor () {
    this.systemConfig = {}
    this.userConfig = {}

    this.init()
  }

  init () {
    this.initUserConfig()
    this.initSystemConfig()
  }

  /**
   * Aria2 Configuration Priority
   * system.json > built-in aria2.conf
   * https://aria2.github.io/manual/en/html/aria2c.html
   *
   */
  initSystemConfig () {
    const defaultEngineBinary = engineBinMap[process.platform] || 'fluxcore'
    const enginePolicy = getEngineConnectionPolicy(defaultEngineBinary)
    const defaultConn = Number(enginePolicy && enginePolicy.defaultMax) || getMaxConnectionPerServer()
    this.systemConfig = new Store({
      name: 'system',
      cwd: getConfigBasePath(),
      /* eslint-disable quote-props */
      defaults: {
        'all-proxy': EMPTY_STRING,
        'allow-overwrite': false,
        'auto-file-renaming': true,
        'bt-exclude-tracker': EMPTY_STRING,
        'bt-encryption-mode': 'adaptive',
        'bt-force-encryption': false,
        'bt-load-saved-metadata': true,
        'bt-max-peers': 0,
        'bt-min-crypto-level': 'arc4',
        'bt-require-crypto': false,
        'bt-save-metadata': true,
        'bt-tracker': EMPTY_STRING,
        'bt-tracker-connect-timeout': 30,
        'bt-tracker-timeout': 30,
        'bt-enable-lpd': true,
        'enable-peer-exchange': true,
        'bt-stop-timeout': 300,
        'bt-max-open-files': 200,
        'bt-metadata-only': false,
        'reuse-uri': true,
        'min-split-size': '1M',
        'continue': true,
        'check-certificate': false,
        'enable-http-keep-alive': true,
        'http-accept-gzip': true,
        'connect-timeout': 10,
        'timeout': 30,
        'lowest-speed-limit': '20K',
        'stream-piece-selector': 'default',
        'max-tries': 0,
        'retry-wait': 2,
        'max-file-not-found': 10,
        'uri-selector': 'adaptive',
        'dht-file-path': getDhtPath(IP_VERSION.V4),
        'dht-file-path6': getDhtPath(IP_VERSION.V6),
        'dht-listen-port': 26701,
        'dir': getUserDownloadsPath(),
        'enable-dht6': true,
        'follow-metalink': true,
        'follow-torrent': true,
        'listen-port': 21301,
        'max-concurrent-downloads': 10,
        'max-connection-per-server': defaultConn,
        'max-download-limit': 0,
        'max-overall-download-limit': 0,
        'max-overall-upload-limit': 0,
        'no-proxy': EMPTY_STRING,
        'pause-metadata': false,
        'pause': true,
        'rpc-listen-port': ENGINE_RPC_PORT,
        'rpc-secret': EMPTY_STRING,
        'remote-time': true,
        'seed-ratio': 2,
        'seed-time': 2880,
        'split': defaultConn,
        'user-agent': CHROME_UA,
        'peer-id-prefix': LINKCORE_PEER_ID_PREFIX,
        'bt-user-agent': LINKCORE_BT_UA
      }
      /* eslint-enable quote-props */
    })
    this.fixSystemConfig()
  }

  initUserConfig () {
    const defaultEngineBinary = engineBinMap[process.platform] || 'fluxcore'
    const enginePolicy = getEngineConnectionPolicy(defaultEngineBinary)
    this.userConfig = new Store({
      name: 'user',
      cwd: getConfigBasePath(),
      // Schema need electron-store upgrade to 3.x.x,
      // but it will cause the application build to fail.
      // schema: {
      //   theme: {
      //     type: 'string',
      //     enum: ['auto', 'light', 'dark']
      //   }
      // },
      /* eslint-disable quote-props */
      defaults: {
        'auto-check-update': is.macOS(),
        'auto-hide-window': false,
        'auto-purge-record': false,
        'auto-sync-tracker': true,
        'auto-sync-tracker-interval': 12,
        'auto-sync-tracker-time': '00:00',
        'downloading-file-suffix': '',
        'set-file-mtime-on-complete': false,
        'advanced-option-presets': [],
        'task-priorities': {},
        'task-multi-select-modifier': 'ctrl',
        'enable-upnp': true,
        'engine-binary': defaultEngineBinary,
        'engine-max-connection-per-server': Number(enginePolicy && enginePolicy.max) || getMaxConnectionPerServer(),
        'favorite-directories': [],
        'hide-app-menu': false,
        'history-directories': [],
        'keep-seeding': false,
        'stop-seeding-action': 'pause',
        'keep-window-state': false,
        'last-check-update-time': 0,
        'last-sync-tracker-time': 0,
        'locale': 'auto',
        'log-level': 'warn',
        'new-task-show-downloading': true,
        'new-task-jump-target': 'downloading',
        'no-confirm-before-delete-task': false,
        'open-at-login': false,
        'protocols': { 'magnet': true, 'thunder': false },
        'proxy': {
          'mode': PROXY_MODE.SYSTEM,
          'server': EMPTY_STRING,
          'bypass': EMPTY_STRING,
          'scope': PROXY_SCOPE_OPTIONS
        },
        'resume-all-when-app-launched': false,
        'run-mode': APP_RUN_MODE.STANDARD,
        'show-progress-bar': true,
        'task-notification': true,
        'task-complete-notify-click-action': 'open-folder',
        'theme': APP_THEME.AUTO,
        'background-type': 'color',
        'background-image': EMPTY_STRING,
        'background-image-opacity': 0.4,
        'background-image-frosted-blur': 0,
        'background-ui-opacity': 0.7,
        'background-ui-opacity-scope': [
          'date-filter',
          'task-category-select',
          'task-item',
          'preference-card',
          'aside',
          'subnav'
        ],
        'background-ui-frosted-blur': 6,
        'background-ui-frosted-blur-scope': [
          'date-filter',
          'task-category-select',
          'task-item',
          'preference-card',
          'aside',
          'subnav'
        ],
        'task-detail-frosted-blur': 4,
        'tracker-source': getDefaultTrackerSources(),
        'tray-theme': APP_THEME.AUTO,
        'tray-speedometer': is.macOS(),
        'update-channel': 'latest',
        'window-state': {},
        'extension-intercept-all-downloads': false,
        'extension-silent-download': false,
        'extension-skip-file-extensions': '',
        'extension-exclude-domains': '',
        'extension-min-file-size': 0,
        'extension-shift-toggle-enabled': false,
        'sidebar-layout-mode': 'three-column',
        'task-plan-type': 'complete',
        'task-plan-time': '',
        'task-plan-action': 'none',
        'clipboard-auto-paste': true,
        'clipboard-auto-open-add-task': false,
        'enable-security-scan': false,
        'security-scan-tool': 'system',
        'custom-security-scan-path': '',
        'task-view-mode': 'list',
        'show-task-type-badge': true
      }
      /* eslint-enable quote-props */
    })
    this.fixUserConfig()
  }

  fixSystemConfig () {
    // Remove aria2c unrecognized options
    const { others } = separateConfig(this.systemConfig.store)
    if (others && Object.keys(others).length > 0) {
      Object.keys(others).forEach(key => {
        this.systemConfig.delete(key)
      })
    }

    const proxy = this.getUserConfig('proxy', { mode: PROXY_MODE.SYSTEM })
    // 兼容旧版配置（enable 字段）
    let proxyMode = proxy.mode
    if (!proxyMode && proxy.enable !== undefined) {
      proxyMode = proxy.enable ? PROXY_MODE.CUSTOM : PROXY_MODE.NONE
    }
    const { server, bypass, scope = [] } = proxy
    if (proxyMode === PROXY_MODE.CUSTOM && server && scope.includes(PROXY_SCOPES.DOWNLOAD)) {
      this.setSystemConfig('all-proxy', server)
      this.setSystemConfig('no-proxy', bypass)
    } else if (proxyMode === PROXY_MODE.SYSTEM && scope.includes(PROXY_SCOPES.DOWNLOAD)) {
      // 系统代理模式：在启动时获取系统代理并设置
      // 注意：这里是同步代码，但 getSystemHttpProxy 是异步的
      // 所以我们先设置为空，稍后在 Application.js 中异步获取并更新
      this.setSystemConfig('all-proxy', EMPTY_STRING)
      this.setSystemConfig('no-proxy', bypass)
    } else {
      this.setSystemConfig('all-proxy', EMPTY_STRING)
      this.setSystemConfig('no-proxy', EMPTY_STRING)
    }

    const lpdEnabled = this.systemConfig.get('bt-enable-lpd')
    if (lpdEnabled === undefined || lpdEnabled === null) {
      this.setSystemConfig('bt-enable-lpd', true)
    }

    // Fix spawn ENAMETOOLONG on Windows
    const tracker = reduceTrackerString(this.systemConfig.get('bt-tracker'))
    this.setSystemConfig('bt-tracker', tracker)

    // 同步用户设置的 User-Agent 到系统配置
    const userAgent = this.getUserConfig('userAgent')
    if (userAgent) {
      this.setSystemConfig('user-agent', userAgent)
    }

    // === 下载速度优化迁移 ===
    // 将旧的 min-split-size 从 4M 迁移到 1M，确保文件能被分成更多片段，
    // 让所有连接始终保持活跃，避免下载后期速度下降
    const currentMinSplitSize = this.systemConfig.get('min-split-size')
    if (!currentMinSplitSize || currentMinSplitSize === '4M' || currentMinSplitSize === '4m') {
      this.setSystemConfig('min-split-size', '1M')
    }

    // 将 stream-piece-selector 从 geom 迁移到 default，
    // geom 会导致后期片段越来越大，并行度降低，速度逐渐下降
    const currentSelector = this.systemConfig.get('stream-piece-selector')
    if (!currentSelector || currentSelector === 'geom') {
      this.setSystemConfig('stream-piece-selector', 'default')
    }

    // 将 retry-wait 从 10 迁移到 2，减少连接失败后的等待时间
    const currentRetryWait = this.systemConfig.get('retry-wait')
    if (currentRetryWait === undefined || Number(currentRetryWait) >= 10) {
      this.setSystemConfig('retry-wait', 2)
    }

    // 将 timeout 从 10 迁移到 30，避免大文件传输时连接被过早断开
    const currentTimeout = this.systemConfig.get('timeout')
    if (currentTimeout === undefined || Number(currentTimeout) === 10) {
      this.setSystemConfig('timeout', 30)
    }

    // 删除 enable-http-pipelining，该选项会导致部分 HTTPS 服务器 TLS 握手失败
    if (this.systemConfig.get('enable-http-pipelining') !== undefined) {
      this.systemConfig.delete('enable-http-pipelining')
    }

    // 确保 check-certificate 为 false，避免因证书验证导致 HTTPS 下载失败
    if (this.systemConfig.get('check-certificate') !== false) {
      this.setSystemConfig('check-certificate', false)
    }
  }

  fixUserConfig () {
    // Fix the value of open-at-login when the user delete
    // the Motrix self-starting item through startup management.
    const openAtLogin = app.getLoginItemSettings(LOGIN_SETTING_OPTIONS).openAtLogin
    if (this.getUserConfig('open-at-login') !== openAtLogin) {
      this.setUserConfig('open-at-login', openAtLogin)
    }

    const uiScopeAll = [
      'date-filter',
      'task-category-select',
      'task-item',
      'preference-card',
      'aside',
      'subnav'
    ]
    const shouldResetUiScope = (value) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.some(s => ['floating-bar', 'task-plan', 'speedometer'].includes(`${s}`.trim()))
    }
    const uiOpacityScope = this.getUserConfig('background-ui-opacity-scope')
    if (shouldResetUiScope(uiOpacityScope)) {
      this.setUserConfig('background-ui-opacity-scope', uiScopeAll)
    }
    const uiFrostedBlurScope = this.getUserConfig('background-ui-frosted-blur-scope')
    if (shouldResetUiScope(uiFrostedBlurScope)) {
      this.setUserConfig('background-ui-frosted-blur-scope', uiScopeAll)
    }

    const clampFrostedBlur = (value, min, max) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return null
      return Math.min(Math.max(n, min), max)
    }
    const frostedBlurKeys = [
      'background-image-frosted-blur',
      'background-ui-frosted-blur',
      'task-detail-frosted-blur'
    ]
    frostedBlurKeys.forEach((key) => {
      const raw = this.getUserConfig(key)
      const clamped = clampFrostedBlur(raw, 0, 10)
      if (clamped === null) return
      if (clamped !== raw) {
        this.setUserConfig(key, clamped)
      }
    })

    const clampOpacity = (value, min, max) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return null
      return Math.min(Math.max(n, min), max)
    }
    const opacityRules = [
      { key: 'background-image-opacity', min: 0.3, max: 1 },
      { key: 'background-ui-opacity', min: 0.4, max: 1 }
    ]
    opacityRules.forEach(({ key, min, max }) => {
      const raw = this.getUserConfig(key)
      const clamped = clampOpacity(raw, min, max)
      if (clamped === null) return
      if (clamped !== raw) {
        this.setUserConfig(key, clamped)
      }
    })

    if (this.getUserConfig('tracker-source').length === 0) {
      this.setUserConfig('tracker-source', getDefaultTrackerSources())
    }
  }

  getSystemConfig (key, defaultValue) {
    if (typeof key === 'undefined' &&
      typeof defaultValue === 'undefined') {
      return this.systemConfig.store
    }

    return this.systemConfig.get(key, defaultValue)
  }

  getUserConfig (key, defaultValue) {
    if (typeof key === 'undefined' &&
      typeof defaultValue === 'undefined') {
      return this.userConfig.store
    }

    return this.userConfig.get(key, defaultValue)
  }

  getLocale () {
    return this.getUserConfig('locale') || app.getLocale()
  }

  setSystemConfig (...args) {
    if (args.length === 1 && typeof args[0] === 'object') {
      // 处理对象参数，支持删除属性
      const config = args[0]
      Object.keys(config).forEach(key => {
        const value = config[key]
        if (value === undefined) {
          // 如果值为undefined，删除该属性
          this.systemConfig.delete(key)
        } else {
          // 否则设置属性值
          this.systemConfig.set(key, value)
        }
      })
    } else {
      // 处理键值对参数
      this.systemConfig.set(...args)
    }
  }

  setUserConfig (...args) {
    if (args.length === 1 && typeof args[0] === 'object') {
      // 处理对象参数，支持删除属性
      const config = args[0]
      Object.keys(config).forEach(key => {
        const value = config[key]
        if (value === undefined) {
          // 如果值为undefined，删除该属性
          this.userConfig.delete(key)
        } else {
          // 否则设置属性值
          this.userConfig.set(key, value)
        }
      })
    } else {
      // 处理键值对参数
      this.userConfig.set(...args)
    }
  }

  reset () {
    this.systemConfig.clear()
    this.userConfig.clear()
  }
}
