import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { clockAt, PRESETS, type Preset } from '../core/gameSim'
import { useI18n } from '../i18n'
import type { Taxi } from '../types'
import { beat, BEAT_MS, createGame, enterWorld, hostControl, joinByCode, leaveGame, setRole, simNow, GAME_ROLES, useGameRoom, useGameWorld, useMyGames, useRoster, WORLD_ID, type GameRole } from './gameData'
import { PlayPanel } from './PlayPanel'
import { useGameEngine } from './useGameEngine'
import { gamePositionSource } from './gamePositions'

const MapView = lazy(() => import('../components/MapView'))
const GAME_KEY = 'taxiq.game.open'

// TaxiQ Game, phase G1: rooms with join codes, roles, host controls, a game clock and the shared
// map of game cars. Play money and game data only (plans/game-mode.md).
export function GameTab() {
  const { fb, uid, name, status, signIn } = useAuth()
  const { t } = useI18n()
  const [gameId, setGameIdState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(GAME_KEY)
    } catch {
      return null
    }
  })
  const setGameId = (id: string | null) => {
    setGameIdState(id)
    try {
      if (id) sessionStorage.setItem(GAME_KEY, id)
      else sessionStorage.removeItem(GAME_KEY)
    } catch {
      // Storage unavailable: fine.
    }
  }

  if (status !== 'signedIn' || !fb || !uid)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-black">TaxiQ Game</h2>
          <GameBadge />
        </div>
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          {t.gameSignIn}{' '}
          <button type="button" onClick={signIn} disabled={status === 'loading'} className="ms-2 min-h-10 rounded-lg bg-slate-900 px-3 font-semibold text-white disabled:opacity-40">
            {t.signIn}
          </button>
        </p>
        <HowToPlay open />
      </div>
    )
  return gameId ? <Room gameId={gameId} onLeave={() => setGameId(null)} /> : <Lobby onOpen={setGameId} me={{ uid, name: name ?? '' }} />
}

