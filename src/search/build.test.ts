import { describe, expect, it } from 'vitest'
import { buildIndex, loadBodies, type SearchSources } from './build'
import { search } from './query'

const p = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
})
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks })

const sources = (over: Partial<SearchSources> = {}): SearchSources => ({
  tree: [
    {
      id: 'ch1',
      type: 'chapter',
      title: 'Arrival',
      children: [
        { id: 's1', type: 'scene', title: 'Docks', path: 'manuscript/s1.json', children: [] },
      ],
    },
  ],
  sceneContent: new Map([['s1', doc(p('b1', 'The ship came in.'), p('b2', 'Anna stepped off.'))]]),
  rules: [
    {
      id: 'r1',
      title: 'Magic costs blood',
      description: doc(p('x', 'Every spell takes a toll.')),
      exceptions: doc(p('y', 'Except at the moonwell.')),
    },
  ],
  timelines: [
    {
      id: 't1',
      name: 'Main',
      nodes: [
        { id: 'n1', title: 'Siege', description: doc(p('z', 'The gate falls.')) },
      ],
    },
  ],
  entries: [
    {
      id: 'e1',
      name: 'Anna',
      aliases: ['Ania'],
      notes: doc(p('q', 'Born in Łódź.')),
      appendixText: 'A sailor.',
    },
  ],
  knowledge: [
    {
      id: 'k1',
      title: 'The secret door',
      description: doc(p('w', 'Behind the shelf.')),
      learnings: [{ note: 'found by accident' }],
    },
  ],
  ...over,
})

const ids = (text: string, s = sources()) =>
  search(buildIndex(s), text).groups.flatMap((g) => g.hits.map((h) => h.id))

describe('buildIndex', () => {
  it('indexes every area', () => {
    expect(ids('ship')).toEqual(['s1'])
    expect(ids('toll')).toEqual(['r1'])
    expect(ids('moonwell')).toEqual(['r1'])
    expect(ids('gate')).toEqual(['n1'])
    expect(ids('sailor')).toEqual(['e1'])
    expect(ids('shelf')).toEqual(['k1'])
    expect(ids('accident')).toEqual(['k1'])
  })

  it('finds chapters and timelines by title', () => {
    expect(ids('arrival')).toEqual(['ch1'])
    expect(ids('main')).toEqual(['t1'])
  })

  it('records the block id of a manuscript hit', () => {
    const hit = search(buildIndex(sources()), 'stepped').groups[0].hits[0]
    expect(hit.blockId).toBe('b2')
  })

  it('a node hit points at its timeline', () => {
    const hit = search(buildIndex(sources()), 'gate').groups[0].hits[0]
    expect(hit.parentId).toBe('t1')
  })

  it('scene bodies without ids still match', () => {
    const bare = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'no ids here' }] }] }
    expect(ids('no ids', sources({ sceneContent: new Map([['s1', bare]]) }))).toEqual(['s1'])
  })

  it('scenes without loaded content are found by title only', () => {
    const s = sources({ sceneContent: new Map() })
    expect(ids('docks', s)).toEqual(['s1'])
    expect(ids('ship', s)).toEqual([])
  })
})

describe('loadBodies', () => {
  it('fills pending scene bodies and makes them searchable', async () => {
    const ix = buildIndex(sources({ sceneContent: new Map() }))
    const n = await loadBodies(ix, async () => doc(p('b1', 'late arrival of text')), { chunk: 1 })
    expect(n).toBe(1)
    expect(search(ix, 'late arrival').groups[0].hits[0].id).toBe('s1')
  })

  it('does not overwrite a body that was loaded meanwhile', async () => {
    const ix = buildIndex(sources({ sceneContent: new Map() }))
    const n = await loadBodies(ix, async (id) => {
      ix.setParts(id, [{ text: 'fresh edit' }])
      return doc(p('b1', 'stale text'))
    })
    expect(n).toBe(0)
    expect(search(ix, 'stale').groups).toEqual([])
    expect(search(ix, 'fresh').groups).toHaveLength(1)
  })

  it('leaves a scene pending when its load fails', async () => {
    const ix = buildIndex(sources({ sceneContent: new Map() }))
    await loadBodies(ix, async () => null)
    expect(ix.pendingBodies()).toEqual(['s1'])
  })
})
