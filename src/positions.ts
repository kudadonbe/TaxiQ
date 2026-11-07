// Taxi positions feed. PLACEHOLDER: taxis are simulated driving on Kulhudhuffushi's real road
// network (src/data/roads.json, built from OpenStreetMap by scripts/build-roads.py).
//
// When the driver app exists, replace `subscribePositions` with a real feed (e.g. a WebSocket to
// the TaxiQ server, authenticated with eFaas) that calls `onUpdate` with the same shape.
// The map only depends on this interface.

import { brakingSpeed, cornerSpeed, cruiseSpeed, HANDLING, indicator, nextSpeed, roadLimitKmh, turnAngle } from './core/drive'
import { roundCorners } from './core/glide'
import { inLane, isTwoWay, LANE_OFFSET_M, toTheLeft, twoWayBetween } from './core/lanes'
import { metres as metresBetween, nearestNode, type RoadGraph } from './core/route'
import { getArea, subscribeArea } from './roadArea'

export { MAP_CENTER, ROAD_GRAPH } from './homeRoads'

export interface Position {
  lat: number
  lng: number
  heading: number // degrees clockwise from north: the way the car is facing
  braking?: boolean // slowing or stopped (brake lights)
  signal?: 'left' | 'right' | null // indicator blinking before a turn
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
  prev: number // the node before `from` (for the curve through the last corner)
  from: number
  to: number
  after: number // the next node after `to`, chosen early so the taxi can slow and indicate
  along: number // metres travelled along the current edge
  length: number
  v: number // m/s now
  parked: boolean
  driver: number // 0..1, this driver's steady share of the limit
  heading: number // displayed heading, eased
  cap: number // the fastest traffic allows this frame (m/s): the vehicle ahead, a junction
  shift: number // 0 in its own lane, 1 fully in the other lane (overtaking)
  passing: Sim | null // the vehicle it is overtaking
  arrived: number // ms when it reached the junction ahead (for giving way), 0 = not yet
}

// The speed limit on a road (km/h): from the road map when known, else the island default.
function edgeLimit(g: RoadGraph, i: number, j: number) {
  const k = g.next[i]?.indexOf(j) ?? -1
  return k >= 0 && g.limit?.[i]?.[k] !== undefined ? g.limit[i]![k]! : roadLimitKmh(undefined, g.nodes[i]!)
}

// The next road after `to`: random, avoiding a U-turn unless it's a dead end.
function pickAfter(s: Sim) {
  const options = s.g.next[s.to] ?? []
  const forward = options.filter((n) => n !== s.from)
  const pool = forward.length ? forward : options
  s.after = pool.length ? pool[Math.floor(s.rand() * pool.length)]! : s.to
}

function create(g: RoadGraph, id: string): Sim {
  const rand = rng(hash(id))
  let from = Math.floor(rand() * g.nodes.length)
  for (let tries = 0; !g.next[from]?.length && tries < 50; tries++) from = Math.floor(rand() * g.nodes.length)
  const opts = g.next[from] ?? []
  const to = opts.length ? opts[Math.floor(rand() * opts.length)]! : from
  const length = metres(g, from, to)
  const parked = rand() < 0.3 // ~30% waiting at a stand
  const driver = rand()
  // Parked taxis prefer a parking aisle or lane (10 km/h roads) when the map has them (§8).
  if (parked && g.limit) {
    const lots: [number, number][] = []
    g.next.forEach((ns, i) => ns.forEach((j, k) => g.limit![i]![k] === 10 && lots.push([i, j])))
    if (lots.length) {
      const [i, j] = lots[Math.floor(rand() * lots.length)]!
      return finishCreate(g, id, rand, i, j, metres(g, i, j), parked, driver)
    }
  }
  return finishCreate(g, id, rand, from, to, length, parked, driver)
}

function finishCreate(g: RoadGraph, id: string, rand: () => number, from: number, to: number, length: number, parked: boolean, driver: number): Sim {
  const s: Sim = { g, id, rand, prev: from, from, to, after: to, along: rand() * length, length, v: 0, parked, driver, heading: bearing(g, from, to), cap: Infinity, shift: 0, passing: null, arrived: 0 }
  pickAfter(s)
  if (!parked) s.v = cruiseSpeed('car', edgeLimit(g, from, to), driver) * 0.7
  return s
}

