// Real GPS: stay calm about odd readings (plans/vehicle-movement-rules.md §6). Small wobbles while
// parked are ignored; an impossible jump, or a step backwards, is held and accepted only when the
// next readings confirm it. Pure functions.

import { bearing, metres } from './glide'

export interface Reading {
  at: [number, number]
  t: number // ms
}
export interface Tracker {
  accepted: Reading | null
  heading: number | null // the way it was last seen going
  held: Reading[]
}
export const newTracker = (): Tracker => ({ accepted: null, heading: null, held: [] })

export const JITTER_M = 8 // a parked phone wobbles this much
export const JUMP_M = 150
const CONFIRM = 2 // readings that must agree with a held one

// What to do with a new reading: `move` it there, `still` (a wobble: stay put), or `hold` it (odd:
// wait for confirmation). The tracker is updated in place.
export function filterReading(tr: Tracker, r: Reading, maxSpeed: number): 'move' | 'still' | 'hold' {
  const a = tr.accepted
  if (!a) {
    tr.accepted = r
    return 'move'
  }
  const d = metres(a.at, r.at)
  const dt = Math.max(0.5, (r.t - a.t) / 1000)
  if (d < JITTER_M) {
    tr.accepted = { at: a.at, t: r.t } // still there
    tr.held = []
    return 'still'
  }
  const tooFast = d / dt > maxSpeed * 1.5
  const tooFar = d > JUMP_M && dt < 20
  const back = tr.heading !== null && d < 40 && Math.abs(((bearing(a.at, r.at) - tr.heading + 540) % 360) - 180) > 150
  if (tooFast || tooFar || back) {
    // Odd: hold it. Accept only when the next readings agree with it (close together and moving
    // plausibly), so one bad fix never moves the vehicle.
    tr.held.push(r)
    if (tr.held.length > CONFIRM) tr.held.shift()
    const agree =
      tr.held.length >= CONFIRM &&
      tr.held.every((h, i) => i === 0 || metres(tr.held[i - 1]!.at, h.at) / Math.max(0.5, (h.t - tr.held[i - 1]!.t) / 1000) <= maxSpeed * 1.5)
    if (!agree) return 'hold'
  }
  tr.heading = bearing(a.at, r.at)
  tr.accepted = r
  tr.held = []
  return 'move'
}
