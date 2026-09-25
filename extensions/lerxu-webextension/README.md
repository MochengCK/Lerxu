# Lerxu 浏览器扩展（Chromium + Firefox）

面向维护者。**用户**的安装步骤在随包分发的离线指南里（`安装指南-中文.txt` /
`Installation-Guide-English.txt` / `インストールガイド-日本語.txt` / `설치-가이드-한국어.txt`），
应用 [README](../../README-CN.md) 里只有一条功能介绍。

源码目录：`lerxu-webextension/`

## ⚠️ 打包请用构建脚本，不要手动压缩

直接在 `lerxu-webextension/` 上「右键 → 压缩」会得到**错误结构**的包：内层多一层
`lerxu-webextension/` 目录，macOS 还会写入 `__MACOSX/`、`._*` 元数据。AMO 会依次报：

- `No manifest.json was found at the root of the extension`（扩展文件必须在归档**根目录**）
- `Hidden file flagged`（macOS 元数据）
- `Flagged file type found`（打包时混进了 `.py` 之类的开发脚本）

构建脚本用**显式白名单**（`INCLUDE_FILES` / `INCLUDE_DIRS`）复制文件，并额外拦下
`.py`、`.map`、`__MACOSX/`、`._*`、`.DS_Store`，因此上面三种情况不可能出现在产物里；
往扩展里加新文件时必须同时加进白名单，否则不会被打包。

## 模块构成

两份清单引用的是同一套源码，加载图如下（`firefox-compat.js` 在每一处都**首个加载**）：

| 文件 | 位置 | 职责 |
| --- | --- | --- |
| `firefox-compat.js` | 全部三处 | 兼容层：把仅有 `browser.*` 的环境包装成回调风格 `chrome.*`，并暴露 `globalThis.LERXU_ENV` |
| `background.js` | 后台 | 与 `127.0.0.1:16900` 上的 Lerxu 应用通信、下载接管与写盘前改名、右键菜单、下载气泡控制 |
| `video-sniffer.js` | content script | 页面侧媒体嗅探（含 DASH），产出 video / audio / m4s / combined 四类资源 |
| `key-listener.js` | content script（popup 也引） | 页面侧 UI：悬浮资源按钮与资源下拉框、合集下载按钮与弹窗、多语言同步 |
| `download-interceptor.js` | content script | 下载链接接管（排除站点 / 类型、快捷键临时放行） |
| `popup.html` / `popup.js` / `i18n.js` | 扩展弹窗 | RPC 地址、连接状态、客户端版本、上下行速度，以及「排除当前站点」快捷按钮；`i18n.js` 为弹窗内嵌的多语言表（清单 i18n 另见 `_locales/`） |
| `_locales/{en,zh_CN,zh_TW}/messages.json` | 清单 i18n | 扩展名称 / 描述 / 按钮标题（清单里用 `__MSG_*__` 引用） |
| `icons/`、`Installation-Guide-*.txt`、`安装指南-中文.txt` 等 | 随包资源 | 图标与四种语言的离线安装指南 |

> `icons/` 下的 4 个 PNG 由 `scripts/generate-extension-icons.py` 生成（几何绘制 + 16 倍超采样降采样），
> 改图标请改脚本再重跑 `python3 scripts/generate-extension-icons.py`，不要直接手改 PNG；
> `--preview` 会另出一张浅底/深底对比图，便于确认小尺寸下是否还认得出。

> 另有 `dash-sniffer.js` 与 `diagnose.js` 两个文件随包分发，但**两份清单都没有引用它们**：
> 前者是早期的 DASH 嗅探实现（能力已并入 `video-sniffer.js`），后者是手动粘贴到扩展
> 控制台里排查语言同步的调试脚本。它们不参与运行，改动功能时不必看这两处。

### 音视频配对协议（扩展 ↔ 应用）

DASH 站点的画面流与声音流是两个独立下载任务，应用要在两者都下完后用 ffmpeg 合成一个文件。
"哪两个文件是一对"由扩展**显式声明**，不靠文件名猜：

