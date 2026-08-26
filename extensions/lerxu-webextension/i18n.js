// 多语言翻译数据
const translations = {
  en: {
    extensionName: "Lerxu",
    extensionDescription: "Deeply integrated browser extension for Lerxu",
    actionTitle: "Lerxu",
    popupTitle: "Lerxu",
    rpcAddress: "RPC Address",
    connectionStatus: "Connection Status",
    clientVersion: "Client Version",
    downloadSpeed: "Download Speed",
    uploadSpeed: "Upload Speed",
    totalSpeed: "Total Download Speed",
    downloadTasks: "Download Tasks",
    noTasks: "No download tasks",
    autoHijack: "Auto-hijack browser downloads",
    connected: "Connected",
    disconnected: "Disconnected",
    contextMenuDownload: "Download with Lerxu",
    labelExcludeCurrentSite: "Exclude this site",
    labelRemove: "Remove",
    labelRemoveFromExclude: "Restore download",
    labelAdded: "Added",
    labelRemoved: "Removed",
    labelSuccess: "Success",
    labelFailed: "Failed",
    labelAdd: "Add",
    placeholderInputExt: "Enter file extension",
    placeholderExample: "Example: exe, zip, rar"
  },
  zh_CN: {
    extensionName: "Lerxu",
    extensionDescription: "Lerxu 深度集成浏览器插件",
    actionTitle: "Lerxu",
    popupTitle: "Lerxu",
    rpcAddress: "RPC 地址",
    connectionStatus: "连接状态",
    clientVersion: "客户端版本",
    downloadSpeed: "下载速度",
    uploadSpeed: "上传速度",
    totalSpeed: "总下载速度",
    downloadTasks: "下载任务",
    noTasks: "暂无下载任务",
    autoHijack: "自动接管浏览器下载",
    connected: "已连接",
    disconnected: "未连接",
    contextMenuDownload: "使用 Lerxu 下载",
    labelExcludeCurrentSite: "不接管此网站",
    labelRemove: "移除",
    labelRemoveFromExclude: "恢复接管",
    labelAdded: "已添加",
    labelRemoved: "已移除",
    labelSuccess: "成功",
    labelFailed: "操作失败",
    labelAdd: "添加",
    placeholderInputExt: "输入文件扩展名",
    placeholderExample: "示例: exe, zip, rar"
  },
  zh_TW: {
    extensionName: "Lerxu",
    extensionDescription: "Lerxu 深度整合瀏覽器外掛程式",
    actionTitle: "Lerxu",
    popupTitle: "Lerxu",
    rpcAddress: "RPC 地址",
    connectionStatus: "連接狀態",
    clientVersion: "客戶端版本",
    downloadSpeed: "下載速度",
    uploadSpeed: "上傳速度",
    totalSpeed: "總下載速度",
    downloadTasks: "下載任務",
    noTasks: "暫無下載任務",
    autoHijack: "自動接管瀏覽器下載",
    connected: "已連接",
    disconnected: "未連接",
    contextMenuDownload: "使用 Lerxu 下載"
  }
}

// 当前语言
let currentLocale = 'en'

// 初始化语言
const initLocale = async () => {
  try {
    // 从 storage 读取客户端同步的语言
    const config = await new Promise((resolve) => {
      chrome.storage.local.get(['browserLocale'], (result) => {
        resolve(result || {})
      })
    })
    
    console.log('[i18n] Storage config:', config)
    
    if (config.browserLocale && translations[config.browserLocale]) {
      currentLocale = config.browserLocale
      console.log('[i18n] Using synced locale from storage:', currentLocale)
    } else {
      // 回退到浏览器默认语言
      const browserLang = chrome.i18n.getUILanguage()
      console.log('[i18n] No synced locale, using browser language:', browserLang)
      if (browserLang.startsWith('zh-CN') || browserLang.startsWith('zh_CN')) {
        currentLocale = 'zh_CN'
      } else if (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh_TW')) {
        currentLocale = 'zh_TW'
      } else {
        currentLocale = 'en'
      }
      console.log('[i18n] Fallback locale:', currentLocale)
    }
  } catch (e) {
    console.error('[i18n] Failed to init locale:', e)
    currentLocale = 'en'
  }
  
  console.log('[i18n] Final locale:', currentLocale)
  return currentLocale
}

// 获取翻译文本
const t = (key) => {
  const locale = translations[currentLocale] || translations.en
  return locale[key] || key
}
