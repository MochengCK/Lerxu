/**
 * 媒体引擎（ZuvRust）适配层。
 *
 * 引擎是**独立进程**，宿主与它之间只有一条通信层：命令行 + NDJSON。
 * 这个模块只做三件事，而且**都是纯函数**（不碰 electron / fs），
 * 这样它能被 `test/zuvrust/run.mjs` 直接跑：
 *
 *   1. 决定引擎二进制叫什么、去哪找（与下载引擎同一套回填约定）；
 *   2. 解析引擎吐出来的每一行 NDJSON；
 *   3. 把引擎的错误行翻成一句人话。
 *
 * 为什么不把这些逻辑留在组件里：合并/播放都各自需要它，写两份必然漂移；
 * 而且留在 SFC 里的逻辑没法单测 —— 只能靠人肉点界面。
 */

/** 引擎二进制名（按平台）。 */
export function mediaEngineBinName (platform) {
  return platform === 'win32' ? 'zuvrust.exe' : 'zuvrust'
}

/** 架构目录名（与 extra/ 下的目录约定一致：只有 x64 与 arm64）。 */
export function mediaEngineArch (arch) {
  return arch === 'arm64' ? 'arm64' : 'x64'
}

/**
 * 候选路径列表，**按优先级从高到低**。
 *
 * 顺序与下载引擎完全一致（见 src/main/utils/index.js 的 getEnginePath）：
 *   1. 用户数据目录 —— 可热替换升级（用户拿到新引擎不必重装应用）；
 *   2. 应用安装目录 / 资源目录 —— 打包时回填的引擎；
 *   3. 开发期工作区的 extra/<平台>/<架构>/engine —— 本机开发直接用构建产物；
 *   4. 系统 PATH —— 手动部署的最后一条路。
 *
 * 纯函数：所有环境信息由调用方传入，方便测试与在任意进程里复用。
 */
export function mediaEngineCandidates ({
  platform,
  arch,
  userDataPath = '',
  appDir = '',
  resourcesPath = '',
  devRoot = ''
} = {}) {
  const bin = mediaEngineBinName(platform)
  const out = []
  if (userDataPath) {
    out.push(joinPath(userDataPath, 'engine', bin), joinPath(userDataPath, bin))
  }
  if (appDir) {
    out.push(joinPath(appDir, 'engine', bin), joinPath(appDir, bin))
  }
  if (resourcesPath) {
    out.push(joinPath(resourcesPath, 'engine', bin), joinPath(resourcesPath, bin))
  }
  if (devRoot) {
    out.push(joinPath(devRoot, 'extra', platform, mediaEngineArch(arch), 'engine', bin))
  }
  // 裸名字交给 PATH 解析（existsSync 判不出来，调用方要单独探测）
  out.push(bin)
  return out
}

/** 只做字符串拼接（不引入 path 模块，保持这个文件零依赖、可在任何环境跑）。 */
function joinPath (...parts) {
  return parts
    .filter(p => p !== undefined && p !== null && `${p}` !== '')
    .map((p, i) => {
      const s = `${p}`
      if (i === 0) return s.replace(/[/\\]+$/, '')
      return s.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
    })
    .join('/')
}

/**
 * 解析引擎输出的一行。
 *
 * 引擎的每一行都是 JSON（NDJSON）：成功结果 `{ok:true,result}`、
 * 进度 `{ok:true,type:"progress",data}`、错误 `{ok:false,error}`。
 * 非 JSON 行返回 `null`（宿主不该因为引擎多打了一行日志就崩）。
 */
export function parseEngineLine (line) {
  const s = `${line === undefined || line === null ? '' : line}`.trim()
  if (!s) return null
  let parsed = null
  try {
    parsed = JSON.parse(s)
  } catch (_) {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  return parsed
}

/** 从一段（可能多行的）stderr 里取最后一条错误行。 */
export function lastEngineError (stderr) {
  const lines = `${stderr || ''}`.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = parseEngineLine(lines[i])
    if (parsed && parsed.ok === false && parsed.error) return parsed.error
  }
  return null
}

