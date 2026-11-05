import { OFFER_SECONDS } from '../core/offers'
import { useNow } from '../useRides'
import { useAction, usePoll, type Me } from './api'
import { useV3Strings } from './strings'
import { Btn, Card, ErrorLine } from './ui'

interface Offer {
  id: string
  centerId: string
  pickup: string
  destination: string
  note: string
  phone: string
  offerAt: string
  taxiNo: string
}

// Driver: offers for this membership (one center), accept or decline.
export function DriverScreen({ membership }: { membership: Me['memberships'][number] }) {
  const s = useV3Strings()
  const offers = usePoll<{ offers: Offer[] }>('/v1/me/offers', 2000)
  const act = useAction(offers.reload)
  const mine = (offers.data?.offers ?? []).filter((o) => o.centerId === membership.centerId)
  const now = useNow(mine.length > 0)

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className={`rounded-xl p-4 text-white ${membership.suspended ? 'bg-rose-600' : 'bg-slate-900'}`}>
        <p className="text-4xl font-black tabular-nums">{membership.taxiNo}</p>
        <p className="mt-1 text-sm opacity-80">{membership.centerName}</p>
      </section>
      <ErrorLine code={act.error ?? offers.error} />
      <Card title={s.offers}>
        {mine.length === 0 ? (
          <p className="text-sm text-slate-500">{s.noOffers}</p>
        ) : (
          mine.map((o) => {
            const left = Math.max(0, Math.ceil((new Date(o.offerAt).getTime() + OFFER_SECONDS * 1000 - now) / 1000))
            return (
              <div key={o.id} className="space-y-2 rounded-xl border-2 border-emerald-500 p-3" aria-live="assertive">
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold">
                    📍 <bdi>{o.pickup}</bdi>
                  </p>
                  <span className="font-black tabular-nums text-emerald-700" dir="ltr">
                    {s.secondsLeft(left)}
                  </span>
                </div>
                {o.destination && (
                  <p className="text-slate-600">
                    → <bdi>{o.destination}</bdi>
                  </p>
                )}
                {o.note && <bdi className="block text-sm text-slate-500">{o.note}</bdi>}
                <div className="grid grid-cols-3 gap-2">
                  <Btn tone="primary" className="min-h-12" disabled={act.busy} onClick={() => void act.run('POST', `/v1/requests/${o.id}/accept`)}>
                    {s.accept}
                  </Btn>
                  <Btn className="min-h-12" disabled={act.busy} onClick={() => void act.run('POST', `/v1/requests/${o.id}/decline`)}>
                    {s.decline}
                  </Btn>
                  <a href={`tel:${o.phone}`} dir="ltr" className="grid min-h-12 place-items-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
                    ☎ {s.call}
                  </a>
                </div>
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}
