import { useEffect, useState } from 'react'

// Each person's activity log (firestore.rules: activity): one record per event, append-only, kept
// for 90 days (expireAt; a Firestore TTL policy on activity.expireAt deletes old ones). Written by the
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
