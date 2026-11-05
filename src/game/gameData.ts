import { useEffect, useState } from 'react'
import { isJoinCode, newJoinCode, type Preset } from '../core/gameSim'

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
  await fb.setDoc(fb.doc(fb.db, 'games', gameId, 'players', uid), { name: name.slice(0, 80), role, joinedAt: fb.serverTimestamp() })
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
              const role = (['citizen', 'driver', 'owner'] as const).find((r) => r === d.data().role)
              return role ? [{ uid: d.id, name: String(d.data().name ?? '').slice(0, 80), role }] : []
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
