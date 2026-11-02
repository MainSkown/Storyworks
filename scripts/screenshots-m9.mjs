// Usage: node scripts/screenshots-m9.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// BEFORE_ORIGIN=http://localhost:1421 node scripts/screenshots-m9.mjs <outDir>  -> only the "before" screens, from an older build.
// Browser build only (memory history engine). Drives snapshots, partial snapshots, History, restore, Backups.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m9.mjs <outDir>')
mkdirSync(out, { recursive: true })
const BEFORE = process.env.BEFORE_ORIGIN
const ORIGIN = BEFORE ?? 'http://localhost:1420'
const SETTINGS_KEY = 'storyworks:settings.json'
const PFX = 'storyworks:project:'
const META = 'storyworks:projectmeta:'
const en = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/en.json'), 'utf8'))
const pl = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/pl.json'), 'utf8'))
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })

let failures = 0
let tag = ''
const check = (c, m) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'}: [${tag}] ${m}`) }

const GIT_WORDS = /\b(commits?|committed|stage|staged|staging|branch(?:es)?|HEAD|hash(?:es)?|git|libgit2|repository)\b/i
const settingsJson = (theme, language, recents) =>
  JSON.stringify({ version: 2, theme, language, uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: recents.map((p) => ({ path: p, title: p, openedAt: new Date().toISOString() })) })

async function bootBase() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
  const page = await ctx.newPage()
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: 'New project' }).click()
  const dlg = page.getByRole('dialog', { name: 'New project' })
  await dlg.getByLabel('Book title').fill('The Long Road')
  await dlg.getByLabel('Author').fill('Mara Quill')
  await dlg.getByLabel('Project name').fill('base')
  await dlg.getByRole('button', { name: 'Create project' }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await page.waitForTimeout(1800)
  const d = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  await ctx.close()
  const book = {}
  for (const [k, v] of Object.entries(d)) if (k.startsWith(`${PFX}base/`)) book[k.slice(`${PFX}base/`.length)] = v
  delete book['.storyworks/project.lock']
  return book
}

const T = (text) => ({ type: 'text', text })
const P = (id, text) => ({ type: 'paragraph', attrs: { id, textAlign: 'left' }, content: [T(text)] })

/** The Siege: Walls, Gate, Tower. The Aftermath: Quiet. */
function buildBook(baseBook) {
  const out = { ...baseBook }
  const m = JSON.parse(baseBook['project.json'])
  const scene = (id, title, text) => {
    out[`manuscript/${id}.json`] = JSON.stringify({ version: 3, id, title, status: 'draft', synopsis: '', wordCount: 8, content: { type: 'doc', content: [P(`${id}-b`, text)] }, todos: [], comments: [], links: [] }, null, 1)
    return { id, type: 'scene', title, path: `manuscript/${id}.json`, children: [] }
  }
  m.manuscript = [
    { id: 'ch-1', type: 'chapter', title: 'The Siege', children: [scene('s-walls', 'Walls', 'Aldric stood on the wall.'), scene('s-gate', 'Gate', 'The gate held until dawn.'), scene('s-tower', 'Tower', 'The tower burned all night.')] },
    { id: 'ch-2', type: 'chapter', title: 'The Aftermath', children: [scene('s-quiet', 'Quiet', 'The camp was quiet.')] },
  ]
  for (const p of Object.keys(out)) if (p.startsWith('manuscript/') && !m.manuscript.flatMap((c) => c.children).some((s) => s.path === p)) delete out[p]
  out['project.json'] = JSON.stringify(m, null, 1)
  return out
}

const seedStorage = (name, book, theme, language, extra = {}) => {
  const ls = [{ name: SETTINGS_KEY, value: settingsJson(theme, language, [name]) }]
  const t = String(Date.now() - 10_000)
  for (const [k, v] of Object.entries({ ...book, ...extra })) { ls.push({ name: `${PFX}${name}/${k}`, value: v }); ls.push({ name: `${META}${name}/${k}`, value: t }) }
  return { cookies: [], origins: [{ origin: ORIGIN, localStorage: ls }] }
}

