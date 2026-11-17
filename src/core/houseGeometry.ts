// Our own houses in 3D (plans/house-designs.md): turns one house's footprint and design into
// triangles: walls to the eaves with a band at every floor, a roof by type (flat with a parapet,
// gable or hipped tin), and, close up, the boundary wall round the yard with a gate on the road
// side, balconies, a door, windows and a water tank. Pure: plain number arrays out, drawn by
// src/houses3d/layer.ts as one merged mesh per tile.
//
// Space: metres, x east, y north, z up; each house is placed at (ox, oy) from its tile's origin.
// Faces are wound counter-clockwise seen from outside, with flat normals and linear vertex colours.

import type { House } from './houseTiles'

export type V2 = [number, number]
export type V3 = [number, number, number]
export interface MeshData {
  pos: number[]
  nor: number[]
  col: number[]
}
export const newMesh = (): MeshData => ({ pos: [], nor: [], col: [] })
export const triCount = (m: MeshData) => m.pos.length / 9
// solid: lit walls and roofs; glass: windows (dark glass by day, some lit warm at night: the
// vertex colour is 1 for a window lit at night, 0.3 for a dark one, the material tints it).
export interface HouseMeshes {
  solid: MeshData
  glass: MeshData
}
// 1: walls and roofs (zoom 17+). 2: also boundary walls, gates, yards, balconies, doors, windows
// and water tanks (zoom 18.5+).
export type HouseLod = 1 | 2

// ---- colours ----

export type Rgb = [number, number, number]
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const rgbCache = new Map<string, Rgb>()
export function rgb(hex: string): Rgb {
  let c = rgbCache.get(hex)
  if (!c) {
    const n = parseInt(hex.slice(1), 16)
    c = [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]
    rgbCache.set(hex, c)
  }
  return c
}
const shadeOf = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k]

const TIN = ['#9aa1a6', '#a65a42', '#8d9599', '#9b4f3b'] // tin roofs: grey or rust red
const SLAB = '#cfcac0' // flat concrete roof
const CORAL = ['#eee8d8', '#e7e0cd', '#f2ecdf'] // limewashed coral stone, uneven
const CORAL_PLINTH = '#cbbf9f'
const BOUNDARY = '#f1eee6'
const GATES = ['#5b6b73', '#2f6f5e', '#7a4b2a', '#3f5f8a']
const YARD = '#eadcb6'
const DOOR = '#6b4a2f'
const SHUTTER = '#8a9096'
const BALCONY = '#e7e3da'
const RAIL = '#f4f4f0'
const TANK = '#2b5d8c'

// ---- small helpers ----

// A repeatable 0..1 number from a house seed and a salt.
export function rand(seed: number, salt: number): number {
  let h = (seed * 374_761_393 + salt * 668_265_263) | 0
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177)
  h ^= h >>> 16
  return (h >>> 0) / 4_294_967_296
}
const pick = <T>(list: readonly T[], seed: number, salt: number): T => list[Math.floor(rand(seed, salt) * list.length)]!

// Signed area (positive = counter-clockwise).
export function ringArea(r: readonly V2[]): number {
  let a = 0
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!
    const q = r[(i + 1) % r.length]!
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}
// The ring counter-clockwise, without a repeated closing point or repeated corners.
export function ccw(r: readonly V2[]): V2[] {
  const out: V2[] = []
  for (const p of r) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) out.push([p[0], p[1]])
  }
  while (out.length > 1 && Math.hypot(out[0]![0] - out[out.length - 1]![0], out[0]![1] - out[out.length - 1]![1]) <= 0.01) out.pop()
  return ringArea(out) < 0 ? out.reverse() : out
}

const cross = (a: V2, b: V2, c: V2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
function inTri(p: V2, a: V2, b: V2, c: V2) {
  return cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9
}

// Triangles (index triples) filling a counter-clockwise ring: ear clipping, good for the few corners
// a footprint has. Falls back to a fan if the ring is self-touching.
export function triangulate(ring: readonly V2[]): [number, number, number][] {
  const idx = ring.map((_, i) => i)
  const out: [number, number, number][] = []
  let guard = 0
  while (idx.length > 3 && guard++ < 500) {
    let cut = false
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length]!
      const ib = idx[i]!
      const ic = idx[(i + 1) % idx.length]!
      const a = ring[ia]!
      const b = ring[ib]!
      const c = ring[ic]!
      if (cross(a, b, c) <= 1e-9) continue
      let blocked = false
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue
        if (inTri(ring[j]!, a, b, c)) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      out.push([ia, ib, ic])
      idx.splice(i, 1)
      cut = true
      break
    }
    if (!cut) break
  }
  for (let i = 1; i + 1 < idx.length; i++) out.push([idx[0]!, idx[i]!, idx[i + 1]!])
  return out
}

