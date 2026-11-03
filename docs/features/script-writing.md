# Script writing (screenplay and game script)

## Summary
Besides books, BookWriter supports writing scripts in v1. A project is created as **Book**, **Screenplay** or **Game script**. Screenplays use typed script elements and export to standard formats. Game scripts hold linear scripts and branching conversations (graph canvas with choices, conditions and variables), linked into a non-linear whole with a story map, routes and a play-through preview. Everything else (timelines, codex, rules, checks, snapshots, search, goals) is shared.

## Goals
- Write a film/TV screenplay in standard layout with fast keyboard input.
- Write game dialogue as linear lines and as branching conversations, with conditions and variables.
- See and test the whole game's non-linear structure: links between items, story map, routes, play-through.
- Keep one app, one project format and one set of shared tools (codex, timelines, checks, snapshots).

## Non-goals
- Stage-play format, audio-drama format, dual dialogue (all after v1).
- Per-line direction notes and per-line production status for game lines (not chosen for v1).
- Locking scene numbers (numbers are automatic only).
- Changing a project's kind after creation.
- Running the game logic inside a real engine; play-through is an in-app preview only.

## Changes

### Project / platform
- [x] `project.json` gains `kind: "book" | "screenplay" | "game"`, set at creation, immutable in v1. The field exists from the first manifest version (milestone M1), so no migration is needed; a kind this app version does not know opens read-only.
- [x] New book dialog becomes "New project": choose kind, then title, author, language.
- [ ] (S3-S5 done: game script lines, conversation graph, variables file, story map file; the game-script ones are in) Schemas (Zod) for the new item files: screenplay scene, game linear script, conversation graph, variables file, story map file.
- [ ] Manifest indexes the new items and files with relative paths and order, like other items.
- [x] The manuscript editor, toolbar, status bar, word count and sidebar adapt to the project kind (S1; export options follow in S2/S6); Book behaviour is unchanged.

### Screenplay: editor
- [x] Scene content is a list of typed element blocks: scene heading, action, character, dialogue, parenthetical, transition. Each block keeps a stable block ID (same mechanism as prose blocks, so timeline/rule links work).
- [x] Enter creates the logical next element (character → dialogue → action...). Tab/Shift+Tab cycles the element type; a toolbar dropdown also sets it.
- [x] Standard screenplay layout in the editor sheet (monospace, element indents and margins).
- [x] Character cue autocomplete from codex characters and their aliases.
- [x] Scene heading autocomplete: INT./EXT. prefix, location from codex Places, time of day. Free text is always allowed.
- [x] Automatic scene numbers, shown in the tree and the editor margin (S1); the PDF follows in S2.
- [x] Title page (title, author, contact, date), edited in project settings.
- [x] Book-only features are hidden in screenplay projects: footnotes, headings H1-H3, TOC and chapter styles. Margin comments, scene status/synopsis, corkboard, inbox and focus mode stay.
- [x] Stats show pages and estimated runtime (about 1 page per minute) next to words, in the status bar and Stats (S2).

### Game script: linear scripts
- [x] Item type "Script": ordered lines. Each line has a speaker (link to a codex Character, stable ID, shown with its current name) and text.
- [x] Each line has a stable line ID, generated once, never reused, shown in the editor margin and exported.
- [x] Narration/system lines may have no speaker.
- [x] Line kinds (added after S3 review): a line is Speech (speaker chip) or Text (a description with no speaker, no chip, styled as prose; still has a line ID). The speaker picker has a "Text" option; Enter at the end of a Text line starts another Text line.
- [x] Item type "Text": free prose for descriptions of locations and events (bold, italic, lists, quotes, margin comments, event links). It is a scene file whose body is paragraphs, so counts, status, links, search, snapshots and trash work unchanged; the editor is chosen from the body (lines = script, anything else = text). Text items have no line IDs.

