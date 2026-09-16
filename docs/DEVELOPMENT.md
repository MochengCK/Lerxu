# 开发文档

面向**贡献者与维护者**。普通用户请直接看 [README](../README-CN.md)。

- [仓库结构](#仓库结构)
- [桌面应用](#桌面应用)
- [下载引擎回填](#下载引擎回填)
- [Android 客户端](#android-客户端)
- [浏览器扩展](#浏览器扩展)
- [持续集成](#持续集成)

## 仓库结构

```
Lerxu/
├── src/                        # 桌面应用（Electron + Vue 3）
│   ├── main/                   # 主进程：引擎生命周期、任务管理、配置、IPC
│   ├── renderer/               # 渲染进程：界面与交互
│   └── shared/                 # 共享模块（含引擎协议适配层 xferrust/）
├── extra/<平台>/engine/        # 各平台内置的引擎二进制（随仓库分发）
├── extensions/lerxu-webextension/lerxu-webextension/   # 浏览器扩展源码（Chromium + Firefox）
├── Android/                    # Android 客户端（Kotlin + Compose）
├── scripts/                    # 构建脚本（扩展打包等）
├── test/                       # 运行时测试（engine / app / extension）
├── build/                      # electron-builder 钩子与平台图标
└── .github/workflows/          # CI（测试）与 Release（发版）
```

`XferRust/`（引擎源码）是**独立仓库**，以嵌套目录形式存在于本地但不在本仓库的版本控制内。

## 桌面应用

前置要求：Node.js v22.12.0+、npm、Git。

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（热重载）
npm run build        # 构建安装包（输出到 release/）
npm run build:dir    # 只构建 unpacked 目录（CI 用于运行时测试）
npm run lint         # ESLint（error 级别会阻断 CI）
npm run lint:workflows   # 校验 GitHub Actions 工作流（见「工作流校验」）
```

**ESLint 规则分级**：`error` 只保留能发现真实缺陷的规则（`no-undef`、`no-dupe-keys`、
`vue/no-ref-as-operand`、`no-empty`（允许空 catch）等——它们已实际抓出过未声明变量、
跨文件变量误用、computed 未取 `.value`、对象重复键等问题）；纯排版类规则
（`indent`、`vue/script-indent`、`no-unused-vars`）为 `warn`：项目各文件的 `<script>`
缩进基准本就不统一，强制 error 会让 CI 永远为红。如需统一风格：
`npx eslint --ext .js,.vue src --fix`，再逐条收紧规则。

## 工作流校验

`.github/workflows/*.yml` 的错误分两类：YAML 语法错误（`js-yaml` 能发现）与
**表达式语义错误**（YAML 合法但 GitHub 拒绝），例如：

- `secrets` 上下文出现在 `if:` 条件中 → `Unrecognized named-value: 'secrets'`
- 上下文名拼写错误、`uses` 未固定版本

`npm run lint:workflows`（`scripts/check-workflows.js`）按 GitHub 的上下文可用性表
校验所有 `if:` 条件与 `${{ }}` 表达式，并检查 `uses` 是否带版本标签。已接入
`lint-and-typecheck` job，可提前拦截这类只有保存/运行时才会暴露的问题。

## 下载引擎回填

应用**不编译引擎**，各平台引擎二进制随仓库分发。引擎升级后需按平台逐一回填：

| 平台 | 回填路径 |
| --- | --- |
| macOS Intel | `extra/darwin/x64/engine/xferrust` |
| macOS Apple Silicon | `extra/darwin/arm64/engine/xferrust` |
| Linux x64 | `extra/linux/x64/engine/xferrust` |
| Linux arm64 | `extra/linux/arm64/engine/xferrust` |
| Windows x64 | `extra/win32/x64/engine/xferrust.exe` |
| Android arm64 | `Android/app/src/main/assets/xferrust` **与** `Android/app/src/main/jniLibs/arm64-v8a/libxferrust.so` |

注意事项：

- **Android 两份副本必须同字节**：客户端以「文件大小」作版本指纹（`filesDir/xferrust.version`），两处不一致会导致每次启动都重复提取引擎
- **Android 必须是 aarch64 ELF**：`abiFilters` 只打包 `arm64-v8a`，x86 / armeabi 引擎会被安装器拒绝
- 桌面端回填后重启应用即生效；Android 需重新打包 APK
- 引擎在 macOS / Linux / Windows / Android 上的构建方式见引擎仓库（`XferRust/.github/RELEASE_*.md`）；本机通常只能构建当前平台的二进制，其余平台由引擎仓库的 CI 产出

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

**签名**（可选）：`app/build.gradle.kts` 支持由环境变量驱动的正式签名，未配置时产出未签名 APK：

```bash
ANDROID_KEYSTORE_PATH=/path/to/release.keystore \
ANDROID_KEYSTORE_PASSWORD=*** \
ANDROID_KEY_ALIAS=*** \
ANDROID_KEY_PASSWORD=*** \
  ./gradlew :app:assembleRelease      # → app-release.apk（已签名）
```

**单元测试**（`Android/app/src/test/`，随 CI 执行）：

- `EngineBinaryTest`：引擎二进制完整性——两份副本同字节、ELF 头（64 位小端 AArch64）、体积下限、关键能力字符串（防止回填旧引擎或错误架构）
- `FormatUtilsTest`：进度 / 速度 / 时长格式化与任务状态配色的边界值

## 浏览器扩展

扩展主体代码在两个平台完全一致（统一 `chrome.*` 回调风格 + `firefox-compat.js` 兼容层），差异只在清单：

| 差异点 | Chromium（Chrome / Edge / Opera） | Firefox |
| --- | --- | --- |
| 后台形态 | `background.service_worker`（单文件 SW） | `background.scripts`（event page，**Firefox 不支持 MV3 的 `service_worker`**） |
| 扩展 ID | 不需要（商店分配） | MV3 必需 `browser_specific_settings.gecko.id` |
| 专有权限 | 含 `downloads.ui`（下载气泡控制） | 不含（Firefox 无此权限） |
| `downloads.onDeterminingFilename` | 支持（写盘前介入） | 不支持 → 走 `downloads.onCreated` 路径（功能等价） |
| `downloads.setUiOptions` | 支持 | 不支持 → 跳过气泡控制 |
| 数据收集声明 | 不需要 | 必需 `gecko.data_collection_permissions`（2025-11-03 起 AMO 对新扩展强制要求） |

构建、打包、测试与 AMO 提交的完整说明见 **[扩展开发说明](../extensions/lerxu-webextension/README.md)**；
AMO 上架文案（名称 / 概述 / 描述 / 审核员说明）见 [AMO-LISTING.md](../extensions/lerxu-webextension/AMO-LISTING.md)。

## 持续集成

两个工作流共用一个原则：**引擎二进制随仓库分发，CI 不编译引擎**，因此每个工作流都先校验引擎产物，再构建、测试。

### CI Tests（`.github/workflows/main.yml`）

| Job | 运行环境 | 覆盖内容 |
| --- | --- | --- |
| `lint-and-typecheck` | ubuntu | ESLint、`package.json` / electron-builder 配置校验、**全部引擎产物完整性**（桌面 5 个 + Android 2 个：存在性、同字节、架构） |
| `build-and-test` | ubuntu / windows / macos | 构建 unpacked 应用 → 引擎运行时测试（RPC 探活、HTTP 下载、BT 本地 swarm 闭环）→ 应用冒烟测试（启动应用 → 引擎子进程 → RPC 鉴权 → 经应用引擎完成一次 HTTP 下载） |
| `android-build-and-test` | ubuntu | 引擎校验（aarch64 / 同字节 / 能力字符串）→ 单元测试 → lint → 构建 debug + release APK → 校验 APK 内已打进引擎且 ABI 仅 `arm64-v8a` → 上传 APK |
| `extension-test` | ubuntu | 双平台清单校验（Firefox 不支持 `service_worker`、必需 `gecko.id`、不得含 Chromium 专有权限、必需数据收集声明）→ 兼容层行为测试（回调包装 / `runtime.lastError` / 事件对象不被包装 / 幂等）→ 归档结构校验（根级 `manifest.json`、无 macOS 元数据、无开发脚本）→ 构建并 `web-ext lint`（errors 必须为 0） |
| `test-report` | ubuntu | 汇总各 job 结果 |

触发条件：推送到 `main` / `develop`、PR 到 `main`、每周一 6:00 定时全量、手动触发。

### Release（`.github/workflows/release.yml`）

推送到 `main` 时构建全部平台的正式产物，测试通过后统一上传到同一草稿 Release：

- 桌面三平台（ubuntu / windows / macos）：`.exe`、`.dmg`、`.zip`、`.AppImage`、`.deb`
- Android（ubuntu）：`app-debug.apk`、`app-release-unsigned.apk`（配置签名 secrets 时为已签名 APK）
- 浏览器扩展（ubuntu）：`lerxu-webextension-firefox-<版本>.zip` / `.xpi`、`lerxu-webextension-chromium-<版本>.zip`
- 两个工作流共用 `app-tests` 复合 Action 执行引擎与应用运行时测试；任一测试失败则产物不上传

**Android 签名 secrets**（可选，未配置时产出未签名 APK）：

`ANDROID_KEYSTORE_BASE64`（keystore 文件内容 base64）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。

> ⚠️ **`secrets` 上下文不能出现在 `if:` 条件中**——GitHub 会直接报
> `Unrecognized named-value: 'secrets'`（`if` 的可用上下文只有
> github / needs / strategy / matrix / job / runner / env / vars / steps / inputs）。
> 需要按凭据是否存在分支时，应把 secret 注入 job 级 `env`，再在步骤内用 shell 判断：
>
> ```yaml
> jobs:
>   android:
>     env:
>       KEY_B64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
>     steps:
>       - name: Decode keystore (optional)
>         run: |
>           if [ -z "$KEY_B64" ]; then echo "未配置，跳过签名"; exit 0; fi
>           printf '%s' "$KEY_B64" | base64 -d > "$RUNNER_TEMP/release.keystore"
>           echo "ANDROID_KEYSTORE_PATH=$RUNNER_TEMP/release.keystore" >> "$GITHUB_ENV"
> ```
>
> 这类错误 YAML 本身合法、本地 `js-yaml` 解析不出来，因此由 `scripts/check-workflows.js`
> （`npm run lint:workflows`）把关：它按 GitHub 的上下文可用性表校验所有 `if:` 条件与
> `${{ }}` 表达式，并已接入 `lint-and-typecheck` job。
