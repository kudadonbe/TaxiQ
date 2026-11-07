// TaxiQ core: road routing on an island's road graph (src/data/roads.json, from OpenStreetMap).
// Taxi routes follow one-way streets; walking routes may use any road in either direction.
// Pure functions: Dijkstra over the graph, no DOM.

import { snapToRoad } from './snap'

export type TravelMode = 'taxi' | 'walk'

export interface RoadGraph {
  // Speed limit (km/h) for each road in `next` (same shape), when known; else 30 (island roads).
  limit?: number[][]
  nodes: readonly [number, number][] // [lat, lng]
  next: readonly (readonly number[])[] // directed edges (one-way streets honoured)
}

export interface Route {
  path: [number, number][] // [lat, lng] from start to end, including the off-road ends
  metres: number
  seconds: number
}

// Average door-to-door speeds on a small island (m/s): taxis ~20 km/h, walking ~4.5 km/h.
export const SPEED: Record<TravelMode, number> = { taxi: 20 / 3.6, walk: 4.5 / 3.6 }

const rad = (d: number) => (d * Math.PI) / 180
export function metres(a: readonly [number, number], b: readonly [number, number]): number {
  const k = Math.cos(rad((a[0] + b[0]) / 2))
  return Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * k)
}

// Undirected adjacency for walking.
function undirected(g: RoadGraph): number[][] {
  const out = g.next.map((n) => [...n])
  g.next.forEach((ns, i) => ns.forEach((j) => out[j]!.includes(i) || out[j]!.push(i)))
  return out
}

export function nearestNode(g: RoadGraph, at: readonly [number, number]): number {
  let best = 0
  let bestD = Infinity
  g.nodes.forEach((p, i) => {
    const d = metres(p, at)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

// Tiny binary heap for Dijkstra.
class Heap {
  private a: [number, number][] = []
  get size() {
    return this.a.length
  }
  push(item: [number, number]) {
    const a = this.a
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p]![0] <= a[i]![0]) break
      ;[a[p], a[i]] = [a[i]!, a[p]!]
      i = p
    }
  }
  pop(): [number, number] {
    const a = this.a
    const top = a[0]!
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l]![0] < a[m]![0]) m = l
        if (r < a.length && a[r]![0] < a[m]![0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i]!, a[m]!]
        i = m
      }
    }
    return top
  }
}

const walkCache = new WeakMap<RoadGraph, number[][]>()

// Shortest route between two points, along the roads. Each end joins the road at its nearest
// point on a road (not the nearest junction, which can be across a block), and the route runs from
// there: on the same stretch it goes straight along it; otherwise to either end of that stretch the
// way it may be driven. Returns null when the roads don't connect them.
export function route(g: RoadGraph, from: readonly [number, number], to: readonly [number, number], mode: TravelMode): Route | null {
  if (!g.nodes.length) return null
  const adj = mode === 'walk' ? (walkCache.get(g) ?? (walkCache.set(g, undirected(g)), walkCache.get(g)!)) : g.next
  const can = (i: number, j: number) => adj[i]!.includes(j)
  const sf = snapToRoad(g, from, 400)
  const st = snapToRoad(g, to, 400)
  // Where the route starts on the road, and the nodes it may set off to (with the metres to each).
  const starts: [number, number][] = []
  const P: [number, number] = sf ? sf.at : [g.nodes[nearestNode(g, from)]![0], g.nodes[nearestNode(g, from)]![1]]
  if (sf) {
    // At (within 2 m of) a junction counts as being there: any way out of it is open.
    for (const [a, b] of [[sf.i, sf.j], [sf.j, sf.i]] as const) {
      const d = metres(P, g.nodes[b]!)
      if (can(a, b) || d < 2) starts.push([b, d])
    }
  } else starts.push([nearestNode(g, from), 0])
  const ends: [number, number][] = []
  const Q: [number, number] = st ? st.at : [g.nodes[nearestNode(g, to)]![0], g.nodes[nearestNode(g, to)]![1]]
  if (st) {
    for (const [a, b] of [[st.i, st.j], [st.j, st.i]] as const) {
      const d = metres(g.nodes[a]!, Q)
      if (can(a, b) || d < 2) ends.push([a, d])
    }
  } else ends.push([nearestNode(g, to), 0])

  // Both on the same stretch, and it may be driven from P toward Q: straight along it.
  let direct = Infinity
  if (sf && st && ((sf.i === st.i && sf.j === st.j) || (sf.i === st.j && sf.j === st.i))) {
    const a = g.nodes[sf.i]!
    const towardJ = metres(a, Q) >= metres(a, P) // Q is further along from i than P
    const ok = towardJ ? can(sf.i, sf.j) : can(sf.j, sf.i)
    if (ok) direct = metres(P, Q)
  }

  const dist = new Float64Array(g.nodes.length).fill(Infinity)
  const prev = new Int32Array(g.nodes.length).fill(-1)
  const heap = new Heap()
  for (const [n, d] of starts)
    if (d < dist[n]!) {
      dist[n] = d
      heap.push([d, n])
    }
  const endAt = new Map(ends)
  let best = direct
  let bestEnd = -1
  while (heap.size) {
    const [d, u] = heap.pop()
    if (d > dist[u]!) continue
    if (d >= best) break
    const tail = endAt.get(u)
    if (tail !== undefined && d + tail < best) {
      best = d + tail
      bestEnd = u
    }
    for (const v of adj[u]!) {
      const nd = d + metres(g.nodes[u]!, g.nodes[v]!)
      if (nd < dist[v]!) {
        dist[v] = nd
        prev[v] = u
        heap.push([nd, v])
      }
    }
  }
  if (best === Infinity) return null
  const nodes: number[] = []
  if (bestEnd !== -1) for (let u = bestEnd; u !== -1; u = prev[u]!) nodes.unshift(u)
  // On the road: where it joins, the junctions, where it leaves (repeats dropped); then the two ends.
  const onRoad: [number, number][] = [P, ...nodes.map((i) => [g.nodes[i]![0], g.nodes[i]![1]] as [number, number]), Q].filter(
    (p, i, all) => i === 0 || metres(all[i - 1]!, p) > 0.05,
  )
  if (onRoad.length > 1 && metres(onRoad[0]!, onRoad[1]!) < 2) onRoad.shift() // joined right at a junction
  if (onRoad.length > 1 && metres(onRoad[onRoad.length - 1]!, onRoad[onRoad.length - 2]!) < 2) onRoad.pop()
  const path: [number, number][] = [[from[0], from[1]], ...onRoad, [to[0], to[1]]]
  const total = path.slice(1).reduce((sum, p, i) => sum + metres(path[i]!, p), 0)
  return { path, metres: total, seconds: total / SPEED[mode] }
}