- 扩展把一对流交给 `sendStreamPair`（`key-listener.js`）统一发送：两条消息带**同一个
  `pairId`**，各自的 `pairRole` 为 `video` / `audio`；
- 配对信息走**消息字段**而不是请求头 —— 应用只从 `headers` 里挑出
  `User-Agent` / `Cookie` / `Authorization`，其余一律丢弃，塞进 headers 收不到；
- 链路：`key-listener` → `background.js` 的 `addUriFromContent` → `Application.js`
  `_handleExtensionAdd`（放进 taskPayload）→ 渲染进程 `addUri` **写进任务历史** →
  下载完成时 `EngineClient.vue` 按 `pairId` 配对合并。写历史是必需的：完成事件触发时
  任务可能已被引擎清理，只剩历史可查；
- 一对音视频的**文件名也只由 `streamPairFilenames` 生成**（`<名>_video.mp4` /
  `<名>_audio.m4a`）。以前两个分支各写一套（一套本地化 `_视频流/_音频流`），同一对流的
  文件名词干不一致，应用端配不上对；
- 发送去重按"整对"（`videoUrl|audioUrl`）做，单独资源按地址去重 —— 只拦单条会把一对
  拆成一半，应用端会一直等一个不会来的伙伴。

应用端在没有 `pairId` 时（旧版扩展、站点自身的 DASH 分片）才回退到"同目录 + 同词干
文件名"的启发式配对。

### HLS（m3u8）清单（扩展 ↔ 应用）

清单**不是**"分离的视频流"，它自带音视频，由引擎按播放列表拉分片并拼成一个文件。
所以扩展侧的规则与配对相反：

- `video-sniffer.js` 的 `NON_PAIRABLE_EXTS`（`m4s` / `m3u8` / `mpd` / `ts` / `m2ts` / `mts`）
  把这些扩展名排除出 `combineGenericStreams` 的配对集合：清单不再被配成一对（否则会发
  两条带 `pairId` 的任务、文件名还被写成 `_video.mp4`）；`.ts` 同理 —— 一页常有几十条
  分片，配上一条音频就会生成几十条"完整视频"条目；
- `sendStreamPair` 另有一层兜底：万一清单被配上了（旧数据），降级成单条发送；
- 建议文件名不能带清单扩展名 —— 产物是媒体文件不是清单文本。`outputExtFor`
  （`key-listener.js`）映射 `m3u8 → ts`（HLS 绝大多数是 MPEG-TS）、`mpd → mp4`；
  fMP4 的清单由引擎在落盘时自行改成 `.mp4`；
- 清单地址**原样单条**发给应用（全仓库不解析 `#EXTINF`、不展开分片），由引擎的
  HLS 任务种类接管。

#### 资源列表怎么显示（"该点哪个"）

`collectDisplayItems`（`key-listener.js`）是**列表与按钮数字唯一的共同来源**，
它把资源切成 `manifest` / `segments` / `combined` / `m4s` / `video` / `audio` 六组：

- **`manifest`（`.m3u8`）独立成栏、排在最前面**，标题只有一个「HLS 完整视频」——
  一条地址就是一个完整视频，**点这一条就是下载**；
- **`segments`（`.ts`）折进默认收起的「HLS 分片 · N」组**：不删、但也不占版面。
  **只有这一页确实存在清单时才收** —— 孤立的一条 `.ts` 可能真是整段视频，照常列在视频栏；
- 条目上**不放任何下载按钮/图标**（用户点名不要）：点条目本身就是"加入下载队列"，
  再挂按钮只是噪音，还得靠 `stopPropagation` 防重复发送；
- 分片组只算**一条**可见条目（它就是一个可折叠行），所以"按钮上的数字 = 列表里看得见的
  条目数"这条不变式仍然成立；
- 「下载全部」**先发清单、且从不遍历 `segments`** —— 几十条 `.ts` 逐条发只会得到几十个
  几秒钟的垃圾任务；
- per-video 悬浮按钮（`downloadForVideoContext`）同样**清单优先**：分片按"离播放时刻最近"
  排序经常排在最前，选错就只下到几秒钟的画面。

### 配置存储契约（容易踩）

