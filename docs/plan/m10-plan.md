# M10 · Implementation plan: Writing aids

Scope: [milestones.md](milestones.md#m10--writing-aids). Spec: Search, Writing goals & stats, Spellcheck dictionaries, matching Edge cases and acceptance lines.
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** M9 committed (e83a3f2). Real-window check of M9 still pending (does not block).

## What already exists
- Manifest v11 already has `goals {daily, book}`, `dictionaries: string[]` (names only), `dirs.dictionaries`. No `stats.json`, no search, no spellcheck, `stats` route is `SectionPlaceholder`.
- `editor/wordCount.ts` (`countWords`), `store.wordCounts` (per scene/chapter/book), `project/plainText.ts` (`docToText`), `codex/mentions.ts`, `useJump.ts` (open scene/block, node), `codex/openEntry.ts`, `ProjectIO` + app-data `fileIO.ts` (Tauri `$APPDATA` already in fs scope), Write status bar, `panelShortcut.ts` as the shortcut pattern.

## Decisions (confirmed by user; record in spec "Decisions")
- **Spell engine:** JS Hunspell (`nspell`) in a Web Worker, same code in browser and Tauri. Bundled EN + PL as read-only resources.
- **Day count:** net words per day (deleting subtracts), shown as at least 0. Goal met / streak use this value.
- **Search and switcher:** overlays (Ctrl/Cmd+Shift+F, Ctrl/Cmd+P) on any page; no new sidebar section. Stats replaces the placeholder.

## Defaults I will use unless you object
- Matching is case-insensitive and diacritic-insensitive, with `ł→l` added (Polish `ł` does not decompose). Plain substring match; results ranked: title/alias hit, then body hit; capped (e.g. 50 per area) with "show more".
- Search indexed in memory at open and updated on edits (no disk index); manuscript body text indexed lazily per scene so open stays fast on long books.
- Session = first edit → 10 min idle or close; net words = sum of scene word-count deltas; sessions under 1 edit are dropped. "Day" uses local time. Timer is a manual start/stop in the status bar, not stored.
- `stats.json` written debounced (with autosave) and on close; one schema, keeps all sessions, per-day totals derived. Capped at none (small).
- Misspelling = wavy underline via ProseMirror decoration, right-click menu: suggestions, Add to dictionary (per-book list), Ignore once. Names in the codex are **not** auto-accepted (only the per-book list is).
- Dictionary move/copy between scopes is in scope (spec says so); delete dictionary asks to confirm.

## Steps

### 1. Schema + migration v12 (H) · tests first
`stats.json` schema (`version`, `days[{date, net}]`, `sessions[{id, start, end, net}]`); manifest gets `stats: itemRef|null` and `dictionaries` becomes `[{name, scope: 'local'|'global'}]` (old names → `global`); bump to 12, migrate, backup via existing pre-migration path. Tests: valid loads, malformed rejected and untouched, v11→v12 round trip, missing `stats.json` recreated empty only on first write.

### 2. Stats logic (H) · tests first, parallel with 3, 4
`src/stats/`: `sessions.ts` (start on first edit, idle 10 min, close), `days.ts` (net per local day, floor 0, goal met), `streak.ts` (current/longest; goal set → met days, else ≥1 word), `store.ts` (load/save debounced, hooks into scene word counts). Tests: session boundaries around 10 min, net with deletions, day rollover at midnight, streak with/without goal, gaps, longest vs current.

### 3. Search index + switcher logic (H) · tests first, parallel
`src/search/`: `normalize.ts` (fold incl. `ł`), `index.ts` (build from manuscript, rules, timeline nodes, codex entries incl. aliases, knowledge items, timelines; incremental update), `query.ts` (grouped results with snippet + match offset, ranking), `switcher.ts` (title/alias match, recents list persisted in app settings, cap 10). Tests: finds by content and alias, grouped by area, diacritics and `ł`, deleted/trashed items excluded, restored items back, ranking order, recents ordering, empty query shows recents.

### 4. Dictionaries + spell core (H) · tests first, parallel
`src/spell/`: `dictionaryStore.ts` (list bundled / global / local; local wins on same name; import `.dic`+`.aff` or word list; malformed → error, nothing added; move/copy between scopes), `customWords.ts` (per-book list file in `dictionaries/`), `engine.ts` (nspell worker wrapper: `check`, `suggest`, loads selected + custom; missing selected dictionary → warn, check without it, keep selection). Global dir via app-data path (Tauri) / browser storage stand-in with the same interface. Bundle EN + PL files in `public/` (licence check first, note in repo). Tests: import valid/malformed, scope precedence, move/copy, imported dictionary stops flagging its words, custom word stops flagging, missing global dictionary falls back without rewriting the manifest.

### 5. Stats UI (N) · after 2
Stats page (totals per part/chapter/scene, words-per-day chart, goal progress, sessions list, streaks); goal fields in Book settings; Write status bar "today X / goal" + timer. Chart is a plain SVG, keyboard-readable table fallback. i18n EN/PL (**T**).

### 6. Search + switcher UI (N) · after 3
Two overlay dialogs with focus trap, arrow/Enter keyboard use, grouped results with snippets; jump via existing `useJump` / `openEntry` (scene at the match, block when known). Shortcuts registered globally; added to the shortcut list for M11's overlay.

### 7. Spellcheck UI (N) · after 4
TipTap extension (decorations from worker results per visible block, debounced), context menu, Settings / Book settings dictionary section (list, import dialog with scope, move/copy, select for book, custom words editor), warning banner for missing dictionary. i18n EN/PL.

### 8. Review and publish (T)
Browser run with a scripted day of typing (`scripts/screenshots-m10.mjs`): stats day total and goal, session, streak; search for a character name across areas; switcher by alias; import a small `.dic/.aff`, word stops being flagged; missing-dictionary fallback. Screenshots (Stats, Search, Switcher, spell underline + menu, dictionary settings, status bar) into the M10 section of the existing "Storyworks Screens" Artifact. Update spec Decisions + acceptance ticks, memory note. **Real-window check:** global dictionary in the real app-data dir, bundled dictionaries load from resources, `stats.json` written on close.

## Order
1 → (2 ∥ 3 ∥ 4) → (5 ∥ 6 ∥ 7) → 8. I review 1–4 before accepting. Steps 5–7 touch separate files except shared i18n and the editor extension list in 7, so run 5 and 6 in parallel and 7 after.

## Risks
- PL dictionary size/licence and worker load time (lazy-load per language; check memory on a 300k-word book).
- Editor decorations on very long scenes (check only visible/changed blocks).
- Browser version has no real app-data dir; global scope there is a storage stand-in, so the real-window check matters.
