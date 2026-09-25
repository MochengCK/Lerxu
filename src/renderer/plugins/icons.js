/**
 * Element Plus icon plugin.
 *
 * Registers all @element-plus/icons-vue components globally so they can be
 * used in templates as <el-icon><Close /></el-icon>.
 *
 * Usage in main.js:
 *   import { setupIcons } from '@/plugins/icons'
 *   setupIcons(app)
 */
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

/**
 * Register all Element Plus icons globally.
 * @param {import('vue').App} app
 */
export function setupIcons (app) {
  for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(name, component)
  }
}
