#!/usr/bin/env node
/**
 * 浏览器扩展打包（Chromium / Firefox 双平台）
 * ==========================================
 *
 * 背景：扩展主体代码完全相同（统一使用 chrome.* 回调风格 + firefox-compat.js
 * 兼容层），两个平台的差异**只在 manifest**：
 *
 * | 差异点   | Chromium                                | Firefox                          |
 * | -------- | --------------------------------------- | -------------------------------- |
 * | 后台形态 | background.service_worker（单文件 SW）  | background.scripts（event page） |
 * | 专有权限 | 含 downloads.ui                         | 不含（Firefox 无此权限）         |
 * | 扩展 ID  | 不需要（商店分配）                      | MV3 必需 gecko.id                |
 *
 * 产物：
 *   dist/extension/chromium/                        解压可加载目录（manifest.json）
 *   dist/extension/firefox/                         解压可加载目录（manifest.json）
 *   dist/extension/artifacts/<name>.zip             AMO / 商店提交用
 *   dist/extension/artifacts/<name>.xpi             Firefox 本地安装 / 签名后分发
 *
 * 关键约束（AMO 提交报错的高频原因，已由本脚本保证并自检）：
 *   - **扩展文件必须位于归档根目录**（不能把源码目录整体压缩，否则报
 *     "No manifest.json was found at the root of the extension"）；
 *   - 归档内**不得含 macOS 元数据**（`__MACOSX/`、`._*`）与 `.DS_Store`
 *     （Finder 压缩会写入，AMO 会报 "Hidden file flagged"）；
 *   - **不得含开发用脚本**（如 icons/generate_icons.py，AMO 会报
 *     "Flagged file type found"）；
 *   - 含中日韩文文件名时必须设置 ZIP 的 UTF-8 标志，否则解压乱码。
 *
 * 用法：
 *   node scripts/build-extension.js                 # 构建两个平台并打包
 *   node scripts/build-extension.js --platform=firefox
 *   node scripts/build-extension.js --no-package    # 只生成解压目录
 */

'use strict'

const fs = require('fs')
const path = require('path')

const { createZip, listZipEntries, readZipEntry } = require('./lib/minizip')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'extensions', 'lerxu-webextension', 'lerxu-webextension')
const OUT_ROOT = path.join(ROOT, 'dist', 'extension')
const ARTIFACTS_DIR = path.join(OUT_ROOT, 'artifacts')

/** 需要复制到产物的文件（显式白名单，避免把仓库杂物带进包） */
const INCLUDE_FILES = [
  'background.js',
  'dash-sniffer.js',
  'diagnose.js',
  'download-interceptor.js',
  'firefox-compat.js',
  'i18n.js',
  'key-listener.js',
  'popup.html',
  'popup.js',
  'video-sniffer.js',
  // 离线安装指南（随包分发，供用户解压后查阅）
  'Installation-Guide-English.txt',
  '安装指南-中文.txt',
  'インストールガイド-日本語.txt',
  '설치-가이드-한국어.txt'
]
const INCLUDE_DIRS = ['_locales', 'icons']

/** 两个平台共用同一份源码，仅 manifest 文件名不同 */
const PLATFORMS = {
  chromium: { manifest: 'manifest.json', label: 'Chromium (Chrome / Edge / Opera)' },
  firefox: { manifest: 'manifest.firefox.json', label: 'Firefox' }
}

/** 归档中禁止出现的文件（macOS 元数据 / 开发脚本 / 编辑器残留） */
const FORBIDDEN_IN_ARCHIVE = [
  { test: (n) => n.startsWith('__MACOSX/'), reason: 'macOS 资源分叉目录' },
  { test: (n) => n.split('/').some((seg) => seg.startsWith('._')), reason: 'macOS 资源分叉文件' },
  { test: (n) => n.split('/').some((seg) => seg === '.DS_Store'), reason: 'macOS 目录元数据' },
  { test: (n) => n.endsWith('.py'), reason: '开发用脚本（AMO 视为可疑二进制/可执行内容）' },
  { test: (n) => n.endsWith('.map'), reason: '源码映射文件' }
]

