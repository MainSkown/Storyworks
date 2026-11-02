// Usage: node scripts/screenshots-tabstrip.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Checks the Codex entry tab strip (no arrow/label overlap, labels not cut off, every tab reachable by mouse and keyboard) at 1280x800 and 1000x700, Light + Dark; captures the Knowledge and Chronicle tabs of Aldric.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-tabstrip.mjs <outDir>')
mkdirSync(out, { recursive: true })
const URL = 'http://localhost:1420/'
const SETTINGS_KEY = 'storyworks:settings.json'

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })

const settings = (theme) =>
  JSON.stringify({ version: 2, theme, language: 'en', uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: [] })

let failures = 0
let tag = ''
function check(cond, msg) {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'}: [${tag}] ${msg}`)
}

const items = (page) => page.locator('aside button.item')
const nameField = (page) => page.getByLabel('Name', { exact: true })
const opts = (page) => page.locator('.q-menu [role=option]')
const navTo = async (page, name) => {
  await page.getByRole('link', { name: new RegExp(`^\\s*${name}`) }).first().click()
  await page.waitForTimeout(500)
}
const tabTo = async (page, name) => {
  await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click()
  await page.waitForTimeout(250)
}
async function newEntry(page, name, typeName) {
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.waitForTimeout(300)
  await nameField(page).fill(name)
  await nameField(page).press('Enter')
  await page.waitForTimeout(250)
  await page.getByLabel('Type', { exact: true }).click()
  await page.getByRole('option', { name: typeName, exact: true }).click()
  await page.waitForTimeout(250)
}
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
const grp = (scope, label) => scope.getByRole('group', { name: label })
async function pickPos(page, scope, label, search) {
  await grp(scope, label).getByRole('button', { name: /Choose event|Change event/ }).click()
  const pd = page.getByRole('dialog', { name: 'Choose an event' })
  await pd.waitFor()
  await pd.getByRole('combobox').fill(search)
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
}
async function learn(page, { newItem, item, at, forgot }) {
  await page.getByRole('button', { name: 'Learns…' }).click()
  const d = page.getByRole('dialog', { name: /^(Learns…|Edit what is learned)$/ })
  await d.waitFor()
  const sel = d.getByLabel('Knowledge item', { exact: true })
  await sel.click()
  await sel.fill(item ?? newItem)
  await opts(page).filter({ hasText: newItem ? /Create item/ : item }).first().click()
  await page.waitForTimeout(300)
  await pickPos(page, d, 'Learns at', at)
  if (forgot) await pickPos(page, d, 'Forgotten or lost at', forgot)
  await d.locator('button[type=submit]').click()
  await page.waitForTimeout(500)
}

/** Seeds a small book; leaves Aldric open on the Codex page. */
async function seed(page) {
  await page.getByRole('button', { name: 'New project' }).click()
  const dlg = page.getByRole('dialog', { name: 'New project' })
  await dlg.getByLabel('Book title').fill('The Long Road')
  await dlg.getByLabel('Author').fill('Mara Quill')
  await dlg.getByLabel('Project name').fill('demo')
  await dlg.getByRole('button', { name: 'Create project' }).click()
  await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  await page.waitForTimeout(600)
  await page.getByRole('link', { name: /Timelines/ }).first().click()
  await page.locator('.tl').waitFor()
  await page.waitForTimeout(400)
  await addEvent(page, 'Coronation', '3 May 1400')
  await addEvent(page, 'Treaty signed', '20 June 1400')
  await addEvent(page, 'Return of the heir')
  await addEvent(page, 'Spare feast')
  await navTo(page, 'Codex')
  await newEntry(page, 'Aldric', 'Character')
  await newEntry(page, 'Mara', 'Character')
  await items(page).filter({ hasText: 'Aldric' }).first().click()
  await page.waitForTimeout(300)
  await tabTo(page, 'Knowledge')
  await learn(page, { newItem: 'The sword is cursed', at: 'Coronation', forgot: 'Return of the heir' })
  await learn(page, { newItem: 'The king is a fraud', at: 'Treaty signed' })
  await learn(page, { newItem: 'Temp rumour', at: 'Spare feast' })
}

/** Rects of arrows and tab labels, plus whether each tab fits inside the scroll area. */
const measure = (page) =>
  page.evaluate(() => {
    const strip = document.querySelector('.tabs')
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }
    }
    const visible = (el) => {
      const cs = getComputedStyle(el)
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().width > 0
    }
    const arrows = [...strip.querySelectorAll('.q-tabs__arrow')].filter(visible).map((a) => ({ cls: a.className, rect: r(a), disabled: a.classList.contains('q-tabs__arrow--faded') }))
    const content = strip.querySelector('.q-tabs__content')
    const cr = r(content)
    const tabs = [...strip.querySelectorAll('.q-tab')].map((t) => {
      const lab = t.querySelector('.q-tab__label') ?? t.querySelector('span') ?? t
      const lr = r(lab)
      return {
        name: t.textContent.trim(),
        label: lr,
        inView: lr.l >= cr.l - 0.5 && lr.r <= cr.r + 0.5,
        partly: lr.r > cr.l && lr.l < cr.r,
      }
    })
    return { arrows, content: cr, tabs, strip: r(strip), overflow: content.scrollWidth > content.clientWidth }
  })
