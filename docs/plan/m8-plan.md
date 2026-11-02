# M8 · Implementation plan: Export

Scope: [milestones.md](milestones.md#m8--export). Spec: Export (PDF / DOCX), Edge cases (export), acceptance lines for DOCX/PDF export, alignment, page numbers, appendices, pluggable exporters.
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** M7 committed (cca3a10). Done.

## What already exists
- Scene content is ProseMirror JSON (`project/schemas/scene.ts`). Nodes/marks come from `editor/kinds.ts`: heading 1–3, paragraph, blockquote, bullet/ordered list, `sceneBreak`, `footnote` (inline atom with its own text), `image` (`src` = `assets/<id>.<ext>`), marks bold/italic/underline/`comment`; `textAlign` attr on paragraph/heading/blockquote. Block `id` attrs and event links are app-only.
- `ProjectIO.readBytes` for assets; `fileIO.ts` / `pickFolder.ts` / `pickImage.ts` show the Tauri-vs-browser split. `dialog:default` and `fs:allow-write-file` are already granted.
- Codex: `appendixText`, `includeInAppendices`, `aliases`, types; `codex/appearsIn.ts` (where an entry is linked). Timelines + `timeline/order.ts` `compare` for chronology.
- Manifest has `title`, `author`, `language`; no export settings yet. `sections.ts` has no Export entry (spec lists it in the nav).
- Neither `docx` nor `pdfmake` is a dependency yet.

## Decisions (record in spec "Decisions" once confirmed)
- **Export is its own page** (`ExportView.vue`, route `export`, neutral bottom nav item like Stats/History so no new colour token). Form on the left, live summary (chapters, word count, warnings) on the right; "Export" opens Save-as, writes bytes, shows success with "Show in folder".
- **Fonts: two families, "Serif" and "Sans".** DOCX uses Times New Roman / Arial; PDF embeds metric-compatible Tinos / Arimo (Apache-2.0, cover Polish diacritics), so line breaks match across formats. Lazy-loaded with pdfmake so the editor bundle does not grow.
- **PDF footnotes:** pdfmake has no native footnotes → numbered notes at the end of each chapter (spec fallback). Confirmed or overturned by the spike (step 1). DOCX uses native footnotes.
- **Last-used options are saved per book** in the manifest (`exportSettings`, manifest v10 → v11 + migration + test). Chapter selection is *not* saved (default: whole book).
- **Warnings, not failures:** missing image → placeholder box with the file name + a warning list shown after export; unreadable scene file → export blocked with the error.
- **Export blocked** when nothing is selected (button disabled, reason shown).
- **Model is pure data:** `buildExportModel(project, options)` takes already-loaded scenes/codex/timelines, no I/O, so it is testable without Tauri.
- **Browser version:** Save-as becomes a download (Blob); "Show in folder" only in the Tauri window (needs `tauri-plugin-opener` → small Rust + capability change; the only non-frontend change in M8).

## Steps

### 1. Spike: library check (H) · me
Throwaway script in the scratchpad: pdfmake with embedded Tinos/Arimo, TOC with page numbers, justified text, header/footer, an image, Polish characters, a long chapter note list; `docx` with native footnotes, TOC field, page numbers, alignment. Open results in LibreOffice/a PDF reader. Outcome decides PDF footnotes and font list; record both in the spec "Decisions" and replace the matching Open question. Blocks steps 3–4.

### 2. Export model and registry (H) · tests first
- `src/export/model.ts`: `ExportDoc` = `{meta, options, chapters[{title, blocks[]}], appendices[], warnings[]}`; blocks: heading(level), paragraph, quote, list(ordered, items), sceneBreak, image(bytes|missing); inline runs with bold/italic/underline, footnote refs; `align` per block.
- `src/export/build.ts` `buildExportModel`: ProseMirror → model for the selected chapters in manifest order; strips comment marks, block ids, event links; footnotes numbered per chapter; empty trailing paragraph dropped; unknown node types skipped with a warning (never crash).
- `src/export/registry.ts`: `registerExporter({id, labelKey, extension, mime, kinds, export(doc): Promise<Uint8Array>})`, `exportersFor(kind)`. The dropdown reads only this.
- Tests: each mapping (heading/list/quote/align/scene break/footnote numbering/image), comments and ids absent, chapter subset and order, missing image → placeholder + warning, nothing selected → error, unknown node → warning, registering a fake exporter makes it appear for `book` and not for another kind.

### 3. Appendices (N) · tests first, parallel with 4
`src/export/appendices.ts`: Dramatis personae (chosen types, default Character; only `includeInAppendices`; name, aliases, appendix text, first appearance = first *exported* scene linked to the entry, none if not linked), Glossary (other chosen types, same rule), Chronology (one timeline's nodes sorted with `compare`; undated nodes last, listed with "—"). Private notes never read. Tests: opt-out entry absent, notes absent, first appearance respects chapter selection, chronology order dated/path/unknown, empty appendix omitted.

### 4. Exporters (H) · parallel with 3, after 1–2
- **4a `docx` exporter:** title page, TOC field, headings, lists, quotes, alignment, scene breaks, images, native footnotes, page numbers, optional running header, page size/margins/font/size/line spacing.
- **4b `pdfmake` exporter:** same features; end-of-chapter notes; TOC with page numbers; embedded fonts; lazy import.
- Tests (small, no rendering): output is non-empty bytes with the right signature (`%PDF` / zip with `word/document.xml`); document text contains selected chapter titles and not unselected ones; page-number and header toggles change the output; footnote text present. Visual correctness is checked by hand (step 7).

### 5. Manifest `exportSettings` (N) · parallel
Schema field (page size A4/A5/Letter, margins mm, font family, font size, line spacing, title page, TOC, page numbers=true, running header none/book/chapter, appendix toggles and chosen types, chronology timeline id), v10 → v11 migration, migration test (valid loads, malformed rejected untouched). Store getter/setter.

### 6. UI (N) · after 2, 5; 4 can finish later behind the registry
- `ExportView.vue`: format dropdown from registry, chapter tree with checkboxes (whole book default, select all/none), title page / TOC / page-setup / furniture / appendix sections, summary + warnings, Export button (disabled with reason when nothing selected).
- `src/export/saveFile.ts`: Tauri save dialog + `writeFile`, browser download fallback; failure shows a clear message and leaves no partial file.
- Sidebar item in `sections.ts` + route + i18n EN + PL (plain words). **T:** strings, icon, route.

### 7. Review and publish (T)
Run the app (browser version), export the sample book to both formats, open in LibreOffice and a PDF reader, check: only selected chapters, formatting, alignment, footnotes, image + missing-image placeholder, page numbers on/off, running header, TOC, appendices with no private notes, no comments. Screenshot: Export page (default, options expanded, nothing selected, success + warnings), plus one image of each output. Publish to the existing Artifact; update spec "Decisions", the Open question, and the memory note. Real-window check: Save-as + "Show in folder".

## Order
1 → 2 → (3 ∥ 4a ∥ 4b ∥ 5) → 6 → 7. I review 1, 2 and 4 before accepting.

## Done when
Milestone "Done when" holds: sample content exports to DOCX and PDF that open in Word/LibreOffice and a PDF reader with exactly the selected chapters and correct formatting; export with nothing selected is blocked; appendices contain only opted-in appendix text; comments absent; missing images warn; tests pass; screenshots published.

## To confirm before starting
1. Export as a bottom-nav page (proposed) vs. a dialog from the Write view.
2. Two font families (Serif/Sans) with bundled Tinos/Arimo vs. a longer font list.
3. Saving export options per book in the manifest (adds v11).
4. Adding `tauri-plugin-opener` for "Show in folder".
