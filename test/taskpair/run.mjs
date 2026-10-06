#!/usr/bin/env node
/**
 * 「一对音视频折叠成一条记录」的纯函数测试（纯 Node，零依赖）
 * ============================================================
 *
 * 用户点名的三件事全落在这里：
 *   ① 同一 pairId 的画面流 + 声音流**只出一条记录**；
 *   ② 这条记录的进度是两条流**加起来**的（分子分母都是两者之和）；
 *   ③ 两个都下完之后底条转黄、合并进度用绿色盖上去（进度条的两层渲染在
 *      `TaskProgress.vue`，这里钉住它依赖的**状态/字段口径**）。
 *
 * 为什么值得单独测：折叠发生在列表唯一入口（store 的 UPDATE_TASK_LIST），
 * 一旦折叠错，UI 上是"少了一条任务/进度跳变/删不掉另一条"这类**看不出来源**
 * 的问题，而这里的函数一个 store 都不需要就能验。
 *
 * 用法（与 playback 那套一致：`@shared/*` 别名要靠解析钩子注册，
 * 静态 import 会先于任何模块体执行，所以必须用 `--import` 而不是 import 语句）：
 *   node --import ./test/playback/register-alias.mjs test/taskpair/run.mjs
 * 退出码：0 全过 / 1 有失败。
 */

import {
  PAIR_ROLE_VIDEO,
  PAIR_ROLE_AUDIO,
  collapseTaskPairs,
  expandPairGids,
  getPairGidCandidates,
  getPairId,
  getPairMemberGids,
  getPairRole,
  isPairRow,
  pairDisplayName,
  resolveProgressView
} from '../../src/renderer/utils/taskPair.js'
import { TASK_STATUS } from '../../src/shared/constants.js'
// 走相对路径而不是 `@shared/utils`：后者（index.js）有无扩展名的相对导入，
// 只有打包器认；这里要的是那个零依赖的小文件（同源实现，不是副本）
import { unwrapMulticallValues } from '../../src/shared/utils/multicall.js'
import { combinePieceStatuses, parsePieceStatuses } from '../../src/shared/utils/piece-status.js'
// 完成通知的去重（一条下载只弹一次）单测在文件末尾，实现见 utils/completeNotify
import { completeNotifyKey, createCompleteNotifier } from '../../src/renderer/utils/completeNotify.js'

let passed = 0
let failed = 0

const check = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (err) {
    failed++
    console.log(`  \u2717 ${name}`)
    console.log(`      ${err && err.message ? err.message : err}`)
  }
}

const assert = (cond, message) => {
  if (!cond) {
    throw new Error(message || 'assertion failed')
  }
}

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`${message || 'not equal'}：实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`)
  }
}

/** 造一条任务（只填本模块关心的字段） */
const task = (over = {}) => ({
  gid: 'g1',
  status: TASK_STATUS.ACTIVE,
  totalLength: '100',
  completedLength: '0',
  downloadSpeed: '0',
  uploadSpeed: '0',
  uploadLength: '0',
  name: 'x',
  files: [],
  ...over
})

const pair = (over = {}) => ({
  pairId: 'p1',
  ...over
})

console.log('taskPair：配对识别')

check('同 pairId 且都有 gid 才算配对成员', () => {
  assertEqual(getPairId(pair({ gid: 'a' })), 'p1')
  assertEqual(getPairId({ pairId: 'p1' }), '', '没有 gid 不算成员')
  assertEqual(getPairId({ gid: 'a' }), '', '没有 pairId 不算成员')
  assertEqual(getPairId({ pairId: '   ', gid: 'a' }), '', '空白 pairId 不算成员')
})

check('角色只认 video / audio，其它一律当没有', () => {
  assertEqual(getPairRole({ pairRole: 'VIDEO' }), PAIR_ROLE_VIDEO)
  assertEqual(getPairRole({ pairRole: ' audio ' }), PAIR_ROLE_AUDIO)
  assertEqual(getPairRole({ pairRole: 'something' }), '')
  assertEqual(getPairRole({}), '')
})

