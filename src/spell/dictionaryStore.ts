import {
  DictionaryError,
  type DictRef,
  type DictScope,
  type DictStorage,
  type LoadedDictionary,
} from './types'

export { DictionaryError } from './types'

const DIR = 'dictionaries'
const DIC = 'index.dic'
const AFF = 'index.aff'
const WORDS = 'words.txt'

export interface DictionaryInfo {
  name: string
  scope: DictScope
  source: 'bundled' | 'global' | 'local'
  kind: 'hunspell' | 'wordlist'
  readOnly: boolean
  /** A global dictionary hidden by a local one with the same name. */
  shadowed: boolean
}

export type ImportInput = { scope: DictScope; name: string } & (
  { dic: string; aff: string } | { wordList: string }
)

export interface DictionaryStoreDeps {
  /** The open book's storage, or null when none is open. */
  local: () => { io: DictStorage; readOnly: boolean } | null
  /** Per-user app-data storage (paths relative to the app data dir). */
  global: DictStorage
  /** Read-only dictionaries shipped with the app, fetched from static resources. */
  bundled?: { names: string[]; fetchText: (url: string) => Promise<string | null> }
}

export const BUNDLED_NAMES = ['en', 'pl']

export function createBundledSource(): NonNullable<DictionaryStoreDeps['bundled']> {
  return {
    names: BUNDLED_NAMES,
    async fetchText(url) {
      const res = await fetch(import.meta.env.BASE_URL + url)
      return res.ok ? res.text() : null
    },
  }
}

