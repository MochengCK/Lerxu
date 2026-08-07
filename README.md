<div align="center">
  <table width="100%">
    <tr>
      <td align="right"><a href="./README-CN.md">中文</a></td>
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
  <a href="#supported-platforms">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=for-the-badge" alt="Support Platforms" />
  </a>
  <a href="https://github.com/MochengCK/LinkCore/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/MochengCK/LinkCore.svg?style=for-the-badge" alt="License" />
  </a>
</p>

## Introduction

A modern download manager powered by the XferCore engine, optimized for Windows, macOS, and Linux. Supports HTTP, FTP, BitTorrent, Magnet links, and ED2K (eDonkey) links with professional-grade features including multi-method ED2K source discovery, UPnP/NAT-PMP port mapping, automatic Tracker updates, task prioritization, batch management, and advanced download presets.

## Screenshots

<table>
  <tr>
    <td align="center" width="50%">
      <img
        src="./screenshots/linkcore-screenshot-light.png"
        alt="Light Mode - Task Management"
        style="max-width: 100%;"
      />
      <p><em>Light Mode</em></p>
    </td>
    <td align="center" width="50%">
      <img
        src="./screenshots/linkcore-screenshot-task.png"
        alt="Dark Mode - Task Management"
        style="max-width: 100%;"
      />
      <p><em>Dark Mode</em></p>
    </td>
  </tr>
</table>

## Engine & Connections

- LinkCore ships with the XferCore download engine (deeply customized from aria2, with native ED2K protocol support). The app automatically adjusts "Max Connections per Server" based on the engine's connection limits for stability and compatibility.
- XferCore supports up to 128 connections per server (default 32) and up to 128 segments per task, backed by a 128MB disk cache and HTTP keep-alive / pipelining.
- Note: The real concurrency for single-source HTTP/FTP downloads is min(split, max-connection-per-server); BT and multi-mirror downloads can stack concurrency for better overall speed.

## Core Features

### Performance & Reliability
- **High-speed Downloads**: Optimized for maximum download performance, with a 128MB disk cache and HTTP keep-alive / pipelining enabled by default
- **Multi-threaded Support**: Up to 128 threads per task
- **Concurrent Downloads**: Manage up to 10 download tasks simultaneously
- **Stable Connections**: Robust error handling and automatic retry mechanism
- **Memory Optimization**: Automatically releases memory when all windows are hidden or minimized

### Protocol Support
- **HTTP/HTTPS**: Download directly from web servers, with keep-alive and pipelining acceleration
- **FTP/SFTP**: Transfer files from FTP servers
- **BitTorrent**: Full torrent file support with selective downloading; built-in Tracker list and multiple DHT bootstrap nodes for out-of-the-box use
- **Magnet Links**: Direct downloads without .torrent files
- **ED2K (eDonkey)**: Native support for `ed2k://` links, discovering sources via ED2K servers, Peer source exchange, and the KAD network

### ED2K Downloads
- **Multi-method Source Discovery**: Find sources in parallel via ED2K servers (traditional), Peer source exchange (server-independent), and the KAD network (Kademlia DHT, experimental)
- **Server Subscription**: Subscribe to server.met / text-format server sources, with manual sync or automatic sync on a configurable interval/schedule; 9 popular ED2K servers are built in
- **Configurable Parameters**: Listen port (default 4662), max connections, connection timeout, and max sources per file
- **ED2K Task Details**: View ED2K info (file hash) and a live source list in task details, including per-source status, queue position, available pieces, and KAD network state

### BitTorrent / Magnet Enhancements
- **Transport Protocol**: uTP transport protocol toggle for more stable and faster BT connections
- **Network Discovery**: NAT-PMP automatic port mapping when UPnP mapping fails
- **Built-in Trackers**: 30+ common Tracker addresses pre-configured in the engine
- **Multiple DHT Bootstrap Nodes**: More reliable DHT network bootstrapping
- **Request Timeout Optimization**: BT request timeout set to 30 seconds to free stuck Peer request slots faster

### Video Download
- **Online Video Download (Browser Extension)**: Sniff video resources via browser extension, send to the app with one click to create download tasks (includes necessary request headers for improved availability)
- **Download Interception**: The extension's download interceptor forwards clicks on download-marked links (`<a download>` or common download extensions) to LinkCore, with support for excluding domains/extensions and Alt+Click to bypass
- **Enhanced Video Sniffing**: Recognizes m4s / mpd formats and HLS/DASH manifests, distinguishes Douyin audio/video streams, and flags H.264
- **Unified Task Management**: Video resources appear as regular download tasks in the task list, supporting the same pause/resume/delete management experience as other tasks
- **Merge Progress Display**: Audio/video requiring merging (e.g., DASH videos) enters a "merging" state with visible progress after download, and correctly triggers merging when the extension sends multiple DASH videos at once

