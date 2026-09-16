#!/usr/bin/env node
/**
 * GitHub Actions 工作流校验
 * ==========================
 *
 * GitHub 对 `if:` 条件中可用的**上下文**有严格限制，用错会在保存/运行时直接报错
 * （如 `Unrecognized named-value: 'secrets'`），但本地 YAML 解析无法发现——YAML
 * 本身是合法的，是「表达式语义」不合法。本脚本补上这一层校验，把踩过的坑固化：
 *
 * 检查项：
 *  1. 工作流文件能被解析，且含 `on` 与 `jobs`；
 *  2. `if:` 条件中**不得引用 `secrets`**（GitHub 的上下文可用性表：steps.if 允许
 *     github / needs / strategy / matrix / job / runner / env / vars / steps / inputs，
 *     不含 secrets）——需要判断凭据时应改用 job 级 `env` 注入 + shell 判断；
 *  3. `if:` 条件中引用的上下文名必须属于允许集合（防止同类拼写/误用）；
 *  4. `uses:` 的 action 应带版本标签（避免隐式使用默认分支）；
 *  5. `${{ }}` 表达式内部引用的上下文名也必须属于该位置允许的集合（粗粒度：
 *     对 `if` 之外的表达式只检查上下文名是否在 GitHub 已知集合内）。
 *
 * 用法：node scripts/check-workflows.js
 */

'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const WF_DIR = path.join(ROOT, '.github', 'workflows')

/** GitHub 已知的上下文名（若出现集合外的名字，说明拼写错误或臆造） */
const KNOWN_CONTEXTS = [
  'github', 'env', 'vars', 'job', 'jobs', 'steps', 'runner', 'secrets',
  'strategy', 'matrix', 'needs', 'inputs'
]

/**
 * `if:` 条件中允许使用的上下文（GitHub 上下文可用性表）。
 * 特别注意：**不含 secrets** —— 这是本脚本存在的主要原因。
 */
const IF_ALLOWED_CONTEXTS = [
  'github', 'needs', 'strategy', 'matrix', 'job', 'runner',
  'env', 'vars', 'steps', 'inputs'
]

let errors = 0
let checks = 0

const fail = (file, msg) => {
  errors++
  console.error(`  ✗ ${file}: ${msg}`)
}

const ok = (msg) => {
  checks++
  console.log(`  ✓ ${msg}`)
}

/**
 * 提取文本中 `${{ ... }}` 表达式里的根上下文名。
 *
 * 注意 `-` 也必须排除：`needs.lint-and-typecheck.result` 里的
 * `typecheck.` 若被当作上下文名会产生误报（job id 用连字符命名是常态）。
 */
const contextsInRaw = (expr) => {
  const found = new Set()
  for (const c of expr.matchAll(/(^|[^\w.$-])([a-zA-Z_][a-zA-Z0-9_]*)\s*\./g)) {
    found.add(c[2])
  }
  return found
}

/**
 * 取一段文本中 `${{ ... }}` 表达式内出现的上下文名。
 *
 * 只解析 `${{ }}` 内部：`run:` 里的 shell / 内联 node 代码同样包含
 * `foo.bar` 形式（如 `fs.readFileSync`），全文扫描会把它们误判为上下文名。
 */
const contextsInExpr = (text) => {
  const found = new Set()
  for (const m of text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
    for (const c of contextsInRaw(m[1])) {
      found.add(c)
    }
  }
  return found
}

/**
 * 取 `if:` 条件里的上下文名。
 * 条件可能写成 `${{ ... }}`，也可能省略（裸表达式，如 `if: matrix.os == 'x'`），
 * 两种写法都要覆盖——裸写法只在 if 行成立，不能用于普通行。
 */
const contextsInIf = (cond) => (cond.includes('${{') ? contextsInExpr(cond) : contextsInRaw(cond))

/**
 * 遍历 YAML 文本中所有 `if:` 行（含 `if: ${{ ... }}` 与裸表达式两种写法）。
 * 返回 [{ line, text }]
 */
const collectIfLines = (text) => {
  const out = []
  text.split('\n').forEach((line, i) => {
    const m = /^\s*(?:-\s*)?if:\s*(.+?)\s*$/.exec(line)
    if (m) {
      out.push({ line: i + 1, text: m[1] })
    }
  })
  return out
}

const main = () => {
  console.log('GitHub Actions 工作流校验\n')

  if (!fs.existsSync(WF_DIR)) {
    console.error(`工作流目录不存在：${WF_DIR}`)
    process.exit(1)
  }

  const files = fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  if (files.length === 0) {
    console.error('未找到任何工作流文件')
    process.exit(1)
  }

  for (const file of files) {
    const full = path.join(WF_DIR, file)
    const text = fs.readFileSync(full, 'utf8')
    console.log(`${file}`)

    // 1) 结构检查
    if (!/^on:/m.test(text)) {
      fail(file, '缺少 `on:` 触发器声明')
    } else if (!/^jobs:/m.test(text)) {
      fail(file, '缺少 `jobs:` 声明')
    } else {
      ok('基本结构（on / jobs）存在')
    }

    // 2) if 条件中的上下文校验（核心：secrets 不可用）
    const ifLines = collectIfLines(text)
    let ifProblem = 0
    for (const { line, text: cond } of ifLines) {
      const ctxs = contextsInIf(cond)
      for (const c of ctxs) {
        if (!KNOWN_CONTEXTS.includes(c)) {
          fail(file, `第 ${line} 行 if 条件引用了未知上下文 "${c}"：${cond}`)
          ifProblem++
        } else if (!IF_ALLOWED_CONTEXTS.includes(c)) {
          fail(
            file,
            `第 ${line} 行 if 条件引用了此处不可用的上下文 "${c}"（GitHub 报 ` +
            `"Unrecognized named-value: '${c}'"）：${cond}\n` +
            `        → 需判断凭据时改用 job 级 env 注入 + shell 判断`
          )
          ifProblem++
        }
      }
    }
    if (ifProblem === 0) {
      ok(`if 条件上下文合法（${ifLines.length} 处）`)
    }

    // 3) 其它表达式中的上下文名必须属于已知集合
    let unknown = 0
    for (const [i, line] of text.split('\n').entries()) {
      if (/^\s*#/.test(line)) continue
      for (const c of contextsInExpr(line)) {
        if (!KNOWN_CONTEXTS.includes(c)) {
          fail(file, `第 ${i + 1} 行引用了未知上下文 "${c}"：${line.trim()}`)
          unknown++
        }
      }
    }
    if (unknown === 0) {
      ok('表达式中的上下文名均合法')
    }

    // 4) uses: 应带版本标签
    let unpinned = 0
    for (const [i, line] of text.split('\n').entries()) {
      const m = /uses:\s*([^\s#]+)/.exec(line)
      if (!m) continue
      const action = m[1]
      if (action.startsWith('./') || action.startsWith('docker://')) continue
      if (!/@/.test(action)) {
        fail(file, `第 ${i + 1} 行 uses 未固定版本：${action}`)
        unpinned++
      }
    }
    if (unpinned === 0) {
      ok('uses 均已固定版本标签')
    }
    console.log('')
  }

  console.log(`结果：${checks} 项通过，${errors} 项失败`)
  if (errors > 0) {
    process.exit(1)
  }
}

main()