`background.js` 把拦截配置**整体**存在 `chrome.storage.local` 的 `extConfig` 键下
（一个对象：`interceptAllDownloads` / `silentDownload` / `skipFileExtensions` /
`excludeDomains` / `minFileSize` / `shiftToggleEnabled` / `videoSniffer*`），
**不写**扁平的 `interceptAllDownloads` 等同名键；只有 `videoSnifferEnabled` 等少数几个
是扁平存的。因此：

- content script（`download-interceptor.js`）读配置**必须**取 `extConfig` 对象再取字段，
  读扁平键会永远拿到 `undefined`；
- 这个坑真实发生过：`download-interceptor.js` 早期读的是扁平键，`cachedInterceptEnabled`
  恒为 `false`，**点击拦截从未生效**，所有下载都退化成"浏览器先建下载项、再被取消"的
  事后接管 —— 小文件/高速下载来不及取消就留给了浏览器（表现为"有时交给应用、有时交给浏览器"）；
- 配置变更的通知走 `chrome.tabs.sendMessage({ type: 'extConfigUpdated' })`，
  同时 `chrome.storage.onChanged` 也会触发，两条路都要能刷新缓存。

## 构建、打包与测试

在仓库根目录执行：

```bash
npm run build:extension          # 构建两个平台 + 打包（含自检）
node scripts/build-extension.js --platform=firefox   # 只处理 Firefox
node scripts/build-extension.js --no-package         # 只生成解压目录

npm run test:extension           # 测试（35 项：清单 / 兼容层 / 语法与 i18n / HLS 分组 / 下载入口 / 归档结构）
npm run lint:extension           # Mozilla 官方 web-ext lint（需先构建）
```

产出：

```
dist/extension/chromium/                                           解压目录（chrome://extensions 加载）
dist/extension/firefox/                                            解压目录（about:debugging 加载）
dist/extension/artifacts/lerxu-webextension-chromium-<版本>.zip      Chromium 商店提交
dist/extension/artifacts/lerxu-webextension-firefox-<版本>.zip       AMO 提交
dist/extension/artifacts/lerxu-webextension-firefox-<版本>.xpi       Firefox 本地安装 / 签名分发
```

打包脚本使用自研零依赖 ZIP（`scripts/lib/minizip.js`）而非系统 `zip`：这样 macOS 与 Linux 产出的包
完全一致，不会混入 `__MACOSX`，并会为中日韩文文件名写入 UTF-8 标志。打包时自检四项：归档根存在
`manifest.json`、不含禁止文件、非 ASCII 名带 UTF-8 标志、归档内清单与目标平台匹配。

`npm run test:extension`（`test/extension/run.js`）共 35 项断言，分六组：

1. **清单** —— 两份 `host_permissions` / 关键元信息一致、兼容层位于各加载点首位、清单引用的文件都存在
2. **兼容层行为** —— 在 `vm` 沙箱里用 mock 的 `browser.*` 驱动，验证回调包装、`lastError` 语义、事件对象不被包装、幂等
3. **脚本语法与多语言资源** —— 全部 JS 过一遍语法检查、三份 `messages.json` 的 key 集合一致、i18n 占位符有定义
4. **HLS 清单 / 分片分组** —— 把 `collectDisplayItems` / `countDisplayItems` 那一段抽进沙箱喂数据：清单独立成栏、分片归组且两者都不再混在视频栏、**没有清单时 `.ts` 不算分片**、不同查询串的清单不被去重合并、既有 m4s / 合并视频规则未被破坏
5. **行内下载入口（DOM 桩）** —— 极简 DOM 桩（click 会沿 parentNode 冒泡）驱动条目渲染器：清单条目有实心「下载」按钮、**点按钮只发一次任务**（`stopPropagation` 没失效）、分片组默认收起且点击标题才展开
6. **打包产物结构** —— 真跑一遍构建与打包，断言归档结构（产物写入系统临时目录，不污染 `dist/extension/artifacts/`）

测试直接读源码目录，**不需要先构建**（第 6 组会自行调用构建脚本）。第 4、5 组用"从源码里按标记切出函数体再在 `vm` 里跑"的方式测真实行为 —— 这些函数在 5000 行的 IIFE 里、无法 `require`，但它们是"显示哪几条、按钮写几"的唯一来源，改坏了必须能被测试拦住。

