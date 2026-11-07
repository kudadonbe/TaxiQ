// How often a device sends its position (vehicles available for hire, people showing themselves):
// graduated rest levels, like SmartTiming in kudadonbe/iclock-sync. Moving: Active. Still for a
// while: Rest, then Nap, then (at night only) Sleep, each sending less often. Moving again wakes it to
// Active at once. Each update says its level, so others know how long to wait before treating it
// as gone. Pure functions.

export type BeatLevel = 'active' | 'rest' | 'nap' | 'sleep'
export const BEAT_LEVELS: BeatLevel[] = ['active', 'rest', 'nap', 'sleep']

// How often to send at each level, and how long still before stepping down to it.
export const BEAT_MS: Record<BeatLevel, number> = { active: 10_000, rest: 30_000, nap: 60_000, sleep: 180_000 }
const STILL_FOR: Record<Exclude<BeatLevel, 'active'>, number> = { rest: 60_000, nap: 5 * 60_000, sleep: 15 * 60_000 }
export const WAKE_METRES = 15 // moving this far wakes it to Active

// The deepest level allowed by the time of day: Nap in the day, Sleep at night (22:00–06:00).
export const maxLevel = (hour: number): BeatLevel => (hour >= 22 || hour < 6 ? 'sleep' : 'nap')

// The level after being still for `stillMs` at this hour.
export function beatLevel(stillMs: number, hour: number): BeatLevel {
  const cap = BEAT_LEVELS.indexOf(maxLevel(hour))
  let level: BeatLevel = 'active'
  for (const l of ['rest', 'nap', 'sleep'] as const) if (stillMs >= STILL_FOR[l] && BEAT_LEVELS.indexOf(l) <= cap) level = l
  return level
}

// Others treat a position as gone after two missed beats at its level, plus a margin.
export const staleAfter = (level: BeatLevel) => BEAT_MS[level] * 2 + 30_000

export const isFresh = (p: { updatedAt: number; level?: BeatLevel }, now: number) => now - p.updatedAt < staleAfter(p.level ?? 'rest')
