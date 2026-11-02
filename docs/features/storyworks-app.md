# Storyworks: desktop app for writing books and scripts

## Summary
A greenfield desktop application for planning and writing a book. It combines a rich-text manuscript editor, branching timelines whose nodes can be linked to specific headings and paragraphs, a structured "rules of the world" page, a codex of characters/places/items, and PDF/DOCX export. Each book is a portable project on disk. The repo is currently empty, so this spec also defines the stack and project shape.

## Goals
- Write a long manuscript organised as parts, chapters and scenes, with comfortable rich-text editing.
- Model story events on one or more timelines that can split and merge, and tie any heading or paragraph to the timeline nodes it depicts.
- Record the fictional world's rules in a structured, linkable, searchable form.
- Keep worldbuilding (rules, codex, timeline) cross-linked with the text.
- Export a polished PDF or DOCX of the whole book or selected chapters.
- Work offline with all data in files the user owns (backup-able, git-friendly).

## Non-goals
- Cloud sync, accounts, real-time collaboration.
- Export formats other than PDF and DOCX in v1 (no EPUB, Markdown, etc.), though the export architecture must make adding formats easy.
- Mobile or web builds.
- AI writing assistance (no AI that writes or rewrites text, ever).
- LLM-based consistency checking (planned after v1: optional, local via Ollama, checking a selected scene/block/node against its linked rules, codex entries, relationships and neighbouring timeline nodes; read-only, findings shown in the same Checks panel). Not built in v1, but the Checks panel and finding format below must not need changes to accept it.
- Inline text-range links to timeline nodes (links are per block: heading or paragraph).
- Planned after v1: narrative-order vs story-order chart, research library (attached PDFs/clips/notes), map view for places, DOCX manuscript import, DOCX import of editor feedback (tracked changes and comments).

## Changes

### Project / platform
- [x] Scaffold a Tauri desktop app with Vue 3 (Composition API) + TypeScript + Vite, using Quasar (without the Quasar CLI) as the component library (use it consistently; styled with the "Workshop" design tokens, see UI design). Drag-to-reorder in the chapter tree may need an additional small drag-and-drop library; Quasar's QTree has no drag-and-drop, so M2 adds a small drag-and-drop library.
- [x] Add vue-i18n for UI localisation; ship English and Polish locale files; language switchable in app settings.
- [x] Welcome screen: New book, Open book, list of recent books.
- [x] A book is one project **folder** on disk (human-readable, pretty-printed JSON files with stable key ordering, plus an `assets/` subfolder for images), with settings: title, author, book language. Layout suggestion: one file per scene/chapter, one file per timeline, rules, codex entries and relationships. This keeps diffs small and the folder git-friendly.
- [x] The folder root contains a `project.json` manifest, like an IDE project file. It is the entry point: "Open book" opens the folder via this file. It contains: format version, book metadata and settings (title, author, language, selected dictionaries, goals), and an index of everything in the project with relative paths: the manuscript tree (parts → chapters → scenes, with their order and nesting and the file for each), the calendar file, timelines, rules and rule categories, codex entry types and entries, relationship types, relationships and groups, state kinds, knowledge items, the inbox, the ignored-findings file, the snapshot history directory, the project-local dictionaries directory, and the assets folder.
- [x] The manifest is the source of truth for structure and order (reordering scenes only edits `project.json`, not the scene files). The app keeps it in sync whenever items are created, renamed, moved or deleted, writing it atomically (temp file + rename).
- [x] Autosave of all changes to disk; unsaved-state indicator not needed beyond a "saved" status.
- [ ] Every JSON file type has a Zod schema: `project.json`, `calendar.json`, scene, timeline, rule, codex entry and type, relationship, relation type, group. TypeScript types are inferred from the schemas. Every read goes through its schema; every write validates first.
- [x] Scene files are validated as a wrapper only (block IDs, links, comments, metadata); the ProseMirror content tree itself is validated by TipTap's own schema.
- [x] `project.json` carries a format version. Schema changes ship as migrations (version N → N+1), applied on open; before migrating, the app creates a backup of the project. A project with a newer version than the app supports opens read-only with a warning.
- [x] Invalid files produce an error naming the file and the failing field; the app never overwrites or "repairs" an invalid file automatically.
- [ ] Top-level navigation between: Manuscript, Timelines, Rules, Codex, Checks, Stats, Search, Export, Book settings.

### Manuscript editor
- [ ] Sidebar tree of parts, chapters and scenes; create, rename, delete, drag to reorder and re-nest. Each node is its own document; selecting it opens it in the editor.
- [ ] Rich-text editor (TipTap/ProseMirror) supporting: headings H1–H3, bold, italic, underline, bullet and numbered lists, block quotes, scene-break divider, footnotes, images.
- [ ] Per-block text alignment (left, center, right, justified) for paragraphs, headings and quotes, via toolbar buttons and shortcuts; default left. Alignment is stored in the scene file and honoured in PDF/DOCX export.
- [ ] Scene files store the editor content as ProseMirror/TipTap JSON, with a stable ID on every block (see Behavior details).
- [ ] Images: insert from disk, copied into the project's assets folder, referenced relatively.
- [ ] Margin comments/notes attached to a selection; shown in the margin; private, excluded from export; can be resolved/deleted.
- [ ] Per-block "Link to timeline node" action (toolbar button and context menu) on headings and paragraphs, opening a node picker (searchable, grouped by timeline).
- [ ] Linked blocks show a margin badge (count of linked nodes). Clicking it lists the linked nodes and jumps to the chosen one in the timeline.
- [ ] Focus / distraction-free mode: hides sidebars and chrome, toggled by a shortcut.
- [ ] Spellcheck using the book's language dictionary (see Spellcheck dictionaries).
- [ ] Per-chapter and total word count shown in the editor status bar.
- [ ] Scene metadata: status (Idea, Draft, Revising, Final; default Draft), one-line synopsis, optional POV (a Character codex entry). Edited in a scene properties panel; shown on tree rows as a status colour dot, with the synopsis as tooltip.
- [ ] Tree filter by status and POV.
- [ ] Corkboard view (toggle next to the tree): cards for scenes in tree order grouped by chapter, each showing title, synopsis, status colour, POV and word count; click opens the scene; drag reorders within and between chapters exactly like the tree.
- [ ] Per-scene revision to-dos: a short checklist (text + done checkbox) in the scene properties panel; open items appear in the Checks page as info findings (see Consistency checks).
- [ ] Inbox: an "Inbox" area at the bottom of the manuscript sidebar for loose notes and unplaced ideas (rich text, optional title). It is never exported. Actions per note: "Move to scene" (append to the end of a chosen scene, or create a new scene from it) and delete (to trash).
- [ ] Blocks can be linked to a knowledge item together with the character who uses or mentions it (same link action as timeline links; see Knowledge).

