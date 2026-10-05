import { TASK_STATUS } from '@shared/constants'

/**
 * 「一对音视频」（扩展用同一个 pairId 发来的**画面流** + **声音流**）在任务列表里的呈现。
 *
 * 用户点名的三条规则：
 *   1. **从下载阶段起就只占一条记录** —— 不再出现"画面一条、声音一条"两个卡片；
 *   2. 这条记录的进度 = 两条流的字节数**加起来**（分子分母都是两者之和），
 *      所以"下到一半"说的是这对流的整体进度，而不是某一条流；
 *   3. 两个文件都下完后底条转**黄**（下载完、可以合并了），合并阶段再用**绿**色
 *      从左往右盖上去，盖满即完成 —— 黄底保留在下面，一眼就能看出"从下载完
 *      到真正能播"还差多少。
 *
 * 这里只放**纯函数**（不 import store / Vue），`test/taskpair/run.mjs` 直接跑它。
 * 折叠发生在 `store/task.js` 的 UPDATE_TASK_LIST（列表的唯一入口），组件只消费
 * 折叠后的记录 + 它身上的 `pairGids` / `pairMembers` / `pairMemberCount`。
 */

export const PAIR_ROLE_VIDEO = 'video'
export const PAIR_ROLE_AUDIO = 'audio'

/**
 * 「角色标记」后缀：扩展给一对流生成的文件名是 `<名>_video.mp4` / `<名>_audio.m4a`，
 * 合并产物会把这一截去掉（`EngineClient.afterBilibiliMerge` 的 titleBase 用的是
 * **同一套**规则，见那里的 `n.replace(...)`）。
 * 两处必须一致：列表里预览的名字要和合并完真正落盘的名字长得一样。
 */
const PART_MARKER_RE = /(?:[._-]|\s+|\()?(?:video\s*stream|audio\s*stream|videostream|audiostream|video|audio|视频流|音频流|视频|音频)\)?$/i

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.mov', '.m4v', '.ts', '.flv']

const basenameOf = (p) => `${p || ''}`.split(/[\\/]/).pop() || ''

const statusOf = (task) => `${(task && task.status) || ''}`

const gidOf = (task) => `${(task && task.gid) || ''}`

/**
 * 配对标识。`pairId` 与 `gid` 都齐了才算一条配对成员：
 * 只有 pairId 没有 gid（或反过来）时按普通任务处理，绝不硬凑成一对。
 */
export function getPairId (task) {
  const id = task && task.pairId != null ? `${task.pairId}`.trim() : ''
  if (!id) {
    return ''
  }
  return gidOf(task) ? id : ''
}

export function getPairRole (task) {
  const role = task && task.pairRole != null ? `${task.pairRole}`.trim().toLowerCase() : ''
  return role === PAIR_ROLE_VIDEO || role === PAIR_ROLE_AUDIO ? role : ''
}

/** 这条记录是不是「一对音视频」折叠出来的。 */
export function isPairRow (task) {
  return !!(task && task.isPair === true && Array.isArray(task.pairGids) && task.pairGids.length > 0)
}

/**
 * 展示记录自身 gid 与全部成员 gid（去重、记录自身排最前）。
 *
 * 用途：合并进度、固定显示名都挂在**成员**的 gid 上（合并是由"后下完的那条"
 * 触发的，未必是记录的主 gid），查这些表必须遍历全部成员。
 */
export function getPairGidCandidates (task) {
  const result = []
  const push = (gid) => {
    const g = `${gid || ''}`
    if (g && !result.includes(g)) {
      result.push(g)
    }
  }
  push(task && task.gid)
  const gids = task && Array.isArray(task.pairGids) ? task.pairGids : []
  gids.forEach(push)
  return result
}

