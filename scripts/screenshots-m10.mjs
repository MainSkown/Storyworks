// Usage: node scripts/screenshots-m10.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// Browser build only (localStorage-backed virtual folder; global dictionaries live in localStorage too).
// Drives Stats + goals, Search, Quick switcher, spellcheck and dictionaries.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m10.mjs <outDir>')
mkdirSync(out, { recursive: true })
const ORIGIN = 'http://localhost:1420'
const SETTINGS_KEY = 'storyworks:settings.json'
const PFX = 'storyworks:project:'
const META = 'storyworks:projectmeta:'
const en = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/en.json'), 'utf8'))
const pl = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/pl.json'), 'utf8'))
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })

let failures = 0
let tag = ''
const check = (c, m) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'}: [${tag}] ${m}`) }
const allErrors = []

const settingsJson = (theme, language, recents) =>
  JSON.stringify({ version: 2, theme, language, uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: recents.map((p) => ({ path: p, title: p, openedAt: new Date().toISOString() })) })

async function bootBase() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
  const page = await ctx.newPage()
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: 'New project' }).click()
  const dlg = page.getByRole('dialog', { name: 'New project' })
  await dlg.getByLabel('Book title').fill('The Long Road')
  await dlg.getByLabel('Author').fill('Mara Quill')
  await dlg.getByLabel('Project name').fill('base')
  await dlg.getByRole('button', { name: 'Create project' }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await page.waitForTimeout(1800)
  const d = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  await ctx.close()
  const book = {}
  for (const [k, v] of Object.entries(d)) if (k.startsWith(`${PFX}base/`)) book[k.slice(`${PFX}base/`.length)] = v
  delete book['.storyworks/project.lock']
  return book
}

// ---- book builders ----
const T = (text) => ({ type: 'text', text })
const P = (id, text) => ({ type: 'paragraph', attrs: { id, textAlign: 'left' }, content: [T(text)] })
const doc = (...paras) => ({ type: 'doc', content: paras.map(([id, text]) => P(id, text)) })
const D = (year, month, day) => ({ year, month, day })
const json = (o) => JSON.stringify(o, null, 1)

