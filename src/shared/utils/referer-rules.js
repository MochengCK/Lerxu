/**
 * Referer 规则库
 *
 * 某些网站的 CDN 有防盗链机制，需要特定的 Referer 才能下载。
 * 此规则库用于自动推断合适的 Referer。
 *
 * 规则格式：
 * {
 *   pattern: RegExp,  // 匹配域名的正则表达式
 *   referer: string   // 对应的 Referer
 * }
 */

// ==================== 视频平台 ====================
const VIDEO_PLATFORM_RULES = [
  // Bilibili
  { pattern: /\.(hdslb|bilibili)\.com$/i, referer: 'https://www.bilibili.com/' },
  { pattern: /\.bilivideo\.com$/i, referer: 'https://www.bilibili.com/' },
  { pattern: /\.bilivideo\.cn$/i, referer: 'https://www.bilibili.com/' },

  // 优酷
  { pattern: /\.(youku|ykimg)\.com$/i, referer: 'https://www.youku.com/' },

  // 爱奇艺
  { pattern: /\.(iqiyi|iqiyipic|71\.am)\.com$/i, referer: 'https://www.iqiyi.com/' },

  // 腾讯视频
  { pattern: /\.(qq|gtimg|myqcloud)\.com$/i, referer: 'https://v.qq.com/' },

  // 芒果TV
  { pattern: /\.mgtv\.com$/i, referer: 'https://www.mgtv.com/' },

  // 西瓜视频/抖音
  { pattern: /\.(ixigua|douyinpic|douyinvod|bytedance|byteimg)\.com$/i, referer: 'https://www.ixigua.com/' },

  // 哔哩哔哩漫画
  { pattern: /\.bilicomic\.com$/i, referer: 'https://manga.bilibili.com/' }
]

// ==================== 电商平台 ====================
const ECOMMERCE_RULES = [
  // 淘宝/天猫
  { pattern: /\.(tbcdn|alicdn|taobao|tmall)\.com$/i, referer: 'https://www.taobao.com/' },

  // 京东
  { pattern: /\.(jd|360buyimg|jdcloud)\.com$/i, referer: 'https://www.jd.com/' },

  // 拼多多
  { pattern: /\.(pinduoduo|yangkeduo)\.com$/i, referer: 'https://www.pinduoduo.com/' },

  // 苏宁
  { pattern: /\.suning\.com$/i, referer: 'https://www.suning.com/' }
]

// ==================== 网盘/下载服务 ====================
const CLOUD_STORAGE_RULES = [
  // 百度网盘
  { pattern: /\.(baidupcs|baiduyun|bcebos)\.com$/i, referer: 'https://pan.baidu.com/' },

  // 阿里云盘
  { pattern: /\.aliyundrive\.com$/i, referer: 'https://www.aliyundrive.com/' },
  { pattern: /\.alipan\.com$/i, referer: 'https://www.alipan.com/' },

  // 迅雷
  { pattern: /\.(xunlei|sandai)\.com$/i, referer: 'https://www.xunlei.com/' },

  // 115网盘
  { pattern: /\.115\.com$/i, referer: 'https://115.com/' },

  // 蓝奏云
  { pattern: /\.(lanzou|lanzoux|lanzoui|lanzouv|lanzouw)\.com$/i, referer: 'https://www.lanzou.com/' },

  // 天翼云盘
  { pattern: /\.(ctyun|cloud\.189)\.cn$/i, referer: 'https://cloud.189.cn/' },

  // 和彩云
  { pattern: /\.139\.com$/i, referer: 'https://yun.139.com/' }
]

// ==================== 社交媒体 ====================
const SOCIAL_MEDIA_RULES = [
  // 微博
  { pattern: /\.(weibo|sinaimg|sina)\.com$/i, referer: 'https://weibo.com/' },

  // 知乎
  { pattern: /\.(zhihu|zhimg)\.com$/i, referer: 'https://www.zhihu.com/' },

  // 小红书
  { pattern: /\.(xiaohongshu|xhscdn)\.com$/i, referer: 'https://www.xiaohongshu.com/' },

  // 微信
  { pattern: /\.(weixin|wechat|wx)\.qq\.com$/i, referer: 'https://weixin.qq.com/' },

  // 贴吧
  { pattern: /\.tieba\.baidu\.com$/i, referer: 'https://tieba.baidu.com/' }
]

// ==================== 音乐平台 ====================
const MUSIC_PLATFORM_RULES = [
  // 网易云音乐
  { pattern: /\.(music\.126|163\.com)$/i, referer: 'https://music.163.com/' },
  { pattern: /\.126\.net$/i, referer: 'https://music.163.com/' },

  // QQ音乐
  { pattern: /\.(qqmusic|y\.qq)\.com$/i, referer: 'https://y.qq.com/' },

  // 酷狗
  { pattern: /\.kugou\.com$/i, referer: 'https://www.kugou.com/' },

  // 酷我
  { pattern: /\.kuwo\.cn$/i, referer: 'https://www.kuwo.cn/' },

  // 喜马拉雅
  { pattern: /\.(ximalaya|xmcdn)\.com$/i, referer: 'https://www.ximalaya.com/' }
]

// ==================== 游戏平台 ====================
const GAME_PLATFORM_RULES = [
  // Steam
  { pattern: /\.steampowered\.com$/i, referer: 'https://store.steampowered.com/' },
  { pattern: /\.steamcontent\.com$/i, referer: 'https://store.steampowered.com/' },

  // Epic Games
  { pattern: /\.epicgames\.com$/i, referer: 'https://www.epicgames.com/' },

  // 网易游戏
  { pattern: /\.163\.com$/i, referer: 'https://www.163.com/' },

  // 腾讯游戏
  { pattern: /\.wegame\.com$/i, referer: 'https://www.wegame.com.cn/' }
]

