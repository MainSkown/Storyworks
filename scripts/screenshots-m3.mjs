// Usage: node scripts/screenshots-m3.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Drives the M3 Timelines UI in the browser build (not the Tauri window): builds a branch+merge timeline
// through the UI, checks the acceptance items, then captures the screens in Light and Dark.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m3.mjs <outDir>')
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

const settings = (theme, recent = []) =>
  JSON.stringify({
    version: 2,
    theme,
    language: 'en',
    uiZoom: 100,
    editorFontSize: 18,
    contextPanel: { hidden: false, collapsed: {} },
    recentProjects: recent,
  })

const allErrors = []
let failures = 0
function check(cond, msg) {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`)
}

async function open(entries) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('__seeded')) return
    sessionStorage.setItem('__seeded', '1')
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v)
  }, entries)
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

const dumpStore = (page) =>
  page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
const projectFiles = (d) =>
  Object.fromEntries(
    Object.entries(d).filter(
      ([k]) => k.startsWith(P) && !k.endsWith('project.lock') && !k.includes(':projectmeta:'),
    ),
  )

// ---------- page helpers ----------
const nodeEl = (page, title) => page.locator(`[data-graph-node][aria-label^="${title}."]`)
const status = (page) => page.locator('.graph-canvas [role=status]')
const timelineFile = async (page) => {
  await page.waitForTimeout(1300) // autosave debounce
  const files = projectFiles(await dumpStore(page))
  return Object.entries(files)
    .filter(([k]) => k.startsWith(`${P}timelines/`))
    .map(([, v]) => JSON.parse(v))
    .find((t) => t.name === 'Main timeline')
}
const goTimelines = async (page) => {
  await page.getByRole('link', { name: /Timelines/ }).first().click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(400)
}
const fit = async (page) => {
  await page.getByRole('button', { name: 'Fit to view' }).click()
  await page.waitForTimeout(500)
}
const setField = async (page, label, value) => {
  const f = page.getByLabel(label, { exact: true })
  await f.fill(value)
  await f.press('Enter')
  await page.waitForTimeout(150)
}
const pick = async (page, title) => {
  await fit(page)
  await nodeEl(page, title).click()
  await page.waitForTimeout(250)
}
async function addEvent(page, title, date) {
  await page.getByRole('button', { name: 'Add event' }).click()
  await page.waitForTimeout(350)
  await setField(page, 'Title', title)
  if (date) await setField(page, 'Date', date)
  await page.waitForTimeout(100)
}
// Starts connect mode on `from` and walks the arrow keys until `to` is the target.
async function connectKeys(page, from, to) {
  await nodeEl(page, from).focus()
  await page.keyboard.press('c')
  for (const dir of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    for (let i = 0; i < 6; i++) {
      if ((await status(page).textContent())?.includes(`Connect to ${to}?`)) return true
      await page.keyboard.press(dir)
      await page.waitForTimeout(80)
    }
    // walked off in this direction; step back to the source and try another
    await nodeEl(page, from).focus().catch(() => {})
  }
  return (await status(page).textContent())?.includes(`Connect to ${to}?`) ?? false
}

// ---------- build in the UI (light) ----------
let s = await open({ [SETTINGS_KEY]: settings('light') })
let { page } = s
await page.getByRole('button', { name: 'New project' }).click()
const dlg = page.getByRole('dialog', { name: 'New project' })
await dlg.getByLabel('Book title').fill('The Long Road')
await dlg.getByLabel('Author').fill('Mara Quill')
await dlg.getByLabel('Project name').fill('demo')
await dlg.getByRole('button', { name: 'Create project' }).click()
await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
await page.waitForTimeout(600)
await goTimelines(page)
await shot('01-empty-timeline-light', s)

await addEvent(page, 'Coronation', '3 May 1400')
await addEvent(page, 'Treaty signed', '20 June 1400')
await addEvent(page, 'Peace festival', '1 September 1401')
// fork: new event after Coronation
await pick(page, 'Coronation')
await addEvent(page, 'Rebellion begins', '10 July 1400')
await page.getByRole('button', { name: 'New branch' }).click()
await page.getByLabel('Branch name').fill('Rebellion')
await page.getByLabel('Branch colour').fill('#b03a2e')
await page.getByLabel('Dashed line').check()
await page.getByRole('button', { name: 'Create branch' }).click()
await page.waitForTimeout(200)
await addEvent(page, 'Siege of the north')
await page.getByLabel('Branch', { exact: true }).selectOption({ label: 'Rebellion - dashed' })
await page.waitForTimeout(150)
// merge back into the main line
const found = await connectKeys(page, 'Siege of the north', 'Peace festival')
check(found, 'merge: keyboard connect reached the target')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
// more main-line and undated events
await page.locator('.vue-flow__pane').first().click({ position: { x: 20, y: 20 } }) // deselect: next events stand alone
await addEvent(page, 'Exile of the heir')
await page.locator('.vue-flow__pane').first().click({ position: { x: 20, y: 20 } })
await addEvent(page, 'Harvest ends', '31 October 1400')
await page.getByRole('button', { name: 'Tidy up' }).click()
await fit(page)

let tl = await timelineFile(page)
check(
  tl.nodes.length === 7 && tl.edges.length === 5 && tl.branches.some((b) => b.dashed),
  `branch+merge built (nodes ${tl.nodes.length}, edges ${tl.edges.length}, dashed branch)`,
)
const mergeTarget = tl.nodes.find((n) => n.title === 'Peace festival').id
check(
  tl.edges.filter((e) => e.to === mergeTarget).length === 2,
  'merge node has two incoming edges',
)
await shot('02-flow-branch-merge-light', s)

// cycle rejection
const hadEdges = tl.edges.length
const reached = await connectKeys(page, 'Peace festival', 'Coronation')
check(reached, 'cycle: keyboard reached the target')
await page.keyboard.press('Enter')
const toastEl = page.locator('.q-notification', { hasText: 'loop' })
await toastEl.waitFor({ timeout: 3000 }).catch(() => {})
check(
  (await toastEl.count()) > 0 && (await timelineFile(page)).edges.length === hadEdges,
  'cycle rejected with message, no edge added',
)
await shot('03-cycle-toast-light', s, 600)
await page.keyboard.press('Escape')
await page.locator('.q-notification button').first().click({ timeout: 1000 }).catch(() => {})

// second timeline in the sidebar
await page.getByRole('button', { name: 'New timeline' }).click()
await page.getByLabel('Timeline name').fill('Backstory')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Main timeline', exact: true }).click()
await page.waitForTimeout(500)

// save + reopen
await page.waitForFunction(() => document.body.innerText.includes('Saved'), null, { timeout: 5000 })
await page.getByRole('button', { name: 'Close project' }).click()
await page.getByRole('button', { name: 'Open project' }).click()
await page
  .getByRole('dialog', { name: 'Projects in this browser' })
  .getByRole('button', { name: 'demo' })
  .click()
await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
await goTimelines(page)
await page.waitForTimeout(600)
check(
  (await page.locator('[data-graph-node]').count()) === 7,
  'reopen: 7 events shown',
)
const re = await timelineFile(page)
check(
  re.edges.length === 5 && re.nodes.filter((n) => n.branchId).length === 2,
  'reopen: edges and branch assignments persisted',
)

// ---------- calendar change ----------
await page.getByRole('link', { name: 'Calendar' }).click()
await page.locator('#calendar').waitFor()
await page.waitForTimeout(700)
const top = await page.locator('#calendar').evaluate((e) => e.getBoundingClientRect().top)
check(top >= 0 && top < 300, `sidebar Calendar link scrolls to #calendar (top ${Math.round(top)}px)`)
await shot('04-calendar-top-light', s)

const before = projectFiles(await dumpStore(page))
await page.getByLabel('Days').nth(9).fill('30') // October
await page.getByText('Leap years', { exact: true }).click()
await page.waitForTimeout(300)
check(
  await page.getByText(/1 date will no longer fit/).isVisible(),
  'calendar: count of dates that will no longer fit shown before saving',
)
await page.getByText('Leap years', { exact: true }).scrollIntoViewIfNeeded()
await shot('05-calendar-unsaved-light', s)
await page.getByRole('button', { name: 'Save calendar' }).click()
await page.getByText('Calendar saved.').waitFor()
await page.waitForTimeout(500)
const after = projectFiles(await dumpStore(page))
const changed = Object.keys(after).filter((k) => before[k] !== after[k])
const added = Object.keys(after).filter((k) => !(k in before))
console.log('changed:', changed.map((k) => k.slice(P.length)), 'added:', added.map((k) => k.slice(P.length)))
check(
  changed.length === 1 && changed[0] === `${P}calendar.json` && added.length === 0,
  'calendar save changed only calendar.json',
)
const harvest = (await timelineFile(page)).nodes.find((n) => n.title === 'Harvest ends')
check(
  harvest.date.year === 1400 && harvest.date.month === 9 && harvest.date.day === 31,
  'date value unchanged after calendar change (1400, month 9, day 31)',
)
await goTimelines(page)
await pick(page, 'Harvest ends')
await page.waitForTimeout(300)
check(
  (await page.getByRole('status').filter({ hasText: 'does not exist in the calendar' }).count()) > 0 &&
    (await nodeEl(page, 'Harvest ends').getByRole('img', { name: /does not fit/ }).count()) > 0,
  'invalid date flagged in inspector and on the node, value kept',
)

// ---------- gallery (final state) ----------
async function gallery(s, theme) {
  const { page } = s
  const n = (name) => `${name}-${theme}`
  await goTimelines(page)
  await page.getByRole('button', { name: 'Flow', exact: true }).click()
  await page.getByRole('button', { name: 'Canvas', exact: true }).click()
  await pick(page, 'Peace festival')
  await fit(page)
  await shot(n('10-flow'), s)

  await page.getByRole('button', { name: 'By date', exact: true }).click()
  await page.waitForTimeout(500)
  await fit(page)
  await shot(n('11-date-scaled'), s)
  await page.getByRole('button', { name: 'Flow', exact: true }).click()
  await page.waitForTimeout(400)
  await fit(page)

  await pick(page, 'Harvest ends')
  await page.waitForTimeout(300)
  await shot(n('12-inspector-invalid-date'), s)

  // cycle toast
  if (await connectKeys(page, 'Peace festival', 'Coronation')) {
    await page.keyboard.press('Enter')
    await page.locator('.q-notification', { hasText: 'loop' }).waitFor({ timeout: 3000 })
    await shot(n('13-cycle-toast'), s, 600)
    await page.keyboard.press('Escape')
    await page.locator('.q-notification button').first().click({ timeout: 1000 }).catch(() => {})
    await page.locator('.q-notification').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
  }
  await page.waitForTimeout(300)

  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.waitForTimeout(500)
  await shot(n('14-list'), s)
  await page.getByRole('button', { name: 'Canvas', exact: true }).click()
  await page.waitForTimeout(500)
  await fit(page)

  // keyboard focus ring: land on a node with the arrow keys
  await nodeEl(page, 'Coronation').focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  await shot(n('15-focus-ring'), s)

  await shot(n('16-sidebar'), s, 100, { clip: { x: 0, y: 0, width: 232, height: 420 } })

  await page.getByRole('link', { name: 'Calendar' }).click()
  await page.locator('#calendar').waitFor()
  await page.mouse.move(640, 400)
  await page.waitForTimeout(600)
  await shot(n('17-calendar'), s)
  await page.getByText('Leap years', { exact: true }).scrollIntoViewIfNeeded()
  await shot(n('18-calendar-leap-off'), s)
}

await gallery(s, 'light')
const dump = await dumpStore(page)
await s.ctx.close()

// dark: same project files, theme switched in settings (lock file left out)
delete dump[`${P}.storyworks/project.lock`]
dump[SETTINGS_KEY] = JSON.stringify({ ...JSON.parse(dump[SETTINGS_KEY]), theme: 'dark' })
s = await open(dump)
await s.page.getByRole('button', { name: 'Open project' }).click()
await s.page
  .getByRole('dialog', { name: 'Projects in this browser' })
  .getByRole('button', { name: 'demo' })
  .click()
await s.page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
await gallery(s, 'dark')
await s.ctx.close()

console.log(failures ? `${failures} CHECK(S) FAILED` : 'all checks passed')
console.log(
  allErrors.length ? `CONSOLE ERRORS: ${[...new Set(allErrors)].join(' | ')}` : 'no console errors',
)
await browser.close()
if (failures || allErrors.length) process.exit(1)
