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

export default {
  index: {
    attrs: {
      title: 'LinkCore Download Manager',
      width: 1024,
      height: 768,
      minWidth: 478,
      minHeight: 420,
      transparent: is.macOS()
    },
    bindCloseToHide: true,
    openDevTools: is.dev(),
    url: is.dev() ? 'http://localhost:9080' : `file://${path.join(__dirname, 'index.html').replace(/\\/g, '/')}`
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
