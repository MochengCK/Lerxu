import {
  compact,
  difference,
  isArray,
  isEmpty,
  isFunction,
  isNaN,
  isPlainObject,
  kebabCase,
  parseInt
} from 'lodash'
import bitTorrentPeerId from 'bittorrent-peerid'

import { userKeys, systemKeys, needRestartKeys } from '@shared/configKeys'
import {
  APP_THEME,
  ENGINE_RPC_HOST,
  GRAPHIC,
  ENGINE_CONNECTION_FALLBACK,
  ENGINE_CONNECTION_POLICY,
  NONE_SELECTED_FILES,
  SELECTED_ALL_FILES,
  RESOURCE_TAGS,
  IMAGE_SUFFIXES,
  AUDIO_SUFFIXES,
  VIDEO_SUFFIXES,
  SUB_SUFFIXES,
  UNKNOWN_PEERID,
  SUPPORT_RTL_LOCALES,
  UNKNOWN_PEERID_NAME,
  DOCUMENT_SUFFIXES
} from '@shared/constants'

export const bytesToSize = (bytes, precision = 1) => {
  const b = parseInt(bytes, 10)
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  if (b === 0) { return '0 KB' }
  const i = parseInt(Math.floor(Math.log(b) / Math.log(1024)), 10)
  if (i === 0) { return `${b} ${sizes[i]}` }
  return `${(b / (1024 ** i)).toFixed(precision)} ${sizes[i]}`
}

export const normalizeEngineBinary = (engineBinary = '') => {
  const name = String(engineBinary).split(/[\\/]/).pop() || ''
  return name.replace(/\.exe$/i, '').toLowerCase()
}

export const getEngineConnectionPolicy = (engineBinary = '') => {
  const normalized = String(engineBinary).toLowerCase()
  const key = normalizeEngineBinary(engineBinary)
  if (ENGINE_CONNECTION_POLICY[key]) {
    return ENGINE_CONNECTION_POLICY[key]
  }
  if (/xfercore/.test(normalized)) {
    return ENGINE_CONNECTION_POLICY.xfercore
  }
  if (/1\.36\.0/.test(normalized)) {
    return ENGINE_CONNECTION_POLICY['aria2-1.36.0']
  }
  if (/1\.37\.0/.test(normalized)) {
    return ENGINE_CONNECTION_POLICY['aria2-1.37.0']
  }
  return ENGINE_CONNECTION_FALLBACK
}

export const extractSpeedUnit = (speed = '') => {
  if (parseInt(speed) === 0) {
    return 'K'
  }

  const regex = /^(\d+\.?\d*)([KMG])$/
  const match = regex.exec(speed)

  if (!match) {
    return 'K'
  }

  return match[2]
}

export const bitfieldToPercent = (text, format = false) => {
  if (!text || typeof text !== 'string') {
    return format ? '0.00' : 0
  }
  const len = text.length
  if (len === 0) {
    return format ? '0.00' : 0
  }
  let p
  let one = 0
  for (let i = 0; i < len; i++) {
    p = parseInt(text[i], 16)
    for (let j = 0; j < 4; j++) {
      one += (p & 1)
      p >>= 1
    }
  }
  // 1 byte = 8 bits, each hex char represents 4 bits
  // So total bits is len * 4
  const percentage = (one / (len * 4)) * 100
  const result = parseFloat(percentage.toFixed(2))

  if (format) {
    return result === 100 ? '100' : result.toFixed(2)
  }

  return result
}

export const bitfieldToGraphic = (text) => {
  if (!text || typeof text !== 'string') {
    return ''
  }
  const len = text.length
  let result = ''
  for (let i = 0; i < len; i++) {
    result += GRAPHIC[Math.floor(parseInt(text[i], 16) / 4)] + ' '
  }
  return result
}

