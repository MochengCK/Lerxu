<div align="center">
  <table width="100%">
    <tr>
      <td align="right"><a href="./README.md">English</a></td>
    </tr>
  </table>
</div>

<p align="center">
  <img src="./screenshots/lerxu-banner.png" width="1100" alt="Lerxu Logo" />
</p>

<p align="center">
  <a href="https://github.com/MochengCK/Lerxu/releases">
    <img src="https://img.shields.io/github/v/release/MochengCK/Lerxu.svg?style=for-the-badge" alt="GitHub release" />
  </a>
  <a href="https://github.com/MochengCK/Lerxu/releases">
    <img src="https://img.shields.io/github/downloads/MochengCK/Lerxu/total.svg?style=for-the-badge" alt="Total Downloads" />
  </a>
  <a href="#支持平台">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-lightgrey.svg?style=for-the-badge" alt="Support Platforms" />
  </a>
  <a href="https://github.com/MochengCK/Lerxu/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/MochengCK/Lerxu.svg?style=for-the-badge" alt="License" />
  </a>
</p>

## 项目简介

Lerxu 是一个面向 Windows、macOS、Linux 与 Android 的下载管理器，基于自研的 XferRust 下载引擎（Rust 实现）。支持 **HTTP(S)**、**BitTorrent**（含磁力链接）、**HLS（M3U8）** 与 **SFTP** 四类任务；桌面端可配合浏览器扩展识别网页视频，Android 端则内置了带资源嗅探与原生播放器的浏览器。

## 界面截图

<table>
  <tr>
    <td align="center" width="50%">
      <img
        src="./screenshots/lerxu-screenshot-light.png"
        alt="浅色模式 - 任务管理界面"
        style="max-width: 100%;"
      />
      <p><em>浅色模式</em></p>
    </td>
    <td align="center" width="50%">
      <img
        src="./screenshots/lerxu-screenshot-task.png"
        alt="深色模式 - 任务管理界面"
        style="max-width: 100%;"
      />
      <p><em>深色模式</em></p>
    </td>
  </tr>
</table>

## 功能

### 下载

- **协议**：HTTP/HTTPS、BitTorrent、磁力链接、HLS（M3U8）、SFTP
- **并发**：单任务最多 128 个分片并发（单服务器默认 32 连接），默认同时运行 10 个下载任务，均可在偏好设置中调整
- **HLS**：清单与分片由下载端自行处理并拼接为单个文件，支持多档码率、AES-128 加密分片、分片并发与重试、断点续传
- **SFTP**：`sftp://` 单文件下载，多连接并行与断点续传；密码或 OpenSSH 私钥登录，主机密钥首次连接自动记录、之后指纹变化直接拒绝；私钥、口令、已知主机库、连接数与超时可在偏好设置中调整
- **BitTorrent**：uTP/TCP 双栈（可热切换）、DHT（IPv4/IPv6）、LPD、PeX、UPnP/NAT-PMP 自动端口映射与加密；预置跟踪服务器并支持订阅定时更新；可按分享率与做种时长控制做种；单个种子默认 128 个节点连接
- **任务管理**：优先级、批量操作、限速、任务计划（定时开始/暂停，全部完成后可关机、休眠或退出）、断点续传；下载进程异常退出后自动重启并恢复任务状态
- **文件管理**：按类型自动分类、自定义分类规则、收藏与历史目录、自定义下载中文件后缀、将文件修改时间设为完成时间
- **请求控制**：单任务 `Referer`、`User-Agent` 与任意自定义请求头；系统或自定义代理，可按下载、应用更新、Tracker 更新分别生效；下载完成后可调用系统杀毒或自定义工具扫描
- **链接接管**：识别 `ed2k://` 与 `thunder://` 链接并交给应用处理（`thunder://` 按普通 HTTP 下载，默认关闭）；`ed2k://` 仅做链接识别与接管，不含原生 ED2K 下载
- **其他**：剪贴板自动粘贴、拖拽建任务、高级选项预设、自定义快捷键、完成通知

### 视频下载

- **浏览器扩展**：识别网页视频并一键创建下载任务，支持 Chromium 系浏览器与 Firefox
- **下载接管**：网页中的下载链接可直接转交 Lerxu，支持排除指定网站或文件类型、快捷键临时放行
- **视频识别**：DASH 音视频流分别下载后自动配对合并；HLS 清单整条作为单个任务交给下载端，不展开分片
- **合并进度**：需要合并的音视频下载完成后进入「合并中」并显示实时进度，一次发送多个分段视频也能正确合并

