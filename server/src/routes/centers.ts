import type { FastifyInstance } from 'fastify'
import * as core from '../../../src/core/queue'
import { approvedCenter, audit, require, type StaffRole } from '../access'
import { signedIn } from '../app'
import { tx, type Db } from '../db'
import { badRequest, conflict, forbidden, notFound } from '../errors'
import { body, DATE, match, oneOf, PHONE, text, uuid } from '../input'
import { loadQueue, saveQueue } from '../queueStore'

const STAFF_ROLES: readonly StaffRole[] = ['owner', 'partner', 'manager', 'operator']

export async function centerRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Who am I: platform role, staff roles per center, driver memberships.
  app.get('/v1/me', async (req) => {
    const me = signedIn(req)
    const staff = await db.query('SELECT s.center_id AS "centerId", c.name, s.role FROM center_staff s JOIN centers c ON c.id = s.center_id WHERE s.user_id = $1', [me.uid])
    const memberships = await db.query(
      'SELECT m.id, m.center_id AS "centerId", c.name AS "centerName", m.taxi_no AS "taxiNo", m.status, m.suspended FROM memberships m JOIN centers c ON c.id = m.center_id WHERE m.driver_user_id = $1',
      [me.uid],
    )
    return { uid: me.uid, email: me.email, name: me.name, platform: me.platform, staff: staff.rows, memberships: memberships.rows }
  })

  // Public: approved centers.
  app.get('/v1/centers', async () => {
    const r = await db.query("SELECT id, name, type, island FROM centers WHERE status = 'approved' ORDER BY name")
    return { centers: r.rows }
  })

  // Any signed-in person can register a center; a system admin approves it.
  app.post('/v1/centers', async (req, reply) => {
    const me = signedIn(req)
    const b = body(req.body)
    const center = {
      name: text(b, 'name', { required: true, max: 80 }),
      type: oneOf(b, 'type', ['private', 'government'] as const),
      island: text(b, 'island', { max: 60 }),
      contact: text(b, 'contact', { max: 80 }),
      licenseNo: text(b, 'licenseNo', { max: 40 }),
    }
    const r = await tx(db, async (c) => {
      const row = await c.query<{ id: string }>('INSERT INTO centers (name, type, island, contact, license_no, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [
        center.name,
        center.type,
        center.island,
        center.contact,
        center.licenseNo,
        me.uid,
      ])
      await audit(c, { centerId: row.rows[0]!.id, actor: me.uid, action: 'center.register', after: center })
      return row.rows[0]!
    })
    return reply.code(201).send({ id: r.id, status: 'pending' })
  })

  app.get('/v1/centers/pending', async (req) => {
    const me = signedIn(req)
    await require(db, me, null, 'center.decide')
    const r = await db.query("SELECT id, name, type, island, contact, license_no AS \"licenseNo\", created_by AS \"createdBy\", created_at AS \"createdAt\" FROM centers WHERE status = 'pending' ORDER BY created_at")
    return { centers: r.rows }
  })

  // System admin: approve or reject. On approval the applicant becomes the center's owner.
  app.post<{ Params: { id: string } }>('/v1/centers/:id/decide', async (req) => {
    const me = signedIn(req)
    const id = uuid(req.params.id)
    const decision = oneOf(body(req.body), 'decision', ['approved', 'rejected'] as const)
    await require(db, me, null, 'center.decide')
    return tx(db, async (c) => {
      const r = await c.query<{ created_by: string }>(
        "UPDATE centers SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING created_by",
        [id, decision, me.uid],
      )
      if (!r.rows[0]) throw notFound('pending_center_not_found')
      if (decision === 'approved') {
        if (r.rows[0].created_by === me.uid && me.platform !== 'dev') throw forbidden('cannot_approve_own_center')
        await c.query("INSERT INTO center_staff (center_id, user_id, role, added_by) VALUES ($1, $2, 'owner', $3) ON CONFLICT DO NOTHING", [id, r.rows[0].created_by, me.uid])
      }
      await audit(c, { centerId: id, actor: me.uid, action: `center.${decision}` })
      return { id, status: decision }
    })
  })

  // Owner: add staff by email (the person must have signed in once).
  app.post<{ Params: { id: string } }>('/v1/centers/:id/staff', async (req, reply) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await approvedCenter(db, centerId)
    await require(db, me, centerId, 'center.staff')
    const b = body(req.body)
    const email = match(b, 'email', /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/i).toLowerCase()
    const role = oneOf(b, 'role', STAFF_ROLES)
    const u = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])
    if (!u.rows[0]) throw notFound('user_not_found')
    await tx(db, async (c) => {
      await c.query('INSERT INTO center_staff (center_id, user_id, role, added_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [centerId, u.rows[0]!.id, role, me.uid])
      await audit(c, { centerId, actor: me.uid, action: 'staff.add', target: u.rows[0]!.id, after: { role } })
    })
    return reply.code(201).send({ userId: u.rows[0].id, role })
  })

  app.get<{ Params: { id: string } }>('/v1/centers/:id/staff', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await require(db, me, centerId, 'center.staff')
    const r = await db.query('SELECT s.user_id AS "userId", u.email, u.name, s.role FROM center_staff s JOIN users u ON u.id = s.user_id WHERE s.center_id = $1 ORDER BY u.email', [centerId])
    return { staff: r.rows }
  })

  app.delete<{ Params: { id: string; uid: string; role: string } }>('/v1/centers/:id/staff/:uid/:role', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await require(db, me, centerId, 'center.staff')
    const role = oneOf({ role: req.params.role }, 'role', STAFF_ROLES)
    return tx(db, async (c) => {
      if (role === 'owner') {
        const owners = await c.query("SELECT 1 FROM center_staff WHERE center_id = $1 AND role = 'owner'", [centerId])
        if ((owners.rowCount ?? 0) <= 1) throw conflict('last_owner')
      }
      const r = await c.query('DELETE FROM center_staff WHERE center_id = $1 AND user_id = $2 AND role = $3', [centerId, req.params.uid, role])
      if (!r.rowCount) throw notFound()
      await audit(c, { centerId, actor: me.uid, action: 'staff.remove', target: req.params.uid, before: { role } })
      return { ok: true }
    })
  })

  // A person registers a vehicle they own.
  app.post('/v1/vehicles', async (req, reply) => {
    const me = signedIn(req)
    const b = body(req.body)
    const plate = match(b, 'plate', /^[A-Za-z][0-9]{1,6}$/).toUpperCase()
    const seats = typeof b.seats === 'number' && Number.isInteger(b.seats) ? b.seats : 4
    const permitExpiry = match(b, 'permitExpiry', DATE, false) || null
    const insuranceExpiry = match(b, 'insuranceExpiry', DATE, false) || null
    const r = await tx(db, async (c) => {
      const row = await c.query<{ id: string }>('INSERT INTO vehicles (plate, seats, owner_user_id, permit_expiry, insurance_expiry) VALUES ($1,$2,$3,$4,$5) RETURNING id', [
        plate,
        seats,
        me.uid,
        permitExpiry,
        insuranceExpiry,
      ])
      await audit(c, { centerId: null, actor: me.uid, action: 'vehicle.register', target: row.rows[0]!.id, after: { plate, seats } })
      return row.rows[0]!
    })
    return reply.code(201).send({ id: r.id, plate })
  })

  // A driver applies to a center with a vehicle they own.
  app.post<{ Params: { id: string } }>('/v1/centers/:id/memberships', async (req, reply) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await approvedCenter(db, centerId)
    const b = body(req.body)
    const vehicleId = uuid(b.vehicleId, 'vehicleId_invalid')
    const driverName = text(b, 'driverName', { required: true, max: 60 })
    const driverNameDv = text(b, 'driverNameDv', { max: 60 })
    const driverPhone = match(b, 'driverPhone', PHONE)
    const r = await tx(db, async (c) => {
      const v = await c.query('SELECT 1 FROM vehicles WHERE id = $1 AND owner_user_id = $2', [vehicleId, me.uid])
      if (!v.rowCount) throw forbidden('not_your_vehicle')
      const center = await c.query<{ allows_multi_center: boolean }>('SELECT allows_multi_center FROM centers WHERE id = $1', [centerId])
      if (!center.rows[0]!.allows_multi_center) {
        const elsewhere = await c.query("SELECT 1 FROM memberships WHERE driver_user_id = $1 AND status = 'approved' AND center_id <> $2", [me.uid, centerId])
        if (elsewhere.rowCount) throw conflict('center_requires_exclusive_membership')
      }
      const row = await c.query<{ id: string }>(
        'INSERT INTO memberships (center_id, driver_user_id, vehicle_id, driver_name, driver_name_dv, driver_phone) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [centerId, me.uid, vehicleId, driverName, driverNameDv, driverPhone],
      )
      await audit(c, { centerId, actor: me.uid, action: 'membership.apply', target: row.rows[0]!.id })
      return row.rows[0]!
    })
    return reply.code(201).send({ id: r.id, status: 'applied' })
  })

  app.get<{ Params: { id: string } }>('/v1/centers/:id/memberships', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await require(db, me, centerId, 'members.decide')
    const r = await db.query(
      `SELECT m.id, m.status, m.taxi_no AS "taxiNo", m.driver_name AS "driverName", m.driver_name_dv AS "driverNameDv", m.driver_phone AS "driverPhone",
              m.suspended, v.plate, v.seats, v.permit_expiry AS "permitExpiry", v.insurance_expiry AS "insuranceExpiry", m.applied_at AS "appliedAt"
       FROM memberships m JOIN vehicles v ON v.id = m.vehicle_id WHERE m.center_id = $1 ORDER BY m.applied_at`,
      [centerId],
    )
    return { memberships: r.rows }
  })

  // Owner/manager: approve (with a center number) or reject. Approved drivers join the back of the queue.
  app.post<{ Params: { id: string; mid: string } }>('/v1/centers/:id/memberships/:mid/decide', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    const mid = uuid(req.params.mid)
    await require(db, me, centerId, 'members.decide')
    const b = body(req.body)
    const decision = oneOf(b, 'decision', ['approved', 'rejected'] as const)
    const taxiNo = decision === 'approved' ? match(b, 'taxiNo', /^[1-9][0-9]{0,3}$/) : null
    return tx(db, async (c) => {
      const r = await c.query<{ driver_user_id: string }>(
        "UPDATE memberships SET status = $3, taxi_no = $4, decided_by = $5, decided_at = now() WHERE id = $1 AND center_id = $2 AND status = 'applied' RETURNING driver_user_id",
        [mid, centerId, decision, taxiNo, me.uid],
      )
      if (!r.rows[0]) throw notFound('application_not_found')
      if (r.rows[0].driver_user_id === me.uid && me.platform !== 'dev') throw forbidden('cannot_approve_yourself')
      if (decision === 'approved') {
        const q = await loadQueue(c, centerId) // normalizeOrder appends the new driver at the back
        await saveQueue(c, centerId, q.state, me.uid)
      }
      await audit(c, { centerId, actor: me.uid, action: `membership.${decision}`, target: mid, after: { taxiNo } })
      return { id: mid, status: decision, taxiNo }
    })
  })

  // Owner/manager: suspend (red card) or lift. The taxi keeps its place in the queue.
  app.post<{ Params: { id: string; mid: string } }>('/v1/centers/:id/memberships/:mid/suspend', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    const mid = uuid(req.params.mid)
    await require(db, me, centerId, 'members.suspend')
    const b = body(req.body)
    const suspended = { reason: oneOf(b, 'reason', ['conduct', 'fees', 'other'] as const), note: text(b, 'note'), at: Date.now() }
    return tx(db, async (c) => {
      const q = await loadQueue(c, centerId)
      if (!q.members.has(mid)) throw notFound('member_not_found')
      await c.query('UPDATE memberships SET suspended = $3 WHERE id = $1 AND center_id = $2', [mid, centerId, JSON.stringify(suspended)])
      await saveQueue(c, centerId, core.onSuspend(q.state, mid), me.uid)
      await audit(c, { centerId, actor: me.uid, action: 'membership.suspend', target: mid, after: suspended })
      return { id: mid, suspended }
    })
  })

  app.post<{ Params: { id: string; mid: string } }>('/v1/centers/:id/memberships/:mid/lift', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    const mid = uuid(req.params.mid)
    await require(db, me, centerId, 'members.suspend')
    return tx(db, async (c) => {
      const r = await c.query('UPDATE memberships SET suspended = NULL WHERE id = $1 AND center_id = $2 AND suspended IS NOT NULL', [mid, centerId])
      if (!r.rowCount) throw notFound('not_suspended')
      await audit(c, { centerId, actor: me.uid, action: 'membership.lift', target: mid })
      return { id: mid, suspended: null }
    })
  })

  // Platform admin: block an account everywhere.
  app.post<{ Params: { uid: string } }>('/v1/platform/users/:uid/block', async (req) => {
    const me = signedIn(req)
    await require(db, me, null, 'center.decide')
    if (req.params.uid === me.uid) throw badRequest('cannot_block_yourself')
    return tx(db, async (c) => {
      const r = await c.query('UPDATE users SET blocked = true WHERE id = $1', [req.params.uid])
      if (!r.rowCount) throw notFound('user_not_found')
      await audit(c, { centerId: null, actor: me.uid, action: 'user.block', target: req.params.uid })
      return { blocked: true }
    })
  })

}
