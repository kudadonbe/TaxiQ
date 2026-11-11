import { useEffect, useState } from 'react'
import { BEAT_MS, beatLevel, isFresh, WAKE_METRES, type BeatLevel } from './core/heartbeat'
import { EMPTY_HOURS, isOpenNow, SERVICE_KINDS, type ServiceDetails, type ServiceKind, type ServiceMode, type ServiceStatus, type WeekHours } from './core/services'
import { logActivity } from './activity'

// Services on the map (firestore.rules: services, serviceLog, publicServices; logic in
// src/core/services.ts):
//   services/{id}        the application and record (owner and staff read)
//   serviceLog/{id}      every application and decision, append-only
//   publicServices/{id}  what drivers see: an approved fixed place (written by the owner's app while
//                        approved), or a mobile helper while Available (a heartbeat with its spot)
// The owner applies; any operator approves, rejects or suspends with a reason.

type Fb = typeof import('./firebase')

export interface Service extends ServiceDetails {
  id: string
  ownerUid: string
  ownerName: string
  status: ServiceStatus
  reason: string
  decidedBy: string | null
  decidedAt: number | null
  createdAt: number
  updatedAt: number
}
export interface PublicService {
  id: string
  ownerUid: string
  name: string
  nameDv: string
  kinds: ServiceKind[]
  mode: ServiceMode
  at: [number, number]
  hours: WeekHours
  phone: string
  priceNote: string
  level: BeatLevel // mobile helpers: their heartbeat level; fixed places: 'nap'
  updatedAt: number
  openNow: boolean // fixed: from the hours; mobile: Available and fresh
}
export interface ServiceLogEntry {
  id: string
  serviceId: string
  action: string
  by: string
  reason: string
  at: number
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)
const str = (x: unknown, n = 200) => (typeof x === 'string' ? x.slice(0, n) : '')
const pair = (x: unknown): [number, number] | null => (Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [x[0], x[1]] : null)
const kindsOf = (x: unknown): ServiceKind[] => (Array.isArray(x) ? x.filter((k): k is ServiceKind => SERVICE_KINDS.includes(k as ServiceKind)) : [])
function hoursOf(x: unknown): WeekHours {
  if (!Array.isArray(x) || x.length !== 7) return EMPTY_HOURS
  return x.map((h) => (h && typeof h === 'object' && typeof (h as { open?: unknown }).open === 'string' && typeof (h as { close?: unknown }).close === 'string' ? { open: (h as { open: string }).open.slice(0, 5), close: (h as { close: string }).close.slice(0, 5) } : null))
}

export function parseService(id: string, x: Record<string, unknown>): Service | null {
  const status = (['pending', 'approved', 'rejected', 'suspended'] as const).find((s) => s === x.status)
  const mode = x.mode === 'fixed' || x.mode === 'mobile' ? x.mode : null
  if (!status || !mode) return null
  return {
    id,
    ownerUid: str(x.ownerUid, 128),
    ownerName: str(x.ownerName, 80),
    name: str(x.name, 60),
    nameDv: str(x.nameDv, 60),
    kinds: kindsOf(x.kinds),
    mode,
    at: pair(x.at),
    hours: hoursOf(x.hours),
    phone: str(x.phone, 7),
    priceNote: str(x.priceNote, 120),
    note: str(x.note, 200),
    status,
    reason: str(x.reason, 120),
    decidedBy: typeof x.decidedBy === 'string' ? x.decidedBy : null,
    decidedAt: ms(x.decidedAt) || null,
    createdAt: ms(x.createdAt),
    updatedAt: ms(x.updatedAt),
  }
}

function parsePublic(id: string, x: Record<string, unknown>, now: number): PublicService | null {
  const mode = x.mode === 'fixed' || x.mode === 'mobile' ? x.mode : null
  const at = pair(x.at)
  if (!mode || !at) return null
  const level = (['active', 'rest', 'nap', 'sleep'] as const).find((l) => l === x.level) ?? 'nap'
  const hours = hoursOf(x.hours)
  const updatedAt = ms(x.updatedAt)
  const openNow = mode === 'fixed' ? isOpenNow(hours, new Date(now)) : isFresh({ updatedAt, level }, now)
  return { id, ownerUid: str(x.ownerUid, 128), name: str(x.name, 60), nameDv: str(x.nameDv, 60), kinds: kindsOf(x.kinds), mode, at, hours, phone: str(x.phone, 7), priceNote: str(x.priceNote, 120), level, updatedAt, openNow }
}

// A link to see a place on OpenStreetMap (for the owner and operators).
export const placeLink = (at: [number, number]) => `https://www.openstreetmap.org/?mlat=${at[0]}&mlon=${at[1]}#map=18/${at[0]}/${at[1]}`

