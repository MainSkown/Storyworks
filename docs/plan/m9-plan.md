# M9 · Implementation plan: Snapshots, history and backups

Scope: [milestones.md](milestones.md#m9--snapshots-history-and-backups). Spec: Snapshots / version history, Edge cases (snapshots), snapshot acceptance lines.
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** M8 committed (f98e29b). Done.

## What already exists
- `ProjectIO` (tauri/browser/memory impls), `copyTree`, pre-migration backup in `migrations.ts` (`.storyworks/backups/pre-migration-v*`), trash in `.storyworks/trash`, lock + `process_id`/`machine_name` Rust commands (`src-tauri/src/lock.rs`), change watcher.
- Manifest already has `snapshots: '.storyworks/history.git'` (index entry). No `git2` dependency, no History view (`history` section is a "Coming soon" placeholder), no header Snapshot action, no status-bar change count.
- Item titles/parents/order come from the manifest, so "Chapter 3 – Scene 2: edited" can be built without reading files.

## Decisions (confirmed; record in spec "Decisions")
- **Git behind an interface.** `src/history/engine.ts` `HistoryEngine` = thin plumbing (status, commit, log, tree, read blob). Tauri impl calls Rust `git2` commands; browser/tests use an in-memory impl with the same contract. All logic (item grouping, partial snapshots, restore, diff) is TypeScript on top, so it is tested without Rust. Rust gets its own small `cargo test`s against a temp dir.
- **Tracked set:** `project.json`, all item files, `calendar.json`, `assets/`, `dictionaries/`. **Excluded:** `.storyworks/` (lock, trash, backups, history), OS junk. Trash is not tracked.
- **Git dir** `.storyworks/history.git`, work tree = project folder, own index inside the git dir, never reads/writes the user's `.git` or `.gitignore`. Autosave never commits.
- **"Item" = one file** except `project.json`, which is structure, not a user item: its changes appear as derived items (chapter added / deleted / moved / renamed / status changed) via manifest diff.
- **Partial snapshot and `project.json`:** committed manifest = HEAD manifest + only the *included* items' structural changes (added entries inserted at their parent/index, deleted removed, moved/renamed applied). Computed in TS, passed to Rust as an override blob. Un-included structure changes stay listed as changed. Fallback if the merge cannot be built cleanly: include the item's manifest entry only, never a broken reference.
- **Restore single item:** write the snapshot's file; if the item is not in the current manifest, re-add at its original parent/index (parent gone → root of its area). **Restore whole project:** write all tracked files from the snapshot; items present now but not in the snapshot go to the **Trash**, not deleted. Both first make a safety backup and ask for confirmation; if the app is not read-only.
- **Backups:** whole-project copy (excluding `.storyworks/`) into `.storyworks/backups/auto-<stamp>/`; settings in **app settings** (interval default 30 min, 0 = off; keep default 20; on-close toggle). Pruning keeps newest N `auto-*` and the safety/pre-migration ones separately (safety: keep newest 5). Runs only when something changed since the last backup.
- **UI:** the `history` section becomes **History page** with tabs *Changes* and *History*; header shows a **Snapshot** button (opens a small dialog: message, include-all) and the Write status bar shows "N changes since last snapshot". Plain words only; no hashes, branches, HEAD, commit, stage.
- **Corrupt/missing history dir:** book opens normally; History page shows an error and "Start new history" (renames the broken dir to `history.git.broken-<stamp>`, never deletes).
- **Read-only books:** can browse history, cannot snapshot or restore.

## Steps

### 1. Spike: git2 build and bare-dir model (H) · me — DONE
Throwaway crate in the scratchpad: `git2` with vendored libgit2 (check `cc` is enough, no cmake; Windows target note), separate git dir + work tree, own index, status of tracked set only, commit from an explicit path list plus in-memory blob overrides, read blob at commit, tree listing. Confirm the user's own `.git` and `.gitignore` in the same folder are untouched. Outcome fixes the Rust command list; record in spec. Blocks 3.

**Result:** `git2 0.20` with `default-features = false, features = ["vendored-libgit2"]` builds with `cc` only (no cmake, no openssl/ssh; ~30 s cold). Model that works: a **bare** repo at `.storyworks/history.git`, **no work tree and no libgit2 status**. Rust walks the tracked allow-list itself, hashes files raw (`Oid::hash_file`, no line-ending filters), compares to the HEAD tree for status, and commits by building an in-memory `Index` from the HEAD tree + (a) included paths read from disk (missing file = delete) + (b) override blobs (the merged manifest). Verified: partial commit leaves the others modified; deletes; tree-to-tree changed files; user's `.git` and a hostile `.gitignore` (`*`) have no effect and are untouched. Because the tracked set is an allow-list, the user's `.gitignore` is never tracked. Corruption: garbage HEAD and missing ref give errors from `head()`; an unborn branch (new history) is a different error and means "empty". Open must also walk HEAD's tree to catch missing objects (a random deleted object dir was not detected by `head()` alone) → `HistoryError::Corrupt`.

### 2. Engine contract + memory engine + item model (H) · tests first — DONE (uncommitted)
- `src/history/engine.ts`: `HistoryEngine` interface (`init`, `status(): FileChange[]`, `commit({message, include[], overrides}): id`, `log(): SnapshotInfo[]`, `changedFiles(id)`, `listTree(id)`, `readFile(id, path)`), `memoryEngine.ts` impl.
- `src/history/items.ts`: map file changes + manifest diffs → **change items** `{key, kind: added|modified|deleted|moved|renamed, title, path, area}` in plain words (scene, chapter, part, timeline, node, rule, entry, calendar, settings, asset, …); stable keys.
- `src/history/partial.ts`: build the commit plan from included keys (file list + merged manifest override).
- Tests: scene edited / added / deleted / moved (manifest order) / renamed → right items; inclusion of 2 of 3 edited scenes → snapshot holds the 2 new texts and the third's old text, third still listed; included added scene gets its manifest entry, excluded does not; "all changes" empties the list; no changes → no snapshot; assets and `.storyworks/` rules; broken manifest in HEAD → clear error.

**Result** (`src/history/`, 29 tests; full suite 1653 pass): `engine.ts` (contract; `status(scope)` covers scope ∪ last-snapshot paths), `memoryEngine.ts` (text-only, matches the memory/browser IO), `manifestView.ts` (tolerant reader, any format version), `tracked.ts`, `items.ts` (kinds added/deleted/modified/renamed/moved; moves found by longest common order so neighbours are not flagged), `partial.ts` (dependency closure + manifest merge), `snapshot.ts` (`loadChanges`, `createSnapshot`, `snapshotChanges`). Choices to carry on: a manifest from another format version is taken whole (`forcedAll`); first snapshot lists everything as added; manifest `trash` is never merged, so **restore (step 4) must keep the current trash list**; `settings` is one item covering non-structural manifest fields; unreadable HEAD manifest → `corrupt`, unreadable working manifest → `manifest` error.

### 3. Rust git commands (H) · after 1, parallel with 4–5 — DONE (19 cargo tests; `tauriEngine.ts` not wired yet)
`src-tauri/src/history.rs` + capability: `history_init`, `history_status`, `history_commit`, `history_log`, `history_changed_files`, `history_tree`, `history_read`; `tauri.ts` engine impl calling them. Errors map to a typed `HistoryError` (missing/corrupt dir, nothing to commit). `cargo test`: init, commit subset, status after partial commit, read old blob, user `.git` untouched, corrupt dir reported not crashed.

### 4. Restore (H) · tests first, after 2 — DONE (`restore.ts`, 16 tests; caller must reload the project after; types without a trash-entry kind lose only the entry, safety backup covers them)
`src/history/restore.ts`: `restoreItem(id, key)`, `restoreProject(id)`; safety backup first (step 5 helper); manifest re-add rule; items not in snapshot → trash; link integrity re-checked after (broken-link indexing already exists). Tests: scene returns to snapshot text; deleted-later item re-added at original place, parent gone → root of its area; whole restore moves newer items to trash and result equals snapshot; safety backup exists and restoring it undoes the restore; restore refused when read-only.

### 5. Automatic backups (N→H for pruning) · tests first, parallel — DONE (`backups.ts`, settings v3, Settings block, store wiring; whole-project restore from a backup folder still to wire in step 6 via a restore-from-folder helper)
`src/history/backups.ts`: `makeBackup(io, kind)`, `listBackups`, `pruneBackups(keep)`, `restoreBackup(name)` (via the same whole-project restore, with a safety backup); scheduler (interval timer, skip when nothing changed since last, on-close hook — Tauri `onCloseRequested`, browser `beforeunload` best-effort). App settings fields + Settings page section. Tests: prune keeps newest N and spares other kinds, no backup when unchanged, restore round-trip, stable naming/order.

### 6. Store + UI (N) · after 2–5; strings **T** — DONE (`src/history/store.ts`, `HistoryView.vue` + `components/history/`, `SnapshotDialog.vue`, header button, status-bar count, `restoreBackup`, diff/itemText, manifestTree dedupe)
- `src/history/store.ts`: changes list (recomputed on open, after autosave settles, and on watcher events), inclusion state, snapshot action, log, selected snapshot.
- `HistoryView.vue` tabs: **Changes** (grouped list, per-item checkbox, select all/none, message field, "Snapshot all changes" / "Snapshot selected", empty state), **History** (snapshot list: message, time, count; open → changed items; item view "as of then"; text diff vs current / vs previous; Restore this version / Restore whole book with confirm dialog), **Backups** (list, restore). Error state with "Start new history".
- Diff: small line-diff helper (existing dependency if present, else ~40 lines) over plain text extracted from scene JSON (`plainText.ts`); non-text items show "changed" with a key-field summary.
- Header Snapshot button + status-bar change count; sidebar History badge not needed. i18n EN + PL, Light/Dark tokens, keyboard operable.

### 7. Review and publish (T) — DONE except the real-window check (`scripts/screenshots-m9.mjs`, 82 checks; screenshots in the M9 section of the "Storyworks Screens" Artifact; bug fixed: unreadable history left a stale Changes list)
Run in browser (memory engine): edit 3 scenes → tick 2 → snapshot → third still listed; Snapshot all → empty; History open/diff/restore item/restore book; backups list. Screenshots: Changes (several kinds, partial ticks), Snapshot dialog, History list, snapshot detail with diff, restore confirm, empty states, error state, Backups, Settings backup section, status bar, header button. Publish into the existing Artifact (M9 section). Update spec "Decisions", memory note. **Real-window check:** actual git2 commit/restore on a real folder that also has a user `.git`, close-time backup, corrupt history dir recovery.

## Order
1 → 2 → (3 ∥ 4 ∥ 5) → 6 → 7. I review 1, 2, 3 and 4 before accepting.

## Done when
Milestone "Done when" holds: partial snapshot contains exactly the ticked items' new content while the others stay listed as changed; Snapshot all empties Changes; item and whole-project restore work with automatic safety backup and confirmation; backups run on close/interval with configurable count and are restorable; a project with the user's own `.git` is unaffected; no git terms in any screen; corrupt history dir does not stop the book; tests (TS + Rust) pass; screenshots published.
