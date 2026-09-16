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

基于自研 XferRust 下载引擎（Rust 原生实现）的现代化下载管理器，针对 Windows、macOS、Linux 和 Android 深度优化。支持 HTTP(S)、FTP/SFTP、BitTorrent 和磁力链接，提供专业级功能：uTP 传输、自动端口映射、Tracker 自动同步、任务优先级管理、批量操作和高级下载预设。

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

### 引擎版本与连接数

- 程序默认内置 XferRust 下载引擎（Rust 原生实现），应用会按引擎能力自动匹配最佳的"单服务器最大连接数"策略，保证下载稳定与兼容。
- 单个任务最多支持 128 个分片并发下载（单服务器默认 32 连接），引擎内置 128M 磁盘缓存与连接复用，多任务并行下载时更流畅。
- 引擎崩溃自动重启，任务与会话自动恢复；重启后未完成任务保持暂停，可手动恢复。
- 提示：单源下载的实际并发取决于分片数量；种子或多镜像下载可叠加并发，整体速度更快。

## 核心功能

### 性能与可靠性

- **高速下载**：针对最大下载性能进行了优化，引擎内置磁盘缓存与连接复用，多任务下载时更流畅
- **多线程支持**：每个任务最多支持 128 个分片并发
- **并发下载**：可同时管理多达 10 个下载任务
- **稳定连接**：强大的错误处理、自动重试与断点续传机制
- **崩溃自愈**：下载引擎异常退出后自动重启，任务状态自动恢复
- **内存优化**：所有窗口隐藏或最小化时自动释放内存

### 协议支持

- **HTTP/HTTPS**：直接从网站下载文件，支持多连接加速、Gzip、Keep-Alive 与断点续传
- **FTP/SFTP**：从 FTP 服务器传输文件
- **BitTorrent**：完整支持种子文件，可选择性下载；uTP/TCP 双传输、DHT、LPD、PeX 与加密开箱即用
- **磁力链接**：无需 .torrent 文件即可直接下载，元数据就绪后可自由勾选文件
- **ED2K（电驴）**：保留 ed2k:// 链接识别与浏览器接管；原生 ED2K 下载能力暂缓提供
- **Thunder**：支持 thunder:// 链接协议接管

### BT 与磁力链接

- **传输协议**：uTP（BEP 29）与 TCP 双栈，可配置"uTP 优先自动回退 / 仅 uTP / 仅 TCP"，支持运行时热切换
- **端口映射**：UPnP 与 NAT-PMP 自动映射 BT 监听端口，提高连接成功率
- **网络发现**：DHT（IPv4/IPv6 双栈）、本地节点发现（LPD）、节点交换（PeX）
- **跟踪服务器预置与自动同步**：内置常用跟踪服务器列表，支持订阅源定时自动更新，装好即可正常下载
- **BT 加密**：自适应 / 强制加密模式，兼容多种网络环境
- **节点管理与反吸血**：任务详情实时展示节点列表（客户端识别、分片进度），可手动封禁问题节点，引擎自动封禁异常节点
- **文件选择**：磁力与种子任务在元数据就绪后可自由勾选要下载的文件
- **做种控制**：可按分享率与做种时长设置目标，完成后自动暂停或保持做种

### 视频下载

- **在线视频下载（浏览器扩展）**：通过浏览器扩展识别网页视频，一键发送到应用创建下载任务；支持 Chrome、Edge、Opera 等 Chromium 内核浏览器与 Firefox
- **下载接管**：网页中的下载链接（如设置了下载属性或以常见文件格式结尾的链接）点击后可直接转交 Lerxu 接管，支持排除指定网站或文件类型、快捷键临时放行
- **视频识别**：支持多种视频格式（含 DASH），自动区分音频流与视频流
- **统一任务管理**：视频资源以普通下载任务进入任务列表，支持与其他任务一致的暂停/恢复/删除等管理体验
- **合并进度展示**：需要合并的音视频下载完成后进入"合并中"状态并显示合并进度，一次发送多个分段视频也能正确合并

### 用户体验

- **简洁界面**：现代直观的设计，深色 / 浅色 / 跟随系统三种主题
- **自定义背景**：背景图片与纯色、界面透明度、毛玻璃效果（macOS 原生 Vibrancy 透明）
- **原生体验**：Windows / Linux 自定义标题栏；偏好设置内嵌主窗口，启动更快
- **实时速度展示**：macOS 托盘图标与 Dock 图标同时显示下载与上传速度，并配备全新托盘图标
- **任务详情抽屉**：概览、活动、连接、节点、Tracker、文件与 BT 分片图一站式查看
- **剪贴板自动粘贴**：复制下载链接后自动填入新建任务
- **系统托盘集成**：快速访问和状态监控
- **下载通知**：下载完成时实时提醒，可配置点击动作
- **速度控制**：设置上传和下载速度限制
- **文件管理**：按类别和位置组织下载文件，支持收藏目录与历史目录
- **多语言**：简体中文、繁体中文、英文

### 高级功能

- **跟踪服务器自动同步**：定时自动更新跟踪服务器列表，提升种子下载性能
- **自动端口映射**：UPnP 与 NAT-PMP 自动开放网络端口
- **下载标识自定义**：自定义下载请求标识（User-Agent），提升兼容性
- **任务计划**：设置定时执行下载任务的开始/暂停等动作
- **批量下载**：导入和导出下载列表
- **下载安全扫描**：下载完成后可调用系统杀毒工具或自定义扫描工具扫描文件
- **代理支持**：系统代理或自定义代理，可按下载场景分别生效
- **更新通道**：可选择正式版、预览版或全部版本更新渠道，更新包下载完成后自动安装

### 独特功能

