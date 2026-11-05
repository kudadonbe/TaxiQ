// Taxi positions feed. PLACEHOLDER: taxis are simulated driving on Kulhudhuffushi's real road
// network (src/data/roads.json, built from OpenStreetMap by scripts/build-roads.py).
//
// When the driver app exists, replace `subscribePositions` with a real feed (e.g. a WebSocket to
// the TaxiQ server, authenticated with eFaas) that calls `onUpdate` with the same shape.
// The map only depends on this interface.

import roads from './data/roads.json'

export interface Position {
  lat: number
  lng: number
  heading: number // degrees clockwise from north: the way the car is facing
}

export type Positions = ReadonlyMap<string, Position>

// Kulhudhuffushi, Haa Dhaalu Atoll.
export const MAP_CENTER: [number, number] = [6.6217, 73.0696]

const nodes = roads.n as [number, number][]
const next = roads.a as number[][]

// The island's road graph, for routing (src/core/route.ts).
export const ROAD_GRAPH = { nodes, next }

const M_PER_DEG = 111_320
const cosLat = Math.cos((MAP_CENTER[0] * Math.PI) / 180)

function metres(a: number, b: number) {
  const [p, q] = [nodes[a]!, nodes[b]!]
  return Math.hypot((q[0] - p[0]) * M_PER_DEG, (q[1] - p[1]) * M_PER_DEG * cosLat)
}

function bearing(a: number, b: number) {
  const [p, q] = [nodes[a]!, nodes[b]!]
  const deg = (Math.atan2((q[1] - p[1]) * cosLat, q[0] - p[0]) * 180) / Math.PI
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
  id: string
  rand: () => number
  from: number
  to: number
  along: number // metres travelled along the current edge
  length: number
  speed: number // m/s; 0 = parked
  heading: number // displayed heading, eased toward the road's bearing
}

function create(id: string): Sim {
  const rand = rng(hash(id))
  const from = Math.floor(rand() * nodes.length)
  const to = next[from]![Math.floor(rand() * next[from]!.length)]!
  const length = metres(from, to)
  return {
    id,
    rand,
    from,
    to,
    along: rand() * length,
    length,
    speed: rand() < 0.3 ? 0 : 5 + rand() * 5, // ~30% waiting; others 18–36 km/h
    heading: bearing(from, to),
  }
}

// At a junction, take a random road onward, avoiding a U-turn unless it's a dead end.
function advance(s: Sim) {
  const options = next[s.to]!
  const forward = options.filter((n) => n !== s.from)
  const pool = forward.length ? forward : options
  const nextNode = pool[Math.floor(s.rand() * pool.length)]!
  s.from = s.to
  s.to = nextNode
  s.along -= s.length
  s.length = metres(s.from, s.to)
}

function step(s: Sim, dt: number): Position {
  s.along += s.speed * dt
  let guard = 0
  while (s.along >= s.length && guard++ < 50) advance(s)
  const f = s.length ? Math.min(1, s.along / s.length) : 0
  const [p, q] = [nodes[s.from]!, nodes[s.to]!]
  // Turn smoothly toward the road direction (shortest way round).
  const target = bearing(s.from, s.to)
  const diff = ((target - s.heading + 540) % 360) - 180
  s.heading = (s.heading + diff * Math.min(1, dt * 6) + 360) % 360
  return { lat: p[0] + (q[0] - p[0]) * f, lng: p[1] + (q[1] - p[1]) * f, heading: s.heading }
}

export function subscribePositions(ids: readonly string[], onUpdate: (p: Positions) => void): () => void {
  const sims = ids.map(create)
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
  return () => cancelAnimationFrame(frame)
}