/** scenes: [[id, title, text]] in two chapters; opts add codex/rule/timeline/knowledge, language, goals, dictionaries, stats. */
function buildBook(baseBook, { scenes, language = 'en', rich = false, goals, dictionaries, stats, entry } = {}) {
  const out = { ...baseBook }
  const m = JSON.parse(baseBook['project.json'])
  const put = (rel, obj) => (out[rel] = json(obj))
  const scene = ([id, title, text]) => {
    put(`manuscript/${id}.json`, { version: 3, id, title, status: 'draft', synopsis: '', wordCount: text.split(/\s+/).length, content: doc([`${id}-b`, text]), todos: [], comments: [], links: [] })
    return { id, type: 'scene', title, path: `manuscript/${id}.json`, children: [] }
  }
  const nodes = scenes.map(scene)
  m.manuscript = [
    { id: 'ch-1', type: 'chapter', title: language === 'pl' ? 'Oblężenie' : 'The Siege', children: nodes.slice(0, 3) },
    ...(nodes.length > 3 ? [{ id: 'ch-2', type: 'chapter', title: language === 'pl' ? 'Po bitwie' : 'The Aftermath', children: nodes.slice(3) }] : []),
  ]
  for (const p of Object.keys(out)) if (p.startsWith('manuscript/') && !nodes.some((s) => s.path === p)) delete out[p]
  m.language = language
  if (goals) m.goals = goals
  if (dictionaries) m.dictionaries = dictionaries
  if (stats) {
    out['stats.json'] = json(stats)
    m.stats = { id: 'stats-1', path: 'stats.json' }
  }
  const typeId = (title) => m.codexTypes.find((t) => t.title === title).id
  const catId = (title) => m.ruleCategories.find((t) => t.title === title).id
  if (entry) {
    put(`codex/${entry.id}.json`, { version: 2, id: entry.id, typeId: typeId('Character'), name: entry.name, aliases: entry.aliases, image: null, notes: doc([`${entry.id}-n`, entry.notes]), tags: [], ruleIds: [], appendixText: '', includeInAppendices: false, states: [] })
    m.codexEntries.push({ id: entry.id, path: `codex/${entry.id}.json`, title: entry.name })
  }
  if (rich) {
    put('codex/en-lena.json', { version: 2, id: 'en-lena', typeId: typeId('Character'), name: 'Lena', aliases: ['the Wanderer'], image: null, notes: doc(['en-lena-n', 'Lena is a restless traveller from the northern marches.']), tags: [], ruleIds: [], appendixText: '', includeInAppendices: false, states: [] })
    put('codex/en-aldric.json', { version: 2, id: 'en-aldric', typeId: typeId('Character'), name: 'Aldric', aliases: [], image: null, notes: doc(['en-aldric-n', 'Captain of the wall. Trusts Lena only with the keys.']), tags: [], ruleIds: [], appendixText: '', includeInAppendices: false, states: [] })
    m.codexEntries.push({ id: 'en-lena', path: 'codex/en-lena.json', title: 'Lena' }, { id: 'en-aldric', path: 'codex/en-aldric.json', title: 'Aldric' })
    put('rules/rule-1.json', { version: 1, id: 'rule-1', title: 'Wards fail near running water', categoryId: catId('Magic'), description: doc(['r1-d', 'Lena discovered that wards break when crossing a stream.']), tags: [], exceptions: doc() })
    m.rules.push({ id: 'rule-1', path: 'rules/rule-1.json', title: 'Wards fail near running water' })
    const tl = JSON.parse(out[m.timelines[0].path])
    tl.nodes = [{ id: 'n-a', title: 'Crossing the pass', description: doc(['n-a-d', 'Lena crosses the pass before the first snow.']), date: D(500, 2, 1), color: null, tag: null, branchId: null, pos: { x: 0, y: 0 }, codexIds: [], ruleIds: [] }]
    tl.edges = []
    put(m.timelines[0].path, tl)
    put('knowledge/k-1.json', { version: 1, id: 'k-1', title: 'The hidden name', description: doc(['k1-d', 'Only Lena knows the hidden name of the gate.']), tags: [], about: null, learnings: [{ id: 'l-1', entryId: 'en-lena', at: { date: D(520, 0, 1) }, note: '', forgottenAt: null, revealedIn: null }] })
    m.knowledge.push({ id: 'k-1', path: 'knowledge/k-1.json', title: 'The hidden name' })
  }
  out['project.json'] = json(m)
  return out
}

const seedStorage = (name, book, theme, language) => {
  const ls = [{ name: SETTINGS_KEY, value: settingsJson(theme, language, [name]) }]
  const t = String(Date.now() - 10_000)
  for (const [k, v] of Object.entries(book)) { ls.push({ name: `${PFX}${name}/${k}`, value: v }); ls.push({ name: `${META}${name}/${k}`, value: t }) }
  return { cookies: [], origins: [{ origin: ORIGIN, localStorage: ls }] }
}

async function openBook(name, book, theme, language) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: language === 'pl' ? 'pl-PL' : 'en-US', storageState: seedStorage(name, book, theme, language) })
  const page = await ctx.newPage()
  const errors = []
  await page.addInitScript(() => { window.print = () => { window.__printed = true } })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  const L = language === 'pl' ? pl : en
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: L.welcome.openProject }).click()
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('tree', { name: L.write.tree }).waitFor()
  await page.waitForTimeout(900)
  return { ctx, page, errors, L, name }
}

const shot = async (name, s, opts = {}) => {
  await s.page.waitForTimeout(400)
  if (opts.locator) await opts.locator.screenshot({ path: join(out, `${name}.png`) })
  else await s.page.screenshot({ path: join(out, `${name}.png`), fullPage: true })
  console.log(`  shot ${name}.png`)
}
const errorsOk = (s, what) => {
  const bad = s.errors.filter((e) => !/favicon/.test(e))
  allErrors.push(...bad)
  check(bad.length === 0, `no console errors${what ? ` (${what})` : ''}${bad.length ? ': ' + [...new Set(bad)].join(' | ') : ''}`)
  s.errors.length = 0
}