export function validateName(name: string): string {
  const n = name.trim()
  if (!n || n.length > 64 || n.startsWith('.') || /[\\/:*?"<>|\0]/.test(n))
    throw new DictionaryError('invalid-name')
  return n
}

const BOM = new RegExp('^\\uFEFF')

function validateHunspell(dic: string, aff: string) {
  const first = dic.replace(BOM, '').split(/\r?\n/, 1)[0]!.trim()
  if (!/^\d+$/.test(first)) throw new DictionaryError('bad-dic', 'first line must be a word count')
  const lines = aff
    .replace(BOM, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  if (lines.length === 0 || !lines.every((l) => /^[A-Z][A-Z0-9-]*(\s|$)/.test(l)))
    throw new DictionaryError('bad-aff')
  const set = lines.find((l) => l.startsWith('SET'))
  if (set && !/^SET\s+UTF-?8\s*$/i.test(set)) throw new DictionaryError('unsupported-encoding', set)
}

function cleanWordList(text: string): string[] {
  const words = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ]
  if (words.length === 0) throw new DictionaryError('empty-wordlist')
  return words
}

export function createDictionaryStore(deps: DictionaryStoreDeps) {
  const bundledNames = new Set(deps.bundled?.names ?? [])

  function storage(scope: DictScope, forWrite: boolean): DictStorage {
    if (scope === 'global') return deps.global
    const l = deps.local()
    if (!l) throw new DictionaryError('no-local')
    if (forWrite && l.readOnly) throw new DictionaryError('read-only')
    return l.io
  }

  /** name -> kind for every dictionary folder under dictionaries/ */
  async function scan(io: DictStorage): Promise<Map<string, 'hunspell' | 'wordlist'>> {
    const out = new Map<string, 'hunspell' | 'wordlist'>()
    for (const path of await io.listFiles(DIR)) {
      const parts = path.split('/')
      if (parts.length !== 3 || parts[0] !== DIR) continue
      const [, name, file] = parts as [string, string, string]
      if (file === WORDS) out.set(name, 'wordlist')
      else if (file === DIC && !out.has(name)) out.set(name, 'hunspell')
    }
    return out
  }

  async function readFrom(io: DictStorage, name: string): Promise<LoadedDictionary | null> {
    const words = await io.readText(`${DIR}/${name}/${WORDS}`)
    if (words !== null) return { kind: 'wordlist', words: words.split(/\r?\n/).filter(Boolean) }
    const [dic, aff] = await Promise.all([
      io.readText(`${DIR}/${name}/${DIC}`),
      io.readText(`${DIR}/${name}/${AFF}`),
    ])
    return dic === null || aff === null ? null : { kind: 'hunspell', aff, dic }
  }

  async function readBundled(name: string): Promise<LoadedDictionary | null> {
    if (!deps.bundled || !bundledNames.has(name)) return null
    const base = `dictionaries/${name}`
    const [aff, dic] = await Promise.all([
      deps.bundled.fetchText(`${base}/${AFF}`),
      deps.bundled.fetchText(`${base}/${DIC}`),
    ])
    return aff === null || dic === null ? null : { kind: 'hunspell', aff, dic }
  }

  async function exists(scope: DictScope, name: string) {
    if (scope === 'global' && bundledNames.has(name)) return true
    return (await scan(storage(scope, false))).has(name)
  }

  async function writeDictionary(scope: DictScope, name: string, d: LoadedDictionary) {
    const io = storage(scope, true)
    if (await exists(scope, name)) throw new DictionaryError('exists')
    const dir = `${DIR}/${name}`
    try {
      if (d.kind === 'wordlist') {
        await io.writeTextAtomic(`${dir}/${WORDS}`, d.words.map((w) => w + '\n').join(''))
      } else {
        await io.writeTextAtomic(`${dir}/${DIC}`, d.dic)
        await io.writeTextAtomic(`${dir}/${AFF}`, d.aff)
      }
    } catch (e) {
      await io.remove(dir).catch(() => {})
      throw e
    }
  }

  return {
    async list(): Promise<DictionaryInfo[]> {
      const out: DictionaryInfo[] = []
      const l = deps.local()
      const local = l ? await scan(l.io) : new Map()
      for (const [name, kind] of local)
        out.push({
          name,
          scope: 'local',
          source: 'local',
          kind,
          readOnly: l!.readOnly,
          shadowed: false,
        })
      for (const name of bundledNames)
        out.push({
          name,
          scope: 'global',
          source: 'bundled',
          kind: 'hunspell',
          readOnly: true,
          shadowed: local.has(name),
        })
      for (const [name, kind] of await scan(deps.global))
        out.push({
          name,
          scope: 'global',
          source: 'global',
          kind,
          readOnly: false,
          shadowed: local.has(name),
        })
      return out
    },

    /** The dictionary a manifest reference resolves to (local wins), or null. */
    async load(ref: DictRef): Promise<LoadedDictionary | null> {
      const l = deps.local()
      if (l) {
        const found = await readFrom(l.io, ref.name)
        if (found || ref.scope === 'local') return found
      }
      if (ref.scope === 'local') return null
      return (await readFrom(deps.global, ref.name)) ?? (await readBundled(ref.name))
    },

    async importDictionary(input: ImportInput): Promise<void> {
      const name = validateName(input.name)
      let d: LoadedDictionary
      if ('wordList' in input) {
        d = { kind: 'wordlist', words: cleanWordList(input.wordList) }
      } else {
        validateHunspell(input.dic, input.aff)
        d = { kind: 'hunspell', aff: input.aff, dic: input.dic }
      }
      await writeDictionary(input.scope, name, d)
    },

    async remove(ref: DictRef): Promise<void> {
      if (ref.scope === 'global' && bundledNames.has(ref.name))
        throw new DictionaryError('read-only')
      const io = storage(ref.scope, true)
      if (!(await scan(io)).has(ref.name)) throw new DictionaryError('not-found')
      await io.remove(`${DIR}/${ref.name}`)
    },

    async moveOrCopy(
      name: string,
      from: DictScope,
      to: DictScope,
      mode: 'move' | 'copy',
    ): Promise<void> {
      if (from === to) throw new DictionaryError('same-scope')
      const isBundled = from === 'global' && bundledNames.has(name)
      if (isBundled && mode === 'move') throw new DictionaryError('read-only')
      const src = storage(from, mode === 'move')
      storage(to, true)
      const d = isBundled ? await readBundled(name) : await readFrom(src, name)
      if (!d) throw new DictionaryError('not-found')
      await writeDictionary(to, name, d)
      if (mode === 'move') await src.remove(`${DIR}/${name}`)
    },
  }
}

export type DictionaryStore = ReturnType<typeof createDictionaryStore>
