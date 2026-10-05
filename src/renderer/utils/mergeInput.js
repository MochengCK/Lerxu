/**
 * 「合并的输入文件现在能不能用」里，与**任务列表**相关的那一半判据。
 *
 * 抽成纯函数的原因与 `taskPair.js` 一样：这里是"合并要不要继续等"的闸门，
 * 判错了在界面上只会表现为「迟迟不合并 / 等别的任务下完才一起合并」，
 * 完全看不出来源，除非把它拿出来单独跑。
 *
 * ## 唯一的判据是「**这条任务的落盘文件就是目标文件**」
 *
 * 这里曾经还带了第三个条件：`hasEngineControlFile(entry 的文件)`。
 * 它**与目标文件无关** —— 只要系统里还有**任意**一个进行中的任务
 * （它的文件带着引擎控制文件），本函数就对**任何**目标返回 true。
 *
 * 于是「同时下载多个媒体任务」时：先下完的那一对，它的两个输入文件
 * 在下完的那一刻控制文件已经消失，但只要**别的**任务还在下，
 * 这对记录就会被判成"输入还在下载"→ 合并被无限推迟 →
 * 一直等到所有下载都结束才一起合并。
 * （用户报的形态：多个媒体任务同时下，一个先下完却不合并，
 *  非要等另一个也下完才一同进行合并。）
 *
 * 目标文件自己有没有引擎控制文件，由调用方直接判（`isMergeInputReady`），
 * 不该在这里、通过**别人的**文件来回答。
 */

/**
 * 一条记录背后全部引擎任务的落盘文件。
 *
 * 「一对音视频」折叠记录只带**主成员**（画面流）的 `files`，另一半
 * （声音流）的路径必须从 `pairMembers[].files` 里取 —— 少这一层就会把
 * "正在下载的声音流"误判成"已下完"，拿半个文件去合并。
 */
export function collectEntryFilePaths (entry) {
  const acc = Array.isArray(entry && entry.files) ? entry.files.slice() : []
  const members = Array.isArray(entry && entry.pairMembers) ? entry.pairMembers : []
  for (const m of members) {
    if (m && Array.isArray(m.files)) acc.push(...m.files)
  }
  return acc
}

/**
 * 把落盘路径归一成"最终文件名"：带「下载中后缀」的去掉后缀，
 * 好让 `<最终名><后缀>` 与 `<最终名>` 对得上。
 */
export function normalizeDownloadedPath (raw, downloadingFileSuffix) {
  const abs = raw ? `${raw}` : ''
  if (!abs) return ''
  const suffix = downloadingFileSuffix ? `${downloadingFileSuffix}` : ''
  if (suffix && abs.endsWith(suffix)) return abs.slice(0, -suffix.length)
  return abs
}

/**
 * 目标文件是不是"某个**进行中**的任务正在写"的。
 *
 * @param {object} input
 * @param {string} input.target 目标文件（已归一的绝对路径）
 * @param {Array<object>} input.entries 任务记录（折叠记录也可以）
 * @param {Set<string>|Array<string>} input.pendingStatuses 「进行中」状态集合
 * @param {string} [input.downloadingFileSuffix] 用户配置的下载中后缀
 * @param {(p: string) => string} [input.resolvePath] 路径归一（默认原样返回）
 * @returns {boolean}
 */
export function isTargetWrittenByEntries (input = {}) {
  const target = input.target ? `${input.target}` : ''
  if (!target) return false

  const entries = Array.isArray(input.entries) ? input.entries : []
  const pending = input.pendingStatuses instanceof Set
    ? input.pendingStatuses
    : new Set((Array.isArray(input.pendingStatuses) ? input.pendingStatuses : []).map(s => `${s}`))
  const suffix = input.downloadingFileSuffix ? `${input.downloadingFileSuffix}` : ''
  const resolvePath = typeof input.resolvePath === 'function' ? input.resolvePath : (p) => p

  for (const entry of entries) {
    if (!entry) continue
    const status = entry.status ? `${entry.status}` : ''
    if (!pending.has(status)) continue

    for (const f of collectEntryFilePaths(entry)) {
      const raw = f && f.path ? `${f.path}` : ''
      if (!raw) continue
      const fp = normalizeDownloadedPath(resolvePath(raw), suffix)
      if (!fp) continue
      // 只认「这条任务的落盘文件就是目标文件」。
      // 老 aria2 约定下控制文件与下载文件同名，所以 `<目标>.xfer` 也算一次命中。
      if (fp === target || fp === `${target}.xfer`) return true
    }
  }

  return false
}