export const peerIdParser = (str) => {
  if (!str || str === UNKNOWN_PEERID) {
    return UNKNOWN_PEERID_NAME
  }

  // 优先检查 XferCore/LinkCore，在 bittorrent-peerid 解析之前
  // 这样可以避免 XC 前缀被错误识别为其他客户端
  let decodedStr
  try {
    decodedStr = unescape(str)

    // 检查是否是 XferCore 或 LinkCore
    if (decodedStr && (decodedStr.startsWith('XferCore') || decodedStr.startsWith('LinkCore'))) {
      // 尝试提取版本号，格式如 "XferCore/1.3.0"
      const match = decodedStr.match(/^(XferCore|LinkCore)\/?([\d.]+)?/)
      if (match) {
        const version = match[2]
        return version ? `XferCore v${version}` : 'XferCore'
      }
      return 'XferCore'
    }

    // 检查 Peer ID 是否以 -XC 开头（Azureus 风格）
    // 格式：-XC1300-xxxxxxxxxxxx
    if (decodedStr && decodedStr.startsWith('-XC')) {
      const versionMatch = decodedStr.match(/^-XC(\d)(\d)(\d)(\d)-/)
      if (versionMatch) {
        const version = `${versionMatch[1]}.${versionMatch[2]}.${versionMatch[3]}`
        return `XferCore v${version}`
      }
      return 'XferCore'
    }
  } catch (e) {
    console.log('peerIdParser.precheck.fail', e, str)
  }

  let parsed = {}
  try {
    const buffer = Buffer.from(decodedStr || unescape(str), 'binary')
    parsed = bitTorrentPeerId(buffer)
  } catch (e) {
    console.log('peerIdParser.fail', e, str, decodedStr)
    return UNKNOWN_PEERID_NAME
  }

  let client = parsed.client

  // 如果被错误识别为 FileCroc，改为 XferCore
  if (client === 'FileCroc') {
    client = 'XferCore'
  }

  if (client === 'aria2') {
    client = 'XferCore'
  }

  const result = parsed.version
    ? `${client} v${parsed.version}`
    : client
  return result
}

export const calcProgress = (totalLength, completedLength, decimal = 2) => {
  const total = parseInt(totalLength, 10)
  const completed = parseInt(completedLength, 10)
  if (total === 0) {
    return 0
  }
  const percentage = completed / total * 100
  const result = parseFloat(percentage.toFixed(decimal))
  return result
}

export const calcRatio = (totalLength, uploadLength) => {
  const total = parseInt(totalLength, 10)
  const upload = parseInt(uploadLength, 10)
  if (total === 0 || upload === 0) {
    return 0
  }

  const percentage = upload / total
  const result = parseFloat(percentage.toFixed(4))
  return result
}

export const timeRemaining = (totalLength, completedLength, downloadSpeed) => {
  const remainingLength = totalLength - completedLength
  return Math.ceil(remainingLength / downloadSpeed)
}

/**
 * timeFormat
 * @param {int} seconds
 * @param {string} prefix
 * @param {string} suffix
 * @param {object} i18n
 * i18n: {
 *  gt1d: 'More than one day',
 *  hour: 'h',
 *  minute: 'm',
 *  second: 's'
 * }
 */
export const timeFormat = (seconds, { prefix = '', suffix = '', i18n }) => {
  let result = ''
  let hours = ''
  let minutes = ''
  let secs = seconds || 0
  const i = {
    gt1d: '> 1 day',
    hour: 'h',
    minute: 'm',
    second: 's',
    ...i18n
  }

  if (secs <= 0) {
    return ''
  }
  if (secs > 86400) {
    return `${prefix} ${i.gt1d} ${suffix}`
  }
  if (secs > 3600) {
    hours = `${Math.floor(secs / 3600)}${i.hour} `
    secs %= 3600
  }
  if (secs > 60) {
    minutes = `${Math.floor(secs / 60)}${i.minute} `
    secs %= 60
  }
  secs += i.second
  result = hours + minutes + secs
  return result ? `${prefix} ${result} ${suffix}` : result
}

export const localeDateTimeFormat = (timestamp, locale) => {
  if (!timestamp) {
    return ''
  }

  if (`${timestamp}`.length === 10) {
    timestamp *= 1000
  }
  const date = new Date(timestamp)
  const effectiveLocale = (!locale || locale === 'auto') ? undefined : locale
  return date.toLocaleDateString(effectiveLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  })
}

