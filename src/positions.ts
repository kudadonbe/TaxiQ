// Taxi positions feed. PLACEHOLDER: taxis are simulated driving on Kulhudhuffushi's real road
// network (src/data/roads.json, built from OpenStreetMap by scripts/build-roads.py).
//
// When the driver app exists, replace `subscribePositions` with a real feed (e.g. a WebSocket to
// the TaxiQ server, authenticated with eFaas) that calls `onUpdate` with the same shape.
// The map only depends on this interface.

import type { RoadGraph } from './core/route'
import { getArea, subscribeArea } from './roadArea'

export { MAP_CENTER, ROAD_GRAPH } from './homeRoads'

export interface Position {
  lat: number
  lng: number
  heading: number // degrees clockwise from north: the way the car is facing
}

export type Positions = ReadonlyMap<string, Position>

const M_PER_DEG = 111_320

function metres(g: RoadGraph, a: number, b: number) {
  const [p, q] = [g.nodes[a]!, g.nodes[b]!]
  const k = Math.cos((p[0] * Math.PI) / 180)
  return Math.hypot((q[0] - p[0]) * M_PER_DEG, (q[1] - p[1]) * M_PER_DEG * k)
}

function bearing(g: RoadGraph, a: number, b: number) {
  const [p, q] = [g.nodes[a]!, g.nodes[b]!]
  const k = Math.cos((p[0] * Math.PI) / 180)
  const deg = (Math.atan2((q[1] - p[1]) * k, q[0] - p[0]) * 180) / Math.PI
  return (deg + 360) % 360
}

// Small seeded PRNG so each taxi drives its own repeatable route.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(id: string) {
  let h = 2166136261
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

interface Sim {
  g: RoadGraph
  id: string
  rand: () => number
  from: number
  to: number
  along: number // metres travelled along the current edge
  length: number
  speed: number // m/s; 0 = parked
  heading: number // displayed heading, eased toward the road's bearing
}

function create(g: RoadGraph, id: string): Sim {
  const rand = rng(hash(id))
  let from = Math.floor(rand() * g.nodes.length)
  for (let tries = 0; !g.next[from]?.length && tries < 50; tries++) from = Math.floor(rand() * g.nodes.length)
  const opts = g.next[from] ?? []
  const to = opts.length ? opts[Math.floor(rand() * opts.length)]! : from
  const length = metres(g, from, to)
  return {
    g,
    id,
    rand,
    from,
    to,
    along: rand() * length,
    length,
    speed: rand() < 0.3 ? 0 : 5 + rand() * 5, // ~30% waiting; others 18–36 km/h
    heading: bearing(g, from, to),
  }
}

// At a junction, take a random road onward, avoiding a U-turn unless it's a dead end.
function advance(s: Sim) {
  const options = s.g.next[s.to] ?? []
  if (!options.length) {
    s.speed = 0
    s.along = s.length
    return
  }
  const forward = options.filter((n) => n !== s.from)
  const pool = forward.length ? forward : options
  const nextNode = pool[Math.floor(s.rand() * pool.length)]!
  s.from = s.to
  s.to = nextNode
  s.along -= s.length
  s.length = metres(s.g, s.from, s.to)
}

function step(s: Sim, dt: number): Position {
  s.along += s.speed * dt
  let guard = 0
  while (s.speed > 0 && s.along >= s.length && guard++ < 50) advance(s)
  const f = s.length ? Math.min(1, s.along / s.length) : 0
  const [p, q] = [s.g.nodes[s.from]!, s.g.nodes[s.to]!]
  // Turn smoothly toward the road direction (shortest way round).
  const target = s.from === s.to ? s.heading : bearing(s.g, s.from, s.to)
  const diff = ((target - s.heading + 540) % 360) - 180
  s.heading = (s.heading + diff * Math.min(1, dt * 6) + 360) % 360
  return { lat: p[0] + (q[0] - p[0]) * f, lng: p[1] + (q[1] - p[1]) * f, heading: s.heading }
}

// Demo taxis drive on the roads of the current area (src/roadArea.ts): Kulhudhuffushi, or the
// roads around the viewer. When the area changes they start again there.
export function subscribePositions(ids: readonly string[], onUpdate: (p: Positions) => void): () => void {
  // No roads for this area yet: no taxis (they never drive off the roads).
  const make = () => (getArea().graph.nodes.length ? ids.map((id) => create(getArea().graph, id)) : [])
  let sims = make()
  const stopArea = subscribeArea(() => {
    sims = make()
  })
  let last = performance.now()
  let frame = 0
  const tick = (now: number) => {
    // Clamp so a backgrounded tab doesn't make taxis jump on return.
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    onUpdate(new Map(sims.map((s) => [s.id, step(s, dt)])))
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    stopArea()
  }
}