// Into the next road: the chosen one becomes current, and the one after is chosen.
function advance(s: Sim) {
  s.prev = s.from
  s.from = s.to
  s.to = s.after
  s.along -= s.length
  s.length = metres(s.g, s.from, s.to)
  pickAfter(s)
}

const point = (g: RoadGraph, i: number, j: number, d: number): [number, number] => {
  const p = g.nodes[i]!
  const q = g.nodes[j]!
  const L = metres(g, i, j)
  const f = L ? Math.max(0, Math.min(1, d / L)) : 0
  return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]
}
const bez = (a: [number, number], c: [number, number], b: [number, number], u: number): [number, number] => {
  const w = 1 - u
  return [w * w * a[0] + 2 * w * u * c[0] + u * u * b[0], w * w * a[1] + 2 * w * u * c[1] + u * u * b[1]]
}

// One frame of a roaming taxi (plans/vehicle-movement-rules.md §1–§3): cruise at the road's speed,
// brake in time for the corner ahead (slower for sharper turns), accelerate gently out of it, drive
// a curve through the corner, indicate before turning, keep left on two-way roads.
function step(s: Sim, dt: number): Position {
  const g = s.g
  const road = bearing(g, s.from, s.to)
  const turn = s.after === s.to ? 180 : turnAngle(road, bearing(g, s.to, s.after))
  const r = Math.min(HANDLING.car.cornerM, s.length / 2, s.after === s.to ? 0 : metres(g, s.to, s.after) / 2)
  let braking = false
  if (!s.parked) {
    const cruise = cruiseSpeed('car', edgeLimit(g, s.from, s.to), s.driver)
    const atCorner = cornerSpeed('car', turn, cruise)
    const want = Math.min(cruise, brakingSpeed(atCorner, s.length - s.along - r, HANDLING.car.brake), s.cap)
    braking = want < s.v - 0.05
    s.v = nextSpeed(s.v, want, 'car', dt)
    s.along += s.v * dt
    let guard = 0
    while (s.along >= s.length && s.from !== s.to && guard++ < 20) advance(s)
  } else s.v = 0
  // Where it is: on the straight, or on the curve through a corner (entering or leaving it).
  const rPrev = Math.min(HANDLING.car.cornerM, s.length / 2, metres(g, s.prev, s.from) / 2)
  let at: [number, number]
  let face = road
  if (s.after !== s.to && r > 0.5 && s.along > s.length - r) {
    const u = (s.along - (s.length - r)) / (2 * r)
    const a = point(g, s.from, s.to, s.length - r)
    const b = point(g, s.to, s.after, r)
    at = bez(a, g.nodes[s.to]! as [number, number], b, u)
    const ahead = bez(a, g.nodes[s.to]! as [number, number], b, Math.min(1, u + 0.05))
    face = metresBetween(at, ahead) > 0.01 ? bearingOf(at, ahead) : road
  } else if (s.prev !== s.from && rPrev > 0.5 && s.along < rPrev) {
    const u = 0.5 + s.along / (2 * rPrev)
    const a = point(g, s.prev, s.from, metres(g, s.prev, s.from) - rPrev)
    const b = point(g, s.from, s.to, rPrev)
    at = bez(a, g.nodes[s.from]! as [number, number], b, u)
    const ahead = bez(a, g.nodes[s.from]! as [number, number], b, Math.min(1, u + 0.05))
    face = metresBetween(at, ahead) > 0.01 ? bearingOf(at, ahead) : road
  } else at = point(g, s.from, s.to, s.along)
  // Turn the drawn car smoothly toward where it is going.
  const diff = ((face - s.heading + 540) % 360) - 180
  s.heading = (s.heading + diff * Math.min(1, dt * 8) + 360) % 360
  // Keep left; overtaking moves into the other lane; parked pulls to the left edge (§3, §5, §8).
  const twoWay = s.from !== s.to && isTwoWay(g, s.from, s.to)
  const offset = s.parked ? (twoWay ? 3.2 : 2.4) : twoWay ? LANE_OFFSET_M * (1 - 2 * s.shift) : 0
  const [lat, lng] = offset ? toTheLeft(at[0], at[1], face, offset) : at
  const signal = s.parked ? null : indicator(turn, s.length - s.along, s.v)
  return { lat, lng, heading: s.heading, braking: braking || s.parked, signal }
}

const bearingOf = (a: [number, number], b: [number, number]) => {
  const k = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180)
  return ((Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI + 360) % 360
}

