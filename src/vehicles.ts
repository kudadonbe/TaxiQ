import { useEffect, useState } from 'react'

// Private vehicles for hire (people and companies, not a center's queue). See firestore.rules:
//   vehicles/{id}        the application and record (owner and staff read; has the phone number)
//   vehicleLog/{id}      every application and decision, append-only
//   publicVehicles/{id}  an approved vehicle on the map while its owner has it available (no phone)
// The owner applies; any operator approves, rejects or suspends with a reason; the owner sets the price.

type Fb = typeof import('./firebase')

export type VehicleType = 'car' | 'van' | 'pickup' | 'motorbike' | 'ebike'
export const VEHICLE_TYPES: VehicleType[] = ['car', 'van', 'pickup', 'motorbike', 'ebike']
export const DEFAULT_SEATS: Record<VehicleType, number> = { car: 4, van: 8, pickup: 2, motorbike: 1, ebike: 1 }
export type VehicleStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface VehicleDetails {
  type: VehicleType
  reg: string
  colour: string
  seats: number
  priceBase: number // MVR a trip
  pricePerKm: number // MVR a km (0 = a flat price)
  phone: string
  note: string
}
export interface Vehicle extends VehicleDetails {
  id: string
  ownerUid: string
  ownerName: string
  status: VehicleStatus
  reason: string
  decidedBy: string | null
  decidedAt: number | null
  createdAt: number
}
export interface PublicVehicle {
  id: string
  type: VehicleType
  colour: string
  seats: number
  firstName: string
  priceBase: number
  pricePerKm: number
  at: [number, number]
  heading: number
  updatedAt: number
}
export interface LogEntry {
  id: string
  vehicleId: string
  action: string
  by: string
  reason: string
  at: number
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)
const str = (x: unknown, n = 120) => (typeof x === 'string' ? x.slice(0, n) : '')
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
const typeOf = (x: unknown) => VEHICLE_TYPES.find((t) => t === x)

// Allow-list checks for the application form (the rules check the same).
export function vehicleErrors(d: VehicleDetails): Partial<Record<keyof VehicleDetails, true>> {
  const e: Partial<Record<keyof VehicleDetails, true>> = {}
  if (!/^[A-Za-z0-9 -]{2,12}$/.test(d.reg.trim())) e.reg = true
  if (d.colour.length > 24 || !/^[\p{L}\p{N} -]*$/u.test(d.colour)) e.colour = true
  if (!Number.isInteger(d.seats) || d.seats < 1 || d.seats > 20) e.seats = true
  if (!(d.priceBase >= 0 && d.priceBase <= 10000)) e.priceBase = true
  if (!(d.pricePerKm >= 0 && d.pricePerKm <= 1000)) e.pricePerKm = true
  if (!/^\d{7}$/.test(d.phone.trim())) e.phone = true
  if (d.note.length > 120) e.note = true
  return e
}

// What a trip costs at this vehicle's price.
export const priceFor = (v: { priceBase: number; pricePerKm: number }, km: number) => Math.round(v.priceBase + v.pricePerKm * Math.max(0, km))

function parseVehicle(id: string, x: Record<string, unknown>): Vehicle | null {
  const type = typeOf(x.type)
  const status = (['pending', 'approved', 'rejected', 'suspended'] as const).find((s) => s === x.status)
  if (!type || !status) return null
  return {
    id,
    ownerUid: str(x.ownerUid, 128),
    ownerName: str(x.ownerName, 80),
    type,
    reg: str(x.reg, 12),
    colour: str(x.colour, 24),
    seats: num(x.seats),
    priceBase: num(x.priceBase),
    pricePerKm: num(x.pricePerKm),
    phone: str(x.phone, 7),
    note: str(x.note),
    status,
    reason: str(x.reason),
    decidedBy: typeof x.decidedBy === 'string' ? x.decidedBy : null,
    decidedAt: ms(x.decidedAt) || null,
    createdAt: ms(x.createdAt),
  }
}

function useCollection<T>(fb: Fb | null, enabled: boolean, build: (fb: Fb) => ReturnType<Fb['query']> | null, parse: (id: string, x: Record<string, unknown>) => T | null, deps: unknown[]) {
  const [list, setList] = useState<T[]>([])
  useEffect(() => {
    if (!fb || !enabled) return
    const q = build(fb)
    if (!q) return
    return fb.onSnapshot(
      q,
      (s) => setList(s.docs.flatMap((d) => (parse(d.id, d.data() as Record<string, unknown>) ?? []) as T[])),
      () => setList([]),
    )
    // build and parse are fixed per call site; deps say when to re-subscribe.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [fb, enabled, ...deps])
  return fb && enabled ? list : []
}

export const useMyVehicles = (fb: Fb | null, uid: string | null) =>
  useCollection(fb, !!uid, (f) => f.query(f.collection(f.db, 'vehicles'), f.where('ownerUid', '==', uid)), parseVehicle, [uid])

export const useAllVehicles = (fb: Fb | null, staff: boolean) => useCollection(fb, staff, (f) => f.query(f.collection(f.db, 'vehicles'), f.orderBy('createdAt', 'desc'), f.limit(200)), parseVehicle, [])

export const useVehicleLog = (fb: Fb | null, staff: boolean) =>
  useCollection(
    fb,
    staff,
    (f) => f.query(f.collection(f.db, 'vehicleLog'), f.orderBy('at', 'desc'), f.limit(100)),
    (id, x) => ({ id, vehicleId: str(x.vehicleId, 128), action: str(x.action, 20), by: str(x.by, 120), reason: str(x.reason), at: ms(x.at) }),
    [],
  )

const STALE = 2 * 60_000
export function usePublicVehicles(fb: Fb | null, signedIn: boolean): PublicVehicle[] {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])
  const list = useCollection(
    fb,
    signedIn,
    (f) => f.query(f.collection(f.db, 'publicVehicles'), f.where('updatedAt', '>', f.Timestamp.fromMillis(Date.now() - 24 * 3600_000))),
    (id, x) => {
      const type = typeOf(x.type)
      const at = Array.isArray(x.at) && x.at.length === 2 && x.at.every((n: unknown) => typeof n === 'number') ? ([x.at[0], x.at[1]] as [number, number]) : null
      if (!type || !at) return null
      return { id, type, colour: str(x.colour, 24), seats: num(x.seats), firstName: str(x.firstName, 40), priceBase: num(x.priceBase), pricePerKm: num(x.pricePerKm), at, heading: num(x.heading), updatedAt: ms(x.updatedAt) }
    },
    [],
  )
  // Only vehicles whose owner's device has updated lately (app open, available).
  return list.filter((v) => now - v.updatedAt < STALE)
}