// ---- navigation helpers ----
const nav = (s, key) => s.page.getByRole('link', { name: new RegExp(`^\\s*${s.L.sections[key]}`) }).first().click()
const goWrite = async (s) => { await nav(s, 'write'); await s.page.getByRole('tree', { name: s.L.write.tree }).waitFor() }
const goStats = async (s) => { await nav(s, 'stats'); await s.page.getByRole('heading', { name: s.L.stats.title, level: 1 }).waitFor(); await s.page.waitForTimeout(500) }
const goSettings = async (s) => { await nav(s, 'settings'); await s.page.getByRole('heading', { name: s.L.settings.title, level: 1 }).waitFor(); await s.page.waitForTimeout(400) }
const row = (s, re) => s.page.getByRole('tree', { name: s.L.write.tree }).getByRole('treeitem', { name: re }).first()
const pageText = (s) => s.page.evaluate(() => document.body.innerText)
const url = (s) => s.page.evaluate(() => location.hash || location.pathname)
const store = (s, path) => s.page.evaluate((k) => localStorage.getItem(k), `${PFX}${s.name}/${path}`)

async function setGoal(s, label, value) {
  await goSettings(s)
  const input = s.page.getByLabel(label, { exact: true })
  await input.scrollIntoViewIfNeeded()
  await input.fill(String(value))
  await input.press('Enter')
  await s.page.waitForTimeout(2200)
}

const WORDS = 'morning light spread across the quiet valley while travellers gathered near the old bridge and talked about roads weather harvest stories music'.split(' ')
const sentence = (n) => Array.from({ length: n }, (_, i) => WORDS[i % WORDS.length]).join(' ')

// ---- seeded history: 21 days, a gap, a break, sessions ----
const pad = (n) => String(n).padStart(2, '0')
function seedStats() {
  const now = new Date()
  const at = (off, h, mi = 0) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - off, h, mi); return d }
  const key = (off) => { const d = at(off, 12); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
  // offset -> net words. Missing offsets 9 and 10 = the gap; 6 is a short day that breaks the streak.
  const net = { 0: 620, 1: 540, 2: 810, 3: 505, 4: 700, 5: 560, 6: 180, 7: 520, 8: 640, 11: 530, 12: 900, 13: 610, 14: 520, 15: 700, 16: 590, 17: 560, 18: 240, 19: 90, 20: 410 }
  const days = Object.entries(net).map(([o, n]) => ({ date: key(+o), net: n })).sort((a, b) => (a.date < b.date ? -1 : 1))
  const sessions = []
  const add = (off, h, mins, n) => sessions.push({ id: `ss-${off}-${h}`, start: at(off, h).toISOString(), end: at(off, h, mins).toISOString(), net: n })
  // today's second session comes from the live app if the page edits; seeded today covers 09:00-09:50 only
  add(0, 9, 50, 620)
  add(1, 20, 35, 220); add(1, 8, 40, 320)
  add(2, 10, 55, 810)
  add(3, 21, 30, 505)
  add(4, 7, 45, 300); add(4, 19, 50, 400)
  add(5, 12, 60, 560)
  add(6, 22, 20, 180)
  add(7, 9, 45, 520)
  add(8, 18, 55, 640)
  add(11, 11, 40, 530)
  sessions.sort((a, b) => (a.start < b.start ? -1 : 1))
  return { stats: { version: 1, days, sessions }, expect: { today: 620, current: 6, longest: 7 } }
}

const SCENES_EN = [
  ['s-walls', 'Walls', 'Lena climbed the wall at dawn and counted the torches below.'],
  ['s-gate', 'Gate', 'The Wanderer knocked twice at the gate before anyone answered.'],
  ['s-tower', 'Tower', 'The tower burned all night and nobody slept.'],
  ['s-quiet', 'Quiet', 'The camp was quiet.'],
]

