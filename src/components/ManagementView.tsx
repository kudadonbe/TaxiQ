import { AudioLines, Building2, Car, CarTaxiFront, LifeBuoy, Trash2, Users } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { cleanupDueToday, deleteExpired } from '../activity'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'

type Section = 'users' | 'taxis' | 'vehicles' | 'services' | 'voice' | 'centers'
const KEY = 'taxiq.management'

// Management (admins): its own sections, starting with user management (everyone who has signed in,
// their roles, who's online) and taxi registration. The choice is kept for the session.
export function ManagementView({ users, taxis, vehicles, services, voice, centers }: { users: ReactNode; taxis: ReactNode; vehicles?: ReactNode; services?: ReactNode; voice?: ReactNode; centers?: ReactNode }) {
  const { t } = useI18n()
  const [section, setSectionState] = useState<Section>(() => {
    try {
      const v = sessionStorage.getItem(KEY)
      return v === 'taxis' || v === 'vehicles' || v === 'services' || v === 'voice' || v === 'centers' ? v : 'users'
    } catch {
      return 'users'
    }
  })
  const setSection = (s: Section) => {
    setSectionState(s)
    try {
      sessionStorage.setItem(KEY, s)
    } catch {
      // Storage unavailable: the choice lasts until reload.
    }
  }
  const tabs: { id: Section; label: string; Icon: typeof Users }[] = [
    { id: 'users', label: t.mgmtUsers, Icon: Users },
    { id: 'taxis', label: t.mgmtTaxis, Icon: CarTaxiFront },
    ...(vehicles ? [{ id: 'vehicles' as const, label: t.mgmtVehicles, Icon: Car }] : []),
    ...(services ? [{ id: 'services' as const, label: t.mgmtServices, Icon: LifeBuoy }] : []),
    ...(voice ? [{ id: 'voice' as const, label: t.mgmtVoice, Icon: AudioLines }] : []),
    ...(centers ? [{ id: 'centers' as const, label: t.mgmtCenters, Icon: Building2 }] : []),
  ]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl font-black">{t.admin}</h2>
      </div>
      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/70 p-1" aria-label={t.admin}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            aria-current={section === id ? 'page' : undefined}
            className={`flex min-h-10 shrink-0 grow items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold sm:grow-0 ${section === id ? 'bg-white shadow' : 'text-slate-600 hover:bg-white/60'}`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      {section === 'users' && <OldLogCleanup />}
      {section === 'users' ? users : section === 'vehicles' && vehicles ? vehicles : section === 'services' && services ? services : section === 'voice' && voice ? voice : section === 'centers' && centers ? centers : taxis}
    </div>
  )
}

// Expired records (activity-log entries past 90 days, location records left behind): a platform
// admin's app deletes them once a day per device when Management opens, or now with the button.
// Free-plan stand-in for a TTL policy (needs Blaze).
function OldLogCleanup() {
  const { fb, isPlatform } = useAuth()
  const { t } = useI18n()
  const [state, setState] = useState<{ busy: boolean; done: number | null; failed: boolean }>({ busy: false, done: null, failed: false })
  const run = (shown: boolean) => {
    if (!fb) return
    if (shown) setState({ busy: true, done: null, failed: false })
    deleteExpired(fb)
      .then((n) => shown && setState({ busy: false, done: n, failed: false }))
      .catch(() => shown && setState({ busy: false, done: null, failed: true }))
  }
  useEffect(() => {
    if (fb && isPlatform && cleanupDueToday()) run(false)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [fb, isPlatform])
  if (!fb || !isPlatform) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        disabled={state.busy}
        onClick={() => run(true)}
        className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 font-medium hover:bg-slate-50 disabled:opacity-40"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {t.logCleanup}
      </button>
      <span role="status" className={state.failed ? 'font-semibold text-rose-700' : 'text-slate-600'}>
        {state.busy ? t.logCleaning : state.failed ? t.logCleanFailed : state.done !== null ? t.logCleaned(state.done) : ''}
      </span>
    </div>
  )
}
