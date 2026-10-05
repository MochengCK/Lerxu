#!/usr/bin/env node
/**
 * 打包链路的引擎检查（纯 Node，零依赖）
 * ==================================
 *
 * 这里验的是**"打完的包里有能用的引擎"**这件事本身 —— 而不是应用功能。
 *
 * 为什么值得单独测：**漏引擎不会让构建报错**。应用照常打包成功，用户装上、
 * 点到"合并分片 / 边下边播"时才失败。2026-10-05 实际发生过：
 * `extra/{darwin/arm64,linux/x64,linux/arm64,win32/x64}/engine/` 里根本没有
 * `zuvrust`（只有 darwin/x64 有），**四个平台的包都会缺媒体引擎**，而打包全绿。
 *
 * 覆盖两层：
 *
 *  ① **输入**：`extra/<平台>/<架构>/engine/` 里两个引擎都得在，且架构对得上
 *     —— 这是上面那个真实故障的直接判据。
 *  ② **产物**：`afterPackHook` 的 `ensureEnginesUsable` 对打好的包做的四项检查
 *     （存在 / 不是空壳 / 可执行 / 架构一致），逐项用**伪造的坏包**验证它真的会拦。
 *     否则这些检查只是装饰 —— 它们"不报错"和"检查对了"看起来一模一样。
 *
 * 用法：node test/packaging/run.mjs
 * 退出码：0 = 全部通过；1 = 任一失败。
 */

import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')
const require = createRequire(import.meta.url)

const hook = require('../../build/afterPackHook.js')
const {
  readBinaryArch,
  engineNamesFor,
  resourceDirOf,
  ensureEnginesUsable,
  ARCH_NAME,
  MIN_ENGINE_BYTES
} = hook._test

// ---------- 极简断言 ----------
let passed = 0
const failures = []
const ok = (cond, label, detail = '') => {
  if (cond) {
    passed++
    return true
  }
  failures.push(detail ? `${label} —— ${detail}` : label)
  return false
}

const throws = (fn, label) => {
  try {
    fn()
  } catch (e) {
    passed++
    return String(e.message || e)
  }
  failures.push(`${label} —— 本该抛错中断打包，却安静地过了`)
  return ''
}

// 宿主真正会打包的 5 组（平台 × 架构）。arch 数字见 electron-builder 的 Arch 枚举。
const TARGETS = [
  { platform: 'darwin', arch: 'x64', archNum: 1, dir: 'darwin/x64' },
  { platform: 'darwin', arch: 'arm64', archNum: 3, dir: 'darwin/arm64' },
  { platform: 'linux', arch: 'x64', archNum: 1, dir: 'linux/x64' },
  { platform: 'linux', arch: 'arm64', archNum: 3, dir: 'linux/arm64' },
  { platform: 'win32', arch: 'x64', archNum: 1, dir: 'win32/x64' }
]

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lerxu-packaging-'))
process.on('exit', () => {
  try { fs.rmSync(workDir, { recursive: true, force: true }) } catch (_) { /* 忽略 */ }
})

// ---------------------------------------------------------------------------
// 1. 架构识别（整条检查都建立在它之上，先单独钉死）
// ---------------------------------------------------------------------------

ok(readBinaryArch(path.join(PROJECT_ROOT, 'electron-builder.json')) === null,
  '非二进制文件读不出架构（返回 null 而不是乱猜）')

ok(ARCH_NAME[1] === 'x64' && ARCH_NAME[3] === 'arm64',
  'Arch 枚举数字映射正确（1=x64, 3=arm64）',
  `实际 ${ARCH_NAME[1]} / ${ARCH_NAME[3]}`)

// ---------------------------------------------------------------------------
// 2. 输入：extra/<平台>/<架构>/engine/ 里两个引擎都在且架构正确
//    —— 这是"四个平台的包会缺媒体引擎"那个真实故障的直接判据
// ---------------------------------------------------------------------------

for (const t of TARGETS) {
  const engineDir = path.join(PROJECT_ROOT, 'extra', t.dir, 'engine')

  for (const name of engineNamesFor(t.platform)) {
    const file = path.join(engineDir, name)
    if (!ok(fs.existsSync(file), `输入 extra/${t.dir}/engine/${name} 存在`,
      '**这个平台的包会缺引擎**')) {
      continue
    }
    const st = fs.statSync(file)
    ok(st.size >= MIN_ENGINE_BYTES,
      `输入 extra/${t.dir}/engine/${name} 不是空壳`,
      `${st.size} 字节`)
    const got = readBinaryArch(file)
    ok(got === t.arch,
      `输入 extra/${t.dir}/engine/${name} 架构是 ${t.arch}`,
      `实际读到 ${got}`)
  }
}

// ---------------------------------------------------------------------------
// 3. 产物：伪造各种坏包，验证 ensureEnginesUsable 真的会拦
// ---------------------------------------------------------------------------

