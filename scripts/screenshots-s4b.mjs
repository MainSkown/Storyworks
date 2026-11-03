// Usage: ORIGIN=http://localhost:1420 node scripts/screenshots-s4b.mjs <outDir>  (needs `yarn dev` and Playwright chromium)
// Browser build only. S4 canvas fixes: back edges, branch layout, keep new node in view, focus into/out of the inspector.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-s4b.mjs <outDir>')
mkdirSync(out, { recursive: true })
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:1420'
const root = join(import.meta.dirname, '..')
const L = JSON.parse(readFileSync(join(root, 'src/locales/en.json'), 'utf8'))
const C = L.game.conversation
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })
let failures = 0
const check = (c, m) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`) }

async function open(viewport, title, folder) {
  const ctx = await browser.newContext({ viewport, locale: 'en-US', colorScheme: 'light' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: L.welcome.newProject }).click()
  const dlg = page.getByRole('dialog', { name: L.newProject.title })
  await page.waitForTimeout(600)
  await dlg.getByTestId('kind-card').filter({ hasText: L.newProject.kind.game }).click({ force: true })
  await dlg.getByLabel(L.newProject.projectTitle, { exact: true }).fill(title)
  await dlg.getByLabel(L.newProject.author).fill('Mara Quill')
  await dlg.getByLabel(L.newProject.folderName).fill(folder)
  await dlg.getByRole('button', { name: L.newProject.create }).click()
  await page.getByRole('heading', { name: title }).first().waitFor({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(1000)
  if (await page.locator('.tour-root').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(400) }
  await page.getByRole('button', { name: L.outline.addConversation, exact: true }).click()
  await page.locator('input.rename').fill('Guard at the gate')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  return { ctx, page, errors }
}
const A = (page, k) => page.getByRole('button', { name: C.addOf.replace('{type}', C.type[k]) })
const insp = (page) => page.getByRole('complementary', { name: C.inspector })
const nodeEl = (page, text) => page.locator('[data-graph-node]').filter({ hasText: text }).first()
const fit = async (page) => { await page.getByRole('button', { name: L.timelineView.fit }).click(); await page.waitForTimeout(450) }
const pick = async (sel, re) => {
  const v = await sel.evaluate((el, src) => { const r = new RegExp(src); const o = [...el.options].find((x) => r.test(x.textContent.trim())); return o ? o.value : null }, re.source)
  if (v === null) throw new Error('no option ' + re)
  await sel.selectOption(v)
}
const typeLine = async (page, text) => {
  const ed = insp(page).locator('.ProseMirror')
  await ed.waitFor(); await ed.click(); await page.keyboard.type(text); await page.waitForTimeout(500)
}
const inView = async (page, text) => {
  const b = await nodeEl(page, text).boundingBox()
  const r = await page.locator('.graph-canvas').boundingBox()
  return !!b && b.x >= r.x && b.y >= r.y && b.x + b.width <= r.x + r.width && b.y + b.height <= r.y + r.height
}

// ---------- 1. back edges + branch layout ----------
{
  const { page, ctx, errors } = await open({ width: 1600, height: 900 }, 'Gate Watch', 'gatewatchb')
  await page.getByRole('button', { name: C.addFirst }).click()
  await typeLine(page, 'Halt! Who goes there?')
  await A(page, 'choice').click(); await page.waitForTimeout(500)
  for (const t of ['Fine. Move along, then.', 'Very well, pass.', 'Hmm, wait a moment.']) {
    await nodeEl(page, 'Choice').evaluate((e) => e.click()); await page.waitForTimeout(250)
    await A(page, 'lines').click(); await page.waitForTimeout(500)
    await typeLine(page, t)
  }
  await nodeEl(page, 'Choice').evaluate((e) => e.click()); await page.waitForTimeout(250)
  await A(page, 'end').click(); await page.waitForTimeout(500)
  // options: three forward branches, "Ask again" back to the first node, "Wait" to itself
  await nodeEl(page, 'Choice').evaluate((e) => e.click()); await page.waitForTimeout(300)
  const optText = ['Show the seal', 'Answer politely', 'Plead', 'Ask again', 'Wait']
  const targets = [/^End/, /^Lines: Fine/, /^Lines: Very/, /^Lines: Halt/, /^Choice/]
  for (let i = 0; i < 5; i++) {
    await insp(page).getByRole('button', { name: C.options.add }).click(); await page.waitForTimeout(150)
    const o = insp(page).locator('.opt').nth(i)
    await o.getByLabel(C.options.text.replace('{n}', i + 1)).fill(optText[i])
    await pick(o.getByLabel(C.options.target.replace('{n}', i + 1)), targets[i])
  }
  // a Lines node that returns to the first one
  await nodeEl(page, 'Hmm, wait').evaluate((e) => e.click()); await page.waitForTimeout(250)
  await pick(insp(page).getByLabel(C.target.label), /^Lines: Halt/)
  await page.waitForTimeout(400)
  await fit(page)
  { const r0 = await page.locator('.graph-canvas').boundingBox(); await page.mouse.click(r0.x + 30, r0.y + 30) }
  await page.waitForTimeout(300)
  await fit(page)
  await page.screenshot({ path: join(out, '01-loop-and-branches.png') })
  const stored = await page.evaluate(() => Object.entries(localStorage).find(([k, v]) => k.startsWith('storyworks:project:gatewatchb/') && /"startNodeId"/.test(v))?.[1])
  const nodes = JSON.parse(stored).nodes
  const pos = nodes.map((n) => `${n.type}@${n.x},${n.y}`)
  console.log('positions', pos.join(' | '))
  const keys = new Set(nodes.map((n) => `${n.x},${n.y}`))
  check(keys.size === nodes.length, 'no two nodes share a position')
  const boxes = await page.locator('[data-graph-node]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.x, r.y, r.right, r.bottom]))
  let overlap = 0
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) overlap++
  }
  check(overlap === 0, `no overlapping nodes (${overlap})`)
  check(errors.length === 0, `no page errors ${errors.join(' | ')}`)
  // zoomed screenshot of the loop edges
  const root = await page.locator('.graph-canvas').boundingBox()
  await page.screenshot({ path: join(out, '02-loop-and-branches-crop.png'), clip: { x: root.x, y: root.y, width: Math.min(root.width, 1100), height: root.height } })
  // edge selection still works (BEFORE=1 skips: the old canvas has no label pills)
  if (!process.env.BEFORE) {
  // edge selection still works
    const labels = await page.locator('.elabel').evaluateAll((e) => e.map((x) => x.textContent.trim()))
    console.log('edge labels', labels.join(' | '))
    await page.locator('.elabel', { hasText: 'Wait' }).click()
    await page.waitForTimeout(300)
    check((await page.locator('.vue-flow__edge.selected').count()) === 1, 'clicking an edge label selects the edge')
    await page.keyboard.press('Delete'); await page.waitForTimeout(500)
    check((await page.locator('.elabel', { hasText: 'Wait' }).count()) === 0, 'Delete on the selected edge clears it (Wait loop gone)')
  }
  await ctx.close()
}

// ---------- 2. new node stays in view; Enter/Escape focus ----------
{
  const { page, ctx, errors } = await open({ width: 1400, height: 620 }, 'Long Talk', 'longtalk')
  await page.getByRole('button', { name: C.addFirst }).click()
  await typeLine(page, 'Line zero')
  let allIn = true
  for (let i = 1; i <= 7; i++) {
    await A(page, 'lines').click(); await page.waitForTimeout(600)
    await typeLine(page, `Line number ${i}`)
    await page.waitForTimeout(500)
    const ok = await inView(page, `Line number ${i}`)
    if (!ok) { allIn = false; console.log('not in view after add', i) }
  }
  check(allIn, 'each new node is fully in view right after it is added')
  { const r0 = await page.locator('.graph-canvas').boundingBox(); await page.mouse.click(r0.x + 30, r0.y + 30) }
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(out, '03-long-chain.png') })
  // Enter opens inspector with focus inside; Escape returns to the node
  await nodeEl(page, 'Line number 3').focus()
  await page.keyboard.press('Enter'); await page.waitForTimeout(600)
  const inInsp = await page.evaluate(() => !!document.activeElement?.closest('aside'))
  check(inInsp, 'Enter moves focus into the inspector')
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  const back = await page.evaluate(() => document.activeElement?.closest('[data-graph-node]')?.textContent?.includes('Line number 3'))
  check(!!back, 'Escape returns focus to the node')
  check(errors.length === 0, `no page errors ${errors.join(' | ')}`)
  await ctx.close()
}
await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
