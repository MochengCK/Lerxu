# Developer Documentation

For **contributors and maintainers**. End users should read the [README](../README.md) instead.

- [Repository layout](#repository-layout)
- [Desktop app](#desktop-app)
- [Engine deployment](#engine-deployment)
- [Android client](#android-client)
- [Browser extension](#browser-extension)
- [Continuous integration](#continuous-integration)

## Repository layout

```
Lerxu/
├── src/                        # Desktop app (Electron + Vue 3)
│   ├── main/                   # Main process: engine lifecycle, tasks, config, IPC
│   ├── renderer/               # Renderer process: UI and interaction
│   └── shared/                 # Shared modules (incl. engine protocol adapter in xferrust/)
├── extra/<platform>/engine/    # Built-in engine binaries shipped with the repo
├── extensions/lerxu-webextension/lerxu-webextension/   # Extension source (Chromium + Firefox)
├── Android/                    # Android client (Kotlin + Compose)
├── scripts/                    # Build scripts (extension packaging, etc.)
├── test/                       # Runtime tests (engine / app / extension)
├── build/                      # electron-builder hooks and platform icons
└── .github/workflows/          # CI (tests) and Release (publishing)
```

`XferRust/` (the engine source) is a **separate repository** kept locally as a nested directory and is not
tracked by this repository.

## Desktop app

Requirements: Node.js v22.12.0+, npm, Git.

```bash
npm install          # install dependencies
npm run dev          # development mode (hot reload)
npm run build        # build installers (outputs to release/)
npm run build:dir    # unpacked build only (CI uses it for runtime tests)
npm run lint         # ESLint
```

## Engine deployment

The app does **not** compile the engine; per-platform engine binaries ship with the repository. After an
engine upgrade, deploy it to every platform:

| Platform | Path |
| --- | --- |
| macOS Intel | `extra/darwin/x64/engine/xferrust` |
| macOS Apple Silicon | `extra/darwin/arm64/engine/xferrust` |
| Linux x64 | `extra/linux/x64/engine/xferrust` |
| Linux arm64 | `extra/linux/arm64/engine/xferrust` |
| Windows x64 | `extra/win32/x64/engine/xferrust.exe` |
| Android arm64 | `Android/app/src/main/assets/xferrust` **and** `Android/app/src/main/jniLibs/arm64-v8a/libxferrust.so` |

Notes:

- **The two Android copies must be byte-identical**: the client uses the file size as its version fingerprint
  (`filesDir/xferrust.version`), so a mismatch makes it re-extract the engine on every launch
- **The Android engine must be an aarch64 ELF**: `abiFilters` only ships `arm64-v8a`; an x86 / armeabi
  binary would be rejected by the installer
- Desktop picks up a redeployed engine after a restart; Android requires rebuilding the APK
- Engine build instructions for macOS / Linux / Windows / Android live in the engine repository
  (`XferRust/.github/RELEASE_*.md`); a local machine can usually only build its own platform, the rest come
  from that repository's CI

## Android client

Requirements: JDK 17, Android SDK (`platforms;android-35`, `build-tools;35.0.0`, `platform-tools`), plus
`sdk.dir=<SDK path>` in `Android/local.properties` (not tracked).

```bash
cd Android
JAVA_HOME=<jdk17 path> ./gradlew :app:assembleDebug :app:assembleRelease   # APKs
JAVA_HOME=<jdk17 path> ./gradlew :app:testDebugUnitTest                   # unit tests
JAVA_HOME=<jdk17 path> ./gradlew :app:lintDebug                           # static analysis
```

Artifacts: `Android/app/build/outputs/apk/{debug,release}/*.apk`

**Signing** (optional): `app/build.gradle.kts` supports environment-driven release signing; without it the
build produces an unsigned APK:

```bash
ANDROID_KEYSTORE_PATH=/path/to/release.keystore \
ANDROID_KEYSTORE_PASSWORD=*** \
ANDROID_KEY_ALIAS=*** \
ANDROID_KEY_PASSWORD=*** \
  ./gradlew :app:assembleRelease      # → app-release.apk (signed)
```

**Unit tests** (`Android/app/src/test/`, executed by CI):

- `EngineBinaryTest`: engine binary integrity — byte-identical copies, ELF header (64-bit little-endian
  AArch64), size floor, capability strings (guards against stale engines or wrong architectures)
- `FormatUtilsTest`: progress / speed / duration formatting and per-status colours, including boundaries

## Browser extension

The extension runs identical code on both platforms (unified `chrome.*` callback style plus the
`firefox-compat.js` compat layer); only the manifest differs:

| Aspect | Chromium (Chrome / Edge / Opera) | Firefox |
| --- | --- | --- |
| Background | `background.service_worker` (single-file SW) | `background.scripts` (event page; **Firefox does not support MV3 `service_worker`**) |
| Extension ID | Not required (store-assigned) | Required in MV3 via `browser_specific_settings.gecko.id` |
| Platform-only permission | Includes `downloads.ui` (download bubble control) | Excluded (Firefox has no such permission) |
| `downloads.onDeterminingFilename` | Supported (intercepts before the file is written) | Not supported → falls back to `downloads.onCreated` (functionally equivalent) |
| `downloads.setUiOptions` | Supported | Not supported → bubble control is skipped |
| Data collection declaration | Not required | Required `gecko.data_collection_permissions` (mandatory for all new AMO submissions since 2025-11-03) |

Full build, packaging, testing and AMO submission instructions live in the
**[extension developer notes](../extensions/lerxu-webextension/README.md)**; the AMO listing copy
(name / summary / description / reviewer notes) is in
[AMO-LISTING.md](../extensions/lerxu-webextension/AMO-LISTING.md).

## Continuous integration

Both workflows share one rule: **engine binaries ship with the repository and CI never compiles the engine**,
so every workflow verifies the engine artifacts first, then builds and tests.

### CI Tests (`.github/workflows/main.yml`)

| Job | Runner | Coverage |
| --- | --- | --- |
| `lint-and-typecheck` | ubuntu | ESLint, `package.json` / electron-builder config checks, **all engine artifacts** (5 desktop + 2 Android: existence, byte-identical copies, architecture) |
| `build-and-test` | ubuntu / windows / macos | Build the unpacked app → engine runtime tests (RPC probe, HTTP download, BT local-swarm loop) → app smoke test (launch app → engine subprocess → RPC auth → one HTTP download through the app engine) |
| `android-build-and-test` | ubuntu | Engine verification (aarch64 / identical copies / capability strings) → unit tests → lint → build debug + release APKs → verify the engine is packaged and the ABI is `arm64-v8a` only → upload APKs |
| `extension-test` | ubuntu | Dual-platform manifest checks (Firefox has no `service_worker`, requires `gecko.id`, must not carry Chromium-only permissions, requires the data-collection declaration) → compat layer behaviour (callback wrapping / `runtime.lastError` / event objects untouched / idempotency) → archive layout checks (root-level `manifest.json`, no macOS metadata, no dev scripts) → build and `web-ext lint` (zero errors required) |
| `test-report` | ubuntu | Aggregated results |

Triggers: pushes to `main` / `develop`, PRs to `main`, a weekly full run (Monday 06:00), and manual dispatch.

### Release (`.github/workflows/release.yml`)

On pushes to `main` it builds release artifacts for every platform and uploads them to one draft release only
after the tests pass:

- Desktop (ubuntu / windows / macos): `.exe`, `.dmg`, `.zip`, `.AppImage`, `.deb`
- Android (ubuntu): `app-debug.apk`, `app-release-unsigned.apk` (signed when the signing secrets are configured)
- Browser extension (ubuntu): `lerxu-webextension-firefox-<version>.zip` / `.xpi`, `lerxu-webextension-chromium-<version>.zip`
- Both workflows run engine and app runtime tests through the shared `app-tests` composite action; any failure blocks the upload
