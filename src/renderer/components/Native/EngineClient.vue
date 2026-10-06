<template>
  <div v-if="false"></div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import is from 'electron-is'
import { ipcRenderer } from 'electron'
import { ElMessage } from 'element-plus'
import api from '@/api'
import taskHistory from '@/api/TaskHistory'
import {
  getTaskFullPath,
  getTaskActualPath,
  getPathCandidates,
  showNativeNotification
} from '@/utils/native'
import i18n from '@/plugins/i18n'
import { createMsg } from '@/components/Msg'
import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/task'
import { usePreferenceStore } from '@/store/preference'
import { storeToRefs } from 'pinia'
import { checkTaskIsBT, getTaskName, getTaskUri, isMagnetTask } from '@shared/utils'
import { isTaskPendingSelectionCandidate, isTaskPendingSelectionTarget, isTaskFileSelectionConfirmed, getTaskInfoHash } from '@/utils/task'
import { TASK_STATUS } from '@shared/constants'
import { spawn, spawnSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, renameSync, mkdirSync, utimesSync, statSync, readdirSync, unlinkSync, copyFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, basename, extname, resolve, isAbsolute, join } from 'node:path'
import { app } from '@electron/remote'
import {
  autoCategorizeDownloadedFile as autoCategorizeFile,
  buildCategorizedPath,
  createCategoryDirectory
} from '@shared/utils/file-categorize'
import {
  clearMergeRetryTimer,
  setMergeRetryTimer,
  clearAllMergeRetryTimers,
  hasMergeRetryTimer
} from '@/utils/mergeRetryManager'
import { isTargetWrittenByEntries } from '@/utils/mergeInput'
import { createCompleteNotifier } from '@/utils/completeNotify'
import {
  mediaEngineBinName,
  mediaEngineCandidates,
  parseEngineLine,
  progressFromEngineLine,
  probeHasVideoAndAudio,
  engineErrorText,
  buildMuxArgs,
  engineEnvFromConfig,
  mergeOutputExtension
} from '@shared/zuvrust'

defineOptions({ name: 'mo-engine-client' })

// 通知去重标记（组件级共享）
//
// 此前这几处在使用前从未声明就直接赋值（`if (!X) { X = new Map() }` 形式）。
// `<script setup>` 是 ES module（严格模式），访问未声明标识符会抛
// ReferenceError，导致「浏览器接管启动通知」「缺少媒体引擎提示」
// 「存储权限提示」三条路径整体失效（ESLint no-undef 抓出）。
// （"浏览器启动通知"与"缺媒体引擎只提示一次"现在都按**下载身份**去重：
//  见 _downloadStartNotifier / _completeNotifier，utils/completeNotify）
let _permNotifiedGids = null

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })
const route = useRoute()

const appStore = useAppStore()
const taskStore = useTaskStore()
const preferenceStore = usePreferenceStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)
const { interval, progress } = storeToRefs(appStore)
const { seedingList, taskDetailVisible, enabledFetchPeers, currentTaskGid, currentTaskItem } = storeToRefs(taskStore)

// Computed from app store
const uploadSpeed = computed(() => appStore.stat.uploadSpeed)
const downloadSpeed = computed(() => appStore.stat.downloadSpeed)
const speed = computed(() => appStore.stat.uploadSpeed + appStore.stat.downloadSpeed)
const downloading = computed(() => appStore.stat.numActive > 0)
// Computed from preference store

// --- Data ---
const magnetZeroMap = ref({})
const magnetAlertedSet = ref(new Set())
const magnetResolvedSet = ref(new Set())
const dataAccessZeroMap = ref({})
const dataAccessLastCompletedMap = ref({})
const pollingCount = ref(0)
const taskSpeedSampleBaseMap = ref({})
const downloadStartNotifiedGids = ref(new Set())
const segmentErrorRetryMap = ref({})
const autoRefererFallbackTriedUris = ref(new Set())
const engineConnectionStable = ref(true)
const pendingFileSelectionSynced = ref(false)
let lastSpeedUpdate = null
let timer = null
let _bootTimer = null
let _visibilityHandler = null
// 一条下载只弹一次完成通知（键取 pairId / gid，见 utils/completeNotify）
const _completeNotifier = createCompleteNotifier()
// 「开始下载」类通知同理：**一次下载只弹一次**，一对音视频（画面流 + 声音流，
// 两个 gid 一个 pairId）算同一次下载 —— 用户看到的是"媒体任务添加时弹两个
// 通知"（2026-10-06 交接）。旧实现按"文件名 + 10 秒窗口"去重，两条流在刚下发、
// 文件还没建时认不出配对，键会退化成各自的 gid ⇒ 各弹一次；两条流先后开始
// （隔得久）时 10 秒窗口也过期。身份口径与完成通知一致 ⇒ 窗口给足 10 分钟。
const _downloadStartNotifier = createCompleteNotifier({ ttlMs: 10 * 60 * 1000 })
let _dashMergeJobs = new Map()
// 正在跑的 `zuvrust mux` 子进程：合并是长任务，宿主退出 / 组件卸载时要能一把
// 收掉，否则引擎进程会被留下继续吃 CPU 与磁盘（正常结束它会自己退出）。
const _activeMuxChildren = new Set()
// 合并卡死的两道兜底：无进度输出的空闲时限，以及硬性总时限。
// 都只是为了"别把卡死的进程一直留在后台"，正常合并远够用。
const MUX_IDLE_TIMEOUT_MS = 180 * 1000
const MUX_HARD_TIMEOUT_MS = 60 * 60 * 1000
// 「合并簿记看着像在合并、其实没有任何合并在跑」的起始时间（自愈用，见
// reconcileStaleMergingEntries）。连续 STALE_MERGING_MS 都如此才认定是中断残迹。
const _staleMergingSince = new Map()
const STALE_MERGING_MS = 6000
let _pendingSelectionNotified = new Set()
let _pollingKickAt = 0
let _btRetryTimers = new Map()
let _resumedCompletedFixing = false
let _resumedCompletedFixedGids = null
let _resumedCompletedLastRun = 0
let _resumedErrorFixing = false
let _resumedErrorLastRun = 0
let _resumedErrorFixedGids = null

// --- Computed ---
const isRenderer = is.renderer()
const currentTaskIsBT = computed(() => checkTaskIsBT(currentTaskItem.value))

// --- Watchers ---
watch(speed, (val) => {
        // Throttle speed updates to avoid excessive IPC calls
        // Only update if it's been more than 800ms since last update
        const now = Date.now()
        if (lastSpeedUpdate && now - lastSpeedUpdate < 800) {
          return
        }
        lastSpeedUpdate = now

        const { uploadSpeed: us, downloadSpeed: ds } = { uploadSpeed: uploadSpeed.value, downloadSpeed: downloadSpeed.value }
        ipcRenderer.send('event', 'speed-change', {
          uploadSpeed: us,
          downloadSpeed: ds
        })
})
watch(downloading, (val, oldVal) => {
        if (val !== oldVal && isRenderer) {
          ipcRenderer.send('event', 'download-status-change', val)
        }
})
watch(progress, (val) => {
        ipcRenderer.send('event', 'progress-change', val)
})

