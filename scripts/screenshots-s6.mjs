// Usage: node scripts/screenshots-s6.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// Browser build only. S6: game document (overview, mechanics, links, glossary).
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-s6.mjs <outDir>')
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



const G = L.gamedoc
const M = G.mechanicsTab
const K = G.links
const GT = G.glossaryTab
const openSection = async (page, T, name) =>
  page.getByRole('link', { name }).or(page.getByRole('button', { name })).first().click()
const pickOption = async (page, field, option) => {
  await page.getByLabel(field, { exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await page.waitForTimeout(250)
}

// =============== English, light ===============
const { page, errors } = await newPage('en-US')
const shot = shotOf(page, errors)

// new-project dialog: the kind card is now "Game"
await page.goto(`${ORIGIN}/`)
await page.getByRole('heading', { level: 1 }).first().waitFor()
await page.getByRole('button', { name: L.welcome.newProject }).click()
await page.waitForTimeout(700)
check(await page.getByTestId('kind-card').filter({ hasText: L.newProject.kind.game }).count() === 1, 'kind card reads "Game"')
await shot('s6-01-new-project-kind')
await page.keyboard.press('Escape')

await createGame(page, L, 'Rogue Courier', 'roguecourier6')

// a variable and a script to link to
await page.getByRole('button', { name: L.variables.title, exact: true }).click()
const vp = page.getByTestId('variables-panel')
await vp.waitFor()
await vp.locator('form.add input[type=text]').fill('gold')
await vp.locator('form.add select').selectOption('number')
await vp.getByRole('button', { name: L.variables.add }).click()
await page.waitForTimeout(250)
await page.getByRole('button', { name: L.variables.title, exact: true }).click().catch(() => {})
await page.getByRole('button', { name: L.outline.addScript, exact: true }).click()
await page.locator('input.rename').fill('Market')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)

// Overview
await openSection(page, L, L.sections.gamedoc)
await page.getByTestId('gamedoc-tab-overview').waitFor()
const ov = page.locator('.ProseMirror').first()
check((await ov.innerText()).includes(L.gamedoc.overview ? 'Pillars' : ''), 'starter overview has the Pillars heading')
await ov.locator('p').first().click()
await page.keyboard.type('A courier outruns a collapsing empire, one delivery at a time.')
await page.waitForTimeout(700)
await shot('s6-02-overview')

// Mechanics: empty list, then two mechanics
await page.getByTestId('gamedoc-tab-mechanics').click()
await page.waitForTimeout(400)
await shot('s6-03-mechanics-empty')
const add = page.getByRole('button', { name: M.newMechanic }).first()
await add.click()
await page.getByLabel(M.fields.title, { exact: true }).fill('Stamina')
await page.keyboard.press('Enter')
await page.getByLabel(M.fields.summary, { exact: true }).fill('Limits how long the courier can sprint')
await page.keyboard.press('Enter')
await pickOption(page, M.fields.status, M.status.implemented)
await page.getByLabel(M.fields.tags, { exact: true }).fill('hud')
await page.keyboard.press('Enter')
await page.getByRole('button', { name: M.parameters.add }).click()
await page.getByLabel(M.parameters.nameRow.replace('{n}', '1')).fill('Max stamina')
await page.getByLabel(M.parameters.valueRow.replace('{n}', '1')).fill('100')
await page.keyboard.press('Tab')
await page.waitForTimeout(400)

// links via the picker
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
await page.getByRole('button', { name: K.add }).click()
await picker.waitFor()
await shot('s6-05-link-picker')
await closePicker()
await linkTo(K.tabs.variable, 'gold')
await linkTo(K.tabs.item, 'Market')
check((await page.getByText('Market').count()) > 0, 'link to the Market script is listed')
await shot('s6-04-mechanic-detail')

// second mechanic that links to the first
await add.click()
await page.getByLabel(M.fields.title, { exact: true }).fill('Shops')
await page.keyboard.press('Enter')
await linkTo(K.tabs.mechanic, 'Stamina')
await shot('s6-06-mechanics-list-related')

// Glossary
await page.getByTestId('gamedoc-tab-glossary').click()
await page.getByRole('button', { name: GT.add }).first().click()
await page.getByLabel(GT.term, { exact: true }).first().fill('Gold')
await page.getByLabel(GT.definition, { exact: true }).first().fill('Common currency of the old empire')
await page.getByRole('button', { name: GT.save }).first().click()
await page.waitForTimeout(300)
check((await page.getByText('Common currency of the old empire').count()) > 0, 'glossary entry is listed after Save')
await shot('s6-07-glossary')

// Variables panel shows the mechanics using a variable
await openSection(page, L, L.sections.write)
await page.getByRole('button', { name: L.variables.title, exact: true }).click()
await page.getByTestId('variables-panel').waitFor()
await shot('s6-08-variables-used-by')

// delete the variable: the mechanic keeps the link and shows it as missing
await page.getByRole('button', { name: L.variables.delete.replace('{name}', 'gold') }).click()
await page.getByRole('button', { name: L.variables.deleteTitle }).first().isVisible().catch(() => {})
await shot('s6-09-delete-variable-impact')
check((await page.getByText(/mechanic/i).count()) > 0, 'delete dialog mentions the mechanic')
const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).last()
await confirm.getByRole('button', { name: /delete|usuń/i }).last().click().catch(() => {})
await page.waitForTimeout(400)
await openSection(page, L, L.sections.gamedoc)
await page.getByTestId('gamedoc-tab-mechanics').click()
await page.getByText('Stamina', { exact: true }).first().click()
check((await page.getByText(K.missing, { exact: true }).count()) > 0, 'deleted variable shows as Missing on the mechanic')
await shot('s6-10-broken-link')

console.log('errors:', [...new Set(errors)])

// =============== Polish, dark ===============
const pl = await newPage('pl-PL', 'dark')
const shotPl = shotOf(pl.page, pl.errors)
await createGame(pl.page, P, 'Kurier', 'kurier6')
await openSection(pl.page, P, P.sections.gamedoc)
await pl.page.getByTestId('gamedoc-tab-mechanics').click()
await pl.page.getByRole('button', { name: P.gamedoc.mechanicsTab.newMechanic }).first().click()
await pl.page.getByLabel(P.gamedoc.mechanicsTab.fields.title, { exact: true }).fill('Wytrzymałość')
await pl.page.keyboard.press('Enter')
await shotPl('s6-11-mechanics-pl-dark')
await pl.page.getByTestId('gamedoc-tab-overview').click()
await shotPl('s6-12-overview-pl-dark')

await browser.close()
console.log(failures ? `${failures} FAILED` : 'all checks passed')
process.exit(failures ? 1 : 0)
