/**
 * 解析钩子本体（供 `register-alias.mjs` 注册）：把 `@shared/xxx` 指到
 * `<项目根>/src/shared/xxx`。见 register-alias.mjs 的说明。
 */
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const SHARED_DIR = path.join(ROOT, 'src/shared')

export function resolve (specifier, context, nextResolve) {
  if (specifier.startsWith('@shared/')) {
    const rel = specifier.slice('@shared/'.length)
    const candidates = [rel, `${rel}.js`, path.join(rel, 'index.js')]
    for (const c of candidates) {
      const abs = path.join(SHARED_DIR, c)
      if (existsSync(abs)) {
        return nextResolve(pathToFileURL(abs).href, context)
      }
    }
  }
  return nextResolve(specifier, context)
}

/**
 * `.json` 当普通模块加载。
 *
 * 主进程/共享代码由 Vite 打包，`import channels from './playback-channels.json'`
 * 在打包器里天然可用；而 Node 的 ESM 要求必须写 `with { type: 'json' }`。
 * 这里补上打包器替我做的事，好处是**主进程代码不必为了可测而改写成 Node 的怪癖**。
 */
export function load (url, context, nextLoad) {
  if (url.endsWith('.json')) {
    const src = readFileSync(new URL(url), 'utf8')
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${src}\n`
    }
  }
  return nextLoad(url, context)
}
