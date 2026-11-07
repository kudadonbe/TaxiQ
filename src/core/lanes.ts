// Keep left, as in the Maldives: on a two-way road a car drives in the left half (the road's edge on
// its left, the middle of the road on its right), so cars going opposite ways pass side by side. On a
// one-way road it keeps to the middle. Used for simulated cars (demo taxis, the game); real GPS
// positions are never moved. Pure functions.

import type { RoadGraph } from './route'

export const LANE_OFFSET_M = 1.8 // from the middle of the road to the middle of the left lane

const indexCache = new WeakMap<RoadGraph, Map<string, number>>()
const key = (p: readonly [number, number]) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`
function nodeIndex(g: RoadGraph) {
  let m = indexCache.get(g)
  if (!m) {
    m = new Map(g.nodes.map((n, i) => [key(n), i]))
    indexCache.set(g, m)
  }
  return m
}

// Is the road from node i to node j two-way (there is also a road back from j to i)?
export const isTwoWay = (g: RoadGraph, i: number, j: number) => (g.next[j] ?? []).includes(i)

// The same, for a stretch given by its end points. Points that aren't road junctions (a house at
// the start or end of a trip) count as two-way.
export function twoWayBetween(g: RoadGraph, a: readonly [number, number], b: readonly [number, number]) {
  const idx = nodeIndex(g)
  const i = idx.get(key(a))
  const j = idx.get(key(b))
  return i === undefined || j === undefined ? true : isTwoWay(g, i, j)
}

// Move a point `offset` metres to the left of a car driving at `heading` (degrees clockwise from north).
export function toTheLeft(lat: number, lng: number, heading: number, offset = LANE_OFFSET_M): [number, number] {
  const left = ((heading - 90) * Math.PI) / 180 // the direction to the car's left
  const dNorth = Math.cos(left) * offset
  const dEast = Math.sin(left) * offset
  return [lat + dNorth / 111_320, lng + dEast / (111_320 * Math.cos((lat * Math.PI) / 180))]
}

// Where a car is drawn: in the left lane on two-way roads, in the middle on one-way roads.
export function inLane(lat: number, lng: number, heading: number, twoWay: boolean): [number, number] {
  return twoWay ? toTheLeft(lat, lng, heading) : [lat, lng]
}
