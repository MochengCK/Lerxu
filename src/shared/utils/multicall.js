/**
 * multicall 结果的解析助手。
 *
 * 为什么单独成一个文件（而不是塞进 `utils/index.js`）：`index.js` 里有若干
 * **无扩展名的相对导入**（`./github-mirror` 之类），只有打包器认；这里的
 * `test/taskpair/run.mjs` 要用纯 Node 直接跑这个助手（它是"一对音视频折叠不成
 * 一条记录"的根因所在，必须能被钉住），所以让它保持零依赖、可独立加载。
 * `utils/index.js` 会把它转出，调用方照旧从 `@shared/utils` 引。
 */

/**
 * 合并 aria2 system.multicall 的结果（任务数组）。
 *
 * aria2 的 system.multicall 返回 [[[r1]], [[r2]], ...] 三层嵌套：外层是方法调用
 * 数组，每层内层 [rN] 是返回值包裹，最内层才是任务数组。仅 flat() 一层会把任务
 * 对象留在子数组里，导致 task.status/gid 全部取不到，因此需要摊平两层。
 *
 * 摊平两层同时兼容引擎原生协议（`XferRust.multicall` → JSON-RPC batch）的
 * 两层形状 `[[task...], [task...]]`：多摊一层不会有害。
 */
export const mergeTaskResult = (response = []) => {
  return response.flat(2)
}

/**
 * 从 multicall 结果里逐个取出**单值返回值**（`addUri` / `addTorrent` 的 gid）。
 *
 * 两族协议的形状不同，取法不能只写一种：
 *   · aria2 的 `system.multicall`：每条结果是**单元素数组** `[gid]`；
 *   · 引擎原生协议（`XferRust.multicall` → JSON-RPC batch，见
 *     `src/shared/xferrust/lib/XferRust.js`）：每条结果是**裸值** `gid`。
 *
 * 只按前者取 `r[0]` 的代价很隐蔽：原生协议下拿到的是 gid 的**第一个字符**
 * （`b3139806…` → `b`），于是"配对 id / 创建时间 / 来源标记"这些要写进任务历史的
 * 字段全挂在了一个不存在的 gid 上 —— 引擎侧真实任务永远查不到自己的配对信息，
 * 一对音视频既折叠不成一条记录、也合并不上（2026-10-02 定位）。
 */
export const unwrapMulticallValues = (response = []) => {
  const list = Array.isArray(response) ? response : [response]
  return list.map((item) => {
    if (Array.isArray(item)) {
      return item.length > 0 ? item[0] : undefined
    }
    if (item && typeof item === 'object' && item.gid !== undefined) {
      return item.gid
    }
    return item
  })
}
