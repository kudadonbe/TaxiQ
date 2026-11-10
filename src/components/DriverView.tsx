import { ArrowRight, MapPin, Phone } from 'lucide-react'
import { ic, icFlip } from './iconStyles'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { acceptRide, arrivedRide, moveOn, offerRide, pickedUpRide, type PublicTaxi } from '../rides'
import { CONFIRM_FINISH_MINUTES } from '../core/taxiFare'
import { firstName, secondsLeft } from '../core/openTrip'
import { announce } from '../announce'
import { useAvailableVehicle } from '../availability'
import { queueRef } from '../centers'
import { useDriverRides, useNow } from '../useRides'

// Driver screen: their taxi, its place in the queue, ride offers (accept/decline) and accepted rides.
export function DriverView({ taxis }: { taxis: PublicTaxi[] }) {
  const { fb, taxiId, email, role } = useAuth()
  const { lang, t } = useI18n()
  const { offers, accepted } = useDriverRides(fb, taxiId, email)
  // A voice message for each new trip (the driver may be driving).
  const heard = useRef(new Set<string>())
  useEffect(() => {
    for (const r of offers) {
      const key = `${r.id}:${r.createdAt}:${r.offerTo}:${r.status}`
      if (heard.current.has(key)) continue
      heard.current.add(key)
      const who = firstName(r.name)
      if (r.status === 'offering') announce('tripNew', lang, { en: t.voiceTrip(who), dv: t.voiceTripDv(who) })
      if (r.status === 'confirmed') announce('tripBooked', lang, { en: t.voiceBookedEn, dv: t.voiceBookedDv })
    }
  }, [offers, lang, t])
  const now = useNow(offers.length > 0 || accepted.some((r) => r.status === 'arrived'))
  const [order, setOrder] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The driver's own center's queue (their place in it).
  const myCenter = taxis.find((x) => x.id === taxiId)?.centerId ?? 'main'
  useEffect(() => {
    if (!fb || !taxiId) return
    return fb.onSnapshot(
      queueRef(fb, myCenter),
      (snap) => setOrder(Array.isArray(snap.data()?.order) ? snap.data()!.order : []),
      () => setOrder([]),
    )
  }, [fb, taxiId, myCenter])

  const me = taxis.find((x) => x.id === taxiId)
  // The same vehicle out on private hire: no taxi offers until private hire is switched off.
  const { availableId } = useAvailableVehicle()
  const onPrivate = !!me?.vehicleId && availableId === me.vehicleId
  // Dev: act as the driver of any taxi (stored as taxiId on the dev's own roles entry).
  const actAs = (id: string) => {
    if (!fb || !email) return
    fb.setDoc(fb.doc(fb.db, 'roles', email), { taxiId: id }, { merge: true }).catch((e: { code?: string }) => setError(e.code ?? 'error'))
  }
  const devPicker = role === 'dev' && (
    <label className="flex items-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50 p-3 text-sm text-violet-900">
      <span className="font-semibold">{t.actAs}</span>
      <select value={taxiId ?? ''} onChange={(e) => actAs(e.target.value)} className="min-h-10 flex-1 rounded-lg border border-violet-300 bg-white px-2 text-base">
        <option value="" disabled>
          {t.taxiForDriver}
        </option>
        {taxis.map((x) => (
          <option key={x.id} value={x.id}>
            {x.taxiNo} · {lang === 'dv' && x.nameDv ? x.nameDv : x.name}
          </option>
        ))}
      </select>
    </label>
  )
  if (!taxiId)
    return (
      <div className="space-y-3">
        {devPicker}
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">{t.driverNoTaxi}</p>
      </div>
    )

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
      {devPicker}
      <section className={`rounded-xl p-4 ${me?.suspended ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
        <p className="text-4xl font-black tabular-nums">{t.driverTitle(me?.taxiNo ?? '?')}</p>
        <p className="mt-1 text-sm opacity-80">{me ? (lang === 'dv' && me.nameDv ? me.nameDv : me.name) : ''}</p>
        <p className="mt-2 font-semibold">{me?.suspended ? t.suspended : position > 0 ? t.queuePosition(position) : ''}</p>
      </section>

      {onPrivate && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 font-semibold text-amber-900">{t.driverOnPrivate}</p>}
      {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}

      <section className="space-y-2" aria-live="assertive">
        {offers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t.noOffers}</p>
        ) : (
          offers.map((r) => {
            const open = r.mode === 'queue'
            const left = secondsLeft(r.status === 'interest' ? 'interest' : r.status === 'confirmed' ? 'confirmed' : 'offering', r.offerAt, now)
            const who = firstName(r.name)
            return (
              <div key={r.id} className="space-y-2 rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-black text-emerald-800">{r.status === 'offering' ? t.askingForRide(who) : r.status === 'interest' ? t.waitingPassenger(who) : t.bookedFinishing}</span>
                  {r.status !== 'confirmed' && (
                    <span className="shrink-0 font-black tabular-nums text-emerald-700" dir="ltr">
                      {t.secondsLeft(left)}
                    </span>
                  )}
                </div>
                <p className="text-lg font-bold">
                  <MapPin className={`${ic} text-emerald-600`} aria-hidden="true" /> <bdi>{r.pickup}</bdi>
                </p>
                {r.destination && (
                  <p className="text-slate-600">
                    <ArrowRight className={`${icFlip} text-slate-400`} aria-hidden="true" /> <bdi>{r.destination}</bdi>
                  </p>
                )}
                {r.note && <bdi className="block text-sm text-slate-500">{r.note}</bdi>}
                {r.price !== null && <p className="text-xl font-black">{t.tripTotal(r.price)}</p>}
                {r.status === 'offering' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => fb && taxiId && act(r.id, () => (open ? offerRide(fb, r.id) : acceptRide(fb, r.id, taxiId, email ?? '')))}
                      className="min-h-12 rounded-xl bg-emerald-500 font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
                    >
                      {open ? t.offerToTake : t.accept}
                    </button>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => fb && act(r.id, () => moveOn(fb, r.id))}
                      className="min-h-12 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      {open ? t.pass : t.decline}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </section>

      {/* The trip in progress: call, Picked up, then Arrived; the passenger confirms it finished. */}
      {accepted
        .filter((r) => r.status === 'accepted' || r.status === 'onboard' || r.status === 'arrived')
        .map((r) => (
          <section key={r.id} className="space-y-2 rounded-xl border-2 border-slate-900 bg-white p-4 shadow-lg" aria-live="polite">
            <p className="text-lg font-black">{r.status === 'accepted' ? t.goToPickup(firstName(r.name)) : r.status === 'onboard' ? t.drivingTo : t.waitingFinish(firstName(r.name))}</p>
            <p className="font-bold">
              <MapPin className={`${ic} text-emerald-600`} aria-hidden="true" /> <bdi>{r.pickup}</bdi>
            </p>
            {r.destination && (
              <p className="text-slate-600">
                <ArrowRight className={`${icFlip} text-slate-400`} aria-hidden="true" /> <bdi>{r.destination}</bdi>
              </p>
            )}
            {r.price !== null && <p className="text-xl font-black">{t.tripTotal(r.price)}</p>}
            <div className="flex flex-wrap gap-2">
              {r.status !== 'arrived' && (
                <a href={`tel:${r.phone}`} dir="ltr" className="inline-flex min-h-12 items-center gap-1 rounded-xl bg-slate-900 px-4 font-semibold text-white">
                  <Phone className="size-4" aria-hidden="true" /> {t.callPassenger}
                </a>
              )}
              {r.status === 'accepted' && (
                <button type="button" disabled={busy === r.id} onClick={() => fb && act(r.id, () => pickedUpRide(fb, r.id))} className="min-h-12 flex-1 rounded-xl bg-emerald-500 font-bold text-slate-950 disabled:opacity-40">
                  {t.incPickedUp}
                </button>
              )}
              {r.status === 'onboard' && (
                <button type="button" disabled={busy === r.id} onClick={() => fb && act(r.id, () => arrivedRide(fb, r.id))} className="min-h-12 flex-1 rounded-xl bg-emerald-500 font-bold text-slate-950 disabled:opacity-40">
                  {t.arrivedBtn}
                </button>
              )}
              {r.status === 'arrived' && (
                <p className="text-sm text-slate-600">{t.autoFinish(Math.max(0, Math.ceil((r.arrivedAt + CONFIRM_FINISH_MINUTES * 60_000 - now) / 60_000)))}</p>
              )}
            </div>
          </section>
        ))}

      {accepted.some((r) => r.status === 'done') && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-slate-500">{t.myRides}</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {accepted
              .filter((r) => r.status === 'done')
              .slice(0, 5)
              .map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      <MapPin className={`${ic} text-emerald-600`} aria-hidden="true" /> <bdi>{r.pickup}</bdi>
                    </span>
                    {r.destination && (
                      <span className="block truncate text-slate-500">
                        <ArrowRight className={`${icFlip} text-slate-400`} aria-hidden="true" /> <bdi>{r.destination}</bdi>
                      </span>
                    )}
                  </span>
                  {r.price !== null && <span className="shrink-0 font-bold tabular-nums">MVR {r.price}</span>}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}