- **文件分类**：根据文件类型自动分类保存
- **自定义分类**：用户可自定义文件分类规则
- **任务优先值**：用户可设置任务的优先值，影响下载顺序、下载资源分配
- **自定义下载中文件后缀**：用户可自定义下载中文件的后缀，方便文件管理
- **将文件修改日期设置为下载完成时间**：用户可选择将下载完成的文件修改日期设置为与下载完成时间相同，方便文件管理
- **高级选项预设**：支持为高级选项命名保存、选择应用、删除预设
- **链接输入体验优化**：自动去重重复链接；粘贴或自动填充后自动换行并定位光标
- **自定义快捷键**：在"偏好设置 -> 基础设置 -> 快捷键"卡片中为常用命令设置或重置快捷键

## 支持平台

Lerxu 目前支持以下平台：

- **Windows** (10, 11) x64
- **macOS**（Intel x64；Apple Silicon arm64）
- **Linux** (x64, arm64)
- **Android** (arm64)：与桌面版共用同一下载引擎，界面针对移动端重新设计

## 安装方式

### Windows

1. 访问 [GitHub Releases](https://github.com/MochengCK/Lerxu/releases) 页面
2. 下载最新版本的 `Lerxu-Setup-x.y.z.exe` 安装程序
3. 运行安装程序并按照屏幕提示完成安装

### macOS

1. 访问 [GitHub Releases](https://github.com/MochengCK/Lerxu/releases) 页面
2. 下载 `*.dmg`（x64/arm64）或 `*-mac.zip` / `*-arm64-mac.zip`（x64/arm64）
3. 使用 `*.dmg`：双击打开，将应用拖拽到 `/Applications`
4. 使用 `*.zip`：解压后将应用移动到 `/Applications`
5. 首次运行若提示"无法验证开发者"，请在"系统设置 -> 隐私与安全"中点击"仍要打开"，或在 Finder 中对应用图标"右键 -> 打开"

### Linux

- AppImage（通用推荐）：
  1. 下载 `*.AppImage`（`x64` 或 `arm64`）
  2. 赋予可执行权限：`chmod +x Lerxu-*.AppImage`
  3. 运行：`./Lerxu-*.AppImage`

- Debian/Ubuntu（`.deb` 包）：
  1. 下载 `lerxu_*_amd64.deb` 或 `lerxu_*_arm64.deb`
  2. 安装：`sudo dpkg -i lerxu_*.deb`
  3. 如有依赖问题：`sudo apt -f install`

- 其他发行版：优先使用 AppImage 方式。

### Android

**安装**（从发布页）：

1. 访问 [GitHub Releases](https://github.com/MochengCK/Lerxu/releases) 页面
2. 下载 `app-release.apk`（已签名）或 `app-release-unsigned.apk`（未签名），也可用 `app-debug.apk` 快速体验
3. 安装到 **arm64** 设备（应用仅支持 `arm64-v8a`）

> 未签名的 `app-release-unsigned.apk` 安装前需自行签名：
> `apksigner sign --ks <你的keystore> --out Lerxu.apk app-release-unsigned.apk`

## 开发指南

### 前置要求

- Node.js (v22.12.0 或更高版本)
- npm
- Git

> 构建 Android 客户端或浏览器扩展所需的额外环境（JDK 17 / Android SDK 等），见 [开发文档](docs/DEVELOPMENT.md)。

### 设置开发环境

1. 克隆仓库：
   ```bash
   git clone https://github.com/MochengCK/Lerxu.git
   cd Lerxu
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 启动开发服务器：
   ```bash
   npm run dev
   ```

4. 构建生产版本：
   ```bash
   npm run build
   ```

桌面客户端的构建产物位于 `release/`。Android 客户端与浏览器扩展的构建方式见 [开发文档](docs/DEVELOPMENT.md)。

### 项目结构

```
Lerxu/
├── src/                  # 应用源代码
│   ├── main/             # Electron 主进程
│   ├── renderer/         # Electron 渲染进程（Vue 3）
│   └── shared/           # 共享工具与引擎协议适配层
├── extra/                # 各平台内置的下载引擎二进制
├── extensions/           # 浏览器扩展（视频嗅探与下载接管）
├── Android/              # Android 客户端（Kotlin + Compose）
├── static/               # 静态资源
├── build/                # 打包钩子与平台图标
├── screenshots/          # 文档截图
├── package.json          # 项目配置
└── README.md             # 项目文档
```

引擎源码（独立仓库）、构建脚本、测试与 CI 配置的说明见 [开发文档](docs/DEVELOPMENT.md)。

## 参与贡献

欢迎贡献代码！无论您是修复 Bug、添加新功能还是改进文档，我们都非常感谢您的帮助。

### 如何贡献

1. Fork 本仓库
2. 创建新分支 (`git checkout -b feature/your-feature`)
3. 进行修改
4. 提交更改 (`git commit -m 'Add some feature'`)
5. 推送到分支 (`git push origin feature/your-feature`)
6. 创建 Pull Request

### 开发指南

- 遵循现有代码风格
- 编写清晰简洁的提交信息
- 为新功能添加测试
- 按需更新文档

## 致谢

- 本项目基于 agalwood 开源项目 [Motrix](https://github.com/agalwood/Motrix) 开发，并在其基础上进行了大量修改和功能扩展
- UI 框架：[Vue.js](https://vuejs.org/) + [Element Plus](https://element-plus.org/)
- 桌面框架：[Electron](https://www.electronjs.org/)
- 下载引擎：[XferRust](https://github.com/MochengCK/XferRust)（自研 Rust 下载引擎）

## 支持

如果您遇到任何问题或有疑问：

- 在 GitHub 上 [提交 issue](https://github.com/MochengCK/Lerxu/issues/new/choose)
- 加入我们的社区进行讨论和获取支持

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 开源。
