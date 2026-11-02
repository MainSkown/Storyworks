# M6 · Implementation plan: Relationships, states, knowledge

Scope: [milestones.md](milestones.md#m6--relationships-groups-states-knowledge), split in three parts by the user (**M6a, M6b, M6c**). Spec: Relationships and groups, States, Knowledge, Codex (Chronicle), Behavior details (chronological order, dangling links), Edge cases (relationships, learning events).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** M5 committed. Each part starts after the previous one is committed and its screenshots published.

## What already exists
- Manifest already has empty `relationTypes`, `relationships`, `groups`, `stateKinds`, `knowledge` ref lists (v6). Trash `type` enum has `entry`.
- `timeline/order.ts` `compare(a, b, ctx)` with `Position` (node or date): the shared order helper. `OrderContext` needs calendar + timeline lookup.
- `GraphCanvas.vue` (vue-flow wrapper; `GraphNodeModel`/`GraphEdgeModel`, keyboard support) and `GraphList.vue` (list fallback) from M3.
- Codex store/view with entry tabs Details / Links / Mentions; link index (`links.ts`), scene links `{id, from, to, kind}`; `deleteImpact.ts`, `linkProblems.ts`, trash, `useJump`, entry picker (`codex/pick.ts`), panel sections (`panelSections.ts`).

## Decisions (record in spec "Decisions")
- **Split (user):** M6a relationships/groups/graph · M6b states + Chronicle · M6c knowledge.
- **"Located in" (user):** only a starter relation type with reverse label "contains". No hierarchy view or tree.
- **Graph layout (user):** automatic layout (groups pull members together), dragged positions saved per book.
- **Files (proposed):**
  - `relation-types/<id>.json` `{name, reverseLabel, color}`; starters: Friend, Enemy, Parent↔Child, Sibling, Lover, Located in↔Contains, Owns↔Owned by.
  - `relationships/<id>.json` `{fromId, toId, typeId, note, nodeRef?}`; `nodeRef` = `{timelineId, nodeId}`.
  - `groups/<id>.json` `{name, color, memberIds}`.
  - `relationships/layout.json` `{version, positions: {entryId: {x,y}}}`; new manifest `relationLayout` ref.
  - `state-kinds/<id>.json` `{name, valueType: 'text'|'entry', exclusive}`; starters Location, Owner, Status, Title.
  - **States live on the entry file** (`states: [{id, kindId, value, from, until, final}]`; positions are `Position`). Reverse views and overlap data come from a scan.
  - `knowledge/<id>.json` item `{title, description, tags, about, learnings: [{id, entryId, at, note, forgottenAt, revealedIn}]}`. Learning events live in the item file so the three edit places share one record.
- **Schema bumps:** manifest v6 → v7 (layout ref); entry v1 → v2 (`states`); scene v → +1 (knowledge use link, see M6c). Each with a migration and a migration test.
- **Delete rules:** relationships, groups, state kinds, relation types, knowledge items are plain delete with a confirm listing dependents (no trash; they hold little data). Entry delete (M5) keeps relationships/memberships/states/learnings and marks them broken; restore un-breaks.
- **Duplicate check:** same `fromId`, `toId`, `typeId` rejected; self-relationship rejected.
- **Type delete:** must reassign to another type (relation types, state kinds), as codex types do.
- **Order:** every period/"As of"/Chronicle check goes through `compare`; unknown order = never flagged, never guessed. Half-open periods: `until(a) == from(b)` is no overlap.
- **Groups cannot learn** (spec open question; assumed no).
- **Not in M6:** the consistency checks themselves (M7). M6 only exposes pure detection functions (`overlappingStates`, `knowledgeUsedBeforeLearned`, `appearsAfterFinal`) that M7 wraps into findings.

---

## M6a · Relationships, groups, graph

### 1. Tests first (N)
- Schemas valid/invalid, file untouched; manifest v6→v7 migration; starter relation types seeded once.
- Duplicate and self relationship rejected; reverse label shown on the other side, same label when none.
- Relation-type delete needs reassignment; last type deletable? (yes, none required).
- Entry trashed → relationship/membership marked broken; restored → fine.
- Group membership add/remove, entry in several groups.
- Graph filters (relation type, entry type, group) incl. dimming rules.
- Layout: groups pull members together (member centroid distance shrinks); saved positions win over computed ones; missing entry ids in layout ignored.

### 2. Schemas + migration + seeding (N)
`relationType.ts`, `relationship.ts`, `group.ts`, `relationLayout.ts`, manifest v7.

### 3. Stores (N)
`relations` and `groups` Pinia stores modelled on the codex store: CRUD, validation, atomic writes, broken-state resolution, link index entry for node-linked relationships (back-link on node).

### 4. Entry "Relationships" + "Groups" sections (N)
New tab "Relations" on the entry page: incoming/outgoing list (directed, reverse label), add dialog (entry picker, type combobox that creates a type on the fly, note, optional node link), edit, remove. Group chips with add/remove. Broken rows for trashed entries.

### 5. Managers (T/N) · parallel with 4
Relation types manager (rename, recolour, reverse label, delete-with-reassign); Groups manager (name, colour, members).

### 6. Relationship graph view (H)
Auto-layout helper (pure, tested first): force-style with group attraction, deterministic seed, no new runtime dependency unless a hand-written one proves slow; **decision at step start: hand-written ≤ 300 nodes, else add `d3-force`**. Built on `GraphCanvas`; group regions as rounded hulls behind members (shape + label, not colour alone); labelled coloured edges; pan/zoom; filter bar (relation type, entry type, group); click opens entry; drag saves position; "Re-layout" button; `GraphList` fallback for keyboard/screen reader. New route "Relationships" under Codex.

### 7. Node link + context panel (N)
Timeline inspector "Relationships" section (back-links from `nodeRef`); `panelSections` gains relationships for current scene's entries.

### 8. Verify (N)
Run app, screenshots (entry Relations tab, managers, graph with groups and filters, node inspector), publish to the existing Artifact; tests, typecheck, lint.

---

## M6b · States and Chronicle

### 1. Tests first (N; H marked)
- Entry v1→v2 migration; state-kind schemas; starters seeded once.
- **Overlap detection (H):** two exclusive states same kind overlapping (flagged); touching at boundary (not); open-ended `until` overlaps later start; non-exclusive kind never; unknown order never; different kinds never; `from == until` empty period ignored.
- Final flag: `appearsAfterFinal(entry, positions)` true only when a position is definitely after the final state's `from`; unknown order false.
- Reverse view: Town lists entries whose Location state points at it, with from/until; Person lists owned items; trashed referrer shown broken.
- Position mixing: node vs date, nodes on different timelines (unknown).
- Chronicle ordering (H): dated, path-ordered, unknown listed after in timeline order; stable; includes nodes, states, relationships with `nodeRef` (knowledge events added in M6c).

### 2. Schemas + migration (N)
`stateKind.ts`; entry `states`; position schema shared with M3 (`from`/`until` = node ref or calendar date).

### 3. State kinds manager + store (N)
Add/rename/delete-with-reassign, value type, exclusive flag.

### 4. Entry "States" section (N)
Add/edit/remove with kind, value (text or entry picker), from/until position picker (reuse node picker + date input), final checkbox, inline warning when exclusive overlap is detected from data (informational; real findings in M7). Reverse-view section "States pointing here".

### 5. Order context + detection functions (H)
`orderContext()` built from calendar + timelines store; `overlappingStates`, `appearsAfterFinal` as pure functions over data. Reviewed before UI relies on them.

### 6. Chronicle tab (H)
Pure `buildChronicle(entry, data, ctx)` returns rows `{kind, label, position, date?, target}` in order; tab "Chronicle" lists them with in-world dates and Jump; "Appears in" stays separate (M5). Knowledge events join in M6c.

### 7. Verify (N)
Screenshots (States section with overlap hint, reverse view, Chronicle), publish, tests.

---

## M6c · Knowledge

### 1. Tests first (N; H marked)
- Knowledge item and learning schemas; file untouched when invalid; `forgottenAt` before `learnedAt` rejected, unknown order accepted.
- `knowsAsOf(entry, position)`: before learning → not known; at/after → known; after forgetting → not known; unknown order → "unknown" (never guessed).
- Who-knows-it-as-of for an item; matrix cell data and greying.
- Node knowledge count (learn + forget events at node); hidden at zero.
- **Use links (H):** scene link kind `knowledge` stores (item, entry) pair; unique per (block, item, entry); broken when item or entry trashed/missing; `knowledgeUsedBeforeLearned` true only when block's node link is definitely before learning, false when unknown or no node link.
- Entry delete keeps learnings and shows broken; restore un-breaks.
- Three editing places write the same learning (create from entry, item, node → same record shape).

### 2. Schemas + migration (N)
`knowledge.ts`; scene links `to` gains optional `entry` for the pair (scene version bump + migration + migration test).

### 3. Knowledge store (N)
Item CRUD, learning CRUD, link index for `knowledge` kind, `about` reference to rule or entry (broken when missing).

### 4. Knowledge area in Codex (N)
List of items (tags, search), item page: title, description, tags, "about" picker, "Who knows it" with learning positions and "+ Who learns it"; **As of selector** (node or date).

### 5. Entry "Knowledge" section (N)
Character page: known items in chronological order, "+ Learns…", forget/edit/remove, jump to node, As-of selector. Reads positions via the order helper.

### 6. Knowledge matrix view (N)
Rows = entries, columns = items, cells show learning position; As-of greys the unknown; keyboard navigable grid; new route under Codex.

### 7. Timeline node integration (N)
Knowledge marker (count) on nodes in flow/date views, hidden at zero; inspector "Who learns what here" with "+ Character learns…" (character + item picker).

### 8. Editor: knowledge use link (H)
"Link to…" picker gains a **Knowledge** tab (pick item, then entry); gutter marker for kind `knowledge` (distinct shape + `aria-label`); popover lists pairs; broken state. M4/M5 link tests stay green.

### 9. Chronicle + final wiring (N)
Add knowledge events to Chronicle; `revealedIn` block picker on a learning (jump to block); context panel section for the open scene's knowledge pairs.

### 10. Verify (N)
Screenshots (item page + As of, entry Knowledge section, matrix, node marker + inspector, editor marker), publish, full test run. Update milestone "Done when" checks: overlapping states and use-before-learning detectable from data (pure functions tested).

## Sequencing and parallelism
- M6a: 1 → 2 → 3 → (4 ∥ 5 ∥ 7) → 6 → 8. M6b: 1 → 2 → (3 ∥ 5) → 4 → 6 → 7. M6c: 1 → 2 → 3 → (4 ∥ 5 ∥ 6 ∥ 7) → 8 → 9 → 10.
- Hard steps (M6a-6 layout, M6b-1/5/6, M6c-1/8) get full context, spec sections named and tests first; I review before accepting.

## Real-window check (user, after each part)
New JSON folders and files on disk, manifest v7, entry file `states`, scene link migration, saved graph layout, large cast graph performance (~300 entries).
