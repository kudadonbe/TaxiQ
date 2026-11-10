// Ride requests from the public, offered to drivers one at a time in queue order.
//
//   requests/{passenger uid}   one active request per passenger (a new one overwrites the old)
//   publicTaxis/{taxiId}       what the public may see: number, names, suspended
//
// There is no server. Whoever is watching (the passenger, any driver, any operator) moves an offer on
// once it has waited OFFER_SECONDS; the Firestore rules check the server clock, so nobody can move it
// on early, and only the offered driver can accept.

import type { Taxi } from './types'
import { MAIN, queueRef } from './centers'
import { logMine } from './activity'
import { addTripEntries } from './account'

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
  driverUid: string | null // the driver's account (uid) that offered or accepted: earnings go to a person, not a taxi
  price: number | null // MVR, the total, fixed from the start (null: no fare table yet)
  km: number | null // road distance it was priced on
  arrivedAt: number // ms, when the driver tapped Arrived
  size: 'small' | 'large' // the taxi asked for: up to 5 seats (any taxi), or 7-10 seats only
  centerId: string // the taxi center whose queue it goes to
  createdAt: number // ms
}

export interface PublicTaxi {
  id: string
  taxiNo: string
  name: string
  nameDv: string
  suspended: boolean
  seats: number
  vehicleId: string | null // the same vehicle for private hire, if linked
  centerId: string
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
    driverUid: typeof data.driverUid === 'string' && data.driverUid ? data.driverUid : null,
    price: typeof data.price === 'number' ? data.price : null,
    km: typeof data.km === 'number' ? data.km : null,
    arrivedAt: ms(data.arrivedAt),
    size: data.size === 'large' ? 'large' : 'small',
    centerId: typeof data.centerId === 'string' && data.centerId ? data.centerId : MAIN,
    createdAt: ms(data.createdAt),
  }
}

export function parsePublicTaxi(id: string, data: Record<string, unknown>): PublicTaxi | null {
  const taxiNo = s(data.taxiNo, 4)
  if (!/^[1-9]\d{0,3}$/.test(taxiNo)) return null
  const seats = typeof data.seats === 'number' && data.seats >= 1 && data.seats <= 15 ? data.seats : 4
  return { id, taxiNo, name: s(data.name, 60), nameDv: s(data.nameDv, 60), suspended: data.suspended === true, seats, vehicleId: typeof data.vehicleId === 'string' ? data.vehicleId : null, centerId: typeof data.centerId === 'string' && data.centerId ? data.centerId : MAIN }
}

// Public taxis in the shape the map wants (no phone numbers).
export function asMapTaxi(p: PublicTaxi): Taxi {
  return {
    id: p.id,
    taxiNo: p.taxiNo,
    taxiReg: '',
    driver: { id: p.id, name: p.name, nameDv: p.nameDv, phone: '' },
    suspended: p.suspended ? { reason: 'other', note: '', at: 0 } : undefined,
    seats: p.seats,
    centerId: p.centerId,
  }
}

// Next taxi to offer to: the first in queue order that hasn't been offered yet and isn't suspended
// (for a 7-10 seat trip, only 7-10 seat taxis).
export function nextTaxi(order: string[], skipped: string[], suspended: ReadonlySet<string>, large: ReadonlySet<string> | null = null): string | null {
  return order.find((id) => !skipped.includes(id) && !suspended.has(id) && (!large || large.has(id))) ?? null
}

async function readOrderAndSuspended(fb: Fb, center: string) {
  const [state, pub, onPrivate] = await Promise.all([
    fb.getDoc(queueRef(fb, center)),
    // The first center also counts taxis from before centers (no centerId yet).
    center === MAIN
      ? fb.getDocs(fb.collection(fb.db, 'publicTaxis')).then((all) => ({ docs: all.docs.filter((d) => (d.data().centerId || MAIN) === MAIN) }))
      : fb.getDocs(fb.query(fb.collection(fb.db, 'publicTaxis'), fb.where('centerId', '==', center))),
    // Vehicles on the private map now (a linked taxi out on private hire gets no taxi offers).
    fb.getDocs(fb.query(fb.collection(fb.db, 'publicVehicles'), fb.where('updatedAt', '>', fb.Timestamp.fromMillis(Date.now() - 10 * 60_000)))).catch(() => null),
  ])
  const privateNow = new Set(onPrivate ? onPrivate.docs.map((d) => d.id) : [])
  const order = Array.isArray(state.data()?.order) ? (state.data()!.order as unknown[]).filter((x): x is string => typeof x === 'string') : []
  // Not offered: suspended taxis, and taxis whose vehicle is out on private hire.
  const suspended = new Set(pub.docs.filter((d) => d.data().suspended === true || (typeof d.data().vehicleId === 'string' && privateNow.has(d.data().vehicleId))).map((d) => d.id))
  const large = new Set(pub.docs.filter((d) => typeof d.data().seats === 'number' && d.data().seats >= 7).map((d) => d.id))
  return { order, suspended, large }
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
  size: 'small' | 'large'
  centerId: string // the center chosen (open trip), or the tapped taxi's center
}

