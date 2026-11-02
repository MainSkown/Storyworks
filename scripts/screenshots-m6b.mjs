// Usage: node scripts/screenshots-m6b.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Drives the M6b flow in the browser build (not the Tauri window): events, state kinds, states (overlap, touching, unknown, final, date mode, reverse view, broken value), Chronicle, v7 migration, Polish, perf; checks the acceptance items and captures the screens in Light and Dark.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m6b.mjs <outDir>')
mkdirSync(out, { recursive: true })
const URL = 'http://localhost:1420/'
const SETTINGS_KEY = 'storyworks:settings.json'
const P = 'storyworks:project:demo/'

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base)
  .filter((d) => d.startsWith('chromium-'))
  .sort()
  .pop()
const browser = await chromium.launch({
  executablePath: join(base, dir, 'chrome-linux64/chrome'),
  args: ['--no-sandbox'],
})

const settings = (theme) =>
  JSON.stringify({
    version: 2,
    theme,
    language: 'en',
    uiZoom: 100,
    editorFontSize: 18,
    contextPanel: { hidden: false, collapsed: {} },
    recentProjects: [],
  })

const allErrors = []
let failures = 0
let tag = ''
function check(cond, msg) {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'}: [${tag}] ${msg}`)
}

async function open(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:1420' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('__seeded')) return
    sessionStorage.setItem('__seeded', '1')
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v)
  }, { [SETTINGS_KEY]: settings(theme) })
  await page.goto(URL)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  return { ctx, page, errors }
}

async function shot(name, s, settle = 500, opts = {}) {
  await s.page.waitForTimeout(settle)
  await s.page.screenshot({ path: join(out, `${name}.png`), ...opts })
  console.log(`${name}${s.errors.length ? ' ERRORS' : ' ok'}`)
  if (s.errors.length) {
    console.log('  ', [...new Set(s.errors)])
    allErrors.push(...s.errors)
    s.errors.length = 0
  }
}

// ---------- data helpers ----------
const files = async (page) => {
  await page.waitForTimeout(1400) // autosave debounce
  const d = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  return Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith(P)))
}

// ---------- the flow ----------
const navTo = async (page, name) => {
  await page.getByRole('link', { name: new RegExp(`^\\s*${name}`) }).first().click()
  await page.waitForTimeout(500)
}
const items = (page) => page.locator('aside button.item')
const nameField = (page) => page.getByLabel('Name', { exact: true })
const tabTo = async (page, name) => {
  await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click()
  await page.waitForTimeout(250)
}
const selectEntry = async (page, name) => {
  await items(page).filter({ hasText: name }).first().click()
  await page.waitForTimeout(300)
}
async function newEntry(page, name, typeName) {
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.waitForTimeout(300)
  const n = nameField(page)
  await n.fill(name)
  await n.press('Enter')
  await page.waitForTimeout(250)
  if (typeName) {
    await page.getByLabel('Type', { exact: true }).click()
    await page.getByRole('option', { name: typeName, exact: true }).click()
    await page.waitForTimeout(250)
  }
}
const readJson = async (page, rel) => {
  const f = await files(page)
  return f[`${P}${rel}`] ? JSON.parse(f[`${P}${rel}`]) : null
}
const fdir = (f, d) => Object.entries(f).filter(([k]) => k.startsWith(`${P}${d}/`) && k.endsWith('.json'))
const opts = (page) => page.locator('.q-menu [role=option]')
const norm = (s) => s.replace(/\s+/g, ' ').trim()
const stateDlg = (page) => page.getByRole('dialog', { name: /^(Add|Edit) state$/ })
const kindsDlg = (page) => page.getByRole('dialog', { name: 'State kinds' })
const stRows = (page) => page.locator('.st section.group ul.rows > li.row')
const stRowsText = async (page) => (await stRows(page).allInnerTexts()).map(norm)
const overlapMsgs = (page) => page.locator('.st p.overlap')

// ----- timeline helpers -----
const nodeEl = (page, title) => page.locator(`[data-graph-node][aria-label^="${title}."]`)
const setField = async (page, label, value) => {
  const f = page.getByLabel(label, { exact: true })
  await f.fill(value)
  await f.press('Enter')
  await page.waitForTimeout(150)
}
const goTimelines = async (page) => {
  await page.getByRole('link', { name: /Timelines/ }).first().click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(400)
}
async function addEvent(page, title, date) {
  await page.getByRole('button', { name: 'Add event' }).click()
  await page.waitForTimeout(350)
  await setField(page, 'Title', title)
  if (date) await setField(page, 'Date', date)
}
const fit = async (page) => {
  await page.getByRole('button', { name: 'Fit to view' }).click()
  await page.waitForTimeout(500)
}
async function pickNode(page, title) {
  await fit(page)
  await nodeEl(page, title).click()
  await page.waitForTimeout(300)
}
async function linkNodeToEntry(page, nodeTitle, entrySearch) {
  await pickNode(page, nodeTitle)
  await page.getByRole('button', { name: 'Add entry', exact: true }).click()
  const epd = page.getByRole('dialog', { name: 'Add entry' })
  await epd.waitFor()
  await epd.getByRole('combobox').fill(entrySearch)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(450)
}

