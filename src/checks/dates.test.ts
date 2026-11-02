import { describe, expect, it } from 'vitest'
import { gregorianCalendar, type CalendarDate } from '../calendar'
import { dateOrder, invalidNodeDates, type DateOrderTimeline } from './dates'

const cal = gregorianCalendar('cal')
const d = (year: number, month = 0, day = 1): CalendarDate => ({ year, month, day })

describe('invalidNodeDates', () => {
  const node = (id: string, date: CalendarDate | null) => ({
    id,
    title: `T${id}`,
    timelineId: 't',
    date,
  })

  it('flags a date that does not exist, naming the node', () => {
    const out = invalidNodeDates(cal, [node('a', d(2001, 1, 30))])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'invalid-date:a',
      checkId: 'invalid-date',
      severity: 'error',
      locations: [{ kind: 'node', id: 'a', label: 'Ta' }],
    })
  })
  it('flags a bad month', () => {
    expect(invalidNodeDates(cal, [node('a', d(2001, 12, 1))])).toHaveLength(1)
  })
  it('gives nothing for valid, leap-day and undated nodes', () => {
    expect(invalidNodeDates(cal, [node('a', d(2000, 1, 29)), node('b', null)])).toEqual([])
  })
  it('flags Feb 29 in a non-leap year', () => {
    expect(invalidNodeDates(cal, [node('a', d(2001, 1, 29))])).toHaveLength(1)
  })
  it('keeps the same ids on a re-run and does not change the input', () => {
    const nodes = [node('a', d(2001, 1, 30)), node('b', d(2001, 0, 1)), node('c', d(2002, 1, 31))]
    const snapshot = JSON.stringify(nodes)
    const ids = (r: ReturnType<typeof invalidNodeDates>) => r.map((f) => f.id)
    expect(ids(invalidNodeDates(cal, nodes))).toEqual(['invalid-date:a', 'invalid-date:c'])
    expect(ids(invalidNodeDates(cal, nodes))).toEqual(ids(invalidNodeDates(cal, nodes)))
    expect(JSON.stringify(nodes)).toBe(snapshot)
  })
})

type N = [id: string, date?: CalendarDate | null]
const tl = (nodes: N[], pairs: [string, string][], id = 't'): DateOrderTimeline => ({
  id,
  nodes: nodes.map(([nid, date]) => ({ id: nid, title: `T${nid}`, date: date ?? null })),
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
})

