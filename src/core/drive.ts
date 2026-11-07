// How simulated vehicles drive (plans/vehicle-movement-rules.md §1–§3): speed limits by place and
// road, gentle acceleration and braking by vehicle type, slowing for corners, wider or tighter
// turns, bikes leaning, and indicators before a turn. Pure functions.

export type DriveType = 'car' | 'van' | 'pickup' | 'bus' | 'motorbike' | 'ebike'

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
