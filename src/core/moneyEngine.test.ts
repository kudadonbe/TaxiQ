import { describe, expect, it } from 'vitest'
import { newTrip, type TripDoc } from './gameEngine'
import { offer, PRICES, salaryPerDay, START_CASH } from './money'
import { CHARITY, moneyStep, type Application, type MoneyInput, type MoneyOutput, type Wallet } from './moneyEngine'

const CAPITAL = 6_000_000
const app = (o: Partial<Application>): Application => ({ id: 'a1', uid: 'u', kind: 'job', days: 360, amount: 0, status: 'new', reason: '', ...o })
const base = (o: Partial<MoneyInput> = {}): MoneyInput => ({ day: 0, capital: CAPITAL, players: [{ uid: 'u', role: 'citizen' }], wallets: new Map(), state: null, apps: [], trips: [], ...o })

// Run steps forward, carrying the state like the app does.
function run(steps: Partial<MoneyInput>[], start: Partial<MoneyInput> = {}) {
  let wallets = new Map<string, Wallet>()
  let state: MoneyOutput['state'] | null = null
  const all: MoneyOutput[] = []
  for (const st of steps) {
    const out = moneyStep(base({ ...start, ...st, wallets, state }))
    wallets = new Map([...wallets, ...out.wallets])
    state = out.state
    all.push(out)
  }
  return { wallets, state: state!, all }
}
// Money is never created or lost: everything inside the game + what left = everything that came in.
const balanced = (r: ReturnType<typeof run>) => {
  const inside = r.state.bank + r.state.island + r.state.charity + [...r.wallets.values()].reduce((s, w) => s + w.cash, 0)
  return inside + r.state.outsideOut - r.state.outsideIn
}

describe('money engine', () => {
  it('opens KD-Bank with its capital and gives a new player their savings', () => {
    const r = run([{}])
    expect(r.state.bank).toBe(CAPITAL)
    expect(r.wallets.get('u')!.cash).toBe(START_CASH.citizen)
    expect(balanced(r)).toBe(0)
  })
  it('a citizen gets a job and is paid every money day; living costs are charged', () => {
    const r = run([{ apps: [app({ kind: 'job' })] }, { day: 3 }])
    expect(r.wallets.get('u')!.cash).toBe(START_CASH.citizen + 3 * (salaryPerDay() - PRICES.livingPerDay))
    expect(r.all[0]!.apps).toEqual([{ id: 'a1', status: 'approved', reason: '' }])
    expect(balanced(r)).toBe(0)
  })
  it('drivers do not take a salary job', () => {
    const r = run([{ players: [{ uid: 'u', role: 'driver' }], apps: [app({ kind: 'job' })] }])
    expect(r.all[0]!.apps[0]).toMatchObject({ status: 'declined', reason: 'drivers_earn_fares' })
  })
  it('Murabaha: the deposit is paid, the car is theirs, and instalments start the next day', () => {
    const o = offer('murabaha', 720)
    const r = run([{ players: [{ uid: 'u', role: 'driver' }], apps: [app({ kind: 'murabaha', days: 720 })] }, { players: [{ uid: 'u', role: 'driver' }], day: 1 }])
    const w = r.wallets.get('u')!
    expect(w.car).toBe('own')
    expect(w.deals[0]).toMatchObject({ kind: 'murabaha', total: o.total, paid: o.daily })
    expect(w.cash).toBe(START_CASH.driver - o.deposit - o.daily - PRICES.livingPerDay)
    expect(r.state.bank).toBe(CAPITAL - PRICES.car + o.deposit + o.daily)
    expect(balanced(r)).toBe(0)
  })
  it('a deposit they cannot afford is declined', () => {
    const r = run([{ apps: [app({ kind: 'murabaha', days: 360 })] }], { players: [{ uid: 'u', role: 'citizen' }] })
    // A citizen starts with 15,000; the deposit is 25,000.
    expect(r.all[0]!.apps[0]).toMatchObject({ status: 'declined', reason: 'deposit' })
  })
  it('missed payments: a fixed charge to charity, never growing; after 7 the car is taken back', () => {
    const players = [{ uid: 'u', role: 'driver' as const }]
    const r = run([{ players, apps: [app({ kind: 'ijara', days: 360 })] }, ...Array.from({ length: 8 }, () => ({ players, day: 200 }))])
    const w = r.wallets.get('u')!
    expect(w.car).toBe('rent') // taken back
    expect(r.state.charity).toBeGreaterThan(0)
    expect(r.state.charity % PRICES.lateCharge).toBe(0)
    expect(w.deals[0]!.paid).toBe(w.deals[0]!.total) // closed
    expect(balanced(r)).toBe(0)
  })
  it('a driver is paid from their recent trips, scaled to a working day; days off pay nothing', () => {
    const trip = (doneT: number): TripDoc => ({ id: `t${doneT}`, ...newTrip({ riderUid: 'bot', riderName: '', bot: true, from: { lat: 0, lng: 0, name: '' }, to: { lat: 0, lng: 0, name: '' }, t: 0 }), status: 'done', doneT, fare: 30, dTotal: 2000, driverUid: 'u' })
    const players = [{ uid: 'u', role: 'driver' as const }]
    // Two trips on money day 1 (game seconds 360-719).
    const r = run([{ players }, { players, day: 1, trips: [trip(400), trip(500)] }])
    const lines = r.wallets.get('u')!.lastDay!.lines
    expect(lines.find((l) => l.k === 'fares')!.amount).toBe(600) // 60 fares / 10 days x 100
    expect(lines.find((l) => l.k === 'car_rent')!.amount).toBe(-PRICES.carRentPerDay)
    const off = run([{ players }, { players, day: 1 }])
    expect(off.wallets.get('u')!.lastDay!.lines.map((l) => l.k)).toEqual(['living'])
    expect(balanced(r)).toBe(0)
  })
  it('settles a long time away in pieces, so one save stays small', () => {
    const r = run([{}, { day: 500, maxEntries: 50 }])
    expect(r.wallets.get('u')!.day).toBeLessThan(500)
    expect(r.all[1]!.entries.length).toBeLessThanOrEqual(80)
  })
  it('the charity pool is an account like any other', () => {
    expect(CHARITY).toBe('charity')
  })
})
