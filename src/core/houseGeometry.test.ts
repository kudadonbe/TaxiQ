import { describe, expect, it } from 'vitest'
import type { House } from './houseTiles'
import { buildHouse, ccw, flatRoof, frontEdge, inset, newMesh, obb, Out, ringArea, rgb, slopedRoof, triangulate, triCount, type HouseMeshes, type MeshData, type V2 } from './houseGeometry'

const rect = (w: number, l: number): V2[] => [
  [-w / 2, -l / 2],
  [w / 2, -l / 2],
  [w / 2, l / 2],
  [-w / 2, l / 2],
]
const house = (over: Partial<House> = {}): House => ({ at: [6.62, 73.07], seed: 1234, t: 'ih', fl: 1, rf: 'g', wall: '#f7f4ec', bw: false, yd: 4, bc: false, h: 3, fr: 0, f: rect(8, 10), ...over })
const build = (h: House, lod: 1 | 2 = 1): HouseMeshes => {
  const m: HouseMeshes = { solid: newMesh(), glass: newMesh() }
  buildHouse(h, lod, m, 0, 0)
  return m
}
// Every triangle's normal (from the stored normals) and its middle.
function tris(m: MeshData) {
  const out: { n: number[]; c: number[] }[] = []
  for (let i = 0; i < m.pos.length; i += 9) {
    out.push({ n: m.nor.slice(i, i + 3), c: [0, 1, 2].map((k) => (m.pos[i + k]! + m.pos[i + 3 + k]! + m.pos[i + 6 + k]!) / 3) })
  }
  return out
}
const area3 = (m: MeshData) => {
  let a = 0
  for (let i = 0; i < m.pos.length; i += 9) {
    const [ax, ay, , bx, by, , cx, cy] = m.pos.slice(i, i + 9) as number[]
    a += Math.abs((bx! - ax!) * (cy! - ay!) - (by! - ay!) * (cx! - ax!)) / 2
  }
  return a
}

describe('rings', () => {
  it('ccw turns a clockwise ring round and drops a closing point', () => {
    const r = ccw([[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]])
    expect(r).toHaveLength(4)
    expect(ringArea(r)).toBeGreaterThan(0)
  })
  it('triangulates an L-shaped footprint into n - 2 triangles covering its area', () => {
    const L: V2[] = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]]
    const t = triangulate(L)
    expect(t).toHaveLength(4)
    const sum = t.reduce((s, [i, j, k]) => s + ringArea([L[i]!, L[j]!, L[k]!]), 0)
    expect(sum).toBeCloseTo(27, 6)
    expect(t.every(([i, j, k]) => ringArea([L[i]!, L[j]!, L[k]!]) > 0)).toBe(true)
  })
  it('the smallest rectangle round a turned rectangle has its long side first', () => {
    const a = Math.PI / 6
    const r = rect(4, 10).map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a) + 5, x * Math.sin(a) + y * Math.cos(a) - 2] as V2)
    const b = obb(r)
    expect(b.a).toBeCloseTo(5, 6)
    expect(b.b).toBeCloseTo(2, 6)
    expect(b.c[0]).toBeCloseTo(5, 6)
    expect(b.c[1]).toBeCloseTo(-2, 6)
    expect(Math.abs(b.u[0] * -Math.sin(a) + b.u[1] * Math.cos(a))).toBeCloseTo(1, 6) // along the 10 m side
  })
  it('inset moves every side in by the same amount', () => {
    const r = inset(rect(10, 6), 0.5)
    expect(r[0]![0]).toBeCloseTo(-4.5)
    expect(r[0]![1]).toBeCloseTo(-2.5)
    expect(ringArea(r)).toBeCloseTo(9 * 5)
  })
  it('the front edge faces the bearing the house faces', () => {
    const r = rect(8, 10) // edges: 0 south, 1 east, 2 north, 3 west
    expect(frontEdge(r, 180)).toBe(0)
    expect(frontEdge(r, 90)).toBe(1)
    expect(frontEdge(r, 10)).toBe(2)
    expect(frontEdge(r, 265)).toBe(3)
    expect(frontEdge(rect(4, 12), null)).toBe(1) // unknown: the longest
  })
})

