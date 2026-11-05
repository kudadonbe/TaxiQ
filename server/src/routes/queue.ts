import type { FastifyInstance } from 'fastify'
import * as core from '../../../src/core/queue'
import { approvedCenter, audit, require } from '../access'
import { signedIn } from '../app'
import { tx, type Db } from '../db'
import { conflict, notFound } from '../errors'
import { body, call, uuid } from '../input'
import { loadQueue, saveQueue, view } from '../queueStore'

// The operator's radio queue for one center. Every change: lock the queue, run the core rule,
// save, audit — in one transaction.
export async function queueRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get<{ Params: { id: string } }>('/v1/centers/:id/queue', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await approvedCenter(db, centerId)
    await require(db, me, centerId, 'queue.read')
    return tx(db, async (c) => view(await loadQueue(c, centerId)))
  })

  // Tap a driver who answered the radio call (or un-tap).
  app.post<{ Params: { id: string } }>('/v1/centers/:id/queue/toggle', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    const mid = uuid(body(req.body).membershipId, 'membershipId_invalid')
    await approvedCenter(db, centerId)
    await require(db, me, centerId, 'queue.write')
    return tx(db, async (c) => {
      const q = await loadQueue(c, centerId)
      const next = core.toggleInterest(q.state, mid, q.taxis)
      if (!next) throw conflict('not_available')
      await saveQueue(c, centerId, next, me.uid)
      return view({ ...q, state: next, version: q.version + 1 })
    })
  })

  app.post<{ Params: { id: string } }>('/v1/centers/:id/queue/clear', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await approvedCenter(db, centerId)
    await require(db, me, centerId, 'queue.write')
    return tx(db, async (c) => {
      const q = await loadQueue(c, centerId)
      const next = core.clearCall(q.state)
      await saveQueue(c, centerId, next, me.uid)
      return view({ ...q, state: next, version: q.version + 1 })
    })
  })

  // Assign the ride to an answered driver, with optional passenger details.
  app.post<{ Params: { id: string } }>('/v1/centers/:id/queue/assign', async (req, reply) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    const b = body(req.body)
    const mid = uuid(b.membershipId, 'membershipId_invalid')
    const details = b.call ? call(b.call, false) : null
    await approvedCenter(db, centerId)
    await require(db, me, centerId, 'queue.write')
    const out = await tx(db, async (c) => {
      const q = await loadQueue(c, centerId)
      const r = core.assign(q.state, mid, q.taxis)
      if (!r) throw conflict('cannot_assign')
      await saveQueue(c, centerId, r.state, me.uid)
      const d = await c.query<{ id: string }>('INSERT INTO dispatches (center_id, membership_id, from_index, interested, call, by_user) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [
        centerId,
        mid,
        r.dispatch.from,
        [...r.dispatch.interested],
        details ? JSON.stringify(details) : null,
        me.uid,
      ])
      await audit(c, { centerId, actor: me.uid, action: 'queue.assign', target: d.rows[0]!.id, before: q.state, after: r.state })
      return { dispatchId: d.rows[0]!.id, queue: view({ ...q, state: r.state, version: q.version + 1 }) }
    })
    return reply.code(201).send(out)
  })

  app.get<{ Params: { id: string } }>('/v1/centers/:id/dispatches', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await require(db, me, centerId, 'queue.read')
    const r = await db.query(
      `SELECT d.id, d.membership_id AS "membershipId", m.taxi_no AS "taxiNo", m.driver_name AS "driverName", m.driver_name_dv AS "driverNameDv",
              d.from_index AS "from", d.call, d.request_id AS "requestId", d.reopened, d.at
       FROM dispatches d JOIN memberships m ON m.id = d.membership_id
       WHERE d.center_id = $1 AND NOT d.undone ORDER BY d.at DESC LIMIT 30`,
      [centerId],
    )
    return { dispatches: r.rows }
  })

  // Undo the latest dispatch exactly (only while the taxi is still last in the queue).
  app.post<{ Params: { id: string; did: string } }>('/v1/centers/:id/dispatches/:did/undo', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    const did = uuid(req.params.did)
    await require(db, me, centerId, 'queue.write')
    return tx(db, async (c) => {
      const latest = await c.query<{ id: string; membership_id: string; from_index: number; interested: string[]; reopened: boolean }>(
        'SELECT id, membership_id, from_index, interested, reopened FROM dispatches WHERE center_id = $1 AND NOT undone ORDER BY at DESC LIMIT 1 FOR UPDATE',
        [centerId],
      )
      const d = latest.rows[0]
      if (!d || d.id !== did || d.reopened) throw conflict('not_latest_dispatch')
      const q = await loadQueue(c, centerId)
      const next = core.undo(q.state, { taxiId: d.membership_id, from: d.from_index, interested: d.interested }, q.taxis)
      if (!next) throw conflict('queue_changed')
      await saveQueue(c, centerId, next, me.uid)
      await c.query('UPDATE dispatches SET undone = true WHERE id = $1', [did])
      await audit(c, { centerId, actor: me.uid, action: 'dispatch.undo', target: did, before: q.state, after: next })
      return view({ ...q, state: next, version: q.version + 1 })
    })
  })

  // Reopen a dispatch: the driver gets their place back and the call returns for reassignment.
  app.post<{ Params: { id: string; did: string } }>('/v1/centers/:id/dispatches/:did/reopen', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    const did = uuid(req.params.did)
    await require(db, me, centerId, 'queue.write')
    return tx(db, async (c) => {
      const r = await c.query<{ membership_id: string; from_index: number; interested: string[]; call: unknown }>(
        'SELECT membership_id, from_index, interested, call FROM dispatches WHERE id = $1 AND center_id = $2 AND NOT undone AND NOT reopened FOR UPDATE',
        [did, centerId],
      )
      const d = r.rows[0]
      if (!d) throw notFound('dispatch_not_found')
      const q = await loadQueue(c, centerId)
      const next = core.reopen(q.state, { taxiId: d.membership_id, from: d.from_index, interested: d.interested }, q.taxis)
      if (!next) throw conflict('taxi_gone')
      await saveQueue(c, centerId, next, me.uid)
      await c.query('UPDATE dispatches SET reopened = true WHERE id = $1', [did])
      await audit(c, { centerId, actor: me.uid, action: 'dispatch.reopen', target: did, before: q.state, after: next })
      return { call: d.call, queue: view({ ...q, state: next, version: q.version + 1 }) }
    })
  })
}