check('成员 gid 候选：记录自身排最前、去重', () => {
  const row = { gid: 'a', pairGids: ['a', 'b'] }
  assertEqual(JSON.stringify(getPairGidCandidates(row)), JSON.stringify(['a', 'b']))
  const row2 = { gid: 'b', pairGids: ['a', 'b'] }
  assertEqual(JSON.stringify(getPairGidCandidates(row2)), JSON.stringify(['b', 'a']))
})

check('展开成员 gid：没有 pairGids 时只有自己', () => {
  assertEqual(JSON.stringify(getPairMemberGids({ gid: 'a' })), JSON.stringify(['a']))
  assertEqual(JSON.stringify(getPairMemberGids({ gid: 'a', pairGids: ['a', 'b'] })), JSON.stringify(['a', 'b']))
  assertEqual(JSON.stringify(getPairMemberGids({ gid: 'b', pairGids: ['a', 'b'] })), JSON.stringify(['a', 'b']))
})

console.log('taskPair：折叠成一条记录')

const video = task(pair({
  gid: 'v1',
  pairRole: PAIR_ROLE_VIDEO,
  name: '短片_video.mp4',
  files: [{ path: '/dl/短片_video.mp4' }],
  totalLength: '10000000',
  completedLength: '10000000',
  status: TASK_STATUS.COMPLETE
}))

const audio = task(pair({
  gid: 'a1',
  pairRole: PAIR_ROLE_AUDIO,
  name: '短片_audio.m4a',
  files: [{ path: '/dl/短片_audio.m4a' }],
  totalLength: '2000000',
  completedLength: '500000',
  status: TASK_STATUS.ACTIVE,
  downloadSpeed: '128'
}))

check('两条流 → 一条记录，进度与速度都是求和', () => {
  const { list } = collapseTaskPairs([video, audio], {})
  assertEqual(list.length, 1, '只应出一条记录')
  const row = list[0]
  assert(isPairRow(row), '记录应标记为配对记录')
  assertEqual(row.gid, 'v1', '主 gid 取画面流（记录的身份要稳定）')
  assertEqual(row.totalLength, '12000000')
  assertEqual(row.completedLength, '10500000')
  assertEqual(row.downloadSpeed, '128')
  assertEqual(row.pairCount, 2)
  assertEqual(JSON.stringify(row.pairGids), JSON.stringify(['v1', 'a1']))
})

check('只有一条流在跑 → 记录是 active（不是已完成）', () => {
  const { list } = collapseTaskPairs([video, audio], {})
  assertEqual(list[0].status, TASK_STATUS.ACTIVE)
})

check('两条都下完 → complete；在 mergingList 里 → merging', () => {
  const doneAudio = { ...audio, completedLength: '2000000', status: TASK_STATUS.COMPLETE }
  assertEqual(collapseTaskPairs([video, doneAudio], {}).list[0].status, TASK_STATUS.COMPLETE)
  const merging = collapseTaskPairs([video, doneAudio], { mergingGids: ['a1'] }).list[0]
  assertEqual(merging.status, TASK_STATUS.MERGING, '后下完的那条在合并 → 记录也是 merging')
})

check('已有合并产物 → 状态绝不回到 merging（哪怕合并簿记还挂着成员）', () => {
  // 用户报的形态：合并完成、下载完成之后，卡片又冒出"正在合并音视频…"。
  // 成因是合并收尾是异步的 —— 另一半的重试定时器醒来后会把成员推回 MERGING。
  // 产物在盘上就是硬事实：只要整对里任一条带 dashMerged，状态就必须是完成。
  const doneVideo = { ...video, status: TASK_STATUS.COMPLETE, completedLength: '10000000' }
  const mergedAudio = {
    ...audio,
    status: TASK_STATUS.COMPLETE,
    completedLength: '2000000',
    dashMerged: true
  }
  const row = collapseTaskPairs([doneVideo, mergedAudio], { mergingGids: ['v1', 'a1'] }).list[0]
  assertEqual(row.pairMerged, true, '整对里任一条带产物 ⇒ 记录标记为已合并')
  assertEqual(row.status, TASK_STATUS.COMPLETE, '有产物就不可能是"正在合并"')
  // 产物落在**非主记录**（这里是 audio，主记录是 video）时同样要认出来
  assertEqual(row.gid, 'v1', '主记录仍是画面流')
})

