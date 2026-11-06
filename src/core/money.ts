// TaxiQ Game money (G3): prices, KD-Bank deals and the money calendar. Pure functions.
// PLACEHOLDER figures until real Kulhudhuffushi prices are known (plans/game-mode.md §5, §5.5, §6.1).
// Change them here only.

import { SIM_RATE } from './gameSim'

export const MONEY_IS_PLACEHOLDER = true

// The money calendar: 1 real minute = 1 money day (G-D12). Game seconds -> money day number.
export const moneyDayOf = (gameSec: number) => Math.floor(gameSec / SIM_RATE / 60)
// Game hours driven in one money day (1 real minute = 6 game minutes = 0.1 game hours).
export const GAME_HOURS_PER_MONEY_DAY = SIM_RATE / 60
export const HOURS_PER_WORKING_DAY = 10
// A driver's money day stands for a full working day: actual earnings x this.
export const DAY_SCALE = HOURS_PER_WORKING_DAY / GAME_HOURS_PER_MONEY_DAY
export const AVERAGE_DAYS = 10 // driver income is the average of the last 10 money days

export const PRICES = {
  car: 250_000, // a used taxi car
  carRentPerDay: 250, // renting the center's car
  livingPerDay: 300, // food, rent, phone
  salaryPerMonth: 14_000, // a citizen's job
  centerFeeShare: 0.1, // the center's share of fares
  fuelPerKm: 1.2, // petrol about MVR 15 a litre, 12 km a litre
  lateCharge: 50, // a fixed charge for a missed payment, given to charity
  missedLimit: 7, // missed payments in a row before the bank takes the car back
  resaleShare: 0.7, // what a taken-back car sells for
  qardMax: 5_000,
  qardDays: 30,
}
export const salaryPerDay = () => Math.round(PRICES.salaryPerMonth / 30)

export const START_CASH: Record<'citizen' | 'driver' | 'operator' | 'owner', number> = { citizen: 15_000, driver: 30_000, operator: 15_000, owner: 15_000 }

// KD-Bank's products. Profit is fixed when the deal is signed and never grows (no riba).
export type DealKind = 'murabaha' | 'ijara' | 'qard'
export const TERMS = [360, 720] as const
export type Term = (typeof TERMS)[number]
export const PROFIT: Record<'murabaha' | 'ijara', Record<Term, number>> = {
  murabaha: { 360: 0.15, 720: 0.25 },
  ijara: { 360: 0.2, 720: 0.3 },
}
export const DEPOSIT: Record<'murabaha' | 'ijara', number> = { murabaha: 0.1, ijara: 0 }

export interface Deal {
  id: string
  kind: DealKind
  total: number // what the player owes in all, fixed at signing
  paid: number
  daily: number // the instalment each money day
  startDay: number
  days: number
  missed: number // missed payments in a row
}

export interface Offer {
  kind: DealKind
  days: number
  deposit: number // paid now
  financed: number // what the bank pays now (for a car: the car price minus the deposit)
  profit: number // the bank's fixed profit
  total: number // to repay
  daily: number
}

// What a deal costs, before signing: shown to the player in full (no gharar).
export function offer(kind: DealKind, days: number, amount = PRICES.car): Offer {
  if (kind === 'qard') {
    const a = Math.min(PRICES.qardMax, Math.max(0, Math.round(amount)))
    return { kind, days: PRICES.qardDays, deposit: 0, financed: a, profit: 0, total: a, daily: Math.ceil(a / PRICES.qardDays) }
  }
  const term = (TERMS as readonly number[]).includes(days) ? (days as Term) : 360
  const deposit = Math.round(amount * DEPOSIT[kind])
  const financed = amount - deposit
  const profit = Math.round(financed * PROFIT[kind][term])
  const total = financed + profit
  return { kind, days: term, deposit, financed, profit, total, daily: Math.ceil(total / term) }
}

// The next instalment due (the last one may be smaller).
export const dueToday = (d: Deal) => Math.min(d.daily, d.total - d.paid)

// A driver's money day: the average of their last AVERAGE_DAYS money days of driving, scaled to a
// full working day. Days with no trip in the window are days off (no income, no fuel).
export interface DayDriving {
  fares: number // gross fares in the window, actual
  km: number // km driven in the window (to pickups and with passengers), actual
  daysWithTrips: number
}
export function drivingDay(w: DayDriving) {
  if (!w.daysWithTrips) return { gross: 0, fee: 0, fuel: 0 }
  const per = (x: number) => (x / AVERAGE_DAYS) * DAY_SCALE
  const gross = Math.round(per(w.fares))
  return { gross, fee: Math.round(gross * PRICES.centerFeeShare), fuel: Math.round(per(w.km) * PRICES.fuelPerKm) }
}

// Gold Dinar and silver Dirham. PLACEHOLDER prices until a price source is chosen.
export const METAL_PRICE_MVR_PER_G = { gold: 1_300, silver: 15 } // pure metal
export const DINAR_MVR = Math.round(4.25 * 0.9167 * METAL_PRICE_MVR_PER_G.gold) // 4.25 g of 22k gold
export const DIRHAM_MVR = Math.round(2.975 * METAL_PRICE_MVR_PER_G.silver) // 2.975 g of pure silver
