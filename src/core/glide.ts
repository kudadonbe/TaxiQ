// Smooth movement for vehicles whose position arrives now and then (the owner's phone reports every
// few seconds): glide from where the marker is shown to the new position over the gap between
// reports, facing the way it is going, so it looks like driving, not jumping. Pure functions.

export interface Glide {
  from: [number, number]
  to: [number, number]
  path: [number, number][] // the way it drives, from `from` to `to` (along the roads when known)
  cum: number[] // metres along the path at each point
  start: number // ms when this glide began
  dur: number // ms it takes
  heading: number // degrees clockwise from north, the way it is going
}

export const MIN_GLIDE_MS = 800
export const MAX_GLIDE_MS = 12_000
const MOVED_M = 3 // below this, a report is GPS jitter: keep the heading

export function metres(a: readonly [number, number], b: readonly [number, number]) {
  const k = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180)
  return Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * k)
}
export function bearing(a: readonly [number, number], b: readonly [number, number]) {
  const k = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180)
  return ((Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI + 360) % 360
}

// Where the marker is, which stretch it's on and the way that stretch goes, at `now`: a steady
// speed along the path, like driving.
export function glideState(g: Glide, now: number): { at: [number, number]; a: [number, number]; b: [number, number]; heading: number } {
  const f = g.dur > 0 ? Math.min(1, Math.max(0, (now - g.start) / g.dur)) : 1
  const total = g.cum[g.cum.length - 1] ?? 0
  if (g.path.length < 2 || total === 0) return { at: g.to, a: g.from, b: g.to, heading: g.heading }
  const d = f * total
  let i = 0
  while (i < g.cum.length - 2 && g.cum[i + 1]! < d) i++
  const a = g.path[i]!
  const b = g.path[i + 1]!
  const seg = g.cum[i + 1]! - g.cum[i]!
  const t = seg ? (d - g.cum[i]!) / seg : 1
  const heading = metres(a, b) >= MOVED_M ? bearing(a, b) : g.heading
  return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], a, b, heading }
}
export const glideAt = (g: Glide, now: number) => glideState(g, now).at

// A new report arrived: glide on from where it is shown now. The glide lasts as long as the gap
// since the last report (so it keeps moving until the next one), within limits. The heading is the
// phone's own when it gives one, else the direction of travel; tiny moves keep the old heading.
// `route`: the roads from where it is shown to `to`, if known (else a straight line).
export function nextGlide(prev: Glide | null, to: [number, number], now: number, lastReport: number | null, phoneHeading?: number | null, route?: [number, number][]): Glide {
  const from = prev ? glideAt(prev, now) : to
  const gap = lastReport === null ? MIN_GLIDE_MS : now - lastReport
  const dur = prev ? Math.min(MAX_GLIDE_MS, Math.max(MIN_GLIDE_MS, gap)) : 0
  const moved = metres(from, to) >= MOVED_M
  const path: [number, number][] = prev && moved ? (route && route.length >= 2 ? [from, ...route.slice(1, -1), to] : [from, to]) : [to]
  const cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + metres(path[i - 1]!, path[i]!))
  const last = path.length >= 2 ? bearing(path[path.length - 2]!, path[path.length - 1]!) : (prev?.heading ?? 0)
  const heading = typeof phoneHeading === 'number' && phoneHeading > 0 ? phoneHeading : moved ? last : (prev?.heading ?? 0)
  return { from, to, path, cum, start: now, dur, heading }
}

// Turn the shown heading toward the target a little each frame (the shortest way round).
export function turnToward(shown: number, target: number, dtMs: number) {
  const diff = ((target - shown + 540) % 360) - 180
  return (shown + diff * Math.min(1, dtMs / 250) + 360) % 360
}
