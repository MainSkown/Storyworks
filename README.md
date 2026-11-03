# Storyworks

A local-first desktop app for writing a book. Manuscript, timelines, world rules and characters live side by side, and the app checks that they agree with each other. Everything is stored as plain JSON files in a folder you choose; nothing is sent anywhere.

Built with Tauri 2, Vue 3, TypeScript, Quasar and TipTap. The UI is available in English and Polish.

> **Status:** v1.0.0. Book, screenplay and game-script projects. See [CHANGELOG.md](CHANGELOG.md).

## Features

- **Three project kinds**: book, screenplay (elements, scene numbers, page count, PDF/Word/Fountain) and game script (speakers and line IDs, variables, branching conversations, story map, routes, game-document with mechanics and glossary, game JSON/CSV export and game checks).
- **Manuscript editor**: parts, chapters and scenes with stable block IDs, footnotes, comments, images, scene status and synopsis, corkboard, inbox, focus mode.
- **Timelines**: branching event graphs with a custom calendar; link any paragraph to an event.
- **Rules**: the laws of your world, linkable from scenes and events.
- **Codex**: characters, places, items and custom types with aliases, relationships, groups, dated states, and who-knows-what-since-when.
- **Consistency checks** (no AI): dates out of order, knowledge used too early, appearances after a final state, broken links and more. Each check can be switched off.
- **Snapshots and backups**: plain-word history with restore, plus automatic backups.
- **Search and quick switcher**, writing goals, stats and streaks, spellcheck with bundled English and Polish dictionaries and your own.
- **Import** Markdown and plain text with a preview; **export** to PDF and DOCX, with optional dramatis personae, glossary and chronology appendices.
- **Safety**: single-writer lock, external-change detection, crash recovery, local diagnostics log.
- **Comfort**: light and dark themes, UI zoom, rebindable shortcuts, keyboard-operable UI, guided tour per project kind and bundled sample book, screenplay and game script.

## Install

Installers are attached to each release (Linux: `.deb` and `.AppImage`; Windows: `.msi` and `.exe`). They are not code-signed, so Windows SmartScreen warns on first run: choose **More info → Run anyway**.

Or build from source, below.

## Build from source

Requirements: Node 22, yarn 1, Rust (stable). Linux also needs the Tauri system packages:
`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev patchelf`.

```
yarn install
yarn dev          # browser version at http://localhost:1420 (no real folders, for quick UI work)
yarn tauri:dev    # desktop window
yarn tauri build  # installers in src-tauri/target/release/bundle/
```

Windows installers must be built on Windows (the release workflow does it). Regenerate icons from `src-tauri/icon-source/app-icon.png` with `yarn tauri icon src-tauri/icon-source/app-icon.png`.

## Develop

```
yarn typecheck
yarn lint
yarn test
```

The sample books in `public/samples/` are generated: run `yarn samples` after changing `src/samples/` or the project format.

- Feature spec (source of truth): [docs/features/storyworks-app.md](docs/features/storyworks-app.md)
- Milestones and plans: [docs/plan/](docs/plan/milestones.md)
- Accessibility audits: [book](docs/review/a11y-m11a.md), [script kinds](docs/review/a11y-m11b.md); performance: [docs/review/perf-m11b.md](docs/review/perf-m11b.md)

## Release

1. Bump `version` in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; commit.
2. `git tag vX.Y.Z && git push origin vX.Y.Z` (same version as above).
3. The `Release` workflow (also runnable from the Actions tab) builds on Ubuntu 22.04 and Windows and attaches the installers to a **draft** release. Check them, then publish.

`CI` runs typecheck, lint and tests on pull requests and pushes to `main`.

## Your data

A book is a plain folder (`project.json`, scenes, `assets/`, local `dictionaries/`, snapshot history). Back it up or sync it like any folder.

App settings, logs, the crash marker and global dictionaries live in the per-user app-data directory:

| OS | Path |
| --- | --- |
| Linux | `~/.local/share/storyworks/` |
| Windows | `%APPDATA%\storyworks\` |

The logs hold event names only, never manuscript text. Do not change the app identifier: it fixes this path.

## Licence

Storyworks is free software: you can redistribute it and modify it under the terms of the [GNU General Public License v3.0](LICENSE) (GPL-3.0-only).

Copyright © 2026 MainSkown.

Bundled third-party components keep their own licences, all compatible with the GPL-3.0: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Polish spellcheck dictionary is used under MPL-2.0 ([licenses/MPL-2.0.txt](licenses/MPL-2.0.txt)).
