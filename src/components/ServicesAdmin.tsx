import { useState } from 'react'
import { Clock, ExternalLink } from 'lucide-react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { decideService, placeLink, useAllServices, useServiceLog, type Service } from '../services'
import { SERVICE_ICONS } from './iconStyles'

// Management -> Services: any operator approves, rejects or suspends services offered to drivers
// (a reason is needed to reject or suspend). Pending first. The log keeps every action.
export function ServicesAdmin() {
  const { fb, email } = useAuth()
  const { t } = useI18n()
  const all = useAllServices(fb, true)
  const log = useServiceLog(fb, true)
  const order: Service['status'][] = ['pending', 'approved', 'suspended', 'rejected']
  const sorted = [...all].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.createdAt - a.createdAt)
  const pending = all.filter((s) => s.status === 'pending').length
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t.svcAdminIntro(pending)}</p>
      {sorted.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t.svcAdminNone}</p>}
      {sorted.map((s) => (
        <Row key={s.id} s={s} email={email ?? ''} fb={fb} />
      ))}
      {log.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-bold">{t.vehLog}</summary>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {log.map((x) => {
              const s = all.find((y) => y.id === x.serviceId)
              return (
                <li key={x.id} className="py-1.5">
                  <span className="font-semibold">{t.vehActions[x.action] ?? x.action}</span> · {s?.name ?? x.serviceId.slice(0, 6)} · {x.by}
                  {x.reason && <span className="text-slate-500"> · {x.reason}</span>}
                  <span className="block text-xs text-slate-400">{x.at ? new Date(x.at).toLocaleString() : ''}</span>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </div>
  )
}

function Row({ s, email, fb }: { s: Service; email: string; fb: ReturnType<typeof useAuth>['fb'] }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const decide = (status: 'approved' | 'rejected' | 'suspended') => {
    if (!fb) return
    setBusy(true)
    setError(null)
    decideService(fb, s, status, reason.trim(), email)
      .then(() => setReason(''))
      .catch((e: { code?: string }) => setError(e.code ?? 'error'))
      .finally(() => setBusy(false))
  }
  const needsReason = !reason.trim()
  const open = s.hours.map((h, i) => (h ? { day: t.svcDays[i], h } : null)).filter((x) => x !== null)
  return (
    <section className={`space-y-2 rounded-xl border bg-white p-4 ${s.status === 'pending' ? 'border-amber-400' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-wrap gap-1">
          {s.kinds.slice(0, 3).map((k) => {
            const Icon = SERVICE_ICONS[k]
            return (
              <span key={k} className="grid size-9 place-items-center rounded-lg bg-slate-900 text-white">
                <Icon className="size-4" aria-hidden="true" />
              </span>
            )
          })}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {s.name}
            {s.nameDv && (
              <span dir="rtl" lang="dv" className="ms-2 font-normal text-slate-600">
                {s.nameDv}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {s.kinds.map((k) => t.svcKinds[k]).join(', ')} · {t.svcModes[s.mode]}
          </p>
          <p className="text-xs text-slate-500">
            {s.ownerName || '-'} · <span dir="ltr">{s.phone}</span>
            {s.priceNote && <> · {s.priceNote}</>}
          </p>
          {s.note && <p className="text-xs text-slate-500">{s.note}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{t.svcStatus[s.status]}</span>
      </div>
      {s.mode === 'fixed' && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-2 text-xs">
          {s.at && (
            <a href={placeLink(s.at)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 font-semibold text-emerald-800 underline">
              {t.svcSeePlace} <span dir="ltr">({s.at[0]}, {s.at[1]})</span>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-600">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            {open.length === 0
              ? t.svcNoHours
              : open.map((x) => (
                  <span key={x.day}>
                    {x.day} <span dir="ltr">{x.h.open}-{x.h.close}</span>
                  </span>
                ))}
          </p>
        </div>
      )}
      {s.reason && <p className="text-sm text-slate-600">{t.vehReason(s.reason)}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder={t.vehReasonPlaceholder} aria-label={t.vehReasonPlaceholder} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
        {s.status !== 'approved' && (
          <button type="button" disabled={busy} onClick={() => decide('approved')} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-40">
            {t.vehApprove}
          </button>
        )}
        {s.status === 'pending' && (
          <button type="button" disabled={busy || needsReason} onClick={() => decide('rejected')} className="min-h-10 rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 disabled:opacity-40">
            {t.vehReject}
          </button>
        )}
        {s.status === 'approved' && (
          <button type="button" disabled={busy || needsReason} onClick={() => decide('suspended')} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-40">
            {t.vehSuspend}
          </button>
        )}
      </div>
      {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}
    </section>
  )
}
