import { JSONRPCClient } from '../../aria2/lib/JSONRPCClient'

/**
 * XferRust 引擎原生 RPC 客户端。
 *
 * 引擎（xferrust >= 0.3.0）支持双协议族：aria2 兼容协议与本原生协议
 * （task.* / engine.* / events.*），同一连接以首条请求固定协议族。
 * 本客户端在应用原有的 aria2 风格调用面（方法名 + 位置参数 + 字符串
 * 数值）与引擎原生协议（对象参数 + params.token 鉴权 + 真实数值）之间
 * 做双向适配，使主进程与渲染进程的既有调用方无需改动即可切换到原生
 * 协议。
 *
 * 与旧 Aria2 客户端的差异：
 * - 事件需要显式 events.subscribe 订阅（open 时自动完成）；
 * - task.progress 为原生独有事件，无 aria2 等价物，忽略（UI 依赖轮询）；
 * - system.multicall / addMetalink 等原生协议不存在的方法按各自语义
 *   降级（batch / 拒绝）；getServers / changeUri / banPeer / unbanPeer
 *   已映射到引擎原生扩展（v0.3.0+ task.getServers / task.changeUri /
 *   task.banPeer / task.unbanPeer）。
 */

// 原生事件 → 既有 aria2 风格事件名（渲染层监听名保持不变）
const EVENT_MAP = {
  'task.start': 'onDownloadStart',
  'task.pause': 'onDownloadPause',
  'task.stop': 'onDownloadStop',
  'task.complete': 'onDownloadComplete',
  'task.error': 'onDownloadError'
}

// 引擎 engine.changeOptions 实际生效的键，白名单外一律丢弃
// （引擎对未知键也会忽略，这里提前过滤减少噪声）
// 与引擎 change_global_option 接受的键保持一致
const EFFECTIVE_GLOBAL_KEYS = [
  'max-concurrent-downloads',
  'dir',
  'split',
  'max-connection-per-server',
  // HLS 分片并发（不给则按显式写过的 max-connection-per-server / split 推导）
  'hls-concurrency',
  // HLS 落盘方式：unordered（默认，乱序落盘 + 顺序拼接）/ ordered（边下边按序写）
  'hls-write-mode',
  // HLS 选流（worst = 最低码率）、分片大小探测开关、单分片重试次数
  'hls-variant',
  'hls-probe-size',
  'hls-segment-retries',
  'min-split-size',
  'max-overall-download-limit',
  'max-overall-upload-limit',
  'bt-max-peers',
  'bt-adaptive',
  'bt-protocol',
  'bt-seed-mode',
  'bt-seed-ratio',
  'bt-seed-time',
  'bt-listen-port',
  'dht-listen-port',
  'bt-enable-lpd',
  'bt-port-mapping',
  // 网络发现（引擎原生支持）：DHT / DHT6（BEP 32）/ PEX（BEP 11）
  'enable-dht',
  'enable-dht6',
  'enable-peer-exchange',
  // 磁盘缓存（片写回缓冲，如 "128M"）与磁力存/载种子
  'disk-cache',
  'bt-save-metadata',
  'bt-load-saved-metadata'
]

// bt-encryption 合法取值：adaptive / force / plain
const BT_ENCRYPTION_VALUES = ['adaptive', 'force', 'plain']

const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]'

const toEngineScalar = (v) => {
  // 引擎选项值统一为字符串语义，布尔值转字符串避免类型校验失败
  if (v === true) return 'true'
  if (v === false) return 'false'
  return v
}

// "ip:port"（含 IPv6 "[::1]:port"）拆分为 ip / port 两个字段
const splitAddr = (addr = '') => {
  const s = `${addr || ''}`
  const m = s.match(/^\[([^\]]+)\]:(\d+)$/)
  if (m) {
    return { ip: m[1], port: Number(m[2]) }
  }
  const idx = s.lastIndexOf(':')
  if (idx > 0 && /^\d+$/.test(s.slice(idx + 1))) {
    return { ip: s.slice(0, idx), port: Number(s.slice(idx + 1)) }
  }
  return { ip: s, port: '' }
}

