import nspell from 'nspell'
import type { DictRef, LoadedDictionary } from './types'

type Speller = ReturnType<typeof nspell>

export interface SpellEngineDeps {
  /** Resolves a manifest reference to dictionary content, or null when absent. */
  load(ref: DictRef): Promise<LoadedDictionary | null>
}

export interface Misspelling {
  start: number
  end: number
  word: string
}

const WORD = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu
const MAX_SUGGESTIONS = 10

const keyOf = (r: DictRef) => `${r.scope}:${r.name}`

function build(d: LoadedDictionary): Speller {
  if (d.kind === 'hunspell') return nspell(d.aff, d.dic)
  const words = d.words.map((w) => w.replace(/\//g, '\\/'))
  return nspell('SET UTF-8\n', `${words.length}\n${words.join('\n')}\n`)
}

/** No DOM, no worker APIs: runs on the main thread or inside a Worker. */
export function createSpellEngine(deps: SpellEngineDeps) {
  const cache = new Map<string, Speller | null>()
  let spellers: Speller[] = []
  let custom = new Set<string>()
  let missing: DictRef[] = []

  const inCustom = (w: string) => custom.has(w) || custom.has(w.toLowerCase())

  function checkOne(raw: string): boolean {
    const word = raw.replace(/’/g, "'")
    if (inCustom(word) || spellers.some((s) => s.correct(word))) return true
    const poss = /^(.+?)'s$/i.exec(word)
    if (poss && inCustom(poss[1]!)) return true
    return false
  }

  const engine = {
    /** Selected dictionaries that could not be loaded; never written back anywhere. */
    get missing(): DictRef[] {
      return missing
    },
    /** False when no dictionary is usable; then nothing is flagged. */
    get active(): boolean {
      return spellers.length > 0
    },

    async setDictionaries(
      selected: DictRef[],
      customWords: string[],
    ): Promise<{ missing: DictRef[] }> {
      const next: Speller[] = []
      const gone: DictRef[] = []
      for (const ref of selected) {
        const key = keyOf(ref)
        if (!cache.has(key)) {
          const d = await deps.load(ref)
          cache.set(key, d ? build(d) : null)
        }
        const s = cache.get(key)
        if (s) next.push(s)
        else gone.push({ name: ref.name, scope: ref.scope })
      }
      // forget entries that were not found, so a later install is picked up
      for (const ref of gone) cache.delete(keyOf(ref))
      spellers = next
      missing = gone
      custom = new Set(customWords)
      return { missing: gone }
    },

    /** Drops cached dictionaries (call after import/remove/move). */
    invalidate() {
      cache.clear()
    },

    check(word: string): boolean {
      if (spellers.length === 0) return true
      if (checkOne(word)) return true
      const parts = word.split('-')
      return parts.length > 1 && parts.every((p) => !p || checkOne(p))
    },

    suggest(word: string): string[] {
      const out = new Set<string>()
      for (const s of spellers) for (const w of s.suggest(word.replace(/’/g, "'"))) out.add(w)
      return [...out].slice(0, MAX_SUGGESTIONS)
    },

    checkText(text: string): Misspelling[] {
      if (spellers.length === 0) return []
      const out: Misspelling[] = []
      for (const m of text.matchAll(WORD)) {
        const word = m[0]
        if (/\p{N}/u.test(word) || [...word].length < 2) continue
        if (!engine.check(word)) out.push({ start: m.index, end: m.index + word.length, word })
      }
      return out
    },
  }
  return engine
}

export type SpellEngine = ReturnType<typeof createSpellEngine>
