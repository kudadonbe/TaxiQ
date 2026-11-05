import { lazy, Suspense, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { PlaceInput } from '../components/PlaceInput'
import type { Taxi } from '../types'
import { isFreeText } from '../validate'
import { OFFER_SECONDS } from '../core/offers'
import { useAction, usePoll, type Center, type Me } from './api'
import { useV3Strings } from './strings'
import { Badge, Btn, Card, ErrorLine, Field, Select } from './ui'
import { statusTone } from './tone'
import { useNow } from '../useRides'

const MapView = lazy(() => import('../components/MapView'))
const EMPTY = new Set<string>()

interface PublicTaxi {
  membershipId: string
  taxiNo: string
  name: string
  nameDv: string
  suspended: boolean
}
interface MyRequest {
  id: string
  centerName: string
  mode: string
  pickup: string
  destination: string
  status: 'offering' | 'accepted' | 'expired' | 'cancelled'
  offerTaxiNo: string | null
  offerAt: string
  acceptedTaxiNo: string | null
  acceptedDriverName: string | null
  acceptedDriverNameDv: string | null
  createdAt: string
}

// Citizen: hire a taxi from a center, apply to drive, or register a taxi center.
export function CitizenScreen({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const s = useV3Strings()
  const { lang } = useI18n()
  const centers = usePoll<{ centers: Center[] }>('/v1/centers', 30000)
  const [centerId, setCenterId] = useState<string>('')
  const current = centerId || centers.data?.centers[0]?.id || ''
  const taxis = usePoll<{ taxis: PublicTaxi[] }>(current ? `/v1/centers/${current}/taxis` : null, 10000)
  const mapTaxis = useMemo<Taxi[]>(
    () =>
      (taxis.data?.taxis ?? []).map((x) => ({
        id: x.membershipId,
        taxiNo: x.taxiNo,
        taxiReg: '',
        driver: { id: x.membershipId, name: x.name, nameDv: x.nameDv, phone: '' },
        suspended: x.suspended ? { reason: 'other', note: '', at: 0 } : undefined,
      })),
    [taxis.data],
  )
  const [chosen, setChosen] = useState<string | null>(null)
  const chosenTaxi = taxis.data?.taxis.find((x) => x.membershipId === chosen && !x.suspended)

  return (
    <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
      <div className="space-y-4 lg:self-start">
        <Card title={s.hireTitle}>
          <Select label={s.center} value={current} onChange={(e) => (setCenterId(e.target.value), setChosen(null))}>
            {(centers.data?.centers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.island ? ` · ${c.island}` : ''}
              </option>
            ))}
          </Select>
          {current && <Hire centerId={current} chosen={chosenTaxi ? { id: chosenTaxi.membershipId, no: chosenTaxi.taxiNo, name: lang === 'dv' && chosenTaxi.nameDv ? chosenTaxi.nameDv : chosenTaxi.name } : null} onClearChoice={() => setChosen(null)} />}
        </Card>
        <DriverApply me={me} centers={centers.data?.centers ?? []} onChanged={onChanged} />
        <CenterApply me={me} onChanged={onChanged} />
      </div>
      <div className="isolate">
        <Suspense fallback={<p className="text-sm text-slate-500">{s.loading}</p>}>
          <MapView taxis={mapTaxis} interested={EMPTY} pickupAt={undefined} onPickTaxi={setChosen} />
        </Suspense>
      </div>
    </div>
  )
}

