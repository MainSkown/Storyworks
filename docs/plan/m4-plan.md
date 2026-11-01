# M4 · Implementation plan: Manuscript ↔ timeline links

Scope and "Done when": [milestones.md](milestones.md#m4--manuscript--timeline-links). Spec: Manuscript editor (links), Timeline editor (passages), Behavior details (dangling links), Edge cases (deleting linked scenes/nodes), UI design (gutter markers, context panel), acceptance criteria on links.
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (full context, tests first, reviewed before accepting).

**Start gate:** M3 committed (real-window check by the user may still be pending; M4 needs no M3 code changes except the timeline store hooks below).

## What already exists
- Scene schema has `links: [{ id, from:{item,block?}, to:{item,block?}, kind }]`; `src/project/links.ts` has `createLinkIndex` (`setLinks`, `linksFrom`, `linksTo`, `isBroken` with `isLive` + optional `blockExists`, `brokenLinks`), fed per scene in `indexScene`. `isLive` already excludes trashed items.
- Block IDs on all block nodes (`src/editor/blockIds.ts`), unique per file, kept on splits/pastes within a scene.
- Context panel sections `write.thisParagraph`, `write.problems`, `timelines.writtenIn` exist as placeholders. Trash has a sub-item precedent (inbox notes: `trashNoteImpl`).
- Timeline nodes are removed for good by `removeNode` (store `deleteNode`); only whole timelines go to trash.

## Decisions to settle first (record in spec "Decisions")
- **Link shape (user: per block, many-to-many):** stored in the **scene** that owns the passage: `{ id, kind: 'event', from: { item: sceneId, block: blockId }, to: { item: timelineId, block: nodeId } }`. A link is unique per (from.block, to.node); duplicates rejected. The `kind` field leaves room for rule/codex/knowledge links in M5/M6. No schema bump (fields exist); `kind: 'event'` becomes a validated value for these.
- **Broken = target gone:** timeline trashed, or node missing from its timeline file (`blockExists` for timeline targets), or passage block missing from its scene, or scene trashed. Links are **never removed automatically**.
- **Node trash (user decision: node trash entries):** deleting a node moves it, plus the edges that touched it, to `.storyworks/trash/<nodeId>/node.json` and adds a manifest trash entry `type: 'node'` (`parentId` = timeline id, `index` = position in `nodes`). Restore re-inserts the node with the **same id** (links un-break) and re-adds each saved edge whose other end still exists and would not create a cycle; skipped edges are reported ("N connections could not be restored"). Restore is refused with a message while the timeline itself is in the trash or gone. **Manifest v3 → v4** (enum gains `'node'`), trivial migration + test; new `trashedNodeSchema` (item v1).
- **Moved blocks (user decision: auto re-home):** if a link's `from.block` is missing from its owner scene but exactly one other live scene contains that block id, the link moves to that scene (written to the destination first, then removed from the source; a crash between the two leaves a duplicate that is deduped by link id on load). Zero or several candidates → stays, shown broken. Pure function over `{ links by scene, block ids by scene }`.
- **Link action on a selection (user decision):** applies to every heading/paragraph/list-item paragraph the selection touches; one picker. Blocks already linked to the chosen node are skipped. Block types that take links: the ones that carry IDs and are text blocks (paragraph, heading); list items link through their paragraph, so the paragraph ID is used.
- **Picker:** searchable dialog, nodes grouped by timeline (timeline name headers), each row: title, date (formatted), tag/branch chip; keyboard: type to filter, arrows, Enter. Works read-only as view-only (action disabled).
- **Gutter marker + badge (UI design):** linked paragraphs get a left-gutter marker (orange diamond = event; brick red triangle with "!" = broken) and a count badge; shape + `aria-label` carry the meaning, not colour alone. Badge sits in the left gutter (comments keep the right margin). Built as ProseMirror node decorations (marker class + data attrs) plus an overlay positioned from block coordinates, the same technique as [commentRail.ts](../../src/composables/commentRail.ts).
- **Navigation:** one `useJump` composable with a pending target consumed after the destination mounts: `toNode(timelineId, nodeId)` → `/timelines`, select timeline + node, centre the canvas on it; `toBlock(sceneId, blockId)` → Write, open scene, scroll block into view, brief highlight (respects reduced-motion). Broken targets never navigate; they open the repair popover instead.
- **Repair:** a link broken because the **node/timeline is missing** can be relinked (pick another node; the link's `to` is replaced) or removed; a link broken because the **passage is missing** can only be removed (the node side shows "passage no longer exists"). Restore-from-trash repairs both kinds with no extra action.
- **Deleting with links:** deleting a scene with linked blocks, or a node/timeline with linked passages, shows the confirm dialog with the link count and says the links will show as broken until restored.
- **Coverage data (for M7):** pure `coverage()` returning `{ nodesWithoutPassages: nodeId[], scenesWithoutLinks: sceneId[] }`. Only **unbroken** links count as coverage. Scenes with no text (empty word count) are excluded. No UI in M4.
- **Index reactivity:** the link index is made observable (a revision ref bumped on `setLinks`/`removeOwner`) so panels, badges and node lists update live; no per-keystroke work (links change only on link actions, scene save and timeline save).
- **Block-location map:** built in `indexScene` (scene id → set of block ids), updated on scene save; used by `blockExists`, re-homing and "passage snippet" lookup. Memory stays small (ids only).

## Steps

### 1. Tests first (N; H marked) · parallel groups below
- **Link model (H):** add link (unique per block+node, duplicate rejected, multi-select adds one per block), remove link, `linksTo(node)` lists passages across scenes, broken cases (timeline trashed, node missing, block missing, scene trashed), repaired when target returns, links never dropped, stable ordering of link ids.
- **Re-home (H):** block moved to another scene → link moves; block deleted outright → stays broken; block id in two scenes → stays broken; crash-duplicate deduped; re-run is idempotent.
- **Node trash/restore (H):** delete node → removed from timeline, edges removed, trash entry + file written; restore → same id, same position, edges back; edge skipped when other end deleted meanwhile or when it would create a cycle; restore refused when timeline is trashed; manifest v3→v4 migration keeps trash entries; newer version still read-only; invalid trashed-node file → restore refused, file untouched.
- **Coverage (N):** node with no passages listed, node with only a broken link listed, scene with no links listed, empty scene excluded, scene with ≥1 unbroken link not listed; empty book → empty.
- **Jump targets (N):** pure resolution `resolveTarget(link)` → `{ ok, kind:'node'|'block' }` or reason (`missing-node`, `missing-timeline`, `missing-block`, `missing-scene`).
- **Delete-confirm counts (N):** link counts for a scene / node / timeline.

### 2. Link model + index (H) · after 1
Extend `links.ts`: `addLink`, `removeLink`, `relinkTarget`, `resolveTarget`, `blockExists` for timeline nodes, revision ref; scene `links` saved through the existing scene save path. Reviewed by me before UI builds on it.

### 3. Node trash + manifest v4 (H) · parallel with 2
`trashedNodeSchema`, `trashNodeImpl` / `restoreNodeImpl` in the trash layer (modelled on the inbox-note functions), timeline store `deleteNode` routed through it, `restoreNode`, project store hooks, Trash dialog row ("Event · <title> · from <timeline>") and restore-failure messages, migration v3→v4.

### 4. Re-home + block map (H) · after 2
Pure `findRehomes()` and the block-location map; run after a scene save; two-step write with duplicate dedupe.

### 5. Editor extension: markers + link action (N) · after 2
TipTap extension `eventLinks`: decorations from the index (marker class, count, broken flag), command `linkSelectionToNode(nodeId)`, helper to read the blocks of the selection. Toolbar accent button "Link to event" (spec), context-menu entry, shortcut (pick a free one, add to the shortcut list), disabled in read-only.

### 6. Node picker dialog (N) · parallel with 5
`NodePickerDialog.vue`: search, grouped by timeline, keyboard model, empty state ("No events yet: create one in Timelines"), used for create and relink.

### 7. Badge overlay + popover (N) · after 5
Count badges in the gutter; click/Enter opens a popover listing the linked nodes (title, date, timeline), each with Jump / Unlink; broken rows show "missing event" with Relink / Remove.

### 8. Jump navigation (N) · after 2
`useJump` composable, scroll-to-block + highlight in the editor, centre-on-node in the timeline canvas (selection already exists in the timelines store).

### 9. Context panel content (N) · after 2, 8, parallel with 5–7
- Write → **This paragraph:** cards (orange "Event" tag + title, date, Jump/Unlink; broken ones brick-red "Problem" tag) for the block with the cursor, plus "Link to event" button. **Problems:** broken links in the open scene with Relink/Remove (count on the header; also counts passages whose own block is gone). "In this scene" stays a placeholder (M5/M6).
- Timelines → **Written in:** passages linked to the selected node (scene title, snippet of the block text, Jump; broken ones marked "passage no longer exists" + Remove). "Who learns what here" and "Linked" stay placeholders.
- i18n en + pl for all of it; empty states.

### 10. Delete confirms + coverage (N/T) · after 2, 3
Extend scene / node / timeline delete confirms with link counts; export `coverage()` (tests from step 1); no UI.

### 11. Long-book check (N) · after 4, 9
Generated book (hundreds of scenes, thousands of links): open time and index memory, badge overlay cost on a long scene, re-home pass cost. Cache or virtualise only if slow.

### 12. Verify and review (N)
Full test run. `run` skill (browser build, per memory): the spec's flow end to end — link a paragraph, follow the badge to the node, follow the passage back, delete the node (broken marker + Problems entry), restore from trash (repaired); plus multi-block link, picker, relink, Problems panel, delete-confirm with counts, Light + Dark, keyboard path through picker and badge. Screenshots → add an M4 section to `docs/review/review.json`, rebuild, update the existing "Storyworks Screens" Artifact (before/after for the placeholder panel sections). **Real-window check is mine to ask the user for** (they are remote now): link, close, reopen, inspect the scene file `links` and `.storyworks/trash/<nodeId>/node.json`; confirm only the scene file (and the manifest on trash/restore) changed. I review the link model, node trash/restore and re-home before accepting.

## Order and parallelism
`1` → `2 ‖ 3` → `4, 5 ‖ 6, 8` → `7, 9` → `10` → `11` → `12`.

## Risks
- Overlay badges drifting from blocks while typing/scrolling → positions recomputed from decorations on transaction; fall back to a decoration-only inline badge if the overlay is flaky.
- Two-file re-home write is not atomic → destination first, dedupe by link id on load, covered by a test.
- A deleted node's saved edges may conflict with later edits → restore is best-effort on edges, never on the node itself, and says what it skipped.
- Cut/paste across scenes only keeps the block id if the destination has no clash; a clash makes a fresh id and the link correctly stays broken.
