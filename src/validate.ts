import type { CallInfo, SuspendReason, Suspension, Taxi } from './types'

// Allow-list validation for taxi records. Used by the admin form and when reading localStorage,
// so anything that reaches the UI has passed the same rules.

export interface TaxiInput {
  taxiNo: string
  taxiReg: string
  name: string
  nameDv: string
  phone: string
  seats: string // passenger seats, 1-15
}

export type Field = keyof TaxiInput
export type FieldError = 'required' | 'format' | 'taken'

const rules: Record<Field, RegExp> = {
  taxiNo: /^[1-9]\d{0,3}$/, // center number: 1–9999, no leading zeros
  taxiReg: /^[A-Z]\d{1,6}$/, // e.g. T5110
  name: /^[A-Za-z][A-Za-z .'-]{0,59}$/,
  nameDv: /^[ހ-޿][ހ-޿ ]{0,59}$/, // Thaana block only
  phone: /^[0-9X]{7}$/, // Maldives 7-digit number (X allowed for masked demo data)
  seats: /^([1-9]|1[0-5])$/, // passenger seats, 1-15
}

export function normalize(input: TaxiInput): TaxiInput {
  return {
    taxiNo: input.taxiNo.trim(),
    taxiReg: input.taxiReg.trim().toUpperCase(),
    name: input.name.trim().replace(/\s+/g, ' '),
    nameDv: input.nameDv.trim().replace(/\s+/g, ' '),
    phone: input.phone.trim(),
    seats: input.seats.trim(),
  }
}

export function validate(input: TaxiInput, existing: Taxi[]): Partial<Record<Field, FieldError>> {
  const errors: Partial<Record<Field, FieldError>> = {}
  for (const field of Object.keys(rules) as Field[]) {
    if (!input[field]) errors[field] = 'required'
    else if (!rules[field].test(input[field])) errors[field] = 'format'
  }
  if (!errors.taxiNo && existing.some((t) => t.taxiNo === input.taxiNo)) errors.taxiNo = 'taken'
  if (!errors.taxiReg && existing.some((t) => t.taxiReg === input.taxiReg)) errors.taxiReg = 'taken'
  return errors
}

// Rebuild a Taxi from untrusted stored data; returns null if anything fails the rules.
export function parseStoredTaxi(value: unknown): Taxi | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const d = (typeof v.driver === 'object' && v.driver !== null ? v.driver : {}) as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' ? x : '')
  if (!/^[\w-]{1,40}$/.test(str(v.id))) return null
  const input: TaxiInput = {
    taxiNo: str(v.taxiNo),
    taxiReg: str(v.taxiReg),
    name: str(d.name),
    nameDv: str(d.nameDv),
    phone: str(d.phone),
    seats: typeof v.seats === 'number' ? String(v.seats) : '4', // older records: 4
  }
  if (Object.keys(validate(input, [])).length) return null
  const taxi = toTaxi(str(v.id), input)
  if (typeof v.centerId === 'string' && /^[\w-]{1,40}$/.test(v.centerId)) taxi.centerId = v.centerId
  if (typeof v.vehicleId === 'string' && /^[\w-]{1,40}$/.test(v.vehicleId)) taxi.vehicleId = v.vehicleId
  const suspension = parseSuspension(v.suspended)
  if (suspension) taxi.suspended = suspension
  return taxi
}

// Free text typed by the operator (notes, places): letters in any script, digits, spaces and
// basic punctuation only; no angle brackets, quotes-as-markup or control characters.
const freeText = /^[\p{L}\p{M}\p{N} .,'/#()&+:;\-\u060C]{0,120}$/u
export const isFreeText = (s: string) => freeText.test(s)

export const SUSPEND_REASONS: readonly SuspendReason[] = ['conduct', 'fees', 'other']

function parseSuspension(value: unknown): Suspension | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const reason = SUSPEND_REASONS.find((r) => r === v.reason)
  const note = typeof v.note === 'string' ? v.note : ''
  const at = typeof v.at === 'number' && Number.isFinite(v.at) ? v.at : Date.now()
  if (!reason || !isFreeText(note)) return null
  return { reason, note, at }
}

export const EMPTY_CALL: CallInfo = { pickup: '', destination: '', phone: '', note: '' }

export type CallField = 'pickup' | 'destination' | 'phone' | 'note'

// Call details are optional, but whatever is filled in must pass the allow-list.
export function validateCall(call: CallInfo): Partial<Record<CallField, 'format'>> {
  const errors: Partial<Record<CallField, 'format'>> = {}
  for (const f of ['pickup', 'destination', 'note'] as const) if (!isFreeText(call[f].trim())) errors[f] = 'format'
  if (call.phone.trim() && !/^\d{7}$/.test(call.phone.trim())) errors.phone = 'format'
  return errors
}

export const hasCallInfo = (c: CallInfo) => !!(c.pickup.trim() || c.destination.trim() || c.phone.trim() || c.note.trim())

export function toTaxi(id: string, i: TaxiInput): Taxi {
  return { id, taxiNo: i.taxiNo, taxiReg: i.taxiReg, driver: { id, name: i.name, nameDv: i.nameDv, phone: i.phone }, seats: Number(i.seats) || 4 }
}
