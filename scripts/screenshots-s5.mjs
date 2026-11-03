// Usage: node scripts/screenshots-s5.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// Browser build only. S5: cross-links, story map, routes, cross-item play-through.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-s5.mjs <outDir>')
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


const C = L.game.conversation
const X = L.game.crossLink
const S = L.storymap
const SP = L.game.storyPlay

// =============== English, light ===============
const { page, errors } = await newPage('en-US')
const shot = shotOf(page, errors)
await createGame(page, L, 'Gate Watch', 'gatewatch5')
const tree = page.getByRole('tree', { name: L.write.tree })
const rename = async (name) => { await page.locator('input.rename').fill(name); await page.keyboard.press('Enter'); await page.waitForTimeout(500) }
const insp = page.getByRole('complementary', { name: C.inspector })
const ed = () => insp.locator('.ProseMirror')
const A = (k) => page.getByRole('button', { name: C.addOf.replace('{type}', C.type[k]) })
const fit = async () => { await page.getByRole('button', { name: L.timelineView.fit }).click(); await page.waitForTimeout(300) }

// variable
await page.getByRole('button', { name: L.variables.title, exact: true }).click()
const vp = page.getByTestId('variables-panel')
await vp.waitFor()
await vp.locator('form.add input[type=text]').fill('metCaptain')
await vp.locator('form.add select').selectOption('flag')
await vp.getByRole('button', { name: L.variables.add }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: L.variables.title, exact: true }).click().catch(() => {})

// script Briefing
await page.getByRole('button', { name: L.outline.addScript, exact: true }).click()
await rename('Briefing')
await page.locator('.ProseMirror').first().click()
await page.keyboard.type('The east gate falls at dawn.')
await page.waitForTimeout(600)

// conversation Captain: Lines, End
await page.getByRole('button', { name: L.outline.addConversation, exact: true }).click()
await rename('Captain')
await page.getByRole('button', { name: C.addFirst }).click()
await insp.waitFor()
await ed().click()
await page.keyboard.type('Good. Hold the gate.')
await page.waitForTimeout(600)
await A('end').click()
await page.waitForTimeout(500)

// conversation Guard: Lines -> Choice (two options)
await page.getByRole('button', { name: L.outline.addConversation, exact: true }).click()
await rename('Guard')
await page.getByRole('button', { name: C.addFirst }).click()
await insp.waitFor()
await ed().click()
await page.keyboard.type('Halt! Who goes there?')
await page.waitForTimeout(600)
await A('choice').click()
await page.waitForTimeout(500)
for (let i = 0; i < 2; i++) { await insp.getByRole('button', { name: C.options.add }).click(); await page.waitForTimeout(200) }
// option texts and cross-links
const optText = (n) => insp.getByLabel(C.options.text.replace('{n}', n))
await optText(1).fill('Report to the captain')
await optText(2).fill('Read the briefing')
const linkOpt = async (n, item) => {
  await insp.getByLabel(new RegExp('^' + X.mode + '.*' + n + '\\)?$')).selectOption({ label: X.anotherItem })
  const sel = insp.getByLabel(new RegExp('^' + X.item + '.*' + n + '\\)?$'))
  const value = await sel.evaluate((el, t) => [...el.options].find((o) => o.textContent.trim().startsWith(t))?.value, item)
  await sel.selectOption(value)
  await page.waitForTimeout(300)
}
await linkOpt(1, 'Captain')
await shot('01-option-link-picker')
await linkOpt(2, 'Briefing')
await fit()
await shot('02-guard-with-links')
check((await page.locator('[data-graph-node]').filter({ hasText: 'Captain' }).count()) >= 1, 'card shows a link chip to Captain')

// story map
await page.getByRole('link', { name: L.sections.storymap }).or(page.getByRole('button', { name: L.sections.storymap })).first().click()
await page.waitForTimeout(1500)
await shot('03-story-map')
await page.getByRole('button', { name: L.timelineView.list, exact: true }).click()
await shot('04-story-map-list')

