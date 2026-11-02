// Usage: node scripts/screenshots-m7.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Browser build only (not the Tauri window). Seeds a book with deliberate problems into localStorage, then checks the M7
// acceptance items (date order, broken link + restore, touching states, check toggles, ignore, badge, invalid ignored.json, Polish)
// and captures the Checks page, empty state, Settings group, badge and banner. LIGHT_ONLY=1 skips the dark pass.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m7.mjs <outDir>')
mkdirSync(out, { recursive: true })
const ORIGIN = 'http://localhost:1420'
const URL = `${ORIGIN}/`
const SETTINGS_KEY = 'storyworks:settings.json'
const PFX = 'storyworks:project:'
const META = 'storyworks:projectmeta:'

const en = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/en.json'), 'utf8'))
const pl = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/pl.json'), 'utf8'))

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })

const allErrors = []
let failures = 0
let tag = ''
function check(cond, msg) {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'}: [${tag}] ${msg}`)
}
const norm = (s) => s.replace(/\s+/g, ' ').trim()

// ---------- seed data ----------
const settingsJson = (theme, language, recents) =>
  JSON.stringify({
    version: 2,
    theme,
    language,
    uiZoom: 100,
    editorFontSize: 18,
    contextPanel: { hidden: false, collapsed: {} },
    recentProjects: recents.map((p) => ({ path: p, title: p, openedAt: new Date().toISOString() })),
  })

/** Creates an empty book through the UI once; returns its files as { relPath: text }. */
async function bootBase() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
  const page = await ctx.newPage()
  await page.goto(URL)
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

const doc = (...paras) => ({
  type: 'doc',
  content: paras.map(([id, text]) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] })),
})
const D = (year, month, day) => ({ year, month, day })
const dpos = (year, month = 0, day = 1) => ({ date: D(year, month, day) })
const node = (id, title, date, x, y) => ({ id, title, description: { type: 'doc', content: [] }, date, color: null, tag: null, branchId: null, pos: { x, y }, codexIds: [], ruleIds: [] })
const edge = (id, from, to) => ({ id, from, to })

