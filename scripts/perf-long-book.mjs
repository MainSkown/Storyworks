// Usage: node scripts/perf-long-book.mjs [--parts 10 --chapters 10 --scenes 5 --words 600]
// Needs `yarn dev` on :1420 and a Playwright chromium. Generates a ~500-scene / ~300k-word project
// (written straight into the browser build's virtual folder in localStorage) and times the Write UI.
import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : def
}
const PARTS = arg('parts', 10)
const CHAPTERS = arg('chapters', 10)
const SCENES = arg('scenes', 5)
const WORDS = arg('words', 600)
const URL = 'http://localhost:1420/'
const ROOT = 'longbook'

// ---------- generate ----------
let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const VOCAB =
  'the road ran beyond river stone light shadow window door night morning silence voice hand walked turned said knew never always small heavy cold bright slow quick after before under over between city gate market harbour lamp rain wind map letter bread salt thread'.split(
    ' ',
  )
const word = () => VOCAB[Math.floor(rnd() * VOCAB.length)]
const sentence = (n) => {
  const w = Array.from({ length: n }, word)
  w[0] = w[0][0].toUpperCase() + w[0].slice(1)
  return w.join(' ') + '.'
}
const text = (t, marks) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) })
const para = (n) => {
  const parts = []
  let left = n
  while (left > 0) {
    const k = Math.min(left, 6 + Math.floor(rnd() * 10))
    parts.push(sentence(k))
    left -= k
  }
  const s = parts.join(' ')
  const content =
    rnd() < 0.25
      ? [text(s.slice(0, 20)), text(s.slice(20, 50), [{ type: 'bold' }]), text(s.slice(50))]
      : [text(s)]
  return { type: 'paragraph', attrs: { id: randomUUID() }, content }
}

function sceneDoc(n, words) {
  const blocks = [
    {
      type: 'heading',
      attrs: { level: 2, id: randomUUID() },
      content: [text(`Marker${n}z opening`)],
    },
  ]
  let left = words - 3
  while (left > 0) {
    const k = Math.min(left, 40 + Math.floor(rnd() * 50))
    blocks.push(para(k))
    left -= k
  }
  const count = blocks.reduce(
    (sum, b) => sum + b.content.reduce((s, c) => s + c.text.trim().split(/\s+/).length, 0),
    0,
  )
  return { content: { type: 'doc', content: blocks }, count }
}

const STATUS_POOL = [
  ...Array(1).fill('idea'),
  ...Array(5).fill('draft'),
  ...Array(2).fill('revising'),
  ...Array(2).fill('final'),
]
const files = {}
const manuscript = []
const sceneIds = []
let n = 0
let totalWords = 0
for (let p = 1; p <= PARTS; p++) {
  const part = { id: randomUUID(), type: 'part', title: `Part ${p}`, children: [] }
  for (let c = 1; c <= CHAPTERS; c++) {
    const ch = { id: randomUUID(), type: 'chapter', title: `Chapter ${p}.${c}`, children: [] }
    for (let s = 1; s <= SCENES; s++) {
      n++
      const id = randomUUID()
      const path = `manuscript/${id}.json`
      const { content, count } = sceneDoc(n, WORDS - 25 + Math.floor(rnd() * 50))
      totalWords += count
      files[path] = JSON.stringify({
        version: 2,
        id,
        title: `Scene ${n}`,
        status: STATUS_POOL[Math.floor(rnd() * STATUS_POOL.length)],
        synopsis: n % 3 === 0 ? '' : sentence(12 + Math.floor(rnd() * 12)),
        wordCount: count,
        content,
        todos: [],
        comments: [],
        links: [],
      })
      ch.children.push({ id, type: 'scene', title: `Scene ${n}`, path, children: [] })
      sceneIds.push(id)
    }
    part.children.push(ch)
  }
  manuscript.push(part)
}
files['project.json'] = JSON.stringify({
  version: 2,
  kind: 'book',
  title: 'The Long Book',
  author: 'Perf Tester',
  language: 'en',
  createdAt: new Date().toISOString(),
  manuscript,
})
console.log(`generated ${n} scenes, ~${totalWords} words`)

