//  Forked from https://github.com/samuelmeuli/mini-diary/blob/master/scripts/after-pack.js

/**
 * Source: https://github.com/patrikx3/redis-ui/blob/master/src/build/after-pack.js
 *
 * Copyright (c) 2019 Patrik Laszlo / P3X / Corifeus and contributors.
 *
 * MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// TODO: Remove script once https://github.com/electron/electron/issues/17972 is solved by
// `electron-builder`

const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { join } = require('node:path')
const { chdir } = require('node:process')

const pkg = require('../package.json')
const binName = `${pkg.name}`.toLowerCase()

const copyDirRecursiveSync = (srcDir, destDir) => {
  if (!fs.existsSync(srcDir)) return
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const e of entries) {
    const src = join(srcDir, e.name)
    const dest = join(destDir, e.name)
    if (e.isDirectory()) {
      copyDirRecursiveSync(src, dest)
      continue
    }
    if (e.isFile()) {
      fs.copyFileSync(src, dest)
    }
  }
}


const exec = async function exec (cmd, args = []) {
  const child = spawn(cmd, args, { shell: true })
  redirectOutputFor(child)
  await waitFor(child)
}

const redirectOutputFor = child => {
  const printStdout = data => {
    process.stdout.write(data.toString())
  }
  const printStderr = data => {
    process.stderr.write(data.toString())
  }
  child.stdout.on('data', printStdout)
  child.stderr.on('data', printStderr)

  child.once('close', () => {
    child.stdout.off('data', printStdout)
    child.stderr.off('data', printStderr)
  })
}

const waitFor = async function (child) {
  return new Promise(resolve => {
    child.once('close', () => resolve())
  })
}

const linuxTargets = [
  'AppImage',
  'deb',
  'rpm',
  'snap'
]

// ---------------------------------------------------------------------------
// 引擎二进制：让"进了包且能用"成为打包的硬约束
// ---------------------------------------------------------------------------

/** 两个引擎都要在包里。名字按平台带后缀。 */
const engineNamesFor = (platform) =>
  platform === 'win32'
    ? ['xferrust.exe', 'zuvrust.exe']
    : ['xferrust', 'zuvrust']

/**
 * 引擎文件大小的下限，用来挡住"空壳/被截断的文件"。
 *
 * 实测最小的是 linux-arm64 的 zuvrust（约 4.1 MB），下限取 1 MB 有足够余量，
 * 同时又能挡住 0 字节、几 KB 的占位文件 —— 后者不会让任何东西报错，
 * 只会在运行到这步时给一个莫名其妙的 "Exec format error"。
 */
const MIN_ENGINE_BYTES = 1 << 20

/**
 * electron-builder 的 Arch 枚举（`builder-util/out/arch.js`）。
 * 这里写死数字而不是 require 它：那是 app-builder-lib 的传递依赖，直接引会很脆。
 */
const ARCH_NAME = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }

/**
 * 从二进制文件的头部读出它的架构：`'x64'` / `'arm64'`，认不出来返回 `null`。
 *
 * 三种格式各读一个字段（都在文件头几百字节内，不用加载整个文件）：
 *   · Mach-O 64：magic `0xFEEDFACF`，cputype 在偏移 4（0x01000007 / 0x0100000C）
 *   · ELF：`\x7fELF`，e_machine 在偏移 18（0x3E / 0xB7）
 *   · PE：`MZ`，PE 头偏移在 0x3C，machine 在 PE 头 +4（0x8664 / 0xAA64）
 *
 * 返回 `null` 的情形（胖二进制、脚本、认不出的格式）**不算失败** ——
 * 胖二进制在两种架构上都能跑，判成错误会误伤。
 */
