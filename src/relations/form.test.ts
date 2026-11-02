import { describe, expect, it } from 'vitest'
import { docText, endpoints, entryOptions, rejectionKey } from './form'

describe('relationship form helpers', () => {
  it('orders the ends by direction', () => {
    expect(endpoints('a', 'b', 'out')).toEqual({ fromId: 'a', toId: 'b' })
    expect(endpoints('a', 'b', 'in')).toEqual({ fromId: 'b', toId: 'a' })
  })

  it('maps refusals to message keys, unknown ones to a generic key', () => {
    expect(rejectionKey('duplicate')).toBe('relations.reject.duplicate')
    expect(rejectionKey('self')).toBe('relations.reject.self')
    expect(rejectionKey('whatever')).toBe('relations.reject.other')
  })

  it('lists pickable entries without the excluded ones, filtered by alias', () => {
    const types = [{ id: 't', name: 'Person', color: '#111111' }]
    const entries = [
      { id: 'a', name: 'Anna', typeId: 't', aliases: [] },
      { id: 'b', name: 'Bob', typeId: 't', aliases: ['Robert'] },
    ]
    expect(entryOptions(entries, types, '', ['a']).map((o) => o.value)).toEqual(['b'])
    expect(entryOptions(entries, types, 'robert').map((o) => o.value)).toEqual(['b'])
    expect(entryOptions(entries, types, '')[0]).toMatchObject({ typeName: 'Person', typeColor: '#111111' })
  })

  it('extracts and shortens note text', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Met' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'in the city' }] },
      ],
    }
    expect(docText(doc)).toBe('Met in the city')
    expect(docText(doc, 5)).toBe('Met…')
    expect(docText({ type: 'doc', content: [] })).toBe('')
  })
})
