import { isFresh, type BeatLevel } from './heartbeat'

// Citizens showing themselves on the map (opt-in). Pure helpers: how someone is moving, guessed from
// their GPS speed, and when a shared position is too old to show.

export type Moving = 'walk' | 'run' | 'bike' | 'ebike' | 'motorbike' | 'taxi'
export const MOVING: Moving[] = ['walk', 'run', 'bike', 'ebike', 'motorbike', 'taxi']

export const SHARE_MAX_MS = 60 * 60_000 // sharing stops by itself after 1 hour
export const STALE_MS = 2 * 60_000 // a position not updated for 2 minutes is hidden (app closed)
export const UPDATE_MS = 10_000 // send at most every 10 s ...
export const UPDATE_M = 15 // ... or sooner after moving this far

// Guess from speed (m/s): the median of recent readings, so one GPS jump doesn't flip it. GPS
// speed is noisy and an e-bike and a motorbike overlap, so the person can always correct it.
// `inRide`: they have a taxi ride in progress, so fast movement is the taxi.
export function guessMoving(speeds: readonly number[], inRide = false): Moving {
  const ok = speeds.filter((s) => Number.isFinite(s) && s >= 0)
  if (!ok.length) return 'walk'
  const sorted = [...ok].sort((a, b) => a - b)
  const v = sorted[Math.floor(sorted.length / 2)]!
  if (v < 2) return 'walk' // under ~7 km/h
  if (v < 3.6) return 'run' // ~7–13 km/h
  if (v < 6.5) return 'bike' // ~13–23 km/h
  if (v < 9) return 'ebike' // ~23–32 km/h
  return inRide ? 'taxi' : 'motorbike'
}

// Speed between two fixes when the device doesn't report one (m/s).
export function speedBetween(a: { lat: number; lng: number; t: number }, b: { lat: number; lng: number; t: number }) {
  const dt = (b.t - a.t) / 1000
  if (dt <= 0) return NaN
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  return Math.hypot((b.lat - a.lat) * 111_320, (b.lng - a.lng) * 111_320 * k) / dt
}

// Show a shared position only while it is fresh and within its hour.
// Fresh for its heartbeat level (src/core/heartbeat.ts), and within its hour.
export const isLive = (p: { updatedAt: number; expiresAt: number; level?: BeatLevel }, now: number) => isFresh(p, now) && now < p.expiresAt

// How a person sharing their position is drawn on the 3D map (their own choice, Show me on the map,
// remembered on the device and written with the position). 'plain' (the default) is a neutral
// figure. Clothing colours are an index into LOOK_COLOURS (src/core/figures.ts). Keep both lists in
// step with firestore.rules (presenceShape).
export const PERSON_LOOKS = ['plain', 'man-casual', 'man-tshirt', 'man-formal', 'woman-hijab', 'woman-libaas', 'woman-sport', 'young'] as const
export type PersonLook = (typeof PERSON_LOOKS)[number]
export const LOOK_COLOUR_COUNT = 6
export const isPersonLook = (x: unknown): x is PersonLook => typeof x === 'string' && (PERSON_LOOKS as readonly string[]).includes(x)
export const isLookColour = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < LOOK_COLOUR_COUNT
// Read from stored or received data: anything unknown is the default.
export const lookOf = (x: unknown): PersonLook => (isPersonLook(x) ? x : 'plain')
export const lookColourOf = (x: unknown): number => (isLookColour(x) ? x : 0)
