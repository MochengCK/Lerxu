export const EMPTY_STRING = ''
export const PORTABLE_EXECUTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR
export const IS_PORTABLE = PORTABLE_EXECUTABLE_DIR && PORTABLE_EXECUTABLE_DIR !== EMPTY_STRING

export const APP_THEME = {
  AUTO: 'auto',
  LIGHT: 'light',
  DARK: 'dark'
}

export const APP_RUN_MODE = {
  STANDARD: 1,
  TRAY: 2,
  HIDE_TRAY: 3
}

export const ADD_TASK_TYPE = {
  URI: 'uri',
  TORRENT: 'torrent'
}

export const TASK_STATUS = {
  ACTIVE: 'active',
  WAITING: 'waiting',
  PAUSED: 'paused',
  ERROR: 'error',
  COMPLETE: 'complete',
  REMOVED: 'removed',
  SEEDING: 'seeding',
  MERGING: 'merging'
}

export const LOG_LEVELS = [
  'error',
  'warn',
  'info',
  'verbose',
  'debug',
  'silly'
]

export const MAX_NUM_OF_DIRECTORIES = 5

export const ENGINE_RPC_HOST = '127.0.0.1'
export const ENGINE_RPC_PORT = 16800
export const ENGINE_MAX_CONCURRENT_DOWNLOADS = 10
export const ENGINE_MAX_CONNECTION_PER_SERVER = 128
export const ENGINE_CONNECTION_FALLBACK = {
  defaultMax: 16,
  max: 16,
  splitMax: 16
}
export const ENGINE_CONNECTION_POLICY = {
  xfercore: { defaultMax: 32, max: 128, splitMax: 128 },
  'aria2-1.36.0': { defaultMax: 64, max: 64, splitMax: 64 },
  'aria2-1.37.0': { defaultMax: 16, max: 16, splitMax: 16 }
}

// Local app HTTP endpoint for browser extension
export const APP_HTTP_PORT = 16900

export const BUILTIN_ED2K_SERVERS = [
  // 来源: emule-security.org + shortypower.org (2026-07-31)
  // 按活跃用户数排序,定期根据上述站点更新
  '176.123.5.89:4725', // eMule Sunrise (~49K users, 20M files)
  '45.82.80.155:5687', // eMule Security (~46K users, 25M files)
  '91.208.162.87:4232', // Sharing-Devils No.4 (~7.8K users, 3.6M files)
  '37.15.61.236:4232', // Mazinga Server (~6.4K users, 1.4M files)
  '85.121.5.137:4232', // Sharing-Devils No.2 (~5.6K users, 2.7M files)
  '213.252.245.239:43333', // Astra-3 (~3.3K users, 1.6M files)
  '185.25.48.89:18357', // Akteon Server (~2.4K users, 1.2M files)
  '213.252.245.239:33333', // Astra-5 (~2.2K users, 1.3M files)
  '185.237.185.226:31031' // Gaal Server (~262 users, 164K files)
]

export const UNKNOWN_PEERID = '%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00'
export const UNKNOWN_PEERID_NAME = 'task.peer-client-unknown'
export const GRAPHIC = '░▒▓█'

export const ONE_SECOND = 1000
export const ONE_MINUTE = ONE_SECOND * 60
export const ONE_HOUR = ONE_MINUTE * 60
export const ONE_DAY = ONE_HOUR * 24

// 12 Hours
export const AUTO_SYNC_TRACKER_INTERVAL = ONE_HOUR * 12

// 24 Hours
export const AUTO_SYNC_ED2K_SERVER_INTERVAL = ONE_HOUR * 24

// One Week
export const AUTO_CHECK_UPDATE_INTERVAL = ONE_DAY * 7

export const MAX_BT_TRACKER_LENGTH = 6144

/**
 * @see https://github.com/ngosang/trackerslist
 */