function Hire({ centerId, chosen, onClearChoice }: { centerId: string; chosen: { id: string; no: string; name: string } | null; onClearChoice: () => void }) {
  const s = useV3Strings()
  const { lang } = useI18n()
  const mine = usePoll<{ requests: MyRequest[] }>('/v1/me/requests', 2000)
  const act = useAction(mine.reload)
  const [form, setForm] = useState({ pickup: '', destination: '', phone: '', note: '' })
  const [pickupAt, setPickupAt] = useState<[number, number] | undefined>()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const ride = mine.data?.requests[0]
  const active = ride && ride.id !== dismissed && ride.status !== 'cancelled' ? ride : null
  const now = useNow(active?.status === 'offering')
  const valid = !!form.pickup.trim() && isFreeText(form.pickup.trim()) && isFreeText(form.destination.trim()) && isFreeText(form.note.trim()) && /^\d{7}$/.test(form.phone.trim())

  const send = (membershipId?: string) => act.run('POST', `/v1/centers/${centerId}/requests`, { ...form, ...(pickupAt ? { pickupAt } : {}), ...(membershipId ? { membershipId } : {}) })

  if (active) {
    const left = Math.max(0, Math.ceil((new Date(active.offerAt).getTime() + OFFER_SECONDS * 1000 - now) / 1000))
    return (
      <div className="space-y-2" aria-live="polite">
        <p className="text-sm text-slate-600">
          📍 <bdi>{active.pickup}</bdi>
          {active.destination && (
            <>
              {' '}
              → <bdi>{active.destination}</bdi>
            </>
          )}
        </p>
        {active.status === 'offering' && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 font-semibold text-amber-900">
            <span className="flex-1">{s.asking(active.offerTaxiNo ?? '?')}</span>
            <span dir="ltr">{s.secondsLeft(left)}</span>
          </p>
        )}
        {active.status === 'accepted' && (
          <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900">
            ✅ {s.coming(active.acceptedTaxiNo ?? '?', (lang === 'dv' && active.acceptedDriverNameDv) || active.acceptedDriverName || '')}
          </p>
        )}
        {active.status === 'expired' && <p className="rounded-lg bg-rose-50 p-3 font-semibold text-rose-800">{s.noTaxi}</p>}
        <div className="flex flex-wrap gap-2">
          {active.status === 'offering' && <Btn onClick={() => void act.run('POST', `/v1/requests/${active.id}/cancel`)}>{s.cancelRequest}</Btn>}
          {active.status !== 'offering' && <Btn onClick={() => setDismissed(active.id)}>{s.newRequest}</Btn>}
        </div>
        <ErrorLine code={act.error} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <PlaceInput id="v3-pickup" label="📍" hint="" value={form.pickup} onChange={(text, at) => (setForm({ ...form, pickup: text }), setPickupAt(at))} />
      <PlaceInput id="v3-dest" label="→" hint="" value={form.destination} onChange={(text) => setForm({ ...form, destination: text })} />
      <Field label={s.yourPhone} type="tel" inputMode="numeric" dir="ltr" maxLength={7} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <Field label={s.note} maxLength={120} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      {chosen && (
        <p className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
          <span className="flex-1 font-semibold">
            🚕 {chosen.no} · {chosen.name}
          </span>
          <Btn onClick={onClearChoice}>{s.anyTaxi}</Btn>
        </p>
      )}
      <ErrorLine code={act.error} />
      <Btn tone="primary" className="min-h-12 w-full" disabled={!valid || act.busy} onClick={() => void send(chosen?.id)}>
        {chosen ? s.requestTaxi(chosen.no) : s.requestQueue}
      </Btn>
    </div>
  )
}

