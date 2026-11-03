# M11a · Implementation plan: Import, onboarding, safety, polish, release (Book projects)

Scope: [milestones.md](milestones.md#m11--import-onboarding-polish-and-release). Spec: Import, Comfort and accessibility, App safety and recovery, Edge cases (long books).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** M10 committed (60c673b). Real-window checks of M9/M10 still pending (do them in step 9, not blocking).

## Decisions (confirmed by user)
- **Split:** M11a now (Book only); **M11b** after S1–S6 = sample screenplay, sample game script (conversation + story map), tour steps for script kinds, audit of script/conversation/story-map canvases.
- **Packaging:** GitHub Actions matrix (Linux AppImage + deb, Windows MSI/NSIS), unsigned, no auto-update. Windows install check is the user's.
- **Signing:** none for now; the app is for the user's own use. If Windows ever needs it, a self-signed cert goes in GitHub Actions secrets (base64 `.pfx` + password) and is trusted manually on that machine.
- **Shortcuts:** only app-level actions are rebindable; editor formatting keys are fixed but listed in the overlay.

## What already exists
- Settings file (app data, v3) with `fileIO.ts`; `WelcomeView` (New / Open / browser list); `lock.rs`, `history.rs`; automatic backups (M9); `sanity`-style `longBook.test.ts` + `scripts/perf-*.mjs`; shortcuts hardcoded in `panelShortcut.ts`, `focusMode.ts`, `searchShortcuts.ts`, `EditorToolbar.vue`, `AppShell.vue`.
- Not present: import, sample book, tour, overlay/rebinding, running marker, log, Help menu, CI, icons beyond defaults.

## Defaults I will use unless you object
- **Help** = a "Help" button at the bottom of the sidebar and on the Welcome screen (no native menu): Tour, Shortcuts, Open log folder, About. **File > Import** = "Import…" in the Write tree header menu and on Welcome (needs an open book, so Welcome only after open).
- Import: UTF-8 only (BOM stripped); `.md`/`.txt`, multi-file in selected order; each file's first H1 text as chapter name else file name; Markdown parsed with `markdown-it` (+ footnote plugin) → ProseMirror JSON via existing schema; parts are not created by import (only chapters/scenes).
- Sample book is generated from a JSON fixture folder in `public/samples/book-{en,pl}/` and copied via the normal project writer, so it always matches the current schema (a test opens it and checks the deliberate warning).
- Tour: 5 steps as overlay popovers anchored to sidebar sections; "seen" flag in app settings; Welcome offers "Take the tour" which opens the sample book first only if no book is open.
- Crash marker: `running.json` in app data (pid, start time, last book path); written at start, removed on clean exit (`beforeunload` + Tauri close event). Found at start → dialog "The app closed unexpectedly": **Reopen last book** (then schema-verify all files, offer latest automatic backup if any is invalid), **Dismiss**. A second live instance (pid alive) does not count as a crash.
- Log: `logs/storyworks-N.log` in app data, 5 files × 1 MB rolling, JSON lines `{ts, level, event, code?}`; no manuscript text, no paths beyond the book folder name. Fed by a tiny `log.ts` used by open/save/migrate/export/restore error paths and window `error`/`unhandledrejection`.
- Performance target: 300 000-word book (≈1 500 scenes) opens to a usable tree in under 3 s; search, sidebar and switcher stay under 100 ms per keystroke; measured by existing `perf-*` scripts plus a new combined one.

## Steps

### 1. Import core (H) · tests first
`src/import/`: `decode.ts` (UTF-8 check, BOM; invalid → error naming the file, nothing created), `parse.ts` (Markdown/text → blocks: H1–H3 with deeper clamped, bold/italic, lists, quotes, scene break, footnotes, image refs), `split.ts` (three rules: H1/H2 default, H1 only, scene-break line; plain text = one chapter per file), `plan.ts` (build the preview tree with word counts, rename and skip flags, placement: end of tree or after selected), `apply.ts` (create nodes via the store, copy local images into `assets/` and skip missing with warnings, automatic backup first). Tests: each split rule on a fixture, heading clamp, footnote mapping, missing image warning, invalid UTF-8 rejects whole import, skipped items not created, append vs after-selected order, stable ids on re-run of the plan.

### 2. Import UI (N) · after 1
`ImportDialog.vue`: file picker (Tauri dialog; browser file input), split-rule select, preview tree with checkboxes + rename, warnings list, confirm. Entry points as above. i18n EN/PL (**T**).

### 3. Sample books (N) · parallel with 1
`public/samples/book-en|pl/`: short story, branching timeline, 3 rules, codex entries with relationships, links, states/knowledge touching the Checks page, one deliberate date-order warning. Welcome "Open sample book": pick folder → copy (bundle stays read-only) → open. Test: opening each sample validates against all schemas and yields exactly the expected finding. Writing the EN/PL story text is **T**.

### 4. Shortcut registry + overlay + rebinding (H) · tests first
`src/shortcuts/`: `registry.ts` (id, default combo, label key, scope), `match.ts` (physical-key aware, as in `panelShortcut.ts`), `conflicts.ts` (same combo in overlapping scopes, reserved OS/browser combos), `useShortcuts.ts` (one global handler replacing the three ad-hoc ones). Settings gains `shortcuts: {id: combo}` overrides (v4 settings migration + test). Overlay (Ctrl/Cmd+/) lists app + fixed editor keys; Settings tab to rebind with conflict message and "Restore defaults". Tests: default match, override match, conflict detected/none, restore, unknown id in file ignored, settings v3→v4.

### 5. Crash-safe startup + log (H) · tests first, parallel with 4
Rust: none beyond fs scope if the JS side suffices (check `capabilities`). `src/safety/`: `marker.ts`, `startup.ts` (decide: clean / crashed / other-instance), `verify.ts` (validate every book file against schemas, report invalid, find latest automatic backup), `log.ts` (rolling writer, 5×1 MB, no manuscript text). Dialog UI and "Open log folder" via opener plugin (**N**). Tests: marker lifecycle, crash detected, live-pid not a crash, verify finds a bad file and leaves it untouched, rotation keeps 5 files / 1 MB, log lines contain no text from a test manuscript.

### 6. Tour (N) · after 3
`TourOverlay.vue` + `tour/steps.ts` (manuscript, timelines and linking, rules, codex, checks), keyboard-operable (Esc, arrows), dismissable, re-run from Help; seen flag in settings. Steps are data so M11b adds script-kind steps. i18n (**T**).

### 7. Accessibility audit and fixes (N, with H review)
Checklist run on every page in both themes: keyboard path through tree, toolbar, dialogs, menus; accessible names on icon-only buttons (lint-style test that scans templates for `QBtn` with `icon` and no label/aria-label); focus ring visible; contrast of section tokens and tags in both themes (script computing ratios from the tokens, fail < 4.5:1; fix tokens); `prefers-reduced-motion` honoured; list-view alternatives present for timeline and relationship canvases (exist from M3/M6; verify keyboard parity). Output: `docs/review/a11y-m11a.md` with findings fixed / deferred. Conversation and story-map canvases wait for M11b.

### 8. Performance pass (N)
Generate a 300k-word book fixture (script), measure open, tree render, scene switch, search, checks run, snapshot, export; profile worst offenders; fix only what misses the targets. Record numbers in the plan. Keep `longBook.test.ts` as the regression guard (add a budget assertion on the pure parts).

### 9. Packaging and release (N)
App icon set from one source (`tauri icon`), bundle metadata (identifier unchanged), bundle the Hunspell dictionaries, samples and fonts as resources, check app-data paths per OS against the spec (Linux `~/.local/share/io.github.mainskown.storyworks/`, Windows `%APPDATA%`, macOS untouched). `.github/workflows/release.yml`: on tag `v*`, matrix ubuntu + windows, `tauri-action`, upload artifacts to a draft release. Build Linux bundle locally and install-test it; MPL-2.0 text + third-party notices file shipped. Real-window checks (M9: snapshots/backups; M10: global dictionaries, bundled dictionaries from resources, `stats.json` on close, Polish dictionary load) done on the packaged Linux build and recorded.

### 10. Review, docs, screenshots (N)
Tick spec items, add decisions to the spec, README (build, run, release), screenshots of Import dialog, Welcome, tour, overlay/rebinding, crash dialog, Help into the same "Storyworks Screens" Artifact (M11 section), update memory.

## Order
1 ∥ 3 ∥ 4 ∥ 5 → 2 (after 1) → 6 (after 3) → 7 → 8 → 9 → 10. Steps 1, 4, 5 are the hard ones: tests first, I review before accepting.

## Done when (M11a)
A real Markdown draft imports into a navigable book; EN and PL sample books open and show the deliberate warning; tour runs and can be re-run; shortcuts can be rebound with conflicts caught; a killed app offers recovery on next start and a log exists; audit file shows no open blockers; 300k-word book meets the budgets; Linux bundle installs and CI produces Windows installers. M11b (script samples, script canvas audit) remains open.

## Step 8 result: performance pass (300 000 words, 1 500 scenes, 200 entries, 300 nodes, 30 rules, 20 knowledge items)
Run: `node scripts/perf-m11.mjs` (needs `yarn dev` on :1420; `--node-only` skips the browser half; `PROFILE=1` prints the open profile). Fixture: `scripts/perf-fixture.ts`, written through the real project writer. Node = real stores on a memory folder; browser = headless Chromium on the dev build with a Map-backed Storage (the 5 MB book exceeds Chrome's localStorage quota).

| Metric | Budget | Before | After |
|---|---:|---:|---:|
| Open to usable tree (browser, 1 660 rows) | 3 s | 0.91 s | 0.82 s |
| Open, all files read + stores loaded (node) | 3 s | 98 ms | 101 ms |
| Scene switch, editor shows text (browser, median) | 300 ms | 10-13 ms | 13 ms |
| Search per keystroke (node, worst of 6 queries) | 100 ms | 2.4 ms | 2.1 ms |
| Switcher per keystroke (node) | 100 ms | 0.9 ms | 0.6 ms |
| Search / switcher keystroke to painted (browser, headless frame wait incl.) | 100 ms | 20 ms | 17-42 ms |
| Checks run, full book (gather + run) | 2 s | 210 ms | 47 ms |
| Mentions scan, one entry | 1.3 s | 22 ms | 24 ms |
| Stats / word-count update per keystroke | 50 ms | 0.4 ms | 0.3 ms |
| Backup copy / snapshot list+create (TS side, memory folder) | - | 2.5 / 7 / 10 ms | same |
| Export model build, all 150 chapters | - | 66 ms | 69 ms |
| Spell-check one scene (en / pl, cached words) | 100 ms | 0.1 ms | 0.2 ms |

Not within a budget, noted: search index is complete ~3.3 s after open (background, 20 scenes per chunk, queries work meanwhile on what is loaded); opening runs one 400-500 ms main-thread task (1 660 unvirtualised tree rows + link index); Polish dictionary build takes 3.9 s once per session (worker, spell marks appear after); the git commit of a snapshot is Rust and the Tauri file reads were not measured (node and browser use in-memory IO), so the real window still needs the 300k check in the packaged build.

Fix: `checks/gather.ts` looked up every passage's event positions and link snippets by scanning all links (O(uses x links)); now one grouped pass (`positionsByBlock`, per-scene link map). Guards in `longBook.test.ts`: 1 500-scene open < 3 s, search and switcher < 250 ms/query, mentions scan < 1 s, position lookup for 6 000 uses over 12 000 links < 300 ms (old code ~850 ms).
