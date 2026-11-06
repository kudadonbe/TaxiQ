// TaxiQ Game money engine (G3): settles every player's money days and handles KD-Bank applications.
// Pure: reads the room's money and returns the new state plus the ledger entries to append.
// Money only moves between accounts; nothing is created (plans/game-mode.md §5.3–§5.5, §6.1).

import type { TripDoc } from './gameEngine'
import { AVERAGE_DAYS, drivingDay, dueToday, moneyDayOf, offer, PRICES, salaryPerDay, START_CASH, type Deal, type DealKind } from './money'

// Accounts besides players (by uid): KD-Bank, the island (shops, riders, centers), outside the island
// (salaries from away, fuel and car imports, savings people arrive with) and the charity pool.
export type Account = string
export const BANK = 'bank'
export const ISLAND = 'island'
export const OUTSIDE = 'outside'
export const CHARITY = 'charity'

export type Car = 'none' | 'rent' | 'own' | 'bank' // no car, the center's car, own car, KD-Bank's car (Ijara)
export type Role = 'citizen' | 'driver' | 'operator' | 'owner'

export interface Line {
  k: string // what for (see LINE_KEYS in the UI)
  amount: number // + in, - out
}
export interface Wallet {
  cash: number
  job: boolean
  car: Car
  deals: Deal[]
  day: number // last money day settled
  lastDay: { day: number; lines: Line[] } | null
}
export interface MoneyState {
  bank: number
  island: number
  charity: number
  outsideIn: number // all money that ever came in from outside
  outsideOut: number // all money that ever went out
}
export type AppKind = 'job' | 'quit' | 'murabaha' | 'ijara' | 'qard'
export interface Application {
  id: string
  uid: string
  kind: AppKind
  days: number
  amount: number
  status: 'new' | 'approved' | 'declined'
  reason: string
}
export interface Entry {
  day: number
  from: Account
  to: Account
  amount: number
  reason: string
}

export interface MoneyInput {
  day: number // money day now
  capital: number // KD-Bank's capital for this world (PRESETS)
  players: { uid: string; role: Role }[]
  wallets: ReadonlyMap<string, Wallet>
  state: MoneyState | null
  apps: Application[]
  trips: TripDoc[]
  maxEntries?: number // keep one save small; the rest is settled on the next step
}
export interface MoneyOutput {
  state: MoneyState
  wallets: Map<string, Wallet> // only the ones that changed
  entries: Entry[]
  apps: { id: string; status: 'approved' | 'declined'; reason: string }[]
}

const ISLAND_START = 2_000_000 // the rest of the island's money (placeholder)
const MAX_DAYS_PER_STEP = 30

