// Usage: node scripts/perf-m11b.mjs [--node-only] [--json out.json]
// M11b performance pass on large scripts: a 120-page screenplay and a game (5 000 lines, 300 conversation nodes,
// 100-item story map, 300 mechanics with ~5 links, 500 glossary terms). Same approach as perf-m11.mjs:
// 1. Node phase: fixtures are built through the real project writer (scripts/perf-fixture-script.ts) in a memory
//    folder, then the real stores/functions are timed.
// 2. Browser phase (needs `yarn dev` on :1420 + a Playwright chromium; skipped with --node-only): the same files go
//    into the browser build's virtual folder and the UI is timed (open to tree, item switch, mechanics list).
import { createServer } from 'vite'
import { writeFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
const NODE_ONLY = process.argv.includes('--node-only')
const results = []
const record = (phase, name, ms, budget, note = '') => {
  results.push({ phase, name, ms, budget, note })
  const flag = budget !== undefined && ms > budget ? ' SLOW' : ''
  console.log(
    `[${phase}] ${name}: ${ms.toFixed(1)} ms${budget !== undefined ? ` (budget ${budget})` : ''}${flag} ${note}`,
  )
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const max = (a) => Math.max(...a)
async function timeAsync(fn, runs = 1) {
  const t = []
  let last
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    last = await fn(i)
    t.push(performance.now() - t0)
  }
  return { ms: median(t), max: max(t), last }
}
const timeSync = (fn, runs = 1) => timeAsync(async (i) => fn(i), runs)
const tick = () => new Promise((r) => setTimeout(r, 0))

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})
const load = (p) => vite.ssrLoadModule(p)
const { buildScreenplayFixture, buildGameFixture } = await load('/scripts/perf-fixture-script.ts')

let t0 = performance.now()
const sp = await buildScreenplayFixture()
console.log(
  `screenplay fixture: ${sp.sceneIds.length} scenes, ${sp.elements} elements, ${sp.totalWords} words, ${Object.keys(sp.files).length} files, built in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
)
t0 = performance.now()
const gm = await buildGameFixture()
console.log(
  `game fixture: ${gm.itemIds.length} items, ${gm.convNodes} conversation nodes, ${gm.lines} lines, ${gm.mechanicIds.length} mechanics, ${Object.keys(gm.files).length} files, built in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
)

await screenplayPhase()
await gamePhase()
if (!NODE_ONLY) await browserPhase()

console.log('\n| Phase | Metric | ms | Budget | |')
console.log('|---|---|---:|---:|---|')
for (const r of results) {
  const ok = r.budget === undefined ? '' : r.ms <= r.budget ? 'ok' : 'SLOW'
  console.log(`| ${r.phase} | ${r.name} | ${r.ms.toFixed(1)} | ${r.budget ?? ''} | ${ok} ${r.note} |`)
}
const out = arg('json')
if (out) writeFileSync(out, JSON.stringify(results, null, 1))
await vite.close()
process.exit(0)

// ---------------------------------------------------------------- shared node setup
async function openProject(files) {
  const { createPinia, setActivePinia } = await load('pinia')
  const { createMemoryProjectIO } = await load('/src/project/io/memory.ts')
  const { createMemoryFileIO } = await load('/src/io/fileIO.ts')
  const settingsStore = await load('/src/settings/store.ts')
  const projectStore = await load('/src/project/store.ts')
  settingsStore.setFileIOFactory(() => createMemoryFileIO())
  const io = createMemoryProjectIO(files)
  projectStore.setProjectIOFactory(() => io)
  setActivePinia(createPinia())
  const project = projectStore.useProjectStore()
  const stores = {
    search: (await load('/src/search/store.ts')).useSearchStore(),
    checks: (await load('/src/checks/store.ts')).useChecksStore(),
    codex: (await load('/src/codex/store.ts')).useCodexStore(),
    timelines: (await load('/src/timeline/store.ts')).useTimelinesStore(),
  }
  return { project, io, stores, load: (p) => load(p) }
}

