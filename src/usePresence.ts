import { useCallback, useEffect, useRef, useState } from 'react'
import { guessMoving, isLive, SHARE_MAX_MS, speedBetween, STALE_MS, UPDATE_M, UPDATE_MS, type Moving } from './core/presence'

// Citizens showing themselves on the map (opt-in; MDS Tier 1 personal data, see SECURITY.md).
// presence/{uid}: with their name, readable by drivers and centers. presencePublic/{uid}: no name,
// only when they chose everyone signed in. Both are deleted when they stop.

type Fb = typeof import('./firebase')

export type Visibility = 'staff' | 'public'
export interface Person {
  id: string
  at: [number, number]
  mode: Moving
  name?: string // staff only
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)
const MODES: Moving[] = ['walk', 'run', 'bike', 'ebike', 'motorbike', 'taxi']

// Everyone sharing that this viewer may see. Staff (drivers, operators, admins) read the copy with
// names; anyone else signed in reads the public copy. Old and finished shares are left out.
export function usePeople(fb: Fb | null, signedIn: boolean, staff: boolean, myUid: string | null): Person[] {
  const [docs, setDocs] = useState<{ id: string; at: [number, number]; mode: Moving; name?: string; updatedAt: number; expiresAt: number }[]>([])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!fb || !signedIn) return
    const since = fb.Timestamp.fromMillis(Date.now() - STALE_MS - SHARE_MAX_MS)
    const q = fb.query(fb.collection(fb.db, staff ? 'presence' : 'presencePublic'), fb.where('updatedAt', '>', since))
    return fb.onSnapshot(
      q,
      (s) =>
        setDocs(
          s.docs.flatMap((d) => {
            const x = d.data()
            const mode = MODES.find((m) => m === x.mode)
            const at = Array.isArray(x.at) && x.at.length === 2 && x.at.every((n: unknown) => typeof n === 'number') ? ([x.at[0], x.at[1]] as [number, number]) : null
            if (!mode || !at) return []
            return [{ id: d.id, at, mode, name: staff && typeof x.name === 'string' ? x.name.slice(0, 80) : undefined, updatedAt: ms(x.updatedAt), expiresAt: ms(x.expiresAt) }]
          }),
        ),
      () => setDocs([]),
    )
  }, [fb, signedIn, staff])
  const live = fb && signedIn
  return live ? docs.filter((d) => d.id !== myUid && isLive(d, now)).map(({ id, at, mode, name }) => ({ id, at, mode, name })) : []
}

// This person's own sharing: start (with who may see them), change, stop. Stops by itself after an
// hour. While sharing, the way they move is guessed from their speed unless they pick it.
export function useShareMe(fb: Fb | null, uid: string | null, name: string, inRide: boolean) {
  const [share, setShare] = useState<{ visibility: Visibility; until: number } | null>(null)
  const [mode, setMode] = useState<Moving>('walk')
  const [picked, setPicked] = useState<Moving | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef({ name, inRide, picked })
  useEffect(() => {
    latest.current = { name, inRide, picked }
  })

  const stop = useCallback(() => {
    setShare(null)
    setPicked(null)
    if (!fb || !uid) return
    void fb.deleteDoc(fb.doc(fb.db, 'presence', uid)).catch(() => undefined)
    void fb.deleteDoc(fb.doc(fb.db, 'presencePublic', uid)).catch(() => undefined)
  }, [fb, uid])

  const visibility = share?.visibility
  const until = share?.until
  useEffect(() => {
    if (!fb || !uid || !visibility || !until || !('geolocation' in navigator)) return
    const speeds: number[] = []
    let last: { lat: number; lng: number; t: number } | null = null
    let sent: { lat: number; lng: number; t: number } | null = null
    const expiresAt = fb.Timestamp.fromMillis(until)
    const send = (lat: number, lng: number, m: Moving, auto: boolean) => {
      const base = { at: [lat, lng], mode: m, modeAuto: auto, updatedAt: fb.serverTimestamp(), expiresAt }
      const writes = [fb.setDoc(fb.doc(fb.db, 'presence', uid), { ...base, name: latest.current.name.slice(0, 80), visibility })]
      if (visibility === 'public') writes.push(fb.setDoc(fb.doc(fb.db, 'presencePublic', uid), base))
      else writes.push(fb.deleteDoc(fb.doc(fb.db, 'presencePublic', uid)))
      Promise.all(writes).catch((e: { code?: string }) => setError(e.code ?? 'error'))
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp }
        const v = p.coords.speed ?? (last ? speedBetween(last, fix) : NaN)
        last = fix
        if (Number.isFinite(v)) speeds.push(v)
        if (speeds.length > 7) speeds.shift()
        const guess = guessMoving(speeds, latest.current.inRide)
        setMode(guess)
        const m = latest.current.picked ?? guess
        const moved = sent ? speedBetween(sent, { ...fix, t: sent.t + 1000 }) : Infinity // metres since the last send
        if (!sent || fix.t - sent.t >= UPDATE_MS || moved >= UPDATE_M) {
          sent = fix
          send(fix.lat, fix.lng, m, !latest.current.picked)
        }
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'location_denied' : 'location_error'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
    const end = setTimeout(stop, Math.max(0, until - Date.now()))
    return () => {
      navigator.geolocation.clearWatch(watch)
      clearTimeout(end)
    }
  }, [fb, uid, visibility, until, stop])

  return {
    sharing: share,
    mode: picked ?? mode,
    guessed: mode,
    picked,
    error,
    start: (v: Visibility) => {
      setError(null)
      setShare({ visibility: v, until: Date.now() + SHARE_MAX_MS })
    },
    setVisibility: (v: Visibility) => setShare((s) => (s ? { ...s, visibility: v } : s)),
    pick: setPicked,
    stop,
  }
}