// --- Methods ---

      function isPreferenceWindow() {
        const path = route && route.path ? `${route.path}` : ''
        const hashPath = typeof window !== 'undefined' && window.location && window.location.hash
          ? `${window.location.hash}`
          : ''
        return path.startsWith('/preference-window') || hashPath.startsWith('#/preference-window')
      }
      function maybeEnterIdleInterval() {
        const hidden = typeof document !== 'undefined' && !!document.hidden
        const stat = appStore.stat || {}
        const numActive = Number(stat.numActive || 0)
        const numWaiting = Number(stat.numWaiting || 0)
        const busy = (numActive + numWaiting) > 0 || !!taskDetailVisible.value
        if (hidden && !busy) {
          appStore.updateInterval(30000)
          appStore.clearProgress()
        }
      }
      function renamePreserveTimes(from, to) {
        let st = null
        try {
          st = statSync(from)
        } catch (_) {}
        try {
          renameSync(from, to)
        } catch (err) {
          if (err && err.code === 'EXDEV') {
            try {
              copyFileSync(from, to)
              unlinkSync(from)
            } catch (_) {
              return false
            }
          } else {
            return false
          }
        }
        if (st) {
          try {
            utimesSync(to, st.atime, st.mtime)
          } catch (_) {}
        }
        return existsSync(to) && !existsSync(from)
      }
      /**
       * 清理引擎下载控制文件（<file>.xfer）。
       * 下载完成后应用会把带后缀的文件重命名为最终文件名，此时引擎的
       * 控制文件可能因竞态未被引擎自身删除而残留，这里统一清理。
       */
      function cleanupAria2ControlFiles(paths) {
        const list = Array.isArray(paths) ? paths : [paths]
        list.forEach((p) => {
          if (!p) return
          ;['.xfer'].forEach((ext) => {
            const controlPath = `${p}${ext}`
            try {
              if (existsSync(controlPath)) {
                unlinkSync(controlPath)
                console.log(`[Lerxu] Cleaned up engine control file: ${controlPath}`)
              }
            } catch (e) {
              console.warn(`[Lerxu] Failed to remove engine control file ${controlPath}:`, e && e.message ? e.message : e)
            }
          })
        })
      }
      /**
       * 修复带有下载后缀的文件名中的序号位置
       * 例如：/path/to/5EClient-8.2.5.exe (1).vxdv -> /path/to/5EClient-8.2.5 (1).exe.vxdv
       */
      function fixFileNameWithSuffix(filePath, downloadingFileSuffix) {
        if (!downloadingFileSuffix || !filePath.endsWith(downloadingFileSuffix)) {
          return filePath
        }

const dir = dirname(filePath)
        const fullFilename = basename(filePath)

        // 移除下载后缀得到原始文件名（可能带有错误位置的序号）
        const filenameWithoutDownloadSuffix = fullFilename.slice(0, -downloadingFileSuffix.length)

        // 检查是否有 aria2 添加的序号 (1), (2), etc. 在扩展名后面
        // 例如：5EClient-8.2.5.exe (1) 应该变成 5EClient-8.2.5 (1).exe
        const duplicatePattern = /^(.+?)(\.[^.\s]+)(\s+\(\d+\))$/
        const match = filenameWithoutDownloadSuffix.match(duplicatePattern)

        if (match) {
          const [, baseName, extension, duplicateNumber] = match
          // 重新组织文件名：baseName + duplicateNumber + extension + downloadingFileSuffix
          const fixedFilename = baseName + duplicateNumber + extension + downloadingFileSuffix
          return join(dir, fixedFilename)
        }

        return filePath
      }
      async function fetchTaskItem({ gid }) {
        return api.fetchTaskItem({ gid })
          .catch((e) => {
            console.warn(`fetchTaskItem fail: ${e.message}`)
          })
      }
      function onDownloadStart(event) {
        taskStore.fetchList()
        appStore.resetInterval()
        taskStore.saveSession()
        kickPolling()
        const [{ gid }] = event
        if (seedingList.value.includes(gid)) {
          return
        }

        // 检查是否已经显示过这个任务的开始下载通知，防止重复显示
        if (downloadStartNotifiedGids.value.has(gid)) {
          return
        }
        downloadStartNotifiedGids.value.add(gid)

        fetchTaskItem({ gid })
          .then(async (task) => {
            if (!task) {
              return
            }
            const { dir } = task
            preferenceStore.recordHistoryDirectory(dir)
            const taskName = getTaskName(task)
            const cfg = preferenceConfig.value || {}
            let fromHistory = false
            try {
              const gidKey = task && task.gid ? `${task.gid}` : ''
              const t = gidKey ? (taskHistory.getAllHistory() || []).find(x => x && `${x.gid}` === gidKey) : null
              fromHistory = !!(t && t.fromBrowserExtension)
            } catch (_) {}
            let isBilibiliPart = false
            try {
              const p = getTaskActualPath(task, cfg)
              const info = parseBilibiliDashPart(p)
              isBilibiliPart = !!(info && info.base)
            } catch (_) {}
            if (!isBilibiliPart) {
              try {
                const files = Array.isArray(task && task.files) ? task.files : []
                const first = files.length > 0 ? files[0] : null
                const p = first && first.path ? `${first.path}` : ''
                if (p) {
                  const base = basename(p)
                  const lower = base.toLowerCase()
                  if (lower.endsWith('_video.mp4') || lower.endsWith('_audio.m4a') || /\.m4s$/i.test(base)) {
                    isBilibiliPart = true
                  }
                }
              } catch (_) {}
            }
            try {
              const opt = await api.getOption({ gid })
              const hs = opt && opt.header ? opt.header : []
              const headers = Array.isArray(hs) ? hs : (typeof hs === 'string' ? [hs] : [])
              const referer = opt && opt.referer ? `${opt.referer}` : ''
              if (!isBilibiliPart && looksLikeBilibiliSource(referer, headers)) {
                isBilibiliPart = true
              }
              const fromHeader = headers.some(h => /X-Lerxu-Source\s*:\s*BrowserExtension/i.test(`${h}`))
              const fromBrowserExtension = fromHeader || fromHistory
              if (fromBrowserExtension) {
                notifyDownloadStartOnce(task, taskName, true)
              } else if (!isBilibiliPart) {
                notifyDownloadStartOnce(task, taskName, false)
              }
            } catch (_) {
              if (fromHistory) {
                notifyDownloadStartOnce(task, taskName, true)
              } else if (!isBilibiliPart) {
                notifyDownloadStartOnce(task, taskName, false)
              }
            }

            ensureTargetDirectoryExists(task)
            ensureCategoryDirectoryForTask(task)
          })
      }
      function onDownloadPause(event) {
        const [{ gid }] = event
        if (seedingList.value.includes(gid)) {
          return
        }

        // 引擎真正确认暂停时立即刷新 UI。
        // 暂停 RPC 返回时 BT 任务往往还处于 active（等引擎下一轮迭代才真正
        // 转为 paused），若只依赖轮询（idle 时最长 30s），用户会感觉
        // "暂停很久才生效"，这里通过事件驱动实现即时反馈。
        // 注意：不弹 toast，因为引擎侧自动暂停（磁力元数据下载完成后等待
        // 选择文件、bt-stop-timeout 自动停止等）也会触发本事件。
        taskStore.fetchList()
        appStore.resetInterval()
        kickPolling()
      }
      function onDownloadStop(event) {
        const [{ gid }] = event
        fetchTaskItem({ gid })
          .then((task) => {
            if (!task) {
              return
            }
            const taskName = getTaskName(task)
            const message = t('task.download-stop-message', { taskName })
            msg.info(message)
          })
      }
      function onDownloadError(event) {
        const [{ gid }] = event
        fetchTaskItem({ gid })
          .then(async (task) => {
            if (!task) {
              return
            }
            const taskName = getTaskName(task)
            const { errorCode, errorMessage } = task
            console.error(`[Lerxu] download error gid: ${gid}, #${errorCode}, ${errorMessage}`)
            const reason = resolveErrorReason(errorCode, errorMessage)
            const message = reason
              ? t('task.download-error-with-reason', { taskName, reason })
              : t('task.download-error-message', { taskName })
            const link = `${errorCode}`

            const msg = `${errorMessage || ''}`
            const segmentPath = extractSegmentFilePath(msg)
            const isBt = checkTaskIsBT(task)

            if (segmentPath && isBt) {
              tryRepairSegmentFile(task, segmentPath).catch(() => {})
            }

            // 对BT任务添加额外的错误处理和恢复机制
            if (isBt) {
              console.warn('[Lerxu] BT task error detected:', {
                gid,
                taskName,
                errorCode,
                errorMessage,
                bittorrent: task.bittorrent,
                filesCount: task.files ? task.files.length : 0
              })
              handleBtErrorRecovery(task, errorCode, errorMessage)
            }
            const parseHttpStatus = (text) => {
              const m = `${text || ''}`.match(/\b(\d{3})\b/)
              return m ? Number(m[1]) || 0 : 0
            }
            const httpStatus = parseHttpStatus(msg)

            const isTimeout = /timeout|timed\s*out|ETIMEDOUT/i.test(msg)
            const isHashMismatch = /hash\s*mismatch|checksum|digest/i.test(msg)
            const isDiskIssue = Number(errorCode) === 16 || /No space left|disk full|Permission denied|permission/i.test(msg)
            const isServerError = httpStatus >= 500 && httpStatus < 600

            const linkUpdateRule = (code) => {
              const c = Number(code) || 0
              if (c === 403) return { show: true, level: 'must', notifyKey: 'task.link-update-needed-403' }
              if (c === 401) return { show: true, level: 'must', notifyKey: 'task.link-update-needed-401' }
              if (c === 410) return { show: true, level: 'suggest', notifyKey: 'task.link-update-needed-410' }
              if (c === 404) return { show: true, level: 'optional', notifyKey: 'task.link-update-needed-404' }
              if (c === 416) return { show: true, level: 'optional', notifyKey: 'task.link-update-needed-416' }
              return { show: false, level: '', notifyKey: '' }
            }

            const rule = linkUpdateRule(httpStatus)
            const canShowUpdateLink = rule.show && !isBt && !isServerError && !isTimeout && !isDiskIssue && !isHashMismatch

            // 部分视频 CDN（签名直链）拒绝任何带 Referer 的请求（HTTP 403），
            // 浏览器扩展任务默认携带页面 Referer。这里先自动移除 Referer/Origin
            // 重试一次，成功则无需用户干预；失败再走"更新链接"提示流程。
            if (httpStatus === 403 && canShowUpdateLink) {
              const retried = await tryAutoRefererFallback(task)
              if (retried) {
                return
              }
            }

            if (canShowUpdateLink) {
              taskStore.markTaskNeedUpdateLink({
                gid,
                httpStatus,
                level: rule.level,
                reason: `HTTP ${httpStatus}`,
                errorCode,
                errorMessage
              })

              const st = task && task.status ? `${task.status}` : ''
              if (st === TASK_STATUS.ACTIVE || st === TASK_STATUS.WAITING) {
                taskStore.pauseTask(task).catch(() => {})
              }
              // 任务因链接失效被暂停（等待更新链接），暂停任务不会进入 stopped
              // 列表，历史记录不会保存错误状态；若此时退出应用，引擎会把暂停
              // 状态写入会话，重启后任务显示为"已暂停"而非"错误"。
              // 这里把错误状态持久化到历史记录，重启后即可恢复 error 显示。
              try {
                taskHistory.updateTask(gid, {
                  status: TASK_STATUS.ERROR,
                  errorCode,
                  errorMessage,
                  savedAt: Date.now()
                }, task)
              } catch (_) {}
              msg.warning(t(rule.notifyKey || 'task.link-update-needed', { taskName }))
            }

            msg({
              type: 'error',
              showClose: true,
              duration: 5000,
              dangerouslyUseHTMLString: true,
              message: `${message} ${link}`
            })
          })
      }
      function extractSegmentFilePath(text = '') {
        const raw = `${text || ''}`
        const match = raw.match(/segment file\s+(.+?\.xfer)\b/i)
        if (!match) {
          return ''
        }
        const path = match[1] ? `${match[1]}` : ''
        return path.replace(/^["']|["']$/g, '')
      }
      // 从引擎错误信息中提取无法打开/重命名的文件路径，
      // 如 "Failed to open the file /path/to/file, cause: ..."
      function extractOpenFailedFilePath(text = '') {
        const raw = `${text || ''}`
        let match = raw.match(/Failed to open the file\s+(.+?),\s*cause:/i)
        if (match) {
          return `${match[1] || ''}`.trim()
        }
        match = raw.match(/Failed to rename the file\s+(.+?)\s+->/i)
        if (match) {
          return `${match[1] || ''}`.trim()
        }
        return ''
      }
      // macOS：修复应用更新后旧下载文件因 TCC 来源属性无法打开的问题。
      // 主进程依次清除 com.apple.provenance、恢复权限、必要时复制重建文件，
      // 返回是否修复成功。
      async function tryRepairDownloadFilePermission(gid, filePath) {
        try {
          const res = await ipcRenderer.invoke('application:repair-download-file-permission', filePath)
          const ok = !!(res && res.repaired)
          console.info(`[Lerxu] repair download file permission gid=${gid} path=${filePath}:`, res)
          return ok
        } catch (err) {
          console.warn('[Lerxu] repair download file permission IPC failed:', err)
          return false
        }
      }
      // 403 自动回退：移除 Referer/Origin 后重建任务重试（每个 URI 仅一次）。
      // 背景：部分视频 CDN（如签名直链 vdownload.hembed.com）会拒绝任何携带
      // Referer 的请求，而浏览器扩展任务默认带上页面 Referer，导致 403；
      // 应用内手动添加因不带 Referer 反而正常。B 站等站点必须携带 Referer，
      // 移除后重试会再次失败并进入既有的"更新链接"提示流程，无副作用。
      async function tryAutoRefererFallback(task) {
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!gid || checkTaskIsBT(task) || isMagnetTask(task)) {
            return false
          }
          const uri = getTaskUri(task)
          if (!uri || !/^https?:/i.test(uri)) {
            return false
          }
          if (autoRefererFallbackTriedUris.value.has(uri)) {
            return false
          }

          let opt = null
          try {
            opt = await api.getOption({ gid })
          } catch (_) {
            return false
          }
          const rawHeaders = opt && opt.header ? opt.header : []
          const headerItems = Array.isArray(rawHeaders) ? rawHeaders : (typeof rawHeaders === 'string' ? [rawHeaders] : [])
          const lines = []
          headerItems.filter(Boolean).forEach(h => {
            `${h}`.split(/\r?\n/).forEach(line => {
              const s = `${line || ''}`.trim()
              if (s) lines.push(s)
            })
          })
          const filtered = lines.filter(l => !/^(referer|origin)\s*:/i.test(l))
          if (filtered.length === lines.length) {
            // 请求头里本来就没有 Referer/Origin，403 与此无关，不做回退
            return false
          }

          autoRefererFallbackTriedUris.value.add(uri)

          const options = {
            continue: true,
            header: filtered
          }
          if (opt.dir) options.dir = `${opt.dir}`
          if (opt.out) options.out = `${opt.out}`
          const proxy = `${(opt.allProxy || opt['all-proxy'] || '').trim()}`
          if (proxy) options.allProxy = proxy
          const split = Number(opt.split)
          if (Number.isFinite(split) && split > 0) options.split = split

          const nextGid = await api.addUriRaw({ uri, options })
          if (!nextGid) {
            autoRefererFallbackTriedUris.value.delete(uri)
            return false
          }

          const oldStatus = task && task.status ? `${task.status}` : ''
          if ([TASK_STATUS.ERROR, TASK_STATUS.COMPLETE, TASK_STATUS.REMOVED].includes(oldStatus)) {
            await taskStore.removeTaskRecord({ gid, status: oldStatus }).catch(() => {})
          } else {
            await taskStore.removeTask({ gid }).catch(() => {})
          }
          await taskStore.fetchList().catch(() => {})
          await appStore.fetchGlobalStat().catch(() => {})

          const taskName = getTaskName(task)
          msg.warning(t('task.auto-referer-fallback', { taskName }))
          console.info(`[Lerxu] 403 auto referer fallback: ${gid} -> ${nextGid} (${uri})`)
          return true
        } catch (e) {
          console.warn('[Lerxu] auto referer fallback failed:', e)
          return false
        }
      }
      async function tryRepairSegmentFile(task, segmentPath) {
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) {
          return false
        }
        const retryMap = segmentErrorRetryMap.value || {}
        const count = Number(retryMap[gid] || 0)
        if (count >= 1) {
          return false
        }
        segmentErrorRetryMap.value[gid] = count + 1

        try {
          if (segmentPath && existsSync(segmentPath)) {
            try {
              unlinkSync(segmentPath)
            } catch (e) {
              console.warn('[Lerxu] Failed to remove segment file:', segmentPath, e)
            }
          }

          const uri = getTaskUri(task)
          if (!uri) {
            return false
          }

          let options = {}
          try {
            const opt = await api.getOption({ gid })
            const out = opt && opt.out ? `${opt.out}` : getTaskName(task)
            options = {
              dir: opt && opt.dir ? `${opt.dir}` : undefined,
              header: opt && opt.header ? opt.header : undefined,
              split: opt && opt.split ? opt.split : undefined
            }
            if (out) {
              options.out = out
            }
          } catch (_) {}

          await taskStore.addUri({
            uris: [uri],
            options
          })

          await api.removeTaskRecord({ gid }).catch(() => {})
          msg.warning('检测到任务续传文件损坏，已尝试自动重建任务')
          return true
        } catch (e) {
          console.warn('[Lerxu] Auto repair segment file failed:', e)
          return false
        }
      }
      function onDownloadComplete(event) {
        const [{ gid }] = event
        taskStore.removeFromSeedingList(gid)

        fetchTaskItem({ gid })
          .then((task) => {
            if (!task) {
              return
            }
            // 磁力任务的元数据下载完成时，引擎会立即派生新的 BT 任务
            // （多文件种子会被暂停等待选择，单文件需前端恢复）。这里必须
            // 走磁力解析处理，而不是普通下载完成流程。事件驱动补齐了轮询
            // 检测的窗口漏洞：元数据在一个轮询周期内就解析完时，
            // magnetZeroMap 从未记录过该任务，暂停的 BT 任务无人恢复，
            // 表现为"下载中莫名自动暂停"。
            const followedBy = Array.isArray(task.followedBy) ? task.followedBy : []
            if (isMagnetTask(task) || followedBy.length > 0) {
              handleMagnetResolved(task)
              return
            }
            return handleDownloadComplete(task, false)
          })
          .finally(() => {
            taskStore.fetchList()
          })
      }
      function onBtDownloadComplete(event) {
        taskStore.fetchList()
        const [{ gid }] = event
        if (seedingList.value.includes(gid)) {
          return
        }

        taskStore.addToSeedingList(gid)

        fetchTaskItem({ gid })
          .then((task) => {
            if (!task) {
              return
            }
            handleDownloadComplete(task, true)
          })
      }
      async function handleDownloadComplete(task, isBT) {
        const cfg = preferenceConfig.value || {}
        const path = getTaskActualPath(task, cfg)
        const finalPath = isBT ? path : await removeDownloadingSuffix(task, path, cfg)
        let isBilibiliPart = false
        if (!isBT) {
          try {
            const info = parseBilibiliDashPart(finalPath)
            if (info && info.base) {
              isBilibiliPart = true
            }
          } catch (_) {}
          if (!isBilibiliPart) {
            try {
              const actual = getTaskActualPath(task, cfg)
              const info2 = parseBilibiliDashPart(actual)
              if (info2 && info2.base) {
                isBilibiliPart = true
              }
            } catch (_) {}
          }
          if (!isBilibiliPart) {
            try {
              const files = Array.isArray(task && task.files) ? task.files : []
              const first = files.length > 0 ? files[0] : null
              const p = first && first.path ? `${first.path}` : ''
              if (p) {
                const base = basename(p)
                const lower = base.toLowerCase()
                if (lower.endsWith('_video.mp4') || lower.endsWith('_audio.m4a') || /\.m4s$/i.test(base)) {
                  isBilibiliPart = true
                }
              }
            } catch (_) {}
          }
          if (!isBilibiliPart) {
            try {
              const gid = task && task.gid ? `${task.gid}` : ''
              if (gid) {
                let fromSupportedSource = false
                try {
                  const t = (taskHistory.getAllHistory() || []).find(x => x && `${x.gid}` === gid)
                  fromSupportedSource = !!(t && t.fromBrowserExtension)
                } catch (_) {}
                if (!fromSupportedSource) {
                  const opt = await api.getOption({ gid })
                  const hs = opt && opt.header ? opt.header : []
                  const headers = Array.isArray(hs) ? hs : (typeof hs === 'string' ? [hs] : [])
                  const referer = opt && opt.referer ? `${opt.referer}` : ''
                  fromSupportedSource = headers.some(h => /X-Lerxu-Source\s*:\s*BrowserExtension/i.test(`${h}`)) ||
                    looksLikeBilibiliSource(referer, headers)
                }
                if (fromSupportedSource) {
                  const pair = collectExtensionDashParts(finalPath || path, cfg)
                  const suffix = cfg.downloadingFileSuffix || ''
                  const looksLikeStream = looksLikeExtensionDashStreamPath(finalPath || path, suffix)
                  if (looksLikeStream || (pair && pair.isPairCandidate)) {
                    isBilibiliPart = true
                  }
                }
              }
            } catch (_) {}
          }
        }

        taskStore.saveSession()
        persistAverageSpeedToHistory(task)
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (gid) {
            // 检查是否为元数据任务 - 这些任务不应该保存到历史记录
            const taskName = task && task.name ? `${task.name}` : ''
            const isMetadataTask = taskName.startsWith('[METADATA]')
            if (isMetadataTask) {
              // 元数据任务完成后不保存到历史记录
              console.log('[Lerxu] Metadata task completed, skipping history save:', gid, taskName)
            } else {
              const files = Array.isArray(task && task.files) ? task.files : []
              const baseFile = files.length > 0 ? files[0] : null
              let nextFiles = files
              let total = task && task.totalLength ? `${task.totalLength}` : ''
              let completed = task && task.completedLength ? `${task.completedLength}` : ''
              if (finalPath) {
                let length = 0
                try {
                  const st = statSync(finalPath)
                  length = Number(st.size || 0)
                } catch (_) {}
                const fileEntry = {
                  ...(baseFile || {}),
                  path: finalPath,
                  ...(length > 0 ? { length: `${length}`, completedLength: `${length}` } : {})
                }
                nextFiles = [fileEntry, ...files.slice(1)]
                if (length > 0) {
                  total = `${length}`
                  completed = `${length}`
                }
              }
              const patch = {
                ...task,
                status: TASK_STATUS.COMPLETE,
                ...(finalPath ? { dir: dirname(finalPath) } : {}),
                ...(Array.isArray(nextFiles) && nextFiles.length > 0 ? { files: nextFiles } : {}),
                ...(total ? { totalLength: total } : {}),
                ...(completed ? { completedLength: completed } : {})
              }
              taskHistory.updateTask(gid, patch, task)
            }
          }
        } catch (_) {}
        try {
          const suffix = cfg.downloadingFileSuffix || ''
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!isBT && suffix && gid) {
            api.removeDownloadResult({ gid }).catch(() => {})
          }
        } catch (_) {}
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (gid) {
            let name = ''
            if (isBT) {
              name = getTaskName(task, { maxLen: -1 })
            } else {
              const base = basename(finalPath || path || '')
              const suffix = cfg.downloadingFileSuffix || ''
              if (suffix && base.endsWith(suffix)) {
                name = base.slice(0, -suffix.length)
              } else {
                name = base
              }
            }
            if (name) {
              taskStore.setTaskDisplayName({ gid, name })
            }
          }
        } catch (_) {}
        // 如果需要合并（Bilibili DASH 分段视频 / 扩展发来的一对音视频），先设置 MERGING 状态
        const mergeGid = task && task.gid ? `${task.gid}` : ''
        // 扩展发来的一对音视频带同一个 pairId（存在任务历史里），
        // 拿到它就等于**明确知道**这一条是"一对里的一半"，配对不再靠文件名猜
        const pairInfo = getTaskPairInfo(task)
        const mergeKey = getDashMergeKey(finalPath, cfg, pairInfo)
        // ── 一对音视频：另一半还在下载时，这条流**不算完成** ──
        // 判据只能看折叠记录身上的**成员状态**（`pairMembers`，唯一的权威）：
        //   · 不能看记录自身的 status —— 合并流程一收到某条流的完成事件就会
        //     `setTaskStatus({gid: 成员, status: MERGING})`，而它是**直接写记录
        //     字段**的，第一次完成事件之后"记录 status"就恒为 merging；
        //   · 不能靠任务历史 —— 历史是完成时才写的，还在下载的另一半查不到；
        //   · 不能靠磁盘 —— 默认不配"下载中后缀"时半个文件与完整文件同形，
        //     引擎还预分配写盘（实测下到 9/10 时盘上大小已到满），大小也骗人；
        //     真正可靠的"还在下"信号是引擎控制文件（见 engineCtrlFilePath）。
        // 这条必须放在 setTaskStatus(MERGING) **之前**（否则就把成员状态改脏了）。
        const pairStillDownloading = !!isPairRecordStillDownloading(mergeGid)
        // 这一对**是否已经产出合并文件**（另一半的完成事件晚到/重放时会走到这里）：
        // 有产物就不再合第二次、也不把记录推回 MERGING —— 那是"都合并完了却冒出
        // 正在合并音视频…"的入口之一（用户报的形态）。
        const pairAlreadyMerged = !!pairInfo && isPairAlreadyMerged(pairInfo)

        // 另一半还在下 → 这条流的"完成"不是整条记录的完成：不发完成通知、不试合并。
        // （否则就是用户看到的"卡片还在下载，却已经报完成通知并合并完成"。）
        if (!isBilibiliPart && !pairStillDownloading) {
          notifyTaskCompleteOnce(task, isBT, finalPath || path, pairInfo && pairInfo.id)
        }
        setFileMtimeOnComplete(task, finalPath)

        // 只有**整条记录都下完**才把状态推成 MERGING。另一半还在下载时推成
        // merging 会让折叠记录出现"还在下载、状态却是正在合并"的自相矛盾
        // （1Hz 刷新后聚合状态会把它改回 active，那之前的 1 秒用户看到的就是
        //  "正在合并音视频…"）；聚合状态本身已经表达了一切 —— 有一条还在下
        // 就还是 active，两条都下完自然进入 merging。
        if (isBilibiliPart && mergeGid && !pairStillDownloading && !pairAlreadyMerged) {
          taskStore.addToMergingList({ gid: mergeGid, mergeKey })
          taskStore.setTaskStatus({ gid: mergeGid, status: TASK_STATUS.MERGING })
        }

        // 合并开始前，清除所有相关任务的等待配对状态
        if (isBilibiliPart && mergeKey) {
          taskStore.clearMergeProgressByMergeKey(mergeKey)
        }

        let mergeResult
        if (pairStillDownloading) {
          mergeResult = { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
        } else if (pairAlreadyMerged) {
          // 这一对已经有产物了：只做收尾（把整对的重试定时器与合并状态收干净），
          // 绝不再合一次（输入文件早被第一次合并删掉，再合只会把它永久推进 MERGING）
          finishPairMerging(task, pairInfo)
          mergeResult = { isBilibiliPart: true, mergedPath: '', alreadyMerged: true }
        } else {
          mergeResult = await runDashMergeExclusive(mergeKey, () => {
            return maybeMergeBilibiliDash(finalPath, task, pairInfo)
          })
        }

        // ── 完成闸门 ──
        // 老逻辑是"只要不是 waitingForPair 就判完成"，于是**另一半还没下完、
        // 配对文件还没出现**时会被直接判完成，合并永远不会发生（用户点名）。
        // 现在"该不该继续等"由合并函数自己判断（它们看得见配对细节），闸门只照办：
        //   · waitingForPair → 继续等 / 重试，绝不判完成；
        //   · 产出合并文件   → 判完成；
        //   · 其余（不是一对、缺媒体引擎等确定合不了的情况）→ 判完成，并如实提示。
        const mergeDone = !!(mergeResult && mergeResult.mergedPath)
        const mergeAwait = !!(mergeResult && mergeResult.waitingForPair)

        if (isBilibiliPart && mergeGid && mergeAwait && !mergeDone) {
          taskStore.setMergeProgress({
            gid: mergeGid,
            progress: { waitingForPair: true }
          })
          // 启动重试：前5次每3秒，之后每10秒，最多重试60次（约10分钟）
          // 重试耗尽后：另一半还在 → 保持 MERGING 等它的完成事件；
          // 另一半不存在 → 如实收尾，不会永久吊着
          // requireMergingList=false：此刻**故意**不把记录写进 mergingList
          //（状态要保持"下载中"），但重试照常武装 —— 否则最后一滴完成事件
          // 没送达/被去重吞掉时，这一对就再也没人试合并，记录卡在
          //"已完成 + 满格黄条"。到齐之后由重试内部把状态推成 merging。
          _scheduleMergeRetry(mergeGid, mergeKey, finalPath, task, isBT, cfg, 0, 60, false)
        }

        // 合并完成（或确定合不了）后，通过 mergeKey 清理相关任务并恢复 COMPLETE 状态
        if (isBilibiliPart && mergeGid && (mergeDone || !mergeAwait)) {
          taskStore.removeAllMergingByMergeKey(mergeKey)
          // 按**整对**收尾：另一半可能还武装着重试定时器，它醒来会把这条记录
          // 又推回"正在合并"。合成功与"确定合不了"走同一条路 —— 它按成员认出整对
          // （晚到的完成事件里配对信息可能已经从历史里查不到了），收掉定时器与
          // 合并状态，并登记"这一对到此为止"，进度条不会停在黄条上。
          finishPairMerging(task, pairInfo)
          taskStore.setTaskStatus({ gid: mergeGid, status: TASK_STATUS.COMPLETE })
          taskStore.fetchList()
        }

        if (mergeResult && mergeResult.mergedPath) {
          setFileMtimeOnComplete(task, mergeResult.mergedPath)
          autoCategorizeDownloadedFile(task, mergeResult.mergedPath)
          try {
            const gid = task && task.gid ? `${task.gid}` : ''
            if (gid) {
              const base = basename(mergeResult.mergedPath || '')
              const suffix = cfg.downloadingFileSuffix || ''
              const name = suffix && base.endsWith(suffix) ? base.slice(0, -suffix.length) : base
              if (name) {
                taskStore.setTaskDisplayName({ gid, name })
              }
            }
          } catch (_) {}
          // 通知的唯一出口（内部按 pairId/gid 去重）：合并成功的这一支与
          // "另一半重试定时器也合成了同一产物"那一支会先后走到这里，
          // 以前各弹一次 → 一个视频两条完成通知
          notifyTaskCompleteOnce(task, isBT, mergeResult.mergedPath, pairInfo && pairInfo.id)
        } else if (mergeResult && mergeResult.isBilibiliPart && mergeResult.noMediaEngine) {
          try {
            const notifyPath = mergeResult.fallbackNotifyPath || finalPath || path
            notifyTaskCompleteOnce(task, isBT, notifyPath, pairInfo && pairInfo.id)
          } catch (_) {}
        } else if (!(mergeResult && mergeResult.isBilibiliPart)) {
          autoCategorizeDownloadedFile(task, finalPath)
        }
      }
      function looksLikeBilibiliSource(referer, headers) {
        const isHostMatchDomain = (host, domain) => {
          try {
            const h = `${host || ''}`.toLowerCase().replace(/\.$/, '')
            const d = `${domain || ''}`.toLowerCase().replace(/^\.+/, '').replace(/\.$/, '')
            if (!h || !d) return false
            return h === d || h.endsWith(`.${d}`)
          } catch (_) {
            return false
          }
        }
        const urls = []
        if (referer && typeof referer === 'string') {
          urls.push(referer)
        }
        if (Array.isArray(headers)) {
          headers.forEach((h) => {
            if (typeof h !== 'string') {
              return
            }
            const idx = h.indexOf(':')
            if (idx <= 0) {
              return
            }
            const name = h.slice(0, idx).trim().toLowerCase()
            const value = h.slice(idx + 1).trim()
            if (!value) {
              return
            }
            if (name === 'referer' || name === 'origin') {
              urls.push(value)
            }
          })
        }
        for (const u of urls) {
          try {
            const url = new URL(u)
            const host = (url.hostname || '').toLowerCase()
            if (isHostMatchDomain(host, 'bilibili.com') || isHostMatchDomain(host, 'b23.tv')) {
              return true
            }
          } catch (_) {}
        }
        return false
      }
      /**
       * 「开始下载」类通知：**一次下载只弹一次**。
       *
       * 为什么按"下载身份"而不是"文件名 + 时间窗"去重（老实现就是后者，见
       * utils/completeNotify 的抬头）：一对音视频是**两个引擎任务**（两个 gid、
       * 一个 pairId），而刚下发时两边的文件都还没建、从名字上认不出是配对 ⇒
       * 各弹一次（用户看到的"媒体任务添加时弹两个通知"）；两条流先后开始、
       * 隔得久时老实现的 10 秒窗口也早过期。身份（pairId）不受这些影响，
       * 且与完成通知同口径 ⇒ 一对只弹一次，重新下载（新 pairId）照常弹。
       *
       * `fromBrowserExtension` 决定文案与是否顺带发系统通知（仅 Windows）。
       */
      function notifyDownloadStartOnce(task, taskName, fromBrowserExtension) {
        const pair = getTaskPairInfo(task)
        const source = pair ? { pairId: pair.id, gid: task && task.gid } : task
        if (!_downloadStartNotifier.shouldNotify(source, '')) {
          return
        }
        const message = fromBrowserExtension
          ? t('task.download-start-browser-message')
          : t('task.download-start-message', { taskName })
        msg.info(message)
        if (fromBrowserExtension && is.windows()) {
          showNativeNotification({
            title: message,
            body: taskName,
            onClick: () => {
              ipcRenderer.send('command', 'application:show', { page: 'index' })
            }
          })
        }
      }
      function looksLikeExtensionDashStreamPath(p, downloadingFileSuffix) {
        try {
          const raw = p ? `${p}` : ''
          if (!raw) return false
          const file0 = basename(raw)
          const suffix = downloadingFileSuffix ? `${downloadingFileSuffix}` : ''
          const file1 = suffix ? stripDownloadingSuffixFromFilename(file0, suffix) : file0
          const file = stripDuplicateNumberBeforeExtension(file1)
          return /(video\s*stream|audio\s*stream|videostream|audiostream|视频流|音频流)/i.test(file)
        } catch (_) {
          return false
        }
      }
      function stripDownloadingSuffixFromFilename(filename, downloadingFileSuffix) {
        const name = filename ? `${filename}` : ''
        const suffix = downloadingFileSuffix ? `${downloadingFileSuffix}` : ''
        if (!name || !suffix) return name
        return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
      }
      function stripDuplicateNumberBeforeExtension(filename) {
        const name = filename ? `${filename}` : ''
        if (!name) return name
        return name.replace(/\s+\(\d+\)(?=\.[^.]+$)/, '')
      }
      function normalizeDashStemFromFilename(filename) {
        const name = filename ? `${filename}` : ''
        if (!name) return ''
        const withoutDup = stripDuplicateNumberBeforeExtension(name)
        const dot = withoutDup.lastIndexOf('.')
        const stem = dot > 0 ? withoutDup.slice(0, dot) : withoutDup
        return stem
          .replace(/(?:[._-]|\s+|\()?(video\s*stream|audio\s*stream|videostream|audiostream|video|audio|视频流|音频流|视频|音频)\)?$/i, '')
          .trim()
      }
      // 去掉 stem 末尾的分P序号后缀（如 "标题_1" -> "标题"），
      // 用于合并产物的最终命名，避免重复下载时产物叫 "标题_1.mp4" 而非 "标题.mp4"。
      // 配对用的 stem 仍保留序号（在 collectExtensionDashParts 中）。
      function stripDashSequenceSuffix(stem) {
        const s = stem ? `${stem}` : ''
        if (!s) return ''
        return s.replace(/_[0-9]+$/, '').trim()
      }
      function getDashExtFromFilename(filename) {
        const name = filename ? `${filename}` : ''
        const lower = name.toLowerCase()
        if (lower.endsWith('.mp4')) return 'mp4'
        if (lower.endsWith('.m4a')) return 'm4a'
        if (lower.endsWith('.m4s')) return 'm4s'
        return ''
      }
      function collectExtensionDashParts(finalPath, cfg) {
        try {
          const p = finalPath ? `${finalPath}` : ''
          if (!p) return null
          const downloadingFileSuffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
          const dir = dirname(p)
          const file = basename(p)
          const fileNoSuffix = stripDownloadingSuffixFromFilename(file, downloadingFileSuffix)
          const stem = normalizeDashStemFromFilename(fileNoSuffix)
          if (!stem) return null

          let entries = []
          try {
            entries = readdirSync(dir) || []
          } catch (_) {
            entries = []
          }

          const aria2Set = new Set()
          entries.forEach((e) => {
            const n = e ? `${e}` : ''
            if (n.toLowerCase().endsWith('.xfer')) {
              aria2Set.add(n.slice(0, -'.xfer'.length))
            }
          })

          const parts = []
          for (const e0 of entries) {
            const e = e0 ? `${e0}` : ''
            if (!e || e.toLowerCase().endsWith('.xfer')) continue
            if (e.startsWith('.') && e.includes('.lerxu-merging-')) continue
            const pendingBySuffix = !!(downloadingFileSuffix && e.endsWith(downloadingFileSuffix))
            const eNoSuffix = stripDownloadingSuffixFromFilename(e, downloadingFileSuffix)
            const ext = getDashExtFromFilename(eNoSuffix)
            if (!ext) continue
            const s = normalizeDashStemFromFilename(eNoSuffix)
            if (!s || s !== stem) continue
            const pendingByAria2 = aria2Set.has(e) || aria2Set.has(eNoSuffix)
            const diskPath = resolve(dir, e)
            let size = 0
            try {
              size = statSync(diskPath).size || 0
            } catch (_) {
              size = 0
            }
            const nameNoExt = eNoSuffix.length > ext.length + 1 ? eNoSuffix.slice(0, eNoSuffix.length - ext.length - 1) : ''
            const isLikelyPart = !!(nameNoExt && nameNoExt !== s)
            parts.push({
              diskPath,
              ext,
              size,
              pending: pendingBySuffix || pendingByAria2,
              isLikelyPart
            })
          }

          const isPairCandidate = parts.length >= 2
          return { dir, stem, parts, isPairCandidate }
        } catch (_) {
          return null
        }
      }
      function parseBilibiliDashPart(fullPath) {
        try {
          const p = fullPath ? `${fullPath}` : ''
          if (!p) return null
          const rawFile = basename(p)
          const cfg = preferenceConfig.value || {}
          const suffix = cfg.downloadingFileSuffix || ''
          const file = stripDuplicateNumberBeforeExtension(rawFile)
          const normalized = suffix ? stripDownloadingSuffixFromFilename(file, suffix) : file
          const m1 = normalized.match(/^(.*)_(video\.mp4|audio\.m4a)$/i)
          if (m1) {
            const base = m1[1] ? `${m1[1]}` : ''
            if (!base) return null
            return { dir: dirname(p), base, type: 'named' }
          }
          const m1b = normalized.match(/^(.*)(?:[._-]|\s*\()(video|audio)\)?\.(mp4|m4a|m4s)$/i)
          if (m1b) {
            const base = (m1b[1] ? `${m1b[1]}` : '').trim()
            if (!base) return null
            return { dir: dirname(p), base, type: 'named' }
          }
          const m2 = normalized.match(/^(.+)-\d+(?:\s+\(\d+\))?\.m4s$/i)
          if (m2) {
            const prefix = m2[1] ? `${m2[1]}` : ''
            if (!prefix) return null
            return { dir: dirname(p), base: prefix, type: 'm4s' }
          }
          return null
        } catch (_) {
          return null
        }
      }
      /**
       * 从文件名解析"分片身份"：`{ stem, seq, codecid, ext }`；不是分片就返回 null。
       *
       * 两类命名都要认（用户明确要求兼容）：
       *   · `标题-1-30080.m4s`（序号在中间、尾段是 codecid）
       *   · `标题_1.m4s` / `标题-1.mp4`（序号在结尾）
       *
       * 解析不出序号（如 `标题_video.mp4`）返回 null —— 那本来就不是分片，
       * 调用方走"一对音视频"的老路径即可。
       */
      function parseDashFragmentName (name, cfg) {
        try {
          const raw = name ? `${name}` : ''
          if (!raw) return null
          const noDup = stripDuplicateNumberBeforeExtension(raw)
          const suffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
          const normalized = suffix ? stripDownloadingSuffixFromFilename(noDup, suffix) : noDup
          const m1 = normalized.match(/^(.*?)[-_](\d+)-(\d{3,6})\.(m4s|mp4|m4a|ts)$/i)
          if (m1 && m1[1] && m1[1].trim()) {
            return {
              stem: m1[1].trim(),
              seq: Number(m1[2]),
              codecid: Number(m1[3]),
              ext: m1[4].toLowerCase()
            }
          }
          const m2 = normalized.match(/^(.*?)[-_](\d+)\.(m4s|mp4|m4a|ts)$/i)
          if (m2 && m2[1] && m2[1].trim()) {
            return { stem: m2[1].trim(), seq: Number(m2[2]), codecid: 0, ext: m2[3].toLowerCase() }
          }
          return null
        } catch (_) {
          return null
        }
      }
      /**
       * 收集**同一个视频的全部已就绪分片**（跨分片序号）。
       *
       * 为什么必须收全部：一个视频被切成 `标题-1-30080.m4s`、`标题-2-30080.m4s`… 时，
       * 只把两个文件交给引擎会让第二段之后的内容整段丢失 —— 用户看到的就是
       * "合并完了但视频不完整"。谁是画面、谁是声音**不在这里判**（引擎读容器就知道），
       * 这里只做三件事：找齐、剔除还在下载的、把顺序排确定。
       */
      function collectDashFragmentInputs (anyPath, cfg) {
        try {
          const p = anyPath ? `${anyPath}` : ''
          if (!p) return null
          const me = parseDashFragmentName(basename(p), cfg)
          if (!me || !me.stem) return null
          const dir = dirname(p)
          let entries = []
          try {
            entries = readdirSync(dir) || []
          } catch (_) {
            return null
          }
          const found = []
          for (const e0 of entries) {
            const e = e0 ? `${e0}` : ''
            if (!e || e.toLowerCase().endsWith('.xfer')) continue
            if (e.startsWith('.') && e.includes('.lerxu-merging-')) continue
            const info = parseDashFragmentName(e, cfg)
            if (!info || info.stem !== me.stem) continue
            const full = resolve(dir, e)
            // 文件在 ≠ 可以合并：还在下载的半个文件绝不能当输入
            if (!isMergeInputReady(full, cfg, p)) continue
            found.push({ path: full, seq: info.seq, codecid: info.codecid, name: e })
          }
          if (found.length < 2) return null
          // 排序必须确定：先分片序号、再 codecid、最后文件名。
          // 引擎按**传入顺序**串接同角色的输入，这里的顺序直接决定成片时间轴。
          found.sort((a, b) => (a.seq - b.seq) || (a.codecid - b.codecid) || a.name.localeCompare(b.name))
          return { dir, stem: me.stem, inputs: found.map(f => f.path) }
        } catch (_) {
          return null
        }
      }
      /**
       * 组装一次合并的输入清单：优先"同一 stem 的全部分片"，凑不齐才回退到
       * 调用方送来的那一对（老的音视频配对路径）。
       */
      function buildMergeInputs (primaryPath, cfg, fallbackPair) {
        const frag = collectDashFragmentInputs(primaryPath, cfg)
        if (frag && frag.inputs.length >= 2) {
          return frag.inputs
        }
        return (Array.isArray(fallbackPair) ? fallbackPair : []).filter(Boolean)
      }
      function deriveBilibiliDashRootDir(partDir, cfg) {
        try {
          const d = partDir ? `${partDir}` : ''
          if (!d) return ''
          const auto = !!(cfg && cfg.autoCategorizeFiles)
          const categories = cfg && cfg.fileCategories
          if (!auto || !categories || Object.keys(categories).length === 0) {
            return d
          }
          const folderNames = Object.keys(categories).map(key => {
            const c = categories[key] || {}
            return c.name || key
          }).filter(Boolean)
          const leaf = basename(d)
          if (folderNames.includes(leaf)) {
            return dirname(d)
          }
          return d
        } catch (_) {
          return partDir ? `${partDir}` : ''
        }
      }
      function buildBilibiliDashCandidates(rootDir, base, kind, cfg) {
        const candidates = new Set()
        try {
          const rd = rootDir ? `${rootDir}` : ''
          const b = base ? `${base}` : ''
          if (!rd || !b) return []
          const add = (filename) => {
            if (!filename) return
            candidates.add(resolve(rd, filename))
            const categories = cfg && cfg.fileCategories
            const auto = !!(cfg && cfg.autoCategorizeFiles)
            if (auto && categories && Object.keys(categories).length > 0) {
              const categorized = buildCategorizedPath(resolve(rd, filename), filename, categories, rd)
              if (categorized && categorized.categorizedPath) {
                candidates.add(resolve(`${categorized.categorizedPath}`))
              }
            }
          }

          const exts = kind === 'video'
            ? ['mp4', 'm4s']
            : ['m4a', 'm4s', 'mp4']

          exts.forEach((ext) => {
            add(`${b}_${kind}.${ext}`)
            add(`${b}.${kind}.${ext}`)
            add(`${b}-${kind}.${ext}`)
            add(`${b} (${kind}).${ext}`)
          })

          if (kind === 'video') {
            add(`${b}_video.mp4`)
          } else {
            add(`${b}_audio.m4a`)
          }
        } catch (_) {}
        return Array.from(candidates)
      }
      /**
       * 盘上这个文件是不是"某个还在下载的任务"正在写的。
       *
       * `.xfer` 控制文件是最直接的信号，但它可能还没被引擎建出来（刚起任务的那一瞬）。
       * 再对一遍任务列表：**某个进行中任务的落盘文件就是它** → 视为没下完。
       * 这个判断只会让合并**更保守**（宁可多等一轮重试，也不拿半个文件去合）。
       *
       * ⚠️ **判据只能是「这条任务的落盘文件 == 目标文件」**（判定逻辑在
       * `utils/mergeInput.js` 的 `isTargetWrittenByEntries`，有单测钉着）。
       * 这里曾经写成"entry 自己的文件带引擎控制文件就算命中"——那个条件与目标
       * 文件**无关**，于是只要还有**任意**一个任务在下载，本函数就对**任何**目标
       * 返回 true：多个媒体任务同时下时，先下完的那一对永远被判成"输入还在下"，
       * 合并被无限推迟，直到所有下载都结束才一起合并（用户报的形态）。
       */
      function isPathBeingDownloadedByOther(p, cfg) {
        try {
          const target = p ? resolve(`${p}`) : ''
          if (!target) return false
          const pendingStatuses = new Set([TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED])
          const downloadingFileSuffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
          const lists = [
            taskStore.taskList || [],
            taskStore.allTaskList || [],
            taskHistory.getAllHistory() || []
          ]
          return lists.some(list => isTargetWrittenByEntries({
            target,
            entries: list,
            pendingStatuses,
            downloadingFileSuffix,
            resolvePath: (x) => resolve(`${x}`)
          }))
        } catch (_) {
          return false
        }
      }

      /**
       * 引擎"正在写这个文件"的**权威信号**：控制文件在不在。
       *
       * XferRust 把控制文件放在**引擎数据目录**里，键是目标文件的绝对路径字符串
       * 的 SHA-256 前 24 位 hex（见 `XferRust/crates/xfer-storage/src/lib.rs` 的
       * `ctrl_path`：`<ctrl_dir>/<sha256(path)[:24]>.xfer`，
       * `ctrl_dir` = `$XFER_CTRL_DIR` 或 `~/.xfer/ctrl`）。
       *
       * 以前这里只看 `<文件>.xfer`（老 aria2 约定，与下载文件同目录）——
       * 对现在的引擎**恒为 false**，等于没判。而默认不配"下载中后缀"时，
       * 一个下到一半的文件与完整文件在盘上长得一模一样，**盘上大小也不能当判据**
       * （引擎预分配写盘，实测下载到 9/10 时盘上大小已经到满）。
       * 所以这里必须按引擎真正的键去查。（实测：下载中该文件存在，完成后消失。）
       */
      function engineCtrlFilePath(p) {
        try {
          const abs = p ? resolve(`${p}`) : ''
          if (!abs) return ''
          const dir = process.env.XFER_CTRL_DIR
            ? `${process.env.XFER_CTRL_DIR}`
            : join(homedir(), '.xfer', 'ctrl')
          const hash = createHash('sha256').update(abs).digest('hex').slice(0, 24)
          return resolve(dir, `${hash}.xfer`)
        } catch (_) {
          return ''
        }
      }
      function hasEngineControlFile(p) {
        const ctrl = engineCtrlFilePath(p)
        return !!ctrl && existsSync(ctrl)
      }

      /**
       * 这个文件能不能当作合并的**输入**。
       *
       * 光"文件存在"是不够的：默认不配下载中后缀时，引擎是**直接写在最终路径上**的，
       * 一个下到一半的 `xxx_audio.m4a` 也 existsSync 为真。拿它去合并，
       * 产物必然缺尾（`-shortest` 还会按短的那条截断），却会被判成"完成"
       * —— 用户点名的"视频不完整"。
       *
       * 所以判据是"文件在 **且** 没在下"：引擎控制文件 `.xfer` 已消失、不带下载中
       * 后缀、也没有别的进行中任务正在写它。合并路径必须统一走这里，不能各写各的。
       *
       * [ownPath] 是本次完成的任务自己的文件：它此刻可能还被任务列表当成"进行中"，
       * 但我们是收到它的完成事件才走到这里的，所以对它跳过任务列表那一道。
       */
      function isMergeInputReady(p, cfg, ownPath = '') {
        try {
          if (!p || !existsSync(p)) return false
          if (p.toLowerCase().endsWith('.xfer')) return false
          const suffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
          if (suffix && p.endsWith(suffix)) return false
          const own = ownPath ? resolve(`${ownPath}`) : ''
          if (own && resolve(`${p}`) === own) return true
          // 引擎的控制文件还在 → 这个文件还没下完（引擎自己记的键，见 engineCtrlFilePath）
          if (hasEngineControlFile(p)) return false
          // 老 aria2 约定：控制文件与下载文件同目录（保留兜底）
          if (existsSync(`${p}.xfer`)) return false
          if (isPathBeingDownloadedByOther(p, cfg)) return false
          return true
        } catch (_) {
          return false
        }
      }

      /**
       * 在候选路径里找第一个**已下完**的文件。
       * `pending: true` 表示"文件在、但还在下载" —— 调用方应当继续等而不是合并。
       */
      function findFirstReadyPath(paths, cfg, ownPath = '') {
        try {
          const arr = Array.isArray(paths) ? paths : []
          let sawPending = false
          for (const p of arr) {
            if (!p || !existsSync(p)) continue
            if (isMergeInputReady(p, cfg, ownPath)) return { path: p, pending: false }
            sawPending = true
          }
          return { path: '', pending: sawPending }
        } catch (_) {
          return { path: '', pending: false }
        }
      }
      /**
       * 定位媒体引擎 `zuvrust`。
       *
       * 合并音视频**不再用 ffmpeg**：容器细节（TS 里 AAC 要补 ADTS、fMP4 里是裸帧、
       * `extradata` 在两种容器里形态不同……）是引擎的职责，宿主不该重复实现一遍；
       * 更不该把"能不能合并"绑在用户机器上装没装 FFmpeg 上。
       *
       * 候选顺序与"二进制放哪"的约定都收在 `@shared/zuvrust` 里（纯函数，可单测），
       * 这里只负责把本进程的环境信息喂进去、再挑出第一个真实存在的。
       */
      function resolveMediaEnginePath() {
        const candidates = []
        const binName = mediaEngineBinName(process.platform)
        try {
          const userDataPath = app.getPath('userData')
          const exePath = app.getPath('exe')
          const appDir = dirname(exePath)
          // 开发期的工作区根目录：渲染进程里拿不到 __dirname，用主进程的
          // app.getAppPath()（开发期就是仓库根，打包后是 app.asar 路径）
          let repoRoot = ''
          try {
            repoRoot = app.getAppPath()
          } catch (_) {}
          candidates.push(...mediaEngineCandidates({
            platform: process.platform,
            arch: process.arch,
            userDataPath,
            appDir,
            resourcesPath: (process && process.resourcesPath) || '',
            devRoot: repoRoot
          }))
        } catch (_) {
          candidates.push(binName)
        }
        return candidates.find(p => (p === binName ? checkSystemMediaEngine() : existsSync(p))) || ''
      }
      function checkSystemMediaEngine() {
        try {
          const result = spawnSync('zuvrust', ['version', '--json'], { windowsHide: true, timeout: 5000 })
          return result.status === 0
        } catch (_) {
          return false
        }
      }
      async function ensureMediaEngine() {
        const existingPath = resolveMediaEnginePath()
        if (existingPath) {
          return existingPath
        }

        // 提示只弹一次（与以前 ffmpeg 的处理一致：合并会反复触发，不能每次都弹）
        let skipFlagPath = ''
        try {
          const userDataPath = app.getPath('userData')
          skipFlagPath = resolve(userDataPath, '.zuvrust-skip')
          if (existsSync(skipFlagPath)) {
            return ''
          }
        } catch (_) {}

        msg.warning(t('task.engine-missing-manual'))

        try {
          if (skipFlagPath) writeFileSync(skipFlagPath, '1')
        } catch (_) {}

        return ''
      }
      /**
       * 读任务身上的配对信息（扩展发来时带的 pairId / pairRole）。
       *
       * 存在**任务历史**里：下载完成事件触发时，任务可能已经被引擎清理，
       * 只剩历史可查，所以不能只依赖引擎的 getOption。
       * 返回 null 表示这不是"一对音视频里的一半"（普通任务）。
       */
      function getTaskPairInfo(task) {
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!gid) return null
          const t = (taskHistory.getAllHistory() || []).find(x => x && `${x.gid}` === gid)
          const pairId = t && t.pairId ? `${t.pairId}` : ''
          if (!pairId) return null
          return { id: pairId, role: t.pairRole ? `${t.pairRole}` : '' }
        } catch (_) {
          return null
        }
      }

      /**
       * 「一对音视频」这条记录现在还有成员没下完吗。
       *
       * ⚠️ **必须看成员状态，不能看记录自身的 status**：合并流程一收到某一条流的
       * 完成事件就会 `setTaskStatus({gid: 成员, status: MERGING})`，而
       * `SET_TASK_STATUS` 是**直接写折叠记录的 status 字段**的（不走聚合）——
       * 于是"只看记录 status"会在第一次完成事件之后立刻变成 merging，
       * 把这个闸门彻底架空（另一半还在下载也照样去合并）。
       * 折叠记录身上的 `pairMembers` 是**原始成员任务**，各带自己的引擎状态，
       * 且被标记合并的那一条只会改到自己（另一个仍是 active）——所以按成员判断才准。
       */
      function isPairRecordStillDownloading(gidKey) {
        try {
          const g = gidKey ? `${gidKey}` : ''
          if (!g) return false
          const pending = new Set([TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED])
          const lists = [taskStore.allTaskList || [], taskStore.taskList || []]
          for (const list of lists) {
            for (const row of list) {
              if (!row) continue
              const isMine = `${row.gid || ''}` === g ||
                (Array.isArray(row.pairGids) && row.pairGids.some(x => `${x}` === g))
              if (!isMine) continue
              const members = Array.isArray(row.pairMembers) && row.pairMembers.length > 0
                ? row.pairMembers
                : [row]
              // ⚠️ 必须**排除刚完成的那条流自己**：列表是 1Hz 刷新的，
              // 完成事件到达时它往往还显示 active/paused（自己判自己"还在下"）
              // → 最后一条流完成时闸门永远为真，合并一次都没跑过，
              // 记录就卡在"已完成 + 满格黄条"（用户报的形态）。
              return members.some(m => `${(m && m.gid) || ''}` !== g && pending.has(`${(m && m.status) || ''}`))
            }
          }
          return false
        } catch (_) {
          return false
        }
      }

      /**
       * 找同一对里的另一半（同 pairId、不同角色）。
       * 找不到说明这一对凑不齐了 —— 调用方据此决定"继续等"还是"如实收尾"，
       * 不会把任务永久吊在"等待配对"上。
       */
      function findPairPartnerTask(pair, task) {
        try {
          if (!pair || !pair.id) return null
          const gid = task && task.gid ? `${task.gid}` : ''
          const history = taskHistory.getAllHistory() || []
          for (const e of history) {
            if (!e) continue
            const eGid = e.gid ? `${e.gid}` : ''
            if (eGid && eGid === gid) continue
            if (`${e.pairId || ''}` !== pair.id) continue
            const role = `${e.pairRole || ''}`
            if (role && role === pair.role) continue
            return e
          }
        } catch (_) {}
        return null
      }

      /**
       * 磁盘上是否还有"同一对里另一半正在下载"的痕迹。
       *
       * 用于**没有** pairId 的老任务（旧版扩展发的、或站点自身的 DASH 分片）：
       * 同目录下同 stem 的文件若带 `.xfer` 或下载中后缀，说明另一半还在路上，
       * 应当继续等；否则这一对凑不齐，如实收尾。
       */
      function hasPendingPartnerOnDisk(finalPath, cfg) {
        try {
          const p = finalPath ? `${finalPath}` : ''
          if (!p) return false
          const downloadingFileSuffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
          const dir = dirname(p)
          const stem = normalizeDashStemFromFilename(stripDownloadingSuffixFromFilename(basename(p), downloadingFileSuffix))
          if (!stem) return false
          const entries = readdirSync(dir) || []
          for (const e0 of entries) {
            const e = e0 ? `${e0}` : ''
            if (!e) continue
            const pending = e.toLowerCase().endsWith('.xfer') ||
              !!(downloadingFileSuffix && e.endsWith(downloadingFileSuffix))
            if (!pending) continue
            const base = e.toLowerCase().endsWith('.xfer')
              ? e.slice(0, -'.xfer'.length)
              : stripDownloadingSuffixFromFilename(e, downloadingFileSuffix)
            if (!getDashExtFromFilename(base)) continue
            if (normalizeDashStemFromFilename(base) === stem) return true
          }
        } catch (_) {}
        return false
      }

      // 已经被仲裁判死（重试耗尽且确认凑不齐）的配对：补扫不再重新武装它们，
      // 否则每一轮轮询都会重复尝试一次注定失败的合并。
      const _mergeGivenUp = new Set()

      /**
       * 这一对**是否已经产出合并文件**。
       *
       * 判据必须扫**整对**的历史（同 pairId 的任一成员带 `dashMerged`），不能只看
       * 当前这条任务：产物由"后下完、触发合并"的那条流落库（`afterBilibiliMerge`
       * → `consolidateTasks`），它未必是列表里的主记录，而另一半的任务/历史清理
       * 是尽力而为的（失败只记日志）。
       */
      function isPairAlreadyMerged(pair) {
        const pid = pair && pair.id ? `${pair.id}` : ''
        if (!pid) return false
        try {
          return (taskHistory.getAllHistory() || []).some(t =>
            t && `${t.pairId || ''}` === pid && t.dashMerged === true)
        } catch (_) {
          return false
        }
      }

      /**
       * 一对音视频**合并收尾**：把这一对（含另一半）的合并重试定时器与"正在合并"
       * 状态全部收掉，并记入 `_mergeGivenUp` 防止补扫重新武装。
       *
       * 为什么必须按**整对**收：合并由"后下完的那条流"触发，而另一半在它自己完成时
       * 也武装了一份重试（`requireMergingList=false`）。只按 mergeKey 清理清不掉那一份
       * —— 它醒来后看到"这一对还没合并"就又把记录推成 MERGING、再合一次（输入文件
       * 已被第一次合并删掉），于是**合并完成之后卡片又冒出"正在合并音视频…"且长时间
       * 不结束**（用户报的形态）。
       */
      function finishPairMerging(task, pair) {
        const ids = new Set()
        const own = task && task.gid ? `${task.gid}` : ''
        if (own) ids.add(own)
        const pid = pair && pair.id ? `${pair.id}` : ''
        if (pid) {
          try {
            (taskHistory.getAllHistory() || []).forEach(t => {
              if (t && `${t.pairId || ''}` === pid && t.gid) ids.add(`${t.gid}`)
            })
          } catch (_) {}
        }
        // **列表里这一对当前的全部成员**也要登记：合并收尾时历史可能已经把
        // 某条源（或产物那条）清掉了，只查历史会漏掉仍在列表里的 gid ——
        // 漏掉的后果就是合并完那几拍仍显示"下载完成，等待合并…"（用户报的形态）。
        // ⚠️ 匹配**不能只看主 gid**：折叠记录的主 gid 是画面流那条，而触发合并
        // 的常常是**声音流**（后下完那条）；历史被收编后 `pairInfo` 还为 null，
        // 那时"按 gid 相等"一个成员都匹配不上 —— 必须按成员身份认（pairGids /
        // pairMembers 里任意一个是自己，就说明这条记录就是这一对）。
        try {
          const rows = [...(taskStore.taskList || []), ...(taskStore.allTaskList || [])]
          rows.forEach((row) => {
            if (!row || row.isPair !== true) return
            const memberGids = [
              ...(Array.isArray(row.pairGids) ? row.pairGids : []),
              ...(Array.isArray(row.pairMembers) ? row.pairMembers.map(m => m && m.gid) : [])
            ].map(g => `${g || ''}`).filter(Boolean)
            const samePair = (pid && `${row.pairId || ''}` === pid) ||
              `${row.gid || ''}` === own ||
              (own && memberGids.includes(own))
            if (!samePair) return
            memberGids.forEach((g) => { ids.add(g) })
          })
        } catch (_) {}
        ids.forEach((gid) => {
          try { clearMergeRetryTimer(gid) } catch (_) {}
          try { _mergeGivenUp.add(gid) } catch (_) {}
          try { taskStore.removeFromMergingList(gid) } catch (_) {}
          try { taskStore.clearMergeProgress(gid) } catch (_) {}
        })
        // 这一对到此为止：进度条不能再停在"待合并/合并中"。
        // 合并成功的记录靠 `dashMerged` 回普通档，但产物落库与列表刷新有先后，
        // 中间那几拍就会显示"已完成 + 满格黄条/等待合并"（用户报的形态）。
        // 重试耗尽收尾、确定合不了的那几条路径同样走这里 —— 一起登记掉。
        try { taskStore.addMergeSkippedGids([...ids]) } catch (_) {}
      }

      /**
       * 把**已中断的合并簿记**清掉（自愈）。
       *
       * `mergingList` 是进程内簿记，只在"合并真的跑过一遍"时才会被收掉。合并被
       * 中途打断（下载中途暂停/退出应用/合并进程崩了/页面重载）时，它就永远留着，
       * 于是记录**永久停在「正在合并音视频…」**：进度条不再动、卡片上没有暂停按钮
       * （`taskActionsMap` 里没有 merging 这一档）、独立进度窗的暂停按钮也是灰的 ——
       * 用户看到的就是"（视频+音频）任务无法暂停"，而且怎么点都没反应。
       *
       * 判据是"**没有任何合并真的在跑**"：既没有重试定时器，也没有 `_dashMergeJobs`
       * 里的合并任务（合并任务从开始到进程退出一直挂在里面，所以它是最可靠的
       * "正在合并"信号），引擎也没在报合并进度。连续几秒都如此 → 认定是残迹，
       * 从簿记里摘掉；记录下一拍聚合状态就回到"已完成"，补扫会重新武装合并。
       */
      function reconcileStaleMergingEntries() {
        try {
          const list = taskStore.mergingList || []
          const now = Date.now()
          const candidates = []
          list.forEach((gid) => {
            const g = `${gid || ''}`.trim()
            if (!g) return
            if (hasMergeRetryTimer(g)) { _staleMergingSince.delete(g); return }
            const key = (taskStore.mergeKeys || {})[g]
            if (key && _dashMergeJobs && _dashMergeJobs.has(key)) { _staleMergingSince.delete(g); return }
            const prog = (taskStore.mergeProgresses || {})[g]
            if (prog && Number.isFinite(Number(prog.percent))) { _staleMergingSince.delete(g); return }
            candidates.push(g)
          })
          // 清掉已离开簿记的时间戳（避免 Map 无限增长）
          Array.from(_staleMergingSince.keys()).forEach((g) => {
            if (!list.some(x => `${x}` === g)) {
              _staleMergingSince.delete(g)
            }
          })
          candidates.forEach((g) => {
            const since = _staleMergingSince.get(g)
            if (!since) {
              _staleMergingSince.set(g, now)
              return
            }
            if (now - since < STALE_MERGING_MS) {
              return
            }
            console.warn(`[Lerxu] Clearing stale merging entry for ${g} (no merge running)`)
            _staleMergingSince.delete(g)
            try { taskStore.removeFromMergingList(g) } catch (_) {}
            try { taskStore.clearMergeProgress(g) } catch (_) {}
          })
        } catch (_) {}
      }
      /**
       * 补扫「两个文件都下完了、但还没合并」的配对记录，把合并重试重新武装起来。
       *
       * 为什么需要：合并是在"某条流完成事件"里触发的。只要那次事件因为任何原因
       * 没走到（列表 1Hz 刷新还没把这条流标成完成、去重把它吞掉、引擎重启、
       * 闸门把最后一条流也误判成"还在下"……），这一对就再没有任何人试合并，
       * 记录停在"已完成 + 满格黄条"—— 用户那条 368MB 的记录就是这个样子，
       * 两个输入文件都好好躺在下载目录里，产物却没有。
       *
       * 这里每轮轮询扫一次：满足条件的补一次武装，之后成功/如实收尾完全交给
       * 既有的 `_scheduleMergeRetry` 仲裁，不在这里另写一套合并逻辑。
       */
      function rearmStuckPairMerges() {
        try {
          const rows = taskStore.allTaskList || taskStore.taskList || []
          const cfg = preferenceConfig.value || {}
          for (const row of rows) {
            if (!row || row.isPair !== true) continue
            // 已经有产物（记录自身或任一成员带 dashMerged）→ 这一对没什么可补的了。
            // 只看 `row.dashMerged` 不够：产物可能落在**不是主记录**的那条成员上，
            // 那时补扫会重新武装重试，把已经合并完的记录又推回"正在合并"（用户报的形态）。
            if (row.dashMerged === true || row.pairMerged === true) continue
            const members = Array.isArray(row.pairMembers) ? row.pairMembers : []
            if (members.length < 2) continue
            if (members.some(m => m && m.dashMerged === true)) continue
            const allDone = members.every(m => {
              const s = `${(m && m.status) || ''}`
              if (s === TASK_STATUS.COMPLETE || s === TASK_STATUS.SEEDING) return true
              // 成员状态可能被"正在合并"写脏过（`SET_TASK_STATUS` 会把 merging
              // 直接写到成员对象上），而 store 的合并簿记里已经没有它 → 那只是残迹。
              // 不这样兜一下，补扫会永远跳过这条记录，它就卡在"正在合并…"。
              return s === TASK_STATUS.MERGING &&
                !(taskStore.mergingList || []).some(g => `${g}` === `${m && m.gid}`)
            })
            if (!allDone) continue
            const gid = `${row.gid || ''}`
            if (!gid) continue
            if (_mergeGivenUp.has(gid)) continue
            if (hasMergeRetryTimer(gid)) continue
            const pair = getTaskPairInfo(row)
            if (!pair || !pair.id) continue
            const path = getTaskFullPath(row) || (row.files && row.files[0] && row.files[0].path) || ''
            if (!path) continue
            console.warn(`[Lerxu] Stuck pair detected (${gid}), re-arming merge retry`)
            _scheduleMergeRetry(gid, getDashMergeKey(path, cfg, pair), path, row, false, cfg, 0, 60, false)
          }
        } catch (_) {}
      }

      function getDashMergeKey(filePath, cfg, pair) {        try {
          // 有显式配对 ID 时，配对键就是这一对本身 ——
          // 不再靠"目录 + 文件名长得像"去猜，也就不会把两个不相干的
          // 同名视频误配成一对（用户点名）
          if (pair && pair.id) return `pair:${pair.id}`
          const path = filePath ? resolve(`${filePath}`) : ''
          if (!path) return ''
          const suffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
          const raw = basename(path)
          const normalized = suffix ? stripDownloadingSuffixFromFilename(raw, suffix) : raw
          const stem = normalizeDashStemFromFilename(normalized)
          return stem ? `${dirname(path)}|${stem}` : path
        } catch (_) {
          return ''
        }
      }
      function _scheduleMergeRetry(mergeGid, mergeKey, finalPath, task, isBT, cfg, attempt, maxAttempts, requireMergingList = true) {
        // 清除已有的重试定时器
        clearMergeRetryTimer(mergeGid)
        // 检查任务是否还在合并列表中（可能已被用户删除或已合并完成）
        // 「整条记录还没下完」的等待阶段用 requireMergingList=false 进来：
        // 那时故意不把记录写进 mergingList（否则状态会提前显示"正在合并"），
        // 但重试必须照常武装起来 —— 否则"最后一条流的完成事件没送达/被去重吞掉"
        // 这一对就永远没人再试合并（用户那条 368MB 的记录就是这样卡住的）。
        const { mergingList } = taskStore
        if (requireMergingList && !mergingList.includes(mergeGid)) {
          return
        }
        if (attempt >= maxAttempts) {
          // 重试耗尽：判断这一对还有没有可能凑齐。
          //   · 还有可能（**另一半的任务还在跑**）→ 保持 MERGING，等它的完成事件
          //     触发合并；
          //   · 没有可能（自己那份输入已经不在 / 另一半也不在跑）→ 如实收尾，
          //     不把任务永久吊在"等待配对"上（用户点名：不能一直不合并也不结束）
          //
          // ⚠️ 不能用"另一半的文件在盘上"当"还有希望"的判据：合并过一次之后，
          // 另一半任务历史里记的路径就是**产物本身**，那个文件当然一直在，
          // 于是这里恒为真 → 任务永远保持 MERGING，卡片永远显示
          // "等待配对文件下载完成..."（用户报的形态）。
          // 同理：自己那份输入都不在了就不可能再合并，也必须收尾。
          const pair = getTaskPairInfo(task)
          const ownUsable = !!finalPath && existsSync(`${finalPath}`)
          // 自己那份还在被引擎写 → 现在做不了任何判断，等它的完成事件再来一次
          if (finalPath && hasEngineControlFile(finalPath)) {
            console.warn(`[Lerxu] Merge retry exhausted for ${mergeGid}, own input still downloading, wait for its completion event`)
            return
          }
          let partnerComing = false
          try {
            if (pair) {
              const p = findPairPartnerTask(pair, task)
              const st = p && p.status ? `${p.status}` : ''
              // 另一半仍在进行中（下载 / 等待 / 暂停 / 做种 / 正在合并）→ 还有希望
              const pendingStatuses = new Set([
                TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED,
                TASK_STATUS.SEEDING, TASK_STATUS.MERGING
              ])
              partnerComing = ownUsable && pendingStatuses.has(st)
            } else {
              partnerComing = ownUsable && hasPendingPartnerOnDisk(finalPath, cfg)
            }
          } catch (_) {
            partnerComing = false
          }
          if (partnerComing) {
            console.warn(`[Lerxu] Merge retry exhausted for ${mergeGid}, partner still pending, keep MERGING`)
            return
          }
          console.warn(`[Lerxu] Merge retry exhausted for ${mergeGid}, no partner available, finalize as complete`)
          _mergeGivenUp.add(`${mergeGid}`)
          finishPairMerging(task, pair)
          taskStore.removeAllMergingByMergeKey(mergeKey)
          taskStore.setTaskStatus({ gid: mergeGid, status: TASK_STATUS.COMPLETE })
          taskStore.fetchList()
          // 等不到另一半了：如实按"下载完成"收尾并通知，不让任务无声无息地结束
          try {
            notifyTaskCompleteOnce(task, isBT, finalPath || '', pair && pair.id)
          } catch (_) {}
          return
        }
        // 指数退避：前5次每3秒，之后每10秒，确保长时间下载也能等到配对
        const delay = attempt < 5 ? 3000 : 10000
        const timer = setTimeout(async () => {
          clearMergeRetryTimer(mergeGid)
          // 再次检查任务是否还在合并列表中
          if (requireMergingList && !taskStore.mergingList.includes(mergeGid)) {
            return
          }
          // 一对音视频：整条记录还没下完就继续等，**别拿半个文件去合**
          // （判据同 handleDownloadComplete，见 isPairRecordStillDownloading）
          const retryPair = getTaskPairInfo(task)
          // 这一对**已经合完了**（产物落库、可能只是另一半还没被清掉）：
          // 别再合第二次，更别把记录推回 MERGING —— 直接收尾并停掉这一对的重试。
          if (retryPair && isPairAlreadyMerged(retryPair)) {
            finishPairMerging(task, retryPair)
            taskStore.setTaskStatus({ gid: mergeGid, status: TASK_STATUS.COMPLETE })
            taskStore.fetchList()
            return
          }
          if (retryPair && isPairRecordStillDownloading(mergeGid)) {
            _scheduleMergeRetry(mergeGid, mergeKey, finalPath, task, isBT, cfg, attempt + 1, maxAttempts, requireMergingList)
            return
          }
          // 到这一步整条记录都下完了：把状态正式推成"正在合并"，
          // 让卡片从"下载中"切到"合并中"（黄条 + 绿色合并进度）
          if (retryPair && !taskStore.mergingList.includes(mergeGid)) {
            try {
              taskStore.addToMergingList({ gid: mergeGid, mergeKey })
              taskStore.setTaskStatus({ gid: mergeGid, status: TASK_STATUS.MERGING })
            } catch (_) {}
          }
          // 重新扫描配对文件
          try {
            // retryPair 必须一起传下去：不传就退回"靠文件名猜"的老路径，
            // 与首次尝试的口径不一致（谁画面谁声音、伙伴是谁都得按 pairId 定）
            const retryResult = await runDashMergeExclusive(mergeKey, () => {
              return maybeMergeBilibiliDash(finalPath, task, retryPair)
            })
            if (retryResult && retryResult.mergedPath) {
              // 合并成功
              finishPairMerging(task, retryPair)
              taskStore.removeAllMergingByMergeKey(mergeKey)
              taskStore.setTaskStatus({ gid: mergeGid, status: TASK_STATUS.COMPLETE })
              taskStore.fetchList()
              setFileMtimeOnComplete(task, retryResult.mergedPath)
              autoCategorizeDownloadedFile(task, retryResult.mergedPath)
              try {
                const base = basename(retryResult.mergedPath || '')
                const suffix = cfg.downloadingFileSuffix || ''
                const name = suffix && base.endsWith(suffix) ? base.slice(0, -suffix.length) : base
                if (name) {
                  taskStore.setTaskDisplayName({ gid: mergeGid, name })
                }
              } catch (_) {}
              // 通知的唯一出口（按 pairId 去重）：这条重试与"最后一条流的完成事件"
              // 那一支可能合出同一个产物、双双走到这里，以前各弹一次
              notifyTaskCompleteOnce(task, isBT, retryResult.mergedPath, retryPair && retryPair.id)
            } else if (retryResult && retryResult.waitingForPair) {
              // 仍然等待配对，继续重试
              _scheduleMergeRetry(mergeGid, mergeKey, finalPath, task, isBT, cfg, attempt + 1, maxAttempts, requireMergingList)
            } else {
              // 合并失败（非等待配对），清理并标记完成
              finishPairMerging(task, retryPair)
              taskStore.removeAllMergingByMergeKey(mergeKey)
              taskStore.setTaskStatus({ gid: mergeGid, status: TASK_STATUS.COMPLETE })
              taskStore.fetchList()
            }
          } catch (e) {
            console.warn(`[Lerxu] Merge retry ${attempt + 1} failed:`, e)
            _scheduleMergeRetry(mergeGid, mergeKey, finalPath, task, isBT, cfg, attempt + 1, maxAttempts, requireMergingList)
          }
        }, delay)
        setMergeRetryTimer(mergeGid, timer)
      }
      function runDashMergeExclusive(key, merge) {
        if (!key) {
          return Promise.resolve().then(merge)
        }
        if (!_dashMergeJobs) {
          _dashMergeJobs = new Map()
        }
        const running = _dashMergeJobs.get(key)
        if (running) {
          return running
        }
        const job = Promise.resolve()
          .then(merge)
          .finally(() => {
            if (_dashMergeJobs.get(key) === job) {
              _dashMergeJobs.delete(key)
            }
          })
        _dashMergeJobs.set(key, job)
        return job
      }
      /**
       * 调媒体引擎合并音视频：`zuvrust mux <输出> <输入>...`。
       *
       * 谁是画面、谁是声音由**引擎自己探测**（它读容器就知道），同角色的多个输入
       * 由引擎按传入顺序接起来。所以这里既不需要像以前调 ffmpeg 那样先猜
       * `-map 0:v:0 -map 1:a:0`、失败再交换参数重试，也不需要判断哪个文件是画面 ——
       * 输入就是"一串待合并的文件"。
       *
       * 输出是 NDJSON：进度行按 `type` 分发，错误行带 `kind`/`retryable`
       * —— 宿主不用去正则匹配引擎的文案（文案一改就失灵）。
       *
       * `--progress` **总是带上**：合并是长任务，进度必须实时往上走；没有宿主
       * 承载进度（progressGid 为空）时那几行只是被读掉，代价可以忽略。
       */
      function runEngineMux(enginePath, inputPaths, outputPath, progressGid = '') {
        return new Promise((resolve, reject) => {
          const inputs = (Array.isArray(inputPaths) ? inputPaths : [inputPaths]).filter(Boolean)
          if (!inputs.length) {
            reject(new Error('mux 没有任何输入文件'))
            return
          }
          // 「视频」设置项 → 引擎参数（分片时长）与环境变量（线程数 / 强制软解）。
          // 容器由输出扩展名决定，见 `getDashMergeOutputPath`。
          const muxCfg = preferenceConfig.value || {}
          const args = [
            'mux',
            outputPath,
            ...inputs,
            ...buildMuxArgs({
              fragmentMs: Number(muxCfg.mergeFragmentMs || 0),
              format: muxCfg.mergeFormat
            })
          ]
          const child = spawn(enginePath, args, {
            windowsHide: true,
            env: { ...process.env, ...engineEnvFromConfig(muxCfg) }
          })
          _activeMuxChildren.add(child)
          let stderr = ''
          let stdoutBuf = ''
          let lastBytes = 0
          let lastAt = Date.now()
          let settled = false
          let idleTimer = null
          // `mux` 是**同步的一次性命令**：正常结束引擎自己就退出（宿主没有把它
          // 做成常驻服务），所以正常路径不会在后台留下进程。下面两个定时器只为
          // "引擎卡死"兜底 —— 少了它们，一个卡住的合并进程会永久留在后台吃
          // CPU / 磁盘，而宿主早已不再看它（用户点名的"别一直占着资源"）。
          const finish = (fn) => {
            if (settled) return
            settled = true
            clearTimeout(idleTimer)
            clearTimeout(hardTimer)
            _activeMuxChildren.delete(child)
            fn()
          }
          const armIdle = () => {
            clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              try { child.kill('SIGKILL') } catch (_) {}
              finish(() => reject(new Error(
                `mux 超过 ${Math.round(MUX_IDLE_TIMEOUT_MS / 1000)} 秒没有任何进度输出，已终止`
              )))
            }, MUX_IDLE_TIMEOUT_MS)
          }
          const hardTimer = setTimeout(() => {
            try { child.kill('SIGKILL') } catch (_) {}
            finish(() => reject(new Error(
              `mux 超过 ${Math.round(MUX_HARD_TIMEOUT_MS / 60000)} 分钟仍未结束，已终止`
            )))
          }, MUX_HARD_TIMEOUT_MS)
          armIdle()
          child.stdout.on('data', (d) => {
            armIdle()
            stdoutBuf += d.toString('utf8')
            const lines = stdoutBuf.split('\n')
            stdoutBuf = lines.pop() || ''
            for (const line of lines) {
              const parsed = progressFromEngineLine(line)
              if (!parsed || !progressGid) continue
              const now = Date.now()
              const elapsed = Math.max(1, now - lastAt)
              // 引擎的进度按"已写字节 / 输入总字节"算，所以这里的差值就是**写入速率**
              const speed = Math.max(0, (parsed.totalSize - lastBytes) * 1000 / elapsed)
              lastBytes = parsed.totalSize
              lastAt = now
              taskStore.setMergeProgress({
                gid: progressGid,
                progress: { percent: parsed.percent, totalSize: parsed.totalSize, speed }
              })
            }
          })
          child.stderr.on('data', (d) => {
            armIdle()
            stderr += d.toString('utf8')
          })
          child.on('error', (err) => finish(() => reject(err)))
          child.on('close', (code) => {
            finish(() => {
              if (code === 0) {
                resolve(true)
                return
              }
              reject(new Error(engineErrorText(stderr, code)))
            })
          })
        })
      }

      /**
       * 校验合并产物**确实同时含视频与音频**。
       *
       * 为什么要校验：合并最坏的形态不是报错，而是"产出了一个只有画面的文件"却被
       * 判成完成 —— 用户点名的"视频不完整"。以前靠 `ffmpeg -f null` 探一遍，
       * 现在用引擎自己的 `probe`：少一个外部依赖，判据也与引擎完全一致
       * （`kind` 0=视频 / 1=音频 是引擎的对外契约）。
       */
      async function validateMergeOutput(enginePath, outputPath) {
        if (!outputPath || !existsSync(outputPath)) {
          return false
        }
        return new Promise((resolve) => {
          let settled = false
          const child = spawn(enginePath, ['probe', outputPath, '--json'], { windowsHide: true })
          let out = ''
          const done = (result) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve(result)
          }
          const timer = setTimeout(() => {
            try { child.kill('SIGKILL') } catch (_) {}
            done(false)
          }, 30000)
          child.stdout.on('data', (d) => { out += d.toString('utf8') })
          child.on('error', () => done(false))
          child.on('close', (code) => {
            if (code !== 0) {
              done(false)
              return
            }
            const first = `${out}`.split('\n').map(s => s.trim()).find(Boolean) || ''
            done(probeHasVideoAndAudio(parseEngineLine(first)))
          })
        })
      }

      async function mergeDashToOutput(enginePath, inputPaths, outputPath, progressGid = '') {
        const tempPath = resolve(dirname(outputPath), `.${basename(outputPath)}.lerxu-merging-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`)
        try {
          await runEngineMux(enginePath, inputPaths, tempPath, progressGid)
          if (!await validateMergeOutput(enginePath, tempPath)) {
            throw new Error('Merged output does not contain both video and audio streams')
          }
          if (existsSync(outputPath)) {
            throw new Error(`merge output already exists: ${outputPath}`)
          }
          renameSync(tempPath, outputPath)
          return true
        } finally {
          try {
            if (existsSync(tempPath)) unlinkSync(tempPath)
          } catch (_) {}
        }
      }
      function getDashMergeOutputPath(dir, stem, inputPaths = []) {
        const inputs = new Set((inputPaths || []).filter(Boolean).map(path => resolve(path)))
        // ⚠️ 这个临时文件的**扩展名就是引擎的容器选择**（引擎按扩展名选封装器），
        // 所以它必须与「视频 → 合并格式」一致；末了改名成正式名时用的是同一个扩展名。
        const cfg = preferenceConfig.value || {}
        const ext = mergeOutputExtension(cfg.mergeFormat)
        for (let i = 0; i < 1000; i++) {
          const rand = Math.random().toString(36).slice(2, 10)
          const candidate = resolve(dir, `.lerxu-merging-${rand}.${ext}`)
          if (!inputs.has(candidate) && !existsSync(candidate)) {
            return candidate
          }
        }
        const fallback = resolve(dir, `.lerxu-merging-${Date.now()}.${ext}`)
        return fallback
      }
      function generateUniqueFilePath(dir, stem, ext, pathsToIgnore = []) {
        const pathExists = (candidate) => {
          try {
            return existsSync(resolve(candidate))
          } catch (_) {
            return true
          }
        }
        const basePath = resolve(dir, `${stem}${ext}`)
        if (!pathExists(basePath)) {
          return basePath
        }
        for (let index = 1; index < 10000; index++) {
          const candidate = resolve(dir, `${stem} (${index})${ext}`)
          if (!pathExists(candidate)) {
            return candidate
          }
        }
        return ''
      }
      async function maybeMergeBilibiliDash(finalPath, task = null, pair = null) {
        // 有显式配对 ID 时**优先**走角色配对：谁是画面、谁是声音由扩展说了算，
        // 伙伴按 pairId 找，不依赖"文件名长得像"——命名规则将来怎么变都配得上
        if (pair && pair.id) {
          return await mergeExplicitPair(finalPath, task, pair, preferenceConfig.value || {})
        }
        const info = parseBilibiliDashPart(finalPath)
        if (!info) {
          return await maybeMergeExtensionDash(finalPath, task, pair)
        }
        const cfg = preferenceConfig.value || {}
        const { dir, base, type } = info

        if (type === 'm4s') {
          // 同一 stem 的**全部分片**一起交给引擎：它判画面/声音、并按顺序把
          // 同角色的分片接起来。老实现只取两个文件，多出来的分片整段丢失
          // —— 用户点名的"合并完了视频却不完整"。
          const frag = collectDashFragmentInputs(finalPath, cfg)
          if (!frag || frag.inputs.length < 2) {
            const enginePath = resolveMediaEnginePath()
            if (!enginePath) {
              const notifyKey = `${dir || ''}|${base || ''}`
              const fallbackNotifyPath = finalPath || ''
              return { isBilibiliPart: true, mergedPath: '', noMediaEngine: true, notifyKey, fallbackNotifyPath }
            }
            // 配对文件尚未出现 / 还在下载：返回 waitingForPair 让重试机制继续等
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }
          const enginePath = await ensureMediaEngine()
          if (!enginePath) {
            const notifyKey = `${dir || ''}|${base || ''}`
            const fallbackNotifyPath = finalPath || ''
            return { isBilibiliPart: true, mergedPath: '', noMediaEngine: true, notifyKey, fallbackNotifyPath }
          }
          const outputBase = stripDashSequenceSuffix(base)
          const outputPath = getDashMergeOutputPath(frag.dir || dir, outputBase, frag.inputs)
          if (!outputPath) {
            return { isBilibiliPart: true, mergedPath: '' }
          }
          try {
            await mergeDashToOutput(enginePath, frag.inputs, outputPath, task && task.gid ? `${task.gid}` : '')
            const finalOutputPath = await afterBilibiliMerge(task, info, frag.inputs[0], frag.inputs[1], outputPath, frag.inputs)
            return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
          } catch (e) {
            console.warn(`[Lerxu] zuvrust merge failed: ${e && e.message ? e.message : e}`)
            // 合并出错不能当作"完成"：交给重试再试几次（用户点名）
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }
        }

        const rootDir = deriveBilibiliDashRootDir(dir, cfg)
        const videoCand = [
          ...buildBilibiliDashCandidates(rootDir, base, 'video', cfg),
          ...buildBilibiliDashCandidates(dir, base, 'video', cfg)
        ]
        const audioCand = [
          ...buildBilibiliDashCandidates(rootDir, base, 'audio', cfg),
          ...buildBilibiliDashCandidates(dir, base, 'audio', cfg)
        ]

        const videoPath = findFirstReadyPath(videoCand, cfg, finalPath).path
        const audioPath = findFirstReadyPath(audioCand, cfg, finalPath).path

        if (!videoPath || !audioPath) {
          const enginePath = resolveMediaEnginePath()
          if (!enginePath) {
            const notifyKey = `${dir || ''}|${base || ''}`
            const fallbackNotifyPath = finalPath || ''
            return { isBilibiliPart: true, mergedPath: '', noMediaEngine: true, notifyKey, fallbackNotifyPath }
          }
          // 文件在但还没下完也走这里：**绝不能**拿半个文件去合并
          // （产物会缺尾，却会被判成完成 —— 用户点名的"视频不完整"）
          return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
        }

        const mergeInputs = buildMergeInputs(videoPath || finalPath, cfg, [videoPath, audioPath])
        const outputDir = dirname(videoPath || finalPath || rootDir || dir)
        const outputBase = stripDashSequenceSuffix(base)
        const outputPath = getDashMergeOutputPath(outputDir, outputBase, mergeInputs)
        if (!outputPath) {
          return { isBilibiliPart: true, mergedPath: '' }
        }

        const enginePath = await ensureMediaEngine()
        if (!enginePath) {
          const notifyKey = `${outputDir || ''}|${base || ''}`
          const fallbackNotifyPath = finalPath || ''
          return { isBilibiliPart: true, mergedPath: '', noMediaEngine: true, notifyKey, fallbackNotifyPath }
        }

        try {
          await mergeDashToOutput(enginePath, mergeInputs, outputPath, task && task.gid ? `${task.gid}` : '')
          const finalOutputPath = await afterBilibiliMerge(task, info, videoPath, audioPath, outputPath, mergeInputs)
          return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
        } catch (e) {
          console.warn(`[Lerxu] zuvrust merge failed: ${e && e.message ? e.message : e}`)
          // 合并出错不能当作"完成"：交给重试再试几次（用户点名）
          return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
        }
      }
      /**
       * 合并"显式配对"：扩展带同一个 pairId 发来的一对音视频。
       *
       * 与靠文件名猜的老路径的区别：
       *   · 谁是画面、谁是声音由**角色**决定，不看扩展名；
       *   · 伙伴必须是**同一个 pairId**，不会把别的视频的文件拉进来；
       *   · 另一半还没就绪 → waitingForPair（继续等，等它的完成事件触发合并）。
       */
      async function mergeExplicitPair(finalPath, task, pair, cfg) {
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          const myRole = pair.role || ''
          const myPath = finalPath ? resolve(`${finalPath}`) : ''

          // 输入文件必须**已下完**才允许合并（判据见 isMergeInputReady）。
          // 提前"尝试合并"是可以的（第一次完成就试、之后重试），但 mux 本身
          // 必须等两个文件都下完 —— 拿半个文件去合，产物一定缺尾（用户点名）
          const isReady = (p) => isMergeInputReady(p, cfg, finalPath)

          // 另一半的文件：先用伙伴任务历史里记的落盘路径，再退回同目录扫描
          let partnerPath = ''
          const partnerTask = findPairPartnerTask(pair, task)
          // 伙伴任务还查得到状态时，以**任务状态**为准（比磁盘信号更权威）：
          // 它还在下载/等待/暂停 → 盘上那份是半个文件，绝不能拿去合并
          if (partnerTask) {
            const st = partnerTask.status ? `${partnerTask.status}` : ''
            const stillDownloading = st === TASK_STATUS.ACTIVE || st === TASK_STATUS.WAITING || st === TASK_STATUS.PAUSED
            if (stillDownloading) {
              return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
            }
          }
          try {
            const files = partnerTask && Array.isArray(partnerTask.files) ? partnerTask.files : []
            for (const f of files) {
              const p = f && f.path ? resolve(`${f.path}`) : ''
              if (p && isReady(p)) {
                partnerPath = p
                break
              }
            }
          } catch (_) {}
          if (!partnerPath) {
            const partsInfo = collectExtensionDashParts(finalPath, cfg)
            const others = partsInfo && Array.isArray(partsInfo.parts)
              ? partsInfo.parts.filter(p => p && p.diskPath && resolve(p.diskPath) !== myPath)
              : []
            const readyOther = others.find(p => !p.pending && isReady(p.diskPath))
            if (readyOther) partnerPath = resolve(readyOther.diskPath)
          }

          // 另一半还没就绪就继续等 —— 此刻不下"凑不齐"的结论：
          // 刚完成的这一瞬间历史可能还没写全，误判会直接跳过合并（用户点名）
          if (!partnerPath || !isReady(myPath)) {
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }

          // 按角色定画面与声音
          let videoPath = ''
          let audioPath = ''
          if (myRole === 'audio') {
            videoPath = partnerPath
            audioPath = myPath
          } else if (myRole === 'video') {
            videoPath = myPath
            audioPath = partnerPath
          } else {
            // 没有角色信息时按扩展名兜底：m4a 当声音，其余当画面
            const myExt = getDashExtFromFilename(basename(myPath))
            const partnerExt = getDashExtFromFilename(basename(partnerPath))
            if (myExt === 'm4a' && partnerExt !== 'm4a') {
              videoPath = partnerPath
              audioPath = myPath
            } else {
              videoPath = myPath
              audioPath = partnerPath
            }
          }

          if (!videoPath || !audioPath || resolve(videoPath) === resolve(audioPath)) {
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }

          // 显式配对只认这一对（pairId 比"同目录扫出来的文件"权威得多），
          // 所以不在这里补分片
          const pairInputs = [videoPath, audioPath]
          const outputDir = dirname(videoPath)
          const outputBase = stripDashSequenceSuffix(normalizeDashStemFromFilename(basename(videoPath)))
          const outputPath = getDashMergeOutputPath(outputDir, outputBase, pairInputs)
          if (!outputPath) {
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }

          const enginePath = await ensureMediaEngine()
          if (!enginePath) {
            return {
              isBilibiliPart: true,
              mergedPath: '',
              noMediaEngine: true,
              notifyKey: `${outputDir || ''}|${outputBase || ''}`,
              fallbackNotifyPath: finalPath || ''
            }
          }

          try {
            await mergeDashToOutput(enginePath, pairInputs, outputPath, gid)
            const info = { dir: outputDir, base: outputBase, type: 'named' }
            const finalOutputPath = await afterBilibiliMerge(task, info, videoPath, audioPath, outputPath)
            return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
          } catch (e) {
            console.warn(`[Lerxu] zuvrust merge failed: ${e && e.message ? e.message : e}`)
            // 合并出错**不能**当作"完成"：交给重试，避免静默跳过合并
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }
        } catch (_) {
          return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
        }
      }

      async function maybeMergeExtensionDash(finalPath, task = null, pair = null) {
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!gid) return { isBilibiliPart: false, mergedPath: '' }

          let fromSupportedSource = false
          try {
            const t = (taskHistory.getAllHistory() || []).find(x => x && `${x.gid}` === gid)
            fromSupportedSource = !!(t && t.fromBrowserExtension)
          } catch (_) {
            fromSupportedSource = false
          }
          if (!fromSupportedSource) {
            try {
              const opt = await api.getOption({ gid })
              const hs = opt && opt.header ? opt.header : []
              const headers = Array.isArray(hs) ? hs : (typeof hs === 'string' ? [hs] : [])
              const referer = opt && opt.referer ? `${opt.referer}` : ''
              fromSupportedSource = headers.some(h => /X-Lerxu-Source\s*:\s*BrowserExtension/i.test(`${h}`)) ||
                looksLikeBilibiliSource(referer, headers)
            } catch (_) {
              fromSupportedSource = false
            }
          }
          const cfg = preferenceConfig.value || {}

          // 有显式配对 ID：这一条**确定**是一对里的一半，走角色配对（不看文件名）
          if (pair && pair.id) {
            return await mergeExplicitPair(finalPath, task, pair, cfg)
          }

          const partsInfo = collectExtensionDashParts(finalPath, cfg)
          if (!partsInfo) {
            // 连 stem 都算不出来：不是一对里的任何一半，交给调用方按普通任务收尾
            return { isBilibiliPart: false, mergedPath: '' }
          }
          if (!partsInfo.isPairCandidate) {
            // 只找到一份。若名字看得出是某一半（video/audio/视频流/音频流），
            // 另一半多半还在下载 —— 必须继续等。老代码在这里返回
            // isBilibiliPart:false，调用方随即判"完成"，合并永远不会发生（用户点名）
            if (looksLikeExtensionDashStreamPath(finalPath, cfg.downloadingFileSuffix || '')) {
              return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
            }
            return { isBilibiliPart: false, mergedPath: '' }
          }

          if (!fromSupportedSource) {
            const taskUri = getTaskUri(task)
            const uriLooksBilibili = /^https?:\/\/(?:[^/]+\.)?(?:bilivideo\.com|bilibili\.com)(?=[:/]|$)/i.test(`${taskUri || ''}`)
            if (!uriLooksBilibili) {
              return { isBilibiliPart: false, mergedPath: '' }
            }
          }

          const pairParts = partsInfo
          try {
            const downloadingFileSuffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
            if (downloadingFileSuffix && Array.isArray(pairParts.parts)) {
              for (const part of pairParts.parts) {
                const diskPath = part && part.diskPath ? `${part.diskPath}` : ''
                if (!diskPath || !diskPath.endsWith(downloadingFileSuffix)) {
                  continue
                }

                const withoutSuffix = diskPath.slice(0, -downloadingFileSuffix.length)
                const xferA = `${diskPath}.xfer`
                const xferB = `${withoutSuffix}.xfer`
                if (existsSync(xferA) || existsSync(xferB)) {
                  continue
                }

                let pathToProcess = diskPath
                try {
                  const fixed = fixFileNameWithSuffix(pathToProcess, downloadingFileSuffix)
                  if (fixed && fixed !== pathToProcess && existsSync(pathToProcess)) {
                    const okFix = renamePreserveTimes(pathToProcess, fixed)
                    if (okFix) {
                      pathToProcess = fixed
                    }
                  }
                } catch (_) {}

                const targetPath = pathToProcess.endsWith(downloadingFileSuffix)
                  ? pathToProcess.slice(0, -downloadingFileSuffix.length)
                  : pathToProcess

                if (targetPath && targetPath !== pathToProcess) {
                  if (existsSync(targetPath)) {
                    part.diskPath = targetPath
                    part.pending = false
                    continue
                  }
                  if (existsSync(pathToProcess)) {
                    const ok = renamePreserveTimes(pathToProcess, targetPath)
                    if (ok) {
                      part.diskPath = targetPath
                      part.pending = false
                    }
                  }
                }
              }
            }
          } catch (_) {}

          const ready = (pairParts.parts || []).filter(p => p && !p.pending && p.diskPath && existsSync(p.diskPath))
          if (ready.length < 2) {
            const enginePath = resolveMediaEnginePath()
            if (!enginePath) {
              const notifyKey = `${pairParts.dir || ''}|${pairParts.stem || ''}`
              const fallbackNotifyPath = finalPath || ''
              return { isBilibiliPart: true, mergedPath: '', noMediaEngine: true, notifyKey, fallbackNotifyPath }
            }
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }

          const sortParts = (arr) => {
            return [...arr].sort((a, b) => {
              if (a.isLikelyPart !== b.isLikelyPart) {
                return a.isLikelyPart ? -1 : 1
              }
              return (b.size || 0) - (a.size || 0)
            })
          }
          const mp4 = sortParts(ready.filter(p => p.ext === 'mp4'))
          const m4a = sortParts(ready.filter(p => p.ext === 'm4a'))
          const m4s = sortParts(ready.filter(p => p.ext === 'm4s'))

          let videoPath = ''
          let audioPath = ''
          if (mp4.length && m4a.length) {
            videoPath = mp4[0].diskPath
            audioPath = m4a[0].diskPath
          } else if (mp4.length && m4s.length) {
            videoPath = mp4[0].diskPath
            audioPath = m4s[0].diskPath
          } else if (m4a.length && m4s.length) {
            videoPath = m4s[0].diskPath
            audioPath = m4a[0].diskPath
          } else if (m4s.length >= 2) {
            videoPath = m4s[0].diskPath
            audioPath = m4s[m4s.length - 1].diskPath
          } else {
            return { isBilibiliPart: true, mergedPath: '' }
          }

          if (!videoPath || !audioPath || resolve(videoPath) === resolve(audioPath)) {
            return { isBilibiliPart: true, mergedPath: '' }
          }

          // 同一个 stem 下的分片一并交给引擎（它判角色并按顺序串接）；
          // 凑不齐就只用这一对
          const mergeInputs = buildMergeInputs(videoPath, cfg, [videoPath, audioPath])
          const outputBase = stripDashSequenceSuffix(pairParts.stem)
          const outputPath = getDashMergeOutputPath(pairParts.dir, outputBase, mergeInputs)
          if (!outputPath) {
            return { isBilibiliPart: true, mergedPath: '' }
          }

          const enginePath = await ensureMediaEngine()
          if (!enginePath) {
            const notifyKey = `${pairParts.dir || ''}|${pairParts.stem || ''}`
            const fallbackNotifyPath = finalPath || ''
            return { isBilibiliPart: true, mergedPath: '', noMediaEngine: true, notifyKey, fallbackNotifyPath }
          }

          try {
            await mergeDashToOutput(enginePath, mergeInputs, outputPath, task && task.gid ? `${task.gid}` : '')
            const info = { dir: pairParts.dir, base: pairParts.stem, type: 'named' }
            const finalOutputPath = await afterBilibiliMerge(task, info, videoPath, audioPath, outputPath, mergeInputs)
            return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
          } catch (e) {
            console.warn(`[Lerxu] zuvrust merge failed: ${e && e.message ? e.message : e}`)
            // 合并出错不能当作"完成"：交给重试再试几次（用户点名）
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }
        } catch (_) {
          return { isBilibiliPart: false, mergedPath: '' }
        }
      }
      async function afterBilibiliMerge(task, info, videoPath, audioPath, outputPath, extraInputs = []) {
        let finalOutputPath = outputPath
        const deletedFiles = new Set()
        const deletedCandidates = new Set()
        const deletedSuffix = (() => {
          try {
            const cfg = preferenceConfig.value || {}
            return cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
          } catch (_) {
            return ''
          }
        })()
        const addDeletedPath = (p) => {
          if (!p) return
          let full = ''
          try {
            full = resolve(`${p}`)
          } catch (_) {
            full = `${p}`
          }
          if (!full) return
          deletedFiles.add(full)
          deletedCandidates.add(full)
          if (deletedSuffix) {
            try {
              if (full.endsWith(deletedSuffix)) {
                const without = full.slice(0, -deletedSuffix.length)
                if (without) {
                  deletedCandidates.add(without)
                }
              } else {
                deletedCandidates.add(`${full}${deletedSuffix}`)
              }
            } catch (_) {}
          }
        }
        try {
          const toDelete = new Set()
          const outAbs = outputPath ? resolve(outputPath) : ''
          const vAbs = videoPath ? resolve(videoPath) : ''
          const aAbs = audioPath ? resolve(audioPath) : ''
          const forceUnlink = async (p) => {
            if (!p) return false
            let full = ''
            try { full = resolve(p) } catch (_) { full = `${p}` }
            if (!full) return false
            if (outAbs && full === outAbs) return false
            // **还在被引擎写**的文件绝不删：删掉之后引擎会继续往已 unlink 的 inode
            // 写，那条任务最终"完成"了、盘上却没有文件 —— 它自己的那次合并就永远
            // 等不到自己的输入，任务会一直挂在"等待配对文件下载完成"（用户报的形态）。
            if (hasEngineControlFile(full) || isPathBeingDownloadedByOther(full, { downloadingFileSuffix: deletedSuffix })) return false
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                unlinkSync(full)
              } catch (_) {
                try {
                  execSync(`rm -f "${full.replace(/"/g, '\\"')}" "${full.replace(/"/g, '\\"')}.xfer"`, { stdio: 'ignore' })
                } catch (_) {}
              }
              if (!existsSync(full)) {
                toDelete.delete(full)
                toDelete.delete(`${full}.aria2`)
                try { addDeletedPath(full) } catch (_) {}
                return true
              }
              if (attempt < 4) {
                await new Promise(resolve => setTimeout(resolve, 50))
              }
            }
            if (!existsSync(full)) {
              try { addDeletedPath(full) } catch (_) {}
            }
            return !existsSync(full)
          }
          const addCandidate = (p) => {
            if (!p) return
            let full = ''
            try { full = resolve(p) } catch (_) { full = `${p}` }
            if (!full) return
            if (outAbs && full === outAbs) return
            toDelete.add(full)
            toDelete.add(`${full}.aria2`)
          }

          addCandidate(videoPath)
          if (audioPath && audioPath !== videoPath) {
            addCandidate(audioPath)
          }
          // 多分片场景：本次合并用到的**每一个**分片都是"已被产物取代的零件"，
          // 一起进清理名单，否则合并完还会在目录里剩一堆分片文件
          if (Array.isArray(extraInputs)) {
            for (const p of extraInputs) {
              addCandidate(p)
            }
          }

          try {
            const dir = info && info.dir ? `${info.dir}` : ''
            const base = info && info.base ? `${info.base}` : ''
            const type = info && info.type ? `${info.type}` : ''
            if (dir && base) {
              let entries = []
              try {
                entries = readdirSync(dir) || []
              } catch (_) {
                entries = []
              }
              entries.forEach(name => {
                const s = `${name || ''}`
                const full = resolve(dir, s)
                if (outAbs && resolve(full) === outAbs) {
                  return
                }
                const lower = s.toLowerCase()
                if (type === 'm4s') {
                  if (lower.endsWith('.m4s') && s.startsWith(`${base}-`)) {
                    toDelete.add(full)
                    toDelete.add(`${full}.aria2`)
                  }
                } else if (type === 'named') {
                  const cfg = preferenceConfig.value || {}
                  const suffix = cfg.downloadingFileSuffix || ''
                  const raw = suffix ? stripDownloadingSuffixFromFilename(s, suffix) : s
                  const ext = getDashExtFromFilename(raw)
                  if (ext) {
                    const stem = normalizeDashStemFromFilename(raw)
                    if (stem && stem === base) {
                      const nameNoExt = raw.length > ext.length + 1 ? raw.slice(0, raw.length - ext.length - 1) : ''
                      const isMarkedPart = (nameNoExt && nameNoExt !== stem)
                      const isKnownInput = (vAbs && full === vAbs) || (aAbs && full === aAbs)
                      if (isMarkedPart || isKnownInput) {
                        toDelete.add(full)
                        toDelete.add(`${full}.aria2`)
                      }
                    }
                  }
                }
              })
            }
          } catch (_) {}

          for (const p of toDelete) {
            try {
              const s = `${p}`
              if (!s) continue
              if (s.toLowerCase().endsWith('.xfer')) {
                try { unlinkSync(s) } catch (_) {
                  try { execSync(`rm -f "${s.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }) } catch (_) {}
                }
                continue
              }
              const ok = await forceUnlink(s)
              if (ok) {
                try { addDeletedPath(s) } catch (_) {}
              }
            } catch (_) {}
          }
        } catch (_) {}

        try {
          const outAbs2 = finalOutputPath ? resolve(finalOutputPath) : ''
          const dirFromTask = task && task.dir ? `${task.dir}` : ''
          const baseDir = dirFromTask || (finalOutputPath ? dirname(finalOutputPath) : '')
          const strongUnlink = async (p) => {
            if (!p) return
            let full = ''
            try { full = resolve(p) } catch (_) { full = `${p}` }
            if (!full) return
            if (outAbs2 && full === outAbs2) return
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                unlinkSync(full)
              } catch (_) {
                try { execSync(`rm -f "${full.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }) } catch (_) {}
              }
              if (!existsSync(full)) {
                try { addDeletedPath(full) } catch (_) {}
                return
              }
              if (attempt < 4) {
                await new Promise(resolve => setTimeout(resolve, 50))
              }
            }
          }
          if (task && Array.isArray(task.files)) {
            for (const file of task.files) {
              try {
                const raw = file && file.path ? `${file.path}` : ''
                if (!raw) {
                  continue
                }
                const full = isAbsolute(raw) ? resolve(raw) : resolve(baseDir, raw)
                if (outAbs2 && full === outAbs2) {
                  continue
                }
                await strongUnlink(full)
                const xferPath = `${full}.xfer`
                await strongUnlink(xferPath)
              } catch (_) {}
            }
          }
        } catch (_) {}

        try {
          const dirOut = outputPath ? dirname(outputPath) : ''
          let titleBase = ''
          // 产物扩展名必须与**实际容器**一致（引擎按临时文件的扩展名封装），
          // 所以这里以设置项为准；站点元数据（bilibiliFormat）只在设置项保持默认
          // （mp4）时兜底 —— 反过来会让 .mkv 的内容被改名成 .mp4。
          const mergeCfg = preferenceConfig.value || {}
          const settingExt = mergeOutputExtension(mergeCfg.mergeFormat)
          let targetExt = `.${settingExt}`
          try {
            const gid = task && task.gid ? `${task.gid}` : ''
            if (gid) {
              const history = taskHistory.getHistory() || []
              const matched = history.find(t => t && t.gid === gid)
              const title = matched && matched.bilibiliTitle ? `${matched.bilibiliTitle}`.trim() : ''
              if (title) {
                titleBase = title
              }
              const fmt = matched && matched.bilibiliFormat ? `${matched.bilibiliFormat}`.trim().toLowerCase() : ''
              const allowed = ['mp4', 'mkv', 'mov', 'm4v', 'flv', 'ts']
              if (settingExt === 'mp4' && fmt && allowed.includes(fmt)) {
                targetExt = `.${fmt}`
              }
            }
          } catch (_) {}
          if (!titleBase && task && task.name) {
            let n = basename(`${task.name}`)
            n = n.replace(/\.[^.]+$/i, '')
            n = n.replace(/(?:[._-]|\s+|\()?(?:video\s*stream|audio\s*stream|videostream|audiostream|video|audio|视频流|音频流|视频|音频)\)?$/i, '')
            n = n.replace(/\s+\(\d+\)$/, '')
            n = n.replace(/-\d+$/, '')
            n = n.replace(/_[0-9]+$/i, '')
            n = n.trim()
            if (n) {
              titleBase = n
            }
          }
          if (!titleBase && info && info.base) {
            titleBase = `${info.base}`.replace(/(?:[._-]|\s+|\()?(?:video\s*stream|audio\s*stream|videostream|audiostream|video|audio|视频流|音频流|视频|音频)\)?$/i, '').replace(/_[0-9]+$/i, '').trim()
          }
          if (dirOut && titleBase) {
            const vAbs = videoPath ? resolve(videoPath) : ''
            const aAbs = audioPath ? resolve(audioPath) : ''
            const outAbs3 = outputPath ? resolve(outputPath) : ''

            const isKnownSourcePath = (p) => {
              if (!p) return false
              let tp = ''
              try { tp = resolve(p) } catch (_) { tp = `${p}` }
              if (vAbs && tp === vAbs) return true
              if (aAbs && tp === aAbs) return true
              if (deletedCandidates.has(tp)) return true
              if (deletedFiles.has(tp)) return true
              return false
            }

            const waitMs = (ms) => new Promise(resolve => setTimeout(resolve, ms))

            const aggressiveDelete = async (p) => {
              if (!p) return true
              let full = ''
              try { full = resolve(p) } catch (_) { full = `${p}` }
              if (!full) return true
              if (!existsSync(full)) return true
              if (outAbs3 && full === outAbs3) return true
              let deleted = false
              for (let attempt = 0; attempt < 15; attempt++) {
                try {
                  try { unlinkSync(full) } catch (_) {
                    try { execSync(`rm -f "${full.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }) } catch (_) {}
                  }
                  if (!existsSync(full)) {
                    deleted = true
                    break
                  }
                } catch (_) {}
                await waitMs(100)
              }
              if (deleted) {
                try { addDeletedPath(full) } catch (_) {}
              }
              return !existsSync(full)
            }

            await aggressiveDelete(vAbs)
            await aggressiveDelete(aAbs)
            await waitMs(300)

            try {
              const scanDir = info && info.dir ? `${info.dir}` : dirOut
              if (scanDir) {
                let scanEntries = []
                try { scanEntries = readdirSync(scanDir) || [] } catch (_) { scanEntries = [] }
                const scanBase = titleBase
                const scanSuffix = deletedSuffix
                const m4sBase = info && info.type === 'm4s' && info.base ? `${info.base}` : ''
                for (const se of scanEntries) {
                  const sen = se ? `${se}` : ''
                  if (!sen || (sen.startsWith('.') && sen.includes('.lerxu-merging-'))) continue
                  const raw = scanSuffix ? stripDownloadingSuffixFromFilename(sen, scanSuffix) : sen
                  const ext = getDashExtFromFilename(raw)
                  if (!ext) continue
                  const stem = normalizeDashStemFromFilename(raw)
                  if (!stem) continue
                  let shouldDelete = false
                  if (stem === scanBase) {
                    shouldDelete = true
                  } else if (m4sBase && /\.m4s$/i.test(raw)) {
                    const plainRaw = stripDuplicateNumberBeforeExtension(raw)
                    if (plainRaw.startsWith(`${m4sBase}-`) || plainRaw === `${m4sBase}.m4s`) {
                      shouldDelete = true
                    }
                  }
                  if (shouldDelete) {
                    const fullS = resolve(scanDir, sen)
                    if (outAbs3 && fullS === outAbs3) continue
                    const nameNoExtS = raw.length > ext.length + 1 ? raw.slice(0, raw.length - ext.length - 1) : ''
                    const isMarked = !!(nameNoExtS && nameNoExtS !== stem)
                    if (isMarked || isKnownSourcePath(fullS) || (m4sBase && /\.m4s$/i.test(raw))) {
                      await aggressiveDelete(fullS)
                      await aggressiveDelete(`${fullS}.xfer`)
                    }
                  }
                }
              }
            } catch (_) {}

            await waitMs(200)

            const candidate = resolve(dirOut, `${titleBase}${targetExt}`)
            if (existsSync(candidate) && isKnownSourcePath(candidate)) {
              await aggressiveDelete(candidate)
            }

            await waitMs(100)

            const finalTarget = generateUniqueFilePath(dirOut, titleBase, targetExt)
            if (finalTarget && resolve(finalTarget) !== resolve(outputPath)) {
              if (targetExt === '.mp4') {
                if (existsSync(finalTarget) && isKnownSourcePath(finalTarget)) {
                  await aggressiveDelete(finalTarget)
                  await waitMs(100)
                }
                const ok = renamePreserveTimes(outputPath, finalTarget)
                if (ok) {
                  finalOutputPath = finalTarget
                } else {
                  await aggressiveDelete(finalTarget)
                  await waitMs(100)
                  const ok2 = renamePreserveTimes(outputPath, finalTarget)
                  if (ok2) {
                    finalOutputPath = finalTarget
                  }
                }
              } else {
                if (existsSync(finalTarget)) {
                  finalOutputPath = finalTarget
                } else {
                  try {
                    // 换容器重新封装也交给引擎（`zuvrust remux`）：它按容器规则
                    // 处理 extradata 与音频帧形态，比再引入一个 ffmpeg 依赖可靠
                    const enginePath = resolveMediaEnginePath()
                    if (enginePath) {
                      const remuxOk = await new Promise((resolve) => {
                        const child = spawn(enginePath, ['remux', finalTarget, outputPath, '--json'], { windowsHide: true })
                        let settled = false
                        const done = (r) => { if (!settled) { settled = true; resolve(r) } }
                        const timer = setTimeout(() => {
                          try { child.kill('SIGKILL') } catch (_) {}
                          done(false)
                        }, 60000)
                        child.on('error', () => { clearTimeout(timer); done(false) })
                        child.on('close', (code) => { clearTimeout(timer); done(code === 0) })
                      })
                      if (remuxOk && existsSync(finalTarget)) {
                        finalOutputPath = finalTarget
                      }
                    }
                  } catch (_) {}
                }
              }
            }
            if (outputPath && finalOutputPath && resolve(outputPath) !== resolve(finalOutputPath)) {
              const orig = resolve(outputPath)
              try { if (existsSync(orig)) unlinkSync(orig) } catch (_) {}
              try { const xf = `${orig}.xfer`; if (existsSync(xf)) unlinkSync(xf) } catch (_) {}
            }
          }
        } catch (_) {}

        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (gid) {
            api.removeDownloadResult({ gid }).catch(() => {})
          }
        } catch (_) {}

        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!gid) {
            return finalOutputPath
          }
          const taskName = task && task.name ? `${task.name}` : ''
          if (taskName.startsWith('[METADATA]')) {
            return finalOutputPath
          }
          let length = 0
          try {
            const st = statSync(finalOutputPath)
            length = Number(st.size || 0)
          } catch (_) {}
          const baseFile = Array.isArray(task.files) && task.files.length > 0 ? task.files[0] : null
          const files = [{
            ...(baseFile || {}),
            path: finalOutputPath,
            length: `${length}`,
            completedLength: `${length}`
          }]
          const patch = {
            ...task,
            name: basename(finalOutputPath),
            status: TASK_STATUS.COMPLETE,
            dir: dirname(finalOutputPath),
            files,
            totalLength: `${length}`,
            completedLength: `${length}`,
            downloadSpeed: '0',
            uploadSpeed: '0',
            statusHint: '',
            engineStatus: '',
            dashMerged: true
          }
          const cfg = preferenceConfig.value || {}
          const targetBase = info && info.base ? `${info.base}` : ''
          const targetType = info && info.type ? `${info.type}` : ''
          const targetDir = info && info.dir ? deriveBilibiliDashRootDir(`${info.dir}`, cfg) : ''
          const looksLikeDashPartFile = (filename) => {
            const n = filename ? `${filename}` : ''
            if (!n) return false
            const lower = n.toLowerCase()
            if (lower.endsWith('.m4s')) return true
            const withoutSuffix = cfg && cfg.downloadingFileSuffix && n.endsWith(cfg.downloadingFileSuffix)
              ? n.slice(0, -cfg.downloadingFileSuffix.length)
              : n
            const base = basename(withoutSuffix)
            if (/(?:[._-]|\s+|\()?(?:video\s*stream|audio\s*stream|videostream|audiostream|video|audio|视频流|音频流|视频|音频)(?:\))?(?:\.[^.]+)?$/i.test(base)) {
              return true
            }
            return false
          }
          const matchesM4sGroup = (normalizedName) => {
            const n = normalizedName ? `${normalizedName}` : ''
            if (!n || !targetBase) return false
            if (!/\.m4s$/i.test(n)) return false
            const plainName = stripDuplicateNumberBeforeExtension(n)
            return plainName.startsWith(`${targetBase}-`) || plainName === `${targetBase}.m4s`
          }
          const memberGids = (taskHistory.getAllHistory() || []).filter(item => {
            try {
              if (!item || !item.gid) return false
              if (`${item.gid}` === gid) return true
              if (item.dashMerged) return false
              const itemStatus = `${item.status || ''}`
              if (itemStatus === TASK_STATUS.COMPLETE && !looksLikeDashPartFile(getTaskFullPath(item) || '')) {
                return false
              }
              const full = getTaskFullPath(item)
              if (!full || !targetBase || !targetDir) return false
              const itemRoot = deriveBilibiliDashRootDir(dirname(full), cfg)
              if (resolve(itemRoot) !== resolve(targetDir)) return false
              const suffix = cfg.downloadingFileSuffix || ''
              const raw = basename(full)
              const normalized = suffix ? stripDownloadingSuffixFromFilename(raw, suffix) : raw
              let stemMatch = false
              if (targetType === 'm4s') {
                stemMatch = matchesM4sGroup(normalized) || normalizeDashStemFromFilename(normalized) === targetBase
              } else {
                stemMatch = normalizeDashStemFromFilename(normalized) === targetBase
              }
              if (!stemMatch) return false
              if (!looksLikeDashPartFile(normalized) && existsSync(full)) {
                return false
              }
              return true
            } catch (_) {
              return false
            }
          }).map(item => `${item.gid}`)
          if (!memberGids.includes(gid)) {
            memberGids.push(gid)
          }
          taskHistory.consolidateTasks(gid, memberGids, patch, task)
          for (const memberGid of memberGids) {
            if (!memberGid || memberGid === gid) continue
            try { api.removeTask({ gid: memberGid }).catch(() => {}) } catch (_) {}
            try { api.forceRemoveTask({ gid: memberGid }).catch(() => {}) } catch (_) {}
            try { api.removeTaskRecord({ gid: memberGid }).catch(() => {}) } catch (_) {}
            try { api.removeDownloadResult({ gid: memberGid }).catch(() => {}) } catch (_) {}
            try { taskHistory.removeTask(memberGid) } catch (_) {}
          }
          try {
            taskStore.clearTaskCachesForGids(memberGids.filter(mg => mg && mg !== gid))
          } catch (_) {}
        } catch (_) {}

        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (gid && finalOutputPath) {
            const historyAll = taskHistory.getAllHistory ? (taskHistory.getAllHistory() || []) : (taskHistory.getHistory() || [])
            const cfg = preferenceConfig.value || {}
            const deleted = deletedCandidates && deletedCandidates.size > 0 ? deletedCandidates : (deletedFiles && deletedFiles.size > 0 ? deletedFiles : null)
            const normalizeFull = (p) => {
              try {
                return p ? resolve(`${p}`) : ''
              } catch (_) {
                return ''
              }
            }
            let extensionAggressive = false
            try {
              const current = Array.isArray(historyAll) ? historyAll.find(x => x && `${x.gid || ''}` === gid) : null
              extensionAggressive = !!(current && current.fromBrowserExtension)
            } catch (_) {
              extensionAggressive = false
            }
            const matchesExtensionDashStem = (t, targetBase, targetDir, targetRootDir, targetType) => {
              try {
                if (!t || !t.gid) return false
                if (!targetBase || !targetDir) return false
                const full = getTaskFullPath(t) || ''
                if (!full) return false
                const dir = dirname(full)
                try {
                  const rd = resolve(dir)
                  const td = resolve(targetDir)
                  if (rd !== td) {
                    const tr = targetRootDir ? resolve(targetRootDir) : ''
                    if (!tr || rd !== tr) {
                      return false
                    }
                  }
                } catch (_) {
                  return false
                }
                const rawFile = basename(full)
                const suffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
                const file = stripDuplicateNumberBeforeExtension(rawFile)
                const normalized = suffix ? stripDownloadingSuffixFromFilename(file, suffix) : file
                if (`${targetType || ''}` === 'm4s' && /\.m4s$/i.test(normalized)) {
                  const plainName = stripDuplicateNumberBeforeExtension(normalized)
                  if (plainName.startsWith(`${targetBase}-`) || plainName === `${targetBase}.m4s`) {
                    return true
                  }
                }
                const stem = normalizeDashStemFromFilename(normalized)
                return !!(stem && stem === targetBase)
              } catch (_) {
                return false
              }
            }
            const matchesDeletedFiles = (t) => {
              if (!deleted) return false
              try {
                const candidates = new Set()
                try {
                  const a = getTaskActualPath(t, cfg)
                  if (a) candidates.add(normalizeFull(a))
                } catch (_) {}
                try {
                  const f = getTaskFullPath(t)
                  if (f) candidates.add(normalizeFull(f))
                } catch (_) {}
                const dir = t && t.dir ? `${t.dir}` : ''
                const files = Array.isArray(t && t.files) ? t.files : []
                files.forEach(file => {
                  try {
                    const raw = file && file.path ? `${file.path}` : ''
                    if (!raw) return
                    if (isAbsolute(raw)) {
                      candidates.add(normalizeFull(raw))
                      return
                    }
                    if (dir) {
                      candidates.add(normalizeFull(resolve(dir, raw)))
                      return
                    }
                    candidates.add(normalizeFull(raw))
                  } catch (_) {}
                })
                for (const c of candidates) {
                  if (c && deleted.has(c)) {
                    return true
                  }
                }
                return false
              } catch (_) {
                return false
              }
            }
            const targetInfo = info && typeof info === 'object' ? info : null
            const targetBase = targetInfo && targetInfo.base ? `${targetInfo.base}` : ''
            const targetType = targetInfo && targetInfo.type ? `${targetInfo.type}` : ''
            const targetDir = targetInfo && targetInfo.dir ? `${targetInfo.dir}` : ''
            const targetRootDir = targetDir ? deriveBilibiliDashRootDir(targetDir, cfg) : ''
            historyAll.forEach(item => {
              try {
                if (!item || !item.gid) {
                  return
                }
                if (item.gid === gid) {
                  return
                }
                if (item.dashMerged) {
                  return
                }
                if (extensionAggressive && matchesExtensionDashStem(item, targetBase, targetDir, targetRootDir, targetType)) {
                  const itemFull = getTaskFullPath(item) || ''
                  const itemBase = itemFull ? basename(itemFull) : ''
                  const itemNormalized = cfg.downloadingFileSuffix && itemBase.endsWith(cfg.downloadingFileSuffix)
                    ? stripDownloadingSuffixFromFilename(itemBase, cfg.downloadingFileSuffix)
                    : itemBase
                  const isCleanFinal = !!itemNormalized && !!/\.mp4$/i.test(itemNormalized) &&
                    !/(?:[._-]|\s+|\()?(?:video\s*stream|audio\s*stream|videostream|audiostream|video|audio|视频流|音频流|视频|音频)\)?$/i.test(normalizeDashStemFromFilename(itemNormalized) || '') &&
                    !/\.m4s$/i.test(itemNormalized)
                  if (!isCleanFinal || !existsSync(itemFull)) {
                    try {
                      api.removeDownloadResult({ gid: item.gid }).catch(() => {})
                    } catch (_) {}
                    try {
                      taskHistory.removeTask(item.gid)
                    } catch (_) {}
                  }
                  return
                }
                if (matchesDeletedFiles(item)) {
                  try {
                    api.removeDownloadResult({ gid: item.gid }).catch(() => {})
                  } catch (_) {}
                  try {
                    taskHistory.removeTask(item.gid)
                  } catch (_) {}
                  return
                }
                const files = Array.isArray(item.files) ? item.files : []
                if (!files.length) {
                  return
                }
                const full = getTaskFullPath(item) || ''
                if (!full) {
                  return
                }
                if (!targetBase || !targetRootDir) {
                  return
                }
                const partInfo = parseBilibiliDashPart(full)
                if (!partInfo || !partInfo.base || !partInfo.dir) {
                  return
                }
                if (`${partInfo.base}` !== targetBase) {
                  return
                }
                const partRootDir = deriveBilibiliDashRootDir(`${partInfo.dir}`, cfg)
                try {
                  if (resolve(partRootDir) !== resolve(targetRootDir)) {
                    return
                  }
                } catch (_) {
                  return
                }
                try {
                  if (existsSync(full)) {
                    return
                  }
                } catch (_) {}
                try {
                  api.removeDownloadResult({ gid: item.gid }).catch(() => {})
                } catch (_) {}
                try {
                  taskHistory.removeTask(item.gid)
                } catch (_) {}
              } catch (_) {}
            })
          }
        } catch (_) {}

        try {
          taskStore.fetchList().catch(() => {})
          appStore.fetchGlobalStat().catch(() => {})
        } catch (_) {}

        return finalOutputPath
      }
      function persistAverageSpeedToHistory(task) {
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!gid) {
            return
          }

          // 检查是否为元数据任务 - 这些任务不应该保存到历史记录
          const taskName = task && task.name ? `${task.name}` : ''
          const isMetadataTask = taskName.startsWith('[METADATA]')

          // 引擎直供平均速度优先（与进度窗口/任务详情同源），
          // 无该字段的旧引擎再回退本地采样均值
          if (task && task.averageSpeed != null) {
            const v = Number(task.averageSpeed)
            if (Number.isFinite(v) && v >= 0 && !isMetadataTask) {
              taskHistory.updateTask(gid, { averageDownloadSpeed: v, averageSpeedSampleCount: 0 }, task)
            }
            return
          }

          const map = taskStore.taskSpeedSamples || {}
          const samples = Array.isArray(map[gid]) ? map[gid] : []
          if (samples.length === 0) {
            return
          }

          const normalized = samples
            .map(s => {
              if (typeof s === 'number') {
                const speed = Number(s)
                if (!Number.isFinite(speed) || speed < 0) return null
                return { bytes: speed, durationMs: 1000 }
              }
              if (!s || typeof s !== 'object') return null
              const bytes = Number(s.bytes)
              const durationMs = Number(s.durationMs)
              if (!Number.isFinite(bytes) || bytes < 0) return null
              if (!Number.isFinite(durationMs) || durationMs <= 0) return null
              return { bytes, durationMs }
            })
            .filter(Boolean)

          const totalBytes = normalized.reduce((sum, it) => sum + it.bytes, 0)
          const totalDurationMs = normalized.reduce((sum, it) => sum + it.durationMs, 0)
          const avg = totalDurationMs > 0 ? Math.round((totalBytes * 1000) / totalDurationMs) : 0
          const count = normalized
            .map(it => (it.durationMs > 0 ? (it.bytes * 1000) / it.durationMs : 0))
            .filter(v => Number.isFinite(v) && v > 0).length

          if (!isMetadataTask) {
            taskHistory.updateTask(gid, { averageDownloadSpeed: avg, averageSpeedSampleCount: count }, task)
          }
        } catch (_) {
        }
      }
      function ensureTargetDirectoryExists(task) {
        const fullPath = getTaskFullPath(task)
        const targetDir = dirname(fullPath)
        if (!existsSync(targetDir)) {
          try {
            mkdirSync(targetDir, { recursive: true })
            console.log(`[Lerxu] Created target directory: ${targetDir}`)
          } catch (error) {
            console.warn(`[Lerxu] Failed to create target directory: ${error.message}`)
          }
        }
      }

      function ensureCategoryDirectoryForTask(task) {
        const cfg = preferenceConfig.value || {}
        const autoCategorizeEnabled = cfg.autoCategorizeFiles
        const categories = cfg.fileCategories

        if (!autoCategorizeEnabled || !categories || Object.keys(categories).length === 0) {
          return
        }

        const categoryNames = Object.keys(categories).map(key => {
          const categoryConfig = categories[key] || {}
          return categoryConfig.name || key
        })

        const isBTTask = checkTaskIsBT(task)

        if (isBTTask) {
          const files = Array.isArray(task.files) ? task.files : []

          files.forEach(file => {
            const filePath = file.path || ''
            if (!filePath) {
              return
            }

            const baseDir = dirname(filePath)
            const dirName = basename(baseDir)

            if (categoryNames.includes(dirName)) {
              return
            }

            const filename = basename(filePath)
            const categorizedInfo = buildCategorizedPath(filePath, filename, categories, baseDir)
            createCategoryDirectory(categorizedInfo.categorizedDir)
          })

          return
        }

        const filePath = getTaskFullPath(task)
        if (!filePath) {
          return
        }

        const baseDir = dirname(filePath)
        const dirName = basename(baseDir)

        if (categoryNames.includes(dirName)) {
          return
        }

        const filename = basename(filePath)
        const categorizedInfo = buildCategorizedPath(filePath, filename, categories, baseDir)
        createCategoryDirectory(categorizedInfo.categorizedDir)
      }

      function getUniqueCompletedPath(filePath) {
        if (!filePath || !existsSync(filePath)) {
          return filePath
        }
        const dir = dirname(filePath)
        const ext = extname(filePath)
        const name = basename(filePath, ext)
        for (let index = 1; index < 1000; index++) {
          const candidate = resolve(dir, `${name} (${index})${ext}`)
          if (!existsSync(candidate)) {
            return candidate
          }
        }
        return ''
      }
      async function removeDownloadingSuffix(task, manualPath = '', preferenceConfig = null) {
        const cfg = preferenceConfig || preferenceConfig.value || {}
        const downloadingFileSuffix = cfg.downloadingFileSuffix || ''

        const taskPath = getTaskFullPath(task)
        const candidatePaths = []
        const appendCandidate = (value) => {
          const path = value ? resolve(`${value}`) : ''
          if (path && !candidatePaths.includes(path)) {
            candidatePaths.push(path)
          }
        }
        appendCandidate(manualPath)
        getPathCandidates(taskPath, downloadingFileSuffix, cfg).forEach(appendCandidate)
        appendCandidate(getTaskActualPath(task, cfg))

        const currentPath = candidatePaths.find(path => {
          return path.endsWith(downloadingFileSuffix) && existsSync(path)
        }) || candidatePaths.find(path => existsSync(path)) || candidatePaths[0] || ''
        if (!currentPath || !downloadingFileSuffix) {
          return currentPath
        }

        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
        const renameWithRetry = async (from, to, attempts = 10, delayMs = 200) => {
          const f = from ? `${from}` : ''
          const t = to ? `${to}` : ''
          if (!f || !t || f === t) return true
          for (let i = 0; i < attempts; i++) {
            if (!existsSync(f)) return existsSync(t)
            if (!existsSync(t)) {
              const ok = renamePreserveTimes(f, t)
              if (ok) return true
            }
            await sleep(delayMs)
          }
          return !existsSync(f) && existsSync(t)
        }

        if (currentPath.endsWith(downloadingFileSuffix)) {
          const fixedPath = fixFileNameWithSuffix(currentPath, downloadingFileSuffix)
          let pathToProcess = currentPath

          if (fixedPath !== currentPath && existsSync(currentPath)) {
            const okFix = await renameWithRetry(currentPath, fixedPath)
            if (okFix) {
              console.log(`[Lerxu] Fixed file name structure: ${currentPath} -> ${fixedPath}`)
              cleanupAria2ControlFiles([currentPath, fixedPath])
              pathToProcess = fixedPath
            }
          }

          const desiredPath = pathToProcess.slice(0, -downloadingFileSuffix.length)
          const originalPath = existsSync(pathToProcess)
            ? getUniqueCompletedPath(desiredPath)
            : desiredPath
          if (existsSync(pathToProcess) && originalPath) {
            const ok = await renameWithRetry(pathToProcess, originalPath)
            if (ok && existsSync(originalPath)) {
              console.log(`[Lerxu] Removed downloading suffix: ${pathToProcess} -> ${originalPath}`)
              cleanupAria2ControlFiles([pathToProcess, originalPath, desiredPath])
              return originalPath
            }
          } else if (existsSync(desiredPath)) {
            cleanupAria2ControlFiles([desiredPath])
            return desiredPath
          }
          return existsSync(desiredPath) ? desiredPath : currentPath
        } else {
          const suffixedPath = candidatePaths.find(path => {
            return path.endsWith(downloadingFileSuffix) && existsSync(path)
          }) || `${currentPath}${downloadingFileSuffix}`
          if (existsSync(suffixedPath)) {
            const targetPath = getUniqueCompletedPath(
              suffixedPath.slice(0, -downloadingFileSuffix.length)
            )
            if (targetPath) {
              const ok = await renameWithRetry(suffixedPath, targetPath)
              if (ok && existsSync(targetPath)) {
                console.log(`[Lerxu] Removed downloading suffix: ${suffixedPath} -> ${targetPath}`)
                cleanupAria2ControlFiles([suffixedPath, targetPath])
                return targetPath
              }
            }
          }
          return existsSync(currentPath) ? currentPath : suffixedPath
        }
      }
      function autoCategorizeDownloadedFile(task, manualPath = null) {
        const cfg = preferenceConfig.value || {}
        const autoCategorizeEnabled = cfg.autoCategorizeFiles

        console.log('[Lerxu] Auto categorize check - enabled:', autoCategorizeEnabled)

        if (!autoCategorizeEnabled) {
          console.log('[Lerxu] Auto categorize files is disabled')
          return
        }

        const categories = cfg.fileCategories
        console.log('[Lerxu] Auto categorize categories:', categories)

        if (!categories || Object.keys(categories).length === 0) {
          console.log('[Lerxu] No file categories configured, skip auto categorize')
          return
        }

        const downloadingFileSuffix = cfg.downloadingFileSuffix || ''
        const categoryNames = Object.keys(categories).map(key => {
          const categoryConfig = categories[key] || {}
          return categoryConfig.name || key
        })

        const isBTTask = checkTaskIsBT(task)

        if (isBTTask) {
          // ... BT task logic ...
          const files = Array.isArray(task.files) ? task.files : []
          const taskDir = task && task.dir ? resolve(task.dir) : ''
          const btName = task && task.bittorrent && task.bittorrent.info && task.bittorrent.info.name
            ? `${task.bittorrent.info.name}`
            : ''

          files.forEach(file => {
            // ... logic unchanged for BT tasks as they usually don't use simple suffix ...
            const total = Number(file.length || 0)
            const done = Number(file.completedLength || 0)
            if (!total || done < total) {
              return
            }

            const rawFilePath = file && file.path ? `${file.path}` : ''
            if (!rawFilePath) {
              return
            }

            const candidates = []
            if (isAbsolute(rawFilePath)) {
              candidates.push(resolve(rawFilePath))
            } else if (taskDir) {
              candidates.push(resolve(taskDir, rawFilePath))
              if (btName) {
                candidates.push(resolve(taskDir, btName, rawFilePath))
              }
            }

            // 对于 BT 任务，我们也尝试处理后缀
            let filePath = candidates.find(p => existsSync(p)) || ''
            if (!filePath && downloadingFileSuffix) {
              filePath = candidates
                .map(p => `${p}${downloadingFileSuffix}`)
                .find(p => existsSync(p)) || ''
            }
            if (!filePath) {
              filePath = candidates[0] || ''
            }

            // ... rename logic for BT ...
            try {
              if (downloadingFileSuffix) {
                if (filePath.endsWith(downloadingFileSuffix) && existsSync(filePath)) {
                  // 首先尝试修复文件名中的序号位置
                  const fixedPath = fixFileNameWithSuffix(filePath, downloadingFileSuffix)
                  let pathToProcess = filePath

                  // 如果修复后的路径不同，先重命名到正确的位置
                  if (fixedPath !== filePath) {
                    const renameOk = renamePreserveTimes(filePath, fixedPath)
                    if (renameOk) {
                      console.log(`[Lerxu] Fixed BT file name structure: ${filePath} -> ${fixedPath}`)
                      cleanupAria2ControlFiles([filePath, fixedPath])
                      pathToProcess = fixedPath
                    } else {
                      console.warn(`[Lerxu] Failed to fix BT file name structure: ${filePath} -> ${fixedPath}`)
                    }
                  }

                  const originalPath = pathToProcess.slice(0, -downloadingFileSuffix.length)
                  const ok = renamePreserveTimes(pathToProcess, originalPath)
                  if (ok) {
                    console.log(`[Lerxu] Removed downloading suffix before categorize: ${pathToProcess} -> ${originalPath}`)
                    cleanupAria2ControlFiles([pathToProcess, originalPath])
                    filePath = originalPath
                  }
                }
              }
            } catch (error) {
              console.warn(`[Lerxu] Failed to normalize downloading suffix before categorize: ${error.message}`)
            }

            if (!existsSync(filePath)) {
              return
            }

            try {
              const baseDir = dirname(filePath)
              const dirName = basename(baseDir)

              if (categoryNames.includes(dirName)) {
                return
              }

              const result = autoCategorizeFile(filePath, baseDir, categories)
              if (result) {
                console.log(`[Lerxu] File categorized successfully: ${filePath}`)
              }
            } catch (error) {
              console.error(`[Lerxu] Error during auto categorization: ${error.message}`)
            }
          })

          return
        }

        let filePath = manualPath || getTaskFullPath(task)

        // 如果手动传入了路径，我们假设它已经是处理过后缀的正确路径
        // 如果没有传入，我们需要像以前一样尝试查找和处理后缀
        if (!manualPath) {
          try {
            if (downloadingFileSuffix) {
              if (filePath.endsWith(downloadingFileSuffix) && existsSync(filePath)) {
                // 首先尝试修复文件名中的序号位置
                const fixedPath = fixFileNameWithSuffix(filePath, downloadingFileSuffix)
                let pathToProcess = filePath

                // 如果修复后的路径不同，先重命名到正确的位置
                if (fixedPath !== filePath) {
                  const renameOk = renamePreserveTimes(filePath, fixedPath)
                  if (renameOk) {
                    console.log(`[Lerxu] Fixed file name structure before categorize: ${filePath} -> ${fixedPath}`)
                    cleanupAria2ControlFiles([filePath, fixedPath])
                    pathToProcess = fixedPath
                  } else {
                    console.warn(`[Lerxu] Failed to fix file name structure before categorize: ${filePath} -> ${fixedPath}`)
                  }
                }

                const originalPath = pathToProcess.slice(0, -downloadingFileSuffix.length)
                const ok = renamePreserveTimes(pathToProcess, originalPath)
                if (ok) {
                  console.log(`[Lerxu] Removed downloading suffix before categorize: ${pathToProcess} -> ${originalPath}`)
                  cleanupAria2ControlFiles([pathToProcess, originalPath])
                  filePath = originalPath
                }
              } else {
                const suffixedPath = filePath + downloadingFileSuffix
                if (!existsSync(filePath) && existsSync(suffixedPath)) {
                  // 也检查这个路径是否需要修复
                  const fixedSuffixedPath = fixFileNameWithSuffix(suffixedPath, downloadingFileSuffix)
                  let pathToProcess = suffixedPath

                  if (fixedSuffixedPath !== suffixedPath && existsSync(suffixedPath)) {
                    const renameOk = renamePreserveTimes(suffixedPath, fixedSuffixedPath)
                    if (renameOk) {
                      console.log(`[Lerxu] Fixed suffixed file name structure: ${suffixedPath} -> ${fixedSuffixedPath}`)
                      cleanupAria2ControlFiles([suffixedPath, fixedSuffixedPath])
                      pathToProcess = fixedSuffixedPath
                    }
                  }

                  const targetPath = pathToProcess.slice(0, -downloadingFileSuffix.length)
                  const ok = renamePreserveTimes(pathToProcess, targetPath)
                  if (ok) {
                    console.log(`[Lerxu] Restored downloading suffix before categorize: ${pathToProcess} -> ${targetPath}`)
                    cleanupAria2ControlFiles([pathToProcess, targetPath])
                    filePath = targetPath
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`[Lerxu] Failed to normalize downloading suffix before categorize: ${error.message}`)
          }
        }

        if (!existsSync(filePath)) {
          console.warn(`[Lerxu] File not found for categorization: ${filePath}`)
          return
        }

        try {
          const baseDir = dirname(filePath)
          const dirName = basename(baseDir)

          if (categoryNames.includes(dirName)) {
            console.log(`[Lerxu] File already in category directory: ${filePath}`)
            return
          }

          const result = autoCategorizeDownloadedFile(filePath, baseDir, categories)
          if (result) {
            console.log(`[Lerxu] File categorized successfully: ${filePath}`)
          } else {
            console.warn('[Lerxu] File categorization failed or file already in category')
          }
        } catch (error) {
          console.error(`[Lerxu] Error during auto categorization: ${error.message}`)
        }
      }
      function setFileMtimeOnComplete(task, manualPath = null) {
        const enabled = preferenceConfig.value.setFileMtimeOnComplete
        if (!enabled) {
          return
        }

        try {
          const filePath = manualPath || getTaskFullPath(task)
          if (!existsSync(filePath)) {
            return
          }
          const now = new Date()
          utimesSync(filePath, now, now)
        } catch (error) {
          console.warn(`[Lerxu] Failed to set file mtime on complete: ${error.message}`)
        }
      }
      function showTaskCompleteNotify(task, isBT, path) {
        let taskName = ''
        try {
          const base = path ? basename(path) : ''
          if (base) {
            taskName = base
          }
        } catch (_) {}
        if (!taskName) {
          taskName = getTaskName(task)
        }
        const message = isBT
          ? t('task.bt-download-complete-message', { taskName })
          : t('task.download-complete-message', { taskName })
        const tips = isBT
          ? '\n' + t('task.bt-download-complete-tips')
          : ''

        msg.success(`${message}${tips}`)

        // 系统通知由主进程展示（task-download-complete 事件），
        // 渲染进程只负责应用内 toast，避免重复通知
      }
      /**
       * 弹"下载完成"通知。**所有完成路径都必须走这里**（唯一出口）。
       *
       * 一条下载可能在多条路径上被判"完成"（最后一条流完成的合并成功、
       * 另一半重试定时器醒来后的合并成功、重试耗尽后的如实收尾、缺媒体引擎的
       * 降级完成），每一条都通知过一次 → 用户看到"一个视频弹三条完成通知"。
       * 去重键是**下载的身份**（pairId / gid），所以整对音视频只弹一次。
       *
       * `pairId` 必须由调用方从任务历史里取（`getTaskPairInfo`）传进来：
       * 引擎任务对象上没有配对信息，只按 gid 取键的话两条流会各弹一次。
       *
       * 返回 true 表示这一次真的弹了（调用方据此判断"通知已经发出去"）。
       */
      function notifyTaskCompleteOnce(task, isBT, path, pairId) {
        const identity = {
          pairId: pairId ? `${pairId}` : '',
          gid: task && task.gid ? `${task.gid}` : ''
        }
        if (!_completeNotifier.shouldNotify(identity, path)) {
          return false
        }
        showTaskCompleteNotify(task, isBT, path)
        ipcRenderer.send('event', 'task-download-complete', task, path)
        return true
      }
      function bindEngineEvents() {
        api.client.on('onDownloadStart', onDownloadStart)
        api.client.on('onDownloadPause', onDownloadPause)
        api.client.on('onDownloadStop', onDownloadStop)
        api.client.on('onDownloadComplete', onDownloadComplete)
        api.client.on('onDownloadError', onDownloadError)
        api.client.on('onBtDownloadComplete', onBtDownloadComplete)
      }
      function unbindEngineEvents() {
        api.client.removeListener('onDownloadStart', onDownloadStart)
        api.client.removeListener('onDownloadPause', onDownloadPause)
        api.client.removeListener('onDownloadStop', onDownloadStop)
        api.client.removeListener('onDownloadComplete', onDownloadComplete)
        api.client.removeListener('onDownloadError', onDownloadError)
        api.client.removeListener('onBtDownloadComplete', onBtDownloadComplete)
      }
      function onEngineReconnect() {
        // WebSocket 重连成功后，旧 socket 上的事件监听器已失效，
        // 必须重新绑定引擎推送事件（onDownloadStart 等）。
        unbindEngineEvents()
        bindEngineEvents()

        // 立即刷新一次任务列表和全局统计，
        // 消除断线期间的 UI 数据空白。
        appStore.fetchGlobalStat()
        taskStore.fetchList()

        // 重置轮询间隔，避免在 idle interval 下延迟刷新
        appStore.resetInterval()
        kickPolling()

        // 重置连接状态标记
        engineConnectionStable.value = true
      }
      function startPolling() {
        stopPolling()
        timer = setTimeout(() => {
          try {
            polling()
          } catch (err) {
            // 单次轮询的同步异常不能中断轮询循环，
            // 否则任务列表会永久停止刷新（startPolling 不再被调用）
            console.error('[Lerxu] polling error, loop continues:', err)
          }
          startPolling()
        }, pollingDelay())
      }
      // 窗口隐藏（最小化/切到后台）时进度无需秒级刷新：即使有活跃任务，
      // 也把轮询放宽到 3s（下载与引擎行为不受影响，仅界面数据少刷几次），
      // 恢复可见时 visibilitychange 会立即 kickPolling 补一次
      const HIDDEN_POLLING_INTERVAL = 3000
      function pollingDelay() {
        const base = interval.value
        const hidden = typeof document !== 'undefined' && !!document.hidden
        return hidden ? Math.max(base, HIDDEN_POLLING_INTERVAL) : base
      }
      function kickPolling() {
        const now = Date.now()
        if (_pollingKickAt && now - _pollingKickAt < 400) {
          return
        }
        _pollingKickAt = now
        stopPolling()
        timer = setTimeout(() => {
          try {
            polling()
          } catch (err) {
            console.error('[Lerxu] polling error, loop continues:', err)
          }
          startPolling()
        }, 0)
      }
      function polling() {
        pollingCount.value = (pollingCount.value || 0) + 1
        // 每30次polling（约30秒）保存一次平均速度
        if (pollingCount.value % 30 === 0) {
          persistAllActiveTasksAverageSpeed()
        }

        maybeEnterIdleInterval()

        const stat = appStore.stat || {}
        const numActive = Number(stat.numActive || 0)
        const numWaiting = Number(stat.numWaiting || 0)
        const hasActiveOrWaiting = (numActive + numWaiting) > 0

        appStore.fetchGlobalStat()
        if (hasActiveOrWaiting) {
          appStore.fetchProgress()
        } else {
          appStore.clearProgress()
        }

        taskStore.fetchList().then(() => {
          sampleAverageSpeedForActiveTasks()
          checkMagnetAlerts()
          checkDataAccessStatus()
          fixResumedCompletedSuffixTasks().catch(() => {})
          fixResumedErroredTasks().catch(() => {})
          // 被中断的合并簿记先清掉（否则记录永久停在"正在合并"，见该函数注释），
          // 再补扫"两个文件都下完却还没合并"的配对：把漏掉的合并重试重新武装
          reconcileStaleMergingEntries()
          rearmStuckPairMerges()
          // 待选择文件状态每轮补扫：磁力任务重启后先以暂停的磁力形态存在，
          // 元数据重新解析完才会出现待选择的 BT 任务，只扫一次会漏掉
          scanForPendingBtTasks()
          // 首次轮询后校验待选择文件状态，移除已不存在的任务条目
          if (!pendingFileSelectionSynced.value) {
            // 用未过滤的全量列表校验：state.taskList 受当前列表类型
            // 与日期筛选影响，可能漏掉任务导致已确认记录被误删，
            // 进而在重启后把已选文件的任务重新标记为待选择。
            const hasStoredPending = Object.keys(taskStore.pendingFileSelection || {}).length > 0
            const applySync = (list) => {
              // 引擎启动早期可能返回空列表，此时校验会把仍待选择的记录清掉，
              // 保持未同步状态到下一轮重试
              if ((!Array.isArray(list) || list.length === 0) && hasStoredPending) {
                return
              }
              pendingFileSelectionSynced.value = true
              taskStore.syncPendingFileSelection(list || [])
            }
            api.fetchTaskList({ type: 'all' }).then(applySync).catch(() => {
              applySync(taskStore.taskList || [])
            })
          }
        }).catch(() => {
          // 引擎断线时 fetchList 会 reject，静默忽略
        })

        if (taskDetailVisible.value && currentTaskGid.value) {
          // 只对活跃任务调用 fetchItemWithPeers 或 fetchItem，避免对历史记录任务调用 aria2 API
          // 通过检查任务状态来判断是否为活跃任务
          const task = taskStore.currentTaskItem
          if (task) {
            // 检查任务状态，如果是已完成、已失败或已移除状态，不调用 API
            const activeStatuses = ['active', 'waiting', 'paused']
            if (activeStatuses.includes(task.status)) {
              if (currentTaskIsBT.value && enabledFetchPeers.value) {
                taskStore.fetchItemWithPeers(currentTaskGid.value)
              } else {
                taskStore.fetchItem(currentTaskGid.value)
              }
            }
          }
        }
      }
      function persistAllActiveTasksAverageSpeed() {
        const list = taskStore.taskList || []
        list.forEach(task => {
          if (task.status === TASK_STATUS.ACTIVE) {
            persistAverageSpeedToHistory(task)
          }
        })
      }
      function sampleAverageSpeedForActiveTasks() {
        const list = taskStore.taskList || []
        const activeGids = new Set()
        const now = Date.now()
        list.forEach(task => {
          if (!task) {
            return
          }
          if (task.status !== TASK_STATUS.ACTIVE) {
            return
          }
          const gid = task.gid ? `${task.gid}` : ''
          if (!gid) {
            return
          }
          activeGids.add(gid)

          const completed = Number(task.completedLength || 0)
          if (!Number.isFinite(completed) || completed < 0) {
            taskSpeedSampleBaseMap.value[gid] = { ts: now, completed: 0 }
            return
          }

          const prev = taskSpeedSampleBaseMap.value[gid]
          if (!prev || !Number.isFinite(prev.ts) || !Number.isFinite(prev.completed)) {
            taskSpeedSampleBaseMap.value[gid] = { ts: now, completed }
            return
          }

          const durationMs = now - prev.ts
          const bytes = completed - prev.completed
          if (!(durationMs > 0) || durationMs > 15000 || durationMs < 200 || bytes < 0) {
            taskSpeedSampleBaseMap.value[gid] = { ts: now, completed }
            return
          }

          taskSpeedSampleBaseMap.value[gid] = { ts: now, completed }
          taskStore.addTaskSpeedSample({
            gid,
            sample: { bytes, durationMs },
            maxSamples: 60
          })
        })

        Object.keys(taskSpeedSampleBaseMap.value || {}).forEach(gid => {
          if (!activeGids.has(gid)) {
            delete taskSpeedSampleBaseMap.value[gid]
          }
        })
      }
      async function alertMagnetStatus(task) {
        try {
          const gid = task.gid
          const detailed = await api.fetchTaskItemWithPeers({ gid })

          // 处理新的peers数据结构
          const peers = detailed.peers || { connected: [], attempting: [], banned: [], disconnected: [] }
          let peerCount = 0

          if (Array.isArray(peers)) {
            // 兼容旧格式
            peerCount = peers.length
          } else {
            // 新格式：统计所有类型的节点
            const connected = Array.isArray(peers.connected) ? peers.connected : []
            const attempting = Array.isArray(peers.attempting) ? peers.attempting : []
            const banned = Array.isArray(peers.banned) ? peers.banned : []
            const disconnected = Array.isArray(peers.disconnected) ? peers.disconnected : []
            peerCount = connected.length + attempting.length + banned.length + disconnected.length
          }

          const bt = detailed.bittorrent || {}
          const announceList = bt.announceList || []
          const trackerCount = Array.isArray(announceList) ? announceList.length : 0

          let phase = 'contacting_trackers'
          if (trackerCount === 0) {
            phase = 'no_trackers'
          } else if (peerCount > 0) {
            phase = 'peers_connected'
          }
          const cfg = preferenceStore?.config || {}
          const dhtListenPort = Number(cfg['dht-listen-port'] || 0)
          const dhtEnabled = dhtListenPort > 0
          taskStore.updateMagnetStatus({
            gid,
            peerCount,
            trackerCount,
            fetching: true,
            phase,
            dhtEnabled,
            updatedAt: Date.now()
          })
          magnetAlertedSet.value.add(gid)
        } catch (e) {
          console.warn('alertMagnetStatus fail:', e.message)
        }
      }
      function checkMagnetAlerts() {
        const list = taskStore.taskList || []
        const currentGids = new Set(list.map(t => t && t.gid ? `${t.gid}` : ''))

        list.forEach(task => {
          const gid = task.gid
          const zero = Number(task.downloadSpeed) === 0
          const magnetPending = isMagnetTask(task)

          if (magnetPending && zero) {
            const count = (magnetZeroMap.value[gid] || 0) + 1
            magnetZeroMap.value[gid] = count
            const elapsedSec = Math.round(count * (interval.value / 1000))
            // 读取上一状态用于趋势判断
            const prev = (taskStore.magnetStatuses || {})[gid] || {}
            const prevPeers = Number(prev.peerCount || 0)
            // peers 形态两种：分组对象 {connected,attempting,banned,disconnected}
            // （详情抽屉轮询写入）或扁平数组（旧兜底）——统一计数
            const peersList = task.peers
            const rawPeerCount = Array.isArray(peersList)
              ? peersList.length
              : (peersList && typeof peersList === 'object'
                ? ['connected', 'attempting', 'banned', 'disconnected']
                  .reduce((n, k) => n + (Array.isArray(peersList[k]) ? peersList[k].length : 0), 0)
                : 0)
            const peerCount = rawPeerCount > 0 ? rawPeerCount : prevPeers
            let peerTrend = 'flat'
            if (peerCount > prevPeers) peerTrend = 'up'
            else if (peerCount < prevPeers) peerTrend = 'down'

            const cfg = preferenceStore?.config || {}
            const limitStr = `${cfg['max-overall-download-limit'] || cfg.maxOverallDownloadLimit || 0}`
            const globalLimitLow = !(limitStr === '0' || Number(limitStr) >= 102400)
            const pauseMetadata = !!(cfg['pause-metadata'] || cfg.pauseMetadata)

            taskStore.updateMagnetStatus({
              gid,
              fetching: true,
              elapsedSec,
              updatedAt: Date.now(),
              peerCount,
              peerTrend,
              globalLimitLow,
              pauseMetadata
            })
            if (count >= 3 && !magnetAlertedSet.value.has(gid)) {
              alertMagnetStatus(task)
            }
          } else {
            magnetZeroMap.value[gid] = 0
            if (!magnetPending) {
              const wasMagnet = !!(taskStore.magnetStatuses || {})[gid]
              taskStore.clearMagnetStatus(gid)
              if (magnetAlertedSet.value.has(gid)) {
                magnetAlertedSet.value.delete(gid)
              }
              if (wasMagnet) {
                handleMagnetResolved(task)
              }
            }
          }
        })

        // 检测已从任务列表中消失的磁力任务（元数据下载完成后原任务变为已完成被移除）
        // 这种情况下 checkMagnetAlerts 的主循环无法检测到磁力→非磁力的转变，
        // 需要在此补充检测，确保 handleMagnetResolved 被调用以设置 pendingFileSelection
        Object.keys(magnetZeroMap.value).forEach(gid => {
          if (!gid || currentGids.has(gid)) return
          const count = magnetZeroMap.value[gid] || 0
          if (count <= 0) return
          // 任务已不在列表中但曾被追踪为磁力任务，触发 resolved 处理
          magnetZeroMap.value[gid] = 0
          if (!magnetResolvedSet.value.has(gid)) {
            handleMagnetResolved({ gid })
          }
        })
      }
      function handleMagnetResolved(task) {
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) return
        if (magnetResolvedSet.value.has(gid)) {
          return
        }
        magnetResolvedSet.value.add(gid)
        // 磁力任务 follow 出的 BT 任务：
        // - 已确认过文件选择（按 gid 或同哈希）→ 直接恢复下载
        // - 处于"待选择文件"候选（paused/多文件/无进度）→ 标记待选择
        // - 不在候选（已有进度/非暂停）→ 恢复下载即可
        api.fetchTaskItem({ gid }).then((detail) => {
          const confirmedNow = () => taskStore.confirmedFileSelection || {}
          const followedBy = detail && detail.followedBy ? detail.followedBy : []
          if (followedBy.length) {
            followedBy.forEach(newGid => {
              api.fetchTaskItem({ gid: newGid }).then((newTask) => {
                const target = newTask || detail
                const files = Array.isArray(target.files) ? target.files : []
                if (files.length > 1) {
                  if (isTaskFileSelectionConfirmed(confirmedNow(), target)) {
                    api.resumeTask({ gid: newGid }).catch(() => {})
                  } else if (isTaskPendingSelectionCandidate(target)) {
                    taskStore.setPendingFileSelection(newGid, getTaskInfoHash(target))
                    notifyPendingFileSelection(target)
                  } else {
                    api.resumeTask({ gid: newGid }).catch(() => {})
                  }
                } else {
                  api.resumeTask({ gid: newGid }).catch(() => {})
                }
              }).catch(() => {})
            })
          } else {
            // 引擎可能未使用 followedBy 机制（原地转换磁力任务），
            // 检查任务本身是否已变为多文件 BT 任务
            const files = Array.isArray(detail && detail.files) ? detail.files : []
            const bt = detail && detail.bittorrent ? detail.bittorrent : null
            if (bt && bt.info && files.length > 1 && detail.status === TASK_STATUS.PAUSED) {
              if (isTaskFileSelectionConfirmed(confirmedNow(), detail)) {
                api.resumeTask({ gid }).catch(() => {})
              } else if (isTaskPendingSelectionCandidate(detail)) {
                taskStore.setPendingFileSelection(gid, getTaskInfoHash(detail))
                notifyPendingFileSelection(detail)
              } else {
                api.resumeTask({ gid }).catch(() => {})
              }
            } else if (files.length <= 1 && detail.status === TASK_STATUS.PAUSED) {
              api.resumeTask({ gid }).catch(() => {})
            }
          }
        }).catch(() => {
          // 原始磁力任务可能已从引擎中移除，扫描任务列表查找新出现的暂停 BT 任务
          scanForPendingBtTasks()
        })
      }
      function scanForPendingBtTasks(tasks) {
        // taskList 只包含当前列表类型（侧栏 tab）与日期筛选下的任务，
        // 待选择文件的任务处于暂停态，停在"下载中"页时会被漏掉；
        // allTaskList 不受列表类型影响，用它才能保证重启后必定重新识别
        const list = Array.isArray(tasks) ? tasks : (taskStore.allTaskList || [])
        const pending = taskStore.pendingFileSelection || {}
        const confirmed = taskStore.confirmedFileSelection || {}
        // 孤儿记录按 infoHash 重挂：重启后引擎只恢复磁力任务本体
        // （会话保存的是磁力条目），BT 阶段旧 gid 全部漂移。首轮校验
        // 只做一次，错过引擎晚上报 infoHash / 元数据晚解析就再无机会，
        // 因此每轮扫描都补做一次重挂
        const hashToTask = new Map()
        list.forEach(task => {
          const hash = getTaskInfoHash(task)
          if (hash && !hashToTask.has(hash)) {
            hashToTask.set(hash, task)
          }
        })
        const listGids = new Set(list.map(task => (task && task.gid ? `${task.gid}` : '')))
        Object.keys(pending).forEach(gid => {
          if (listGids.has(gid)) return
          const stored = pending[gid]
          const storedHash = typeof stored === 'string' ? `${stored}`.trim().toLowerCase() : ''
          if (!storedHash) return
          // 该哈希已确认过文件选择（记录可能挂在漂移前的旧 gid 上）：
          // 选择结果已随会话保存，孤儿待选择记录直接作废，否则已选完
          // 文件的任务重启后会被误标回"待选择文件"
          if (isTaskFileSelectionConfirmed(confirmed, { infoHash: storedHash })) {
            taskStore.clearPendingFileSelection(gid)
            return
          }
          const target = hashToTask.get(storedHash)
          const targetGid = target && target.gid ? `${target.gid}` : ''
          if (!targetGid || targetGid === gid) return
          if (!isTaskPendingSelectionTarget(target) || pending[targetGid] || isTaskFileSelectionConfirmed(confirmed, target)) {
            taskStore.clearPendingFileSelection(gid)
            return
          }
          taskStore.clearPendingFileSelection(gid)
          taskStore.setPendingFileSelection(targetGid, storedHash)
        })
        const pendingNow = taskStore.pendingFileSelection || {}
        list.forEach(task => {
          const taskGid = task && task.gid ? `${task.gid}` : ''
          if (!taskGid || pendingNow[taskGid]) return
          if (!isTaskPendingSelectionCandidate(task)) return
          // 已确认过文件选择的任务（按 gid 或同哈希）不再标待选择：
          // 选择结果已随会话保存，重启后应沿用而不是重新询问
          if (isTaskFileSelectionConfirmed(confirmed, task)) return
          taskStore.setPendingFileSelection(taskGid, getTaskInfoHash(task))
          notifyPendingFileSelection(task)
        })
      }
      function notifyPendingFileSelection(task) {
        const gid = task && task.gid ? `${task.gid}` : ''
        // 两条路径都会走到这里（handleMagnetResolved / scanForPendingBtTasks），
        // 去重必须收在函数内：磁力进入待选择状态的同一次轮询里两处都可能触发，
        // 只靠 scan 侧的 _pendingSelectionNotified 会连弹两个就绪通知
        if (!gid || _pendingSelectionNotified.has(gid)) {
          return
        }
        _pendingSelectionNotified.add(gid)

        const message = t('task.pending-file-selection-message', {
          taskName: getTaskName(task)
        })
        msg.info(message)

        const notifyTitle = t('task.pending-file-selection-notify')
        showNativeNotification({
          title: notifyTitle,
          body: getTaskName(task),
          onClick: () => {
            ipcRenderer.send('command', 'application:show', { page: 'index' })
          }
        })
      }
      function checkDataAccessStatus() {
        const list = taskStore.taskList || []
        const activeStatuses = ['active']
        list.forEach(task => {
          const gid = task.gid
          const status = task.status
          const isMagnet = isMagnetTask(task)
          if (!activeStatuses.includes(status) || isMagnet) {
            dataAccessZeroMap.value[gid] = 0
            dataAccessLastCompletedMap.value[gid] = undefined
            taskStore.clearDataAccessStatus(gid)
            return
          }
          const completed = Number(task.completedLength || 0)
          const speedZero = Number(task.downloadSpeed) === 0
          const lastCompleted = Number(dataAccessLastCompletedMap.value[gid] || 0)
          if (!speedZero || completed > lastCompleted) {
            dataAccessLastCompletedMap.value[gid] = completed
            dataAccessZeroMap.value[gid] = 0
            taskStore.clearDataAccessStatus(gid)
            return
          }
          const count = (dataAccessZeroMap.value[gid] || 0) + 1
          dataAccessZeroMap.value[gid] = count
          const elapsedSec = Math.round(count * (interval.value / 1000))
          taskStore.updateDataAccessStatus({
            gid,
            elapsedSec,
            updatedAt: Date.now()
          })
        })

        pruneInternalMapsByTaskList(list)
      }
      function pruneInternalMapsByTaskList(list) {
        const gids = Array.isArray(list) ? list.map(t => `${t && t.gid ? t.gid : ''}`).filter(Boolean) : []
        const gidSet = new Set(gids)

        const capSet = (set, cap) => {
          if (!set || typeof set.size !== 'number' || set.size <= cap) {
            return
          }
          const over = set.size - cap
          if (over <= 0) {
            return
          }
          const it = set.values()
          for (let i = 0; i < over; i++) {
            const r = it.next()
            if (r && !r.done) {
              set.delete(r.value)
            } else {
              break
            }
          }
        }

        const pruneObj = (r) => {
          const obj = r.value || {}
          const keys = Object.keys(obj)
          // 每轮轮询都会走到这里：无键需要剔除时完全不赋值，
          // 避免每秒替换 ref 触发依赖方无谓重算（值内容本就没变）
          if (keys.length === 0 || keys.every(gid => gidSet.has(gid))) {
            return
          }
          const next = {}
          keys.forEach(gid => {
            if (gidSet.has(gid)) {
              next[gid] = obj[gid]
            }
          })
          r.value = next
        }

        pruneObj(magnetZeroMap)
        pruneObj(dataAccessZeroMap)
        pruneObj(dataAccessLastCompletedMap)

        if (magnetAlertedSet.value && magnetAlertedSet.value.size > 0) {
          Array.from(magnetAlertedSet.value).forEach(gid => {
            if (!gidSet.has(`${gid}`)) {
              magnetAlertedSet.value.delete(gid)
            }
          })
        }

        if (magnetResolvedSet.value && magnetResolvedSet.value.size > 0) {
          Array.from(magnetResolvedSet.value).forEach(gid => {
            if (!gidSet.has(`${gid}`)) {
              magnetResolvedSet.value.delete(gid)
            }
          })
        }

        if (downloadStartNotifiedGids.value && downloadStartNotifiedGids.value.size > 0) {
          Array.from(downloadStartNotifiedGids.value).forEach(gid => {
            if (!gidSet.has(`${gid}`)) {
              downloadStartNotifiedGids.value.delete(gid)
            }
          })
          capSet(downloadStartNotifiedGids.value, 2000)
        }

        if (_resumedCompletedFixedGids && _resumedCompletedFixedGids.size > 0) {
          Array.from(_resumedCompletedFixedGids).forEach(gid => {
            if (!gidSet.has(`${gid}`)) {
              _resumedCompletedFixedGids.delete(gid)
            }
          })
          capSet(_resumedCompletedFixedGids, 2000)
        }

        if (_completeNotifier.size > 0) {
          _completeNotifier.forgetGids(Array.from(gidSet))
        }
      }
      function resolveErrorReason(errorCode, errorMessage = '') {
        const code = Number(errorCode)
        if (!code) {
          return ''
        }
        const msg = `${errorMessage || ''}`
        if (code === 3) {
          return t('task.error-reason-not-found')
        }
        if (code === 1) {
          // Fake-IP 错误（代理软件）
          if (/fake-ip|198\.18\.|198\.19\./i.test(msg)) {
            return t('task.error-reason-fake-ip')
          }
          // DNS 解析错误
          if (/DNS|name resolution|hostname|getaddrinfo|no data/i.test(msg)) {
            return t('task.error-reason-dns')
          }
          // SSL/TLS 错误
          if (/SSL|TLS|certificate/i.test(msg)) {
            return t('task.error-reason-ssl')
          }
          // 连接超时
          if (/timeout|timed out/i.test(msg)) {
            return t('task.error-reason-timeout')
          }
          // 连接被拒绝
          if (/connection refused|refused/i.test(msg)) {
            return t('task.error-reason-refused')
          }
          return t('task.error-reason-network')
        }
        if (code === 14 || code === 15) {
          // 14: 重命名文件失败 / 15: 打开已存在文件失败。
          // macOS 上应用更新后 TCC 授权失效，引擎打开/重命名下载目录中的
          // 文件会返回 EPERM (Operation not permitted)，需引导用户重新授权。
          if (/operation not permitted|permission denied|not permitted/i.test(msg)) {
            return t('task.error-reason-permission')
          }
          return t('task.error-reason-disk')
        }
        if (code === 16) {
          if (/Permission denied|permission/i.test(msg)) {
            return t('task.error-reason-permission')
          }
          if (/No space left|disk full/i.test(msg)) {
            return t('task.error-reason-disk-full')
          }
          return t('task.error-reason-disk')
        }
        return t('task.error-reason-generic')
      }

      // BT任务错误恢复机制
      async function handleBtErrorRecovery(task, errorCode, errorMessage) {
        const code = Number(errorCode)
        const msg = `${errorMessage || ''}`
        const gid = task && task.gid ? `${task.gid}` : ''

        if (!gid) {
          return
        }

        // 按 gid 跟踪重试定时器：同一任务多次报错时替换旧定时器，
        // 组件销毁时统一清理，避免对已删除任务触发无效恢复
        const scheduleRetry = (delay) => {
          if (!_btRetryTimers) {
            _btRetryTimers = new Map()
          }
          const existing = _btRetryTimers.get(gid)
          if (existing) {
            clearTimeout(existing)
          }
          const timer = setTimeout(() => {
            _btRetryTimers.delete(gid)
            api.resumeTask({ gid }).catch(() => {})
          }, delay)
          _btRetryTimers.set(gid, timer)
        }

        // 针对特定错误类型的恢复策略
        switch (code) {
        case 1: // 网络错误
          if (/timeout|timed out/i.test(msg)) {
            // 连接超时，等待后重试
            console.log(`[Lerxu] BT task ${gid} timeout, will retry in 10 seconds`)
            scheduleRetry(10000)
          } else if (/connection refused|refused/i.test(msg)) {
            // 连接被拒绝，可能是tracker问题，稍后重试
            console.log(`[Lerxu] BT task ${gid} connection refused, will retry in 30 seconds`)
            scheduleRetry(30000)
          }
          break

        case 14: // 重命名文件失败
        case 15: // 打开已存在文件失败
          if (/operation not permitted|permission denied|not permitted/i.test(msg)) {
            // macOS TCC 授权在应用更新（签名变化）后失效，打开下载目录文件
            // 返回 EPERM。盲目 60s 重试无效，改为低频重试（用户授权后自动恢复），
            // 并按 gid 去重提示一次授权指引。
            const isDarwin = process.platform === 'darwin'
            if (isDarwin) {
              // 先尝试自动修复：清除旧实例文件上的 com.apple.provenance 等
              // 来源属性（必要时复制重建文件），修复成功后立即重试任务，
              // 无需用户手动处理。
              const failedPath = extractOpenFailedFilePath(msg)
              let repaired = false
              if (failedPath) {
                repaired = await tryRepairDownloadFilePermission(gid, failedPath)
              }
              if (repaired) {
                console.log(`[Lerxu] BT task ${gid} file permission repaired, resuming now`)
                scheduleRetry(2000)
                break
              }
              if (!_permNotifiedGids) {
                _permNotifiedGids = new Set()
              }
              if (!_permNotifiedGids.has(gid)) {
                _permNotifiedGids.add(gid)
                msg.warning(t('task.error-reason-permission-macos'))
              }
            } else {
              msg.warning(t('task.error-reason-permission'))
            }
            console.log(`[Lerxu] BT task ${gid} permission denied, will retry in 120 seconds`)
            scheduleRetry(120000)
          } else if (/No space left|disk full/i.test(msg)) {
            msg.warning('磁盘空间不足，请清理磁盘空间后重新开始下载')
          }
          break

        case 16: // 文件系统错误
          if (/No space left|disk full/i.test(msg)) {
            msg.warning('磁盘空间不足，请清理磁盘空间后重新开始下载')
          } else if (/Permission denied|permission/i.test(msg)) {
            msg.warning('文件权限错误，请检查下载目录权限')
          }
          break

        default:
          // 其他错误，短时间后重试
          if (code > 0) {
            console.log(`[Lerxu] BT task ${gid} error ${code}, will retry in 60 seconds`)
            scheduleRetry(60000)
          }
        }
      }
      function stopPolling() {
        clearTimeout(timer)
        timer = null
      }
      async function fixResumedCompletedSuffixTasks() {
        const cfg = preferenceConfig.value || {}
        const suffix = cfg.downloadingFileSuffix || ''
        if (!suffix) {
          return
        }

        const now = Date.now()
        if (_resumedCompletedFixing) {
          return
        }
        if (_resumedCompletedLastRun && now - _resumedCompletedLastRun < 5000) {
          return
        }
        _resumedCompletedLastRun = now

        const list = taskStore.taskList || []
        const activeStatuses = new Set([TASK_STATUS.ACTIVE, TASK_STATUS.WAITING, TASK_STATUS.PAUSED])
        const history = taskHistory.getHistory()
        if (!Array.isArray(history) || history.length === 0) {
          return
        }
        const historyMap = new Map(history.map(t => [`${t.gid || ''}`, t]))

        const candidates = list.filter(t => {
          if (!t) return false
          const gid = t.gid ? `${t.gid}` : ''
          if (!gid) return false
          if (!activeStatuses.has(`${t.status || ''}`)) return false
          // 「一对音视频」折叠记录不在这里修：记录的总长/已完成是两条流**求和**
          // 出来的（单看数字判不出某一条流的状态），而且配对流程有自己的一套
          // 完成判定与合并收尾，误判会把还在下的那条流从引擎里摘掉
          if (t.isPair) return false
          if (checkTaskIsBT(t)) return false
          if (isMagnetTask(t)) return false
          const p = getTaskFullPath(t) || ''
          if (!p) return false
          return p.endsWith(suffix) || existsSync(`${p}${suffix}`)
        })

        if (candidates.length === 0) {
          return
        }

        _resumedCompletedFixing = true
        try {
          let changed = false
          for (const task of candidates) {
            const gid = task.gid ? `${task.gid}` : ''
            if (!gid) continue
            if (_resumedCompletedFixedGids && _resumedCompletedFixedGids.has(gid)) {
              continue
            }

            const historyTask = historyMap.get(gid)
            if (!historyTask || `${historyTask.status || ''}` !== TASK_STATUS.COMPLETE) {
              continue
            }

            const total = Number(task.totalLength || historyTask.totalLength || 0)
            const completed = Number(task.completedLength || historyTask.completedLength || 0)
            const doneByNumbers = Number.isFinite(total) && total > 0 && Number.isFinite(completed) && completed >= total

            let doneByDisk = false
            if (Number.isFinite(total) && total > 0) {
              const actual = getTaskActualPath(task, cfg)
              if (actual && existsSync(actual)) {
                try {
                  const st = statSync(actual)
                  doneByDisk = st && typeof st.size === 'number' && st.size >= total
                } catch (_) {}
              }
            }

            if (!doneByNumbers && !doneByDisk) {
              continue
            }

            if (!_resumedCompletedFixedGids) {
              _resumedCompletedFixedGids = new Set()
            }
            _resumedCompletedFixedGids.add(gid)

            try {
              // 检查是否为元数据任务 - 这些任务不应该保存到历史记录
              const taskName = historyTask && historyTask.name ? `${historyTask.name}` : ''
              const isMetadataTask = taskName.startsWith('[METADATA]')
              if (!isMetadataTask) {
                taskHistory.updateTask(gid, { ...historyTask, status: TASK_STATUS.COMPLETE }, historyTask)
              }
            } catch (_) {}

            try {
              await api.forceRemoveTask({ gid })
            } catch (_) {
              try {
                await api.removeTask({ gid })
              } catch (_) {}
            }
            try {
              await api.saveSession()
            } catch (_) {}
            changed = true
          }

          if (changed) {
            await taskStore.fetchList()
          }
        } finally {
          _resumedCompletedFixing = false
        }
      }
      async function fixResumedErroredTasks() {
        // 引擎通过 save-session 保存 error/unfinished 下载，应用重启后
        // 引擎会把已失败的任务恢复为 waiting 并重新开始下载（或恢复为
        // paused）。这里把历史记录为 error 且引擎仍在队列中的任务移除，
        // 保持 error 状态。注意：不能读 taskList——_mergeHistoryToTasks
        // 已把这类任务强制显示为 error，会漏掉真正的候选。
        const now = Date.now()
        if (_resumedErrorFixing) {
          return
        }
        if (_resumedErrorLastRun && now - _resumedErrorLastRun < 5000) {
          return
        }
        _resumedErrorLastRun = now

        const history = taskHistory.getHistory()
        if (!Array.isArray(history) || history.length === 0) {
          return
        }
        const errorGidSet = new Set()
        history.forEach(t => {
          if (t && t.gid && `${t.status || ''}` === TASK_STATUS.ERROR) {
            errorGidSet.add(`${t.gid}`)
          }
        })
        if (errorGidSet.size === 0) {
          return
        }

        // 直接查询引擎的原始 active/waiting 列表（含 paused）
        let engineTasks = []
        try {
          const [active, waiting] = await Promise.all([
            api.client.call('tellActive').catch(() => []),
            api.client.call('tellWaiting', 0, 1000).catch(() => [])
          ])
          engineTasks = [
            ...(Array.isArray(active) ? active : []),
            ...(Array.isArray(waiting) ? waiting : [])
          ]
        } catch (_) {
          return
        }

        const candidates = engineTasks.filter(t => {
          if (!t) return false
          const gid = t.gid ? `${t.gid}` : ''
          if (!gid || !errorGidSet.has(gid)) return false
          // BT 任务有自己的错误恢复机制（handleBtErrorRecovery），
          // 会话内重试期间任务同样处于 active 但历史为 error，不能移除
          if (checkTaskIsBT(t)) return false
          return true
        })

        if (candidates.length === 0) {
          return
        }

        _resumedErrorFixing = true
        try {
          let changed = false
          for (const task of candidates) {
            const gid = task.gid ? `${task.gid}` : ''
            if (!gid) continue
            if (_resumedErrorFixedGids && _resumedErrorFixedGids.has(gid)) {
              continue
            }
            if (!_resumedErrorFixedGids) {
              _resumedErrorFixedGids = new Set()
            }
            _resumedErrorFixedGids.add(gid)

            console.log(`[Lerxu] Stopping auto-resumed errored task ${gid} (engine status: ${task.status || ''})`)
            // 从引擎队列移除（不删除文件），保留本地历史记录，
            // 任务将以 error 状态从历史记录中恢复显示
            try {
              await api.client.call('forceRemove', gid)
            } catch (_) {
              try {
                await api.client.call('remove', gid)
              } catch (_) {}
            }
            try {
              await api.client.call('removeDownloadResult', gid)
            } catch (_) {}
            changed = true
          }

          if (changed) {
            await taskStore.fetchList()
          }
        } finally {
          _resumedErrorFixing = false
        }
      }
// --- Lifecycle ---
onMounted(() => {
      if (isPreferenceWindow()) {
        return
      }
      // 重启后立即恢复"待选择文件"持久化状态：
      // 否则首帧渲染时任务会按引擎状态显示为普通暂停，
      // 进度条/文案的待选择区分要等到后续同步才生效。
      taskStore.loadPendingFileSelection()

      // 绑定引擎推送事件（onDownloadStart 等），
      // 必须在轮询启动前完成，否则任务开始/完成等事件无法驱动即时刷新
      bindEngineEvents()
      api.client.on('reconnect', onEngineReconnect)

      // 保存定时器句柄，防止组件在 100ms 内被销毁后轮询"复活"
      _bootTimer = setTimeout(() => {
        _bootTimer = null
        // 引擎启动早期可能尚未就绪（主进程 RPC 走 HTTP 兜底），
        // 获取失败不应产生未捕获的 Promise 异常，静默降级即可
        appStore.fetchEngineInfo().catch((err) => {
          console.warn('[Lerxu] fetch engine info failed:', err && err.message ? err.message : err)
        })
        appStore.fetchEngineOptions()

        startPolling()
      }, 100)

      _visibilityHandler = () => {
        maybeEnterIdleInterval()
        if (typeof document !== 'undefined' && document && !document.hidden) {
          kickPolling()
        }
      }
      if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', _visibilityHandler)
      }
})

// 播放器"边下边播"时要这个任务的**当前下载速度**（宿主用它和播放消耗比对，
// 判断还能不能顺畅播下去）。主窗口本来就每秒同步任务列表，直接回报即可 ——
// 主进程不必再单独建一条查引擎的通道。
ipcRenderer.on('playback:query-speed', (_e, payload = {}) => {
  try {
    const gid = payload && payload.gid ? `${payload.gid}` : ''
    if (!gid) {
      return
    }
    // 「一对音视频」折叠成一条记录，播放的是**画面流**那一条：记录按成员 gid
    // 也要能命中，且要取成员自己的速度（记录上的速度是两条流之和，会偏高）
    const task = (taskStore.taskList || []).find(t => t && (`${t.gid}` === gid ||
      (Array.isArray(t.pairGids) && t.pairGids.some(g => `${g}` === gid))))
    const member = task && Array.isArray(task.pairMembers)
      ? task.pairMembers.find(m => m && `${m.gid}` === gid)
      : null
    const speedSource = member || task
    ipcRenderer.send('playback:report-speed', {
      gid,
      speed: speedSource ? Number(speedSource.downloadSpeed) || 0 : 0
    })
  } catch (_) {}
})

onUnmounted(() => {
      if (isPreferenceWindow()) {
        return
      }
      if (_bootTimer) {
        clearTimeout(_bootTimer)
        _bootTimer = null
      }
      if (_btRetryTimers && _btRetryTimers.size > 0) {
        _btRetryTimers.forEach((timer) => {
          clearTimeout(timer)
        })
        _btRetryTimers.clear()
      }
      clearAllMergeRetryTimers()
      // 还在跑的合并进程一并收掉：`zuvrust mux` 正常会自己退出，但组件卸载
      // （切换页面 / 退出应用）时仍有在跑的必须主动终止，不能让引擎进程留下。
      for (const child of _activeMuxChildren) {
        try { child.kill('SIGKILL') } catch (_) {}
      }
      _activeMuxChildren.clear()
      taskStore.saveSession()

      unbindEngineEvents()
      api.client.removeListener('reconnect', onEngineReconnect)

      stopPolling()

      if (_visibilityHandler && typeof document !== 'undefined' && document && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', _visibilityHandler)
      }
})

</script>

<style>
 </style>
