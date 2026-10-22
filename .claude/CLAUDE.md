# BookWriter

Desktop app for writing a book (Tauri + Vue 3 + TypeScript + Vite + PrimeVue, TipTap editor).
Source of truth for what to build: `docs/features/book-writer-app.md`. Read the relevant section before starting; don't re-derive decisions listed there.

## Workflow

### 1. UI changes need visual review
- After any UI change, run the app (use the `run` skill), screenshot the changed screens, and publish them to one Artifact page for the user to review.
- Show the screens that changed, a one-line caption each, and before/after when a screen already existed. Update the same Artifact on later changes instead of creating new ones.
- Don't mark UI work done until the screenshots were published.

### 2. Spend few tokens
- Short replies: say what changed and what's next, nothing more.
- No recaps of the spec, no restating the task, no long summaries of tool output.
- Short commit messages, short code comments (only for non-obvious "why"), short subagent prompts and reports.
- Read only the part of a file you need; search before reading.

### 3. Plan, then split work across agents by difficulty
- Start each larger task with a short plan: ordered steps, each tagged by difficulty.
- Delegate by difficulty, never above Sonnet:
  - Trivial (renames, boilerplate, config, i18n strings, simple components) → Haiku.
  - Normal (typical features, components, stores, file I/O) → Sonnet.
  - Hard (editor block IDs and links, timeline graph logic, snapshot/git layer, export pipeline) → Sonnet with extra care: full context in the prompt, spec section named, tests written first, result reviewed by me before accepting.
- Run independent steps in parallel; do dependent steps in order.
- Keep subagent prompts self-contained and short; ask for a brief report (what changed, what to check).

### 4. Simple tests before functionality
- Write tests first, then the implementation.
- Test only what can actually break or regress: file/manifest read-write, ordering, link integrity (broken links, deleted items), calendar/date logic, graph rules (no cycles in flow view), export model conversion, snapshot staging/restore.
- Skip tests for plain markup, styling, and thin wrappers around libraries.
- Keep tests small and fast: one behavior per test, plain names, no heavy mocking.
- Run the tests before reporting a task done; report failures as they are.

## Conventions
- Vue 3 Composition API with `<script setup lang="ts">`; PrimeVue components; vue-i18n for every user-facing string (English + Polish).
- Project files are JSON, written atomically (temp file + rename); `project.json` is the manifest and source of truth for structure and order.
- Snapshot UI uses plain words, never git terms (see spec).
- Match surrounding code style; don't add features beyond the spec.
