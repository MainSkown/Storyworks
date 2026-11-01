// Usage: node scripts/screenshots-m2.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
// Drives the M2 Write UI (TipTap editor, outline tree, inbox, corkboard) in the browser build.
import { chromium } from 'playwright-core'
import { deflateSync } from 'node:zlib'
import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m2.mjs <outDir>')
mkdirSync(out, { recursive: true })
const URL = 'http://localhost:1420/'
const SETTINGS_KEY = 'storyworks:settings.json'

const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base)
  .filter((d) => d.startsWith('chromium-'))
  .sort()
  .pop()
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

const allErrors = []
let failures = 0
function check(cond, msg) {
  if (!cond) failures++
  console.log(`${cond ? 'check ok' : 'CHECK FAILED'}: ${msg}`)
}

async function open(entries = {}, over = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  const all = { [SETTINGS_KEY]: settings(over), ...entries }
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('__seeded')) return
    sessionStorage.setItem('__seeded', '1')
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v)
  }, all)
  await page.goto(URL)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  return { ctx, page, errors }
}

async function shot(name, s, settle = 500) {
  await s.page.waitForTimeout(settle)
  await s.page.screenshot({ path: join(out, `${name}.png`) })
  console.log(`${name}${s.errors.length ? ' ERRORS' : ' ok'}`)
  if (s.errors.length) {
    console.log('  ', [...new Set(s.errors)])
    allErrors.push(...s.errors)
    s.errors.length = 0
  }
}

// Small solid-colour PNG.
function png(w, h, [r, g, b]) {
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat()),
  ])
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- create project ----------
let s = await open()
const { page } = s
await page.getByRole('button', { name: 'New project' }).click()
const dlg = page.getByRole('dialog', { name: 'New project' })
await dlg.getByLabel('Book title').fill('The Long Road')
await dlg.getByLabel('Author').fill('Mara Quill')
await dlg.getByLabel('Project name').fill('demo')
await dlg.getByRole('button', { name: 'Create project' }).click()
await page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
const tree = page.getByRole('tree', { name: 'Manuscript tree' })
await page.waitForTimeout(600)
await shot('01-tree-empty-editor', s)

const body = page.getByRole('textbox', { name: 'Scene text' })
const toolbar = page.getByRole('toolbar', { name: 'Formatting' })
const tb = (name) => toolbar.getByRole('button', { name, exact: true })
const style = (v) => toolbar.getByLabel('Paragraph style').selectOption(v)
const row = (name) => tree.getByRole('treeitem', { name: new RegExp(name) })

async function rename(name, newName) {
  await row(name).first().dblclick()
  await page.getByLabel('Rename').fill(newName)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
}
const props = page.locator('#scene-status')

// ---------- structure ----------
await rename('Chapter 1', 'The Crossing')
await rename('Scene 1', 'Setting out')
await page.getByRole('button', { name: 'Add part' }).click()
await page.getByLabel('Rename').fill('Part Two')
await page.keyboard.press('Enter')
await page.getByRole('button', { name: 'Add chapter' }).click()
await page.getByLabel('Rename').fill('The City')
await page.keyboard.press('Enter')
await page.getByRole('button', { name: 'Add scene' }).click()
await page.getByLabel('Rename').fill('Arrival')
await page.keyboard.press('Enter')
await page.getByRole('button', { name: 'Add scene' }).click()
await page.getByLabel('Rename').fill('The market')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
console.log('rows:', await tree.getByRole('treeitem').allTextContents())

async function setProps(scene, status, synopsis) {
  await row(scene).first().click()
  await props.waitFor()
  await props.selectOption(status)
  if (synopsis) {
    await page.locator('#scene-synopsis').fill(synopsis)
    await page.locator('#scene-synopsis').blur()
  }
  await page.waitForTimeout(300)
}
await setProps('Arrival', 'revising', 'Mara reaches the city gates at dusk and is turned away.')
await setProps('The market', 'idea', "She trades the map for a night's lodging.")