async function waitUntil(cond, label, maxMs = 60000) {
  const t = performance.now()
  while (!cond()) {
    if (performance.now() - t > maxMs) throw new Error(`timeout: ${label}`)
    await tick()
  }
}

async function searchSwitcher(phase, search, queries, switchQueries) {
  const r = await timeAsync(async () => {
    const t = performance.now()
    while (search.loadingBodies || performance.now() - t < 50) {
      await new Promise((res) => setTimeout(res, 5))
      if (performance.now() - t > 60000) throw new Error('search fill timeout')
    }
  })
  record(phase, 'search: background body indexing (off the typing path)', r.ms)
  for (const q of queries) {
    const keys = []
    let n = 0
    for (let i = 1; i <= q.length; i++) {
      const t = performance.now()
      n = search.find(q.slice(0, i))
      keys.push(performance.now() - t)
    }
    record(phase, `search "${q}" per keystroke (max of ${q.length})`, max(keys), 100, `(median ${median(keys).toFixed(1)})`)
    void n
  }
  for (const q of switchQueries) {
    const keys = []
    for (let i = 1; i <= q.length; i++) {
      const t = performance.now()
      search.switchList(q.slice(0, i))
      keys.push(performance.now() - t)
    }
    record(phase, `switcher "${q}" per keystroke (max of ${q.length})`, max(keys), 100, `(median ${median(keys).toFixed(1)})`)
  }
}

// ---------------------------------------------------------------- screenplay
async function screenplayPhase() {
  const P = 'screenplay'
  const { project, stores } = await openProject(sp.files)
  const { search, checks } = stores

  let r = await timeAsync(() => project.open('script'))
  if (r.last !== 'opened') throw new Error(`open: ${r.last}`)
  record(P, 'open: all files read, stores loaded', r.ms, 3000, `(${project.wordCounts.get('')} words)`)

  // pages: computed from all scene elements (also re-run after every typed element change)
  r = await timeSync(() => project.pageStats, 1)
  record(P, 'pages: first pageStats (paginate whole script)', r.ms, undefined, `(${r.last.pages} pages, ${r.last.minutes} min)`)
  const { paginate } = await load('/src/editor/screenplay/layout.ts')
  const { elementsOfDoc } = await load('/src/editor/screenplay/elements.ts')
  const elements = []
  for (const p of sp.scenePaths) elements.push(...elementsOfDoc((await project.loadScene(p)).value.content))
  r = await timeSync(() => paginate(elements, { pageSize: 'Letter' }), 5)
  record(P, 'pages: paginate() alone (median of 5)', r.ms, undefined, `(${elements.length} elements, max ${r.max.toFixed(1)})`)

  // one typed element change: setSceneContent + word roll-up + page count + scene numbers (what a keystroke triggers)
  const sid = sp.sceneIds[60]
  const cur = (await project.loadScene(sp.scenePaths[60])).value
  r = await timeAsync(async (i) => {
    const content = JSON.parse(JSON.stringify(cur.content))
    const el = content.content.find((e) => e.type === 'dialogue')
    el.content[0].text += ' x'.repeat(i + 1)
    await project.setSceneContent(sid, content, cur.wordCount + i + 1)
    void project.wordCounts.get('')
    void project.pageStats
    void project.sceneNumbering
  }, 10)
  record(P, 'keystroke: setSceneContent + word roll-up + pages + scene numbers (median of 10)', r.ms, 50, `(max ${r.max.toFixed(1)})`)

  await searchSwitcher(P, search, ['silence', 'ANNA', 'the road', 'a', 'e'], ['Scene 77', 'Sequence 5', 'e'])

  // item switch: read + validate one scene file
  r = await timeAsync((i) => project.loadScene(sp.scenePaths[i * 5 + 1]), 20)
  record(P, 'item switch: loadScene (median of 20)', r.ms, 300, `(max ${r.max.toFixed(1)})`)

  r = await timeAsync(() => checks.run(), 3)
  record(P, 'checks: gather + run (median of 3)', r.ms, 2000, `(${checks.findings.length} findings, max ${r.max.toFixed(0)})`)

  // Fountain export model + text
  const { projectScriptSource } = await load('/src/export/source.ts')
  const { prepareScript } = await load('/src/export/scriptDoc.ts')
  const { defaultScriptExportOptions } = await load('/src/export/scriptOptions.ts')
  const { toFountain } = await load('/src/export/fountain.ts')
  const seqIds = project.tree.filter((n) => n.type === 'chapter').map((n) => n.id)
  r = await timeAsync(() => prepareScript(projectScriptSource(), seqIds, defaultScriptExportOptions()), 3)
  record(P, 'export: script model, all sequences (load scenes + convert, median of 3)', r.ms, undefined, `(max ${r.max.toFixed(0)})`)
  const model = r.last
  r = await timeSync(() => toFountain(model), 5)
  record(P, 'export: Fountain text (median of 5)', r.ms, undefined, `(${(r.last.length / 1024).toFixed(0)} KB)`)

  // Fountain import of that text back (paste path)
  const { parseFountain } = await load('/src/import/fountain.ts')
  const text = toFountain(model)
  r = await timeSync(() => parseFountain(text), 3)
  record(P, 'import: parse the Fountain text back (median of 3)', r.ms)

  await project.close()
}

