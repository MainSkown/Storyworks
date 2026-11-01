import { describe, expect, it } from 'vitest'
import { addCodexLink, addLink, type Link } from '../project/links'
import { orderPassages } from './appearsIn'

const mk = (scene: string, block: string, entry = 'e1', id?: string): Link =>
  addCodexLink([], { id, sceneId: scene, blockId: block, entryId: entry }).link!

describe('orderPassages', () => {
  const order = ['s1', 's2', 's3']
  const blocks = new Map([
    ['s1', ['a', 'b', 'c']],
    ['s2', ['x', 'y']],
  ])

  it('sorts by scene, then by block position', () => {
    const links = [
      mk('s2', 'y', 'e1', '1'),
      mk('s1', 'c', 'e1', '2'),
      mk('s1', 'a', 'e1', '3'),
      mk('s2', 'x', 'e1', '4'),
    ]
    expect(orderPassages(links, 'e1', order, blocks).map((l) => l.id)).toEqual(['3', '2', '4', '1'])
  })

  it('keeps only codex links to the entry', () => {
    const ev = addLink([], {
      from: { item: 's1', block: 'a' },
      to: { item: 'e1', block: 'n' },
    }).link!
    const links = [mk('s1', 'a', 'e2'), ev, mk('s1', 'b', 'e1', 'k')]
    expect(orderPassages(links, 'e1', order, blocks).map((l) => l.id)).toEqual(['k'])
  })

  it('puts gone scenes and unknown blocks last, ties by id', () => {
    const links = [
      mk('gone', 'q', 'e1', 'z'),
      mk('s1', 'zz', 'e1', 'b'),
      mk('s1', 'zz', 'e1', 'a'),
      mk('s1', 'a', 'e1', 'f'),
    ]
    expect(orderPassages(links, 'e1', order, blocks).map((l) => l.id)).toEqual(['f', 'a', 'b', 'z'])
  })
})
