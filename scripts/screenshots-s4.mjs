// Usage: node scripts/screenshots-s4.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// Browser build only. S4: branching conversations (graph, inspector, list, play-through, broken variables, reload, search, Polish+dark, keyboard).
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-s4.mjs <outDir>')
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
const notes = []

async function newPage(locale, colorScheme) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale, colorScheme })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  return { ctx, page, errors }
}
async function createGame(page, T, title, folder) {
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: T.welcome.newProject }).click()
  const dlg = page.getByRole('dialog', { name: T.newProject.title })
  await page.waitForTimeout(600)
  await dlg.getByTestId('kind-card').filter({ hasText: T.newProject.kind.game }).click({ force: true })
  await dlg.getByLabel(T.newProject.projectTitle, { exact: true }).fill(title)
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

// =============== English, light ===============
const { page, errors } = await newPage('en-US')
const shot = shotOf(page, errors)
await createGame(page, L, 'Gate Watch', 'gatewatch')
const tree = page.getByRole('tree', { name: L.write.tree })

// variables
await page.getByRole('button', { name: L.variables.title, exact: true }).click()
const vp = page.getByTestId('variables-panel')
await vp.waitFor()
const addVar = async (name, type) => {
  await vp.locator('form.add input[type=text]').fill(name)
  await vp.locator('form.add select').selectOption(type)
  await vp.getByRole('button', { name: L.variables.add }).click()
  await page.waitForTimeout(150)
}
await addVar('metGuard', 'flag')
await addVar('trust', 'number')
await addVar('name', 'text')
check((await vp.locator('tbody tr').count()) === 3, 'three variables')
await shot('01-variables')
await page.getByRole('button', { name: L.variables.title, exact: true }).click().catch(() => {})

// conversation
await page.getByRole('button', { name: L.outline.addConversation, exact: true }).click()
await page.locator('input.rename').fill('Guard at the gate')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
await shot('02-empty-conversation')
check(await page.getByText(L.game.conversation.emptyTitle).isVisible(), 'empty state shown')

const A = (k) => page.getByRole('button', { name: L.game.conversation.addOf.replace('{type}', L.game.conversation.type[k]) })
const nodeEl = (text) => page.locator('[data-graph-node]').filter({ hasText: text })
const insp = page.getByRole('complementary', { name: L.game.conversation.inspector })
const ed = () => insp.locator('.ProseMirror')

// node 1: Lines with a speaker
await page.getByRole('button', { name: L.game.conversation.addFirst }).click()
await insp.waitFor()
await ed().waitFor()
await ed().click()
await page.keyboard.type('Halt! Who goes there?')
await ed().locator('.speaker-chip').first().click()
const picker = page.getByRole('dialog', { name: L.speaker.pick })
await picker.waitFor()
await page.keyboard.type('Guard')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
await page.waitForTimeout(700)
check(await nodeEl('Halt').count() === 1, 'first Lines node shows the line text')
const chip = await ed().locator('.speaker-chip').allInnerTexts()
check(chip.join() === 'Guard', `speaker chip ${chip}`)
await shot('03-first-node')

// node 2: Choice after it
await A('choice').click()
await page.waitForTimeout(500)
check((await page.locator('[data-graph-node]').count()) === 2, 'second node added')
await page.waitForTimeout(300)
// node 3: Lines B, node 4: End
await A('lines').click()
await page.waitForTimeout(500)
await ed().click()
await page.keyboard.type('Fine. Move along, then.')
await page.waitForTimeout(600)
await A('end').click()
await page.waitForTimeout(500)

const C = L.game.conversation
const pick = async (sel, re) => {
  const v = await sel.evaluate((el, src) => { const r = new RegExp(src); const o = [...el.options].find((x) => r.test(x.textContent.trim())); return o ? o.value : null }, re.source)
  if (v === null) throw new Error('no option ' + re)
  await sel.selectOption(v)
}
const select = async (id) => { await page.getByRole('button', { name: L.timelineView.fit }).click(); await page.waitForTimeout(300); await page.locator('[data-graph-node]').filter({ hasText: id }).first().click(); await page.waitForTimeout(300) }
const fit = async () => { await page.getByRole('button', { name: L.timelineView.fit }).click(); await page.waitForTimeout(300) }

