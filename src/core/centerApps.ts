// Taxi center registry: the OWNER of a taxi center applies (name, place, phone, hours, the
// Transport Authority licence number and a logo); a platform admin approves, and the owner becomes
// that center's admin. Approved centers show on the map with their logo. Pure checks, shared with
// firestore.rules (keep the patterns in step).
import type { WeekHours } from './services'

export type CenterAppStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface CenterDetails {
  name: string // English (or Latin) name
  nameDv: string // Dhivehi name (optional)
  at: [number, number] | null // where the center is
  phone: string // 7 digits, shown on the map
  hours: WeekHours // at least one open day
  licence: string // Transport Authority taxi-center licence number (platform admins and the owner only)
  logo: string // '' or a data:image/(png|webp);base64,... URL, at most LOGO_MAX characters
}

export const CTR_LIMITS = { name: 60, licence: 30 } as const
// About 40 KB of image as base64 (4 characters per 3 bytes) plus the prefix.
export const LOGO_MAX = 56_000
export const LOGO_SIZE = 128
// Letters (capitals), digits, slash and dash; 3 to 30 characters, starting with a letter or digit.
export const LICENCE = /^[A-Z0-9][A-Z0-9/-]{2,29}$/
export const LOGO = /^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

const thaana = /[ހ-޿]/
const freeText = /^[\p{L}\p{M}\p{N} .,'/#()&+:;\-،]*$/u // same idea as src/validate.ts isFreeText
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export const normLicence = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '')
export const isLogo = (s: string) => s === '' || (s.length <= LOGO_MAX && LOGO.test(s))

export type CenterField = keyof CenterDetails
export function centerErrors(d: CenterDetails): Partial<Record<CenterField, 'required' | 'format'>> {
  const e: Partial<Record<CenterField, 'required' | 'format'>> = {}
  const name = d.name.trim()
  if (!name) e.name = 'required'
  else if (name.length < 2 || name.length > CTR_LIMITS.name || !freeText.test(name)) e.name = 'format'
  if (d.nameDv && (d.nameDv.length > CTR_LIMITS.name || !thaana.test(d.nameDv) || !freeText.test(d.nameDv))) e.nameDv = 'format'
  if (!d.at) e.at = 'required'
  else if (!(d.at.length === 2 && d.at.every(Number.isFinite) && Math.abs(d.at[0]) <= 90 && Math.abs(d.at[1]) <= 180)) e.at = 'format'
  if (!/^\d{7}$/.test(d.phone)) e.phone = d.phone ? 'format' : 'required'
  if (d.hours.length !== 7 || d.hours.some((h) => h !== null && (!HHMM.test(h.open) || !HHMM.test(h.close) || h.open === h.close))) e.hours = 'format'
  else if (d.hours.every((h) => h === null)) e.hours = 'required'
  if (!d.licence) e.licence = 'required'
  else if (!LICENCE.test(d.licence)) e.licence = 'format'
  if (!isLogo(d.logo)) e.logo = 'format'
  return e
}

// After approval: hours and phone change straight away; a new name or place goes back to Pending.
// (A new logo waits as `pendingLogo` while the center stays approved.)
export function centerNeedsRecheck(was: Pick<CenterDetails, 'name' | 'nameDv' | 'at'>, d: Pick<CenterDetails, 'name' | 'nameDv' | 'at'>) {
  return d.name.trim() !== was.name || d.nameDv.trim() !== was.nameDv || JSON.stringify(d.at) !== JSON.stringify(was.at)
}

// Suspending a center: what is left of its admin's roles entry (`r`, which is admin of that
// center). A private driver keeps private hire (role 'private'), a corpus editor keeps the corpus
// (as a role-less entry when that is all); null means the entry is deleted. `by` is the platform
// admin's email (addedAt is set by the caller).
export function suspendedRole(r: Record<string, unknown>, by: string): { role?: 'private'; corpus?: true; addedBy: string } | null {
  const corpus = r.corpus === true
  const addedBy = by.toLowerCase()
  if (r.private === true) return { role: 'private', ...(corpus ? { corpus: true as const } : {}), addedBy }
  return corpus ? { corpus: true, addedBy } : null
}
