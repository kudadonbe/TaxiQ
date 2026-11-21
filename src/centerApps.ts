import { useEffect, useRef, useState } from 'react'
import { isOpenNow, type WeekHours } from './core/services'
import { isLogo, LOGO_MAX, LOGO_SIZE, suspendedRole, type CenterAppStatus, type CenterDetails } from './core/centerApps'
import { logActivity } from './activity'
import { countFree, FREE_MIN_GAP_MS, freeShown, shouldWriteFree, unavailableTaxis, type FreeTaxi } from './core/freeTaxis'

// Taxi center registry (firestore.rules: centerApplications, centerLog, publicCenters; checks in
// src/core/centerApps.ts):
//   centerApplications/{id}  the owner's application (the owner and platform admins read; holds the
//                            Transport Authority licence number)
//   centerLog/{id}           every application and decision, append-only
//   publicCenters/{id}       what the map reads: exactly what was approved, never the licence;
//                            plus free / freeAt, the count of free taxis kept by the center's staff
// On approval the real center is centers/{id} (the same id; src/centers.ts) and the owner becomes
// its admin (roles/{email}: admin with that centerId), all in one batch the rules check.

type Fb = typeof import('./firebase')

export interface CenterApp extends CenterDetails {
  id: string
  ownerUid: string
  ownerEmail: string
  ownerName: string
  pendingLogo: string // a new logo waiting for a platform admin ('' when none)
  centerId: string | null // set once approved (the same as id)
  status: CenterAppStatus
  reason: string
  decidedBy: string | null
  decidedAt: number | null
  createdAt: number
  updatedAt: number
}
export interface PublicCenter {
  id: string
  name: string
  nameDv: string
  at: [number, number]
  phone: string
  hours: WeekHours
  logo: string // a validated data URL, or ''
  openNow: boolean
  free: number | null // taxis free now, published by the center's staff (src/core/freeTaxis.ts)
  freeAt: number | null // when that count was written
  freeNow: number | null // the count to show: null when missing or older than 10 minutes
}
export interface CenterLogEntry {
  id: string
  appId: string
  action: string
  by: string
  reason: string
  at: number
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)
const str = (x: unknown, n = 200) => (typeof x === 'string' ? x.slice(0, n) : '')
const pair = (x: unknown): [number, number] | null => (Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [x[0], x[1]] : null)
const logoOf = (x: unknown) => (typeof x === 'string' && isLogo(x) ? x : '')
function hoursOf(x: unknown): WeekHours {
  if (!Array.isArray(x) || x.length !== 7) return [null, null, null, null, null, null, null]
  return x.map((h) => (h && typeof h === 'object' && typeof (h as { open?: unknown }).open === 'string' && typeof (h as { close?: unknown }).close === 'string' ? { open: (h as { open: string }).open.slice(0, 5), close: (h as { close: string }).close.slice(0, 5) } : null))
}

export function parseCenterApp(id: string, x: Record<string, unknown>): CenterApp | null {
  const status = (['pending', 'approved', 'rejected', 'suspended'] as const).find((s) => s === x.status)
  if (!status) return null
  return {
    id,
    ownerUid: str(x.ownerUid, 128),
    ownerEmail: str(x.ownerEmail, 254),
    ownerName: str(x.ownerName, 80),
    name: str(x.name, 60),
    nameDv: str(x.nameDv, 60),
    at: pair(x.at),
    phone: str(x.phone, 7),
    hours: hoursOf(x.hours),
    licence: str(x.licence, 30),
    logo: logoOf(x.logo),
    pendingLogo: logoOf(x.pendingLogo),
    centerId: typeof x.centerId === 'string' ? x.centerId : null,
    status,
    reason: str(x.reason, 120),
    decidedBy: typeof x.decidedBy === 'string' ? x.decidedBy : null,
    decidedAt: ms(x.decidedAt) || null,
    createdAt: ms(x.createdAt),
    updatedAt: ms(x.updatedAt),
  }
}

export function parsePublicCenter(id: string, x: Record<string, unknown>, now: number): PublicCenter | null {
  const at = pair(x.at)
  const name = str(x.name, 60)
  if (!at || !name) return null
  const hours = hoursOf(x.hours)
  const free = typeof x.free === 'number' && Number.isInteger(x.free) && x.free >= 0 ? x.free : null
  return { id, name, nameDv: str(x.nameDv, 60), at, phone: str(x.phone, 7), hours, logo: logoOf(x.logo), openNow: isOpenNow(hours, new Date(now)), free, freeAt: free === null ? null : ms(x.freeAt) || null, freeNow: freeShown(free, ms(x.freeAt) || null, now) }
}

