import * as core from '../../src/core/queue'
import type { Tx } from './db'

// A center's queue in PostgreSQL, run through the core engine. Always called inside a transaction;
// the queue row is locked so changes to one center's queue happen one at a time.

export interface Member {
  id: string
  taxiNo: string
  driverName: string
  driverNameDv: string
  driverUserId: string
  suspended: { reason: string; note: string; at: number } | null
}

export interface LoadedQueue {
  state: core.QueueState
  members: Map<string, Member>
  taxis: ReadonlyMap<string, core.QueueTaxi>
  version: number
}

export async function loadQueue(c: Tx, centerId: string): Promise<LoadedQueue> {
  await c.query('INSERT INTO queues (center_id) VALUES ($1) ON CONFLICT DO NOTHING', [centerId])
  const q = await c.query<{ ord: string[]; interested: string[]; version: number }>('SELECT ord, interested, version FROM queues WHERE center_id = $1 FOR UPDATE', [centerId])
  const m = await c.query<{ id: string; taxi_no: string; driver_name: string; driver_name_dv: string; driver_user_id: string; suspended: Member['suspended'] }>(
    "SELECT id, taxi_no, driver_name, driver_name_dv, driver_user_id, suspended FROM memberships WHERE center_id = $1 AND status = 'approved'",
    [centerId],
  )
  const members = new Map(
    m.rows.map((r) => [r.id, { id: r.id, taxiNo: r.taxi_no, driverName: r.driver_name, driverNameDv: r.driver_name_dv, driverUserId: r.driver_user_id, suspended: r.suspended }]),
  )
  const list = [...members.values()].map((x) => ({ id: x.id, taxiNo: x.taxiNo, suspended: !!x.suspended }))
  const row = q.rows[0]!
  return {
    state: { order: core.normalizeOrder(row.ord, list), interested: row.interested.filter((id) => members.has(id)) },
    members,
    taxis: core.byId(list),
    version: row.version,
  }
}

export async function saveQueue(c: Tx, centerId: string, state: core.QueueState, uid: string): Promise<void> {
  await c.query('UPDATE queues SET ord = $2, interested = $3, version = version + 1, updated_by = $4, updated_at = now() WHERE center_id = $1', [
    centerId,
    [...state.order],
    [...state.interested],
    uid,
  ])
}

// The queue as clients see it.
export function view(q: LoadedQueue) {
  return {
    version: q.version,
    suggestion: core.suggestion(q.state),
    interested: [...q.state.interested],
    taxis: q.state.order.map((id, i) => {
      const m = q.members.get(id)!
      return { membershipId: id, position: i + 1, taxiNo: m.taxiNo, driverName: m.driverName, driverNameDv: m.driverNameDv, suspended: m.suspended }
    }),
  }
}
