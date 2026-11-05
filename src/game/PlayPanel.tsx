import { useState } from 'react'
import { PlaceInput } from '../components/PlaceInput'
import { FARES, FARES_ARE_PLACEHOLDER } from '../core/fares'
import { defaultCar, OFFER_GAME_SEC, tripEnd, tripPickupAt, type CarDoc, type TripDoc } from '../core/gameEngine'
import type { Roster } from '../core/gameNames'
import { clockAt, PRESETS, SIM_RATE } from '../core/gameSim'
import { ROAD_GRAPH } from '../positions'
import { useI18n } from '../i18n'
import { answerOffer, cancelRide, requestRide, setOnline, waitAt, type Game, type GamePlayer } from './gameData'

type Fb = typeof import('../firebase')

interface Props {
  fb: Fb
  game: Game
  me: GamePlayer
  players: GamePlayer[]
  t: number // game seconds now
  nowMs: number // real time now (ticks every second)
  cars: ReadonlyMap<number, CarDoc>
  trips: TripDoc[]
  roster: Roster | null
  myCar: number | null
  onError: (code: string) => void
}

const hhmm = (s: number) => {
  const c = clockAt(s)
  return `${String(c.hh).padStart(2, '0')}:${String(c.mm).padStart(2, '0')}`
}
const gameMinutes = (s: number) => Math.max(0, Math.ceil(s / 60))

export function PlayPanel(props: Props) {
  const { me } = props
  return (
    <>
      {me.role === 'driver' && <DriverPanel {...props} />}
      {me.role === 'citizen' && <CitizenPanel {...props} />}
      {me.role === 'operator' && <OperatorPanel {...props} />}
      {me.role === 'owner' && <OwnerPanel {...props} />}
      <Logbook {...props} />
    </>
  )
}

function DriverPanel({ fb, game, me, t, trips, myCar, onError }: Props) {
  const { t: tr } = useI18n()
  const [spot, setSpot] = useState<{ text: string; at?: [number, number] }>({ text: '' })
  const act = (p: Promise<unknown>) => void p.catch((e: { code?: string }) => onError(e.code ?? 'error'))
  const offer = myCar !== null ? trips.find((x) => x.status === 'searching' && x.offerCar === myCar && x.response === null) : undefined
  const job = myCar !== null ? trips.find((x) => x.status === 'assigned' && x.carNo === myCar) : undefined
  const left = offer ? Math.max(0, Math.ceil(((offer.offerT ?? t) + OFFER_GAME_SEC - t) / SIM_RATE)) : 0

  return (
    <section className="space-y-3 rounded-xl border-2 border-emerald-300 bg-white p-4">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-bold">🚕 {myCar !== null ? tr.gameMyCar(myCar) : tr.gameNoCarYet}</h3>
        <button
          type="button"
          onClick={() => act(setOnline(fb, game.id, me.uid, !me.online))}
          aria-pressed={me.online}
          className={`min-h-10 rounded-full px-4 text-sm font-bold ${me.online ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-700'}`}
        >
          {me.online ? tr.gameOnline : tr.gameOffline}
        </button>
      </div>
      {!me.online && <p className="text-sm text-slate-600">{tr.gameGoOnline}</p>}

      {offer && (
        <div className="space-y-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3" role="alert">
          <p className="flex items-center justify-between font-bold">
            {tr.gameNewOffer}
            <span className="rounded-full bg-amber-500 px-2 text-sm text-white tabular-nums">{left}s</span>
          </p>
          <p className="text-sm">
            📍 {offer.pName || '—'} → 🏁 {offer.dName || '—'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => act(answerOffer(fb, game.id, offer.id, 'accept'))} className="min-h-11 flex-1 rounded-lg bg-emerald-500 font-bold text-slate-950">
              ✓ {tr.gameAccept}
            </button>
            <button type="button" onClick={() => act(answerOffer(fb, game.id, offer.id, 'decline'))} className="min-h-11 flex-1 rounded-lg border border-slate-300 font-semibold">
              {tr.gameDecline}
            </button>
          </div>
        </div>
      )}

      {job && (
        <div className="space-y-1 rounded-lg bg-emerald-50 p-3 text-sm">
          <p className="font-bold">{t < tripPickupAt(job) ? tr.gameToPickup(gameMinutes(tripPickupAt(job) - t)) : tr.gameOnBoard(gameMinutes(tripEnd(job) - t))}</p>
          <p>
            📍 {job.pName || '—'} → 🏁 {job.dName || '—'}
          </p>
          <p className="text-slate-600">
            {job.riderName || tr.gameBotRider} · {job.km?.toFixed(1)} km · MVR {job.fare}
          </p>
        </div>
      )}

      {!job && myCar !== null && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <PlaceInput id="game-wait" label={tr.gameWaitAt} hint={tr.gameWaitHint} value={spot.text} onChange={(text, at) => setSpot({ text, at })} />
          <button
            type="button"
            disabled={!spot.at}
            onClick={() => spot.at && act(waitAt(fb, game.id, me.uid, spot.at, t))}
            className="min-h-10 w-full rounded-lg bg-slate-900 text-sm font-bold text-white disabled:opacity-40"
          >
            {tr.gameDriveThere}
          </button>
        </div>
      )}
    </section>
  )
}

