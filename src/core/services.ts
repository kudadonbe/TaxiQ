// Services on the map: mechanics, tyre and puncture repair, batteries, towing and others that help
// drivers and vehicle owners (plans/vehicles-traffic-services.md §6). A person applies; an operator
// approves; approved FIXED places (a workshop) show as a pin with "open now" from their hours;
// MOBILE helpers (a mechanic who comes to you, a tow truck) show only while they switch Available on,
// so a home-based helper's home is never shown. Pure functions.

export const SERVICE_KINDS = ['mechanic', 'tyre', 'battery', 'towing', 'carwash', 'ac', 'parts', 'fuel', 'ebike'] as const
export type ServiceKind = (typeof SERVICE_KINDS)[number]
export type ServiceMode = 'fixed' | 'mobile'
export type ServiceStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

// Opening hours for each day of the week (0 = Sunday ... 6 = Saturday): 'HH:MM' open and close, or
// null when closed. A close earlier than the open runs past midnight (e.g. 18:00 to 02:00).
export type DayHours = { open: string; close: string } | null
export type WeekHours = DayHours[] // always 7

export interface ServiceDetails {
  name: string // English (or Latin) name, e.g. "Ali's Garage"
  nameDv: string // Dhivehi name
  kinds: ServiceKind[] // at least one
  mode: ServiceMode
  at: [number, number] | null // fixed: where the place is; mobile: null (shown live while Available)
  hours: WeekHours // fixed places; mobile helpers may leave every day null (shown only when Available)
  phone: string // 7 digits; shown to signed-in drivers so they can call
  priceNote: string // e.g. "Puncture from MVR 50"
  note: string
}

export const LIMITS = { name: 60, priceNote: 120, note: 200 } as const
export const EMPTY_HOURS: WeekHours = [null, null, null, null, null, null, null]
export const allWeek = (open: string, close: string): WeekHours => Array.from({ length: 7 }, () => ({ open, close }))

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const thaana = /[ހ-޿]/
const freeText = /^[\p{L}\p{M}\p{N} .,'/#()&+:;\-،]*$/u // same idea as src/validate.ts isFreeText

export type ServiceField = keyof ServiceDetails
export function serviceErrors(d: ServiceDetails): Partial<Record<ServiceField, 'required' | 'format'>> {
  const e: Partial<Record<ServiceField, 'required' | 'format'>> = {}
  if (!d.name.trim()) e.name = 'required'
  else if (d.name.length > LIMITS.name || !freeText.test(d.name)) e.name = 'format'
  if (d.nameDv && (d.nameDv.length > LIMITS.name || !thaana.test(d.nameDv) || !freeText.test(d.nameDv))) e.nameDv = 'format'
  if (!d.kinds.length) e.kinds = 'required'
  else if (d.kinds.some((k) => !SERVICE_KINDS.includes(k)) || new Set(d.kinds).size !== d.kinds.length) e.kinds = 'format'
  if (d.mode !== 'fixed' && d.mode !== 'mobile') e.mode = 'format'
  if (d.mode === 'fixed' && !d.at) e.at = 'required'
  if (d.at && !(d.at.length === 2 && d.at.every(Number.isFinite) && Math.abs(d.at[0]) <= 90 && Math.abs(d.at[1]) <= 180)) e.at = 'format'
  if (d.hours.length !== 7 || d.hours.some((h) => h !== null && (!HHMM.test(h.open) || !HHMM.test(h.close) || h.open === h.close))) e.hours = 'format'
  if (d.mode === 'fixed' && d.hours.length === 7 && d.hours.every((h) => h === null)) e.hours = 'required'
  if (!/^\d{7}$/.test(d.phone)) e.phone = d.phone ? 'format' : 'required'
  if (d.priceNote.length > LIMITS.priceNote || !freeText.test(d.priceNote)) e.priceNote = 'format'
  if (d.note.length > LIMITS.note || !freeText.test(d.note)) e.note = 'format'
  return e
}

// Is a fixed place open at this moment (the device's local time; the Maldives has one time zone)?
export function isOpenNow(hours: WeekHours, now: Date): boolean {
  if (hours.length !== 7) return false
  const day = now.getDay()
  const t = now.getHours() * 60 + now.getMinutes()
  const today = hours[day]
  if (today) {
    const o = minutes(today.open)
    const c = minutes(today.close)
    if (c > o ? t >= o && t < c : t >= o) return true // past midnight: open from `open` to 24:00 today
  }
  const y = hours[(day + 6) % 7] // yesterday's hours running past midnight into today
  if (y) {
    const o = minutes(y.open)
    const c = minutes(y.close)
    if (c < o && t < c) return true
  }
  return false
}

// A short "today" line for a fixed place: its hours today, or null when closed all day.
export const todayHours = (hours: WeekHours, now: Date): DayHours => (hours.length === 7 ? hours[now.getDay()] ?? null : null)

const rad = (d: number) => (d * Math.PI) / 180
export function metresBetween(a: readonly [number, number], b: readonly [number, number]) {
  const k = Math.cos(rad((a[0] + b[0]) / 2))
  return Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * k)
}

// "Help near me": open (or Available) helpers, optionally of one kind, nearest first (straight line;
// the map can refine the top few by road distance).
export interface NearbyService {
  id: string
  kinds: ServiceKind[]
  at: [number, number]
  openNow: boolean
}
export function nearestHelp<T extends NearbyService>(list: T[], from: [number, number], kind: ServiceKind | null = null, max = 5): (T & { metres: number })[] {
  return list
    .filter((s) => s.openNow && (!kind || s.kinds.includes(kind)))
    .map((s) => ({ ...s, metres: metresBetween(from, s.at) }))
    .sort((a, b) => a.metres - b.metres)
    .slice(0, max)
}
