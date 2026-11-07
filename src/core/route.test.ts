import { describe, expect, it } from 'vitest'
import { metres, nearestNode, route, SPEED, type RoadGraph } from './route'

// A small square of roads, 0 -> 1 -> 2 -> 3 -> 0 one-way (clockwise), plus a two-way diagonal 0-2.
//   3 ---- 2
//   |    / |
//   0 ---- 1
const g: RoadGraph = {
  nodes: [
    [6.62, 73.07],
    [6.62, 73.071],
    [6.621, 73.071],
    [6.621, 73.07],
  ],
  next: [[1, 2], [2], [3, 0], [0]],
}

describe('road routing', () => {
  it('snaps points to the nearest road node', () => {
    expect(nearestNode(g, [6.62001, 73.07099])).toBe(1)
  })
  it('takes the shortest legal taxi route', () => {
    const r = route(g, g.nodes[0]!, g.nodes[2]!, 'taxi')!
    expect(r.path.slice(1, -1)).toEqual([g.nodes[0], g.nodes[2]]) // the diagonal
  })
  it('follows one-way streets for taxis', () => {
    // 1 -> 0 is against the one-way: the taxi must go 1 -> 2 -> 0 (diagonal back).
    const r = route(g, g.nodes[1]!, g.nodes[0]!, 'taxi')!
    expect(r.path.slice(1, -1)).toEqual([g.nodes[1], g.nodes[2], g.nodes[0]])
  })
  it('lets people walk either way', () => {
    const r = route(g, g.nodes[1]!, g.nodes[0]!, 'walk')!
    expect(r.path.slice(1, -1)).toEqual([g.nodes[1], g.nodes[0]])
  })
  it('gives distance and time by travel mode', () => {
    const r = route(g, g.nodes[1]!, g.nodes[0]!, 'walk')!
    expect(r.metres).toBeCloseTo(metres(g.nodes[1]!, g.nodes[0]!), 6)
    expect(r.seconds).toBeCloseTo(r.metres / SPEED.walk, 6)
  })
  it('joins the road at the nearest point on it, not the nearest junction (never across a block)', () => {
    // A house 10 m north of the middle of road 0-1, going to a house beside the middle of 1-2.
    const house: [number, number] = [6.62 + 10 / 111_320, 73.0705]
    const shop: [number, number] = [6.6205, 73.071 - 10 / 111_320]
    const r = route(g, house, shop, 'walk')!
    expect(r.path[1]![0]).toBeCloseTo(6.62, 7) // onto road 0-1, straight down from the house
    expect(r.path[1]![1]).toBeCloseTo(73.0705, 7)
    expect(r.path[2]).toEqual(g.nodes[1]) // along it to the corner
    expect(r.path[3]![1]).toBeCloseTo(73.071, 7) // then up road 1-2 to beside the shop
    expect(r.metres).toBeLessThan(10 + 55.3 + 55.3 + 10 + 1)
  })
  it('follows the stretch it is on when both ends are on the same road', () => {
    const a: [number, number] = [6.62 + 5 / 111_320, 73.0702]
    const b: [number, number] = [6.62 + 5 / 111_320, 73.0708]
    const r = route(g, a, b, 'taxi')! // 0 -> 1 is the way of the one-way
    expect(r.path.length).toBe(4) // the house, the road beside it, the road beside the other, the other
    expect(() => route(g, b, a, 'taxi')).not.toThrow() // against it: round the block
    expect(route(g, b, a, 'taxi')!.metres).toBeGreaterThan(r.metres + 50)
  })
  it('returns null when the roads do not connect', () => {
    const island: RoadGraph = { nodes: [...g.nodes, [6.7, 73.2]], next: [...g.next, []] }
    expect(route(island, g.nodes[0]!, [6.7, 73.2], 'taxi')).toBeNull()
  })
})

describe('on the real Kulhudhuffushi road graph', () => {
  it('routes Rome (plot 117) to the Regional Hospital along the roads', async () => {
    const roads = (await import('../data/roads.json')).default as { n: [number, number][]; a: number[][] }
    const real: RoadGraph = { nodes: roads.n, next: roads.a }
    const rome: [number, number] = [6.618076, 73.069481]
    const hospital: [number, number] = [6.6236, 73.0667]
    const straight = metres(rome, hospital)
    const taxi = route(real, rome, hospital, 'taxi')!
    const walk = route(real, rome, hospital, 'walk')!
    expect(taxi.path.length).toBeGreaterThan(3)
    expect(taxi.metres).toBeGreaterThan(straight)
    expect(taxi.metres).toBeLessThan(straight * 2.5)
    expect(walk.metres).toBeLessThanOrEqual(taxi.metres + 1e-6)
    expect(taxi.seconds).toBeLessThan(walk.seconds)
  })
})
