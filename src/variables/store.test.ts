import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { LOCK_PATH } from '../project/lock'
import { VARIABLES_FILE } from '../project/schemas/variables'
import { useVariablesStore } from './store'

let io: MemoryProjectIO
beforeEach(() => {
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

async function opened() {
  setActivePinia(createPinia())
  const p = useProjectStore()
  expect(await p.create('game', { title: 'G', author: 'A', language: 'en', kind: 'game' })).toBe(
    'opened',
  )
  return { p, v: useVariablesStore() }
}
const json = (path: string) => JSON.parse(io.files.get(path) as string)

describe('variables store', () => {
  it('a new game has no variables and no file', async () => {
    const { v } = await opened()
    expect(v.variables).toEqual([])
    expect(v.status).toBe('none')
    expect(io.files.has(VARIABLES_FILE)).toBe(false)
  })

  it('the first add creates the file and the manifest ref; later edits update the file', async () => {
    const { p, v } = await opened()
    expect(await v.add('gold', 'number')).toEqual({ ok: true })
    await p.flush()
    expect(json(VARIABLES_FILE).variables).toHaveLength(1)
    expect(json('project.json').variables).toMatchObject({ path: VARIABLES_FILE })
    expect(v.setDefault(v.variables[0].id, 10)).toEqual({ ok: true })
    await p.flush()
    expect(json(VARIABLES_FILE).variables[0]).toMatchObject({
      name: 'gold',
      type: 'number',
      default: 10,
    })
  })

  it('variables survive close and reopen', async () => {
    const { p, v } = await opened()
    await v.add('met_king', 'flag')
    await v.add('alias', 'text')
    await p.close()
    await p.open('game/project.json')
    expect(v.variables.map((x) => [x.name, x.type, x.default])).toEqual([
      ['met_king', 'flag', false],
      ['alias', 'text', ''],
    ])
  })

  it('refuses a duplicate or empty name without writing', async () => {
    const { p, v } = await opened()
    await v.add('gold', 'number')
    await p.flush()
    const before = io.files.get(VARIABLES_FILE)
    expect(await v.add('GOLD', 'flag')).toEqual({ ok: false, reason: 'duplicate-name' })
    expect(await v.add(' ', 'flag')).toEqual({ ok: false, reason: 'empty-name' })
    await p.flush()
    expect(io.files.get(VARIABLES_FILE)).toBe(before)
  })

  it('rename, retype and remove work through the store', async () => {
    const { v } = await opened()
    await v.add('a', 'number')
    const id = v.variables[0].id
    expect(v.rename(id, 'b')).toEqual({ ok: true })
    expect(v.retype(id, 'text')).toEqual({ ok: true })
    expect(v.variables[0]).toMatchObject({ name: 'b', type: 'text', default: '' })
    expect(v.remove(id)).toEqual({ ok: true })
    expect(v.variables).toEqual([])
  })

  it('an invalid file is reported, left untouched and refuses edits', async () => {
    const { p, v } = await opened()
    await v.add('a', 'flag')
    await p.flush()
    io.files.set(VARIABLES_FILE, '{"version":1,"variables":[{"id":"1"}]}')
    const before = io.files.get(VARIABLES_FILE)
    await p.close()
    await p.open('game/project.json')
    expect(v.status).toBe('invalid')
    expect(v.variables).toEqual([])
    expect(await v.add('b', 'flag')).toEqual({ ok: false, reason: 'unavailable' })
    await p.flush()
    expect(io.files.get(VARIABLES_FILE)).toBe(before)
  })

  it('a missing file is reported', async () => {
    const { p, v } = await opened()
    await v.add('a', 'flag')
    await p.flush()
    io.files.delete(VARIABLES_FILE)
    await p.close()
    await p.open('game/project.json')
    expect(v.status).toBe('missing')
  })

  it('a read-only project refuses edits', async () => {
    const { p, v } = await opened()
    await v.add('a', 'flag')
    await p.close()
    io.files.set(
      LOCK_PATH,
      JSON.stringify({ machine: 'elsewhere', pid: 42, timestamp: Date.now() }),
    )
    await p.open('game')
    await p.resolveLockPrompt('readOnly')
    expect(v.variables).toHaveLength(1)
    expect(await v.add('b', 'flag')).toEqual({ ok: false, reason: 'read-only' })
    expect(v.rename(v.variables[0].id, 'c')).toEqual({ ok: false, reason: 'read-only' })
  })
})
