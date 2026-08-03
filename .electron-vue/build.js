'use strict'

process.env.NODE_ENV = 'production'

const { say } = require('cfonts')
const chalk = require('chalk')
const del = require('del')
const Webpack = require('webpack')
const Multispinner = require('@motrix/multispinner')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const mainConfig = require('./webpack.main.config')
const rendererConfig = require('./webpack.renderer.config')
const webConfig = require('./webpack.web.config')

const doneLog = chalk.bgGreen.white(' DONE ') + ' '
const errorLog = chalk.bgRed.white(' ERROR ') + ' '
const okayLog = chalk.bgBlue.white(' OKAY ') + ' '
const isCI = process.env.CI || false

if (process.env.BUILD_TARGET === 'clean') {
  clean()
} else if (process.env.BUILD_TARGET === 'web') {
  web()
} else {
  buildWithParser()
}

function clean () {
  del.sync(['release/*', '!.gitkeep'])
  console.log(`\n${doneLog}\n`)
  process.exit()
}

function buildWithParser () {
  buildBilibiliParser().then(() => {
    build()
  }).catch(() => {
    build()
  })
}

function buildBilibiliParser () {
  return new Promise((resolve) => {
    const projectRoot = path.join(__dirname, '..')
    const outputName = process.platform === 'win32' ? 'bilibili_parser.exe' : 'bilibili_parser'
    const staticDir = path.join(projectRoot, 'static', 'parsers')
    const sourcePy = path.join(projectRoot, 'Python', 'parsers', 'bilibili_parser.py')
    const staticPy = path.join(staticDir, 'bilibili_parser.py')
    try {
      if (fs.existsSync(sourcePy)) {
        if (!fs.existsSync(staticDir)) {
          fs.mkdirSync(staticDir, { recursive: true })
        }
        fs.copyFileSync(sourcePy, staticPy)
      }
    } catch (_) {}
    const staticOutput = path.join(staticDir, outputName)
    if (fs.existsSync(staticOutput)) {
      resolve()
      return
    }
    const distOutput = path.join(projectRoot, 'dist', outputName)
    // Source parser script is optional in some environments.
    // If source and prebuilt outputs are both missing, skip silently.
    if (!fs.existsSync(sourcePy) && !fs.existsSync(distOutput)) {
      resolve()
      return
    }
    if (fs.existsSync(distOutput)) {
      if (!fs.existsSync(staticDir)) {
        fs.mkdirSync(staticDir, { recursive: true })
      }
      fs.copyFileSync(distOutput, staticOutput)
      resolve()
      return
    }
    const pythonCandidates = process.platform === 'win32'
      ? ['py', 'python', 'python3']
      : ['python3', 'python']
    let index = 0
    const next = () => {
      const cmd = pythonCandidates[index++]
      if (!cmd) {
        resolve()
        return
      }
      const args = [
        '-m',
        'PyInstaller',
        'Python/parsers/bilibili_parser.py',
        '--onefile',
        '--name',
        'bilibili_parser'
      ]
      const child = spawn(cmd, args, {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: false
      })
      child.on('error', () => {
        next()
      })
      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(distOutput)) {
          if (!fs.existsSync(staticDir)) {
            fs.mkdirSync(staticDir, { recursive: true })
          }
          fs.copyFileSync(distOutput, staticOutput)
          resolve()
        } else if (code === 0 && !fs.existsSync(distOutput)) {
          console.log('bilibili parser build finished but output not found, skipping')
          resolve()
        } else {
          next()
        }
      })
    }
    next()
  })
}

function build () {
  greeting()

  del.sync(['dist/electron/*', '!.gitkeep'])

  // Clean previous build output so stale files don't inflate the next
  // package size or cause inconsistent build artifacts.
  del.sync(['release/*', '!.gitkeep'])

  const tasks = ['main', 'renderer']
  const m = new Multispinner(tasks, {
    preText: 'building',
    postText: 'process'
  })

  let results = ''
  let completedTasks = 0

  const checkCompletion = () => {
    completedTasks++
    if (completedTasks === tasks.length) {
      process.stdout.write('\x1B[2J\x1B[0f')
      console.log(`\n\n${results}`)
      console.log(`${okayLog}take it away ${chalk.yellow('`electron-builder`')}\n`)
      
      // 验证输出文件是否存在
      const mainPath = path.join(__dirname, '../dist/electron/main.js')
      const rendererPath = path.join(__dirname, '../dist/electron/index.js') // renderer 输出为 index.js
      
      if (!fs.existsSync(mainPath)) {
        console.error(`${errorLog}main.js not found at ${mainPath}`)
        process.exit(1)
      }
      if (!fs.existsSync(rendererPath)) {
        console.error(`${errorLog}index.js not found at ${rendererPath}`)
        process.exit(1)
      }
      
      console.log(`${doneLog}Build files verified`)
      process.exit(0)
    }
  }

  pack(mainConfig).then(result => {
    results += result + '\n\n'
    m.success('main')
    checkCompletion()
  }).catch(err => {
    m.error('main')
    console.log(`\n  ${errorLog}failed to build main process`)
    console.error(`\n${err}\n`)
    process.exit(1)
  })

  pack(rendererConfig).then(result => {
    results += result + '\n\n'
    m.success('renderer')
    checkCompletion()
  }).catch(err => {
    m.error('renderer')
    console.log(`\n  ${errorLog}failed to build renderer process`)
    console.error(`\n${err}\n`)
    process.exit(1)
  })
}

function pack (config) {
  return new Promise((resolve, reject) => {
    config.mode = 'production'
    Webpack(config, (err, stats) => {
      if (err) {
        reject(err.stack || err)
      } else if (stats.hasErrors()) {
        let err = ''

        stats.toString({
          chunks: false,
          colors: true
        })
        .split(/\r?\n/)
        .forEach(line => {
          err += `    ${line}\n`
        })

        reject(err)
      } else {
        resolve(stats.toString({
          chunks: false,
          colors: true
        }))
      }
    })
  })
}

function web () {
  del.sync(['dist/web/*', '!.gitkeep'])
  webConfig.mode = 'production'
  Webpack(webConfig, (err, stats) => {
    if (err || stats.hasErrors()) console.log(err)

    console.log(stats.toString({
      chunks: false,
      colors: true
    }))

    process.exit()
  })
}

function greeting () {
  const cols = process.stdout.columns
  let text = ''

  if (cols > 85) {
    text = 'lets-build'
  } else if (cols > 60) {
    text = 'lets-|build'
  } else {
    text = false
  }

  if (text && !isCI) {
    say(text, {
      colors: ['magentaBright'],
      font: 'simple3d',
      space: false
    })
  } else console.log(chalk.magentaBright.bold('\n  lets-build'))
  console.log()
}