export const NGOSANG_TRACKERS_BEST_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt'
export const NGOSANG_TRACKERS_BEST_IP_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best_ip.txt'
export const NGOSANG_TRACKERS_ALL_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all.txt'
export const NGOSANG_TRACKERS_ALL_IP_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all_ip.txt'

export const NGOSANG_TRACKERS_BEST_URL_CDN = 'https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_best.txt'
export const NGOSANG_TRACKERS_BEST_IP_URL_CDN = 'https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_best_ip.txt'
export const NGOSANG_TRACKERS_ALL_URL_CDN = 'https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_all.txt'
export const NGOSANG_TRACKERS_ALL_IP_URL_CDN = 'https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_all_ip.txt'

/**
 * @see https://github.com/XIU2/TrackersListCollection
 */
export const XIU2_TRACKERS_BEST_URL = 'https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/best.txt'
export const XIU2_TRACKERS_ALL_URL = 'https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/all.txt'
export const XIU2_TRACKERS_HTTP_URL = 'https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/http.txt'

export const XIU2_TRACKERS_BEST_URL_CDN = 'https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/best.txt'
export const XIU2_TRACKERS_ALL_URL_CDN = 'https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/all.txt'
export const XIU2_TRACKERS_HTTP_URL_CDN = 'https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/http.txt'

// For bt-exclude-tracker
export const XIU2_TRACKERS_BLACK_URL = 'https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/blacklist.txt'

export const TRACKER_SOURCE_OPTIONS = [
  {
    label: 'ngosang/trackerslist',
    options: [
      {
        value: NGOSANG_TRACKERS_BEST_URL,
        label: 'trackers_best.txt',
        cdn: false
      },
      {
        value: NGOSANG_TRACKERS_BEST_IP_URL,
        label: 'trackers_best_ip.txt',
        cdn: false
      },
      {
        value: NGOSANG_TRACKERS_ALL_URL,
        label: 'trackers_all.txt',
        cdn: false
      },
      {
        value: NGOSANG_TRACKERS_ALL_IP_URL,
        label: 'trackers_all_ip.txt',
        cdn: false
      },
      {
        value: NGOSANG_TRACKERS_BEST_URL_CDN,
        label: 'trackers_best.txt',
        cdn: true
      },
      {
        value: NGOSANG_TRACKERS_BEST_IP_URL_CDN,
        label: 'trackers_best_ip.txt',
        cdn: true
      },
      {
        value: NGOSANG_TRACKERS_ALL_URL_CDN,
        label: 'trackers_all.txt',
        cdn: true
      },
      {
        value: NGOSANG_TRACKERS_ALL_IP_URL_CDN,
        label: 'trackers_all_ip.txt',
        cdn: true
      }
    ]
  },
  {
    label: 'XIU2/TrackersListCollection',
    options: [
      {
        value: XIU2_TRACKERS_BEST_URL,
        label: 'best.txt',
        cdn: false
      },
      {
        value: XIU2_TRACKERS_ALL_URL,
        label: 'all.txt',
        cdn: false
      },
      {
        value: XIU2_TRACKERS_HTTP_URL,
        label: 'http.txt',
        cdn: false
      },
      {
        value: XIU2_TRACKERS_BEST_URL_CDN,
        label: 'best.txt',
        cdn: true
      },
      {
        value: XIU2_TRACKERS_ALL_URL_CDN,
        label: 'all.txt',
        cdn: true
      },
      {
        value: XIU2_TRACKERS_HTTP_URL_CDN,
        label: 'http.txt',
        cdn: true
      }
    ]
  }
]

// ED2K server subscription preset sources
// These provide server.met binary format, auto-parsed on fetch
export const ED2K_SERVER_SOURCE_OPTIONS = [
  {
    label: 'emule-security.org',
    options: [
      {
        value: 'http://upd.emule-security.org/server.met',
        label: 'server.met'
      }
    ]
  }
]