// Short "How to play" for players (the full guide is plans/how-to-play.md).
function HowToPlay({ open = false }: { open?: boolean }) {
  const { t } = useI18n()
  return (
    <details open={open} className="rounded-xl border border-fuchsia-200 bg-white p-4">
      <summary className="cursor-pointer font-bold">❓ {t.howToPlay}</summary>
      <p className="mt-2 text-sm text-slate-700">{t.howGoal}</p>
      <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-slate-700">
        {Object.values(t.howSteps).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-fuchsia-800">{t.howNext}</p>
      <p className="mt-3 border-t border-fuchsia-100 pt-2 text-center text-xs italic text-slate-500">💜 {t.gameDedication}</p>
    </details>
  )
}

function GameBadge() {
  return <span className="rounded bg-fuchsia-600 px-1.5 py-0.5 text-xs font-black text-white">🎮 GAME</span>
}

function Lobby({ onOpen, me }: { onOpen: (id: string) => void; me: { uid: string; name: string } }) {
  const { fb } = useAuth()
  const { t } = useI18n()
  const mine = useMyGames(fb, true)
  const [form, setForm] = useState({ name: `${me.name || 'TaxiQ'} game`, preset: 'standard' as Preset, bots: true })
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (p: Promise<string>) => {
    setBusy(true)
    setError(null)
    p.then(onOpen)
      .catch((e: { code?: string }) => setError(e.code ?? 'error'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-black">TaxiQ Game</h2>
        <GameBadge />
      </div>
      <p className="text-sm text-slate-600">{t.gameIntro}</p>
      <HowToPlay open={mine.length === 0} />
      {error && <p className="text-sm font-semibold text-rose-700">{t.gameErrors[error] ?? t.saveError(error)}</p>}

      <section className="flex flex-col gap-3 rounded-xl bg-gradient-to-br from-fuchsia-600 to-violet-700 p-5 text-white sm:flex-row sm:items-center">
        <div className="flex-1">
          <h3 className="text-xl font-black">🌏 {t.gameWorldName}</h3>
          <p className="text-sm text-fuchsia-50">{t.gameWorldIntro}</p>
        </div>
        <button type="button" disabled={busy || !fb} onClick={() => fb && run(enterWorld(fb, me))} className="min-h-12 rounded-lg bg-white px-5 font-black text-fuchsia-700 hover:bg-fuchsia-50 disabled:opacity-40">
          {t.gameEnterWorld}
        </button>
      </section>
      <h3 className="pt-2 font-bold text-slate-600">{t.gamePrivate}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold">{t.gameCreate}</h3>
          <label className="block">
            <span className="text-sm font-medium">{t.gameName}</span>
            <input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
          </label>
          <div className="space-y-1">
            <span className="text-sm font-medium">{t.gamePreset}</span>
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <label key={p} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${form.preset === p ? 'border-fuchsia-500 bg-fuchsia-50' : 'border-slate-200'}`}>
                <input type="radio" name="preset" checked={form.preset === p} onChange={() => setForm({ ...form, preset: p })} className="accent-fuchsia-600" />
                <span className="flex-1">
                  <span className="font-semibold">{t.gamePresets[p]}</span>
                  <span className="block text-xs text-slate-500">{t.gamePresetInfo(PRESETS[p].maxPlayers, PRESETS[p].cars, PRESETS[p].centers, PRESETS[p].bankCapitalMvr.toLocaleString())}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.bots} onChange={(e) => setForm({ ...form, bots: e.target.checked })} className="size-4 accent-fuchsia-600" />
            {t.gameBots}
          </label>
          <button
            type="button"
            disabled={busy || !form.name.trim() || !fb}
            onClick={() => fb && run(createGame(fb, me, form))}
            className="min-h-11 w-full rounded-lg bg-fuchsia-600 font-bold text-white hover:bg-fuchsia-500 disabled:opacity-40"
          >
            {t.gameCreate}
          </button>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold">{t.gameJoin}</h3>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABC234"
            aria-label={t.gameCode}
            dir="ltr"
            autoCapitalize="characters"
            className="block min-h-12 w-full rounded-lg border border-slate-300 px-3 text-center font-mono text-2xl tracking-[0.3em]"
          />
          <button
            type="button"
            disabled={busy || code.length !== 6 || !fb}
            onClick={() => fb && run(joinByCode(fb, me, code))}
            className="min-h-11 w-full rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 disabled:opacity-40"
          >
            {t.gameJoin}
          </button>
          {mine.length > 0 && (
            <div className="space-y-1 border-t border-slate-100 pt-3">
              <h4 className="text-sm font-semibold text-slate-500">{t.gameMine}</h4>
              {mine.map((g) => (
                <button key={g.id} type="button" onClick={() => onOpen(g.id)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-start text-sm hover:bg-slate-50">
                  <span className="flex-1 truncate font-semibold">{g.name}</span>
                  <span dir="ltr" className="font-mono text-xs text-slate-500">
                    {g.code}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 text-xs">{t.gameStatus[g.status]}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Room({ gameId, onLeave }: { gameId: string; onLeave: () => void }) {
  const { fb, uid, name, role: authRole } = useAuth()
  const { t, lang } = useI18n()
  const { game, players, error } = useGameRoom(fb, gameId)
  const { cars: carDocs, trips } = useGameWorld(fb, gameId)
  const roster = useRoster(fb, gameId)
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const me = players.find((p) => p.uid === uid)
  const isWorld = gameId === WORLD_ID
  const isHost = !!game && game.hostUid === uid
  const engine = useGameEngine(fb, uid, game, players, carDocs, trips, roster, isWorld ? !!me : isHost)

  // Heartbeat while this screen is open, so the world knows this player is here.
  const here = !!me
  useEffect(() => {
    if (!fb || !uid || !here) return
    const send = () => void beat(fb, gameId, uid).catch(() => undefined)
    send()
    const timer = setInterval(send, BEAT_MS)
    return () => clearInterval(timer)
  }, [fb, uid, gameId, here])

  // A holder the map's position feed reads every frame, so new car plans apply without restarting it.
  const carsRef = useRef(carDocs)
  useEffect(() => {
    carsRef.current = carDocs
  })
  const getCars = useCallback(() => carsRef.current, [])
  const preset = game ? PRESETS[game.preset] : null
  const byUid = useMemo(() => new Map(players.map((p) => [p.uid, p])), [players])
  const cars = useMemo<Taxi[]>(
    () =>
      Array.from({ length: preset?.cars ?? 0 }, (_, i) => {
        const n = i + 1
        const player = carDocs.get(n)?.driverUid ? byUid.get(carDocs.get(n)!.driverUid!) : undefined
        const bot = roster?.drivers[i]
        const label = player?.name || (bot ? (lang === 'dv' && bot.d ? bot.d : bot.e) : t.gameBotDriver(n))
        return { id: `car-${n}`, taxiNo: String(n), taxiReg: '', driver: { id: `car-${n}`, name: label, nameDv: label, phone: '' } }
      }),
    [preset?.cars, t, carDocs, byUid, roster, lang],
  )
  // getCars is only called from the map's animation frame, never while rendering.
  // oxlint-disable-next-line react/refs
  const source = useMemo(() => (game ? gamePositionSource(game, getCars) : undefined), [game, getCars])
  const myCar = useMemo(() => {
    for (const [n, c] of carDocs) if (c.driverUid === uid) return n
    return null
  }, [carDocs, uid])
  const highlight = useMemo(() => new Set(myCar !== null ? [`car-${myCar}`] : []), [myCar])

  if (error) return <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>
  if (!game || !preset) return <p className="text-sm text-slate-500">{t.loading}</p>

  const simT = simNow(game, now)
  const clock = game.startedAt && game.status !== 'lobby' ? clockAt(simT) : null
  const myTrip =
    me?.role === 'citizen'
      ? trips.find((x) => x.riderUid === uid && (x.status === 'searching' || x.status === 'assigned'))
      : myCar !== null
        ? trips.find((x) => x.status === 'assigned' && x.carNo === myCar)
        : undefined
  const act = (p: Promise<unknown>) => {
    setActionError(null)
    p.catch((e: { code?: string }) => setActionError(e.code ?? 'error'))
  }
  const share = async () => {
    const text = t.gameShareText(game.name, game.code)
    try {
      if (navigator.share) await navigator.share({ title: 'TaxiQ Game', text })
      else {
        await navigator.clipboard.writeText(game.code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Dismissed.
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
      <div className="space-y-4 lg:self-start">
        <section className="space-y-3 rounded-xl border-2 border-fuchsia-300 bg-white p-4">
          <div className="flex items-center gap-2">
            <GameBadge />
            <h2 className="min-w-0 flex-1 truncate text-lg font-black">{isWorld ? t.gameWorldName : game.name}</h2>
            <button type="button" onClick={onLeave} className="min-h-9 rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100">
              ← {t.gameLobby}
            </button>
          </div>
          {!isWorld && (
            <div className="flex items-center gap-3 rounded-lg bg-fuchsia-50 p-3">
              <div className="flex-1">
                <p className="text-xs font-semibold text-fuchsia-800">{t.gameCode}</p>
                <p dir="ltr" className="font-mono text-3xl font-black tracking-[0.25em]">
                  {game.code}
                </p>
              </div>
              <button type="button" onClick={() => void share()} className="min-h-10 rounded-lg bg-fuchsia-600 px-3 text-sm font-bold text-white">
                {copied ? t.gameCopied : t.gameShare}
              </button>
            </div>
          )}
          <p className="flex items-center justify-between text-sm">
            <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">{isWorld ? t.gameAlwaysOn : t.gameStatus[game.status]}</span>
            {clock && (
              <span dir="ltr" className="font-mono font-bold tabular-nums">
                {t.gameDay(clock.day)} · {String(clock.hh).padStart(2, '0')}:{String(clock.mm).padStart(2, '0')}
              </span>
            )}
          </p>
          {engine && <p className="rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-800">⚙️ {t.gameEngineHere}</p>}
          {isHost && !isWorld && (
            <div className="flex flex-wrap gap-2">
              {game.status === 'lobby' && (
                <button type="button" onClick={() => act(hostControl(fb!, game, 'start'))} className="min-h-10 flex-1 rounded-lg bg-emerald-500 px-3 font-bold text-slate-950">
                  ▶ {t.gameStart}
                </button>
              )}
              {game.status === 'running' && (
                <button type="button" onClick={() => act(hostControl(fb!, game, 'pause'))} className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 font-semibold">
                  ⏸ {t.gamePause}
                </button>
              )}
              {game.status === 'paused' && (
                <button type="button" onClick={() => act(hostControl(fb!, game, 'resume'))} className="min-h-10 flex-1 rounded-lg bg-emerald-500 px-3 font-bold text-slate-950">
                  ▶ {t.gameResume}
                </button>
              )}
              {game.status !== 'ended' && (
                <button type="button" onClick={() => act(hostControl(fb!, game, 'end'))} className="min-h-10 rounded-lg px-3 text-sm text-rose-700 hover:bg-rose-50">
                  {t.gameEnd}
                </button>
              )}
            </div>
          )}
          {me && game.status !== 'ended' && authRole === 'dev' && (
            <div>
              <p className="text-sm font-medium">{t.gameViewAs}</p>
              <div className="mt-1 grid grid-cols-4 gap-1" role="group" aria-label={t.gameViewAs}>
                {GAME_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={me.role === r}
                    onClick={() => me.role !== r && act(setRole(fb!, game.id, uid!, name ?? '', r))}
                    className={`min-h-10 rounded-lg px-1 text-xs font-bold ${me.role === r ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {t.gameRoleIcons[r]} {t.gameRoles[r]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {me && game.status !== 'ended' && authRole !== 'dev' && (
            <label className="block">
              <span className="text-sm font-medium">{t.gameYourRole}</span>
              <select
                value={me.role}
                onChange={(e) => act(setRole(fb!, game.id, uid!, name ?? '', e.target.value as GameRole))}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base"
              >
                {GAME_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t.gameRoles[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {actionError && <p className="text-sm font-semibold text-rose-700">{t.saveError(actionError)}</p>}
        </section>

        {me && game.status !== 'lobby' && game.status !== 'ended' && (
          <PlayPanel fb={fb!} game={game} me={me} players={players} t={simT} nowMs={now} cars={carDocs} trips={trips} roster={roster} myCar={myCar} onError={setActionError} />
        )}
        {game.status === 'lobby' && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{t.gameWaitHost}</p>}

        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-bold">
            {t.gamePlayers} <span className="text-sm font-normal text-slate-500">({players.length})</span>
          </summary>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {players.map((p) => (
              <li key={p.uid} className="flex items-center gap-2 py-1.5">
                <span className={`size-2 rounded-full ${p.beatAt && now - p.beatAt < 90_000 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="min-w-0 flex-1 truncate">
                  {p.name || '—'}
                  {p.uid === game.hostUid && <span className="ms-1 text-xs text-fuchsia-700">({t.gameHost})</span>}
                </span>
                <span className="rounded bg-slate-100 px-1.5 text-xs font-semibold">{t.gameRoles[p.role]}</span>
              </li>
            ))}
          </ul>
          {game.bots && <p className="mt-2 text-xs text-slate-500">{t.gameBotsAlways(roster?.drivers.length ?? preset.cars, roster?.centers.length ?? preset.centers, roster?.citizens.length ?? 0)}</p>}
          {me && !isHost && !isWorld && (
            <button type="button" onClick={() => act(leaveGame(fb!, game.id, uid!).then(onLeave))} className="mt-2 min-h-9 rounded-lg px-2 text-sm text-rose-700 hover:bg-rose-50">
              {t.gameLeave}
            </button>
          )}
        </details>
        <HowToPlay />
      </div>

      <div className="isolate lg:sticky lg:top-4 lg:self-start">
        <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}>
          <MapView
            taxis={cars}
            interested={highlight}
            pickupAt={undefined}
            positionSource={source}
            trip={myTrip ? { from: [myTrip.pLat, myTrip.pLng], to: [myTrip.dLat, myTrip.dLng] } : undefined}
          />
        </Suspense>
      </div>
    </div>
  )
}