const mapNativePeer = (peer = {}) => {
  const { ip, port } = splitAddr(peer.addr)
  const connected = peer.connected !== false
  const downloadSpeed = Number(peer.downSpeed) || 0
  const uploadSpeed = Number(peer.upSpeed) || 0
  // 引擎原生 peer 的状态：封禁/尝试中由引擎标志位直接给出；在线的按速率
  // 与种子标志派生**状态集合**（可同时多个）——双向传输 = 下载中+上传中，
  // 纯上传的种子 = 上传中+做种中，无传输 = 做种中/空闲；断开的 peer 留空，
  // 状态列走"已断开"分支展示失败计数摘要。engineStatus 保留为首要状态
  // （单值，与既有展示/排序兼容）。
  let engineStatus = ''
  const peerStates = []
  if (peer.banned) {
    engineStatus = 'banned'
    peerStates.push('banned')
  } else if (peer.attempting) {
    engineStatus = 'attempting'
    peerStates.push('attempting')
  } else if (connected) {
    if (downloadSpeed > 0) {
      engineStatus = 'downloading'
      peerStates.push('downloading')
    }
    if (uploadSpeed > 0) {
      if (!engineStatus) engineStatus = 'uploading'
      peerStates.push('uploading')
    }
    if (peerStates.length === 0) {
      engineStatus = peer.seed ? 'seeding' : 'idle'
      peerStates.push(engineStatus)
    } else if (peer.seed && !peerStates.includes('seeding')) {
      // 有传输的种子节点：叠加「做种中」（它同时在向 swarm 供种）
      peerStates.push('seeding')
    }
  }
  return {
    ...peer,
    ip,
    port,
    peerId: peer.peerId || '',
    bitfield: peer.bitfield || '',
    downloadSpeed,
    uploadSpeed,
    downloadLength: peer.downloaded || 0,
    uploadLength: peer.uploaded || 0,
    connectionTime: peer.connectedSecs || 0,
    tcpFails: peer.tcpFails || 0,
    utpFails: peer.utpFails || 0,
    udpFails: peer.udpFails || 0,
    // 封禁条目：剩余封禁秒数（0 = 永久）与封禁原因，供时长/来源列展示
    remainingTime: peer.remainingSecs || 0,
    banReason: peer.banReason || '',
    engineStatus,
    peerStates
  }
}

// 原生扁平 peer 列表 → 渲染层既有的分组结构
const groupPeers = (peers) => {
  const list = Array.isArray(peers) ? peers : []
  const connected = []
  const attempting = []
  const banned = []
  const disconnected = []
  list.forEach((p) => {
    if (!p) return
    if (p.banned) {
      banned.push(mapNativePeer(p))
    } else if (p.attempting) {
      attempting.push(mapNativePeer(p))
    } else if (p.connected === false) {
      disconnected.push(mapNativePeer(p))
    } else {
      connected.push(mapNativePeer(p))
    }
  })
  return { connected, attempting, banned, disconnected }
}

export class XferRust extends JSONRPCClient {
  // 兼容旧 Aria2 客户端的调用形态：call('tellActive', ...) 与
  // call('aria2.tellActive', ...) 均可（渲染层 multicall 里带前缀）
  _normalizeMethod (method) {
    return `${method}`.replace(/^aria2\./, '')
  }

  addSecret (parameters) {
    // 原生协议鉴权：对象参数中的 token 字段
    const params = isPlainObject(parameters) ? { ...parameters } : {}
    if (this.secret) {
      params.token = this.secret
    }
    return params
  }

