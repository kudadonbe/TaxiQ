import { describe, expect, it } from 'vitest'
import type { RoadGraph } from './route'
import { alongRoad, snapToRoad } from './snap'

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
  it('no road near (e.g. roads not loaded there): keep the fix', () => {
    expect(snapToRoad(g, [4.2, 73.6])).toBeNull()
    expect(snapToRoad({ nodes: [], next: [] }, [4.17, 73.5])).toBeNull()
  })
})
