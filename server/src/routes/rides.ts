import type { FastifyInstance } from 'fastify'
import * as offers from '../../../src/core/offers'
import * as core from '../../../src/core/queue'
import { approvedCenter, audit, can } from '../access'
import { signedIn } from '../app'
import { tx, type Db } from '../db'
import { conflict, forbidden, notFound } from '../errors'
import { body, call, uuid } from '../input'
import { asOffer, moveOn, orderAndSuspended, type RequestRow } from '../offerStore'
import { saveQueue } from '../queueStore'

const PUBLIC_FIELDS = `id, center_id AS "centerId", mode, pickup, pickup_lat AS "pickupLat", pickup_lng AS "pickupLng", destination, note,
  status, offer_to AS "offerTo", offer_at AS "offerAt", accepted_by AS "acceptedBy", created_at AS "createdAt"`

export async function rideRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Public map: a center's approved taxis. No phone numbers, no personal data.
  app.get<{ Params: { id: string } }>('/v1/centers/:id/taxis', async (req) => {
    const centerId = uuid(req.params.id)
    await approvedCenter(db, centerId)
    const r = await db.query(
      `SELECT id AS "membershipId", taxi_no AS "taxiNo", driver_name AS "name", driver_name_dv AS "nameDv", (suspended IS NOT NULL) AS suspended
       FROM memberships WHERE center_id = $1 AND status = 'approved' ORDER BY taxi_no::int`,
      [centerId],
    )
    return { taxis: r.rows }
  })

  // Citizen: ask for a ride from a center, via its queue or a specific taxi.
  app.post<{ Params: { id: string } }>('/v1/centers/:id/requests', async (req, reply) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await approvedCenter(db, centerId)
    const b = body(req.body)
    const details = call(b, true)
    const chosen = b.membershipId === undefined ? undefined : uuid(b.membershipId, 'membershipId_invalid')
    const out = await tx(db, async (c) => {
      const { q, order, suspended } = await orderAndSuspended(c, centerId)
      if (chosen && !q.members.has(chosen)) throw notFound('taxi_not_found')
      const start = offers.startOffer(chosen ? 'direct' : 'queue', order, suspended, chosen)
      const r = await c.query<{ id: string }>(
        `INSERT INTO ride_requests (center_id, passenger_user_id, mode, pickup, pickup_lat, pickup_lng, destination, phone, note, status, offer_to)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [centerId, me.uid, start.mode, details.pickup, details.pickupAt?.[0] ?? null, details.pickupAt?.[1] ?? null, details.destination, details.phone, details.note, start.status, start.offerTo],
      )
      await audit(c, { centerId, actor: me.uid, action: 'request.create', target: r.rows[0]!.id, after: { mode: start.mode, offerTo: start.offerTo } })
      return { id: r.rows[0]!.id, status: start.status, offerTo: start.offerTo }
    })
    return reply.code(201).send(out)
  })

  // Citizen: their recent requests.
  app.get('/v1/me/requests', async (req) => {
    const me = signedIn(req)
    const r = await db.query(`SELECT ${PUBLIC_FIELDS} FROM ride_requests WHERE passenger_user_id = $1 ORDER BY created_at DESC LIMIT 5`, [me.uid])
    return { requests: r.rows }
  })

  // Driver: offers waiting for any of their memberships, with the passenger's phone.
  app.get('/v1/me/offers', async (req) => {
    const me = signedIn(req)
    const r = await db.query(
      `SELECT r.id, r.center_id AS "centerId", r.mode, r.pickup, r.pickup_lat AS "pickupLat", r.pickup_lng AS "pickupLng", r.destination, r.note,
              r.status, r.offer_to AS "offerTo", r.offer_at AS "offerAt", r.created_at AS "createdAt", r.phone, m.taxi_no AS "taxiNo"
       FROM ride_requests r
       JOIN memberships m ON m.id = r.offer_to AND m.driver_user_id = $1 AND m.status = 'approved'
       WHERE r.status = 'offering' ORDER BY r.offer_at`,
      [me.uid],
    )
    return { offers: r.rows }
  })

  // Staff: requests still being offered, or that no taxi took.
  app.get<{ Params: { id: string } }>('/v1/centers/:id/requests', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    if (!(await can(db, me, centerId, 'queue.read'))) throw forbidden()
    const r = await db.query(`SELECT ${PUBLIC_FIELDS}, phone FROM ride_requests WHERE center_id = $1 AND status IN ('offering', 'expired') ORDER BY created_at DESC LIMIT 50`, [centerId])
    return { requests: r.rows }
  })

  // Driver: accept the offer. Marks it accepted, moves the taxi to the back, logs the dispatch.
  app.post<{ Params: { rid: string } }>('/v1/requests/:rid/accept', async (req) => {
    const me = signedIn(req)
    const rid = uuid(req.params.rid)
    return tx(db, async (c) => {
      const r = await c.query<RequestRow & { pickup: string; destination: string; phone: string; note: string; pickup_lat: number | null; pickup_lng: number | null }>(
        'SELECT * FROM ride_requests WHERE id = $1 FOR UPDATE',
        [rid],
      )
      const row = r.rows[0]
      if (!row) throw notFound('request_not_found')
      const mine = await c.query("SELECT 1 FROM memberships WHERE id = $1 AND driver_user_id = $2 AND status = 'approved'", [row.offer_to, me.uid])
      if (!mine.rowCount) throw forbidden('not_your_offer')
      const { q, suspended } = await orderAndSuspended(c, row.center_id)
      if (!offers.canAccept(asOffer(row), row.offer_to!, suspended)) throw conflict('offer_gone')
      const from = Math.max(0, q.state.order.indexOf(row.offer_to!))
      const next = core.driverToBack(q.state, row.offer_to!)
      await saveQueue(c, row.center_id, next, me.uid)
      await c.query("UPDATE ride_requests SET status = 'accepted', accepted_by = offer_to WHERE id = $1", [rid])
      const details = { pickup: row.pickup, destination: row.destination, phone: row.phone, note: row.note, ...(row.pickup_lat !== null ? { pickupAt: [row.pickup_lat, row.pickup_lng] } : {}) }
      const d = await c.query<{ id: string }>(
        'INSERT INTO dispatches (center_id, membership_id, from_index, interested, call, request_id, by_user) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [row.center_id, row.offer_to, from, [], JSON.stringify(details), rid, me.uid],
      )
      await audit(c, { centerId: row.center_id, actor: me.uid, action: 'request.accept', target: rid, after: { dispatchId: d.rows[0]!.id } })
      return { status: 'accepted', dispatchId: d.rows[0]!.id }
    })
  })

  // Driver: decline; the offer moves on to the next taxi in the queue.
  app.post<{ Params: { rid: string } }>('/v1/requests/:rid/decline', async (req) => {
    const me = signedIn(req)
    const rid = uuid(req.params.rid)
    return tx(db, async (c) => {
      const r = await c.query<{ offer_to: string | null }>("SELECT offer_to FROM ride_requests WHERE id = $1 AND status = 'offering'", [rid])
      if (!r.rows[0]) throw notFound('offer_not_found')
      const mine = await c.query("SELECT 1 FROM memberships WHERE id = $1 AND driver_user_id = $2", [r.rows[0].offer_to, me.uid])
      if (!mine.rowCount) throw forbidden('not_your_offer')
      return { status: await moveOn(c, rid, me.uid) }
    })
  })

  // Passenger or center staff: cancel.
  app.post<{ Params: { rid: string } }>('/v1/requests/:rid/cancel', async (req) => {
    const me = signedIn(req)
    const rid = uuid(req.params.rid)
    return tx(db, async (c) => {
      const r = await c.query<{ passenger_user_id: string; center_id: string; status: string }>('SELECT passenger_user_id, center_id, status FROM ride_requests WHERE id = $1 FOR UPDATE', [rid])
      const row = r.rows[0]
      if (!row) throw notFound('request_not_found')
      if (row.passenger_user_id !== me.uid && !(await can(c, me, row.center_id, 'queue.write'))) throw forbidden()
      if (row.status === 'cancelled') return { status: 'cancelled' }
      await c.query("UPDATE ride_requests SET status = 'cancelled' WHERE id = $1", [rid])
      await audit(c, { centerId: row.center_id, actor: me.uid, action: 'request.cancel', target: rid, before: { status: row.status } })
      return { status: 'cancelled' }
    })
  })
}
