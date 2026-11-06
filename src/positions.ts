// Taxi positions feed. PLACEHOLDER: taxis are simulated driving on Kulhudhuffushi's real road
// network (src/data/roads.json, built from OpenStreetMap by scripts/build-roads.py).
//
// When the driver app exists, replace `subscribePositions` with a real feed (e.g. a WebSocket to
// the TaxiQ server, authenticated with eFaas) that calls `onUpdate` with the same shape.
// The map only depends on this interface.

import { metres as metresBetween, nearestNode, type RoadGraph } from './core/route'
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

// A demo taxi on a job: it drives this route (to the pickup, then the destination) at TRIP_SPEED
// from when the job started, then waits at the end. The rest keep driving at random.
export const TRIP_SPEED = 8 // m/s, about 29 km/h
interface Run {
  path: [number, number][]
  cum: number[]
  start: number // performance.now() when it set off
  pickupAt: number // metres along the path where the pickup is
}
const runs = new Map<string, Run>()

export function driveTrip(id: string, path: [number, number][], pickupAt: number) {
  const cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + metresBetween(path[i - 1]!, path[i]!))
  runs.set(id, { path, cum, start: performance.now(), pickupAt })
}
export function endTrip(id: string) {
  runs.delete(id)
}

// How far along its job a taxi is: metres done, the pickup point, the whole length, and the rest of
// the route from where it is now.
export function tripProgress(id: string) {
  const r = runs.get(id)
  if (!r) return null
  const total = r.cum[r.cum.length - 1]!
  const done = Math.min(total, ((performance.now() - r.start) / 1000) * TRIP_SPEED)
  let i = 0
  while (i < r.cum.length - 1 && r.cum[i + 1]! <= done) i++
  return { done, total, pickupAt: r.pickupAt, rest: r.path.slice(i + 1) }
}

function along(r: Run, now: number, last: Position | undefined): Position {
  const total = r.cum[r.cum.length - 1]!
  const d = Math.min(total, ((now - r.start) / 1000) * TRIP_SPEED)
  let i = 0
  while (i < r.cum.length - 2 && r.cum[i + 1]! < d) i++
  const p = r.path[i]!
  const q = r.path[Math.min(i + 1, r.path.length - 1)]!
  const seg = r.cum[i + 1] !== undefined ? r.cum[i + 1]! - r.cum[i]! : 0
  const f = seg ? Math.min(1, (d - r.cum[i]!) / seg) : 0
  const k = Math.cos((p[0] * Math.PI) / 180)
  const heading = seg ? ((Math.atan2((q[1] - p[1]) * k, q[0] - p[0]) * 180) / Math.PI + 360) % 360 : (last?.heading ?? 0)
  return { lat: p[0] + (q[0] - p[0]) * f, lng: p[1] + (q[1] - p[1]) * f, heading }
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
  let last = new Map<string, Position>()
  const onJob = new Set<string>()
  let lastTime = performance.now()
  let frame = 0
  const tick = (now: number) => {
    // Clamp so a backgrounded tab doesn't make taxis jump on return.
    const dt = Math.min(0.1, (now - lastTime) / 1000)
    lastTime = now
    const out = new Map<string, Position>()
    for (let k = 0; k < sims.length; k++) {
      const s = sims[k]!
      const run = runs.get(s.id)
      if (run) {
        out.set(s.id, along(run, now, last.get(s.id)))
        onJob.add(s.id)
        continue
      }
      if (onJob.has(s.id)) {
        // Job over: carry on driving at random from where the taxi stopped.
        onJob.delete(s.id)
        const g = getArea().graph
        const at = last.get(s.id)
        if (g.nodes.length && at) {
          const fresh = create(g, s.id)
          const n = nearestNode(g, [at.lat, at.lng])
          const opts = g.next[n] ?? []
          fresh.from = n
          fresh.to = opts.length ? opts[0]! : n
          fresh.along = 0
          fresh.length = metres(g, fresh.from, fresh.to)
          sims[k] = fresh
        }
      }
      out.set(s.id, step(sims[k]!, dt))
    }
    last = out
    onUpdate(out)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    stopArea()
  }
}
