import { isEmpty } from 'lodash'
import { existsSync, mkdirSync } from 'node:fs'

import {
  ADD_TASK_TYPE,
  NONE_SELECTED_FILES,
  SELECTED_ALL_FILES,
  TASK_STATUS
} from '@shared/constants'
import { splitTaskLinks, normalizeCookie } from '@shared/utils'
import { buildOuts } from '@shared/utils/rename'
import {
  buildCategorizedPaths,
  shouldCategorizeFiles
} from '@shared/utils/file-categorize'
import { inferRefererFromUrl } from '@shared/utils/referer-rules'

import {
  buildUrisFromCurl,
  buildHeadersFromCurl,
  buildDefaultOptionsFromCurl
} from '@shared/utils/curl'

const buildHeaderForUri = (form, uri, explicit = {}) => {
  const { userAgent, referer, cookie, authorization, fromBrowserExtension } = form || {}
  const result = []

  const ua = !isEmpty(userAgent) ? userAgent : (explicit.userAgent || '')
  if (!isEmpty(ua)) {
    result.push(`User-Agent: ${ua}`)
  }

  const ref = !isEmpty(referer)
    ? referer
    : (explicit.referer || inferRefererFromUrl(uri) || '')
  if (!isEmpty(ref)) {
    result.push(`Referer: ${ref}`)
  }

  if (!isEmpty(cookie)) {
    result.push(`Cookie: ${cookie}`)
  }
  if (!isEmpty(authorization)) {
    result.push(`Authorization: ${authorization}`)
  }
  if (fromBrowserExtension) {
    result.push('X-Lerxu-Source: BrowserExtension')
  }

  return result
}

export const initTaskForm = state => {
  const { addTaskUrl, addTaskOptions } = state.app
  const {
    allProxy,
    dir,
    engineMaxConnectionPerServer,
    followMetalink,
    followTorrent,
    maxConnectionPerServer,
    newTaskShowDownloading,
    newTaskJumpTarget,
    split
  } = state.preference.config

  let initialSplit = Number(maxConnectionPerServer)
  if (!Number.isFinite(initialSplit) || initialSplit <= 0) {
    initialSplit = Number(split)
  }
  if (!Number.isFinite(initialSplit) || initialSplit <= 0) {
    initialSplit = Number(engineMaxConnectionPerServer)
  }
  if (!Number.isFinite(initialSplit) || initialSplit <= 0) {
    initialSplit = 1
  }

  const result = {
    allProxy,
    cookie: '',
    dir,
    engineMaxConnectionPerServer,
    followMetalink,
    followTorrent,
    maxConnectionPerServer,
    newTaskShowDownloading,
    newTaskJumpTarget: newTaskJumpTarget || 'downloading',
    out: addTaskOptions.suggestedFilename || '',
    customOuts: [],
    referer: '',
    selectFile: NONE_SELECTED_FILES,
    split: initialSplit,
    torrent: '',
    uris: addTaskUrl,
    userAgent: '',
    authorization: '',
    ...addTaskOptions
  }
  // addTaskOptions（如引擎 getOption 返回值）可能携带字符串形式的 split，
  // 归一化为正整数，避免 ElInputNumber 的 Number 类型校验告警/异常
  if (result.split !== undefined) {
    const splitNum = Number(result.split)
    result.split = Number.isFinite(splitNum) && splitNum > 0 ? splitNum : initialSplit
  }
  return result
}

export const buildHeader = (form, uris = []) => {
  const { userAgent, referer, cookie, authorization, fromBrowserExtension } = form
  const result = []

  // 用户设置的请求头始终优先，自动推断的请求头不会覆盖用户设置
  if (!isEmpty(userAgent)) {
    result.push(`User-Agent: ${userAgent}`)
  }

  // Referer 处理：用户设置优先，仅在用户未设置时才自动推断
  if (!isEmpty(referer)) {
    // 用户手动设置的 Referer，优先级最高
    result.push(`Referer: ${referer}`)
  } else if (uris.length > 0) {
    // 自动推断 Referer（仅在用户未设置时）
    const inferredReferer = inferRefererFromUrl(uris[0])
    if (inferredReferer) {
      result.push(`Referer: ${inferredReferer}`)
    }
  }

  if (!isEmpty(cookie)) {
    result.push(`Cookie: ${cookie}`)
  }
  if (!isEmpty(authorization)) {
    result.push(`Authorization: ${authorization}`)
  }

  if (fromBrowserExtension) {
    result.push('X-Lerxu-Source: BrowserExtension')
  }

  return result
}