const readBinaryArch = (file) => {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const head = Buffer.alloc(64)
    if (fs.readSync(fd, head, 0, 64, 0) < 20) return null

    if (head.readUInt32LE(0) === 0xfeedfacf) {
      const cputype = head.readUInt32LE(4)
      if (cputype === 0x01000007) return 'x64'
      if (cputype === 0x0100000c) return 'arm64'
      return null
    }
    if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
      const machine = head.readUInt16LE(18)
      if (machine === 0x3e) return 'x64'
      if (machine === 0xb7) return 'arm64'
      return null
    }
    if (head[0] === 0x4d && head[1] === 0x5a) {
      const peOffset = head.readUInt32LE(0x3c)
      const sig = Buffer.alloc(6)
      if (fs.readSync(fd, sig, 0, 6, peOffset + 4) < 6) return null
      const machine = sig.readUInt16LE(0)
      if (machine === 0x8664) return 'x64'
      if (machine === 0xaa64) return 'arm64'
      return null
    }
    return null
  } catch (_) {
    return null
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd) } catch (_) { /* 忽略 */ }
    }
  }
}

/** 打包产物里 `Resources` 的绝对路径（macOS 在 `.app` 里，另外两个平台直接一层）。 */
const resourceDirOf = (context) => {
  const { appOutDir, electronPlatformName, packager } = context
  if (electronPlatformName === 'darwin') {
    const appName = packager.appInfo.productFilename
    return join(appOutDir, `${appName}.app`, 'Contents', 'Resources')
  }
  return join(appOutDir, 'resources')
}

/**
 * 确认两个引擎**真的在包里，而且这个包里的引擎是能跑的**。
 *
 * ## 为什么必须在打包时失败，而不是等运行
 *
 * 漏引擎、装错架构，**构建都不会有任何提示**：应用照常打包成功，用户装完、
 * 点到"合并分片 / 边下边播"时才失败 —— 拿到的是一个"装好才发现坏"的包。
 * 引擎是按 `extra/<平台>/${arch}/` 回填的，so 少填一个目录、或者把 x64 的
 * 拷进 arm64 目录，全程静默。
 *
 * 2026-10-05 实测就是这么回事：`extra/{darwin/arm64,linux/x64,linux/arm64,win32/x64}/engine/`
 * 里**根本没有** `zuvrust`（只有 `darwin/x64` 有），**四个平台的包都会缺媒体引擎**，
 * 而打包全绿。所以这项检查不是"多余的保险"，是当时唯一能拦住它的东西。
 *
 * 检查四项，任何一项不过就抛错中断打包：
 *   ① 存在        ② 不是空壳/截断（≥ 1 MB）
 *   ③ 有可执行位（非 Windows）④ 架构与本包目标一致
 * 第 ④ 项尤其针对 macOS：一次构建同时出 x64 与 arm64 两个包，填错目录只会
 * 在其中一台上表现为 "Bad CPU type in executable"。
 */
const ensureEnginesUsable = (context) => {
  const platform = context.electronPlatformName
  const resourceDir = resourceDirOf(context)
  const engineDir = join(resourceDir, 'engine')
  const wantArch = ARCH_NAME[context.arch] || String(context.arch)
  const problems = []

  if (!fs.existsSync(engineDir)) {
    throw new Error(
      `[afterPack] 包里没有 engine 目录：${engineDir}\n` +
      '  说明 extraResources 没生效，或 extra/' + platform + '/<arch>/ 整个目录是空的。'
    )
  }

  // ① 先修：补上可执行位（下载来的产物常常是 644，electron-builder 照拷不误）。
  //    这一步是**修**不是**验** —— 所以下面还要再回头看它到底成没成。
  if (platform !== 'win32') {
    for (const name of engineNamesFor(platform)) {
      const file = join(engineDir, name)
      if (fs.existsSync(file)) {
        try { fs.chmodSync(file, 0o755) } catch (_) { /* 下面会报出来 */ }
      }
    }
  }

  // ② 再验：四项都过才允许出包。
  for (const name of engineNamesFor(platform)) {
    const file = join(engineDir, name)

    if (!fs.existsSync(file)) {
      const sibling = fs.existsSync(engineDir)
        ? fs.readdirSync(engineDir).join(', ') || '(空目录)'
        : '(目录不存在)'
      problems.push(`${name}：**不存在**（engine/ 里现有：${sibling}）`)
      continue
    }

    const st = fs.statSync(file)
    if (st.size < MIN_ENGINE_BYTES) {
      problems.push(
        `${name}：只有 ${st.size} 字节（下限 ${MIN_ENGINE_BYTES}）——` +
        '像是空壳或被截断的产物'
      )
    }

    // 非 Windows 必须可执行。上面刚 chmod 过，所以这里是在验"修补真的生效了"
    // （只读介质、从挂载的镜像里打包等情况下会失败）。Windows 上 Node 报的
    // mode 位是合成的，判它没意义。
    if (platform !== 'win32' && (st.mode & 0o111) === 0) {
      problems.push(`${name}：补过可执行位仍然不可执行（mode ${(st.mode & 0o777).toString(8)}）`)
    }

    const gotArch = readBinaryArch(file)
    // 胖二进制（universal）在两种架构上都跑得起来 ⇒ 读不出具体架构时不判错。
    if (gotArch && wantArch !== 'universal' && gotArch !== wantArch) {
      problems.push(
        `${name}：架构是 ${gotArch}，但本包是 ${wantArch} —— ` +
        `这就是"装错目录"，在这一台上会报 Bad CPU type / Exec format error`
      )
    }
  }

  if (problems.length) {
    throw new Error(
      '[afterPack] 包里的引擎不可用，已中断打包：\n  · ' + problems.join('\n  · ') +
      '\n  这份引擎来自 extra/' + platform + '/<arch>/engine/。' +
      '\n  把对应平台的产物补进去（或换掉错的架构）再重新打包。'
    )
  }

  console.log(`[afterPackHook] 引擎就绪（${wantArch}）：${engineNamesFor(platform).join(', ')}`)
}

