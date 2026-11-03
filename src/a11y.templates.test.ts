import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('.', import.meta.url))

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? vueFiles(p) : p.endsWith('.vue') ? [p] : []
  })
}

// Minimal view of compiler-core nodes (type 1 = element, 2 = text, 5 = interpolation).
interface Node {
  type: number
  tag?: string
  content?: unknown
  props?: {
    type: number
    name: string
    rawName?: string
    arg?: { content?: string }
    loc: { start: { line: number } }
  }[]
  children?: Node[]
  loc: { start: { line: number } }
}

const NAMES = new Set(['aria-label', 'aria-labelledby', 'title', 'label'])
// Quasar tooltips are portalled and give no accessible name.
const TOOLTIPS = new Set(['q-tooltip', 'QTooltip'])
const QUASAR_FIELDS = new Set([
  'QInput',
  'QSelect',
  'QToggle',
  'QCheckbox',
  'QFile',
  'QBtnToggle',
  'QSlider',
])
const FIELD_TAGS = new Set(['input', 'select', 'textarea', ...QUASAR_FIELDS])
const STATIC_TAGS = new Set([
  'div',
  'span',
  'li',
  'p',
  'td',
  'tr',
  'svg',
  'g',
  'rect',
  'circle',
  'path',
  'img',
])
const BTN_TAGS = new Set(['q-btn', 'QBtn', 'q-btn-dropdown', 'QBtnDropdown'])

function attrNames(n: Node): Set<string> {
  const out = new Set<string>()
  for (const p of n.props ?? []) {
    if (p.type === 6) out.add(p.name)
    else if (p.type === 7 && p.name === 'bind') {
      if (p.arg?.content) out.add(p.arg.content)
      else out.add('*') // v-bind="obj": cannot tell, trust it
    }
  }
  return out
}

function hasText(n: Node): boolean {
  return (n.children ?? []).some(
    (c) =>
      (c.type === 2 && String(c.content).trim() !== '') ||
      c.type === 5 ||
      (c.type === 1 && !TOOLTIPS.has(c.tag!) && hasText(c)),
  )
}

function walk(n: Node, visit: (n: Node, ancestors: Node[]) => void, up: Node[] = []) {
  if (n.type === 1) visit(n, up)
  for (const c of n.children ?? []) walk(c, visit, n.type === 1 ? [...up, n] : up)
}

// role="option" rows are driven by the owning input via aria-activedescendant.
function isRole(n: Node, role: string): boolean {
  return (n.props ?? []).some(
    (p) =>
      p.type === 6 &&
      p.name === 'role' &&
      (p as unknown as { value?: { content: string } }).value?.content === role,
  )
}
const isGroup = (n: Node) => isRole(n, 'group')

function labelTargets(root: Node): Set<string> {
  const out = new Set<string>()
  walk(root, (n) => {
    if (n.tag !== 'label') return
    for (const p of (n.props ?? []) as unknown as {
      name: string
      arg?: { content?: string }
      value?: { content: string }
      exp?: { content: string }
    }[])
      if (p.name === 'for' || (p.name === 'bind' && p.arg?.content === 'for'))
        out.add(p.value?.content ?? p.exp?.content ?? '')
  })
  return out
}

