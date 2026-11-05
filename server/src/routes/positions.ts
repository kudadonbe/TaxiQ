import type { FastifyInstance } from 'fastify'
import { approvedCenter } from '../access'
import { signedIn } from '../app'
import type { Db } from '../db'
import { badRequest, forbidden } from '../errors'
import { body, uuid } from '../input'

// Real GPS (Phase 5). A driver goes online and sends positions from their phone. Only the latest
// position is kept; going offline clears it. The public map shows online taxis with a fresh
// position (no names of passengers, no history).

export const STALE_SECONDS = 120 // older positions are not shown
const MIN_INTERVAL_SECONDS = 2 // updates faster than this are ignored

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null)

async function requireDriver(db: Db, uid: string) {
  const r = await db.query("SELECT 1 FROM memberships WHERE driver_user_id = $1 AND status = 'approved' LIMIT 1", [uid])
  if (!r.rowCount) throw forbidden('not_a_driver')
}

export async function positionRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.post('/v1/me/online', async (req) => {
    const me = signedIn(req)
    await requireDriver(db, me.uid)
    const online = body(req.body).online
    if (typeof online !== 'boolean') throw badRequest('online_invalid')
    await db.query(
      `INSERT INTO driver_positions (user_id, online) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET online = EXCLUDED.online,
         lat = CASE WHEN EXCLUDED.online THEN driver_positions.lat END,
         lng = CASE WHEN EXCLUDED.online THEN driver_positions.lng END,
         heading = CASE WHEN EXCLUDED.online THEN driver_positions.heading END,
         speed = NULL, accuracy = CASE WHEN EXCLUDED.online THEN driver_positions.accuracy END, at = now()`,
      [me.uid, online],
    )
    return { online }
  })

  app.post('/v1/me/position', async (req, reply) => {
    const me = signedIn(req)
    const b = body(req.body)
    const lat = num(b.lat, -90, 90)
    const lng = num(b.lng, -180, 180)
    if (lat === null || lng === null) throw badRequest('position_invalid')
    const heading = num(b.heading, 0, 359.999)
    const speed = num(b.speed, 0, 99)
    const accuracy = num(b.accuracy, 0, 99999)
    const r = await db.query(
      `UPDATE driver_positions SET lat = $2, lng = $3, heading = $4, speed = $5, accuracy = $6, at = now()
       WHERE user_id = $1 AND online AND (lat IS NULL OR at <= now() - make_interval(secs => $7))`,
      [me.uid, lat, lng, heading, speed, accuracy, MIN_INTERVAL_SECONDS],
    )
    if (r.rowCount) return { stored: true }
    const state = await db.query<{ online: boolean }>('SELECT online FROM driver_positions WHERE user_id = $1', [me.uid])
    if (!state.rows[0]?.online) throw forbidden('not_online')
    return reply.code(202).send({ stored: false, reason: 'too_soon' })
  })

  app.get('/v1/me/online', async (req) => {
    const me = signedIn(req)
    const r = await db.query<{ online: boolean }>('SELECT online FROM driver_positions WHERE user_id = $1', [me.uid])
    return { online: r.rows[0]?.online ?? false }
  })

  // Public: online taxis of a center with a fresh position.
  app.get<{ Params: { id: string } }>('/v1/centers/:id/positions', async (req) => {
    const centerId = uuid(req.params.id)
    await approvedCenter(db, centerId)
    const r = await db.query(
      `SELECT m.id AS "membershipId", m.taxi_no AS "taxiNo", (m.suspended IS NOT NULL) AS suspended,
              p.lat, p.lng, p.heading, p.speed, extract(epoch FROM p.at) * 1000 AS "atMs"
       FROM memberships m JOIN driver_positions p ON p.user_id = m.driver_user_id
       WHERE m.center_id = $1 AND m.status = 'approved' AND p.online AND p.lat IS NOT NULL
         AND p.at > now() - make_interval(secs => $2)`,
      [centerId, STALE_SECONDS],
    )
    return { positions: r.rows.map((x) => ({ ...x, atMs: Number(x.atMs) })), staleAfterSeconds: STALE_SECONDS }
  })
}
