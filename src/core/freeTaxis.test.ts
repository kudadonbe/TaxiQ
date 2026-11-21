import { describe, expect, it } from 'vitest'
import { countFree, FREE_MIN_GAP_MS, FREE_REFRESH_MS, FREE_STALE_MS, freeShown, shouldWriteFree, unavailableTaxis } from './freeTaxis'

const taxis = [
  { id: 'a', suspended: false },
  { id: 'b', suspended: true },
  { id: 'c', suspended: false, vehicleId: 'v1' },
  { id: 'd', suspended: false },
  { id: 'e', suspended: false, vehicleId: null },
]

describe('unavailableTaxis', () => {
  it('skips suspended, off-duty and out-on-private-hire taxis', () => {
    expect([...unavailableTaxis(taxis, new Set(['d']), new Set(['v1']))].sort()).toEqual(['b', 'c', 'd'])
  })
  it('a linked taxi whose vehicle is not on the private map is available', () => {
    expect(unavailableTaxis(taxis, new Set(), new Set(['v9'])).has('c')).toBe(false)
  })
})

describe('countFree', () => {
  const registered = new Set(taxis.map((t) => t.id))
  it('counts each registered, available taxi in the order once', () => {
    expect(countFree(['a', 'b', 'c', 'a', 'zz', 'e'], registered, new Set(['b']))).toBe(3)
  })
  it('a taxi not in the order is not counted', () => {
    expect(countFree(['a'], registered, new Set())).toBe(1)
  })
  it('caps at 500', () => {
    const ids = Array.from({ length: 600 }, (_, i) => `t${i}`)
    expect(countFree(ids, new Set(ids), new Set())).toBe(500)
  })
})

describe('shouldWriteFree', () => {
  const now = 10_000_000
  it('never writes without a public doc', () => {
    expect(shouldWriteFree(null, 3, now, 0)).toBe(false)
  })
  it('writes a changed count, at most once every 30 s', () => {
    expect(shouldWriteFree({ free: 2, freeAt: now - 1000 }, 3, now, 0)).toBe(true)
    expect(shouldWriteFree({ free: 2, freeAt: now - 1000 }, 3, now, now - FREE_MIN_GAP_MS + 1)).toBe(false)
  })
  it('an unchanged count is refreshed only after 5 minutes', () => {
    expect(shouldWriteFree({ free: 3, freeAt: now - 1000 }, 3, now, 0)).toBe(false)
    expect(shouldWriteFree({ free: 3, freeAt: now - FREE_REFRESH_MS }, 3, now, 0)).toBe(true)
    expect(shouldWriteFree({ free: null, freeAt: null }, 0, now, 0)).toBe(true)
  })
})

describe('freeShown', () => {
  const now = 10_000_000
  it('shows a fresh count, including zero', () => {
    expect(freeShown(4, now - 1000, now)).toBe(4)
    expect(freeShown(0, now, now)).toBe(0)
  })
  it('hides an old or missing count', () => {
    expect(freeShown(4, now - FREE_STALE_MS - 1, now)).toBeNull()
    expect(freeShown(null, now, now)).toBeNull()
    expect(freeShown(4, null, now)).toBeNull()
    expect(freeShown(-1, now, now)).toBeNull()
    expect(freeShown(2.5, now, now)).toBeNull()
  })
})
