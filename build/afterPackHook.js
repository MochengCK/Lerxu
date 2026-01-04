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

  const resourcesDir = join(dirname, 'resources')
  const srcParsersDir = join(__dirname, '..', 'static', 'parsers')
  const destParsersDir = join(resourcesDir, 'parsers')
  
  // 复制 parsers 目录，但排除 .py 文件（因为已经有编译好的可执行文件）
  if (fs.existsSync(srcParsersDir)) {
    if (!fs.existsSync(destParsersDir)) {
      fs.mkdirSync(destParsersDir, { recursive: true })
    }
    const entries = fs.readdirSync(srcParsersDir, { withFileTypes: true })
    for (const e of entries) {
      // 跳过 .py 文件
      if (e.isFile() && e.name.endsWith('.py')) {
        console.log(`[afterPackHook] Skipped Python file: ${e.name}`)
        continue
      }
      const src = join(srcParsersDir, e.name)
      const dest = join(destParsersDir, e.name)
      if (e.isDirectory()) {
        copyDirRecursiveSync(src, dest)
      } else if (e.isFile()) {
        fs.copyFileSync(src, dest)
      }
    }
  }

  const srcFfmpegDir = join(__dirname, '..', 'ffmpeg-8.0.1-essentials_build')
  const destFfmpegDir = join(resourcesDir, 'ffmpeg-8.0.1-essentials_build')
  try {
    if (fs.existsSync(srcFfmpegDir)) {
      // 只复制 ffmpeg 可执行文件，不复制 ffprobe、ffplay 等其他文件
      const ffmpegExeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
      
      // 查找 ffmpeg 可执行文件的位置
      let srcBin = null
      const possiblePaths = [
        join(srcFfmpegDir, 'bin', ffmpegExeName),
        join(srcFfmpegDir, ffmpegExeName)
      ]
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          srcBin = p
          break
        }
      }
      
      if (srcBin) {
        // 创建目标目录
        const destBinDir = join(destFfmpegDir, 'bin')
        if (!fs.existsSync(destBinDir)) {
          fs.mkdirSync(destBinDir, { recursive: true })
        }
        
        // 只复制 ffmpeg 可执行文件到 bin 目录（只保留一份）
        const destBinPath = join(destBinDir, ffmpegExeName)
        fs.copyFileSync(srcBin, destBinPath)
        
        console.log(`[afterPackHook] Copied ffmpeg: ${srcBin} -> ${destBinPath}`)
      } else {
        console.warn('[afterPackHook] ffmpeg executable not found in:', srcFfmpegDir)
      }
    }
  } catch (e) {
    console.error('[afterPackHook] Error copying ffmpeg:', e.message)
  }

  if (context.electronPlatformName !== 'linux') {
    chdir(originalDir)
    return
  }

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
"$DIR"/${binName}.bin --no-sandbox "$@"
`
  fs.writeFileSync(wrapperPath, wrapperScript)
  try {
    fs.chmodSync(wrapperPath, 0o755)
  } catch (e) {}

  const engineDir = join(dirname, 'resources', 'engine')
  if (fs.existsSync(engineDir)) {
    const files = fs.readdirSync(engineDir)
    files.forEach((file) => {
      if (file.startsWith('aria2c')) {
        const target = join(engineDir, file)
        try {
          fs.chmodSync(target, 0o755)
        } catch (e) {}
      }
    })
  }

  chdir(originalDir)
}
