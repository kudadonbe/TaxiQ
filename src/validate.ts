import type { Taxi } from './types'

// Allow-list validation for taxi records. Used by the admin form and when reading localStorage,
// so anything that reaches the UI has passed the same rules.

export interface TaxiInput {
  taxiNo: string
  taxiReg: string
  name: string
  nameDv: string
  phone: string
}

export type Field = keyof TaxiInput
export type FieldError = 'required' | 'format' | 'taken'

const rules: Record<Field, RegExp> = {
  taxiNo: /^[1-9]\d{0,3}$/, // center number: 1–9999, no leading zeros
  taxiReg: /^[A-Z]\d{1,6}$/, // e.g. T5110
  name: /^[A-Za-z][A-Za-z .'-]{0,59}$/,
  nameDv: /^[ހ-޿][ހ-޿ ]{0,59}$/, // Thaana block only
  phone: /^[0-9X]{7}$/, // Maldives 7-digit number (X allowed for masked demo data)
}

export function normalize(input: TaxiInput): TaxiInput {
  return {
    taxiNo: input.taxiNo.trim(),
    taxiReg: input.taxiReg.trim().toUpperCase(),
    name: input.name.trim().replace(/\s+/g, ' '),
    nameDv: input.nameDv.trim().replace(/\s+/g, ' '),
    phone: input.phone.trim(),
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
  }
  if (Object.keys(validate(input, [])).length) return null
  return toTaxi(str(v.id), input)
}

export function toTaxi(id: string, i: TaxiInput): Taxi {
  return { id, taxiNo: i.taxiNo, taxiReg: i.taxiReg, driver: { id, name: i.name, nameDv: i.nameDv, phone: i.phone } }
}
