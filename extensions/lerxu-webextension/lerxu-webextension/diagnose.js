/**
 * 扩展语言同步快速诊断脚本
 * 
 * 使用方法:
 * 1. 右键点击扩展图标,选择"检查"
 * 2. 在 Console 中粘贴并运行此脚本
 * 3. 查看输出的诊断信息
 */

(async function diagnose() {
  console.log('=== 扩展语言同步诊断 ===\n')
  
  // 1. 检查 Storage 中的语言配置
  console.log('1️⃣ 检查 Storage 配置:')
  const storage = await new Promise((resolve) => {
    chrome.storage.local.get(null, resolve)
  })
  console.log('  - clientLocale:', storage.clientLocale || '❌ 未设置')
  console.log('  - browserLocale:', storage.browserLocale || '❌ 未设置')
  console.log('  - 完整 Storage:', storage)
  console.log('')
  
  // 2. 检查客户端 API
  console.log('2️⃣ 检查客户端 API:')
  try {
    const response = await fetch('http://127.0.0.1:16900/lerxu/locale')
    if (response.ok) {
      const data = await response.json()
      console.log('  ✅ 客户端已连接')
      console.log('  - 返回数据:', data)
      console.log('  - 客户端语言:', data.locale)
    } else {
      console.log('  ❌ API 响应异常:', response.status)
    }
  } catch (e) {
    console.log('  ❌ 无法连接客户端:', e.message)
    console.log('  请确保 Lerxu 客户端正在运行')
  }
  console.log('')
  
  // 3. 检查当前使用的语言
  console.log('3️⃣ 检查当前语言:')
  if (typeof currentLocale !== 'undefined') {
    console.log('  - currentLocale:', currentLocale)
  } else {
    console.log('  ❌ currentLocale 未定义 (i18n.js 可能未加载)')
  }
  console.log('  - 浏览器 UI 语言:', chrome.i18n.getUILanguage())
  console.log('')
  
  // 4. 测试翻译函数
  console.log('4️⃣ 测试翻译函数:')
  if (typeof t === 'function') {
    console.log('  ✅ t() 函数可用')
    console.log('  - t("popupTitle"):', t('popupTitle'))
    console.log('  - t("connected"):', t('connected'))
  } else {
    console.log('  ❌ t() 函数不可用')
  }
  console.log('')
  
  // 5. 手动触发同步并查看结果
  console.log('5️⃣ 手动触发语言同步:')
  const syncResult = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'syncLocale' }, resolve)
  })
  console.log('  - 同步结果:', syncResult)
  
  // 等待一下让 storage 更新
  await new Promise(resolve => setTimeout(resolve, 500))
  
  const newStorage = await new Promise((resolve) => {
    chrome.storage.local.get(['browserLocale', 'clientLocale'], resolve)
  })
  console.log('  - 同步后的 browserLocale:', newStorage.browserLocale)
  console.log('  - 同步后的 clientLocale:', newStorage.clientLocale)
  console.log('')
  
  // 6. 给出诊断结论
  console.log('6️⃣ 诊断结论:')
  
  if (!newStorage.browserLocale) {
    console.log('  ❌ 问题: browserLocale 未设置')
    console.log('  原因: 语言同步失败')
    console.log('  解决: 确保客户端正在运行,然后重新加载扩展')
  } else if (newStorage.browserLocale === 'zh_CN' && storage.clientLocale === 'en-US') {
    console.log('  ❌ 问题: Storage 中存储的语言与客户端不一致')
    console.log('  当前 browserLocale:', newStorage.browserLocale)
    console.log('  客户端语言应该是: en')
    console.log('  解决: 重新加载扩展')
  } else if (newStorage.browserLocale !== 'en' && newStorage.clientLocale === 'en-US') {
    console.log('  ❌ 问题: 语言映射错误')
    console.log('  客户端是 en-US,应该映射为 en')
    console.log('  但实际 browserLocale 是:', newStorage.browserLocale)
  } else if (newStorage.browserLocale === 'en') {
    console.log('  ✅ Storage 配置正确: browserLocale = en')
    console.log('  但界面仍显示中文,问题可能是:')
    console.log('    1. 页面缓存,尝试刷新页面')
    console.log('    2. initI18n() 未正确执行')
    console.log('')
    console.log('  尝试手动刷新界面:')
    console.log('  location.reload()')
  }
  
  console.log('\n=== 诊断完成 ===')
})()
