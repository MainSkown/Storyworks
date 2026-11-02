// Usage: node scripts/screenshots-m6c.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Drives the M6c flow in the browser build (not the Tauri window): knowledge items, learnings from three places, As-of views, matrix, editor use links, broken states, Chronicle, v8 migration, Polish; checks the acceptance items and captures the screens in Light and Dark.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m6c.mjs <outDir>')
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
const fdir = (f, d) => Object.entries(f).filter(([k]) => k.startsWith(`${P}${d}/`) && k.endsWith('.json'))
const opts = (page) => page.locator('.q-menu [role=option]')
const norm = (s) => s.replace(/\s+/g, ' ').trim()

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

// ----- knowledge helpers -----
const pl = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/pl.json'), 'utf8'))
const learnDlg = (page) => page.getByRole('dialog', { name: /^(Learns…|Edit what is learned)$/ })
const grp = (scope, label, exact = false) => scope.getByRole('group', { name: label, exact })
async function pickPos(page, scope, label, search, polish = false) {
  const L = polish ? pl.states.position : { pickEvent: 'Choose event', changeEvent: 'Change event', pickerTitle: 'Choose an event' }
  await grp(scope, label).getByRole('button', { name: new RegExp(`${L.pickEvent}|${L.changeEvent}`) }).click()
  const pd = page.getByRole('dialog', { name: L.pickerTitle })
  await pd.waitFor()
  await pd.getByRole('combobox').fill(search)
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
}
const clearPos = async (page, scope, label) => {
  await grp(scope, label).getByRole('button', { name: 'Clear' }).click()
  await page.waitForTimeout(200)
}
/** Fills the learning dialog; `item`/`learner` only when the dialog lets you choose. */
async function fillLearning(page, { item, newItem, learner, at, note, forgot }) {
  const d = learnDlg(page)
  await d.waitFor()
  if (item || newItem) {
    const sel = d.getByLabel('Knowledge item', { exact: true })
    await sel.click()
    await sel.fill(item ?? newItem)
    await opts(page).filter({ hasText: newItem ? /Create item/ : item }).first().click()
    await page.waitForTimeout(300)
  }
  if (learner) {
    const sel = d.getByLabel('Who learns it', { exact: true })
    await sel.click()
    await sel.fill(learner)
    await opts(page).filter({ hasText: learner }).first().click()
    await page.waitForTimeout(200)
  }
  if (at) await pickPos(page, d, 'Learns at', at)
  if (note) await d.getByLabel('Note', { exact: true }).fill(note)
  if (forgot) await pickPos(page, d, 'Forgotten or lost at', forgot)
  return d
}
const submitLearning = async (page) => {
  await learnDlg(page).locator('button[type=submit]').click()
  await page.waitForTimeout(500)
}
const kItems = (f) => fdir(f, 'knowledge').map(([, v]) => JSON.parse(v))
const itemRow = (page, title) => items(page).filter({ hasText: title }).first()
const goKnowledge = async (page) => {
  await navTo(page, 'Codex')
  await page.getByRole('link', { name: 'Knowledge', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Knowledge', level: 1 }).waitFor()
  await page.waitForTimeout(300)
}
const goMatrix = async (page) => {
  await navTo(page, 'Codex')
  await page.getByRole('link', { name: 'Knowledge matrix' }).first().click()
  await page.locator('section.km').waitFor()
  await page.waitForTimeout(300)
}
async function entryAsOf(page) {
  const secs = page.locator('.ek section.group')
  const out = {}
  for (let i = 0; i < (await secs.count()); i++)
    out[norm(await secs.nth(i).locator('h3').innerText())] = (await secs.nth(i).locator('li.as-row').allInnerTexts()).map(norm)
  return out
}
const itemAsOf = async (page) => (await page.locator('ul.as-of li').allInnerTexts()).map(norm)
const has = (arr, ...needles) => arr.some((x) => needles.every((n) => x.includes(n)))

// ----- editor helpers -----
const aside = (page) => page.locator('aside.context-panel')
const markers = (page) => page.locator('[data-marker-block]')
const brokenMarkers = (page) => page.locator('[data-marker-block].broken')
const goWrite = (page) => page.getByRole('link', { name: /Write/ }).first().click()
const bodyEd = (page) => page.getByRole('textbox', { name: 'Scene text' })
const para = (page, text) => bodyEd(page).locator('p', { hasText: text })
const clickPara = async (page, text) => {
  await para(page, text).click()
  await page.waitForTimeout(250)
}
const row = (page, name) => page.getByRole('tree', { name: 'Manuscript tree' }).getByRole('treeitem', { name: new RegExp(name) })
const linkDlg = (page) => page.getByRole('dialog', { name: 'Link to…' })
async function openLinkPicker(page, text) {
  await clickPara(page, text)
  await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Link to…', exact: true }).click()
  await linkDlg(page).waitFor()
  await page.waitForTimeout(200)
}
async function linkTab(page, text, tabName, search) {
  await openLinkPicker(page, text)
  const d = linkDlg(page)
  await d.getByRole('tab', { name: tabName }).click()
  await page.waitForTimeout(150)
  await d.getByRole('combobox').fill(search)
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(450)
}
async function linkKnowledge(page, text, itemSearch, entrySearch) {
  await openLinkPicker(page, text)
  const d = linkDlg(page)
  await d.getByRole('tab', { name: 'Knowledge' }).click()
  await page.waitForTimeout(150)
  await d.getByRole('combobox').fill(itemSearch)
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await d.getByRole('combobox').fill(entrySearch)
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(450)
}
const scenesOf = async (page) =>
  Object.entries(await files(page)).filter(([k]) => k.startsWith(`${P}manuscript/`)).map(([k, v]) => ({ key: k, ...JSON.parse(v) }))
const popover = (page) => page.locator('div.popover[role=dialog]')

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

  // ---- timelines ----
  await goTimelines(page)
  await addEvent(page, 'Coronation', '3 May 1400')
  await addEvent(page, 'Treaty signed', '20 June 1400')
  await addEvent(page, 'Harvest ends', '31 October 1400')
  await addEvent(page, 'Exile of the heir')
  await addEvent(page, 'Return of the heir')
  await addEvent(page, 'Spare feast')
  await page.getByRole('button', { name: 'New timeline' }).click()
  await page.waitForTimeout(300)
  const rn = page.getByLabel('Timeline name')
  if (await rn.count()) { await rn.fill('Side story'); await rn.press('Enter'); await page.waitForTimeout(300) }
  await addEvent(page, 'Far-off storm')
  let f = await files(page)
  const tls = fdir(f, 'timelines').map(([, v]) => JSON.parse(v))
  check(tls.length === 2 && tls.reduce((a, t) => a + t.nodes.length, 0) === 7, 'timelines: 6 events on main (3 dated, 3 undated on the path) + 1 on a side timeline')

  // ---- codex entries ----
  await navTo(page, 'Codex')
  await newEntry(page, 'Aldric', 'Character')
  await newEntry(page, 'Mara', 'Character')
  await newEntry(page, 'Sword', 'Item')

  // ---- empty matrix ----
  await goMatrix(page)
  check((await page.getByText('No knowledge items yet. Create them in the Codex.').count()) === 1, 'matrix: empty state when there are no items')
  await shot(T('00-matrix-empty'), s, 200)

  // ---- scene text ----
  await goWrite(page)
  await row(page, 'Scene 1').first().click()
  await page.waitForFunction(() => document.querySelector('[aria-label="Scene text"]')?.getAttribute('contenteditable') === 'true')
  await bodyEd(page).click()
  const lines = [
    'Aldric whispered that the king was a fraud.',
    'Mara had heard the rumour of the cursed sword.',
    'The envoys drank to the treaty in silence.',
    'Rain began before the bells stopped.',
  ]
  for (const [i, l] of lines.entries()) {
    await page.keyboard.type(l)
    if (i < lines.length - 1) await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Add scene' }).click()
  await page.getByLabel('Rename').fill('Arrival')
  await page.keyboard.press('Enter')
  await row(page, 'Arrival').first().click()
  await bodyEd(page).click()
  await page.keyboard.type('Mara reached the gates at dusk.')
  await page.waitForTimeout(400)
  await row(page, 'Scene 1').first().click()
  await page.waitForTimeout(500)

  // ---- Knowledge area: create the first item ----
  await goKnowledge(page)
  check((await page.getByText('No knowledge items yet.').count()) >= 1, 'knowledge: empty list text')
  await page.getByRole('button', { name: 'New item' }).click()
  await page.waitForTimeout(500)
  const titleIn = page.locator('#kn-title')
  await titleIn.fill('The king is a fraud')
  await titleIn.press('Enter')
  await page.waitForTimeout(300)
  const tagsSel = page.getByLabel('Tags', { exact: true })
  await tagsSel.click()
  await tagsSel.fill('secret')
  await page.keyboard.press('Enter')
  await tagsSel.fill('royal')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const desc = page.locator('.edit [contenteditable=true]').first()
  await desc.click()
  await page.keyboard.type('The crown was bought, not inherited.')
  await page.waitForTimeout(300)
  const about = page.getByLabel('Rule or entry', { exact: true })
  await about.click()
  await about.fill('Sword')
  await opts(page).filter({ hasText: 'Sword' }).first().click()
  await page.waitForTimeout(500)
  f = await files(page)
  let ks = kItems(f)
  const fraud = ks.find((k) => k.title === 'The king is a fraud')
  const swordId = fdir(f, 'codex').map(([, v]) => JSON.parse(v)).find((e) => e.name === 'Sword')?.id
  check(!!fraud && fraud.tags.join() === 'secret,royal' && fraud.about?.type === 'entry' && fraud.about.id === swordId && JSON.stringify(fraud.description).includes('bought'), `knowledge: item saved with tags, description and about (${JSON.stringify(fraud && { tags: fraud.tags, about: fraud.about?.type })})`)
  check(f[`${P}project.json`] && JSON.parse(f[`${P}project.json`]).knowledge?.length === 1, 'knowledge: listed in the manifest')
  check((await page.getByText('Nobody learns this yet.').count()) === 1, 'item page: "Nobody learns this yet." before any learning')

  // ---- learning 1: from the character page (Aldric learns the fraud at Treaty, forgets at Return) ----
  await navTo(page, 'Codex')
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'Knowledge')
  check((await page.getByText('Nothing recorded yet.').count()) === 1, 'entry knowledge: empty text')
  await page.getByRole('button', { name: 'Learns…' }).click()
  await fillLearning(page, { item: 'The king is a fraud', at: 'Treaty signed', note: 'Overheard at the council.', forgot: 'Return of the heir' })
  await submitLearning(page)
  f = await files(page)
  let fr = kItems(f).find((k) => k.title === 'The king is a fraud')
  check(fr.learnings.length === 1 && fr.learnings[0].entryId === fdir(f, 'codex').map(([, v]) => JSON.parse(v)).find((e) => e.name === 'Aldric').id, 'learning 1 (character page): stored on the item with the character as learner')
  check(fr.learnings[0].at.node && fr.learnings[0].forgottenAt?.node && fr.learnings[0].note === 'Overheard at the council.', 'learning 1: node positions and note stored')

  // ---- learning 2: from the item page (Mara learns at Harvest ends) incl. the forgotten-before-learned refusal ----
  await goKnowledge(page)
  await itemRow(page, 'The king is a fraud').click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Who learns it' }).click()
  let d = await fillLearning(page, { learner: 'Mara', at: 'Harvest ends', forgot: 'Coronation' })
  await shot(T('03a-learning-dialog'), s, 250)
  await d.locator('button[type=submit]').click()
  await page.waitForTimeout(400)
  const al = (await d.getByRole('alert').allInnerTexts()).map(norm).join('|')
  check(/cannot be forgotten before or when it is learned/.test(al), `refusal: visible message for forgotten-before-learned (${al})`)
  check(await d.isVisible(), 'refusal: dialog stays open')
  await shot(T('03-forgotten-before-learned'), s, 200)
  f = await files(page)
  check(kItems(f).find((k) => k.title === 'The king is a fraud').learnings.length === 1, 'refusal: nothing was saved')
  await clearPos(page, d, 'Forgotten or lost at')
  await submitLearning(page)
  f = await files(page)
  fr = kItems(f).find((k) => k.title === 'The king is a fraud')
  check(fr.learnings.length === 2 && fr.learnings[1].forgottenAt === null, 'learning 2 (item page): saved after clearing the bad forgotten-at')

  // ---- learning 3: from the node inspector (Aldric learns "The sword is cursed" at Coronation; item created in the dialog) ----
  await goTimelines(page)
  await page.locator('ul[aria-label="Timelines"] button', { hasText: 'Main timeline' }).first().click().catch(() => {})
  await page.waitForTimeout(400)
  await pickNode(page, 'Coronation')
  check((await page.getByText('Nobody learns or forgets anything at this event.').count()) === 1, 'node inspector: empty text before any learning at the node')
  check((await nodeEl(page, 'Coronation').locator('.know').count()) === 0, 'node badge: hidden at 0')
  await page.getByRole('button', { name: '+ Character learns…' }).click()
  await fillLearning(page, { newItem: 'The sword is cursed', learner: 'Aldric' })
  d = learnDlg(page)
  const atText = norm(await grp(d, 'Learns at').innerText())
  check(/Coronation/.test(atText), `node inspector: dialog preset to this event (${atText.slice(0, 60)})`)
  await submitLearning(page)
  f = await files(page)
  const cursed = kItems(f).find((k) => k.title === 'The sword is cursed')
  check(cursed?.learnings.length === 1 && cursed.learnings[0].at.node, 'learning 3 (node inspector): same record shape, item created in the dialog')
  check((await page.locator('[data-testid=node-knowledge-row]').count()) === 1, 'node inspector: lists "Aldric learns The sword is cursed"')
  await fit(page)
  const badge = nodeEl(page, 'Coronation').locator('.know')
  check((await badge.count()) === 1 && /(^|\s)1\s*$/.test(await badge.innerText()) && /1 knowledge event/.test(await badge.getAttribute('aria-label')), 'node badge: shows 1 with label')
  check((await nodeEl(page, 'Exile of the heir').locator('.know').count()) === 0, 'node badge: still hidden on a node without events')
  await shot(T('07-node-inspector-knowledge'), s, 350)

  // ---- edits on the item page: Mara learns "cursed" at Treaty, forgets at Far-off storm (other timeline: order unknown accepted) ----
  await goKnowledge(page)
  await itemRow(page, 'The sword is cursed').click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Who learns it' }).click()
  await fillLearning(page, { learner: 'Mara', at: 'Treaty signed', forgot: 'Far-off storm' })
  await submitLearning(page)
  check(!(await learnDlg(page).isVisible().catch(() => false)), 'unknown order: forgotten-at on another timeline is accepted')
  // Aldric forgets the curse at Treaty (edit from the character page)
  await navTo(page, 'Codex')
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'Knowledge')
  await page.getByRole('button', { name: 'Edit: The sword is cursed' }).click()
  await learnDlg(page).waitFor()
  await pickPos(page, learnDlg(page), 'Forgotten or lost at', 'Treaty signed')
  await submitLearning(page)
  f = await files(page)
  const cur = kItems(f).find((k) => k.title === 'The sword is cursed')
  check(cur.learnings.length === 2 && cur.learnings.filter((l) => l.forgottenAt).length === 2, 'edit from the character page: forgotten-at saved')
  // Temp rumour for the delete flows
  await page.getByRole('button', { name: 'Learns…' }).click()
  await fillLearning(page, { newItem: 'Temp rumour', at: 'Spare feast' })
  await submitLearning(page)
  f = await files(page)
  check(kItems(f).length === 3, `three knowledge items (${kItems(f).length})`)

  // ---- entry Knowledge tab ----
  let rowsTxt = (await page.locator('.ek ol.rows > li').allInnerTexts()).map(norm)
  console.log('  aldric knowledge rows:', rowsTxt.join(' || '))
  check(rowsTxt.length === 3 && /cursed/.test(rowsTxt[0]) && /fraud/.test(rowsTxt[1]) && /Temp rumour/.test(rowsTxt[2]), 'entry tab: learnings in chronological order (Coronation, Treaty, Spare feast)')
  await shot(T('06-entry-knowledge-tab'), s, 300)
  // As of on the character page
  await pickPos(page, page, 'As of this point', 'Coronation')
  let g = await entryAsOf(page)
  check(has(g['Not known yet'] ?? [], 'fraud') && has(g['Known'] ?? [], 'cursed'), `character as-of Coronation: fraud not yet, cursed known (${JSON.stringify(g)})`)
  await shot(T('05a-entry-asof-before'), s, 300)
  await pickPos(page, page, 'As of this point', 'Treaty signed')
  g = await entryAsOf(page)
  check(has(g['Known'] ?? [], 'fraud') && has(g['Forgotten'] ?? [], 'cursed'), `character as-of Treaty (at = known, forgotten at = forgotten): (${JSON.stringify(g)})`)
  await pickPos(page, page, 'As of this point', 'Harvest ends')
  g = await entryAsOf(page)
  check(has(g['Known'] ?? [], 'fraud') && has(g['Forgotten'] ?? [], 'cursed'), 'character as-of Harvest ends: fraud known')
  await pickPos(page, page, 'As of this point', 'Return of the heir')
  g = await entryAsOf(page)
  check(has(g['Forgotten'] ?? [], 'fraud') && has(g['Forgotten'] ?? [], 'cursed'), `character as-of Return of the heir: fraud forgotten after forgetting (${JSON.stringify(g)})`)
  await shot(T('05b-entry-asof-forgotten'), s, 300)
  await pickPos(page, page, 'As of this point', 'Far-off storm')
  g = await entryAsOf(page)
  check(has(g['Order unknown'] ?? [], 'fraud') && has(g['Order unknown'] ?? [], 'cursed') && Object.keys(g).length === 1, `character as-of other-timeline event: "Order unknown", never guessed (${JSON.stringify(g)})`)
  await shot(T('05c-entry-asof-unknown'), s, 300)
  await pickPos(page, page, 'As of this point', 'Treaty signed')
  await shot(T('05-entry-asof'), s, 300)

  // ---- item page: Who knows it + As of ----
  await goKnowledge(page)
  await itemRow(page, 'The king is a fraud').click()
  await page.waitForTimeout(400)
  const whoRows = (await page.locator('table.rows tbody tr').allInnerTexts()).map(norm)
  console.log('  who knows:', whoRows.join(' || '))
  check(whoRows.length === 2 && has(whoRows, 'Aldric', 'Treaty signed', 'Return of the heir', 'Overheard') && has(whoRows, 'Mara', 'Harvest ends'), 'item page: Who knows it lists both with positions, note and forgotten-at')
  await shot(T('01-item-page'), s, 300)
  const asOfCheck = async (ev, expectA, expectM) => {
    await pickPos(page, page, 'As of this point', ev)
    const r = await itemAsOf(page)
    check(has(r, 'Aldric', expectA) && has(r, 'Mara', expectM), `item as-of ${ev}: Aldric ${expectA}, Mara ${expectM} (${r.join(' | ')})`)
  }
  await asOfCheck('Coronation', 'Not yet', 'Not yet')
  await shot(T('02a-item-asof-before'), s, 300)
  await asOfCheck('Treaty signed', 'Knows', 'Not yet')
  await asOfCheck('Harvest ends', 'Knows', 'Knows')
  await asOfCheck('Return of the heir', 'Forgotten', 'Knows')
  await shot(T('02-item-asof'), s, 300)
  await asOfCheck('Far-off storm', 'Order unknown', 'Order unknown')

  // ---- matrix ----
  await goMatrix(page)
  const cell = (r, c) => page.locator(`td.cell[data-r="${r}"][data-c="${c}"]`)
  const heads = (await page.locator('th.rowh').allInnerTexts()).map(norm)
  const cols = (await page.locator('th.colh').allInnerTexts()).map(norm)
  console.log('  matrix rows:', heads.join(','), 'cols:', cols.join(' | '))
  check(heads.join() === 'Aldric,Mara' && cols.length === 3, 'matrix: rows = entries with learnings, columns = items')
  const c00 = norm(await cell(0, 0).innerText())
  check(/Known/.test(c00) && /Treaty signed/.test(c00), `matrix: cell shows state and learning position (${c00})`)
  check((await cell(1, 2).getAttribute('class')).includes('none'), 'matrix: empty cell for no learning')
  await shot(T('08-matrix'), s, 300)
  await pickPos(page, page, 'As of', 'Coronation')
  const cls = async (r, c) => (await cell(r, c).getAttribute('class')).split(/\s+/)
  check((await cls(0, 0)).includes('not-yet') && (await cls(0, 1)).includes('known') && (await cls(1, 0)).includes('not-yet'), 'matrix as-of Coronation: not-yet cells greyed, known stays')
  await shot(T('09-matrix-asof'), s, 300)
  await pickPos(page, page, 'As of', 'Far-off storm')
  check((await cls(0, 0)).includes('unknown') && (await cls(1, 1)).includes('unknown'), 'matrix as-of other timeline: unknown (never guessed)')
  await clearPos(page, page, 'As of')
  // keyboard
  await cell(0, 0).focus()
  const active = () => page.evaluate(() => { const a = document.activeElement; return a ? `${a.dataset.r},${a.dataset.c}` : '' })
  await page.keyboard.press('ArrowRight')
  const k1 = await active()
  await page.keyboard.press('ArrowDown')
  const k2 = await active()
  await page.keyboard.press('ArrowLeft')
  const k3 = await active()
  await page.keyboard.press('ArrowUp')
  const k4 = await active()
  check([k1, k2, k3, k4].join(' ') === '0,1 1,1 1,0 0,0', `matrix keyboard: arrows move between cells (${[k1, k2, k3, k4].join(' ')})`)
  await page.keyboard.press('End')
  check((await active()) === '0,2', `matrix keyboard: End goes to last column (${await active()})`)
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check((await page.locator('#kn-title').inputValue().catch(() => '')) === 'The king is a fraud', 'matrix keyboard: Enter opens the knowledge item')
  await goMatrix(page)
  await cell(1, 0).focus()
  await page.keyboard.press('Shift+Enter')
  await page.waitForTimeout(500)
  check((await nameField(page).inputValue().catch(() => '')) === 'Mara', 'matrix keyboard: Shift+Enter opens the entry')

  // ---- editor: use links ----
  await goWrite(page)
  await bodyEd(page).waitFor()
  await page.waitForTimeout(500)
  await shot(T('10a-editor-no-links'), s, 200)
  await linkTab(page, 'king was a fraud', 'Events', 'Coron')
  await linkKnowledge(page, 'king was a fraud', 'fraud', 'Mara')
  await linkTab(page, 'cursed sword', 'Codex', 'Mara')
  await linkKnowledge(page, 'cursed sword', 'cursed', 'Aldric')
  await linkKnowledge(page, 'drank to the treaty', 'fraud', 'Aldric')
  await linkKnowledge(page, 'Rain began', 'Temp', 'Aldric')
  let mk = await markers(page).evaluateAll((els) => els.map((e) => ({ kind: e.dataset.markerKind, label: e.getAttribute('aria-label') })))
  console.log('  markers:', JSON.stringify(mk))
  check(mk.length === 4, `editor: four paragraphs have markers (${mk.length})`)
  check(mk[0]?.kind === 'mixed' && mk[0].label === 'Linked to 1 event, 1 knowledge use', `gutter: event + knowledge is a mixed marker with a combined label (${mk[0]?.label})`)
  check(mk[1]?.kind === 'mixed' && mk[1].label === 'Linked to 1 codex entry, 1 knowledge use', `gutter: codex + knowledge mixed (${mk[1]?.label})`)
  check(mk[2]?.kind === 'knowledge' && mk[2].label === 'Linked to 1 knowledge use', `gutter: knowledge-only marker has its own kind and aria-label (${mk[2]?.label})`)
  const shapeOf = (n) => markers(page).nth(n).evaluate((e) => [...e.querySelectorAll('svg')].map((s) => s.querySelector('rect') ? 'square' : s.querySelector('circle') ? 'circle' : s.querySelector('path') ? 'diamond' : '?').join('+'))
  check((await shapeOf(2)) === 'square' && (await shapeOf(0)) === 'diamond+square' && (await shapeOf(1)) === 'circle+square', `gutter: shapes differ (diamond=event, circle=codex, square=knowledge): ${await shapeOf(0)} / ${await shapeOf(1)} / ${await shapeOf(2)}`)
  const overlap = await page.evaluate(() => {
    const p = document.querySelector('.ProseMirror p').getBoundingClientRect()
    return [...document.querySelectorAll('[data-marker-block]')].filter((m) => m.getBoundingClientRect().right > p.left).length
  })
  check(overlap === 0, `gutter: no marker (even mixed ones) overlaps the paragraph text (${overlap} overlapping)`)
  let sc = await scenesOf(page)
  const sc1 = sc.find((x) => x.links?.some((l) => l.kind === 'knowledge'))
  const kl = sc1.links.filter((l) => l.kind === 'knowledge')
  check(sc1.version === 3 && kl.length === 4 && kl.every((l) => l.to.entry && l.to.item), `scene file: version 3, four knowledge links with to.entry (${sc1.version}/${kl.length})`)
  // duplicate refused
  await linkKnowledge(page, 'drank to the treaty', 'fraud', 'Aldric')
  sc = await scenesOf(page)
  check(sc.find((x) => x.links?.some((l) => l.kind === 'knowledge')).links.filter((l) => l.kind === 'knowledge').length === 4, 'duplicate (block, item, entry) refused: still 4 knowledge links')
  check((await page.getByText(/already linked/).count()) >= 1, 'duplicate: a visible notice says it is already linked')
  await shot(T('13-duplicate-refused'), s, 100)
  await page.locator('.q-notification').first().waitFor({ state: 'detached', timeout: 9000 }).catch(() => {})
  await clickPara(page, 'king was a fraud')
  check((await aside(page).getByText('The king is a fraud — Mara').count()) >= 1 && (await aside(page).getByText('Coronation').count()) >= 1, '"This paragraph" panel lists the pair and the event')
  await shot(T('11-editor-gutter-mixed'), s, 300)
  await shot(T('12-this-paragraph-panel'), s, 100)
  check((await aside(page).getByRole('heading', { name: 'Knowledge used' }).count()) >= 1 && (await aside(page).getByText('The sword is cursed — Aldric').count()) >= 1, '"In this scene" panel lists the pairs under "Knowledge used"')
  await aside(page).getByRole('heading', { name: 'Knowledge used' }).scrollIntoViewIfNeeded()
  await shot(T('14-in-this-scene-panel'), s, 150)
  // popover
  await markers(page).nth(2).click()
  await popover(page).waitFor()
  check((await popover(page).getByText('The king is a fraud — Aldric').count()) === 1 && (await popover(page).getByRole('button', { name: 'Open' }).count()) === 1 && (await popover(page).getByRole('button', { name: 'Unlink' }).count()) === 1, 'popover: pair with Open and Unlink')
  await shot(T('15-popover'), s, 200)
  await popover(page).getByRole('button', { name: 'Open' }).click()
  await page.waitForTimeout(500)
  check((await page.locator('#kn-title').inputValue().catch(() => '')) === 'The king is a fraud', 'popover Open: opens the knowledge item')
  await goWrite(page)
  await bodyEd(page).waitFor()
  await page.waitForTimeout(500)
  // unlink a spare link: add (fraud, Mara) to the last paragraph, then unlink it
  await linkKnowledge(page, 'Rain began', 'fraud', 'Mara')
  check((await markers(page).nth(3).getAttribute('aria-label')) === 'Linked to 2 knowledge uses', 'gutter: two uses on one paragraph')
  await markers(page).nth(3).click()
  await popover(page).waitFor()
  await popover(page).locator('li', { hasText: 'The king is a fraud — Mara' }).getByRole('button', { name: 'Unlink' }).click()
  await page.waitForTimeout(500)
  check((await markers(page).nth(3).getAttribute('aria-label')) === 'Linked to 1 knowledge use', 'popover Unlink: one use removed')
  // picker shots
  await openLinkPicker(page, 'drank to the treaty')
  await linkDlg(page).getByRole('tab', { name: 'Knowledge' }).click()
  await page.waitForTimeout(300)
  check((await linkDlg(page).getByRole('option').count()) === 3 && (await linkDlg(page).getByText(/Learned by 2/).count()) >= 1, 'picker Knowledge tab, step 1: three items with learner counts')
  await shot(T('16-picker-knowledge-items'), s, 200)
  await linkDlg(page).getByRole('combobox').fill('cursed')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check((await linkDlg(page).getByRole('option').count()) === 3 && (await linkDlg(page).getByText(/learns at/).count()) === 2, 'picker Knowledge tab, step 2: entries grouped by type, learners show where they learn it')
  await shot(T('17-picker-knowledge-entries'), s, 200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- node delete with learnings (Spare feast), then Missing event ----
  await goTimelines(page)
  await pickNode(page, 'Spare feast')
  await page.getByRole('button', { name: 'Delete event', exact: true }).first().click()
  const nconf = page.locator('.q-card.dialog', { hasText: '1 knowledge event is placed on this event and will show as a missing event.' })
  await nconf.waitFor()
  check(await nconf.isVisible(), 'node delete confirm warns about the learning placed on the node')
  await shot(T('18-node-delete-confirm'), s, 300)
  await nconf.getByRole('button', { name: 'Delete event' }).click()
  await page.waitForTimeout(600)
  await goKnowledge(page)
  await itemRow(page, 'Temp rumour').click()
  await page.waitForTimeout(400)
  const tr = (await page.locator('table.rows tbody tr').allInnerTexts()).map(norm)
  check(has(tr, 'Aldric', 'Missing event'), `learning on a deleted node shows "Missing event" (${tr.join('|')})`)
  await shot(T('19-missing-event'), s, 300)

  // ---- delete the item: confirm text, then broken marker + Problems ----
  await page.getByRole('button', { name: 'Delete item' }).click()
  const idel = page.getByRole('alertdialog', { name: 'Delete item' })
  await idel.waitFor()
  check(/Passages in the manuscript that use this item will show as broken\./.test(await idel.innerText()), 'item delete confirm says passages will show broken')
  await shot(T('20-item-delete-confirm'), s, 300)
  await idel.getByRole('button', { name: 'Delete item' }).click()
  await page.waitForTimeout(700)
  await goWrite(page)
  await bodyEd(page).waitFor()
  await page.waitForTimeout(600)
  check((await brokenMarkers(page).count()) === 1, 'deleted item: the use marker turns broken')
  await clickPara(page, 'Rain began')
  const problems = aside(page).locator('section', { has: page.getByRole('heading', { name: /Problems/ }) })
  check((await problems.getByText('Missing knowledge item').count()) === 1 && (await problems.getByRole('button', { name: 'Remove' }).count()) === 1 && (await problems.getByRole('button', { name: 'Relink' }).count()) === 0, 'Problems panel: reason "Missing knowledge item" with Remove (no Relink)')
  await shot(T('21-broken-item-problems'), s, 300)
  await aside(page).evaluate((e) => (e.scrollTop = e.scrollHeight))
  await shot(T('21b-problems-panel'), s, 200)
  await problems.getByRole('button', { name: 'Remove' }).click()
  await page.waitForTimeout(500)
  check((await brokenMarkers(page).count()) === 0, 'Problems Remove: the broken use link is gone')

  // ---- delete Mara: learnings and uses broken; restore from Trash un-breaks ----
  await navTo(page, 'Codex')
  await selectEntry(page, 'Mara')
  await tabTo(page, 'Details')
  await page.getByRole('button', { name: 'Delete entry' }).click()
  const edl = page.getByRole('alertdialog', { name: 'Delete entry' })
  await edl.waitFor()
  const edt = norm(await edl.innerText())
  console.log('  delete Mara confirm:', edt)
  check(/2 knowledge events will show as broken until restored\./.test(edt), 'entry delete confirm counts the learnings')
  await shot(T('22-entry-delete-confirm'), s, 300)
  await edl.getByRole('button', { name: 'Delete entry' }).click()
  await page.waitForTimeout(700)
  await goKnowledge(page)
  await itemRow(page, 'The king is a fraud').click()
  await page.waitForTimeout(400)
  const mr = (await page.locator('table.rows tbody tr').allInnerTexts()).map(norm)
  check(mr.some((x) => x.includes('Missing entry')), `deleted character: learning shows "Missing entry" (${mr.join('|')})`)
  await shot(T('23-broken-learning'), s, 300)
  await goWrite(page)
  await bodyEd(page).waitFor()
  await page.waitForTimeout(600)
  check((await brokenMarkers(page).count()) >= 1, 'deleted character: the use markers turn broken')
  await clickPara(page, 'king was a fraud')
  const prob2 = aside(page).locator('section', { has: page.getByRole('heading', { name: /Problems/ }) })
  check((await prob2.getByText(/Missing character|Missing knowledge item or character/).count()) >= 1, 'Problems panel: "Missing character"')
  await shot(T('24-broken-entry-uses'), s, 300)
  await aside(page).evaluate((e) => (e.scrollTop = e.scrollHeight))
  await shot(T('24b-problems-panel'), s, 200)
  await page.getByRole('button', { name: 'Trash' }).click()
  const trash = page.getByRole('dialog', { name: 'Trash' })
  await trash.waitFor()
  await trash.getByRole('button', { name: /Restore.*Mara/ }).click()
  await page.waitForTimeout(800)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(500)
  check((await brokenMarkers(page).count()) === 0, 'restore from Trash: uses un-break')
  await goKnowledge(page)
  await itemRow(page, 'The king is a fraud').click()
  await page.waitForTimeout(400)
  check(!(await page.locator('table.rows tbody tr').allInnerTexts()).some((x) => x.includes('Missing entry')), 'restore from Trash: learnings un-break')

  // ---- Chronicle of Aldric ----
  await navTo(page, 'Codex')
  await selectEntry(page, 'Aldric')
  await tabTo(page, 'Chronicle')
  const chr = (await page.locator('.chronicle ol.list > li button.row').allInnerTexts()).map(norm)
  console.log('  chronicle:\n    ' + chr.join('\n    '))
  const ci = (re) => chr.findIndex((x) => re.test(x))
  check(chr.length === 4 && ci(/Learns.*cursed/) === 0 && ci(/Learns.*fraud/) === 1 && ci(/Forgets.*cursed/) === 2 && ci(/Forgets.*fraud/) === 3, 'chronicle: Learns/Forgets rows in chronological order')
  check(/3 May 1400/.test(chr[0]) && /20 June 1400/.test(chr[1]), 'chronicle: in-world dates shown')
  await shot(T('25-chronicle'), s, 300)
  await page.locator('.chronicle ol.list > li button.row').nth(1).click()
  await page.waitForTimeout(500)
  check((await page.getByRole('tab', { name: /^Knowledge/ }).getAttribute('aria-selected')) === 'true', 'chronicle: knowledge row opens the Knowledge tab')

  // ---- persistence ----
  f = await files(page)
  const m = JSON.parse(f[`${P}project.json`])
  ks = kItems(f)
  check(m.version === 9 && m.knowledge.length === 2 && ks.length === 2, `files: manifest v9, ${m.knowledge.length} knowledge entries, ${ks.length} knowledge files`)
  check(ks.every((k) => k.version === 1 && fdir(f, 'knowledge').length === 2), 'files: knowledge/*.json items are version 1')
  sc = await scenesOf(page)
  check(sc.every((x) => x.version === 3), 'files: all scene files are version 3')
  await page.reload()
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: 'Open project' }).click()
  await page.getByRole('button', { name: 'demo', exact: true }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await goKnowledge(page)
  check((await items(page).count()) === 2, 'reload: both items still listed')
  await itemRow(page, 'The king is a fraud').click()
  await page.waitForTimeout(300)
  check((await page.locator('table.rows tbody tr').count()) === 2, 'reload: learnings survive')
  await goTimelines(page)
  await pickNode(page, 'Treaty signed')
  check(/(^|\s)3\s*$/.test(await nodeEl(page, 'Treaty signed').locator('.know').innerText().catch(() => '')), `reload: node badge counts learn + forget events (Treaty: ${await nodeEl(page, 'Treaty signed').locator('.know').innerText().catch(() => 'none')})`)
  await shot(T('07b-node-badges'), s, 250)
  await goWrite(page)
  await row(page, 'Scene 1').first().click()
  await bodyEd(page).waitFor()
  await page.waitForTimeout(600)
  check((await markers(page).count()) === 3 && (await brokenMarkers(page).count()) === 0, 'reload: gutter markers survive (3), none broken')

  lastDump = await files(page)

  // ---- Polish smoke ----
  await navTo(page, 'Settings')
  await page.locator('.language-select').click()
  await page.getByRole('option', { name: 'Polski' }).click()
  await page.waitForTimeout(500)
  const keyLike = /\b(knowledge|knowledgeUse|knowledgeMatrix|chronicle)\.[A-Za-z]+/
  const english = /Who knows it|Learns at|Not yet|Order unknown|Nobody learns|New item|Delete item|Knowledge matrix|As of|Missing entry|Choose a knowledge item|Forgets at|Told in|Back to Codex|Knowledge items|Forgotten|Search knowledge/
  async function polishCheck(name) {
    const txt = await page.locator('body').innerText()
    const k = keyLike.exec(txt)
    const e = english.exec(txt)
    check(!k && !e, `polish: ${name} has no raw keys or English leftovers (${k?.[0] ?? e?.[0] ?? 'clean'})`)
  }
  await navTo(page, 'Kodeks')
  await page.getByRole('link', { name: pl.knowledge.open, exact: true }).first().click()
  await page.waitForTimeout(500)
  await itemRow(page, 'The king is a fraud').click()
  await page.waitForTimeout(400)
  await polishCheck('Knowledge page')
  await pickPos(page, page, pl.knowledge.asOf.label, 'Treaty', true)
  await polishCheck('Knowledge page with As of')
  await shot(T('26-knowledge-polish'), s, 300)
  await page.getByRole('button', { name: pl.knowledge.who.add }).click()
  await page.getByRole('dialog', { name: pl.knowledge.dialog.addTitle }).waitFor()
  await polishCheck('learning dialog')
  await shot(T('27-learning-dialog-polish'), s, 250)
  await page.getByRole('button', { name: pl.knowledge.dialog.cancel }).click()
  await page.waitForTimeout(300)
  await navTo(page, 'Kodeks')
  await page.getByRole('link', { name: pl.knowledgeMatrix.open }).first().click()
  await page.locator('section.km').waitFor()
  await polishCheck('matrix')
  await shot(T('28-matrix-polish'), s, 300)
  await navTo(page, 'Kodeks')
  await selectEntry(page, 'Aldric')
  await tabTo(page, pl.knowledge.tab)
  await polishCheck('entry Wiedza tab')
  await navTo(page, 'Pisanie')
  await page.getByRole('treeitem', { name: /Scene 1/ }).first().click()
  const pm = page.locator('.ProseMirror').first()
  await pm.waitFor()
  await page.waitForTimeout(600)
  await pm.locator('p', { hasText: 'king was a fraud' }).click()
  await page.waitForTimeout(300)
  await polishCheck('editor panels')
  await shot(T('29a-panels-polish'), s, 200)
  await page.locator('button.tool.accent').click()
  const pdlg2 = page.getByRole('dialog', { name: pl.eventLink.picker.titleLink })
  await pdlg2.waitFor()
  await pdlg2.getByRole('tab', { name: pl.knowledgeUse.tab }).click()
  await page.waitForTimeout(300)
  await polishCheck('picker Knowledge tab')
  await shot(T('29-picker-polish'), s, 250)
  await page.keyboard.press('Escape')

  await s.ctx.close()
}

