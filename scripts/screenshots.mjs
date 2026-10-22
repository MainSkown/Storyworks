// Usage: node scripts/screenshots.mjs <outDir>  (needs `yarn dev` on :1420 and a Playwright chromium)
import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2]
const base = join(homedir(), '.cache/ms-playwright')
const dir = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop()
const browser = await chromium.launch({
  executablePath: join(base, dir, 'chrome-linux64/chrome'),
  args: ['--no-sandbox'],
})

const settings = (over = {}) =>
  JSON.stringify({
    version: 1,
    theme: 'light',
    language: 'en',
    uiZoom: 100,
    editorFontSize: 18,
    contextPanel: { hidden: false, collapsed: {} },
    ...over,
  })

async function shot(name, route, over) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.addInitScript((s) => localStorage.setItem('storyworks:settings.json', s), settings(over))
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`http://localhost:1420/#${route}`)
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(out, `${name}.png`) })
  if (errors.length) console.log(name, 'ERRORS', errors)
  await ctx.close()
}

const collapsed = { 'write.thisParagraph': true, 'write.problems': true }
await shot('01-welcome-light', '/')
await shot('02-write-light', '/app/write')
await shot('03-write-collapsed', '/app/write', { contextPanel: { hidden: false, collapsed } })
await shot('04-write-panel-hidden', '/app/write', { contextPanel: { hidden: true, collapsed: {} } })
await shot('05-timelines-light', '/app/timelines')
await shot('06-settings-light', '/app/settings')
await shot('07-write-dark', '/app/write', { theme: 'dark' })
await shot('08-settings-dark', '/app/settings', { theme: 'dark' })
await shot('09-write-polish', '/app/write', { language: 'pl' })
await shot('10-write-zoom80', '/app/write', { uiZoom: 80 })
await shot('11-write-zoom150', '/app/write', { uiZoom: 150 })
await shot('12-welcome-dark', '/', { theme: 'dark' })
await browser.close()
