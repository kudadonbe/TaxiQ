// TaxiQ Game core: the shared game world. Every player's device computes the same car positions
// from the game's seed and how long it has been running, so the map stays in sync without writing
// positions to the database. Pure functions; no DOM, no timers.

import type { RoadGraph } from './route'

export const GAME_MINUTES_PER_REAL_MINUTE = 60 // 1 real minute = 1 game hour (host can change later)

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

const rad = (d: number) => (d * Math.PI) / 180
function edgeMetres(g: RoadGraph, a: number, b: number) {
  const p = g.nodes[a]!
  const q = g.nodes[b]!
  const k = Math.cos(rad((p[0] + q[0]) / 2))
  return Math.hypot((q[0] - p[0]) * 111_320, (q[1] - p[1]) * 111_320 * k)
}
function bearing(g: RoadGraph, a: number, b: number) {
  const p = g.nodes[a]!
  const q = g.nodes[b]!
  const k = Math.cos(rad((p[0] + q[0]) / 2))
  return ((Math.atan2((q[1] - p[1]) * k, q[0] - p[0]) * 180) / Math.PI + 360) % 360
}

export interface CarPose {
  lat: number
  lng: number
  heading: number
}

// One game car driving a seeded random walk on the road graph (no U-turns unless at a dead end).
// It keeps its progress, so asking for later times only walks forward from where it was.
export class GameCar {
  private readonly g: RoadGraph
  private readonly seed: number
  readonly speed: number // m/s; 0 = waiting at a stand
  private rand!: () => number
  private from!: number
  private to!: number
  private edgeStart!: number // metres travelled when this edge began
  private edgeLen!: number

  constructor(g: RoadGraph, gameSeed: string, carNo: number) {
    this.g = g
    this.seed = hash(`${gameSeed}:${carNo}`)
    const r = rng(this.seed ^ 0x9e3779b9)
    this.speed = r() < 0.3 ? 0 : 5 + r() * 5 // ~30% waiting; others 18–36 km/h
    this.reset()
  }

  private reset() {
    this.rand = rng(this.seed)
    this.from = Math.floor(this.rand() * this.g.nodes.length)
    const opts = this.g.next[this.from]!
    this.to = opts[Math.floor(this.rand() * opts.length)]!
    this.edgeStart = 0
    this.edgeLen = edgeMetres(this.g, this.from, this.to)
  }

  // Where the car is after `elapsedSec` seconds of game time running.
  at(elapsedSec: number): CarPose {
    const d = Math.max(0, elapsedSec) * this.speed
    if (d < this.edgeStart) this.reset() // time went backwards (e.g. reload): start over
    let guard = 0
    while (d >= this.edgeStart + this.edgeLen && guard++ < 1_000_000) {
      const opts = this.g.next[this.to]!
      const forward = opts.filter((n) => n !== this.from)
      const pool = forward.length ? forward : opts
      const next = pool[Math.floor(this.rand() * pool.length)]!
      this.edgeStart += this.edgeLen
      this.from = this.to
      this.to = next
      this.edgeLen = edgeMetres(this.g, this.from, this.to)
    }
    const f = this.edgeLen ? (d - this.edgeStart) / this.edgeLen : 0
    const p = this.g.nodes[this.from]!
    const q = this.g.nodes[this.to]!
    return { lat: p[0] + (q[0] - p[0]) * f, lng: p[1] + (q[1] - p[1]) * f, heading: bearing(this.g, this.from, this.to) }
  }
}

// The game clock: game time from when the game started (paused time not counted).
export function gameClock(startedAtMs: number, nowMs: number, pausedMs = 0, rate = GAME_MINUTES_PER_REAL_MINUTE) {
  const realSec = Math.max(0, (nowMs - startedAtMs - pausedMs) / 1000)
  const gameMin = (realSec * rate) / 60
  const day = Math.floor(gameMin / (24 * 60)) + 1
  const minuteOfDay = Math.floor(gameMin % (24 * 60))
  // Days start at 06:00 so the first game day begins in the morning.
  const clock = (minuteOfDay + 6 * 60) % (24 * 60)
  return { realSec, gameMin, day, hh: Math.floor(clock / 60), mm: clock % 60 }
}

// Join codes: 6 letters/digits without look-alikes (no 0/O, 1/I/L).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function newJoinCode(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('')
}
export const isJoinCode = (s: string) => /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(s)
