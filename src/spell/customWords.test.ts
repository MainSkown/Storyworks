import { describe, expect, it } from 'vitest'
import { createMemoryProjectIO } from '../project/io/memory'
import { createCustomWords } from './customWords'

const PATH = 'dictionaries/custom-words.txt'

describe('custom words', () => {
  it('is empty when the file does not exist and creates it on first add', async () => {
    const io = createMemoryProjectIO()
    const cw = createCustomWords(() => ({ io, readOnly: false }))
    expect(await cw.load()).toEqual([])
    expect(io.files.has(PATH)).toBe(false)
    await cw.add('Zephyr')
    expect(io.files.get(PATH)).toBe('Zephyr\n')
  })

  it('keeps the list sorted and unique, ignores blanks', async () => {
    const io = createMemoryProjectIO()
    const cw = createCustomWords(() => ({ io, readOnly: false }))
    await cw.add('Wyvern')
    await cw.add(' Zephyr ')
    await cw.add('Wyvern')
    await cw.add('  ')
    expect(await cw.load()).toEqual(['Wyvern', 'Zephyr'])
  })

  it('removes a word', async () => {
    const io = createMemoryProjectIO({ [PATH]: 'A\r\nB\n' })
    const cw = createCustomWords(() => ({ io, readOnly: false }))
    expect(await cw.remove('A')).toEqual(['B'])
    expect(io.files.get(PATH)).toBe('B\n')
  })

  it('refuses to change a read-only book and leaves the file alone', async () => {
    const io = createMemoryProjectIO({ [PATH]: 'A\n' })
    const cw = createCustomWords(() => ({ io, readOnly: true }))
    await expect(cw.add('B')).rejects.toMatchObject({ code: 'read-only' })
    await expect(cw.remove('A')).rejects.toMatchObject({ code: 'read-only' })
    expect(await cw.load()).toEqual(['A'])
    expect(io.files.get(PATH)).toBe('A\n')
  })
})
