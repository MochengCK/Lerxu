#!/usr/bin/env node
/**
 * 媒体引擎适配层测试（纯 Node，零依赖）
 * ==================================
 *
 * 覆盖两类容易静默坏掉的东西：
 *
 *  1. **适配层的纯逻辑** —— 二进制候选路径的顺序、NDJSON 行的解析、
 *     错误文案的拼装、"产物是否同时含视频与音频"的判据。
 *     这些逻辑以前散在 Vue 组件里，没法单测；抽到 `src/shared/zuvrust`
 *     之后这里就能把它们钉死。
 *  2. **引擎的对外契约** —— 真的起一次 `zuvrust` 进程，验证
 *     `version` / `probe` / 未知子命令 / 缺输入 的**退出码与输出形状**。
 *     宿主就是按这些决定"要不要重试、怎么提示用户"的，改了就是破坏契约。
 *
 * 用法：
 *   node test/zuvrust/run.mjs                 # 自动找 target/debug 下的引擎
 *   node test/zuvrust/run.mjs --bin <路径>     # 指定引擎可执行文件
 *   node test/zuvrust/run.mjs --no-cli        # 只跑纯逻辑（无引擎二进制时）
 * 退出码：0 = 全部通过；1 = 任一失败。
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

import {
  mediaEngineBinName,
  mediaEngineArch,
  mediaEngineCandidates,
  parseEngineLine,
  lastEngineError,
  engineErrorText,
  engineExitRetryable,
  probeHasVideoAndAudio,
  progressFromEngineLine,
  ENGINE_EXIT
} from '../../src/shared/zuvrust/index.js'

// ---------- 极简断言 ----------
let passed = 0
const failures = []
function ok (cond, name, detail = '') {
  if (cond) {
    passed++
    process.stdout.write(`  ✓ ${name}\n`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    process.stdout.write(`  ✗ ${name}${detail ? ` — ${detail}` : ''}\n`)
  }
}
function eq (actual, expected, name) {
  ok(actual === expected, name, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
}
function section (title) {
  process.stdout.write(`\n${title}\n`)
}

// ---------- 1. 二进制定位 ----------
section('二进制定位')
eq(mediaEngineBinName('win32'), 'zuvrust.exe', 'Windows 用 .exe 后缀')
eq(mediaEngineBinName('darwin'), 'zuvrust', 'macOS 无后缀')
eq(mediaEngineBinName('linux'), 'zuvrust', 'Linux 无后缀')
eq(mediaEngineArch('arm64'), 'arm64', 'arm64 目录名')
eq(mediaEngineArch('x64'), 'x64', 'x64 目录名')
eq(mediaEngineArch('ia32'), 'x64', '未支持的架构回落到 x64（与既有约定一致）')

const cands = mediaEngineCandidates({
  platform: 'darwin',
  arch: 'arm64',
  userDataPath: '/Users/u/Library/Lerxu',
  appDir: '/Applications/Lerxu.app/Contents/MacOS',
  resourcesPath: '/Applications/Lerxu.app/Contents/Resources',
  devRoot: '/repo'
})
ok(
  cands[0] === '/Users/u/Library/Lerxu/engine/zuvrust',
  '用户数据目录的 engine/ 排第一（可热替换升级）',
  cands[0]
)
ok(
  cands.includes('/repo/extra/darwin/arm64/engine/zuvrust'),
  '开发期走 extra/<平台>/<架构>/engine（与下载引擎同一套回填约定）',
  JSON.stringify(cands)
)
eq(cands[cands.length - 1], 'zuvrust', '最后一条是裸名字（交给 PATH）')
ok(
  cands.indexOf('/Applications/Lerxu.app/Contents/Resources/engine/zuvrust') <
    cands.indexOf('/repo/extra/darwin/arm64/engine/zuvrust'),
  '打包资源目录优先于开发目录',
  JSON.stringify(cands)
)
// 空环境不能崩、也不能造出半截路径
const bare = mediaEngineCandidates({ platform: 'linux', arch: 'x64' })
eq(bare.length, 1, '没有任何环境信息时只剩裸名字')
ok(!bare[0].startsWith('/'), '裸名字不是绝对路径')

// ---------- 2. NDJSON 解析 ----------
section('NDJSON 解析')
const progressLine = '{"ok":true,"type":"mux","data":{"percent":42.4,"outputBytes":1024,"mediaTimeUs":1000000,"durationUs":2000000}}'
const p = progressFromEngineLine(progressLine)
ok(p !== null, '进度行能被解析')
eq(p.kind, 'mux', 'type 是任务名（宿主可以按它分发）')
eq(p.percent, 42.4, 'percent 原样取出')
eq(p.totalSize, 1024, 'outputBytes 映射为 totalSize（界面沿用旧字段名）')
eq(
  progressFromEngineLine('{"ok":true,"type":"mux","data":{"percent":50,"outputBytes":150,"inputBytes":300}}').inputBytes,
  300,
  '合并进度带输入总字节（界面显示"已写 / 总量"，没有它就是一句空话）'
)
eq(
  progressFromEngineLine('{"ok":true,"type":"mux","data":{"percent":1}}').inputBytes,
  0,
  '没有 inputBytes 时给 0（不是 NaN —— 那会让界面显示出 NaN）'
)
eq(progressFromEngineLine('{"ok":true,"result":{}}'), null, '结果行不是进度行（没有 type）')
eq(
  progressFromEngineLine('{"ok":true,"type":"download","data":{"percent":10}}').kind,
  'download',
  '不同任务的进度行都能认出来（写死 "progress" 会让进度条永远不动）'
)
eq(progressFromEngineLine('not json at all'), null, '非 JSON 行返回 null（引擎多打一行日志不能把宿主搞崩）')
eq(progressFromEngineLine(''), null, '空行返回 null')
eq(progressFromEngineLine('{"ok":true,"type":"progress","data":{"percent":999}}').percent, 100, 'percent 上限被夹住')
eq(progressFromEngineLine('{"ok":true,"type":"progress","data":{"percent":-5}}').percent, 0, 'percent 下限被夹住')

const parsed = parseEngineLine('{"ok":true,"result":{"a":1}}')
ok(parsed && parsed.ok === true && parsed.result.a === 1, '结果行解析正确')

// ---------- 3. 错误文案 ----------
section('错误文案')
const errLine = '{"ok":false,"error":{"kind":"protocol","message":"连接超时","retryable":true}}'
eq(
  engineErrorText(`noise\n${errLine}`, 4),
  '[protocol] 连接超时（可重试）',
  '从多行 stderr 里取最后一条错误行并带出 kind/retryable'
)
eq(
  engineErrorText('{"ok":false,"error":{"kind":"container","message":"认不出容器","retryable":false}}', 3),
  '[container] 认不出容器',
  '不可重试的错误不带后缀'
)
eq(engineErrorText('plain text failure', 5), 'plain text failure', '拿不到 JSON 时至少回显最后一行')
eq(engineErrorText('', 7), 'zuvrust exit 7', '什么都没有时回显退出码')
ok(lastEngineError(`x\n${errLine}\n`) && lastEngineError(`x\n${errLine}\n`).kind === 'protocol', 'lastEngineError 找得到错误行')
eq(lastEngineError('no json here'), null, '没有错误行时返回 null')

// ---------- 4. 退出码语义 ----------
section('退出码语义')
eq(ENGINE_EXIT.BAD_INPUT, 3, '3 = 输入不可用')
eq(ENGINE_EXIT.TRANSIENT, 4, '4 = 临时失败')
ok(engineExitRetryable(ENGINE_EXIT.TRANSIENT), '4 可重试')
ok(!engineExitRetryable(ENGINE_EXIT.BAD_INPUT), '3 不可重试（重试一个坏文件永远不会成功）')
ok(!engineExitRetryable(ENGINE_EXIT.INTERNAL), '5 不是"重试就能好"的失败')

// ---------- 5. 合并产物校验 ----------
section('合并产物校验')
const withBoth = { ok: true, result: { tracks: [{ kind: 0 }, { kind: 1 }] } }
ok(probeHasVideoAndAudio(withBoth), '视频(0) + 音频(1) 都齐才算合格')
ok(!probeHasVideoAndAudio({ ok: true, result: { tracks: [{ kind: 0 }] } }), '只有视频不合格')
ok(!probeHasVideoAndAudio({ ok: true, result: { tracks: [{ kind: 1 }] } }), '只有音频不合格')
ok(!probeHasVideoAndAudio({ ok: true, result: { tracks: [] } }), '没有轨道不合格')
ok(!probeHasVideoAndAudio(null), '解析失败（null）不合格，不许当成通过')
ok(!probeHasVideoAndAudio({ ok: false, error: {} }), '错误结果不合格')
ok(
  probeHasVideoAndAudio({ ok: true, result: { tracks: [{ kind: 0 }, { kind: 1 }, { kind: 2 }] } }),
  '字幕(2) 不影响判定'
)

// ---------- 6. 引擎真实契约（起进程） ----------
function findEngineBin () {
  const i = process.argv.indexOf('--bin')
  if (i !== -1 && process.argv[i + 1]) return path.resolve(process.argv[i + 1])
  const exe = process.platform === 'win32' ? 'zuvrust.exe' : 'zuvrust'
  const candidates = [
    path.join(PROJECT_ROOT, 'ZuvRust', 'target', 'debug', exe),
    path.join(PROJECT_ROOT, 'ZuvRust', 'target', 'release', exe)
  ]
  return candidates.find(p => existsSync(p)) || ''
}

const noCli = process.argv.includes('--no-cli')
const bin = noCli ? '' : findEngineBin()
if (!bin) {
  process.stdout.write('\n引擎契约：跳过（没找到 zuvrust 二进制，可用 --bin 指定）\n')
} else {
  section(`引擎真实契约（${bin}）`)
  const run = (args) => spawnSync(bin, args, { encoding: 'utf8', timeout: 30000, windowsHide: true })

  const version = run(['version', '--json'])
  eq(version.status, 0, 'version 退出码为 0')
  const vline = parseEngineLine((version.stdout || '').split('\n')[0])
  ok(vline && vline.ok === true, 'version 输出一行合法 JSON 且 ok=true')
  ok(
    vline && vline.result && Array.isArray(vline.result.containers) && vline.result.containers.includes('mpeg-ts'),
    'version 报告支持的容器（宿主据此决定界面按钮可点）'
  )
  ok(
    vline && vline.result && Array.isArray(vline.result.protocols) && vline.result.protocols.length > 0,
    'version 报告支持的协议'
  )

  const help = run(['--help'])
  eq(help.status, 0, '--help 退出码为 0（宿主探测能力时会先跑一次）')
  ok((help.stdout || '').includes('probe'), '--help 列出子命令')

  const unknown = run(['frobnicate', '--json'])
  eq(unknown.status, ENGINE_EXIT.USAGE, '未知子命令 → 退出码 2（用法错误，重试无用）')
  const unknownErr = lastEngineError(unknown.stderr)
  ok(unknownErr && unknownErr.kind === 'unsupported', '未知子命令的错误行带 kind=unsupported')
  ok(unknownErr && unknownErr.retryable === false, '未知子命令标记为不可重试')

  const missing = run(['probe', '/nonexistent/definitely-not-here.ts', '--json'])
  eq(missing.status, ENGINE_EXIT.BAD_INPUT, '探测不存在的文件 → 退出码 3（输入不可用）')
  const missingErr = lastEngineError(missing.stderr)
  ok(missingErr && missingErr.kind === 'io', '缺文件的错误行带 kind=io')
  ok(missingErr && missingErr.retryable === false, '缺文件不可重试（否则宿主会无限重试）')
  ok(
    (missing.stderr || '').trim().split('\n').every(l => !l.trim() || parseEngineLine(l) !== null),
    '错误输出整体是 NDJSON（宿主不必区分两种格式）'
  )

  const noArgs = run(['probe', '--json'])
  eq(noArgs.status, ENGINE_EXIT.USAGE, 'probe 缺参数 → 退出码 2')

  const muxMissing = run(['mux', '/tmp/lerxu-never.mp4', '/nonexistent/a.ts', '/nonexistent/b.ts', '--json'])
  ok(muxMissing.status !== 0, 'mux 输入不存在时失败（绝不静默产出坏文件）')
  ok(lastEngineError(muxMissing.stderr) !== null, 'mux 失败时给出一行可解析的错误 JSON')
}

// ---------- 汇总 ----------
process.stdout.write(`\n通过 ${passed} 项`)
if (failures.length) {
  process.stdout.write(`，失败 ${failures.length} 项：\n`)
  for (const f of failures) process.stdout.write(`  - ${f}\n`)
  process.exit(1)
}
process.stdout.write('，全部通过\n')
