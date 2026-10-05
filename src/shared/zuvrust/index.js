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
