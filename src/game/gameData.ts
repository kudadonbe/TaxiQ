import { useEffect, useState } from 'react'
import type { CarDoc, SpawnPoint, TripDoc, TripStatus, Write } from '../core/gameEngine'
import { newTrip } from '../core/gameEngine'
import { makeRoster, type Name, type Roster } from '../core/gameNames'
import { gameClock, isJoinCode, newJoinCode, PRESETS, type CarPlan, type Preset } from '../core/gameSim'

// TaxiQ Game rooms in Firestore (G1): games/{id}, games/{id}/players/{uid}, gameCodes/{code}.
// Kept completely apart from the real service. The firestore.rules section "TaxiQ Game" checks
// every write: only the host changes the game, each player only their own entry.

type Fb = typeof import('../firebase')

export type GameRole = 'citizen' | 'driver' | 'owner'
export type GameStatus = 'lobby' | 'running' | 'paused' | 'ended'

export interface Game {
  id: string
  name: string
  code: string
  seed: string
  hostUid: string
  hostName: string
  status: GameStatus
  preset: Preset
  bots: boolean
  startedAt: number | null
  pausedMs: number
  pausedAt: number | null
}

export interface GamePlayer {
  uid: string
  name: string
  role: GameRole
  online: boolean
  waitLat: number | null
  waitLng: number | null
  waitT: number
  beatAt: number | null
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const text = (x: unknown, max = 80) => (typeof x === 'string' ? x.slice(0, max) : '')

function parsePlayer(uid: string, d: Record<string, unknown>): GamePlayer | null {
  const role = (['citizen', 'driver', 'owner'] as const).find((r) => r === d.role)
  if (!role) return null
  return { uid, name: text(d.name), role, online: d.online === true, waitLat: num(d.waitLat), waitLng: num(d.waitLng), waitT: num(d.waitT) ?? 0, beatAt: ms(d.beatAt) }
}

function parsePlan(x: unknown): CarPlan | null {
  const d = x as Record<string, unknown> | null
  if (!d || typeof d !== 'object') return null
  const t0 = num(d.t0)
  const v = num(d.v)
  if (t0 === null || v === null) return null
  if (d.k === 'roam' && num(d.n) !== null) return { k: 'roam', n: num(d.n)!, t0, v }
  if (d.k === 'path' && Array.isArray(d.p) && d.p.every((n) => typeof n === 'number')) return { k: 'path', p: d.p as number[], t0, v }
  return null
}

function parseCar(d: Record<string, unknown>): CarDoc | null {
  const plan = parsePlan(d.plan)
  if (!plan) return null
  return { driverUid: typeof d.driverUid === 'string' ? d.driverUid : null, plan, queuedAt: num(d.queuedAt) ?? 0, waitT: num(d.waitT) ?? 0 }
}

const TRIP_STATUSES: TripStatus[] = ['searching', 'assigned', 'done', 'cancelled', 'expired']
function parseTrip(id: string, d: Record<string, unknown>): TripDoc | null {
  const status = TRIP_STATUSES.find((x) => x === d.status)
  const pLat = num(d.pLat)
  const pLng = num(d.pLng)
  const dLat = num(d.dLat)
  const dLng = num(d.dLng)
  if (!status || pLat === null || pLng === null || dLat === null || dLng === null) return null
  return {
    id,
    riderUid: text(d.riderUid, 128),
    riderName: text(d.riderName),
    bot: d.bot === true,
    pLat,
    pLng,
    pName: text(d.pName),
    dLat,
    dLng,
    dName: text(d.dName),
    status,
    createdT: num(d.createdT) ?? 0,
    offerCar: num(d.offerCar),
    offerT: num(d.offerT),
    response: d.response === 'accept' || d.response === 'decline' ? d.response : null,
    declined: Array.isArray(d.declined) ? d.declined.filter((n): n is number => typeof n === 'number') : [],
    carNo: num(d.carNo),
    driverName: typeof d.driverName === 'string' ? d.driverName.slice(0, 80) : null,
    t0: num(d.t0),
    dPick: num(d.dPick),
    dTotal: num(d.dTotal),
    km: num(d.km),
    fare: num(d.fare),
    doneT: num(d.doneT),
  }
}

// Game seconds now (0 in the lobby; frozen while paused).
export function simNow(game: Game, nowMs = Date.now()) {
  if (!game.startedAt || game.status === 'lobby') return 0
  const at = game.status === 'paused' && game.pausedAt ? game.pausedAt : nowMs
  return gameClock(game.startedAt, at, game.pausedMs).gameSec
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : null)

function parseGame(id: string, d: Record<string, unknown> | undefined): Game | null {
  if (!d) return null
  const status = (['lobby', 'running', 'paused', 'ended'] as const).find((x) => x === d.status)
  const preset = (['small', 'standard', 'large'] as const).find((x) => x === d.preset)
  if (!status || !preset || typeof d.code !== 'string') return null
  return {
    id,
    name: String(d.name ?? '').slice(0, 60),
    code: d.code,
    seed: String(d.seed ?? id),
    hostUid: String(d.hostUid ?? ''),
    hostName: String(d.hostName ?? '').slice(0, 80),
    status,
    preset,
    bots: d.bots === true,
    startedAt: ms(d.startedAt),
    pausedMs: typeof d.pausedMs === 'number' ? d.pausedMs : 0,
    pausedAt: ms(d.pausedAt),
  }
}

// Games this browser has joined, so "My games" can list them (no extra index needed).
const MY_GAMES = 'taxiq.game.mine'
export function rememberGame(id: string) {
  try {
    const list = new Set(JSON.parse(localStorage.getItem(MY_GAMES) ?? '[]') as string[])
    list.add(id)
    localStorage.setItem(MY_GAMES, JSON.stringify([...list].slice(-20)))
  } catch {
    // Storage unavailable: the game still works, it just won't be listed.
  }
}
export function myGameIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MY_GAMES) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').reverse() : []
  } catch {
    return []
  }
}

