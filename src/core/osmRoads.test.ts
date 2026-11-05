import { describe, expect, it } from 'vitest'
import { buildGraph, coarse, gridAround, overpassQuery } from './osmRoads'

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
  it('falls back to a street grid around the point', () => {
    const g = gridAround(4.17, 73.51)
    expect(g.nodes).toHaveLength(81)
    expect(g.next.every((n) => n.length >= 2)).toBe(true)
    const lats = g.nodes.map((n) => n[0])
    expect((Math.min(...lats) + Math.max(...lats)) / 2).toBeCloseTo(4.17, 6)
  })
  it('sends only a rounded position (about 1 km)', () => {
    expect(coarse(4.175432)).toBe(4.18)
    expect(overpassQuery(coarse(4.175432), coarse(73.50912), 2000)).toContain('around:2000,4.1800,73.5100')
  })
})
