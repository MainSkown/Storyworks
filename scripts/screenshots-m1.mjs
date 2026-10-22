// Usage: node scripts/screenshots-m1.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Creates a demo project through the UI once, then seeds fresh browser contexts from its localStorage dump.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m1.mjs <outDir>')
mkdirSync(out, { recursive: true })
const URL = 'http://localhost:1420/'
const SETTINGS_KEY = 'storyworks:settings.json'
const PROJECT_PREFIX = 'storyworks:project'

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({
  executablePath: join(base, dir, 'chrome-linux64/chrome'),
  args: ['--no-sandbox'],
})

const settings = (over = {}) =>
  JSON.stringify({
    version: 2,
    theme: 'light',
    language: 'en',
    uiZoom: 100,
    editorFontSize: 18,
    contextPanel: { hidden: false, collapsed: {} },
    recentProjects: [],
    ...over,
  })

const recent = [
  { path: 'demo', title: 'The Long Road', openedAt: new Date().toISOString() },
  { path: 'drafts/old-novel', title: 'Old Novel', openedAt: '2026-09-01T10:00:00.000Z' },
]

/** New context; `entries` (key -> value) are written to localStorage once, before the app starts. */
async function open({ over, entries = {}, withSettings = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  const all = { ...entries }
  if (withSettings) all[SETTINGS_KEY] = settings(over)
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('__seeded')) return
    sessionStorage.setItem('__seeded', '1')
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v)
  }, all)
  await page.goto(URL)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  return { ctx, page, errors }
}

async function shot(name, { page, errors }, settle = 500) {
  await page.waitForTimeout(settle)
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log(`${name}${errors.length ? ' ERRORS' : ' ok'}`)
  if (errors.length) console.log('  ', [...new Set(errors)])
  errors.length = 0
}

/** Welcome -> "Open project" -> pick a browser project by name. */
async function openBrowserProject(page, name) {
  await page.getByRole('button', { name: 'Open project' }).click()
  await page.getByRole('dialog', { name: 'Projects in this browser' }).getByRole('button', { name }).click()
}

/** Select the first scene in the tree (the new project ships with Chapter 1 / Scene 1). */
async function pickScene(page) {
  await page.getByRole('list', { name: /Manuscript tree|Drzewo/ }).getByRole('button', { name: /Scene 1|Scena 1/ }).first().click()
}

const sceneText = 'The road began where the map ended.\nShe walked it anyway, counting every step.'

// ---- 01 welcome, no recent ----
let s = await open()
await shot('01-welcome-empty', s)
await s.ctx.close()

// ---- 02 welcome with recent ----
s = await open({ over: { recentProjects: recent } })
await shot('02-welcome-recent', s)
await s.ctx.close()

// ---- 14 welcome dark ----
s = await open({ over: { theme: 'dark', recentProjects: recent } })
await shot('14-welcome-dark', s)
await s.ctx.close()

// ---- 03/04 create demo project via UI ----
s = await open()
const { page } = s
await page.getByRole('button', { name: 'New project' }).click()
const dlg = page.getByRole('dialog', { name: 'New project' })
await dlg.getByLabel('Book title').fill('The Long Road')
await dlg.getByLabel('Author').fill('Mara Quill')
await dlg.getByLabel('Project name').fill('demo')
await shot('03-new-project-dialog', s)
await dlg.getByRole('button', { name: 'Create project' }).click()
await page.getByRole('region', { name: 'Manuscript' }).waitFor()
const tree = page.getByRole('list', { name: 'Manuscript tree' })
const body = page.locator('#write-body')
async function write(title, text) {
  if (title) await page.getByLabel('Scene title').fill(title)
  await body.fill(text)
  await body.blur()
  await page.waitForTimeout(900)
}
await tree.getByRole('button', { name: /Scene 1/ }).click()
await write(null, sceneText)
for (const [title, text] of [
  ['The Crossing', 'The river was wider than the stories said.'],
  ['The Ford', 'A shallow place, if you knew where to step.'],
]) {
  await tree.getByRole('button', { name: /Chapter 1/ }).click()
  await page.getByRole('button', { name: 'Add scene' }).click()
  await body.waitFor()
  await write(title, text)
}
await tree.getByRole('button', { name: /Scene 1/ }).click()
await body.waitFor()
await page.waitForTimeout(900)
await shot('04-write-after-create', s)

// ---- dump project files ----
const dump = await page.evaluate((p) => {
  const o = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k.startsWith(p) && !k.endsWith('/.storyworks/project.lock')) o[k] = localStorage.getItem(k)
  }
  return o
}, PROJECT_PREFIX)
console.log('dump keys:', Object.keys(dump).filter((k) => !k.startsWith('storyworks:projectmeta')))
await s.ctx.close()

