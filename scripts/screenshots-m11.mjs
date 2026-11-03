// Usage: node scripts/screenshots-m11.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// Browser build only (localStorage-backed virtual folder; no native pickers).
// M11a: sample book, tour, help menu, import dialog, shortcuts, crash recovery, open-error restore, focus ring.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m11.mjs <outDir>')
mkdirSync(out, { recursive: true })
const ORIGIN = 'http://localhost:1420'
const LS = 'storyworks:'
const PFX = `${LS}project:`
const META = `${LS}projectmeta:`
const en = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/en.json'), 'utf8'))
const L = en
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })

let failures = 0
let tag = ''
const check = (c, m) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'}: [${tag}] ${m}`) }

const settingsJson = (theme, { tourSeen = true, recents = [] } = {}) =>
  JSON.stringify({
    version: 5, theme, language: 'en', uiZoom: 100, editorFontSize: 18,
    contextPanel: { hidden: false, collapsed: {} },
    recentProjects: recents.map((p) => ({ path: p, title: p, openedAt: new Date().toISOString() })),
    backups: { intervalMinutes: 30, keep: 20, onClose: true }, shortcuts: {}, tourSeen,
  })

async function session(theme, { tourSeen = true, recents = [], books = {}, extra = [], h = 800 } = {}) {
  const ls = [{ name: `${LS}settings.json`, value: settingsJson(theme, { tourSeen, recents }) }, ...extra]
  const t = String(Date.now() - 10_000)
  for (const [name, book] of Object.entries(books))
    for (const [k, v] of Object.entries(book)) {
      ls.push({ name: `${PFX}${name}/${k}`, value: v }, { name: `${META}${name}/${k}`, value: t })
    }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: h }, locale: 'en-US', storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: ls }] } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  return { ctx, page, errors }
}

const shot = async (name, s, opts = {}) => {
  await s.page.waitForTimeout(500)
  const path = join(out, `${name}.png`)
  if (opts.locator) await opts.locator.screenshot({ path })
  else if (opts.clip) await s.page.screenshot({ path, clip: opts.clip })
  else await s.page.screenshot({ path })
  console.log(`  shot ${name}.png`)
}
const errorsOk = (s, what) => {
  const bad = s.errors.filter((e) => !/favicon/.test(e))
  check(bad.length === 0, `no console errors (${what})${bad.length ? ': ' + [...new Set(bad)].join(' | ') : ''}`)
}
const nav = (s, key) => s.page.getByRole('link', { name: new RegExp(`^\\s*${L.sections[key]}`) }).first().click()
const tourDlg = (s) => s.page.locator('[role=dialog][aria-labelledby="tour-title"]')
const dumpBook = (s, name) => s.page.evaluate((p) => {
  const o = {}
  for (const [k, v] of Object.entries(localStorage)) if (k.startsWith(p)) o[k.slice(p.length)] = v
  return o
}, `${PFX}${name}/`)

/* 1. Welcome, sample book, Checks, tour (light), Help menu ------------------------ */
tag = 'sample-light'
let sampleBook
{
  const s = await session('light', { tourSeen: false })
  const { page } = s
  check(await page.getByRole('button', { name: L.welcome.openSample }).isVisible(), 'Welcome shows "Open sample book"')
  check(await page.getByRole('button', { name: L.welcome.takeTour }).isVisible(), 'Welcome shows "Take the tour"')
  await shot('welcome-light', s)
  await page.getByRole('button', { name: L.welcome.openSample }).click()
  await tourDlg(s).waitFor()
  check(true, 'tour starts by itself on first open')
  await page.getByRole('button', { name: L.tour.next }).click()
  await page.waitForTimeout(500)
  await shot('tour-light', s)
  await page.keyboard.press('Escape')
  await tourDlg(s).waitFor({ state: 'detached' })
  await page.getByRole('tree', { name: L.write.tree }).waitFor()
  await page.waitForTimeout(800)
  await shot('sample-write-light', s)
  await page.getByRole('button', { name: L.help.title }).click()
  await page.getByRole('menuitem', { name: L.help.tour }).waitFor()
  await shot('help-menu-light', s)
  await page.keyboard.press('Escape')
  await nav(s, 'checks')
  await page.getByRole('heading', { name: L.checks.title, level: 1 }).waitFor()
  await page.waitForTimeout(1200)
  const txt = await page.evaluate(() => document.body.innerText)
  const warn = (await page.locator('.q-item, li, [data-severity]').filter({ hasText: /./ }).count())
  check(!/No findings|nothing to report/i.test(txt), 'Checks page lists a finding')
  console.log('  checks text:', txt.replace(/\s+/g, ' ').slice(0, 400), warn)
  await shot('sample-checks-light', s)
  sampleBook = await dumpBook(s, 'sample-book')
  delete sampleBook['.storyworks/project.lock']
  console.log('  sample files:', Object.keys(sampleBook).length)
  errorsOk(s, 'sample'); await s.ctx.close()
}

