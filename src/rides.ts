// Ride requests from the public, offered to drivers one at a time in queue order.
//
//   requests/{passenger uid}   one active request per passenger (a new one overwrites the old)
//   publicTaxis/{taxiId}       what the public may see: number, names, suspended
//
// There is no server. Whoever is watching (the passenger, any driver, any operator) moves an offer on
// once it has waited OFFER_SECONDS; the Firestore rules check the server clock, so nobody can move it
// on early, and only the offered driver can accept.

import type { Taxi } from './types'

type Fb = typeof import('./firebase')

export const OFFER_SECONDS = 20

// offering (the top taxi has 20 s) -> interest (the driver offers; the passenger has 60 s to book)
// -> confirmed (booked; the driver's phone completes it) -> accepted. A taxi tapped on the map
// (direct) skips the offer: the driver accepts straight from offering.
// Then the trip: accepted -> onboard (the driver picked them up) -> arrived (the driver is at the
// destination) -> done (the passenger confirms, or 10 minutes pass) | problem (the passenger reports
// one; operators handle it and close it).
export type RideStatus = 'offering' | 'interest' | 'confirmed' | 'accepted' | 'onboard' | 'arrived' | 'done' | 'problem' | 'expired' | 'cancelled'
export const RIDE_STATUSES: RideStatus[] = ['offering', 'interest', 'confirmed', 'accepted', 'onboard', 'arrived', 'done', 'problem', 'expired', 'cancelled']

export interface RideRequest {
  uid: string
  name: string
  mode: 'queue' | 'direct'
  pickup: string
  pickupAt?: [number, number]
  destination: string
  destinationAt?: [number, number]
  phone: string
  note: string
  status: RideStatus
  offerTo: string | null
  offerAt: number // ms
  skipped: string[]
  acceptedBy: string | null
  price: number | null // MVR, the total, fixed from the start (null: no fare table yet)
  km: number | null // road distance it was priced on
  arrivedAt: number // ms, when the driver tapped Arrived
  createdAt: number // ms
}

export interface PublicTaxi {
  id: string
  taxiNo: string
  name: string
  nameDv: string
  suspended: boolean
}