export const ellipsis = (str = '', maxLen = 64) => {
  const len = str.length
  let result = str
  if (len < maxLen) {
    return result
  }

  if (maxLen > 0) {
    result = `${result.substring(0, maxLen)}...`
  }

  return result
}

export const getFileSelection = (files = []) => {
  console.log('getFileSelection===>', files)
  const selectedFiles = files.filter((file) => file.selected)
  if (files.length === 0 || selectedFiles.length === 0) {
    return NONE_SELECTED_FILES
  }

  if (files.length === selectedFiles.length) {
    return SELECTED_ALL_FILES
  }

  const indexArr = []
  files.forEach((_, index) => {
    indexArr.push(index)
  })
  const result = indexArr.join(',')
  return result
}

export const getTaskName = (task, options = {}) => {
  const o = {
    defaultName: '',
    maxLen: 64, // -1: No limit length
    ...options
  }
  const { defaultName, maxLen } = o
  let result = defaultName
  if (!task) {
    return result
  }

  const files = Array.isArray(task.files) ? task.files : []
  const { bittorrent } = task
  const total = files.length

  if (bittorrent && bittorrent.info && bittorrent.info.name) {
    result = ellipsis(bittorrent.info.name, maxLen)
  } else if (total === 1) {
    const fileName = getFileNameFromFile(files[0])
    if (fileName) {
      result = ellipsis(fileName, maxLen)
    }
  }

  return result
}

export const getFileNameFromFile = (file) => {
  if (!file) {
    return ''
  }

  let { path } = file
  if (!path && file.uris && file.uris.length > 0) {
    path = decodeURI(file.uris[0].uri)
  }
  if (typeof path !== 'string' || !path) {
    return ''
  }

  const index = path.lastIndexOf('/')

  if (index <= 0 || index === path.length) {
    const base = path
    const q = base.indexOf('?')
    const h = base.indexOf('#')
    const cutIdx = [q, h].filter(i => i >= 0).sort((a, b) => a - b)[0]
    return typeof cutIdx === 'number' ? base.substring(0, cutIdx) : base
  }

  const name = path.substring(index + 1)
  const qIdx = name.indexOf('?')
  const hIdx = name.indexOf('#')
  const cutIdx = [qIdx, hIdx].filter(i => i >= 0).sort((a, b) => a - b)[0]
  return typeof cutIdx === 'number' ? name.substring(0, cutIdx) : name
}

export const isMagnetTask = (task) => {
  const { bittorrent } = task
  return bittorrent && !bittorrent.info
}

export const isEd2kTask = (task = {}) => {
  const files = Array.isArray(task.files) ? task.files : []
  if (files.length > 0 && files[0].uris && files[0].uris.length > 0) {
    return files[0].uris[0].uri.toLowerCase().startsWith('ed2k://')
  }
  return false
}

export const getEd2kFileHash = (task = {}) => {
  const files = Array.isArray(task.files) ? task.files : []
  if (isEd2kTask(task) && files.length > 0 && files[0].uris && files[0].uris.length > 0) {
    const uri = files[0].uris[0].uri
    const parts = uri.split('|')
    // ed2k://|file|filename|size|hash|/
    if (parts.length >= 5) {
      return parts[4]
    }
  }
  return ''
}

export const checkTaskIsSeeder = (task) => {
  const { bittorrent, seeder } = task
  // seeder 可能是字符串 "true" 或布尔值 true
  return !!bittorrent && (seeder === 'true' || seeder === true)
}

