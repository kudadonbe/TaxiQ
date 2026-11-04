import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { acceptRide, moveOn, OFFER_SECONDS, type PublicTaxi } from '../rides'
import { useDriverRides, useNow } from '../useRides'

// Driver screen: their taxi, its place in the queue, ride offers (accept/decline) and accepted rides.
export function DriverView({ taxis }: { taxis: PublicTaxi[] }) {
  const { fb, taxiId, email } = useAuth()
  const { lang, t } = useI18n()
  const { offers, accepted } = useDriverRides(fb, taxiId)
  const now = useNow(offers.length > 0)
  const [order, setOrder] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fb || !taxiId) return
    return fb.onSnapshot(
      fb.doc(fb.db, 'queue', 'state'),
      (snap) => setOrder(Array.isArray(snap.data()?.order) ? snap.data()!.order : []),
      () => setOrder([]),
    )
  }, [fb, taxiId])

  const me = taxis.find((x) => x.id === taxiId)
  if (!taxiId) return <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">{t.driverNoTaxi}</p>

  const position = order.indexOf(taxiId) + 1
  const act = (id: string, fn: () => Promise<unknown>) => {
    setBusy(id)
    setError(null)
    fn()
      .catch((e: { code?: string; message?: string }) => setError(e.code ?? e.message ?? 'error'))
      .finally(() => setBusy(null))
  }

  return (
    <div className="space-y-4">
      <section className={`rounded-xl p-4 ${me?.suspended ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
        <p className="text-4xl font-black tabular-nums">{t.driverTitle(me?.taxiNo ?? '?')}</p>
        <p className="mt-1 text-sm opacity-80">{me ? (lang === 'dv' && me.nameDv ? me.nameDv : me.name) : ''}</p>
        <p className="mt-2 font-semibold">{me?.suspended ? t.suspended : position > 0 ? t.queuePosition(position) : ''}</p>
      </section>

      {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}

      <section className="space-y-2" aria-live="assertive">
        {offers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t.noOffers}</p>
        ) : (
          offers.map((r) => {
            const left = Math.max(0, Math.ceil((r.offerAt + OFFER_SECONDS * 1000 - now) / 1000))
            return (
              <div key={r.id} className="space-y-2 rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">{t.offerFor}</span>
                  <span className="font-black tabular-nums text-emerald-700" dir="ltr">
                    {t.secondsLeft(left)}
                  </span>
                </div>
                <p className="text-lg font-bold">
                  📍 <bdi>{r.pickup}</bdi>
                </p>
                {r.destination && (
                  <p className="text-slate-600">
                    → <bdi>{r.destination}</bdi>
                  </p>
                )}
                {r.note && <bdi className="block text-sm text-slate-500">{r.note}</bdi>}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => fb && taxiId && act(r.id, () => acceptRide(fb, r.id, taxiId, email ?? ''))}
                    className="min-h-12 rounded-xl bg-emerald-500 font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {t.accept}
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => fb && act(r.id, () => moveOn(fb, r.id))}
                    className="min-h-12 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {t.decline}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </section>

      {accepted.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-slate-500">{t.myRides}</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {accepted.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    📍 <bdi>{r.pickup}</bdi>
                  </span>
                  {r.destination && (
                    <span className="block truncate text-slate-500">
                      → <bdi>{r.destination}</bdi>
                    </span>
                  )}
                </span>
                <a href={`tel:${r.phone}`} dir="ltr" className="min-h-10 shrink-0 rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white">
                  ☎ {t.callPassenger}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
