import { useEffect, useMemo, useRef, useState } from 'react'
import { acceptRide, finishRide, moveOn, parsePublicTaxi, parseRequest, type PublicTaxi, type RideRequest } from './rides'
import { finishDue } from './core/taxiFare'
import { timedOut } from './core/openTrip'

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
        if (!(r.status === 'offering' || r.status === 'interest' || r.status === 'confirmed') || !timedOut(r.status, r.offerAt, now)) continue
        const key = `${r.id}:${r.offerAt}`
        if (now - (tried.current.get(key) ?? 0) < 4000) continue
        tried.current.set(key, now)
        moveOn(fb, r.id).catch(() => {})
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [fb, requests])
}

// After the driver taps Arrived, the passenger has 10 minutes to confirm or report a problem; with
// no answer, whoever is watching marks it done (the rules check the time).
function useAutoFinish(fb: Fb | null, list: RequestWithId[]) {
  const tried = useRef(new Set<string>())
  useEffect(() => {
    if (!fb) return
    const timer = setInterval(() => {
      for (const r of list) {
        if (r.status !== 'arrived' || !finishDue(r.arrivedAt, Date.now()) || tried.current.has(`${r.id}:${r.arrivedAt}`)) continue
        tried.current.add(`${r.id}:${r.arrivedAt}`)
        finishRide(fb, r.id).catch(() => {})
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [fb, list])
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
  const mine = useMemo(() => (current ? [current] : []), [current])
  useAutoMoveOn(fb, mine)
  useAutoFinish(fb, mine)
  return current
}

// Driver: offers made to their taxi right now, and rides they accepted.
export function useDriverRides(fb: Fb | null, taxiId: string | null, email: string | null = null) {
  const [offers, setOffers] = useState<RequestWithId[]>([])
  const [accepted, setAccepted] = useState<RequestWithId[]>([])
  useEffect(() => {
    if (!fb || !taxiId) return
    const { db, collection, query, where, onSnapshot } = fb
    const rows = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) =>
      snap.docs.map((d) => ({ ...parseRequest(d.data())!, id: d.id })).filter((r) => r.status)
    const stops = [
      onSnapshot(query(collection(db, 'requests'), where('offerTo', '==', taxiId)), (snap) => setOffers(rows(snap).filter((r) => r.status === 'offering' || r.status === 'interest' || r.status === 'confirmed')), () => setOffers([])),
      onSnapshot(query(collection(db, 'requests'), where('acceptedBy', '==', taxiId)), (snap) => setAccepted(rows(snap).filter((r) => r.status === 'accepted' || r.status === 'onboard' || r.status === 'arrived' || r.status === 'done').sort((a, b) => b.createdAt - a.createdAt)), () => setAccepted([])),
    ]
    return () => stops.forEach((s) => s())
  }, [fb, taxiId])
  const live = fb && taxiId
  const current = live ? offers : []
  useAutoMoveOn(fb, current)
  useFinishBookings(fb, current, email)
  const rides = live ? accepted : []
  useAutoFinish(fb, rides)
  return { offers: current, accepted: rides }
}

// Booked by the passenger: complete it (the taxi goes to the back, the dispatch is logged). Done by
// the driver's phone; staff screens do it too if the driver's phone hasn't within 5 s.
function useFinishBookings(fb: Fb | null, list: RequestWithId[], email: string | null, afterMs = 0) {
  const tried = useRef(new Set<string>())
  useEffect(() => {
    if (!fb) return
    const tick = () => {
      for (const r of list) {
        if (r.status !== 'confirmed' || !r.offerTo || Date.now() < r.offerAt + afterMs) continue
        const key = `${r.id}:${r.offerAt}`
        if (tried.current.has(key)) continue
        tried.current.add(key)
        acceptRide(fb, r.id, r.offerTo, email ?? '').catch(() => {})
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [fb, list, email, afterMs])
}

// Staff: requests still looking for a taxi, or that no taxi took.
export function useOpenRequests(fb: Fb | null, enabled: boolean, staffEmail: string | null = null, center = 'main'): RequestWithId[] {
  const [list, setList] = useState<RequestWithId[]>([])
  useEffect(() => {
    if (!fb || !enabled) return
    const { db, collection, query, where, onSnapshot } = fb
    return onSnapshot(
      query(collection(db, 'requests'), where('centerId', '==', center), where('status', 'in', ['offering', 'interest', 'confirmed', 'expired', 'problem'])),
      (snap) =>
        setList(
          snap.docs
            .map((d) => ({ ...parseRequest(d.data())!, id: d.id }))
            .filter((r) => r.status)
            .sort((a, b) => b.createdAt - a.createdAt),
        ),
      () => setList([]),
    )
  }, [fb, enabled, center])
  const current = fb && enabled ? list : []
  useAutoMoveOn(fb, current)
  useFinishBookings(fb, current, staffEmail, 5000)
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
