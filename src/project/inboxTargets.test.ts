import { describe, expect, it } from 'vitest'
import { targetOptions } from './inboxTargets'
import type { ManuscriptNode } from './schemas/manifest'

const n = (id: string, type: ManuscriptNode['type'], children: ManuscriptNode[] = []) =>
  ({ id, type, title: id, children }) as ManuscriptNode

const tree = [
  n('p', 'part', [n('c1', 'chapter', [n('s1', 'scene')])]),
  n('c2', 'chapter', [n('s2', 'scene')]),
]

describe('targetOptions', () => {
  it('lists scenes in tree order with their path', () => {
    expect(targetOptions(tree, ['scene'])).toEqual([
      { id: 's1', label: 'p › c1 › s1' },
      { id: 's2', label: 'c2 › s2' },
    ])
  })

  it('lists containers for the new-scene target', () => {
    expect(targetOptions(tree, ['part', 'chapter']).map((o) => o.id)).toEqual(['p', 'c1', 'c2'])
  })
})
