#!/usr/bin/env node
/**
 * 第三方扩展「同 stem 音视频」配对判据测试（纯 Node，零依赖）
 * ==========================================================
 *
 * 这段判据是**破坏性**的：配成一对、合并成功之后，两个输入文件会被产物取代。
 * 所以每条保守条件都必须有测试盯着 —— 判松了会删掉用户自己的文件。
 *
 * 命名取自 Bilibili-Evolved 的「下载视频 - aria2 输出支持」真实行为：
 *   `title` 变量的结果 + DASH 扩展名（画面 `.mp4`，AAC 声音 `.m4a`，
 *   FLAC 声音 `.flac`），两条流**同 stem、不同扩展名**，没有任何角色标记。
 *   同扩展名多分片时才会追加 ` - 01` 这类序号。
 *
 * 用法：node test/avpair/run.mjs
 * 退出码：0 全过 / 1 有失败。
 */

import {
  mediaKindOf,
  mediaStemOf,
  scanSiblingMedia,
  resolveGenericPair,
  MAX_PAIR_MTIME_GAP_MS
} from '../../src/renderer/utils/avPair.js'

let passed = 0
let failed = 0

const check = (name, fn) => {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (e) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${e.message}`)
  }
}

const assertEqual = (actual, expected, hint = '') => {
  if (actual !== expected) {
    throw new Error(`期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}${hint ? `（${hint}）` : ''}`)
  }
}

const assertOk = (value, hint = '') => {
  if (!value) throw new Error(`期望为真${hint ? `（${hint}）` : ''}`)
}

const assertNull = (value, hint = '') => {
  if (value !== null) throw new Error(`期望 null，实际 ${JSON.stringify(value)}${hint ? `（${hint}）` : ''}`)
}

/** 造一份"文件名 → 大小/mtime"的 stat 表；表里没有的当 stat 失败。 */
const makeStat = (map) => (name) => (map[name] ? map[name] : null)

const NOW = 1762646400000 // 2026-11-09T00:00:00Z

console.log('第三方扩展音视频配对')

// ── 分类与 stem ────────────────────────────────────────────────────────

check('扩展名分类：画面 / 声音 / 不认识', () => {
  assertEqual(mediaKindOf('标题.mp4'), 'video')
  assertEqual(mediaKindOf('标题.MKV'), 'video', '大写也算')
  assertEqual(mediaKindOf('标题.ts'), 'video')
  assertEqual(mediaKindOf('标题.m4a'), 'audio')
  assertEqual(mediaKindOf('标题.FLAC'), 'audio')
  assertEqual(mediaKindOf('标题.ogg'), 'audio', 'ogg 是音频容器，不能当画面')
  assertEqual(mediaKindOf('标题.txt'), '')
  assertEqual(mediaKindOf('没有扩展名'), '')
  assertEqual(mediaKindOf('.mp4'), '', '纯扩展名不算文件名')
  assertEqual(mediaKindOf(''), '')
})

check('stem：只去扩展名与重复序号，不剥角色后缀', () => {
  assertEqual(mediaStemOf('标题.mp4'), '标题')
  assertEqual(mediaStemOf('标题.m4a'), '标题')
  assertEqual(mediaStemOf('标题 (1).mp4'), '标题', '重复序号不该拆成两个 stem')
  assertEqual(mediaStemOf('标题.mp4.lerxu-downloading', '.lerxu-downloading'), '标题')
  assertEqual(mediaStemOf('第1话 - 01.mp4'), '第1话 - 01', '序号是标题的一部分，保留')
  assertEqual(mediaStemOf('标题_video.mp4'), '标题_video', '角色后缀交给 pairId 那条路，这里不猜')
})

// ── 盘上两个文件都在：正常的一对 ────────────────────────────────────────

check('B站增强脚本默认输出：标题.mp4 + 标题.m4a → 一对', () => {
  const names = ['标题.mp4', '标题.m4a']
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names,
    statOf: makeStat({
      '标题.mp4': { size: 30_000_000, mtimeMs: NOW },
      '标题.m4a': { size: 3_000_000, mtimeMs: NOW + 4000 }
    })
  })
  assertOk(scan, '该认出这是一对')
  assertEqual(scan.stem, '标题')
  assertEqual(scan.video.name, '标题.mp4')
  assertEqual(scan.audio.name, '标题.m4a')
  assertEqual(scan.pending, false)

  const pair = resolveGenericPair(scan)
  assertEqual(pair.pairLike, true)
  assertEqual(pair.pending, false)
  assertEqual(pair.alreadyMerged, false)
})

check('FLAC 音轨：标题.mp4 + 标题.flac 也算（B站「音频质量」选 FLAC 时的形态）', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.flac',
    names: ['标题.mp4', '标题.flac'],
    statOf: makeStat({
      '标题.mp4': { size: 30_000_000, mtimeMs: NOW },
      '标题.flac': { size: 20_000_000, mtimeMs: NOW }
    })
  })
  assertEqual(scan.video.name, '标题.mp4', '声音那一半也要能认出画面')
  assertEqual(scan.audio.name, '标题.flac')
  assertEqual(resolveGenericPair(scan).pairLike, true)
})

check('重复下载的副本：标题 (1).mp4 与 标题.m4a 仍是同一个 stem', () => {
  const scan = scanSiblingMedia({
    ownName: '标题 (1).mp4',
    names: ['标题 (1).mp4', '标题.m4a'],
    statOf: makeStat({
      '标题 (1).mp4': { size: 30_000_000, mtimeMs: NOW },
      '标题.m4a': { size: 3_000_000, mtimeMs: NOW }
    })
  })
  assertEqual(scan.stem, '标题')
  assertEqual(scan.audio.name, '标题.m4a')
})

check('同一角色多个文件：取最大的那个', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.m4a',
    names: ['标题.mp4', '标题 (1).mp4', '标题.m4a'],
    statOf: makeStat({
      '标题.mp4': { size: 1000, mtimeMs: NOW },
      '标题 (1).mp4': { size: 90_000_000, mtimeMs: NOW },
      '标题.m4a': { size: 3000, mtimeMs: NOW }
    })
  })
  assertEqual(scan.video.name, '标题 (1).mp4', '分片/重复下载里最大的才是完整那份')
})

// ── 保守条件：这些情况**不许**认成一对 ─────────────────────────────────

check('只有一条流、任务里也没有另一半 → 不是一对（null）', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names: ['标题.mp4'],
    statOf: makeStat({ '标题.mp4': { size: 1000, mtimeMs: NOW } })
  })
  assertOk(scan, '扫描本身认得这条是画面')
  assertNull(resolveGenericPair(scan), '缺声音那一半，不能凑一对')
})

check('同名的是用户自己的独立文件（mtime 差 2 小时）→ 不配', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names: ['标题.mp4', '标题.m4a'],
    statOf: makeStat({
      '标题.mp4': { size: 1000, mtimeMs: NOW },
      '标题.m4a': { size: 1000, mtimeMs: NOW - 2 * 60 * 60 * 1000 }
    })
  })
  assertEqual(resolveGenericPair(scan).pairLike, false)
})

check('mtime 差刚好小于一小时 → 仍算一起下的', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names: ['标题.mp4', '标题.m4a'],
    statOf: makeStat({
      '标题.mp4': { size: 1000, mtimeMs: NOW },
      '标题.m4a': { size: 1000, mtimeMs: NOW - (MAX_PAIR_MTIME_GAP_MS - 60_000) }
    })
  })
  assertEqual(resolveGenericPair(scan).pairLike, true)
})

check('这一对已经合过（alreadyMerged）→ 不再当成一对', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names: ['标题.mp4', '标题.m4a'],
    statOf: makeStat({
      '标题.mp4': { size: 1000, mtimeMs: NOW },
      '标题.m4a': { size: 1000, mtimeMs: NOW }
    })
  })
  const pair = resolveGenericPair(scan, { alreadyMerged: true })
  assertEqual(pair.pairLike, false, '否则每次补扫都会再合一次，把产物覆盖掉')
})

check('0 字节文件不算已就绪（还没开始写盘）', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names: ['标题.mp4', '标题.m4a'],
    statOf: makeStat({
      '标题.mp4': { size: 1000, mtimeMs: NOW },
      '标题.m4a': { size: 0, mtimeMs: NOW }
    })
  })
  assertEqual(scan.audio, null, '0 字节不能进 ready')
  // 空文件本身不带 `.xfer`，光看盘不知道它在不在下 —— 得靠任务列表回答
  const pair = resolveGenericPair(scan, { taskKinds: { video: true, audio: true } })
  assertEqual(pair.pending, true, '有任务在写它 → 继续等，不许合并')
})

// ── 还在下载：只报 pending，绝不合并 ───────────────────────────────────

check('声音还在下（旁边有 .xfer）→ pending，且拿不到 audio', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names: ['标题.mp4', '标题.m4a', '标题.m4a.xfer'],
    statOf: makeStat({
      '标题.mp4': { size: 1000, mtimeMs: NOW },
      '标题.m4a': { size: 12, mtimeMs: NOW }
    })
  })
  assertEqual(scan.pending, true)
  assertEqual(scan.audio, null, '半截文件不能当输入')
  const pair = resolveGenericPair(scan, { taskKinds: { video: true, audio: true } })
  assertEqual(pair.pending, true, '交给重试继续等')
  assertEqual(pair.pairLike, true, '但要认得出这是一对，否则永远不会再试')
})

check('下载中后缀（.lerxu-downloading）同样算 pending', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names: ['标题.mp4', '标题.m4a.lerxu-downloading'],
    downloadingSuffix: '.lerxu-downloading',
    statOf: makeStat({ '标题.mp4': { size: 1000, mtimeMs: NOW } })
  })
  assertEqual(scan.pending, true)
  assertEqual(scan.audio, null)
})

check('任务列表说另一半还没结束 → partnerPending 让整对保持 pending', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names: ['标题.mp4', '标题.m4a'],
    statOf: makeStat({
      '标题.mp4': { size: 1000, mtimeMs: NOW },
      '标题.m4a': { size: 1000, mtimeMs: NOW }
    })
  })
  const pair = resolveGenericPair(scan, { taskKinds: { video: true, audio: true }, partnerPending: true })
  assertEqual(pair.pending, true, '盘上有文件但任务仍在跑（续传/校验），不能合')
})

check('合并过程的隐藏临时文件不参与配对', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.mp4',
    names: ['标题.mp4', '标题.m4a', '.标题.lerxu-merging-abc.mp4'],
    statOf: makeStat({
      '标题.mp4': { size: 1000, mtimeMs: NOW },
      '标题.m4a': { size: 1000, mtimeMs: NOW },
      '.标题.lerxu-merging-abc.mp4': { size: 999_999, mtimeMs: NOW }
    })
  })
  assertEqual(scan.video.name, '标题.mp4', '不能把合并临时产物当成画面流')
})

// ── 已知限制（锁死行为，改动时要显式改测试）────────────────────────────

check('两边都是 .m4s（老版默认扩展名）→ 认不出，按普通任务收尾', () => {
  const scan = scanSiblingMedia({
    ownName: '标题.m4s',
    names: ['标题.m4s', '标题 (1).m4s'],
    statOf: makeStat({
      '标题.m4s': { size: 1000, mtimeMs: NOW },
      '标题 (1).m4s': { size: 1000, mtimeMs: NOW }
    })
  })
  assertNull(scan, '.m4s 不是画面也不是声音，无法靠文件名判断角色')
})

check('不是媒体文件 → null（普通下载不受影响）', () => {
  assertNull(scanSiblingMedia({ ownName: '压缩包.zip', names: ['压缩包.zip', '说明.txt'] }))
  assertNull(scanSiblingMedia({ ownName: '', names: ['标题.mp4'] }))
  assertNull(scanSiblingMedia({}))
  assertNull(resolveGenericPair(null))
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