// Lines B: sets metGuard on entry, then back to the Choice
await select('Fine. Move along')
await pick(insp.getByLabel(C.target.label), /^Choice/)
await insp.getByRole('button', { name: C.setOps.add }).click()
await page.waitForTimeout(200)
await insp.getByRole('group', { name: C.sets }).getByLabel(C.condition.value + ' 1').selectOption('true')
await page.waitForTimeout(300)


// Choice: three options
await select('Choice')
await pick(insp.getByLabel(C.target.label), /.*/).catch(() => {})
for (let i = 0; i < 3; i++) { await insp.getByRole('button', { name: C.options.add }).click(); await page.waitForTimeout(150) }
const opt = (i) => insp.locator('.opt').nth(i)
const optText = ['Show the captain’s seal', 'Answer politely', 'Ask again']
for (let i = 0; i < 3; i++) await opt(i).getByLabel(C.options.text.replace('{n}', i + 1)).fill(optText[i])
await pick(opt(0).getByLabel(C.options.target.replace('{n}', 1)), /^End/)
await pick(opt(1).getByLabel(C.options.target.replace('{n}', 2)), /^Lines: Fine/)
await pick(opt(2).getByLabel(C.options.target.replace('{n}', 3)), /^Lines: Halt/)
// option 1: condition metGuard is true (default first variable + first op)
await opt(0).getByRole('button', { name: C.condition.add }).click()
await page.waitForTimeout(200)
// option 2: sets trust add 1
await opt(1).getByRole('button', { name: C.setOps.add }).click()
await page.waitForTimeout(200)
const sg = opt(1).getByRole('group', { name: new RegExp(C.optionSets) })
await pick(sg.getByLabel(C.condition.variable + ' 1'), /^trust$/)
await page.waitForTimeout(200)
await sg.getByLabel(C.condition.operator + ' 1').selectOption('add')
await sg.getByLabel(C.condition.value + ' 1').fill('1')
await sg.getByLabel(C.condition.value + ' 1').blur()
await page.waitForTimeout(500)
await shot('05-choice-inspector')
console.log('opt0', await opt(0).innerText())
console.log('opt1', await opt(1).innerText())
await fit()
const drag = async (text, dx, dy) => {
  const b = await page.locator('[data-graph-node]').filter({ hasText: text }).first().boundingBox()
  const x = b.x + b.width / 2, y = b.y + b.height / 2
  await page.mouse.move(x, y); await page.mouse.down()
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 }); await page.mouse.move(x + dx, y + dy, { steps: 6 })
  await page.mouse.up(); await page.waitForTimeout(300)
}
await drag('Fine. Move along', 60, 150)
await drag('End', 0, -110)
await fit()
await page.locator('.graph-canvas .vue-flow__pane').click({ position: { x: 20, y: 20 } })
await page.waitForTimeout(300)
await shot('06-canvas-graph')


// start node: mark B, check the chip moves, put it back on the first node
await select('Fine. Move along')
await insp.getByLabel(C.startHere).check()
await page.waitForTimeout(400)
check((await nodeEl('Fine. Move along').innerText()).includes(C.start), 'start chip on B')
check(!(await nodeEl('Halt').innerText()).includes(C.start), 'start chip left the first node')
await select('Halt')
await insp.getByLabel(C.startHere).check()
await page.waitForTimeout(400)
check((await nodeEl('Halt').innerText()).includes(C.start), 'start chip back on first node')

// End: entry condition  name does not equal "Zed"
await select('End')
await insp.getByRole('button', { name: C.condition.add }).click()
const cg = insp.getByRole('group', { name: C.entryCondition })
await pick(cg.getByLabel(C.condition.variable + ' 1'), /^name$/)
await page.waitForTimeout(200)
await cg.getByLabel(C.condition.operator + ' 1').selectOption('neq')
await cg.getByLabel(C.condition.value + ' 1').fill('Zed')
await cg.getByLabel(C.condition.value + ' 1').blur()
await page.waitForTimeout(400)
await shot('07-end-entry-condition')