// Host: create a game and its join code in one write (retries if the code is taken).
export async function createGame(fb: Fb, host: { uid: string; name: string }, opts: { name: string; preset: Preset; bots: boolean }): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = fb.doc(fb.collection(fb.db, 'games'))
    const code = newJoinCode()
    const batch = fb.writeBatch(fb.db)
    batch.set(ref, {
      name: opts.name.trim().slice(0, 60),
      code,
      seed: ref.id,
      hostUid: host.uid,
      hostName: host.name.slice(0, 80),
      status: 'lobby',
      preset: opts.preset,
      bots: opts.bots,
      createdAt: fb.serverTimestamp(),
      startedAt: null,
      pausedMs: 0,
      pausedAt: null,
    })
    batch.set(fb.doc(fb.db, 'gameCodes', code), { gameId: ref.id, hostUid: host.uid })
    batch.set(fb.doc(fb.db, 'games', ref.id, 'world', 'roster'), rosterFor(ref.id, opts.preset))
    batch.set(fb.doc(fb.db, 'games', ref.id, 'players', host.uid), { name: host.name.slice(0, 80), role: 'owner', joinedAt: fb.serverTimestamp() })
    try {
      await batch.commit()
      rememberGame(ref.id)
      return ref.id
    } catch (e) {
      if ((e as { code?: string }).code !== 'permission-denied') throw e // a taken code shows up as denied
    }
  }
  throw Object.assign(new Error('no_code'), { code: 'no_code' })
}

function rosterFor(seed: string, preset: Preset): Roster {
  return makeRoster(seed, PRESETS[preset].cars, PRESETS[preset].centers)
}

// ---- The shared TaxiQ World: one world that is always there and always running. The first person
// to open it creates it (with its people); after that it is only joined.
export const WORLD_ID = 'world'

export async function enterWorld(fb: Fb, me: { uid: string; name: string }): Promise<string> {
  const ref = fb.doc(fb.db, 'games', WORLD_ID)
  const snap = await fb.getDoc(ref)
  if (!snap.exists()) {
    const batch = fb.writeBatch(fb.db)
    batch.set(ref, {
      name: 'TaxiQ World',
      code: 'KDHWRD',
      seed: WORLD_ID,
      hostUid: 'world',
      hostName: 'TaxiQ',
      status: 'running',
      preset: 'standard',
      bots: true,
      createdAt: fb.serverTimestamp(),
      startedAt: fb.serverTimestamp(),
      pausedMs: 0,
      pausedAt: null,
    })
    batch.set(fb.doc(fb.db, 'games', WORLD_ID, 'world', 'roster'), rosterFor(WORLD_ID, 'standard'))
    // Someone else may have created it a moment ago: then just join.
    await batch.commit().catch(() => undefined)
  }
  const mine = await fb.getDoc(fb.doc(fb.db, 'games', WORLD_ID, 'players', me.uid))
  if (!mine.exists()) await fb.setDoc(fb.doc(fb.db, 'games', WORLD_ID, 'players', me.uid), { name: me.name.slice(0, 80), role: 'driver', online: false, joinedAt: fb.serverTimestamp() })
  return WORLD_ID
}