export const buildOption = (type, form, uris = [], includeHeader = true) => {
  const {
    allProxy,
    dir,
    out,
    selectFile,
    split
  } = form
  const result = {}

  if (!isEmpty(allProxy)) {
    result.allProxy = allProxy
  }

  if (!isEmpty(dir)) {
    result.dir = dir
  }

  if (!isEmpty(out)) {
    result.out = out
  }

  if (split > 0) {
    result.split = split
  }

  if (type === ADD_TASK_TYPE.TORRENT) {
    if (
      selectFile !== SELECTED_ALL_FILES &&
      selectFile !== NONE_SELECTED_FILES
    ) {
      result.selectFile = selectFile
    }
  }

  if (includeHeader) {
    const header = buildHeader(form, uris)
    if (!isEmpty(header)) {
      result.header = header
    }
  }

  return result
}

export const buildUriPayload = async (form, autoCategorize = false, categories = null) => {
  let { uris, out, dir } = form
  if (isEmpty(uris)) {
    throw new Error('task.new-task-uris-required')
  }

  uris = splitTaskLinks(uris)
  const curlHeaders = buildHeadersFromCurl(uris)
  uris = buildUrisFromCurl(uris)
  form = buildDefaultOptionsFromCurl(form, curlHeaders)

  const normalizedCookie = form && form.cookie ? normalizeCookie(form.cookie) : ''
  if (normalizedCookie) {
    form.cookie = normalizedCookie
  }

  const nextUris = []
  const optionsList = []

  for (const u of uris) {
    nextUris.push(u)

    const customReferers = Array.isArray(form.customReferers) ? form.customReferers : []
    const customUserAgents = Array.isArray(form.customUserAgents) ? form.customUserAgents : []
    const uriIndex = nextUris.length - 1

    const header = buildHeaderForUri(form, u, {
      referer: customReferers[uriIndex] || null,
      userAgent: customUserAgents[uriIndex] || null
    })
    optionsList.push(!isEmpty(header) ? { header } : null)
  }

  uris = nextUris
  let outs = buildOuts(uris, out)
  if (Array.isArray(form.customOuts) && form.customOuts.length === uris.length) {
    outs = [...form.customOuts]
  }

  let categorizedPaths = []
  if (shouldCategorizeFiles(autoCategorize, categories) && dir) {
    categorizedPaths = buildCategorizedPaths(uris, outs, categories, dir)
    const uniqueDirs = Array.from(new Set(
      categorizedPaths.map(item => item.categorizedDir).filter(Boolean)
    ))
    uniqueDirs.forEach(d => {
      if (!existsSync(d)) {
        try {
          mkdirSync(d, { recursive: true })
        } catch (error) {}
      }
    })
  }

  const options = buildOption(ADD_TASK_TYPE.URI, form, uris, false)
  const result = {
    uris,
    outs,
    options,
    optionsList,
    dirs: categorizedPaths.length > 0 ? categorizedPaths.map(item => item.categorizedDir) : null,
    priorities: Array.isArray(form.priorities) ? [...form.priorities] : null
  }
  return result
}

export const buildTorrentPayload = (form) => {
  const { torrent } = form
  if (isEmpty(torrent)) {
    throw new Error('task.new-task-torrent-required')
  }

  const options = buildOption(ADD_TASK_TYPE.TORRENT, form)
  const result = {
    torrent,
    options
  }
  return result
}

// 磁力任务 follow 出的 BT 任务 gid 每次重启都会变，infoHash 才是稳定标识。
// 取值优先级：任务上的 infoHash，退化为 bittorrent.info.hash，
// 最后兜底从磁力链接里解析 btih（兼容 40 位十六进制与 32 位 base32）。
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

