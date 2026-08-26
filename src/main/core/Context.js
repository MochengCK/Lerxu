import logger from './LogManager'
import {
  getEnginePath,
  getAria2BinPath,
  getAria2ConfPath,
  getSessionPath,
  getAria2LogPath,
  getAria2LogDir
} from '../utils'

const { platform, arch } = process

export default class Context {
  constructor () {
    this.init()
  }

  getLogPath () {
    try {
      const file = logger.transports && logger.transports.file
      if (file && typeof file.getFile === 'function') {
        const { path } = file.getFile()
        return path
      }
    } catch (e) {
      // ignore
    }
    return ''
  }

  init () {
    // The key of Context cannot be the same as that of userConfig and systemConfig.
    this.context = {
      platform: platform,
      arch: arch,
      'log-path': this.getLogPath(),
      'session-path': getSessionPath(),
      'engine-path': getEnginePath(platform, arch),
      'aria2-bin-path': getAria2BinPath(platform, arch),
      'aria2-conf-path': getAria2ConfPath(platform, arch),
      'aria2-log-path': getAria2LogPath(),
      'aria2-log-dir': getAria2LogDir()
    }

    logger.info('[Lerxu] Context.init===>', this.context)
  }

  get (key) {
    if (typeof key === 'undefined') {
      return this.context
    }

    return this.context[key]
  }
}