/** The book with the deliberate problems. Returns { relPath: text }. */
function buildMain(baseBook) {
  const out = { ...baseBook }
  const m = JSON.parse(baseBook['project.json'])
  const typeId = (title) => m.codexTypes.find((t) => t.title === title).id
  const kindId = (title) => m.stateKinds.find((k) => k.title === title).id
  const relId = (title) => m.relationTypes.find((t) => t.title === title).id
  const catId = (title) => m.ruleCategories.find((t) => t.title === title).id
  const put = (rel, obj) => (out[rel] = JSON.stringify(obj, null, 1))

  // timelines
  const TL = m.timelines[0].id
  const TL2 = 'tl-court'
  const main = JSON.parse(baseBook[m.timelines[0].path])
  main.nodes = [
    node('n-a', 'Siege begins', D(500, 2, 1), 0, 0),
    node('n-b', 'Siege ends', D(300, 5, 10), 260, 0),
    node('n-c', 'Midsummer feast', D(700, 1, 30), 520, 0), // 30 Feb: not in the calendar
    node('n-d', 'Envoys arrive', null, 780, 0),
    node('n-e', 'Coronation', D(800, 9, 3), 1040, 0),
    node('n-f', 'Lone watchtower', null, 520, 160),
  ]
  main.edges = [edge('e1', 'n-a', 'n-b'), edge('e2', 'n-b', 'n-c'), edge('e3', 'n-c', 'n-d'), edge('e4', 'n-d', 'n-e')]
  put(m.timelines[0].path, main)
  put(`timelines/${TL2}.json`, {
    version: 1, id: TL2, name: 'Court', view: 'flow', branches: [],
    nodes: [node('n-g', 'Council meets', D(1000, 3, 5), 0, 0), node('n-h', 'Council ends', D(1100, 3, 9), 260, 0), node('n-i', 'Aftermath', D(1200, 4, 1), 520, 0)],
    edges: [edge('e5', 'n-g', 'n-h'), edge('e6', 'n-h', 'n-i')],
  })
  m.timelines.push({ id: TL2, path: `timelines/${TL2}.json`, title: 'Court' })

  // codex
  const entries = [
    ['en-aldric', 'Aldric', 'Character', [
      { id: 's-1', kindId: kindId('Status'), value: 'Alive', from: dpos(600), until: dpos(700), final: false },
      { id: 's-2', kindId: kindId('Status'), value: 'Wounded', from: dpos(650), until: dpos(750), final: false },
    ]],
    ['en-mara', 'Mara', 'Character', [
      { id: 's-3', kindId: kindId('Status'), value: 'Free', from: dpos(600), until: dpos(700), final: false },
      { id: 's-4', kindId: kindId('Status'), value: 'Captive', from: dpos(700), until: dpos(800), final: false }, // touches at 700: fine
    ]],
    ['en-brenna1', 'Brenna', 'Character', []],
    ['en-brenna2', 'Brenna', 'Character', []],
    ['en-hermit', 'Old Hermit', 'Character', []],
  ]
  for (const [id, name, type, states] of entries) {
    put(`codex/${id}.json`, { version: 2, id, typeId: typeId(type), name, states })
    m.codexEntries.push({ id, path: `codex/${id}.json`, title: name })
  }
  put('relationships/rel-1.json', { version: 1, id: 'rel-1', fromId: 'en-mara', toId: 'en-aldric', typeId: relId('Friend') })
  m.relationships.push({ id: 'rel-1', path: 'relationships/rel-1.json' })

  // rule
  put('rules/rule-1.json', { version: 1, id: 'rule-1', title: 'The dead stay dead', categoryId: catId('Magic') })
  m.rules.push({ id: 'rule-1', path: 'rules/rule-1.json', title: 'The dead stay dead' })

  // knowledge: Aldric learns at 1050, forgets at 1150
  put('knowledge/k-1.json', {
    version: 1, id: 'k-1', title: "The king's secret",
    learnings: [{ id: 'l-1', entryId: 'en-aldric', at: dpos(1050), note: '', forgottenAt: dpos(1150), revealedIn: null }],
  })
  m.knowledge.push({ id: 'k-1', path: 'knowledge/k-1.json', title: "The king's secret" })

  // scenes
  const scene1 = m.manuscript[0].children[0]
  const S1 = scene1.id
  scene1.title = 'The Siege'
  const S2 = 'sc-aftermath'
  const ev = (id, bl, tl, nd) => ({ id, from: { item: S1, block: bl }, to: { item: tl, block: nd }, kind: 'event' })
  const kn = (id, bl) => ({ id, from: { item: S1, block: bl }, to: { item: 'k-1', entry: 'en-aldric' }, kind: 'knowledge' })
  put(scene1.path, {
    version: 3, id: S1, title: 'The Siege', status: 'revising', synopsis: '', wordCount: 42,
    content: doc(
      ['b-crown', 'The crown was placed on his head at the third bell.'],
      ['b-early', 'Aldric whispered what the king had done, long before he could have known it.'],
      ['b-late', 'Years afterwards Aldric repeated the secret, though he had long forgotten it.'],
    ),
    todos: [{ id: 't-1', text: 'Tighten the opening', done: false }],
    comments: [],
    links: [ev('lk-1', 'b-crown', TL, 'n-e'), ev('lk-2', 'b-early', TL2, 'n-g'), ev('lk-3', 'b-late', TL2, 'n-i'), kn('lk-4', 'b-early'), kn('lk-5', 'b-late')],
  })
  put(`manuscript/${S2}.json`, {
    version: 3, id: S2, title: 'Aftermath', status: 'draft', synopsis: '', wordCount: 9,
    content: doc(['b-quiet', 'The camp was quiet; nobody wished to speak of it.']),
    todos: [], comments: [], links: [],
  })
  m.manuscript[0].children.push({ id: S2, type: 'scene', title: 'Aftermath', path: `manuscript/${S2}.json`, children: [] })

  out['project.json'] = JSON.stringify(m, null, 1)
  return out
}

const seedStorage = (name, book, theme, language) => {
  const ls = [{ name: SETTINGS_KEY, value: settingsJson(theme, language, [name]) }]
  const t = String(Date.now() - 10_000)
  for (const [k, v] of Object.entries(book)) {
    ls.push({ name: `${PFX}${name}/${k}`, value: v })
    ls.push({ name: `${META}${name}/${k}`, value: t })
  }
  return { cookies: [], origins: [{ origin: ORIGIN, localStorage: ls }] }
}