function CitizenPanel({ fb, game, me, t, trips, onError }: Props) {
  const { t: tr } = useI18n()
  const [from, setFrom] = useState<{ text: string; at?: [number, number] }>({ text: '' })
  const [to, setTo] = useState<{ text: string; at?: [number, number] }>({ text: '' })
  const [busy, setBusy] = useState(false)
  const mine = trips.filter((x) => x.riderUid === me.uid)
  const active = mine.find((x) => x.status === 'searching' || x.status === 'assigned')
  const last = mine.find((x) => x.status === 'done' || x.status === 'expired')
  const book = () => {
    if (!from.at || !to.at) return
    setBusy(true)
    requestRide(fb, game.id, me, { lat: from.at[0], lng: from.at[1], name: from.text }, { lat: to.at[0], lng: to.at[1], name: to.text }, t)
      .then(() => {
        setFrom({ text: '' })
        setTo({ text: '' })
      })
      .catch((e: { code?: string }) => onError(e.code ?? 'error'))
      .finally(() => setBusy(false))
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-sky-300 bg-white p-4">
      <h3 className="font-bold">🙋 {tr.gameRequestRide}</h3>
      {active ? (
        <div className="space-y-2 rounded-lg bg-sky-50 p-3 text-sm">
          <p>
            📍 {active.pName} → 🏁 {active.dName}
          </p>
          <p className="font-bold">
            {active.status === 'searching'
              ? active.offerCar !== null
                ? tr.gameAsking(active.offerCar)
                : tr.gameSearching
              : t < tripPickupAt(active)
                ? tr.gameCarComing(active.carNo ?? 0, active.driverName ?? '', gameMinutes(tripPickupAt(active) - t))
                : tr.gameRiding(gameMinutes(tripEnd(active) - t))}
          </p>
          {active.fare !== null && <p className="text-slate-600">MVR {active.fare} · {active.km?.toFixed(1)} km</p>}
          {active.status === 'searching' && (
            <button type="button" onClick={() => void cancelRide(fb, game.id, active.id).catch((e: { code?: string }) => onError(e.code ?? 'error'))} className="min-h-9 rounded-lg px-2 text-sm text-rose-700 hover:bg-rose-50">
              {tr.gameCancelRide}
            </button>
          )}
        </div>
      ) : (
        <>
          {last && <p className="rounded-lg bg-slate-50 p-2 text-sm">{last.status === 'done' ? tr.gameArrived(last.dName, last.fare ?? 0) : tr.gameNobody}</p>}
          <PlaceInput id="game-from" label={tr.gamePickup} hint={tr.gamePlaceHint} value={from.text} onChange={(text, at) => setFrom({ text, at })} />
          <PlaceInput id="game-to" label={tr.gameDestination} hint={tr.gamePlaceHint} value={to.text} onChange={(text, at) => setTo({ text, at })} />
          <button type="button" disabled={busy || !from.at || !to.at || game.status !== 'running'} onClick={book} className="min-h-11 w-full rounded-lg bg-sky-600 font-bold text-white disabled:opacity-40">
            {tr.gameBook}
          </button>
        </>
      )}
    </section>
  )
}

