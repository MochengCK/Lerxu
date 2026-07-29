/**
 * This file is used specifically and only for development. It installs
 * `electron-debug` & `vue-devtools`. There shouldn't be any need to
 *  modify this file, but it can be used to extend your development
 *  environment.
 */

/* eslint-disable */

// Install `vue-devtools` (wrapped in try-catch to avoid blocking app startup)
try {
  const electron = require('electron')
  if (electron && electron.app && typeof electron.app.whenReady === 'function') {
    electron.app.whenReady().then(() => {
      try {
        let installExtension = require('electron-devtools-installer')
        installExtension.default(installExtension.VUEJS_DEVTOOLS)
          .then(() => {})
          .catch(err => {
            console.log('Unable to install `vue-devtools`: \n', err)
          })
      } catch (err) {
        console.log('vue-devtools installer not available:', err)
      }
    })
  } else {
    console.log('electron module not available in dev mode, skipping vue-devtools')
  }
} catch (err) {
  console.log('Failed to install vue-devtools:', err)
}

// Require `main` process to boot app
require('./index')