// ---------- browser ----------
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base)
  .filter((d) => d.startsWith('chromium-'))
  .sort()
  .pop()
const browser = await chromium.launch({
  executablePath: join(base, dir, 'chrome-linux64/chrome'),
  args: ['--no-sandbox'],
})
const now = Date.now()
const ls = [
  {
    name: 'storyworks:settings.json',
    value: JSON.stringify({
      version: 2,
      theme: 'light',
      language: 'en',
      uiZoom: 100,
      editorFontSize: 18,
      contextPanel: { hidden: false, collapsed: {} },
      recentProjects: [{ path: ROOT, title: 'The Long Book', openedAt: new Date().toISOString() }],
    }),
  },
]
for (const [p, v] of Object.entries(files)) {
  ls.push({ name: `storyworks:project:${ROOT}/${p}`, value: v })
  ls.push({ name: `storyworks:projectmeta:${ROOT}/${p}`, value: String(now - 10_000) })
}
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  storageState: { cookies: [], origins: [{ origin: 'http://localhost:1420', localStorage: ls }] },
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
await page.goto(URL)
await page.getByRole('heading', { level: 1 }).first().waitFor()

const results = []
const record = (name, ms, target, note = '') => {
  results.push({ name, ms, target, note })
  console.log(`${name}: ${ms.toFixed(1)} ms ${note}`)
}

// helpers living in the page
await page.evaluate(() => {
  window.__frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
  window.__waitFor = (cond, max = 15000) =>
    new Promise((resolve, reject) => {
      const t0 = performance.now()
      const tick = () => {
        if (cond()) return resolve()
        if (performance.now() - t0 > max) return reject(new Error('timeout waiting'))
        requestAnimationFrame(tick)
      }
      tick()
    })
  window.__long = []
  new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => e.duration))).observe({
    type: 'longtask',
    buffered: true,
  })
})

// ---------- open ----------
await page.getByRole('button', { name: 'Open project' }).click()
const dlg = page.getByRole('dialog', { name: 'Projects in this browser' })
const target = dlg.getByRole('button', { name: ROOT })
await target.waitFor()
const t0 = Date.now()
await target.click()
const wantRows = PARTS + PARTS * CHAPTERS + n
await page.waitForFunction(
  (k) => document.querySelectorAll('[role=treeitem]').length >= k,
  wantRows,
  { polling: 'raf', timeout: 60000 },
)
record('open: tree shown', Date.now() - t0, 2000)
await page.waitForFunction(
  (k) => document.querySelectorAll('[role=treeitem] .dot').length >= k,
  n,
  { polling: 'raf', timeout: 60000 },
)
record('open: scene statuses loaded', Date.now() - t0, 2000)
await page.waitForTimeout(500)


