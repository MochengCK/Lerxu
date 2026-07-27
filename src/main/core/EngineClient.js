'use strict'

import { Aria2 } from '@shared/aria2'

import logger from './Logger'
import {
  compactUndefined,
  formatOptionsForEngine
} from '@shared/utils'
import {
  ENGINE_RPC_HOST,
  ENGINE_RPC_PORT,
  EMPTY_STRING
} from '@shared/constants'

const defaults = {
  host: ENGINE_RPC_HOST,
  port: ENGINE_RPC_PORT,
  secret: EMPTY_STRING
}

export default class EngineClient {
  static instance = null
  static client = null

  constructor (options = {}) {
    this.options = {
      ...defaults,
      ...options
    }

    this.init()
  }

  init () {
    this.connect()
  }

  connect () {
    logger.info('[Motrix] main engine client connect', this.options)
    const { host, port, secret } = this.options
    this.client = new Aria2({
      host,
      port,
      secret
    })
  }

  async call (method, ...args) {
    return this.client.call(method, ...args).catch((err) => {
      logger.warn('[Motrix] call client fail:', err.message)
    })
  }

  async changeGlobalOption (options) {
    logger.info('[Motrix] change engine global option:', options)
    const normalizedOptions = { ...options }
    if (normalizedOptions['bt-encryption-mode'] !== undefined) {
      const mode = normalizedOptions['bt-encryption-mode']
      if (mode === 'force') {
        normalizedOptions['bt-require-crypto'] = true
        normalizedOptions['bt-min-crypto-level'] = 'arc4'
      } else if (mode === 'none') {
        normalizedOptions['bt-require-crypto'] = false
        normalizedOptions['bt-min-crypto-level'] = 'plain'
      } else {
        normalizedOptions['bt-require-crypto'] = false
        normalizedOptions['bt-min-crypto-level'] = 'arc4'
      }
      delete normalizedOptions['bt-encryption-mode']
      delete normalizedOptions['bt-force-encryption']
    } else if (normalizedOptions['bt-force-encryption'] !== undefined) {
      const forceEncryption = normalizedOptions['bt-force-encryption'] === true || normalizedOptions['bt-force-encryption'] === 'true'
      normalizedOptions['bt-require-crypto'] = forceEncryption
      normalizedOptions['bt-min-crypto-level'] = forceEncryption ? 'arc4' : 'plain'
    }
    const args = formatOptionsForEngine(normalizedOptions)

    return this.call('changeGlobalOption', args)
  }

  async shutdown (options = {}) {
    const { force = false } = options
    const { secret } = this.options

    const method = force ? 'forceShutdown' : 'shutdown'
    const args = compactUndefined([secret])
    return this.call(method, ...args)
  }
}
