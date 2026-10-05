/**
 * 引擎位图 → 每格分片状态解析。
 *
 * 独立进度窗口有两条 1Hz 数据流（窗口自身 task-progress:fetch 轮询 +
 * 主窗口 task-progress-update 事件推送）交替驱动渲染。若两处映射算法
 * 不一致（曾出现 fetch 路径 floor、推送路径 ceil 的分歧），同一分片会
 * 被两路来回刷成不同颜色，表现为分片网格持续闪烁。
 * 因此 bitfield→status 的唯一权威实现放在这里，供两处共用；
 * TaskGraphic 也调用同一实现，避免第三处分叉。
 *
 * 一格 = 一个 nibble = 最多 4 片（与引擎 hex 编码一致：每 hex 字符 4 片，
 * 片序号在 nibble 内从高位起）。返回值语义：
 * - 0：未下载（灰）
 * - 1..4：该格已完成比例（25% / 50% / 75% / 100%，绿色递深）
 * - 5：未选择——该格所有真实分片都不属于任何勾选下载的文件，
 *      永远不会下载（用户取消勾选的文件所在分片）。任务 100% 完成后
 *      末尾残留的灰格正是这一类，必须与「未下载」区分开。
 *
 * 完成比例用格内**已完成片数**折算（而非旧的 nibble 数值整除）：
 * - 乱序完成时不会回退成灰（0）：只要有 1 片完成即 ceil 到 ≥1；
 * - 末尾不足 4 片的格按真实片数折算，整格下完即 100%，
 *   不再出现「已完成任务末格只显示 75%」。
 */

/** nibble 内真实分片数 → 位掩码（片序号自高位起，末格不足 4 片时只取高位） */
const REAL_MASK = [0x0, 0x8, 0xC, 0xE, 0xF]

function nibbleAt (bitfield, index) {
  const ch = bitfield ? bitfield[index] : ''
  const v = parseInt(ch || '0', 16)
  return Number.isFinite(v) ? v : 0
}

function popcount4 (v) {
  let n = 0
  for (let i = 0; i < 4; i++) {
    n += (v >> i) & 1
  }
  return n
}

/**
 * 单格状态。
 * @param {number} index 格序号（nibble 序号）
 * @param {string} bitfield 主位图（aria2 兼容 hex，按字节补零）
 * @param {string} partialBitfield 部分下载位图（HTTP 任务非空，BT 为空）
 * @param {string} wantedBitfield 需下载片位图（BT 部分选择时非空，全选为空）
 * @param {number} numPieces 真实分片数
 * @returns {number} 0-5
 */
export function pieceCellStatus (index, bitfield, partialBitfield, wantedBitfield, numPieces) {
  const total = Number(numPieces) || 0
  // 本格真实分片数（末尾格可能不足 4 片）：由格序号推出剩余片数
  const remain = total - index * 4
  const realCount = Math.min(4, Math.max(0, remain))
  if (realCount === 0) {
    return 0
  }
  const mask = REAL_MASK[realCount]
  const doneNib = nibbleAt(bitfield, index) & mask
  if (doneNib > 0) {
    const doneCount = popcount4(doneNib)
    return Math.max(1, Math.ceil((doneCount / realCount) * 4))
  }
  // 未下载：若本格真实分片全部「不需下载」→ 未选择（无需下载），
  // 而不是「未下载」（否则任务完成后仍显示灰格，看起来像没下完）
  if (wantedBitfield) {
    if ((nibbleAt(wantedBitfield, index) & mask) === 0) {
      return 5
    }
  }
  const partialNib = nibbleAt(partialBitfield, index)
  if (partialNib > 0) {
    // 部分下载映射到 1-2 级（浅绿/中绿），按 nibble 值递增；
    // 完成后折算值 ≥ 该值，保证状态单调不回退
    return partialNib >= 8 ? 2 : 1
  }
  return 0
}

/**
 * 全部格状态数组。
 * @returns {number[]|null} 每格状态（0-5）；无有效位图时返回 null
 */
export function parsePieceStatuses (
  bitfield = '',
  partialBitfield = '',
  numPieces = 0,
  wantedBitfield = ''
) {
  if (!bitfield || !(Number(numPieces) > 0)) {
    return null
  }
  // bitfield 按字节补零，最后一个 nibble 可能只包含填充位，
  // 只取真实分片对应的 nibble 数量 ceil(numPieces / 4)，避免
  // 已完成任务末尾多渲染一个"未下载"的假分片。
  const nibbleCount = Math.min(Math.ceil(numPieces / 4), bitfield.length)
  const pieces = new Array(nibbleCount)
  for (let i = 0; i < nibbleCount; i++) {
    pieces[i] = pieceCellStatus(i, bitfield, partialBitfield, wantedBitfield, numPieces)
  }
  return pieces
}

/**
 * 把「一对音视频」两条流各自的格状态合成**一张**网格。
 *
 * 为什么需要：一条折叠记录背后是两个引擎任务、**两张位图**（画面流与声音流
 * 的分片数/分片长度通常都不一样）。此前两条数据流（主窗口推送 / 进度窗口
 * 轮询）在配对时都直接不下发分片，于是独立进度窗口的「分片」页对一对音视频
 * 永远是「无分片数据」——用户看到的"分片进度没有显示"。
 *
 * 合成规则：
 * - 格数取最长的一条（短的那条按比例抽样映射到同一套格子上）；
 * - 每格取**两条流里的最小值** —— 只有画面与声音对应的那一段都下完，
 *   这一格才算下完，网格因此单调不回退、且与总进度口径一致；
 * - 值为 5（未选择）只在所有成员都是 5 时才成立（min 天然满足）。
 *
 * 引擎的位图是**下载开始之后**才有的（零进度时 bitfield 为空），所以
 * 刚开始时只有先开始下载的那条流有网格，另一条按"全 0"并入；两条都还没
 * 开工时返回 null，调用方据此显示「无分片数据」。
 *
 * @param {Array<number[]|null>} grids 各成员的格状态数组
 * @returns {number[]|null} 合成后的格状态数组；没有任何成员有网格时返回 null
 */
export function combinePieceStatuses (grids) {
  const list = (Array.isArray(grids) ? grids : []).filter(g => Array.isArray(g) && g.length > 0)
  if (list.length === 0) {
    return null
  }
  let cellCount = 0
  for (const g of list) {
    if (g.length > cellCount) {
      cellCount = g.length
    }
  }
  if (cellCount <= 0) {
    return null
  }
  const out = new Array(cellCount)
  for (let i = 0; i < cellCount; i++) {
    let min = 5
    for (const g of list) {
      const idx = Math.min(g.length - 1, Math.floor((i * g.length) / cellCount))
      const v = Number(g[idx])
      if (Number.isFinite(v) && v < min) {
        min = v
      }
    }
    out[i] = min
  }
  return out
}