// ---------- page helpers ----------
async function openBook(name, book, theme = 'light', language = 'en') {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: language === 'pl' ? 'pl-PL' : 'en-US', storageState: seedStorage(name, book, theme, language) })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  const L = language === 'pl' ? pl : en
  await page.goto(URL)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: L.welcome.openProject }).click()
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('tree', { name: L.write.tree }).waitFor()
  await page.waitForTimeout(900)
  return { ctx, page, errors, L, name }
}
async function shot(name, s, settle = 400, opts = {}) {
  await s.page.waitForTimeout(settle)
  await s.page.screenshot({ path: join(out, `${name}.png`), ...opts })
  console.log(`${name}${s.errors.length ? ' ERRORS' : ' ok'}`)
  if (s.errors.length) {
    console.log('  ', [...new Set(s.errors)])
    allErrors.push(...s.errors)
    s.errors.length = 0
  }
}
const navTo = async (s, key) => {
  await s.page.getByRole('link', { name: new RegExp(`^\\s*${s.L.sections[key]}`) }).first().click()
  await s.page.waitForTimeout(500)
}
const goChecks = async (s) => {
  await navTo(s, 'checks')
  await s.page.getByRole('heading', { name: s.L.checks.title, level: 1 }).waitFor()
  await s.page.waitForTimeout(500)
}
const runChecks = async (s) => {
  await s.page.getByRole('button', { name: s.L.checks.run }).click()
  await s.page.waitForTimeout(700)
}
const findings = (s) => s.page.locator('li.row')
const rowWith = (s, text) => findings(s).filter({ hasText: text })
const groupCounts = async (s) => {
  const o = {}
  for (const sev of ['error', 'warning', 'info']) {
    const h = s.page.locator(`h2.sev-${sev}`)
    o[sev] = (await h.count()) ? Number((await h.locator('.count').innerText()).trim()) : 0
  }
  return o
}
const badgeEl = (s) => s.page.locator('.nav-link .badge')
const files = async (s) => {
  await s.page.waitForTimeout(1400)
  const d = await s.page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  return Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith(`${PFX}${s.name}/`)).map(([k, v]) => [k.slice(`${PFX}${s.name}/`.length), v]))
}
const nodeEl = (page, title) => page.locator(`[data-graph-node][aria-label^="${title}."]`)

// ---------- the flow ----------
let baseBook = null
let mainBook = null

