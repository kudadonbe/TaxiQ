// Each person's money account (TaxiQ v2: all trips are paid in cash). When a trip finishes, two
// entries are recorded at the trip's fixed total: Earned for the driver or owner, Paid for the
// passenger. Entries are never edited or deleted; an operator fixes a mistake with a correction
// entry (signed amount, with a reason). Ready for a payment gateway later (method). Pure functions.

export type TripKind = 'taxi' | 'private'
export type EntrySide = 'earned' | 'paid' | 'correction'
export type PayMethod = 'cash'

export interface AccountEntry {
  id: string
  uid: string // whose account
  side: EntrySide
  amount: number // whole MVR; positive for earned and paid; a correction is signed (+ adds, - takes away)
  method: PayMethod
  kind: TripKind | null // null for a correction not tied to a trip
  tripKey: string // `${kind}-${passengerUid}-${createdAtMs}`, or '' for a correction
  note: string // a correction's reason
  by: string // who wrote it (email)
  at: number // ms
}

// The key of a trip: the passenger's one booking doc and when it was created (a new booking replaces
// the doc, so the time makes each trip unique).
export const tripKey = (kind: TripKind, passengerUid: string, createdAtMs: number) => `${kind}-${passengerUid}-${createdAtMs}`
// One entry per trip and side: its document id, so a trip can never be recorded twice.
export const entryId = (key: string, side: 'earned' | 'paid') => `${key}-${side}`

export interface FinishedTrip {
  kind: TripKind
  passengerUid: string
  driverUid: string | null // the driver's or owner's account (taxi: the driver who offered or accepted)
  createdAtMs: number
  price: number | null // the fixed total
}

// The two entries a finished trip records (none without a price; Earned only when the driver's
// account is known).
export function tripEntries(t: FinishedTrip): { id: string; uid: string; side: 'earned' | 'paid'; amount: number; kind: TripKind; tripKey: string }[] {
  if (t.price === null || !Number.isFinite(t.price) || t.price <= 0 || !t.createdAtMs) return []
  const key = tripKey(t.kind, t.passengerUid, t.createdAtMs)
  const amount = Math.round(t.price)
  const out: { id: string; uid: string; side: 'earned' | 'paid'; amount: number; kind: TripKind; tripKey: string }[] = [
    { id: entryId(key, 'paid'), uid: t.passengerUid, side: 'paid', amount, kind: t.kind, tripKey: key },
  ]
  if (t.driverUid && t.driverUid !== t.passengerUid) out.push({ id: entryId(key, 'earned'), uid: t.driverUid, side: 'earned', amount, kind: t.kind, tripKey: key })
  return out
}

export interface Totals {
  earned: number
  paid: number
  corrections: number
  net: number // earned - paid + corrections
}
export function totals(entries: Pick<AccountEntry, 'side' | 'amount'>[]): Totals {
  let earned = 0
  let paid = 0
  let corrections = 0
  for (const e of entries) {
    if (e.side === 'earned') earned += e.amount
    else if (e.side === 'paid') paid += e.amount
    else corrections += e.amount
  }
  return { earned, paid, corrections, net: earned - paid + corrections }
}

// Totals for each month (YYYY-MM, local time), newest first.
export function byMonth(entries: Pick<AccountEntry, 'side' | 'amount' | 'at'>[]): { month: string; totals: Totals }[] {
  const groups = new Map<string, Pick<AccountEntry, 'side' | 'amount'>[]>()
  for (const e of entries) {
    const d = new Date(e.at)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const g = groups.get(m)
    if (g) g.push(e)
    else groups.set(m, [e])
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, list]) => ({ month, totals: totals(list) }))
}

// A correction: a whole, non-zero amount up to MVR 100,000 either way, and a reason.
export const validCorrection = (amount: number, note: string) =>
  Number.isInteger(amount) && amount !== 0 && Math.abs(amount) <= 100_000 && note.trim().length >= 3 && note.trim().length <= 120