// Passenger: create (or replace) their request.
export async function requestRide(fb: Fb, uid: string, ride: NewRide) {
  const { order, suspended, large } = await readOrderAndSuspended(fb, ride.centerId)
  const direct = !!ride.taxiId
  const offerTo = direct ? ride.taxiId! : nextTaxi(order, [], suspended, ride.size === 'large' ? large : null)
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
    size: ride.size,
    centerId: ride.centerId,
    createdAt: fb.serverTimestamp(),
  }
  if (ride.pickupAt) data.pickupAt = ride.pickupAt
  if (ride.destinationAt) data.destinationAt = ride.destinationAt
  await fb.setDoc(fb.doc(fb.db, 'requests', uid), data)
  logMine(fb, 'bookingSent', 'taxi')
}

// Anyone involved: move the offer on (declined, or waited OFFER_SECONDS). The rules re-check
// everything, including the server-side timeout.
export async function moveOn(fb: Fb, uid: string) {
  const ref = fb.doc(fb.db, 'requests', uid)
  const first = parseRequest((await fb.getDoc(ref)).data())
  const { order, suspended, large } = await readOrderAndSuspended(fb, first?.centerId ?? MAIN)
  await fb.runTransaction(fb.db, async (tx) => {
    const r = parseRequest((await tx.get(ref)).data())
    if (!r || !(r.status === 'offering' || r.status === 'interest' || r.status === 'confirmed') || !r.offerTo) return
    const skipped = [...r.skipped, r.offerTo]
    const next = r.mode === 'queue' ? nextTaxi(order, skipped, suspended, r.size === 'large' ? large : null) : null
    tx.update(ref, { skipped, offerTo: next, offerAt: fb.serverTimestamp(), status: next ? 'offering' : 'expired' })
  })
}

// The top driver offers to take an open trip; the passenger then books it or says no thanks.
export async function offerRide(fb: Fb, uid: string) {
  const me = fb.auth.currentUser?.uid
  if (!me) throw new Error('signed-out')
  await fb.updateDoc(fb.doc(fb.db, 'requests', uid), { status: 'interest', offerAt: fb.serverTimestamp(), driverUid: me })
  logMine(fb, 'offerTaken', 'taxi')
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
// Done, and in the same batch the trip's money entries (Paid for the passenger, Earned for the
// driver, at the fixed total; the rules check them against the trip).
export async function finishRide(fb: Fb, uid: string) {
  const ref = fb.doc(fb.db, 'requests', uid)
  const r = parseRequest((await fb.getDoc(ref)).data())
  if (!r) throw new Error('no-request')
  const batch = fb.writeBatch(fb.db)
  batch.update(ref, { status: 'done' })
  addTripEntries(fb, batch, { kind: 'taxi', passengerUid: uid, driverUid: r.driverUid, createdAtMs: r.createdAt, price: r.price }, fb.auth.currentUser?.email ?? '')
  await batch.commit()
  logMine(fb, 'tripFinished', r.price != null ? `taxi · MVR ${r.price}` : 'taxi')
}
export async function problemRide(fb: Fb, uid: string) {
  await upd(fb, uid, { status: 'problem' })
  logMine(fb, 'problemReported', 'taxi')
}

export async function cancelRide(fb: Fb, uid: string) {
  await fb.updateDoc(fb.doc(fb.db, 'requests', uid), { status: 'cancelled' })
  logMine(fb, 'bookingCancelled', 'taxi')
}

// Driver: accept the offer. One transaction marks the request accepted, moves the taxi to the back
// of the queue and logs the dispatch, so the queue and the log never disagree. Staff completing a
// booking for the driver pass asDriver = false (the driver's account stays as it was).
export async function acceptRide(fb: Fb, uid: string, taxiId: string, email: string, asDriver = true) {
  const reqRef = fb.doc(fb.db, 'requests', uid)
  // The request's center: its queue moves the taxi to the back.
  const center = parseRequest((await fb.getDoc(reqRef)).data())?.centerId ?? MAIN
  const stateRef = queueRef(fb, center)
  const taxiRef = fb.doc(fb.db, 'taxis', taxiId)
  const dispatchRef = fb.doc(fb.collection(fb.db, 'dispatches'))
  let direct = false
  await fb.runTransaction(fb.db, async (tx) => {
    const [reqSnap, stateSnap, taxiSnap] = [await tx.get(reqRef), await tx.get(stateRef), await tx.get(taxiRef)]
    const r = parseRequest(reqSnap.data())
    // Booked by the passenger (open trip), or a taxi they picked on the map.
    const ok = r && r.offerTo === taxiId && (r.status === 'confirmed' || (r.status === 'offering' && r.mode === 'direct'))
    if (!r || !ok) throw new Error('offer-gone')
    direct = r.mode === 'direct'
    const me = asDriver ? (fb.auth.currentUser?.uid ?? null) : null
    const order: string[] = Array.isArray(stateSnap.data()?.order) ? stateSnap.data()!.order : []
    const interested: string[] = Array.isArray(stateSnap.data()?.interested) ? stateSnap.data()!.interested : []
    const from = Math.max(0, order.indexOf(taxiId))
    const taxi = taxiSnap.data() ?? {}
    // The driver's account: the one accepting (direct), or kept from when they offered (open trip).
    tx.update(reqRef, { status: 'accepted', acceptedBy: taxiId, driverUid: r.driverUid ?? me })
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
      centerId: center,
    })
  })
  // An open trip was already logged when the driver offered to take it.
  if (direct) logMine(fb, 'offerTaken', 'taxi')
}