/** 这条记录背后真正的引擎任务（一条记录 = 一到两个引擎任务）。 */
export function getPairMemberGids (task) {
  const gids = task && Array.isArray(task.pairGids) ? task.pairGids.map(g => `${g}`) : []
  const own = gidOf(task)
  if (gids.length > 0) {
    return gids.includes(own) ? gids : [own, ...gids].filter(Boolean)
  }
  return own ? [own] : []
}

/** 记录里"画面流"那一条任务（没有角色信息时退回第 0 条）。 */
export function getVideoMember (members) {
  const list = Array.isArray(members) ? members.filter(Boolean) : []
  return list.find(m => getPairRole(m) === PAIR_ROLE_VIDEO) || list[0] || null
}

/**
 * 一对音视频在列表里**预览**的产物名（与合并落盘的名字同一套规则）。
 *
 * 取画面流的文件名，去掉角色标记与重复序号，扩展名沿用画面流自己的
 * （视频容器决定产物容器）。画面流信息缺失时返回空串，调用方回退到原逻辑。
 */
export function pairDisplayName (task) {
  const members = task && Array.isArray(task.pairMembers) ? task.pairMembers : []
  const video = getVideoMember(members.length ? members : [task])
  if (!video) {
    return ''
  }
  const files = Array.isArray(video.files) ? video.files : []
  const first = files[0] || {}
  const raw = basenameOf(first.path) || `${video.name || ''}`
  if (!raw) {
    return ''
  }
  const extMatch = raw.match(/(\.[^.]+)$/)
  const ext = extMatch ? extMatch[1] : ''
  let stem = raw.replace(/\.[^.]+$/i, '')
  stem = stem.replace(PART_MARKER_RE, '')
  stem = stem.replace(/\s+\(\d+\)$/, '')
  stem = stem.replace(/-\d+$/, '')
  stem = stem.replace(/_[0-9]+$/i, '')
  stem = stem.trim()
  if (!stem) {
    return ''
  }
  if (ext && VIDEO_EXTENSIONS.includes(ext.toLowerCase())) {
    return `${stem}${ext}`
  }
  return `${stem}.mp4`
}

function sumOf (members, key) {
  return members.reduce((acc, m) => acc + (Number(m && m[key]) || 0), 0)
}

/**
 * 一条记录的合并状态 = 成员状态的聚合。
 *
 * 顺序有讲究：**只要有成员还在下就是 active**（否则"画面下完了、声音还在跑"
 * 会显示成已完成）；只要有成员出错就报 error（合并流程本来就是靠成员状态
 * 触发的）；有成员在合并/在合并且没有出错时是 merging。
 */
function aggregateStatus (members, mergingGids, alreadyMerged = false) {
  const has = (status) => members.some(m => statusOf(m) === status)
  if (has(TASK_STATUS.ACTIVE)) {
    return TASK_STATUS.ACTIVE
  }
  if (has(TASK_STATUS.ERROR)) {
    return TASK_STATUS.ERROR
  }
  // 已经产出合并文件 ⇒ 这条记录**不可能**还在合并：产物在盘上就是硬事实。
  // 合并簿记（mergingList）与另一半的重试定时器都是异步收尾的，晚一步醒来就会把
  // 成员推回 MERGING —— 那正是"都合并完了、却冒出正在合并音视频…"的形态（用户报的）。
  if (!alreadyMerged && (has(TASK_STATUS.MERGING) || members.some(m => mergingGids.has(gidOf(m))))) {
    return TASK_STATUS.MERGING
  }
  const allDone = members.every(m => {
    const s = statusOf(m)
    return s === TASK_STATUS.COMPLETE || s === TASK_STATUS.SEEDING
  })
  if (allDone) {
    return TASK_STATUS.COMPLETE
  }
  if (has(TASK_STATUS.WAITING)) {
    return TASK_STATUS.WAITING
  }
  if (has(TASK_STATUS.PAUSED)) {
    return TASK_STATUS.PAUSED
  }
  return statusOf(members[0])
}

