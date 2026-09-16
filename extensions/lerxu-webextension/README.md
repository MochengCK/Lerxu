# Lerxu 浏览器扩展（Chromium + Firefox）

面向维护者。用户在应用 [README](../../README-CN.md) 中查看扩展的安装与功能说明。

源码目录：`lerxu-webextension/`

## ⚠️ 打包请用构建脚本，不要手动压缩

直接在 `lerxu-webextension/` 上「右键 → 压缩」会得到**错误结构**的包：内层多一层
`lerxu-webextension/` 目录，macOS 还会写入 `__MACOSX/`、`._*` 元数据，源码里的
`icons/generate_icons.py` 也会被打进去。AMO 会依次报：

- `No manifest.json was found at the root of the extension`（扩展文件必须在归档**根目录**）
- `Hidden file flagged`（macOS 元数据）
- `Flagged file type found`（`generate_icons.py`）

## 构建、打包与测试

在仓库根目录执行：

```bash
npm run build:extension          # 构建两个平台 + 打包（含自检）
node scripts/build-extension.js --platform=firefox   # 只处理 Firefox
node scripts/build-extension.js --no-package         # 只生成解压目录

npm run test:extension           # 测试（含归档结构断言）
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

## 双平台清单差异

代码完全相同（统一 `chrome.*` 回调风格 + `firefox-compat.js` 兼容层），差异只在清单：

| 差异点 | Chromium（`manifest.json`） | Firefox（`manifest.firefox.json`） |
| --- | --- | --- |
| 后台形态 | `background.service_worker`（单文件 SW） | `background.scripts`（event page，**Firefox 不支持 MV3 `service_worker`**） |
| 扩展 ID | 不需要 | 必需 `browser_specific_settings.gecko.id` |
| 专有权限 | 含 `downloads.ui` | 不含（Firefox 无此权限） |
| 数据收集声明 | 不需要 | 必需 `gecko.data_collection_permissions` |

兼容层（`firefox-compat.js`）在 background / content_scripts / popup 中**首个加载**：仅有 `browser.*` 的
环境会被包装成回调风格（含 `runtime.lastError` 语义），并暴露 `globalThis.LERXU_ENV`
（Firefox 标识 + Chromium 专有能力探测）。三处 Chromium 专有 API（`runtime.onActivate`、
`downloads.setUiOptions`、`downloads.onDeterminingFilename`）在使用点均做了能力检测，Firefox 上走
`downloads.onCreated` 等价路径。

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

1. `npm run build:extension`，提交 `dist/extension/artifacts/lerxu-webextension-firefox-<版本>.zip`
2. 上架文案（名称 / 概述 / 描述 / 版本说明 / 分类与标签建议 / 给审核员的说明）见
   [AMO-LISTING.md](AMO-LISTING.md)
3. `web-ext lint` 会给出 6 条 `UNSUPPORTED_API` 警告（`runtime.onActivate`、`downloads.setUiOptions`、
   `downloads.onDeterminingFilename`）——调用点均已能力检测，属预期，不影响上架