export const PROXY_SCOPES = {
  DOWNLOAD: 'download',
  UPDATE_APP: 'update-app',
  UPDATE_TRACKERS: 'update-trackers'
}

export const PROXY_SCOPE_OPTIONS = [
  PROXY_SCOPES.DOWNLOAD,
  PROXY_SCOPES.UPDATE_APP,
  PROXY_SCOPES.UPDATE_TRACKERS
]

// 代理模式
export const PROXY_MODE = {
  NONE: 'none', // 不使用代理
  SYSTEM: 'system', // 使用系统代理
  CUSTOM: 'custom' // 自定义代理
}

export const NONE_SELECTED_FILES = 'none'
export const SELECTED_ALL_FILES = 'all'

export const IP_VERSION = {
  V4: 4,
  V6: 6
}

export const LOGIN_SETTING_OPTIONS = {
  // For Windows
  args: [
    '--opened-at-login=1'
  ]
}

// 托盘速度计画布尺寸（单位 pt，渲染时 ×2 生成 Retina 像素）。
// 图标与菜单栏同高（22pt）；速度文字 8pt，两行在画布内垂直居中
// （tray.js 负责居中，高度无需为文字顶满）。
export const TRAY_CANVAS_CONFIG = {
  WIDTH: 70,
  HEIGHT: 22,
  ICON_WIDTH: 22,
  ICON_HEIGHT: 22,
  TEXT_WIDTH: 46,
  TEXT_FONT_SIZE: 8
}

export const COMMON_RESOURCE_TAGS = ['http://', 'https://', 'ftp://', 'magnet:', 'ed2k://']
export const THUNDER_RESOURCE_TAGS = ['thunder://']

export const RESOURCE_TAGS = [
  ...COMMON_RESOURCE_TAGS,
  ...THUNDER_RESOURCE_TAGS
]

export const SUPPORT_RTL_LOCALES = [
  /* 'العربية', Arabic */
  'ar',
  /* 'فارسی', Persian */
  'fa',
  /* 'עברית', Hebrew */
  'he',
  /* 'Kurdî / كوردی', Kurdish */
  'ku',
  /* 'پنجابی', Western Punjabi */
  'pa',
  /* 'پښتو', Pashto, */
  'ps',
  /* 'سنڌي', Sindhi */
  'sd',
  /* 'اردو', Urdu */
  'ur',
  /* 'ייִדיש', Yiddish */
  'yi'
]

export const IMAGE_SUFFIXES = [
  '.ai',
  '.bmp',
  '.eps',
  '.fig',
  '.gif',
  '.heic',
  '.icn',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.psd',
  '.raw',
  '.sketch',
  '.svg',
  '.tif',
  '.webp',
  '.xd'
]

export const AUDIO_SUFFIXES = [
  '.aac',
  '.ape',
  '.flac',
  '.flav',
  '.m4a',
  '.mp3',
  '.ogg',
  '.wav',
  '.wma'
]

export const VIDEO_SUFFIXES = [
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpg',
  '.rmvb',
  '.vob',
  '.wmv'
]

export const SUB_SUFFIXES = [
  '.ass',
  '.idx',
  '.smi',
  '.srt',
  '.ssa',
  '.sst',
  '.sub'
]

export const ED2K_DEFAULT_LISTEN_PORT = 4662
export const ED2K_DEFAULT_MAX_CONNECTIONS = 200
export const ED2K_DEFAULT_CONNECTION_TIMEOUT = 30
export const ED2K_DEFAULT_MAX_SOURCES_PER_FILE = 100

export const DOCUMENT_SUFFIXES = [
  '.azw3',
  '.csv',
  '.doc',
  '.docx',
  '.epub',
  '.key',
  '.mobi',
  '.numbers',
  '.pages',
  '.pdf',
  '.ppt',
  '.pptx',
  '.txt',
  '.xls',
  '.xlsx'
]
