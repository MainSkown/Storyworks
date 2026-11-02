import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { stateKindPath } from './states'
import { stateKindSchema } from './schemas/stateKind'
import { serialize } from './serialize'
import type { Env } from './types'

const makeEnv = (): Env => {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const path = stateKindPath('k1')
const text = serialize(stateKindSchema, {
  version: 1,
  id: 'k1',
  name: 'Location',
  valueType: 'entry',
  exclusive: true,
})
const list = { stateKinds: [{ id: 'k1', path }] }

async function reopen(patch: Record<string, unknown>, files: Record<string, string>) {
  const io = createMemoryProjectIO()
  const env = makeEnv()
  await createProject(io, { title: 'B', author: 'A', language: 'en' }, env)
  for (const [p, t] of Object.entries(files)) io.files.set(p, t)
  io.files.set(
    'project.json',
    JSON.stringify({ ...JSON.parse(io.files.get('project.json') as string), ...patch }),
  )
  const r = await openProject(io, env)
  if (r.status !== 'ok') throw new Error('open failed')
  return { io, r }
}

describe('state kind files on open', () => {
  it('the path is state-kinds/<id>.json', () => {
    expect(path).toBe('state-kinds/k1.json')
  })
  it('a valid file is clean', async () => {
    expect((await reopen(list, { [path]: text })).r.issues).toEqual([])
  })
  it('a missing file is reported', async () => {
    expect((await reopen(list, {})).r.issues).toEqual([{ kind: 'missing', itemId: 'k1', path }])
  })
  it('an invalid file is reported and left untouched', async () => {
    const { io, r } = await reopen(list, { [path]: '{"version":1}' })
    expect(r.issues.map((i) => i.kind)).toEqual(['invalid'])
    expect(r.project.isInvalid(path)).toBe(true)
    expect(io.files.get(path)).toBe('{"version":1}')
  })
  it('a file with another id is invalid', async () => {
    const { r } = await reopen(list, { [path]: text.replace('"id": "k1"', '"id": "other"') })
    const issue = r.issues[0]
    expect(issue.kind === 'invalid' && issue.error.field).toBe('id')
  })
  it('an unlisted file is reported', async () => {
    const { r } = await reopen({}, { [path]: text })
    expect(r.issues).toEqual([{ kind: 'unlisted', path }])
  })
  it('reloadItem flags an outside edit that breaks the file', async () => {
    const { io, r } = await reopen(list, { [path]: text })
    io.files.set(path, '{"version":1}')
    expect((await r.project.reloadItem(path)).status).toBe('invalid')
  })
})
