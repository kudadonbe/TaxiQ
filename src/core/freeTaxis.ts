// Free taxis at a center: how many taxis in its queue could take an offer now. Citizens can't read
// the queue, so the center's staff sessions publish just this count on publicCenters/{id} (free,
// freeAt), and the center's card on the map shows it while it is fresh. The same idea as
// readOrderAndSuspended / nextTaxi in src/rides.ts: a taxi is not offered while it is suspended,
// its driver is off duty, or its vehicle is out on private hire.

export const FREE_MAX = 500 // the rules allow 0-500
export const FREE_MIN_GAP_MS = 30_000 // a session writes at most once every 30 s
export const FREE_REFRESH_MS = 5 * 60_000 // rewritten (even unchanged) at least every 5 minutes
export const FREE_STALE_MS = 10 * 60_000 // the card hides a count older than this

export interface FreeTaxi {
  id: string
  suspended: boolean
  vehicleId?: string | null
}

// Taxis that get no offers now.
export function unavailableTaxis(taxis: Iterable<FreeTaxi>, offDuty: ReadonlySet<string>, privateNow: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  for (const t of taxis) if (t.suspended || offDuty.has(t.id) || (!!t.vehicleId && privateNow.has(t.vehicleId))) out.add(t.id)
  return out
}

// Taxis in the order (each once, only registered ones) that could take an offer.
export function countFree(order: readonly string[], registered: ReadonlySet<string>, unavailable: ReadonlySet<string>): number {
  let n = 0
  for (const id of new Set(order)) if (registered.has(id) && !unavailable.has(id)) n++
  return Math.min(n, FREE_MAX)
}

// Whether this session should write the count now. `cur` is what publicCenters holds (null when
// there is no doc: the main center, or a center not on the map; nothing is written then).
export function shouldWriteFree(cur: { free: number | null; freeAt: number | null } | null, free: number, now: number, lastWrite: number): boolean {
  if (!cur) return false
  if (now - lastWrite < FREE_MIN_GAP_MS) return false
  if (cur.free !== free || cur.freeAt === null) return true
  return now - cur.freeAt >= FREE_REFRESH_MS
}

// The count to show on the card, or null when there is none or it is too old.
export function freeShown(free: number | null, freeAt: number | null, now: number): number | null {
  if (free === null || freeAt === null || !Number.isInteger(free) || free < 0 || free > FREE_MAX) return null
  return now - freeAt > FREE_STALE_MS ? null : free
}