const s = (x: unknown, max = 120) => (typeof x === 'string' ? x.slice(0, max) : '')
const ms = (x: unknown) => (x && typeof (x as { toMillis?: unknown }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)

export function parseRequest(data: Record<string, unknown> | undefined): RideRequest | null {
  if (!data) return null
  const status = RIDE_STATUSES.find((x) => x === data.status)
  if (!status || (data.mode !== 'queue' && data.mode !== 'direct')) return null
  const at = data.pickupAt
  return {
    uid: s(data.uid, 128),
    name: s(data.name, 80),
    mode: data.mode,
    pickup: s(data.pickup),
    pickupAt: Array.isArray(at) && at.length === 2 && at.every((n) => typeof n === 'number') ? [at[0], at[1]] : undefined,
    destinationAt: Array.isArray(data.destinationAt) && data.destinationAt.length === 2 && data.destinationAt.every((n: unknown) => typeof n === 'number') ? [data.destinationAt[0], data.destinationAt[1]] : undefined,
    destination: s(data.destination),
    phone: s(data.phone, 7),
    note: s(data.note),
    status,
    offerTo: typeof data.offerTo === 'string' ? data.offerTo : null,
    offerAt: ms(data.offerAt),
    skipped: Array.isArray(data.skipped) ? data.skipped.filter((x): x is string => typeof x === 'string') : [],
    acceptedBy: typeof data.acceptedBy === 'string' ? data.acceptedBy : null,
    price: typeof data.price === 'number' ? data.price : null,
    km: typeof data.km === 'number' ? data.km : null,
    arrivedAt: ms(data.arrivedAt),
    createdAt: ms(data.createdAt),
  }
}

export function parsePublicTaxi(id: string, data: Record<string, unknown>): PublicTaxi | null {
  const taxiNo = s(data.taxiNo, 4)
  if (!/^[1-9]\d{0,3}$/.test(taxiNo)) return null
  return { id, taxiNo, name: s(data.name, 60), nameDv: s(data.nameDv, 60), suspended: data.suspended === true }
}

// Public taxis in the shape the map wants (no phone numbers).
export function asMapTaxi(p: PublicTaxi): Taxi {
  return {
    id: p.id,
    taxiNo: p.taxiNo,
    taxiReg: '',
    driver: { id: p.id, name: p.name, nameDv: p.nameDv, phone: '' },
    suspended: p.suspended ? { reason: 'other', note: '', at: 0 } : undefined,
  }
}

// Next taxi to offer to: the first in queue order that hasn't been offered yet and isn't suspended.
export function nextTaxi(order: string[], skipped: string[], suspended: ReadonlySet<string>): string | null {
  return order.find((id) => !skipped.includes(id) && !suspended.has(id)) ?? null
}

async function readOrderAndSuspended(fb: Fb) {
  const [state, pub] = await Promise.all([fb.getDoc(fb.doc(fb.db, 'queue', 'state')), fb.getDocs(fb.collection(fb.db, 'publicTaxis'))])
  const order = Array.isArray(state.data()?.order) ? (state.data()!.order as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const suspended = new Set(pub.docs.filter((d) => d.data().suspended === true).map((d) => d.id))
  return { order, suspended }
}

export interface NewRide {
  name: string
  pickup: string
  pickupAt?: [number, number]
  destination: string
  destinationAt?: [number, number]
  phone: string
  note: string
  taxiId?: string // a specific taxi; otherwise the queue
  price: number | null // the total, from the fare table and the road distance
  km: number | null
}

// Passenger: create (or replace) their request.
export async function requestRide(fb: Fb, uid: string, ride: NewRide) {
  const { order, suspended } = await readOrderAndSuspended(fb)
  const direct = !!ride.taxiId
  const offerTo = direct ? ride.taxiId! : nextTaxi(order, [], suspended)
  const data: Record<string, unknown> = {
    uid,
    name: ride.name.slice(0, 80),
    mode: direct ? 'direct' : 'queue',
    pickup: ride.pickup.trim(),
    destination: ride.destination.trim(),
    phone: ride.phone.trim(),
    note: ride.note.trim(),
    status: offerTo ? 'offering' : 'expired',
    offerTo: offerTo ?? null,
    offerAt: fb.serverTimestamp(),
    skipped: [],
    acceptedBy: null,
    price: ride.price,
    km: ride.km,
    createdAt: fb.serverTimestamp(),
  }
  if (ride.pickupAt) data.pickupAt = ride.pickupAt
  if (ride.destinationAt) data.destinationAt = ride.destinationAt
  await fb.setDoc(fb.doc(fb.db, 'requests', uid), data)
}

// Anyone involved: move the offer on (declined, or waited OFFER_SECONDS). The rules re-check
// everything, including the server-side timeout.
export async function moveOn(fb: Fb, uid: string) {
  const { order, suspended } = await readOrderAndSuspended(fb)
  const ref = fb.doc(fb.db, 'requests', uid)
  await fb.runTransaction(fb.db, async (tx) => {
    const r = parseRequest((await tx.get(ref)).data())
    if (!r || !(r.status === 'offering' || r.status === 'interest' || r.status === 'confirmed') || !r.offerTo) return
    const skipped = [...r.skipped, r.offerTo]
    const next = r.mode === 'queue' ? nextTaxi(order, skipped, suspended) : null
    tx.update(ref, { skipped, offerTo: next, offerAt: fb.serverTimestamp(), status: next ? 'offering' : 'expired' })
  })
}

// The top driver offers to take an open trip; the passenger then books it or says no thanks.
export async function offerRide(fb: Fb, uid: string) {
  await fb.updateDoc(fb.doc(fb.db, 'requests', uid), { status: 'interest', offerAt: fb.serverTimestamp() })
}
// The passenger books the offered taxi.
export async function bookOffer(fb: Fb, uid: string) {
  await fb.updateDoc(fb.doc(fb.db, 'requests', uid), { status: 'confirmed', offerAt: fb.serverTimestamp() })
}

// The trip. The driver: Picked up, then Arrived. The passenger: finished (yes) or a problem. After
// 10 minutes without an answer, anyone involved marks it done. Staff close a problem.
const upd = (fb: Fb, uid: string, data: Record<string, unknown>) => fb.updateDoc(fb.doc(fb.db, 'requests', uid), data)
export const pickedUpRide = (fb: Fb, uid: string) => upd(fb, uid, { status: 'onboard' })
export const arrivedRide = (fb: Fb, uid: string) => upd(fb, uid, { status: 'arrived', arrivedAt: fb.serverTimestamp() })
export const finishRide = (fb: Fb, uid: string) => upd(fb, uid, { status: 'done' })
export const problemRide = (fb: Fb, uid: string) => upd(fb, uid, { status: 'problem' })

export async function cancelRide(fb: Fb, uid: string) {
  await fb.updateDoc(fb.doc(fb.db, 'requests', uid), { status: 'cancelled' })
}

// Driver: accept the offer. One transaction marks the request accepted, moves the taxi to the back
// of the queue and logs the dispatch, so the queue and the log never disagree.
export async function acceptRide(fb: Fb, uid: string, taxiId: string, email: string) {
  const reqRef = fb.doc(fb.db, 'requests', uid)
  const stateRef = fb.doc(fb.db, 'queue', 'state')
  const taxiRef = fb.doc(fb.db, 'taxis', taxiId)
  const dispatchRef = fb.doc(fb.collection(fb.db, 'dispatches'))
  await fb.runTransaction(fb.db, async (tx) => {
    const [reqSnap, stateSnap, taxiSnap] = [await tx.get(reqRef), await tx.get(stateRef), await tx.get(taxiRef)]
    const r = parseRequest(reqSnap.data())
    // Booked by the passenger (open trip), or a taxi they picked on the map.
    const ok = r && r.offerTo === taxiId && (r.status === 'confirmed' || (r.status === 'offering' && r.mode === 'direct'))
    if (!r || !ok) throw new Error('offer-gone')
    const order: string[] = Array.isArray(stateSnap.data()?.order) ? stateSnap.data()!.order : []
    const interested: string[] = Array.isArray(stateSnap.data()?.interested) ? stateSnap.data()!.interested : []
    const from = Math.max(0, order.indexOf(taxiId))
    const taxi = taxiSnap.data() ?? {}
    tx.update(reqRef, { status: 'accepted', acceptedBy: taxiId })
    tx.set(stateRef, {
      order: [...order.filter((x) => x !== taxiId), taxiId],
      interested: interested.filter((x) => x !== taxiId),
      updatedAt: fb.serverTimestamp(),
      updatedBy: email,
    })
    const call: Record<string, unknown> = { pickup: r.pickup, destination: r.destination, phone: r.phone, note: r.note }
    if (r.pickupAt) call.pickupAt = r.pickupAt
    if (r.destinationAt) call.destinationAt = r.destinationAt
    tx.set(dispatchRef, {
      taxi: { id: taxiId, taxiNo: taxi.taxiNo ?? '', taxiReg: taxi.taxiReg ?? '', driver: taxi.driver ?? {} },
      at: Date.now(),
      from,
      interested: [],
      call,
      reopened: false,
      undone: false,
      by: email,
      requestId: uid,
    })
  })
}
