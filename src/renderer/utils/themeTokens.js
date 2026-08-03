/**
 * ThemeTokens — 统一主题状态管理（渲染进程）
 * ====================================
 *
 * 这是整个程序主题颜色的唯一真相来源 (single source of truth)。
 * Tokens.scss 中的 CSS 自定义属性值必须与此处保持一致。
 *
 * 用法:
 *   import themeTokens from '@/utils/themeTokens'
 *
 *   // 获取当前生效的主题
 *   const effective = themeTokens.resolveTheme(userPref, systemTheme)
 *
 *   // 获取该主题的所有颜色
 *   const colors = themeTokens.getColors(effective)
 *
 *   // 应用主题类到 DOM
 *   themeTokens.applyTheme(rootEl, effective)
 *
 *   // 获取进度窗口主题 payload
 *   const payload = themeTokens.getProgressWindowPayload(effective)
 */

import { APP_THEME } from '@shared/constants'

/* ============================================================
   颜色定义 — 与 Tokens.scss 一一对应
   ============================================================ */

const LIGHT_COLORS = {
  /* Brand */
  primary: '#1a7fe0',
  primaryRgb: '26, 127, 224',
  primaryLight: 'rgba(26, 127, 224, 0.12)',
  primaryLighter: 'rgba(26, 127, 224, 0.25)',
  success: '#67c23a',
  successColor: '#67c23a',
  primaryColor: '#1a7fe0',
  warning: '#e6a23c',
  danger: '#f56c6c',
  dangerHover: '#f78989',
  info: '#909399',

  /* Text */
  textPrimary: '#2c3e50',
  textColor: '#2c3e50',
  textRegular: '#5a6c7d',
  textSecondary: '#8492a6',
  textPlaceholder: '#99a',
  textDisabled: '#c0c4cc',
  textInverse: '#ffffff',

  /* Background */
  bgApp: 'transparent',
  bgMain: '#ffffff',
  bgPanel: '#f8f9fa',
  bgPanelRgb: '248, 249, 250',
  bgSubnav: '#ffffff',
  bgSubnavThreeColumn: '#f0f4f8',
  bgAside: 'rgba(255, 255, 255, 0.82)',
  bgInput: '#ffffff',
  bgInputDisabled: '#f8f9fa',
  bgButton: '#ffffff',
  bgButtonHover: '#f8f9fa',
  bgHover: 'rgba(26, 35, 50, 0.04)',
  bgActive: 'rgba(26, 35, 50, 0.08)',
  bgDropdown: '#ffffff',
  bgPopover: '#ffffff',

  /* Border */
  borderBase: '#d3dde6',
  borderLight: '#e2e8f0',
  borderLighter: '#eef2f7',
  borderHover: '#8492a6',
  borderDivider: 'rgba(26, 35, 50, 0.08)',
  borderPanel: 'rgba(26, 35, 50, 0.08)',

  /* Subnav */
  subnavTitle: '#2c3e50',
  subnavText: '#5a6c7d',
  subnavActiveText: '#1a7fe0',
  subnavActiveBg: 'rgba(0, 0, 0, 0.12)',
  subnavBorder: '#d3dde6',
  subnavHoverBg: 'rgba(0, 0, 0, 0.06)',
  subnavActiveItemBg: 'rgba(0, 0, 0, 0.12)',

  /* Progress window */
  bodyBg: '#ffffff',
  statusColor: '#5a6c7d',
  metaColor: '#3d4d5c',
  secondaryTextColor: '#8492a6',
  barBg: 'rgba(0, 0, 0, 0.06)',
  barInner: '#67c23a',
  controlsBg: '#ffffff',
  controlsBorder: '#d3dde6',
  controlsDivider: 'rgba(26, 35, 50, 0.08)',
  controlsItemColor: '#2c3e50',
  controlsItemHoverBg: '#f0f4f8',
  titleBtnHoverBg: 'rgba(26, 35, 50, 0.08)',
  indicatorBg: '#d3dde6',

  /* Tab */
  tabBg: 'rgba(0, 0, 0, 0.04)',
  tabColor: '#5a6c7d',
  tabBorder: '#d3dde6',
  tabHoverBg: '#f0f4f8',
  tabActiveBg: '#1a7fe0',
  tabActiveColor: '#ffffff',

  /* Pieces */
  pieceColors: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#39d353'],
  pieceAtomOutline: 'rgba(26, 35, 50, 0.06)',

  /* Misc */
  buttonBg: '#1a7fe0',
  buttonHoverBg: '#1a7fe0',

  /* Scrollbar */
  scrollbarThumb: 'rgba(0, 0, 0, 0.2)',
  scrollbarThumbInactive: 'rgba(0, 0, 0, 0.1)',

  /* Background image mode */
  bgImageAside: 'rgba(255, 255, 255, 0.9)',
  bgImageSubnav: 'rgba(248, 249, 250, 0.9)'
}