// list view
await page.getByRole('button', { name: L.timelineView.list, exact: true }).click()
await page.waitForTimeout(400)
await shot('08-list-view')
await page.getByRole('button', { name: L.timelineView.canvas, exact: true }).click()
await page.waitForTimeout(400)

// ---- play-through ----
await page.getByRole('button', { name: C.play }).click()
const play = page.getByRole('region', { name: C.playthrough.title })
await play.waitFor()
await page.waitForTimeout(400)
check((await play.innerText()).includes('Halt! Who goes there?'), 'play-through shows the first line with speaker')
await play.getByRole('button', { name: C.playthrough.continue }).click()
await page.waitForTimeout(300)
let optBtns = await play.getByRole('group', { name: C.playthrough.options }).getByRole('button').allInnerTexts()
console.log('options now', optBtns)
check(optBtns.length === 2 && !optBtns.join().includes('seal'), 'conditional option is hidden while metGuard is false')
await shot('09-play-choice-hidden-option')
await play.getByRole('button', { name: /Answer politely/ }).click()
await page.waitForTimeout(300)
await play.getByRole('button', { name: C.playthrough.continue }).click()
await page.waitForTimeout(300)
optBtns = await play.getByRole('group', { name: C.playthrough.options }).getByRole('button').allInnerTexts()
console.log('options after metGuard', optBtns)
check(optBtns.length === 3, 'conditional option appears after metGuard is set')
check((await play.innerText()).includes(C.playthrough.loop), 'loop note shown on revisiting the choice')
const vt = await play.locator('table').innerText()
console.log('vars', vt.replace(/\s+/g, ' '))
check(/trust\s+1/.test(vt) && /true/.test(vt), 'variable table shows trust 1 and metGuard true')
await shot('10-play-mid-run')
await play.getByRole('button', { name: /Show the captain/ }).click()
await page.waitForTimeout(300)
check((await play.innerText()).includes(C.playthrough.ended), 'play-through reaches End')
await shot('11-play-ended')

// ---- delete variable `name` -> broken uses, play-through stops ----
await page.getByRole('button', { name: L.variables.title, exact: true }).click()
await vp.waitFor()
await page.getByRole('button', { name: L.variables.delete.replace('{name}', 'name') }).click()
const dd = page.getByRole('alertdialog').or(page.getByRole('dialog')).last()
console.log('delete dialog:', (await dd.innerText()).replace(/\s+/g, ' '))
check(/Used 1 time/.test(await dd.innerText()), 'delete confirmation counts 1 conversation use')
await dd.getByRole('button', { name: L.variables.delete.replace(' {name}', '') }).click().catch(async () => { await dd.getByRole('button').last().click() })
await page.waitForTimeout(500)
await page.getByRole('button', { name: L.variables.title, exact: true }).click().catch(() => {})
await page.waitForTimeout(400)
await select('End')
check((await nodeEl('End').innerText()).includes(C.badge.review), 'End node shows Needs review badge')
await fit()
await shot('12-broken-variable')
console.log('end cond group', (await insp.getByRole('group', { name: C.entryCondition }).innerText()).replace(/\s+/g, ' '))
await page.getByRole('button', { name: C.play }).click()
await play.waitFor()
await page.waitForTimeout(300)
await play.getByRole('button', { name: C.playthrough.continue }).click()
await play.getByRole('button', { name: /Answer politely/ }).click()
await play.getByRole('button', { name: C.playthrough.continue }).click()
await play.getByRole('button', { name: /Show the captain/ }).click()
await page.waitForTimeout(400)
check((await play.innerText()).includes(C.playthrough.stoppedTitle), 'play-through stops at End with deleted variable')
console.log('stop:', (await play.getByRole('alert').innerText()).replace(/\s+/g, ' '))
await shot('13-play-stopped')


