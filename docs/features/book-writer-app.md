# BookWriter: desktop app for writing a book

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
- AI writing assistance.
- Inline text-range links to timeline nodes (links are per block: heading or paragraph).

## Changes

### Project / platform
- [ ] Scaffold a Tauri desktop app with Vue 3 (Composition API) + TypeScript + Vite, using PrimeVue as the component library (use it consistently; neutral theme via design tokens). Drag-to-reorder in the chapter tree may need an additional small drag-and-drop library; verify whether PrimeVue's Tree covers it first.
- [ ] Add vue-i18n for UI localisation; ship English and Polish locale files; language switchable in app settings.
- [ ] Welcome screen: New book, Open book, list of recent books.
- [ ] A book is one project **folder** on disk (human-readable, pretty-printed JSON files with stable key ordering, plus an `assets/` subfolder for images), with settings: title, author, book language. Layout suggestion: one file per scene/chapter, one file per timeline, rules, codex entries and relationships. This keeps diffs small and the folder git-friendly.
- [ ] The folder root contains a `project.json` manifest, like an IDE project file. It is the entry point: "Open book" opens the folder via this file. It contains: format version, book metadata and settings (title, author, language, selected dictionaries, goals), and an index of everything in the project with relative paths: the manuscript tree (parts → chapters → scenes, with their order and nesting and the file for each), the calendar file, timelines, rules and rule categories, codex entry types and entries, relationship types, relationships and groups, the snapshot history directory, the project-local dictionaries directory, and the assets folder.
- [ ] The manifest is the source of truth for structure and order (reordering scenes only edits `project.json`, not the scene files). The app keeps it in sync whenever items are created, renamed, moved or deleted, writing it atomically (temp file + rename).
- [ ] Autosave of all changes to disk; unsaved-state indicator not needed beyond a "saved" status.
- [ ] Top-level navigation between: Manuscript, Timelines, Rules, Codex, Stats, Search, Export, Book settings.

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

### Relationships and groups
- [ ] Relationships between any two codex entries of any type (character–character, character–place, town–country, item–character, ...). A relationship has: from-entry, to-entry, a relation type, and an optional rich-text note.
- [ ] Relation types are user-defined free names (e.g. "friend", "father", "the object of pure hatred", "located in"). Types are created on the fly while adding a relationship and are stored in a reusable list; they can be renamed, recoloured and deleted (with reassignment) in a "Relation types" manager. Starter types (e.g. Friend, Enemy, Parent, Sibling, Lover, Located in, Owns) are provided and can be removed. Types are not restricted by entry type.
- [ ] Relationships are directed ("A is father of B"). A relation type may optionally define a reverse label (e.g. "father" ↔ "child", "located in" ↔ "contains") so the other entry's page shows "B is child of A"; if none is set, the same label is shown on both sides.
- [ ] Each codex entry shows a Relationships section listing incoming and outgoing relationships, with add/edit/remove.
- [ ] Groups: user-named, coloured groups of codex entries (e.g. a family, a faction, a kingdom). An entry can belong to several groups. Groups are managed in a "Groups" manager and shown on each entry. Groups are lightweight objects (not codex entries themselves) and are independent of relationships.
- [ ] A relationship graph view: entries as nodes, relationships as labelled, coloured edges; groups drawn as coloured regions around their members; pan/zoom; filter by relation type, entry type and group; click an entry to open it.
- [ ] A relationship can optionally be linked to a timeline node (e.g. "became enemies at this event"), shown as a back-link on the node.

### Writing goals & stats
- [ ] Stats page: word count per scene/chapter/part and total; chart of words written per day.
- [ ] Daily word-count goal and optional book target; progress shown on the stats page and in the editor status bar.

### Snapshots / version history
- [ ] Autosave is the base: every change is always written to the working files; the user never has to save or snapshot to keep work.
- [ ] Snapshots work like git commits and are entirely optional. A "Changes" panel lists every item changed since the last snapshot (scenes, chapters, timelines, rules, codex entries, calendar, etc.) as added / modified / deleted / moved.
- [ ] Staging is optional: each changed item has a checkbox so the user can choose which changes go into the snapshot; one-click "Snapshot all changes" skips staging. Staging granularity in v1 is per item (e.g. a whole scene), not per paragraph.
- [ ] Creating a snapshot takes an optional message (default: timestamp). Snapshots record the full state of the project, so any snapshot can be inspected as a whole.
- [ ] History view: list of snapshots (message, time, number of changed items); open one to see its changed items; view an item's content as of that snapshot; text diff against the current version or the previous snapshot.
- [ ] Restore: restore a single item, or the whole project, to a snapshot state. Restoring first creates an automatic safety backup of the current state and asks for confirmation.
- [ ] Snapshots are implemented with real git, embedded in the app via libgit2 (Rust `git2` crate, bundled/vendored so users do not need git installed, on Linux and Windows alike). The git directory is hidden inside the project folder (e.g. `.bookwriter/history.git`, listed in `project.json` as one entry) with the project folder as the work tree, so it travels with the book and does not collide with a git repository the user may keep in the same folder. Autosaved working files are never committed automatically; only the user's snapshots create commits.
- [ ] The snapshot UI must not use git jargon. Wording: "Snapshot" (not commit), "Changes" (not staging area), "Include in snapshot" checkbox (not stage), "History", "Restore this version". No branches, remotes, merges or hashes shown in v1. Each snapshot shows its message, date and the list of changed items in plain words (e.g. "Chapter 3 – Scene 2: edited").
- [ ] Automatic backups of the whole project at a configurable interval (default: on close and every 30 minutes while editing), keeping a configurable number of recent backups (default 20).
- [ ] Trash for deleted scenes/chapters/entries, restorable.