export const getTaskUri = (task, withTracker = false) => {
  const { files, infoHash, bittorrent } = task || {}
  let result = ''
  // Some restored BT tasks may temporarily miss `bittorrent` metadata but still
  // carry `infoHash`. Build a minimal magnet link in that case.
  if (infoHash) {
    if (bittorrent) {
      result = buildMagnetLink(task, withTracker)
    } else {
      result = `magnet:?xt=urn:btih:${infoHash}`
    }
    return result
  }
  if (checkTaskIsBT(task)) {
    result = buildMagnetLink(task, withTracker)
    return result
  }

  if (files && files.length === 1) {
    const { uris } = files[0]
    result = uris[0].uri
    const fallback = `${result || ''}`.match(/^[a-zA-Z]:\/\/.*?([0-9a-fA-F]{40})\.torrent(?:[?#].*)?$/)
    if (fallback && fallback[1]) {
      result = `magnet:?xt=urn:btih:${fallback[1].toLowerCase()}`
    }
  }

  return result
}

export const buildMagnetLink = (task, withTracker = false, btTracker = []) => {
  const { bittorrent, infoHash } = task
  const { info } = bittorrent

  const params = [
    `magnet:?xt=urn:btih:${infoHash}`
  ]
  if (info && info.name) {
    params.push(`dn=${encodeURI(info.name)}`)
  }

  if (withTracker) {
    const trackers = difference(bittorrent.announceList, btTracker)
    trackers.forEach((tracker) => {
      params.push(`tr=${encodeURI(tracker)}`)
    })
  }

  const result = params.join('&')

  return result
}

export const checkTaskTitleIsEmpty = (task) => {
  const { files, bittorrent } = task
  const [file] = files
  const { path } = file
  let result = path
  if (bittorrent && bittorrent.info && bittorrent.info.name) {
    result = bittorrent.info.name
  }
  return result === ''
}

export const checkTaskIsBT = (task = {}) => {
  const { bittorrent, infoHash } = task || {}
  return !!bittorrent || !!infoHash
}

export const isTorrent = (file) => {
  const { name, type } = file
  return name.endsWith('.torrent') || type === 'application/x-bittorrent'
}

export const getAsBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      // https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL
      const result = reader.result.split('base64,')[1]
      resolve(result)
    })
    reader.addEventListener('error', reject)
    reader.readAsDataURL(file)
  })
}

/**
 * 合并 aria2 system.multicall 的结果。
 * aria2 的 system.multicall 返回 [[[r1]], [[r2]], ...] 三层嵌套：
 * 外层是方法调用数组，每层内层 [rN] 是返回值包裹，最内层才是任务数组。
 * 仅 flat() 一层会把任务对象留在子数组里，导致 task.status/gid 全部取不到，
 * 因此需要摊平两层得到扁平的任务数组。
 */
export const mergeTaskResult = (response = []) => {
  return response.flat(2)
}

export const changeKeysCase = (obj, caseConverter) => {
  const result = {}
  if (isEmpty(obj) || !isFunction(caseConverter)) {
    return result
  }

  for (const [k, value] of Object.entries(obj)) {
    const key = caseConverter(k)
    result[key] = value
  }

  return result
}

// Custom key case converters that, unlike lodash camelCase/kebabCase, do NOT
// split at letter<->digit boundaries. Lodash splits `ed2k` into `ed`/`2`/`k`,
// which breaks the round-trip for `ed2k-*` config keys:
//   kebabCase('ed2kEnabled') => 'ed-2-k-enabled'  (wrong, not in userKeys)
//   camelCase('ed2k-enabled') => 'ed2KEnabled'    (wrong, mismatches form fields)
// This caused ED2K preference edits to be discarded as illegal keys on save and
// to fall back to defaults on load. Treating digit-letter runs as one word keeps
// `ed2k` intact while matching lodash exactly for all all-letter keys.
const splitKeyWords = (str) => String(str == null ? '' : str)
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .split(/[^a-zA-Z0-9]+/)
  .filter(Boolean)

const keyToCamelCase = (str) => {
  const words = splitKeyWords(str)
  if (words.length === 0) return ''
  return words
    .map((w, i) => {
      const lower = w.toLowerCase()
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
}

const keyToKebabCase = (str) => splitKeyWords(str)
  .map((w) => w.toLowerCase())
  .join('-')

export const changeKeysToCamelCase = (obj = {}) => {
  return changeKeysCase(obj, keyToCamelCase)
}

export const changeKeysToKebabCase = (obj = {}) => {
  return changeKeysCase(obj, keyToKebabCase)
}

export const validateNumber = (n) => {
  return !isNaN(parseFloat(n)) && isFinite(n) && Number(n) === n
}

export const fixValue = (obj = {}) => {
  const result = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === 'true') {
      result[k] = true
    } else if (v === 'false') {
      result[k] = false
    } else if (validateNumber(v)) {
      result[k] = Number(v)
    } else {
      result[k] = v
    }
  }
  return result
}

