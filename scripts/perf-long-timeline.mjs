// Usage: node scripts/perf-long-timeline.mjs [--nodes 300]
// Needs `yarn dev` on :1420 and a Playwright chromium. Creates a project in the browser build,
// swaps in a generated branching timeline (written into the virtual folder), then times the UI.
import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : def
}
const NODES = arg('nodes', 300)
const URL = 'http://localhost:1420/'
const ROOT = 'longtl'
const KEY = `storyworks:project:${ROOT}/`

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({
  executablePath: join(base, dir, 'chrome-linux64/chrome'),
  args: ['--no-sandbox'],
})
const settings = JSON.stringify({
  version: 2, theme: 'light', language: 'en', uiZoom: 100, editorFontSize: 18,
  contextPanel: { hidden: false, collapsed: {} }, recentProjects: [],
})

// ---------- create a project through the UI, then dump its virtual folder ----------
const c1 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
const p1 = await c1.newPage()
await p1.addInitScript((s) => {
  if (!localStorage.getItem('storyworks:settings.json')) localStorage.setItem('storyworks:settings.json', s)
}, settings)
await p1.goto(URL)
await p1.getByRole('button', { name: 'New project' }).click()
const dlg = p1.getByRole('dialog', { name: 'New project' })
await dlg.getByLabel('Book title').fill('Long Timeline')
await dlg.getByLabel('Author').fill('Perf')
await dlg.getByLabel('Project name').fill(ROOT)
await dlg.getByRole('button', { name: 'Create project' }).click()
await p1.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
await p1.waitForTimeout(600)
const dump = await p1.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
await c1.close()

// ---------- generate ----------
const manifest = JSON.parse(dump[`${KEY}project.json`])
const ref = manifest.timelines[0]
const tlKey = `${KEY}${ref.path}`
let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const COLORS = ['#c0392b', '#2e7d32', '#1565c0', '#8e44ad', '#ef6c00', '#00838f']
const branches = COLORS.map((color, i) => ({ id: `br${i}`, name: `Branch ${i + 1}`, color, dashed: i % 2 === 1 }))
const nodes = []
const edges = []
let eid = 0
const edge = (from, to) => edges.push({ id: `e${eid++}`, from, to })
let dateYear = 1000
const mk = (i, branchId, x, y) => {
  const dated = rnd() < 0.7
  nodes.push({
    id: `n${i}`, title: `Event ${i}`, description: { type: 'doc', content: [] },
    date: dated ? { year: dateYear + Math.floor(i / 3), month: Math.floor(rnd() * 12), day: 1 + Math.floor(rnd() * 28) } : null,
    color: null, tag: rnd() < 0.3 ? ['war', 'love', 'trade'][Math.floor(rnd() * 3)] : null,
    branchId, pos: { x, y }, codexIds: [], ruleIds: [],
  })
}
let i = 0
let mainPrev = null
let x = 0
while (i < NODES) {
  mk(i, null, x, 0)
  const main = `n${i}`
  if (mainPrev) edge(mainPrev, main)
  mainPrev = main
  i++
  x += 260
  // every 10th main event forks a short branch that merges back two events later
  if (i % 8 === 0 && i + 8 < NODES) {
    const b = Math.floor(i / 8) % branches.length
    let prev = main
    for (let k = 0; k < 4 && i < NODES; k++) {
      mk(i, branches[b].id, x + k * 260 - 260, 160 + (b % 3) * 120)
      edge(prev, `n${i}`)
      prev = `n${i}`
      i++
    }
    mk(i, null, x + 260, 0)
    edge(mainPrev, `n${i}`)
    edge(prev, `n${i}`) // merge
    mainPrev = `n${i}`
    i++
    x += 260 * 3
  }
}
const timeline = { version: 1, id: ref.id, name: 'Long', view: 'flow', branches, nodes, edges }
dump[tlKey] = JSON.stringify(timeline)
console.log(`generated ${nodes.length} nodes, ${edges.length} edges`)

// ---------- open in a fresh context ----------
const ls = Object.entries(dump).map(([name, value]) => ({ name, value }))
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 }, locale: 'en-US',
  storageState: { cookies: [], origins: [{ origin: 'http://localhost:1420', localStorage: ls }] },
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
await page.goto(URL)
await page.getByRole('heading', { level: 1 }).first().waitFor()
await page.evaluate(() => {
  window.__frames = async (n, step) => {
    const times = []
    let last = performance.now()
    for (let k = 0; k < n; k++) {
      step?.(k)
      await new Promise((r) => requestAnimationFrame(r))
      const t = performance.now()
      times.push(t - last)
      last = t
    }
    times.sort((a, b) => a - b)
    return { avg: times.reduce((a, b) => a + b, 0) / n, p95: times[Math.floor(n * 0.95)], max: times[n - 1] }
  }
})
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')