## 双平台清单差异

代码完全相同（统一 `chrome.*` 回调风格 + `firefox-compat.js` 兼容层），差异只在清单：

| 差异点 | Chromium（`manifest.json`） | Firefox（`manifest.firefox.json`） |
| --- | --- | --- |
| 后台形态 | `background.service_worker`（单文件 SW） | `background.scripts`（event page，**Firefox 不支持 MV3 `service_worker`**） |
| 扩展 ID | 不需要（商店分配） | 必需 `browser_specific_settings.gecko.id` |
| 专有权限 | 含 `downloads.ui`（下载气泡控制） | 不含（Firefox 无此权限） |
| `downloads.onDeterminingFilename` | 支持（写盘 / 另存为弹窗之前介入） | 不支持 → 走 `downloads.onCreated` 路径（功能等价） |
| `downloads.setUiOptions` | 支持 | 不支持 → 跳过气泡控制 |
| `runtime.onActivate` | 支持（SW 重启唤醒） | 不支持 → 跳过 |
| 数据收集声明 | 不需要 | 必需 `gecko.data_collection_permissions`（2025-11-03 起 AMO 对新扩展强制要求） |

兼容层（`firefox-compat.js`）在 background / content_scripts / popup 中**首个加载**：仅有 `browser.*` 的
环境会被包装成回调风格（含 `runtime.lastError` 语义），并暴露 `globalThis.LERXU_ENV`
（Firefox 标识 + Chromium 专有能力探测）。其中 `downloads.onDeterminingFilename`、
`downloads.setUiOptions`、`runtime.onActivate` 三项在使用点均做了能力检测
（如 `if (chrome.downloads && chrome.downloads.onDeterminingFilename)`），Firefox 上走
`downloads.onCreated` 等价路径 —— 该约定由测试第 2 组断言守护。

## 数据收集声明（AMO 强制）

自 2025-11-03 起，AMO 要求所有新扩展在清单中声明数据收集类型，缺失会直接报 error。本扩展声明：

```json
"browser_specific_settings": {
  "gecko": {
    "id": "lerxu-webextension@lerxu.app",
    "strict_min_version": "128.0",
    "data_collection_permissions": {
      "required": ["browsingActivity", "websiteContent"]
    }
  }
}
```

依据：扩展读取页面 URL（浏览活动）与页面上的媒体 / 下载链接、cookie（网页内容），并交给**本机**运行的
Lerxu 应用构造下载任务——按 Mozilla 定义，在扩展与浏览器之外处理数据即属传输。数据仅发往
`127.0.0.1`，无遥测。允许取值见 `addons-linter` 的 schema：`required` 可含 11 个个人数据类别之一或多项，
或单独使用 `"none"`（必须独占）；`"technicalAndInteraction"` 只能放在 `optional`。

## 本地加载（调试）

- Chromium：`chrome://extensions/` → 开发者模式 → 「加载已解压的扩展程序」→ `dist/extension/chromium/`
- Firefox：`about:debugging#/runtime/this-firefox` → 「临时载入附加组件」→ `dist/extension/firefox/manifest.json`

## AMO 提交

线上地址：**https://addons.mozilla.org/zh-CN/firefox/addon/lerxu/**（slug 为 `lerxu`；
用户可直接从商店安装并自动更新，随包分发的 `.zip` / `.xpi` 只用于本地测试与自签名分发）。

1. `npm run build:extension`，提交 `dist/extension/artifacts/lerxu-webextension-firefox-<版本>.zip`
2. 上架文案（名称 / 概述 / 描述 / 版本说明 / 分类与标签建议 / 给审核员的说明）见
   [AMO-LISTING.md](AMO-LISTING.md)
3. `web-ext lint` 会给出 6 条 `UNSUPPORTED_API` 警告（`runtime.onActivate`、`downloads.setUiOptions`、
   `downloads.onDeterminingFilename`）——调用点均已能力检测，属预期，不影响上架
