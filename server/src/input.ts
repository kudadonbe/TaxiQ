import { isFreeText } from '../../src/validate'
import { badRequest } from './errors'

// Allow-list input helpers. Every route reads its body through these.

export type Body = Record<string, unknown>

export function body(raw: unknown): Body {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Body) : {}
}

export function text(b: Body, key: string, opts: { max?: number; required?: boolean } = {}): string {
  const v = b[key]
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
  if (opts.required && !s) throw badRequest(`${key}_required`)
  if (s && (!isFreeText(s) || s.length > (opts.max ?? 120))) throw badRequest(`${key}_invalid`)
  return s
}

export function match(b: Body, key: string, re: RegExp, required = true): string {
  const v = typeof b[key] === 'string' ? (b[key] as string).trim() : ''
  if (!v && !required) return ''
  if (!re.test(v)) throw badRequest(`${key}_invalid`)
  return v
}

export function oneOf<T extends string>(b: Body, key: string, values: readonly T[]): T {
  const v = b[key]
  if (typeof v !== 'string' || !values.includes(v as T)) throw badRequest(`${key}_invalid`)
  return v as T
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const PHONE = /^[0-9]{7}$/
export const DATE = /^\d{4}-\d{2}-\d{2}$/

export function uuid(v: unknown, code = 'id_invalid'): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw badRequest(code)
  return v
}

// Passenger details on a call or request: pickup (required for requests), destination, phone, note,
// and an optional [lat, lng] pickup point.
export function call(raw: unknown, pickupRequired: boolean) {
  const b = body(raw)
  const pickup = text(b, 'pickup', { required: pickupRequired })
  const destination = text(b, 'destination')
  const note = text(b, 'note')
  const phone = match(b, 'phone', PHONE, pickupRequired)
  const at = b.pickupAt
  const pickupAt =
    Array.isArray(at) && at.length === 2 && at.every((n) => typeof n === 'number' && Number.isFinite(n)) && Math.abs(at[0]) <= 90 && Math.abs(at[1]) <= 180
      ? ([at[0], at[1]] as [number, number])
      : undefined
  return { pickup, destination, phone, note, pickupAt }
}
