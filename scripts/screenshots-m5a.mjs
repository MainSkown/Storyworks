// Usage: node scripts/screenshots-m5a.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Drives the M5a rules flow in the browser build (not the Tauri window): link, follow, break,
// restore, relink, cut/paste; checks the acceptance items and captures the screens in Light and Dark.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m5a.mjs <outDir>')
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
const aside = (page) => page.locator('aside.context-panel')
const goTimelines = async (page) => {
  await page.getByRole('link', { name: /Timelines/ }).first().click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(400)
}
const nodeEl = (page, title) => page.locator(`[data-graph-node][aria-label^="${title}."]`)
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
const fit = async (page) => {
  await page.getByRole('button', { name: 'Fit to view' }).click()
  await page.waitForTimeout(500)
}
async function pickNode(page, title) {
  await fit(page)
  await nodeEl(page, title).click()
  await page.waitForTimeout(300)
}

// ---------- the flow ----------
const navTo = async (page, name) => {
  await page.getByRole('link', { name: new RegExp(`^\\s*${name}`) }).first().click()
  await page.waitForTimeout(500)
}
const ruleBtns = (page) => page.locator('aside[aria-label="Rules"] button.item')
const ruleTitles = async (page) => (await ruleBtns(page).locator('.item-title').allTextContents()).map((s) => s.trim())
const groupTitles = async (page) => (await page.locator('aside[aria-label="Rules"] h2.group-title').allTextContents()).map((s) => s.trim())
const search = (page) => page.getByLabel('Search rules', { exact: true })
const catDlg = (page) => page.getByRole('dialog', { name: 'Rule categories' })
const chipGroup = (page, label) => page.getByRole('group', { name: label })
const inspectorRules = (page) => page.locator('[data-testid="node-rule-chip"]')
async function addTag(page, tag) {
  const f = page.getByLabel('Tags', { exact: true })
  await f.click()
  await f.fill(tag)
  await f.press('Enter')
  await page.waitForTimeout(200)
}
async function newRule(page, title, tags = []) {
  await page.getByRole('button', { name: 'New rule' }).click()
  await page.waitForTimeout(300)
  const t = page.getByLabel('Title', { exact: true })
  await t.fill(title)
  await t.press('Enter')
  await page.waitForTimeout(200)
  for (const tag of tags) await addTag(page, tag)
}
const manifestJson = async (page) => JSON.parse((await files(page))[`${P}project.json`])

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

  // --- empty Rules page, default categories ---
  await navTo(page, 'Rules')
  const cats = await chipGroup(page, 'Filter by category').locator('button.chip').allTextContents()
  check(
    ['Magic', 'Physics', 'Society', 'Technology', 'Religion'].every((c) => cats.some((x) => x.trim() === c)) && cats.length === 5,
    `defaults: 5 categories (${cats.map((c) => c.trim()).join(', ')})`,
  )
  check((await page.getByText(/No rules yet/).count()) > 0, 'empty state: "No rules yet" shown')
  await shot(T('01-rules-empty'), s)

  // --- create, retitle, change category, tags ---
  await page.getByRole('button', { name: 'New rule' }).click()
  await page.waitForTimeout(300)
  check((await ruleTitles(page)).includes('Untitled rule'), 'create: new rule listed as "Untitled rule"')
  const titleIn = page.getByLabel('Title', { exact: true })
  await titleIn.fill('Mana costs blood')
  await titleIn.press('Enter')
  await page.waitForTimeout(200)
  check((await ruleTitles(page)).includes('Mana costs blood'), 'retitle: list updates')
  const cat = page.getByLabel('Category', { exact: true })
  await cat.click()
  await page.getByRole('option', { name: 'Society' }).click()
  await page.waitForTimeout(300)
  check((await groupTitles(page)).includes('Society'), 'category change: rule moves to the Society group')
  await addTag(page, 'blood')
  await addTag(page, 'cost')
  check((await page.locator('aside[aria-label="Rules"] .item-tags').allTextContents()).join(' ').includes('#blood #cost'), 'tags: listed on the rule row')
  // description
  await page.getByRole('textbox', { name: 'Description' }).click()
  await page.keyboard.type('Every spell takes a drop of the caster blood.')
  await page.getByRole('textbox', { name: 'Exceptions' }).click()
  await page.keyboard.type('Healers pay in sleep instead.')
  await page.waitForTimeout(400)
  await newRule(page, 'Gravity is weaker at sea', ['sea'])
  await newRule(page, 'Tithe to the temple', ['cost', 'church'])
  await page.waitForTimeout(300)
  let f = await files(page)
  const ruleKeys = Object.keys(f).filter((k) => k.startsWith(`${P}rules/`) && !k.includes('/categories/'))
  check(ruleKeys.length === 3, `files: 3 rule files stored (${ruleKeys.length})`)
  const m = await manifestJson(page)
  check(m.rules?.length === 3 && m.version === 5, `manifest: v5 with 3 rule refs (v${m.version}, ${m.rules?.length})`)
  const mana = JSON.parse(f[ruleKeys.find((k) => f[k].includes('Mana costs blood'))])
  check(mana.tags.join() === 'blood,cost' && /caster blood/.test(JSON.stringify(mana.description)) && /sleep/.test(JSON.stringify(mana.exceptions)), 'files: tags, description and exceptions saved')
  await ruleBtns(page).filter({ hasText: 'Mana costs blood' }).click()
  await page.waitForTimeout(300)
  await shot(T('02-rules-page'), s)

  // --- search + filters ---
  await search(page).fill('sleep')
  await page.waitForTimeout(250)
  check((await ruleTitles(page)).join() === 'Mana costs blood', 'search: matches text in exceptions')
  await search(page).fill('GRAVITY')
  await page.waitForTimeout(250)
  check((await ruleTitles(page)).join() === 'Gravity is weaker at sea', 'search: case-insensitive title match')
  await search(page).fill('zzzz')
  await page.waitForTimeout(250)
  check((await page.getByText('No rules match the search or filters.').count()) === 1, 'search: no-match message')
  await shot(T('03-rules-no-match'), s, 200)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.waitForTimeout(250)
  check((await ruleTitles(page)).length === 3 && (await search(page).inputValue()) === '', 'clear filters: all rules back')
  await chipGroup(page, 'Filter by tag').getByRole('button', { name: '#cost' }).click()
  await page.waitForTimeout(250)
  check((await ruleTitles(page)).sort().join() === 'Mana costs blood,Tithe to the temple', 'tag filter #cost: 2 rules')
  await chipGroup(page, 'Filter by category').getByRole('button', { name: 'Society' }).click()
  await page.waitForTimeout(250)
  check((await ruleTitles(page)).join() === 'Mana costs blood', 'category + tag filter combined')
  check((await chipGroup(page, 'Filter by tag').getByRole('button', { name: '#cost' }).getAttribute('aria-pressed')) === 'true', 'filter chip exposes aria-pressed')
  await shot(T('04-rules-filtered'), s, 200)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.waitForTimeout(250)

  // --- category dialog ---
  await page.getByRole('button', { name: 'Categories' }).click()
  const cd = catDlg(page)
  await cd.waitFor()
  await shot(T('05-category-dialog'), s, 300)
  const colorIn = cd.getByLabel('Colour of Magic')
  await colorIn.evaluate((e) => {
    e.value = '#aa3366'
    e.dispatchEvent(new Event('input', { bubbles: true }))
    e.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForTimeout(300)
  f = await files(page)
  check(Object.entries(f).some(([k, v]) => k.includes('rules/categories/') && /#aa3366/i.test(v)), 'category: recolour saved')
  const nameIn = cd.getByLabel('Name of category Religion')
  await nameIn.fill('Faith')
  await nameIn.press('Enter')
  await page.waitForTimeout(300)
  f = await files(page)
  check(Object.entries(f).some(([k, v]) => k.includes('rules/categories/') && /"Faith"/.test(v)), 'category: rename saved')
  await cd.getByLabel('New category name').fill('Geography')
  await cd.getByRole('button', { name: 'Add' }).click()
  await page.waitForTimeout(300)
  check((await cd.getByLabel('Name of category Geography').count()) === 1, 'category: new one added')
  // delete Society (has 1 rule) -> reassign
  await cd.getByRole('button', { name: 'Delete category Society' }).click()
  const del = page.getByRole('alertdialog', { name: /Delete category "Society"/ })
  await del.waitFor()
  check((await del.getByText(/1 rule will move/).count()) === 1, 'category delete: confirm says 1 rule will move')
  await shot(T('06-category-delete-reassign'), s, 300)
  const confirmBtn = del.getByRole('button', { name: 'Delete category' })
  await del.getByLabel('Move them to').click()
  await page.getByRole('option', { name: 'Magic' }).click()
  await page.waitForTimeout(200)
  await confirmBtn.click()
  await page.waitForTimeout(500)
  check((await cd.getByLabel('Name of category Society').count()) === 0, 'category delete: Society gone')
  await cd.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  check((await groupTitles(page)).includes('Magic') && !(await groupTitles(page)).includes('Society'), 'category delete: its rule moved to Magic')
  check(!(await chipGroup(page, 'Filter by category').getByRole('button', { name: 'Society' }).count()), 'category delete: filter chip removed')
  // last category blocked
  await page.getByRole('button', { name: 'Categories' }).click()
  await cd.waitFor()
  let guard = 0
  while (guard++ < 12) {
    const delBtns = cd.getByRole('button', { name: /^Delete category / })
    if ((await delBtns.count()) <= 1) break
    await delBtns.first().click()
    const d2 = page.getByRole('alertdialog', { name: /Delete category/ })
    await d2.waitFor()
    if (await d2.getByLabel('Move them to').count()) {
      await d2.getByLabel('Move them to').click()
      await page.locator('.q-menu [role=option]').first().click()
      await page.waitForTimeout(150)
    }
    await d2.getByRole('button', { name: 'Delete category' }).click()
    await page.waitForTimeout(400)
  }
  const lastBtn = cd.getByRole('button', { name: /^Delete category / })
  check((await lastBtn.count()) === 1 && (await lastBtn.isDisabled()), 'category: last category cannot be deleted (button disabled)')
  check((await cd.getByText('The last category cannot be deleted.').count()) > 0, 'category: last-category message shown')
  await cd.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  check((await ruleTitles(page)).length === 3, 'category: all 3 rules still present after deletes')

  // restore a sensible category set for later shots: add back some
  await page.getByRole('button', { name: 'Categories' }).click()
  for (const n of ['Society', 'Physics', 'Technology']) {
    await cd.getByLabel('New category name').fill(n)
    await cd.getByRole('button', { name: 'Add' }).click()
    await page.waitForTimeout(250)
  }
  await cd.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  // put rules in tidy categories
  const setCat = async (title, name) => {
    await ruleBtns(page).filter({ hasText: title }).click()
    await page.waitForTimeout(200)
    await page.getByLabel('Category', { exact: true }).click()
    await page.getByRole('option', { name, exact: true }).click()
    await page.waitForTimeout(250)
  }
  await setCat('Gravity', 'Physics')
  await setCat('Tithe', 'Society')
  await setCat('Mana', 'Magic').catch(() => {})

  // --- timelines: events + picker (keyboard path) ---
  await goTimelines(page)
  await addEvent(page, 'Coronation', '3 May 1400')
  await addEvent(page, 'Treaty signed', '20 June 1400')
  await pickNode(page, 'Coronation')
  check((await page.getByText('No rules linked.').count()) > 0, 'inspector: "No rules linked." before adding')
  await shot(T('07-inspector-rules-empty'), s, 300)
  const addBtn = page.getByRole('button', { name: 'Add rule', exact: true })
  await addBtn.focus()
  await page.keyboard.press('Enter')
  const pk = page.getByRole('dialog', { name: 'Add rule' })
  await pk.waitFor()
  check(await pk.getByRole('combobox').evaluate((e) => document.activeElement === e), 'picker: search box focused on open')
  await shot(T('08-picker'), s, 300)
  await page.keyboard.type('mana')
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check(!(await pk.isVisible()), 'picker: Enter picks and closes')
  check((await inspectorRules(page).count()) === 1 && (await inspectorRules(page).first().textContent()).includes('Mana costs blood'), 'inspector: chip "Mana costs blood" added')
  const nodeRef = (await files(page))
  check(Object.entries(nodeRef).some(([k, v]) => k.includes('timelines/') && /"ruleIds":\["[^"]+"\]/.test(v.replace(/\s/g, ''))), 'files: node ruleIds saved')
  // second rule through arrow keys
  await addBtn.focus()
  await page.keyboard.press('Enter')
  await pk.waitFor()
  await page.waitForTimeout(400)
  check(await pk.getByRole('combobox').evaluate((e) => document.activeElement === e), 'picker: search box focused on second open')
  check((await pk.getByText('Mana costs blood').count()) === 0, 'picker: already-linked rule not offered again')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check((await inspectorRules(page).count()) === 2, 'picker: arrow keys + Enter add a second rule')
  // remove second via chip
  await inspectorRules(page).nth(1).getByRole('button', { name: /^Remove rule:/ }).click()
  await page.waitForTimeout(300)
  check((await inspectorRules(page).count()) === 1, 'chip: Remove unlinks the rule')
  // Escape closes picker
  await addBtn.focus()
  await page.keyboard.press('Enter')
  await pk.waitFor()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check(!(await pk.isVisible()), 'picker: Escape closes')
  await shot(T('09-inspector-rules'), s, 300)
  await aside(page).evaluate((e) => (e.scrollTop = e.scrollHeight))
  const linkedSec = aside(page).locator('section', { has: page.getByRole('heading', { name: 'Linked' }) })
  check((await linkedSec.getByText('Mana costs blood').count()) === 1, 'Linked panel: card for the rule')
  check((await linkedSec.getByText('Rule', { exact: true }).count()) >= 1, 'Linked panel: green "Rule" tag')
  await shot(T('10-linked-panel'), s, 300)

  // --- Open chip -> Rules page, Used in -> back to node ---
  await inspectorRules(page).first().getByRole('button', { name: /^Open rule:/ }).click()
  await page.waitForTimeout(600)
  check((await page.getByLabel('Title', { exact: true }).inputValue()) === 'Mana costs blood', 'Open chip: Rules page shows that rule selected')
  const used = page.locator('ul.used')
  check((await used.getByText('Coronation').count()) === 1, 'Used in: lists the event with its timeline')
  const rp = aside(page).locator('section', { has: page.getByRole('heading', { name: 'Used in' }) })
  check((await rp.getByText('Coronation').count()) > 0, 'context panel (Rules): "Used in" lists the event')
  await shot(T('11-rule-used-in'), s, 300)
  await used.getByRole('button', { name: /Coronation/ }).click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(800)
  check((await page.getByLabel('Title', { exact: true }).inputValue()) === 'Coronation', 'Used in: jump selects the node in Timelines')
  check((await inspectorRules(page).count()) === 1, 'jump: inspector shows the linked rule chip')
  await inspectorRules(page).first().getByRole('button', { name: /^Open rule:/ }).click()
  await page.waitForTimeout(500)
  check((await page.getByLabel('Title', { exact: true }).inputValue()) === 'Mana costs blood', 'back via Open chip works')

  // --- delete rule: confirm shows count ---
  await page.getByRole('button', { name: 'Delete rule' }).click()
  const rd = page.getByRole('alertdialog', { name: 'Delete rule' })
  await rd.waitFor()
  check((await rd.getByText(/1 event uses it/).count()) === 1, 'delete confirm: "1 event uses it ..."')
  await shot(T('12-rule-delete-confirm'), s, 300)
  await rd.getByRole('button', { name: 'Delete rule' }).click()
  await page.waitForTimeout(600)
  check(!(await ruleTitles(page)).includes('Mana costs blood'), 'delete: rule gone from the list')
  f = await files(page)
  const mAfter = await manifestJson(page)
  check(mAfter.rules.length === 2 && mAfter.trash?.some((x) => x.type === 'rule'), 'delete: manifest has 2 rules and a trash entry of type rule')

  // missing state
  await goTimelines(page)
  await pickNode(page, 'Coronation')
  check((await inspectorRules(page).first().textContent()).includes('Missing rule'), 'missing: chip says "Missing rule"')
  check((await inspectorRules(page).first().getByRole('button', { name: 'Remove missing rule' }).count()) === 1, 'missing: chip offers Remove')
  await aside(page).evaluate((e) => (e.scrollTop = e.scrollHeight))
  const ls2 = aside(page).locator('section', { has: page.getByRole('heading', { name: 'Linked' }) })
  check((await ls2.getByText('Problem', { exact: true }).count()) === 1 && (await ls2.getByText('Missing rule').count()) === 1, 'missing: Problem card in Linked panel')
  await shot(T('13-missing-rule'), s, 300)

  // --- trash restore ---
  await page.getByRole('button', { name: 'Trash' }).click()
  const trash = page.getByRole('dialog', { name: 'Trash' })
  await trash.waitFor()
  check((await trash.getByText('Rule · Mana costs blood').count()) === 1, 'trash: row "Rule · Mana costs blood"')
  await shot(T('14-trash-rule'), s, 300)
  await trash.getByRole('button', { name: /Restore.*Mana costs blood/ }).click()
  await page.waitForTimeout(700)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(500)
  check((await inspectorRules(page).first().textContent()).includes('Mana costs blood') && !(await inspectorRules(page).first().textContent()).includes('Missing'), 'restore: node chip fixed')
  const mR = await manifestJson(page)
  check(mR.rules.length === 3 && !mR.trash?.some((x) => x.type === 'rule'), 'restore: manifest has 3 rules, trash entry gone')
  await navTo(page, 'Rules')
  const order = await ruleTitles(page)
  check(order.includes('Mana costs blood'), 'restore: rule back in the list')
  await ruleBtns(page).filter({ hasText: 'Mana costs blood' }).click()
  check(/sleep/.test(await page.getByRole('textbox', { name: 'Exceptions' }).textContent()), 'restore: content intact')

  // --- keyboard path in list ---
  await search(page).focus()
  await page.keyboard.press('Tab')
  await page.waitForTimeout(100)
  let tabs = 0
  while (tabs++ < 25 && !(await page.evaluate(() => document.activeElement?.classList.contains('item')))) await page.keyboard.press('Tab')
  check(await page.evaluate(() => document.activeElement?.classList.contains('item')), 'keyboard: Tab reaches a rule row')
  const focusedTitle = await page.evaluate(() => document.activeElement?.querySelector('.item-title')?.textContent?.trim())
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check((await page.getByLabel('Title', { exact: true }).inputValue()) === focusedTitle, `keyboard: Enter selects the focused row (${focusedTitle})`)
  await page.keyboard.press('Space').catch(() => {})
  await page.keyboard.press('Tab')
  await page.waitForTimeout(100)
  const next = await page.evaluate(() => document.activeElement?.classList.contains('item'))
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  check(!next || (await page.getByLabel('Title', { exact: true }).inputValue()) !== focusedTitle, 'keyboard: Tab + Space selects the next row')
  // Escape closes category dialog and returns focus
  await page.getByRole('button', { name: 'Categories' }).focus()
  await page.keyboard.press('Enter')
  await catDlg(page).waitFor()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check(!(await catDlg(page).isVisible()), 'keyboard: Escape closes category dialog')

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