async function openBook(name, book, theme, language, { extra, readOnly } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: language === 'pl' ? 'pl-PL' : 'en-US', storageState: seedStorage(name, book, theme, language, extra) })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  const L = language === 'pl' ? pl : en
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: L.welcome.openProject }).click()
  await page.getByRole('button', { name, exact: true }).click()
  if (readOnly) await page.getByRole('alertdialog').getByRole('button', { name: L.project.lock.openReadOnly }).click()
  await page.getByRole('tree', { name: L.write.tree }).waitFor()
  await page.waitForTimeout(900)
  return { ctx, page, errors, L, name }
}

const scan = async (s, name) => {
  const text = await s.page.evaluate(() => document.body.innerText)
  const hit = text.match(GIT_WORDS)
  check(!hit, `no git word on "${name}"${hit ? ` (found "${hit[0]}")` : ''}`)
}
const shot = async (name, s, { scanWords = true } = {}) => {
  await s.page.waitForTimeout(400)
  await s.page.screenshot({ path: join(out, `${name}.png`), fullPage: true })
  if (scanWords) await scan(s, name)
  console.log(`${name}${s.errors.length ? ' ERRORS ' + [...new Set(s.errors)] : ' ok'}`)
}

// ---- navigation and editing helpers ----
const nav = (s, key) => s.page.getByRole('link', { name: new RegExp(`^\\s*${s.L.sections[key]}`) }).first().click()
const histTab = async (s, tab) => { await s.page.getByRole('tab', { name: s.L.history.tabs[tab] }).click(); await s.page.waitForTimeout(300) }
async function goHistory(s, tab = 'changes') {
  await nav(s, 'history')
  await s.page.getByRole('heading', { name: s.L.history.title, level: 1 }).waitFor()
  await histTab(s, tab)
  await s.page.waitForTimeout(500)
}
const goWrite = async (s) => { await nav(s, 'write'); await s.page.getByRole('tree', { name: s.L.write.tree }).waitFor() }
const row = (s, re) => s.page.getByRole('tree', { name: s.L.write.tree }).getByRole('treeitem', { name: re }).first()
const store = (s, path) => s.page.evaluate((k) => localStorage.getItem(k), `${PFX}${s.name}/${path}`)
const manifest = async (s) => JSON.parse(await store(s, 'project.json'))
const pageText = (s) => s.page.evaluate(() => document.body.innerText)

async function editScene(s, re, text) {
  await row(s, re).click()
  const pm = s.page.locator('.ProseMirror').first()
  await pm.waitFor()
  await pm.click()
  await s.page.keyboard.press('Control+End')
  await s.page.keyboard.type(text)
  await s.page.waitForTimeout(1800)
}
async function renameRow(s, re, to) {
  const r = row(s, re)
  await r.click()
  await r.focus()
  await s.page.keyboard.press('F2')
  await s.page.keyboard.press('Control+A')
  await s.page.keyboard.type(to)
  await s.page.keyboard.press('Enter')
  await s.page.waitForTimeout(1500)
}
async function addScene(s, chapterRe, title) {
  await row(s, chapterRe).click()
  await s.page.getByRole('button', { name: s.L.write.addScene }).click()
  await s.page.waitForTimeout(400)
  await renameRow(s, new RegExp(s.L.write.newScene), title)
}
async function deleteRow(s, re) {
  const r = row(s, re)
  await r.click()
  await r.focus()
  await s.page.keyboard.press('Delete')
  await s.page.getByRole('alertdialog').getByRole('button', { name: s.L.write.delete }).click()
  await s.page.waitForTimeout(1500)
}
const snapAll = async (s, message) => {
  if (message) await s.page.getByLabel(s.L.history.changes.message).fill(message)
  await s.page.getByRole('button', { name: s.L.history.changes.snapshotAll }).click()
  await s.page.getByText(s.L.history.changes.done).waitFor()
  await s.page.waitForTimeout(500)
}
const snapItem = (s, name) => s.page.locator('button.snap', { hasText: name })
const itemRow = (s, re) => s.page.locator('li.item', { hasText: re })
const confirmDlg = (s) => s.page.getByRole('alertdialog')

