import { EventEmitter } from 'node:events'
import { app } from 'electron'
import is from 'electron-is'

import logger from './LogManager'
import protocolMap from '../configs/protocol'
import { ADD_TASK_TYPE } from '@shared/constants'

export default class ProtocolManager extends EventEmitter {
  constructor (options = {}) {
    super()
    this.options = options

    // package.json:build.protocols[].schemes[]
    // options.protocols: { 'magnet': true, 'thunder': false }
    // 兼容清理：旧版协议 scheme 键不再注册（防止历史配置残留）
    const legacySchemes = new Set(['mo', 'motrix'])
    const savedProtocols = Object.fromEntries(
      Object.entries(options.protocols || {}).filter(([scheme]) => !legacySchemes.has(scheme))
    )
    this.protocols = {
      lerxu: true,
      ...savedProtocols
    }

    this.init()
  }

  init () {
    const { protocols } = this
    this.setup(protocols)
  }

  setup (protocols = {}) {
    if (is.dev() || is.mas()) {
      return
    }

    Object.keys(protocols).forEach((protocol) => {
      const enabled = protocols[protocol]
      if (enabled) {
        if (!app.isDefaultProtocolClient(protocol)) {
          app.setAsDefaultProtocolClient(protocol)
        }
      } else {
        app.removeAsDefaultProtocolClient(protocol)
      }
    })
  }

  handle (url) {
    logger.info(`[Lerxu] protocol url: ${url}`)

    if (
      url.toLowerCase().startsWith('ftp:') ||
      url.toLowerCase().startsWith('http:') ||
      url.toLowerCase().startsWith('https:') ||
      url.toLowerCase().startsWith('magnet:') ||
      url.toLowerCase().startsWith('thunder:') ||
      url.toLowerCase().startsWith('ed2k:')
    ) {
      return this.handleResourceProtocol(url)
    }

    if (
      url.toLowerCase().startsWith('lerxu:')
    ) {
      return this.handleAppProtocol(url)
    }
  }

  handleResourceProtocol (url) {
    if (!url) {
      return
    }

    global.application.sendCommandToAll('application:new-task', {
      type: ADD_TASK_TYPE.URI,
      uri: url
    })
  }

  handleAppProtocol (url) {
    let parsed
    try {
      parsed = new URL(url)
    } catch (err) {
      logger.warn('[Lerxu] malformed protocol url, ignored:', url, err && err.message ? err.message : err)
      return
    }
    const { host, search } = parsed
    logger.info('[Lerxu] protocol parsed:', parsed, host)

    const command = protocolMap[host]
    if (!command) {
      return
    }

    // querystring.parse 已废弃，改用 URLSearchParams
    const args = Object.fromEntries(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search))
    global.application.sendCommandToAll(command, args)
  }
}
