import { EventEmitter } from 'node:events'
import { app } from 'electron'
import is from 'electron-is'

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

    logger.info('[LinkCore] openedAtLogin:', this.openedAtLogin)

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
      require('@electron/remote/main').enable(window.webContents)
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
      logger.info(`[LinkCore] open-url: ${url}`)
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
      logger.info(`[LinkCore] open-file: ${path}`)
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
    logger.info('[LinkCore] handleAppLaunchArgv:', argv)

    // args: array, extra: map
    const { args, extra } = splitArgv(argv)
    logger.info('[LinkCore] split argv args:', args)
    logger.info('[LinkCore] split argv extra:', extra)
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
        logger.info('[LinkCore] activate')
        // init 失败后 windowManager 可能未初始化，尝试重新 init
        if (!global.application.windowManager) {
          global.application.retryStart('index')
        } else {
          global.application.showPage('index')
        }
      }
    })
  }

  handleAppWillQuit () {
    app.on('will-quit', (event) => {
      logger.info('[LinkCore] will-quit')
      // 如果 Application.quit() 已经处理了引擎关闭（engine.instance 为 null），
      // 则直接退出，不重复操作。
      if (!global.application || !global.application.engine || !global.application.engine.instance) {
        return
      }

      // will-quit 可以为异步：preventDefault 后在 stopEngine 完成再 exit。
      // 这样引擎能收到 SIGTERM、保存 session，不会变成孤儿进程。
      event.preventDefault()
      logger.info('[LinkCore] will-quit.engine.stop (async)')
      global.application.stopEngine().finally(() => {
        app.exit(0)
      })
    })
  }
}
