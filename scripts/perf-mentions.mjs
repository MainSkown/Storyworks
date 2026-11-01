// Usage: node scripts/perf-mentions.mjs [--parts 10 --chapters 10 --scenes 5 --words 600 --entries 200]
// Needs `yarn dev` on :1420 and a Playwright chromium. Generates a long book plus a codex (written straight into the
// browser build's virtual folder), then times the mention scan the Codex view runs when an entry is selected.
import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : def
}
const PARTS = arg('parts', 10)
const CHAPTERS = arg('chapters', 10)
const SCENES = arg('scenes', 5)
const WORDS = arg('words', 600)
const ENTRIES = arg('entries', 200)
const ROOT = 'longbook'

let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const VOCAB =
  'the road ran beyond river stone light shadow window door night morning silence voice hand walked turned said knew never always small heavy cold bright slow quick after before under over between city gate market harbour lamp rain wind map letter bread salt thread'.split(' ')
const FIRST = 'Aldric Brenna Corin Dessa Edrin Farah Gareth Helka Ivor Jessa Kellen Liora Marek Nessa Orin Petra Quill Rhea Soren Talia Ulric Vera Wren Xander Yara Zane'.split(' ')
const LAST = 'Voss Harrow Thorne Reeds Ashby Marsh Stone Vale Wick Crane Hale Ford'.split(' ')
const names = Array.from({ length: ENTRIES }, (_, i) => `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}${i >= FIRST.length * LAST.length ? ` ${i}` : ''}`)
const aliasOf = (n) => n.split(' ')[0]
const word = () => VOCAB[Math.floor(rnd() * VOCAB.length)]
const text = (t) => ({ type: 'text', text: t })
const para = (n) => {
  const w = Array.from({ length: n }, word)
  if (rnd() < 0.15) w[Math.floor(rnd() * n)] = names[Math.floor(rnd() * names.length)].split(' ')[0]
  return { type: 'paragraph', attrs: { id: randomUUID() }, content: [text(w.join(' ') + '.')] }
}
const files = {}
const manuscript = []
let n = 0
for (let p = 1; p <= PARTS; p++) {
  const part = { id: randomUUID(), type: 'part', title: `Part ${p}`, children: [] }
  for (let c = 1; c <= CHAPTERS; c++) {
    const ch = { id: randomUUID(), type: 'chapter', title: `Chapter ${p}.${c}`, children: [] }
    for (let s = 1; s <= SCENES; s++) {
      n++
      const id = randomUUID()
      const path = `manuscript/${id}.json`
      const blocks = []
      for (let left = WORDS; left > 0; ) {
        const k = Math.min(left, 40 + Math.floor(rnd() * 50))
        blocks.push(para(k))
        left -= k
      }
      files[path] = JSON.stringify({ version: 2, id, title: `Scene ${n}`, status: 'draft', synopsis: '', wordCount: WORDS, content: { type: 'doc', content: blocks }, todos: [], comments: [], links: [] })
      ch.children.push({ id, type: 'scene', title: `Scene ${n}`, path, children: [] })
    }
    part.children.push(ch)
  }
  manuscript.push(part)
}
const typeId = randomUUID()
files[`codex/types/${typeId}.json`] = JSON.stringify({ version: 1, id: typeId, name: 'Character', color: '#8e44ad', icon: 'person' })
const entryRefs = names.map((name) => {
  const id = randomUUID()
  files[`codex/${id}.json`] = JSON.stringify({ version: 1, id, typeId, name, aliases: [aliasOf(name)], image: null, notes: { type: 'doc', content: [] }, tags: [], ruleIds: [], appendixText: '', includeInAppendices: false })
  return { id, path: `codex/${id}.json`, title: name }
})
files['project.json'] = JSON.stringify({
  version: 6, kind: 'book', title: 'The Long Book', author: 'Perf Tester', language: 'en', createdAt: new Date().toISOString(),
  manuscript, codexTypes: [{ id: typeId, path: `codex/types/${typeId}.json`, title: 'Character' }], codexEntries: entryRefs,
})
console.log(`generated ${n} scenes (~${n * WORDS} words), ${ENTRIES} entries`)

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox', '--js-flags=--expose-gc'] })
const now = Date.now()
const ls = [{ name: 'storyworks:settings.json', value: JSON.stringify({ version: 2, theme: 'light', language: 'en', uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: [{ path: ROOT, title: 'The Long Book', openedAt: new Date().toISOString() }] }) }]
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
await page.getByRole('button', { name: 'Open project' }).click()
await page.getByRole('dialog', { name: 'Projects in this browser' }).getByRole('button', { name: ROOT }).click()
await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
await page.waitForTimeout(3000)
await page.getByRole('link', { name: /^\s*Codex/ }).first().click()
const items = page.locator('aside[aria-label="Codex entries"] button.item')
await items.first().waitFor()
console.log('entries listed:', await items.count())

const cdp = await ctx.newCDPSession(page)
const heap = async () => {
  await cdp.send('HeapProfiler.collectGarbage')
  return ((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576)
}
// time from selecting an entry to its scan result (status line leaves "Looking through..."), includes the 300 ms debounce
let hits = 0
async function scanMs(i) {
  await page.evaluate(() => {
    window.__long = []
    new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => e.duration))).observe({ type: 'longtask' })
  })
  const t0 = Date.now()
  await items.nth(i).click()
  await page.getByRole('tab', { name: /^Mentions/ }).click()
  // entries here always have hits (first names are sprinkled through the text), so wait for the cards
  await page.locator('ul[aria-label="Mentions"] > li').first().waitFor({ timeout: 20000 })
  const ms = Date.now() - t0
  hits = await page.locator('ul[aria-label="Mentions"] > li').count()
  const long = await page.evaluate(() => Math.max(0, ...window.__long))
  return { ms, long, hits }
}
const h0 = await heap()
const first = await scanMs(0)
const h1 = await heap()
console.log(`first scan (cold, incl. 300 ms debounce): ${first.ms} ms (${first.hits} hits), longest task ${first.long.toFixed(0)} ms`)
const rest = []
for (const i of [7, 30, 55, 90, 140, 199].filter((k) => k < ENTRIES)) rest.push(await scanMs(i))
const avg = rest.reduce((s, r) => s + r.ms, 0) / rest.length
console.log(`next ${rest.length} scans: avg ${avg.toFixed(0)} ms, max ${Math.max(...rest.map((r) => r.ms))} ms, longest task ${Math.max(...rest.map((r) => r.long)).toFixed(0)} ms`)
const h2 = await heap()
console.log(`heap MB: before ${h0.toFixed(1)}, after first scan ${h1.toFixed(1)}, after all ${h2.toFixed(1)}`)
console.log(`result: ${first.ms <= 1300 && avg <= 1300 ? 'under ~1 s scan (+300 ms debounce)' : 'SLOW'}`)
if (errors.length) console.log('errors:', [...new Set(errors)])
await browser.close()