export const separateConfig = (options = {}) => {
  // user
  const user = {}
  // system
  const system = {}
  // others
  const others = {}

  for (const [k, v] of Object.entries(options)) {
    // 跳过值为undefined的属性，表示该属性应该被删除
    if (v === undefined) {
      continue
    }

    if (userKeys.includes(k)) {
      user[k] = v
    } else if (systemKeys.includes(k)) {
      system[k] = v
    } else {
      others[k] = v
    }
  }
  return {
    user, system, others
  }
}

export const compactUndefined = (arr = []) => {
  return arr.filter((item) => {
    return item !== undefined
  })
}

export const splitTextRows = (text = '') => {
  text = `${text}`
  let result = text
    .replace(/(?:\\\r\\\n|\\\r|\\\n)/g, ' ')
    .replace(/(?:\r\n|\r|\n)/g, '\n')
    .split('\n') || []
  result = result.map((row) => row.trim())
  return result
}

export const convertCommaToLine = (text = '') => {
  text = `${text}`
  let arr = text.split(',')
  arr = arr.map((row) => row.trim())
  const result = arr.join('\n').trim()
  return result
}

export const convertLineToComma = (text = '') => {
  const result = text.trim().replace(/(?:\r\n|\r|\n)/g, ',')
  return result
}

export const filterVideoFiles = (files = []) => {
  const suffix = [...VIDEO_SUFFIXES, ...SUB_SUFFIXES]
  return files.filter((item) => {
    return suffix.includes(item.extension)
  })
}

export const filterAudioFiles = (files = []) => {
  return files.filter((item) => {
    return AUDIO_SUFFIXES.includes(item.extension)
  })
}

export const filterImageFiles = (files = []) => {
  return files.filter((item) => {
    return IMAGE_SUFFIXES.includes(item.extension)
  })
}

export const filterDocumentFiles = (files = []) => {
  return files.filter((item) => {
    return DOCUMENT_SUFFIXES.includes(item.extension)
  })
}

export const isAudioOrVideo = (uri = '') => {
  const suffixs = [...AUDIO_SUFFIXES, ...VIDEO_SUFFIXES]
  const result = suffixs.some((suffix) => {
    return uri.includes(suffix)
  })
  return result
}

export const needCheckCopyright = (links = '') => {
  const uris = splitTaskLinks(links)
  const avs = uris.filter(uri => {
    return isAudioOrVideo(uri)
  })

  const result = avs.length > 0
  return result
}

export const decodeThunderLink = (url = '') => {
  if (!url.startsWith('thunder://')) {
    return url
  }

  let result = url.trim()
  result = result.split('thunder://')[1]
  result = Buffer.from(result, 'base64').toString('utf8')
  result = result.substring(2, result.length - 2)
  return result
}

export const splitTaskLinks = (links = '') => {
  const temp = compact(splitTextRows(links))
  const result = temp.map((item) => {
    return sanitizeLink(decodeThunderLink(item))
  })
  return result
}

export const sanitizeLink = (link = '') => {
  let s = `${link}`.trim()
  // 移除零宽字符、BOM、方向性标记
  s = s.replace(/[\u200B-\u200D\uFEFF\u2060\u202A-\u202E\u061C]/g, '')
  // 规范空白符
  s = s.replace(/\s+/g, ' ')
  // 针对 magnet 规范化 btih 值，剔除不合法字符
  if (s.startsWith('magnet:?')) {
    s = s.replace(/(xt=urn:btih:)([^&]+)/i, (m, p1, ih) => {
      const clean = ih.replace(/[^A-Za-z0-9]/g, '')
      return `${p1}${clean}`
    })
  }
  return s
}

export const detectResource = (content) => {
  return RESOURCE_TAGS.some((type) => {
    return content.includes(type)
  })
}