// Only the detail fields go into the record.
const clean = (d: CenterDetails) => ({
  name: d.name.trim().slice(0, 60),
  nameDv: d.nameDv.trim().slice(0, 60),
  at: d.at,
  hours: d.hours.map((h) => (h ? { open: h.open, close: h.close } : null)),
  phone: d.phone.trim(),
  licence: d.licence,
  logo: d.logo,
})
const publicShape = (a: Pick<CenterApp, 'name' | 'nameDv' | 'at' | 'phone' | 'hours' | 'logo'>, fb: Fb) => ({ name: a.name, nameDv: a.nameDv, at: a.at, phone: a.phone, hours: a.hours, logo: a.logo, updatedAt: fb.serverTimestamp() })

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

// The owner's own applications.
export const useMyCenterApps = (fb: Fb | null, uid: string | null) =>
  useList(fb, !!uid, (f) => f.query(f.collection(f.db, 'centerApplications'), f.where('ownerUid', '==', uid)), parseCenterApp, [uid])
// Platform admins: every application, and the log (newest first).
export const useAllCenterApps = (fb: Fb | null, enabled: boolean) => useList(fb, enabled, (f) => f.query(f.collection(f.db, 'centerApplications')), parseCenterApp, [])
export const useCenterLog = (fb: Fb | null, enabled: boolean) =>
  useList(
    fb,
    enabled,
    (f) => f.query(f.collection(f.db, 'centerLog'), f.orderBy('at', 'desc'), f.limit(100)),
    (id, x): CenterLogEntry => ({ id, appId: str(x.appId, 128), action: str(x.action, 20), by: str(x.by, 254), reason: str(x.reason, 120), at: ms(x.at) }),
    [],
  )

// The map: approved centers (signed in). Re-checked every minute, so "open now" updates.
export function usePublicCenters(fb: Fb | null, enabled: boolean): PublicCenter[] {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const raw = useList(fb, enabled, (f) => f.query(f.collection(f.db, 'publicCenters')), (id, x) => ({ id, x }), [])
  return raw.flatMap(({ id, x }) => parsePublicCenter(id, x, now) ?? [])
}

// A center's staff session keeps publicCenters/{center}.free (taxis that could take an offer now)
// in step: when the count changes, at most once every 30 s, and at least every 5 minutes so the
// card knows it is fresh. Nothing is written while the center has no map copy (the main center,
// which has no application, or a center that is pending or suspended).
export function useSyncCenterFree(fb: Fb | null, enabled: boolean, center: string, order: readonly string[], taxis: ReadonlyMap<string, FreeTaxi>) {
  const [cur, setCur] = useState<{ center: string; v: { free: number | null; freeAt: number | null } | null } | null>(null)
  const [offDuty, setOffDuty] = useState<ReadonlySet<string>>(new Set())
  const [seen, setSeen] = useState<ReadonlyMap<string, number>>(new Map()) // vehicleId -> its last update on the private map
  const [now, setNow] = useState(() => Date.now())
  const lastWrite = useRef(0)
  const on = !!fb && enabled
  const exists = on && cur?.center === center && cur.v !== null

  useEffect(() => {
    if (!fb || !enabled) return
    return fb.onSnapshot(
      fb.doc(fb.db, 'publicCenters', center),
      (snap) => {
        const x = snap.exists() ? (snap.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>) : null
        setCur({ center, v: x ? { free: typeof x.free === 'number' ? x.free : null, freeAt: ms(x.freeAt) || null } : null })
      },
      () => setCur({ center, v: null }),
    )
  }, [fb, enabled, center])

  useEffect(() => {
    if (!fb || !exists) return
    const t = setInterval(() => setNow(Date.now()), FREE_MIN_GAP_MS)
    const stop = fb.onSnapshot(
      fb.query(fb.collection(fb.db, 'duty'), fb.where('offDuty', '==', true)),
      (s) => setOffDuty(new Set(s.docs.map((d) => d.id))),
      () => setOffDuty(new Set()),
    )
    return () => {
      clearInterval(t)
      stop()
    }
  }, [fb, exists])

  // Only linked taxis (one vehicle as private hire and a center taxi) can be out on private hire.
  const linked = [...new Set([...taxis.values()].flatMap((t) => (t.vehicleId ? [t.vehicleId] : [])))].sort().join(',')
  useEffect(() => {
    if (!fb || !exists || !linked) return
    const stops = linked.split(',').map((vid) =>
      fb.onSnapshot(
        fb.doc(fb.db, 'publicVehicles', vid),
        (snap) =>
          setSeen((m) => {
            const next = new Map(m)
            const at = snap.exists() ? ms(snap.data().updatedAt) : 0
            if (at) next.set(vid, at)
            else next.delete(vid)
            return next
          }),
        () => {},
      ),
    )
    return () => stops.forEach((s) => s())
  }, [fb, exists, linked])

  // The same 10 minutes as readOrderAndSuspended in src/rides.ts.
  const privateNow = new Set([...seen].filter(([, at]) => at > now - 10 * 60_000).map(([vid]) => vid))
  const free = countFree(order, new Set(taxis.keys()), unavailableTaxis(taxis.values(), offDuty, privateNow))
  const v = exists ? cur!.v : null
  useEffect(() => {
    if (!fb || !v) return
    const t = Date.now()
    if (!shouldWriteFree(v, free, t, lastWrite.current)) return
    lastWrite.current = t
    fb.updateDoc(fb.doc(fb.db, 'publicCenters', center), { free, freeAt: fb.serverTimestamp() }).catch(() => {})
  }, [fb, v, free, now, center])
}

