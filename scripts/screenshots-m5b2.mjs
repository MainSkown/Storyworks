// Usage: node scripts/screenshots-m5b2.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Drives the M5b codex-link UI in the browser build (not the Tauri window): mentions, paragraph links, markers,
// popover, broken/restore, node codex, POV, timeline filter, panels; PASS/FAIL checks, Light and Dark.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m5b2.mjs <outDir>')
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

// ---------- page helpers ----------
const goTimelines = async (page) => {
  await page.getByRole('link', { name: /Timelines/ }).first().click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(400)
}
const setField = async (page, label, value) => {
  const f = page.getByLabel(label, { exact: true })
  await f.fill(value)
  await f.press('Enter')
  await page.waitForTimeout(150)
}
async function addEvent(page, title, date) {
  await page.getByRole('button', { name: 'Add event' }).click()
  await page.waitForTimeout(350)
  await setField(page, 'Title', title)
  if (date) await setField(page, 'Date', date)
}


// ---------- more helpers ----------
const aside = (page) => page.locator('aside.context-panel')
const markers = (page) => page.locator('[data-marker-block]')
const markerKinds = async (page) => page.locator('[data-marker-block]').evaluateAll((els) => els.map((e) => e.getAttribute('data-marker-kind')))
const goWrite = (page) => page.getByRole('link', { name: /^\s*Write/ }).first().click()
const navTo = async (page, name) => {
  await page.getByRole('link', { name: new RegExp(`^\\s*${name}`) }).first().click()
  await page.waitForTimeout(500)
}
const body = (page) => page.getByRole('textbox', { name: 'Scene text' })
const para = (page, text) => body(page).locator('p', { hasText: text })
async function clickPara(page, text) {
  await para(page, text).click()
  await page.waitForTimeout(250)
}
const row = (page, name) =>
  page.getByRole('tree', { name: 'Manuscript tree' }).getByRole('treeitem', { name: new RegExp(name) })
const items = (page) => page.locator('aside[aria-label="Codex entries"] button.item')
const nameField = (page) => page.getByLabel('Name', { exact: true })
const toast = (page) => page.locator('.q-notification')
const picker = (page) => page.getByRole('dialog', { name: 'Link to…' })
const popover = (page) => page.getByRole('dialog', { name: 'Links' })
const mentionCards = (page) => page.locator('ul[aria-label="Mentions"] > li')
const tabBtn = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) })
async function chipAdd(page, label, value) {
  const f = page.getByLabel(label, { exact: true })
  await f.click()
  await f.fill(value)
  await f.press('Enter')
  await page.waitForTimeout(250)
}
async function newEntry(page, name, aliases = []) {
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.waitForTimeout(300)
  const n = nameField(page)
  await n.fill(name)
  await n.press('Enter')
  await page.waitForTimeout(250)
  for (const a of aliases) await chipAdd(page, 'Aliases', a)
}
async function pickEntryInPicker(page, search) {
  const dlg = picker(page)
  await dlg.waitFor()
  await dlg.getByRole('combobox').fill(search)
  await page.waitForTimeout(150)
  return dlg
}
const sceneFiles = (f) => Object.entries(f).filter(([k]) => k.startsWith(`${P}manuscript/`)).map(([, v]) => JSON.parse(v))
const codexLinks = (f) => sceneFiles(f).flatMap((s) => s.links ?? []).filter((l) => l.kind === 'codex')
const ignoredFile = (f) => Object.entries(f).find(([k]) => /ignored/.test(k) && !k.includes('manuscript'))
async function reopen(page) {
  await page.waitForTimeout(1500)
  await page.reload()
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: 'Open project' }).click()
  await page.getByRole('button', { name: 'demo', exact: true }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await page.waitForTimeout(600)
}
const propsPanel = (page) => aside(page).locator('section', { has: page.getByRole('heading', { name: /This scene/ }) })
const section = (page, name) => aside(page).locator('section', { has: page.getByRole('heading', { name: new RegExp(name) }) })

