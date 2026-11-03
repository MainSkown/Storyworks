import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from '../project/io/memory'
import { createDictionaryStore } from './dictionaryStore'
import { createSpellEngine } from './engine'
import { TINY_AFF, TINY_DIC } from './fixtures'
import { defaultDictionaryFor } from './language'

function setup() {
  const local = createMemoryProjectIO()
  const store = createDictionaryStore({
    local: () => ({ io: local, readOnly: false }),
    global: createMemoryProjectIO(),
  })
  const engine = createSpellEngine({ load: (ref) => store.load(ref) })
  return { store, engine }
}

describe('engine', () => {
  it('flags words until the imported dictionary is selected', async () => {
    const { store, engine } = setup()
    await store.importDictionary({ scope: 'global', name: 'fantasy', dic: TINY_DIC, aff: TINY_AFF })
    await engine.setDictionaries([], [])
    await engine.setDictionaries([{ name: 'fantasy', scope: 'global' }], [])
    expect(engine.check('zephyrs')).toBe(true)
    expect(engine.check('wyvern')).toBe(true)
    expect(engine.check('zefir')).toBe(false)
  })

  it('accepts a word when any selected dictionary does', async () => {
    const { store, engine } = setup()
    await store.importDictionary({ scope: 'global', name: 'a', wordList: 'alpha' })
    await store.importDictionary({ scope: 'local', name: 'b', wordList: 'beta' })
    await engine.setDictionaries(
      [
        { name: 'a', scope: 'global' },
        { name: 'b', scope: 'local' },
      ],
      [],
    )
    expect([engine.check('alpha'), engine.check('beta'), engine.check('gamma')]).toEqual([
      true,
      true,
      false,
    ])
  })

  it('stops flagging a custom word, also capitalised when stored lower case', async () => {
    const { store, engine } = setup()
    await store.importDictionary({ scope: 'global', name: 'a', wordList: 'alpha' })
    const sel = [{ name: 'a', scope: 'global' as const }]
    await engine.setDictionaries(sel, [])
    expect(engine.check('Zephyr')).toBe(false)
    await engine.setDictionaries(sel, ['Zephyr', 'dragon'])
    expect(engine.check('Zephyr')).toBe(true)
    expect(engine.check('Zephyr’s')).toBe(true)
    expect(engine.check('Dragon')).toBe(true)
    expect(engine.check('zephyr')).toBe(false)
  })

  it('falls back to the rest and reports a missing dictionary, selection untouched', async () => {
    const { store, engine } = setup()
    await store.importDictionary({ scope: 'global', name: 'a', wordList: 'alpha' })
    const selected = [
      { name: 'gone', scope: 'global' as const },
      { name: 'a', scope: 'global' as const },
    ]
    const copy = structuredClone(selected)
    const { missing } = await engine.setDictionaries(selected, [])
    expect(missing).toEqual([{ name: 'gone', scope: 'global' }])
    expect(engine.missing).toEqual(missing)
    expect(engine.check('alpha')).toBe(true)
    expect(engine.check('gamma')).toBe(false)
    expect(selected).toEqual(copy)
  })

  it('flags nothing when no dictionary is usable', async () => {
    const { engine } = setup()
    await engine.setDictionaries([{ name: 'gone', scope: 'global' }], [])
    expect(engine.active).toBe(false)
    expect(engine.check('zzzz')).toBe(true)
    expect(engine.checkText('zzzz')).toEqual([])
  })

  it('suggests from the selected dictionaries', async () => {
    const { store, engine } = setup()
    await store.importDictionary({ scope: 'global', name: 'fantasy', dic: TINY_DIC, aff: TINY_AFF })
    await engine.setDictionaries([{ name: 'fantasy', scope: 'global' }], [])
    expect(engine.suggest('wyvren')).toContain('wyvern')
  })

  it('checks hyphenated words part by part', async () => {
    const { store, engine } = setup()
    await store.importDictionary({ scope: 'global', name: 'a', wordList: 'alpha\nbeta' })
    await engine.setDictionaries([{ name: 'a', scope: 'global' }], [])
    expect(engine.check('alpha-beta')).toBe(true)
    expect(engine.check('alpha-gamma')).toBe(false)
  })
})

describe('checkText', () => {
  it('returns offsets of misspelled Polish words, skipping numbers and single letters', async () => {
    const { store, engine } = setup()
    await store.importDictionary({ scope: 'global', name: 'pl', wordList: 'żółć\nmam\nw\nlesie' })
    await engine.setDictionaries([{ name: 'pl', scope: 'global' }], [])
    const text = 'Mam żółć w lesie 2024, a źrebak zażółcił 3rd-test.'
    const found = engine.checkText(text)
    expect(found.map((f) => f.word)).toEqual(['źrebak', 'zażółcił'])
    for (const f of found) expect(text.slice(f.start, f.end)).toBe(f.word)
  })

  it('keeps apostrophes and hyphens inside words', async () => {
    const { store, engine } = setup()
    await store.importDictionary({ scope: 'global', name: 'a', wordList: 'alpha' })
    await engine.setDictionaries([{ name: 'a', scope: 'global' }], [])
    const found = engine.checkText("alpha, don't re-enter 'quoted' alpha.")
    expect(found.map((f) => f.word)).toEqual(["don't", 're-enter', 'quoted'])
  })
})

describe('defaultDictionaryFor', () => {
  it('maps language tags to the bundled dictionaries', () => {
    expect(defaultDictionaryFor('en')).toEqual({ name: 'en', scope: 'global' })
    expect(defaultDictionaryFor('en-GB')).toEqual({ name: 'en', scope: 'global' })
    expect(defaultDictionaryFor('PL_pl')).toEqual({ name: 'pl', scope: 'global' })
    expect(defaultDictionaryFor('de')).toBeNull()
    expect(defaultDictionaryFor('')).toBeNull()
  })
})