export const buildFileList = (rawFile) => {
  rawFile.uid = Date.now()
  const file = {
    status: 'ready',
    name: rawFile.name,
    size: rawFile.size,
    percentage: 0,
    uid: rawFile.uid,
    raw: rawFile
  }
  const fileList = [file]
  return fileList
}

export const isRTL = (locale = 'en-US') => {
  return SUPPORT_RTL_LOCALES.includes(locale)
}

export const getLangDirection = (locale = 'en-US') => {
  return isRTL(locale) ? 'rtl' : 'ltr'
}

export const listTorrentFiles = (files) => {
  const result = files.map((file, index) => {
    const extension = getFileExtension(file.path)
    const item = {
      // aria2 select-file start index at 1
      // possible Values: 1-1048576
      idx: index + 1,
      extension: `.${extension}`,
      ...file
    }
    return item
  })
  return result
}

export const getFileName = (fullPath) => {
  // eslint-disable-next-line
  return fullPath.replace(/^.*[\\\/]/, '')
}

export const getFileExtension = (filename) => {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2)
}

export const removeExtensionDot = (extension = '') => {
  return extension.replace('.', '')
}

export const diffConfig = (current = {}, next = {}) => {
  const result = {}
  const allKeys = new Set([...Object.keys(current), ...Object.keys(next)])
  for (const key of allKeys) {
    if (!(key in next)) {
      // 属性被删除
      result[key] = undefined
      continue
    }
    if (!(key in current)) {
      // 新增属性
      result[key] = next[key]
      continue
    }
    const currentVal = current[key]
    const nextVal = next[key]
    if (isArray(nextVal) || isPlainObject(nextVal)) {
      if (JSON.stringify(currentVal) !== JSON.stringify(nextVal)) {
        result[key] = nextVal
      }
    } else if (currentVal !== nextVal) {
      result[key] = nextVal
    }
  }
  return result
}

export const calcFormLabelWidth = (locale) => {
  return locale.startsWith('de') ? '28%' : '25%'
}

export const parseHeader = (header = '') => {
  header = header.trim()
  let result = {}
  if (!header) {
    return result
  }

  const headers = splitTextRows(header)
  headers.forEach((line) => {
    const index = line.indexOf(':')
    const name = line.substring(0, index)
    const value = line.substring(index + 1).trim()
    result[name] = value
  })
  result = changeKeysToCamelCase(result)

  return result
}

export const normalizeCookie = (raw = '') => {
  const text = `${raw || ''}`.trim()
  if (!text) {
    return ''
  }

  const rows = splitTextRows(text)
  const map = new Map()

  rows.forEach((row) => {
    let line = `${row || ''}`.trim()
    if (!line || line.startsWith('#')) {
      return
    }

    if (/^cookie\s*:/i.test(line)) {
      line = line.replace(/^cookie\s*:/i, '').trim()
    }

    if (line.includes('=')) {
      const segments = line.split(/;+/)
      segments.forEach((seg) => {
        const s = `${seg || ''}`.trim()
        if (!s) return
        const idx = s.indexOf('=')
        if (idx <= 0) return
        const name = s.substring(0, idx).trim()
        const value = s.substring(idx + 1).trim()
        if (!name) return
        map.set(name, value)
      })
      return
    }

    const cols = line.split(/\s+/).filter(Boolean)
    if (cols.length < 2) {
      return
    }
    const lowerCols = cols.map(c => `${c}`.toLowerCase())
    if (lowerCols.includes('name') && lowerCols.includes('value')) {
      return
    }
    const name = cols[0].trim()
    const value = cols[1].trim()
    if (!name || !value) {
      return
    }
    map.set(name, value)
  })

  const parts = []
  map.forEach((v, k) => {
    parts.push(`${k}=${v}`)
  })
  return parts.join('; ')
}

export const formatOptionsForEngine = (options = {}) => {
  const result = {}

  Object.keys(options).forEach((key) => {
    const kebabCaseKey = kebabCase(key)
    if (Array.isArray(options[key])) {
      result[kebabCaseKey] = options[key].join('\n')
    } else {
      result[kebabCaseKey] = `${options[key]}`
    }
  })

  return result
}

