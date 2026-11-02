// Usage: node scripts/screenshots-m8.mjs <outDir>  (needs `yarn dev` on :1420, Playwright chromium, pdftotext, unzip, soffice)
// Browser build only. Seeds a book, drives the Export page, exports PDF and DOCX (downloads) and checks the files.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: screenshots-m8.mjs <outDir>')
mkdirSync(out, { recursive: true })
const ORIGIN = 'http://localhost:1420'
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

const settingsJson = (theme, language, recents) => JSON.stringify({ version: 2, theme, language, uiZoom: 100, editorFontSize: 18, contextPanel: { hidden: false, collapsed: {} }, recentProjects: recents.map((p) => ({ path: p, title: p, openedAt: new Date().toISOString() })) })

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

const T = (text, marks) => ({ type: 'text', text, ...(marks ? { marks: marks.map((type) => ({ type })) } : {}) })
const P = (id, ...inl) => ({ type: 'paragraph', attrs: { id, textAlign: 'left' }, content: inl })
const D = (year, month, day) => ({ year, month, day })
const node = (id, title, date, x) => ({ id, title, description: { type: 'doc', content: [] }, date, color: null, tag: null, branchId: null, pos: { x, y: 0 }, codexIds: [], ruleIds: [] })

function buildBook(baseBook) {
  const out = { ...baseBook }
  const m = JSON.parse(baseBook['project.json'])
  const typeId = (title) => m.codexTypes.find((t) => t.title === title).id
  const put = (rel, obj) => (out[rel] = JSON.stringify(obj, null, 1))
  const main = JSON.parse(baseBook[m.timelines[0].path])
  main.nodes = [node('n-a', 'Siege begins', D(500, 2, 1), 0), node('n-b', 'Siege ends', D(510, 5, 10), 260), node('n-c', 'Coronation', D(520, 9, 3), 520)]
  main.edges = []
  put(m.timelines[0].path, main)
  const ent = (id, name, type, extra) => { put(`codex/${id}.json`, { version: 2, id, typeId: typeId(type), name, ...extra }); m.codexEntries.push({ id, path: `codex/${id}.json`, title: name }) }
  const note = (t) => ({ type: 'doc', content: [{ type: 'paragraph', attrs: { id: `nb-${t}` }, content: [T(t)] }] })
  ent('en-aldric', 'Aldric', 'Character', { aliases: ['The Grey'], includeInAppendices: true, appendixText: 'A weary knight of the north.', notes: note('SECRETNOTE') })
  ent('en-mara', 'Mara', 'Character', { includeInAppendices: false, appendixText: 'HIDDENTEXT' })
  ent('en-harrow', 'Harrow', 'Place', { includeInAppendices: true, appendixText: 'A walled town on the river.' })

  const ch1 = m.manuscript[0]
  ch1.title = 'The Siege'
  const s1 = ch1.children[0]
  s1.title = 'Walls'
  put(s1.path, {
    version: 3, id: s1.id, title: 'Walls', status: 'draft', synopsis: '', wordCount: 60,
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { id: 'b-h', level: 2, textAlign: 'left' }, content: [T('The north wall')] },
      P('b-1', T('Aldric stood on the '), T('wall', ['bold']), T(' and watched the '), T('river', ['italic']), { type: 'footnote', content: [T('The river Harrow, in flood.')] }, T('. Zażółć gęślą jaźń.')),
      { type: 'paragraph', attrs: { id: 'b-j', textAlign: 'justify' }, content: [T('This paragraph is justified and goes on long enough to wrap across several lines in the exported page so the alignment is visible. '.repeat(3))] },
      { type: 'sceneBreak', attrs: { id: 'b-sb' } },
      { type: 'bulletList', content: [{ type: 'listItem', content: [P('b-l1', T('first'))] }, { type: 'listItem', content: [P('b-l2', T('second'))] }] },
      { type: 'blockquote', attrs: { id: 'b-q', textAlign: 'left' }, content: [P('b-q1', T('Hold the line.'))] },
      P('b-c', T('Commented text', ['comment'])),
      { type: 'image', attrs: { id: 'b-img', src: 'assets/missing.png' } },
    ] },
    todos: [], comments: [{ id: 'cm-1', text: 'PRIVATECOMMENT', createdAt: new Date().toISOString(), resolved: false }],
    links: [{ id: 'lk-1', from: { item: s1.id, block: 'b-1' }, to: { item: 'en-aldric' }, kind: 'codex' }],
  })
  const mkScene = (id, title, text) => { put(`manuscript/${id}.json`, { version: 3, id, title, status: 'draft', synopsis: '', wordCount: 12, content: { type: 'doc', content: [P(`${id}-b`, T(text))] }, todos: [], comments: [], links: [] }); return { id, type: 'scene', title, path: `manuscript/${id}.json`, children: [] } }
  m.manuscript.push({ id: 'part-2', type: 'part', title: 'Part Two', children: [
    { id: 'ch-2', type: 'chapter', title: 'The Aftermath', children: [mkScene('sc-2', 'Quiet', 'CHAPTERTWOTEXT The camp was quiet.')] },
    { id: 'ch-3', type: 'chapter', title: 'The Crown', children: [mkScene('sc-3', 'Crown', 'CHAPTERTHREETEXT The crown was placed.')] },
  ] })
  out['project.json'] = JSON.stringify(m, null, 1)
  return out
}

const seedStorage = (name, book, theme, language) => {
  const ls = [{ name: SETTINGS_KEY, value: settingsJson(theme, language, [name]) }]
  const t = String(Date.now() - 10_000)
  for (const [k, v] of Object.entries(book)) { ls.push({ name: `${PFX}${name}/${k}`, value: v }); ls.push({ name: `${META}${name}/${k}`, value: t }) }
  return { cookies: [], origins: [{ origin: ORIGIN, localStorage: ls }] }
}