/** 目录内需要跳过的开发用文件（图标生成脚本等不入包） */
const SKIP_FILES = new Set(['.DS_Store', 'generate_icons.py', 'generate_notification_icon.py'])

const copyFile = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP_FILES.has(entry.name)) continue
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) {
      copyDir(src, dst)
    } else {
      copyFile(src, dst)
    }
  }
}

/** 递归收集目录内所有文件（返回相对路径，`/` 分隔） */
const collectFiles = (dir, prefix = '') => {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_FILES.has(entry.name)) continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, rel))
    } else {
      out.push(rel)
    }
  }
  return out
}

/**
 * 生成平台解压目录。
 * @returns {{platform: string, outDir: string, manifest: object}}
 */
const buildPlatform = (platform) => {
  const spec = PLATFORMS[platform]
  if (!spec) throw new Error(`未知平台：${platform}`)
  const outDir = path.join(OUT_ROOT, platform)

  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  for (const file of INCLUDE_FILES) {
    const src = path.join(SRC_DIR, file)
    if (!fs.existsSync(src)) throw new Error(`源文件缺失：${file}`)
    copyFile(src, path.join(outDir, file))
  }
  for (const dir of INCLUDE_DIRS) {
    const src = path.join(SRC_DIR, dir)
    if (!fs.existsSync(src)) throw new Error(`源目录缺失：${dir}`)
    copyDir(src, path.join(outDir, dir))
  }

  const manifestSrc = path.join(SRC_DIR, spec.manifest)
  if (!fs.existsSync(manifestSrc)) throw new Error(`清单缺失：${spec.manifest}`)
  // 两个平台都必须落到 manifest.json（浏览器只认这个文件名）
  copyFile(manifestSrc, path.join(outDir, 'manifest.json'))

  return {
    platform,
    outDir,
    manifest: JSON.parse(fs.readFileSync(manifestSrc, 'utf8'))
  }
}

/**
 * 打包平台产物为 ZIP/XPI，并做 AMO 提交前自检。
 *
 * 自检项直接对应 AMO 的报错文案，避免"打包错目录/混入元数据"再次发生：
 * 归档根必须存在 manifest.json、不得含禁止文件、中文名条目必须带 UTF-8 标志。
 *
 * `outputDir` 默认为 `dist/extension/artifacts`；自动化测试传入临时目录，
 * 避免测试产物污染待提交的构建输出。
 *
 * @returns {{platform: string, files: string[], entryCount: number}}
 */
