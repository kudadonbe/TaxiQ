import { describe, expect, it } from 'vitest'
import { inLane, isTwoWay, LANE_OFFSET_M, toTheLeft, twoWayBetween } from './lanes'
import type { RoadGraph } from './route'

const m = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180))

describe('keep left (Maldives)', () => {
  it('a car driving north is moved west (to its left); driving east, moved north', () => {
    const [lat, lng] = toTheLeft(4.17, 73.5, 0)
    expect(lng).toBeLessThan(73.5)
    expect(lat).toBeCloseTo(4.17, 9)
    const [lat2] = toTheLeft(4.17, 73.5, 90)
    expect(lat2).toBeGreaterThan(4.17)
  })
  it('moves by the lane offset, not more', () => {
    expect(m([4.17, 73.5], toTheLeft(4.17, 73.5, 37))).toBeCloseTo(LANE_OFFSET_M, 3)
  })
  it('cars going opposite ways on a two-way road end up on opposite sides', () => {
    const north = toTheLeft(4.17, 73.5, 0)
    const south = toTheLeft(4.17, 73.5, 180)
    expect(north[1]).toBeLessThan(73.5)
    expect(south[1]).toBeGreaterThan(73.5)
  })
  it('one-way roads: keep to the middle', () => {
    expect(inLane(4.17, 73.5, 0, false)).toEqual([4.17, 73.5])
  })
  it('knows two-way from one-way roads', () => {
    const g: RoadGraph = { nodes: [[4.17, 73.5], [4.171, 73.5], [4.172, 73.5]], next: [[1], [0, 2], []] }
    expect(isTwoWay(g, 0, 1)).toBe(true)
    expect(isTwoWay(g, 1, 2)).toBe(false) // one-way 1 -> 2
    expect(twoWayBetween(g, [4.171, 73.5], [4.172, 73.5])).toBe(false)
    expect(twoWayBetween(g, [4.1705, 73.5], [4.171, 73.5])).toBe(true) // a house, not a junction
  })
})