// The smallest rectangle round a ring, its sides along one of the ring's edges: middle, long axis
// `u` (unit), and half sizes along u (a, the longer) and v = u turned left (b).
export interface Obb {
  c: V2
  u: V2
  a: number
  b: number
}
export function obb(ring: readonly V2[]): Obb {
  let best: Obb | null = null
  let bestArea = Infinity
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    const L = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (L < 1e-6) continue
    const u: V2 = [(q[0] - p[0]) / L, (q[1] - p[1]) / L]
    let s0 = Infinity
    let s1 = -Infinity
    let t0 = Infinity
    let t1 = -Infinity
    for (const r of ring) {
      const s = r[0] * u[0] + r[1] * u[1]
      const t = -r[0] * u[1] + r[1] * u[0]
      s0 = Math.min(s0, s)
      s1 = Math.max(s1, s)
      t0 = Math.min(t0, t)
      t1 = Math.max(t1, t)
    }
    const area = (s1 - s0) * (t1 - t0)
    if (area < bestArea - 1e-9) {
      bestArea = area
      const sc = (s0 + s1) / 2
      const tc = (t0 + t1) / 2
      const c: V2 = [sc * u[0] - tc * u[1], sc * u[1] + tc * u[0]]
      const a = (s1 - s0) / 2
      const b = (t1 - t0) / 2
      best = a >= b ? { c, u, a, b } : { c, u: [-u[1], u[0]], a: b, b: a }
    }
  }
  return best ?? { c: [0, 0], u: [1, 0], a: 0, b: 0 }
}
// A point in an OBB's frame (s along u, t along v) in plan.
const at = (o: Obb, s: number, t: number): V2 => [o.c[0] + o.u[0] * s - o.u[1] * t, o.c[1] + o.u[1] * s + o.u[0] * t]

// The ring moved inward by d (mitred corners, capped on sharp ones).
export function inset(ring: readonly V2[], d: number): V2[] {
  const n = ring.length
  const normals = ring.map((p, i) => {
    const q = ring[(i + 1) % n]!
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    return [(q[1] - p[1]) / L, -(q[0] - p[0]) / L] as V2 // outward, for a counter-clockwise ring
  })
  return ring.map((p, i) => {
    const a = normals[(i + n - 1) % n]!
    const b = normals[i]!
    const k = d / Math.max(0.35, 1 + a[0] * b[0] + a[1] * b[1])
    return [p[0] - (a[0] + b[0]) * k, p[1] - (a[1] + b[1]) * k]
  })
}

// ---- triangle output ----

export class Out {
  readonly m: MeshData
  ox = 0
  oy = 0
  constructor(m: MeshData) {
    this.m = m
  }
  tri(a: V3, b: V3, c: V3, col: Rgb) {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const L = Math.hypot(nx, ny, nz)
    if (L < 1e-9) return
    nx /= L
    ny /= L
    nz /= L
    const { pos, nor, col: cs } = this.m
    for (const p of [a, b, c]) {
      pos.push(p[0] + this.ox, p[1] + this.oy, p[2])
      nor.push(nx, ny, nz)
      cs.push(col[0], col[1], col[2])
    }
  }
  quad(a: V3, b: V3, c: V3, d: V3, col: Rgb) {
    this.tri(a, b, c, col)
    this.tri(a, c, d, col)
  }
  // A vertical face along p -> q (outward to the right of p -> q), from z0 to z1.
  face(p: V2, q: V2, z0: number, z1: number, col: Rgb) {
    this.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], col)
  }
  // A flat face over a counter-clockwise ring at height z, facing up.
  cap(ring: readonly V2[], z: number, col: Rgb) {
    for (const [i, j, k] of triangulate(ring)) this.tri([ring[i]![0], ring[i]![1], z], [ring[j]![0], ring[j]![1], z], [ring[k]![0], ring[k]![1], z], col)
  }
  // An upright block: sides and top (no bottom: never seen from above).
  prism(ring: readonly V2[], z0: number, z1: number, col: Rgb, top: Rgb = col) {
    for (let i = 0; i < ring.length; i++) this.face(ring[i]!, ring[(i + 1) % ring.length]!, z0, z1, col)
    this.cap(ring, z1, top)
  }
}

