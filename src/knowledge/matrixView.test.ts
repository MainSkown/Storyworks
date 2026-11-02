import { describe, expect, it } from 'vitest'
import { matrixEntryIds, nextCell } from './matrixView'

const types = [{ id: 'char' }, { id: 'place' }]
const entries = [
  { id: 'harbor', typeId: 'place' },
  { id: 'anna', typeId: 'char' },
  { id: 'boris', typeId: 'char' },
  { id: 'cleo', typeId: 'char' },
  { id: 'lost', typeId: 'gone' },
]
const items = [
  { id: 'k1', learnings: [{ entryId: 'harbor' }, { entryId: 'boris' }, { entryId: 'lost' }] },
  { id: 'k2', learnings: [{ entryId: 'anna' }, { entryId: 'boris' }] },
]

describe('matrix rows', () => {
  it('lists only entries with a learning, by type order, unlisted types last', () => {
    expect(matrixEntryIds(entries, types, items, null)).toEqual(['anna', 'boris', 'harbor', 'lost'])
  })

  it('limits rows to one type', () => {
    expect(matrixEntryIds(entries, types, items, 'char')).toEqual(['anna', 'boris'])
  })

  it('is empty without learnings', () => {
    expect(matrixEntryIds(entries, types, [{ id: 'k', learnings: [] }], null)).toEqual([])
  })
})

describe('grid keys', () => {
  const size = { rows: 3, cols: 4 }
  it('moves one cell and stops at the edges', () => {
    expect(nextCell({ r: 1, c: 1 }, 'ArrowRight', size)).toEqual({ r: 1, c: 2 })
    expect(nextCell({ r: 0, c: 0 }, 'ArrowUp', size)).toEqual({ r: 0, c: 0 })
    expect(nextCell({ r: 2, c: 3 }, 'ArrowDown', size)).toEqual({ r: 2, c: 3 })
    expect(nextCell({ r: 1, c: 0 }, 'ArrowLeft', size)).toEqual({ r: 1, c: 0 })
  })

  it('Home/End go to the row ends, with ctrl to the grid corners', () => {
    expect(nextCell({ r: 1, c: 2 }, 'Home', size)).toEqual({ r: 1, c: 0 })
    expect(nextCell({ r: 1, c: 2 }, 'End', size)).toEqual({ r: 1, c: 3 })
    expect(nextCell({ r: 1, c: 2 }, 'End', size, { ctrl: true })).toEqual({ r: 2, c: 3 })
    expect(nextCell({ r: 1, c: 2 }, 'Home', size, { ctrl: true })).toEqual({ r: 0, c: 0 })
  })

  it('pages by rows and clamps', () => {
    expect(nextCell({ r: 0, c: 1 }, 'PageDown', size)).toEqual({ r: 2, c: 1 })
    expect(nextCell({ r: 2, c: 1 }, 'PageUp', size, { page: 1 })).toEqual({ r: 1, c: 1 })
  })
})