/* 2. Import dialog ----------------------------------------------------------------- */
tag = 'import'
{
  const s = await session('light', { recents: ['sample-book'], books: { 'sample-book': sampleBook }, h: 900 })
  const { page } = s
  await page.getByRole('button', { name: L.welcome.openProject }).click()
  await page.getByRole('button', { name: 'sample-book', exact: true }).click()
  await page.getByRole('tree', { name: L.write.tree }).waitFor()
  await page.getByRole('button', { name: L.import.open }).click()
  const dlg = page.getByRole('dialog', { name: L.import.title })
  await dlg.waitFor()
  const md = `# The Arrival\n\nShe stepped off the **train** into the rain.\n\n## The Station\n\nA bell rang. *Twice.*\n\n## The Road\n\nA long walk with more words in it than before, honestly.\n\n## Side Note\n\nSomething to skip.\n\n# The Storm\n\nThunder rolled over the hills.\n`
  await page.locator('input[type=file]').setInputFiles({ name: 'draft.md', mimeType: 'text/markdown', buffer: Buffer.from(md) })
  await dlg.locator('ul.preview').waitFor()
  await dlg.getByLabel('Chapter name: The Storm').fill('The Storm Breaks')
  await dlg.getByLabel('Scene name: The Road').fill('The Long Road')
  await dlg.getByLabel('Include “Side Note”').click()
  await shot('import-preview', s)
  const summary = await dlg.innerText()
  check(/2 chapters/.test(summary), `summary counts chapters (${summary.match(/\d+ chapters?, \d+ scenes?, \d+ words? selected/)?.[0]})`)
  // invalid UTF-8
  await dlg.getByRole('button', { name: L.import.chooseOther }).waitFor()
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.txt', mimeType: 'text/plain', buffer: Buffer.from([0x48, 0x69, 0xff, 0xfe, 0x20, 0x80]) })
  await dlg.getByText(/not valid UTF-8/).waitFor()
  check(true, 'invalid UTF-8 error shown')
  await shot('import-invalid-utf8', s)
  errorsOk(s, 'import'); await s.ctx.close()
}

/* 3. Tour dark ----------------------------------------------------------------------- */
tag = 'tour-dark'
{
  const s = await session('dark', { tourSeen: false })
  const { page } = s
  await page.getByRole('button', { name: L.welcome.openSample }).click()
  await tourDlg(s).waitFor()
  await page.getByRole('button', { name: L.tour.next }).click()
  await page.waitForTimeout(500)
  await shot('tour-dark', s)
  await page.keyboard.press('Escape')
  errorsOk(s, 'tour dark'); await s.ctx.close()
}