const DARK_COLORS = {
  /* Brand */
  primary: '#4a9eff',
  primaryRgb: '74, 158, 255',
  primaryLight: 'rgba(74, 158, 255, 0.12)',
  primaryLighter: 'rgba(74, 158, 255, 0.25)',
  success: '#67c23a',
  successColor: '#67c23a',
  primaryColor: '#4a9eff',
  warning: '#e6a23c',
  danger: '#f56c6c',
  dangerHover: '#f78989',
  info: '#909399',

  /* Text */
  textPrimary: '#dfe3e8',
  textColor: '#dfe3e8',
  textRegular: '#c4cad3',
  textSecondary: '#8b95a3',
  textPlaceholder: '#6b7280',
  textDisabled: '#6b7280',
  textInverse: '#ffffff',

  /* Background */
  bgApp: 'transparent',
  bgMain: '#1e2228',
  bgPanel: '#262a31',
  bgPanelRgb: '38, 42, 49',
  bgSubnav: '#1e2228',
  bgSubnavThreeColumn: '#1a1e24',
  bgAside: 'rgba(12, 16, 22, 0.92)',
  bgInput: '#2a2e35',
  bgInputDisabled: '#1e2228',
  bgButton: '#363b44',
  bgButtonHover: '#2a2e35',
  bgHover: '#363b44',
  bgActive: 'rgba(255, 255, 255, 0.08)',
  bgDropdown: '#2e333b',
  bgPopover: '#2e333b',

  /* Border */
  borderBase: '#3d424d',
  borderLight: 'rgba(255, 255, 255, 0.08)',
  borderLighter: 'rgba(255, 255, 255, 0.06)',
  borderHover: '#6b7280',
  borderDivider: 'rgba(255, 255, 255, 0.06)',
  borderPanel: 'rgba(255, 255, 255, 0.08)',

  /* Subnav */
  subnavTitle: '#e8eaed',
  subnavText: '#8b95a3',
  subnavActiveText: '#4a9eff',
  subnavActiveBg: 'rgba(255, 255, 255, 0.15)',
  subnavBorder: '#3d424d',
  subnavHoverBg: 'rgba(255, 255, 255, 0.14)',
  subnavActiveItemBg: 'rgba(255, 255, 255, 0.22)',

  /* Progress window */
  bodyBg: '#262a31',
  statusColor: '#8b95a3',
  metaColor: '#c4cad3',
  secondaryTextColor: '#8b95a3',
  barBg: 'rgba(255, 255, 255, 0.1)',
  barInner: '#67c23a',
  controlsBg: '#363b44',
  controlsBorder: '#3d424d',
  controlsDivider: 'rgba(255, 255, 255, 0.06)',
  controlsItemColor: '#dfe3e8',
  controlsItemHoverBg: 'rgba(255, 255, 255, 0.08)',
  titleBtnHoverBg: 'rgba(255, 255, 255, 0.08)',
  indicatorBg: 'rgba(255, 255, 255, 0.12)',

  /* Tab */
  tabBg: 'rgba(255, 255, 255, 0.06)',
  tabColor: '#8b95a3',
  tabBorder: 'rgba(255, 255, 255, 0.08)',
  tabHoverBg: 'rgba(255, 255, 255, 0.08)',
  tabActiveBg: '#4a9eff',
  tabActiveColor: '#ffffff',

  /* Pieces */
  pieceColors: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  pieceAtomOutline: 'transparent',

  /* Misc */
  buttonBg: '#3d424d',
  buttonHoverBg: '#4a505c',

  /* Scrollbar */
  scrollbarThumb: 'rgba(255, 255, 255, 0.2)',
  scrollbarThumbInactive: 'rgba(255, 255, 255, 0.1)',

  /* Background image mode */
  bgImageAside: 'rgba(12, 16, 22, 0.9)',
  bgImageSubnav: 'rgba(30, 34, 40, 0.9)'
}

