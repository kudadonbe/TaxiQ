import type { FastifyInstance } from 'fastify'
import { audit, require } from '../access'
import { signedIn } from '../app'
import { tx, type Db } from '../db'
import { badRequest, notFound } from '../errors'
import { body, DATE, match, oneOf, uuid } from '../input'

// Subscriptions (recorded only: drivers pay their center) and reports for owners, managers and
// partners/shareholders.
export async function reportRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.post<{ Params: { id: string } }>('/v1/centers/:id/subscriptions', async (req, reply) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await require(db, me, centerId, 'subscriptions.write')
    const b = body(req.body)
    const mid = uuid(b.membershipId, 'membershipId_invalid')
    const periodStart = match(b, 'periodStart', DATE)
    const periodEnd = match(b, 'periodEnd', DATE)
    const amount = typeof b.amountMvr === 'number' && Number.isFinite(b.amountMvr) && b.amountMvr >= 0 && b.amountMvr < 1e7 ? b.amountMvr : null
    if (amount === null) throw badRequest('amountMvr_invalid')
    const status = oneOf(b, 'status', ['due', 'paid', 'waived'] as const)
    const out = await tx(db, async (c) => {
      const m = await c.query('SELECT 1 FROM memberships WHERE id = $1 AND center_id = $2', [mid, centerId])
      if (!m.rowCount) throw notFound('member_not_found')
      const r = await c.query<{ id: string }>(
        `INSERT INTO subscriptions (center_id, membership_id, period_start, period_end, amount_mvr, status, paid_at, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6 = 'paid' THEN now() END, $7) RETURNING id`,
        [centerId, mid, periodStart, periodEnd, amount, status, me.uid],
      )
      await audit(c, { centerId, actor: me.uid, action: 'subscription.record', target: r.rows[0]!.id, after: { mid, periodStart, periodEnd, amount, status } })
      return { id: r.rows[0]!.id }
    })
    return reply.code(201).send(out)
  })

  app.get<{ Params: { id: string } }>('/v1/centers/:id/subscriptions', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await require(db, me, centerId, 'reports.read')
    const r = await db.query(
      `SELECT s.id, s.membership_id AS "membershipId", m.taxi_no AS "taxiNo", m.driver_name AS "driverName",
              to_char(s.period_start, 'YYYY-MM-DD') AS "periodStart", to_char(s.period_end, 'YYYY-MM-DD') AS "periodEnd",
              s.amount_mvr::float AS "amountMvr", s.status, s.paid_at AS "paidAt"
       FROM subscriptions s JOIN memberships m ON m.id = s.membership_id WHERE s.center_id = $1 ORDER BY s.period_start DESC`,
      [centerId],
    )
    return { subscriptions: r.rows }
  })

  // Simple trip report: dispatches per day for the last 30 days.
  app.get<{ Params: { id: string } }>('/v1/centers/:id/reports/trips', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await require(db, me, centerId, 'reports.read')
    const r = await db.query(
      `SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') AS day, count(*)::int AS trips
       FROM dispatches WHERE center_id = $1 AND NOT undone AND at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
      [centerId],
    )
    return { days: r.rows }
  })

  app.get<{ Params: { id: string } }>('/v1/centers/:id/audit', async (req) => {
    const me = signedIn(req)
    const centerId = uuid(req.params.id)
    await require(db, me, centerId, 'reports.read')
    const r = await db.query('SELECT id, at, actor, action, target FROM audit_log WHERE center_id = $1 ORDER BY at DESC, id DESC LIMIT 100', [centerId])
    return { entries: r.rows }
  })
}
