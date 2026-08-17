import is from 'electron-is'
import path from 'path'

const getVideoSnifferUrl = () => {
  if (is.dev()) {
    return `file://${path.resolve(__dirname, '../pages/video-sniffer.html').replace(/\\/g, '/')}`
  }
  return `file://${path.join(__dirname, 'pages/video-sniffer.html').replace(/\\/g, '/')}`
}

const getVideoSnifferAddFormatUrl = () => {
  if (is.dev()) {
    return `file://${path.resolve(__dirname, '../pages/video-sniffer-add-format.html').replace(/\\/g, '/')}`
  }
  return `file://${path.join(__dirname, 'pages/video-sniffer-add-format.html').replace(/\\/g, '/')}`
}

const getFileCategoriesUrl = () => {
  if (is.dev()) {
    return `file://${path.resolve(__dirname, '../pages/file-categories.html').replace(/\\/g, '/')}`
  }
  return `file://${path.join(__dirname, 'pages/file-categories.html').replace(/\\/g, '/')}`
}

const getPreferenceUrl = () => {
  if (is.dev()) {
    return 'http://localhost:9080/#/preference-window'
  }
  return `file://${path.join(__dirname, 'index.html').replace(/\\/g, '/')}#/preference-window`
}

export default {
  index: {
    attrs: {
      title: 'LinkCore',
      width: 1100,
      height: 750,
      minWidth: 480,
      minHeight: 420
      // macOS 透明由 vibrancy + backgroundColor 透明处理，
      // 不使用 transparent: true（会导致窗口在内容渲染前完全透明）
    },
    bindCloseToHide: true,
    openDevTools: is.dev(),
    url: is.dev() ? 'http://localhost:9080' : `file://${path.join(__dirname, 'index.html').replace(/\\/g, '/')}`
  },
  preference: {
    attrs: {
      title: '偏好设置',
      width: 900,
      height: 650,
      minWidth: 780,
      minHeight: 560,
      resizable: true,
      maximizable: true,
      minimizable: true
      // macOS 透明由 vibrancy + backgroundColor 透明处理，
      // 不使用 transparent: true（会导致偏好设置窗口在 Vue 渲染前
      // 完全透明，背景不可见）
    },
    bindCloseToHide: false,
    openDevTools: is.dev(),
    url: getPreferenceUrl()
  },
  'video-detection-settings': {
    attrs: {
      title: '视频嗅探设置',
      width: 500,
      height: 450,
      minHeight: 399,
      resizable: false,
      maximizable: false,
      minimizable: true
    },
    bindCloseToHide: false,
    openDevTools: is.dev(),
    url: getVideoSnifferUrl()
  },
  'video-sniffer-add-format': {
    attrs: {
      title: '添加格式',
      width: 400,
      height: 220,
      resizable: false,
      maximizable: false,
      minimizable: false
    },
    bindCloseToHide: false,
    openDevTools: is.dev(),
    url: getVideoSnifferAddFormatUrl()
  },
  'file-categories-settings': {
    attrs: {
      title: '文件分类设置',
      width: 700,
      height: 550,
      minHeight: 400,
      resizable: true,
      maximizable: false,
      minimizable: true
    },
    bindCloseToHide: false,
    openDevTools: is.dev(),
    url: getFileCategoriesUrl()
  }
}
