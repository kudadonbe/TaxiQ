import { describe, expect, it } from 'vitest'
import { cleanShareName, parseShareParams, shareLink, withoutShareParams } from './shareLink'

describe('parseShareParams', () => {
  it('reads a position in the Maldives', () => {
    expect(parseShareParams('?at=6.62215,73.07002')).toEqual({ at: [6.62215, 73.07002] })
    expect(parseShareParams('?at=4.1755,73.5093&n=Majeedhee%20Magu')).toEqual({ at: [4.1755, 73.5093], name: 'Majeedhee Magu' })
    expect(parseShareParams('?at=-0.6301,73.1585')).toEqual({ at: [-0.6301, 73.1585] })
  })

  it('reads a Dhivehi name', () => {
    expect(parseShareParams(`?at=6.62215,73.07002&n=${encodeURIComponent('ހިރިގަސްދޮށުގެ')}`)?.name).toBe('ހިރިގަސްދޮށުގެ')
  })

  it('ignores positions outside the Maldives or in the wrong form', () => {
    for (const at of ['51.50000,-0.12000', '6.6,80.1', '6.622151,73.07002', '6,73', '6.62215;73.07002', '6.62215,73.07002,1', 'abc', '', '6.62215, 73.07002', '1e1,73.0', '0x6.6,73.0']) {
      expect(parseShareParams(`?at=${encodeURIComponent(at)}`)).toBeNull()
    }
    expect(parseShareParams('?n=Home')).toBeNull()
    expect(parseShareParams('')).toBeNull()
  })

  it('drops a bad name but keeps the position', () => {
    for (const n of ['<script>alert(1)</script>', 'Call 7771234', 'a"b', 'x'.repeat(61), '   ', 'javascript:alert`1`', 'a\u0000b']) {
      expect(parseShareParams(`?at=6.62215,73.07002&n=${encodeURIComponent(n)}`)).toEqual({ at: [6.62215, 73.07002] })
    }
  })
})

describe('cleanShareName', () => {
  it('trims and folds spaces', () => {
    expect(cleanShareName('  Blue   Villa ')).toBe('Blue Villa')
    expect(cleanShareName('x'.repeat(60))).toBe('x'.repeat(60))
    expect(cleanShareName('x'.repeat(61))).toBeNull()
    expect(cleanShareName('')).toBeNull()
  })
})

describe('shareLink', () => {
  it('builds our own link, rounded to 5 decimals', () => {
    expect(shareLink([6.6221549, 73.0700249])).toBe('https://kd-taxiq.web.app/?at=6.62215,73.07002')
    expect(shareLink([6.62215, 73.07002], 'Blue Villa')).toBe('https://kd-taxiq.web.app/?at=6.62215,73.07002&n=Blue%20Villa')
    expect(shareLink([6.62215, 73.07002], '7771234 Ali')).toBe('https://kd-taxiq.web.app/?at=6.62215,73.07002')
  })

  it('round-trips through the parser', () => {
    const url = new URL(shareLink([4.17552, 73.50931], 'ހިރިގަސްދޮށުގެ'))
    expect(parseShareParams(url.search)).toEqual({ at: [4.17552, 73.50931], name: 'ހިރިގަސްދޮށުގެ' })
  })
})

describe('withoutShareParams', () => {
  it('removes only at and n', () => {
    expect(withoutShareParams('?at=6.6,73.0&n=x')).toBe('')
    expect(withoutShareParams('?x=1&at=6.6,73.0')).toBe('?x=1')
  })
})
