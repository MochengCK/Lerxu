<template>
  <div v-if="false"></div>
</template>

<script>
  import is from 'electron-is'
  import { mapState } from 'vuex'
  import api from '@/api'
  import taskHistory from '@/api/TaskHistory'
  import {
    getTaskFullPath,
    getTaskActualPath,
    getPathCandidates,
    showItemInFolder
  } from '@/utils/native'

  import { checkTaskIsBT, getTaskName, getTaskUri, isMagnetTask } from '@shared/utils'
  import { TASK_STATUS } from '@shared/constants'
  import { spawn, spawnSync, execSync } from 'node:child_process'
  import { existsSync, renameSync, mkdirSync, utimesSync, statSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs'
  import { dirname, basename, extname, resolve, isAbsolute } from 'node:path'
  import {
    autoCategorizeDownloadedFile,
    buildCategorizedPath,
    createCategoryDirectory
  } from '@shared/utils/file-categorize'

  export default {
    name: 'mo-engine-client',
    data () {
      return {
        magnetZeroMap: {},
        magnetAlertedSet: new Set(),
        dataAccessZeroMap: {},
        dataAccessLastCompletedMap: {},
        pollingCount: 0,
        taskSpeedSampleBaseMap: {},
        downloadStartNotifiedGids: new Set(),
        segmentErrorRetryMap: {}
      }
    },
    computed: {
      isRenderer: () => is.renderer(),
      ...mapState('app', {
        uploadSpeed: state => state.stat.uploadSpeed,
        downloadSpeed: state => state.stat.downloadSpeed,
        speed: state => state.stat.uploadSpeed + state.stat.downloadSpeed,
        interval: state => state.interval,
        downloading: state => state.stat.numActive > 0,
        progress: state => state.progress
      }),
      ...mapState('task', {
        messages: state => state.messages,
        seedingList: state => state.seedingList,
        taskDetailVisible: state => state.taskDetailVisible,
        enabledFetchPeers: state => state.enabledFetchPeers,
        currentTaskGid: state => state.currentTaskGid,
        currentTaskItem: state => state.currentTaskItem
      }),
      ...mapState('preference', {
        taskNotification: state => state.config.taskNotification,
        taskCompleteNotifyClickAction: state => state.config.taskCompleteNotifyClickAction || 'open-folder'
      }),
      currentTaskIsBT () {
        return checkTaskIsBT(this.currentTaskItem)
      }
    },
    watch: {
      speed (val) {
        // Throttle speed updates to avoid excessive IPC calls
        // Only update if it's been more than 800ms since last update
        const now = Date.now()
        if (this.lastSpeedUpdate && now - this.lastSpeedUpdate < 800) {
          return
        }
        this.lastSpeedUpdate = now

        const { uploadSpeed, downloadSpeed } = this
        this.$electron.ipcRenderer.send('event', 'speed-change', {
          uploadSpeed,
          downloadSpeed
        })
      },
      downloading (val, oldVal) {
        if (val !== oldVal && this.isRenderer) {
          this.$electron.ipcRenderer.send('event', 'download-status-change', val)
        }
      },
      progress (val) {
        this.$electron.ipcRenderer.send('event', 'progress-change', val)
      }
    },
    methods: {
      isPreferenceWindow () {
        const path = this.$route && this.$route.path ? `${this.$route.path}` : ''
        const hashPath = typeof window !== 'undefined' && window.location && window.location.hash
          ? `${window.location.hash}`
          : ''
        return path.startsWith('/preference-window') || hashPath.startsWith('#/preference-window')
      },
      maybeEnterIdleInterval () {
        const hidden = typeof document !== 'undefined' && !!document.hidden
        const stat = (this.$store.state.app && this.$store.state.app.stat) ? this.$store.state.app.stat : {}
        const numActive = Number(stat.numActive || 0)
        const numWaiting = Number(stat.numWaiting || 0)
        const busy = (numActive + numWaiting) > 0 || !!this.taskDetailVisible
        if (hidden && !busy) {
          this.$store.dispatch('app/updateInterval', 30000)
          this.$store.dispatch('app/clearProgress')
        }
      },
      renamePreserveTimes (from, to) {
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
      },
      /**
       * 修复带有下载后缀的文件名中的序号位置
       * 例如：/path/to/5EClient-8.2.5.exe (1).vxdv -> /path/to/5EClient-8.2.5 (1).exe.vxdv
       */
      fixFileNameWithSuffix (filePath, downloadingFileSuffix) {
        if (!downloadingFileSuffix || !filePath.endsWith(downloadingFileSuffix)) {
          return filePath
        }

        const { dirname, basename, join } = require('node:path')
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
      },
      async fetchTaskItem ({ gid }) {
        return api.fetchTaskItem({ gid })
          .catch((e) => {
            console.warn(`fetchTaskItem fail: ${e.message}`)
          })
      },
      onDownloadStart (event) {
        this.$store.dispatch('task/fetchList')
        this.$store.dispatch('app/resetInterval')
        this.$store.dispatch('task/saveSession')
        this.kickPolling()
        const [{ gid }] = event
        const { seedingList } = this
        if (seedingList.includes(gid)) {
          return
        }

        // 检查是否已经显示过这个任务的开始下载通知，防止重复显示
        if (this.downloadStartNotifiedGids.has(gid)) {
          return
        }
        this.downloadStartNotifiedGids.add(gid)

        this.fetchTaskItem({ gid })
          .then(async (task) => {
            if (!task) {
              return
            }
            const { dir } = task
            this.$store.dispatch('preference/recordHistoryDirectory', dir)
            const taskName = getTaskName(task)
            const cfg = this.$store.state.preference.config || {}
            let fromHistory = false
            try {
              const gidKey = task && task.gid ? `${task.gid}` : ''
              const t = gidKey ? (taskHistory.getAllHistory() || []).find(x => x && `${x.gid}` === gidKey) : null
              fromHistory = !!(t && t.fromBrowserExtension)
            } catch (_) {}
            let isBilibiliPart = false
            try {
              const p = getTaskActualPath(task, cfg)
              const info = this.parseBilibiliDashPart(p)
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
              if (!isBilibiliPart && this.looksLikeBilibiliSource(referer, headers)) {
                isBilibiliPart = true
              }
              const fromHeader = headers.some(h => /X-LinkCore-Source\s*:\s*BrowserExtension/i.test(`${h}`))
              const fromBrowserExtension = fromHeader || fromHistory
              if (fromBrowserExtension) {
                const key = this.buildBrowserStartNotifyKey(task, cfg)
                if (!this._browserStartNotifiedKeys) {
                  this._browserStartNotifiedKeys = new Map()
                }
                const now = Date.now()
                const windowMs = 10000
                let shouldNotify = true
                if (key) {
                  const prev = Number(this._browserStartNotifiedKeys.get(key) || 0)
                  if (prev && (now - prev) < windowMs) {
                    shouldNotify = false
                  }
                  this._browserStartNotifiedKeys.set(key, now)
                  if (this._browserStartNotifiedKeys.size > 500) {
                    for (const [k, t] of this._browserStartNotifiedKeys.entries()) {
                      if (!t || (now - Number(t)) > (windowMs * 3)) {
                        this._browserStartNotifiedKeys.delete(k)
                      }
                    }
                  }
                }
                if (shouldNotify) {
                  const message = this.$t('task.download-start-browser-message')
                  this.$msg.info(message)
                  if (is.windows()) {
                    const notify = new Notification(message, { body: taskName })
                    notify.onclick = () => {
                      this.$electron.ipcRenderer.send('command', 'application:show', { page: 'index' })
                    }
                  }
                }
              } else if (!isBilibiliPart) {
                const message = this.$t('task.download-start-message', { taskName })
                this.$msg.info(message)
              }
            } catch (_) {
              if (fromHistory) {
                const key = this.buildBrowserStartNotifyKey(task, cfg)
                if (!this._browserStartNotifiedKeys) {
                  this._browserStartNotifiedKeys = new Map()
                }
                const now = Date.now()
                const windowMs = 10000
                let shouldNotify = true
                if (key) {
                  const prev = Number(this._browserStartNotifiedKeys.get(key) || 0)
                  if (prev && (now - prev) < windowMs) {
                    shouldNotify = false
                  }
                  this._browserStartNotifiedKeys.set(key, now)
                  if (this._browserStartNotifiedKeys.size > 500) {
                    for (const [k, t] of this._browserStartNotifiedKeys.entries()) {
                      if (!t || (now - Number(t)) > (windowMs * 3)) {
                        this._browserStartNotifiedKeys.delete(k)
                      }
                    }
                  }
                }
                if (shouldNotify) {
                  const message = this.$t('task.download-start-browser-message')
                  this.$msg.info(message)
                  if (is.windows()) {
                    const notify = new Notification(message, { body: taskName })
                    notify.onclick = () => {
                      this.$electron.ipcRenderer.send('command', 'application:show', { page: 'index' })
                    }
                  }
                }
              } else if (!isBilibiliPart) {
                const message = this.$t('task.download-start-message', { taskName })
                this.$msg.info(message)
              }
            }

            this.ensureTargetDirectoryExists(task)
            this.ensureCategoryDirectoryForTask(task)
          })
      },
      onDownloadPause (event) {
        const [{ gid }] = event
        const { seedingList } = this
        if (seedingList.includes(gid)) {
          return
        }

        this.fetchTaskItem({ gid })
          .then((task) => {
            if (!task) {
              return
            }
            const taskName = getTaskName(task)
            const message = this.$t('task.download-pause-message', { taskName })
            this.$msg.info(message)
          })
      },
      onDownloadStop (event) {
        const [{ gid }] = event
        this.fetchTaskItem({ gid })
          .then((task) => {
            if (!task) {
              return
            }
            const taskName = getTaskName(task)
            const message = this.$t('task.download-stop-message', { taskName })
            this.$msg.info(message)
          })
      },
      onDownloadError (event) {
        const [{ gid }] = event
        this.fetchTaskItem({ gid })
          .then((task) => {
            if (!task) {
              return
            }
            const taskName = getTaskName(task)
            const { errorCode, errorMessage } = task
            console.error(`[Motrix] download error gid: ${gid}, #${errorCode}, ${errorMessage}`)
            const reason = this.resolveErrorReason(errorCode, errorMessage)
            const message = reason
              ? this.$t('task.download-error-with-reason', { taskName, reason })
              : this.$t('task.download-error-message', { taskName })
            const link = `<a target="_blank" href="https://github.com/agalwood/Motrix/wiki/Error#${errorCode}" rel="noopener noreferrer">${errorCode}</a>`

            const msg = `${errorMessage || ''}`
            const segmentPath = this.extractSegmentFilePath(msg)
            if (segmentPath && checkTaskIsBT(task)) {
              this.tryRepairSegmentFile(task, segmentPath).catch(() => {})
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
            const isBt = !!(task && task.bittorrent && task.bittorrent.info)

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

            if (canShowUpdateLink) {
              this.$store.dispatch('task/markTaskNeedUpdateLink', {
                gid,
                httpStatus,
                level: rule.level,
                reason: `HTTP ${httpStatus}`,
                errorCode,
                errorMessage
              })

              const st = task && task.status ? `${task.status}` : ''
              if (st === TASK_STATUS.ACTIVE || st === TASK_STATUS.WAITING) {
                this.$store.dispatch('task/pauseTask', task).catch(() => {})
              }
              this.$msg.warning(this.$t(rule.notifyKey || 'task.link-update-needed', { taskName }))
            }

            this.$msg({
              type: 'error',
              showClose: true,
              duration: 5000,
              dangerouslyUseHTMLString: true,
              message: `${message} ${link}`
            })
          })
      },
      extractSegmentFilePath (text = '') {
        const raw = `${text || ''}`
        const match = raw.match(/segment file\s+(.+?\.aria2)\b/i)
        if (!match) {
          return ''
        }
        const path = match[1] ? `${match[1]}` : ''
        return path.replace(/^["']|["']$/g, '')
      },
      async tryRepairSegmentFile (task, segmentPath) {
        const gid = task && task.gid ? `${task.gid}` : ''
        if (!gid) {
          return false
        }
        const retryMap = this.segmentErrorRetryMap || {}
        const count = Number(retryMap[gid] || 0)
        if (count >= 1) {
          return false
        }
        this.$set(this.segmentErrorRetryMap, gid, count + 1)

        try {
          if (segmentPath && existsSync(segmentPath)) {
            try {
              unlinkSync(segmentPath)
            } catch (e) {
              console.warn('[Motrix] Failed to remove segment file:', segmentPath, e)
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

          await this.$store.dispatch('task/addUri', {
            uris: [uri],
            options
          })

          await api.removeTaskRecord({ gid }).catch(() => {})
          this.$msg.warning('检测到任务续传文件损坏，已尝试自动重建任务')
          return true
        } catch (e) {
          console.warn('[Motrix] Auto repair segment file failed:', e)
          return false
        }
      },
      onDownloadComplete (event) {
        const [{ gid }] = event
        this.$store.dispatch('task/removeFromSeedingList', gid)

        this.fetchTaskItem({ gid })
          .then((task) => {
            if (!task) {
              return
            }
            return this.handleDownloadComplete(task, false)
          })
          .finally(() => {
            this.$store.dispatch('task/fetchList')
          })
      },
      onBtDownloadComplete (event) {
        this.$store.dispatch('task/fetchList')
        const [{ gid }] = event
        const { seedingList } = this
        if (seedingList.includes(gid)) {
          return
        }

        this.$store.dispatch('task/addToSeedingList', gid)

        this.fetchTaskItem({ gid })
          .then((task) => {
            if (!task) {
              return
            }
            this.handleDownloadComplete(task, true)
          })
      },
      async handleDownloadComplete (task, isBT) {
        const cfg = this.$store.state.preference.config || {}
        const path = getTaskActualPath(task, cfg)
        const finalPath = isBT ? path : await this.removeDownloadingSuffix(task, path, cfg)
        let isBilibiliPart = false
        if (!isBT) {
          try {
            const info = this.parseBilibiliDashPart(finalPath)
            if (info && info.base) {
              isBilibiliPart = true
            }
          } catch (_) {}
          if (!isBilibiliPart) {
            try {
              const actual = getTaskActualPath(task, cfg)
              const info2 = this.parseBilibiliDashPart(actual)
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
                  fromSupportedSource = headers.some(h => /X-LinkCore-Source\s*:\s*BrowserExtension/i.test(`${h}`)) ||
                    this.looksLikeBilibiliSource(referer, headers)
                }
                if (fromSupportedSource) {
                  const pair = this.collectExtensionDashParts(finalPath || path, cfg)
                  const suffix = cfg.downloadingFileSuffix || ''
                  const looksLikeStream = this.looksLikeExtensionDashStreamPath(finalPath || path, suffix)
                  if (looksLikeStream || (pair && pair.isPairCandidate)) {
                    isBilibiliPart = true
                  }
                }
              }
            } catch (_) {}
          }
        }

        this.$store.dispatch('task/saveSession')
        this.persistAverageSpeedToHistory(task)
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (gid) {
            // 检查是否为元数据任务 - 这些任务不应该保存到历史记录
            const taskName = task && task.name ? `${task.name}` : ''
            const isMetadataTask = taskName.startsWith('[METADATA]')
            if (isMetadataTask) {
              // 元数据任务完成后不保存到历史记录
              console.log('[Motrix] Metadata task completed, skipping history save:', gid, taskName)
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
              this.$store.dispatch('task/setTaskDisplayName', { gid, name })
            }
          }
        } catch (_) {}
        if (!isBilibiliPart) {
          const notifyPath = finalPath || path
          this.showTaskCompleteNotify(task, isBT, notifyPath)
          this.$electron.ipcRenderer.send('event', 'task-download-complete', task, notifyPath)
        }
        this.setFileMtimeOnComplete(task, finalPath)

        const mergeKey = this.getDashMergeKey(finalPath, cfg)
        const mergeResult = await this.runDashMergeExclusive(mergeKey, () => {
          return this.maybeMergeBilibiliDash(finalPath, task)
        })
        if (mergeResult && mergeResult.mergedPath) {
          this.setFileMtimeOnComplete(task, mergeResult.mergedPath)
          this.autoCategorizeDownloadedFile(task, mergeResult.mergedPath)
          try {
            const gid = task && task.gid ? `${task.gid}` : ''
            if (gid) {
              const base = basename(mergeResult.mergedPath || '')
              const suffix = cfg.downloadingFileSuffix || ''
              const name = suffix && base.endsWith(suffix) ? base.slice(0, -suffix.length) : base
              if (name) {
                this.$store.dispatch('task/setTaskDisplayName', { gid, name })
              }
            }
          } catch (_) {}
          let shouldNotify = true
          if (isBilibiliPart || (mergeResult && mergeResult.isBilibiliPart)) {
            try {
              const key = resolve(mergeResult.mergedPath)
              if (!this._bilibiliMergeNotified) {
                this._bilibiliMergeNotified = new Set()
              }
              if (this._bilibiliMergeNotified.has(key)) {
                shouldNotify = false
              } else {
                this._bilibiliMergeNotified.add(key)
              }
            } catch (_) {}
          }
          if (shouldNotify) {
            const notifyPath = mergeResult.mergedPath
            this.showTaskCompleteNotify(task, isBT, notifyPath)
            this.$electron.ipcRenderer.send('event', 'task-download-complete', task, notifyPath)
          }
        } else if (mergeResult && mergeResult.isBilibiliPart && mergeResult.noFfmpeg) {
          try {
            const gidKey = task && task.gid ? `${task.gid}` : ''
            if (!this._extensionDashNoFfmpegNotified) {
              this._extensionDashNoFfmpegNotified = new Set()
            }
            if (!gidKey || !this._extensionDashNoFfmpegNotified.has(gidKey)) {
              if (gidKey) {
                this._extensionDashNoFfmpegNotified.add(gidKey)
              }
              const notifyPath = mergeResult.fallbackNotifyPath || finalPath || path
              this.showTaskCompleteNotify(task, isBT, notifyPath)
              this.$electron.ipcRenderer.send('event', 'task-download-complete', task, notifyPath)
            }
          } catch (_) {}
        } else if (!(mergeResult && mergeResult.isBilibiliPart)) {
          this.autoCategorizeDownloadedFile(task, finalPath)
        }
      },
      looksLikeBilibiliSource (referer, headers) {
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
      },
      buildBrowserStartNotifyKey (task, cfg) {
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          const config = cfg && typeof cfg === 'object' ? cfg : (this.$store.state.preference.config || {})
          const suffix = config && config.downloadingFileSuffix ? `${config.downloadingFileSuffix}` : ''
          const p = getTaskActualPath(task, config) || ''
          const raw = p ? basename(p) : ''
          const file0 = suffix ? this.stripDownloadingSuffixFromFilename(raw, suffix) : raw
          const file = this.stripDuplicateNumberBeforeExtension(file0)
          const lower = file.toLowerCase()
          const isPairLike =
            lower.endsWith('_video.mp4') ||
            lower.endsWith('_audio.m4a') ||
            /\.m4s$/i.test(file) ||
            /(video\s*stream|audio\s*stream|videostream|audiostream|视频流|音频流)/i.test(file)
          if (!isPairLike) {
            return gid
          }
          const stem = this.normalizeDashStemFromFilename(file)
          const dir = p ? dirname(p) : ''
          if (!stem || !dir) {
            return gid
          }
          return `${resolve(dir)}|${stem}`
        } catch (_) {
          return ''
        }
      },
      looksLikeExtensionDashStreamPath (p, downloadingFileSuffix) {
        try {
          const raw = p ? `${p}` : ''
          if (!raw) return false
          const file0 = basename(raw)
          const suffix = downloadingFileSuffix ? `${downloadingFileSuffix}` : ''
          const file1 = suffix ? this.stripDownloadingSuffixFromFilename(file0, suffix) : file0
          const file = this.stripDuplicateNumberBeforeExtension(file1)
          return /(video\s*stream|audio\s*stream|videostream|audiostream|视频流|音频流)/i.test(file)
        } catch (_) {
          return false
        }
      },
      stripDownloadingSuffixFromFilename (filename, downloadingFileSuffix) {
        const name = filename ? `${filename}` : ''
        const suffix = downloadingFileSuffix ? `${downloadingFileSuffix}` : ''
        if (!name || !suffix) return name
        return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
      },
      stripDuplicateNumberBeforeExtension (filename) {
        const name = filename ? `${filename}` : ''
        if (!name) return name
        return name.replace(/\s+\(\d+\)(?=\.[^.]+$)/, '')
      },
      normalizeDashStemFromFilename (filename) {
        const name = filename ? `${filename}` : ''
        if (!name) return ''
        const withoutDup = this.stripDuplicateNumberBeforeExtension(name)
        const dot = withoutDup.lastIndexOf('.')
        const stem = dot > 0 ? withoutDup.slice(0, dot) : withoutDup
        return stem
          .replace(/(?:[._-]|\s+|\()?(video\s*stream|audio\s*stream|videostream|audiostream|video|audio|视频流|音频流|视频|音频)\)?$/i, '')
          .trim()
      },
      // 去掉 stem 末尾的分P序号后缀（如 "标题_1" -> "标题"），
      // 用于合并产物的最终命名，避免重复下载时产物叫 "标题_1.mp4" 而非 "标题.mp4"。
      // 配对用的 stem 仍保留序号（在 collectExtensionDashParts 中）。
      stripDashSequenceSuffix (stem) {
        const s = stem ? `${stem}` : ''
        if (!s) return ''
        return s.replace(/_[0-9]+$/, '').trim()
      },
      getDashExtFromFilename (filename) {
        const name = filename ? `${filename}` : ''
        const lower = name.toLowerCase()
        if (lower.endsWith('.mp4')) return 'mp4'
        if (lower.endsWith('.m4a')) return 'm4a'
        if (lower.endsWith('.m4s')) return 'm4s'
        return ''
      },
      collectExtensionDashParts (finalPath, cfg) {
        try {
          const p = finalPath ? `${finalPath}` : ''
          if (!p) return null
          const downloadingFileSuffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
          const dir = dirname(p)
          const file = basename(p)
          const fileNoSuffix = this.stripDownloadingSuffixFromFilename(file, downloadingFileSuffix)
          const stem = this.normalizeDashStemFromFilename(fileNoSuffix)
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
            if (n.toLowerCase().endsWith('.aria2')) {
              aria2Set.add(n.slice(0, -'.aria2'.length))
            }
          })

          const parts = []
          for (const e0 of entries) {
            const e = e0 ? `${e0}` : ''
            if (!e || e.toLowerCase().endsWith('.aria2')) continue
            if (e.startsWith('.') && e.includes('.linkcore-merging-')) continue
            const pendingBySuffix = !!(downloadingFileSuffix && e.endsWith(downloadingFileSuffix))
            const eNoSuffix = this.stripDownloadingSuffixFromFilename(e, downloadingFileSuffix)
            const ext = this.getDashExtFromFilename(eNoSuffix)
            if (!ext) continue
            const s = this.normalizeDashStemFromFilename(eNoSuffix)
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
      },
      parseBilibiliDashPart (fullPath) {
        try {
          const p = fullPath ? `${fullPath}` : ''
          if (!p) return null
          const rawFile = basename(p)
          const cfg = this.$store.state.preference.config || {}
          const suffix = cfg.downloadingFileSuffix || ''
          const file = this.stripDuplicateNumberBeforeExtension(rawFile)
          const normalized = suffix ? this.stripDownloadingSuffixFromFilename(file, suffix) : file
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
      },
      deriveBilibiliDashRootDir (partDir, cfg) {
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
      },
      buildBilibiliDashCandidates (rootDir, base, kind, cfg) {
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
      },
      findFirstExistingPath (paths) {
        try {
          const arr = Array.isArray(paths) ? paths : []
          for (const p of arr) {
            if (p && existsSync(p)) return p
          }
        } catch (_) {}
        return ''
      },
      resolveFfmpegPath () {
        const candidates = []
        const ffmpegExeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

        // 检查用户数据目录中的 ffmpeg
        try {
          const { app } = require('@electron/remote')
          const userDataPath = app.getPath('userData')
          candidates.push(resolve(userDataPath, 'ffmpeg', ffmpegExeName))
        } catch (_) {}

        // 检查应用安装目录（通过 exe 路径获取）
        try {
          const { app } = require('@electron/remote')
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
        return candidates.find(p => (p === 'ffmpeg' ? this.checkSystemFfmpeg() : existsSync(p))) || ''
      },
      checkSystemFfmpeg () {
        try {
          const result = spawnSync('ffmpeg', ['-version'], { windowsHide: true, timeout: 5000 })
          return result.status === 0
        } catch (_) {
          return false
        }
      },
      async ensureFfmpeg () {
        // 检查是否已有 ffmpeg
        const existingPath = this.resolveFfmpegPath()
        if (existingPath) {
          return existingPath
        }

        // 检查用户是否已经取消过提示
        const { app } = require('@electron/remote')
        const userDataPath = app.getPath('userData')
        const skipFlagPath = resolve(userDataPath, '.ffmpeg-skip')
        if (existsSync(skipFlagPath)) {
          return ''
        }

        // 提示用户需要手动安装 FFmpeg
        this.$msg.warning(this.$t('task.ffmpeg-required-manual'))

        // 记录已提示，避免重复提示
        try {
          const fs = require('node:fs')
          fs.writeFileSync(skipFlagPath, '1')
        } catch (_) {}

        return ''
      },
      getDashMergeKey (filePath, cfg) {
        try {
          const path = filePath ? resolve(`${filePath}`) : ''
          if (!path) return ''
          const suffix = cfg && cfg.downloadingFileSuffix ? `${cfg.downloadingFileSuffix}` : ''
          const raw = basename(path)
          const normalized = suffix ? this.stripDownloadingSuffixFromFilename(raw, suffix) : raw
          const stem = this.normalizeDashStemFromFilename(normalized)
          return stem ? `${dirname(path)}|${stem}` : path
        } catch (_) {
          return ''
        }
      },
      runDashMergeExclusive (key, merge) {
        if (!key) {
          return Promise.resolve().then(merge)
        }
        if (!this._dashMergeJobs) {
          this._dashMergeJobs = new Map()
        }
        const running = this._dashMergeJobs.get(key)
        if (running) {
          return running
        }
        const job = Promise.resolve()
          .then(merge)
          .finally(() => {
            if (this._dashMergeJobs.get(key) === job) {
              this._dashMergeJobs.delete(key)
            }
          })
        this._dashMergeJobs.set(key, job)
        return job
      },
      runFfmpegMux (ffmpegPath, videoPath, audioPath, outputPath) {
        return new Promise((resolve, reject) => {
          const cmd = ffmpegPath || ''
          const args = [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-i', videoPath,
            '-i', audioPath,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c', 'copy',
            '-shortest',
            outputPath
          ]
          const child = spawn(cmd, args, { windowsHide: true })
          let stderr = ''
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
      },
      validateDashMergeOutput (ffmpegPath, outputPath) {
        if (!outputPath || !existsSync(outputPath)) {
          return false
        }
        try {
          const result = spawnSync(ffmpegPath, [
            '-hide_banner',
            '-i', outputPath,
            '-map', '0:v:0',
            '-map', '0:a:0',
            '-c', 'copy',
            '-f', 'null',
            '-'
          ], { windowsHide: true, timeout: 30000 })
          return result.status === 0
        } catch (_) {
          return false
        }
      },
      async mergeDashToOutput (ffmpegPath, videoPath, audioPath, outputPath) {
        const tempPath = resolve(dirname(outputPath), `.${basename(outputPath)}.linkcore-merging-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`)
        try {
          try {
            await this.runFfmpegMux(ffmpegPath, videoPath, audioPath, tempPath)
          } catch (firstError) {
            try {
              if (existsSync(tempPath)) unlinkSync(tempPath)
            } catch (_) {}
            await this.runFfmpegMux(ffmpegPath, audioPath, videoPath, tempPath)
          }
          if (!this.validateDashMergeOutput(ffmpegPath, tempPath)) {
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
      },
      getDashMergeOutputPath (dir, stem, inputPaths = []) {
        const inputs = new Set((inputPaths || []).filter(Boolean).map(path => resolve(path)))
        for (let i = 0; i < 1000; i++) {
          const rand = Math.random().toString(36).slice(2, 10)
          const candidate = resolve(dir, `.linkcore-merging-${rand}.mp4`)
          if (!inputs.has(candidate) && !existsSync(candidate)) {
            return candidate
          }
        }
        const fallback = resolve(dir, `.linkcore-merging-${Date.now()}.mp4`)
        return fallback
      },
      forceDeleteFileSync (filePath) {
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
      },
      generateUniqueFilePath (dir, stem, ext, pathsToIgnore = []) {
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
      },
      async maybeMergeBilibiliDash (finalPath, task = null) {
        const info = this.parseBilibiliDashPart(finalPath)
        if (!info) {
          return await this.maybeMergeExtensionDash(finalPath, task)
        }
        const cfg = this.$store.state.preference.config || {}
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
            return { isBilibiliPart: true, mergedPath: '' }
          }
          const parts = group.map(name => {
            const full = resolve(dir, name)
            let ready = false
            try {
              const exists = existsSync(full)
              let ariaExists = false
              try {
                ariaExists = existsSync(`${full}.aria2`)
              } catch (_) {}
              ready = exists && !ariaExists
            } catch (_) {}
            return { name, path: full, ready }
          })
          const readyParts = parts.filter(p => p && p.ready)
          if (readyParts.length < 2) {
            const ffmpegPath = this.resolveFfmpegPath()
            if (!ffmpegPath) {
              const notifyKey = `${dir || ''}|${base || ''}`
              const fallbackNotifyPath = finalPath || ''
              return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
            }
            return { isBilibiliPart: true, mergedPath: '' }
          }
          const videoPath = readyParts[0].path
          const audioPath = readyParts[1].path
          const ffmpegPath = await this.ensureFfmpeg()
          if (!ffmpegPath) {
            const notifyKey = `${dir || ''}|${base || ''}`
            const fallbackNotifyPath = finalPath || ''
            return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
          }
          const outputBase = this.stripDashSequenceSuffix(base)
          const outputPath = this.getDashMergeOutputPath(dir, outputBase, [videoPath, audioPath])
          if (!outputPath) {
            return { isBilibiliPart: true, mergedPath: '' }
          }
          try {
            await this.mergeDashToOutput(ffmpegPath, videoPath, audioPath, outputPath)
            const finalOutputPath = await this.afterBilibiliMerge(task, info, videoPath, audioPath, outputPath)
            return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
          } catch (e) {
            console.warn(`[Motrix] FFmpeg merge failed: ${e && e.message ? e.message : e}`)
            return { isBilibiliPart: true, mergedPath: '' }
          }
        }

        const rootDir = this.deriveBilibiliDashRootDir(dir, cfg)
        const videoCand = [
          ...this.buildBilibiliDashCandidates(rootDir, base, 'video', cfg),
          ...this.buildBilibiliDashCandidates(dir, base, 'video', cfg)
        ]
        const audioCand = [
          ...this.buildBilibiliDashCandidates(rootDir, base, 'audio', cfg),
          ...this.buildBilibiliDashCandidates(dir, base, 'audio', cfg)
        ]

        const videoPath = this.findFirstExistingPath(videoCand)
        const audioPath = this.findFirstExistingPath(audioCand)

        if (!videoPath || !audioPath) {
          const ffmpegPath = this.resolveFfmpegPath()
          if (!ffmpegPath) {
            const notifyKey = `${dir || ''}|${base || ''}`
            const fallbackNotifyPath = finalPath || ''
            return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
          }
          return { isBilibiliPart: true, mergedPath: '' }
        }

        const outputDir = dirname(videoPath || finalPath || rootDir || dir)
        const outputBase = this.stripDashSequenceSuffix(base)
        const outputPath = this.getDashMergeOutputPath(outputDir, outputBase, [videoPath, audioPath])
        if (!outputPath) {
          return { isBilibiliPart: true, mergedPath: '' }
        }

        const ffmpegPath = await this.ensureFfmpeg()
        if (!ffmpegPath) {
          const notifyKey = `${outputDir || ''}|${base || ''}`
          const fallbackNotifyPath = finalPath || ''
          return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
        }

        try {
          await this.mergeDashToOutput(ffmpegPath, videoPath, audioPath, outputPath)
          const finalOutputPath = await this.afterBilibiliMerge(task, info, videoPath, audioPath, outputPath)
          return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
        } catch (e) {
          console.warn(`[Motrix] FFmpeg merge failed: ${e && e.message ? e.message : e}`)
          return { isBilibiliPart: true, mergedPath: '' }
        }
      },
      async maybeMergeExtensionDash (finalPath, task = null) {
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
              fromSupportedSource = headers.some(h => /X-LinkCore-Source\s*:\s*BrowserExtension/i.test(`${h}`)) ||
                this.looksLikeBilibiliSource(referer, headers)
            } catch (_) {
              fromSupportedSource = false
            }
          }
          const cfg = this.$store.state.preference.config || {}
          const pair = this.collectExtensionDashParts(finalPath, cfg)
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
                const aria2A = `${diskPath}.aria2`
                const aria2B = `${withoutSuffix}.aria2`
                if (existsSync(aria2A) || existsSync(aria2B)) {
                  continue
                }

                let pathToProcess = diskPath
                try {
                  const fixed = this.fixFileNameWithSuffix(pathToProcess, downloadingFileSuffix)
                  if (fixed && fixed !== pathToProcess && existsSync(pathToProcess)) {
                    const okFix = this.renamePreserveTimes(pathToProcess, fixed)
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
                    const ok = this.renamePreserveTimes(pathToProcess, targetPath)
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
            const ffmpegPath = this.resolveFfmpegPath()
            if (!ffmpegPath) {
              const notifyKey = `${pair.dir || ''}|${pair.stem || ''}`
              const fallbackNotifyPath = finalPath || ''
              return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
            }
            return { isBilibiliPart: true, mergedPath: '' }
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

          const outputBase = this.stripDashSequenceSuffix(pair.stem)
          const outputPath = this.getDashMergeOutputPath(pair.dir, outputBase, [videoPath, audioPath])
          if (!outputPath) {
            return { isBilibiliPart: true, mergedPath: '' }
          }

          const ffmpegPath = await this.ensureFfmpeg()
          if (!ffmpegPath) {
            const notifyKey = `${pair.dir || ''}|${pair.stem || ''}`
            const fallbackNotifyPath = finalPath || ''
            return { isBilibiliPart: true, mergedPath: '', noFfmpeg: true, notifyKey, fallbackNotifyPath }
          }

          try {
            await this.mergeDashToOutput(ffmpegPath, videoPath, audioPath, outputPath)
            const info = { dir: pair.dir, base: pair.stem, type: 'named' }
            const finalOutputPath = await this.afterBilibiliMerge(task, info, videoPath, audioPath, outputPath)
            return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
          } catch (e) {
            console.warn(`[Motrix] FFmpeg merge failed: ${e && e.message ? e.message : e}`)
            return { isBilibiliPart: true, mergedPath: '' }
          }
        } catch (_) {
          return { isBilibiliPart: false, mergedPath: '' }
        }
      },
      async afterBilibiliMerge (task, info, videoPath, audioPath, outputPath) {
        let finalOutputPath = outputPath
        const deletedFiles = new Set()
        const deletedCandidates = new Set()
        const deletedSuffix = (() => {
          try {
            const cfg = this.$store.state.preference.config || {}
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
          const forceUnlink = (p) => {
            if (!p) return false
            let full = ''
            try { full = resolve(p) } catch (_) { full = `${p}` }
            if (!full) return false
            if (outAbs && full === outAbs) return false
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                if (existsSync(full)) {
                  unlinkSync(full)
                }
                if (!existsSync(full)) {
                  toDelete.delete(full)
                  toDelete.delete(`${full}.aria2`)
                  try { addDeletedPath(full) } catch (_) {}
                  return true
                }
              } catch (_) {
                try {
                  execSync(`rm -f "${full.replace(/"/g, '\\"')}" "${full.replace(/"/g, '\\"')}.aria2"`, { stdio: 'ignore' })
                } catch (_) {}
              }
              if (attempt < 4) {
                try {
                  const end = Date.now() + 80
                  while (Date.now() < end);
                } catch (_) {}
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
                  const cfg = this.$store.state.preference.config || {}
                  const suffix = cfg.downloadingFileSuffix || ''
                  const raw = suffix ? this.stripDownloadingSuffixFromFilename(s, suffix) : s
                  const ext = this.getDashExtFromFilename(raw)
                  if (ext) {
                    const stem = this.normalizeDashStemFromFilename(raw)
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

          toDelete.forEach(p => {
            try {
              const s = `${p}`
              if (!s) return
              if (s.toLowerCase().endsWith('.aria2')) {
                try { if (existsSync(s)) unlinkSync(s) } catch (_) {
                  try { execSync(`rm -f "${s.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }) } catch (_) {}
                }
                return
              }
              const ok = forceUnlink(s)
              if (ok) {
                try { addDeletedPath(s) } catch (_) {}
              }
            } catch (_) {}
          })
        } catch (_) {}

        try {
          const outAbs2 = finalOutputPath ? resolve(finalOutputPath) : ''
          const dirFromTask = task && task.dir ? `${task.dir}` : ''
          const baseDir = dirFromTask || (finalOutputPath ? dirname(finalOutputPath) : '')
          const strongUnlink = (p) => {
            if (!p) return
            let full = ''
            try { full = resolve(p) } catch (_) { full = `${p}` }
            if (!full) return
            if (outAbs2 && full === outAbs2) return
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                if (existsSync(full)) unlinkSync(full)
                if (!existsSync(full)) {
                  try { addDeletedPath(full) } catch (_) {}
                  return
                }
              } catch (_) {
                try { execSync(`rm -f "${full.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }) } catch (_) {}
              }
              if (attempt < 4) {
                try { const end = Date.now() + 80; while (Date.now() < end); } catch (_) {}
              }
            }
          }
          if (task && Array.isArray(task.files)) {
            task.files.forEach(file => {
              try {
                const raw = file && file.path ? `${file.path}` : ''
                if (!raw) {
                  return
                }
                const full = isAbsolute(raw) ? resolve(raw) : resolve(baseDir, raw)
                if (outAbs2 && full === outAbs2) {
                  return
                }
                strongUnlink(full)
                const aria2Path = `${full}.aria2`
                strongUnlink(aria2Path)
              } catch (_) {}
            })
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

            const waitMs = (ms) => {
              try { const end = Date.now() + ms; while (Date.now() < end); } catch (_) {}
            }

            const aggressiveDelete = (p) => {
              if (!p) return true
              let full = ''
              try { full = resolve(p) } catch (_) { full = `${p}` }
              if (!full) return true
              if (!existsSync(full)) return true
              if (outAbs3 && full === outAbs3) return true
              let deleted = false
              for (let attempt = 0; attempt < 15; attempt++) {
                try {
                  if (existsSync(full)) {
                    try { unlinkSync(full) } catch (_) {
                      try { execSync(`rm -f "${full.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }) } catch (_) {}
                    }
                  }
                  if (!existsSync(full)) {
                    deleted = true
                    break
                  }
                } catch (_) {}
                waitMs(100)
              }
              if (deleted) {
                try { addDeletedPath(full) } catch (_) {}
              }
              return !existsSync(full)
            }

            aggressiveDelete(vAbs)
            aggressiveDelete(aAbs)
            waitMs(300)

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
                  if (!sen || (sen.startsWith('.') && sen.includes('.linkcore-merging-'))) continue
                  const raw = scanSuffix ? this.stripDownloadingSuffixFromFilename(sen, scanSuffix) : sen
                  const ext = this.getDashExtFromFilename(raw)
                  if (!ext) continue
                  const stem = this.normalizeDashStemFromFilename(raw)
                  if (!stem) continue
                  let shouldDelete = false
                  if (stem === scanBase) {
                    shouldDelete = true
                  } else if (m4sBase && /\.m4s$/i.test(raw)) {
                    const plainRaw = this.stripDuplicateNumberBeforeExtension(raw)
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
                      aggressiveDelete(fullS)
                      aggressiveDelete(`${fullS}.aria2`)
                    }
                  }
                }
              }
            } catch (_) {}

            waitMs(200)

            const candidate = resolve(dirOut, `${titleBase}${targetExt}`)
            if (existsSync(candidate) && isKnownSourcePath(candidate)) {
              aggressiveDelete(candidate)
            }

            waitMs(100)

            const finalTarget = this.generateUniqueFilePath(dirOut, titleBase, targetExt)
            if (finalTarget && resolve(finalTarget) !== resolve(outputPath)) {
              if (targetExt === '.mp4') {
                if (existsSync(finalTarget) && isKnownSourcePath(finalTarget)) {
                  aggressiveDelete(finalTarget)
                  waitMs(100)
                }
                const ok = this.renamePreserveTimes(outputPath, finalTarget)
                if (ok) {
                  finalOutputPath = finalTarget
                } else {
                  aggressiveDelete(finalTarget)
                  waitMs(100)
                  const ok2 = this.renamePreserveTimes(outputPath, finalTarget)
                  if (ok2) {
                    finalOutputPath = finalTarget
                  }
                }
              } else {
                if (existsSync(finalTarget)) {
                  finalOutputPath = finalTarget
                } else {
                  try {
                    const ffmpegPath = this.resolveFfmpegPath()
                    if (ffmpegPath) {
                      const result = spawnSync(ffmpegPath, [
                        '-y',
                        '-hide_banner',
                        '-loglevel', 'error',
                        '-i', outputPath,
                        '-c', 'copy',
                        finalTarget
                      ], { windowsHide: true })
                      if (result && result.status === 0 && existsSync(finalTarget)) {
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
              try { const a2 = `${orig}.aria2`; if (existsSync(a2)) unlinkSync(a2) } catch (_) {}
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
          const cfg = this.$store.state.preference.config || {}
          const targetBase = info && info.base ? `${info.base}` : ''
          const targetType = info && info.type ? `${info.type}` : ''
          const targetDir = info && info.dir ? this.deriveBilibiliDashRootDir(`${info.dir}`, cfg) : ''
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
            const plainName = this.stripDuplicateNumberBeforeExtension(n)
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
              const itemRoot = this.deriveBilibiliDashRootDir(dirname(full), cfg)
              if (resolve(itemRoot) !== resolve(targetDir)) return false
              const suffix = cfg.downloadingFileSuffix || ''
              const raw = basename(full)
              const normalized = suffix ? this.stripDownloadingSuffixFromFilename(raw, suffix) : raw
              let stemMatch = false
              if (targetType === 'm4s') {
                stemMatch = matchesM4sGroup(normalized) || this.normalizeDashStemFromFilename(normalized) === targetBase
              } else {
                stemMatch = this.normalizeDashStemFromFilename(normalized) === targetBase
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
            this.$store.dispatch('task/clearTaskCachesForGids', memberGids.filter(mg => mg && mg !== gid))
          } catch (_) {}
        } catch (_) {}

        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (gid && finalOutputPath) {
            const historyAll = taskHistory.getAllHistory ? (taskHistory.getAllHistory() || []) : (taskHistory.getHistory() || [])
            const cfg = this.$store.state.preference.config || {}
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
                const file = this.stripDuplicateNumberBeforeExtension(rawFile)
                const normalized = suffix ? this.stripDownloadingSuffixFromFilename(file, suffix) : file
                if (`${targetType || ''}` === 'm4s' && /\.m4s$/i.test(normalized)) {
                  const plainName = this.stripDuplicateNumberBeforeExtension(normalized)
                  if (plainName.startsWith(`${targetBase}-`) || plainName === `${targetBase}.m4s`) {
                    return true
                  }
                }
                const stem = this.normalizeDashStemFromFilename(normalized)
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
            const targetRootDir = targetDir ? this.deriveBilibiliDashRootDir(targetDir, cfg) : ''
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
                    ? this.stripDownloadingSuffixFromFilename(itemBase, cfg.downloadingFileSuffix)
                    : itemBase
                  const isCleanFinal = !!itemNormalized && !!/\.mp4$/i.test(itemNormalized) &&
                    !/(?:[._-]|\s+|\()?(?:video\s*stream|audio\s*stream|videostream|audiostream|video|audio|视频流|音频流|视频|音频)\)?$/i.test(this.normalizeDashStemFromFilename(itemNormalized) || '') &&
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
                const partInfo = this.parseBilibiliDashPart(full)
                if (!partInfo || !partInfo.base || !partInfo.dir) {
                  return
                }
                if (`${partInfo.base}` !== targetBase) {
                  return
                }
                const partRootDir = this.deriveBilibiliDashRootDir(`${partInfo.dir}`, cfg)
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
          this.$store.dispatch('task/fetchList').catch(() => {})
          this.$store.dispatch('app/fetchGlobalStat').catch(() => {})
        } catch (_) {}

        return finalOutputPath
      },
      persistAverageSpeedToHistory (task) {
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (!gid) {
            return
          }

          const map = this.$store.state.task.taskSpeedSamples || {}
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
      },
      ensureTargetDirectoryExists (task) {
        const fullPath = getTaskFullPath(task)
        const targetDir = dirname(fullPath)
        if (!existsSync(targetDir)) {
          try {
            mkdirSync(targetDir, { recursive: true })
            console.log(`[Motrix] Created target directory: ${targetDir}`)
          } catch (error) {
            console.warn(`[Motrix] Failed to create target directory: ${error.message}`)
          }
        }
      },

      ensureCategoryDirectoryForTask (task) {
        const cfg = this.$store.state.preference.config || {}
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
      },

      getUniqueCompletedPath (filePath) {
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
      },
      async removeDownloadingSuffix (task, manualPath = '', preferenceConfig = null) {
        const cfg = preferenceConfig || this.$store.state.preference.config || {}
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
              const ok = this.renamePreserveTimes(f, t)
              if (ok) return true
            }
            await sleep(delayMs)
          }
          return !existsSync(f) && existsSync(t)
        }

        if (currentPath.endsWith(downloadingFileSuffix)) {
          const fixedPath = this.fixFileNameWithSuffix(currentPath, downloadingFileSuffix)
          let pathToProcess = currentPath

          if (fixedPath !== currentPath && existsSync(currentPath)) {
            const okFix = await renameWithRetry(currentPath, fixedPath)
            if (okFix) {
              console.log(`[Motrix] Fixed file name structure: ${currentPath} -> ${fixedPath}`)
              pathToProcess = fixedPath
            }
          }

          const desiredPath = pathToProcess.slice(0, -downloadingFileSuffix.length)
          const originalPath = existsSync(pathToProcess)
            ? this.getUniqueCompletedPath(desiredPath)
            : desiredPath
          if (existsSync(pathToProcess) && originalPath) {
            const ok = await renameWithRetry(pathToProcess, originalPath)
            if (ok && existsSync(originalPath)) {
              console.log(`[Motrix] Removed downloading suffix: ${pathToProcess} -> ${originalPath}`)
              return originalPath
            }
          } else if (existsSync(desiredPath)) {
            return desiredPath
          }
          return existsSync(desiredPath) ? desiredPath : currentPath
        } else {
          const suffixedPath = candidatePaths.find(path => {
            return path.endsWith(downloadingFileSuffix) && existsSync(path)
          }) || `${currentPath}${downloadingFileSuffix}`
          if (existsSync(suffixedPath)) {
            const targetPath = this.getUniqueCompletedPath(
              suffixedPath.slice(0, -downloadingFileSuffix.length)
            )
            if (targetPath) {
              const ok = await renameWithRetry(suffixedPath, targetPath)
              if (ok && existsSync(targetPath)) {
                console.log(`[Motrix] Removed downloading suffix: ${suffixedPath} -> ${targetPath}`)
                return targetPath
              }
            }
          }
          return existsSync(currentPath) ? currentPath : suffixedPath
        }
      },
      autoCategorizeDownloadedFile (task, manualPath = null) {
        const cfg = this.$store.state.preference.config || {}
        const autoCategorizeEnabled = cfg.autoCategorizeFiles

        console.log('[Motrix] Auto categorize check - enabled:', autoCategorizeEnabled)

        if (!autoCategorizeEnabled) {
          console.log('[Motrix] Auto categorize files is disabled')
          return
        }

        const categories = cfg.fileCategories
        console.log('[Motrix] Auto categorize categories:', categories)

        if (!categories || Object.keys(categories).length === 0) {
          console.log('[Motrix] No file categories configured, skip auto categorize')
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
                  const fixedPath = this.fixFileNameWithSuffix(filePath, downloadingFileSuffix)
                  let pathToProcess = filePath

                  // 如果修复后的路径不同，先重命名到正确的位置
                  if (fixedPath !== filePath) {
                    const renameOk = this.renamePreserveTimes(filePath, fixedPath)
                    if (renameOk) {
                      console.log(`[Motrix] Fixed BT file name structure: ${filePath} -> ${fixedPath}`)
                      pathToProcess = fixedPath
                    } else {
                      console.warn(`[Motrix] Failed to fix BT file name structure: ${filePath} -> ${fixedPath}`)
                    }
                  }

                  const originalPath = pathToProcess.slice(0, -downloadingFileSuffix.length)
                  const ok = this.renamePreserveTimes(pathToProcess, originalPath)
                  if (ok) {
                    console.log(`[Motrix] Removed downloading suffix before categorize: ${pathToProcess} -> ${originalPath}`)
                    filePath = originalPath
                  }
                }
              }
            } catch (error) {
              console.warn(`[Motrix] Failed to normalize downloading suffix before categorize: ${error.message}`)
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

              const result = autoCategorizeDownloadedFile(filePath, baseDir, categories)
              if (result) {
                console.log(`[Motrix] File categorized successfully: ${filePath}`)
              }
            } catch (error) {
              console.error(`[Motrix] Error during auto categorization: ${error.message}`)
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
                const fixedPath = this.fixFileNameWithSuffix(filePath, downloadingFileSuffix)
                let pathToProcess = filePath

                // 如果修复后的路径不同，先重命名到正确的位置
                if (fixedPath !== filePath) {
                  const renameOk = this.renamePreserveTimes(filePath, fixedPath)
                  if (renameOk) {
                    console.log(`[Motrix] Fixed file name structure before categorize: ${filePath} -> ${fixedPath}`)
                    pathToProcess = fixedPath
                  } else {
                    console.warn(`[Motrix] Failed to fix file name structure before categorize: ${filePath} -> ${fixedPath}`)
                  }
                }

                const originalPath = pathToProcess.slice(0, -downloadingFileSuffix.length)
                const ok = this.renamePreserveTimes(pathToProcess, originalPath)
                if (ok) {
                  console.log(`[Motrix] Removed downloading suffix before categorize: ${pathToProcess} -> ${originalPath}`)
                  filePath = originalPath
                }
              } else {
                const suffixedPath = filePath + downloadingFileSuffix
                if (!existsSync(filePath) && existsSync(suffixedPath)) {
                  // 也检查这个路径是否需要修复
                  const fixedSuffixedPath = this.fixFileNameWithSuffix(suffixedPath, downloadingFileSuffix)
                  let pathToProcess = suffixedPath

                  if (fixedSuffixedPath !== suffixedPath && existsSync(suffixedPath)) {
                    const renameOk = this.renamePreserveTimes(suffixedPath, fixedSuffixedPath)
                    if (renameOk) {
                      console.log(`[Motrix] Fixed suffixed file name structure: ${suffixedPath} -> ${fixedSuffixedPath}`)
                      pathToProcess = fixedSuffixedPath
                    }
                  }

                  const targetPath = pathToProcess.slice(0, -downloadingFileSuffix.length)
                  const ok = this.renamePreserveTimes(pathToProcess, targetPath)
                  if (ok) {
                    console.log(`[Motrix] Restored downloading suffix before categorize: ${pathToProcess} -> ${targetPath}`)
                    filePath = targetPath
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`[Motrix] Failed to normalize downloading suffix before categorize: ${error.message}`)
          }
        }

        if (!existsSync(filePath)) {
          console.warn(`[Motrix] File not found for categorization: ${filePath}`)
          return
        }

        try {
          const baseDir = dirname(filePath)
          const dirName = basename(baseDir)

          if (categoryNames.includes(dirName)) {
            console.log(`[Motrix] File already in category directory: ${filePath}`)
            return
          }

          const result = autoCategorizeDownloadedFile(filePath, baseDir, categories)
          if (result) {
            console.log(`[Motrix] File categorized successfully: ${filePath}`)
          } else {
            console.warn('[Motrix] File categorization failed or file already in category')
          }
        } catch (error) {
          console.error(`[Motrix] Error during auto categorization: ${error.message}`)
        }
      },
      setFileMtimeOnComplete (task, manualPath = null) {
        const enabled = this.$store.state.preference.config.setFileMtimeOnComplete
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
          console.warn(`[Motrix] Failed to set file mtime on complete: ${error.message}`)
        }
      },
      showTaskCompleteNotify (task, isBT, path) {
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
          ? this.$t('task.bt-download-complete-message', { taskName })
          : this.$t('task.download-complete-message', { taskName })
        const tips = isBT
          ? '\n' + this.$t('task.bt-download-complete-tips')
          : ''

        this.$msg.success(`${message}${tips}`)

        if (!this.taskNotification) {
          return
        }

        const notifyMessage = isBT
          ? this.$t('task.bt-download-complete-notify')
          : this.$t('task.download-complete-notify')

        /* eslint-disable no-new */
        const notify = new Notification(notifyMessage, {
          body: `${taskName}${tips}`
        })
        const clickAction = this.taskCompleteNotifyClickAction || 'open-folder'
        notify.onclick = () => {
          if (clickAction === 'show-app') {
            this.$electron.ipcRenderer.send('command', 'application:show', { page: 'index' })
          } else if (clickAction === 'execute-file') {
            // 执行文件
            try {
              const { shell } = this.$electron
              shell.openPath(path).catch((error) => {
                console.error('Failed to execute file:', error)
                // 如果执行失败，回退到打开文件夹
                showItemInFolder(path, {
                  errorMsg: this.$t('task.file-not-exist')
                })
              })
            } catch (error) {
              console.error('Failed to execute file:', error)
              // 如果执行失败，回退到打开文件夹
              showItemInFolder(path, {
                errorMsg: this.$t('task.file-not-exist')
              })
            }
          } else {
            // 默认行为：打开文件夹
            showItemInFolder(path, {
              errorMsg: this.$t('task.file-not-exist')
            })
          }
        }
      },
      showTaskErrorNotify (task) {
        const taskName = getTaskName(task)

        const message = this.$t('task.download-fail-message', { taskName })
        this.$msg.success(message)

        if (!this.taskNotification) {
          return
        }

        /* eslint-disable no-new */
        new Notification(this.$t('task.download-fail-notify'), {
          body: taskName
        })
      },
      bindEngineEvents () {
        api.client.on('onDownloadStart', this.onDownloadStart)
        // api.client.on('onDownloadPause', this.onDownloadPause)
        api.client.on('onDownloadStop', this.onDownloadStop)
        api.client.on('onDownloadComplete', this.onDownloadComplete)
        api.client.on('onDownloadError', this.onDownloadError)
        api.client.on('onBtDownloadComplete', this.onBtDownloadComplete)
      },
      unbindEngineEvents () {
        api.client.removeListener('onDownloadStart', this.onDownloadStart)
        // api.client.removeListener('onDownloadPause', this.onDownloadPause)
        api.client.removeListener('onDownloadStop', this.onDownloadStop)
        api.client.removeListener('onDownloadComplete', this.onDownloadComplete)
        api.client.removeListener('onDownloadError', this.onDownloadError)
        api.client.removeListener('onBtDownloadComplete', this.onBtDownloadComplete)
      },
      startPolling () {
        this.stopPolling()
        this.timer = setTimeout(() => {
          this.polling()
          this.startPolling()
        }, this.interval)
      },
      kickPolling () {
        const now = Date.now()
        if (this._pollingKickAt && now - this._pollingKickAt < 400) {
          return
        }
        this._pollingKickAt = now
        this.stopPolling()
        this.timer = setTimeout(() => {
          this.polling()
          this.startPolling()
        }, 0)
      },
      polling () {
        this.pollingCount = (this.pollingCount || 0) + 1
        // 每30次polling（约30秒）保存一次平均速度
        if (this.pollingCount % 30 === 0) {
          this.persistAllActiveTasksAverageSpeed()
        }

        this.maybeEnterIdleInterval()

        const stat = (this.$store.state.app && this.$store.state.app.stat) ? this.$store.state.app.stat : {}
        const numActive = Number(stat.numActive || 0)
        const numWaiting = Number(stat.numWaiting || 0)
        const hasActiveOrWaiting = (numActive + numWaiting) > 0

        this.$store.dispatch('app/fetchGlobalStat')
        if (hasActiveOrWaiting) {
          this.$store.dispatch('app/fetchProgress')
        } else {
          this.$store.dispatch('app/clearProgress')
        }

        this.$store.dispatch('task/fetchList').then(() => {
          this.sampleAverageSpeedForActiveTasks()
          this.checkMagnetAlerts()
          this.checkDataAccessStatus()
          this.fixResumedCompletedSuffixTasks().catch(() => {})
        })

        if (this.taskDetailVisible && this.currentTaskGid) {
          // 只对活跃任务调用 fetchItemWithPeers 或 fetchItem，避免对历史记录任务调用 aria2 API
          // 通过检查任务状态来判断是否为活跃任务
          const task = this.$store.state.task.currentTaskItem
          if (task) {
            // 检查任务状态，如果是已完成、已失败或已移除状态，不调用 API
            const activeStatuses = ['active', 'waiting', 'paused']
            if (activeStatuses.includes(task.status)) {
              if (this.currentTaskIsBT && this.enabledFetchPeers) {
                this.$store.dispatch('task/fetchItemWithPeers', this.currentTaskGid)
              } else {
                this.$store.dispatch('task/fetchItem', this.currentTaskGid)
              }
            }
          }
        }
      },
      maybeRestoreSuffixNearCompletion (task) {
        try {
          const suffix = this.$store.state.preference.config.downloadingFileSuffix
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
            const ok = this.renamePreserveTimes(suffixedPath, finalPath)
            if (ok) {
              console.log(`[Motrix] Restored suffix near completion: ${suffixedPath} -> ${finalPath}`)
            }
          }
        } catch (_) {}
      },
      restoreSuffixFilesForActiveTasks () {
        const suffix = this.$store.state.preference.config.downloadingFileSuffix
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
                      require('fs').unlinkSync(finalPath)
                    } catch (e) {
                      console.warn(`[Motrix] Failed to remove empty file: ${finalPath}`, e)
                    }
                  }

                  const ok = this.renamePreserveTimes(suffixedPath, finalPath)
                  if (ok) {
                    console.log(`[Motrix] Restored suffix on startup: ${suffixedPath} -> ${finalPath}`)
                  } else {
                    console.warn(`[Motrix] Failed to restore suffix on startup: ${suffixedPath} -> ${finalPath}`)
                  }
                }
              }
            } catch (err) {
              console.warn(`[Motrix] restoreSuffixFilesForActiveTasks error for task ${task.gid}:`, err)
            }
          })
        })
      },
      persistAllActiveTasksAverageSpeed () {
        const list = this.$store.state.task.taskList || []
        list.forEach(task => {
          if (task.status === TASK_STATUS.ACTIVE) {
            this.persistAverageSpeedToHistory(task)
          }
        })
      },
      sampleAverageSpeedForActiveTasks () {
        const list = this.$store.state.task.taskList || []
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
            this.taskSpeedSampleBaseMap[gid] = { ts: now, completed: 0 }
            return
          }

          const prev = this.taskSpeedSampleBaseMap[gid]
          if (!prev || !Number.isFinite(prev.ts) || !Number.isFinite(prev.completed)) {
            this.taskSpeedSampleBaseMap[gid] = { ts: now, completed }
            return
          }

          const durationMs = now - prev.ts
          const bytes = completed - prev.completed
          if (!(durationMs > 0) || durationMs > 15000 || durationMs < 200 || bytes < 0) {
            this.taskSpeedSampleBaseMap[gid] = { ts: now, completed }
            return
          }

          this.taskSpeedSampleBaseMap[gid] = { ts: now, completed }
          this.$store.dispatch('task/addTaskSpeedSample', {
            gid,
            sample: { bytes, durationMs },
            maxSamples: 60
          })
        })

        Object.keys(this.taskSpeedSampleBaseMap || {}).forEach(gid => {
          if (!activeGids.has(gid)) {
            delete this.taskSpeedSampleBaseMap[gid]
          }
        })
      },
      async alertMagnetStatus (task) {
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
          const cfg = this.$store.state.preference?.config || {}
          const dhtListenPort = Number(cfg['dht-listen-port'] || 0)
          const dhtEnabled = dhtListenPort > 0
          this.$store.dispatch('task/updateMagnetStatus', {
            gid,
            peerCount,
            trackerCount,
            fetching: true,
            phase,
            dhtEnabled,
            updatedAt: Date.now()
          })
          this.magnetAlertedSet.add(gid)
        } catch (e) {
          console.warn('alertMagnetStatus fail:', e.message)
        }
      },
      checkMagnetAlerts () {
        const list = this.$store.state.task.taskList || []
        list.forEach(task => {
          const gid = task.gid
          const zero = Number(task.downloadSpeed) === 0
          const magnetPending = isMagnetTask(task)

          if (magnetPending && zero) {
            const count = (this.magnetZeroMap[gid] || 0) + 1
            this.magnetZeroMap[gid] = count
            const elapsedSec = Math.round(count * (this.interval / 1000))
            // 读取上一状态用于趋势判断
            const prev = (this.$store.state.task.magnetStatuses || {})[gid] || {}
            const prevPeers = Number(prev.peerCount || 0)
            const peerCount = Number((task.peers || []).length || prevPeers)
            let peerTrend = 'flat'
            if (peerCount > prevPeers) peerTrend = 'up'
            else if (peerCount < prevPeers) peerTrend = 'down'

            const cfg = this.$store.state.preference?.config || {}
            const limitStr = `${cfg['max-overall-download-limit'] || cfg.maxOverallDownloadLimit || 0}`
            const globalLimitLow = !(limitStr === '0' || Number(limitStr) >= 102400)
            const pauseMetadata = !!(cfg['pause-metadata'] || cfg.pauseMetadata)

            this.$store.dispatch('task/updateMagnetStatus', {
              gid,
              fetching: true,
              elapsedSec,
              updatedAt: Date.now(),
              peerCount,
              peerTrend,
              globalLimitLow,
              pauseMetadata
            })
            if (count >= 3 && !this.magnetAlertedSet.has(gid)) {
              this.alertMagnetStatus(task)
            }
          } else {
            this.magnetZeroMap[gid] = 0
            if (!magnetPending) {
              this.$store.dispatch('task/clearMagnetStatus', gid)
              if (this.magnetAlertedSet.has(gid)) {
                this.magnetAlertedSet.delete(gid)
              }
            }
          }
        })
      },
      checkDataAccessStatus () {
        const list = this.$store.state.task.taskList || []
        const activeStatuses = ['active']
        list.forEach(task => {
          const gid = task.gid
          const status = task.status
          const isMagnet = isMagnetTask(task)
          if (!activeStatuses.includes(status) || isMagnet) {
            this.dataAccessZeroMap[gid] = 0
            this.dataAccessLastCompletedMap[gid] = undefined
            this.$store.dispatch('task/clearDataAccessStatus', gid)
            return
          }
          const completed = Number(task.completedLength || 0)
          const speedZero = Number(task.downloadSpeed) === 0
          const lastCompleted = Number(this.dataAccessLastCompletedMap[gid] || 0)
          if (!speedZero || completed > lastCompleted) {
            this.dataAccessLastCompletedMap[gid] = completed
            this.dataAccessZeroMap[gid] = 0
            this.$store.dispatch('task/clearDataAccessStatus', gid)
            return
          }
          const count = (this.dataAccessZeroMap[gid] || 0) + 1
          this.dataAccessZeroMap[gid] = count
          const elapsedSec = Math.round(count * (this.interval / 1000))
          this.$store.dispatch('task/updateDataAccessStatus', {
            gid,
            elapsedSec,
            updatedAt: Date.now()
          })
        })

        this.pruneInternalMapsByTaskList(list)
      },
      pruneInternalMapsByTaskList (list) {
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

        this.magnetZeroMap = pruneObj(this.magnetZeroMap)
        this.dataAccessZeroMap = pruneObj(this.dataAccessZeroMap)
        this.dataAccessLastCompletedMap = pruneObj(this.dataAccessLastCompletedMap)

        if (this.magnetAlertedSet && this.magnetAlertedSet.size > 0) {
          Array.from(this.magnetAlertedSet).forEach(gid => {
            if (!gidSet.has(`${gid}`)) {
              this.magnetAlertedSet.delete(gid)
            }
          })
        }

        if (this.downloadStartNotifiedGids && this.downloadStartNotifiedGids.size > 0) {
          Array.from(this.downloadStartNotifiedGids).forEach(gid => {
            if (!gidSet.has(`${gid}`)) {
              this.downloadStartNotifiedGids.delete(gid)
            }
          })
          capSet(this.downloadStartNotifiedGids, 2000)
        }

        if (this._resumedCompletedFixedGids && this._resumedCompletedFixedGids.size > 0) {
          Array.from(this._resumedCompletedFixedGids).forEach(gid => {
            if (!gidSet.has(`${gid}`)) {
              this._resumedCompletedFixedGids.delete(gid)
            }
          })
          capSet(this._resumedCompletedFixedGids, 2000)
        }

        if (this._bilibiliMergeNotified && this._bilibiliMergeNotified.size > 0) {
          Array.from(this._bilibiliMergeNotified).forEach(gid => {
            if (!gidSet.has(`${gid}`)) {
              this._bilibiliMergeNotified.delete(gid)
            }
          })
          capSet(this._bilibiliMergeNotified, 500)
        }
      },
      resolveErrorReason (errorCode, errorMessage = '') {
        const code = Number(errorCode)
        if (!code) {
          return ''
        }
        const msg = `${errorMessage || ''}`
        if (code === 3) {
          return this.$t('task.error-reason-not-found')
        }
        if (code === 1) {
          // Fake-IP 错误（代理软件）
          if (/fake-ip|198\.18\.|198\.19\./i.test(msg)) {
            return this.$t('task.error-reason-fake-ip')
          }
          // DNS 解析错误
          if (/DNS|name resolution|hostname|getaddrinfo|no data/i.test(msg)) {
            return this.$t('task.error-reason-dns')
          }
          // SSL/TLS 错误
          if (/SSL|TLS|certificate/i.test(msg)) {
            return this.$t('task.error-reason-ssl')
          }
          // 连接超时
          if (/timeout|timed out/i.test(msg)) {
            return this.$t('task.error-reason-timeout')
          }
          // 连接被拒绝
          if (/connection refused|refused/i.test(msg)) {
            return this.$t('task.error-reason-refused')
          }
          return this.$t('task.error-reason-network')
        }
        if (code === 16) {
          if (/Permission denied|permission/i.test(msg)) {
            return this.$t('task.error-reason-permission')
          }
          if (/No space left|disk full/i.test(msg)) {
            return this.$t('task.error-reason-disk-full')
          }
          return this.$t('task.error-reason-disk')
        }
        return this.$t('task.error-reason-generic')
      },
      stopPolling () {
        clearTimeout(this.timer)
        this.timer = null
      },
      async fixResumedCompletedSuffixTasks () {
        const cfg = this.$store.state.preference && this.$store.state.preference.config
          ? this.$store.state.preference.config
          : {}
        const suffix = cfg.downloadingFileSuffix || ''
        if (!suffix) {
          return
        }

        const now = Date.now()
        if (this._resumedCompletedFixing) {
          return
        }
        if (this._resumedCompletedLastRun && now - this._resumedCompletedLastRun < 5000) {
          return
        }
        this._resumedCompletedLastRun = now

        const list = this.$store.state.task.taskList || []
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

        this._resumedCompletedFixing = true
        try {
          let changed = false
          for (const task of candidates) {
            const gid = task.gid ? `${task.gid}` : ''
            if (!gid) continue
            if (this._resumedCompletedFixedGids && this._resumedCompletedFixedGids.has(gid)) {
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

            if (!this._resumedCompletedFixedGids) {
              this._resumedCompletedFixedGids = new Set()
            }
            this._resumedCompletedFixedGids.add(gid)

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
            await this.$store.dispatch('task/fetchList')
          }
        } finally {
          this._resumedCompletedFixing = false
        }
      }
    },
    created () {
      if (this.isPreferenceWindow()) {
        return
      }
      this.bindEngineEvents()
      this._resumedCompletedFixing = false
      this._resumedCompletedLastRun = 0
      this._resumedCompletedFixedGids = new Set()
      this._bilibiliMergeNotified = new Set()
      this._dashMergeJobs = new Map()
      this._pollingKickAt = 0
    },
    mounted () {
      if (this.isPreferenceWindow()) {
        return
      }
      setTimeout(() => {
        this.$store.dispatch('app/fetchEngineInfo')
        this.$store.dispatch('app/fetchEngineOptions')

        this.startPolling()
      }, 100)

      this._visibilityHandler = () => {
        this.maybeEnterIdleInterval()
        if (typeof document !== 'undefined' && document && !document.hidden) {
          this.kickPolling()
        }
      }
      if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', this._visibilityHandler)
      }
    },
    destroyed () {
      if (this.isPreferenceWindow()) {
        return
      }
      this.$store.dispatch('task/saveSession')

      this.unbindEngineEvents()

      this.stopPolling()

      if (this._visibilityHandler && typeof document !== 'undefined' && document && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', this._visibilityHandler)
      }
    }
  }
</script>

<style>
 </style>
