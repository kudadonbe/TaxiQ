import { describe, expect, it } from 'vitest'
import { guessMoving, isLive, SHARE_MAX_MS, speedBetween, STALE_MS } from './presence'

describe('how someone is moving, from GPS speed', () => {
  it('walking, running, cycling, e-bike, motorbike', () => {
    expect(guessMoving([1.2, 1.4, 1.3])).toBe('walk')
    expect(guessMoving([2.8, 3.0, 2.9])).toBe('run')
    expect(guessMoving([5, 5.5, 4.8])).toBe('bike')
    expect(guessMoving([7.5, 8, 7.8])).toBe('ebike')
    expect(guessMoving([12, 13, 11])).toBe('motorbike')
  })
  it('fast during a taxi ride is the taxi', () => {
    expect(guessMoving([12, 13, 11], true)).toBe('taxi')
  })
  it('one GPS jump does not flip it (median)', () => {
    expect(guessMoving([1.2, 30, 1.3, 1.1, 1.4])).toBe('walk')
  })
  it('no readings: walking', () => {
    expect(guessMoving([])).toBe('walk')
    expect(guessMoving([NaN, -1])).toBe('walk')
  })
  it('speed between two fixes', () => {
    // ~111 m north in 10 s = ~11 m/s
    expect(speedBetween({ lat: 4.17, lng: 73.5, t: 0 }, { lat: 4.171, lng: 73.5, t: 10_000 })).toBeCloseTo(11.1, 0)
  })
})

describe('when a shared position shows', () => {
  it('only while fresh and within its hour', () => {
    const now = 1_000_000
    expect(isLive({ updatedAt: now - 1000, expiresAt: now + SHARE_MAX_MS }, now)).toBe(true)
    expect(isLive({ updatedAt: now - STALE_MS - 1, expiresAt: now + 1000 }, now)).toBe(false) // app closed
    expect(isLive({ updatedAt: now, expiresAt: now - 1 }, now)).toBe(false) // hour is up
  })
})
