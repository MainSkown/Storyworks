// Usage: node scripts/screenshots-m4.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Drives the M4 event-link flow in the browser build (not the Tauri window): link, follow, break,
// restore, relink, cut/paste; checks the acceptance items and captures the screens in Light and Dark.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m4.mjs <outDir>')
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
async function scenes(page) {
  const f = await files(page)
  return Object.entries(f)
    .filter(([k]) => k.startsWith(`${P}manuscript/`))
    .map(([k, v]) => ({ key: k, ...JSON.parse(v) }))
}

// ---------- page helpers ----------
const aside = (page) => page.locator('aside.context-panel')
const markers = (page) => page.locator('[data-marker-block]')
const brokenMarkers = (page) => page.locator('[data-marker-block].broken')
const goWrite = (page) => page.getByRole('link', { name: /Write/ }).first().click()
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
const body = (page) => page.getByRole('textbox', { name: 'Scene text' })
const para = (page, text) => body(page).locator('p', { hasText: text })
async function clickPara(page, text) {
  await para(page, text).click()
  await page.waitForTimeout(250)
}
const row = (page, name) =>
  page.getByRole('tree', { name: 'Manuscript tree' }).getByRole('treeitem', { name: new RegExp(name) })
async function pickerChoose(page, search) {
  const dlg = page.getByRole('dialog', { name: 'Link to event' })
  await dlg.getByRole('combobox').fill(search)
  await page.waitForTimeout(150)
  return dlg
}

