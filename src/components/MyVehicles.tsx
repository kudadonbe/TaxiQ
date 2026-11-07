import { MapPin, Plus, ShieldAlert } from 'lucide-react'
import { Switch } from './Switch'
import { useMyRide } from '../useRides'
import { useMyPrivateRide } from '../privateRides'
import { useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { useAvailableVehicle } from '../availability'
import { applyVehicle, DEFAULT_SEATS, setPrice, useMyVehicles, vehicleErrors, VEHICLE_TYPES, withdrawVehicle, type Vehicle, type VehicleDetails, type VehicleType } from '../vehicles'
import { VEHICLE_ICONS } from './iconStyles'

const STATUS_CLASS: Record<Vehicle['status'], string> = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-rose-100 text-rose-900',
  suspended: 'bg-slate-200 text-slate-800',
}

// My vehicles: offer a vehicle for hire (any operator approves it), see its status, set its price,
// and make it available (shown on the map while on).
export function MyVehicles({ onShowOnMap }: { onShowOnMap?: (vehicleId: string) => void } = {}) {
  const { fb, uid, name, email } = useAuth()
  const { t } = useI18n()
  const mine = useMyVehicles(fb, uid)
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null)
  if (!fb || !uid) return <p className="text-sm text-slate-600">{t.vehSignIn}</p>
  const me = { uid, name: name ?? '', email: email ?? '' }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <h2 className="flex-1 text-xl font-black">{t.vehMine}</h2>
        {!editing && (
          <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white sm:w-auto">
            <Plus className="size-4" aria-hidden="true" /> {t.vehOffer}
          </button>
        )}
      </div>
      <p className="text-sm text-slate-600">{t.vehIntro}</p>
      {editing && <VehicleForm key={editing === 'new' ? 'new' : editing.id} me={me} existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      {mine.length === 0 && !editing && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t.vehNone}</p>}
      {mine.map((v) => (
        <VehicleCard key={v.id} v={v} onShowOnMap={onShowOnMap} onEdit={() => setEditing(v)} onWithdraw={() => void withdrawVehicle(fb, v, me.email)} />
      ))}
    </div>
  )
}

