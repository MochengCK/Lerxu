<div align="center">
  <table width="100%">
    <tr>
      <td align="right"><a href="./README.md">English</a></td>
    </tr>
  </table>
</div>

<p align="center">
  <img src="./screenshots/linkcore-banner.png" width="1100" alt="LinkCore Logo" />
</p>

<p align="center">
  <a href="https://github.com/MochengCK/LinkCore/releases">
    <img src="https://img.shields.io/github/v/release/MochengCK/LinkCore.svg?style=for-the-badge" alt="GitHub release" />
  </a>
  <a href="https://github.com/MochengCK/LinkCore/releases">
    <img src="https://img.shields.io/github/downloads/MochengCK/LinkCore/total.svg?style=for-the-badge" alt="Total Downloads" />
  </a>
  <a href="#支持平台">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=for-the-badge" alt="Support Platforms" />
  </a>
  <a href="https://github.com/MochengCK/LinkCore/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/MochengCK/LinkCore.svg?style=for-the-badge" alt="License" />
  </a>
</p>

## 项目简介

基于 XferCore 引擎的现代化下载管理器，针对 Windows、macOS 和 Linux 深度优化。支持 HTTP、FTP、BitTorrent、磁力链接和电驴（ED2K）链接，提供专业级功能：电驴多方式找源、自动端口映射、跟踪服务器自动更新、任务优先级管理、批量操作和高级下载预设。

## 界面截图

<table>
  <tr>
    <td align="center" width="50%">
      <img
        src="./screenshots/linkcore-screenshot-light.png"
        alt="浅色模式 - 任务管理界面"
        style="max-width: 100%;"
      />
      <p><em>浅色模式</em></p>
    </td>
    <td align="center" width="50%">
      <img
        src="./screenshots/linkcore-screenshot-task.png"
        alt="深色模式 - 任务管理界面"
        style="max-width: 100%;"
      />
      <p><em>深色模式</em></p>
    </td>
  </tr>
</table>

### 引擎版本与连接数

- 程序默认内置并使用 XferCore 下载引擎，应用会自动匹配最佳的"单服务器最大连接数"，保证下载稳定与兼容。
- 单个任务最多支持 128 个分片并发下载（单服务器默认 32 连接），并内置磁盘缓存，多任务并行下载时更流畅。
- 提示：单源下载的实际并发取决于分片数量；种子或多镜像下载可叠加并发，整体速度更快。

## 核心功能

### 性能与可靠性

- **高速下载**：针对最大下载性能进行了优化，引擎内置磁盘缓存与连接复用，多任务下载时更流畅
- **多线程支持**：每个任务最多支持 128 个线程
- **并发下载**：可同时管理多达 10 个下载任务
- **稳定连接**：强大的错误处理和自动重试机制
- **内存优化**：所有窗口隐藏或最小化时自动释放内存

### 协议支持

- **HTTP/HTTPS**：直接从网站下载文件，支持多连接加速
- **FTP/SFTP**：从 FTP 服务器传输文件
- **BitTorrent**：完整支持种子文件，可选择性下载；内置常用跟踪服务器，开箱即用
- **磁力链接**：无需 .torrent 文件即可直接下载
- **ED2K（电驴）**：原生支持电驴链接，通过电驴服务器、源交换和 KAD 网络查找下载源

### ED2K 下载

- **多方式找源**：支持通过电驴服务器、源交换（不依赖服务器）和 KAD 网络（实验性）三种方式并行查找来源
- **服务器订阅**：支持订阅服务器列表文件，可手动或定时自动同步，内置 9 个常用电驴服务器
- **可调参数**：可自定义监听端口（默认 4662）、最大连接数、连接超时、每文件最大来源数
- **ED2K 任务详情**：任务详情中展示文件信息与实时来源列表，可查看每个来源的状态、队列位置和可用分片

### BT 与磁力链接

- **传输协议**：支持多种传输协议，提升下载稳定性与速度
- **网络发现**：自动开放网络端口，提高连接成功率
- **跟踪服务器预置**：内置常用跟踪服务器列表，装好即可正常下载
- **多引导节点**：内置多个网络引导节点，连接更可靠
- **自动清理**：自动清理长时间无响应的连接，保持下载效率

### 视频下载

- **在线视频下载（浏览器扩展）**：通过浏览器扩展识别网页视频，一键发送到应用创建下载任务
- **下载接管**：网页中的下载链接（如设置了下载属性或以常见文件格式结尾的链接）点击后可直接转交 LinkCore 接管，支持排除指定网站或文件类型、Alt+点击放行
- **视频识别**：支持多种视频格式，自动区分音频流与视频流
- **统一任务管理**：视频资源以普通下载任务进入任务列表，支持与其他任务一致的暂停/恢复/删除等管理体验
- **合并进度展示**：需要合并的音视频下载完成后进入"合并中"状态并显示合并进度，一次发送多个分段视频也能正确合并