const packagePlatform = (platform, version, outputDir = ARTIFACTS_DIR) => {
  const spec = PLATFORMS[platform]
  const outDir = path.join(OUT_ROOT, platform)
  if (!fs.existsSync(path.join(outDir, 'manifest.json'))) {
    throw new Error(`${platform}: 未找到构建产物，请先执行构建`)
  }

  const relFiles = collectFiles(outDir).sort()
  const entries = relFiles.map((rel) => ({
    name: rel,
    data: fs.readFileSync(path.join(outDir, rel))
  }))

  const archive = createZip(entries)
  const list = listZipEntries(archive)

  // —— 自检 1：扩展文件必须位于归档根目录 ——
  if (!list.some((e) => e.name === 'manifest.json')) {
    throw new Error(
      `${platform}: 归档根目录缺少 manifest.json（AMO 会报 ` +
      '"No manifest.json was found at the root of the extension"）'
    )
  }

  // —— 自检 2：禁止文件 ——
  const violations = []
  for (const entry of list) {
    for (const rule of FORBIDDEN_IN_ARCHIVE) {
      if (rule.test(entry.name)) {
        violations.push(`${entry.name}（${rule.reason}）`)
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`${platform}: 归档含禁止文件：\n  - ${violations.join('\n  - ')}`)
  }

  // —— 自检 3：非 ASCII 文件名必须带 UTF-8 标志（否则解压乱码） ——
  const nonAscii = list.filter((e) => /[^\x20-\x7E]/.test(e.name))
  const missingUtf8Flag = nonAscii.filter((e) => !e.utf8)
  if (missingUtf8Flag.length > 0) {
    throw new Error(
      `${platform}: 以下条目的 UTF-8 标志缺失：${missingUtf8Flag.map((e) => e.name).join(', ')}`
    )
  }

  // —— 自检 4：归档内 manifest 必须是该平台的清单 ——
  const manifestInArchive = JSON.parse(readZipEntry(archive, 'manifest.json').toString('utf8'))
  if (platform === 'firefox') {
    if (!Array.isArray(manifestInArchive.background?.scripts) || manifestInArchive.background?.service_worker) {
      throw new Error('firefox: 归档内清单未使用 background.scripts（Firefox 不支持 service_worker）')
    }
    if (!manifestInArchive.browser_specific_settings?.gecko?.id) {
      throw new Error('firefox: 归档内清单缺少 browser_specific_settings.gecko.id')
    }
    if ((manifestInArchive.permissions || []).includes('downloads.ui')) {
      throw new Error('firefox: 归档内清单含 Chromium 专有权限 downloads.ui')
    }
  } else if (manifestInArchive.background?.service_worker !== 'background.js') {
    throw new Error('chromium: 归档内清单未使用 background.service_worker')
  }

  fs.mkdirSync(outputDir, { recursive: true })
  const base = `lerxu-webextension-${platform}-${version || manifestInArchive.version}`
  const written = []

  // .zip：商店 / AMO 提交的标准格式
  const zipPath = path.join(outputDir, `${base}.zip`)
  fs.writeFileSync(zipPath, archive)
  written.push(zipPath)

  // .xpi：Firefox 本地安装与签名分发（内容一致，仅扩展名不同）
  if (platform === 'firefox') {
    const xpiPath = path.join(outputDir, `${base}.xpi`)
    fs.writeFileSync(xpiPath, archive)
    written.push(xpiPath)
  }

  return { platform, files: written, entryCount: list.length, spec }
}

const build = (platform) => {
  const { outDir, manifest } = buildPlatform(platform)
  const spec = PLATFORMS[platform]
  console.log(`✓ ${spec.label}`)
  console.log(`    源清单：${spec.manifest} → manifest.json`)
  console.log(
    `    后台：${manifest.background.service_worker
      ? `service_worker=${manifest.background.service_worker}`
      : `scripts=${JSON.stringify(manifest.background.scripts)}`}`
  )
  console.log(`    目录：${path.relative(ROOT, outDir)}`)
  return { platform, outDir, manifest }
}

const main = () => {
  const platformArg = process.argv.find((a) => a.startsWith('--platform='))
  const requested = platformArg
    ? platformArg.slice('--platform='.length).split(',')
    : Object.keys(PLATFORMS)
  const skipPackage = process.argv.includes('--no-package')

  const unknown = requested.filter((p) => !PLATFORMS[p])
  if (unknown.length > 0) {
    console.error(`未知平台：${unknown.join(', ')}（可选：${Object.keys(PLATFORMS).join(' / ')}）`)
    process.exit(1)
  }
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`扩展源码目录不存在：${SRC_DIR}`)
    process.exit(1)
  }

  console.log(`扩展源码：${path.relative(ROOT, SRC_DIR)}\n`)
  const built = requested.map(build)

  if (!skipPackage) {
    console.log('\n打包：')
    for (const { platform, manifest } of built) {
      const r = packagePlatform(platform, manifest.version)
      console.log(`✓ ${PLATFORMS[platform].label} — ${r.entryCount} 个条目`)
      for (const f of r.files) {
        console.log(`    ${path.relative(ROOT, f)}  (${(fs.statSync(f).size / 1024).toFixed(1)} KB)`)
      }
    }
    console.log('\n提交提示：')
    console.log('  · AMO 提交使用 .zip（扩展文件位于归档根目录，已校验）')
    console.log('  · 本地安装 / 签名后分发使用 .xpi（about:debugging 载入解压目录亦可）')
  }

  console.log(`\n完成：产物位于 ${path.relative(ROOT, OUT_ROOT)}/`)
}

if (require.main === module) {
  main()
}

module.exports = {
  buildPlatform,
  packagePlatform,
  PLATFORMS,
  INCLUDE_FILES,
  INCLUDE_DIRS,
  OUT_ROOT,
  ARTIFACTS_DIR,
  SRC_DIR
}
