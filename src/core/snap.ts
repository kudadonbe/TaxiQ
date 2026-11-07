// Keep vehicles on the road: a GPS fix can land on a building, a park or the sea; move it to the
// nearest point on a road (the road data includes service roads and parking aisles, so a parked
// vehicle sits where a vehicle can be). Pure functions, with a grid index so it's fast on big maps.

import type { RoadGraph } from './route'

export interface Snapped {
  at: [number, number] // the nearest point on a road
  i: number // the road stretch: from node i ...
  j: number // ... to node j
  dist: number // metres from the GPS fix
}

const CELL_M = 60
const caches = new WeakMap<RoadGraph, { cells: Map<string, [number, number][]>; cell: number }>()

function index(g: RoadGraph) {
  let c = caches.get(g)
  if (c) return c
  const cell = CELL_M / 111_320
  const cells = new Map<string, [number, number][]>()
  const add = (k: string, e: [number, number]) => {
    const list = cells.get(k)
    if (list) list.push(e)
    else cells.set(k, [e])
  }
  for (let i = 0; i < g.nodes.length; i++) {
    for (const j of g.next[i] ?? []) {
      if (j < i && (g.next[j] ?? []).includes(i)) continue // two-way: index once
      const a = g.nodes[i]!
      const b = g.nodes[j]!
      const y0 = Math.floor(Math.min(a[0], b[0]) / cell)
      const y1 = Math.floor(Math.max(a[0], b[0]) / cell)
      const x0 = Math.floor(Math.min(a[1], b[1]) / cell)
      const x1 = Math.floor(Math.max(a[1], b[1]) / cell)
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) add(`${y},${x}`, [i, j])
    }
  }
  c = { cells, cell }
  caches.set(g, c)
  return c
}

// The nearest point on a road within `maxM` metres, or null (no road near: keep the fix).
export function snapToRoad(g: RoadGraph, p: readonly [number, number], maxM = 150): Snapped | null {
  if (!g.nodes.length) return null
  const { cells, cell } = index(g)
  const k = Math.cos((p[0] * Math.PI) / 180)
  const toXY = (q: readonly [number, number]) => [(q[1] - p[1]) * 111_320 * k, (q[0] - p[0]) * 111_320] as const
  const reach = Math.ceil(maxM / CELL_M)
  const cy = Math.floor(p[0] / cell)
  const cx = Math.floor(p[1] / cell)
  let best: Snapped | null = null
  const seen = new Set<string>()
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      for (const [i, j] of cells.get(`${cy + dy},${cx + dx}`) ?? []) {
        const id = `${i}-${j}`
        if (seen.has(id)) continue
        seen.add(id)
        const [ax, ay] = toXY(g.nodes[i]!)
        const [bx, by] = toXY(g.nodes[j]!)
        const vx = bx - ax
        const vy = by - ay
        const len2 = vx * vx + vy * vy
        const t = len2 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2)) : 0
        const sx = ax + t * vx
        const sy = ay + t * vy
        const dist = Math.hypot(sx, sy)
        if (dist <= maxM && (!best || dist < best.dist)) {
          const a = g.nodes[i]!
          const b = g.nodes[j]!
          best = { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i, j, dist }
        }
      }
    }
  return best
}

// The way the road goes at a snapped point (degrees clockwise from north), picking whichever of its
// two directions is closest to `wanted` (how the vehicle was going), so a parked vehicle lines up
// with the road instead of sitting across it.
export function alongRoad(g: RoadGraph, s: Snapped, wanted: number): number {
  const a = g.nodes[s.i]!
  const b = g.nodes[s.j]!
  const k = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180)
  const road = ((Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI + 360) % 360
  const back = (road + 180) % 360
  const off = (h: number) => Math.abs(((h - wanted + 540) % 360) - 180)
  return off(road) <= off(back) ? road : back
}

