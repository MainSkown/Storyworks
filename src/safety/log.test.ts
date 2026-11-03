import { describe, expect, it } from 'vitest'
import { createMemoryFileIO } from '../io/fileIO'
import { createLogger, LOG_FILES, LOG_MAX_BYTES, logPath } from './log'

const logger = (io = createMemoryFileIO(), maxBytes = LOG_MAX_BYTES) =>
  createLogger(io, { now: () => Date.UTC(2026, 10, 3), maxBytes })
const lines = (io: { files: Map<string, string> }, n = 1) =>
  (io.files.get(logPath(n)) ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l))

describe('diagnostics log', () => {
  it('writes JSON lines with ts, level, event and code', async () => {
    const io = createMemoryFileIO()
    const log = logger(io)
    log.error('open.failed', Object.assign(new Error('x'), { code: 'invalid-schema' }))
    log.info('app.start')
    await log.flush()
    expect(lines(io)).toEqual([
      { ts: '2026-11-03T00:00:00.000Z', level: 'error', event: 'open.failed', code: 'invalid-schema' },
      { ts: '2026-11-03T00:00:00.000Z', level: 'info', event: 'app.start' },
    ])
  })

  it('never writes error messages, manuscript text or paths', async () => {
    const io = createMemoryFileIO()
    const log = logger(io)
    const secret = 'The widow walked to the quay at dawn'
    log.error('save failed: ' + secret, new Error(`${secret} in /home/ann/Books/Novel/manuscript/s1.json`))
    log.warn('export.failed', { message: secret, code: '/home/ann/x y' })
    await log.flush()
    const text = io.files.get(logPath(1))!
    expect(text).not.toContain('widow')
    expect(text).not.toContain('/home')
    expect(text).not.toContain('manuscript')
  })

  it('rotates at the size limit and keeps 5 files', async () => {
    const io = createMemoryFileIO()
    const log = logger(io, 300)
    for (let i = 0; i < 60; i++) log.info(`event.${i}`)
    await log.flush()
    for (let n = 1; n <= LOG_FILES; n++) expect(io.files.has(logPath(n))).toBe(true)
    expect(io.files.has(logPath(LOG_FILES + 1))).toBe(false)
    for (let n = 1; n <= LOG_FILES; n++) expect(io.files.get(logPath(n))!.length).toBeLessThanOrEqual(300)
    // newest line is in file 1, oldest kept ones are further back
    const newest = lines(io, 1).at(-1).event
    expect(newest).toBe('event.59')
    expect(lines(io, 5).at(-1).event < 'event.59').toBe(true)
  })

  it('continues the existing file after a restart', async () => {
    const io = createMemoryFileIO()
    const a = logger(io)
    a.info('one')
    await a.flush()
    const b = logger(io)
    b.info('two')
    await b.flush()
    expect(lines(io).map((l) => l.event)).toEqual(['one', 'two'])
  })

  it('never throws when the disk fails', async () => {
    const io = createMemoryFileIO()
    io.writeTextAtomic = async () => {
      throw new Error('disk full')
    }
    const log = logger(io)
    log.error('x')
    await expect(log.flush()).resolves.toBeUndefined()
  })
})
