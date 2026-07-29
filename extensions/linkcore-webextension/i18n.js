// 多语言翻译数据
const translations = {
  en: {
    extensionName: "LinkCore",
    extensionDescription: "Deeply integrated browser extension for LinkCore",
    actionTitle: "LinkCore",
    popupTitle: "LinkCore",
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
    contextMenuDownload: "Download with LinkCore",
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
    extensionName: "LinkCore",
    extensionDescription: "LinkCore 深度集成浏览器插件",
    actionTitle: "LinkCore",
    popupTitle: "LinkCore",
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
    contextMenuDownload: "使用 LinkCore 下载",
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
    extensionName: "LinkCore",
    extensionDescription: "LinkCore 深度整合瀏覽器外掛程式",
    actionTitle: "LinkCore",
    popupTitle: "LinkCore",
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
    contextMenuDownload: "使用 LinkCore 下載"
  },
  ja: {
    extensionName: "LinkCore",
    extensionDescription: "LinkCore と深く統合されたブラウザー拡張機能",
    actionTitle: "LinkCore",
    popupTitle: "LinkCore",
    rpcAddress: "RPC アドレス",
    connectionStatus: "接続状態",
    clientVersion: "クライアントバージョン",
    downloadSpeed: "ダウンロード速度",
    uploadSpeed: "アップロード速度",
    totalSpeed: "合計ダウンロード速度",
    downloadTasks: "ダウンロードタスク",
    noTasks: "ダウンロードタスクはありません",
    autoHijack: "ブラウザのダウンロードを自動的にハイジャック",
    connected: "接続済み",
    disconnected: "未接続",
    contextMenuDownload: "LinkCore でダウンロード"
  },
  ko: {
    extensionName: "LinkCore",
    extensionDescription: "LinkCore와 깊이 통합된 브라우저 확장 프로그램",
    actionTitle: "LinkCore",
    popupTitle: "LinkCore",
    rpcAddress: "RPC 주소",
    connectionStatus: "연결 상태",
    clientVersion: "클라이언트 버전",
    downloadSpeed: "다운로드 속도",
    uploadSpeed: "업로드 속도",
    totalSpeed: "총 다운로드 속도",
    downloadTasks: "다운로드 작업",
    noTasks: "다운로드 작업 없음",
    autoHijack: "브라우저 다운로드 자동 가로채기",
    connected: "연결됨",
    disconnected: "연결 안 됨",
    contextMenuDownload: "LinkCore로 다운로드"
  },
  es: {
    extensionName: "LinkCore",
    extensionDescription: "Extensión de navegador profundamente integrada para LinkCore",
    actionTitle: "LinkCore",
    popupTitle: "LinkCore",
    rpcAddress: "Dirección RPC",
    connectionStatus: "Estado de conexión",
    clientVersion: "Versión del cliente",
    downloadSpeed: "Velocidad de descarga",
    uploadSpeed: "Velocidad de subida",
    totalSpeed: "Velocidad total de descarga",
    downloadTasks: "Tareas de descarga",
    noTasks: "Sin tareas de descarga",
    autoHijack: "Secuestrar automáticamente las descargas del navegador",
    connected: "Conectado",
    disconnected: "Desconectado",
    contextMenuDownload: "Descargar con LinkCore"
  },
  fr: {
    extensionName: "LinkCore",
    extensionDescription: "Extension de navigateur profondément intégrée pour LinkCore",
    actionTitle: "LinkCore",
    popupTitle: "LinkCore",
    rpcAddress: "Adresse RPC",
    connectionStatus: "État de la connexion",
    clientVersion: "Version du client",
    downloadSpeed: "Vitesse de téléchargement",
    uploadSpeed: "Vitesse de téléversement",
    totalSpeed: "Vitesse totale de téléchargement",
    downloadTasks: "Tâches de téléchargement",
    noTasks: "Aucune tâche de téléchargement",
    autoHijack: "Détournement automatique des téléchargements du navigateur",
    connected: "Connecté",
    disconnected: "Déconnecté",
    contextMenuDownload: "Télécharger avec LinkCore"
  },
  de: {
    extensionName: "LinkCore",
    extensionDescription: "Tief integrierte Browser-Erweiterung für LinkCore",
    actionTitle: "LinkCore",
    popupTitle: "LinkCore",
    rpcAddress: "RPC-Adresse",
    connectionStatus: "Verbindungsstatus",
    clientVersion: "Client-Version",
    downloadSpeed: "Download-Geschwindigkeit",
    uploadSpeed: "Upload-Geschwindigkeit",
    totalSpeed: "Gesamtgeschwindigkeit herunterladen",
    downloadTasks: "Download-Aufgaben",
    noTasks: "Keine Download-Aufgaben",
    autoHijack: "Browser-Downloads automatisch abfangen",
    connected: "Verbunden",
    disconnected: "Getrennt",
    contextMenuDownload: "Mit LinkCore herunterladen"
  },
  ru: {
    extensionName: "LinkCore",
    extensionDescription: "Глубоко интегрированное расширение браузера для LinkCore",
    actionTitle: "LinkCore",
    popupTitle: "LinkCore",
    rpcAddress: "Адрес RPC",
    connectionStatus: "Состояние подключения",
    clientVersion: "Версия клиента",
    downloadSpeed: "Скорость загрузки",
    uploadSpeed: "Скорость выгрузки",
    totalSpeed: "Общая скорость загрузки",
    downloadTasks: "Задачи загрузки",
    noTasks: "Нет задач загрузки",
    autoHijack: "Автоматически перехватывать загрузки браузера",
    connected: "Подключено",
    disconnected: "Отключено",
    contextMenuDownload: "Скачать с LinkCore"
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
      } else if (browserLang.startsWith('ja')) {
        currentLocale = 'ja'
      } else if (browserLang.startsWith('ko')) {
        currentLocale = 'ko'
      } else if (browserLang.startsWith('es')) {
        currentLocale = 'es'
      } else if (browserLang.startsWith('fr')) {
        currentLocale = 'fr'
      } else if (browserLang.startsWith('de')) {
        currentLocale = 'de'
      } else if (browserLang.startsWith('ru')) {
        currentLocale = 'ru'
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