/** 造一个假的应用输出目录，并把指定平台的引擎拷进它的 Resources/engine。 */
const makeApp = ({ platform, archNum, srcDir, omit = [], corrupt = null }) => {
  const appOutDir = fs.mkdtempSync(path.join(workDir, 'app-'))
  const resources = resourceDirOf({
    appOutDir,
    electronPlatformName: platform,
    packager: { appInfo: { productFilename: 'Lerxu' } }
  })
  const engineDir = path.join(resources, 'engine')
  fs.mkdirSync(engineDir, { recursive: true })

  const srcEngine = path.join(PROJECT_ROOT, 'extra', srcDir, 'engine')
  for (const name of engineNamesFor(platform)) {
    if (omit.includes(name)) continue
    const dest = path.join(engineDir, name)
    fs.copyFileSync(path.join(srcEngine, name), dest)
    fs.chmodSync(dest, 0o755)
  }

  if (corrupt) corrupt(engineDir)

  return {
    ctx: { electronPlatformName: platform, appOutDir, arch: archNum, packager: { appInfo: { productFilename: 'Lerxu' } } },
    engineDir
  }
}

const darwinX64 = { platform: 'darwin', archNum: 1, srcDir: 'darwin/x64' }

// ③-1 正常包：必须过
{
  const { ctx } = makeApp(darwinX64)
  let err = null
  try { ensureEnginesUsable(ctx) } catch (e) { err = e }
  ok(err === null, '正常包通过检查', err ? String(err.message) : '')
}

// ③-2 可执行位丢了（下载来的产物常见）：应当**修好**并仍然通过
{
  const { ctx, engineDir } = makeApp(darwinX64)
  const zuv = path.join(engineDir, 'zuvrust')
  // 先确认它在 —— 否则下面 chmod 会 ENOENT 崩掉测试自己（突变验证时崩过两次）。
  // 测试崩掉是最差的失败方式：它把后面所有断言一起吞了。
  if (ok(fs.existsSync(zuv), '可执行位用例的前提：zuvrust 已拷进包里')) {
    fs.chmodSync(zuv, 0o644)
    let err = null
    try { ensureEnginesUsable(ctx) } catch (e) { err = e }
    const mode = fs.statSync(zuv).mode & 0o111
    ok(err === null && mode !== 0,
      '可执行位丢失会被自动补上（不是报错了事）',
      `err=${err && err.message} mode=${mode.toString(8)}`)
  }
}

// ③-3 缺引擎（就是这次真实发生的故障）：必须拦
{
  const { ctx } = makeApp({ ...darwinX64, omit: ['zuvrust'] })
  const msg = throws(() => ensureEnginesUsable(ctx), '缺 zuvrust 的包被拦下')
  ok(msg.includes('zuvrust') && msg.includes('不存在'),
    '缺引擎的报错要点名是哪个引擎',
    msg.slice(0, 200))
}

// ③-4 架构装错（把 arm64 的拷进 x64 包）：必须拦
{
  const { ctx } = makeApp({
    ...darwinX64,
    corrupt: (engineDir) => {
      fs.copyFileSync(
        path.join(PROJECT_ROOT, 'extra/darwin/arm64/engine/zuvrust'),
        path.join(engineDir, 'zuvrust')
      )
    }
  })
  const msg = throws(() => ensureEnginesUsable(ctx), '架构装错的包被拦下')
  ok(msg.includes('架构') && msg.includes('arm64'),
    '架构装错的报错要说清是哪种不符',
    msg.slice(0, 200))
}

// ③-5 空壳/被截断的文件：必须拦
{
  const { ctx } = makeApp({
    ...darwinX64,
    corrupt: (engineDir) => {
      // writeFileSync 而不是 truncateSync：文件不存在时前者会创建、
      // 后者会 ENOENT 直接崩掉测试（突变验证时真崩过一次）。
      fs.writeFileSync(path.join(engineDir, 'zuvrust'), Buffer.alloc(1024))
    }
  })
  const msg = throws(() => ensureEnginesUsable(ctx), '被截断的引擎被拦下')
  ok(msg.includes('字节'), '截断的报错要给出字节数', msg.slice(0, 200))
}

// ③-6 engine 目录整个不在：必须拦
{
  const appOutDir = fs.mkdtempSync(path.join(workDir, 'app-empty-'))
  const ctx = { electronPlatformName: 'linux', appOutDir, arch: 1, packager: { appInfo: { productFilename: 'Lerxu' } } }
  const msg = throws(() => ensureEnginesUsable(ctx), '没有 engine 目录的包被拦下')
  ok(msg.includes('engine 目录'), '缺目录的报错要指明目录', msg.slice(0, 200))
}

// ③-7 Windows：名字要带 .exe，且不因缺可执行位而误判
{
  const { ctx, engineDir } = makeApp({ platform: 'win32', archNum: 1, srcDir: 'win32/x64' })
  const names = fs.readdirSync(engineDir)
  ok(names.every((n) => n.endsWith('.exe')),
    'Windows 包里用的是 .exe 名字', names.join(', '))
  let err = null
  try { ensureEnginesUsable(ctx) } catch (e) { err = e }
  ok(err === null, 'Windows 包通过检查（不对 mode 位做判断）', err ? String(err.message) : '')
}

// ---------- 汇总 ----------
process.stdout.write(`\n通过 ${passed} 项`)
if (failures.length) {
  process.stdout.write(`，失败 ${failures.length} 项：\n`)
  for (const f of failures) process.stdout.write(`  - ${f}\n`)
  process.exit(1)
}
process.stdout.write('，全部通过\n')