/* 4. Shortcut overlay and rebinding conflict ----------------------------------------- */
tag = 'shortcuts'
{
  const s = await session('light', { recents: ['sample-book'], books: { 'sample-book': sampleBook }, h: 900 })
  const { page } = s
  await page.getByRole('button', { name: L.welcome.openProject }).click()
  await page.getByRole('button', { name: 'sample-book', exact: true }).click()
  await page.getByRole('tree', { name: L.write.tree }).waitFor()
  await page.keyboard.press('Control+/')
  await page.getByRole('dialog', { name: L.shortcuts.overlayTitle }).waitFor()
  await shot('shortcut-overlay', s)
  await page.keyboard.press('Escape')
  await nav(s, 'settings')
  await page.getByRole('heading', { name: L.settings.title, level: 1 }).waitFor()
  const grp = page.locator('#shortcuts')
  await grp.scrollIntoViewIfNeeded()
  await grp.getByRole('button', { name: L.shortcuts.actions.search }).click()
  await page.keyboard.press('Control+P')
  await page.waitForTimeout(300)
  const msg = await grp.locator('.msg').innerText()
  check(/already used/.test(msg), `conflict message shown (${msg})`)
  await page.setViewportSize({ width: 1280, height: 1100 })
  await grp.scrollIntoViewIfNeeded()
  await shot('settings-shortcuts-conflict', s)
  errorsOk(s, 'shortcuts'); await s.ctx.close()
}

/* 5. Crash recovery and open-error restore --------------------------------------------- */
tag = 'crash'
{
  const marker = { name: `${LS}running.json`, value: JSON.stringify({ pid: 5, startedAt: 1, lastBook: 'sample-book' }) }
  const s = await session('light', { recents: ['sample-book'], books: { 'sample-book': sampleBook }, extra: [marker] })
  const { page } = s
  await page.getByRole('alertdialog', { name: L.safety.crash.title }).waitFor()
  check(true, 'crash recovery dialog shown for a stale marker')
  await shot('crash-recovery', s)
  errorsOk(s, 'crash'); await s.ctx.close()
}
tag = 'open-error'
{
  const bad = { ...sampleBook }
  const stamp = 'auto-2026-11-02T18-30-00-000Z'
  for (const [k, v] of Object.entries(sampleBook)) if (!k.startsWith('.storyworks/')) bad[`.storyworks/backups/${stamp}/${k}`] = v
  bad['project.json'] = '{ "version": 12, "title": '
  const s = await session('light', { recents: ['sample-book'], books: { 'sample-book': bad } })
  const { page } = s
  await page.getByRole('button', { name: L.welcome.openProject }).click()
  await page.getByRole('button', { name: 'sample-book', exact: true }).click()
  await page.getByRole('button', { name: L.safety.crash.restore }).waitFor()
  check(true, 'open-error dialog offers "Restore latest backup"')
  await shot('open-error-restore', s)
  errorsOk(s, 'open error'); await s.ctx.close()
}

/* 6. Focus ring on a Settings control ------------------------------------------------------ */
for (const theme of ['light', 'dark']) {
  tag = `focus-${theme}`
  const s = await session(theme, { recents: ['sample-book'], books: { 'sample-book': sampleBook }, h: 900 })
  const { page } = s
  await page.getByRole('button', { name: L.welcome.openProject }).click()
  await page.getByRole('button', { name: 'sample-book', exact: true }).click()
  await page.getByRole('tree', { name: L.write.tree }).waitFor()
  await nav(s, 'settings')
  await page.getByRole('heading', { name: L.settings.title, level: 1 }).waitFor()
  await page.waitForTimeout(500)
  // Tab until a Quasar button/toggle (class no-outline) has keyboard focus
  let found = false
  for (let i = 0; i < 40 && !found; i++) {
    await page.keyboard.press('Tab')
    found = await page.evaluate(() => document.activeElement?.classList.contains('no-outline') ?? false)
  }
  check(found, 'Tab reaches a Quasar control')
  const ring = await page.evaluate(() => {
    const el = document.activeElement
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return { outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, x: r.x, y: r.y, w: r.width, h: r.height, label: (el.getAttribute('aria-label') || el.innerText || '').slice(0, 30) }
  })
  console.log('  focused:', JSON.stringify(ring))
  check(/solid/.test(ring.outline) && !/0px/.test(ring.outline), `visible focus outline (${ring.outline})`)
  const pad = 160
  await shot(`focus-ring-${theme}`, s, { clip: { x: Math.max(0, ring.x - pad), y: Math.max(0, ring.y - 60), width: 640, height: 200 } })
  errorsOk(s, 'focus'); await s.ctx.close()
}

await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASS')
process.exit(failures ? 1 : 0)
