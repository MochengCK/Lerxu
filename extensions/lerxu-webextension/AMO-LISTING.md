# AMO 上架文案（Firefox Add-ons）

本文件是 [addons.mozilla.org](https://addons.mozilla.org/developers/) 提交扩展时各字段的现成文案，
**不会被 `scripts/build-extension.js` 打进扩展包**（打包使用显式白名单）。

对应提交物：`dist/extension/artifacts/lerxu-webextension-firefox-<版本>.zip`

---

## Name（名称）

```
Lerxu
```

## Summary（概述，约 250 字符上限）

**English**

```
Send videos, audio and download links from Firefox to the Lerxu download manager: page-wide media sniffing, download takeover, per-site and per-type exclusions. Needs the free Lerxu desktop app. No telemetry.
```

**简体中文**

```
把网页中的视频、音频与下载链接一键交给 Lerxu 下载管理器：全页媒体嗅探 + 浏览器下载接管，支持按站点与文件类型排除。需要配合免费的 Lerxu 桌面应用使用。无遥测，数据仅在本机传输。
```

## Description（描述）

**English**

```markdown
Lerxu hands your downloads over to the [Lerxu desktop app](https://github.com/MochengCK/Lerxu) — a free,
open-source download manager powered by its own Rust engine (HTTP / HTTPS, BitTorrent, magnet, DASH/HLS video merge).

This extension is the browser half: it sniffs media on the pages you visit and intercepts browser downloads,
then sends them to the app running on your own machine.

### Features

- **Media sniffing** — detects videos and audio on any page, including segmented streams (HLS `.m3u8` / DASH `.mpd` / `.m4s`, `ts`, `mp4`, `webm`, `mkv`, `mp3`, `flac` and more) and lets the app merge audio/video tracks automatically
- **Download takeover** — clicks on links marked as downloads, links to common download file types, and Alt+Click forced downloads are redirected to Lerxu instead of Firefox's own download manager
- **Right-click menu** — send any link to Lerxu directly ("Download with Lerxu")
- **Exclusions** — exclude the current site with one click, skip chosen file extensions, and ignore files below a minimum size so small assets are left to the browser
- **Temporary bypass** — hold Shift (or use the keyboard shortcut) to let the next download pass through to Firefox untouched
- **Silent downloads** — optionally skip the "Save as" dialog when handing a download to Lerxu
- **Popup panel** — connection status, client version, live download/upload speed and the current task list at a glance
- **Localized** — English, Simplified Chinese and Traditional Chinese

### Requirements

The extension **needs the Lerxu desktop app** (Windows / macOS / Linux, free and open source) running on the
same computer; it talks to it over `127.0.0.1` only. Without the app the extension stays quiet and simply lets
Firefox handle downloads normally.

### Privacy

- No analytics, no telemetry, no remote servers.
- Page URLs, media links and cookies needed to build download requests are sent **only to the Lerxu app on your
  own machine** (`127.0.0.1:16900`); nothing leaves your device.
- Settings are stored locally with the browser's extension storage.

### Firefox notes

Download takeover runs on the `downloads.onCreated` event, so a download entry may appear briefly before Lerxu
takes it over. The browser's download bubble cannot be hidden programmatically on Firefox (that API is
Chromium-only); every other feature behaves the same as on Chromium-based browsers.
```

**简体中文**

```markdown
Lerxu 把浏览器下载交给 [Lerxu 桌面应用](https://github.com/MochengCK/Lerxu)——一个免费开源的下载管理器，
自带 Rust 引擎（HTTP / HTTPS、BitTorrent、磁力、DASH/HLS 视频合并）。

本扩展是它的浏览器端：嗅探你访问的页面上的媒体资源、接管浏览器下载，然后交给运行在**你自己电脑上**的
应用来下载。

### 功能

- **媒体嗅探**——识别任意页面上的视频与音频，包括分片流（HLS `.m3u8` / DASH `.mpd` / `.m4s`、`ts`、`mp4`、`webm`、`mkv`、`mp3`、`flac` 等），可由应用自动合并音视频轨
- **下载接管**——点击标记为下载的链接、指向常见下载文件类型的链接，以及 Alt+点击强制下载，都会转交 Lerxu 而不是浏览器自带的下载管理器
- **右键菜单**——直接"使用 Lerxu 下载"任意链接
- **排除规则**——一键排除当前网站、跳过指定文件扩展名、忽略小于指定体积的文件，小文件仍交给浏览器
- **临时放行**——按住 Shift（或使用快捷键）让下一次下载原样交给浏览器
- **静默下载**——可选：交给 Lerxu 时不弹出"另存为"对话框
- **弹窗面板**——一眼看到连接状态、客户端版本、实时下载/上传速度与当前任务列表
- **多语言**——英文、简体中文、繁体中文

### 使用前提

扩展**需要配合 Lerxu 桌面应用**（Windows / macOS / Linux，免费开源）使用，仅通过 `127.0.0.1` 与本机应用通信。
未运行应用时扩展不干扰浏览器，下载按 Firefox 默认方式正常进行。

### 隐私

- 无统计分析、无遥测、不连接任何远程服务器。
- 用于构造下载请求的页面 URL、媒体链接与 cookie **只发送给本机的 Lerxu 应用**（`127.0.0.1:16900`），不会离开你的设备。
- 配置仅保存在浏览器扩展存储中。

### Firefox 上的差异

下载接管在 `downloads.onCreated` 阶段执行，因此下载条目可能短暂出现后被 Lerxu 接管。Firefox 无法以编程方式
隐藏浏览器下载气泡（该 API 为 Chromium 专有）；其余功能与 Chromium 内核浏览器一致。
```

## Release notes（版本说明）

**English**

```
First Firefox release. Same feature set as the Chromium build: media sniffing, download takeover, per-site and
per-file-type exclusions, temporary bypass and the status popup.
```

**简体中文**

```
首个 Firefox 版本，功能与 Chromium 版一致：媒体嗅探、下载接管、按站点与文件类型排除、临时放行与状态弹窗。
```

## 其他提交字段建议

| 字段 | 建议值 |
| --- | --- |
| Add-on URL | `lerxu`（若被占用，可改为 `lerxu-download-manager`） |
| Firefox categories（最多 2 个） | **Download Management**（可选第二个：Productivity） |
| Android categories | 不适用（扩展依赖桌面应用与 `127.0.0.1` 通信，未适配 Android 版 Firefox） |
| This add-on is experimental | 不勾选（功能完整；如需灰度可先勾选） |
| Requires payment / non-free services / additional hardware | 建议勾选并在描述中说明：需要**免费开源**的 Lerxu 桌面应用配合（勾选只是如实告知依赖额外软件） |
| Support email | 你的 GitHub 邮箱 |
| Support website | https://github.com/MochengCK/Lerxu/issues |
| License | Apache-2.0（与仓库 `package.json` / `LICENSE` 一致） |
| This add-on has a privacy policy | **勾选**，链接指向仓库内的隐私说明（数据仅发往本机，无遥测）——已声明 `browsingActivity` 与 `websiteContent`，需给出隐私政策 |
| Tags | `download manager`, `video download`, `media sniffer`, `bit torrent` |

## Notes for Reviewers（给审核员的说明）

```text
Purpose: this add-on is the browser companion of the Lerxu desktop download manager (open source,
https://github.com/MochengCK/Lerxu). It sniffs media URLs on pages and hands download jobs to the app
that the user runs locally.

1. Local-only communication
   All network traffic originating from the extension (HTTP + WebSocket) targets 127.0.0.1:16900 /
   127.0.0.1:16800 only — the Lerxu app on the user's own machine. There is no telemetry, no analytics,
   and no remote endpoint of any kind. Declared data types (browsingActivity, websiteContent) cover page
   URLs, media links and cookies that are passed to the local app to build download requests.

2. Six UNSUPPORTED_API warnings are expected
   The same codebase serves Chromium and Firefox. The flagged calls — runtime.onActivate,
   downloads.setUiOptions and downloads.onDeterminingFilename — are Chromium-only APIs. Each call site is
   guarded by a runtime feature check (see firefox-compat.js, which exposes LERXU_ENV.capabilities, and
   background.js where the guard is applied). On Firefox the takeover path uses downloads.onCreated instead,
   and download-bubble control is skipped; nothing throws and no functionality is stubbed out.

3. Manifest differences
   Firefox uses background.scripts (Firefox does not support MV3 background.service_worker) and omits the
   Chromium-only downloads.ui permission. gecko.id and data_collection_permissions are present as required.

4. Permission rationale
   - downloads: take over browser downloads and create tasks in the local app
   - cookies: include the site cookie in the download request sent to the local app (login-protected media)
   - webRequest (non-blocking, responseHeaders only): detect Content-Disposition/attachment responses to
     recognize downloads early; requests are never modified or blocked
   - contextMenus: the "Download with Lerxu" context menu item
   - storage: save settings locally
   - alarms: a once-a-minute WebSocket watchdog that re-establishes the connection to the local app after it
     was restarted (MV3 background workers can be suspended, which would otherwise leave the extension
     permanently disconnected)
   - <all_urls> host access: media sniffing and download interception must work on any site the user visits

5. Testing without the desktop app
   The extension degrades gracefully: when the app is not detected it does not intercept anything and lets
   Firefox download normally. Sniffing/takeover can be verified on any page that exposes media or download
   links; the popup shows the connection state (disconnected without the app).
```
