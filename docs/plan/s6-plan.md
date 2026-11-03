# S6 · Implementation plan: game document

Scope: [milestones.md](milestones.md#s6--game-document). Spec: [game-document.md](../features/game-document.md).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** S5 committed (c1c4f6b, manifest v17). Needs S5 and M5 (Rules is the pattern to copy).

## What already exists
- Rules is the template: `src/project/schemas/rule.ts` + `ruleCategory.ts`, `src/project/rules.ts` (paths, `loadList`, filter, delete-category plan, seed defaults), `src/rules/store.ts`, `RulesView.vue`, `RuleCategoryDialog.vue`, trash in `src/project/trash.ts`, wiring in `open.ts` (listed items, parse dispatch, `isParsed`), `project/store.ts`, `search/store.ts` + `units.ts`, `history/manifestView.ts` + `itemLabel.ts`, `defaultNames.ts`.
- Single-file pattern: `variables` and `storyMap` (manifest `itemRef`, own schema, own store).
- Section registry `src/sections.ts`, `panelSections.ts`, kind profile `src/project/kinds.ts` (`hiddenSections`), tokens + contrast test.
- Reverse-link patterns: `src/game/inboundLinks.ts`, `variableUses.ts`, `src/components/links/*`; Text-item editor from S3 for rich text.
- Latest migration is v16 → v17 in `migrations.ts`; `migrationV17.test.ts` is the test template.

## Decisions to record in the spec (from your answers; nothing new)
Section not tree item · structured mechanics · Rules kept · Overview + Glossary · fields status/parameters/summary · all four link targets · default categories · kind label "Game".

## Defaults I will use unless you object
- **Files:** `game-doc/overview.json` (`gameOverview` ref), `game-doc/glossary.json` (`glossary` ref), `game-doc/mechanics/<id>.json` (`mechanics: refs()`), `game-doc/categories/<id>.json` (`mechanicCategories: refs()`). All four new manifest keys default to `null` / `[]`; manifest v17 → v18.
- **Mechanic schema v1:** `{id, title, summary, categoryId, status: idea|designed|implemented|cut, tags[], description (doc), parameters: [{id, name, value}], links: [{kind: variable|item|beat|entry|mechanic, id}]}`. Single flat `links` list, no per-kind arrays. `item` = tree node id (conversation or script); `beat` = story-map box id.
- **Reverse links are never stored**, only computed (pure functions over loaded mechanics), like `variableUses`.
- **Glossary entry delete = remove from the file after a confirm** (entries live in one file, so no per-entry trash); recoverable through snapshots. This differs from the spec line "delete (trash)"; I will fix the spec line.
- **Variable links:** variables have no trash/restore, so a link to a deleted variable stays broken until the user removes it. The spec's "restore repairs it" applies to items, beats and codex entries only; I will correct the acceptance line.
- **Trash entry type** gains `'mechanic'` (manifest enum, v18). Categories are deleted with reassignment, never trashed (as Rules).
- **Overview starter page** is seeded at project creation (game kind) and on first open after migration if `gameOverview` is null (like `seedRuleCategories`; skipped when read-only). Headings are written in the book language (Pitch / Pillars / Audience / Core loop, Polish set added to `defaultNames.ts`).
- **Colour token:** `--section-gamedoc(-on)`, a purple distinct from storymap teal and others; contrast test covers it.
- **Section id:** `gamedoc`, icon `description`, placed after `storymap`; hidden for book and screenplay via `hiddenSections`.
- **Tabs** are one route `/gamedoc` with a `?tab=overview|mechanics|glossary` query (not three routes), so the sidebar stays one entry.
- **Stats word count:** a "Game document" total is shown in the Game document section header only. Wiring it into the Stats page totals/goals is out unless you want it (those are session-edit based and would mix design words into the daily goal).
- **Kind label:** only i18n strings change (`en.json` / `pl.json` near line 393 and wherever the welcome/new-project text says "game script"); no schema change.

## Steps

### 1. Schemas, manifest v18 and migration (H) · tests first
`src/project/schemas/`: `mechanic.ts`, `mechanicCategory.ts`, `gameOverview.ts` (`{version, id, content: doc}`), `glossary.ts` (`{version, entries: [{id, term, definition}]}`; unique entry ids). Manifest: `MANIFEST_VERSION = 18`, new keys, trash enum `'mechanic'`. `migrations.ts` v17 → v18 (manifest only, new keys default). Tests: migration (v17 project opens, new keys present, other files untouched), valid files load, malformed mechanic/glossary rejected and left unchanged, duplicate glossary ids rejected, trash entry with type `mechanic` parses.

### 2. Pure helpers (H) · tests first, after 1
`src/project/gamedoc.ts`: paths, `filterMechanics(category, status, tag, text)`, `deleteMechanicCategoryPlan` / `reassignMechanics` (reuse the Rules logic by generalising, or copy if generalising is not simple), `DEFAULT_MECHANIC_CATEGORIES`, `sortGlossary` (A–Z, locale-aware, Polish letters). `src/game/mechanicLinks.ts`: `resolveLink(link, ctx) → ok | broken(reason: missing|trashed)`, `brokenLinks(mechanic, ctx)`, `mechanicsFor(kind, id, mechanics)` for reverse links, `variableUsedBy`. Tests: filter combos, category delete plan (reassign target required, none left uncategorised), glossary sort, broken-link reasons, reverse lookup, self-link to a mechanic is ignored.

### 3. Project plumbing: open, create, trash, restore, history (N) · after 1
Wire the new files like Rules: `open.ts` (ListedItem flags, parse dispatch with id check, `isParsed`, trash/restore impls in `trash.ts` for `mechanic`), `project/store.ts` (set refs, trash/restore wrappers, load/reset, seeding of categories + Overview for game projects, read-only skip), `history/manifestView.ts` and `itemLabel.ts` (group "Game document"), `defaultNames.ts` (en + pl category names and Overview headings), `createProject` for game kind. Tests: create game project has overview + categories; trash/restore a mechanic; seeding skipped when read-only; migrated v17 game project gets starter files on first open.

### 4. Stores (N) · after 2, 3
`src/gamedoc/mechanicsStore.ts` (list, create, patch, reorder, trash, categories, selected id; copy of `rules/store.ts` shape), `overviewStore.ts` and `glossaryStore.ts` (single-file, atomic save, autosave like `variables/store.ts`). Tests only for: create/patch/reorder round trip, delete category reassigns, glossary add/edit/remove persists, invalid file listed as invalid and others still load.

### 5. Section registration and shell (T) · after 3, parallel with 4
`sections.ts` (`gamedoc`), `kinds.ts` hidden for book/screenplay, router route + `?tab`, `panelSections.ts` (`gamedoc.selected`, `gamedoc.usedBy`), tokens `--section-gamedoc(-on)` in both themes (contrast test must pass), i18n `sections.gamedoc` and `contextSections.gamedoc.*` en + pl, kind label rename to "Game" / "Gra". Update `sections.test.ts` / `panelSections.test.ts` expectations.

### 6. Overview and Glossary UI (N) · after 4, 5
`GameDocView.vue` with tabs; Overview tab uses the Text-item TipTap editor (extract a small shared component only if the Text editor is not already reusable); Glossary tab: sorted list, search box, add/edit inline, delete with confirm. Keyboard operation, empty states.

### 7. Mechanics UI (N) · after 4, 5
Mechanics list (filters category/status/tag, search, manual reorder with keyboard alternative), detail editor (title, summary, category, status chip with text label, tags, rich-text description, parameters table add/edit/remove), `MechanicCategoryDialog` (copy of `RuleCategoryDialog`), trash with undo toast as Rules.

### 8. Links UI and reverse links (N) · after 2, 7
Link picker dialog (tabs: Variables, Items, Beats, Codex, Mechanics; reuses the existing item/codex pickers where possible); link list on the mechanic with current names and broken styling + remove; reverse panels: Variables panel row "used by", context panel "Mechanics" for the open conversation/script (Write section, `write.mechanics`), codex entry panel, story-map inspector for items/beats, "Related" on a linked mechanic. Deleting a variable/item shows mechanics affected in the existing delete-impact summary (`deleteImpact.ts`).

### 9. Search, word count and section header count (N) · after 4
`search/units.ts` + `search/store.ts`: units for Overview, mechanics (title, summary, description, parameters), glossary; `open.ts` in search jumps to the tab/mechanic. Word count of the document shown in the section header (see defaults). Test only the unit builders (text extracted, ids stable).

### 10. Verification and docs (T) · last
Run `run` skill: new game project, add mechanic with links, delete variable, trash/restore an item, migrate a v17 sample; screenshots (Overview, Mechanics list, mechanic detail with links, Glossary, Variables panel "used by", context panel) published to the existing Artifact in both themes. Update the spec (glossary delete, variable repair wording, mark Changes `[x]`), `script-writing.md` pointers, and a memory status note. Real-window check stays pending as for earlier milestones.

## Order
`1` → `2` and `3` (parallel) → `4` and `5` (parallel) → `6` and `7` (parallel) → `8` → `9` → `10`. Hard steps (1, 2) get a short review from me before step 3 starts.

## Risks
- Generalising Rules category logic could regress Rules; default to copying with its tests unless the shared version is trivial.
- `open.ts` and `project/store.ts` are large and touched by every list type; step 3 must run alone on those files (no parallel edits).
- Migrated v17 projects: seeding must not run twice or in read-only mode.