### User Experience
- **Clean Interface**: Modern, intuitive design with dark mode support
- **System Tray Integration**: Quick access and status monitoring
- **Download Notifications**: Real-time alerts when downloads complete
- **Speed Control**: Set upload and download speed limits
- **File Management**: Organize downloaded files by category and location

### Advanced Features
- **Tracker Updates**: Daily automatic Tracker list updates for improved torrent performance
- **UPnP/NAT-PMP**: Automatic port mapping for better connectivity
- **User-Agent Masquerading**: Custom User-Agent strings for enhanced compatibility
- **Task Scheduling**: Set download times and priorities
- **Batch Downloads**: Import and export download lists
- **Update Channels**: Choose between stable / beta (latest pre-release) / all channels, with automatic installation after the update package downloads

### Unique Features
- **File Categorization**: Auto-sort files by type
- **Custom Categories**: User-defined file categorization rules
- **Task Priority**: Set task priority values to influence download order and resource allocation
- **Custom Download File Extension**: Customize the file extension for in-progress downloads
- **Set File Modification Date to Completion Time**: Optionally set downloaded file modification dates to match completion time
- **ED2K Server Auto-sync**: Periodically fetch the latest ED2K server list from subscription sources
- **Advanced Option Presets**: Name, save, apply, and delete presets for advanced options
- **Link Input Optimization**: Auto-deduplicate links; auto-newline and cursor positioning after paste or autofill
- **Custom Shortcuts**: Set or reset shortcuts for common commands in the "Preferences > Basic > Shortcuts" card

## Supported Platforms

LinkCore currently supports the following platforms:
- **Windows** (7, 8, 10, 11)
- **macOS** (Intel, x64; Apple Silicon, arm64)
- **Linux** (x64, arm64)

## Installation

### Windows

1. Visit the [GitHub Releases](https://github.com/MochengCK/LinkCore/releases) page
2. Download the latest `LinkCore-Setup-x.y.z.exe` installer
3. Run the installer and follow the on-screen instructions

### macOS

1. Visit the [GitHub Releases](https://github.com/MochengCK/LinkCore/releases) page
2. Download `*.dmg` (x64/arm64) or `*-mac.zip` / `*-arm64-mac.zip` (x64/arm64)
3. Using `*.dmg`: Double-click to open, drag the app to `/Applications`
4. Using `*.zip`: Extract and move the app to `/Applications`
5. If prompted "cannot verify developer" on first launch, go to "System Settings > Privacy & Security" and click "Open Anyway", or right-click the app icon in Finder and select "Open"

### Linux

- AppImage (Recommended):
  1. Download `*.AppImage` (`x64` or `arm64`)
  2. Grant execute permission: `chmod +x LinkCore-*.AppImage`
  3. Run: `./LinkCore-*.AppImage`

- Debian/Ubuntu (`.deb` package):
  1. Download `linkcore_*_amd64.deb` or `linkcore_*_arm64.deb`
  2. Install: `sudo dpkg -i linkcore_*.deb`
  3. If dependency issues occur: `sudo apt -f install`

- Other distributions: Use the AppImage method.

## Development Guide

### Prerequisites

- Node.js (v16.0.0 or higher)
- npm or yarn
- Git

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/MochengCK/LinkCore.git
   cd LinkCore
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

### Project Structure

```
LinkCore/
├── src/                  # Main source code
│   ├── main/             # Electron main process
│   ├── renderer/         # Electron renderer process (Vue.js)
│   └── shared/           # Shared utilities
├── static/               # Static assets
├── .electron-vue/        # Electron-Vue configuration
├── screenshots/          # Documentation screenshots
├── package.json          # Project configuration
└── README.md             # Project documentation
```

## Contributing

Contributions are welcome! Whether you're fixing bugs, adding new features, or improving documentation, we appreciate your help.

### How to Contribute

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some feature'`)
5. Push to the branch (`git push origin feature/your-feature`)
6. Create a Pull Request

### Guidelines

- Follow the existing code style
- Write clear and concise commit messages
- Add tests for new features
- Update documentation as needed

## Acknowledgments

- This project is based on the agalwood open-source project [Motrix](https://github.com/agalwood/Motrix), with extensive modifications and feature extensions
- UI Framework: [Vue.js](https://vuejs.org/)
- Desktop Framework: [Electron](https://www.electronjs.org/)
- Video Processing: [FFmpeg](https://ffmpeg.org/)
- Download Engine: [XferCore](https://github.com/MochengCK/XferCore) (deeply customized from [aria2](https://github.com/aria2/aria2))

## Support

If you encounter any issues or have questions:

- Submit an [issue](https://github.com/MochengCK/LinkCore/issues/new/choose) on GitHub
- Join our community for discussion and support

## License

This project is open-sourced under the [MIT License](LICENSE).