check('成员出错 → 记录出错，且提示取出错那条的', () => {
  const badAudio = {
    ...audio,
    status: TASK_STATUS.ERROR,
    errorCode: 3,
    errorMessage: 'boom',
    statusHint: 'task.download-fail-notify'
  }
  const row = collapseTaskPairs([video, badAudio], {}).list[0]
  assertEqual(row.status, TASK_STATUS.ERROR)
  assertEqual(row.statusHint, 'task.download-fail-notify')
  assertEqual(row.errorCode, 3)
})

check('一条完成 + 一条暂停 → 暂停（这一对还没下完）', () => {
  const pausedAudio = { ...audio, status: TASK_STATUS.PAUSED }
  assertEqual(collapseTaskPairs([video, pausedAudio], {}).list[0].status, TASK_STATUS.PAUSED)
  const waitingAudio = { ...audio, status: TASK_STATUS.WAITING }
  assertEqual(collapseTaskPairs([video, waitingAudio], {}).list[0].status, TASK_STATUS.WAITING)
})

check('普通任务原样保留，顺序不乱', () => {
  const solo = task({ gid: 's1', name: 'solo.zip' })
  const other = task({ gid: 's2', name: 'other.zip' })
  const { list } = collapseTaskPairs([solo, video, other, audio], {})
  assertEqual(list.length, 3)
  assertEqual(list[0].gid, 's1')
  assertEqual(list[1].gid, 'v1', '折叠记录落在**第一次出现**的位置')
  assertEqual(list[2].gid, 's2')
  assertEqual(list[0].isPair, undefined, '普通任务不该被标成配对记录')
})

check('伙伴被删掉/合并掉 → 剩下的那条仍是配对记录（合并进度还挂得上）', () => {
  const { list } = collapseTaskPairs([video], {})
  assertEqual(list.length, 1)
  assert(isPairRow(list[0]), '单成员也要标记 isPair：合并进度条要靠它')
  assertEqual(list[0].pairCount, 1)
  assertEqual(JSON.stringify(list[0].pairGids), JSON.stringify(['v1']))
})

check('两个配对互不干扰', () => {
  const v2 = { ...video, gid: 'v2', pairId: 'p2', name: 'b_video.mp4' }
  const a2 = { ...audio, gid: 'a2', pairId: 'p2', name: 'b_audio.m4a' }
  const { list } = collapseTaskPairs([video, v2, audio, a2], {})
  assertEqual(list.length, 2)
  assertEqual(JSON.stringify(list.map(r => r.gid)), JSON.stringify(['v1', 'v2']))
  assertEqual(JSON.stringify(list.map(r => r.pairCount)), JSON.stringify([2, 2]))
})

console.log('taskPair：折叠结果复用（避免每轮重渲染）')

check('内容一致 → 复用上一轮的对象', () => {
  const first = collapseTaskPairs([video, audio], {})
  const second = collapseTaskPairs([video, audio], { previousRows: first.rows })
  assert(second.list[0] === first.list[0], '应复用同一个对象')
  assertEqual(second.changed, false, '没有变化就不该报告 changed')
})

check('成员对象换了（进度变了）→ 重新折叠', () => {
  const first = collapseTaskPairs([video, audio], {})
  const audioMoved = { ...audio, completedLength: '600000' }
  const second = collapseTaskPairs([video, audioMoved], { previousRows: first.rows })
  assert(second.list[0] !== first.list[0], '应重新折叠')
  assertEqual(second.changed, true)
  assertEqual(second.list[0].completedLength, '10600000')
})

console.log('taskPair：产物名预览')

check('角色标记与重复序号被去掉，扩展名沿用画面流', () => {
  const { list } = collapseTaskPairs([video, audio], {})
  assertEqual(list[0].pairDisplayName, '短片.mp4')
})

