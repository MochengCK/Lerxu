import is from 'electron-is'
import { EventEmitter } from 'node:events'
import { app, nativeImage } from 'electron'

import {
  APP_RUN_MODE
} from '@shared/constants'
import { convertArrayBufferToBuffer } from '../utils/index'

const enabled = is.macOS()

export default class DockManager extends EventEmitter {
  constructor (options) {
    super()
    this.options = options
    const { runMode } = this.options
    if (runMode === APP_RUN_MODE.TRAY) {
      this.hide()
    }
  }

  show = enabled
    ? () => {
      if (app.dock.isVisible()) {
        return
      }

      return app.dock.show()
    }
    : () => {}

  hide = enabled
    ? () => {
      if (!app.dock.isVisible()) {
        return
      }

      app.dock.hide()
    }
    : () => {}

  // 渲染层合成的 Dock 图标（应用图标 + 上传/下载两个独立速度容器，
  // 居中叠在图标上方）。系统 badge 长度受限会省略速度文本，
  // 故改用自绘图标完整展示。
  setSpeedIcon = enabled
    ? (arrayBuffer) => {
      const buffer = convertArrayBufferToBuffer(arrayBuffer)
      const image = nativeImage.createFromBuffer(buffer, {
        scaleFactor: 2
      })
      app.dock.setIcon(image)
    }
    : () => {}

  openDock = enabled
    ? (path) => {
      app.dock.downloadFinished(path)
    }
    : (path) => {}
}