async function openBook(name, book, theme, language) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: language === 'pl' ? 'pl-PL' : 'en-US', storageState: seedStorage(name, book, theme, language), acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  const L = language === 'pl' ? pl : en
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.getByRole('button', { name: L.welcome.openProject }).click()
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('tree', { name: L.write.tree }).waitFor()
  await page.waitForTimeout(900)
  await page.getByRole('link', { name: new RegExp(`^\\s*${L.sections.export}`) }).first().click()
  await page.getByRole('heading', { name: L.export.title, level: 1 }).waitFor()
  await page.waitForTimeout(500)
  return { ctx, page, errors, L }
}
const shot = async (name, s) => { await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(out, `${name}.png`), fullPage: true }); console.log(`${name}${s.errors.length ? ' ERRORS ' + [...new Set(s.errors)] : ' ok'}`) }

async function exportFile(s, file) {
  const dl = s.page.waitForEvent('download', { timeout: 30000 })
  await s.page.getByRole('button', { name: s.L.export.run }).click()
  const d = await dl.catch(async (e) => { console.log('ERR banner:', await s.page.locator('.err').allInnerTexts()); throw e })
  const path = join(out, file)
  await d.saveAs(path)
  return path
}
const pickFormat = async (s, label) => {
  await s.page.getByRole('combobox', { name: s.L.export.format }).click()
  await s.page.getByRole('option', { name: label }).click()
}
const pdfText = (p) => execFileSync('pdftotext', ['-layout', p, '-'], { encoding: 'utf8' })
const docxXml = (p) => ['word/document.xml', 'word/footnotes.xml'].map((f) => execFileSync('unzip', ['-p', p, f], { encoding: 'utf8' })).join('\n')

async function flow(theme, language) {
  tag = `${theme}-${language}`
  const book = buildBook(await bootBase())
  const s = await openBook('main', book, theme, language)
  const { page, L } = s
  const N = (n) => `${n}-${theme}-${language}`
  check((await page.locator('ul.chapters li').count()) === 3, 'three chapters listed, all selected')
  check(await page.getByRole('button', { name: L.export.run }).isEnabled(), 'export enabled with the whole book')
  await shot(N('export-default'), s)

  await page.getByRole('button', { name: L.export.selectNone }).click()
  check(await page.getByRole('button', { name: L.export.run }).isDisabled(), 'nothing selected: export blocked')
  check(await page.getByText(L.export.nothingSelected).isVisible(), 'nothing selected: reason shown')
  await shot(N('export-nothing'), s)
  await page.getByRole('button', { name: L.export.selectAll }).click()

  for (const k of ['personae', 'glossary', 'chronology']) await page.getByRole('switch', { name: L.export.appendix[k] }).click()
  await shot(N('export-options'), s)
  if (language !== 'en' || theme !== 'light') { await s.ctx.close(); return }

  // PDF, whole book + appendices
  const pdf = await exportFile(s, 'book.pdf')
  await page.getByRole('status').filter({ hasText: /downloaded|pobrany/ }).waitFor()
  let t = pdfText(pdf)
  check(/The Siege/.test(t) && /The Aftermath/.test(t) && /The Crown/.test(t), 'PDF: all chapter titles')
  check(/Part Two/.test(t), 'PDF: part title')
  check(/Zażółć gęślą jaźń/.test(t), 'PDF: Polish characters')
  check(/The river Harrow, in flood/.test(t), 'PDF: footnote text (end-of-chapter notes)')
  check(/Dramatis personae/.test(t) && /A weary knight of the north/.test(t) && /Glossary/.test(t) && /A walled town/.test(t) && /Chronology/.test(t) && /Siege begins/.test(t), 'PDF: three appendices')
  check(!/SECRETNOTE|HIDDENTEXT|PRIVATECOMMENT/.test(t), 'PDF: no private notes, hidden entries or comments')
  check(/missing image/.test(t), 'PDF: missing-image placeholder')
  check(/missing\.png/.test(await page.locator('.warn').innerText()), 'warning lists the missing image')
  await shot(N('export-done'), s)

  // DOCX
  await pickFormat(s, L.export.formats.docx)
  const docx = await exportFile(s, 'book.docx')
  const x = docxXml(docx)
  check(/The Aftermath/.test(x) && /The Crown/.test(x) && /Dramatis personae/.test(x), 'DOCX: chapters and appendices')
  check(/The river Harrow, in flood/.test(x), 'DOCX: native footnote text')
  check(!/SECRETNOTE|HIDDENTEXT|PRIVATECOMMENT/.test(x), 'DOCX: no private notes or comments')
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, docx], { stdio: 'ignore' })
  t = pdfText(join(out, 'book.pdf'))
  check(/Aldric stood on the wall/.test(t) && /CHAPTERTWOTEXT/.test(t), 'DOCX opens in LibreOffice with the text')

  // chapter subset
  await page.locator('ul.chapters li', { hasText: 'The Aftermath' }).getByRole('checkbox').click()
  await pickFormat(s, L.export.formats.pdf)
  const pdf2 = await exportFile(s, 'subset.pdf')
  t = pdfText(pdf2)
  check(!/CHAPTERTWOTEXT|The Aftermath/.test(t.replace(/Contents[\s\S]*?\f/, '')) && /CHAPTERTHREETEXT/.test(t), 'PDF subset: unselected chapter absent, others present')
  await shot(N('export-subset'), s)
  await s.ctx.close()
}

await flow('light', 'en')
await flow('dark', 'en')
await flow('light', 'pl')
await browser.close()
console.log(failures ? `${failures} FAILED` : 'all checks passed')
process.exit(failures ? 1 : 0)