const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
// A label that is scrolled out is clipped by the tab area, so only its visible part counts.
const overlaps = (m) =>
  m.arrows.flatMap((a) => [
    ...(hit(a.rect, m.content) ? ['tab area'] : []),
    ...m.tabs.filter((t) => hit(a.rect, { ...t.label, l: Math.max(t.label.l, m.content.l), r: Math.min(t.label.r, m.content.r) }) && t.partly).map((t) => t.name),
  ])

// Quasar scrolls while the arrow is held.
async function holdArrow(page, loc) {
  const b = await loc.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await page.waitForTimeout(400)
}

async function stripChecks(page, size) {
  await page.setViewportSize(size)
  await page.waitForTimeout(500)
  // Below 1100px the context panel floats over the right of the page by design; hide it so the strip is reachable.
  if (size.width <= 1100 && (await page.locator('aside.context-panel').count())) await page.getByRole('button', { name: /^Hide/ }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('tab', { name: /^Details/ }).click()
  await page.waitForTimeout(400)
  const m = await measure(page)
  const w = `${size.width}x${size.height}`
  if (process.env.DBG) { await page.screenshot({ path: join(out, `dbg-${w}.png`) }); console.log(JSON.stringify(m.arrows), JSON.stringify(m.tabs.map((t)=>[t.name,Math.round(t.label.l),Math.round(t.label.r)]))) }
  console.log(`  [${w}] content ${Math.round(m.content.l)}-${Math.round(m.content.r)}, arrows: ${m.arrows.length}, overflow: ${m.overflow}`)
  // overlap: arrow rect vs every tab label rect that is meant to be visible (not scrolled off)
  check(overlaps(m).length === 0, `[${w}] no arrow overlaps a visible tab label or the tab area (initial scroll): ${overlaps(m).join(', ') || 'none'}`)
  check(m.tabs[0].inView, `[${w}] first tab "Details" not clipped`)

  // mouse: click right arrow until the last tab fits; check overlap at each step
  const names = m.tabs.map((t) => t.name)
  const right = page.locator('.tabs .q-tabs__arrow--right')
  let guard = 0
  let cur = m
  while (!cur.tabs[cur.tabs.length - 1].inView && guard++ < 20) {
    if (!(await right.isVisible())) break
    await holdArrow(page, right)
    cur = await measure(page)
    if (overlaps(cur).length) check(false, `[${w}] arrow overlaps ${overlaps(cur).join(', ')} while scrolling`)
  }
  check(cur.tabs[cur.tabs.length - 1].inView, `[${w}] right arrow scrolls the last tab into view (${guard} clicks)`)
  const left = page.locator('.tabs .q-tabs__arrow--left')
  guard = 0
  while (!cur.tabs[0].inView && guard++ < 20) {
    if (!(await left.isVisible())) break
    await holdArrow(page, left)
    cur = await measure(page)
  }
  check(cur.tabs[0].inView, `[${w}] left arrow scrolls back to the first tab (${guard} clicks)`)

  // keyboard: arrow keys move focus along the strip (as Quasar does), Enter activates; the focused and the active tab must end up in view
  await page.getByRole('tab', { name: /^Details/ }).focus()
  for (let i = 0; i < names.length; i++) {
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim())
    await page.keyboard.press('Enter')
    await page.waitForTimeout(450)
    const mm = await measure(page)
    const act = await page.evaluate(() => document.querySelector('.tabs .q-tab--active')?.textContent?.trim())
    const at = mm.tabs.find((t) => t.name === act)
    check(act === focused && !!at?.inView, `[${w}] keyboard: "${focused}" focused + Enter -> active "${act}", fully in view (${at ? Math.round(at.label.l) + '-' + Math.round(at.label.r) : '?'} in ${Math.round(mm.content.l)}-${Math.round(mm.content.r)})`)
    if (i < names.length - 1) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(250)
    }
  }
}

async function flow(theme) {
  tag = theme
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
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
  await seed(page)

  await stripChecks(page, { width: 1280, height: 800 })
  await tabTo(page, 'Knowledge')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(out, `06-entry-knowledge-tab-${theme}.png`) })
  await tabTo(page, 'Chronicle')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(out, `25-chronicle-${theme}.png`) })
  await stripChecks(page, { width: 1000, height: 700 })
  check(errors.length === 0, `no console errors ${errors.length ? [...new Set(errors)].join(' | ') : ''}`)
  await ctx.close()
}

await flow('light')
await flow('dark')
tag = 'end'
console.log(failures ? `${failures} CHECK(S) FAILED` : 'all checks passed')
await browser.close()
process.exit(failures ? 1 : 0)