### 用户体验

- **简洁界面**：现代直观的设计，支持深色模式
- **系统托盘集成**：快速访问和状态监控
- **下载通知**：下载完成时实时提醒
- **速度控制**：设置上传和下载速度限制
- **文件管理**：按类别和位置组织下载文件

### 高级功能

- **跟踪服务器更新**：每日自动更新跟踪服务器列表，提升种子下载性能
- **自动端口映射**：自动开放网络端口，提高连接成功率
- **下载标识自定义**：自定义下载请求标识，提升兼容性
- **任务调度**：设置下载时间和优先级
- **批量下载**：导入和导出下载列表
- **更新通道**：可选择正式版、预览版或最新版本更新渠道，更新包下载完成后自动安装

### 独特功能

- **文件分类**：根据文件类型自动分类保存
- **自定义分类**：用户可自定义文件分类规则
- **任务优先值**：用户可设置任务的优先值，影响下载顺序、下载资源分配
- **自定义下载中文件后缀**：用户可自定义下载中文件的后缀，方便文件管理
- **将文件修改日期设置为下载完成时间**：用户可选择将下载完成的文件修改日期设置为与下载完成时间相同，方便文件管理
- **电驴服务器自动更新**：定期自动更新电驴服务器列表，保证找源顺畅
- **高级选项预设**：支持为高级选项命名保存、选择应用、删除预设
- **链接输入体验优化**：自动去重重复链接；粘贴或自动填充后自动换行并定位光标
- **自定义快捷键**：在"偏好设置 -> 基础设置 -> 快捷键"卡片中为常用命令设置或重置快捷键

## 支持平台

LinkCore 目前支持以下平台：

- **Windows** (7, 8, 10, 11)
- **macOS**（Intel，x64；Apple Silicon，arm64）
- **Linux** (x64, arm64)

## 安装方式

### Windows

1. 访问 [GitHub Releases](https://github.com/MochengCK/LinkCore/releases) 页面
2. 下载最新版本的 `LinkCore-Setup-x.y.z.exe` 安装程序
3. 运行安装程序并按照屏幕提示完成安装

### macOS

1. 访问 [GitHub Releases](https://github.com/MochengCK/LinkCore/releases) 页面
2. 下载 `*.dmg`（x64/arm64）或 `*-mac.zip` / `*-arm64-mac.zip`（x64/arm64）
3. 使用 `*.dmg`：双击打开，将应用拖拽到 `/Applications`
4. 使用 `*.zip`：解压后将应用移动到 `/Applications`
5. 首次运行若提示"无法验证开发者"，请在"系统设置 -> 隐私与安全"中点击"仍要打开"，或在 Finder 中对应用图标"右键 -> 打开"

### Linux

- AppImage（通用推荐）：
  1. 下载 `*.AppImage`（`x64` 或 `arm64`）
  2. 赋予可执行权限：`chmod +x LinkCore-*.AppImage`
  3. 运行：`./LinkCore-*.AppImage`

- Debian/Ubuntu（`.deb` 包）：
  1. 下载 `linkcore_*_amd64.deb` 或 `linkcore_*_arm64.deb`
  2. 安装：`sudo dpkg -i linkcore_*.deb`
  3. 如有依赖问题：`sudo apt -f install`

- 其他发行版：优先使用 AppImage 方式。

## 开发指南

### 前置要求

- Node.js (v16.0.0 或更高版本)
- npm 或 yarn
- Git

### 设置开发环境

1. 克隆仓库：
   ```bash
   git clone https://github.com/MochengCK/LinkCore.git
   cd LinkCore
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

### 项目结构

```
LinkCore/
├── src/                  # 主要源代码
│   ├── main/             # Electron 主进程
│   ├── renderer/         # Electron 渲染进程（Vue.js）
│   └── shared/           # 共享工具
├── static/               # 静态资源
├── .electron-vue/        # Electron-Vue 配置
├── screenshots/          # 文档截图
├── package.json          # 项目配置
└── README.md             # 项目文档
```

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
- UI 框架：[Vue.js](https://vuejs.org/)
- 桌面框架：[Electron](https://www.electronjs.org/)
- 视频处理：[FFmpeg](https://ffmpeg.org/)
- 下载引擎：[XferCore](https://github.com/MochengCK/XferCore)（基于 [aria2](https://github.com/aria2/aria2) 深度定制）

## 支持

如果您遇到任何问题或有疑问：

- 在 GitHub 上 [提交 issue](https://github.com/MochengCK/LinkCore/issues/new/choose)
- 加入我们的社区进行讨论和获取支持

## 许可证

本项目基于 [MIT License](LICENSE) 开源。