check('带序号的流名（`<名>_2_video.mp4`）同样归到同一个词干', () => {
  const v = { ...video, name: 'ep01_2_video.mp4', files: [{ path: '/dl/ep01_2_video.mp4' }] }
  const a = { ...audio, name: 'ep01_2_audio.m4a', files: [{ path: '/dl/ep01_2_audio.m4a' }] }
  assertEqual(collapseTaskPairs([v, a], {}).list[0].pairDisplayName, 'ep01.mp4')
})

check('只给声音流时也能预览（视频容器缺省 mp4）', () => {
  const a = { ...audio, gid: 'a9' }
  assertEqual(collapseTaskPairs([a], {}).list[0].pairDisplayName, '短片.mp4')
})

check('没有角色标记的普通文件名原样返回', () => {
  const v = { ...video, name: 'movie.mp4', files: [{ path: '/dl/movie.mp4' }] }
  const a = { ...audio, name: 'movie.m4a', files: [{ path: '/dl/movie.m4a' }] }
  assertEqual(collapseTaskPairs([v, a], {}).list[0].pairDisplayName, 'movie.mp4')
})

console.log('taskPair：批量操作按成员展开')

check('展开含伙伴的 gid，去重且保持顺序', () => {
  const { index } = collapseTaskPairs([video, audio], {})
  assertEqual(JSON.stringify(expandPairGids(index, ['v1'])), JSON.stringify(['v1', 'a1']))
  assertEqual(JSON.stringify(expandPairGids(index, ['a1'])), JSON.stringify(['v1', 'a1']), '按伙伴任一 gid 都要展开到整对')
  assertEqual(JSON.stringify(expandPairGids(index, ['a1', 'v1', 's1'])), JSON.stringify(['v1', 'a1', 's1']))
  assertEqual(JSON.stringify(expandPairGids(index, [])), JSON.stringify([]))
})

check('非配对任务的 gid 原样保留', () => {
  const { index } = collapseTaskPairs([task({ gid: 's1' }), video, audio], {})
  assertEqual(JSON.stringify(expandPairGids(index, ['s1'])), JSON.stringify(['s1']))
})

check('空列表不炸', () => {
  const { list, index } = collapseTaskPairs([], {})
  assertEqual(list.length, 0)
  assertEqual(expandPairGids(index, ['x']).length, 1)
})

console.log('taskPair：进度条口径（黄底 / 绿色覆盖层）')

check('下载阶段（两条流都还在下）走普通进度条，进度是两条流之和', () => {
  const v = resolveProgressView({
    isPair: true,
    status: TASK_STATUS.ACTIVE,
    total: 12000000,
    completed: 10500000,
    mergePercent: -1
  })
  assertEqual(v.mode, 'plain')
  assertEqual(Math.round(v.basePercent), 88, '10500000/12000000 ≈ 88%')
  assertEqual(v.coverPercent, 0)
})

check('两个文件都下完 → 满格黄条（可以合并了）', () => {
  const v = resolveProgressView({
    isPair: true,
    status: TASK_STATUS.COMPLETE,
    total: 12000000,
    completed: 12000000,
    mergePercent: -1
  })
  assertEqual(v.mode, 'pair-pending')
  assertEqual(v.basePercent, 100, '黄条整根留着当背景')
  assertEqual(v.coverPercent, 0, '合并还没开始，绿色覆盖层还没出现')
})

check('合并中 → 黄底保持满格 + 绿色按合并进度盖上去', () => {
  const v = resolveProgressView({
    isPair: true,
    status: TASK_STATUS.MERGING,
    total: 12000000,
    completed: 12000000,
    mergePercent: 37.5
  })
  assertEqual(v.mode, 'pair-merge')
  assertEqual(v.basePercent, 100, '底条不跟着合并走，它是"下载已完成"的背景')
  assertEqual(v.coverPercent, 37.5)
})

check('合并完成（记录带回 dashMerged）→ 回到普通条（满格绿）', () => {
  const v = resolveProgressView({
    isPair: true,
    merged: true,
    status: TASK_STATUS.COMPLETE,
    total: 12000000,
    completed: 12000000,
    mergePercent: -1
  })
  assertEqual(v.mode, 'plain', '已合并出产物 → 不该再显示"待合并"的黄')
})

