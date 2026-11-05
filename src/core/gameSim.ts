// TaxiQ Game core: the shared game world. Every player's device computes the same car positions
// from the game's seed, each car's current plan and the game time, so the map stays in sync while the
// database only stores plans (when a car's job changes), never positions. Pure functions; no DOM.

import { metres, nearestNode, type RoadGraph } from './route'

// Game seconds per real second. 1 real minute = 6 game minutes, so a trip across town takes about
// half a minute to watch and the clock still says how long it took.
export const SIM_RATE = 6
export const GAME_MINUTES_PER_REAL_MINUTE = SIM_RATE

export type Preset = 'small' | 'standard' | 'large'

// Room presets (plans/game-mode.md §5.3). Capital in MVR; shown as Dinar/Dirham in later phases.
export const PRESETS: Record<Preset, { maxPlayers: number; cars: number; centers: number; bankCapitalMvr: number }> = {
  small: { maxPlayers: 4, cars: 8, centers: 1, bankCapitalMvr: 2_500_000 },
  standard: { maxPlayers: 8, cars: 20, centers: 2, bankCapitalMvr: 6_000_000 },
  large: { maxPlayers: 8, cars: 60, centers: 4, bankCapitalMvr: 18_000_000 },
}

// Small seeded PRNG (mulberry32) and string hash, so every device draws the same numbers.
export function hash(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function bearing(p: readonly [number, number], q: readonly [number, number]) {
  const k = Math.cos((((p[0] + q[0]) / 2) * Math.PI) / 180)
  return ((Math.atan2((q[1] - p[1]) * k, q[0] - p[0]) * 180) / Math.PI + 360) % 360
}

export interface CarPose {
  lat: number
  lng: number
  heading: number
}

// What a car is doing, stored in games/{id}/cars/{n}.plan. Times are game seconds.
// - roam: a seeded random walk from road node `n`, starting at `t0`, at `v` m/s (0 = parked there)
// - path: drive along the flat [lat, lng, lat, lng, …] polyline `p` from `t0` at `v` m/s, then park
export type CarPlan = { k: 'roam'; n: number; t0: number; v: number } | { k: 'path'; p: number[]; t0: number; v: number }

export const TRIP_SPEED = 8 // m/s (~29 km/h) on jobs and when driving to a waiting spot

// The plan every car starts the game with: a seeded node and speed (about 30% parked).
export function initialPlan(g: RoadGraph, seed: string, carNo: number): CarPlan {
  const r = rng(hash(`${seed}:${carNo}`) ^ 0x9e3779b9)
  const n = Math.floor(r() * g.nodes.length)
  return { k: 'roam', n, t0: 0, v: r() < 0.3 ? 0 : 5 + r() * 5 }
}
// The cruising speed a bot car uses after a job (never parked).
export function botSpeed(seed: string, carNo: number) {
  const r = rng(hash(`${seed}:${carNo}:v`))
  return 5 + r() * 5
}

// Seeded random walk on the road graph (no U-turns unless at a dead end). Keeps its progress, so
// asking for later times only walks forward.
class Roamer {
  private readonly g: RoadGraph
  private readonly seed: number
  private readonly start: number
  private readonly v: number
  private rand!: () => number
  from!: number
  to!: number
  private edgeStart!: number
  private edgeLen!: number

  constructor(g: RoadGraph, seed: number, start: number, v: number) {
    this.g = g
    this.seed = seed
    this.start = start
    this.v = v
    this.reset()
  }

  private reset() {
    this.rand = rng(this.seed)
    this.from = this.start
    const opts = this.g.next[this.from] ?? []
    this.to = opts.length ? opts[Math.floor(this.rand() * opts.length)]! : this.from
    this.edgeStart = 0
    this.edgeLen = metres(this.g.nodes[this.from]!, this.g.nodes[this.to]!)
  }

  at(dt: number): CarPose {
    const d = Math.max(0, dt) * this.v
    if (d < this.edgeStart) this.reset() // time went backwards (e.g. reload): start over
    let guard = 0
    while (this.edgeLen > 0 && d >= this.edgeStart + this.edgeLen && guard++ < 1_000_000) {
      const opts = this.g.next[this.to] ?? []
      if (!opts.length) break
      const forward = opts.filter((n) => n !== this.from)
      const pool = forward.length ? forward : opts
      const next = pool[Math.floor(this.rand() * pool.length)]!
      this.edgeStart += this.edgeLen
      this.from = this.to
      this.to = next
      this.edgeLen = metres(this.g.nodes[this.from]!, this.g.nodes[this.to]!)
    }
    const p = this.g.nodes[this.from]!
    const q = this.g.nodes[this.to]!
    const f = this.edgeLen ? Math.min(1, (d - this.edgeStart) / this.edgeLen) : 0
    return { lat: p[0] + (q[0] - p[0]) * f, lng: p[1] + (q[1] - p[1]) * f, heading: bearing(p, q) }
  }
}

class PathRunner {
  private readonly pts: [number, number][]
  private readonly cum: number[]
  readonly total: number
  private readonly t0: number
  private readonly v: number

  constructor(p: readonly number[], t0: number, v: number) {
    this.pts = []
    for (let i = 0; i + 1 < p.length; i += 2) this.pts.push([p[i]!, p[i + 1]!])
    if (!this.pts.length) this.pts.push([0, 0])
    this.cum = [0]
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1]! + metres(this.pts[i - 1]!, this.pts[i]!))
    this.total = this.cum[this.cum.length - 1]!
    this.t0 = t0
    this.v = v
  }

  at(t: number): CarPose {
    const d = Math.min(this.total, Math.max(0, (t - this.t0) * this.v))
    let lo = 0
    let hi = this.cum.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid]! <= d) lo = mid
      else hi = mid
    }
    const a = this.pts[lo]!
    const b = this.pts[Math.min(lo + 1, this.pts.length - 1)]!
    const seg = this.cum[lo + 1] !== undefined ? this.cum[lo + 1]! - this.cum[lo]! : 0
    const f = seg ? (d - this.cum[lo]!) / seg : 0
    // Heading of the current segment, or the last real segment when parked at the end.
    let i = lo
    while (i > 0 && metres(this.pts[i]!, this.pts[Math.min(i + 1, this.pts.length - 1)]!) === 0) i--
    const h = bearing(this.pts[i]!, this.pts[Math.min(i + 1, this.pts.length - 1)]!)
    return { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f, heading: h }
  }
}

