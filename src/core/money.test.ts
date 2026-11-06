import { describe, expect, it } from 'vitest'
import { DAY_SCALE, drivingDay, dueToday, moneyDayOf, offer, PRICES, salaryPerDay } from './money'

describe('money calendar', () => {
  it('1 real minute = 1 money day', () => {
    // 6 game seconds per real second: one real minute is 360 game seconds.
    expect(moneyDayOf(0)).toBe(0)
    expect(moneyDayOf(359)).toBe(0)
    expect(moneyDayOf(360)).toBe(1)
  })
  it('a money day stands for a 10-hour working day', () => {
    expect(DAY_SCALE).toBe(100)
  })
})

describe('KD-Bank offers (fixed, no interest)', () => {
  it('Murabaha: 10% deposit, fixed profit, equal daily payments', () => {
    const o = offer('murabaha', 720)
    expect(o.deposit).toBe(25_000)
    expect(o.financed).toBe(225_000)
    expect(o.profit).toBe(56_250)
    expect(o.total).toBe(281_250)
    expect(o.daily * 720).toBeGreaterThanOrEqual(o.total)
  })
  it('Ijara: no deposit', () => {
    expect(offer('ijara', 360)).toMatchObject({ deposit: 0, financed: PRICES.car })
  })
  it('Qard Hasan: repaid at the same amount, capped', () => {
    expect(offer('qard', 0, 3_000)).toMatchObject({ profit: 0, total: 3_000, days: 30 })
    expect(offer('qard', 0, 99_000).total).toBe(PRICES.qardMax)
  })
  it('the last payment is only what is left', () => {
    expect(dueToday({ id: 'x', kind: 'qard', total: 100, paid: 95, daily: 10, startDay: 0, days: 10, missed: 0 })).toBe(5)
  })
  it('a job pays about MVR 467 a day', () => {
    expect(salaryPerDay()).toBe(467)
  })
})

describe('a driver money day', () => {
  it('averages the last 10 money days and scales to a working day', () => {
    // MVR 300 of fares and 20 km over 10 money days -> MVR 30 and 2 km a day, x100.
    expect(drivingDay({ fares: 300, km: 20, daysWithTrips: 6 })).toEqual({ gross: 3000, fee: 300, fuel: 240 })
  })
  it('no trips: a day off', () => {
    expect(drivingDay({ fares: 0, km: 0, daysWithTrips: 0 })).toEqual({ gross: 0, fee: 0, fuel: 0 })
  })
})