describe('dateOrder', () => {
  it('flags a follower dated before its predecessor; later node is first location', () => {
    const out = dateOrder(cal, [
      tl(
        [
          ['a', d(500)],
          ['b', d(300)],
        ],
        [['a', 'b']],
      ),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'date-order:a:b',
      checkId: 'date-order',
      severity: 'warning',
    })
    expect(out[0].locations.map((l) => [l.kind, l.id, l.label])).toEqual([
      ['node', 'b', 'Tb'],
      ['node', 'a', 'Ta'],
    ])
    expect(out[0].message).toContain('Tb')
    expect(out[0].message).toContain('Ta')
  })
  it('year 300 placed after year 500 gives a warning naming both nodes', () => {
    const out = dateOrder(cal, [
      tl(
        [
          ['x', d(500, 3, 10)],
          ['y', d(300, 3, 10)],
        ],
        [['x', 'y']],
      ),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].locations.map((l) => l.id)).toEqual(['y', 'x'])
  })
  it('gives nothing when dates are in order', () => {
    expect(
      dateOrder(cal, [
        tl(
          [
            ['a', d(300)],
            ['b', d(500)],
          ],
          [['a', 'b']],
        ),
      ]),
    ).toEqual([])
  })
  it('gives nothing for equal dates', () => {
    expect(
      dateOrder(cal, [
        tl(
          [
            ['a', d(300)],
            ['b', d(300)],
          ],
          [['a', 'b']],
        ),
      ]),
    ).toEqual([])
  })
  it('compares down to the day', () => {
    const out = dateOrder(cal, [
      tl(
        [
          ['a', d(300, 5, 2)],
          ['b', d(300, 5, 1)],
        ],
        [['a', 'b']],
      ),
    ])
    expect(out).toHaveLength(1)
  })
  it('skips an edge when either side is undated', () => {
    expect(dateOrder(cal, [tl([['a', d(500)], ['b']], [['a', 'b']])])).toEqual([])
    expect(dateOrder(cal, [tl([['a'], ['b', d(300)]], [['a', 'b']])])).toEqual([])
  })
  it('does not compare across an undated gap (only direct edges)', () => {
    const t = tl(
      [['a', d(500)], ['m'], ['b', d(300)]],
      [
        ['a', 'm'],
        ['m', 'b'],
      ],
    )
    expect(dateOrder(cal, [t])).toEqual([])
  })
  it('gives no date-order finding when a date is invalid', () => {
    expect(
      dateOrder(cal, [
        tl(
          [
            ['a', d(500)],
            ['b', d(300, 1, 30)],
          ],
          [['a', 'b']],
        ),
      ]),
    ).toEqual([])
    expect(
      dateOrder(cal, [
        tl(
          [
            ['a', d(500, 20, 1)],
            ['b', d(300)],
          ],
          [['a', 'b']],
        ),
      ]),
    ).toEqual([])
  })
  it('branch: only the inverted branch is flagged', () => {
    const t = tl(
      [
        ['a', d(400)],
        ['b', d(300)],
        ['c', d(450)],
      ],
      [
        ['a', 'b'],
        ['a', 'c'],
      ],
    )
    expect(dateOrder(cal, [t]).map((f) => f.id)).toEqual(['date-order:a:b'])
  })
  it('merge: each inverted incoming edge is its own finding', () => {
    const t = tl(
      [
        ['a', d(400)],
        ['b', d(200)],
        ['m', d(300)],
      ],
      [
        ['a', 'm'],
        ['b', 'm'],
      ],
    )
    expect(dateOrder(cal, [t]).map((f) => f.id)).toEqual(['date-order:a:m'])
    const t2 = tl(
      [
        ['a', d(400)],
        ['b', d(500)],
        ['m', d(300)],
      ],
      [
        ['a', 'm'],
        ['b', 'm'],
      ],
    )
    expect(
      dateOrder(cal, [t2])
        .map((f) => f.id)
        .sort(),
    ).toEqual(['date-order:a:m', 'date-order:b:m'])
  })
  it('long chain with one inversion gives exactly one finding', () => {
    const t = tl(
      [
        ['n1', d(100)],
        ['n2', d(200)],
        ['n3', d(300)],
        ['n4', d(250)],
        ['n5', d(400)],
        ['n6', d(500)],
      ],
      [
        ['n1', 'n2'],
        ['n2', 'n3'],
        ['n3', 'n4'],
        ['n4', 'n5'],
        ['n5', 'n6'],
      ],
    )
    const out = dateOrder(cal, [t])
    expect(out.map((f) => f.id)).toEqual(['date-order:n3:n4'])
  })
  it('a duplicated edge does not duplicate the finding', () => {
    const t = tl(
      [
        ['a', d(500)],
        ['b', d(300)],
      ],
      [
        ['a', 'b'],
        ['a', 'b'],
      ],
    )
    expect(dateOrder(cal, [t])).toHaveLength(1)
  })
  it('ignores edges that point to a missing node', () => {
    expect(
      dateOrder(cal, [
        tl(
          [['a', d(500)]],
          [
            ['a', 'ghost'],
            ['ghost', 'a'],
          ],
        ),
      ]),
    ).toEqual([])
  })
  it('checks each timeline on its own', () => {
    const out = dateOrder(cal, [
      tl(
        [
          ['a', d(500)],
          ['b', d(300)],
        ],
        [['a', 'b']],
        't1',
      ),
      tl(
        [
          ['c', d(100)],
          ['e', d(200)],
        ],
        [['c', 'e']],
        't2',
      ),
    ])
    expect(out.map((f) => f.id)).toEqual(['date-order:a:b'])
  })
  it('keeps the same ids on a re-run and does not change the input', () => {
    const ts = [
      tl(
        [
          ['a', d(500)],
          ['b', d(300)],
          ['c', d(100)],
        ],
        [
          ['a', 'b'],
          ['b', 'c'],
        ],
      ),
    ]
    const snapshot = JSON.stringify(ts)
    const first = dateOrder(cal, ts).map((f) => f.id)
    expect(first).toEqual(['date-order:a:b', 'date-order:b:c'])
    expect(dateOrder(cal, ts).map((f) => f.id)).toEqual(first)
    expect(JSON.stringify(ts)).toBe(snapshot)
  })
  it('swapping the dates changes the id (a changed problem reappears)', () => {
    const a = dateOrder(cal, [
      tl(
        [
          ['a', d(500)],
          ['b', d(300)],
        ],
        [['a', 'b']],
      ),
    ])
    const b = dateOrder(cal, [
      tl(
        [
          ['b', d(500)],
          ['a', d(300)],
        ],
        [['b', 'a']],
      ),
    ])
    expect(a[0].id).not.toBe(b[0].id)
  })
  it('empty input gives nothing', () => {
    expect(dateOrder(cal, [])).toEqual([])
  })
})
