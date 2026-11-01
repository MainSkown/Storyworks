# M3 · Implementation plan: Calendar and timelines

Scope and "Done when": [milestones.md](milestones.md#m3--calendar-and-timelines). Spec: Timeline editor, Custom calendar, Behavior details (chronological order, timeline default view), Edge cases (timeline, calendar), Keyboard/accessibility (canvas + list view).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (full context, tests first, reviewed before accepting).

**Start gate:** M2 final checks (step 11 of [m2-plan.md](m2-plan.md): full test run, screenshots published, real-window check, H-code review) are done and committed. M3 needs only M1, so no code dependency; the gate is process only.

## Decisions to settle first (record in spec)
- **Calendar schema (`calendar.json`, item v1):** `{ months: [{ name, days }], weekdays: string[] (optional, may be empty), eras: [{ name, startYear }], epochLabel?, leap: { month, every, exceptEvery?, unlessEvery? } | null }`. No weeks-per-year field: derived from `weekdays`.
- **Date value (stored on nodes):** `{ year: int, month: int (0-based index), day: int }`. `year` is **absolute and continuous** (may be ≤ 0); eras are display labels only (era with the largest `startYear ≤ year`, shown as year − startYear + 1). Keeps comparison trivial and calendar edits from silently rewriting dates.
- **Leap years are a toggle (user decision):** `leap: null` = off (every year has the same length, e.g. a world with exact 24 h days); on = one rule `{ month, extraDays, every, exceptEvery?, unlessEvery? }`. Gregorian preset ships with it on (Feb +1 every 4 years, except every 100 unless every 400); a new blank/custom calendar starts with it off. Capped at one rule; richer schemes are out of v1.
- **Date helpers (pure, `src/calendar/`):** `validateDate(cal, date)` → ok or reason (`month`, `day`, `year`); `toOrdinal(cal, date)` (days since year 0); `compareDates`; `formatDate`; `parseDateInput`. Invalid dates are never ordered.
- **Calendar ownership:** manifest already has `calendar: ItemRef | null`. **Missing ref → create `calendar.json` (Gregorian) on open. Ref present but file missing/invalid → in-memory Gregorian fallback + warning, file untouched** (spec edge case). Read-only projects never get files created.
- **Create-on-open (Main timeline + calendar):** one `ensureDefaults()` run after open, skipped when read-only. Idempotent; only creates what the manifest lacks (no timelines at all → "Main timeline").
- **Timeline schema (item v1):** `{ version, id, name, view: 'flow'|'date', branches: [{ id, name, color, dashed }], nodes: [{ id, title, description (TipTap doc), date|null, color|null, tag|null, branchId|null, pos: {x,y}, codexIds: [], ruleIds: [] }], edges: [{ id, from, to }] }`. `codexIds`/`ruleIds` are stored now (spec node fields) but only edited in M5. Refines: unique IDs, edges point at existing nodes, no self-edge/duplicate edge, **no cycle** (a hand-edited cyclic file is "invalid file", never repaired).
- **Branch model:** branches are named, coloured, with a solid/dashed flag (line style, not colour only). Branch is a property of the *node*; an edge takes its **target** node's branch for style. `branchId: null` = main line.
- **Positions:** Flow view stores `pos` per node (user can drag); "Tidy" runs a pure layered layout (layer = longest path from sources) and rewrites `pos`. New node is placed right of the selected node. Date-scaled view never stores positions: x from `toOrdinal`, y from branch lane; undated nodes go to a separate "Undated" lane (spec edge case).
- **Manifest v3:** trash entry `type` gains `'timeline'` (timelines are deletable, restorable). Per CLAUDE.md that's a schema change → version 2→3 with a trivial migration + test. No other manifest change (all refs exist from M1).
- **Chronological-order helper (H):** `src/timeline/order.ts`, `compare(a, b, ctx) → 'before'|'after'|'equal'|'unknown'`. Position = `{ node: {timelineId, nodeId} } | { date }`. Rules exactly as the spec: both dated and valid → compare via calendar (date wins over path); else same timeline and an edge path exists → path order; else `unknown`. Never guesses. Reachability computed per timeline and cached by timeline revision.
- **Canvas library:** use **Vue Flow** (`@vue-flow/core`) for pan/zoom/drag/edges; our wrapper adds typed nodes/edges, keyboard model and list view. Fallback if the spike fails (a11y, theming, Vite/Vue versions): hand-rolled SVG layer. Decided by step 1 spike, 1 hour cap.
- **Reusable graph component:** `GraphCanvas.vue` is generic over node/edge data (props: `nodes`, `edges`, `canConnect(from,to)`, slots for node body, events `move/connect/disconnect/open/add/delete`) with **no timeline knowledge**; `TimelineCanvas.vue` composes it. `GraphList.vue` is the list-view twin (node → outgoing/incoming connections, with add/remove connection controls). S4/S5 reuse both.
- **Keyboard model (canvas):** Tab enters the canvas; arrows move focus to nearest node in that direction; Enter opens the inspector; `N` add node after focused; `C` then arrow/Enter to connect to a target; `Delete` removes node/edge (to confirm for nodes with edges); `Alt+arrows` nudge position. List view toggle reachable by keyboard.
- **Inspector:** right context panel "Selected event" section (collapsible, per [panelSections.ts](../../src/panelSections.ts)). "Written in", "Who learns what here", "Linked" sections stay placeholders ("coming in M4/M6/M5").
- **Store:** new `timelines` Pinia store (index of loaded timelines + calendar, selection, view state) on top of the project store's `updateItem`/autosave/watcher/trash; project store (1170 lines) only gains thin hooks (load listed timelines at open, trash type, `ensureDefaults`). Last-used view per timeline is the `view` field in the file.
- **Filters (M3):** tag and branch only. "By linked codex entry" is added in M5 (needs codex); noted in M5.
- **Invalid-date flagging:** a node whose date fails `validateDate` is marked (warning icon + inspector text) and keeps its stored value. Calendar editor shows "N dates will no longer fit" before save; save is allowed (spec: flag, don't alter). Saving the calendar writes only `calendar.json`.

## Steps

### 1. Spike: canvas library (N) · parallel with 2
Vue Flow in a throwaway view: pan/zoom, drag, connect, custom node slot, Light/Dark tokens, keyboard focus on nodes, behaviour in the browser build and Tauri window. Report go / no-go on Vue Flow vs hand-rolled SVG before step 8.

**Done (spike result): GO, `@vue-flow/core` 1.48.2** (works with Vue 3.5/Vite, tokens theme Light/Dark, dashed edges via class). Gaps the wrapper must fill: Enter/Space only select (no open event), arrows nudge a selected node instead of moving focus (set `disableKeyboardA11y`, own Alt+arrows), edges not focusable, built-in a11y text is English only (own en/pl aria-labels + live region), `isValidConnection` for `canConnect`.

### 2. Tests first for the pure logic (N, H where marked) · parallel with 1
- **Calendar:** Gregorian preset valid; schema rejects zero-day month, empty months, duplicate month names, bad leap rule; leap off → every year same length, 29 Feb invalid in all years; leap on → Gregorian rule (1900 no, 2000 yes, 2024 yes) and ordinals shift by the extra day; `validateDate` (30 Feb, month out of range, day 0, valid 29 Feb in leap year, invalid in non-leap); `toOrdinal`/`compareDates` incl. year ≤ 0 and custom 13-month calendar; `formatDate`/`parseDateInput` round-trip; era display; **calendar change flags dates that no longer fit and leaves them untouched**.
- **Calendar file handling:** missing ref → created Gregorian; ref present + file missing → in-memory fallback, nothing written, warning; invalid file → fallback, file untouched; read-only → nothing created; only `calendar.json` changes on a calendar save.
- **Timeline schema:** valid loads; malformed rejected untouched; cyclic file rejected; edge to missing node, duplicate edge, self-edge, duplicate IDs rejected; stable key order; branch/dash fields default.
- **Graph rules (H):** `wouldCreateCycle` (direct, long, through merge, self); connect rejected with reason; branch + merge accepted; delete node removes its edges; delete edge keeps nodes.
- **Order helper (H):** both dated before/after/equal; dated vs undated on a path; undated pair on a path before/after; unrelated nodes (different branches no path) → unknown; different timelines undated → unknown; invalid date → falls back to path or unknown; date contradicting path → date wins; node vs plain date; cache invalidated after an edge change. Property-style check: result of `compare(a,b)` is the mirror of `compare(b,a)`.
- **Layout:** layered layout puts sources left, merges right of all parents, stable output for same input; date-scaled placement orders nodes by calendar, undated in own lane, no node dropped.
- **Filters:** tag and branch filters keep matching nodes and (dimmed) connectivity; empty filter = all.
- **Defaults/lifecycle:** `ensureDefaults` idempotent; new project gets Main timeline + Gregorian; timeline create/rename/delete → trash → restore at original index; manifest v2→v3 migration (version bump, trash entries kept) + newer-version still read-only.

### 3. Setup (T) · after spike result for the dependency
Add dependency; i18n key groups (`timelines.*`, `calendar.*`) in en + pl; routes: `/timelines` renders the real view (replaces placeholder); sidebar Timelines expands in place with the timeline list and a Calendar entry.

### 4. Calendar module + schema (N) · after 2
`src/calendar/` (schema, Gregorian preset, validate/ordinal/compare/format/parse) and `calendar.json` item read/write via the project layer; fallback and warning plumbing.

### 5. Timeline schema, graph rules, manifest v3 (N; cycle/rules H) · after 2
`src/timeline/schema.ts`, `graph.ts` (`wouldCreateCycle`, connect/disconnect/removeNode as pure functions returning new value or rejection reason), migration v2→v3, trash `timeline` type.

### 6. Chronological-order helper (H) · after 4, 5
`src/timeline/order.ts` per Decisions, with the cached reachability. Reviewed by me before anything builds on it.

### 7. Timelines store + defaults (N) · after 4, 5
`timelines` store: load listed timelines at open (invalid/missing ones marked, others work), `ensureDefaults()`, create/rename/delete/restore timeline, node/edge/branch operations through the pure graph functions and `updateItem`, selection, per-timeline view, tag/branch filter state, invalid-date flag map.

### 8. Graph component + list view (N, keyboard model H) · after 1, 3, 5
`GraphCanvas.vue` (generic) and `GraphList.vue` as in Decisions; keyboard model with tests for focus-neighbour selection and connect mode (pure helper tested, DOM wiring not). Reused later by S4/S5, so no timeline imports.

### 9. Timeline canvas + views (N) · after 6, 7, 8
`TimelineCanvas.vue`: Flow view (stored positions, Tidy), Date-scaled view (time axis labelled via the calendar, branch lanes, Undated lane), view toggle, node visuals (title, date, colour/tag chip, branch line style solid/dashed + label), add/move/delete nodes, draw/remove edges with cycle rejection toast, filters bar, minimap/fit-to-view. Timeline list header: create, rename, delete (confirm).

### 10. Node inspector (N) · after 7, parallel with 9
"Selected event" collapsible section in the context panel: title, description (reduced TipTap editor, as in the inbox note), date input via the calendar with inline invalid-date message, colour, tag, branch picker (+ new branch: name, colour, dashed), delete. Other panel sections show their "later milestone" placeholders.

### 11. Calendar editor (N) · after 4
Book settings → Calendar: months table (add, remove, reorder, rename, days), weekdays, eras, epoch label, "Leap years" switch (off hides the rule fields; the rule values are kept in the draft so toggling back restores them), "Reset to Gregorian", "dates that no longer fit" count before save, saved only on confirm. Warning banner when the fallback is active.

### 12. Long-timeline check (N) · after 9
Generated timeline of 300 nodes / branching: pan/zoom smoothness, drag latency, open time, order-helper cost for 1000 `compare` calls; virtualise or cache only if slow.

### 13. Verify and review (N)
Full test run; `run` skill: screenshots of Flow view, Date-scaled view (with Undated lane), branch/merge with dashed branch, rejected-cycle message, inspector with invalid-date flag, calendar editor (custom calendar), list view, keyboard focus ring on a node, Light and Dark; add an M3 section to `docs/review/review.json`, rebuild and update the existing "Storyworks Screens" Artifact (before/after for the placeholder Timelines page). Real-window check: build a branch-and-merge timeline, close, reopen, inspect `timelines/*.json` and `calendar.json`; edit calendar so a date becomes invalid and confirm only `calendar.json` changed. I review the order helper, cycle rules and migration before accepting.

## Order and parallelism
`2 ‖ 1` → `3, 4, 5` (4 ‖ 5) → `6, 7` (parallel) → `8` → `9 ‖ 10 ‖ 11` → `12` → `13`.

## Risks
- Vue Flow keyboard/a11y gaps → the generic wrapper owns the keyboard model; hand-rolled SVG is the fallback (decided in step 1).
- Leap rule scope creep → toggle plus one rule only; anything richer is out of v1.
- Cyclic hand-edited file making a whole timeline "invalid" is strict but consistent with "never auto-repair".