const K = (p) => `storyworks:project:demo/${p}`
const files = Object.keys(dump)
  .filter((k) => k.startsWith('storyworks:project:demo/'))
  .map((k) => k.slice('storyworks:project:demo/'.length))
const seed = (mut) => {
  const e = { ...dump }
  mut?.(e)
  return e
}
const withRecent = { recentProjects: recent }


const manifest = JSON.parse(dump[K('project.json')])
const findScene = (title) =>
  files.find((f) => f.startsWith('manuscript/') && JSON.parse(dump[K(f)]).title === title)
const crossing = findScene('The Crossing')
const ford = findScene('The Ford')
const scene1 = findScene('Scene 1')
console.log('scenes:', { scene1, crossing, ford })

// ---- 05 Polish, 06 dark ----
s = await open({ over: { language: 'pl', ...withRecent }, entries: seed() })
await s.page.locator('.recent-open', { hasText: 'The Long Road' }).click()
await pickScene(s.page)
await s.page.locator('#write-body').waitFor()
await shot('05-write-polish', s)
await s.ctx.close()

s = await open({ over: { theme: 'dark', ...withRecent }, entries: seed() })
await openBrowserProject(s.page, 'demo')
await pickScene(s.page)
await s.page.locator('#write-body').waitFor()
await shot('06-write-dark', s)
await s.ctx.close()

// ---- 07 trash after deleting a scene ----
s = await open({ over: withRecent, entries: seed() })
await openBrowserProject(s.page, 'demo')
await s.page.getByRole('list', { name: 'Manuscript tree' }).getByRole('button', { name: /The Ford/ }).click()
await s.page.getByRole('toolbar').getByRole('button', { name: 'Delete' }).click()
await s.page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
await s.page.waitForTimeout(500)
await s.page.getByRole('button', { name: 'Trash' }).click()
await s.page.getByRole('dialog', { name: 'Trash' }).waitFor()
await shot('07-trash-dialog', s)
await s.ctx.close()

/** Open demo from a mutated seed and screenshot. */
async function seeded(name, mut, over = withRecent) {
  const x = await open({ over, entries: seed(mut) })
  await openBrowserProject(x.page, 'demo')
  await x.page.waitForTimeout(800)
  await shot(name, x)
  return x
}

// ---- 08/09 read-only banners ----
await (await seeded('08-readonly-newer-version', (e) => {
  e[K('project.json')] = JSON.stringify({ ...manifest, version: 99 }, null, 2)
})).ctx.close()
await (await seeded('09-readonly-unknown-kind', (e) => {
  e[K('project.json')] = JSON.stringify({ ...manifest, kind: 'comic-script' }, null, 2)
})).ctx.close()

// ---- 10 issues banners ----
await (await seeded('10-issues-banners', (e) => {
  delete e[K(ford)]
  delete e[`storyworks:projectmeta:demo/${ford}`]
  const bad = JSON.parse(e[K(crossing)])
  bad.wordCount = 'many'
  e[K(crossing)] = JSON.stringify(bad, null, 2)
  e[K('manuscript/stray-notes.json')] = '{"note":"not part of the project"}'
})).ctx.close()

// ---- 11 open elsewhere ----
s = await open({
  over: withRecent,
  entries: seed((e) => {
    e[K('.storyworks/project.lock')] = JSON.stringify({ machine: 'other-pc', pid: 4242, timestamp: Date.now() })
  }),
})
await openBrowserProject(s.page, 'demo')
await s.page.getByRole('alertdialog').waitFor()
await shot('11-open-elsewhere', s)
await s.ctx.close()

// ---- 12 invalid JSON project.json ----
await (await seeded('12-open-error-invalid-json', (e) => {
  e[K('project.json')] = '{\n  "version": 1,\n<<<<<<< HEAD\n  "title": "The Long Road"\n=======\n'
})).ctx.close()

// ---- 13 external change dialog (best effort) ----
s = await open({ over: withRecent, entries: seed() })
{
  const { page: p } = s
  await openBrowserProject(p, 'demo')
  await pickScene(p)
  const ta = p.locator('#write-body')
  await ta.waitFor()
  await ta.click()
  await p.keyboard.press('Control+End')
  await p.keyboard.type(' She did not look back.')
  // Edit is applied after 400ms and autosaved 800ms later: change the file in between.
  await p.waitForTimeout(600)
  await p.evaluate(
    ([key]) => {
      const v = localStorage.getItem(key)
      localStorage.setItem(key, v.replace('The road began', 'The road ended'))
      window.dispatchEvent(new Event('focus'))
    },
    [K(scene1)],
  )
  const shown = await p
    .getByRole('alertdialog')
    .waitFor({ timeout: 3000 })
    .then(() => true, () => false)
  if (shown) await shot('13-external-change', s, 300)
  else console.log('13-external-change SKIPPED: dialog did not appear (timing)')
}
await s.ctx.close()

await browser.close()