// ----- state dialog helpers -----
const posGroup = (page, label) => stateDlg(page).getByRole('group', { name: label })
async function pickEvent(page, label, search) {
  await posGroup(page, label).getByRole('button', { name: /Choose event|Change event/ }).click()
  const pd = page.getByRole('dialog', { name: 'Choose an event' })
  await pd.waitFor()
  await pd.getByRole('combobox').fill(search)
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
}
async function pickDate(page, label, text) {
  const g = posGroup(page, label)
  await g.getByRole('button', { name: 'Date', exact: true }).click()
  await page.waitForTimeout(150)
  const inp = g.locator('input.control')
  await inp.fill(text)
  await inp.press('Enter')
  await page.waitForTimeout(150)
}
async function pickKind(page, kindName) {
  const d = stateDlg(page)
  await d.getByLabel('Kind', { exact: true }).click()
  await opts(page).filter({ hasText: new RegExp(`^${kindName} `) }).first().click()
  await page.waitForTimeout(200)
}
async function pickValueEntry(page, name) {
  const d = stateDlg(page)
  const sel = d.getByLabel('Entry', { exact: true })
  await sel.click()
  await sel.fill(name)
  await opts(page).filter({ hasText: name }).first().click()
  await page.waitForTimeout(200)
}
const submitState = async (page) => {
  await stateDlg(page).locator('button[type=submit]').click()
  await page.waitForTimeout(450)
}
async function addState(page, { kind, entry, text, from, until, fromDate, untilDate, final }) {
  await page.getByRole('button', { name: 'Add state' }).click()
  await stateDlg(page).waitFor()
  await pickKind(page, kind)
  if (entry) await pickValueEntry(page, entry)
  if (text !== undefined) await stateDlg(page).getByLabel('Value', { exact: true }).fill(text)
  if (from) await pickEvent(page, 'From', from)
  if (fromDate) await pickDate(page, 'From', fromDate)
  if (until) await pickEvent(page, 'Until (optional)', until)
  if (untilDate) await pickDate(page, 'Until (optional)', untilDate)
  if (final) await stateDlg(page).getByLabel('Final state').check()
}