await page.getByRole('button', { name: 'Open project' }).click()
await page.getByRole('dialog', { name: 'Projects in this browser' }).getByRole('button', { name: ROOT }).click()
await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
await page.waitForTimeout(500)

const t0 = Date.now()
await page.getByRole('link', { name: /Timelines/ }).first().click()
await page.waitForFunction((k) => document.querySelectorAll('[data-graph-node]').length >= k, nodes.length, {
  polling: 'raf', timeout: 60000,
})
console.log(`open timeline (all ${nodes.length} nodes in DOM): ${Date.now() - t0} ms`)
await page.waitForTimeout(800)

const pane = page.locator('.vue-flow__pane').first()
const box = await pane.boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

// pan: drag the empty pane, sample frame times while moving
await page.mouse.move(cx, box.y + box.height - 30)
await page.mouse.down()
const panStats = page.evaluate(() => window.__frames(60))
for (let k = 0; k < 60; k++) await page.mouse.move(cx - k * 6, box.y + box.height - 30 - k)
await page.mouse.up()
console.log(`pan frames: ${fmt(await panStats)} ms`)

// zoom: wheel
await page.mouse.move(cx, cy)
const zoomStats = page.evaluate(() => window.__frames(40))
for (let k = 0; k < 20; k++) await page.mouse.wheel(0, k < 10 ? -120 : 120)
console.log(`zoom frames: ${fmt(await zoomStats)} ms`)

// drag a node: latency of pointer move -> next frame
await page.getByRole('button', { name: 'Fit to view' }).click()
await page.waitForTimeout(500)
const node = page.locator('[data-graph-node]').first()
const nb = await node.boundingBox()
await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2)
await page.mouse.down()
const lat = []
for (let k = 1; k <= 30; k++) {
  const t = await page.evaluate(async () => performance.now())
  await page.mouse.move(nb.x + nb.width / 2 + k * 3, nb.y + nb.height / 2 + k * 2)
  lat.push(await page.evaluate(async (t1) => { await new Promise((r) => requestAnimationFrame(r)); return performance.now() - t1 }, t))
}
await page.mouse.up()
lat.sort((a, b) => a - b)
console.log(`node drag move->frame: median ${lat[15].toFixed(1)}, max ${lat[29].toFixed(1)} ms (includes 2 CDP round trips)`)

// view switch
const t1 = Date.now()
await page.getByRole('button', { name: 'By date' }).click()
await page.waitForFunction(() => document.querySelectorAll('.tick').length > 0 || document.querySelector('.lane'), null, { polling: 'raf' })
console.log(`switch to date view: ${Date.now() - t1} ms`)
await page.waitForTimeout(500)
const dateZoom = page.evaluate(() => window.__frames(40))
for (let k = 0; k < 20; k++) await page.mouse.wheel(0, k < 10 ? -120 : 120)
console.log(`date view zoom frames: ${fmt(await dateZoom)} ms`)

// order helper: 1000 compare calls
const cmp = await page.evaluate(async (tl) => {
  const { compare } = await import('/src/timeline/order.ts')
  const { gregorianCalendar } = await import('/src/calendar/index.ts')
  const calendar = gregorianCalendar('g')
  const ctx = { calendar, timeline: (id) => (id === tl.id ? tl : undefined) }
  const ids = tl.nodes.map((n) => n.id)
  const run = (pairs) => {
    const t = performance.now()
    for (const [a, b] of pairs)
      compare({ node: { timelineId: tl.id, nodeId: a } }, { node: { timelineId: tl.id, nodeId: b } }, ctx)
    return performance.now() - t
  }
  let s = 5
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const pairs = Array.from({ length: 1000 }, () => [ids[Math.floor(r() * ids.length)], ids[Math.floor(r() * ids.length)]])
  const cold = run(pairs)
  const warm = run(pairs)
  // worst case: undated pairs (path search), fresh timeline copy so the cache is cold
  const undated = tl.nodes.filter((n) => !n.date).map((n) => n.id)
  const tl2 = { ...tl, nodes: [...tl.nodes], edges: [...tl.edges] }
  const ctx2 = { calendar, timeline: () => tl2 }
  const up = Array.from({ length: 1000 }, () => [undated[Math.floor(r() * undated.length)], undated[Math.floor(r() * undated.length)]])
  const t = performance.now()
  for (const [a, b] of up)
    compare({ node: { timelineId: tl.id, nodeId: a } }, { node: { timelineId: tl.id, nodeId: b } }, ctx2)
  return { cold, warm, undatedCold: performance.now() - t }
}, timeline)
console.log(`1000 compare: cold ${cmp.cold.toFixed(1)} ms, warm ${cmp.warm.toFixed(1)} ms, undated-only cold ${cmp.undatedCold.toFixed(1)} ms`)

console.log(errors.length ? `ERRORS: ${[...new Set(errors)].join(' | ')}` : 'no console errors')
await browser.close()