/* =====================================================================
   1. Stats and goals: typed words, session, streak, status bar
   ===================================================================== */
async function statsFlow() {
  tag = 'stats-typed'
  const s = await openBook('fresh', buildBook(await bootBase(), { scenes: SCENES_EN, rich: true }), 'light', 'en')
  const { page, L } = s

  await goStats(s)
  const empty0 = await pageText(s)
  check(empty0.includes(L.stats.chart.empty), 'empty book: chart shows the "nothing written yet" note')
  check(empty0.includes(L.stats.sessions.empty), 'empty book: no sessions yet')
  await shot('stats-empty', s)

  await setGoal(s, L.stats.goals.daily, 500)
  await page.getByRole('heading', { name: L.stats.goals.title }).scrollIntoViewIfNeeded()
  const mf = JSON.parse(await store(s, 'project.json'))
  check(mf.goals.daily === 500, 'daily goal 500 is saved in project.json')
  await page.setViewportSize({ width: 1280, height: 1100 })
  await shot('settings-goals', s)
  await page.setViewportSize({ width: 1280, height: 900 })

  // ~120 words through the real editor
  await goWrite(s)
  await row(s, /Tower/).click()
  const pm = page.locator('.ProseMirror').first()
  await pm.waitFor()
  await pm.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' ' + sentence(120))
  await page.waitForTimeout(2000)
  const sb = page.getByRole('status', { name: L.write.statusBar })
  const sbText = await sb.innerText()
  check(/Today: 12[0-2] \/ 500/.test(sbText), `status bar shows "Today: N / 500" (${sbText.match(/Today:[^\n]*/)?.[0]})`)
  await shot('write-status-bar', s, { locator: sb })

  await goStats(s)
  const t1 = await pageText(s)
  const todayN = Number((await page.locator('#st-today + .big').innerText()).replace(/\D/g, ''))
  check(Math.abs(todayN - 120) <= 3, `Stats "Today" total ≈ 120 words (${todayN})`)
  const bar = page.getByRole('progressbar', { name: L.stats.today.title })
  const pct = Number(await bar.getAttribute('aria-valuenow'))
  check(pct >= 23 && pct <= 25, `goal progress bar ≈ 24% (${pct}%)`)
  check(t1.includes('of 500 daily goal'), 'Today card shows "of 500 daily goal"')
  const rows = await page.locator('table.sessions tbody tr').count()
  check(rows === 1, `one session listed (${rows})`)
  const streak0 = (await page.locator('.streaks dd').first().innerText()).trim()
  check(/^(No days|0 days)$/.test(streak0), `with goal 500 and 120 words the goal-streak is 0 days, by the "days that reached the goal" rule (${streak0})`)

  // No goal: any day with a word counts -> streak 1
  await setGoal(s, L.stats.goals.daily, 0)
  await goStats(s)
  const t2 = await pageText(s)
  check(t2.includes(L.stats.today.noGoal), 'no goal: "No daily goal set"')
  check((await page.locator('.streaks dd').first().innerText()).trim() === '1 day', 'no goal: streak is 1 day (any day with a word)')
  await setGoal(s, L.stats.goals.daily, 500)
  await goStats(s)
  await page.setViewportSize({ width: 1280, height: 1250 })
  await shot('stats-after-typing', s)
  errorsOk(s)
  await s.ctx.close()
}

/* =====================================================================
   2. Stats with seeded history: light, table toggle, dark, Polish
   ===================================================================== */
