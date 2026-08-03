import { powerSaveBlocker } from 'electron'

import logger from './LogManager'

let psbId
export default class EnergyManager {
  startPowerSaveBlocker () {
    logger.info('[LinkCore] EnergyManager.startPowerSaveBlocker', psbId)
    if (psbId && powerSaveBlocker.isStarted(psbId)) {
      return
    }

    psbId = powerSaveBlocker.start('prevent-app-suspension')
    logger.info('[LinkCore] start power save blocker:', psbId)
  }

  stopPowerSaveBlocker () {
    logger.info('[LinkCore] EnergyManager.stopPowerSaveBlocker', psbId)
    if (typeof psbId === 'undefined' || !powerSaveBlocker.isStarted(psbId)) {
      return
    }

    powerSaveBlocker.stop(psbId)
    logger.info('[LinkCore] stop power save blocker:', psbId)
    psbId = undefined
  }
}