check('有产物 + 成员还没被清掉（memberCount 仍是 2）→ 也不回黄条', () => {
  // 合并收尾是异步的：另一半的任务/历史清理失败时记录还会短暂（甚至长时间）
  // 带着两条成员。产物已经在盘上，进度条就不能再退回"待合并"
  const v = resolveProgressView({
    isPair: true,
    merged: true,
    status: TASK_STATUS.COMPLETE,
    total: 12000000,
    completed: 12000000,
    mergePercent: -1
  })
  assertEqual(v.mode, 'plain')
})

check('下载完成但字节数没对齐（引擎总长是估算值）→ 仍然转黄，不因 completed < total 卡住', () => {
  const v = resolveProgressView({
    isPair: true,
    status: TASK_STATUS.COMPLETE,
    total: 12000000,
    completed: 11999999,
    mergePercent: -1
  })
  assertEqual(v.mode, 'pair-pending', '判据是记录状态，不是字节比较（用户报过"100% 了还是绿的"）')
  assertEqual(v.basePercent, 100)
})

check('合并中不要求成员数（成员被摘掉也照样显示绿色覆盖层）', () => {
  const v = resolveProgressView({
    isPair: true,
    status: TASK_STATUS.MERGING,
    total: 12000000,
    completed: 12000000,
    mergePercent: 12
  })
  assertEqual(v.mode, 'pair-merge')
  assertEqual(v.coverPercent, 12)
})

check('普通任务永远走普通条', () => {
  const v = resolveProgressView({
    isPair: false,
    status: TASK_STATUS.COMPLETE,
    total: 100,
    completed: 100,
    mergePercent: 50
  })
  assertEqual(v.mode, 'plain')
})

check('还没下完就绝不转黄（聚合状态还是 active）', () => {
  const v = resolveProgressView({
    isPair: true,
    status: TASK_STATUS.ACTIVE,
    total: 12000000,
    completed: 11990000,
    mergePercent: 10
  })
  assertEqual(v.mode, 'plain', '字节已经 99.9% 也没用：只要还有成员在下就是普通条')
})

check('已进入 merging ⇒ 下载阶段结束，黄底 + 绿盖（字节数不参与判断）', () => {
  // 判据只看状态：`TaskProgress` 画满格走的是同一支（status === COMPLETE/MERGING
  // ⇒ 100%），两处一旦分叉，就会出现"条满格、却没有黄条"（用户报的形态）。
  const v = resolveProgressView({
    isPair: true,
    status: TASK_STATUS.MERGING,
    total: 12000000,
    completed: 10500000,
    mergePercent: 10
  })
  assertEqual(v.mode, 'pair-merge')
  assertEqual(v.basePercent, 100, '下载阶段的底条恒为满格')
  assertEqual(v.coverPercent, 10)
})

check('确定不再合并（mergeSkipped）→ 收回普通条，不再挂"待合并"', () => {
  // 只有一条流、永远等不到另一半的记录：重试耗尽后必须从黄条上下来
  const v = resolveProgressView({
    isPair: true,
    mergeSkipped: true,
    status: TASK_STATUS.COMPLETE,
    total: 12000000,
    completed: 12000000,
    mergePercent: -1
  })
  assertEqual(v.mode, 'plain')
  const merging = resolveProgressView({
    isPair: true,
    mergeSkipped: true,
    status: TASK_STATUS.MERGING,
    total: 12000000,
    completed: 12000000,
    mergePercent: 30
  })
  assertEqual(merging.mode, 'plain', '已收尾的记录即使被推回 merging 也不该再显示合并层')
})

check('待合并不要求"列表里还剩两条流"（成员被摘掉/收敛后照样黄）', () => {
  // 合并成功后记录就收敛成一条（pairCount 变 1），某条源被隐藏时也会掉到 1 ——
  // 用成员个数兜"待合并"会让黄条时有时无。判据只有"配对 + 下载完成 + 没合并"。
  const v = resolveProgressView({
    isPair: true,
    status: TASK_STATUS.COMPLETE,
    total: 12000000,
    completed: 12000000,
    mergePercent: -1
  })
  assertEqual(v.mode, 'pair-pending')
  assertEqual(v.basePercent, 100)
  assertEqual(v.coverPercent, 0)
})