type Batch = ReturnType<Fb['writeBatch']>
function log(fb: Fb, b: Batch, appId: string, ownerUid: string, action: string, by: string, reason = '') {
  b.set(fb.doc(fb.collection(fb.db, 'centerLog')), { appId, ownerUid, action, by: by.toLowerCase(), reason: reason.slice(0, 120), at: fb.serverTimestamp() })
}

// Apply, or edit and send again (pending or rejected).
export async function applyCenter(fb: Fb, me: { uid: string; name: string; email: string }, d: CenterDetails, existing?: CenterApp) {
  const ref = existing ? fb.doc(fb.db, 'centerApplications', existing.id) : fb.doc(fb.collection(fb.db, 'centerApplications'))
  const b = fb.writeBatch(fb.db)
  b.set(ref, {
    ...clean(d),
    pendingLogo: '',
    ownerUid: me.uid,
    ownerEmail: existing?.ownerEmail || me.email.toLowerCase(),
    ownerName: me.name.slice(0, 80),
    centerId: existing?.centerId ?? null,
    status: 'pending',
    reason: '',
    decidedBy: null,
    decidedAt: null,
    createdAt: existing ? fb.Timestamp.fromMillis(existing.createdAt || Date.now()) : fb.serverTimestamp(),
    updatedAt: fb.serverTimestamp(),
  })
  log(fb, b, ref.id, me.uid, existing ? 'edited' : 'applied', me.email)
  await b.commit()
}

// The owner, after approval: hours and phone change straight away (and on the map); a new logo waits
// for a platform admin; a new name or place sends it back to Pending (and off the map until then).
export async function editApprovedCenter(fb: Fb, a: CenterApp, d: CenterDetails, email: string, recheck: boolean) {
  const c = clean(d)
  const ref = fb.doc(fb.db, 'centerApplications', a.id)
  const pub = fb.doc(fb.db, 'publicCenters', a.id)
  const b = fb.writeBatch(fb.db)
  if (recheck) {
    const data: Record<string, unknown> = { name: c.name, nameDv: c.nameDv, at: c.at, hours: c.hours, phone: c.phone, status: 'pending', reason: '', updatedAt: fb.serverTimestamp() }
    if (c.logo !== a.logo) data.pendingLogo = c.logo
    b.update(ref, data)
    b.delete(pub)
  } else {
    const data: Record<string, unknown> = { hours: c.hours, phone: c.phone, updatedAt: fb.serverTimestamp() }
    if (c.logo !== a.logo) data.pendingLogo = c.logo
    b.update(ref, data)
    b.set(pub, publicShape({ ...a, hours: c.hours, phone: c.phone }, fb))
  }
  log(fb, b, a.id, a.ownerUid, c.logo !== a.logo && !recheck ? 'logo' : 'edited', email)
  await b.commit()
}

export async function withdrawCenter(fb: Fb, a: CenterApp, email: string) {
  const b = fb.writeBatch(fb.db)
  log(fb, b, a.id, a.ownerUid, 'withdrawn', email)
  b.delete(fb.doc(fb.db, 'centerApplications', a.id))
  await b.commit()
}

// Refused approval: the owner already works for a center (or is a platform admin or developer).
// The error's code is 'staff_elsewhere'.
export const STAFF_ELSEWHERE = 'staff_elsewhere'

