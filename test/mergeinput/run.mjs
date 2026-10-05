#!/usr/bin/env node
/**
 * 「合并的输入是否已被别人占用」纯函数测试（纯 Node，零依赖）
 * ==========================================================
 *
 * 用户点名的形态：**同一时间有多个媒体任务在下载时，一个先下完却不合并，
 * 非要等另一个也下完才一同进行合并。**
 *
 * 根因在 `isPathBeingDownloadedByOther` 曾经的第 3 个条件
 * `hasEngineControlFile(entry 的文件)`：它跟**目标文件**无关 —— 只要系统里
 * 还有任意一个进行中的任务（它的文件带引擎控制文件），就对**任何**目标返回
 * true。于是先下完的那一对被判成"输入还在下"，合并被无限推迟。
 *
 * 下面第 1 条就是这个回归的守卫：**别的任务在下载，不能影响本任务的文件**。
 * 把判据改回"看任意 entry 的文件是否在下载"，它立刻变红。
 *
 * 用法：node test/mergeinput/run.mjs
 * 退出码：0 全过 / 1 有失败。
 */

import {
  collectEntryFilePaths,
  normalizeDownloadedPath,
  isTargetWrittenByEntries
} from '../../src/renderer/utils/mergeInput.js'

let passed = 0
let failed = 0

const check = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    console.log(`  \u2717 ${name}`)
    console.log(`      ${e && e.message ? e.message : e}`)
  }
}
const assertEqual = (actual, expected, msg) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg || ''} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}
const resolvePath = (p) => (p ? `/${`${p}`.replace(/^\/+/, '')}` : '')

const ACTIVE = ['active', 'waiting', 'paused']

console.log('\n合并输入判据（utils/mergeInput.js）')

// ── 1. 用户报的回归：别的任务在下载，不影响本任务 ────────────────────────
check('不相关的任务在下载时，已完成的目标文件必须判为"没被占用"', () => {
  const entries = [
    { gid: 'b', status: 'active', files: [{ path: '/dl/B_video.mp4' }, { path: '/dl/B_audio.m4a' }] }
  ]
  assertEqual(
    isTargetWrittenByEntries({
      target: '/dl/A_audio.m4a',
      entries,
      pendingStatuses: ACTIVE,
      resolvePath
    }),
    false,
    'B 还在下载不等于 A 的输入还在下：'
  )
})

check('多个不相关任务同时在下载，同样不能影响本任务', () => {
  const entries = [
    { gid: 'b', status: 'active', files: [{ path: '/dl/B_video.mp4' }] },
    { gid: 'c', status: 'waiting', files: [{ path: '/dl/C_audio.m4a' }] },
    { gid: 'd', status: 'paused', files: [{ path: '/dl/D_video.mp4' }] }
  ]
  assertEqual(
    isTargetWrittenByEntries({ target: '/dl/A_video.mp4', entries, pendingStatuses: ACTIVE, resolvePath }),
    false,
    '并发下载不能互相阻塞合并：'
  )
})

// ── 2. 真命中：同一条路径的任务确实在下载 ────────────────────────────────
check('目标文件正是某个进行中任务的落盘文件 → 占用', () => {
  const entries = [{ gid: 'a', status: 'active', files: [{ path: '/dl/A_video.mp4' }] }]
  assertEqual(
    isTargetWrittenByEntries({ target: '/dl/A_video.mp4', entries, pendingStatuses: ACTIVE, resolvePath }),
    true
  )
})

check('同一个任务有多个文件时，只有命中的那个算占用', () => {
  const entries = [{
    gid: 'a',
    status: 'active',
    files: [{ path: '/dl/A_video.mp4' }, { path: '/dl/A_audio.m4a' }]
  }]
  assertEqual(
    isTargetWrittenByEntries({ target: '/dl/A_audio.m4a', entries, pendingStatuses: ACTIVE, resolvePath }),
    true
  )
  assertEqual(
    isTargetWrittenByEntries({ target: '/dl/Other.mp4', entries, pendingStatuses: ACTIVE, resolvePath }),
    false
  )
})

