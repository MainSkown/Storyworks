# M2 · Implementation plan: Manuscript editor

Scope and "Done when": [milestones.md](milestones.md#m2--manuscript-editor). Spec: Manuscript editor, UI design (editor parts), Edge cases (long books).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (full context, tests first, reviewed before accepting).

## Decisions to settle first (record in spec)
- **Editor schema is a registry:** `editorKinds[kind]` = `{ extensions, toolbar }`. `book` is the only entry; S1 adds `script`. The editor component takes the kind from the project.
- **Block IDs (H):** one TipTap extension adds `attrs.id` to every block node type (paragraph, heading, quote, list item, scene break, image). Rules: new block → fresh `newId()`; split keeps the ID on the first half, new ID on the second; join keeps the first; paste/duplicate that would repeat an ID gets a fresh one; moves don't touch IDs. Footnote bodies are inline content, no block IDs.
- **Footnotes:** inline atom node `footnote` holding its own inline content; shown as an auto-numbered superscript, edited in a small popover. Numbering is derived, never stored.
- **Comments:** a `comment` mark (`attrs.commentId`) on the text range; bodies live in the scene's `comments` array `{ id, text, createdAt, resolved }`. Deleting a comment removes the mark; removing the text drops the mark and leaves an orphan, which the scene cleans on save.
- **Images:** picked file copied to `assets/<newId>.<ext>`, node stores the relative path. Browser (virtual folder) impl stores a data copy in the virtual `assets/`.
- **Scene schema v2 (migration + test):** add `todos: { id, text, done }[]`, give `comments` a real shape. Project `version` 1→2 with a real migration (first use of the M1 mechanism). `wordCount` stays in the scene and is updated on save.
- **Tree metadata performance (spec open question):** at open, read each scene's `status`, `synopsis`, `povId`, `wordCount` once into an in-memory index (the store already reads scenes for the link index). Edits update the index live; the manifest is not bloated. Check with a 500-scene generated project.
- **Per-scene loading:** the editor holds one scene; switching flushes the outgoing scene first. Word counts for other scenes come from the index.
- **Inbox:** `inbox.json` (new item type, notes `{ id, title?, content }`), referenced from the manifest's existing `inbox` slot, created on first use. "Move to scene" appends the nodes (fresh block IDs) to the target; delete goes to trash.
- **Tree is a shared component** used in the sidebar (Write section expands in place) and reused by the corkboard for drag logic. Drag uses one pure `moveNode(tree, id, newParent, index)` that rejects cycles and wrong nesting (scene under scene, part under chapter).
- **Trash gets a permanent home:** Trash entry in the sidebar bottom group, replacing the temporary button. The temporary WriteView list and textarea are removed.
- **POV:** free-text-disabled field "Set once the codex exists" until M5; `povId` stays in the schema.
- **Dependencies:** `@tiptap/vue-3`, starter-kit, underline, text-align, image, placeholder, character-count; Quasar `QTree` is not used (custom tree for drag + metadata), Quasar for the rest.

## Steps

### 1. Tests first (N, H where marked) · parallel with 2
- **Block IDs (H):** untouched paragraphs keep IDs after typing before/after/inside neighbours; split → first keeps, second new; join; paste of a block with an existing ID gets a fresh one; undo/redo; no duplicates ever (the schema refine holds); move of a list item keeps IDs.
- **Tree ops:** `moveNode` valid/invalid nesting, cycle rejection, index after removal in same parent, order written to manifest; add part/chapter/scene; delete to trash and restore at original place (M1 behaviour still green).
- **Scene v2:** valid scene loads; v1 scene migrates (todos `[]`); malformed rejected untouched; comment orphan cleanup; alignment, footnote and image nodes survive serialize → parse.
- **Word count:** pure `countWords(doc)` (footnotes excluded or included: decide, include = no; images/breaks = 0), chapter/part/book roll-up from the index, updates on edit.
- **Status filter:** tree filtered by status keeps ancestors of matches.
- **Inbox:** note → append to scene (fresh IDs, order kept); note → new scene; delete → trash; scene deleted after move leaves no copy.
- **Assets:** image copy writes under `assets/`, relative path stored; name collision impossible (ID-named).

### 2. Setup (T) · parallel with 1
Add dependencies; `editorKinds` registry skeleton; i18n key groups (`write.*`, `editor.*`, `inbox.*`) in en + pl.

### 3. Schemas + migration v1→v2 (N) · after 1
`scene.ts` v2 (todos, comment shape), `inbox.ts`, migration registered, manifest/project version bump.

### 4. Block-ID extension + editor core (H) · after 1, 2
Extension per the rules above; `Editor.vue` wrapping TipTap with `book` kind: H1–H3, B/I/U, lists, quote, scene-break node, alignment (block attr, shortcuts), footnote node, image node, comment mark. Content in/out as JSON through the store's `updateItem` (autosave from M1). Block-ID tests must pass before anything else builds on it.

### 5. Tree model + sidebar tree (N) · after 3, parallel with 4
`moveNode` and tree ops in the store (part/chapter/scene add, rename, delete, drag re-nest/reorder, keyboard reorder as the accessible alternative); `OutlineTree.vue` in the sidebar under Write with status dots, synopsis tooltip, word counts, status filter; metadata index from "Decisions".

### 6. Editor UI (N) · after 4, 5
Workshop layout: header band (item name, status, Focus), toolbar per kind, centred 600 px sheet, status bar (word counts scene/chapter/book, saved state), scene properties panel (status, synopsis, POV placeholder, to-dos) in the context panel, focus mode (hides sidebars, shortcut, Esc exits). Remove temporary WriteView content and Trash button.

### 7. Footnote, image, comment UI (N) · after 4, parallel with 6
Footnote popover, image insert via file picker + asset copy, margin comment rail (add from selection, edit, resolve, delete, jump). Comments excluded from any future export by construction (kept outside content).

### 8. Corkboard (N) · after 5
Cards per scene grouped by chapter, toggle next to the tree, click opens, drag via `moveNode`.

### 9. Inbox (N) · after 3, 5
Sidebar bottom area, note editor (same Editor, reduced toolbar), move to scene / new scene / delete, Trash entry in sidebar.

### 10. Long-book check (N) · after 5, 6
Generated 500-scene / ~300k-word project: open time, scene switch time, typing latency, tree responsiveness; fix what is slow (virtualise tree rows only if needed).

### 11. Verify and review (N)
Full test run; `run` skill: screenshots of tree, editor, comments, footnote, image, corkboard, inbox, focus mode, light and dark, published to the "Storyworks Screens" Artifact (before/after for Write). Real-window check: write 3 chapters, reorder, close, reopen, inspect a scene file for alignment/footnote/image/IDs. I review block-ID and migration code (H) before accepting.

## Order
1+2 → 3 → (4 ∥ 5) → (6 ∥ 7 ∥ 8 ∥ 9) → 10 → 11. Hard work is concentrated in step 1 (ID tests) and step 4; everything else is N/T.

## Risks
- TipTap's own transaction behaviour on split/paste may fight the ID rules → covered by step 1 tests, fix in the extension, not in callers.
- Bundle size and Wayland/webview quirks with contenteditable (IME, spellcheck) → check in the real window at step 11; spellcheck dictionaries are a later milestone.