function buildPairRow (pairId, members, mergingGids, mergeSkippedGids) {
  const videoIndex = members.findIndex(m => getPairRole(m) === PAIR_ROLE_VIDEO)
  const primaryIndex = videoIndex >= 0 ? videoIndex : 0
  const primary = members[primaryIndex]
  // 主记录排最前：主 gid 是记录的身份（选中、详情、优先级都按它走），
  // 成员顺序必须稳定，否则每轮重新折叠都可能换主。
  const ordered = [primary, ...members.filter((_, i) => i !== primaryIndex)]

  // 这一对**是否已经产出合并文件**：合并成功会把产物落到某一条成员的历史里
  // （`dashMerged`，通常就是"后下完、触发合并"的那条），而另一半的任务与历史
  // 清理是尽力而为的 —— 所以判"这一对合完了"要看**整对**，不能只看主记录。
  // 它同时决定两件事：状态不再回到 merging（见 aggregateStatus），
  // 进度条也不再回到"待合并"的黄条（组件按同一个信号传给 resolveProgressView）。
  const pairMerged = ordered.some(m => m && m.dashMerged === true)

  // 这一对**已经确定不会再合并**（合并重试耗尽、缺另一半、合并失败收尾）：
  // 记录要停止显示"待合并/合并中"，按普通条收尾。和 `mergingGids` 同一套做法
  // —— 状态簿记放 store，折叠时读进来（发动机每轮都会换新对象，写在任务对象上
  // 留不住）。
  const mergeSkipped = ordered.some(m => mergeSkippedGids && mergeSkippedGids.has(gidOf(m)))

  const status = aggregateStatus(ordered, mergingGids, pairMerged)

  // 出错时把提示换成出错那条的：用户要看的是"哪一条流挂了、为什么"，
  // 而不是画面流的健康状态。
  const failing = status === TASK_STATUS.ERROR
    ? ordered.find(m => statusOf(m) === TASK_STATUS.ERROR)
    : null
  const lead = failing || primary

  const totalLength = sumOf(ordered, 'totalLength')
  const completedLength = sumOf(ordered, 'completedLength')
  const downloadSpeed = sumOf(ordered, 'downloadSpeed')
  const uploadSpeed = sumOf(ordered, 'uploadSpeed')
  const uploadLength = sumOf(ordered, 'uploadLength')

  const row = {
    ...lead,
    gid: gidOf(primary),
    isPair: true,
    pairId,
    pairCount: ordered.length,
    pairGids: ordered.map(gidOf),
    pairMembers: ordered,
    pairMerged,
    mergeSkipped,
    pairDisplayName: '',
    totalLength: `${totalLength}`,
    completedLength: `${completedLength}`,
    downloadSpeed: `${downloadSpeed}`,
    uploadSpeed: `${uploadSpeed}`,
    uploadLength: `${uploadLength}`,
    status,
    statusHint: `${(lead && lead.statusHint) || ''}`,
    engineStatus: `${(lead && lead.engineStatus) || ''}`,
    statusRightText: `${(lead && lead.statusRightText) || ''}`
  }
  row.pairDisplayName = pairDisplayName(row)
  return row
}

// 记录内容的比对字段：全部是标量，成员另有身份比对
const ROW_SCALAR_FIELDS = [
  'gid', 'status', 'name', 'totalLength', 'completedLength', 'downloadSpeed',
  'uploadSpeed', 'uploadLength', 'statusHint', 'engineStatus', 'statusRightText',
  'pairDisplayName', 'pairCount', 'pairMerged', 'mergeSkipped', 'dir'
]

