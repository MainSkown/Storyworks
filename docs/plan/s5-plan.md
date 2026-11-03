# S5 · Implementation plan: cross-links, story map, routes, cross-item play-through

Scope: [milestones.md](milestones.md#s5--non-linear-structure-cross-links-story-map-routes). Spec: [script spec](../features/script-writing.md) (Game script: non-linear structure, Edge cases: broken targets, UI / navigation).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** S4 committed (2d5b1d3 + af2ba21, manifest v16). Needs S4 (graph, conditions, play-through) and M3 (timeline branches).

## What already exists
- Conversation schema v2: `jump.target = {nodeId}`, `option.target` = node id string; edges derived from them. Play-through engine `src/game/playthrough.ts` (single conversation, pure state machine).
- `GraphCanvas`/`GraphList` generic components; `conditions.ts` (evaluate/apply); `ConditionBuilder`, `SetsEditor`.
- Manifest tree nodes (`scene` = Script/Text, `conversation`), trash with restore, broken-link rule (`linkProblems.ts`), timelines with `branches[]` (ids are per timeline file).
- Section registry `src/sections.ts`, tokens in `src/styles/tokens.css`, `panelSections.ts`, kind profile `src/project/kinds.ts`.

## Decisions (user-confirmed; record in the script spec "Decisions")
- **Story map is a separate sidebar section** (game projects only, after Write) with its own colour token (light + dark, AA) and own context-panel sections.
- **Arrows: derived + manual.** Cross-item jumps/choice targets draw read-only arrows; the user also draws manual arrows between boxes, and a manual arrow may carry an unlock condition.
- **Routes come from timeline branches only.** A game project without timelines has no routes until one is created.
- **Play-through follows story-map arrows** when an item finishes (a Script is read through; a conversation reaches End): arrows whose condition passes are offered as "Continue to…"; none passing = stop with a message.

## Defaults I will use unless you object
- **Cross-link target:** `{ itemId, nodeId? }`. Jump `target` becomes `{ itemId?, nodeId? }` (no `itemId` = same conversation); a choice option's `target` (now a string) becomes the same object. Target may be a Conversation or a Script (Script ignores `nodeId`). Conversation file v2 → v3, migrated in manifest v17 (old string/`{nodeId}` targets become `{nodeId}`). Link by item ID, so trash → shown broken; restore repairs it (nothing is cleared on delete).
- **Cross-item edges are not drawn on the conversation canvas** (other item not on it); the node shows an "→ Item name" chip, clickable to open it. Same-conversation edges are unchanged. Picker: item list (grouped by folder) then optional node list.
- **Story map file:** `story-map.json` (own file, manifest ref `storyMap`, v1): `boxes[]` (`{id, kind: 'item'|'beat', itemId?, text?, x, y, start}`), `arrows[]` (`{id, from, to, condition?}`). Item boxes keyed by item ID. New items are added to the map automatically (placed in a free spot); a trashed item's box stays and shows broken.
- **Derived arrows:** computed from conversations' cross-links (box → box), labelled "jump"/option text, dashed or tagged "auto" so they differ from manual ones; they never get stored. Condition on a derived arrow = the node/option condition (shown, not edited here).
- **Start boxes:** per-box flag; none set = first box is the start and the Checks note (S6) says so. Play-through start picker lists starts + any box.
- **Routes:** a route ref is `{timelineId, branchId}`, displayed by branch name (same name in two timelines = two routes, shown with the timeline name). Tags live on the item: `routes: RouteRef[]` on the manifest tree node (conversation/scene); a deleted branch leaves a broken-route chip (no cleanup, as variables). Tag editor in the item's context panel and in the story-map box inspector; story map has a route filter that dims boxes not on a chosen route.
- **Play-through scope:** a story-map-wide runner wrapping the S4 engine: state = current item + conversation state + shared variable values (carried across items, defaults reset on Reset). Item log shows item headers. Cross-link inside a conversation switches item (and node). Script items show their lines then continue. Cap stays 1000 steps overall. Nothing is written to the project. The conversation toolbar's play-through now starts this wide runner from that conversation, so a cross-item jump there just works.
- **Layout of Story map view:** `StoryMapView.vue` with `GraphCanvas` + `GraphList` toggle, inspector on the right (box: open item, start toggle, routes; arrow: condition + delete; beat: text), play-through panel reused.

## Changes while building (user-approved plan, details adjusted)
- Cross-item target is an **additive optional `link: {itemId, nodeId?}`** on jump nodes and options (mutually exclusive with the node `target`, which is then null) instead of retyping `target`; conversation file v2 → v3 only bumps the version (manifest v17).
- Routes ride on trash entries (`routes`) so they survive delete/restore.
- Single-conversation engine got `startAt` and a `left` status (cross-item exit); `src/game/storyPlaythrough.ts` is the cross-item runner, `src/storymap/model.ts` builds its model from the project.

## Steps

### 1. Target model and manifest/conversation migration (H) · tests first — **DONE**
Schemas: `itemTargetSchema` `{itemId?, nodeId?}`; conversation v3 (jump and option targets as objects); `routes` on tree nodes; `storyMap` ref in manifest. Manifest v17 migration: conversation files v2→v3, adds `routes: []`, `storyMap: null`. Tests: migration round trip, malformed rejected and untouched, old targets keep their meaning, schema rejects empty target object only when `itemId` and `nodeId` both missing on a *set* target (empty = unset stays allowed).

### 2. Story map schema, store and ops (H) · tests first, after 1 — **DONE**
`story-map.json` schema v1 (unique box/arrow ids, arrows reference existing boxes, item box ids unique per item), `src/storymap/ops.ts` (pure): `addBox/removeBox/moveBox`, `addBeat`, `connect/disconnect` (no duplicate manual arrows; loops allowed), `setStart`, `setArrowCondition`, `syncItems` (adds missing items, never deletes boxes), `derivedArrows(conversations, items)`. Store: load/patch/atomic write, created on first open of a game project. Tests: each op, sync adds new items only, derived arrows stable ids across runs, trashed item box stays, malformed file rejected and left untouched.

### 3. Cross-item graph helpers (H) · tests first, after 1 — **DONE**
`src/game/crossLinks.ts`: `resolveTarget(target, items, conversations) → ok | broken(reason: item-missing|item-trashed|node-missing)`, `outgoingLinks(conversation)`, retarget helpers (`setJumpTarget`, `setOptionTarget`). Extend `toGraph` to leave cross-item targets out of edges. Tests: same-item target unchanged, trashed item → broken, restore → ok, missing node → broken, Script target ok without node, list of links per conversation.

### 4. Cross-item play-through runner (H) · tests first, after 2, 3 — **DONE**
`src/game/storyPlaythrough.ts` (pure) over `playthrough.ts`: `start(startBoxId|itemId)`, `view` adds kinds `item-end` (offers passing arrows), `choose`, `advance`, `reset`. Rules: shared variables across items; Script item shows all lines then item-end; arrow condition fails → not offered; none offered → stop "no way on from <item>"; broken target → stop with message naming it; beat boxes are pass-through (shown as note, continue by arrows); cap 1000 steps total. Tests: cross-link switches item keeping variables, script then arrow, arrow hidden by failed condition, broken link stops, beat pass-through, loop across items, reset restores defaults, cap.

### 5. Conversation UI: cross-link picker and chips (N) · after 3 — **DONE**
Inspector Jump/option target pickers get "Other item" (item → optional node); node card shows the "→ Item" chip and broken state; chip opens the item. List view shows the cross-link in the connection list. Update `variableUses`/delete-impact so trashing an item lists inbound links in its delete dialog (counts only).

### 6. Story map section and view (N) · after 2 — **DONE**
Register `storymap` section for the game kind only (`sections.ts`, kind profile, router, panel sections), tokens `--section-storymap(-on)` in both themes (checked AA), `StoryMapView.vue`, box body (kind icon, name, start badge, route chips, broken style), inspector, derived arrows drawn dashed, manual arrows with condition label, list view alternative, keyboard model via existing helper. Boxes open their item in Write on double-click/Enter.

### 7. Routes (N) · after 1, can run parallel with 6 — **DONE**
Route picker (branches across all timelines) and chips; tagging UI in the story-map inspector and Write's item context panel; route filter on the story map; broken-route chip. Tests only for: tag/untag, listing routes from timelines, deleted branch stays as broken ref.

### 8. Play-through panel across items (N) · after 4, 6 — **DONE**
Story map toolbar "Play-through": start picker, panel reusing S4 `PlaythroughPanel` pieces (log with item headers, "Continue to…" buttons, variable table, Reset, stop messages). Also reachable from a conversation's toolbar (runs from that item).

### 9. Trash, restore and snapshots wiring (N) — **DONE** (`src/storymap/linkRepair.test.ts`; story-map file rides the generic singleton history; search over beats dropped: not in the spec)

### 10. Strings and a11y (T → Haiku) · parallel with 5–8 — **DONE**
EN/PL keys (`storymap.*`, route labels, cross-link labels, play-through messages); extend the a11y template scan (all controls named, pickers keyboard-operable, contrast of dashed/derived arrows and route chips in both themes).

### 11. Verify, screenshots, spec (N) — **DONE**
Browser run (`scripts/screenshots-s5.mjs`): two conversations + one script, cross-link jump, story map with derived + conditional manual arrow, start box, route tag with filter, delete linked conversation → broken → restore → ok, play-through from a start across items with variable change, Polish UI, dark theme, keyboard-only pass. Add an "S5" section to the existing "Storyworks Screens" Artifact (same slug). Tick spec lines, record decisions (above), update milestones, open questions (story map location, routes), memory. Real-window check only if folder-picker code is touched (not planned).

## Order
1 → (2 ∥ 3) → 4 → (5 ∥ 6 ∥ 7 ∥ 10) → 8 → 9 → 11.

## Risks
- Option `target` changes type (string → object): every S4 consumer (graph ops, play-through, search, word counts, variableUses) must be updated together; migration test must cover choices with empty/dangling targets.
- Cross-item play-through must not leak state into the project or the single-conversation panel; keep the wide runner a pure layer over the S4 engine.
- Route refs across timelines (same branch name twice) can confuse; always show the timeline name when ambiguous.
- Scope guard: no checks (dead end, unreachable item, route unreachable are S6), no game export (S6), no screenplay changes.