// ---------------------------------------------------------------- game
async function gamePhase() {
  const P = 'game'
  const { project, stores } = await openProject(gm.files)
  const { search, checks } = stores
  const { useMechanicsStore } = await load('/src/gamedoc/mechanicsStore.ts')
  const { useGlossaryStore } = await load('/src/gamedoc/glossaryStore.ts')
  const { useOverviewStore } = await load('/src/gamedoc/overviewStore.ts')
  const { useVariablesStore } = await load('/src/variables/store.ts')
  const { useStoryMapStore } = await load('/src/storymap/store.ts')
  const mech = useMechanicsStore()
  const glossary = useGlossaryStore()
  useOverviewStore()
  const vars = useVariablesStore()
  const storyMap = useStoryMapStore()

  let r = await timeAsync(async () => {
    const res = await project.open('game')
    await waitUntil(
      () =>
        mech.mechanics.length === gm.mechanicIds.length &&
        glossary.entries.length > 0 &&
        storyMap.map.boxes.length > 0 &&
        vars.variables.length > 0,
      'stores loaded',
    )
    return res
  })
  if (r.last !== 'opened') throw new Error(`open: ${r.last}`)
  record(
    P,
    'open: all files read, stores loaded (mechanics, glossary, story map, variables)',
    r.ms,
    3000,
    `(${mech.mechanics.length} mechanics, ${glossary.entries.length} terms, ${storyMap.map.boxes.length} boxes, ${project.wordCounts.get('')} words)`,
  )

  await searchSwitcher(
    P,
    search,
    ['silence', 'Mechanic 250', 'Term river', 'the road', 'a', 'e', 'Script 7.3'],
    ['Script 7.3', 'The long talk', 'Act 5', 'e'],
  )

  // item switch: scripts and the 300-node conversation
  const scripts = gm.itemIds.filter((id) => id !== gm.convId)
  r = await timeAsync((i) => project.loadScene(`manuscript/${scripts[(i * 4 + 1) % scripts.length]}.json`), 20)
  record(P, 'item switch: loadScene, script of 35 lines (median of 20)', r.ms, 300, `(max ${r.max.toFixed(1)})`)
  r = await timeAsync(() => project.loadConversation(gm.convId), 10)
  record(P, `item switch: loadConversation, ${gm.convNodes} nodes (median of 10)`, r.ms, 300, `(max ${r.max.toFixed(1)})`)
  const conv = (await project.loadConversation(gm.convId)).value

  // checks
  r = await timeAsync(() => checks.run(), 3)
  record(P, 'checks: gather + run (median of 3)', r.ms, 2000, `(${checks.findings.length} findings, max ${r.max.toFixed(0)})`)
  const { gatherCheckData } = await load('/src/checks/gather.ts')
  const { runChecks } = await load('/src/checks/run.ts')
  const g = await timeAsync(() => gatherCheckData(), 3)
  record(P, 'checks: gatherCheckData only', g.ms)
  const rc = await timeSync(() => runChecks(g.last, 'game', () => true), 3)
  record(P, 'checks: runChecks only', rc.ms)

  // playthrough on the conversation
  const pt = await load('/src/game/playthrough.ts')
  const variables = vars.variables
  const play = (pick) => {
    let s = pt.start(conv, variables)
    let steps = 0
    while (s.status === 'playing') {
      const v = pt.view(s)
      s = v.kind === 'choice' ? pt.choose(s, pick(v.options).id) : pt.advance(s)
      steps++
    }
    return { s, steps }
  }
  for (const [name, pick] of [
    ['first option', (o) => o[0]],
    ['last non-loop option', (o) => o[Math.max(0, o.length - 2)]],
    ['loop option (runs into the step cap)', (o) => o[o.length - 1]],
  ]) {
    r = await timeSync(() => play(pick), 5)
    record(P, `playthrough: ${gm.convNodes}-node conversation, ${name} (median of 5)`, r.ms, undefined, `(${r.last.steps} steps, ends ${r.last.s.status}, max ${r.max.toFixed(1)})`)
  }
  const { buildStoryModel } = await load('/src/storymap/model.ts')
  const { startStory, advanceStory, chooseStory, followArrow, viewStory } = await load('/src/game/storyPlaythrough.ts')
  const { extractLines } = await load('/src/game/playthrough.ts')
  const { findNode } = await load('/src/project/tree.ts')
  const manifest = project.project.manifest
  const src = {
    manifest,
    loadConversation: project.loadConversation,
    loadScriptLines: async (id) => {
      const path = findNode(project.tree, id)?.path
      const rr = path ? await project.loadScene(path) : null
      return rr?.ok ? extractLines(rr.value.content) : null
    },
  }
  r = await timeAsync(() => buildStoryModel(src, storyMap.map, variables), 3)
  record(P, `story map: model build, load all ${gm.itemIds.length} items (median of 3)`, r.ms, undefined, `(max ${r.max.toFixed(0)})`)
  const storyModel = r.last
  r = await timeSync(() => {
    let s = startStory(storyModel, { boxId: `bx-${gm.itemIds[0]}` })
    let steps = 0
    while (s.status === 'playing' && steps < 3000) {
      const v = viewStory(s)
      if (v.kind === 'choice') s = chooseStory(s, v.options[0].id)
      else if (v.kind === 'item-end') s = followArrow(s, v.arrows[0].id)
      else s = advanceStory(s)
      steps++
    }
    return { s, steps }
  }, 3)
  record(P, 'story map: whole-game playthrough from the first box (median of 3)', r.ms, undefined, `(${r.last.steps} steps, ends ${r.last.s.status})`)
  const { derivedArrows } = await load('/src/storymap/ops.ts')
  r = await timeSync(() => derivedArrows(storyMap.map, [{ id: gm.convId, conversation: conv }]), 10)
  record(P, 'story map: derived arrows (median of 10)', r.ms)

  // game document: filter, broken links, reverse links
  const { filterMechanics, sortGlossary } = await load('/src/project/gamedoc.ts')
  const { buildLinkContext } = await load('/src/gamedoc/linkContext.ts')
  const links = await load('/src/game/mechanicLinks.ts')
  const mechanics = mech.mechanics
  for (const q of ['Mechanic 250', 'river', 'param2', 'tag7']) {
    const keys = []
    for (let i = 1; i <= q.length; i++) {
      const t = performance.now()
      filterMechanics(mechanics, { query: q.slice(0, i) })
      keys.push(performance.now() - t)
    }
    record(P, `mechanics filter "${q}" per keystroke (max of ${q.length})`, max(keys), 100, `(median ${median(keys).toFixed(1)})`)
  }
  r = await timeSync(() => {
    mech.filter = { categoryId: mechanics[3].categoryId, status: 'designed', tags: [], query: 'the' }
    return mech.filteredMechanics.length
  }, 5)
  record(P, 'mechanics filter: store (category + status + text), recompute (median of 5)', r.ms, 100, `(${r.last} shown)`)
  mech.filter = { categoryId: null, status: null, tags: [], query: '' }
  r = await timeSync(() => sortGlossary(glossary.entries, 'en'), 5)
  record(P, `glossary: sort ${glossary.entries.length} terms (median of 5)`, r.ms, 100)
  const sorted = sortGlossary(glossary.entries, 'en')
  const gkeys = []
  for (const q of 'river') {
    const t = performance.now()
    const ql = q.toLowerCase()
    sorted.filter((e) => e.term.toLowerCase().includes(ql) || e.definition.toLowerCase().includes(ql))
    gkeys.push(performance.now() - t)
  }
  record(P, 'glossary: filter per keystroke (max of 5)', max(gkeys), 100)

  const ctxInput = () => ({
    variableIds: vars.variables.map((v) => v.id),
    tree: project.tree,
    trash: project.trash,
    beatIds: storyMap.map.boxes.filter((b) => b.kind === 'beat').map((b) => b.id),
    entryIds: stores.codex.entries.map((e) => e.id),
    mechanicIds: mech.mechanicEntries.map((e) => e.id),
  })
  r = await timeSync(() => buildLinkContext(ctxInput()), 5)
  record(P, 'links: build link context (median of 5)', r.ms)
  const ctx = buildLinkContext(ctxInput())
  r = await timeSync(() => mechanics.flatMap((m) => links.brokenLinks(m, ctx)), 5)
  record(P, `links: broken links over ${mechanics.length} mechanics (median of 5)`, r.ms, 100, `(${r.last.length} broken)`)
  const targets = [
    ...gm.itemIds.map((id) => ['item', id]),
    ...gm.variableIds.map((id) => ['variable', id]),
    ...gm.entryIds.map((id) => ['entry', id]),
    ...mechanics.map((m) => ['mechanic', m.id]),
  ]
  r = await timeSync(() => targets.reduce((n, [k, id]) => n + links.mechanicsFor(k, id, mechanics).length, 0), 5)
  record(P, `links: reverse links ("used by") for all ${targets.length} targets (median of 5)`, r.ms, 100, `(${r.last} hits)`)
  r = await timeSync(() => links.mechanicsFor('item', gm.itemIds[5], mechanics), 20)
  record(P, 'links: reverse links for one item (median of 20)', r.ms, 100)
  r = await timeSync(() => mechanics.reduce((n, m) => n + links.relatedMechanics(m, mechanics).length, 0), 3)
  record(P, `links: related mechanics for all ${mechanics.length} (median of 3)`, r.ms, undefined, `(one: ${(r.ms / mechanics.length).toFixed(2)})`)
  r = await timeSync(() => links.relatedMechanics(mechanics[7], mechanics), 20)
  record(P, 'links: related mechanics for one (median of 20)', r.ms, 100)

  // game exports
  const { projectGameSource } = await load('/src/export/source.ts')
  const { buildGameDoc } = await load('/src/export/gameDoc.ts')
  const { serializeGameJson, parseGameJson } = await load('/src/export/gameJson.ts')
  const { toGameCsv } = await load('/src/export/gameCsv.ts')
  const { buildGameDocument, defaultGameDocumentOptions, gameDocumentTexts } = await load('/src/export/gameDocument.ts')
  const { toMarkdown } = await load('/src/export/markdown.ts')
  r = await timeAsync(() => buildGameDoc(projectGameSource()), 3)
  record(P, 'export: game model, load all items (median of 3)', r.ms, undefined, `(max ${r.max.toFixed(0)})`)
  const gdoc = r.last
  r = await timeSync(() => serializeGameJson(gdoc), 5)
  record(P, 'export: game JSON text (median of 5)', r.ms, undefined, `(${(r.last.length / 1024).toFixed(0)} KB)`)
  const json = r.last
  r = await timeSync(() => parseGameJson(json), 3)
  record(P, 'export: re-read game JSON (median of 3)', r.ms)
  r = await timeSync(() => toGameCsv(gdoc), 5)
  record(P, 'export: game CSV text (median of 5)', r.ms, undefined, `(${(r.last.length / 1024).toFixed(0)} KB)`)
  const texts = gameDocumentTexts((k) => k)
  r = await timeSync(() => buildGameDocument(projectGameSource(), defaultGameDocumentOptions(), texts), 5)
  record(P, 'export: game document model, overview + mechanics + glossary (median of 5)', r.ms, undefined, `(${r.last.chapters.length} chapters, max ${r.max.toFixed(1)})`)
  const gd = r.last
  r = await timeSync(() => toMarkdown(gd), 5)
  record(P, 'export: game document as Markdown (median of 5)', r.ms, undefined, `(${(r.last.length / 1024).toFixed(0)} KB)`)

  await project.close()
}

