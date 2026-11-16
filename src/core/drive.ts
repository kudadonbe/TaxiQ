// How simulated vehicles drive (plans/vehicle-movement-rules.md §1–§3): speed limits by place and
// road, gentle acceleration and braking by vehicle type, slowing for corners, wider or tighter
// turns, bikes leaning, and indicators before a turn. Pure functions.

export type DriveType = 'car' | 'van' | 'pickup' | 'bus' | 'motorbike' | 'ebike' | 'bicycle'

const kmh = (x: number) => x / 3.6

// §1 Speed limits (km/h) by road kind, from OpenStreetMap's highway or the vector tiles' class.
export function roadLimitKmh(kind: string | undefined, at: readonly [number, number]): number {
  const k = (kind ?? '').toLowerCase()
  let limit = 30 // other island roads
  if (/^(motorway|trunk|primary|secondary)(_link)?$/.test(k)) limit = 40
  else if (/^(service|living_street|track|parking|parking_aisle|busway)$/.test(k)) limit = 10
  // Malé's streets are narrow and busy: at most 25 km/h there.
  if (inMale(at)) limit = Math.min(limit, 25)
  return limit
}
const inMale = (p: readonly [number, number]) => p[0] >= 4.166 && p[0] <= 4.183 && p[1] >= 73.497 && p[1] <= 73.524

// §2 Handling by type: top speed cap, acceleration (m/s²), normal braking (m/s²), how wide it takes
// corners (metres of curve), how fast it may take a 90° corner, and whether it leans.
export const HANDLING: Record<DriveType, { capKmh: number; speedShare: number; accel: number; brake: number; cornerM: number; corner90Kmh: number; leans: boolean }> = {
  car: { capKmh: 60, speedShare: 1, accel: kmh(30) / 5, brake: 2.5, cornerM: 5, corner90Kmh: 12, leans: false },
  van: { capKmh: 60, speedShare: 0.9, accel: kmh(30) / 6, brake: 2.2, cornerM: 7, corner90Kmh: 11, leans: false },
  pickup: { capKmh: 60, speedShare: 0.9, accel: kmh(30) / 6, brake: 2.2, cornerM: 7, corner90Kmh: 11, leans: false },
  bus: { capKmh: 35, speedShare: 0.85, accel: kmh(30) / 9, brake: 1.8, cornerM: 10, corner90Kmh: 10, leans: false },
  motorbike: { capKmh: 60, speedShare: 1, accel: kmh(30) / 3.5, brake: 3, cornerM: 3, corner90Kmh: 14, leans: true },
  ebike: { capKmh: 25, speedShare: 1, accel: kmh(30) / 5, brake: 2.5, cornerM: 3, corner90Kmh: 13, leans: true },
  bicycle: { capKmh: 20, speedShare: 1, accel: kmh(20) / 6, brake: 2.5, cornerM: 2.5, corner90Kmh: 12, leans: true },
}

// The speed a vehicle aims for on a road: the limit (or its type's cap), times its driver's own
// steady share (0.85–1).
export function cruiseSpeed(type: DriveType, limitKmh: number, driver: number) {
  const h = HANDLING[type]
  return kmh(Math.min(h.capKmh, limitKmh * h.speedShare)) * (0.85 + 0.15 * driver)
}

// §3 The speed for a turn of `angle` degrees (0 = straight on): 90° at the type's corner speed,
// 45° at about twice that, under ~15° no slowing; a U-turn at walking pace.
export function cornerSpeed(type: DriveType, angle: number, cruise: number) {
  const a = Math.abs(angle)
  if (a < 15) return cruise
  if (a > 150) return kmh(5)
  const c90 = kmh(HANDLING[type].corner90Kmh)
  const s = c90 * (90 / Math.max(a, 30)) ** 0.9
  return Math.min(cruise, s)
}

// The fastest it may go now and still slow to `target` by `dist` metres ahead, braking normally.
export const brakingSpeed = (target: number, dist: number, brake: number) => Math.sqrt(target * target + 2 * brake * Math.max(0, dist))

