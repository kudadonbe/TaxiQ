import { describe, expect, it } from 'vitest'
import { nextTaxi } from './rides'
import { isLargeTaxi } from './types'
import { normalize, parseStoredTaxi, validate } from './validate'

describe('taxi seats', () => {
  const input = { taxiNo: '34', taxiReg: 'T5110', name: 'Ali Hussain', nameDv: 'ޢަލީ', phone: '7771234', seats: '8' }
  it('registers 1 to 15 seats', () => {
    expect(validate(normalize(input), [])).toEqual({})
    expect(validate({ ...input, seats: '0' }, []).seats).toBe('format')
    expect(validate({ ...input, seats: '16' }, []).seats).toBe('format')
  })
  it('older records without seats count as 4', () => {
    const t = parseStoredTaxi({ id: 'a', taxiNo: '34', taxiReg: 'T5110', driver: { name: 'Ali', nameDv: 'ޢަލީ', phone: '7771234' } })
    expect(t?.seats).toBe(4)
    expect(isLargeTaxi(t!)).toBe(false)
  })
  it('a 7-10 seat trip skips small taxis in the queue', () => {
    const order = ['small1', 'big', 'small2']
    expect(nextTaxi(order, [], new Set())).toBe('small1')
    expect(nextTaxi(order, [], new Set(), new Set(['big']))).toBe('big')
    expect(nextTaxi(order, ['big'], new Set(), new Set(['big']))).toBeNull()
  })
})
