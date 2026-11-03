# S4 · Implementation plan: game script, branching conversations

Scope: [milestones.md](milestones.md#s4--game-script-branching-conversations). Spec: [script spec](../features/script-writing.md) (Game script: conversations, Behavior details: conditions, Edge cases: cycles, empty conversation).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** S3 committed (11ca40c + follow-up c18e132). Needs S3 (variables, lines) and M3 (`GraphCanvas`/`GraphList`, done).

## What already exists
- `conversation` tree node + file (`conversationSchema` v1 stub, `nodes: []`), `addConversation`, `patchConversation`, rename/delete/restore, snapshot labels, `ConversationNote.vue` placeholder, `open.ts` loads it.
- `GraphCanvas.vue` / `GraphList.vue` + `keyboard.ts` (generic, no timeline imports); `TimelineCanvas.vue` + `NodeInspector.vue` are the composition pattern.
- Game line block (`src/editor/game/`: `line` node, `LineIds`, speaker plugin, picker) and `reserveLineId()`; variables store + `variables.json`.

## Decisions (user-confirmed; record in the script spec "Decisions")
- **Conditions:** AND/OR groups. A condition is `{ mode: 'all' | 'any', terms: Term[] }` (flat, one level, at least one term); a term is `{ variableId, op, value }`. Empty/absent = no condition.
- **Failed option:** hidden in play-through.
- **Failed node entry:** play-through stops with a message naming the node and the failed condition (no fall-through).
- **Lines node body:** TipTap line blocks, same editor kind and line-ID counter as Scripts, so comments, search, spellcheck, snapshots and block links work on conversation lines.

## Defaults I will use unless you object
- **Nodes:** `lines` (ordered line blocks; one outgoing `next`), `choice` (options, each `{id, text, target, condition?, sets[]}`), `jump` (target node in the same conversation; cross-item targets come in S5, schema leaves room via a `target` object `{nodeId}`), `end`. Every node may carry `condition?` (entry) and `sets[]` (run on entry); options carry `sets[]` run when picked.
- **Edges are derived, not stored:** `lines.next`, `jump.target`, and each `option.target` are the connections; the canvas builds edges from them (option edges labelled with option text), so edges can never dangle in the file. Connect/disconnect on the canvas edits those fields. Lines node: one `next` (connecting again replaces). Choice: dragging from the node adds an option with that target.
- **Sets:** `{variableId, op, value?}`; ops `set` (all types), `add` (number), `toggle` (flag). Text variables: `set` only.
- **Comparison ops:** flag: `isTrue`, `isFalse`; number: `=`, `≠`, `>`, `<`, `≥`, `≤`; text: `=`, `≠`. Value must match the variable type.
- **Start node:** `startNodeId` on the conversation (first created node by default; user can mark another). Needed by play-through.
- **Positions:** each node stores `x, y` (like timeline nodes); new nodes are placed right of the focused node.
- **Broken variable reference:** a term/set whose variable was deleted is kept in the file and shown as "Deleted variable" (broken style, EN/PL); the variables panel's delete confirmation lists how many conversation uses it has. No restore (variables have no trash, as decided in S3). The undefined-variable *check* is S6.
- **Variable type change after use:** terms/sets using it show a "needs review" mark; play-through stops on the first mismatch with a message (same rule as an undefined variable).
- **Play-through:** a panel beside the canvas (not a dialog), starts at the start node, shows lines (speaker + text), then the visible options as buttons; a variables table with current values (changed ones highlighted); Back to start / Reset restores defaults; loops are allowed (a visit counter and a "loop" note after the same node repeats); a safety cap of 1000 steps with a message. Nothing is written to the project. Runs on one conversation only (cross-item play-through is S5).
- **Empty conversation:** the empty-state hint with an "Add first node" button.
- **Lines per node:** a Lines node with no lines is valid (shown as "Empty"). Conversation line text counts as game words (line text only, like scripts).
- **Migration:** conversation file v1 → v2 adds `startNodeId: null`, done by manifest migration v15 → v16 (project convention: per-file changes ride on a manifest bump). Step 1–2 DONE.

## Steps

### 1. Condition model and evaluation (H) · tests first — **DONE**
`src/game/conditions.ts` (pure): types, Zod schemas, `evaluateCondition(cond, vars) → {ok:true,value}|{ok:false,reason}` (undefined variable, wrong type), `applySets(sets, vars)`. Tests: ALL/ANY truth tables, every operator per type, missing variable, wrong type value, toggle/add/set, add on non-number rejected, empty condition true.

### 2. Conversation schema v2 + v1→v2 migration (H) · tests first, after 1 — **DONE**
`conversationSchema` v2: `startNodeId`, `nodes[]` discriminated by `type` (lines/choice/jump/end), `x`,`y`, `condition?`, `sets[]`, lines body = ProseMirror `content` validated with `validateGameDoc`, unique node and option ids, unique `lineId`s across the whole conversation, `jump.target.nodeId` and `option.target` are strings (dangling targets allowed, shown broken). Tests: valid file round trip, malformed rejected and left untouched, v1 stub loads (or migrates), duplicate ids/lineIds rejected, text variable with `add` rejected.

### 3. Graph model and ops (H) · tests first, after 2 — **DONE**
`src/game/conversationGraph.ts` (pure): `toGraph(conv) → {nodes, edges}` (edges from `next`/`target`/options), `addNode`, `deleteNode` (clears inbound targets → they become empty, never dangling), `connect`/`disconnect`, `addOption/removeOption/moveOption`, `setStart`, `placeNew`, `canConnect` (no self-loop restriction: loops allowed; End has no outgoing; Lines one `next`; Jump one target). Tests: each op, cycle allowed, delete clears inbound, option reorder keeps ids, edge ids stable across runs.

### 4. Play-through engine (H) · tests first, after 1, parallel with 3 — **DONE**
`src/game/playthrough.ts` (pure state machine): `start`, `view(state) → {lines, options|end|stopped}`, `choose(optionId)`, `advance`, `reset`. Tests: linear path, choice hides failed option, set on node and on option change variables, entry condition fails → stop with node + condition message, undefined variable → stop naming it, loop detected and continues, cap at 1000 steps, jump, end, empty option target stops with message, reset restores defaults.

### 5. Store integration (N) · after 2, 3 — **DONE**
`conversation/store.ts` (or store actions): load/patch through `patchConversation`, line IDs via `reserveLineId` (ids assigned on node creation, kept on edit), delete-variable impact (count uses across conversations), snapshot restore keeps the counter. Tests: save/reopen identical, delete a variable leaves uses in place and the count is right, snapshot restore round trip.

### 6. Canvas view and node editing (N) · after 3 — **DONE**
`ConversationView.vue` composing `GraphCanvas` + `GraphList` toggle; `ConversationNodeBody.vue` (node preview: type icon, first line text, option count, condition/sets badges); `ConversationInspector.vue` side panel: node type, start toggle, entry condition builder, sets list, per-type editor (Lines → embedded game line editor on the node's body, Choice → options list with text, target picker, condition, sets; Jump → target picker; End → nothing); `ConditionBuilder.vue` and `SetsEditor.vue` (variables chosen from the list only). Keyboard: node focus/connect mode via the existing helper; list view lists connections per node. Replaces `ConversationNote` except for the empty state.

### 7. Play-through panel (N) · after 4, 6 — **DONE**
`PlaythroughPanel.vue`: lines, option buttons, variable table, Reset, stop message styling, loop note; opens from the conversation toolbar.

### 8. Write wiring, counts, search (N) · after 5 — **DONE**
WriteView renders `ConversationView`; node line text counts as words; search index covers conversation lines; snapshot labels/partial restore already exist, verify with content. Tests: word-count extraction across a conversation's lines (speaker names excluded) only.

### 9. Strings and a11y (T → Haiku) · parallel with 6–7 — **DONE**
EN/PL keys (`game.conversation.*`, node types, operators, condition/sets labels, play-through messages); extend the a11y template scan to the new components (all controls named, option/target pickers keyboard-operable, contrast of condition/broken badges in both themes).

### 10. Verify, screenshots, spec (N) — **DONE** (browser run via `scripts/screenshots-s4.mjs`; fixed: play-through panel inherited the toolbar `.play` button style; inspector now hidden while play-through is open; real-window check not needed, no folder-picker change)
Browser run: build a conversation with Lines, Choice (3 options, one conditional), a set-variable, a Jump loop and an End; reopen identically; list view; play through it incl. a hidden option and the stop message; delete a variable and see the broken badge; Polish UI, dark theme; keyboard-only pass. Screenshots into an "S4" section of the "Storyworks Screens" Artifact (same slug). Tick script-spec lines, record decisions (conditions AND/OR, hidden options, stop-on-fail), update milestones and memory. Real-window check only for the folder picker pass.

## Order
1 → (2) → (3 ∥ 4) → 5 → (6 ∥ 9) → 7 → 8 → 10.

## Risks
- Embedding the TipTap line editor inside an inspector for the selected node (one editor instance, swapped per node; block ids and line IDs must survive swapping).
- Canvas option edges: several edges between the same two nodes (distinct ids per option) and label overlap.
- Scope guard: no cross-item links, story map or cross-item play-through (S5), no checks (S6).
