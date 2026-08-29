<template>
  <div v-if="false"></div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import { existsSync, renameSync, mkdirSync, utimesSync, statSync, readdirSync, unlinkSync, copyFileSync, writeFileSync } from 'node:fs'
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
  clearAllMergeRetryTimers
} from '@/utils/mergeRetryManager'

defineOptions({ name: 'mo-engine-client' })

const { t } = i18n.global
const msg = createMsg(ElMessage, { showClose: true })
const route = useRoute()
const router = useRouter()

const appStore = useAppStore()
const taskStore = useTaskStore()
const preferenceStore = usePreferenceStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)
const { stat, interval, progress } = storeToRefs(appStore)
const { seedingList, taskDetailVisible, enabledFetchPeers, currentTaskGid, currentTaskItem } = storeToRefs(taskStore)

// Computed from app store
const uploadSpeed = computed(() => appStore.stat.uploadSpeed)
const downloadSpeed = computed(() => appStore.stat.downloadSpeed)
const speed = computed(() => appStore.stat.uploadSpeed + appStore.stat.downloadSpeed)
const downloading = computed(() => appStore.stat.numActive > 0)
// Computed from preference store
const taskNotification = computed(() => preferenceConfig.value.taskNotification)
const taskCompleteNotifyClickAction = computed(() => preferenceConfig.value.taskCompleteNotifyClickAction || 'open-folder')

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
let _bilibiliMergeNotified = new Set()
let _dashMergeJobs = new Map()
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
                const key = buildBrowserStartNotifyKey(task, cfg)
                if (!_browserStartNotifiedKeys) {
                  _browserStartNotifiedKeys = new Map()
                }
                const now = Date.now()
                const windowMs = 10000
                let shouldNotify = true
                if (key) {
                  const prev = Number(_browserStartNotifiedKeys.get(key) || 0)
                  if (prev && (now - prev) < windowMs) {
                    shouldNotify = false
                  }
                  _browserStartNotifiedKeys.set(key, now)
                  if (_browserStartNotifiedKeys.size > 500) {
                    for (const [k, t] of _browserStartNotifiedKeys.entries()) {
                      if (!t || (now - Number(t)) > (windowMs * 3)) {
                        _browserStartNotifiedKeys.delete(k)
                      }
                    }
                  }
                }
                if (shouldNotify) {
                  const message = t('task.download-start-browser-message')
                  msg.info(message)
                  if (is.windows()) {
                    showNativeNotification({
                      title: message,
                      body: taskName,
                      onClick: () => {
                        ipcRenderer.send('command', 'application:show', { page: 'index' })
                      }
                    })
                  }
                }
              } else if (!isBilibiliPart) {
                const message = t('task.download-start-message', { taskName })
                msg.info(message)
              }
            } catch (_) {
              if (fromHistory) {
                const key = buildBrowserStartNotifyKey(task, cfg)
                if (!_browserStartNotifiedKeys) {
                  _browserStartNotifiedKeys = new Map()
                }
                const now = Date.now()
                const windowMs = 10000
                let shouldNotify = true
                if (key) {
                  const prev = Number(_browserStartNotifiedKeys.get(key) || 0)
                  if (prev && (now - prev) < windowMs) {
                    shouldNotify = false
                  }
                  _browserStartNotifiedKeys.set(key, now)
                  if (_browserStartNotifiedKeys.size > 500) {
                    for (const [k, t] of _browserStartNotifiedKeys.entries()) {
                      if (!t || (now - Number(t)) > (windowMs * 3)) {
                        _browserStartNotifiedKeys.delete(k)
                      }
                    }
                  }
                }
                if (shouldNotify) {
                  const message = t('task.download-start-browser-message')
                  msg.info(message)
                  if (is.windows()) {
                    showNativeNotification({
                      title: message,
                      body: taskName,
                      onClick: () => {
                        ipcRenderer.send('command', 'application:show', { page: 'index' })
                      }
                    })
                  }
                }
              } else if (!isBilibiliPart) {
                const message = t('task.download-start-message', { taskName })
                msg.info(message)
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
            const link = `<a target="_blank" href="https://github.com/agalwood/Motrix/wiki/Error#${errorCode}" rel="noopener noreferrer">${errorCode}</a>`

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
        if (!isBilibiliPart) {
          const notifyPath = finalPath || path
          showTaskCompleteNotify(task, isBT, notifyPath)
          ipcRenderer.send('event', 'task-download-complete', task, notifyPath)
        }
        setFileMtimeOnComplete(task, finalPath)

        // 如果需要合并（Bilibili DASH 分段视频），先设置 MERGING 状态
        const mergeGid = task && task.gid ? `${task.gid}` : ''
        const mergeKey = getDashMergeKey(finalPath, cfg)
        if (isBilibiliPart && mergeGid) {
          taskStore.addToMergingList({ gid: mergeGid, mergeKey })
          taskStore.setTaskStatus({ gid: mergeGid, status: TASK_STATUS.MERGING })
        }

        // 合并开始前，清除所有相关任务的等待配对状态
        if (isBilibiliPart && mergeKey) {
          taskStore.clearMergeProgressByMergeKey(mergeKey)
        }

        const mergeResult = await runDashMergeExclusive(mergeKey, () => {
          return maybeMergeBilibiliDash(finalPath, task)
        })

        // 等待配对文件时，设置等待提示并启动重试机制
        if (mergeResult && mergeResult.waitingForPair && mergeGid) {
          taskStore.setMergeProgress({
            gid: mergeGid,
            progress: { waitingForPair: true }
          })
          // 启动重试：前5次每3秒，之后每10秒，最多重试60次（约10分钟）
          // 重试耗尽后仍保留 MERGING 状态，等配对文件完成时被动触发合并
          _scheduleMergeRetry(mergeGid, mergeKey, finalPath, task, isBT, cfg, 0, 60)
        }

        // 合并完成后，通过 mergeKey 清理所有相关任务并恢复 COMPLETE 状态
        if (isBilibiliPart && mergeGid && !(mergeResult && mergeResult.waitingForPair)) {
          taskStore.removeAllMergingByMergeKey(mergeKey)
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
          let shouldNotify = true
          if (isBilibiliPart || (mergeResult && mergeResult.isBilibiliPart)) {
            try {
              const key = resolve(mergeResult.mergedPath)
              if (!_bilibiliMergeNotified) {
                _bilibiliMergeNotified = new Set()
              }
              if (_bilibiliMergeNotified.has(key)) {
                shouldNotify = false
              } else {
                _bilibiliMergeNotified.add(key)
              }
            } catch (_) {}
          }
          if (shouldNotify) {
            const notifyPath = mergeResult.mergedPath
            showTaskCompleteNotify(task, isBT, notifyPath)
            ipcRenderer.send('event', 'task-download-complete', task, notifyPath)
          }
        } else if (mergeResult && mergeResult.isBilibiliPart && mergeResult.noFfmpeg) {
          try {
            const gidKey = task && task.gid ? `${task.gid}` : ''
            if (!_extensionDashNoFfmpegNotified) {
              _extensionDashNoFfmpegNotified = new Set()
            }
            if (!gidKey || !_extensionDashNoFfmpegNotified.has(gidKey)) {
              if (gidKey) {
                _extensionDashNoFfmpegNotified.add(gidKey)
              }
              const notifyPath = mergeResult.fallbackNotifyPath || finalPath || path
              showTaskCompleteNotify(task, isBT, notifyPath)
              ipcRenderer.send('event', 'task-download-complete', task, notifyPath)
            }
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
      function buildBrowserStartNotifyKey(task, cfg) {
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          const config = cfg && typeof cfg === 'object' ? cfg : (preferenceConfig.value || {})
          const suffix = config && config.downloadingFileSuffix ? `${config.downloadingFileSuffix}` : ''
          const p = getTaskActualPath(task, config) || ''
          const raw = p ? basename(p) : ''
          const file0 = suffix ? stripDownloadingSuffixFromFilename(raw, suffix) : raw
          const file = stripDuplicateNumberBeforeExtension(file0)
          const lower = file.toLowerCase()
          const isPairLike =
            lower.endsWith('_video.mp4') ||
            lower.endsWith('_audio.m4a') ||
            /\.m4s$/i.test(file) ||
            /(video\s*stream|audio\s*stream|videostream|audiostream|视频流|音频流)/i.test(file)
          if (!isPairLike) {
            return gid
          }
          const stem = normalizeDashStemFromFilename(file)
          const dir = p ? dirname(p) : ''
          if (!stem || !dir) {
            return gid
          }
          return `${resolve(dir)}|${stem}`
        } catch (_) {
          return ''
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
      function findFirstExistingPath(paths) {
        try {
          const arr = Array.isArray(paths) ? paths : []
          for (const p of arr) {
            if (p && existsSync(p)) return p
          }
        } catch (_) {}
        return ''
      }
      function resolveFfmpegPath() {
        const candidates = []
        const ffmpegExeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

// 检查用户数据目录中的 ffmpeg
try {
const userDataPath = app.getPath('userData')
          candidates.push(resolve(userDataPath, 'ffmpeg', ffmpegExeName))
        } catch (_) {}

// 检查应用安装目录（通过 exe 路径获取）
try {
const exePath = app.getPath('exe')
          const appDir = dirname(exePath)
          candidates.push(resolve(appDir, ffmpegExeName))
        } catch (_) {}

        // 检查应用资源目录中的 ffmpeg
        try {
          const rp = process && process.resourcesPath ? `${process.resourcesPath}` : ''
          if (rp) {
            candidates.push(
              resolve(rp, ffmpegExeName),
              resolve(rp, 'ffmpeg-8.0.1-essentials_build', 'bin', ffmpegExeName),
              resolve(rp, 'ffmpeg-8.0.1-essentials_build', ffmpegExeName)
            )
          }
        } catch (_) {}

        // 检查系统 PATH 中的 ffmpeg
        candidates.push('ffmpeg')
        return candidates.find(p => (p === 'ffmpeg' ? checkSystemFfmpeg() : existsSync(p))) || ''
      }
      function checkSystemFfmpeg() {
        try {
          const result = spawnSync('ffmpeg', ['-version'], { windowsHide: true, timeout: 5000 })
          return result.status === 0
        } catch (_) {
          return false
        }
      }
      async function ensureFfmpeg() {
        // 检查是否已有 ffmpeg
        const existingPath = resolveFfmpegPath()
        if (existingPath) {
          return existingPath
        }

// 检查用户是否已经取消过提示
const userDataPath = app.getPath('userData')
        const skipFlagPath = resolve(userDataPath, '.ffmpeg-skip')
        if (existsSync(skipFlagPath)) {
          return ''
        }

        // 提示用户需要手动安装 FFmpeg
        msg.warning(t('task.ffmpeg-required-manual'))

// 记录已提示，避免重复提示
try {
writeFileSync(skipFlagPath, '1')
        } catch (_) {}

        return ''
      }
      function getDashMergeKey(filePath, cfg) {
        try {
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
      function _scheduleMergeRetry(mergeGid, mergeKey, finalPath, task, isBT, cfg, attempt, maxAttempts) {
        // 清除已有的重试定时器
        clearMergeRetryTimer(mergeGid)
        // 检查任务是否还在合并列表中（可能已被用户删除或已合并完成）
        const { mergingList } = taskStore
        if (!mergingList.includes(mergeGid)) {
          return
        }
        if (attempt >= maxAttempts) {
          // 超过最大重试次数，不再主动重试，但仍保留在 mergingList 中。
          // 当配对文件下载完成时会通过 onDownloadComplete 再次触发合并，
          // 避免因两个文件下载完成时间差过大而跳过合并。
          console.warn(`[Lerxu] Merge retry exhausted for ${mergeGid} after ${maxAttempts} attempts, keeping MERGING state for passive merge`)
          return
        }
        // 指数退避：前5次每3秒，之后每10秒，确保长时间下载也能等到配对
        const delay = attempt < 5 ? 3000 : 10000
        const timer = setTimeout(async () => {
          clearMergeRetryTimer(mergeGid)
          // 再次检查任务是否还在合并列表中
          if (!taskStore.mergingList.includes(mergeGid)) {
            return
          }
          // 重新扫描配对文件
          try {
            const retryResult = await runDashMergeExclusive(mergeKey, () => {
              return maybeMergeBilibiliDash(finalPath, task)
            })
            if (retryResult && retryResult.mergedPath) {
              // 合并成功
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
              showTaskCompleteNotify(task, isBT, retryResult.mergedPath)
              ipcRenderer.send('event', 'task-download-complete', task, retryResult.mergedPath)
            } else if (retryResult && retryResult.waitingForPair) {
              // 仍然等待配对，继续重试
              _scheduleMergeRetry(mergeGid, mergeKey, finalPath, task, isBT, cfg, attempt + 1, maxAttempts)
            } else {
              // 合并失败（非等待配对），清理并标记完成
              taskStore.removeAllMergingByMergeKey(mergeKey)
              taskStore.setTaskStatus({ gid: mergeGid, status: TASK_STATUS.COMPLETE })
              taskStore.fetchList()
            }
          } catch (e) {
            console.warn(`[Lerxu] Merge retry ${attempt + 1} failed:`, e)
            _scheduleMergeRetry(mergeGid, mergeKey, finalPath, task, isBT, cfg, attempt + 1, maxAttempts)
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
      function runFfmpegMux(ffmpegPath, videoPath, audioPath, outputPath, progressGid = '') {
        return new Promise((resolve, reject) => {
          const cmd = ffmpegPath || ''
          const args = [
            '-y',
            '-hide_banner',
            '-loglevel', 'error'
          ]
          if (progressGid) {
            args.push('-progress', 'pipe:1')
          }
          args.push(
            '-i', videoPath,
            '-i', audioPath,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c', 'copy',
            '-shortest',
            outputPath
          )
          const child = spawn(cmd, args, { windowsHide: true })
          let stderr = ''
          let progressBuffer = ''
          let totalInputSize = 0
          if (progressGid) {
            try {
              const vStat = statSync(videoPath)
              const aStat = statSync(audioPath)
              totalInputSize = (vStat.size || 0) + (aStat.size || 0)
            } catch (_) {}
            child.stdout.on('data', (d) => {
              progressBuffer += d.toString('utf8')
              const lines = progressBuffer.split('\n')
              progressBuffer = lines.pop() || ''
              const kv = {}
              for (const line of lines) {
                const m = line.match(/^(\w+)=(.*)$/)
                if (m) kv[m[1]] = m[2]
              }
              if (kv.progress === 'continue' || kv.progress === 'end') {
                const totalSize = parseInt(kv.total_size || '0', 10)
                const speed = parseFloat(kv.speed || '0')
                const percent = totalInputSize > 0 ? Math.min(100, Math.round(totalSize / totalInputSize * 100)) : 0
                taskStore.setMergeProgress({
                  gid: progressGid,
                  progress: { percent, totalSize, speed }
                })
              }
            })
          }
          child.stderr.on('data', (d) => { stderr += d.toString('utf8') })
          child.on('error', (err) => reject(err))
          child.on('close', (code) => {
            if (code === 0) {
              resolve(true)
              return
            }
            const msg = (stderr || '').trim() || `ffmpeg exit ${code}`
            reject(new Error(msg))
          })
        })
      }
      async function validateDashMergeOutput(ffmpegPath, outputPath) {
        if (!outputPath || !existsSync(outputPath)) {
          return false
        }
        return new Promise((resolve) => {
          let settled = false
          const done = (result) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve(result)
          }
          const child = spawn(ffmpegPath, [
            '-hide_banner',
            '-i', outputPath,
            '-map', '0:v:0',
            '-map', '0:a:0',
            '-c', 'copy',
            '-f', 'null',
            '-'
          ], { windowsHide: true })
          const timer = setTimeout(() => {
            try { child.kill('SIGKILL') } catch (_) {}
            done(false)
          }, 30000)
          child.on('error', () => done(false))
          child.on('close', (code) => done(code === 0))
        })
      }
      async function mergeDashToOutput(ffmpegPath, videoPath, audioPath, outputPath, progressGid = '') {
        const tempPath = resolve(dirname(outputPath), `.${basename(outputPath)}.lerxu-merging-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`)
        try {
          try {
            await runFfmpegMux(ffmpegPath, videoPath, audioPath, tempPath, progressGid)
          } catch (firstError) {
            try {
              if (existsSync(tempPath)) unlinkSync(tempPath)
            } catch (_) {}
            await runFfmpegMux(ffmpegPath, audioPath, videoPath, tempPath, progressGid)
          }
          if (!await validateDashMergeOutput(ffmpegPath, tempPath)) {
            throw new Error('Merged DASH output does not contain both video and audio streams')
          }
          if (existsSync(outputPath)) {
            throw new Error(`DASH merge output already exists: ${outputPath}`)
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
        for (let i = 0; i < 1000; i++) {
          const rand = Math.random().toString(36).slice(2, 10)
          const candidate = resolve(dir, `.lerxu-merging-${rand}.mp4`)
          if (!inputs.has(candidate) && !existsSync(candidate)) {
            return candidate
          }
        }
        const fallback = resolve(dir, `.lerxu-merging-${Date.now()}.mp4`)
        return fallback
      }
      function forceDeleteFileSync(filePath) {
        if (!filePath) return false
        let full = ''
        try { full = resolve(filePath) } catch (_) { full = `${filePath}` }
        if (!full) return false
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            if (existsSync(full)) {
              unlinkSync(full)
            }
            if (!existsSync(full)) return true
          } catch (_) {
            try {
              execSync(`rm -f "${full.replace(/"/g, '\\"')}"`, { stdio: 'ignore' })
            } catch (_) {}
          }
          if (!existsSync(full)) return true
          if (attempt < 9) {
            try { const end = Date.now() + 80; while (Date.now() < end); } catch (_) {}
          }
        }
        return !existsSync(full)
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
      async function maybeMergeBilibiliDash(finalPath, task = null) {
        const info = parseBilibiliDashPart(finalPath)
        if (!info) {
          return await maybeMergeExtensionDash(finalPath, task)
        }
        const cfg = preferenceConfig.value || {}
        const { dir, base, type } = info

        if (type === 'm4s') {
          let entries = []
          try {
            entries = readdirSync(dir) || []
          } catch (_) {
            entries = []
          }
          const group = entries
            .filter(name => {
              const s = `${name || ''}`
              if (!s.toLowerCase().endsWith('.m4s')) return false
              return s.startsWith(`${base}-`)
            })
            .sort()
          if (group.length < 2) {
            // 配对文件尚未出现，返回 waitingForPair 以便重试机制继续等待
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }
          const parts = group.map(name => {
            const full = resolve(dir, name)
            let ready = false
            try {
              const exists = existsSync(full)
              let ariaExists = false
              try {
                ariaExists = existsSync(`${full}.xfer`)
              } catch (_) {}
              ready = exists && !ariaExists
            } catch (_) {}
            return { name, path: full, ready }
          })
          const readyParts = parts.filter(p => p && p.ready)
          if (readyParts.length < 2) {
            const ffmpegPath = resolveFfmpegPath()
            if (!ffmpegPath) {
              const notifyKey = `${dir || ''}|${base || ''}`
              const fallbackNotifyPath = finalPath || ''
              return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
            }
            return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
          }
          const videoPath = readyParts[0].path
          const audioPath = readyParts[1].path
          const ffmpegPath = await ensureFfmpeg()
          if (!ffmpegPath) {
            const notifyKey = `${dir || ''}|${base || ''}`
            const fallbackNotifyPath = finalPath || ''
            return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
          }
          const outputBase = stripDashSequenceSuffix(base)
          const outputPath = getDashMergeOutputPath(dir, outputBase, [videoPath, audioPath])
          if (!outputPath) {
            return { isBilibiliPart: true, mergedPath: '' }
          }
          try {
            await mergeDashToOutput(ffmpegPath, videoPath, audioPath, outputPath, task && task.gid ? `${task.gid}` : '')
            const finalOutputPath = await afterBilibiliMerge(task, info, videoPath, audioPath, outputPath)
            return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
          } catch (e) {
            console.warn(`[Lerxu] FFmpeg merge failed: ${e && e.message ? e.message : e}`)
            return { isBilibiliPart: true, mergedPath: '' }
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

        const videoPath = findFirstExistingPath(videoCand)
        const audioPath = findFirstExistingPath(audioCand)

        if (!videoPath || !audioPath) {
          const ffmpegPath = resolveFfmpegPath()
          if (!ffmpegPath) {
            const notifyKey = `${dir || ''}|${base || ''}`
            const fallbackNotifyPath = finalPath || ''
            return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
          }
          return { isBilibiliPart: true, mergedPath: '', waitingForPair: true }
        }

        const outputDir = dirname(videoPath || finalPath || rootDir || dir)
        const outputBase = stripDashSequenceSuffix(base)
        const outputPath = getDashMergeOutputPath(outputDir, outputBase, [videoPath, audioPath])
        if (!outputPath) {
          return { isBilibiliPart: true, mergedPath: '' }
        }

        const ffmpegPath = await ensureFfmpeg()
        if (!ffmpegPath) {
          const notifyKey = `${outputDir || ''}|${base || ''}`
          const fallbackNotifyPath = finalPath || ''
          return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
        }

        try {
          await mergeDashToOutput(ffmpegPath, videoPath, audioPath, outputPath, task && task.gid ? `${task.gid}` : '')
          const finalOutputPath = await afterBilibiliMerge(task, info, videoPath, audioPath, outputPath)
          return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
        } catch (e) {
          console.warn(`[Lerxu] FFmpeg merge failed: ${e && e.message ? e.message : e}`)
          return { isBilibiliPart: true, mergedPath: '' }
        }
      }
      async function maybeMergeExtensionDash(finalPath, task = null) {
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
          const pair = collectExtensionDashParts(finalPath, cfg)
          if (!pair || !pair.isPairCandidate) {
            return { isBilibiliPart: false, mergedPath: '' }
          }

          if (!fromSupportedSource) {
            const taskUri = getTaskUri(task)
            const uriLooksBilibili = /^https?:\/\/(?:[^/]+\.)?(?:bilivideo\.com|bilibili\.com)(?=[:/]|$)/i.test(`${taskUri || ''}`)
            if (!uriLooksBilibili) {
              return { isBilibiliPart: false, mergedPath: '' }
            }
          }

          try {
            const downloadingFileSuffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
            if (downloadingFileSuffix && Array.isArray(pair.parts)) {
              for (const part of pair.parts) {
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

          const ready = (pair.parts || []).filter(p => p && !p.pending && p.diskPath && existsSync(p.diskPath))
          if (ready.length < 2) {
            const ffmpegPath = resolveFfmpegPath()
            if (!ffmpegPath) {
              const notifyKey = `${pair.dir || ''}|${pair.stem || ''}`
              const fallbackNotifyPath = finalPath || ''
              return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
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

          const outputBase = stripDashSequenceSuffix(pair.stem)
          const outputPath = getDashMergeOutputPath(pair.dir, outputBase, [videoPath, audioPath])
          if (!outputPath) {
            return { isBilibiliPart: true, mergedPath: '' }
          }

          const ffmpegPath = await ensureFfmpeg()
          if (!ffmpegPath) {
            const notifyKey = `${pair.dir || ''}|${pair.stem || ''}`
            const fallbackNotifyPath = finalPath || ''
            return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
          }

          try {
            await mergeDashToOutput(ffmpegPath, videoPath, audioPath, outputPath, task && task.gid ? `${task.gid}` : '')
            const info = { dir: pair.dir, base: pair.stem, type: 'named' }
            const finalOutputPath = await afterBilibiliMerge(task, info, videoPath, audioPath, outputPath)
            return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
          } catch (e) {
            console.warn(`[Lerxu] FFmpeg merge failed: ${e && e.message ? e.message : e}`)
            return { isBilibiliPart: true, mergedPath: '' }
          }
        } catch (_) {
          return { isBilibiliPart: false, mergedPath: '' }
        }
      }
      async function afterBilibiliMerge(task, info, videoPath, audioPath, outputPath) {
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
          let targetExt = '.mp4'
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
              if (fmt && allowed.includes(fmt)) {
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
                    const ffmpegPath = resolveFfmpegPath()
                    if (ffmpegPath) {
                      const remuxOk = await new Promise((resolve) => {
                        const child = spawn(ffmpegPath, [
                          '-y',
                          '-hide_banner',
                          '-loglevel', 'error',
                          '-i', outputPath,
                          '-c', 'copy',
                          finalTarget
                        ], { windowsHide: true })
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

          // 检查是否为元数据任务 - 这些任务不应该保存到历史记录
          const taskName = task && task.name ? `${task.name}` : ''
          const isMetadataTask = taskName.startsWith('[METADATA]')
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
      function showTaskErrorNotify(task) {
        const taskName = getTaskName(task)

        const message = t('task.download-fail-message', { taskName })
        msg.error(message)

        if (!taskNotification.value) {
          return
        }

        showNativeNotification({
          title: t('task.download-fail-notify'),
          body: taskName
        })
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
        }, interval.value)
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
      function maybeRestoreSuffixNearCompletion(task) {
        try {
          const suffix = preferenceConfig.value.downloadingFileSuffix
          if (!suffix) return
          const isBT = checkTaskIsBT(task)
          if (isBT) return
          const total = Number(task.totalLength || 0)
          const done = Number(task.completedLength || 0)
          if (total <= 0) return
          const ratio = done / total
          if (ratio < 0.99) return
          const finalPath = getTaskFullPath(task)
          const suffixedPath = finalPath + suffix
          if (existsSync(suffixedPath) && !existsSync(finalPath)) {
            const ok = renamePreserveTimes(suffixedPath, finalPath)
            if (ok) {
              console.log(`[Lerxu] Restored suffix near completion: ${suffixedPath} -> ${finalPath}`)
              cleanupAria2ControlFiles([suffixedPath, finalPath])
            }
          }
        } catch (_) {}
      }
      function restoreSuffixFilesForActiveTasks() {
        const suffix = preferenceConfig.value.downloadingFileSuffix
        if (!suffix) {
          return
        }

        api.fetchTaskList({ type: 'all' }).then((tasks) => {
          tasks.forEach(task => {
            if ([TASK_STATUS.COMPLETE, TASK_STATUS.ERROR, TASK_STATUS.REMOVED].includes(task.status)) {
              return
            }

            if (checkTaskIsBT(task)) {
              return
            }

            try {
              const finalPath = getTaskFullPath(task)
              const suffixedPath = finalPath + suffix

              // 如果存在后缀文件，且原文件不存在或大小为0
              if (existsSync(suffixedPath)) {
                let shouldRestore = false
                if (!existsSync(finalPath)) {
                  shouldRestore = true
                } else {
                  try {
                    const st = statSync(finalPath)
                    if (st.size === 0) {
                      shouldRestore = true
                    }
                  } catch (e) {
                    shouldRestore = true
                  }
                }

                if (shouldRestore) {
                  // 如果原文件存在但大小为0，先删除
                  if (existsSync(finalPath)) {
try {
unlinkSync(finalPath)
                    } catch (e) {
                      console.warn(`[Lerxu] Failed to remove empty file: ${finalPath}`, e)
                    }
                  }

                  const ok = renamePreserveTimes(suffixedPath, finalPath)
                  if (ok) {
                    console.log(`[Lerxu] Restored suffix on startup: ${suffixedPath} -> ${finalPath}`)
                    cleanupAria2ControlFiles([suffixedPath, finalPath])
                  } else {
                    console.warn(`[Lerxu] Failed to restore suffix on startup: ${suffixedPath} -> ${finalPath}`)
                  }
                }
              }
            } catch (err) {
              console.warn(`[Lerxu] restoreSuffixFilesForActiveTasks error for task ${task.gid}:`, err)
            }
          })
        })
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
            const peerCount = Number((task.peers || []).length || prevPeers)
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
          if (_pendingSelectionNotified.has(taskGid)) {
            return
          }
          _pendingSelectionNotified.add(taskGid)
          notifyPendingFileSelection(task)
        })
      }
      function notifyPendingFileSelection(task) {
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

        const pruneObj = (obj) => {
          const next = {}
          Object.keys(obj || {}).forEach(gid => {
            if (gidSet.has(gid)) {
              next[gid] = obj[gid]
            }
          })
          return next
        }

        magnetZeroMap.value = pruneObj(magnetZeroMap.value)
        dataAccessZeroMap.value = pruneObj(dataAccessZeroMap.value)
        dataAccessLastCompletedMap.value = pruneObj(dataAccessLastCompletedMap.value)

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

        if (_bilibiliMergeNotified && _bilibiliMergeNotified.size > 0) {
          Array.from(_bilibiliMergeNotified).forEach(gid => {
            if (!gidSet.has(`${gid}`)) {
              _bilibiliMergeNotified.delete(gid)
            }
          })
          capSet(_bilibiliMergeNotified, 500)
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
