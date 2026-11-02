// Tolerant reader for project.json text: works on any format version, never throws.

export type ItemType =
  | 'part' | 'chapter' | 'scene'
  | 'timeline' | 'rule' | 'ruleCategory' | 'codexType' | 'entry' | 'relationType'
  | 'relationship' | 'group' | 'stateKind' | 'knowledge'
  | 'calendar' | 'inbox' | 'ignoredFindings' | 'relationLayout'
  | 'settings' | 'asset' | 'dictionary' | 'file'

/** Manifest list → item type. */
export const LIST_AREAS: Record<string, ItemType> = {
  timelines: 'timeline', rules: 'rule', ruleCategories: 'ruleCategory', codexTypes: 'codexType',
  codexEntries: 'entry', relationTypes: 'relationType', relationships: 'relationship',
  groups: 'group', stateKinds: 'stateKind', knowledge: 'knowledge',
}
/** Single-file manifest slots. */
export const SINGLETONS: Record<string, ItemType> = {
  calendar: 'calendar', inbox: 'inbox', ignoredFindings: 'ignoredFindings', relationLayout: 'relationLayout',
}
/** Manifest fields that are structure (or bookkeeping), not "book settings". */
export const STRUCTURAL_FIELDS = new Set(['version', 'manuscript', 'trash', ...Object.keys(LIST_AREAS), ...Object.keys(SINGLETONS)])

export interface Entry {
  key: string
  type: ItemType
  id: string
  title: string
  path?: string
  /** Key of the container: another node, a list area ("area:rules") or "manuscript". */
  parent: string
  /** Ancestor titles, outermost first (manuscript only). */
  context: string[]
}

export interface ManifestView {
  version: unknown
  raw: Record<string, unknown>
  entries: Entry[]
  /** Non-structural fields as stable JSON text. */
  settings: string
  dirs: { assets: string; dictionaries: string }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const base = (p: string) => p.split('/').pop() ?? p

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

export function viewManifest(text: string): ManifestView | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObj(raw)) return null
  const entries: Entry[] = []

  const walk = (nodes: unknown, parent: string, context: string[]) => {
    if (!Array.isArray(nodes)) return
    for (const n of nodes) {
      if (!isObj(n) || typeof n.id !== 'string') continue
      const type = n.type === 'part' || n.type === 'chapter' || n.type === 'scene' ? n.type : 'scene'
      const title = str(n.title)
      entries.push({ key: `node:${n.id}`, type, id: n.id, title, path: typeof n.path === 'string' ? n.path : undefined, parent, context })
      walk(n.children, `node:${n.id}`, [...context, title])
    }
  }
  walk(raw.manuscript, 'manuscript', [])

  for (const [area, type] of Object.entries(LIST_AREAS)) {
    const list = raw[area]
    if (!Array.isArray(list)) continue
    for (const r of list) {
      if (!isObj(r) || typeof r.id !== 'string') continue
      const path = str(r.path)
      entries.push({ key: `${type}:${r.id}`, type, id: r.id, title: str(r.title) || base(path), path, parent: `area:${area}`, context: [] })
    }
  }
  for (const [area, type] of Object.entries(SINGLETONS)) {
    const r = raw[area]
    if (!isObj(r) || typeof r.path !== 'string') continue
    entries.push({ key: area, type, id: str(r.id), title: str(r.title) || base(r.path), path: r.path, parent: `slot:${area}`, context: [] })
  }

  const settings = Object.fromEntries(Object.entries(raw).filter(([k]) => !STRUCTURAL_FIELDS.has(k)))
  const dirs = isObj(raw.dirs) ? raw.dirs : {}
  return {
    version: raw.version,
    raw,
    entries,
    settings: stable(settings),
    dirs: { assets: str(dirs.assets, 'assets'), dictionaries: str(dirs.dictionaries, 'dictionaries') },
  }
}
