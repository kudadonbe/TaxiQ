import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { gameClock, PRESETS, type Preset } from '../core/gameSim'
import { useI18n } from '../i18n'
import type { Taxi } from '../types'
import { createGame, hostControl, joinByCode, leaveGame, setRole, useGameRoom, useMyGames, type GameRole } from './gameData'
import { gamePositionSource } from './gamePositions'

const MapView = lazy(() => import('../components/MapView'))
const EMPTY = new Set<string>()
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
  const { fb, uid, name } = useAuth()
  const { t } = useI18n()
  const { game, players, error } = useGameRoom(fb, gameId)
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const preset = game ? PRESETS[game.preset] : null
  const cars = useMemo<Taxi[]>(
    () =>
      Array.from({ length: preset?.cars ?? 0 }, (_, i) => ({
        id: `car-${i + 1}`,
        taxiNo: String(i + 1),
        taxiReg: '',
        driver: { id: `car-${i + 1}`, name: t.gameBotDriver(i + 1), nameDv: t.gameBotDriver(i + 1), phone: '' },
      })),
    [preset?.cars, t],
  )
  const source = useMemo(() => (game ? gamePositionSource(game) : undefined), [game])

  if (error) return <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>
  if (!game || !preset) return <p className="text-sm text-slate-500">{t.loading}</p>

  const me = players.find((p) => p.uid === uid)
  const isHost = game.hostUid === uid
  const clock = game.startedAt ? gameClock(game.startedAt, game.status === 'paused' && game.pausedAt ? game.pausedAt : now, game.pausedMs) : null
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
  const counts = { citizen: 0, driver: 0, owner: 0 }
  for (const p of players) counts[p.role]++

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-4 lg:self-start">
        <section className="space-y-3 rounded-xl border-2 border-fuchsia-300 bg-white p-4">
          <div className="flex items-center gap-2">
            <GameBadge />
            <h2 className="min-w-0 flex-1 truncate text-lg font-black">{game.name}</h2>
            <button type="button" onClick={onLeave} className="min-h-9 rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100">
              ← {t.gameLobby}
            </button>
          </div>
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
          <p className="flex items-center justify-between text-sm">
            <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">{t.gameStatus[game.status]}</span>
            {clock && (
              <span dir="ltr" className="font-mono font-bold tabular-nums">
                {t.gameDay(clock.day)} · {String(clock.hh).padStart(2, '0')}:{String(clock.mm).padStart(2, '0')}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">{t.gamePresetInfo(preset.maxPlayers, preset.cars, preset.centers, preset.bankCapitalMvr.toLocaleString())}</p>
          {isHost && (
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
          {actionError && <p className="text-sm font-semibold text-rose-700">{t.saveError(actionError)}</p>}
        </section>

        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold">
            {t.gamePlayers} <span className="text-sm font-normal text-slate-500">({players.length}/{preset.maxPlayers})</span>
          </h3>
          {me && game.status !== 'ended' && (
            <label className="block">
              <span className="text-sm font-medium">{t.gameYourRole}</span>
              <select
                value={me.role}
                onChange={(e) => act(setRole(fb!, game.id, uid!, name ?? '', e.target.value as GameRole))}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base"
              >
                {(['citizen', 'driver', 'owner'] as const).map((r) => (
                  <option key={r} value={r}>
                    {t.gameRoles[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ul className="divide-y divide-slate-100 text-sm">
            {players.map((p) => (
              <li key={p.uid} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">
                  {p.name || '—'}
                  {p.uid === game.hostUid && <span className="ms-1 text-xs text-fuchsia-700">({t.gameHost})</span>}
                </span>
                <span className="rounded bg-slate-100 px-1.5 text-xs font-semibold">{t.gameRoles[p.role]}</span>
              </li>
            ))}
          </ul>
          {game.bots && <p className="text-xs text-slate-500">{t.gameBotsFill(counts.citizen, counts.driver, counts.owner)}</p>}
          {me && !isHost && (
            <button type="button" onClick={() => act(leaveGame(fb!, game.id, uid!).then(onLeave))} className="min-h-9 rounded-lg px-2 text-sm text-rose-700 hover:bg-rose-50">
              {t.gameLeave}
            </button>
          )}
        </section>
        <p className="rounded-lg bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-900">{t.gameNext}</p>
        <HowToPlay />
      </div>

      <div className="isolate">
        <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}>
          <MapView taxis={cars} interested={EMPTY} pickupAt={undefined} positionSource={source} />
        </Suspense>
      </div>
    </div>
  )
}