async function log(fb: Fb, vehicleId: string, ownerUid: string, action: string, by: string, reason = '') {
  await fb.setDoc(fb.doc(fb.collection(fb.db, 'vehicleLog')), { vehicleId, ownerUid, action, by, reason: reason.slice(0, 120), at: fb.serverTimestamp() })
}

const clean = (d: VehicleDetails) => ({ ...d, reg: d.reg.trim().toUpperCase(), colour: d.colour.trim(), phone: d.phone.trim(), note: d.note.trim() })

// The owner applies, or edits and sends back for approval.
export async function applyVehicle(fb: Fb, me: { uid: string; name: string; email: string }, d: VehicleDetails, existing?: Vehicle) {
  const ref = existing ? fb.doc(fb.db, 'vehicles', existing.id) : fb.doc(fb.collection(fb.db, 'vehicles'))
  const base = { ...clean(d), ownerUid: me.uid, ownerName: me.name.slice(0, 80), kind: 'private', status: 'pending', reason: '', decidedBy: null, decidedAt: null, updatedAt: fb.serverTimestamp() }
  if (existing) await fb.setDoc(ref, { ...base, createdAt: fb.Timestamp.fromMillis(existing.createdAt || Date.now()) })
  else await fb.setDoc(ref, { ...base, createdAt: fb.serverTimestamp() })
  await log(fb, ref.id, me.uid, existing ? 'edited' : 'applied', me.email)
}
export async function setPrice(fb: Fb, v: Vehicle, priceBase: number, pricePerKm: number) {
  await fb.updateDoc(fb.doc(fb.db, 'vehicles', v.id), { priceBase, pricePerKm, updatedAt: fb.serverTimestamp() })
}
export async function withdrawVehicle(fb: Fb, v: Vehicle, email: string) {
  await log(fb, v.id, v.ownerUid, 'withdrawn', email)
  await fb.deleteDoc(fb.doc(fb.db, 'vehicles', v.id))
}
// Any operator: approve, reject or suspend (a reason is needed to reject or suspend).
export async function decideVehicle(fb: Fb, v: Vehicle, status: 'approved' | 'rejected' | 'suspended', reason: string, email: string) {
  await fb.updateDoc(fb.doc(fb.db, 'vehicles', v.id), { status, reason: reason.slice(0, 120), decidedBy: email, decidedAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })
  await log(fb, v.id, v.ownerUid, status, email, reason)
  if (status !== 'approved') await fb.deleteDoc(fb.doc(fb.db, 'publicVehicles', v.id)).catch(() => undefined)
}

// The owner makes an approved vehicle available: their device puts it on the map (every 10 s or
// 15 m) until they stop. Stopping removes it from the map.
export function useAvailability(fb: Fb | null, v: Vehicle | null, firstName: string) {
  const [on, setOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = on && v && v.status === 'approved' ? v.id : null
  const shape = v ? JSON.stringify({ type: v.type, colour: v.colour, seats: v.seats, priceBase: v.priceBase, pricePerKm: v.pricePerKm }) : ''
  useEffect(() => {
    if (!fb || !id || !('geolocation' in navigator)) return
    let sent: { lat: number; lng: number; t: number } | null = null
    const ref = fb.doc(fb.db, 'publicVehicles', id)
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp }
        const moved = sent ? Math.hypot((fix.lat - sent.lat) * 111_320, (fix.lng - sent.lng) * 111_320) : Infinity
        if (sent && fix.t - sent.t < 10_000 && moved < 15) return
        sent = fix
        fb.setDoc(ref, { ...JSON.parse(shape), firstName: firstName.slice(0, 40), at: [fix.lat, fix.lng], heading: p.coords.heading ?? 0, updatedAt: fb.serverTimestamp() }).catch((e: { code?: string }) => setError(e.code ?? 'error'))
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'location_denied' : 'location_error'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
    return () => {
      navigator.geolocation.clearWatch(watch)
      void fb.deleteDoc(ref).catch(() => undefined)
    }
  }, [fb, id, shape, firstName])
  return { on: !!id, error, setOn }
}
