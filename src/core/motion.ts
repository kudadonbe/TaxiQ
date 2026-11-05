// TaxiQ core: smooth car movement from real GPS. GPS arrives every few seconds and jumps; the map
// glides each car from where it is drawn now to the newest fix, and turns it to face where it is
// going. Pure functions (no DOM, no timers) so they can be tested.

export interface Fix {
  lat: number
  lng: number
  heading: number | null // degrees clockwise from north, if the phone reports it
  at: number // ms
}

export interface Drawn {
  lat: number
  lng: number
  heading: number
}

const M_PER_DEG = 111_320
const rad = (d: number) => (d * Math.PI) / 180

export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const k = Math.cos(rad((a.lat + b.lat) / 2))
  return Math.hypot((b.lat - a.lat) * M_PER_DEG, (b.lng - a.lng) * M_PER_DEG * k)
}

// Compass bearing from a to b, 0 = north.
export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const k = Math.cos(rad((a.lat + b.lat) / 2))
  const deg = (Math.atan2((b.lng - a.lng) * k, b.lat - a.lat) * 180) / Math.PI
  return (deg + 360) % 360
}

// Turn the shortest way round from one heading towards another by fraction f (0..1).
export function turn(from: number, to: number, f: number): number {
  const diff = ((to - from + 540) % 360) - 180
  return (from + diff * Math.max(0, Math.min(1, f)) + 360) % 360
}

export interface Glide {
  from: Drawn
  to: Fix
  start: number // ms, when the glide began
  duration: number // ms
}

// Start gliding from what is drawn now to a new fix. The car faces the reported heading, or the
// direction of travel when it moved far enough to tell; otherwise it keeps its heading (GPS jitter
// while parked must not spin the car).
export function startGlide(drawn: Drawn | null, fix: Fix, now: number, duration: number, minMoveM = 3): { glide: Glide; heading: number } {
  const from = drawn ?? { lat: fix.lat, lng: fix.lng, heading: fix.heading ?? 0 }
  const moved = metres(from, fix) >= minMoveM
  const heading = fix.heading ?? (moved ? bearing(from, fix) : from.heading)
  return { glide: { from, to: { ...fix, heading }, start: now, duration: drawn ? duration : 0 }, heading }
}

// Where to draw the car at time `now` during a glide (eased, never overshooting the fix).
export function glideAt(g: Glide, now: number): Drawn {
  const t = g.duration <= 0 ? 1 : Math.max(0, Math.min(1, (now - g.start) / g.duration))
  const e = t * (2 - t) // ease-out
  return {
    lat: g.from.lat + (g.to.lat - g.from.lat) * e,
    lng: g.from.lng + (g.to.lng - g.from.lng) * e,
    heading: turn(g.from.heading, g.to.heading ?? g.from.heading, Math.min(1, t * 1.5)),
  }
}

export function isStale(fixAt: number, now: number, staleAfterMs: number): boolean {
  return now - fixAt > staleAfterMs
}