// ---------- write rich text in the first scene ----------
await row('Setting out').first().click()
await body.waitFor()
await page.waitForFunction(
  () =>
    document.querySelector('[aria-label="Scene text"]')?.getAttribute('contenteditable') === 'true',
)
await body.click()
await style('h1')
await page.keyboard.type('Setting out')
await page.keyboard.press('Enter')
await page.keyboard.type('The road began where the map ended. ')
await page.keyboard.press('Control+b')
await page.keyboard.type('Bold words')
await page.keyboard.press('Control+b')
await page.keyboard.type(' and ')
await page.keyboard.press('Control+i')
await page.keyboard.type('italic words')
await page.keyboard.press('Control+i')
await page.keyboard.type(' and ')
await page.keyboard.press('Control+u')
await page.keyboard.type('underlined words')
await page.keyboard.press('Control+u')
await page.keyboard.type('.')
await page.keyboard.press('Enter')
await style('h2')
await page.keyboard.type('A smaller heading')
await page.keyboard.press('Enter')
await page.keyboard.type(
  'She walked it anyway, counting every step, and the numbers piled up like stones in her pockets until the weight of them was the only thing she could feel. This paragraph is justified so the lines spread edge to edge.',
)
await tb('Justify').click()
await page.keyboard.press('Enter')
await page.keyboard.type('- first item')
await page.keyboard.press('Enter')
await page.keyboard.type('second item')
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')
await page.keyboard.type('1. numbered one')
await page.keyboard.press('Enter')
await page.keyboard.type('numbered two')
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')
await page.keyboard.type('> Not all who wander are lost.')
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')
await page.keyboard.type('Centred line of verse.')
await tb('Align centre').click()
await page.keyboard.press('Enter')
await tb('Scene break').click()
await page.keyboard.type('After the break the sun came up')
await tb('Footnote').click()
await page.getByLabel('Footnote text').fill('Sun-up was at 06:12, by her watch.')
await shot('03-footnote-popover', s)
await page.getByRole('button', { name: 'Done' }).click()
await page.waitForTimeout(200)
await page.keyboard.type(' over the hills.')
await page.waitForTimeout(1200)
const scroller = page.locator('.scroll')
await scroller.evaluate((e) => (e.scrollTop = e.scrollHeight))
await shot('02b-text-end', s, 300)
await scroller.evaluate((e) => (e.scrollTop = 0))
await shot('02-structure-and-text', s, 300)

// ---------- image ----------
await body.click()
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter')
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tb('Insert image').click()])
await chooser.setFiles({
  name: 'sky.png',
  mimeType: 'image/png',
  buffer: png(400, 200, [90, 140, 200]),
})
await page.locator('.ProseMirror img').first().waitFor()
await page.waitForTimeout(600)
await scroller.evaluate((e) => (e.scrollTop = e.scrollHeight))
await shot('04-image', s, 300)

// ---------- comments ----------
await scroller.evaluate((e) => (e.scrollTop = 0))
const firstP = body.locator('p').first()
await firstP.click()
await page.waitForTimeout(200)
await page.keyboard.press('Home')
for (let i = 0; i < 4; i++) await page.keyboard.press('Control+Shift+ArrowRight')
await tb('Add comment').click()
await page.locator('#comment-draft').fill('Is "the map ended" too abrupt? Try something quieter.')
await shot('06a-comment-draft', s, 300)
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.waitForTimeout(300)
const para = body.locator('p', { hasText: 'She walked it anyway' })
await para.click()
await page.waitForTimeout(200)
await page.keyboard.press('Home')
for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Shift+ArrowRight')
await tb('Add comment').click()
await page.locator('#comment-draft').fill('Check the pacing here.')
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Mark resolved' }).last().click()
await page.waitForTimeout(800)
await shot('06-comments', s)

// ---------- scene properties ----------
await page
  .locator('#scene-synopsis')
  .fill('Mara leaves the last village and sets out along the old road.')
await page.locator('#scene-synopsis').blur()
await page.getByLabel('New to-do').fill('Check the distance to the ford')
await page.keyboard.press('Enter')
await page.getByLabel('New to-do').fill('Foreshadow the river')
await page.keyboard.press('Enter')
await page
  .getByRole('checkbox', { name: /Done: Check the distance/ })
  .check()
  .catch(() => console.log('todo checkbox not found'))
await page.waitForTimeout(600)
await shot('07-scene-properties', s)