export function unnamedButtons(source: string): number[] {
  const ast = parse(source).descriptor.template?.ast as unknown as Node | undefined
  const bad: number[] = []
  if (!ast) return bad
  walk(ast, (n, up) => {
    const a = attrNames(n)
    if (FIELD_TAGS.has(n.tag!)) {
      const t = n.tag!
      const type = (n.props ?? []).find((p) => p.type === 6 && p.name === 'type') as unknown as
        { value?: { content: string } } | undefined
      if (t === 'input' && type?.value?.content === 'hidden') return
      const wrapped = up.some(
        (u) => u.tag === 'label' || (attrNames(u).has('aria-labelledby') && isGroup(u)),
      )
      const forIds = labelTargets(ast)
      const id = (n.props ?? []).find(
        (p) => p.name === 'id' || (p.name === 'bind' && p.arg?.content === 'id'),
      ) as { value?: { content: string }; exp?: { content: string } } | undefined
      if (id && forIds.has(id.value?.content ?? id.exp?.content ?? '')) return
      const labelled = [...NAMES, 'aria-labelledby', '*'].some((k) => a.has(k))
      if (!wrapped && !labelled && !(QUASAR_FIELDS.has(t) && hasText(n))) bad.push(n.loc.start.line)
      return
    }
    const named = [...NAMES, '*'].some((k) => a.has(k)) || hasText(n)
    const clickable = (n.props ?? []).some(
      (p) => p.type === 7 && p.name === 'on' && p.arg?.content === 'click',
    )
    if (
      clickable &&
      STATIC_TAGS.has(n.tag!) &&
      !(a.has('tabindex') && a.has('role')) &&
      !a.has('aria-hidden') &&
      !isRole(n, 'option')
    )
      bad.push(n.loc.start.line)
    if (BTN_TAGS.has(n.tag!) && a.has('icon') && !named) bad.push(n.loc.start.line)
    if (n.tag === 'button' && !named) bad.push(n.loc.start.line)
  })
  return bad
}

describe('unnamed button and field scan', () => {
  it('flags an icon button without a name', () => {
    expect(unnamedButtons('<template><q-btn icon="add" @click="x" /></template>')).toHaveLength(1)
    expect(
      unnamedButtons('<template><button><q-icon name="x" /></button></template>'),
    ).toHaveLength(1)
    expect(
      unnamedButtons(
        '<template><q-btn icon="a"><q-tooltip>{{ t(1) }}</q-tooltip></q-btn></template>',
      ),
    ).toHaveLength(1)
  })

  it('accepts labels, aria-labels, titles and text', () => {
    expect(
      unnamedButtons('<template><q-btn icon="add" :aria-label="t(1)" /></template>'),
    ).toHaveLength(0)
    expect(unnamedButtons('<template><q-btn icon="add" :label="t(1)" /></template>')).toHaveLength(
      0,
    )
    expect(
      unnamedButtons('<template><button title="x"><q-icon name="x" /></button></template>'),
    ).toHaveLength(0)
    expect(
      unnamedButtons('<template><button><span>{{ t(1) }}</span></button></template>'),
    ).toHaveLength(0)
  })

  it('flags clickable static elements without role and tabindex', () => {
    expect(unnamedButtons('<template><div @click="x">a</div></template>')).toHaveLength(1)
    expect(
      unnamedButtons('<template><div role="button" tabindex="0" @click="x">a</div></template>'),
    ).toHaveLength(0)
  })

  it('flags unlabelled fields', () => {
    expect(unnamedButtons('<template><input v-model="x" /></template>')).toHaveLength(1)
    expect(
      unnamedButtons('<template><label>A<input v-model="x" /></label></template>'),
    ).toHaveLength(0)
    expect(unnamedButtons('<template><input :aria-label="t(1)" /></template>')).toHaveLength(0)
    expect(unnamedButtons('<template><QInput v-model="x" /></template>')).toHaveLength(1)
    expect(
      unnamedButtons('<template><QInput v-model="x" :label="t(1)" /></template>'),
    ).toHaveLength(0)
  })

  it('scans the script and game components too', () => {
    const files = vueFiles(root).map((f) => f.slice(root.length))
    for (const f of [
      'views/WelcomeView.vue',
      'views/GameDocView.vue',
      'views/StoryMapView.vue',
      'components/conversation/ConversationView.vue',
      'components/gamedoc/MechanicLinkPicker.vue',
      'components/gamedoc/GlossaryTab.vue',
      'components/storymap/StoryPlaythroughPanel.vue',
      'components/graph/GraphList.vue',
    ])
      expect(files, f).toContain(f)
  })

  it('finds no unnamed icon buttons or fields in src/**/*.vue', () => {
    const found = vueFiles(root).flatMap((f) =>
      unnamedButtons(readFileSync(f, 'utf8')).map((l) => `${f.slice(root.length)}:${l}`),
    )
    expect(found).toEqual([])
  })
})