check('越界的合并进度被夹回 0~100；拿不到进度就是黄条', () => {
  const over = resolveProgressView({
    isPair: true, memberCount: 2, status: TASK_STATUS.MERGING, total: 100, completed: 100, mergePercent: 140
  })
  assertEqual(over.coverPercent, 100)
  const negative = resolveProgressView({
    isPair: true, memberCount: 2, status: TASK_STATUS.MERGING, total: 100, completed: 100, mergePercent: -3
  })
  assertEqual(negative.mode, 'pair-pending')
})

check('总长未知（还没拿到 Content-Length）时按 0% 处理，不炸', () => {
  const v = resolveProgressView({
    isPair: true, memberCount: 2, status: TASK_STATUS.ACTIVE, total: 0, completed: 0, mergePercent: -1
  })
  assertEqual(v.mode, 'plain')
  assertEqual(v.basePercent, 0)
})

console.log('taskPair：addUri 结果的 gid 归一化（配对信息到底写在哪条任务上）')

// 为什么与"配对"放在一起测：**这就是一对音视频折叠不成一条记录的原因**——
// 只按 aria2 的 [gid] 形状取 r[0]，原生协议（裸 gid）下会拿到 gid 的**首字符**，
// 于是 pairId 被写到不存在的 gid 上，引擎侧的真实任务永远查不到自己的配对信息。

check('aria2 的 multicall 形状：每条结果是单元素数组', () => {
  const gids = unwrapMulticallValues([['b313980680d10dee'], ['d78908ca00000001']])
  assertEqual(JSON.stringify(gids), JSON.stringify(['b313980680d10dee', 'd78908ca00000001']))
})

check('原生协议（JSON-RPC batch）形状：每条结果是裸 gid', () => {
  const gids = unwrapMulticallValues(['b313980680d10dee', 'd78908ca00000001'])
  assertEqual(JSON.stringify(gids), JSON.stringify(['b313980680d10dee', 'd78908ca00000001']),
    '绝不能退化成 gid 的第一个字符')
})

check('裸 gid 不会只取首字符（曾经的 bug 判据）', () => {
  const gids = unwrapMulticallValues(['b313980680d10dee'])
  assertEqual(gids[0], 'b313980680d10dee')
  assert(gids[0].length > 1, '首字符 = 配对信息写到不存在的 gid 上')
})

check('对象形状（未 unwrap 的 { gid }）与空/异常输入都能兜住', () => {
  assertEqual(unwrapMulticallValues([{ gid: 'abc123' }])[0], 'abc123')
  assertEqual(JSON.stringify(unwrapMulticallValues([])), JSON.stringify([]))
  assertEqual(unwrapMulticallValues([[]])[0], undefined)
  assertEqual(JSON.stringify(unwrapMulticallValues(['x', null, 'y'])), JSON.stringify(['x', null, 'y']))
})


// ---------------------------------------------------------------------------
// 「一对音视频」的分片网格合成（独立进度窗口「分片」页的数据源）
// ---------------------------------------------------------------------------
// 引擎的位图是**下载开始之后**才有的（零进度时 bitfield 为空），此前配对又
// 直接不下发分片，于是窗口的「分片」页对一对音视频永远是「无分片数据」。

check('合成网格：两条流各自有位图 → 每格取最小值（都下完才算下完）', () => {
  const video = [4, 4, 4, 2, 0, 0]
  const audio = [4, 2, 0, 0, 0, 0]
  assertEqual(JSON.stringify(combinePieceStatuses([video, audio])),
    JSON.stringify([4, 2, 0, 0, 0, 0]))
})

check('合成网格：格数不同的两条流按比例映射到同一套格子', () => {
  // 画面流 4 格全下完、声音流 8 格只下了 1 格 → 前半段不能被判成"全绿"
  const out = combinePieceStatuses([[4, 4, 4, 4], [4, 0, 0, 0, 0, 0, 0, 0]])
  assertEqual(out.length, 8, '格数取最长的一条')
  assertEqual(out[0], 4)
  assertEqual(out[1], 0, '声音流第 2 格没下完 → 对应格不能是 4')
  assertEqual(out[7], 0)
})

