# S7 · Implementation plan: script checks and game export

Scope: [milestones.md](milestones.md#s7--script-checks-and-game-export). Specs: [script spec](../features/script-writing.md) (Consistency checks, Export / import), [game document](../features/game-document.md) (Handed to S7).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** S6 committed (d0534a3, manifest v18).

## What already exists
- Checks: `src/checks/` (`types.ts` `CHECK_IDS` + `CHECK_SEVERITY` + `makeFinding`, `run.ts` `CHECKERS` record + `CheckData`, `gather.ts` adapts stores, `store.ts`). On/off is `manifest.checkSettings` (any id; no schema change). `ChecksSettings.vue` lists every id; `ChecksView.vue` opens a finding by `location.kind` (`scene|node|rule|entry|file`).
- Game data: `src/game/conversationGraph.ts` (`toGraph`, `brokenTargets`), `crossLinks.ts` (`linkProblems`), `variableUses.ts` (`brokenUses`, `usesOfVariable`), `routes.ts`, `mechanicLinks.ts` (`brokenLinks`, `mechanicsFor`), `storymap/model.ts` (`buildStoryModel` loads every item), `storymap/items.ts`, `game/playthrough.ts` (`extractLines`).
- Export: `registry.ts` has book (`ExportDoc` chapters/blocks) and script exporters; PDF and DOCX book exporters exist; **no Markdown exporter**. `ExportView.vue` switches on kind; game has `export` in `hiddenSections` (`kinds.ts`).

## Decisions (from your answers)
- Route check: an item tagged with route R is flagged when no story-map path from any Start box reaches it through items that are untagged or tagged R (conditions ignored; derived + manual arrows). No start set → the first box, as play-through does.
- Game JSON has a pure reader used by a round-trip test only; no import UI.

## Defaults I will use unless you object
- **New check ids** (all game-kind only; kind list in `types.ts`, `ChecksSettings` and the runner skip checks not for the project's kind):
  - `dead-end` (warning), `unreachable-node` (warning), `unreachable-item` (warning), `choice-no-target` (error), `undefined-variable` (error), `route-unreachable` (warning), `broken-speaker` (error: `Speaker link to a deleted codex entry`).
  - Game document: `mechanic-broken-link` (error), `mechanic-no-links` (info; status Implemented, zero links), `variable-unused` (info; used by no mechanic, no condition, no set).
- **Broken cross-links / targets** keep reporting under existing `broken-link` (extend its refs with conversation targets), so no duplicate finding for the same problem. `choice-no-target` = option with neither target nor link (empty); `dead-end` = non-End node with no outgoing way (Lines with no `next`, Choice with no options or all options empty, Jump with no target).
- **Reachability:** within a conversation from its `startNodeId`; across items from story-map Start boxes (derived arrows follow cross-links, manual ones as drawn). Loops allowed; a node inside an unreachable cycle is still flagged.
- **Location kinds:** add `item` (conversation/script, optional `nodeId`) and `mechanic`, `variable`; `ChecksView` opens Write at the node, the Game document mechanic, or the Variables panel.
- **Stable ids:** `checkId:itemId[:nodeId[:optionId]]` via `makeFinding`.
- **Export page for game:** `export` removed from game `hiddenSections`. `ExportView` gets a third branch (`GameExportView.vue`) with two cards: **Game data** (JSON, CSV) and **Game document** (PDF, Word, Markdown). Options: item selection for CSV is not offered (hidden as the spec says); the document card has "include sections" (Overview, Mechanics, Glossary). Last-used options not persisted (no manifest bump).
- **Game JSON** `format: 'storyworks-game', version: 1`: `variables`, `items` (folders/scripts/conversations in tree order, route refs, trashed excluded), script `lines` (`lineId`, `speakerId`, `speakerName`, resolved speaker name, text), conversations (`startNodeId`, nodes with type, `x/y` omitted, lines, options with `target`/`link`, `condition`, `sets`; edges derived and listed), `storyMap` (boxes, arrows, starts), `routes` (resolved names), `gameDocument` (overview as plain text, glossary, categories, mechanics with parameters and links). Comments, appendices and private notes excluded.
- **Game CSV:** UTF-8 with BOM (spreadsheets), RFC 4180 quoting, columns `item, node, line_id, speaker, text`; scripts have an empty node column.
- **Game document export** reuses the book `ExportDoc` model (Overview = chapter, one chapter per category for mechanics, Glossary) so PDF and DOCX come free; new `markdown.ts` exporter for `ExportDoc` (registered for kind `game`, model `book`). Mechanic parameters as a table-like list; links as names.

## Steps

### 1. Check types and runner plumbing (N)
`CHECK_IDS`/`CHECK_SEVERITY` additions, `CHECK_KINDS: Record<CheckId, KindId[]>` (existing = all or as today), `runChecks` takes the kind and skips others, `ChecksSettings` lists only applicable checks, new `LocationKind`s, i18n names/descriptions/messages (en + pl), `ChecksView` opens new locations. Tests: kind filter in runner; settings off → check not run.

### 2. Conversation and story-map graph checks (H) · tests first, after 1
Pure `src/checks/game.ts` (`deadEnds`, `unreachableNodes`, `choiceNoTarget`, `undefinedVariables`, `routeUnreachable`, `unreachableItems`, `brokenSpeakers`). Reuse `toGraph`, `brokenUses`, `routes`, story-map model; no store access. Tests per check: bad case → finding, good case → none, id stable across runs; extras: loop, cycle unreachable, no Start box, trashed item, end node, cross-link into an item, route chain through untagged item, deleted branch tag, deleted codex speaker.

### 3. Game-document checks (N) · after 1, parallel with 2
`mechanicBrokenLinks` (reuse `brokenLinks` + `LinkContext`), `mechanicsNoLinks`, `variablesUnused`. Tests as above incl. cut mechanic not flagged, a variable used only by a mechanic link counts as used.

### 4. Gather game check data (N) · after 2, 3
Extend `CheckData` with a `game?: {...}` slice and `gatherCheckData` to fill it for game projects (load conversations/scripts through `buildStoryModel`, mechanics, variables, codex, timelines). Run only when kind is game. Test: gather with a small fake project (existing `gather.test.ts` pattern); a book project gets no `game` slice and the same findings as before.

### 5. Game JSON and CSV model + writers (H) · tests first, parallel with 2–4
`src/export/gameModel.ts` (`GameDoc`), `gameDoc.ts` (build from source, same `ExportSource` adapter style as `source.ts`), `gameJson.ts` (`serialize`, `parseGameJson`), `gameCsv.ts`. Tests: every line appears with line id and speaker (named, plain, none, broken); trashed items excluded; CSV quoting of commas/quotes/newlines; JSON → parse → same conversation graph (nodes, edges, conditions, sets) and same story map; unknown `version` rejected; comments/private notes absent. Register `gameJson` and `gameCsv` exporters (new `model: 'game'` in the registry).

### 6. Game document export (N) · after 5 (shares registry changes), parallel with 7
`src/export/gameDocument.ts` builds `ExportDoc` from overview (TipTap doc → blocks via existing converter), categories → chapters, glossary. `markdown.ts` exporter for `ExportDoc`. Tests: Overview/Mechanics-by-category/Glossary order, empty sections omitted, broken link printed as its stored label, Markdown escaping and heading levels. PDF/DOCX get a smoke test only.

### 7. Export page for game (N) · after 5, parallel with 6
`kinds.ts` hiddenSections update (and `sections.test.ts`), `GameExportView.vue`, `ExportView.vue` branch, i18n (en + pl), save/“show in folder” reuse `saveFile.ts`. Hide book-only options.

### 8. Verification and docs (T) · last
Run all tests, `vue-tsc`, eslint. `run` skill, browser: game project with a dead end, an unreachable conversation, an option with no target, a deleted variable, a route-tagged unreachable item, a mechanic with a broken link; Checks page, Settings toggles, Export page (both cards); screenshots (`scripts/screenshots-s7.mjs`) added to the "Storyworks Screens" Artifact. Tick spec lines (script spec checks + export, game-document “Handed to S7”), record decisions, update milestones, memory status note. Real-window check for file saving stays pending as for M8.

## Order
`1` → `2`, `3`, `5` in parallel → `4` (after 2, 3) and `6`, `7` (after 5) → `8`. Steps 2 and 5 get my review before 4 and 6 start.

## Risks
- Route check semantics are interpretive; the finding message names the route and the path rule so the user can tell why.
- `registry.ts` gains a third model (`game`); step 5 must be the only edit to it, and `bookExportersFor` must still exclude it.
- `gather.ts` already loads a lot; loading every conversation for checks may be slow on large games, so reuse the story-model load once per run and measure in step 8.
- Check ids shown per kind change `ChecksSettings`; book and screenplay lists must stay as they are (covered in step 1 tests).
