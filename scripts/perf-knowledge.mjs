// Usage: node scripts/perf-knowledge.mjs [--entries 100 --items 60 --learnings 200 --blocks 300]
// Needs `yarn dev` on :1420 and a Playwright chromium. Seeds the browser build's virtual folder, then times the
// matrix render and arrow-key latency, an entry's Knowledge tab with many learnings, and a page with many knowledge-linked blocks.
import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : def
}
const ENTRIES = arg('entries', 100)
const ITEMS = arg('items', 60)
const LEARNINGS = arg('learnings', 200)
const BLOCKS = arg('blocks', 300)
const ROOT = 'knperf'
let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const files = {}
const typeId = randomUUID()
files[`codex/types/${typeId}.json`] = JSON.stringify({ version: 1, id: typeId, name: 'Character', color: '#8e44ad', icon: 'person' })
const mkEntry = (name) => ({ version: 2, id: randomUUID(), typeId, name, aliases: [], image: null, notes: { type: 'doc', content: [] }, tags: [], ruleIds: [], appendixText: '', includeInAppendices: false, states: [] })
const entries = Array.from({ length: ENTRIES }, (_, i) => mkEntry(i === 0 ? 'Hero' : `Person ${i}`))
const tlId = randomUUID()
const NODES = 80
const nodes = Array.from({ length: NODES }, (_, i) => ({
  id: randomUUID(), title: `Event ${i}`, description: { type: 'doc', content: [] },
  date: i % 2 === 0 ? { year: 1400 + Math.floor(i / 12), month: i % 12, day: 1 + (i % 28) } : null,
  color: null, tag: null, branchId: null, pos: { x: i * 40, y: (i % 5) * 60 }, codexIds: [], ruleIds: [],
}))
const edges = nodes.slice(1).map((n, i) => ({ id: randomUUID(), from: nodes[i].id, to: n.id }))
files[`timelines/${tlId}.json`] = JSON.stringify({ version: 1, id: tlId, name: 'Main timeline', view: 'flow', branches: [], nodes, edges })
const at = () => ({ node: { timelineId: tlId, nodeId: nodes[Math.floor(rnd() * NODES)].id } })
const items = Array.from({ length: ITEMS }, (_, i) => ({ version: 1, id: randomUUID(), title: `Secret ${i}`, description: { type: 'doc', content: [] }, tags: [], about: null, learnings: [] }))
// matrix: ~30% filled; plus LEARNINGS for Hero across the items (several per item)
for (const e of entries) for (const it of items) if (rnd() < 0.3) it.learnings.push({ id: randomUUID(), entryId: e.id, at: at(), note: '', forgottenAt: rnd() < 0.3 ? at() : null, revealedIn: null })
for (let i = 0; i < LEARNINGS; i++) items[i % ITEMS].learnings.push({ id: randomUUID(), entryId: entries[0].id, at: at(), note: '', forgottenAt: null, revealedIn: null })
const itemRefs = items.map((k) => {
  files[`knowledge/${k.id}.json`] = JSON.stringify(k)
  return { id: k.id, path: `knowledge/${k.id}.json`, title: k.title }
})
const entryRefs = entries.map((e) => {
  files[`codex/${e.id}.json`] = JSON.stringify(e)
  return { id: e.id, path: `codex/${e.id}.json`, title: e.name }
})
// one scene with BLOCKS paragraphs, each linked to a (item, entry) pair
const sceneId = randomUUID()
const blockIds = Array.from({ length: BLOCKS }, () => randomUUID())
const links = blockIds.map((b, i) => ({ id: randomUUID(), kind: 'knowledge', from: { item: sceneId, block: b }, to: { item: items[i % ITEMS].id, entry: entries[i % ENTRIES].id } }))
files[`manuscript/${sceneId}.json`] = JSON.stringify({
  version: 3, id: sceneId, title: 'Long scene', status: 'draft', synopsis: '', wordCount: BLOCKS * 6,
  content: { type: 'doc', content: blockIds.map((b, i) => ({ type: 'paragraph', attrs: { id: b }, content: [{ type: 'text', text: `Paragraph ${i} has a few words in it.` }] })) },
  todos: [], comments: [], links,
})
files['project.json'] = JSON.stringify({
  version: 9, kind: 'book', title: 'Knowledge Perf', author: 'Perf Tester', language: 'en', createdAt: new Date().toISOString(),
  manuscript: [{ id: randomUUID(), type: 'part', title: 'Part 1', children: [{ id: sceneId, type: 'scene', title: 'Long scene', path: `manuscript/${sceneId}.json`, children: [] }] }],
  codexTypes: [{ id: typeId, path: `codex/types/${typeId}.json`, title: 'Character' }], codexEntries: entryRefs,
  timelines: [{ id: tlId, path: `timelines/${tlId}.json`, title: 'Main timeline' }], knowledge: itemRefs,
})
console.log(`generated ${ENTRIES} entries x ${ITEMS} items (${items.reduce((a, k) => a + k.learnings.length, 0)} learnings), Hero has ${LEARNINGS + items.reduce((a, k) => a + k.learnings.filter((l) => l.entryId === entries[0].id).length, 0) - LEARNINGS}, ${BLOCKS} linked blocks`)

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })
const now = Date.now()
const ls = [{ name: 'storyworks:settings.json', value: JSON.stringify({ version: 2, theme: 'light', language: 'en', uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: [{ path: ROOT, title: 'Knowledge Perf', openedAt: new Date().toISOString() }] }) }]
for (const [p, v] of Object.entries(files)) {
  ls.push({ name: `storyworks:project:${ROOT}/${p}`, value: v })
  ls.push({ name: `storyworks:projectmeta:${ROOT}/${p}`, value: String(now - 10_000) })
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: { cookies: [], origins: [{ origin: 'http://localhost:1420', localStorage: ls }] } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto('http://localhost:1420/')
await page.getByRole('heading', { level: 1 }).first().waitFor()
const t0 = Date.now()
await page.getByRole('button', { name: 'Open project' }).click()
await page.getByRole('dialog', { name: 'Projects in this browser' }).getByRole('button', { name: ROOT }).click()
await page.getByRole('link', { name: /^\s*Codex/ }).first().waitFor()
console.log(`project open: ${Date.now() - t0} ms`)
await page.evaluate(() => {
  window.__long = []
  new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => e.duration))).observe({ type: 'longtask' })
})
// matrix
await page.getByRole('link', { name: /^\s*Codex/ }).first().click()
await page.waitForTimeout(500)
let t = Date.now()
await page.getByRole('link', { name: 'Knowledge matrix' }).first().click()
await page.waitForFunction((n) => document.querySelectorAll('td.cell').length >= n, ENTRIES * ITEMS, { timeout: 60000 })
console.log(`matrix render (${await page.locator('td.cell').count()} cells): ${Date.now() - t} ms`)
await page.locator('td.cell[data-r="0"][data-c="0"]').focus()
const lat = []
for (let i = 0; i < 30; i++) {
  const key = ['ArrowRight', 'ArrowDown'][i % 2]
  const ms = await page.evaluate(
    (k) => new Promise((res) => {
      const t1 = performance.now()
      const before = document.activeElement
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
      requestAnimationFrame(() => res(document.activeElement !== before ? performance.now() - t1 : -1))
    }),
    key,
  )
  lat.push(ms)
}
lat.sort((a, b) => a - b)
console.log(`matrix arrow-key latency: median ${lat[15].toFixed(1)} ms, max ${lat[29].toFixed(1)} ms (focus moved on ${lat.filter((x) => x >= 0).length}/30)`)
t = Date.now()
const asOfG = page.getByRole('group', { name: 'As of', exact: true })
await asOfG.getByRole('button', { name: /Choose event/ }).click()
const pd = page.getByRole('dialog', { name: 'Choose an event' })
await pd.waitFor()
await pd.getByRole('combobox').fill('Event 40')
await page.keyboard.press('Enter')
await page.waitForFunction(() => document.querySelectorAll('td.cell.not-yet').length > 0, null, { timeout: 60000 })
console.log(`matrix As-of apply: ${Date.now() - t} ms`)
// entry with many learnings
await page.getByRole('link', { name: /^\s*Codex/ }).first().click()
await page.locator('aside button.item', { hasText: /^\s*Hero/ }).first().click()
t = Date.now()
await page.getByRole('tab', { name: /^Knowledge/ }).click()
await page.waitForFunction((n) => document.querySelectorAll('.ek ol.rows > li').length >= n, LEARNINGS, { timeout: 60000 })
console.log(`entry Knowledge tab (${await page.locator('.ek ol.rows > li').count()} rows): ${Date.now() - t} ms`)
t = Date.now()
await page.getByRole('tab', { name: /^Chronicle/ }).click()
await page.waitForFunction((n) => document.querySelectorAll('.chronicle ol.list > li').length >= n, LEARNINGS, { timeout: 60000 })
console.log(`entry Chronicle tab (${await page.locator('.chronicle ol.list > li').count()} rows): ${Date.now() - t} ms`)
// page with many knowledge-linked blocks
t = Date.now()
await page.getByRole('link', { name: /Write/ }).first().click()
await page.getByRole('treeitem', { name: /Long scene/ }).first().click()
await page.waitForFunction((n) => document.querySelectorAll('[data-marker-block]').length >= n, BLOCKS, { timeout: 60000 })
console.log(`editor gutter (${await page.locator('[data-marker-block]').count()} markers): ${Date.now() - t} ms`)
await page.locator('.ProseMirror p').nth(150).click()
t = Date.now()
await page.keyboard.type('x')
await page.waitForTimeout(50)
console.log(`keystroke with ${BLOCKS} linked blocks: settled within ${Date.now() - t - 50} ms (+50 ms wait)`)
console.log(`longest task: ${(await page.evaluate(() => Math.max(0, ...window.__long))).toFixed(0)} ms`)
if (errors.length) console.log('errors:', [...new Set(errors)])
await browser.close()