// ---- reload: the stored file and the graph are identical ----
const dumpLS = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
const convKey = async () => {
  const d = await dumpLS()
  return Object.keys(d).find((k) => k.startsWith('storyworks:project:gatewatch/') && !k.includes('projectmeta') && /"startNodeId"/.test(d[k]))
}
const before = await dumpLS()
const ck = await convKey()
check(!!ck, `conversation file found (${ck})`)
const beforeNodes = JSON.parse(before[ck]).nodes
console.log('file version', JSON.parse(before[ck]).version, 'nodes', beforeNodes.map((n) => n.type).join())
await page.reload()
await page.getByRole('heading', { level: 1 }).first().waitFor()
await page.getByRole('button', { name: 'Open project' }).click()
await page.getByRole('dialog', { name: 'Projects in this browser' }).getByRole('button', { name: 'gatewatch' }).click()
await page.getByRole('heading', { name: 'Gate Watch' }).first().waitFor({ timeout: 6000 }).catch(() => {})
await page.waitForTimeout(800)
if (await page.locator('.tour-root').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(400) }
await tree.getByRole('treeitem').filter({ hasText: 'Guard at the gate' }).click()
await page.locator('[data-graph-node]').first().waitFor()
await fit()
const after = await dumpLS()
check(after[ck] === before[ck], 'conversation file unchanged after reopen')
check((await page.locator('[data-graph-node]').count()) === 4, 'four nodes after reopen')
check((await nodeEl('End').innerText()).includes(C.badge.review), 'broken-variable badge still shown after reopen')
await page.locator('.graph-canvas .vue-flow__pane').click({ position: { x: 20, y: 20 } })
await shot('14-reopened')

// ---- search finds a line ----
await page.getByRole('button', { name: L.search.open }).click()
await page.locator(`input[aria-label="${L.search.inputLabel}"]`).fill('Halt')
await page.waitForTimeout(700)
const res = await page.getByRole('listbox').or(page.locator('[role=dialog]')).last().innerText()
console.log('search:', res.replace(/\s+/g, ' ').slice(0, 200))
check(/Halt/.test(res) && /Conversation/.test(res), 'search finds the conversation line')
await shot('15-search')
await page.keyboard.press('Enter')
await page.waitForTimeout(800)
check(await page.locator('[data-graph-node]').count() > 0, 'search result opens the conversation')
await page.waitForTimeout(500)
console.log('after search open: selected inspector?', await insp.count(), 'line editor text:', (await page.locator('.ProseMirror').allInnerTexts()).join('|').slice(0, 80))

