import { describe, expect, it } from 'vitest'
import { decodeHouseTile, houseTileBox, houseTileOrigin, houseTilesIn, type HouseTileDoc } from './houseTiles'

describe('which house tiles a view needs', () => {
  it('a small box inside one tile: that tile', () => {
    // 4.17625 is in tile 1670 (4.175-4.1775), 73.50125 in 29400.
    expect(houseTilesIn([4.176, 73.501, 4.1765, 73.5015])).toEqual(['1670_29400'])
  })
  it('a box over a corner: the four tiles, nearest the middle first', () => {
    const t = houseTilesIn([4.1749, 73.5099, 4.1751, 73.5101])
    expect(t.sort()).toEqual(['1669_29403', '1669_29404', '1670_29403', '1670_29404'])
  })
  it('a wide box: nearest the middle first, at most `max`', () => {
    const t = houseTilesIn([4.17, 73.495, 4.18, 73.505], 5)
    expect(t).toHaveLength(5)
    expect(t[0]).toBe('1670_29400')
  })
  it('the corner and box of a tile from its name', () => {
    expect(houseTileOrigin('1670_29400')).toEqual([4.175, 73.5])
    const b = houseTileBox('1670_29400')
    expect(b[2] - b[0]).toBeCloseTo(0.0025, 9)
  })
})

describe('reading a house tile', () => {
  const doc: HouseTileDoc = {
    v: 1,
    p: ['#f7f4ec', '#efe6cf', 'red'],
    h: [
      // dlat, dlng, seed, t, fl, rf, wc, bw, yd, bc, h10, fr, footprint (dm)
      [1200, 300, 4242, 0, 1, 1, 1, 1, 4, 0, 30, 109, 39, -36, 53, 3, -39, 36, -53, -4],
      [10, 20, 7, 2, 5, 0, 2, 0, 0, 1, 160, -1, -50, -50, 50, -50, 50, 50, -50, 50],
      [10, 20, 7, 2, 5, 0, 2, 0, 0, 1, 160, -1, 1, 2], // too few corners: skipped
    ],
  }
  const [a, b] = decodeHouseTile(doc, '1670_29400')
  it('the centre from the tile corner, the footprint in metres', () => {
    expect(a!.at).toEqual([4.1762, 73.5003])
    expect(a!.f[0]).toEqual([3.9, -3.6])
    expect(a!.f).toHaveLength(4)
  })
  it('the design fields', () => {
    expect(a).toMatchObject({ seed: 4242, t: 'ih', fl: 1, rf: 'g', wall: '#efe6cf', bw: true, yd: 4, bc: false, h: 3, fr: 109 })
    expect(b).toMatchObject({ t: 'mh', fl: 5, rf: 'f', bw: false, bc: true, h: 16, fr: null })
  })
  it('a colour that is not #rrggbb falls back to white', () => {
    expect(b!.wall).toBe('#f7f4ec')
  })
  it('skips a row with too few corners', () => {
    expect(decodeHouseTile(doc, '1670_29400')).toHaveLength(2)
  })
})
