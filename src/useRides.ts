import { useEffect, useRef, useState } from 'react'
import { offerTimedOut } from './core/offers'
import { moveOn, parsePublicTaxi, parseRequest, type PublicTaxi, type RideRequest } from './rides'

type Fb = typeof import('./firebase')
export type RequestWithId = RideRequest & { id: string }

// The public taxi list (no phone numbers), for the public map and the hire screen.
export function usePublicTaxis(fb: Fb | null, enabled: boolean): PublicTaxi[] {
  const [list, setList] = useState<PublicTaxi[]>([])
  useEffect(() => {
    if (!fb || !enabled) return
    return fb.onSnapshot(
      fb.collection(fb.db, 'publicTaxis'),
      (snap) =>
        setList(
          snap.docs
            .map((d) => parsePublicTaxi(d.id, d.data()))
            .filter((x): x is PublicTaxi => !!x)
            .sort((a, b) => Number(a.taxiNo) - Number(b.taxiNo)),
        ),
      () => setList([]),
    )
  }, [fb, enabled])
  return list
}

// Whoever is watching an offer moves it on once it has waited OFFER_SECONDS (+1 s for clock skew).
// Several screens may try at once; the rules let exactly one succeed and the rest fail quietly.
function useAutoMoveOn(fb: Fb | null, requests: RequestWithId[]) {
  const tried = useRef(new Map<string, number>())
  useEffect(() => {
    if (!fb) return
    const timer = setInterval(() => {
      const now = Date.now()
      for (const r of requests) {
        if (!r.offerAt || !offerTimedOut(r, now, 1000)) continue
        const key = `${r.id}:${r.offerAt}`
        if (now - (tried.current.get(key) ?? 0) < 4000) continue
        tried.current.set(key, now)
        moveOn(fb, r.id).catch(() => {})
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [fb, requests])
}

// Passenger: their own request (requests/{uid}).
export function useMyRide(fb: Fb | null, uid: string | null): RequestWithId | null {
  const [ride, setRide] = useState<RequestWithId | null>(null)
  useEffect(() => {
    if (!fb || !uid) return
    return fb.onSnapshot(
      fb.doc(fb.db, 'requests', uid),
      (snap) => {
        const r = parseRequest(snap.data())
        setRide(r ? { ...r, id: snap.id } : null)
      },
      () => setRide(null),
    )
  }, [fb, uid])
  const current = fb && uid ? ride : null
  useAutoMoveOn(fb, current ? [current] : [])
  return current
}

// Driver: offers made to their taxi right now, and rides they accepted.
export function useDriverRides(fb: Fb | null, taxiId: string | null) {
  const [offers, setOffers] = useState<RequestWithId[]>([])
  const [accepted, setAccepted] = useState<RequestWithId[]>([])
  useEffect(() => {
    if (!fb || !taxiId) return
    const { db, collection, query, where, onSnapshot } = fb
    const rows = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) =>
      snap.docs.map((d) => ({ ...parseRequest(d.data())!, id: d.id })).filter((r) => r.status)
    const stops = [
      onSnapshot(query(collection(db, 'requests'), where('offerTo', '==', taxiId)), (snap) => setOffers(rows(snap).filter((r) => r.status === 'offering')), () => setOffers([])),
      onSnapshot(query(collection(db, 'requests'), where('acceptedBy', '==', taxiId)), (snap) => setAccepted(rows(snap).filter((r) => r.status === 'accepted').sort((a, b) => b.createdAt - a.createdAt)), () => setAccepted([])),
    ]
    return () => stops.forEach((s) => s())
  }, [fb, taxiId])
  const live = fb && taxiId
  const current = live ? offers : []
  useAutoMoveOn(fb, current)
  return { offers: current, accepted: live ? accepted : [] }
}

// Staff: requests still looking for a taxi, or that no taxi took.
export function useOpenRequests(fb: Fb | null, enabled: boolean): RequestWithId[] {
  const [list, setList] = useState<RequestWithId[]>([])
  useEffect(() => {
    if (!fb || !enabled) return
    const { db, collection, query, where, onSnapshot } = fb
    return onSnapshot(
      query(collection(db, 'requests'), where('status', 'in', ['offering', 'expired'])),
      (snap) =>
        setList(
          snap.docs
            .map((d) => ({ ...parseRequest(d.data())!, id: d.id }))
            .filter((r) => r.status)
            .sort((a, b) => b.createdAt - a.createdAt),
        ),
      () => setList([]),
    )
  }, [fb, enabled])
  const current = fb && enabled ? list : []
  useAutoMoveOn(fb, current)
  return current
}

// A ticking clock for countdowns.
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [active])
  return now
}
