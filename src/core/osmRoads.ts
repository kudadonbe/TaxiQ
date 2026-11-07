// Road graphs for any area, so demo taxis drive on real roads where the viewer is: from road lines in
// OpenFreeMap vector tiles (graphFromLines), or from the Overpass API (buildGraph). Both are
// OpenStreetMap data. Pure: returns a RoadGraph (src/core/route.ts).

import { roadLimitKmh } from './drive'
import type { RoadGraph } from './route'

// Roads cars can use. Footways, paths, steps and cycleways are left out.
export const DRIVABLE = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'

// Overpass query for drivable roads within `radius` metres of a point.
export function overpassQuery(lat: number, lng: number, radius: number) {
  return `[out:json][timeout:20];way["highway"~"^(${DRIVABLE})$"](around:${Math.round(radius)},${lat.toFixed(4)},${lng.toFixed(4)});out body qt;>;out skel qt;`
}

interface OsmElement {
  type: string
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}

// One-way direction from OSM tags: 1 = along the way, -1 = against it, 0 = both ways.
export function onewayOf(tags: Record<string, string> | undefined): 1 | -1 | 0 {
  const v = tags?.oneway
  if (v === '-1' || v === 'reverse') return -1
  if (v === 'yes' || v === '1' || v === 'true') return 1
  if (v === 'no') return 0
  if (tags?.junction === 'roundabout' || tags?.junction === 'circular' || tags?.highway === 'motorway') return 1
  return 0
}

// Road graph from Overpass JSON, following one-way streets.
export function buildGraph(json: { elements?: OsmElement[] }, minNodes = 20): RoadGraph | null {
  const els = json.elements ?? []
  const coords = new Map<number, [number, number]>()
  for (const e of els) if (e.type === 'node' && typeof e.lat === 'number' && typeof e.lon === 'number') coords.set(e.id, [e.lat, e.lon])
  const b = new Builder()
  for (const e of els) {
    if (e.type !== 'way' || !e.nodes) continue
    const dir = onewayOf(e.tags)
    for (let k = 1; k < e.nodes.length; k++) {
      const p = coords.get(e.nodes[k - 1]!)
      const q = coords.get(e.nodes[k]!)
      if (p && q) b.link(p, q, dir, roadLimitKmh(e.tags?.highway, p))
    }
  }
  return b.done(minNodes)
}

// Road graph from road lines ([lng, lat] points, as vector tiles give them), with each line's
// one-way direction. Points within 2.5 m are joined, including lines cut at tile edges.
export function graphFromLines(lines: readonly { coords: readonly (readonly number[])[]; oneway?: number; kind?: string }[], minNodes = 20): RoadGraph | null {
  const b = new Builder()
  for (const { coords, oneway, kind } of lines) {
    const dir = oneway === 1 ? 1 : oneway === -1 ? -1 : 0
    for (let k = 1; k < coords.length; k++) {
      const p: [number, number] = [coords[k - 1]![1]!, coords[k - 1]![0]!]
      b.link(p, [coords[k]![1]!, coords[k]![0]!], dir, roadLimitKmh(kind, p))
    }
  }
  return b.done(minNodes)
}

const SNAP_M = 2.5
const CELL_DEG = SNAP_M / 111_320
const metresApprox = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180))

// Collects junctions (points within SNAP_M join) and directed road links, then keeps the largest part
// where every road can reach every other road obeying one-way streets, so no car can get stuck.
class Builder {
  private readonly cells = new Map<string, number[]>()
  readonly nodes: [number, number][] = []
  readonly out: Set<number>[] = []

