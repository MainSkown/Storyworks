// Usage: node scripts/screenshots-s7.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// Browser build only. S7: script checks and game export.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-s7.mjs <outDir>')
mkdirSync(out, { recursive: true })
const ORIGIN = 'http://localhost:1420'
const root = join(import.meta.dirname, '..')
const L = JSON.parse(readFileSync(join(root, 'src/locales/en.json'), 'utf8'))
const P = JSON.parse(readFileSync(join(root, 'src/locales/pl.json'), 'utf8'))
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })
let failures = 0
const check = (c, m) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`) }

async function newPage(locale, colorScheme) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale, colorScheme })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  return { ctx, page, errors }
}
async function createGame(page, T, title, folder, kind = 'game') {
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: T.welcome.newProject }).click()
  const dlg = page.getByRole('dialog', { name: T.newProject.title })
  await page.waitForTimeout(600)
  await dlg.getByTestId('kind-card').filter({ hasText: T.newProject.kind[kind] }).click({ force: true })
  await dlg.getByLabel(kind === 'book' ? T.newProject.bookTitle : T.newProject.projectTitle, { exact: true }).fill(title)
  await dlg.getByLabel(T.newProject.author).fill('Mara Quill')
  await dlg.getByLabel(T.newProject.folderName).fill(folder)
  await dlg.getByRole('button', { name: T.newProject.create }).click()
  await page.getByRole('heading', { name: title }).first().waitFor({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(1000)
  if (await page.locator('.tour-root').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(400) }
}
const shotOf = (page, errors) => async (name) => {
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true })
  console.log(`${name} ok${errors.length ? ' ERRORS ' + [...new Set(errors)].join(' | ') : ''}`)
}




const G = L.gamedoc
const M = G.mechanicsTab
const K = G.links
const C = L.game.conversation
const X = L.game.crossLink
const S = L.storymap
const CK = L.checks

const goto = async (page, T, name) => {
  await page.getByRole('link', { name }).or(page.getByRole('button', { name })).first().click()
  await page.waitForTimeout(500)
}
const pickOption = async (page, field, option) => {
  await page.getByLabel(field, { exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await page.waitForTimeout(250)
}

// =============== English, light: build the game ===============
const { page, errors } = await newPage('en-US')
const shot = shotOf(page, errors)
process.on('uncaughtException', async (e) => { console.log('FATAL', e.message.split('\n')[0]); await (globalThis.__cur ?? page).screenshot({ path: join(out, 'fatal.png'), fullPage: true }).catch(() => {}); process.exit(2) })
await createGame(page, L, 'Gate Watch', 'gatewatch7')
const tree = page.getByRole('tree', { name: L.write.tree })
const insp = page.getByRole('complementary', { name: C.inspector })
const ed = () => insp.locator('.ProseMirror')
const A = (k) => page.getByRole('button', { name: C.addOf.replace('{type}', C.type[k]) })
const fit = async () => { await page.getByRole('button', { name: L.timelineView.fit }).click(); await page.waitForTimeout(300) }
const rename = async (n) => { await page.locator('input.rename').fill(n); await page.keyboard.press('Enter'); await page.waitForTimeout(500) }
const addConv = async (n) => { await page.getByRole('button', { name: L.outline.addConversation, exact: true }).click(); await rename(n) }
const pick = async (sel, re) => {
  const v = await sel.evaluate((el, src) => { const r = new RegExp(src); const o = [...el.options].find((x) => r.test(x.textContent.trim())); return o ? o.value : null }, re.source)
  if (v === null) throw new Error('no option ' + re)
  await sel.selectOption(v)
}
const selectNode = async (text) => { await fit(); await page.locator('[data-graph-node]').filter({ hasText: text }).first().click(); await page.waitForTimeout(300) }
const goWrite = async (name) => {
  await goto(page, L, L.sections.write)
  await tree.getByRole('treeitem').filter({ hasText: name }).click()
  await page.waitForTimeout(600)
}
const addLines = async (text) => {
  await ed().click()
  await page.keyboard.type(text)
  await page.waitForTimeout(600)
}

// variables: gold (used by a condition), karma (used by a mechanic), spare (unused)
await page.getByRole('button', { name: L.variables.title, exact: true }).click()
const vp = page.getByTestId('variables-panel')
await vp.waitFor()
for (const [n, ty] of [['gold', 'number'], ['spare', 'flag'], ['karma', 'number']]) {
  await vp.locator('form.add input[type=text]').fill(n)
  await vp.locator('form.add select').selectOption(ty)
  await vp.getByRole('button', { name: L.variables.add }).click()
  await page.waitForTimeout(200)
}
await page.getByRole('button', { name: L.variables.title, exact: true }).click().catch(() => {})

// script Intro with a codex speaker (deleted later)
await page.getByRole('button', { name: L.outline.addScript, exact: true }).click()
await rename('Intro')
const sed = page.locator('.ProseMirror.game')
await sed.waitFor()
await sed.click()
await page.keyboard.type('Rain falls on the east gate.')
await page.keyboard.press('Enter')
await page.keyboard.press('Tab')
const spk = page.getByRole('dialog', { name: L.speaker.pick })
await spk.waitFor()
await page.keyboard.type('Anna')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await spk.waitFor({ state: 'detached' })
await page.waitForTimeout(300)
await page.keyboard.type('Hold the gate until dawn.')
await page.waitForTimeout(700)
check((await sed.locator('.speaker-chip').evaluateAll((e) => e.map((x) => x.dataset.state))).includes('entry'), 'Intro has a codex-linked speaker')

// conversations
await addConv('Temp')
await addConv('Orphan')
await page.getByRole('button', { name: C.addFirst }).click(); await insp.waitFor(); await addLines('Nobody ever finds me.')
await A('end').click(); await page.waitForTimeout(500)

await addConv('Captain')
await page.getByRole('button', { name: C.addFirst }).click(); await insp.waitFor(); await addLines('Good. Hold the gate.')
await A('end').click(); await page.waitForTimeout(500)
// End node with an entry condition on gold (the variable is deleted later)
await insp.getByRole('button', { name: C.condition.add }).click()
await page.waitForTimeout(400)

await addConv('Cellar')
await page.getByRole('button', { name: C.addFirst }).click(); await insp.waitFor(); await addLines('Cold stone and barrels.')
await A('end').click(); await page.waitForTimeout(500)

await addConv('Vault')
await page.getByRole('button', { name: C.addFirst }).click(); await insp.waitFor(); await addLines('Dust and silence.')
await A('choice').click(); await page.waitForTimeout(500)
await insp.getByRole('button', { name: C.options.add }).click(); await page.waitForTimeout(200)
await insp.getByLabel(C.options.text.replace('{n}', 1)).fill('Go down to the cellar')
const linkOpt = async (n, item) => {
  await insp.getByLabel(new RegExp('^' + X.mode + '.*' + n + '\\)?$')).selectOption({ label: X.anotherItem })
  const sel = insp.getByLabel(new RegExp('^' + X.item + '.*' + n + '\\)?$'))
  const value = await sel.evaluate((el, t) => [...el.options].find((o) => o.textContent.trim().startsWith(t))?.value, item)
  await sel.selectOption(value)
  await page.waitForTimeout(300)
}
await linkOpt(1, 'Cellar')

await addConv('Guard')
await page.getByRole('button', { name: C.addFirst }).click(); await insp.waitFor(); await addLines('Halt! Who goes there?')
await A('choice').click(); await page.waitForTimeout(500)
await A('lines').click(); await page.waitForTimeout(500)
await addLines('Nothing to see here.')           // dead end
await selectNode('Choice')
await A('end').click(); await page.waitForTimeout(500)   // floating End: nobody points to it
await selectNode('Choice')
for (let i = 0; i < 4; i++) { await insp.getByRole('button', { name: C.options.add }).click(); await page.waitForTimeout(150) }
const optTexts = ['Report to the captain', 'Say nothing much', 'Mumble', 'Slip down to the vault']
for (let i = 0; i < 4; i++) await insp.getByLabel(C.options.text.replace('{n}', i + 1)).fill(optTexts[i])
await linkOpt(1, 'Captain')
await pick(insp.getByLabel(new RegExp('^' + C.target.label + '.*2\\)?$')), /^Lines: Nothing/)
await linkOpt(4, 'Vault')
await page.waitForTimeout(500)
await fit()
await shot('00-setup-guard-conversation')

// story map: starts on Guard and Intro; route tags
await goto(page, L, L.sections.timelines)
const tctx = page.locator('.context-panel')
for (const name of ['Route A', 'Route B']) {
  await page.getByRole('button', { name: L.timelineView.addEvent }).click()
  await page.waitForTimeout(600)
  await tctx.getByRole('button', { name: L.timelines.inspector.newBranch, exact: true }).click()
  await page.waitForTimeout(300)
  await tctx.getByLabel(L.timelines.inspector.branchName).fill(name)
  await tctx.getByRole('button', { name: L.timelines.inspector.createBranch }).click()
  await page.waitForTimeout(600)
}
await goto(page, L, L.sections.storymap)
await page.waitForTimeout(1200)
await fit()
const box = (t) => page.locator('[data-graph-node]').filter({ hasText: t }).first()
for (const t of ['Guard', 'Intro']) {
  await box(t).click(); await page.waitForTimeout(300)
  await tctx.getByLabel(S.inspector.start).check(); await page.waitForTimeout(300)
}
await box('Vault').click(); await page.waitForTimeout(300)
await tctx.getByRole('checkbox', { name: /Route B/ }).check()
await box('Cellar').click(); await page.waitForTimeout(300)
await tctx.getByRole('checkbox', { name: /Route A/ }).check()
await page.waitForTimeout(400)
await fit()
await shot('00-setup-story-map')

// mechanics: Stamina (links karma + Temp, later broken), Haggling (Implemented, no links)
await goto(page, L, L.sections.gamedoc)
await page.getByTestId('gamedoc-tab-mechanics').click()
await page.waitForTimeout(400)
const picker = page.getByTestId('mechanic-link-picker')
const closePicker = async () => { if (await picker.count()) await picker.getByRole('button', { name: K.cancel }).click() }
const linkTo = async (tab, name) => {
  await page.getByRole('button', { name: K.add }).click()
  await picker.waitFor()
  await picker.getByRole('tab', { name: tab }).click()
  await picker.getByRole('option', { name }).first().click()
  await page.waitForTimeout(300)
  await closePicker()
}
const addMech = async (title) => {
  await page.getByRole('button', { name: M.newMechanic }).first().click()
  await page.getByLabel(M.fields.title, { exact: true }).fill(title)
  await page.keyboard.press('Enter')
  await pickOption(page, M.fields.status, M.status.implemented)
  await page.waitForTimeout(300)
}
await addMech('Stamina')
await linkTo(K.tabs.variable, 'karma')
await linkTo(K.tabs.item, 'Temp')
await addMech('Haggling')
await page.waitForTimeout(500)

// delete: gold, karma (variables), Temp (conversation), Anna (codex)
await goto(page, L, L.sections.write)
await page.getByRole('button', { name: L.variables.title, exact: true }).click()
await vp.waitFor()
for (const n of ['gold', 'karma']) {
  await page.getByRole('button', { name: L.variables.delete.replace('{name}', n) }).click()
  const cd = page.getByRole('alertdialog').or(page.getByRole('dialog')).last()
  await cd.getByRole('button', { name: new RegExp(L.variables.delete.split(' ')[0], 'i') }).last().click()
  await page.waitForTimeout(400)
}
check((await vp.locator('tbody tr').count()) === 1, 'only the spare variable is left')
await page.getByRole('button', { name: L.variables.title, exact: true }).click().catch(() => {})
await tree.getByRole('treeitem').filter({ hasText: 'Temp' }).click()
await page.waitForTimeout(500)
await tree.getByRole('treeitem').filter({ hasText: 'Temp' }).getByRole('button', { name: new RegExp(L.write.delete) }).click()
const dd = page.getByRole('alertdialog'); await dd.waitFor(); await dd.getByRole('button').last().click()
await page.waitForTimeout(600)
await goto(page, L, L.sections.codex)
await page.getByRole('button', { name: /^Anna/ }).first().click()
await page.getByRole('button', { name: L.codex.deleteEntry }).click()
const cd2 = page.getByRole('alertdialog').or(page.getByRole('dialog')).last()
await cd2.getByRole('button', { name: L.write.delete }).click().catch(async () => { await cd2.getByRole('button', { name: L.codex.deleteEntry }).click() })
await page.waitForTimeout(600)

// =============== Scenario 1: Checks page ===============
await goto(page, L, L.sections.checks)
await page.getByRole('button', { name: CK.run }).click()
await page.getByText(/Last run|Ostatnio/).waitFor()
await page.waitForTimeout(1500)
const bodyText = async () => (await page.locator('main, .page').first().innerText())
const txt = await bodyText()
console.log(txt)
const expect = {
  'dead-end': /Node "[^"]*Nothing to see here[^"]*" in "Guard" has no way forward/,
  'unreachable-node': /in "Guard" cannot be reached from the start/,
  'unreachable-item': /"Orphan" cannot be reached/,
  'choice-no-target': /An option of "[^"]+" in "Guard" has neither/,
  'undefined-variable': /"Captain" uses a variable that was deleted/,
  'route-unreachable': /Route "Route A" cannot be reached/,
  'broken-speaker': /A line in "Intro" is spoken by a codex entry that was deleted/,
  'mechanic-broken-link': /Mechanic "Stamina" links to a variable that was deleted/,
  'mechanic-no-links': /Mechanic "Haggling" is marked Implemented but has no links/,
  'variable-unused': /Variable "spare" is not used/,
}
for (const [id, re] of Object.entries(expect)) check(re.test(txt), `finding shown: ${id}`)
check(!/"Cellar" cannot be reached|"Vault" cannot be reached|"Captain" cannot be reached|"Intro" cannot be reached/.test(txt), 'reachable items are not flagged')
check(!/"[0-9a-f]{8}-[0-9a-f]{4}-/.test(txt), 'NOTE undefined-variable message shows a name, not a raw id')
const before = (await page.locator('li.row .msg').allInnerTexts()).map((s) => s.trim())
await page.setViewportSize({ width: 1600, height: 1400 })
await shot('01-checks-findings')
await page.setViewportSize({ width: 1600, height: 900 })

// open findings
const chip = (re) => page.locator('li.row').filter({ hasText: re }).locator('button.chip').first()
await chip(/has no way forward/).click()
await page.waitForTimeout(1200)
check(/Guard/.test(await page.locator('header').first().innerText()), 'dead-end finding opens the Guard conversation')
check(/Nothing to see here/.test(await insp.innerText().catch(() => '')), 'dead-end finding selects the right node (inspector shows it)')
await shot('02-finding-opens-node')

await goto(page, L, L.sections.checks)
await chip(/Haggling/).click()
await page.waitForTimeout(1000)
const mechUrl = page.url()
check(/gamedoc/i.test(mechUrl) || (await page.getByTestId('gamedoc-tab-mechanics').count()) > 0, 'mechanic finding opens the game document')
check((await page.getByLabel(M.fields.title, { exact: true }).inputValue().catch(() => '')) === 'Haggling', 'mechanic finding selects Haggling')
await shot('03-finding-opens-mechanic')

await goto(page, L, L.sections.checks)
await chip(/Variable "spare"/).click()
await page.waitForTimeout(1000)
check(await page.getByTestId('variables-panel').isVisible(), 'variable finding opens the Variables panel')
await shot('04-finding-opens-variable')
await page.getByRole('button', { name: L.variables.title, exact: true }).click().catch(() => {})

// snapshot the project for the Polish / dark contexts (before fixing the dead end)
await page.waitForTimeout(1200)
const entries = Object.fromEntries(Object.entries(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).filter(([k]) => k.startsWith('storyworks:project')))

// Settings: checks list for the game
await goto(page, L, L.sections.settings)
await page.waitForTimeout(500)
const toggles = page.locator('#set-checks').locator('xpath=..').locator('.q-toggle')
const gameToggleCount = await toggles.count()
console.log('game toggles', gameToggleCount)
check(gameToggleCount === 24 - 0 || gameToggleCount > 14, `game kind lists the new check toggles (${gameToggleCount})`)
await page.locator('#set-checks').scrollIntoViewIfNeeded()
await page.setViewportSize({ width: 1600, height: 2600 })
await shot('05-settings-checks-game')
await page.setViewportSize({ width: 1600, height: 900 })

// =============== Scenario 2: fix the dead end ===============
await goWrite('Guard')
await selectNode('Nothing to see here')
await A('end').click()
await page.waitForTimeout(600)
await fit()
await goto(page, L, L.sections.checks)
await page.getByRole('button', { name: CK.run }).click()
await page.waitForTimeout(1500)
const after = (await page.locator('li.row .msg').allInnerTexts()).map((s) => s.trim())
check(before.some((m) => /has no way forward/.test(m)) && !after.some((m) => /has no way forward/.test(m)), 'dead-end finding disappears after the fix')
const rest = before.filter((m) => !/has no way forward/.test(m))
check(rest.length === after.length && rest.every((m) => after.includes(m)), `all other findings unchanged (${rest.length} before, ${after.length} after)`)
// ids: read from pinia
const ids = async () => page.evaluate(() => {
  const app = document.querySelector('#app')?.__vue_app__
  const st = app?.config.globalProperties.$pinia?.state.value
  const c = st && (st.checks || Object.values(st).find((s) => s && Array.isArray(s.findings)))
  return c ? c.findings.map((f) => f.id) : null
})
const idsAfter = await ids()
console.log('ids after', JSON.stringify(idsAfter))
await page.setViewportSize({ width: 1600, height: 1400 })
await shot('06-checks-after-fix')
await page.setViewportSize({ width: 1600, height: 900 })
if (idsAfter) check(idsAfter.length === after.length && new Set(idsAfter).size === idsAfter.length, 'finding ids are unique')

// Re-break to read the ids before/after is covered by message equality plus the unit tests.

// =============== Scenario 3: export ===============
await goto(page, L, L.sections.export)
await page.waitForTimeout(600)
const cards = page.locator('fieldset.group')
check((await cards.count()) === 2, 'two export cards')
check((await page.locator('legend', { hasText: L.export.game.dataTitle }).count()) === 1 && (await page.locator('legend', { hasText: L.export.game.docTitle }).count()) === 1, 'cards: Game data and Game document')
await shot('07-export-page')
const downloads = []
const runExport = async (card, formatLabel) => {
  const f = page.locator('fieldset.group').filter({ has: page.locator('legend', { hasText: card }) })
  await f.locator('.q-select').first().click()
  await page.getByRole('option', { name: formatLabel, exact: true }).click()
  await page.waitForTimeout(250)
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    f.getByRole('button', { name: L.export.run, exact: true }).click(),
  ])
  const p = join(out, `dl-${downloads.length}-${dl.suggestedFilename().replace(/\s+/g, '_')}`)
  await dl.saveAs(p)
  await page.waitForTimeout(500)
  const ok = await f.getByRole('status').innerText().catch(() => '')
  const err = await f.getByRole('alert').count()
  downloads.push(p)
  check(/downloaded/i.test(ok) && err === 0, `${formatLabel}: saved notice, no error (${dl.suggestedFilename()})`)
  return { path: p, f }
}
const json = await runExport(L.export.game.dataTitle, L.export.formats.gameJson)
const jtxt = readFileSync(json.path, 'utf8')
let jdoc = null
try { jdoc = JSON.parse(jtxt) } catch { check(false, 'JSON parses') }
if (jdoc) {
  check(jdoc.format === 'storyworks-game', 'JSON format tag')
  for (const id of ['L000001', 'L000002']) check(jtxt.includes(`"${id}"`), `JSON contains line id ${id}`)
  check(/Hold the gate until dawn/.test(jtxt) && /Nothing to see here/.test(jtxt), 'JSON contains script and conversation text')
  check(!/Temp/.test(JSON.stringify(jdoc.items ?? [])), 'JSON omits the trashed item')
}
await shot('08-export-game-data-saved')
const csv = await runExport(L.export.game.dataTitle, L.export.formats.gameCsv)
const ctxt = readFileSync(csv.path, 'utf8').replace(/^\uFEFF/, '')
console.log(ctxt.split('\n').slice(0, 5).join('\n'))
check(ctxt.startsWith('item,node,line_id,speaker,text'), 'CSV header')
check(/L000002/.test(ctxt) && /Hold the gate until dawn/.test(ctxt), 'CSV has a line row')
check(readFileSync(csv.path)[0] === 0xef, 'CSV has a BOM')
const pdf = await runExport(L.export.game.docTitle, L.export.formats.pdf)
check(readFileSync(pdf.path).subarray(0, 4).toString() === '%PDF', 'PDF file signature')
const docx = await runExport(L.export.game.docTitle, L.export.formats.docx)
check(readFileSync(docx.path).subarray(0, 2).toString() === 'PK', 'DOCX file signature')
const md = await runExport(L.export.game.docTitle, L.export.formats.markdown)
const mtxt = readFileSync(md.path, 'utf8')
console.log(mtxt.slice(0, 600))
check(/Stamina/.test(mtxt) && /Haggling/.test(mtxt), 'Markdown lists the mechanics')
await shot('09-export-game-document-saved')

// docs card: nothing selected
const df = page.locator('fieldset.group').filter({ has: page.locator('legend', { hasText: L.export.game.docTitle }) })
for (const l of [L.export.game.overview, L.export.game.mechanics, L.export.game.glossary]) await df.getByLabel(l).uncheck().catch(() => {})
await shot('10-export-doc-no-sections')

console.log('errors:', [...new Set(errors)])
check(errors.length === 0, 'no console errors in the English run')

// =============== book project: Settings checks unchanged ===============
const bk = await newPage('en-US')
globalThis.__cur = bk.page
await createGame(bk.page, L, 'Plain Book', 'plainbook7', 'book')
await goto(bk.page, L, L.sections.settings)
await bk.page.waitForTimeout(500)
const bt = bk.page.locator('#set-checks').locator('xpath=..').locator('.q-toggle')
const bn = await bt.count()
const names = await bt.allInnerTexts()
check(bn === 14, `book Settings lists 14 checks (${bn})`)
const gameNames = ['dead-end', 'unreachable-node', 'unreachable-item', 'choice-no-target', 'undefined-variable', 'route-unreachable', 'broken-speaker', 'mechanic-broken-link', 'mechanic-no-links', 'variable-unused'].map((k) => CK.name[k])
check(!names.some((n) => gameNames.some((g) => n.includes(g))), 'book Settings has no game checks')
await bk.page.locator('#set-checks').scrollIntoViewIfNeeded()
await bk.page.setViewportSize({ width: 1600, height: 2000 })
await shotOf(bk.page, bk.errors)('11-settings-checks-book')
await bk.ctx.close()

// =============== Polish and dark: reopen the saved game ===============
async function reopen(locale, scheme, theme, lang) {
  const settings = JSON.stringify({ version: 5, theme, language: lang, uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: [], backups: { intervalMinutes: 30, keep: 20, onClose: true }, shortcuts: {}, tourSeen: true })
  const c2 = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale, colorScheme: scheme })
  await c2.addInitScript(([e, st]) => { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1'); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); localStorage.setItem('storyworks:settings.json', st) }, [entries, settings])
  const p2 = await c2.newPage()
  p2.setDefaultTimeout(8000)
  const e2 = []
  p2.on('pageerror', (e) => e2.push(e.message))
  p2.on('console', (m) => m.type() === 'error' && e2.push(m.text()))
  await p2.goto(`${ORIGIN}/`)
  await p2.getByRole('heading', { level: 1 }).first().waitFor()
  const T = lang === 'pl' ? P : L
  await p2.getByRole('button', { name: T.welcome.openProject }).click()
  await p2.getByRole('dialog').getByRole('button', { name: 'gatewatch7' }).click()
  await p2.getByRole('heading', { name: 'Gate Watch' }).first().waitFor({ timeout: 6000 }).catch(() => {})
  await p2.waitForTimeout(1200)
  if (await p2.locator('.tour-root').count()) { await p2.keyboard.press('Escape'); await p2.waitForTimeout(400) }
  return { c2, p2, e2, T }
}
{
  const { c2, p2, e2, T } = await reopen('pl-PL', 'light', 'light', 'pl')
  const s = shotOf(p2, e2)
  await goto(p2, T, T.sections.checks)
  await p2.getByRole('button', { name: T.checks.run }).click()
  await p2.waitForTimeout(2000)
  const pt = await p2.locator('.page').first().innerText()
  check(!/checks\.|export\.|\{[a-z]+\}/.test(pt), 'Polish Checks page has no raw i18n keys or placeholders')
  check(/Orphan/.test(pt) && /Haggling/.test(pt), 'Polish Checks shows findings')
  console.log(pt.slice(0, 1500))
  await p2.setViewportSize({ width: 1600, height: 1400 })
  await s('12-checks-pl')
  await p2.setViewportSize({ width: 1600, height: 900 })
  await goto(p2, T, T.sections.export)
  await p2.waitForTimeout(500)
  const et = await p2.locator('.page').first().innerText()
  check(!/export\.|\{[a-z]+\}/.test(et), 'Polish Export page has no raw keys')
  await s('13-export-pl')
  await goto(p2, T, T.sections.settings)
  await p2.locator('#set-checks').scrollIntoViewIfNeeded()
  await p2.setViewportSize({ width: 1600, height: 2600 })
  await s('14-settings-checks-pl')
  check(e2.length === 0, `no console errors (pl): ${[...new Set(e2)]}`)
  await c2.close()
}
{
  const { c2, p2, e2, T } = await reopen('en-US', 'dark', 'dark', 'en')
  const s = shotOf(p2, e2)
  await goto(p2, T, T.sections.checks)
  await p2.getByRole('button', { name: T.checks.run }).click()
  await p2.waitForTimeout(2000)
  await p2.setViewportSize({ width: 1600, height: 1400 })
  await s('15-checks-dark')
  await p2.setViewportSize({ width: 1600, height: 900 })
  await goto(p2, T, T.sections.export)
  await p2.waitForTimeout(500)
  await s('16-export-dark')
  check(e2.length === 0, `no console errors (dark): ${[...new Set(e2)]}`)
  await c2.close()
}

await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASS')
process.exit(failures ? 1 : 0)
