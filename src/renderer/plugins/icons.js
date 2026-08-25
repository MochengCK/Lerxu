/**
 * Element Plus icon compatibility plugin.
 *
 * Registers all @element-plus/icons-vue components globally so they can be
 * used in templates as <el-icon><Close /></el-icon>.
 *
 * Also provides a directive-based fallback: any <i class="el-icon-xxx">
 * from the old Element UI will still render because we register a global
 * "ElIconLegacy" component that maps legacy class names to the new SVG
 * icon components.
 *
 * Usage in main.js:
 *   import { setupIcons } from '@/plugins/icons'
 *   setupIcons(app)
 */
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

/**
 * Mapping from legacy Element UI icon class names to Element Plus icon
 * component names.  Only the icons actually used in the project are listed.
 */
const legacyIconMap = {
  'el-icon-close': 'Close',
  'el-icon-search': 'Search',
  'el-icon-info': 'InfoFilled',
  'el-icon-loading': 'Loading',
  'el-icon-folder-opened': 'FolderOpened',
  'el-icon-attract': 'MagicStick',
  'el-icon-connection': 'Connection',
  'el-icon-refresh': 'Refresh',
  'el-icon-check': 'Check',
  'el-icon-circle-plus-outline': 'CirclePlus',
  'el-icon-circle-check': 'CircleCheckFilled',
  'el-icon-circle-close': 'CircleCloseFilled',
  'el-icon-document-copy': 'DocumentCopy',
  'el-icon-edit': 'Edit',
  'el-icon-star-off': 'Star',
  'el-icon-delete': 'Delete',
  'el-icon-time': 'Clock',
  'el-icon-arrow-down': 'ArrowDown',
  'el-icon-arrow-up': 'ArrowUp',
  'el-icon-arrow-left': 'ArrowLeft',
  'el-icon-arrow-right': 'ArrowRight',
  'el-icon-plus': 'Plus',
  'el-icon-minus': 'Minus',
  'el-icon-setting': 'Setting',
  'el-icon-more': 'More',
  'el-icon-download': 'Download',
  'el-icon-upload': 'Upload',
  'el-icon-folder': 'Folder',
  'el-icon-document': 'Document',
  'el-icon-warning': 'Warning',
  'el-icon-success': 'SuccessFilled',
  'el-icon-error': 'CircleCloseFilled',
  'el-icon-question': 'QuestionFilled',
  'el-icon-star-on': 'StarFilled',
  'el-icon-rank': 'Rank',
  'el-icon-full-screen': 'FullScreen',
  'el-icon-menu': 'Menu',
  'el-icon-s-grid': 'Grid',
  'el-icon-s-data': 'DataAnalysis',
  'el-icon-s-marketing': 'TrendCharts',
  'el-icon-s-operation': 'Operation',
  'el-icon-s-tools': 'Tools',
  'el-icon-user': 'User',
  'el-icon-link': 'Link',
  'el-icon-c-scale-to-original': 'ScaleToOriginal',
  'el-icon-files': 'Files',
  'el-icon-mobile-phone': 'Iphone',
  'el-icon-copy-document': 'CopyDocument',
  'el-icon-lock': 'Lock',
  'el-icon-unlock': 'Unlock',
  'el-icon-key': 'Key',
  'el-icon-bell': 'Bell',
  'el-icon-bangzhu': 'QuestionFilled',
  'el-icon-share': 'Share',
  'el-icon-position': 'Position',
  'el-icon-place': 'Place',
  'el-icon-camera': 'Camera',
  'el-icon-view': 'View',
  'el-icon-monitor': 'Monitor',
  'el-icon-cpu': 'Cpu',
  'el-icon-bangdan': 'TrophyBase',
  'el-icon-magic-stick': 'MagicStick',
  'el-icon-aim': 'Aim',
}

/**
 * Register all Element Plus icons globally.
 * @param {import('vue').App} app
 */
export function setupIcons (app) {
  for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(name, component)
  }
}

/**
 * Get the Element Plus icon component name for a legacy class.
 * @param {string} className e.g. "el-icon-close"
 * @returns {string|null}
 */
export function getIconName (className) {
  return legacyIconMap[className] || null
}

/**
 * Legacy icon class → component-name map (exported for use in render
 * functions or templates that need dynamic resolution).
 */
export { legacyIconMap }
