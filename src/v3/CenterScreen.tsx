import { lazy, Suspense, useMemo, useState } from 'react'
import { CallPanel } from '../components/CallPanel'
import { QueueRow } from '../components/QueueRow'
import { useI18n } from '../i18n'
import { OFFER_SECONDS } from '../core/offers'
import type { CallInfo, Taxi } from '../types'
import { useNow } from '../useRides'
import { EMPTY_CALL, hasCallInfo, validateCall } from '../validate'
import { useAction, usePoll, type Me, type QueueView } from './api'
import { apiPositionSource } from './livePositions'
import { useV3Strings } from './strings'
import { Badge, Btn, Card, ErrorLine, Field, Select } from './ui'
import { statusTone } from './tone'

const MapView = lazy(() => import('../components/MapView'))

type Tab = 'queue' | 'map' | 'members' | 'staff' | 'subscriptions' | 'reports'
type StaffRole = Me['staff'][number]['role']

// Center screens. Which tabs show depends on the person's roles in this center; the API checks
// every action again.
export function CenterScreen({ centerId, roles, dev }: { centerId: string; roles: StaffRole[]; dev: boolean }) {
  const s = useV3Strings()
  const has = (...r: StaffRole[]) => dev || r.some((x) => roles.includes(x))
  const tabs: Tab[] = [
    ...(has('owner', 'manager', 'operator') ? (['queue', 'map'] as const) : []),
    ...(has('owner', 'manager') ? (['members'] as const) : []),
    ...(has('owner') ? (['staff'] as const) : []),
    ...(has('owner', 'manager', 'partner') ? (['subscriptions', 'reports'] as const) : []),
  ]
  const [tabState, setTab] = useState<Tab>('queue')
  const tab = tabs.includes(tabState) ? tabState : tabs[0]!

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 text-sm">
        {tabs.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            aria-current={tab === x ? 'page' : undefined}
            className={`min-h-10 rounded-lg px-3 font-semibold ${tab === x ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
          >
            {x === 'map' ? s.mapTab : s.tabs[x]}
          </button>
        ))}
      </nav>
      {tab === 'queue' && <QueueTab centerId={centerId} />}
      {tab === 'map' && <MapTab centerId={centerId} />}
      {tab === 'members' && <MembersTab centerId={centerId} />}
      {tab === 'staff' && <StaffTab centerId={centerId} />}
      {tab === 'subscriptions' && <SubscriptionsTab centerId={centerId} canWrite={has('owner', 'manager')} />}
      {tab === 'reports' && <ReportsTab centerId={centerId} />}
    </div>
  )
}

const asTaxi = (x: QueueView['taxis'][number]): Taxi => ({
  id: x.membershipId,
  taxiNo: x.taxiNo,
  taxiReg: '',
  driver: { id: x.membershipId, name: x.driverName, nameDv: x.driverNameDv, phone: '' },
  suspended: x.suspended ?? undefined,
})

// Live map of this center's online taxis (real GPS), coloured by queue status.
function MapTab({ centerId }: { centerId: string }) {
  const s = useV3Strings()
  const queue = usePoll<QueueView>(`/v1/centers/${centerId}/queue`, 3000)
  const taxis = useMemo(() => (queue.data?.taxis ?? []).map(asTaxi), [queue.data])
  const interested = useMemo(() => new Set(queue.data?.interested ?? []), [queue.data])
  const source = useMemo(() => apiPositionSource(centerId), [centerId])
  return (
    <div className="isolate">
      <Suspense fallback={<p className="text-sm text-slate-500">{s.loading}</p>}>
        <MapView taxis={taxis} interested={interested} pickupAt={undefined} positionSource={source} />
      </Suspense>
    </div>
  )
}

interface DispatchRow {
  id: string
  taxiNo: string
  driverName: string
  driverNameDv: string
  call: (CallInfo & { pickupAt?: [number, number] }) | null
  reopened: boolean
  at: string
}

function QueueTab({ centerId }: { centerId: string }) {
  const s = useV3Strings()
  const { lang } = useI18n()
  const base = `/v1/centers/${centerId}`
  const queue = usePoll<QueueView>(`${base}/queue`, 2000)
  const log = usePoll<{ dispatches: DispatchRow[] }>(`${base}/dispatches`, 4000)
  const act = useAction(() => (queue.reload(), log.reload()))
  const [call, setCall] = useState<CallInfo>(EMPTY_CALL)
  const callValid = Object.keys(validateCall(call)).length === 0
  const q = queue.data
  const interested = new Set(q?.interested ?? [])
  const pick = q?.taxis.find((x) => x.membershipId === q.suggestion)
  const callInProgress = interested.size > 0 || hasCallInfo(call)
  const name = (n: string, dv: string) => (lang === 'dv' && dv ? dv : n)

  const assign = async (mid: string) => {
    if (!callValid) return
    const out = await act.run('POST', `${base}/queue/assign`, { membershipId: mid, ...(hasCallInfo(call) ? { call } : {}) })
    if (out) setCall(EMPTY_CALL)
  }
  const reopen = async (d: DispatchRow) => {
    const out = await act.run<{ call: CallInfo | null }>('POST', `${base}/dispatches/${d.id}/reopen`)
    if (out?.call) setCall({ ...EMPTY_CALL, ...out.call })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {pick ? (
              <>
                <span className="font-bold">{s.answered(interested.size)}</span>
                <span className="block truncate">
                  {s.highest} <span className="font-bold tabular-nums">{pick.taxiNo}</span> · {name(pick.driverName, pick.driverNameDv)}
                </span>
              </>
            ) : (
              s.hint
            )}
          </p>
          {callInProgress && (
            <Btn onClick={() => void act.run('POST', `${base}/queue/clear`).then(() => setCall(EMPTY_CALL))}>{s.clearCall}</Btn>
          )}
        </div>
        <CallPanel call={call} onChange={setCall} />
        <ErrorLine code={act.error ?? queue.error} />
        {!q ? (
          <p className="text-sm text-slate-500">{s.loading}</p>
        ) : (
          <ol className="space-y-2 pl-20">
            {q.taxis.map((x) => (
              <QueueRow
                key={x.membershipId}
                taxi={asTaxi(x)}
                position={x.position}
                interested={interested.has(x.membershipId)}
                picked={q.suggestion === x.membershipId}
                onToggle={() => void act.run('POST', `${base}/queue/toggle`, { membershipId: x.membershipId })}
                onAssign={() => void assign(x.membershipId)}
              />
            ))}
          </ol>
        )}
      </section>
      <aside className="space-y-4">
        <RequestsPanel centerId={centerId} />
        <Card title={s.recent}>
          <ul className="divide-y divide-slate-100 text-sm">
            {(log.data?.dispatches ?? []).map((d, i) => (
              <li key={d.id} className={`space-y-1 py-2 ${d.reopened ? 'opacity-60' : ''}`}>
                <p className="flex justify-between gap-2">
                  <span>
                    <span className="font-bold tabular-nums">{d.taxiNo}</span> <span className="text-slate-500">{name(d.driverName, d.driverNameDv)}</span>
                  </span>
                  <time dir="ltr" className="text-slate-400">
                    {new Date(d.at).toLocaleTimeString(lang === 'dv' ? 'dv-MV' : undefined, { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </p>
                {d.call?.pickup && (
                  <p>
                    📍 <bdi>{d.call.pickup}</bdi>
                  </p>
                )}
                <div className="flex gap-2">
                  {d.reopened ? (
                    <Badge>{s.reopened}</Badge>
                  ) : (
                    <>
                      {i === 0 && (
                        <Btn disabled={callInProgress || act.busy} onClick={() => void act.run<{ taxis: unknown }>('POST', `${base}/dispatches/${d.id}/undo`).then((r) => r && d.call && setCall({ ...EMPTY_CALL, ...d.call }))}>
                          {s.undo}
                        </Btn>
                      )}
                      <Btn disabled={callInProgress || act.busy} onClick={() => void reopen(d)}>
                        {s.reopen}
                      </Btn>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  )
}

interface OpenRequest {
  id: string
  pickup: string
  destination: string
  phone: string
  status: 'offering' | 'expired'
  offerTaxiNo: string | null
  offerAt: string
}

function RequestsPanel({ centerId }: { centerId: string }) {
  const s = useV3Strings()
  const list = usePoll<{ requests: OpenRequest[] }>(`/v1/centers/${centerId}/requests`, 3000)
  const act = useAction(list.reload)
  const rows = list.data?.requests ?? []
  const now = useNow(rows.some((r) => r.status === 'offering'))
  return (
    <Card title={s.requests}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{s.noRequests}</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="space-y-1 py-2">
              <p className="font-semibold">
                📍 <bdi>{r.pickup}</bdi>
              </p>
              <p className="flex flex-wrap items-center gap-2 text-xs">
                <bdi dir="ltr">☎ {r.phone}</bdi>
                {r.status === 'offering' ? (
                  <Badge tone="amber">
                    {s.offeredTo(r.offerTaxiNo ?? '?')} · <span dir="ltr">{s.secondsLeft(Math.max(0, Math.ceil((new Date(r.offerAt).getTime() + OFFER_SECONDS * 1000 - now) / 1000)))}</span>
                  </Badge>
                ) : (
                  <Badge tone="red">{s.expired}</Badge>
                )}
                <Btn className="ms-auto" onClick={() => void act.run('POST', `/v1/requests/${r.id}/cancel`)}>
                  {s.cancel}
                </Btn>
              </p>
            </li>
          ))}
        </ul>
      )}
      <ErrorLine code={act.error} />
    </Card>
  )
}

interface MemberRow {
  id: string
  status: string
  taxiNo: string | null
  driverName: string
  driverNameDv: string
  driverPhone: string
  plate: string
  permitExpiry: string | null
  insuranceExpiry: string | null
  suspended: { reason: string; note: string } | null
}

function MembersTab({ centerId }: { centerId: string }) {
  const s = useV3Strings()
  const base = `/v1/centers/${centerId}/memberships`
  const list = usePoll<{ memberships: MemberRow[] }>(base, 5000)
  const act = useAction(list.reload)
  const [numbers, setNumbers] = useState<Record<string, string>>({})
  const [susp, setSusp] = useState<{ id: string; reason: string; note: string } | null>(null)
  const rows = list.data?.memberships ?? []
  const applied = rows.filter((m) => m.status === 'applied')
  const members = rows.filter((m) => m.status === 'approved')

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={s.applicants}>
        {applied.length === 0 && <p className="text-sm text-slate-500">{s.noPending}</p>}
        {applied.map((m) => (
          <div key={m.id} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold">
              {m.driverName} <span className="font-mono text-slate-500">{m.plate}</span>
            </p>
            <p className="text-xs text-slate-500" dir="ltr">
              ☎ {m.driverPhone} · {m.permitExpiry ?? '—'} · {m.insuranceExpiry ?? '—'}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-28">
                <Field label={s.centerNo} inputMode="numeric" dir="ltr" maxLength={4} value={numbers[m.id] ?? ''} onChange={(e) => setNumbers({ ...numbers, [m.id]: e.target.value })} />
              </div>
              <Btn tone="primary" disabled={!/^[1-9]\d{0,3}$/.test(numbers[m.id] ?? '') || act.busy} onClick={() => void act.run('POST', `${base}/${m.id}/decide`, { decision: 'approved', taxiNo: numbers[m.id] })}>
                {s.approve}
              </Btn>
              <Btn tone="danger" disabled={act.busy} onClick={() => void act.run('POST', `${base}/${m.id}/decide`, { decision: 'rejected' })}>
                {s.reject}
              </Btn>
            </div>
          </div>
        ))}
      </Card>
      <Card title={s.members}>
        <ul className="divide-y divide-slate-100 text-sm">
          {members.map((m) => (
            <li key={m.id} className={`space-y-2 py-2 ${m.suspended ? 'text-rose-700' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-10 font-black tabular-nums">{m.taxiNo}</span>
                <span className="min-w-0 flex-1 truncate">{m.driverName}</span>
                {m.suspended ? (
                  <>
                    <Badge tone="red">{s.reasons[m.suspended.reason]}</Badge>
                    <Btn onClick={() => void act.run('POST', `${base}/${m.id}/lift`)}>{s.lift}</Btn>
                  </>
                ) : (
                  <Btn tone="danger" onClick={() => setSusp({ id: m.id, reason: 'fees', note: '' })}>
                    {s.suspend}
                  </Btn>
                )}
              </div>
              {susp?.id === m.id && (
                <div className="grid gap-2 rounded-lg border border-rose-200 p-2 sm:grid-cols-[9rem_1fr_auto]">
                  <Select label="" value={susp.reason} onChange={(e) => setSusp({ ...susp, reason: e.target.value })}>
                    {Object.entries(s.reasons).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <Field label="" placeholder={s.note} maxLength={120} value={susp.note} onChange={(e) => setSusp({ ...susp, note: e.target.value })} />
                  <Btn tone="danger" className="self-end" onClick={() => void act.run('POST', `${base}/${m.id}/suspend`, { reason: susp.reason, note: susp.note }).then(() => setSusp(null))}>
                    {s.suspend}
                  </Btn>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <ErrorLine code={act.error ?? list.error} />
    </div>
  )
}

function StaffTab({ centerId }: { centerId: string }) {
  const s = useV3Strings()
  const base = `/v1/centers/${centerId}/staff`
  const list = usePoll<{ staff: { userId: string; email: string; name: string; role: StaffRole }[] }>(base, 0)
  const act = useAction(list.reload)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('operator')
  return (
    <Card title={s.tabs.staff}>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label={s.staffEmail} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select label="" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {Object.entries(s.roles).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Btn tone="primary" disabled={!email.includes('@') || act.busy} onClick={() => void act.run('POST', base, { email: email.trim(), role }).then((r) => r && setEmail(''))}>
          {s.add}
        </Btn>
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {(list.data?.staff ?? []).map((x) => (
          <li key={`${x.userId}-${x.role}`} className="flex items-center gap-2 py-2">
            <bdi dir="ltr" className="min-w-0 flex-1 truncate">
              {x.email}
            </bdi>
            <Badge>{s.roles[x.role]}</Badge>
            <Btn tone="danger" onClick={() => void act.run('DELETE', `${base}/${x.userId}/${x.role}`)}>
              {s.remove}
            </Btn>
          </li>
        ))}
      </ul>
      <ErrorLine code={act.error ?? list.error} />
    </Card>
  )
}

function SubscriptionsTab({ centerId, canWrite }: { centerId: string; canWrite: boolean }) {
  const s = useV3Strings()
  const base = `/v1/centers/${centerId}/subscriptions`
  const list = usePoll<{ subscriptions: { id: string; taxiNo: string; driverName: string; periodStart: string; periodEnd: string; amountMvr: number; status: string }[] }>(base, 0)
  const members = usePoll<{ memberships: MemberRow[] }>(canWrite ? `/v1/centers/${centerId}/memberships` : null, 0)
  const act = useAction(list.reload)
  const [f, setF] = useState({ membershipId: '', periodStart: '', periodEnd: '', amountMvr: '', status: 'paid' })
  return (
    <Card title={s.tabs.subscriptions}>
      {canWrite && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Select label={s.members} value={f.membershipId} onChange={(e) => setF({ ...f, membershipId: e.target.value })}>
            <option value="" />
            {(members.data?.memberships ?? [])
              .filter((m) => m.status === 'approved')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.taxiNo} · {m.driverName}
                </option>
              ))}
          </Select>
          <Field label={s.periodStart} type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} />
          <Field label={s.periodEnd} type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
          <Field label={s.amount} type="number" min={0} value={f.amountMvr} onChange={(e) => setF({ ...f, amountMvr: e.target.value })} />
          <Select label="" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {Object.entries(s.subStatus).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Btn
            tone="primary"
            className="self-end"
            disabled={!f.membershipId || !f.periodStart || !f.periodEnd || f.amountMvr === '' || act.busy}
            onClick={() => void act.run('POST', base, { ...f, amountMvr: Number(f.amountMvr) })}
          >
            {s.record}
          </Btn>
        </div>
      )}
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {(list.data?.subscriptions ?? []).map((x) => (
            <tr key={x.id}>
              <td className="py-1.5 font-bold tabular-nums">{x.taxiNo}</td>
              <td className="py-1.5">{x.driverName}</td>
              <td className="py-1.5 tabular-nums" dir="ltr">
                {x.periodStart} – {x.periodEnd}
              </td>
              <td className="py-1.5 tabular-nums">{x.amountMvr}</td>
              <td className="py-1.5">
                <Badge tone={statusTone(x.status)}>{s.subStatus[x.status]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorLine code={act.error ?? list.error} />
    </Card>
  )
}

function ReportsTab({ centerId }: { centerId: string }) {
  const s = useV3Strings()
  const trips = usePoll<{ days: { day: string; trips: number }[] }>(`/v1/centers/${centerId}/reports/trips`, 0)
  const audit = usePoll<{ entries: { id: number; at: string; actor: string; action: string }[] }>(`/v1/centers/${centerId}/audit`, 0)
  const max = Math.max(1, ...(trips.data?.days ?? []).map((d) => d.trips))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={s.tripsPerDay}>
        <ul className="space-y-1 text-sm">
          {(trips.data?.days ?? []).map((d) => (
            <li key={d.day} className="flex items-center gap-2" dir="ltr">
              <span className="w-24 tabular-nums text-slate-500">{d.day}</span>
              <span className="h-3 rounded bg-emerald-500" style={{ width: `${(d.trips / max) * 70}%` }} />
              <span className="tabular-nums">{d.trips}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={s.auditTitle}>
        <ul className="max-h-96 divide-y divide-slate-100 overflow-auto text-xs" dir="ltr">
          {(audit.data?.entries ?? []).map((e) => (
            <li key={e.id} className="flex gap-2 py-1">
              <span className="text-slate-400 tabular-nums">{new Date(e.at).toLocaleString()}</span>
              <span className="font-semibold">{e.action}</span>
            </li>
          ))}
        </ul>
      </Card>
      <ErrorLine code={trips.error ?? audit.error} />
    </div>
  )
}
