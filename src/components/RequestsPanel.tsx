import { ArrowRight, MapPin, Phone } from 'lucide-react'
import { ic, icFlip } from './iconStyles'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { cancelRide, finishRide } from '../rides'
import { secondsLeft } from '../core/openTrip'
import type { Taxi } from '../types'
import { useNow, useOpenRequests } from '../useRides'

// Staff: passenger requests still being offered, or that no taxi took (handle those by radio).
export function RequestsPanel({ taxis }: { taxis: Taxi[] }) {
  const { fb, email } = useAuth()
  const { t } = useI18n()
  const list = useOpenRequests(fb, true, email)
  const now = useNow(list.some((r) => r.status !== 'expired'))
  const no = (id: string | null) => taxis.find((x) => x.id === id)?.taxiNo ?? '?'

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{t.requests}</h2>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">{t.noRequests}</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {list.map((r) => {
            const left = r.status === 'expired' ? 0 : secondsLeft(r.status === 'interest' ? 'interest' : r.status === 'confirmed' ? 'confirmed' : 'offering', r.offerAt, now)
            return (
              <li key={r.id} className="space-y-1 px-3 py-2 text-sm">
                <p className="font-semibold">
                  <MapPin className={`${ic} text-emerald-600`} aria-hidden="true" /> <bdi>{r.pickup}</bdi>
                  {r.destination && (
                    <span className="font-normal text-slate-500">
                      {' '}
                      <ArrowRight className={`${icFlip} text-slate-400`} aria-hidden="true" /> <bdi>{r.destination}</bdi>
                    </span>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <bdi className="text-slate-600">{r.name}</bdi>
                  <bdi dir="ltr" className="tabular-nums text-slate-500">
                    <Phone className={ic} aria-hidden="true" /> {r.phone}
                  </bdi>
                  {r.status === 'problem' ? (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-800">
                      {t.problemFrom(no(r.acceptedBy))}
                      {r.price !== null ? ` · MVR ${r.price}` : ''}
                    </span>
                  ) : r.status !== 'expired' ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
                      {r.status === 'offering' ? t.offeredTo(no(r.offerTo)) : r.status === 'interest' ? t.taxiOffers(no(r.offerTo)) : t.bookedFinishing} · <span dir="ltr">{t.secondsLeft(left)}</span>
                    </span>
                  ) : (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-800">{t.expiredRequest}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => fb && void (r.status === 'problem' ? finishRide(fb, r.id) : cancelRide(fb, r.id)).catch(() => {})}
                    className="ms-auto min-h-8 rounded-lg px-2 font-medium text-slate-600 hover:bg-slate-100"
                  >
                    {r.status === 'problem' ? t.closeProblem : t.cancelRide}
                  </button>
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