function isSamePairRow (prev, next) {
  if (!prev || !next) {
    return false
  }
  for (const field of ROW_SCALAR_FIELDS) {
    if (`${prev[field] == null ? '' : prev[field]}` !== `${next[field] == null ? '' : next[field]}`) {
      return false
    }
  }
  const prevGids = prev.pairGids || []
  const nextGids = next.pairGids || []
  if (prevGids.length !== nextGids.length) {
    return false
  }
  for (let i = 0; i < prevGids.length; i++) {
    if (`${prevGids[i]}` !== `${nextGids[i]}`) {
      return false
    }
  }
  // 成员对象本身也要是同一批：引擎每次上报都换新对象，靠它才能发现"进度动了"
  const prevMembers = prev.pairMembers || []
  const nextMembers = next.pairMembers || []
  if (prevMembers.length !== nextMembers.length) {
    return false
  }
  for (let i = 0; i < prevMembers.length; i++) {
    if (prevMembers[i] !== nextMembers[i]) {
      return false
    }
  }
  return true
}

/**
 * 把列表里同 pairId 的任务折叠成一条记录。
 *
 * @param {Array} taskList 引擎/历史合并后的原始任务列表
 * @param {Object} [options]
 * @param {Array<string>} [options.mergingGids] 正在合并的 gid（store 的 mergingList）
 * @param {Array<string>} [options.mergeSkippedGids] 已确定不再合并的 gid
 *        （合并重试耗尽/缺另一半，store 的 mergeSkippedList）
 * @param {Map<string, Object>} [options.previousRows] 上一轮的折叠结果
 *        （pairId → 记录）。内容一致时复用同一个对象，避免每轮都换新对象
 *        导致 v-memo 失效、子组件全量重渲染。
 * @returns {{ list: Array, index: Map<string, string[]>, rows: Map<string, Object>, changed: boolean }}
 *        `index`：任一成员 gid → 该记录的全部成员 gid（批量操作按它展开）。
 */
export function collapseTaskPairs (taskList, options = {}) {
  const list = Array.isArray(taskList) ? taskList : []
  const mergingGids = new Set(
    (Array.isArray(options.mergingGids) ? options.mergingGids : []).map(g => `${g}`)
  )
  const mergeSkippedGids = new Set(
    (Array.isArray(options.mergeSkippedGids) ? options.mergeSkippedGids : []).map(g => `${g}`)
  )
  const previousRows = options.previousRows instanceof Map ? options.previousRows : null

  const out = []
  const index = new Map()
  const rows = new Map()
  const seen = new Set()
  let changed = false

  for (const task of list) {
    const pairId = getPairId(task)
    if (!pairId) {
      out.push(task)
      continue
    }
    if (seen.has(pairId)) {
      continue
    }
    seen.add(pairId)

    // 单成员也走折叠：伙伴已经合并掉/被删掉时，这条记录仍然是"配对记录"
    // （合并进度、双层进度条都挂在 isPair 上），只是没有求和可做。
    const members = list.filter(t => getPairId(t) === pairId)
    const built = buildPairRow(pairId, members, mergingGids, mergeSkippedGids)
    const prev = previousRows ? previousRows.get(pairId) : null
    const row = prev && isSamePairRow(prev, built) ? prev : built
    if (row !== prev) {
      changed = true
    }
    out.push(row)
    rows.set(pairId, row)

    const gids = built.pairGids
    gids.forEach((gid) => {
      if (!index.has(gid)) {
        index.set(gid, gids)
      }
    })
  }

  return { list: out, index, rows, changed }
}

/**
 * 把 gid 列表展开成"含配对伙伴"的 gid 列表（批量暂停/删除用）。
 * 不在配对里的 gid 原样保留，顺序按传入顺序、去重。
 */
export function expandPairGids (index, gids) {
  const map = index instanceof Map ? index : null
  const out = []
  const seen = new Set()
  const push = (gid) => {
    const g = `${gid || ''}`
    if (!g || seen.has(g)) {
      return
    }
    seen.add(g)
    out.push(g)
  }
  ;(Array.isArray(gids) ? gids : []).forEach((gid) => {
    const members = map ? map.get(`${gid}`) : null
    if (Array.isArray(members) && members.length > 0) {
      members.forEach(push)
      return
    }
    push(gid)
  })
  return out
}