// A rectangle along p -> q, `depth` to its left (inward of a counter-clockwise ring), as a ring.
const strip = (p: V2, q: V2, depth: number): V2[] => {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
  const lx = (-(q[1] - p[1]) / L) * depth
  const ly = ((q[0] - p[0]) / L) * depth
  return [p, q, [q[0] + lx, q[1] + ly], [p[0] + lx, p[1] + ly]]
}
const lerp2 = (p: V2, q: V2, t: number): V2 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
const len2 = (p: V2, q: V2) => Math.hypot(q[0] - p[0], q[1] - p[1])

// The footprint edge the front is on: the one whose outward side faces the bearing `fr` best (or
// the longest edge when the bearing is unknown). Index of its first corner.
export function frontEdge(ring: readonly V2[], fr: number | null): number {
  let best = 0
  let bestScore = -Infinity
  const fx = fr === null ? 0 : Math.sin((fr * Math.PI) / 180)
  const fy = fr === null ? 0 : Math.cos((fr * Math.PI) / 180)
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    const L = len2(p, q)
    if (L < 0.5) continue
    const score = fr === null ? L : ((q[1] - p[1]) / L) * fx - ((q[0] - p[0]) / L) * fy + Math.min(L, 6) * 0.02
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

// ---- the parts ----

const PARAPET: Record<House['t'], number> = { ih: 0.35, ch: 0.3, mh: 0.9, fl: 1, hb: 1 }

// Sloped tin roofs over the footprint's rectangle: a gable (two planes and two wall-coloured gable
// ends) or hipped (four planes to a short ridge). The planes pass through the wall tops; the eaves
// overhang by `over` and so sit a little lower. Returns the ridge height above the walls.
export function slopedRoof(o: Out, box: Obb, h: number, kind: 'g' | 'h', rise: number, tin: Rgb, wall: Rgb, over = 0.35): number {
  const { a, b } = box
  if (b <= 0.2) return 0
  const rh = Math.min(rise, b * 0.9)
  const k = rh / b
  const A = a + over
  const B = b + over
  const ze = h - k * over
  const zr = h + rh
  const P = (s: number, t: number, z: number): V3 => {
    const p = at(box, s, t)
    return [p[0], p[1], z]
  }
  if (kind === 'g') {
    o.quad(P(-A, 0, zr), P(A, 0, zr), P(A, B, ze), P(-A, B, ze), tin)
    o.quad(P(-A, -B, ze), P(A, -B, ze), P(A, 0, zr), P(-A, 0, zr), shadeOf(tin, 0.97))
    o.tri(P(a, -b, h), P(a, b, h), P(a, 0, zr), wall)
    o.tri(P(-a, b, h), P(-a, -b, h), P(-a, 0, zr), wall)
  } else {
    const r = Math.max(0, a - b)
    if (r > 0.01) {
      o.quad(P(-r, 0, zr), P(r, 0, zr), P(A, B, ze), P(-A, B, ze), tin)
      o.quad(P(-A, -B, ze), P(A, -B, ze), P(r, 0, zr), P(-r, 0, zr), shadeOf(tin, 0.97))
    } else {
      o.tri(P(0, 0, zr), P(A, B, ze), P(-A, B, ze), tin)
      o.tri(P(-A, -B, ze), P(A, -B, ze), P(0, 0, zr), shadeOf(tin, 0.97))
    }
    o.tri(P(A, -B, ze), P(A, B, ze), P(r, 0, zr), shadeOf(tin, 0.94))
    o.tri(P(-A, B, ze), P(-A, -B, ze), P(-r, 0, zr), shadeOf(tin, 0.94))
  }
  return rh
}

// A flat concrete roof: the walls carry on up as a parapet, with its inner side, top and the slab.
export function flatRoof(o: Out, ring: readonly V2[], h: number, parapet: number, wall: Rgb) {
  const inner = inset(ring, 0.2)
  const top = h + parapet
  const lip = shadeOf(wall, 1.04)
  const inside = shadeOf(wall, 0.82)
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length
    const p = ring[i]!
    const q = ring[j]!
    const pi = inner[i]!
    const qi = inner[j]!
    o.face(qi, pi, h, top, inside) // the parapet's inner side, facing in
    o.quad([p[0], p[1], top], [q[0], q[1], top], [qi[0], qi[1], top], [pi[0], pi[1], top], lip)
  }
  o.cap(inner, h, rgb(SLAB))
}

// ---- one house ----

