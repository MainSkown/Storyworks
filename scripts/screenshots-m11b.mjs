// Usage: node scripts/screenshots-m11b.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// Browser build only. M11b: sample chooser, sample screenplay and game, tours, glossary focus.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m11b.mjs <outDir>')
mkdirSync(out, { recursive: true })
const ORIGIN = 'http://localhost:1420'
const root = join(import.meta.dirname, '..')
const loc = { en: JSON.parse(readFileSync(join(root, 'src/locales/en.json'), 'utf8')), pl: JSON.parse(readFileSync(join(root, 'src/locales/pl.json'), 'utf8')) }
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })

let failures = 0
let tag = ''
const check = (c, m) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'}: [${tag}] ${m}`) }

const settingsJson = (theme, language, tourSeen) =>
  JSON.stringify({
    version: 5, theme, language, uiZoom: 100, editorFontSize: 18,
    contextPanel: { hidden: false, collapsed: {} }, recentProjects: [],
    backups: { intervalMinutes: 30, keep: 20, onClose: true }, shortcuts: {}, tourSeen,
  })

async function session(theme = 'light', lang = 'en', tourSeen = true) {
  const ls = [{ name: 'storyworks:settings.json', value: settingsJson(theme, lang, tourSeen) }]
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    locale: lang === 'pl' ? 'pl-PL' : 'en-US',
    colorScheme: theme,
    storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: ls }] },
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  return { ctx, page, errors, L: loc[lang] }
}
const shot = async (name, s) => {
  await s.page.waitForTimeout(500)
  await s.page.screenshot({ path: join(out, `${name}.png`) })
  console.log(`  shot ${name}.png`)
}
const errorsOk = (s, what) => {
  const bad = s.errors.filter((e) => !/favicon/.test(e))
  check(bad.length === 0, `no console errors (${what})${bad.length ? ': ' + [...new Set(bad)].join(' | ') : ''}`)
}
const openChooser = async (s) => {
  await s.page.getByRole('button', { name: s.L.welcome.openSample }).click()
  const dlg = s.page.getByRole('dialog', { name: s.L.welcome.sampleTitle })
  await dlg.waitFor()
  return dlg
}
const openSample = async (s, kind) => {
  const dlg = await openChooser(s)
  await dlg.getByRole('button', { name: new RegExp('^\\s*' + s.L.welcome.sample[kind].title) }).click()
  await s.page.getByRole('navigation').or(s.page.locator('[data-tour-section]').first()).first().waitFor()
  await s.page.locator('[data-tour-section="write"]').first().waitFor()
  await s.page.waitForTimeout(1200)
}
const nav = (s, key) => s.page.getByRole('link', { name: new RegExp(`^\\s*${s.L.sections[key]}`) }).first().click()
const tourDlg = (s) => s.page.locator('[role=dialog][aria-labelledby="tour-title"]')
const skipTour = async (s) => {
  if (await s.page.locator('.tour-root').count()) { await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(400) }
}

/* 1. Welcome chooser: light, dark, PL --------------------------------------------- */
for (const [name, theme, lang] of [['01-welcome-chooser', 'light', 'en'], ['01-welcome-chooser-dark', 'dark', 'en'], ['01-welcome-chooser-pl', 'light', 'pl']]) {
  tag = name
  const s = await session(theme, lang)
  const dlg = await openChooser(s)
  const n = await dlg.locator('.sample-option').count()
  check(n === 3, `chooser lists 3 samples (got ${n})`)
  for (const k of ['book', 'screenplay', 'game'])
    check(await dlg.getByText(s.L.welcome.sample[k].title, { exact: true }).isVisible(), `option ${k} shown in ${lang}`)
  await shot(name, s)
  errorsOk(s, name); await s.ctx.close()
}

/* 2. Screenplay sample: Write view with a scene ------------------------------------ */
tag = 'screenplay'
{
  const s = await session()
  await openSample(s, 'screenplay')
  await s.page.getByRole('heading', { name: /./ }).first().waitFor().catch(() => {})
  const tree = s.page.getByRole('tree', { name: s.L.write.tree })
  await tree.waitFor()
  const items = tree.getByRole('treeitem')
  check((await items.count()) >= 3, `outline has items (${await items.count()})`)
  // open the first scene (a leaf)
  const scene = s.page.locator('[role=treeitem]:not([aria-expanded])').first()
  await scene.click()
  await s.page.locator('.ProseMirror').first().waitFor()
  await s.page.waitForTimeout(800)
  check((await s.page.locator('.ProseMirror').first().innerText()).trim().length > 20, 'scene has script text')
  await shot('02-sample-screenplay', s)

  /* 7. tour on a screenplay step (Fountain and PDF -> Export) */
  tag = 'tour-screenplay'
  await s.page.getByRole('button', { name: s.L.help.title }).or(s.page.getByRole('button', { name: /help/i })).first().click().catch(() => {})
  await s.page.getByRole('menuitem', { name: s.L.help.tour }).click()
  await tourDlg(s).waitFor()
  for (let i = 0; i < 3; i++) { await s.page.getByRole('button', { name: s.L.tour.next }).click(); await s.page.waitForTimeout(300) }
  const title = await tourDlg(s).locator('#tour-title').innerText()
  check(title === s.L.tour.steps.screenplayFountain.title, `tour on Fountain step ("${title}")`)
  await shot('07-tour-screenplay', s)
  await skipTour(s)
  errorsOk(s, 'screenplay'); await s.ctx.close()
}

