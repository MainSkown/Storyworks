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
- [ ] `project.json` gains `kind: "book" | "screenplay" | "game"`, set at creation, immutable in v1. The field exists from the first manifest version (milestone M1), so no migration is needed; a kind this app version does not know opens read-only.
- [ ] New book dialog becomes "New project": choose kind, then title, author, language.
- [ ] Schemas (Zod) for the new item files: screenplay scene, game linear script, conversation graph, variables file, story map file.
- [ ] Manifest indexes the new items and files with relative paths and order, like other items.
- [ ] The manuscript editor, toolbar, status bar, word count, export options and sidebar adapt to the project kind (see below); Book behaviour is unchanged.

### Screenplay: editor
- [ ] Scene content is a list of typed element blocks: scene heading, action, character, dialogue, parenthetical, transition. Each block keeps a stable block ID (same mechanism as prose blocks, so timeline/rule links work).
- [ ] Enter creates the logical next element (character → dialogue → action...). Tab/Shift+Tab cycles the element type; a toolbar dropdown also sets it.
- [ ] Standard screenplay layout in the editor sheet (monospace, element indents and margins).
- [ ] Character cue autocomplete from codex characters and their aliases.
- [ ] Scene heading autocomplete: INT./EXT. prefix, location from codex Places, time of day. Free text is always allowed.
- [ ] Automatic scene numbers, shown in the tree, the editor margin and the PDF.
- [ ] Title page (title, author, contact, date), edited in project settings.
- [ ] Book-only features are hidden in screenplay projects: footnotes, headings H1-H3, TOC and chapter styles. Margin comments, scene status/synopsis, corkboard, inbox and focus mode stay.
- [ ] Stats show pages and estimated runtime (about 1 page per minute) next to words, in the status bar and Stats.

### Game script: linear scripts
- [ ] Item type "Script": ordered lines. Each line has a speaker (link to a codex Character, stable ID, shown with its current name) and text.
- [ ] Each line has a stable line ID, generated once, never reused, shown in the editor margin and exported.
- [ ] Narration/system lines may have no speaker.

### Game script: conversations (branching)
- [ ] Item type "Conversation": a graph on the pan/zoom canvas (same component as timelines).
- [ ] Node types: Lines (one or more lines, like a linear script), Choice (options with text and a target), Jump (to a node, or to another item, see cross-links), End.
- [ ] Click a node to edit its lines in a side editor; choices are edited on the node.
- [ ] Conditions on a choice option or on a node's entry: a variable/flag comparison (is true, equals, greater than, less than).
- [ ] Set variables on a node or a choice (set, add, toggle).
- [ ] Project-wide variable list (own file): name, type (flag, number, text), default value; used in conditions and sets. Variables are chosen from the list, never typed free-form.
- [ ] Keyboard operation and a list view equivalent (nodes with their connections), as for other canvases.

### Game script: non-linear structure
- [ ] Cross-links: a Jump node or a choice target can point to another conversation or script (and optionally a node in it) by stable ID. Deleted targets follow the broken-link rule.
- [ ] Story map: one top-level graph per game project. Boxes are conversations, scripts and optional free "beat" notes; arrows mean "leads to"; an arrow can carry an unlock condition (variables). Boxes open their item.
- [ ] Routes: named routes (e.g. "Route A") defined on the timeline branches; items can be tagged with one or more routes. Checks flag items unreachable on a route they are tagged with.
- [ ] Play-through preview: step through a conversation or from a chosen start item on the story map as a player: read lines, pick options (options whose condition fails are hidden or shown disabled), watch variables change, reset. Nothing is written to the project.

### Consistency checks (script projects)
- [ ] Dead end: a node (other than End) with no way out.
- [ ] Unreachable node or item (not reachable from a start node / story-map start).
- [ ] Choice option with no target.
- [ ] Undefined or deleted variable used in a condition or set.
- [ ] Item tagged with a route that cannot reach it.
- [ ] Speaker link to a deleted codex entry follows the broken-link rule.
- [ ] Each check can be switched on or off in project settings and produces findings with stable IDs (same finding format as existing checks).

