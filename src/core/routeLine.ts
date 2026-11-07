// A bus's own route as a line (built from its stops in order, joined along the roads): where the
// bus is along it, the stretch between two points, and the next stop. Buses are matched to their
// route, not just the nearest road, and only ever move forward along it (wrapping round on circular
// routes). Pure functions.

import { metres } from './glide'

export interface RouteLine {
  pts: [number, number][]
  cum: number[]
  length: number
  loop: boolean // the route ends where it starts
  stops: number[] // metres along the line of each stop
}

export function makeLine(pts: [number, number][], stopAt: [number, number][] = []): RouteLine {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + metres(pts[i - 1]!, pts[i]!))
  const length = cum[cum.length - 1] ?? 0
  const line: RouteLine = { pts, cum, length, loop: pts.length > 2 && metres(pts[0]!, pts[pts.length - 1]!) < 60, stops: [] }
  line.stops = stopAt.map((p) => project(line, p).s).sort((a, b) => a - b)
  return line
}

// The nearest point on the line: metres along it (s) and how far off it (dist).
export function project(line: RouteLine, p: [number, number]): { s: number; dist: number } {
  let best = { s: 0, dist: Infinity }
  const k = Math.cos((p[0] * Math.PI) / 180)
  for (let i = 1; i < line.pts.length; i++) {
    const a = line.pts[i - 1]!
    const b = line.pts[i]!
    const ax = (a[1] - p[1]) * 111_320 * k
    const ay = (a[0] - p[0]) * 111_320
    const vx = (b[1] - a[1]) * 111_320 * k
    const vy = (b[0] - a[0]) * 111_320
    const len2 = vx * vx + vy * vy
    const t = len2 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2)) : 0
    const dist = Math.hypot(ax + t * vx, ay + t * vy)
    if (dist < best.dist) best = { s: line.cum[i - 1]! + t * (line.cum[i]! - line.cum[i - 1]!), dist }
  }
  return best
}

export function pointAt(line: RouteLine, s: number): [number, number] {
  const x = Math.max(0, Math.min(line.length, s))
  let i = 1
  while (i < line.cum.length - 1 && line.cum[i]! < x) i++
  const a = line.pts[i - 1]!
  const b = line.pts[i]!
  const seg = line.cum[i]! - line.cum[i - 1]!
  const t = seg ? (x - line.cum[i - 1]!) / seg : 0
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

// How far forward from s1 to s2 along the route (wrapping round a circular route).
export function forward(line: RouteLine, s1: number, s2: number) {
  const d = s2 - s1
  return d >= 0 || !line.loop ? d : d + line.length
}

// The points from s1 forward to s2 (wrapping round a circular route).
export function stretch(line: RouteLine, s1: number, s2: number): [number, number][] {
  const out: [number, number][] = [pointAt(line, s1)]
  const add = (from: number, to: number) => {
    for (let i = 0; i < line.cum.length; i++) if (line.cum[i]! > from && line.cum[i]! < to) out.push(line.pts[i]!)
  }
  if (s2 >= s1 || !line.loop) add(s1, s2)
  else {
    add(s1, line.length)
    out.push(pointAt(line, line.length))
    add(0, s2)
  }
  out.push(pointAt(line, s2))
  return out
}

// The next stop ahead of s (metres along), or null.
export function nextStop(line: RouteLine, s: number): number | null {
  const ahead = line.stops.find((x) => x > s + 5)
  return ahead ?? (line.loop ? (line.stops[0] ?? null) : null)
}
