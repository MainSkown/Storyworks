// Usage: node scripts/screenshots-s3.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// Browser build only. S3: game tree, script lines with speakers and ids, variables, broken speaker + restore, Polish, dark.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-s3.mjs <outDir>')
mkdirSync(out, { recursive: true })
const ORIGIN = 'http://localhost:1420'
const en = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/en.json'), 'utf8'))
const pl = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/pl.json'), 'utf8'))
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })
const L = en
let failures = 0
const check = (c, m) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`) }

const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-US' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: join(out, `${name}.png`), fullPage: true }); console.log(`${name} ok`) }
const nav = (key) => page.getByRole('link', { name: new RegExp(`^\\s*${L.sections[key]}`) }).first().click()

await page.goto(`${ORIGIN}/`)
await page.getByRole('heading', { level: 1 }).first().waitFor()
await page.getByRole('button', { name: L.welcome.newProject }).click()
const dlg = page.getByRole('dialog', { name: L.newProject.title })
await page.waitForTimeout(600)
await dlg.getByTestId('kind-card').filter({ hasText: L.newProject.kind.game }).click({ force: true })
await dlg.getByLabel(L.newProject.projectTitle, { exact: true }).fill('Dragon Tavern')
await dlg.getByLabel(L.newProject.author).fill('Mara Quill')
await dlg.getByLabel(L.newProject.folderName).fill('tavern')
await dlg.getByRole('button', { name: L.newProject.create }).click()
await page.getByRole('heading', { name: 'Dragon Tavern' }).first().waitFor({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(1000)
if (await page.locator('.tour-root').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(400) }
await shot('01-empty-game')

// tree: folder > folder > script, conversation
const addAndName = async (label, name) => {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.locator('input.rename').fill(name)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
}
await addAndName(L.outline.addFolder, 'Act 1')
await addAndName(L.outline.addFolder, 'Tavern')           // selected folder -> nested
await addAndName(L.outline.addScript, 'Welcome')           // inside Tavern
await addAndName(L.outline.addConversation, 'Barkeep')    // sibling in Tavern
const tree = page.getByRole('tree', { name: L.write.tree })
const rows = await tree.getByRole('treeitem').allInnerTexts()
console.log('rows:', rows.map((r) => r.replace(/\s+/g, ' ')).join(' | '))
check(rows.length === 4, 'four tree rows (2 folders, script, conversation)')
const levels = await tree.getByRole('treeitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-level')))
check(levels.join() === '1,2,3,3', `nesting levels ${levels}`)

// open the conversation -> note
await tree.getByRole('treeitem').filter({ hasText: 'Barkeep' }).click()
await page.getByTestId('conversation-note').waitFor()
await shot('02-tree-conversation')

// script: lines with speakers
await tree.getByRole('treeitem').filter({ hasText: 'Welcome' }).click()
const ed = page.locator('.ProseMirror.game')
await ed.waitFor()
await page.waitForTimeout(400)
await ed.click()
await page.keyboard.type('The tavern is loud tonight.')
await page.keyboard.press('Enter')
await page.keyboard.press('Tab')                           // speaker picker at line start
const picker = page.getByRole('dialog', { name: L.speaker.pick })
await picker.waitFor()
await page.keyboard.type('Anna')
await shot('03-picker-new-name')
await page.keyboard.press('ArrowDown')                     // Use as plain name -> Add to codex
await page.keyboard.press('Enter')                         // add to codex
await picker.waitFor({ state: 'detached' })
await page.waitForTimeout(300)
await page.keyboard.type('Welcome, traveller! Sit anywhere.')
await page.keyboard.press('Enter')
await page.keyboard.press('Tab')
await picker.waitFor()
await page.keyboard.type('Old Tom')
await page.keyboard.press('Enter')                         // plain name (first option)
await page.waitForTimeout(300)
await page.keyboard.type('Aye, and I want ale.')
await page.waitForTimeout(500)
const chips = await ed.locator('.speaker-chip').allInnerTexts()
const states = await ed.locator('.speaker-chip').evaluateAll((els) => els.map((e) => e.dataset.state))
const ids = await ed.locator('.game-line').evaluateAll((els) => els.map((e) => e.getAttribute('data-line-id')))
console.log('chips', chips, states, ids)
check(/Welcome, traveller/.test(await ed.innerText()) && /Aye, and I want ale/.test(await ed.innerText()), 'typed text intact')
check(chips.join() === '—,Anna,Old Tom' && states.join() === 'none,entry,name', 'chips: narration, codex speaker, plain name')
check(ids.join() === 'L000001,L000002,L000003', `line ids ${ids}`)
await shot('04-script-lines')

// text line + text item
await page.keyboard.press('Enter')
await page.keyboard.press('Tab')
await picker.waitFor()
await shot('04b-picker-text-option')
await picker.getByRole('option', { name: L.speaker.text }).click()
await page.waitForTimeout(300)
await page.keyboard.type('Rain hammers the shutters as the fire dies down.')
await page.keyboard.press('Enter')
await page.keyboard.type('Another descriptive line.')
await page.waitForTimeout(400)
const kinds = await ed.locator('.game-line').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))
check(kinds.join() === 'speech,speech,speech,text,text', `line kinds ${kinds}`)
check((await ed.locator('.speaker-chip').count()) === 3, 'text lines have no chip')
await shot('04c-text-lines')
await addAndName(L.outline.addText, 'Harbour')
await page.locator('.ProseMirror').first().waitFor()
await page.waitForTimeout(500)
check((await page.locator('.ProseMirror.game').count()) === 0, 'text item uses the prose editor')
await page.locator('.ProseMirror').first().click()
await page.keyboard.type('Gulls wheel over the quay. The tide is out.')
await page.keyboard.press('Enter')
await page.keyboard.type('Nets hang drying between the masts.')
await page.waitForTimeout(500)
check((await page.locator('.ProseMirror p').count()) === 2, 'two paragraphs')
await shot('04d-text-item')
await tree.getByRole('treeitem').filter({ hasText: 'Welcome' }).click()
await page.locator('.ProseMirror.game').waitFor()
await page.waitForTimeout(400)

// reopen: close project and open again is covered by unit tests; here switch away and back
await nav('codex')
await page.waitForTimeout(500)
await page.getByRole('button', { name: /^Anna/ }).first().click()
await page.getByLabel(L.codex.fields.name, { exact: true }).fill('Anya')
await page.getByLabel(L.codex.fields.name, { exact: true }).blur()
await page.waitForTimeout(500)
await nav('write')
await page.locator('.ProseMirror.game').waitFor()
await page.waitForTimeout(500)
const renamed = await page.locator('.speaker-chip').allInnerTexts()
check(renamed[1] === 'Anya', `renaming the character updates the chip (${renamed})`)

// delete the character -> broken chip, then restore
await nav('codex')
await page.getByRole('button', { name: /^Anya/ }).first().click()
await page.getByRole('button', { name: L.codex.deleteEntry }).click()
const del = page.getByRole('alertdialog').or(page.getByRole('dialog')).last()
await del.getByRole('button', { name: L.write.delete }).click().catch(async () => { await del.getByRole('button', { name: L.codex.deleteEntry }).click() })
await page.waitForTimeout(500)
await nav('write')
await page.locator('.ProseMirror.game').waitFor()
await page.waitForTimeout(500)
const broken = await page.locator('.speaker-chip').evaluateAll((els) => els.map((e) => [e.dataset.state, e.textContent]))
console.log('after delete', JSON.stringify(broken))
check(broken[1][0] === 'broken', 'deleted speaker shows as broken')
console.log('chip style', JSON.stringify(await page.locator('.speaker-chip').nth(1).evaluate((e) => { const c = getComputedStyle(e); return [c.whiteSpace, c.display, c.maxWidth, c.width, c.fontSize, e.scrollWidth, e.clientWidth] })))
await shot('05-broken-speaker')
await page.locator('.speaker-chip').nth(1).click()
await picker.waitFor()
await shot('06-restore-option')
await picker.getByRole('option', { name: L.speaker.restore }).click()
await page.waitForTimeout(600)
const restored = await page.locator('.speaker-chip').evaluateAll((els) => els.map((e) => [e.dataset.state, e.textContent]))
console.log('after restore', JSON.stringify(restored))
check(restored[1][0] === 'entry', 'restored speaker is linked again')

// variables
await page.getByRole('button', { name: L.variables.title, exact: true }).click()
const panel = page.getByTestId('variables-panel')
await panel.waitFor()
const addVar = async (name, type) => {
  await panel.locator('form.add input[type=text]').fill(name)
  await panel.locator('form.add select').selectOption(type)
  await panel.getByRole('button', { name: L.variables.add }).click()
}
await addVar('met_king', 'flag')
await addVar('gold', 'number')
await addVar('nickname', 'text')
await panel.locator('form.add input[type=text]').fill('GOLD')
await panel.getByRole('button', { name: L.variables.add }).click()
await panel.locator('.error').waitFor()
check((await panel.locator('.error').innerText()).includes('already has this name'), 'duplicate variable name refused')
await panel.getByLabel('Starting value of gold').fill('25')
await panel.getByLabel('Starting value of gold').blur()
await shot('07-variables')
check((await panel.locator('tbody tr').count()) === 3, 'three variables listed')

// corkboard
await tree.getByRole('treeitem').filter({ hasText: 'Welcome' }).click()
await page.getByRole('button', { name: L.corkboard.corkboard ?? 'Corkboard' }).click().catch(() => {})
await shot('08-corkboard')
await page.getByRole('button', { name: L.corkboard.editor ?? 'Editor' }).click().catch(() => {})

// Polish + dark, new project
{
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'pl-PL', colorScheme: 'dark' })
  const p2 = await ctx2.newPage()
  const errs2 = []
  p2.on('pageerror', (e) => errs2.push(e.message))
  const P = pl
  await p2.goto(`${ORIGIN}/`)
  await p2.getByRole('heading', { level: 1 }).first().waitFor()
  await p2.getByRole('button', { name: P.welcome.newProject }).click()
  const d2 = p2.getByRole('dialog', { name: P.newProject.title })
  await p2.waitForTimeout(600)
  await d2.getByTestId('kind-card').filter({ hasText: P.newProject.kind.game }).click({ force: true })
  await d2.getByLabel(P.newProject.projectTitle, { exact: true }).fill('Smocza Karczma')
  await d2.getByLabel(P.newProject.author).fill('Mara')
  await d2.getByLabel(P.newProject.folderName).fill('karczma')
  await d2.getByRole('button', { name: P.newProject.create }).click()
  await p2.waitForTimeout(1200)
  if (await p2.locator('.tour-root').count()) { await p2.keyboard.press('Escape'); await p2.waitForTimeout(400) }
  await p2.getByRole('button', { name: P.outline.addScript, exact: true }).click()
  await p2.locator('input.rename').fill('Powitanie')
  await p2.keyboard.press('Enter')
  await p2.locator('.ProseMirror.game').waitFor()
  await p2.waitForTimeout(500)
  await p2.locator('.ProseMirror.game').click()
  await p2.keyboard.type('W karczmie jest głośno.')
  await p2.keyboard.press('Enter')
  await p2.keyboard.press('Tab')
  await p2.getByRole('dialog', { name: P.speaker.pick }).waitFor()
  await p2.keyboard.type('Stary Tom')
  await p2.waitForTimeout(300)
  await p2.screenshot({ path: join(out, '09-pl-dark-picker.png'), fullPage: true })
  await p2.keyboard.press('Enter')
  await p2.waitForTimeout(300)
  await p2.keyboard.type('Dobrze cię widzieć!')
  await p2.waitForTimeout(500)
  await p2.screenshot({ path: join(out, '10-pl-dark-script.png'), fullPage: true })
  await p2.getByRole('button', { name: P.variables.title, exact: true }).click()
  await p2.getByTestId('variables-panel').waitFor()
  await p2.screenshot({ path: join(out, '11-pl-dark-variables.png'), fullPage: true })
  check(errs2.length === 0, `no console errors (pl/dark) ${errs2.join(' | ')}`)
  await ctx2.close()
}
check(errors.length === 0, `no console errors ${[...new Set(errors)].join(' | ')}`)
await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
