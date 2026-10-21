# 开发文档

[English](./DEVELOPMENT.en.md)

面向贡献者与维护者。普通用户请直接看 [README](../README-CN.md)。

- [仓库结构](#仓库结构)
- [桌面应用](#桌面应用)
- [运行时测试](#运行时测试)
- [Android 客户端](#android-客户端)
- [浏览器扩展](#浏览器扩展)
- [持续集成](#持续集成)

## 仓库结构

```
Lerxu/
├── src/                  # 桌面应用（Electron + Vue 3）
│   ├── main/             # 主进程：窗口、任务、配置、IPC
│   ├── renderer/         # 渲染进程：界面与交互
│   └── shared/           # 主/渲染共享的工具、常量与语言包
├── Android/              # Android 客户端（Kotlin + Compose）
├── extensions/           # 浏览器扩展源码（Chromium + Firefox）
├── extra/                # 随安装包分发的各平台运行时二进制
├── test/                 # 运行时测试
├── scripts/              # 构建与校验脚本
├── build/                # electron-builder 钩子与平台图标
├── docs/                 # 开发文档
└── .github/workflows/    # CI 与发版流水线
```

桌面端、Android 客户端与浏览器扩展同在本仓库；`extra/` 中的运行时二进制随仓库分发，不在本仓库编译。

## 桌面应用

前置要求：Node.js 22.12.0+、npm、Git。

```bash
npm install                 # 安装依赖
npm run dev                 # 开发模式（热重载）
npm run build               # 构建当前平台安装包（输出到 release/）
npm run build:dir           # 只构建 unpacked 目录
npm run build:github        # 只构建前端产物（CI 用）
npm run build:applesilicon  # 构建 macOS arm64
npm run preview             # 本地预览已构建产物
npm run lint                # ESLint
npm run lint:fix            # ESLint 自动修复
npm run lint:workflows      # 校验 .github/workflows
```

**ESLint 分级**：`error` 只保留能发现真实缺陷的规则（`no-undef`、`no-dupe-keys`、
`vue/no-ref-as-operand` 等）；排版类（`indent`、`vue/script-indent`、`no-unused-vars`）为 `warn` ——
各文件 `<script>` 的缩进基准并不统一，强制 error 会让 CI 长期为红。需要统一格式时执行
`npx eslint --ext .js,.vue src --fix`，再逐条收紧。

**工作流校验**：`scripts/check-workflows.js` 按 GitHub 的上下文可用性表校验所有 `if:` 条件与
`${{ }}` 表达式，并检查 `uses` 是否带版本。YAML 语法合法但被 GitHub 拒绝的写法（例如在 `if:` 中
使用 `secrets`）由它拦截，已接入 `lint-and-typecheck` job。

## 运行时测试

测试脚本均为纯 Node、零依赖，可直接执行。

| 脚本 | 覆盖 |
| --- | --- |
| `npm run test:extension` | 浏览器扩展：双平台清单差异、兼容层行为、归档结构 |
| `npm run test:taskpair` | 音视频配对：同一 pairId 只出一条记录，进度按两条流合并 |
| `npm run test:mergeinput` | 合并输入占用判定，避免同一文件被重复合并 |
| `npm run test:playback` | 播放链路：分片服务与媒体拼接 |
| `npm run test:packaging` | 打包产物完整性：各平台随包资源是否齐全 |

应用级冒烟测试（启动打包后的应用、完成一次 HTTP 下载）由 CI 的 `app-tests` 复合 Action 在三个
桌面平台上执行。

## Android 客户端

前置要求：JDK 17、Android SDK（`platforms;android-35`、`build-tools;35.0.0`、`platform-tools`），
并在 `Android/local.properties` 中写入 `sdk.dir=<SDK 路径>`（该文件不入库）。

```bash
cd Android
JAVA_HOME=<jdk17 路径> ./gradlew :app:assembleDebug :app:assembleRelease   # 产出 APK
JAVA_HOME=<jdk17 路径> ./gradlew :app:testDebugUnitTest                   # 单元测试
JAVA_HOME=<jdk17 路径> ./gradlew :app:lintDebug                           # 静态检查
```

产物路径：`Android/app/build/outputs/apk/{debug,release}/*.apk`

**签名**（可选）：`app/build.gradle.kts` 从环境变量读取签名信息，未配置时产出未签名 APK。

```bash
ANDROID_KEYSTORE_PATH=/path/to/release.keystore \
ANDROID_KEYSTORE_PASSWORD=*** \
ANDROID_KEY_ALIAS=*** \
ANDROID_KEY_PASSWORD=*** \
  ./gradlew :app:assembleRelease
```

**单元测试**（`Android/app/src/test/`，随 CI 执行）：

- `FormatUtilsTest`：进度、速度、时长格式化与任务状态配色的边界值
- 内置浏览器与界面状态机：`AdBlockerTest`、`BrowseHistoryTest`、`BrowserRulesTest`、`StartPageTest`、
  `DockFollowTest`、`TabCardMotionTest`、`TabPersistenceTest`
- 媒体与更新：`HlsManifestFixerTest`、`MediaProbeTest`、`VideoSnifferPickTest`、`AppUpdateTest`、
  `ReleaseNotesTest`、`StatPollingTest`、`AppPageBackTest`

### CI 中的 Android SDK 准备

`.github/actions/android-sdk`（composite action）供两个工作流的 Android job 复用：定位 runner 预装的
SDK、接受许可、安装 `platform-tools` / `platforms;android-<API>` / `build-tools;<版本>`，并把
`ANDROID_SDK_ROOT` / `ANDROID_HOME` 导出给 Gradle（`Android/local.properties` 不入库，Gradle 靠环境
变量定位 SDK）。

未直接使用 `android-actions/setup-android@v3`：该 action 会执行 `sdkmanager tools`，而 Google 已从 SDK
仓库移除 `tools` 包，于是直接失败。维护该 action 时有两个必须守住的写法（已纳入
`npm run lint:workflows`）：

1. **包名含分号必须加引号**：`sdkmanager --install platforms;android-35` 中的 `;` 是 shell 元字符，
   即使没有空格也会分隔命令，必须写成 `--install "platforms;android-35"`（`build-tools;35.0.0` 同理）。
2. **变量紧邻非 ASCII 字符必须写 `${VAR}`**：非 UTF-8 locale 下 bash 会把中文字节并入变量名
   （`$API、` 被解析为变量 `API、`），配合 `set -u` 直接报 `unbound variable`。

## 浏览器扩展

扩展代码在两个平台完全一致（统一的 `chrome.*` 回调风格 + `firefox-compat.js` 兼容层），差异只在清单：

| 差异点 | Chromium（Chrome / Edge / Opera） | Firefox |
| --- | --- | --- |
| 后台形态 | `background.service_worker` | `background.scripts`（event page，Firefox 不支持 MV3 的 `service_worker`） |
| 扩展 ID | 不需要（商店分配） | MV3 必需 `browser_specific_settings.gecko.id` |
| 专有权限 | 含 `downloads.ui`（下载气泡控制） | 不含（Firefox 无此权限） |
| `downloads.onDeterminingFilename` | 支持（写盘前介入） | 不支持，走 `downloads.onCreated` 路径（功能等价） |
| `downloads.setUiOptions` | 支持 | 不支持，跳过气泡控制 |
| 数据收集声明 | 不需要 | 必需 `gecko.data_collection_permissions`（AMO 对新扩展强制要求） |

构建、打包、测试与 AMO 提交见 [扩展开发说明](../extensions/lerxu-webextension/README.md)，上架文案见
[AMO-LISTING.md](../extensions/lerxu-webextension/AMO-LISTING.md)。

## 持续集成

工作流都遵循同一顺序：先校验配置与随包产物，再构建与测试。

### CI Tests（`.github/workflows/main.yml`）

| Job | 运行环境 | 覆盖内容 |
| --- | --- | --- |
| `lint-and-typecheck` | ubuntu | ESLint、工作流校验、`package.json` / electron-builder 配置、随包二进制完整性（存在性、同字节、架构） |
| `build-and-test` | ubuntu / windows / macos | 构建 unpacked 应用 → 运行时测试（应用启动、本地 RPC 鉴权、HTTP 下载闭环），失败时上传日志 |
| `android-build-and-test` | ubuntu | 单元测试 → lint。不构建 APK（发版用的已签名 APK 由 release.yml 产出） |
| `extension-test` | ubuntu | 双平台清单校验 → 兼容层行为 → 归档结构 → 构建并执行 `web-ext lint`（errors 必须为 0） |
| `test-report` | ubuntu | 汇总各 job 结果 |

触发条件：推送到 `main` / `develop`、PR 到 `main`、每周一定时全量、手动触发。

### Release（`.github/workflows/release.yml`）

推送到 `main` 时构建全部平台的正式产物，测试通过后统一上传到同一草稿 Release：

- 桌面三平台：`.exe`、`.dmg`、`.zip`、`.AppImage`、`.deb`
- Android：仅 `app-release.apk`（已签名；未配置签名凭据会直接失败）
- 浏览器扩展：`lerxu-webextension-firefox-<版本>.zip` / `.xpi`、`lerxu-webextension-chromium-<版本>.zip`

**Android 签名 secrets**（必需，缺失则 android job 失败）：`ANDROID_KEYSTORE_BASE64`（keystore 内容的
base64）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。

**`secrets` 不能出现在 `if:` 条件中**：GitHub 会报 `Unrecognized named-value: 'secrets'`（`if` 只允许
github / needs / strategy / matrix / job / runner / env / vars / steps / inputs）。需要按凭据是否存在
分支时，把 secret 注入 job 级 `env`，再在步骤内用 shell 判断。
