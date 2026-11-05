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
