import { powerSaveBlocker } from 'electron'

import logger from './LogManager'

let psbId
export default class EnergyManager {
  startPowerSaveBlocker () {
    logger.info('[Lerxu] EnergyManager.startPowerSaveBlocker', psbId)
    if (psbId && powerSaveBlocker.isStarted(psbId)) {
      return
    }

    psbId = powerSaveBlocker.start('prevent-app-suspension')
    logger.info('[Lerxu] start power save blocker:', psbId)
  }

  stopPowerSaveBlocker () {
    logger.info('[Lerxu] EnergyManager.stopPowerSaveBlocker', psbId)
    if (typeof psbId === 'undefined' || !powerSaveBlocker.isStarted(psbId)) {
      return
    }

    powerSaveBlocker.stop(psbId)
    logger.info('[Lerxu] stop power save blocker:', psbId)
    psbId = undefined
  }
}