// ---------- scene select / switch ----------
async function selectScene(i) {
  return page.evaluate(
    async ([id, k]) => {
      const bar = document.querySelector('.statusbar')
      const t = performance.now()
      document.querySelector(`[data-row-id="${id}"]`).click()
      await window.__waitFor(() => {
        const ed = document.querySelector('.ProseMirror')
        return ed && ed.textContent.includes(`Marker${k}z`)
      })
      const tEditor = performance.now() - t
      await window.__waitFor(() => /Scene: [1-9]/.test(bar.textContent))
      await window.__frame()
      return [tEditor, performance.now() - t]
    },
    [sceneIds[i], i + 1],
  )
}
const [firstEditor, firstAll] = await selectScene(0)
record('select first scene: editor content visible', firstEditor, 200, `(painted ${firstAll.toFixed(0)})`)
await page.waitForTimeout(500)
const switches = []
const stride = Math.floor(n / 21)
for (let k = 1; k <= 20; k++) {
  switches.push(await selectScene(k * stride))
  await page.waitForTimeout(60)
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length
record('switch scene (avg of 20): editor visible', avg(switches.map((s) => s[0])), 200)
record('switch scene (max of 20): editor visible', Math.max(...switches.map((s) => s[0])), 200)
record('switch scene (avg of 20): painted + status bar', avg(switches.map((s) => s[1])), 200)

// ---------- typing ----------
const body = page.getByRole('textbox', { name: 'Scene text' })
await page.waitForFunction(
  () => document.querySelector('[aria-label="Scene text"]')?.getAttribute('contenteditable') === 'true',
)
await body.click()
await page.keyboard.press('Control+End')
await page.evaluate(() => {
  window.__keys = []
  addEventListener(
    'keydown',
    () => {
      const k = { t0: performance.now(), js: 0, frame: 0 }
      window.__keys.push(k)
      requestAnimationFrame(() => setTimeout(() => (k.frame = performance.now() - k.t0)))
    },
    true,
  )
  addEventListener('keyup', () => {
    const k = window.__keys.at(-1)
    if (k && !k.js) k.js = performance.now() - k.t0
  }, true)
  window.__long.length = 0
})
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')
const metric = async () =>
  Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
const profile = process.env.PROFILE === '1'
if (profile) {
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
  await cdp.send('Profiler.start')
}
const m0 = await metric()
for (let i = 0; i < 100; i++) await page.keyboard.press(i % 7 === 6 ? 'Space' : 'e')
const m1 = await metric()
if (profile) {
  const { profile: prof } = await cdp.send('Profiler.stop')
  const self = new Map()
  const byId = new Map(prof.nodes.map((nd) => [nd.id, nd]))
  prof.samples.forEach((id, i) => {
    const nd = byId.get(id)
    const key = `${nd.callFrame.functionName || '(anon)'} ${nd.callFrame.url.split('/').slice(-2).join('/')}:${nd.callFrame.lineNumber}`
    self.set(key, (self.get(key) ?? 0) + (prof.timeDeltas[i] ?? 0))
  })
  console.log('  top self time (ms) while typing:')
  for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`   ${(v / 1000).toFixed(1)} ${k}`)
}
for (const k of ['LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration', 'LayoutCount', 'RecalcStyleCount'])
  console.log(`  typing ${k}: ${(m1[k] - m0[k]).toFixed(3)}`)
await page.waitForTimeout(300)
const keys = await page.evaluate(() => window.__keys)
const js = keys.map((k) => k.js)
const fr = keys.map((k) => k.frame).sort((a, b) => a - b)
record('typing: keydown to keyup (JS), avg', avg(js), 16, `(max ${Math.max(...js).toFixed(1)})`)
// keys at i % 7 === 0 start a new word, so the word count (and the tree/status bar) changes
const wordKeys = js.filter((_, i) => i > 0 && i % 7 === 0)
record('typing: keys that add a word, avg JS', avg(wordKeys), 16, `(max ${Math.max(...wordKeys).toFixed(1)})`)
record('typing: main-thread time per key (CDP)', ((m1.TaskDuration - m0.TaskDuration) * 1000) / 100, 16)
// frame latency is dominated by the headless compositor (a 3-scene book shows ~65 ms too), so it is informational only
console.log(`  frame latency avg ${avg(fr).toFixed(0)} ms, p95 ${fr[Math.floor(fr.length * 0.95)].toFixed(0)} ms (headless, informational)`)
const long = await page.evaluate(() => window.__long)
record('typing: longest long task', Math.max(0, ...long), 100, `(${long.length} long tasks)`)

// roll-up: time from the keystroke that adds a word to the status bar showing the new total
const wcMs = await (async () => {
  await page.evaluate(() => {
    const bar = document.querySelector('.statusbar')
    const words = () => [...bar.querySelectorAll('span:not(.save)')].map((e) => e.textContent).join('|')
    const before = words()
    window.__wc = new Promise((resolve) => {
      const obs = new MutationObserver(() => {
        if (words() !== before) {
          obs.disconnect()
          resolve(performance.now() - window.__wcT0)
        }
      })
      obs.observe(bar, { subtree: true, childList: true, characterData: true })
      setTimeout(() => resolve(-1), 3000)
    })
    addEventListener('keydown', () => (window.__wcT0 = performance.now()), { capture: true, once: true })
  })
  await page.keyboard.type(' zz', { delay: 0 })
  return page.evaluate(() => window.__wc)
})()
record('word-count roll-up: keystroke to status bar updated', wcMs, 50)

