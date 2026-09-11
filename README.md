<div align="center">
  <table width="100%">
    <tr>
      <td align="right"><a href="./README-CN.md">中文</a></td>
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
  <a href="#supported-platforms">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-lightgrey.svg?style=for-the-badge" alt="Support Platforms" />
  </a>
  <a href="https://github.com/MochengCK/Lerxu/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/MochengCK/Lerxu.svg?style=for-the-badge" alt="License" />
  </a>
</p>

## Introduction

A modern download manager powered by the in-house XferRust engine (native Rust implementation), optimized for Windows, macOS, Linux, and Android. Supports HTTP(S), FTP/SFTP, BitTorrent, and magnet links with professional-grade features including uTP transport, automatic port mapping, automatic tracker synchronization, task prioritization, batch management, and advanced download presets.

## Screenshots

<table>
  <tr>
    <td align="center" width="50%">
      <img
        src="./screenshots/lerxu-screenshot-light.png"
        alt="Light Mode - Task Management"
        style="max-width: 100%;"
      />
      <p><em>Light Mode</em></p>
    </td>
    <td align="center" width="50%">
      <img
        src="./screenshots/lerxu-screenshot-task.png"
        alt="Dark Mode - Task Management"
        style="max-width: 100%;"
      />
      <p><em>Dark Mode</em></p>
    </td>
  </tr>
</table>

## Engine & Connections

- Lerxu ships with the XferRust download engine (native Rust implementation), which automatically picks the best "Max Connections per Server" strategy for stable and compatible downloads.
- Each task supports up to 128 concurrent segments (32 connections per server by default), backed by a built-in 128M disk cache and connection reuse for smoother parallel downloads.
- The engine restarts automatically after a crash, with task and session state restored; unfinished tasks stay paused after restart and can be resumed manually.
- Note: Real concurrency for single-source downloads depends on the segment count; torrent and multi-mirror downloads can stack concurrency for faster overall speed.

## Core Features

### Performance & Reliability
- **High-speed Downloads**: Optimized for maximum download performance, with a built-in disk cache and connection reuse for smoother multi-task downloads
- **Multi-threaded Support**: Up to 128 concurrent segments per task
- **Concurrent Downloads**: Manage up to 10 download tasks simultaneously
- **Stable Connections**: Robust error handling, automatic retry, and resume support
- **Crash Self-healing**: The engine restarts automatically after an abnormal exit, restoring task state
- **Memory Optimization**: Automatically releases memory when all windows are hidden or minimized

### Protocol Support
- **HTTP/HTTPS**: Download directly from websites, with multi-connection acceleration, Gzip, Keep-Alive, and resume support
- **FTP/SFTP**: Transfer files from FTP servers
- **BitTorrent**: Full torrent file support with selective downloading; uTP/TCP dual transport, DHT, LPD, PeX, and encryption work out of the box
- **Magnet Links**: Direct downloads without .torrent files; choose files freely once metadata is ready
- **ED2K (eDonkey)**: ed2k:// link recognition and browser takeover are kept; native ED2K download capability is on hold
- **Thunder**: thunder:// link protocol takeover

### BitTorrent / Magnet Links
- **Transport Protocols**: uTP (BEP 29) and TCP dual stack, configurable as "uTP-first with TCP fallback / uTP-only / TCP-only", with runtime hot switching
- **Port Mapping**: Automatic UPnP and NAT-PMP mapping for the BT listen port to improve connection success
- **Network Discovery**: DHT (IPv4/IPv6 dual stack), Local Peer Discovery (LPD), and Peer Exchange (PeX)
- **Built-in Trackers & Auto Sync**: Pre-configured tracker servers plus subscription-based scheduled updates, so downloads work out of the box
- **BT Encryption**: Adaptive / forced encryption modes for compatibility with various network environments
- **Peer Management & Anti-leech**: Live peer list in task details (client identification, piece progress), manual peer banning, and automatic banning of misbehaving peers
- **File Selection**: Freely choose which files to download for magnet and torrent tasks once metadata is ready
- **Seeding Control**: Set share-ratio and seeding-time goals; auto-pause or keep seeding on completion

### Video Download
- **Online Video Download (Browser Extension)**: Recognize web videos via the browser extension and send them to the app with one click to create download tasks
- **Download Takeover**: Clicks on download links on web pages (e.g., links with a download attribute or common file extensions) can be handed over to Lerxu, with support for excluding specific sites or file types and a shortcut to temporarily bypass
- **Video Recognition**: Supports multiple video formats (including DASH) and automatically distinguishes audio streams from video streams
- **Unified Task Management**: Video resources appear as regular download tasks in the task list, supporting the same pause/resume/delete management experience as other tasks
- **Merge Progress Display**: Audio/video that needs merging enters a "merging" state with visible progress after download, and correctly merges when multiple segmented videos are sent at once

