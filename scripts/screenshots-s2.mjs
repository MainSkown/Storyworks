// Usage: node scripts/screenshots-s2.mjs <outDir>  (needs `yarn dev` on :1420 and Playwright chromium)
// Browser build only. S2: Fountain import (+ skipped list), paste, page count, Stats, export PDF/DOCX/Fountain, round trip.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-s2.mjs <outDir>')
mkdirSync(out, { recursive: true })
const ORIGIN = 'http://localhost:1420'
const en = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/locales/en.json'), 'utf8'))
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({ executablePath: join(base, dir, 'chrome-linux64/chrome'), args: ['--no-sandbox'] })
const L = en
let failures = 0
const check = (c, m) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`) }

// A Fountain script with a title page, sections, notes, a boneyard and a synopsis (to fill the skipped list).
let fountain = `Title: Night Shift\nAuthor: Mara Quill\nContact: mara@example.com\nDraft date: 3 November 2026\n\n# Act one\n\n`
for (let i = 1; i <= 22; i++) {
  if (i === 12) fountain += `# Act two\n\n`
  fountain += `${i % 2 ? 'INT.' : 'EXT.'} ${['CAFE', 'MARKET', 'ROOFTOP', 'STATION'][i % 4]} ${i} - ${i % 3 ? 'DAY' : 'NIGHT'}\n\n= Synopsis of scene ${i}\n\nRain taps the window. Anna looks up from her *coffee* and counts the people in the room. [[check this]]\n\nANNA\n(quietly)\nI did not think it would look like this. I imagined more people, more noise and more light. But it is quiet. Too quiet to be real. Tell me this is not a dream.\n\nTOMEK\nThis is not a dream.\n\n${i % 3 === 0 ? 'CUT TO:\n\n' : ''}`
}
fountain += `/* old draft */\n===\n`

async function openProject(title, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-US', acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: L.welcome.newProject }).click()
  const dlg = page.getByRole('dialog', { name: L.newProject.title })
  await page.waitForTimeout(600)
  await dlg.getByTestId('kind-card').filter({ hasText: L.newProject.kind.screenplay }).click({ force: true })
  await dlg.getByLabel(L.newProject.projectTitle, { exact: true }).fill(title)
  await dlg.getByLabel(L.newProject.author).fill('Mara Quill')
  await dlg.getByLabel(L.newProject.folderName).fill(name)
  await dlg.getByRole('button', { name: L.newProject.create }).click()
  await page.getByRole('tree', { name: L.write.tree }).waitFor()
  await page.waitForTimeout(800)
  if (await page.locator('.tour-root').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(400) }
  return { ctx, page, errors }
}
const shot = async (name, s) => { await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(out, `${name}.png`), fullPage: true }); console.log(`${name}${s.errors.length ? ' ERRORS ' + [...new Set(s.errors)] : ' ok'}`) }
const nav = (s, key) => s.page.getByRole('link', { name: new RegExp(`^\\s*${L.sections[key]}`) }).first().click()

async function importFountain(s, text, doShot) {
  const { page } = s
  await page.getByRole('button', { name: L.import.open }).click()
  const dlg = page.getByRole('dialog', { name: L.import.fountain.title })
  await dlg.waitFor()
  await page.locator('input[type=file]').setInputFiles({ name: 'night-shift.fountain', mimeType: 'text/plain', buffer: Buffer.from(text) })
  await dlg.locator('ul.preview').waitFor()
  if (doShot) await shot('import-preview', s)
  const summary = await dlg.innerText()
  await dlg.getByRole('button', { name: L.import.import, exact: true }).click()
  await dlg.getByRole('button', { name: L.import.done }).click()
  return summary
}