function VehicleCard({ v, onEdit, onWithdraw, onShowOnMap }: { v: Vehicle; onEdit: () => void; onWithdraw: () => void; onShowOnMap?: (id: string) => void }) {
  const { fb } = useAuth()
  const { t } = useI18n()
  const avail = useAvailableVehicle()
  const isOn = avail.availableId === v.id
  const { role, uid } = useAuth()
  const canTake = role === 'private' || role === 'dev'
  // One way of moving at a time: not while you're a passenger on a ride (taxi or private).
  const taxiRide = useMyRide(fb, uid)
  const privateRide = useMyPrivateRide(fb, uid)
  const inRide =
    (!!taxiRide && (taxiRide.status === 'offering' || taxiRide.status === 'accepted')) ||
    (!!privateRide && (privateRide.status === 'offering' || privateRide.status === 'accepted' || privateRide.status === 'onboard'))
  const [price, setPriceState] = useState({ base: v.priceBase, perKm: v.pricePerKm })
  const Icon = VEHICLE_ICONS[v.type]
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {t.vehTypes[v.type]} · <span dir="ltr">{v.reg}</span>
          </p>
          <p className="text-xs text-slate-500">
            {v.colour} · {t.vehSeats(v.seats)}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[v.status]}`}>{t.vehStatus[v.status]}</span>
      </div>
      {v.reason && <p className="rounded-lg bg-slate-50 p-2 text-sm">{t.vehReason(v.reason)}</p>}
      {v.status === 'pending' && <p className="text-sm text-amber-800">{t.vehPendingNote}</p>}

      {v.status === 'approved' && (
        <>
          <div className={`space-y-2 rounded-xl p-3 ${isOn ? 'bg-emerald-50' : 'bg-slate-50'}`}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{isOn ? t.vehAvailableOn : t.vehAvailableOff}</p>
                <p className="text-xs text-slate-600">{t.vehAvailableNote}</p>
              </div>
              <Switch on={isOn} locked={!canTake || (inRide && !isOn)} label={t.vehAvailable} onChange={(on) => avail.setAvailable(on ? v.id : null)} />
            </div>
            {isOn && onShowOnMap && (
              <button type="button" onClick={() => onShowOnMap(v.id)} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-bold text-white">
                <MapPin className="size-4" aria-hidden="true" /> {t.vehSeeOnMap}
              </button>
            )}
            {canTake && inRide && !isOn && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">{t.vehInRide}</p>}
            {!canTake && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t.vehNeedsRole}
              </p>
            )}
          </div>
          {isOn && avail.error && <p className="text-xs font-semibold text-rose-700">{avail.error === 'location_denied' ? t.shareDenied : t.saveError(avail.error)}</p>}
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="block min-w-0">
              <span className="block truncate text-xs font-medium">{t.vehPriceBase}</span>
              <input type="number" inputMode="numeric" min={0} max={10000} value={price.base} onChange={(e) => setPriceState({ ...price, base: Number(e.target.value) })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
            </label>
            <label className="block min-w-0">
              <span className="block truncate text-xs font-medium">{t.vehPricePerKm}</span>
              <input type="number" inputMode="numeric" min={0} max={1000} value={price.perKm} onChange={(e) => setPriceState({ ...price, perKm: Number(e.target.value) })} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
            </label>
            <button
              type="button"
              disabled={!fb || (price.base === v.priceBase && price.perKm === v.pricePerKm) || !(price.base >= 0 && price.base <= 10000 && price.perKm >= 0 && price.perKm <= 1000)}
              onClick={() => fb && void setPrice(fb, v, price.base, price.perKm)}
              className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              {t.save}
            </button>
          </div>
        </>
      )}

      {(v.status === 'pending' || v.status === 'rejected') && (
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold">
            {v.status === 'rejected' ? t.vehFixResend : t.vehEdit}
          </button>
          <button type="button" onClick={onWithdraw} className="min-h-9 rounded-lg px-3 text-sm text-rose-700 hover:bg-rose-50">
            {t.vehWithdraw}
          </button>
        </div>
      )}
    </section>
  )
}

function VehicleForm({ me, existing, onDone }: { me: { uid: string; name: string; email: string }; existing?: Vehicle; onDone: () => void }) {
  const { fb } = useAuth()
  const { t } = useI18n()
  const [d, setD] = useState<VehicleDetails>(
    existing ?? { type: 'motorbike', reg: '', colour: '', seats: DEFAULT_SEATS.motorbike, priceBase: 25, pricePerKm: 5, phone: '', note: '' },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errors = vehicleErrors(d)
  const bad = Object.keys(errors).length > 0
  const field = (k: keyof VehicleDetails, label: string, input: React.ReactNode) => (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {input}
      {errors[k] && <span className="text-xs font-semibold text-rose-700">{t.vehInvalid}</span>}
    </label>
  )
  const box = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base'
  return (
    <section className="space-y-3 rounded-xl border-2 border-emerald-300 bg-white p-4">
      <h3 className="font-bold">{existing ? t.vehEdit : t.vehOffer}</h3>
      <div className="grid grid-cols-5 gap-1" role="group" aria-label={t.vehType}>
        {VEHICLE_TYPES.map((type: VehicleType) => {
          const Icon = VEHICLE_ICONS[type]
          return (
            <button
              key={type}
              type="button"
              aria-pressed={d.type === type}
              onClick={() => setD({ ...d, type, seats: DEFAULT_SEATS[type] })}
              className={`grid min-h-16 place-items-center gap-1 rounded-lg p-1 text-xs font-semibold ${d.type === type ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              <Icon className="size-5" aria-hidden="true" />
              {t.vehTypes[type]}
            </button>
          )
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('reg', t.vehReg, <input value={d.reg} maxLength={12} dir="ltr" onChange={(e) => setD({ ...d, reg: e.target.value })} className={box} />)}
        {field('colour', t.vehColour, <input value={d.colour} maxLength={24} onChange={(e) => setD({ ...d, colour: e.target.value })} className={box} />)}
        {d.type !== 'motorbike' && d.type !== 'ebike' && field('seats', t.vehSeatsLabel, <input type="number" min={1} max={20} value={d.seats} onChange={(e) => setD({ ...d, seats: Number(e.target.value) })} className={box} />)}
        {field('phone', t.yourPhone, <input type="tel" inputMode="numeric" maxLength={7} value={d.phone} dir="ltr" onChange={(e) => setD({ ...d, phone: e.target.value.replace(/\D/g, '') })} className={box} />)}
        {field('priceBase', t.vehPriceBase, <input type="number" min={0} max={10000} value={d.priceBase} onChange={(e) => setD({ ...d, priceBase: Number(e.target.value) })} className={box} />)}
        {field('pricePerKm', t.vehPricePerKm, <input type="number" min={0} max={1000} value={d.pricePerKm} onChange={(e) => setD({ ...d, pricePerKm: Number(e.target.value) })} className={box} />)}
      </div>
      {field('note', `${t.callNote} (${t.optional})`, <input value={d.note} maxLength={120} onChange={(e) => setD({ ...d, note: e.target.value })} className={box} />)}
      <p className="text-xs text-slate-500">{t.vehPhonePrivate}</p>
      {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={bad || busy || !fb}
          onClick={() => {
            if (!fb) return
            setBusy(true)
            applyVehicle(fb, me, d, existing)
              .then(onDone)
              .catch((e: { code?: string }) => setError(e.code ?? 'error'))
              .finally(() => setBusy(false))
          }}
          className="min-h-11 flex-1 rounded-lg bg-emerald-600 font-bold text-white disabled:opacity-40"
        >
          {t.vehSend}
        </button>
        <button type="button" onClick={onDone} className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold">
          {t.cancel}
        </button>
      </div>
    </section>
  )
}