### 安卓客户端

- **内置浏览器**：多标签页、历史记录、下拉刷新，可在下载器与浏览器之间随时切换
- **资源嗅探**：页面上的媒体地址集中显示在资源面板中，一键发送下载
- **原生播放器**：全屏播放、双击快进快退、倍速与画面比例、循环播放、屏幕常亮、防误触锁屏；播放器内可把当前视频连同文件名与预估大小一并交给下载
- **无痕与拦截**：独立身份的无痕窗口（进入前需生物识别或设备密码验证）；默认拦截广告请求并隐藏广告位
- **系统集成**：按当前网络选择可用搜索引擎，可设为系统默认浏览器接管 http / https 链接，并可设置启动后进入下载器还是浏览器

### 界面与体验

- 深色 / 浅色 / 跟随系统三种主题；自定义背景（图片或纯色）、界面透明度、毛玻璃效果（macOS 原生 Vibrancy）
- Windows / Linux 自定义标题栏；偏好设置内嵌主窗口，启动更快
- 任务详情抽屉（概览、活动、Tracker、节点、文件与 BT 分片图）、独立进度窗口、完成弹窗
- macOS 托盘与 Dock 图标同时显示下载/上传速度；系统托盘菜单与下载通知
- 多语言：简体中文、繁体中文、英文

### 更新与集成

- **更新通道**：正式版、预览版或全部版本，更新包下载完成后自动安装
- **本机 RPC 服务**：可选开启 JSON-RPC 服务，让外部工具驱动同一个下载进程
- **引擎信息**：展示当前引擎、版本、架构与由引擎自报的能力清单

## 支持平台

- **Windows** 10 / 11，x64
- **macOS** Intel x64、Apple Silicon arm64
- **Linux** x64、arm64
- **Android** arm64（除下载器外内置浏览器，可设为系统默认浏览器，提供独立的更新渠道）

## 安装

安装包均发布于 [GitHub Releases](https://github.com/MochengCK/Lerxu/releases)。

### Windows

下载 `Lerxu-Setup-<版本>.exe`，运行并按提示完成安装。

### macOS

下载 `*.dmg`（或 `*-mac.zip`）：dmg 双击打开后把应用拖入 `/Applications`；zip 解压后同样移入 `/Applications`。首次运行若提示「无法验证开发者」，在「系统设置 → 隐私与安全」点「仍要打开」，或在 Finder 中对应用右键选择「打开」。

### Linux

- **AppImage（推荐）**：下载 `*.AppImage`，`chmod +x Lerxu-*.AppImage` 后直接运行
- **Debian / Ubuntu**：`sudo dpkg -i lerxu_*.deb`，依赖缺失时执行 `sudo apt -f install`

### Android

下载 `app-release.apk` 并安装。仅支持 `arm64-v8a` 设备。

## 开发

前置要求：Node.js 22.12.0 或更高版本、npm、Git。

```bash
npm install      # 安装依赖
npm run dev      # 开发模式（热重载）
npm run build    # 构建当前平台安装包，输出到 release/
npm run lint     # ESLint
```

Android 客户端与浏览器扩展的额外环境、其余脚本、测试与 CI 说明见 [开发文档](docs/DEVELOPMENT.md)。

## 贡献

欢迎提交 Issue 与 Pull Request：fork 仓库、新建分支、修改后提交、发起 PR。请遵循现有代码风格，保持提交信息简洁，并按需补充测试与文档。

## 致谢

- 本项目基于 agalwood 的开源项目 [Motrix](https://github.com/agalwood/Motrix) 开发，并做了大量修改与功能扩展
- 界面框架：[Vue.js](https://vuejs.org/) + [Element Plus](https://element-plus.org/)
- 桌面框架：[Electron](https://www.electronjs.org/)
- 下载引擎：[XferRust](https://github.com/MochengCK/XferRust)（自研 Rust 下载引擎）

## 支持

- 提交 [Issue](https://github.com/MochengCK/Lerxu/issues/new/choose)
- 加入社区讨论与获取支持

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 开源。
