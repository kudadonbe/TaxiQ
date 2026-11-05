import { useAction, usePoll } from './api'
import { useV3Strings } from './strings'
import { Btn, Card, ErrorLine } from './ui'

interface PendingCenter {
  id: string
  name: string
  type: string
  island: string
  contact: string
  licenseNo: string
  createdAt: string
}

// System admin: approve or reject center registrations.
export function PlatformScreen() {
  const s = useV3Strings()
  const list = usePoll<{ centers: PendingCenter[] }>('/v1/centers/pending', 10000)
  const act = useAction(list.reload)
  const rows = list.data?.centers ?? []
  return (
    <Card title={s.pendingCenters} className="mx-auto max-w-2xl">
      {rows.length === 0 && <p className="text-sm text-slate-500">{s.noPending}</p>}
      {rows.map((c) => (
        <div key={c.id} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
          <p className="font-bold">
            {c.name} <span className="font-normal text-slate-500">· {s.types[c.type] ?? c.type}</span>
          </p>
          <p className="text-slate-600">
            {c.island} {c.contact && `· ${c.contact}`} {c.licenseNo && `· ${s.licenseNo}: ${c.licenseNo}`}
          </p>
          <div className="flex gap-2">
            <Btn tone="primary" disabled={act.busy} onClick={() => void act.run('POST', `/v1/centers/${c.id}/decide`, { decision: 'approved' })}>
              {s.approve}
            </Btn>
            <Btn tone="danger" disabled={act.busy} onClick={() => void act.run('POST', `/v1/centers/${c.id}/decide`, { decision: 'rejected' })}>
              {s.reject}
            </Btn>
          </div>
        </div>
      ))}
      <ErrorLine code={act.error ?? list.error} />
    </Card>
  )
}