// ---------- the flow ----------
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

  // two events in Timelines
  await goTimelines(page)
  await addEvent(page, 'Coronation', '3 May 1400')
  await addEvent(page, 'Treaty signed', '20 June 1400')
  await goWrite(page)

  // scene 1: four paragraphs; scene 2: one
  await row(page, 'Scene 1').first().dblclick()
  await page.getByLabel('Rename').fill('Setting out')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Add scene' }).click()
  await page.getByLabel('Rename').fill('Arrival')
  await page.keyboard.press('Enter')
  await row(page, 'Arrival').first().click()
  await body(page).click()
  await page.keyboard.type('Mara reached the gates at dusk.')
  await page.waitForTimeout(300)
  await row(page, 'Setting out').first().click()
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Scene text"]')?.getAttribute('contenteditable') === 'true',
  )
  await body(page).click()
  const lines = [
    'The king was crowned at dawn.',
    'Nobody spoke of the treaty that night.',
    'The envoys drank to it in silence.',
    'Rain began before the bells stopped.',
  ]
  for (const [i, l] of lines.entries()) {
    await page.keyboard.type(l)
    if (i < lines.length - 1) await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(400)
  await shot(T('01-editor-no-links'), s)

  // --- link one paragraph through the picker (toolbar button) ---
  await clickPara(page, 'crowned at dawn')
  await shot(T('02-this-paragraph-empty'), s, 300)
  await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Link to event', exact: true }).click()
  const picker = await pickerChoose(page, '')
  await picker.waitFor()
  await shot(T('03-picker'), s, 300)
  await pickerChoose(page, 'Coron')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check((await markers(page).count()) === 1, 'link: marker appears next to the paragraph')
  check(
    (await markers(page).first().getAttribute('aria-label')) === 'Linked to 1 event',
    'link: marker says "Linked to 1 event"',
  )
  let sc = await scenes(page)
  const setting = sc.find((x) => x.links?.length)
  check(sc.length === 2 && setting?.links.length === 1, 'link: stored in the scene file only (1 link)')
  check(
    (await aside(page).getByText('Coronation').count()) > 0,
    'link: "This paragraph" panel lists the event',
  )
  await shot(T('04-this-paragraph-linked'), s)

  // --- badge popover ---
  await markers(page).first().click()
  const pop = page.getByRole('dialog', { name: 'Linked events' })
  await pop.waitFor()
  check((await pop.getByText('Coronation').count()) === 1, 'popover: lists the event')
  await shot(T('05-badge-popover'), s, 300)

  // --- jump to node ---
  await pop.getByRole('button', { name: 'Jump' }).click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(800)
  check(
    (await nodeEl(page, 'Coronation').getAttribute('aria-selected').catch(() => null)) === 'true' ||
      (await page.getByLabel('Title', { exact: true }).inputValue()) === 'Coronation',
    'jump: Timelines opens with Coronation selected',
  )
  const written = aside(page).getByText('Setting out')
  check((await written.count()) > 0, '"Written in" lists the passage (scene title)')
  check(
    (await aside(page).getByText('crowned at dawn').count()) > 0,
    '"Written in" shows the passage snippet',
  )
  await aside(page).evaluate((e) => (e.scrollTop = e.scrollHeight))
  await shot(T('06-written-in'), s)

  // --- jump back to the paragraph ---
  await aside(page).getByRole('button', { name: 'Jump' }).first().click()
  await body(page).waitFor()
  await page.waitForTimeout(500)
  check(
    await page.evaluate(() =>
      [...document.querySelectorAll('.ProseMirror [data-id]')].some((e) => e.getAnimations().length > 0),
    ),
    'jump back: paragraph highlighted in the editor',
  )
  await shot(T('07-jump-back'), s, 100)

  // --- link several selected paragraphs at once ---
  await clickPara(page, 'Nobody spoke')
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.up('Shift')
  await page.waitForTimeout(250) // let the editor read the new selection
  await page.keyboard.press('Control+Shift+K')
  await pickerChoose(page, 'Treaty')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check((await markers(page).count()) === 3, 'multi: two selected paragraphs linked at once (3 markers)')
  sc = await scenes(page)
  check(
    sc.find((x) => x.links?.length)?.links.length === 3,
    'multi: one link per paragraph stored (3 links)',
  )
  await clickPara(page, 'Nobody spoke')
  await shot(T('08-editor-markers-badges'), s)

  // --- delete the node: confirm with counts, then broken marker + Problems ---
  await goTimelines(page)
  await pickNode(page, 'Coronation')
  await page.getByRole('button', { name: 'Delete event', exact: true }).first().click()
  const confirm = page.locator('.q-card.dialog', { hasText: '1 linked passage will show as broken until restored.' })
  await confirm.waitFor()
  check((await confirm.isVisible()), 'delete-confirm shows "1 linked passage will show as broken until restored."')
  await shot(T('09-delete-confirm-counts'), s, 300)
  await confirm.getByRole('button', { name: 'Delete event' }).click()
  await page.waitForTimeout(500)
  check((await page.locator('[data-graph-node]').count()) === 1, 'node removed from the timeline')
  await goWrite(page)
  await body(page).waitFor()
  await page.waitForTimeout(600)
  check((await brokenMarkers(page).count()) === 1, 'delete: marker turns broken')
  await clickPara(page, 'crowned at dawn')
  const problems = aside(page).locator('section', { has: page.getByRole('heading', { name: /Problems/ }) })
  check(
    (await problems.getByText('Missing event').count()) === 1,
    '"Problems" lists the broken link',
  )
  await shot(T('10-broken-marker-problems'), s)
  await markers(page).first().click()
  await page.getByRole('dialog', { name: 'Linked events' }).waitFor()
  await shot(T('11-broken-popover'), s, 300)
  await page.keyboard.press('Escape')

  // --- trash: row + restore ---
  await page.getByRole('button', { name: 'Trash' }).click()
  const trash = page.getByRole('dialog', { name: 'Trash' })
  await trash.waitFor()
  check(
    (await trash.getByText('Event · Coronation · from Main timeline').count()) === 1,
    'trash: row "Event · Coronation · from Main timeline"',
  )
  await shot(T('12-trash-event'), s, 300)
  await trash.getByRole('button', { name: /Restore.*Coronation/ }).click()
  await page.waitForTimeout(600)
  await trash.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(500)
  check((await brokenMarkers(page).count()) === 0, 'restore: links repaired, no broken marker')
  check(
    (await markers(page).first().getAttribute('aria-label')) === 'Linked to 1 event',
    'restore: marker linked again',
  )

  // --- relink a broken link ---
  await goTimelines(page)
  await pickNode(page, 'Treaty signed')
  await page.getByRole('button', { name: 'Delete event', exact: true }).first().click()
  await page.locator('.q-card.dialog', { hasText: '2 linked passages will show as broken' }).getByRole('button', { name: 'Delete event' }).click()
  await page.waitForTimeout(500)
  await goWrite(page)
  await body(page).waitFor()
  await clickPara(page, 'Nobody spoke')
  check((await brokenMarkers(page).count()) === 2, 'relink setup: two broken markers')
  const idOf = (t) => para(page, t).getAttribute('data-id')
  const nobody = await idOf('Nobody spoke')
  const linkOf = async (blk) => (await scenes(page)).flatMap((x) => x.links ?? []).find((l) => l.from.block === blk)
  const relinkedId = (await linkOf(nobody)).id
  await markers(page).nth(1).click()
  const pop2 = page.getByRole('dialog', { name: 'Linked events' })
  await pop2.getByRole('button', { name: 'Relink' }).click()
  await page.getByRole('dialog', { name: 'Choose another event' }).getByRole('combobox').fill('Coron')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  check((await brokenMarkers(page).count()) === 1, 'relink: one broken link repaired by choosing another event')
  check(
    (await linkOf(nobody)).id === relinkedId &&
      (await linkOf(nobody)).to.block === (await linkOf(await idOf('crowned at dawn'))).to.block,
    'relink: the same link now points at the chosen event',
  )

  // --- cut/paste a linked paragraph into another scene ---
  // Select from the end of the previous paragraph to the end of this one, so the block itself travels.
  await clickPara(page, 'Nobody spoke')
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.waitForTimeout(250)
  const movedBlock = nobody
  const total = (await scenes(page)).reduce((n, x) => n + (x.links?.length ?? 0), 0)
  await page.keyboard.press('Control+x')
  await page.waitForTimeout(300)
  await row(page, 'Arrival').first().click()
  await body(page).waitFor()
  await page.waitForTimeout(500)
  await body(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(500)
  await row(page, 'Setting out').first().click() // saves; the re-home pass runs after the save
  await page.waitForTimeout(800)
  await row(page, 'Arrival').first().click()
  await page.waitForTimeout(800)
  sc = await scenes(page)
  const arrival = sc.find((x) => JSON.stringify(x).includes('Mara reached'))
  const moved = (arrival?.links ?? []).filter((l) => l.from.block === movedBlock).length
  check(
    (await para(page, 'Nobody spoke').count()) === 1 && (await markers(page).count()) === 1,
    'cut/paste: pasted paragraph shows a marker in the other scene',
  )
  check(moved === 1, `cut/paste: the link moved to the other scene file (${moved} there)`)
  const all = sc.reduce((n, x) => n + (x.links?.length ?? 0), 0)
  check(all === total, `cut/paste: no link lost or duplicated (${all} of ${total})`)
  await shot(T('13-cut-paste-link-follows'), s)

  // keyboard path: marker -> Enter opens the popover, Escape closes it and returns focus
  await markers(page).first().focus()
  await page.keyboard.press('Enter')
  const kp = page.getByRole('dialog', { name: 'Linked events' })
  await kp.waitFor({ timeout: 2000 }).catch(() => {})
  check(await kp.isVisible(), 'keyboard: Enter on a marker opens the popover with focus inside')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check(!(await kp.isVisible()), 'keyboard: Escape closes the popover')

  // scene delete confirm with link count
  await row(page, 'Arrival').first().hover()
  await page.getByRole('button', { name: /^Delete: Arrival/ }).click()
  const sceneConfirm = page.locator('.q-card', { hasText: '1 linked passage will show as broken until restored.' })
  await sceneConfirm.waitFor({ timeout: 3000 }).catch(() => {})
  check(await sceneConfirm.isVisible(), 'scene delete-confirm shows the linked-passage count')
  await shot(T('14-scene-delete-confirm'), s, 300)
  await page.keyboard.press('Escape')

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
