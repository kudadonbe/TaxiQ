import { describe, expect, it } from 'vitest'
import type { Place } from '../places'
import { decodeRows, filesAround, originOf, placeId, type Row } from './placeTiles'

describe('which tiles a spot needs', () => {
  it('a spot in the middle of a tile: that tile and its road cell', () => {
    // 4.17625 is in house tile 1670 (4.175-4.1775), 73.50125 in 29400; road cell 417_7350.
    expect(filesAround([4.17625, 73.50125], 0.001)).toEqual(['1670_29400', 'roads_417_7350'])
  })
  it('near a corner: the four tiles that meet there (73.51 is a road cell edge too)', () => {
    expect(filesAround([4.1751, 73.5101], 0.0005)).toEqual(['1669_29403', '1669_29404', '1670_29403', '1670_29404', 'roads_417_7350', 'roads_417_7351'])
  })
  it('a wider box takes every tile it touches, and road cells across their edge', () => {
    const f = filesAround([4.17625, 73.50125], 0.003)
    expect(f.filter((n) => !n.startsWith('roads_'))).toHaveLength(9)
    expect(f.filter((n) => n.startsWith('roads_'))).toEqual(['roads_417_7349', 'roads_417_7350'])
  })
  it('the corner of a file from its name', () => {
    expect(originOf('1670_29400')).toEqual([4_175_000, 73_500_000])
    expect(originOf('roads_417_7350')).toEqual([4_170_000, 73_500_000])
  })
})

describe('reading a tile', () => {
  const origin: [number, number] = [4_175_000, 73_500_000]
  const rows: Row[] = [
    ['h', 'Rose Villa', 'ރޯޒްވިލާ', '+henveiru', '95', '20095', 120, 300],
    ['l', 'Jumhooree Maidhaan', '', 'jumhooree', '', '', 80, 1500],
    ['r', 'Majeedhee Magu', '', '', '', '', 10, 0, 5, 700, -2, 650],
  ]
  const [house, landmark, road] = decodeRows(rows, origin)
  it('points from the deltas: latitude from the row before, longitude from the west edge', () => {
    expect(house!.p).toEqual([[4.17512, 73.5003]])
    expect(landmark!.p).toEqual([[4.1752, 73.5015]])
    expect(road!.p).toEqual([[4.17521, 73.5], [4.175215, 73.5007], [4.175213, 73.50135]])
  })
  it('the search key: folded names, plus a suffix, or as given', () => {
    expect(house!.k).toBe('rosevillaރޯޒްވިލާhenveiru')
    expect(landmark!.k).toBe('jumhooree')
    expect(road!.k).toBe('majeedheemagu')
  })
  it('plot number and postcode only when there', () => {
    expect(house).toMatchObject({ t: 'h', e: 'Rose Villa', pl: '95', pc: '20095' })
    expect('pl' in landmark!).toBe(false)
    expect('pc' in road!).toBe(false)
  })
})

// The committed tiles must hold exactly the import scripts' places (run scripts/split-places.py
// after any import).
const tiles = import.meta.glob<Row[]>('../data/places/*/*.json', { eager: true, import: 'default' })
const sources = import.meta.glob<Place[]>('../../scripts/data/places-*.json', { eager: true, import: 'default' })

describe.each([
  ['kdh', '../../scripts/data/places-kdh.json'],
  ['male', '../../scripts/data/places-male.json'],
])('the %s tiles', (area, source) => {
  it('decode back to the source, every place once', () => {
    const seen = new Set<string>()
    const back: Place[] = []
    for (const [path, rows] of Object.entries(tiles)) {
      if (!path.startsWith(`../data/places/${area}/`)) continue
      const name = path.split('/').pop()!.slice(0, -5)
      for (const p of decodeRows(rows, originOf(name))) {
        if (p.t === 'r') {
          if (seen.has(placeId(p))) continue
          seen.add(placeId(p))
        }
        back.push(p)
      }
    }
    const canon = (ps: Place[]) =>
      ps.map((p) => JSON.stringify(Object.fromEntries(Object.entries(p).sort(([a], [b]) => a.localeCompare(b))))).sort()
    const src = sources[source]!
    expect(back).toHaveLength(src.length)
    expect(canon(back)).toEqual(canon(src))
  })
})
