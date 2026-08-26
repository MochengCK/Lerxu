import { app, dialog } from 'electron'
import is from 'electron-is'

import logger from './LogManager'

const defaults = {
  showDialog: !is.dev()
}
export default class ExceptionHandler {
  constructor (options) {
    this.options = {
      ...defaults,
      ...options
    }

    this.setup()
  }

  setup () {
    if (is.dev()) {
      return
    }
    const { showDialog } = this.options
    process.on('uncaughtException', (err) => {
      const { message, stack } = err
      logger.error(`[Lerxu] Uncaught exception: ${message}`)
      logger.error(stack)

      // 兜底清理钩子（如杀掉引擎进程），由外部注入。
      // 注意：不在这里 process.exit，是否退出由 Electron 默认行为决定，
      // 避免普通异常直接杀掉整个应用。
      if (typeof this.onError === 'function') {
        try {
          this.onError(err)
        } catch (_) {}
      }

      if (showDialog && app.isReady()) {
        dialog.showErrorBox('Error: ', message)
      }
    })
  }
}
