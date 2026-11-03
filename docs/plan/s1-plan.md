# S1 · Implementation plan: project kinds and screenplay editor

Scope: [milestones.md](milestones.md#s1--project-kinds-and-screenplay-editor). Spec: [script spec](../features/script-writing.md) (Project / platform, Screenplay: editor, Behavior details, Edge cases).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** M11a committed. Needs M2 (editor kinds, block ids) and M5 (codex): both done.

## What already exists
- Manifest has `kind: string` from v1 (`BOOK_KIND`); an unknown kind already opens read-only (`readOnlyReasonOf`). Manifest is v12.
- `src/editor/kinds.ts` has `editorKinds: Record<string, EditorKind>` (extensions + toolbar); `ManuscriptEditor.vue` picks it by `manifest.kind`. Only `book` exists.
- `BlockIds` extension with `BLOCK_ID_TYPES`; `docToText` (`project/plainText.ts`), `wordCount.ts`, search/mentions/spell work on ProseMirror JSON.
- `createProject`/`createManifest` build the book skeleton; `NewProjectDialog` has no kind; `sections.ts` is one static list; tree is Part > Chapter > Scene.

## Decisions (confirmed by user; record in the script spec "Decisions")
- **Screenplay tree:** one folder level, **Sequence** (the chapter node relabelled), scenes inside; no parts.
- **Scene numbers:** every scene-heading line is numbered, running through the whole script in tree order; the tree shows the number of an item's first heading. Numbers are derived, never stored.
- **Game kind in S1:** selectable in New project; Write shows a "coming in a later version" empty state; Codex, Timelines, Rules, Checks, Stats, History work.

## Defaults I will use unless you object
- Element order for Tab / Shift+Tab: scene heading → action → character → dialogue → parenthetical → transition → (back to) scene heading. Enter follows the spec rules; Enter on an empty block switches it to the previous natural element.
- Stored text is as typed; scene headings, cues and transitions are shown uppercase by CSS, and exporters uppercase them (S2).
- Pasted plain text becomes action blocks; rich formatting is dropped. Fountain paste/import is S2.
- Screenplay toolbar: element dropdown, comment, "Link to event", undo/redo. No headings, lists, quote, alignment, scene break, footnote, image.
- Autocomplete is a small popup under the cursor; Enter or Tab accepts (Tab accepts only while the popup is open), Esc closes. Time-of-day list per UI language (EN: DAY, NIGHT, DAWN, DUSK, CONTINUOUS, LATER; PL equivalents).
- Export and Import sections are hidden in screenplay and game projects until S2/S6 (the book exporter does not fit); Stats show words only (pages are S2). Corkboard, inbox, status, synopsis, POV and focus mode stay.
- Manifest v13 adds `titlePage: {contact, date}` (title and author already exist); migration test required. `kind` is immutable: saving a manifest whose kind differs from the opened one is rejected.

## Steps

### 1. Kinds plumbing + manifest v13 (H) · tests first
`src/project/kinds.ts`: `KIND_IDS`, `kindProfile(kind)` (labels for folder/scene, section list, which tools are hidden, default names). `createProject(io, {kind, …})` builds: book (unchanged), screenplay (one "Sequence 1" with "Scene 1", Polish "Sekwencja 1"/"Scena 1"), game (empty tree). `titlePage` in manifest, v12→v13 migration. Tests: each kind creates a valid project that reopens; unknown kind still read-only; kind change on save rejected; v12→v13 round trip and malformed manifest rejected and untouched; book projects open unchanged.

### 2. Screenplay element nodes and flow (H) · tests first
`src/editor/screenplay/`: six block nodes (`sceneHeading`, `action`, `character`, `dialogue`, `parenthetical`, `transition`) added to `BLOCK_ID_TYPES`; `rules.ts` pure `nextElement(type, {empty})` and `cycle(type, dir)` table-driven from the spec; keymap extension (Enter, Tab, Shift+Tab, empty-Enter fallback); `editorKinds.screenplay` (extensions + toolbar dropdown); scene validation: a screenplay scene may contain only element blocks. Tests: every Enter transition in the spec, Tab cycle both ways, empty-Enter fallback, block ids unique and unchanged on untouched blocks after splits/merges/paste, saved JSON contains typed blocks with ids, book kind unaffected.

### 3. Layout and toolbar UI (N) · after 2
Monospace sheet with element indents/margins in `editor.css`, uppercase display, element dropdown in the toolbar (shows the current type, keyboard-operable, labelled), tree/corkboard labels via `kindProfile`, EN/PL strings (**T**).

### 4. Autocomplete (N, pure ranking tests) · parallel with 3
`src/editor/screenplay/suggest.ts`: character cue suggestions from codex Characters + aliases (prefix then substring, case/diacritic-insensitive via `search/normalize.ts`, `ł` handled); scene-heading suggestions (INT./EXT./INT./EXT. prefix, then codex Places, then time of day after " - "). Free text always allowed; unknown cue name offers "Add to codex" hint. Popup component. Tests for ranking, alias hit, no codex, diacritics.

### 5. Scene numbers (H) · tests first, parallel with 2–4
`src/project/sceneNumbers.ts`: from tree order + per-scene heading block ids (kept in the store's per-scene index next to word counts, updated on edit and open) → `blockId → number` and `itemId → first number`. Shown in the tree and as an editor-margin decoration. Tests: runs across sequences and items, trashed scenes skipped, a new heading in the middle renumbers later ones, item without heading unnumbered, two headings in one item, 1500 scenes stay fast.

### 6. Title page, sidebar and dialogs per kind (N) · after 1
Settings: title page fields (title, author, contact, date). `sections.ts` driven by `kindProfile` (hide Export/Import for non-book). New project dialog: kind cards first (Book / Screenplay / Game script) with the note that the kind cannot be changed later, then title, author, language. Game Write empty state component. EN/PL (**T**).

### 7. Shared features on script blocks (H) · tests first, after 2
`docToText`, word count, search index, mentions, spellcheck decorations and snapshot partial restore handle the new block types. Tests: text extraction of dialogue/action, word count, search finds a line of dialogue, an event link and a rule link survive Enter-splitting a block, margin comment on a dialogue range, snapshot restore keeps typed blocks and ids.

### 8. Verify, screenshots, spec (N)
Browser run: create each kind, type a short scene with Enter/Tab and autocomplete, scene numbers across items, title page, game empty state, Polish UI, dark theme; keyboard-only pass (a11y template scan and contrast tests extended to new components/tokens). Screenshots into an "S1" section of the "Storyworks Screens" Artifact; tick script-spec lines, add decisions; update memory.

## Order
1 → (2 ∥ 5) → (3 ∥ 4 ∥ 6) → 7 → 8. Steps 1, 2, 5, 7 are the hard ones: tests first, I review before accepting.

## Done when (S1)
A screenplay is written with Enter/Tab, closed and reopened with all elements and ids intact; cues and locations autocomplete from the codex; scene numbers appear in tree and margin; block ids of untouched blocks are unchanged after edits; a Game project can be created and opens to its placeholder; Book projects behave exactly as before; all tests green.
