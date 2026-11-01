# M5a · Implementation plan: Rules

Scope: [milestones.md](milestones.md#m5--rules-and-codex) (rules half). Spec: Rules page, Behavior details (dangling links), Edge cases (links, invalid files), UI design (type tags).
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** M4 committed (real-window check may still be pending).

## What already exists
- Manifest has `rules` and `ruleCategories` refs (empty), `trash` entries with `type` enum, node trash precedent (`trashNodeImpl`), `ensureDefaults` pattern for first-open data.
- Timeline node schema already has `ruleIds`. Link index (`links.ts`) with `isLive`.
- Router/sidebar: `rules` route is `SectionPlaceholder`; section colour green.
- Rich-text mini editor used for node description (reuse for description + exceptions).

## Decisions (record in spec "Decisions")
- **Rules are a reference tool (user):** links are optional and light. No heavy link UI for rules.
- **Links in M5a:** node↔rule only, stored on the node (`ruleIds`, field exists). Rule page lists "Used in" (nodes) by scan. Paragraph→rule links are **dropped from M5a** (the M5 "Done when" line about a paragraph is changed to: rule linked to a node shows on both). Revisit as step 9 if wanted.
- **Rule↔codex entry** is stored on the entry (user decision) → built in M5b.
- **Files:** one file per rule (`rules/<id>.json`, item v1: `title, categoryId, description, tags, exceptions`) and per category (`rules/categories/<id>.json`: `name, color`). Order = manifest order.
- **Defaults:** categories Magic, Physics, Society, Technology, Religion created on open only when the book has no categories **and** no rules (so deleting them all later on a book with rules does not bring them back).
- **Category delete:** must pick another category for its rules (reassign), then the category file is removed (no trash). Last category cannot be deleted.
- **Rule delete → trash:** manifest **v4 → v5** (enum gains `'rule'`), file moved to `.storyworks/trash/<id>/`; restore returns same id and manifest position. Links (node `ruleIds`) are left alone and show "missing rule" until restore.
- **Search/filter:** pure `filterRules(rules, {categoryId, tags, query})`; query matches title, tags, plain text of description and exceptions, case-insensitive.
- **Invalid rule file:** listed as "invalid file" with field error, left untouched, not editable.
- **Read-only (newer version / external lock):** view only.

## Steps

### 1. Tests first (N; H none) · parallel
- Rule/category schemas: valid loads; malformed rejected, file untouched; stable key order on write.
- Manifest v4→v5 migration keeps trash entries; newer version read-only (extends `migrations.test.ts` pattern).
- Defaults seeding: empty book gets 5 categories once; book with existing categories untouched; idempotent.
- `filterRules`: category, tag, query (title / tags / body text), combined, empty result.
- Category delete: reassignment moves rules; refused for last category; refused without target when it has rules.
- Rule trash/restore: file moved, manifest entry written, restore same id/position; refused when file invalid.
- Used-in scan: nodes listing the rule; missing/trashed rule → broken id list.

### 2. Schemas + migration + defaults (N) · after 1
`rule.ts`, `ruleCategory.ts`, manifest v5 + migration, `seedRuleCategories` on open.

### 3. Rules store + persistence (N) · after 2
Pinia store: load (invalid files collected), create/update/delete/restore rule, category CRUD with reassignment, atomic autosave via existing path; trash wiring (`trashRuleImpl` / `restoreRuleImpl` modelled on node trash), Trash dialog row "Rule · <title>".

### 4. Rules view (N) · after 3
`RulesView.vue` replaces placeholder: left list grouped by category (filter chips for category + tag, search box); right editor (title, category select, tags input, description, exceptions). Empty states, invalid-file row, read-only mode. Green section styling.

### 5. Category manager dialog (T/N) · parallel with 4
Add, rename, recolour, delete-with-reassign.

### 6. Node ↔ rule link (N) · after 3
NodeInspector "Rules" section: add via searchable rule picker (category headers), chips with Open / Remove; missing rule → brick-red chip "missing rule" with Remove. Rule editor "Used in" list (node title, timeline, Jump via `useJump.toNode`). Context panel: `timelines.linked` shows linked rules (green "Rule" tag cards); new `rules.usedIn` section for the selected rule.

### 7. Delete confirms + trash (N) · after 3, 6
Rule delete confirm with node count ("links will show as missing until restored"). Category delete confirm.

### 8. i18n en + pl (T) · after 4–7
All new strings, plural rules for counts.

### 9. Optional: paragraph → rule link (N) · only if you want it
Not planned. Would reuse the M4 picker with a Rules tab and scene links `kind: 'rule'` (green marker already defined in spec).

### 10. Verify and review (N)
Typecheck, lint, full tests. `run` skill (browser build): create rule, filter/search, change category, delete category with reassign, link rule to a node, jump from rule to node, delete rule → node shows "missing rule", restore → fixed; Light + Dark, keyboard path in list. Screenshots → M5a section in `docs/review/review.json`, rebuild, update existing "Storyworks Screens" Artifact. Real-window check asked of the user: rule and category files, manifest v5, trash folder. I review store, trash/restore and migration before accepting.

## Order
`1` → `2` → `3` → `4 ‖ 5 ‖ 6` → `7` → `8` → `10`.

## Risks
- Default-category reseeding surprising the user after they delete all → seed only when no categories **and** no rules.
- Rich-text editor reuse pulling timeline-specific code → extract a small shared component if needed.