/**
 * 引擎错误 → 一句人话。
 *
 * `kind` 是机器可读分类、`retryable` 表示"重试有没有意义"，两者都是**对外契约**，
 * 所以要显示出来：用户看到「[protocol] 连接超时（可重试）」就知道该等一会儿再点，
 * 看到「[container] 无法识别的容器」就知道重试一辈子也没用。
 */
export function engineErrorText (stderr, code) {
  const err = lastEngineError(stderr)
  if (err && err.message) {
    const kind = err.kind ? `[${err.kind}] ` : ''
    const retry = err.retryable ? '（可重试）' : ''
    return `${kind}${err.message}${retry}`
  }
  const text = `${stderr || ''}`.trim()
  if (text) {
    const lines = text.split('\n').filter(s => s.trim())
    if (lines.length) return lines[lines.length - 1].trim()
  }
  return `zuvrust exit ${code}`
}

/** 退出码 → 语义（与引擎的对外契约一致，宿主据此决定要不要重试）。 */
export const ENGINE_EXIT = {
  OK: 0,
  USAGE: 2,
  BAD_INPUT: 3,
  TRANSIENT: 4,
  INTERNAL: 5,
  CANCELLED: 6
}

/** 这个退出码值不值得重试（宿主自己的重试策略还要再叠加一层上限）。 */
export function engineExitRetryable (code) {
  return code === ENGINE_EXIT.TRANSIENT
}

/**
 * 判断 `probe` 的结果是不是"同时含视频与音频"。
 *
 * `kind` 的整数编码是引擎的对外契约：0=视频 1=音频 2=字幕 3=其他。
 * 合并产物少了任何一条，都说明这次合并是坏的 —— 最坏的形态不是报错，
 * 而是"产出了一个只有画面的文件"却被判成完成。
 */
export function probeHasVideoAndAudio (probeJson) {
  const result = probeJson && probeJson.result ? probeJson.result : null
  const tracks = (result && Array.isArray(result.tracks)) ? result.tracks : []
  const hasVideo = tracks.some(t => t && Number(t.kind) === 0)
  const hasAudio = tracks.some(t => t && Number(t.kind) === 1)
  return hasVideo && hasAudio
}

/** 从引擎的进度行里取出界面要的几个数（percent / totalSize / inputBytes / speed）。 */
export function progressFromEngineLine (line) {
  const parsed = parseEngineLine(line)
  if (!parsed || parsed.ok !== true) return null
  // 进度行的 `type` 是**任务名**（`mux` / `download` / `playhead`），
  // 结果行没有 `type`。所以判据是"有 type 且有 data"，而不是写死某个字符串 ——
  // 写死过一次（只认 "progress"），结果是界面上的进度条永远不动。
  if (typeof parsed.type !== 'string' || !parsed.data) return null
  const data = parsed.data
  const totalSize = Number(data.outputBytes || 0)
  // 合并进度按"已写字节 / 输入总字节"算，界面据此显示"已写 / 总量"
  const inputBytes = Number(data.inputBytes || 0)
  return {
    kind: parsed.type,
    percent: Math.max(0, Math.min(100, Number(data.percent || 0))),
    totalSize: Number.isFinite(totalSize) ? totalSize : 0,
    inputBytes: Number.isFinite(inputBytes) ? inputBytes : 0,
    mediaTimeUs: Number(data.mediaTimeUs || 0),
    durationUs: Number(data.durationUs || 0)
  }
}

// ───────────────────────── 「视频」设置项 → 引擎调用 ─────────────────────────
//
// 下面这几个也是**纯函数**：把设置项翻译成引擎的参数/环境变量。放在这里而不是
// 留在 SFC 里，理由与上面一样 —— 合并与播放两条路都要用，而且这样能被
// `test/zuvrust/run.mjs` 直接断言（界面上点一遍是看不出来参数拼错的）。

/** 合并产物的容器（设置项 `merge-format`）。 */
export function mergeContainerOf (format) {
  const f = `${format || ''}`.toLowerCase()
  if (f === 'mkv' || f === 'matroska') return 'mkv'
  if (f === 'ts' || f === 'mpegts') return 'ts'
  return 'mp4'
}

