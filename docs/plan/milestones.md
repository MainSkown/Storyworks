# BookWriter: milestones

From an empty repository to the complete v1 described in [docs/features/book-writer-app.md](../features/book-writer-app.md) (the **spec**). The spec says *what* the app does; this file says *what has to exist, in what order*, so a planning agent can take one milestone and write its implementation plan. It deliberately does not say how to split work or who does it.

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
- Project folder layout and `project.json` manifest (format version, metadata, goals, dictionary selection, index of all items with relative paths and order).
- Schemas for the manifest and every item file type that exists so far; read/write layer with atomic writes; a migration mechanism (version N→N+1) with backup before migrating; newer-version projects open read-only.
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

**Spec:** Project / platform (project, manifest, autosave), App safety and recovery (lock, external changes), Behavior details, Edge cases (project files).

---

## M2 · Manuscript editor
**Goal:** write a whole book: structured outline, full formatting, notes, and scene metadata.

**Needs:** M1.

**Scope**
- Outline tree of parts, chapters and scenes: create, rename, delete (to trash), drag to reorder and re-nest; order lives in the manifest.
- Rich-text editor with H1–H3, bold/italic/underline, lists, quotes, text alignment (left, centre, right, justified), scene-break divider, footnotes, images (copied to the project's assets), per-scene loading for long books.
- Stable block IDs that survive edits, splits and moves.
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
- Custom calendar in its own `calendar.json` with editor in Book settings and Gregorian preset; date entry/display/validation; flagging of dates that no longer fit after a calendar change; fallback when the file is missing or invalid.
- Multiple timelines; nodes with title, description, optional date, colour/tag; edges forming a graph with branches and merges; cycle rejection in the flow view.
- Branches: named and coloured, distinguishable by line style as well as colour.
- Canvas with pan/zoom, add/move/delete nodes, draw/remove edges; Flow view and Date-scaled view (undated nodes in their own lane); filters by tag and branch.
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
- Rules page: categorised entries (title, category, description, tags, exceptions), category management, filter and search; links to nodes, codex entries and manuscript blocks with back-links.
- Codex: user-defined entry types (starter set Character, Item, Place, Country, Town, Building; rename/recolour/delete), entries with name, image, rich-text notes, tags, **aliases**; links to nodes, rules and blocks with back-links.
- Scene POV now resolvable to a Character entry.
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
- Format-neutral export model built from the manuscript, plus an exporter registry that drives the format dropdown.
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
- Stats: word counts, words per day chart, daily goal and book target, writing sessions and streaks, optional timer.
- Spellcheck: book language dictionaries (English and Polish bundled), user-imported Hunspell/word-list dictionaries in local and global scope, per-book custom word list, missing-dictionary fallback.

**Done when**
- Search and the switcher find items by content and alias; stats reflect a day of typing; an imported dictionary stops flagging its words.

**Spec:** Search, Writing goals & stats, Spellcheck dictionaries, quick switcher.

---

## M11 · Import, onboarding, polish and release
**Goal:** make it adoptable and shippable.

**Needs:** M0–M10.

**Scope**
- Import from Markdown and plain text: split into parts/chapters/scenes by headings, preview before creating.
- Bundled sample book and a short dismissable tour from the welcome screen.
- Keyboard shortcut reference overlay and rebinding with conflict detection.
- Crash-safe startup (restore offer) and local diagnostics log.
- Accessibility audit: keyboard operation, screen-reader names, contrast in both themes, reduced motion; list-view alternatives for the timeline and relationship canvases.
- Performance pass on a very large book (hundreds of thousands of words).
- Packaging and installers for Linux and Windows; app data paths per OS.

**Done when**
- A real Markdown draft imports into a navigable book; the sample book opens and demonstrates every feature; the app passes the audit and installs on both platforms.

**Spec:** Import, Comfort and accessibility, App safety and recovery, Edge cases (long books).

---

## Order at a glance
`M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7`, with `M8` after M2 (appendices after M6), `M9` after M2, `M10` after M5, and `M11` last. M2 and M3 are independent of each other once M1 exists.

## After v1 (not part of these milestones)
Optional local LLM consistency checking via Ollama (read-only, reuses the Checks finding shape); research library; map view; DOCX import including editor feedback; narrative-order vs story-order chart; EPUB and other export formats via the exporter registry.

## Spec coverage check
Every "Changes" section of the spec belongs to a milestone: Project/platform → M0, M1; Manuscript editor → M2, M4; Timeline editor and Custom calendar → M3, M4; Rules page and Codex → M5; Relationships, States, Knowledge → M6; Consistency checks → M7; Export → M8; Snapshots → M9; Search, Writing goals and stats, Spellcheck dictionaries → M10; App safety and recovery → M1 (lock, external changes), M11 (crash recovery, log); UI design → M0 (shell), M2/M4/M5 (content); Comfort and accessibility → M0 (themes, zoom), M11 (audit, shortcuts); Import → M11.
