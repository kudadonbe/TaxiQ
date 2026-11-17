import { useEffect, useState } from 'react'
import { Building2, ExternalLink, ImageUp, LocateFixed, MapPin, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { allWeek } from '../core/services'
import { centerErrors, centerNeedsRecheck, CTR_LIMITS, isLogo, normLicence, type CenterDetails } from '../core/centerApps'
import { applyCenter, editApprovedCenter, resizeLogo, useMyCenterApps, withdrawCenter, type CenterApp } from '../centerApps'
import { placeLink } from '../services'
import { HoursEditor } from './HoursEditor'
import { PlaceInput } from './PlaceInput'

const STATUS_CLASS: Record<CenterApp['status'], string> = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-rose-100 text-rose-900',
  suspended: 'bg-slate-200 text-slate-800',
}
const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4'
const box = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base'
const round5 = (n: number) => Math.round(n * 1e5) / 1e5

// A center's logo, or a building icon. The data URL is checked again before it becomes an <img>.
export function CenterLogo({ logo, size = 'size-10' }: { logo: string; size?: string }) {
  return logo && isLogo(logo) ? (
    <img src={logo} alt="" className={`${size} shrink-0 rounded-xl border border-slate-200 bg-white object-contain`} />
  ) : (
    <span className={`grid ${size} shrink-0 place-items-center rounded-xl bg-amber-400 text-slate-900`}>
      <Building2 className="size-5" aria-hidden="true" />
    </span>
  )
}

// My taxi center (in My account -> What I offer): the owner of a taxi center registers it; a
// platform admin approves it, and the owner becomes its admin. Edit, or withdraw while pending.
export function MyCenters() {
  const { fb, uid, name, email } = useAuth()
  const { t } = useI18n()
  const mine = useMyCenterApps(fb, uid)
  const [editing, setEditing] = useState<CenterApp | 'new' | null>(null)
  if (!fb || !uid) return null
  const me = { uid, name: name ?? '', email: email ?? '' }
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-black">
          <Building2 className="size-4" aria-hidden="true" /> {t.ctrMine}
        </h3>
        {!editing && (
          <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white">
            <Plus className="size-4" aria-hidden="true" /> {t.ctrRegister}
          </button>
        )}
      </div>
      <p className="text-sm text-slate-600">{t.ctrIntro}</p>
      {editing && <CenterForm key={editing === 'new' ? 'new' : editing.id} me={me} existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      {mine.length === 0 && !editing && <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">{t.ctrNone}</p>}
      {mine.map((a) => (
        <AppCard key={a.id} a={a} onEdit={() => setEditing(a)} onWithdraw={() => withdrawCenter(fb, a, me.email)} />
      ))}
    </section>
  )
}

function AppCard({ a, onEdit, onWithdraw }: { a: CenterApp; onEdit: () => void; onWithdraw: () => Promise<void> }) {
  const { t, lang } = useI18n()
  const [sure, setSure] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!sure) return
    const id = setTimeout(() => setSure(false), 4000)
    return () => clearTimeout(id)
  }, [sure])
  // Withdraw only while it never ran as a center (the rules refuse it otherwise, and while suspended).
  const canWithdraw = (a.status === 'pending' || a.status === 'rejected') && !a.centerId
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-3">
        <CenterLogo logo={a.logo} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{lang === 'dv' && a.nameDv ? a.nameDv : a.name}</p>
          <p className="text-xs text-slate-500" dir="ltr">
            {a.licence} · {a.phone}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[a.status]}`}>{t.svcStatus[a.status]}</span>
      </div>
      {a.reason && <p className="rounded-lg bg-slate-50 p-2 text-sm">{t.vehReason(a.reason)}</p>}
      {a.status === 'pending' && <p className="text-sm text-amber-800">{t.ctrPendingNote}</p>}
      {a.status === 'approved' && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-800">
          <MapPin className="size-4 shrink-0" aria-hidden="true" /> {t.ctrOnMap}
        </p>
      )}
      {a.pendingLogo && (
        <p className="flex items-center gap-2 text-sm text-amber-800">
          <CenterLogo logo={a.pendingLogo} size="size-8" /> {t.ctrLogoPending}
        </p>
      )}
      {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}
      <div className="flex flex-wrap gap-2">
        {a.status !== 'suspended' && (
          <button type="button" onClick={onEdit} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold">
            {a.status === 'rejected' ? t.vehFixResend : t.vehEdit}
          </button>
        )}
        {canWithdraw && (
          <button
            type="button"
            onClick={() => {
              if (!sure) return setSure(true)
              setSure(false)
              onWithdraw().catch((e: { code?: string }) => setError(e.code ?? 'error'))
            }}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${sure ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'}`}
          >
            {sure ? t.svcWithdrawSure : t.vehWithdraw}
          </button>
        )}
      </div>
    </div>
  )
}