// manual arrow Captain -> Briefing through the list view
const ctxp = page.locator('.context-panel')
const field = page.locator('.q-field').filter({ hasText: L.graph.list.pickOut })
await field.nth(1).click()
await page.locator('.q-menu .q-item').filter({ hasText: 'Briefing' }).first().click()
await page.getByRole('button', { name: L.graph.list.connect, exact: true }).nth(2).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: L.timelineView.canvas, exact: true }).click()
await page.waitForTimeout(400)
await fit()
const box = (t) => page.locator('[data-graph-node]').filter({ hasText: t }).first()
await box('Captain').click()
await page.waitForTimeout(300)
// start mark on Guard
await box('Guard').click()
await page.waitForTimeout(300)
await ctxp.getByLabel(S.inspector.start).check()
await page.waitForTimeout(300)
await shot('05-box-inspector-start')
// condition on the manual arrow
await box('Captain').click()
await page.waitForTimeout(300)
await ctxp.getByRole('button', { name: S.inspector.selectArrow.replace('{title}', 'Briefing') }).click()
await page.waitForTimeout(300)
await ctxp.getByRole('button', { name: C.condition.add }).click()
await page.waitForTimeout(400)
await shot('06-arrow-condition')
// derived arrow inspector: a derived arrow only appears via the box list; add a beat too
await page.getByRole('button', { name: S.addBeat }).click()
await page.waitForTimeout(500)
await page.locator('#storymap-beat-text').fill('Dawn: the east gate falls')
await page.locator('#storymap-beat-text').blur()
await page.waitForTimeout(500)
await fit()
await shot('07-story-map-beat-and-condition')

// option 1 of Guard sets metCaptain, so the arrow condition can open
const goWrite = async (name) => {
  await page.getByRole('link', { name: L.sections.write }).click()
  await page.waitForTimeout(500)
  await tree.getByRole('treeitem').filter({ hasText: name }).click()
  await page.waitForTimeout(600)
}
await goWrite('Guard')
await fit()
await page.locator('[data-graph-node]').filter({ hasText: 'Choice' }).first().click()
await page.waitForTimeout(400)
const o1 = insp.locator('.opt').nth(0)
await o1.getByRole('button', { name: C.setOps.add }).click()
await page.waitForTimeout(250)
await o1.getByRole('group', { name: new RegExp(C.optionSets) }).getByLabel(C.condition.value + ' 1').selectOption('true')
await page.waitForTimeout(400)

// a route: a branch on the timeline
await page.getByRole('link', { name: L.sections.timelines }).click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: L.timelineView.addEvent }).click()
await page.waitForTimeout(600)
const tctx = page.locator('.context-panel')
await tctx.getByRole('button', { name: L.timelines.inspector.newBranch, exact: true }).click()
await page.waitForTimeout(300)
await tctx.getByLabel(L.timelines.inspector.branchName).fill('Route A')
await tctx.getByRole('button', { name: L.timelines.inspector.createBranch }).click()
await page.waitForTimeout(600)

// tag items with the route
await page.getByRole('link', { name: L.sections.storymap }).click()
await page.waitForTimeout(1200)
await fit()
await box('Guard').click()
await page.waitForTimeout(300)
await ctxp.getByRole('checkbox', { name: /Route A/ }).check()
await box('Captain').click()
await page.waitForTimeout(300)
await ctxp.getByRole('checkbox', { name: /Route A/ }).check()
await page.waitForTimeout(400)
await shot('08-routes-tagged')
await page.getByLabel(S.routeFilter).click()
await page.locator('.q-menu .q-item').filter({ hasText: 'Route A' }).first().click()
await page.waitForTimeout(400)
await shot('09-route-filter')
await page.getByLabel(S.routeFilter).click()
await page.locator('.q-menu .q-item').filter({ hasText: S.allRoutes }).first().click()