module.exports = async function (context) {
  console.warn('after build; disable sandbox')
  const originalDir = process.cwd()
  const dirname = context.appOutDir
  chdir(dirname)

  // 应用支持的语言列表
  const supportedLocales = [
    'de', 'en-US', 'es', 'fr', 'it', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW'
  ]

  // 删除不需要的 Electron 语言文件
  const localesDir = join(dirname, 'locales')
  if (fs.existsSync(localesDir)) {
    const localeFiles = fs.readdirSync(localesDir)
    let removedCount = 0
    let savedSize = 0
    localeFiles.forEach(file => {
      const localeName = file.replace('.pak', '')
      if (!supportedLocales.includes(localeName)) {
        const filePath = join(localesDir, file)
        try {
          const stat = fs.statSync(filePath)
          savedSize += stat.size
          fs.unlinkSync(filePath)
          removedCount++
        } catch (e) {}
      }
    })
    console.log(`[afterPackHook] Removed ${removedCount} unused locale files, saved ${(savedSize / 1024 / 1024).toFixed(2)} MB`)
  }

  // ffmpeg 不再预先打包，改为运行时按需下载

  if (context.electronPlatformName === 'linux') {
    const wrapperPath = join(dirname, binName)
    const realBinPath = join(dirname, `${binName}.bin`)

    if (fs.existsSync(wrapperPath) && !fs.existsSync(realBinPath)) {
      fs.renameSync(wrapperPath, realBinPath)
    }
    const wrapperScript = `#!/usr/bin/env bash
SOURCE="${'${BASH_SOURCE[0]}'}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
export LD_LIBRARY_PATH="$DIR/resources/engine/lib:$DIR/resources/lib:\${LD_LIBRARY_PATH:-}"
"$DIR"/${binName}.bin --no-sandbox "$@"
`
    fs.writeFileSync(wrapperPath, wrapperScript)
    try {
      fs.chmodSync(wrapperPath, 0o755)
    } catch (e) {}
  }

  // 引擎校验放在最后：上面每一步都跑完了，再判断这个包能不能发。
  // 放在这里也覆盖了三个平台（原先只有 Linux 会碰引擎，另外两个平台连
  // "引擎在不在"都没人看）。
  ensureEnginesUsable(context)

  chdir(originalDir)
}

// 暴露内部函数给单测用（打包流程不使用）—— 这些检查本身也要被验证，
// 否则它们只是装饰。见 `test/packaging/run.mjs`。
module.exports._test = {
  readBinaryArch,
  engineNamesFor,
  resourceDirOf,
  ensureEnginesUsable,
  ARCH_NAME,
  MIN_ENGINE_BYTES
}
