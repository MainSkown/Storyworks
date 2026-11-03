# M0 · Implementation plan: Foundation and app shell

Scope and "Done when" are in [milestones.md](milestones.md#m0--foundation-and-app-shell). Spec: Project / platform, UI design, Comfort and accessibility.
Difficulty tags: **T** trivial → Haiku · **N** normal → Sonnet. Nothing in M0 is "hard".

## Decisions to settle first
- **App name / identifier:** decided by the user: `Storyworks`, `storyworks` as identifier since the first release (was io.github.mainskown.storyworks; recorded in the spec).
- **Package manager:** yarn (1.22 classic, installed); commit `yarn.lock`.
- **Rust toolchain is missing** on this machine (`cargo`/`rustc` not found; webkit2gtk-4.1 is present). User must install via rustup before step 1 can build the Tauri shell.
- **Zoom:** scale the root `font-size` (all sizes in `rem`), not CSS `zoom`; works the same in WebKitGTK and WebView2.
- **Fonts:** system font stacks only (offline app, nothing fetched). Icons from `primeicons` (bundled).
- **Tokens source of truth:** `src/styles/tokens.css` (Light/Dark via `:root[data-theme]`), so no flash on load and the contrast test can parse it.
- **Browser fallback for I/O:** a `FileIO` interface (`readText`, `writeTextAtomic`, `exists`) with a Tauri impl (temp file + rename in `$APPDATA`) and a localStorage impl used only when not running in Tauri. This is what lets screenshots/tests run in a plain browser; M1 reuses the interface.
- **Welcome → shell:** M1 wires New/Open. Until then the welcome screen has a temporary "Preview workspace" button into the shell (removed in M1).

## Steps

### 1. Scaffold (N)
Tauri 2 + Vue 3 + TS + Vite via `create-tauri-app`; add Quasar (`@quasar/vite-plugin`, `@quasar/extras`; replaced PrimeVue, see spec Decisions), Pinia, Vue Router (hash history), vue-i18n, Zod, Vitest, ESLint (flat, typescript-eslint, eslint-plugin-vue), Prettier, `vue-tsc`. Scripts: `dev`, `tauri:dev`, `build`, `lint`, `format`, `typecheck`, `test`. Window 1280×800, min 960×600. Tauri capabilities limited to fs under `$APPDATA`.
Check: `yarn tauri:dev` opens a window; `yarn dev` serves in a browser.

### 2. Tests first for the pure logic (N) · parallel with 3a/3b after step 1
Write failing tests, then implement:
- `settings.schema`: valid file loads; malformed file rejected; unknown newer `version` → read-only; zoom outside 80–150 and font size outside range rejected.
- `settings.store`: defaults when no file; malformed file → defaults in memory, **file left untouched, saving disabled**, error exposed; successful change writes atomically and validated; toggling a context-panel section persists and reloads.
- `resolveLanguage`: system `pl*` → pl, `en*` → en, anything else → en.
- `resolveTheme`: `system` follows `prefers-color-scheme`; explicit wins.
- i18n parity: `en` and `pl` have identical key sets.
- Token contrast: parse `tokens.css`; every text/surface and section-colour/on-colour pair meets WCAG AA (4.5:1 text, 3:1 UI) in both themes.

### 3a. Settings layer (N)
`src/settings/`: Zod schema (`version: 1`; `theme: light|dark|system`; `language: en|pl`; `uiZoom` 80–150; `editorFontSize`; `contextPanel: { hidden, collapsed: Record<sectionId, boolean> }`), `FileIO` + Tauri/localStorage impls, Pinia store with 300 ms debounced atomic save, load error state. Types inferred from the schema.

### 3b. Design tokens and theme (N)
- Pull exact Workshop values from the "BookWriter UI Directions" Artifact (boards "C · Workshop" + dark); if unreachable, propose values and flag for review.
- `tokens.css`: surfaces, text, borders, focus ring, section colours (Write blue, Timelines orange, Rules green, Codex plum, Checks brick red), type-tag colours (Event, Rule, Character, Scene, Problem), editor sheet/background, `--ui-zoom`, `--editor-font-size`. Dark variant with lightened section colours.
- Quasar brand colours (`--q-primary` etc.) and a small `quasar-overrides.css` mapped to these tokens; Quasar `Dark` plugin synced with `data-theme`.
- `useTheme` composable: applies `data-theme`, listens to `prefers-color-scheme`, applies zoom (root font-size) and editor font size instantly from the store. Respect `prefers-reduced-motion` in global CSS.

### 3c. i18n (T) · after 3a/3b names exist
`vue-i18n` setup (composition mode), `en.json` / `pl.json` for shell strings (section names, panel sections, welcome, settings, a11y labels); language applied instantly from the store.

### 4. Layout shell (N) · needs 3a–3c
- `sections.ts` registry: id, i18n key, colour token, icon, route (Write, Timelines, Rules, Codex, Checks; bottom: Stats, History, Settings). One source for sidebar, header band and context panel.
- `AppShell`: sidebar (232 px: book title + word count placeholder, section list with coloured icon squares, Checks badge slot, active section expands in place with a placeholder), coloured header band (section colour, name, open-item slot, actions slot), central area (`router-view`), right context panel (280 px).
- `ContextPanel` + `CollapsibleSection`: header is a `<button>` with chevron + count, `aria-expanded`, Enter/Space toggle, state stored by section id in settings. Placeholder sections: Write → This paragraph / In this scene / Problems; Timelines → Selected event / Written in / Who learns what here / Linked. Whole panel hideable (button + Ctrl/Cmd+Alt+P), central content stays centred.
- Placeholder pages for all 8 sections. Visible focus ring, labelled icon-only buttons, keyboard-operable sidebar.

### 5. Settings page (N) · parallel with 6
App settings only: theme (Light/Dark/Follow system), language (EN/PL), UI zoom slider/stepper 80–150 %, editor font size with a live sample. Changes apply immediately. Show the settings-load error banner when the file was invalid.

### 6. Welcome screen shell (T) · parallel with 5
Centred card: New book, Open book (disabled, "coming soon" tooltip), empty Recent list, temporary "Preview workspace". App starts here.

### 7. CI for Windows (T)
GitHub Actions: lint, typecheck, test, `tauri build --debug` on `ubuntu-latest` and `windows-latest`. Windows launch itself is verified by the user (cannot run here).

### 8. Verify and review (N)
- `yarn lint && yarn typecheck && yarn test` green; report failures as they are.
- Use the `run` skill: Playwright against `yarn dev` for screenshots; once against `tauri:dev` to confirm the real window launches.
- Restart check: change theme, language, zoom, collapse a panel section, restart, confirm everything persisted; delete/corrupt `settings.json` and confirm it is left untouched with a banner.
- Screenshots (one Artifact, captioned, Light + Dark): welcome, Write shell with panel expanded/collapsed/hidden, Timelines panel, settings page, Polish language, zoom 80 % vs 150 %. All are new screens, so no before/after.
- Update spec (identifier decision), tick M0 items, then commit.

## Order
`1` → (`2` tests + `3a`, `3b`, `3c` in parallel) → `4` → (`5`, `6` in parallel) → `7` → `8`.

## Risks
- No Rust toolchain yet (blocker for steps 1 and 8).
- Exact Workshop colours depend on the mockup Artifact being readable; AA contrast of the section colours may need small adjustments in Dark.
- WebKitGTK vs WebView2 rendering differences only surface on the Windows CI/manual check.
