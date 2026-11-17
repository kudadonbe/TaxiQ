import { allWeek, type WeekHours } from '../core/services'
import { useI18n } from '../i18n'
import { Switch } from './Switch'

// Opening hours for each day of the week (the same shape as services' WeekHours), with "Same every day".
export function HoursEditor({ id, hours, onChange }: { id: string; hours: WeekHours; onChange: (h: WeekHours) => void }) {
  const { t } = useI18n()
  const setDay = (i: number, h: WeekHours[number]) => onChange(hours.map((x, j) => (j === i ? h : x)))
  const firstOpen = hours.find((h) => h !== null)
  return (
    <div role="group" aria-labelledby={id}>
      <div className="flex flex-wrap items-center gap-2">
        <p id={id} className="flex-1 text-sm font-medium">
          {t.svcHours}
        </p>
        <button type="button" disabled={!firstOpen} onClick={() => firstOpen && onChange(allWeek(firstOpen.open, firstOpen.close))} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40">
          {t.svcSameEveryDay}
        </button>
      </div>
      <ul className="mt-1 divide-y divide-slate-100">
        {hours.map((h, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="w-24 shrink-0 text-sm font-semibold">{t.svcDays[i]}</span>
            <Switch on={h !== null} label={t.svcOpenDay(t.svcDays[i])} onChange={(on) => setDay(i, on ? (firstOpen ?? { open: '08:00', close: '18:00' }) : null)} />
            {h ? (
              <span className="flex items-center gap-1" dir="ltr">
                <input type="time" aria-label={`${t.svcDays[i]} ${t.svcOpens}`} value={h.open} onChange={(e) => setDay(i, { ...h, open: e.target.value })} className="min-h-10 rounded-lg border border-slate-300 px-2 text-sm" />
                <span aria-hidden="true">-</span>
                <input type="time" aria-label={`${t.svcDays[i]} ${t.svcCloses}`} value={h.close} onChange={(e) => setDay(i, { ...h, close: e.target.value })} className="min-h-10 rounded-lg border border-slate-300 px-2 text-sm" />
              </span>
            ) : (
              <span className="text-sm text-slate-500">{t.svcClosed}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