// A platform admin approves (makes the center and its admin, and puts it on the map), rejects or
// suspends (a reason is needed), all in one batch.
export async function decideCenter(fb: Fb, a: CenterApp, status: 'approved' | 'rejected' | 'suspended', reason: string, email: string) {
  const ref = fb.doc(fb.db, 'centerApplications', a.id)
  const pub = fb.doc(fb.db, 'publicCenters', a.id)
  const b = fb.writeBatch(fb.db)
  const decided = { status, reason: reason.slice(0, 120), decidedBy: email.toLowerCase(), decidedAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() }
  if (status === 'approved') {
    const roleRef = fb.doc(fb.db, 'roles', a.ownerEmail)
    const role = await fb.getDoc(roleRef)
    const r = role.exists() ? (role.data() as Record<string, unknown>) : {}
    const was = typeof r.role === 'string' ? r.role : ''
    if (['admin', 'operator', 'driver', 'dev'].includes(was) && !(was === 'admin' && r.centerId === a.id)) throw Object.assign(new Error(STAFF_ELSEWHERE), { code: STAFF_ELSEWHERE })
    b.update(ref, { ...decided, centerId: a.id })
    b.set(fb.doc(fb.db, 'centers', a.id), { name: a.name, nameDv: a.nameDv, at: a.at, updatedBy: email.toLowerCase(), updatedAt: fb.serverTimestamp() }, { merge: true })
    const entry: Record<string, unknown> = { role: 'admin', centerId: a.id, addedBy: email.toLowerCase(), addedAt: fb.serverTimestamp() }
    if (r.corpus === true) entry.corpus = true
    // A private driver keeps private hire as the center's admin.
    if (was === 'private' || r.private === true) entry.private = true
    b.set(roleRef, entry)
    b.set(pub, publicShape(a, fb))
  } else {
    b.update(ref, decided)
    b.delete(pub)
    // Suspended: the owner is no longer the center's admin (the rules check it). A corpus editor
    // or private driver keeps that; approving again gives the admin role back.
    if (status === 'suspended') {
      const roleRef = fb.doc(fb.db, 'roles', a.ownerEmail)
      const role = await fb.getDoc(roleRef)
      const r = role.exists() ? (role.data() as Record<string, unknown>) : {}
      if (r.role === 'admin' && r.centerId === a.id) {
        const kept = suspendedRole(r, email)
        if (kept) b.set(roleRef, { ...kept, addedAt: fb.serverTimestamp() })
        else b.delete(roleRef)
      }
    }
  }
  log(fb, b, a.id, a.ownerUid, status, email, reason)
  await b.commit()
  logActivity(fb, a.ownerUid, status === 'approved' ? 'vehicleApproved' : status === 'rejected' ? 'vehicleRejected' : 'vehicleSuspended', email, `center · ${reason}`.slice(0, 80))
}

// A platform admin approves or turns down a new logo for an approved center.
export async function decideCenterLogo(fb: Fb, a: CenterApp, ok: boolean, reason: string, email: string) {
  const b = fb.writeBatch(fb.db)
  const logo = ok ? a.pendingLogo : a.logo
  b.update(fb.doc(fb.db, 'centerApplications', a.id), { logo, pendingLogo: '', reason: reason.slice(0, 120), decidedBy: email.toLowerCase(), decidedAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() })
  if (ok) b.set(fb.doc(fb.db, 'publicCenters', a.id), publicShape({ ...a, logo }, fb))
  log(fb, b, a.id, a.ownerUid, ok ? 'logoApproved' : 'logoRejected', email, reason)
  await b.commit()
}

// A logo picked by the owner: drawn into a 128 x 128 square (kept whole, centred, transparent around
// it) and saved as WebP (PNG where the browser can't make WebP), small enough for the record.
export async function resizeLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 8_000_000) throw new Error('logo_type')
  const img = await createImageBitmap(file)
  for (const size of [LOGO_SIZE, 96, 64]) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) break
    const k = Math.min(size / img.width, size / img.height)
    const w = img.width * k
    const h = img.height * k
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
    for (const q of [0.85, 0.7, 0.5]) {
      const url = canvas.toDataURL('image/webp', q)
      if (url.length <= LOGO_MAX && isLogo(url)) return url
    }
    const png = canvas.toDataURL('image/png')
    if (png.length <= LOGO_MAX && isLogo(png)) return png
  }
  throw new Error('logo_big')
}
