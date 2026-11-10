import { describe, expect, it } from 'vitest'
import { byMonth, entryId, totals, tripEntries, tripKey, validCorrection } from './account'

describe('money account', () => {
  const trip = { kind: 'taxi' as const, passengerUid: 'p1', driverUid: 'd1', createdAtMs: 1_700_000_000_000, price: 35 }
  it('a finished trip records Paid for the passenger and Earned for the driver, once each', () => {
    const e = tripEntries(trip)
    expect(e.map((x) => [x.uid, x.side, x.amount])).toEqual([
      ['p1', 'paid', 35],
      ['d1', 'earned', 35],
    ])
    expect(e[0]!.id).toBe(entryId(tripKey('taxi', 'p1', trip.createdAtMs), 'paid'))
    expect(e[0]!.id).toBe('taxi-p1-1700000000000-paid')
  })
  it('records nothing without a price; no Earned when the driver is unknown or is the passenger', () => {
    expect(tripEntries({ ...trip, price: null })).toEqual([])
    expect(tripEntries({ ...trip, driverUid: null }).map((x) => x.side)).toEqual(['paid'])
    expect(tripEntries({ ...trip, driverUid: 'p1' }).map((x) => x.side)).toEqual(['paid'])
  })
  it('totals and months', () => {
    const list = [
      { side: 'earned' as const, amount: 35, at: new Date(2026, 10, 3).getTime() },
      { side: 'paid' as const, amount: 30, at: new Date(2026, 10, 4).getTime() },
      { side: 'correction' as const, amount: -5, at: new Date(2026, 9, 30).getTime() },
    ]
    expect(totals(list)).toEqual({ earned: 35, paid: 30, corrections: -5, net: 0 })
    expect(byMonth(list).map((m) => m.month)).toEqual(['2026-11', '2026-10'])
  })
  it('a correction needs a whole non-zero amount and a reason', () => {
    expect(validCorrection(-10, 'charged twice')).toBe(true)
    expect(validCorrection(0, 'nothing')).toBe(false)
    expect(validCorrection(2.5, 'half')).toBe(false)
    expect(validCorrection(10, '')).toBe(false)
  })
})
