import { describe, expect, it } from 'vitest'
import { BEAT_MS, beatLevel, isFresh, maxLevel, staleAfter } from './heartbeat'

const MIN = 60_000

describe('heartbeat rest levels (like iclock-sync SmartTiming)', () => {
  it('steps down the longer it is still: Active, Rest, Nap', () => {
    expect(beatLevel(0, 12)).toBe('active')
    expect(beatLevel(1 * MIN, 12)).toBe('rest')
    expect(beatLevel(5 * MIN, 12)).toBe('nap')
  })
  it('in the day it never goes deeper than Nap', () => {
    expect(maxLevel(12)).toBe('nap')
    expect(beatLevel(120 * MIN, 12)).toBe('nap')
  })
  it('at night it can Sleep', () => {
    expect(maxLevel(23)).toBe('sleep')
    expect(maxLevel(3)).toBe('sleep')
    expect(beatLevel(15 * MIN, 23)).toBe('sleep')
  })
  it('sends less often at each deeper level', () => {
    expect(BEAT_MS.active).toBeLessThan(BEAT_MS.rest)
    expect(BEAT_MS.rest).toBeLessThan(BEAT_MS.nap)
    expect(BEAT_MS.nap).toBeLessThan(BEAT_MS.sleep)
  })
  it('others wait two missed beats (plus a margin) before treating it as gone', () => {
    const now = 10_000_000
    expect(isFresh({ updatedAt: now - BEAT_MS.sleep, level: 'sleep' }, now)).toBe(true)
    expect(isFresh({ updatedAt: now - staleAfter('sleep') - 1, level: 'sleep' }, now)).toBe(false)
    expect(isFresh({ updatedAt: now - 90_000, level: 'active' }, now)).toBe(false)
  })
})
