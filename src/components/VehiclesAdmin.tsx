import { useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { declineTaxiRequest, decideVehicle, linkAsTaxi, useAllVehicles, useVehicleLog, type Vehicle } from '../vehicles'
import type { Taxi } from '../types'
import { normalize, validate, type Field, type TaxiInput } from '../validate'
import { VEHICLE_ICONS } from './iconStyles'

// Management -> Vehicles: any operator approves, rejects or suspends private vehicles (a reason is
// needed to reject or suspend). Pending first. The log keeps every decision.
export function VehiclesAdmin({ taxis = [], center = 'main' }: { taxis?: Taxi[]; center?: string }) {
  const { fb, email, role } = useAuth()
  const isAdmin = role === 'admin' || role === 'dev'
  const { t } = useI18n()
  const all = useAllVehicles(fb, true)
  const log = useVehicleLog(fb, true)
  const order: Vehicle['status'][] = ['pending', 'approved', 'suspended', 'rejected']
  const sorted = [...all].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.createdAt - a.createdAt)
  const pending = all.filter((v) => v.status === 'pending').length
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t.vehAdminIntro(pending)}</p>
      {/* Owners asking to run their approved vehicle as a center taxi too (admins answer). */}
      {isAdmin &&
        all
          .filter((v) => v.status === 'approved' && v.taxiRequestAt && !v.taxiId)
          .map((v) => <TaxiRequest key={`tr-${v.id}`} v={v} taxis={taxis} center={center} />)}
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

// An owner asks to run their private vehicle as a center taxi too (the same vehicle: P6017 and
// T6017). The admin gives it a center number and its T registration, checks the driver's names,
// and links it: a taxi record is made, and the owner becomes its driver (keeping private hire).
function TaxiRequest({ v, taxis, center }: { v: Vehicle; taxis: Taxi[]; center: string }) {
  const { fb, email } = useAuth()
  const { t } = useI18n()
  const digits = v.reg.replace(/\D/g, '')
  const [form, setForm] = useState<TaxiInput>({
    taxiNo: '',
    taxiReg: digits ? `T${digits}` : '',
    name: v.ownerName.replace(/[^A-Za-z .'-]/g, '').trim().slice(0, 60),
    nameDv: '',
    phone: v.phone,
    seats: String(Math.min(15, Math.max(1, v.seats))),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = normalize(form)
  const errors = validate(input, taxis)
  const fields: Field[] = ['taxiNo', 'taxiReg', 'name', 'nameDv', 'phone', 'seats']
  const link = async () => {
    if (!fb || Object.keys(errors).length) return
    setBusy(true)
    setError(null)
    try {
      const user = await fb.getDoc(fb.doc(fb.db, 'users', v.ownerUid))
      const ownerEmail = user.exists() && typeof user.data().email === 'string' ? user.data().email : ''
      if (!ownerEmail) throw new Error('owner_unknown')
      await linkAsTaxi(fb, v, { taxiNo: input.taxiNo, taxiReg: input.taxiReg, name: input.name, nameDv: input.nameDv, phone: input.phone, seats: Number(input.seats) }, ownerEmail, email ?? '', center)
    } catch (e) {
      const x = e as { code?: string; message?: string }
      setError(x.code ?? x.message ?? 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-3 rounded-xl border-2 border-sky-300 bg-white p-4">
      <p className="font-bold">{t.vehTaxiRequest(v.ownerName, v.reg)}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((k) => (
          <label key={k} className="block">
            <span className="text-sm font-medium">{t.fields[k]}</span>
            <input
              value={form[k]}
              dir={k === 'nameDv' ? 'rtl' : 'ltr'}
              inputMode={k === 'taxiNo' || k === 'phone' || k === 'seats' ? 'numeric' : undefined}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className={`mt-1 block min-h-11 w-full rounded-lg border px-3 text-base ${errors[k] ? 'border-rose-400' : 'border-slate-300'}`}
            />
            <span className={`text-xs ${errors[k] ? 'text-rose-600' : 'text-slate-500'}`}>{errors[k] ? t.errors[errors[k]] : t.hints[k]}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || Object.keys(errors).length > 0} onClick={() => void link()} className="min-h-11 flex-1 rounded-lg bg-emerald-600 font-bold text-white disabled:opacity-40">
          {t.vehLinkTaxi}
        </button>
        <button type="button" disabled={busy} onClick={() => fb && void declineTaxiRequest(fb, v).catch((e: { code?: string }) => setError(e.code ?? 'error'))} className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold">
          {t.decline}
        </button>
      </div>
    </section>
  )
}