async function historyFlow(theme, language) {
  tag = `stats-history-${theme}-${language}`
  const { stats, expect } = seedStats()
  const scenes = language === 'pl' ? [['s-a', 'Mur', 'Łukasz stał na murze.'], ['s-b', 'Brama', 'Brama wytrzymała do świtu.'], ['s-c', 'Wieża', 'Wieża płonęła całą noc.']] : SCENES_EN
  const book = buildBook(await bootBase(), { scenes, language, goals: { daily: 500, book: 60000 }, stats })
  const s = await openBook('history', book, theme, language)
  const { page, L } = s
  await goStats(s)
  await page.setViewportSize({ width: 1280, height: 1250 })
  const cur = (await page.locator('.streaks dd').nth(0).innerText()).trim()
  const lon = (await page.locator('.streaks dd').nth(1).innerText()).trim()
  const num = (x) => Number(x.replace(/\D/g, ''))
  check(num(cur) === expect.current, `current streak ${expect.current} days across the break (${cur})`)
  check(num(lon) === expect.longest, `longest streak ${expect.longest} days across the gap (${lon})`)
  const todayTxt = await page.locator('#st-today + .big').innerText()
  check(num(todayTxt) === expect.today, `today total from stats.json = ${expect.today} (${todayTxt})`)
  const rowsN = await page.locator('table.sessions tbody tr').count()
  check(rowsN >= 5, `several sessions listed (${rowsN})`)
  check(await page.locator('svg.svg rect.bar').count() === 30, 'chart draws 30 day bars')

  if (theme === 'light' && language === 'en') {
    await shot('stats-with-history', s)
    await page.getByRole('button', { name: L.stats.chart.showTable }).click()
    await page.waitForTimeout(300)
    const tbl = await page.locator('table').first().innerText()
    check(tbl.includes(L.stats.chart.date) && /620/.test(tbl), 'table fallback shows dates and words')
    check(await page.getByRole('button', { name: L.stats.chart.hideTable }).isVisible(), 'toggle now says "Hide table"')
    await shot('stats-table-toggle', s)
  } else if (theme === 'dark') {
    await shot('stats-dark', s)
  } else {
    check((await pageText(s)).includes(L.stats.title), 'Polish title shown')
    await shot('stats-pl', s)
  }
  errorsOk(s)
  await s.ctx.close()
}

/* =====================================================================
   3. Search overlay and quick switcher
   ===================================================================== */