const COLOR_MAP = {
  light: LIGHT_COLORS,
  dark: DARK_COLORS
}

/* ============================================================
   主题解析
   ============================================================ */

/**
 * 根据用户偏好和系统主题，解析出实际生效的主题。
 * @param {string} userPreference - 'auto' | 'light' | 'dark'
 * @param {string} systemTheme - 'light' | 'dark'
 * @returns {string} 'light' | 'dark'
 */
function resolveTheme (userPreference, systemTheme) {
  if (userPreference === APP_THEME.AUTO) {
    return systemTheme === APP_THEME.DARK ? 'dark' : 'light'
  }
  return userPreference === APP_THEME.DARK ? 'dark' : 'light'
}

/**
 * 判断是否为深色主题。
 */
function isDark (effectiveTheme) {
  return effectiveTheme === 'dark'
}

/* ============================================================
   颜色获取
   ============================================================ */

/**
 * 获取指定主题的完整颜色对象。
 * @param {string} effectiveTheme - 'light' | 'dark'
 * @returns {object} 颜色对象
 */
function getColors (effectiveTheme) {
  const key = effectiveTheme === 'dark' ? 'dark' : 'light'
  return { ...COLOR_MAP[key] }
}

/**
 * 获取进度窗口所需的主题 payload。
 * 将颜色映射为进度窗口 HTML 所需的字段名。
 * @param {string} effectiveTheme - 'light' | 'dark'
 * @returns {object} 进度窗口主题 payload
 */
function getProgressWindowPayload (effectiveTheme) {
  const c = getColors(effectiveTheme)
  return {
    bodyBg: c.bodyBg,
    textColor: c.textPrimary,
    statusColor: c.statusColor,
    metaColor: c.metaColor,
    barBg: c.barBg,
    barInner: c.barInner,
    controlsBg: c.controlsBg,
    controlsBorder: c.controlsBorder,
    controlsDivider: c.controlsDivider,
    controlsItemColor: c.controlsItemColor,
    controlsItemHoverBg: c.controlsItemHoverBg,
    titleBtnHoverBg: c.titleBtnHoverBg,
    indicatorBg: c.indicatorBg,
    primaryColor: c.primary,
    pieceColors: c.pieceColors,
    tabBg: c.tabBg,
    tabColor: c.tabColor,
    tabBorder: c.tabBorder,
    tabHoverBg: c.tabHoverBg,
    tabActiveBg: c.tabActiveBg,
    tabActiveColor: c.tabActiveColor,
    successColor: c.success
  }
}

/* ============================================================
   DOM 主题类管理
   ============================================================ */

const THEME_CLASSES = ['theme-light', 'theme-dark']

/**
 * 将主题类应用到根元素。
 * 移除旧的主题类，添加新的主题类。
 * @param {HTMLElement} el - 根元素 (通常是 #app)
 * @param {string} effectiveTheme - 'light' | 'dark'
 */
function applyTheme (el, effectiveTheme) {
  if (!el) return
  const newClass = `theme-${effectiveTheme}`
  THEME_CLASSES.forEach(cls => {
    if (cls !== newClass) {
      el.classList.remove(cls)
    }
  })
  if (!el.classList.contains(newClass)) {
    el.classList.add(newClass)
  }
}

/* ============================================================
   主题变更监听
   ============================================================ */

const listeners = new Set()

/**
 * 注册主题变更回调。
 * @param {function} callback - (effectiveTheme) => void
 * @returns {function} 取消注册函数
 */
function onThemeChange (callback) {
  if (typeof callback !== 'function') return () => {}
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/**
 * 通知所有监听器主题已变更。
 * @param {string} effectiveTheme - 'light' | 'dark'
 */
function notifyThemeChange (effectiveTheme) {
  listeners.forEach(cb => {
    try {
      cb(effectiveTheme)
    } catch (e) {
      console.warn('[ThemeManager] theme change listener error:', e)
    }
  })
}

/* ============================================================
   导出
   ============================================================ */

export default {
  resolveTheme,
  isDark,
  getColors,
  getProgressWindowPayload,
  applyTheme,
  onThemeChange,
  notifyThemeChange,
  LIGHT_COLORS,
  DARK_COLORS
}