// One step of speed: toward `want`, never faster than the acceleration or braking allow.
export function nextSpeed(v: number, want: number, type: DriveType, dt: number) {
  const h = HANDLING[type]
  if (want > v) return Math.min(want, v + h.accel * dt)
  return Math.max(want, v - h.brake * 1.6 * dt) // a little firmer than normal when it must
}

// The signed turn at a junction, -180..180 (positive = right turn).
export const turnAngle = (inHeading: number, outHeading: number) => ((outHeading - inHeading + 540) % 360) - 180

// Indicator: blink on the turning side from about 3 s (or 30 m) before a turn of more than 25°.
export function indicator(angle: number, distToTurn: number, v: number): 'left' | 'right' | null {
  if (Math.abs(angle) < 25 || Math.abs(angle) > 150) return null
  return distToTurn <= Math.max(30, v * 3) ? (angle > 0 ? 'right' : 'left') : null
}

// Bikes lean into a turn: from how fast the heading is changing (degrees per second) at speed v.
export function leanDegrees(turnRate: number, v: number) {
  return Math.max(-15, Math.min(15, (turnRate * v) / 25))
}

// Catching up (plans/vehicle-movement-rules.md §6): after lost signal or a big GPS jump a real
// vehicle drives to its new place along the roads, a bit faster than normal: fast enough to get
// there in about 10 s, but never more than 1.5x the road's limit (and never slower than the limit).
export const CATCH_UP_S = 10
export const CATCH_UP_MAX = 1.5
// Further than this would take (at the catch-up speed) and it isn't worth watching it drive: it
// cross-fades into place, standing along its road.
export const CATCH_UP_GIVE_UP_S = 30
export function catchUpSpeed(roadM: number, limitKmh: number) {
  const limit = kmh(limitKmh)
  return Math.min(limit * CATCH_UP_MAX, Math.max(limit, roadM / CATCH_UP_S))
}
// Would a normal glide (this many metres in this many ms) be faster than the road allows? Then it
// is catching up, with the driving rules below.
export const needsCatchUp = (roadM: number, glideMs: number, limitKmh: number) => glideMs <= 0 || roadM / (glideMs / 1000) > kmh(limitKmh) * 1.05

// A speed plan along a path (metres along it every `dt` seconds): start at `v0`, accelerate gently
// toward `cruise`, brake in time for each corner (slower for sharper ones), and come to a stop at
// the end, with the type's acceleration and braking. Corners are read from the path's own bends,
// so pass the path before its corners are rounded.
export interface Profile {
  dt: number // seconds between samples
  d: number[] // metres along the path at each sample (the last is the whole length)
}
export function driveProfile(path: readonly [number, number][], type: DriveType, v0: number, cruise: number, dt = 0.1): Profile {
  const m = (a: readonly [number, number], b: readonly [number, number]) =>
    Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180))
  const bear = (a: readonly [number, number], b: readonly [number, number]) =>
    ((Math.atan2((b[1] - a[1]) * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180), b[0] - a[0]) * 180) / Math.PI + 360) % 360
  const cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + m(path[i - 1]!, path[i]!))
  const total = cum[cum.length - 1] ?? 0
  const corners: { at: number; angle: number }[] = []
  for (let i = 1; i < path.length - 1; i++) {
    if (m(path[i - 1]!, path[i]!) < 0.5 || m(path[i]!, path[i + 1]!) < 0.5) continue
    const angle = turnAngle(bear(path[i - 1]!, path[i]!), bear(path[i]!, path[i + 1]!))
    if (Math.abs(angle) >= 15) corners.push({ at: cum[i]!, angle })
  }
  const h = HANDLING[type]
  const d = [0]
  let x = 0
  let v = Math.max(0, v0)
  for (let guard = 0; x < total - 0.02 && guard < 20_000; guard++) {
    let want = cruise
    for (const c of corners) if (c.at > x && c.at - x < 80) want = Math.min(want, brakingSpeed(cornerSpeed(type, c.angle, cruise), c.at - x - 2, h.brake))
    want = Math.min(want, brakingSpeed(0, total - x, h.brake))
    v = nextSpeed(v, Math.max(want, 0.5), type, dt) // creep the last few centimetres
    x = Math.min(total, x + v * dt)
    d.push(x)
  }
  if (d[d.length - 1] !== total) d.push(total)
  return { dt, d }
}
