// Tapping a house or building on TaxiQ's own map, and whether it hides a 3D figure behind it. Pure:
// MapView projects the shapes near the tap to the screen and asks here which one was tapped.
//
// The tap's ray, in screen terms: a point at height z above the ground shows `z * rise` px higher
// on the screen than the ground under it (rise = px per metre at that spot x the sine of the tilt,
// as hitFigure and the bridge decks use). So the ray through the tapped point P meets the ground
// at P, and meets height z above the ground point that shows at P + (0, z * rise): straight down
// the screen, towards the camera. A shape of height H is hit where that segment, from P down to
// P + (0, H * rise), runs inside its ground outline on screen; the lowest such point (largest y) is
// where the ray first enters it: its depth. A larger depth is nearer the camera. Flat (2D): rise 0,
// a plain point-in-outline test.

import type { House } from './houseTiles'

export type Pt = [number, number]
type LatLng = readonly [number, number]

const KY = 110_574 // metres per degree of latitude (as scripts/build-houses.py)
const kx = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)

// Metres east and north of `from` (lat, lng) to `p` (lat, lng).
export function metresFrom(from: LatLng, p: LatLng): Pt {
  return [(p[1] - from[1]) * kx(from[0]), (p[0] - from[0]) * KY]
}

// Even-odd point-in-polygon (any winding, no repeated closing point needed).
export function inRing(p: readonly [number, number], ring: readonly (readonly [number, number])[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

// A house's footprint corners as lat, lng.
export function houseRing(h: House): [number, number][] {
  const k = kx(h.at[0])
  return h.f.map(([x, y]) => [h.at[0] + y / KY, h.at[1] + x / k])
}
export const houseContains = (h: House, p: LatLng) => inRing(metresFrom(h.at, p), h.f)
// The house's full height as drawn (to the ridge of a sloped roof, the parapet of a flat one).
export const houseTop = (h: House) => h.h + (h.rf === 'f' ? 0.6 : 1.5)

// Where the tap's ray first meets a shape (its outline on screen at ground level, `ring`; `lift`
// the px its full height rises on screen): the screen y of that point's ground, or null if missed.
export function prismFront(ring: readonly Pt[], at: Pt, lift: number): number | null {
  const [x, y0] = at
  const y1 = y0 + Math.max(0, lift)
  // The outline's crossings of the vertical line through the tap, in order: inside between pairs.
  const ys: number[] = []
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a[0] > x !== b[0] > x) ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]))
  }
  ys.sort((p, q) => p - q)
  let best: number | null = null
  for (let i = 0; i + 1 < ys.length; i += 2) {
    const lo = Math.max(ys[i]!, y0)
    const hi = Math.min(ys[i + 1]!, y1)
    if (lo <= hi && (best === null || hi > best)) best = hi
  }
  return best
}

export interface ShapeOnScreen<T> {
  item: T
  ring: Pt[] // ground outline on screen
  lift: number // px the full height rises on screen
}
// The shape the tap's ray meets first (nearest the camera), with its depth; none: null.
export function frontShape<T>(shapes: Iterable<ShapeOnScreen<T>>, at: Pt): { item: T; depth: number } | null {
  let best: { item: T; depth: number } | null = null
  for (const s of shapes) {
    const d = prismFront(s.ring, at, s.lift)
    if (d !== null && (!best || d > best.depth)) best = { item: s.item, depth: d }
  }
  return best
}

// A 3D figure standing at screen y `baseY` (its feet) is hidden from the tap when the front shape
// on the ray is nearer the camera: its depth is below the figure's feet on screen.
export function hiddenBy(baseY: number, front: { depth: number } | null, margin = 1): boolean {
  return !!front && front.depth > baseY + margin
}

// The name for a tapped shape (lat, lng outline): a house, landmark or plot point inside it, houses
// first, the nearest the middle on a tie; else the nearest within `near` metres of the outline.
export interface NamedPoint {
  t: string // 'h' house, 'l' landmark, 'p' plot, 'r' road (never used)
  p: [number, number][]
}
const RANK: Record<string, number> = { h: 0, l: 1, p: 2 }
export function placeIn<P extends NamedPoint>(places: readonly P[], ring: readonly LatLng[], centre: LatLng, near = 8): P | null {
  const local = ring.map((q) => metresFrom(centre, q))
  let best: P | null = null
  let bestKey = Infinity
  let close: P | null = null
  let closeD = near
  for (const pl of places) {
    const rank = RANK[pl.t]
    const at = pl.p[0]
    if (rank === undefined || !at) continue
    const m = metresFrom(centre, at)
    const d = Math.hypot(m[0], m[1])
    if (d > 300) continue
    if (inRing(m, local)) {
      const key = rank * 1000 + d
      if (key < bestKey) {
        bestKey = key
        best = pl
      }
    } else {
      const e = toOutline(m, local)
      if (e <= closeD) {
        closeD = e
        close = pl
      }
    }
  }
  return best ?? close
}

function toOutline(p: Pt, ring: readonly Pt[]): number {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!
    const b = ring[i]!
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = dx * dx + dy * dy
    const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)))
  }
  return best
}

// The middle of an outline (the average of its corners), lat, lng.
export function ringMiddle(ring: readonly LatLng[]): [number, number] {
  let a = 0
  let b = 0
  for (const p of ring) {
    a += p[0]
    b += p[1]
  }
  return ring.length ? [a / ring.length, b / ring.length] : [0, 0]
}