const dlg = (s, name) => s.page.getByRole('dialog', { name })
async function searchFlow(theme, language) {
  tag = `search-${theme}-${language}`
  let s
  if (language === 'pl') {
    const scenes = [['s-a', 'Mur', 'Łukasz stał na murze i liczył pochodnie.'], ['s-b', 'Brama', 'Wędrowiec zapukał dwa razy do bramy.'], ['s-c', 'Wieża', 'Wieża płonęła całą noc.']]
    s = await openBook('szukaj', buildBook(await bootBase(), { scenes, language: 'pl', entry: { id: 'en-lukasz', name: 'Łukasz', aliases: ['Wędrowiec'], notes: 'Łukasz to niespokojny podróżnik z północy.' } }), theme, 'pl')
  } else {
    s = await openBook('search', buildBook(await bootBase(), { scenes: SCENES_EN, rich: true }), theme, 'en')
  }
  const { page, L } = s
  const input = () => page.getByRole('combobox', { name: L.search.inputLabel })
  const openSearch = async () => { await page.keyboard.press('Control+Shift+F'); await input().waitFor() }

  if (language === 'pl') {
    await openSearch()
    await input().fill('lukasz')
    await dlg(s, L.search.title).getByRole('option').first().waitFor()
    const n = await dlg(s, L.search.title).getByRole('option').count()
    check(n >= 2, `Polish: "lukasz" finds Łukasz without diacritics (${n} hits)`)
    await shot('search-pl', s)
    await page.keyboard.press('Escape')
    errorsOk(s)
    await s.ctx.close()
    return
  }

  // ---- search "Lena" ----
  await openSearch()
  check(await dlg(s, L.search.title).isVisible(), 'Ctrl+Shift+F opens the search overlay')
  await input().fill('Lena')
  await dlg(s, L.search.title).getByRole('option').first().waitFor()
  await page.waitForTimeout(500)
  const areas = await page.locator('[role=group][aria-labelledby^="search-h-"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby').replace('search-h-', '')))
  check(areas.length >= 2, `"Lena" hits grouped in ${areas.length} areas (${areas.join(', ')})`)
  for (const a of ['manuscript', 'codex', 'rules', 'timelines', 'knowledge']) check(areas.includes(a), `area "${a}" has a hit`)
  if (theme === 'light') await shot('search-results', s)
  else await shot('search-dark', s)
  if (theme === 'dark') { await page.keyboard.press('Escape'); errorsOk(s); await s.ctx.close(); return }

  // ---- no results ----
  await input().fill('zzzqx')
  await page.waitForTimeout(500)
  check((await dlg(s, L.search.title).innerText()).includes('Nothing found'), 'no-match query shows "Nothing found"')
  await shot('search-no-results', s)

  // ---- alias finds the codex entry; Enter opens it ----
  await input().fill('Wanderer')
  await dlg(s, L.search.title).getByRole('option').first().waitFor()
  await page.waitForTimeout(400)
  const codexOpt = page.locator('[role=group][aria-labelledby="search-h-codex"] [role=option]', { hasText: 'Lena' }).first()
  check(await codexOpt.count() === 1, 'alias "Wanderer" finds the codex entry Lena')
  for (let i = 0; i < 12; i++) {
    if ((await codexOpt.getAttribute('aria-selected')) === 'true') break
    await page.keyboard.press('ArrowDown')
  }
  check((await codexOpt.getAttribute('aria-selected')) === 'true', 'arrow keys reach the codex hit')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  check(!(await dlg(s, L.search.title).isVisible().catch(() => false)), 'Enter closes the overlay')
  check((await url(s)).endsWith('/codex'), `Enter opens the codex page (${await url(s)})`)
  check((await pageText(s)).includes('restless traveller'), 'the Lena entry is shown')

  // ---- switcher ----
  await goWrite(s)
  await row(s, /Gate/).click()
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+p')
  const sw = page.getByRole('combobox', { name: L.search.switcher.title })
  await sw.waitFor()
  check(await dlg(s, L.search.switcher.title).isVisible(), 'Ctrl+P opens the switcher (and the print dialog is suppressed)')
  const printed = await page.evaluate(() => window.__printed === true)
  check(!printed, 'no print call')
  const swd = dlg(s, L.search.switcher.title)
  const recents = await swd.getByRole('option').allInnerTexts()
  check(recents.length >= 2 && recents[0].includes('Gate') && recents.some((r) => r.includes('Lena')), `empty query shows recents, newest first (${recents.map((r) => r.split('\n')[0]).join(', ')})`)
  check((await dlg(s, L.search.switcher.title).innerText()).toLowerCase().includes(L.search.switcher.recent.toLowerCase()), 'recents heading shown')
  await shot('switcher-recents', s)
  await sw.fill('Wanderer')
  await page.waitForTimeout(500)
  const alias = await swd.getByRole('option').first().innerText()
  check(alias.includes(L.search.also) && alias.includes('the Wanderer') && alias.includes('Lena'), `alias query shows "also:" with the alias (${alias.replace(/\n/g, ' ')})`)
  await shot('switcher-alias', s)
  await page.keyboard.press('Escape')
  errorsOk(s)
  await s.ctx.close()
}

/* =====================================================================
   4. Spellcheck + dictionaries
   ===================================================================== */
const misspelled = (s) => s.page.locator('.sw-misspelled').evaluateAll((els) => [...new Set(els.map((e) => e.textContent))])
async function waitUnderline(s, timeout = 15000) {
  try { await s.page.locator('.sw-misspelled').first().waitFor({ timeout }); return true } catch { return false }
}