// A demo taxi on a job: it drives this route (to the pickup, then the destination) at TRIP_SPEED
// from when the job started, then waits at the end. The rest keep driving at random.
export const TRIP_SPEED = 8 // m/s, about 29 km/h
interface Run {
  path: [number, number][]
  cum: number[]
  start: number // performance.now() when it set off
  pickupAt: number // metres along the path where the pickup is
  d: number // metres driven so far
  v: number // m/s now
  last: number // performance.now() of the last frame
  pausedUntil: number // stopped at the pickup until then (the passenger getting in)
  pickedUp: boolean
}
const runs = new Map<string, Run>()

export function driveTrip(id: string, raw: [number, number][], pickupAt: number) {
  const path = roundCorners(raw)
  const cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + metresBetween(path[i - 1]!, path[i]!))
  runs.set(id, { path, cum, start: performance.now(), pickupAt, d: 0, v: 0, last: performance.now(), pausedUntil: 0, pickedUp: false })
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
  const done = Math.min(total, r.d)
  let i = 0
  while (i < r.cum.length - 1 && r.cum[i + 1]! <= done) i++
  return { done, total, pickupAt: r.pickupAt, rest: r.path.slice(i + 1) }
}

// The heading of the trip's path at `d` metres along it.
function runHeading(r: Run, d: number) {
  let i = 0
  while (i < r.cum.length - 2 && r.cum[i + 1]! < d) i++
  const p = r.path[i]!
  const q = r.path[Math.min(i + 1, r.path.length - 1)]!
  return bearingOf(p, q)
}

