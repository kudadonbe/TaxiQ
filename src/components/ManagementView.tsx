import { CarTaxiFront, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'

type Section = 'users' | 'taxis'
const KEY = 'taxiq.management'

// Management (admins): its own sections, starting with user management (everyone who has signed in,
// their roles, who's online) and taxi registration. The choice is kept for the session.
export function ManagementView({ users, taxis }: { users: ReactNode; taxis: ReactNode }) {
  const { t } = useI18n()
  const [section, setSectionState] = useState<Section>(() => {
    try {
      return sessionStorage.getItem(KEY) === 'taxis' ? 'taxis' : 'users'
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
  ]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl font-black">{t.admin}</h2>
      </div>
      <nav className="flex gap-1 rounded-xl bg-slate-200/70 p-1" aria-label={t.admin}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            aria-current={section === id ? 'page' : undefined}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold sm:flex-none ${section === id ? 'bg-white shadow' : 'text-slate-600 hover:bg-white/60'}`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      {section === 'users' ? users : taxis}
    </div>
  )
}
