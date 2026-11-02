import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from './io/memory'
import { createProject, openProject } from './open'
import { groupPath, relationshipPath, relationTypePath, RELATION_LAYOUT_PATH } from './relations'
import { groupSchema } from './schemas/group'
import { relationLayoutSchema } from './schemas/relationLayout'
import { relationshipSchema } from './schemas/relationship'
import { relationTypeSchema } from './schemas/relationType'
import { serialize } from './serialize'
import type { Env } from './types'

const makeEnv = (): Env => {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const type = serialize(relationTypeSchema, { version: 1, id: 't1', name: 'Friend', reverseLabel: '', color: '#000' })
const rel = serialize(relationshipSchema, {
  version: 1, id: 'r1', fromId: 'a', toId: 'b', typeId: 't1', note: { type: 'doc', content: [] }, nodeRef: null,
})
const grp = serialize(groupSchema, { version: 1, id: 'g1', name: 'G', color: '#000', memberIds: [] })
const layout = serialize(relationLayoutSchema, { version: 1, positions: {} })

const cases = [
  ['relation type', relationTypePath('t1'), 't1', type, 'relationTypes'],
  ['relationship', relationshipPath('r1'), 'r1', rel, 'relationships'],
  ['group', groupPath('g1'), 'g1', grp, 'groups'],
] as const

async function book() {
  const io = createMemoryProjectIO()
  const env = makeEnv()
  await createProject(io, { title: 'B', author: 'A', language: 'en' }, env)
  const r = await openProject(io, env)
  if (r.status !== 'ok') throw new Error('open failed')
  return { io, env, project: r.project }
}

/** Lists the file in the manifest on disk, then reopens. */
async function reopen(io: Awaited<ReturnType<typeof book>>['io'], env: Env, patch: Record<string, unknown>) {
  io.files.set('project.json', JSON.stringify({ ...JSON.parse(io.files.get('project.json') as string), ...patch }))
  const r = await openProject(io, env)
  if (r.status !== 'ok') throw new Error('open failed')
  return r
}

describe.each(cases)('%s files on open', (_n, path, id, text, key) => {
  const list = { [key]: [{ id, path }] }

  it('a valid file is clean', async () => {
    const { io, env } = await book()
    io.files.set(path, text)
    expect((await reopen(io, env, list)).issues).toEqual([])
  })
  it('a missing file is reported', async () => {
    const { io, env } = await book()
    expect((await reopen(io, env, list)).issues).toEqual([{ kind: 'missing', itemId: id, path }])
  })
  it('an invalid file is reported and left untouched', async () => {
    const { io, env } = await book()
    io.files.set(path, '{"version":1}')
    const r = await reopen(io, env, list)
    expect(r.issues.map((i) => i.kind)).toEqual(['invalid'])
    expect(r.project.isInvalid(path)).toBe(true)
    expect(io.files.get(path)).toBe('{"version":1}')
  })
  it('a file with another id is invalid', async () => {
    const { io, env } = await book()
    io.files.set(path, text.replace(`"id": "${id}"`, '"id": "other"'))
    const r = await reopen(io, env, list)
    const issue = r.issues[0]
    expect(issue.kind === 'invalid' && issue.error.field).toBe('id')
  })
  it('reloadItem flags an outside edit that breaks the file', async () => {
    const { io, env } = await book()
    io.files.set(path, text)
    const { project } = await reopen(io, env, list)
    io.files.set(path, '{"version":1}')
    expect((await project.reloadItem(path)).status).toBe('invalid')
  })
})

describe('relation layout file on open', () => {
  const list = { relationLayout: { id: 'lay', path: RELATION_LAYOUT_PATH } }

  it('a valid layout is clean and not reported as unlisted', async () => {
    const { io, env } = await book()
    io.files.set(RELATION_LAYOUT_PATH, layout)
    expect((await reopen(io, env, list)).issues).toEqual([])
  })
  it('an unlisted layout file is reported', async () => {
    const { io, env } = await book()
    io.files.set(RELATION_LAYOUT_PATH, layout)
    const r = await openProject(io, env)
    expect(r.status === 'ok' && r.issues).toEqual([{ kind: 'unlisted', path: RELATION_LAYOUT_PATH }])
  })
  it('an invalid layout is reported and left untouched', async () => {
    const { io, env } = await book()
    io.files.set(RELATION_LAYOUT_PATH, '{"version":1,"positions":{"a":{"x":1}}}')
    const r = await reopen(io, env, list)
    expect(r.issues.map((i) => i.kind)).toEqual(['invalid'])
    expect(io.files.get(RELATION_LAYOUT_PATH)).toBe('{"version":1,"positions":{"a":{"x":1}}}')
  })
})
