// Usage: node scripts/perf-m11.mjs [--node-only] [--scenes-per-chapter 10 ...] [--json out.json]
// M11 performance pass on a ~300 000-word book (1 500 scenes, 200 codex entries, 300 timeline nodes, rules, links).
// 1. Node phase: the fixture is built through the real project writer (scripts/perf-fixture.ts) in a memory folder,
//    then the real stores/functions are timed (open, search, switcher, checks, mentions, backup, stats, export model, spell).
// 2. Browser phase (needs `yarn dev` on :1420 + a Playwright chromium; skipped with --node-only): the same files go into
//    the browser build's virtual folder and the Write UI is timed (open to tree, scene switch, search and switcher per keystroke).
import { createServer } from 'vite'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
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

// ---------------------------------------------------------------- fixture
const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
})
const load = (p) => vite.ssrLoadModule(p)
const { buildFixture } = await load('/scripts/perf-fixture.ts')
let t0 = performance.now()
const fx = await buildFixture()
const bytes = Object.values(fx.files).reduce((s, v) => s + v.length, 0)
console.log(
  `fixture: ${fx.sceneIds.length} scenes, ${fx.totalWords} words, ${Object.keys(fx.files).length} files, ${(bytes / 1048576).toFixed(1)} MB, built in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
)

if (!process.argv.includes('--no-node')) await nodePhase()
if (!NODE_ONLY) await browserPhase()

// ---------------------------------------------------------------- report
console.log('\n| Phase | Metric | ms | Budget | |')
console.log('|---|---|---:|---:|---|')
for (const r of results) {
  const ok = r.budget === undefined ? '' : r.ms <= r.budget ? 'ok' : 'SLOW'
  console.log(
    `| ${r.phase} | ${r.name} | ${r.ms.toFixed(1)} | ${r.budget ?? ''} | ${ok} ${r.note} |`,
  )
}
const out = arg('json')
if (out) writeFileSync(out, JSON.stringify(results, null, 1))
await vite.close()
process.exit(0)

// ---------------------------------------------------------------- node phase
async function nodePhase() {
  const { createPinia, setActivePinia } = await load('pinia')
  const { createMemoryProjectIO } = await load('/src/project/io/memory.ts')
  const { createMemoryFileIO } = await load('/src/io/fileIO.ts')
  const settingsStore = await load('/src/settings/store.ts')
  const projectStore = await load('/src/project/store.ts')
  settingsStore.setFileIOFactory(() => createMemoryFileIO())
  const io = createMemoryProjectIO(fx.files)
  projectStore.setProjectIOFactory(() => io)
  setActivePinia(createPinia())
  const project = projectStore.useProjectStore()

  // stores that react to the opening
  const { useSearchStore } = await load('/src/search/store.ts')
  const { useChecksStore } = await load('/src/checks/store.ts')
  const search = useSearchStore()
  const checks = useChecksStore()

  // ---- open
  let r = await timeAsync(() => project.open('book'))
  if (r.last !== 'opened') throw new Error(`open: ${r.last}`)
  record(
    'node',
    'open: all files read, stores loaded',
    r.ms,
    3000,
    `(${project.wordCounts.get('')} words counted)`,
  )

  // ---- search index fill (background)
  r = await timeAsync(async () => {
    const t = performance.now()
    while (search.loadingBodies || performance.now() - t < 50) {
      await new Promise((res) => setTimeout(res, 5))
      if (performance.now() - t > 60000) throw new Error('search fill timeout')
    }
  })
  record('node', 'search: background body indexing (off the typing path)', r.ms)

  // ---- search + switcher per keystroke
  const QUERIES = ['silence', 'Marker777z', 'the road', 'a', 'e', 'Kellen']
  for (const q of QUERIES) {
    const keys = []
    for (let i = 1; i <= q.length; i++) {
      const t = performance.now()
      search.find(q.slice(0, i))
      keys.push(performance.now() - t)
    }
    record(
      'node',
      `search "${q}" per keystroke (max of ${q.length})`,
      max(keys),
      100,
      `(median ${median(keys).toFixed(1)})`,
    )
  }
  for (const q of ['Kellen', 'Scene 77', 'Event 1.5', 'e']) {
    const keys = []
    for (let i = 1; i <= q.length; i++) {
      const t = performance.now()
      search.switchList(q.slice(0, i))
      keys.push(performance.now() - t)
    }
    record(
      'node',
      `switcher "${q}" per keystroke (max of ${q.length})`,
      max(keys),
      100,
      `(median ${median(keys).toFixed(1)})`,
    )
  }

  // ---- scene switch (read + validate one scene file; the editor mount is timed in the browser phase)
  r = await timeAsync((i) => project.loadScene(fx.scenePaths[i * 70]), 20)
  record('node', 'scene switch: loadScene (median of 20)', r.ms, 300, `(max ${r.max.toFixed(1)})`)

  // ---- checks run on the full book
  r = await timeAsync(() => checks.run(), 3)
  record(
    'node',
    'checks: gather + run (median of 3)',
    r.ms,
    2000,
    `(${checks.findings.length} findings, max ${r.max.toFixed(0)})`,
  )
  const { gatherCheckData } = await load('/src/checks/gather.ts')
  const { runChecks } = await load('/src/checks/run.ts')
  const g = await timeAsync(() => gatherCheckData(), 3)
  record('node', 'checks: gatherCheckData only', g.ms)
  const rc = await timeSync(() => runChecks(g.last, () => true), 3)
  record('node', 'checks: runChecks only', rc.ms)

  // ---- mentions scan (one entry = loads every scene)
  const { scanMentions } = await load('/src/codex/mentionActions.ts')
  const e0 = { id: 'e3', name: fx.entryNames[3], aliases: [fx.entryNames[3].split(' ')[0]] }
  r = await timeAsync(
    (i) =>
      scanMentions({
        ...e0,
        id: `e${3 + i}`,
        name: fx.entryNames[3 + i],
        aliases: [fx.entryNames[3 + i].split(' ')[0]],
      }),
    3,
  )
  record(
    'node',
    'mentions: scan one entry over all scenes (median of 3)',
    r.ms,
    1300,
    `(${r.last.length} mentions, max ${r.max.toFixed(0)})`,
  )
  const { findMentions } = await load('/src/codex/mentions.ts')
  const scenes = []
  for (const p of fx.scenePaths)
    scenes.push({ id: p.slice(11, -5), content: (await project.loadScene(p)).value.content })
  r = await timeSync(() => findMentions(e0, scenes, [], new Set()), 5)
  record('node', 'mentions: findMentions only (scenes in memory)', r.ms)

  // ---- stats update (a keystroke that adds a word) and word roll-up
  const sid = fx.sceneIds[700]
  const sp = fx.scenePaths[700]
  const cur = (await project.loadScene(sp)).value
  r = await timeAsync(async (i) => {
    await project.setSceneContent(sid, cur.content, cur.wordCount + i + 1)
    void project.wordCounts.get('')
  }, 10)
  record(
    'node',
    'stats/word-count: setSceneContent + roll-up (median of 10)',
    r.ms,
    50,
    `(max ${r.max.toFixed(1)})`,
  )
  const { useStatsStore } = await load('/src/stats/store.ts')
  const stats = useStatsStore()
  r = await timeAsync(() => stats.recordEdit(1), 20)
  record('node', 'stats: recordEdit (median of 20)', r.ms, 50)

  // ---- snapshot / backup
  const { makeBackup } = await load('/src/history/backups.ts')
  const { createMemoryEngine } = await load('/src/history/memoryEngine.ts')
  const { loadChanges, createSnapshot } = await load('/src/history/snapshot.ts')
  const env = { now: () => Date.now(), newId: () => Math.random().toString(36).slice(2) }
  await project.flush?.()
  r = await timeAsync(() => makeBackup(io, env, 'auto'))
  record('node', 'backup: copy whole book (memory folder)', r.ms)
  const engine = createMemoryEngine(io, env)
  r = await timeAsync(() => loadChanges(engine, io))
  record('node', 'snapshot: list changes, first snapshot', r.ms)
  r = await timeAsync(() => createSnapshot(engine, io, env, { keys: 'all' }))
  record('node', 'snapshot: create (TS side + memory engine; git commit is Rust)', r.ms)
  io.files.set(sp, io.files.get(sp) + ' ')
  r = await timeAsync(() => loadChanges(engine, io))
  record('node', 'snapshot: list changes after one edit', r.ms)

  // ---- export model (all chapters, no PDF render)
  const { projectExportSource } = await load('/src/export/source.ts')
  const { prepareExport } = await load('/src/export/prepare.ts')
  const { defaultExportOptions } = await load('/src/export/options.ts')
  const src = projectExportSource({ titles: {}, labels: {} })
  const chapterIds = []
  const walk = (ns) =>
    ns.forEach((n) => (n.type === 'chapter' ? chapterIds.push(n.id) : walk(n.children)))
  walk(project.tree)
  r = await timeAsync(() => prepareExport(src, chapterIds, defaultExportOptions()), 2)
  record(
    'node',
    'export: model build, all chapters (load scenes + convert + appendices)',
    r.ms,
    undefined,
    `(${chapterIds.length} chapters, max ${r.max.toFixed(0)})`,
  )

  // ---- spell check of one scene
  const { createSpellEngine } = await load('/src/spell/engine.ts')
  const dict = (lang, n) => readFileSync(join('public/dictionaries', lang, n), 'utf8')
  const { blockTexts } = await load('/src/codex/mentions.ts')
  const sceneTexts = blockTexts((await project.loadScene(fx.scenePaths[10])).value.content).map(
    (b) => b.text,
  )
  for (const lang of ['en', 'pl']) {
    const eng = createSpellEngine({
      load: async () => ({
        kind: 'hunspell',
        aff: dict(lang, 'index.aff'),
        dic: dict(lang, 'index.dic'),
      }),
    })
    r = await timeAsync(() => eng.setDictionaries([{ name: lang, scope: 'global' }], []))
    if (!eng.active) throw new Error('spell engine inactive')
    record('node', `spell: build ${lang} dictionary (once per session, in a worker)`, r.ms)
    r = await timeSync(() => sceneTexts.forEach((t) => eng.checkText(t)), 5)
    record(
      'node',
      `spell: check one scene, ${lang} (~200 words)`,
      r.ms,
      100,
      `(max ${r.max.toFixed(1)}, ${sceneTexts.join(' ').split(' ').length} words)`,
    )
  }

  await project.close()
}

// ---------------------------------------------------------------- browser phase
async function browserPhase() {
  const { chromium } = await import('playwright-core')
  const ROOT = 'longbook'
  const base = join(homedir(), '.cache/ms-playwright')
  const dir = readdirSync(base)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .pop()
  const browser = await chromium.launch({
    executablePath: join(base, dir, 'chrome-linux64/chrome'),
    args: ['--no-sandbox'],
  })
  const now = Date.now()
  // Chrome caps localStorage at ~5 M chars and the 300k-word book is ~5 MB, so the page gets a Map-backed Storage
  // (like the Tauri build, which reads files from disk, not from a quota-limited store).
  const seedData = {
    'storyworks:settings.json': JSON.stringify({
      version: 2,
      theme: 'light',
      language: 'en',
      uiZoom: 100,
      editorFontSize: 18,
      contextPanel: { hidden: false, collapsed: {} },
      recentProjects: [{ path: ROOT, title: 'The Long Book', openedAt: new Date().toISOString() }],
    }),
  }
  for (const [p, v] of Object.entries(fx.files)) {
    seedData[`storyworks:project:${ROOT}/${p}`] = v
    seedData[`storyworks:projectmeta:${ROOT}/${p}`] = String(now - 10_000)
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript((data) => {
    const map = new Map(Object.entries(data))
    let keys = null
    const fake = {
      get length() {
        return map.size
      },
      key: (i) => (keys ??= [...map.keys()])[i] ?? null,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        if (!map.has(k)) keys = null
        map.set(k, String(v))
      },
      removeItem: (k) => {
        keys = null
        map.delete(k)
      },
      clear: () => {
        keys = null
        map.clear()
      },
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
    window.__waitFor = (cond, max = 20000) =>
      new Promise((resolve, reject) => {
        const t0 = performance.now()
        const tick = () =>
          cond()
            ? resolve()
            : performance.now() - t0 > max
              ? reject(new Error('timeout'))
              : requestAnimationFrame(tick)
        tick()
      })
  })

  await page.getByRole('button', { name: 'Open project' }).click()
  const dlg = page.getByRole('dialog', { name: 'Projects in this browser' })
  const target = dlg.getByRole('button', { name: ROOT })
  await target.waitFor()
  await page.evaluate(() => {
    window.__long = []
    new PerformanceObserver((l) =>
      window.__long.push(...l.getEntries().map((e) => e.duration)),
    ).observe({ type: 'longtask' })
  })
  const profile = process.env.PROFILE === '1'
  const cdp = profile ? await ctx.newCDPSession(page) : null
  if (cdp) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
  }
  const t1 = Date.now()
  await target.click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor({ timeout: 60000 })
  await page.waitForFunction(() => document.querySelectorAll('[role=treeitem]').length > 10, null, {
    polling: 'raf',
    timeout: 60000,
  })
  record('browser', 'open: click to first tree rows shown', Date.now() - t1, 3000)
  const rows = await page.evaluate(() => document.querySelectorAll('[role=treeitem]').length)
  await page.waitForFunction(
    () => document.querySelectorAll('[role=treeitem] .dot').length > 10,
    null,
    { polling: 'raf', timeout: 60000 },
  )
  record(
    'browser',
    'open: click to tree with statuses',
    Date.now() - t1,
    3000,
    `(${rows} rows rendered)`,
  )
  if (cdp) {
    const { profile: prof } = await cdp.send('Profiler.stop')
    const self = new Map()
    const byId = new Map(prof.nodes.map((nd) => [nd.id, nd]))
    prof.samples.forEach((id, i) => {
      const nd = byId.get(id)
      const key = `${nd.callFrame.functionName || '(anon)'} ${nd.callFrame.url.split('/').slice(-2).join('/')}:${nd.callFrame.lineNumber}`
      self.set(key, (self.get(key) ?? 0) + (prof.timeDeltas[i] ?? 0))
    })
    console.log('  top self time (ms) during open:')
    for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 14))
      console.log(`   ${(v / 1000).toFixed(1)} ${k}`)
  }
  await page.waitForTimeout(1500)
  const skip = page.getByRole('button', { name: 'Skip tour' })
  if (await skip.count()) await skip.click()

  // scene switch via the tree
  const sceneSwitch = (id, k) =>
    page.evaluate(
      async ([sid, key]) => {
        const t = performance.now()
        document.querySelector(`[data-row-id="${sid}"]`).click()
        await window.__waitFor(() =>
          document.querySelector('.ProseMirror')?.textContent.includes(`Marker${key}z`),
        )
        const editor = performance.now() - t
        await window.__frame()
        return [editor, performance.now() - t]
      },
      [id, k],
    )
  // rows are windowed or all rendered? scroll target into view by expanding as needed
  const tried = []
  for (const k of [0, 75, 310, 640, 900, 1200, 1499]) {
    const id = fx.sceneIds[k]
    const present = await page.evaluate(
      (sid) => !!document.querySelector(`[data-row-id="${sid}"]`),
      id,
    )
    if (!present) continue
    tried.push(await sceneSwitch(id, k))
    await page.waitForTimeout(80)
  }
  if (tried.length) {
    record(
      'browser',
      `scene switch: editor shows text (median of ${tried.length})`,
      median(tried.map((t) => t[0])),
      300,
      `(max ${max(tried.map((t) => t[0])).toFixed(0)})`,
    )
    record('browser', 'scene switch: painted (median)', median(tried.map((t) => t[1])), 300)
  } else console.log('no scene rows in DOM to click')

  // search dialog + switcher: per-keystroke time until results update
  async function typeTimes(openKeys, inputSel, text, resultSel) {
    await page.keyboard.press(openKeys)
    const input = page.locator(inputSel).first()
    await input.waitFor()
    await page.waitForTimeout(300)
    const times = []
    for (const ch of text) {
      const t = await page.evaluate(
        async (sel) => {
          const before = document.querySelector(sel.res)?.innerHTML ?? ''
          window.__t0 = performance.now()
          return before.length
        },
        { res: resultSel },
      )
      void t
      const start = Date.now()
      const p0 = await page.evaluate(() => performance.now())
      await page.keyboard.type(ch, { delay: 0 })
      await page.evaluate(() => window.__frame())
      const p1 = await page.evaluate(() => performance.now())
      times.push(p1 - p0)
      void start
    }
    const shown = await page.evaluate(
      () => document.querySelector('[role=dialog]')?.innerText.length ?? 0,
    )
    if (shown < 40) throw new Error(`overlay shows no results (${shown} chars)`)
    console.log(
      `  overlay text after typing: ${shown} chars`,
      JSON.stringify(
        await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText.slice(0, 260)),
      ),
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    return times
  }
  await page.keyboard.press('Control+Shift+F')
  await page.locator('[role=dialog] input').first().fill('Marker1499z')
  await page.waitForFunction(
    () => /Scene 1500/.test(document.querySelector('[role=dialog]')?.innerText ?? ''),
    null,
    { polling: 100, timeout: 120000 },
  )
  const long = await page.evaluate(() => window.__long)
  record(
    'browser',
    'open + index fill: longest main-thread task',
    max([0, ...long]),
    undefined,
    `(${long.length} tasks over 50 ms, total ${long.reduce((a, b) => a + b, 0).toFixed(0)} ms)`,
  )
  record(
    'browser',
    'search: last scene searchable, from open click (background, off typing path)',
    Date.now() - t1,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].length)
  void inputs
  try {
    const st = await typeTimes('Control+Shift+F', '[role=dialog] input', 'silence', '[role=dialog]')
    record(
      'browser',
      'search dialog: keystroke to painted (max of 7)',
      max(st),
      100,
      `(median ${median(st).toFixed(0)}; includes headless frame wait)`,
    )
  } catch (e) {
    console.log('search dialog not measured:', e.message)
  }
  try {
    const sw = await typeTimes('Control+p', '[role=dialog] input', 'Kellen', '[role=dialog]')
    record(
      'browser',
      'switcher: keystroke to painted (max of 6)',
      max(sw),
      100,
      `(median ${median(sw).toFixed(0)}; includes headless frame wait)`,
    )
  } catch (e) {
    console.log('switcher not measured:', e.message)
  }
  if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 5))
  await browser.close()
}