/**
 * 将 bt-encryption-mode / bt-force-encryption 转换为引擎实际接受的
 * bt-require-crypto + bt-min-crypto-level 选项，并删除已转换的旧字段。
 * 返回新对象，不修改入参。引擎启动参数与运行时选项共用此逻辑。
 */
export const normalizeBtEncryptionOptions = (options = {}) => {
  const normalized = { ...options }
  if (normalized['bt-encryption-mode'] !== undefined) {
    const mode = normalized['bt-encryption-mode']
    if (mode === 'force') {
      normalized['bt-require-crypto'] = true
      normalized['bt-min-crypto-level'] = 'arc4'
    } else if (mode === 'none') {
      normalized['bt-require-crypto'] = false
      normalized['bt-min-crypto-level'] = 'plain'
    } else {
      normalized['bt-require-crypto'] = false
      normalized['bt-min-crypto-level'] = 'arc4'
    }
    delete normalized['bt-encryption-mode']
    delete normalized['bt-force-encryption']
  } else if (normalized['bt-force-encryption'] !== undefined) {
    const forceEncryption = normalized['bt-force-encryption'] === true || normalized['bt-force-encryption'] === 'true'
    normalized['bt-require-crypto'] = forceEncryption
    normalized['bt-min-crypto-level'] = forceEncryption ? 'arc4' : 'plain'
    delete normalized['bt-force-encryption']
  }
  return normalized
}

export const buildRpcUrl = (options = {}) => {
  const { port, secret } = options
  let result = `${ENGINE_RPC_HOST}:${port}/jsonrpc`
  if (secret) {
    result = `token:${secret}@${result}`
  }
  result = `http://${result}`

  return result
}

export const checkIsNeedRestart = (changed = {}) => {
  if (isEmpty(changed)) {
    return false
  }
  const kebabCaseChanged = changeKeysToKebabCase(changed)
  const changedKeys = new Set(Object.keys(kebabCaseChanged))
  return needRestartKeys.some(key => changedKeys.has(key))
}

export const checkIsNeedRun = (enable, lastTime, interval) => {
  if (!enable) {
    return false
  }

  return (Date.now() - lastTime > interval)
}

export const checkIsNeedRunAdvanced = (enable, lastTime, interval, customTime) => {
  if (!enable) {
    return false
  }

  const now = Date.now()

  // 如果提供了自定义时间（如"02:00"），按具体时间点检查
  if (customTime) {
    const [hours, minutes] = customTime.split(':').map(Number)
    const targetTime = new Date()
    targetTime.setHours(hours, minutes, 0, 0)

    // 如果当前时间已经超过目标时间，检查是否在今天已经运行过
    if (now >= targetTime.getTime()) {
      // 检查上次运行时间是否在今天目标时间之前
      const lastSyncDate = new Date(lastTime)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      return lastSyncDate < today || lastTime < targetTime.getTime()
    }

    return false
  }

  // 否则按间隔时间检查
  return (now - lastTime > interval)
}

export const generateRandomInt = (min = 0, max = 10000) => {
  let result = min
  const range = max - min
  result += Math.floor(Math.random() * Math.floor(range))
  return result
}

export const intersection = (array1 = [], array2 = []) => {
  if (array1.length === 0 || array2.length === 0) {
    return []
  }

  return array1.filter(value => array2.includes(value))
}

export const cloneArray = (arr = [], reversed = false) => {
  if (!Array.isArray(arr)) {
    return arr
  }

  const result = [...arr]
  return reversed ? result.reverse() : result
}

export const pushItemToFixedLengthArray = (arr = [], maxLength, item) => {
  const result = arr.length >= maxLength
    ? [...arr.slice(1, maxLength - 1), item]
    : [...arr, item]
  return result
}

export const removeArrayItem = (arr = [], item) => {
  const idx = arr.indexOf(item)
  if (idx === -1) {
    return [...arr]
  }

  const result = [
    ...arr.slice(0, idx),
    ...arr.slice(idx + 1)
  ]
  return result
}

export const getInverseTheme = (theme) => {
  return (theme === APP_THEME.LIGHT) ? APP_THEME.DARK : APP_THEME.LIGHT
}

