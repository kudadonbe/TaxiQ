import { describe, expect, it } from 'vitest'
import { buildGraph, coarse, graphFromLines, onewayOf, overpassQuery } from './osmRoads'

const node = (id: number, lat: number, lon: number) => ({ type: 'node', id, lat, lon })

describe('road graph from OpenStreetMap', () => {
  const json = {
    elements: [
      // A road of 4 nodes with a branch, and a separate tiny road far away.
      ...[1, 2, 3, 4].map((i) => node(i, 4.17 + i * 0.001, 73.5)),
      node(5, 4.172, 73.501),
      node(8, 4.2, 73.6),
      node(9, 4.201, 73.6),
      { type: 'way', id: 100, nodes: [1, 2, 3, 4] },
      { type: 'way', id: 101, nodes: [2, 5] },
      { type: 'way', id: 102, nodes: [8, 9] },
    ],
  }
  it('builds a two-way graph and keeps only the largest connected part', () => {
    const g = buildGraph(json, 2)!
    expect(g.nodes).toHaveLength(5)
    for (let i = 0; i < g.nodes.length; i++) for (const j of g.next[i]!) expect(g.next[j]).toContain(i)
    expect(g.next.every((n) => n.length > 0)).toBe(true)
  })
  it('gives up when there is too little road', () => {
    expect(buildGraph(json, 20)).toBeNull()
    expect(buildGraph({}, 1)).toBeNull()
  })
  it('builds a graph from vector-tile road lines, joining lines cut at a tile edge', () => {
    // One road cut in two at a tile edge (the cut point repeats in both pieces), and a side road.
    const lines = [
      { coords: [[73.5, 4.17], [73.501, 4.17]] },
      { coords: [[73.501, 4.170000001], [73.502, 4.17]] },
      { coords: [[73.501, 4.17], [73.501, 4.171]] },
    ]
    const g = graphFromLines(lines, 2)!
    expect(g.nodes).toHaveLength(4)
    expect(g.next.find((n) => n.length === 3)).toBeTruthy() // the junction joins all three
  })
  it('follows one-way streets, and drops one-way spurs a car could not leave', () => {
    // A square block: three two-way sides and one one-way side (A -> B), plus a one-way spur out of C.
    const A = [73.5, 4.17]
    const B = [73.501, 4.17]
    const C = [73.501, 4.171]
    const D = [73.5, 4.171]
    const E = [73.502, 4.172]
    const g = graphFromLines([{ coords: [A, B], oneway: 1 }, { coords: [B, C] }, { coords: [C, D] }, { coords: [D, A] }, { coords: [C, E], oneway: 1 }], 2)!
    expect(g.nodes).toHaveLength(4) // E is gone
    const at = (p: number[]) => g.nodes.findIndex((n) => n[0] === p[1] && n[1] === p[0])
    expect(g.next[at(A)]).toContain(at(B))
    expect(g.next[at(B)]).not.toContain(at(A)) // no driving the wrong way
  })
  it('joins a side road that ends on a main road with no shared point (simplified tiles)', () => {
    // Main road A-B (two-way) with no point in the middle; side road C-M ends on it at M.
    const g = graphFromLines([{ coords: [[73.5, 4.17], [73.502, 4.17]] }, { coords: [[73.501, 4.171], [73.501, 4.17]] }], 2)!
    expect(g.nodes).toHaveLength(4) // A, B, C and the new junction M
    expect(g.next.some((n) => n.length === 3)).toBe(true)
  })
  it('joins two roads that cross with no shared point', () => {
    const g = graphFromLines([{ coords: [[73.5, 4.17], [73.502, 4.172]] }, { coords: [[73.5, 4.172], [73.502, 4.17]] }], 2)!
    expect(g.nodes).toHaveLength(5)
    expect(g.next.some((n) => n.length === 4)).toBe(true)
  })
  it('reads one-way tags like OpenStreetMap does', () => {
    expect(onewayOf({ oneway: 'yes' })).toBe(1)
    expect(onewayOf({ oneway: '-1' })).toBe(-1)
    expect(onewayOf({ junction: 'roundabout' })).toBe(1)
    expect(onewayOf({ highway: 'residential' })).toBe(0)
  })
  it('sends only a rounded position (about 1 km)', () => {
    expect(coarse(4.175432)).toBe(4.18)
    expect(overpassQuery(coarse(4.175432), coarse(73.50912), 2000)).toContain('around:2000,4.1800,73.5100')
  })
})
