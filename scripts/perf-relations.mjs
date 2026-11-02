// Usage: node scripts/perf-relations.mjs [--entries 300 --rels 450 --groups 6]
// Needs `yarn dev` on :1420 and a Playwright chromium. Writes a codex + relationships straight into the browser
// build's virtual folder, opens the Relationship graph and times first render, list view and a filter toggle.
import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : def
}
const ENTRIES = arg('entries', 300)
const RELS = arg('rels', 450)
const GROUPS = arg('groups', 6)
const ROOT = 'relperf'
let seed = 5
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const files = {}
const typeId = randomUUID()
files[`codex/types/${typeId}.json`] = JSON.stringify({ version: 1, id: typeId, name: 'Character', color: '#8e44ad', icon: 'person' })
const entryRefs = Array.from({ length: ENTRIES }, (_, i) => {
  const id = randomUUID()
  const name = `Person ${i}`
  files[`codex/${id}.json`] = JSON.stringify({ version: 1, id, typeId, name, aliases: [], image: null, notes: { type: 'doc', content: [] }, tags: [], ruleIds: [], appendixText: '', includeInAppendices: false })
  return { id, path: `codex/${id}.json`, title: name }
})
const colors = ['#2e8b57', '#c0392b', '#2f6db5', '#d4a017', '#8e44ad']
const relTypes = ['Friend', 'Enemy', 'Parent', 'Sibling', 'Lover'].map((name, i) => {
  const id = randomUUID()
  files[`relation-types/${id}.json`] = JSON.stringify({ version: 1, id, name, reverseLabel: name === 'Parent' ? 'Child' : '', color: colors[i] })
  return { id, path: `relation-types/${id}.json`, title: name }
})
const seen = new Set()
const relRefs = []
while (relRefs.length < RELS) {
  const a = Math.floor(rnd() * ENTRIES)
  // mostly local links so the graph has structure
  const b = rnd() < 0.8 ? (a + 1 + Math.floor(rnd() * 8)) % ENTRIES : Math.floor(rnd() * ENTRIES)
  const t = Math.floor(rnd() * relTypes.length)
  const key = `${a}>${b}>${t}`
  if (a === b || seen.has(key)) continue
  seen.add(key)
  const id = randomUUID()
  files[`relationships/${id}.json`] = JSON.stringify({ version: 1, id, fromId: entryRefs[a].id, toId: entryRefs[b].id, typeId: relTypes[t].id, note: { type: 'doc', content: [] }, nodeRef: null })
  relRefs.push({ id, path: `relationships/${id}.json`, title: '' })
}
const groupRefs = Array.from({ length: GROUPS }, (_, g) => {
  const id = randomUUID()
  const memberIds = Array.from({ length: 12 }, (_, k) => entryRefs[(g * 40 + k * 3) % ENTRIES].id)
  files[`groups/${id}.json`] = JSON.stringify({ version: 1, id, name: `Group ${g + 1}`, color: colors[g % colors.length], memberIds })
  return { id, path: `groups/${id}.json`, title: `Group ${g + 1}` }
})
files['project.json'] = JSON.stringify({
  version: 7, kind: 'book', title: 'Relations Perf', author: 'Perf Tester', language: 'en', createdAt: new Date().toISOString(),
  manuscript: [], codexTypes: [{ id: typeId, path: `codex/types/${typeId}.json`, title: 'Character' }], codexEntries: entryRefs,
  relationTypes: relTypes, relationships: relRefs, groups: groupRefs,
})
console.log(`generated ${ENTRIES} entries, ${relRefs.length} relationships, ${GROUPS} groups`)

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })
const now = Date.now()
const ls = [{ name: 'storyworks:settings.json', value: JSON.stringify({ version: 2, theme: 'light', language: 'en', uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: [{ path: ROOT, title: 'Relations Perf', openedAt: new Date().toISOString() }] }) }]
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
await page.getByRole('link', { name: 'Relationship graph' }).waitFor()
await page.evaluate(() => {
  window.__long = []
  new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => e.duration))).observe({ type: 'longtask' })
})
const t1 = Date.now()
await page.getByRole('link', { name: 'Relationship graph' }).click()
await page.locator('[data-graph-node]').first().waitFor({ timeout: 60000 })
const tFirst = Date.now() - t1
await page.waitForFunction((n) => document.querySelectorAll('[data-graph-node]').length >= n, Math.min(ENTRIES, 200), { timeout: 60000 }).catch(() => {})
const tNodes = Date.now() - t1
const drawn = await page.locator('[data-graph-node]').count()
console.log(`graph: first node ${tFirst} ms, ${drawn} nodes in DOM after ${tNodes} ms, edges in DOM ${await page.locator('.vue-flow__edge').count()}`)
console.log(`longest task so far: ${(await page.evaluate(() => Math.max(0, ...window.__long))).toFixed(0)} ms`)
const t2 = Date.now()
await page.locator('.filters button.fchip', { hasText: 'Group 1' }).click()
await page.waitForFunction(() => document.querySelectorAll('[data-graph-node]').length <= 20, null, { timeout: 30000 })
console.log(`filter by group: ${Date.now() - t2} ms (${await page.locator('[data-graph-node]').count()} nodes)`)
await page.getByRole('button', { name: 'Clear filters' }).first().click()
await page.waitForTimeout(500)
const t3 = Date.now()
await page.getByRole('button', { name: 'List', exact: true }).click()
await page.locator('table.rows tbody tr').first().waitFor()
console.log(`list view: ${Date.now() - t3} ms, ${await page.locator('table.rows tbody tr').count()} rows`)
const t4 = Date.now()
await page.getByRole('button', { name: 'Graph', exact: true }).click()
await page.locator('[data-graph-node]').first().waitFor()
console.log(`back to graph: ${Date.now() - t4} ms`)
const t5 = Date.now()
await page.getByRole('button', { name: 'Re-layout' }).click()
await page.waitForTimeout(100)
await page.locator('[data-graph-node]').first().waitFor()
console.log(`re-layout click -> settled: ~${Date.now() - t5} ms`)
console.log(`longest task overall: ${(await page.evaluate(() => Math.max(0, ...window.__long))).toFixed(0)} ms`)
if (errors.length) console.log('errors:', [...new Set(errors)])
await page.screenshot({ path: process.argv[2] ?? '/tmp/relperf.png' })
await browser.close()
