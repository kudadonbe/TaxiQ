import { useEffect, useState } from 'react'

// Each person's activity log (firestore.rules: activity): one record per event, append-only, kept
// for 90 days (expireAt; a platform admin's app deletes old ones with deleteExpired, since a TTL
// policy needs the Blaze plan). Written by the
// person's own app, or by staff when they act on that person. Read by the person and by staff. Says
// no more than needed: never locations or phone numbers.

type Fb = typeof import('./firebase')

export const ACTIVITY_KINDS = [
  'roleChanged', // staff gave or changed the person's role (detail: the new role)
  'vehicleApplied',
  'vehicleEdited',
  'vehicleApproved',
  'vehicleRejected',
  'vehicleSuspended',
  'vehicleLinked', // linked as a center taxi
  'availableOn',
  'availableOff',
  'bookingSent', // as a passenger (detail: taxi or private)
  'bookingCancelled',
  'bookingDone',
  'offerTaken', // as a driver/owner: I'll take it, or Accept
  'offerPassed',
  'tripFinished',
  'problemReported',
  'rideFixed', // staff cancelled a stuck ride or closed a problem
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
export const ACTIVITY_DAYS = 90

export interface Activity {
  id: string
  uid: string
  kind: ActivityKind
  detail: string
  by: string
  at: number
}

// Fire and forget: a failed log write never stops what the person was doing.
export function logActivity(fb: Fb | null, uid: string | null | undefined, kind: ActivityKind, by: string | null | undefined, detail = '') {
  if (!fb || !uid) return
  void fb
    .setDoc(fb.doc(fb.collection(fb.db, 'activity')), {
      uid,
      kind,
      detail: detail.slice(0, 80),
      by: (by ?? '').toLowerCase(),
      at: fb.serverTimestamp(),
      expireAt: fb.Timestamp.fromMillis(Date.now() + ACTIVITY_DAYS * 86_400_000),
    })
    .catch(() => undefined)
}

// Logs for whoever is signed in on this device; nothing when signed out.
export function logMine(fb: Fb | null, kind: ActivityKind, detail = '') {
  const u = fb?.auth.currentUser
  if (!u) return
  logActivity(fb, u.uid, kind, u.email, detail)
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)

// One person's log, newest first.
export function useActivity(fb: Fb | null, uid: string | null, max = 50): Activity[] {
  const [list, setList] = useState<Activity[]>([])
  useEffect(() => {
    if (!fb || !uid) return
    return fb.onSnapshot(
      fb.query(fb.collection(fb.db, 'activity'), fb.where('uid', '==', uid), fb.orderBy('at', 'desc'), fb.limit(max)),
      (s) =>
        setList(
          s.docs.flatMap((d) => {
            const x = d.data()
            const kind = ACTIVITY_KINDS.find((k) => k === x.kind)
            return kind ? [{ id: d.id, uid: String(x.uid ?? ''), kind, detail: String(x.detail ?? '').slice(0, 80), by: String(x.by ?? ''), at: ms(x.at) }] : []
          }),
        ),
      () => setList([]),
    )
  }, [fb, uid, max])
  return fb && uid ? list : []
}

// Records past their time, which a TTL policy would delete if we had the Blaze plan: activity
// entries (expireAt, 90 days) and location-sharing records left behind when an app closed
// (presence and presencePublic, expiresAt, at most an hour). A platform admin's app deletes them in
// batches of up to 400; the rules allow it only for platform admins and only once expired. Returns
// how many were deleted. Stops after `rounds` batches per collection; the next run carries on.
export const CLEANUP_BATCH = 400
const EXPIRING: readonly (readonly [collection: string, field: string])[] = [
  ['activity', 'expireAt'],
  ['presence', 'expiresAt'],
  ['presencePublic', 'expiresAt'],
]
export async function deleteExpired(fb: Fb, rounds = 10): Promise<number> {
  let total = 0
  for (const [col, field] of EXPIRING) {
    for (let i = 0; i < rounds; i++) {
      const snap = await fb.getDocs(fb.query(fb.collection(fb.db, col), fb.where(field, '<', fb.Timestamp.now()), fb.limit(CLEANUP_BATCH)))
      if (snap.empty) break
      const batch = fb.writeBatch(fb.db)
      for (const d of snap.docs) batch.delete(d.ref)
      await batch.commit()
      total += snap.size
      if (snap.size < CLEANUP_BATCH) break
    }
  }
  return total
}

// Once a day per device: true when the cleanup hasn't run today here (and marks it as run).
const CLEANUP_KEY = 'taxiq.activityCleanup'
export function cleanupDueToday(today = new Date().toISOString().slice(0, 10)): boolean {
  try {
    if (localStorage.getItem(CLEANUP_KEY) === today) return false
    localStorage.setItem(CLEANUP_KEY, today)
    return true
  } catch {
    return false // no storage: only the button runs it
  }
}
