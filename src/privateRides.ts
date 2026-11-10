import { useEffect, useState } from 'react'
import type { PublicVehicle } from './vehicles'
import { logActivity, logMine } from './activity'
import { addTripEntries } from './account'

// Booking a private vehicle (firestore.rules: privateRides). One booking at a time per passenger,
// at privateRides/{passengerUid}. Only the passenger, the vehicle's owner and staff see it.
//   A vehicle tapped on the map (direct):
//     offering -> accepted (owner shares first name and phone) | declined | cancelled (passenger)
//   An open trip (queue: the top vehicle of the private queue, first available first):
//     offering (20 s) -> interest (the owner offers; the passenger has 60 s) -> confirmed (booked;
//     the owner's phone shares their name and phone) -> accepted. A pass, no thanks or timeout
//     moves it to the next vehicle; when none is left, expired.
//   accepted -> onboard (owner picked them up) -> arrived (at the destination) -> done (the
//   passenger confirms, or 10 minutes pass) | problem (operators handle it)

type Fb = typeof import('./firebase')

export type PrivateRideStatus = 'offering' | 'interest' | 'confirmed' | 'accepted' | 'declined' | 'cancelled' | 'onboard' | 'arrived' | 'done' | 'problem' | 'expired'
export const ANSWER_SECONDS = 60 // the owner has a minute to answer