check('合成网格：只有一条流开工（另一条还没有位图）→ 仍出网格', () => {
  const out = combinePieceStatuses([[4, 4, 0, 0], null])
  assertEqual(JSON.stringify(out), JSON.stringify([4, 4, 0, 0]),
    '零进度的那条流按"全 0"并入，而不是让整个分片页变成"无分片数据"')
})

check('合成网格：两条流都还没有位图（刚开始、零进度）→ null', () => {
  assertEqual(combinePieceStatuses([null, null]), null)
  assertEqual(combinePieceStatuses([]), null)
  assertEqual(combinePieceStatuses(undefined), null)
})

check('合成网格：单调不回退（只推进不后退）', () => {
  const a = [0, 0, 0, 0]
  const b1 = combinePieceStatuses([a, [0, 0, 0, 0]])
  const b2 = combinePieceStatuses([[4, 4, 0, 0], [4, 0, 0, 0]])
  assertEqual(JSON.stringify(b1), JSON.stringify([0, 0, 0, 0]))
  assertEqual(JSON.stringify(b2), JSON.stringify([4, 0, 0, 0]))
  assert(b2[0] >= b1[0] && b2[1] >= b1[1], '进度只能前进')
})

check('bitfield → 格状态：下载开始前为空、开始后才有（判据来源）', () => {
  assertEqual(parsePieceStatuses('', '', 0, ''), null, '零进度：引擎还没给位图')
  // 8 片 = 2 格；'ff' 两格全满、'f0' 只有第一格下完
  assertEqual(JSON.stringify(parsePieceStatuses('ff', '', 8, '')), JSON.stringify([4, 4]))
  assertEqual(JSON.stringify(parsePieceStatuses('f0', '', 8, '')), JSON.stringify([4, 0]))
  // 位图比格数短时按位图长度截断（不凭空多渲染一格"未下载"）
  assertEqual(parsePieceStatuses('f', '', 8, '').length, 1)
})

console.log('')
console.log('taskPair：下载完成通知的去重（一条下载只弹一次）')
// 一个视频下载完成弹了 2~3 条完成通知：一条下载会走到多条"完成"路径上
// （最后一条流完成的合并成功、另一半重试定时器醒来后的合并成功、重试耗尽
// 后的如实收尾、缺媒体引擎的降级完成），每条路径过去各弹一次。

check('身份键：一对音视频按 pairId 算一次，普通任务按 gid', () => {
  assertEqual(completeNotifyKey({ gid: 'a1', pairId: 'p9', pairRole: 'video' }), 'pair:p9')
  assertEqual(completeNotifyKey({ gid: 'a1' }), 'gid:a1')
})

check('配对身份由调用方显式传入（引擎任务对象上没有 pairId）', () => {
  // ⚠️ 这条是实测踩出来的：pairId 只存在**任务历史**里，引擎任务对象上没有。
  // 只按任务对象取键，一对音视频的两条流会各落到 `gid:<自己的 gid>` → 又是两次通知。
  const n = createCompleteNotifier()
  // 调用方（EngineClient）自己拼身份：pairId 从 getTaskPairInfo 取
  assertEqual(n.shouldNotify({ pairId: 'p9', gid: 'video' }, '/dl/x_video.mp4'), true)
  assertEqual(n.shouldNotify({ pairId: 'p9', gid: 'audio' }, '/dl/x.mp4'), false,
    '同一个 pairId 的不同成员 gid 必须归到同一个键')
})

check('同一对音视频的多条完成路径只通知一次', () => {
  const n = createCompleteNotifier()
  const video = { gid: 'a1', pairId: 'p9', pairRole: 'video' }
  const audio = { gid: 'b2', pairId: 'p9', pairRole: 'audio' }
  assertEqual(n.shouldNotify(video, '/dl/x_video.mp4'), true, '先到的通知要弹')
  assertEqual(n.shouldNotify(audio, '/dl/x_audio.m4a'), false, '合并成功那一支不能再弹')
  assertEqual(n.shouldNotify(audio, '/dl/x.mp4'), false, '重试定时器合出同一产物也不能再弹')
  assertEqual(n.size, 1)
})

