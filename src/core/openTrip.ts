// Open trips (plans: the passenger posts a trip without picking a vehicle). Taxi trips go to the
// taxi queue, private hire to the private queue; the top one is offered the trip, offers to take it,
// and the passenger books it (or says no thanks, and it goes to the next). Pure functions.

// How long each step may wait before it moves on to the next vehicle (seconds).
export const WAIT_SECONDS = {
  offering: 20, // the driver: offer, or pass
  interest: 60, // the passenger: book, or no thanks
  confirmed: 30, // the driver's phone completes the booking
} as const
export type OpenStep = keyof typeof WAIT_SECONDS

export function secondsLeft(step: OpenStep, since: number, now: number) {
  return Math.max(0, Math.ceil((since + WAIT_SECONDS[step] * 1000 - now) / 1000))
}
export const timedOut = (step: OpenStep, since: number, now: number) => !!since && now >= since + (WAIT_SECONDS[step] + 1) * 1000

// The private queue: vehicles on the map, first available first (by when they switched to
// Available, or came back from their last trip), never the passenger's own, nor ones already passed.
export interface QueueVehicle {
  id: string
  ownerUid: string
  since: number // ms
}
export function privateQueue<V extends QueueVehicle>(vehicles: V[], passengerUid: string, skipped: readonly string[] = []): V[] {
  return vehicles
    .filter((v) => v.ownerUid !== passengerUid && !skipped.includes(v.id))
    .sort((a, b) => a.since - b.since || a.id.localeCompare(b.id))
}

// What the driver's phone says (and shows) when a trip comes in.
export function firstName(full: string) {
  return (full.trim().split(/\s+/)[0] ?? '').slice(0, 30)
}