function DriverApply({ me, centers, onChanged }: { me: Me; centers: Center[]; onChanged: () => void }) {
  const s = useV3Strings()
  const vehicles = usePoll<{ vehicles: { id: string; plate: string; seats: number }[] }>('/v1/me/vehicles', 0)
  const act = useAction(() => (vehicles.reload(), onChanged()))
  const [v, setV] = useState({ plate: '', seats: '4', permitExpiry: '', insuranceExpiry: '' })
  const [a, setA] = useState({ centerId: '', vehicleId: '', driverName: me.name, driverNameDv: '', driverPhone: '' })
  const firstVehicle = vehicles.data?.vehicles[0]?.id ?? ''

  return (
    <Card title={s.becomeDriver}>
      {me.memberships.length > 0 && (
        <ul className="space-y-1 text-sm">
          {me.memberships.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <span className="flex-1">{m.centerName}</span>
              {m.taxiNo && <span className="font-black tabular-nums">{m.taxiNo}</span>}
              <Badge tone={statusTone(m.status)}>{s.status[m.status] ?? m.status}</Badge>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">{s.addVehicle}</summary>
        <div className="mt-2 grid gap-2">
          <Field label={s.plate} dir="ltr" value={v.plate} onChange={(e) => setV({ ...v, plate: e.target.value })} placeholder="T5110" />
          <Field label={s.seats} type="number" min={1} max={20} value={v.seats} onChange={(e) => setV({ ...v, seats: e.target.value })} />
          <Field label={s.permitExpiry} type="date" value={v.permitExpiry} onChange={(e) => setV({ ...v, permitExpiry: e.target.value })} />
          <Field label={s.insuranceExpiry} type="date" value={v.insuranceExpiry} onChange={(e) => setV({ ...v, insuranceExpiry: e.target.value })} />
          <Btn
            tone="dark"
            disabled={!/^[A-Za-z]\d{1,6}$/.test(v.plate.trim()) || act.busy}
            onClick={() => void act.run('POST', '/v1/vehicles', { plate: v.plate.trim(), seats: Number(v.seats) || 4, permitExpiry: v.permitExpiry, insuranceExpiry: v.insuranceExpiry })}
          >
            {s.addVehicle}
          </Btn>
        </div>
      </details>
      {(vehicles.data?.vehicles.length ?? 0) > 0 && (
        <div className="grid gap-2">
          <Select label={s.applyTo} value={a.centerId} onChange={(e) => setA({ ...a, centerId: e.target.value })}>
            <option value="">{s.chooseCenter}</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label={s.vehicle} value={a.vehicleId || firstVehicle} onChange={(e) => setA({ ...a, vehicleId: e.target.value })}>
            {vehicles.data!.vehicles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.plate}
              </option>
            ))}
          </Select>
          <Field label={s.driverName} value={a.driverName} onChange={(e) => setA({ ...a, driverName: e.target.value })} />
          <Field label={s.driverNameDv} dir="rtl" value={a.driverNameDv} onChange={(e) => setA({ ...a, driverNameDv: e.target.value })} />
          <Field label={s.driverPhone} type="tel" inputMode="numeric" dir="ltr" maxLength={7} value={a.driverPhone} onChange={(e) => setA({ ...a, driverPhone: e.target.value })} />
          <Btn
            tone="primary"
            disabled={!a.centerId || !a.driverName.trim() || !/^\d{7}$/.test(a.driverPhone) || act.busy}
            onClick={() => void act.run('POST', `/v1/centers/${a.centerId}/memberships`, { vehicleId: a.vehicleId || firstVehicle, driverName: a.driverName, driverNameDv: a.driverNameDv, driverPhone: a.driverPhone })}
          >
            {s.apply}
          </Btn>
        </div>
      )}
      <ErrorLine code={act.error ?? vehicles.error} />
    </Card>
  )
}

function CenterApply({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const s = useV3Strings()
  const act = useAction(onChanged)
  const [f, setF] = useState({ name: '', type: 'private', island: '', contact: '', licenseNo: '' })
  return (
    <Card title={s.registerCenter}>
      {me.centersApplied.length > 0 && (
        <ul className="space-y-1 text-sm">
          {me.centersApplied.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="flex-1">{c.name}</span>
              <Badge tone={statusTone(c.status)}>{s.status[c.status] ?? c.status}</Badge>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">{s.registerCenter}</summary>
        <div className="mt-2 grid gap-2">
          <Field label={s.centerName} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label={s.centerType} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="private">{s.types.private}</option>
            <option value="government">{s.types.government}</option>
          </Select>
          <Field label={s.island} value={f.island} onChange={(e) => setF({ ...f, island: e.target.value })} />
          <Field label={s.contact} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
          <Field label={s.licenseNo} value={f.licenseNo} onChange={(e) => setF({ ...f, licenseNo: e.target.value })} />
          <Btn tone="primary" disabled={!f.name.trim() || act.busy} onClick={() => void act.run('POST', '/v1/centers', f).then((r) => r && setF({ ...f, name: '' }))}>
            {s.submit}
          </Btn>
        </div>
      </details>
      <ErrorLine code={act.error} />
    </Card>
  )
}