### Export / import
- [ ] Screenplay PDF in standard layout: Courier 12, standard margins and element indents, scene numbers, page numbers, optional title page.
- [ ] DOCX with script styles, via the existing DOCX exporter.
- [ ] Fountain (.fountain) export and import for screenplays.
- [ ] Game JSON: lines with IDs, speakers, text; conversations as nodes and edges with conditions and sets; variable list; story map; routes.
- [ ] Game CSV: one row per line (item, node, line ID, speaker, text) for localisation sheets.
- [ ] Appendices, comments and private notes are excluded as in book export. Export options that do not apply to a kind (e.g. chapter selection for CSV) are hidden.

### UI / navigation
- [ ] Sidebar for screenplay: Write (scene tree), Timelines, Rules, Codex, Checks, then Stats/History/Settings.
- [ ] Sidebar for game: Write (tree of folders holding Scripts and Conversations), Story map (new section), Timelines, Rules, Codex, Checks, then Stats/History/Settings.
- [ ] Story map section has its own colour token for both themes (AA contrast), and its own context-panel sections.
- [ ] All new strings in English and Polish via vue-i18n.

## Behavior details
- **Kind is fixed at creation.** To change kind the user exports to Fountain and imports into a new project. The new-project dialog says so.
- **Screenplay element rules.** After scene heading → action; action → action; character → dialogue; dialogue → action (or character via Tab); parenthetical → dialogue; transition → scene heading. Pressing Enter on an empty block switches it to the previous natural element.
- **Page count** is computed from the standard layout (lines per page), not from words.
- **Line IDs** are generated when a line is created (e.g. `L000123`, per project counter stored in the manifest), survive edits, splits, moves and conversions between node types, and are never reused after deletion.
- **Variables** are project-wide. Deleting one leaves its uses in place as broken references (same rule as other deletions) and the undefined-variable check reports them.
- **Conditions** use only variables; no scripting language. A node or option with a condition that fails is hidden in play-through.
- **Story map starts.** The user marks one or more boxes as "Start". Reachability checks and play-through use them; with none set, the first box is the start and the Checks page says so.
- **Routes** reuse timeline branches (a branch name is the route name). Tagging is on the item. A route with no items is allowed.
- **Fountain mapping.** Scene heading, action, character, dialogue, parenthetical, transition map one-to-one; unsupported Fountain features (dual dialogue, boneyard, notes, sections, synopses) import as action text or are skipped with a message listing what was skipped.
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

## Open questions
- Page count and runtime estimate were not selected in the screenplay extras. Keep the Stats page count (assumed) or drop it?
- Is the story map a separate sidebar section (assumed) or a view inside Write? Needs a section colour token if separate.
- Routes reuse timeline branches (assumed). Should a game project without timelines still be able to define routes directly?
- Condition model: single comparison per condition (assumed) or AND/OR groups?
- Do variables get types beyond flag/number/text (e.g. item or character reference)?
- Play-through: show hidden options as disabled or hide them? Assumed hidden.
- Where does this land in the milestones? Proposal: project kind + screenplay editor/export after M2; conversation graph and logic after M3 (shares the canvas); story map, routes, play-through and script checks after M6; game export with the export milestone. The milestones file needs updating once confirmed.
- Does the "Book language"/dictionary selection apply to script projects unchanged? Assumed yes.
- Screenplay PDF with pdfmake: page-accurate layout (page breaks inside dialogue, "(MORE)/(CONT'D)") needs verification, as with the book PDF open question.

## Relevant code
- Spec: [docs/features/storyworks-app.md](storyworks-app.md), sections Project / platform (manifest, schemas, migrations), Manuscript editor, Timeline editor (canvas, branches), Codex, Consistency checks, Export, UI design.
- Milestones: [docs/plan/milestones.md](../plan/milestones.md), M1 (manifest, `kind`), M2 (editor), M3 (timeline canvas), M8 (export), and the S-track S1–S6.
- App shell (exists, M0): `src/sections.ts` (section registry; add Story map), `src/panelSections.ts` (context-panel sections), `src/components/AppShell.vue`, `src/locales/en.json` and `pl.json`.
- Settings and tokens (exist): `src/settings/schema.ts`, `src/styles/tokens.css` (new section colour), `src/styles/tokens.contrast.test.ts` (contrast test covers it automatically if the token follows the naming pattern).
- Not yet built: manifest and item schemas (M1), editor and block IDs (M2), canvas (M3), checks, export.
