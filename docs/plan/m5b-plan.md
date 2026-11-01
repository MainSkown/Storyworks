# M5b · Implementation plan: Codex

Scope: [milestones.md](milestones.md#m5--rules-and-codex) (codex half). Spec: Codex, UI design (type tags, gutter markers), Behavior details (dangling links), Edge cases (deleting entries/types).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** M5a done (reuses its store patterns, trash, rule picker, manifest v5).

## What already exists
- Manifest `codexTypes`, `codexEntries`, `ignoredFindings` refs; node `codexIds`; scene `povId` (string, unresolved); asset import (`assets.ts`, `pickImage.ts`); link index with block map; `eventLinks` editor extension, `NodePickerDialog`, `useJump`; timeline filter module (`filter.ts`).

## Decisions (record in spec "Decisions")
- **Files:** `codex/<id>.json` per entry (item v1: `typeId, name, aliases, image, notes, tags, ruleIds, appendixText, includeInAppendices`), `codex/types/<id>.json` per type (`name, color, icon`). Order = manifest order.
- **Link storage (user):** entry→rule on the **entry** (`ruleIds`); node↔entry on the **node** (`codexIds`); paragraph→entry in the **scene** as `kind: 'codex'` link (`from` block, `to.item` = entry id). Back-links are computed by scan, never duplicated.
- **Starter types** (Character, Item, Place, Country, Town, Building) seeded on open when no types exist and no entries exist.
- **Type delete:** must reassign its entries to another type; last type cannot be deleted.
- **Entry delete → trash:** manifest **v5 → v6** (enum gains `'entry'`). Links to it (scene `codex` links, node `codexIds`, other entries' references later) stay and show broken; restore un-breaks.
- **POV:** scene `povId` resolves to **any** entry (types are renamable, so no hard "Character" rule); Character-named type listed first. Missing/trashed POV shows as broken.
- **Gutter marker (user):** plum circle for codex links; shape + `aria-label`, not colour alone. Block link action becomes one **"Link to…" picker with tabs: Events / Codex** (Rules tab not added; see M5a).
- **Mentions:** whole-word, case-insensitive match of name or alias, Unicode-aware (`\p{L}\p{N}` lookarounds, not `\b`, so Polish letters work); no stemming. Per block: skipped if already linked to that entry or ignored. Ignored mentions go to the ignored-findings file (minimal schema `{version, ignored: [{id}]}`, id `mention:<entryId>:<blockId>`); M7 reuses the file. "Link all" is one undoable batch.
- **Aliases:** duplicates inside one entry rejected; cross-entry collisions are an M7 check, not blocked here.
- **Appendix fields** stored now (`appendixText`, checkbox default off), used by M8.
- **Not in M5:** chronicle tab, relationships, groups, states, knowledge (M6).

## Steps

### 1. Tests first (N; H marked) · parallel
- Entry/type schemas valid/invalid, file untouched; manifest v5→v6 migration; type seeding idempotent.
- **Mentions (H):** name and alias hits, whole-word only ("Ann" not in "Anna"), case-insensitive, Polish diacritics, multiple hits one block, already-linked skipped, ignored skipped, entry with empty name skipped, regex-special chars in names escaped, stable finding id.
- Type delete reassignment; last type refused; entry delete/restore (same id/position); invalid file refused.
- Scene `codex` link: added, unique per (block, entry), broken when entry trashed/missing, repaired on restore; re-home (M4) handles `codex` kind too.
- Codex search/filter: type, tag, query across name + aliases + tags + notes text.
- Timeline filter by linked codex entry (nodes whose `codexIds` include entry); missing entry id ignored.
- Used-in / back-link scans: nodes, blocks, rules.

### 2. Schemas + migration + seeding (N) · after 1
`codexEntry.ts`, `codexType.ts`, `ignored.ts`, manifest v6.

### 3. Codex store + trash (N) · after 2
Pinia store modelled on rules store; entry/type CRUD; `trashEntryImpl` / `restoreEntryImpl`; image via asset import (copied into `assets/`, path stored); Trash dialog row.

### 4. Link model for `codex` kind (H) · after 2
Generalise M4 `links.ts`/`resolveTarget`/`findRehomes`/`coverage` for target kinds without changing event behaviour (M4 tests must stay green). Reviewed before UI builds on it.

### 5. Mentions finder (H) · after 1, 4
Pure `findMentions(entry, scenes, links, ignored)`; incremental per scene on save; link / link-all / ignore actions write scene links and ignored file.

### 6. Codex view (N) · after 3
`CodexView.vue`: list grouped by type (search incl. aliases, filter by type/tag), entry editor (name, type, image, aliases chips, tags, notes rich text, appendix section), plum styling. Invalid-file row; read-only mode.

### 7. Types manager (T/N) · parallel with 6
Add, rename, recolour, icon pick, delete-with-reassign.

### 8. Entry links UI (N) · after 4, 6
Entry page tabs: **Links** (nodes with Jump, rules via rule picker with Remove, blocks "Appears in" in reading order with Jump) and **Mentions** (scene, highlighted snippet, Link / Not this one / Link all). Node inspector "Codex" section (picker, chips, missing-entry chip). Rule page "Used by entries".

### 9. Editor: tabbed "Link to…" + plum markers (H) · after 4
`NodePickerDialog` gains Events / Codex tabs; `eventLinks` decorations/overlay/popover handle both kinds (orange diamond, plum circle, red triangle when broken); command, toolbar, menu, shortcut text updated. Existing M4 tests stay green.

### 10. POV picker + timeline filter + context panel (N) · after 3, 8
ScenePropertiesPanel POV select (entry picker, clear, broken state); tree/corkboard show POV name. Timeline filter "Linked codex entry". Panel sections: `write.inThisScene` (entries linked or mentioned in the open scene), `timelines.linked` gains entries (plum "Character"/type tags), `codex.links`.

### 11. Delete confirms + i18n (N/T) · after 8
Entry delete confirm lists link counts; type delete reassign dialog. en + pl strings.

### 12. Long-book check (N) · after 5
Hundreds of scenes × hundreds of entries: mention scan time and memory, popover/overlay cost. Cache by scene hash or move to idle chunks only if slow.

### 13. Verify and review (N)
Typecheck, lint, full tests. `run` skill (browser build): the spec flow — create entry with alias, find it as an unlinked mention, link in one click, bulk link, "Not this one", link entry to node and paragraph, delete entry (broken markers) then restore, custom type "Faction", POV, timeline filter; Light + Dark, keyboard path. Screenshots → M5b section in `docs/review/review.json`, rebuild, update the "Storyworks Screens" Artifact. Real-window check asked of the user: entry/type files, image copied to `assets/`, ignored-findings file, manifest v6. I review the link generalisation, mentions and trash before accepting.

## Order
`1` → `2` → `3 ‖ 4` → `5 ‖ 6 ‖ 7 ‖ 9` → `8` → `10` → `11` → `12` → `13`.

## Risks
- Generalising M4 link code regresses events → step 4 keeps event tests untouched and green.
- Mention scan slow on long books → incremental per scene; measured in step 12.
- Image paths broken by moved projects → store relative `assets/` paths only.
