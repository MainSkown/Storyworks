# M11b performance on large scripts

Run: `node scripts/perf-m11b.mjs` (add `--node-only` to skip the browser phase; the browser phase needs `yarn dev` on :1420 and a Playwright chromium; `TRACE=1` prints a rendering trace of the conversation switch). Fixtures are built by `scripts/perf-fixture-script.ts` through the real project writer into a memory folder; the real stores and functions are then timed. Budgets as M11a: open < 3 s, item switch < 300 ms, search < 100 ms per keystroke, checks < 2 s.

Fixtures
- Screenplay: 120 scenes, 1 968 elements, ~25 000 words, 118 pages (Letter), every cue linked to a codex entry.
- Game: 100 items (99 scripts of 35 lines + one 301-node conversation), 4 815 lines, story map with 100 item boxes + 20 beats, 300 mechanics with 5 links each (12 deliberately broken), 500 glossary terms, 50 codex entries, 10 variables.

Node-phase numbers are medians (search and filter: worst keystroke). Everything is far under budget.

| Area | Metric | ms | Budget |
|---|---|---:|---:|
| Screenplay | open (all files, stores) | 25 | 3000 |
| | pages: first count, 118 pages | 4 | |
| | one typed change: save + roll-up + pages + scene numbers | 2.3 | 50 |
| | search per keystroke (worst of 5 queries) | 0.7 | 100 |
| | switcher per keystroke (worst) | 0.3 | 100 |
| | item switch (loadScene) | < 1 | 300 |
| | checks (gather + run) | 4 | 2000 |
| | Fountain: model 2.6, text 0.8 (146 KB), parse back 2.2 | | |
| Game | open (incl. 300 mechanics, 500 terms, story map) | 70 | 3000 |
| | search per keystroke (worst of 7 queries) | 1.5 | 100 |
| | switcher per keystroke (worst) | 0.2 | 100 |
| | item switch: script / 301-node conversation | < 1 / 2.2 | 300 |
| | checks (gather + run, 161 findings) | 10 | 2000 |
| | playthrough of the 301-node conversation (225 steps; the 1 000-step cap run) | 2.5 (1.8) | |
| | story map: model of all 100 items 8, whole-game playthrough 2.4 | | |
| | mechanics filter per keystroke (worst) / store recompute | 0.4 / 0.1 | 100 |
| | glossary sort 500 / filter per keystroke | 0.2 / 0.1 | 100 |
| | broken links over 300 mechanics | 0.1 | 100 |
| | reverse links for all 460 targets / for one | 2.5 / < 0.1 | 100 |
| | related mechanics for all 300 / for one | 2.6 / < 0.1 | |
| | game model 10, JSON text 2.6 (2 MB), re-read JSON 8, CSV 1.1 | | |
| | game document model 0.8, Markdown 2.9 (295 KB) | | |

Browser phase (headless Chromium vs `yarn dev`, browser build; three runs agree within ~10%)

| Metric | ms | Budget |
|---|---:|---:|
| Screenplay: open click to tree | 500 | 3000 |
| Screenplay: item switch, editor shows text / painted | 8 / 15 | 300 |
| Screenplay: typing, keystroke to painted (118 pages) | 16 | 100 |
| Game: open click to tree | 535 | 3000 |
| Game: script switch, shows text / painted | 8 / 15 | 300 |
| Game: 301-node conversation canvas, nodes shown (median of 5) | 215-230 | 300 |
| Game: 301-node conversation canvas, painted (median of 5) | 330-360 | 300 |
| Game document: click to mechanics list (300 rows in the DOM) | 185 | 300 |
| Game document: select another mechanic, painted | 28 | 300 |
| Game document: mechanics text filter, keystroke to painted | 35-44 | 100 |
| Game document: click to glossary list (500 rows) | 185 | 300 |

## Findings

One near-miss, no fix applied: the conversation canvas with 301 nodes paints in 330-360 ms (nodes are in the DOM at 215-230 ms, under budget; the painted figure includes a headless frame wait of ~10-30 ms). A trace shows ~215 ms of Vue/vue-flow render work for 301 nodes and 400 edges, ~50 ms style and layout; no single hot function, it is the node count.

Candidate fix: `:only-render-visible-elements="true"` on the `VueFlow` in `src/components/graph/GraphCanvas.vue`. Tried once and reverted: 65 of 301 nodes rendered, shown 120 ms, painted 188 ms. Not kept because the component is shared (conversation, story map, timeline, relationships) and keyboard focus uses `querySelector` on `[data-graph-node]` after a 150 ms pan, so off-screen nodes would not be focusable or announced until rendered; that is for the a11y audit to decide, not a perf patch. Typical conversations (tens of nodes) are far below the budget.

Nothing else misses. Paginating 118 pages on every typed change costs 2-4 ms, so the page count needs no caching at this size. No source files were changed by this step.