const NEW: CenterDetails = { name: '', nameDv: '', at: null, phone: '', hours: allWeek('06:00', '23:00'), licence: '', logo: '' }

function CenterForm({ me, existing, onDone }: { me: { uid: string; name: string; email: string }; existing?: CenterApp; onDone: () => void }) {
  const { fb } = useAuth()
  const { t } = useI18n()
  const [d, setD] = useState<CenterDetails>(() =>
    existing
      ? { name: existing.name, nameDv: existing.nameDv, at: existing.at, phone: existing.phone, hours: existing.hours, licence: existing.licence, logo: existing.pendingLogo || existing.logo }
      : NEW,
  )
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errors = centerErrors(d)
  const bad = Object.keys(errors).length > 0
  const invalid = (k: keyof CenterDetails) => errors[k] && <span className="block text-xs font-semibold text-rose-700">{t.vehInvalid}</span>
  const approved = existing?.status === 'approved'
  const recheck = approved && centerNeedsRecheck(existing, d)
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
  const pickLogo = (f: File | undefined) => {
    if (!f) return
    setError(null)
    resizeLogo(f)
      .then((logo) => setD((x) => ({ ...x, logo })))
      .catch(() => setError('logo'))
  }
  return (
    <div className="space-y-4 rounded-xl border-2 border-emerald-300 bg-white p-3">
      <h4 className="font-bold">{existing ? t.vehEdit : t.ctrRegister}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">{t.ctrName}</span>
          <input value={d.name} maxLength={CTR_LIMITS.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={box} />
          {invalid('name')}
        </label>
        <label className="block">
          <span className="text-sm font-medium">
            {t.svcNameDv} ({t.optional})
          </span>
          <input value={d.nameDv} maxLength={CTR_LIMITS.name} dir="rtl" lang="dv" onChange={(e) => setD({ ...d, nameDv: e.target.value })} className={box} />
          {invalid('nameDv')}
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t.ctrPlace}</p>
        <PlaceInput
          id="ctr-place"
          label={t.ctrPlaceSearch}
          hint={t.ctrPlaceHint}
          value={place}
          onChange={(text, at) => {
            setPlace(text)
            if (at) setD((x) => ({ ...x, at: [round5(at[0]), round5(at[1])] }))
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={locating} onClick={locate} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-50">
            <LocateFixed className="size-4" aria-hidden="true" /> {locating ? t.svcLocating : t.svcUseLocation}
          </button>
          {d.at ? (
            <a href={placeLink(d.at)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-800 underline">
              {t.svcPlaceSet} <span dir="ltr">({d.at[0]}, {d.at[1]})</span>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : (
            <span className="text-xs text-slate-500">{t.ctrPlaceNeeded}</span>
          )}
        </div>
        {invalid('at')}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">{t.ctrPhone}</span>
          <input type="tel" inputMode="numeric" maxLength={7} value={d.phone} dir="ltr" onChange={(e) => setD({ ...d, phone: e.target.value.replace(/\D/g, '') })} className={box} />
          {invalid('phone')}
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t.ctrLicence}</span>
          <input value={d.licence} maxLength={CTR_LIMITS.licence + 5} dir="ltr" disabled={approved} onChange={(e) => setD({ ...d, licence: normLicence(e.target.value) })} className={`${box} disabled:bg-slate-100`} />
          {invalid('licence')}
          <span className="block text-xs text-slate-500">{t.ctrLicenceNote}</span>
        </label>
      </div>

      <HoursEditor id="ctr-hours" hours={d.hours} onChange={(hours) => setD({ ...d, hours })} />
      {invalid('hours')}

      <div className="space-y-1">
        <p className="text-sm font-medium">
          {t.ctrLogo} ({t.optional})
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <CenterLogo logo={d.logo} size="size-14" />
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold">
            <ImageUp className="size-4" aria-hidden="true" /> {t.ctrLogoPick}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickLogo(e.target.files?.[0])} />
          </label>
          {d.logo && (
            <button type="button" onClick={() => setD({ ...d, logo: '' })} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50">
              <Trash2 className="size-4" aria-hidden="true" /> {t.ctrLogoRemove}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">{t.ctrLogoNote}</p>
        {invalid('logo')}
      </div>

      {approved && <p className={`rounded-lg p-2 text-sm ${recheck ? 'bg-amber-50 font-semibold text-amber-900' : 'bg-slate-50 text-slate-600'}`}>{recheck ? t.ctrRecheck : t.ctrEditFree}</p>}
      {error && <p className="text-sm font-semibold text-rose-700">{error === 'location_denied' ? t.shareDenied : error === 'logo' ? t.ctrLogoBad : t.saveError(error)}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={bad || busy || !fb}
          onClick={() => {
            if (!fb) return
            setBusy(true)
            setError(null)
            ;(approved && existing ? editApprovedCenter(fb, existing, d, me.email, recheck) : applyCenter(fb, me, d, existing))
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
