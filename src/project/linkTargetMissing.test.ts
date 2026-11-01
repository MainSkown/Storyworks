import { describe, expect, it } from 'vitest'
import { buildProblems, linkTargetMissing } from './linkProblems'
import { CODEX_KIND, EVENT_KIND, type Link } from './links'

const ev: Link = { id: 'l1', kind: EVENT_KIND, from: { item: 's', block: 'b' }, to: { item: 't', block: 'n' } }
const cx: Link = { id: 'l2', kind: CODEX_KIND, from: { item: 's', block: 'b' }, to: { item: 'e1' } }

describe('linkTargetMissing', () => {
  it('an event link is missing when the index says so or the node is not loaded', () => {
    expect(linkTargetMissing(ev, { isBroken: () => false, nodeExists: () => true })).toBe(false)
    expect(linkTargetMissing(ev, { isBroken: () => true, nodeExists: () => true })).toBe(true)
    expect(linkTargetMissing(ev, { isBroken: () => false, nodeExists: () => false })).toBe(true)
  })

  it('a codex link ignores node lookups and follows the index only', () => {
    expect(linkTargetMissing(cx, { isBroken: () => false, nodeExists: () => false })).toBe(false)
    expect(linkTargetMissing(cx, { isBroken: () => true, nodeExists: () => true })).toBe(true)
  })

  it('a broken codex link becomes a relinkable problem; a good one none', () => {
    const run = (broken: boolean) =>
      buildProblems([cx], {
        targetMissing: (l) => linkTargetMissing(l, { isBroken: () => broken, nodeExists: () => false }),
        passageMissing: () => false,
      })
    expect(run(false)).toEqual([])
    expect(run(true)).toEqual([{ link: cx, targetMissing: true, passageMissing: false, canRelink: true }])
  })
})