// ---------- tree: filter ----------
async function treeOp(label, fn, arg) {
  return page.evaluate(
    async ([src, a]) => {
      const t = performance.now()
      await new Function('a', `return (${src})(a)`)(a)
      await window.__frame()
      return performance.now() - t
    },
    [fn.toString(), arg],
  )
}
await page.getByRole('button', { name: 'Filter by status' }).click()
const fdlg = page.getByRole('dialog', { name: 'Filter by status' })
await fdlg.waitFor()
const rowCount = () => page.evaluate(() => document.querySelectorAll('[role=treeitem]').length)
const before = await rowCount()
const filterOn = await treeOp('filter on', async () => {
  const cb = [...document.querySelectorAll('[role=checkbox]')].find((e) => /Final/.test(e.textContent))
  const rows = document.querySelectorAll('[role=treeitem]').length
  cb.click()
  await window.__waitFor(() => document.querySelectorAll('[role=treeitem]').length !== rows)
})
const filtered = await rowCount()
record('tree: filter on (Final)', filterOn, 100, `(${before} -> ${filtered} rows)`)
const filterOff = await treeOp('filter off', async () => {
  const rows = document.querySelectorAll('[role=treeitem]').length
  const btn = [...document.querySelectorAll('button')].find((e) => /^\s*Clear\s*$/.test(e.textContent))
  btn.click()
  await window.__waitFor(() => document.querySelectorAll('[role=treeitem]').length !== rows)
})
record('tree: filter cleared', filterOff, 100, `(${await rowCount()} rows)`)
await fdlg.getByRole('button', { name: 'Done' }).click()
await page.waitForTimeout(300)

// ---------- tree: collapse / expand all parts ----------
const chevrons = (verb) => `[role=treeitem][aria-level="1"] button[aria-label^="${verb} "]`
async function chevronRun(verb) {
  return page.evaluate(
    async (sel) => {
      const times = []
      const btns = [...document.querySelectorAll(sel)]
      for (const b of btns) {
        const t = performance.now()
        b.click()
        await window.__frame()
        times.push(performance.now() - t)
      }
      return times
    },
    chevrons(verb),
  )
}
const collapse = await chevronRun('Collapse')
record('tree: collapse all parts (max single)', Math.max(...collapse), 100, `(total ${collapse.reduce((a, b) => a + b, 0).toFixed(0)}, ${collapse.length} parts)`)
const expand = await chevronRun('Expand')
record('tree: expand all parts (max single)', Math.max(...expand), 100, `(total ${expand.reduce((a, b) => a + b, 0).toFixed(0)}, ${await rowCount()} rows)`)

// ---------- corkboard ----------
const corkOn = await page.evaluate(async () => {
  const t = performance.now()
  ;[...document.querySelectorAll('.band-view button')].find((b) => /Corkboard/.test(b.textContent)).click()
  await window.__waitFor(() => document.querySelectorAll('[data-card-id]').length > 0)
  const first = performance.now() - t
  await window.__frame()
  return [first, performance.now() - t, document.querySelectorAll('[data-card-id]').length]
})
record('corkboard: render', corkOn[1], 500, `(${corkOn[2]} cards)`)
const corkOff = await page.evaluate(async () => {
  const t = performance.now()
  ;[...document.querySelectorAll('.band-view button')].find((b) => /Editor/.test(b.textContent)).click()
  await window.__waitFor(() => document.querySelectorAll('[data-card-id]').length === 0)
  await window.__frame()
  return performance.now() - t
})
record('corkboard: back to editor', corkOff, 200)

// ---------- report ----------
console.log('\n| Metric | ms | Target | |')
console.log('|---|---:|---:|---|')
for (const r of results) {
  const ok = r.target === undefined || r.ms <= r.target ? 'ok' : 'SLOW'
  console.log(`| ${r.name} | ${r.ms.toFixed(1)} | ${r.target ?? ''} | ${ok} ${r.note} |`)
}
if (errors.length) console.log('\nerrors:', [...new Set(errors)])
await browser.close()
