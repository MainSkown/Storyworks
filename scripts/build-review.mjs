// Usage: node scripts/build-review.mjs <outDir> [--shots <dir> --prefix shots/m2]
// Writes <outDir>/index.html from docs/review/review.json + review.css. With --shots, copies that
// dir's PNGs to <outDir>/<prefix>/ and prints the Artifact `files` map as one line of JSON.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reviewDir = join(root, 'docs', 'review')
// Already-published screenshots, not in this run's --shots dir.
const PUBLISHED = /^shots\/(m1\/|m2\/)?[^/]+\.png$/

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const attr = (s) => esc(s).replace(/"/g, '&quot;')

function parseArgs(argv) {
  const args = { outDir: null, shots: null, prefix: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--shots') args.shots = argv[++i]
    else if (argv[i] === '--prefix') args.prefix = argv[++i]
    else if (!args.outDir) args.outDir = argv[i]
    else throw new Error(`unexpected argument ${argv[i]}`)
  }
  if (!args.outDir)
    throw new Error('usage: build-review.mjs <outDir> [--shots <dir> --prefix shots/m2]')
  if (Boolean(args.shots) !== Boolean(args.prefix))
    throw new Error('--shots and --prefix must be given together')
  if (args.prefix) args.prefix = args.prefix.replace(/\/+$/, '')
  return args
}

function checkFigures(data, shotsDir, prefix) {
  const missing = []
  for (const f of allFigures(data)) {
    if (f.img.startsWith(prefix + '/')) {
      if (!existsSync(join(shotsDir, basename(f.img)))) missing.push(f.img)
    } else if (!PUBLISHED.test(f.img)) {
      missing.push(f.img)
    }
  }
  if (missing.length) {
    throw new Error(
      `review.json references PNG(s) not in ${shotsDir} or the published set:\n  ${missing.join('\n  ')}`,
    )
  }
}

function copyShots(shotsDir, outDir, prefix) {
  const dest = join(outDir, prefix)
  mkdirSync(dest, { recursive: true })
  const map = {}
  for (const name of readdirSync(shotsDir)
    .filter((n) => n.endsWith('.png'))
    .sort()) {
    copyFileSync(join(shotsDir, name), join(dest, name))
    map[`${prefix}/${name}`] = `${prefix}/${name}`
  }
  return map
}

function allFigures(data) {
  return data.milestones.flatMap((ms) => ms.sections.flatMap((sec) => sec.figures ?? []))
}

function figure(f) {
  const caption =
    `<b>${esc(f.bold)}</b>` + (f.muted !== undefined ? ` <span>${esc(f.muted)}</span>` : '')
  return `    <figure><a href="${attr(f.img)}"><img src="${attr(f.img)}" alt="${attr(f.alt)}" loading="lazy"></a>\n      <figcaption>${caption}</figcaption></figure>`
}

function section(sec) {
  if (sec.type === 'note') {
    const items = sec.items.map((i) => `    <li>${esc(i)}</li>`).join('\n')
    return `<section class="note">\n  <h2>${esc(sec.title)}</h2>\n  <ul>\n${items}\n  </ul>\n</section>`
  }
  const parts = ['<section>', `  <h2>${esc(sec.title)}</h2>`]
  if (sec.intro) parts.push(`  <p>${esc(sec.intro)}</p>`)
  parts.push('  <div class="grid">', ...sec.figures.map(figure), '  </div>', '</section>')
  return parts.join('\n')
}

function milestone(ms) {
  const parts = [`<div class="milestone" id="${attr(ms.id)}">`, `<h3>${esc(ms.title)}</h3>`]
  if (ms.intro)
    parts.push(`<p style="margin:0;color:var(--muted);max-width:65ch">${esc(ms.intro)}</p>`)
  for (const sec of ms.sections) parts.push('', section(sec))
  parts.push('</div>')
  return parts.join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const data = JSON.parse(readFileSync(join(reviewDir, 'review.json'), 'utf8'))
  const css = readFileSync(join(reviewDir, 'review.css'), 'utf8').trimEnd()
  if (args.shots) checkFigures(data, args.shots, args.prefix)

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(data.title)}</title>
<style>
${css}
</style>
</head>
<body>
<main>
<header>
  <h1>${esc(data.heading)}</h1>
  <p>${esc(data.intro)}</p>
</header>

${data.milestones.map(milestone).join('\n\n')}
</main>
</body>
</html>
`

  const outDir = resolve(args.outDir)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), html)
  if (args.shots) console.log(JSON.stringify(copyShots(args.shots, outDir, args.prefix)))
}

try {
  main()
} catch (err) {
  console.error(`build-review: ${err.message}`)
  process.exit(1)
}
