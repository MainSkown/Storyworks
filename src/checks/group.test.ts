import { describe, expect, it } from 'vitest'
import { groupBySeverity } from './group'
import type { Finding, Severity } from './types'

const f = (id: string, severity: Severity): Finding => ({
  id,
  checkId: 'broken-link',
  severity,
  message: id,
  locations: [],
})

describe('groupBySeverity', () => {
  it('orders errors, warnings, info and keeps the item order inside', () => {
    const g = groupBySeverity([f('i1', 'info'), f('w1', 'warning'), f('e1', 'error'), f('e2', 'error')])
    expect(g.map((x) => x.severity)).toEqual(['error', 'warning', 'info'])
    expect(g[0]!.items.map((x) => x.id)).toEqual(['e1', 'e2'])
  })
  it('omits empty groups', () => {
    expect(groupBySeverity([f('w1', 'warning')]).map((x) => x.severity)).toEqual(['warning'])
    expect(groupBySeverity([])).toEqual([])
  })
})
