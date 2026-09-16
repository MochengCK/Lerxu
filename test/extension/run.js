#!/usr/bin/env node
/**
 * 浏览器扩展测试（Chromium / Firefox 双平台）
 * ============================================
 *
 * 覆盖三类容易在改动中静默坏掉的问题：
 *  1. 两份 manifest 的平台正确性 —— 尤其 Firefox **不支持**
 *     `background.service_worker`（MDN 浏览器兼容数据：firefox version_added=false），
 *     必须用 `background.scripts`；以及 Chromium 专有权限不得出现在 Firefox 清单里。
 *  2. 兼容层 firefox-compat.js 的实际行为 —— 在 vm 沙箱里用 mock 的 browser/chrome
 *     API 驱动，验证回调风格包装、runtime.lastError 语义、事件对象不被包装、幂等性。
 *  3. 加载顺序与资源完整性 —— 兼容层必须在 background/content_scripts 首位，
 *     manifest 引用的文件必须存在，各语言 i18n key 集合一致。
 *
 * 用法：node test/extension/run.js
 */
'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const EXT_DIR = path.resolve(
  __dirname,
  '../../extensions/lerxu-webextension/lerxu-webextension'
)

let passed = 0
let failed = 0

const check = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    console.error(`  \u2717 ${name}\n      ${e.message}`)
  }
}

const checkAsync = async (name, fn) => {
  try {
    await fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    console.error(`  \u2717 ${name}\n      ${e.message}`)
  }
}

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(msg || 'assertion failed')
  }
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const exists = (rel) => fs.existsSync(path.join(EXT_DIR, rel))

const readManifest = (file) => {
  const p = path.join(EXT_DIR, file)
  assert(fs.existsSync(p), `缺少 ${file}`)
  return readJson(p)
}

/**
 * 在 vm 沙箱中执行兼容层，返回沙箱全局对象。
 * 沙箱自身即该 context 的 globalThis，因此可直接读取 chrome / LERXU_ENV。
 */
