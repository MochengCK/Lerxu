import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { resolve } from 'node:path'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    const dataOutDir = resolve(outDir, 'shared/data')
    // 先清空再写入，避免历史版本的明文 .xdb 残留在构建产物中
    rmSync(dataOutDir, { recursive: true, force: true })
    mkdirSync(dataOutDir, { recursive: true })
    for (const file of readdirSync(resolve('src/shared/data'))) {
      if (!file.endsWith('.xdb')) continue
      writeFileSync(
        resolve(dataOutDir, `${file}.gz`),
        gzipSync(readFileSync(resolve('src/shared/data', file)), { level: 9 })
      )
    }
  }
})

/* 渲染层产物（带内容哈希）与主进程产物共用 dist/electron，emptyOutDir 必须为 false
   以免误删主进程文件；因此构建前单独清空 assets/，避免多次构建的哈希文件无限累积 */
const cleanRendererOutput = () => ({
  name: 'clean-renderer-output',
  apply: 'build',
  buildStart () {
    rmSync(resolve('dist/electron/assets'), { recursive: true, force: true })
  }
})

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
              args.startup()
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
        // 多页构建：index.html 为主窗口完整 SPA；
        // preference.html 为偏好设置独立轻量 bundle（入口 pages/preference/main.js），
        // 窗口关闭即销毁的场景下重开仍能快速加载。
        input: {
          index: resolve('src/renderer/index.html'),
          preference: resolve('src/renderer/preference.html')
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
