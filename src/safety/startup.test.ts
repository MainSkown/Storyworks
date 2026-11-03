import { describe, expect, it } from 'vitest'
import { createMemoryFileIO } from '../io/fileIO'
import { MARKER_PATH } from './marker'
import { beginSession, type SafetyEnv } from './startup'

const env = (pid: number, alive: number[] = []): SafetyEnv => ({
  now: () => 1000,
  pid: () => pid,
  processAlive: async (p) => alive.includes(p),
})
const marker = (pid: number, lastBook: string | null = '/books/a') =>
  JSON.stringify({ pid, startedAt: 5, lastBook })

describe('crash-safe startup', () => {
  it('writes the marker at start and removes it on clean exit', async () => {
    const io = createMemoryFileIO()
    const s = await beginSession(io, env(10))
    expect(s.state.kind).toBe('clean')
    expect(JSON.parse(io.files.get(MARKER_PATH)!)).toEqual({ pid: 10, startedAt: 1000, lastBook: null })
    await s.end()
    expect(io.files.has(MARKER_PATH)).toBe(false)
  })

  it('finds a crash when a marker of a dead process is left', async () => {
    const io = createMemoryFileIO({ [MARKER_PATH]: marker(99) })
    const s = await beginSession(io, env(10))
    expect(s.state).toEqual({ kind: 'crashed', lastBook: '/books/a' })
    expect(JSON.parse(io.files.get(MARKER_PATH)!).pid).toBe(10)
  })

  it('keeps the last book across a second start before any book is opened', async () => {
    const io = createMemoryFileIO({ [MARKER_PATH]: marker(99) })
    await beginSession(io, env(10))
    const again = await beginSession(io, env(11))
    expect(again.state).toEqual({ kind: 'crashed', lastBook: '/books/a' })
  })

  it('does not call a live other instance a crash and leaves its marker alone', async () => {
    const io = createMemoryFileIO({ [MARKER_PATH]: marker(99) })
    const s = await beginSession(io, env(10, [99]))
    expect(s.state.kind).toBe('other-instance')
    await s.setLastBook('/books/b')
    await s.end()
    expect(io.files.get(MARKER_PATH)).toBe(marker(99))
  })

  it('treats a marker of the same process (page reload) as clean', async () => {
    const io = createMemoryFileIO({ [MARKER_PATH]: marker(10) })
    expect((await beginSession(io, env(10))).state.kind).toBe('clean')
  })

  it('treats an unreadable marker as a crash without a last book', async () => {
    const io = createMemoryFileIO({ [MARKER_PATH]: '{nope' })
    expect((await beginSession(io, env(10))).state).toEqual({ kind: 'crashed', lastBook: null })
  })

  it('stores the last book in the marker', async () => {
    const io = createMemoryFileIO()
    const s = await beginSession(io, env(10))
    await s.setLastBook('/books/z')
    expect(JSON.parse(io.files.get(MARKER_PATH)!).lastBook).toBe('/books/z')
  })
})