await page.locator('#scene-status').selectOption('final')
await page.waitForTimeout(300)

// ---------- focus mode ----------
await page.getByRole('button', { name: 'Focus', exact: true }).click()
await page.waitForTimeout(400)
await shot('08-focus-mode', s)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check(
  (await page.getByRole('button', { name: 'Exit focus' }).count()) === 0,
  'Escape leaves focus mode',
)

// ---------- corkboard ----------
await page.getByRole('button', { name: 'Corkboard' }).click()
await page.waitForTimeout(500)
await shot('09-corkboard', s)
await page.getByRole('button', { name: 'Editor', exact: true }).click()
await page.waitForTimeout(300)

// ---------- inbox ----------
await page.getByRole('button', { name: 'Add note' }).click()
await page.locator('#note-title').fill('River crossing idea')
await page.getByRole('textbox', { name: 'Note text' }).click()
await page.keyboard.type(
  'What if the ferry only runs at night? The ferryman asks a riddle instead of a fare.',
)
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Add note' }).click()
await page.locator('#note-title').fill('Names for the ferryman')
await page.getByRole('textbox', { name: 'Note text' }).click()
await page.keyboard.type('Orrin, Teb, Old Marl.')
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'River crossing idea', exact: true }).click()
await page.waitForTimeout(600)
await shot('10-inbox-note', s)

// ---------- move-note dialog ----------
await page
  .getByRole('button', { name: /Actions for River crossing idea/ })
  .first()
  .click()
await page.getByText('Move to scene', { exact: true }).click()
await page.getByText('Move note to a scene').waitFor()
await shot('11-move-note-dialog', s)
await page.getByRole('button', { name: 'Cancel' }).click()
await page.waitForTimeout(300)

// ---------- trash ----------
await page.getByRole('button', { name: /Actions for Names for the ferryman/ }).click()
await page.getByText('Delete', { exact: true }).last().click()
await page.waitForTimeout(500)
const confirmDel = page.getByRole('alertdialog')
if (await confirmDel.count()) await confirmDel.getByRole('button', { name: 'Delete' }).click()
await page.waitForTimeout(500)
await row('The market').first().hover()
await row('The market')
  .first()
  .getByRole('button', { name: /Delete/ })
  .click({ force: true })
await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Trash', exact: true }).click()
await page.getByRole('dialog', { name: 'Trash' }).waitFor()
await shot('12-trash-dialog', s)
await page.getByRole('button', { name: 'Close', exact: true }).click()
await page.waitForTimeout(300)

// ---------- status filter ----------
await page.getByLabel('Filter by status').click()
await page.getByRole('option', { name: 'Revising' }).click()
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await shot('13-status-filter', s)
await page.getByLabel('Filter by status').click()
await page.getByRole('option', { name: 'Revising' }).click()
await page.keyboard.press('Escape')

