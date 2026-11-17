import { describe, expect, it } from 'vitest'
import { figureMenu, firstName, hitFigure, serviceHeading } from './figureMenu'

const ids = (s: Parameters<typeof figureMenu>[0]) => figureMenu(s).buttons.map((b) => b.id)

describe('figureMenu', () => {
  it('asks a service by its first kind', () => {
    expect(serviceHeading(['tyre', 'mechanic'])).toBe('tyres')
    expect(serviceHeading(['battery'])).toBe('battery')
    expect(serviceHeading(['towing'])).toBe('tow')
    expect(serviceHeading(['mechanic', 'tyre'])).toBe('fix')
    expect(serviceHeading(['carwash'])).toBe('fix')
    expect(serviceHeading([])).toBe('fix')
  })

  it('offers Call, Route and See details for a service', () => {
    expect(ids({ kind: 'service', kinds: ['mechanic'], phone: '7771234', canRoute: true })).toEqual(['call', 'route', 'details'])
    // No usable phone, no location yet: only See details.
    expect(ids({ kind: 'service', kinds: ['mechanic'], phone: '', canRoute: false })).toEqual(['details'])
    expect(figureMenu({ kind: 'service', kinds: ['mechanic'], phone: '7771234', canRoute: true }).buttons[0]!.primary).toBe(true)
  })

  it('offers a private vehicle for hire only where hiring is possible', () => {
    const v = { kind: 'vehicle' as const, mine: false, canHire: true, available: false, followed: false }
    expect(figureMenu(v).heading).toBe('ride')
    expect(ids(v)).toEqual(['hire', 'follow'])
    expect(ids({ ...v, mine: true })).toEqual(['follow'])
    expect(ids({ ...v, available: true })).toEqual(['follow'])
    expect(ids({ ...v, canHire: false })).toEqual(['follow'])
    expect(ids({ ...v, followed: true })).toEqual(['hire', 'unfollow'])
  })

  it('offers a center taxi unless it is suspended', () => {
    const x = { kind: 'taxi' as const, suspended: false, canHire: true, available: false, followed: false }
    expect(ids(x)).toEqual(['hire', 'follow'])
    expect(ids({ ...x, suspended: true })).toEqual(['follow'])
    expect(ids({ ...x, available: true })).toEqual(['follow'])
  })

  it('never offers anything for a person, only Follow', () => {
    expect(figureMenu({ kind: 'person', followed: false })).toEqual({ heading: 'person', buttons: [{ id: 'follow', primary: false }] })
    expect(ids({ kind: 'bus', followed: true })).toEqual(['unfollow'])
  })

  it("says that's you on your own avatar", () => {
    expect(figureMenu({ kind: 'me', canChangeLook: true })).toEqual({ heading: 'you', buttons: [{ id: 'changeLook', primary: false }] })
    expect(ids({ kind: 'me', canChangeLook: false })).toEqual([])
  })

  it('keeps only the first name', () => {
    expect(firstName('Aisha Mohamed')).toBe('Aisha')
    expect(firstName('  Ali ')).toBe('Ali')
    expect(firstName(undefined)).toBe('')
  })
})

describe('hitFigure', () => {
  const person = { id: 'p:a', base: [100, 200] as [number, number], top: [100, 160] as [number, number], r: 0 }
  const car = { id: 'v:b', base: [300, 200] as [number, number], top: [300, 190] as [number, number], r: 40 }
  it('finds a figure tapped anywhere along its height', () => {
    expect(hitFigure([person, car], [104, 170])).toBe('p:a')
    expect(hitFigure([person, car], [100, 150])).toBe('p:a') // 10 px above the head
  })
  it('uses a vehicle reach larger than the tap radius', () => {
    expect(hitFigure([person, car], [335, 200])).toBe('v:b')
  })
  it('picks the nearest and ignores empty ground', () => {
    const other = { ...person, id: 'p:c', base: [120, 200] as [number, number], top: [120, 160] as [number, number] }
    expect(hitFigure([person, other], [116, 180])).toBe('p:c')
    expect(hitFigure([person, car], [200, 300])).toBe(null)
  })
})
