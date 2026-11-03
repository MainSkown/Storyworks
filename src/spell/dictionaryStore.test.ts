import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from '../project/io/memory'
import { createDictionaryStore, DictionaryError } from './dictionaryStore'
import { TINY_AFF, TINY_DIC } from './fixtures'

function setup(opts: { readOnly?: boolean; noLocal?: boolean } = {}) {
  const local = createMemoryProjectIO()
  const global = createMemoryProjectIO()
  const store = createDictionaryStore({
    local: () => (opts.noLocal ? null : { io: local, readOnly: !!opts.readOnly }),
    global,
    bundled: {
      names: ['en'],
      fetchText: async (url) => (url.endsWith('index.aff') ? TINY_AFF : '1\nhello\n'),
    },
  })
  return { local, global, store }
}

const valid = { name: 'fantasy', dic: TINY_DIC, aff: TINY_AFF }

async function code(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return e instanceof DictionaryError ? e.code : 'other'
  }
  return 'none'
}

describe('import', () => {
  it('stores a valid dic/aff pair in the local dictionaries folder', async () => {
    const { local, store } = setup()
    await store.importDictionary({ scope: 'local', ...valid })
    expect(local.files.get('dictionaries/fantasy/index.dic')).toBe(TINY_DIC)
    expect(local.files.get('dictionaries/fantasy/index.aff')).toBe(TINY_AFF)
  })

  it('stores a global import in the global storage only', async () => {
    const { local, global, store } = setup()
    await store.importDictionary({ scope: 'global', ...valid })
    expect(global.files.has('dictionaries/fantasy/index.dic')).toBe(true)
    expect(local.files.size).toBe(0)
  })

  it('stores a word list as words.txt, deduplicated', async () => {
    const { local, store } = setup()
    await store.importDictionary({
      scope: 'local',
      name: 'names',
      wordList: 'Zephyr\r\nWyvern\n\nZephyr\n',
    })
    expect(local.files.get('dictionaries/names/words.txt')).toBe('Zephyr\nWyvern\n')
  })

  it.each([
    ['dic without count', { dic: 'zephyr\nwyvern\n', aff: TINY_AFF }, 'bad-dic'],
    ['empty dic', { dic: '', aff: TINY_AFF }, 'bad-dic'],
    [
      'aff that is prose',
      { dic: TINY_DIC, aff: 'Hello there, this is not an affix file' },
      'bad-aff',
    ],
    ['aff in a legacy encoding', { dic: TINY_DIC, aff: 'SET ISO8859-2\n' }, 'unsupported-encoding'],
  ])('rejects %s and writes nothing', async (_n, files, expected) => {
    const { local, global, store } = setup()
    expect(await code(store.importDictionary({ scope: 'local', name: 'bad', ...files }))).toBe(
      expected,
    )
    expect(local.files.size + global.files.size).toBe(0)
  })

  it('rejects an empty word list and unsafe names', async () => {
    const { local, store } = setup()
    expect(
      await code(store.importDictionary({ scope: 'local', name: 'x', wordList: '  \n' })),
    ).toBe('empty-wordlist')
    for (const name of ['', '..', 'a/b', 'a\\b', '.hidden'])
      expect(await code(store.importDictionary({ scope: 'local', ...valid, name }))).toBe(
        'invalid-name',
      )
    expect(local.files.size).toBe(0)
  })

  it('refuses a name that exists in the target scope, leaving it untouched', async () => {
    const { local, store } = setup()
    await store.importDictionary({ scope: 'local', ...valid })
    const err = await code(store.importDictionary({ scope: 'local', ...valid, dic: '1\nother\n' }))
    expect(err).toBe('exists')
    expect(local.files.get('dictionaries/fantasy/index.dic')).toBe(TINY_DIC)
  })

  it('refuses a global name that clashes with a bundled one', async () => {
    const { store } = setup()
    expect(await code(store.importDictionary({ scope: 'global', ...valid, name: 'en' }))).toBe(
      'exists',
    )
  })

  it('refuses local import in a read-only book or with no book open', async () => {
    expect(
      await code(setup({ readOnly: true }).store.importDictionary({ scope: 'local', ...valid })),
    ).toBe('read-only')
    expect(
      await code(setup({ noLocal: true }).store.importDictionary({ scope: 'local', ...valid })),
    ).toBe('no-local')
  })
})

