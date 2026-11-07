import { useEffect, useState } from 'react'
import type { PublicVehicle } from './vehicles'

// Booking a private vehicle (firestore.rules: privateRides). One booking at a time per passenger,
// at privateRides/{passengerUid}. Only the passenger, the vehicle's owner and staff see it.
//   offering -> accepted (owner shares first name and phone) | declined | cancelled (passenger)
//   accepted -> onboard (owner picked them up) -> done

type Fb = typeof import('./firebase')

export type PrivateRideStatus = 'offering' | 'accepted' | 'declined' | 'cancelled' | 'onboard' | 'done'
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
  createdAt: number
  updatedAt: number
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)
const str = (x: unknown, n = 120) => (typeof x === 'string' ? x.slice(0, n) : '')
const pair = (x: unknown): [number, number] | null => (Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number') ? [x[0], x[1]] : null)
const STATUSES: PrivateRideStatus[] = ['offering', 'accepted', 'declined', 'cancelled', 'onboard', 'done']

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
    createdAt: ms(x.createdAt),
    updatedAt: ms(x.updatedAt),
  }
}

// What a trip costs: the vehicle's price for the distance, estimated from a straight line x 1.3
// (roads are rarely straight). Shown as "about".
export function estimate(v: Pick<PublicVehicle, 'priceBase' | 'pricePerKm'>, from: [number, number], to: [number, number] | null) {
  if (!to) return Math.round(v.priceBase)
  const k = Math.cos((((from[0] + to[0]) / 2) * Math.PI) / 180)
  const km = (Math.hypot((to[0] - from[0]) * 111.32, (to[1] - from[1]) * 111.32 * k) * 1.3)
  return Math.round(v.priceBase + v.pricePerKm * km)
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
    const q = fb.query(fb.collection(fb.db, 'privateRides'), fb.where('ownerUid', '==', uid), fb.where('status', 'in', ['offering', 'accepted', 'onboard']))
    return fb.onSnapshot(
      q,
      (s) => setList(s.docs.flatMap((d) => parse(d.id, d.data()) ?? [])),
      () => setList([]),
    )
  }, [fb, uid])
  return fb && uid ? list : []
}

export async function bookPrivate(
  fb: Fb,
  me: { uid: string; name: string },
  v: PublicVehicle,
  b: { phone: string; pickup: string; pickupAt: [number, number]; destination: string; destinationAt: [number, number] | null; note: string },
) {
  await fb.setDoc(fb.doc(fb.db, 'privateRides', me.uid), {
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
    price: estimate(v, b.pickupAt, b.destinationAt),
    status: 'offering',
    createdAt: fb.serverTimestamp(),
    updatedAt: fb.serverTimestamp(),
  })
}
const set = (fb: Fb, uid: string, data: Record<string, unknown>) => fb.updateDoc(fb.doc(fb.db, 'privateRides', uid), { ...data, updatedAt: fb.serverTimestamp() })
export const cancelPrivate = (fb: Fb, uid: string) => set(fb, uid, { status: 'cancelled' })
export const acceptPrivate = (fb: Fb, r: PrivateRide, firstName: string, phone: string) => set(fb, r.uid, { status: 'accepted', ownerFirstName: firstName.slice(0, 40), ownerPhone: phone })
export const declinePrivate = (fb: Fb, r: PrivateRide) => set(fb, r.uid, { status: 'declined' })
export const pickedUp = (fb: Fb, r: PrivateRide) => set(fb, r.uid, { status: 'onboard' })
export const tripDone = (fb: Fb, r: PrivateRide) => set(fb, r.uid, { status: 'done' })
