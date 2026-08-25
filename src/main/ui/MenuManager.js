import { EventEmitter } from 'node:events'
import { Menu } from 'electron'

import keymap from '@shared/keymap'
import {
  translateTemplate,
  flattenMenuItems,
  updateStates
} from '../utils/menu'
import { getI18n } from '../ui/Locale'

// 静态引入各平台菜单模板，确保 Rollup 打包时内联 JSON
// （动态 require(`../menus/${platform}.json`) 在打包后会找不到模块）
import darwinMenu from '../menus/darwin.json'
import win32Menu from '../menus/win32.json'
import linuxMenu from '../menus/linux.json'

const menuTemplates = {
  darwin: darwinMenu,
  win32: win32Menu,
  linux: linuxMenu
}

export default class MenuManager extends EventEmitter {
  constructor (options) {
    super()
    this.options = options
    this.i18n = getI18n()

    this.keymap = keymap
    this.items = {}

    this.load()

    this.setup()
  }

  load () {
    const template = menuTemplates[process.platform] || linuxMenu
    this.template = template.menu
  }

  getMergedKeymap () {
    const base = { ...keymap }
    let custom = {}
    try {
      if (global.application && global.application.configManager) {
        // 兼容历史错误保存的 camelCase 键名
        custom = global.application.configManager.getUserConfig('custom-keymap') ||
          global.application.configManager.getUserConfig('customKeymap') || {}
      }
    } catch (e) {
      custom = {}
    }
    try {
      const commandsOverridden = new Set(Object.values(custom || {}))
      Object.keys(base).forEach(ks => {
        const cmd = base[ks]
        if (commandsOverridden.has(cmd)) {
          delete base[ks]
        }
      })
    } catch (e) {}
    return { ...base, ...custom }
  }

  build () {
    const mergedKeymap = this.getMergedKeymap()
    const keystrokesByCommand = {}
    for (const item in mergedKeymap) {
      keystrokesByCommand[mergedKeymap[item]] = item
    }

    // Deepclone the menu template to refresh menu
    const template = JSON.parse(JSON.stringify(this.template))
    const tpl = translateTemplate(template, keystrokesByCommand, this.i18n)
    const menu = Menu.buildFromTemplate(tpl)
    return menu
  }

  setup () {
    const menu = this.build()
    Menu.setApplicationMenu(menu)
    this.items = flattenMenuItems(menu)
  }

  handleLocaleChange (locale) {
    this.setup()
  }

  updateMenuStates (visibleStates, enabledStates, checkedStates) {
    updateStates(this.items, visibleStates, enabledStates, checkedStates)
  }

  updateMenuItemVisibleState (id, flag) {
    const visibleStates = {
      [id]: flag
    }
    this.updateMenuStates(visibleStates, null, null)
  }

  updateMenuItemEnabledState (id, flag) {
    const enabledStates = {
      [id]: flag
    }
    this.updateMenuStates(null, enabledStates, null)
  }
}