### User Experience
- **Clean Interface**: Modern, intuitive design with dark / light / system-following themes
- **Custom Background**: Background images and solid colors, UI opacity, frosted-glass blur (native macOS Vibrancy transparency)
- **Native Experience**: Custom title bar on Windows / Linux; preferences embedded in the main window for faster startup
- **Live Speed Display**: The macOS tray icon and Dock icon show both download and upload speeds, with a brand-new tray icon
- **Task Details Drawer**: Overview, activity, connections, peers, trackers, files, and BT piece map in one place
- **Clipboard Auto-paste**: Copied download links are automatically filled into the new-task dialog
- **System Tray Integration**: Quick access and status monitoring
- **Download Notifications**: Real-time alerts when downloads complete, with configurable click actions
- **Speed Control**: Set upload and download speed limits
- **File Management**: Organize downloaded files by category and location, with favorite and recent directories
- **Multilingual**: Simplified Chinese, Traditional Chinese, and English

### Advanced Features
- **Tracker Auto Sync**: Automatic scheduled tracker list updates for improved torrent performance
- **Automatic Port Mapping**: UPnP and NAT-PMP automatically open network ports
- **Custom Download Identity**: Customize the download request identity (User-Agent) for enhanced compatibility
- **Task Scheduling**: Schedule download task start/pause actions
- **Batch Downloads**: Import and export download lists
- **Download Security Scan**: Scan completed files with the system antivirus tool or a custom scanner
- **Proxy Support**: System proxy or custom proxy, applied per download scope
- **Update Channels**: Choose between stable, preview, or all release channels, with automatic installation after the update package downloads

### Unique Features
- **File Categorization**: Auto-sort files by type
- **Custom Categories**: User-defined file categorization rules
- **Task Priority**: Set task priority values to influence download order and resource allocation
- **Custom Download File Extension**: Customize the file extension for in-progress downloads
- **Set File Modification Date to Completion Time**: Optionally set downloaded file modification dates to match completion time
- **Advanced Option Presets**: Name, save, apply, and delete presets for advanced options
- **Link Input Optimization**: Auto-deduplicate links; auto-newline and cursor positioning after paste or autofill
- **Custom Shortcuts**: Set or reset shortcuts for common commands in the "Preferences > Basic > Shortcuts" card

## Supported Platforms

Lerxu currently supports the following platforms:
- **Windows** (10, 11) x64
- **macOS** (Intel x64; Apple Silicon arm64)
- **Linux** (x64, arm64)
- **Android** (arm64): shares the same XferRust engine as the desktop app, built with Kotlin + Compose

## Installation

### Windows

1. Visit the [GitHub Releases](https://github.com/MochengCK/Lerxu/releases) page
2. Download the latest `Lerxu-Setup-x.y.z.exe` installer
3. Run the installer and follow the on-screen instructions

### macOS

1. Visit the [GitHub Releases](https://github.com/MochengCK/Lerxu/releases) page
2. Download `*.dmg` (x64/arm64) or `*-mac.zip` / `*-arm64-mac.zip` (x64/arm64)
3. Using `*.dmg`: Double-click to open, drag the app to `/Applications`
4. Using `*.zip`: Extract and move the app to `/Applications`
5. If prompted "cannot verify developer" on first launch, go to "System Settings > Privacy & Security" and click "Open Anyway", or right-click the app icon in Finder and select "Open"

### Linux

- AppImage (Recommended):
  1. Download `*.AppImage` (`x64` or `arm64`)
  2. Grant execute permission: `chmod +x Lerxu-*.AppImage`
  3. Run: `./Lerxu-*.AppImage`

- Debian/Ubuntu (`.deb` package):
  1. Download `lerxu_*_amd64.deb` or `lerxu_*_arm64.deb`
  2. Install: `sudo dpkg -i lerxu_*.deb`
  3. If dependency issues occur: `sudo apt -f install`

- Other distributions: Use the AppImage method.

### Android

1. Clone this repository and enter the `Android/` directory
2. Open and build with Android Studio, or run: `./gradlew :app:assembleDebug`
3. Install the generated APK on an arm64 device

## Development Guide

### Prerequisites

- Node.js (v22.12.0 or higher)
- npm
- Git

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/MochengCK/Lerxu.git
   cd Lerxu
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
Lerxu/
├── src/                  # Main source code
│   ├── main/             # Electron main process
│   ├── renderer/         # Electron renderer process (Vue 3)
│   └── shared/           # Shared utilities and the XferRust protocol adapter
├── extra/                # Built-in XferRust engine binaries per platform
├── extensions/           # Browser extension (video sniffing & download takeover)
├── Android/              # Android client (Kotlin + Compose)
├── XferRust/             # XferRust download engine source (Rust)
├── static/               # Static assets
├── build/                # Packaging hooks and platform icons
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
- UI Framework: [Vue.js](https://vuejs.org/) + [Element Plus](https://element-plus.org/)
- Desktop Framework: [Electron](https://www.electronjs.org/)
- Download Engine: [XferRust](https://github.com/MochengCK/XferRust) (in-house Rust download engine)

## Support

If you encounter any issues or have questions:

- Submit an [issue](https://github.com/MochengCK/Lerxu/issues/new/choose) on GitHub
- Join our community for discussion and support

## License

This project is open-sourced under the [Apache License 2.0](LICENSE).