// ---- play-through across items ----
await page.getByRole('button', { name: S.play }).click()
const play = page.locator('.play-panel')
await play.waitFor()
await page.waitForTimeout(800)
await play.getByRole('button', { name: C.playthrough.continue }).click()
await page.waitForTimeout(300)
await play.getByRole('button', { name: /Report to the captain/ }).click()
await page.waitForTimeout(300)
await play.getByRole('button', { name: C.playthrough.continue }).click()
await page.waitForTimeout(400)
await shot('10-playthrough-item-end')
const btn = play.getByRole('button', { name: SP.continueTo.replace('{title}', 'Briefing') })
check(await btn.count() === 1, 'arrow offered once metCaptain is true')
await btn.click()
await page.waitForTimeout(300)
await play.getByRole('button', { name: C.playthrough.continue }).click().catch(() => {})
await page.waitForTimeout(400)
await shot('11-playthrough-ended')
check((await play.innerText()).includes('metCaptain'), 'variable table lists metCaptain')

// ---- delete the target: broken, then restored ----
await goWrite('Captain')
await tree.getByRole('treeitem').filter({ hasText: 'Captain' }).getByRole('button', { name: new RegExp(L.write.delete) }).click()
const dlg = page.getByRole('alertdialog')
await dlg.waitFor()
await shot('12-delete-impact')
await dlg.getByRole('button').last().click()
await page.waitForTimeout(700)
await goWrite('Guard')
await fit()
await page.locator('[data-graph-node]').filter({ hasText: 'Choice' }).first().click()
await page.waitForTimeout(500)
await shot('13-broken-link')
await page.getByRole('link', { name: L.sections.storymap }).click()
await page.waitForTimeout(1200)
await shot('14-story-map-trashed-box')
await page.getByRole('button', { name: L.sidebar.trash, exact: true }).click()
const td = page.getByRole('dialog', { name: L.trash.title })
await td.waitFor()
await td.getByRole('button', { name: L.trash.restoreItem.replace('{title}', 'Captain') }).click()
await page.waitForTimeout(800)
await td.getByRole('button', { name: L.trash.close }).click().catch(() => page.keyboard.press('Escape'))
await page.waitForTimeout(500)
await shot('15-story-map-restored')

// ---- Polish, dark ----
{
  await page.waitForTimeout(1200)
  const entries = Object.fromEntries(Object.entries(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).filter(([k]) => k.startsWith('storyworks:project')))
  const settings = JSON.stringify({ version: 5, theme: 'dark', language: 'pl', uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: [], backups: { intervalMinutes: 30, keep: 20, onClose: true }, shortcuts: {}, tourSeen: true })
  const c2 = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'pl-PL', colorScheme: 'dark' })
  await c2.addInitScript(([e, st]) => { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1'); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); localStorage.setItem('storyworks:settings.json', st) }, [entries, settings])
  const p2 = await c2.newPage()
  p2.setDefaultTimeout(8000)
  const e2 = []
  p2.on('pageerror', (e) => e2.push(e.message))
  p2.on('console', (m) => m.type() === 'error' && e2.push(m.text()))
  const shot2 = shotOf(p2, e2)
  await p2.goto(`${ORIGIN}/`)
  await p2.getByRole('heading', { level: 1 }).first().waitFor()
  await p2.getByRole('button', { name: P.welcome.openProject ?? 'Otwórz projekt' }).click()
  await p2.getByRole('dialog').getByRole('button', { name: 'gatewatch5' }).click()
  await p2.getByRole('heading', { name: 'Gate Watch' }).first().waitFor({ timeout: 6000 }).catch(() => {})
  await p2.waitForTimeout(1200)
  if (await p2.locator('.tour-root').count()) { await p2.keyboard.press('Escape'); await p2.waitForTimeout(400) }
  await p2.getByRole('link', { name: P.sections.storymap }).click()
  await p2.waitForTimeout(1200)
  await p2.getByRole('button', { name: P.timelineView.fit }).click()
  await p2.waitForTimeout(400)
  await p2.locator('[data-graph-node]').filter({ hasText: 'Guard' }).first().click()
  await p2.waitForTimeout(400)
  await shot2('16-story-map-pl-dark')
  await p2.getByRole('button', { name: P.storymap.play }).click()
  await p2.waitForTimeout(900)
  await p2.locator('.play-panel').getByRole('button', { name: P.game.conversation.playthrough.continue }).click()
  await p2.waitForTimeout(400)
  await shot2('17-playthrough-pl-dark')
  await c2.close()
}
await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASS')