  /**
   * aria2 风格调用 → 原生协议请求。
   * 返回 { method, params, transform }；method 为 null 表示原生协议
   * 不支持该方法。
   */
  _mapCall (method, positional = []) {
    const name = this._normalizeMethod(method)
    const params = this.addSecret({})

    switch (name) {
      // ---- 任务管理 ----
      case 'addUri': {
        const [uris, options = {}] = positional
        Object.assign(params, { uris: Array.isArray(uris) ? uris : [uris] }, options)
        return { method: 'task.add', params, transform: unwrapGid }
      }
      case 'addTorrent': {
        const [torrent, options = {}] = positional
        Object.assign(params, { torrent }, options)
        return { method: 'task.add', params, transform: unwrapGid }
      }
      case 'tellStatus': {
        const [gid, keys] = positional
        Object.assign(params, { gid }, keys ? { keys } : {})
        return { method: 'task.tell', params }
      }
      case 'tellActive': {
        const [keys] = positional
        if (keys) params.keys = keys
        params.scope = 'active'
        return { method: 'task.list', params }
      }
      case 'tellWaiting': {
        const [offset = 0, num = 100, keys] = positional
        Object.assign(params, { scope: 'waiting', offset, num }, keys ? { keys } : {})
        return { method: 'task.list', params }
      }
      case 'tellStopped': {
        const [offset = 0, num = 100, keys] = positional
        Object.assign(params, { scope: 'stopped', offset, num }, keys ? { keys } : {})
        return { method: 'task.list', params }
      }
      case 'pause':
      case 'forcePause': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.pause', params, transform: okToOK }
      }
      case 'unpause': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.resume', params, transform: okToOK }
      }
      case 'remove':
      case 'forceRemove': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.remove', params, transform: okToOK }
      }
      case 'purgeDownloadResult': {
        return { method: 'task.purgeResults', params, transform: okToOK }
      }
      case 'removeDownloadResult': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.removeResult', params, transform: okToOK }
      }
      case 'getFiles': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.getFiles', params }
      }
      case 'verifyFiles': {
        // 文件校验在引擎侧执行（存在性/大小/哈希），前端只做交互
        const [gid, algorithm = 'sha256'] = positional
        params.gid = gid
        params.algorithm = algorithm
        return { method: 'task.verifyFiles', params }
      }
      case 'getUris': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.getUris', params }
      }
      case 'getPeers': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.getPeers', params, transform: groupPeers }
      }
      case 'getTrackers': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.getTrackers', params }
      }
      case 'getOption': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.getOption', params }
      }
      case 'changeOption': {
        const [gid, options = {}] = positional
        Object.assign(params, { gid }, options)
        return { method: 'task.changeOption', params, transform: okToOK }
      }

      // ---- 引擎管理 ----
      case 'getGlobalOption':
        return { method: 'engine.getOptions', params }
      case 'changeGlobalOption': {
        const [options = {}] = positional
        Object.assign(params, this._filterGlobalOptions(options))
        return { method: 'engine.changeOptions', params, transform: okToOK }
      }
      case 'getGlobalStat':
        return { method: 'engine.globalStat', params }
      case 'getVersion':
        return {
          method: 'engine.getVersion',
          params,
          transform: (r) => (isPlainObject(r) ? { ...r, enabledFeatures: r.features } : r)
        }
      case 'saveSession':
        return { method: 'engine.saveSession', params, transform: okToOK }
      // EngineClient.shutdown 会把 secret 作为多余的位置参数传入，忽略
      case 'shutdown':
        return { method: 'engine.shutdown', params, transform: okToOK }
      case 'forceShutdown':
        return { method: 'engine.forceShutdown', params, transform: okToOK }

      // ---- 组合操作（原生协议无 pauseAll / unpauseAll）----
      case 'pauseAll':
      case 'forcePauseAll':
        return { method: '__pauseAll', params }
      case 'unpauseAll':
        return { method: '__unpauseAll', params }

      // ---- 原生协议支持的任务级扩展（v0.3.0+）----
      // 服务器列表：HTTP 任务返回 aria2 兼容形状，BT 任务为空数组
      case 'getServers': {
        const [gid] = positional
        params.gid = gid
        return { method: 'task.getServers', params }
      }
      // 更新 URI：仅 HTTP 任务 waiting/paused 可改（active 由引擎拒绝，
      // 调用方 updateTaskLink 已有"重建任务"回退路径）
      case 'changeUri': {
        const [gid, fileIndex = 1, delUris = [], addUris = [], position] = positional
        Object.assign(params, {
          gid,
          fileIndex: Number(fileIndex) || 1,
          delUris: Array.isArray(delUris) ? delUris : [],
          addUris: Array.isArray(addUris) ? addUris : []
        })
        // position 原生协议暂不支持（aria2 语义为插入位置），忽略
        void position
        return { method: 'task.changeUri', params, transform: okToOK }
      }
      // BT 对端封禁：duration 秒后自动解封，<= 0 视为永久（aria2 语义）
      case 'banPeer': {
        const [gid, ip, duration = -1] = positional
        Object.assign(params, { gid, ip, duration: Number(duration) ?? -1 })
        return { method: 'task.banPeer', params, transform: okToOK }
      }
      case 'unbanPeer': {
        const [gid, ip] = positional
        Object.assign(params, { gid, ip })
        return { method: 'task.unbanPeer', params, transform: okToOK }
      }

      // ---- 原生协议不支持，降级处理 ----
      case 'getServersAndTasks':
      case 'addMetalink':
      case 'system.listMethods':
      case 'system.listNotifications':
        return { method: null }

      default:
        // 未识别的方法原样透传，交由引擎返回 Method not found
        return { method: name, params }
    }
  }

  /**
   * 过滤 changeGlobalOption 的键：
   * - 仅保留引擎生效键，防止整批校验被无效键拖垮；
   * - bt-tracker（换行/逗号分隔字符串）→ bt-trackers 数组；
   * - 应用层 bt-encryption-mode / bt-require-crypto 组合 → bt-encryption。
   */
  _filterGlobalOptions (options = {}) {
    const result = {}

    // BT 加密模式转换优先于普通键收集
    if (options['bt-encryption-mode'] !== undefined) {
      const mode = options['bt-encryption-mode']
      if (mode === 'force') result['bt-encryption'] = 'force'
      else if (mode === 'none') result['bt-encryption'] = 'plain'
      else result['bt-encryption'] = 'adaptive'
    } else if (options['bt-require-crypto'] !== undefined) {
      const require = options['bt-require-crypto'] === true || options['bt-require-crypto'] === 'true'
      if (require) {
        result['bt-encryption'] = 'force'
      } else {
        const level = options['bt-min-crypto-level']
        result['bt-encryption'] = level === 'plain' ? 'plain' : 'adaptive'
      }
    } else if (BT_ENCRYPTION_VALUES.includes(options['bt-encryption'])) {
      result['bt-encryption'] = options['bt-encryption']
    }

    if (options['bt-tracker'] !== undefined) {
      const trackers = `${options['bt-tracker'] || ''}`
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (trackers.length > 0) {
        result['bt-trackers'] = trackers
      }
    }

    // BT IP 封禁名单（永久封禁，引擎侧全量替换语义；数组/换行分隔字符串均可）
    if (options['bt-ip-ban-list'] !== undefined) {
      const raw = options['bt-ip-ban-list']
      const list = Array.isArray(raw)
        ? raw
        : `${raw || ''}`.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
      result['bt-ip-ban-list'] = list
    }

    // 订阅自动更新开关（布尔直通，引擎原生支持）
    if (options['auto-update-trackers'] !== undefined) {
      result['auto-update-trackers'] = toEngineScalar(options['auto-update-trackers'])
    }

    // 应用层键 → 引擎原生键的别名映射（应用保留 aria2 时代的配置键名，
    // 引擎用自己的键名；此处做一次翻译，缺一个都会变成「界面有开关、
    // 引擎从不生效」的死设置）：
    // - listen-port（BT 监听端口）→ bt-listen-port
    // - seed-time（做种时长，分钟）→ bt-seed-time
    // - enable-upnp（UPnP 端口映射）→ bt-port-mapping
    // - bt-connect-protocol（both/tcp/utp）→ bt-protocol（引擎同样接受
    //   "both" 语义为 tcp+utp，直接透传）
    if (options['listen-port'] !== undefined && options['bt-listen-port'] === undefined) {
      result['bt-listen-port'] = toEngineScalar(options['listen-port'])
    }
    if (options['seed-time'] !== undefined && options['bt-seed-time'] === undefined) {
      result['bt-seed-time'] = toEngineScalar(options['seed-time'])
    }
    if (options['enable-upnp'] !== undefined && options['bt-port-mapping'] === undefined) {
      result['bt-port-mapping'] = toEngineScalar(options['enable-upnp'])
    }
    if (options['bt-connect-protocol'] !== undefined && options['bt-protocol'] === undefined) {
      result['bt-protocol'] = toEngineScalar(options['bt-connect-protocol'])
    }

    for (const key of EFFECTIVE_GLOBAL_KEYS) {
      const v = options[key]
      if (v === undefined || v === null || v === '') {
        continue
      }
      result[key] = toEngineScalar(v)
    }

    return result
  }

  async call (method, ...positional) {
    const mapped = this._mapCall(method, positional)

    if (mapped.method === null) {
      if (mapped.fallback !== undefined) {
        return mapped.fallback
      }
      return Promise.reject(new Error(`Method not supported by native protocol: ${method}`))
    }

    // 组合操作：list 全量后逐个 pause / resume
    if (mapped.method === '__pauseAll' || mapped.method === '__unpauseAll') {
      return this._toggleAll(mapped.method === '__pauseAll' ? 'pause' : 'resume')
    }

    const result = await super.call(mapped.method, mapped.params)
    return mapped.transform ? mapped.transform(result) : result
  }

  async _toggleAll (action) {
    const rpcMethod = action === 'pause' ? 'task.pause' : 'task.resume'
    const list = await super.call('task.list', this.addSecret({ scope: 'all' }))
    const tasks = Array.isArray(list) ? list : []
    // pauseAll：暂停 active + waiting；unpauseAll：恢复 paused
    const targets = tasks.filter((t) => {
      if (!t || !t.gid) return false
      if (action === 'pause') return t.status === 'active' || t.status === 'waiting'
      return t.status === 'paused'
    })
    for (const t of targets) {
      try {
        await super.call(rpcMethod, this.addSecret({ gid: t.gid }))
      } catch (_) {
        // 单个任务失败不中断整体
      }
    }
    return 'OK'
  }

  async multicall (calls) {
    // 原生协议无 system.multicall，改用 JSON-RPC batch（按序返回结果）
    const mappedCalls = calls.map(([method, ...positional]) => {
      const mapped = this._mapCall(method, positional)
      if (mapped.method === null || mapped.method.startsWith('__')) {
        throw new Error(`Method not supported by native protocol: ${method}`)
      }
      return mapped
    })
    // batch 返回的是 Promise 数组：必须先整体解包拿到真实结果，
    // 再应用各方法的响应变换（unwrapGid / okToOK / groupPeers）。
    // 此前两次踩坑都在这里：先是不应用 transform（addUri 拿到
    // 原生 { gid } 对象、getPeers 分组结构丢失），后是把 transform
    // 施加在 Promise 上——groupPeers(Promise) 恒返回全空分组，且
    // tellStatus 结果也是 Promise，任务详情的 peers/字段刷新全部失效。
    //
    // 注意 batch 本身是 async：它 resolve 出的是「Deferred Promise 数组」，
    // 因此必须先把 batch 自身 await 出来，再对数组做 Promise.all。
    // 直接写 Promise.all(super.batch(...)) 会把一个 Promise 当作可迭代
    // 对象传给 Promise.all，恒抛
    // "object is not iterable (cannot read property Symbol(Symbol.iterator))"，
    // 导致全部批量调用（addUris / batchPause / batchRemove 等）不可用。
    const pending = await super.batch(
      mappedCalls.map((mapped) => [mapped.method, mapped.params])
    )
    const results = await Promise.all(pending)
    return results.map((result, i) => {
      const { transform } = mappedCalls[i]
      return transform ? transform(result) : result
    })
  }

  async open () {
    const res = await super.open()
    // 原生协议需要显式订阅事件推送（重连后需重新订阅）
    try {
      await super.call('events.subscribe', this.addSecret({}))
    } catch (err) {
      // 订阅失败不阻塞连接建立；引擎版本异常时由上层任务调用暴露
    }
    return res
  }

  _onnotification (notification) {
    const { method, params } = notification
    const event = EVENT_MAP[method]
    if (event) {
      // 旧客户端约定：emit(event, params)，params 为 [{gid}] 形状
      const payload = isPlainObject(params) ? [params] : params
      this.emit(event, payload)

      // BT 任务下载完成补发 onBtDownloadComplete（种子流程依赖该事件）。
      // 通过 numSeeders / seeder 这两个 BT 独有字段判定，避免误伤 HTTP 任务。
      if (method === 'task.complete' && isPlainObject(params)) {
        this.fetchBtCompleteState(params.gid)
      }
    }
    // task.progress 无 aria2 等价事件，交由 super 走通用通知通道（无监听者则忽略）
    return super._onnotification(notification)
  }

  // 完成事件后查询一次任务，判定是否为 BT 完成并补发种子事件
  async fetchBtCompleteState (gid) {
    try {
      const task = await super.call('task.tell', this.addSecret({ gid }))
      if (!isPlainObject(task)) {
        return
      }
      // bittorrent 真值兜底：seeder 语义为「本端下载完成且在做种」，
      // 引擎侧已限定 BT 任务；此处再校验 bittorrent 防止旧引擎对
      // HTTP 完成任务误报 seeder=true（HTTP 完成也会命中
      // completed >= total），导致任务列表出现"做种中"。
      const isBt = !!task.bittorrent &&
        (Number(task.numSeeders) > 0 || task.seeder === true || task.seeder === 'true')
      if (isBt) {
        this.emit('onBtDownloadComplete', [{ gid }])
      }
    } catch (_) {
      // 任务已被清理等情况，忽略
    }
  }

  defaultOptions = {
    ...JSONRPCClient.defaultOptions,
    secure: false,
    host: '127.0.0.1',
    port: 16800,
    secret: '',
    path: '/jsonrpc'
  }
}

function unwrapGid (result) {
  if (isPlainObject(result) && result.gid !== undefined) {
    return result.gid
  }
  return result
}

function okToOK (result) {
  if (isPlainObject(result) && result.ok === true) {
    return 'OK'
  }
  return result
}
