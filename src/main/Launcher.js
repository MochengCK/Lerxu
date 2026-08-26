import { EventEmitter } from 'node:events'
import { app } from 'electron'
import is from 'electron-is'
// 与 index.js 的 initialize() 保持同一份 bundle 内实例；
// 若此处用运行时 require()，会加载 node_modules 里的另一份拷贝，
// 导致 enable() 写入的缓存与 bundle 内 IPC 检查的不是同一个，remote 调用全部失败
import { enable as enableRemote } from '@electron/remote/main'

import ExceptionHandler from './core/ExceptionHandler'
import logger from './core/LogManager'
import Application from './Application'
import {
  splitArgv,
  parseArgvAsUrl,
  parseArgvAsFile
} from './utils'
import { EMPTY_STRING } from '@shared/constants'

export default class Launcher extends EventEmitter {
  constructor () {
    super()
    this.url = EMPTY_STRING
    this.file = EMPTY_STRING

    this.makeSingleInstance(() => {
      this.init()
    })
  }

  makeSingleInstance (callback) {
    // Mac App Store Sandboxed App not support requestSingleInstanceLock
    if (is.mas()) {
      callback && callback()
      return
    }

    const gotSingleLock = app.requestSingleInstanceLock()

    if (!gotSingleLock) {
      app.quit()
    } else {
      app.on('second-instance', (event, argv, workingDirectory) => {
        global.application.showPage('index')
        if (!is.macOS() && argv.length > 1) {
          this.handleAppLaunchArgv(argv)
        }
      })

      callback && callback()
    }
  }

  init () {
    this.exceptionHandler = new ExceptionHandler()

    this.openedAtLogin = is.macOS()
      ? app.getLoginItemSettings().wasOpenedAtLogin
      : false

    if (process.argv.length > 1) {
      this.handleAppLaunchArgv(process.argv)
    }

    logger.info('[Lerxu] openedAtLogin:', this.openedAtLogin)

    this.handleAppEvents()
  }

  handleAppEvents () {
    this.handleRendererRemote()
    this.handleOpenUrl()
    this.handleOpenFile()

    this.handelAppReady()
    this.handleAppWillQuit()
  }

  handleRendererRemote () {
    app.on('browser-window-created', (_, window) => {
      enableRemote(window.webContents)
    })
  }

  /**
   * handleOpenUrl
   * Event 'open-url' macOS only
   * "name": "Motrix Protocol",
   * "schemes": ["mo", "motrix"]
   */
  handleOpenUrl () {
    if (is.mas() || !is.macOS()) {
      return
    }
    app.on('open-url', (event, url) => {
      logger.info(`[Lerxu] open-url: ${url}`)
      event.preventDefault()
      this.url = url
      this.sendUrlToApplication()
    })
  }

  /**
   * handleOpenFile
   * Event 'open-file' macOS only
   * handle open torrent file
   */
  handleOpenFile () {
    if (!is.macOS()) {
      return
    }
    app.on('open-file', (event, path) => {
      logger.info(`[Lerxu] open-file: ${path}`)
      event.preventDefault()
      this.file = path
      this.sendFileToApplication()
    })
  }

  /**
   * handleAppLaunchArgv
   * For Windows, Linux
   * @param {array} argv
   */
  handleAppLaunchArgv (argv) {
    logger.info('[Lerxu] handleAppLaunchArgv:', argv)

    // args: array, extra: map
    const { args, extra } = splitArgv(argv)
    logger.info('[Lerxu] split argv args:', args)
    logger.info('[Lerxu] split argv extra:', extra)
    if (extra['--opened-at-login'] === '1') {
      this.openedAtLogin = true
    }

    const file = parseArgvAsFile(args)
    if (file) {
      this.file = file
      this.sendFileToApplication()
    }

    const url = parseArgvAsUrl(args)
    if (url) {
      this.url = url
      this.sendUrlToApplication()
    }
  }

  sendUrlToApplication () {
    if (this.url && global.application && global.application.isReady) {
      global.application.handleProtocol(this.url)
      this.url = EMPTY_STRING
    }
  }

  sendFileToApplication () {
    if (this.file && global.application && global.application.isReady) {
      global.application.handleFile(this.file)
      this.file = EMPTY_STRING
    }
  }

  handelAppReady () {
    app.on('ready', () => {
      global.application = new Application()

      const { openedAtLogin } = this
      global.application.start('index', {
        openedAtLogin
      })

      global.application.on('ready', () => {
        this.sendUrlToApplication()

        this.sendFileToApplication()
      })
    })

    app.on('activate', () => {
      if (global.application) {
        logger.info('[Lerxu] activate')
        global.application.handleActivate()
      }
    })
  }

  handleAppWillQuit () {
    app.on('will-quit', (event) => {
      logger.info('[Lerxu] will-quit')
      // 如果 Application.quit() 已经处理了引擎关闭（engine.instance 为 null），
      // 则直接退出，不重复操作。
      if (!global.application || !global.application.engine || !global.application.engine.instance) {
        return
      }

      // will-quit 可以为异步：preventDefault 后在 stopEngine 完成再 exit。
      // 这样引擎能收到 SIGTERM、保存 session，不会变成孤儿进程。
      event.preventDefault()
      logger.info('[Lerxu] will-quit.engine.stop (async)')
      global.application.stopEngine().finally(() => {
        app.exit(0)
      })
    })
  }
}
