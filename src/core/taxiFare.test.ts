import { describe, expect, it } from 'vitest'
import { finishDue, taxiFare, validFares } from './taxiFare'

describe('the taxi fare', () => {
  const f = { base: 20, perKm: 5, minimum: 25 }
  it('a trip price plus per km of road, in whole MVR', () => {
    expect(taxiFare(f, 3_000)).toBe(35)
    expect(taxiFare(f, 2_300)).toBe(32) // 31.5 rounds up
  })
  it('never less than the minimum', () => {
    expect(taxiFare(f, 200)).toBe(25)
  })
  it('only sensible numbers', () => {
    expect(validFares(f)).toBe(true)
    expect(validFares({ ...f, perKm: -1 })).toBe(false)
    expect(validFares({ ...f, base: Number.NaN })).toBe(false)
  })
  it('the passenger has 10 minutes to confirm the trip finished', () => {
    expect(finishDue(1000, 1000 + 9 * 60_000)).toBe(false)
    expect(finishDue(1000, 1000 + 11 * 60_000)).toBe(true)
  })
})