// ---- keyboard-only pass on a new conversation ----
await page.getByRole('button', { name: L.outline.addConversation, exact: true }).click()
await page.locator('input.rename').fill('Keyboard only')
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
const where = () => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)}"` : 'none' })
const kb = []
const step = async (label, fn) => { await fn(); await page.waitForTimeout(450); const w = await where(); kb.push(`${label} -> focus on ${w}`) }
await page.getByRole('button', { name: C.addFirst }).focus()
await step('Enter on Add first node', () => page.keyboard.press('Enter'))
await step('N (add Lines after focused)', () => page.keyboard.press('n'))
await step('N again', () => page.keyboard.press('n'))
check((await page.locator('[data-graph-node]').count()) === 3, 'keyboard: three nodes by pressing N')
await step('C start connect (from the last node)', () => page.keyboard.press('c'))
await step('ArrowLeft twice (target: first node)', async () => { await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft') })
await step('Enter confirm', () => page.keyboard.press('Enter'))
await page.waitForTimeout(2500)
const dd2 = await dumpLS()
const kbKey = Object.keys(dd2).find((k) => k.startsWith('storyworks:project:gatewatch/') && !k.includes('projectmeta') && k !== ck && /"startNodeId"/.test(dd2[k]))
const cn = JSON.parse(dd2[kbKey])
console.log('kb nodes', cn.nodes.map((n) => `${n.id.slice(0, 4)}:${n.type}->${(n.next ?? '').slice(0, 4)}`))
check(cn.nodes[2].next === cn.nodes[0].id, 'keyboard: loop connection 3 -> 1 stored')
await step('Enter opens inspector', () => page.keyboard.press('Enter'))
console.log('inspector visible', await insp.isVisible())
for (let i = 0; i < 4; i++) await step(`Tab ${i + 1} from the node`, () => page.keyboard.press('Tab'))
// pick the Choice toolbar button by keyboard, then use option pickers by keyboard
await page.getByRole('button', { name: C.addOf.replace('{type}', C.type.choice) }).focus()
await step('Enter on Add Choice', () => page.keyboard.press('Enter'))
await page.waitForTimeout(300)
await insp.getByRole('button', { name: C.options.add }).focus()
await step('Enter Add option', () => page.keyboard.press('Enter'))
await page.keyboard.press('Tab') // up/down are disabled for one option -> remove button
const txt = page.getByLabel(C.options.text.replace('{n}', 1))
await txt.focus()
await page.keyboard.type('Go on')
await page.keyboard.press('Tab')
await step('Tab to target select', async () => {})
await page.keyboard.press('ArrowDown')
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(400)
const tsel = page.getByLabel(C.options.target.replace('{n}', 1))
console.log('target select value label:', await tsel.evaluate((el) => el.selectedOptions[0].textContent))
console.log('KEYBOARD LOG:\n' + kb.join('\n'))
await shot('16-keyboard-pass')


check(errors.length === 0, `no console errors (en/light): ${[...new Set(errors)].join(' | ')}`)

// =============== Polish + dark: same project seeded into a new context ===============
{
  const entries = Object.fromEntries(Object.entries(await dumpLS()).filter(([k]) => k.startsWith('storyworks:project')))
  const settings = JSON.stringify({ version: 5, theme: 'dark', language: 'pl', uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: [], backups: { intervalMinutes: 30, keep: 20, onClose: true }, shortcuts: {}, tourSeen: true })
  const c2 = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'pl-PL', colorScheme: 'dark' })
  await c2.addInitScript(([e, st]) => { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1'); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); localStorage.setItem('storyworks:settings.json', st) }, [entries, settings])
  const p2 = await c2.newPage()
  p2.setDefaultTimeout(8000)
  const errs2 = []
  p2.on('pageerror', (e) => errs2.push(e.message))
  p2.on('console', (m) => m.type() === 'error' && errs2.push(m.text()))
  await p2.goto(`${ORIGIN}/`)
  await p2.getByRole('heading', { level: 1 }).first().waitFor()
  await p2.getByRole('button', { name: P.welcome.openProject ?? 'Otwórz projekt' }).click()
  await p2.getByRole('dialog').getByRole('button', { name: 'gatewatch' }).click()
  await p2.waitForTimeout(1500)
  const T2 = p2.getByRole('tree', { name: P.write.tree })
  await T2.getByRole('treeitem').filter({ hasText: 'Guard at the gate' }).click()
  await p2.locator('[data-graph-node]').first().waitFor()
  await p2.getByRole('button', { name: P.timelineView.fit }).click()
  await p2.waitForTimeout(400)
  await p2.locator('[data-graph-node]').filter({ hasText: 'Answer' }).first().click().catch(() => {})
  const PC = P.game.conversation
  await p2.locator('[data-graph-node]').filter({ hasText: PC.type.choice }).first().click()
  await p2.waitForTimeout(500)
  await p2.screenshot({ path: join(out, '17-pl-dark-choice.png'), fullPage: true })
  console.log('17 ok')
  await p2.getByRole('button', { name: PC.play }).click()
  const play2 = p2.getByRole('region', { name: PC.playthrough.title })
  await play2.waitFor()
  await play2.getByRole('button', { name: PC.playthrough.continue }).click()
  await p2.waitForTimeout(300)
  await play2.getByRole('button', { name: /Answer politely/ }).click()
  await play2.getByRole('button', { name: PC.playthrough.continue }).click()
  await p2.waitForTimeout(400)
  await p2.screenshot({ path: join(out, '18-pl-dark-play.png'), fullPage: true })
  console.log('18 ok')
  await p2.getByRole('button', { name: P.timelineView.list, exact: true }).click()
  await p2.waitForTimeout(400)
  await p2.screenshot({ path: join(out, '19-pl-dark-list.png'), fullPage: true })
  console.log('19 ok')
  check(errs2.length === 0, `no console errors (pl/dark) ${[...new Set(errs2)].join(' | ')}`)
  await c2.close()
}

await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED', notes)