### Game script: conversations (branching)
- [x] Item type "Conversation": a graph on the pan/zoom canvas (same component as timelines).
- [x] Node types: Lines (one or more lines, like a linear script), Choice (options with text and a target), Jump (to a node, or to another item, see cross-links), End. (Targets within the conversation; other items arrive with cross-links, S5.)
- [x] Click a node to edit its lines in a side editor; choices are edited on the node.
- [x] Conditions on a choice option or on a node's entry: a variable/flag comparison (is true, equals, greater than, less than).
- [x] Set variables on a node or a choice (set, add, toggle).
- [x] Project-wide variable list (own file): name, type (flag, number, text), default value; used in conditions and sets. Variables are chosen from the list, never typed free-form.
- [x] Keyboard operation and a list view equivalent (nodes with their connections), as for other canvases.

### Game script: non-linear structure
- [x] Cross-links: a Jump node or a choice target can point to another conversation or script (and optionally a node in it) by stable ID. Deleted targets follow the broken-link rule.
- [x] Story map: one top-level graph per game project. Boxes are conversations, scripts and optional free "beat" notes; arrows mean "leads to"; an arrow can carry an unlock condition (variables). Boxes open their item.
- [x] Routes: named routes (e.g. "Route A") defined on the timeline branches; items can be tagged with one or more routes. (Tagging done in S5; the check that flags an unreachable tagged item is S6.)
- [x] Play-through preview (one conversation is done in S4; from a story-map start is S5): step through a conversation or from a chosen start item on the story map as a player: read lines, pick options (options whose condition fails are hidden or shown disabled), watch variables change, reset. Nothing is written to the project.

### Consistency checks (script projects)
- [ ] Dead end: a node (other than End) with no way out.
- [ ] Unreachable node or item (not reachable from a start node / story-map start).
- [ ] Choice option with no target.
- [ ] Undefined or deleted variable used in a condition or set.
- [ ] Item tagged with a route that cannot reach it.
- [ ] Speaker link to a deleted codex entry follows the broken-link rule.
- [ ] Each check can be switched on or off in project settings and produces findings with stable IDs (same finding format as existing checks).

### Export / import
- [x] Screenplay PDF in standard layout: Courier 12, standard margins and element indents, scene numbers, page numbers, optional title page.
- [x] DOCX with script styles, via the existing DOCX exporter.
- [x] Fountain (.fountain) export and import for screenplays (import also by paste).
- [ ] Game JSON: lines with IDs, speakers, text; conversations as nodes and edges with conditions and sets; variable list; story map; routes.
- [ ] Game CSV: one row per line (item, node, line ID, speaker, text) for localisation sheets.
- [ ] Appendices, comments and private notes are excluded as in book export. Export options that do not apply to a kind (e.g. chapter selection for CSV) are hidden.

### UI / navigation
- [x] Sidebar for screenplay: Write (scene tree), Timelines, Rules, Codex, Checks, then Stats/History/Settings.
- [x] Sidebar for game: Write (tree of folders holding Scripts and Conversations), Story map (new section), Timelines, Rules, Codex, Checks, then Stats/History/Settings.
- [x] Story map section has its own colour token for both themes (AA contrast), and its own context-panel sections.
- [x] All new strings in English and Polish via vue-i18n.

