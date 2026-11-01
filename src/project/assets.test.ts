import { describe, expect, it } from 'vitest'
import { addImage } from './assets'
import { createMemoryProjectIO } from './io/memory'

// Assumes ProjectIO gains: writeBytes(path, bytes): Promise<void> and
// readBytes(path): Promise<Uint8Array | null> (null when missing).

const ids = () => {
  let i = 0
  return () => `img-${++i}`
}
const bytes = new Uint8Array([137, 80, 78, 71, 0, 255])

describe('addImage', () => {
  it('returns a relative assets/<id>.<ext> path', async () => {
    const path = await addImage(createMemoryProjectIO(), bytes, 'png', ids())
    expect(path).toBe('assets/img-1.png')
  })

  it('writes the bytes to that path', async () => {
    const io = createMemoryProjectIO()
    const path = await addImage(io, bytes, 'png', ids())
    expect(await io.readBytes(path)).toEqual(bytes)
  })

  it('two calls give different paths and keep both files', async () => {
    const io = createMemoryProjectIO()
    const newId = ids()
    const a = await addImage(io, bytes, 'png', newId)
    const b = await addImage(io, new Uint8Array([1, 2]), 'png', newId)
    expect(a).not.toBe(b)
    expect(await io.readBytes(a)).toEqual(bytes)
    expect(await io.readBytes(b)).toEqual(new Uint8Array([1, 2]))
  })

  it('lowercases the extension and strips a leading dot', async () => {
    const io = createMemoryProjectIO()
    expect(await addImage(io, bytes, 'PNG', ids())).toBe('assets/img-1.png')
    expect(await addImage(io, bytes, '.Jpg', ids())).toBe('assets/img-1.jpg')
  })

  it.each(['', '.', 'p/ng', 'p\\ng', '../x', 'tar.gz'])('rejects extension %j', async (ext) => {
    const io = createMemoryProjectIO()
    await expect(addImage(io, bytes, ext, ids())).rejects.toThrow()
    expect([...io.files.keys()]).toEqual([])
  })
})
