# S3 · Implementation plan: game script, linear scripts and variables

Scope: [milestones.md](milestones.md#s3--game-script-linear-scripts-and-variables). Spec: [script spec](../features/script-writing.md) (Game script: linear scripts, Behavior details: line IDs and variables).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** S2 committed (4f409c7). Needs S1 (kinds) and M5 (codex): both done.

## What already exists
- `kindProfile('game')`: `hiddenSections: ['export']`, `writeIsPlaceholder: true`; `createManifest` makes an empty tree for game; `GameWritePlaceholder.vue`.
- Manifest v14; `ManuscriptNode` type `part | chapter | scene`; `tree.ts` `ALLOWED_PARENT` is fixed; `nodeKindLabel` already relabels chapter → sequence for screenplays.
- Scene file (`sceneSchema`: status, synopsis, comments, todos, links, wordCount, ProseMirror `content`) + store `sceneMeta`, `patchScene`, trash/restore, snapshots, search, spellcheck all work on it. Screenplay editor kind (`src/editor/screenplay/`) is the pattern for a new `editorKinds.game`.
- Codex store, suggestion ranking (`screenplay/suggest.ts`), delete impact (`deleteImpact.ts`), `appearsIn`.

## Decisions (user-confirmed; record in the script spec "Decisions")
- **Tree:** nested folders; a folder holds folders, Scripts and Conversations at any depth.
- **Variables UI:** a "Variables" entry in the Write sidebar below the game tree opens the list editor in the Write stage.
- **Script editor:** TipTap line blocks (speaker chip + text), so comments, search, spellcheck, snapshots and block links work unchanged. The line ID is a separate attribute from the block ID.
- **Conversation in S3:** minimal stub file (title, status, synopsis, empty `nodes`); S4 bumps the version with a migration once the node/condition model is decided.

## Defaults I will use unless you object
- **Node modelling:** a game folder is the existing `chapter` node (nesting allowed for game only, labelled "Folder"); a Script is the existing `scene` node and file (labelled "Script"); `conversation` is a new node type with its own file in `manuscript/`. Keeps the tree, trash, move, status, corkboard and snapshot code reusable.
- **Line:** block type `line`, attrs `id` (block id), `lineId` (`L000123`, from a manifest counter), `speakerId` (codex entry id) or `speakerName` (plain text for an unknown speaker) or neither (narration). Text is inline; no marks except comments.
- **Line IDs:** created once, kept on edit, move, split (the first half keeps it, the new half gets a new one) and merge (the first keeps, the other is retired, never reused). Pasted lines get fresh IDs. The manifest counter only grows; it is reserved in memory before a scene is saved, and raised to max-seen+1 when a scene is indexed (so restoring an older manifest from a snapshot cannot lower it).
- **Speaker input:** Tab at the start of a line (or the toolbar button) opens a picker (codex Characters and aliases, ranking from `suggest.ts`, recent speakers first); free text is allowed. A new line (Enter) starts without a speaker. An unknown name shows an "Add to codex" hint that creates a Character and links this line and the other lines in the same script with that name.
- **Deleted speaker:** the chip shows "Deleted character" (broken style, EN/PL) with a Restore action that restores the entry from trash; renaming a character changes the chip at once (name resolved from the codex store, never copied into the file).
- **Variables file:** `variables.json`, manifest ref `variables`; entries `{id, name, type: flag|number|text, default}`; names unique (case-insensitive) and non-empty; default must match the type (flag boolean, number finite, text string); changing a type resets the default. Delete = confirm + remove (no uses exist before S4; S4 applies the broken-reference rule).
- **Counts:** words are the line text only (speaker names excluded). Status bar: "Script: N words" for the open script and "Game: N words" total; Stats card says "Game". Conversations count 0 words. Status, synopsis and to-dos work on scripts as on scenes; corkboard shows scripts and conversations.
- **Write for conversations:** opening a Conversation shows its title and an empty-state note ("The graph editor arrives in a later version"); rename, move, delete and restore work.
- Manifest **v15**: `lineCounter` (int, default 0), `variables` (item ref or null); `conversation` allowed in the tree and trash types. Migration + test.

## Steps

### 1. Manifest v15, kind-aware tree (H) · tests first — **DONE** (kind passed as a trailing arg to `moveTo`/`keyboardMove`/`dropSlot`/`crossSlot`; `writeIsPlaceholder` stays true until step 7; default names move to step 5; snapshot labels for the new types are in step 5)
`manifest.ts` v15 + `migrations.ts` v14→v15; `tree.ts` `ALLOWED_PARENT` becomes kind-aware (game: chapter under chapter/null; scene and conversation under chapter/null; book/screenplay unchanged); `kinds.ts` game profile (`writeIsPlaceholder: false`, labels `folder`/`script`/`conversation`, default names EN/PL). Tests: v14→v15 round trip, malformed manifest rejected and untouched, book/screenplay trees unchanged, game nesting valid/invalid moves, keyboard move and drop slots, unknown node type rejected.

### 2. File schemas (H) · tests first, after 1 — **DONE**
- Script = `sceneSchema` plus game validation (`src/editor/game/validate.ts`): only `line` blocks, `lineId` matches `L\d{6,}` and is unique in the file, speaker fields exclusive.
- `conversation.ts` stub schema (`version`, `id`, `title`, `status`, `synopsis`, `nodes: []`) ; `variables.ts` schema with the rules above.
Tests: valid files load, malformed/duplicate lineId/mixed speaker rejected and left untouched, variables rules, conversation stub round trip.

### 3. Line IDs (H) · tests first, after 2 — **DONE**
`src/editor/game/lineIds.ts`: pure `formatLineId`, `parseLineId`, `assignLineIds(doc, counter) → {doc, counter}` (fills missing, re-issues duplicates, keeps the rest). TipTap plugin applies it on transactions; store `reserveLineId()` bumps `lineCounter` (manifest dirty, saved before the scene). Tests: new lines get increasing ids, split/merge/move/paste cases above, counter never decreases or reuses after delete + undo window, counter raised on open when a scene has higher ids, restore of an older manifest keeps the larger counter, 5000 lines stay fast.

### 4. Game editor kind (N/H) · after 3 — **DONE**
`src/editor/game/`: `line` node with attrs, keymap (Enter splits, empty Enter at the end of a script keeps one line, Backspace at start merges), speaker chip widget + picker, broken chip, line ID in the margin (decoration, like scene numbers), toolbar (speaker, comment, link to event, undo/redo), `editorKinds.game`, "Add to codex" hint. Tests (pure parts): picker ranking with aliases, diacritics, recent-first; speaker resolution (live name, deleted → broken); add-to-codex converts the matching lines; editor JSON round trip keeps lineIds and block ids after close/reopen.

### 5. Store and tree integration (N) · after 1, parallel with 4 — **DONE**
`addFolder/addScript/addConversation` (new files written atomically), tree icons and labels per kind, move/rename/delete/restore for the new types (trash entry type `conversation`), `deleteImpact` and `appearsIn` count speaker references, search index covers line text, snapshot labels and partial restore for scripts/conversations/variables. Tests: create + reopen each item, delete + restore a Script and a Conversation, deleting a speaker marks lines broken and restoring fixes them, search finds a line, snapshot restore keeps lineIds.

### 6. Variables (N) · after 2, parallel with 4–5 — **DONE**
`useVariablesStore` (load on open, add, rename, retype, set default, delete, atomic save, external-change reload like other singletons) and `VariablesPanel.vue` in the Write sidebar and stage. Tests: store round trip, invalid edit refused (duplicate name, bad default) without writing, missing file created on first add.

### 7. Write view, counts, labels (N) · after 4, 5 — **DONE**
WriteView branches: script → editor, conversation → empty state, variables → panel; remove the placeholder; status bar and Stats labels per kind; corkboard cards. Tests only for word-count extraction of line text (speaker names excluded) and per-kind label selection.

### 8. Strings and a11y (T → Haiku) · parallel with 7 — **DONE**
EN/PL keys (`game.*`, `variables.*`, tree labels); a11y template scan extended to new components (chip, picker and panel keyboard-operable, named controls); line-ID and broken-chip contrast in both themes.

### 9. Verify, screenshots, spec (N) — **DONE**
Browser run: create a Game project; folders (nested), a Script with narration and speaker lines, unknown speaker → Add to codex, rename a character, delete + restore a character, reopen; a Conversation stub; Variables panel; Polish UI, dark theme; keyboard-only pass. Screenshots into an "S3" section of the "Storyworks Screens" Artifact (same slug); tick script-spec lines (Game: linear scripts, Schemas/manifest for the S3 files), record decisions; update milestones and memory. No real-window check needed beyond the usual folder-picker pass.

## Order
1 → 2 → (3 ∥ 5 ∥ 6) → 4 → (7 ∥ 8) → 9. Steps 1, 2, 3 (and the editor merge/split rules in 4) are the hard ones: tests first, I review before accepting.

## Result
All steps done. Screenshots: Artifact "Storyworks Screens", S3 section; script `scripts/screenshots-s3.mjs` (browser run: nested tree, speakers, rename, delete + restore, variables, Polish, dark). Not done: real-window check, history/snapshot UI labels were only added as types and strings (not browsed), Stats card label for games.

## Done when (S3)
A script with speakers and line IDs round-trips through close and reopen; renaming a character updates the displayed speaker; a deleted speaker shows as broken and is restorable; variables persist; nested folders, Scripts and Conversations can be created, moved, deleted and restored; Book and Screenplay projects behave as before; all tests green.

## Risks
- Line counter vs. scene write ordering (crash between the two): reserve before write and raise on open; covered by step 3 tests.
- `ALLOWED_PARENT` becoming kind-aware touches every move path; step 1 tests pin book/screenplay behaviour first.
- Reusing `scene` and `chapter` for game keeps code small but their names are misleading; confined to `kindProfile` labels.
