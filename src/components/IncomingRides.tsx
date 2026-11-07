import { Check, Phone, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { acceptPrivate, ANSWER_SECONDS, arrivedPrivate, confirmPrivateDone, declinePrivate, finishPrivate, movePrivateOn, offerPrivate, pickedUp, useIncomingPrivateRides, type PrivateRide } from '../privateRides'
import { CONFIRM_FINISH_MINUTES, finishDue } from '../core/taxiFare'
import { useMyVehicles, usePublicVehicles } from '../vehicles'
import { firstName as first, privateQueue, secondsLeft } from '../core/openTrip'
import { announce } from '../announce'
import { TripLine } from './icons'

// For vehicle owners, on every screen: a booking for their vehicle. New: Accept / Decline within a
// minute. Accepted: call the passenger, Picked up, then Trip done.
export function IncomingRides() {
  const { fb, uid, name } = useAuth()
  const { lang, t } = useI18n()
  const rides = useIncomingPrivateRides(fb, uid)
  const mine = useMyVehicles(fb, rides.length ? uid : null)
  const onMap = usePublicVehicles(fb, rides.some((r) => r.mode === 'queue'))
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!rides.length) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [rides.length])
  const fresh = rides.filter((r) =>
    r.mode === 'queue' ? r.status !== 'offering' || secondsLeft('offering', r.offerAt, now) > 0 : r.status !== 'offering' || now - r.createdAt < ANSWER_SECONDS * 1000,
  )
  const firstName = (name ?? '').split(' ')[0] ?? ''
  const phoneFor = (r: PrivateRide) => mine.find((v) => v.id === r.vehicleId)?.phone ?? ''
  // A voice message for each new trip (the owner may be driving).
  const heard = useRef(new Set<string>())
  const finishing = useRef(new Set<string>())
  useEffect(() => {
    for (const r of rides) {
      const key = `${r.uid}:${r.createdAt}:${r.vehicleId}`
      if ((r.status === 'offering' || r.status === 'confirmed') && !heard.current.has(`${key}:${r.status}`)) {
        heard.current.add(`${key}:${r.status}`)
        const who = first(r.name)
        if (r.status === 'offering') announce('tripNew', lang, { en: t.voiceTrip(who), dv: t.voiceTripDv(who) })
        else announce('tripBooked', lang, { en: t.voiceBookedEn, dv: t.voiceBookedDv })
      }
      // Booked by the passenger: complete it (share first name and phone; back of the queue).
      if (fb && r.status === 'confirmed' && phoneFor(r) && !finishing.current.has(`${key}:${r.offerAt}`)) {
        finishing.current.add(`${key}:${r.offerAt}`)
        finishPrivate(fb, r, firstName, phoneFor(r)).catch(() => {})
      }
    }
    // phoneFor and firstName come from `mine` and `name`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [rides, lang, t, fb, mine, name])
  if (!fb || !fresh.length) return null
  const act = (p: Promise<unknown>) => {
    setError(null)
    p.catch((e: { code?: string }) => setError(e.code ?? 'error'))
  }
  const queue = (r: PrivateRide) => privateQueue(onMap, r.uid, r.skipped)
  return (
    <div className="pointer-events-none fixed inset-x-2 top-28 z-[1300] mx-auto max-w-md space-y-2 sm:top-32">
      {fresh.map((r) => (
        <section key={r.uid} className="pointer-events-auto space-y-2 rounded-2xl border border-white/60 bg-white/80 p-3 shadow-2xl backdrop-blur-md" role="alert">
          <p className="flex items-center justify-between gap-2 font-black">
            <span>
              {r.status === 'offering'
                ? r.mode === 'queue'
                  ? t.askingForRide(first(r.name))
                  : t.incNew
                : r.status === 'interest'
                  ? t.waitingPassenger(first(r.name))
                  : r.status === 'confirmed'
                    ? t.bookedFinishing
                    : r.status === 'accepted'
                      ? t.incGoPickup(r.name)
                      : r.status === 'arrived'
                        ? t.waitingFinish(first(r.name))
                        : t.incOnboard(r.name)}
            </span>
            {(r.status === 'offering' || r.status === 'interest') && (
              <span className="rounded-full bg-amber-500 px-2 text-sm text-white tabular-nums">
                {r.mode === 'queue' ? secondsLeft(r.status, r.offerAt, now) : Math.max(0, ANSWER_SECONDS - Math.floor((now - r.createdAt) / 1000))}s
              </span>
            )}
          </p>
          <p className="text-sm">
            <TripLine from={r.pickup} to={r.destination} />
          </p>
          <p className="text-base font-black">
            {t.tripTotal(r.price)}
            {r.note ? ` · ${r.note}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {r.status === 'offering' && r.mode === 'queue' && (
              <>
                <button type="button" onClick={() => act(offerPrivate(fb, r))} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-500 font-bold text-slate-950">
                  <Check className="size-4" aria-hidden="true" /> {t.offerToTake}
                </button>
                <button type="button" onClick={() => act(movePrivateOn(fb, r, queue(r)))} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white/70 font-semibold">
                  <X className="size-4" aria-hidden="true" /> {t.pass}
                </button>
              </>
            )}
            {r.status === 'offering' && r.mode !== 'queue' && (
              <>
                <button type="button" disabled={!phoneFor(r)} onClick={() => act(acceptPrivate(fb, r, firstName, phoneFor(r)))} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-500 font-bold text-slate-950 disabled:opacity-40">
                  <Check className="size-4" aria-hidden="true" /> {t.incAccept}
                </button>
                <button type="button" onClick={() => act(declinePrivate(fb, r))} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white/70 font-semibold">
                  <X className="size-4" aria-hidden="true" /> {t.incDecline}
                </button>
              </>
            )}
            {(r.status === 'accepted' || r.status === 'onboard') && (
              <a href={`tel:${r.phone}`} dir="ltr" className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-slate-900 px-3 font-semibold text-white">
                <Phone className="size-4" aria-hidden="true" /> {t.privCall(r.name.split(' ')[0] ?? '')}
              </a>
            )}
            {r.status === 'accepted' && (
              <button type="button" onClick={() => act(pickedUp(fb, r))} className="min-h-11 flex-1 rounded-xl bg-emerald-500 font-bold text-slate-950">
                {t.incPickedUp}
              </button>
            )}
            {r.status === 'onboard' && (
              <button type="button" onClick={() => act(arrivedPrivate(fb, r))} className="min-h-11 flex-1 rounded-xl bg-emerald-500 font-bold text-slate-950">
                {t.arrivedBtn}
              </button>
            )}
            {r.status === 'arrived' && (
              <p className="w-full text-xs text-slate-600">
                {finishDue(r.arrivedAt, now) ? (
                  <button type="button" onClick={() => act(confirmPrivateDone(fb, r.uid))} className="min-h-11 w-full rounded-xl bg-slate-900 font-semibold text-white">
                    {t.markFinished}
                  </button>
                ) : (
                  t.autoFinish(Math.max(0, Math.ceil((r.arrivedAt + CONFIRM_FINISH_MINUTES * 60_000 - now) / 60_000)))
                )}
              </p>
            )}
          </div>
          {error && <p className="text-sm font-semibold text-rose-700">{t.requestFailed(error)}</p>}
        </section>
      ))}
    </div>
  )
}
