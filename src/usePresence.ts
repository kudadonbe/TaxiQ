import { useCallback, useEffect, useRef, useState } from 'react'
import { BEAT_MS, beatLevel, WAKE_METRES, type BeatLevel } from './core/heartbeat'
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
  level?: BeatLevel // how often it checks in (resting people are drawn faded)
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)
const MODES: Moving[] = ['walk', 'run', 'bike', 'ebike', 'motorbike', 'taxi']

// Everyone sharing that this viewer may see. Staff (drivers, operators, admins) read the copy with
// names; anyone else signed in reads the public copy. Old and finished shares are left out.
export function usePeople(fb: Fb | null, signedIn: boolean, staff: boolean, myUid: string | null): Person[] {
  const [docs, setDocs] = useState<{ id: string; at: [number, number]; mode: Moving; name?: string; level: BeatLevel; updatedAt: number; expiresAt: number }[]>([])
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
            const level = (['active', 'rest', 'nap', 'sleep'] as const).find((l) => l === x.level) ?? 'active'
            return [{ id: d.id, at, mode, name: staff && typeof x.name === 'string' ? x.name.slice(0, 80) : undefined, level, updatedAt: ms(x.updatedAt), expiresAt: ms(x.expiresAt) }]
          }),
        ),
      () => setDocs([]),
    )
  }, [fb, signedIn, staff])
  const live = fb && signedIn
  return live ? docs.filter((d) => d.id !== myUid && isLive(d, now)).map(({ id, at, mode, name, level }) => ({ id, at, mode, name, level })) : []
}

// This person's own sharing: start (with who may see them), change, stop. Stops by itself after an
// hour. While sharing, the way they move is guessed from their speed unless they pick it.
// `blocked`: the person is driving their own vehicle (they're on the map as the vehicle), so
// sharing pauses and their records are removed; switching the vehicle off resumes it.
export function useShareMe(fb: Fb | null, uid: string | null, name: string, inRide: boolean, blocked = false) {
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

  const visibility = blocked ? undefined : share?.visibility
  const until = blocked ? undefined : share?.until
  useEffect(() => {
    if (!fb || !uid || !blocked) return
    void fb.deleteDoc(fb.doc(fb.db, 'presence', uid)).catch(() => undefined)
    void fb.deleteDoc(fb.doc(fb.db, 'presencePublic', uid)).catch(() => undefined)
  }, [fb, uid, blocked])
  useEffect(() => {
    if (!fb || !uid || !visibility || !until || !('geolocation' in navigator)) return
    const speeds: number[] = []
    let last: { lat: number; lng: number; t: number } | null = null
    let sent: { lat: number; lng: number; t: number } | null = null
    const expiresAt = fb.Timestamp.fromMillis(until)
    const send = (lat: number, lng: number, m: Moving, auto: boolean) => {
      const base = { at: [lat, lng], mode: m, modeAuto: auto, level: beatLevel(Date.now() - movedAt, new Date().getHours()), updatedAt: fb.serverTimestamp(), expiresAt }
      const writes = [fb.setDoc(fb.doc(fb.db, 'presence', uid), { ...base, name: latest.current.name.slice(0, 80), visibility })]
      if (visibility === 'public') writes.push(fb.setDoc(fb.doc(fb.db, 'presencePublic', uid), base))
      else writes.push(fb.deleteDoc(fb.doc(fb.db, 'presencePublic', uid)))
      Promise.all(writes).catch((e: { code?: string }) => setError(e.code ?? 'error'))
    }
    // Heartbeat with rest levels (src/core/heartbeat.ts): standing still steps down to Rest, Nap and
    // (at night) Sleep, sending less often; moving again wakes it to Active.
    let lastMode: { m: Moving; auto: boolean } = { m: 'walk', auto: true }
    let movedAt = Date.now()
    let movedFrom: { lat: number; lng: number } | null = null
    const beat = setInterval(() => {
      if (!sent) return
      const level = beatLevel(Date.now() - movedAt, new Date().getHours())
      if (Date.now() - sent.t >= BEAT_MS[level]) {
        sent = { ...sent, t: Date.now() }
        send(sent.lat, sent.lng, lastMode.m, lastMode.auto)
      }
    }, 5_000)
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
        lastMode = { m, auto: !latest.current.picked }
        const d = movedFrom ? Math.hypot((fix.lat - movedFrom.lat) * 111_320, (fix.lng - movedFrom.lng) * 111_320) : Infinity
        if (d >= WAKE_METRES) {
          movedFrom = { lat: fix.lat, lng: fix.lng }
          movedAt = Date.now()
        }
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
      clearInterval(beat)
      navigator.geolocation.clearWatch(watch)
      clearTimeout(end)
    }
  }, [fb, uid, visibility, until, stop])

  return {
    sharing: blocked ? null : share,
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
