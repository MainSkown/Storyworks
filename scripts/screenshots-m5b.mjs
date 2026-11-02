// Usage: node scripts/screenshots-m5b.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Drives the M5b codex flow in the browser build (not the Tauri window): types, entries, search, filters,
// rules on entries, node links, trash; checks the acceptance items and captures the screens in Light and Dark.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m5b.mjs <outDir>')
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

// ---------- the flow ----------
const navTo = async (page, name) => {
  await page.getByRole('link', { name: new RegExp(`^\\s*${name}`) }).first().click()
  await page.waitForTimeout(500)
}
const items = (page) => page.locator('aside[aria-label="Codex entries"] button.item')
const itemTitles = async (page) => (await items(page).locator('.item-title').allTextContents()).map((s) => s.trim())
const groupTitles = async (page) =>
  page.locator('aside[aria-label="Codex entries"] h2.group-title').evaluateAll((els) =>
    els.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()))
const search = (page) => page.getByPlaceholder('Search names, aliases and tags')
const chipGroup = (page, label) => page.getByRole('group', { name: label })
const typesDlg = (page) => page.getByRole('dialog', { name: 'Entry types' })
const nameField = (page) => page.getByLabel('Name', { exact: true })
const manifestJson = async (page) => JSON.parse((await files(page))[`${P}project.json`])
const tabTo = async (page, name) => {
  await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click()
  await page.waitForTimeout(250)
}
const toast = (page) => page.locator('.q-notification')
async function chipAdd(page, label, value) {
  const f = page.getByLabel(label, { exact: true })
  await f.click()
  await f.fill(value)
  await f.press('Enter')
  await page.waitForTimeout(250)
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
const entryFiles = (f) => Object.entries(f).filter(([k]) => k.startsWith(`${P}codex/`) && !k.includes('/types/'))
const typeFiles = (f) => Object.entries(f).filter(([k]) => k.startsWith(`${P}codex/types/`))

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

  // --- empty Codex, starter types ---
  await navTo(page, 'Codex')
  console.log('  url:', page.url(), JSON.stringify((await page.locator('body').innerText()).slice(0, 200)))
  const types = (await chipGroup(page, 'Filter by type').locator('button.chip').allTextContents()).map((x) => x.trim())
  console.log('  types:', types.join(', '))
  check(types.length === 6, `starter types: 6 listed (${types.length})`)
  check(types[0] === 'Character', 'starter types: Character first')
  console.log('  groups:', (await groupTitles(page)).join(', '))
  check((await groupTitles(page)).length === 0, 'empty groups are hidden')
  check((await page.getByText(/No entries yet/).count()) > 0, 'empty state: "No entries yet" shown')
  let f = await files(page)
  check(typeFiles(f).length === 6, 'files: 6 type files stored')
  await shot(T('01-codex-empty'), s)
  const [tChar, tSecond, tThird] = types

  // --- create entry, name, type change ---
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.waitForTimeout(300)
  check((await itemTitles(page)).includes('Untitled entry'), 'create: listed as "Untitled entry"')
  const n = nameField(page)
  await n.fill('Aldric Voss')
  await n.press('Enter')
  await page.waitForTimeout(250)
  check((await itemTitles(page)).includes('Aldric Voss'), 'rename: list updates')
  const groupOf = async (title) =>
    page.evaluate((t) => {
      for (const g of document.querySelectorAll('aside[aria-label="Codex entries"] .group')) {
        if ([...g.querySelectorAll('.item-title')].some((x) => x.textContent.trim() === t))
          return [...g.querySelector('h2').childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
      }
      return null
    }, title)
  check((await groupOf('Aldric Voss')) === tChar, `entry starts in "${tChar}" group (${await groupOf('Aldric Voss')})`)
  await page.getByLabel('Type', { exact: true }).click()
  await page.getByRole('option', { name: tSecond, exact: true }).click()
  await page.waitForTimeout(300)
  check((await groupOf('Aldric Voss')) === tSecond, `type change: moves to "${tSecond}" group`)
  await page.getByLabel('Type', { exact: true }).click()
  await page.getByRole('option', { name: tChar, exact: true }).click()
  await page.waitForTimeout(300)
  check((await groupOf('Aldric Voss')) === tChar, 'type change back')

  // --- aliases + duplicate toast ---
  await chipAdd(page, 'Aliases', 'The Wolf')
  await chipAdd(page, 'Aliases', 'the wolf')
  check((await toast(page).getByText('That alias is already on the list.').count()) >= 1, 'aliases: duplicate (case-insensitive) shows a toast')
  await chipAdd(page, 'Aliases', 'Old Al')
  const aliasChips = (await page.locator('.edit .q-chip').evaluateAll((els) => els.map((e) => e.querySelector('.q-chip__content')?.textContent.trim())))
  check(aliasChips.filter((x) => /wolf/i.test(x)).length === 1 && aliasChips.some((x) => x === 'Old Al'), `aliases: no duplicate chip (${aliasChips.join('|')})`)
  // --- tags ---
  await chipAdd(page, 'Tags', 'hero')
  await chipAdd(page, 'Tags', 'north')
  check((await page.locator('aside[aria-label="Codex entries"] .item-tags').allTextContents()).join(' ').includes('#hero #north'), 'tags: shown on the list row')
  // --- notes ---
  await page.getByRole('textbox', { name: 'Notes' }).click()
  await page.keyboard.type('Scarred ranger from the northern march.')
  await page.waitForTimeout(500)
  // --- appendix ---
  await page.getByLabel('Appendix text', { exact: true }).fill('Aldric Voss, ranger of the north.')
  await page.getByRole('checkbox', { name: 'Include in appendices' }).click()
  await page.waitForTimeout(300)
  f = await files(page)
  const aEntry = entryFiles(f).map(([, v]) => JSON.parse(v)).find((e) => e.name === 'Aldric Voss')
  check(!!aEntry && aEntry.aliases.length === 2 && aEntry.tags.join() === 'hero,north', 'files: aliases and tags saved')
  check(/northern march/.test(JSON.stringify(aEntry?.notes)), 'files: notes saved')
  check(aEntry?.appendixText === 'Aldric Voss, ranger of the north.', 'files: appendix text saved')
  check(typeof aEntry?.includeInAppendices === 'boolean', `files: includeInAppendices saved (${aEntry?.includeInAppendices})`)
  const incl = await page.getByRole('checkbox', { name: 'Include in appendices' }).getAttribute('aria-checked')
  check(String(aEntry?.includeInAppendices) === String(incl === 'true'), 'appendix checkbox matches file')
  const m0 = await manifestJson(page)
  check(m0.codexEntries?.length === 1 && m0.codexTypes?.length === 6, `manifest: 1 entry and 6 types (${m0.codexEntries?.length}/${m0.codexTypes?.length}, v${m0.version})`)
  await shot(T('02-codex-entry'), s)

  // more entries
  await newEntry(page, 'Stonehaven', tSecond)
  await chipAdd(page, 'Tags', 'north')
  await chipAdd(page, 'Tags', 'city')
  await newEntry(page, 'Mara of the Reeds', tChar)
  await chipAdd(page, 'Tags', 'south')
  await chipAdd(page, 'Aliases', 'Reed Witch')
  check((await itemTitles(page)).length === 3, 'three entries listed')

  // --- search by alias, filters ---
  await search(page).fill('wolf')
  await page.waitForTimeout(250)
  check((await itemTitles(page)).join() === 'Aldric Voss', 'search by alias finds the entry')
  await search(page).fill('REED')
  await page.waitForTimeout(250)
  check((await itemTitles(page)).join() === 'Mara of the Reeds', 'search: case-insensitive')
  await search(page).fill('zzzz')
  await page.waitForTimeout(250)
  check((await page.getByText('No entries match the search or filters.').count()) === 1, 'search: no-match message')
  await shot(T('03-codex-no-match'), s, 200)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.waitForTimeout(250)
  check((await itemTitles(page)).length === 3 && (await search(page).inputValue()) === '', 'clear filters: all back')
  await chipGroup(page, 'Filter by tag').getByRole('button', { name: '#north' }).click()
  await page.waitForTimeout(250)
  check((await itemTitles(page)).sort().join() === 'Aldric Voss,Stonehaven', 'tag filter #north: 2 entries')
  await chipGroup(page, 'Filter by type').getByRole('button', { name: tChar, exact: true }).click()
  await page.waitForTimeout(250)
  check((await itemTitles(page)).join() === 'Aldric Voss', 'type + tag filter combined')
  check((await chipGroup(page, 'Filter by tag').getByRole('button', { name: '#north' }).getAttribute('aria-pressed')) === 'true', 'filter chip exposes aria-pressed')
  await shot(T('04-codex-filtered'), s, 200)
  await chipGroup(page, 'Filter by type').getByRole('button', { name: tThird, exact: true }).click()
  await page.waitForTimeout(250)
  check((await page.getByText('No entries match the search or filters.').count()) === 1, 'type + tag with no result: no-match message')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.waitForTimeout(250)

  // --- rules on an entry ---
  await navTo(page, 'Rules')
  for (const title of ['Oaths bind', 'Wolves obey kin']) {
    await page.getByRole('button', { name: 'New rule' }).click()
    await page.waitForTimeout(300)
    const t = page.getByLabel('Title', { exact: true })
    await t.fill(title)
    await t.press('Enter')
    await page.waitForTimeout(250)
  }
  await navTo(page, 'Codex')
  await items(page).filter({ hasText: 'Aldric Voss' }).click()
  await page.waitForTimeout(300)
  await tabTo(page, 'Links')
  check((await page.getByText('No rules are attached to this entry.').count()) === 1, 'entry rules: empty text')
  const addRule = page.getByLabel('Add a rule', { exact: true })
  const menuOpts = () => page.locator('.q-menu [role=option]')
  await addRule.click()
  await page.waitForTimeout(300)
  check((await menuOpts().count()) === 2, `entry rules: both rules offered (${await menuOpts().allTextContents()})`)
  await menuOpts().filter({ hasText: 'Oaths bind' }).click()
  await page.waitForTimeout(400)
  await addRule.click()
  await page.waitForTimeout(300)
  check((await menuOpts().filter({ hasText: 'Oaths bind' }).count()) === 0, 'entry rules: attached rule not offered again')
  await menuOpts().filter({ hasText: 'Wolves obey kin' }).click()
  await page.waitForTimeout(300)
  const ruleChips = page.locator('.rule-chips li')
  check((await ruleChips.count()) === 2, 'entry rules: 2 chips')
  await page.locator('.edit h2', { hasText: 'Used in' }).scrollIntoViewIfNeeded()
  await shot(T('05-entry-rules'), s, 200)
  f = await files(page)
  check(entryFiles(f).some(([, v]) => JSON.parse(v).ruleIds.length === 2), 'files: ruleIds saved')
  // open rule -> Rules page, back
  await page.getByRole('button', { name: 'Open rule Oaths bind' }).click()
  await page.waitForTimeout(500)
  check((await page.getByLabel('Title', { exact: true }).inputValue()) === 'Oaths bind', 'rule chip: opens the rule on the Rules page')
  // Rule page "Used by entries" is a later M5b step; not checked here.
  await shot(T('06-rule-used-by-entry'), s, 200)
  // delete rule
  await page.getByRole('button', { name: 'Delete rule' }).click()
  const rd = page.getByRole('alertdialog', { name: 'Delete rule' })
  await rd.waitFor()
  await rd.getByRole('button', { name: 'Delete rule' }).click()
  await page.waitForTimeout(600)
  await navTo(page, 'Codex')
  await items(page).filter({ hasText: 'Aldric Voss' }).click()
  await page.waitForTimeout(300)
  await tabTo(page, 'Links')
  const missing = page.locator('.rule-chip.gone')
  check((await missing.count()) === 1 && (await missing.textContent()).includes('Missing rule'), 'deleted rule: entry shows "Missing rule" chip')
  const goneColor = await missing.evaluate((e) => getComputedStyle(e.querySelector('.gone-text')).color)
  console.log('  missing chip colour:', goneColor)
  await page.locator('.edit h2', { hasText: 'Used in' }).scrollIntoViewIfNeeded()
  await shot(T('07-entry-missing-rule'), s, 200)
  await missing.getByRole('button', { name: /^Remove rule Missing rule/ }).click()
  await page.waitForTimeout(300)
  check((await page.locator('.rule-chip.gone').count()) === 0, 'missing chip: Remove clears it')

  // --- node uses entry (setup: codexIds written into the timeline file, then reopen) ---
  await goTimelines(page)
  await addEvent(page, 'Coronation', '3 May 1400')
  await page.waitForTimeout(300)
  f = await files(page)
  const tlKey = Object.keys(f).find((k) => k.startsWith(`${P}timelines/`) && /Coronation/.test(f[k]))
  check(!!tlKey, 'setup: timeline file with the event found')
  const entryId = aEntry.id
  const tl = JSON.parse(f[tlKey])
  tl.nodes.find((x) => x.title === 'Coronation').codexIds = [entryId]
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [tlKey, JSON.stringify(tl, null, 2)])
  await page.reload()
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: 'Open project' }).click()
  await page.getByRole('button', { name: 'demo', exact: true }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await navTo(page, 'Codex')
  await items(page).filter({ hasText: 'Aldric Voss' }).click()
  await page.waitForTimeout(500)
  await tabTo(page, 'Links')
  const used = page.locator('ul.used')
  check((await used.getByText('Coronation').count()) === 1, 'Used in: lists the event with its timeline')
  await page.locator('.edit h2', { hasText: 'Used in' }).scrollIntoViewIfNeeded()
  await shot(T('08-entry-used-in'), s, 200)
  await used.getByRole('button', { name: /Coronation/ }).click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(800)
  check((await page.getByLabel('Title', { exact: true }).inputValue()) === 'Coronation', 'Used in: jump selects the node in Timelines')
  await navTo(page, 'Codex')
  await items(page).filter({ hasText: 'Aldric Voss' }).click()
  await page.waitForTimeout(300)
  await tabTo(page, 'Details')

  // --- delete entry -> trash -> restore ---
  await page.getByRole('button', { name: 'Delete entry' }).click()
  const ed = page.getByRole('alertdialog', { name: 'Delete entry' })
  await ed.waitFor()
  check((await ed.getByText(/1 event uses it/).count()) === 1, 'delete confirm: "1 event uses it ..."')
  await shot(T('09-entry-delete-confirm'), s, 300)
  await ed.getByRole('button', { name: 'Delete entry' }).click()
  await page.waitForTimeout(600)
  check(!(await itemTitles(page)).includes('Aldric Voss'), 'delete: entry gone from the list')
  const mD = await manifestJson(page)
  check(mD.codexEntries.length === 2 && mD.trash?.some((x) => x.type === 'entry'), 'delete: manifest has 2 entries and a trash entry of type entry')
  await page.getByRole('button', { name: 'Trash' }).click()
  const trash = page.getByRole('dialog', { name: 'Trash' })
  await trash.waitFor()
  check((await trash.getByText('Entry · Aldric Voss').count()) === 1, 'trash: row "Entry · Aldric Voss"')
  await shot(T('10-trash-entry'), s, 300)
  await trash.getByRole('button', { name: /Restore.*Aldric Voss/ }).click()
  await page.waitForTimeout(700)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(400)
  check((await itemTitles(page)).includes('Aldric Voss'), 'restore: entry back in the list')
  const mR = await manifestJson(page)
  check(mR.codexEntries.length === 3 && !mR.trash?.some((x) => x.type === 'entry'), 'restore: manifest has 3 entries, trash entry gone')
  await items(page).filter({ hasText: 'Aldric Voss' }).click()
  await page.waitForTimeout(300)
  check((await page.locator('.edit .q-chip').allTextContents()).join(' ').includes('Old Al') && /northern march/.test(await page.getByRole('textbox', { name: 'Notes' }).textContent()), 'restore: content intact')
  await tabTo(page, 'Links')
  check((await page.locator('ul.used').getByText('Coronation').count()) === 1, 'restore: node link works again')
  await tabTo(page, 'Details')

  // --- types dialog ---
  await page.getByRole('button', { name: 'Types', exact: true }).click()
  const td = typesDlg(page)
  await td.waitFor()
  await shot(T('11-types-dialog'), s, 300)
  const colorIn = td.getByLabel(`Colour of ${tChar}`)
  await colorIn.evaluate((e) => {
    e.value = '#aa3366'
    e.dispatchEvent(new Event('input', { bubbles: true }))
    e.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForTimeout(300)
  f = await files(page)
  check(typeFiles(f).some(([, v]) => /#aa3366/i.test(v)), 'types: recolour saved')
  const nameIn = td.getByLabel(`Name of type ${tThird}`)
  await nameIn.fill('Faction')
  await nameIn.press('Enter')
  await page.waitForTimeout(300)
  f = await files(page)
  check(typeFiles(f).some(([, v]) => /"Faction"/.test(v)), 'types: rename saved')
  await td.getByLabel(`Icon of ${tSecond}`).click()
  const opts = page.locator('.q-menu [role=option]')
  const iconCount = await opts.count()
  const pick = opts.nth(iconCount > 3 ? 3 : 1)
  const iconName = (await pick.locator('.q-icon').first().textContent())?.trim()
  await pick.click()
  await page.waitForTimeout(300)
  f = await files(page)
  check(typeFiles(f).some(([, v]) => v.includes(`"${iconName}"`) && v.includes(tSecond)), `types: icon change saved (${iconName})`)
  await td.getByLabel('New type name').fill('Event')
  await td.getByRole('button', { name: 'Add' }).click()
  await page.waitForTimeout(300)
  check((await td.getByLabel('Name of type Event').count()) === 1, 'types: new type added')
  // delete a type with entries -> reassign
  await td.getByRole('button', { name: `Delete type ${tChar}` }).click()
  const del = page.getByRole('alertdialog', { name: /Delete type/ })
  await del.waitFor()
  check((await del.getByText(/2 entries will move/).count()) === 1, 'type delete: confirm says 2 entries will move')
  await del.getByLabel('Move them to').click()
  await page.getByRole('option', { name: 'Event', exact: true }).click()
  await page.waitForTimeout(200)
  await shot(T('12-type-delete-reassign'), s, 300)
  await del.getByRole('button', { name: 'Delete type' }).click()
  await page.waitForTimeout(600)
  check((await td.getByLabel(`Name of type ${tChar}`).count()) === 0, 'type delete: type gone')
  await td.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  check((await groupOf('Aldric Voss')) === 'Event' && (await groupOf('Mara of the Reeds')) === 'Event', 'type delete: entries moved to Event')
  // last type blocked
  await page.getByRole('button', { name: 'Types', exact: true }).click()
  await td.waitFor()
  let guard = 0
  while (guard++ < 12) {
    const delBtns = td.getByRole('button', { name: /^Delete type / })
    if ((await delBtns.count()) <= 1) break
    await delBtns.first().click()
    const d2 = page.getByRole('alertdialog', { name: /Delete type/ })
    await d2.waitFor()
    if (await d2.getByLabel('Move them to').count()) {
      await d2.getByLabel('Move them to').click()
      await page.locator('.q-menu [role=option]').first().click()
      await page.waitForTimeout(150)
    }
    await d2.getByRole('button', { name: 'Delete type' }).click()
    await page.waitForTimeout(400)
  }
  const lastBtn = td.getByRole('button', { name: /^Delete type / })
  check((await lastBtn.count()) === 1 && (await lastBtn.isDisabled()), 'types: last type cannot be deleted (button disabled)')
  check((await td.getByText(/last type cannot be deleted/).count()) > 0, 'types: last-type message shown')
  await shot(T('13-types-last'), s, 300)
  await td.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  check((await itemTitles(page)).length === 3, 'types: all 3 entries still present')

  // --- keyboard path in list ---
  await search(page).focus()
  await page.keyboard.press('Tab')
  let tabs = 0
  while (tabs++ < 25 && !(await page.evaluate(() => document.activeElement?.classList.contains('item')))) await page.keyboard.press('Tab')
  check(await page.evaluate(() => document.activeElement?.classList.contains('item')), 'keyboard: Tab reaches an entry row')
  const focusedTitle = await page.evaluate(() => document.activeElement?.querySelector('.item-title')?.textContent?.trim())
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check((await nameField(page).inputValue()) === focusedTitle, `keyboard: Enter selects the focused row (${focusedTitle})`)
  await page.keyboard.press('Tab')
  const next = await page.evaluate(() => document.activeElement?.classList.contains('item'))
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  check(!next || (await nameField(page).inputValue()) !== focusedTitle, 'keyboard: Tab + Space selects the next row')
  await page.getByRole('button', { name: 'Types', exact: true }).focus()
  await page.keyboard.press('Enter')
  await typesDlg(page).waitFor()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check(!(await typesDlg(page).isVisible()), 'keyboard: Escape closes the types dialog')
  check(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Types'), 'keyboard: focus returns to Types button')
  await shot(T('14-codex-final'), s, 200)

  await s.ctx.close()
}

await flow('light')
if (!process.env.LIGHT_ONLY) await flow('dark')
tag = 'end'
console.log(failures ? `${failures} CHECK(S) FAILED` : 'all checks passed')
console.log(
  allErrors.length ? `CONSOLE ERRORS: ${[...new Set(allErrors)].join(' | ')}` : 'no console errors',
)
await browser.close()
if (failures || allErrors.length) process.exit(1)
