import { Check, Phone, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { acceptPrivate, ANSWER_SECONDS, declinePrivate, pickedUp, tripDone, useIncomingPrivateRides, type PrivateRide } from '../privateRides'
import { useMyVehicles } from '../vehicles'
import { TripLine } from './icons'

// For vehicle owners, on every screen: a booking for their vehicle. New: Accept / Decline within a
// minute. Accepted: call the passenger, Picked up, then Trip done.
export function IncomingRides() {
  const { fb, uid, name } = useAuth()
  const { t } = useI18n()
  const rides = useIncomingPrivateRides(fb, uid)
  const mine = useMyVehicles(fb, rides.length ? uid : null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!rides.length) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [rides.length])
  const fresh = rides.filter((r) => r.status !== 'offering' || now - r.createdAt < ANSWER_SECONDS * 1000)
  if (!fb || !fresh.length) return null
  const act = (p: Promise<unknown>) => {
    setError(null)
    p.catch((e: { code?: string }) => setError(e.code ?? 'error'))
  }
  const firstName = (name ?? '').split(' ')[0] ?? ''
  const phoneFor = (r: PrivateRide) => mine.find((v) => v.id === r.vehicleId)?.phone ?? ''
  return (
    <div className="pointer-events-none fixed inset-x-2 top-28 z-[1300] mx-auto max-w-md space-y-2 sm:top-32">
      {fresh.map((r) => (
        <section key={r.uid} className="pointer-events-auto space-y-2 rounded-2xl border border-white/60 bg-white/80 p-3 shadow-2xl backdrop-blur-md" role="alert">
          <p className="flex items-center justify-between gap-2 font-black">
            <span>{r.status === 'offering' ? t.incNew : r.status === 'accepted' ? t.incGoPickup(r.name) : t.incOnboard(r.name)}</span>
            {r.status === 'offering' && <span className="rounded-full bg-amber-500 px-2 text-sm text-white tabular-nums">{Math.max(0, ANSWER_SECONDS - Math.floor((now - r.createdAt) / 1000))}s</span>}
          </p>
          <p className="text-sm">
            <TripLine from={r.pickup} to={r.destination} />
          </p>
          <p className="text-sm font-semibold">
            {t.privPrice(r.price)}
            {r.note ? ` · ${r.note}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {r.status === 'offering' && (
              <>
                <button type="button" disabled={!phoneFor(r)} onClick={() => act(acceptPrivate(fb, r, firstName, phoneFor(r)))} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-500 font-bold text-slate-950 disabled:opacity-40">
                  <Check className="size-4" aria-hidden="true" /> {t.incAccept}
                </button>
                <button type="button" onClick={() => act(declinePrivate(fb, r))} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white/70 font-semibold">
                  <X className="size-4" aria-hidden="true" /> {t.incDecline}
                </button>
              </>
            )}
            {r.status !== 'offering' && (
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
              <button type="button" onClick={() => act(tripDone(fb, r))} className="min-h-11 flex-1 rounded-xl bg-emerald-500 font-bold text-slate-950">
                {t.incDone}
              </button>
            )}
          </div>
          {error && <p className="text-sm font-semibold text-rose-700">{t.requestFailed(error)}</p>}
        </section>
      ))}
    </div>
  )
}