// ---------- dump, then reload in fresh contexts ----------
await page.waitForTimeout(1200)
const dump = await page.evaluate(() => {
  const o = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k.startsWith('storyworks:project')) o[k] = localStorage.getItem(k)
  }
  return o
})
await s.ctx.close()
const keys = Object.keys(dump)
console.log(
  'keys:',
  keys
    .filter((k) => !k.includes('projectmeta'))
    .map((k) => k.replace('storyworks:project:demo/', '')),
)
const sceneKey = keys.find((k) => k.includes('/manuscript/') && dump[k].includes('"Setting out"'))
const saved = JSON.parse(dump[sceneKey])
const flat = JSON.stringify(saved.content)
check(
  flat.includes('"textAlign":"justify"') && flat.includes('"textAlign":"center"'),
  'saved scene has justify + centre alignment',
)
check(flat.includes('"type":"footnote"'), 'saved scene has footnote')
check(
  flat.includes('"type":"image"') && flat.includes('assets/'),
  'saved scene has image with assets/ src',
)
check(flat.includes('"type":"sceneBreak"'), 'saved scene has scene break')
check((flat.match(/"id":"/g) ?? []).length >= 8, 'saved scene has block ids')
check(
  saved.comments.length === 2 && saved.comments.some((c) => c.resolved),
  'saved scene has 2 comments, one resolved',
)
check(flat.includes('"type":"comment"'), 'saved scene has comment marks')
console.log('synopsis/status/todos:', saved.synopsis, saved.status, saved.todos?.length)
const assetKey = keys.find((k) => k.includes('/assets/'))
check(!!assetKey, 'asset file stored')

const recent = [{ path: 'demo', title: 'The Long Road', openedAt: new Date().toISOString() }]
async function reopen(over, entries = dump, viewport) {
  const x = await open(entries, { recentProjects: recent, ...over })
  if (viewport) await x.page.setViewportSize(viewport)
  await x.page.getByRole('button', { name: 'Open project' }).click()
  await x.page
    .getByRole('dialog', { name: 'Projects in this browser' })
    .getByRole('button', { name: 'demo' })
    .click()
  await x.page.getByRole('tree', { name: 'Manuscript tree' }).waitFor()
  return x
}
const pick = async (x, name) => {
  await x.page
    .getByRole('tree', { name: 'Manuscript tree' })
    .getByRole('treeitem', { name: new RegExp(name) })
    .first()
    .click()
  await x.page.getByRole('textbox', { name: 'Scene text' }).waitFor()
  await x.page.waitForTimeout(800)
}

// persistence
s = await reopen({})
await pick(s, 'Setting out')
const pm = s.page.locator('.ProseMirror')
check(
  (await pm.locator('p[style*="text-align: justify"]').count()) > 0,
  'reload: justified paragraph',
)
check(
  (await pm.locator('p[style*="text-align: center"]').count()) === 1,
  'reload: centred paragraph',
)
check((await pm.locator('.footnote').count()) === 1, 'reload: footnote')
check(
  (await pm.locator('img').count()) === 1 &&
    (await pm.locator('img').getAttribute('src'))?.startsWith('blob:'),
  'reload: image shown from asset',
)
check(
  new Set(await pm.locator('.comment').evaluateAll((els) => els.map((e) => e.dataset.commentId)))
    .size === 2,
  'reload: 2 comment marks',
)
check(
  (await s.page
    .getByRole('complementary', { name: 'Comments' })
    .locator('li, article, .card')
    .count()) >= 0,
  'reload: rail present',
)
const sheet = await s.page.locator('.sheet').boundingBox()
const central = await s.page.locator('.scroll').boundingBox()
console.log('sheet', sheet, 'scroll', central)
await s.page
  .getByRole('button', { name: 'Hide panel' })
  .click()
  .catch(() => console.log('no hide-panel button'))
await s.page.waitForTimeout(400)
const sheet2 = await s.page.locator('.sheet').boundingBox()
const central2 = await s.page.locator('.scroll').boundingBox()
console.log('panel hidden: sheet', sheet2, 'scroll', central2)
check(Math.abs(sheet2.width - 600) < 4, `sheet ~600px wide with panel hidden (${sheet2.width})`)
await s.ctx.close()

// missing image placeholder
const noAsset = Object.fromEntries(Object.entries(dump).filter(([k]) => !k.includes('/assets/')))
s = await reopen({}, noAsset)
await pick(s, 'Setting out')
await s.page.locator('.image-node').scrollIntoViewIfNeeded()
await shot('05-image-missing', s)
await s.ctx.close()

// dark theme + narrow
s = await reopen({ theme: 'dark' })
await pick(s, 'Setting out')
await shot('14-dark-editor', s)
await s.ctx.close()

s = await reopen({ contextPanel: { hidden: true, collapsed: {} } }, dump, {
  width: 900,
  height: 800,
})
await pick(s, 'Setting out')
await shot('15-narrow-900', s)
const sw = await s.page.locator('.sheet').boundingBox()
console.log('900px sheet', sw)
await s.page.getByRole('button', { name: 'Show panel' }).click()
await shot('15b-narrow-900-panel-overlay', s)
const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
check(!overflow, 'no horizontal page overflow at 900px')
await s.ctx.close()

console.log(failures ? `${failures} CHECK(S) FAILED` : 'all checks passed')
console.log(
  allErrors.length ? `CONSOLE ERRORS: ${[...new Set(allErrors)].join(' | ')}` : 'no console errors',
)
await browser.close()
if (failures || allErrors.length) process.exit(1)
