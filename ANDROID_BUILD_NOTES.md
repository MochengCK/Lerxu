# Android APK 构建说明

## 当前状态

**调试版本（Debug APK）：**  
`Android/app/build/outputs/apk/debug/app-debug.apk` (35MB) - 2024-09-18 17:42

**发布版本（Release APK）：**  
`Android/app/build/outputs/apk/release/app-release.apk` (17MB) - 2024-09-17 12:40

## 最新的修改内容

### ✅ 1. 无痕窗口密码验证增强

每次退出无痕模式或重启应用时都需要重新认证：

- **新增文件：** `PasswordAuthHelper.kt`
  - 使用 Android KeyStore 安全存储密钥
  - 支持生物识别（指纹/面部识别）
  - 认证失败后可选择简单确认作为备选
  
- **新增文件：** `IncognitoAuthChecker.kt`
  - 定期检查无痕模式是否过期
  - 自动禁用已过期的无痕模式会话

- **修改文件：** `BrowserController.kt`
  - 添加 `incognitoLastAuthTime` 记录最后认证时间
  - 设置 `INCOCOGNITO_AUTH_DURATION = 0L` 表示立即过期

- **修改文件：** `BrowserScreen.kt`
  - 在无痕模式对话框中集成密码验证
  - 认证成功后记录时间戳

### ✅ 2. 浏览器界面优化

- 标签页关闭按钮移至左下角并提高可见度
- 顶部中间添加了窗口模式切换按钮（普通窗口/无痕窗口）
- 移除了左上角的下载页文字说明
- 修复了标签页动画闪烁问题

### ✅ 3. 依赖更新

```kotlin
// app/build.gradle.kts
implementation("androidx.biometric:biometric:1.1.0")
```

## 重新构建步骤

由于系统 Java 配置问题，如果需要使用最新代码重新构建，请在正确的开发环境中执行：

### 方法 1: 使用 Gradle Wrapper（推荐）

```bash
cd /Users/zzzz/Documents/Lerxu/Android

# Debug 版本
./gradlew assembleDebug

# Release 版本（需要签名配置）
./gradlew assembleRelease
```

### 方法 2: 使用命令行参数

```bash
cd /Users/zzzz/Documents/Lerxu/Android

# 清理并重新构建
./gradlew clean assembleDebug --no-daemon
```

### 构建产物位置

- **Debug APK:** `app/build/outputs/apk/debug/app-debug.apk`
- **Release APK:** `app/build/outputs/apk/release/app-release.apk`

## 安装测试

### 通过 ADB 安装

```bash
# 连接设备后
adb install -r ./Android/app/build/outputs/apk/debug/app-debug.apk
```

### 直接传输到设备

将 APK 文件复制到 Android 设备，然后使用文件管理器安装。

## 功能验证

安装后可以测试以下功能：

1. **无痕模式密码验证：**
   - 打开浏览器 → 点击右上角窗口模式按钮
   - 选择"无痕窗口" → 显示生物识别/密码验证对话框
   - 验证成功后进入无痕模式
   
2. **自动退出认证：**
   - 进入无痕模式后浏览网页
   - 退出无痕模式（关闭网格或切换回普通窗口）
   - 再次尝试进入无痕模式 → 必须重新认证

3. **重启应用验证：**
   - 完全关闭应用
   - 重新启动应用
   - 尝试进入无痕模式 → 必须重新认证

4. **界面优化验证：**
   - 标签页网格中，关闭按钮位于左下角
   - 顶部中间有窗口模式切换按钮
   - 关闭动画流畅无闪屏

## 已知问题

### 系统 Java 环境

当前开发机器上 Java 环境配置有问题，无法本地编译。请使用：

- JDK 17 (Temurin)
- Android SDK API 35
- Gradle 8.x

### Biometric Prompt

生物识别验证功能依赖设备的硬件支持：
- iPhone X 及以上（Face ID）
- Android 6.0+ 设备（指纹/面部识别）

如果设备不支持，用户将被提示错误信息。

## 提交建议

完成构建后，建议：

1. ✅ 更新版本号（`package.json` 和 `build.gradle.kts`）
2. ✅ 在 Release Notes 中添加本次更新内容
3. ✅ 上传到测试渠道（TestFlight / Firebase App Distribution）
4. ✅ 进行完整的功能测试
5. ✅ 考虑添加 ProGuard/R8 混淆规则（生产版本）

## 联系人

如有问题，请联系开发者或查看项目文档。

---

**最后更新：** 2024-09-18
**版本：** v3.2.0-Beta1
