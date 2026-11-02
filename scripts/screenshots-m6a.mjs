// Usage: node scripts/screenshots-m6a.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Drives the M6a relationships/groups/graph flow in the browser build (not the Tauri window): relations tab, dialogs, managers, graph, delete/restore; checks the acceptance items and captures the screens in Light and Dark.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m6a.mjs <outDir>')
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
const relFiles = (f, dir) => Object.entries(f).filter(([k]) => k.startsWith(`${P}${dir}/`) && !k.endsWith('layout.json'))
const dlgName = (page, n) => page.getByRole('dialog', { name: n })
const opts = (page) => page.locator('.q-menu [role=option]')
const addDlg = (page) => page.getByRole('dialog', { name: /relationship|relacj/i })
const rows = (page) => page.locator('ul.rows > li')
const rowsText = async (page) => (await rows(page).allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim())

/** Fills the add/edit dialog. otherName picks from the select; typeText is typed + Enter (new) or an existing option. */
async function fillRelationship(page, { other, typeText, existing, reverse }) {
  const d = addDlg(page)
  await d.getByLabel('Other entry', { exact: true }).click()
  await d.getByLabel('Other entry', { exact: true }).fill(other)
  await opts(page).filter({ hasText: other }).first().click()
  await page.waitForTimeout(200)
  const t = d.getByLabel('Relation type', { exact: true })
  await t.click()
  if (existing) {
    await opts(page).filter({ hasText: existing }).first().click()
  } else {
    await t.fill(typeText)
    await t.press('Enter')
  }
  await page.waitForTimeout(250)
  if (reverse) await d.getByLabel('Reverse label for the new type (optional)').fill(reverse)
}
const save = async (page) => {
  await addDlg(page).locator('button[type=submit]').click()
  await page.waitForTimeout(500)
}

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

  await navTo(page, 'Codex')
  await newEntry(page, 'Aldric Voss', 'Character')
  await newEntry(page, 'Mara of the Reeds', 'Character')
  await newEntry(page, 'Jory Voss', 'Character')
  await newEntry(page, 'Stonehaven', 'Town')
  await newEntry(page, 'Kingdom of Vale', 'Country')

  // ---- Relations tab, empty ----
  await selectEntry(page, 'Aldric Voss')
  await tabTo(page, 'Relations')
  check((await page.getByText('No relationships yet.').count()) === 1, 'relations tab: empty text')
  let f
  let m = await readJson(page, 'project.json')
  console.log('  manifest relationTypes:', (m.relationTypes ?? []).map((x) => x.title).join(', '), 'v' + m.version)
  check((m.relationTypes ?? []).length === 7, `starter relation types seeded (7): ${(m.relationTypes ?? []).length}`)
  await shot(T('00-relations-empty'), s)

  // ---- add: new type on the fly ----
  await page.getByRole('button', { name: 'Add relationship' }).click()
  await addDlg(page).waitFor()
  const d = addDlg(page)
  // self not offered
  await d.getByLabel('Other entry', { exact: true }).click()
  await page.waitForTimeout(250)
  const offered = await opts(page).allInnerTexts()
  console.log('  other options:', offered.map((x) => x.replace(/\s+/g, ' ')).join(' | '))
  check(offered.length === 4 && !offered.some((x) => /Aldric/.test(x)), 'dialog: self is not offered as the other entry')
  await opts(page).filter({ hasText: 'Mara of the Reeds' }).click()
  await page.waitForTimeout(250)
  const otherDisp = await d.locator('.q-field', { hasText: 'Other entry' }).first().innerText()
  check(/Mara of the Reeds/.test(otherDisp), `display-value: "Other entry" shows the chosen name (${otherDisp.replace(/\s+/g, ' ')})`)
  const tIn = d.getByLabel('Relation type', { exact: true })
  await tIn.click()
  await tIn.fill('the object of pure hatred')
  await tIn.press('Enter')
  await page.waitForTimeout(300)
  const leftover = await tIn.inputValue()
  check(leftover === '', `new-value-mode: typed text cleared after Enter (input="${leftover}")`)
  const typeDisp = await d.locator('.q-field', { hasText: 'Relation type' }).first().innerText()
  check(/New type: the object of pure hatred/.test(typeDisp), `display-value: "Relation type" shows "New type: ..." (${typeDisp.replace(/\s+/g, ' ')})`)
  check((await d.getByLabel('Reverse label for the new type (optional)').count()) === 1, 'dialog: reverse-label input shown for the new type')
  await shot(T('01-add-relationship-dialog'), s, 300)
  await save(page)
  check(!(await addDlg(page).isVisible().catch(() => false)), 'dialog closes after save')
  let r = await rowsText(page)
  console.log('  rows:', r.join(' || '))
  check(r.length === 1 && /the object of pure hatred/.test(r[0]) && /Mara of the Reeds/.test(r[0]), 'Aldric page: outgoing row with the new type')
  f = await files(page)
  m = await readJson(page, 'project.json')
  check(m.relationTypes.length === 8 && m.relationships?.length === 1, `manifest: 8 types, 1 relationship (${m.relationTypes.length}/${m.relationships?.length})`)
  check(relFiles(f, 'relation-types').some(([, v]) => /pure hatred/.test(v)), 'files: new relation type file written')
  check(relFiles(f, 'relationships').length === 1, 'files: relationship file written')
  // reverse side
  await selectEntry(page, 'Mara of the Reeds')
  await tabTo(page, 'Relations')
  r = await rowsText(page)
  console.log('  Mara rows:', r.join(' || '))
  check(r.length === 1 && /the object of pure hatred/.test(r[0]) && /Aldric Voss/.test(r[0]), 'Mara page: same label (no reverse label) and Aldric listed')
  check((await rows(page).first().getByText('Incoming', { exact: false }).count()) >= 1, 'Mara page: marked incoming')


  // ---- Town -> Country "Located in" ----
  await selectEntry(page, 'Stonehaven')
  await tabTo(page, 'Relations')
  await page.getByRole('button', { name: 'Add relationship' }).click()
  await addDlg(page).waitFor()
  await fillRelationship(page, { other: 'Kingdom of Vale', existing: 'Located in' })
  const hint = await addDlg(page).innerText()
  check(/reads "Contains"/i.test(hint), `dialog: reverse hint for Located in (${/reads "([^"]*)"/.exec(hint)?.[1]})`)
  await save(page)
  r = await rowsText(page)
  check(r.length === 1 && /Located in/.test(r[0]) && /Kingdom of Vale/.test(r[0]), `Town page: "Located in" Kingdom of Vale (${r[0]})`)
  await navTo(page, 'Codex')
  await selectEntry(page, 'Kingdom of Vale')
  await tabTo(page, 'Relations')
  r = await rowsText(page)
  check(r.length === 1 && /Contains/.test(r[0]) && /Stonehaven/.test(r[0]), `Country page shows reverse label "Contains" (${r[0]})`)

  // ---- parent <-> child ----
  await selectEntry(page, 'Aldric Voss')
  await tabTo(page, 'Relations')
  await page.getByRole('button', { name: 'Add relationship' }).click()
  await addDlg(page).waitFor()
  await fillRelationship(page, { other: 'Jory Voss', existing: 'Parent' })
  await save(page)
  await selectEntry(page, 'Jory Voss')
  await tabTo(page, 'Relations')
  r = await rowsText(page)
  check(r.length === 1 && /Child/.test(r[0]) && /Aldric Voss/.test(r[0]), `Jory page shows reverse label "Child" (${r[0]})`)

  // ---- duplicate refused ----
  await selectEntry(page, 'Aldric Voss')
  await tabTo(page, 'Relations')
  await page.getByRole('button', { name: 'Add relationship' }).click()
  await addDlg(page).waitFor()
  await fillRelationship(page, { other: 'Mara of the Reeds', existing: 'the object of pure hatred' })
  await addDlg(page).locator('button[type=submit]').click()
  await page.waitForTimeout(400)
  const alertTxt = await addDlg(page).getByRole('alert').allInnerTexts()
  check(alertTxt.join(' ').includes('This relationship already exists'), `duplicate: visible message (${alertTxt.join('|').replace(/\s+/g, ' ')})`)
  check(await addDlg(page).isVisible(), 'duplicate: dialog stays open')
  await shot(T('02-duplicate-refused'), s, 200)
  // same pair, other direction is not a duplicate of the stored one; self-relationship is impossible in the UI
  await addDlg(page).getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(300)
  m = await readJson(page, 'project.json')
  check(m.relationships.length === 3, `duplicate: nothing stored (${m.relationships.length} relationships)`)

  // ---- timeline event + link ----
  await page.getByRole('link', { name: /Timelines/ }).first().click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Add event' }).click()
  await page.waitForTimeout(350)
  const tf = page.getByLabel('Title', { exact: true })
  await tf.fill('The duel at the ford')
  await tf.press('Enter')
  await page.waitForTimeout(300)
  await navTo(page, 'Codex')
  await selectEntry(page, 'Aldric Voss')
  await tabTo(page, 'Relations')
  await page.getByRole('button', { name: /^Edit relationship with Mara/ }).click()
  await addDlg(page).waitFor()
  await addDlg(page).getByRole('button', { name: 'Link to an event…' }).click()
  const pick = page.getByRole('dialog', { name: /Link relationship to an event/ })
  await pick.waitFor()
  await pick.locator('[role=option]', { hasText: 'The duel at the ford' }).first().click()
  await page.waitForTimeout(300)
  check((await addDlg(page).getByText('The duel at the ford').count()) >= 1, 'edit: event shown in the dialog after picking')
  await save(page)
  r = await rowsText(page)
  check(r.some((x) => /The duel at the ford/.test(x)), `Relations row shows the linked event (${r[0]})`)
  await shot(T('03-relations-tab'), s, 300)
  await page.getByRole('button', { name: /^Go to event/ }).click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(800)
  check((await page.getByLabel('Title', { exact: true }).inputValue()) === 'The duel at the ford', 'row event link: jumps to the node in Timelines')
  const insp = page.locator('[data-testid=node-relation-row]')
  check((await insp.count()) === 1, 'node inspector: Relationships section lists the relationship')
  const rowLabel = await insp.first().locator('button').getAttribute('aria-label')
  check(/Aldric Voss, the object of pure hatred, Mara of the Reeds/.test(rowLabel ?? ''), `node inspector row: "${rowLabel}"`)
  await insp.first().scrollIntoViewIfNeeded()
  await shot(T('04-node-inspector-relationships'), s, 300)
  await insp.first().click()
  await page.waitForTimeout(500)
  check((await nameField(page).count()) === 1, 'node inspector row: opens an entry in Codex')


  // ---- groups manager ----
  await selectEntry(page, 'Aldric Voss')
  await tabTo(page, 'Relations')
  check((await page.getByText(/There are no groups yet/).count()) === 1, 'entry groups: "no groups yet" hint')
  await page.getByRole('button', { name: 'Groups…' }).click()
  const gd = dlgName(page, 'Groups')
  await gd.waitFor()
  await gd.getByLabel('New group name').fill('House Stark')
  await gd.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(400)
  for (const nm of ['Aldric Voss', 'Jory Voss', 'Mara of the Reeds']) {
    const ad = gd.getByLabel('Add member', { exact: true })
    await ad.click()
    await ad.fill(nm)
    await opts(page).filter({ hasText: nm }).first().click()
    await page.waitForTimeout(350)
  }
  check((await gd.getByRole('group', { name: 'Members of House Stark' }).locator('li').count()) === 3, 'groups: 3 members listed')
  await shot(T('05-groups-manager'), s, 300)
  f = await files(page)
  const gFile = relFiles(f, 'groups').map(([, v]) => JSON.parse(v))[0]
  check(gFile?.name === 'House Stark' && gFile.memberIds.length === 3, `files: group file with 3 members (${gFile?.memberIds?.length})`)
  await gd.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  check((await page.getByText('House Stark').count()) >= 1, 'entry page: shows the group chip')
  // a second group, to check filtering later
  await page.getByRole('button', { name: 'Groups…' }).click()
  await gd.waitFor()
  await gd.getByLabel('New group name').fill('Reed folk')
  await gd.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(300)
  {
    const ad = gd.getByLabel('Add member', { exact: true }).last()
    await ad.click()
    await ad.fill('Stonehaven')
    await opts(page).filter({ hasText: 'Stonehaven' }).first().click()
    await page.waitForTimeout(300)
  }
  await gd.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)

  // ---- graph ----
  await navTo(page, 'Codex')
  await page.getByRole('link', { name: 'Relationship graph' }).click()
  await page.getByRole('heading', { name: 'Relationship graph', level: 1 }).waitFor()
  await page.locator('[data-graph-node]').first().waitFor()
  await page.waitForTimeout(800)
  const nodeCount = await page.locator('[data-graph-node]').count()
  check(nodeCount === 5, `graph: 5 nodes drawn (${nodeCount})`)
  const edgeTexts = (await page.locator('.vue-flow__edge-text, .vue-flow__edge-label, .vue-flow__edge text').allTextContents()).map((x) => x.trim()).filter(Boolean)
  console.log('  edge labels:', [...new Set(edgeTexts)].join(' | '))
  check(['the object of pure hatred', 'Located in', 'Parent'].every((l) => edgeTexts.some((x) => x.includes(l))), 'graph: edges are labelled with the relation type')
  const regs = await page.locator('svg.regions path.region').count()
  const regTxt = await page.locator('svg.regions text.region-label').allTextContents()
  check(regs === 2 && regTxt.includes('House Stark'), `graph: group regions drawn with labels (${regTxt.join(',')})`)
  await shot(T('06-graph'), s, 400)
  // filters
  const chip = (label) => page.locator('.filters button.fchip', { hasText: label })
  const dimmed = () => page.locator('[data-graph-node].dimmed, .gnode.dimmed').count()
  await chip('House Stark').click()
  await page.waitForTimeout(500)
  const afterGroup = await page.locator('[data-graph-node]').count()
  check(afterGroup === 3, `filter by group: only the 3 members shown (${afterGroup})`)
  await shot(T('07-graph-group-filter'), s, 400)
  await page.getByRole('button', { name: 'Clear filters' }).first().click()
  await page.waitForTimeout(400)
  await chip('Located in').click()
  await page.waitForTimeout(500)
  const afterRel = await page.locator('[data-graph-node]').count()
  const afterRelEdges = (await page.locator('.vue-flow__edge').count())
  console.log('  nodes/edges after relation filter:', afterRel, afterRelEdges, 'dimmed', await dimmed())
  check(afterRelEdges === 1, `filter by relation type: one edge left (${afterRelEdges})`)
  await page.getByRole('button', { name: 'Clear filters' }).first().click()
  await page.waitForTimeout(300)
  await chip('Country').click()
  await page.waitForTimeout(500)
  const afterEntry = await page.locator('[data-graph-node]').count()
  console.log('  nodes after entry-type filter:', afterEntry, 'dimmed', await dimmed())
  check(afterEntry >= 1 && afterEntry < 5, `filter by entry type: graph narrowed (${afterEntry})`)
  await page.getByRole('button', { name: 'Clear filters' }).first().click()
  await page.waitForTimeout(400)
  // list view
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.waitForTimeout(400)
  const listRows = await page.locator('table.rows tbody tr').count()
  check(listRows === 3, `list view: 3 relationship rows (${listRows})`)
  await shot(T('08-graph-list'), s, 300)
  await page.getByRole('button', { name: 'Graph', exact: true }).click()
  await page.waitForTimeout(600)
  // drag
  const nodeEl = page.locator('[data-graph-node]').filter({ hasText: 'Stonehaven' })
  const b0 = await nodeEl.boundingBox()
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2)
  await page.mouse.down()
  await page.mouse.move(b0.x + b0.width / 2 + 60, b0.y + b0.height / 2 + 90, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const b1 = await nodeEl.boundingBox()
  const kb1 = await page.locator('[data-graph-node]').filter({ hasText: 'Kingdom of Vale' }).boundingBox()
  check(Math.abs(b1.x - b0.x) > 20 || Math.abs(b1.y - b0.y) > 20, `drag: node moved (${Math.round(b1.x - b0.x)},${Math.round(b1.y - b0.y)})`)
  const lay = await readJson(page, 'relationships/layout.json')
  const mm = await readJson(page, 'project.json')
  console.log('  layout:', JSON.stringify(lay)?.slice(0, 200), 'ref:', JSON.stringify(mm.relationLayout))
  check(lay && Object.keys(lay.positions ?? {}).length >= 1, 'drag: relationships/layout.json written')
  check(!!mm.relationLayout, 'drag: manifest points at the layout file')
  // survive reload
  const savedPos = lay.positions
  await page.reload()
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: 'Open project' }).click()
  await page.getByRole('button', { name: 'demo', exact: true }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await navTo(page, 'Codex')
  await page.getByRole('link', { name: 'Relationship graph' }).click()
  await page.locator('[data-graph-node]').first().waitFor()
  await page.waitForTimeout(800)
  const nb = await page.locator('[data-graph-node]').filter({ hasText: 'Stonehaven' }).boundingBox()
  const ob = await page.locator('[data-graph-node]').filter({ hasText: 'Kingdom of Vale' }).boundingBox()
  console.log('  after reload Stonehaven bbox', JSON.stringify(nb), 'Kingdom', JSON.stringify(ob))
  const lay2 = await readJson(page, 'relationships/layout.json')
  check(JSON.stringify(lay2.positions) === JSON.stringify(savedPos), 'reload: saved positions unchanged in the file')
  const e2 = await files(page)
  const sid = Object.values(e2).map((v) => { try { return JSON.parse(v) } catch { return null } }).find((x) => x?.name === 'Stonehaven' && x.typeId)?.id
  check(!!lay2.positions[sid], 'reload: the dragged node has its saved position')
  // relative to the untouched node (the view may re-fit): same offset as before the reload
  console.log('  Stonehaven vs Kingdom offset before/after reload:', Math.round(b1.x - kb1.x), Math.round(b1.y - kb1.y), Math.round(nb.x - ob.x), Math.round(nb.y - ob.y))
  const zr = nb.width / b1.width
  check(Math.abs((b1.x - kb1.x) * zr - (nb.x - ob.x)) < 4 && Math.abs((b1.y - kb1.y) * zr - (nb.y - ob.y)) < 4, 'reload: dragged node is rendered where it was dropped')
  // re-layout
  await page.getByRole('button', { name: 'Re-layout' }).click()
  await page.waitForTimeout(800)
  const lay3 = await readJson(page, 'relationships/layout.json')
  check(!lay3 || Object.keys(lay3.positions ?? {}).length === 0, `re-layout: saved positions cleared (${lay3 ? Object.keys(lay3.positions).length : 'file gone'})`)
  const nb3 = await page.locator('[data-graph-node]').filter({ hasText: 'Stonehaven' }).boundingBox()
  check(!!nb3, 'graph still shown after re-layout')
  await shot(T('09-graph-relayout'), s, 300)


  // ---- relation types manager ----
  await navTo(page, 'Codex')
  await selectEntry(page, 'Mara of the Reeds')
  await tabTo(page, 'Relations')
  await page.getByRole('button', { name: 'Relation types…' }).click()
  const td = dlgName(page, 'Relation types')
  await td.waitFor()
  // new type + use
  await td.getByLabel('New type name').fill('Rival')
  await td.getByLabel('Reverse label (optional)', { exact: true }).fill('rivalled by')
  await td.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(400)
  check((await td.getByLabel('Name of Rival').count()) === 1, 'types manager: new type "Rival" added')
  // reverse label on the hatred type
  const rv = td.getByLabel('Reverse label of the object of pure hatred')
  await rv.fill('despised by')
  await rv.press('Enter')
  await page.waitForTimeout(300)
  // rename an unused type
  const rn = td.getByLabel('Name of Friend')
  await rn.fill('Close friend')
  await rn.press('Enter')
  await page.waitForTimeout(300)
  f = await files(page)
  check(relFiles(f, 'relation-types').some(([, v]) => /"Close friend"/.test(v)), 'types manager: rename saved')
  check(relFiles(f, 'relation-types').some(([, v]) => /despised by/.test(v)), 'types manager: reverse label saved')
  await shot(T('10-relation-types-manager'), s, 300)
  await td.getByRole('button', { name: 'Close', exact: true }).click()
  await page.waitForTimeout(300)
  // reverse side now reads the reverse label
  r = await rowsText(page)
  check(r.some((x) => /despised by/.test(x) && /Aldric Voss/.test(x)), `reverse label set: Mara's page reads "despised by" (${r[0]})`)
  // use Rival, then delete with reassign
  await page.getByRole('button', { name: 'Add relationship' }).click()
  await addDlg(page).waitFor()
  await fillRelationship(page, { other: 'Jory Voss', existing: 'Rival' })
  await save(page)
  m = await readJson(page, 'project.json')
  check(m.relationships.length === 4, `4 relationships now (${m.relationships.length})`)
  await page.getByRole('button', { name: 'Relation types…' }).click()
  await td.waitFor()
  check((await td.getByText('1 relationship').count()) >= 1, 'types manager: usage count shown')
  await td.getByRole('button', { name: 'Delete Rival' }).click()
  const del = page.getByRole('alertdialog', { name: /Delete "Rival"/ })
  await del.waitFor()
  check((await del.getByText(/1 relationship moves/).count()) === 1, 'type delete: confirm says 1 relationship moves')
  await del.getByLabel('Move them to').click()
  await opts(page).filter({ hasText: /^Enemy$/ }).first().click()
  await page.waitForTimeout(200)
  await shot(T('11-relation-type-delete'), s, 300)
  await del.getByRole('button', { name: 'Delete type' }).click()
  await page.waitForTimeout(600)
  check((await td.getByLabel('Name of Rival').count()) === 0, 'type delete: type gone')
  f = await files(page)
  const reassigned = relFiles(f, 'relationships').map(([, v]) => JSON.parse(v))
  const enemyId = relFiles(f, 'relation-types').map(([, v]) => JSON.parse(v)).find((x) => x.name === 'Enemy')?.id
  check(reassigned.filter((x) => x.typeId === enemyId).length === 1, 'type delete: relationship moved to Enemy')
  await td.getByRole('button', { name: 'Close', exact: true }).click()
  await page.waitForTimeout(300)
  r = await rowsText(page)
  check(r.some((x) => /Enemy/.test(x) && /Jory/.test(x)), `Mara's page shows the moved relationship as Enemy`)

  // ---- delete an entry with relationships ----
  await page.getByRole('button', { name: 'Delete entry' }).click().catch(() => {})
  await tabTo(page, 'Details')
  await page.getByRole('button', { name: 'Delete entry' }).click()
  const ed = page.getByRole('alertdialog', { name: 'Delete entry' })
  await ed.waitFor()
  const edt = (await ed.innerText()).replace(/\s+/g, ' ')
  console.log('  delete confirm:', edt)
  check(/2 relationships will show as broken/.test(edt), 'delete confirm: 2 relationships listed as breaking')
  check(/Relationships with: .*Aldric Voss/.test(edt) && /Groups: House Stark/.test(edt), 'delete confirm: names the other entries and the group')
  await shot(T('12-entry-delete-confirm'), s, 300)
  await ed.getByRole('button', { name: 'Delete entry' }).click()
  await page.waitForTimeout(700)
  await selectEntry(page, 'Aldric Voss')
  await tabTo(page, 'Relations')
  r = await rowsText(page)
  console.log('  Aldric rows after delete:', r.join(' || '))
  const brokenRows = await page.locator('ul.rows > li.broken').count()
  check(brokenRows >= 1 && r.some((x) => /Mara of the Reeds \(deleted\)/.test(x)), `relationships show broken with the deleted name (${brokenRows} broken rows)`)
  await shot(T('13-relations-broken'), s, 300)
  await page.getByRole('link', { name: 'Relationship graph' }).click()
  await page.locator('[data-graph-node]').first().waitFor()
  await page.waitForTimeout(700)
  const banner = (await page.locator('p.banner').allInnerTexts()).join(' ')
  check(/hidden: missing entr/.test(banner), `graph: banner for hidden relationships (${banner.replace(/\s+/g, ' ')})`)
  check((await page.locator('[data-graph-node]').filter({ hasText: 'Mara of the Reeds' }).count()) === 0, 'graph: deleted entry not drawn')
  await shot(T('14-graph-with-broken'), s, 300)
  // restore
  await page.getByRole('link', { name: /^\s*Codex/ }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Trash' }).click()
  const trash = page.getByRole('dialog', { name: 'Trash' })
  await trash.waitFor()
  await trash.getByRole('button', { name: /Restore.*Mara of the Reeds/ }).click()
  await page.waitForTimeout(800)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(400)
  await selectEntry(page, 'Aldric Voss')
  await tabTo(page, 'Relations')
  r = await rowsText(page)
  check((await page.locator('ul.rows > li.broken').count()) === 0 && r.some((x) => /Mara of the Reeds/.test(x) && !/deleted/.test(x)), `restore: relationships work again (${await page.locator('ul.rows > li.broken').count()} broken)`)
  await page.getByRole('link', { name: 'Relationship graph' }).click()
  await page.locator('[data-graph-node]').first().waitFor()
  await page.waitForTimeout(700)
  check((await page.locator('[data-graph-node]').count()) === 5 && (await page.locator('p.banner').count()) === 0, 'restore: graph shows all 5 nodes again, no banner')

  // ---- Polish smoke ----
  await navTo(page, 'Settings')
  await page.locator('.language-select').click()
  await page.getByRole('option', { name: 'Polski' }).click()
  await page.waitForTimeout(500)
  const keyLike = /\b(relations|relationGraph|groupsMgr|deleteImpact|nodeRelations|codex|timelines|eventLink)\.[A-Za-z]+/
  const english = /Add relationship|Relationship graph|Re-layout|Outgoing|Incoming|Relation types|House Stark region/
  async function polishCheck(name) {
    const txt = await page.locator('body').innerText()
    const k = keyLike.exec(txt)
    const e = english.exec(txt)
    check(!k && !e, `polish: ${name} has no raw keys or English leftovers (${k?.[0] ?? e?.[0] ?? 'clean'})`)
  }
  await navTo(page, 'Kodeks')
  await selectEntry(page, 'Aldric Voss')
  await tabTo(page, 'Relacje')
  await polishCheck('Relacje tab')
  await shot(T('15-relations-polish'), s, 300)
  await page.getByRole('button', { name: 'Dodaj relację' }).click()
  await addDlg(page).waitFor()
  await polishCheck('add dialog')
  await addDlg(page).getByRole('button', { name: 'Anuluj' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Typy relacji…' }).click()
  await page.waitForTimeout(400)
  await polishCheck('types manager')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Grupy…' }).click()
  await page.waitForTimeout(400)
  await polishCheck('groups manager')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('link', { name: 'Graf relacji' }).click()
  await page.locator('[data-graph-node]').first().waitFor()
  await page.waitForTimeout(600)
  await polishCheck('graph')
  await page.locator('.seg', { hasText: 'Lista' }).click()
  await page.waitForTimeout(400)
  await polishCheck('graph list')
  await shot(T('16-graph-list-polish'), s, 300)

  await s.ctx.close()
}
await flow('light')
if (!process.env.LIGHT_ONLY) await flow('dark')
tag = 'end'
console.log(failures ? `${failures} CHECK(S) FAILED` : 'all checks passed')
console.log(allErrors.length ? `CONSOLE ERRORS: ${[...new Set(allErrors)].join(' | ')}` : 'no console errors')
await browser.close()
if (failures || allErrors.length) process.exit(1)
