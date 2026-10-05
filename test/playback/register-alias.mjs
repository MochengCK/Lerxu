/**
 * 让纯 Node 的测试能 import 主进程模块。
 *
 * 主进程代码用 Vite 的别名 `@shared/xxx` 引入共享模块，而 Node 不认这个别名
 * （它只认相对路径、包名与 `#` 前缀的 imports）。这里注册一个最小的解析钩子
 * 把 `@shared/x` 映射到 `<项目根>/src/shared/x`。
 *
 * 为什么值得这么做：**播放通路的测试必须 import 真实模块**。如果把
 * `PlaybackSession` / `EnginePlayer` 复制一份到测试目录，测的就是一个副本，
 * 主进程改坏了测试也不会红 —— 那就白测了。
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./alias-hooks.mjs', pathToFileURL(import.meta.filename))
