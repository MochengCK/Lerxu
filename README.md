<div align="center">
  <table width="100%">
    <tr>
      <td align="right"><a href="./README-CN.md">Chinese</a></td>
    </tr>
  </table>
</div>

<p align="center">
  <img src="./screenshots/屏幕截图 2025-12-09 052141.png" width="1100" alt="LinkCore Download Manager Logo" />
</p>

<p align="center">
  <a href="https://github.com/MochengCK/LinkCore-Download-Manager/releases">
    <img src="https://img.shields.io/github/v/release/MochengCK/LinkCore-Download-Manager.svg?style=for-the-badge" alt="GitHub release" />
  </a>
  <a href="https://github.com/MochengCK/LinkCore-Download-Manager/releases">
    <img src="https://img.shields.io/github/downloads/MochengCK/LinkCore-Download-Manager/total.svg?style=for-the-badge" alt="Total Downloads" />
  </a>
  <a href="#supported-platforms">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=for-the-badge" alt="Support Platforms" />
  </a>
  <a href="https://github.com/MochengCK/LinkCore-Download-Manager/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/MochengCK/LinkCore-Download-Manager.svg?style=for-the-badge" alt="License" />
  </a>
</p>

## Introduction

LinkCore Download Manager is a clean, elegant, and easy-to-use cross-platform download manager built with modern web technologies. It offers an intuitive out-of-the-box interface, clear task workflows, and minimal necessary settings, making download management simpler. It supports common download protocols and integrates with a browser extension for online video sniffing and downloading, covering everyday usage scenarios.

LinkCore Download Manager also provides professional-level download capabilities: BitTorrent/Magnet support, UPnP/NAT-PMP port mapping, automatic Tracker updates, task priority and batch management, quick download engine switching, and advanced option presets to meet advanced and heavy download needs.

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
- **Quick Engine Switching**: Quickly switch between different download engines
- **Advanced Option Presets**: Name, save, apply, and delete presets for advanced options
- **Link Input Optimization**: Auto-deduplicate links; auto-newline and cursor positioning after paste or autofill
- **Custom Shortcuts**: Set or reset shortcuts for common commands in the "Preferences > Basic > Shortcuts" card

## Supported Platforms

LinkCore Download Manager currently supports the following platforms:
- **Windows** (7, 8, 10, 11)
- **macOS** (Intel, x64; Apple Silicon, arm64)
- **Linux** (x64, arm64)

## Installation

### Windows

1. Visit the [GitHub Releases](https://github.com/MochengCK/LinkCore-Download-Manager/releases) page
2. Download the latest `LinkCore-Download-Manager-Setup-x.y.z.exe` installer
3. Run the installer and follow the on-screen instructions

### macOS

1. Visit the [GitHub Releases](https://github.com/MochengCK/LinkCore-Download-Manager/releases) page
2. Download `*.dmg` (x64/arm64) or `*-mac.zip` / `*-arm64-mac.zip` (x64/arm64)
3. Using `*.dmg`: Double-click to open, drag the app to `/Applications`
4. Using `*.zip`: Extract and move the app to `/Applications`
5. If prompted "cannot verify developer" on first launch, go to "System Settings > Privacy & Security" and click "Open Anyway", or right-click the app icon in Finder and select "Open"

### Linux

- AppImage (Recommended):
  1. Download `*.AppImage` (`x64` or `arm64`)
  2. Grant execute permission: `chmod +x LinkCore-Download-Manager-*.AppImage`
  3. Run: `./LinkCore-Download-Manager-*.AppImage`

- Debian/Ubuntu (`.deb` package):
  1. Download `linkcore-download-manager_*_amd64.deb` or `linkcore-download-manager_*_arm64.deb`
  2. Install: `sudo dpkg -i linkcore-download-manager_*.deb`
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
   git clone https://github.com/MochengCK/LinkCore-Download-Manager.git
   cd LinkCore-Download-Manager
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
LinkCore-Download-Manager/
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
- Download Engine: [FluxCore](https://github.com/MochengCK/FluxCore)

## Support

If you encounter any issues or have questions:

- Submit an [issue](https://github.com/MochengCK/LinkCore-Download-Manager/issues/new/choose) on GitHub
- Join our community for discussion and support

## License

This project is open-sourced under the [MIT License](LICENSE).