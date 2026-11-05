import { describe, expect, it } from 'vitest'
import { fare, FARES } from './fares'

describe('fares (placeholder table)', () => {
  it('charges at least the minimum', () => {
    expect(fare(0, 12)).toBe(FARES.minimum)
    expect(fare(0.3, 12)).toBe(FARES.minimum)
  })
  it('adds the per-km rate and rounds to whole MVR', () => {
    expect(fare(2, 12)).toBe(Math.round(FARES.base + 2 * FARES.perKm))
    expect(Number.isInteger(fare(1.37, 9))).toBe(true)
  })
  it('adds the night charge from 22:00 to 06:00', () => {
    expect(fare(2, 22) - fare(2, 21)).toBe(FARES.night)
    expect(fare(2, 5) - fare(2, 6)).toBe(FARES.night)
  })
})
