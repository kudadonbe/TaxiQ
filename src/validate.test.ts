import { describe, expect, it } from 'vitest'
import { hasCallInfo, isFreeText, normalize, parseStoredTaxi, validate, validateCall } from './validate'

const existing = [parseStoredTaxi({ id: '1', taxiNo: '34', taxiReg: 'T5110', driver: { name: 'Ali', nameDv: 'ޢަލީ', phone: '9890000' } })!]

describe('taxi records', () => {
  it('accepts and normalizes a good record', () => {
    const input = normalize({ taxiNo: ' 7 ', taxiReg: 't9999', name: 'Hassan  Ali', nameDv: 'ހަސަން ޢަލީ', phone: '7771234' })
    expect(input).toEqual({ taxiNo: '7', taxiReg: 'T9999', name: 'Hassan Ali', nameDv: 'ހަސަން ޢަލީ', phone: '7771234' })
    expect(validate(input, existing)).toEqual({})
  })
  it('rejects taken center numbers and registrations', () => {
    expect(validate({ taxiNo: '34', taxiReg: 'T5110', name: 'A', nameDv: 'ޢ', phone: '7771234' }, existing)).toEqual({ taxiNo: 'taken', taxiReg: 'taken' })
  })
  it('rejects markup and bad formats', () => {
    expect(validate({ taxiNo: '007', taxiReg: '<b>', name: '<script>', nameDv: 'Ali', phone: '12' }, existing)).toEqual({
      taxiNo: 'format',
      taxiReg: 'format',
      name: 'format',
      nameDv: 'format',
      phone: 'format',
    })
  })
  it('drops stored records that fail the rules', () => {
    expect(parseStoredTaxi({ id: 'x', taxiNo: '1', taxiReg: 'T1', driver: { name: '<img>', nameDv: 'ޢ', phone: '1234567' } })).toBeNull()
    expect(parseStoredTaxi(null)).toBeNull()
  })
  it('keeps a valid suspension and drops a bad one', () => {
    const base = { id: '2', taxiNo: '2', taxiReg: 'T2', driver: { name: 'B', nameDv: 'ބ', phone: '7770000' } }
    expect(parseStoredTaxi({ ...base, suspended: { reason: 'fees', note: 'Oct', at: 1 } })!.suspended).toEqual({ reason: 'fees', note: 'Oct', at: 1 })
    expect(parseStoredTaxi({ ...base, suspended: { reason: 'nope', note: '' } })!.suspended).toBeUndefined()
  })
})

describe('free text and call details', () => {
  it('allows any script and basic punctuation, not markup', () => {
    expect(isFreeText('Rome (Plot 117), Ameenee Magu')).toBe(true)
    expect(isFreeText('ރޯމް، ބިން 117')).toBe(true)
    expect(isFreeText('<script>')).toBe(false)
    expect(isFreeText('x'.repeat(121))).toBe(false)
  })
  it('checks call details only where filled in', () => {
    const call = { pickup: 'Rome', destination: '', phone: '', note: '' }
    expect(validateCall(call)).toEqual({})
    expect(validateCall({ ...call, phone: '123' })).toEqual({ phone: 'format' })
    expect(hasCallInfo(call)).toBe(true)
    expect(hasCallInfo({ pickup: ' ', destination: '', phone: '', note: '' })).toBe(false)
  })
})
