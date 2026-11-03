# S2 · Implementation plan: screenplay export, Fountain, page count

Scope: [milestones.md](milestones.md#s2--screenplay-export-fountain-and-page-count). Spec: [script spec](../features/script-writing.md) (Export / import, Screenplay: editor, Behavior details, Edge cases).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** S1 committed (still uncommitted). Needs S1 and M8: both built.

## What already exists
- Export: `src/export/` has a book-shaped `ExportDoc`, `registry.ts` (`Exporter.export(doc: ExportDoc)`, `kinds`), `pdf.ts` (pdfmake, lazy fonts), `docx.ts`, `prepare.ts`, `saveFile.ts`, `ExportView.vue` (calls `exportersFor('book')`). Fonts bundled: Liberation Serif/Sans (no mono). Manifest `exportSettings` is v11.
- `kindProfile('screenplay')`: `hiddenSections: ['export']`, `hasImport: false` — flipped here.
- S1: six element block types with ids, `rules.ts`, `sceneNumbers.ts` (derived numbers), store `sceneMeta` per scene (headingIds, word counts), `titlePage {contact,date}`, extension in `src/editor/screenplay/extension.ts`.
- Import: `src/import/` (parse → plan → apply, automatic backup first, `ImportDialog.vue`), Markdown/Word, book-only.

## Decisions (user-confirmed; record in the script spec "Decisions")
- Keep page count **and** runtime (1 page ≈ 1 minute) in the status bar and Stats.
- **Fountain paste** converts to elements in the editor, besides file import.
- **Sequences round-trip as Fountain sections:** export writes `# Sequence title`; import turns `#` lines into Sequences and each scene heading starts a new scene item. (Overrides the spec line "sections skipped"; update the spec.)
- **Export stays on the Export page**, un-hidden for screenplays: formats PDF, DOCX, Fountain; options page size, title page, scene numbers, page numbers, (MORE)/(CONT'D), sequence selection. Book-only options (TOC, fonts, appendices, running header) hidden.

## Defaults I will use unless you object
- **Own pagination, not pdfmake's.** Monospace makes layout deterministic: a pure paginator (`src/editor/screenplay/layout.ts`) wraps each element to its character width, applies the page rules and returns pages of lines. The PDF draws exactly those pages, so **page count = PDF pages by construction** and the status bar uses the same function.
- Standard layout: Courier-metric font (bundle **Liberation Mono**, same licence as the existing fonts), 12 pt, 6 lines/inch. Letter default, A4 option. Margins left 1.5", right 1", top/bottom 1". Indents from the left margin: action/heading 0, dialogue 1.0", parenthetical 1.5", character 2.0", transition right-aligned. Line counts per page size are constants in `layout.ts`.
- Page rules: no scene heading as the last line of a page; a character cue keeps at least 2 lines of its speech; long dialogue splits at a sentence end, with `(MORE)` under it and `NAME (CONT'D)` on the next page; action splits by line (widow/orphan 2). Labels per language (PL: `(DALEJ)` / `(CD.)`).
- Page numbers top-right from page 2 (`2.`), page 1 unnumbered; scene numbers in both margins. Title page (title, "Written by", author centred; contact bottom-left, date bottom-right) is not counted.
- Cues, headings and transitions are uppercased on export (stored text is as typed). Comments, private notes and event/rule links are stripped. No appendices.
- **DOCX** uses paragraph styles per element with the same indents; Word paginates itself, so its page count can differ from the PDF by a little (noted in the spec).
- **Fountain export:** forced syntax (`.`, `@`, `!`, `>`) only where plain text would be misread; scene numbers are not written (derived). **Import** maps the six elements one-to-one; title-page keys, dual dialogue, notes `[[ ]]`, boneyard, synopses `=`, centred text, page breaks and `#n#` scene numbers are skipped and listed in one message. A file with no scene headings becomes one scene of action blocks, with a message. Import goes through the existing Import dialog (placement, preview, backup first), accepting `.fountain` and `.txt` for screenplays.
- Paste: text is converted only when it contains a scene heading or a cue followed by dialogue; a plain line stays an action block (S1 behaviour).
- Page count in the status bar and Stats is computed from a compact per-scene element list kept in the store index, debounced; Stats shows `Pages` and `≈ N min`.
- Manifest **v14** adds `scriptExportSettings` (page size, title page, scene numbers, page numbers, more/cont'd); migration + test.

## Steps

### 0. Spike (H) · me, blocks 3 — **DONE, works** (absolute lines, margins 0, computed x for right/centre; result in the script spec)
Scratchpad script: pdfmake with Liberation Mono, one absolutely laid-out page per layout page, fixed 12 pt leading, scene numbers in both margins, page number header, Polish characters, a dialogue split with `(MORE)`/`(CONT'D)`. Check: PDF page count equals the layout, no overflow onto an extra page, text selectable. `docx` paragraph styles with indents. Open both in a PDF reader and LibreOffice. Record result and any fallback in the script spec (replaces the pdfmake Open question).

### 1. Layout and paginator (H) · tests first — **DONE** (layout.ts, 25 tests)
`layout.ts`: `ELEMENT_LAYOUT` (indent, width, blank lines before), `wrapLines(text, width)` (word wrap, long word hard-split), `paginate(scenes, opts) → Page[]` with the rules above. Tests: wrap widths, heading never last on a page, cue keeps 2 lines, dialogue split inserts `(MORE)` and `(CONT'D)` with the same speaker, action widow/orphan, blank line collapsing at page top, empty script = 0 pages, same input gives same pages, 120 pages stay fast.

### 2. Script export model, registry, manifest v14 (H) · tests first — **DONE**
- `ScriptDoc` (title page, scenes of elements with scene numbers, warnings) built from the project by `buildScriptDoc` (strips marks/ids/links, uppercases, drops empty blocks, honours sequence selection). Registry gets a `model: 'book' | 'script'` field so `Exporter` types stay honest; `exportersFor('screenplay')` returns the three script exporters.
- Manifest v14, `kinds.ts` un-hides Export and enables import for screenplay.
- Tests: element mapping, comments/links absent, selection and order, trashed scenes skipped, uppercase rules, v13→v14 round trip, malformed rejected and untouched, book unaffected, registry lists exporters per kind.

### 3. Exporters · parallel, after 0–2 — **DONE** (pdfScript, docxScript, fountain, import/fountain, round trip)
- **3a PDF (H) — DONE (pdfScript.ts, fonts bundled, visually checked):** `pdfScript.ts` draws the pages from `paginate`; mono font loader; title page; lazy import. Tests: `%PDF` signature, page count equals `paginate` count (+1 with title page), (MORE)/(CONT'D) text present, selected sequences only.
- **3b DOCX (N):** element styles, title page, page-number header, scene numbers off/on. Tests: zip has `word/document.xml`, styles exist, text of selected scenes.
- **3c Fountain serializer (H) · tests first:** each element, forced syntax cases (lowercase cue, heading without INT/EXT, transition not ending in TO:, action starting with `!`/`@`), sections per sequence, blank-line rules, Polish text.
- **3d Fountain parser (H) · tests first:** each rule above, skipped-construct list, no headings, `#` sections → sequences, CRLF/BOM, empty file, garbage rejected without partial result.
- **Round trip test (H):** serialize → parse → same element types and texts for a sample script with tricky text (this is the milestone "done when").

### 4. Page count and runtime (N) · after 1 — **DONE** (pageStats.ts, store.pageStats, status bar, Stats card)
Store keeps a compact element list per scene next to `headingIds` (updated on edit/open); `pageStats` computed debounced; status bar and Stats show pages and `≈ min` (EN/PL, **T** strings). Tests: count changes when dialogue is added, equals `paginate` of the exported doc, 1500 scenes recompute without blocking.

### 5. Export page for screenplays (N) · after 2, parallel with 3 — **DONE** (ScriptExportView)
`ExportView.vue` takes the kind from the profile: format list from the registry, script option form, sequence checkboxes, summary shows scenes, pages and warnings. `saveFile.ts` unchanged. EN/PL (**T**). Tests only for option defaults and the "nothing selected" block, which already exist for books.

### 6. Fountain import and paste (N/H) · after 3d — **DONE** (ImportDialog fountain mode, pasteFountain)
- Import dialog accepts `.fountain` for screenplay projects, previews sequences/scenes and the skipped list, then applies via the existing placement + backup path (extend `plan`/`apply` for typed element blocks with new block ids).
- Paste: clipboard text parser in the screenplay extension using 3d; tests for the detection heuristic (plain line stays action, heading/cue+dialogue converts) and block ids being fresh.

### 7. Verify, screenshots, spec (N) — **DONE** (scripts/screenshots-s2.mjs; Artifact S2 section)
Browser run: export the sample screenplay to PDF, DOCX and Fountain; open PDF and DOCX in a viewer; import the Fountain into a new screenplay project; paste a Fountain snippet; status bar and Stats; Polish UI; dark theme; keyboard-only pass (a11y template scan extended). Screenshots into an "S2" section of the "Storyworks Screens" Artifact plus an image of each output; tick script-spec lines, record the pdfmake result and decisions; update milestones, memory. Real-window check: Save-as.

## Order
0 → 1 → 2 → (3a ∥ 3b ∥ 3c ∥ 3d ∥ 4 ∥ 5) → 6 → 7. Steps 0, 1, 2, 3a, 3c, 3d and the round trip are the hard ones: tests first, I review before accepting.

## Done when (S2)
Exported PDF and DOCX open with the standard layout; Fountain export then import reproduces the same elements; status-bar page count equals the PDF page count; all tests green.

## Risks
- pdfmake may add a stray page or shift lines; the spike decides whether we draw with absolute positions (planned) or fall back to jsPDF-style raw drawing.
- Word's pagination differs from the PDF's; only the PDF is exact.
- Fountain edge cases (all-caps action lines, lowercase cues) can misparse; the skipped/forced-syntax lists make those visible rather than silent.
