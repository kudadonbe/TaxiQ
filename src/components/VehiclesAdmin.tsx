import { useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { decideVehicle, useAllVehicles, useVehicleLog, type Vehicle } from '../vehicles'
import { VEHICLE_ICONS } from './iconStyles'

// Management -> Vehicles: any operator approves, rejects or suspends private vehicles (a reason is
// needed to reject or suspend). Pending first. The log keeps every decision.
export function VehiclesAdmin() {
  const { fb, email } = useAuth()
  const { t } = useI18n()
  const all = useAllVehicles(fb, true)
  const log = useVehicleLog(fb, true)
  const order: Vehicle['status'][] = ['pending', 'approved', 'suspended', 'rejected']
  const sorted = [...all].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.createdAt - a.createdAt)
  const pending = all.filter((v) => v.status === 'pending').length
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t.vehAdminIntro(pending)}</p>
      {sorted.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t.vehAdminNone}</p>}
      {sorted.map((v) => (
        <Row key={v.id} v={v} email={email ?? ''} fb={fb} />
      ))}
      {log.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-bold">{t.vehLog}</summary>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {log.map((x) => {
              const v = all.find((y) => y.id === x.vehicleId)
              return (
                <li key={x.id} className="py-1.5">
                  <span className="font-semibold">{t.vehActions[x.action] ?? x.action}</span> · <span dir="ltr">{v?.reg ?? x.vehicleId.slice(0, 6)}</span> · {x.by}
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

function Row({ v, email, fb }: { v: Vehicle; email: string; fb: ReturnType<typeof useAuth>['fb'] }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const Icon = VEHICLE_ICONS[v.type]
  const decide = (status: 'approved' | 'rejected' | 'suspended') => {
    if (!fb) return
    setBusy(true)
    setError(null)
    decideVehicle(fb, v, status, reason.trim(), email)
      .then(() => setReason(''))
      .catch((e: { code?: string }) => setError(e.code ?? 'error'))
      .finally(() => setBusy(false))
  }
  const needsReason = !reason.trim()
  return (
    <section className={`space-y-2 rounded-xl border bg-white p-4 ${v.status === 'pending' ? 'border-amber-400' : 'border-slate-200'}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {t.vehTypes[v.type]} · <span dir="ltr">{v.reg}</span> · {v.colour}
          </p>
          <p className="text-xs text-slate-500">
            {v.ownerName || '—'} · <span dir="ltr">{v.phone}</span> · {t.vehSeats(v.seats)} · {t.vehPrice(v.priceBase, v.pricePerKm)}
          </p>
          {v.note && <p className="text-xs text-slate-500">{v.note}</p>}
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{t.vehStatus[v.status]}</span>
      </div>
      {v.reason && <p className="text-sm text-slate-600">{t.vehReason(v.reason)}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder={t.vehReasonPlaceholder} aria-label={t.vehReasonPlaceholder} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
        {v.status !== 'approved' && (
          <button type="button" disabled={busy} onClick={() => decide('approved')} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-40">
            {t.vehApprove}
          </button>
        )}
        {v.status === 'pending' && (
          <button type="button" disabled={busy || needsReason} onClick={() => decide('rejected')} className="min-h-10 rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 disabled:opacity-40">
            {t.vehReject}
          </button>
        )}
        {v.status === 'approved' && (
          <button type="button" disabled={busy || needsReason} onClick={() => decide('suspended')} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-40">
            {t.vehSuspend}
          </button>
        )}
      </div>
      {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}
    </section>
  )
}