// ── 3. 状态闸门：不是"进行中"就不算 ─────────────────────────────────────
check('已完成/暂停中但不在 pending 集合里的任务不算占用', () => {
  const entries = [{ gid: 'a', status: 'complete', files: [{ path: '/dl/A_video.mp4' }] }]
  assertEqual(
    isTargetWrittenByEntries({ target: '/dl/A_video.mp4', entries, pendingStatuses: ACTIVE, resolvePath }),
    false
  )
})

// ── 4. 折叠记录：另一半（pairMembers）的文件也要看 ─────────────────────
check('折叠记录里 pairMembers 的文件参与判定（声音流仍在下载）', () => {
  const entries = [{
    gid: 'videoGid',
    isPair: true,
    status: 'active',
    files: [{ path: '/dl/A_video.mp4' }],
    pairMembers: [
      { gid: 'videoGid', status: 'complete', files: [{ path: '/dl/A_video.mp4' }] },
      { gid: 'audioGid', status: 'active', files: [{ path: '/dl/A_audio.m4a' }] }
    ]
  }]
  assertEqual(
    isTargetWrittenByEntries({ target: '/dl/A_audio.m4a', entries, pendingStatuses: ACTIVE, resolvePath }),
    true,
    '主成员（画面流）的文件不带声音流，必须能从 pairMembers 取到：'
  )
})

check('collectEntryFilePaths 合并 files 与 pairMembers[].files', () => {
  const entry = {
    files: [{ path: '/dl/A_video.mp4' }],
    pairMembers: [{ files: [{ path: '/dl/A_audio.m4a' }] }, { files: [{ path: '/dl/A_video.mp4' }] }]
  }
  assertEqual(collectEntryFilePaths(entry).map(f => f.path), ['/dl/A_video.mp4', '/dl/A_audio.m4a', '/dl/A_video.mp4'])
})

// ── 5. 下载中后缀 ───────────────────────────────────────────────────────
check('落盘路径带下载中后缀时，去掉后缀再与目标比对', () => {
  const entries = [{
    gid: 'a',
    status: 'active',
    files: [{ path: '/dl/A_video.mp4.lerxu-downloading' }]
  }]
  assertEqual(
    isTargetWrittenByEntries({
      target: '/dl/A_video.mp4',
      entries,
      pendingStatuses: ACTIVE,
      downloadingFileSuffix: '.lerxu-downloading',
      resolvePath
    }),
    true
  )
})

check('normalizeDownloadedPath 只在结尾命中后缀时裁剪', () => {
  assertEqual(normalizeDownloadedPath('/dl/A.mp4.part', '.part'), '/dl/A.mp4')
  assertEqual(normalizeDownloadedPath('/dl/A.part.mp4', '.part'), '/dl/A.part.mp4')
  assertEqual(normalizeDownloadedPath('/dl/A.mp4', ''), '/dl/A.mp4')
})

// ── 6. 老 aria2 约定：控制文件与下载文件同名 + .xfer ────────────────────
check('落盘路径为 <目标>.xfer 时也算占用', () => {
  const entries = [{ gid: 'a', status: 'active', files: [{ path: '/dl/A_video.mp4.xfer' }] }]
  assertEqual(
    isTargetWrittenByEntries({ target: '/dl/A_video.mp4', entries, pendingStatuses: ACTIVE, resolvePath }),
    true
  )
})

// ── 7. 空输入 ───────────────────────────────────────────────────────────
check('目标为空 / 列表为空 / 条目缺路径 → 一律 false', () => {
  assertEqual(isTargetWrittenByEntries({ target: '', entries: [], pendingStatuses: ACTIVE }), false)
  assertEqual(isTargetWrittenByEntries({ target: '/dl/A.mp4', entries: [], pendingStatuses: ACTIVE }), false)
  assertEqual(isTargetWrittenByEntries({
    target: '/dl/A.mp4',
    entries: [{ status: 'active' }, { status: 'active', files: [{}] }],
    pendingStatuses: ACTIVE,
    resolvePath
  }), false)
  assertEqual(isTargetWrittenByEntries({ target: '/dl/A.mp4', entries: [null], pendingStatuses: ACTIVE }), false)
})

console.log(`\n${passed} 通过，${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)
