// Usage: node scripts/perf-states.mjs [--states 200 --events 150 --rels 150]
// Needs `yarn dev` on :1420 and a Playwright chromium. Writes one entry with many states, linked events and
// relationships into the browser build's virtual folder, then times the States and Chronicle tabs.
import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : def
}
const STATES = arg('states', 200)
const EVENTS = arg('events', 150)
const RELS = arg('rels', 150)
const OTHERS = 40
const ROOT = 'stperf'
let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const files = {}
const typeId = randomUUID()
files[`codex/types/${typeId}.json`] = JSON.stringify({ version: 1, id: typeId, name: 'Character', color: '#8e44ad', icon: 'person' })
const mkEntry = (name, extra = {}) => {
  const id = randomUUID()
  const e = { version: 2, id, typeId, name, aliases: [], image: null, notes: { type: 'doc', content: [] }, tags: [], ruleIds: [], appendixText: '', includeInAppendices: false, states: [], ...extra }
  return e
}
const hero = mkEntry('Hero')
const others = Array.from({ length: OTHERS }, (_, i) => mkEntry(`Person ${i}`))
// timeline: EVENTS nodes in one chain, every third dated
const tlId = randomUUID()
const nodes = Array.from({ length: EVENTS }, (_, i) => ({
  id: randomUUID(), title: `Event ${i}`, description: { type: 'doc', content: [] },
  date: i % 3 === 0 ? { year: 1400 + Math.floor(i / 12), month: i % 12, day: 1 + (i % 28) } : null,
  color: null, tag: null, branchId: null, pos: { x: i * 40, y: (i % 5) * 60 }, codexIds: [hero.id], ruleIds: [],
}))
const edges = nodes.slice(1).map((n, i) => ({ id: randomUUID(), from: nodes[i].id, to: n.id }))
files[`timelines/${tlId}.json`] = JSON.stringify({ version: 1, id: tlId, name: 'Main timeline', view: 'flow', branches: [], nodes, edges })
const kinds = [['Location', 'entry', true], ['Owner', 'entry', true], ['Status', 'text', true], ['Title', 'text', false]].map(([name, valueType, exclusive]) => {
  const id = randomUUID()
  files[`state-kinds/${id}.json`] = JSON.stringify({ version: 1, id, name, valueType, exclusive })
  return { id, path: `state-kinds/${id}.json`, title: name, valueType }
})
const pos = () => (rnd() < 0.5 ? { node: { timelineId: tlId, nodeId: nodes[Math.floor(rnd() * EVENTS)].id } } : { date: { year: 1400 + Math.floor(rnd() * 14), month: Math.floor(rnd() * 12), day: 1 + Math.floor(rnd() * 28) } })
for (let i = 0; i < STATES; i++) {
  const k = kinds[i % 4]
  hero.states.push({ id: randomUUID(), kindId: k.id, value: k.valueType === 'entry' ? others[i % OTHERS].id : `Value ${i}`, from: pos(), until: rnd() < 0.3 ? pos() : null, final: false })
}
const relTypeId = randomUUID()
files[`relation-types/${relTypeId}.json`] = JSON.stringify({ version: 1, id: relTypeId, name: 'Friend', reverseLabel: '', color: '#2e8b57' })
const relRefs = Array.from({ length: RELS }, (_, i) => {
  const id = randomUUID()
  files[`relationships/${id}.json`] = JSON.stringify({ version: 1, id, fromId: hero.id, toId: others[i % OTHERS].id, typeId: relTypeId, note: { type: 'doc', content: [] }, nodeRef: { timelineId: tlId, nodeId: nodes[i % EVENTS].id } })
  return { id, path: `relationships/${id}.json`, title: '' }
})
const all = [hero, ...others]
const entryRefs = all.map((e) => {
  files[`codex/${e.id}.json`] = JSON.stringify(e)
  return { id: e.id, path: `codex/${e.id}.json`, title: e.name }
})
files['project.json'] = JSON.stringify({
  version: 8, kind: 'book', title: 'States Perf', author: 'Perf Tester', language: 'en', createdAt: new Date().toISOString(),
  manuscript: [], codexTypes: [{ id: typeId, path: `codex/types/${typeId}.json`, title: 'Character' }], codexEntries: entryRefs,
  relationTypes: [{ id: relTypeId, path: `relation-types/${relTypeId}.json`, title: 'Friend' }], relationships: relRefs,
  timelines: [{ id: tlId, path: `timelines/${tlId}.json`, title: 'Main timeline' }],
  stateKinds: kinds.map(({ id, path, title }) => ({ id, path, title })),
})
console.log(`generated ${STATES} states, ${EVENTS} linked events, ${RELS} relationships on one entry`)

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })
const now = Date.now()
const ls = [{ name: 'storyworks:settings.json', value: JSON.stringify({ version: 2, theme: 'light', language: 'en', uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: [{ path: ROOT, title: 'States Perf', openedAt: new Date().toISOString() }] }) }]
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
await page.getByRole('link', { name: /^\s*Codex/ }).first().click()
await page.locator('aside button.item', { hasText: 'Hero' }).click()
await page.evaluate(() => {
  window.__long = []
  new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => e.duration))).observe({ type: 'longtask' })
})
async function timeTab(name, sel, expected) {
  const t = Date.now()
  await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click()
  await page.waitForFunction(([s, n]) => document.querySelectorAll(s).length >= n, [sel, expected], { timeout: 60000 })
  const ms = Date.now() - t
  console.log(`${name} tab: ${ms} ms (${await page.locator(sel).count()} rows)`)
  return ms
}
await timeTab('States', '.st section.group ul.rows > li.row', STATES)
console.log(`overlap warnings shown: ${await page.locator('.st p.overlap').count()}`)
await page.screenshot({ path: process.argv[2] ?? '/tmp/stperf-states.png' })
await timeTab('Chronicle', '.chronicle ol.list > li', EVENTS + STATES + RELS)
// second visit (warm)
await page.getByRole('tab', { name: /^Details/ }).click()
await timeTab('Chronicle', '.chronicle ol.list > li', EVENTS + STATES + RELS)
await page.getByRole('tab', { name: /^Details/ }).click()
await timeTab('States', '.st section.group ul.rows > li.row', STATES)
// editing a state with 200 present: open dialog and save
const t1 = Date.now()
await page.getByRole('button', { name: /^Edit state Title/ }).first().click()
const d = page.getByRole('dialog', { name: 'Edit state' })
await d.waitFor()
await d.locator('button[type=submit]').click()
await d.waitFor({ state: 'hidden' })
console.log(`edit+save a state: ${Date.now() - t1} ms`)
console.log(`longest task: ${(await page.evaluate(() => Math.max(0, ...window.__long))).toFixed(0)} ms`)
if (errors.length) console.log('errors:', [...new Set(errors)])
await browser.close()
