import { describe, expect, it } from 'vitest'
import type { RoadGraph } from './route'
import { alongRoad, roadAhead, snapParked, snapToRoad } from './snap'

// An L-shaped road: west-east along lat 4.17, then north at lng 73.502.
const g: RoadGraph = {
  nodes: [
    [4.17, 73.5],
    [4.17, 73.502],
    [4.172, 73.502],
  ],
  next: [[1], [0, 2], [1]],
}

describe('keep vehicles on the road', () => {
  it('a fix on a building beside the road moves onto the road', () => {
    const s = snapToRoad(g, [4.1702, 73.501])! // ~22 m north of the road
    expect(s.at[0]).toBeCloseTo(4.17, 6)
    expect(s.at[1]).toBeCloseTo(73.501, 6)
    expect(s.dist).toBeGreaterThan(15)
    expect(s.dist).toBeLessThan(30)
  })
  it('picks the nearest road stretch', () => {
    const s = snapToRoad(g, [4.171, 73.5021])!
    expect(s.at[1]).toBeCloseTo(73.502, 6) // the north-going road
  })
  it('a parked vehicle lines up with the road, facing the way closest to how it was going', () => {
    const s = snapToRoad(g, [4.1702, 73.501])! // on the west-east road
    expect(alongRoad(g, s, 0)).toBeCloseTo(90, 0) // was pointing north: east is closer than west? both 90 off; picks east
    expect(alongRoad(g, s, 250)).toBeCloseTo(270, 0) // was going roughly west: faces west
    expect(alongRoad(g, s, 80)).toBeCloseTo(90, 0)
  })
  it('predicts the road ahead, the way the vehicle is facing', () => {
    const s = snapToRoad(g, [4.17, 73.5005])! // on the west-east road, facing east
    const ahead = roadAhead(g, s, 90, 400)
    expect(ahead[1]).toEqual([4.17, 73.502]) // to the corner
    expect(ahead[2]).toEqual([4.172, 73.502]) // then the only way on: north
  })
  it('a parked vehicle prefers a parking aisle nearby over the main road', () => {
    // Main road west-east, and a parking aisle (10 km/h) 15 m north of it.
    const lot: RoadGraph = {
      nodes: [[4.17, 73.5], [4.17, 73.502], [4.17 + 15 / 111_320, 73.5005], [4.17 + 15 / 111_320, 73.5015]],
      next: [[1], [0], [3], [2]],
      limit: [[40], [40], [10], [10]],
    }
    const p: [number, number] = [4.17 + 5 / 111_320, 73.501] // 5 m from the road, 10 m from the aisle
    expect(snapToRoad(lot, p)!.at[0]).toBeCloseTo(4.17, 7)
    expect(snapParked(lot, p)!.at[0]).toBeCloseTo(4.17 + 15 / 111_320, 7)
  })
  it('no road near (e.g. roads not loaded there): keep the fix', () => {
    expect(snapToRoad(g, [4.2, 73.6])).toBeNull()
    expect(snapToRoad({ nodes: [], next: [] }, [4.17, 73.5])).toBeNull()
  })
})