/** Light/en gets every check; the other variants only the main screens. */
async function flow(theme, language) {
  tag = `${theme}-${language}`
  const full = theme === 'light' && language === 'en'
  const N = (n) => `${n}-${theme}-${language}`
  const s = await openBook('main', buildBook(await bootBase()), theme, language)
  const { page, L } = s

  // ---- first snapshot: everything is "added"; Snapshot all empties Changes ----
  await goHistory(s)
  const never = await pageText(s)
  check(never.includes(L.history.changes.never), 'no snapshot yet: explanatory note shown')
  check(never.includes('The Siege – Walls') || never.includes('The Siege'), 'items are listed with plain-word labels')
  await snapAll(s, 'Draft one')
  check((await pageText(s)).includes(L.history.changes.empty), 'Snapshot all changes: Changes panel empty')
  if (full) await shot(N('03-changes-empty'), s)

  // ---- changes of several kinds ----
  await goWrite(s)
  await editScene(s, /Walls/, ' EDITED-WALLS')
  await editScene(s, /Gate/, ' EDITED-GATE')
  await editScene(s, /Tower/, ' EDITED-TOWER')
  if (full) {
    await renameRow(s, /The Aftermath/, 'Aftermath')
    await addScene(s, /The Siege/, 'Beacon')
    await deleteRow(s, /Quiet/)
  }
  // Walls moves one place down (Alt+Down), so it is "edited, moved".
  await row(s, /Walls/).focus()
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForTimeout(1800)
  if (full) {
    const st = await pageText(s)
    check(/\d+ changes? since the last snapshot/.test(st), 'Write status bar shows the change count')
    await row(s, /Tower/).click()
    await page.waitForTimeout(800)
    await shot(N('12-write-statusbar-header'), s)
  }

  if (full) {
    await page.getByRole('button', { name: L.history.dialog.button, exact: true }).click()
    await page.getByRole('dialog', { name: L.history.dialog.title }).waitFor()
    await shot(N('02-snapshot-dialog'), s)
    await page.getByRole('button', { name: L.history.dialog.cancel }).click()
  }

  await goHistory(s)
  let t = await pageText(s)
  check(/Walls/.test(t), 'Walls is listed')
  if (full) {
    for (const x of ['Gate: edited', 'Tower: edited', 'Aftermath: renamed', 'Beacon: added', 'Quiet: deleted']) check(t.includes(x), `Changes lists "${x}"`)
    check(/Walls: edited, moved/.test(t), 'Walls is "edited, moved" (only the moved scene is flagged)')
    check(!/Gate: .*moved/.test(t) && !/Tower: .*moved/.test(t), 'neighbours of the moved scene are not flagged')
  }

  // ---- partial snapshot: tick only Walls and Gate ----
  await page.getByRole('button', { name: L.history.changes.selectNone }).click()
  await page.getByRole('checkbox', { name: /Walls/ }).check()
  await page.getByRole('checkbox', { name: /Gate/ }).check()
  check(await page.getByRole('button', { name: L.history.changes.snapshotSelected.replace('{n}', '2') }).isEnabled(), '"Snapshot selected (2)" enabled')
  await shot(N('01-history-changes-partial'), s)
  await page.getByLabel(L.history.changes.message).fill('Two scenes')
  await page.getByRole('button', { name: L.history.changes.snapshotSelected.replace('{n}', '2') }).click()
  await page.getByText(L.history.changes.done).waitFor()
  await page.waitForTimeout(500)
  t = await pageText(s)
  check(t.includes(`Tower: ${L.history.kind.modified}`), 'third scene (Tower) is still listed as changed')
  check(!t.includes(`Gate: ${L.history.kind.modified}`) && !t.includes(`Walls: ${L.history.kind.modified}`), 'Walls and Gate are no longer listed')
  if (full) check(/Beacon: added/.test(t) && /Aftermath: renamed/.test(t) && /Quiet: deleted/.test(t), 'unticked added, renamed and deleted items stay listed')

  // ---- History: detail, compare ----
  await histTab(s, 'history')
  await snapItem(s, 'Two scenes').click()
  await page.waitForTimeout(500)
  t = await pageText(s)
  check(/Walls/.test(t) && /Gate/.test(t), 'snapshot detail lists the two ticked scenes')
  check(!/Tower/.test(t.split(L.history.log.items)[1] ?? ''), 'snapshot detail does not list the third scene (its old text was kept)')
  await itemRow(s, /Walls/).getByRole('button', { name: L.history.log.comparePrevious }).click()
  await page.waitForTimeout(400)
  check((await page.locator('.preview').innerText()).includes('EDITED-WALLS'), 'compare with previous shows the new Walls text')
  await itemRow(s, /Gate/).getByRole('button', { name: L.history.log.compareCurrent }).click()
  await page.waitForTimeout(400)
  check((await page.locator('.preview').innerText()).includes(L.history.log.noDifference), 'snapshot holds the current Gate text (no difference)')
  await itemRow(s, /Walls/).getByRole('button', { name: L.history.log.comparePrevious }).click()
  await page.waitForTimeout(400)
  await shot(N('05-history-detail-diff'), s)
  if (full) {
    await snapItem(s, 'Draft one').click()
    await page.waitForTimeout(300)
    await itemRow(s, /Tower/).getByRole('button', { name: L.history.log.compareCurrent }).click()
    await page.waitForTimeout(300)
    check((await page.locator('.preview').innerText()).includes('EDITED-TOWER'), 'first snapshot still has the old Tower text (compare with current shows the edit)')
    await snapItem(s, 'Two scenes').click()
    await shot(N('04-history-list'), s)
  }
  if (!full) { await s.ctx.close(); return }

  // ---- Snapshot all: remaining changes ----
  await histTab(s, 'changes')
  await snapAll(s, 'Everything')
  check((await pageText(s)).includes(L.history.changes.empty), 'Snapshot all changes: Changes empty again')

  // ---- restore one item ----
  await goWrite(s)
  await editScene(s, /Walls/, ' LATER')
  check((await store(s, 'manuscript/s-walls.json')).includes('LATER'), 'edit after the snapshots is on disk')
  await goHistory(s, 'history')
  await snapItem(s, 'Two scenes').click()
  await page.waitForTimeout(300)
  await itemRow(s, /Walls/).getByRole('button', { name: L.history.log.restore }).click()
  await confirmDlg(s).waitFor()
  check((await confirmDlg(s).innerText()).includes(L.history.confirm.safety), 'restore item: confirm mentions the safety copy')
  await shot(N('06-restore-item-confirm'), s)
  await confirmDlg(s).getByRole('button', { name: L.history.confirm.itemDo }).click()
  await page.getByText(L.history.restored).first().waitFor()
  await goWrite(s)
  await row(s, /Walls/).click()
  await page.waitForTimeout(600)
  const walls = await page.locator('.ProseMirror').first().innerText()
  check(walls.includes('EDITED-WALLS') && !walls.includes('LATER'), 'restored Walls text is back in the editor')

  // ---- restore the whole book (a scene added and one edited after the snapshots) ----
  await addScene(s, /The Siege/, 'Late')
  await editScene(s, /Walls/, ' LATER2')
  await goHistory(s, 'history')
  await snapItem(s, 'Everything').click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: L.history.log.restoreBook }).click()
  await confirmDlg(s).waitFor()
  const bookText = await confirmDlg(s).innerText()
  check(bookText.includes(L.history.confirm.bookTrash) && bookText.includes(L.history.confirm.safety), 'restore book: confirm mentions Trash and the safety copy')
  check(/2 changes/.test(bookText), 'restore book: confirm counts the un-snapshotted changes')
  await shot(N('07-restore-book-confirm'), s)
  await confirmDlg(s).getByRole('button', { name: L.history.confirm.bookDo }).click()
  await page.getByText(L.history.restored).first().waitFor()
  await page.waitForTimeout(800)
  let mf = await manifest(s)
  check(mf.trash.some((e) => e.title === 'Late'), 'newer scene "Late" is in the Trash')
  check(!JSON.stringify(mf.manuscript).includes('Late'), 'newer scene is gone from the manuscript')
  check(!(await store(s, 'manuscript/s-walls.json')).includes('LATER2'), 'Walls text is back to the snapshot')

  // ---- Backups: safety copies, restore one ----
  await histTab(s, 'backups')
  const safety = page.locator('.entry', { hasText: L.history.backups.safety })
  const nSafety = await safety.count()
  check(nSafety >= 2, `Backups lists the safety copies from both restores (${nSafety})`)
  await shot(N('08-backups'), s)
  await safety.first().getByRole('button', { name: new RegExp(L.history.backups.restore) }).click()
  await confirmDlg(s).waitFor()
  await confirmDlg(s).getByRole('button', { name: L.history.confirm.backupDo }).click()
  await page.getByText(L.history.restored).first().waitFor()
  await page.waitForTimeout(800)
  mf = await manifest(s)
  check(JSON.stringify(mf.manuscript).includes('Late'), 'restoring the latest safety copy brings "Late" back')
  check((await store(s, 'manuscript/s-walls.json')).includes('LATER2'), 'and the text it had')

  // ---- broken history ----
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('history').breakEngineForTest())
  await goWrite(s)
  await goHistory(s)
  await page.getByRole('alert').filter({ hasText: L.history.broken.title }).waitFor()
  check(await page.getByRole('button', { name: L.history.broken.start }).isVisible(), 'broken history: banner with "Start new history"')
  check(await page.getByRole('button', { name: L.history.dialog.button, exact: true }).isVisible(), 'the book itself is still open and usable')
  check((await page.getByRole('button', { name: L.history.changes.snapshotAll }).count()) === 0, 'broken history: no stale changes list or snapshot buttons')
  await shot(N('09-history-broken'), s)
  await page.getByRole('button', { name: L.history.broken.start }).click()
  await page.waitForTimeout(800)
  check((await page.getByRole('alert').filter({ hasText: L.history.broken.title }).count()) === 0, 'Start new history clears the banner')
  await histTab(s, 'history')
  check((await pageText(s)).includes(L.history.log.empty), 'new history has no snapshots')
  check(errorsOk(s), 'no console errors')

  // ---- Settings ----
  await nav(s, 'settings')
  await page.getByRole('heading', { name: L.settings.backups.title }).waitFor()
  await page.getByRole('heading', { name: L.settings.backups.title }).scrollIntoViewIfNeeded()
  check(await page.getByText(L.settings.backups.onClose).isVisible(), 'Settings has the Backups block')
  await page.setViewportSize({ width: 1280, height: 1150 })
  await shot(N('11-settings-backups'), s)
  await s.ctx.close()
}
const errorsOk = (s) => s.errors.filter((e) => !/favicon/.test(e)).length === 0

