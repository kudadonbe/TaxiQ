// TaxiQ core: road routing on an island's road graph (src/data/roads.json, from OpenStreetMap).
// Taxi routes follow one-way streets; walking routes may use any road in either direction.
// Pure functions: Dijkstra over the graph, no DOM.

export type TravelMode = 'taxi' | 'walk'

export interface RoadGraph {
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

// Shortest route between two points. Returns null when the roads don't connect them.
export function route(g: RoadGraph, from: readonly [number, number], to: readonly [number, number], mode: TravelMode): Route | null {
  const adj = mode === 'walk' ? (walkCache.get(g) ?? (walkCache.set(g, undirected(g)), walkCache.get(g)!)) : g.next
  const s = nearestNode(g, from)
  const t = nearestNode(g, to)
  const dist = new Float64Array(g.nodes.length).fill(Infinity)
  const prev = new Int32Array(g.nodes.length).fill(-1)
  dist[s] = 0
  const heap = new Heap()
  heap.push([0, s])
  while (heap.size) {
    const [d, u] = heap.pop()
    if (u === t) break
    if (d > dist[u]!) continue
    for (const v of adj[u]!) {
      const nd = d + metres(g.nodes[u]!, g.nodes[v]!)
      if (nd < dist[v]!) {
        dist[v] = nd
        prev[v] = u
        heap.push([nd, v])
      }
    }
  }
  if (dist[t] === Infinity) return null
  const nodes: number[] = []
  for (let u = t; u !== -1; u = prev[u]!) nodes.unshift(u)
  const path: [number, number][] = [[from[0], from[1]], ...nodes.map((i) => [g.nodes[i]![0], g.nodes[i]![1]] as [number, number]), [to[0], to[1]]]
  const total = path.slice(1).reduce((sum, p, i) => sum + metres(path[i]!, p), 0)
  return { path, metres: total, seconds: total / SPEED[mode] }
}
