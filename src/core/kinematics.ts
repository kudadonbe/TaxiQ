// How a real vehicle turns (plans/vehicle-movement-rules.md §3): front-wheel steering, the
// "kinematic bicycle model". The FRONT axle follows the path (the route, in its lane); the REAR
// axle trails one wheelbase behind, always pulled straight toward the front axle, so it cuts a
// little inside every corner. The vehicle's heading is the line rear -> front, and it is drawn
// between the two axles. It can only turn by moving forward: when the front axle doesn't move,
// nothing changes (no spinning in place). Pure functions.

export type AxleType = 'car' | 'van' | 'pickup' | 'bus' | 'motorbike' | 'ebike'

// Metres from the rear axle to the front axle.
export const WHEELBASE_M: Record<AxleType, number> = { car: 2.6, van: 3, pickup: 3, bus: 6, motorbike: 1.3, ebike: 1.3 }

export interface Axles {
  front: [number, number] // [lat, lng]
  rear: [number, number]
}

const M = 111_320
const rad = (d: number) => (d * Math.PI) / 180
const kAt = (lat: number) => Math.cos(rad(lat))

// Both axles of a vehicle standing with its front axle at `front`, facing `heading` (degrees
// clockwise from north).
export function placeAxles(front: readonly [number, number], heading: number, wheelbase: number): Axles {
  const h = rad(heading)
  const k = kAt(front[0])
  return { front: [front[0], front[1]], rear: [front[0] - (Math.cos(h) * wheelbase) / M, front[1] - (Math.sin(h) * wheelbase) / (M * k)] }
}

// The front axle has moved to `front`: the rear axle follows, pulled toward it so it stays one
// wheelbase behind (in small steps, so a long frame still traces the right curve). A move of under
// half a centimetre changes nothing.
export function followFront(ax: Axles, front: readonly [number, number], wheelbase: number): Axles {
  const k = kAt(front[0])
  const moved = Math.hypot((front[0] - ax.front[0]) * M, (front[1] - ax.front[1]) * M * k)
  if (moved < 0.005) return ax
  const steps = Math.min(400, Math.max(1, Math.ceil(moved / (wheelbase / 32))))
  let rear = ax.rear
  for (let s = 1; s <= steps; s++) {
    const f = s / steps
    const fLat = ax.front[0] + (front[0] - ax.front[0]) * f
    const fLng = ax.front[1] + (front[1] - ax.front[1]) * f
    const dN = (fLat - rear[0]) * M
    const dE = (fLng - rear[1]) * M * k
    const d = Math.hypot(dN, dE)
    if (d < 1e-6) continue
    rear = [fLat - ((dN / d) * wheelbase) / M, fLng - ((dE / d) * wheelbase) / (M * k)]
  }
  return { front: [front[0], front[1]], rear }
}

// The way the vehicle faces: from the rear axle to the front axle.
export function axleHeading(ax: Axles): number {
  const k = kAt((ax.front[0] + ax.rear[0]) / 2)
  return ((Math.atan2((ax.front[1] - ax.rear[1]) * k, ax.front[0] - ax.rear[0]) * 180) / Math.PI + 360) % 360
}

// Where the vehicle is drawn: half way between its axles.
export const axleCentre = (ax: Axles): [number, number] => [(ax.front[0] + ax.rear[0]) / 2, (ax.front[1] + ax.rear[1]) / 2]

// Drive the front axle along a polyline (for tests and simple uses): the rear's trail and the
// heading at each step of `stepM` metres.
export function traceAxles(path: readonly [number, number][], heading: number, wheelbase: number, stepM = 0.1) {
  let ax = placeAxles(path[0]!, heading, wheelbase)
  const rears: [number, number][] = [ax.rear]
  const headings: number[] = [axleHeading(ax)]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const len = Math.hypot((b[0] - a[0]) * M, (b[1] - a[1]) * M * kAt(a[0]))
    const n = Math.max(1, Math.ceil(len / stepM))
    for (let s = 1; s <= n; s++) {
      ax = followFront(ax, [a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n], wheelbase)
      rears.push(ax.rear)
      headings.push(axleHeading(ax))
    }
  }
  return { axles: ax, rears, headings }
}
