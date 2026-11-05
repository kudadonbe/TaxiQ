// Road graph from OpenStreetMap (Overpass API) for any area, so demo taxis can drive where the
// viewer is. Pure: takes the Overpass JSON, returns a RoadGraph (src/core/route.ts).

import type { RoadGraph } from './route'

// Roads cars can use. Footways, paths, steps and cycleways are left out.
export const DRIVABLE = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'

// Overpass query for drivable roads within `radius` metres of a point.
export function overpassQuery(lat: number, lng: number, radius: number) {
  return `[out:json][timeout:20];way["highway"~"^(${DRIVABLE})$"](around:${Math.round(radius)},${lat.toFixed(4)},${lng.toFixed(4)});(._;>;);out skel qt;`
}

interface OsmElement {
  type: string
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
}

// Builds a two-way road graph (fine for demo cars) and keeps only the largest connected part, so
// every car can reach every road. Returns null when there is too little road to drive on.
export function buildGraph(json: { elements?: OsmElement[] }, minNodes = 20): RoadGraph | null {
  const els = json.elements ?? []
  const coords = new Map<number, [number, number]>()
  for (const e of els) if (e.type === 'node' && typeof e.lat === 'number' && typeof e.lon === 'number') coords.set(e.id, [e.lat, e.lon])
  const index = new Map<number, number>()
  const nodes: [number, number][] = []
  const adj: Set<number>[] = []
  const idx = (id: number) => {
    let i = index.get(id)
    if (i === undefined) {
      i = nodes.length
      index.set(id, i)
      nodes.push(coords.get(id)!)
      adj.push(new Set())
    }
    return i
  }
  for (const e of els) {
    if (e.type !== 'way' || !e.nodes) continue
    for (let k = 1; k < e.nodes.length; k++) {
      const a = e.nodes[k - 1]!
      const b = e.nodes[k]!
      if (a === b || !coords.has(a) || !coords.has(b)) continue
      const i = idx(a)
      const j = idx(b)
      adj[i]!.add(j)
      adj[j]!.add(i)
    }
  }
  // Largest connected part.
  const part = new Int32Array(nodes.length).fill(-1)
  let best = -1
  let bestSize = 0
  for (let s = 0, p = 0; s < nodes.length; s++) {
    if (part[s] !== -1) continue
    let size = 0
    const stack = [s]
    part[s] = p
    while (stack.length) {
      const u = stack.pop()!
      size++
      for (const v of adj[u]!) {
        if (part[v] !== -1) continue
        part[v] = p
        stack.push(v)
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = p
    }
    p++
  }
  if (bestSize < minNodes) return null
  const keep = new Map<number, number>()
  const outNodes: [number, number][] = []
  for (let i = 0; i < nodes.length; i++) if (part[i] === best) keep.set(i, outNodes.push(nodes[i]!) - 1)
  const next = outNodes.map(() => [] as number[])
  for (const [i, j] of keep) for (const v of adj[i]!) next[j]!.push(keep.get(v)!)
  return { nodes: outNodes, next }
}

// When no road data can be loaded: a street grid around the point (about 1.2 km across, a street
// every 150 m), so the demo taxis still drive where the viewer is.
export function gridAround(lat: number, lng: number, size = 9, spacing = 150): RoadGraph {
  const dLat = spacing / 111_320
  const dLng = spacing / (111_320 * Math.cos((lat * Math.PI) / 180))
  const half = (size - 1) / 2
  const nodes: [number, number][] = []
  const next: number[][] = []
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) nodes.push([lat + (r - half) * dLat, lng + (c - half) * dLng])
  for (let i = 0; i < nodes.length; i++) {
    const r = Math.floor(i / size)
    const c = i % size
    next.push([r > 0 ? i - size : -1, r < size - 1 ? i + size : -1, c > 0 ? i - 1 : -1, c < size - 1 ? i + 1 : -1].filter((x) => x >= 0))
  }
  return { nodes, next }
}

// Rounds a position to about 1 km before it is sent to Overpass, so the exact location never leaves
// the device.
export const coarse = (x: number) => Math.round(x * 100) / 100
