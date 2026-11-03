import { DictionaryError, type DictStorage } from './types'

export const CUSTOM_WORDS_PATH = 'dictionaries/custom-words.txt'

export interface CustomWords {
  load(): Promise<string[]>
  add(word: string): Promise<string[]>
  remove(word: string): Promise<string[]>
}

/** Per-book word list in the project's local dictionaries folder. */
export function createCustomWords(
  local: () => { io: DictStorage; readOnly: boolean } | null,
): CustomWords {
  const parse = (text: string | null) =>
    (text ?? '')
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter(Boolean)
  const normalise = (words: string[]) => [...new Set(words)].sort()

  async function change(fn: (words: string[]) => string[]): Promise<string[]> {
    const l = local()
    if (!l) throw new DictionaryError('no-local')
    if (l.readOnly) throw new DictionaryError('read-only')
    const before = normalise(parse(await l.io.readText(CUSTOM_WORDS_PATH)))
    const after = normalise(fn(before))
    if (after.join('\n') !== before.join('\n'))
      await l.io.writeTextAtomic(CUSTOM_WORDS_PATH, after.map((w) => w + '\n').join(''))
    return after
  }

  return {
    async load() {
      const l = local()
      return l ? normalise(parse(await l.io.readText(CUSTOM_WORDS_PATH))) : []
    },
    add: (word) => {
      const w = word.trim()
      return change((words) => (w && !/\s/.test(w) ? [...words, w] : words))
    },
    remove: (word) => change((words) => words.filter((w) => w !== word.trim())),
  }
}