async function flow(theme) {
  tag = theme
  const T = (n) => `${n}-${theme}`
  const s = await openBook('main', mainBook, theme)
  const { page } = s
  await goChecks(s)

  // ---- findings from the seed ----
  const txt = norm(await page.locator('section.page').innerText())
  const counts = await groupCounts(s)
  check(counts.error >= 1 && counts.warning >= 1 && counts.info >= 1, `all three severity groups present (${JSON.stringify(counts)})`)
  check(counts.error === 1 && counts.warning === 5, `errors 1 (impossible date), warnings 5 (order, duplicate, overlap, 2 knowledge) (${JSON.stringify(counts)})`)
  check(await rowWith(s, 'Midsummer feast').filter({ hasText: 'does not exist in the calendar' }).count() === 1, 'invalid date: names "Midsummer feast"')
  const order = rowWith(s, 'comes after')
  check((await order.count()) === 1 && /"Siege ends" comes after "Siege begins"/.test(norm(await order.innerText())), 'date order: warning names both events (later first)')
  check((await rowWith(s, 'share the name or alias').count()) === 1 && /Brenna/.test(txt), 'duplicate: two "Brenna" entries in one finding')
  check((await rowWith(s, 'overlapping').count()) === 1, 'overlap: exactly one overlapping-states finding')
  check((await rowWith(s, 'Aldric has overlapping').count()) === 1 && (await rowWith(s, 'Mara has overlapping').count()) === 0, 'touching states (Mara, boundary 700) give no overlap warning; Aldric does')
  check((await rowWith(s, 'before learning it').count()) === 1 && (await rowWith(s, 'after forgetting it').count()) === 1, 'knowledge: use before learning and use after forgetting')
  check((await rowWith(s, 'not linked to anything').count()) === 1, 'info: unlinked rule')
  check((await rowWith(s, 'has no relationships, groups or links').filter({ hasText: 'Old Hermit' }).count()) === 1, 'info: codex entry with no connections')
  check((await rowWith(s, 'Lone watchtower').filter({ hasText: 'no connections in timeline' }).count()) === 1, 'info: isolated node')
  check((await rowWith(s, 'open revision to-do').count()) === 1, 'info: open revision to-do')
  check((await page.getByText(/broken|missing or deleted/).count()) === 0, 'no broken-link finding at the start')

  // ---- badge ----
  const badgeTxt = norm(await badgeEl(s).innerText().catch(() => ''))
  check(badgeTxt === String(counts.error + counts.warning), `badge = errors + warnings (${badgeTxt} vs ${counts.error + counts.warning})`)
  await shot(T('01-checks-all-severities'), s)
  await findings(s).last().scrollIntoViewIfNeeded()
  await shot(T('01b-checks-info-group'), s, 300)
  await page.getByRole('heading', { name: s.L.checks.title, level: 1 }).scrollIntoViewIfNeeded()
  await shot(T('05-sidebar-badge-clip'), s, 100, { clip: { x: 0, y: 0, width: 280, height: 440 } })

  // ---- click the later node of the date-order finding ----
  await order.locator('button.chip', { hasText: 'Siege ends' }).click()
  await page.waitForTimeout(900)
  check(page.url().includes('timelines'), 'date order: clicking the later node opens the timeline')
  const titleVal = await page.getByLabel('Title', { exact: true }).inputValue().catch(() => '')
  check(titleVal === 'Siege ends', `date order: the later node is selected (title "${titleVal}")`)

  // ---- broken link: trash the node, run, restore, run ----
  await page.getByRole('link', { name: /Timelines/ }).first().click()
  await page.locator('.tl').waitFor()
  await page.getByRole('button', { name: 'Fit to view' }).click()
  await page.waitForTimeout(400)
  await nodeEl(page, 'Coronation').click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Delete event', exact: true }).first().click()
  const confirm = page.locator('.q-card.dialog', { hasText: 'linked passage' })
  await confirm.waitFor()
  await confirm.getByRole('button', { name: 'Delete event' }).click()
  await page.waitForTimeout(500)
  await goChecks(s)
  await runChecks(s)
  const broken = rowWith(s, 'timeline event that is missing or deleted')
  check((await broken.count()) === 1, 'broken link: appears after trashing the linked node')
  check((await groupCounts(s)).error === 2, 'broken link: it is an error (2 errors now)')
  await shot(T('08-broken-link-after-trash'), s, 200)
  await page.getByRole('button', { name: 'Trash' }).click()
  const trash = page.getByRole('dialog', { name: 'Trash' })
  await trash.waitFor()
  await trash.getByRole('button', { name: /Restore.*Coronation/ }).click()
  await page.waitForTimeout(500)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  await runChecks(s)
  check((await rowWith(s, 'timeline event that is missing or deleted').count()) === 0, 'broken link: gone after restore + Run checks')
  check((await groupCounts(s)).error === 1, 'broken link: back to 1 error')

  // ---- ignore ----
  const badgeBefore = Number(norm(await badgeEl(s).innerText()))
  const dup = rowWith(s, 'share the name or alias')
  await dup.getByRole('button', { name: /^Ignore/ }).click()
  await page.waitForTimeout(500)
  check((await rowWith(s, 'share the name or alias').count()) === 0, 'ignore: finding hidden')
  check(Number(norm(await badgeEl(s).innerText())) === badgeBefore - 1, 'ignore: badge drops by one for an ignored warning')
  const todo = rowWith(s, 'open revision to-do')
  await todo.getByRole('button', { name: /^Ignore/ }).click()
  await page.waitForTimeout(500)
  check((await rowWith(s, 'open revision to-do').count()) === 0, 'ignore: info finding hidden')
  await page.locator('.show-ignored').click()
  await page.waitForTimeout(400)
  const shown = rowWith(s, 'share the name or alias')
  check((await shown.count()) === 1, 'show ignored: finding is back')
  const op = await shown.evaluate((el) => getComputedStyle(el).opacity)
  check(Number(op) < 1 && (await shown.getByText(s.L.checks.ignoredTag).count()) === 1, `show ignored: dimmed and tagged (opacity ${op})`)
  check((await shown.getByRole('button', { name: /^Stop ignoring/ }).count()) === 1, 'show ignored: row offers "Stop ignoring"')
  await shot(T('02-checks-show-ignored'), s)
  await page.locator('.show-ignored').click()
  await page.waitForTimeout(300)
  const ign = JSON.parse((await files(s))['ignored.json'] ?? '{}')
  check(ign.ignored?.length === 2, `ignored.json holds 2 ids (${ign.ignored?.length})`)

  // changed problem reappears: add a new open to-do to the scene
  await navTo(s, 'write')
  await page.getByRole('tree', { name: 'Manuscript tree' }).getByRole('treeitem', { name: /The Siege/ }).first().click()
  await page.waitForTimeout(500)
  const newTodo = page.getByLabel('New to-do', { exact: true })
  await newTodo.fill('Check the bell count')
  await newTodo.press('Enter')
  await page.waitForTimeout(500)
  await goChecks(s)
  await runChecks(s)
  const again = rowWith(s, '2 open revision to-dos')
  check((await again.count()) === 1, 'changed problem (new open to-do, new id) reappears although the old one is ignored')
  check((await again.getByText(s.L.checks.ignoredTag).count()) === 0, 'reappeared finding is not marked ignored')

  // ---- toggle a check off in Settings ----
  await navTo(s, 'settings')
  const sw = page.getByRole('switch', { name: en.checks.name['date-order'] })
  await sw.waitFor()
  await sw.scrollIntoViewIfNeeded()
  await sw.click()
  await page.waitForTimeout(900)
  check((await sw.getAttribute('aria-checked')) === 'false', 'settings: the switch shows "off" after clicking')
  await shot(T('04-settings-checks-group'), s, 200, { fullPage: false })
  await page.getByRole('switch', { name: en.checks.name['open-todo'] }).scrollIntoViewIfNeeded()
  await shot(T('04b-settings-checks-group-info'), s, 300)
  await goChecks(s)
  await runChecks(s)
  check((await rowWith(s, 'comes after').count()) === 0, 'check off: date-order finding hidden after Run checks')
  check((await rowWith(s, 'Midsummer feast').filter({ hasText: 'calendar' }).count()) === 1, 'check off: other checks still report')
  await navTo(s, 'settings')
  await page.getByRole('switch', { name: en.checks.name['date-order'] }).click()
  await page.waitForTimeout(500)
  await goChecks(s)
  await runChecks(s)
  check((await rowWith(s, 'comes after').count()) === 1, 'check on again: date-order finding returns')
  const mf = JSON.parse((await files(s))['project.json'])
  check(mf.checkSettings && Object.values(mf.checkSettings).every((v) => typeof v === 'boolean'), `checkSettings saved in the manifest (${JSON.stringify(mf.checkSettings)})`)

  check(s.errors.length === 0, `no console errors (${[...new Set(s.errors)].join(' | ')})`)
  allErrors.push(...s.errors)
  await s.ctx.close()
}

