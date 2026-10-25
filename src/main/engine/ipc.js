/**
 * 渲染进程 ↔ 主进程媒体引擎 IPC。
 *
 * 契约（两端共用 `@shared/zuvrust` 的 `MEDIA_ENGINE_IPC`）：
 *   请求 → `{ ok:true, result }` / `{ ok:false, error:{message,kind,retryable,code,exitCode} }`
 *   进度 → `media-engine:progress` `{ jobId, type, data }`
 *
 * 所有引擎通信都在主进程的 `MediaEngineService` 里完成；渲染进程不再 spawn。
 */

import { ipcMain } from 'electron'
import { MEDIA_ENGINE_IPC } from '@shared/zuvrust'
import { mediaEngineService, serializeEngineError } from './MediaEngineService'
import logger from '../core/LogManager'

const activeJobs = new Map()
let registered = false

function fail (error) {
  return { ok: false, error: serializeEngineError(error) }
}

function ok (result) {
  return { ok: true, result }
}

function invalid (message) {
  return {
    ok: false,
    error: { message, kind: 'invalid-params', retryable: false, code: 1002, exitCode: 2 }
  }
}

async function runJob (event, payload, fn) {
  const jobId = payload && typeof payload.jobId === 'string' ? payload.jobId : ''
  if (!jobId) return invalid('missing jobId')
  if (activeJobs.has(jobId)) return invalid(`jobId already in use: ${jobId}`)
  const controller = new AbortController()
  activeJobs.set(jobId, controller)
  const onProgress = (data, type) => {
    try {
      if (!event.sender.isDestroyed()) {
        event.sender.send(MEDIA_ENGINE_IPC.PROGRESS, { jobId, type, data })
      }
    } catch (_) {}
  }
  try {
    const result = await fn(controller.signal, onProgress)
    return ok(result)
  } catch (error) {
    return fail(error)
  } finally {
    activeJobs.delete(jobId)
  }
}

export function registerMediaEngineIpc () {
  if (registered) return
  registered = true

  ipcMain.handle(MEDIA_ENGINE_IPC.STATUS, async () => {
    return mediaEngineService.status()
  })

  ipcMain.handle(MEDIA_ENGINE_IPC.PROBE, async (_event, payload = {}) => {
    try {
      const options = { ...payload }
      delete options.jobId
      return ok(await mediaEngineService.probe(payload.input, options))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(MEDIA_ENGINE_IPC.MUX, async (event, payload = {}) => {
    return runJob(event, payload, (signal, onProgress) => {
      return mediaEngineService.mux(payload.output, payload.inputs, {
        fragmentMs: payload.fragmentMs,
        tracks: payload.tracks,
        signal,
        onProgress
      })
    })
  })

  ipcMain.handle(MEDIA_ENGINE_IPC.REMUX, async (event, payload = {}) => {
    return runJob(event, payload, (signal, onProgress) => {
      return mediaEngineService.remux(payload.output, payload.input, {
        fragmentMs: payload.fragmentMs,
        tracks: payload.tracks,
        signal,
        onProgress
      })
    })
  })

  ipcMain.handle(MEDIA_ENGINE_IPC.DOWNLOAD, async (event, payload = {}) => {
    return runJob(event, payload, (signal, onProgress) => {
      return mediaEngineService.download(payload.input, {
        output: payload.output,
        maxHeight: payload.maxHeight,
        maxBandwidth: payload.maxBandwidth,
        signal,
        onProgress
      })
    })
  })

  ipcMain.handle(MEDIA_ENGINE_IPC.DECODE, async (event, payload = {}) => {
    return runJob(event, payload, (signal, onProgress) => {
      return mediaEngineService.decode(payload.input, {
        audio: payload.audio,
        out: payload.out,
        count: payload.count,
        seek: payload.seek,
        noGrow: payload.noGrow,
        decodeMode: payload.decodeMode,
        threads: payload.threads,
        signal,
        onProgress
      })
    })
  })

  ipcMain.handle(MEDIA_ENGINE_IPC.CANCEL, async (_event, payload = {}) => {
    const controller = activeJobs.get(payload.jobId)
    if (!controller) {
      return ok({ cancelled: false })
    }
    controller.abort()
    logger.info(`[Lerxu] 取消媒体引擎任务 ${payload.jobId}`)
    return ok({ cancelled: true })
  })
}
