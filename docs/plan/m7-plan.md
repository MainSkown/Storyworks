# M7 · Implementation plan: Consistency checks

Scope: [milestones.md](milestones.md#m7--consistency-checks). Spec: Consistency checks (no LLM), Behavior details (chronological order), Edge cases (checks, ignored-findings file), acceptance lines for date-order, broken link, check on/off, overlapping states.
Tags: **T** trivial → Haiku · **N** normal → Sonnet · **H** hard → Sonnet with extra care (tests first, reviewed before accepting).

**Start gate:** M6 committed (M6c is still uncommitted).

## What already exists
- `project/schemas/ignored.ts` + store wiring (`ignored`, `ignoredIdSet`, `ignoredInvalid`, `ignored.json` created on first use, listed in the manifest).
- `project/linkProblems.ts` (`buildProblems`), `project/coverage.ts` (`coverage`) from M4.
- `project/stateChecks.ts`: `overlappingStates`, `appearsAfterFinal`. `knowledge/logic.ts`: `usedBeforeLearned`. All use `timeline/order.ts` `compare`.
- `calendar/dates.ts` `validateDate`, `calendar/flag.ts` `flagInvalidDates`.
- `AppShell.vue` already has an empty `badge-slot` on the Checks row; `SectionPlaceholder.vue` stands in for the Checks view.
- `SettingsView.vue` is the combined app + book settings page (already holds `CalendarEditor`).

## Decisions (record in spec "Decisions")
- **Grouping (user):** Checks page groups by severity: errors, warnings, info.
- **Check toggles (user):** a new group in the existing `SettingsView.vue`, not a new page.
- **Finding shape:** `{id, checkId, severity, message, locations[]}`; `id = checkId + ':' + involved item ids joined`, order-independent where the pair is symmetric (overlapping states, duplicate names). A location is `{kind, id, blockId?, label}`; the same shape serves a later LLM checker.
- **Toggles are stored in the manifest** (`checkSettings`: map of check id → enabled, missing = on) because they are per book. Manifest v9 → v10 with migration and test.
- **Results are not persisted;** they are recomputed on open and on "Run checks". Only dismissed ids are saved.
- **Dismissal:** "Ignore" adds the finding id; a changed problem has a new id and reappears. Invalid `ignored.json`: all findings shown plus a warning, file never overwritten (already supported by the store).
- **Order:** every date/state/knowledge comparison goes through `compare`; unknown order produces no finding.
- **Gap to close:** `usedBeforeLearned` covers use before learning only; the spec also wants use **after forgetting** (`forgottenAt`). Extend it in step 3c.

---

## Steps

### 1. Types (T) · me
`src/checks/types.ts`: `Finding`, `Severity`, `CheckId` list, `findingId()` helper, `Checker` signature. Unblocks steps 3–4.

### 2. Manifest `checkSettings` (N) · parallel with 3
Schema field, v9 → v10 migration, migration test (valid file loads, malformed rejected untouched). Store getter `isCheckEnabled(id)` and setter.

### 3. Checkers, tests first, in parallel
- **3a (N)** `src/checks/structural.ts`: broken link (wraps `buildProblems`), missing/invalid file (from the store's item problems), duplicate codex name or alias within a type, isolated node (timeline with more than one node), unlinked rule, codex entry with no relationships/groups/links, coverage (wraps `coverage`, two findings kinds), open revision to-do. Each: bad case → finding, good case → none, stable id.
- **3b (H)** `src/checks/dates.ts`: invalid node date; date-order (node dated before a predecessor along an edge, same timeline, undated or unknown skipped). Tests: before/equal/after/unknown, branch and merge, undated gap.
- **3c (H)** `src/checks/stateKnowledge.ts`: wrap `overlappingStates` (boundary touch = none), `appearsAfterFinal`, `usedBeforeLearned`; extend knowledge check for use after `forgottenAt`. Tests: overlap vs touch, unknown order, never-learned, before-learning, after-forgetting, relearned after forgetting.

### 4. Runner (N)
`src/checks/run.ts` + Pinia store: gathers project data, runs enabled checkers, sorts by severity then label, marks ignored ids, exposes `findings`, `visible`, `counts` (errors + warnings for the badge), `run()`. Runs on project open and on demand. Test: disabled check yields nothing, ignored finding hidden and reappears with a new id, empty book yields nothing.

### 5. UI, in parallel after 4
- **5a (N)** `ChecksView.vue`: severity groups, message + locations, click opens the item (scene block via `useJump`, node, rule, entry), "Run checks", "Ignore" per finding, "Show ignored" toggle, warning banner for invalid ignored file, empty state. i18n EN + PL.
- **5b (N)** Settings group "Checks" (one switch per check, grouped by severity) and the sidebar badge in `AppShell.vue`. i18n EN + PL.

### 6. Review and publish (T)
Run the app (browser version), screenshot: Checks page with findings in all three severities, with ignored shown, empty state, Settings checks group, sidebar badge. Publish to the Artifact. Update the spec "Decisions" and the memory note.

## Order
1 → (2 ∥ 3a ∥ 3b ∥ 3c) → 4 → (5a ∥ 5b) → 6. I review 3b and 3c before accepting.

## Done when
Milestone "Done when" holds: every check gives a finding on a bad case and none on a good one with stable ids, dismissal works as specified, unknown order never alarms; tests pass; screenshots published.