/* 3-6, 8, 9. Game sample ----------------------------------------------------------- */
tag = 'game'
{
  const s = await session()
  await openSample(s, 'game')
  const L = s.L
  const tree = s.page.getByRole('tree', { name: L.write.tree })
  await tree.waitFor()
  // open a conversation: first tree item whose canvas shows nodes
  const leaves = s.page.locator('[role=treeitem]:not([aria-expanded])')
  const count = await leaves.count()
  let opened = false
  for (let i = 0; i < count && !opened; i++) {
    await leaves.nth(i).click()
    await s.page.waitForTimeout(700)
    if ((await s.page.locator('.vue-flow__node, [data-graph-node], [data-conv-node]').count()) > 0) opened = true
  }
  check(opened, 'a conversation canvas with nodes opened')
  if (opened) await s.page.getByRole('button', { name: L.timelineView.fit }).click().catch(() => {})
  await shot('03-sample-game', s)

  tag = 'storymap'
  await nav(s, 'storymap')
  await s.page.waitForTimeout(1200)
  await s.page.getByRole('button', { name: L.timelineView.fit }).click().catch(() => {})
  check((await s.page.locator('[data-graph-node]').count()) >= 3, `story map has nodes (${await s.page.locator('[data-graph-node]').count()})`)
  await shot('04-sample-storymap', s)

  tag = 'gamedoc-mechanics'
  await nav(s, 'gamedoc')
  await s.page.getByTestId('gamedoc-tab-mechanics').click()
  await s.page.getByTestId('gamedoc-mechanics').waitFor()
  const mechs = s.page.locator('[data-mech]')
  check((await mechs.count()) === 5, `5 mechanics listed (${await mechs.count()})`)
  await mechs.nth(1).click()
  await s.page.waitForTimeout(500)
  check((await mechs.nth(1).getAttribute('aria-current')) === 'true', 'one mechanic selected')
  await shot('05-sample-gamedoc-mechanics', s)

  tag = 'checks-game'
  await nav(s, 'checks')
  await s.page.waitForTimeout(1500)
  if ((await s.page.locator('li.row').count()) === 0) {
    await s.page.getByRole('button', { name: L.checks.run }).click()
    await s.page.waitForTimeout(2000)
  }
  const nFind = await s.page.locator('li.row').count()
  check(nFind === 1, `Checks shows exactly 1 finding (${nFind})`)
  await shot('06-sample-checks-game', s)

  tag = 'glossary-focus'
  await nav(s, 'gamedoc')
  await s.page.getByTestId('gamedoc-tab-glossary').click()
  await s.page.getByTestId('gamedoc-glossary').waitFor()
  const editBtn = s.page.locator('[data-entry] [data-edit]').first()
  await editBtn.waitFor()
  await editBtn.click()
  const termInput = s.page.getByLabel(L.gamedoc.glossaryTab.term, { exact: true })
  await termInput.waitFor()
  await s.page.keyboard.press('Tab') // focus ring on a keyboard-reached field
  await s.page.keyboard.press('Shift+Tab')
  check(await termInput.evaluate((el) => el === document.activeElement), 'term field focused in edit mode')
  const ring = await termInput.evaluate((el) => { const c = getComputedStyle(el); return `${c.outlineStyle}/${c.outlineWidth}/${c.boxShadow}` })
  check(/^solid\/[1-9]/.test(ring) || /rgb/.test(ring.split('/')[2]), `visible focus style (${ring})`)
  await shot('09-glossary-focus', s)
  errorsOk(s, 'game'); await s.ctx.close()
}

/* 8. Game tour on the game-document step ------------------------------------------- */
tag = 'tour-game'
{
  const s = await session('light', 'en', false)
  await openSample(s, 'game')
  await tourDlg(s).waitFor()
  check(true, 'tour starts by itself on first open')
  for (let i = 0; i < 4; i++) { await s.page.getByRole('button', { name: s.L.tour.next }).click(); await s.page.waitForTimeout(300) }
  const title = await tourDlg(s).locator('#tour-title').innerText()
  check(title === s.L.tour.steps.gameDocument.title, `tour on Game document step ("${title}")`)
  await shot('08-tour-game', s)
  errorsOk(s, 'tour game'); await s.ctx.close()
}

await browser.close()
console.log(failures === 0 ? '\nPASS: all checks' : `\nFAIL: ${failures} check(s) failed`)
process.exit(failures ? 1 : 0)