export function moneyStep(input: MoneyInput): MoneyOutput {
  const limit = input.maxEntries ?? 400
  const entries: Entry[] = []
  const changed = new Map<string, Wallet>()
  const wallets = new Map(input.wallets)
  const state: MoneyState = input.state ? { ...input.state } : { bank: 0, island: ISLAND_START, charity: 0, outsideIn: ISLAND_START, outsideOut: 0 }
  const wallet = (uid: string) => {
    const w = changed.get(uid) ?? structuredClone(wallets.get(uid)!)
    changed.set(uid, w)
    return w
  }
  const move = (day: number, from: Account, to: Account, amount: number, reason: string) => {
    if (amount <= 0) return
    entries.push({ day, from, to, amount, reason })
    for (const [acc, sign] of [[from, -1], [to, 1]] as const) {
      if (acc === BANK) state.bank += sign * amount
      else if (acc === ISLAND) state.island += sign * amount
      else if (acc === CHARITY) state.charity += sign * amount
      else if (acc === OUTSIDE) {
        if (sign < 0) state.outsideIn += amount
        else state.outsideOut += amount
      } else wallet(acc).cash += sign * amount
    }
  }

  // The bank's capital, once.
  if (!input.state) move(input.day, OUTSIDE, BANK, input.capital, 'capital')

  // New players arrive with their savings.
  for (const p of input.players) {
    if (wallets.has(p.uid)) continue
    const w: Wallet = { cash: 0, job: false, car: p.role === 'driver' ? 'rent' : 'none', deals: [], day: input.day, lastDay: null }
    wallets.set(p.uid, w)
    changed.set(p.uid, w)
    move(input.day, OUTSIDE, p.uid, START_CASH[p.role], 'start')
  }
  const roleOf = new Map(input.players.map((p) => [p.uid, p.role]))

  // KD-Bank and job applications, oldest first.
  const decided: MoneyOutput['apps'] = []
  for (const a of input.apps) {
    if (a.status !== 'new' || !wallets.has(a.uid)) continue
    const no = (reason: string) => decided.push({ id: a.id, status: 'declined', reason })
    const w = changed.get(a.uid) ?? wallets.get(a.uid)!
    const role = roleOf.get(a.uid) ?? 'citizen'
    if (a.kind === 'job') {
      if (role === 'driver') no('drivers_earn_fares')
      else if (w.job) no('already')
      else {
        wallet(a.uid).job = true
        decided.push({ id: a.id, status: 'approved', reason: '' })
      }
      continue
    }
    if (a.kind === 'quit') {
      if (!w.job) no('no_job')
      else {
        wallet(a.uid).job = false
        decided.push({ id: a.id, status: 'approved', reason: '' })
      }
      continue
    }
    const active = (k: DealKind) => w.deals.some((d) => d.paid < d.total && (k === 'qard' ? d.kind === 'qard' : d.kind !== 'qard'))
    if (active(a.kind)) {
      no('has_deal')
      continue
    }
    if (a.kind !== 'qard' && (w.car === 'own' || w.car === 'bank')) {
      no('has_car')
      continue
    }
    const o = offer(a.kind, a.days, a.kind === 'qard' ? a.amount : PRICES.car)
    if (o.deposit > w.cash) {
      no('deposit')
      continue
    }
    if (o.financed > state.bank || o.financed <= 0) {
      no('bank_capital')
      continue
    }
    const dealId = `${a.kind}-${a.id}`
    if (a.kind === 'qard') move(input.day, BANK, a.uid, o.financed, 'qard')
    else {
      // The bank buys the car (outside the island), the player pays the deposit to the bank.
      move(input.day, BANK, OUTSIDE, PRICES.car, `car_bought:${dealId}`)
      move(input.day, a.uid, BANK, o.deposit, `deposit:${dealId}`)
      wallet(a.uid).car = a.kind === 'murabaha' ? 'own' : 'bank'
    }
    wallet(a.uid).deals.push({ id: dealId, kind: a.kind, total: o.total, paid: 0, daily: o.daily, startDay: input.day, days: o.days, missed: 0 })
    decided.push({ id: a.id, status: 'approved', reason: '' })
  }

  // Each driver's work, per money day, from finished trips they drove.
  const driven = new Map<string, Map<number, { fares: number; km: number }>>()
  for (const tr of input.trips) {
    if (tr.status !== 'done' || !tr.driverUid || tr.doneT === null) continue
    const day = moneyDayOf(tr.doneT)
    const byDay = driven.get(tr.driverUid) ?? new Map()
    driven.set(tr.driverUid, byDay)
    const x = byDay.get(day) ?? { fares: 0, km: 0 }
    x.fares += tr.fare ?? 0
    x.km += (tr.dTotal ?? 0) / 1000
    byDay.set(day, x)
  }
  const windowFor = (uid: string, day: number) => {
    const byDay = driven.get(uid)
    let fares = 0
    let km = 0
    let daysWithTrips = 0
    for (let d = day - AVERAGE_DAYS + 1; d <= day; d++) {
      const x = byDay?.get(d)
      if (!x) continue
      fares += x.fares
      km += x.km
      daysWithTrips++
    }
    return { fares, km, daysWithTrips }
  }

  // Settle money days, oldest first, while the save stays small.
  for (const [uid] of wallets) {
    const role = roleOf.get(uid)
    if (!role) continue // left the world: their money waits for them
    let w = changed.get(uid) ?? wallets.get(uid)!
    let n = 0
    while (w.day < input.day && n++ < MAX_DAYS_PER_STEP && entries.length < limit) {
      w = wallet(uid)
      const day = w.day + 1
      const lines: Line[] = []
      const pay = (from: Account, to: Account, amount: number, k: string) => {
        if (amount <= 0) return
        move(day, from, to, amount, k)
        lines.push({ k, amount: to === uid ? amount : -amount })
      }
      pay(uid, ISLAND, PRICES.livingPerDay, 'living')
      if (w.job) pay(OUTSIDE, uid, salaryPerDay(), 'salary')
      if (role === 'driver') {
        const win = windowFor(uid, day)
        const d = drivingDay(win)
        pay(ISLAND, uid, d.gross, 'fares')
        pay(uid, ISLAND, d.fee, 'center_fee')
        pay(uid, OUTSIDE, d.fuel, 'fuel')
        if (win.daysWithTrips && w.car === 'rent') pay(uid, ISLAND, PRICES.carRentPerDay, 'car_rent')
      }
      for (const deal of w.deals) {
        if (deal.paid >= deal.total) continue
        const due = dueToday(deal)
        if (w.cash >= due) {
          pay(uid, BANK, due, `instalment:${deal.kind}`)
          deal.paid += due
          deal.missed = 0
          if (deal.paid >= deal.total && deal.kind === 'ijara') w.car = 'own' // lease to own: the car is theirs now
        } else {
          deal.missed++
          if (w.cash >= PRICES.lateCharge) pay(uid, CHARITY, PRICES.lateCharge, 'late_charge')
          lines.push({ k: `missed:${deal.kind}`, amount: 0 })
          if (deal.kind !== 'qard' && deal.missed >= PRICES.missedLimit) {
            // The bank takes the car back and sells it; what is owed is covered first.
            const resale = Math.round(PRICES.car * PRICES.resaleShare)
            const owed = deal.total - deal.paid
            move(day, OUTSIDE, BANK, resale, `car_sold:${deal.id}`)
            if (resale > owed) pay(BANK, uid, resale - owed, 'car_sale_rest')
            deal.paid = deal.total
            w.car = 'rent'
            lines.push({ k: 'car_taken_back', amount: 0 })
          }
        }
      }
      w.day = day
      w.lastDay = { day, lines }
    }
  }

  return { state, wallets: changed, entries, apps: decided }
}
