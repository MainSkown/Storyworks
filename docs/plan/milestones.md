# Storyworks: milestones

From an empty repository to the complete v1 described in [docs/features/storyworks-app.md](../features/storyworks-app.md) (the **spec**) and [docs/features/script-writing.md](../features/script-writing.md) (the **script spec**: screenplay and game scripts, built as the **S-track** S1–S7 after the book milestones they extend). The spec says *what* the app does; this file says *what has to exist, in what order*, so a planning agent can take one milestone and write its implementation plan. It deliberately does not say how to split work or who does it.

## How to use this file
- A milestone is complete only when its **Done when** list is true in the running app, its tests pass, and (for UI) screenshots were published for review (see `.claude/CLAUDE.md`).
- Milestones are ordered by dependency. A milestone may start once everything under **Needs** is complete.
- Each milestone names the spec sections it covers. The spec wins on detail; if the spec and this file disagree, fix the spec first.
- Open questions from the spec are assigned to the milestone that must settle them.

## Cross-cutting rules (apply to every milestone)
- All user-facing text goes through vue-i18n, English and Polish.
- All UI works in Light and Dark themes through the Workshop design tokens; nothing hard-codes a colour.
- Every JSON file type has a Zod schema, validated on read and write; schema changes are migrations.
- Disk writes are atomic; invalid files are reported and never overwritten or auto-repaired.
- Keyboard operable, labelled controls, visible focus (the accessibility baseline is *built in*, then audited in M11).
- Tests come first, for what can break or regress (see CLAUDE.md).

---

## M0 · Foundation and app shell
**Goal:** an empty but real desktop app with the Workshop look, theming, localisation and layout that every later feature plugs into.

**Needs:** nothing.

**Scope**
- Tauri + Vue 3 + TypeScript + Vite project with Quasar, lint/format, unit-test runner, and a way to run the app for screenshots. Decide and record the app name and identifier (open question in the spec).
- Workshop design tokens for Light and Dark, including section colours and type-tag colours; theme switch (Light, Dark, Follow system) applied instantly.
- vue-i18n with English and Polish; language switch.
- App-level settings file in the OS app-data directory (theme, language, UI zoom, editor font size, panel states), validated by a schema.
- Main layout: sidebar with sections (Write, Timelines, Rules, Codex, Checks, Stats/History/Settings), coloured header band, central area, right context panel with **collapsible sections** (state remembered) that can be hidden.
- Welcome screen shell (New / Open / Recent) wired later by M1.
- UI zoom and editor-font-size settings.

**Done when**
- The app launches on Linux and Windows, shows the shell, and every section is reachable (placeholders allowed).
- Switching theme, language and zoom takes effect immediately and survives restart.
- Collapsing a context-panel section survives restart.

**Spec:** Project / platform (scaffold, i18n), UI design, Comfort and accessibility (themes, zoom).

---

## M1 · Project storage and integrity
**Goal:** a book is a project folder that can be created, opened, edited, autosaved and recovered safely.

**Needs:** M0.

**Scope**
- Settle the open question *item file format* (JSON per item; how stable block IDs are stored) and record it in the spec.
- Project folder layout and `project.json` manifest (format version, project `kind`, metadata, goals, dictionary selection, index of all items with relative paths and order).
- Schemas for the manifest and every item file type that exists so far; read/write layer with atomic writes; a migration mechanism (version N→N+1) with backup before migrating; newer-version projects open read-only. `kind` is `book` only until S1, and a project with a kind this app version does not know opens read-only like a newer version (so S1 needs no migration).
- New book, Open book (folder or `project.json`), recent books list; default new-book content.
- Autosave engine (debounced, atomic) with a "saved" state.
- Per-book lock file; detection of external changes while open (reload or keep); missing-file and invalid-file handling that keeps the book open and marks only the affected item; unlisted files offered for import.
- Trash for deleted items and restore.
- Link index infrastructure: a registry of references between items by stable IDs, with broken-link detection (used by every later linking feature).

