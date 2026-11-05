import * as offers from '../../src/core/offers'
import type { Db, Tx } from './db'
import { audit } from './access'
import { tx } from './db'
import { loadQueue } from './queueStore'

// Ride offers on the server. The server is the referee: it picks the next taxi in queue order and
// moves timed-out offers on by itself, so no screen needs to be open and no client can skip ahead.

export interface RequestRow {
  id: string
  center_id: string
  mode: offers.OfferMode
  status: offers.OfferStatus
  offer_to: string | null
  offer_at: Date
  skipped: string[]
  accepted_by: string | null
}

export const asOffer = (r: RequestRow): offers.OfferState => ({
  mode: r.mode,
  status: r.status,
  offerTo: r.offer_to,
  offerAt: r.offer_at.getTime(),
  skipped: r.skipped,
  acceptedBy: r.accepted_by,
})

// Suspended members of a center, and the current queue order (locks the queue row).
export async function orderAndSuspended(c: Tx, centerId: string) {
  const q = await loadQueue(c, centerId)
  const suspended = new Set([...q.members.values()].filter((m) => m.suspended).map((m) => m.id))
  return { q, order: q.state.order, suspended }
}

// Move one offer on (declined or timed out). Returns the new status, or null if nothing changed.
export async function moveOn(c: Tx, requestId: string, actor: string | null): Promise<offers.OfferStatus | null> {
  const r = await c.query<RequestRow>('SELECT * FROM ride_requests WHERE id = $1 FOR UPDATE', [requestId])
  const row = r.rows[0]
  if (!row) return null
  const { order, suspended } = await orderAndSuspended(c, row.center_id)
  const next = offers.moveOffer(asOffer(row), order, suspended)
  if (!next) return null
  await c.query('UPDATE ride_requests SET status = $2, offer_to = $3, skipped = $4, offer_at = now() WHERE id = $1', [requestId, next.status, next.offerTo, [...next.skipped]])
  await audit(c, { centerId: row.center_id, actor: actor ?? 'system', action: 'request.move_on', target: requestId, before: { offerTo: row.offer_to }, after: next })
  return next.status
}

// Move on every offer that has waited OFFER_SECONDS. Safe to run on several servers at once.
export async function sweepTimedOut(db: Db): Promise<number> {
  const due = await db.query<{ id: string }>("SELECT id FROM ride_requests WHERE status = 'offering' AND offer_at <= now() - make_interval(secs => $1) LIMIT 100", [offers.OFFER_SECONDS])
  let moved = 0
  for (const { id } of due.rows) {
    await tx(db, async (c) => {
      const lock = await c.query("SELECT 1 FROM ride_requests WHERE id = $1 AND status = 'offering' AND offer_at <= now() - make_interval(secs => $2) FOR UPDATE SKIP LOCKED", [
        id,
        offers.OFFER_SECONDS,
      ])
      if (lock.rowCount && (await moveOn(c, id, null))) moved++
    })
  }
  return moved
}
