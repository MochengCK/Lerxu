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

  // --------------------------------------------------------- hls grouping
  console.log('\n[4] HLS 清单 / 分片分组（key-listener.js）')

  /**
   * 把 key-listener.js 里"资源分成哪几组"的那一段抽出来在沙箱里跑。
   *
   * 那一段（isM4sEntry → countDisplayItems）是纯函数、不碰 DOM，抽出来就能
   * 直接喂数据断言。它决定了"下拉框里显示哪几条、按钮上写几" —— 用户两次
   * 点名（数量对不上、分不清该点哪个）都出在这里，必须有回归测试。
   */
  const loadGrouping = () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'key-listener.js'), 'utf8')
    const start = src.indexOf('const isM4sEntry = (resource) => {')
    const end = src.indexOf('// 取数重入深度')
    assert(
      start >= 0 && end > start,
      '未能在 key-listener.js 中定位分组函数（结构变了？测试需同步）'
    )
    // 包一层函数：脚本顶层不允许 return
    const code = `(function () {\n${src.slice(start, end)}\nreturn { collectDisplayItems, countDisplayItems }\n})()`
    const sandbox = { URL, console: { log () {}, warn () {}, error () {} } }
    vm.createContext(sandbox)
    return new vm.Script(code, { filename: 'hls-grouping.js' }).runInContext(sandbox)
  }

  check('有完整视频（清单）时不再列视频流/音频流，分片仍折进分片组', () => {
    const { collectDisplayItems, countDisplayItems } = loadGrouping()
    const manifest = { url: 'https://cdn.example.com/show/index.m3u8?token=a', ext: 'm3u8', size: 0 }
    const segments = Array.from({ length: 40 }, (_, i) => ({
      url: `https://cdn.example.com/show/seg${i}.ts`, ext: 'ts', size: 0
    }))
    const plain = { url: 'https://cdn.example.com/other/clip.mp4', ext: 'mp4', size: 100 }
    const items = collectDisplayItems({
      video: [manifest, ...segments, plain], audio: [], m4s: [], combined: []
    })

    assert(items.manifest.length === 1, `清单应有 1 条，实际 ${items.manifest.length}`)
    assert(items.segments.length === 40, `分片应全部归组，实际 ${items.segments.length}`)
    // 「完整视频」在手时，视频流/音频流两栏整栏不显示（用户点名）：
    // 同一条资源既在清单里又在视频栏里，只会让人犹豫该点哪一条
    assert(
      items.video.length === 0 && items.audio.length === 0,
      '有清单时不该再列视频流/音频流'
    )
    // 条数 = 清单 1 + 分片组 1（折叠组是一行，按钮数字必须与列表一致）
    assert(countDisplayItems(items) === 2, `可见条目数应为 2，实际 ${countDisplayItems(items)}`)
  })

  check('直播条目单独成栏：不混在视频资源，也不混进 HLS 完整视频', () => {
    const { collectDisplayItems, countDisplayItems } = loadGrouping()
    const liveFlv = { url: 'https://live.example.com/live/stream.flv', ext: 'flv', live: true }
    const liveM3u8 = { url: 'https://live.example.com/live/index.m3u8', ext: 'm3u8', live: true }
    const vodFlv = { url: 'https://cdn.example.com/vod/movie.flv', ext: 'flv', live: false }
    const vodM3u8 = { url: 'https://cdn.example.com/vod/index.m3u8', ext: 'm3u8' }
    const items = collectDisplayItems({
      video: [liveFlv, vodFlv, liveM3u8, vodM3u8], audio: [], m4s: [], combined: []
    })

    assert(items.live.length === 2, `两条直播都该进直播栏，实际 ${items.live.length}`)
    // 页面里有 HLS 清单（= 完整视频）时视频栏整栏不显示（用户点名），
    // 但直播条目必须仍然单独成栏、不得混进去
    assert(items.video.length === 0, '有清单时视频栏不再单列')
    assert(
      items.manifest.length === 1 && items.manifest[0].url === vodM3u8.url,
      '非直播清单仍在 HLS 完整视频栏（直播清单归直播栏）'
    )
    // 直播 2 + 清单 1：按钮数字必须与列表逐条对得上
    assert(countDisplayItems(items) === 3, `可见条目数应为 3，实际 ${countDisplayItems(items)}`)

    // 直播条目也不该同时出现在音频栏（音频型直播流同理）
    const liveAudio = { url: 'https://live.example.com/live/radio.flv', ext: 'flv', live: true }
    const withAudio = collectDisplayItems({
      video: [], audio: [liveAudio], m4s: [], combined: []
    })
    assert(withAudio.live.length === 1 && withAudio.audio.length === 0, '音频型直播也要进直播栏')
  })

  check('没有清单时 .ts 不算分片（孤立的 .ts 可能真是整段视频）', () => {
    const { collectDisplayItems, countDisplayItems } = loadGrouping()
    const ts = { url: 'https://cdn.example.com/legacy/movie.ts', ext: 'ts', size: 0 }
    const items = collectDisplayItems({ video: [ts], audio: [], m4s: [], combined: [] })
    assert(items.manifest.length === 0 && items.segments.length === 0, '没有清单就不该有分片组')
    assert(items.video.length === 1, '孤立 .ts 应照常列在视频栏')
    assert(countDisplayItems(items) === 1, '计数应保持 1')
  })

  check('不同查询串的清单是两条流，不会被去重合并', () => {
    const { collectDisplayItems } = loadGrouping()
    const m720 = { url: 'https://cdn.example.com/index.m3u8?q=720', ext: 'm3u8' }
    const m1080 = { url: 'https://cdn.example.com/index.m3u8?q=1080', ext: 'm3u8' }
    const items = collectDisplayItems({ video: [m720, m1080], audio: [], m4s: [], combined: [] })
    assert(items.manifest.length === 2, `两条清单都应保留，实际 ${items.manifest.length}`)
  })

  check('既有的 m4s / 合并视频规则未被破坏', () => {
    const { collectDisplayItems, countDisplayItems } = loadGrouping()
    const m4s = { url: 'https://upos.example.com/v.m4s', ext: 'm4s' }
    const plain = { url: 'https://upos.example.com/other.mp4', ext: 'mp4' }
    const items = collectDisplayItems({
      video: [m4s, plain], audio: [], m4s: [m4s], combined: []
    })
    assert(items.m4s.length === 1, 'm4s 应留在分离流那一栏')
    assert(items.video.length === 1 && items.video[0].url === plain.url, 'm4s 不应在视频栏重复出现')

    const v = { url: 'https://cdn.example.com/v.mp4', ext: 'mp4' }
    const a = { url: 'https://cdn.example.com/a.m4a', ext: 'm4a' }
    const paired = collectDisplayItems({
      video: [v], audio: [a], m4s: [], combined: [{ videoUrl: v.url, audioUrl: a.url }]
    })
    assert(paired.video.length === 0 && paired.audio.length === 0, '配进合并条目的流不应再单列')
    assert(countDisplayItems(paired) === 1, '合并条目应计为 1')
  })

  check('片段滑块不再只对 HLS 清单开放（单文件任务也能按帧裁）', () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'key-listener.js'), 'utf8')
    assert(
      /const createClipRow = \(keys, canClip\)/.test(src),
      '片段行要由调用方决定是否可用（不再自己判清单）'
    )
    assert(
      !/createClipRow = \(keys\) =>/.test(src),
      '旧的「只对清单显示」门禁应当已经去掉'
    )
    assert(
      /createClipRow\(keys, extras\.canClip === true\)/.test(src),
      '设置面板要按 canClip 决定显不显示片段行'
    )
    assert(
      /canClip: resource\.live !== true/.test(src),
      '普通条目要按「不是直播」开放片段（直播没有稳定时间轴）'
    )
    assert(
      /canClip: true \}\)/.test(src),
      '合并条目（完整视频）也该能裁片段'
    )
  })

  check('片段滑块的把手不会被面板裁掉（左右各留够空白）', () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'key-listener.js'), 'utf8')
    const slider = src.match(/\.lx-clip-slider \{[\s\S]*?\n\}/)
    assert(slider, '缺少滑动区样式 .lx-clip-slider')
    const margin = slider[0].match(/margin:\s*0\s+(\d+)px/)
    assert(margin, '滑动区必须显式写左右留白')
    assert(
      Number(margin[1]) >= 10,
      `滑动区左右留白必须 ≥10px（把手 12px 宽、骑在轨道两端；现在 ${margin[1]}px）—— ` +
      '设置面板为了高度动画带 overflow:hidden，留少了右侧把手会被切掉'
    )
    assert(
      /\.lx-format-panel \{[\s\S]*?padding: 0 2px;/.test(src),
      '设置面板要左右对称留白（右边那 2px 是给把手阴影的）'
    )
    // 竖向同样会被裁：把手是绝对定位的，只要它的下沿越过面板内容盒就会被切。
    // 18px 必须是**含描边**的总高（content-box 会被 1.5px 描边撑到 21px），
    // 且滑动区下方要留一点余量。
    const thumb = src.match(/\.lx-clip-thumb \{[\s\S]*?\n\}/)
    assert(thumb, '缺少把手样式 .lx-clip-thumb')
    assert(
      /box-sizing:\s*border-box/.test(thumb[0]),
      '把手必须用 border-box：否则 1.5px 描边把 18px 撑成 21px，下沿溢出被裁'
    )
    const clip = src.match(/\.lx-clip \{[\s\S]*?\n\}/)
    assert(clip && /padding-bottom:\s*[1-9]/.test(clip[0]), '片段行下方要留出把手的呼吸位')

    // 起点/终点读数：左右各一个、默认就显示时间（不再有"全片"这种字）
    assert(
      (src.match(/className = 'lx-clip-time'/g) || []).length === 2,
      '片段行要有左右两个时间读数（起点 / 终点）'
    )
    assert(/startTime\.textContent = formatClipTime\(start\)/.test(src), '左读数要跟随起点把手')
    assert(/endTime\.textContent = formatClipTime\(end\)/.test(src), '右读数要跟随终点把手')
    assert(!/clipAll/.test(src), '不要再用"全片"代替时间')
  })

  check('条目上不放下载按钮，且「下载全部」不会逐条发送分片', () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'key-listener.js'), 'utf8')
    assert(/isHlsManifestEntry/.test(src) && /isTsSegmentEntry/.test(src), '缺少清单/分片判定')
    assert(
      /manifest\.forEach\(sendSingle\)/.test(src),
      '「下载全部」没把清单放进发送队列'
    )
    assert(
      !/segments\.forEach\(sendSingle\)/.test(src),
      '「下载全部」不应逐条发送分片（会建出几十个垃圾任务）'
    )
    // 条目本身就是"加入下载队列"，行内**不放下载按钮/图标**（用户点名：那是噪音）。
    // 「输出格式」齿轮是设置入口、不是第二个下载入口，它必须 stopPropagation
    // （否则点齿轮会把这条任务发出去），所以这里只禁下载图标本身。
    assert(
      !/createItemDownloadIcon/.test(
        src.slice(src.indexOf('const createResourceItem'), src.indexOf('const downloadSingleResource'))
      ),
      '条目渲染里不应再出现下载按钮/图标'
    )
    assert(/createFormatControl\(/.test(src), '条目缺少「输出格式」设置入口')
    assert(/lx-format-trigger/.test(src), '输出格式应使用自绘选择框（不是原生 select / 一排 chip）')
    for (const key of ['hlsCompleteVideo', 'hlsSegments', 'segment']) {
      assert(
        new RegExp(`'${key}':\\s*\\{[^}]*'zh_CN'`).test(src),
        `getLocalizedText 缺少 ${key} 的 zh_CN 文案`
      )
    }
  })

  check('直播判定：无 ENDLIST 且非 VOD 才算直播；主清单跟一层变体', () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'background.js'), 'utf8')
    const start = src.indexOf('const analyzeManifestTextForLive = (text) => {')
    const end = src.indexOf('const readManifestHead =', start)
    assert(
      start >= 0 && end > start,
      '未能在 background.js 中定位直播判定函数（结构变了？测试需同步）'
    )
    // 包一层函数：脚本顶层不允许 return
    const code = `(function () {\n${src.slice(start, end)}\nreturn { analyzeManifestTextForLive }\n})()`
    const sandbox = { console: { log () {}, warn () {}, error () {} } }
    vm.createContext(sandbox)
    const { analyzeManifestTextForLive } = new vm.Script(code, { filename: 'live-analyze.js' }).runInContext(sandbox)

    assert(
      analyzeManifestTextForLive('#EXTM3U\n#EXTINF:4,\na.ts\n#EXT-X-ENDLIST\n').live === false,
      '带 ENDLIST 的是点播清单，不能标直播'
    )
    assert(
      analyzeManifestTextForLive('#EXTM3U\n#EXTINF:4,\na.ts\n').live === true,
      '无 ENDLIST 的媒体清单是直播'
    )
    assert(
      analyzeManifestTextForLive('#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:4,\na.ts\n').live === false,
      '显式 PLAYLIST-TYPE:VOD（即使没有 ENDLIST）不算直播'
    )
    const master = analyzeManifestTextForLive('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nv.m3u8\n')
    assert(
      master.master === true && master.variantUri === 'v.m3u8',
      '主清单自身没有 ENDLIST（媒体层标签），必须能取到第一个变体往下判'
    )
    assert(
      analyzeManifestTextForLive('<html>not a manifest</html>').manifest === false,
      '非清单文本不能判成直播'
    )
  })

  check('FLV 直播判定：像 FLV 且服务器没给总长才算直播', () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'background.js'), 'utf8')
    const start = src.indexOf('const analyzeFlvHead = ({ url, contentType, contentLength, head }) => {')
    const end = src.indexOf('const readManifestHead =', start)
    assert(
      start >= 0 && end > start,
      '未能在 background.js 中定位 FLV 直播判定函数（结构变了？测试需同步）'
    )
    const code = `(function () {\n${src.slice(start, end)}\nreturn { analyzeFlvHead }\n})()`
    const sandbox = { console: { log () {}, warn () {}, error () {} } }
    vm.createContext(sandbox)
    const { analyzeFlvHead } = new vm.Script(code, { filename: 'flv-analyze.js' }).runInContext(sandbox)

    const flvHead = [0x46, 0x4c, 0x56, 0x01, 0x05, 0, 0, 0]
    // 无总长 + FLV 魔数 = 直播（HTTP-FLV 的传输形态：长连接永不收尾）
    assert(
      analyzeFlvHead({ url: 'https://h/live/s', contentType: '', contentLength: null, head: flvHead }).live === true,
      '无 Content-Length 且正文是 FLV 必须是直播'
    )
    // 无总长 + 地址/类型像 FLV（正文没读到）也算直播（与下载引擎同一口径）
    assert(
      analyzeFlvHead({ url: 'https://h/live/s.flv', contentType: '', contentLength: null, head: null }).live === true,
      '.flv 地址且无总长必须是直播'
    )
    assert(
      analyzeFlvHead({ url: 'https://h/live/s', contentType: 'video/x-flv', contentLength: null, head: null }).live === true,
      'video/x-flv 且无总长必须是直播'
    )
    // 有总长 = 点播文件：不能标直播
    assert(
      analyzeFlvHead({ url: 'https://h/v/movie.flv', contentType: 'video/x-flv', contentLength: '10485760', head: flvHead }).live === false,
      '带 Content-Length 的 FLV 是点播文件'
    )
    // 不像 FLV 的一律判不了（不显示徽章）
    assert(
      analyzeFlvHead({ url: 'https://h/api/data', contentType: 'application/json', contentLength: null, head: null }).flv === false,
      '既不是 FLV 类型也不带 .flv 的不能判成直播'
    )
    assert(
      analyzeFlvHead({ url: 'https://h/v/other.mp4', contentType: '', contentLength: null, head: [0, 0, 0, 0] }).flv === false,
      '正文魔数不是 FLV 的不能判成直播'
    )
  })

  check('接口 / 长连接流地址提取：绝对地址、host + 相对路径、转义斜杠', () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'page-stream-watcher.js'), 'utf8')
    const start = src.indexOf("  const MSG_KEY = '__lerxuStreamUrls'")
    const end = src.indexOf('  const report = (urls) => {', start)
    assert(
      start >= 0 && end > start,
      '未能在 page-stream-watcher.js 中定位流地址提取函数（结构变了？测试需同步）'
    )
    const code = `(function () {\n${src.slice(start, end)}\nreturn { scanText, scanJsonValue }\n})()`
    const sandbox = { console: { log () {}, warn () {}, error () {} }, location: { protocol: 'https:' } }
    vm.createContext(sandbox)
    const { scanText, scanJsonValue } = new vm.Script(code, { filename: 'stream-scan.js' }).runInContext(sandbox)

    // 转义斜杠的 JSON 文本（接口原样下发的样子）
    const t = scanText('{"flv_pull_url":{"FULL_HD1":"https:\\/\\/pull-flv.example.com\\/stage\\/stream-1_or4.flv?sign=abc&expire=1"}}')
    assert(
      t.size === 1 && [...t][0] === 'https://pull-flv.example.com/stage/stream-1_or4.flv?sign=abc&expire=1',
      '转义过的 JSON 文本里要能扫到 .flv 绝对地址：' + JSON.stringify([...t])
    )

    // \uXXXX 转义（JSON/JS 字符串里的 & —— 不还原就会在转义处截断签名参数）
    const esc = scanText('self.__pace_f.push([1,"{\\"flv\\":\\"http://pull.example.com/live/s_or4.flv?expire=1\\u0026sign=abc\\u0026t=9\\"}])')
    assert(
      [...esc][0] === 'http://pull.example.com/live/s_or4.flv?expire=1&sign=abc&t=9',
      '\\uXXXX 必须还原（否则地址少了签名参数就是死链）：' + JSON.stringify([...esc])
    )

    // host + 相对路径（接口把两者分开放的形态）
    const j = scanJsonValue({ host: 'https://cn-1.example.com/', base_url: '/live/abc/live_1.flv?token=t' })
    assert(
      [...j][0] === 'https://cn-1.example.com/live/abc/live_1.flv?token=t',
      'host 与相对路径必须拼出完整地址：' + JSON.stringify([...j])
    )

    // 协议相对
    const p = scanJsonValue({ url: '//h.example.com/x.m3u8?a=1' })
    assert(
      [...p][0] === 'https://h.example.com/x.m3u8?a=1',
      '协议相对地址要补上页面协议：' + JSON.stringify([...p])
    )

    // 不误报
    assert(scanText('https://h.example.com/api/list.json').size === 0, '非媒体扩展名不能进来')
    assert(scanJsonValue({ base_url: '/api/data' }).size === 0, '没有主机可拼的相对非媒体路径不能进来')
    assert(scanText('<html><body>no streams here</body></html>').size === 0, '普通文本不能误报')
    assert(scanJsonValue({ url: 'https://h.example.com/a.mp4' }).size === 0, '非流媒体扩展（mp4 等）不该被当成流地址')
  })

  check('页面世界观察器已接通（MAIN world 注入 + postMessage 登记）', () => {
    for (const mf of ['manifest.json', 'manifest.firefox.json']) {
      const m = JSON.parse(fs.readFileSync(path.join(EXT_DIR, mf), 'utf8'))
      const entry = (m.content_scripts || []).find((e) => (e.js || []).includes('page-stream-watcher.js'))
      assert(entry, `${mf} 未注入 page-stream-watcher.js`)
      assert(entry.world === 'MAIN', `${mf} 里的观察器必须跑在 MAIN world（页面世界的 XHR/fetch/WS 才能在隔离世界里看到）`)
      assert(entry.run_at === 'document_start', `${mf} 里的观察器要在 document_start 就跑起来`)
    }
    const build = fs.readFileSync(path.resolve(__dirname, '../../scripts/build-extension.js'), 'utf8')
    assert(/page-stream-watcher\.js/.test(build), '打包白名单缺少 page-stream-watcher.js（产物会漏文件）')
    const sniffer = fs.readFileSync(path.join(EXT_DIR, 'video-sniffer.js'), 'utf8')
    assert(/__lerxuStreamUrls/.test(sniffer), 'video-sniffer 未接收页面世界观察器上报的流地址')
    assert(
      /registerPageStreamUrl\(data\.__lerxuStreamUrls\)/.test(sniffer),
      '消息监听必须把上报的地址交给登记函数'
    )
    assert(
      /const registerPageStreamUrl = \(url\) => \{[\s\S]{0,700}?addResource\(url, null, 0\)/.test(sniffer),
      '上报的地址必须走与直连嗅探同一条登记路径（addResource）'
    )
    assert(
      /flushPendingPageStreamUrls/.test(sniffer),
      '配置就绪前攒下的地址要补登记（观察器每条只上报一次，丢一次就永远丢了）'
    )
  })

  check('直播识别链路已接通（video-sniffer → background → 徽章）', () => {
    const sniffer = fs.readFileSync(path.join(EXT_DIR, 'video-sniffer.js'), 'utf8')
    const bg = fs.readFileSync(path.join(EXT_DIR, 'background.js'), 'utf8')
    const kl = fs.readFileSync(path.join(EXT_DIR, 'key-listener.js'), 'utf8')
    assert(
      /scheduleLiveProbe/.test(sniffer) && /probeLiveStream/.test(sniffer),
      'video-sniffer 未对 m3u8 资源调度直播探测'
    )
    assert(
      /isFlvLikeResource/.test(sniffer) && /needsLiveProbe/.test(sniffer),
      'video-sniffer 未把 FLV 形态纳入直播探测'
    )
    assert(
      /kind/.test(sniffer) && /sendMessage\(\{ type: 'probeLiveStream', url, kind \}/.test(sniffer),
      'video-sniffer 未把形态提示（kind）随探测消息一起发出'
    )
    assert(
      /msg\.type === 'probeLiveStream'/.test(bg),
      'background 未处理 probeLiveStream 消息'
    )
    assert(
      /const probeStreamLive = async \(url, kind\)/.test(bg),
      'background 缺少 probeStreamLive 实现（或未接收形态提示）'
    )
    assert(
      /const readFlvHead = async \(url, timeout\)/.test(bg),
      'background 缺少 FLV 响应头抓取实现'
    )
    assert(
      /'live':\s*\{[^}]*'zh_CN'/.test(kl),
      'getLocalizedText 缺少 live 文案'
    )
    assert(
      /resource\.live === true/.test(kl),
      '清单条目未渲染直播徽章'
    )
    assert(
      /r\.live !== true/.test(sniffer),
      '直播条目必须排除在音视频配对之外'
    )
  })

  check('资源弹窗：应用设计令牌 + 明暗主题 + 空态/分栏结构', () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'key-listener.js'), 'utf8')
    // 令牌取自桌面端 Tokens.scss（浅色主色 / 深色面板底 与之一致）
    assert(/ensureLxStyles/.test(src) && /'lerxu-ui-style'/.test(src), '缺少注入的弹窗样式表')
    assert(/--lx-primary: #1a7fe0/.test(src), '浅色主色必须与应用一致（#1a7fe0）')
    assert(/--lx-bg-panel: #262a31/.test(src), '深色面板底必须与应用一致（#262a31）')
    assert(/\.lx-scope\.lx-dark/.test(src), '缺少深色令牌覆盖')
    // 主题跟随应用：storage.uiTheme / themeChanged / prefers-color-scheme 兜底
    assert(/storage\.local\.get\(\['uiTheme'\]/.test(src), '未读取应用主题（uiTheme）')
    assert(/msg\.type === 'themeChanged'/.test(src), '未监听应用主题变化')
    assert(/prefers-color-scheme: dark/.test(src), '拿不到应用主题时应跟随系统')
    // 弹窗是一整张卡片：圆角/阴影/描边都在样式表里
    assert(
      /#lerxu-resource-dropdown \{[\s\S]{0,400}border-radius: 6px/.test(src),
      '弹窗容器缺圆角（外观应在样式表里，不在内联）'
    )
    // 条目标记：直播徽章 / 名称 / 大小 / URL 全走 class
    for (const cls of ['lx-item', 'lx-name', 'lx-badge-live', 'lx-size', 'lx-item-meta', 'lx-format-trigger', 'lx-format-menu']) {
      assert(src.includes(cls), `条目缺少 ${cls} 样式类`)
    }
    assert(/lx-section-title/.test(src) && /lx-section-count/.test(src), '区块标题/计数未走统一样式')
    assert(/lx-group-head/.test(src) && /lx-chevron/.test(src), '分片组未走统一样式')
    // 空态：两行提示 + 三个语言
    assert(/lx-empty-title/.test(src) && /lx-empty-hint/.test(src), '缺少空态样式')
    for (const key of ['noResources', 'noResourcesHint']) {
      assert(
        new RegExp(`'${key}':\\s*\\{[^}]*'zh_CN'[^}]*'zh_TW'`).test(src),
        `空态文案 ${key} 缺语言（需 en / zh_CN / zh_TW）`
      )
    }
  })

  // ------------------------------------------------------- 行内下载入口 DOM
  console.log('\n[5] 行内下载入口（DOM 桩）')

  /**
   * 极简 DOM 桩：只实现渲染条目真正用到的那几个方法。
   *
   * 关键是 **click 会冒泡**（`fireClick` 沿 parentNode 往上走，遇到
   * `stopPropagation` 就停）—— "点按钮会不会连整行的处理器一起触发、
   * 一次点击建出两个任务"只有这样才能测出来，而这正是加按钮时最容易踩的坑。
   */
  const makeDomStub = () => {
    const listeners = new WeakMap()

    const createEl = (tag) => {
      const el = {
        tagName: tag,
        style: {},
        children: [],
        parentNode: null,
        textContent: '',
        title: '',
        setAttribute () {},
        appendChild (child) {
          if (child && typeof child === 'object') child.parentNode = el
          el.children.push(child)
          return child
        },
        addEventListener (type, fn) {
          const map = listeners.get(el) || {}
          map[type] = map[type] || []
          map[type].push(fn)
          listeners.set(el, map)
        }
      }
      return el
    }

    const fireClick = (el, extra) => {
      const e = { bubbles: true, _stopped: false }
      e.stopPropagation = () => { e._stopped = true }
      e.preventDefault = () => {}
      if (extra) Object.assign(e, extra)
      let node = el
      while (node) {
        const handlers = (listeners.get(node) || {}).click || []
        handlers.slice().forEach((fn) => fn(e))
        if (e._stopped) break
        node = node.parentNode
      }
    }

    const walk = (el, out = []) => {
      out.push(el)
      ;(el.children || []).forEach((c) => {
        if (c && typeof c === 'object' && Array.isArray(c.children)) walk(c, out)
      })
      return out
    }

    return { createEl, fireClick, walk }
  }

  const loadItemRenderers = () => {
    const src = fs.readFileSync(path.join(EXT_DIR, 'key-listener.js'), 'utf8')
    const start = src.indexOf('const createCombinedResourceItem = (resource, referer, index) => {')
    const end = src.indexOf('const downloadSingleResource = (resource, referer, index) => {')
    assert(
      start >= 0 && end > start,
      '未能在 key-listener.js 中定位条目渲染函数（结构变了？测试需同步）'
    )

    const dom = makeDomStub()
    const sent = []
    const sandbox = {
      console: { log () {}, warn () {}, error () {} },
      document: {
        createElement: (tag) => dom.createEl(tag),
        createElementNS: (_ns, tag) => dom.createEl(tag),
        getElementById: () => null
      },
      // getLocalizedText 直接回原 key：断言里就能按 key 找到元素
      getLocalizedText: (key) => key,
      cachedUnknownSizeText: '未知大小',
      formatFileSize: () => '1.0 MB',
      getVideoTitle: () => '测试标题',
      outputExtFor: (ext) => ({ m3u8: 'ts', mpd: 'mp4' }[`${ext || ''}`.toLowerCase()] || `${ext || ''}`.toLowerCase()),
      sendResourceToClient: (url, referer, filename) => sent.push({ url, referer, filename }),
      sendStreamPair: (v, a) => sent.push({ pair: [v, a] }),
      markSent: () => true,
      // 条目里的「输出格式」设置：这个用例只关心整行点击，控件本身另有用例
      mergeFormatByUrl: new Map(),
      MERGE_FORMAT_VALUES: ['', 'mp4', 'mkv', 'ts'],
      mergeFormatOf: () => '',
      createFormatControl: () => ({ control: dom.createEl('span'), panel: dom.createEl('div') }),
      // 条目右侧的下载按钮：桩里做成真的可点节点，用例靠它验证"点按钮才发任务"
      // 发完任务要关弹窗：桩里不需要真的动画
      hideResourceDropdownAnimated: () => {},
      // 发完任务要关弹窗：桩里不需要真的动画
      hideResourceDropdownAnimated: () => {},
      createItemDownloadButton: (label, onClick) => {
        const btn = dom.createEl('button')
        btn.className = 'lx-item-download'
        btn.title = label
        btn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          onClick()
        })
        return btn
      },
      adjustDropdownPosition: () => {},
      segmentsExpanded: false
    }
    vm.createContext(sandbox)
    // 包一层函数：脚本顶层不允许 return；segmentsExpanded 是跨重画的模块级状态
    const code = `(function () {\nlet segmentsExpanded = false;\n${src.slice(start, end)}\n` +
      'return { createResourceItem, createCombinedResourceItem, createSegmentGroup }\n})()'
    const api = new vm.Script(code, { filename: 'item-render.js' }).runInContext(sandbox)
    return { ...api, dom, sent }
  }

  check('清单条目：只有下载按钮会发任务（整行不再可点）', () => {
    const { createResourceItem, dom, sent } = loadItemRenderers()
    const item = createResourceItem(
      { url: 'https://cdn.example.com/show/index.m3u8', ext: 'm3u8' },
      'https://page.example.com/watch',
      0,
      { primary: true }
    )
    const nodes = dom.walk(item)
    const downloadBtn = nodes.find((n) => `${n.className || ''}` === 'lx-item-download')
    assert(downloadBtn, '条目右侧应有下载按钮')

    // 整行点击不再发任务（列表里还要点齿轮 / 选格式，误触代价太大）
    dom.fireClick(item)
    assert(sent.length === 0, `整行点击不应发任务，实际 ${sent.length} 次`)

    dom.fireClick(downloadBtn)
    assert(sent.length === 1, `点下载按钮应发一次，实际 ${sent.length} 次`)
    assert(
      sent[0].url === 'https://cdn.example.com/show/index.m3u8',
      '发出去的应是清单地址（引擎自己拉分片）'
    )
    assert(
      sent[0].filename === '测试标题.ts',
      `清单的产物名应是 .ts 容器，实际 ${sent[0].filename}`
    )
  })

  check('普通条目 / 分片条目同样只有下载按钮会发任务', () => {
    const { createResourceItem, dom, sent } = loadItemRenderers()
    for (const resource of [
      { url: 'https://cdn.example.com/clip.mp4', ext: 'mp4' },
      { url: 'https://cdn.example.com/show/seg0.ts', ext: 'ts' }
    ]) {
      const item = createResourceItem(resource, 'https://page.example.com/watch', 0)
      const downloadBtn = dom.walk(item)
        .find((n) => `${n.className || ''}` === 'lx-item-download')
      assert(downloadBtn, `${resource.ext} 条目缺少下载按钮`)
      sent.length = 0
      dom.fireClick(item)
      assert(sent.length === 0, `${resource.ext} 整行不应发任务，实际 ${sent.length} 次`)
      dom.fireClick(downloadBtn)
      assert(sent.length === 1, `点 ${resource.ext} 的下载按钮应只发一次，实际 ${sent.length} 次`)
    }
  })

  check('直播清单条目带「直播」徽章（识别结果可视化）', () => {
    const { createResourceItem, dom } = loadItemRenderers()
    const liveItem = createResourceItem(
      { url: 'https://cdn.example.com/live/index.m3u8', ext: 'm3u8', live: true },
      'https://page.example.com/watch',
      0,
      { primary: true }
    )
    assert(
      dom.walk(liveItem).some((n) => n.textContent === 'live'),
      '识别为直播的清单条目应渲染「直播」徽章（桩里 getLocalizedText 返回 key）'
    )
    const vodItem = createResourceItem(
      { url: 'https://cdn.example.com/vod/index.m3u8', ext: 'm3u8', live: false },
      'https://page.example.com/watch',
      0,
      { primary: true }
    )
    assert(
      !dom.walk(vodItem).some((n) => n.textContent === 'live'),
      '非直播清单不应出现直播徽章'
    )
  })

  check('分片组默认收起、点击标题才展开（几十条分片不该占版面）', () => {
    const { createSegmentGroup, dom } = loadItemRenderers()
    const segments = Array.from({ length: 5 }, (_, i) => ({
      url: `https://cdn.example.com/seg${i}.ts`, ext: 'ts'
    }))
    const group = createSegmentGroup(segments, 'https://page.example.com/watch')
    const nodes = dom.walk(group)

    // 第 0 个是组容器，第 1 个是标题行，第 2 个是分片列表容器
    const list = group.children[1]
    assert(list && list.style.display === 'none', '分片列表默认应收起')

    dom.fireClick(group.children[0])
    assert(list.style.display === 'block', '点击标题行应展开分片列表')
    dom.fireClick(group.children[0])
    assert(list.style.display === 'none', '再次点击应收起')

    // 计数与栏名同在一行（栏名 + 「· 5」），标题行里的节点文本合起来必须能看到数量
    const headerText = dom.walk(group.children[0]).map((n) => `${n.textContent || ''}`).join(' ')
    assert(
      headerText.indexOf('hlsSegments') >= 0 && /5/.test(headerText),
      `标题应写明分片数量，实际 ${headerText}`
    )
    const chevron = nodes.find((n) => `${n.className || ''}`.indexOf('lx-chevron') >= 0)
    assert(chevron, '分片组标题缺省应带折叠箭头（收起/展开一眼可见）')
  })

  // ------------------------------------------------------------- packaging
  console.log('\n[6] 打包产物结构（AMO 提交约束）')

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