check('两条不同的下载互不影响（哪怕文件同名、路径相同）', () => {
  const n = createCompleteNotifier()
  assertEqual(n.shouldNotify({ gid: 'a1' }, '/dl/x.mp4'), true)
  assertEqual(n.shouldNotify({ gid: 'a2' }, '/dl/x.mp4'), true, '重新下载必须照常通知')
  assertEqual(n.shouldNotify({ gid: 'a1' }, '/dl/x.mp4'), false, '同一个任务重复上报才拦')
})

check('取不到身份时放行 —— 宁可多弹一次，也不能吞掉通知', () => {
  const n = createCompleteNotifier()
  assertEqual(n.shouldNotify({}, ''), true)
  assertEqual(n.shouldNotify(null, ''), true)
})

check('超时后可以再次通知；按 gid 清理后也能再次通知', () => {
  const n = createCompleteNotifier({ ttlMs: 1000 })
  const task = { gid: 'a1' }
  assertEqual(n.shouldNotify(task, '', 1000), true)
  assertEqual(n.shouldNotify(task, '', 1500), false)
  assertEqual(n.shouldNotify(task, '', 3000), true, '超过 TTL 视为另一次下载')
  n.forgetGids(['a1'])
  assertEqual(n.shouldNotify(task, '', 3100), true, '任务被删除/重下后不该被上一次的结论罩住')
})

check('键数量有上限，不会无限增长', () => {
  const n = createCompleteNotifier({ ttlMs: 60 * 60 * 1000, maxKeys: 10 })
  for (let i = 0; i < 50; i++) {
    n.shouldNotify({ gid: `g${i}` }, '', 1000 + i)
  }
  assert(n.size <= 11, `size=${n.size}`)
})

// ── 「开始下载」通知：一次下载只弹一次（EngineClient::notifyDownloadStartOnce）──
//
// 老实现按"文件名 + 10 秒窗口"去重：一对音视频刚下发时文件名还认不出配对，键退化
// 成各自的 gid ⇒ 各弹一次（用户报的"媒体任务添加时弹两个通知"）；两条流先后开始、
// 隔得久时 10 秒窗口也过期。现在与完成通知同口径（pairId / gid）+ 10 分钟窗口。
const START_NOTIFY_TTL_MS = 10 * 60 * 1000

check('开始通知：一对音视频（两个 gid 一个 pairId）只弹一次', () => {
  const n = createCompleteNotifier({ ttlMs: START_NOTIFY_TTL_MS })
  assertEqual(n.shouldNotify({ pairId: 'p1', gid: 'video-gid' }, ''), true, '画面流先到 → 弹')
  assertEqual(n.shouldNotify({ pairId: 'p1', gid: 'audio-gid' }, ''), false, '声音流后到 → 不能再弹')
})

check('开始通知：两条流隔得久也只弹一次（窗口给足 10 分钟）', () => {
  const n = createCompleteNotifier({ ttlMs: START_NOTIFY_TTL_MS })
  const t0 = 1000000
  assertEqual(n.shouldNotify({ pairId: 'p1', gid: 'v' }, '', t0), true)
  // 排队下载时两条流隔几分钟很正常 —— 老实现的 10 秒窗口早就过期了
  assertEqual(n.shouldNotify({ pairId: 'p1', gid: 'a' }, '', t0 + 5 * 60 * 1000), false)
})

check('开始通知：普通任务按 gid，重新下载照弹', () => {
  const n = createCompleteNotifier({ ttlMs: START_NOTIFY_TTL_MS })
  assertEqual(n.shouldNotify({ gid: 'g1' }, ''), true)
  assertEqual(n.shouldNotify({ gid: 'g1' }, ''), false, '同一个任务重复上报才拦')
  assertEqual(n.shouldNotify({ gid: 'g2' }, ''), true, '另一个任务照弹')
  assertEqual(n.shouldNotify({ pairId: 'p2', gid: 'g3' }, ''), true, '重新下载（新 pairId）照弹')
})

console.log('')
console.log(`taskPair: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