describe('list and load', () => {
  it('lists bundled, global and local; ignores the custom word file', async () => {
    const { local, store } = setup()
    await store.importDictionary({ scope: 'global', ...valid })
    await store.importDictionary({ scope: 'local', name: 'names', wordList: 'Zephyr' })
    local.files.set('dictionaries/custom-words.txt', 'Zephyr\n')
    const list = await store.list()
    expect(list.map((d) => `${d.source}:${d.name}:${d.kind}`).sort()).toEqual([
      'bundled:en:hunspell',
      'global:fantasy:hunspell',
      'local:names:wordlist',
    ])
    expect(list.find((d) => d.source === 'bundled')!.readOnly).toBe(true)
  })

  it('local beats global with the same name', async () => {
    const { store } = setup()
    await store.importDictionary({ scope: 'global', name: 'shared', wordList: 'globalword' })
    await store.importDictionary({ scope: 'local', name: 'shared', wordList: 'localword' })
    expect(await store.load({ name: 'shared', scope: 'global' })).toEqual({
      kind: 'wordlist',
      words: ['localword'],
    })
    const list = await store.list()
    expect(list.find((d) => d.name === 'shared' && d.source === 'global')!.shadowed).toBe(true)
    expect(list.find((d) => d.name === 'shared' && d.source === 'local')!.shadowed).toBe(false)
  })

  it('loads hunspell, bundled and reports null for a missing one', async () => {
    const { store } = setup()
    await store.importDictionary({ scope: 'global', ...valid })
    expect(await store.load({ name: 'fantasy', scope: 'global' })).toEqual({
      kind: 'hunspell',
      aff: TINY_AFF,
      dic: TINY_DIC,
    })
    expect((await store.load({ name: 'en', scope: 'global' }))?.kind).toBe('hunspell')
    expect(await store.load({ name: 'nope', scope: 'global' })).toBeNull()
    expect(await store.load({ name: 'fantasy', scope: 'local' })).toBeNull()
  })
})

describe('remove, move and copy', () => {
  it('removes a dictionary; bundled and read-only are refused', async () => {
    const { local, store } = setup()
    await store.importDictionary({ scope: 'local', ...valid })
    await store.remove({ name: 'fantasy', scope: 'local' })
    expect(local.files.size).toBe(0)
    expect(await code(store.remove({ name: 'en', scope: 'global' }))).toBe('read-only')
    expect(await code(store.remove({ name: 'nope', scope: 'local' }))).toBe('not-found')
  })

  it('copy keeps the source', async () => {
    const { local, global, store } = setup()
    await store.importDictionary({ scope: 'local', ...valid })
    await store.moveOrCopy('fantasy', 'local', 'global', 'copy')
    expect(local.files.has('dictionaries/fantasy/index.dic')).toBe(true)
    expect(global.files.get('dictionaries/fantasy/index.aff')).toBe(TINY_AFF)
  })

  it('move removes the source', async () => {
    const { local, global, store } = setup()
    await store.importDictionary({ scope: 'local', name: 'names', wordList: 'Zephyr' })
    await store.moveOrCopy('names', 'local', 'global', 'move')
    expect(local.files.size).toBe(0)
    expect(global.files.get('dictionaries/names/words.txt')).toBe('Zephyr\n')
  })

  it('refuses when the target has the name, and when moving a bundled one', async () => {
    const { local, global, store } = setup()
    await store.importDictionary({ scope: 'local', ...valid })
    await store.importDictionary({ scope: 'global', ...valid })
    expect(await code(store.moveOrCopy('fantasy', 'local', 'global', 'move'))).toBe('exists')
    expect(local.files.has('dictionaries/fantasy/index.dic')).toBe(true)
    expect(global.files.has('dictionaries/fantasy/index.dic')).toBe(true)
    expect(await code(store.moveOrCopy('en', 'global', 'local', 'move'))).toBe('read-only')
    await store.moveOrCopy('en', 'global', 'local', 'copy')
    expect(local.files.has('dictionaries/en/index.dic')).toBe(true)
  })

  it('refuses writing to a read-only book', async () => {
    const { global, store } = setup({ readOnly: true })
    await store.importDictionary({ scope: 'global', ...valid })
    expect(await code(store.moveOrCopy('fantasy', 'global', 'local', 'copy'))).toBe('read-only')
    expect(global.files.has('dictionaries/fantasy/index.dic')).toBe(true)
  })
})