export const changedConfig = { basic: {}, advanced: {} }
export const backupConfig = { theme: undefined, locale: undefined }

export const normalizeTaskUri = (uri = '') => {
  return sanitizeLink(uri)
}

export const getTaskUriForComparison = (task) => {
  const { files, bittorrent, infoHash } = task

  if (bittorrent && infoHash) {
    return `magnet:?xt=urn:btih:${infoHash}`
  }

  if (files && files.length > 0 && files[0].uris && files[0].uris.length > 0) {
    return normalizeTaskUri(files[0].uris[0].uri)
  }

  return ''
}

export const checkTaskDuplicate = async (engineClient, taskUri, historyTasks = []) => {
  if (!taskUri) {
    return { isDuplicate: false, duplicateCount: 0 }
  }

  const normalizedUri = normalizeTaskUri(taskUri)
  const duplicateSet = new Set()

  try {
    const [active, waiting, stopped] = await Promise.all([
      engineClient.call('tellActive'),
      engineClient.call('tellWaiting', 0, 1000),
      engineClient.call('tellStopped', 0, 10000)
    ])

    const allTasks = [...(active || []), ...(waiting || []), ...(stopped || [])]

    allTasks.forEach(task => {
      const taskUri = getTaskUriForComparison(task)
      if (taskUri && normalizeTaskUri(taskUri) === normalizedUri) {
        duplicateSet.add(task.gid)
      }
    })
  } catch (error) {
    console.error('[Duplicate Check] Error checking engine tasks:', error)
  }

  if (Array.isArray(historyTasks)) {
    historyTasks.forEach(task => {
      const taskUri = getTaskUriForComparison(task)
      if (taskUri && normalizeTaskUri(taskUri) === normalizedUri) {
        duplicateSet.add(task.gid || task.uri)
      }
    })
  }

  return {
    isDuplicate: duplicateSet.size > 0,
    duplicateCount: duplicateSet.size
  }
}

export const generateUniqueTaskName = (baseName, existingNames = new Set()) => {
  if (!baseName) {
    return baseName
  }

  const lastDotIndex = baseName.lastIndexOf('.')
  let nameWithoutExt = baseName
  let ext = ''

  if (lastDotIndex > 0) {
    nameWithoutExt = baseName.substring(0, lastDotIndex)
    ext = baseName.substring(lastDotIndex)
  }

  let counter = 1
  let uniqueName = baseName

  while (existingNames.has(uniqueName)) {
    uniqueName = `${nameWithoutExt} (${counter})${ext}`
    counter++
  }

  return uniqueName
}

export const handleTaskDuplicate = async (engineClient, taskData, historyTasks = []) => {
  const { uri, name } = taskData

  if (!uri) {
    return taskData
  }

  const { isDuplicate, duplicateCount } = await checkTaskDuplicate(engineClient, uri, historyTasks)

  if (!isDuplicate) {
    return taskData
  }

  const allTasks = []

  try {
    const [active, waiting, stopped] = await Promise.all([
      engineClient.call('tellActive'),
      engineClient.call('tellWaiting', 0, 1000),
      engineClient.call('tellStopped', 0, 10000)
    ])

    allTasks.push(...(active || []), ...(waiting || []), ...(stopped || []))
  } catch (error) {
    console.error('[Duplicate Check] Error fetching tasks:', error)
  }

  if (Array.isArray(historyTasks)) {
    allTasks.push(...historyTasks)
  }

  const existingNames = new Set()
  allTasks.forEach(task => {
    const taskName = task.bittorrent?.info?.name ||
      (task.files?.[0]?.path ? task.files[0].path.split(/[\\/]/).pop() : '')
    if (taskName) {
      existingNames.add(taskName)
    }
  })

  const uniqueName = generateUniqueTaskName(name, existingNames)

  return {
    ...taskData,
    name: uniqueName,
    isDuplicate: true,
    duplicateCount
  }
}

// GitHub 镜像加速工具
export {
  isGithubUrl,
  convertToMirrorUrl,
  getGithubUrlsWithMirrors,
  fetchWithGithubMirror,
  getGithubApiMirrorUrl,
  getGithubMirrorConfig
} from './github-mirror'
