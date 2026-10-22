# M1 · Implementation plan: Project storage and integrity

Scope and "Done when" are in [milestones.md](milestones.md#m1--project-storage-and-integrity). Spec: Project / platform, App safety and recovery (lock, external changes), Behavior details, Edge cases (project files). Script spec: `kind`, unknown kind.
Difficulty tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (full context, spec section named, tests first, reviewed by me before accepting).

## Decisions to settle first (record in the spec, replacing the open question)
- **Item file envelope:** every item file is `{ version, id, ...fields }`, pretty-printed (2 spaces, trailing newline), keys in schema order (serialize the Zod *output*, so order is stable). `version` is the item-format version; `project.json` has its own `version` and is the migration unit for the whole project.
- **Block IDs:** stored on the ProseMirror nodes as `attrs.id` inside the scene's `content`. The scene wrapper validates the envelope and that every block ID is unique within the file; the node tree itself is TipTap's job (M2). IDs are `crypto.randomUUID()` strings from one `newId()` function (injectable in tests).
- **Manifest index shape is complete now:** manifest holds empty-by-default collections for every area in the spec (manuscript tree, calendar, timelines, rules + categories, codex types/entries, relation types, relationships, groups, state kinds, knowledge, inbox, ignored findings) as generic `ItemRef { id, path, title? }`, plus fixed dirs (`assets/`, snapshots, dictionaries). Later milestones only add *item-file* schemas, so they need no manifest migration. Manuscript tree nodes: `{ id, type: part|chapter|scene, title, path?, children }`.
- **Only the scene item type exists in M1.** Timeline, calendar and rule-category defaults for a new book (spec "Defaults") are created by M3/M5 (create-on-open when none exists); M1 creates "Chapter 1" + one scene only. Add this handoff line to milestones M3/M5.
- **Trash:** deleting moves the item file to `.storyworks/trash/<id>/` and records `{ id, type, title, originalPath, trashPath, parentId, index, deletedAt }` in a `trash` list in the manifest. Links keep pointing at the ID, so restore un-breaks them. Trash cleanup is not in M1.
- **Folder access:** `tauri-plugin-dialog` (folder picker) + `tauri-plugin-persisted-scope` so a picked folder stays readable after restart (recent list). If a recent folder is no longer accessible, ask the user to pick it again. Step 1 is a spike to confirm this on Linux; fallback is Rust-side commands for project I/O.
- **Project I/O interface** `ProjectIO` (new, next to `FileIO`; paths relative to a project root): `readText`, `writeTextAtomic`, `exists`, `list`, `mkdir`, `rename`, `remove`, `copyTree`, `stat` (mtime), `watch`. Impls: Tauri (fs plugin), in-memory (tests), localStorage-backed virtual folder (browser, for screenshots). Everything above it is plain TS and tested against the in-memory impl.
- **Lock needs Rust:** two small Tauri commands, `machine_name()` and `process_alive(pid)` (via the `sysinfo` crate). Lock file `.storyworks/project.lock`: `{ machine, pid, timestamp }`, refreshed every 30 s, removed on close; fresh = under 2 min old **or** pid alive on the same machine.
- **External changes:** `watch` from the fs plugin (enable the `watch` feature + permission) plus a re-check of known files on window focus (watchers miss events on some network/cloud folders). Own writes are recognised by SHA-256 of content (`crypto.subtle`), kept per path as "last known disk hash".
- **Migration:** all migrated files are computed and validated in memory first; if any step fails, nothing is written. Otherwise back up the whole project to `.storyworks/backups/pre-migration-v<N>-<timestamp>/`, write, and on a write failure restore from the backup. M1 ships the mechanism and a test-only v0→v1 fixture migration; real format is v1.
- **Read-only mode:** one `readOnly: { reason } | null` on the open project; every write path goes through the project layer, which refuses when set. Reasons: `newer-version`, `unknown-kind`, `locked-elsewhere`.
- **Temporary UI (removed/replaced in M2):** Write section lists the manuscript tree with add / rename / delete (to trash) / reorder up-down, and a plain title + textarea per scene (saved as paragraphs with block IDs). Exists only so autosave, trash and the Done-when checks can be exercised. The welcome "Preview workspace" button is removed.

## Steps

### 1. Spike + Rust/plugin setup (N)
Add `tauri-plugin-dialog`, `tauri-plugin-persisted-scope`, fs `watch` feature, capabilities (fs scope for user-picked folders, `allow-watch`, `allow-read-dir`, `allow-copy-file`, `allow-stat`), commands `machine_name` / `process_alive`. Check: pick a folder, write a file, restart, read it again; watch fires on an outside edit. Report anything that doesn't work before step 3.

**Done (spike result):** plugins work on Linux (picker, atomic write, access after restart via persisted scope, watch events ~0.3 s); Rust-side I/O fallback not needed. Notes for later steps: watch event kinds are unreliable, so treat any event on a path as "re-check the hash"; use `recursive: true`; on Wayland run dev with `GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1`. Not verified: Windows/macOS, cloud folders, a recent folder that was moved or deleted.

### 2. Tests first for the pure logic (N, H where marked) · parallel with 1
Write failing tests, then implement in the steps below:
- **Schemas:** valid manifest/scene loads; malformed one rejected with file + field; unknown extra top-level state; stable key order on serialize; duplicate block IDs in a scene rejected.
- **Read/write layer:** write is temp + rename (no half file on injected failure); invalid value is refused *before* touching disk; invalid existing file is never overwritten by a save; "only changed files change" (second save of unchanged data writes nothing).
- **Migrations:** v0 fixture → v1 passes; backup exists first; failure in step → nothing written; write failure halfway → project restored from backup; newer version → read-only; unknown `kind` → read-only; known `book` → normal.
- **Open/create:** new book has manifest + Chapter 1 + one scene and reopens identically; missing item file → open, item marked missing, listed; invalid item file → open, item marked invalid with field error, file untouched; invalid JSON manifest → refuse with parse error; unlisted file in folder → reported, not deleted.
- **Autosave:** debounce coalesces edits; one write queue per path; status goes saving → saved; failed write keeps item dirty and reports error; no writes while read-only or item invalid; flush on close.
- **Trash:** delete moves file + records entry + removes from tree; restore puts it back at original parent/index (or root if parent gone); restored ID keeps the same links.
- **Lock (H):** create/refresh/remove; fresh lock refused; stale (old + dead pid) taken over with note; fresh timestamp but dead pid on same machine → stale; other machine, fresh → refused; lock from crashed session after 2 min → taken over.
- **External change (H):** own write ignored (hash match); outside edit, no unsaved edits → silent reload; outside edit with unsaved edits → prompt state `reload|keep`; `project.json` change → structure reload offer; file deleted outside → item marked missing.
- **Link index (H):** register/replace links per owner; `linksTo`/`linksFrom`; target missing from live items → broken; target in trash → broken; restore → not broken; optional block-level check hook; stable ordering of results.

### 3. Schemas + serialization (N) · after 2
`src/project/schemas/`: `manifest.ts` (v1, `kind: 'book'` accepted, unknown kind string parsed as "unknown" not a failure), `scene.ts` (envelope, metadata fields status/synopsis/povId/wordCount as optional with defaults, `content` as `unknown` doc, `comments`, unique-block-ID refine), shared `ItemRef`, `ids.ts` (`newId`). `serialize(schema, value)`; `parseFile(schema, text, file)` → `{ ok, value } | { ok: false, error: { file, field, message } }`. Types inferred.

### 4. ProjectIO impls (N) · after 1, parallel with 3
Interface + in-memory + Tauri + localStorage-virtual impls. SHA-256 helper.

### 5. Project layer (N) · after 3, 4
`openProject(io, root)` → `{ project, issues }`: loads manifest, runs migrations, checks kind, loads each indexed item lazily but validates existence on open (stat), scans folder for unlisted files, returns issues (`missing`, `invalid`, `unlisted`). `createProject(io, root, meta)`. `saveManifest` / `saveItem` (validate → serialize → skip if hash unchanged → atomic write → update known hash). Pinia `project` store holds the open project, read-only state, issues, tree.

### 6. Migrations (N, with care) · after 5, parallel with 7
`migrate(files, from, to)` registry of pure `N → N+1` functions; the in-memory-first flow with backup and restore described above.

### 7. Autosave engine (N) · after 5, parallel with 6
Per-path queue, debounce (800 ms), `flushAll()`, status `saved | saving | error`, hooks into the project store; "Saved" indicator in the sidebar footer (i18n `status.saved/saving/error`).

### 8. Lock file (H) · after 5, 1
`ProjectLock` over `ProjectIO` + Rust commands, injected clock/pid-checker for tests. Open flow: acquire → on `fresh` return "open elsewhere" so the UI offers *Open read-only* / *Cancel*; stale → take over with a note; refresh timer; release on close and on window close event.

### 9. External-change detection (H) · after 5, 8
`ChangeWatcher`: tracks known hash per path, subscribes to `watch` + window focus re-check, classifies events (own write / outside edit / deleted / manifest). Store exposes pending prompts; dirty tracking comes from the autosave queue (dirty = unsaved in-app edit).

### 10. Trash (N) · after 5
`deleteItem` / `restoreItem` per the decision above; trash list in the manifest; manifest saved in the same order as file move (move first, then manifest; on failure roll back the move).

### 11. Link index (H) · after 5, 10
`src/project/links.ts`: `LinkRef { item, block? }`, `Link { id, from: LinkRef, to: LinkRef, kind: string }`; in-memory registry keyed by owner item, rebuilt on open from each item's declared links (scene schema reserves `links: Link[]`); `isBroken(link)` using the live-item set (manifest minus trash) plus the optional block hook; `brokenLinks()`. No UI beyond a count in the dev tree.

### 12. UI (N, T for strings) · after 5–11; parts parallel
- Welcome: New project (dialog: title, author, language, folder; kind fixed to book, no kind chooser until S1), Open (folder or `project.json`), Recent list (stored in app settings: schema bump `version` 1→2 with migration + test, or an additive field with default if the settings schema allows it), remove-from-recent. Remove "Preview workspace".
- Shell: book title in sidebar, saved indicator, read-only banner with reason, issues banner (missing files list, invalid items with field error, unlisted-files dialog: *Import* / *Ignore*), "open elsewhere" dialog, external-change dialog (*Reload from disk* / *Keep my version*), manifest-changed offer, error screen for invalid manifest (parse error, no backup offer yet beyond the backup folder path; M11 adds crash recovery).
- Temporary Write section (tree CRUD, scene textarea) and a Trash dialog with restore.
- All strings in `en.json` / `pl.json`; parity test already covers keys.

### 13. Verify and review (N)
- `yarn lint && yarn typecheck && yarn test` green; failures reported as they are.
- Manual runs (`run` skill, `tauri:dev` for the real thing, since the browser has no real folders): create → edit → restart → identical; `git diff`-style check that only expected files changed; hand-corrupt a scene, delete a scene file, break `project.json`, set version 99, set `kind: "game-x"`; open the same book in two instances; edit a file outside the app; delete → restore.
- Screenshots in the one Artifact (extend the existing page), captioned, Light + Dark: welcome with recents, new-project dialog, shell with saved indicator, read-only banner, issues banner, open-elsewhere dialog, external-change dialog, trash dialog. Welcome existed before, so show before/after for it.
- Update the spec (item format decision, manifest shape, trash, lock paths), tick M1 items, add the M3/M5 handoff line, commit.

## Order
`1` ∥ `2` → (`3`, `4` parallel) → `5` → (`6`, `7`, `8`, `10` parallel; `9` after `8`; `11` after `10`) → `12` → `13`.
Hard steps (8, 9, 11): tests from step 2 written and committed first; I review each before the next depends on it.

## Risks
- Folder access outside `$APPDATA` (scope persistence, watch on every platform) is the main unknown; step 1 decides between plugins and Rust-side I/O. Windows is verified by the user.
- `process_alive` is best-effort (pid reuse); the 2-minute freshness rule is the backstop.
- The temporary Write UI is throwaway; keep it small so M2 can replace it without migrating data.
- Manifest shape is fixed now for all later areas; a wrong guess costs a migration later, so keep per-area fields minimal (`ItemRef` only).
