import { describe, expect, it } from 'vitest'
import { centerErrors, centerNeedsRecheck, isLogo, LOGO_MAX, normLicence, suspendedRole, type CenterDetails } from './centerApps'
import { allWeek, EMPTY_HOURS } from './services'

const ok: CenterDetails = { name: 'Kudahuvadhoo Taxi', nameDv: 'ކުޑަހުވަދޫ ޓެކްސީ', at: [2.67, 72.89], phone: '7771234', hours: allWeek('06:00', '23:00'), licence: 'TA/TC-2024/015', logo: '' }

describe('centerErrors', () => {
  it('accepts a full application', () => {
    expect(centerErrors(ok)).toEqual({})
  })
  it('needs a name, place, phone, hours and licence', () => {
    const e = centerErrors({ ...ok, name: '', at: null, phone: '', hours: EMPTY_HOURS, licence: '' })
    expect(e).toEqual({ name: 'required', at: 'required', phone: 'required', hours: 'required', licence: 'required' })
  })
  it('refuses bad formats', () => {
    expect(centerErrors({ ...ok, phone: '12345' }).phone).toBe('format')
    expect(centerErrors({ ...ok, licence: 'ta 15' }).licence).toBe('format')
    expect(centerErrors({ ...ok, licence: '<x>' }).licence).toBe('format')
    expect(centerErrors({ ...ok, nameDv: 'Latin only' }).nameDv).toBe('format')
    expect(centerErrors({ ...ok, name: '<script>' }).name).toBe('format')
    expect(centerErrors({ ...ok, hours: allWeek('8am', '18:00') }).hours).toBe('format')
  })
  it('takes only small PNG or WebP data URLs as a logo', () => {
    expect(isLogo('')).toBe(true)
    expect(isLogo('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isLogo('data:image/webp;base64,UklGRg==')).toBe(true)
    expect(isLogo('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isLogo('data:image/png;base64,abc"onerror=x')).toBe(false)
    expect(isLogo('https://example.com/logo.png')).toBe(false)
    expect(isLogo(`data:image/png;base64,${'A'.repeat(LOGO_MAX)}`)).toBe(false)
  })
})

describe('licence and recheck', () => {
  it('normalises a typed licence', () => {
    expect(normLicence(' ta/tc 15 ')).toBe('TA/TC15')
  })
  it('a new name or place is checked again; hours and phone are not', () => {
    expect(centerNeedsRecheck(ok, { ...ok, name: 'Other' })).toBe(true)
    expect(centerNeedsRecheck(ok, { ...ok, at: [2.6, 72.8] })).toBe(true)
    expect(centerNeedsRecheck(ok, { ...ok })).toBe(false)
  })
})

describe('suspendedRole', () => {
  it('a plain center admin loses the entry', () => {
    expect(suspendedRole({ role: 'admin', centerId: 'c1' }, 'Adm@x.mv')).toBeNull()
  })
  it('a private driver keeps private hire', () => {
    expect(suspendedRole({ role: 'admin', centerId: 'c1', private: true }, 'adm@x.mv')).toEqual({ role: 'private', addedBy: 'adm@x.mv' })
    expect(suspendedRole({ role: 'admin', centerId: 'c1', private: true, corpus: true }, 'adm@x.mv')).toEqual({ role: 'private', corpus: true, addedBy: 'adm@x.mv' })
  })
  it('a corpus editor keeps the corpus as a role-less entry', () => {
    expect(suspendedRole({ role: 'admin', centerId: 'c1', corpus: true }, 'ADM@x.mv')).toEqual({ corpus: true, addedBy: 'adm@x.mv' })
  })
})