async function readOnlyFlow() {
  tag = 'read-only'
  const lock = { '.storyworks/project.lock': JSON.stringify({ machine: 'other-pc', pid: 4242, timestamp: Date.now() }) }
  const s = await openBook('main', buildBook(await bootBase()), 'light', 'en', { extra: lock, readOnly: true })
  const { page, L } = s
  check(await page.getByRole('button', { name: L.history.dialog.button, exact: true }).isDisabled(), 'read-only: header Snapshot button disabled')
  await goHistory(s)
  const t = await pageText(s)
  check(t.includes(L.history.readOnly), 'read-only: notice shown')
  check(await page.getByRole('button', { name: L.history.changes.snapshotAll }).isDisabled(), 'read-only: "Snapshot all changes" disabled')
  await histTab(s, 'backups')
  await shot('10-history-read-only-light-en', s)
  check(errorsOk(s), 'no console errors')
  await s.ctx.close()
}

async function beforeFlow() {
  tag = 'before'
  const s = await openBook('main', buildBook(await bootBase()), 'light', 'en')
  const { page, L } = s
  await row(s, /Walls/).click()
  await page.waitForTimeout(800)
  await shot('before-write', s, { scanWords: false })
  await nav(s, 'history')
  await page.waitForTimeout(500)
  await shot('before-history', s, { scanWords: false })
  await nav(s, 'settings')
  await page.waitForTimeout(500)
  await page.getByRole('heading', { name: L.settings.title, level: 1 }).waitFor()
  await shot('before-settings', s, { scanWords: false })
  await s.ctx.close()
}

if (BEFORE) await beforeFlow()
else {
  await flow('light', 'en')
  await flow('dark', 'en')
  await flow('light', 'pl')
  await readOnlyFlow()
}
await browser.close()
console.log(failures ? `${failures} FAILED` : 'all checks passed')
process.exit(failures ? 1 : 0)
