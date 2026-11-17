// House tiles: our own houses (src/data/houses-<area>.json) split by map area, so the 3D map loads
// only the houses in and near the view. Built by scripts/build-house-tiles.py into
// src/data/houses/<area>/<y>_<x>.json (keep the two in step). Pure functions.
//
// One tile: {"v": 1, "p": [wall palette], "h": [[dlat, dlng, seed, t, fl, rf, wc, bw, yd, bc, h10, fr, x0, y0, ...]]}
// (see the script's docstring). y, x: the tile's south-west corner in tile units.

export const HOUSE_TILE_E6 = 2500 // tile size, millionths of a degree (about 280 m), like the place tiles

export const HOUSE_TYPES = ['ih', 'ch', 'mh', 'fl', 'hb'] as const
export type HouseType = (typeof HOUSE_TYPES)[number]
export type RoofType = 'f' | 'g' | 'h'
const ROOFS: RoofType[] = ['f', 'g', 'h']

export interface House {
  at: [number, number] // centre: lat, lng
  seed: number // 0..65535, from the house id: repeatable looks
  t: HouseType
  fl: number // floors
  rf: RoofType // flat, gable, hipped
  wall: string // wall colour (#rrggbb)
  bw: boolean // boundary wall
  yd: number // yard depth behind the house, m
  bc: boolean // balcony on the front
  h: number // height to the roof edge, m
  fr: number | null // the bearing the front faces (towards the road), degrees
  f: [number, number][] // footprint, metres east and north of `at`
}

export type TileRow = number[]
export interface HouseTileDoc {
  v: 1
  p: string[]
  h: TileRow[]
}

const SAFE_HEX = /^#[0-9a-f]{6}$/i
const e6 = (x: number) => Math.round(x * 1e6)
const cellOf = (x: number) => Math.floor(e6(x) / HOUSE_TILE_E6)

// The tile names a box needs (south, west, north, east), nearest the middle first.
export function houseTilesIn(box: readonly [number, number, number, number], max = 64): string[] {
  const [s, w, n, e] = box
  const y0 = cellOf(s)
  const y1 = cellOf(n)
  const x0 = cellOf(w)
  const x1 = cellOf(e)
  const cy = (y0 + y1) / 2
  const cx = (x0 + x1) / 2
  const out: { name: string; d: number }[] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ name: `${y}_${x}`, d: (y - cy) ** 2 + (x - cx) ** 2 })
  out.sort((a, b) => a.d - b.d)
  return out.slice(0, max).map((t) => t.name)
}

// A tile's south-west corner in degrees [lat, lng], and its box [s, w, n, e].
export function houseTileOrigin(name: string): [number, number] {
  const [y, x] = name.split('_').map(Number) as [number, number]
  return [(y * HOUSE_TILE_E6) / 1e6, (x * HOUSE_TILE_E6) / 1e6]
}
export function houseTileBox(name: string): [number, number, number, number] {
  const [s, w] = houseTileOrigin(name)
  const d = HOUSE_TILE_E6 / 1e6
  return [s, w, s + d, w + d]
}

// The houses in one tile. Rows with a bad shape are skipped.
export function decodeHouseTile(doc: HouseTileDoc, name: string): House[] {
  const [y, x] = name.split('_').map(Number) as [number, number]
  const lat0 = y * HOUSE_TILE_E6
  const lng0 = x * HOUSE_TILE_E6
  const out: House[] = []
  for (const r of doc.h) {
    if (r.length < 18 || r.length % 2) continue
    const [dlat, dlng, seed, t, fl, rf, wc, bw, yd, bc, h10, fr] = r as [number, number, number, number, number, number, number, number, number, number, number, number]
    const f: [number, number][] = []
    for (let i = 12; i + 1 < r.length; i += 2) f.push([r[i]! / 10, r[i + 1]! / 10])
    const wall = doc.p[wc] ?? '#f7f4ec'
    out.push({
      at: [(lat0 + dlat) / 1e6, (lng0 + dlng) / 1e6],
      seed,
      t: HOUSE_TYPES[t] ?? 'ih',
      fl: Math.max(1, Math.min(40, fl)),
      rf: ROOFS[rf] ?? 'f',
      wall: SAFE_HEX.test(wall) ? wall : '#f7f4ec',
      bw: bw === 1,
      yd: Math.max(0, yd),
      bc: bc === 1,
      h: Math.max(2, h10 / 10),
      fr: fr >= 0 ? fr : null,
      f,
    })
  }
  return out
}

// Zooms: our houses in 3D from here (below it, simple blocks from the world bundle), and the close-up
// details (boundary walls, gates, yards, balconies, doors, windows) from here.
export const HOUSES3D_MIN_ZOOM = 17
export const HOUSES3D_DETAIL_ZOOM = 18.5