// Only the detail fields go into the record (an edit starts from the whole record).
const clean = (d: ServiceDetails) => ({
  name: d.name.trim().slice(0, 60),
  nameDv: d.nameDv.trim().slice(0, 60),
  kinds: [...new Set(d.kinds)],
  mode: d.mode,
  at: d.mode === 'fixed' ? d.at : null,
  hours: d.hours.map((h) => (h ? { open: h.open, close: h.close } : null)),
  phone: d.phone.trim(),
  priceNote: d.priceNote.trim().slice(0, 120),
  note: d.note.trim().slice(0, 200),
})

function useList<T>(fb: Fb | null, enabled: boolean, query: ((f: Fb) => ReturnType<Fb['query']>) | null, parse: (id: string, x: Record<string, unknown>) => T | null, deps: unknown[]): T[] {
  const [list, setList] = useState<T[]>([])
  useEffect(() => {
    if (!fb || !enabled || !query) return
    return fb.onSnapshot(
      query(fb),
      (s) => setList(s.docs.flatMap((d) => parse(d.id, d.data() as Record<string, unknown>) ?? [])),
      () => setList([]),
    )
    // query and parse are rebuilt each render; deps say when to resubscribe.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [fb, enabled, ...deps])
  return fb && enabled ? list : []
}

// The owner's own listings.
export const useMyServices = (fb: Fb | null, uid: string | null) =>
  useList(fb, !!uid, (f) => f.query(f.collection(f.db, 'services'), f.where('ownerUid', '==', uid)), parseService, [uid])
// Staff: every listing.
export const useAllServices = (fb: Fb | null, enabled: boolean) => useList(fb, enabled, (f) => f.query(f.collection(f.db, 'services')), parseService, [])
// Staff: the log, newest first.
export const useServiceLog = (fb: Fb | null, enabled: boolean) =>
  useList(
    fb,
    enabled,
    (f) => f.query(f.collection(f.db, 'serviceLog'), f.orderBy('at', 'desc'), f.limit(100)),
    (id, x): ServiceLogEntry => ({ id, serviceId: str(x.serviceId, 128), action: str(x.action, 20), by: str(x.by, 254), reason: str(x.reason, 120), at: ms(x.at) }),
    [],
  )

// Drivers: what's on the map (signed in). Re-checked every 30 s, so "open now" and freshness update.
export function usePublicServices(fb: Fb | null, enabled: boolean): PublicService[] {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const raw = useList(fb, enabled, (f) => f.query(f.collection(f.db, 'publicServices')), (id, x) => ({ id, x }), [])
  return raw.flatMap(({ id, x }) => {
    const p = parsePublic(id, x, now)
    // Mobile helpers that stopped checking in are gone; fixed places show open or closed.
    return p && (p.mode === 'fixed' || p.openNow) ? [p] : []
  })
}

async function log(fb: Fb, serviceId: string, ownerUid: string, action: string, by: string, reason = '') {
  await fb.setDoc(fb.doc(fb.collection(fb.db, 'serviceLog')), { serviceId, ownerUid, action, by: by.toLowerCase(), reason: reason.slice(0, 120), at: fb.serverTimestamp() })
}

// Apply, or edit and send again for approval (pending or rejected).
export async function applyService(fb: Fb, me: { uid: string; name: string; email: string }, d: ServiceDetails, existing?: Service) {
  const ref = existing ? fb.doc(fb.db, 'services', existing.id) : fb.doc(fb.collection(fb.db, 'services'))
  const base = { ...clean(d), ownerUid: me.uid, ownerName: me.name.slice(0, 80), status: 'pending', reason: '', decidedBy: null, decidedAt: null, updatedAt: fb.serverTimestamp() }
  await fb.setDoc(ref, { ...base, createdAt: existing ? fb.Timestamp.fromMillis(existing.createdAt || Date.now()) : fb.serverTimestamp() })
  await log(fb, ref.id, me.uid, existing ? 'edited' : 'applied', me.email)
}

// An approved listing: hours, phone, price note and note change straight away; a new name, kinds,
// mode or place sends it back to Pending for an operator to check again.
export function needsRecheck(s: Service, d: ServiceDetails) {
  const c = clean(d)
  return c.name !== s.name || c.nameDv !== s.nameDv || c.mode !== s.mode || JSON.stringify(c.kinds) !== JSON.stringify(s.kinds) || JSON.stringify(c.at) !== JSON.stringify(s.at)
}
export async function editApprovedService(fb: Fb, s: Service, d: ServiceDetails, email: string) {
  const c = clean(d)
  const data: Record<string, unknown> = needsRecheck(s, d)
    ? { ...c, status: 'pending', reason: '', updatedAt: fb.serverTimestamp() }
    : { hours: c.hours, phone: c.phone, priceNote: c.priceNote, note: c.note, updatedAt: fb.serverTimestamp() }
  await fb.updateDoc(fb.doc(fb.db, 'services', s.id), data)
  await log(fb, s.id, s.ownerUid, 'edited', email)
}
export async function withdrawService(fb: Fb, s: Service, email: string) {
  await log(fb, s.id, s.ownerUid, 'withdrawn', email)
  await fb.deleteDoc(fb.doc(fb.db, 'publicServices', s.id)).catch(() => undefined)
  await fb.deleteDoc(fb.doc(fb.db, 'services', s.id))
}

// Any operator: approve, reject or suspend (a reason is needed to reject or suspend).
export async function decideService(fb: Fb, s: Service, status: 'approved' | 'rejected' | 'suspended', reason: string, email: string) {
  await fb.updateDoc(fb.doc(fb.db, 'services', s.id), { status, reason: reason.slice(0, 120), decidedBy: email.toLowerCase(), decidedAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })
  await log(fb, s.id, s.ownerUid, status, email, reason)
  if (status !== 'approved') await fb.deleteDoc(fb.doc(fb.db, 'publicServices', s.id)).catch(() => undefined)
  logActivity(fb, s.ownerUid, status === 'approved' ? 'vehicleApproved' : status === 'rejected' ? 'vehicleRejected' : 'vehicleSuspended', email, `service · ${reason}`.slice(0, 80))
}

const publicShape = (s: Service) => ({ ownerUid: s.ownerUid, name: s.name, nameDv: s.nameDv, kinds: s.kinds, mode: s.mode, hours: s.hours, phone: s.phone, priceNote: s.priceNote })

// The owner's app keeps an approved FIXED place on the map (and takes it off when it isn't approved).
// Call from the owner's My services screen.
export function useSyncFixedServices(fb: Fb | null, mine: Service[]) {
  const key = JSON.stringify(mine.filter((s) => s.mode === 'fixed').map((s) => [s.id, s.status, s.updatedAt]))
  useEffect(() => {
    if (!fb) return
    for (const s of mine) {
      if (s.mode !== 'fixed') continue
      const ref = fb.doc(fb.db, 'publicServices', s.id)
      if (s.status === 'approved' && s.at) void fb.setDoc(ref, { ...publicShape(s), at: s.at, level: 'nap', updatedAt: fb.serverTimestamp() }).catch(() => undefined)
      else void fb.deleteDoc(ref).catch(() => undefined)
    }
    // key holds what matters in `mine`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [fb, key])
}

// A MOBILE helper while Available: their spot goes on the map with a heartbeat (rest levels, like
// vehicles); switched off or the app closed, it comes off. Given null, nothing is shared.
export function useServiceAvailability(fb: Fb | null, s: Service | null) {
  const [error, setError] = useState<string | null>(null)
  const id = s && s.status === 'approved' && s.mode === 'mobile' ? s.id : null
  const shape = s ? JSON.stringify(publicShape(s)) : ''
  useEffect(() => {
    if (!fb || !id || !('geolocation' in navigator)) return
    const ref = fb.doc(fb.db, 'publicServices', id)
    let last: { lat: number; lng: number } | null = null
    let movedAt = Date.now()
    let movedFrom: { lat: number; lng: number } | null = null
    let sentAt = 0
    const send = () => {
      if (!last) return
      sentAt = Date.now()
      const level = beatLevel(Date.now() - movedAt, new Date().getHours())
      fb.setDoc(ref, { ...JSON.parse(shape), at: [last.lat, last.lng], level, updatedAt: fb.serverTimestamp() }).catch((e: { code?: string }) => setError(e.code ?? 'error'))
    }
    const beat = setInterval(() => {
      if (Date.now() - sentAt >= BEAT_MS[beatLevel(Date.now() - movedAt, new Date().getHours())]) send()
    }, 5_000)
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        last = { lat: p.coords.latitude, lng: p.coords.longitude }
        setError(null)
        const d = movedFrom ? Math.hypot((last.lat - movedFrom.lat) * 111_320, (last.lng - movedFrom.lng) * 111_320) : Infinity
        if (d >= WAKE_METRES) {
          movedFrom = { ...last }
          movedAt = Date.now()
          if (Date.now() - sentAt >= BEAT_MS.active) send()
        }
        if (!sentAt) send()
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'location_denied' : 'location_error'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
    return () => {
      clearInterval(beat)
      navigator.geolocation.clearWatch(watch)
      void fb.deleteDoc(ref).catch(() => undefined)
    }
  }, [fb, id, shape])
  return { on: !!id, error }
}