// ==================== 软件下载站 ====================
const SOFTWARE_DOWNLOAD_RULES = [
  // 华为应用市场
  { pattern: /\.huawei\.com$/i, referer: 'https://appgallery.huawei.com/' },
  { pattern: /\.hicloud\.com$/i, referer: 'https://appgallery.huawei.com/' },

  // 小米应用商店
  { pattern: /\.(mi|xiaomi|miui)\.com$/i, referer: 'https://app.mi.com/' },

  // OPPO 应用商店
  { pattern: /\.oppo\.com$/i, referer: 'https://store.oppo.com/' },

  // vivo 应用商店
  { pattern: /\.vivo\.com$/i, referer: 'https://www.vivo.com/' },

  // 腾讯软件中心
  { pattern: /\.myapp\.com$/i, referer: 'https://sj.qq.com/' },

  // 360软件
  { pattern: /\.(360|qhimg)\.com$/i, referer: 'https://soft.360.cn/' }
]

// ==================== 开发者资源 ====================
const DEVELOPER_RULES = [
  // GitHub
  { pattern: /\.(github|githubusercontent|githubassets)\.com$/i, referer: 'https://github.com/' },

  // GitLab
  { pattern: /\.gitlab\.com$/i, referer: 'https://gitlab.com/' },

  // Gitee
  { pattern: /\.gitee\.com$/i, referer: 'https://gitee.com/' },

  // npm
  { pattern: /\.npmjs\.(org|com)$/i, referer: 'https://www.npmjs.com/' },

  // Maven
  { pattern: /\.maven\.org$/i, referer: 'https://mvnrepository.com/' },

  // JetBrains
  { pattern: /\.jetbrains\.com$/i, referer: 'https://www.jetbrains.com/' }
]

// ==================== 国际服务 ====================
const INTERNATIONAL_RULES = [
  // Google Drive
  { pattern: /\.(google|googleapis|googleusercontent)\.com$/i, referer: 'https://drive.google.com/' },

  // Dropbox
  { pattern: /\.dropbox\.com$/i, referer: 'https://www.dropbox.com/' },
  { pattern: /\.dropboxusercontent\.com$/i, referer: 'https://www.dropbox.com/' },

  // OneDrive
  { pattern: /\.(onedrive|live|sharepoint)\.com$/i, referer: 'https://onedrive.live.com/' },

  // Amazon
  { pattern: /\.(amazon|amazonaws|cloudfront)\.com$/i, referer: 'https://www.amazon.com/' },

  // MEGA
  { pattern: /\.mega\.(nz|co\.nz)$/i, referer: 'https://mega.nz/' },

  // MediaFire
  { pattern: /\.mediafire\.com$/i, referer: 'https://www.mediafire.com/' },

  // Cloudflare
  { pattern: /\.cloudflare\.com$/i, referer: '' },

  // Akamai
  { pattern: /\.akamaized\.net$/i, referer: '' }
]

// ==================== 其他常用服务 ====================
const OTHER_RULES = [
  // 百度
  { pattern: /\.baidu\.com$/i, referer: 'https://www.baidu.com/' },
  { pattern: /\.bdstatic\.com$/i, referer: 'https://www.baidu.com/' },
  { pattern: /\.bdimg\.com$/i, referer: 'https://www.baidu.com/' },

  // 搜狐
  { pattern: /\.(sohu|sohucs)\.com$/i, referer: 'https://www.sohu.com/' },

  // 网易
  { pattern: /\.163\.com$/i, referer: 'https://www.163.com/' },
  { pattern: /\.126\.com$/i, referer: 'https://www.126.com/' },

  // 新浪
  { pattern: /\.sina\.com\.cn$/i, referer: 'https://www.sina.com.cn/' },

  // CSDN
  { pattern: /\.csdn\.net$/i, referer: 'https://www.csdn.net/' },

  // 简书
  { pattern: /\.jianshu\.com$/i, referer: 'https://www.jianshu.com/' }
]

// ==================== 合并所有规则 ====================
const ALL_REFERER_RULES = [
  ...VIDEO_PLATFORM_RULES,
  ...ECOMMERCE_RULES,
  ...CLOUD_STORAGE_RULES,
  ...SOCIAL_MEDIA_RULES,
  ...MUSIC_PLATFORM_RULES,
  ...GAME_PLATFORM_RULES,
  ...SOFTWARE_DOWNLOAD_RULES,
  ...DEVELOPER_RULES,
  ...INTERNATIONAL_RULES,
  ...OTHER_RULES
]

/**
 * 根据 URL 自动推断合适的 Referer
 * @param {string} url - 下载链接
 * @param {boolean} fallbackToHost - 如果没有匹配规则，是否使用 URL 的主机名作为 Referer
 * @returns {string} - 推断的 Referer，如果无法推断则返回空字符串
 */
export function inferRefererFromUrl (url, fallbackToHost = true) {
  if (!url || typeof url !== 'string') {
    return ''
  }

  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()

    // 检查是否匹配特殊规则
    for (const rule of ALL_REFERER_RULES) {
      if (rule.pattern.test(hostname)) {
        return rule.referer
      }
    }

    // 默认使用 URL 的根域名作为 Referer
    if (fallbackToHost) {
      return `${urlObj.protocol}//${urlObj.hostname}/`
    }

    return ''
  } catch (e) {
    return ''
  }
}