const clampPercent = (value) => {
  const v = Number(value)
  if (!Number.isFinite(v)) {
    return 0
  }
  return Math.max(0, Math.min(100, v))
}

/**
 * 进度条的显示口径（**唯一实现**，`TaskProgress.vue` 直接用它，测试直接跑它）。
 *
 * 三档：
 *   · `plain`        —— 普通进度条。配对记录在**下载阶段**也走这一档：
 *                       分子分母都是两条流的字节和，无需特殊处理。
 *   · `pair-pending` —— 一对音视频两个文件都下完了、合并还没开始 → **满格黄条**
 *                       （"可以合并了"）。
 *   · `pair-merge`   —— 合并进行中 → 黄底（满格，作为背景保留）+ 绿色覆盖层，
 *                       绿色盖满即完成。
 *
 * 「下载完了没有」**只由记录状态回答**（COMPLETE/MERGING ⇒ 没有成员还在下），
 * 「合并完了没有」由 `merged`（`dashMerged`，`afterBilibiliMerge` 落库）或
 * `mergeSkipped`（重试耗尽/确定合不了，收尾时登记）回答。
 *
 * ⚠️ **不要再拿字节数或成员个数当判据**（两个都踩过，每次都表现为
 * "进度已经 100%、条还是绿的，也不显示等待合并"）：
 *   · `completed >= total * 0.999` —— 引擎对 DASH 的总长是**估算值**，
 *     而 `TaskProgress` 画满格走的是"status === COMPLETE ⇒ 100%"这一支：
 *     两者一旦分叉，就是**条满格绿、判据说没到位**（用户报的形态）。
 *     同一个状态在两个地方必须给出同一个结论，字节数不再参与判断。
 *   · `memberCount >= 2` —— 只在"两个源都还在列表里"时成立；合并成功后记录
 *     就收敛成一条（`pairCount` 变 1），某条源被隐藏/清理时也会掉到 1。
 *     用它兜"待合并"会让黄条时有时无。**"还要不要合并"由 `merged` 回答**，
 *     与成员还剩几条无关。
 *
 * @returns {{ mode: 'plain'|'pair-pending'|'pair-merge', basePercent: number, coverPercent: number }}
 *          `basePercent` 是底层条宽度、`coverPercent` 是绿色覆盖层宽度；
 *          `plain` 档组件仍用自己带缓动的 `displayPercent` 画条（这里返回的是
 *          未缓动的真值，供测试与判据使用）。
 */
export function resolveProgressView (input = {}) {
  const total = Number(input.total)
  const completed = Number(input.completed)
  const status = `${input.status || ''}`
  const mergePercent = Number(input.mergePercent)

  const downloadPercent = total > 0
    ? clampPercent((completed / total) * 100)
    : 0

  const isPair = !!input.isPair
  const alreadyMerged = input.merged === true
  // 已经确定不会再合并（重试耗尽 / 缺配对 / 合并失败收尾）：按普通条收尾，
  // 否则"只有一条流、永远等不到另一半"的记录会一直挂在黄条上
  const mergeSkipped = input.mergeSkipped === true
  const downloadDone = status === TASK_STATUS.COMPLETE || status === TASK_STATUS.MERGING
  // 合并中：黄底（满格）+ 绿盖；下载完成后、还没开始合：满格黄条"待合并"。
  const pendingPair = isPair && !alreadyMerged && !mergeSkipped && downloadDone

  if (!pendingPair) {
    return { mode: 'plain', basePercent: downloadPercent, coverPercent: 0 }
  }
  // 下载已结束 ⇒ 底条恒为满格，黄条整根留着当背景
  if (!Number.isFinite(mergePercent) || mergePercent < 0) {
    return { mode: 'pair-pending', basePercent: 100, coverPercent: 0 }
  }
  return { mode: 'pair-merge', basePercent: 100, coverPercent: clampPercent(mergePercent) }
}
