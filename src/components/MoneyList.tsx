import { useState } from 'react'
import { useI18n } from '../i18n'
import { byMonth, type AccountEntry, type Totals } from '../core/account'

// A person's money account: totals and the list of entries (My account and Management -> Users ->
// Details). The sign and the words carry the meaning; colour only helps.

export function MoneyTotals({ sums }: { sums: Totals }) {
  const { t } = useI18n()
  const cell = 'rounded-lg bg-slate-50 p-2'
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <div className={cell}>
        <dt className="text-xs text-slate-500">{t.moneyEarned}</dt>
        <dd className="font-bold text-emerald-800">{t.moneyMvr(sums.earned)}</dd>
      </div>
      <div className={cell}>
        <dt className="text-xs text-slate-500">{t.moneyPaid}</dt>
        <dd className="font-bold text-slate-800">{t.moneyMvr(sums.paid)}</dd>
      </div>
      {sums.corrections !== 0 && (
        <div className={cell}>
          <dt className="text-xs text-slate-500">{t.moneyCorrections}</dt>
          <dd className={`font-bold ${sums.corrections > 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
            {sums.corrections > 0 ? t.moneyPlus(sums.corrections) : t.moneyMinus(-sums.corrections)}
          </dd>
        </div>
      )}
      <div className={cell}>
        <dt className="text-xs text-slate-500">{t.moneyNetTotal}</dt>
        <dd className={`font-black ${sums.net < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{t.moneyMvr(sums.net)}</dd>
      </div>
    </dl>
  )
}

export function MoneyEntries({ entries, max, showBy = false }: { entries: AccountEntry[]; max: number; showBy?: boolean }) {
  const { t, lang } = useI18n()
  const [all, setAll] = useState(false)
  const when = new Intl.DateTimeFormat(lang === 'dv' ? 'dv-MV' : undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const shown = all ? entries : entries.slice(0, max)

  const what = (e: AccountEntry) => {
    if (e.side === 'correction') return t.moneyCorrection(e.note)
    if (e.side === 'earned') return e.kind === 'private' ? t.moneyEarnedPrivate : e.kind === 'taxi' ? t.moneyEarnedTaxi : t.moneyEarned
    return e.kind === 'private' ? t.moneyPaidPrivate : e.kind === 'taxi' ? t.moneyPaidTaxi : t.moneyPaid
  }
  // Earned adds, paid takes away; a correction carries its own sign.
  const signed = (e: AccountEntry) => (e.side === 'paid' ? -e.amount : e.amount)

  if (entries.length === 0) return <p className="text-sm text-slate-500">{t.moneyEmpty}</p>
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-slate-100">
        {shown.map((e) => {
          const n = signed(e)
          return (
            <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-bold break-words">
                  <bdi>{what(e)}</bdi>
                </p>
                <p className="text-xs text-slate-500">
                  {e.at > 0 ? when.format(e.at) : ''}
                  {' · '}
                  {t.moneyCash}
                  {showBy && e.by && (
                    <>
                      {' · '}
                      <bdi>{t.personBy(e.by)}</bdi>
                    </>
                  )}
                </p>
              </div>
              <span className={`shrink-0 font-black ${n > 0 ? 'text-emerald-700' : e.side === 'paid' ? 'text-slate-700' : 'text-rose-700'}`}>
                {n >= 0 ? t.moneyPlus(n) : t.moneyMinus(-n)}
              </span>
            </li>
          )
        })}
      </ul>
      {entries.length > max && (
        <button type="button" onClick={() => setAll((v) => !v)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800">
          {all ? t.moneyShowFewer : t.moneyShowAll(entries.length)}
        </button>
      )}
    </div>
  )
}

// This month's totals and up to 6 past months (byMonth gives newest first).
export function MoneyMonths({ entries }: { entries: AccountEntry[] }) {
  const { t, lang } = useI18n()
  const months = byMonth(entries)
  const [current] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const thisMonth = months[0]?.month === current ? months[0].totals : null
  const past = months.filter((m) => m.month !== current).slice(0, 6)
  const fmt = new Intl.DateTimeFormat(lang === 'dv' ? 'dv-MV' : undefined, { month: 'long', year: 'numeric' })
  const label = (m: string) => fmt.format(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1))
  if (!thisMonth && past.length === 0) return null
  return (
    <div className="space-y-2">
      {thisMonth && (
        <div className="space-y-1">
          <h4 className="text-sm font-bold">{t.moneyThisMonth}</h4>
          <MoneyTotals sums={thisMonth} />
        </div>
      )}
      {past.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-bold">{t.moneyPastMonths}</h4>
          <ul className="divide-y divide-slate-100 text-sm">
            {past.map((m) => (
              <li key={m.month} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                <span className="font-bold">{label(m.month)}</span>
                <span className="text-slate-600">
                  {t.moneyEarned} {t.moneyMvr(m.totals.earned)} · {t.moneyPaid} {t.moneyMvr(m.totals.paid)}
                </span>
                <span className="ms-auto font-bold">
                  {t.moneyNetTotal} {t.moneyMvr(m.totals.net)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