// ---------- the flow ----------
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

  // --- setup: an event, two entries, two scenes ---
  await goTimelines(page)
  await addEvent(page, 'Coronation', '3 May 1400')
  await navTo(page, 'Codex')
  await newEntry(page, 'Aldric Voss', ['Aldric'])
  await newEntry(page, 'Mara of the Reeds', ['Reed Witch', 'Żmija'])
  await goWrite(page)
  await row(page, 'Scene 1').first().dblclick()
  await page.getByLabel('Rename').fill('Setting out')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Add scene' }).click()
  await page.getByLabel('Rename').fill('Arrival')
  await page.keyboard.press('Enter')
  await row(page, 'Arrival').first().click()
  await body(page).click()
  await page.keyboard.type('At last Aldric saw the walls.')
  await page.waitForTimeout(300)
  await row(page, 'Setting out').first().click()
  await page.waitForFunction(() => document.querySelector('[aria-label="Scene text"]')?.getAttribute('contenteditable') === 'true')
  await body(page).click()
  const lines = [
    'Aldric rode through the gate at dusk.',
    'Aldrich the baker never rode.',
    'Żmija czekała w trzcinach, a Aldric milczał.',
    'Żmijami nikt nie straszył.',
    'The king was crowned at dawn.',
    'Aldric looked back once more.',
  ]
  for (const [i, l] of lines.entries()) {
    await page.keyboard.type(l)
    if (i < lines.length - 1) await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(500)
  const openEntryTab = async (name, tabName) => {
    await navTo(page, 'Codex')
    await items(page).filter({ hasText: name }).click()
    await page.waitForTimeout(300)
    if (tabName) await tabBtn(page, tabName).click()
    await page.waitForTimeout(tabName === 'Mentions' ? 900 : 300)
  }

  // --- mentions ---
  await openEntryTab('Aldric Voss', 'Mentions')
  const texts = await mentionCards(page).allTextContents()
  console.log('  aldric mentions:', texts.length)
  check(texts.length === 4, `mentions: Aldric has 4 unlinked mentions (${texts.length})`)
  check(!texts.some((x) => /Aldrich/.test(x) && !/Aldric milczał|Aldric looked|Aldric rode|Aldric saw/.test(x)), 'mentions: "Aldrich" is not a match')
  check((await tabBtn(page, 'Mentions').textContent()).includes('4'), 'mentions: tab shows the count')
  await shot(T('15-mentions-tab'), s, 200)
  await items(page).filter({ hasText: 'Mara of the Reeds' }).click()
  await page.waitForTimeout(900)
  const mara = await mentionCards(page).allTextContents()
  check(mara.length === 1 && /Żmija czekała/.test(mara[0]), `mentions: Polish alias "Żmija" matches, "Żmijami" does not (${mara.length})`)
  await shot(T('16-mentions-polish'), s, 200)
  await items(page).filter({ hasText: 'Aldric Voss' }).click()
  await page.waitForTimeout(900)

  // --- link one in one click ---
  const before = await mentionCards(page).count()
  await mentionCards(page).first().getByRole('button', { name: 'Link', exact: true }).click()
  await page.waitForTimeout(900)
  check((await mentionCards(page).count()) === before - 1, 'link one: card leaves the Mentions list')
  let f = await files(page)
  check(codexLinks(f).length === 1, `link one: one codex link stored in the scene (${codexLinks(f).length})`)
  await tabBtn(page, 'Links').click()
  await page.waitForTimeout(300)
  check((await page.locator('ul[aria-label="Appears in"] > li').count()) === 1, 'link one: "Appears in" lists the passage')
  await shot(T('17-appears-in'), s, 200)
  await goWrite(page)
  await body(page).waitFor()
  await page.waitForTimeout(500)
  check((await markerKinds(page)).join() === 'codex', `link one: plum codex marker in the editor (${await markerKinds(page)})`)
  check((await markers(page).first().getAttribute('aria-label')) === 'Linked to 1 codex entry', 'link one: marker aria-label says codex entry')
  await shot(T('18-plum-marker'), s, 200)

  // --- "Not this one" persists ---
  await openEntryTab('Aldric Voss', 'Mentions')
  const left = await mentionCards(page).count()
  await mentionCards(page).first().getByRole('button', { name: 'Not this one' }).click()
  await page.waitForTimeout(900)
  check((await mentionCards(page).count()) === left - 1, 'not this one: card hidden')
  f = await files(page)
  const ig = ignoredFile(f)
  check(!!ig && /mention:/.test(ig[1]), 'not this one: id stored in the ignored-findings file')
  await reopen(page)
  await openEntryTab('Aldric Voss', 'Mentions')
  check((await mentionCards(page).count()) === left - 1, `not this one: still hidden after reopen (${await mentionCards(page).count()})`)

  // --- link all ---
  await shot(T('19-mentions-link-all'), s, 100)
  await page.getByRole('button', { name: /^Link all/ }).click()
  await page.waitForTimeout(1000)
  check((await mentionCards(page).count()) === 0, 'link all: list empties')
  check((await toast(page).getByText(/Linked 2 passages/).count()) >= 1, 'link all: toast "Linked 2 passages."')
  f = await files(page)
  check(codexLinks(f).length === 3, `link all: 3 codex links in total (${codexLinks(f).length})`)

  // --- picker: keyboard path, tab remembered, search by alias ---
  await goWrite(page)
  await row(page, 'Setting out').first().click()
  await body(page).waitFor()
  await page.waitForTimeout(500)
  await clickPara(page, 'Żmija czekała')
  await page.keyboard.press('Control+Shift+K')
  await picker(page).waitFor()
  check((await page.locator('#node-picker-tab-events').getAttribute('aria-selected')) === 'true', 'picker: opens on the Events tab the first time')
  await page.keyboard.press('Shift+Tab')
  check(await page.evaluate(() => document.activeElement?.id === 'node-picker-tab-events'), 'picker keyboard: Shift+Tab reaches the active tab')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  check((await page.locator('#node-picker-tab-codex').getAttribute('aria-selected')) === 'true', 'picker keyboard: ArrowRight switches to Codex')
  await shot(T('20-picker-codex-tab'), s, 200)
  await page.keyboard.press('Tab')
  await page.keyboard.type('witch')
  await page.waitForTimeout(200)
  const rowsTxt = await picker(page).getByRole('option').allTextContents()
  check(rowsTxt.length === 1 && /Mara of the Reeds/.test(rowsTxt[0]), `picker: alias search "witch" finds Mara (${rowsTxt.join('|')})`)
  await shot(T('21-picker-alias-search'), s, 200)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  f = await files(page)
  check(codexLinks(f).length === 4, `picker: codex link added (${codexLinks(f).length} codex links)`)
  check((await markerKinds(page)).filter((k) => k === 'codex').length === 3, `picker: 3 plum markers in the scene (${await markerKinds(page)})`)
  // second open remembers the tab
  await clickPara(page, 'crowned at dawn')
  await page.keyboard.press('Control+Shift+K')
  await picker(page).waitFor()
  check((await page.locator('#node-picker-tab-codex').getAttribute('aria-selected')) === 'true', 'picker: remembers the Codex tab on reopen')
  await page.locator('#node-picker-tab-events').click()
  await picker(page).getByRole('combobox').fill('Coron')
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  check((await markerKinds(page)).filter((k) => k === 'event').length === 1, 'M4: event link via the Events tab gives an orange diamond marker')
  await page.keyboard.press('Control+Shift+K')
  await picker(page).waitFor()
  check((await page.locator('#node-picker-tab-events').getAttribute('aria-selected')) === 'true', 'picker: remembers the Events tab on reopen')
  await page.locator('#node-picker-tab-codex').click()
  await picker(page).getByRole('combobox').fill('Aldric')
  await page.waitForTimeout(150)
  await page.getByRole('option', { name: /Aldric Voss/ }).click()
  await page.waitForTimeout(600)
  check((await markerKinds(page)).includes('mixed'), `mixed: block with event + codex link has the mixed marker (${await markerKinds(page)})`)
  const mixedM = page.locator('[data-marker-kind="mixed"]')
  check((await mixedM.locator('svg.shape').count()) === 2 && (await mixedM.locator('svg.shape.codex').count()) === 1, 'mixed: diamond and circle both drawn')
  check((await mixedM.getAttribute('aria-label')) === 'Linked to events (1) and codex entries (1)', `mixed: aria-label (${await mixedM.getAttribute('aria-label')})`)
  await clickPara(page, 'crowned at dawn')
  const pp = section(page, 'This paragraph')
  check((await pp.getByText('Coronation').count()) === 1 && (await pp.getByText('Aldric Voss').count()) === 1, '"This paragraph" lists the event and the entry')
  await shot(T('22-paragraph-panel-mixed'), s, 200)

  // --- popover: Open / Unlink ---
  await mixedM.click()
  await popover(page).waitFor()
  check((await popover(page).locator('li').count()) === 2, 'popover: two rows (event + entry)')
  check((await popover(page).locator('li[data-link-kind="entry"]').getByRole('button', { name: 'Open' }).count()) === 1, 'popover: entry row has Open')
  check((await popover(page).locator('li:not([data-link-kind="entry"])').getByRole('button', { name: 'Jump' }).count()) === 1, 'popover: event row keeps Jump (M4)')
  await shot(T('23-popover-mixed'), s, 200)
  await popover(page).locator('li[data-link-kind="entry"]').getByRole('button', { name: 'Open' }).click()
  await page.waitForTimeout(700)
  check(page.url().includes('codex') && (await nameField(page).inputValue()) === 'Aldric Voss', 'popover Open: Codex page with the entry selected')
  await goWrite(page)
  await body(page).waitFor()
  await page.waitForTimeout(600)
  const maraM = page.locator('[data-marker-block]').nth(1)
  await maraM.click()
  await popover(page).waitFor()
  await popover(page).getByRole('button', { name: 'Unlink' }).click()
  await page.waitForTimeout(600)
  check((await markerKinds(page)).filter((k) => k === 'codex').length === 2, `popover Unlink: plum marker removed (${await markerKinds(page)})`)
  await clickPara(page, 'Żmija czekała')
  await aside(page).getByRole('button', { name: 'Link to…' }).click()
  await pickEntryInPicker(page, 'Reed')
  await page.waitForTimeout(100)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  check((await markerKinds(page)).filter((k) => k === 'codex').length === 3, 'relinked Mara from the panel button')

  // --- node inspector Codex, rules, POV, timeline filter (before the delete) ---
  await goTimelines(page)
  await page.getByRole('button', { name: 'Fit to view' }).click()
  await page.waitForTimeout(400)
  await page.locator('[data-graph-node][aria-label^="Coronation."]').click()
  await page.waitForTimeout(400)
  const codexRow = page.locator('.rule-chip.codex-chip')
  check((await page.getByText('No entries linked.').count()) === 1, 'node codex: empty text')
  await page.getByRole('button', { name: 'Add entry', exact: true }).click()
  const epd = page.getByRole('dialog', { name: 'Add entry' })
  await epd.waitFor()
  await shot(T('24-node-entry-picker'), s, 200)
  await epd.getByRole('combobox').fill('aldr')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check((await codexRow.count()) === 1 && /Aldric Voss/.test(await codexRow.textContent()), 'node codex: entry added as a chip')
  await page.getByRole('button', { name: 'Add entry', exact: true }).click()
  await epd.waitFor()
  check((await epd.getByRole('option', { name: /Aldric Voss/ }).count()) === 0, 'node codex: linked entry not offered again')
  await epd.getByRole('combobox').fill('mara')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check((await codexRow.count()) === 2, 'node codex: second chip')
  await codexRow.nth(1).getByRole('button', { name: /^Remove entry: Mara/ }).click()
  await page.waitForTimeout(400)
  check((await codexRow.count()) === 1, 'node codex: Remove drops the chip')
  await shot(T('25-node-codex-chip'), s, 200)
  check((await section(page, 'Linked').getByText('Aldric Voss').count()) === 1, '"Linked" panel lists the entry on the selected event')
  await section(page, 'Linked').scrollIntoViewIfNeeded()
  await shot(T('26-linked-panel'), s, 200)
  // timeline filter
  await page.locator('[data-graph-node]').first().waitFor()
  await addEvent(page, 'Treaty signed', '20 June 1400')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Fit to view' }).click()
  await page.waitForTimeout(400)
  check((await page.locator('[data-graph-node]').count()) === 2, 'filter setup: 2 events')
  await page.getByLabel('Linked codex entry', { exact: true }).selectOption({ label: 'Aldric Voss' })
  await page.waitForTimeout(500)
  const opac = async (t) => page.locator(`[data-graph-node][aria-label^="${t}."]`).evaluate((e) => getComputedStyle(e).opacity)
  check((await opac('Coronation')) === '1' && Number(await opac('Treaty signed')) < 0.5, `timeline filter by entry: Coronation kept, Treaty dimmed (${await opac('Coronation')}/${await opac('Treaty signed')})`)
  await shot(T('27-timeline-filter-entry'), s, 200)
  await page.getByRole('button', { name: 'Clear filter' }).click()
  await page.waitForTimeout(400)
  check((await page.locator('[data-graph-node]').count()) === 2, 'timeline filter: cleared')

  // --- rule used by entries ---
  await navTo(page, 'Rules')
  await page.getByRole('button', { name: 'New rule' }).click()
  await page.waitForTimeout(300)
  await setField(page, 'Title', 'Oaths bind')
  await navTo(page, 'Codex')
  await items(page).filter({ hasText: 'Aldric Voss' }).click()
  await page.waitForTimeout(300)
  await tabBtn(page, 'Links').click()
  await page.getByLabel('Add a rule', { exact: true }).click()
  await page.waitForTimeout(300)
  await page.locator('.q-menu [role=option]').filter({ hasText: 'Oaths bind' }).click()
  await page.waitForTimeout(400)
  await page.waitForTimeout(300)
  check((await section(page, 'Links').getByText('Coronation').count()) >= 1 && (await section(page, 'Links').getByText('Oaths bind').count()) >= 1, '"Links" panel (Codex): event and rule of the entry')
  await shot(T('28-entry-links-tab-panel'), s, 200)
  await navTo(page, 'Rules')
  await page.waitForTimeout(300)
  const used = page.getByRole('heading', { name: 'Used by entries' })
  check((await used.count()) === 1, 'rules: "Used by entries" heading')
  check((await page.getByRole('button', { name: 'Open entry: Aldric Voss' }).count()) === 1, 'rules: lists Aldric Voss')
  await used.scrollIntoViewIfNeeded()
  await shot(T('29-rule-used-by-entries'), s, 200)
  await page.getByRole('button', { name: 'Open entry: Aldric Voss' }).click()
  await page.waitForTimeout(600)
  check((await nameField(page).inputValue()) === 'Aldric Voss', 'rules: Open entry goes to the Codex entry')

  // --- POV ---
  await goWrite(page)
  await row(page, 'Setting out').first().click()
  await body(page).waitFor()
  await page.waitForTimeout(500)
  const pov = page.getByRole('combobox', { name: 'Point of view' })
  await pov.click()
  await pov.fill('mar')
  await page.waitForTimeout(250)
  await page.getByRole('option', { name: /Mara of the Reeds/ }).click()
  await page.waitForTimeout(600)
  f = await files(page)
  check(sceneFiles(f).some((x) => x.povId), 'POV: povId saved in the scene file')
  check((await section(page, 'In this scene').getByText('Point of view').count()) >= 1, '"In this scene" marks the POV entry')
  await shot(T('30-pov-set'), s, 200)
  // clear via the select clear icon
  const clearIcon = propsPanel(page).locator('.q-field__append .q-icon[role=button], .q-field__append button, .q-field__append .q-field__focusable-action').first()
  if (await clearIcon.count()) await clearIcon.click()
  await page.waitForTimeout(500)
  f = await files(page)
  check(!sceneFiles(f).some((x) => x.povId), 'POV: cleared (povId removed)')
  // set again for the missing check
  await pov.click()
  await pov.fill('mar')
  await page.waitForTimeout(250)
  await page.getByRole('option', { name: /Mara of the Reeds/ }).click()
  await page.waitForTimeout(500)

  // --- delete entries -> broken everywhere -> restore ---
  const delEntry = async (name) => {
    await navTo(page, 'Codex')
    await items(page).filter({ hasText: name }).click()
    await page.waitForTimeout(300)
    await tabBtn(page, 'Details').click()
    await page.getByRole('button', { name: 'Delete entry' }).click()
    const ed = page.getByRole('alertdialog', { name: 'Delete entry' })
    await ed.waitFor()
    return ed
  }
  let ed = await delEntry('Aldric Voss')
  console.log('  delete confirm:', (await ed.innerText()).replace(/\s+/g, ' ').slice(0, 220))
  check((await ed.getByText('4 linked passages will show as broken until restored.').count()) === 1, 'delete confirm: "4 linked passages will show as broken until restored."')
  await shot(T('31-entry-delete-confirm'), s, 200)
  await ed.getByRole('button', { name: 'Delete entry' }).click()
  await page.waitForTimeout(600)
  ed = await delEntry('Mara of the Reeds')
  await ed.getByRole('button', { name: 'Delete entry' }).click()
  await page.waitForTimeout(600)
  await goWrite(page)
  await row(page, 'Setting out').first().click()
  await body(page).waitFor()
  await page.waitForTimeout(700)
  const kinds = await markerKinds(page)
  check(kinds.length === 4 && kinds.every((k) => k === 'broken'), `deleted entry: all 4 markers turn into broken triangles (${kinds})`)
  await clickPara(page, 'Aldric rode through')
  check((await section(page, 'Problems').getByText('Missing entry').count()) === 4, '"Problems" panel lists the 4 broken links as "Missing entry"')
  check((await section(page, 'This paragraph').getByText('Missing entry').count()) === 1, '"This paragraph" card says "Missing entry"')
  await shot(T('32-broken-entry-panels'), s, 200)
  await markers(page).first().click()
  await popover(page).waitFor()
  check((await popover(page).getByText('Missing entry').count()) === 1, 'popover: "Missing entry"')
  check((await popover(page).getByRole('button', { name: 'Relink' }).count()) === 1 && (await popover(page).getByRole('button', { name: 'Remove' }).count()) === 1, 'popover: Relink and Remove offered')
  await shot(T('33-broken-entry-popover'), s, 200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  // POV missing
  check((await propsPanel(page).getByText('Missing entry').count()) === 1, 'POV: "Missing entry" chip when the entry is deleted')
  await shot(T('34-pov-missing'), s, 200)
  // node chip missing
  await goTimelines(page)
  await page.getByRole('button', { name: 'Fit to view' }).click()
  await page.waitForTimeout(300)
  await page.locator('[data-graph-node][aria-label^="Coronation."]').click()
  await page.waitForTimeout(400)
  check((await codexRow.count()) === 1 && /Missing entry/.test(await codexRow.textContent()), 'node codex: deleted entry shows a "Missing entry" chip')
  await shot(T('35-node-codex-missing'), s, 200)
  // restore Aldric, then check POV still broken until Mara returns
  await page.getByRole('button', { name: 'Trash' }).click()
  const trash = page.getByRole('dialog', { name: 'Trash' })
  await trash.waitFor()
  await trash.getByRole('button', { name: /Restore.*Aldric Voss/ }).click()
  await page.waitForTimeout(700)
  await trash.getByRole('button', { name: /Restore.*Mara of the Reeds/ }).click()
  await page.waitForTimeout(700)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(400)
  check(/Aldric Voss/.test(await codexRow.textContent()), 'restore: node chip repaired')
  await goWrite(page)
  await row(page, 'Setting out').first().click()
  await body(page).waitFor()
  await page.waitForTimeout(700)
  const k2 = await markerKinds(page)
  check(k2.length === 4 && !k2.includes('broken'), `restore: markers repaired (${k2})`)
  check((await propsPanel(page).getByText('Missing entry').count()) === 0 && (await section(page, 'In this scene').getByText('Mara of the Reeds').count()) >= 1, 'restore: POV repaired')
  await shot(T('36-restored'), s, 200)
  // POV: delete then Clear
  ed = await delEntry('Mara of the Reeds')
  await ed.getByRole('button', { name: 'Delete entry' }).click()
  await page.waitForTimeout(600)
  await goWrite(page)
  await row(page, 'Setting out').first().click()
  await body(page).waitFor()
  await page.waitForTimeout(600)
  await propsPanel(page).getByRole('button', { name: 'Clear' }).click()
  await page.waitForTimeout(500)
  f = await files(page)
  check(!sceneFiles(f).some((x) => x.povId) && (await propsPanel(page).getByText('Missing entry').count()) === 0, 'POV: Clear on the missing chip removes povId')
  await page.getByRole('button', { name: 'Trash' }).click()
  await trash.waitFor()
  await trash.getByRole('button', { name: /Restore.*Mara of the Reeds/ }).click()
  await page.waitForTimeout(600)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)

  // --- M4: event link behaviour unchanged ---
  await clickPara(page, 'crowned at dawn')
  await page.locator('[data-marker-kind="mixed"]').click()
  await popover(page).waitFor()
  await popover(page).locator('li:not([data-link-kind="entry"])').getByRole('button', { name: 'Jump' }).click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(800)
  check((await page.getByLabel('Title', { exact: true }).inputValue()) === 'Coronation', 'M4: popover Jump selects the event in Timelines')
  check((await section(page, 'Written in').getByText('crowned at dawn').count()) > 0, 'M4: "Written in" shows the passage')
  await page.getByRole('button', { name: 'Delete event', exact: true }).first().click()
  const nconfirm = page.locator('.q-card.dialog', { hasText: /linked passage/ })
  await nconfirm.waitFor()
  await nconfirm.getByRole('button', { name: 'Delete event' }).click()
  await page.waitForTimeout(600)
  await goWrite(page)
  await body(page).waitFor()
  await page.waitForTimeout(700)
  const k3 = await markerKinds(page)
  check(k3.filter((k) => k === 'broken').length === 1, `M4: deleted event breaks only its marker (${k3})`)
  await page.getByRole('button', { name: 'Trash' }).click()
  await trash.waitFor()
  await trash.getByRole('button', { name: /Restore.*Coronation/ }).click()
  await page.waitForTimeout(700)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(500)
  check(!(await markerKinds(page)).includes('broken'), 'M4: restoring the event repairs the marker')

  await s.ctx.close()
}

await flow('light')
if (!process.env.LIGHT_ONLY) await flow('dark')
tag = 'end'
console.log(failures ? `${failures} CHECK(S) FAILED` : 'all checks passed')
console.log(allErrors.length ? `CONSOLE ERRORS: ${[...new Set(allErrors)].join(' | ')}` : 'no console errors')
await browser.close()
if (failures || allErrors.length) process.exit(1)
