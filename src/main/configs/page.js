import is from 'electron-is'
import path from 'path'

/* 主进程经 vite 构建后，dev 与 prod 的 __dirname 恒为 dist/electron，
   独立 HTML 页面（pages/）与之同级。旧代码 dev 分支用 ../pages 指向
   dist/pages（不存在），导致编辑规则/视频嗅探等窗口在 dev 下加载失败、
   打开后空白。pages 目录由 vite.config.js 的 copyMainPages 插件同步。 */
const getPageUrl = (file) => {
  return `file://${path.join(__dirname, 'pages', file).replace(/\\/g, '/')}`
}

const getVideoSnifferUrl = () => getPageUrl('video-sniffer.html')

const getVideoSnifferAddFormatUrl = () => getPageUrl('video-sniffer-add-format.html')

const getFileCategoriesUrl = () => getPageUrl('file-categories.html')

/* 偏好设置已内嵌在主窗口 SPA 中（/preference 路由），
   不再打开独立窗口，因此没有对应的 page 配置。 */

export default {
  index: {
    attrs: {
      title: 'Lerxu',
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
