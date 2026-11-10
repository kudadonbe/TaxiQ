import { useEffect, useState } from 'react'
import { ExternalLink, LifeBuoy, LocateFixed, MapPin, Plus } from 'lucide-react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { allWeek, EMPTY_HOURS, LIMITS, SERVICE_KINDS, serviceErrors, type ServiceDetails, type ServiceKind, type WeekHours } from '../core/services'
import { applyService, editApprovedService, needsRecheck, placeLink, useMyServices, useSyncFixedServices, withdrawService, type Service } from '../services'
import { useAvailableService } from '../serviceAvailability'
import { Switch } from './Switch'
import { SERVICE_ICONS } from './iconStyles'

const STATUS_CLASS: Record<Service['status'], string> = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-rose-100 text-rose-900',
  suspended: 'bg-slate-200 text-slate-800',
}
const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4'
const box = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base'
const round5 = (n: number) => Math.round(n * 1e5) / 1e5

// My services (in My account): offer a service to drivers (mechanic, tyres, towing...), see its
// status, edit or withdraw it, and, for a helper who comes to you, switch Available on. An approved
// fixed place is kept on the map by this screen (useSyncFixedServices).
export function MyServices() {
  const { fb, uid, name, email } = useAuth()
  const { t } = useI18n()
  const mine = useMyServices(fb, uid)
  useSyncFixedServices(fb, mine)
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  if (!fb || !uid) return null
  const me = { uid, name: name ?? '', email: email ?? '' }
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-black">
          <LifeBuoy className="size-4" aria-hidden="true" /> {t.svcMine}
        </h3>
        {!editing && (
          <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white">
            <Plus className="size-4" aria-hidden="true" /> {t.svcOffer}
          </button>
        )}
      </div>
      <p className="text-sm text-slate-600">{t.svcIntro}</p>
      {editing && <ServiceForm key={editing === 'new' ? 'new' : editing.id} me={me} existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      {mine.length === 0 && !editing && <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">{t.svcNone}</p>}
      {mine.map((s) => (
        <ServiceCard key={s.id} s={s} onEdit={() => setEditing(s)} onWithdraw={() => withdrawService(fb, s, me.email)} />
      ))}
    </section>
  )
}

function ServiceCard({ s, onEdit, onWithdraw }: { s: Service; onEdit: () => void; onWithdraw: () => Promise<void> }) {
  const { t, lang } = useI18n()
  const avail = useAvailableService()
  const isOn = avail.serviceId === s.id
  const [sure, setSure] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The second tap must come soon after the first.
  useEffect(() => {
    if (!sure) return
    const id = setTimeout(() => setSure(false), 4000)
    return () => clearTimeout(id)
  }, [sure])
  const Icon = SERVICE_ICONS[s.kinds[0] ?? 'mechanic']
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{lang === 'dv' && s.nameDv ? s.nameDv : s.name}</p>
          <p className="text-xs text-slate-500">
            {s.kinds.map((k) => t.svcKinds[k]).join(', ')} · {t.svcModes[s.mode]}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[s.status]}`}>{t.svcStatus[s.status]}</span>
      </div>
      {s.reason && <p className="rounded-lg bg-slate-50 p-2 text-sm">{t.vehReason(s.reason)}</p>}
      {s.status === 'pending' && <p className="text-sm text-amber-800">{t.svcPendingNote}</p>}
      {s.status === 'approved' && s.mode === 'fixed' && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-800">
          <MapPin className="size-4 shrink-0" aria-hidden="true" /> {t.svcOnMap}
        </p>
      )}
      {s.status === 'approved' && s.mode === 'mobile' && (
        <div className={`space-y-1 rounded-xl p-3 ${isOn ? 'bg-emerald-50' : 'bg-slate-50'}`}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{isOn ? t.svcAvailableOn : t.svcAvailableOff}</p>
              <p className="text-xs text-slate-600">{t.svcAvailableNote}</p>
            </div>
            <Switch on={isOn} label={t.svcAvailable} onChange={(on) => avail.setService(on ? s.id : null)} />
          </div>
          {isOn && avail.error && <p className="text-xs font-semibold text-rose-700">{avail.error === 'location_denied' ? t.shareDenied : t.saveError(avail.error)}</p>}
        </div>
      )}
      {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}
      <div className="flex flex-wrap gap-2">
        {s.status !== 'suspended' && (
          <button type="button" onClick={onEdit} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold">
            {s.status === 'rejected' ? t.vehFixResend : t.vehEdit}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (!sure) return setSure(true)
            setSure(false)
            if (isOn) avail.setService(null)
            onWithdraw().catch((e: { code?: string }) => setError(e.code ?? 'error'))
          }}
          className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${sure ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'}`}
        >
          {sure ? t.svcWithdrawSure : t.vehWithdraw}
        </button>
      </div>
    </div>
  )
}