let lastDump = null
async function flow(theme) {
  tag = theme
  const T = (n) => `${n}-${theme}`
  const s = await open(theme)
  const { page } = s
  await page.getByRole('button', { name: 'New project' }).click()
  const dlg = page.getByRole('dialog', { name: 'New project' })
  await dlg.getByLabel('Book title').fill('The Long Road')
  await dlg.getByLabel('Author').fill('Mara Quill')
  await dlg.getByLabel('Project name').fill('demo')
  await dlg.getByRole('button', { name: 'Create project' }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await page.waitForTimeout(600)

  // ---- timelines: 5 events on the main timeline, 1 on a side timeline ----
  await goTimelines(page)
  await addEvent(page, 'Coronation', '3 May 1400') // A
  await addEvent(page, 'Treaty signed', '20 June 1400') // B
  await addEvent(page, 'Harvest ends', '31 October 1400') // C
  await addEvent(page, 'Exile of the heir') // D: undated, after C on the path
  await addEvent(page, 'Return of the heir') // E: undated, after D
  await page.getByRole('button', { name: 'New timeline' }).click()
  await page.waitForTimeout(300)
  const rn = page.getByLabel('Timeline name')
  if (await rn.count()) { await rn.fill('Side story'); await rn.press('Enter'); await page.waitForTimeout(300) }
  await addEvent(page, 'Far-off storm') // F: other timeline, undated
  let m = await readJson(page, 'project.json')
  check(m.version >= 8, `manifest version 8 (${m.version})`)
  check((m.stateKinds ?? []).length === 4, `starter state kinds seeded once (${(m.stateKinds ?? []).map((k) => k.title).join(', ')})`)
  check(['Location', 'Owner', 'Status', 'Title'].every((n) => (m.stateKinds ?? []).some((k) => k.title === n)), 'starter kinds named Location, Owner, Status, Title')
  let f = await files(page)
  check(fdir(f, 'state-kinds').length === 4, `state-kinds/*.json files exist (${fdir(f, 'state-kinds').length})`)
  const kinds = Object.fromEntries(fdir(f, 'state-kinds').map(([, v]) => JSON.parse(v)).map((k) => [k.name, k]))
  check(kinds.Location?.valueType === 'entry' && kinds.Location.exclusive && kinds.Owner?.valueType === 'entry' && kinds.Owner.exclusive && kinds.Status?.valueType === 'text' && kinds.Status.exclusive && kinds.Title?.valueType === 'text' && !kinds.Title.exclusive, 'starter kind types/exclusive flags match the spec')
  const tls = fdir(f, 'timelines').map(([, v]) => JSON.parse(v))
  console.log('  timelines:', tls.map((t) => `${t.name}:${t.nodes.length}n/${t.edges.length}e`).join(', '))
  check(tls.length === 2 && tls.reduce((a, t) => a + t.nodes.length, 0) === 6, 'six events on two timelines')
  const main = tls.find((t) => t.nodes.length === 5)
  const d = main?.nodes.find((n) => n.title === 'Exile of the heir')
  check(!!main && main.edges.some((e) => e.to === d.id), 'undated Exile sits on the path after Harvest ends')

  // ---- entries ----
  await navTo(page, 'Codex')
  await newEntry(page, 'Aldric', 'Character')
  await newEntry(page, 'Mara', 'Character')
  await newEntry(page, 'Sword', 'Item')
  await newEntry(page, 'Brindle', 'Town')
  await newEntry(page, 'Vale', 'Country')

  // link Aldric to three events (Coronation, Exile, Far-off storm)
  await goTimelines(page)
  await page.getByRole('button', { name: /Main timeline/ }).first().click().catch(() => {})
  await page.waitForTimeout(400)
  await linkNodeToEntry(page, 'Coronation', 'aldr')
  await linkNodeToEntry(page, 'Exile of the heir', 'aldr')
  // third link on the side timeline
  await page.locator('ul[aria-label="Timelines"] button', { hasText: 'Side story' }).first().click()
  await page.waitForTimeout(500)
  await linkNodeToEntry(page, 'Far-off storm', 'aldr')
  f = await files(page)
  const tl2 = fdir(f, 'timelines').map(([, v]) => JSON.parse(v)).flatMap((t) => t.nodes)
  check(tl2.filter((n) => n.codexIds.length === 1).length === 3, `Aldric linked to three events (${tl2.filter((n) => n.codexIds.length).length})`)

  // ---- empty Chronicle first (Mara has nothing yet) ----
  await navTo(page, 'Codex')
  await selectEntry(page, 'Mara')
  await tabTo(page, 'Chronicle')
  check((await page.getByText(/Nothing here yet\. Link this entry/).count()) === 1, 'chronicle: empty state text')
  await shot(T('12-chronicle-empty'), s, 300)

  // ---- relationship Aldric -> Mara linked to Harvest ends ----
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'Relations')
  await page.getByRole('button', { name: 'Add relationship' }).click()
  const rd = page.getByRole('dialog', { name: /relationship|relacj/i })
  await rd.waitFor()
  await rd.getByLabel('Other entry', { exact: true }).click()
  await rd.getByLabel('Other entry', { exact: true }).fill('Mara')
  await opts(page).filter({ hasText: 'Mara' }).first().click()
  const rt = rd.getByLabel('Relation type', { exact: true })
  await rt.click()
  await opts(page).filter({ hasText: 'Enemy' }).first().click()
  await rd.getByRole('button', { name: 'Link to an event…' }).click()
  const rp = page.getByRole('dialog', { name: /Link relationship to an event/ })
  await rp.waitFor()
  await rp.locator('[role=option]', { hasText: 'Harvest ends' }).first().click()
  await page.waitForTimeout(300)
  await rd.locator('button[type=submit]').click()
  await page.waitForTimeout(500)

  // ---- Sword: Owner states, overlap ----
  await selectEntry(page, 'Sword')
  await tabTo(page, 'States')
  check((await page.getByText('No states yet.').count()) === 1, 'sword states: empty text')
  check((await page.getByText('No other entry has a state pointing here.').count()) === 1, 'sword states: no reverse rows')
  await addState(page, { kind: 'Owner', entry: 'Aldric', from: 'Coronation', until: 'Harvest ends' })
  await submitState(page)
  await addState(page, { kind: 'Owner', entry: 'Mara', from: 'Treaty signed' })
  await shot(T('03-add-state-dialog-event'), s, 200)
  await submitState(page)
  let r = await stRowsText(page)
  console.log('  sword rows:', r.join(' || '))
  check(r.length === 2, `sword: two Owner states (${r.length})`)
  check((await overlapMsgs(page).count()) === 2, `overlap: warning on both rows (${await overlapMsgs(page).count()})`)
  const ot = (await overlapMsgs(page).allInnerTexts()).map(norm)
  check(ot.some((x) => /Overlaps with Mara/.test(x)) && ot.some((x) => /Overlaps with Aldric/.test(x)), `overlap: each names the other (${ot.join(' | ')})`)
  check((await page.locator('.st li.row.warn').count()) === 2, 'overlap: both rows highlighted')
  await shot(T('01-states-overlap'), s, 300)

  // touching: second starts exactly at Harvest ends
  const editRow = async (valuePattern) => page.getByRole('button', { name: new RegExp(`^Edit state Owner: ${valuePattern}`) }).click()
  await editRow('Mara')
  await stateDlg(page).waitFor()
  await pickEvent(page, 'From', 'Harvest ends')
  await submitState(page)
  check((await overlapMsgs(page).count()) === 0, `touching: no overlap warning (${await overlapMsgs(page).count()})`)
  await shot(T('02-states-touching'), s, 300)

  // unknown order: second starts on another timeline, undated
  await editRow('Mara')
  await stateDlg(page).waitFor()
  await pickEvent(page, 'From', 'Far-off storm')
  await submitState(page)
  check((await overlapMsgs(page).count()) === 0, 'unknown order: no warning')
  // back to touching
  await editRow('Mara')
  await stateDlg(page).waitFor()
  await pickEvent(page, 'From', 'Harvest ends')
  await submitState(page)

  // until before from refused
  await page.getByRole('button', { name: 'Add state' }).click()
  await stateDlg(page).waitFor()
  await pickKind(page, 'Title')
  await stateDlg(page).getByLabel('Value', { exact: true }).fill('Relic of kings')
  await pickEvent(page, 'From', 'Harvest ends')
  await pickEvent(page, 'Until (optional)', 'Coronation')
  await stateDlg(page).locator('button[type=submit]').click()
  await page.waitForTimeout(400)
  const al = (await stateDlg(page).getByRole('alert').allInnerTexts()).map(norm).join('|')
  check(/The end is before the start/.test(al), `until before from: visible message (${al})`)
  check(await stateDlg(page).isVisible(), 'until before from: dialog stays open')
  await shot(T('04-until-before-from'), s, 200)
  // fix it: Until in date mode, after From
  await pickDate(page, 'Until (optional)', '1 December 1400')
  await shot(T('05-add-state-dialog-date'), s, 200)
  await submitState(page)
  r = await stRowsText(page)
  check(r.length === 3 && r.some((x) => /Relic of kings/.test(x) && /1 December 1400/.test(x)), `date mode: Title state with a calendar date until (${r.find((x) => /Relic/.test(x))})`)
  check((await overlapMsgs(page).count()) === 0, 'non-exclusive Title never warns')

  // ---- Aldric: Location Brindle, Status Dead (final), Title by date ----
  await navTo(page, 'Codex')
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'States')
  await addState(page, { kind: 'Location', entry: 'Brindle', from: 'Treaty signed' })
  await submitState(page)
  await addState(page, { kind: 'Title', text: 'Lord Protector', fromDate: '1 January 1400', untilDate: '3 May 1400' })
  await submitState(page)
  await addState(page, { kind: 'Status', text: 'Dead', from: 'Harvest ends', final: true })
  await submitState(page)
  r = await stRowsText(page)
  console.log('  aldric rows:', r.join(' || '))
  check(r.length === 3, `aldric: three states (${r.length})`)
  check(r.some((x) => /Dead/.test(x) && /Final/.test(x) && /Harvest ends/.test(x)), 'final: Status Dead shows the Final badge')
  check(r.some((x) => /Lord Protector/.test(x) && /1 January 1400/.test(x) && /3 May 1400/.test(x)), 'date mode: calendar dates shown in the period')
  await shot(T('06-final-state'), s, 300)

  // ---- reverse view on the Town ----
  await navTo(page, 'Codex')
  await selectEntry(page, 'Brindle')
  await tabTo(page, 'States')
  const rev = (await page.locator('.st h2:has-text("States pointing here") ~ ul.rows > li').allInnerTexts()).map(norm)
  console.log('  brindle reverse:', rev.join(' || '))
  check(rev.length === 1 && /Location/.test(rev[0]) && /Aldric/.test(rev[0]) && /Treaty signed/.test(rev[0]) && /ongoing/.test(rev[0]), 'reverse view: Brindle lists Aldric with the period')
  await shot(T('07-reverse-view-town'), s, 300)
  await page.locator('.st h2:has-text("States pointing here") ~ ul.rows button.link').first().click()
  await page.waitForTimeout(400)
  check((await nameField(page).inputValue().catch(() => '')) === 'Aldric' || (await page.getByRole('tab', { name: /^States/ }).count()) === 1, 'reverse view: row click opens Aldric')
  // Sword reverse side lists Aldric as owner of nothing; Aldric page lists the Sword?  (Owner values point at Aldric/Mara)
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'States')
  const aRev = (await page.locator('.st h2:has-text("States pointing here") ~ ul.rows > li').allInnerTexts()).map(norm)
  check(aRev.length === 1 && /Owner/.test(aRev[0]) && /Sword/.test(aRev[0]), `reverse view: Aldric lists the Sword as Owner (${aRev[0]})`)

  // ---- broken value: delete Brindle ----
  await selectEntry(page, 'Brindle')
  await tabTo(page, 'Details')
  await page.getByRole('button', { name: 'Delete entry' }).click()
  const ed = page.getByRole('alertdialog', { name: 'Delete entry' })
  await ed.waitFor()
  console.log('  delete confirm:', norm(await ed.innerText()))
  await ed.getByRole('button', { name: 'Delete entry' }).click()
  await page.waitForTimeout(700)
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'States')
  r = await stRowsText(page)
  check(r.some((x) => /Missing entry/.test(x)) && (await page.locator('.st li.row.broken').count()) === 1, `broken value: row shows Missing entry (${r.find((x) => /Missing/.test(x))})`)
  await shot(T('08-broken-value'), s, 300)
  await page.getByRole('button', { name: 'Trash' }).click().catch(() => {})
  const trash = page.getByRole('dialog', { name: 'Trash' })
  await trash.waitFor()
  await trash.getByRole('button', { name: /Restore.*Brindle/ }).click()
  await page.waitForTimeout(800)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(400)
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'States')
  check((await page.locator('.st li.row.broken').count()) === 0 && (await stRowsText(page)).some((x) => /Brindle/.test(x)), 'restore: broken value works again')

  // ---- State kinds manager (on Vale) ----
  await selectEntry(page, 'Vale')
  await tabTo(page, 'States')
  await page.getByRole('button', { name: 'State kinds…' }).click()
  const kd = kindsDlg(page)
  await kd.waitFor()
  check((await kd.getByLabel('Value type: Owner').isDisabled()) && (await kd.getByText('The value type cannot change while states use this kind.').count()) >= 1, 'kinds: value type locked while states use the kind (Owner)')
  check((await kd.getByLabel('Name: Owner').count()) === 1 && (await kd.getByLabel('One at a time: Owner').count()) === 1, 'kinds: name and exclusive controls per kind')
  await shot(T('09-kinds-manager'), s, 300)
  await kd.getByLabel('Name of the new kind').fill('Weather')
  await kd.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(400)
  await kd.getByLabel('Name of the new kind').fill('Mood')
  await kd.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(400)
  check((await kd.getByLabel('Name: Weather').count()) === 1 && (await kd.getByLabel('Name: Mood').count()) === 1, 'kinds: two new kinds added')
  const rnk = kd.getByLabel('Name: Weather')
  await rnk.fill('Climate')
  await rnk.press('Enter')
  await page.waitForTimeout(400)
  check((await kd.getByLabel('Name: Climate').count()) === 1, 'kinds: rename')
  await kd.getByLabel('One at a time: Climate').check({ force: true })
  await page.waitForTimeout(400)
  await kd.getByLabel('Value type: Climate').selectOption('entry')
  await page.waitForTimeout(300)
  check((await kd.getByLabel('Value type: Climate').inputValue()) === 'entry', 'kinds: unused kind can change its value type')
  f = await files(page)
  const climate = fdir(f, 'state-kinds').map(([, v]) => JSON.parse(v)).find((k) => k.name === 'Climate')
  check(climate?.exclusive === true && climate.valueType === 'entry', `kinds: rename + exclusive + type saved to the file (${JSON.stringify(climate)})`)
  await kd.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  await addState(page, { kind: 'Mood', text: 'Gloomy', from: 'Coronation' })
  await submitState(page)
  await page.getByRole('button', { name: 'State kinds…' }).click()
  await kd.waitFor()
  check(await kd.getByLabel('Value type: Mood').isDisabled(), 'kinds: Mood locked after use')
  // delete Mood, move its state to Location (entry): value-type warning
  await kd.getByRole('button', { name: 'Delete kind Mood' }).click()
  const kdel = page.getByRole('alertdialog', { name: /^Delete kind "/ })
  await kdel.waitFor()
  check((await kdel.getByText(/1 state will move/).count()) === 1, 'kind delete: says 1 state moves')
  await kdel.getByLabel('Move them to').click()
  await opts(page).filter({ hasText: /^Status$/ }).first().click()
  await page.waitForTimeout(200)
  check((await kdel.getByText(/different value types/).count()) === 0, 'kind delete: text -> text shows no type warning')
  await kdel.getByLabel('Move them to').click()
  await opts(page).filter({ hasText: /^Location$/ }).first().click()
  await page.waitForTimeout(250)
  check((await kdel.getByText(/different value types/).count()) === 1, 'kind delete: text -> entry shows the valueTypeChanges warning')
  await shot(T('10-kind-delete-reassign'), s, 300)
  await kdel.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.waitForTimeout(600)
  check((await kd.getByLabel('Name: Mood').count()) === 0, 'kind delete: kind gone')
  await kd.getByRole('button', { name: 'Delete kind Climate' }).click()
  await kdel.waitFor()
  check((await kdel.getByText('No state uses this kind.').count()) === 1, 'kind delete: unused kind has no reassign step')
  await kdel.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.waitForTimeout(500)
  await kd.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  f = await files(page)
  const vale = fdir(f, 'codex').map(([, v]) => JSON.parse(v)).find((x) => x.name === 'Vale')
  const locId = fdir(f, 'state-kinds').map(([, v]) => JSON.parse(v)).find((k) => k.name === 'Location')?.id
  check(vale?.states?.length === 1 && vale.states[0].kindId === locId && vale.states[0].value === 'Gloomy', 'kind delete: Vale state moved to Location, value kept as it was')
  check((await page.locator('.st li.row.broken').count()) === 1, 'kind delete: the moved text value shows as a broken entry value')
  check(fdir(f, 'state-kinds').length === 4, `kinds: back to 4 kind files (${fdir(f, 'state-kinds').length})`)

  // ---- Chronicle of Aldric ----
  const chr = (page) => page.locator('.chronicle ol.list > li button.row')
  const chrTexts = async (page) => (await chr(page).allInnerTexts()).map(norm)
  await navTo(page, 'Codex')
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'Chronicle')
  await page.waitForTimeout(300)
  let c = await chrTexts(page)
  console.log('  chronicle:\n    ' + c.join('\n    '))
  const idx = (re) => c.findIndex((x) => re.test(x))
  check(c.length === 7, `chronicle: 7 rows (3 events, 3 states, 1 relationship) (${c.length})`)
  check(idx(/Lord Protector/) === 0 && idx(/Coronation/) === 1 && idx(/Location/) === 2, 'chronicle: Title (1 Jan), Coronation (3 May), Location (20 Jun) in order')
  check(idx(/Exile/) > Math.max(idx(/Status/), idx(/Enemy/)) && idx(/Exile/) === 5, 'chronicle: undated Exile placed after Harvest ends by the path')
  check(/1 January 1400/.test(c[0]) && /3 May 1400/.test(c[1]) && /20 June 1400/.test(c[2]) && /31 October 1400/.test(c[3]) && /31 October 1400/.test(c[4]), `chronicle: in-world dates shown (${c.slice(0, 5).map((x) => x.split(' ').slice(0, 3).join(' ')).join(' | ')})`)
  check(/Date unknown/.test(c[5]), `chronicle: undated-but-ordered row says Date unknown (${c[5]})`)
  const unk = await page.locator('.chronicle h3.divider').allInnerTexts()
  check(unk.length === 1 && /Order unknown/.test(unk[0]) && /Far-off storm/.test(c[6]), `chronicle: Far-off storm under "Order unknown" (${unk.join('|')})`)
  check(c.some((x) => /Relationship/.test(x) && /Enemy/.test(x) && /Mara/.test(x)), 'chronicle: relationship linked to an event listed')
  check(c.some((x) => /Status/.test(x) && /Dead/.test(x) && /Final/.test(x)), 'chronicle: final state shows Final')
  await shot(T('13-chronicle-full'), s, 300)
  // row clicks
  await page.getByRole('button', { name: 'Open: State: Location' }).click()
  await page.waitForTimeout(400)
  check((await page.getByRole('tab', { name: /^States/ }).getAttribute('aria-selected')) === 'true', 'chronicle: state row opens the States tab')
  await tabTo(page, 'Chronicle')
  await page.getByRole('button', { name: /^Open: Relationship: Enemy/ }).click()
  await page.waitForTimeout(400)
  check((await page.getByRole('tab', { name: /^Relations/ }).getAttribute('aria-selected')) === 'true', 'chronicle: relationship row opens the Relations tab')
  await tabTo(page, 'Chronicle')
  await page.getByRole('button', { name: /^Open: Event: Coronation/ }).click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(800)
  check((await page.getByLabel('Title', { exact: true }).inputValue()) === 'Coronation', 'chronicle: event row jumps to the node on the timeline')

  // ---- persistence: reload ----
  f = await files(page)
  const ents = fdir(f, 'codex').map(([, v]) => JSON.parse(v)).filter((x) => x.typeId)
  check(ents.length === 5 && ents.every((e) => e.version === 2 && Array.isArray(e.states)), `files: all ${ents.length} entry files are version 2 with states`)
  check(ents.find((e) => e.name === 'Aldric').states.length === 3 && ents.find((e) => e.name === 'Sword').states.length === 3, 'files: Aldric 3 states, Sword 3 states')
  check(ents.find((e) => e.name === 'Aldric').states.every((st) => st.from && ('node' in st.from || 'date' in st.from)), 'files: positions stored as node or date')
  const swordStored = ents.find((e) => e.name === 'Sword').states
  console.log('  sword stored:', JSON.stringify(swordStored.map((x) => ({ k: x.kindId.slice(0, 4), from: x.from, until: x.until }))).slice(0, 400))
  m = await readJson(page, 'project.json')
  check(m.version >= 8 && m.stateKinds.length === 4, `files: manifest v8 with ${m.stateKinds.length} stateKinds`)
  await page.reload()
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: 'Open project' }).click()
  await page.getByRole('button', { name: 'demo', exact: true }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await navTo(page, 'Codex')
  await selectEntry(page, 'Sword')
  await tabTo(page, 'States')
  r = await stRowsText(page)
  check(r.length === 3 && (await overlapMsgs(page).count()) === 0, `reload: Sword states survive (${r.length} rows, no warnings)`)
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'States')
  check((await stRowsText(page)).length === 3, 'reload: Aldric states survive')

  lastDump = await files(page)

  // ---- Polish smoke ----
  await navTo(page, 'Settings')
  await page.locator('.language-select').click()
  await page.getByRole('option', { name: 'Polski' }).click()
  await page.waitForTimeout(500)
  const keyLike = /\b(states|stateKinds|chronicle|codex|relations)\.[A-Za-z]+/
  const english = /Add state|States pointing here|State kinds|Order unknown|Overlaps with|Date unknown|Missing entry|One at a time|Value type|Move them to|Final state|Choose event|ongoing/
  async function polishCheck(name) {
    const txt = await page.locator('body').innerText()
    const k = keyLike.exec(txt)
    const e = english.exec(txt)
    check(!k && !e, `polish: ${name} has no raw keys or English leftovers (${k?.[0] ?? e?.[0] ?? 'clean'})`)
  }
  await navTo(page, 'Kodeks')
  await selectEntry(page, 'Sword')
  await tabTo(page, 'Stany')
  await selectEntry(page, 'Sword')
  await tabTo(page, 'Stany')
  await polishCheck('Stany tab (overlap-free)')
  // make an overlap to see the Polish warning
  await page.getByRole('button', { name: /^Edytuj stan Owner|^Edytuj stan Właściciel/ }).nth(1).click()
  const pdlg = page.getByRole('dialog', { name: /Edytuj stan/ })
  await pdlg.waitFor()
  await polishCheck('state dialog')
  await shot(T('17-state-dialog-polish'), s, 300)
  await pdlg.getByRole('button', { name: 'Anuluj' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Rodzaje stanów…' }).click()
  await page.waitForTimeout(400)
  await polishCheck('kinds dialog')
  const pk = (await page.getByRole('dialog', { name: 'Rodzaje stanów' }).locator('input.name').evaluateAll((els) => els.map((e) => e.value))).join(' ')
  check(/Location/.test(pk) && /Owner/.test(pk) && /Status/.test(pk) && /Title/.test(pk), 'polish: kinds created in an English book keep their English names')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'Stany')
  await polishCheck('Stany tab (Aldric, final)')
  await shot(T('16-states-polish'), s, 300)
  await tabTo(page, 'Kronika')
  await polishCheck('Kronika')
  await shot(T('18-chronicle-polish'), s, 300)

  await s.ctx.close()
}