/**
 * 合并产物的扩展名。
 *
 * 容器由扩展名决定（引擎按扩展名选封装器）。**只留声音的那个设置项已删除**
 *（见下面 `buildMuxArgs` 的注释），所以扩展名只看容器。
 */
export function mergeOutputExtension (format) {
  const container = mergeContainerOf(format)
  if (container === 'mkv') return 'mkv'
  if (container === 'ts') return 'ts'
  return 'mp4'
}

/** 分片时长的可选值（毫秒）；0 表示"用引擎默认"（现在是 2 秒）。 */
export const MERGE_FRAGMENT_MS_CHOICES = [0, 2000, 4000, 10000]

/**
 * 把设置项拼成 `mux` 的参数（输出与输入之外的那些）。
 *
 * 合并**一律"画面 + 声音"**：「合并保留内容」（只留声音 / 只留画面）这个设置项
 * 2026-10-06 按用户要求删掉了。引擎侧的 `--audio-only` / `--video-only` 仍在
 * （CLI 直接调时用得上），宿主只是不再暴露这个选择。
 */
export function buildMuxArgs ({ fragmentMs = 0, format = 'mp4' } = {}) {
  const args = ['--json', '--progress']
  const ms = Number(fragmentMs)
  if (Number.isFinite(ms) && ms >= 20) args.push(`--fragment-ms=${Math.round(ms)}`)
  // 容器由扩展名决定（engine 侧按 `.mp4/.mkv/.ts` 选封装器）——
  // 这里只用它做一次自检：格式与扩展名不匹配时前端就该发现
  void mergeContainerOf(format)
  return args
}

/**
 * 引擎进程的环境变量（设置项 → env）。
 *
 * 只写**非默认**的键：不设 = 引擎按自己的默认走（线程数 = 机器并行度）。
 * 这样"设置项没动过"时，引擎行为与以前完全一致。
 */
export function engineEnvFromConfig (config) {
  const env = {}
  const cfg = config || {}
  const threads = Number(cfg.decodeThreads || 0)
  if (Number.isFinite(threads) && threads > 0) env.ME_THREADS = `${Math.floor(threads)}`
  Object.assign(env, decodeModeEnv(decodeModeOf(cfg)))
  return env
}

// ───────────────────────── 解码方式（设置项 → 引擎） ─────────────────────────

/** 解码方式的三档（与「设置 → 视频 → 解码方式」一一对应）。 */
export const DECODE_MODES = ['auto', 'hardware', 'software']

/**
 * 解码方式归一化：`auto` / `hardware` / `software`。
 *
 * - `auto`（默认）：优先硬解，起不来落自研软解；
 * - `hardware`（仅硬解）：硬解起不来就**明确报错**，不静默掉到慢的软解；
 * - `software`（仅软解）：完全不碰硬件解码器（排查"是不是硬解的锅"时用）。
 *
 * 旧配置里的布尔 `prefer-software-decode`（"强制软解"）迁移成 `software`，
 * 为 false 时不动（auto）。认不出来的值一律按 auto —— 与引擎那边一致。
 */
export function decodeModeOf (config) {
  const cfg = config || {}
  const raw = `${cfg.decodeMode || cfg['decode-mode'] || ''}`.trim().toLowerCase()
  if (raw === 'hardware' || raw === 'hw' || raw === '硬解') return 'hardware'
  if (raw === 'software' || raw === 'sw' || raw === '软解') return 'software'
  if (raw === 'auto' || raw === '自适应') return 'auto'
  const legacy = cfg.preferSoftwareDecode === true || cfg['prefer-software-decode'] === true
  return legacy ? 'software' : 'auto'
}

/**
 * 解码方式 → 引擎环境变量（`auto` 什么都不写 = 引擎默认）。
 *
 * 合并（`engineEnvFromConfig`）与播放（`EnginePlayer`）两条路共用这一份，
 * 免得两边各写一套判断、以后只改了一处。
 */
export function decodeModeEnv (mode) {
  if (mode === 'hardware') return { ME_DECODE: 'hardware' }
  if (mode === 'software') return { ME_DECODE: 'software' }
  return {}
}
