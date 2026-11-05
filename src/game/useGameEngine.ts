import { useEffect, useRef, useState } from 'react'
import type { Roster } from '../core/gameNames'
import { engineStep, type CarDoc, type SpawnPoint, type TripDoc } from '../core/gameEngine'
import { clockAt, PRESETS } from '../core/gameSim'
import { loadPlaces } from '../places'
import { ROAD_GRAPH } from '../positions'
import { commitWrites, holdLease, simNow, type Game, type GamePlayer } from './gameData'

type Fb = typeof import('../firebase')

let spawnCache: Promise<SpawnPoint[]> | null = null
// Bot citizens are picked up at and taken to real houses and landmarks.
function spawnPoints(): Promise<SpawnPoint[]> {
  spawnCache ??= loadPlaces().then((all) => all.filter((p) => (p.t === 'h' || p.t === 'l') && p.p[0]).map((p) => ({ lat: p.p[0]![0], lng: p.p[0]![1], name: p.e })))
  return spawnCache
}

const ONLINE_MS = 90_000 // a driver whose screen hasn't checked in for 90 s gets no offers

// Runs the ride service on this device while it holds the world's engine lease (plans/game-mode.md
// §11): one engine step per second, saved in one batch. If this device leaves, another player's
// device takes the lease over within about 30 seconds. Returns whether this device runs it now.
export function useGameEngine(
  fb: Fb | null,
  uid: string | null,
  game: Game | null,
  players: GamePlayer[],
  cars: ReadonlyMap<number, CarDoc>,
  trips: TripDoc[],
  roster: Roster | null,
  canRun: boolean,
) {
  const latest = useRef({ game, players, cars, trips, roster })
  useEffect(() => {
    latest.current = { game, players, cars, trips, roster }
  })
  const [engine, setEngine] = useState(false)
  const running = !!fb && !!uid && !!game && canRun && game.status === 'running'
  const gameId = game?.id
  useEffect(() => {
    if (!running || !fb || !uid || !gameId) return
    let spawn: SpawnPoint[] = []
    void spawnPoints().then((s) => (spawn = s))
    let mine = false
    let leaseAt = 0
    let busy = false
    let last = -1
    let stopped = false
    const timer = setInterval(() => {
      const { game: g, players: ps, cars: cs, trips: ts, roster: r } = latest.current
      if (busy || !g || g.status !== 'running') return
      if (Date.now() - leaseAt > 10_000) {
        leaseAt = Date.now()
        busy = true
        void holdLease(fb, gameId, uid)
          .then((ok) => {
            mine = ok
            if (!stopped) setEngine(ok)
            if (!ok) last = -1
          })
          .finally(() => (busy = false))
        return
      }
      if (!mine) return
      const t = simNow(g)
      const dt = last < 0 ? 1 : Math.min(10, Math.max(0, t - last))
      last = t
      const now = Date.now()
      const writes = engineStep({
        g: ROAD_GRAPH,
        seed: g.seed,
        t,
        dt,
        hh: clockAt(t).hh,
        cars: PRESETS[g.preset].cars,
        bots: g.bots,
        players: ps.map((p) => ({ ...p, online: p.online && p.beatAt !== null && now - p.beatAt < ONLINE_MS })),
        carDocs: cs,
        trips: ts,
        spawn,
        rand: Math.random,
        botDriverName: (n) => r?.drivers[n - 1]?.e ?? '',
        citizenNames: r?.citizens.map((c) => c.e),
      })
      if (!writes.length) return
      busy = true
      commitWrites(fb, gameId, writes)
        .catch((e: unknown) => console.warn('[TaxiQ Game] engine write failed', (e as { code?: string }).code))
        .finally(() => (busy = false))
    }, 1000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [running, fb, uid, gameId])
  return running && engine
}