// ---------- v7 book (made from the finished book) ----------
async function migration(theme) {
  tag = `${theme}-v7`
  const T = (n) => `${n}-${theme}`
  const OLD = 'old7'
  const PFX = 'storyworks:project:'
  const book = {}
  for (const [k, v] of Object.entries(lastDump)) book[k.slice(P.length)] = v
  const manifest = JSON.parse(book['project.json'])
  const v7 = { ...manifest, version: 7 }
  delete v7.stateKinds
  const out = { 'project.json': JSON.stringify(v7) }
  const brokenName = 'Vale'
  let brokenRaw = null
  for (const [k, v] of Object.entries(book)) {
    if (k === 'project.json' || k.startsWith('state-kinds/')) continue
    const j = JSON.parse(v)
    if (k.startsWith('codex/') && j.typeId && j.version === 2) {
      const old = { ...j, version: 1 }
      delete old.states
      if (j.name === brokenName) {
        old.name = 123 // hand-broken: wrong type, stays version 1
        brokenRaw = JSON.stringify(old)
        out[k] = brokenRaw
      } else out[k] = JSON.stringify(old)
    } else out[k] = v
  }
  const now = Date.now()
  const ls = [{ name: SETTINGS_KEY, value: settings(theme) }]
  const lsSettings = JSON.parse(ls[0].value)
  lsSettings.recentProjects = [{ path: OLD, title: 'The Long Road', openedAt: new Date().toISOString() }]
  ls[0].value = JSON.stringify(lsSettings)
  for (const [k, v] of Object.entries(out)) {
    ls.push({ name: `${PFX}${OLD}/${k}`, value: v })
    ls.push({ name: `storyworks:projectmeta:${OLD}/${k}`, value: String(now - 10_000) })
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', storageState: { cookies: [], origins: [{ origin: 'http://localhost:1420', localStorage: ls }] } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  const s = { page, errors, ctx }
  await page.goto(URL)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: 'Open project' }).click()
  await page.getByRole('button', { name: OLD, exact: true }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await navTo(page, 'Codex')
  const names = (await items(page).allInnerTexts()).map(norm)
  console.log('  v7 entries:', names.join(' | '))
  check(['Aldric', 'Mara', 'Sword', 'Brindle'].every((n) => names.some((x) => x.startsWith(n))), 'v7 book: the intact entries open')
  check((await page.locator('li.invalid').count()) === 1 && /invalid|damaged/i.test(await page.locator('li.invalid').innerText()), `v7 book: the hand-broken entry shows as invalid (${norm(await page.locator('li.invalid').allInnerTexts().then((a) => a.join('|')))})`)
  await shot(T('19-v7-migrated'), s, 300)
  await selectEntry(page, 'Sword')
  await tabTo(page, 'States')
  check((await page.getByText('No states yet.').count()) === 1, 'v7 book: States tab opens, empty')
  check((await page.getByRole('button', { name: 'Add state' }).isEnabled()), 'v7 book: starter kinds available (Add state enabled)')
  await addState(page, { kind: 'Title', text: 'Heirloom', fromDate: '1 January 1400' })
  await submitState(page)
  const g = async (rel) => {
    await page.waitForTimeout(1400)
    return page.evaluate((k) => localStorage.getItem(k), `${PFX}${OLD}/${rel}`)
  }
  const mm = JSON.parse(await g('project.json'))
  check(mm.version >= 8 && mm.stateKinds.length === 4, `v7 book: manifest migrated to 8 with ${mm.stateKinds?.length} starter kinds`)
  const swordPath = mm.codexEntries.find((e) => e.title === 'Sword').path
  const sw = JSON.parse(await g(swordPath))
  check(sw.version === 2 && sw.states.length === 1, `v7 book: entry file rewritten as version 2 with the new state (${sw.version}/${sw.states.length})`)
  const aldricPath = mm.codexEntries.find((e) => e.title === 'Aldric').path
  check(JSON.parse(await g(aldricPath)).version === 2, 'v7 book: untouched-by-user entry also migrated to version 2')
  const valePath = mm.codexEntries.find((e) => e.title === brokenName)?.path ?? Object.keys(out).find((k) => out[k] === brokenRaw)
  check((await g(valePath)) === brokenRaw, 'v7 book: the broken entry file is byte-for-byte untouched')
  check(s.errors.filter((e) => !/Vale|invalid/i.test(e)).length === 0, 'v7 book: no console errors')
  await shot(T('20-v7-sword-states'), s, 300)
  allErrors.push(...s.errors.filter(() => false))
  await ctx.close()
}
await flow('light')
await migration('light')
if (!process.env.LIGHT_ONLY) { await flow('dark'); await migration('dark') }
tag = 'end'
console.log(failures ? `${failures} CHECK(S) FAILED` : 'all checks passed')
console.log(allErrors.length ? `CONSOLE ERRORS: ${[...new Set(allErrors)].join(' | ')}` : 'no console errors')
await browser.close()
