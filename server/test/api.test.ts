import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../src/db'
import { sweepTimedOut } from '../src/offerStore'
import { api, person, setup } from './helpers'

let app: FastifyInstance
let db: Db
let call: ReturnType<typeof api>

const admin = person('admin') // system admin
const owner = person('owner') // registers center A
const op = person('op') // operator in A
const partner = person('partner') // partner/shareholder in A
const outsider = person('outsider') // owner of center B
const citizen = person('citizen')
const drivers = ['d1', 'd2', 'd3'].map(person)

let centerA = ''
let centerB = ''
const members: string[] = [] // membership ids in A, queue order d1, d2, d3

beforeAll(async () => {
  ;({ app, db } = await setup())
  call = api(app)
  // Everyone signs in once (creates their user record).
  for (const p of [admin, owner, op, partner, outsider, citizen, ...drivers]) expect((await call(p, 'GET', '/v1/me')).status).toBe(200)
  await db.query("INSERT INTO platform_roles (user_id, role) VALUES ('admin', 'system_admin')")
})
afterAll(async () => {
  await app.close()
  await db.end()
})

describe('public and auth', () => {
  it('health and the center list are public; everything else needs sign-in', async () => {
    expect((await call(null, 'GET', '/v1/health')).status).toBe(200)
    expect((await call(null, 'GET', '/v1/centers')).status).toBe(200)
    expect((await call(null, 'GET', '/v1/me')).status).toBe(401)
  })
  it('rejects a bad token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer nonsense' } })
    expect(res.statusCode).toBe(401)
  })
  it('sends CORS headers only to allowed origins', async () => {
    const ok = await app.inject({ method: 'OPTIONS', url: '/v1/centers', headers: { origin: 'https://kd-taxiq.web.app' } })
    expect(ok.headers['access-control-allow-origin']).toBe('https://kd-taxiq.web.app')
    const bad = await app.inject({ method: 'OPTIONS', url: '/v1/centers', headers: { origin: 'https://evil.example' } })
    expect(bad.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('centers and staff', () => {
  it('anyone can register a center; it starts pending and is not public', async () => {
    const a = await call(owner, 'POST', '/v1/centers', { name: 'Kulhudhuffushi Taxi', type: 'private', island: 'HDh. Kulhudhuffushi' })
    expect(a.status).toBe(201)
    centerA = a.body.id
    const b = await call(outsider, 'POST', '/v1/centers', { name: 'Other Taxi', type: 'private' })
    centerB = b.body.id
    expect((await call(null, 'GET', '/v1/centers')).body.centers).toEqual([])
  })
  it('rejects markup in names', async () => {
    expect((await call(owner, 'POST', '/v1/centers', { name: '<script>', type: 'private' })).status).toBe(400)
  })
  it('only a system admin can approve, and the applicant becomes owner', async () => {
    expect((await call(owner, 'POST', `/v1/centers/${centerA}/decide`, { decision: 'approved' })).status).toBe(403)
    expect((await call(admin, 'POST', `/v1/centers/${centerA}/decide`, { decision: 'approved' })).status).toBe(200)
    expect((await call(admin, 'POST', `/v1/centers/${centerB}/decide`, { decision: 'approved' })).status).toBe(200)
    const me = await call(owner, 'GET', '/v1/me')
    expect(me.body.staff).toEqual([{ centerId: centerA, name: 'Kulhudhuffushi Taxi', role: 'owner' }])
    expect((await call(null, 'GET', '/v1/centers')).body.centers.map((c: { name: string }) => c.name)).toEqual(['Kulhudhuffushi Taxi', 'Other Taxi'])
  })
  it('the owner adds staff; others cannot', async () => {
    expect((await call(owner, 'POST', `/v1/centers/${centerA}/staff`, { email: op.email, role: 'operator' })).status).toBe(201)
    expect((await call(owner, 'POST', `/v1/centers/${centerA}/staff`, { email: partner.email, role: 'partner' })).status).toBe(201)
    expect((await call(op, 'POST', `/v1/centers/${centerA}/staff`, { email: citizen.email, role: 'operator' })).status).toBe(403)
    expect((await call(outsider, 'POST', `/v1/centers/${centerA}/staff`, { email: citizen.email, role: 'owner' })).status).toBe(403)
  })
  it('the last owner cannot be removed', async () => {
    expect((await call(owner, 'DELETE', `/v1/centers/${centerA}/staff/owner/owner`)).status).toBe(409)
  })
})

describe('drivers join a center', () => {
  it('register a vehicle, apply, get approved with a center number', async () => {
    let n = 0
    for (const d of drivers) {
      n++
      const v = await call(d, 'POST', '/v1/vehicles', { plate: `T51${n}0`, seats: 4 })
      expect(v.status).toBe(201)
      const m = await call(d, 'POST', `/v1/centers/${centerA}/memberships`, { vehicleId: v.body.id, driverName: `Driver ${n}`, driverPhone: `98900${n}0` })
      expect(m.status).toBe(201)
      members.push(m.body.id)
    }
    // Operators can't approve; owner can.
    expect((await call(op, 'POST', `/v1/centers/${centerA}/memberships/${members[0]}/decide`, { decision: 'approved', taxiNo: '34' })).status).toBe(403)
    for (const [i, no] of ['34', '2', '17'].entries()) {
      expect((await call(owner, 'POST', `/v1/centers/${centerA}/memberships/${members[i]}/decide`, { decision: 'approved', taxiNo: no })).status).toBe(200)
    }
  })
  it('a driver cannot apply with someone else\'s vehicle', async () => {
    const v = await call(citizen, 'POST', '/v1/vehicles', { plate: 'T9999' })
    expect((await call(drivers[0]!, 'POST', `/v1/centers/${centerB}/memberships`, { vehicleId: v.body.id, driverName: 'X', driverPhone: '7777777' })).status).toBe(403)
  })
  it('the public map lists taxis without phone numbers', async () => {
    const r = await call(null, 'GET', `/v1/centers/${centerA}/taxis`)
    expect(r.body.taxis.map((t: { taxiNo: string }) => t.taxiNo)).toEqual(['2', '17', '34'])
    expect(JSON.stringify(r.body)).not.toContain('98900')
  })
})

describe('the radio queue', () => {
  const q = () => `/v1/centers/${centerA}/queue`

  it('new drivers joined in approval order', async () => {
    const r = await call(op, 'GET', q())
    expect(r.body.taxis.map((t: { taxiNo: string }) => t.taxiNo)).toEqual(['34', '2', '17'])
  })
  it('partners and other centers cannot see or run the queue', async () => {
    expect((await call(partner, 'GET', q())).status).toBe(403)
    expect((await call(outsider, 'GET', q())).status).toBe(403)
    expect((await call(outsider, 'POST', `${q()}/toggle`, { membershipId: members[0] })).status).toBe(403)
  })
  it('answer, assign the highest-in-queue suggestion, then undo exactly', async () => {
    await call(op, 'POST', `${q()}/toggle`, { membershipId: members[2] })
    const t = await call(op, 'POST', `${q()}/toggle`, { membershipId: members[1] })
    expect(t.body.suggestion).toBe(members[1])
    const a = await call(op, 'POST', `${q()}/assign`, { membershipId: members[1], call: { pickup: 'Rome (Plot 117)', phone: '7771234' } })
    expect(a.status).toBe(201)
    expect(a.body.queue.taxis.map((x: { taxiNo: string }) => x.taxiNo)).toEqual(['34', '17', '2'])
    expect(a.body.queue.interested).toEqual([])
    const u = await call(op, 'POST', `/v1/centers/${centerA}/dispatches/${a.body.dispatchId}/undo`)
    expect(u.status).toBe(200)
    expect(u.body.taxis.map((x: { taxiNo: string }) => x.taxiNo)).toEqual(['34', '2', '17'])
    expect(u.body.interested.sort()).toEqual([members[1], members[2]].sort())
  })
  it('assign then reopen: driver back in place, the others slide out again', async () => {
    const a = await call(op, 'POST', `${q()}/assign`, { membershipId: members[1] })
    const r = await call(op, 'POST', `/v1/centers/${centerA}/dispatches/${a.body.dispatchId}/reopen`)
    expect(r.body.queue.taxis.map((x: { taxiNo: string }) => x.taxiNo)).toEqual(['34', '2', '17'])
    expect(r.body.queue.interested).toEqual([members[2]])
    await call(op, 'POST', `${q()}/clear`)
  })
  it('suspended drivers keep their place and cannot answer', async () => {
    expect((await call(owner, 'POST', `/v1/centers/${centerA}/memberships/${members[0]}/suspend`, { reason: 'fees', note: 'October' })).status).toBe(200)
    expect((await call(op, 'POST', `${q()}/toggle`, { membershipId: members[0] })).status).toBe(409)
    const v = await call(op, 'GET', q())
    expect(v.body.taxis[0]).toMatchObject({ taxiNo: '34', suspended: { reason: 'fees', note: 'October' } })
    expect((await call(owner, 'POST', `/v1/centers/${centerA}/memberships/${members[0]}/lift`)).status).toBe(200)
  })
})

describe('passenger requests (offers in queue order)', () => {
  it('a queue request goes to the first taxi; decline moves it to the next', async () => {
    const r = await call(citizen, 'POST', `/v1/centers/${centerA}/requests`, { pickup: 'Rome', phone: '7771234' })
    expect(r.status).toBe(201)
    expect(r.body.offerTo).toBe(members[0])
    // Only the offered driver sees it, with the phone number.
    expect((await call(drivers[0]!, 'GET', '/v1/me/offers')).body.offers).toHaveLength(1)
    expect((await call(drivers[1]!, 'GET', '/v1/me/offers')).body.offers).toHaveLength(0)
    // Driver 2 can't accept or decline someone else's offer.
    expect((await call(drivers[1]!, 'POST', `/v1/requests/${r.body.id}/accept`)).status).toBe(403)
    expect((await call(drivers[0]!, 'POST', `/v1/requests/${r.body.id}/decline`)).body.status).toBe('offering')
    expect((await call(drivers[1]!, 'GET', '/v1/me/offers')).body.offers[0].id).toBe(r.body.id)
  })
  it('one open request per passenger', async () => {
    expect((await call(citizen, 'POST', `/v1/centers/${centerA}/requests`, { pickup: 'Rome', phone: '7771234' })).status).toBe(409)
  })
  it('the server moves a timed-out offer on by itself', async () => {
    await db.query("UPDATE ride_requests SET offer_at = now() - interval '25 seconds' WHERE status = 'offering'")
    expect(await sweepTimedOut(db)).toBe(1)
    const offers = (await call(drivers[2]!, 'GET', '/v1/me/offers')).body.offers
    expect(offers).toHaveLength(1)
  })
  it('accepting moves the taxi to the back and logs the dispatch', async () => {
    const offer = (await call(drivers[2]!, 'GET', '/v1/me/offers')).body.offers[0]
    const a = await call(drivers[2]!, 'POST', `/v1/requests/${offer.id}/accept`)
    expect(a.body.status).toBe('accepted')
    const queue = await call(op, 'GET', `/v1/centers/${centerA}/queue`)
    expect(queue.body.taxis.at(-1).membershipId).toBe(members[2])
    const log = await call(op, 'GET', `/v1/centers/${centerA}/dispatches`)
    expect(log.body.dispatches[0]).toMatchObject({ membershipId: members[2], requestId: offer.id })
    expect((await call(drivers[2]!, 'POST', `/v1/requests/${offer.id}/accept`)).status).toBe(409)
  })
  it('a direct request expires instead of moving to another taxi', async () => {
    const r = await call(citizen, 'POST', `/v1/centers/${centerA}/requests`, { pickup: 'Seiko', phone: '7771234', membershipId: members[1] })
    expect(r.body.offerTo).toBe(members[1])
    expect((await call(drivers[1]!, 'POST', `/v1/requests/${r.body.id}/decline`)).body.status).toBe('expired')
  })
  it('the passenger and center staff can cancel; others cannot', async () => {
    const r = await call(citizen, 'POST', `/v1/centers/${centerA}/requests`, { pickup: 'Rome', phone: '7771234' })
    expect((await call(outsider, 'POST', `/v1/requests/${r.body.id}/cancel`)).status).toBe(403)
    expect((await call(op, 'POST', `/v1/requests/${r.body.id}/cancel`)).body.status).toBe('cancelled')
  })
  it('requests need a pickup and a 7-digit phone', async () => {
    expect((await call(citizen, 'POST', `/v1/centers/${centerA}/requests`, { pickup: '', phone: '7771234' })).status).toBe(400)
    expect((await call(citizen, 'POST', `/v1/centers/${centerA}/requests`, { pickup: 'Rome', phone: '12' })).status).toBe(400)
  })
})

describe('subscriptions, reports and audit', () => {
  it('managers/owners record subscriptions; partners can read reports but not write', async () => {
    const s = { membershipId: members[0], periodStart: '2026-11-01', periodEnd: '2026-11-30', amountMvr: 500, status: 'paid' }
    expect((await call(partner, 'POST', `/v1/centers/${centerA}/subscriptions`, s)).status).toBe(403)
    expect((await call(owner, 'POST', `/v1/centers/${centerA}/subscriptions`, s)).status).toBe(201)
    const list = await call(partner, 'GET', `/v1/centers/${centerA}/subscriptions`)
    expect(list.body.subscriptions[0]).toMatchObject({ taxiNo: '34', amountMvr: 500, status: 'paid', periodStart: '2026-11-01' })
    expect((await call(partner, 'GET', `/v1/centers/${centerA}/reports/trips`)).body.days[0].trips).toBeGreaterThan(0)
  })
  it('every change is in the audit log, per center', async () => {
    const a = await call(owner, 'GET', `/v1/centers/${centerA}/audit`)
    const actions = new Set(a.body.entries.map((e: { action: string }) => e.action))
    for (const x of ['center.approved', 'staff.add', 'membership.approved', 'queue.assign', 'dispatch.undo', 'dispatch.reopen', 'membership.suspend', 'request.accept', 'subscription.record'])
      expect(actions).toContain(x)
    expect((await call(outsider, 'GET', `/v1/centers/${centerA}/audit`)).status).toBe(403)
  })
  it('a blocked account is refused everywhere', async () => {
    expect((await call(admin, 'POST', '/v1/platform/users/outsider/block')).status).toBe(200)
    expect((await call(outsider, 'GET', '/v1/me')).status).toBe(403)
  })
})