  // Points within SNAP_M of an existing junction join it (vector tiles store positions to about
  // 0.6 m, so the two halves of a road cut at a tile edge rarely match exactly).
  private idx(p: readonly [number, number]) {
    const cy = Math.floor(p[0] / CELL_DEG)
    const cx = Math.floor(p[1] / CELL_DEG)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        for (const i of this.cells.get(`${cy + dy},${cx + dx}`) ?? []) if (metresApprox(this.nodes[i]!, p) <= SNAP_M) return i
      }
    const i = this.nodes.length
    this.nodes.push([p[0], p[1]])
    this.out.push(new Set())
    const key = `${cy},${cx}`
    const list = this.cells.get(key)
    if (list) list.push(i)
    else this.cells.set(key, [i])
    return i
  }

  private readonly segs: { a: number; b: number; dir: 1 | -1 | 0; limit: number }[] = []
  private readonly limits = new Map<string, number>() // 'i,j' -> km/h

  link(p: readonly [number, number], q: readonly [number, number], dir: 1 | -1 | 0, limit = 30) {
    const a = this.idx(p)
    const b = this.idx(q)
    if (a !== b) this.segs.push({ a, b, dir, limit })
  }

  // Simplified road shapes (vector tiles) can lose the shared point where roads meet: a side road
  // ends on the main road's line, or two roads cross, with no junction point there. Split roads at
  // those places so they join, then add the directed links.
  private node() {
    const SEG_CELL = 40 / 111_320 // ~40 m cells for finding nearby road pieces
    const P = (i: number) => {
      const [lat, lng] = this.nodes[i]!
      return [lng * Math.cos((lat * Math.PI) / 180) * 111_320, lat * 111_320] as const
    }
    const cells = new Map<string, number[]>()
    this.segs.forEach((sg, k) => {
      const [p, q] = [this.nodes[sg.a]!, this.nodes[sg.b]!]
      const y0 = Math.floor(Math.min(p[0], q[0]) / SEG_CELL)
      const y1 = Math.floor(Math.max(p[0], q[0]) / SEG_CELL)
      const x0 = Math.floor(Math.min(p[1], q[1]) / SEG_CELL)
      const x1 = Math.floor(Math.max(p[1], q[1]) / SEG_CELL)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const key = `${y},${x}`
          const list = cells.get(key)
          if (list) list.push(k)
          else cells.set(key, [k])
        }
    })
    const splits: { t: number; n: number }[][] = this.segs.map(() => [])
    const onSeg = (k: number, i: number) => {
      // Point i lies on segment k (not at its ends)? Return its position along it.
      const sg = this.segs[k]!
      if (i === sg.a || i === sg.b) return null
      const [ax, ay] = P(sg.a)
      const [bx, by] = P(sg.b)
      const [px, py] = P(i)
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      if (!len2) return null
      const t = ((px - ax) * dx + (py - ay) * dy) / len2
      if (t <= 0.001 || t >= 0.999) return null
      return Math.hypot(ax + t * dx - px, ay + t * dy - py) <= SNAP_M ? t : null
    }
    const seen = new Set<string>()
    for (const list of cells.values()) {
      for (let x = 0; x < list.length; x++)
        for (let y = x + 1; y < list.length; y++) {
          const k1 = list[x]!
          const k2 = list[y]!
          const pair = k1 < k2 ? `${k1},${k2}` : `${k2},${k1}`
          if (seen.has(pair)) continue
          seen.add(pair)
          const s1 = this.segs[k1]!
          const s2 = this.segs[k2]!
          // An end of one road touching the other road's line.
          for (const [k, other] of [[k1, s2], [k2, s1]] as const) {
            for (const i of [other.a, other.b]) {
              const t = onSeg(k, i)
              if (t !== null) splits[k]!.push({ t, n: i })
            }
          }
          // Two roads crossing with no shared point.
          const [ax, ay] = P(s1.a)
          const [bx, by] = P(s1.b)
          const [cx, cy] = P(s2.a)
          const [dx, dy] = P(s2.b)
          const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
          if (!den || s1.a === s2.a || s1.a === s2.b || s1.b === s2.a || s1.b === s2.b) continue
          const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den
          const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den
          if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) continue
          const [p, q] = [this.nodes[s1.a]!, this.nodes[s1.b]!]
          const n = this.idx([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
          splits[k1]!.push({ t, n })
          splits[k2]!.push({ t: u, n })
        }
    }
    this.segs.forEach((sg, k) => {
      const chain = [sg.a, ...splits[k]!.sort((p, q) => p.t - q.t).map((x) => x.n), sg.b]
      for (let c = 1; c < chain.length; c++) {
        const i = chain[c - 1]!
        const j = chain[c]!
        if (i === j) continue
        if (sg.dir >= 0) this.out[i]!.add(j)
        if (sg.dir <= 0) this.out[j]!.add(i)
        // Where two roads share a stretch, the faster limit wins.
        for (const [x, y] of [[i, j], [j, i]]) {
          const k = `${x},${y}`
          this.limits.set(k, Math.max(this.limits.get(k) ?? 0, sg.limit))
        }
      }
    })
  }

  done(minNodes: number): RoadGraph | null {
    this.node()
    const n = this.nodes.length
    const comp = strongParts(this.out)
    const size = new Map<number, number>()
    for (let i = 0; i < n; i++) size.set(comp[i]!, (size.get(comp[i]!) ?? 0) + 1)
    let best = -1
    let bestSize = 0
    for (const [c, k] of size) {
      if (k <= bestSize) continue
      bestSize = k
      best = c
    }
    if (bestSize < minNodes) return null
    const keep = new Map<number, number>()
    const nodes: [number, number][] = []
    for (let i = 0; i < n; i++) if (comp[i] === best) keep.set(i, nodes.push(this.nodes[i]!) - 1)
    const next = nodes.map(() => [] as number[])
    const limit = nodes.map(() => [] as number[])
    for (const [i, j] of keep)
      for (const v of this.out[i]!)
        if (keep.has(v)) {
          next[j]!.push(keep.get(v)!)
          limit[j]!.push(this.limits.get(`${i},${v}`) ?? 30)
        }
    return { nodes, next, limit }
  }
}

// Strongly connected parts (Kosaraju, iterative). Returns each node's part number.
function strongParts(out: Set<number>[]): Int32Array {
  const n = out.length
  const seen = new Uint8Array(n)
  const order: number[] = []
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue
    const stack: [number, Iterator<number>][] = [[s, out[s]!.values()]]
    seen[s] = 1
    while (stack.length) {
      const top = stack[stack.length - 1]!
      const r = top[1].next()
      if (r.done) {
        order.push(top[0])
        stack.pop()
      } else if (!seen[r.value]) {
        seen[r.value] = 1
        stack.push([r.value, out[r.value]!.values()])
      }
    }
  }
  const back: number[][] = Array.from({ length: n }, () => [])
  for (let u = 0; u < n; u++) for (const v of out[u]!) back[v]!.push(u)
  const comp = new Int32Array(n).fill(-1)
  let c = 0
  for (let k = n - 1; k >= 0; k--) {
    const s = order[k]!
    if (comp[s] !== -1) continue
    const stack = [s]
    comp[s] = c
    while (stack.length) {
      const u = stack.pop()!
      for (const v of back[u]!) {
        if (comp[v] !== -1) continue
        comp[v] = c
        stack.push(v)
      }
    }
    c++
  }
  return comp
}

// Rounds a position to about 1 km before it is sent to Overpass, so the exact location never leaves
// the device.
export const coarse = (x: number) => Math.round(x * 100) / 100
