import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { resolve } from 'node:path'
import { cpSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

/* 主进程直接 file:// 加载的独立 HTML 页面与多语言文件不经打包器处理，
   每次构建/启动 dev 时同步到 dist/electron（与主进程产物同目录），
   供 page.js 以 path.join(__dirname, 'pages/...') 解析加载。
   ip2region xdb 原始体积约 47MB 且高度可压缩，以 gzip 落盘可减至约 11MB，
   运行时由 shared/utils/ip2region.js 透明解压 */
const copyMainAssets = () => ({
  name: 'copy-main-assets',
  buildStart () {
    const outDir = resolve('dist/electron')
    cpSync(resolve('src/main/pages'), resolve(outDir, 'pages'), { recursive: true })
    cpSync(resolve('src/shared/locales'), resolve(outDir, 'shared/locales'), { recursive: true })
    const dataSrcDir = resolve('src/shared/data')
    const dataOutDir = resolve(outDir, 'shared/data')
    mkdirSync(dataOutDir, { recursive: true })
    // 直接覆盖同名 .gz（临时文件 + rename 原子替换），不在构建期清空目录：
    // 运行中的应用（生产模式读 dist/electron）需要随时能读到 ip2region 数据，
    // 先清空再写入会让它在构建期间取不到数据。
    const expected = new Set()
    for (const file of readdirSync(dataSrcDir)) {
      if (!file.endsWith('.xdb')) continue
      const outName = `${file}.gz`
      expected.add(outName)
      const target = resolve(dataOutDir, outName)
      const tmp = `${target}.tmp`
      writeFileSync(tmp, gzipSync(readFileSync(resolve(dataSrcDir, file)), { level: 9 }))
      renameSync(tmp, target)
    }
    // 写入完成后清理遗留（含历史版本的明文 .xdb 残留）
    for (const file of readdirSync(dataOutDir)) {
      if (!expected.has(file)) {
        rmSync(resolve(dataOutDir, file), { force: true })
      }
    }
  }
})

/* 渲染层产物（带内容哈希）与主进程产物共用 dist/electron，emptyOutDir 必须为 false
   以免误删主进程文件；因此需要单独清理上一次构建遗留的哈希文件，避免无限累积。

   注意：清理必须发生在**构建完成之后**，不能在 buildStart 就删除——
   Electron 生产模式直接读取 dist/electron（index.html + assets/*.js|css），
   若构建一开始就清空 assets，正在运行的应用（以及构建期间刷新的页面）会持续
   报 `Failed to load resource: net::ERR_FILE_NOT_FOUND`，直到新产物写完。
   实测：原先的 buildStart 清空会让 assets 在约 50 秒内始终为 0 个文件。

   判定方式：本次生成/覆盖的文件 mtime ≥ 构建开始时刻，只删除更早的文件，
   因此既不会误删本次产物，也能清掉上一轮的遗留（含已不再生成的旧 chunk）。 */
const cleanRendererOutput = () => {
  const outDir = resolve('dist/electron')
  const assetsDir = resolve(outDir, 'assets')
  // 上一代构建时间戳：用于「保留最近两代」的清理判定
  const stampFile = resolve(outDir, '.last-build.json')
  let startedAt = 0
  let previousBuildAt = 0
  return {
    name: 'clean-renderer-output',
    apply: 'build',
    buildStart () {
      // 仅记录起始时刻，不做删除：构建期间保持既有产物可用
      if (!startedAt) startedAt = Date.now()
    },
    closeBundle () {
      if (!startedAt) return

      try {
        previousBuildAt = JSON.parse(readFileSync(stampFile, 'utf8')).startedAt || 0
      } catch {
        previousBuildAt = 0
      }

      let entries = []
      try {
        entries = readdirSync(assetsDir)
      } catch {
        return
      }

      // 只清理「比上一代还旧」的产物，保留当前代 + 上一代。
      // 原因：渲染层的 CSS/JS 是懒加载的（如偏好设置的 PreferenceDialog-*.css
      // 在打开弹窗时才请求）。若构建后立刻删掉上一代，正在运行的应用去加载
      // 旧 chunk 就会 404，表现为「某个界面没有样式」。
      // 保留一代的成本约为几 MB，远低于把界面搞坏。
      let removed = 0
      for (const file of entries) {
        const target = resolve(assetsDir, file)
        try {
          if (statSync(target).mtimeMs < previousBuildAt) {
            rmSync(target, { force: true })
            removed++
          }
        } catch {
          // 单文件清理失败不影响构建
        }
      }
      if (removed > 0) {
        console.log(`    cleaned ${removed} stale renderer asset(s); kept current + previous generation`)
      }

      try {
        writeFileSync(stampFile, JSON.stringify({ startedAt, at: new Date().toISOString() }, null, 2))
      } catch {
        // 时间戳写入失败只影响下一次清理的精度，不影响构建
      }
    }
  }
}

export default defineConfig(({ command }) => {
  const isServe = command === 'serve'

  return {
    root: resolve('src/renderer'),
    // 把工作区 static/ 作为公共资源目录：构建时拷贝到 dist/electron/，
    // 与主进程 global.__static（打包后 = __dirname）的引用路径对齐
    publicDir: resolve('static'),
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    },
    plugins: [
      vue(),
      copyMainAssets(),
      cleanRendererOutput(),
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia'],
        resolvers: [ElementPlusResolver()],
        dts: false
      }),
      Components({
        resolvers: [ElementPlusResolver({ importStyle: 'css' })],
        dts: false
      }),
      electron([
        {
          entry: resolve('src/main/index.js'),
          vite: {
            resolve: {
              alias: {
                '@': resolve('src/renderer'),
                '@shared': resolve('src/shared')
              }
            },
            build: {
              outDir: resolve('dist/electron'),
              rollupOptions: {
                external: ['electron', ...Object.keys(require('./package.json').dependencies)]
              }
            }
          },
          onstart(args) {
            if (isServe) {
              // 宿主终端的语言 shim 会向 node 进程注入 ELECTRON_RUN_AS_NODE=1
              // 与 NODE_OPTIONS（--require shim），二者被 Electron 子进程继承后
              // 会使 electron.exe 降级为纯 Node 模式运行（require('electron')
              // 落盘解析，主进程抛 "Cannot read properties of undefined
              // (reading 'getVersion')"）。启动 Electron 前必须剥除这些变量。
              const {
                ELECTRON_RUN_AS_NODE: _ern,
                NODE_OPTIONS: _no,
                ...electronEnv
              } = process.env
              args.startup(['.', '--no-sandbox'], { env: electronEnv })
            }
          }
        },
        {
          entry: resolve('src/renderer/workers/tray.worker.js'),
          vite: {
            resolve: {
              alias: {
                '@': resolve('src/renderer'),
                '@shared': resolve('src/shared')
              }
            }
          },
          onstart(args) {
            args.reload()
          }
        },
        {
          entry: resolve('src/renderer/workers/dock.worker.js'),
          vite: {
            resolve: {
              alias: {
                '@': resolve('src/renderer'),
                '@shared': resolve('src/shared')
              }
            }
          },
          onstart(args) {
            args.reload()
          }
        }
      ]),
      renderer()
    ],
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@import "${resolve('src/renderer/components/Theme/Variables.scss').replace(/\\/g, '/')}";`,
          // 静音主题变量文件的大量 Sass 弃用告警（@import / mix() 全局函数 /
          // legacy JS API），待主题系统迁移到 @use 后可移除
          silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions']
        }
      }
    },
    build: {
      outDir: resolve('dist/electron'),
      emptyOutDir: false,
      rollupOptions: {
        // 单页构建：index.html 为主窗口完整 SPA。
        // 偏好设置已内嵌在主窗口 SPA 中（/preference 路由），
        // 不再单独构建 preference.html 轻量 bundle。
        input: {
          index: resolve('src/renderer/index.html')
        }
      },
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      }
    },
    server: {
      port: 9080
    }
  }
})