async function darkPass() {
  tag = 'dark'
  const s = await openBook('main', mainBook, 'dark')
  const { page } = s
  await goChecks(s)
  await shot('01-checks-all-severities-dark', s)
  await page.getByRole('button', { name: /^Ignore/ }).first().click()
  await page.waitForTimeout(300)
  await page.locator('.show-ignored').click()
  await shot('02-checks-show-ignored-dark', s)
  await navTo(s, 'settings')
  await page.getByRole('switch', { name: en.checks.name['date-order'] }).scrollIntoViewIfNeeded()
  await shot('04-settings-checks-group-dark', s)
  allErrors.push(...s.errors)
  await s.ctx.close()
}

async function emptyState(theme) {
  tag = `empty-${theme}`
  const s = await openBook('clean', baseBook, theme)
  await goChecks(s)
  check((await findings(s).count()) === 0, 'empty book: no findings')
  check((await s.page.getByText(en.checks.empty).count()) === 1, 'empty book: "No problems found." shown')
  check((await badgeEl(s).count()) === 0, 'badge absent at 0')
  await shot(theme === 'light' ? '03-checks-empty-state' : '03-checks-empty-state-dark', s)
  // the main book with everything switched off also shows no badge
  allErrors.push(...s.errors)
  await s.ctx.close()
}