/* 1. Import, status bar, paste, stats, export ---------------------------------------- */
const s = await openProject('Night Shift', 'night')
{
  const { page } = s
  const summary = await importFountain(s, fountain, true)
  check(/2 chapters, 22 scenes/.test(summary), `import summary (${summary.match(/\d+ chapters?, \d+ scenes?, \d+ words? selected/)?.[0]})`)
  check(/Not imported/.test(summary) && /Notes/.test(summary) && /Synopsis/.test(summary), 'skipped list shows notes and synopsis')
  await page.waitForTimeout(800)
  await page.locator('.statusbar').waitFor()
  const bar = (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ')
  console.log('statusbar:', bar)
  const pages = Number(bar.match(/Pages: (\d+)/)?.[1])
  check(pages > 5, `status bar shows pages (${pages})`)
  await shot('write-statusbar', s)

  // paste a Fountain snippet at the end of the editor
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.press('Control+End')
  const before = await page.locator('.ProseMirror > *').count()
  await page.evaluate(() => {
    const el = document.querySelector('.ProseMirror')
    const dt = new DataTransfer()
    dt.setData('text/plain', '\nINT. LIGHTHOUSE - NIGHT\n\nThe lamp turns.\n\nMARA\nWho is there?\n')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(500)
  const types = await page.locator('.ProseMirror > *').evaluateAll((els) => els.map((e) => e.getAttribute('data-element')))
  console.log('pasted types tail:', types.slice(before - 1).join(','))
  check(types.slice(-4).join() === 'sceneHeading,action,character,dialogue', 'pasted Fountain became typed elements')
  await shot('paste', s)
  await page.waitForTimeout(1500)

  await nav(s, 'stats')
  await page.getByRole('heading', { name: L.stats.script.title }).waitFor()
  await shot('stats', s)

  await nav(s, 'export')
  await page.getByRole('heading', { name: L.export.title, level: 1 }).waitFor()
  await shot('export-pdf', s)
  const sumText = (await page.locator('.summary').innerText()).replace(/\s+/g, ' ')
  console.log('summary:', sumText)
  const exportedPages = Number(sumText.match(/Pages: (\d+)/)?.[1])

  const run = async (file) => {
    const dl = page.waitForEvent('download', { timeout: 30000 })
    await page.getByRole('button', { name: L.export.run }).click()
    const d = await dl.catch(async (e) => { console.log('ERR banner:', await page.locator('.err').allInnerTexts()); throw e })
    const path = join(out, file)
    await d.saveAs(path)
    return path
  }
  const pick = async (label) => { await page.getByRole('combobox', { name: L.export.format }).click(); await page.getByRole('option', { name: label }).click() }
  await run('night-shift.pdf')
  writeFileSync(join(out, 'status-pages.txt'), String(exportedPages))
  await pick(L.export.formats.docx)
  await run('night-shift.docx')
  await pick(L.export.formats.fountain)
  await shot('export-fountain', s)
  const fpath = await run('night-shift.fountain')
  check(readFileSync(fpath, 'utf8').includes('# Act two'), 'Fountain export has the sections')
  await pick(L.export.formats.pdf)
  await page.getByRole('button', { name: L.export.selectNone }).click()
  await shot('export-nothing-selected', s)
  check(await page.getByRole('button', { name: L.export.run }).isDisabled(), 'export disabled with nothing selected')
  errorsOk('main')
}
function errorsOk(tag) { check(s.errors.length === 0, `no console errors [${tag}] ${[...new Set(s.errors)].join(' | ')}`) }
await s.ctx.close()

/* 2. Round trip: import the exported Fountain into a new project ----------------------- */
{
  const s2 = await openProject('Round Trip', 'trip')
  const exported = readFileSync(join(out, 'night-shift.fountain'), 'utf8')
  const summary = await importFountain(s2, exported, false)
  console.log('roundtrip summary:', summary.match(/\d+ chapters?, \d+ scenes?, \d+ words? selected/)?.[0])
  check(/2 chapters, 23 scenes/.test(summary) || /2 chapters, 22 scenes/.test(summary), 'round trip keeps sequences and scenes')
  check(!/Notes|Synopsis|Boneyard|Centered|Page breaks/.test(summary), 'round trip skips nothing but the title page keys')
  await s2.page.waitForTimeout(1000)
  console.log('roundtrip statusbar:', (await s2.page.locator('.statusbar').innerText()).replace(/\s+/g, ' '))
  await s2.ctx.close()
}
await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
