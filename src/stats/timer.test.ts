import { describe, expect, it } from 'vitest'
import { createTimer, formatClock } from './timer'

function setup() {
  let now = 0
  const timer = createTimer(() => now)
  return { timer, tick: (ms: number) => (now += ms) }
}

describe('timer', () => {
  it('starts at zero and stopped', () => {
    const { timer } = setup()
    expect(timer.running()).toBe(false)
    expect(timer.elapsed()).toBe(0)
  })

  it('counts while running', () => {
    const { timer, tick } = setup()
    timer.start()
    tick(65_000)
    expect(timer.running()).toBe(true)
    expect(timer.elapsed()).toBe(65_000)
  })

  it('pause keeps the time and resume continues from it', () => {
    const { timer, tick } = setup()
    timer.start()
    tick(10_000)
    timer.pause()
    tick(50_000)
    expect(timer.elapsed()).toBe(10_000)
    timer.start()
    tick(5_000)
    expect(timer.elapsed()).toBe(15_000)
  })

  it('start while running does not reset the run', () => {
    const { timer, tick } = setup()
    timer.start()
    tick(3_000)
    timer.start()
    tick(2_000)
    expect(timer.elapsed()).toBe(5_000)
  })

  it('reset stops and clears', () => {
    const { timer, tick } = setup()
    timer.start()
    tick(9_000)
    timer.reset()
    expect(timer.running()).toBe(false)
    expect(timer.elapsed()).toBe(0)
  })
})

describe('formatClock', () => {
  it('formats mm:ss and rolls into hours', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65_999)).toBe('01:05')
    expect(formatClock(59 * 60_000 + 59_000)).toBe('59:59')
    expect(formatClock(3_725_000)).toBe('1:02:05')
  })
})