const decodeBase32ToHex = (input) => {
  const s = `${input || ''}`.toLowerCase()
  let acc = 0n
  for (let i = 0; i < s.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(s[i])
    if (idx === -1) {
      return ''
    }
    acc = (acc << 5n) | BigInt(idx)
  }
  return acc.toString(16).padStart(40, '0')
}

const extractBtihFromUri = (uri) => {
  const m = `${uri || ''}`.match(/xt=urn:btih:([0-9a-fA-F]{40}|[a-zA-Z2-7]{32})(?:&|$)/i)
  if (!m) {
    return ''
  }
  const raw = m[1]
  if (raw.length === 40) {
    return raw.toLowerCase()
  }
  return decodeBase32ToHex(raw)
}

export const getTaskInfoHash = (task) => {
  if (!task) {
    return ''
  }
  const bt = task.bittorrent
  const direct = `${task.infoHash || (bt && bt.info && bt.info.hash) || ''}`.trim().toLowerCase()
  if (direct) {
    return direct
  }
  const uris = []
  if (task.uri) {
    uris.push(task.uri)
  }
  if (task.taskUri) {
    uris.push(task.taskUri)
  }
  const files = Array.isArray(task.files) ? task.files : []
  files.forEach(file => {
    const list = file && Array.isArray(file.uris) ? file.uris : []
    list.forEach(u => {
      if (u && u.uri) {
        uris.push(u.uri)
      }
    })
  })
  for (let i = 0; i < uris.length; i++) {
    const hash = extractBtihFromUri(uris[i])
    if (hash) {
      return hash
    }
  }
  return ''
}

// 判断任务是否已被用户确认过文件选择。
// confirmedMap: confirmedFileSelection（gid -> infoHash | true）
// 兼容两种匹配：gid 精确匹配（同任务恢复）与 infoHash 匹配
// （磁力任务 follow 生成新 gid / 引擎重启后 gid 漂移）。
export const isTaskFileSelectionConfirmed = (confirmedMap, task) => {
  if (!confirmedMap || !task) {
    return false
  }
  const gid = String(task.gid || '')
  if (gid && confirmedMap[gid]) {
    return true
  }
  const hash = getTaskInfoHash(task)
  if (!hash) {
    return false
  }
  return Object.values(confirmedMap).some(v =>
    typeof v === 'string' && v.trim().toLowerCase() === hash)
}

// 判定任务是否处于"待选择文件"形态（应用重启后用于补标记）。
// 判定依据只有任务自身的客观状态：
//   - paused（被引擎/前端暂停等待用户操作）
//   - BT 元数据已解析（bittorrent.info 存在）
//   - 多文件
//   - 尚无下载进度（completedLength == 0）
// 注意：不能把 files[].selected 部分选择 / 历史 confirmed 记录当作"已确认"
// 的否定证据——磁力任务重启后这些选项会从旧会话继承（select-file/同
// infoHash 的旧确认可能属于早已结束的实例），导致用户本次尚未选择文件
// 的任务在重启后标不上待选择、退回普通暂停。
export const isTaskPendingSelectionCandidate = (task) => {
  if (!task) {
    return false
  }
  if (`${task.status || ''}` !== TASK_STATUS.PAUSED) {
    return false
  }
  const bt = task.bittorrent
  if (!bt || !bt.info) {
    return false
  }
  const files = Array.isArray(task.files) ? task.files : []
  if (files.length <= 1) {
    return false
  }
  return Number(task.completedLength || 0) <= 0
}

// 判断任务能否作为"待选择文件"记录按 infoHash 重挂的目标。
// 元数据已解析时沿用候选判定（暂停/多文件/无进度）；元数据尚未解析的
// 暂停磁力任务（重启后引擎只恢复磁力本体且暂停态不会拉元数据）只要
// 没有下载进度就允许挂上——否则重启后标记找不到落点，任务会退回
// 普通"暂停"显示。
export const isTaskPendingSelectionTarget = (task) => {
  if (!task) {
    return false
  }
  if (`${task.status || ''}` !== TASK_STATUS.PAUSED) {
    return false
  }
  if (Number(task.completedLength || 0) > 0) {
    return false
  }
  const bt = task.bittorrent
  if (!bt || !bt.info) {
    return true
  }
  return isTaskPendingSelectionCandidate(task)
}