## Behavior details
- **Kind is fixed at creation.** To change kind the user exports to Fountain and imports into a new project. The new-project dialog says so.
- **Screenplay element rules.** After scene heading → action; action → action; character → dialogue; dialogue → action (or character via Tab); parenthetical → dialogue; transition → scene heading. Pressing Enter on an empty block switches it to the previous natural element.
- **Page count** is computed from the standard layout (lines per page), not from words.
- **Line IDs** are generated when a line is created (e.g. `L000123`, per project counter stored in the manifest), survive edits, splits, moves and conversions between node types, and are never reused after deletion.
- **Variables** are project-wide. Deleting one leaves its uses in place as broken references (same rule as other deletions) and the undefined-variable check reports them.
- **Conditions** use only variables; no scripting language. A node or option with a condition that fails is hidden in play-through.
- **Story map starts.** The user marks one or more boxes as "Start". Reachability checks and play-through use them; with none set, the first box is the start and the Checks page says so.
- **Routes** reuse timeline branches (a branch name is the route name). Tagging is on the item. A route with no items is allowed.
- **Fountain mapping.** Scene heading, action, character, dialogue, parenthetical, transition map one-to-one. `# Sections` map to Sequences (export writes one per sequence). Unsupported features (title page keys, dual dialogue, boneyard, notes, synopses, page breaks, scene-number tags, emphasis marks, centred and lyric lines) are skipped or imported as plain text, and the import preview lists what was skipped.
- Shared features keep working on script blocks through stable block IDs: timeline links, rule links, margin comments, snapshots, search, goals.

## Edge cases
- Opening a project whose `kind` is unknown to this app version → opens read-only with a warning (same as a newer format version).
- Conversation with no nodes → empty-state hint to add the first node.
- Cycle in a conversation graph (loops are valid in games) → allowed; play-through shows the loop and offers reset; reachability and dead-end checks still work.
- Choice or jump to an item or node that was deleted → shown as broken, reported by a check, restorable from trash.
- Character cue or speaker for a name not in the codex → allowed as plain text; a hint offers "Add to codex".
- Fountain import of a file with no scene headings → one scene with all content as action, with a message.
- Very long scripts (hundreds of scenes or nodes) must open and scroll without delay; build an in-memory index at open (same open question as the manuscript tree).
- Play-through on a conversation with a condition on an undefined variable → stops with a message naming the variable.

## Acceptance criteria
- When the user creates a new project and picks Screenplay, the editor offers script elements, Enter and Tab move between them, and the saved scene file contains typed blocks with IDs.
- When the user types a character cue, codex characters and aliases are suggested.
- When the user exports a screenplay to PDF, the file uses the standard layout with scene numbers and page numbers; exporting to Fountain and importing it back reproduces the same elements.
- When the user creates a Game script project, they can add a Script and a Conversation, add Lines, Choice, Jump and End nodes, set conditions and variables, and the graph reopens identically after restart.
- When a conversation has a node with no way out, Checks shows a dead-end finding; fixing it removes the finding; the finding ID stays the same across runs.
- When the user links a choice to another conversation and deletes that conversation, the link shows as broken and returns after restoring it from trash.
- When the user opens the story map, all items appear as boxes; an arrow with a condition shows it; marking a start box and running play-through walks the paths and changes variables as defined.
- When the user tags an item with a route it cannot reach, Checks reports it.
- When the user exports game JSON and CSV, every line appears with its stable ID and speaker.
- An existing Book project opens unchanged and keeps working with the `kind` field present.

## Decisions
- **Kind chosen per project**, not mixed (user decision): keeps the editor, export and word counts consistent; shared tools stay shared.
- **Formats in v1:** screenplay, linear game script, branching game conversations (user decision). Stage play deferred.
- **Screenplay input: typed element blocks with Enter/Tab cycling** (user decision), not Fountain-style inference; Fountain is import/export only.
- **Conversations are graph canvases** (user decision), reusing the timeline canvas component.
- **Game logic in v1:** choices, jumps, ends, conditions, set variables, and the dead-end/unreachable checks (user decision).
- **Game line fields:** speaker from codex and stable line ID (user decision). Direction notes and per-line status are not in v1.
- **Screenplay extras:** autocomplete of characters and locations, scene numbers and title page (user decision). Page count/runtime and dual dialogue were not chosen; page count is still listed in Stats as an assumption (see Open questions).
- **Game projects hold linear Scripts and Conversations** (user decision), no screenplay cutscenes.
- **Non-linear storytelling** (user decision): cross-links between items, story map, routes via timeline branches, and play-through preview are all in v1.
- **Export formats** (user decision): screenplay PDF, DOCX, Fountain, game JSON/CSV.
- **Kind immutable after creation** and **project-wide variables without a scripting language** are my assumptions, kept simple to bound scope.

