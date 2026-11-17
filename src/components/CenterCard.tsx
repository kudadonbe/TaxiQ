import { CarTaxiFront, Phone, Route as RouteIcon } from 'lucide-react'
import { useState } from 'react'
import type { PublicCenter } from '../centerApps'
import { isLogo } from '../core/centerApps'
import { todayHours } from '../core/services'
import { useI18n } from '../i18n'

// A taxi center's card on the map (the one open panel): its logo, open now with today's hours, the
// distance, Call, Route, and Hire from this center (the hire form with this center chosen).
export function CenterCard({ c, metres, distance, onRoute, onHire }: { c: PublicCenter; metres: number | null; distance: (m: number) => string; onRoute?: () => void; onHire?: () => void }) {
  const { t } = useI18n()
  const [now] = useState(() => new Date())
  const today = todayHours(c.hours, now)
  const phone = c.phone.replace(/\D/g, '')
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {c.logo && isLogo(c.logo) && <img src={c.logo} alt="" className="size-12 shrink-0 rounded-xl bg-white object-contain" />}
        <p className="text-sm">
          <span className={`font-bold ${c.openNow ? 'text-emerald-700' : 'text-rose-700'}`}>{c.openNow ? t.svcOpenNow : t.svcClosedNow}</span>
          <span className="text-slate-600">
            {' · '}
            {today ? t.svcToday(today.open, today.close) : t.svcClosedToday}
          </span>
          {metres !== null && <span className="text-slate-600 tabular-nums"> · {distance(metres)}</span>}
        </p>
      </div>
      {onHire && (
        <button type="button" onClick={onHire} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-sm font-bold text-slate-950">
          <CarTaxiFront className="size-4" aria-hidden="true" /> {t.ctrHire}
        </button>
      )}
      <div className="flex gap-2">
        {phone && (
          <a href={`tel:${phone}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white">
            <Phone className="size-4" aria-hidden="true" /> {t.svcCall} <span dir="ltr">{phone}</span>
          </a>
        )}
        {onRoute && (
          <button type="button" onClick={onRoute} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white">
            <RouteIcon className="size-4" aria-hidden="true" /> {t.svcRoute}
          </button>
        )}
      </div>
      {!onRoute && <p className="text-xs text-slate-500">{t.ctrNeedSpot}</p>}
    </div>
  )
}
