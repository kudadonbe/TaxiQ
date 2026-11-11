import { describe, expect, it } from 'vitest'
import { allWeek, EMPTY_HOURS, isOpenNow, nearestHelp, serviceErrors, type ServiceDetails } from './services'

const base: ServiceDetails = {
  name: "Ali's Garage",
  nameDv: 'ޢަލީގެ ގަރާޖު',
  kinds: ['mechanic', 'tyre'],
  mode: 'fixed',
  at: [6.62, 73.07],
  hours: allWeek('08:00', '22:00'),
  phone: '7771234',
  priceNote: 'Puncture from MVR 50',
  note: '',
}
// Wednesday 11 Nov 2026 at a given local time.
const at = (h: number, m = 0, day = 11) => new Date(2026, 10, day, h, m)

describe('services on the map', () => {
  it('a complete fixed place is valid', () => {
    expect(serviceErrors(base)).toEqual({})
  })
  it('needs a name, a kind, a place and hours (fixed), and a phone', () => {
    expect(serviceErrors({ ...base, name: '' }).name).toBe('required')
    expect(serviceErrors({ ...base, kinds: [] }).kinds).toBe('required')
    expect(serviceErrors({ ...base, at: null }).at).toBe('required')
    expect(serviceErrors({ ...base, hours: EMPTY_HOURS }).hours).toBe('required')
    expect(serviceErrors({ ...base, phone: '12' }).phone).toBe('format')
    expect(serviceErrors({ ...base, nameDv: 'Ali' }).nameDv).toBe('format') // the Dhivehi name must be Thaana
  })
  it('a mobile helper needs no place or hours (shown only while Available)', () => {
    expect(serviceErrors({ ...base, mode: 'mobile', at: null, hours: EMPTY_HOURS })).toEqual({})
  })
  it('open now from the hours, including past midnight', () => {
    expect(isOpenNow(base.hours, at(9))).toBe(true)
    expect(isOpenNow(base.hours, at(23))).toBe(false)
    const late = allWeek('18:00', '02:00')
    expect(isOpenNow(late, at(23))).toBe(true)
    expect(isOpenNow(late, at(1, 30))).toBe(true) // yesterday's hours, still open
    expect(isOpenNow(late, at(3))).toBe(false)
    const closedWed = [...base.hours]
    closedWed[3] = null
    expect(isOpenNow(closedWed, at(9))).toBe(false)
  })
  it('help near me: open ones of that kind, nearest first', () => {
    const list = [
      { id: 'far', kinds: ['mechanic' as const], at: [6.63, 73.07] as [number, number], openNow: true },
      { id: 'near', kinds: ['mechanic' as const], at: [6.621, 73.07] as [number, number], openNow: true },
      { id: 'closed', kinds: ['mechanic' as const], at: [6.6201, 73.07] as [number, number], openNow: false },
      { id: 'tyres', kinds: ['tyre' as const], at: [6.6202, 73.07] as [number, number], openNow: true },
    ]
    expect(nearestHelp(list, [6.62, 73.07], 'mechanic').map((s) => s.id)).toEqual(['near', 'far'])
    expect(nearestHelp(list, [6.62, 73.07]).map((s) => s.id)[0]).toBe('tyres')
  })
})