const NEW: ServiceDetails = { name: '', nameDv: '', kinds: [], mode: 'fixed', at: null, hours: allWeek('08:00', '18:00'), phone: '', priceNote: '', note: '' }

function ServiceForm({ me, existing, onDone }: { me: { uid: string; name: string; email: string }; existing?: Service; onDone: () => void }) {
  const { fb } = useAuth()
  const { t } = useI18n()
  const [d, setD] = useState<ServiceDetails>(() =>
    existing
      ? { name: existing.name, nameDv: existing.nameDv, kinds: existing.kinds, mode: existing.mode, at: existing.at, hours: existing.mode === 'fixed' ? existing.hours : NEW.hours, phone: existing.phone, priceNote: existing.priceNote, note: existing.note }
      : NEW,
  )
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A mobile helper gives no place and no hours (shown only while Available).
  const final: ServiceDetails = d.mode === 'mobile' ? { ...d, at: null, hours: EMPTY_HOURS } : d
  const errors = serviceErrors(final)
  const bad = Object.keys(errors).length > 0
  const invalid = (k: keyof ServiceDetails) => errors[k] && <span className="block text-xs font-semibold text-rose-700">{t.vehInvalid}</span>
  const toggleKind = (k: ServiceKind) => setD({ ...d, kinds: d.kinds.includes(k) ? d.kinds.filter((x) => x !== k) : [...d.kinds, k] })
  const setDay = (i: number, h: WeekHours[number]) => setD({ ...d, hours: d.hours.map((x, j) => (j === i ? h : x)) })
  const firstOpen = d.hours.find((h) => h !== null)
  const locate = () => {
    if (!('geolocation' in navigator)) return setError('location_error')
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setD((x) => ({ ...x, at: [round5(p.coords.latitude), round5(p.coords.longitude)] }))
        setLocating(false)
      },
      (e) => {
        setError(e.code === e.PERMISSION_DENIED ? 'location_denied' : 'location_error')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  }
  const recheck = existing?.status === 'approved' && needsRecheck(existing, final)
  return (
    <div className="space-y-4 rounded-xl border-2 border-emerald-300 bg-white p-3">
      <h4 className="font-bold">{existing ? t.vehEdit : t.svcOffer}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">{t.svcName}</span>
          <input value={d.name} maxLength={LIMITS.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={box} />
          {invalid('name')}
        </label>
        <label className="block">
          <span className="text-sm font-medium">
            {t.svcNameDv} ({t.optional})
          </span>
          <input value={d.nameDv} maxLength={LIMITS.name} dir="rtl" lang="dv" onChange={(e) => setD({ ...d, nameDv: e.target.value })} className={box} />
          {invalid('nameDv')}
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">{t.svcKindsLabel}</legend>
        <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {SERVICE_KINDS.map((k) => {
            const Icon = SERVICE_ICONS[k]
            const on = d.kinds.includes(k)
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => toggleKind(k)} className={`flex min-h-11 items-center gap-2 rounded-lg px-2 text-start text-xs font-semibold ${on ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{t.svcKinds[k]}</span>
              </button>
            )
          })}
        </div>
        {invalid('kinds')}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">{t.svcModeLabel}</legend>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {(['fixed', 'mobile'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={d.mode === m} onClick={() => setD({ ...d, mode: m })} className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${d.mode === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {t.svcModes[m]}
            </button>
          ))}
        </div>
      </fieldset>

      {d.mode === 'mobile' ? (
        <p className="rounded-lg bg-sky-50 p-2 text-sm text-sky-900">{t.svcMobileNote}</p>
      ) : (
        <>
          <div>
            <p className="text-sm font-medium">{t.svcPlace}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button type="button" disabled={locating} onClick={locate} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-50">
                <LocateFixed className="size-4" aria-hidden="true" /> {locating ? t.svcLocating : t.svcUseLocation}
              </button>
              {d.at ? (
                <a href={placeLink(d.at)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-800 underline">
                  {t.svcPlaceSet} <span dir="ltr">({d.at[0]}, {d.at[1]})</span>
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-xs text-slate-500">{t.svcPlaceNeeded}</span>
              )}
            </div>
            {invalid('at')}
          </div>
          <div role="group" aria-labelledby="svc-hours">
            <div className="flex flex-wrap items-center gap-2">
              <p id="svc-hours" className="flex-1 text-sm font-medium">{t.svcHours}</p>
              <button type="button" disabled={!firstOpen} onClick={() => firstOpen && setD({ ...d, hours: allWeek(firstOpen.open, firstOpen.close) })} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40">
                {t.svcSameEveryDay}
              </button>
            </div>
            <ul className="mt-1 divide-y divide-slate-100">
              {d.hours.map((h, i) => (
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
            {invalid('hours')}
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">{t.yourPhone}</span>
          <input type="tel" inputMode="numeric" maxLength={7} value={d.phone} dir="ltr" onChange={(e) => setD({ ...d, phone: e.target.value.replace(/\D/g, '') })} className={box} />
          {invalid('phone')}
        </label>
        <label className="block">
          <span className="text-sm font-medium">
            {t.svcPriceNote} ({t.optional})
          </span>
          <input value={d.priceNote} maxLength={LIMITS.priceNote} placeholder={t.svcPricePlaceholder} onChange={(e) => setD({ ...d, priceNote: e.target.value })} className={box} />
          {invalid('priceNote')}
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium">
          {t.callNote} ({t.optional})
        </span>
        <input value={d.note} maxLength={LIMITS.note} onChange={(e) => setD({ ...d, note: e.target.value })} className={box} />
        {invalid('note')}
      </label>
      <p className="text-xs text-slate-500">{t.svcPhoneNote}</p>
      {existing?.status === 'approved' && <p className={`rounded-lg p-2 text-sm ${recheck ? 'bg-amber-50 font-semibold text-amber-900' : 'bg-slate-50 text-slate-600'}`}>{recheck ? t.svcRecheck : t.svcEditFree}</p>}
      {error && <p className="text-sm font-semibold text-rose-700">{error === 'location_denied' ? t.shareDenied : t.saveError(error)}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={bad || busy || !fb}
          onClick={() => {
            if (!fb) return
            setBusy(true)
            setError(null)
            ;(existing?.status === 'approved' ? editApprovedService(fb, existing, final, me.email) : applyService(fb, me, final, existing))
              .then(onDone)
              .catch((e: { code?: string }) => setError(e.code ?? 'error'))
              .finally(() => setBusy(false))
          }}
          className="min-h-11 flex-1 rounded-lg bg-emerald-600 font-bold text-white disabled:opacity-40"
        >
          {t.svcSend}
        </button>
        <button type="button" onClick={onDone} className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold">
          {t.cancel}
        </button>
      </div>
    </div>
  )
}
