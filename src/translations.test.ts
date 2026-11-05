import { describe, expect, it } from 'vitest'
import { applyOverrides, asTemplate, checkFix, flatten, parseOverrides } from './translations'

const dict = {
  hello: 'Hello',
  coming: (no: string, name: string) => `Taxi ${no} (${name}) is coming.`,
  rowLabel: (no: string, answered: boolean) => `Taxi ${no}${answered ? ', answered' : ''}`,
  errors: { taken: 'Already registered' },
}

describe('translation fixes', () => {
  it('turns functions into templates with numbered placeholders', () => {
    expect(asTemplate(dict.coming)).toBe('Taxi {1} ({2}) is coming.')
  })
  it('flattens nested strings and skips non-editable labels', () => {
    expect(flatten(dict).map((e) => e.key)).toEqual(['hello', 'coming', 'errors.taken'])
  })
  it('applies fixes to strings, nested strings and templates', () => {
    const t = applyOverrides(dict, { hello: 'Hi', 'errors.taken': 'Taken', coming: '{2} in taxi {1} is on the way' })
    expect(t.hello).toBe('Hi')
    expect(t.errors.taken).toBe('Taken')
    expect(t.coming('34', 'Ali')).toBe('Ali in taxi 34 is on the way')
    expect(t.rowLabel('2', true)).toBe('Taxi 2, answered') // untouched
  })
  it('returns the original when there are no fixes', () => {
    expect(applyOverrides(dict, {})).toBe(dict)
  })
  it('checks that a fix keeps the placeholders', () => {
    expect(checkFix('Taxi {1} is coming', 'ޓެކްސީ {1} އަންނަނީ')).toBe('ok')
    expect(checkFix('Taxi {1} is coming', 'ޓެކްސީ އަންނަނީ')).toBe('placeholders')
    expect(checkFix('Hello', '  ')).toBe('empty')
    expect(checkFix('Hello', 'x'.repeat(301))).toBe('too_long')
  })
  it('keeps only well-formed fixes from the database', () => {
    expect(parseOverrides({ entries: { hello: 'Hi', 'bad key!': 'x', empty: ' ', num: 5 } })).toEqual({ hello: 'Hi' })
    expect(parseOverrides(undefined)).toEqual({})
  })
})