async function badIgnored() {
  tag = 'bad-ignored'
  const book = { ...mainBook, 'ignored.json': '{ not json' }
  const m = JSON.parse(book['project.json'])
  m.ignoredFindings = { id: 'ign-1', path: 'ignored.json' }
  book['project.json'] = JSON.stringify(m)
  const s = await openBook('badign', book)
  await goChecks(s)
  const banner = s.page.getByRole('alert').filter({ hasText: /ignored findings could not be read/ })
  check((await banner.count()) === 1, 'invalid ignored.json: warning banner shown')
  check((await findings(s).count()) > 5, `invalid ignored.json: findings still shown (${await findings(s).count()})`)
  await shot('07-invalid-ignored-banner', s)
  const raw = (await files(s))['ignored.json']
  check(raw === '{ not json', 'invalid ignored.json: file left untouched')
  allErrors.push(...s.errors.filter((e) => !/ignored|invalid|json/i.test(e)))
  await s.ctx.close()
}

// English message fragments that must not appear on the Polish page.
const ENGLISH = [
  'comes after', 'share the name', 'overlapping', 'before learning', 'after forgetting', 'not linked to anything',
  'has no relationships', 'has no connections', 'open revision', 'does not exist in the calendar', 'missing or deleted',
  'has no linked passage', 'Run checks', 'Show ignored', 'No problems', 'Last run', 'Ignore', 'Errors', 'Warnings', 'Not run yet',
]
async function polish() {
  tag = 'polish'
  const s = await openBook('main', mainBook, 'light', 'pl')
  const { page, L } = s
  await goChecks(s)
  await page.waitForTimeout(300)
  const body = norm(await page.locator('body').innerText())
  check(!/\bchecks\.[a-z]/i.test(body) && !/settings\.checks/.test(body), 'polish: no raw "checks." keys on the Checks page')
  const leaked = ENGLISH.filter((f) => body.includes(f))
  check(leaked.length === 0, `polish: no English fallback sentences (${leaked.join(', ') || 'none'})`)
  check((await findings(s).count()) > 5, 'polish: findings listed')
  check(body.includes(L.checks.run) && body.toLowerCase().includes(L.checks.group.error.toLowerCase()), 'polish: header and group titles localised')
  check(await page.getByText(/porządku|wcześniej/).count() > 0 || (await findings(s).first().innerText()).length > 0, 'polish: finding texts present')
  const badgeLabel = await badgeEl(s).getAttribute('aria-label').catch(() => '')
  check(/problem/.test(badgeLabel ?? ''), `polish: badge label localised (${badgeLabel})`)
  await shot('06-checks-polish', s)
  await navTo(s, 'settings')
  await page.waitForTimeout(400)
  const sbody = norm(await page.locator('body').innerText())
  check(!/\bchecks\.(name|desc|msg)/.test(sbody) && !/settings\.checks/.test(sbody), 'polish: no raw keys on Settings')
  const sLeak = Object.values(en.checks.name).filter((n) => sbody.includes(n))
  check(sLeak.length === 0, `polish: Settings check names localised (${sLeak.join(', ') || 'none'})`)
  await page.getByText(L.settings.checks.title).scrollIntoViewIfNeeded()
  await shot('06-settings-checks-polish', s)
  check(s.errors.length === 0, `polish: no console errors (${[...new Set(s.errors)].join(' | ')})`)
  allErrors.push(...s.errors)
  await s.ctx.close()
}

baseBook = await bootBase()
mainBook = buildMain(baseBook)
await flow('light')
await emptyState('light')
await badIgnored()
await polish()
if (!process.env.LIGHT_ONLY) {
  await darkPass()
  await emptyState('dark')
}
tag = 'end'
console.log(failures ? `${failures} CHECK(S) FAILED` : 'all checks passed')
console.log(allErrors.length ? `CONSOLE ERRORS: ${[...new Set(allErrors)].join(' | ')}` : 'no console errors')
await browser.close()