### Timeline editor
- [ ] A book can have multiple timelines (create, rename, delete).
- [ ] A timeline is a graph of nodes and edges: a node may have several outgoing edges (branch) and several incoming edges (merge). Cycles are not allowed in the flow view (time moves forward); validate on connect.
- [ ] Node fields: title, rich-text description, optional in-world date (see Custom calendar), colour/tag, optional list of linked codex entries and linked rules.
- [ ] Node shows its linked manuscript passages; clicking one jumps to the block in the editor.
- [ ] Add, edit, delete, move nodes and draw/remove edges on a pannable, zoomable canvas.
- [ ] View toggle: **Flow view** (nodes laid out by graph structure, dates optional) and **Date-scaled view** (nodes positioned along a time axis by in-world date; nodes without a date are listed separately or pinned to the last known position).
- [ ] Branches can be named and coloured (e.g. "Alt history", "Hero B POV").
- [ ] Filters: by tag, by branch, by linked codex entry.

### Custom calendar
- [ ] The world's calendar is defined in its own file, `calendar.json`, in the project folder and referenced from `project.json` (not stored inside the manifest). It holds named months with day counts, days/weeks per year, era names, optional epoch label. Edited through a calendar editor in Book settings. Provide a "Gregorian" preset.
- [ ] Dates on nodes are entered and displayed through this calendar; date comparison/sorting uses it.
- [ ] Changing the calendar re-validates existing node dates and flags ones that no longer fit.

### Rules page
- [ ] Rules view listing categorised rule entries, filterable by category and tag, searchable.
- [ ] Rule fields: title, category (user-defined; defaults such as Magic, Physics, Society, Technology, Religion), rich-text description, tags, exceptions/limitations (rich text).
- [ ] Rules can be linked to timeline nodes, codex entries and manuscript blocks. The rule shows its links; linked nodes/blocks show the rule.
- [ ] Manage categories (add, rename, delete with reassignment).