export interface PrivateRide {
  uid: string
  name: string
  phone: string
  vehicleId: string
  ownerUid: string
  ownerFirstName: string
  ownerPhone: string
  pickup: string
  pickupAt: [number, number]
  destination: string
  destinationAt: [number, number] | null
  note: string
  price: number
  status: PrivateRideStatus
  mode: 'direct' | 'queue'
  skipped: string[]
  offerAt: number
  arrivedAt: number
  km: number | null
  createdAt: number
  updatedAt: number
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)
const str = (x: unknown, n = 120) => (typeof x === 'string' ? x.slice(0, n) : '')
const pair = (x: unknown): [number, number] | null => (Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number') ? [x[0], x[1]] : null)
const STATUSES: PrivateRideStatus[] = ['offering', 'interest', 'confirmed', 'accepted', 'declined', 'cancelled', 'onboard', 'arrived', 'done', 'problem', 'expired']

function parse(id: string, x: Record<string, unknown>): PrivateRide | null {
  const status = STATUSES.find((s) => s === x.status)
  const pickupAt = pair(x.pickupAt)
  if (!status || !pickupAt) return null
  return {
    uid: id,
    name: str(x.name, 80),
    phone: str(x.phone, 7),
    vehicleId: str(x.vehicleId, 128),
    ownerUid: str(x.ownerUid, 128),
    ownerFirstName: str(x.ownerFirstName, 40),
    ownerPhone: str(x.ownerPhone, 7),
    pickup: str(x.pickup),
    pickupAt,
    destination: str(x.destination),
    destinationAt: pair(x.destinationAt),
    note: str(x.note),
    price: typeof x.price === 'number' ? x.price : 0,
    status,
    mode: x.mode === 'queue' ? 'queue' : 'direct',
    skipped: Array.isArray(x.skipped) ? x.skipped.filter((y): y is string => typeof y === 'string') : [],
    offerAt: ms(x.offerAt) || ms(x.createdAt),
    arrivedAt: ms(x.arrivedAt),
    km: typeof x.km === 'number' ? x.km : null,
    createdAt: ms(x.createdAt),
    updatedAt: ms(x.updatedAt),
  }
}

// The trip's km: the road distance from the map's route when known, else a straight line x 1.3
// (roads are rarely straight). One decimal.
export function tripKm(from: [number, number], to: [number, number] | null, metres: number | null = null) {
  if (!to) return 0
  if (metres) return Math.round(metres / 100) / 10
  const k = Math.cos((((from[0] + to[0]) / 2) * Math.PI) / 180)
  return Math.round(Math.hypot((to[0] - from[0]) * 111.32, (to[1] - from[1]) * 111.32 * k) * 1.3 * 10) / 10
}
// What a trip costs, in total: the vehicle's price for the km. Fixed once booked.
export function estimate(v: Pick<PublicVehicle, 'priceBase' | 'pricePerKm'>, from: [number, number], to: [number, number] | null, metres: number | null = null) {
  return Math.round(v.priceBase + v.pricePerKm * tripKm(from, to, metres))
}

// The passenger's booking.
export function useMyPrivateRide(fb: Fb | null, uid: string | null): PrivateRide | null {
  const [ride, setRide] = useState<PrivateRide | null>(null)
  useEffect(() => {
    if (!fb || !uid) return
    return fb.onSnapshot(
      fb.doc(fb.db, 'privateRides', uid),
      (s) => setRide(s.exists() ? parse(s.id, s.data()) : null),
      () => setRide(null),
    )
  }, [fb, uid])
  return fb && uid ? ride : null
}

// Bookings for this owner's vehicles that still need them.
export function useIncomingPrivateRides(fb: Fb | null, uid: string | null): PrivateRide[] {
  const [list, setList] = useState<PrivateRide[]>([])
  useEffect(() => {
    if (!fb || !uid) return
    const q = fb.query(fb.collection(fb.db, 'privateRides'), fb.where('ownerUid', '==', uid), fb.where('status', 'in', ['offering', 'interest', 'confirmed', 'accepted', 'onboard', 'arrived']))
    return fb.onSnapshot(
      q,
      (s) => setList(s.docs.flatMap((d) => parse(d.id, d.data()) ?? [])),
      () => setList([]),
    )
  }, [fb, uid])
  return fb && uid ? list : []
}

export type Booking = { phone: string; pickup: string; pickupAt: [number, number]; destination: string; destinationAt: [number, number] | null; note: string; metres?: number | null }
export async function bookPrivate(fb: Fb, me: { uid: string; name: string }, v: PublicVehicle, b: Booking, mode: 'direct' | 'queue' = 'direct') {
  await fb.setDoc(fb.doc(fb.db, 'privateRides', me.uid), {
    mode,
    skipped: [],
    offerAt: fb.serverTimestamp(),
    uid: me.uid,
    name: me.name.slice(0, 80),
    phone: b.phone.trim(),
    vehicleId: v.id,
    ownerUid: v.ownerUid,
    ownerFirstName: '',
    ownerPhone: '',
    pickup: b.pickup.trim().slice(0, 120),
    pickupAt: b.pickupAt,
    destination: b.destination.trim().slice(0, 120),
    destinationAt: b.destinationAt,
    note: b.note.trim().slice(0, 120),
    price: estimate(v, b.pickupAt, b.destinationAt, b.metres ?? null),
    km: tripKm(b.pickupAt, b.destinationAt, b.metres ?? null),
    status: 'offering',
    createdAt: fb.serverTimestamp(),
    updatedAt: fb.serverTimestamp(),
  })
  logMine(fb, 'bookingSent', 'private')
}
// Open trip: to the top of the private queue (`queue` is already in queue order).
export async function openPrivate(fb: Fb, me: { uid: string; name: string }, queue: PublicVehicle[], b: Booking) {
  const top = queue.find((v) => v.ownerUid !== me.uid)
  if (!top) throw new Error('no_private')
  await bookPrivate(fb, me, top, b, 'queue')
}
// Move an open trip on to the next vehicle in the private queue, or expire it.
export async function movePrivateOn(fb: Fb, r: PrivateRide, queue: PublicVehicle[]) {
  const skipped = [...r.skipped, r.vehicleId]
  const next = queue.find((v) => v.ownerUid !== r.uid && !skipped.includes(v.id))
  const data: Record<string, unknown> = { skipped, offerAt: fb.serverTimestamp(), status: next ? 'offering' : 'expired' }
  if (next) Object.assign(data, { vehicleId: next.id, ownerUid: next.ownerUid, price: Math.round(next.priceBase + next.pricePerKm * (r.km ?? tripKm(r.pickupAt, r.destinationAt))) })
  await set(fb, r.uid, data)
  // The offered owner passing it on (the passenger's no thanks and timeouts aren't logged here).
  if (r.ownerUid === fb.auth.currentUser?.uid) logMine(fb, 'offerPassed', 'private')
}
// The owner offers to take an open trip; the passenger books it.
export async function offerPrivate(fb: Fb, r: PrivateRide) {
  await set(fb, r.uid, { status: 'interest', offerAt: fb.serverTimestamp() })
  logMine(fb, 'offerTaken', 'private')
}
export const bookPrivateOffer = (fb: Fb, uid: string) => set(fb, uid, { status: 'confirmed', offerAt: fb.serverTimestamp() })
// The owner's phone completes a booked open trip: shares the owner's first name and phone, and the
// vehicle goes to the back of the private queue.
export async function finishPrivate(fb: Fb, r: PrivateRide, firstName: string, phone: string) {
  await set(fb, r.uid, { status: 'accepted', ownerFirstName: firstName.slice(0, 40), ownerPhone: phone })
  await fb.updateDoc(fb.doc(fb.db, 'publicVehicles', r.vehicleId), { since: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() }).catch(() => undefined)
}

const set = (fb: Fb, uid: string, data: Record<string, unknown>) => fb.updateDoc(fb.doc(fb.db, 'privateRides', uid), { ...data, updatedAt: fb.serverTimestamp() })
export async function cancelPrivate(fb: Fb, uid: string) {
  await set(fb, uid, { status: 'cancelled' })
  logMine(fb, 'bookingCancelled', 'private')
}
// Staff: cancel a stuck booking at any step before it finished; logged on the passenger's record.
export async function staffCancelPrivate(fb: Fb, uid: string) {
  await set(fb, uid, { status: 'cancelled' })
  logActivity(fb, uid, 'rideFixed', fb.auth.currentUser?.email, 'private · cancelled')
}
export async function acceptPrivate(fb: Fb, r: PrivateRide, firstName: string, phone: string) {
  await set(fb, r.uid, { status: 'accepted', ownerFirstName: firstName.slice(0, 40), ownerPhone: phone })
  logMine(fb, 'offerTaken', 'private')
}
export async function declinePrivate(fb: Fb, r: PrivateRide) {
  await set(fb, r.uid, { status: 'declined' })
  logMine(fb, 'offerPassed', 'private')
}
export const pickedUp = (fb: Fb, r: PrivateRide) => set(fb, r.uid, { status: 'onboard' })
export const arrivedPrivate = (fb: Fb, r: PrivateRide) => set(fb, r.uid, { status: 'arrived', arrivedAt: fb.serverTimestamp() })
// The passenger: the trip finished (yes), or a problem. After 10 minutes, either side marks it done.
// Done, and in the same batch the trip's money entries (Paid for the passenger, Earned for the
// owner, at the fixed total; the rules check them against the booking).
async function finishWithEntries(fb: Fb, uid: string) {
  const ref = fb.doc(fb.db, 'privateRides', uid)
  const d = await fb.getDoc(ref)
  const r = d.exists() ? parse(d.id, d.data()) : null
  if (!r) throw new Error('no-booking')
  const batch = fb.writeBatch(fb.db)
  batch.update(ref, { status: 'done', updatedAt: fb.serverTimestamp() })
  addTripEntries(fb, batch, { kind: 'private', passengerUid: uid, driverUid: r.ownerUid || null, createdAtMs: r.createdAt, price: r.price }, fb.auth.currentUser?.email ?? '')
  await batch.commit()
  return r
}
export async function confirmPrivateDone(fb: Fb, uid: string) {
  const r = await finishWithEntries(fb, uid)
  logMine(fb, 'tripFinished', `private · MVR ${r.price}`)
}
// Staff: close a reported problem as done (the trip's entries are recorded); logged on the passenger's record.
export async function closePrivateProblem(fb: Fb, uid: string) {
  const r = await finishWithEntries(fb, uid)
  logActivity(fb, uid, 'rideFixed', fb.auth.currentUser?.email, `private · done · MVR ${r.price}`)
}
export async function problemPrivate(fb: Fb, uid: string) {
  await set(fb, uid, { status: 'problem' })
  logMine(fb, 'problemReported', 'private')
}