async function spellEnFlow() {
  tag = 'spell-en'
  const scenes = [['s-a', 'Letter', 'She will definately recieve the letter tomorow, said the captain.'], ['s-b', 'Plain', 'Nothing is wrong with this sentence at all.'], ['s-c', 'Other', 'The camp was quiet.']]
  const s = await openBook('spell', buildBook(await bootBase(), { scenes }), 'light', 'en')
  const { page, L } = s
  await row(s, /Letter/).click()
  await page.locator('.ProseMirror').first().waitFor()
  check(await waitUnderline(s), 'misspelled English words get an underline')
  const words = await misspelled(s)
  check(['definately', 'recieve', 'tomorow'].every((w) => words.includes(w)), `underlined: ${words.join(', ')}`)
  check(!words.includes('captain') && !words.includes('letter'), 'correct words are not underlined')
  await page.mouse.move(10, 10)
  await shot('spell-underline', s)

  await page.locator('.sw-misspelled', { hasText: 'definately' }).first().click({ button: 'right' })
  const add = page.getByRole('menuitem', { name: L.spell.menu.add }).or(page.getByText(L.spell.menu.add, { exact: true }))
  await add.first().waitFor()
  await page.waitForTimeout(600)
  const menuText = await page.locator('.q-menu').innerText()
  check(/definitely/i.test(menuText), `right-click menu suggests "definitely" (${menuText.split('\n').slice(0, 4).join(' | ')})`)
  check(menuText.includes(L.spell.menu.add) && menuText.includes(L.spell.menu.ignore), 'menu has Add to dictionary and Ignore')
  await shot('spell-menu', s)
  await add.first().click()
  await page.waitForTimeout(1200)
  const after = await misspelled(s)
  check(!after.includes('definately') && after.includes('recieve'), `Add to dictionary clears the flag, others stay (${after.join(', ')})`)

  // ---- settings > dictionaries ----
  await goSettings(s)
  await page.getByRole('heading', { name: L.spell.title }).scrollIntoViewIfNeeded()
  check((await pageText(s)).includes('definately'), 'added word is listed under "Words added to this book"')
  const dictRows = () => page.locator('ul.dicts > li').count()
  const before = await dictRows()
  check(before >= 2, `bundled dictionaries listed (${before})`)
  await page.setViewportSize({ width: 1280, height: 1500 })
  await shot('settings-dictionaries', s)

  // import a word list (local)
  const openImport = async () => { await page.getByRole('button', { name: L.spell.import.open }).click(); await page.getByRole('dialog', { name: L.spell.import.title }).waitFor() }
  const d = () => page.getByRole('dialog', { name: L.spell.import.title })
  await openImport()
  await d().getByText(L.spell.import.kindWordlist).click()
  await d().locator('input[type=file]').setInputFiles({ name: 'mylist.txt', mimeType: 'text/plain', buffer: Buffer.from('tomorow\nzorblax\n') })
  await page.waitForTimeout(300)
  check((await d().getByLabel(L.spell.import.name).inputValue()) === 'mylist', 'import name is suggested from the file name')
  check(await d().getByRole('button', { name: L.spell.scopeName.local }).getAttribute('aria-pressed') === 'true', 'scope defaults to Local when a book is open')
  await shot('dictionary-import-dialog', s)
  await d().getByRole('button', { name: L.spell.import.do }).click()
  await page.getByText(L.spell.imported.replace('{name}', 'mylist').split('.')[0]).first().waitFor()
  await page.waitForTimeout(500)
  check((await dictRows()) === before + 1, 'imported word list appears in the list')
  const localFiles = await page.evaluate((p) => Object.keys(localStorage).filter((k) => k.startsWith(p) && k.includes('dictionaries/')), `${PFX}spell/`)
  check(localFiles.length > 0, `local dictionary files are stored in the book folder (${localFiles.map((f) => f.split('/').slice(-2).join('/')).join(', ')})`)
  await page.getByLabel(`${L.spell.use}: mylist (${L.spell.scope.local})`).check()
  await page.waitForTimeout(500)
  await goWrite(s)
  await row(s, /Letter/).click()
  await page.locator('.ProseMirror').first().waitFor()
  await page.waitForTimeout(2500)
  const afterImport = await misspelled(s)
  check(!afterImport.includes('tomorow'), `word from the imported list ("tomorow") is no longer flagged (${afterImport.join(', ')})`)
  check(afterImport.includes('recieve'), 'English dictionary still checks the rest')

  // ---- malformed .dic ----
  await goSettings(s)
  await page.getByRole('heading', { name: L.spell.title }).scrollIntoViewIfNeeded()
  const n1 = await dictRows()
  await openImport()
  const files = d().locator('input[type=file]')
  await files.nth(0).setInputFiles({ name: 'broken.dic', mimeType: 'text/plain', buffer: Buffer.from('not-a-number\nword\n') })
  await files.nth(1).setInputFiles({ name: 'broken.aff', mimeType: 'text/plain', buffer: Buffer.from('SET UTF-8\n') })
  await d().getByRole('button', { name: L.spell.import.do }).click()
  const alert = d().getByRole('alert')
  await alert.waitFor()
  const errText = await alert.innerText()
  check(errText.includes(L.spell.errors['bad-dic']), `malformed .dic shows the error (${errText.slice(0, 60)}...)`)
  await shot('dictionary-import-error', s)
  await d().getByRole('button', { name: L.spell.import.cancel }).click()
  await page.waitForTimeout(400)
  check((await dictRows()) === n1, 'dictionary list unchanged after the failed import')
  errorsOk(s)
  await s.ctx.close()
}