// ---------------------------------------------------------------- browser phase
// Sums the main-thread duration of the usual rendering and scripting events (nested events count in their parent too).
function printTrace(tr) {
  const sums = new Map()
  for (const e of tr.traceEvents ?? tr)
    if (e.ph === 'X' && e.dur && /^(Layout|UpdateLayoutTree|Paint|PrePaint|Layerize|Commit|FunctionCall|EvaluateScript|RunMicrotasks|TimerFire|FireAnimationFrame|HitTest|IntersectionObserver)/.test(e.name))
      sums.set(e.name, (sums.get(e.name) ?? 0) + e.dur / 1000)
  console.log('  trace of conversation canvas switch (ms, nested events overlap):')
  for (const [k, v] of [...sums].sort((a, b) => b[1] - a[1])) console.log(`   ${v.toFixed(1)} ${k}`)
}
async function browserPhase() {
  const { chromium } = await import('playwright-core')
  const base = join(homedir(), '.cache/ms-playwright')
  const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
  const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })

  // Same Map-backed Storage as perf-m11.mjs (no localStorage quota).
  async function session(files, ROOT, title) {
    const now = Date.now()
    const seedData = {
      'storyworks:settings.json': JSON.stringify({
        version: 2, theme: 'light', language: 'en', uiZoom: 100, editorFontSize: 18,
        contextPanel: { hidden: false, collapsed: {} },
        recentProjects: [{ path: ROOT, title, openedAt: new Date().toISOString() }],
      }),
    }
    for (const [p, v] of Object.entries(files)) {
      seedData[`storyworks:project:${ROOT}/${p}`] = v
      seedData[`storyworks:projectmeta:${ROOT}/${p}`] = String(now - 10_000)
    }
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
    await ctx.addInitScript((data) => {
      const map = new Map(Object.entries(data))
      let keys = null
      const fake = {
        get length() { return map.size },
        key: (i) => (keys ??= [...map.keys()])[i] ?? null,
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => { if (!map.has(k)) keys = null; map.set(k, String(v)) },
        removeItem: (k) => { keys = null; map.delete(k) },
        clear: () => { keys = null; map.clear() },
      }
      Object.defineProperty(window, 'localStorage', { value: fake, configurable: true })
    }, seedData)
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
    await page.goto('http://localhost:1420/')
    await page.getByRole('heading', { level: 1 }).first().waitFor()
    await page.evaluate(() => {
      window.__frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
      window.__waitFor = (cond, maxMs = 20000) =>
        new Promise((resolve, reject) => {
          const t0 = performance.now()
          const tick = () => (cond() ? resolve() : performance.now() - t0 > maxMs ? reject(new Error('timeout')) : requestAnimationFrame(tick))
          tick()
        })
    })
    await page.getByRole('button', { name: 'Open project' }).click()
    const dlg = page.getByRole('dialog', { name: 'Projects in this browser' })
    const target = dlg.getByRole('button', { name: ROOT })
    await target.waitFor()
    const t1 = Date.now()
    await target.click()
    await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor({ timeout: 60000 })
    await page.waitForFunction(() => document.querySelectorAll('[role=treeitem]').length > 5, null, { polling: 'raf', timeout: 60000 })
    const openMs = Date.now() - t1
    const rows = await page.evaluate(() => document.querySelectorAll('[role=treeitem]').length)
    await page.waitForTimeout(1200)
    const skip = page.getByRole('button', { name: 'Skip tour' })
    if (await skip.count()) await skip.click()
    return { page, errors, openMs, rows, ctx }
  }

  // Click a tree row; time until `ready()` is true inside the page, and until painted.
  const switchTo = (page, rowId, readyBody) =>
    page.evaluate(
      async ([id, body]) => {
        const row = document.querySelector(`[data-row-id="${id}"]`)
        if (!row) return null
        const t = performance.now()
        row.click()
        await window.__waitFor(new Function(`return ${body}`))
        const shown = performance.now() - t
        await window.__frame()
        return [shown, performance.now() - t]
      },
      [rowId, readyBody],
    )

  // ---- screenplay
  {
    const P = 'browser-screenplay'
    const { page, errors, openMs, rows, ctx } = await session(sp.files, 'longscript', 'The Long Script')
    record(P, 'open: click to tree rows shown', openMs, 3000, `(${rows} rows rendered)`)
    const times = []
    const expandAll = async () => {
      for (const t of await page.$$('[role=treeitem][aria-expanded=false]')) await t.click().catch(() => {})
    }
    await expandAll()
    for (const k of [0, 9, 31, 55, 77, 99, 119]) {
      const id = sp.sceneIds[k]
      const first = JSON.parse(sp.files[sp.scenePaths[k]]).content.content.find((e) => e.type === 'action').content[0].text.slice(0, 40)
      const r = await switchTo(page, id, `document.querySelector('.ProseMirror')?.textContent.includes(${JSON.stringify(first)})`)
      if (r) times.push(r)
      await page.waitForTimeout(100)
    }
    if (times.length) {
      record(P, `item switch: editor shows text (median of ${times.length})`, median(times.map((t) => t[0])), 300, `(max ${max(times.map((t) => t[0])).toFixed(0)})`)
      record(P, 'item switch: painted (median)', median(times.map((t) => t[1])), 300, `(max ${max(times.map((t) => t[1])).toFixed(0)})`)
    } else console.log('screenplay: no scene rows in DOM to click')
    const pages = await page.evaluate(() => document.body.innerText.match(/Pages:\s*\d+[^\n]*/)?.[0] ?? null)
    console.log('  page count shown in the UI:', pages)
    // typing in the editor: time per keystroke until painted (page count recomputes)
    await page.locator('.ProseMirror').first().click()
    await page.keyboard.press('Control+End')
    const keys = []
    for (let i = 0; i < 15; i++) {
      const a = await page.evaluate(() => performance.now())
      await page.keyboard.type('x', { delay: 0 })
      await page.evaluate(() => window.__frame())
      keys.push((await page.evaluate(() => performance.now())) - a)
    }
    record(P, 'typing: keystroke to painted (median of 15; includes headless frame wait)', median(keys), 100, `(max ${max(keys).toFixed(0)})`)
    if (errors.length) console.log('screenplay page errors:', [...new Set(errors)].slice(0, 5))
    await ctx.close()
  }

  // ---- game
  {
    const P = 'browser-game'
    const { page, errors, openMs, rows, ctx } = await session(gm.files, 'longgame', 'The Long Game')
    record(P, 'open: click to tree rows shown', openMs, 3000, `(${rows} rows rendered)`)
    for (const t of await page.$$('[role=treeitem][aria-expanded=false]')) await t.click().catch(() => {})
    await page.waitForTimeout(300)
    const total = await page.evaluate(() => document.querySelectorAll('[role=treeitem]').length)
    console.log('  tree rows with folders expanded:', total)
    const times = []
    for (const id of ['sc0-1', 'sc2-3', 'sc5-5', 'sc7-2', 'sc9-9', 'sc4-4']) {
      const body = JSON.parse(gm.files[`manuscript/${id}.json`]).content.content[0].content[0].text
      const r = await switchTo(page, id, `document.querySelector('.ProseMirror')?.textContent.includes(${JSON.stringify(body.slice(0, 40))})`)
      if (r) times.push(r)
      await page.waitForTimeout(100)
    }
    if (times.length) {
      record(P, `item switch: script editor shows text (median of ${times.length})`, median(times.map((t) => t[0])), 300, `(max ${max(times.map((t) => t[0])).toFixed(0)})`)
      record(P, 'item switch: script painted (median)', median(times.map((t) => t[1])), 300)
    } else console.log('game: no script rows in DOM to click')
    const conv = []
    for (let i = 0; i < 5; i++) {
      await switchTo(page, 'sc1-1', `document.querySelector('.ProseMirror') && !document.querySelector('[data-graph-node]')`)
      await page.waitForTimeout(150)
      const trace = process.env.TRACE === '1' && i === 4
      if (trace) await browser.startTracing(page, { categories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline'] })
      const c = await switchTo(page, gm.convId, `document.querySelectorAll('[data-graph-node]').length > 5`)
      if (trace) printTrace(JSON.parse((await browser.stopTracing()).toString()))
      if (c) conv.push(c)
    }
    if (conv.length) {
      const nodes = await page.evaluate(() => document.querySelectorAll('[data-graph-node]').length)
      record(P, `item switch: conversation canvas shows nodes (${gm.convNodes} nodes, median of ${conv.length})`, median(conv.map((c) => c[0])), 300, `(${nodes} rendered, max ${max(conv.map((c) => c[0])).toFixed(0)})`)
      record(P, 'item switch: conversation canvas painted (median)', median(conv.map((c) => c[1])), 300, `(max ${max(conv.map((c) => c[1])).toFixed(0)})`)
    } else console.log('game: conversation row not in DOM')

    // game document: mechanics list
    const t = Date.now()
    await page.getByRole('link', { name: 'Game document' }).first().click()
    await page.getByTestId('gamedoc-tab-mechanics').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-mech]').length > 20, null, { polling: 'raf', timeout: 30000 })
    const listed = await page.evaluate(() => document.querySelectorAll('[data-mech]').length)
    record(P, 'game document: click to mechanics list shown', Date.now() - t, 300, `(${listed} rows in the DOM)`)
    // pick another mechanic
    const sel = []
    for (const id of ['m5', 'm120', 'm250', 'm299']) {
      const r = await page.evaluate(async (mid) => {
        const el = document.querySelector(`[data-mech="${mid}"]`)
        if (!el) return null
        const a = performance.now()
        el.click()
        await window.__waitFor(() => document.querySelector('.params tr, table.params, [data-testid=gamedoc-mechanics]') && document.querySelector('input[aria-label], input'))
        await window.__frame()
        return performance.now() - a
      }, id)
      if (r !== null) sel.push(r)
    }
    if (sel.length) record(P, `game document: select another mechanic, painted (median of ${sel.length})`, median(sel), 300, `(max ${max(sel).toFixed(0)})`)
    // filter by text: keystroke to painted
    const search = page.getByRole('searchbox').or(page.locator('input[type=search]')).or(page.getByPlaceholder(/search|filter/i)).first()
    if (await search.count()) {
      await search.click()
      const fk = []
      for (const ch of 'Mechanic 25') {
        const a = await page.evaluate(() => performance.now())
        await page.keyboard.type(ch, { delay: 0 })
        await page.evaluate(() => window.__frame())
        fk.push((await page.evaluate(() => performance.now())) - a)
      }
      const shown = await page.evaluate(() => document.querySelectorAll('[data-mech]').length)
      record(P, 'mechanics filter: keystroke to painted (max of 11; includes headless frame wait)', max(fk), 100, `(median ${median(fk).toFixed(0)}, ${shown} rows left)`)
    } else console.log('mechanics search field not found')
    // glossary tab
    const g0 = Date.now()
    await page.getByTestId('gamedoc-tab-glossary').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-entry]').length > 50, null, { polling: 'raf', timeout: 30000 })
    record(P, 'game document: click to glossary list shown', Date.now() - g0, 300, `(${await page.evaluate(() => document.querySelectorAll('[data-entry]').length)} rows in the DOM)`)
    if (errors.length) console.log('game page errors:', [...new Set(errors)].slice(0, 5))
    await ctx.close()
  }
  await browser.close()
}
