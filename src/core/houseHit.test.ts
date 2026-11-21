import { describe, expect, it } from 'vitest'
import { frontShape, hiddenBy, houseContains, houseRing, inRing, metresFrom, placeIn, prismFront, ringMiddle, type Pt } from './houseHit'
import type { House } from './houseTiles'

const house = (at: [number, number], f: [number, number][], extra: Partial<House> = {}): House => ({ at, seed: 1, t: 'ih', fl: 1, rf: 'f', wall: '#ffffff', bw: false, yd: 0, bc: false, h: 3, fr: null, f, ...extra })
const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

describe('inRing', () => {
  it('finds points inside and outside, either winding', () => {
    const r = square(0, 0, 10, 10)
    expect(inRing([5, 5], r)).toBe(true)
    expect(inRing([11, 5], r)).toBe(false)
    expect(inRing([5, 5], [...r].reverse())).toBe(true)
  })
  it('handles a concave L shape', () => {
    const l: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ]
    expect(inRing([2, 8], l)).toBe(true)
    expect(inRing([8, 8], l)).toBe(false)
  })
})

describe('house footprints', () => {
  const at: [number, number] = [6.621, 73.0727]
  const h = house(at, square(-5, -4, 5, 4))
  it('contains a point a few metres from its middle, not one beyond its wall', () => {
    expect(houseContains(h, [at[0] + 3 / 110_574, at[1]])).toBe(true)
    expect(houseContains(h, [at[0] + 6 / 110_574, at[1]])).toBe(false)
  })
  it('turns the footprint into lat, lng corners that come back to the same metres', () => {
    const ring = houseRing(h)
    const back = metresFrom(at, ring[2]!)
    expect(back[0]).toBeCloseTo(5, 5)
    expect(back[1]).toBeCloseTo(4, 5)
    const mid = ringMiddle(ring)
    expect(mid[0]).toBeCloseTo(at[0], 9)
    expect(mid[1]).toBeCloseTo(at[1], 9)
  })
})

describe('prismFront (the tap ray through a shape)', () => {
  const ring = square(100, 100, 140, 120) // on screen: x 100-140, y 100-120 (ground outline)
  it('flat: a plain point-in-outline test, depth at the tap', () => {
    expect(prismFront(ring, [120, 110], 0)).toBe(110)
    expect(prismFront(ring, [120, 90], 0)).toBeNull()
  })
  it('tilted: a tap above the outline hits the walls or roof when the shape is tall enough', () => {
    // 30 px above the ground outline: missed by a 20 px tall house, hit by a 40 px tall one.
    expect(prismFront(ring, [120, 70], 20)).toBeNull()
    expect(prismFront(ring, [120, 70], 40)).toBe(110)
    // Where the ray goes through the whole shape it first enters at the front (bottom) edge.
    expect(prismFront(ring, [120, 95], 100)).toBe(120)
  })
  it('misses beside the shape', () => {
    expect(prismFront(ring, [150, 110], 100)).toBeNull()
  })
})

describe('frontShape and hiddenBy', () => {
  const back = { item: 'back', ring: square(100, 100, 140, 120), lift: 60 }
  const front = { item: 'front', ring: square(100, 140, 140, 160), lift: 10 }
  it('picks the shape nearest the camera on the ray', () => {
    // At y 105: the back house is hit at ground level; the front one is only 10 px tall, 35 px down.
    expect(frontShape([back, front], [120, 105])?.item).toBe('back')
    // At y 135, the front house's roof (10 px over its outline at 140) is hit, and it is nearer:
    // the ray runs to ground y 145, inside the front house from 140.
    expect(frontShape([back, front], [120, 135])).toEqual({ item: 'front', depth: 145 })
    expect(frontShape([back, front], [10, 10])).toBeNull()
  })
  it('a figure behind the house on the ray is hidden; one in front of it is not', () => {
    // The tap is on the tall house's walls (ray enters it at ground y 120).
    const hit = frontShape([back], [120, 80])
    expect(hit?.depth).toBe(120)
    expect(hiddenBy(95, hit)).toBe(true) // standing behind the house (further up the screen)
    expect(hiddenBy(130, hit)).toBe(false) // standing in the street in front of it
    expect(hiddenBy(95, null)).toBe(false)
  })
})

describe('placeIn (the name of a tapped shape)', () => {
  const at: [number, number] = [6.621, 73.0727]
  const dLat = (m: number) => m / 110_574
  const ring = houseRing(house(at, square(-6, -6, 6, 6)))
  const p = (t: string, e: string, north: number) => ({ t, e, p: [[at[0] + dLat(north), at[1]]] as [number, number][] })
  it('prefers a house inside, then a landmark, then a plot', () => {
    const list = [p('p', 'Plot', 0), p('l', 'Shop', 1), p('h', 'Highlightvilla', 4), p('r', 'Road', 0)]
    expect(placeIn(list, ring, at)?.e).toBe('Highlightvilla')
    expect(placeIn(list.slice(0, 2), ring, at)?.e).toBe('Shop')
  })
  it('falls back to the nearest named point just outside, within the reach', () => {
    expect(placeIn([p('h', 'Next door', 10)], ring, at)?.e).toBe('Next door')
    expect(placeIn([p('h', 'Far', 20)], ring, at)).toBeNull()
    expect(placeIn([p('r', 'Road', 0)], ring, at)).toBeNull()
  })
})