async function spellPlFlow() {
  tag = 'spell-pl'
  const scenes = [['s-a', 'Mur', 'Łukasz stał na murze i widział błendne światło.'], ['s-b', 'Brama', 'Brama wytrzymała do świtu.'], ['s-c', 'Wieża', 'Wieża płonęła całą noc.']]
  const s = await openBook('polska', buildBook(await bootBase(), { scenes, language: 'pl' }), 'light', 'pl')
  await row(s, /Mur/).click()
  await s.page.locator('.ProseMirror').first().waitFor()
  check(await waitUnderline(s, 25000), 'Polish book: a misspelled Polish word is underlined')
  const words = await misspelled(s)
  check(words.includes('błendne'), `"błendne" flagged (${words.join(', ')})`)
  check(!words.includes('murze') && !words.includes('widział'), 'valid Polish words are not flagged')
  errorsOk(s)
  await s.ctx.close()
}

async function missingFlow() {
  tag = 'spell-missing'
  const scenes = [['s-a', 'Letter', 'She will definately recieve the letter.'], ['s-b', 'Plain', 'Nothing wrong here.'], ['s-c', 'Other', 'The camp was quiet.']]
  const book = buildBook(await bootBase(), { scenes, dictionaries: [{ name: 'ghost', scope: 'global' }, { name: 'en', scope: 'global' }] })
  const s = await openBook('ghostbook', book, 'light', 'en')
  const { page, L } = s
  check(await page.getByRole('tree', { name: L.write.tree }).isVisible(), 'book with a missing global dictionary still opens')
  await goSettings(s)
  await page.getByRole('heading', { name: L.spell.title }).scrollIntoViewIfNeeded()
  const banner = page.locator('.warn-banner', { hasText: 'ghost' })
  await banner.first().waitFor()
  check(await banner.count() === 1, 'warning banner names the missing dictionary')
  check((await banner.innerText()).includes('not installed'), 'banner says it is not installed')
  const mf = JSON.parse(await store(s, 'project.json'))
  check(mf.dictionaries.some((d) => d.name === 'ghost'), 'manifest still lists the missing dictionary (selection kept)')
  await page.setViewportSize({ width: 1280, height: 1100 })
  await shot('dictionary-missing-banner', s)
  await goWrite(s)
  await row(s, /Letter/).click()
  check(await waitUnderline(s), 'spellcheck still works with the remaining dictionary (en)')
  errorsOk(s)
  await s.ctx.close()
}

await statsFlow()
await historyFlow('light', 'en')
await historyFlow('dark', 'en')
await historyFlow('light', 'pl')
await searchFlow('light', 'en')
await searchFlow('dark', 'en')
await searchFlow('light', 'pl')
await spellEnFlow()
await spellPlFlow()
await missingFlow()
tag = 'global'
check(allErrors.length === 0, `no console errors on any screen (${allErrors.length})`)
await browser.close()
console.log(failures ? `${failures} FAILED` : 'all checks passed')
process.exit(failures ? 1 : 0)