**Done when**
- A created book reopens identically after restart; only the files that should change do change on disk.
- A hand-corrupted item file, a missing file, an invalid manifest and a newer-version project each behave as the spec's edge cases say, without data loss.
- Opening the same book twice is refused with a clear message; an outside edit prompts reload/keep.
- A deleted item can be restored from the trash.

**Spec:** Project / platform (project, manifest, autosave), App safety and recovery (lock, external changes), Behavior details, Edge cases (project files). Script spec: Project / platform (`kind`), Edge cases (unknown kind).

---

## M2 · Manuscript editor
**Goal:** write a whole book: structured outline, full formatting, notes, and scene metadata.

**Needs:** M1.

**Scope**
- Outline tree of parts, chapters and scenes: create, rename, delete (to trash), drag to reorder and re-nest; order lives in the manifest.
- Rich-text editor with H1–H3, bold/italic/underline, lists, quotes, text alignment (left, centre, right, justified), scene-break divider, footnotes, images (copied to the project's assets), per-scene loading for long books.
- Stable block IDs that survive edits, splits and moves. Build the editor schema so the set of block types and the toolbar can differ per project kind (S1 adds screenplay elements; Book stays as specified).
- Margin comments (private, text-range).
- Scene metadata: status (Idea/Draft/Revising/Final), synopsis, POV field (resolved once the codex exists), per-scene revision to-dos; status dots in the tree; status filter.
- Word counts per scene/chapter/book; focus mode; the editor sheet and toolbar as designed in Workshop.
- Corkboard/board view of scene synopsis cards.
- Inbox for unplaced fragments (move into a scene or chapter).

**Done when**
- A multi-chapter book can be written, reordered, closed and reopened with all formatting, footnotes, images, comments and metadata intact.
- Block IDs of untouched paragraphs are unchanged after editing around them.
- Alignment, footnotes and images are present in the saved scene files.

**Spec:** Manuscript editor, UI design (editor parts), Edge cases (long books).

---

## M3 · Calendar and timelines
**Goal:** model story events on branching timelines with the world's own calendar.

**Needs:** M1 (M2 not required).

**Scope**
- New books get the Gregorian calendar and one empty "Main timeline" (M1 creates only Chapter 1 and one scene); create them on open when missing.
- Custom calendar in its own `calendar.json` with editor in Book settings and Gregorian preset; date entry/display/validation; flagging of dates that no longer fit after a calendar change; fallback when the file is missing or invalid.
- Multiple timelines; nodes with title, description, optional date, colour/tag; edges forming a graph with branches and merges; cycle rejection in the flow view.
- Branches: named and coloured, distinguishable by line style as well as colour.
- Canvas with pan/zoom, add/move/delete nodes, draw/remove edges, built as a reusable graph component (typed nodes and edges, keyboard operation, list-view alternative) because S4 and S5 reuse it for conversations and the story map; Flow view and Date-scaled view (undated nodes in their own lane); filters by tag and branch.
- The shared **chronological-order helper** (compare by dates, else by path along edges, else unknown) used by everything that needs "before/after".
- Node inspector panel (collapsible sections).

**Done when**
- Branch-and-merge timelines can be built, saved and reopened; a cycle is rejected with a message.
- Date-scaled view orders nodes by the book's calendar; changing the calendar flags invalid dates without altering them.
- The order helper returns before / after / unknown correctly for dated, path-connected and unrelated nodes.

**Spec:** Timeline editor, Custom calendar, Behavior details (chronological order), Edge cases (timeline, calendar).

---

## M4 · Manuscript ↔ timeline links
**Goal:** connect writing to events, with the context panel showing the connections.

**Needs:** M2, M3.

**Scope**
- "Link to event" action on headings and paragraphs with a searchable node picker; many-to-many links stored by block ID.
- Gutter markers and badges in the editor; clicking jumps to the node; the node lists its linked passages and jumps back.
- Context panel content for Write ("This paragraph", "Problems") and Timelines ("Written in").
- Broken links when a node or block disappears: shown, relinkable or removable, repaired by restoring from the trash.
- Coverage info (nodes with no passages, scenes with no links) exposed for later use by Checks.

**Done when**
- The spec's acceptance flow works end to end: link a paragraph, follow the badge to the node, follow the passage back; delete the node and see a broken link; restore it and see it repaired.

**Spec:** Manuscript editor (links), Timeline editor (passages), Behavior details (dangling links), UI design (gutter markers, context panel).

---

## M5 · Rules and Codex
**Goal:** the world's rules and the cast, places and things, all linkable.

**Needs:** M4.

**Scope**
- New books get the default rule categories (M1 creates none); create them on open when missing.
- Rules page: categorised entries (title, category, description, tags, exceptions), category management, filter and search; links to nodes, codex entries and manuscript blocks with back-links.
- Codex: user-defined entry types (starter set Character, Item, Place, Country, Town, Building; rename/recolour/delete), entries with name, image, rich-text notes, tags, **aliases**; links to nodes, rules and blocks with back-links.
- Scene POV now resolvable to a Character entry.
- Timeline editor gets the "filter by linked codex entry" (deferred from M3), and nodes can link codex entries and rules (the fields exist in the M3 node schema).
- Unlinked-mention finder (names and aliases found in text but not linked) with one-click link; optional per-entry appendix text.

**Done when**
- A rule linked to a node and a paragraph shows up on all three; a codex entry with an alias is found as an unlinked mention and linked in one click.
- Deleting a rule or entry leaves marked-broken links and goes to the trash.

**Spec:** Rules page, Codex, UI design (type tags), Edge cases (links).

---

## M6 · Relationships, groups, states, knowledge
**Goal:** the structured world data that makes continuity checkable.

**Needs:** M3, M5.

**Scope**
- Relationships between codex entries with user-named, directed types and optional reverse labels; reusable type manager; optional link to a timeline node; per-entry Relationships section; duplicate and self-relationship rejection.
- Groups (named, coloured, many-to-many) and the relationship graph view with group regions and filters.
- Place hierarchy via a "located in" relation type.
- States: dated facts with start/end positions, exclusive kinds, "final" flag, reverse views, half-open periods.
- Knowledge: items, learning and forgetting events assigned to characters and anchored to a node or date, editable from the character page, the item page and the timeline node; "As of" selector; knowledge matrix; knowledge markers on nodes; knowledge use links from blocks.
- Per-entry **Chronicle** tab merging links, states, knowledge and relationship events in order.

**Done when**
- Spec acceptance criteria for relationships, groups, states, knowledge round trip, "As of" views and Chronicle all hold.
- Overlapping exclusive states and use-before-learning situations can be *detected from data* (checks themselves come in M7).

**Spec:** Relationships and groups, States, Knowledge, Codex (Chronicle).

---

## M7 · Consistency checks
**Goal:** a Problems-style page that finds continuity mistakes without any LLM.

**Needs:** M6 (and M4 coverage data).

**Scope**
- Checks page with severities, grouping, click-through, dismissal (own schema-validated file, reappearing when the problem changes), per-check enable/disable, run on open and on demand, badge count in the sidebar.
- Every v1 check in the spec: broken links, missing/invalid files, invalid dates, date-order, duplicate names, state overlap, knowledge timing, coverage, isolated nodes, unlinked rules, codex entries with no connections, open revision to-dos.
- A common finding shape with stable IDs, so a future LLM checker can add findings to the same page.

**Done when**
- Each check produces a finding on a bad case and none on a good one, with stable IDs; dismissal behaves as specified; unknown ordering never produces a false alarm.

**Spec:** Consistency checks (no LLM).

---

## M8 · Export
**Goal:** produce DOCX and PDF of the book.

**Needs:** M2 (appendices need M5/M6).

**Scope**
- Settle the open questions *PDF/DOCX approach* (verify `pdfmake` footnote support, fall back to numbered notes or a swap) and page furniture, and record them in the spec.
- Format-neutral export model built from the manuscript, plus an exporter registry that drives the format dropdown and can offer different exporters per project kind (S2, S7).
- DOCX and PDF exporters: headings, lists, quotes, alignment, scene breaks, images, footnotes, title page, table of contents, page numbers (default on), optional running header, page size/margins/font/size/line spacing, chapter selection.
- Generated appendices (dramatis personae, glossary, chronology) from opted-in codex entries and timeline data; spoilers excluded by default.
- Margin comments and app-only annotations never exported; missing images produce a placeholder and warning.

**Done when**
- Exporting the sample content to both formats opens correctly in Word/LibreOffice and a PDF reader with exactly the selected chapters and correct formatting; export with nothing selected is blocked.

**Spec:** Export, Edge cases (export).

---

## M9 · Snapshots, history and backups
**Goal:** optional git-like history with plain-language UI, on top of always-on autosave.

**Needs:** M1 (best after M2 so there is content to track).

**Scope**
- Embedded git (libgit2) in a hidden directory in the project; no git installation needed.
- Changes panel listing added/modified/deleted items, per-item inclusion, "Snapshot all changes", labels.
- History view with per-snapshot changes, preview, diff and restore (with an automatic safety backup first).
- Automatic whole-project backups (on close and on an interval; configurable count) and their restore path.
- UI vocabulary free of git terms.

**Done when**
- The spec's snapshot acceptance criteria pass, including partial snapshots and restore; a project with the user's own git repo in the same folder is unaffected.

**Spec:** Snapshots / version history, Edge cases (snapshots).

---

## M10 · Writing aids
**Goal:** navigation, motivation and spelling.

**Needs:** M5 (search and switcher index the codex); M2.

**Scope**
- Global search across manuscript, rules, nodes, codex, knowledge; grouped results opening at the match.
- Quick switcher (Ctrl/Cmd+P) with aliases and recents.
- Stats: word counts (pages and runtime for screenplays, added by S2), words per day chart, daily goal and book target, writing sessions and streaks, optional timer.
- Spellcheck: book language dictionaries (English and Polish bundled), user-imported Hunspell/word-list dictionaries in local and global scope, per-book custom word list, missing-dictionary fallback.

**Done when**
- Search and the switcher find items by content and alias; stats reflect a day of typing; an imported dictionary stops flagging its words.

**Spec:** Search, Writing goals & stats, Spellcheck dictionaries, quick switcher.

---

## M11 · Import, onboarding, polish and release
**Goal:** make it adoptable and shippable.

**Needs:** M0–M10 and S1–S7 (so samples, tour and audit cover the script kinds).

**Scope**
- Import from Markdown and plain text (Fountain import is in S2): split into parts/chapters/scenes by headings, preview before creating.
- Bundled sample book, plus a sample screenplay and a sample game script (with a conversation and a story map), and a short dismissable tour from the welcome screen.
- Keyboard shortcut reference overlay and rebinding with conflict detection.
- Crash-safe startup (restore offer) and local diagnostics log.
- Accessibility audit: keyboard operation, screen-reader names, contrast in both themes, reduced motion; list-view alternatives for the timeline and relationship canvases, and audit of the conversation and story-map canvases.
- Performance pass on a very large book (hundreds of thousands of words).
- Packaging and installers for Linux and Windows; app data paths per OS.

**Done when**
- A real Markdown draft imports into a navigable book; the sample book opens and demonstrates every feature; the app passes the audit and installs on both platforms.

**Spec:** Import, Comfort and accessibility, App safety and recovery, Edge cases (long books).

---

## Script track (S1–S7)
Implements the [script spec](../features/script-writing.md). Each S milestone starts once its **Needs** are complete; S1 and later never block M0–M11 except where M11 lists them.

## S1 · Project kinds and screenplay editor
**Goal:** create a Screenplay project and write it with typed script elements.

**Needs:** M2, M5.

**Scope**
- New-project dialog asks for the kind (Book / Screenplay / Game script); Game script can be created but its content arrives in S3. The dialog says the kind cannot be changed later.
- Screenplay schema for scene files; element blocks (scene heading, action, character, dialogue, parenthetical, transition) with stable block IDs; Enter and Tab flow, toolbar dropdown, standard layout in the editor sheet.
- Character-cue autocomplete from codex characters and aliases; scene-heading autocomplete (INT./EXT., codex Places, time of day).
- Automatic scene numbers; title page fields in project settings; book-only features hidden (footnotes, H1–H3, TOC and chapter styles); per-kind sidebar and toolbar.
- Timeline and rule links, margin comments, status/synopsis, corkboard, snapshots and search work on script blocks unchanged.

**Done when**
- A screenplay can be written with Enter/Tab, closed and reopened with all elements and IDs intact; cues and locations autocomplete from the codex; block IDs of untouched blocks are unchanged after edits.

**Spec:** Script spec: Project / platform, Screenplay: editor, Behavior details (element rules).

---

## S2 · Screenplay export, Fountain and page count
**Goal:** get a screenplay out (and in) in industry formats.

**Needs:** S1, M8.

**Scope**
- Verify `pdfmake` for standard screenplay layout (page breaks inside dialogue, (MORE)/(CONT'D)); record the result and any fallback in the script spec.
- Screenplay PDF (Courier 12, standard margins and indents, scene and page numbers, optional title page); DOCX with script styles.
- Fountain export and import with the specified mapping and a message listing skipped constructs.
- Page count and runtime estimate in the status bar and Stats (resolve the open question first).

**Done when**
- Exported PDF and DOCX open correctly with the standard layout; exporting to Fountain and importing it back reproduces the same elements; page count matches the PDF.

**Spec:** Script spec: Export / import, Screenplay: editor (stats), Edge cases (Fountain).

---

## S3 · Game script: linear scripts and variables
**Goal:** write game dialogue as ordered lines with stable IDs.

**Needs:** S1 (project kinds), M5.

**Scope**
- Game project tree (folders holding Scripts and Conversations; Conversations are created empty here and filled in S4).
- Script item: ordered lines with speaker (codex Character link) and stable line IDs (project counter in the manifest, never reused); speakerless narration lines; "add to codex" hint for unknown speakers.
- Project-wide variable list (own schema-validated file): name, type (flag, number, text), default.
- Game sidebar and per-kind status/word counts.

**Done when**
- A script with speakers and line IDs round-trips through close and reopen; renaming a character updates the displayed speaker; deleted speaker shows as broken and is restorable.

**Spec:** Script spec: Game script: linear scripts, Behavior details (line IDs, variables).

---

## S4 · Game script: branching conversations
**Goal:** author and test branching dialogue on a graph canvas.

**Needs:** S3, M3 (graph component).

**Scope**
- Conversation item as a graph: Lines, Choice, Jump (within the conversation) and End nodes; side editor for a node's lines; keyboard operation and list view.
- Conditions on options and nodes and set-variable actions, picked from the variable list (decide the condition model: single comparison or AND/OR groups, and record it in the script spec).
- Play-through preview of one conversation (hidden vs disabled options decided and recorded; stops with a message on an undefined variable; loops allowed with reset).

**Done when**
- A conversation with choices, conditions and variable changes reopens identically; play-through follows the paths and variable changes as defined; cycles are allowed.

**Spec:** Script spec: Game script: conversations, Behavior details (conditions), Edge cases (cycles, empty conversation).

---

## S5 · Non-linear structure: cross-links, story map, routes
**Goal:** see and test how the whole game fits together.

**Needs:** S4, M3 (timeline branches for routes).

**Scope**
- Cross-links from jump nodes and choice targets to other conversations or scripts (optionally to a node), by stable ID; broken-link rule applies.
- Story map section: graph of items and free beats, arrows with unlock conditions, start boxes; own section colour token in both themes (decide: separate sidebar section or view inside Write) and context-panel sections.
- Routes defined by timeline branches; items tagged with routes.
- Play-through starting from the story map across items.

**Done when**
- A link to another conversation works, breaks on delete and is repaired by restore; the story map shows all items and conditional arrows; play-through crosses items and updates variables.

**Spec:** Script spec: Game script: non-linear structure, Edge cases (broken targets), UI / navigation.

---

## S6 · Game document
**Goal:** write down the game's design (overview, mechanics, glossary) inside the game project.

**Needs:** S5, M5.

**Scope**
- Rename the project kind label to "Game" (stored value unchanged); manifest v18 with migration.
- Game-only "Game document" sidebar section with own colour token and context-panel sections; tabs Overview, Mechanics, Glossary.
- Overview rich-text page with starter headings; Mechanics (title, summary, category, status, tags, description, parameters, links to variables, items, codex entries, other mechanics) with categories, filters and reverse links; Glossary.
- Shared tools (snapshots, trash, search, autosave, stats) cover the new files.

**Done when**
- A mechanic with all fields and links round-trips through close and reopen; links break on delete and repair on restore; v17 projects migrate; search finds document text.

**Spec:** [Game document spec](../features/game-document.md).

---

## S7 · Script checks and game export
**Goal:** catch logic mistakes in game scripts and hand the data to an engine.

**Needs:** S6, M7, M8.

**Scope**
- Checks (same finding shape, stable IDs, per-check on/off): dead end, unreachable node or item, choice with no target, undefined variable, item tagged with an unreachable route, broken speaker.
- Game JSON export (lines with IDs and speakers, conversation nodes and edges with conditions and sets, variables, story map, routes, game document) and CSV (one row per line).
- Game-document checks (broken mechanic links, Implemented mechanic with no links, variable used by nothing) and a readable PDF/DOCX/Markdown export of the game document.

**Done when**
- Each check gives a finding on a bad case and none on a good one with stable IDs; exported JSON and CSV contain every line with its ID and speaker and can be re-read to the same graph.

**Spec:** Script spec: Consistency checks, Export / import; Game document spec: Handed to S7.

---

## Order at a glance
`M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7`, with `M8` after M2 (appendices after M6), `M9` after M2, `M10` after M5, and `M11` last. M2 and M3 are independent of each other once M1 exists.

**Script track:** `S1` after M2 and M5 → `S2` after S1 and M8; `S3` after S1 → `S4` after S3 and M3 → `S5` → `S6` after S5 and M5 → `S7` after S6, M7 and M8. S-milestones can interleave with M6–M10 as their Needs allow; M11 waits for all of them.

## After v1 (not part of these milestones)
Optional local LLM consistency checking via Ollama (read-only, reuses the Checks finding shape); research library; map view; DOCX import including editor feedback; narrative-order vs story-order chart; EPUB and other export formats via the exporter registry.

## Spec coverage check
Every "Changes" section of the spec belongs to a milestone: Project/platform → M0, M1; Manuscript editor → M2, M4; Timeline editor and Custom calendar → M3, M4; Rules page and Codex → M5; Relationships, States, Knowledge → M6; Consistency checks → M7; Export → M8; Snapshots → M9; Search, Writing goals and stats, Spellcheck dictionaries → M10; App safety and recovery → M1 (lock, external changes), M11 (crash recovery, log); UI design → M0 (shell), M2/M4/M5 (content); Comfort and accessibility → M0 (themes, zoom), M11 (audit, shortcuts); Import → M11. Script spec: project kind → M1 (field) and S1; screenplay editor → S1; screenplay export, Fountain, page count → S2; game linear scripts and variables → S3; conversations → S4; non-linear structure → S5; script checks and game export → S7; game document → S6 (see the game document spec); samples and audit → M11.