// One frame of a taxi on a ride: the same speed rules as roaming (cruise at the road's speed, slow
// for the corners ahead, brake to a stop at the end), along the trip's route.
function along(g: RoadGraph, r: Run, now: number, last: Position | undefined): Position {
  const total = r.cum[r.cum.length - 1]!
  const dt = Math.min(0.1, Math.max(0, (now - r.last) / 1000))
  r.last = now
  const here = runHeading(r, r.d)
  let want = cruiseSpeed('car', roadLimitKmh(undefined, r.path[0]!), 0.7)
  for (const ahead of [6, 12, 20]) {
    if (r.d + ahead >= total) break
    const corner = cornerSpeed('car', turnAngle(here, runHeading(r, r.d + ahead)), want)
    want = Math.min(want, brakingSpeed(corner, ahead - 4, HANDLING.car.brake))
  }
  want = Math.min(want, brakingSpeed(0, total - r.d, HANDLING.car.brake)) // stop at the end
  // Stop at the pickup and wait about 15 s for the passenger (§8).
  if (!r.pickedUp) {
    want = Math.min(want, brakingSpeed(0, r.pickupAt - r.d, HANDLING.car.brake))
    if (r.d >= r.pickupAt - 0.5 && r.v < 0.3) {
      r.pickedUp = true
      r.pausedUntil = now + 15_000
    }
  }
  const paused = now < r.pausedUntil
  if (paused) want = 0
  const braking = want < r.v - 0.05
  r.v = nextSpeed(r.v, want, 'car', dt)
  r.d = Math.min(total, r.d + r.v * dt)
  const d = r.d
  let i = 0
  while (i < r.cum.length - 2 && r.cum[i + 1]! < d) i++
  const p = r.path[i]!
  const q = r.path[Math.min(i + 1, r.path.length - 1)]!
  const seg = r.cum[i + 1] !== undefined ? r.cum[i + 1]! - r.cum[i]! : 0
  const f = seg ? Math.min(1, (d - r.cum[i]!) / seg) : 0
  const k = Math.cos((p[0] * Math.PI) / 180)
  const heading = seg ? ((Math.atan2((q[1] - p[1]) * k, q[0] - p[0]) * 180) / Math.PI + 360) % 360 : (last?.heading ?? 0)
  // Keep left on two-way roads (the trip's first and last stretch, to a house, count as two-way).
  // Keep left; pulled to the left edge while stopped at the pickup or the destination (§8).
  const stopped = paused || r.d >= total - 0.5
  const twoWay = twoWayBetween(g, p, q)
  const pos: [number, number] = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]
  const [lat, lng] = seg ? (stopped ? toTheLeft(pos[0], pos[1], heading, twoWay ? 3.2 : 2.4) : inLane(pos[0], pos[1], heading, twoWay)) : [p[0], p[1]]
  return { lat, lng, heading, braking: braking || stopped }
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
    traffic(sims.filter((x) => !runs.has(x.id)), now, dt)
    for (let k = 0; k < sims.length; k++) {
      const s = sims[k]!
      const run = runs.get(s.id)
      if (run) {
        out.set(s.id, along(s.g, run, now, last.get(s.id)))
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
          fresh.prev = n
          fresh.from = n
          fresh.to = opts.length ? opts[0]! : n
          fresh.along = 0
          fresh.length = metres(g, fresh.from, fresh.to)
          fresh.parked = false
          fresh.v = 0
          pickAfter(fresh)
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

const CAR_M = 4.5
const GAP_S = 2 // seconds behind the vehicle ahead
const STOP_GAP_M = 4

// Traffic, once a frame (plans/vehicle-movement-rules.md §4–§5): each roaming taxi sees the vehicle
// ahead (same road, or just round the next corner) and keeps a 2-second gap; it may overtake a slow
// one on a long straight two-way road with nothing coming; and it slows and gives way at junctions
// (main road first; on equal roads, whoever arrived first; never waiting more than 6 s).
export function traffic(sims: Sim[], now: number, dt: number) {
  const onEdge = new Map<string, Sim[]>()
  for (const s of sims) {
    const k = `${s.from},${s.to}`
    const list = onEdge.get(k)
    if (list) list.push(s)
    else onEdge.set(k, [s])
  }
  const approaching = new Map<number, Sim[]>() // node -> taxis within 15 m of it
  for (const s of sims) {
    s.cap = Infinity
    if (s.parked || s.from === s.to) continue
    const toNode = s.length - s.along
    if (toNode < 15) {
      if (!s.arrived) s.arrived = now
      const list = approaching.get(s.to)
      if (list) list.push(s)
      else approaching.set(s.to, [s])
    } else s.arrived = 0
  }
  for (const s of sims) {
    if (s.parked || s.from === s.to) continue
    const g = s.g
    // The vehicle ahead.
    let leader: Sim | null = null
    let gap = Infinity
    for (const o of onEdge.get(`${s.from},${s.to}`) ?? [])
      if (o !== s && o.along > s.along && o.along - s.along < gap) {
        gap = o.along - s.along
        leader = o
      }
    if (!leader)
      for (const o of onEdge.get(`${s.to},${s.after}`) ?? [])
        if (o !== s && o.along < 20 && s.length - s.along + o.along < gap) {
          gap = s.length - s.along + o.along
          leader = o
        }
    // Overtake a slow one on a long straight two-way road with nothing coming the other way.
    const cruise = cruiseSpeed('car', edgeLimit(g, s.from, s.to), s.driver)
    if (s.passing && (s.passing.from !== s.from || s.passing.to !== s.to || s.along > s.passing.along + 12)) s.passing = null
    if (!s.passing && leader && leader.v < cruise * 0.6 && gap < 30 && s.length >= 80 && s.length - s.along > 45 && isTwoWay(g, s.from, s.to) && !(onEdge.get(`${s.to},${s.from}`) ?? []).length) s.passing = leader
    s.shift += ((s.passing ? 1 : 0) - s.shift) * Math.min(1, dt * 1.5)
    if (leader && leader !== s.passing) {
      const room = gap - CAR_M - STOP_GAP_M
      const keep = leader.v * GAP_S
      s.cap = Math.min(s.cap, room <= 0 ? 0 : Math.max(0, Math.min(brakingSpeed(leader.v, room - keep, HANDLING.car.brake), leader.v + room / GAP_S)))
    }
    // Give way at the junction ahead.
    const waiting = approaching.get(s.to) ?? []
    if (s.length - s.along < 15 && waiting.length > 1) {
      const myLimit = edgeLimit(g, s.from, s.to)
      const first = waiting.some(
        (o) => o !== s && o.from !== s.from && (edgeLimit(g, o.from, o.to) > myLimit || (edgeLimit(g, o.from, o.to) === myLimit && o.arrived < s.arrived)),
      )
      const crossing = sims.some((o) => o !== s && o.from === s.to && o.along < 6 && o.prev !== s.from && o.v > 0.5)
      if ((first || crossing) && now - s.arrived < 6000) s.cap = Math.min(s.cap, brakingSpeed(0, Math.max(0, s.length - s.along - 7), HANDLING.car.brake))
    }
  }
}

// For tests: drive one simulated taxi on a road map, frame by frame.
export const __sim = { create, step, traffic }

