import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO, type MemoryProjectIO } from './io/memory'
import { migrations } from './migrations'
import { createProject, openProject } from './open'
import { codexEntrySchema } from './schemas/codexEntry'
import { manifestSchema, MANIFEST_VERSION } from './schemas/manifest'
import { parseFile } from './serialize'
import type { Env } from './types'

const BACKUP_V7 = '.storyworks/backups/pre-migration-v7-'

function makeEnv(): Env {
  let n = 0
  return { now: () => 1_700_000_000_000, newId: () => `id-${++n}` }
}

const json = (io: MemoryProjectIO, path: string) => JSON.parse(io.files.get(path) as string)
const write = (io: MemoryProjectIO, path: string, value: unknown) =>
  io.files.set(path, JSON.stringify(value, null, 2) + '\n')

const entryV1 = (id: string) => ({
  version: 1,
  id,
  typeId: 't1',
  name: `Entry ${id}`,
  aliases: [],
  image: null,
  notes: { type: 'doc', content: [] },
  tags: [],
  ruleIds: [],
  appendixText: '',
  includeInAppendices: false,
})
const TRASH_PATH = '.storyworks/trash/e-2/e-2.json'
const trashed = {
  id: 'e-2',
  type: 'entry',
  title: 'Entry e-2',
  originalPath: 'codex/e-2.json',
  trashPath: TRASH_PATH,
  parentId: null,
  index: 1,
  deletedAt: '2020-01-01T00:00:00.000Z',
}

/** v7 book with a live entry e-1, a trashed entry e-2 and a rule file. */
async function v7Project(): Promise<MemoryProjectIO> {
  const io = createMemoryProjectIO()
  await createProject(io, { title: 'Old', author: 'Ann', language: 'en' }, makeEnv())
  write(io, 'codex/e-1.json', entryV1('e-1'))
  write(io, TRASH_PATH, entryV1('e-2'))
  write(io, 'project.json', {
    ...json(io, 'project.json'),
    version: 7,
    codexEntries: [{ id: 'e-1', path: 'codex/e-1.json', title: 'Entry e-1' }],
    trash: [trashed],
  })
  return io
}

describe('migration v7 to v8', () => {
  it('the step is registered', () => {
    expect(migrations.find((m) => m.from === 7)?.to).toBe(8)
  })

  it('opens a v7 project at the current version', async () => {
    const io = await v7Project()
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.project.manifest.version).toBe(MANIFEST_VERSION)
  })

  it('migrates a live entry file to version 2 with empty states', async () => {
    const io = await v7Project()
    await openProject(io, makeEnv())
    const r = parseFile(codexEntrySchema, io.files.get('codex/e-1.json') as string, 'p')
    expect(r.ok && r.value).toMatchObject({ version: 2, id: 'e-1', states: [] })
  })

  it('migrates an entry in the trash too', async () => {
    const io = await v7Project()
    await openProject(io, makeEnv())
    const r = parseFile(codexEntrySchema, io.files.get(TRASH_PATH) as string, 'p')
    expect(r.ok && r.value).toMatchObject({ version: 2, id: 'e-2', states: [] })
  })

  it('writes a valid manifest and leaves scenes unchanged', async () => {
    const io = await v7Project()
    const scenePath = [...io.files.keys()].find((k) => k.startsWith('manuscript/')) as string
    const before = io.files.get(scenePath)
    await openProject(io, makeEnv())
    expect(parseFile(manifestSchema, io.files.get('project.json') as string, 'p').ok).toBe(true)
    expect(io.files.get(scenePath)).toBe(before)
  })

  it('backs up the v7 project before writing', async () => {
    const io = await v7Project()
    const old = io.files.get('project.json')
    await openProject(io, makeEnv())
    const backup = [...io.files.keys()].find(
      (k) => k.startsWith(BACKUP_V7) && k.endsWith('/project.json'),
    )
    expect(io.files.get(backup as string)).toBe(old)
    const entry = [...io.files.keys()].find(
      (k) => k.startsWith(BACKUP_V7) && k.endsWith('/codex/e-1.json'),
    )
    expect(JSON.parse(io.files.get(entry as string) as string).version).toBe(1)
  })

  it('a missing entry file is left alone and the manifest still migrates', async () => {
    const io = await v7Project()
    io.files.delete('codex/e-1.json')
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    expect(io.files.has('codex/e-1.json')).toBe(false)
  })

  it('a hand-broken entry file stays byte-identical; the project opens and the other entry migrates', async () => {
    const io = await v7Project()
    write(io, 'codex/e-3.json', entryV1('e-3'))
    const m = json(io, 'project.json')
    m.codexEntries.push({ id: 'e-3', path: 'codex/e-3.json', title: 'Entry e-3' })
    write(io, 'project.json', m)
    const broken = JSON.stringify({ ...entryV1('e-1'), name: 5 })
    io.files.set('codex/e-1.json', broken)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    expect(io.files.get('codex/e-1.json')).toBe(broken)
    expect(json(io, 'codex/e-3.json')).toMatchObject({ version: 2, states: [] })
    expect(json(io, 'project.json').version).toBe(MANIFEST_VERSION)
    if (r.status === 'ok') expect(r.issues.map((i) => i.kind)).toEqual(['invalid'])
  })

  it('a newer-than-current version still opens read-only and untouched', async () => {
    const io = await v7Project()
    write(io, 'project.json', { ...json(io, 'project.json'), version: MANIFEST_VERSION + 1 })
    const before = new Map(io.files)
    const r = await openProject(io, makeEnv())
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.project.readOnly).toEqual({ reason: 'newer-version' })
    expect(io.files).toEqual(before)
  })
})
