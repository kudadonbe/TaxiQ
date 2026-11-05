import type { Db, Tx } from './db'
import { forbidden, notFound } from './errors'
import type { Identity } from './identity'

// Who is calling, and what they may do. Roles are in plans/decisions.md (D3). Every route checks
// here; clients are never trusted.

export type PlatformRole = 'dev' | 'system_admin'
export type StaffRole = 'owner' | 'partner' | 'manager' | 'operator'

export interface Actor extends Identity {
  platform: PlatformRole | null
}

export type Action =
  | 'center.decide' // approve/reject a center (platform)
  | 'center.staff' // add/remove staff
  | 'members.decide' // approve/reject drivers, set center numbers
  | 'members.suspend'
  | 'queue.read'
  | 'queue.write'
  | 'subscriptions.write'
  | 'reports.read'

const allowed: Record<Action, readonly StaffRole[]> = {
  'center.decide': [],
  'center.staff': ['owner'],
  'members.decide': ['owner', 'manager'],
  'members.suspend': ['owner', 'manager'],
  'queue.read': ['owner', 'manager', 'operator'],
  'queue.write': ['owner', 'manager', 'operator'],
  'subscriptions.write': ['owner', 'manager'],
  'reports.read': ['owner', 'manager', 'partner'],
}

// Record (or refresh) the signed-in person and load their platform role.
export async function loadActor(db: Db, id: Identity): Promise<Actor> {
  const r = await db.query<{ blocked: boolean; role: PlatformRole | null }>(
    `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE users.name END
     RETURNING blocked, (SELECT role FROM platform_roles WHERE user_id = $1) AS role`,
    [id.uid, id.email, id.name],
  )
  if (r.rows[0]!.blocked) throw forbidden('account_blocked')
  return { ...id, platform: r.rows[0]!.role }
}

export async function staffRoles(c: Db | Tx, centerId: string, uid: string): Promise<Set<StaffRole>> {
  const r = await c.query<{ role: StaffRole }>('SELECT role FROM center_staff WHERE center_id = $1 AND user_id = $2', [centerId, uid])
  return new Set(r.rows.map((x) => x.role))
}

export async function can(c: Db | Tx, actor: Actor, centerId: string | null, action: Action): Promise<boolean> {
  if (actor.platform === 'dev') return true
  if (action === 'center.decide') return actor.platform === 'system_admin'
  if (!centerId) return false
  const roles = await staffRoles(c, centerId, actor.uid)
  return allowed[action].some((r) => roles.has(r))
}

export async function require(c: Db | Tx, actor: Actor, centerId: string | null, action: Action): Promise<void> {
  if (!(await can(c, actor, centerId, action))) throw forbidden()
}

// The approved, active center a request is about (404 for unknown or not approved).
export async function approvedCenter(c: Db | Tx, centerId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(centerId)) throw notFound('center_not_found')
  const r = await c.query('SELECT 1 FROM centers WHERE id = $1 AND status = $2', [centerId, 'approved'])
  if (!r.rowCount) throw notFound('center_not_found')
}

// The caller's approved driver membership in a center, or 403.
export async function driverMembership(c: Db | Tx, actor: Actor, centerId: string): Promise<string> {
  const r = await c.query<{ id: string }>("SELECT id FROM memberships WHERE center_id = $1 AND driver_user_id = $2 AND status = 'approved'", [centerId, actor.uid])
  if (!r.rows[0]) throw forbidden('not_a_driver_here')
  return r.rows[0].id
}

export async function audit(
  c: Db | Tx,
  e: { centerId: string | null; actor: string; action: string; target?: string; before?: unknown; after?: unknown },
): Promise<void> {
  await c.query('INSERT INTO audit_log (center_id, actor, action, target, before, after) VALUES ($1, $2, $3, $4, $5, $6)', [
    e.centerId,
    e.actor,
    e.action,
    e.target ?? null,
    e.before === undefined ? null : JSON.stringify(e.before),
    e.after === undefined ? null : JSON.stringify(e.after),
  ])
}