const parseName = (x: unknown): Name => {
  const d = (x ?? {}) as Record<string, unknown>
  return { e: text(d.e), d: text(d.d) }
}
export function useRoster(fb: Fb | null, gameId: string | null): Roster | null {
  const [roster, setRoster] = useState<Roster | null>(null)
  useEffect(() => {
    if (!fb || !gameId) return
    return fb.onSnapshot(fb.doc(fb.db, 'games', gameId, 'world', 'roster'), (s) => {
      const d = s.data()
      if (!d) return setRoster(null)
      setRoster({
        drivers: Array.isArray(d.drivers) ? d.drivers.map(parseName) : [],
        citizens: Array.isArray(d.citizens) ? d.citizens.map(parseName) : [],
        centers: Array.isArray(d.centers) ? d.centers.map((c: Record<string, unknown>) => ({ name: parseName(c?.name), owner: parseName(c?.owner) })) : [],
      })
    })
  }, [fb, gameId])
  return fb && gameId ? roster : null
}

// The ride service runs on one device at a time: whoever holds the lease. Returns true when this
// device holds it now. A free or expired lease is taken; our own is renewed.
export const LEASE_MS = 30_000
export async function holdLease(fb: Fb, gameId: string, uid: string): Promise<boolean> {
  const ref = fb.doc(fb.db, 'games', gameId, 'engine', 'lease')
  try {
    return await fb.runTransaction(fb.db, async (tx) => {
      const cur = await tx.get(ref)
      const d = cur.data()
      const until = ms(d?.until) ?? 0
      if (d && d.uid !== uid && until > Date.now()) return false
      tx.set(ref, { uid, until: fb.Timestamp.fromMillis(Date.now() + LEASE_MS) })
      return true
    })
  } catch {
    return false
  }
}

// A player's heartbeat, so the engine only offers rides to drivers who are really here.
export const BEAT_MS = 30_000
export async function beat(fb: Fb, gameId: string, uid: string) {
  await fb.updateDoc(fb.doc(fb.db, 'games', gameId, 'players', uid), { beatAt: fb.serverTimestamp() })
}

// Anyone signed in: join by code. Returns the game id.
export async function joinByCode(fb: Fb, player: { uid: string; name: string }, raw: string, role: GameRole = 'citizen'): Promise<string> {
  const code = raw.trim().toUpperCase()
  if (!isJoinCode(code)) throw Object.assign(new Error('bad_code'), { code: 'bad_code' })
  const snap = await fb.getDoc(fb.doc(fb.db, 'gameCodes', code))
  const gameId = snap.data()?.gameId
  if (typeof gameId !== 'string') throw Object.assign(new Error('not_found'), { code: 'not_found' })
  const mine = await fb.getDoc(fb.doc(fb.db, 'games', gameId, 'players', player.uid))
  if (!mine.exists()) await fb.setDoc(fb.doc(fb.db, 'games', gameId, 'players', player.uid), { name: player.name.slice(0, 80), role, joinedAt: fb.serverTimestamp() })
  rememberGame(gameId)
  return gameId
}

export async function setRole(fb: Fb, gameId: string, uid: string, name: string, role: GameRole) {
  await fb.setDoc(fb.doc(fb.db, 'games', gameId, 'players', uid), { name: name.slice(0, 80), role, online: false, joinedAt: fb.serverTimestamp() }, { merge: true })
}

// ---- G2: rides

// Cars and trips of a room, live.
export function useGameWorld(fb: Fb | null, gameId: string | null) {
  const [cars, setCars] = useState<Map<number, CarDoc>>(() => new Map())
  const [trips, setTrips] = useState<TripDoc[]>([])
  useEffect(() => {
    if (!fb || !gameId) return
    const stops = [
      fb.onSnapshot(fb.collection(fb.db, 'games', gameId, 'cars'), (s) => {
        const m = new Map<number, CarDoc>()
        for (const d of s.docs) {
          const car = parseCar(d.data())
          if (car && /^\d+$/.test(d.id)) m.set(Number(d.id), car)
        }
        setCars(m)
      }),
      fb.onSnapshot(fb.query(fb.collection(fb.db, 'games', gameId, 'trips'), fb.orderBy('createdT', 'desc'), fb.limit(150)), (s) =>
        setTrips(
          s.docs.flatMap((d) => {
            const trip = parseTrip(d.id, d.data())
            return trip ? [trip] : []
          }),
        ),
      ),
    ]
    return () => stops.forEach((x) => x())
  }, [fb, gameId])
  const live = fb && gameId
  return { cars: live ? cars : new Map<number, CarDoc>(), trips: live ? trips : [] }
}