// One car following its plan. Make a new runner when the plan changes.
export class CarRunner {
  private readonly g: RoadGraph
  private readonly plan: CarPlan
  private readonly roam: Roamer | null
  private readonly path: PathRunner | null

  constructor(g: RoadGraph, seed: string, carNo: number, plan: CarPlan) {
    this.g = g
    this.plan = plan
    this.roam = plan.k === 'roam' ? new Roamer(g, hash(`${seed}:${carNo}:${plan.t0}`), plan.n, plan.v) : null
    this.path = plan.k === 'path' ? new PathRunner(plan.p, plan.t0, plan.v) : null
  }

  at(t: number): CarPose {
    return this.roam ? this.roam.at(t - this.plan.t0) : this.path!.at(t)
  }

  // Where a new job starts from: the car's pose now and the road node to route from (the junction
  // it is heading to, so it doesn't turn around in the middle of a road).
  start(t: number): { pose: CarPose; node: number } {
    const pose = this.at(t)
    if (this.roam && this.plan.k === 'roam' && this.plan.v > 0) return { pose, node: this.roam.to }
    return { pose, node: nearestNode(this.g, [pose.lat, pose.lng]) }
  }
}

// The game clock: game time from when the game started (paused time not counted).
export function gameClock(startedAtMs: number, nowMs: number, pausedMs = 0, rate = GAME_MINUTES_PER_REAL_MINUTE) {
  const realSec = Math.max(0, (nowMs - startedAtMs - pausedMs) / 1000)
  const gameSec = realSec * rate
  const gameMin = gameSec / 60
  const day = Math.floor(gameMin / (24 * 60)) + 1
  const minuteOfDay = Math.floor(gameMin % (24 * 60))
  // Days start at 06:00 so the first game day begins in the morning.
  const clock = (minuteOfDay + 6 * 60) % (24 * 60)
  return { realSec, gameSec, gameMin, day, hh: Math.floor(clock / 60), mm: clock % 60 }
}

// Game time of any moment (game seconds) as day + hh:mm, for the logbook.
export function clockAt(gameSec: number) {
  const gameMin = gameSec / 60
  const clock = (Math.floor(gameMin % (24 * 60)) + 6 * 60) % (24 * 60)
  return { day: Math.floor(gameMin / (24 * 60)) + 1, hh: Math.floor(clock / 60), mm: clock % 60 }
}

// Join codes: 6 letters/digits without look-alikes (no 0/O, 1/I/L).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function newJoinCode(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('')
}
export const isJoinCode = (s: string) => /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(s)
