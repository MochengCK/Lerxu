const { join } = require('node:path')
const { notarize } = require('@electron/notarize')
const { appId } = require('../electron-builder.json')

exports.default = async function (context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  const skipNotarize = process.env.SKIP_NOTARIZE
  if (skipNotarize === 'true') {
    console.log('Skipping notarize')
    return
  }

  // 本地构建时可选加载 .env（dotenv 不在 dependencies 中，仅作为开发便利）
  try {
    require('dotenv').config()
  } catch (e) {
    // dotenv 未安装时忽略——CI 环境变量直接注入
  }

  const appBundleId = appId
  const appName = context.packager.appInfo.productFilename
  const appPath = join(appOutDir, `${appName}.app`)

  try {
    await notarize({
      tool: 'notarytool',
      appBundleId,
      appPath,
      teamId: process.env.TEAM_ID,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD
    })
  } catch (error) {
    console.error(error)
  }

  console.log(`Done notarizing ${appId}`)
}