- **S1 decisions (user-confirmed):** a screenplay tree is Sequence > Scene, no parts. Every scene-heading line gets a number running through the whole script in tree order; the tree shows an item's first number; numbers are derived, never stored. Game projects can be created in S1; Write shows a "coming in a later version" placeholder while Codex, Timelines, Rules, Checks, Stats and History work.
- **S1 defaults:** Tab order scene heading → action → character → dialogue → parenthetical → transition; empty Enter falls back per `src/editor/screenplay/rules.ts`; stored text is as typed and uppercase is display-only; pasted plain text becomes action blocks; Export and Import are hidden for script kinds until S2/S6; manifest v13 adds `titlePage {contact, date}`; saving a manifest with a different kind is rejected.

- **S2 decisions (user-confirmed):** page count and runtime (about 1 page per minute) stay in the status bar and Stats; Fountain text pasted into the editor becomes typed elements (only when it has a scene heading or a cue followed by dialogue); Sequences round-trip as Fountain sections; screenplay export lives on the Export page (PDF, Word, Fountain; options: page size Letter/A4, title page, scene numbers, page numbers, (MORE)/(CONT'D), sequence selection), saved per project in manifest v14 (`scriptExport`).
- **S3 decisions (user-confirmed):** game folders nest to any depth; the variable list is edited in a "Variables" panel opened from the Write sidebar; a Script's body is TipTap line blocks (speaker chip + text), so comments, search, spellcheck, snapshots and block links work unchanged; a Conversation is a minimal stub file in S3 (S4 adds the graph with a migration).
- **S3 defaults:** a game folder is a `chapter` node, a Script is a `scene` node, a Conversation is a new `conversation` node (labels per kind); manifest v15 adds `lineCounter` and `variables`. A line carries `lineId` (`L000123`, counter only grows; split gives the new half a new id, merge retires one, paste gets fresh ids; snapshot restore never lowers the counter) and either `speakerId` (codex entry, name resolved live) or `speakerName` (plain text, "Add to codex" turns every line with that name into a codex speaker) or neither (narration). A new line starts without a speaker; Tab at the start of a line, the toolbar button or the chip opens the speaker picker. A deleted speaker shows a broken chip and the picker offers Restore. Variables: names unique (any case), default must match the type, changing the type resets it, delete asks for confirmation and has no trash. Words count line text only. Open limits: Stats card still says "Whole book" for games; delete-impact counts speaker lines in the codex delete dialog only.
- **S4 decisions (user-confirmed):** a condition is a flat group `{mode: all|any, terms[]}` (AND or OR, one level, at least one term; a term is variable + operator + value); an empty condition means always true. An option whose condition fails is hidden in play-through. If a node's entry condition fails on arrival, play-through stops with a message naming the node and the failed condition (no fall-through). A Lines node's body is TipTap line blocks, the same editor kind and line-ID counter as Scripts, so comments, search, spellcheck, snapshots and block links work on conversation lines.
- **S4 defaults:** connections are derived from `lines.next`, `jump.target` and each option's `target`, never stored as separate edges, so a connection cannot dangle in the file (a deleted node clears inbound targets; a target to a missing node shows a broken-link badge). Nodes store `x, y`; a conversation stores `startNodeId` (first node by default, the user can mark another). Sets are `set` (all types), `add` (number), `toggle` (flag); comparison operators depend on the variable type. A term or set on a deleted variable stays in the file and shows "Deleted variable"; one whose variable changed type shows "Needs review"; the play-through stops on either. The variable delete dialog counts uses in conversations. Play-through runs on one conversation, shows a loop note on a revisited node, stops after 1000 steps, never writes to the project. Manifest v16 migrates conversation files v1 to v2 (`startNodeId: null`). Open limits: backward connections are drawn as long curves across the canvas, and a search hit opens the conversation but does not select the node.
- **S5 decisions (user-confirmed):** the Story map is a separate sidebar section for game projects (own teal colour token, own context-panel sections); story-map arrows are both derived (read-only, from cross-item links in conversations) and manual (drawn between boxes, optional unlock condition); routes come from timeline branches only; cross-item play-through follows manual arrows when an item ends (offered as "Continue to…", none open = stops with a message).
- **S5 defaults:** a cross-link is an optional `link {itemId, nodeId?}` on a Jump node or an option (exclusive with the in-conversation target; it targets a Conversation or a Script by tree id, so trashing the target shows it broken and restoring repairs it); the story map is `story-map.json` (boxes of items and free beats, manual arrows, a Start flag per box; items get a box automatically, a trashed item's box stays); a route tag is `{timelineId, branchId}` on the manifest tree node (kept through trash and restore, a deleted branch shows as a broken chip); play-through carries variable values across items, caps at 1000 steps overall, never writes. Manifest v17 (conversation files v2 to v3, `storyMap`). Open limits: derived arrows are not drawn with a condition shown when several links share a pair of boxes; a play-through in a read-only project with no story-map file has no boxes to start from.
- **S2 defaults:** our own paginator lays out every page (Liberation Mono 12 pt, 55 rows on Letter, 58 on A4; heading never last on a page; a cue keeps 2 speech rows; speeches split at sentence ends with (MORE)/(CONT'D), Polish (DALEJ)/(CD.)); the PDF draws exactly those pages, so the status-bar page count equals the PDF's (title page not counted). Word paginates itself and may differ slightly. Scene numbers are not written to Fountain.

## Open questions
- Is the story map a separate sidebar section (assumed) or a view inside Write? Needs a section colour token if separate.
- Routes reuse timeline branches (assumed). Should a game project without timelines still be able to define routes directly?
- ~~Condition model: single comparison or AND/OR groups?~~ Resolved in S4: AND/OR groups (see S4 decisions).
- Do variables get types beyond flag/number/text (e.g. item or character reference)?
- ~~Play-through: show failed options as disabled or hide them?~~ Resolved in S4: hidden.
- Where does this land in the milestones? Proposal: project kind + screenplay editor/export after M2; conversation graph and logic after M3 (shares the canvas); story map, routes, play-through and script checks after M6; game export with the export milestone. The milestones file needs updating once confirmed.
- Does the "Book language"/dictionary selection apply to script projects unchanged? Assumed yes.
- ~~Screenplay PDF with pdfmake~~ Resolved in the S2 spike (2026-11-03): pdfmake's own page breaking is not used. Our paginator decides every page; the PDF draws each page with absolutely positioned left-aligned lines (page margins 0, 12 pt pitch, Liberation Mono at 7.2 pt per character, x computed for right-aligned/centred text, one empty `pageBreak: 'before'` node between pages). Verified: PDF page count equals laid-out pages, positions exact, Polish characters and selectable text fine. Lines must stay inside the page, or pdfmake pushes them to a new page.

## Relevant code
- Spec: [docs/features/storyworks-app.md](storyworks-app.md), sections Project / platform (manifest, schemas, migrations), Manuscript editor, Timeline editor (canvas, branches), Codex, Consistency checks, Export, UI design.
- Milestones: [docs/plan/milestones.md](../plan/milestones.md), M1 (manifest, `kind`), M2 (editor), M3 (timeline canvas), M8 (export), and the S-track S1–S6.
- App shell (exists, M0): `src/sections.ts` (section registry; add Story map), `src/panelSections.ts` (context-panel sections), `src/components/AppShell.vue`, `src/locales/en.json` and `pl.json`.
- Settings and tokens (exist): `src/settings/schema.ts`, `src/styles/tokens.css` (new section colour), `src/styles/tokens.contrast.test.ts` (contrast test covers it automatically if the token follows the naming pattern).
- Not yet built: manifest and item schemas (M1), editor and block IDs (M2), canvas (M3), checks, export.