### Codex (characters, places, items and custom types)
- [ ] Entry types are user-defined. Starter types are provided and all of them can be renamed, recoloured, given an icon, or deleted (with reassignment of their entries): Character, Item, Place, Country, Town, Building. A "Codex types" manager lets the user add new types (e.g. Faction, Creature, Artifact).
- [ ] Entry fields: name, type, image (optional), rich-text notes, tags.
- [ ] Entries can be linked to timeline nodes, rules and manuscript blocks, with back-links displayed on each side.
- [ ] Aliases: each entry has a list of alternative names (nicknames, titles, inflected forms). Aliases are matched by global search and by the duplicate-name check (a name or alias that collides with another entry's name or alias of the same type).
- [ ] Unlinked mentions: each entry has a "Mentions" tab listing manuscript blocks whose text contains its name or an alias (whole word, case-insensitive) but that are not linked to it. Each row shows scene, snippet with the match highlighted, and actions "Link" (adds the link), "Not this one" (hides this mention; stored in the ignored-findings file) and a bulk "Link all". No stemming in v1: Polish or other inflected forms match only if added as aliases.
- [ ] Chronicle tab per entry: a chronological list merging the entry's linked timeline nodes (with in-world date), its states, its knowledge events and the relationships linked to nodes. Items whose order cannot be determined are listed afterwards in timeline order. A separate "Appears in" list shows linked manuscript blocks in reading order. Click any row to open the item.
- [ ] Appendix fields: optional short "Appendix text" and an "Include in appendices" checkbox (default off, to avoid spoilers); used only by the export appendices.

### Relationships and groups
- [ ] Relationships between any two codex entries of any type (character–character, character–place, town–country, item–character, ...). A relationship has: from-entry, to-entry, a relation type, and an optional rich-text note.
- [ ] Relation types are user-defined free names (e.g. "friend", "father", "the object of pure hatred", "located in"). Types are created on the fly while adding a relationship and are stored in a reusable list; they can be renamed, recoloured and deleted (with reassignment) in a "Relation types" manager. Starter types (e.g. Friend, Enemy, Parent, Sibling, Lover, Located in, Owns) are provided and can be removed. Types are not restricted by entry type.
- [ ] Relationships are directed ("A is father of B"). A relation type may optionally define a reverse label (e.g. "father" ↔ "child", "located in" ↔ "contains") so the other entry's page shows "B is child of A"; if none is set, the same label is shown on both sides.
- [ ] Each codex entry shows a Relationships section listing incoming and outgoing relationships, with add/edit/remove.
- [ ] Groups: user-named, coloured groups of codex entries (e.g. a family, a faction, a kingdom). An entry can belong to several groups. Groups are managed in a "Groups" manager and shown on each entry. Groups are lightweight objects (not codex entries themselves) and are independent of relationships.
- [ ] A relationship graph view: entries as nodes, relationships as labelled, coloured edges; groups drawn as coloured regions around their members; pan/zoom; filter by relation type, entry type and group; click an entry to open it.
- [ ] A relationship can optionally be linked to a timeline node (e.g. "became enemies at this event"), shown as a back-link on the node.

### States (dated facts about entries)
- [ ] An entry can have states: facts that hold for a period, e.g. location, owner, alive/dead, title. A state has: kind, value, "from" and optional "until" (each is a timeline node or a calendar date), and an optional "final" flag (the entry no longer appears in the story after this, e.g. death).
- [ ] State kinds are user-defined (manager like relation types). A kind has a name, a value type (free text or reference to a codex entry) and an "exclusive" flag (the entry can have only one value of this kind at a time). Starter kinds: Location (entry, exclusive), Owner (entry, exclusive), Status (text, exclusive), Title (text, not exclusive).
- [ ] When a state's value is a codex entry, that entry shows the reverse view (e.g. a Town lists who is there and from when; a Person lists the items they own).
- [ ] Periods are half-open: "from X until X" is empty, and a state ending at X does not overlap one starting at X.

### Knowledge (who knows what, and since when)
- [ ] Knowledge items: a secret, fact or piece of information. Fields: title, rich-text description, tags, optional reference to a rule or codex entry it is about. Managed in a "Knowledge" area of the Codex.
- [ ] Learning events: "entry E learns item K at position P", where P is a timeline node or a calendar date (required), with an optional note and an optional "forgotten/lost at" position (e.g. memory loss) and an optional "revealed in" manuscript block.
- [ ] Entry page "Knowledge" section: what the entry knows, in chronological order, with the learning position. An "As of" selector (pick a timeline node or date) shows for that moment what the entry knows and what it does not know yet.
- [ ] Knowledge item page: who knows it and since when; "As of" selector shows who knows it at that moment.
- [ ] Knowledge matrix view: rows = entries, columns = knowledge items, cells show the learning position; with "As of" selector to grey out what is not yet known.
- [ ] Knowledge use links: a manuscript block can be linked to a (knowledge item, entry) pair, meaning "this passage has this character use or mention this knowledge". Used by the knowledge check.
- [ ] Knowledge belongs to characters: a learning event is assigned to a Character entry and anchored to a timeline node or date. It can be created from three places, all editing the same data: the character's Knowledge section ("+ Learns…"), the knowledge item page ("+ Who learns it"), and the timeline node inspector ("Who learns what here": "+ Character learns…" picks a character and an item). Learning at a node makes the node list it; the character page shows the node as the learning position and jumps to it.
- [ ] Timeline nodes show a small knowledge marker (count of learning/forgetting events at that node); the knowledge marker is hidden in the node when there are none.

### Writing goals & stats
- [ ] Stats page: word count per scene/chapter/part and total; chart of words written per day.
- [ ] Daily word-count goal and optional book target; progress shown on the stats page and in the editor status bar.
- [ ] Writing sessions: a session starts at the first edit and ends after 10 minutes idle or on closing the book; it records start, end and net words added. Stats page shows session history, current streak and longest streak (consecutive days meeting the daily goal, or with at least one word written if no goal is set).
- [ ] Optional session timer started manually from the status bar.
- [ ] Daily word counts and sessions are stored in their own JSON file (`stats.json`, schema-validated, listed in `project.json`).

### Snapshots / version history
- [ ] Autosave is the base: every change is always written to the working files; the user never has to save or snapshot to keep work.
- [ ] Snapshots work like git commits and are entirely optional. A "Changes" panel lists every item changed since the last snapshot (scenes, chapters, timelines, rules, codex entries, calendar, etc.) as added / modified / deleted / moved.
- [ ] Staging is optional: each changed item has a checkbox so the user can choose which changes go into the snapshot; one-click "Snapshot all changes" skips staging. Staging granularity in v1 is per item (e.g. a whole scene), not per paragraph.
- [ ] Creating a snapshot takes an optional message (default: timestamp). Snapshots record the full state of the project, so any snapshot can be inspected as a whole.
- [ ] History view: list of snapshots (message, time, number of changed items); open one to see its changed items; view an item's content as of that snapshot; text diff against the current version or the previous snapshot.
- [ ] Restore: restore a single item, or the whole project, to a snapshot state. Restoring first creates an automatic safety backup of the current state and asks for confirmation.
- [ ] Snapshots are implemented with real git, embedded in the app via libgit2 (Rust `git2` crate, bundled/vendored so users do not need git installed, on Linux and Windows alike). The git directory is hidden inside the project folder (e.g. `.storyworks/history.git`, listed in `project.json` as one entry) with the project folder as the work tree, so it travels with the book and does not collide with a git repository the user may keep in the same folder. Autosaved working files are never committed automatically; only the user's snapshots create commits.
- [ ] The snapshot UI must not use git jargon. Wording: "Snapshot" (not commit), "Changes" (not staging area), "Include in snapshot" checkbox (not stage), "History", "Restore this version". No branches, remotes, merges or hashes shown in v1. Each snapshot shows its message, date and the list of changed items in plain words (e.g. "Chapter 3 – Scene 2: edited").
- [ ] Automatic backups of the whole project at a configurable interval (default: on close and every 30 minutes while editing), keeping a configurable number of recent backups (default 20).
- [ ] Trash for deleted scenes/chapters/entries, restorable.

### Consistency checks (no LLM)
- [ ] A "Checks" page, like an IDE Problems panel: list of findings with severity (error / warning / info), a short message, and the location(s) involved; clicking a finding opens the item (scene block, timeline node, rule, codex entry). A badge on the Checks nav item shows the count of errors and warnings.
- [ ] Checks run on demand ("Run checks" button) and automatically when a book is opened; they are plain deterministic code over the loaded project data, fast enough to run on every open.
- [ ] Finding shape (shared by all current and future checkers, including a later LLM one): stable id (check id + involved item ids), severity, check id, message, list of locations. The stable id is what lets a finding be dismissed.
- [ ] Each finding can be dismissed ("Ignore"); ignored findings are hidden by default (toggle "Show ignored") and stored in their own JSON file, listed in `project.json`, with a Zod schema. If the underlying problem changes, the finding gets a new id and reappears.
- [ ] Each check can be switched on or off in Book settings.
- [ ] v1 checks:
  - **Error** – broken link: a link from a block, node, rule, codex entry or relationship points to a missing or trashed item.
  - **Error** – missing or schema-invalid file listed in `project.json`.
  - **Error** – invalid node date: a date that does not exist in the book's calendar.
  - **Warning** – timeline date order: a node dated earlier than a predecessor it follows along an edge (compared with the book's calendar). Undated nodes are skipped.
  - **Warning** – duplicate codex entry name within the same type.
  - **Info** – isolated timeline node: a node with no edges in a timeline that has more than one node.
  - **Info** – unlinked rule: a rule not linked to any node, entry or block.
  - **Info** – codex entry with no relationships, groups or links.
  - **Info** – coverage: a timeline node with no linked manuscript block.
  - **Info** – coverage: a scene (with text) none of whose blocks is linked to any timeline node.
  - **Info** – open revision to-do in a scene.
  - **Warning** – overlapping states: an entry has two overlapping periods of the same exclusive kind (e.g. an item owned by two people at once, a character in two places at the same time).
  - **Warning** – appearance after final state: a block linked to an entry and to a timeline position after the start of that entry's final state.
  - **Warning** – knowledge used too early (or too late): a knowledge use link whose block's timeline position is before the entry learns the item, or after it forgets it.

### Search
- [ ] Global search (shortcut Ctrl/Cmd+Shift+F) across manuscript text, rules, timeline nodes and codex entries; results grouped by area, click to open at the match.
- [ ] Quick switcher (Ctrl/Cmd+P): a palette to jump to any scene, chapter, codex entry, rule, knowledge item, timeline or node by typing part of its name (aliases included); recently opened items first.

### Export (PDF / DOCX)
- [ ] Export dialog with format choice (PDF or DOCX).
- [ ] Chapter selection: whole book (default) or a checked subset of the tree.
- [ ] Title page (title, author) and generated table of contents (toggle each).
- [ ] Page setup: page size (A4, A5, Letter), margins, font family, font size, line spacing.
- [ ] Optional page furniture, each a toggle in the export dialog: page numbers (default on) and a running header (default off; the user picks its text: book title or chapter title). The user chooses whether to include them.
- [ ] Text alignment (left, center, right, justified) set in the editor is carried into the export.
- [ ] Optional appendices, each a toggle in the export dialog, added after the manuscript: **Dramatis personae** (entries of chosen types, default Character, that have "Include in appendices" on: name, aliases, appendix text, first appearance = first exported scene linked to the entry); **Glossary** (same rule, other chosen types, e.g. Item, Place); **Chronology** (table of one chosen timeline's nodes sorted by in-world date: date and title). Only the appendix text is exported, never the private notes.
- [ ] Exported content maps: H1–H3 to headings, lists, quotes, scene breaks, images, and footnotes (native footnotes in DOCX; in PDF native footnotes if the chosen PDF library supports them, otherwise numbered notes at the end of each chapter).
- [ ] Export pipeline is pluggable: scenes (ProseMirror JSON) are first converted into one format-neutral export document model (chapters, blocks, inline styles, alignment, footnotes, images, plus the page-setup options). Each output format is a separate exporter module that consumes this model and is registered in an exporter registry; the export dialog's format dropdown is built from the registry. v1 registers two exporters: DOCX and PDF. Adding a format later means adding one exporter module and nothing else.
- [ ] Export runs in the frontend (TypeScript): DOCX via the `docx` library; PDF via `pdfmake` (supports page numbers, headers, TOC, alignment incl. justified, images). Output bytes are written to the chosen path through Tauri's file API.
- [ ] Margin comments, timeline/rule badges and other app-only annotations are never exported.
- [ ] Save-as dialog for the output path; success/failure message with "open folder" action.

### App safety and recovery
- [x] Single-writer lock: opening a book writes a lock file (`.storyworks/project.lock`: machine name, process id, timestamp), refreshed every 30 seconds and removed on close. Opening a book whose lock is fresh (under 2 minutes old, or its process is alive on this machine) shows "This book is open elsewhere" with options "Open read-only" and "Cancel". A stale lock is taken over silently with a note.
- [x] External-change detection: while a book is open, watch the project folder. If an open item's file changes on disk (cloud sync, git pull, hand edit): with no unsaved in-app edits, reload it silently; with unsaved edits, ask "Reload from disk" or "Keep my version". App's own writes are ignored (compare content hash). If `project.json` changes externally, offer to reload the book structure.
- [ ] Crash-safe startup: the app writes a "running" marker in its data directory and removes it on clean exit. If the marker is found at startup, show "The app closed unexpectedly", offer to reopen the last book, verify its files against their schemas, and offer the latest automatic backup if any file is invalid.
- [ ] Local diagnostics log: rolling log files in the app data directory (last 5 files, up to 1 MB each) recording errors and key events (no manuscript text). Help menu: "Open log folder". Nothing is ever sent anywhere.

### UI design (direction "C · Workshop", chosen by the user)
Reference mockups: the Artifact "BookWriter UI Directions" (boards "C · Workshop", plus the dark variant). Layout and look:
- [ ] Left sidebar (about 232 px): book title and word count, then the section list: Write, Timelines, Rules, Codex, Checks (with a badge showing the error and warning count), and Stats / History / Settings at the bottom. Each section has its own colour and icon square: Write blue, Timelines orange, Rules green, Codex plum, Checks brick red. The active section expands in place below its row: Write shows the parts/chapters/scenes tree, Timelines shows the list of timelines and the calendar.
- [ ] A coloured header band at the top of the main area shows the current section's colour, the section name and the open item (e.g. "Write · Dawn at the quay"), with the item's actions (status, Focus, Snapshot) on the right.
- [ ] Formatting toolbar under the header in Write: paragraph style, B/I/U, alignment, quote, scene break, footnote, and "Link to event" (accent button).
- [ ] The editor page is a centred sheet (about 600 px) on a warm grey background. Paragraphs linked to something show a small coloured marker in the left gutter (orange = timeline event, green = rule, brick red = broken link).
- [ ] The right context panel (about 280 px) shows what the current selection is connected to, as cards with a coloured type tag matching the section colours (Event orange, Rule green, Character plum, Scene blue, Problem brick red). In Timelines it shows the selected event instead.
- [ ] **Every section of the context panel is collapsible**: "This paragraph", "In this scene", "Problems" in Write, and "Selected event", "Written in", "Who learns what here", "Linked" in Timelines. Each section header is a button with a chevron and a count; click or Enter/Space toggles it. The collapsed/expanded state is remembered per section in app settings. The whole panel can also be hidden (shortcut Ctrl/Cmd+Alt+P) and the editor sheet stays centred.
- [ ] Status bar in Write: word count, today's goal progress, saved status, changes since the last snapshot.
- [ ] Section colours are design tokens defined for both themes; type tags and markers never rely on colour alone (each carries a text label or distinct shape).
- [ ] Timeline branches are told apart by label and line style (solid vs dashed) as well as colour.

### Comfort and accessibility
- [ ] Themes: Light, Dark, Follow system (default), implemented as design tokens, with the Workshop look in both: warm light greys with the section colours, and a dark variant using darker warm-grey surfaces and lightened section colours that keep WCAG AA contrast. The theme switches immediately for everything, including the editor sheet and the timeline and relationship canvases. Separate settings for UI zoom (80–150%) and editor font size.
- [ ] Keyboard shortcut reference overlay (Ctrl/Cmd+/) listing all shortcuts; shortcuts can be rebound in settings with conflict detection and "Restore defaults".
- [ ] App-level settings (language, theme, zoom, editor font size, shortcuts) are stored in one JSON file in the app data directory, not in the book.
- [ ] Sample book: bundled in English and Polish; the welcome screen offers "Open sample book", which copies it to a folder the user picks (the bundle itself stays read-only). It contains a short story with a branching timeline, a few rules, codex entries with relationships, links, and one deliberate date-order warning so the Checks page shows something.
- [ ] First-run tour: short dismissable steps (manuscript, timelines and linking, rules, codex, checks); can be re-run from the Help menu.
- [ ] Accessibility baseline: all UI operable by keyboard (tree, editor toolbar, dialogs, menus); labels for icon-only buttons and screen-reader names for controls; visible focus ring; WCAG AA contrast in light and dark themes; honour the OS reduced-motion setting.
- [ ] Canvases (timelines, relationship graph) are keyboard-operable (Tab/arrows to move between nodes, Enter to open, shortcuts to add and connect nodes) and each has an equivalent list view (nodes with their connections; relationships as a table) usable with a screen reader.

### Import (Markdown / plain text)
- [ ] File > Import accepts one or more `.md` or `.txt` files. A preview dialog shows the resulting tree (chapters and scenes with word counts) before anything is created; the user can rename items and untick ones to skip.
- [ ] Split rules (selectable): Markdown H1 = chapter and H2 = scene (default); H1 only; or a scene-break line (`***`, `---`, `* * *`) = new scene. Plain text: each file is one chapter; scenes split at blank-line-separated scene-break lines.
- [ ] Markdown mapping: headings (deeper than H3 clamp to H3), bold, italic, lists, quotes, scene breaks, images (local files copied into `assets/`; missing ones skipped with a warning), footnotes (`[^1]`) to footnotes.
- [ ] Imported items are appended to the end of the manuscript tree (or after the selected item). An automatic backup is made before the import.

### Spellcheck dictionaries
- [ ] Book language setting drives which spellcheck dictionary is used.
- [ ] Dictionaries live in their own directories, not in `project.json`. Two scopes: **local** (a `dictionaries/` directory inside the project folder, travels with the book) and **global** (a `dictionaries/` directory in the OS-standard per-user application data directory, shared by all books on this machine). The path is resolved through Tauri's path API (app data dir): Linux `~/.local/share/<app-id>/dictionaries/`, Windows `%APPDATA%\<app-id>\dictionaries\`, macOS `~/Library/Application Support/<app-id>/dictionaries/`. The bundled English and Polish dictionaries ship as read-only app resources and are listed alongside the user's global ones.
- [ ] Users can add their own dictionaries (import a Hunspell `.dic` + `.aff` pair, or a plain word list). The import dialog asks for scope (local or global); a dictionary can later be moved or copied between scopes.
- [ ] `project.json` stores only which dictionaries the book uses (name + scope), not their contents. If a local and a global dictionary share a name, the local one wins.
- [ ] A per-book custom word list ("Add to dictionary") for character names, invented terms, etc., stored as a file in the project's local `dictionaries/` directory.

## Behavior details
- **Linking is per block**: a heading or paragraph can link to many nodes; a node can link to many blocks. Links are stored by stable block IDs, which must survive text edits, splits and moves between scenes where feasible.
- **Dangling links**: when a node, rule or codex entry is deleted, existing links are *not* removed; they remain and are shown as "broken" (e.g. strikethrough/warning badge saying "missing node") so the user can relink or remove them. Deleted items still go to the trash and can be restored, which un-breaks the links.
- **Timeline default view**: Flow view; remembers the last-used view per timeline.
- **Autosave**: write on a short debounce after edits; never leave a half-written file (write to temp and rename).
- **Defaults**: UI language follows system language if English or Polish, else English. New book starts with one part-less "Chapter 1" containing one scene, one empty timeline "Main timeline", the Gregorian calendar and default rule categories.
- **Margin comments** appear in the editor margin; they are text-range annotations (unlike timeline links, which are per block).
- **Chronological order** is computed by one shared helper used by the date-order check, states, knowledge, the chronicle and the "As of" selectors. `before(a, b)` for two positions (each a timeline node or a calendar date): both dated → compare in the book's calendar; otherwise, on the same timeline, `a` is before `b` if an edge path leads from `a` to `b`; otherwise the order is unknown. Checks silently skip comparisons whose order is unknown; they never guess.
- **Knowledge and states vs deletion**: links from knowledge, states and learnings to deleted nodes/entries follow the broken-link rule like all other links.

## Edge cases
- `project.json` references a file that does not exist → open the book anyway, mark the item as "missing file" in the UI, and list all missing files in a warning; never delete the reference automatically.
- Files exist in the project folder but are not listed in `project.json` (e.g. added by hand or by a git merge) → offer to import them into the project or ignore them; never delete them.
- `project.json` has a merge conflict or invalid JSON → refuse to open, show the parse error and offer the latest backup.
- Open a corrupted project file → show an error naming the problem; never overwrite it; offer to open the latest backup.
- Open a project with a newer format version than the app supports → open read-only with a warning to update the app.
- One item file (scene, timeline, rule, ...) fails schema validation → the book still opens; that item is marked "invalid file" with the field-level error; other items work normally; the file is left untouched.
- Migration fails halfway → project is left as it was before (backup restored automatically) and an error is shown.
- Deleting a scene that contains linked blocks → confirm; links from nodes to those blocks become broken (deleted scene is in trash).
- Drawing an edge that would create a cycle in Flow view → rejected with a message.
- Node with no date in Date-scaled view → listed in an "Undated" lane, not dropped.
- Changing calendar so a date is invalid (e.g. day 31 in a now-30-day month) → date flagged invalid, not auto-changed.
- Exporting with no chapters selected → export button disabled.
- Image file missing from assets on export → export continues with a placeholder and a warning listing the images.
- Deleting a codex entry that has relationships or group memberships → confirm and list them; the entry goes to trash and its relationships are shown as broken (same rule as other links) until the entry is restored or the relationships removed. Group memberships are kept and shown as broken too.
- Relationship from an entry to itself, or an exact duplicate (same pair, same type, same direction) → rejected with a message.
- Deleting a codex entry type that still has entries → must pick another type to reassign them to.
- Restoring a snapshot while there are un-snapshotted changes → confirm; an automatic safety backup of the current state is created first, so the restore can be undone.
- Item restored from a snapshot that is no longer listed in `project.json` (it was deleted later) → re-added to the manifest at its original place in the tree if that parent still exists, otherwise at the root of its area.
- Snapshot history directory missing or corrupt → the book still opens and autosave works; snapshot features show an error and offer to start a new history.
- Importing a malformed dictionary → error message, dictionary not added.
- Book selects a global dictionary that does not exist on this machine (e.g. project copied to another computer) → warn, fall back to spellchecking without it, keep the selection in `project.json` so it works again once the dictionary is installed.
- `calendar.json` missing or invalid → open the book, warn, and fall back to the Gregorian preset in memory without overwriting the file; node dates stay stored as-is.
- Checks on an empty book or a book with no timelines/rules → no findings, no errors.
- Two states, or a learning and a use link, whose order is unknown (different branches, no dates, no path) → no finding.
- Learning event with "forgotten at" before "learned at" → rejected on save with a message.
- Importing a file that is not valid UTF-8 → error naming the file; nothing is created.
- Lock file left by a crashed session → treated as stale after 2 minutes (or dead process) and taken over.
- External change to a file while the app is saving it → app's own write is recognised by content hash and does not trigger a prompt.
- Inbox note moved into a scene, then the scene is deleted → note content is in the trash with the scene; the inbox does not keep a copy.
- A finding whose location was deleted or moved → finding disappears on the next run; an ignored finding for it is dropped silently.
- Ignored-findings file missing or invalid → checks still run, all findings shown, a warning is displayed; the file is not overwritten.
- Very long books (hundreds of thousands of words) → editor loads only the selected scene; sidebar and search stay responsive.

## Acceptance criteria
- When the user creates a book, a project appears on disk and reopens with identical contents after restarting the app.
- When the user reorders scenes in the sidebar by drag, the order is preserved on restart and used in export; only `project.json` changes on disk.
- When the user opens `project.json` in a text editor, it lists the book's settings and every manuscript, timeline, rule, codex, relationship and asset file by relative path.
- When the user opens a book by choosing its folder or its `project.json`, the book loads with all items present.
- When a scene file is hand-edited into an invalid shape, the book opens, that scene shows an "invalid file" error naming the field, and the file on disk is unchanged.
- When a project from an older format version is opened, it is migrated after an automatic backup and then works normally.
- When the user selects a paragraph and links it to a timeline node, a badge appears in the margin; clicking it opens that node in the Timelines view; the node lists the paragraph and clicking it returns to the paragraph.
- When the user creates a branch and later merges two branches into one node, both incoming edges are shown and no validation error occurs; connecting a later node back to an earlier one is rejected.
- When the user toggles to Date-scaled view, nodes with dates are positioned in the order of the custom calendar; undated nodes appear in a separate lane.
- When the user deletes a linked timeline node, the linked paragraph keeps its badge, now marked broken; restoring the node from trash repairs it.
- When the user creates a rule with a category and links it to a node, both the rule and the node show the link.
- When the user exports to DOCX and to PDF with a title page and table of contents, the files open in Word/LibreOffice and a PDF reader and contain only the selected chapters with headings, formatting, footnotes and images; margin comments are absent.
- When the user adds a relationship between two characters and types a new name such as "the object of pure hatred", that name becomes a reusable relation type, appears on both characters' pages and as a labelled edge in the relationship graph.
- When the user sets a reverse label on a relation type (e.g. father ↔ child), the second entry's page shows the reverse label.
- When the user relates a Town to a Country with "located in", both entries show the relationship and the graph shows the labelled edge.
- When the user creates a custom codex type "Faction" and adds an entry of that type, the entry appears in the Codex under that type and can be related, grouped and linked like any other entry.
- When the user creates a group "House Stark" and adds three entries, the relationship graph draws them inside a coloured region and the filter by group shows only them.
- When the user aligns a paragraph to the right or justifies it, the alignment persists after restart and appears in the exported PDF and DOCX.
- When the user exports with page numbers on, pages are numbered; with the toggle off, they are not.
- When the user imports a Hunspell dictionary as local, it appears in the project's `dictionaries/` directory; as global, it appears in the app's user data directory and is available in other books.
- When the user imports a Hunspell dictionary and selects it for the book, words in it are not flagged as misspelled.
- When the user edits the calendar, only `calendar.json` changes on disk.
- When the user switches the app language to Polish, all UI text changes without restarting.
- When the user types in the editor for a day, the stats page shows words written for that day against the goal.
- When the user edits scenes and never creates a snapshot, nothing is lost: all edits are on disk after restart.
- When the user edits three scenes, ticks only two in the Changes panel and creates a snapshot, the snapshot contains the two ticked scenes' new text and the third scene's old text, and the third scene is still listed as changed.
- When the user clicks "Snapshot all changes", all changed items are recorded and the Changes panel becomes empty.
- When the user uses the snapshot features, no screen shows git terms such as commit, stage, branch, HEAD or hashes, and no git installation is required on the machine.
- When a developer adds a new exporter module to the registry, a new format appears in the export dialog without changes to the editor, the manifest or the other exporters.
- When the user edits a scene after a snapshot and restores that scene from the snapshot, the text returns to the snapshot state.
- Global search for a character name returns hits in manuscript, codex and nodes, grouped by area.
- When a node dated year 300 is placed after a node dated year 500 along an edge, the Checks page shows a date-order warning naming both nodes; clicking it opens the later node.
- When the user deletes a node that a paragraph links to, the Checks page shows a broken-link error for that paragraph; restoring the node from trash and re-running the checks removes it.
- When the user ignores a finding, it disappears from the list, stays hidden after restart, and reappears under "Show ignored".
- When the user switches a check off in Book settings, its findings no longer appear.
- When the user sets a scene's status to Revising, its tree row shows the status colour, and filtering the tree by Revising lists it.
- When the user opens the corkboard, scenes appear as cards with synopsis and status; dragging a card to another chapter moves the scene in the tree and in `project.json`.
- When the user adds an alias "Ned" to the entry "Eddard Stark", the entry's Mentions tab lists unlinked blocks containing "Ned"; "Link" adds the link and the row disappears.
- When two Owner states of the same item overlap in time, the Checks page shows an overlapping-states warning; when they only touch at the boundary, it does not.
- When a character learns a secret at node N, the Knowledge section "As of" an earlier node shows it as not known and "As of" N or later shows it as known; a block linked to the (secret, character) pair and to a node before N produces the knowledge-used-too-early warning.
- When the user marks a Status state "Dead" as final from node N, a block linked to that character and to a later node produces an appearance-after-final-state warning.
- When the user opens the Chronicle tab of a character, linked nodes, states and knowledge events appear in chronological order with in-world dates.
- When the user exports with Dramatis personae on, only Character entries marked "Include in appendices" appear, with their appendix text and first appearance, and no private notes.
- When a book is already open in another instance, opening it again shows the "open elsewhere" dialog and read-only mode works.
- When a scene file is changed on disk while the book is open and unedited in the app, the new text appears without a prompt; with unsaved edits, the app asks reload or keep.
- When the user imports a Markdown file with H1/H2 headings, the preview shows chapters and scenes; confirming creates them at the end of the tree.
- When the user collapses "This paragraph" in the context panel and restarts the app, it is still collapsed; pressing Enter on its focused header expands it again.
- When the user adds "Odo learns the fire was set" from Odo's page, the event "Harbour burns" shows it under "Who learns what here", and adding it from the node shows it on Odo's page.
- When the user switches the theme to Dark, the whole UI including canvases changes immediately and persists after restart; the UI zoom and editor font size can be changed independently.
- When the user presses Ctrl/Cmd+P and types part of a name or alias, the matching item opens on Enter.
- When the user opens the sample book from the welcome screen, a copy opens in the folder they picked and the Checks page shows the deliberate warning.
- When the app is killed while running, the next start offers to reopen the last book and verify its files.
- When the user navigates the timeline canvas only with the keyboard, every node can be reached, opened and connected.

## Decisions
- **Desktop app with Tauri**: real files on disk, offline, small footprint. (User chose desktop; Tauri recommended over Electron for size.)
- **Vue 3 + TypeScript + Vite + Quasar** (user decision, replaces PrimeVue): PrimeVue 5 moved to the commercial PrimeUI license and shows a license toast without a key, so the user chose Quasar (MIT), used with its Vite plugin and no Quasar CLI. Tree drag-reorder needs a separate drag-and-drop library. The hard UI (editor, timeline and relationship canvases) comes from dedicated libraries either way. Nuxt not used (no SSR need).
- **`project.json` manifest** (user decision): IDE-style project file at the folder root that indexes all folders/files and holds book settings; it is the source of truth for structure and order.
- **TipTap/ProseMirror** for the editor: supports stable block IDs and custom node attributes needed for per-block links.
- **Storage**: one project **folder** per book on disk (user decision), not a single file, browser storage or a server.
- **Relationships are in scope** (user decision, reversing the initial non-goal) between any codex entries (characters, places, towns, buildings, countries, items, custom types): user-named relation types, directed, graph view, plus groups (family, faction, kingdom). No dedicated place hierarchy in v1; "located in" relations cover it.
- **User-defined codex entry types are in v1**, with starter types Character, Item, Place, Country, Town, Building (user decision).
- **All item files are JSON** (user asked for what is easiest to implement; Markdown cannot express text alignment, margin comments, block IDs or links, while TipTap/ProseMirror JSON stores them natively). `project.json` and `calendar.json` are JSON too.
- **Zod schemas validate all JSON files on read and write**, with a format version and migrations (user agreed): bad files fail with a clear error instead of breaking the app or losing data. Optional JSON Schema export for editor autocomplete is deferred.
- **Snapshots work like git, staging optional, autosave is the base** (user decision): per-item staging, "Snapshot all changes" shortcut, history, diff and restore.
- **Snapshots are real embedded git** (user decision: easiest) via libgit2/`git2`, with a friendly non-technical UI and no git terminology (user requirement for non-technical people).
- **Export is a pluggable pipeline in the frontend** (user wants the easiest approach, expandable to more formats): neutral export model + exporter registry; `docx` library for DOCX, `pdfmake` for PDF. A Rust-side or Typst-based PDF exporter remains possible later as just another exporter if PDF typography (true footnotes) needs to be better.
- **Global data location** (user decision): the standard OS application data directory like other installed apps, via Tauri's path API.
- **Export page furniture is optional** (user decision): page numbers and running header are toggles; the user chooses.
- **Manuscript = tree of separate documents** (parts/chapters/scenes), not one long document.
- **Timelines**: multiple per book; graph with branch and merge; both flow and date-scaled views.
- **Custom calendar per book**, with Gregorian preset, stored in its own `calendar.json` (user decision).
- **Dictionaries in their own directories**, local (in the project) or global (per-user app data), selected per book by reference (user decision).
- **Book metadata, goals and the dictionary selection stay inside `project.json`**; only the calendar and the dictionaries are separate (user confirmed).
- **English and Polish spellcheck dictionaries are bundled with the app** as global dictionaries, since the UI ships in both languages (user confirmed).
- **Links per block** (heading/paragraph), created via an editor action with a picker, shown as margin badges.
- **Deletion** leaves broken links rather than removing them or blocking.
- **Rules page**: categorised entries, not free-form text.
- **Extras in scope**: codex, writing goals/stats, snapshots/version history, global search, focus mode.
- **Export options**: title page, TOC, page setup, chapter selection. Footnotes always render natively; comments always excluded.
- **Localisation**: vue-i18n, English + Polish shipped; user-addable spellcheck dictionaries.
- **Deterministic consistency checks are in v1; LLM checking (optional, local Ollama) is after v1** (user decision): the Checks page and finding format are built so an LLM checker can plug in later as another source of findings. LLM checking would stay read-only and never edit text.
- **Added to v1 after a review of suggestions** (user decision): codex aliases and unlinked mentions, scene status/synopsis/POV with corkboard, quick switcher, coverage checks, chronicle view, export appendices, lock file, external-change detection, crash-safe startup with local log, themes and text scaling, shortcut reference and rebinding, sample book and tour, Markdown/text import, accessibility baseline, dated states, revision to-dos, inbox, writing sessions and streaks, and knowledge tracking.
- **Knowledge tracking is chronological** (user decision): "learns at position" and optional "forgets at"; "As of" views; a check flags use before learning. Positions are timeline nodes or calendar dates; order comes from one shared helper and is skipped when unknown.
- **Checks page (M7, user decision)**: findings are grouped by severity (errors, warnings, info). Per-check on/off lives in `project.json` (`checkSettings`, missing = on) and is edited in the Settings page below the calendar. Results are recomputed on open and on demand, never saved; only ignored ids are. Finding text is localised from check id, variant and params, with the English message as fallback. Knowledge use after a character forgets an item is flagged like use before learning; a block with several timeline positions is flagged only when every position is a problem.
- **States are separate from custom fields**: dated states (location, owner, status, title) cover continuity; generic custom fields on codex types remain open.
- **Appendices never include private notes**: separate "Appendix text" and an opt-in checkbox per entry (spoiler safety).
- **UI direction "C · Workshop"** (user decision): sidebar with section colours, header band, centred sheet, collapsible context panel; chosen over the dark icon-rail layout (A) and the margin-notes layout (B) as the most comfortable. Light and dark themes both supported.
- **Knowledge is assigned to characters and tied to the timeline** (user decision): editable from the character page, the knowledge item page and the timeline node.
- **App-level settings** (theme, zoom, shortcuts, language) live in the app data directory, not in the book.
- **App name and identifier** (user decision): `Storyworks`, `io.github.mainskown.storyworks` (renamed from `BookWriter` before any release, when scripts joined v1). The identifier fixes the app-data path, so it should not change.

- **Item file format (M1)**: every item file is `{ version, id, ...fields }`, pretty-printed with keys in schema order. Block IDs are `attrs.id` on ProseMirror nodes inside the scene `content` and must be unique per file. `project.json` indexes every area as generic `{ id, path, title? }` references (empty until the area exists), so later milestones add item-file schemas without a manifest migration. Fixed folders: `assets/`, `dictionaries/`, `.storyworks/` (lock, trash, backups, history).
- **Trash (M1)**: deleting moves the item file to `.storyworks/trash/<id>/` and records it in the manifest `trash` list (original parent and position); IDs stay, so links un-break on restore. Deleting a chapter or part trashes its children as separate entries; restoring the container restores only the container.
- **Lock freshness (M1)**: on the same machine a lock is live while its process is alive (whatever its age); on another machine it is live for under 2 minutes.

## Open questions
- Should staging go below item level (per paragraph / per change hunk) later? Assumed no for v1.
- Do codex entry types need custom fields (e.g. "population" for Town, "age" for Character)? Not discussed; assumed no for v1, only the common fields plus rich-text notes.
- Header/footer content in export beyond page numbers and a running header (book title or chapter title) is assumed out of scope.
- Groups are assumed to be lightweight objects (name, colour, members), not codex entries; revisit if groups need their own notes or images.
- Tree metadata performance: the manuscript tree needs scene status, synopsis, POV and word count for every scene on open. Implementation must stay fast with hundreds of scenes (e.g. build an in-memory index at open, or keep light metadata in the manifest). Decide at implementation.
- Scene statuses are fixed to four in v1; customisable statuses are not planned. POV is a Character entry reference, not free text. Say if either should change.
- "Reading order jumps back in time" (flashback detection) is not a check; it is left to the later narrative-vs-story-order chart.
- Knowledge: should groups (e.g. a faction) be able to learn something, so all members know it? Assumed no for v1 (entries only).
- Verify at implementation time that `pdfmake` meets the PDF needs (TOC with page numbers, justified text, headers, images). It has no native footnotes as far as I know, hence the end-of-chapter notes fallback in PDF; if that is unacceptable, switch the PDF exporter to Typst or another engine.

## Relevant code
- None: the repository at `/home/mainskown/Pulpit/Coding/Storyworks` is empty (not a git repository) at the time of writing. Everything above is new.
