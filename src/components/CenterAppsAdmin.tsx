import { useState } from 'react'
import { Clock, ExternalLink } from 'lucide-react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { decideCenter, decideCenterLogo, STAFF_ELSEWHERE, useAllCenterApps, useCenterLog, type CenterApp } from '../centerApps'
import { placeLink } from '../services'
import { CenterLogo } from './MyCenters'

// Management -> Centers (platform admins): taxi center owners' applications. Approve (the center
// is made and the owner becomes its admin, in one batch), reject or suspend with a reason, and
// approve or turn down a new logo. Pending first; the log keeps every action.
export function CenterAppsAdmin() {
  const { fb, email } = useAuth()
  const { t } = useI18n()
  const all = useAllCenterApps(fb, true)
  const log = useCenterLog(fb, true)
  const order: CenterApp['status'][] = ['pending', 'approved', 'suspended', 'rejected']
  const sorted = [...all].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || Number(!!b.pendingLogo) - Number(!!a.pendingLogo) || b.createdAt - a.createdAt)
  const waiting = all.filter((a) => a.status === 'pending' || a.pendingLogo).length
  return (
    <section className="space-y-3">
      <h3 className="font-black">{t.ctrAdminTitle}</h3>
      <p className="text-sm text-slate-600">{t.ctrAdminIntro(waiting)}</p>
      {sorted.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t.ctrAdminNone}</p>}
      {sorted.map((a) => (
        <Row key={a.id} a={a} email={email ?? ''} fb={fb} />
      ))}
      {log.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-bold">{t.vehLog}</summary>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {log.map((x) => {
              const a = all.find((y) => y.id === x.appId)
              return (
                <li key={x.id} className="py-1.5">
                  <span className="font-semibold">{t.ctrActions[x.action] ?? x.action}</span> · {a?.name ?? x.appId.slice(0, 6)} · {x.by}
                  {x.reason && <span className="text-slate-500"> · {x.reason}</span>}
                  <span className="block text-xs text-slate-400">{x.at ? new Date(x.at).toLocaleString() : ''}</span>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </section>
  )
}

function Row({ a, email, fb }: { a: CenterApp; email: string; fb: ReturnType<typeof useAuth>['fb'] }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (p: Promise<void>) => {
    setBusy(true)
    setError(null)
    p.then(() => setReason(''))
      .catch((e: { code?: string }) => setError(e.code ?? 'error'))
      .finally(() => setBusy(false))
  }
  const decide = (status: 'approved' | 'rejected' | 'suspended') => fb && run(decideCenter(fb, a, status, reason.trim(), email))
  const logo = (ok: boolean) => fb && run(decideCenterLogo(fb, a, ok, reason.trim(), email))
  const needsReason = !reason.trim()
  const open = a.hours.map((h, i) => (h ? { day: t.svcDays[i], h } : null)).filter((x) => x !== null)
  return (
    <section className={`space-y-2 rounded-xl border bg-white p-4 ${a.status === 'pending' || a.pendingLogo ? 'border-amber-400' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <CenterLogo logo={a.logo} />
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {a.name}
            {a.nameDv && (
              <span dir="rtl" lang="dv" className="ms-2 font-normal text-slate-600">
                {a.nameDv}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {a.ownerName || '-'} · {a.ownerEmail} · <span dir="ltr">{a.phone}</span>
          </p>
          <p className="text-xs font-semibold text-slate-700">
            {t.ctrLicence}: <span dir="ltr">{a.licence}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{t.svcStatus[a.status]}</span>
      </div>
      <div className="space-y-1 rounded-lg bg-slate-50 p-2 text-xs">
        {a.at && (
          <a href={placeLink(a.at)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 font-semibold text-emerald-800 underline">
            {t.svcSeePlace} <span dir="ltr">({a.at[0]}, {a.at[1]})</span>
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-600">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          {open.map((x) => (
            <span key={x.day}>
              {x.day} <span dir="ltr">{x.h.open}-{x.h.close}</span>
            </span>
          ))}
        </p>
      </div>
      {a.reason && <p className="text-sm text-slate-600">{t.vehReason(a.reason)}</p>}
      {a.pendingLogo && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2 text-sm">
          <CenterLogo logo={a.pendingLogo} size="size-12" />
          <span className="flex-1 font-semibold text-amber-900">{t.ctrLogoPending}</span>
          {a.status === 'approved' && (
            <>
              <button type="button" disabled={busy} onClick={() => logo(true)} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-40">
                {t.ctrLogoApprove}
              </button>
              <button type="button" disabled={busy} onClick={() => logo(false)} className="min-h-10 rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 disabled:opacity-40">
                {t.ctrLogoReject}
              </button>
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder={t.vehReasonPlaceholder} aria-label={t.vehReasonPlaceholder} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
        {a.status !== 'approved' && (
          <button type="button" disabled={busy} onClick={() => decide('approved')} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-40">
            {t.vehApprove}
          </button>
        )}
        {a.status === 'pending' && (
          <button type="button" disabled={busy || needsReason} onClick={() => decide('rejected')} className="min-h-10 rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 disabled:opacity-40">
            {t.vehReject}
          </button>
        )}
        {a.status === 'approved' && (
          <button type="button" disabled={busy || needsReason} onClick={() => decide('suspended')} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-40">
            {t.vehSuspend}
          </button>
        )}
      </div>
      {a.status === 'approved' && <p className="text-xs text-slate-600">{t.ctrSuspendNote(a.ownerEmail)}</p>}
      {error && <p className="text-sm font-semibold text-rose-700">{error === STAFF_ELSEWHERE ? t.ctrStaffElsewhere : t.saveError(error)}</p>}
    </section>
  )
}