// The center operator's board: the live queue (who gets the next ride) and the rides waiting.
function OperatorPanel({ game, players, t, nowMs: now, cars, trips, roster }: Props) {
  const { t: tr, lang } = useI18n()
  const byUid = new Map(players.map((p) => [p.uid, p]))
  const rows = Array.from({ length: PRESETS[game.preset].cars }, (_, i) => {
    const n = i + 1
    const car = cars.get(n) ?? defaultCar(ROAD_GRAPH, game.seed, n)
    const player = car.driverUid ? byUid.get(car.driverUid) : undefined
    const bot = roster?.drivers[i]
    const name = player?.name || (bot ? (lang === 'dv' && bot.d ? bot.d : bot.e) : tr.gameBotDriver(n))
    const active = player ? player.online && player.beatAt !== null && now - player.beatAt < 90_000 : game.bots
    const job = trips.find((x) => x.status === 'assigned' && x.carNo === n)
    const offer = trips.find((x) => x.status === 'searching' && x.offerCar === n)
    return { n, car, name, isPlayer: !!player, active, job, offer }
  })
  const queue = rows.filter((r) => r.active && !r.job).sort((a, b) => a.car.queuedAt - b.car.queuedAt || a.n - b.n)
  const onJob = rows.filter((r) => r.job)
  const off = rows.filter((r) => !r.active && !r.job)
  const waiting = trips.filter((x) => x.status === 'searching')
  return (
    <section className="space-y-3 rounded-xl border-2 border-amber-300 bg-white p-4">
      <h3 className="font-bold">📻 {tr.gameQueueBoard}</h3>
      <div>
        <h4 className="text-sm font-semibold text-slate-500">{tr.gameRidesWaiting(waiting.length)}</h4>
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-500">{tr.gameNoRidesWaiting}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {waiting.map((x) => (
              <li key={x.id} className="py-1.5">
                <span className="block truncate">
                  📍 {x.pName || '—'} → 🏁 {x.dName || '—'}
                </span>
                <span className="text-xs text-slate-500">
                  {x.riderName || tr.gameBotRider} · {x.offerCar !== null ? tr.gameAsking(x.offerCar) : tr.gameSearching}
                  {x.declined.length > 0 && ` · ${tr.gameDeclinedBy(x.declined.length)}`} · {gameMinutesAgo(t - x.createdT)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-500">{tr.gameQueueNow(queue.length)}</h4>
        <ol className="divide-y divide-slate-100 text-sm">
          {queue.map((r, i) => (
            <li key={r.n} className={`flex items-center gap-2 py-1.5 ${r.offer ? 'bg-amber-50' : ''}`}>
              <span className="w-6 text-end font-bold tabular-nums text-slate-400">{i + 1}</span>
              <span className="w-10 font-mono font-bold">#{r.n}</span>
              <span className="min-w-0 flex-1 truncate">
                {r.name}
                {r.isPlayer && <span className="ms-1 text-xs text-fuchsia-700">★</span>}
              </span>
              <span className="text-xs text-slate-500">{r.offer ? tr.gameCarOffered : tr.gameCarWaiting}</span>
            </li>
          ))}
        </ol>
      </div>
      {onJob.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-500">{tr.gameOnJobs(onJob.length)}</h4>
          <ul className="divide-y divide-slate-100 text-sm">
            {onJob.map((r) => (
              <li key={r.n} className="flex items-center gap-2 py-1.5">
                <span className="w-10 font-mono font-bold">#{r.n}</span>
                <span className="min-w-0 flex-1 truncate">{r.job!.dName || '—'}</span>
                <span className="text-xs text-slate-500">{t < tripPickupAt(r.job!) ? tr.gamePhasePickup : tr.gamePhaseOnBoard}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {off.length > 0 && <p className="text-xs text-slate-500">{tr.gameOfflineCars(off.map((r) => `#${r.n}`).join(', '))}</p>}
      <p className="text-xs text-slate-500">{tr.gameOperatorNext}</p>
    </section>
  )
}
const gameMinutesAgo = (s: number) => `${Math.max(0, Math.floor(s / 60))}′`

function OwnerPanel({ trips, roster }: Props) {
  const { t: tr, lang } = useI18n()
  const centers = roster?.centers ?? []
  const done = trips.filter((x) => x.status === 'done' && x.carNo !== null)
  return (
    <section className="space-y-2 rounded-xl border-2 border-violet-300 bg-white p-4">
      <h3 className="font-bold">🏢 {tr.gameCenters}</h3>
      <ul className="divide-y divide-slate-100 text-sm">
        {centers.map((c, i) => {
          const mine = done.filter((x) => (x.carNo! - 1) % centers.length === i)
          return (
            <li key={c.name.e} className="py-2">
              <p className="font-semibold">{lang === 'dv' && c.name.d ? c.name.d : c.name.e}</p>
              <p className="text-xs text-slate-500">
                {tr.gameOwner}: {lang === 'dv' && c.owner.d ? c.owner.d : c.owner.e}
              </p>
              <p className="text-slate-700">{tr.gameCenterStats(mine.length, mine.reduce((s, x) => s + (x.fare ?? 0), 0))}</p>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-slate-500">{tr.gameOwnerNext}</p>
    </section>
  )
}

function Logbook({ me, trips, myCar }: Props) {
  const { t: tr } = useI18n()
  const rows = trips.filter((x) => x.status === 'done' && (me.role === 'driver' ? myCar !== null && x.carNo === myCar : me.role === 'citizen' ? x.riderUid === me.uid : true))  // operators and owners see every trip
  const total = rows.reduce((s, x) => s + (x.fare ?? 0), 0)
  const km = rows.reduce((s, x) => s + (x.km ?? 0), 0)
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-bold">📒 {me.role === 'driver' ? tr.gameLogbook : me.role === 'citizen' ? tr.gameMyRides : tr.gameAllTrips}</h3>
      <p className="grid grid-cols-3 gap-2 text-center">
        <span className="rounded-lg bg-slate-50 p-2">
          <span className="block text-lg font-black tabular-nums">{rows.length}</span>
          <span className="text-xs text-slate-500">{tr.gameTrips}</span>
        </span>
        <span className="rounded-lg bg-slate-50 p-2">
          <span className="block text-lg font-black tabular-nums">{km.toFixed(1)}</span>
          <span className="text-xs text-slate-500">km</span>
        </span>
        <span className="rounded-lg bg-emerald-50 p-2">
          <span className="block text-lg font-black tabular-nums">{total.toLocaleString()}</span>
          <span className="text-xs text-slate-500">{me.role === 'citizen' ? tr.gamePaid : tr.gameEarned}</span>
        </span>
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{tr.gameLogEmpty}</p>
      ) : (
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
          {rows.slice(0, 50).map((x) => (
            <li key={x.id} className="flex items-center gap-2 py-1.5">
              <span dir="ltr" className="w-24 shrink-0 font-mono text-xs text-slate-500">
                {tr.gameDayShort(clockAt(x.doneT ?? 0).day)} {hhmm(x.doneT ?? 0)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {x.pName || '—'} → {x.dName || '—'}
                {me.role === 'owner' && <span className="text-xs text-slate-500"> · #{x.carNo}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{x.fare}</span>
            </li>
          ))}
        </ul>
      )}
      {FARES_ARE_PLACEHOLDER && <p className="text-xs text-amber-700">{tr.gameFarePlaceholder(FARES.base, FARES.perKm, FARES.minimum, FARES.night)}</p>}
    </section>
  )
}