### Search
- [ ] Global search (shortcut Ctrl/Cmd+Shift+F) across manuscript text, rules, timeline nodes and codex entries; results grouped by area, click to open at the match.

### Export (PDF / DOCX)
- [ ] Export dialog with format choice (PDF or DOCX).
- [ ] Chapter selection: whole book (default) or a checked subset of the tree.
- [ ] Title page (title, author) and generated table of contents (toggle each).
- [ ] Page setup: page size (A4, A5, Letter), margins, font family, font size, line spacing.
- [ ] Optional page furniture, each a toggle in the export dialog: page numbers (default on) and a running header (default off; the user picks its text: book title or chapter title). The user chooses whether to include them.
- [ ] Text alignment (left, center, right, justified) set in the editor is carried into the export.
- [ ] Exported content maps: H1–H3 to headings, lists, quotes, scene breaks, images, and footnotes (native footnotes in DOCX; in PDF native footnotes if the chosen PDF library supports them, otherwise numbered notes at the end of each chapter).
- [ ] Export pipeline is pluggable: scenes (ProseMirror JSON) are first converted into one format-neutral export document model (chapters, blocks, inline styles, alignment, footnotes, images, plus the page-setup options). Each output format is a separate exporter module that consumes this model and is registered in an exporter registry; the export dialog's format dropdown is built from the registry. v1 registers two exporters: DOCX and PDF. Adding a format later means adding one exporter module and nothing else.
- [ ] Export runs in the frontend (TypeScript): DOCX via the `docx` library; PDF via `pdfmake` (supports page numbers, headers, TOC, alignment incl. justified, images). Output bytes are written to the chosen path through Tauri's file API.
- [ ] Margin comments, timeline/rule badges and other app-only annotations are never exported.
- [ ] Save-as dialog for the output path; success/failure message with "open folder" action.

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

## Edge cases
- `project.json` references a file that does not exist → open the book anyway, mark the item as "missing file" in the UI, and list all missing files in a warning; never delete the reference automatically.
- Files exist in the project folder but are not listed in `project.json` (e.g. added by hand or by a git merge) → offer to import them into the project or ignore them; never delete them.
- `project.json` has a merge conflict or invalid JSON → refuse to open, show the parse error and offer the latest backup.
- Open a corrupted or newer-version project file → show an error naming the problem; never overwrite it; offer to open the latest backup.
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
- Very long books (hundreds of thousands of words) → editor loads only the selected scene; sidebar and search stay responsive.

## Acceptance criteria
- When the user creates a book, a project appears on disk and reopens with identical contents after restarting the app.
- When the user reorders scenes in the sidebar by drag, the order is preserved on restart and used in export; only `project.json` changes on disk.
- When the user opens `project.json` in a text editor, it lists the book's settings and every manuscript, timeline, rule, codex, relationship and asset file by relative path.
- When the user opens a book by choosing its folder or its `project.json`, the book loads with all items present.
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

## Decisions
- **Desktop app with Tauri**: real files on disk, offline, small footprint. (User chose desktop; Tauri recommended over Electron for size.)
- **Vue 3 + TypeScript + Vite + PrimeVue**: user knows Vue and wants a framework to avoid hand-styled plain Vue. PrimeVue chosen over Vuetify for its desktop-style components (Splitter, Menubar, ContextMenu, Tree) and neutral token-based theming; the hard UI (editor, timeline and relationship canvases) comes from dedicated libraries either way. Nuxt not used (no SSR need).
- **`project.json` manifest** (user decision): IDE-style project file at the folder root that indexes all folders/files and holds book settings; it is the source of truth for structure and order.
- **TipTap/ProseMirror** for the editor: supports stable block IDs and custom node attributes needed for per-block links.
- **Storage**: one project **folder** per book on disk (user decision), not a single file, browser storage or a server.
- **Relationships are in scope** (user decision, reversing the initial non-goal) between any codex entries (characters, places, towns, buildings, countries, items, custom types): user-named relation types, directed, graph view, plus groups (family, faction, kingdom). No dedicated place hierarchy in v1; "located in" relations cover it.
- **User-defined codex entry types are in v1**, with starter types Character, Item, Place, Country, Town, Building (user decision).
- **All item files are JSON** (user asked for what is easiest to implement; Markdown cannot express text alignment, margin comments, block IDs or links, while TipTap/ProseMirror JSON stores them natively). `project.json` and `calendar.json` are JSON too.
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

## Open questions
- Should staging go below item level (per paragraph / per change hunk) later? Assumed no for v1.
- Do codex entry types need custom fields (e.g. "population" for Town, "age" for Character)? Not discussed; assumed no for v1, only the common fields plus rich-text notes.
- Header/footer content in export beyond page numbers and a running header (book title or chapter title) is assumed out of scope.
- Groups are assumed to be lightweight objects (name, colour, members), not codex entries; revisit if groups need their own notes or images.
- The app identifier (Tauri reverse-domain identifier, e.g. `com.bookwriter.app`) and the final app name; chosen at scaffolding. It only affects the global data path.
- Verify at implementation time that `pdfmake` meets the PDF needs (TOC with page numbers, justified text, headers, images). It has no native footnotes as far as I know, hence the end-of-chapter notes fallback in PDF; if that is unacceptable, switch the PDF exporter to Typst or another engine.

## Relevant code
- None: the repository at `/home/mainskown/Pulpit/Coding/BookWriter` is empty (not a git repository) at the time of writing. Everything above is new.