const STOREY_BAND = 0.15 // half height of the darker band at each floor line, m

export function buildHouse(house: House, lod: HouseLod, out: HouseMeshes, ox: number, oy: number) {
  const ring = ccw(house.f)
  if (ring.length < 3 || Math.abs(ringArea(ring)) < 1) return
  const o = new Out(out.solid)
  const g = new Out(out.glass)
  o.ox = g.ox = ox
  o.oy = g.oy = oy
  const { seed, t, fl, rf } = house
  const coral = t === 'ch'
  const wall = rgb(coral ? CORAL[0]! : house.wall)
  const band = shadeOf(wall, 0.84)
  const h = house.h
  const parapet = rf === 'f' ? PARAPET[t] : 0
  const fh = h / fl // storey height
  const front = frontEdge(ring, house.fr)

  // Walls: one face per edge and storey, a darker band at each floor line; coral stone has a plinth
  // and an uneven limewash, edge by edge.
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    const c = coral ? rgb(pick(CORAL, seed, 10 + i)) : wall
    let z = 0
    if (coral) {
      o.face(p, q, 0, 0.45, rgb(CORAL_PLINTH))
      z = 0.45
    }
    for (let k = 1; k < fl; k++) {
      const zb = k * fh
      o.face(p, q, z, zb - STOREY_BAND, c)
      o.face(p, q, zb - STOREY_BAND, zb + STOREY_BAND, band)
      z = zb + STOREY_BAND
    }
    o.face(p, q, z, h + parapet, c)
  }

  // Roof.
  if (rf === 'f') flatRoof(o, ring, h, parapet, wall)
  else slopedRoof(o, obb(ring), h, rf, 1.2 + rand(seed, 1) * 0.6, rgb(pick(TIN, seed, 2)), wall)

  if (lod < 2) return

  // Windows and the door (front edge, ground floor). Glass is its own mesh (lit at night).
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    const L = len2(p, q)
    if (L < 2.2) continue
    const nx = (q[1] - p[1]) / L
    const ny = -(q[0] - p[0]) / L
    const off = (d: number, v: V2): V2 => [v[0] + nx * d, v[1] + ny * d]
    for (let k = 0; k < fl; k++) {
      const z0 = k * fh + Math.min(0.9, fh * 0.3)
      const z1 = k * fh + Math.min(fh - 0.5, 2.1)
      if (z1 - z0 < 0.4) continue
      const lit = rand(seed, 100 + k * 31 + i) < 0.4 ? 1 : 0.3
      const glass: Rgb = [lit, lit, lit]
      // Spans along the edge (fractions) that get glass.
      let spans: [number, number][]
      const m = 0.6 / L
      if (k === 0 && i === front) {
        const dw = (t === 'mh' ? Math.min(L * 0.6, 5) : 1) / L
        const door = t === 'mh' ? SHUTTER : DOOR
        const d0 = 0.5 - dw / 2
        const d1 = 0.5 + dw / 2
        o.face(off(0.05, lerp2(p, q, d0)), off(0.05, lerp2(p, q, d1)), 0, Math.min(fh - 0.3, t === 'mh' ? 2.6 : 2.1), rgb(door))
        spans = [
          [m, d0 - 0.4 / L],
          [d1 + 0.4 / L, 1 - m],
        ].filter(([a, b]) => b - a > 0.6 / L) as [number, number][]
      } else if (coral) {
        const w = Math.min(0.8, L * 0.3) / L
        spans = L > 4.5 ? [[0.3 - w / 2, 0.3 + w / 2], [0.7 - w / 2, 0.7 + w / 2]] : [[0.5 - w / 2, 0.5 + w / 2]]
      } else spans = [[m, 1 - m]]
      // Each span holds evenly spaced windows (at most six), narrower on island houses.
      const most = t === 'ih' || t === 'ch' ? 1.2 : 2.2
      for (const [a, b] of spans) {
        const S = (b - a) * L
        const n = Math.max(1, Math.min(6, Math.round(S / 2.6)))
        const slot = (b - a) / n
        const ww = Math.min(most / L, slot * 0.7)
        for (let j = 0; j < n; j++) {
          const mid = a + slot * (j + 0.5)
          g.face(off(0.04, lerp2(p, q, mid - ww / 2)), off(0.04, lerp2(p, q, mid + ww / 2)), z0, z1, glass)
        }
      }
    }
  }

  // A water tank on the roof of town houses and flats.
  if (rf === 'f' && (t === 'mh' || t === 'fl') && rand(seed, 3) < 0.6) {
    const box = obb(ring)
    if (box.a > 2 && box.b > 1.5) {
      const tank: Obb = { c: at(box, -box.a * 0.45, 0), u: box.u, a: 0.8, b: 0.6 }
      o.prism([at(tank, -0.8, -0.6), at(tank, 0.8, -0.6), at(tank, 0.8, 0.6), at(tank, -0.8, 0.6)], h, h + 1.3, rgb(TANK))
    }
  }

  // Balconies on the front of each upper floor.
  if (house.bc && fl > 1) {
    const p = ring[front]!
    const q = ring[(front + 1) % ring.length]!
    const L = len2(p, q)
    if (L >= 2.5) {
      const w = Math.min(L * 0.6, 6) / L
      const a = lerp2(p, q, 0.5 - w / 2)
      const b = lerp2(p, q, 0.5 + w / 2)
      // The slab sticks out 1 m: a strip on the outside of the edge (b -> a, so it lies outward).
      const slab = strip(b, a, 1)
      const [s0, s1, s2, s3] = slab as [V2, V2, V2, V2]
      for (let k = 1; k < fl; k++) {
        const z = k * fh
        o.prism(slab, z - 0.15, z, rgb(BALCONY))
        // Rail: the outer side and both ends, thin, on the slab's edge.
        o.prism(strip(s2, s3, 0.06), z, z + 1, rgb(RAIL))
        o.prism(strip(s1, s2, 0.06), z, z + 1, rgb(RAIL))
        o.prism(strip(s3, s0, 0.06), z, z + 1, rgb(RAIL))
      }
    }
  }

  // Boundary wall round the yard, with a gate on the road side, and the yard's sand.
  if (house.bw) {
    const box = obb(ring)
    const fx = house.fr === null ? 0 : Math.sin((house.fr * Math.PI) / 180)
    const fy = house.fr === null ? -1 : Math.cos((house.fr * Math.PI) / 180)
    // Which side of the rectangle faces the road: +u, -u, +v or -v.
    const v: V2 = [-box.u[1], box.u[0]]
    const sides: [V2, number, number][] = [
      [box.u, box.a, box.b],
      [[-box.u[0], -box.u[1]], box.a, box.b],
      [v, box.b, box.a],
      [[-v[0], -v[1]], box.b, box.a],
    ]
    let [sn, hs, ht] = sides[0]!
    let bestDot = -Infinity
    for (const [n, s, tt] of sides) {
      const d = n[0] * fx + n[1] * fy
      if (d > bestDot) {
        bestDot = d
        sn = n
        hs = s
        ht = tt
      }
    }
    const tn: V2 = [-sn[1], sn[0]]
    const P = (s: number, tt: number): V2 => [box.c[0] + sn[0] * s + tn[0] * tt, box.c[1] + sn[1] * s + tn[1] * tt]
    const s0 = -hs - Math.max(0.6, Math.min(house.yd, 12))
    const s1 = hs + 1
    const t0 = -ht - 0.45
    const t1 = ht + 0.45
    const plot: V2[] = [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)]
    o.cap(plot, 0.03, rgb(YARD))
    const H = 1.8
    const T = 0.15
    const col = rand(seed, 4) < 0.7 ? rgb(BOUNDARY) : shadeOf(wall, 0.97)
    const top = shadeOf(col, 0.9)
    const gw = Math.min(1.2, (t1 - t0) * 0.4) / 2
    const gate0 = P(s1, -gw)
    const gate1 = P(s1, gw)
    // Counter-clockwise: the side wall, the front in two parts either side of the gate, the other
    // side, the back. Each a thin block on the inside of the plot line.
    const segs: [V2, V2][] = [
      [plot[0]!, plot[1]!],
      [plot[1]!, gate0],
      [gate1, plot[2]!],
      [plot[2]!, plot[3]!],
      [plot[3]!, plot[0]!],
    ]
    for (const [a, b] of segs) if (len2(a, b) > 0.05) o.prism(strip(a, b, T), 0, H, col, top)
    o.prism(strip(gate0, gate1, T * 0.4), 0, H - 0.2, rgb(pick(GATES, seed, 5)))
  }
}

// All the houses of a tile, each at its place from the tile's origin (metres east, north).
export function buildHouses(list: readonly { house: House; x: number; y: number }[], lod: HouseLod): HouseMeshes {
  const out: HouseMeshes = { solid: newMesh(), glass: newMesh() }
  for (const { house, x, y } of list) buildHouse(house, lod, out, x, y)
  return out
}