// ---------- v8 book (made from the finished book) ----------
async function migration(theme) {
  tag = `${theme}-v8`
  const T = (n) => `${n}-${theme}`
  const OLD = 'old8'
  const PFX = 'storyworks:project:'
  const book = {}
  for (const [k, v] of Object.entries(lastDump)) book[k.slice(P.length)] = v
  const manifest = JSON.parse(book['project.json'])
  const v8 = { ...manifest, version: 8 }
  delete v8.knowledge
  const out = { 'project.json': JSON.stringify(v8) }
  let brokenRaw = null
  let brokenPath = null
  const flat = (ns) => ns.flatMap((n) => [n, ...flat(n.children ?? [])])
  const sceneNodes = flat(manifest.manuscript).filter((n) => n.path)
  const scenePaths = sceneNodes.map((n) => n.path)
  const arrivalPath = sceneNodes.find((n) => n.title === 'Arrival')?.path
  for (const [k, v] of Object.entries(book)) {
    if (k === 'project.json' || k.startsWith('knowledge/')) continue
    if (scenePaths.includes(k)) {
      const j = JSON.parse(v)
      const old = { ...j, version: 2, links: (j.links ?? []).filter((l) => l.kind !== 'knowledge').map((l) => { const to = { ...l.to }; delete to.entry; return { ...l, to } }) }
      if (k === arrivalPath) {
        old.title = 123 // hand-broken: wrong type, stays version 2
        brokenRaw = JSON.stringify(old)
        brokenPath = k
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
  check(!!brokenPath, 'v8 fixture: a hand-broken scene was prepared')
  const g = async (rel) => {
    await page.waitForTimeout(1400)
    return page.evaluate((k) => localStorage.getItem(k), `${PFX}${OLD}/${rel}`)
  }
  const mm = JSON.parse(await g('project.json'))
  check(mm.version === 9, `v8 book: manifest migrated to 9 (${mm.version})`)
  const okScene = scenePaths.find((p) => p !== brokenPath)
  const sc = JSON.parse(await g(okScene))
  check(sc.version === 3, `v8 book: intact scene migrated to version 3 (${sc.version})`)
  check((await g(brokenPath)) === brokenRaw, 'v8 book: the hand-broken scene is byte-for-byte untouched')
  await row(page, 'Arrival').first().click()
  await page.waitForTimeout(300)
  const banner = norm(await page.getByText(/Invalid files/).first().innerText().catch(() => ''))
  check(/Invalid files \(1\)/.test(banner), `v8 book: the broken scene is listed as an invalid file (${banner.slice(0, 40)})`)
  await shot(T('30-v8-migrated'), s, 300)
  await navTo(page, 'Codex')
  await page.getByRole('link', { name: 'Knowledge', exact: true }).first().click()
  await page.waitForTimeout(400)
  check((await page.getByText('No knowledge items yet.').count()) >= 1, 'v8 book: Knowledge area opens, empty')
  await page.getByRole('button', { name: 'New item' }).click()
  await page.waitForTimeout(500)
  const mm2 = JSON.parse(await g('project.json'))
  check(mm2.knowledge?.length === 1, 'v8 book: a new item can be created after migration')
  check((await g(brokenPath)) === brokenRaw, 'v8 book: broken scene still untouched after more edits')
  check(s.errors.filter((e) => !/invalid|123|title/i.test(e)).length === 0, 'v8 book: no unexpected console errors')
  await ctx.close()
}
await flow('light')
await migration('light')
if (!process.env.LIGHT_ONLY) { await flow('dark'); await migration('dark') }
tag = 'end'
console.log(failures ? `${failures} CHECK(S) FAILED` : 'all checks passed')
console.log(allErrors.length ? `CONSOLE ERRORS: ${[...new Set(allErrors)].join(' | ')}` : 'no console errors')
await browser.close()
