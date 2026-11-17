// Place tiles: house and road names split by map area, so the app loads only the part it needs.
// Built by scripts/split-places.py into src/data/places/<area>/ (keep the two in step):
//   <y>_<x>.json        houses, landmarks and plots whose first point is in that 0.0025-degree tile
//   roads_<y>_<x>.json  roads with a point in that 0.01-degree cell (a road is whole in each cell)
// y and x are the tile's south-west corner in tile units. Pure functions.

import type { Place, PlaceType } from '../places'

export const TILE_E6 = 2500 // house tile size, millionths of a degree (about 280 m)
export const ROAD_CELL_E6 = 10_000 // road cell size (about 1.1 km)

// One row: [t, e, d, kx, pl, pc, dlat0, lng0, dlat1, dlng1, ...] (see scripts/split-places.py).
export type Row = [PlaceType, string, string, string, string, string, ...number[]]

// Search key folding: lowercase letters, digits and Thaana only.
export const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9ހ-޿]/g, '')

const e6 = (x: number) => Math.round(x * 1e6)
const cellOf = (x: number, size: number) => Math.floor(e6(x) / size)

// The file names (without .json) a box of `r` degrees around `at` needs: its house tiles and road cells.
export function filesAround(at: readonly [number, number], r: number): string[] {
  const out: string[] = []
  const add = (size: number, prefix: string) => {
    for (let y = cellOf(at[0] - r, size); y <= cellOf(at[0] + r, size); y++)
      for (let x = cellOf(at[1] - r, size); x <= cellOf(at[1] + r, size); x++) out.push(`${prefix}${y}_${x}`)
  }
  add(TILE_E6, '')
  add(ROAD_CELL_E6, 'roads_')
  return out
}

// The south-west corner of a file, in millionths of a degree.
export function originOf(name: string): [number, number] {
  const road = name.startsWith('roads_')
  const [y, x] = (road ? name.slice(6) : name).split('_').map(Number) as [number, number]
  const size = road ? ROAD_CELL_E6 : TILE_E6
  return [y * size, x * size]
}

// The places in one file. Rows are sorted by first latitude: the first point's latitude is from the
// row before (the first row: from the file's south edge), its longitude from the west edge, and each
// later point from the point before it.
export function decodeRows(rows: readonly Row[], origin: readonly [number, number]): Place[] {
  let prev = origin[0]
  return rows.map(([t, e, d, kx, pl, pc, ...c]) => {
    let lat = prev + c[0]!
    let lng = origin[1] + c[1]!
    prev = lat
    const p: [number, number][] = [[lat / 1e6, lng / 1e6]]
    for (let i = 2; i + 1 < c.length; i += 2) {
      lat += c[i]!
      lng += c[i + 1]!
      p.push([lat / 1e6, lng / 1e6])
    }
    const base = fold(e + d)
    const place: Place = { t, e, d, k: kx === '' ? base : kx.startsWith('+') ? base + kx.slice(1) : kx, p }
    if (pl) place.pl = pl
    if (pc) place.pc = pc
    return place
  })
}

// A place's identity: a road crossing cells comes in each of them, and is kept once.
export const placeId = (p: Place) => `${p.t}|${p.e}|${p.d}|${p.p[0]![0]},${p.p[0]![1]}`
