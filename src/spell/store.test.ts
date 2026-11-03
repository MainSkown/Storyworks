import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { LOCK_PATH } from '../project/lock'
import { createSpellEngine } from './engine'
import { TINY_AFF, TINY_DIC } from './fixtures'
import {
  resetSpellDepsFactory,
  setSpellDepsFactory,
  useSpellStore,
  type SpellDeps,
} from './store'

let io: MemoryProjectIO
let global: MemoryProjectIO
let loads: string[]

beforeEach(() => {
  io = createMemoryProjectIO()
  global = createMemoryProjectIO()
  loads = []
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
  const bundledFiles: Record<string, string> = {
    'dictionaries/en/index.aff': TINY_AFF,
    'dictionaries/en/index.dic': '2\nhello\nworld\n',
    'dictionaries/pl/index.aff': TINY_AFF,
    'dictionaries/pl/index.dic': '2\ncześć\nświat\n',
  }
  setSpellDepsFactory(
    (): SpellDeps => ({
      globalStorage: global,
      bundled: { names: ['en', 'pl'], fetchText: async (u) => bundledFiles[u] ?? null },
      createEngine: (load) => {
        const engine = createSpellEngine({
          load: (ref) => {
            loads.push(`${ref.scope}:${ref.name}`)
            return load(ref)
          },
        })
        return {
          setDictionaries: (s, c) => engine.setDictionaries(s, c),
          checkText: async (t) => engine.checkText(t),
          suggest: async (w) => engine.suggest(w),
          invalidate: async () => engine.invalidate(),
        }
      },
    }),
  )
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
  resetSpellDepsFactory()
})

async function setup(language = 'en') {
  setActivePinia(createPinia())
  const project = useProjectStore()
  await project.create('book', { title: 'T', author: 'A', language })
  const spell = useSpellStore()
  return { project, spell }
}

describe('spell store', () => {
  it('uses the language default without writing the manifest', async () => {
    const { project, spell } = await setup('pl')
    await project.flush()
    const before = io.files.get('project.json')
    await spell.start()
    expect(spell.isDefault).toBe(true)
    expect(spell.selection).toEqual([{ name: 'pl', scope: 'global' }])
    expect(await spell.checkText('cześć światt')).toMatchObject([{ word: 'światt' }])
    await project.flush()
    expect(io.files.get('project.json')).toBe(before)
    expect(project.dictionaries).toEqual([])
  })

  it('loads nothing until started', async () => {
    const { spell } = await setup()
    await spell.refresh()
    expect(loads).toEqual([])
    await spell.start()
    expect(loads).toEqual(['global:en'])
  })

  it('a missing selected dictionary is reported, skipped and kept in the manifest', async () => {
    const { project, spell } = await setup()
    project.setDictionaries([
      { name: 'en', scope: 'global' },
      { name: 'ghost', scope: 'global' },
    ])
    await spell.start()
    expect(spell.missing).toEqual([{ name: 'ghost', scope: 'global' }])
    expect(spell.active).toBe(true)
    expect(await spell.checkText('hello wrld')).toHaveLength(1)
    expect(project.dictionaries).toHaveLength(2)
  })

  it('everything missing: nothing is flagged', async () => {
    const { project, spell } = await setup()
    project.setDictionaries([{ name: 'ghost', scope: 'local' }])
    await spell.start()
    expect(spell.active).toBe(false)
    expect(await spell.checkText('anything goes')).toEqual([])
  })

  it('an imported and selected dictionary stops flagging its words', async () => {
    const { spell } = await setup()
    await spell.start()
    expect(await spell.checkText('zephyrs')).toHaveLength(1)
    await spell.importDictionary({ scope: 'local', name: 'fantasy', dic: TINY_DIC, aff: TINY_AFF })
    expect(spell.infos.some((i) => i.name === 'fantasy')).toBe(true)
    spell.toggle({ name: 'fantasy', scope: 'local' }, true)
    await spell.start()
    expect(spell.selection).toEqual([
      { name: 'en', scope: 'global' },
      { name: 'fantasy', scope: 'local' },
    ])
    expect(await spell.checkText('zephyrs')).toEqual([])
  })

  it('a failed import adds nothing', async () => {
    const { spell } = await setup()
    await spell.start()
    await expect(
      spell.importDictionary({ scope: 'global', name: 'bad', dic: 'nope', aff: TINY_AFF }),
    ).rejects.toMatchObject({ code: 'bad-dic' })
    expect(spell.infos.some((i) => i.name === 'bad')).toBe(false)
    expect(await global.listFiles('dictionaries')).toEqual([])
  })

  it('custom words and ignore stop the flag; ignore is session only', async () => {
    const { project, spell } = await setup()
    await spell.start()
    expect(await spell.checkText('Zorg zorg')).toHaveLength(2)
    await spell.addWord('Zorg')
    expect(await spell.checkText('Zorg')).toEqual([])
    expect(io.files.get('dictionaries/custom-words.txt')).toBe('Zorg\n')
    spell.ignoreWord('Blarf')
    expect(await spell.checkText('blarf')).toEqual([])
    await project.close()
  })

  it('read-only books refuse custom words', async () => {
    const { project, spell } = await setup()
    await project.close()
    io.files.set(LOCK_PATH, JSON.stringify({ machine: 'elsewhere', pid: 42, timestamp: Date.now() }))
    await project.open('book')
    await project.resolveLockPrompt('readOnly')
    await spell.start()
    await expect(spell.addWord('x')).rejects.toBeTruthy()
  })

  it('moving a selected dictionary keeps it selected under the new scope', async () => {
    const { spell } = await setup()
    await spell.importDictionary({ scope: 'global', name: 'fantasy', dic: TINY_DIC, aff: TINY_AFF })
    spell.toggle({ name: 'fantasy', scope: 'global' }, true)
    await spell.moveOrCopy('fantasy', 'global', 'local', 'move')
    expect(spell.selection).toEqual([
      { name: 'en', scope: 'global' },
      { name: 'fantasy', scope: 'local' },
    ])
  })
})
