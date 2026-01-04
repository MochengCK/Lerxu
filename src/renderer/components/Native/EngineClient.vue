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
    showItemInFolder
  } from '@/utils/native'

  import { checkTaskIsBT, getTaskName, isMagnetTask } from '@shared/utils'
  import { TASK_STATUS } from '@shared/constants'
  import { spawn, spawnSync } from 'node:child_process'
  import { existsSync, renameSync, mkdirSync, utimesSync, statSync, readdirSync, unlinkSync } from 'node:fs'
  import { dirname, basename, resolve, isAbsolute } from 'node:path'
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
        downloadStartNotifiedGids: new Set()
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
      renamePreserveTimes (from, to) {
        try {
          const st = statSync(from)
          renameSync(from, to)
          try {
            utimesSync(to, st.atime, st.mtime)
          } catch (e) {}
          return true
        } catch (e) {
          try {
            renameSync(from, to)
            return true
          } catch (_) {
            return false
          }
        }
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
            const { dir } = task
            this.$store.dispatch('preference/recordHistoryDirectory', dir)
            const taskName = getTaskName(task)
            const cfg = this.$store.state.preference.config || {}
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
              const fromReferer = !!(opt && opt.referer && /^https?:/i.test(`${opt.referer}`))
              if (!isBilibiliPart) {
                if (fromHeader || fromReferer) {
                  const message = this.$t('task.download-start-browser-message')
                  this.$msg.info(message)
                  if (is.windows()) {
                    const notify = new Notification(message, { body: taskName })
                    notify.onclick = () => {
                      this.$electron.ipcRenderer.send('command', 'application:show', { page: 'index' })
                    }
                  }
                } else {
                  const message = this.$t('task.download-start-message', { taskName })
                  this.$msg.info(message)
                }
              }
            } catch (_) {}

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
            const taskName = getTaskName(task)
            const message = this.$t('task.download-pause-message', { taskName })
            this.$msg.info(message)
          })
      },
      onDownloadStop (event) {
        const [{ gid }] = event
        this.fetchTaskItem({ gid })
          .then((task) => {
            const taskName = getTaskName(task)
            const message = this.$t('task.download-stop-message', { taskName })
            this.$msg.info(message)
          })
      },
      onDownloadError (event) {
        const [{ gid }] = event
        this.fetchTaskItem({ gid })
          .then((task) => {
            const taskName = getTaskName(task)
            const { errorCode, errorMessage } = task
            console.error(`[Motrix] download error gid: ${gid}, #${errorCode}, ${errorMessage}`)
            const reason = this.resolveErrorReason(errorCode, errorMessage)
            const message = reason
              ? this.$t('task.download-error-with-reason', { taskName, reason })
              : this.$t('task.download-error-message', { taskName })
            const link = `<a target="_blank" href="https://github.com/agalwood/Motrix/wiki/Error#${errorCode}" rel="noopener noreferrer">${errorCode}</a>`
            this.$msg({
              type: 'error',
              showClose: true,
              duration: 5000,
              dangerouslyUseHTMLString: true,
              message: `${message} ${link}`
            })
          })
      },
      onDownloadComplete (event) {
        this.$store.dispatch('task/fetchList')
        const [{ gid }] = event
        this.$store.dispatch('task/removeFromSeedingList', gid)

        this.fetchTaskItem({ gid })
          .then((task) => {
            this.handleDownloadComplete(task, false)
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
            this.handleDownloadComplete(task, true)
          })
      },
      async handleDownloadComplete (task, isBT) {
        const cfg = this.$store.state.preference.config || {}
        const path = getTaskActualPath(task, cfg)
        const finalPath = isBT ? path : this.removeDownloadingSuffix(task, path, cfg)
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
        }

        this.$store.dispatch('task/saveSession')
        this.persistAverageSpeedToHistory(task)
        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (gid) {
            taskHistory.updateTask(gid, { ...task, status: TASK_STATUS.COMPLETE }, task)
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

        const mergeResult = await this.maybeMergeBilibiliDash(finalPath, task)
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
          let notified = false
          if (isBilibiliPart || (mergeResult && mergeResult.isBilibiliPart)) {
            try {
              const key = resolve(mergeResult.mergedPath)
              if (!this._bilibiliMergeNotified) {
                this._bilibiliMergeNotified = new Set()
              }
              if (!this._bilibiliMergeNotified.has(key)) {
                this._bilibiliMergeNotified.add(key)
                const notifyPath = mergeResult.mergedPath
                this.showTaskCompleteNotify(task, isBT, notifyPath)
                this.$electron.ipcRenderer.send('event', 'task-download-complete', task, notifyPath)
                notified = true
              }
            } catch (_) {}
          }
          if (!notified) {
            const notifyPath = mergeResult.mergedPath
            this.showTaskCompleteNotify(task, isBT, notifyPath)
            this.$electron.ipcRenderer.send('event', 'task-download-complete', task, notifyPath)
          }
        } else if (!(mergeResult && mergeResult.isBilibiliPart)) {
          this.autoCategorizeDownloadedFile(task, finalPath)
        }
      },
      looksLikeBilibiliSource (referer, headers) {
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
            if (host.includes('bilibili.com') || host.includes('b23.tv')) {
              return true
            }
          } catch (_) {}
        }
        return false
      },
      parseBilibiliDashPart (fullPath) {
        try {
          const p = fullPath ? `${fullPath}` : ''
          if (!p) return null
          const file = basename(p)
          const m1 = file.match(/^(.*)_(video\.mp4|audio\.m4a)$/i)
          if (m1) {
            const base = m1[1] ? `${m1[1]}` : ''
            if (!base) return null
            return { dir: dirname(p), base, type: 'named' }
          }
          const m2 = file.match(/^(.+)-\d+\.m4s$/i)
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
          const k = kind === 'video' ? 'video.mp4' : 'audio.m4a'
          if (!rd || !b) return []
          const file = `${b}_${k}`
          candidates.add(resolve(rd, file))
          const categories = cfg && cfg.fileCategories
          const auto = !!(cfg && cfg.autoCategorizeFiles)
          if (auto && categories && Object.keys(categories).length > 0) {
            const categorized = buildCategorizedPath(resolve(rd, file), file, categories, rd)
            if (categorized && categorized.categorizedPath) {
              candidates.add(resolve(`${categorized.categorizedPath}`))
            }
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
        try {
          const root = resolve(process.cwd(), 'ffmpeg-8.0.1-essentials_build')
          candidates.push(
            resolve(root, 'bin', 'ffmpeg.exe'),
            resolve(root, 'ffmpeg.exe'),
            resolve(root, 'bin', 'ffmpeg'),
            resolve(root, 'ffmpeg')
          )
        } catch (_) {}
        try {
          const rp = process && process.resourcesPath ? `${process.resourcesPath}` : ''
          if (rp) {
            const root = resolve(rp, 'ffmpeg-8.0.1-essentials_build')
            candidates.push(
              resolve(root, 'bin', 'ffmpeg.exe'),
              resolve(root, 'ffmpeg.exe'),
              resolve(root, 'bin', 'ffmpeg'),
              resolve(root, 'ffmpeg')
            )
          }
        } catch (_) {}
        candidates.push('ffmpeg')
        return candidates.find(p => (p === 'ffmpeg' ? true : existsSync(p))) || ''
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
      async maybeMergeBilibiliDash (finalPath, task = null) {
        const info = this.parseBilibiliDashPart(finalPath)
        if (!info) {
          return { isBilibiliPart: false, mergedPath: '' }
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
            return { isBilibiliPart: true, mergedPath: '' }
          }
          const videoPath = readyParts[0].path
          const audioPath = readyParts[1].path
          const ffmpegPath = this.resolveFfmpegPath()
          if (!ffmpegPath) {
            return { isBilibiliPart: true, mergedPath: '' }
          }
          const outputPath = resolve(dir, `${base}.mp4`)
          try {
            if (existsSync(outputPath)) {
              return { isBilibiliPart: true, mergedPath: outputPath }
            }
          } catch (_) {}
          try {
            await this.runFfmpegMux(ffmpegPath, videoPath, audioPath, outputPath)
            const finalOutputPath = this.afterBilibiliMerge(task, info, videoPath, audioPath, outputPath)
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
          return { isBilibiliPart: true, mergedPath: '' }
        }

        const outputDir = dirname(videoPath || finalPath || rootDir || dir)
        const outputPath = resolve(outputDir, `${base}.mp4`)
        try {
          if (existsSync(outputPath)) {
            return { isBilibiliPart: true, mergedPath: outputPath }
          }
        } catch (_) {}

        const ffmpegPath = this.resolveFfmpegPath()
        if (!ffmpegPath) {
          return { isBilibiliPart: true, mergedPath: '' }
        }

        try {
          await this.runFfmpegMux(ffmpegPath, videoPath, audioPath, outputPath)
          const finalOutputPath = this.afterBilibiliMerge(task, info, videoPath, audioPath, outputPath)
          return { isBilibiliPart: true, mergedPath: finalOutputPath || outputPath }
        } catch (e) {
          console.warn(`[Motrix] FFmpeg merge failed: ${e && e.message ? e.message : e}`)
          return { isBilibiliPart: true, mergedPath: '' }
        }
      },
      afterBilibiliMerge (task, info, videoPath, audioPath, outputPath) {
        let finalOutputPath = outputPath
        try {
          const toDelete = new Set()
          const outAbs = outputPath ? resolve(outputPath) : ''
          const addCandidate = (p) => {
            if (!p) return
            const full = resolve(p)
            if (outAbs && resolve(full) === outAbs) return
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
                  if (s === `${base}_video.mp4` || s === `${base}_audio.m4a`) {
                    toDelete.add(full)
                    toDelete.add(`${full}.aria2`)
                  }
                }
              })
            }
          } catch (_) {}

          toDelete.forEach(p => {
            try {
              if (p && existsSync(p)) {
                unlinkSync(p)
              }
            } catch (_) {}
          })
        } catch (_) {}

        try {
          const outAbs = finalOutputPath ? resolve(finalOutputPath) : ''
          const dirFromTask = task && task.dir ? `${task.dir}` : ''
          const baseDir = dirFromTask || (finalOutputPath ? dirname(finalOutputPath) : '')
          if (task && Array.isArray(task.files)) {
            task.files.forEach(file => {
              try {
                const raw = file && file.path ? `${file.path}` : ''
                if (!raw) {
                  return
                }
                const full = isAbsolute(raw) ? resolve(raw) : resolve(baseDir, raw)
                if (outAbs && resolve(full) === outAbs) {
                  return
                }
                if (existsSync(full)) {
                  unlinkSync(full)
                }
                const aria2Path = `${full}.aria2`
                try {
                  if (existsSync(aria2Path)) {
                    unlinkSync(aria2Path)
                  }
                } catch (_) {}
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
          if (task && task.name) {
            let n = basename(`${task.name}`)
            n = n.replace(/\.[^.]+$/i, '')
            n = n.replace(/_video$/i, '')
            if (n) {
              titleBase = n
            }
          }
          if (dirOut && titleBase) {
            const candidate = resolve(dirOut, `${titleBase}${targetExt}`)
            if (targetExt === '.mp4') {
              if (resolve(candidate) !== resolve(outputPath)) {
                let renamed = false
                if (existsSync(candidate)) {
                  finalOutputPath = candidate
                  renamed = true
                } else {
                  const ok = this.renamePreserveTimes(outputPath, candidate)
                  if (ok) {
                    finalOutputPath = candidate
                    renamed = true
                  }
                }
                if (!renamed) {
                  finalOutputPath = outputPath
                }
              } else {
                finalOutputPath = candidate
              }
            } else {
              if (existsSync(candidate)) {
                finalOutputPath = candidate
              } else {
                try {
                  const ffmpegPath = this.resolveFfmpegPath()
                  if (ffmpegPath) {
                    const cmd = ffmpegPath || ''
                    const args = [
                      '-y',
                      '-hide_banner',
                      '-loglevel', 'error',
                      '-i', outputPath,
                      '-c', 'copy',
                      candidate
                    ]
                    const result = spawnSync(cmd, args, { windowsHide: true })
                    if (result && result.status === 0 && existsSync(candidate)) {
                      finalOutputPath = candidate
                    }
                  }
                } catch (_) {}
              }
            }
          }
          try {
            if (outputPath && finalOutputPath && resolve(outputPath) !== resolve(finalOutputPath)) {
              const orig = resolve(outputPath)
              try {
                if (existsSync(orig)) {
                  unlinkSync(orig)
                }
              } catch (_) {}
              const origAria2 = `${orig}.aria2`
              try {
                if (existsSync(origAria2)) {
                  unlinkSync(origAria2)
                }
              } catch (_) {}
            }
          } catch (_) {}
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
            status: TASK_STATUS.COMPLETE,
            dir: dirname(finalOutputPath),
            files,
            totalLength: `${length}`,
            completedLength: `${length}`
          }
          taskHistory.updateTask(gid, patch, task)
        } catch (_) {}

        try {
          const gid = task && task.gid ? `${task.gid}` : ''
          if (gid && finalOutputPath) {
            const history = taskHistory.getHistory() || []
            let currentTitle = ''
            try {
              const self = history.find(t => t && t.gid === gid)
              if (self && self.bilibiliTitle) {
                currentTitle = `${self.bilibiliTitle}`.trim()
              }
            } catch (_) {}
            history.forEach(item => {
              try {
                if (!item || !item.gid) {
                  return
                }
                if (item.gid === gid) {
                  return
                }
                const t = item.bilibiliTitle ? `${item.bilibiliTitle}`.trim() : ''
                if (currentTitle && t && t !== currentTitle) {
                  return
                }
                const files = Array.isArray(item.files) ? item.files : []
                if (!files.length) {
                  return
                }
                const first = files[0] || {}
                const p = first && first.path ? `${first.path}` : ''
                if (!p) {
                  return
                }
                const base = basename(p)
                const looksLikePart = base.toLowerCase().endsWith('_video.mp4') ||
                  base.toLowerCase().endsWith('_audio.m4a') ||
                  /\.m4s$/i.test(base)
                let missing = false
                try {
                  missing = !existsSync(p)
                } catch (_) {}
                if (!looksLikePart && !missing) {
                  return
                }
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

          taskHistory.updateTask(gid, { averageDownloadSpeed: avg, averageSpeedSampleCount: count }, task)
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

      removeDownloadingSuffix (task, manualPath = '', preferenceConfig = null) {
        const cfg = preferenceConfig || this.$store.state.preference.config || {}
        const downloadingFileSuffix = cfg.downloadingFileSuffix || ''

        const currentPath = manualPath || getTaskActualPath(task, cfg) || getTaskFullPath(task)
        if (!currentPath || !downloadingFileSuffix) {
          return currentPath
        }

        if (currentPath.endsWith(downloadingFileSuffix)) {
          // 首先尝试修复文件名中的序号位置
          const fixedPath = this.fixFileNameWithSuffix(currentPath, downloadingFileSuffix)
          let pathToProcess = currentPath

          // 如果修复后的路径不同，先重命名到正确的位置
          if (fixedPath !== currentPath && existsSync(currentPath)) {
            const renameOk = this.renamePreserveTimes(currentPath, fixedPath)
            if (renameOk) {
              console.log(`[Motrix] Fixed file name structure: ${currentPath} -> ${fixedPath}`)
              pathToProcess = fixedPath
            } else {
              console.warn(`[Motrix] Failed to fix file name structure: ${currentPath} -> ${fixedPath}`)
            }
          }

          const originalPath = pathToProcess.slice(0, -downloadingFileSuffix.length)
          // 尝试重命名
          if (existsSync(pathToProcess)) {
            const ok = this.renamePreserveTimes(pathToProcess, originalPath)
            if (ok) {
              console.log(`[Motrix] Removed downloading suffix: ${pathToProcess} -> ${originalPath}`)
              return originalPath
            } else {
              console.warn(`[Motrix] Failed to remove downloading suffix: ${pathToProcess} -> ${originalPath}`)
            }
          } else if (existsSync(originalPath)) {
            // 如果原文件已存在（可能已经被重命名），直接返回原路径
            return originalPath
          }
          // 如果都不存在，假设原路径是目标路径
          return originalPath
        } else {
          const suffixedPath = currentPath + downloadingFileSuffix
          if (existsSync(suffixedPath)) {
            const ok = this.renamePreserveTimes(suffixedPath, currentPath)
            if (ok) {
              console.log(`[Motrix] Removed downloading suffix: ${suffixedPath} -> ${currentPath}`)
              return currentPath
            } else {
              console.warn(`[Motrix] Failed to remove downloading suffix: ${suffixedPath} -> ${currentPath}`)
            }
          }
          return currentPath
        }
      },
      autoCategorizeDownloadedFile (task, manualPath = null) {
        const cfg = this.$store.state.preference.config || {}
        const autoCategorizeEnabled = cfg.autoCategorizeFiles

        if (!autoCategorizeEnabled) {
          console.log('[Motrix] Auto categorize files is disabled')
          return
        }

        const categories = cfg.fileCategories
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
          } else {
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
        this.timer = setTimeout(() => {
          this.polling()
          this.startPolling()
        }, this.interval)
      },
      polling () {
        this.pollingCount = (this.pollingCount || 0) + 1
        // 每30次polling（约30秒）保存一次平均速度
        if (this.pollingCount % 30 === 0) {
          this.persistAllActiveTasksAverageSpeed()
        }

        this.$store.dispatch('app/fetchGlobalStat')
        this.$store.dispatch('app/fetchProgress')
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
          const peers = Array.isArray(detailed.peers) ? detailed.peers : []
          const bt = detailed.bittorrent || {}
          const announceList = bt.announceList || []
          const trackerCount = Array.isArray(announceList) ? announceList.length : 0
          const peerCount = peers.length

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
        const activeStatuses = ['active', 'waiting']
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
          if (/SSL|TLS|certificate/i.test(msg)) {
            return this.$t('task.error-reason-ssl')
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
              taskHistory.updateTask(gid, { ...historyTask, status: TASK_STATUS.COMPLETE }, historyTask)
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
      this.bindEngineEvents()
      this._resumedCompletedFixing = false
      this._resumedCompletedLastRun = 0
      this._resumedCompletedFixedGids = new Set()
      this._bilibiliMergeNotified = new Set()
    },
    mounted () {
      setTimeout(() => {
        this.$store.dispatch('app/fetchEngineInfo')
        this.$store.dispatch('app/fetchEngineOptions')

        this.startPolling()
      }, 100)
    },
    destroyed () {
      this.$store.dispatch('task/saveSession')

      this.unbindEngineEvents()

      this.stopPolling()
    }
  }
</script>

<style>
 </style>
