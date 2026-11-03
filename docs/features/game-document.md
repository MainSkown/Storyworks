# Game document (S6)

## Summary
Game projects get a **Game document** section: a place to write down the game's design next to its dialogue. It has an Overview page, structured Mechanics entries and a Glossary. The project kind is renamed from "Game script" to "Game". Extends [script-writing.md](script-writing.md); the old S6 (script checks and game export) becomes S7.

## Goals
- Write down how the game plays (mechanics, tunable numbers, status) in the same project as the story.
- Connect mechanics to the things they use: variables, conversations, scripts, story-map items, codex entries, other mechanics.
- Keep one app, one project format, shared tools (snapshots, trash, search, autosave).

## Non-goals
- Free-form extra pages, design to-do list, glossary-term highlighting in text (after v1).
- Running or simulating mechanics; parameters are plain text, not engine data.
- Changing the Rules page or merging it with Mechanics.
- Any change to Book or Screenplay projects.

## Changes

### Project / platform
- [x] Project kind label "Game script" → "Game" (en) / "Gra" (pl) in the new-project dialog, welcome screen and everywhere else it is shown. Stored kind value `game` is unchanged.
- [x] Manifest v17 → v18 (adds the game-document file list and mechanic categories reference); migration plus migration test; older projects open with an empty document and the default categories.
- [x] New schemas (Zod, versioned): Overview, Mechanic, Mechanic category, Glossary. Malformed file is rejected and left untouched, like other files.

### UI / navigation
- [x] New game-only sidebar section "Game document", after Story map and before Timelines. Own colour token in both themes (AA contrast; follows the token naming pattern so the contrast test covers it) and own context-panel sections.
- [x] Three tabs in the section: Overview, Mechanics, Glossary.
- [x] Context panel (Write items): "Mechanics" section listing the mechanics linked to the open conversation or script, each opens the mechanic.
- [x] Variables panel: each variable shows the mechanics that use it.
- [x] Codex entry panel: shows mechanics linking to the entry.
- [x] All new strings in English and Polish via vue-i18n.

### Overview
- [x] One rich-text page (TipTap, same editor features as Text items: bold, italic, lists, quotes, headings, margin comments).
- [x] A new game project starts with the headings Pitch, Pillars, Audience, Core loop (user can edit or delete them). Existing game projects opened after migration get the same starter page.

### Mechanics
- [x] Mechanics list: filter by category, status and tag; text search; sorted by manifest order (user can reorder).
- [x] Mechanic fields: title, summary (one line, shown in the list), category, status (Idea / Designed / Implemented / Cut), tags, rich-text description, parameters table (rows of name + value, both plain text).
- [x] Default categories: Core loop, Combat, Economy, Progression, Exploration, Interface. Add, rename, delete with reassignment (same flow as Rules categories).
- [x] Create, rename, reorder, delete (to trash, restorable) mechanics.
- [x] Links from a mechanic to: variables, conversations and scripts and story-map items (by stable ID), codex entries, other mechanics. Add and remove in the mechanic's side panel; the mechanic shows its links with current names.
- [x] Reverse links shown on the target (variable list, item context panel, codex entry, linked mechanic as "Related").
- [x] Broken-link rule: a link to a deleted or trashed target shows as broken and is repaired when the target is restored.

### Glossary
- [x] Entry = term + definition (plain or short rich text, one decision: plain text). Sorted A–Z by term, searchable, add / edit / delete with a confirm (entries live in one file, so no per-entry trash; snapshots cover recovery).

### Other
- [x] Snapshots, trash, autosave, external-change detection, lock file, Search (finds Overview text, mechanics, glossary entries) work on the new files unchanged.
- [x] Stats: word counts include the game document in a separate "Game document" line, not mixed with dialogue words.
- [x] Milestones: add S6 here; old S6 becomes S7 and gains the items under "Handed to S7".

## Handed to S7 (old S6)
- [ ] Checks: broken mechanic links; mechanic with status Implemented and no links; variable used by no mechanic and no line (info level). Same finding shape, stable IDs, per-check on/off.
- [ ] Game JSON export includes Overview, glossary, categories and mechanics (parameters and links).
- [ ] Readable export of the whole game document (Overview, Mechanics grouped by category, Glossary) to PDF, DOCX and Markdown.

