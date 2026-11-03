# Storyworks

Desktop app for writing a book: manuscript editor, timelines, rules, codex, consistency checks, snapshots, export
to PDF and DOCX. Tauri 2 + Vue 3 + TypeScript + Quasar + TipTap. Spec: `docs/features/storyworks-app.md`.

## Requirements

Node 22, yarn 1, Rust (stable). Linux also needs the Tauri system packages
(`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev patchelf`).

## Run

```
yarn install
yarn dev          # browser version at http://localhost:1420 (no real folders, for quick UI work)
yarn tauri:dev    # desktop window
```

## Test

```
yarn typecheck
yarn lint
yarn test
```

## Build

```
yarn tauri build
```

Output in `src-tauri/target/release/bundle/`: `deb/` and `appimage/` on Linux, `nsis/` and `msi/` on Windows
(Windows installers must be built on Windows, e.g. by the release workflow). Installers are unsigned; Windows
SmartScreen will warn on first run.

The app icon comes from `src-tauri/icon-source/app-icon.png` (1024 px); regenerate all sizes with
`yarn tauri icon src-tauri/icon-source/app-icon.png`.

## Release

1. Bump `version` in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; commit.
2. `git tag v0.1.0 && git push origin v0.1.0`.
3. The `Release` workflow (also runnable by hand from the Actions tab) builds on Ubuntu 22.04 and Windows and
   attaches the installers to a **draft** release. Check them, then publish the draft.

`CI` runs typecheck, lint and tests on pull requests and pushes to `main`.

## Where data lives

| | App settings, logs, crash marker, global dictionaries |
| --- | --- |
| Linux | `~/.local/share/io.github.mainskown.storyworks/` |
| Windows | `%APPDATA%\io.github.mainskown.storyworks\` |
| macOS (not shipped) | `~/Library/Application Support/io.github.mainskown.storyworks/` |

Books are plain folders you choose (`project.json`, scenes, `assets/`, local `dictionaries/`, snapshots). Nothing is
sent anywhere. Do not change the app identifier: it fixes the app-data path.

## Licences

See `LICENSE` (placeholder), `THIRD_PARTY_NOTICES.md` and `licenses/MPL-2.0.txt` (Polish dictionary).
