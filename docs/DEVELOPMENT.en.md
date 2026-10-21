# Developer Documentation

[中文](./DEVELOPMENT.md)

For **contributors and maintainers**. End users should read the [README](../README.md) instead.

- [Repository layout](#repository-layout)
- [Desktop app](#desktop-app)
- [Runtime tests](#runtime-tests)
- [Android client](#android-client)
- [Browser extension](#browser-extension)
- [Continuous integration](#continuous-integration)

## Repository layout

```
Lerxu/
├── src/                  # Desktop app (Electron + Vue 3)
│   ├── main/             # Main process: windows, tasks, config, IPC
│   ├── renderer/         # Renderer process: UI and interaction
│   └── shared/           # Shared utilities, constants and locales
├── Android/              # Android client (Kotlin + Compose)
├── extensions/           # Browser extension source (Chromium + Firefox)
├── extra/                # Runtime binaries for each platform, shipped with the app
├── test/                 # Runtime tests
├── scripts/              # Build and validation scripts
├── build/                # electron-builder hooks and platform icons
├── docs/                 # Developer documentation
└── .github/workflows/    # CI and release pipelines
```

The desktop app, the Android client and the browser extension live in this repository; the runtime
binaries under `extra/` ship with it and are not compiled here.

## Desktop app

Requirements: Node.js 22.12.0+, npm, Git.

```bash
npm install                 # install dependencies
npm run dev                 # development mode (hot reload)
npm run build               # build installers for the current platform (release/)
npm run build:dir           # unpacked build only
npm run build:github        # front-end bundles only (used by CI)
npm run build:applesilicon  # build the macOS arm64 target
npm run preview             # preview the built bundles locally
npm run lint                # ESLint
npm run lint:fix            # ESLint with --fix
npm run lint:workflows      # validate .github/workflows
```

**ESLint rule tiers**: `error` is reserved for rules that catch real defects (`no-undef`,
`no-dupe-keys`, `vue/no-ref-as-operand`, …); purely stylistic rules (`indent`, `vue/script-indent`,
`no-unused-vars`) are `warn` — script indentation baselines differ across files, so making them errors
would keep CI permanently red. To normalise formatting run `npx eslint --ext .js,.vue src --fix`, then
tighten the rules.

**Workflow validation**: `scripts/check-workflows.js` validates every `if:` condition and `${{ }}`
expression against GitHub's context availability table and checks that `uses` entries carry a version.
It catches mistakes that are valid YAML but rejected by GitHub (such as using `secrets` in `if:`), and
runs as part of the `lint-and-typecheck` job.

## Runtime tests

All test scripts are plain Node with no dependencies and can be run directly.

| Script | Coverage |
| --- | --- |
| `npm run test:extension` | Extension: dual-platform manifest differences, compat layer behaviour, archive structure |
| `npm run test:taskpair` | Audio/video pairing: one record per pairId, progress aggregated over both streams |
| `npm run test:mergeinput` | Merge input ownership, so the same file is never merged twice |
| `npm run test:playback` | Playback path: segment serving and media splicing |
| `npm run test:packaging` | Packaging completeness: per-platform runtime assets present |

The app-level smoke test (launch the packaged app and complete one HTTP download) runs in the `app-tests`
composite action across the three desktop platforms in CI.

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

**Signing** (optional): `app/build.gradle.kts` reads signing credentials from environment variables and
produces an unsigned APK when they are absent.

```bash
ANDROID_KEYSTORE_PATH=/path/to/release.keystore \
ANDROID_KEYSTORE_PASSWORD=*** \
ANDROID_KEY_ALIAS=*** \
ANDROID_KEY_PASSWORD=*** \
  ./gradlew :app:assembleRelease
```

**Unit tests** (`Android/app/src/test/`, executed by CI):

- `FormatUtilsTest`: progress, speed and duration formatting plus per-status colours, including boundaries
- Built-in browser and UI state machine: `AdBlockerTest`, `BrowseHistoryTest`, `BrowserRulesTest`,
  `StartPageTest`, `DockFollowTest`, `TabCardMotionTest`, `TabPersistenceTest`
- Media and updates: `HlsManifestFixerTest`, `MediaProbeTest`, `VideoSnifferPickTest`, `AppUpdateTest`,
  `ReleaseNotesTest`, `StatPollingTest`, `AppPageBackTest`

### Android SDK setup in CI

`.github/actions/android-sdk` (a composite action) is shared by both workflows' Android jobs: it locates
the SDK preinstalled on the runner, accepts licenses, installs `platform-tools` /
`platforms;android-<API>` / `build-tools;<version>` and exports `ANDROID_SDK_ROOT` / `ANDROID_HOME` for
Gradle (`Android/local.properties` is not tracked, so Gradle relies on those environment variables).

`android-actions/setup-android@v3` is not used: it runs `sdkmanager tools`, and Google has removed the
`tools` package from the SDK repository, so it fails outright. Two rules must hold when maintaining the
action (enforced by `npm run lint:workflows`):

1. **Quote package names containing semicolons**: in `sdkmanager --install platforms;android-35` the `;`
   is a shell metacharacter that separates commands even without spaces — write
   `--install "platforms;android-35"` (same for `build-tools;35.0.0`).
2. **Use `${VAR}` when a variable is adjacent to non-ASCII text**: under a non-UTF-8 locale bash folds the
   multibyte bytes into the variable name (`$API、` is parsed as the variable `API、`), and with `set -u`
   that fails with `unbound variable`.

## Browser extension

The extension runs identical code on both platforms (unified `chrome.*` callback style plus the
`firefox-compat.js` compat layer); only the manifest differs:

| Aspect | Chromium (Chrome / Edge / Opera) | Firefox |
| --- | --- | --- |
| Background | `background.service_worker` | `background.scripts` (event page; Firefox does not support MV3 `service_worker`) |
| Extension ID | Not required (store-assigned) | Required in MV3 via `browser_specific_settings.gecko.id` |
| Platform-only permission | Includes `downloads.ui` (download bubble control) | Excluded (Firefox has no such permission) |
| `downloads.onDeterminingFilename` | Supported (intercepts before the file is written) | Not supported, falls back to `downloads.onCreated` (functionally equivalent) |
| `downloads.setUiOptions` | Supported | Not supported, bubble control is skipped |
| Data collection declaration | Not required | Required `gecko.data_collection_permissions` (mandatory for new AMO submissions) |

Build, packaging, testing and AMO submission instructions live in the
[extension developer notes](../extensions/lerxu-webextension/README.md); the listing copy is in
[AMO-LISTING.md](../extensions/lerxu-webextension/AMO-LISTING.md).

## Continuous integration

Both workflows follow the same order: validate configuration and shipped artifacts first, then build and
test.

### CI Tests (`.github/workflows/main.yml`)

| Job | Runner | Coverage |
| --- | --- | --- |
| `lint-and-typecheck` | ubuntu | ESLint, workflow validation, `package.json` / electron-builder config, shipped binary integrity (existence, byte-identical copies, architecture) |
| `build-and-test` | ubuntu / windows / macos | Build the unpacked app → runtime tests (app launch, local RPC auth, HTTP download loop), uploads logs on failure |
| `android-build-and-test` | ubuntu | Unit tests → lint. Does not build APKs (the signed APK comes from release.yml) |
| `extension-test` | ubuntu | Dual-platform manifest checks → compat layer behaviour → archive structure → build and `web-ext lint` (zero errors required) |
| `test-report` | ubuntu | Aggregated results |

Triggers: pushes to `main` / `develop`, PRs to `main`, a weekly full run, and manual dispatch.

### Release (`.github/workflows/release.yml`)

On pushes to `main` it builds release artifacts for every platform and uploads them to one draft release
after the tests pass:

- Desktop: `.exe`, `.dmg`, `.zip`, `.AppImage`, `.deb`
- Android: `app-release.apk` only (signed; the job fails when signing credentials are missing)
- Browser extension: `lerxu-webextension-firefox-<version>.zip` / `.xpi`,
  `lerxu-webextension-chromium-<version>.zip`

**Android signing secrets** (required; the android job fails without them): `ANDROID_KEYSTORE_BASE64`
(base64 of the keystore), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

**`secrets` cannot be used in `if:` conditions**: GitHub rejects the workflow with
`Unrecognized named-value: 'secrets'` (`if` only allows github / needs / strategy / matrix / job / runner /
env / vars / steps / inputs). To branch on whether a credential exists, inject the secret into a job-level
`env` and test it in the shell.
