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

A modern download manager powered by the XferCore engine, optimized for Windows, macOS, and Linux. Supports HTTP, FTP, BitTorrent, and Magnet links with professional-grade features including UPnP/NAT-PMP port mapping, automatic Tracker updates, task prioritization, batch management, and advanced download presets.

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

## Core Features

### Performance & Reliability
- **High-speed Downloads**: Optimized for maximum download performance
- **Multi-threaded Support**: Up to 128 threads per task
- **Concurrent Downloads**: Manage up to 10 download tasks simultaneously
- **Stable Connections**: Robust error handling and automatic retry mechanism

### Protocol Support
- **HTTP/HTTPS**: Download directly from web servers
- **FTP/SFTP**: Transfer files from FTP servers
- **BitTorrent**: Full torrent file support with selective downloading
- **Magnet Links**: Direct downloads without .torrent files

### Video Download
- **Online Video Download (Browser Extension)**: Sniff video resources via browser extension, send to the app with one click to create download tasks (includes necessary request headers for improved availability)
- **Unified Task Management**: Video resources appear as regular download tasks in the task list, supporting the same pause/resume/delete management experience as other tasks

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