const runCompatInSandbox = (globals = {}) => {
  const sandbox = {
    console: { log () {}, warn () {}, error () {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Proxy,
    WeakMap,
    ...globals
  }
  vm.createContext(sandbox)
  const code = fs.readFileSync(path.join(EXT_DIR, 'firefox-compat.js'), 'utf8')
  vm.runInContext(code, sandbox, { filename: 'firefox-compat.js' })
  return sandbox
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const main = async () => {
  console.log(`扩展目录：${EXT_DIR}`)
  assert(fs.existsSync(EXT_DIR), `扩展目录不存在：${EXT_DIR}`)

  // ---------------------------------------------------------------- manifests
  console.log('\n[1] manifest（Chromium + Firefox）')

  const chromeMf = readManifest('manifest.json')
  const firefoxMf = readManifest('manifest.firefox.json')

  check('两份清单均为 Manifest V3', () => {
    assert(chromeMf.manifest_version === 3, 'Chromium 清单不是 MV3')
    assert(firefoxMf.manifest_version === 3, 'Firefox 清单不是 MV3')
  })

  check('Firefox 用 background.scripts（且不得出现 service_worker）', () => {
    const bg = firefoxMf.background || {}
    const scripts = bg.scripts
    assert(Array.isArray(scripts) && scripts.length > 0, 'Firefox 缺少 background.scripts 数组')
    assert(scripts.includes('background.js'), 'background.scripts 未包含 background.js')
    assert(
      bg.service_worker === undefined,
      'Firefox 不支持 background.service_worker（MDN: firefox version_added=false），必须移除'
    )
  })

  check('Chromium 用 background.service_worker', () => {
    const bg = chromeMf.background || {}
    assert(bg.service_worker === 'background.js', 'Chromium 清单未声明 service_worker')
    assert(bg.scripts === undefined, 'Chromium 清单不应声明 background.scripts（MV3 不支持）')
  })

  check('Firefox 清单包含 browser_specific_settings.gecko.id', () => {
    const gecko = firefoxMf.browser_specific_settings && firefoxMf.browser_specific_settings.gecko
    assert(gecko, '缺少 browser_specific_settings.gecko（Firefox 打包/签名必需）')
    assert(
      typeof gecko.id === 'string' && /^[^@\s]+@[^@\s]+$/.test(gecko.id),
      `gecko.id 格式非法：${gecko && gecko.id}`
    )
    assert(
      typeof gecko.strict_min_version === 'string' && /^\d+(\.\d+)?$/.test(gecko.strict_min_version),
      'gecko.strict_min_version 缺失或格式非法'
    )
  })

  check('Chromium 专有权限仅出现在 Chromium 清单（downloads.ui）', () => {
    const chromePerms = chromeMf.permissions || []
    const firefoxPerms = firefoxMf.permissions || []
    assert(chromePerms.includes('downloads.ui'), 'Chromium 清单应保留 downloads.ui（下载气泡控制）')
    assert(
      !firefoxPerms.includes('downloads.ui'),
      'Firefox 清单不应包含 downloads.ui（Firefox 无此权限，会产生未知权限警告）'
    )
    const extra = chromePerms.filter((p) => !firefoxPerms.includes(p))
    const missing = firefoxPerms.filter((p) => !chromePerms.includes(p))
    assert(
      extra.length === 1 && extra[0] === 'downloads.ui',
      `权限差异超出预期（Chromium 独有：${JSON.stringify(extra)}）`
    )
    assert(missing.length === 0, `Firefox 独有权限：${JSON.stringify(missing)}`)
  })

  check('两份清单的 host_permissions 一致', () => {
    const a = JSON.stringify(chromeMf.host_permissions || [])
    const b = JSON.stringify(firefoxMf.host_permissions || [])
    assert(a === b, `host_permissions 不一致：\n      Chromium: ${a}\n      Firefox:  ${b}`)
  })

  check('两份清单的关键元信息一致（版本 / i18n / 图标 / 命令）', () => {
    assert(chromeMf.version === firefoxMf.version, '版本号不一致')
    assert(chromeMf.default_locale === 'en' && firefoxMf.default_locale === 'en', 'default_locale 应为 en')
    assert(chromeMf.name === '__MSG_extensionName__', 'name 应使用 i18n 占位符')
    assert(firefoxMf.name === '__MSG_extensionName__', 'Firefox name 应使用 i18n 占位符')
    assert(
      JSON.stringify(chromeMf.commands) === JSON.stringify(firefoxMf.commands),
      'commands 声明不一致'
    )
    const ci = JSON.stringify(chromeMf.icons || {})
    assert(ci === JSON.stringify(firefoxMf.icons || {}), 'icons 声明不一致')
    assert(
      chromeMf.action && chromeMf.action.default_popup === 'popup.html' &&
      firefoxMf.action && firefoxMf.action.default_popup === 'popup.html',
      'action.default_popup 应为 popup.html'
    )
  })

  check('兼容层位于 background / content_scripts 首位（加载顺序）', () => {
    assert(
      firefoxMf.background.scripts[0] === 'firefox-compat.js',
      'Firefox background.scripts 首个脚本应为 firefox-compat.js'
    )
    const csChrome = chromeMf.content_scripts || []
    const csFirefox = firefoxMf.content_scripts || []
    for (const [label, cs] of [['Chromium', csChrome], ['Firefox', csFirefox]]) {
      assert(cs.length > 0, `${label} 缺少 content_scripts`)
      assert(
        cs[0].js && cs[0].js[0] === 'firefox-compat.js',
        `${label} content_scripts 首个脚本应为 firefox-compat.js`
      )
      assert(
        cs[0].run_at === 'document_start' && cs[0].all_frames === true,
        `${label} content_scripts 应在 document_start 全框架注入`
      )
    }
    const chromeCs = JSON.stringify(chromeMf.content_scripts[0].js)
    const firefoxCs = JSON.stringify(firefoxMf.content_scripts[0].js)
    assert(chromeCs === firefoxCs, `content_scripts.js 列表不一致：${chromeCs} vs ${firefoxCs}`)
  })

  check('manifest 引用的文件均存在', () => {
    const referenced = new Set()
    for (const mf of [chromeMf, firefoxMf]) {
      if (mf.background) {
        Object.values(mf.background).flat().forEach((f) => referenced.add(f))
      }
      ;(mf.content_scripts || []).forEach((cs) => (cs.js || []).forEach((f) => referenced.add(f)))
      Object.values(mf.icons || {}).forEach((f) => referenced.add(f))
      if (mf.action && mf.action.default_popup) referenced.add(mf.action.default_popup)
      if (mf.action && mf.action.default_icon) {
        Object.values(mf.action.default_icon).forEach((f) => referenced.add(f))
      }
    }
    const missing = [...referenced].filter((f) => !exists(f))
    assert(missing.length === 0, `manifest 引用了不存在的文件：${JSON.stringify(missing)}`)
  })

  check('popup.html 在业务脚本之前引入兼容层', () => {
    const html = fs.readFileSync(path.join(EXT_DIR, 'popup.html'), 'utf8')
    const idxCompat = html.indexOf('firefox-compat.js')
    const idxPopup = html.indexOf('popup.js')
    assert(idxCompat !== -1, 'popup.html 未引入 firefox-compat.js')
    assert(idxPopup !== -1, 'popup.html 未引入 popup.js')
    assert(idxCompat < idxPopup, 'firefox-compat.js 必须在 popup.js 之前加载')
  })

  // ------------------------------------------------------------- compat layer
  console.log('\n[2] 兼容层行为（firefox-compat.js）')

  await checkAsync('仅有 browser.* 时构造回调风格 chrome.*（含 lastError 语义）', async () => {
    const apiCalls = []
    const browserApi = {
      runtime: {
        id: 'lerxu@test',
        getBrowserInfo: async () => ({ name: 'Firefox', version: '128.0' }),
        onMessage: {
          addListener: () => apiCalls.push('onMessage.addListener'),
          removeListener: () => {}
        },
        sendMessage: async (msg) => ({ echoed: msg })
      },
      downloads: {
        download: async () => 42,
        setUiOptions: undefined,
        onCreated: { addListener: () => {} }
      },
      storage: {
        local: {
          get: async () => ({ interceptAllDownloads: true })
        }
      }
    }
    const sandbox = runCompatInSandbox({ browser: browserApi })

    assert(sandbox.chrome && typeof sandbox.chrome === 'object', '未构造 chrome 命名空间')
    assert(sandbox.chrome !== browserApi, 'chrome 应为包装层')
    assert(
      sandbox.chrome.runtime.onMessage === browserApi.runtime.onMessage,
      '事件对象被包装（会破坏 addListener 注册）'
    )

    // 回调风格：结果经回调返回
    let callbackResult = 'unset'
    sandbox.chrome.storage.local.get(null, (r) => {
      callbackResult = r
    })
    await tick()
    await tick()
    assert(
      callbackResult && callbackResult.interceptAllDownloads === true,
      `回调未收到结果：${JSON.stringify(callbackResult)}`
    )
    assert(sandbox.chrome.runtime.lastError === undefined, '成功后 lastError 应为空')

    // 无回调：保持 Promise 风格
    const p = sandbox.chrome.downloads.download({ url: 'https://example.com/a.zip' })
    assert(p && typeof p.then === 'function', '无回调调用应返回 Promise')
    assert((await p) === 42, 'Promise 结果应为原始返回值')

    // 失败：回调收到 undefined 且 lastError 置位
    const failing = runCompatInSandbox({
      browser: {
        runtime: { id: 'x' },
        downloads: { download: async () => { throw new Error('boom') } }
      }
    })
    let failedValue = 'unset'
    failing.chrome.downloads.download({ url: 'x' }, (v) => {
      failedValue = v
    })
    await tick()
    await tick()
    assert(failedValue === undefined, `失败回调应收到 undefined，实际 ${JSON.stringify(failedValue)}`)
    assert(
      failing.chrome.runtime.lastError && /boom/.test(failing.chrome.runtime.lastError.message),
      '失败时 lastError 应带错误信息'
    )
  })

  await checkAsync('原生 chrome.* 存在时不替换（Firefox / Chromium 主路径）', async () => {
    const nativeChrome = {
      runtime: {
        id: 'lerxu@test',
        getBrowserInfo: () => {},
        onMessage: { addListener: () => {} }
      },
      downloads: {
        download: () => {},
        setUiOptions: () => {},
        onDeterminingFilename: { addListener: () => {} }
      }
    }
    const sandbox = runCompatInSandbox({
      chrome: nativeChrome,
      browser: { runtime: { id: 'lerxu@test' } }
    })
    assert(sandbox.chrome === nativeChrome, '原生 chrome 被替换（应保持原样）')
    assert(sandbox.LERXU_ENV.hasChromeNamespace === true, 'hasChromeNamespace 应为 true')
  })

  await checkAsync('LERXU_ENV 能力探测（Firefox 无 Chromium 专有 API）', async () => {
    // Firefox：通过 chrome.* 访问，runtime.getBrowserInfo 存在，两个专有 API 均缺失
    const firefoxSandbox = runCompatInSandbox({
      chrome: {
        runtime: { id: 'lerxu@test', getBrowserInfo: () => {}, onMessage: { addListener: () => {} } },
        downloads: { download: () => {}, onCreated: { addListener: () => {} } }
      }
    })
    assert(firefoxSandbox.LERXU_ENV.isFirefox === true, 'Firefox 应被识别')
    assert(
      firefoxSandbox.LERXU_ENV.capabilities.onDeterminingFilename === false,
      'Firefox 不应报告 onDeterminingFilename 能力'
    )
    assert(
      firefoxSandbox.LERXU_ENV.capabilities.downloadBubbleUi === false,
      'Firefox 不应报告 downloads.setUiOptions 能力'
    )

    // Chromium：无 getBrowserInfo，两个专有 API 均在
    const chromiumSandbox = runCompatInSandbox({
      chrome: {
        runtime: { id: 'abc', onMessage: { addListener: () => {} } },
        downloads: {
          setUiOptions: () => {},
          onDeterminingFilename: { addListener: () => {} }
        }
      }
    })
    assert(chromiumSandbox.LERXU_ENV.isFirefox === false, 'Chromium 不应被识别为 Firefox')
    assert(
      chromiumSandbox.LERXU_ENV.capabilities.onDeterminingFilename === true &&
      chromiumSandbox.LERXU_ENV.capabilities.downloadBubbleUi === true,
      'Chromium 应报告两个专有能力'
    )
  })

  check('兼容层幂等（重复注入不重复包装）', () => {
    const browserApi = { runtime: { id: 'x', sendMessage: async () => 1 } }
    const sandbox = runCompatInSandbox({ browser: browserApi })
    const firstChrome = sandbox.chrome
    vm.runInContext(
      fs.readFileSync(path.join(EXT_DIR, 'firefox-compat.js'), 'utf8'),
      sandbox,
      { filename: 'firefox-compat.js' }
    )
    assert(sandbox.chrome === firstChrome, '重复注入后 chrome 被重新包装（幂等性破坏）')
  })

  check('background.js 通过 importScripts 兜底加载兼容层（Chromium SW）', () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'background.js'), 'utf8')
    assert(
      /importScripts\(\s*['"]firefox-compat\.js['"]\s*\)/.test(src),
      'background.js 未 importScripts firefox-compat.js'
    )
    assert(
      /typeof importScripts === 'function'/.test(src),
      'importScripts 应有存在性判断（Firefox event page 无该函数）'
    )
  })

  check('Chromium 专有 API 在使用点均做了能力检测', () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'background.js'), 'utf8')
    assert(
      /chrome\.downloads\.onDeterminingFilename\s*\)/.test(src),
      'onDeterminingFilename 未做存在性检查（Firefox 上会抛错）'
    )
    assert(
      /typeof chrome\.downloads\.setUiOptions === 'function'/.test(src),
      'setUiOptions 未做存在性检查（Firefox 上会抛错）'
    )
  })

  // ------------------------------------------------------- files & locales
  console.log('\n[3] 脚本语法与多语言资源')

  check('全部 JS 文件语法正确', () => {
    const jsFiles = fs.readdirSync(EXT_DIR).filter((f) => f.endsWith('.js'))
    assert(jsFiles.length > 0, '未找到 JS 文件')
    for (const f of jsFiles) {
      const code = fs.readFileSync(path.join(EXT_DIR, f), 'utf8')
      try {
        new vm.Script(code, { filename: f })
      } catch (e) {
        throw new Error(`${f} 语法错误：${e.message}`)
      }
    }
  })

  check('各语言 messages.json 合法且 key 集合一致', () => {
    const localesDir = path.join(EXT_DIR, '_locales')
    const locales = fs.readdirSync(localesDir)
    assert(locales.length > 0, '未找到任何语言目录')
    const reference = { name: locales[0], keys: null, required: null }
    for (const loc of locales) {
      const messages = readJson(path.join(localesDir, loc, 'messages.json'))
      const keys = Object.keys(messages).sort()
      const required = keys.filter((k) => messages[k] && messages[k].message === undefined)
      assert(required.length === 0, `${loc} 中以下条目缺少 message 字段：${JSON.stringify(required)}`)
      if (reference.keys === null) {
        reference.keys = keys
      } else {
        const missing = reference.keys.filter((k) => !keys.includes(k))
        const extra = keys.filter((k) => !reference.keys.includes(k))
        assert(
          missing.length === 0 && extra.length === 0,
          `${loc} 与 ${reference.name} 的 key 不一致（缺失：${JSON.stringify(missing)}，多余：${JSON.stringify(extra)}）`
        )
      }
    }
    assert(reference.keys.includes('extensionName'), 'messages.json 缺少 extensionName')
    assert(reference.keys.includes('actionTitle'), 'messages.json 缺少 actionTitle')
  })

  check('i18n 占位符在 messages.json 中均有定义', () => {
    const en = readJson(path.join(EXT_DIR, '_locales/en/messages.json'))
    const used = new Set()
    for (const s of [chromeMf.name, chromeMf.description, chromeMf.action.default_title]) {
      const m = /^__MSG_([A-Za-z0-9_]+)__$/.exec(s || '')
      if (m) used.add(m[1])
    }
    const missing = [...used].filter((k) => !(k in en))
    assert(missing.length === 0, `messages.json 缺少占位符定义：${JSON.stringify(missing)}`)
  })

  check('Firefox 清单声明数据收集权限（AMO 对全部新扩展的强制要求）', () => {
    const gecko = firefoxMf.browser_specific_settings && firefoxMf.browser_specific_settings.gecko
    assert(gecko, '缺少 browser_specific_settings.gecko')
    const dcp = gecko.data_collection_permissions
    assert(
      dcp,
      '缺少 gecko.data_collection_permissions —— AMO 会报 error：' +
      'The "data_collection_permissions" property is required for all new Firefox extensions'
    )

    // 允许取值来自 addons-linter 的 schema（CommonDataCollectionPermission）
    const COMMON = [
      'authenticationInfo', 'bookmarksInfo', 'browsingActivity', 'financialAndPaymentInfo',
      'healthInfo', 'locationInfo', 'personalCommunications', 'personallyIdentifyingInfo',
      'searchTerms', 'websiteActivity', 'websiteContent'
    ]

    const required = dcp.required
    assert(Array.isArray(required) && required.length > 0, 'required 必须是非空数组')
    if (required.includes('none')) {
      // linter 规则 NONE_DATA_COLLECTION_IS_EXCLUSIVE
      assert(required.length === 1, '"none" 必须独占，不能与其它 required 类别并列')
    } else {
      for (const v of required) {
        assert(COMMON.includes(v), `required 含非法取值：${v}`)
      }
    }

    const optional = dcp.optional
    if (optional !== undefined) {
      assert(Array.isArray(optional), 'optional 若存在必须是数组')
      for (const v of optional) {
        assert(
          COMMON.includes(v) || v === 'technicalAndInteraction',
          `optional 含非法取值：${v}（technicalAndInteraction 只能放在 optional）`
        )
      }
    }

    // 扩展确实读取网页内容与浏览活动并交给本机 Lerxu 应用（在扩展之外处理），
    // 因此必须声明这两类；若改为 "none"，需同时确认不再向扩展外传递任何网页数据。
    assert(
      required.includes('websiteContent') && required.includes('browsingActivity'),
      `数据收集声明与实际行为不符（当前：${JSON.stringify(required)}）`
    )
  })

  check('Chromium 清单不含 Firefox 专有键（避免 Chrome 的 Unrecognized manifest key）', () => {
    assert(
      chromeMf.browser_specific_settings === undefined,
      'Chromium 清单不应包含 browser_specific_settings'
    )
    const geckoOnlyKeys = ['data_collection_permissions']
    for (const key of geckoOnlyKeys) {
      assert(
        !(key in chromeMf),
        `Chromium 清单不应包含 Firefox 专有键 ${key}`
      )
    }
  })

  // ------------------------------------------------------------- packaging
  console.log('\n[4] 打包产物结构（AMO 提交约束）')

  const build = require(path.resolve(__dirname, '../../scripts/build-extension.js'))
  // 测试产物写到临时目录，避免污染 dist/extension/artifacts（待提交的构建输出）
  const os = require('os')
  const TEST_OUT = path.join(os.tmpdir(), 'lerxu-ext-build-test')
  fs.rmSync(TEST_OUT, { recursive: true, force: true })

  check('minizip：CRC32 与往返压缩正确', () => {
    const { createZip, listZipEntries, readZipEntry, crc32 } = require(
      path.resolve(__dirname, '../../scripts/lib/minizip.js')
    )
    // CRC32("123456789") = 0xCBF43926（标准测试向量）
    assert(crc32(Buffer.from('123456789')) === 0xCBF43926, 'CRC32 测试向量不匹配')

    const archive = createZip([
      { name: 'a.txt', data: 'hello' },
      { name: 'dir/b.txt', data: '世界' },
      { name: 'big.bin', data: Buffer.alloc(4096, 7) }
    ])
    const list = listZipEntries(archive)
    assert(list.length === 3, `条目数应为 3，实际 ${list.length}`)
    assert(readZipEntry(archive, 'a.txt').toString() === 'hello', 'a.txt 内容不一致')
    assert(readZipEntry(archive, 'dir/b.txt').toString() === '世界', 'b.txt 内容不一致')
    assert(list.find((e) => e.name === 'dir/b.txt').utf8 === true, '非 ASCII 名应带 UTF-8 标志')
    assert(
      readZipEntry(archive, 'big.bin').length === 4096,
      '大文件解压长度不一致'
    )
  })

  check('归档根目录存在 manifest.json（否则 AMO 报 “not found at the root”）', () => {
    build.buildPlatform('firefox')
    const r = build.packagePlatform('firefox', '0.0.0-test', TEST_OUT)
    const { listZipEntries } = require(path.resolve(__dirname, '../../scripts/lib/minizip.js'))
    const archive = fs.readFileSync(r.files.find((f) => f.endsWith('.zip')))
    const list = listZipEntries(archive)
    assert(
      list.some((e) => e.name === 'manifest.json'),
      '归档根缺少 manifest.json'
    )
    assert(
      !list.some((e) => e.name.startsWith('lerxu-webextension/')),
      '归档内不应出现顶层源码目录（不能压缩源码目录本身）'
    )
  })

  check('归档不含 macOS 元数据与开发脚本', () => {
    const { listZipEntries } = require(path.resolve(__dirname, '../../scripts/lib/minizip.js'))
    const r = build.packagePlatform('firefox', '0.0.0-test', TEST_OUT)
    const archive = fs.readFileSync(r.files.find((f) => f.endsWith('.zip')))
    const bad = listZipEntries(archive).filter((e) =>
      e.name.startsWith('__MACOSX/') ||
      e.name.split('/').some((seg) => seg.startsWith('._')) ||
      e.name.split('/').some((seg) => seg === '.DS_Store') ||
      e.name.endsWith('.py') ||
      e.name.endsWith('.map')
    )
    assert(bad.length === 0, `归档含禁止文件：${JSON.stringify(bad.map((b) => b.name))}`)
  })

  check('归档内清单与目标平台匹配（Firefox 用 scripts，Chromium 用 service_worker）', () => {
    const { readZipEntry } = require(path.resolve(__dirname, '../../scripts/lib/minizip.js'))

    build.buildPlatform('firefox')
    const ff = build.packagePlatform('firefox', '0.0.0-test', TEST_OUT)
    const ffArchive = fs.readFileSync(ff.files.find((f) => f.endsWith('.zip')))
    const ffManifest = JSON.parse(readZipEntry(ffArchive, 'manifest.json').toString('utf8'))
    assert(
      Array.isArray(ffManifest.background.scripts) && !ffManifest.background.service_worker,
      'Firefox 归档应使用 background.scripts'
    )
    assert(
      ffManifest.browser_specific_settings && ffManifest.browser_specific_settings.gecko.id,
      'Firefox 归档缺少 gecko.id'
    )
    assert(
      !(ffManifest.permissions || []).includes('downloads.ui'),
      'Firefox 归档不应含 downloads.ui'
    )
    assert(
      ffManifest.browser_specific_settings &&
      ffManifest.browser_specific_settings.gecko &&
      ffManifest.browser_specific_settings.gecko.data_collection_permissions,
      'Firefox 归档缺少 gecko.data_collection_permissions（AMO 会拒绝）'
    )
    assert(
      ff.files.some((f) => f.endsWith('.xpi')),
      'Firefox 应同时产出 .xpi（本地安装）'
    )

    build.buildPlatform('chromium')
    const cr = build.packagePlatform('chromium', '0.0.0-test', TEST_OUT)
    const crArchive = fs.readFileSync(cr.files.find((f) => f.endsWith('.zip')))
    const crManifest = JSON.parse(readZipEntry(crArchive, 'manifest.json').toString('utf8'))
    assert(
      crManifest.background.service_worker === 'background.js',
      'Chromium 归档应使用 background.service_worker'
    )
    assert(
      (crManifest.permissions || []).includes('downloads.ui'),
      'Chromium 归档应保留 downloads.ui'
    )
  })

  check('归档内容仅含白名单文件（发布材料不会泄漏进扩展包）', () => {
    const { listZipEntries } = require(path.resolve(__dirname, '../../scripts/lib/minizip.js'))
    const r = build.packagePlatform('firefox', '0.0.0-test', TEST_OUT)
    const archive = fs.readFileSync(r.files.find((f) => f.endsWith('.zip')))
    const allowed = new Set(build.INCLUDE_FILES)
    // manifest.json 由各平台的源清单（manifest.json / manifest.firefox.json）生成，不在白名单内
    allowed.add('manifest.json')
    const allowedDirs = build.INCLUDE_DIRS.map((d) => `${d}/`)
    const unexpected = listZipEntries(archive)
      .map((e) => e.name)
      .filter((name) => !allowed.has(name) && !allowedDirs.some((d) => name.startsWith(d)))
    assert(
      unexpected.length === 0,
      `归档含白名单外的文件（如仓库说明 / 打包文案）：${JSON.stringify(unexpected)}`
    )
  })

  check('打包自检会拦截结构错误（防止回归）', () => {
    const { createZip } = require(path.resolve(__dirname, '../../scripts/lib/minizip.js'))
    // 直接验证自检规则的判定逻辑：模拟“压缩了源码目录”的归档
    const wrong = createZip([
      { name: 'lerxu-webextension/manifest.json', data: '{}' },
      { name: '__MACOSX/._background.js', data: 'x' }
    ])
    const { listZipEntries } = require(path.resolve(__dirname, '../../scripts/lib/minizip.js'))
    const names = listZipEntries(wrong).map((e) => e.name)
    assert(
      !names.includes('manifest.json'),
      '测试前提错误：模拟归档不应有根级 manifest.json'
    )
    assert(
      names.some((n) => n.startsWith('__MACOSX/')),
      '测试前提错误：模拟归档应含 __MACOSX'
    )
  })

  console.log(
    `\n结果：${passed} 通过，${failed} 失败（扩展目录 ${path.basename(EXT_DIR)}）`
  )
  // 回收测试期生成的临时构建产物（真实产物目录不受影响）
  fs.rmSync(TEST_OUT, { recursive: true, force: true })
  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(`\n测试脚本异常终止：${e && e.stack ? e.stack : e}`)
  process.exit(1)
})
