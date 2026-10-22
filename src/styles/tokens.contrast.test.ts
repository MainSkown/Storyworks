import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

function block(selector: string): Record<string, string> {
  for (const part of css.split('}')) {
    const [sel, body] = part.split('{')
    if (
      body === undefined ||
      sel!
        .replace(/\/\*.*?\*\//gs, '')
        .replace(/\s+/g, ' ')
        .trim() !== selector
    )
      continue
    const out: Record<string, string> = {}
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
    return out
  }
  throw new Error(`missing ${selector}`)
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => v / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i]!, 0)
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const themes = {
  light: block(":root, :root[data-theme='light']"),
  dark: block(":root[data-theme='dark']"),
}
const surfaces = ['--bg-app', '--bg-sidebar', '--bg-panel', '--bg-sheet', '--bg-raised']
const sections = ['write', 'timelines', 'rules', 'codex', 'checks'].map((s) => `--section-${s}`)
const tags = ['event', 'rule', 'character', 'scene', 'problem'].map((s) => `--tag-${s}`)

describe.each(Object.entries(themes))('%s theme contrast', (_name, t) => {
  const get = (k: string) => {
    const v = t[k]
    if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${k} must be a 6-digit hex, got ${v}`)
    return v
  }

  it('primary and secondary text meet 4.5:1 on every surface', () => {
    for (const s of surfaces)
      for (const tx of ['--text-primary', '--text-secondary'])
        expect(ratio(get(tx), get(s)), `${tx} on ${s}`).toBeGreaterThanOrEqual(4.5)
  })

  it('header text meets 4.5:1 on the header', () => {
    expect(ratio(get('--text-header'), get('--bg-header'))).toBeGreaterThanOrEqual(4.5)
  })

  it('section and tag colours meet 4.5:1 with their -on colour', () => {
    for (const k of [...sections, ...tags])
      expect(ratio(get(k), get(`${k}-on`)), k).toBeGreaterThanOrEqual(4.5)
  })

  it('section colours meet 3:1 against sidebar and app background', () => {
    for (const k of sections)
      for (const s of ['--bg-app', '--bg-sidebar'])
        expect(ratio(get(k), get(s)), `${k} on ${s}`).toBeGreaterThanOrEqual(3)
  })

  it('strong border and focus ring meet 3:1 against surfaces', () => {
    for (const s of surfaces)
      for (const k of ['--border-strong', '--focus-ring'])
        expect(ratio(get(k), get(s)), `${k} on ${s}`).toBeGreaterThanOrEqual(3)
  })
})