export async function requestRide(fb: Fb, gameId: string, me: { uid: string; name: string }, from: SpawnPoint, to: SpawnPoint, t: number) {
  await fb.setDoc(fb.doc(fb.collection(fb.db, 'games', gameId, 'trips')), { ...newTrip({ riderUid: me.uid, riderName: me.name, bot: false, from, to, t }), createdAt: fb.serverTimestamp() })
}
export async function cancelRide(fb: Fb, gameId: string, tripId: string) {
  await fb.updateDoc(fb.doc(fb.db, 'games', gameId, 'trips', tripId), { status: 'cancelled' })
}
export async function answerOffer(fb: Fb, gameId: string, tripId: string, answer: 'accept' | 'decline') {
  await fb.updateDoc(fb.doc(fb.db, 'games', gameId, 'trips', tripId), { response: answer })
}
export async function setOnline(fb: Fb, gameId: string, uid: string, online: boolean) {
  await fb.updateDoc(fb.doc(fb.db, 'games', gameId, 'players', uid), { online })
}
export async function waitAt(fb: Fb, gameId: string, uid: string, at: [number, number], t: number) {
  await fb.updateDoc(fb.doc(fb.db, 'games', gameId, 'players', uid), { waitLat: at[0], waitLng: at[1], waitT: t })
}

// Host: save one engine step.
export async function commitWrites(fb: Fb, gameId: string, writes: Write[]) {
  if (!writes.length) return
  const batch = fb.writeBatch(fb.db)
  for (const w of writes.slice(0, 450)) {
    if (w.kind === 'car') batch.set(fb.doc(fb.db, 'games', gameId, 'cars', String(w.n)), w.data)
    else if (w.kind === 'trip') batch.update(fb.doc(fb.db, 'games', gameId, 'trips', w.id), w.data)
    else batch.set(fb.doc(fb.collection(fb.db, 'games', gameId, 'trips')), { ...w.data, createdAt: fb.serverTimestamp() })
  }
  await batch.commit()
}

export async function leaveGame(fb: Fb, gameId: string, uid: string) {
  await fb.deleteDoc(fb.doc(fb.db, 'games', gameId, 'players', uid))
}

// Host controls. Pausing stores when it paused; resuming adds the paused time to pausedMs, so the
// game clock (core/gameSim gameClock) skips it.
export async function hostControl(fb: Fb, game: Game, action: 'start' | 'pause' | 'resume' | 'end') {
  const ref = fb.doc(fb.db, 'games', game.id)
  if (action === 'start') await fb.updateDoc(ref, { status: 'running', startedAt: fb.serverTimestamp(), pausedMs: 0, pausedAt: null })
  if (action === 'pause') await fb.updateDoc(ref, { status: 'paused', pausedAt: fb.serverTimestamp() })
  if (action === 'resume') await fb.updateDoc(ref, { status: 'running', pausedMs: game.pausedMs + Math.max(0, Date.now() - (game.pausedAt ?? Date.now())), pausedAt: null })
  if (action === 'end') await fb.updateDoc(ref, { status: 'ended' })
}

// Live room: the game and its players.
export function useGameRoom(fb: Fb | null, gameId: string | null) {
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<GamePlayer[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!fb || !gameId) return
    const stops = [
      fb.onSnapshot(fb.doc(fb.db, 'games', gameId), (s) => setGame(parseGame(s.id, s.data())), (e) => setError(e.code)),
      fb.onSnapshot(
        fb.collection(fb.db, 'games', gameId, 'players'),
        (s) =>
          setPlayers(
            s.docs.flatMap((d) => {
              const p = parsePlayer(d.id, d.data())
              return p ? [p] : []
            }),
          ),
        (e) => setError(e.code),
      ),
    ]
    return () => stops.forEach((x) => x())
  }, [fb, gameId])
  const live = fb && gameId
  return { game: live ? game : null, players: live ? players : [], error: live ? error : null }
}

// The games in "My games", loaded once.
export function useMyGames(fb: Fb | null, signedIn: boolean) {
  const [games, setGames] = useState<Game[]>([])
  useEffect(() => {
    if (!fb || !signedIn) return
    let cancelled = false
    void Promise.all(myGameIds().map((id) => fb.getDoc(fb.doc(fb.db, 'games', id)).then((s) => parseGame(s.id, s.data())).catch(() => null))).then((list) => {
      if (!cancelled) setGames(list.filter((g): g is Game => !!g && g.status !== 'ended'))
    })
    return () => {
      cancelled = true
    }
  }, [fb, signedIn])
  return games
}