## Behavior details
- Files: one file per mechanic (like Rules), one file for Overview, one for Glossary, one for categories; `project.json` lists them and holds the order.
- Status chip colours must not rely on colour alone (text label always shown).
- Parameters keep the typed text as is; no unit parsing, no check that numbers are numbers.
- Deleting a category with mechanics requires choosing a target category (as for Rules).
- Rules page stays unchanged in game projects: Rules = how the story world works, Mechanics = how the game plays.

## Edge cases
- Empty Mechanics list → empty state with "Add mechanic" and a hint about categories.
- Overview file deleted outside the app → external-change handling as for other files; never auto-repaired.
- Invalid mechanic file → listed as "invalid file", others still load.
- Link to a variable that is later deleted → broken link on the mechanic, no data loss.
- Opening a v17 game project in the new app → migration offered/applied like earlier migrations; opening a v18 project in an older app → read-only.
- Duplicate glossary terms → allowed, shown both (no check in v1).

## Acceptance criteria
- Creating a game project shows "Game" in the dialog and a "Game document" section with the starter Overview.
- A mechanic with category, status, tags, description, parameters and links survives close and reopen unchanged.
- A mechanic linked to a variable appears in that variable's "used by"; deleting the variable shows the link broken (variables have no trash, so the link stays broken until removed). For items, beats and codex entries, restoring repairs it.
- Renaming a conversation updates its name on every mechanic that links to it.
- Filter by status "Implemented" and category "Combat" shows only matching mechanics.
- Deleting a category forces reassignment; no mechanic is left without a category.
- Search finds text from Overview, a mechanic and a glossary term.
- A v17 game project migrates to v18 and opens; a malformed mechanic file is rejected and left untouched.
- Section has AA contrast in both themes; everything works with keyboard only.

## Decisions
- **Section, not Write-tree item** (user): keeps dialogue and design separate; own colour token and context panel like Story map.
- **Structured mechanics + rich text** (user), not free-form pages.
- **Rules page kept** next to Mechanics (user): different meaning (world vs gameplay).
- **Overview + Glossary** included (user); free pages and design to-dos not chosen.
- **Mechanic fields** (user): status, parameters table, summary line; no separate limitations field.
- **Link targets** (user): variables, conversations/scripts/story-map items, codex entries, other mechanics.
- **Default categories** (user): Core loop, Combat, Economy, Progression, Exploration, Interface.
- **Kind renamed to "Game"** (user); stored value stays `game`.
- **S7 scope** (user): checks, game JSON, and readable PDF/DOCX/Markdown export of the document.
- **Assumptions (mine, from playback):** one file per mechanic; Overview and Glossary one file each; glossary definitions plain text; section placed after Story map.

## Built differently from the first draft
- Glossary delete = confirm and remove (no trash). Variable links are not repaired by restore (variables have no trash).
- The Game document word count shows in the section header only; it is not added to Stats totals or the daily goal.
- Known gaps: opening a variable from a mechanic only opens the Variables panel (no highlight); after editing a glossary entry focus is not returned to its Edit button.

## Open questions
- Reorder: manual order only, or also sort by category/status in the list? (assumed: manual order, list filters only)
- Do mechanics appear on the story map (as a box type)? Assumed no.

## Relevant code
- Pattern to copy: Rules — `src/rules/store.ts`, `src/project/rules.ts`, `src/project/schemas/rule.ts`, `src/project/schemas/ruleCategory.ts`, Rules view in `src/views`.
- Section registry and colour: `src/sections.ts`, `src/panelSections.ts`, `src/styles/tokens.css`, `src/styles/tokens.contrast.test.ts`.
- Manifest and migrations: `src/project/schemas/manifest.ts` (MANIFEST_VERSION 17), `src/project/migrations.ts`, `src/project/migrationV17.test.ts` as template.
- Links and trash: `src/project/links.ts`, `src/project/linkProblems.ts`, `src/project/deleteImpact.ts`, `src/game/inboundLinks.ts`, `src/game/crossLinks.ts`.
- Variables: `src/variables/store.ts`, `src/game/variableUses.ts`.
- Kind labels: `src/locales/en.json` and `pl.json` (key near line 393), `src/project/kinds.ts`.
- Text editor for Overview: the Text item editor from S3.