describe('roofs', () => {
  const box = obb(rect(6, 10)) // long axis north-south: a = 5, b = 3
  it('a gable: two slopes up to the ridge and two gable ends, the slopes facing up', () => {
    const m = newMesh()
    const rh = slopedRoof(new Out(m), box, 3, 'g', 1.5, rgb('#9aa1a6'), rgb('#ffffff'))
    expect(rh).toBe(1.5)
    expect(triCount(m)).toBe(6)
    const ts = tris(m)
    const slopes = ts.filter((t) => t.n[2]! > 0.1)
    expect(slopes).toHaveLength(4)
    const ends = ts.filter((t) => Math.abs(t.n[2]!) < 1e-6)
    expect(ends).toHaveLength(2)
    // Ridge at 4.5 m; eaves 0.35 m out and lower than the wall top.
    const zs = m.pos.filter((_, i) => i % 3 === 2)
    expect(Math.max(...zs)).toBeCloseTo(4.5)
    expect(Math.min(...zs)).toBeCloseTo(3 - 0.5 * 0.35)
    // The roof covers the walls plus the overhang (in plan).
    expect(area3(m)).toBeGreaterThan(6 * 10)
    // Each slope faces away from the ridge.
    for (const t of slopes) expect(Math.sign(t.n[0]!)).toBe(Math.sign(t.c[0]!))
  })
  it('a hipped roof: four planes, all facing up and outward', () => {
    const m = newMesh()
    slopedRoof(new Out(m), box, 3, 'h', 1.5, rgb('#9aa1a6'), rgb('#ffffff'))
    const ts = tris(m)
    expect(ts).toHaveLength(6)
    for (const t of ts) {
      expect(t.n[2]!).toBeGreaterThan(0.1)
      expect(t.n[0]! * t.c[0]! + t.n[1]! * t.c[1]!).toBeGreaterThan(0)
    }
  })
  it('a hipped roof on a square house is a pyramid', () => {
    const m = newMesh()
    slopedRoof(new Out(m), obb(rect(6, 6)), 3, 'h', 1.5, rgb('#9aa1a6'), rgb('#ffffff'))
    expect(triCount(m)).toBe(4)
  })
  it('a narrow house gets a lower ridge (no steeper than the cap)', () => {
    const m = newMesh()
    expect(slopedRoof(new Out(m), obb(rect(1.6, 6)), 3, 'g', 1.8, rgb('#9aa1a6'), rgb('#ffffff'))).toBeCloseTo(0.72)
  })
  it('a flat roof: parapet inside, top and the slab, all inside the footprint', () => {
    const m = newMesh()
    flatRoof(new Out(m), rect(8, 10), 6, 0.9, rgb('#f7f4ec'))
    const ts = tris(m)
    const up = ts.filter((t) => t.n[2]! > 0.99)
    expect(up.length).toBe(4 * 2 + 2) // four lips and the slab
    for (const t of ts) {
      expect(Math.abs(t.c[0]!)).toBeLessThanOrEqual(4)
      expect(Math.abs(t.c[1]!)).toBeLessThanOrEqual(5)
    }
    // Inner sides face the middle.
    for (const t of ts.filter((x) => Math.abs(x.n[2]!) < 1e-6)) expect(t.n[0]! * t.c[0]! + t.n[1]! * t.c[1]!).toBeLessThan(0)
  })
})

describe('a whole house', () => {
  it('walls face out, with a band at every floor line', () => {
    const m = build(house({ rf: 'f', fl: 3, h: 9.6, t: 'mh', bw: false }))
    const walls = tris(m.solid).filter((t) => Math.abs(t.n[2]!) < 1e-6 && (Math.abs(t.c[0]!) > 3.99 || Math.abs(t.c[1]!) > 4.99))
    for (const t of walls) expect(t.n[0]! * t.c[0]! + t.n[1]! * t.c[1]!).toBeGreaterThan(0)
    // 4 edges x (3 storeys + 2 bands) faces x 2 triangles
    expect(walls.length).toBe(4 * 5 * 2)
  })
  it('close up adds a boundary wall with a gate gap on the front (the road side)', () => {
    const near = build(house({ bw: true, fr: 0 }), 2)
    const far = build(house({ bw: true, fr: 0 }), 1)
    expect(triCount(near.solid)).toBeGreaterThan(triCount(far.solid) + 40)
    // Nothing of the boundary wall stands in the gate gap (north side, middle).
    const wallBits = tris(near.solid).filter((t) => t.c[2]! > 0.1 && t.c[2]! < 1.8 && t.c[1]! > 5.5)
    const inGap = wallBits.filter((t) => Math.abs(t.c[0]!) < 0.5)
    expect(wallBits.length).toBeGreaterThan(0)
    // Only the gate panel is there (its colour is not the wall's).
    for (const t of inGap) expect(Math.abs(t.c[0]!)).toBeLessThan(0.61)
  })
  it('balconies on each upper floor, on the front', () => {
    const plain = build(house({ rf: 'f', fl: 4, h: 12.8, t: 'mh', bc: false, fr: 90 }), 2)
    const bal = build(house({ rf: 'f', fl: 4, h: 12.8, t: 'mh', bc: true, fr: 90 }), 2)
    expect(triCount(bal.solid)).toBeGreaterThan(triCount(plain.solid))
    const extra = tris(bal.solid).filter((t) => t.c[0]! > 4.05) // sticking out to the east (the front)
    expect(extra.length).toBeGreaterThan(0)
    expect(Math.max(...extra.map((t) => t.c[0]!))).toBeLessThanOrEqual(5.01)
  })
  it('windows go to the glass mesh only close up', () => {
    expect(triCount(build(house(), 1).glass)).toBe(0)
    expect(triCount(build(house(), 2).glass)).toBeGreaterThan(0)
  })
  it('a typical island house stays cheap', () => {
    expect(triCount(build(house(), 1).solid)).toBeLessThanOrEqual(20)
    const n = build(house({ bw: true }), 2)
    expect(triCount(n.solid) + triCount(n.glass)).toBeLessThanOrEqual(110)
  })
  it('the same house builds the same triangles (repeatable looks)', () => {
    expect(build(house({ bw: true }), 2)).toEqual(build(house({ bw: true }), 2))
  })
  it('skips a footprint with no area', () => {
    expect(triCount(build(house({ f: [[0, 0], [1, 0], [2, 0]] })).solid)).toBe(0)
  })
})
